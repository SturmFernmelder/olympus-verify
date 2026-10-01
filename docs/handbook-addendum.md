# Handbook addendum — verification bot (merged into `olympus-owner-handbook-final.md` on 17 September, ~17:10 UTC, when the Worker went live; kept here as the source text; revised 18 September)

## Verification bot (olympus-verify)

**What it is.** A second integration next to MEE6: a Cloudflare Worker that answers the `/verify`,
`/verify-status` and `/olympus-admin` commands, runs the Battle.net Linked Role, and grants or removes **Guild
Member** from the guild roster. It has no Administrator permission — Manage Roles, Manage Nicknames, Send Messages,
Embed Links (added 18 Sep for the pinned guide), Read Message History, View Channels — and its role sits directly above Guild Member. Source and setup:
`olympus-verify/` in the Olympus folder.

**How a member gets in.** The pinned guide in #join-guild has three buttons; the slash commands do the same.
1. **Link Battle.net** (or the link `/verify` gives): authorize the app in Discord, then sign in to Battle.net when
   Blizzard's page opens — that sign-in is what proves the BattleTag, and since 18 September it is the only path:
   Discord stopped handing Battle.net connections to apps. One BattleTag per Discord account; the BattleTag is what a
   ban sticks to.
2. **Verify a character** (or `/verify <character>`) gives a six-character code for that day.
3. In game, whisper `!verify <code>` to an officer running the OlympusVerify addon (or mail it). The addon replies at
   once and queues the invite (`ADMISSION_MODE=auto`; `review` would put a card with Approve/Deny in
   #recruitment-review first).
4. The invite fires from the officer's client the next time they press their flush key — an approval reaches the
   addon within about a minute now, instead of waiting for the officer's next `/reload` — and the Guild Member role
   and the nickname follow as soon as the officer's own client confirms the join. A guild line in a chat log is not
   enough on its own, because a player can emote one that reads identically. Already in the guild? The role follows
   the moment the code is confirmed.

**What officers do.** Keep the addon installed and the watcher running on the PC you play from. `/olv` opens the
officer panel: the invite queue with an Invite button per applicant, the last events, roster and chat-log status;
it opens by itself and plays a sound when a new invite lands, and its title says how many invites are waiting and
how long the oldest has waited. It lists only applicants who are online and in no guild, since nobody else can
accept an invite; a press of the flush key invites the next of those, or — when there is nobody yet — checks the next
applicant in line with /who (one per press; the game allows no more). One click per invite, or the flush key from
anywhere; `/reload` now and then so the roster export reaches Discord. `/olympus-admin roster` shows who is in the
guild without a verified Discord account; `/olympus-admin unbind` releases a character name; `/olympus-admin ban`
stops an account from verifying again; `/olympus-admin sync` re-applies the latest roster export, which is the thing
to try first when a member says their role is missing. Guild Master counts as an officer for these commands, as
Officer, Moderator and Guild Leader do. If the in-game officer ranks are named in the Worker's configuration, the bot
also reports to #mod-alerts anyone holding one of them without the Discord Officer role; it reports and never grants,
because granting Officer is above what the bot's own role can reach.

**Who is who.** The bot keeps the link Discord account ↔ BattleTag ↔ characters. Right-click any member → Apps →
**Olympus linked characters** (or `/olympus-admin lookup user:@name`) shows their BattleTag and every character they
have linked, with status; `/olympus-admin lookup character:<name>` answers the other direction. Nicknames are set to
the character name on admission, and #server-log records every verification, admission and removal together with the
Discord account. **Banning:** `/olympus-admin ban @name` marks the account, removes Guild Member, lists the characters
still in the guild so you can `/gkick` them, posts the same to #server-log, and puts a card in #mod-alerts carrying a
**Ban from Discord** button that only a Guild Leader or Guild Master can press (the bot has not been granted Ban
Members yet, so until it is, ban or kick the Discord account by hand as usual). The BattleTag stays on record either
way, so a fresh Discord account cannot re-link it. In the other direction, a character removed in game shows up in
#server-log as "no longer in the guild" with its Discord account — run `/olympus-admin ban` on that account if the
removal was a ban. That line also names any staff role the person still holds, because Raid Leader, Officer, Moderator
and Guild Leader carry their own channel access: taking Guild Member away does not shut the door.

**What it cannot do, by design.** Invite without a key press (Blizzard restriction), keep a client logged in, or
see anything without an officer online. Removals are deliberately unhurried: unless an officer's client reports the
departure itself, a character has to be missing from two consecutive roster exports before the role comes off, and a
suspiciously small export removes nothing at all.

**Secrets to rotate if a PC is lost:** `VERIFY_SECRET` (Worker, addon `Config.lua`, watcher `config.json`) and
`WATCHER_TOKEN` (Worker, watcher). Rotation is a redeploy plus two file edits.

**Phase 3.** Retired on 1 Oct 2026 (Worker .50): the profile-API path never ran and would have kept API-derived data
outside the 29-day retention contract. The whisper and the addon's roster export stay the proof and the roster.
