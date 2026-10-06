# olympus-verify

Account-level and character-level membership verification for the Olympus Discord, built for the state of the
world on 18 September 2026: Discord Linked Roles exist but no longer expose Battle.net connections to apps, the
Battle.net profile API does not know WoW: Forever yet, and a guild invite on current clients needs a real key
press. Four pieces:

| piece | where it runs | language | job |
|---|---|---|---|
| `worker/` | Cloudflare Worker + D1 | TypeScript | Discord interactions (`/verify`, `/verify-status`, `/olympus-admin`, review buttons), Linked Role OAuth, watcher endpoints, roster diff → roles behind truncated-export guards, Phase 3 Battle.net path behind a flag; since build .41 also the guild site on `SITE_HOST` (`src/site*.ts`, static files in `worker/public/`) |
| `addon/OlympusVerify/` | the officer's WoW client | Lua | validates `!verify CODE` whispers/mail offline, replies, queues invites, fires them on the flush key, notices accepted invites and whispers a signed confirmation, exports the whole roster (offline included), turns chat logging on; since 0.6.4 a Members window (verified or not, Discord names) |
| `addon/OlympusProbe/` | any WoW client | Lua | read-only API probe (`/olp test`, `/olp doc <Namespace>`); its 17 Sep beta results are in `docs/beta-test-plan.md` |
| `watcher/` | the officer's PC | Python 3 (stdlib) | tails `WoWChatLog.txt`, reads SavedVariables after `/reload`/logout, posts to the Worker through a durable outbox that survives an outage, writes `OlympusQueue.lua` |
| `docs/` | — | — | corrected design with sources, beta test plan, deploy checklist, handbook addendum |

Read `docs/design.md` first: it records what changed versus the original sketch and why (three claims did not survive
contact with the API docs).

> **The flow, Setup and Commands below are the September 2026 baseline, kept as history.** Where they differ, this is
> current:
> - **Battle.net is optional** (since .32). The in-game whisper of a code is the proof of control, and `/verify` needs
>   no Battle.net link. The link is an optional marker: its BattleTag is kept 29 days (since .48), and
>   `BNET_CLIENT_ID`/`BNET_CLIENT_SECRET` serve only that link.
> - **Authority** (since .55). The officers are the roles in `ROLE_OFFICER`, `ROLE_GUILD_LEADER` and
>   `ROLE_GUILD_MASTER`. `ROLE_MODERATOR` only marks departure lines and grants nothing. Only Guild Leader or Guild
>   Master may press "Ban from Discord", and the button shows only with `BAN_BUTTON_ENABLED = "true"`, which is set
>   only once the bot holds Ban Members.
> - **Least privilege.** The bot needs Manage Roles, with its role above Guild Member, and View Channels, Send
>   Messages, Embed Links and Read Message History in the channels it posts to (Pin Messages for the intros, Manage
>   Posts in forums). The ban button is off in both profiles (`BAN_BUTTON_ENABLED = "false"`), so Ban Members is not
>   required; in Asmongold's server it is a separate approval, and Manage Nicknames is not needed there either
>   (`SET_NICKNAME = "false"` in the cutover profile).
> - **Installing and deploying.** The Worker, its D1 database and its secrets already exist. Do not create a
>   database, run `npm run db:init`, reset secrets or deploy from a working folder. The canonical procedure is
>   `docs/launch-runbook.md`: the owner takes and verifies a private D1 backup before a deploy that migrates the
>   database (its step 1), then deploys an exact jointly signed commit from its `git archive` with
>   `bash scripts/deploy-commit.sh <sha>`.

## The flow

```
member                     Discord / Worker                       officer's PC (client + watcher)
------                     ----------------                       -------------------------------
Link Battle.net  ───────►  /linked-role → Discord authorize (identify role_connections.write)
                           → Battle.net's own login (oauth.battle.net, openid) → /bnet/link reads the BattleTag
                           from Blizzard's userinfo and stores it (the connections scope is not requested at all:
                           Discord no longer returns Battle.net connections to apps)
                           role-connection metadata pushed → Linked Role applies
/verify Thrall   ───────►  code = HMAC(secret, "thrall|2026-09-18")[0:30 bits]
                           (the name autocompletes from the latest roster export)
                           pending(Thrall, discord id) for 24 h
whisper "!verify 3FYWNZ"                                          addon: HMAC check offline → reply → queue
  to an officer                                                   watcher: sees the whisper in WoWChatLog.txt
                 ◄───────  POST /ingest/verify ◄──────────────── (or in SavedVariables after /reload)
                           pending consumed, character bound
                           auto: invite_queue row (review mode: card in #recruitment-review, Approve first)
                           already on the roster → Guild Member at once
                           GET /queue ─────────────────────────►  watcher writes OlympusQueue.lua
                                                                  addon loads it at login or /reload → officer
                                                                  presses the flush key → one C_GuildInfo.Invite
                                                                  per press → member joins
                                                                  → addon marks "joined" (MemberExistsByName, ≤30 s)
                                                                  → addon whispers the confirmation (ref OLVj-<hmac>)
                 ◄───────  POST /ingest/events ◄──────────────── a join/leave carrying an origin (seconds)
                           trusted origins — the addon's own SavedVariables, or an officer's signed whisper — grant
                           and remove the role; a plain chat-log line is not trusted (an emote forges it byte for
                           byte) and can only arm a removal
                 ◄───────  POST /ingest/roster ◄──────────────── roster export (SavedVariables, offline members included)
                           diff reconciles: joined → Guild Member + nickname; missing from one export → left_pending,
                           missing from two in a row → role removed; a suspiciously small export is stored but
                           removes nothing
```

Latency: the client writes `WoWChatLog.txt` in 48 KiB chunks and at `/reload` or logout (measured on the beta, 17 and
27 Sep), so a whisper can sit in the buffer for minutes, in quiet hours for much longer. Turning chat logging off and on
does not write it out (measured twice on 27 Sep; the addon's automatic flush is off since 0.6.3), so **Sync & reload**
is the way to push everything at once. The watcher polls every 2 s and relays whatever the file holds; the
SavedVariables path (`/reload`/logout) carries the same events and the roster export reconciles everything. In the other direction WoW
executes an addon's files only at login and `/reload`, so a new `OlympusQueue.lua` (Discord approvals, the unverified
list) reaches the addon at the officer's next `/reload`: **Sync & reload** in the panel is the supported exchange. The
`mergeSeconds` timer (45 s by default) only re-merges the table loaded then; it never sees a newer file. A confirmed code queues the invite in the addon
at once (`ADMISSION_MODE=auto` since 18 Sep; `review` keeps the card in #recruitment-review); the invite itself is one
key press per applicant (the client allows one protected call per hardware event, measured) — the addon plays a sound
and marks the button NEW when one lands, and the panel title shows how many invites are waiting and how long the
oldest has waited. A Worker outage no longer costs anything: the watcher holds undelivered posts in a durable outbox
in its state file and retries them oldest-first on every poll.
The one thing no design removes: an officer client logged in. Nothing here keeps it awake or sends it input.

Already in the guild (an existing member linking their Discord, or someone an officer invited by hand)? The addon
sees the name on the roster, queues no invite and says so in its reply; when the watcher relays the code, the Worker
checks its latest roster snapshot and grants Guild Member straight away — no review card, nothing to approve.

## Setup
> The first installation (September 2026), kept as history: the application, the database and the secrets already
> exist. What is current is in the note above the flow and in `docs/launch-runbook.md`.

### 1. Discord application
1. Create an application at https://discord.com/developers/applications, add a Bot, copy **Application ID**,
   **Public Key**, **Bot token**, **Client secret**.
2. OAuth2 → Redirects: add `https://<worker>/oauth/callback`. General → **Linked Roles Verification URL**:
   `https://<worker>/linked-role`. Interactions Endpoint URL: `https://<worker>/interactions` (set this *after* the
   first deploy; Discord pings it).
3. Invite the bot to Olympus with scopes `bot applications.commands` and permissions **Manage Roles, Manage
   Nicknames, Send Messages, Embed Links, Read Message History, View Channels, Ban Members** (permissions integer
   `402738180`; Embed Links is what the pinned guide needs, and Ban Members backs the Guild-Leader-only "Ban from Discord"
   button on the #mod-alerts card — the Worker never needs Administrator). Put the bot's role **above Guild Member** in the
   role list.
4. (Historical, superseded.) Until build .32 (25 Sep 2026) a Linked Role required `Battle.net linked = true` and
   `/verify` refused an account without a stored BattleTag. Since .32 the in-game whisper is the proof and Battle.net is
   optional; since .114 (2 Oct 2026) Battle.net sign-in is switched off (`src/bnet-switch.ts`). Do **not** put a
   Battle.net requirement on Guild Member or on any channel.

### 2. Worker
```
cd worker
npm install
npx wrangler login
npx wrangler d1 create olympus-verify        # paste the id into wrangler.toml
npm run db:init                              # applies schema.sql to the remote D1
# fill [vars] in wrangler.toml (role ids, channel ids, PUBLIC_BASE_URL, OFFICER_CHARACTERS)
# create the Battle.net API client first (develop.battle.net), redirect URL <PUBLIC_BASE_URL>/bnet/link
for s in DISCORD_APP_ID DISCORD_PUBLIC_KEY DISCORD_BOT_TOKEN DISCORD_CLIENT_SECRET VERIFY_SECRET WATCHER_TOKEN COOKIE_SECRET BNET_CLIENT_ID BNET_CLIENT_SECRET; do npx wrangler secret put $s; done
npm run deploy
DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… npm run register   # role-connection metadata + guild slash commands
```
(Historical: since .114 Battle.net sign-in is also gated by the admin's switch and the privacy policy, `src/bnet-switch.ts`.)
`BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` were required, not a fallback: `/linked-role` no longer asks Discord for the
`connections` scope at all and goes straight to Battle.net's own login, because Discord stopped returning Battle.net
connections to apps — new ones since August 2026, existing ones from 22 September 2026, with no replacement
(Discord developer changelog, 14 Aug 2026). `npm run register` reads `DISCORD_BOT_TOKEN` from the environment or,
failing that, from `worker/.dev.vars` (gitignored).
`VERIFY_SECRET` and `WATCHER_TOKEN`: 32+ random characters each (`openssl rand -base64 32`). The same
`VERIFY_SECRET` goes into the addon's `Config.lua` and the watcher's `config.json`. `npm run typecheck`, `npm test`
and `npm run check:vectors` before deploys.

### 3. Addon (on the officer's PC)
1. Copy `addon/OlympusVerify` to `<WoW>\_classic_beta_\Interface\AddOns\OlympusVerify` (the folder for the client you
   play Forever on; the TOC lists `16001` for the beta build 1.60.1 — `/run print((select(4, GetBuildInfo())))` shows the number).
2. Copy `Config.example.lua` → `Config.lua`, set `secret`. `mergeSeconds` (45) is how often the queue table loaded at
   login or `/reload` is re-merged (a new queue file needs a `/reload`: the panel's Sync & reload), `readMail` switches
   mail-body reading off, and `replyJoined` controls the signed whisper the addon
   sends a new member on a confirmed join.
3. In game: Key Bindings → AddOns → Olympus Verify → bind "Send queued guild invites". `/olv` opens the officer panel
   (status strip, the invite queue with an Invite button per row — each click is its own hardware event — Remove,
   Send next, Export roster, Flush chat log, and the last events); it opens by itself when a new invite lands
   (`uiAutoShow` in Config.lua). Right-clicking the pill button opens it too; `/olv status` prints the same in chat.
   The queue lists only applicants **online and in no guild**. The addon learns that with `/who`, which the game
   allows one per key press, so each press of the flush key either invites the next applicant confirmed that way
   or checks the next one in line (the panel's Check button does only the latter). `/olv all` lists everyone;
   `checkBeforeInvite = false` in Config.lua restores the old behaviour.
4. The officer's guild rank needs **Invite Member**. (Public notes are off: the Forever beta forbids `C_GuildInfo.SetNote`
   for addons; see `docs/beta-test-plan.md`.)

### 4. Watcher (same PC)
```
cd watcher
copy config.example.json config.json         # fill worker_url, watcher_token (the Worker secret WATCHER_TOKEN), verify_secret (the Worker secret VERIFY_SECRET, the same value as the addon Config.lua), wow_dir, account
python watcher.py --config config.json --check
python watcher.py --config config.json
```
Run it from Task Scheduler ("at log on", `pythonw.exe watcher.py --config C:\path\config.json`, start in the watcher
folder) so it is always up when the client is. `--check` prints a digest of the day's code rather than a working
code. Since watcher 0.6.5 `worker_url` must be the Worker's bare HTTPS origin; a 401, 403 or 429 from the Worker (or a
redirect, which means the wrong origin) pauses every request for 15 minutes or the Worker's `Retry-After`, the pause is
kept in the state file across restarts, and `--check` reports it. `python -m unittest discover -s tests` runs the
offline tests.

## Commands
> The September baseline: the officers for `/olympus-admin` are now Officer, Guild Leader and Guild Master (Moderator
> reports only, since .55), as the note above the flow says.
- `/verify` (no character) — a request code (7 symbols, 27 Sep 2026) and the whole line to paste in game; the character
  that whispers it is the one linked. Same as the guide's **Get my code** button. Until an officer's watcher has reported
  addon 0.6.0 (or with `REQUEST_CODES = "off"`) it asks for the character name instead. See `docs/design.md`.
- `/verify <character>` — issues today's code for that name (one open request per name; 24 h). The name
  autocompletes from the latest roster export, and accented letters are accepted.
- `/verify-status` — Battle.net link and character states.
- `/olympus-admin unbind|ban|unban|queue|roster|lookup|sync` — officers (Officer / Moderator / Guild Leader /
  Guild Master roles). `lookup user:@member` (or right-click a member → Apps → **Olympus linked characters**) lists
  their BattleTag and every character they linked; `lookup character:<name>` answers the other direction. `ban` marks
  the account, removes Guild Member, lists the characters still in the guild to `/gkick`, posts the same to
  #server-log and puts a card in #mod-alerts with a **Ban from Discord** button that only Guild Leader or Guild Master
  can press (that button needs the bot to hold Ban Members, which has not been granted yet). `sync` re-applies the
  latest roster snapshot deliberately, which is what to reach for when a member reports a missing role.
- `/verify-bnet` — retired in .50 (1 Oct 2026). The Phase 3 profile-API path was never enabled, and it would have left
  API-derived copies the 29-day purge does not cover; the in-game whisper is the proof of control.

- `/olympus-admin post-guide [channel]` — posts the pinned how-to with two buttons (**Get my code** → a request code
  and the line to paste; **My status** → like `/verify-status`). Meant for #join-guild; `refresh-guide` edits the
  pinned copy in place.
- `/olympus-intros refresh [channel]` and `/olympus-intros status` — Asmongold's server only (`INTROS_GUILD_ID`, build
  .39): the bot's pinned intro in each Olympus channel and forum, text in `src/intros.ts`. Refresh posts, updates in
  place and re-pins; status reads the records. Olympus Officer, Olympus Guild Leader or Administrator. Registered
  with `npm run register:intros`. See `docs/deploy-checklist.md`, "Worker .39".
- `/olympus-lookup member:@someone` or `character:<name>`, and right-click a member → Apps → **Olympus linked
  characters** — Asmongold's server only (build .41): the member's Discord names, the characters they linked, their
  guild-site application and reserved names; or who linked (or reserved) a character. Private reply; Olympus Officer,
  Olympus Guild Leader or Administrator. Registered by `npm run register:intros` together with `/olympus-intros`.

Addon: `/olv` (panel), `/olv flush`, `/olv check` (one /who on the next applicant in line), `/olv queue` (everyone,
with what the last check said), `/olv all` (panel lists everyone this session), `/olv roster`, `/olv merge` (re-merge the queue table loaded at login or `/reload` now; a new file needs a `/reload`),
`/olv clear`, `/olv flushlog`, `/olv logtest` (write a marker line and confirm it reaches the chat log),
`/olv diag clog` / `/olv diag discord` (read-only diagnostics, results in SavedVariables), `/olv sync` (export the
roster and reload, the panel's **Sync & reload**), `/olv status`, `/olv members [text]` (0.6.4: the Members window —
every guild member with verified or not, Discord username and display name, filter and sort; the panel's **Members**
button opens it too); the flush key binding; the pill button (left: send next, right: panel).

## Configuration knobs (wrangler.toml)
`ADMISSION_MODE=review` keeps the human decision (card + Approve button in #recruitment-review, matching the
handbook's admission model); `auto` queues the invite the moment the code is confirmed. `SET_NICKNAME` and
`SET_GUILD_NOTE` are independent. `ROSTER_MIN_MEMBERS` and `ROSTER_MAX_SHRINK_PCT` (10 by default) are the
truncated-export guards: a snapshot below the floor, or more than that percentage smaller than the one before it, is
stored but removes no roles and leaves a warning in the server log — `/olympus-admin sync` is how you re-apply the
latest snapshot once you are satisfied it is good. Since .115 two exports are refused whole (HTTP 422, nothing stored,
the last export still stands, one server-log line every six hours while it lasts): one that names a character twice
once case, spaces and a realm after a hyphen are ignored (`roster.duplicate_names`; every export is refused until each
name appears once, so rename or remove one character of each pair the log names, `docs/launch-runbook.md` section
10), and one whose member rows were not all stored (`roster.ingest_unusable`). And `/olympus-admin sync` refuses,
changing nothing, a snapshot still being written or storing fewer member rows than its export listed ("Nothing
applied", `admin.sync_refused`): run it again once `/olympus-admin roster` shows a newer snapshot number. `ROLE_GUILD_MASTER` and `ROLE_RAID_LEADER` name the two roles
added to the staff gates on 18 Sep, and `CHANNEL_MOD_ALERTS` is where the ban card and the officer-rank report go.
`OFFICER_RANK_NAMES` lists the in-game ranks that count as officers: when a roster export shows someone at one of
them without the Discord Officer role, the bot reports the mismatch to #mod-alerts. It never grants the role, and
could not — its own role sits below Officer. `BLOCKING_ROLE_IDS` (since .55) lists roles whose holders never receive
Guild Member and lose it while held (Quarantine, Flagellant in Asmongold's server); `BAN_BUTTON_ENABLED` shows the
"Ban from Discord" button on the ban card only once the bot holds Ban Members. `ROLE_MODERATOR` is report-only since
.55 (departure lines), not an officer.

`QUEUE_CLAIM_TTL_MINUTES` (15) and `QUEUE_CLAIM_LIMIT` (25) govern the invite queue when more than one officer runs
the addon: each watcher keeps the rows it holds and refreshes that hold on every poll, takes new rows only into its
spare places, and a hold that goes unrefreshed for the TTL is offered to someone else. `QUEUE_CLAIM_PRIORITY_EXTRA`
(10, build .41) lets reserved names from the guild site go on top of a full hand, so they are never stuck behind rows
an officer cannot invite yet. With one officer nothing else changes.

The guild site (build .41): `SITE_HOST` (`guild.roachcouncil.com`), `SITE_GUILD_ID` (the server whose members may
sign in: Asmongold's), `SITE_ADMINS` (Discord ids that see the admin pages: results, applications, reserved names),
`SITE_JOIN_URL` (an invite link shown to people who are not in that server; empty shows none),
`NAME_RESERVATION_AT` and `LAUNCH_AT` (defaults for the countdown and for queueing reserved names; the admin
Settings page overrides both) and `NAMES_PER_RUN` (5: linked members whose Discord names the cron re-reads).

## A second officer

`GET /queue` hands each watcher only the invites it has claimed, so two officers can run the addon at once without
both inviting the same applicant. The claim is keyed on `officer_id` in `watcher/config.json`, which defaults to the
normalized `officer_character` and so needs no configuration for a second PC beyond the usual token, secret and paths.
A claim is refreshed on every poll and lapses after `QUEUE_CLAIM_TTL_MINUTES`, so an officer who closes the game hands
their queue back by themselves rather than stranding it. Since build .41 claims are sticky: rows an officer holds stay
theirs while their watcher polls, even when reserved names arrive ahead of them, because the game client reads the
queue file only at `/reload` and a row handed to someone else could still be invited from the first client.

The addon side matters as much as the Worker side: an entry that disappears from `OlympusQueue.lua` is withdrawn from
the client's queue rather than left to fire. That covers a reclaim by the other officer, and — independently of any of
this — an invite cancelled in Discord by `/olympus-admin ban` or `unbind`, which until 18 September was still sent by
whichever client already held it. Only untouched worker-sourced rows are dropped: anything queued from a whisper, and
anything already invited, is left alone, and a missing or unparseable queue file changes nothing.

`/olympus-admin queue` names the holder of each row, so "who is going to send this one" is answerable from Discord.

## The guild site (build .41, .43, .44, .45, .46)

`https://guild.roachcouncil.com` is served by the same Worker (`SITE_HOST`; the page and its API in `src/site*.ts`,
the script, styles, logo and game art in `worker/public/static/`). People sign in with Discord (`identify
guilds.members.read`, nothing else) and only members of Asmongold's server get past the door. There they apply for a
position (twenty, from Co-Guild Master and Guild Master of a later Olympus through Officer, Raid Leader and Raid
Assist for NA or EU raids, Class Lead, Leveling Lead and Liaison to Raider, PvP Team and Member; the Roles page, the
one page open without signing in, says what each involves and what it comes with in game) with up to two backup
choices, a weekly grid of when they play and, optionally, the professions they plan to take; vote for or against the
leadership applicants on the voting board (names shown, counts for `SITE_ADMINS` only); write in people who should be
considered; list friends they want to bring; and from the day Blizzard's name reservation opens enter up to three
reserved names. Joke or abusive applications are denied for good. The admin pages (applications, board and write-in
tallies, professions, availability, reserved names, friends, lookup, settings, CSV downloads) show only to
`SITE_ADMINS`. Settings can also mark roles as appointed, which takes them off the form, the board and the write-ins
(the Treasurer starts appointed), and roles as chosen without a public vote, which keeps their applications but has no
board or write-ins for them (the Co-Guild Master starts that way).

Reserved names do not invite anyone and do not link anything. An admin approves the ones promised a seat, and from
`LAUNCH_AT` those go to the top of the invite queue (`invite_queue.priority = 1`, `src/site-queue.ts`); an officer
still presses the key for each invite, and the player still whispers their code to link Discord.

Since .43 the site wears the game's own interface art and fonts, made from the local client's textures by
`tools/build-site-assets.py` (a free, non-commercial fan site, like olympus.roachcouncil.com/guild; the footer credits
Blizzard and says the site is not affiliated with it); since .86 account pictures are class icons and every image and
font is from the game client (the owner's instruction of 1 Oct 2026), with one exception since .111: the brand and tab icon
are the Olympus crest `olympus-icon.png` again, the logo of guild.roachcouncil.com (the owner's decision of 1 Oct 2026). The privacy
policy and terms are the tracked `policies/privacy.html` and `policies/terms.html`: since .65 the Worker serves them
itself at `/privacy` and `/terms` (on the site host and the bot host, public, no sign-in; `worker/src/policy-content.ts`
is generated from them by `worker/scripts/build-policy-content.mjs`, and `npm run check:policies` fails when it is
stale), and the GitHub Pages mirror (repo `SturmFernmelder/olympus-verify-policies`) publishes the same files. There is
no member "Delete my data": staff delete on request from the admin page, and since .82 the private request form
(`#/request`, no sign-in) is the way to ask without Discord. Since .71 a signed-in member downloads their own copy at
`/api/me/export`: a curated copy of the account-keyed records (their own labels and free text as they wrote them; no staff
notes, reasons or identities, no raw roster snapshots, no private details of recorded payments, no separately collected
records belonging to other accounts (their own labels, free text and reference context may name people, as they wrote
them), and not the anonymous request conversations, which are keyed by case number, not by account), paged with a continuation
cursor, five downloads an hour; the file says inside what it leaves out. Setup and rollout: `docs/deploy-checklist.md`,
"Worker .41" to "Worker .46"; design notes: `docs/design.md`,
"29 September" and "30 September".

## When the guild is full

The member cap is real and close: the probe read `GetNumGuildMembers()` at 450/422 early on 17 September and
**1000/829** an hour later, a round thousand that stopped growing, after which invites answer "Guild is full."

The addon does not solve that by removing anyone. When the server refuses an invite for space it ranks who *could* go
and leaves the decision to a person. The ranking is longest-away-first with a lower level as the tiebreak, and it
excludes anyone currently online, anyone at or above `protectRankIndex` (Guild Master and Officer by default), anyone
whose public or officer note contains the `holdNote` word, and anyone seen more recently than `minDaysOffline`. Those
guards matter more than the sort: `GetGuildRosterLastOnline` returns a *duration* and reads zero for anyone online, so
an unguarded "longest offline" list puts the people playing right now at the top of it. The in-game ladder decision
changed on 3 Oct 2026 (owner answer 6: ten ranks, the Treasurer at index 2 right below Officer, no Probation), and its
planner preset and in-game steps come in a later release.

The shortlist appears in the officer panel with the evidence beside each name, and each removal takes two clicks — the
first arms it, the second performs it — so one hardware event performs one `Uninvite`. The same shortlist is posted to
the staff channel, at most once an hour, so the choice is visible to the other officers rather than happening quietly
in one client. Whether the client even allows an addon to remove a member is still untested (item 13 in
`docs/beta-test-plan.md`); if it refuses, the panel says so and keeps ranking, and you use `/gkick`.

A removal made for space is reported as its own kind of event rather than an ordinary departure. The Worker posts a
different log line, keeps the person's verification binding so a re-invite needs no new code, and posts a status notice
in the notices channel saying there is an update for them (the bot never DMs, since 25 Sep 2026; `/verify-status` tells
them the guild filled up and nothing is held against them). Meanwhile anyone verified and waiting is told where they stand:
`/verify-status` and the guide's **My status** button report "the guild is currently full; you are #N in line" instead
of a queue entry that silently never moves.

Since build .115 (3 Oct 2026) the Worker also reads a full guild from the roster itself (`worker/src/guild-seats.ts`):
the guild counts as full when the latest roster export is complete, trusted against the last trusted export, from on or
after `LINKS_NOT_BEFORE`, less than 48 hours old, and counts at least `GUILD_MEMBER_CAP` members (unset: 1000; only 900
to 1000 is accepted, anything else counts as 1000); or when an invite was refused for space within the last six hours
(on or after `LINKS_NOT_BEFORE`) and, when that export decides, after it. `/verify-status`, Home and Apply then say so
plainly, with the hour of that evidence and the member's own places in line (computed from their own queue rows); the
staff commands, the admin overview and the watcher's `/health` show the state with exact times. Anything less certain is
"unknown", and nothing is claimed. The state is informational only: it changes no queue row, code, role or invite
attempt. After a genuine large shrink the latest export stays distrusted until an officer runs `/olympus-admin sync`,
which also vouches for it as the seat count.

## Tests already run (17–18 Sep 2026)
- `worker`: `tsc --noEmit` clean; `wrangler deploy --dry-run` bundles; `npm test` and `npm run check:vectors` pass.
- Code spec: Python, TypeScript and Lua produce identical codes for all 12 vectors in `watcher/tests/vectors.json`
  (four of them non-ASCII character names, each vector now also carrying its `joinToken`); the Lua SHA-256/HMAC
  passes the FIPS/RFC 4231 known answers. The vectors are checked from all three sides — the Python suite, the addon
  harness and `worker/scripts/check-vectors.mjs` — so no implementation can drift unnoticed.
- `watcher`: 15 unit tests (tail without replay, partial lines, dedupe, SavedVariables parser incl. escapes/long
  strings, queue rendering, and since 18 Sep: the outbox surviving an outage and a restart, a zero-byte log, a
  recreated log, carriage-return escaping, queue-hash stability, a signed join trusted and a forged emote not) pass.
- `addon`: `addon/test/harness.lua` exercises whisper/mail intake, queue-file merge, flush, note-after-join and
  roster export against stubbed WoW APIs, and checks the Lua against all 12 vectors.

Not yet tested, because it needs the beta client and a live Discord app: `docs/beta-test-plan.md`.

## Repository, checks and deploys (30 Sep 2026)

Since the consolidation with Olympus Forever began, this folder is a git repository (`main`; the .46 tree as found is
commit `0a29611`). `CLAUDE.md` (and `AGENTS.md`, which points to it) holds the rules for the two agents: commands,
what never to run, conventions, ownership and the owner gates. The task log is
`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`.

- **Checks:** from `worker/`, `npm run test:all` (typecheck, the code vectors, every node suite); the SQL suites with
  `python tests/*.py`; from `watcher/`, `python tests/test_watcher.py` and `python tests/test_discord_relay.py`; the
  tools tests `python tools/tests/*.py`; the addon suites through the lupa venv (`addon/tests/run_lua_suites.py`).
  `.github/workflows/ci.yml` runs all of that, plus a Gitleaks history scan and a dry-run bundle, once the repository
  is on GitHub.
- **Deploys** are the owner's, from an exact commit both agents signed: `bash scripts/deploy-commit.sh <sha>` from the
  repository root exports that commit and runs the project's wrangler against the export, so the working folder is
  never uploaded. `/health` then names the build (since .49 the public answer is `ok`, `build` and `d1` only; the
  inventory of secrets, config and online officers needs the watcher's bearer). `npm run deploy` still exists but
  deploys whatever is on disk.
- **Secrets** and where they live: `SECURITY.md`. `worker/.dev.vars.example` is the only template; `.dev.vars`,
  `watcher/config.json` and `Config.lua` are ignored.

## Licence and notices

This repository is proprietary: all rights reserved, see `LICENSE`. Making it publicly visible is not a licence. The
World of Warcraft interface artwork, icons and the two interface fonts the site uses are not the owner's and are not
licensed by it; `THIRD_PARTY_NOTICES.md` lists them with their provenance, and `worker/public/static/wow/asset-provenance.json`
records each file's origin. `docs/source-provenance.md` says what is tracked and what never is, how the generated and
derived files are made, and how a public snapshot of the repository is prepared with the helpers under `scripts/`.
