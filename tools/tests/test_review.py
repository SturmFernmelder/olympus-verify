"""Checks guild-map.py's permission review on a small made-up server. Run: python3 tools/tests/test_review.py

Covers the read-only drift rule (a read-only channel may differ from its category only by what makes it read-only)
and the check that MEE6 can still post where it is meant to now that it has no Administrator."""
import copy
import importlib.util
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("gm", HERE.parent / "guild-map.py")
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)

EV, OFFICER, MEE6, TANK = "1", "10", "20", "30"


def ow(rid, allow=(), deny=()):
    return {"kind": "role", "id": rid, "name": rid, "allow": list(allow), "deny": list(deny),
            "allowRaw": ",".join(sorted(allow)), "denyRaw": ",".join(sorted(deny))}


def chan(name, overwrites, typ="text"):
    return {"id": name, "name": name, "type": typ, "overwrites": overwrites}


def base_map():
    cat_ows = [ow(EV, deny=["MANAGE_ROLES"]), ow(MEE6, allow=["VIEW_CHANNEL"])]
    ro_ows = [ow(EV, deny=["MANAGE_ROLES", "SEND_MESSAGES", "CONNECT", "CREATE_PUBLIC_THREADS"]),
              ow(MEE6, allow=["VIEW_CHANNEL"])]
    staff_ows = [ow(EV, deny=["VIEW_CHANNEL"]), ow(OFFICER, allow=["VIEW_CHANNEL"])]
    return {
        "guild": {"id": EV},
        "roles": [
            {"id": EV, "name": "@everyone", "isAdministrator": False, "position": 0,
             "permissions": ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY", "CONNECT", "SPEAK"]},
            {"id": OFFICER, "name": "Officer", "isAdministrator": False, "position": 3, "permissions": ["KICK_MEMBERS"]},
            {"id": MEE6, "name": "MEE6", "isAdministrator": False, "managed": True, "position": 2,
             "permissions": ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"]},
            {"id": TANK, "name": "Tank", "isAdministrator": False, "position": 1, "permissions": []},
        ],
        "categories": [
            {"id": "c1", "name": "GUILD HALL", "type": "category", "overwrites": cat_ows, "children": [
                chan("stream-alerts", copy.deepcopy(ro_ows)),
                chan("bot-commands", copy.deepcopy(cat_ows)),
            ]},
            {"id": "c2", "name": "OFFICER COUNCIL", "type": "category", "overwrites": staff_ows, "children": [
                chan("server-log", copy.deepcopy(staff_ows)),
            ]},
        ],
        "uncategorised": [],
        "configWiring": [],
        "bot": {"roles": [], "userId": None},
    }


def find(m, name):
    for cat, ch in gm.all_channels(m):
        if ch["name"] == name:
            return cat, ch
    raise KeyError(name)


def run(m):
    return gm.review(m, ["GUILD HALL"], ["OFFICER COUNCIL"], []) + gm.review_bot_access(m, [])


def lines(findings, sev, needle):
    return [msg for s, msg in findings if s == sev and needle in msg]


passed = 0


def check(cond, what):
    global passed
    assert cond, what
    passed += 1


# 1. As found on 25 Sep: drift is only the read-only setup -> INFO, not NOTE; MEE6 cannot post in either channel.
m = base_map()
f = run(m)
check(not lines(f, "NOTE", "#stream-alerts"), "read-only drift alone must not raise a NOTE")
check(lines(f, "INFO", "#stream-alerts is read-only") and "only by that read-only setup" in lines(f, "INFO", "#stream-alerts")[0],
      "read-only line should carry the folded sync remark")
check("only the server owner" in lines(f, "INFO", "#stream-alerts")[0], "nobody but the owner can post yet")
check(lines(f, "PROBLEM", "MEE6 cannot SEND_MESSAGES in #stream-alerts"), "MEE6 send gap in #stream-alerts")
check(lines(f, "PROBLEM", "MEE6 cannot VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS in #server-log"), "MEE6 blind in #server-log")
check(not lines(f, "PROBLEM", "#bot-commands"), "MEE6 can post in #bot-commands")

# 2. The fix: MEE6 may post in #stream-alerts and sees #server-log. Drift is still only read-only setup (bot poster).
m = base_map()
find(m, "stream-alerts")[1]["overwrites"][1] = ow(MEE6, allow=["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"])
find(m, "server-log")[1]["overwrites"].append(ow(MEE6, allow=["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"]))
f = run(m)
check(not lines(f, "PROBLEM", "MEE6"), "no MEE6 problems after the fix")
check("can post: MEE6" in lines(f, "INFO", "#stream-alerts is read-only")[0], "MEE6 listed as a poster")
check(not lines(f, "NOTE", "#stream-alerts"), "a bot's posting allow is part of the read-only setup")
check(not lines(f, "CRITICAL", "#server-log"), "a bot seeing a staff channel is not an exposure")

# 3. Real drift still warns: an ordinary role gets a Send allow in the read-only channel.
m = base_map()
find(m, "stream-alerts")[1]["overwrites"].append(ow(TANK, allow=["SEND_MESSAGES"]))
check(lines(run(m), "NOTE", "#stream-alerts is out of sync"), "non-staff overwrite is real drift")

# 4. ...or @everyone gains something the category does not give.
m = base_map()
find(m, "stream-alerts")[1]["overwrites"][0]["allow"].append("ATTACH_FILES")
check(lines(run(m), "NOTE", "#stream-alerts is out of sync"), "@everyone gaining an allow is real drift")

# 5. ...or the channel drops an overwrite the category has.
m = base_map()
del find(m, "stream-alerts")[1]["overwrites"][1]
check(lines(run(m), "NOTE", "#stream-alerts is out of sync"), "dropping a category overwrite is real drift")

# 6. ...or a staff role is denied something in the channel.
m = base_map()
find(m, "stream-alerts")[1]["overwrites"].append(ow(OFFICER, deny=["VIEW_CHANNEL"]))
check(lines(run(m), "NOTE", "#stream-alerts is out of sync"), "a staff deny is real drift")

# 7. Someone pressed "Sync Now": postable again -> PROBLEM, and no drift remark at all (it is synced).
m = base_map()
find(m, "stream-alerts")[1]["overwrites"] = copy.deepcopy(m["categories"][0]["overwrites"])
f = run(m)
check(lines(f, "PROBLEM", "#stream-alerts is meant to be read-only but @everyone can post"), "synced read-only channel")
check(not lines(f, "NOTE", "#stream-alerts"), "a synced channel has no drift to report")

# 8. Unknown permission bits: the tool cannot vouch for the drift, so it keeps the NOTE.
m = base_map()
m["unknownPermissionBits"] = ["BIT_60"]
check(lines(run(m), "NOTE", "#stream-alerts is out of sync"), "unknown bits keep the NOTE")

# 9. The map's "synced" marker is computed from the overwrites, not from the Worker's field.
m = base_map()
m.update({"build": "t", "fetchedAt": "t", "counts": {}})
for cat, ch in gm.all_channels(m):
    ch.update({"syncedWithCategory": False, "nsfw": False, "slowmodeSeconds": 0, "topic": None})
check(gm.sync_state(find(m, "bot-commands")[1], m["categories"][0]), "bot-commands is a copy of its category")
check(not gm.sync_state(find(m, "stream-alerts")[1], m["categories"][0]), "stream-alerts is not")

# 10. A bot without Administrator is checked against the server-wide needs of its jobs.
m = base_map()
f = gm.review_roles(m)
check(lines(f, "PROBLEM", "'MEE6' lacks BAN_MEMBERS"), "MEE6 without Ban is reported")
check("MANAGE_CHANNELS (the Contact staff ticket button" in lines(f, "PROBLEM", "'MEE6' lacks")[0], "ticket need listed")
for r in m["roles"]:
    if r["name"] == "MEE6":
        r["permissions"] += ["BAN_MEMBERS", "KICK_MEMBERS", "MODERATE_MEMBERS", "MANAGE_CHANNELS", "MANAGE_ROLES"]
check(not lines(gm.review_roles(m), "PROBLEM", "'MEE6' lacks"), "a fully equipped MEE6 is quiet")

# 11. A bot with Administrator: CRITICAL unless the owner's decision is recorded, then INFO with the reason.
saved = dict(gm.ADMIN_BY_DECISION)
gm.ADMIN_BY_DECISION.clear()
try:
    m = base_map()
    for r in m["roles"]:
        if r["name"] == "MEE6":
            r.update({"isAdministrator": True, "managed": True})
    f = gm.review_roles(m)
    check(lines(f, "CRITICAL", "'MEE6' is a bot and holds ADMINISTRATOR") and not lines(f, "PROBLEM", "'MEE6' lacks"),
          "admin bot: CRITICAL, and no needs check (Administrator covers them)")
    gm.ADMIN_BY_DECISION["MEE6"] = "test reason"
    f = gm.review_roles(m)
    check(not lines(f, "CRITICAL", "MEE6") and lines(f, "INFO", "by owner decision: test reason"), "recorded decision")
finally:
    gm.ADMIN_BY_DECISION.clear()
    gm.ADMIN_BY_DECISION.update(saved)
check("MEE6" in gm.ADMIN_BY_DECISION, "MEE6's Administrator is recorded as Viktor's decision")

# ---- 25 Sep 2026: visitors see START HERE and VISITORS; the Guild Member role opens the guild categories ----
GM = "40"


def gated_map(gate=True):
    """A server laid out the new way: VISITORS with a read-only guide channel and a visitor-only chat, GUILD HALL for
    members. gate=False is the state before 28 Sep, when GUILD HALL is still open to everyone."""
    ev_deny = ["SEND_MESSAGES", "ADD_REACTIONS"]
    visitors = [ow(EV, deny=ev_deny), ow(OFFICER, allow=["SEND_MESSAGES"])]
    chat = [ow(EV, allow=["SEND_MESSAGES", "ADD_REACTIONS"]), ow(OFFICER, allow=["SEND_MESSAGES", "VIEW_CHANNEL"]),
            ow(GM, deny=["VIEW_CHANNEL"])]
    hall_ev = ow(EV, deny=["VIEW_CHANNEL"] if gate else [])
    hall = [hall_ev, ow(GM, allow=["VIEW_CHANNEL", "CONNECT"]), ow(OFFICER, allow=["VIEW_CHANNEL", "CONNECT"])]
    m = base_map()
    m["roles"].append({"id": GM, "name": "Guild Member", "isAdministrator": False, "position": 4,
                       "permissions": ["ATTACH_FILES"]})
    m["categories"] = [
        {"id": "c0", "name": "VISITORS", "type": "category", "overwrites": visitors, "children": [
            chan("join-guild", copy.deepcopy(visitors)),
            chan("olympus-2-x", copy.deepcopy(chat)),
            chan("visitor-chat", [ow(EV, deny=["VIEW_CHANNEL"])]),
        ]},
        {"id": "c1", "name": "GUILD HALL", "type": "category", "overwrites": hall, "children": [
            chan("guild-chat", copy.deepcopy(hall)),
            chan("The Tavern", copy.deepcopy(hall), "voice"),
        ]},
    ]
    return m


def run2(m, when):
    return gm.review(m, ["VISITORS"], [], [], ["GUILD HALL"], now=when)


BEFORE, AFTER = gm.MEMBERS_GATE_AT - 60, gm.MEMBERS_GATE_AT + 60

# 12. Before the gate date, an open members category is expected: one INFO, reviewed as public, no PROBLEM.
f = run2(gated_map(gate=False), BEFORE)
check(lines(f, "INFO", "[GUILD HALL] becomes members-only on"), "gate announced as INFO before the date")
check(not lines(f, "PROBLEM", "GUILD HALL"), "no PROBLEM for the open guild hall before the date")

# 13. After the date, the same open category is a PROBLEM, channel by channel.
f = run2(gated_map(gate=False), AFTER)
check(lines(f, "PROBLEM", "[GUILD HALL] category should be members-only but @everyone can see it"), "open category flagged")
check(lines(f, "PROBLEM", "#guild-chat should be members-only but @everyone can see it"), "open channel flagged")

# 14. Gated: members see and talk, @everyone does not, and nothing is flagged.
f = run2(gated_map(), AFTER)
check(not lines(f, "PROBLEM", "GUILD HALL") and not lines(f, "CRITICAL", ""), "gated guild hall is clean")
m = gated_map()
hall = m["categories"][1]
hall["children"][1]["overwrites"] = [o for o in hall["children"][1]["overwrites"] if o["id"] != GM]
f = run2(m, AFTER)
check(lines(f, "PROBLEM", "#The Tavern is members-only, yet the Guild Member role cannot see it"), "member lock-out flagged")

# 15. The visitor chat: open to @everyone, hidden from Guild Member, visible to staff holding Guild Member too.
f = run2(gated_map(), AFTER)
check(not lines(f, "PROBLEM", "] #olympus-2-x") and not lines(f, "NOTE", "] #olympus-2-x"), "visitor chat set up right")
check(lines(f, "INFO", "#olympus-2-x is out of sync on purpose"), "its drift is on purpose")
m = gated_map()
chat = m["categories"][0]["children"][1]
chat["overwrites"] = [o for o in chat["overwrites"] if o["id"] != GM]
check(lines(run2(m, AFTER), "PROBLEM", "is for visitors only, yet the Guild Member role can see it"), "members seeing it flagged")
m = gated_map()
chat = m["categories"][0]["children"][1]
for o in chat["overwrites"]:
    if o["id"] == OFFICER:
        o["allow"] = ["SEND_MESSAGES"]
check(lines(run2(m, AFTER), "NOTE", "Officer cannot see this visitor channel while they also hold Guild Member"),
      "staff hidden from it flagged")

# 16. A read-only category deny is not "lingering" when the only talk channel overrides it.
check(not lines(run2(gated_map(), AFTER), "PROBLEM", "[VISITORS] category still denies"), "unsynced talk channel is fine")

# 17. The old #visitor-chat is hidden on purpose: a NOTE with the reason, not a PROBLEM.
f = run2(gated_map(), AFTER)
check(lines(f, "NOTE", "#visitor-chat is hidden from everyone on purpose") and not lines(f, "PROBLEM", "visitor-chat"),
      "hidden-on-purpose channel")

# 18. Per-member overwrites are the design in SUPPORT TICKETS: counted once, no NOTE per ticket.
m = base_map()
tickets = {"id": "c9", "name": "SUPPORT TICKETS", "type": "category", "overwrites": [ow(EV, deny=["VIEW_CHANNEL"])],
           "children": [chan("170-someone", [ow(EV, deny=["VIEW_CHANNEL"]),
                                              {"kind": "member", "id": "99", "name": "(member)", "allow": ["VIEW_CHANNEL"],
                                               "deny": [], "allowRaw": "1024", "denyRaw": "0"}])]}
m["categories"].append(tickets)
f = gm.review(m, ["GUILD HALL"], ["OFFICER COUNCIL", "SUPPORT TICKETS"], [], [], now=AFTER)
check(not lines(f, "NOTE", "one specific member") and lines(f, "INFO", "[SUPPORT TICKETS] 1 channel(s) with 1 per-member"),
      "ticket overwrites are expected")

print(f"{passed}/{passed} passed")
