# Olympus in Asmongold's Discord: category, channels and roles (28 Sep 2026)

Built by Claude (Cowork) in the Discord web client on the owner's account, owner-directed, 28 Sep 2026 about
21:40-23:25 UTC. Server: Asmongold `236932545793490944` (81k members). Everything is **hidden until launch**:
every channel denies View Channel to @everyone, the Olympus roles have no members, and none of the new roles
has any server-level permission. Creations were spaced about 20 s apart because Wick watches for bursts.

## Roles (no server permissions, not hoisted, not mentionable)

| Role | ID | Colour | Note |
|---|---|---|---|
| Olympus Guild Leader | `1554261979684933742` | #f1c40f | new |
| Olympus Officer | `1554262223038324840` | #3498db | new |
| Olympus Raid Leader | `1554262510650007602` | #e67e22 | new |
| Olympus Guild Member | `1552077551839617104` | none | the existing "Guild Member" (22 Sep), renamed; ID unchanged |

Order (top to bottom, all just above @everyone): Guild Leader > Officer > Raid Leader > Guild Member.
The empty typo role "Guild Memer" was deleted. Moderator for the bot = the server's existing **Discord Moderator** role.

## Category `Olympus` `1554263207047073822` (between Roach Review and Server)

Category overwrites (new channels were created synced to these):
- @everyone: View Channel ✕; Connect, Speak, Use Voice Activity ✓ (same voice pattern as the server's own voice channels)
- Quarantine (added automatically by a moderation bot the moment the category existed), Flagellant, Muted, Rule Breaker:
  the same deny sets as the server's Social category
- Olympus Guild Member, Olympus Raid Leader, Discord Moderator: View ✓
- Olympus Officer, Olympus Guild Leader: View, Manage Messages, Pin Messages, Manage Threads, Mute/Deafen/Move Members ✓
  (moderation scoped to the Olympus channels only)

## Channels (in sidebar order)

| Channel | ID | Who sees it | Extra |
|---|---|---|---|
| #olympus-info | `1554264597912100914` | public at launch | read-only (reactions allowed); Officer/GL can post |
| #join-olympus | `1554264786055987200` | public at launch | read-only, no reactions; Officer/GL can post (bot guide goes here) |
| #olympus-notices | `1554264944747216977` | public at launch | read-only (reactions allowed); bot notices |
| #olympus-visitors | `1554265065509756989` | public at launch, **not** Olympus Guild Member | Olympus 2+ chat; slowmode 10 s; staff still see it |
| #guild-announcements | `1554265182379839669` | Guild Member + staff | read-only (reactions allowed); Officer/GL post |
| #guild-chat | `1551253084536049714` | Guild Member + staff | the 20 Sep placeholder, moved in and synced |
| #looking-for-group (forum) | `1554265340286861352` | Guild Member + staff | post slowmode 5 min |
| #classes-and-builds (forum) | `1554265517210996898` | Guild Member + staff | post slowmode 5 min |
| #professions-and-trade | `1554265690612039710` | Guild Member + staff | |
| #raid-announcements | `1554265809952571422` | Guild Member + staff | read-only; Raid Leader/Officer/GL post, Raid Leader pins |
| #raid-signups | `1554266022444408872` | Guild Member + staff | slowmode 10 s; Raid Leader pins |
| #raid-discussion | `1554266160050995230` | Guild Member + staff | Raid Leader pins |
| #loot-and-raid-rules | `1554266306952560762` | Guild Member + staff | read-only; Raid Leader/Officer/GL post, Raid Leader pins |
| #officer-chat | `1551253115615838258` | Officer + GL only | the 20 Sep placeholder, moved in |
| #recruitment-review | `1554266499039105075` | Officer + GL only | bot review cards |
| #olympus-log | `1554266647378919505` | Officer + GL only | bot log |
| 🔊 Olympus Visitors | `1554266803650170890` | public at launch, **not** Olympus Guild Member | |
| 🔊 The Tavern | `1554267028074930256` | Guild Member + staff | |
| 🔊 Dungeon Party 1 | `1554267180697264158` | Guild Member + staff | |
| 🔊 Dungeon Party 2 | `1554267323546992650` | Guild Member + staff | |
| 🔊 Raid 1 | `1554267467377807491` | Guild Member + staff | Raid Leader: Priority Speaker, Mute/Deafen/Move |
| 🔊 Raid 2 | `1554267612773621844` | Guild Member + staff | same |
| 🔊 Raid Bench | `1554267775353225316` | Guild Member + staff | same |
| 🔊 Officer Council | `1554267955003662336` | Officer + GL only | |

"Staff" = Olympus Officer, Olympus Guild Leader and Discord Moderator (Discord Moderators do not see the four
officer channels). Admins see everything. Every overwrite above was read back after saving.

Not touched: the three other placeholders at the top of the server (#server-chat `1551936147788136579`,
#guild-chat `1551936354357743716`, #officer-chat `1551936399824003093`, created 22 Sep around 12:40 UTC, purpose unknown;
empty and admin-only). Decide whether to delete them.

## Olympus Verify in this server (29 Sep 2026)

- Added by Viktor from the desktop app's Add App window: scopes `bot applications.commands`, server permission View
  Channels only. Managed role **Olympus Verify**; the bot user is Olympus Verify#0000 (discriminator withheld; bots keep one). Wick left it alone.
- It posts only the Olympus intros for now (`/olympus-intros`, Worker build .39; verification still serves the beta
  server until the move in `asmongold-move.md`).
- Channel overwrites for the Olympus Verify role, saved and read back:
  - text channels (#olympus-info, #olympus-notices, #olympus-visitors, #guild-announcements, #guild-chat,
    #professions-and-trade, #raid-announcements, #raid-signups, #raid-discussion, #loot-and-raid-rules): View Channel,
    Send Messages, Embed Links, Read Message History, Pin Messages ✓
  - forums (#looking-for-group, #classes-and-builds): View Channel, Create Posts, Send Messages in Posts, Embed Links,
    Read Post History, Manage Posts ✓ (Manage Posts pins the "Read first" post and applies the moderator-only Guide tag)
  - #guild-chat is therefore no longer synced with the category; that is expected.
- Integrations → Olympus Verify → `/olympus-intros`: allowed for Olympus Officer and Olympus Guild Leader (the command
  is otherwise Administrator-only). Command id `1554292331924946995`.
- Intros live since 29 Sep 00:56 UTC (7:56 PM on 28 Sep in Houston; Viktor's refresh): one pinned bot message in each of the ten text channels and a
  pinned "Read first" post in each forum. Text: `worker/src/intros.ts`.

## Launch checklist

1. **Open the public channels:** on #olympus-info, #join-olympus, #olympus-notices, #olympus-visitors and
   🔊 Olympus Visitors, set @everyone → View Channel from ✕ to / (neutral). The server's Verified role then shows them.
   Leave the category itself alone.
2. **Onboarding:** Onboarding is ON in this server, so add the public Olympus channels to Onboarding (default
   channels or a prompt), or members who only see onboarding channels will never find them.
3. **Bot:** installed 29 Sep (see below). At the move: give its role Manage Roles (and Manage Nicknames / Ban Members
   if wanted), keep it above Olympus Guild Member, and allow it View/Send/Embed Links in #join-olympus,
   #recruitment-review and #olympus-log (#olympus-notices already has them).
4. **Quarantine caveat (same as Forever's channel-access plan):** Olympus Guild Member's View ✓ outranks the
   Quarantine and Flagellant View ✕ (role allows beat role denies). Before anyone holds the role, confirm that
   Wick's quarantine strips roles, or have the bot remove Olympus Guild Member while Quarantine/Flagellant is held.
   Muted and Rule Breaker are unaffected: the member role grants nothing beyond View.
5. **Worker config** (if Olympus Verify moves here, see asmongold-move.md): GUILD_ID `236932545793490944`;
   ROLE_GUILD_MEMBER `1552077551839617104`; ROLE_OFFICER `1554262223038324840`; ROLE_RAID_LEADER
   `1554262510650007602`; ROLE_GUILD_LEADER `1554261979684933742`; ROLE_MODERATOR = Discord Moderator;
   CHANNEL_RECRUITMENT_REVIEW `1554266499039105075`; CHANNEL_SERVER_LOG `1554266647378919505`; CHANNEL_NOTICES
   `1554264944747216977`; CHANNEL_VISITOR_CHAT `1554265065509756989`; CHANNEL_MOD_ALERTS: none here (AutoMod
   alerts stay with Asmongold's staff); point it at #olympus-log or leave it unset.
