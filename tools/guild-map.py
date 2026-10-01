"""Pull the Discord server map from the Worker and render it as JSON plus a readable Markdown report.

Standard library only, same as the watcher. Credentials are never passed on the command line or typed in: the
Worker holds the bot token as a Cloudflare secret, and this reads the Worker's own bearer token out of
watcher/config.json, which is already on this machine and already gitignored.

    python guild-map.py                     # writes out/guild-map.json and out/guild-map.md
    python guild-map.py --config ../watcher/config.json

The report is written for one job: rebuilding this structure inside another server. So it leads with what the bot
can actually do, flags the things that will NOT port by themselves, and prints permissions by name rather than as
bitfields.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent

# Permissions worth calling out in a summary column; the full list is always in the JSON.
NOTABLE = [
    "ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_CHANNELS", "MANAGE_MESSAGES",
    "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS", "MENTION_EVERYONE", "MANAGE_WEBHOOKS",
]


def fetch(base: str, token: str, guild: str = "") -> dict[str, Any]:
    url = base.rstrip("/") + "/admin/guild-map"
    if guild:
        url += "?guild=" + urllib.parse.quote(guild)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("User-Agent", "olympus-guild-map/1.0")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        if e.code == 401:
            sys.exit("401 from the Worker: watcher_token in config.json does not match the deployed WATCHER_TOKEN.")
        if e.code == 404:
            sys.exit("404: this Worker build has no /admin/guild-map. Deploy build .25 or later, then retry.")
        if "Discord 401" in body:
            sys.exit("Discord rejected the Worker's bot token (401). The DISCORD_BOT_TOKEN secret is stale — usually because\n"
                     "the token was reset in the Developer Portal. From the worker folder: npx wrangler secret put DISCORD_BOT_TOKEN")
        if "Discord 403" in body:
            sys.exit(f"Discord refused the bot (403) — the token is valid but the bot lacks access to part of the server: {body}")
        sys.exit(f"Worker returned {e.code}: {body}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach the Worker: {e.reason}")


def esc(s: Any) -> str:
    """Markdown-table-safe: a pipe in a channel topic would otherwise split the row."""
    return str(s if s is not None else "").replace("|", "\\|").replace("\n", " ").strip()


def render(m: dict[str, Any]) -> str:
    g, bot = m["guild"], m["bot"]
    out: list[str] = []
    w = out.append

    w(f"# {g['name']} — server map")
    w("")
    w(f"Fetched {m['fetchedAt']} (unix) · guild `{g['id']}` · owner `{g['ownerId']}` · "
      f"produced by Worker build `{m.get('build', 'unknown')}`")
    w("")
    c = m["counts"]
    w(f"**{c['roles']} roles · {c['categories']} categories · {c['channels']} channels · "
      f"{c['overwrites']} permission overwrites**")
    w("")

    if m.get("unknownPermissionBits"):
        w("> **Permission bits this build does not recognise:** " + ", ".join(m["unknownPermissionBits"]))
        w("> Discord has added permissions since the decoder table was written. Re-check before trusting a manifest.")
        w("")
    if m.get("deprecatedPermissions"):
        w("> **Retired permissions still set on roles here:** " + ", ".join(m["deprecatedPermissions"]))
        w("> Discord removed these. The bit stays set on roles that had it, but there is no longer a checkbox for "
          "it in the role editor — do not go looking for one when rebuilding these roles elsewhere.")
        w("")

    w("## What this bot can do here")
    w("")
    if "error" in bot:
        w(f"Could not read the bot's own membership: `{esc(bot['error'])}`")
    else:
        w(f"- Signed in as **{esc(bot.get('username'))}** (`{bot.get('userId')}`), roles: "
          + (", ".join(f"`{esc(r)}`" for r in bot["roles"]) or "_none_"))
        w(f"- Administrator: **{'yes' if bot['isAdministrator'] else 'no'}** · "
          f"Manage Roles: **{'yes' if bot['canManageRoles'] else 'no'}** · "
          f"Manage Channels: **{'yes' if bot['canManageChannels'] else 'no'}**")
        gmr = bot.get("guildMemberRole")
        if gmr:
            ok = bot.get("canGrantGuildMemberRole")
            w(f"- Guild Member role **{esc(gmr['name'])}** is at position {gmr['position']}, the bot at "
              f"{bot['highestRolePosition']} — **{'can grant it' if ok else 'CANNOT GRANT IT'}**"
              + ("" if ok else "  <- verification will not work until the bot's role is dragged above it"))
        else:
            w("- **The configured Guild Member role does not exist in this server.** Verification cannot work.")
        above = bot.get("rolesAboveBot") or []
        if above:
            w(f"- Cannot manage {len(above)} role(s) ranked at or above it (normal, and only a problem if one of "
              f"them is a role it needs to hand out): "
              + ", ".join(f"`{esc(r)}`" for r in above[:20]) + ("…" if len(above) > 20 else ""))
        else:
            w("- Outranks every other role in the server.")
    w("")

    w("## Config wiring")
    w("")
    w("Every role and channel id in `wrangler.toml`, resolved against what is actually in the server.")
    w("")
    w("| env var | kind | id | resolves to | status |")
    w("| --- | --- | --- | --- | --- |")
    for row in m["configWiring"]:
        mark = {"ok": "ok", "missing": "**MISSING**", "unset": "_unset_"}[row["status"]]
        w(f"| `{row['key']}` | {row['kind']} | `{row['id'] or '—'}` | {esc(row['name']) or '—'} | {mark} |")
    w("")

    w("## Roles")
    w("")
    w("Highest first — this is the order that decides who can manage whom. `managed` roles belong to an "
      "integration and **cannot be recreated by hand**; installing that integration in the destination server is "
      "what makes them appear.")
    w("")
    w("| # | role | colour | hoist | mention | managed | notable permissions |")
    w("| --- | --- | --- | --- | --- | --- | --- |")
    for r in m["roles"]:
        notable = [p for p in NOTABLE if p in r["permissions"]]
        label = f"**{esc(r['name'])}**" if r["isAdministrator"] else esc(r["name"])
        w(f"| {r['position']} | {label} | {r['colorHex'] or '—'} | {'y' if r['hoist'] else ''} | "
          f"{'y' if r['mentionable'] else ''} | {esc(r['managedBy']) if r['managed'] else ''} | "
          f"{', '.join(notable) if notable else '—'} |")
    w("")

    def channel_block(ch: dict[str, Any], depth: int, cat: dict[str, Any] | None) -> None:
        pad = "  " * depth
        bits = [f"`{ch['type']}`"]
        if ch["nsfw"]:
            bits.append("nsfw")
        if ch["slowmodeSeconds"]:
            bits.append(f"slowmode {ch['slowmodeSeconds']}s")
        w(f"{pad}- **{esc(ch['name'])}** {' · '.join(bits)} `{ch['id']}`")
        if ch["topic"]:
            w(f"{pad}  - topic: {esc(ch['topic'])[:160]}")
        # Synced = the channel's overwrites are an exact copy of its category's. It is a copy, not inheritance:
        # Discord resolves a channel from its own list only. Computed here rather than read from the Worker's
        # `syncedWithCategory`, which only says whether the channel has no overwrites at all -- a different thing.
        if cat is not None and sync_state(ch, cat):
            w(f"{pad}  - _synced with its category (same overwrites as the category)_")
        for o in ch["overwrites"]:
            who = f"@{esc(o['name'])}" if o["kind"] == "role" else f"member `{o['id']}`"
            parts = []
            if o["allow"]:
                parts.append("allow " + ", ".join(o["allow"]))
            if o["deny"]:
                parts.append("deny " + ", ".join(o["deny"]))
            flag = "  **(member override — does not port)**" if o["kind"] == "member" else ""
            w(f"{pad}  - {who}: {'; '.join(parts) or '_no-op_'}{flag}")

    w("## Channels")
    w("")
    for cat in m["categories"]:
        w(f"### {esc(cat['name'])}  `{cat['id']}`")
        w("")
        for o in cat["overwrites"]:
            who = f"@{esc(o['name'])}" if o["kind"] == "role" else f"member `{o['id']}`"
            parts = []
            if o["allow"]:
                parts.append("allow " + ", ".join(o["allow"]))
            if o["deny"]:
                parts.append("deny " + ", ".join(o["deny"]))
            flag = "  **(member override — does not port)**" if o["kind"] == "member" else ""
            w(f"- _category_ {who}: {'; '.join(parts) or '_no-op_'}{flag}")
        if cat["overwrites"]:
            w("")
        for ch in cat["children"]:
            channel_block(ch, 0, cat)
        w("")

    if m["uncategorised"]:
        w("### (no category)")
        w("")
        for ch in m["uncategorised"]:
            channel_block(ch, 0, None)
        w("")

    w("## Guild settings")
    w("")
    for k, v in g.items():
        if k in ("id", "name", "ownerId"):
            continue
        w(f"- `{k}`: {esc(json.dumps(v) if isinstance(v, (list, dict)) else v)}")
    w("")
    w("---")
    w("")
    w("Things that never port by themselves, whatever you copy: **managed roles** (install the integration "
      "instead), **member-specific overwrites** (the person must be in the destination server first), "
      "**role ids** (everything in `wrangler.toml` gets new values), and the **Linked Roles requirement** "
      "(`battlenet_linked = 1`), which is set per server under Server Settings → Roles → Links and needs Manage "
      "Roles in the destination.")
    return "\n".join(out) + "\n"


# ======================================================================================================================
# Permission review. Intent is written down here, in one place, so the check is against a stated design rather than
# against whatever the server happens to look like. When the structure changes, change these lists in the same edit.
# ======================================================================================================================

# Who is meant to see what. Since 25 Sep 2026 (Viktor): someone with no role sees START HERE and VISITORS only;
# the Guild Member role -- granted by the bot once their character in the main guild is verified and on the roster --
# opens GUILD HALL and WAR ROOM. OFFICER COUNCIL is staff-only, SUPPORT TICKETS holds MEE6's private tickets.
# (22-25 Sep the guild channels were open to everyone; that opening is what this reverses.)
DEFAULT_PUBLIC = ["START HERE", "VISITORS"]
DEFAULT_MEMBERS = ["GUILD HALL", "WAR ROOM"]
DEFAULT_PRIVATE = ["OFFICER COUNCIL", "SUPPORT TICKETS"]
MEMBER_ROLE = "Guild Member"
# The members-only gate goes up at the unverified deadline, announced beforehand. Until then the members categories
# are still open to everyone and the review says so once per category instead of flagging every channel in them.
MEMBERS_GATE_AT = 1790553600   # Mon 28 Sep 2026 00:00 UTC
# Structure meant to be removed. Still being here is not a permission fault, but it is the difference between "done"
# and "looks done", so it gets reported rather than quietly passing.
DEFAULT_RETIRED: list[str] = []
# Single channels kept but deliberately hidden from everyone, and why.
HIDDEN_ON_PURPOSE = {
    "visitor-chat": "the old visitor chat, locked since the September lockdown and replaced by #olympus-2-x on "
                    "25 Sep 2026. Old messages stay readable to the owner; delete it once nobody needs them",
}
# Channels only visitors may see: people outside the main guild (Olympus 2 and later, applicants). @everyone can see
# and use them, the Guild Member role is denied View, staff are allowed View so they can moderate.
VISITOR_ONLY = ["olympus-2-x", "Olympus 2-X"]
# Private categories where a per-member overwrite is the design, not an oversight: each ticket is one member's.
MEMBER_OVERWRITES_OK = ["SUPPORT TICKETS"]

# Channels meant to be read-only for @everyone (or, in a members category, for Guild Member). Checked both ways:
# unpostable is correct here, and postable is a fault (the usual cause is someone pressing "Sync with category", which
# strips the send-deny).
READ_ONLY_OK = [
    "welcome", "rules", "forever-guide", "announcements", "stream-alerts", "join-guild", "help-desk",
    "raid-announcements", "loot-and-raid-rules", "pick-your-role", "bot-announcements",
]

# Role intent.
STAFF_ROLES = ["Guild Master", "Guild Leader", "Moderator", "Officer", "Raid Leader"]   # highest first
# The staff who moderate: they must be able to see the visitor-only channels even while holding Guild Member.
MODERATING_ROLES = ["Guild Leader", "Moderator", "Officer"]
BOT_ROLES = ["Olympus Verify", "MEE6"]
COSMETIC_ROLES = ["Tank", "Healer", "DPS", "Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman",
                  "Warlock", "Warrior"]
DEFAULT_RETIRED_ROLES = ["Battle.net Linked"]
SYSTEM_ROLES = ["Server Booster"]   # created by Discord itself; expected, and should carry nothing extra

# What @everyone needs at server level for an open server's public channels to work at all.
EVERYONE_NEEDS = ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY", "ADD_REACTIONS", "CONNECT", "SPEAK",
                  "USE_APPLICATION_COMMANDS", "SEND_MESSAGES_IN_THREADS"]

# Permissions that should never be handed to @everyone on any channel. Granting these to everyone is not a
# "more open server", it is handing the server to whoever asks.
NEVER_FOR_EVERYONE = [
    "ADMINISTRATOR", "MANAGE_GUILD", "MANAGE_ROLES", "MANAGE_CHANNELS", "MANAGE_WEBHOOKS",
    "MANAGE_MESSAGES", "MENTION_EVERYONE", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS",
    "MANAGE_THREADS", "MANAGE_NICKNAMES",
]

# Moderation powers compared across staff roles, to catch a senior role that can do less than a junior one.
MOD_POWERS = ["KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS", "MANAGE_MESSAGES", "MANAGE_THREADS",
              "VIEW_AUDIT_LOG", "MANAGE_NICKNAMES", "MUTE_MEMBERS", "MOVE_MEMBERS"]

# What the Olympus Verify bot needs in every channel it posts to.
BOT_POSTS_NEED = ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS", "READ_MESSAGE_HISTORY"]

# Channels deliberately kept out of sync with their category, and why. The checker reports these as INFO with the
# reason instead of warning, so a later "Sync Now" cannot quietly undo a decision nobody remembers making.
INTENTIONAL_OVERRIDES = {
    "guild-chat": "the Guild Master role holds Manage Channels + View + Send here: exactly what Blizzard's Discord "
                  "guild-chat bridge (patch 12.1) requires of whoever links it from in game. Syncing deletes it",
    "bot-announcements": "the Olympus Verify role may post here: member notices replaced DMs on 25 Sep 2026 (see "
                         "worker/src/dm.ts). Everyone else reads. Syncing removes the bot's Send allow",
    "olympus-2-x": "the visitor chat in a read-only category: @everyone may post and react here, the Guild Member role "
                   "may not see it, staff may. Syncing makes it read-only and shows it to members",
    "Olympus 2-X": "the visitor voice channel: the Guild Member role may not see it, staff may. Syncing shows it to "
                   "members",
}

# What making a channel read-only may change relative to its category. A read-only channel inside a category people
# talk in can never be synced -- syncing would make it postable again -- so this drift is by design. The checker still
# says so, because an edit to the category has to be repeated on these channels by hand, but as INFO, not a warning.
READ_ONLY_DENIES = {"SEND_MESSAGES", "SEND_MESSAGES_IN_THREADS", "CREATE_PUBLIC_THREADS", "CREATE_PRIVATE_THREADS",
                    "ADD_REACTIONS", "SEND_POLLS", "SEND_VOICE_MESSAGES", "ATTACH_FILES", "EMBED_LINKS",
                    "CONNECT", "SPEAK"}
# ...and what staff or bot roles may be given on top of the category there, so that someone can still post.
POSTER_ALLOWS = {"VIEW_CHANNEL", "READ_MESSAGE_HISTORY", "SEND_MESSAGES", "SEND_MESSAGES_IN_THREADS",
                 "CREATE_PUBLIC_THREADS", "CREATE_PRIVATE_THREADS", "ADD_REACTIONS", "EMBED_LINKS", "ATTACH_FILES",
                 "SEND_POLLS", "MENTION_EVERYONE", "PIN_MESSAGES", "MANAGE_MESSAGES"}

# Channels other bots post into, going by each channel's own topic. Olympus Verify's targets come from the Worker's
# config wiring instead. Since MEE6 lost Administrator (25 Sep 2026) each of these rests on a real overwrite, and a
# missing one fails silently: the live notice or log line is simply never posted.
OTHER_BOT_POSTS = {
    "MEE6": {
        "stream-alerts": "Twitch live notices",
        "server-log": "logging plugin",
        "bot-commands": "level-ups and command replies",
    },
}
OTHER_BOT_NEEDS = ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"]

# What each bot needs server-wide for the jobs it has been given, checked whenever it does NOT hold Administrator
# (which covers everything). Taking Administrator away without covering these first is exactly how MEE6's moderation
# commands and the Contact staff ticket button stopped working on 25 Sep 2026. Keep this in step with the MEE6
# dashboard: drop an entry when its job is retired, add one when a plugin is switched on.
BOT_GUILD_NEEDS = {
    "MEE6": {
        "BAN_MEMBERS": "/ban, /tempban, /unban",
        "KICK_MEMBERS": "/kick",
        "MODERATE_MEMBERS": "/mute, /tempmute, /unmute",
        "MANAGE_CHANNELS": "the Contact staff ticket button, /slowmode",
        "MANAGE_ROLES": "the #pick-your-role menus",
    },
}

# Bots whose Administrator is a recorded owner decision rather than an oversight, with the reason. Reported as INFO
# instead of CRITICAL, so the checker stops recommending that someone undo a choice the owner made on purpose.
ADMIN_BY_DECISION: dict[str, str] = {
    "MEE6": "Viktor's choice, 16 Sep 2026, restored on 25 Sep after the review had taken it off and broken tickets, "
            "moderation commands, logging and the Twitch alerts. It can read every channel, staff ones included",
}

SPEAKABLE = {"text", "announcement", "forum", "media"}
VOICE = {"voice", "stage"}


def role_index(m: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in m["roles"]}


def effective(m: dict[str, Any], ch: dict[str, Any], role_ids: tuple[str, ...] = (), member_id: str | None = None) -> set[str]:
    """Discord's own resolution order, for one member holding `role_ids` (plus @everyone) in one channel:
    base = @everyone | each role; Administrator short-circuits everything; then the channel's @everyone overwrite;
    then every role overwrite at once (all denies, then all allows); then a member-specific overwrite.

    Only the channel's OWN overwrites count. Discord does not layer a category under its channels at resolution time —
    syncing copies the category's list onto the channel, and after that the channel's list is the whole story. That is
    why a category change can silently miss a channel that has drifted out of sync.

    Returns the granted permission names; {"*"} means Administrator (everything, overwrites ignored); an empty set means
    the channel is invisible, since a channel you cannot see grants nothing else.
    """
    roles = role_index(m)
    ev = m["guild"]["id"]
    base = set(roles[ev]["permissions"]) if ev in roles else set()
    for rid in role_ids:
        if rid in roles:
            base |= set(roles[rid]["permissions"])
    if "ADMINISTRATOR" in base:
        return {"*"}
    ows = {(o["kind"], o["id"]): o for o in ch["overwrites"]}
    o = ows.get(("role", ev))
    if o:
        base = (base - set(o["deny"])) | set(o["allow"])
    deny: set[str] = set()
    allow: set[str] = set()
    for rid in role_ids:
        o = ows.get(("role", rid))
        if o:
            deny |= set(o["deny"])
            allow |= set(o["allow"])
    base = (base - deny) | allow
    if member_id:
        o = ows.get(("member", member_id))
        if o:
            base = (base - set(o["deny"])) | set(o["allow"])
    return base if "VIEW_CHANNEL" in base else set()


def has(perms: set[str], p: str) -> bool:
    return "*" in perms or p in perms


def overwrite_for(ch: dict[str, Any], rid: str) -> dict[str, Any] | None:
    for o in ch["overwrites"]:
        if o["kind"] == "role" and o["id"] == rid:
            return o
    return None


def sync_state(ch: dict[str, Any], cat: dict[str, Any]) -> bool:
    """True when the channel's overwrites match its category's exactly — i.e. Discord considers it synced and a
    change made on the category will actually reach it."""
    def key(c: dict[str, Any]) -> set[tuple[str, str, str, str]]:
        return {(o["kind"], o["id"], o["allowRaw"], o["denyRaw"]) for o in c["overwrites"]}
    return key(ch) == key(cat)


def readonly_drift_only(m: dict[str, Any], ch: dict[str, Any], cat: dict[str, Any], trusted: set[str]) -> bool:
    """True when all that separates `ch` from its category is the read-only setup itself: @everyone loses posting
    permissions (READ_ONLY_DENIES) and gains nothing, and staff or bot roles gain posting permissions (POSTER_ALLOWS)
    and lose nothing. Any other difference -- another role, a member overwrite, a category overwrite the channel
    dropped, a permission bit this tool cannot name -- returns False, so real drift still gets its NOTE."""
    if m.get("unknownPermissionBits"):
        return False
    ev = m["guild"]["id"]

    def table(c: dict[str, Any]) -> dict[tuple[str, str], tuple[set[str], set[str]]]:
        return {(o["kind"], o["id"]): (set(o["allow"]), set(o["deny"])) for o in c["overwrites"]}

    mine, theirs = table(ch), table(cat)
    for key in set(mine) | set(theirs):
        a1, d1 = mine.get(key, (set(), set()))
        a0, d0 = theirs.get(key, (set(), set()))
        if (a1, d1) == (a0, d0):
            continue
        kind, rid = key
        if kind == "role" and rid == ev:
            ok = a1 <= a0 and d1 >= d0 and (a0 - a1) | (d1 - d0) <= READ_ONLY_DENIES
        elif kind == "role" and rid in trusted:
            ok = a1 >= a0 and d1 <= d0 and (a1 - a0) | (d0 - d1) <= POSTER_ALLOWS
        else:
            ok = False
        if not ok:
            return False
    return True


def posters(m: dict[str, Any], ch: dict[str, Any]) -> list[str]:
    """Staff and bot roles that can post in `ch` on the strength of that one role. The server owner always can."""
    by_name = {r["name"]: r for r in m["roles"]}
    return [n for n in STAFF_ROLES + BOT_ROLES
            if n in by_name and has(effective(m, ch, (by_name[n]["id"],)), "SEND_MESSAGES")]


def all_channels(m: dict[str, Any]) -> list[tuple[dict[str, Any] | None, dict[str, Any]]]:
    out: list[tuple[dict[str, Any] | None, dict[str, Any]]] = []
    for cat in m["categories"]:
        out += [(cat, ch) for ch in cat["children"]]
    out += [(None, ch) for ch in m.get("uncategorised", [])]
    return out


def review(m: dict[str, Any], public: list[str], private: list[str],
           retired: list[str] | None = None, members: list[str] | None = None,
           now: float | None = None) -> list[tuple[str, str]]:
    """Channels and categories compared against intent: public (everyone sees them), members (only the Guild Member
    role and staff see them), private (staff only). Returns (severity, message) pairs."""
    ev = m["guild"]["id"]
    out: list[tuple[str, str]] = []
    pub = {c.strip().upper() for c in public if c.strip()}
    priv = {c.strip().upper() for c in private if c.strip()}
    mem = {c.strip().upper() for c in (members if members is not None else DEFAULT_MEMBERS) if c.strip()}
    gone = {c.strip().upper() for c in (retired if retired is not None else DEFAULT_RETIRED) if c.strip()}
    now = time.time() if now is None else now
    gate_up = now >= MEMBERS_GATE_AT
    by_name = {r["name"]: r for r in m["roles"]}
    staff_ids = {by_name[n]["id"] for n in STAFF_ROLES if n in by_name}
    bot_ids = {by_name[n]["id"] for n in BOT_ROLES if n in by_name}
    mid = by_name[MEMBER_ROLE]["id"] if MEMBER_ROLE in by_name else None
    retired_roles = {by_name[n]["id"]: n for n in DEFAULT_RETIRED_ROLES if n in by_name}
    retired_hits: dict[str, list[str]] = {}
    readonly = {n.lower() for n in READ_ONLY_OK}
    visitor_only = {n.lower() for n in VISITOR_ONLY}
    hidden_ok = {k.lower(): v for k, v in HIDDEN_ON_PURPOSE.items()}
    member_ow_ok = {c.strip().upper() for c in MEMBER_OVERWRITES_OK}
    gate_day = time.strftime("%a %d %b %H:%M UTC", time.gmtime(MEMBERS_GATE_AT))

    for cat in m["categories"]:
        name = cat["name"].strip().upper()
        if name in gone:
            out.append(("PROBLEM", f"[{cat['name']}] category was meant to be deleted but is still here "
                                   f"({len(cat['children'])} channels)"))
            continue
        # An explicit --public/--private listing wins over the members default, so a category can be reviewed the old
        # way on purpose.
        intent = ("public" if name in pub else "members" if name in mem else "private" if name in priv else None)
        if intent is None:
            out.append(("INFO", f"[{cat['name']}] not covered by the public/members/private lists — not reviewed"))
            continue
        if intent == "members" and not gate_up:
            out.append(("INFO", f"[{cat['name']}] becomes members-only on {gate_day} (announced beforehand). Until "
                                f"then it is still open to everyone, so it is reviewed as public"))
            intent = "public"
        want_hidden = intent == "private"
        cat_p = effective(m, cat)
        if want_hidden and has(cat_p, "VIEW_CHANNEL"):
            out.append(("CRITICAL", f"[{cat['name']}] category should be staff-only but @everyone can see it"))
        if intent == "public" and not has(cat_p, "VIEW_CHANNEL"):
            out.append(("PROBLEM", f"[{cat['name']}] category should be public but @everyone cannot see it"))
        if intent == "members":
            if has(cat_p, "VIEW_CHANNEL"):
                out.append(("PROBLEM", f"[{cat['name']}] category should be members-only but @everyone can see it — "
                                       f"channels synced to it, and new ones created in it, are open to everyone"))
            if mid is None:
                out.append(("PROBLEM", f"[{cat['name']}] is members-only, but there is no '{MEMBER_ROLE}' role"))
            elif not has(effective(m, cat, (mid,)), "VIEW_CHANNEL"):
                out.append(("PROBLEM", f"[{cat['name']}] is members-only, yet the {MEMBER_ROLE} role cannot see it"))
        if intent == "public":
            o = overwrite_for(cat, ev)
            # SEND_MESSAGES at category level is a legitimate design for a category of read-only channels, so it only
            # counts as lingering when a channel people are meant to talk in actually inherits it (is synced).
            talky = any(c["type"] in SPEAKABLE and c["name"].lower() not in readonly and sync_state(c, cat)
                        for c in cat["children"])
            lingering = [p for p in ("CONNECT", "SPEAK") + (("SEND_MESSAGES",) if talky else ()) if o and p in o["deny"]]
            if lingering:
                out.append(("PROBLEM", f"[{cat['name']}] category still denies @everyone {', '.join(lingering)} — every "
                                       f"channel synced to it, and every new channel created in it, inherits that"))

        # Whose view decides whether a channel "works": @everyone in a public category, the member role in a members one.
        viewer_ids: tuple[str, ...] = (mid,) if (intent == "members" and mid) else ()
        viewer = MEMBER_ROLE if viewer_ids else "@everyone"

        for ch in cat["children"]:
            label = f"[{cat['name']}] #{ch['name']}"
            p = effective(m, ch)
            synced = sync_state(ch, cat)

            if want_hidden:
                if has(p, "VIEW_CHANNEL"):
                    out.append(("CRITICAL", f"{label} should be staff-only but @everyone can see it"))
                for o in ch["overwrites"]:
                    if (o["kind"] == "role" and "VIEW_CHANNEL" in o["allow"]
                            and o["id"] not in staff_ids | bot_ids | {ev}):
                        out.append(("CRITICAL", f"{label} is staff-only but the '{o.get('name') or o['id']}' role "
                                                f"is explicitly allowed to see it"))
                continue

            if intent == "members":
                if has(p, "VIEW_CHANNEL"):
                    out.append(("PROBLEM", f"{label} should be members-only but @everyone can see it"
                                           + ("" if synced else " — it is out of sync with its category, so closing "
                                                                 "the category did not reach it")))
                p = effective(m, ch, viewer_ids)
                if not has(p, "VIEW_CHANNEL"):
                    out.append(("PROBLEM", f"{label} is members-only, yet the {MEMBER_ROLE} role cannot see it"))
                    continue
            elif not has(p, "VIEW_CHANNEL"):
                if ch["name"].lower() in hidden_ok:
                    out.append(("NOTE", f"{label} is hidden from everyone on purpose: {hidden_ok[ch['name'].lower()]}"))
                else:
                    out.append(("PROBLEM", f"{label} should be public but @everyone cannot see it"
                                           + ("" if synced else " — it is out of sync with its category, so flipping "
                                                                 "the category did not reach it")))
                continue

            if intent == "public" and ch["name"].lower() in visitor_only:
                if mid and has(effective(m, ch, (mid,)), "VIEW_CHANNEL"):
                    out.append(("PROBLEM", f"{label} is for visitors only, yet the {MEMBER_ROLE} role can see it"))
                blind = [n for n in MODERATING_ROLES if n in by_name and not has(
                    effective(m, ch, (by_name[n]["id"],) + ((mid,) if mid else ())), "VIEW_CHANNEL")]
                if blind:
                    out.append(("NOTE", f"{label}: {', '.join(blind)} cannot see this visitor channel while they also hold "
                                        f"{MEMBER_ROLE} — nobody on staff can moderate it"))

            drift_note = ("NOTE", f"{label} is out of sync with its category — future category changes will not reach it")
            ro_drift = False
            if not synced and ch["name"] in INTENTIONAL_OVERRIDES:
                out.append(("INFO", f"{label} is out of sync on purpose: {INTENTIONAL_OVERRIDES[ch['name']]}"))
            elif (not synced and ch["type"] in SPEAKABLE and ch["name"].lower() in readonly
                  and readonly_drift_only(m, ch, cat, staff_ids | bot_ids)):
                ro_drift = True   # expected for a read-only channel; folded into its read-only line below
            elif not synced:
                out.append(drift_note)

            if ch["type"] in VOICE:
                cant = [x for x in ("CONNECT", "SPEAK") if not has(p, x)]
                if cant:
                    out.append(("PROBLEM", f"{label} is visible but {viewer} cannot {' or '.join(c.lower() for c in cant)} "
                                           f"— the room shows in the list and refuses anyone who clicks it"))
            elif ch["type"] in SPEAKABLE:
                can_send = has(p, "SEND_MESSAGES")
                ro = ch["name"].lower() in readonly
                if ro and can_send:
                    out.append(("PROBLEM", f"{label} is meant to be read-only but {viewer} can post in it"))
                    if ro_drift:
                        out.append(drift_note)
                elif ro:
                    who = posters(m, ch)
                    msg = (f"{label} is read-only for {viewer} (intended for this channel) — "
                           + (f"can post: {', '.join(who)}" if who else "no staff or bot role can post here, only the server owner"))
                    if ro_drift:
                        msg += (f". Out of sync with [{cat['name']}] only by that read-only setup, so a change made to the "
                                f"category has to be repeated here by hand")
                    out.append(("INFO", msg))
                elif not can_send:
                    out.append(("PROBLEM", f"{label} is visible but {viewer} cannot post — it reads as open and "
                                           f"behaves as locked"))
                if ch["type"] == "forum" and not ro and not has(p, "SEND_MESSAGES_IN_THREADS"):
                    out.append(("PROBLEM", f"{label} is a forum where {viewer} can open posts but not reply in them"))

        per_member = 0
        for ch in [cat] + cat["children"]:
            where = f"[{cat['name']}]" if ch is cat else f"[{cat['name']}] #{ch['name']}"
            for o in ch["overwrites"]:
                if o["kind"] == "role" and o["id"] == ev:
                    bad = [x for x in o["allow"] if x in NEVER_FOR_EVERYONE]
                    if bad:
                        out.append(("CRITICAL", f"{where}: @everyone is GRANTED {', '.join(bad)}"))
                if o["kind"] == "role" and o["id"] in retired_roles:
                    retired_hits.setdefault(retired_roles[o["id"]], []).append(where)
                if o["kind"] == "member":
                    if name in member_ow_ok:
                        per_member += 1
                    else:
                        out.append(("NOTE", f"{where}: permission set for one specific member ({o.get('name') or o['id']}) "
                                            f"— will not port to another server and is easy to forget"))
        if per_member:
            out.append(("INFO", f"[{cat['name']}] {len(cat['children'])} channel(s) with {per_member} per-member "
                                f"overwrite(s) — one requester each, by design"))

    for cat in m["categories"]:
        cname = cat["name"].strip().upper()
        if cname not in priv or cname in pub or cname in mem:
            continue
        chans = cat["children"] or [cat]
        audience = MODERATING_ROLES if cname in member_ow_ok else STAFF_ROLES
        blind = []
        for n in audience:
            r = by_name.get(n)
            if r and not all(has(effective(m, ch, (r["id"],)), "VIEW_CHANNEL") for ch in chans):
                blind.append(n)
        admins = [r["name"] for r in m["roles"] if r["isAdministrator"]]
        sees = [n for n in STAFF_ROLES + BOT_ROLES if n in by_name and n not in blind
                and all(has(effective(m, ch, (by_name[n]["id"],)), "VIEW_CHANNEL") for ch in chans)]
        out.append(("INFO", f"[{cat['name']}] is visible to: {', '.join(sees) or 'no role'}"
                            + (f" (via Administrator: {', '.join(admins)})" if admins else "")))
        if blind:
            out.append(("NOTE", f"[{cat['name']}] is staff-only, yet staff role(s) {', '.join(blind)} cannot see all of "
                                f"it — intended only if those roles are not meant to take part in staff business"))

    for role, places in retired_hits.items():
        out.append(("NOTE", f"the '{role}' role still has {len(places)} channel overwrites "
                            f"({', '.join(places[:3])}{', ...' if len(places) > 3 else ''}) — "
                            f"deleting the role clears all of them at once"))
    for ch in m.get("uncategorised", []):
        out.append(("INFO", f"#{ch['name']} sits outside any category — @everyone "
                            f"{'can' if has(effective(m, ch), 'VIEW_CHANNEL') else 'cannot'} see it"))
    return out


def review_roles(m: dict[str, Any]) -> list[tuple[str, str]]:
    """Server-level role permissions and hierarchy, compared against the role intent above."""
    out: list[tuple[str, str]] = []
    ev = m["guild"]["id"]
    roles = role_index(m)
    by_name = {r["name"]: r for r in m["roles"]}
    ev_perms = set(roles[ev]["permissions"]) if ev in roles else set()

    # @everyone at server level
    bad = [p for p in ev_perms if p in NEVER_FOR_EVERYONE]
    if bad:
        out.append(("CRITICAL", f"@everyone holds {', '.join(sorted(bad))} server-wide"))
    missing = [p for p in EVERYONE_NEEDS if p not in ev_perms]
    if missing:
        out.append(("PROBLEM", f"@everyone lacks {', '.join(missing)} server-wide — an open server's public channels "
                               f"need these"))

    # Administrator: bypasses every channel overwrite, so it sees and does everything, staff channels included.
    for r in m["roles"]:
        if not r["isAdministrator"]:
            continue
        if r["managed"] and r["name"] in ADMIN_BY_DECISION:
            out.append(("INFO", f"'{r['name']}' holds ADMINISTRATOR by owner decision: {ADMIN_BY_DECISION[r['name']]}"))
        elif r["managed"]:
            out.append(("CRITICAL", f"'{r['name']}' is a bot and holds ADMINISTRATOR — that bypasses every channel "
                                    f"overwrite, so it reads OFFICER COUNCIL and can change anything. Before unticking "
                                    f"it, give it what its jobs need (BOT_GUILD_NEEDS, OTHER_BOT_POSTS) or they stop "
                                    f"silently; if it is a deliberate choice, record it in ADMIN_BY_DECISION"))
        else:
            out.append(("NOTE", f"'{r['name']}' holds ADMINISTRATOR — everyone with it sees every channel regardless "
                                f"of overwrites"))

    # Bots without Administrator: can they still do the jobs they have been given?
    for bot_name, needs in BOT_GUILD_NEEDS.items():
        r = by_name.get(bot_name)
        if not r or r["isAdministrator"]:
            continue
        have = set(r["permissions"]) | set(ev_perms)
        lacking = [f"{p} ({job})" for p, job in needs.items() if p not in have]
        if lacking:
            out.append(("PROBLEM", f"'{bot_name}' lacks {'; '.join(lacking)} — those fail with an error when used"))

    # Retired roles: still present, and what deleting them silently takes away.
    for n in DEFAULT_RETIRED_ROLES:
        r = by_name.get(n)
        if not r:
            continue
        out.append(("PROBLEM", f"'{n}' role was meant to be retired but still exists"))
        gives = sorted(set(r["permissions"]) - ev_perms)
        if gives:
            also = [x["name"] for x in m["roles"] if x["name"] != n and not x["managed"]
                    and set(gives) & set(x["permissions"]) and x["name"] in STAFF_ROLES]
            out.append(("PROBLEM", f"'{n}' is the only non-staff source of {', '.join(gives)} — deleting it takes these "
                                   f"away from everyone who is not staff. Decide where they should live first"
                                   + (f" (staff keep them via {', '.join(also)})" if also else "")))

    # Cosmetic labels must not grant anything.
    for n in COSMETIC_ROLES:
        r = by_name.get(n)
        if r and set(r["permissions"]) - ev_perms:
            out.append(("NOTE", f"cosmetic role '{n}' grants {', '.join(sorted(set(r['permissions']) - ev_perms))} — "
                                f"labels are meant to grant nothing"))
    for n in SYSTEM_ROLES:
        r = by_name.get(n)
        if r and set(r["permissions"]) - ev_perms:
            out.append(("NOTE", f"'{n}' grants {', '.join(sorted(set(r['permissions']) - ev_perms))} beyond @everyone"))

    known = set(STAFF_ROLES) | set(BOT_ROLES) | set(COSMETIC_ROLES) | set(DEFAULT_RETIRED_ROLES) | set(SYSTEM_ROLES)
    for r in m["roles"]:
        if r["id"] != ev and r["name"] not in known:
            out.append(("INFO", f"role '{r['name']}' is not classified in the intent lists — not reviewed"))

    # Staff: a senior role able to do less moderation than a junior one is almost always an oversight.
    present = [by_name[n] for n in STAFF_ROLES if n in by_name]
    for i, senior in enumerate(present):
        s = set(senior["permissions"])
        if "ADMINISTRATOR" in s:
            continue
        lacks: set[str] = set()
        for junior in present[i + 1:]:
            lacks |= (set(junior["permissions"]) & set(MOD_POWERS)) - s
        if lacks:
            out.append(("NOTE", f"'{senior['name']}' ranks above other staff but lacks {', '.join(sorted(lacks))}, "
                                f"which a lower staff role has"))

    # Hierarchy: a bot can only assign roles that sit below its own.
    verify = by_name.get("Olympus Verify")
    wiring = {w["key"]: w for w in m.get("configWiring", [])}
    gm = wiring.get("ROLE_GUILD_MEMBER")
    if verify and gm and gm.get("status") == "ok":
        target = roles.get(gm["id"])
        if target and target["position"] >= verify["position"]:
            out.append(("PROBLEM", f"Olympus Verify (position {verify['position']}) sits at or below '{target['name']}' "
                                   f"({target['position']}), which it is configured to grant — Discord will refuse"))
    mee6 = by_name.get("MEE6")
    if mee6:
        above = [n for n in COSMETIC_ROLES if n in by_name and by_name[n]["position"] >= mee6["position"]]
        if above:
            out.append(("PROBLEM", f"MEE6 sits below {', '.join(above)}, which its #pick-your-role menus assign — "
                                   f"those picks will fail"))
    if verify:
        v = set(verify["permissions"])
        need = [p for p in BOT_POSTS_NEED if p not in v]
        if need:
            out.append(("PROBLEM", f"Olympus Verify lacks {', '.join(need)} server-wide"))
        if gm and gm.get("status") == "unset" and "MANAGE_ROLES" in v:
            out.append(("NOTE", "Olympus Verify still holds MANAGE_ROLES, but ROLE_GUILD_MEMBER is unset — it no "
                                "longer grants any role, so this can come off"))
    return out


def review_bot_access(m: dict[str, Any], extra_channels: list[str]) -> list[tuple[str, str]]:
    """Can the Olympus Verify bot actually post everywhere it is configured to post?"""
    out: list[tuple[str, str]] = []
    bot = m.get("bot") or {}
    by_name = {r["name"]: r for r in m["roles"]}
    rids = tuple(by_name[n]["id"] for n in bot.get("roles", []) if n in by_name)
    uid = bot.get("userId")
    chans = {ch["id"]: (cat, ch) for cat, ch in all_channels(m)}
    by_chname = {ch["name"].lower(): (cat, ch) for cat, ch in all_channels(m)}
    targets: list[tuple[str, tuple[dict[str, Any] | None, dict[str, Any]]]] = []
    for w in m.get("configWiring", []):
        if w.get("kind") == "channel" and w.get("status") == "ok" and w["id"] in chans:
            targets.append((w["key"], chans[w["id"]]))
    guide: list[tuple[dict[str, Any] | None, dict[str, Any]]] = []
    for n in extra_channels:
        if n and n.lower() in by_chname:
            guide.append(by_chname[n.lower()])
    for why, (cat, ch) in targets:
        p = effective(m, ch, rids, uid)
        lacks = [x for x in BOT_POSTS_NEED if not has(p, x)]
        if lacks:
            out.append(("PROBLEM", f"Olympus Verify cannot {', '.join(lacks)} in #{ch['name']} ({why}) — what it posts "
                                   f"there is being dropped"))
    # The guide channel is different: the bot posts there once (/olympus-admin post-guide) and afterwards only edits
    # its own pinned message (refresh-guide). Editing needs the channel and its history, not Send.
    for cat, ch in guide:
        p = effective(m, ch, rids, uid)
        cant_edit = [x for x in ("VIEW_CHANNEL", "READ_MESSAGE_HISTORY") if not has(p, x)]
        cant_post = [x for x in ("SEND_MESSAGES", "EMBED_LINKS") if not has(p, x)]
        if cant_edit:
            out.append(("PROBLEM", f"Olympus Verify cannot {', '.join(cant_edit)} in #{ch['name']} (the pinned guide) — "
                                   f"/olympus-admin refresh-guide cannot find its message"))
        elif cant_post:
            out.append(("NOTE", f"Olympus Verify cannot {', '.join(cant_post)} in #{ch['name']}: refresh-guide can "
                                f"still edit the pinned guide, but post-guide could not post a new one there"))
    # Other bots. Judged on their managed role alone: that is the only role a bot normally holds, and a member
    # overwrite for a bot's user cannot be told apart from anyone else's in the map.
    for bot_name, where in OTHER_BOT_POSTS.items():
        r = by_name.get(bot_name)
        if not r:
            continue
        for chname, what in where.items():
            hit = by_chname.get(chname.lower())
            if not hit:
                out.append(("NOTE", f"{bot_name} is expected to post in #{chname} ({what}), but there is no such channel"))
                continue
            lacks = [x for x in OTHER_BOT_NEEDS if not has(effective(m, hit[1], (r["id"],)), x)]
            if lacks:
                out.append(("PROBLEM", f"{bot_name} cannot {', '.join(lacks)} in #{chname} ({what}) — it fails "
                                       f"silently: nothing is posted and nobody is told"))
    return out

def main() -> None:
    ap = argparse.ArgumentParser(description="Export the Discord server map from the olympus-verify Worker.")
    ap.add_argument("--config", default=str(HERE.parent / "watcher" / "config.json"),
                    help="watcher config.json holding worker_url and watcher_token")
    ap.add_argument("--out", default=str(HERE / "out"), help="directory for the .json and .md output")
    ap.add_argument("--guild", default="", help="map a different server the bot is in (default: the configured one)")
    ap.add_argument("--name", default="guild-map", help="basename for the output files, so two servers can coexist")
    ap.add_argument("--check", action="store_true", help="review permissions against intent and print only the exceptions")
    ap.add_argument("--public", default=",".join(DEFAULT_PUBLIC), help="categories the whole server should see")
    ap.add_argument("--members", default=",".join(DEFAULT_MEMBERS),
                    help=f"categories only the {MEMBER_ROLE} role (and staff) should see")
    ap.add_argument("--private", default=",".join(DEFAULT_PRIVATE), help="categories only staff should see")
    ap.add_argument("--retired", default=",".join(DEFAULT_RETIRED),
                    help="categories that were meant to be deleted; flagged if still present")
    ap.add_argument("--bot-channels", default="join-guild",
                    help="the pinned guide's channel(s): the bot must be able to edit its message there")
    ap.add_argument("--from", dest="from_file", default="",
                    help="review a saved guild-map.json instead of calling the Worker (no token needed)")
    args = ap.parse_args()

    if args.from_file:
        src = pathlib.Path(args.from_file)
        if not src.exists():
            sys.exit(f"snapshot not found: {src}")
        m = json.loads(src.read_text(encoding="utf-8"))
        print(f"reviewing saved snapshot {src} (no Worker call)")
    else:
        cfg_path = pathlib.Path(args.config)
        if not cfg_path.exists():
            sys.exit(f"config not found: {cfg_path}")
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        for key in ("worker_url", "watcher_token"):
            if not cfg.get(key):
                sys.exit(f"{key} is missing from {cfg_path}")
        m = fetch(cfg["worker_url"], cfg["watcher_token"], args.guild)

    js = md = None
    if not args.from_file:
        out_dir = pathlib.Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        js = out_dir / f"{args.name}.json"
        md = out_dir / f"{args.name}.md"
        js.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
        md.write_text(render(m), encoding="utf-8")

    c = m["counts"]
    print(f"{m['guild']['name']}: {c['roles']} roles, {c['categories']} categories, "
          f"{c['channels']} channels, {c['overwrites']} overwrites")
    # Printed every time: a deploy reaches Cloudflare before it reaches every edge, so a map pulled straight after
    # one can silently come from the previous build. Seeing the build removes the guesswork.
    print(f"worker build: {m.get('build', 'unknown — Worker predates the build stamp')}")
    broken = [r["key"] for r in m["configWiring"] if r["status"] not in ("ok", "unset")]
    unset = [r["key"] for r in m["configWiring"] if r["status"] == "unset"]
    if broken:
        print("config ids not resolving: " + ", ".join(broken))
    if unset:
        print("config deliberately unset: " + ", ".join(unset))
    if m.get("unknownPermissionBits"):
        print("unrecognised permission bits: " + ", ".join(m["unknownPermissionBits"]))
    if m.get("deprecatedPermissions"):
        print("retired permissions still set: " + ", ".join(m["deprecatedPermissions"]))
    if js is not None:
        print(f"wrote {js}")
        print(f"wrote {md}")

    if args.check:
        findings = (review(m, args.public.split(","), args.private.split(","), args.retired.split(","),
                           args.members.split(","))
                    + review_roles(m)
                    + review_bot_access(m, args.bot_channels.split(",")))
        order = {"CRITICAL": 0, "PROBLEM": 1, "NOTE": 2, "INFO": 3}
        findings.sort(key=lambda f: order.get(f[0], 9))
        print()
        print("=== permission review ===")
        counts: dict[str, int] = {}
        for sev, msg in findings:
            counts[sev] = counts.get(sev, 0) + 1
            print(f"  {sev:<8} {msg}")
        if not findings:
            print("  no findings — every reviewed category and channel matches intent")
        print()
        print("  " + ", ".join(f"{k}: {v}" for k, v in sorted(counts.items(), key=lambda kv: order.get(kv[0], 9))))
        if counts.get("CRITICAL") or counts.get("PROBLEM"):
            print("  CRITICAL = something private is exposed, or a dangerous permission is held where it should not be.")
            print("  PROBLEM  = something meant to work does not: closed, unjoinable, unpostable, or a retired thing still here.")


if __name__ == "__main__":
    main()
