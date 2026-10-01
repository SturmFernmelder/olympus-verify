# Design — membership verification for Olympus (rev. 2026-09-29, Claude Cowork)

This is the sketch Viktor brought on 17 September, checked against the current API documentation and rewritten
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
(`olympus-icon.png`); since .86 (Viktor's instruction of 1 Oct 2026: generated and custom artwork for the Discord
application only, the websites on official World of Warcraft assets) the brand and the tab icon were the game client's
banner icon (`wow/icon-friends.png`, INV_Banner_02, 64 px); since .111 they are the crest again, the website's one exception
(Viktor's decision of 1 Oct 2026: guild.roachcouncil.com is the guide, with its logo); every account picture is the member's class icon or the
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

Olympus Verify and Olympus Forever are being merged into one application (Viktor's brief of 30 September; the task log
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
Viktor; the code is written so that dropping the fingerprint is one statement if he reads it the other way.

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
