"""Pure synthetic Lua leaf. No game client, installation, protected action or provider transport."""
import os
from pathlib import Path
import threading

timer = threading.Timer(115, lambda: os._exit(124))
timer.daemon = True
timer.start()
from lupa.luajit21 import LuaRuntime

folder = Path(__file__).resolve().parents[1]
root = folder.parents[1]
source = (folder / "SiteAggregate.lua").read_text(encoding="utf-8")
checks = 0

def case(name, script):
    global checks
    runtime = LuaRuntime(unpack_returned_tuples=True)
    runtime.execute('''
      NOW = 1792756800
      function time() return NOW end
      function IsInGuild() return true end
      function GetGuildInfo() return "Olympus I" end
      SlashCmdList = {}
      function forbidden() error("protected/background action forbidden in synthetic test") end
      SendChatMessage=forbidden; GuildInvite=forbidden; InviteUnit=forbidden;
      GuildRoster=forbidden; CreateFrame=forbidden
      C_Timer={After=forbidden, NewTicker=forbidden}
      OlympusDB=setmetatable({}, {__index=forbidden})
      C = {schema="olympus-census-checkpoint",version=1,capturedAt=NOW,
        scope={realmGroup="Forever PvE",faction="Alliance"},
        guilds={{name="Olympus I",members=100,online=20,observedAt=NOW,fresh=true,counted=true,
          provenance={source="roster",disputed=false},privateKey="MUST NOT BE COPIED",player="MUST NOT BE COPIED"}},
        seenOnly={{name="Other Guild",online=100}}, summary={linkedAlts=10}, chat="MUST NOT BE COPIED"}
      OlympusBridge={CENSUS_CHECKPOINT_API_VERSION=1,GetCensusCheckpoint=function() return C end}
    ''')
    runtime.execute(source)
    runtime.execute(script)
    checks += 1
    print("PASS " + name)

case("exports fresh own-roster aggregate using actual local producer", '''
  local ok = OlympusSiteAggregateCompatibility196.Prepare(); assert(ok)
  local v=OlympusSiteAggregate
  assert(v.producer=="1.3.2-site.1" and v.guild.characters==100 and v.guild.online==20)
  assert(v.capturedAt==NOW and v.guild.observedAt==NOW)
  local allowed={schema=true,version=true,producer=true,capturedAt=true,realmGroup=true,faction=true,guild=true}
  local count=0; for k in pairs(v) do assert(allowed[k]);count=count+1 end;assert(count==7)
  local row={name=true,observedAt=true,characters=true,online=true}
  count=0;for k in pairs(v.guild)do assert(row[k]);count=count+1 end;assert(count==4)
''')
case("canonicalizes uppercase own guild and checkpoint without changing source timestamps", '''
  function GetGuildInfo() return "OLYMPUS" end
  C.guilds[1].name="olympus"
  assert(OlympusSiteAggregateCompatibility196.Prepare())
  assert(OlympusSiteAggregate.guild.name=="Olympus" and OlympusSiteAggregate.capturedAt==NOW and OlympusSiteAggregate.guild.observedAt==NOW)
''')
case("case variants cannot disguise duplicate own checkpoints", '''
  C.guilds[2]={name="OLYMPUS I"}
  assert(not OlympusSiteAggregateCompatibility196.Prepare() and OlympusSiteAggregate==nil)
''')
for name, edit in [
    ("relay", 'C.guilds[1].provenance.source="relay"'),
    ("dispute", 'C.guilds[1].provenance.disputed=true'),
    ("not fresh", 'C.guilds[1].fresh=false'),
    ("not counted", 'C.guilds[1].counted=false'),
    ("future guild time", 'C.guilds[1].observedAt=NOW+1'),
    ("old source time", 'C.guilds[1].observedAt=NOW-86401'),
    ("future capture", 'C.capturedAt=NOW+1'),
    ("capture older than 60 seconds", 'C.capturedAt=NOW-61;C.guilds[1].observedAt=NOW-61'),
    ("out of scope faction", 'C.scope.faction="Horde"'),
    ("unavailable own guild", 'function GetGuildInfo() return "Olympus Alt" end'),
    ("no native membership", 'function IsInGuild() return false end'),
    ("duplicate own guild", 'C.guilds[2]=C.guilds[1]'),
    ("unknown bridge", 'OlympusBridge.CENSUS_CHECKPOINT_API_VERSION=2'),
    ("count over cap", 'C.guilds[1].members=1001'),
    ("fractional count", 'C.guilds[1].members=99.5'),
    ("online over total", 'C.guilds[1].online=101'),
    ("throwing source", 'OlympusBridge.GetCensusCheckpoint=function()error("source unavailable")end'),
    ("seen-only source", 'C.guilds={}'),
]:
    case("refuses " + name + " and clears previous export", 'OlympusSiteAggregate={old=true};' + edit + ';assert(not OlympusSiteAggregateCompatibility196.Prepare());assert(OlympusSiteAggregate==nil)')
case("masks small guild before persistence", '''C.guilds[1].members=4;C.guilds[1].online=3;assert(OlympusSiteAggregateCompatibility196.Prepare());assert(OlympusSiteAggregate.guild.characters=="few" and OlympusSiteAggregate.guild.online=="unavailable")''')
case("masks small online before persistence", '''C.guilds[1].online=3;assert(OlympusSiteAggregateCompatibility196.Prepare());assert(OlympusSiteAggregate.guild.online=="few")''')
case("withholds small nonzero offline remainder", '''C.guilds[1].online=98;assert(OlympusSiteAggregateCompatibility196.Prepare());assert(OlympusSiteAggregate.guild.online=="unavailable")''')
case("withholds stale online at 901 seconds without changing source time", '''C.guilds[1].observedAt=NOW-901;assert(OlympusSiteAggregateCompatibility196.Prepare());assert(OlympusSiteAggregate.guild.online=="unavailable" and OlympusSiteAggregate.guild.observedAt==NOW-901)''')
case("keeps exactly 900 seconds old online", '''C.guilds[1].observedAt=NOW-900;assert(OlympusSiteAggregateCompatibility196.Prepare());assert(OlympusSiteAggregate.guild.online==20)''')
case("module does not export automatically and clear is deliberate", '''assert(OlympusSiteAggregate==nil);SlashCmdList.OLYMPUSSITEAGGREGATE("export");assert(OlympusSiteAggregate);SlashCmdList.OLYMPUSSITEAGGREGATE("clear");assert(OlympusSiteAggregate==nil)''')

# Execute the real existing slash handler, without loading private Config.lua or game boot code.
addon = (root / "addon/OlympusVerify/OlympusVerify.lua").read_text(encoding="utf-8")
handler = addon[addon.index('SlashCmdList.OLYMPUSVERIFY = function(msg)'):]
runtime = LuaRuntime(unpack_returned_tuples=True)
runtime.execute('SlashCmdList={};OlympusVerifyDB={};calls=0;function OlympusVerify_Flush()calls=calls+1 end')
runtime.execute(handler)
runtime.execute('SlashCmdList.OLYMPUSVERIFY("invite");assert(calls==1);SlashCmdList.OLYMPUSVERIFY("INVITE anything");assert(calls==2);SlashCmdList.OLYMPUSVERIFY("flush");assert(calls==3)')
checks += 1
print("PASS actual slash invite alias calls existing Flush once per command; no alternate invite path")
preview = (root / "addon/OlympusVerify/OlympusVerifyPreview.lua").read_text(encoding="utf-8")
wrapper = preview[preview.index('local ALLOWED = '):preview.index('-- For the panel and the tests.')]
runtime.execute('local_saved=true; messages=0;function Cmd(s)return s end;function Say(s)messages=messages+1 end')
runtime.execute('local saved=local_saved;local originalSlash=SlashCmdList.OLYMPUSVERIFY;' + wrapper)
runtime.execute('SlashCmdList.OLYMPUSVERIFY("invite");assert(calls==3 and messages==1)')
checks += 1
print("PASS actual preview wrapper blocks invite alias without reaching existing Flush")
timer.cancel()
print(f"RESULT {checks} passed; no game/provider/SQLite/Workerd calls")
