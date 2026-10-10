# Design — membership verification for Olympus (rev. 2026-09-29, Claude Cowork)

This is the sketch the owner brought on 17 September, checked against the current API documentation and rewritten
where it did not hold. The premise stands: zero-touch exists today only at the Battle.net-account level; the
character level arrives when Blizzard adds Forever to the profile API; in between, the in-game step is made
event-driven around one unavoidable fact — the only legitimate observer of in-game actions is a real client with an
officer logged in. Clientless relays (WoWChat and friends) speak the private-server protocol; on Blizzard's servers a
third-party client, an anti-AFK trick or injected input is the same ban.

## What changed from the sketch

### 1. "Hands off" became "officer online, one key press"
`GuildInvite` / `C_GuildInfo.Invite` are restricted on current clients and require a hardware event
([API_C_GuildInfo.Invite](https://warcraft.wiki.gg/wiki/API_C_GuildInfo.Invite),
[API_GuildInvite](https://warcraft.wiki.gg/wiki/API_GuildInvite); both sit in
[Category: restricted](https://warcraft.wiki.gg/wiki/Category:API_functions/restricted)). GRIP, a recruitment addon
last updated 26 Aug 2026 for Midnight 12.0.1+, documents the practical consequence: "Hardware events: /who, guild
invites, and channel posts require a mouse click or key press. This is a Blizzard restriction — GRIP queues the
actions, you trigger them" ([GRIP on WoWInterface](https://www.wowinterface.com/downloads/info27072-GRIP-GuildRecruitmentAutomation.html)).
`GuildRosterSetPublicNote` was removed in 12.0.1 / Classic 1.15.9
([API_GuildRosterSetPublicNote](https://warcraft.wiki.gg/wiki/API_GuildRosterSetPublicNote)); its replacement
`C_GuildInfo.SetNote(guid, note, isPublic)` carries the same restriction flag
([API_C_GuildInfo.SetNote](https://warcraft.wiki.gg/wiki/API_C_GuildInfo.SetNote)).

Whisper replies are unrestricted (`SendChatMessage` to WHISPER — the DBM precedent holds), as are reading mail
headers/text with the mailbox open, reading the roster, and `LoggingChat`.

So the addon validates, replies and **queues**; the officer's flush key (a key binding, a typed `/olv flush`, or the
on-screen button — all hardware events) fires **one invite per press** (test item 2, measured: the second
`C_GuildInfo.Invite` in the same press is blocked), shows how many are still waiting, and attaches the server's
answer to the record. The addon does not piggyback on unrelated clicks to manufacture the event — that is the
behaviour these restrictions exist to stop.

**Measured on the Forever beta (build 1.60.1.69893, 17 Sep 2026, `addon/OlympusProbe`):** `C_GuildInfo.Invite`
runs from a typed command (the server answered the impossible name with "not found") and raises
`ADDON_ACTION_BLOCKED` from a timer — the flush-key model holds. `C_GuildInfo.SetNote` raises
`ADDON_ACTION_FORBIDDEN` from the key press as well, so **public notes are not automatable on this client**:
`SET_GUILD_NOTE=false`, `setNotes = false` in `Config.lua`, and the Worker's D1 mapping is the only record of who is
who (it always was the authoritative one); `/olp note` (own GUID, note unchanged, first call of the press) gave the
same `ADDON_ACTION_FORBIDDEN`, on a character without note permission — a last confirmation on an officer-ranked
character would close even that caveat. **One protected call per hardware event:** `/olp multi` fired three
`C_GuildInfo.Invite` calls in one press twice; each time the first went to the server and the second and third
raised `ADDON_ACTION_BLOCKED`. (That is also why the `GuildInvite` global looked "blocked" in `/olp test` — it ran
second; the addon never calls it while `C_GuildInfo.Invite` exists.) `C_GuildInfo.MemberExistsByName` works from
any context and lets the addon mark an invite "joined" within 30 s instead of waiting for the roster export; the
server's own system message ("… has joined the guild.", "… not found." = applicant offline, "Guild is full.") is
attached to the invite record, and offline/full answers are retried on later presses (five attempts). Whispers
sent from a timer are delivered (`CHAT_MSG_WHISPER_INFORM` fired), so the instant `!verify` reply stands;
`C_ChatInfo.AreOutgoingAddonChatMessagesRestricted()` is true on the beta, but per Blizzard's own documentation that
governs addon *comms* (`SendAddonMessage`), which this design does not use.

### 2. The code is bound to character + day, not to the Discord ID
The addon has no network and no Discord ID, so it cannot recompute HMAC(Discord ID + character). The shared spec
(`worker/src/codes.ts`, `watcher/codes.py`, `addon/.../OlympusHmac.lua`, identical outputs proven on
`watcher/tests/vectors.json`) is

    HMAC-SHA256(secret, asciiLower(character) + "|" + utcDay) → first 30 bits → 6 symbols of ABCDEFGHJKLMNPQRSTUVWXYZ23456789

accepted on the issue day and the next UTC day. The Worker resolves character → the open `/verify` request
(one per name at a time, 24 h, first come first served) → Discord ID, and only the Worker writes the binding.
A 30-bit code arriving by whisper at chat speed is not brute-forceable in a day; the secret lives in the Worker,
the officer's `Config.lua` and the watcher config — all officer-controlled.

### 3. The Linked Role does not gate #join-guild / #help-desk
Those are the public surface (audit rule P01: exactly six public channels; visitors must be able to read how to join).
**Corrected 18 Sep:** the Linked Role gates neither. It was written up as gating posting and the `/verify` command,
and it does neither in practice — `/verify` refuses a Discord account with no stored BattleTag inside the command
itself, on the Worker's own record rather than on the role, and since the 18 September lockdown nobody can post in
#join-guild at all. It is an app-metadata Linked Role and a visible marker, nothing more; the mechanism behind it is
unchanged: the Worker keeps the verified BattleTag (one per Discord account, refusing a second account on the
same BattleTag) and pushes `battlenet_linked = 1` through `role_connections.write`; Discord enforces the requirement
([Connections & Linked Roles: Admins](https://support.discord.com/hc/en-us/articles/10388356626711-Connections-Linked-Roles-Admins),
[Discord blog: connected accounts and Linked Roles](https://discord.com/blog/connected-accounts-functionality-boost-linked-roles)).
Bans are recorded against the BattleTag, so a fresh Discord account cannot re-link it.

**Measured 17 Sep 2026, and it changes the mechanism:** Discord's OAuth `connections` endpoint does not return
Battle.net connections to apps any more — the owner's account showed Battle.net (Example#0000, a synthetic tag standing in for the owner's; "Display on
profile" on) in User Settings, yet `/users/@me/connections` under the `connections` scope listed only `twitch, xbox`;
removing and re-adding the connection through Battle.net's own OAuth changed nothing. The unofficial API docs still
list `battlenet` as a type, so this is a server-side filter, not a documentation gap. The Worker therefore proves
the BattleTag with **Blizzard's own login** instead: `/linked-role` → Discord authorization (`identify
role_connections.write`; `connections` was still requested that day in case Discord reversed this, and was dropped
altogether on 18 September) → a 302 to `https://oauth.battle.net/authorize` (`openid`) → `/bnet/link` exchanges the code,
reads `userinfo` (`battletag`, account `id`) and continues with the same binding, ban check and role-connection
push. The Discord identity and the short-lived Discord token ride through the Blizzard round trip in an AES-GCM
sealed cookie (`olv_bnet`, ten minutes, cleared on return). Requires a Battle.net API client (develop.battle.net;
redirect URL `<PUBLIC_BASE_URL>/bnet/link`) as `BNET_CLIENT_ID`/`BNET_CLIENT_SECRET`; `/health` reports
`bnetLogin`. The same client serves Phase 3 later. Member-facing effect: the link now ends in a Battle.net login
(with the authenticator prompt Blizzard shows) instead of the Discord connection check — one screen more, and
Blizzard rather than Discord vouches for the BattleTag.

### Smaller corrections
- `WoWChatLog.txt` flush cadence is undocumented ([API_LoggingChat](https://warcraft.wiki.gg/wiki/API_LoggingChat)).
  The watcher tails it for the fast path and falls back to the SavedVariables copy of the same event after
  `/reload`/logout, deduplicating both. **Measured on the beta (17 Sep):** the client flushes the log every
  **48 KiB** of chat text, not on a timer — three writes at 21:18:43, 21:24:10 and 21:31:03 UTC, each exactly
  49,152 bytes plus the line that crossed the threshold, each with the file mtime equal to that line's timestamp.
  At Olympus's guild-chat volume (~6–9 KB/min) that is a 6–8 minute cadence; at night it can be hours. So the
  fast path is "minutes while chat is busy"; the SavedVariables path (`/reload`) is the reliable one, and the
  officer reloads anyway to pick up Discord approvals before pressing the flush key. **18 Sep:** the addon now
  toggles `LoggingChat` off and on two seconds after a confirmed code or a guild join/leave system line, meant to
  close and reopen the file and write the buffer out (`/olv flushlog` tests it; measured 27 Sep, it does not, and
  0.6.3 switched it off -- see "Chat log" under 27 September); the watcher also relays
  "has joined/left/been kicked out of the guild" lines, so roles follow joins and departures in seconds. Admission
  switched to `auto` the same day: in review mode the addon had queued the invite from the whisper regardless, so
  the card was a formality; the Linked Role plus the code are the check, the key press stays.
- Forever's two-part, realmless names may change the `CHAT_MSG_WHISPER` sender format. Normalisation strips a
  `-suffix` and collapses spaces; the invite uses the sender string exactly as received. Test item 1.
- **Existing members (added 17 Sep, first live test):** a character that is already on the roster — an existing member
  linking their Discord, or someone an officer invited by hand — has nothing to admit. The addon checks
  `C_GuildInfo.MemberExistsByName` on a valid code, queues no invite and replies that none is needed; when the
  watcher relays the code, the Worker checks its latest roster snapshot and grants Guild Member at once instead of
  posting a review card. The roster export remains the source of truth for keeping the role.
- The 12.1 guild-chat bridge is announced for retail only
  ([Icy Veins, 6 Aug 2026](https://www.icy-veins.com/wow/news/wow-and-discord-finally-connect-link-your-battle-net-and-discord-accounts-add-guild-chat-and-friends/)); it is a Phase 3 bonus, not a plan.
- The Worker is a second bot on a server the handbook documents as MEE6-only; `docs/handbook-addendum.md` is the text
  for the owner handbook.

## 18 September: trusted events, roster guards and the end of the connections scope

**The connections scope is gone from the flow.** Discord's developer changelog of 14 August 2026 states that newly
created Battle.net connections are already withheld from `GET /users/@me/connections` and that existing ones follow
on 22 September 2026, with no replacement. `/linked-role` therefore asks Discord for `identify
role_connections.write` and nothing else: having identified the Discord user it goes straight to
`https://oauth.battle.net/authorize` (`openid`), and `/bnet/link` reads the BattleTag from Blizzard's `userinfo`.
`BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` are required credentials now, not a fallback. This also removes a failure
the 17 September build still had — a connections call that returned a non-OK status dead-ended the member on a 502
page with nothing stored — and takes one permission off the consent screen.

**A join or a departure is trusted only when its origin is.** Every guild event now carries an `origin`. Two are
trusted and may grant or remove a role: `addon`, the addon's own SavedVariables, and `token`, an officer's outgoing
whisper carrying an HMAC the addon computed. `chatlog`, the plain text of a guild system line, is not, because
`/emote has joined the guild.` produces a byte-identical line — which made Guild Member forgeable by anyone who had
completed `/verify` and never been invited. An untrusted join now grants nothing; an untrusted departure only arms
the removal described below. The asymmetry that makes this work is that outgoing whispers are recorded in the chat
log verbatim and only the officer's own client writes them, so the confirmation the addon whispers a new member
(`(ref OLVj-<hmac>)`) is evidence that the officer's client, not a bystander, saw the join.

**A truncated export can no longer strip anyone.** `ExportRoster` calls `SetGuildRosterShowOffline(true)` before
reading the roster: the Classic-line roster functions index the *displayed* roster, so without it an export carried
only the online members (450 total against 422 online on the beta) and the Worker would have read the difference as a
mass departure. The addon also refuses to overwrite a good export with one more than ten per cent smaller. On the
receiving side, a snapshot below `ROSTER_MIN_MEMBERS`, or more than `ROSTER_MAX_SHRINK_PCT` (10) per cent smaller than
the one before it, is stored but removes no roles and leaves a warning in the server log. `/olympus-admin sync`
re-applies the latest snapshot when an officer has decided it is sound.

**Removal needs two exports that agree.** The first export in which a character is missing moves it to a new
`left_pending` status; the second removes the role. A character that reappears in between is restored with no DM. An
authoritative in-game departure — a trusted event — still removes the role at once, so the delay applies to the
inference drawn from an absence, never to an observed fact. The departure log line names any staff role the person
still holds, because Raid Leader, Officer, Moderator and Guild Leader carry their own channel access and removing
Guild Member does not lock them out.


**Per-officer queue claims.** `GET /queue` used to hand every waiting invite to every caller. That was fine while one
officer ran the addon and quietly wrong the moment a second did: both clients would write the same rows into their own
`OlympusQueue.lua` and both would fire the invite, so the applicant got two and the second officer got "already in a
guild". Each watcher now identifies itself (`officer_id`, defaulting to the normalized officer character) and is handed
only the rows it holds. A hold is refreshed on every poll and lapses after `QUEUE_CLAIM_TTL_MINUTES`, which is what
keeps an officer who closes the game from stranding their queue — no heartbeat, no release, and the work would sit
there until someone noticed.

The claim alone is not enough, because the addon keeps its own copy of the queue. A worker-sourced row that is still
`queued` here and no longer present in the file is now withdrawn from the client. That covers the reclaim, and it also
fixes something older and independent of it: an invite cancelled in Discord by `/olympus-admin ban` or `unbind` was
cancelled in D1 and then sent anyway by whichever client already held it. Rows queued from a whisper are never touched
by this, an already-invited row is left alone, and an unreadable queue file changes nothing — the file returning
garbage must not be able to empty the queue.

## Phases
- **Phase 1 (live on deploy):** Linked Role via the Worker; `/verify` codes; review cards; roles from roster diffs.
- **Phase 2 (the floor until the API exists):** addon + watcher as above. Residual manual input: an officer logged in
  with the addon, a key press per flush, an occasional `/reload` to write SavedVariables (approvals no longer wait
  for one — the addon re-reads the queue file on a timer). Latency: seconds-to-minutes (whisper) to "next officer
  session" (mail, roster).
- **Phase 3 (API lands):** `PHASE3_BNET_API=true`, set `BNET_PROFILE_NAMESPACE` (and the guild-roster shape, since
  Forever is realmless), register `/verify-bnet`. Ownership is then proven by `wow.profile` → `/profile/user/wow`,
  and the 30-minute cron replaces the SavedVariables roster for removals. Code paths exist behind the flag; the
  cut-over is config plus whatever the new namespace/roster shape requires.
- **Phase 4 (impersonation edge):** codes must arrive from the character (the addon ignores BattleTag whispers —
  `CHAT_MSG_BN_WHISPER` is not registered); a name bound to another Discord ID is refused, never re-linked; officers
  release names with `/olympus-admin unbind`. High-profile names get no special path: the same rule protects them.

## Threats considered
- Squatting a name before its owner verifies: one open request per name for 24 h; the real owner whispers from the
  character and wins the binding; a squatter's request expires unconsumed.
- Replayed codes: single-use per pending request; a valid code with no open request is logged and ignored.
- A stolen `Config.lua`: yields codes for any name for a day — rotate `VERIFY_SECRET` in all three places.
- A tampered `OlympusQueue.lua`: only strings and numbers are loaded, and invites still need the officer's key.
- A tampered SavedVariables file: the watcher's parser accepts literals only (no Lua execution).
- Watcher token leak: rotate `WATCHER_TOKEN`; the endpoints cannot grant roles directly, only report events the
  Worker re-validates against its own state (codes are re-checked server-side; roles follow the roster, not the report).

**Freeing a seat, and why the addon does not do it by itself.** The guild hits its cap — 1000 on the beta — and
invites start answering "Guild is full." The obvious automation is to kick the longest-absent member and retry, and it
is the wrong shape three times over. The data is weaker than it looks: `GetGuildRosterLastOnline` is a duration since
last seen and returns zero for anyone currently online, so the naive sort ranks the people playing right now as the
most absent. The blast radius reaches Discord: the roster diff sees the departure and strips their Guild Member role,
so an automatic kick silently removes someone's Discord access too. And the client allows one protected call per
hardware event, so kick-and-invite could never be a single action anyway — the automation would save one press out of
two while taking an irreversible action against a person with nobody in the loop.

So the addon ranks and a human clicks. Candidates are filtered by rank, by an explicit hold note, by a minimum
absence, and by being offline at all; each removal is armed by one click and performed by a second; the shortlist is
posted to the staff channel so the decision is visible; and the removal is reported as `removed`/`space` rather than
as a departure, which lets the Worker keep the binding, use a different log line, and tell the person why. What the
queue does in the meantime is the other half: a verified applicant is told their position in line rather than left
watching an invite that cannot be sent.

## 27 September: request codes, signed notes and character IDs (addon 0.6.0, watcher 0.6.0, Worker .38)

**Request codes ("tickets").** The guide's button now issues a 7-symbol code bound to the Discord request instead of a
character name: `nonce (3 random symbols) + first 4 symbols of HMAC("ticket|nonce|day")`. Nothing is typed in Discord,
nobody can hold a name they do not own for a day, and the character linked is whichever one whispers the code — the
server vouches for the sender. The reply carries the whole line to paste (`/w <officer> !verify CODE`) and names an
officer who is in the world. Guarantees, each enforced where it can be:
- One code links one character. The addon records the first sender of a request code for 48 h and answers anyone else
  with "already used" (neither queued nor relayed); the watcher relays a request code once, keyed on the code alone;
  the Worker's claim is a guarded one-row update. With two officers online a leaked code could still get one invite
  from each client; the Worker still links one character, and the second one's use is in the server log.
- One request, one code. A nonce is handed out again only after 48 hours (every earlier code from it has stopped
  passing), in one conditional insert, and a request accepts only the exact code it showed.
- A code is exactly 6 or 7 ASCII symbols after `!verify` (any case, punctuation after it ignored, nothing stripped):
  the addon and the watcher apply the same rule, pinned by `watcher/tests/vectors.json`.
- A request closes when it is refused for a character linked elsewhere, or when the account is banned, so the next
  press gives a fresh code rather than one tied to the refused sender for a day.
- The button hands out request codes only once an officer's watcher has reported both itself and the addon at 0.6.0
  or later (`REQUEST_CODES = "auto"`; `"on"`/`"off"` force it). Before that it opens the old name form, so the Worker
  can be deployed first without anyone being given a code the game would refuse.

**Signed notes, the full set.** A line the officer's own client writes into the chat log ("To <name>: …") cannot be
forged by another player, and a MAC over its content makes it unforgeable by anyone without the secret:
`OLVj` a join, `OLVl` a departure with its kind (left, kicked, removed to free a seat, removed as unverified),
`OLVr` at every login and reload: which character is in the world and which addon build it runs, and `OLVg` right after
a confirmed code: the whisperer's character ID (GUID), read from the whisper event itself. Incoming copies of the notes
(the "X whispers:" half) and `/emote` text are never trusted.

**Links follow characters, not names.** A link is pinned to a GUID: at once from `OLVg` when the addon could read it,
otherwise at the first roster export that meets it (and at verification only from an export under ten minutes old). A
roster export then reconciles identities before promoting or removing anyone: a pinned GUID found under another name is
a rename and the link moves (even when someone else has since taken the old name); a name held by a different
character is a namesake and the link is released — but only when two exports in a row agree, as for departures, and
never more than `max(5, 2%)` releases in one export (more are held and reported; `/olympus-admin sync` applies them).
Two links swapping names are left for an officer. A released link's row is kept under an archive key, never deleted.
Only a roster that is current (under 12 hours old and from after `LINKS_NOT_BEFORE`) is taken as evidence that someone
is in the guild when a code is confirmed or a join line is read; the beta's last export on launch day is not.

**Chat log.** The client writes `WoWChatLog.txt` every 48 KiB of chat and at `/reload` or logout. Turning logging off
and on does not write it out, in one frame (measured 27 Sep: lines waited 40 s to 6 min) or a fifth of a second apart
(the 0.6.2 log-test marker reached the file 37 minutes later, at logout), and every toggle can drop the lines that
arrive while logging is off, so 0.6.3 switched the automatic flush off; Sync & reload pushes everything. The watcher
measures how long each line took to reach it (`--check` prints it). A line hidden by a chat message filter is still
logged: the incoming copy of 0.6.2's login note, which the addon hides, is in the file (27 Sep 20:46 UTC). The notes
to self still hide only that copy. The loaded addon build also reaches the watcher through SavedVariables, so nothing
waits on the chat log alone.

**The player's own name.** On the 17 Sep beta build `UnitName("player")` returned the whole two-part name
("Fern Melder"); on the client run on 27 Sep it returns only the first part ("Fern"), and a whisper to that is answered
"No player named 'Fern' is currently playing." 0.6.0 and 0.6.1 whispered their notes to self to that name, so none was
ever sent. From 0.6.2 the addon takes its whole name from the guild roster, by the character's GUID (a whisper to
yourself, whose sender carries the GUID, is the fallback; guild chat is not used, since a line bridged from Discord could
carry the GUID beside a Discord display name), and until then keeps notes waiting rather than guess. It saves the GUID
with the build. The watcher names a relay only through the roster entry with that GUID, or from a login note addressed
to the very name it carries -- a whisper the server delivered; a name from anywhere else, such as the "Fern" that
watcher 0.6.1 kept, is not named to applicants.

**Known limits.** A request code names no character until it is whispered, so its holder is not protected from
removal as "verifying now"; the removal panel and `/olympus-admin roster` show how many such codes are out. With
presence reports off (`report_presence: false`) the Worker never learns the addon version, so request codes need
`REQUEST_CODES = "on"`. `OLVDIAG` timing markers are diagnostics and trusted from any outgoing line.

## 29 September: the guild site and reserved names (Worker .41, watcher 0.6.4, addon 0.6.4)

**One Worker, a second host.** `guild.roachcouncil.com` (`SITE_HOST`) is a custom-domain route on the same Worker, so
the site reads the same D1 as the bot and needs no second deployment. Requests for any other path on that host get a
404; the bot's endpoints answer only on their own host. The page is one HTML shell with the signed-in state inlined as
JSON (`<`, `>`, `&` and U+2028/9 escaped) and one script (`public/static/app.js`) that builds every element with
`textContent`; there is no `innerHTML`. The CSP allows scripts and styles from the site itself only, images from
Discord's CDN, and no framing.

**Sign-in.** Discord OAuth with `identify guilds.members.read`: the second scope answers "is this person in
`SITE_GUILD_ID`" for that one server (404 = not a member; `pending` = the server's rules not accepted yet) without
reading anyone's server list. The first attempt uses `prompt=none` so a returning person is not asked again; any error
on it retries once with the consent screen, because Discord does not document what `prompt=none` does for someone who
never authorised the app. The session is a cookie (`__Host-olg`) holding the Discord id, an expiry and a version,
signed with a key derived from `COOKIE_SECRET`. Signing out and a denial bump `site_users.session_version`, which ends
every older cookie; a new account row starts that version at a random number, so an account deleted and created again
never brings an old cookie back. Every write needs the page's `X-Olympus` header and a same-origin `Origin`, is
rate-limited, and re-checks membership with the bot at most once an hour (someone who left can still read and delete
their data, but not save).

**What people see.** Nominations are shown to `SITE_ADMINS` only; a member never learns whether a reserved name was
approved ("saved" either way). The audit log, which outlives Delete my data, records counts, not names. A permanently
denied account keeps a bare row (id, the denial, when) so the denial survives the delete; an officer's lookup says only
that the account was denied, not why.

**Reserved names.** An admin approves the names promised a seat. From `LAUNCH_AT` (or by hand) approved names go into
`invite_queue` with `priority = 1`, which every reader of the queue serves first: `getQueue`, `waitlistPosition`, the
addon's flush and panel, and `/olympus-admin queue`. A name that more than one account holds an approved claim on is
not queued until an admin releases one ("contested"); names of banned accounts are held back too. Releasing a name
cancels the row the site made while it is still waiting, or only takes the priority off a row that was there on its
own. The member's view follows the invite: queued while it is live, in the guild once accepted, and "ended" (and free
to remove) when it ran out without them; an admin may approve an ended one again.

**The queue since .41.** Two changes that matter beyond the site. Claims are sticky: an officer keeps the rows they
hold while their watcher polls, and takes new rows only into spare places, plus up to `QUEUE_CLAIM_PRIORITY_EXTRA`
reserved names on top. The game client reads `OlympusQueue.lua` only at `/reload`, so a row that moved to another
officer could still be invited from the first client; before .41 a burst of reserved names at the top did exactly
that. And verifying again takes the name's live row over in place (same row, same place, same officer, refusals kept,
the old refusal reason and backoff cleared) instead of cancelling it and adding one at the back. A name whose site
invite ran out of tries goes back in at the top when its owner verifies by hand; after a decline it goes to the back,
like anyone's decline, and after a join it is an ordinary applicant.

**Discord names in game.** `members` gains `username`, `global_name` and `names_at`, written for linked members only:
from any interaction, from a site sign-in, and by the cron (five stale ones per run, a 429 ends the run). The display
name is sent only when it differs from the username by more than case. `/queue/unverified` carries a `verified` list,
the watcher writes it into `OlympusQueue.lua`, and addon 0.6.4's Members window shows every guild member as verified,
verifying now, not verified or not in the list, with those names; a `|` in a name is doubled so the client draws it as
text. The list is as fresh as the last `/reload`.

**Lookups in Asmongold's server.** `/olympus-lookup` and the user command answer, privately and for Olympus Officer,
Olympus Guild Leader or Administrator only, who a member is (names, linked characters, site application and reserved
names) or who holds a character. They run ahead of the Olympus-only guard only in `INTROS_GUILD_ID`.

**Known limits.** The free plan's 100,000 requests a day are shared by the whole account: the member search is
debounced and cached per query in the page, but a busy sign-up day can still reach the cap, so the site should go out on
Workers Paid. D1's `LIKE` ignores case for A-Z only, so an admin search for a name starting with a lowercase accented
letter misses one stored with the capital. Everything the addon learns from the Worker still waits for a `/reload`.

## 30 September: the voting board, NA and EU raid roles, backups and the weekly grid (Worker .43)

**The game's own art.** The site now wears World of Warcraft's interface: the dialog and tooltip frames as CSS
`border-image` nine-slices, the red panel buttons with their pressed, greyed and lit states, the check boxes and radio
buttons, the edit-box border, the achievement parchment, the quest dividers, the rock background, a crop of Molten
Core's loading screen (below its logo), the role, raid-group and ready-check icons, class and position icons, and the
two interface fonts (Friz Quadrata, Morpheus) as WOFF2. `tools/build-site-assets.py` makes all 78 files (339 KiB) from
textures extracted from the local game client: crops, rearrangements and format changes only, nothing redrawn, no game
logo. Like olympus.roachcouncil.com/guild, it is a free, non-commercial fan site; the footer says it is not affiliated
with Blizzard and credits the art and fonts to Blizzard. Until .85 the brand was the Guild Hall's own logo
(`olympus-icon.png`); since .86 (the owner's instruction of 1 Oct 2026: generated and custom artwork for the Discord
application only, the websites on official World of Warcraft assets) the brand and the tab icon were the game client's
banner icon (`wow/icon-friends.png`, INV_Banner_02, 64 px); since .111 they are the crest again, the website's one exception
(the owner's decision of 1 Oct 2026: guild.roachcouncil.com is the guide, with its logo); every account picture is the member's class icon or the
Member icon (`accountArt` in app.js; Discord's avatar fields stay in the API and the session, unrendered), and the sign-in
glyph is the community icon. The staff rank planner (`src/site-ranks.ts`, `/admin/ranks`) is a read-only page behind the
SITE_ADMINS gate whose draft lives in the administrator's browser; nothing is stored or changed on the server.

**Fewer pages.** Privacy and terms are no longer served by the Worker: `/privacy` and `/terms` (and `/tos`,
`/terms-of-service`, `/privacy-policy`) answer with a 302 to the GitHub Pages copies that the Discord application
already links (`src/policies.ts`; `src/pages.ts` is gone). There is no "Delete my data" for members any more: staff
delete on request from the admin page, as the policy says. The member pages are Home (application, votes, reserved
names, friends), Apply and Vote; old addresses (`#/names`, `#/friends`, `#/me`, `#/nominate`) still land on the right
place.

**Roles.** Sixteen positions: Raid Leader and Raid Assist are now one each for NA raids and EU raids. Leadership roles
(and Class Lead, per class) are voted on; Raider and Member are not. An application names a first choice and up to two
backups (`backup1`, `backup2`), plus "otherwise a place as a member" (`fallback`). The Worker moves old rows over by
itself (`LEGACY_ROLES` in `schema.ts`): an application's Raid Leader or Raid Assist becomes EU when its region is Europe
and NA otherwise; a write-in for Raid Leader follows the nominee's own application, NA when there is none.

**When people play.** The free-text box became a weekly grid: seven days of eight three-hour blocks, in the applicant's
own time zone (from the browser; changeable), tapped or dragged. It is stored as 168 hours of a UTC week (`avail`, 42 hex
characters) with the zone (`avail_tz`). Every conversion uses the zone's offset in one reference week after launch
(11 November 2026, winter time), so an evening means the same hours whenever it was filled in; a block shows as on when
at least two of its three hours are. From the hours the Worker counts raid evenings (`fit_na`, `fit_eu`, 0 to 7): a
night counts when at least three of its five prime hours are free, NA prime being 00:00 to 05:00 UTC (7 pm to midnight
Eastern) and EU prime 18:00 to 23:00 UTC (7 pm to midnight Central European). Admins get the sum of every open
application's grid as a heat map in their own time, per role if they like.

**The voting board.** Every open leadership application whose applicant agreed (`board_at`) is on the board under each
role it names. A card shows the Discord name and picture, class, role, region, raid evenings and the four written
answers (experience, why Olympus, leading people, the loot argument); logs, references, voice, hours, the grid, the
character and the last box stay private. A member votes for or against (+1 or −1; a second click takes it back),
never on themself, and sees only their own votes. Nobody but `SITE_ADMINS` sees any count. Each voter gets their own
order: the last six digits of the applicant's id through `a + b·x mod 1000003`, with `a` and `b` from a hash of voter and
role, which SQLite can sort and page by itself, stable across reloads and different for every voter, so nobody is first
for everyone. Twenty cards a page, with filters for class, NA or EU evenings, and "only ones I have not voted on" (whose
Next page starts after the ones still without a vote, since the voted ones leave that list). Progress counts leave the
voter out ("3 of 24" can reach the end). Reading the board needs a member in good standing: not denied, still in
Asmongold's server, at most 90 pages a minute.

**Consent.** Applications saved before .43 were written for the leadership's eyes only, so none of them goes on the
board by itself: `board_at` stays empty until the applicant opens the application, fills in the grid and saves with the
box ticked. Home tells them. A leadership application cannot be saved without the tick; choosing only Raider or Member
needs none.

**Write-ins** (the old nominations) stay, one set per role: people who should be considered, applied or not. A Discord
member written in is told the role the next time they sign in, never by whom.

**Appointed roles.** Some roles are decided, not voted on: the treasury is custody of the guild's gold, and a public
vote is how a stranger would end up holding it. `site_settings.appointed` maps a role key to the name members see
(Admin → Settings; until first saved it is `{treasurer: "Fernmelder"}`). An appointed role cannot be chosen on the
form, first choice or backup (the Worker refuses it, the page greys it out and takes a stored backup off with a
note); its board answers 409 and takes no new votes, though a vote can still be taken back; its write-ins are frozen
(what members had written in stays, and whatever a page sends for it is ignored); and it leaves "voted on" counts and
"you were nominated". Nothing is deleted, so emptying the name opens the role with everything it had. A role is
appointed only when it is decided: one that is promised but still shown as open would have people apply and campaign
for nothing.

**Admin.** Per role: every applicant with for, against, balance and who voted how, filtered by account age, days in the
server, denied or departed voters, and "only voters who applied"; applicants who left the board keep their counts. The
application page shows its counts per chosen role. CSV downloads include the board votes. Deleting an account's data
can also remove what others entered about it (write-ins, friends-list entries, references in their applications), and
the Lookup can remove those mentions for someone who never signed in, a route of its own that refuses once the account
has signed in.

**Old pages.** A page opened before an update would save an application without the grid and write-ins under the old
roles (its whole list replaces the new one). Every call sends the page's version (`X-Olympus: 2`); a save from any
other version gets 409 and the page offers a reload. The next change of shape only needs `PAGE_VERSION` raised in
`site-core.ts` and `app.js` together.

## 30 September, later: what each role involves, and three new roles (Worker .44)

**Where the new roles come from.** The community drew four org charts for Olympus: a per-guild ladder of ten ranks, a
King's Court over thirty-odd guilds, a High Council with three departments, and a council of thirty-five appointed
seats. Most of the per-guild jobs in them were already positions here under other names. Three were missing:
- **Liaison** is in two charts: a captain seat in one, and the Envoy in another.
- **Leveling Lead** is in one. At launch it is what most of the guild will be doing.
- **PvP Team** is a way in for people who come for PvP, as Raider is for raiding. It is not on the board.

The council and court seats are not positions here. They are filled by appointment, they span every Olympus guild, and
they are still waiting on Asmongold's approval. If he wants applications for them, the site needs a state it does not
have yet: applications without a public vote. Today every leadership position people can choose also goes on the
board.

**The descriptions** live beside the positions in `src/site-data.ts` (`info`: what the role is, the time, who it works
with, responsibilities, expectations). The page receives them with the other lists in `meta`, so the text the form,
the board and the Roles page show is the text the Worker ships, in one place. They are plain sentences put on the page
with `textContent`, like everything else. The tests check each role is complete. The wording is a first draft for the
leadership to change: especially the times, and the security expectations (an authenticator for the ranks that can
remove people or move gold, two-factor authentication for moderators). The draft was checked against the rest of the
site and the tools:
- The Treasurer proposes the bank's tabs and limits, because in Forever only the Guild Master can set them.
- Inactive members "can be removed when the guild is full, low-level ones soonest", because that is how the addon ranks
  them.
- The Recruitment Officer's discretion covers what applicants tell the leadership privately, because leadership
  applications are on the board.

**Where people read them.**
- On the application form, every choice has "Details". This is a button beside the card's label, not inside it,
  because a second control inside a label is invalid and would also toggle the radio. It opens the description in a
  dialog named by its heading, which can make the role the first choice (never the role already chosen).
- Above each voting board, the role's first sentence, with the rest behind "Time, responsibilities and expectations".
- On the Roles page (`#/roles`), everything, with a link per role.

**The Roles page is open to everyone.** It is the one page the router lets through without a session. It holds nothing
personal, and people should be able to read what a role involves before deciding to sign in.
- `#/roles/<role>` scrolls to that role under the top bar and moves the focus there. It scrolls once more when the game
  fonts arrive (they change the page's height), unless the reader has scrolled in between.
- "Apply for this role" opens the application with that role as the first choice. This happens only for someone with no
  application, or a withdrawn one; a backup that is the same role comes off, and a Class Lead link can name its class.
- Signed out, the same button is "Sign in to apply". Discord's sign-in always comes back to "/", so the role waits in
  that tab's `sessionStorage` and is used once. With storage off, the visitor simply lands on Home.

**Old pages.** A tab opened before .44 has the old lists. The server accepts what it saves, but if one of the new roles
ever becomes the board with the most applicants, `#/vote` in such a tab fails until it is reloaded (the tab opens on the
busiest board and does not know that role). From .44 the page picks the busiest board only among roles it knows, so the
next new role cannot do the same.

## 30 September, evening: roles without a public vote, the Co-Guild Master and professions (Worker .45)

**Why.** The community's Rank Codex (fifteen rank ladders for a Forever guild) has a Co-Guild Master in ten of them. It
is a role people should be able to apply for, but not one for a public vote: a second in command is the Guild Master's
pick. The .44 notes above named the missing state, applications without a public vote. .45 adds it as a setting rather
than as part of the role, so the leadership can use it for any leadership role, or for one class's Class Lead, and put
a role back to the vote later. The Codex's crafting ranks became a question instead of a role: which professions each
applicant plans to take, which is what the Profession Coordinator needs to plan the guild's crafting.

**The setting.** `noVote` in `site_settings`: a JSON list of role keys, cleaned to real roles in the board's order, and
`["co_gm"]` until it is first saved (as the appointed Treasurer is the default for that list). For a role on it:
- the form offers it and asks the leadership questions, but asks for board consent only if another chosen leadership
  role is voted on;
- `GET /api/board/<role>` answers 409 `no_vote` (the page shows a note in place of the board), votes are refused except
  taking one back, and write-ins are frozen as an appointed role's are (kept, and counted again if it goes back to the
  vote);
- the public board summary shows no counts for it, nor for an appointed role: how many applied is the leadership's
  business;
- `/api/me` leaves it out of "voted on" and "you were nominated".

An appointed role is closed altogether, so appointed wins where a role is both.

**Consent stays per application.** `board_at` is one time for the whole application, and every board query leans on
it. Consent per role would have to thread through all of them, for a case that needs an admin to put a role back to the
vote. So when that happens, applications that chose the role and agreed to the board for another one are listed under
it at once. The form says so beside the box ("If the leadership puts it to the vote later, it will be"), and so does the
Settings text. Applications that chose only roles without a vote never agreed, and stay off the board until they are
saved again with the box ticked; Home asks them to, as it asked the applications saved before .43.

**Pages older than the list.** The settings travel in the page's boot data, so an open page can be older than the list.
The Worker decides, and the page recovers:
- a board load that answers 409 redraws the page, if it is still the one on screen;
- a refusal for a missing board tick carries the current list, so the form shows the box without losing what was typed;
- write-ins the Worker ignored for a role that closed are reported, and the page is redrawn.

**Professions.** `PROFESSIONS` in `src/site-data.ts`. Forever is the original game: nine primary professions (a
character learns two) and three secondary ones, and no Jewelcrafting or Inscription. They are stored in
`answers.professions` in the list's order and checked on save (known keys, each once, at most two primary). A save with
no `professions` field at all keeps the stored ones, because only a page from before .45 sends none; the .45 form always
sends its list, so an empty one clears it. They stay with the leadership like every other answer but the four written
ones on the board. The admin table, filter and download column read the JSON with SQLite's `json_each` (with
`json_valid` in front, so an odd row reads as none). That is cheap at the site's scale; at many thousands of
applications, a column filled at save time would be cheaper.

**Marks and icons.** The party leader's crown (`UI-Group-LeaderIcon`, already in the set) marks a role without a public
vote, as the ready check's tick marks an appointed one. The Co-Guild Master has a gold crown (`INV_Helmet_96`) beside
the Guild Master's silver one. The professions use the game's own profession icons, which is why Engineering's gear is
also the Profession Coordinator's.

## 30 September, night: what each role comes with in game (Worker .46)

Each role's description gained `game`: the guild rank it comes with and, where there is one, its title in the Olympus
addon (the census addon most of the guild runs, `github.com/dnl-gentile/olympus-addon`). It sits with the other facts
(time, who the role works with) and reaches the Roles page, Details and the board like them.

The mapping, with the ladder proposed for release: Co-Guild Master, Officer, Recruitment Officer, PvP Leader and
Liaison hold the Officer rank. That makes them the addon's Captains, the rank right below the Guild Master in every
Olympus guild: the Captains chat, Call to Arms and Muster, loot notes and recruits' join requests. The Liaison also
needs it for the Lords chat, which holds the guild masters and the officers of <Olympus>. The Co-Guild Master can
further be the King's Steward, whom the addon's author names on a signed list. Raid Leaders and Raid Assists hold the
Raid Leader rank. The Treasurer holds the Treasurer rank, though the addon's treasury follows his character, not the
rank. Guild Masters of the later guilds are the addon's Lords. Class Lead, Loot Council, Community & Events Lead,
Leveling Lead, Profession Coordinator and Discord Moderator have no rank of their own. Raider, PvP Team and Member are
the Raider and Member ranks.

Why Officer second, not Treasurer as first drafted: the addon fixes its Captains at rank index 1 so that every client
agrees on who may send what. With the Treasurer rank there, the Treasurer would have been the Captain and the officers
nothing. Ranks only act on ranks below them, so officers can now demote the Treasurer's character. The rank carries
bank limits, not the treasury.

## 30 September, late: the interactions door (Worker .47, first consolidation batch)

Olympus Verify and Olympus Forever are being merged into one application (the owner's brief of 30 September; the task log
is `Olympus/consolidation-2026-09-30/claude_code_x_codex.md`). Olympus Verify is the keeper; what Forever did better is
brought over piece by piece, each as its own reviewed commit. This is the first piece, chosen because it changes nothing
for valid traffic and closes a real gap: `verifyInteraction` checked the Ed25519 signature but not the timestamp it
signs, so a request captured in transit could be replayed indefinitely. Now the timestamp must be within 300 s, the
body is capped at 128 KiB before it is decoded, the payload must name this application, and an interaction id is
written to `seen_interactions` before a command, button or form runs and refused if it is already there. The ledger
keeps an hour and the cron trims it. Discord's own window for answering an interaction is three seconds and its
signature timestamp is the send time, so the 300 s window costs nothing in practice and the hour is margin.

Codex's review of the first cut found the ledger's contract incomplete: the id was claimed before the handler ran and
never given back, so a request that failed before doing anything (a transient D1 error) left its id burned, the person
got a bare 500, and an exact retry got an unexplained 409. The ledger now keeps the handler's answer with the claim: a
repeat gets that answer back and runs nothing, and a duplicate that arrives mid-run gets 409. For a handler that
throws, two contracts were on the table. Releasing the claim lets an exact retry run again, which is what .46 allowed
for every request; but it also lets a captured copy of a half-completed command run its effects a second time, and a
captured-request defence that re-runs effects is not one. So the claim is kept and filled with one fixed ephemeral
reply that asks the person to run the command again: the person is never stranded (they see a real message and a way
forward, and their fresh command is a new id), and the failed request's bytes can never do anything again. The cost
is one extra command press after a transient error, which is the right side of that trade.

## 30 September, late: Battle.net data has a clock (Worker .48, second consolidation batch)

Olympus Forever had the rule; Olympus Verify did not. Blizzard's terms give data obtained from their API thirty days.
Forever's answer was "the role follows the link": reconfirm every 29 days or lose Guild Member. That was the right
answer for Forever, where the Battle.net link was one of the three admission conditions; it is the wrong one here,
where since .32 the in-game whisper is the proof and the link is an optional marker. Re-gating admission on Battle.net
would reintroduce the outage that .32 ended. So only the retention half is ported: the record expires, the person is
told when, nothing else moves. Codex agreed the scope in the consolidation log (30 Sep, 23:28 UTC) and added the two
points the build honours: a stale row is treated as absent at read time even before the cron gets to it, and the purge
never invents a timestamp for a row that has none.

The one wrinkle is the ban. "Their BattleTag stays on record" was how a ban stopped the same Blizzard account coming
back under a new Discord account, and a tag that must go after 29 days cannot do that job. A keyed fingerprint of the
tag can: it is not the tag, it cannot be turned back into the tag, and it answers the only question the ban ever asked
("is this the same account?"). Whether Blizzard's terms count a one-way keyed digest as their data is a reading for
the owner; the code is written so that dropping the fingerprint is one statement if he reads it the other way.

## 30 September, late: the Worker knows which door a request came in by (Worker .49, third consolidation batch)

A Worker answers on every hostname Cloudflare routes to it, and until now this one answered the same way on all of
them: whichever host was not the site got the bot's routes. The hostname swap makes that untenable: the old site host
must keep working as a redirect, the new one must be the site, and nothing else should get anything. So the first
thing `fetch` now does is name the host (site, bot, legacy, unknown) and act on the name, before the database is even
opened; an unknown host costs one string compare. Olympus Forever's canonical-host guard is the ancestor, adapted to a
Worker with two legitimate hosts instead of one. The other four changes in this build are Forever's too: a public
`/health` that says only "up, this build", a watcher token that cannot be empty, credentials that never follow a
redirect, and a 500 that carries an id instead of the error. None of them changes a valid request.

## 1 October: the ban lets go of the tag, and every copy gets a clock (Worker .50)

.48 tried to keep one thing past the 29 days: a keyed, one-way digest of a banned member's BattleTag, so the same
Blizzard account could not come back under a new Discord account. Codex's review put the objection in one line: an
identifier derived from API data and kept indefinitely is an API-derived identifier kept indefinitely, whatever the
function in between, and the retention contract is 29 days for all of it. The counter-question is what the digest was
buying. Since .32 the link grants nothing: admission is the in-game whisper, the ban binds the Discord account and the
characters bound to it, and a banned person's new Discord account still has to whisper a code from a character an
officer can see. The digest closed a door the ban no longer guards. So it goes, the column with it, and the ban reply
says what it binds.

Codex's second reader then went looking for every other place a tag could outlive its record, and found the ones a
purge of one table cannot see: the ban card and the staff log (persistent Discord messages), the linked-role record
in Discord (pushed with the tag as `platform_username`; it now says `linked`, written every time so an earlier copy
is overwritten whether Discord merges or replaces on PUT), a stored `/verify-status` answer in the replay ledger
(replayed with the tag three seconds after the record expired), a far-future timestamp (stale to the readers, kept
forever by the purge, shown in `/health` as a negative age), and the dormant Phase 3 path, which, had it ever run,
would have scattered API-derived names and levels across characters, pending rows, the invite queue, the audit and
roster snapshots. The answer in each case is the same shape: the copy is either not made (the card and log say
"linked until", the record carries the flag and the word `linked`, read-only commands are answered afresh instead of
stored), or it is
given the same clock as the original (far-future rows are purged, every kind of leftover is counted in `/health`), or
the path that would make it is removed (Phase 3). The one copy none of this reaches, the tag already sitting in
Discord's own record from an earlier link, is named for what it is: `/verify-status` tells everyone who ever linked
how it goes away, and the privacy policy says the same. A contract that is finite and true beats one that is
comfortable.

## 1 October: the runtime has the last word (Worker .51)

Four builds in a row passed every suite and would not have started. The suites transpile `src/*.ts` and run it in
Node against SQLite, which is the right way to test what the code does; it is not a test of what workerd will accept,
and workerd does not accept a module entry that exports a string. Codex found it by doing the one thing the suites do
not: taking the exact bundle `wrangler deploy --dry-run` writes and loading it in the workerd that ships with
wrangler. That is now a suite of its own, last in `test:all`, with a real D1 behind it, so "the schema applies itself"
is also proved where it will happen. The other changes in this build are the same lesson at smaller scale: a log line
is only hygienic if the provider that keeps it never sees the message, so it gets a category from a fixed list and
nothing derived from the text (a digest of a six-character code is the code, one brute force later); a legacy host
is only safe if it refuses to forward the one request that carries a code; a host check only holds if every request
passes through it, files included; and Discord's record of a connection is only known to be clean if Discord says so
after it was deleted and rewritten. Each of these is checked where it is true, not where it is convenient.

## 1 October: the donor's modules get a keeper-shaped door (Worker .56)

Olympus Forever's community modules (directory, calendar, trials, ledger, intake, rights) were written against
Forever's own idea of a member: a Battle.net-linked account with an officer approval, a database session, milliseconds
everywhere, and a role engine of their own. None of that survives the port, and the plan was never to carry it. What
survives is the modules' care about writes: nothing is saved unless the writer still qualifies at the moment the row
is written, and every later statement of the write is tied to the first one by a random nonce. .56 re-expresses that
care in the keeper's terms. The identity is the keeper's cookie; the facts are the keeper's tables (the roster-confirmed
character is the proof, as everywhere else since .32); the capabilities are names for requirements, not grants; the
fence is a SQL fragment the first statement carries, so the check and the write are the same statement; and every
feature registers how it is erased and exported before it may store a row. The eight batches that follow are each a
module walking through this one door.

## 1 October: a budget counts requests, not calls (Workers .95 and .99)

.90 gave every role-writing run a budget of Discord calls so that one sweep or one roster export could not exhaust the
free plan's fifty subrequests. Codex's review showed the count was of the wrong thing: `rest()` retries a 429 once, so a
"call" could be two requests, and the guild-roles inventory read and the removal a grant owes after a ban were requests
nobody counted. .95 counts REQUESTS (`attempts`), keeps `calls` and `retries` beside them for the receipts, lets `rest()`
charge its own retry against the budget it is handed (and refuse a retry the run cannot afford, unless the call is a
mandatory removal, which is never skipped), and makes every caller reserve a whole account before its first request: two
requests per call, the inventory read when it is due, the fresh look, the PUT and the removal it may owe. A stop therefore
never leaves an account half-handled. .99 closed the other gap in the same place: a lookup Discord did not ANSWER (a 403,
a 500, a dropped connection) is not a finished account. The sweep's promotion watermark and rotation cursor hold before
it, the backfill page stops at it with the reason, and a 404, which is an answer, stays finished. The principle both
builds share: a counter that is not what the provider meters, and a "done" that was really "unanswered", are the same
mistake, a record that says more than the run knows.

## 1 October: the pages are tested against the Worker they talk to (Workers .93 to .100)

The donor's community modules arrived with eighteen member, organizer and staff surfaces that had no page in the keeper.
.93, .96, .98 and .100 give them pages in the keeper's own script, and the question was how to test a page without a
browser in CI. The answer is a minimal DOM in `tests/frontend_check.cjs`: elements, text, events that bubble and submit,
a selector matcher, `dataset`, `<dialog>`, `location` and `history`, enough for the real `app.js` to run in a fresh
context whose `fetch` is the real Worker over the real schema, as the signed-in person the check names. The checks then
say what a reviewer would look for: the stored row after a click, the redrawn badge, the words of a refusal, the absence
of a Discord id on another member's screen. Codex's review of .93 found what such a harness cannot see on its own: what
the page does when the answer to a write is lost. .100 settles that: an operation whose answer was lost freezes the exact
bytes it sent and locks the form; the only actions are to retry those bytes (the Worker answers a stored operation with
its original receipt, never doubling) or to check first whether it was stored; a definitive refusal unlocks the form with
its reason; a committed reply is acknowledged outside the conversation, so a later read that is refused or finds nothing
clears what is stale without erasing what is true. The harness learnt the trick too (`page.drop`): it lets the Worker
handle a request and throws the answer away, which is exactly the lost answer.

## 2 Oct 2026 (.114): the owner's ten requests, and the choices behind them

the owner's items of 2 Oct about 17:25 UTC, the answers he gave through Codex (log 17:42, 17:57 and 18:26 UTC) and Codex's
provisional source review (18:47 UTC). What the code does is in `docs/deploy-checklist.md` ("Worker .114"); this is why.

**The header picture is an identity exception, not art.** The official-assets rule (.86, .111, .112) is about the site's
interface: every frame, icon and font comes from the game client, the crest is the one non-game image. the owner's own Discord
picture in his own top bar is not interface art; it is who is signed in. So it gets its own narrow door: one CSP host,
avatar paths only, header only, a game-icon fallback. Showing members' pictures to each other (the voting board, the
pickers) would be a different decision with a different privacy text, and was not asked for.

**The footer keeps "Private request" for strangers.** the owner asked to hide the policy and data links from the public. The
private request form exists for people who can no longer sign in with Discord, and nothing else on a signed-out page links
it, so hiding it would hide the form from exactly its people. The policies stay at their addresses, which the Discord
application links (Discord's developer terms want the notice reachable from the application, which it still is).

**The Battle.net switch cannot get ahead of the policy.** the owner wanted no retention text while the login is useless, and a
login that is "ready, switched off in admin settings". Those two meet in one rule: switching on needs the privacy policy to
describe the login again, detected at build time from a marker in policies/privacy.html. The .114 policy has no such
section, so in .114 the switch can only be off; the next step is a reviewed release that adds the section, then the box.
Codex asked (18:47 UTC) for an "on" policy variant served only while on; that would put a database read into the policy
route, which .65 keeps free of state, and the Pages mirror could show only one variant, so the dependency on a later release
is stated instead. The off state also had to be honest about the past: Codex measured 264 member rows still carrying older
link fields (19:12 UTC), so the policy keeps one sentence that they are deleted automatically within 29 days of each link,
and the purge stays unconditional. An immediate purge was not chosen: it cannot be undone and the owner has not asked for it.

**A rename Blizzard required is decided by a person, for one character.** The roster cannot tell a forced rename from any
other, and an ordinary rename must keep the link (27 Sep: the link follows the GUID), so nothing is inferred. When an
administrator marks one, the owner's rule applies: the member applies again, with a new application and a fresh in-game
verification, and approval waits for both to have actually happened (Codex, 19:17 UTC: accepting the old row or clearing the
hold is not enough). The decision resolves exactly one current character by its GUID and refuses anything ambiguous. My
first version held the whole account; Codex's review (18:47 and 19:17 UTC) asked that a legitimate other member character
keep Guild Member, which is fairer to a member whose main is in the guild, so the role is held only where no other member
character supports it. The hold sits in the one role writer (roles.ts) rather than in a new character status, which would
have touched every status list; the one-time removal at the decision is the only new remover, and the grant path re-reads
the hold after its PUT, as it re-reads the ban (.60), so a grant in flight cannot undo a hold.

**The beta reset clears assignments, not history.** "All roles reset" was narrowed by the owner to guild ranks and leadership
assignments. The site holds two such things, the appointed roles and the new I-X directory, and the reset clears exactly
those; applications and votes are evidence and stay. It is armed by a recorded closing moment in the past, because Blizzard
gives a last day and no hour, and a timer would guess, and it runs once, admitted in SQL against the moment the page
showed, so a stale or replayed request cannot wipe appointments made after it. Ranks in game and the Discord leadership roles are changed by people:
the site cannot change game ranks, and the bot's role sits below those Discord roles on purpose (D03).

**The I-X directory grants nothing.** It is a list of names for members to read. The Council in Discord is reached by roles
given by hand after each person is reviewed; neither the directory nor the Council roles feed the bot's officer checks,
SITE_ADMINS or COMMUNITY_ORGANIZERS, so leaders of later guilds never gain access to Olympus I's member records.

## 3 Oct 2026 (.115): a full guild said plainly, News from what the Worker already knows, and typed names

**Takeover qualification (3 Oct 2026).** The owner instructed Codex to finish after Claude's usage limit without dual
sign-off. Interrupted .115 work is preserved at local checkpoint `568c76d958eeee2f2786798bd959b0b2ae8ec299`.
Descriptions, cost figures and recorded checks below retain that work's history; they are not a new source freeze,
deployment or final-version acceptance. Codex must qualify the final commit/tree with attributable peer evidence and
the same applicable release/live gates. This batch changes no budget figures or caps pending the roster author's result.

the owner's request of 2 Oct (task log 23:41 UTC) and his answers of 3 Oct (about 02:30 UTC, log 02:34 UTC), built from a
plan that three adversarial reviews went over. What the code does is in `docs/deploy-checklist.md` ("Worker .115"); this
is why.

**Only the latest snapshot decides whether Olympus I is full.** An older trusted export that read 1000 says nothing
about today once a newer export is distrusted, unfinished or unchecked; skipping back to it would announce "full" from
evidence the house itself has stopped believing. So the latest row decides or nothing does, and "unknown" makes no
claim. The officer's view says why it is unknown, in words, with the remedy where there is one.

**Trust is judged against the last trusted export, and a refresh never raises it.** The roster guard compares each
export with the previous one, which is right for removals but not for a count: after 1000 and a distrusted 850, an 851
is a 0.1% change from its predecessor and would be trusted, although the guild never proved it shrank. Seats and figures
therefore read a `trusted` column judged against the last trusted, complete export, and an identical re-export (which
only moves `received_at`) can lower it but never raise it. The person who says the shrink is real is the officer who
runs `/olympus-admin sync`, which is already the house's remedy for a large shrink; it now vouches for the export and
audits that it did. The ingest's own decision still alone decides removals.

The review of 3 Oct 2026 closed two gaps in that rule. The base is applied whenever the previous row is not itself
trusted, which includes a row from before .115 and an unfinished one, not only a distrusted one; and rows from before
.115 are re-judged in order (a row the ingest never distrusted counts only when it is within the limit of the base
before it), so a chain such as 1000, 850 (distrusted), 851, 852 written before .115 cannot make the 852 look like a
trusted count. The base is also kept to exports on or after `LINKS_NOT_BEFORE`: the beta's last 1000 is no evidence
about live, and as a base it would distrust every export of the launch ramp below 900 and leave News without a roster
base. With no base after the cut, the ingest's own decision (the floor, and the shrink against the previous row) is what
the row records.

**A snapshot counts only once all of it is in.** The snapshot row is written before its member rows, in batches; a
reader between two batches would see a 1000-member export with 300 members stored. The row is born `complete = 0` and
stamped `complete = 1` with its trust inside the last member batch (the review of 3 Oct 2026: a stamp of its own could
fail after every row was in, leave the row unfinished for as long as the roster stayed the same, which in a full guild
is long, and tell the watcher the export had succeeded). A failed last batch now takes the snapshot back out and the
watcher retries. A row still unfinished ten minutes after it arrived was left by an isolate that stopped between
batches; it reads "stuck", the next export writes the roster again in full even when it is identical, and sync vouches
for it once all its member rows are there. A row from before .115 is back-filled once, from its own `roster.distrusted`
audit and a member count, and a failed count leaves it distrusted: no row becomes trusted without evidence. Since
Codex's finding 2 (3 Oct 2026, 13:15 UTC) a failed count also leaves it unfinished (complete 0, at once "stuck"), and the
stamp in the last member batch proves inside that transaction that the stored rows number `member_count`: complete 1
always means every member row is there, so the seat count can never rest on an inflated count.

**Sync decides before it acts** (Codex, 3 Oct 2026 13:15 UTC, finding 1). `/olympus-admin sync` removes the role from
every member character missing from the latest snapshot, so a sync over a snapshot whose rows were still arriving, or
were never all stored, would strip people who are in the guild and merely absent from the unwritten part. It used to
apply first and refuse to vouch afterwards, which protected the seat count and nobody's role. Admission is now decided on
the exact rows the sync would apply, before any link, character or role effect: still being written, or fewer rows than
the export listed, applies nothing. The override the command exists for stays: a fully stored export that is distrusted
for its size is applied when an officer says so, because the officer is the evidence that the guild really shrank.

**Duplicate names are refused, not collapsed** (Codex, 3 Oct 2026 13:15 UTC, finding 2). The bot tells characters apart
by the normalised name everywhere (the roster's key, `characters.name_key`), so an export naming one key twice is a roster
it cannot represent. Collapsing it would keep one row while `member_count` counted both, and choosing which of the two
GUIDs is "the" character would be a guess the identity rules would then act on. So the whole export is refused before
anything is read or written, as final (a 422 the watcher does not retry), and the last export stands: fail closed. The
cost is that roster-driven changes stop for the whole guild until each name appears once, which is why staff are told
every six hours and the runbook gives the officers' remedy (section 10). The second review round (3 Oct 2026) made a
stamp that still finds the rows short after every batch committed the same kind of final refusal: sending the same
export again would store the same rows, and a 500 would make the watcher hold every later post behind it.

**A full guild's export is bounded in the conservative accounting model** (the second review round, 3 Oct 2026).
.115 charges every source-level statement attempt, including each batch element, against its 1,000 accounting ceiling;
it initially bounded only the cron. One INSERT per member made a changed 1,000-member export 1,007 accounted attempts,
over that ceiling exactly when the guild is near its cap. Each member batch
is now one `INSERT ... SELECT` over `json_each` of its 50 members (the house pattern of the departure intake), in the
same batches with the stamp still last, so such an export is a few dozen accounted attempts. This is a deliberately
conservative source/test bound, not a provider-confirmed aggregate-batch accounting claim; batch atomicity is unchanged.

**A full guild's effects are a worklist, admitted before they start** (Codex, 3 Oct 2026 16:48 UTC, finding A; his
child's review115/provisional-9fed-backend.md, section 2). The storage fix bounded only the rows. The diff after it still
applied every member's effect in the same invocation: a promotion is a character and queue batch, the role writer's
reads and audits, role.deferred and roster.member, and the role writer's call budget bounds Discord requests, not
statements. A complete roster of 1,000 links that had all just verified (launch day) with ROLE_CALL_BUDGET 4 needed about
4,000 statement attempts and failed partway, after the snapshot was already stamped complete, so some effects were
applied and nothing said which. A per-member check inside the loop would not do: it stops a loop that is already
mutating. So the effects became a durable worklist (`src/roster-effects.ts`, `src/roster.ts`):
- A run is the diff of one complete snapshot, made in the transaction of the snapshot's complete stamp, with the
  snapshot its departures are judged against and the ingest's own trust decision. A complete snapshot always has its
  run; a refused stamp leaves neither.
- The run is derived in a bounded number of statements, one batch: the GUID pins, the returns and the first absences in
  bulk with their audit rows (a statement per 500 members), and every effect that needs Discord (a promotion, an
  officer's D: note, a confirmed departure) written as an item. Those three kinds can be derived again from the newest
  roster and the current links at any time; a first absence cannot (it needs the snapshot before), which is why it is
  applied inside the derivation and never left as an item.
- Items are applied in slices. Every statement attempt of the invocation is counted, and before each item its kind's
  worst case (promote 15, note 17, departure 6, a deferred grant's promotion 11; measured one item apart on their
  costliest paths) is admitted against what the invocation has left after what it still needs. An item is claimed in
  the transaction of its database change, so a fault before that commit leaves it pending and one after it never
  repeats it; what follows the change (the grant through the one role writer, the audits, the welcome) is best effort as
  before, and a grant it defers is the role sweep's.
- Every export (changed, identical or the same one retried, which no longer just answers "older") and every cron run
  applies a slice; the cron's is a line of the scheduled budget (40), so a backlog is worked off between exports too.
  /ingest/roster may spend the 700 target less a cold schema check, /olympus-admin sync 20 less again, and a sync says
  how many effects are "not applied yet" and continues where the last one stopped when it is run again.
- A newer run supersedes an older one: every derivation statement and every claim requires its run to be the newest
  and its snapshot the newest stored, so nothing of an older export is applied once a newer snapshot exists, even one
  still being written, and the newer run derives whatever is still due. A link no longer on the newer roster is never
  promoted from the older one.
- `roster_effect_runs.done_at` records that the backlog is empty. A snapshot's `complete` still means only that its
  rows are stored, and the fingerprint only that an identical export needs no new rows.
- A stop between the stamp and the derivation is resumed by a later export (after the ten-minute grace, when no other
  export can still be deriving it), and a newer export judges departures against the last snapshot whose diff was
  applied, so the first absence that snapshot saw is armed rather than lost (the previous code would have compared it
  with the stopped snapshot and armed nobody).
- The identity rules are admitted the same way: each release and rename at its worst case, the rest held exactly as
  they are for the next export or sync, and the namesake sightings of a realm move written in bulk.
The worklist holds the same data as the bot's own verification rows (a name key, a name, an account, a GUID), only while
an item is pending: a slice removes the items it finished, a newer run removes an older run's, and finished runs keep
counts and times for 14 days.

**Forty-eight hours for a count, twelve for a presence.** `ROSTER_SEATS_FOR` sits beside `ROSTER_CURRENT_FOR` because
they answer different questions: one person's presence changes from hour to hour, a seat count only when someone joins
or leaves, so a count up to two days old still describes the guild's room. The age is taken from the earlier of the
export and arrival times, so an officer's clock running ahead cannot make a roster look newer. `LINKS_NOT_BEFORE` is
kept: the beta's last export is no evidence about the live guild.

**A refused invite counts only when it is newer than a roster that decides.** An invite refused for space at 14:00 is
answered by an export at 15:00 that counts 995; the reverse order means the guild filled after the export. When the
latest export does not decide (none, unfinished, unchecked, distrusted, before `LINKS_NOT_BEFORE` or stale), a refusal
of the last six hours on or after `LINKS_NOT_BEFORE` stands on its own, whatever its order against that export. Six
hours is how long the old `guildIsFull` already believed a refusal. On `/verify-status` a refusal recorded on the
account's own queue row says "full" only while the seat state does not say open: a later trusted roster with free seats
outranks it.

**The cap can only make the bot more careful.** `GUILD_MEMBER_CAP` accepts 900 to 1000; anything else is reported as
invalid and the game's 1000 is used, so a typo ("10", "1e3") can never announce a full guild. An invalid value is not
"unknown" (the review of 3 Oct 2026 asked; the plan's rule stands): with 1000 the guild can be called full only at the
game's own limit, and the bearer `/health` shows `capConfigured: "invalid"`, so the typo is visible while the seat line
counts against 1000. It lives outside both wrangler files because the applied profile is bound by hash and the key is
not an activation key.

**Members see the hour, staff see the minute.** An exact export time tells everyone when the officer was online.
Members' times are rounded down to the hour; staff views keep exact times, as they keep exact times everywhere. A place
in line reaches only its own account, computed from that account's own queue rows, never from another account's row that
carries the same name.

**The texts promise only what the bot does.** Being full costs no invite attempt (a refusal for space is a free miss in
the ingest), the bot removes nobody, and officers may remove inactive characters, so the paragraph says exactly that and
says reserved names go first. It does not say that a code stays valid, nor that nobody leaves the guild (officers may
remove characters), and it does not promise a date.

**News is site content behind a switch the owner holds.** It is kept by `SITE_ADMINS`, like the leadership directory, so
it is a `site-*` module with `site_*` tables on the community primitives (the fence, the nonce, the data registry)
rather than a community feature behind `COMMUNITY_FEATURES`, a wrangler key that needs a reviewed deploy to change. The
switch, `SiteSettings.newsOn`, is off by default and a missing row is off, so the deploy itself shows nothing new; the
owner turns it on in Admin → Settings at action time. Every write judges the switch inside its statement, and since the
review of 3 Oct 2026 the members' read judges it inside its admitted batch too, so a page read racing "switch off"
receives nothing. Since Codex's finding 4 (3 Oct 2026, 13:15 UTC) that includes the cron's own write: the figures'
compare-and-set carries the switch, so a run that read "on" and is switched off before it writes stores nothing
("superseded"), and "off" means no new figures from that moment, not from the next run. Codex reviews this placement
with the source.

**What News shows is what the Worker already knows, as counts.** Release notes from source, the seat state on the hour,
event titles and times, when the directory changed (never its names, and on the hour like every staff-activity time
members see), roster joined and left counts, application counts and the beta's dates. No officer digest state appears:
its meaning to members was ambiguous, and the owner's daily issue stays private (log 23:41). Application counts from one
to four are shown as "fewer than 5": in a guild this size "one decision today" can point at a person. The labels say
what is counted ("first saved", "decision last saved") because an application is one row per account that is saved
again, and no audit row marks a first save.

**A deleted notice cannot come back.** The site's lost-answer pattern (.100) freezes the exact bytes of a create and
lets the administrator "Retry the same". Without a record of the operation, a retry after a delete or after expiry would
insert the notice again. Every create therefore leaves a row in `site_news_ops`, kept 120 days after posting and never
deleted while its notice exists; a retry meets it and is told "deleted" or "expired". A record kept for ever would grow
without end, and a finite one alone is not enough (Codex, 3 Oct 2026 13:15 UTC, finding 5): once the cleanup had removed
it, a page left open longer could post the notice again under the same id. So the id itself carries the time it was
handed out (`GET /api/admin/news`, the database clock) and creates only within 30 days of it. A create is never earlier
than its id and its record lives 120 days from the create, so every id still accepted meets the record of any earlier
create under it, and an id old enough for its record to be gone is refused for its age. That pair of numbers, not the
record alone, is the boundary the policy states. A replay of the same text by the same author is answered as a replay
only after `communityStaff` is checked again, so standing lost since the first try is not bypassed. A stale delete of a
notice whose time is up answers with its id and revision only (finding 3): past its time a notice is gone from every
read, and a refusal must not be the one door through which its text still comes back.

**Lifetimes are computed by the database.** A notice lives 1 to 90 days from the time the database gave its operation
record, `retain_until = created_at + days * 86400` in SQL, with a CHECK that it is later than `created_at` and at most
90 days after; every read compares with the database clock. An administrator's clock running fast or slow cannot stretch
or shorten what the policy states.

**The figures are cached and throttled.** The scheduled run already makes about forty D1 round trips with every
community feature on. The figures run at most every three hours, only while News is on, and the anti-joins run only when
the snapshot ids they compare have moved; the switch and the cached row are read in the cleanup's own batch, so a run
while News is off or the cache is fresh adds no round trip of its own. The write is a compare-and-set on the row read
and on the switch (finding 4 above), so neither a concurrent run nor a switch-off during the run is overwritten. The measured cost is in the deploy checklist, and
Codex confirms the account's per-invocation limit against it.

**The scheduled run has one conservative statement-attempt budget** (Codex's finding of 3 Oct 2026 13:26 UTC).
The source/test model charges every attempted statement, each batch element included, and composes the schema check,
cron and all jobs it starts into one budget. It does not establish the provider's aggregate-batch counting rule.
Round trips alone were an insufficient bound: with a large backlog the weekly obligation opener alone could
issue 1,201 accounted attempts and the profile cleanup 604; a composed run over the accounting ceiling cannot be qualified.
So every workload that grows with the data is capped per run in one table, `src/scheduled-budget.ts`, beside each job's
worst case counted from its source (failed audits and a cold schema check with every column missing included), and the
caps keep the sum at or below 700 of the Paid plan's 1,000 (it is 694 with the roster effects' slice of 40 since the
third review round; 652 before): a margin for later changes, not measured provider-internal retry accounting.
These interrupted-work figures need final exact-head requalification after the roster correction.
A cap spreads work over more runs and never drops it: each capped job continues in a fixed order on the next
run, every 30 minutes, which the policy's sentence about bounded batches already covers. The opener checks the policy
once per run instead of once per account, and its scan leaves out an account id it cannot use, so such an id never
holds a slot. A new job, a new column or a raised cap changes the table first; `tests/scheduled_budget_test.cjs` holds
the real run to it.

**Typed names are counted, never written into the log.** The dated log outlives an erasure, so a name typed into the
settings and copied into the audit would survive the request that removed it. The settings audit now records role keys,
a count and booleans; the older rows are rewritten to the same shape once (the owner's answer 4), behind a marker, and
the private pre-deploy export keeps the old rows only until it is destroyed (the owner keeps only the newest verified
export until the launch is accepted, answer of 3 Oct 2026). Consent is an attestation:
the server checks that the box was ticked, not that the person agreed, which is why the runbook says to ask first. "Name
withheld" exists so that removing a name on request does not reopen a role the guild has filled.

**The rewrite is checked after the deploy, not assumed from it** (Codex, 3 Oct 2026 13:24 UTC). It runs at an isolate
start, and a failure only logs and leaves the marker unset for a later start: holding the bot, the watcher and the site
at 503 over a log rewrite would be the wrong trade. The price is that installing .115 proves nothing about the rows, so
the policy says the owner checks, and the checklist makes a counts-only read (the marker, rows still carrying a named
`appointed` field or a notice's text, rows that are not JSON) a mandatory acceptance gate. The marker records one run,
not the shape of later rows: an older writer resumed after it (a .114 isolate finishing a save during the deploy, or a
rollback to .114) writes the old shape again, and nothing reruns the rewrite until the owner deletes the marker. So that
read follows every deploy, roll-forward and restore, and Settings are not saved in between. The backup comes before the
deploy because the rewrite is irreversible and that export is then the only copy of the older rows.

**A restore puts the typed names back as they stood** (Codex, 3 Oct 2026 13:26 UTC). The policy promises that deletions
made since a backup are repeated before a restored site is used, and the runbook replays them from the audit. Typed
names cannot be replayed that way: their audit is counts only, by the rule above, and writing the names into it so that
a replay could find them would undo that rule. They live in two `site_settings` rows, so the bounded mechanism is to
keep those two rows privately after actual write-quiescence evidence and write them back, through no Worker route and
so through no audit, before the site is used. That preserves the latest requests only if all prior critical writers
have completed or been definitively canceled and exclusion remains through replacement/replay/read-back/reopening.
Without that proof the restore is refused; unchanged captures do not establish it. The statements are made
by SQLite's `quote()` from the rows themselves, so no hand-typed literal can garble a name; a missing row becomes a
DELETE, because a missing `appointed` row means the default appointment. The marker is not copied: a copy from before
the rewrite needs the rewrite, and the read-back decides.

**News notices across a restore** (the second review round, 3 Oct 2026). The replay re-ran only the deleted notices, so
a notice changed on request since the copy (a name taken out) came back with its earlier text, and a notice posted and
deleted since the copy had neither a row nor its operation record there: a page opened before the restore, holding a
frozen "Retry the same" inside its 30 days, would post it again. Keeping the live notices privately and writing them
back was the other way; it was not taken, because it would put notice texts into a private file and a restore does not
need them. The audit already holds each notice's id and the time it was posted, changed or deleted, never its text, and
that is enough: every restored notice changed or deleted since the copy is deleted (one changed since is posted again by
an administrator if it is still wanted), and every notice posted since gets its record back with its posting time and
the same 120 days, so a stale retry meets a record and is answered "deleted". The record carries no author: it guards
the id, and no copy of anyone's data needs it.

**A restore refuses without separately proved write quiescence** (Codex's 3 Oct 2026 restore-drain qualification,
carried forward under the owner's takeover instruction). Closing the website prevents restored names/notices from
being public during replay and excludes new website admissions, but it does not freeze previously admitted saves.
A valid Settings or Leadership save may still be waiting for its body; equal captures may precede its later commit.
No finite requestwide drain time is established, and neither a fixed wait nor ordinary redeployment supplies one.

Every preservation-critical writer must be covered: Settings/Leadership and their separate audits, News, relevant
bot/cron/admin-SQL work, pending SQL/post-response work and old serving versions. Obtain actual completed-or-canceled
evidence before the final capture and maintain exclusion through database replacement, recovery and read-back.
The site's block remains until replay and all reads pass and no old admitted writer can resume after reopening.
If these conditions cannot be proved, restoration remains unavailable. Capture equality and asking staff to stop
are cross-checks/precautions only, never terminal-state proof.

`ensureSchema` still checks once per isolate, so recovery needs the newly served version's schema path; a redeploy
receipt is not cancellation evidence for old invocations. A recovery request must preserve writer exclusion, rather
than silently reopening the bot host or cron. A future authoritative epoch must fence commits and audit seams,
survive replacement, cover old versions and refuse stale work after reopening. That runtime epoch barrier is
**not implemented**; proposed .116 work supplies no current guarantee.

**"Never your name" belongs to the figures, not the notices** (Codex, 3 Oct 2026 13:24 UTC). The figures are computed
by the Worker from counts and times, so the policy can promise they carry no name. A notice is free text an
administrator types, and the server cannot judge whether a text names someone; the policy therefore promises what the
staff do (name a member only with that member's agreement) and the remedy (changed or deleted on request, through any
officer or the private request form), as it does for typed names. Admin -> News keeps its stricter line, "do not name
members".

The second review of 3 Oct 2026 found the same gap one step further: the list of figures also named "the title and time
of the next events", and an event's title is free text too, typed by its organizer (an administrator or a member named
as an organizer; up to 80 characters). News adds no audience for it, since confirmed members read the same title on the
Calendar, so the page keeps it; the policy now lists the events outside the figures, as start times with the titles
their organizers gave them, shown as the calendar shows them. Showing only a count and the times would have kept the
promise by making the page less useful, for no privacy gain over the Calendar.

**Members never see a notice's id** (the second review of 3 Oct 2026). The id is the create's operation id, and its first
eight characters are the database second at which an administrator opened Admin -> News. That is a staff-activity time
to the second, while every such time members see is on the hour. The members' page never used the id, so `GET
/api/news` leaves it out; the staff views and the administrator's own copy keep it. The exact posting time stays: it is
what a notice says about itself.

**The id's time is a bound, not a signature.** The prefix is not signed, so it proves nothing about where an id came
from: a staff client could build one with the current time. That is harmless on a staff-only route (such an id has no
record yet, so it can only post a new notice, which its own record then guards). What the prefix gives is the one
property the promise needs: a FIXED id, frozen in a page opened long ago, stops creating after 30 days, before its
120-day record can be gone.

**A retention promise is accepted on receipts** (Codex, 3 Oct 2026 13:24 UTC). The policy says the owner keeps only the
newest verified export; the owner's answer is the instruction, and a release that publishes it is accepted only once
the owner's inventory of private copies holds that one export and the task log holds a destruction receipt for each
earlier one (time and SHA-256) and for each scratch database a verification restored into, which is a full copy too.
A D1 scratch database has no SHA-256, so its receipt is its name or UUID, the time it was deleted and a listing taken
afterwards without it (the second review round, 3 Oct 2026). Cloudflare's point-in-time history is a different facility
with its own window and is not part of that inventory.

**The in-game ladder waits for a later release.** The in-game ladder decision changed on 3 Oct 2026 (owner answer 6:
ten ranks, the Treasurer at index 2 right below Officer, no Probation), and its planner preset and in-game steps come in
a later release. Answer 6 supersedes answer 1 (a seven-rank ladder), for which this build first rewrote the role copy
and added a planner button; a later commit of this build withdrew both, so the role copy (the .46 lines of 30
September, which describe the same ten ranks) and every planner file are as .114 had them.

**The release-note rule is relaxed until Codex agrees.** `site_news_test` checks that the newest release note is not
newer than `BUILD`; the stricter rule (the newest note is exactly `BUILD`'s) waits for Codex's agreement to the
convention.

### .115 takeover corrections, 3 October 2026

The owner's takeover instruction removes the prospective Claude source reservation and countersignature. The
interrupted source is preserved at `568c76d958eeee2f2786798bd959b0b2ae8ec299`; it is not a release approval.
The roster now reserves SQL still owed by every buffered notice before admitting another effect, keeps underived
exports retryable, and refuses partial snapshots. An identical legacy refresh proves completeness with its existing
`UPDATE ... RETURNING` before creating a run. Worklist consumption checks both the completion flag and the stored
member count. Each rename/release checks the exact binding, snapshot and applicable unfinished run inside its atomic
database batch. Manual sync retains its existing deliberate full-row legacy/stuck override. External Discord effects
remain outside those database transactions; no external atomicity is claimed.

Settings and Leadership compare the exact raw values they read, including absent rows, inside their write statements.
A concurrent removal or replacement therefore makes an old save fail with 409, even when its consent box was checked.
The Settings guard admits the complete submitted packet or none of it. Refusals add no success audit or typed names.
For an uncertain News create, absence from the live-notice list cannot prove the operation never existed: deleted and
expired notices may have tombstones. The form keeps the same frozen operation available for retry/status resolution.

The statement model remains conservative: 164 cold-schema attempts, 536 available for roster ingestion, 516 for
manual sync, 40 for the cron roster slice, and 694 for the composed scheduled worst case under the 700 target.
Cloudflare's current batch documentation does not establish aggregate batch metering. Numeric limits have not changed.
Restore refusal when actual preservation-critical writer quiescence cannot be proved remains mandatory; the future
runtime restoration epoch is not implemented. Exact-head test, art, publication, backup and live receipts are separate.

## 6 October 2026 - standalone anonymous policy/contact surface (.116 candidate)

Anonymous PolicyV5 remains the wording basis; no individual controller name, email or location is introduced. Static
policy documents use the reviewed v116 finite shell/slots generator with the Battle.net release profile immutable OFF.
The bottom policy surface is titled Privacy and account data and links Account data controls. The Community card and
old SPA erasure prose are removed; saved #/data addresses redirect without forwarding fragments or credentials.

Contact/case forms retain the existing manually reviewed case engine. Conversation credentials establish conversation
access only. A valid existing site session can request the narrower curated copy through the unchanged .115
currentUser/communityContext/admittedRead authenticatedIdentity boundary. This path neither invokes nor claims P2
account-generation authority. It does not admit a member, create an account or expose staff records.

Four exact canonical helper dependencies are included only for dormant identity mechanics and safe primitive capture.
Imports initialize constants/functions and one empty provider-pending set; they perform no DB, provider or RNG work.
Production dispatch remains CLOSED before identity flow/session/provider work; prospective SQL/cleanup definitions
are not attached to the schema or cron. Automated erasure and unlink controls remain 503 not-performed. No generation
schema, normal session producer, restore fence or membership capability is activated by policy publication.


## 7 October 2026 - public footer and recovery wording (.117)

The owner's requested footer omission removes one SPA navigation row while leaving policy and privacy routes reachable by their direct URLs and the Discord application's policy links. The own-avatar notice and footer attribution remain. Contact messages and case receipts consistently describe the privacy inbox, whose manual review and conversation-only authority are unchanged.

Recovery wording describes the data at capture and eventual export destruction instead of naming a now-deleted pre-.115 export. Existing newest-only custody, retention cutoffs and attended restore restrictions continue. This presentation change adds no identity producer, generation schema, role writer, deletion/unlink authority or provider setting. The art reference changes only app.js's exact source pin; it does not authorize new website artwork.

## 7 October 2026 - captured own-account action history (.118)

The existing account controls offer a script-free history view with a Next page button and a separate download for
the displayed page. Both use POST /privacy/account/export; finite `history` and `download` modes retain the old
blank-mode download behaviour. Continuations stay in form bodies. The initial GET /api/me/export remains available,
but any `actions` query parameter is refused rather than allowing a private continuation in an address.

The first admitted database batch captures the own-account audit high-water id and count together with its earliest
1,000 actions. Later pages use the same captured id range and timestamp/id order, excluding subsequent inserts,
including backdated inserts and the traversal's own copy-audit records. A domain-separated HMAC binds canonical
continuation fields to the original signed account, session version and expiry. It gives integrity, not account
authority: every page still uses the live version and database-clock authenticatedIdentity fence in that batch.

Count, high-water, remaining count, row order and page-length checks refuse a detectably changed range with 409.
This is a traversal of retained actions, not an immutable all-store snapshot or a commitment to unchanged contents
against privileged replacements/restores. Other curated-copy sections are freshly read in each download's admitted
batch at its generatedAt. A history view reads only the action section; it does not prove a file was saved.

Views and downloads share the existing approximate per-isolate five-per-hour account limit. Longer histories may
need another rate window. Readonly current/next continuation fields let the account save its place privately; a 429
history response preserves its validated submitted continuation with a same-mode retry form. Reopening account
controls refreshes the form for a pasted continuation, but does not renew the original signed session. COUNT and ordering can
process more than the 1,000 returned rows, so the output cap is not a database-workload cap. No new schema, index,
dependency, external route, privilege, identity producer, automatic erase/unlink control or Battle.net switch is added.


## 7 October 2026 - captured own event-change history (.119)

The curated account copy adds retained community_event_changes whose actor is the current signed account. It returns
only the event ID, change kind, time and up to six known changed-field names. Event text, field values, other actors
and removed records are excluded. Creator or organizer status does not grant access to another actor's history.

Event history has a separate own-event-changes HMAC purpose and collection domain. Current/Next positions bind the
original account, signed version and expiry, with the existing database-clock fence inside the metadata/page batch.
The action and event ranges have independent captured high-water IDs/counts. Continuing one in a JSON download
freshly captures the other and reads remaining sections in that batch. Observable range changes refuse completion;
equal-count content replacement is not authenticated and the result remains a curated partial copy.

The existing POST /privacy/account/export form admits only actions or event_changes, paired with its own body field
and CSRF binding, and history or download mode. The original default action download remains available. Private
Current/Next and rate-refusal continuations are POST-only and require the same original site session. All copy views
and downloads share the unchanged approximate five-per-hour per-isolate limit, charged once per request. No schema,
index, dependency, asset, retention, erasure, identity producer, Battle.net activation or guild authority changes.

## 7 October 2026 - .120 captured own contribution-decision history

The curated partial account copy gains a third retained history range. A decision is owned when its subject is the
signed account, or its recorded actor is exactly member:<account> or staff:<account>. The OR predicate includes a
row matching both once. Subject-owned rows remain included when their actor is legacy or unrecognized; raw/user
actor-only aliases are unresolved and are not authority. Projection is action, time and subject/actor/both relation,
never counterpart ids, payment evidence, guild scope, obligation id, revision, nonce or arbitrary actor text.

Only the twelve current decision actions are accepted. Retain-until is checked by the genuine SQL clock inside the
metadata/page queries. The admitted payload batch includes captured MAX(id), count, remaining count and 1,001 rows
ordered by at/id. All returned rows, including lookahead, are shape/ownership/action/lifetime/order validated before
any successful copy audit. Detectable deletion, expiry or position/count changes refuse with 409 rather than claim
completion. Counts and positions do not authenticate equal-count content changes or an immutable snapshot.

The existing action fourth argument and event fifth argument remain compatible; an optional sixth contribution
continuation has its own HMAC purpose, dataset and signed session tuple. Downloads include all three history pages
in the same admitted batch; continuing one freshly captures the other two. The fixed contribution_decisions selector
is paired only with contributionDecisions in a form body and a dedicated CSRF binding. Current/Next, private saved
continuations and valid 429 retry use the existing script-free POST route and original site session. Every view or
download charges the unchanged approximate per-isolate five-read hour once. No quota reset/refund or TTL change.

The output cap is not a SQL-work cap: the existing unindexed actor OR, MAX/COUNT and ordering may scan unrelated
rows. A prospective real-SQLite plan/6001-own plus 100000-unrelated traversal diagnostic is local evidence, not a D1
SLA. All-store completion, rights-only resumption, third-party policy decisions and other store gaps remain open.
No schema, index, producer, retention, external route, guild role, identity, erase/unlink or Battle.net activation.

## 9 October 2026 - .121 High Council rank planning

New browser drafts use the owner's ten-rank ladder: Guild Master, High Council, Officer, Officer Alt, Raid Leader,
Veteran, Raider, Member, Alt and Initiate. Treasurer and Co-GM are appointments. The preset gives all High Council
characters Withdraw Gold and Modify Bank Tabs, retains the Raid Leader authenticator safeguard, and includes the
later-selected Veteran repair toggle without invitations. Every non-GM numeric bank allowance remains zero for attended review.
The original 26 catalogue ideas remain intact as historical alternatives; High Council has separate owner provenance.

Draft v2 adds an explicit owner-policy stamp. A genuine v1 export restores and exports unchanged, including its
custom permissions and old Treasurer rank. Only the user's replacement action or explicit addition of High Council
adopts the new provenance. The browser storage namespace stays stable. No guild, Discord, bank or appointment write
is introduced. Older integrations that equate rank index 1 with Captain require review because High Council now sits
there. The planner masthead and tab icon retain the existing Olympus crest: the owner's 1 October 2026 choice,
"Crest is the exception", permits it only as site brand and browser icon. Other interface art remains official WoW art.
The AddOn's /olv ranks guidance is
informational and changes no roster, queue, verification, invite, promotion, bank permission or export behavior.

## 9 October 2026 - .122 public role guidance

The public role descriptions now distinguish the proposed post-beta ladder from the current in-game setup. Officer
sits below High Council in that proposal; Co-Guild Master and Treasurer are appointments within High Council, not
extra native ranks. The copy removes the old Captain/index-based AddOn access promises and native Treasurer rank.
It carries the approved High Council gold/tab rights and Raid Leader authenticator safeguard without approving a
numeric bank allowance. Each Guild Master must review and configure native ranks and bank limits in an attended session.

This is a plain-text correction: one explanatory comment and nine game-description strings in site-data.ts. Existing
application keys, labels, groups, voting seats, appointment defaults, validation and authorization are preserved.
No current native ladder is certified or changed, and applying for a job grants no rank, permission or AddOn access.
The existing role-description regressions now check that boundary instead of requiring the obsolete Captain and
Treasurer claims. Unrelated historical design sections and AddOn feature descriptions remain historical or outside
this finite wording batch; this update does not qualify those capabilities.

## 9 October 2026 - .123 Veteran permission correction

The original owner item 26 explicitly includes Invite Member for Veteran. The later repair-only question added Guild Bank Repair; it did not withdraw Invite Member. Earlier .121/.122 review statements and current-preset claims excluding Veteran invitations are superseded by this correction. The current recommended preset includes both permissions. Existing custom/imported/stored drafts retain their exact choices; selecting the recommendation remains an explicit action. No native rank, bank amount, staff grant or appointment is applied. The informational AddOn 0.6.5 guide contains no contrary Veteran permission statement and its bytes remain unchanged.

The .123 delta review R123-1 also corrects the rendered /admin/ranks reference note: Veteran has Invite Member from owner item26 and Guild Bank Repair from the 7 October answer; no amount is set. The real PAGE_HTML test checks both the corrected owner basis and absence of the previous false exclusion. The site-data.ts change remains explanatory-comment only. The first f242 candidate and its dry/art/test receipts remain historical and do not qualify deployment. A new exact final head, reference coverage, tests, CI and both scoped reviews are required.

## 9 October 2026 - .124 staff introductions and suggestions forum

The bot now owns an officer-chat introduction for the retained Olympus I staff channel. It points cross-guild discussion to the existing Council channels and keeps case files, personal details and credentials in the private staff tools. It grants no access, office or in-game authority.

The guild-suggestions introduction now creates a Guide-tagged pinned forum post instead of sending a text-channel message. Main and cutover mappings target the observed forum 1557472627830956103 and the retained officer-chat 1551253115615838258. The old suggestions text channel 1555959199513575476 is retained, with no message or channel deletion. Existing four Council/development mappings and intro keys remain stable. A migration posts only in the new forum and leaves any recorded old copy alone.

The existing 40-call refresh budget is retained. An empty eighteen-intro deployment may need two refreshes; the first states what was not reached and the second reads existing posts without duplication. Operators should refresh only the intended channel and read back the rendered message and pin. Record-based status alone does not certify live message content or permissions. No schema, secret, role permission, retention, appointment, AddOn or website-asset change is introduced.

## 9 October 2026 - .125 full staff audit page

The owner's 7 October choice was a dedicated staff page covering bot, roster, role and website actions, with names,
filters and paging. The existing Overview recent activity alone did not complete that scope. The frozen Claude
audit-v3 feature (59d4fcc77d581f528829ff1ae07e09d3ff31f09c) is ported into the merged .124 surrounding source,
preserving the bounded ID scan and the original final admission fix. New source review and release qualification
belong to the .125 tuple; the frozen candidate's historical acceptance is not acceptance of this composition.

GET /api/admin/audit-log has checked family, actor, subject, window, exclusive before cursor and limit parameters.
It walks a stretch of at most 2,000 primary-key IDs, filters timestamps themselves and returns at most 100 matches.
Rare filters can produce an empty stretch with a valid Older cursor. The timestamp-index probe is only an empty-window
decision or likelihood hint; it never stops traversal on an assumption that IDs and timestamps run in order.
Local site/bot name columns are read once for approved Discord IDs, without provider HTTP or Battle.net-derived data.

The aggregate staff DTO is a deterministic action allowlist. Each registered action fixes which subject kind and
typed detail keys may leave; unrecognized actions/actors, private linkage, malformed or oversized details and all
unapproved fields are withheld. There is no raw JSON prefix, free-text error/reason, ticket/code, tag/GUID, or private
case/payment/evidence fallback. Case and contribution tools retain their own existing authorization and projections.
Overview's recent endpoint keeps its route and five-field newest-100-site-action format, but derives a safe detail
string from the same DTO and uses the same final admission. Historical audit data and its retention remain unchanged.

Both handlers bind the cookie's original ID, session version and expiry before the reads, build the complete answer,
then execute one final community fence against the live account and database clock, plus SITE_ADMINS again. Version
revocation, denial, departure, erasure or expiry before this statement withholds the payload. A database failure closes
with 503. Nothing asynchronous follows the check. This adds no broader authentication refactor or read-side writes.

The page uses textContent, shows local names (actor IDs are explicit; a named subject's raw ID is in its tooltip), makes detail/subject
withholding explicit, and keeps its sent filters for each
read. Slower successes and failures cannot replace a newer read, and an answer arriving after leaving the page is
discarded. Focused real-source SQLite and frontend tests cover these boundaries; no audit schema, new retention
policy, dependency, external mutation, role/permission change or secret read belongs to this feature batch.

### 9 October 2026 - .125 corrections after Claude's CHANGES review

A125-R1 binds a subject's validated kind (Discord ID or the existing character-label grammar) to the finite list of
actions whose DTO exposes that kind. ID-only and character-only rules cannot match a malformed historical value of
the other kind; the removal writer's reviewed id-or-character rule accepts either. Other shapes return 400. Private
restriction, trial, departure, contribution and OAuth/link subjects stay unqueryable even when retained or when their
features are off. A125-R2 gives every rule an actor policy. The member contribution-acknowledgment actor and unknown
actions are withheld, excluded from actor filtering and omitted from name resolution. Staff actors of other reviewed
private actions remain visible; affected-member subjects and details stay withheld.

Filter eligibility is derived only from the reviewed registry and bound as compact JSON membership lists, one value
per filter, instead of a placeholder per action. The real SQLite plan retains the primary-key stretch with at most
2,000 IDs; all filters together bind ten values, including the actor list of more than 100 actions. Each statement
stays within D1's [100-parameter limit](https://developers.cloudflare.com/d1/platform/limits/). The original final
cookie/session fence and maximum five statements are unchanged.

A125-R3 reflects the actual writers: role.remove_failed accepts the character subject from roster.ts and the ID
subject from interactions.ts; role.add_failed, role.deferred, role.refused_banned and roles.read_failed accept their
roster character subject and an isId-validated discordId detail. Only those four detail rules gain an ID allowance.
Their discordIdName is generated by the existing single local-name lookup, never read from historical detail text.
No name is invented when local tables have none. Error/reason text stays withheld. Focused tests run the real roster
promotion/departure and interaction writers against SQLite with only Discord effects stubbed, and guard their actual
call-site shapes. The News enum uses the writer's edited operation (N2); payment tests use contribution_receipt and
member contribution_acknowledged, rather than an unwritten payment action (N13).

The remaining review notes are explicit limits of this correction scope:

| Note | Disposition |
|---|---|
| N1 | Deferred: the additional roster/settings/application count and enum keys retain their conservative withholding. No new field policy is inferred. |
| N2 | Corrected: edited is allowed; the unwritten updated value remains withheld. |
| N3 | Deferred: verification rows keep the minimal approved action/actor projection. |
| N4 | Corrected for R3's four actual detail-ID writers; other actions retain their existing withholding. No global ID allowance. |
| N5 | Documentation corrected: the UI requests 50 rows; only the API accepts a checked 10-100 limit. |
| N6 | Focused writer-fidelity guards cover the corrected role, News and private producer shapes; unknown action tests cover default display and filter withholding on both endpoints. A complete historical/all-writer census guard is deferred. |
| N7 | Documentation corrected: actor IDs are explicit; a named subject's ID is in its tooltip. Approved role detail IDs are explicit summary values. |
| N8 | Deferred: Overview's compatible five-field response still represents a withheld subject as null, without a separate subject marker. |
| N9 | Deferred: the existing exact fragment guard for noncanonical audit subpaths/trailing slashes is unchanged; canonical #/admin/audit is the supported page. |
| N10 | Deferred: late denied/out-of-server admission still uses the existing 401 signed-out wording. |
| N11 | Covered: HEAD refusal and exact 4,000/4,001-character ASCII detail boundaries have focused tests. |
| N12 | Unchanged: character labels use the existing bounded letter/space/apostrophe/hyphen grammar; action eligibility closes reverse lookup without inventing a roster-identity rule. |
| N13 | Corrected: real private action names/shapes and writer vocabulary are tested, with no arbitrary payment-action substitute. |
| N14 | Unchanged: the legacy newest-100 site.* query predates .125 and has no primary-key stretch bound; its projection and final admission stay safe. |
| N15 | Preserved: the deliberate safe projection and narrowed legacy response replace historical raw-display/byte-identity behavior. |

These changes are an unshipped .125 candidate. Codex test evidence is not actual Claude's review of the corrected
tuple; publication/CI, separate reviews and live owner acceptance remain open. Item 5 stays Partial through those gates.

## 9 October 2026 - .126 calendar start-time choices

An event's saved UTC instant must survive a title-only edit. The previous minute-only local input was reparsed with
Date.parse, which can choose the earlier occurrence of a repeated clock-change hour and also discard stored seconds.
The calendar form now preserves the original instant when its displayed minute and selected occurrence are unchanged.
New local values are checked as Gregorian minute inputs, matched to real local components, and shown with their UTC
instant. A skipped local time is refused. When the bounded search finds more than one occurrence, a changed value
needs an explicit earlier/later choice. An unchanged edit selects its own existing occurrence.

The form also accepts explicit UTC. Switching modes converts a resolved instant; an unresolved value is cleared so
it cannot silently acquire another meaning. The local search covers 3,121 UTC minutes within 26 hours of the requested
wall time, using Date components in the loop and one fixed-zone Intl formatter on matches. This is a bounded
contemporary-calendar input path, not an arbitrary historical-zone equivalence claim. Missing/changed zone identity,
unsupported offsets or Date/Intl disagreement hold local input and offer UTC. Native browser behavior and representative
zone cases need their own qualification. Time controls freeze for a submitted operation; the existing uncertain-answer
retry retains its original payload. A known refusal restores editing.

This batch changes calendar input only. Existing API admission, event revisions, RSVP/attendance, retention and
permissions stay on their current paths; the dues time helper is unchanged. Discord event publishing and raid reminders
remain unfinished under item 9. No complete item-9 acceptance or overall signature follows from this repair.

## .128 — Public R6 governance reader and interactive organization

The owner requested the entire governance book publicly on the website and a dynamic organization chart. The two
public routes, `#/governance` and `#/organization`, read fixed same-origin assets without credentials or member APIs.
The Markdown asset is the exact reviewed 116,006-byte R6 source, SHA256
`dc250be085cd89c9ddb0e4dd6029d7392898e73a7df893657670e44c65d367ca`, including its dated historical statements.
The browser checks that binding before presenting any chapter. The reader constructs text nodes, safe emphasis and
tables; it does not execute HTML or arbitrary Markdown links. All 13 chapters are available through a contents list,
deep links, full-text search, previous/next navigation and native keyboard-operable expand/collapse containers.
Start here, Adoption checklist and Appointment templates link to the existing source sections. The chart placeholder
becomes a link to the real interactive chart; the downloadable source stays unchanged.

The generic organization has reporting and coordination relations, independent Justice and audit remits, four core
portfolios, shared Systems, local guild leadership, five distinct emissary liaisons and local support/event duties.
Selecting a node shows its remit, limits, parent relation and coordination contacts. All 95 requested labels are
classified and searchable exactly once in the vocabulary index. The ten native rank slots and the ten unappointed
Olympus I–X directory placeholders remain separate. Courtesy and review labels create no native power. Actual
leadership identities stay in the protected directory; this public chart links there but never fetches its data.

The R6 draft banner explicitly distinguishes publication from adoption, accepted warrants and actual permissions.
No appointment, bank amount, rank change, beta reset, donor feature or automatic release switch is implemented here.
PDF generation and the builder's historical R5 banner remain separately held publication work. This independent web
reader does not claim that a PDF was built or that the charter was ratified. It uses existing official client artwork,
fonts and the already-approved crest; no new dependency or artwork was added. Backend admission and privacy controls
remain on their existing paths.

Qualification: exact source/95-label/structure tests and real frontend-to-Worker regressions cover unsigned and denied
readers, public asset requests without credentials, protected directory refusal, chapter/search/detail controls,
malformed data, missing assets and late-route responses. A native browser review on the final candidate separately
checks mobile layout, keyboard behavior and actual text/table legibility before publication.

## 2026-10-10: opted event reminders (.134)

The owner requested reminders in raid-signups. Each revision needs separate organizer consent; the global reviewed
switch alone never opts in an event. Cron uses durable consent and current keeper/Discord membership facts rather
than refreshing an expired website cookie. One claimed effect per run bounds SQL and Discord calls. A known refusal
needs new explicit consent; an ambiguous effect is never automatically retried, since Discord's nonce only supplies
recent deduplication. Editing cancels consent, and current erasure hooks clear copied identity/content while keeping
external cleanup debt. Finite custody expiry closes the surviving event before local disposal; no external deletion
is inferred. Even an armed, cancelled or refused expired consent closes the surviving parent before its row is
dropped; reminder-only disposal records counts and unresolved external custody in the existing expiry audit.
The original deadline cannot be extended by a reschedule or consent retry. The existing calendar
organizer capability is preserved; this is not a Discord-role authority or admission writer.

## 2026-10-10: separate governance downloads (.134)

Members can download a guide, adoption checklist and reusable appointment/news templates without searching the
complete charter. Each is a covered excerpt of the exact reviewed R6 PDF; the original printed page numbers are
retained for comparison. A separate two-page release worksheet covers source identity, verified recovery, explicit
publication, privacy limits, the attended councillor game/browser check and the eventual beta reset. Draft notices
remain visible: neither a download nor a checklist grants authority or records adoption. The original full PDF,
five-payload ZIP, source reader and all four reading/chart links retain their accepted identities.

## 2026-10-10: serving privacy and councillor authority (.135)

Privacy identity is purpose-specific and does not borrow ordinary guild admission. A five-minute, browser-bound
Discord identity handshake creates independent twelve-minute, one-use copy and erasure grants. Account generations
bind the qualified new-source serving writers to their original capture. Once enabled, requesting erasure closes that generation before the bounded job
checks Guild Member absence and erases classified local stores. A later generation or reauthentication cannot adopt
an old pending write, proof, queue result, event claim or provider outcome. Database-clock checks and terminal fences
remain in the consuming transaction; unknown outcomes are explicit rather than guessed rollbacks.

Original external custody survives a late known response as cleanup debt. It cannot refill erased account content or
redispatch an ambiguous operation. Erasure status separates serving completion, Discord message debt, human-managed
staff permissions and recovery copies. Active safety cases/bans have separate purposes. A rejection marker means
only the account's rejected guild application or membership and has a fixed original 365-day clock. Restore-only
generation suppression lasts 366 days; private exports are newest-only with a 365-day maximum age. Attended recovery
must replay suppression, corrections and News dispositions before reopening. Automatic all-copy erasure is not a
claim this design can make about third-party, browser, downloaded, game-client or operator-held copies.

The councillor browser is the signing client; the AddOn supplies bounded observations from the supported game and
renders QR or a complete manual wire. AddOn-free members need only a normal in-game whisper and their website code.
Enrollment binds a non-extractable local Ed25519 key to a current native High Councillor and trusted complete roster.
The server lease is twenty-four hours; automatic mode is separately accepted for five minutes and ten proofs. Fresh
game observation, original member/session/generation, replay rejection and one-effect current-server role settlement
are independently enforced. Neither website staff access nor the rendered QR alone proves native qualification.
The councillor's game and browser must be online; future peer consensus remains outside this launch phase.

Native roles use an explicit profile rather than inferred rank numbers. The observed beta-five profile stays active
until an attended game-rank change, matching reviewed role map and fresh roster establish the ten-rank layout. Role
mapping grants no council appointment, charter adoption or bank authority. Source/native acceptance and installed
module loading are separate from the qualified person's actual live proof and intended role settlement.

The additive serving schema has 65 classified tables. Schema admission and all scheduled waitUntil jobs share the
conservative 699-statement invocation envelope; adding copy pagination does not add schema or scheduled work. Every
release must independently measure the whole joined source and exact archive, then bind live readback to that head.

The first-stage .135 profile opens account copies while new erasure and lifecycle-retention jobs remain OFF.
An actual .134 request resumed after new-version erasure and recreated a member row, so the destructive workload
needs a separately qualified legacy-writer transition. New-version cooperative fences cannot retrofit an already
executing prior version. The canonical profile and append-only configuration marker must agree before publication.

## 2026-10-10: original weekly authority and exact catalogue (.136 candidate)

The weekly contribution opener captures the account's privacy generation or its absence in the original roster/account
query. That capture stays fixed across policy initialization and is consumed in the obligation insert together with
the original first-login/session-version facts and current roster eligibility. A changed or retiring subject holds the
write; another independently admitted invocation can capture current authority. The existing native transaction,
known-commit handling and scheduled statement envelope remain intact.

The serving business catalogue compares the literal reserved `sqlite_` prefix. A legal unknown table such as
`sqliteX_private` is counted and holds catalogue admission. Actual SQLite internal tables and the exact `_cf_KV`
provider exception retain their established treatment. The native fixture loads the actual production entry graph
and all twelve registered families before testing the 65-store catalogue.

This candidate preserves the .135 first-stage flags, native role profile and 699-statement cron model. Erasure,
lifecycle retention and councillor signing stay OFF. Legacy-writer transaction admission, restore boundaries,
scheduler transport accounting and already-admitted provider effects remain separate activation gates. The isolated
admission prototype remains design evidence outside this candidate's production source and schema.
