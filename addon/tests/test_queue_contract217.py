"""Synthetic actual watcher renderer -> actual addon eligibility; no client/state/config/network."""
from __future__ import annotations
import os
from pathlib import Path
import sys
from unittest.mock import patch
import lupa.luajit21 as runtime

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "watcher"))
import watcher

NOW = 1_793_400_000
members = [
    {"name": "Eligible", "eligibleAt": NOW - 1, "firstSeen": NOW - 864000},
    {"name": "Future", "eligibleAt": NOW + 1, "firstSeen": NOW},
    {"name": "Unknown", "eligibleAt": None, "firstSeen": None},
    {"name": "Pending", "eligibleAt": NOW - 1, "firstSeen": NOW - 864000, "pending": True},
]
os.chdir(ROOT / "addon/tests")
checks = 0
for available in (True, False):
    current_members = [{**m, "rank": "Initiate", "rankIndex": 9, "level": 1,
                        **({} if available else {"eligibleAt": None, "firstSeen": None})} for m in members]
    report = {"snapshotAt": NOW, "graceDays": 3, "verifyOpenSince": NOW - 864000,
              "firstSeenAvailable": available, "members": current_members, "ranks": [], "openTickets": 0}
    with patch.object(watcher.time, "time", return_value=NOW):
        rendered = watcher.Watcher.render_queue([], False, report)
    lua = runtime.LuaRuntime(unpack_returned_tuples=True)
    lua.execute(Path("wow_mock.lua").read_text(encoding="utf-8"))
    lua.execute(rendered)
    lua.execute(f"""
NOW={NOW}
ROSTER={{{{name='Fern Melder',rank='Officer',rankIndex=2,online=true}},
 {{name='Eligible',rank='Initiate',rankIndex=9,level=1,away=20}},
 {{name='Future',rank='Initiate',rankIndex=9,level=1,away=20}},
 {{name='Unknown',rank='Initiate',rankIndex=9,level=1,away=20}},
 {{name='Pending',rank='Initiate',rankIndex=9,level=1,away=20}}}}
OlympusVerifyConfig={{secret='synthetic-only-not-config'}}
assert(loadfile('../OlympusVerify/Libs/OlympusHmac.lua'))('OlympusVerify',{{}})
assert(loadfile('../OlympusVerify/OlympusVerify.lua'))('OlympusVerify',{{}})
local event=OlympusVerifyFrame:GetScript('OnEvent')
event(OlympusVerifyFrame,'ADDON_LOADED','OlympusVerify');event(OlympusVerifyFrame,'PLAYER_LOGIN')
C_GuildInfo.Invite=function() error('protected invite forbidden') end
C_GuildInfo.Uninvite=function() error('protected removal forbidden') end
local candidates,info=OlympusVerifyAPI.UnverifiedList(10)
assert(#candidates=={1 if available else 0})
assert({"candidates[1].name=='Eligible' and candidates[1].reason=='unverified' and info.held['grace period']==1 and info.held['join date unknown']==1" if available else "info.held['join date unknown']==3"} and info.held['verifying now']==1)
assert(info.noFirstSeen=={str(not available).lower()})
""")
    checks += 3
    print(f"PASS rendered actual queue eligibility and unavailable-date marker: {available}")
print(f"{checks}/{checks} watcher/addon queue contract checks passed (synthetic only)")
