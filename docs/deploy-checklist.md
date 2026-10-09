# Deploy checklist — what is yours, what is done, what I verify afterwards

> **Historical record, not the current procedure.** This file is the build-by-build log since September 2026, kept as
> written. Its opening lines and the undated sections "Already filled in `worker/wrangler.toml`" and "Your part" record
> the first installation: a new D1 database, `npm run db:init` against the remote database, every secret set, `npm run
> deploy` from a working folder and `npm run register`. None of that is repeated. The keeper Worker, its D1 database
> `olympus-verify` with its data, and its secrets already exist: no current step runs an initializer, creates a
> database, or resets the database or the secrets. The current procedure is `docs/launch-runbook.md`: the owner takes
> and verifies a private D1 backup before a deploy that migrates the database, then deploys an exact release-qualified
> commit from its `git archive` with `bash scripts/deploy-commit.sh <sha>`; the never-run list in `CLAUDE.md` applies
> to agents throughout. Each dated section below records what was true and done on its date.
>
> **Current qualification (3 Oct 2026):** the owner instructed Codex to take over after Claude's usage limit and finish
> without dual sign-off. Prospective actions use Codex's exact-commit qualification, attributable peer evidence and
> the unchanged substantive source/live/owner gates (`docs/launch-runbook.md` section 0). Historical dual signatures
> remain records of their actual scopes; this instruction is not new Claude approval.

Two things stay with you by design: secrets (bot token, client secret, the shared secrets) and the Cloudflare login.
Everything else in the Discord Developer Portal and on the server is done or scripted.



## "I left my old guild" — 21 September 2026

Build `.31`, addon `0.3.2`. Being in another guild was the commonest refusal and the only one the applicant can
actually fix — 131 of 162 refusals on 19 Sep. The old reply told them to `/gquit` and wait, which is the worst of
both worlds: they pay the whole cost of leaving immediately and get nothing back until the queue happens to reach
them again.

Now the refusal whisper carries their own verification code (`OlympusHmac.codeFor`, recomputed from the shared
secret — the same code `/verify` already showed them, not a second credential). Whispering it back is how they say
"done". The watcher forwards it on the existing code path with no changes; `postVerify` previously answered
`no_pending` for an already-verified character and now checks for a row held behind an `in_another_guild` backoff
first.

**Nothing is granted.** The row already exists and already holds its original low id; the refusal only parked it
behind a `retry_after`. Clearing that makes it servable again *at its original position*, which is exactly what
the whisper promised. They jump nobody — they were at the front when we tried to invite them, which is why we
tried. The attempt the refusal charged is refunded, so doing what we asked does not cost someone their
`INVITE_MAX_ATTEMPTS` budget faster than ignoring us would.

The invite itself is still a click. `C_GuildInfo.Invite` needs a hardware event and each event allows exactly one
protected call, so no whisper can fire an invite. What automation buys here is that the row goes from parked to
top-of-list without anyone noticing it happen: the panel prints a line, rings the new-invite alert, and the row
reads `LEFT THEIR GUILD - invite now` instead of `waiting for a click`.

**No seat-gating was needed.** The panel's full-guild gate already disables both the send button and the per-row
Invite buttons from the live client roster count, so an `in_another_guild` refusal can only happen when a seat
existed. Nobody is asked to leave their guild while the cap is full.

`ApplicantCode` guards the name explicitly rather than trusting `codeFor` to reject a nil. A future
`normalizeCharacter` that turned nil into `""` would otherwise whisper a code computed for an empty name — which
the watcher refuses, so the applicant would follow the instructions exactly and silently get nowhere.

## Two ways a deploy lies about being live — 20 September 2026

Both cost time on 20 Sep, both look exactly like a broken code change, and neither is one.

**`/health` is cached.** Reading it straight after a deploy can return an older build — on 20 Sep it served
`.13` from 18 Sep, alongside a `rosterGuard.minMembers` of `0` that the deploy output on screen plainly showed as
`800`. Always append a cache-buster that has not been used before: `GET /health?cb=<anything new>`.

**A deploy is live at Cloudflare before every edge serves it.** `wrangler deploy` returning `Current Version ID`
means the version exists, not that the next request gets it. A `/admin/guild-map` pulled three seconds after a
deploy came back from the *previous* build and reported three permission bits as unknown that the new build
decodes — which reads as "the fix did not work" and is really "the fix was not there yet".

Build `.28` stamps the Worker build into the map itself and `guild-map.py` prints it on every run, so an artifact
meant for rebuilding a server elsewhere always says which code produced it. The general rule for anything else:
after `npm run deploy`, confirm the build through `/health?cb=<new>` **before** running the thing that depends on
it, rather than immediately after.

## Role backfill — 20 September 2026

Build `.26` adds `GET /admin/backfill-roles`, dry until `&apply=1`. It exists because `promote()` grants
ROLE_GUILD_MEMBER on the *transition* into membership and every caller guards it with `status !== "member"`. That
is right while the server stays put — a member must not be re-granted the role on every roster pass — and becomes
a trap the moment `GUILD_ID` changes, because the role lives in Discord and the status lives in D1. After a move,
everyone already at `status='member'` arrives with no role and is skipped by every future roster pass for exactly
the reason above.

Idempotent (it skips anyone already holding the role), explicitly paged so one call cannot walk the whole
membership unattended, and it stops on the first 403 because that means the bot's role is below the one it is
granting and every remaining row would fail identically. See `docs/asmongold-move.md` step 15.

## Server map for the Asmongold move — 20 September 2026

Build `.25` adds `GET /admin/guild-map`, behind the same bearer token as the watcher, returning the whole Discord
server as one object: guild settings, every role with its permission bitfield decoded into names, every category
and channel, and every permission overwrite. `tools/guild-map.py` fetches it and writes `tools/out/guild-map.json`
plus a readable `guild-map.md`.

It is **read-only by design**. Creating roles and channels inside a community this bot does not own is
irreversible and visible to everyone in it, so the output is a plan a human applies, never something the bot
applies itself.

The report leads with what the bot can actually do here — whether it holds Manage Roles, and which roles outrank
it, since a role can only be granted or edited from strictly below. It then resolves every id in `wrangler.toml`
against the live server, which doubles as the post-move checklist: ten ids change (`GUILD_ID`, six `ROLE_*`, three
`CHANNEL_*`) and `DISCORD_APP_ID` does not, because it is the same app.

Four things never port by themselves, and the report flags each one where it appears: **managed roles** (they
belong to an integration — installing it in the destination is what creates them), **member-specific overwrites**
(the person has to be in the destination server first), **role ids**, and the **Linked Roles requirement**
`battlenet_linked = 1`, which is set per server under Server Settings → Roles → Links.

The permission decoder table was written in September 2026. Unrecognised bits are reported as `UNKNOWN_BIT_<n>`
rather than dropped, and the report warns at the top when any appear: a permission silently missing from a
migration manifest is far more dangerous than an ugly name in one.

## Queue order and place in line — 19 September 2026

Build `.24`, addon `0.3.1`. The officer panel was sorting the waiting group by timestamp, newest first, while
`Flush()` serves `db.queue` in array order — the Worker's `ORDER BY id`, oldest first. Two consequences, both
reproduced against the shipped comparator in Lua 5.1 before the fix went in:

- **Steady state** (rows arriving in separate merges, so timestamps differ): the panel was exactly reversed. Eight
  rows queued a minute apart displayed `P8 P7 … P1` while the button served `P1`. The officer read the top of a
  list and invited someone off the other end of it.
- **Backlog state** (one `MergeQueueFile` pass, so every row shares a timestamp to the second): the sort key tied
  across the whole batch, and `table.sort` is quicksort and not stable, so the order was not reversed but
  arbitrary — 32 rows came back as `P1 P21 P22 P23 P20 P18 …`. This is the state the panel was in all of 19 Sep,
  when 32 entries all read "17m ago".

The waiting group now sorts by the Worker's row id, which is the key `Flush()` actually serves on, and every group
carries `db.queue` order as a final tiebreak so equal keys stop being scrambled. A row queued here from a whisper
has no Worker id yet and stays ahead of the numbered ones.

Each row also shows its place in line. The number is the Worker's, not the row's index in the panel: `getQueue`
claims a slice (`ORDER BY id LIMIT QUEUE_CLAIM_LIMIT`), so numbering the returned array would give a second officer
their own "1", and `/verify-status` already quotes `waitlistPosition()` to the applicant. Both now count the same
rows on the same basis — `status IN ('queued','written')` with **no** `retry_after` filter, because a row backing
off after a refusal is still ahead of you and still gets served first.

It is computed as a second `SELECT` of ids rather than `ROW_NUMBER() OVER (ORDER BY id)`. The ready set is tens of
rows so the cost is noise, and a window function D1 turned out to reject at runtime would take down the only path
any applicant has into the guild.

The number renders in the status column, not a column of its own: the row is laid out right to left to finish 14px
inside the frame border, and the name column is already at its limit at 22 characters.

**Rollout order matters, and it bit this deploy.** The watcher hashes the *raw entries the Worker returned*, not
the file it renders from them — so a field added on the Worker changes the hash even while the watcher is still
running old code. Deploying `.24` and then restarting the watcher meant the old process polled once in between,
received entries that already carried `position`, stored that hash and wrote the file in the old format. The
restarted process computed the identical hash, correctly concluded nothing had changed, and never rewrote. The
queue file stayed frozen in the old format with no error anywhere, and at the member cap — where the queue does
not change on its own — it would have stayed that way for hours.

Restart the watcher **first**, or force one write afterwards. `rm` is not permitted in the connected folder, and
clearing `queue_hash` in `watcher-state.json` does nothing while the process is running because it holds state in
memory, so the working move is to rename the queue file aside: `queue_file.exists()` goes false and the next poll
writes. The addon tolerates a missing queue file by design — `MergeQueueFile` returns early rather than clearing
anything — so the gap costs nothing.

**Also on 19 Sep:** the addon in `olympus-verify\addon\OlympusVerify` had drifted a full day behind the copy WoW
actually loads — every change since 18 Sep 19:53 existed only under `D:\Program Files (x86)\World of Warcraft`,
which OneDrive does not back up. The live copy is now the source and has been copied back. `Config.lua` (the shared
secret, gitignored) and `OlympusQueue.lua` (generated, holds applicant names) are deliberately not copied.

## Telling the applicant why — 19 September 2026

Build `.18` made refusals differentiated, retried and eventually expired, and told **staff** about each one. It still
told the **applicant** nothing, and they are the only person who can act on the commonest refusal: 131 of the 162
failures that day were "already in a guild", which no amount of retrying fixes. Those people were verified, in the
queue, and waiting on an invite that could never arrive.

Build `.19` closes that. Three channels, because no single one reaches everybody:

- **In-game whisper, at the moment of refusal** (addon). The server only names a character it found, so anyone who
  gets this refusal is online and the whisper lands. `NoticeApplicant` is keyed by character rather than by queue
  row — the Worker re-serves a refused invite every few hours and each pass arrives as a fresh row — and capped at
  once a day, three times ever. "Not found" deliberately sends nothing: they are offline, so there is nobody to tell.
- **`/verify-status`** (Worker). The reason is stored on the queue row (`last_reason`, migration
  `2026-09-19-refusal-reason.sql`) and read back in plain language, with the fix. This is the one that matters for
  the backlog: a slash command reaches people who are not online and whose DMs are barred.
- **DM**, through the existing `notify()`. A no-op today — see the breaker below — and live again the day the
  appeal is granted.

Two fixes that came out of writing it:

- **A full guild no longer burns the applicant's attempts in the addon**, which is how the Worker has counted since
  `.18`. Otherwise waiting out the cap silently used up their five tries and the entry died of our problem.
- **"Has already been invited to a guild"** was being treated as a hard refusal and marked failed. It expires in
  seconds. It now re-queues, and it no longer collides with "is already in a guild", which is a different sentence
  with a different fix.

And one that matters for the appeal:

- **The DM path shuts itself when Discord returns the app-level anti-spam 403.** Every send while that flag is up is
  a rejected request against an application under anti-spam review. The first such answer stops the path for six
  hours, then one probe goes out to see whether it has been lifted. Recipient-level failures (closed DMs, 50007) are
  unaffected and still counted as before.

Deploy:

```
npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-19-refusal-reason.sql
npm run deploy
```

Then `/reload` in game to pick up the addon change. `GET /health` must report `2026-09-19.19 refusal-notices`.


## Invite queue retry and expiry — 19 September 2026

`invited` was a terminal state. `getQueue` serves only `queued` and `written`, so an invite that fired and was never
accepted parked forever, and a refusal left the row `queued` to be re-served on every single poll. On 19 September
that produced 91 people stuck in `invited` — verified, one attempt each, then silence — while ~50 others were
retried 3–9 times apiece because they were simply still in another guild, which the game refuses an invite for.
Nobody was told any of it: the Discord quarantine was rejecting every DM at the same time.

Build `.18`:

- **`attempts` / `retry_after`** on `invite_queue` (migration `2026-09-19-invite-retry.sql`). `getQueue` skips a row
  whose `retry_after` is still in the future, so a hard refusal costs one key press instead of one per poll.
- **Refusals are read, not just logged.** "Guild is full" retries in 15 minutes and does **not** count against the
  applicant, because it is our constraint. "Already in a guild" backs off 6 hours and names them in the staff channel
  once, because only they can fix it. Anything else waits 30 minutes.
- **`invited` is no longer terminal**: it carries a 30-minute recheck, and the half-hourly cron (previously a no-op
  beyond the Phase 3 stub) puts unaccepted invites back in the queue.
- **Expiry**: after `INVITE_MAX_ATTEMPTS` (6) refusals the row is retired and staff told. The person stays verified,
  so `/verify` puts them back.

Deploy:

```
npx wrangler@4.135.0 d1 execute olympus-verify --remote --file=migrations/2026-09-19-invite-retry.sql
npm run deploy
```

~~Note: wrangler 4.134.0 returns `code: 7403` on `d1 execute --command` against this account; 4.135.0 works.~~
**Wrong — corrected 19 Sep 14:15 UTC.** 4.135.0 then produced the same `7403` on a command it had run four times
in the preceding hour, and `--file` separately returned `Authentication error [code: 10000]` against `/import`. Two
endpoints, two client versions, intermittent: the variable is the **OAuth access token**, not wrangler. `whoami`
keeps working because it refreshes on its own path. Fix: `npx wrangler login` to refresh, or create a scoped API
token in the dashboard and set `CLOUDFLARE_API_TOKEN` — API tokens do not expire, so they end this for good.

The upgrade to 4.135.0 is still worth keeping; it just was not the fix it looked like.


## Discord application flag — 18 September 2026

Discord's automated anti-spam system flagged the application: *"This application has been flagged for abusive
behavior pending review, and is currently unable to be authorized to any additional servers or users."* Existing
authorizations keep working, so the bot still functions inside Olympus; only **new** user or server authorizations
are blocked, which kills the `/linked-role` Battle.net path until it clears.

Most likely trigger: burst DMs. `promote()` and `demote()` each DM the person, and both are called from a loop over
the roster diff in `ingestRoster` / `syncFromLatest`, so one large snapshot swing sends one DM per affected member.
The deployed build (`.9`) predates the truncated-export and shrink guards, and the roster moved from ~450 to 1000
members on 17–18 September.

Remediation shipped in build `.13`, all of it deployable without touching D1:

- **`src/dm.ts`** — every DM in the Worker now goes through `notify()`, which counts `dm.sent` audit rows in a
  60-second sliding window and drops anything over `DM_RATE_CAP` (default 5). Dropped notices are audited as
  `dm.suppressed` and announced once per window in the server log. Nothing queues and nothing retries, so a burst is
  structurally impossible rather than merely unlikely.
- **DM footer** — each DM now says why the recipient is getting it and that the bot only messages about their own
  access.
- **`src/pages.ts`** — `/privacy` and `/terms` (also served at `/tos` and `/terms-of-service`, because the
  Developer Portal rejects the `/terms` spelling in its Terms field while accepting `/privacy` on the same host).
  Set both as the application's Privacy Policy and Terms of Service
  URLs in the Developer Portal; an app that DMs users with neither set reviews badly.
- **Battle.net interstitial** — `/oauth/callback` no longer 302s straight to `oauth.battle.net`. It renders one page
  naming the domain and stating that the password is never visible to the bot. A silent hop from a Discord grant to a
  third-party login form is the shape of a credential-phishing chain; this removes that signature.

Portal fields to set before appealing: Privacy Policy URL `https://sturmfernmelder.github.io/olympus-verify-policies/privacy.html`,
Terms of Service URL `https://sturmfernmelder.github.io/olympus-verify-policies/terms.html` — the portal rejects every URL on the
`workers.dev` host, so the canonical copies live on GitHub Pages (repo `SturmFernmelder/olympus-verify-policies`)
while the Worker keeps serving identical pages at `/privacy` and `/tos`, and a description naming the single guild it serves.


## Already filled in `worker/wrangler.toml`
> Historical (the first installation, September 2026): these are not the current values; `worker/wrangler.toml` is.
| var | value | source |
|---|---|---|
| `GUILD_ID` | `1549537348516188200` | Olympus |
| `ROLE_OFFICER` | `1549581672272625734` | read from the client |
| `ROLE_MODERATOR` | `1549581792015814676` | read from the client |
| `ROLE_GUILD_LEADER` | `1549581882549608579` | read from the client |
| `ROLE_GUILD_MASTER` | `1549892601170108416` | added 18 Sep — same admin rights as Guild Leader; `""` if unused |
| `ROLE_RAID_LEADER` | `1549581447768186960` | added 18 Sep — no bot rights; named so a departure line can say the person still has channel access |
| `ROLE_GUILD_MEMBER` | `1549581282227265566` | Server Settings → Roles |
| `CHANNEL_RECRUITMENT_REVIEW` | `1549586960115433532` | #recruitment-review |
| `CHANNEL_SERVER_LOG` | `1549586995389538394` | #server-log |
| `CHANNEL_MOD_ALERTS` | `1549586975407738891` | #mod-alerts — ban cards and the officer-rank report (`""` falls back to the review channel) |
| `OFFICER_RANK_NAMES` | `""` | in-game rank names that ought to hold the Discord Officer role, comma separated. Setting it turns on the mismatch report to #mod-alerts; the bot never grants the role |
| `ROSTER_MIN_MEMBERS` | `0` | truncated-export guard: no roles come off an export smaller than this (0 = no floor) |
| `ROSTER_MAX_SHRINK_PCT` | `10` | truncated-export guard: no roles come off an export more than this much smaller than the previous one |
| `DISCORD_APP_ID` (a var — public value) | `1550176895671341076` | Developer Portal: app "Olympus Verify", bot role `1550178134878584934` |
| `PUBLIC_BASE_URL` | `https://olympus-verify.<your-subdomain>.workers.dev` | your workers.dev subdomain (Workers & Pages → Overview) |

## Your part — PowerShell, from `olympus-verify\worker`
> Historical (the first installation, September 2026), never run again: no new D1 database, no `db:init`, no secret
> reset, no deploy from a working folder. The current steps are in `docs/launch-runbook.md`.
```powershell
npm install
npx wrangler login                          # browser OAuth to your Cloudflare account
npx wrangler d1 create olympus-verify       # copy database_id into wrangler.toml
npm run db:init                             # applies schema.sql remotely
# set PUBLIC_BASE_URL in wrangler.toml to your workers.dev URL (or a custom route) before the first deploy
npx wrangler secret put DISCORD_PUBLIC_KEY  # General Information → Public Key
npx wrangler secret put DISCORD_BOT_TOKEN   # Bot → Reset Token → copy once
npx wrangler secret put DISCORD_CLIENT_SECRET   # OAuth2 → Client Secret → Reset → copy once
npx wrangler secret put VERIFY_SECRET       # 32+ random chars; ALSO goes in addon Config.lua and watcher config.json
npx wrangler secret put WATCHER_TOKEN       # 32+ random chars; ALSO goes in watcher config.json
npx wrangler secret put COOKIE_SECRET       # 32+ random chars
npx wrangler secret put BNET_CLIENT_ID      # develop.battle.net client; redirect <PUBLIC_BASE_URL>/bnet/link
npx wrangler secret put BNET_CLIENT_SECRET  # required since 18 Sep, not a fallback — the link goes via Battle.net
npm test                                    # the Worker's unit tests
npm run check:vectors                       # the TypeScript code spec against watcher/tests/vectors.json
npm run deploy
$env:DISCORD_APP_ID="1550176895671341076"; $env:DISCORD_BOT_TOKEN="..."; npm run register   # metadata + slash commands (token stays in your shell)
```
Random strings: `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }) -as [byte[]])` or `openssl rand -base64 32`.

## Done in the Developer Portal and on the server (17 Sep, ~15:20 UTC)
- App **Olympus Verify** created (`1550176895671341076`), description set, install context guild-only, install link None
  (a private app cannot have a Discord-provided link — the invite used an explicit OAuth URL), Public Bot off, no code
  grant, no privileged intents.
- Authorized into Olympus with exactly Manage Roles, Manage Nicknames, View Channels, Send Messages, Read Message
  History (permissions integer 402721792) + `applications.commands`. Managed role `Olympus Verify` = `1550178134878584934`.
- Bot role dragged above `Guild Member` by the owner (position 16 of 22 after the Linked Role was added).

## Done after the deploy (17 Sep, 16:45–17:10 UTC)
- Worker live at `https://olympus-verify.roach-council.workers.dev`; `/health` shows all six secrets present and D1 ok
  (two secrets were missing on the first pass — the new `/health` made that visible; `WATCHER_TOKEN` and `COOKIE_SECRET` re-set).
- `register.mjs` now also sets the Interactions Endpoint URL and the Linked Roles URL through the API; the OAuth2 redirect was
  added in the portal by the owner.
- Linked Role **Battle.net Linked** (`1550188407244849253`, no permissions) created with the app requirement `Battle.net linked = true`.
- Smoke test from the owner's account: `/verify-status` → "Battle.net: not linked"; `/verify Fernmelder` → "Link your
  Battle.net account first"; `/linked-role` → Discord authorize → callback → "No Battle.net connection found" (the owner's
  Discord account has no Battle.net connection yet; nothing stored — the negative path, end to end).

## Done later on 17 Sep (21:50–23:00 UTC)
- Builds `.4`–`.6` deployed by the owner (notes off, joined status, one invite per press, `/health` build marker,
  connections diagnostics, Battle.net-login fallback). The Linked Role's Discord-connection path turned out dead:
  Discord's OAuth `connections` endpoint returns `twitch, xbox` for the owner and never `battlenet`, even after the
  connection was removed and re-added. Fallback: Blizzard's own login through a Battle.net API client
  (`BNET_CLIENT_ID`/`BNET_CLIENT_SECRET`, redirect `<PUBLIC_BASE_URL>/bnet/link`), owner-created at 23:07 UTC (client id `3809ee5e02844dd58594ea10dc6f5baf`); build `.6` live 23:13; the link ran end to end at 23:14 — **Linked**, BattleTag stored, role metadata pushed.

## Database migration before the 18 September deploy

The invite queue gained two columns for per-officer claims. `schema.sql` creates them for a fresh database, but the
live one already exists, so apply the migration once from `worker/`:

```
npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-18-officer-claims.sql
```

Re-running it is harmless — a duplicate-column error means it is already applied. The Worker tolerates the columns
being absent only in the sense that a single officer never hits the claim path; run it before relying on a second
officer, and before `/olympus-admin queue` will show a holder.

## Checks after the 18 September deploy (build `.11`)
- `GET /health` must report build `2026-09-18.11 officer-queue-claims`. An older marker means the deploy did not take
  and the roster guards, the trusted-event rules, `/olympus-admin sync` and the queue claims are not live yet.
- In game, `/olv logtest` writes a marker line and reports whether it came back out of `WoWChatLog.txt`. That is the
  path the signed join confirmation travels, so a join is only trustworthy once this passes on the officer's client.
- The **Ban from Discord** button on the #mod-alerts ban card needs the bot to hold **Ban Members**. That was granted
  on 18 September (the role's permission integer is now `402738180`), so the button should work; if it reports a
  missing permission, check that the bot's role still outranks the person being banned.
- `/olympus-admin roster` prints the guild's rank names with their indices and says whether `OFFICER_RANK_NAMES`
  matches any of them. One run settles that setting, which is currently an inference rather than a reading.
- `/olympus-admin queue` shows the holder of each queued invite once the migration above has been applied.

## What I do once the Worker answers `GET /health` (original plan, kept for reference)
1. Developer Portal → General Information → **Interactions Endpoint URL** = `https://<worker>/interactions` (Discord
   PINGs it; it only saves when the Worker verifies the signature — so this has to wait for your deploy).
2. Server Settings → Roles → the bot's role above **Guild Member**; a `Battle.net Linked` role with the app
   requirement (Links → add the app → `Battle.net linked` = true); command permissions so `/verify` needs that role.
3. Smoke test with my own account: `/linked-role` (my Discord account has no Battle.net connection, so I expect the
   "No Battle.net connection found" page — the negative path), `/verify Test` → the code appears, `/verify-status`.
   Then the watcher-side tests from `docs/beta-test-plan.md` with curl against `/ingest/verify`.
4. Report, and add the handbook section from `docs/handbook-addendum.md` to `olympus-owner-handbook-final.md`.

## Permission review after any structural change (22 Sep 2026)

`tools/guild-map.py --check` reads the live permission matrix and reports only the exceptions. Run it after every
category or role change, because Discord's UI will not tell you what it quietly skipped.

    cd olympus-verify\tools
    python guild-map.py --check --name guild-map-2026-09-22

The `--name` keeps each snapshot as its own before/after pair instead of overwriting the last one. To re-review a
snapshot you already pulled, without touching the Worker or the token:

    python guild-map.py --check --from out\guild-map.json

Severity means: **CRITICAL** — something private is visible to @everyone, or @everyone holds a permission from
`NEVER_FOR_EVERYONE`. **PROBLEM** — something meant to be public is still closed, or a retired category is still
present. **NOTE** — true today but fragile: a channel out of sync with its category, an overwrite for a role being
deleted, a permission pinned to one specific member. **INFO** — deliberate, recorded so it is not mistaken for a fault.

### The trap this exists for

A category's overwrites are **not** inherited at resolution time. Syncing copies them onto each child, and from then
on the child's own list is the whole story. So turning "Private Category" off rewrites only the children that are
currently in sync — any channel carrying even one extra overwrite keeps its `VIEW_CHANNEL` deny and stays invisible,
with no warning. On 20 Sep five channels were in that state: `guild-chat`, `pick-your-role`, `stream-alerts`,
`raid-announcements`, `loot-and-raid-rules`. `guild-chat` was caught by hand; the other four are why this check exists.

Intent lives in `DEFAULT_PUBLIC` / `DEFAULT_PRIVATE` / `DEFAULT_RETIRED` / `READ_ONLY_OK` at the top of the review
section. When the structure changes, change those lists in the same commit — a checker that encodes last month's
intent is worse than none.

## Build .32 — Battle.net made optional (25 Sep 2026)

`/verify` no longer requires a linked Battle.net account. The flow is now: slash command → code → in-game whisper.

**Why this is not only a simplification.** The bnet login requested `scope=openid` and nothing else, so it proved
"this Discord account holds BattleTag X" and said nothing about who controls the character. `wow.profile`, which
would have proved character ownership, is `bnet.ts` and still dormant behind `PHASE3_BNET_API=false`. The in-game
whisper was doing 100% of the verification work on its own. Removing the requirement therefore loses no assurance.

It also removes the only step the app quarantine can block. `/linked-role` redirects to Discord's own OAuth consent
screen, which the quarantine blocks — measured as 299 `link.started` against 0 `link.bnet_login_started` in one hour
on 21 Sep. Slash commands and in-game whispers are unaffected, so after .32 the pipeline no longer depends on
anything Discord has flagged.

**The trap in this change.** `characters.discord_id REFERENCES members(discord_id)`, and D1 enforces foreign keys by
default. Until .32 the *only* thing that created a `members` row was the Battle.net callback. Dropping the guard
without ensuring that row means `postVerify` fails on `INSERT INTO characters` with `FOREIGN KEY constraint failed` —
and because it is one `env.DB.batch()`, the `pending` row is not consumed either, so the applicant is stuck
permanently and re-whispering fails identically. `postVerify` now upserts the members row first, inside the batch.

Changed: `interactions.ts` (guard removed; `member.banned` → `member?.banned`, which would otherwise throw on every
first-time applicant now that `getMember` can return null), `ingest.ts` (members upsert), `guide.ts` (three steps →
two, Link Battle.net button removed), `pages.ts` (privacy copy), `index.ts` (build stamp).

### Deploy

    cd olympus-verify\worker
    npm run deploy
    curl.exe -s "https://<worker>/health?cb=b32" | findstr build

### Discord side, after deploying

1. **Server Settings → Integrations → Olympus Verify → `/verify`.** If command permissions restrict `/verify` to the
   `Battle.net Linked` role, remove that restriction — otherwise nothing above matters, because that role has 0
   members and nobody can invoke the command.
2. **Server Settings → Roles → `Battle.net Linked` → Links.** The `battlenet_linked = 1` requirement can come off;
   the role has 0 members and 0 channel overwrites, so deleting the role is also fine.
3. **Repost the guide** with `/olympus-admin post-guide` — the embed changed and the old pinned copy still shows
   three steps and a Link Battle.net button.

Still referencing channels that are going away: `#help-desk` in `guide.ts`, `interactions.ts`, `oauth.ts`,
`review.ts`, and `#join-guild` in `guide.ts`. Repoint these when the replacement channel is decided.

### `/olympus-admin refresh-guide` (added with .32)

The pinned guide is one of the bot's own messages. Discord lets only a message's author edit it, and the author is
the bot — so no human account, owner included, can edit that pinned message from the UI. `post-guide` posts a second
copy and leaves the stale pinned one in place.

`refresh-guide` resolves the bot's own pinned message in the channel and PATCHes it: same message id, same pin, same
position, same message link, new text. It refuses rather than guesses when the channel has no pinned bot message, or
more than one.

It reads pins from `GET /channels/{id}/messages/pins` and falls back to the deprecated `GET /channels/{id}/pins`,
since the two return different shapes (`{items:[{message}]}` vs a bare array).

Adding a subcommand means the command list has to be re-registered, or Discord will not offer it:

    cd olympus-verify\worker
    npm run test
    npm run deploy
    npm run register

Then, in the channel holding the guide: `/olympus-admin refresh-guide`

**Before running it, decide where the guide lives.** It is pinned in `#join-guild`, which is inside VISITORS — the
category slated for deletion. Deleting the category deletes the channel and the pinned guide with it. Either move the
guide to a surviving channel with `post-guide` (then pin it, then delete the old) or keep `#join-guild` and drop it
from the deletion list.

## Permission review, 25 Sep 2026 — and build .33

### What went wrong first

`refresh-guide` failed with `Discord 401`, and the bot's reply blamed View Channel / Read Message History. A 401 is
not a permission failure: Discord answers **403** when the bot lacks permissions and **401** when it rejects the
bot's *token*. The token had been reset in the Developer Portal to run `npm run register`, which silently killed the
copy stored in the Worker. The fix was `npx wrangler secret put DISCORD_BOT_TOKEN`. In-game invites kept working the
whole time (the queue is D1-only in auto mode); role grants, nicknames, bans, log lines and `/admin/guild-map` did not.

.33 adds `explainDiscordError()` (discord.ts), so every bot-facing failure names the actual cause: 401 → token,
403/50001 → cannot see channel, 403/50013 → missing permission or hierarchy, 404/10011 → role deleted, and so on.

### Fixed in the browser (live, 25 Sep)

| Where | Was | Now |
|---|---|---|
| GUILD HALL, WAR ROOM categories | @everyone **Connect ✗** | neutral — reaches the 7 synced voice channels |
| `#raid-announcements`, `#loot-and-raid-rules`, `#stream-alerts`, `#pick-your-role` | @everyone **View ✗** (out of sync; toggle never reached them) | View neutral, **Send ✗ kept** — visible and read-only |
| MEE6 role | **Administrator** (bypassed every overwrite, read OFFICER COUNCIL) | off; its explicit permissions unchanged |

Why voice was broken: making a category private denies @everyone *both* View Channel and Connect. Turning the
toggle back off cleared only View. Guild Member holders could still join (their role overwrite allows Connect), which
is why nobody noticed — everyone else saw the rooms and could not enter.

Why the four channels were not synced instead: "Sync Now" copies the category's list, which would also have deleted
the Send-deny that makes them read-only.

Verify with: `python guild-map.py --check --name guild-map-2026-09-25b`

### Worker changes in .33

`promote()` set the nickname *after* the Guild Member grant inside one `try`, so any role failure — including the
role having been deleted — silently stopped nicknames too. The role grant is now optional (`ROLE_GUILD_MEMBER` may be
empty) and independent of the nickname and welcome. `demote()` and the ban path skip role removal when the role is
unset. Guide and `/verify` copy follow the configuration instead of asserting a role that may not exist.

### Checker changes

`guild-map.py --check` now resolves permissions with Discord's own algorithm (base role → @everyone overwrite → role
overwrites → member overwrite, Administrator short-circuit, no category layering), unit-tested in 8 cases. It checks
voice Connect/Speak, forum replies, read-only channels that became postable, server-level role permissions,
Administrator holders, retired roles and what deleting them takes away, cosmetic roles, staff-role inversions, bot
hierarchy, who can see each staff-only category, and whether the bot can post in every channel it is wired to.

### Still open — decisions, not bugs

1. **Guild Member (96 holders) is the only non-staff source of Attach Files, Embed Links and Create Polls.** Deleting
   it takes screenshots, clips and link previews away from all of them. Options: keep it as the "verified guildie"
   perk (the bot grants it again now that .32 removed Battle.net), give @everyone those three server-wide, or allow
   them per-channel for @everyone in the media channels.
2. Delete: VISITORS (after deciding the guide's home), SUPPORT TICKETS (empty), Battle.net Linked (0 members).
3. Guild Master (Asmongold) cannot see OFFICER COUNCIL or moderate *through that role* — moot, because he also holds
   Guild Leader. Officer and Raid Leader have 0 members.

## Build .34 + addon 0.4.0 — unverified members, rank filter, removal (25 Sep 2026)

### What it does

The Worker works out who is in the guild but has no verified character (`worker/src/unverified.ts`, the single
definition). The watcher carries that list into `OlympusQueue.lua`. In game, `/olv` → **Unverified** lists them lowest
rank first, with a rank filter (Initiate / Member / Veteran; Guild Master and Officer are protected and never
offered). **Macro** on a row aims the `OlvKick` macro at that member; pressing the macro removes them. `/olv unverified`
prints the same thing in chat, `/olv unverified Initiate,Member` filters, `/olv aim` aims at the top row.

The client forbids `C_GuildInfo.Uninvite` for addons (measured 19 Sep), so every removal is the officer's own
keypress on the macro, one person per press. The addon only chooses.

### Who is offered, and when

Nobody is offered until **max(first seen on the roster, VERIFY_OPEN_SINCE) + UNVERIFIED_GRACE_DAYS** has passed —
by default 25 Sep + 3 days, i.e. **Mon 28 Sep 00:00 UTC** for everyone in the guild today. The clock starts at the
fix rather than the join because until build .32 verifying required Battle.net, which Discord's review blocked:
almost everyone unverified on 25 Sep tried and was stopped by us.

Also held back, whatever the date: officers and the Guild Master, anyone with "hold" in a note, anyone holding a live
`/verify` code, anyone whose join date is unknown, anyone online right now (Config: `unverifiedIncludeOnline`), anyone
who whispered a valid code since the last login, and the officer running the panel.

### Rollout, in this order

    cd olympus-verify\worker
    npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-25-first-seen.sql
    npm run deploy

The migration creates `roster_first_seen` and backfills it from every stored snapshot (one pass; about a thousand rows
written). Deploying first is also safe — the Worker reports everyone and offers nobody until the table exists.
No `npm run register`: no command changed.

Then restart the watcher (close its window, start it again). Its rewrite gate now includes the list, so it rewrites
`OlympusQueue.lua` on the first poll — no need to move the old file aside. `python watcher.py --check` prints
`unverified list: N not verified (build .34)` when everything is wired.

In game, once:

    /reload
    /olv macrotest

`/olv macrotest` creates `OlvKick` (disarmed) or says why it cannot. Drag it from Esc > Macros onto an action bar.
Nothing has ever confirmed that this client lets addons write macros — this is the test. If it fails, removal still
works by typing `/guildremove <name>` yourself.

**The list reaches the addon only on /reload.** WoW executes an addon's files at login and /reload and nothing else;
the 45-second "re-read" ticker re-merges the copy loaded then. (The status text used to claim otherwise; corrected.)
The addon re-checks every name against the live roster anyway, so a stale list can only under-offer, never over-offer.

### What gets recorded

Each removal made through the macro is recorded by the addon from the server's own "has been kicked out of the guild
by" line — trusted, because a player cannot fake a system message — with reason `unverified` and the officer's name.
The Worker audits it as `roster.removed_unlinked` and posts a line to `#server-log`.

### Tests

    cd worker && python tests/unverified_sql_test.py        # the real SQL + migration against schema.sql (12 checks)
    cd addon/tests && lua5.1 test_unverified.lua            # the real addon files in a mocked client (53 checks)

The SQL test needs only Python. The addon test needs Lua 5.1 and LuaBitOp.

## Blizzard's Discord guild-chat bridge (patch 12.1 "Curse of Ula'tek") — status and setup, 25 Sep 2026

### What it is

Blizzard's own integration, not ours: guild chat syncs both ways with ONE Discord text channel. Players link
Battle.net and Discord themselves (in Discord: User Settings > Connected Apps > Battle.net; or in game: Esc > Options >
Social > Enable Discord Functionality). Only guild members with a linked account can post from Discord into the game.
Discord traffic can land in /guild or in a separate in-game /discord channel. Shipped in retail 12.1 (Midnight), live
11 Aug 2026. Sources: blizzard.com news 24286284 and 24296228; discord.com/blog/link-world-of-warcraft-with-discord;
Discord Social SDK "Linked Channels" docs.

It has nothing to do with the Olympus Verify app, so the app's quarantine does not affect it.

### Is it on the Forever client?

Blizzard has not announced it for any Classic version. But the Forever client on this PC (WowB.exe 1.60.1.70009 —
built after retail 12.1.0.69933) contains every Discord-integration string the retail client has (36: the C_Discord
API, DiscordGuildSettings, GetNumDiscordServers, GetDiscordChannelName, IsDiscordStreamSeparate, fromDiscord, the
discordEnabled/discordClientEnabled settings…) plus two newer ones. The code is there. Whether Blizzard has switched it
on for Forever realms is a server-side flag nobody outside Blizzard can see — check in game:

1. Esc > Options > Social — is there "Enable Discord Functionality"?
2. J > Roster > Guild Settings > Guild Control dropdown — is there "Discord Settings"?

Neither client has any Discord setting saved yet, so it has never been turned on here.

### Setup, once it is available

Player side (each person who wants to chat from Discord): Options > Social > Enable Discord Functionality, sign in to
Discord (be logged into Discord first), pick the display name (default = last online character).

Guild side (the guild leader, or an officer whose rank has the Discord permission): J > Roster > Guild Settings >
Guild Control > Discord Settings > pick the Olympus server and the channel > link. Then choose whether Discord messages
go to /guild or to the separate /discord channel.

Discord side: the person linking needs Manage Channels, View Channel and Send Messages on the channel. The channel must
be a text channel and not age-restricted; private channels are allowed.
- the owner (server owner) can link any channel.
- Asmongold (Guild Master role) can link #guild-chat specifically: the Guild Master role holds exactly those three
  permissions there. That is why #guild-chat is out of sync with GUILD HALL. **Never "Sync Now" #guild-chat** — it
  deletes that overwrite. guild-map.py now records this as intentional instead of warning.

After linking, run `python guild-map.py --check`: Blizzard's side may add its own app/role, which the checker will list
as unclassified until it is added to BOT_ROLES.

### Decisions for whoever links it

- **Audience.** #guild-chat is readable by the whole Discord (4,848), not just the guild (1,000). Linking it publishes
  in-game guild chat to everyone in the server. Fine if intended; say so in game (guild MOTD) so members know.
- **Where Discord lands in game.** /guild merges everything; /discord keeps Discord chatter separate so players can hide
  it. With a 1,000-member guild, /discord is the gentler default.
- **Who can post in the Discord channel.** Blizzard already drops messages from anyone not linked and in the guild, so
  non-members typing in #guild-chat simply never reach the game — which reads as broken. Pin a note, or restrict Send
  in #guild-chat to verified guild members (the Guild Member role, which is one more reason to keep it).

### Olympus Verify is safe alongside it

- The addon listens only to CHAT_MSG_SYSTEM and CHAT_MSG_WHISPER. Bridge traffic arrives as guild chat, and a Discord
  user can produce neither event, so it cannot submit a code or fake a join/leave/kick.
- The watcher reads WoWChatLog.txt, where bridge traffic does land. Every guild system pattern is anchored and forbids a
  colon in the name, so a relayed "X has left the guild." (logged as "[Guild] Troll: X has left the guild.") never
  matches. The one theoretical gap — a Discord display name chosen to be "X whispers" — is closed: whisper senders may
  no longer start with a channel tag or a UI escape. It was already harmless, because codes are keyed to the exact
  character name.
- Test: `cd watcher && python tests/test_discord_relay.py` (14 cases). Takes effect when the watcher restarts, which the
  .34 rollout already includes.

## Build .35 — the bot never DMs; notices go to #bot-announcements (25 Sep 2026)

### Why

Discord Developer Compliance lifted the quarantine on 25 Sep (ticket 68472279) and named the cause: *"It appears that
your app sent many unsolicited DMs in a short period of time ... future instances of spam may lead to further action."*
They quoted the Developer Policy: *"Do not contact users on Discord without their explicit permission."*

The old DM path shut itself for 6 h after Discord's anti-spam 403 and then probed again, so with the flag lifted it
would have resumed DMs by itself on the next welcome, departure or refusal notice. .35 removes it. There is no code
left in the Worker that opens a DM channel: `dm()` is deleted from discord.ts, and tsc proves nothing calls it.

### What replaces it

`notify()` (still in dm.ts, for import stability) posts in **#bot-announcements** (START HERE, id 1553117193863041034),
mentioning only the member concerned. `allowed_mentions` is locked to those user IDs, so no text can ping @everyone,
@here or a role.

- Said in full, because it is public anyway: on the roster, back in the queue, seat freed.
- Never said: declined, refused, denied, and any kind added later. Those members get "there is an update — run
  `/verify-status`", which answers privately.
- A roster sync or a batch of game events posts ONCE, one line per member (max 20 mentions per post). The cap on posts
  per minute (NOTICE_RATE_CAP, 10) still applies: over it, notices are dropped and audited, never queued.
- CHANNEL_NOTICES empty → nothing is posted anywhere (audited as notice.no_channel). It never falls back to a DM.

The channel was created in the browser: public, read-only for @everyone (inherited from START HERE), with one extra
allow — the Olympus Verify role may View, Send and Read History. That makes it out of sync with START HERE on purpose;
guild-map.py records the reason. **Do not "Sync Now" it** — that removes the bot's Send allow.

The terms section of the Worker's /terms page and `policies/terms.html` now say the bot never DMs. The copy published
at sturmfernmelder.github.io/olympus-verify-policies still says it does: push `policies/terms.html` there, since those
are the URLs set on the application and cited in the appeal.

### Rollout — .33, .34 and .35 go out together, and the deploy is the urgent part

    cd olympus-verify\worker
    npm run deploy
    npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-25-first-seen.sql

Deploy first: until it lands, the running build can DM. The migration can follow (the Worker tolerates its absence).
No `npm run register`. Then restart the watcher, `/reload` in game, and `/olv macrotest`.

Verify:

    cd ..\tools
    python guild-map.py --check --name guild-map-2026-09-25c

It must print `worker build: 2026-09-25.35 no-dms-notices-channel`, list CHANNEL_NOTICES among the wired ids, and show
no "Olympus Verify cannot … in #bot-announcements" line. That last point is the real proof the channel permission saved.

Tests: `node tests/notices_test.cjs` (22), `python tests/unverified_sql_test.py` (12), `npm run test` (typecheck + 12
vectors), `python ..\watcher\tests\test_discord_relay.py` (14).

## MEE6 without Administrator — what broke, what is fixed, and a decision (25 Sep 2026)

The 25 Sep review turned MEE6's Administrator off because guild-map.py flagged it CRITICAL and claimed MEE6's other
permissions were "already set explicitly". That claim was wrong, and the change reversed an explicit owner decision:
on 16 Sep the owner chose Administrator for MEE6 and had it restored after Codex removed it (owner handbook, "MEE6
Administrator is an explicit owner decision"). Administrator skips every overwrite, and several MEE6 jobs depended on
that:

- **#stream-alerts** denies @everyone Send (it is read-only) and MEE6's overwrite allowed only View, so the next Twitch
  live notice would have failed silently. **Fixed 25 Sep:** MEE6 allowed View, Send Messages and Embed Links there.
- **#server-log** is in OFFICER COUNCIL and MEE6 could not see it, so its logging plugin had been writing nowhere since
  the change. **Fixed 25 Sep:** MEE6 is on the channel's access list (View; Send and Embed come from its role). That
  takes #server-log out of sync with OFFICER COUNCIL on purpose: MEE6 sees the log and nothing else staff-only. **Do
  not "Sync Now" it.**
- **MEE6's moderation commands** (/ban, /tempban, /unban, /kick, /mute, /tempmute, /unmute, /slowmode). The MEE6 role
  holds no Ban Members, Kick Members, Timeout Members or Manage Channels, so these now fail. Discord's own
  right-click Ban / Kick / Timeout still works for Guild Leader and Moderator, who hold those permissions.
- **The Contact staff button in #help-desk.** Opening a ticket means MEE6 creating a channel, which needs Manage
  Channels. It now fails. SUPPORT TICKETS was already due to be retired.

**Decided 25 Sep (the owner): Administrator back on.** Done in the browser the same day; tickets, moderation commands,
logging and the Twitch alerts work again. guild-map.py records it in `ADMIN_BY_DECISION`, so the check reports it as
INFO with the reason instead of CRITICAL. The two channel overwrites above stay: harmless with Administrator, and
they keep both jobs working if it ever comes off again.

If the live notice is meant to ping @everyone, MEE6 also needs Mention @everyone in #stream-alerts. Without it the notice
still posts but pings nobody. The 16 Sep setup used a template without a mention.

guild-map.py now checks all of this. `OTHER_BOT_POSTS` lists where MEE6 posts (stream-alerts, server-log,
bot-commands, going by each channel's topic) and `--check` reports a PROBLEM when it lacks View, Send or Embed in any of
them. `BOT_GUILD_NEEDS` lists the server-wide permissions each bot's jobs need when it has no Administrator. A bot with
Administrator is still CRITICAL, but the message now says to cover those needs first, or to record the choice in
`ADMIN_BY_DECISION`. (A NOTE that briefly flagged MEE6 sitting above Guild Member was wrong and is gone: MEE6 was moved
above Guild Member on purpose on 18 Sep so it can moderate members.)
Keep both lists in step with the MEE6 dashboard.

Also in guild-map.py:
- A read-only channel whose only differences from its category are the read-only setup (@everyone loses posting;
  staff or bot roles gain it) is reported as INFO instead of NOTE. Every read-only line now also says who can post.
  Any other difference still gets the NOTE.
- The .md map's "synced" marker is worked out from the overwrites. The Worker's `syncedWithCategory` field only means
  "has no overwrites at all", which is a different thing.

Tests: `python tools/tests/test_review.py` (24).

### Did the first-seen migration take?

The .35 migration printed "0 rows written". That is what you see when the rows were already there, and it is also
what you would see if nothing got inserted. To tell which:

    npx wrangler d1 execute olympus-verify --remote --command "SELECT (SELECT COUNT(*) FROM roster_first_seen) AS first_seen, (SELECT COUNT(DISTINCT name_key) FROM roster_members) AS names"

`first_seen` should equal `names`, or be higher once old snapshots have been pruned. If it is 0, run the migration
file again. It is safe to repeat. This matters because a character with no first-seen row is never offered for
removal: an unknown join date counts as "too new". An empty table would mean the unverified list offers nobody on
28 Sep.

## Addon 0.5.0 — the invite queue lists only applicants online and in no guild (25 Sep 2026)

Anyone else costs a press for nothing: the server answers "not found" or "is already in a guild". The addon learns
both facts with `/who` (`C_FriendList.SendWho`), which, like an invite, needs a key press or click. So a press of
the flush key (or the pill button, or the panel's big button) does exactly one of two things:

- invites the next applicant confirmed online and guildless in the last 10 minutes, or
- when there is nobody like that, or the guild is at its cap, runs one `/who` on the next applicant in line.

The panel's **Check** button only checks. Order: anyone who has just whispered you, or who told the Worker they left
their old guild, goes first, then the front of the line; anyone last seen in another guild goes last. The server
answers roughly one `/who` every 5 seconds, so a faster press says how long to wait instead of sending anything.

What each answer does:
- **Online, no guild:** listed, with level, class and zone, for 10 minutes.
- **Offline:** off the list and checked again after 15 minutes. A "not found" reply to an invite counts the same.
- **In another guild:** off the list for an hour. They are whispered how to leave it and keep their place, with the
  same text and the same once-a-day, three-times limit as a refused invite. A whisper from them clears it at once.
- **No answer:** stays unchecked. It is never read as offline. Neither is an answer the addon could not read.

The addon hides its own `/who` lines from chat and prints a one-line summary instead. `/olv queue` lists everyone
with their standing, `/olv all` shows everyone in the panel for the session, and `checkBeforeInvite = false` in
Config.lua turns it all off. If the client refuses `/who` to addons, it switches itself off and says so.

Discord's `/olympus-admin queue` still lists everyone, because Discord cannot see who is online.

Nothing to deploy: `/reload` in game. Tests: `lua5.1 test_presence.lua` (68) and `lua5.1 test_unverified.lua` (53),
from addon/tests.

## Visitors and members, 25 Sep 2026 — the guild channels close to non-members on 28 Sep

the owner's design: someone with no role sees **START HERE** and **VISITORS** only. The **Guild Member** role, which the
bot grants once a character in the main Olympus guild is verified and on the roster, opens **GUILD HALL** and **WAR
ROOM**. From 22 to 25 Sep those two categories were open to everyone; this reverses that. Only the main Olympus guild
is verified. Olympus 2 and the later Olympus guilds get their own visitor space.

On 25 Sep, 141 Discord members held Guild Member, and 855 of the 1,000 characters in the guild were unverified. The
gate therefore goes up at the unverified deadline, **Mon 28 Sep 00:00 UTC** (`<t:1790553600:F>`), announced
beforehand.

### Done on 25 Sep (browser)

- **#olympus-2-x** (text, VISITORS, id `1553135302195814450`). @everyone may post and react; the category is
  read-only, so these are explicit allows. The Guild Member role is denied View. Guild Leader, Moderator and Officer
  are allowed View, so staff who also hold Guild Member can still moderate. Slowmode is 10s, and the topic says it is
  for Olympus 2 and later.
- **Olympus 2-X** (voice, VISITORS): the same overwrites, so members don't see it and staff do.
- Both are Onboarding default channels (added automatically with the VISITORS category). #olympus-2-x is also the
  "1 channel where @everyone can read and send" that Onboarding needs once the guild channels close. That is the
  requirement the 18 Sep note said was unmet.
- The **#join-guild** topic no longer mentions Battle.net and says "main Olympus guild only". **#welcome** says the
  guild channels open once your character is verified.
- The old **#visitor-chat** is unchanged: hidden from everyone, with its old messages. The checker lists it as
  hidden on purpose; delete it whenever you like.

### Build .36 — "main Olympus guild only" in the guide and in /verify

`guide.ts` and the `/verify` reply now say that only the main Olympus guild is verified and point Olympus 2 and
later at #olympus-2-x (`CHANNEL_VISITOR_CHAT` in wrangler.toml). The guide also says that the Guild Member role is
what opens the guild channels. tsc is clean and the vectors pass (12).

    cd olympus-verify\worker
    npm run deploy

Then run `/olympus-admin refresh-guide` in #join-guild. No `npm run register`, since the commands are unchanged.

### The gate itself — Mon 28 Sep 00:00 UTC

Seven edits in Discord. Each one sets **@everyone → View Channel ✕**. Leave everything else alone, and **do not press
Sync Now** anywhere.

1. GUILD HALL (category) → Edit Category → Permissions → @everyone → View Channel ✕ → Save. The synced channels
   follow it by themselves: The Tavern, Dungeon Party 1 and 2, AFK, looking-for-group, professions-and-trade,
   classes-and-builds, clips-and-highlights and bot-commands.
2. #guild-chat, 3. #pick-your-role, 4. #stream-alerts: these are out of sync, so set @everyone → View Channel ✕ on
   each one.
5. WAR ROOM (category), the same way. Raid 1, Raid 2, Raid Bench, raid-signups and raid-discussion follow it.
6. #raid-announcements, 7. #loot-and-raid-rules: these are out of sync, so set it on each one.

If Discord refuses a change because a channel is an Onboarding default, first open Server Settings → Onboarding →
Default Channels, untick GUILD HALL and WAR ROOM, save, and then redo the edit.

Every Guild Member, staff and MEE6 overwrite that lets members in is already in place, so nothing else is needed.
Verify with:

    python guild-map.py --check --name guild-map-2026-09-28

The checker knows the date. Before 28 Sep it prints one INFO per members category. From the 28th, anything in
GUILD HALL or WAR ROOM that @everyone can still see is a PROBLEM, and so is anything the Guild Member role cannot see.
Simulated against the 25 Sep map, the correct gate leaves only the standing "Battle.net Linked still exists" PROBLEM.

### Checker changes

- The intent is now public (START HERE, VISITORS), members (GUILD HALL, WAR ROOM, via `--members`) and private
  (OFFICER COUNCIL, SUPPORT TICKETS). Nothing is retired except the Battle.net Linked role.
- `VISITOR_ONLY` channels must be visible to @everyone and hidden from Guild Member. Moderating staff who hold Guild
  Member must still see them.
- `HIDDEN_ON_PURPOSE` covers #visitor-chat.
- Per-member overwrites in SUPPORT TICKETS are counted, not flagged, because each ticket belongs to one member.
- A read-only category's Send-deny only counts as lingering when a talk channel actually inherits it.
- The guide channel is judged on whether the bot can **edit** its message there (View + Read History). Missing Send
  is a NOTE, since only post-guide needs it.
- Tests: `python tools/tests/test_review.py` (38).

## Full check, 25 Sep 2026 evening — what was verified and what changed

Verified working: /health (build .35, every secret set, D1 ok); Worker typecheck, vectors (12), notices (22) and
unverified SQL (12); the watcher (queue file rewritten at 20:28 UTC, chat log caught up, outbox empty); the first-seen
migration (848 unverified characters carry dates from 17 to 25 Sep, the first becoming removable 28 Sep 00:00 UTC);
addon 0.5.0 in game identical to the repo (presence records since 19:52 UTC; 59 whispered and 1 mailed code confirmed
between 19:20 and 20:28 UTC); client 1.60.1.70009, matching `## Interface: 16001`; #bot-announcements notices; MEE6 tickets again
(#171 opened at 20:31 UTC); #olympus-2-x and its voice channel in use; the 28 Sep gate task scheduled.

### The Privacy Policy promised things the bot does not do

The 18 Sep text said `/verify-status` has removal instructions (it has none), that records are deleted automatically
when someone leaves the Discord server (nothing does that), that only officers can see which account a character
belongs to (the nickname and the #bot-announcements notices show it to everyone), and that the stored guild notes are
the ones every member can see (the roster export includes officer notes, last-online times and first-seen dates, kept
as snapshots). Both copies now say what actually happens, dated 25 September 2026:

- `worker/src/pages.ts` (the Worker's /privacy and /tos) goes live with the .36 deploy.
- `policies/privacy.html` and `policies/terms.html` must be uploaded to the GitHub Pages repo
  (`SturmFernmelder/olympus-verify-policies`), since those are the URLs on the application. The copy there still says
  the bot sends DMs.
- Terms: "By linking your account" became "By verifying a character", since nothing is linked any more.

The policy now says staff delete everything that links a Discord account to a character on request. That is
`worker/queries/forget-member.sql`: put the Discord ID in, run it with `--file`, then take the Guild Member role off by
hand if they still hold it (with no character linked, the roster sync no longer manages it). Tested against schema.sql
with foreign keys on: one member's rows go, everyone else's stay. If you would rather members could do this
themselves, that is a small command to add.

### Smaller fixes

- `watcher/tests/test_watcher.py`: one test still assumed the queue request is the watcher's first call; since the
  unverified list it is the second. The watcher was right; the test now looks for the request by path (17/17).
- `addon/test/harness.lua` (the 18 Sep smoke test): two assertions predated the attempt refunds for "not found" and
  "Guild is full", which the addon has done on purpose since 19–21 Sep. Updated; the harness passes again.
- `watcher/run-watcher.cmd` said "press a key to restart it" but pressing a key closed the window. It now restarts.
  The edit is below the line a running copy is on, so a watcher already running is not disturbed.

### Battle.net still named in four MEE6 texts

Battle.net stopped being a step on 25 Sep (.32), but four MEE6 texts still told people to link it. The guide itself
has two buttons now, **Verify a character** and **My status**.

- **#welcome (Welcome D01)**: fixed on 25 Sep. Step 2 now reads "the pinned guide gives you a code; whisper it to an
  officer in game", a new line says only the main Olympus guild is verified and points Olympus 2 and later at
  #olympus-2-x, and it is dated 25 September 2026. It was edited in place, so the reactions are kept.
- **#join-guild (Join guild intro I01)**, MEE6 → Embed Messages: replace "Use the three buttons in the pinned guide
  below: \*\*Link Battle.net\*\*, \*\*Verify a character\*\*, then whisper the code" with "Press \*\*Verify a
  character\*\* in the pinned guide below to get a code, then whisper it", and set the footer to 25 September 2026.
- **#help-desk (Help desk intro I02)**, MEE6 → Embed Messages: in the "Guild access" line, delete "link Battle.net, ".
- **The ticket opening message**, MEE6 → Ticketing: in "(link Battle.net, get a code, whisper it to an officer in
  game)", delete "link Battle.net, ". Every new ticket shows this text.

## Build .37 — Guild Member taken away by MEE6 (25 Sep 2026)

### What happened

Verified members at status 'member' turned up without the Guild Member role. The Discord audit log shows why, for
Magnus Manipulate at 14:06 UTC: MEE6 added Paladin, this bot added Guild Member, then a single MEE6 update added DPS
**and removed Guild Member**. MEE6's role menus in #pick-your-role write a member's whole role list from MEE6's own
copy, and when someone picks a class in the same seconds the bot grants Guild Member, that copy is older than the
grant. Most picks don't hit it (Elsydeon and akrilman picked roles after verifying and kept theirs). The bot never
gave the role back, because every roster pass skips status 'member', and `/verify` kept answering "already verified
and in the guild". `/olympus-admin sync` doesn't help either: it only promotes rows that are not yet 'member'.

### What .37 changes

- **Automatic repair** (`sweepMemberRoles` in `src/restore.ts`). Nobody has to press anything. Every 5 minutes while
  the watcher is polling, and on every cron run (twice an hour), a sweep checks up to 10 accounts the database counts
  as in the guild and gives Guild Member back to any that lack it. New promotions come first, once they're 3 minutes
  old, because that is when MEE6 strikes. Whatever budget is left goes to a rotation through every member, which
  finds older cases like Magnus, or someone who left the Discord and came back. Restores are audited as
  `role.restored` and posted as one ♻️ line in #server-log per sweep. Banned accounts, characters that left the guild
  and people no longer in the Discord are never touched. The sweep's state is the newest `role.sweep` audit row. 10
  accounts is at most about 22 Discord calls, which fits the free plan's 50 per request; `ROLE_SWEEP_PER_RUN` in
  wrangler.toml raises it on a paid plan. With the watcher running, the rotation covers a few hundred members in a
  couple of hours.
- `src/restore.ts`, on the spot: `/verify` (for a character already in the guild), `/verify-status` and the guide's
  **My status** button compare the member's roles, which Discord sends with every interaction, so the check is free.
  Anyone missing Guild Member gets it back at once and is told so.
- `src/backfill.ts`: `/admin/backfill-roles` now skips banned accounts. Before, a ban (which leaves the characters
  at 'member' until the in-game kick) would have had the role handed straight back. It uses NOT EXISTS, because a
  NOT IN over a column that can hold NULL returns nothing at all.
- The guide's footer says that My status puts back a missing Guild Member role.
- `tools/backfill-roles.py`: pages through `/admin/backfill-roles` with the token from watcher/config.json, 20 at a
  time so one request stays under the free plan's 50 Discord calls. It's a dry run unless you pass `--apply`.
- Tests: `node tests/role_sweep_test.cjs` (21; runs the sweep's real SQL against schema.sql in `node:sqlite`, so it
  needs Node 22.5 or later), `node tests/restore_role_test.cjs` (16), `python tests/backfill_sql_test.py` (5),
  `python ../tools/tests/test_backfill_roles.py` (10). Typecheck, vectors (12), notices (22) and unverified SQL (12)
  still pass.

### Rollout (.37 includes .36)

    cd olympus-verify\worker
    npm run deploy

Then `/olympus-admin refresh-guide` in #join-guild. No `npm run register`, since the commands are unchanged. That's
all that's needed: the sweep starts with the next watcher poll and works through the last day's promotions (Magnus
included) and then everyone else. A ♻️ line in #server-log shows each fix. To fix everyone at once instead of over a
couple of hours, optionally:

    cd ..\tools
    python backfill-roles.py            (dry run: prints how many are missing it)
    python backfill-roles.py --apply

Removing Guild Member by hand from someone who is still in the guild in game won't stick: the sweep gives it back
within hours, and My status does so at once. To take access away, use `/olympus-admin ban` or remove them from the
guild in game.

### Verified live, 25 Sep 2026 23:00 UTC

`/health` shows `2026-09-25.37 member-role-repair`. The audit table shows:

- **Backfill, 22:40 UTC**: three accounts had lost Guild Member: Magnus Manipulate, Tj Young and Razeo (pancakezking). It
  ran a few minutes before the .37 deploy, so without the banned-account check, but none of the three is banned. Nobody
  else in the guild was missing the role.
- **Sweeps** at 22:50 and 22:55 (on watcher polls, 5 minutes apart) and 23:00 (cron). Each checked 10 accounts, with
  nothing to restore and no failures. `c` stays empty while the sweep works through the last day's promotions first;
  once it catches up, `c` shows a Discord ID as the rotation moves through everyone else.

To look again:

    npx wrangler d1 execute olympus-verify --remote --command "SELECT datetime(ts,'unixepoch') AS utc, action, subject, details FROM audit WHERE action LIKE 'role.%' ORDER BY id DESC LIMIT 12"

## Addon 0.5.2 — "Check next" asked about the same applicant forever (25 Sep 2026)

The Forever client prints a /who answer without the player link that other clients use:
`Derkaderka Muhamedjihad: Level 9 Gnome Mage <OLYMPUS XLI> - Stone Cairn Lake` (chat log, 22:48 UTC). 0.5.0 and 0.5.1
only read the linked form. So any /who that found somebody was "could not read", the applicant stayed unchecked and at
the front of the line, and every press asked about them again. "0 players total" worked, so offline applicants moved
on, which is why it only showed up with someone online.

0.5.2 reads the linkless line and only counts lines naming the person asked about. If an answer still can't be read, or
the server drops two /who in a row for the same person, that person is set aside for 15 minutes as "no readable /who
answer" and the next press moves on. A whisper from them puts them back in line. Installed in the AddOns folder and
the repo. **Type /reload in game to load it.** Tests: test_presence 91/91, and the other suites unchanged.

## Addon 0.5.3 — no /who answer was ever used (25 Sep 2026)

After 0.5.2 the panel still said "no answer" for every check, while the chat showed "1 player total". The SavedVariables
show that no version ever used a single /who answer, not even "0 players total": 78 presence records, none with a
state. The chat log shows the server answered every /who (18:11 to 18:15 CDT: each applicant asked twice, each time
answered). 0.5.2's own timestamps (each "set aside" record, 6.5 s after its second /who) show every answer arrived
within about a second, while the check was still waiting. So the answers were fast, and the addon never read them.
Whispers were read normally in the same minutes, so chat lockdown (secret chat text) was not in effect. That leaves
two explanations the chat log cannot tell apart:

- the addon's frame did not get the line as an event, or
- it got the line in a different shape from the one in the chat log (the log strips hyperlinks and colour codes).

0.5.3 handles both and records which it was:

- /who goes out exactly as the game's own /who sends it (origin Chat).
- A check waits 8 s (`whoTimeoutSeconds` in Config.lua). After that the next press moves on to the next applicant,
  and an answer that arrives within a minute is still used. The server answers /who in order, so each answer goes to
  the oldest open question, or to the one its line names.
- Every line is reduced to what it shows on screen before it is read: links with or without brackets, class-coloured
  names and colour codes all read the same.
- Answers are read three ways: the addon's own CHAT_MSG_SYSTEM handler, the chat frame's message filter, and the chat
  window itself. Whichever sees a line first takes it, once. The Who list is also checked 3 s after each /who.
- Each system-message consumer runs on its own (pcall), so an error in one cannot silence the others. Errors are
  printed once and recorded.
- `/olv trace` shows what happened (`/olv trace 40` shows more, `/olv trace clear` empties it). It records each /who
  sent, every system line near it as the client delivered it, how each line was read, and each answer, timeout and
  error. The same record is saved to SavedVariables as `whoTrace` at /reload or logout.
- On the first login with 0.5.3, the "no usable /who answer" marks left by the old versions are cleared.

New panel state: "asked, answer not in yet" (awaiting). Tests: test_presence 158/158. The other suites pass unchanged
under both lua5.1 and LuaJIT: status 14, unverified 53, launcher 41, ui_polish 73, harness ok, preview ok.

**To check it in game:** /reload, press Check next two or three times, wait about 20 s, then /reload again.
The trace is then on disk for a second look. Or type `/olv trace` to see it straight away.

## Addon 0.5.4 — the "N players total" line was never recognised (26 Sep 2026)

0.5.3's login trace recorded this client's format strings: `WHO_NUM_RESULTS = "%d |4player:players; total"` and
`WHO_LIST_GUILD_FORMAT = "|Hplayer:%s|h[%s]|h: Level %d %s %s <%s> - %s"`. The total line reaches an addon as
`1 |4player:players; total`. The `|4` grammar escape is only resolved when the chat window draws the line, and the
chat log records the drawn form, which is why it read "1 player total". Every version matched only the drawn form, so
the line that closes each /who answer never matched. The player lines were read. That is also why the panel showed
"6 with an answer still to come": the answers had arrived and were never closed. The earlier diagnosis of a linkless
/who line was wrong. The log strips links; the line itself has one.

The fix: ParseTotal matches the client's own WHO_NUM_RESULTS first, exactly as delivered, then the drawn form, and the
text normaliser resolves `|4` escapes. The chat-window path accepts a line that starts with a bare-name player link,
but not a chat sender's link. The trace now also records system lines while an invite waits for its reply, so the
invite answers can be checked the same way. Tests: test_presence 175/175, with new cases built with string.format
from the client's format strings. All other suites pass.

**/reload in game to load it.** The reload also writes the 0.5.3 session's trace to SavedVariables.

## Addon 0.5.5 and watcher: applicants in another guild leave the queue; nobody is whispered unless they whispered first (26 Sep 2026)

the owner: "If people are already in a guild, I want to remove them from the queue (also to ensure I don't whisper
people unless they whisper me first)." 0.5.4 had whispered the "leave your guild" notice to ten applicants between
02:06 and 02:11 UTC.

- **Off the queue:** when /who finds an applicant in another guild, the row is taken off (status failed, reason "in
  another guild <G>, found by /who"). The event log shows "taken off the queue". The queue file cannot put the row
  back, because it is the same Worker row. Their own code whisper does put it back (same row and place, first in line
  for a check), and so does Retry in `/olv all`. At login, anyone the previous version found in another guild in the
  last hour is taken off too.
- **Whispers:** the addon whispers a character only if that character has whispered you in the last 14 days. That
  covers the in-another-guild, guild-full and declined notices, and the welcome on joining. Replies to a code whisper
  are unchanged, since that whisper came first. The contact list is seeded from the whispers already in the event log.
- **Joins of people who never whispered:** the signed join line goes to yourself: `To Fern Melder: Olympus: <Name>
  joined the guild (ref OLVj-...)`. The chat window hides it. The watcher now reads that note as a trusted join for
  <Name> (JOIN_SELF_RE; the MAC is over <Name>).
  **Restart the watcher once to load this.** Until then those joins still reach Discord at your next /reload, through
  SavedVariables.
- **Not changed:** the Worker is not told about /who results. /verify-status still shows those applicants as queued,
  and staff get no per-applicant notice, which avoids a staff-channel post for each of them.

Tests: test_presence 209/209 and harness ok (signed join to self), plus the other suites, under lua5.1 and LuaJIT.
Watcher: test_watcher 18/18 (new: note to self trusted, forged note dropped) and test_discord_relay 16/16.

## Addon 0.5.6 — nobody in another guild is whispered, at all (26 Sep 2026)

the owner: "It still whispers people who are in other guilds, it shouldn't do that, it should just take them off." In
0.5.5 someone found in another guild was still told how to leave it if they had whispered you before, and most
applicants have: that is how they sent their code. 0.5.6 drops that whisper entirely, both when /who finds them and
when an invite is refused with "already in a guild". The row just comes off the queue. Their code, whispered after
/gquit, still puts it back. The remaining whispers are unchanged and go only to people who whispered you in the last
14 days: the answer to a code whisper, "guild is full" after a refused invite, "declined", and the welcome on joining.

Note: the "leave your guild" whispers seen up to 21:15 CDT (02:15 UTC) came from 0.5.4. The reload at 02:23 UTC
loaded 0.5.5, and 0.5.6 was installed after it. **/reload to load 0.5.6.** Tests: test_presence 211/211, all other
suites pass.

## Addon 0.5.7 — "checking 2 at the same time": the server's /who refusal (26 Sep 2026)

the owner: "It keeps checking 2 at the same time and the check next number going up again next time." In game each
press printed "checking Charles Milksteak…" and then "Derkaderka Muhamedjihad: offline (answer came late)". The
whoTrace saved at 02:27 UTC shows the cause. When a /who goes out less than 5 seconds after the previous one (4.4 to
4.8 s were refused, 5.07 s was answered), the server replies "You must wait a moment longer before using /who
again." and never answers it. The addon measured the gap in whole seconds, so it sometimes sent at 4.4 s. The refused
check stayed open and took the next /who's answer as a "late answer", and from then on every answer was reported
against the check before. Every "(answer came late)" in the trace was one of these. Real answers arrive in about 0.3 s.

0.5.7:
- A refusal closes the check at once. The person stays first in line, the message says to press again in a few
  seconds, and the gap grows by half a second for the session, up to 8 s. The refusal line is kept out of chat.
- The gap is measured with GetTime.
- A total goes only to the check that is still waiting (or the one its lines named), never to one that has timed out.
- A timeout closes its check and puts the person back in line; two in a row set them aside for 15 minutes.
- Everyone never checked is checked before anyone is checked a second time, and re-checks go to whoever has waited
  longest. Before, the front of the line came back every 15 minutes and was asked again before the button reached the
  people further back.

The number on Check next still rises again over time, by design: an "offline" answer is re-checked after 15 minutes
(offlineRecheckMinutes in Config.lua), and people who whisper you go back in line.
Tests: test_presence 214/214 (a refusal, a timeout, check order, one answer arriving by two routes); all other suites
pass. **/reload to load it.**

## Addon 0.5.8 — "0 in another guild" next to people taken off for being in one (26 Sep 2026)

the owner: "It says they are in another guild but then it says 0 in another guild." Recent in the panel listed four
applicants "taken off the queue — in <OLYMPUS VII>" (and XXIV, VIII, XXV), while the text in the empty list read
"121 not checked, 50 offline, 0 in another guild". Both were right. The count covered only people still waiting, and
since 0.5.6 nobody found in a guild is kept waiting, so it was always 0. Side by side they read as a contradiction.

0.5.8:
- The summary lists only the states somebody is in ("121 not checked, 50 offline") and counts the people taken off
  in a sentence of its own: "4 applicants already in another guild were taken off the queue." The count is everyone
  the addon still holds as taken off (a week, per the login housekeeping); /olv all lists them with a Retry.
- The check button's chat messages and /olv status use the same wording.
- When nobody is left to look up, the panel says "Everyone waiting has been checked" and that answers have to age out,
  instead of offering a check there is nobody for.
- Only the wording changed: nobody is checked, taken off or whispered differently.

Tests: test_presence 231/231 (the counts, the panel text with and without anyone to check, /olv status, an empty
queue); all other suites pass. **/reload to load it.**

## Addon 0.6.0, watcher 0.6.0, Worker .38 — request codes, signed notes, character IDs (27 Sep 2026)

What changes for people: the guide's button becomes **Get my code** and answers with the whole line to paste in game
(`/w <officer> !verify CODE`), naming an officer who is actually in the world, or saying nobody is and until when the
code holds. The character that sends the code is the one linked; nothing is typed in Discord. `/verify <character>`
still works as before. What changes underneath: every incoming whisper is pushed to the chat log at once; joins and
departures are signed notes, so roles follow within seconds; links follow the character's ID through renames, and a
namesake on live never inherits a beta link. Design and guarantees: `docs/design.md`, "27 September".

**Order.** Any order is safe — the Worker hands out request codes only after an officer's watcher has reported the
addon at 0.6.0 (until then the button opens the old name form). This order gets them going soonest:

1. **Addon** — already copied into the live AddOns folder and the repo. In game: `/reload`. A few seconds later the
   addon writes its login note ("which character, which addon"), hidden from the chat window.
2. **Watcher** — close its window and start it again (`python watcher.py --config config.json`). It prints
   `relay: Fern Melder is in the world with addon 0.6.0` once it has read the note. `--check` shows the same, plus the
   chat-log lag and whether the Worker hands out request codes yet.
3. **Worker** — `npm run deploy` in `olympus-verify\worker`. It adds its new columns itself on the first request
   (`migrations/2026-09-27-tickets-guid-relays.sql` is there for anyone who prefers to run it by hand, before the
   deploy). `/health` then shows build `2026-09-27.38 tickets-guid-relays`, and `relays.requestCodes: true` once steps
   1 and 2 have reported.
4. Optional: `npm run register` — makes `/verify`'s character optional, so `/verify` alone gives a request code.
5. `/olympus-admin refresh-guide` in #join-guild — the pinned guide's button text becomes "Get my code".

**In-game checks (you type, then `/reload`; the results land in the logs and SavedVariables, which I read):**
- `/olv logtest` — a timing marker whispered to yourself; the watcher reports how many seconds it took to reach
  `WoWChatLog.txt`. Seconds mean the flush works.
- `/olv diag clog` — markers through `C_Log`; the watcher reports which log file each reached, and how fast.
- `/olv diag discord` — read-only: what Blizzard's Discord link exposes (your account, the guild's members).
- From Fern Melder: `/w Fern Melder hi` — confirms that a two-part name after `/w` reaches the right character, which
  the paste line depends on.

**Settings.** `REQUEST_CODES` in `wrangler.toml`: `auto` (default, as above), `off` (the button asks for a character
name, as before), `on` (always; needed only if presence reports are switched off in the watcher config).

**Launch (4 Nov).** Before the first live roster export reaches the Worker: set `LINKS_NOT_BEFORE = "2026-11-04"`
and deploy. Beta links then count only for the character they were pinned to; a beta name taken by someone else on
live is released, never inherited. After the first live export, run `/olympus-admin sync`: that export is far smaller
than the beta's, so the shrink guard holds removals and the release cap holds releases, and sync applies both.

**Re-pinning.** Only if the guild moves realm and every character gets a new ID: the roster exports will look like
every linked member turned into a namesake, and the Worker holds them all and says so. Clear the pins instead of
running sync:
`npx wrangler d1 execute olympus-verify --remote --command "UPDATE characters SET guid = NULL WHERE status IN ('verified','queued','member','left','left_pending')"`.
The next export pins the new IDs. (Links made before `LINKS_NOT_BEFORE` would then count as stale; after launch that
is none of them.)

**New lines you may see.** Watcher: `relay: <character> is in the world with addon 0.6.0`; `whisper from X: that
request code was already used by another character (not forwarded)`; `SavedVariables: N join/departure event(s)
older than 6 h not relayed`. Server log: a request code used by a second character; a rename carried ("same
character"); links held because too many would be released at once; two characters that swapped names.

**Known limits.** A request code names no character until it is whispered, so its holder is not protected as
"verifying now" from removal; the removal panel and `/olympus-admin roster` show how many are out. With two officers
online, a leaked code could get one invite from each client (the Worker still links one character).

Tests: Worker typecheck, vectors, notices 22/22, restore 16/16, role sweep 21/21, tickets and GUIDs 52/52, Verify
button 18/18, review fixes 64/64, SQL tests 5/5 and 12/12; watcher 40/40 and the Discord-relay check 16/16; addon
harness, status 14, presence 231, unverified 53, launcher 41, UI 73, signed notes and request codes 62, preview 653.

## Addon 0.6.1 and watcher 0.6.1 — what the first run of 0.6.0 measured (27 Sep 2026)

Read from the chat log, SavedVariables and the watcher's state after the owner's steps (15:00–15:10 UTC):
- **The chat-log flush did not work.** A code whispered at 15:03:34 and `/w Fern Melder hi` at 15:04:54 reached
  `WoWChatLog.txt` only at 15:09:16, with the next 48 KiB batch; the watcher measured 40 s to 6 min per line. The
  addon had turned logging off and on in the same frame, and the client wrote nothing. 0.6.1 turns it back on a fifth
  of a second later, so the off state is real; `/olv logtest` measures whether that writes the buffer.
- **No note to self had ever reached the chat log** — not the join notes since 26 Sep, and not 0.6.0's login,
  departure or identity notes. A line hidden by a chat message filter is not logged either, and the addon hid both
  halves. 0.6.1 hides only the incoming copy; the "To Fern Melder: Olympus: …" half stays visible and is logged.
- **Request codes stayed off** (`/health`: `requestCodes: false`) because the login note never arrived. Watcher 0.6.1
  also reads the loaded build from SavedVariables (`addonVersion`, or `presenceVersion` from older builds), so the
  first /reload is enough.
- **Two-part names in `/w` work**: "To Fern Melder: hi" and "Fern Melder whispers: hi" were logged as sent.
- **The addon reads the whisperer's GUID**: the code whispered at 15:03:34 was recorded with `Player-4613-…`, matching
  that character's roster entry.
- Worker .38 is live (`/health`: build `2026-09-27.38 tickets-guid-relays`, D1 ok, Fern Melder reporting online).

- **`C_Log` is no faster exit.** `/olv diag clog` (15:04 and 15:23 UTC) wrote its markers to `Logs\General.log`, and
  that file reached disk only at 16:43 — 80 to 100 minutes later. All four calls worked, `LogErrorMessage` included.
- **`/reload` writes the chat log.** The reload at 17:19:05 put a line that had waited 5½ minutes on disk in the same
  second as SavedVariables. Between reloads the chat log still comes in 48 KiB batches: 31 lines measured between
  15:09 and 17:19, typically 4–8 minutes late, up to 15.
- **Blizzard's Discord link carries nothing here yet** (`/olv diag discord`, 15:23): `C_Discord.IsEnabled()` is true,
  but whether your account is linked, the Discord user ID and name, and whether guild chat is linked all come back
  empty; none of the 998 guild members has Discord information on their record; 330 guild-chat lines carried none.
  So there is no Discord ID in the game to read today — the verification code stays the link.

Steps: restart the watcher; in game `/reload` (loads 0.6.1); then `/olv logtest` (does the new flush write the log?)
and `/reload` once more.

## Addon 0.6.2 and watcher 0.6.2 — every note to self went to "Fern" (27 Sep 2026)

Read after the owner's 0.6.1 steps (17:41–17:43 UTC):
- **No note to self was ever sent.** SavedVariables said `lastCharacter = "Fern"`: on this client `UnitName("player")`
  gives only the first part of the name (the 17 Sep probe had "Fern Melder", and the 18 Sep log test reached
  "To Fern Melder:"). Every note since the 0.6.0 reload went to "Fern", and the chat log has "No player named 'Fern' is
  currently playing." 46 times from 15:01 UTC on — after each confirmed code, each reload and each log test. So the
  0.6.1 section's reading above, that a line hidden by a chat filter is not logged, was wrong: those notes never
  existed. Whether a filtered line is logged is still open; 0.6.2 hides only the incoming copy, so its first login note
  settles it.
- **The watcher still running was 0.6.0.** Its state took no relay from the 17:42 SavedVariables, which 0.6.1 does. As
  it turns out that was lucky: watcher 0.6.1 would have taken "Fern" from SavedVariables and told applicants to whisper
  "Fern". Request codes stayed off (`/health`: `requestCodes: false`, relay "Fern Melder" from the watcher's config).
- **The log test did not run** — its whisper went to "Fern" too, and the second reload came within seconds of it.

What 0.6.2 changes:
- **Addon:** its whole name comes from the guild roster, by the character's GUID. A whisper to yourself (its sender
  carries the GUID) is the fallback, and `UnitName` counts only while it still has two parts; guild chat is not used,
  because a line bridged from Discord could carry your GUID beside a Discord name. Until one of them answers, notes wait
  (up to 10, for 10 minutes) and go out with the roster update that names you; the login note too. The roster is
  searched again only after it changes. SavedVariables gets `lastCharacterGuid` and the whole name, never the first
  part. `/olv diag` says where notes go and from which source; `diag.name` in SavedVariables records what `UnitName`,
  `UnitFullName`, `GetUnitName` and `UnitGUID` return, at login and at logout. `/olv logtest` whispers the whole name
  and asks for a minute before any /reload.
- **Watcher:** the relay (the character applicants are told to whisper) comes from SavedVariables only through the
  roster entry with the saved GUID, and from a login note only when the note is addressed to the very name it carries
  — a whisper the server delivered — and is not older than what is already known. A name from anywhere else is never
  named to applicants, including one a 0.6.1 watcher had stored; a bare "Fern" is refused, logged once, and the
  configured officer stays.
- **Worker:** unchanged (.38).

Tests: addon myname 40 (new: the 27 Sep client), signed 65, presence 231, unverified 53, launcher 41, UI 73, status
14, harness, preview 653, under Lua 5.1 and LuaJIT; watcher 44 (new: GUID-only relay, a note addressed to itself, a
name kept by 0.6.1, a late note) and relay 16. An independent review of the change found no way for a note to reach
the first part; its points (the name 0.6.1 kept, guild chat as a source, the queue size, roster searches while
unlisted, late notes) are all folded in.

Steps:
1. **Restart the watcher** — close its window and run `run-watcher.cmd` again. The one running now is still 0.6.0; the
   new one says "watcher 0.6.2" at the top.
2. In game `/reload`. The watcher then says it keeps Fern Melder (SavedVariables from 0.6.1 names "Fern"), and
   `/health` shows `requestCodes: true` within a minute.
3. About ten seconds after the reload the chat window shows `To Fern Melder: Olympus: relay Fern Melder is in the
   world (addon 0.6.2, …)`. If the watcher window answers with "relay: Fern Melder is in the world with addon 0.6.2"
   within seconds, the flush works.
4. `/olv logtest`, then a minute without reloading; the watcher window says how many seconds the marker took.


## Worker .39 — the bot's pinned intros in Asmongold's server: `/olympus-intros` (29 Sep 2026)

**What it is.** One pinned embed from the bot in each Olympus channel of Asmongold's server: ten channel messages
(#olympus-info carries three embeds: welcome, Forever at a glance, guides) and a pinned "Read first" post in each of
the two forums. The intros belong to the bot rather than to whoever posted them, so any Olympus officer can put them
back. The text is `src/intros.ts`, from `asmongold-channel-copy.md` §3. Verification still serves the beta server
(`GUILD_ID`); in Asmongold's server the bot does nothing but this command until the move (`asmongold-move.md`).

- `/olympus-intros refresh [channel]` posts missing intros and pins them, edits changed ones in place (same message,
  same pin, same link), posts a deleted one again, re-pins an unpinned one and leaves current ones alone. The reply is
  deferred and private; the summary replaces "thinking…". A run may spend 40 Discord calls (the free plan allows 50
  per request; a first run takes 27) and stops early with "run it again" rather than go past it. One refresh at a
  time (a D1 lock that frees itself after two minutes). Every write carries an audit-log reason naming the officer.
- `/olympus-intros status` reads the bot's records only: posted or not, current or changed since the last refresh.
- Who: Olympus Officer or Olympus Guild Leader (`INTROS_ROLES`), or anyone with Administrator. The command is
  registered with `default_member_permissions: "0"`, so Discord shows it only to Administrators until Server Settings
  → Integrations → Olympus Verify → `/olympus-intros` allows the two roles.

**Config** (`wrangler.toml`): `INTROS_GUILD_ID` (Asmongold; `""` switches it off), `INTROS_ROLES`, `INTROS_CHANNELS`
(`key=id` for every channel an intro lives in or mentions; `{#key}` in the text becomes the mention, and a key missing
from the config becomes plain `#key`, never a broken mention). D1 tables `intro_posts` and `intro_locks` are created
by the Worker itself (`schema.ts`); `migrations/2026-09-29-intro-posts.sql` is there for anyone who prefers to run it.

**Rollout.**
1. Add the bot to Asmongold's server: scopes `bot applications.commands`, server permission View Channels only
   (`permissions=1024`); everything else comes from channel overwrites (step 4). Done 29 Sep by the owner from the
   desktop app's Add App window; Wick left the bot alone.
2. `npm run deploy`; `/health` shows build `2026-09-29.39 asmongold-intros` and an `intros` block. Done 29 Sep
   (version 56e7fe3d).
3. `npm run register:intros`. It POSTs, so it adds or updates this one command and never touches the server's other
   commands. The token comes from the environment or `worker/.dev.vars`; with neither, the script prints the
   PowerShell line (`$env:DISCORD_BOT_TOKEN = Read-Host "Bot token"`, which keeps it out of the history). After the
   move, `npm run register` includes the command automatically when `GUILD_ID` equals `INTROS_GUILD_ID`, because its
   PUT replaces the server's whole list.
4. Channel overwrites for the **Olympus Verify** role. Text channels: View Channel, Send Messages, Embed Links, Read
   Message History, Pin Messages. Forums: View Channel, Create Posts, Send Messages in Posts, Embed Links, Read
   Message History, Manage Posts (needed to pin the post and to apply the moderator-only 📗 Guide tag).
5. Integrations: allow `/olympus-intros` for Olympus Officer and Olympus Guild Leader.
6. `/olympus-intros refresh`, then `/olympus-intros status`.

**If the bot token is ever reset** (it is not stored on disk): `npx wrangler secret put DISCORD_BOT_TOKEN` at once,
or every Discord call the Worker makes fails with 401 until then.

**Rollback.** `INTROS_GUILD_ID = ""` and deploy: the command answers that it is off and nothing else changes. Remove the
command under Integrations or with the API. Posted intros stay until someone deletes them.

**Tests.** `node tests/intros_test.cjs`, 55/55: the copy against Discord's limits and against `INTROS_CHANNELS`; no
pings; links only to Blizzard and editorial guide sites; the launch timestamp; guild and role checks; post and pin;
nothing touched when current; edit in place; an archived forum post reopened before its edit; a deleted intro posted
again; unpinned ones re-pinned; one channel only; the call budget; the lock and a stale lock; a pin the bot may not
make; the old pin route; a channel moved in the config. Typecheck, vectors and every earlier suite pass unchanged
(notices 22, restore 16, role sweep 21, tickets and GUIDs 52, Verify button 18, review fixes 64; SQL 5 and 12).

**Result, 29 Sep 2026 (build .39).** Overwrites saved and read back on all twelve channels; the two roles allowed under
Integrations; the owner's `/olympus-intros refresh` in #olympus-info answered "12 changed": ten channel messages and two
forum posts, all pinned, the posts tagged Other and Guide. Both forum checklists now show 4 of 5 (the fifth is the
recommended-permissions step, left alone on purpose). The LFG post guidelines' example was corrected to 13–18.

## Worker .40 — a preview line on the two forum posts (29 Sep 2026)

A forum lists each post with its first message's text, and an embed-only message reads "Click to see attachment". The
two "Read first" posts now open with one plain line (`content` in `intros.ts`), so the forum shows what the post is.
The hash only covers the line when there is one, so the ten channel intros hash exactly as in .39 and a refresh leaves
them alone; the two forum posts are edited in place. Rollout: `npm run deploy`, then `/olympus-intros refresh`.
`tests/intros_test.cjs` 57/57.


## Health check, 29 Sep 2026 — and addon 0.6.3: the automatic chat-log flush is off

the owner: "Check everything to ensure everything is current, up to date, and working properly." Read on 29 Sep between
01:04 and 01:20 UTC:
- **Worker:** the live build is `2026-09-29.40 intro-previews`, the same as `src/index.ts`, so .40 is deployed. D1 is
  ok, all six secrets are set, `requestCodes` is true, and the intros guild is configured (17 channels, 12 intros).
  On the repo as it stands, all of these pass: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52,
  Verify button 18, review fixes 64, intros 57, SQL 5 and 12, tools 10 and 38. Whether the two forum posts were
  refreshed after .40 only shows in Discord (`/olympus-intros status`).
- **Watcher 0.6.2:** state written 01:02:49; the relay is Fern Melder with addon 0.6.2, taken from the roster by the
  saved GUID; the outbox is empty and the chat log is read to its end; 95 request codes seen so far. The queue file
  was regenerated at 01:02. Tests: 44, and relay 16.
- **Addon 0.6.2 in game:** the live AddOns files are identical to the repo. SavedVariables (01:02:17) name Fern Melder
  from the roster, session 89. 225 applicants wait, 155 were taken off for being in another guild, 31 were invited and
  17 joined. The roster export shows 1000 of 1000 members, so the guild is full. The unverified list is current: 603
  unverified, 582 of them past the three-day grace, and 133 request codes open.
- **The 28 Sep gate** can't be confirmed from here: there is no `guild-map-2026-09-28` report, and the agreed Discord
  tab is out of reach. Run the checker (below).
- **The flush:** 0.6.2's log test put its marker in the file 37 minutes late, at the 19:08 logout, and whispers still
  reach the file anywhere from 40 seconds to 40 minutes late. Toggling logging never wrote the file early, and each
  toggle can drop the lines that arrive while logging is off.
- **A hidden line is logged:** the incoming copy of 0.6.2's login note, which the addon hides, is in the file
  (27 Sep 20:46 UTC).

What 0.6.3 changes:
- The automatic flush is off (`FLUSH_LOG = false`), and `flushLog` in Config.lua is ignored.
- `/olv flushlog`, the panel's Flush chat log button and `/olv logtest` still toggle logging by hand, for measuring.
- The CHAT LOG tile reads "manual" and says that Sync & reload pushes the file.
- README and the design notes are corrected.
- Nothing else changed; the watcher and Worker are untouched.

Tests: signed 67 (the flush checks rewritten), myname 40, presence 231, unverified 53, launcher 41, UI 73, status 14,
harness, preview 653, under Lua 5.1 and LuaJIT.

Steps:
1. In game, `/reload` to load 0.6.3.
2. In Asmongold's server, `/olympus-intros status`. If the two forum posts show as changed, run
   `/olympus-intros refresh`.
3. `python guild-map.py --check --name guild-map-2026-09-29`. From 28 Sep on, the checker flags anything in GUILD HALL
   or WAR ROOM that @everyone can still see. If the gate is in place, the only PROBLEM is the standing "Battle.net
   Linked still exists".


## Worker .41, watcher 0.6.4, addon 0.6.4 — the guild site, reserved names and the Members window (29 Sep 2026)

**What it is.** `https://guild.roachcouncil.com`, served by this Worker (`SITE_HOST`). Sign in with Discord; only
members of Asmongold's server (`SITE_GUILD_ID`) get in. Members apply for a position, nominate people for the senior
roles (results for `SITE_ADMINS` only), list friends, and from the day Blizzard's name reservation opens enter up to
three reserved names. The Admin tab (the owner) has applications, nomination tallies, reserved names, friends, a lookup
of any Discord member's characters, settings and CSV downloads. Original look, no Blizzard assets. Design notes:
`docs/design.md`, "29 September".

Also in this build:
- Approved reserved names go to the top of the invite queue at launch (`LAUNCH_AT`, 4 Nov 15:00 PST; by hand from the
  Reserved names page too). Each invite is still one key press, and the whisper still links Discord.
- Claims are sticky, and reserved names get `QUEUE_CLAIM_PRIORITY_EXTRA` (10) places on top of a full hand.
- Verifying again takes the live queue row over in place instead of sending the person to the back.
- `/olympus-lookup` and the right-click **Olympus linked characters** in Asmongold's server.
- Discord usernames and display names for linked members (`members.username`, `global_name`, `names_at`), carried to
  the game by the watcher as a `verified` list.
- Addon 0.6.4: reserved names first in the panel and the flush (marked "Reserved"), and a Members window
  (`/olv members [text]`, or the panel's **Members** button): every guild member as verified, verifying now, not
  verified or not in the list, with Discord names, filters and sorting.

**Config** (`wrangler.toml`, all set): `routes` (the custom domain), `[assets]` (`public/`), `SITE_HOST`,
`SITE_GUILD_ID`, `SITE_ADMINS` (the owner), `SITE_JOIN_URL` (empty), `NAME_RESERVATION_AT` (27 Oct 00:00 Pacific; the hour
is set on the admin Settings page once Blizzard announces it), `LAUNCH_AT`, `NAMES_PER_RUN` (5),
`QUEUE_CLAIM_PRIORITY_EXTRA` (10). No new secrets: sign-in uses `DISCORD_CLIENT_SECRET` and `COOKIE_SECRET`, which are
already set. The Worker creates its new tables and columns itself (`schema.ts`); `migrations/2026-09-29-guild-site.sql`
has the same statements for anyone who prefers to run them.

**Rollout.**
1. Discord Developer Portal → Olympus Verify (1550176895671341076) → OAuth2 → Redirects → add
   `https://guild.roachcouncil.com/auth/callback` and save. Keep the existing redirects.
2. Recommended before announcing the site: Workers Paid ($5 a month). The free plan's 100,000 requests a day cover
   the bot and the site together, and a busy sign-up day can reach that.
3. From `worker/`: `npm run deploy`. It uploads the static files and creates the custom domain (DNS record and
   certificate) on the roachcouncil.com zone, which must be in the same Cloudflare account. If a DNS record named
   `guild` already exists, remove it first or deploy stops. The workers.dev address stays on. `/health` shows build
   `2026-09-29.41 guild-site` and `site: { host: "guild.roachcouncil.com", guild: "236932545793490944", admins: 1 }`.
4. `npm run register:intros`. It POSTs `/olympus-intros` again (same id, its role permissions stay), `/olympus-lookup`
   and the right-click command, and touches nothing else in the server. Then Server Settings → Integrations → Olympus
   Verify → allow Olympus Officer and Olympus Guild Leader on the two new commands.
5. Open the site, sign in, and check the Admin tab. Settings: the reservation hour once announced, the launch time, and
   a notice if you want one.
6. Sign in once with a Discord account that has never used Olympus Verify (a friend's or an alt). The first sign-in
   tries without the consent screen and falls back to it; this checks that on the real Discord.
7. Restart the watcher (0.6.4): the queue file then carries the reserved-name flag and the verified list.
8. Addon 0.6.4 adds a file (`OlympusVerifyRoster.lua`), so quit and restart the game; a `/reload` does not load new
   files. Then `/olv members`.
9. Optional: `SITE_JOIN_URL` = a permanent invite to Asmongold's server, shown to people who are not in it yet.
10. The policies changed (the site's data, and the bot is in Asmongold's server now): upload `policies/privacy.html`,
    `terms.html` and `index.html` to the GitHub Pages repo `SturmFernmelder/olympus-verify-policies`. Or, simpler from
    now on, set the portal's Privacy Policy and Terms of Service URLs to `https://guild.roachcouncil.com/privacy` and
    `/terms`, which the Worker serves with the same text (the portal refused only the `workers.dev` host).

**Rollback.** `SITE_HOST = ""` and deploy switches the site off (the custom domain then reaches only the bot's own
routes); remove the custom domain in the dashboard to take the address down. The site's tables stay. The queue changes
need no rollback: with no reserved names queued, every row has priority 0 and the order is the old one.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 162 (sign-in, sessions and CSRF, every form, nominations and tallies, reserved names through
the queue, sticky claims with two officers, deny and delete, lookups, exports; its D1 stand-in refuses LIKE patterns
over 50 bytes, as D1 does), SQL 5 and 12, `wrangler deploy --dry-run` (295 KiB, 79 KiB gzipped). Watcher 48 and relay
16. Addon: status 14, presence 231, unverified 53, launcher 41, UI 74, signed 67, myname 40, roster 48, preview 653,
harness. A browser walk-through of the real Worker on a local server with a fake Discord (desktop and phone widths):
landing, not a member, apply with a server-side error, nominate, friends, names closed and open, an ended invite, every
admin page, the Everything filter, re-approving an ended name, a CSV download with a formula-looking name, the
unsaved-changes guard and Delete my data; no console errors, CSP violations or sideways scrolling. An independent
review found 15 problems and then three more in the fixes; all are fixed and covered by tests.

## Worker .42 — nothing injected into the guild site (29 Sep 2026)

After .41 went live, guild.roachcouncil.com came back with Cloudflare's Web Analytics beacon in it: the zone injects
`beacon.min.js` into proxied HTML. The site's CSP blocked it on the site's own pages (one console error per page load),
but the policy pages had no CSP, and there it ran, on the page that says there are no third-party trackers. .42 sends
`Cache-Control: no-transform` on every site response and on the policy pages, which makes Cloudflare leave the HTML
alone (Cloudflare's Web Analytics FAQ), and gives the policy pages a CSP of their own that allows no script at all.
Nothing else changed. Rollout: `npm run deploy`; `/health` then shows `2026-09-29.42 no-transform`. Tests: site 164 (the
headers on the page and on both policy pages), every other suite unchanged, and the browser walk-through clean.

## Worker .43 — the game's own art, a voting board, NA and EU raid roles, backups and a weekly grid (30 Sep 2026)

**What changed on guild.roachcouncil.com.** Design notes: `docs/design.md`, "30 September".
- **The look** is World of Warcraft's interface art and fonts (frames, buttons, check boxes, parchment, icons, Friz
  Quadrata and Morpheus), made from the local client's textures by `tools/build-site-assets.py` into
  `worker/public/static/wow/` (78 files, 339 KiB). A free, non-commercial fan site, like olympus.roachcouncil.com/guild;
  the footer credits Blizzard and says the site is not affiliated with it. The logo is the Guild Hall's own
  (`public/static/olympus-icon.png`, the same 250x250 file as on olympus.roachcouncil.com/guild): top bar, footer and
  tab icon, in place of the drawn crest.
- **Fewer pages.** The Worker no longer serves privacy and terms: `/privacy` and `/terms` (and `/tos`,
  `/terms-of-service`, `/privacy-policy`) redirect to the GitHub Pages copies the Discord application links. There is
  no member "Delete my data"; staff delete on request (admin → the application → Delete their site data, which can also
  remove what others entered about the account; for someone who never signed in, admin → Lookup → Remove these
  mentions). Names and friends moved onto Home; the menu is Home, Apply, Vote (and Admin).
- **Roles:** Raid Leader and Raid Assist are one each for NA raids and EU raids (sixteen positions). Old applications
  move by their region (Europe to EU, the rest to NA), old Raid Leader write-ins by the nominee's application.
- **Applications:** a first choice and up to two backups, and a weekly grid of when you play in your own time zone
  instead of the free-text box. The Worker counts each applicant's NA and EU raid evenings (three of the five evening
  hours, 7 pm to midnight Eastern or Central European).
- **The voting board** (Vote): every open leadership application whose applicant ticked "Show my application on the
  voting board", under each role it names, with the Discord name and picture, class, role, region, raid evenings and
  the four written answers. Members vote for or against; only admins see counts (Admin → Votes, per role, with the
  voter filters, and who voted how). Each voter sees their own order, 20 a page. Write-ins stay, per role.
- **Admin:** the heat map of when applicants play (Overview), board counts on each application page, board votes in
  the CSV downloads.
- **Appointed roles** (Admin → Settings, "Appointed roles"): type a name next to a role and it is filled by
  appointment. Nobody can choose it on the Apply page (first choice or backup), its voting board and write-ins close,
  and members see who holds it; the votes and write-ins it already had are kept and count again if the box is emptied.
  The Treasurer starts appointed to Fernmelder. Someone whose application names an appointed role keeps their other
  choices; Home and Apply tell them.

**Config.** Nothing new: no variables, no secrets, no portal change. The Worker adds its columns and the
`site_board_votes` table itself on the first request and moves the old Raid Leader and Raid Assist rows;
`migrations/2026-09-30-board.sql` has the same statements for anyone who prefers to run them first.

**Rollout.**
1. From `worker/`: `npm run deploy`. `/health` then shows build `2026-09-30.43 board`.
2. Right after, upload `policies/privacy.html` and `policies/terms.html` to the GitHub Pages repo
   `SturmFernmelder/olympus-verify-policies`, replacing both. The copies there still offer "Delete my data" and
   describe a site without a voting board, and the site's own `/privacy` and `/terms` now lead there.
3. Open the site on a computer and a phone: Home; Apply (the grid in your time zone; a leadership choice shows the
   voting-board box); Vote (the role list, a board, write-ins); Admin → Overview (heat map), Votes, an application. A
   page that was already open before the deploy answers its next save with "The site has been updated": reload it.
4. Voting is open unless it was switched off (Admin → Settings → "Voting is open"). Switch it off first if the board
   should wait for an announcement. On the same page, "Appointed roles" shows the Treasurer appointed to Fernmelder;
   add any other role that is already decided before people start campaigning for it.
5. Tell the people who applied before today: a leadership application stays private and off the board until its
   applicant opens it, fills in when they play, ticks the voting-board box and saves (Home shows them a notice); anyone
   else can open theirs and add the grid.

**Rollback.** Redeploying .42 brings the old look and pages back; the new columns and table stay and are ignored. .42
does not know the NA and EU raid roles: applications moved to them show the raw role name, and saving one means picking
the role again, until .43 is back.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 275 (the NA/EU migration twice over, backups, the grid and raid evenings, consent, the board
with paging, filters, per-voter order and private votes, appointed roles, admin tallies and voter filters, the reload
answer for old pages, deletes with and without mentions, references included; its D1 stand-in refuses a statement
given the wrong number of values, as D1 does), SQL 5 and 12, the migration file on a .42 database, `wrangler deploy
--dry-run` (316 KiB, 84 KiB gzipped, 83 static files). A browser walk-through of the real Worker on a local server
with a fake Discord at 1280, 390 and 320 pixels wide: every page and admin tab, applying with a server-side error and
the consent box, voting and "not voted yet" paging, a cancelled role switch, the unsaved-changes guard, saving names
beside an unsaved friends list, an old leadership application brought onto the board, the reload offer, a CSV
download, and removing mentions; no console errors, CSP violations or sideways scrolling. Two independent reviews: 12
problems, then 8 more in the fixes; all fixed and covered by tests or the walk-through.

**Fonts.** Friz Quadrata (ITC) and Morpheus are commercial typefaces that Blizzard licenses for the game; serving them
from a website may need a licence of its own, separate from the question of the art. If that matters, `app.css` names
them in two `@font-face` rules, and free look-alikes can replace the two files.

## Worker .44 — what each role involves, and three new roles (30 Sep 2026)

**What changed on guild.roachcouncil.com.** Design notes: `docs/design.md`, "30 September, later".
- **Three new roles**, from the org charts the community drew: **Leveling Lead** (leveling groups and dungeon runs at
  launch; on the voting board, two write-in picks), **Liaison** (the other Olympus guilds and the rest of the realm; on
  the board, one pick) and **PvP Team** (a way in like Raider, not on the board). Nineteen positions now.
- **Every role explained**: what it is, roughly how much time it takes, who it works with, its responsibilities and
  what the guild expects (`src/site-data.ts`, `info` on each position; the page gets it with the other lists).
  - Apply: every choice has **Details**, a dialog with the description and "Choose as my first choice".
  - Vote: above each role's board, what the role is, and "Time, responsibilities and expectations" one click away.
  - **Roles** (new, in the menu): every role on one page, with a link per role for Discord posts
    (`https://guild.roachcouncil.com/#/roles/liaison`). It is the only page open without signing in. "Apply for this
    role" opens the application with that role chosen, after the Discord sign-in if needed; someone who already
    applied gets "Open your application", and their choices are marked.
- **The wording is a first draft.** The times and expectations are proposals, including an authenticator for Guild
  Masters, officers and the Treasurer and two-factor authentication for Discord moderators. Change any sentence in
  `src/site-data.ts` (plain text; the tests check that every role still has a description, three or more
  responsibilities, two or more expectations and a time) and deploy again.
- **Three icons** from the Forever client: a handshake (Liaison), a map and compass (Leveling Lead) and the Insignia of
  the Alliance (PvP Team). `tools/build-site-assets.py` now makes 81 files.

**Config.** Nothing new: no variables, secrets, tables or settings. Admin → Settings → "Appointed roles" lists Leveling
Lead and Liaison by itself.

**Rollout.**
1. From `worker/`: `npm run deploy`. `/health` then shows build `2026-09-30.44 roles`.
2. In a private window (signed out), open `https://guild.roachcouncil.com/#/roles`: nineteen roles, "Sign in to apply"
   on each open one, the Treasurer marked appointed.
3. Signed in: Apply → Details on any role; Vote → a role → "Time, responsibilities and expectations".
4. If Leveling Lead or Liaison is already decided, appoint it in Admin → Settings before people apply for it.
5. Optional: post the Roles link in the Olympus channels.

A page opened before the deploy keeps working (its saves are accepted) but shows the new roles only after a reload.

**Rollback.** Redeploying .43 removes the Roles page, the descriptions and the three roles. Applications and write-ins
that name them stay in the database; .43 shows the bare key (`leveling`, `liaison`, `pvp_team`), and such an
application cannot be saved again until its choice is changed.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 295. The new site tests check:
- every description is complete and reaches the page, signed in and signed out;
- the new roles on the form, the board and the write-ins (two for Leveling Lead, one for Liaison, none for PvP Team);
- the leadership questions for Liaison and for Leveling Lead as a backup;
- appointing both, and an icon for every role.

`wrangler deploy --dry-run`: 336 KiB, 89 KiB gzipped, 86 static files.

The browser walk-throughs ran the real Worker on a local server with a fake Discord, at 1280, 390 and 320 pixels.
- The .43 walk-through was run again. Its "not voted yet" paging check failed in one of four runs and passed in the
  other three; the paging code did not change in .44.
- A new walk-through covers:
  - the Roles page signed out, signed in, and for someone who has applied;
  - links to a role (scroll and focus) and the jump links;
  - Details: choosing a role, an appointed role, the current choice, and Class Lead;
  - "Apply for this role": preselect, scroll and focus, a withdrawn application's backup, and a class named in the link;
  - "Sign in to apply" through the Discord sign-in;
  - the role text on the voting board.

No console errors, CSP violations, overlaps or sideways scrolling. An independent review found 18 problems:
- focus after a jump;
- the role lost in the sign-in round trip;
- an old tab's Vote page if a new role becomes the busiest;
- the dialog's accessible name;
- narrow phones;
- sentences that contradicted the board, the addon or each other.

All are fixed except one: the Details buttons still add a Tab stop each.

## Worker .45 — roles without a public vote, a Co-Guild Master, and professions (30 Sep 2026)

**What changed on guild.roachcouncil.com.** Design notes: `docs/design.md`, "30 September, evening".
- **Roles without a public vote**, a new list in Admin → Settings. A ticked role still takes applications (first
  choice or backup) and asks the leadership questions, but it has no voting board and no write-ins: the leadership
  reads its applications on the Applications tab and chooses. An application whose leadership choices are all such
  roles is not asked to go on the board. The Apply, Vote and Roles pages mark them with the game's party-leader crown.
  Until the list is first saved, the Co-Guild Master is on it.
- **Co-Guild Master**, a new leadership position, first on the list: Asmongold's second in command in Olympus. Its
  description is in `src/site-data.ts` with the others, and like them it is a first draft (the time, "someone
  Asmongold and the officers already know and trust", an authenticator and two-factor authentication on Discord).
  Twenty positions now.
- **Professions**, optional, on the Apply form under "About you": Forever's nine primary professions (two at most) and
  its three secondary ones, as buttons with the game's icons. Only the leadership sees them: on the application's
  admin page, in a new "Professions" table on the admin Overview (a row opens those applications), in a "Profession"
  filter on the Applications tab and in a `professions` column of the Applications download. Never on the voting board.
- **Thirteen icons** from the Forever client: a gold crown for the Co-Guild Master, and the twelve profession icons.
  `tools/build-site-assets.py` now makes 94 files.

**Config.** Nothing to set: no variables, secrets or tables. The new site setting (`noVote` in `site_settings`) is
saved from Admin → Settings.

**Rollout.**
1. From `worker/`: `npm run deploy`. `/health` then shows build `2026-09-30.45 no-vote`.
2. In a private window (signed out), open `https://guild.roachcouncil.com/#/roles/co_gm`: the Co-Guild Master, tagged
   "Leadership: no public vote", with "Sign in to apply".
3. Admin → Settings → "Roles without a public vote": the Co-Guild Master is ticked. Tick any other role the
   leadership will choose itself, untick the Co-Guild Master if it should be voted on after all, and save.
4. If the Co-Guild Master is already decided, appoint them under "Appointed roles" instead: that closes the role.
5. Admin → Overview → "Professions" fills in as people apply, or save their application again.

Agreeing to the board covers a whole application. So when a role is put to the vote (unticked), every application that
chose it and agreed to the board for another role is listed under it at once; the form tells applicants so. Those who
chose only unticked roles appear once they save with the box ticked, and their Home page asks them to.

A page opened before the deploy keeps working: its saves are accepted, and a save from it keeps the professions already
stored (it cannot send any). It shows the Co-Guild Master and the professions after a reload. When a role is taken off
the vote while someone has the site open, their next board load or write-in save says so and redraws the page; a form
refused for a missing board tick shows the box without losing what was typed.

**Rollback.** Redeploying .44 removes the Co-Guild Master, the list and the professions from the pages. Applications
that name the Co-Guild Master stay in the database; .44 shows the bare key (`co_gm`), and such an application cannot be
saved again until its choice is changed. The setting and the stored professions stay in the database unused, and come
back with .45.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 345. The new site tests check:
- the Co-Guild Master: a leadership role with one write-in pick, off the public vote until the list is saved;
- applying for it alone (leadership questions, no board consent, off the board even when the page ticks the box), and
  beside a voted role (consent needed; the refusal carries the current list);
- its board, votes and write-ins closed; no counts for it in the board summary (nor for appointed roles);
- an admin editing the list (cleaned, refused if not a list, members refused), Officer off the vote and back, progress
  and "you were nominated" following it, per-class Class Lead keys, and appointed coming first;
- professions: at most two primary, only Forever's, stored once each in order, cleared by an empty list, kept by a save
  that sends none; the Overview tally without withdrawn or denied applications, the filter alone and with every other
  filter, the export column, and an icon for each.

`wrangler deploy --dry-run`: 343 KiB, 91 KiB gzipped, 99 static files.

The browser walk-throughs ran the real Worker on a local server with a fake Discord. The .43 and .44 walk-throughs ran
again, clean. A new one covers:
- the Roles page signed out, on a computer and a phone;
- applying for the Co-Guild Master alone and with Officer as a backup, its Details, and the professions (two primary at
  most, and the reason when a third is pressed), at 1280, 390 and 320 pixels;
- the Vote page: the crown, the note instead of a board, no write-ins, the default board never a closed one, the phone
  picker, and "Apply for it" from the note;
- the admin Overview table, the filter, the application page, the Votes card and role page, and the Settings list
  (taking Officer off the vote and putting it back);
- a form, a board and write-ins left open while an admin changes the list.

No console errors, CSP violations, overlaps or sideways scrolling. An independent review found 12 problems, and 5 more
in the first fixes. All are fixed but two:
- agreeing to the board still covers a whole application (see above; the texts now say so);
- the admin's profession figures read each application's answers with `json_each`, fine at the site's scale. At many
  thousands of applications a column filled at save time would be cheaper.

## Worker .46 — what each role comes with in game (30 Sep 2026)

**What changed on guild.roachcouncil.com.** Every role's description has one more line, "In game": the guild rank it
comes with and, where there is one, its title in the Olympus addon. The Roles page, a choice's Details on the Apply page
and "Time, responsibilities and expectations" above each voting board all show it. Examples: Officer is "The Officer
rank, right below the Guild Master. In the Olympus addon you are a Captain…"; Class Lead is "No rank of its own: you
keep your rank, usually Raider."

The lines assume the ladder proposed for release, with Officer second: Guild Master, Officer, Treasurer, Officer Alt,
Raid Leader, Veteran, Raider, Member, Alt, Initiate. Officer has to come second because the Olympus addon treats the
rank right below the Guild Master as its Captains in every Olympus guild (`ns.CAPTAIN_RANK = 1`). The Captains chat,
Call to Arms and Muster, loot notes and recruits' join requests all go by that rank. If the ladder changes, change the
`game` sentences in `src/site-data.ts` with it.

**Config.** Nothing new. For the release ladder, two settings of ours follow it: OlympusVerify's `protectRankIndex` of
5 in `Config.lua` (Guild Master through Veteran never suggested for removal) and `OFFICER_RANK_NAMES = "Guild
Master,Officer,Treasurer,Officer Alt"` in `wrangler.toml`. Change them once the ranks exist in game, not before.

**Rollout.**
1. From `worker/`: `npm run deploy`. `/health` then shows build `2026-09-30.46 in-game`.
2. Signed out, `https://guild.roachcouncil.com/#/roles/officer`: the Officer card's facts end with "In game".

**Rollback.** Redeploying .45 drops the line; nothing else changes.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 347. The new site tests check that every role has its in-game line as a finished plain
sentence, that the Officer-rank roles name the addon's Captains, and that the page shows the line. The browser
walk-through checked the line on all twenty role cards at 1280, 390 and 320 pixels, in Details and above a board; the
.44 and .45 walk-throughs ran again, clean.

`wrangler deploy --dry-run`: 345 KiB, 92 KiB gzipped, 99 static files.

## Worker .47 — the interactions door: timestamp window, body cap, application check, replay ledger (30 Sep 2026)

**What changed.** Nothing a member or an officer sees. `POST /interactions` now refuses, in this order: a body over
128 KiB (413, counted as it streams in, before anything is decoded); a signature whose timestamp is more than 300 s
from now (401, the Ed25519 check itself is unchanged); a payload signed for another application than `DISCORD_APP_ID`
(400); and a command, button or form whose interaction id was already seen in the last hour (409). Ping and
autocomplete are never ledgered: no side effects, and autocomplete fires on every keystroke. Discord signs the
timestamp with the body, so a captured request could until now be replayed for as long as the signature held; it
cannot any more. Same mechanisms as Olympus Forever's `src/bot/interactions.ts`, brought over in the consolidation
(`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`).

**Database.** One new table, `seen_interactions (id, seen_at, response)`, created by the Worker itself at the first
request (`src/schema.ts`); `migrations/2026-09-30-seen-interactions.sql` is the same statement for anyone who prefers
to run it first. The cron forgets ids older than an hour.

**Recovery (Codex's review of the first .47 commit, 23:28 and 23:33 UTC).** The id is claimed before the handler runs,
and the handler's answer is stored with the claim afterwards: a repeat of the same id is answered from the ledger with
that exact answer (200) and runs nothing, and a duplicate that arrives while the first run is still in flight gets 409.
A handler that throws is answered with one fixed ephemeral reply ("Something went wrong on our side ... run it again")
and that reply fills its claim, so a captured copy of the failed request can only ever get the reply, never a second
run of a command that may have half-completed; the person's fresh command is a new id and runs normally (`/verify`
finds its open request and shows the same code). The claim is never released. The reply carries no error detail (a
message can carry codes); the detail goes to the Worker log by message only.

**Config.** Nothing new.

**Rollout.**
1. From `worker/`: `npm run deploy`. `/health` then shows build `2026-09-30.47 hardening`.
2. In Discord, any command (`/verify-status` is harmless): answered as before. The Developer Portal's Interactions
   Endpoint URL needs no change; Discord's ping on save is answered (a ping is not ledgered).

**Rollback.** Redeploying .46 leaves the table in place, unused; nothing else changes.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 347, and the new `tests/interactions_hardening_test.cjs` (47): a real Ed25519 key pair signs
requests through the real `index.ts`; the window's edges (299 s in, 301 s out, both directions), a changed nibble, a
body that no longer matches, the cap by declared length and by streaming, a malformed Content-Length, the wrong and the
missing application, first/second/third command, a repeated form answered from the ledger, un-ledgered autocomplete,
ids that are not snowflakes, the four recovery cases (a transient D1 failure before the effect, one after it, a
concurrent duplicate held at a gate, byte-identical response delivery), the hourly purge at its exact edge, and
`ensureSchema` adding the table to a .25-era database.

## Repository files (30 Sep 2026): git, CI, exact-commit deploys, security runbook

**What changed.** No Worker change (build stays .47). The folder became a git repository on 30 Sep (baseline
`0a29611` = the .46 tree as found; `d326709` = .47) and gained the repository files Olympus Forever already had, adapted:
`.gitattributes` (LF, binaries marked), `.editorconfig`, `.nvmrc` (24), a fixed `.gitignore` (the old `.dev.vars.*`
pattern hid `worker/.dev.vars.example`, the only template; `watcher/watcher-state*.json`, `artifacts/`, the 17 Sep
probe dumps and `*.bak*` stay out), `.gitleaks.toml` + `scripts/scan-secrets.sh` (the same pinned Gitleaks 8.30.1 the
Forever review adopted), `scripts/deploy-commit.sh` (deploy an exact commit from a clean export; only `--dry-run` and `--outdir` may follow
the commit, any other wrangler argument or `CLOUDFLARE_ENV` is refused before wrangler runs, proven by
`scripts/tests/deploy-commit.test.sh` with a fake `npx` on PATH), `.github/` (CI with three jobs, worker, watcher+tools
and addon suites through Lupa 2.8, and one aggregate `check` job that always runs and fails unless all three report
exactly `success` (`scripts/ci-gate.sh`; GitHub counts a skipped required job as passed, so the gate must never be
skipped), which is the status a ruleset on `main` requires; Dependabot; a PR template), `SECURITY.md` (secret
locations, rotation order for the three-copy `VERIFY_SECRET`, leak response, a D1 restore that merges
`seen_interactions` back), `LICENSE` (the same proprietary notice as Forever's, with the policies excepted; the owner's
to change), `CLAUDE.md` + `AGENTS.md` (the agents' rules).

**Rollout.** Nothing to deploy. Once the GitHub repository exists (owner step: rename `olympus-verify-policies` to
`olympus-verify` only after the portal policy links have moved off GitHub Pages, see the plan), push `main`, watch the
first CI run, then add a ruleset on `main` like Forever's (`main-reviewed-changes`: PR required, status `check`,
linear history, no force-push, empty bypass).

**Rollback.** Delete the files; nothing else depends on them.

**Checks on this PC.** `bash scripts/deploy-commit.sh HEAD --dry-run --outdir <scratch>` exports the head and bundles
347.33 KiB / 92.57 KiB gzipped, identical to the working-folder dry run; `scripts/tests/deploy-commit.test.sh` 21/21
(accepted forms reach the fake wrangler exactly once with `deploy --config <export>/worker/wrangler.toml --dry-run`;
`--config`, `-c`, `--name`, `--env`, `-e`, their `=` forms, any other flag, `--outdir` without `--dry-run`, a missing or
unknown commit and `CLOUDFLARE_ENV` are all refused before wrangler runs); tools tests 10/10 and 38/38; watcher 48 (2
skipped without a lua binary) and relay 16/16; `bash -n` on both scripts. CI itself cannot run until the repository is
on GitHub; its Lupa step (`pip install lupa==2.8`, the version the local venv runs) is the one part not exercised here.

## Worker .48 — Battle.net data is kept 29 days, then purged (30 Sep 2026)

**What changed.** Blizzard's Developer API Terms allow data obtained from their API to be kept for 30 days at most.
What this Worker obtains from Blizzard is the BattleTag and account id read at `/bnet/link` (`members.battletag`,
`bnet_conn_id`, with `linked_at` refreshed by every Battle.net login) and, on the dormant Phase 3 path, the account id
and character list. Since .32 none of it gates anything. So this build adds retention only, as agreed with Codex in the
consolidation log (30 Sep, 23:28 UTC): a record not refreshed by a fresh Blizzard login within 29 days (one day inside
the limit, for a late cron) is purged by the half-hourly cron (`src/bnet-retention.ts` `purgeBattleNetData`: tag,
account id and timestamp cleared; Phase 3 fields and `bnet_characters` likewise; the audit rows that named the tag get
`[expired]` as their subject); every reader treats an unpurged stale row as absent (`/verify-status`, the officer
lookups); a new link purges first, so a stale namesake row can never block it; nothing about admission, character
links, Guild Member or the queue changes; no DM, no notice. `/verify-status` tells a linked member the day their link
goes unless they link again.

A ban used to rely on the BattleTag staying on record so the same Battle.net account could not re-link from a new
Discord account. This build kept a keyed fingerprint of the tag instead (`members.bnet_hash`). **Removed in .50
(below), before any deploy:** Codex's review (30 Sep, 23:55 UTC) held that a keyed digest of an API-derived identifier
kept indefinitely is still an API-derived identifier kept indefinitely, and that the retention contract is 29 days for
all of it. .48 was never deployed, so no database has the column.

Not covered, by design of the platform: the `battlenet_linked = 1` role-connection metadata pushed to Discord at link
time lives with the member's own Discord account (Discord shows it as their connection); the Worker holds no token that
could clear it and Discord updates it only when the member links again. The privacy policy says what is kept and for
how long (`policies/privacy.html`, "What it stores" and the ban paragraph; the owner uploads it to GitHub Pages as before).

**Database.** `members.bnet_hash TEXT`, added by the Worker itself at first request (`src/schema.ts`);
`migrations/2026-09-30-bnet-retention.sql` is the same statement. No backfill: existing rows keep their `linked_at`,
and rows with a tag but no timestamp are purged at the first run rather than given an invented one.

**Config.** Nothing new. The 29 days are a constant (`BNET_TTL_DAYS`), like Olympus Forever's.

**Rollout.**
1. From `worker/`: `npm run deploy` (or, from the repository root, `bash scripts/deploy-commit.sh <sha>`). `/health` then
   shows build `2026-09-30.48 retention` and a `bnetRetention: { overdue, oldestAgeDays }` line; after the first cron
   run `overdue` is 0 and `oldestAgeDays` is at most 28.
2. Upload `policies/privacy.html` to the policies repository (GitHub Pages) as for .43.
3. Expect: every link older than 29 days disappears from `/verify-status` and the lookups at the first cron run. The
   audit gets one `bnet.retention` row with counts only.

**Rollback.** Redeploying .47 stops the purge; already-purged tags are gone (they were past their permitted retention
anyway). The column stays, unused.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 347 (build pin .48), interactions hardening 49, and the new `tests/bnet_retention_test.cjs`
(40): the 29-day edge from both sides, no invented timestamps, the purge of every field, Phase 3 rows and audit
subjects, idempotence, the counts-only audit row, request-time filtering in `/verify-status` and the lookup while the
cron is late, a fresh link clearing a stale namesake instead of being refused, the ban fingerprint taken by the
command and by the purge, blocking a re-link 30 days later, dropped by unban, the cron wiring, the `/health` line, and
`ensureSchema` adding the column to a .25-era database.

## Worker .49 — hosts, the public /health, the watcher token, no credential ever follows a redirect (30 Sep 2026)

**What changed.** Five hardening items from Olympus Forever, none of them visible to a member on a good day:
1. **Hosts are classified before anything else** (`src/index.ts classifyHost`). The site host serves the site; the
   bot's own host (`PUBLIC_BASE_URL`, the workers.dev address) and localhost serve the bot's routes; a host listed in
   the new `SITE_LEGACY_HOSTS` (empty until the hostname swap) answers a browser GET/HEAD with a 301 to the same path
   and query on `SITE_HOST` (cacheable a day; fragments such as `#/roles/officer` never leave the browser, so those
   links survive) and anything else with 404; any other hostname Cloudflare routes here gets 404 without the
   database being touched. `PUBLIC_BASE_URL` must be a bare https origin or every host answers 503 `misconfigured`.
   This is what makes the swap to `olympus.roachcouncil.com` a config change with a built-in rollback.
2. **`/health` is trimmed for the public**: `ok`, `build`, `d1` (`ok` or `error`). The inventory (which secrets are
   present, config, who is online, the retention line) comes back only with the watcher's bearer, which the
   watcher's `--check` already sends. The deploy checks in this file that read the build keep working.
3. **The watcher token**: an unset or shorter-than-32-character `WATCHER_TOKEN` refuses everyone (before, an empty
   secret accepted `Bearer ` with nothing after it), and both sides are hashed before the constant-time compare.
   The README has asked for 32+ random characters since day one; if the live secret is shorter, set a new one
   (`SECURITY.md`, rotation step 5) before deploying .49, or the watcher is locked out.
4. **No credential ever follows a redirect**: every fetch that carries a bot token, a client secret or a member's
   access token (Discord REST, both OAuth token exchanges, `/users/@me`, the member check, Blizzard's token, userinfo
   and profile calls, the role-connection PUT) goes through `credentialFetch` (`src/discord.ts`): `redirect:
   "manual"`, an 8-second timeout, a 3xx seen as a failure. Blizzard's userinfo body is read only after a 2xx.
5. **The top-level catch** returns `{ error: "internal", requestId }` and logs the message with that id; the error
   text no longer reaches the caller.

**Config.** `wrangler.toml`: `preview_urls = false` (a preview URL would be a second public origin with the same
bindings and secrets); `[observability] enabled = true, head_sampling_rate = 1, redact_query_string = true` (Workers
Logs on, with the OAuth callbacks' `?code=` and `?state=` redacted); `SITE_LEGACY_HOSTS = ""` (filled at the swap).
The cron comment now lists what the cron does.

**Rollout.**
1. Check the live `WATCHER_TOKEN` is at least 32 characters (it should be; `SECURITY.md` if not).
2. From the repository root: `bash scripts/deploy-commit.sh <sha>` (or `npm run deploy` from `worker/`). `/health`
   without a bearer shows `{ ok, build: "2026-09-30.49 hosts", d1 }`; the watcher's `--check` still prints the
   request-code line.
3. Expect in the Cloudflare dashboard: Workers Logs on for `olympus-verify` (Codex's inventory found them off).

**Rollback.** Redeploy .48; nothing to undo.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 347 (pin .49; `/health` read with the bearer), interactions hardening 49, retention 40, and
the new `tests/hosts_test.cjs` (42): every host class incl. case and trimming, the five misconfigured forms of
`PUBLIC_BASE_URL`, the legacy 301 with path and query (GET and HEAD) and 404 for a POST, an unknown host never touching
the database (a trapped D1 counts zero statements), 503 everywhere when misconfigured, localhost served, the public
versus the bearer `/health` and a D1 failure shown as `error` publicly and in full to the watcher, the token rules
(right, wrong of equal length, missing, wrong scheme, unset, empty, 31 and exactly 32 characters, through the route
and the admin route), the top-level catch's id with no error text, and `credentialFetch` on the REST client (redirect
manual, an AbortSignal, a 302 thrown as a failure) plus a source check that `oauth.ts`, `bnet.ts`, `site.ts` and
`discord.ts` make no bare fetch call.

## Worker .50 — retention, second cut: the finite all-copy contract; Phase 3 retired (1 Oct 2026)

**What changed.** Codex's two reviews of .48 (task log, 30 Sep 23:55 UTC and 1 Oct 00:05 UTC, the second with a
23-check offline reader over the exact .48 objects) asked for a *truthful, finite contract* for every copy of
Battle.net-derived data. This build is that contract:
1. **The ban keeps nothing derived from the BattleTag.** The keyed fingerprint of .48 is gone: no `members.bnet_hash`
   column, no `migrations/2026-09-30-bnet-retention.sql`, no check at link time, nothing taken by `ban` or the purge,
   nothing dropped by `unban`. A ban binds the Discord account and the characters bound to it; once a banned member's
   tag has been purged (29 days after their last Battle.net login, like everyone's) the same Battle.net account may
   link from another Discord account. Since .32 the link grants nothing, so that costs nothing. The `ban` reply says
   what the ban binds.
2. **The tag never enters a persistent Discord message.** `describeUser` feeds the ban card in `CHANNEL_MOD_ALERTS`
   and the `#server-log` line, which no purge of ours reaches; it now says `Battle.net: linked (until <day>)` or
   `not linked`, never the tag, fresh or stale. The ephemeral officer lookups still show a fresh tag.
3. **Freshness at every reader and in the replay ledger.** `/olympus-admin ban` and the Discord-ban card showed a
   stale, not-yet-purged tag: fixed by (2). A stored `/verify-status` answer in `seen_interactions` could be replayed
   with the tag seconds after the record expired: read-only commands (`/verify-status`, `/olympus-lookup`, the
   right-click lookup, `/olympus-admin lookup`) are no longer ledgered at all. They have no effect to protect, and a
   repeat is answered afresh, like ping and autocomplete.
4. **No BattleTag is copied into Discord.** The linked-role record pushed at link time (`oauth.ts`,
   `PUT /users/@me/applications/{app}/role-connection`) carried `platform_username: <BattleTag>`. It now carries
   `platform_name`, `metadata.battlenet_linked = 1` and `platform_username: "linked"`: the field is written explicitly
   (Codex, 1 Oct 00:12 UTC) because neither agent has verified whether Discord's PUT replaces or merges the record,
   and a value that is always sent overwrites an earlier copy under either reading; an empty string was not chosen
   because the API's acceptance of it is equally unverified. **Limitation and remedy:** copies pushed by earlier builds
   stay under the member's own Discord account; the Worker holds no token that could clear them, and the purge cannot
   reach them. They go when the member links again (this PUT overwrites the field) or removes the connection in
   Discord's settings. `/verify-status` now says exactly that to everyone who ever linked (the audit
   keeps the fact after the tag is gone; new index `audit_actor_action`), and the privacy policy says it too
   (`policies/privacy.html`, "Discord's own copy").
5. **The health line counts every copy.** `bnetRetention.overdue` now counts a connection id without a tag, an account
   id without a timestamp, a far-future timestamp and an audit subject not yet scrubbed, with the purge's own notion of
   stale; it said `overdue: 0` over all of these before. `oldestAgeDays` looks only at timestamps a clock could have
   produced (no more `-365`).
6. **Far-future timestamps are purged.** A `linked_at` more than 300 s ahead of the clock was treated as stale by the
   readers but kept by the purge forever; the purge now clears it (members, Phase 3 fields, characters, audit).
7. **Phase 3 is retired.** The dormant profile-API path (`src/bnet.ts`: `/bnet/start`, `/bnet/callback`,
   `/verify-bnet`, the 30-minute `syncRosterFromApi`, `bnetHealth`) is removed, with its five vars
   (`PHASE3_BNET_API`, `BNET_REGION`, `BNET_PROFILE_NAMESPACE`, `BNET_GUILD_REALM_SLUG`, `BNET_GUILD_NAME_SLUG`) and
   the `register.mjs` block. *Exactly what is removed:* a command that, once Blizzard listed Forever in the profile
   API, would have let a member verify a character by proving it is on their Battle.net account (no whisper), and a
   cron that would have replaced the addon's roster export with the API's guild roster. *Why:* it was never enabled
   (the API does not list Forever, the realmless-guild endpoint shape was a TODO), and Codex's reader showed that if it
   ever ran it would leave API-derived copies the 29-day purge does not cover (`source='api'` characters, consumed
   pending rows, invite-queue rows, `verify.api_confirmed`/`invite.queued` audit subjects, API roster snapshots with
   level and class that an identical addon export later re-stamped). *What stays:* the in-game whisper as the proof of
   control, the addon's roster export as the roster, the Battle.net *login* for the Linked Role (`oauth.ts`, Phase 2),
   and the `bnet_characters` table and `members.bnet_account_id/bnet_linked_at` columns (schema is additive; the purge
   keeps clearing them so any inherited row expires). The dormant code is in git for the day the API changes.

**Database.** New index `audit_actor_action ON audit(actor, action)`, added by the Worker at first request
(`src/schema.ts`); `migrations/2026-10-01-audit-actor-action.sql` is the same statement. Nothing else; the column .48
would have added is not created, and `ensureSchema` is checked to leave `members` without it.

**Config.** Five vars removed from `wrangler.toml` (above). Nothing new.

**Rollout.**
1. From the repository root: `bash scripts/deploy-commit.sh <sha>`. `/health` (with the watcher's bearer) shows build
   `2026-09-30.50 retention-2` and the `bnetRetention` line; on a live database expect `overdue` to be the number of
   old audit rows still naming a tag, then 0 after the first cron run. `/health` no longer has `phase3`/`namespace`.
2. Upload `policies/privacy.html` to the policies repository (GitHub Pages) as for .43.
3. Expect: the next link by any member rewrites their Discord linked-role record without the BattleTag;
   `/verify-status` carries the Discord-copy line for everyone who ever linked.

**Rollback.** Redeploy .47 or .49; nothing to undo. (The index stays, harmless.)

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 347 (pin .50), hosts 42 (pin .50), interactions hardening 52 (+3: `/verify-status` and
`/olympus-admin lookup` never ledgered, `unban` still ledgered), and `tests/bnet_retention_test.cjs` rewritten:
everything .48 covered minus the fingerprint, plus: the ban command and card show no tag for a stale link *and none
for a fresh one* (log and card checked); the retired command is unknown and its routes 404; a banned member's tag is
purged like everyone's with the ban staying; the same Battle.net account may then link from another Discord account;
the linked-role record pushed to Discord carries the flag and `platform_username: "linked"`, never a tag; the health line counts an
unscrubbed audit row (and its age), a conn-id-only row, an account-id-only row and a far-future row, each cleared by
the purge, while a 200 s clock skew is left alone; a `/verify-status` repeat with the same id three seconds past the
deadline is answered afresh without the tag and nothing was ledgered; the Discord-copy line for a fresh link, for a
purged one, and not for someone who never linked; `ensureSchema` leaves `members` without a BattleTag-derived column.
Codex's readers (`evidence/batch3-retention-read-repro.cjs`, `evidence/attachments/batch3-retention-copies-repro.cjs`)
are pinned to .48's objects and call the removed `bnetFingerprint`; Codex re-runs them against this commit.

## Worker .51 — the bundle that workerd will run; log digests; legacy sign-in restart; assets behind the host check; Discord's record deleted before it is rewritten (1 Oct 2026)

**What changed.** Codex's reviews of .49 on the real runtime (task log, 1 Oct 00:04 and 00:23 UTC) and of the .50
linked-role write (00:21 UTC):
1. **The entry starts.** `wrangler deploy --dry-run` of .47 to .50 produced a bundle that **workerd refuses at
   startup** (`Incorrect type for map entry 'INTERACTION_FAILED': the provided value is not of type 'function or
   ExportedHandler'`): a module entry may export only the handler and functions, and `index.ts` exported a string
   constant since .47. None of the CJS suites could see it; they import the transpiled module, not the bundle under the
   runtime. The constant now lives in `discord.ts`, and the new `tests/bundle_runtime_test.cjs` (in `test:all`) runs
   the dry-run, loads the exact bundle in the local Miniflare/workerd that ships with wrangler, with synthetic vars, a
   fresh D1 and the real `public/` assets, and checks startup, the schema applying to a real D1 (`/health` → `d1: ok`),
   every host class, the assets binding, the 401s, and the OAuth restart below. Nothing leaves the machine.
   **.47, .48, .49 and .50 are not deployable**; .51 is the first commit since .46 whose bundle starts.
2. **Log categories.** Workers Logs are on since .49, and every `console.error` printed an error message, which an
   upstream or D1 failure can fill with a table name, a host, a code or a tag. Every console call in `src/` now goes
   through `log.ts errorRef`: one of nine fixed categories (`upstream`, `d1`, `timeout`, `aborted`, `type`, `syntax`,
   `range`, `error`, `thrown`) plus the HTTP status when the error carries one, bounded to 100-599. Nothing derived from
   the message or the error's name is written (an earlier draft hashed the message; Codex, 00:42: a digest of a short
   code is reversible by trial and a digest of a tag is a derived identifier). The top-level catch logs the request id,
   the pathname (cut at 64, never the query) and the category; an interaction failure logs the command name or the
   custom_id's namespace only; those are the correlation. The watcher-only `/health` error fields use the same form.
   The hosts suite captures `console.error` and asserts the synthetic secret is absent, feeds secrets through
   `message`, `name`, a D1 text, a thrown string, an object and null, and fails on any console call in `src/` without
   `errorRef`.
3. **A legacy host never forwards a sign-in.** `/auth/*`, `/oauth/*`, `/bnet/*` and `/linked-role` on a host in
   `SITE_LEGACY_HOSTS` answer 302 to `https://<site>/` with `Cache-Control: no-store` and no query: the state cookie
   belongs to the old host, and `?code=&state=` must not cross hosts or sit in a cache. Every other path keeps the
   cacheable 301 with path and query.
4. **Static files go through the host check.** `wrangler.toml [assets]` gains `binding = "ASSETS"` and
   `run_worker_first = true`: every request runs the Worker, which hands `GET/HEAD /static/*` on the site host to the
   binding (before the database is touched) and gives every other host its class's answer; before, Cloudflare served
   the files on any hostname routed to the Worker, bypassing `classifyHost`. Cost: one Worker request per file as well
   as the page (four small files, browser-cached).
5. **Discord's linked-role record: delete, write, read back.** Discord's documentation (Codex, 00:21) lists
   `platform_username` as optional and not nullable, and a *Delete Current User Application Role Connection* endpoint
   under the same `role_connections.write` scope. At link time the Worker now DELETEs the record with the member's
   token (held for this request only), PUTs the new one (`platform_name`, `platform_username: "linked"`,
   `metadata.battlenet_linked = 1`), and reads Discord's answer back: if `platform_username` in it is a string other
   than `linked`, the link is audited `link.metadata_failed { stale: true }` and the member sees "Discord still shows
   an older name on this connection: remove it under Settings → Connections and link once more" (502). Nothing from
   the answer is logged or stored. `link.ok` records `cleared: true/false` (whether the DELETE succeeded). The .50
   limitation stands for members who never link again; `/verify-status` keeps telling them.
6. **A caller's AbortSignal no longer replaces the deadline.** `credentialFetch` used `init.signal ?? timeout`; a caller
   passing its own signal lost the eight seconds (Codex, 00:30; no live caller does, a helper-contract gap). The two
   are now composed (`withDeadline`, `AbortSignal.any`), and a runtime without `any` keeps the deadline alone.
7. **The retired path's rows are counted, not assumed away.** Codex (00:30): `PHASE3_BNET_API=false` does not by
   itself prove the live database holds no API-written row. The watcher's `/health` now carries `legacyApi`
   (`bnet-retention.ts legacyApiCounts`): characters, pending rows and roster snapshots with `source = 'api'`, the three
   Phase 3 audit actions, `bnet_characters` rows and members with a Phase 3 account id. Read-only, counts only. The
   all-copy claim for the live database is stated once this reads all zeros there (rollout step 2); a non-zero count
   is a cleanup to review, never an automatic delete. `fingerprintColumn` says whether the .48 column ever landed (it
   did not deploy; expected 0). `oldestAgeDays` is clamped at 0 for a record within the allowed clock skew (Codex,
   00:38).

**Database.** Nothing. **Config.** `[assets] binding`, `run_worker_first` (above). No new var or secret.

**Rollout.**
1. Confirm the live `WATCHER_TOKEN` is at least 32 characters (unchanged requirement from .49).
2. From the repository root: `bash scripts/deploy-commit.sh <sha>`. `/health` shows `{ ok, build: "2026-10-01.51
   runtime", d1: "ok" }`; `/static/app.css` on `guild.roachcouncil.com` still answers 200; the same path on the
   workers.dev host answers 404 (new); Workers Logs show `unhandled <id> <path> <Class#digest>` lines, never messages.
   With the watcher's bearer, `/health` shows `legacyApi` all zeros (expected: the path never ran); anything else is
   posted to the task log before any further retention claim.
3. Upload `policies/privacy.html` (unchanged since .50) if not done.
4. Watch the first Battle.net link after the deploy: the audit row `link.ok` carries `cleared: true`; a
   `link.metadata_failed { stale: true }` would mean Discord's PUT does not replace the record, in which case the
   member's remedy in the page text is the right one and the agents revisit.

**Rollback.** Redeploy .46 (the last bundle that starts). Not .47 to .50.

**Tests.** Worker: typecheck, vectors 12, notices 22, restore 16, role sweep 21, tickets 52, Verify button 18, review
fixes 64, intros 57, site 347 (pin .51), hardening 52, retention 64 (+6: DELETE then PUT, `cleared` audited, the
stale-readback refusal with the other name nowhere, the tag still saved), hosts 65 (+23: the OAuth restart on five
paths and the near-miss path, the static files on four host classes and a POST, the captured log line, `errorRef`
over a poisoned message and name, an upstream status, out-of-range statuses, a D1 text, the five kinds, a thrown
string/object/null, the allowed forms, the custom_id namespace, the source check for bare console calls, the entry's
exports, the composed abort signal and the deadline alone), retention 69 (+11 over .50: DELETE then PUT, `cleared` audited, the
stale-readback refusal with the other name nowhere, the tag still saved, the legacy-API counts at zero, one inherited
row of each kind counted, the fingerprint column absent here and present on a .48 database, the counts on the
watcher's `/health` and not the public one, the age clamped at zero for a skewed record alone), and the new **bundle runtime
17** (the dry-run bundle is written and exports a handler; it starts in workerd; `schema.sql` applies statement by
statement to a real D1; `/health` public and with the bearer, `d1: ok`; the site page and its stylesheet through the
binding; the unknown-host 404 for a file; the legacy 301 and the OAuth 302; a wrongly signed ping 401 and a properly
signed one answered, with a real Ed25519 key; the watcher's endpoints 401 without the bearer and 200 with it).

## Worker .52 — the pinned guide and the information intro, from the reviewed content candidate (1 Oct 2026)

**What changed.** Codex's content candidate (`consolidation-2026-09-30/evidence/discord-content-candidate.json`, 1 Oct
00:37 UTC; Blizzard facts re-checked against three official articles the same day) goes into the two texts the bot
owns, by editing in place: the same registry key and message ids, so `/olympus-intros refresh` edits, never re-posts.
1. **The pinned join guide** (`guide.ts guideMessage`): titled "Join Olympus or restore your guild access"; Battle.net
   and the website called optional; the two steps reworded for the relay (a name may be asked first); the invite
   sentence depends on `ADMISSION_MODE` (officer review before the queue, or the queue); the role sentence appears only
   when `ROLE_GUILD_MEMBER` is set and says what it actually depends on (the officer-exported roster and the access
   checks); the nickname only when `SET_NICKNAME="true"`, described as staff-enabled; "My status" can restore a missing
   role only when the proof is current and no restriction prevents it; codes private, no DM; the footer no longer names
   `#help-desk`; the unconfigured visitors channel is "the visitors channel", not `#olympus-2-x`.
2. **The information intro** (`intros.ts`, key `olympus-info`): the join step no longer tells people to join in game
   first (the supported flow queues an invite); the beta field names selected invited testers and says a guild
   application grants no beta access; the reservation field says three characters and that the planning list reserves
   nothing; the add-on paragraph drops the claim that Blizzard has published no policy and points at the reviewed
   release and the vendor's rules; the facts footer is dated 1 October 2026.
Not in this build: the channel topics (channel settings, Codex proposes, the owner saves) and the portal embed, which the
candidate itself gates on five acceptances that are not met yet.

**Rollout.** Deploy; then an officer runs `/olympus-admin refresh-guide` in the join channel and `/olympus-intros
refresh`; Codex reads the rendered text back (mentions resolved, buttons present, pin kept). Nothing else.

**Rollback.** Redeploy .51 and refresh again; the texts revert in place.

**Tests.** Verify button 24 (+3 rewritten +3: the role sentence and the access checks, the staff-enabled nickname, the
plain title without a role, review versus auto, optional Battle.net/no DM/no `#help-desk`/no `#olympus-2-x`, the
configured visitors channel), intros 62 (+5: the join step, the beta field, the reservation field, the add-on paragraph,
the dated footer); every other suite unchanged (pins .52).

## Worker .53 — the linked-role record is read back with GET and classified; nothing inferred from absence (1 Oct 2026)

**What changed.** Codex's role-connection contract receipt (`evidence/discord-role-connection-contract.md`, 00:59 UTC)
records documented DELETE, GET and PUT under the existing scope, a string-only `platform_username`, and an
inconsistency in the documented return structure. .51 trusted the PUT's echo and treated an absent field as fine. Now
`bindBattletag` reads the record back with **GET** after the PUT (`oauth.ts readConnectionBack`) and classifies the
answer: `linked` (the field is exactly ours: confirmed clean), `other` (another string survived: the link is audited
`link.metadata_failed { stale: true }` and the member sees the remove-and-relink page, as in .51), `absent` (no string,
a non-string, a non-JSON body or a failed GET: the link succeeds and is audited `link.ok { readback: "absent" }`, which
means **unconfirmed**, never clean). `link.ok` details carry `cleared` and `readback`; nothing else from the answer is
kept or logged. `/verify-status` keeps telling everyone who ever linked how an older copy goes away.

**Rollout.** With .51/.52. Watch the first links: `readback: "linked"` confirms replace semantics on Discord's side;
`"absent"` across several links means the GET does not echo the field and the agents revisit with the receipt.

**Rollback.** Redeploy .51 (same contract minus the GET).

**Tests.** Retention 72 (+3: the DELETE, PUT, GET order; `readback: "linked"` audited; a GET that still shows another
name refused; a GET without a username string, a failed GET and a non-string username all `absent` and unconfirmed, the
link succeeding); pins .53; everything else unchanged.

## Worker .54 — "Linked" only on positive proof; a D1 failure is never read as a clean column (1 Oct 2026)

**What changed.** Codex's boundary review of .51 (task log, 1 Oct 01:04 UTC; 9 correlated failures in
`batch51-boundary-repro`):
1. **The link page says "Linked" only when the GET readback proves the record clean** (`readback === "linked"`). A PUT
   whose body is `{}`, non-string, `null`, an array or invalid JSON no longer matters, because the PUT's echo is not
   consulted at all; a GET that returns no string, a non-string, an array, invalid JSON or a non-2xx is `absent` and is
   now a **truthful failure**: `link.metadata_failed { readback: "absent", cleared }` and an "Almost" page with the
   remedy (try once more; if it keeps happening, remove the connection under Settings → Connections and link again, or
   tell an officer). A refused DELETE (`cleared: false`) is recorded but does not fail a link whose readback proves the
   record clean; a refused DELETE plus an unproven readback fails. The BattleTag binding in D1 stands in every case: the
   link is real, only Discord's record is unproven. No new scope, no stored token.
2. **`legacyApiCounts` treats only "no such column" as column-absent**; any other D1 failure on the probe propagates,
   so the watcher's `/health` shows `legacyApi: "error: d1"` instead of a zero that a deploy gate could mistake for a
   clean database.

**Rollout.** With .51-.53; same receipt. **Rollback.** Redeploy .53.

**Tests.** Retention 78 (+6: `absent` is a 502 with the remedy and the tag still saved; a failed GET, a non-string and
an array body likewise; a refused DELETE with a malformed PUT body but a proving GET is Linked with `cleared: false`; a
refused DELETE with an unproven readback fails; a D1 failure on the column probe throws and `/health` shows an error);
pins .54.

## Worker .55 — one Guild Member role writer, the blocking-role guard, the narrowed staff gates (1 Oct 2026)

**What changed** (tracker A02, D03, D04; plan P-10, P-15, P-16; Codex's coverage matrix of 1 Oct 00:00 UTC):
1. **`src/roles.ts` is the one place Guild Member is granted.** Roster promotion (`roster.ts promote`), the restore
   behind `/verify-status` and the guide's **My status** (`restore.ts`), the sweep and the backfill all call
   `grantMemberRole`, which reads the member's current roles when the caller does not have them, applies the guard
   below, and makes the one `addRole` call. Each caller keeps its own failure handling and audit. New feature modules
   read membership facts; none of them may call `addRole`/`removeRole`.
2. **`BLOCKING_ROLE_IDS`** (new var, comma-separated role ids; `""` today; Asmongold: Quarantine `1399774654893133864`
   and Flagellant `1307420957140320297` with the cutover config): a member holding one of them is never granted Guild
   Member (promotion, restore, sweep, backfill), the sweep **removes** Guild Member while it is held
   (`role.blocked_removed`) and gives it back on a later pass once the restriction is lifted; every refusal is audited
   `role.blocked` with the blocking role. `/verify-status` tells the member the role is on hold because of a server
   restriction (no role named). The backfill reports `blocked` in dry runs and real runs.
3. **Fail-closed configuration check:** once per isolate (ten minutes) the guild's roles are read; when
   `ROLE_GUILD_MEMBER` is not among them no grant is attempted (`role.misconfigured`; the sweep stops the run). When the
   read itself fails the grant proceeds (a missing role would make `addRole` fail on its own, and a Discord outage must
   not become a permanent refusal). The watcher's `/health` carries `roles: { guildMember, blocking, blockingMissing }`.
4. **Staff gates narrowed:** `ROLE_MODERATOR` leaves `officerRoles` (it stays in `staffRoles`, so departure lines still
   say a moderator kept access): in Asmongold's server that var names the server's own Discord Moderator team, who
   should not bind, unbind or ban guild accounts. Officers are Olympus Officer and Guild Leader; Guild Leader (or Guild
   Master where one exists) approves a Discord ban.
5. **The "Ban from Discord" button is shown only when `BAN_BUTTON_ENABLED="true"`** (new var, `"false"`): the bot
   does not hold Ban Members (a separate approval, tracker D03). Until then the card lists the account and says a
   Discord ban is a Guild Leader decision made by hand; a stale card's button answers that it is switched off.
6. **`scripts/register.mjs` refuses to run without `GUILD_ID`**: the PUT replaces a whole server's command list, and
   the server is named explicitly, never defaulted to the beta server.
7. **The watcher's `/health` `d1` field is bounded too** (`error: d1`, via `errorRef`), the last place a raw D1 message
   could reach a reader (Codex's .51 report, 01:11 UTC).

**Config.** `BLOCKING_ROLE_IDS = ""`, `BAN_BUTTON_ENABLED = "false"` in `wrangler.toml`; `ROLE_MODERATOR` keeps its
value (report-only now). **Database.** Nothing.

**Rollout.** With .51-.54. On the beta server nothing changes for members (no blocking roles configured; Moderator
loses `/olympus-admin`, which the beta server's Moderator role has not needed). `/health` with the bearer shows
`roles.guildMember: true`. For the Asmongold cutover commit: `BLOCKING_ROLE_IDS` set to the two ids above.

**Rollback.** Redeploy .54; nothing to undo.

**Tests.** Role sweep 32 (+11: a quarantined member not granted and audited; a member holding both loses Guild Member
and is audited; the staff line; the sweep's count; the role returned once lifted; the guard off when unconfigured; the
misconfigured stop; the per-isolate cache; `rolesStatus` naming a missing blocking role; `blockingRoleIds` parsing),
restore 26 (+5: blocked result and note, the audit, unconfigured behaves as before, banned wins over blocked); every
other suite unchanged (pins .55).

## Worker .56 — the community adapter contract (consolidation batch 1 of 8) (1 Oct 2026)

**What changed.** The first of Codex's eight porting batches (`evidence/forever-keeper-adapter-map.md`, 1 Oct 01:07
UTC): the contract every Olympus Forever module is ported against, with no feature yet.
1. **`src/community-context.ts`**: one identity (the keeper's `__Host-olg` session against `site_users.session_version`),
   facts from keeper tables only (denied, in the server, a roster-confirmed character via `characters.status = 'member'`,
   `members.banned`, `SITE_ADMINS`), and capabilities derived from them (`authenticatedIdentity`, `applicantWrite`,
   `confirmedGuildData`, `communityStaff`); `communityStaff` is `SITE_ADMINS`, distinct from the bot's officer roles,
   which a site session cannot see. No capability writes a Discord role or grants admission.
2. **The write fence**: a community write is one D1 batch whose first statement is admitted by `fenceSql` (the live row
   with the session's version, not denied, in the server; for guild data also a roster-confirmed, unbanned member) and
   stores a write nonce that every later statement requires. `admitted` refuses an expired session before any SQL and
   a first statement that changed nothing; `refusal` re-reads the facts and answers `signed_out`, `denied`,
   `not_member`, `guild_unconfirmed`, or `conflict` when nothing about the member explains it.
3. **The erasure and export registry**: every feature registers its statements and its account-copy part;
   `deleteSiteData` (site-admin.ts) now runs `communityEraseStatements` in the same batch as the keeper's own deletions,
   so no community row can outlive its account.
4. **`community_refs`** (`src/community-refs.ts`, the donor's `member_refs`): one opaque, random, stable 22-character
   reference per member, created inside a member's first admitted write (the statement requires that write's nonce),
   shown to other members instead of a Discord id, erased with the account. Registered for erasure and export.
5. **`src/community-time.ts`**: seconds at every boundary; millisecond and ISO conversion exact by default with explicit
   `floor`/`ceil` policies, ported from Codex's pure helper (33 checks) with its provenance.
6. **`COMMUNITY_FEATURES`** (new var, `""`): the comma list of modules switched on; `crafting` needs `directory`,
   `attendance` needs `events`. Each later batch lands behind this list.
7. **`GET /api/community/context`** (site-api.ts hands `/api/community/*` to `community-routes.ts` after its own
   session, origin and page-version rules): the capabilities, the flags and the member's own id. Read-only; no WAF
   method change.
8. **`src/community-names.ts`, the identity rule** (Codex, 01:19): community tables key character labels by
   `communityKey`, the full normalized name (NFC, spaces collapsed, ASCII capitals lowered, a hyphen never a cut), so
   "Anne-Marie Smith" and "Anne-Beth Smith" stay distinct rows; the keeper's `normalizeCharacter` (which cuts at the
   first hyphen) stays the proof key and is not changed, so every existing code, roster and binding keeps its bytes.
   `resolveCharacter` binds a claim to keeper proof only when the `characters` row under the claim's proof key belongs
   to the subject AND its stored full name has the same community key AND no other account's row carries the same
   GUID; otherwise `conflict` (`other_account`, `name_mismatch`, `guid_other_account`), which a feature refuses and
   files for review, never last-writer-wins; a name the keeper never saw is `unproven`, a label only.
9. `time.ts` refuses an unknown rounding option before reading the value (Codex's review of the pure helper).

**Database.** `community_refs` (schema.sql, schema.ts, `migrations/2026-10-01-community-refs.sql`); additive.
**Config.** `COMMUNITY_FEATURES = ""`.

**Rollout.** With .51-.55; nothing member-visible (`/api/community/context` answers signed-in members only).
**Rollback.** Redeploy .55; the empty table stays, harmless.

**Tests.** New `tests/community_test.cjs` (41): the context for a stranger (401), an applicant, a confirmed member, a
banned one, a denied one, someone who left, a `SITE_ADMIN` (and not when unlisted); the DTO's exact keys; a pre-sign-out
cookie refused; the feature parser and its two dependencies; the fence admitting an applicant write and refusing a
guild-data one with `guild_unconfirmed`; a confirmed member admitted; sign-out, denial, leaving the server, losing the
roster and a ban each refused inside the statement with the right answer; an expired cookie refused before any SQL; a
no-change first statement answered `conflict`; an empty batch refused; token shape; the registry (refs registered,
export, `deleteSiteData` erasing community rows in its batch); the time helpers (exact, floor, ceil, an unknown rounding
refused, refusals, ISO round trip, subsecond policy, projection); the identity rule (two hyphenated names sharing the
proof key but not the community key; NFC and non-ASCII capitals; validation; proven with GUID; the other full name a
`name_mismatch` conflict; another account's claim `other_account`; an unseen name unproven; a duplicate GUID
`guid_other_account`; `codes.ts` unchanged). `test:all` runs it before the workerd suite. Pins .56.

## Worker .57 — the member directory and crafting offers (consolidation batch 2 of 8) (1 Oct 2026)

**What changed.** Olympus Forever's directory and crafting (donor `src/directory.ts`, `src/crafting.ts`, migrations
0011/0014/0015) ported onto the .56 door as `src/community-directory.ts`, behind `directory` and `crafting` in
`COMMUNITY_FEATURES` (both off today):
1. **A member's own profile** (`GET`/`PUT /api/community/profile`): `listed` (opt-in), a main character, a raid role,
   up to four professions with a skill, up to ten claimed alts, up to fifty crafting offers; whole-set replacement with a
   revision compare-and-set; an unchanged save writes nothing. The first statement carries the .56 fence and the
   listing-room check (HL-1: with `COMMUNITY_DIRECTORY_LIMIT` profiles listed the next listing is refused 409
   `directory_full` inside the statement and the profile is saved unlisted); every later statement requires the write
   nonce; the member's ref is created inside the first admitted write.
2. **Names are labels resolved against the keeper's proof** (`community-names.ts`, your 01:19 rule): a main or alt the
   keeper holds under exactly this full name for this account is recorded `proof: keeper`/`source: keeper`; a name the
   keeper never saw is `self`; a collision (another account's character, a different full name under the same proof
   key, a GUID another account holds) refuses the whole save with 409 `name_conflict` naming the labels, audited as a
   count. Claims are keyed by `communityKey` (the full name), so two hyphenated names never share a row.
3. **The listing** (`GET /api/community/directory`): listed profiles whose owner still qualifies at read time (in the
   server, not denied, a roster-confirmed character, not banned; the same predicate as the fence, in the query), by
   `ref` and display name (`nick`, else `global_name`, else `username`), never a Discord id; ordered by display name
   then ref, 100 per page; the cursor carries the digest of the whole visible order, so a rename, an unlisting or a
   departure between pages is 409 `cursor_stale` (a v1-shaped cursor too) and the page starts again; a read over the
   limit is 503 `directory_too_large` rather than part of the guild shown as the whole. Crafts ride along only while
   `crafting` is on; alts without their reviewer.
4. **Crafting search** (`GET /api/community/crafting?q=&profession=&cursor=`): substring of the recipe key with `instr`
   (`%` and `_` literal), or a profession, over offers on listed, qualifying profiles; the cursor is bound to its query.
5. **Staff review** (`GET /api/admin/community/directory`, `POST /api/admin/community/directory/alt`, through
   `site-admin.ts` after its `SITE_ADMINS` check): pending claims and every key two accounts use; a decision
   (`confirm`/`reject`) with the profile's revision as compare-and-set, answered from the batch's own `RETURNING`
   (never read back after a member's later save); `own_record` 409 before and inside the write; `stale_revision`,
   `claim_not_found`, `profile_not_found`.
6. **Retention and erasure**: `sweepCommunityProfiles` (cron, runs with the feature off) starts a 30-day clock for a
   profile whose owner stopped qualifying, clears it on return, deletes profile, professions, claims, offers and ref
   when it runs out, and clears the member's identity as a claim reviewer; `deleteSiteData` does the same at once
   through the .56 registry; the account copy carries the own-profile shape.
Rate limits: 30 saves, 90 listings, 90 searches per minute per member. The member page and its assets follow in the
UI batch (batch 8) with the frontend harness; this build is the API contract, which the client port is written against.

**Database.** `community_profiles`, `community_professions`, `community_alt_claims`, `community_craft_offers`
(schema.sql, schema.ts, `migrations/2026-10-01-community-directory.sql`); additive.
**Config.** `COMMUNITY_DIRECTORY_LIMIT = "2500"`; `COMMUNITY_FEATURES` gains the names `directory`, `crafting` (off).

**Rollout.** With .51-.56; nothing member-visible until the flags are on. The method rule for the site host (C02, an
exact allowlist) must gain `PUT /api/community/profile` and `POST /api/admin/community/directory/alt`.
**Rollback.** Redeploy .56; the empty tables stay, harmless.

**Tests.** New `tests/community_directory_test.cjs` (67): the flags and the guild-only gate; the empty own profile; a
first save with a keeper-proven main and a self alt, audited by field names; stale revision; the unchanged save; the
three conflict kinds refused and audited as counts; main-equals-alt; five professions, a skill over 450, an unknown
field, an unknown raid role, a bad alt name; crafts while crafting is off; one recipe key across professions; crafts
saved and ordered; profession replacement; the reload answer; the listing by ref and display name without ids, with and
without crafts, a departed member vanishing at read time and returning, order; v1, garbage, wrong-digest and
right-digest cursors; the directory-full refusal with the profile saved unlisted, the same save unlisted accepted, the
over-limit read failing closed; the search (substring, literal `%`, profession alone, neither, unknown profession, a
cursor from another query, an unlisted profile vanishing, crafting off); staff review (non-staff 403; pending claims
and a conflict key; confirm with the revision moved; stale revision; claim and profile not found; `own_record`; a
non-key); the export; erasure through `deleteSiteData` incl. the reviewer identity; the departure clock (start, clear,
delete after 31 days, audited count, runs with the feature off). Pins .57.

## Worker .58 — the role writer reads afresh at the effect; unknown inventory refuses and is not cached; every interaction names the guild (1 Oct 2026)

**What changed** (Codex's role-boundary probes on .55, task log 1 Oct 01:35 UTC, five items):
1. **Unknown role inventory refuses, transiently.** When `GET /guilds/{id}/roles` fails (a 403, an outage),
   `grantMemberRole` answers `unverified`: nothing is granted, the failure is **not cached**, and the next request reads
   again. The sweep stops its run with `unverified` and retries next time; the backfill page stops and says so; a roster
   promotion records `role.deferred` and the sweep grants later; a restore says the bot could not put the role back.
2. **The cache is keyed by configuration** (guild id, Guild Member id, blocking ids): a changed configuration is read
   afresh instead of answering from the previous one.
3. **Fresh reads at the effect.** Whatever roles a caller already holds (an interaction payload, the sweep's own
   lookup), the writer re-reads the member from Discord and `members.banned` from D1 immediately before `addRole`; a
   restriction or a ban that landed in between is seen (`blocked`, `banned`). The residual is named: a read and a write
   on two providers are two steps, and a restriction applied in the milliseconds between them can be missed once; the
   sweep's next pass removes the role again. No cross-provider atomicity is claimed.
4. **Every admitted interaction must name the configured guild.** `handleInteraction` required the guild only when a
   `guild_id` was present; a modal or command without one (a DM, a user-installed context) passed and could open a code
   request. Now `i.guild_id !== env.GUILD_ID` is refused for every type but ping (the lookups and intros are routed
   before this guard and check their own guilds).
5. Two BattleTag-shaped literals in the docs (`design.md`, `asmongold-category-2026-09-28.md`) are replaced by
   synthetic examples before the source is published (Codex's redacted history scan).

**Config/Database.** Nothing. **Rollout.** With .51-.57. **Rollback.** Redeploy .57.

**Tests.** Role sweep 39 (+5: the config-keyed cache; a 403 on the inventory stops the run unverified and is not cached;
a restriction landing between the sweep's look and the write is caught by the fresh read; a ban written after
selection is caught by the fresh ban read), restore 24 (+3: the payload's roles do not decide; a member gone at the
fresh read; an unreadable inventory fails closed), hardening 53 (+1: a modal without a guild id is refused and opens no
request); pins .58.

## Worker .59 — the fence judges the session's expiry by the database clock; the guild calendar with sign-ups, capacity and attendance (consolidation batch 3 of 8) (1 Oct 2026)

**The repair first** (Codex's review of .56, task log 1 Oct 01:50 UTC): `admitted` checked the cookie's expiry only in
code before the batch, so a session that expired between that check and the first statement still committed.
`fenceSql(cap, idPos, versionPos, expiresPos)` now carries the expiry as a third bound parameter and compares it with
**the database's own clock inside the statement** (`strftime('%s','now')`, `DB_NOW`), never a JavaScript time captured
earlier; the code check stays as a zero-I/O fast refusal. The admission instant is defined as the moment D1 executes the
first statement. Every first statement in .56-.59 binds it (profile save, RSVP, create, update, cancel, attendance). The
context header's stale sentence about character keys is aligned with `community-names.ts`, and the one tautological
check in the suite is a real one now. Test: a session valid to the frozen test clock but expired by the real clock is
refused inside the statement; one valid at that instant is admitted; the SQL names the clock.

**Batch 3** (Olympus Forever's `src/events.ts` and `src/attendance.ts`, the CS-5 v2 bytes for the attendance write's
own-result pairing) as `src/community-events.ts`, behind `events` and `attendance` in `COMMUNITY_FEATURES` (off):
1. **Organizers** are confirmed guild members who are `SITE_ADMINS` or listed in the new `COMMUNITY_ORGANIZERS`
   (capability `organizer` in the context DTO). They create (`POST /api/community/events`, the id is the operation id:
   a retry replays, different values or another creator are `op_conflict`), edit (`POST .../update`: a lowered capacity
   below the places held is `capacity_below_signups`, judged before and inside the write; unchanged says so; another
   organizer's event is `not_event_organizer`, a SITE_ADMIN may), cancel (`POST .../cancel`, retention brought forward).
2. **Members answer** (`PUT /api/community/events/rsvp`: yes/tentative/no, a character label, a raid role, a revision
   compare-and-set): **capacity is judged inside the statement** over the 'yes' answers whose owners qualify at that
   moment, so two racing members cannot both take the last place; `event_full`, `event_started`, `event_cancelled`
   (410), `stale_revision`; a first answer creates the member's ref in the same batch; the sign-up generation moves.
3. **Who counts**: only answers whose owners qualify now (`qualifiesSql` in every count and list), so a member who left
   the roster stops holding a place at once and counts again on return (an event may then be over capacity, which is
   allowed; only a lowering edit is guarded). The calendar's distinct members are bounded (`COMMUNITY_DIRECTORY_LIMIT`,
   `calendar_full` inside the statement); reads past the bound fail closed (`events_too_large`).
4. **Reads**: the list (`GET /api/community/events?from&to&cursor`, 62-day windows, keyset cursor), the detail
   (`GET /api/community/event?id&cursor`: sign-ups of qualifying members by status then name, refs for organizers only,
   a cursor carrying the revision, the generation and the order digest), the organizer's attendance list, the member's
   own history. The organizer's name appears only while the creator qualifies; otherwise a placeholder.
5. **Attendance** (`POST /api/community/attendance/record`, after the start, entries by member ref, 1-100): the upsert's
   own `RETURNING` rows are the answer for this request, exactly `revision + 1` (CS-5 v2); a row another write replaced
   before the read-back is `ok` with `superseded: true`; `stale_revision`, `unknown_member`, per-entry `invalid`;
   `source` is always `officer`; missing means unknown. Attendance never feeds roles, eligibility or any penalty.
6. **Retention and erasure**: `sweepCommunityEvents` (cron) deletes events 30 days after they end with answers,
   attendance and history; erasure removes a member's answers and attendance (generations moved first), anonymizes them
   as creator, recorder and history actor; the account copy carries sign-ups, created events and attendance.

**Database.** `community_events`, `community_event_signups`, `community_event_changes`, `community_event_attendance`
(schema.sql, schema.ts, `migrations/2026-10-01-community-events.sql`); additive. **Config.** `COMMUNITY_ORGANIZERS = ""`.

**Rollout.** With .51-.58; nothing member-visible until the flags are on. **C02 (Codex, 01:56: the method rule is an
exact allowlist, not an `/api/*` wildcard):** the new write paths to add are `PUT /api/community/profile`,
`PUT /api/community/events/rsvp`, `POST /api/community/events`, `POST /api/community/events/update`,
`POST /api/community/events/cancel`, `POST /api/community/attendance/record` and
`POST /api/admin/community/directory/alt`; every `GET` under `/api/community/` is a read. **Rollback.** Redeploy .58;
the empty tables stay.

**Tests.** `community_test.cjs` 59 (+4: the database-clock refusal, the valid instant, the SQL names the clock, the real
other-account check); new **`community_events_test.cjs` (67)**: flags, gates, organizers (member, admin), create with
replay and both `op_conflict`s, five validations, the list and windows, RSVP (first answer and ref, stale revision, the
last place, `event_full` with nothing written, tentative, a departed holder dropping out at read time and the freed
place taken, the returned member counting again, refs for organizers only and none for members, order, a stale
cursor, a changed answer keeping and clearing the character, invalid status/character, 404, `calendar_full` inside the
statement, `event_started`), update and cancel (capacity below places, unchanged, a move flagging answers, another
organizer refused and an admin allowed, stale revision, cancel with retention, 410s), attendance (before the start,
the organizer's list, own `RETURNING` results with `unknown_member` and `stale_revision`, generations and audit count,
a second record, stale, per-entry invalid, empty entries, **the CS-5 superseded case**, own history, `myAttendance`
on and off), erasure (member rows and generations; the creator anonymized), the export, and the 30-day sweep. Pins .59.

## Worker .60 — a ban during the grant is undone on the spot; banned accounts holding the role are reconciled by the sweep (1 Oct 2026)

**What changed** (Codex's .58 probes, task log 1 Oct 01:56 UTC, the two remaining ban cases):
1. **The ban is read after the member await**, as the last thing before `addRole` (it was read before the awaited
   Discord GET, so a ban landing during that GET was followed by the grant).
2. **A post-write ban check.** After `addRole`, `members.banned` is read once more; if set, the role is removed at once
   (`role.revoked_after_ban`) and the outcome is `banned`. A removal that fails is recorded as `role.revoke_pending`.
3. **Banned reconciliation in the sweep** (`roles.ts reconcileBanned`, `restore.ts` step 3): every run also takes up to
   five banned accounts the keeper still counts as in the guild, reads their Discord member, and removes Guild Member
   where held (`role.revoked_banned`), with a cursor of its own in the sweep's audit row; a failed removal is reported
   and retried next run. So a late PUT that landed after a ban, or a removal that failed, is undone within a sweep, not
   left held, and "eligible-member sweeping" is no longer the only compensation.
The residual stays named in `roles.ts`: two providers, two steps; a restriction applied in the milliseconds between them
can be missed once and is corrected by the next sweep. No cross-provider atomicity is claimed.

**Config/Database.** Nothing. **Rollout.** With .51-.59. **Rollback.** Redeploy .59.

**Tests.** Role sweep 45 (+6: a ban landing during the PUT is undone on the spot and audited; a banned holder is
stripped by the reconciliation with the count and cursor audited; a failed removal is pending and retried), restore 25
(+1: a ban written during the member read is seen by the ban read that follows). Pins .60.

## Worker .61 — trial reviews (consolidation batch 4a of 8) (1 Oct 2026)

**What changed.** Olympus Forever's `src/trials.ts` ported as `src/community-trials.ts`, behind `trials` in
`COMMUNITY_FEATURES` (off). A trial is a staff record about a member (start, review due, extended, passed or ended with
a fixed reason), descriptive only: nothing here changes a role, membership or admission, and there are no notes.
1. **The member's own view** (`GET /api/community/trial/me`): any signed-in account in good standing (`applicantWrite`,
   no character needed: a trial comes before the guild) reads the open trial, else the most recently concluded one still
   kept, without sponsor, creator or reviewer; `null` means none recorded.
2. **Staff** (`SITE_ADMINS`, no character of their own needed): `GET /api/admin/community/trials[?status&cursor]`
   (open trials first by due date, then concluded; keyset cursor bound to the filter), `POST /api/admin/community/trials`
   (the id is the operation id: replay, `op_conflict`; `trial_open_exists` through the unique open index inside the
   statement; never one's own; a sponsor is never the member; a due date in the future and at most 90 days ahead),
   `POST /api/admin/community/trials/update` (extend to a later due date; conclude `passed`/`review_passed` or
   `ended`/`withdrew|inactive|staff_decision`; revision and random incarnation compare-and-set; `own_record`,
   `stale_revision`, `trial_concluded`). Staff writes carry the repaired fence (`applicantWrite`, the database clock).
3. **The keeper's rule, a stated deviation**: a trial is opened only for an account that has signed in here
   (`unknown_account` otherwise). The donor let a trial wait for an unknown account and guarded against a just-erased one
   with tombstones; the keeper keeps none, so the `site_users` row is the guard inside the statement, erasure deletes the
   member's trials in the same batch, and a row that vanishes between a write and its read-back is a defined
   `not_found`/`account_deleted`, never a 500.
4. **Retention and erasure**: `sweepCommunityTrials` (cron) deletes trials past `retain_until` (30 days after the
   conclusion, or after the due date while open); erasure removes a member's trials and anonymizes them as sponsor,
   creator or reviewer; the account copy lists their trials without sponsor or staff. `trialsDueCount` for the overview.
Departures, the watch-list restrictions and return review (the donor's `departures.ts`, `restrictions.ts`,
`return-review.ts`) are **batch 4b**, held until Codex's policy and v3-dependency review as the map orders.

**Database.** `community_trials` (schema.sql, schema.ts, `migrations/2026-10-01-community-trials.sql`); additive.
**Config.** Nothing new (`trials` in `COMMUNITY_FEATURES`).

**Rollout.** With .51-.60; nothing visible until the flag is on. C02 exact paths to add: `POST /api/admin/community/trials`,
`POST /api/admin/community/trials/update`. **Rollback.** Redeploy .60; the empty table stays.

**Tests.** New `tests/community_trials_test.cjs` (43): the flag and gates; create with replay and both `op_conflict`s,
`trial_open_exists`, own trial refused, sponsor rules, the unknown account, due-date bounds; the member's own view
without staff; the staff list, filter and cursor; extend (later only), stale revision, reason and outcome pairs, an
extension with an outcome, conclude with reviewer and audit, concluded twice, 404, `own_record`, a new trial after a
conclusion, the status filter; the fence on staff writes (an admin who left the server is refused inside the insert
and inside the update, nothing written); export; erasure of sponsor, reviewer and member; the sweep and the due
count. Pins .61.

## Worker .62 and watcher 0.6.5 — truthful presence (the v3 repair ported) and the watcher's transport hardening (1 Oct 2026)

**Why.** Codex countersigned (02:15 UTC) the v3 proposal's two-file repair (manifest `a086e904…`): queue requests always
carry exactly one `keyVersion=3`, and a partly unknown presence is withheld rather than guessed. Those files are the
donor proposal's watcher, not this one; the keeper takes the behaviours, matched on both sides.

**Watcher 0.6.5** (`watcher/watcher.py`):
1. **Presence** (`officer_online`): online needs BOTH a known running process and a known in-world line; a known stopped
   process is offline whatever the log says; anything partly unknown claims nothing and the `/queue` query omits
   `online`. Until 0.6.4 a running process with no readable `Client.log` (a login screen) was reported as online.
2. **Transport** (plan P-25, from Olympus Forever's watcher): `worker_url` must be a bare HTTPS origin (refused before
   any request, `--check` and the main loop say so); redirects are never followed (a redirect is a configuration error
   and pauses everything 15 minutes); a 401, 403 or 429 pauses every request for 15 minutes (or 60 s for a rate limit, or
   the Worker's `Retry-After`), **persisted in the state file** (`worker_retry_at`, `worker_retry_status`) so a restart
   does not hammer a revoked token, and said once per cause; a response that is not UTF-8 JSON is `invalid_response`,
   not a delivery; **no response body ever reaches the log** (0.6.4 printed the first 200 bytes of error bodies); other
   4xx keep their meaning (understood and rejected, not retried); 5xx and network errors retry as before. `--check`
   reports a pause with its cause.
3. **Not ported, stated:** `keyVersion=3` has no counterpart in this protocol. The keeper's `/queue`, codes and notes
   are the 0.6.x contract; the generation-3 dispatch (full-name key, `challenge-v3`/`verified-v3`/`joined-v3`, exact
   integer `keyVersion`) is the separate, gated decision the candidate's own `WORKER-CONTRACT.md` names ("no version
   negotiation or dual acceptance is implemented on the Worker by this candidate"). Nothing here moves it.

**Worker .62** (`src/relays.ts`, the matched side): a report without `online` is no longer skipped. The sighting is
recorded (character, versions, `seen_at`) and the relay's new `unknown_since` is set until a report states presence
again; while set, the relay is neither online nor "known", so the reply names the character and says to send the code
while they are online, without claiming anyone is online or that nobody is. Until .61 the skipped report let the last
statement go stale, and after ten minutes the reply said "No officer is online right now", a claim the watcher never
made. A stated report clears the mark (and counts as a change for `changed_at`). `/health` `relays.reporting` is false
while every relay is unknown.

**Database.** `relays.unknown_since INTEGER` (schema.sql, schema.ts `addColumn`, `migrations/2026-10-01-relays-unknown-presence.sql`); additive.
**Config.** Nothing new. The watcher's `config.json` is untouched; `worker_url` there is already an HTTPS origin.

**Rollout.** Worker first (nothing changes until a watcher omits `online`); then watcher 0.6.5 on the officer's PC
(copy `watcher.py`; the state file gains two keys on first save). Either order is safe: a 0.6.4 watcher against .62
behaves as before; a 0.6.5 watcher against .61 has its unknown reports skipped as before. **Rollback.** Redeploy .61;
the column stays. Watcher: copy 0.6.4 back; the two state keys are ignored.

**Tests.** Watcher `tests/test_watcher.py` 57 (was 48): the presence rule in both existing and partly-unknown cases
(process list unavailable with an in-world line; stopped process with an in-world line; running process without a
client log) and a new `TransportTests` class (bare HTTPS origin incl. nine refused shapes; 301/302/303/307/308 refused
through the real urllib pipeline with the bearer sent once to the origin only; a 403 pausing everything, persisted and
honoured by a restarted watcher, said once; 429 with `Retry-After` incl. number, HTTP date, past date, garbage, missing;
a success clearing the pause record; non-JSON and non-UTF-8 as `invalid_response`; 400 kept as the Worker's answer and
503 retried without pausing; `--check` reporting a pause and `main` refusing an `http://` origin), with the token and
every fixture body asserted absent from the log. Worker: `tickets_guid_relays_test.cjs` (+2) and `verify_button_test.cjs`
(+1) for the unknown-presence record, the withdrawn claim and the reply; pins .62. Addon unchanged; the Lua suites run
as the combined gate.

## Worker .63 — the banned reconciliation covers every banned account; the ban is re-read before a revoke (1 Oct 2026)

**Why.** Codex's independent review of .60 (02:23 UTC, report `evidence/attachments/role-successor/commit-81f95d98/review.md`):
(P1) `reconcileBanned` selected only banned accounts with a `member`/`left_pending` character, but a failed role removal
does not stop `roster.demote` committing `left`, so a banned holder whose character then left the roster was never
selected again and kept Guild Member for good (two reproduced schedules: a 403 on the post-grant compensation and on the
demotion's removal; a lost PUT response with the same demotion). (P2) the reconciler awaited the member GET and removed
the role without reading the ban again, so an unban that completed during that GET was followed by a removal.

**What changed** (`src/roles.ts reconcileBanned`): every `members.banned = 1` account is eligible, whatever its
characters' status, in the same bounded rotation (`BANNED_PER_RUN` = 5 per run, cursor `b`); after the member GET and
before `revokeForBan`, `members.banned` is read again and an account no longer banned is left alone. Nothing is granted
to a banned account anywhere. The two-provider residual stays named: a ban or unban after that final read may still
interleave with Discord and is corrected by the next sweep.

**Database / config.** None. **Rollout.** With .51-.62. **Rollback.** Redeploy .62.

**Tests.** `tests/role_sweep_test.cjs` 49 (+4): a banned account with a `left` character still holding the role is
stripped and audited, never granted; an unban written during the member GET is seen by the re-read, the role stays and
no revoke row names the account. Pins .63.

## Worker .64 — the directory's five grouped CHANGES repaired (Codex's independent review on .59, 1 Oct 02:21 UTC) (1 Oct 2026)

**What changed** (`src/community-directory.ts`, `src/community-routes.ts`, a comment in `src/community-context.ts`):
1. **Capacity truth (HL-1).** A save that would list a profile when the directory is full now saves everything else and
   leaves the profile unlisted: `listed` is decided inside the statement (`CASE … WHEN room THEN 1 ELSE 0`), the
   statement is admitted by the fence and the revision alone, and the answer is 409 `directory_full` with `saved: true`
   and the saved profile. Until .63 the whole write was refused while the message claimed "saved unlisted". The audit
   row carries the requested fields and the listed state the statement produced.
2. **The staff fence.** `adminAltDecision` runs through `admitted`: its first statement requires the admin's live
   `site_users` row, session version and cookie expiry (`fenceSql("applicantWrite")`, no guild proof by design) and the
   later rows the nonce, so an admin who logged out, left the server, was denied or was erased during the request, or
   was already denied, commits nothing; a refusal is answered from fresh facts (`not_member`, `denied`, `signed_out`,
   else `conflict`). **Contract decided and documented:** community staff writes share the member writes' current-page
   contract (`X-Olympus` must be the current `PAGE_VERSION`; an older page is 409 `reload`). `handleCommunityAdmin`
   reads the context once for every staff write.
3. **Payload eligibility.** The listing's scan and its four hydration statements are one batch (one transaction): the
   page is selected in SQL from the same scan and every payload statement repeats `VISIBLE_OWNER`. The crafting search
   likewise runs its owner scan and its offers in one batch, and the offers statement judges the owner's eligibility
   itself. A denial, ban, departure or unlisting between the scan and the payload cannot expose a row, and counts and
   cursors describe one instant.
4. **The crafting cursor (D20).** Version 2 carries the digest of the visible order: display name, ref and profile
   revision (bumped by every save of a member's offers) of every qualifying owner with a matching offer. A rename, an
   edit, a departure or an unlisting between pages is 409 `cursor_stale`; a .57 cursor is `cursor_stale`; a cursor from
   another query or a malformed one is 400 `invalid_cursor`.
5. **Name and proof truth at write time.** The facts `resolveCharacter` read for each label are re-stated inside the
   first statement: for a self label, no `characters` row under its proof key; for a keeper-proven label, the exact
   row bound to this account with that full name and GUID, and no other account on that GUID. A label whose binding
   changed between the resolution and the write is refused: `name_conflict` when it now collides (audited as a count),
   else 409 `conflict` telling the page to reload; nothing is saved as stale proof.
Also: `CommunitySubject.expiresAt`'s comment now says what .59 does (bound into the fence, judged by the database clock).

**Database / config.** None. **Rollout.** With .51-.63. **Rollback.** Redeploy .63. C02 paths unchanged.

**Tests.** `tests/community_directory_test.cjs` 84 (+17): the full directory saving the rest unlisted (create and
update), its audit row, listing once there is room; the .57 cursor, a wrong digest, a display-name change between pages
and a good continuation; a denied owner absent from the search and the listing; staff writes from an old page, by an
admin who left the server, by a denied admin, and by one in good standing; a self label whose key another account took
between resolution and write, a keeper-proven main transferred in that window, and the unchanged case admitted. Pins .64.

## Worker .65 — the policies served by the Worker (W03; Codex's countersigned delivery candidate integrated) and the Gitleaks allowlist narrowed (1 Oct 2026)

**What changed.**
1. **`/privacy` and `/terms`** (and `/privacy-policy`, `/privacy.html`, `/tos`, `/terms-of-service`, `/terms.html`) are
   public GET/HEAD 200 HTML on the site host and the bot host, answered in `src/index.ts` right after the host check and
   before the schema check: no database, no session, no cookie, no Location; a strict self-only CSP with scripts
   disabled; other methods 405 with `Allow: GET, HEAD`; plain http on the site host upgraded first; a legacy host keeps
   its 301 to the site; an unknown host still gets nothing. `/static/policies.css` is the one static file the bot host
   serves (GET/HEAD). Until .64 these paths were 302s to the GitHub Pages mirror. This integrates Codex's isolated
   delivery candidate (`candidates/keeper-policy-serving`, manifest `5519466c…`, author against .58, root COUNTERSIGN
   02:31 UTC for delivery/layout only) on the .64 head: `src/policies.ts` and `public/static/policies.css` are the
   candidate's bytes in substance (the handler verbatim, the header rewritten for this repository), the route insertion
   adapted to the current `index.ts`, and the two contract tests updated as the candidate did.
2. **The text is generated, never hand-copied.** `scripts/build-policy-content.mjs` builds `src/policy-content.ts` from
   the tracked `policies/privacy.html` and `policies/terms.html`: the main text unchanged, the shell the Worker's (the
   inline style replaced by the stylesheet, a skip link, a header with both policies' navigation, site-relative "See
   also" links). `npm run check:policies` (in `npm test`, so in `test:all` and CI) fails when the committed file is
   stale, so the Worker's copy and the Pages mirror cannot drift. The generated constants are byte-identical to the
   candidate's `policy-content.ts` constants (the candidate was generated from the same .58 blobs; `policies/` has not
   changed since).
3. **The wording is the tracked text and NOT yet the consolidated truth.** It still names the earlier guild host and
   says nothing of the community modules (directory, crafting, events, attendance, trials), their fields, retention,
   erasure and export, the optional Battle.net copy's current shape, the nickname flag or the site's own assets. That
   all-module review, regenerating `policy-content.ts` with the tracked HTML in the same commit, is a separate gate
   before the live policy smoke and the Discord portal link readback (Codex 02:31: "do not claim old baseline text as
   final merely from this signature").
4. **Gitleaks** (`.gitleaks.toml`): the broad `(test|vector|example|fixture)` substring allowlist on `generic-api-key`
   for the test folders is gone. Gitleaks 8.30.1 with default rules over the whole tree flags nothing in the suites, so
   they need no allowance; the one placeholder it flags, `PASTE_TOKEN_HERE` in the walkthrough's curl lines, is allowed
   by exact text in that one file. The CI history scan (`scripts/scan-secrets.sh`, `--log-opts='--all'`) was run
   locally with the new configuration: clean.

**Database.** None. **Config.** Nothing new. **Rollout.** With .51-.64; the Discord Developer Portal's policy links may
move to the Worker's addresses after the content gate (owner-gated, with the hostname move W01/W02). **Rollback.**
Redeploy .64 (the paths redirect to the Pages mirror again).

**Tests.** `hosts_test.cjs` 86 (+17: every alias on both hosts with the database trapped, HEAD, CSP, 405, the http upgrade,
the legacy 301, the unknown 404, the stylesheet on the bot host and its 405, the generator's `--check`, the tracked text
verbatim in the served page); `bundle_runtime_test.cjs` +2 (the real bundle serves the policy and its stylesheet on the
bot host in workerd); `site_test.cjs` and `hardening_test.cjs` contract checks changed from the 302 to the 200. Pins .65.

## Worker .66 — trials: lifetime by database time, the staff capability on every community staff route, the reader admission boundary; an explicit refusal of an unsupported key version (1 Oct 2026)

**Why.** Codex's independent review of .61 (02:50 UTC, `evidence/attachments/trial-review/commit-ccff9f61/review.md`):
(P1) the staff list GET checked only the flag, so a SITE_ADMIN who had left the server or been denied read the full
staff projection although their `communityStaff` was false; (grouped) `retain_until` was a cron selection time only: an
expired open trial stayed in the own view, the staff list, the export and the due count, and an extension after the
deadline moved it into the future. Codex's 02:41 decision: refuse a supplied `keyVersion` truthfully.

**What changed.**
1. **`communityStaff` on every `/api/admin/community/*` route**, reads included (`community-routes.ts`): the context is
   read once and a denied or departed admin gets the fence's own refusal (`not_member`, `denied`, `signed_out`), scoped
   to community routes; the older admin routes and the bot's officer authority are unchanged.
2. **The reader admission boundary** (`community-context.ts admittedRead`): a read's payload statements run in one batch
   behind a probe that re-states the reader's live row, session version, cookie expiry (database clock) and standing;
   a failed probe discards the payload and answers from fresh facts. Applied to the trials' own view and staff list here
   (the calendar follows in .67).
3. **`retain_until` is the effective cutoff** (decided per Codex's 02:50): judged by the database clock inside every
   statement, an expired row is absent from the own view, the staff list, the account copy, the due count and every
   replay/conflict payload; an extension or conclusion after the deadline is refused inside the first write and answered
   409 `trial_expired` without the row; an expired open trial does not block a new one, because one-open-trial-per-member
   is now a predicate inside the insert (`NOT EXISTS … live open`) and the .61 partial unique index is dropped
   (`DROP INDEX IF EXISTS community_trials_open`, schema.sql, schema.ts, `migrations/2026-10-01-community-trials-open.sql`;
   D1 serializes writes, so the predicate is race-safe). `sweepCommunityTrials` stays the bounded physical purge, runs
   whatever the flag says, and reports `{deleted, remaining}` in its audit row. The paired donor was cron-only too.
4. **`unsupported_protocol`** (`index.ts`): on `/queue`, `/queue/unverified`, `/queue/written` and `/ingest/*`, a
   `keyVersion` in the query or the POST body is answered 400 `unsupported_protocol`; unversioned clients are served as
   before. The generation-3 proposal stays unshipped; nothing here implements or negotiates it.

**Database.** The dropped index. **Config.** None. **Rollout.** With .51-.65. **Rollback.** Redeploy .65 (its schema
step recreates the partial index; an expired open trial would then block again until purged).

**Tests.** `community_trials_test.cjs` 54 (+11): the staff list refused to a departed and to a denied admin; an expired
open trial absent from the own view, the staff list, the due count and the export; extension and conclusion after the
deadline refused without payload and without change; a new trial admitted beside an expired open one while a live one
still blocks; the purge's count and backlog. `community_directory_test.cjs` +1 (the staff directory read refused to a
departed admin). `hardening_test.cjs` +3 (`keyVersion` in the query, in a body, and an unversioned client served).
Pins .66.

## Worker .67 — the calendar's four grouped CHANGES repaired and its two contract decisions taken (Codex's independent review on .59, 1 Oct 02:50 UTC) (1 Oct 2026)

**What changed** (`src/community-events.ts`):
1. **The attendance result's payload** is read inside the write's batch (one instant) and requalifies every target. A
   member who no longer qualifies has no row in it, so an `invalid` or `stale_revision` result for them carries
   `entry: null`, a valid write for them is not committed (`unknown_member`), and a committed row whose member cannot be
   shown is `ok` with `entry: null` and `withheld: "target_unqualified"`. The request's own RETURNING rows, their
   `revision = input + 1` and the `superseded` pairing are unchanged.
2. **The reader admission boundary** (`admittedRead`, .66) on every read: the list, the detail, the organizer's
   attendance list, the member's own history, and the hydration after a write (`readEvent`). A viewer denied, signed
   out, banned, departed or expired between the context read and the payload gets a fresh refusal; after a write that
   succeeded, `event` is null with `hydration: "refused"` (or `"too_large"`) rather than a payload read without admission.
3. **The list cursor** (version 2) carries the digest of the whole visible window's order (start, id), computed in the
   same batch as the page, so an event moved across a page boundary makes the old cursor 409 `cursor_stale`; a .59
   cursor is `cursor_stale`; a malformed one `invalid_cursor`.
4. **The read bound on the list**: the window itself and the qualifying answers behind the page's counts are counted up
   to the configured bound in the same batch, and 503 `events_too_large` refuses past it, exactly as the detail does; no
   partial total is shown. The post-write hydration applies the same bound.
**Decisions taken (as Codex asked, 02:50):** everything that closes when an event starts (RSVP, update, cancel) or opens
then (recording attendance) is judged by the DATABASE clock inside the first statement, and the refusal texts
(`event_started`, `event_not_started`) come from the same clock, so a request held across the start is refused. An
event's response is one snapshot: the organizer's name, the counts and the viewer's own rows are read in one batch at
one instant; the name is the creator's as they qualified at that instant and is never claimed fresher than the rest.

**Database / config.** None. **Rollout.** With .51-.66. **Rollback.** Redeploy .66. C02 paths unchanged.

Note on CS-5: because the result is now read in the write's own transaction, an overwrite that lands after the write
is not in the response (it shows on the next read); the `superseded` marker is kept in the DTO for a row that is this
request's own but could not be re-read, and the own-row `revision = input + 1` pairing is unchanged.

**Tests.** `community_events_test.cjs` 77 (+10): a .59 list cursor stale, a v2 cursor continuing with the window's digest,
a wrong digest stale; the list and the detail refusing `events_too_large` under a bound of two with three answers; an
answer and an edit after the start judged by the database clock while the suite's own clock is frozen before it; a
target denied before the batch: the invalid entry without name, answer or old attendance, the valid write not committed
and reported `unknown_member`, the other target recorded. The suite's fixtures now start in the real future and move a
stored start into the real past where "after the start" is needed. Pins .67.

## Worker .68 and watcher 0.6.6 — Codex's scoped CHANGES on .62 (relay presence and the watcher's transport), 1 Oct 03:07 UTC (1 Oct 2026)

**Relays (`src/relays.ts`).** (1) `relayStatus.known` kept a global "No officer is online right now" when one relay had
stated offline while another was currently saying "cannot tell"; now any relay unknown within `RELAY_FRESH` keeps the
answer uncertain unless some relay is positively online (the positively-online mixed case is unchanged, and once the
unknown report is stale too the stated relays decide again). (2) `recordRelay` captured its time, awaited the row, then
wrote: a heartbeat due to write that resumed after a strictly newer poll regressed `seen_at`, cleared or reintroduced
`unknown_since`, or restored a stale addon from the pre-await copy. Both upserts now carry `WHERE <this report's time>
>= relays.seen_at` and take the addon fallback from the current row (`COALESCE(?, relays.addon)`), and an older report
answers `unchanged`. Same-second ambiguity stays bounded separately. The `keyVersion` refusal (the third group) is .66.

**Watcher 0.6.6 (`watcher/watcher.py`).** (1) A 2xx without a JSON object is `invalid_response`, so `post()` buffers the
event instead of dropping it as delivered (an empty 2xx was `(True, None)`); the deliberate understood-4xx final
rejection is unchanged. (2) A non-finite `Retry-After` (`inf`, `nan`, `1e400`) is invalid and counts as absent instead
of a 100-year pause; long finite deadlines stand. (3) Logs at both boundaries carry controlled summaries only: a
transport failure logs the exception's class, never its text (which could carry status-line or body bytes), and a
delivered post logs `delivered` plus a known result word or a count, never a response field. (4) The bearer goes only
to the configured origin: a request path that is not local and absolute is refused before any header is attached.

**Database / config.** None. **Rollout.** Worker with .51-.67; watcher 0.6.6 is a file copy on the officer's PC.
**Rollback.** Redeploy .67; copy 0.6.5 back.

**Tests.** `tickets_guid_relays_test.cjs` 58 (+4: stated-offline beside unknown, positively online beside unknown, the
unknown report going stale, an older report resuming after a newer one). Watcher `test_watcher.py` 61 (+4: empty and
non-object 2xx as `invalid_response` and buffered, a JSON object accepted; non-finite `Retry-After` invalid and a long
finite one kept; non-local paths refused before transport; summaries only in the log at both boundaries). Pins .68.

## Worker .69 — restriction cases, their watch-list and the return review (consolidation batch 4b, first half; Codex's 02:41 contract) (1 Oct 2026)

**What changed.** Olympus Forever's `src/restrictions.ts` and `src/return-review.ts` ported as `src/community-restrictions.ts`,
behind `restrictions` in `COMMUNITY_FEATURES` (off; the flag list gains the name). **Staff records and review evidence
only:** nothing here sanctions, recognizes, grants, holds or revokes anything (roles.ts stays the one role writer; the
bot's `/olympus-admin ban` stays the one manual moderation action); the donor's role jobs, eligibility effects, holds and
tithe coupling are not ported.
1. **Cases** (`GET /api/admin/community/restrictions[?discordId=]`, `POST /api/admin/community/restrictions`): about a
   Discord id (a record may precede or outlive the member's sign-in); categories ban (no expiry, a review date at most
   365 days ahead), conduct_removal and tithe_removal (an expiry at most 730 days ahead); create by operation id (replay,
   `case_conflict`, never one's own); review `continued` (new date) or `lifted` (resolves; kept 30 days); appeals
   none → requested → upheld or overturned (resolves); `acknowledge` records that an officer reviewed the member's
   RETURN, named by the exact token "account as created . last sign-in" from `site_users`, both after the case was set;
   the opaque `incarnation.revision` token is compared inside the statement; `own_record`, `stale`, `case_resolved`,
   `not_applicable`; every write is the admin's fenced batch, every read runs behind `admittedRead`, `communityStaff` is
   required by the router, and the current-page header applies.
2. **The watch-list** (`add_characters`, `renew_characters {reason}`, `remove_character {key}`): the case member's own
   characters copied from the keeper's `characters` with exact provenance (proof key, full name, GUID as pinned), at most
   25 per case, review at most 90 days after the addition or the last renewal. **Retention period, the keeper's form of
   PRIV-4: one period per MEMBER** (`community_restriction_periods`), opened by the member's first addition on any case,
   12 months, renewed only by `renew_characters` with a fixed reason; every row expires at the period's deadline capped
   at its case's expiry; removing and re-adding a key, a sibling case, a replay or an erasure never restarts it; once
   ended, additions are `renewal_required`; the period lives while any unresolved case of the member exists and goes with
   the last one (lift, overturn or purge), so a case opened later with no other in play opens a fresh period. Stated in
   the module header for Codex's acceptance (it gives the donor's sibling-lifetime rules without its hand-over machinery).
3. **The return review** (`GET /api/admin/community/return-review`): the SAME account signed in after an active case was
   set (`restriction`), and ANOTHER account holding a watched character in the keeper's `characters` (by the pinned GUID
   or by the proof key) that signed in after the addition (`watched_character`, with `by: "guid" | "name"`); the case
   member is excluded; bounded (500) with `truncated` and `watchList: complete | partial`; the explanation says it is
   evidence only.
4. **Erasure, minimization, copy, purge:** a member's erasure clears their acknowledgement and the rows of their INACTIVE
   cases; an ACTIVE case, its rows and the member's period survive (the one case-bound exception, like the bot's ban
   reason; **the privacy text must say so**, content gate .65 item 3); a staff member's erasure anonymizes them
   everywhere (`set_by = 'erased'`, others NULL). The account copy lists the member's cases (dates and outcomes, no
   staff), their watch-list rows and the period. `sweepCommunityRestrictions` (cron, whatever the flag says): expired
   or orphaned rows, cases past `retain_until`, periods without an unresolved case; audited as counts.

**Database.** `community_restriction_cases`, `community_restriction_characters`, `community_restriction_periods`
(schema.sql, schema.ts, `migrations/2026-10-01-community-restrictions.sql`); additive. **Config.** `restrictions` in
`COMMUNITY_FEATURES`. **Rollout.** With .51-.68; nothing visible until the flag is on. C02 exact paths to add:
`POST /api/admin/community/restrictions`. **Rollback.** Redeploy .68; the empty tables stay.

**Tests.** New `tests/community_restrictions_test.cjs` (54): the flag and both gates; create with validation, replay,
`case_conflict`, never one's own, a ban's shape; the staff list by review date and per member; review continued and the
stale token; the return token before and after a sign-in, a wrong token, the exact one; appeals through to overturned
and `case_resolved`; `own_record`; the watch-list with exact provenance, the period opened once, remove and re-add at
the same deadline, a sibling case at the member's deadline, a renewal with its reason, `invalid_reason`, an ended period
refusing additions on any case, the renewal that reopens it, a lift deleting rows but keeping the period for the
sibling; the return review (same-account sign-in, a GUID-bound holder, the member excluded, a holder who did not sign
in); the account copy; staff and member erasure; the purge of resolved cases, the period leaving with the last case, a
later case's fresh period, and the flag-off purge of expired rows. Nothing touched a role. Pins .69.

## Worker .70 — departure review items (consolidation batch 4b, second half; Codex's 02:41 contract) (1 Oct 2026)

**What changed.** Olympus Forever's `src/departures.ts` ported as `src/community-departures.ts`, behind `departures` in
`COMMUNITY_FEATURES` (off). **A departure creates a bounded staff review item only**: nothing here kicks, bans, denies,
opens a case or touches a role by itself; the keeper's roster diff and the bot's actions are untouched.
1. **Intake** (cron, while the flag is on): the keeper's own confirmed departures (`characters.status = 'left'` with
   `left_at`) of the last 30 days, at least five minutes old, for accounts that have signed in here; one item per
   (account, character, departure), repeats create nothing; the kind (`left` | `removed` | `unknown`) comes from the
   keeper's own `roster.left` audit row for that character around that time, never from a guess. The donor read a
   separate Olympus Verify database; here the keeper IS that database, so no cross-database read exists.
2. **Staff** (`GET /api/admin/community/departures[?status&cursor]`, `POST /api/admin/community/departures/update`):
   open items first, oldest departure first (keyset cursor bound to the filter); `acknowledge`, or `open_restriction
   {category}` which records a restriction case in the SAME batch (`community-restrictions.ts restrictionCaseStatements`,
   admitted by this write's nonce) with the staff page's default dates (conduct 180/365 days, tithe 90/180, ban 365/none),
   503 `restrictions_disabled` while that flag is off; never one's own item; `stale_revision`, `departure_reviewed`,
   `not_found`; the admin's fence inside the first statement; reads behind `admittedRead`; `communityStaff` required.
3. **Lifetime** (.66's rule): `retain_until` = 30 days after the departure is the effective cutoff by database time for
   every read and write; `sweepCommunityDepartures` (cron, whatever the flag says) is the bounded physical purge and
   reports its backlog.
4. **Erasure, copy:** the member's items go; a staff member is anonymized as reviewer; the account copy lists the
   member's live items (character, kind, dates, status), never who reviewed them or the case opened.

**Database.** `community_departure_reviews` (schema.sql, schema.ts, `migrations/2026-10-01-community-departures.sql`);
additive. **Config.** `departures` in `COMMUNITY_FEATURES`. **Rollout.** With .51-.69; nothing visible until the flag is
on. C02 exact paths to add: `POST /api/admin/community/departures/update`. **Rollback.** Redeploy .69; the empty table stays.

**Tests.** New `tests/community_departures_test.cjs` (31): the flag and gates; the intake (window, settling, signed-in
accounts only, the kind from the keeper's audit row, no repeats, the settled one taken later, audited as a count, no
role or case touched); the list order, filter and cursor; `own_record`, `stale_revision`, `invalid_request`,
acknowledge audited with the kind, `departure_reviewed`; `restrictions_disabled`, `invalid_category`, a case opened in
the same batch with the default dates and seen by the restrictions module; the fence (a departed admin writes and reads
nothing); the lifetime cutoff; the account copy; staff and member erasure; the flag-off purge with its backlog. Pins .70.

## Worker .71 — the member's own copy and the erasure/export integration check (consolidation batch 7) (1 Oct 2026)

**What changed.**
1. **`GET /api/me/export`** (`src/site-export.ts`): the signed-in account's copy of everything this Worker holds about it,
   as a JSON attachment: the site account (names, sign-ins, standing, a dated denial), the application (the member's
   view), votes and friends by the labels chosen, board votes by role and vote, reserved names; the bot's view (banned
   from verifying or not, whether a Battle.net link is current, the bound characters, the code requests without any code,
   the dated actions naming the account as fixed action names); and every community feature's section through the
   `registerCommunityData` registry. **Minimization:** no other member's Discord id and no staff id ever appears (the
   organizer, the sponsor, the admin, the nominee, the candidate, the friend are shown as labels or not at all); no
   staff-written text (ban reason, review notes). The keeper's statements run in one batch behind `admittedRead` with the
   new capability `authenticatedIdentity` (the live row and the session alone), so a denied or departed member still
   gets their copy; five copies an hour per account; each audited as `site.copy_exported` with no details.
2. **The staff erase integration**: `deleteSiteData` now also anonymizes the erased account as a staff actor on the site's
   own tables (the application's reviewer, a reservation's approver and releaser, settings' editor, a denial's admin),
   as the community registry already did for its tables; the audit log keeps actor ids (the dated log the privacy text
   names).
3. **The integration check** (`tests/account_copy_test.cjs`): a member with data in every site and community feature is
   erased through the real `deleteSiteData`, then EVERY table and column of the real schema is scanned for their id; only
   the documented residue may remain: the bot's own verification rows (`members`, `characters`, `pending`: the bot's
   data, erased by the officers' own actions, not by the site), the dated log (`audit.subject`), and an active
   restriction case with its period (.69's case-bound exception). The same scan for an erased staff member finds them
   only in the log and the bot's rows. A new table or column that holds a member's id without an eraser fails this test.

**Database / config.** None. **Rollout.** With .51-.70. **Rollback.** Redeploy .70. C02: `GET /api/me/export` is a read.

**Tests.** New `tests/account_copy_test.cjs` (25): the fixtures through the real routes; the attachment and its
headers; every section's content; the minimization assertions over the whole JSON; the audit row; the rate limit; a
denied member's copy; 401 without a session; the whole-schema scan after the member's erasure and after a staff
member's. Pins .71.

## Worker .72 — uniform reader admission on every payload of the trials and the directory (Codex's final .66 reader CHANGES, 1 Oct 03:55 UTC) (1 Oct 2026)

**What changed.** Codex's final independent reviews of .66 (trials: 33 of 133 cases; directory: 20 of 50) found payloads
still read outside the reader's admission: a write route's pre-write read, its replay and lost-compare-and-set fallbacks,
the read-back after a committed write, and the four directory GETs. Now:
1. **Trials** (`src/community-trials.ts`): the row a create or an update changed is read as the LAST statement of the
   write's own batch (the row carrying the write's nonce: the same transaction and instant as the fence, the accepted
   atomic snapshot), so a committed write is acknowledged with what it wrote and is never undone; the pre-write read,
   the explanation of a refused create (the operation's trial, the member's live open trial, the account's sign-in: one
   admitted batch) and the fallback after a refused update run behind `admittedRead`, so a staff member denied, departed,
   signed out, erased or expired between the context read and that payload is refused and receives no trial.
2. **Directory** (`src/community-directory.ts`): the own profile, the listing, the crafting search and the staff review
   run behind `admittedRead` (guild data for members; the staff fence, no guild proof, for staff; `adminDirectory` now
   takes the request and the context); a save's pre-write state and the fallback that explains a refusal are admitted
   reads; the saved profile a successful save answers is read as the last five statements of the write's own batch.
3. No route, status code or body shape changed for an admitted reader; the only new answers are the refusals (401
   signed_out, 403 denied / not_member / guild_unconfirmed) where a payload used to be read without admission.

**Database / config.** None. **Rollout.** With .51-.71. **Rollback.** Redeploy .71. C02: no write path added or removed.

**Tests.** `tests/community_trials_test.cjs` (+11) and `tests/community_directory_test.cjs` (+14): the D1 shim gains
`beforeBatch`/`afterBatch` hooks so a test changes the facts between the context read and a payload batch, or right after
a batch committed: EARLY (the pre-write read refused), LOST CAS (the fallback read refused), REPLAY (the explanation
refused), AFTER SUCCESS (the committed write answered from its own batch; the next read refused), and each GET refused
on denial, departure, sign-out everywhere, roster proof lost and row removal before its payload batch; a final check
that every armed hook fired at the batch it named. Pins .72.

## Worker .73 — batch 4b repairs on Codex's 04:04 decisions: restrictions (facts at the first statement, the effective cutoff, the selected erasure contract, a cursor) and departures (requalified intake, same-account kind, no starvation), uniform reader admission in both (1 Oct 2026)

**What changed.** Codex's selected batch-4b contract and preliminary findings on .69/.70 (1 Oct 04:04 UTC), applied without
waiting for the frozen reports (the groups are explicit):
1. **Restrictions** (`src/community-restrictions.ts`):
   - `retain_until` is the EFFECTIVE availability cutoff by the database clock (`LIVE_CASE`: a finite case = its expiry
     while unresolved; resolved = 30 days after; a ban = none until resolved) inside every read and every first statement:
     a past-deadline case is gone from the staff list, the member view, the account copy, replay and conflict payloads,
     and takes no change (404 `case_not_found`), so no lift or overturn can restart a 30-day clock after the deadline; the
     export lists live cases and live watch rows only.
   - Every payload under the reader's admission: the list reads the cases and their watch rows in ONE admitted batch (a
     subquery repeats the page's selection); the pre-action read, every conflict payload, the replay and the fallback
     after a refusal are admitted reads; the case a write changed is read inside the write's own batch (its nonce, the
     same transaction as the fence). The `communityContext` re-read is gone.
   - `add_characters` binds the exact keeper facts at its FIRST statement: every pinned character still bound in
     `characters` to this member under this proof key, full name and GUID (json_each over the pinned set); a binding
     that changed between the read and the write is 409 `binding_changed`, nothing written. The member's period is pinned
     as still OPEN by the database clock (equality alone admitted an already-ended period), and whether a period is open
     is read with the case in SQL (`period_open`) and used by every view; the row insert requires its deadline ahead.
   - **Erasure, the honest correction:** .69's header promised only inactive WATCH-row deletion and the 03:46 log entry
     overstated it as inactive CASE deletion. .73 implements Codex's selected contract: a member's erasure deletes their
     INACTIVE cases (resolved, overturned or past expiry) with their rows, clears their acknowledgement, keeps an ACTIVE
     case with its rows (the one case-bound exception) and the shared period only while an unresolved case remains;
     staff identifiers anonymized as before. Header, checklist and tests say the same thing.
   - `GET /api/admin/community/restrictions[?discordId=][&cursor=]` continues by keyset cursor beyond its page of 200
     (`nextCursor`; `truncated` now means "more pages"); the orphan-period cleanup honors the run's limit.
2. **Departures** (`src/community-departures.ts`): the intake requalifies inside its INSERT (the account's live row, the
   exact `characters` row still `left` at that `left_at` under that name and key, `retain_until` ahead of the database
   clock), so an erasure before the insert cannot resurrect the account and a held candidate past 30 days inserts
   nothing; from then on the item is the historical event-time fact (a rejoin or rebind does not touch it). The kind
   comes only from a `roster.left` row whose `details.discordId` is the same account. The candidate scan pages by keyset
   within one bounded run (`intakePages` 10 × 500), so permanently invalid names cannot starve later valid departures.
   The pre-decision read and the refusal fallback are admitted reads; the decided item is read inside the write's batch.
3. No route changed shape except the list's added `nextCursor`; new answers: 404 for a past-deadline case, 409
   `binding_changed`, and the refusals where a payload used to be read without admission.

**Database / config.** None. **Rollout.** With .51-.72. **Rollback.** Redeploy .72. C02: no write path added or removed.

**Tests.** `tests/community_restrictions_test.cjs` (54→79) and `tests/community_departures_test.cjs` (31→41), with the
.72 D1-shim hooks (`beforeBatch`/`afterBatch`, plus `beforeRun` for the intake's statements): the transferred and the
re-GUID'd pinned character refused at the first statement; the period ended by the database clock (open by the
process's) and the period ending between the read and the write; the expired finite case gone from both lists, 404 on a
lift and an appeal, no replay, omitted from the copy; the cursor's continuation, scope and garbage; the bounded period
cleanup; the erasure contract (inactive case gone, active case and period kept, another member's untouched); EARLY,
LOST CAS, AFTER SUCCESS, REPLAY, list and return review refusals. Departures: the erased-before-insert, the held
candidate, the namesake's row, the invalid candidate with a page of one, the rejoin; EARLY, LOST CAS, AFTER SUCCESS.
Pins .73.

## Worker .74 — the account copy as ONE admitted transaction (Codex's review of .71, 1 Oct 04:24 UTC) (1 Oct 2026)

**What changed.** Codex's independent review of .71 showed the registry exporters running after the admitted keeper batch
with their own statements: a session invalidated, an actual erasure or the database cookie deadline between the batch and
a registry read still returned 200 with a newly queried case. Now:
1. **Exporters are plans** (`community-context.ts`): `registerCommunityData` takes an exporter that returns its section's
   statements and the shaper that reads exactly their results; `communityExportPlan(env, id)` concatenates every
   section's statements in order and shapes them by feature name. Every module's exporter (refs, directory, events,
   trials, restrictions, departures) is converted; none runs a query of its own any more. `communityExport` remains as a
   plain-batch helper for the test suites.
2. **One batch** (`site-export.ts`): `GET /api/me/export` runs the keeper's ten statements AND every community section's
   statements in the same `admittedRead` batch (authenticatedIdentity): one transaction, one instant. A loss of standing
   before it refuses the whole copy; after it nothing is queried again, so the body is never a partial "everything".
3. **Codex's complementary .71 review (04:36 UTC), the four selected completeness points and the one required key:**
   the copy carries no STRUCTURAL reference to another Discord account (a vote's nominee and a friend are the label the
   member chose; the `kind` that said "a Discord account" is gone; the member's own free text is preserved); it includes
   the member's own invite-queue state (`verification.inviteQueue`: character, status, attempts, dates, the fixed refusal
   reason; never the officer, the watcher's claim or the note); the dated actions are those naming the account as subject
   OR actor, the earliest 1000 from the point asked for, with `actions.nextCursor` and `GET /api/me/export?actions=<cursor>`
   continuing them in bounded pages (a continuation is a copy for the five-an-hour limit; a malformed cursor is 400 and
   counts as none); and the `about` text says how the copy was captured ("read together at generatedAt") instead of
   promising more. The trials header's "vanishes between a write and its read-back" sentence is clarified (the read-back
   is inside the write's transaction since .72).
4. Body shape: `nominee.kind` and `friends[].kind` are gone; `verification.inviteQueue` and `actions.nextCursor` are new;
   the rest is identical to .71's for an admitted reader.

**Database / config.** None. **Rollout.** With .51-.73. **Rollback.** Redeploy .73. C02: no write path added or removed.

**Tests.** `tests/account_copy_test.cjs` (25→34) with the batch hooks: a copy is read in exactly one batch with every
registry section present; the session invalidated between the context read and the batch is 401 with no section; the
session invalidated right after the batch answers the whole copy read in that transaction with no later query; no `kind`
on nominees or friends; the queue state without the officer, the claim or the note; 1005 actions as subject or actor
paged at 1000 with a working continuation and a 400 for a malformed cursor; the capture wording; the erasure scan's
documented residue now names the invite queue row among the bot's own verification rows, and `deleteSiteData` anonymizes an erased staff member as the queue row's approver and claimant. Pins .74.

## Worker .75 — the contribution (tithe) ledger (consolidation batch 5; `contributions` flag off, mode off) (1 Oct 2026)

**What changed.** Olympus Forever's contribution ledger, ported onto the keeper's door on the adapter map's conditions:
1. **The pure policy** (`src/community-contribution-policy.ts`, the donor's policy.ts in SECONDS): weekly periods anchored
   at a UTC weekday and hour, the new-member exemption (`firstEligiblePeriod`), `allocate` (deltas from one consistent
   snapshot, oldest payable week first, reversals release credit) and `evaluate` (the stages not_due, due,
   notice_available, acknowledged, final_notice, officer_review; exempt, paid, unknown, needs_review, resolved). Integer
   copper; `MAX_COPPER_AMOUNT` (2^31 - 1) is the input ceiling for a new amount, `MAX_COPPER_TOTAL`
   (Number.MAX_SAFE_INTEGER) the bound every sum is checked against (never rounded, never a D1 "integer overflow": the
   magnitude/gated-sum statements).
2. **The ledger** (`src/community-contributions.ts`): eight tables prefixed `community_contribution_*` (policies,
   members, obligations, receipts, allocation_events, horizons, evidence, decisions); a member row's random incarnation
   and revision compared inside every snapshot-based write; a per-write nonce admitting every later statement; the
   keeper's fence (`fenceSql applicantWrite`) at the first statement of every member or staff write; every read a route
   makes behind the acting session's admission (`readAs`, the same probe as `admittedRead`, in the payload's own batch);
   lifetimes by the database clock. Writes only with `CONTRIBUTIONS_MODE = "ledger"` AND a finite
   `CONTRIBUTIONS_RETENTION_DAYS` (1..3650): every personal record carries `retain_until` fixed from the retention in
   force when written. Receipts are idempotent on (scope, source, source id); a receipt's status and match never change in
   place (void, then a new receipt). The bounded purge (11 statements, one batch) retires allocated copper into receipts
   before a week goes, advances admission horizons so purged weeks and observations cannot be recorded again, and runs
   whatever the flag or the mode says. Erasure (all scopes) deletes the member's obligations, matched receipts, journal
   rows, decisions and member row and removes their id as observer and actor; the export (a .74 plan) lists their weeks
   and receipts, never who observed or recorded, payer names or source ids. The mail reference (`TITHE-XXXX-XXXX`, an HMAC
   under VERIFY_SECRET, label tithe-ref-v1) is a lookup aid, never payment proof. `recordRemoval` records that an officer
   resolved a week after an in-game removal and may LINK an existing restriction case; it never opens one (the map's
   rule: a restriction from a ledger decision is a separately reviewed keeper manual action). The weekly opener
   (`openWeeklyObligations`, cron while the flag is on and the ledger writable) records this week's obligation for every
   roster-confirmed account that has signed in (the keeper rule), eligible once the exemption counted from the keeper's own
   `member_since` has passed; bounded per run; a record only.
3. **The routes** (`src/community-contributions-api.ts`, `community-routes.ts`): `GET /api/community/contributions/me`
   (the own ledger without payer names, source ids or who recorded; the policy; the mail reference and the officer to
   mail), `POST /api/community/contributions/acknowledge`; `GET /api/admin/community/contributions?discordId=` and
   `POST /api/admin/community/contributions` {action: obligation | receipt | allocate | void | reverse | state | contact |
   evidence | removal}, never about the acting admin's own account (own_record, owner included), each audited
   `community.contribution_<action>` with the fixed result. A write's answer carries the ledger as a NEW admitted read; a
   reader who lost standing meanwhile gets `ledger: null, withheld` and the write stands. No donor approval or Battle.net
   prerequisite anywhere. Nothing here notifies anyone or changes a role.
4. **Config** (`env.ts`, `wrangler.toml`): `CONTRIBUTIONS_MODE = "off"`, `CONTRIBUTIONS_RETENTION_DAYS = ""`,
   `CONTRIBUTIONS_SCOPE = "olympus"`; the flag `contributions` stays out of `COMMUNITY_FEATURES`. `admittedReadAs` in
   community-context.ts (the probe for a module holding the acting session).

**Database.** Eight new tables (`schema.sql`, `src/schema.ts`, `migrations/2026-10-01-community-contributions.sql`),
additive. **Rollout.** With .51-.74; the ledger stays off (flag and mode) until the privacy text covers it and the
officers choose a retention. **Rollback.** Redeploy .74 (the empty tables are harmless). C02: write paths added, all
behind the flag AND the mode: `POST /api/community/contributions/acknowledge`, `POST /api/admin/community/contributions`.

**Tests.** New `tests/community_contributions_test.cjs` (76): the pure policy (period anchors, the exemption, allocate,
evaluate, the ceilings); the gates (flag, mode, retention, the page header); the weekly opener (eligible and exempt-by-age,
idempotent); the member's view and mail reference (no payer names, source ids or recorder); the staff actions through the
whole notice flow (obligation for a past week, evidence, acknowledge, receipt idempotent/conflict/ceiling, allocate,
reverse, void, final notice, officer review, removal with no case opened and a bogus case refused, replay); own_record;
the overflow guard (a stored amount past the safe bound is 409, never 500, and the copy says so); erasure and export;
the purge with the flag off; reader admission (EARLY, the own view, the staff view, AFTER SUCCESS withheld with the write
standing). `account_copy_test.cjs` (34→36, two fixtures) covers the ledger's section in the copy and its rows in the whole-schema erasure scan. Pins .75.

## Worker .76 — the departure intake's captured incarnation and cross-run progress; the own copy's references and capture instant (Codex's residual CHANGES, 1 Oct 04:56 and 05:05 UTC) (1 Oct 2026)

**What changed.**
1. **Departures** (`src/community-departures.ts`): the intake's INSERT binds the candidate's captured site-account
   INCARNATION (the row's `first_login` AND `session_version` read in the scan, compared by equality), not merely that a
   row exists, so an account erased and recreated under the same Discord id between the scan and the insert records
   nothing; the keeper's `characters` row still survives a site erasure by design, and a recorded item still survives a
   later rejoin. Progress across runs: a run that ends at its bounds keeps its scan position in the new one-row table
   `community_departure_scan` (left_at, name_key, updated_at: one shared operational cursor, a departure time and a
   character name key, no Discord account ID; worded so in .80 on Codex's request) and the next run continues from it; a run
   that scans to the end clears it; per-run bounds unchanged, nothing dropped, so a long run of candidates the site
   cannot record never starves a later valid departure.
2. **The own copy** (`src/site-export.ts`): `generatedAt` is the database's clock read INSIDE the copy's batch (its first
   statement), so "read together in one database transaction at generatedAt" is literally the capture instant; the
   application's parsed answers carry their references as kind and label only in the own copy (the structural account
   `key` is another member's id; `appOut`, the forms and the member's free text are untouched elsewhere).

**Database.** One new table (`community_departure_scan`) in `schema.sql`, `src/schema.ts`,
`migrations/2026-10-01-community-departure-scan.sql`. **Rollout.** With .51-.75. **Rollback.** Redeploy .75 (the table is
harmless). C02: no write path added or removed.

**Tests.** `tests/community_departures_test.cjs` (41→46): the erased-and-recreated account before the insert records
nothing while the next run records the recreated account's own departure; 25 unrecordable candidates before a valid one
with a page of two: the first run keeps its position, the second continues and records it and clears the position, the
third starts over. `tests/account_copy_test.cjs` (36→38): generatedAt from the database clock; references without `key`
and the member's words kept; the capture wording. Pins .76.

## Worker .77 — the own copy's normal-writer regression; the cutover configuration kept beside the live one (1 Oct 2026)

**What changed.**
1. **The normal-writer regression** (Codex's frozen .74 CHANGES, 05:08 UTC): `tests/account_copy_test.cjs` now saves the
   member's application through the REAL `PUT /api/application` with a Discord picker reference (the stored row keeps the
   reference's key for the site's own use) and asserts that `GET /api/me/export` carries that reference as kind and
   label only, the member's own words intact. No Worker change: .76's projection already held; the suite proves it on
   the writer's own output.
2. **The cutover configuration** (`worker/wrangler.cutover.toml`, `scripts/cutover-config.sh`,
   `scripts/tests/cutover-config.test.sh`, CI): Codex's reviewed candidate (`candidates/preferred-cutover-config`,
   manifest `353deb6f…`, locally accepted 05:05 UTC) applied to the CURRENT `wrangler.toml` (which has .75's
   `CONTRIBUTIONS_*` vars the candidate predates) as a second file, with every explanatory comment refreshed: GUILD_ID =
   Asmongold's server, the Olympus Guild Member/Officer/Guild Leader/Raid Leader roles, the global Discord Moderator for
   reporting only, no Guild Master role, the private review/log/notices/visitors channels, no nickname capability,
   Quarantine and Flagellant as blocking roles, `SITE_HOST = olympus.roachcouncil.com` with `guild.roachcouncil.com` as
   the legacy host and both routed. The live `wrangler.toml` is unchanged, so every deploy of `main` before the cutover
   still serves the current server; `--check` (CI) proves the pair differs in exactly the 16 keys and the routes;
   `--apply` is the authorized final source/config step (applied once, committed, rechecked, signed by both agents on
   that exact commit, then deployed by the owner; never an uncommitted override) and refuses a dirty live file.

**The cutover's preconditions** (Codex's eight gates, 04:36 UTC), all owner or live actions, none performed by an agent:
1. the donor's canonical move: `olympus.roachcouncil.com` released by Olympus Forever (to `olympusforever.roachcouncil.com`)
   with its service URLs and callbacks smoke-tested, before the keeper attaches the host (W01);
2. the bot's Manage Roles position in Asmongold's server above Olympus Guild Member, its private channel write access and
   any visitor access expansion: action-time approvals;
3. the final `COMMUNITY_FEATURES` and the WAF method allowlist accepted (features stay OFF in this file);
4. the immediate pre-deploy D1 read-only repeat and the recovery/migration rehearsal (Codex's .46→.72 rehearsal passed;
   a final exact-head rerun is required);
5. the effective Quarantine/Flagellant access verified with the final configuration;
6. `VERIFY_OPEN_SINCE` set in the cutover file to the day the preferred verification path actually opens (the placeholder
   is the .32 baseline);
7. the Developer Portal redirect for the new site host present;
8. both agents' signatures on the exact cutover commit; then `bash scripts/deploy-commit.sh <sha>`.

**Database / config.** None live. **Rollout.** With .51-.76; the cutover file is inert until applied. **Rollback.**
Redeploy .76. C02: no write path added or removed.

**Tests.** `tests/account_copy_test.cjs` (38→39, the fixture through the real writer); `scripts/tests/cutover-config.test.sh`
(the pair's expected difference, the argument contract, a drifted key refused), in CI. Pins .77.

## Worker .78 — the contribution ledger's lifetime contract (Codex's SELECTED retention contract, 1 Oct 05:19 UTC); the cutover apply step worded as the authorized final step (1 Oct 2026)

**What changed** (`src/community-contributions.ts`, `src/community-contributions-api.ts`):
1. **Weeks**: `retain_until` is the effective database-time cutoff (`LIVE_WEEK`) in every read (member view, staff view,
   snapshot, account copy, the pre-write reads) and every first statement (contact, state, reversal journal, decision,
   removal, the evidence reset), so an expired week is `not_found`, takes no action and is never revived.
2. **Receipts**: an expired receipt funds no NEW allocation even when its deadline is crossed between the snapshot and the
   write (`OWNED_PAIR` requires the receipt live and unvoided at the journal insert); at the deadline its source id, payer
   and observer leave the staff view before the purge scrubs them; while it still pays a live week it is shown (view and
   copy) only as the allocated/retired relationship that week needs (`amountCopper` = allocated + retired, no credit
   figure); an expired receipt paying nothing live is not shown; voided receipts show no credit. `expiredCopper` is gone
   from the DTO. Already-spent copper is preserved; no journal is filtered before retirement.
3. **Decisions requalify their facts at the write**: a contact requires, in its first statement, the week live and the
   evidence attestation the evaluation relied on (state, live); a removal requires the week live and open, that
   attestation, and, when linking, the case live about that member (`facts_changed` / `facts_stale` otherwise, nothing
   written).
4. **The weekly opener** binds the captured account incarnation (`first_login`, `session_version`) and a roster-confirmed
   character NOW at the INSERT (`proof`); an account erased and recreated or unbound since the scan records nothing
   (`proof_changed`, swallowed by the opener).
5. Constant policy reads (`ensurePolicy`, the default policy) stay as initialization; every private read stays admitted.
6. **Cutover wording** (Codex 05:19): the apply step is the authorized final source/config step performed by the agents,
   committed, rechecked and signed on the exact commit before the owner deploys it; never an uncommitted override.
   `CLAUDE.md`, the script, the cutover file's header and .77's checklist entry say so.

**Database / config.** None. **Rollout.** With .51-.77 (the ledger stays off). **Rollback.** Redeploy .77. C02 unchanged.

**Tests.** `tests/community_contributions_test.cjs` (76→96): an expired week absent from every view and copy, 404/none
on contact, state, reversal, allocation and removal, no revival; a receipt expiring between the snapshot and the write
funds nothing; an expired receipt's private fields and original amount gone while its allocation to a live week stays;
a contact whose attestation changed between the evaluation and the write is `facts_stale`; a removal whose linked case
expired meanwhile is `facts_changed`; the opener records nothing for an account recreated or unbound since the scan.
Pins .78.

## Worker .79 — the privacy policy and the terms over every module (the content gate accumulated since .65) (1 Oct 2026)

**What changed** (`policies/privacy.html`, `policies/terms.html`, `src/policy-content.ts` regenerated in the same commit).
The privacy policy gains: the site's coming address (olympus.roachcouncil.com, the old one forwarding); a section "The
community pages" stating, for each module, what is stored, who sees it and for how long, each statement checked against
the code: the directory and crafting offers (listed to roster-confirmed members only while listed and qualifying; display
name and a random reference, never the Discord id; names as labels until the officers' record matches, a bound name
refused; the thirty-day deletion after the owner stops qualifying), the calendar and attendance (organizers; answers
visible to confirmed members and holding a place only while confirmed; the four attendance states with late/left early;
never feeding roles or penalties; thirty days after the end), trial reviews (own status and dates, never sponsor or
staff; thirty days after the conclusion or the due review, gone from every page and copy at that moment), restriction
cases with the watch-list and the return review (staff records and review evidence only; the categories; the names and
in-game identifiers copied from the officers' record; twelve months per member, renewable, capped by the case; a removal
case's expiry at most two years, a ban until resolved, thirty days after resolution), departure review items (thirty
days), and the dues ledger (weeks, payments with payer names for officers only, acknowledgements, the mail reference as a
matching aid and not proof, nothing sent or taken, the removal record as a record, the officers' retention of one day to
ten years fixed per record). "Who can see it" names the staff pages and that staff actions are recorded under the
administrator's id. "Getting rid of it" states that the erasure removes every community record, the three documented
residues (the dated log with the fixed action names, an ACTIVE restriction case with its watch-list and period, the bot's
own verification rows incl. the invite queue), staff anonymization, and the distinction between the effective cutoff
(trials, cases, departure items, dues records: gone from every page and copy at the moment) and the bounded cleanup
(profiles, events: deleted thirty days after). A new section "Your copy" describes `GET /api/me/export` (contents,
nothing about anyone else, no staff identities, read in one go at the stated moment, five an hour, the actions'
continuation). The terms gain "The community pages" (what is yours to withdraw; staff records that grant or remove nothing
by themselves; dues as the guild's arrangement, the ledger recording what officers confirm, the mail reference not proof,
questions for the officers) and the updated date.

**Database / config.** None. **Rollout.** With .51-.78; the policy pages are served by the Worker (`/privacy`, `/terms`)
and mirrored by GitHub Pages from the same files. **Rollback.** Redeploy .78. C02 unchanged.

**Tests.** `npm run check:policies` (the generated module is what the tracked pages give); `hosts_test.cjs` (the tracked
text served verbatim). Pins .79.

## Worker .80 — the ledger's remaining persistence groups (the frozen .75 review, 1 Oct 05:35 UTC); the departure scan cursor worded precisely (1 Oct 2026)

**What changed** (`src/community-contributions.ts`): (1) every standalone read a write makes AFTER its batch runs under the
acting session's admission (`readAs`): the new week's id after a create, a receipt's existing row for a replay or a
conflict; the committed effect stays while a reader who lost standing meanwhile receives no row (403 by `refusal`); the
fence's own re-check (`fenceRefusal`) is judged by the database clock and facts in SQL (the two fence predicates), never
by the request's JavaScript time; (2) the receipt replay/conflict read is live-only, so an expired receipt under a source
id is `past_retention`, never replayed; (6) the purge's first statement bumps the revisions only of the members whose rows
THIS bounded run selects (the same LIMIT sets as its retire/delete/scrub statements, now with deterministic `id`
tiebreakers), never of every member with an expired row. Groups (2)-(5) of that review are .78's. The departure scan cursor
is described exactly (module header, `schema.sql`, the migration, the .76 checklist entry): one shared operational cursor
(a departure time and a character name key), no Discord account ID, kept when a run ends at its bounds, cleared once a
run scans to the end.

**Database / config.** None. **Rollout.** With .51-.79 (the ledger stays off). **Rollback.** Redeploy .79. C02 unchanged.

**Tests.** `tests/community_contributions_test.cjs` (96→103): the committed create whose admin is denied right after the
write batch (the week exists, 403, no ledger); `fenceRefusal` on a live session, a bumped version, a passed expiry and a
denial; the identical receipt retried after its deadline is `past_retention` with the row still there; a purge run bounded
to one week touches one member's revision only, the next run the other, a live member never. Pins .80.

## Worker .81 — the cutover script's two committed states (Codex's .77 review, 1 Oct 05:41 UTC) (1 Oct 2026)

**What changed** (`scripts/cutover-config.sh`, `scripts/tests/cutover-config.test.sh`, the cutover file's header, CLAUDE.md).
After a real clean `--apply` the live and cutover files are identical, so the .77 `--check` (and CI) failed on the cutover
commit. Now `--check` accepts two committed states: without the activation marker `worker/wrangler.cutover.applied`, the
reviewed PRE-CUTOVER pair (the files differ in exactly the sixteen keys and the routes; two identical files without the
marker FAIL, so equal files are never an implicit approval); with the marker, the APPLIED state (the live file byte-identical
to the profile AND the profile's SHA-256 equal to the one the marker recorded at the apply, so an edit of either file
afterwards fails the check and forces a re-review and a re-apply). `--apply` writes the marker (the profile's hash and the
time), refuses a second apply while the marker exists, and still refuses a dirty live file; the safe default remains show.
The test runs the lifecycle in a synthetic owned repository of copies: the pair, a partial application, identical files
without the marker, the real apply, `--check` in the applied state before and after its commit (the permanent contract), a
second apply refused, the profile edited after the apply, the live file drifted after the apply, a marker without a hash.

**Database / config.** None live. **Rollout.** With .51-.80. **Rollback.** Redeploy .80. C02 unchanged.

**Tests.** `scripts/tests/cutover-config.test.sh` (CI). Pins .81.

## Worker .82 — the private request intake (consolidation batch 6; `privacy_intake` flag off) (1 Oct 2026)

**What changed.** Olympus Forever's private request intake (`src/privacy-requests.ts`, migration 0008), ported onto the
keeper as `src/community-privacy-intake.ts`:
1. **A case** is a manually handled private conversation for someone who can no longer reach Discord: no sign-in, no
   email, no IP, no staff-only text. The browser generates the case id (22 chars) and a 32-byte case code; only the code's
   SHA-256 is stored and the code travels only in POST bodies; a wrong code and a missing case take the same path (a
   constant-time compare, 404 `case_not_found`). A case never proves who owns an account and never exports, deletes or
   changes anything by itself.
2. **Retention** is fixed per case at creation (`retention_days` from `PRIVACY_INTAKE_RETENTION_DAYS`), renewed by a message
   under the case's own policy (monotonic, only when that request's insert applied), pinned by closing; `retain_until` is
   the effective cutoff by the database clock in every read and write; the bounded cleanup cron (`sweepCommunityPrivacy`)
   deletes expired cases with their messages and operations and runs whatever the flag says.
3. **Capacity inside the INSERT**: 1000 stored cases, 200 open, 20 new per rolling hour, 100 messages and 20 requester
   messages per case, 500 staff operations per case; the in-memory per-IP limiter (20 a minute per path) is the first
   filter only. Bodies are read from the actual stream within 8 KiB (413 past it), must be valid UTF-8 JSON, same-origin
   (403 `bad_origin`) and `application/json` (415); texts refuse controls, bidi overrides, BOM and lone surrogates.
4. **Routes.** Public, no session, in `site-api.ts` before the session check: `GET /api/privacy/config` (whether new cases
   are accepted and the limits), `POST /api/privacy/requests` (open; an exact retry returns the original receipt even while
   intake is paused, a different payload or code under that id is 409 `case_conflict`), `/read` (the case and its newest
   messages, oldest first, paged with `before`), `/reply` (the requester answers; an exact retry returns the original
   answer, a reused id with different text is 409, a closed case 409, the caps 429). Staff (communityStaff):
   `GET /api/admin/community/privacy-requests[?state=]`, `GET .../privacy-requests/case?caseId=`,
   `POST .../privacy-requests/update {caseId, messageId, status, reply?}`: one operation keyed by the id the admin page
   generates, admitted only while the admin's fence holds (`fenceSql applicantWrite` at the operation insert), the case
   live, the id new and a reply fitting the cap; a replay returns the original result without reapplying (never
   reopening a case closed since); the audit row `community.privacy_case_updated` (case id, status, replied; never the
   text) is written in the batch or not at all; the current-page header is required.
5. **Config**: `PRIVACY_INTAKE_ENABLED = "false"`, `PRIVACY_INTAKE_MONITORED = "false"` (set only once an administrator
   actually reads the queue), `PRIVACY_INTAKE_RETENTION_DAYS = ""`; the flag `privacy_intake` gates every route. The
   cutover profile carries the same defaults (`--check` still passes).
6. **The privacy text** gains the form's paragraph ("If you can no longer reach Discord"); `policy-content.ts` regenerated.

**Database.** Three new tables (`schema.sql`, `src/schema.ts`, `migrations/2026-10-01-community-privacy-intake.sql`),
additive; they hold no Discord id. **Rollout.** With .51-.81; the form stays off until an administrator commits to reading
the queue (MONITORED) and a retention is chosen. **Rollback.** Redeploy .81. C02 write paths added (behind the flag):
`POST /api/privacy/requests`, `POST /api/privacy/requests/reply`, `POST /api/admin/community/privacy-requests/update`.

**Tests.** New `tests/community_privacy_test.cjs` (46): the flag and the three switches; the receipt and its exact retry,
conflicts, the honeypot, origin, media type, body budget, bad JSON, bidi text; read with a wrong code or unknown case; the
reply, its retry, a reused id, the renewed deadline, the requester cap; the staff list, read, update with a reply, replay,
operation conflicts, closing (pinned deadline; a reply after it refused), the fence (a denied admin writes nothing), the
page header; the per-IP limiter and the per-hour cap; the effective cutoff on every public and staff path; the purge with
the flag off. Pins .82.

## Worker .83 — the privacy policy and the terms made precise (Codex's .79 prose review, 1 Oct 06:00 UTC) (1 Oct 2026)

**What changed** (`policies/privacy.html`, `policies/terms.html`, `src/policy-content.ts` regenerated in the same commit).
1. The dues ledger paragraph carries the selected credit-conservation exception: past its period a week is gone; a
   payment's private details become unavailable at its cutoff and its unused remainder never pays a later week, while the
   amount it already paid a week still within its period stays visible with that week, and only that amount.
2. "Getting rid of it" names every residue truthfully: the dated log with the id as subject or actor; an active case with
   its watch-list and the member period (the dated renewal note surviving only while a case of yours is unresolved, an
   ended period admitting no new row and renewing nothing); the bot's own rows; the departure review's shared scan
   bookmark (a departure time and a character name key, never a Discord account ID, replaced each run, cleared at the
   end); staff anonymization excludes the dated log.
3. Conditional wording: the nickname is set only where the staff switched that on; the notices channel is named by its
   role with both channels (the Olympus server's #bot-announcements, Asmongold's #olympus-notices after the move); the
   "payment details" denial is about real-money details, with the in-game copper ledger pointed to; profiles and events are
   deleted by the scheduled cleanup from thirty days after (not instantaneously), the SQL-enforced cutoffs stated as such;
   a page that is off keeps what it holds in the copy and on the cleanup schedule.
4. The terms describe the two interface fonts by their game-client source and retained embedded notices (Friz Quadrata:
   International Typeface Corporation, 1997; Morpheus: Kiwi Media/Design, Eric Oehler, 1996), claiming no ownership and
   granting no redistribution right, with the code licence not extending to them; the notices channel wording as above.

**Database / config.** None. **Rollout.** With .51-.82. **Rollback.** Redeploy .82. C02 unchanged.

**Tests.** `npm run check:policies`; `hosts_test.cjs`. Pins .83.

## Worker .84 — the cutover test valid for both committed states (Codex's .81 review, 1 Oct 06:04 UTC) (1 Oct 2026)

**What changed** (`scripts/tests/cutover-config.test.sh`). The permanent CI test no longer assumes the pre-cutover state:
it runs the real `--check` on whatever the repository holds and asserts the state it found (marker present: the live file
byte-identical to the profile, the plain run announcing the applied state, a second apply refused; marker absent: the site
host difference shown, the files differing). Its lifecycle fixture builds its OWN synthetic pre-cutover pair from the
expected keys ("old"/"new" values, every other line identical) instead of copying the repository's files, so it is
independent of whichever state CI is testing, and it runs the same contract function against the synthetic repository as
a pair, after a real isolated `--apply` (uncommitted and committed) and after the restoration. The partial, equal-without-
marker, drift, edited-profile and hashless-marker refusals and the argument contract stay. `scripts/cutover-config.sh` is
unchanged.

**Database / config.** None. **Rollout.** With .51-.83. **Rollback.** Redeploy .83. C02 unchanged.

**Tests.** `scripts/tests/cutover-config.test.sh` (CI). Pins .84.

## Worker .85 — the officer digest (counts only) and the coverage report, consolidation batch 7 (1 Oct 2026)

**What changed.** Olympus Forever's `officer-digest.ts`, `officer-queue.ts` and `coverage.ts` (Codex's adapter-map row:
the keeper's staff views and `/api/admin/community/*` diagnostics over the keeper's own queue and roster state, notices
through the bounded staff channel, never a DM) on the keeper, in `src/community-digest.ts`:
1. **The digest.** Once a day after 15:00 UTC (the cron runs every half hour) the bot posts to the staff channel
   (`staffChannel`: CHANNEL_MOD_ALERTS, else CHANNEL_RECRUITMENT_REVIEW) how many things wait for an officer: invites
   queued or written, trial reviews due, departure items open, restriction cases due for review, private requests open,
   character claims to review, dues weeks past their final review date; each only while its feature is on, each a
   COUNT(*) over the module's own live predicate by the database clock (the dues count by the recorded contact dates
   alone; the ledger page shows a week's stage). Counts and nothing else: no name, mention, id, link or timestamp;
   `allowed_mentions: {parse: []}` and an enforced nonce.
2. **The fenced state** on `site_settings` key `officer_digest` (no new table): a five-minute lease by compare-and-set on
   the exact previous value, every later write comparing the value this run last wrote; the post's channel, nonce and
   text frozen BEFORE the send; an unrecorded outcome (a crash after the frozen intent, a 5xx, a network failure, an
   answer without an id) HALTS the digest until an administrator resumes it; a definitive 4xx gives the day up (no
   message exists) and tomorrow tries again; yesterday's digest is deleted before today's (a definitive refusal stops
   tracking it, 404 counts as deleted); a transient failure waits ten minutes; three attempts a day; switched off or
   moved to another channel, the bot deletes the digest it posted before anything else; an unreadable or incomplete
   state halts. Audit rows `community.officer_digest_posted` (the counts), `_failed` (the stage and a bounded status),
   `_removed`, `_resumed` (the administrator as actor), each in the same batch as the state write and only when that
   write took effect (`changes() = 1`); never an id, never free text.
3. **Routes** (communityStaff; reads admitted): `GET /api/admin/community/digest` (the counts now, the preview, the
   state), `POST /api/admin/community/digest/resume` (the page header, a fenced UPDATE on the exact value read, the audit
   row in the batch; `not_halted` / `already_resumed` when there is nothing to do), `GET /api/admin/community/coverage`.
4. **The coverage report:** the latest `roster_snapshots`/`roster_members` export next to `characters`, `members.banned`,
   `site_users` (in_server, denied) and the active restriction cases, in ONE admitted batch, read-only, no provider
   call, no enforcement. Classes unbound | bound_not_member | banned | no_site_account | not_in_server | denied |
   restricted | covered; totals, people (characters grouped by account), entries ordered by name key; `coverage: null`
   with `unavailableReason` no_export | stale (older than seven days) | too_large (over 2000 rows) | count_mismatch (the
   rows against the export's member count); four stated limitations (not Battle.net proof, no role census, cached facts
   only, not authorization to remove anyone).
5. The cron runs `runOfficerDigest` after the privacy sweep, behind its own switch. No schema change.

**Database / config.** No schema change. New var `OFFICER_DIGEST_ENABLED = "false"` in BOTH `wrangler.toml` and
`wrangler.cutover.toml` (the cutover `--check` stays exact); "true" once the officers want the digest, with
CHANNEL_MOD_ALERTS (or the review channel) set. **Rollout.** With .51-.84; nothing posts until the var is "true".
**Rollback.** Redeploy .84; a posted digest stays in the channel (delete it by hand); the `officer_digest` row is inert.
C02 write paths added: `POST /api/admin/community/digest/resume` (and the cron's own posts while the var is "true").

**Tests.** New `tests/community_digest_test.cjs` (60): the switch and the hour; the first post and its payload; the counts
per feature and their lifetimes; yesterday's deletion (ok, refused, 404, transient with the wait and the three
attempts); a refused post; an uncertain post, the halt and the resume (the page header, a member, the administrator, the
audit row); a frozen intent found at the next run; an unreadable or incomplete state; a superseded run; a held lease;
switched off and moved; the cron wiring; the coverage report's four unavailable reasons and its classification. Pins .85.

## Worker .86 — the site on official World of Warcraft assets, the staff rank planner (consolidation batch 8) (1 Oct 2026)

**What changed.** Codex's candidate `official-wow-website-p73` (manifest `36384be7…`, prepared on .73) as a MINIMAL overlay
on the current head; the four targets were unchanged since .73 except the test pin (`git diff --stat 63a6483..HEAD`).
the owner's instruction of 1 Oct 2026 (relayed by Codex 04:44): generated and custom artwork is for the Discord application
only; the websites use official World of Warcraft assets.
1. `public/static/app.js`: `accountArt(person)` renders every account picture (header, welcome, candidate cards, pickers,
   admin lists and tables: nine call sites) as the member's class icon or the official Member icon; Discord's avatar fields
   stay in the API and the session, unrendered. The inline chat-bubble glyph becomes `pos-community.png` at the two
   sign-in call sites. The brand and tab icon are the client's banner icon `wow/icon-friends.png` (INV_Banner_02, 64 px);
   an unknown Class Lead class falls back to the unknown-position icon. The footer line follows the .83 terms (artwork,
   icons and two fonts from the game client, Blizzard's property, the fonts' embedded notices kept). The admin
   navigation gains "Rank planner" (`/admin/ranks`).
2. `public/static/olympus-icon.png` (the custom crest) is deleted; `app.css` and `site.ts` (favicon, no-script sentence:
   "its interface images and fonts load from this site") follow.
3. `public/static/wow/asset-provenance.json` (public): every shipped game image and font with its SHA-256, dimensions,
   original Interface/Fonts path and pinned extractor transform; relative game paths only (checked: no local path).
4. The staff rank planner: `src/site-ranks.ts` serves `/admin/ranks` (GET/HEAD; 405 with Allow otherwise; 503 while the
   schema is not ready; 401 signed out; 403 unless SITE_ADMINS) with the planner page, whose five static files
   (`rank-planner/app.js`, `catalogue.js`, `model.js`, `styles.css`; the frozen rank input 310ccf64…) keep the draft ladder
   in the administrator's browser (localStorage keyed by their id), export and import it as a JSON draft, and fetch
   nothing. No server storage, no rank writes, no provider call. Two visible agent-review strings removed from the
   shipped page and one from the planner script (product text); the frozen model's draft marker (`review: pending`,
   `liveChangesApplied: false`) is unchanged, a draft marker in the exported file.
5. README and design.md brand lines.

**Database / config.** None. **Rollout.** With .51-.85. **Rollback.** Redeploy .85 (the crest returns with it). C02
unchanged (no new write path: the planner writes nothing).

**Tests.** `site_test.cjs`: the crest assertion becomes the banner assertion plus "no account picture loads from Discord";
a new section for `/admin/ranks` (401, 403, 200 with the owner-scoped draft and only this site's files, no agent text,
405 with Allow, HEAD, the four static files fetch nothing). Pins .86.

## Worker .87 — the privacy policy and the terms reconciled with the source (Codex's complete .79 handoff, 1 Oct 06:26 UTC) (1 Oct 2026)

**What changed** (`policies/privacy.html`, `policies/terms.html`, `src/policy-content.ts` regenerated in the same commit;
`src/site-export.ts` `about` text). Twelve corrections of the prose, none of the selected contracts:
1. The dated log is described as it is: each entry's name, who acted, whom or what it concerned and its recorded details
   (denial and ban reasons as typed; the previous account of an unbind); the own copy shows time and action name only.
2. The roster's public note can carry `D:<Discord ID>` where the guild note is switched on; the roster history is not
   promised free of account IDs.
3. The bot has no delete command: unbinding (what it does exactly) is not erasure; a bot-data erasure is a separate request
   the officers handle by hand; the member row, the unbound character rows and the log stay.
4. The denial residue is the row with the ID, the denial, its reason and date (sign-in dates set to that moment).
5. Staff-pointer clearing excludes the dated log, Discord's own messages and incidental free text.
6. "Where it goes": Cloudflare's storage (D1, the site's files, Workers Logs with fixed categories only), the officer's
   local records (queue file, saved data, chat log), the bot's routine Discord operations (role, nickname and ban writes
   with audit-log reasons, member reads, the name refresh, the hourly re-check, notices, staff messages), Blizzard only at
   sign-in; no "nowhere" claim.
7. The addon and the companion program described as written (the chat log file is read on the officer's computer; only the
   extracted code, names, invite outcomes, roster export, in-world state and a timing measurement are forwarded); no
   game-runtime guarantee.
8. Calendar answers only before the event starts, while the calendar is on and the member confirmed (the INSERT's
   `e.starts_at > DB_NOW`).
9. Other qualifying members see the listed directory, crafting offers and calendar answers; "nothing else you entered"
   narrowed accordingly.
10. The copy is curated (no staff notes, reasons or identities, no raw snapshots, no private payment details; own labels
    and free text as written, which can name others); every continuation a fresh snapshot; five an hour kept in memory.
11. Lifetimes govern new pages and copies by the database clock; the bounded cleanup may take several runs and waits while
    the schema check fails; nothing recalls downloaded copies, local working copies or Discord's records.
12. A page that is off takes no new entries or actions while copy, erasure, cleanup and the log continue; staff CHANGES are
    attributed (reads are not); "posts nothing else" scoped to the members' notices channel with the staff channels (log
    lines, review cards, the daily digest of counts) named and delivery subject to channel permissions.
Plus the realities since .82: the private request cases, the coverage report and the digest counts as staff views that
change nothing, the digest as counts only, and the staff rank-planning page (browser-local draft; a draft is a proposal).

**Database / config.** None. **Rollout.** With .51-.86. **Rollback.** Redeploy .86. C02 unchanged.

**Tests.** `npm run check:policies`; `hosts_test.cjs`; `account_copy_test.cjs` (the `about` text). Pins .87.

## Worker .88 — the ledger's four repairs (Codex's frozen .80 review, 1 Oct 06:49 UTC) (1 Oct 2026)

**What changed** (`src/community-contributions.ts`):
1. The new-receipt batch's first statement (the member's private magnitude, `over_limit`) acquires nothing unless the
   acting session's fence holds in that same statement (`WHERE 1 AND <fence>`: no row otherwise); the INSERT keeps its
   fence; the explanation stays the admitted read (`reader_refused` for a lost standing).
2. The removal's pre-read captures the linked case's random `incarnation`, and the resolving UPDATE requires that exact
   incarnation (a case replaced under the same id between the evaluation and the write is `facts_changed`).
3. The weekly opener's INSERT restates the eligibility it writes from the member's CURRENT roster-confirmed characters:
   the earliest valid `member_since` plus the exemption at or before the week's start (the same rule as
   `firstEligiblePeriod`, since the start is a period boundary); a changed age with the other eligibility is
   `proof_changed`; the GUID is not required unchanged when the eligibility is the same.
4. No receipt, week or evidence row is born at or past its `retain_until` by the database clock: `?retain > DB_NOW`
   inside each INSERT; a refused birth is `past_retention` (the obligation's explanation read carries a database-clock
   probe for that classification; the attestation's fallthrough names `past_retention`, the fence's own reasons first).
   Decisions are unchanged on purpose (their deadline is the actor's `now` plus the retention; their effect statements
   require the live week).

**Database / config.** None. **Rollout.** With .51-.87. **Rollback.** Redeploy .87. C02 unchanged.

**Tests.** `community_contributions_test.cjs` (+9): the probe and insert SQL shapes (a recording shim hook), the replaced
linked case, the opener's restated eligibility (an age changed before the insert, then recorded with the current age),
and three births refused by the database clock while the actor's clock was behind (week, receipt, attestation). Pins .88.

## Worker .89 — the private request intake's four repairs (Codex's frozen .82 review, 1 Oct 06:49 UTC) (1 Oct 2026)

**What changed** (`src/community-privacy-intake.ts`):
1. The staff explanation path classifies an expired or missing case FIRST: 404 whatever the operation table holds (a
   replay of an operation on a case gone by the database clock was 200 `replay: true`).
2. The requester's exact-replay lookup is read in ONE batch with the live case and joined to it by the code hash and the
   deadline, so a deadline passing between the two reads is never answered as a replay (404).
3. A new case is never born at or past its deadline by the database clock (`?deadline > DB_NOW` inside the INSERT, the
   first message still in the same transaction); a refused birth is classified by a database-clock probe: an expired
   deadline is 503 `intake_unavailable`, a full cap 429 `intake_busy`; no new error name.
4. The rolling-hour cap is cut at the database clock inside the INSERT (`created_at > DB_NOW - 3600`), not at the
   actor's clock; the limits stay 1000 stored / 200 open / 20 an hour / Retry-After 3600.
The module header now says that the 8 KiB stream budget is the public routes' contract and that the staff operation
arrives through the site's admin reader (`readJson`, the shared 64 KiB) with the reply capped at the field: Codex's
observation reconciled as a comment, no strict parser adopted for staff.

**Database / config.** None. **Rollout.** With .51-.88. **Rollback.** Redeploy .88. C02 unchanged.

**Tests.** `community_privacy_test.cjs` (+3): the requester's and the staff's exact replays on an expired case are 404; a
case born expired by the database clock is 503 with no row; the hourly-cap control creates its twenty cases at the real
clock (the cut is the database's). Pins .89.

## Repository (after .89): the publication helpers, LICENSE, THIRD_PARTY_NOTICES.md, docs/source-provenance.md (1 Oct 2026)

**What changed.** No Worker change (BUILD stays .89; no deploy). Codex's reviewed publication-helper V4 candidate
(manifest `f605767454a40f96032302afae8b0229dd8bebd07832d81821aa19e5ebf07aff`; my input review and signature of 06:54
UTC) integrated into `scripts/`: `publication_audit.py`, `public_history.py` (the unchanged V2 helpers),
`official_assets.py`, `official_asset_reference.json`, `stage_publication.py`, `validate_publication.py` (the V4 four-file
overlay), byte-identical except a CRLF-to-LF normalization of the three Python overlay files that the repository's
`.gitattributes` (`* text=auto eol=lf`) would have applied silently on commit; done explicitly, CR removal only, the
hashes before and after recorded in the consolidation log. `LICENSE` reconciled (proprietary, all rights reserved;
public visibility is not a licence; the exceptions and notices enumerated, pointing to the notices file).
`THIRD_PARTY_NOTICES.md` (the 92 game images, the two fonts with their retained embedded notices, the rank catalogue's
source document, the Forever ports as the owner's own work, the project's own HMAC code, the development dependencies,
the trademarks). `docs/source-provenance.md` (what is tracked and what never is, the generated and derived files, the
ported modules, the six helpers, the gate's required documents, profile files and fixed sources, how a snapshot is
prepared, what publication means). `.gitignore`: `.publication/`. CI: `scripts/tests/publication-helper.test.sh` (the
six files compile, answer `--help`, the pinned reference loads with 94 official paths, the seven documents exist).
CLAUDE.md (commands, the never-run list, the layout rows) and README (a licence section). The helpers need Python 3.12 or
later at run time (`Path.is_junction`; CI's runner has it; the smoke test picks the newest interpreter on PATH and only
compiles under an older one). `watcher/config.example.json`: the two secret placeholders become `REPLACE_WITH_…` words
(the audit helper's own placeholder rule; the explanation moved to the README line), so the only blocking audit
findings left on the head are the offline test fixtures, to be classified at the final staging.

**Database / config.** None. **Rollout.** Nothing to deploy. **Rollback.** Revert the commit. C02 unchanged.

**Tests.** `bash scripts/tests/publication-helper.test.sh` (CI). The helpers' own fixture suites stay with the candidate.

## Worker .90 — launch preparation: the role writer's Discord-call budget (P-20), welcome-only public notices (P-19), limits on the sign-in and OAuth routes (P-17) (1 Oct 2026)

**What changed.**
1. **P-20, `src/roles.ts`:** a per-run Discord-call budget (`CallBudget`, `callBudget(env)` from `ROLE_CALL_BUDGET`, default
   40 of the free plan's 50 subrequests, clamped 4..50; `takeCall`, `budgetExhausted`). `grantMemberRole` takes a budget
   and returns the new outcome `budget` when a call cannot be afforded, auditing `role.budget_exhausted` once per run;
   `removeIfBlocked` and the ban revocation count their call but are never skipped; `reconcileBanned` takes the budget and
   stops before an account it cannot finish, its cursor at the last one done. The sweep (`restore.ts`) creates one budget
   per run, reserves four calls per account (the look, the writer's fresh look, the grant, a revoke after a ban), stops
   BEFORE an account it cannot finish, leaves the rotation cursor at the last account finished (never at the end of a page
   it did not reach), audits `calls` and `stopped` in `role.sweep`, tells staff once, and returns `budgetExhausted` and
   `calls`. The backfill page (`backfill.ts`) stops with "stopped: this run's Discord-call budget is used up" and its cursor.
   A roster export's promotions (`ingestRosterInner`), the manual sync and a batch of join events (`postEventsInner`) share
   one budget each; a promotion whose grant cannot be afforded is `role.deferred` with `reason: budget` and the sweep
   restores it. A single interaction's grant carries no budget.
2. **P-19, `src/dm.ts`:** `PUBLIC_KINDS` is `welcome` only (the owner's V7 for an 81,000-member server): a return to the invite
   queue and a freed seat are posted as "there is an update, run /verify-status", like every other kind. The terms say so
   (regenerated `policy-content.ts` in the same commit).
3. **P-17, `src/site.ts`, `src/index.ts`:** `/auth/login` and `/auth/callback` on the site host, and `/linked-role`,
   `/oauth/callback`, `/bnet/link` on the bot host, are limited to 20 a minute per client address (`CF-Connecting-IP`,
   in memory per isolate: a first filter in front of the zone's rules): 429 with `Retry-After: 60` (text with the page
   headers on the site; JSON `rate_limited` on the bot host).

**Database / config.** New var `ROLE_CALL_BUDGET = "40"` in BOTH `wrangler.toml` and `wrangler.cutover.toml` (the cutover
`--check` stays exact). **Rollout.** With .51-.89. **Rollback.** Redeploy .89. C02 unchanged (no new path).

**Tests.** `role_sweep_test.cjs` (+3: a seven-call budget finishes two of three restorations, audited once and told to
staff, the cursor at the last account done, the next run restores the third); `notices_test.cjs` (+2: the queue and seat
notices reduced to the private text); `hosts_test.cjs` (+3: the 21st sign-in start from one address is 429, another
address proceeds, the bot host's Linked Role start likewise); `restore_role_test.cjs` unchanged (no budget for one
interaction). Pins .90.

## Worker .91 — the officer digest's and coverage report's five repairs (Codex's .85 review, 1 Oct 07:06 UTC) (1 Oct 2026)

**What changed** (`src/community-digest.ts`):
1. The send and the delete go through `rest` with attempt 1: no in-library wait-and-retry on 429, so no message can be
   posted after this run's five-minute lease lapsed and another run halted on the frozen intent. A 429 is a definitive
   non-send: `transient` (ten minutes), the frozen intent cleared, the status audited; a transient delete waits likewise.
2. The three-attempts-a-day cap bounds every kind of attempt, the switched-off or moved cleanup included (three transient
   deletes, then `done_today`; the post stays tracked for the next day).
3. A tracked post in the wrong place (switched off, or the channel moved) is cleaned up whatever the hour; a new post still
   waits for the posting hour (`not_due`, the lease released).
4. The resume's two reads (`not_halted`; the lost-CAS `already_resumed`) are admitted reads: a denied, departed,
   re-versioned or expired administrator gets the refusal and learns nothing from the state.
5. The coverage report reads the database clock, the snapshot's seven-day freshness (`exported_at > DB_NOW - 7 days`)
   and the rows in ONE admitted acquisition; `generatedAt` is that clock.

**Database / config.** None. **Rollout.** With .51-.90. **Rollback.** Redeploy .90. C02 unchanged.

**Tests.** `community_digest_test.cjs` (+8): the 429 post as transient with the intent cleared and the later post from a
fresh state; attempt 1 on every send and delete (the stub refuses `postMessage`); the bounded off cleanup and the next
day's cleanup; the moved channel before the hour (old post deleted, `not_due`, the post at the hour in the new channel); a
denied administrator's resume refused without a reason; freshness by the database clock while the suite's clock runs
weeks ahead; the fixtures' export times moved to the real clock. Pins .91.

## Worker .92 — six prose corrections (Codex's review of .87, 1 Oct 07:31 UTC) and the footer wording (1 Oct 2026)

**What changed** (`policies/privacy.html`, `src/policy-content.ts` regenerated in the same commit; `public/static/app.js`
footer only):
1. The private request case: the case NUMBER is stored as it is (it names the case in the staff pages and the dated log),
   only the secret code is stored as a hash; both travel only in requests, never in a link; the deadline policy as pinned
   (a requester message or an open-case staff change extends under the case's own period, reads never, closing pins, a
   later change to a closed case may update the activity time without extending); past the deadline answered to no one
   and deleted by the bounded cleanup; a case by itself exports, deletes or changes nothing.
2. The footer separates the game artwork and icons (Blizzard's property) from the two fonts (their embedded notices named,
   their respective owners' property) and says the code licence extends to none of it.
3. The ledger's retained minimum stated precisely: for an expired payment that still paid a live week, the payment's kind
   (an officer's entry, a mail, a bank log), the amount it paid that week and the part retired, its date and status, and
   which week; the private source identifier, payer name and recorder withheld.
4. Trials and cases: "no page shows it and no new copy contains it" (never "every copy"), the cleanup bounded; the generic
   lifetimes paragraph now says profiles and events follow their own stated rule (no deadline inside each read).
5. The denial residue described honestly: emptied of names, picture and account dates; keeps the ID, the denial, its
   reason, when and by whom, and the operational state (in-server as last checked and when, the session counter).
6. Account-keyed records distinguished from the anonymous request conversations (keyed by number, read only with the code,
   not in the own copy, untouched by a site-data deletion); the digest's working state and the departure bookmark named as
   operational, about no account; the planner's browser copy outlives signing out and server deletion.

**Database / config.** None. **Rollout.** With .51-.91. **Rollback.** Redeploy .91. C02 unchanged.

**Tests.** `npm run check:policies`; `hosts_test.cjs`; `site_test.cjs`. Pins .92. Note for the V4 reference: `app.js` changes
again (the footer), so the reviewed reference successor must take this head's bytes.

## Worker .93 — the community frontend, slice 1: the shell, Your data, the private request form, the directory (1 Oct 2026)

**What changed.**
1. `src/site.ts`: the page boot carries `community` (community-context.ts `contextDto`: the flags for everyone, the
   viewer's capabilities when signed in; null when the database is unreachable), so the page draws its navigation from
   what the Worker admits.
2. `public/static/app.js` (the community section before the final render): the top bar shows Community only to a signed-in,
   not denied viewer while any community flag is on; the footer links the Privacy Policy, the Terms of Service, Your data
   and (while `privacy_intake` is on) the private request form; the router opens Roles, Your data and the private request
   form to everyone, and keeps Your data and the request form for a denied identity. `#/data`: the own copy as a download
   (`/api/me/export`), its curated omissions and the five-an-hour limit stated, a continuation form for
   `actions.nextCursor`, the removal path explained. `#/request` (no sign-in): the config (`GET /api/privacy/config`), a
   new case with a browser-made number (22) and secret code (43) fixed for the form so a retry finds its own receipt, the
   honeypot field, the receipt shown once with copy buttons and the deadline; an existing case read with the number and the
   code (status, deadline, the messages, older pages), a reply with one message id per attempt; every refusal in words
   (busy, paused, not found, closed, limits). `#/community`: the overview with cards by flag and the standing badge;
   `#/community/directory`: the listed members (display name, main with the confirmed/self-labelled badge, alts with
   their status, professions with skill, offers), keyset paging with `cursor_stale` restarting the list, and the crafting
   search with its own paging; `#/community/profile`: the editor (the consent box with who-sees-this, main, raid role,
   professions with skill, alts, offers, the limits in the labels), saved through `PUT /api/community/profile` with the
   revision; `directory_full` with `saved: true` applies the saved profile and says it stays unlisted; `conflict` reloads;
   `name_conflict` and the invalid-* answers are explained; a 403/503 re-reads the context. Standing notices for a member
   without a roster-confirmed character; the denied view links Your data. No innerHTML anywhere; every text through
   textContent; links and images only to this site.
3. `public/static/app.css`: the few styles the new pieces need.

**Database / config.** None. **Rollout.** With .51-.92. **Rollback.** Redeploy .92. C02 unchanged: no new write path (the
page uses `PUT /api/community/profile`, the three public `POST /api/privacy/requests*` and the reads already listed).

**Tests.** New `tests/frontend_check.cjs` (26): the REAL page script in a minimal DOM against the REAL Worker (the boot from
the real page, every fetch through index.fetch with the viewer's cookie): the signed-out shell and footer; Your data signed
out; the private request form end to end (a new case, its receipt and the stored row with the code only hashed, reading,
replying, a wrong code, the flag off, new cases paused); a confirmed member's Community tab, the overview, the empty
directory, the profile editor saving a listed profile with a keeper-confirmed main, a profession, an alt and an offer, the
redraw; another member seeing the listing without any Discord id; the crafting search; the standing notice for an
unconfirmed member; a denied identity on Your data but not on Community; every flag off. In `test:all`. Pins .93.

## Worker .94 — the decision journal's birth guard in the first mutation (Codex's review of .88, 1 Oct 07:53 UTC) (1 Oct 2026)

**What changed.** `src/community-contributions.ts` only. Codex's focused controls on .88 moved the database clock a day
past the one-day retention immediately before a ledger write's first mutation: the state change and the void committed
their effect and journaled a decision already expired (`retain_until = actor now + retention` with no future guard). Now:
1. Every decision-bearing write (`setObligationState`, `recordContact` including the member's own acknowledgement,
   `reverseAllocation`, `voidReceipt`, `recordRemoval`) captures its journal deadline (`journalDeadline`: the actor's
   `now` plus the retention in force) BEFORE its batch and passes it to `casMember`, the per-member compare-and-set that
   opens every snapshot write, which requires `?7 > DB_NOW` in that same statement; every later statement depends on
   the nonce that statement stores, so a refused deadline means no effect at all. The decision INSERT (`decision`, and
   the void's per-week INSERT) restates it (`?9 > DB_NOW` / `?8 > DB_NOW`).
2. Classification: each batch ends with `birthProbe` (`SELECT (?deadline > DB_NOW) AS live`). A first mutation that
   changed nothing is `stale` only while the deadline is still ahead of the database clock; otherwise the write throws
   `past_retention` (409 through the existing conflict mapping, for the staff action and for the member's
   acknowledgement alike), the same code the receipt, week and evidence births use. `facts_stale`, `facts_changed` and the
   other outcomes are unchanged; `applyAllocations` (no journal) passes no deadline.
3. Kept as Codex required: prior committed effects, successful own acknowledgements, allocated-credit conservation, the
   live-week relation exception, the selected retention; a journal that expires after a valid commitment is purged
   without undoing the effect.

**Database / config.** None. **Rollout.** With .51-.93. **Rollback.** Redeploy .93. C02 unchanged (no new write path).

**Tests.** `tests/community_contributions_test.cjs` (+9, 123): with a one-day retention and the actor's clock two days
behind the database's, a state change, a void, a reversal and a contact are each refused `past_retention` with the week,
the receipt, the allocation and the contact fact unchanged, no journal row and the member's revision untouched; the
refused batch's FIRST statement is the member compare-and-set carrying `?7 > CAST(strftime(...))`, the journal insert
restates `?9 >`, the probe closes the batch; the paired observation: the actor's clock twelve hours behind with the
deadline still ahead commits `updated`, the journal row's `retain_until` the captured deadline and live; a snapshot that
loses the compare-and-set race with a live deadline is `stale`, never `past_retention`; the ordinary request clock
commits as before. Pins .94.

## Worker .95 — the role writer's budget bounds requests; the sweep's watermark; the backfill's truth (Codex's review of .90, 1 Oct 08:15 UTC) (1 Oct 2026)

**What changed** (Codex's five P-20 groups; `src/discord.ts`, `src/roles.ts`, `src/restore.ts`, `src/backfill.ts`).
1. **Requests, not calls (group 5).** `rest()` takes an optional `AttemptBudget`: its one 429 retry is a request too,
   counted (`attempts`, `retries`) and refused when the run cannot afford it (the 429 becomes the call's failure, recorded
   by the caller; a later run retries), unless the call is a mandatory removal (`removeRole(..., budget, true)`: counted
   whatever is left, never skipped). `CallBudget` now carries `attempts` (requests), `calls` (logical) and `retries`;
   `takeCall` begins a call (one request), `affords(budget, calls)` asks for `reserve(calls) = 2 × calls` requests, so a
   caller reserves a whole account before its first request and no account is half-handled. Receipts
   (`role.budget_exhausted`, `role.sweep`, the sweep's result, the backfill's summary) show all three numbers.
2. **The inventory read is a request (group 3).** `rolesConfigured(env, budget)` charges the guild-roles GET only when it
   is actually made (never while the ten-minute copy is valid: `inventoryCalls(env, budget)` is 0 or 1); a run whose read
   got no answer sets `inventoryFailed` and does not ask again that run (every further grant is `unverified` without a
   request; the next run asks: the failure is still never cached). `grantMemberRole` reserves the inventory read, the
   fresh look, the PUT and the mandatory removal (`GRANT_CALLS = 3` + inventory) before its first request.
3. **The mandatory removal after a ban is reserved and counted (group 4).** Before the PUT the writer requires room for
   the PUT and the removal it may owe (`affords(budget, 2)`); the removal is `takeMandatory` + a mandatory `removeRole`,
   never skipped. `reconcileBanned` and `removeIfBlocked` count their removals the same way.
4. **The sweep's watermark (group 1).** `restore.ts` records the settled promotions its selection covers and advances the
   audit watermark `a` only through promotions whose accounts this run FINISHED (or dropped as no longer eligible); a stop
   (the budget, or a 403 / misconfigured / unverified halt) leaves the unfinished priority accounts' promotions for the
   next run, which takes them first, so a `left_pending` account the member-only rotation never visits is not lost. The
   loop body is `handle(id)`; the rotation cursor and `lastRotationDone` move only after an account is finished, and a
   halt resumes at the last account finished like a budget stop. Per account the sweep reserves
   `1 + GRANT_CALLS + inventoryCalls` calls (8 or 10 requests): with the default 40 and nobody holding the role, ten
   accounts fit when the inventory is warm.
5. **The backfill page (group 2).** `examined` counts accounts actually handled (`selected` the page's rows); a stop (the
   budget, 403, misconfigured, unverified) reports `finished: false` and `next` after the LAST account finished (the
   unfinished one is retried), never a short page as finished; a dry run reserves one request per account, applying
   reserves the whole grant; `calls`/`attempts`/`retries` in the summary.
`restoreMemberRole` (one interaction's grant) stays unbudgeted. Fail-closed configuration, the fresh reads at the effect,
the single Member writer and the blocker guards are unchanged.

**Database / config.** None (`ROLE_CALL_BUDGET = "40"` now bounds requests). **Rollout.** With .51-.94. **Rollback.**
Redeploy .94. C02 unchanged (no new path; `/admin/backfill-roles` answers more fields).

**Tests.** New `tests/role_budget_test.cjs` (20): the REAL `discord.ts` `rest()` behind a stubbed `fetch` with the real
`roles.ts`, `restore.ts` and `backfill.ts`: a 429 retry counted as a request and a retry; a retry the run cannot afford
not made (the 429 is the failure); a mandatory removal retried whatever is left; Codex's scenario (ten members lacking the
role, every route 429 then 200, budget 40): 38 requests = 19 calls + 19 retries, six accounts fully handled, none
half-handled, every request counted, the receipts truthful, the next run finishes the rest; a warm sweep costs one request
per account; the inventory down: one request per run, every grant `unverified`, nothing granted, the next run asks again
and grants; a ban during the PUT: the removal counted (three requests), a grant that cannot afford PUT + removal refused
BEFORE the PUT, and with every route rate-limited once the removal still happens within the eight reserved; the backfill
with budget 16 grants two of five and reports `examined 2`, `finished false`, `next` after the second; a dry run with
budget 4 looks at four; room for the whole short page finishes it. `tests/role_sweep_test.cjs` (+2, budgets restated in
requests: 13 finishes two of three): the budget stops before a `left_pending` priority account and the watermark holds
before its promotion; the next run takes it first. Pins .95.

## Worker .96 — the community frontend, slice 2: the calendar with answers and attendance, the own trial, the own dues (1 Oct 2026)

**What changed.** `public/static/app.js` (one section after the .93 one), `public/static/app.css` (four rules); no Worker code.
1. **The calendar** (`#/community/calendar`, flag `events`, confirmed members): the events of a 31-day window
   (`GET /api/community/events?from&to`, then the cursor), shifted by Earlier/Later, each as a card (title, when in the
   viewer's time zone and the duration, the organizer by display name, the answers with places and roles, the wanted roles,
   the viewer's own answer badge, a note when the start moved after the answer, the viewer's own attendance, the
   cancelled badge, "you organize this" from `canManage`); `cursor_stale` restarts the window; `events_too_large` in
   words. With `attendance` on, "My attendance" (`GET /api/community/attendance/me`, paged) lists what the organizers
   recorded about the viewer.
2. **The event** (`#/community/calendar/<id>`): the card, the answer form (yes / tentative / no, an optional character
   as "First Last", an optional raid role) saved through `PUT /api/community/events/rsvp` with the viewer's answer
   revision (0 for a first answer), and the answers of others (`signups`, paged by the cursor, `cursor_stale` restarts).
   Every refusal in words with the Worker's fresh event redrawn: `stale_revision`, `event_full`, `calendar_full`,
   `event_started`, `event_cancelled` (the form disabled when the event is cancelled or started), `invalid_character`,
   `invalid_raid_role`, `event_not_found`, `events_too_large`; a 403/503 re-reads the context.
3. **My trial** (`#/community/trial`, flag `trials`, `applicantWrite` like the API): `GET /api/community/trial/me`:
   none recorded, or the status badge, the start, the review date, the outcome and reason in words, and what a trial is
   (nothing on the page changes a role).
4. **My dues** (`#/community/dues`, flag `contributions`, `applicantWrite`): `GET /api/community/contributions/me`: the
   policy in words with amounts as gold (`gold()`), the mail reference with the recipient and the note, the ledger's
   open/read-only badge and the incomplete-ledger notice; the weeks table (week, due, asked, paid, the stage in words
   with the evidence state and the new-member exemption, the dated contacts, the next step, and an Acknowledge button
   when `canAcknowledge` names a kind and the ledger is writable) through `POST /api/community/contributions/acknowledge`
   with the ledger revision, redrawn from the returned ledger (`ledger: null, withheld` re-reads; `stale`,
   `already_recorded`, `not_applicable`, `facts_stale` in words; a thrown `past_retention`/409 in words and re-read);
   the payments table (seen, source in words, amount, applied, credit, status/voided) and the credit badge;
   `contributions_disabled` as "not switched on", `contribution_overflow` in words.
5. The overview adds the Calendar, My trial and My dues cards and tabs by flag; the own trial and dues are reachable with
   `applicantWrite` (the standing notice otherwise), the calendar with `confirmedGuildData`.

**Database / config.** None. **Rollout.** With .51-.95. **Rollback.** Redeploy .95. C02 unchanged: no new write path
(the page uses `PUT /api/community/events/rsvp` and `POST /api/community/contributions/acknowledge`, already listed).

**Tests.** `tests/frontend_check.cjs` (+20, 48), against the real Worker: fixtures through the real API (an organizer
schedules three events, cancels one; staff open a trial and a due week with complete evidence; one event moved into the
past by SQL with an attendance row); the overview's new cards and tabs; the calendar card with organizer, places, wanted
roles and the cancelled badge, the past event outside the window, the attendance record; the event page's form, an
answer stored by the Worker (yes, character, healer) and the page redrawn (badge, count, the signups row by display
name); a stale revision refused in words with the fresh state and the stored answer standing; the cancelled event's
closed form; an unknown id; the trial page; the dues page (stage, policy in gold, the mail reference, no payments), the
acknowledgement stored with its journal row and the row redrawn without the button; the ledger mode off (read-only, the
recorded week still shown, no button); events off. Pins .96.

## Worker .97 — the digest's two repairs and the privacy policy's three wording repairs (Codex's review of .91 and .92, 1 Oct 08:40 UTC) (1 Oct 2026)

**What changed.**
1. `src/community-digest.ts`, group 1: the coverage report's freshness test is `exported_at >= DB_NOW - 7 days`: the
   selected baseline is "older than seven days is stale", so an export exactly seven days old is still fresh and one second
   older is stale. Same admitted acquisition, same database-clock `generatedAt`.
2. `src/community-digest.ts`, group 2: a tracked post in a channel the digest has MOVED away from, cleaned up before the
   posting hour, is this invocation's attempt: the successful (or refused) delete settles the state with the day's attempt
   count incremented, the outcome (`cleaned_up` / `refused`), the post untracked, the lease released and an audit row
   (`community.officer_digest_removed` / `_failed`, stage `cleanup`), and the run answers `not_due`; the post follows at the
   hour as the next attempt. Before, the cleanup wrote `posted: null` and released the lease without counting, so a day
   could see four REST calls under a three-attempt cap. The cleanup still happens before the hour and nothing is posted
   early; the compare-and-set, the lease, the tracking and the uncertain-post halt are unchanged. The now unreachable
   post-cleanup `not_due` line is gone.
3. `policies/privacy.html` (regenerated `worker/src/policy-content.ts` in the same commit): R1, the private request form's
   secrecy is the CODE's: the number is plain in the staff pages (their addresses included) and the dated log, and staff
   open a case through their admitted session without the code; "reached only with their code" is scoped to the
   requester. R2, the lifetime paragraph keeps the ledger's stated minimum-accounting exception (an expired payment's
   kind, amount paid, part retired, date and status, and which week, with a week still within its period). R3, the voting
   board shows the Discord display name and, as its picture, the game's class icon, never the Discord picture; the stored
   avatar reference is unchanged and said so.
4. `docs/source-provenance.md` (D5, 08:36): the publication helper set is five Python files plus the pinned JSON reference,
   six files; the six-helper contract is unchanged.

**Database / config.** None. **Rollout.** With .51-.96. **Rollback.** Redeploy .96. C02 unchanged.

**Tests.** `tests/community_digest_test.cjs` (+7, 79): the .91 (3) checks now assert the counted attempt (1, then 2 at
the hour); Codex's four-invocation trace (14:06 moved, delete 429: transient, attempt 1; 14:16 delete ok before the hour:
`not_due`, attempt 2, audited as removed, no lease; 15:06 post: attempt 3; a fourth invocation switched off: `done_today`
by the cap, no delete, the post tracked; the next day cleaned up); an export seven days and one second old is stale and
the source's test reads `>=`. `npm run check:policies` agrees with the regenerated content. Pins .97.

## Worker .98 — the community frontend, slice 3: the organizer's event pages and the staff pages (1 Oct 2026)

**What changed.** `public/static/app.js` (two sections after .96's), `public/static/app.css` (three rules); no Worker code.
1. **The organizer's pages** (`can("organizer")`: SITE_ADMINS or `COMMUNITY_ORGANIZERS` with a confirmed character).
   `#/community/calendar/new`: the event form (title, details, start in the viewer's time zone, duration, places, wanted
   roles) through `POST /api/community/events` with one `opId` per form (a retry replays), then the new event's page.
   `#/community/calendar/<id>/edit`: the same form prefilled, only changed fields sent through
   `POST /api/community/events/update` with the revision; Cancel this event (confirmed) through
   `POST /api/community/events/cancel`; a cancelled or started event is read-only; refusals in words with the fresh event
   redrawn (`stale_revision`, `event_started`, `event_cancelled`, `not_event_organizer`, `capacity_below_signups`,
   `op_conflict`, the invalid-* codes). `#/community/calendar/<id>/attendance`: everyone who answered or was recorded,
   each row a state (present / absent / excused / not recorded) and a note (late / left early), recorded one row at a
   time through `POST /api/community/attendance/record` with the row's revision; the per-row results shown as they are:
   `ok` with the entry, `ok` with `entry: null, withheld: target_unqualified` ("recorded, but this member no longer
   qualifies to be shown"), `stale_revision` (reloaded), `unknown_member`; `event_not_started` and `event_cancelled`
   disable the controls. The calendar shows Schedule an event to organizers; an event's page shows Edit and Attendance
   to whoever `canManage` it.
2. **Admin → Community** (the admin tab appears while any community flag is on; SITE_ADMINS only, the Worker checks every
   call): `#/admin/community` the officer digest's state (on/off, channel, today's outcome and attempts, halted, the
   preview, the seven counts with "off" for a feature that is off) with Resume (confirmed) through
   `POST /api/admin/community/digest/resume`, and the coverage report on demand (`GET /api/admin/community/coverage`:
   the explanation, the limitations, the snapshot, `unavailableReason` in words or the totals and the rows).
   `/trials`: the list by status with Extend (a date, `action: extend`) and Conclude (outcome and reason) through
   `POST /api/admin/community/trials/update` with the revision, and Open a trial (`opId` per form). `/departures`: the
   list by status with Acknowledge and Open a restriction case (category, confirmed) through
   `POST /api/admin/community/departures/update`, and the return review on demand. `/cases`: the cases (filter by
   member) as cards with every action of the API (acknowledge the return with its token, review continued with a date or
   lifted, appeal requested/upheld/overturned, watch the member's characters, renew with a reason, remove a watched
   character) carrying the case's revision token, and Open a case (confirmed; the category's default review and expiry
   prefilled). `/ledger`: one member's ledger with the staff fields and every action (state, contact, removal with an
   optional case id, allocate, void, reverse, a new week, a new payment, evidence) through the staff action route with
   the ledger revision; `ledger: null, withheld` re-reads. `/inbox`: the private requests (open/closed) with the case
   detail and conversation, a status change and an optional reply through `POST /api/admin/community/privacy-requests/update`
   with one operation id per form. `/claims`: the directory's claimed alts and conflicting names with Confirm/Reject
   through `POST /api/admin/community/directory/alt`. Every refusal in words (`stale`, `own_record`, `case_resolved`,
   `not_applicable`, `trial_concluded`, `departure_reviewed`, `operation_conflict`, …) with the list reloaded.

**Database / config.** None. **Rollout.** With .51-.97. **Rollback.** Redeploy .97. C02 unchanged: no new write path
(every path the pages use is an existing `/api/community/*` or `/api/admin/community/*` route).

**Tests.** `tests/frontend_check.cjs` (+32, 80; the DOM shim's `dataset` now also reads `data-*` attributes), against the real Worker: the organizer schedules an event through the
form (the row with details, duration, places, wanted roles, the creator), lands on its page with Edit and Attendance,
renames it (revision advanced), is refused on a stale revision with the fresh event, changes a recorded attendance (the
row's revision, the recorder), sees the not-started notice; a non-organizer gets the organizer notice; the staff: the
digest state and counts, the coverage answer with no export, the trial list and Extend (status extended, the date moved,
the revision advanced), a departure item acknowledged (reviewed by the admin) and the return review, a case opened after
the confirmation dialog with the default dates and the member's character watched by GUID, the member's ledger with a
payment recorded (matched, observed by the admin) and allocated (the week paid), the private inbox with the case, a
status change and a staff reply stored, the claimed alt confirmed; a member who is not an admin never reaches the admin
pages. Pins .98.

## Worker .99 — a member lookup Discord did not answer is unfinished, never passed (Codex's review of .95, 1 Oct 09:15 UTC) (1 Oct 2026)

**What changed.**
1. `src/restore.ts`: a member lookup that Discord did not answer (403, 500, a network error) leaves the account UNFINISHED:
   it is recorded in `failed` as before, but it is not `done`, so the promotion watermark holds before its promotion and
   the rotation cursor never passes it (`rotationHeld`); the next run reaches it first. After `LOOKUP_FAILURES_PER_RUN`
   (2) unanswered lookups in one run the sweep stops (Discord is not answering), with everything from the first unfinished
   account retried next run. A 404 stays a definitive answer (absent, finished). `SweepResult.unfinished` and the
   `role.sweep` audit's `unfinished` count name them.
2. `src/backfill.ts`: a lookup Discord did not answer stops the page at that account with the note "Discord did not answer
   a member lookup (status); run the page again from the cursor once it does": `examined` counts the finished accounts
   only, `finished: false`, `next` continues AT the unanswered account (the cursor is the last finished one). A page of
   failures is never a finished page. A 404 stays finished (not in the server).
3. `README.md` (D1, 09:23): the own copy holds "no separately collected records belonging to other accounts (their own
   labels, free text and reference context may name people, as they wrote them)" instead of "nothing about anyone else".

**Database / config.** None. **Rollout.** With .51-.98. **Rollback.** Redeploy .98. C02 unchanged.

**Tests.** `tests/role_sweep_test.cjs` (+3, 57): three `left_pending` promotions whose lookups answer 500: two attempted,
the run stops at the second, nobody checked or granted, the watermark unchanged; once Discord answers the next run takes
them first and restores all three; a 404 stays absent. `tests/role_budget_test.cjs` (+3, 24): the second account's lookup
answers 500: the page stops there with one examined and granted, `next` at the unanswered account, the note; every lookup
unanswered: nothing examined, the same page next; the continuation finishes the rest. Pins .99.

## Worker .100 — the eight .93 frontend repairs (Codex's review of .93, 1 Oct 09:23 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js`, `public/static/app.css`; no Worker code.
1. **F1, a lost answer.** The private request form's new case and reply freeze the exact body of a request whose answer
   was lost (the network failed, or no readable answer) and lock the fields: the only actions are "Retry the same request /
   reply" (the frozen bytes, which the Worker answers with the original if it was stored) and "Check whether it was
   stored" / "Re-read the case". Nothing is edited, regenerated or re-sent on its own while the outcome is unknown; a
   `case_not_found` on the check unlocks the form (the ids stay); a definitive refusal unlocks it with the reason. The reply
   draft is kept across a re-read with a note to check whether it already arrived.
2. **F2, the conflict wording.** `case_conflict` says what is true: "A different case already holds this number. If you
   just sent this request and the answer was lost, check it with your number and code; otherwise reload the page for a
   fresh number." No regeneration while the outcome is uncertain.
3. **F3, the committed acknowledgement and stale payloads.** A sent reply clears its textarea and is acknowledged on a
   line outside the conversation ("Your reply was sent at …") that survives a later refused or empty read; a fresh read that
   finds nothing (`case_not_found`: expired, or the number and code no longer match) clears the old conversation and says
   the case is no longer available on this page; a read refused for another reason replaces a shown conversation with the
   reason.
4. **F4, a stale profile.** `409 stale_revision` with the current profile is explained with that version (main, listed,
   alts, professions); the draft is kept in the form; Save again applies it over the current revision deliberately;
   "Reload and discard my draft" shows the current version. No silent overwrite or discard.
5. **F5, the shell follows the fresh context.** `refreshCommunity()` re-renders once when the capabilities or flags
   changed (an unchanged context redraws nothing, so a refusal cannot loop); the Community tab needs the fresh
   `applicantWrite`; the standing notice says the access ended and why, with "reload to see your current state".
6. **F6, the crafting continuation** is bound to the query that produced its cursor: a changed filter restarts the search
   (said in a toast) instead of sending an old cursor under new fields.
7. **F7, narrow screens.** The themed field style covers password and date inputs; long plaque headings, case values and
   message bodies wrap (`overflow-wrap: anywhere`).
8. **F8, accessible names.** The profession and offer-profession selects carry `aria-label`s, the skill input is "Skill
   level", and every removal names what it removes ("Remove this profession / alt / offer").

**Database / config.** None. **Rollout.** With .51-.99. **Rollback.** Redeploy .99. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+10, 90; the harness can drop the Worker's answer to a request after it was
handled): a reply whose answer was lost shows the notice with the textarea locked while the Worker stored it once;
retrying the same reply is answered with the original (one message), the textarea cleared, the acknowledgement kept; the
conflict wording; a read that finds nothing clears the conversation and keeps the acknowledgement; the profile's
accessible names; a stale revision explained with the draft kept and nothing saved, then applied deliberately; a 403
re-reads the context once and the shell follows (no Community tab, the access-ended notice); the crafting continuation
binding; the stylesheet rules. Pins .100.

## Worker .101 — accessible names on every control of the organizer and staff pages (1 Oct 2026)

**What changed.** `public/static/app.js` only: the F8 rule of .100 applied to the .98 pages before it is asked for. Every
select or input that has no visible label of its own (the status filters, the per-row selects of the attendance, trials,
departures, cases and ledger tables, the member filters) carries an `aria-label` (`named(el, label)`); controls inside a
`fieldBox` or a `<label>` already had theirs. No behaviour change.

**Database / config.** None. **Rollout.** With .51-.100. **Rollback.** Redeploy .100. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+7, 97): on each staff page (trials, departures, cases, inbox, claims, the ledger
with a member loaded) and on the organizer's attendance page, no select, input or textarea is without a label or an
accessible name. Pins .101.

## Worker .102 — the three .96 repairs (Codex's review of .96, 1 Oct 10:00 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js`, `public/static/app.css`; no Worker code.
1. **F96-1, the calendar's windows.** Every load captures the window it asks for and a generation number; a reply that
   arrives after Earlier or Later replaced it is discarded (rows, cursor, status and the Show more state untouched), so
   overlapping replies never mix windows or duplicate rows. The initial own-attendance panel and the `cursor_stale`
   restart are unchanged.
2. **F96-2, the committed acknowledgement.** When the Worker answers `recorded` (the INSERT committed) with
   `ledger: null, withheld: reader_refused`, the page keeps a durable, non-private receipt OUTSIDE the ledger holder
   ("Recorded. Your acknowledgement for the week of … was saved; the ledger could not be re-read afterwards (…), so your
   weeks are not shown below; the acknowledgement stands") with a Dismiss button; the fresh read's refusal still clears
   the private weeks and payments; the receipt is a bar on the document (like the reload notice), so the shell's redraw
   for the changed context does not remove it; a navigation does. "Recorded" is shown only when the result is
   `recorded`; a toast alone no longer carries the outcome.
3. **F96-3, narrow screens.** Frames, cards, stacks, grid children and the plaque's children may shrink (`min-width: 0`),
   the plaque's control row wraps (and stacks under 480 px), the key/value lists shrink their first column, and a wide
   table scrolls inside its wrapper instead of widening the page. Official artwork and keyboard access unchanged.

**Database / config.** None. **Rollout.** With .51-.101. **Rollback.** Redeploy .101. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+6, 103; the harness can delay a request before the Worker sees it and act
between the batches of one request): Earlier with a slow reply then Later: the current window's rows once each, its
range, no stale status; a second due week acknowledged with the member denied after the write and before the re-read:
the Worker answers recorded with the ledger withheld, the receipt stays while the private payload is cleared, Dismiss
removes it; the stylesheet rules. Pins .102.

## Worker .103 — the lost-answer rule for every id-keyed operation of the organizer and staff pages (1 Oct 2026)

**What changed.** `public/static/app.js` only: the F1 rule of .100 (an operation whose answer was lost freezes its exact
payload and allows only "retry the same" or a check) now covers the four operations that carry an id the form made once:
scheduling an event (`opId`, which is the event's id), opening a trial (`opId`), opening a case (`caseId`), updating a
private case (`messageId`). One helper, `lostAnswer({pending, lock, retry, check, what})`, locks the form and offers
"Retry the same" (the frozen bytes; the Worker answers a stored operation with its original result or `replay`, never
doubling) and, where a stored result can be looked for, "Check whether it was stored" (the event by its id; the trial in
the list; the case under its member); an absent result unlocks the form with the same id; a definitive refusal unlocks it
with the reason. The private-case update offers the retry only (a status-only operation leaves no message to look for).

**Database / config.** None. **Rollout.** With .51-.102. **Rollback.** Redeploy .102. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+5, 108): scheduling an event with the answer dropped after the Worker stored it:
the notice, the form locked, one row; Retry the same is answered with the original and the page moves to the event; a
private case created through the public route; updating it with the answer dropped: the retry-only notice, the controls
locked, one staff message; Retry the same gives one message and the status. Pins .103.

## Worker .104 — the three .100 repairs (Codex's review of .100, 1 Oct 10:37 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js` only.
1. **F100-1, an unreadable successful answer is an unknown outcome.** `api()` reads the body as text: a 2xx whose body is
   present but not JSON throws `unreadable_answer` (an empty 2xx body stays `null` for the endpoints that mean it);
   `uncertain()` counts that code as a lost answer. Every mutation validates its receipt BEFORE any state changes: the new
   case (the receipt's `caseId` is the form's), the reply (`messageId` and `at`), the RSVP (`event`), the acknowledgement
   (`result.status`), the attendance record (`results`), the profile save (`profile`), and the id-keyed forms of .103
   (an object; the inbox update's `status`). A reply whose receipt cannot be read keeps its text, its message id and its
   locked state, so "Retry the same reply" is the same message, never a second one; an RSVP, an acknowledgement or an
   attendance record with a lost answer re-reads and shows what was recorded instead of guessing; a profile save with a
   lost answer re-reads the current version and keeps the draft.
2. **F100-2, the ordinary re-read keeps the waiting reply.** The existing-case panel holds at most ONE reply waiting for a
   lost answer, for its own case only (number, code, message id and text, in memory). Every re-read of that case, by the
   pending button or by the ordinary "Open the case", restores it as the same locked operation with the same message id;
   when the stored messages already show the reply, the notice says so and offers only Discard (no resend); opening
   another case never carries it over and names it as kept for its own case, with a Discard; a sent or discarded reply
   releases it. The `draft`/`keepDraft` mechanism of .100 is replaced by this.
3. **F100-3, a late crafting reply is discarded.** The crafting search carries a generation like the calendar of .102: a
   reply (first page or continuation) that completes after a newer search is discarded entirely; the changed-filter
   restart and the bounded `cursor_stale` restart are as before.

**Database / config.** None. **Rollout.** With .51-.103. **Rollback.** Redeploy .103. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+6, 114; the harness can now replace the Worker's answer by an unreadable 200 page
after the Worker handled the request): a reply stored by the Worker but answered unreadably: the notice, the text kept
and locked, one stored message, no acknowledgement; the ordinary re-read restores the waiting reply, sees it in the
messages and offers Discard only; opening another case names the waiting reply as kept for its own case and the other
number as not found; back in its case the reply is still there; Discard clears it and the one message stays; a
superseded crafting search's late reply is discarded. Pins .104.

## Worker .105 — two inherited wordings (Codex's acceptance of the .96 core positives, 1 Oct 10:48 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js` only. The application form's consent sentence now says the voting board shows
"your Discord display name with the game's class icon as its picture (the site shows the game's own icons, never your
Discord picture)"; the consent scope and the private fields are unchanged (the stored Discord avatar reference is not
displayed since .86). The admin overview's CSV paragraph names the six core record families the files hold
(applications, board votes, write-ins, friends, reserved names, accounts) and says that the community modules, a member's
own copy and the private request cases are not in them, instead of "everything the site holds". No DTO, access or export
change.

**Database / config.** None. **Rollout.** With .51-.104. **Rollback.** Redeploy .104. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+2, 116): the two sentences as shipped. Pins .105.

## Worker .106 — Codex's five .98 repair items (the .98 counter-review, 1 Oct 11:26 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js` and the harness only. (1) The organizer's attendance page: when the Worker answers a
recorded entry with `result: "ok", entry: null, withheld: "target_unqualified"` (the organizer's own INSERT committed; the
payload read that follows it in the same batch no longer found the member, .67), the member's row leaves the page (name,
answer, state and note are the protected details the Worker withheld) and the organizer keeps a receipt of their own write
on the document (`.receipt-bar`, dismissible, without the member's name); `unknown_member` (nothing written) also removes the
row, with a toast. The emptied list says "No member who can be shown is on this list." (2) The staff ledger: a committed
action whose re-read was withheld (`ledger: null, withheld`) keeps a durable, dismissible receipt outside the view naming
the recorded action and why the ledger is not shown; the view is cleared by the refused reload; no undo, nothing the Worker
did not answer. The `.102` dues receipt now goes through the same `receiptBar(lead, text)` helper with its exact wording;
`WITHHELD_WORDS` puts the `withheld` codes into words (reader_refused, contribution_overflow, target_unqualified). (3) An
explicit attendance state `unknown` reads "unknown"; the blank choice keeps the select's placeholder "not recorded" (the
member's own attendance page shows "unknown" for an explicit record too). (4) A stale edit or cancel of an event is
explained in the organizer's words (`ORGANIZER_STALE`: another organizer edited or cancelled it, or its answers moved on;
apply the change again), never with the member's RSVP guidance; the shared code keeps the member wording in
`COMMUNITY_ERRORS`. (5) The four staff list loaders (trials, departures, cases, claims) bind every load to a generation:
a late reply to a filter or continuation the staff member has left writes no row, cursor, status or button state (the
.102 F96-1 and .104 F100-3 rule applied to the staff lists). No DTO, access, admission, retention or Worker change.

**Database / config.** None. **Rollout.** With .51-.105. **Rollback.** Redeploy .105. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+9, 125): the D1 shim gains `HOOKS.afterStatement(sql, j)` (act between two
statements of one batch) and passes the statements' SQL to `HOOKS.afterBatch`; (1) through the real Worker: the member
denied after the organizer's INSERT and before the payload read, the row gone, the receipt without the name; (2) the staff
session's version bumped after the receipt write and before the re-read, the durable receipt, the cleared view, Dismiss;
(3) the two labels differ; (4) the organizer wording, not "answer again"; (5) a slowed `status=extended` reply discarded
after the filter moved to `passed`, and the four guards present. Pins .106.

## Worker .107 — Codex's five .104 groups (the .104 counter-review, 1 Oct 11:32 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js` and the harness only. (1) Every receipt is checked against its endpoint's
minimal identity before anything is shown as done or a frozen operation is cleared: the requester's "Check whether it
was stored" needs a read of THIS case in the read route's shape (`caseId` equal, `status`, `createdAt`,
`retentionDeadline` strings, `messages` an array) before it makes a receipt; the requester's own case read needs the
same `caseId` and a `messages` array; the event creation needs `event.id` equal to the form's `opId`; the RSVP needs
`event.id` equal to the event answered; the trial creation needs `trial.id` equal to the form's `opId`; the restriction
case creation needs `case.caseId` equal to the form's `caseId`; the staff case update needs `ok: true` and the status it
asked for. An empty object, an array or another record's identity in a 200 is an unknown outcome: the frozen payload and
Retry stay. Endpoints whose success is intentionally empty keep their contract. (2) `arrived()` matches the pending
reply by its `messageId` (the read DTO exposes it), never by text: an older message with the same words is not this
reply. (3) One waiting reply at a time, and it belongs to its case: while another case's reply waits for a lost answer,
a write to the open case is refused in words (nothing sent); the panel's `setPending(null, ownId)` clears only the
operation with that message id, so another conversation's success, refusal or discard never clears it. (4) The
requester's case read is bound to a generation: a late success or refusal of a read the inputs no longer name writes no
thread, status, error or button state. (5) The crafting search advances its generation before the empty-query return,
so a late reply to the earlier search writes nothing after the filters were emptied; the empty query hides Show more
and forgets the continuation's filters. No DTO, access, admission, retention or Worker change; the case code stays in
memory and bound to its case.

**Database / config.** None. **Rollout.** With .51-.106. **Rollback.** Redeploy .106. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+18, 143). The page sandbox gains `page.answer(fn)` (a readable but wrong 200
JSON after the Worker handled the request) and `page.before(fn)` (the request fails before the Worker sees it). Through
the real Worker: two cases; an identical-text reply lost before the Worker is not "arrived" and Retry stores it; A's
reply waiting while B is open, a write to B refused and A still held, B sent after Discard; A's slow re-read discarded
after B's read; the stored-check given `{}` and another case's well-formed read makes no receipt, the real read does;
trial and case creations retried into `{}` and `[]` keep Retry, the real retry replays one row; a slow crafting reply
discarded after an empty query. Mutation controls: twelve one-repair mutants of the .106/.107 script (each repair undone
alone) are each caught by that repair's own check. Pins .107.

## Worker .108 — Codex's .105 handoff as refined at 12:11 (six items) and the receipt siblings (1 Oct 2026)

**What changed.** `public/static/app.js` and the harness only; no Worker, DTO, snapshot, access, admission, ownership or
retention change. Codex's .105 counter-review (12:04) as narrowed at 12:11 (the case filter is already .106's and is not
repaired again):
1. **Staff inbox, selected detail.** `openCase` is bound to a detail generation: a late detail of a case opened earlier
   is discarded; the detail must be the case asked for (`caseId` equal, `messages` an array).
2. **Staff inbox, refreshed list.** `load` is bound to a list generation and retires any detail still being read; a late
   list reply is discarded.
3. **Staff ledger, selected member.** Every read is bound to a generation and the member it was made for; the view and
   its actions carry that member (`drawLedger(sub)`, `drawnFor`), never the mutable input; an action's answer is drawn
   only while the page still shows the read it was made from.
4. **Trial creation id lifecycle.** The form's `opId` is retired after a valid receipt or a stored reconciliation
   ("It was stored."); an unknown outcome keeps it and its frozen body exactly; an `op_conflict` on a staff page reads as
   a trial ("A different trial was already opened under this form's id").
5. **Restriction case creation id lifecycle.** The same for `caseId`.
6. **A partial trial page is never absence proof.** The stored-check follows `nextCursor` through every page (up to 50);
   a page that cannot be read leaves the outcome unknown, Retry and Check stay. The restriction case check (Codex's
   source-only candidate) follows the member's continuation the same way.
Source-only siblings Codex named, inspected and tightened: the claims decision needs `claim.ref`/`claim.key` equal; the
restriction actions need `ok: true` and `case.caseId` equal; the organizer check needs `event.id` equal to the form's
`opId`; the event change and cancellation need `event.id` equal before "Saved."/"Cancelled.", and a lost answer re-reads
the event and says so (the old revision refuses a repeat). Of the same pattern: the trial extend/conclude receipts need
`trial.id` equal, the departure receipts the item's id (and a `restrictionCaseId` for an opened case); every
revision-keyed staff action whose answer is lost re-reads its list (`LOST_REREAD`). Valid null-withheld receipts are
kept: an event route's committed answer with `event: null` and `hydration` refused/too_large (create, RSVP, change,
cancel) is a receipt bar, never a lost answer; the new-event form is then spent, with a link to the event. From my own
self-review, in the inbox function this build rewrites: ONE staff update whose answer was lost is kept for its case
across a refreshed list and a re-opened case (the same locked operation, its text, Retry), named as held when another
case is open, and an update to another case is refused until it is retried or discarded.

**Database / config.** None. **Rollout.** With .51-.107. **Rollback.** Redeploy .107. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+18, 161), through the real Worker: two trials and two restriction cases from one
page visit; a lost trial behind 100 open trials due sooner (the continuation failed: unknown; then found on page two); a
restriction action answered with `{}`: re-read, applied once; the inbox's slow detail of the first-opened case discarded
after a second Open, and after a refresh to the closed list; B's waiting update held while A is open, an update to A
refused, B restored and retried once; the ledger's slow read of the member the page has left discarded; a committed event
whose re-read is refused (the organizer's session version bumped between the batches) shown as stored; a lost event
change re-read with its new revision. Mutation controls: eleven one-repair mutants of the .108 script are each caught by
that repair's own check (two checks were tightened until they were). Pins .108.

## Worker .109 — Codex's acknowledgement item (12:25 UTC) and the rest of my self-review (1 Oct 2026)

**What changed.** `public/static/app.js`, `public/static/app.css` and the harness only; no Worker, DTO, access, admission or
retention change.

*Codex, 12:25:* the requester page's reply acknowledgement names its case ("Your reply to case <number> was sent at …"),
so B's acknowledgement never reads as A's while A is open; it still survives a later read (the .100 F3 rule).

*My self-review of .98-.105 (six dimensions; every finding upheld by at least two of three independent refuters; the
ones Codex had not already asked for, after .107/.108 took theirs):*
- **Wording.** Staff refusals a normal path reaches: `trial_open_exists`, `account_deleted`, `case_not_found` (staff
  wording; the requester keeps theirs), the watch-list's `renewal_required`, `too_many_characters`, `no_period`,
  `character_not_found`, `binding_changed`, and the claims' `claim_not_found`, `profile_not_found`. The profile editor's
  `invalid_main`, `invalid_alts`, `invalid_professions`, `invalid_crafts`, `invalid_listed` (a duplicate, or the main
  listed as an alt). A case gone (404) re-reads the cases list.
- **The ledger.** The payment form no longer offers "unmatched": the ledger refuses an unmatched payment with a member,
  and this form always names the member. The three forms (week, payment, evidence) keep their values for the member
  drawn across redraws, and what was SENT is kept when its answer is lost (`LOST_LEDGER`), so the same values can be sent
  again: a stored payment or week is answered, never doubled.
- **The new-event form** stays marked unsaved while a lost answer waits (`onSave` returns "pending"), so the leave guard
  holds; every navigation on a stored event clears the mark first.
- **Names.** A dialog is named by its own heading (`aria-labelledby`); the trials form's member field is named by its
  visible label only; the selects that must always hold a value (the inbox filter and status, the ledger's week state,
  source, payment status and evidence) offer no empty choice (`selectOf(..., { placeholder: null })`).
- **Layout.** A card head wraps its badges under the title on a narrow screen; the reload notice and the receipt bar
  stack (`stackBars`) instead of covering each other.

**Database / config.** None. **Rollout.** With .51-.108. **Rollback.** Redeploy .108. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+15, 176), through the real Worker where a behavior exists: B's acknowledgement
labelled while A is open; the dialog's name; the member field's name; an open trial refused in words; the staff words
present; the inbox filter's two choices; the profile editor's duplicate refused in words; the payment form's three
statuses; a lost payment re-read with its values kept and replayed once; the event form unsaved while a lost answer
waits; Check answering absent (the form unlocked, nothing stored) and the resend stored once with no leave prompt; a
stale attendance row refused; the stacking and the narrow card head. Mutation controls: eleven one-repair mutants of
the .109 script are each caught by that repair's own check (one check was tightened until it was). Pins .109.

## Worker .110 — Codex's one draft-state item on .109 (1 Oct 12:57 UTC) (1 Oct 2026)

**What changed.** `public/static/app.js` and the harness only. A staff ledger action now clears only the drafts of the
member it was made for (`draftsFor0`, the member drawn when the action started): if the page has meanwhile moved to
another member, that member's drafts are theirs and stay. Before, a late successful answer for member A deleted the
same draft keys from member B's drafts (the clearing ran before the read-generation guard), so B's typed values were
lost at B's next redraw. The durable receipt, the redraw guard and the resend contract are unchanged; no DTO change.

**Database / config.** None. **Rollout.** With .51-.109. **Rollback.** Redeploy .109. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+1, 177): the page sandbox gains `page.hold(fn)` (the Worker's completed answer
held before the page sees it). A's payment completed and held, the page moved to B and B's source id typed, A's answer
released, B redrawn: B's source id survives; A's payment is stored once. Pins .110.

## Worker .111 — the Olympus crest returns as the website's one non-game image (the owner, 1 Oct 2026) (1 Oct 2026)

**What changed.** the owner's decision in the Claude Code session (1 Oct 2026, about 13:25 UTC): guild.roachcouncil.com is the
guide for the website's look, with its logo; asked whether the crest conflicts with "only official World of Warcraft
assets", he chose "the crest is the exception": everything else stays the official client set.
1. `public/static/olympus-icon.png` is restored byte for byte from the .46 baseline: the 250x250 crest live on
   guild.roachcouncil.com (sha256 `867aafaa300e9f83479504b1d7c91478e4099bcc52d3e3a0172b8b55a1784d66`).
2. The brand (top bar and footer, `brand()` in `app.js`) and the tab icons (`site.ts`, the rank planner's page in
   `site-ranks.ts`) use it again, in place of the client banner icon `wow/icon-friends.png` (which stays in use as an
   in-page icon).
3. The footer says the crest is the guild's own logo and that all other interface artwork and icons come from the game
   client and are Blizzard's; the no-script sentence names the crest. The terms are unchanged (they say the site uses
   client artwork, not that it uses nothing else). README and design.md record the exception.
4. Account pictures stay class icons or the Member icon (no Discord pictures): the exception is the crest only.
A local side-by-side with guild.roachcouncil.com (the live .46, signed out; the current pages signed in through a local
preview of the real Worker) found the same layout, frames, fonts and art; the crest was the visible difference.

**Publication gate.** `scripts/official_asset_reference.json` lists the crest's hash among the banned website art and
the gate scans runtime references, so publication needs Codex's reviewed reference successor recording this one
owner-approved exception (with the fixed-file successor already needed for `app.js`, `site-ranks.ts` and the rank
planner). Nothing is recalculated here.

**Database / config.** None. **Rollout.** With .51-.110. **Rollback.** Redeploy .110 (the client banner icon returns).
C02 unchanged.

**Tests.** `site_test.cjs`: the tab icon and brand are the crest, the file is the live 250x250 one by sha256, and it is
the only image outside `public/static/wow/`; account pictures still never load from Discord. `test:all` green. Pins .111.

## Worker .112 — the official-assets audit (the owner's rule: official World of Warcraft assets only, the crest the one exception) (1 Oct 2026)

**What changed.** An independent audit of the site against the owner's rule (six angles: every runtime image name resolved
against `wow/`; the files against the pinned reference and the provenance; foreign or generated art and the CSP;
pictographs used as icons; the server-rendered pages; the publication gate's scan; each finding tested by three
refuters, then a completeness critic). All 94 official files match the reference; every image the site requests exists
in `wow/` (or is the crest). The confirmed findings, fixed with the existing official set:
1. The site CSP (`site-core.ts`) takes images from this site only: `img-src 'self'` (no `data:` images, no Discord
   pictures; nothing drew them since .86, the policy still allowed them). `site.ts` comment and CLAUDE.md follow.
2. The page's image helper `h()` sets an `img` `src` only for a root-relative path; links keep fragment, root-relative
   or `https:`. CLAUDE.md follows.
3. Typed names (people entered by name, not accounts) and the picker's add-by-name row show the official scroll icon
   (`wow/icon-names.png`, INV_Scroll_03) instead of a letter badge and the pencil glyph "✎".
4. The admin back links read "Back to all applications" / "Back to all roles" (no "←" glyph).
5. The rank planner's remove buttons and its two dialog close buttons wear the client's close button
   (`wow/close-up/-highlight/-down.png`, as the main site's `.x`); its move buttons say "Up" and "Down" (no arrow art
   exists in the official set).
Not changed, deliberately: the dropdown chevron drawn by CSS on `select` (the same styling as guild.roachcouncil.com,
not an image file), the browser's own disclosure triangle on `details` and its date-picker button (user-agent controls,
not shipped art). Each could use real client art (UI-ScrollBar-ScrollDownButton, UI-PlusButton/UI-MinusButton) once it is
extracted through the reviewed extractor: that extraction, and the provenance record's crest flag
(`asset-provenance.json` still says no custom crest ships), belong to Codex's reference successor.

**Database / config.** None. **Rollout.** With .51-.111. **Rollback.** Redeploy .111. C02 unchanged.

**Tests.** `tests/frontend_check.cjs` (+5, 182): no pictograph as the face of a control or badge in the page script, the
rank planner script or its page; the rank planner's close-button art and word labels; the CSP; every image the member's
home draws comes from `wow/` or is the crest; the image helper's rule and the scroll icon. The .111 page script fails the
glyph and helper checks. Pins .112.

## Worker .113 — the #classes-and-builds guide's add-on line made supported (Codex, 1 Oct 2026 17:24 UTC) (1 Oct 2026)

**What changed.** Codex's review of the Discord channels in the normal client found that the pinned guide for
#classes-and-builds (`src/intros.ts`) still said "Blizzard hasn't published Forever's add-on policy", the unsupported
claim .52 removed from #olympus-info. Its add-on line now gives the same guidance as #olympus-info: use the guild's
reviewed release for officer verification, check compatibility before installing other add-ons, never install an
executable or add-on from an unknown source, and follow Blizzard's add-on rules and the release instructions. The
forum's own rule stays: no download links from unknown sites; staff will add a checked list here.

**Database / config.** None. **Rollout.** With .51-.112; the new text reaches Discord only when an officer runs
`/olympus-intros refresh` after the deploy. **Rollback.** Redeploy .112. C02 unchanged.

**Tests.** `tests/intros_test.cjs`: no guide may claim an unpublished add-on policy, and #classes-and-builds must give
the reviewed-release guidance; the .112 sentence fails it. Pins .113.

## Cutover gate 6 settled: `VERIFY_OPEN_SINCE` (1 Oct 2026)

The reviewed cutover profile still carried the `VERIFY_OPEN_SINCE` placeholder (`2026-09-25`, the .32 baseline) that gate 6
says to replace before deploying it; with it, every unverified member of the preferred server would have been offered for
removal as soon as the cutover landed, including people who could only verify once the bot serves Asmongold's server.
Claude Code found it after a first, provisional local `--apply` (19:53:59 UTC), which was never committed, pushed or
deployed; its marker and live file are preserved byte for byte outside the repository
(`Olympus/consolidation-2026-09-30/claude-review/superseded-provisional-cutover-20261001T195359Z`). Codex chose (20:09 UTC):
`VERIFY_OPEN_SINCE = "2026-10-02"`, the day after the planned 1 October opening; `UNVERIFIED_GRACE_DAYS` stays 3 and the
offers stay officer suggestions. The pre-cutover pair now differs in 18 keys, and `scripts/cutover-config.sh` and its test
expect exactly those; the activation allowlist is unchanged. The cutover is applied once, from this profile, in its own
commit. If the opening slips past 2 October, the date is re-reviewed forward before the deploy.

## `VERIFY_OPEN_SINCE` moves forward after the cutover (1 Oct 2026)

The cutover (applied 20:36:18 UTC, deployed 21:40 UTC) left gate 6's "re-reviewed forward" without a path: the marker
refuses a second `--apply`, and `--activate` accepted only the seven community keys. Claude Code found it while preparing
the first activation; Codex asked for the minimal extension (23:14 UTC). `scripts/cutover-config.sh --activate` now also
accepts `VERIFY_OPEN_SINCE`, the eighth activation key, but only forward: when it is among the changed keys, the profile
must hold exactly one `VERIFY_OPEN_SINCE = "YYYY-MM-DD"` line naming a real calendar day (Gregorian leap years) strictly
later than the live one, and the live value must itself be such a day. An earlier, equal, empty, removed, doubled,
differently quoted, malformed or impossible date is refused before anything is written; an activation that leaves the date
alone is not affected. The marker grammar, the cutover's own record, `--apply`, `--check` and the 18 pre-cutover keys are
unchanged; `scripts/tests/cutover-config.test.sh` covers the refusals (each without a write), existing leap days, a
date-only move, a move beside a community key and an untouched non-calendar date. No Worker file changed (BUILD stays
.113). The date itself moves to `2026-10-09` by its own reviewed activation (`docs/launch-runbook.md` step 4).

## Launch completed: cutover, E2, E3 and E4 live (1-2 Oct 2026)

No build and no Worker file changed; this section records the configuration deploys that followed the cutover, all of
build .113 (one bundle, `index.js` `1c417f22...`). Each was a keeper commit through `scripts/cutover-config.sh
--activate` (one appended marker record), carried by protected pull request to the public `main`, green push CI, both
agents' source signatures, a frozen pre-upload proof (live metadata, committed dry-run), one `deploy-commit.sh` upload
and a frozen readback, with both agents' operating signatures:

- E2, the protective opening date: keeper `a76b3ee6`, `main` `5ebf756c` (PR #6), version `9827ab10`, 2 Oct 02:42 UTC.
  `VERIFY_OPEN_SINCE` 2026-10-09; nobody first seen before then is offered for removal before 12 October.
- E3, the first activation: keeper `bc2ec08f`, `main` `fc21f343` (PR #7), version `fdf41b8f`, 04:10 UTC. The nine
  community features, the dues ledger (90 days), privacy-case retention 30 days, the officer digest; the intake closed.
- E4, the second activation: keeper `9e2628f9`, `main` `364c5620` (PR #8), version `a18a10aa`, 05:01 UTC. The private
  request form accepts new cases; the site administrator reviews the inbox each working day.

The marker `worker/wrangler.cutover.applied` holds the cutover record and these three activation records. Rollback never
selects a version carrying the old, invalidated bot token (`319a1cd0`, `9357088f` or earlier) nor `1e009521` (the date
back at 2 October); the earlier versions of the rotated chain, `fdf41b8f` and `9827ab10`, are the only rollback
candidates. The full record, the Discord-side steps and the observations still open before the launch counts as
accepted are in `docs/launch-runbook.md` section 7.

## Worker .114 — the owner's requests of 2 Oct 2026 (header picture, footer, Battle.net switch, search names, rank planner, beta reset, forced renames, the I-X leadership directory) (2 Oct 2026)

the owner's ten items of 2 Oct about 17:25 UTC, with the answers he gave through Codex (log 17:42, 17:57 and 18:26 UTC) and
Codex's provisional source review (18:47 UTC), built on keeper 06d39950 (live: .113, Cloudflare a18a10aa).

**What changed, for members.**
- **The top bar shows your own Discord picture again** next to your name and Sign out (`app.js ownAvatar`). Only an avatar
  address on Discord's picture host passes (a profile picture, a server picture or Discord's default one, exactly the
  addresses the Worker's `avatarUrl` produces); anything else, or a picture that fails to load, shows the official Member
  icon. The page's CSP adds `https://cdn.discordapp.com` to `img-src` and nothing else. The other eight account pictures
  stay game class icons. The footer says whose picture it is; the privacy policy says your browser loads it from Discord.
- **The footer's policy links are for signed-in members.** Signed out, the footer keeps only "Private request" (the form is
  for people who can no longer sign in with Discord). `/privacy` and `/terms` are unchanged and keep serving, so the Discord
  application's links still work.
- **People search shows every differing name**: the server nickname, the display name, then the @username
  (`site-core.ts shownName`; e.g. "Fern · Fernmelder (@fernmelder)"). Until .114 a nickname hid a different display name.
  Display only, in the pickers and the admin lookup search: the label a pick stores (`labelOf`) keeps its format.
- **Battle.net sign-in is switched off** (`src/bnet-switch.ts`). The three routes (`/linked-role`, `/oauth/callback`,
  `/bnet/link`) answer a short "switched off" page before any audit row, cookie, redirect or token exchange; the bind
  writes the BattleTag only while the admin's setting is on inside the write itself, and reads the switch again before
  Discord's record is touched and again between its DELETE and PUT (a row written just before a switch-off is taken back;
  no cross-service atomicity is claimed).
  `/verify-status` and the ban card say nothing about keeping a link while it is off. The 29-day purge of what earlier
  links stored keeps running from the cron, unconditionally (Codex measured 264 member rows with older link fields on
  2 Oct, log 19:12 UTC).
- **The rank planner** (/admin/ranks) wears the site's dark look: rock background, the game's gold, dialog and tooltip
  frames, the red panel buttons, always dark, and the crest in its masthead instead of the friends icon. Colours, frames and
  backgrounds only; the model and the catalogue are untouched.
- **Community → Leadership**: the Guild Master and officers of Olympus I to Olympus X, as the site's administrators list
  them, for confirmed members (`confirmedGuildData`, read behind the community reader boundary `admittedRead`, so standing
  lost before the read returns nothing), all ten empty at first. A listing is a record only: nothing reads it for any
  permission. It links #council-info of the private Olympus I-X Council Codex created in Discord.
- **Renames Blizzard required.** Admin → Renames lists the roster's renames (`roster.renamed`, last 120 days). Marking one as
  required by Blizzard (typed REAPPLY) names exactly one current character (by the recorded GUID, else the recorded new
  name with no GUID; anything else is refused for a person to sort out), unbinds it, sets the site application back to
  withdrawn with a staff note, and removes Guild Member once and holds later grants (`roles.ts`) unless another current
  member character of the account supports the role (a supporting character is one that NO open hold names, by key or
  GUID, so two held characters never support each other). Approval needs both of the owner's steps after the decision: the
  member saved the application again, the leadership accepted it (a withdrawn application can no longer be accepted
  directly), and the character was verified again in game, identified by its GUID exclusively when the hold recorded one
  (a different character under a reused name does not count); the acceptance must be newer than the member's latest save,
  and a save that races a staff decision no longer overwrites the decided application (409; an inherited race in
  saveApplication, Codex 19:56 UTC); the check is part of the closing UPDATE. "Withdraw the decision" closes a
  mistaken mark. The member reads why in `/verify-status` and on Home. Ordinary renames are unchanged: the link follows
  the GUID.
- **Wording.** No Olympus help channel exists: "open a ticket in the server's help channel" is gone from the site and the
  policy. The unbind reply and the policy no longer say the roster takes the Guild Member role away after an unbind (it
  never did). The pinned guide no longer promises Battle.net. The privacy policy and terms no longer describe the move to
  Asmongold's server and to olympus.roachcouncil.com as future, nor #bot-announcements. The command descriptions in
  `scripts/register.mjs` no longer promise a BattleTag (they reach Discord only with a re-registration, Codex's step).

**What changed, for staff.**
- Admin → Settings gains three blocks: **Battle.net sign-in** (status; the box is locked, with the reason, until the
  secrets are present and the privacy policy carries the marked Battle.net section; switching on asks for a typed
  ENABLE), the **Olympus I-X leadership** editor, and **End of the beta** (locked until an administrator records the moment
  Blizzard closed the beta, which must be in the past; then a typed RESET saves the appointed roles as an explicit empty map,
  so the default Treasurer does not come back, empties the directory and can set a notice; applications, votes, memberships
  and history are kept; nothing runs on a timer). The reset runs once: its first statement admits it in SQL against the
  closing moment the page showed and stores a once-only marker with a nonce that the other statements require, so a
  replayed or stale request changes nothing and later appointments survive; the closing moment is fixed once it ran.
- Admin → Renames, as above.
- In .114 the Battle.net switch **cannot be switched on**: the policy has no Battle.net section on purpose (the owner: no
  retention text until Blizzard ships a World of Warcraft: Forever API). Switching it on needs a later reviewed release
  that adds that section (marked `<!-- olympus:bnet-login-section -->`, which `scripts/build-policy-content.mjs` turns into
  `PRIVACY_DESCRIBES_BNET_LOGIN`), then the box. A login that proves Forever characters needs new code once Blizzard
  publishes that API; the identity login proves a BattleTag only.

**Role writer contract.** `roles.ts` gains one remover, named in its header: `revokeForReapply` at the rename decision (the
hold re-read after the member GET, at the effect), plus the hold re-read after a grant's PUT (a hold that landed while the
PUT was in flight is undone, `role.revoked_after_hold`) and the held accounts joining the banned reconciliation in the
sweep (`role.revoked_held`). The hold holds the role only while no OTHER current member character of the account (another
key, not the same GUID) supports it (Codex, log 18:47 and 19:17 UTC); the renamed character is verified again and the
member applies again either way.

**Database.** New table `rename_holds` (schema.sql, src/schema.ts, migrations/2026-10-02-rename-holds.sql), created by the
Worker itself; closed rows deleted thirty days after closing by the cron; bot data, so `queries/forget-member.sql` erases it
and the member's copy lists it (without the administrators). New `site_settings` keys: `bnetLogin`, `leadership`,
`betaClosedAt`, `betaResetAt` (outside `SiteSettings`, so never in `GET /api/public`). This is a migrating deploy: the
runbook's fresh verified private backup comes first.

**Config.** None: no `wrangler.toml` key changes, so `scripts/cutover-config.sh --check` is unaffected.

**Rollout.** One deploy of the reviewed commit. After it, by Codex with the owner's approval at the time: `/olympus-admin
refresh-guide` (the guide without the Battle.net promise), the #join-olympus topic and the Discord app description without
"optionally link Battle.net", and a command re-registration for the corrected descriptions. The policy mirror on GitHub
Pages is refreshed with the publication step; Codex's reference successor updates the fixed-art pins (app.js,
site-ranks.ts, and site-core.ts for the CSP seam) and the Pages reconciliation's generator pin
(`scripts/build-policy-content.mjs` changed).

**Rollback.** Every earlier version is .113 and has no Battle.net switch: with the secrets present, rolling back switches
the old always-on login back on. .113 also ignores `rename_holds`: held accounts would be granted Guild Member again. The rollback rule in `docs/launch-runbook.md` section 7 names .114's own versions once they
exist; a rollback below .114 is a decision about the login too.

**Tests.** New `tests/owner_requests_test.cjs` (105 checks; in `test:all`): the switch off by default and fail-closed, each
route refusing before any audit, cookie, redirect or exchange, the bind fenced at its write and before Discord, the admin's
gates (ENABLE, secrets, policy marker, SITE_ADMINS), the watcher's /health, /verify-status off and on; the directory (ten
entries, limits, members only, not public, counts-only audit); the reset (locked, past moment, typed RESET, explicit `{}`,
counts-only audit, idempotent); renames (list, decision, unbind, application, removal, notice, Home, /verify-status, the
copy, approval only after both steps, a withdrawn application not acceptable directly, a reused name with another GUID
not counting, the per-character exception, two open holds not supporting each other (real SQL), the exact target and its
refusals, the cron); the DELETE-to-PUT boundary; the once-only reset against a stale or replayed
request; shown names, the CSP, the policy and terms texts, the planner page and stylesheet, the unbind
reply, the command descriptions. `tests/restore_role_test.cjs` (+9): held grants, the PUT race, the at-effect re-read.
`tests/frontend_check.cjs` (+21): the picture and its fallback and validator, the footer signed out and in, the leadership
page, the three settings blocks driven through the page, the Renames tab (a refused early approval, a withdrawal) and the member's Home; `site_test.cjs` replaces "no account picture
loads from Discord" with the header-only contract. `tests/bnet_retention_test.cjs`
runs with the switch on; `tests/verify_button_test.cjs` checks the guide no longer promises Battle.net; `site_test.cjs` (360) and
`hosts_test.cjs` pin .114 and check the shown names; site_test also races a save against a staff decision.

## Worker .115 — the owner's requests of 2 Oct 2026 (a full guild said plainly, News and typed names) (3 Oct 2026)

**Interrupted work preserved; not release-qualified.** Local non-release checkpoint
`568c76d958eeee2f2786798bd959b0b2ae8ec299` preserves the interrupted .115 changes after the owner's Codex takeover.
The earlier author descriptions, figures and test totals below are retained as history, not a fresh final-head result.
No budget values/caps change in this document batch pending the roster author's final result. Codex must qualify the
actual successor commit/tree; no new Claude countersignature is required or claimed.

**Current restore refusal.** The second-round text below attributed a save freeze to the website block. That guarantee
is withdrawn: WAF blocks new admissions only, and no fixed wait/equal-capture/redeploy procedure proves completion or
cancellation of admitted writes. `docs/launch-runbook.md` section 1 requires actual quiescence before final capture,
coverage of every preservation-critical writer/version/SQL/post-response operation, maintained exclusion through
replacement/replay/read-back, and no stale writer after reopening. If that cannot be proved, refuse restoration.
The future commit-time maintenance epoch surviving restore is **not implemented**; no .116 barrier is assumed.

the owner's request of 2 Oct (task log 23:41 UTC) and his answers of 3 Oct about 02:30 UTC (log 02:34 UTC): the one-time
rewrite of the older settings audit rows in scope; the seven-rank ladder of answer 1, with the in-game steps that went
with it, is superseded by answer 6 (about 12:50 UTC; "Withdrawn" below). The other questions took the plan's defaults:
News under Community, a 48 h freshness window, application counts below 5 masked, at most 20 live notices of 1 to 90
days (default 30), no new `/verify` line, no seat state for signed-out visitors, the planner's default unchanged. Built
on keeper 58abea31 (live: .114, Cloudflare 59f6dc91) in six commits: seats, News, typed names, the pinned pages and
copy, the policies, and the build and docs; then four commits for the review of the .115 head (3 Oct 2026, "Review
fixes" below), one for the owner's answer on the exports, and one withdrawing the role copy and the planner's ladder
(b142be9); then four for Codex's findings on that head (3 Oct 2026, 13:15, 13:24 and 13:26 UTC: ac9156f the roster,
7c98d69 News, c6f1081 the scheduled budget, 6f21a73 the policies and docs; "Roster and News review fixes", "The
scheduled invocation's statement budget" and "Policy and docs review fixes" below); then five for the second review
round over those four ("Second review round" below); then one for Codex's finding A of 16:48 UTC, the roster's member
effects ("Third review round" below).

**What changed, for members.**
- **A full guild is said plainly** (`src/guild-seats.ts`). While Olympus I is full, `/verify-status` and the guide's My
  status button give one paragraph: the officers' latest roster export and its count ("1000 of 1000 members"), or the
  last invite refused for lack of space, each with its hour; that being full never costs an invite attempt; that the bot
  removes nobody (officers may remove inactive characters to free seats); that an officer sends the next invite when a
  seat opens, in queue order, reserved names from the site first; and the visitors line. It goes only to an account that
  waits on an invite (a character queued or verified, or an open code), ephemeral, with no notice and no DM, and each
  waiting character's place comes from the account's own queue rows. Home (after the rename notice) and the top of Apply
  show a full-guild notice while full, to an account with its own queue rows ("NAME is #N in line for a seat") or
  without a roster-confirmed character; a confirmed member with nothing queued sees no notice. Times shown to members
  are rounded down to the hour. "Full" means: the latest roster snapshot is complete, trusted, exported on or after
  `LINKS_NOT_BEFORE`, less than 48 h old (the earlier of its export and arrival times) and counts at least the cap; or
  the officer's addon reported an invite refused for space in the last 6 h, on or after `LINKS_NOT_BEFORE` (and after
  that roster when the roster decides). Anything else is "unknown", and nothing is claimed.
- **Community → News**, once an administrator switches it on (off by default), for confirmed members only: the
  administrators' notices (plain text, shown as text), Olympus I's state on the hour, the guild in figures (joined and
  left over the last day and week from the trusted roster history; applications first saved and decisions saved, a count
  from one to four shown as "fewer than 5"; refreshed at most every three hours), the next scheduled events in 14 days
  (title and time, with the calendar feature), when the leadership directory last changed (never its names), the beta's
  last full day (21 October 2026) with the launch countdown, and the site's release notes.
- **The privacy policy and terms** (last updated 3 October 2026) describe News, a full guild, appointed and listed names
  (consent, the open web, removal on request), what a roster snapshot now records, and the backups, including
  Cloudflare's point-in-time history of the database ("up to 30 days"; Codex confirmed the figure at 13:15 UTC). Since
  the policy review of 3 Oct 2026 (Codex, 13:24 and 13:26 UTC; "Policy and docs review fixes" below): "never your name"
  covers only News's automatic figures, while a notice is free text that names a member only with that member's
  agreement and is changed or deleted on request; the rewrite of the older log rows is said as it behaves (once at a
  start, a failure retried at a later start, checked by the owner); and a restore puts back the typed names as they
  stood just before it.

**What changed, for staff.**
- **The seat line.** Admin → Overview (one muted line above the tiles), the first line of `/olympus-admin queue` and
  `roster`, and the guild-full staff notice give the seat state with exact times: full by the roster, full by a refusal,
  "N seats free", or "unknown" with the reason in words (no export yet; still being written; left unfinished, "the
  addon's next export writes it again"; not yet checked; not trusted, "run /olympus-admin sync if the guild really
  shrank"; before `LINKS_NOT_BEFORE`; more than 48 hours old), and how many wait in the invite queue (queued and written
  rows; an invited row has had its invite).
- **`/olympus-admin sync`** also vouches for the applied export as the seat count, since a large shrink stays distrusted
  until a person says so, and for an export left unfinished for more than ten minutes once all its member rows are
  there. Its `admin.sync` audit gains `trustedSet`, and the reply says "This export now counts for the seat count." when
  it changed something. Since Codex's finding 1 (3 Oct 2026, 13:15 UTC) it first refuses, changing no link, character
  or role and vouching for nothing, a snapshot still being written (complete 0 inside ten minutes) or storing fewer
  member rows than its export listed: "Nothing applied: roster snapshot #N ...", with the stored and listed counts,
  and an `admin.sync_refused` audit with the counts only. For the second case the reply names the snapshot to wait past,
  and `/olympus-admin roster` now shows the snapshot number ("Last roster: N members (snapshot #N)"; the second review
  round).
- **A roster export that names one character twice** (once normalised: case, spaces, a realm after a hyphen) is refused
  whole, a 422, before anything is read or written (no snapshot, member rows, first-seen dates, link, character or role
  change; the watcher does not retry a 4xx): one server-log line naming the pairs and a `roster.duplicate_names` audit,
  again only after six hours while the same names collide. Every later export is refused the same way until each name
  appears once; the officers' remedy (rename or remove one character of each pair, then export again) is
  `docs/launch-runbook.md` section 10. Since the second review round, an export whose stored rows fall short of its
  count after every batch committed is refused the same way (`roster.ingest_unusable`, told once in six hours) instead
  of a retried 500 that would hold the watcher's later posts.
- **News.** Admin → Settings gains the News page switch (saved and audited like the other switches). Admin → News shows
  the switch (posting and editing locked while it is off; deleting still works), how many notices are shown (of 20), how
  many are past their time awaiting the cleanup and how many operation records are kept, the live notices with Edit and
  Delete (both confirmed), and the form: a title of up to 80 characters, a text of up to 2000, "Show for" 1, 3, 7, 14,
  30 (the default), 60 or 90 days, and "Write for the whole guild; do not name members." A new notice is an operation
  under an id the server hands out when Admin → News opens (`opId` in `GET /api/admin/news`, the database's time in its
  first eight characters; Codex's finding 5): a lost answer freezes it with "Retry the same" and "Check whether it was
  stored"; a form posts only within 30 days of being opened, and an older one is refused in words (409 `stale_page`,
  nothing stored) and the page reloads for a fresh id; a deleted or expired notice can never be posted again by a retry.
  Edits and deletions carry the revision; a stale one is refused in words, and a stale delete of a notice whose time is
  up answers with its id and revision only, never its text (Codex's finding 3).
- **Typed names need consent.** Under the appointed roles and under the Olympus I-X directory there is an unticked box:
  a save that adds a name, or gives a role another holder, is refused without the tick (`confirm_names`) before anything
  is written. To remove a name on request, type Name withheld (an appointed role stays appointed, its board and
  applications closed) or clear it (the role reopens); neither needs the tick. The settings audit records which roles
  were appointed, how many names were saved, whether the site notice was set and the tick, never a name or the notice's
  text.
- **Beyond the owner's list:** the bearer `GET /health` gains `seats` (state, source, reason, members, cap,
  capConfigured, rosterAt, refusedAt; exact times, a staff diagnostic). The public answer stays `ok`/`build`/`d1`.

**Database.** `roster_snapshots` gains `trusted` (1, 0, or NULL while unchecked), `complete` (NULL before .115, 0 while
its member rows are written, 1 once all are in, set in the same batch as the last of them) and `first_received_at`, with
the index `roster_snapshots_first`; new tables `site_news_notices` and `site_news_ops` with six indexes and the lifetime
CHECKs (47 to 49 tables). All three places (schema.sql, src/schema.ts, migrations/2026-10-03-news-and-seats.sql); the
Worker creates them itself. The third review round adds `roster_effect_runs` and `roster_effects` (49 to 51 tables, no
index beyond their keys; all three places again, `migrations/2026-10-03-roster-effects.sql`). New `site_settings` keys: `newsOn` (a `SiteSettings` switch, so its boolean reaches `GET
/api/public`), `newsFigures` (the cron's cache: counts and snapshot ids, never sent) and `auditTypedNames` (the marker
of the rewrite). At an isolate's first request, until it has succeeded once, the Worker rewrites every older
`site.settings` audit row (appointed names to role keys and a count, the notice text to true/false) in one batch with
the marker; a failure is logged (`errorRef`, the category only), does not fail the schema check, and a later isolate
start tries again (`schema.ts redactSettingsAudit`). So the deploy itself proves nothing about the rewrite: the
settings-audit read-back of rollout step 7 is a mandatory acceptance gate (Codex, 3 Oct 2026 13:24 UTC). The rewrite
cannot be undone, so the runbook's fresh verified private backup (rollout step 5) comes before the deploy that runs it;
that export is then the only copy of the older rows and keeps them until it is destroyed (when a newer verified export
replaces it, or once the launch is accepted). Until the
officer's first roster export after the deploy the latest snapshot is a pre-.115 row and the seat state reads "unknown"
(not yet checked); that export settles it when every member row of that row is stored (identical, it back-fills the
row; changed, it writes a new snapshot). A pre-.115 row with member rows missing is back-filled as unfinished instead
(complete 0, at once "stuck", never a complete stamp over missing rows; Codex's finding 2), and the export after that
writes the roster again in full and settles it. News's day figures appear about a day after the first
complete .115 snapshot, the week figures about a week after.

**Config.** Optional `GUILD_MEMBER_CAP`: unset means 1000 (the game's limit); a value from 900 to 1000 is used as given;
anything else is reported as `invalid` and 1000 is used. It is in neither wrangler file: the applied profile is bound by
hash to the cutover marker and the key is not an activation key, so it can be set only as an owner secret or through a
separately reviewed profile change. None is needed. `OFFICER_RANK_NAMES` stays `"Guild Master,Officer"`;
`scripts/cutover-config.sh --check` is unaffected.

**D1 cost.** A signed-in `GET /api/me` gains one batch of three indexed statements; `GET /api/news` is one admitted
batch. In the small fixture of `tests/site_news_test.cjs` (every community feature on) the .115 lines add 2 round trips
(5 statements) to a throttled scheduled run and 5 (15) to a computing one, the figures reading the switch and their
cache in the cleanup's batch (review of 3 Oct 2026; it was 3 and 6); that whole run is 45 round trips (183 statements)
throttled and 48 (193) computing, against 43 without the .115 lines. At most eight computing runs a day, each reading at
most about 8,000 rows. A roster export that follows an untrusted row during the transition from pre-.115 rows also
re-reads those rows once (`roster.ts seatBase`, at most 1,000).

**The scheduled invocation's conservative statement-attempt budget** (Codex's finding of 3 Oct 2026 13:26 UTC).
The source/test model charges every attempted statement, each batch element included, and composes the cron's schema
check and all eighteen jobs into one budget against the recorded Workers Paid limit of 1,000. The account/limit receipt
does not establish a provider-confirmed aggregate-batch counting rule. That small fixture was
no bound: with a large backlog the weekly obligation opener alone could issue 1,201 statements (1 + 6 x 200) and the
profile cleanup 604. Now `src/scheduled-budget.ts` holds every job's worst case and the per-run caps the jobs read: the
role sweep checks at most 20 accounts (`ROLE_SWEEP_PER_RUN` is clamped to it; configured 10, the clamp was 50), the
names refresh at most 20 (unchanged), the profile cleanup erases at most 10 profiles a run (was 100, oldest departure
first), and the opener opens at most 30 weeks a run (was 200, in Discord id order) and checks the policy once per run
instead of once per account; each capped job continues on the next run, every 30 minutes, so nothing is dropped. A guild
of 1,000 has its week's obligations within about 17 hours of the week's start (nothing is due before the week ends), and
a backlog of expired profiles goes at 480 a day (the policy already says the cleanup works in bounded batches and may
take several runs). The table's sum, counting failed audits and a cold schema check with every column missing, is **652
statements** against a target of 700 (**694** since the third review round: the roster effects' slice of 40 and the
schema check's two new tables). Measured by `tests/scheduled_budget_test.cjs` through the real `scheduled()`, with
every community feature on and every capped workload past its cap: **402 statements warm, 526 on a cold isolate, 564
cold with every column reported missing** (each job alone equals its line; the role sweep, whose line counts failed
audits, measured 83 and 86 against 170; since the third review round, with 60 pending promotions in the fixture, 435,
561 and 599). The same suite run over the sources before this fix measured 940, 1,064 and
1,102. Since the second review round (3 Oct 2026) the suite also takes the role sweep's line apart, because 83 and 86
bound it only loosely: its fixed reads (7) and exactly 5 statements an account on the success path, 7 on the failure
path and 4 for a held account in the banned reconciliation, each the difference between two runs one account apart; the
call budget (at most 50 requests) stops a failure run at 11 accounts, so the line's 7 x 20 is the account cap's bound.
The rule is not the cron's alone: `/ingest/roster` wrote one statement per member, so a changed export of 1,000 members
after a full one sent 1,007 statements; its member rows now go in one `json_each` statement per batch of 50, and that
export measures 27 statements (29 when the trust base is read; 33 and 35 since the third review round, with its effects
run, its derivation batch and the newest run read with the newest snapshot), held to 40 (`roster.ts`
`ROSTER_INGEST_STATEMENTS_FULL_GUILD`, `tests/guild_seats_test.cjs`). **Gate:** before release qualification Codex
records the account's current per-invocation limit against `D1_STATEMENTS_PER_INVOCATION` (1,000), using the applicable
account and authoritative documentation evidence. The accounting continues to charge each source-level attempt and
batch element conservatively; do not present the earlier 13:15 note as provider confirmation of aggregate batching.
If the actual limit is lower, caps and target must be re-derived and measured before deploy. All figures above remain
recorded interrupted-work figures until the roster correction and fresh final-head qualification; they are not a
provider meter or a current acceptance receipt.

**In game.** The in-game ladder decision changed on 3 Oct 2026 (owner answer 6: ten ranks, the Treasurer at index 2
right below Officer, no Probation), and its planner preset and in-game steps come in a later release.

**Rollout.** As the reviewed order of work has it:
1. Author evidence on the product head (the publication audit, a fresh literal-classification file, the author tuple,
   the dry-run `index.js` SHA-256, the `test:all` totals), then the SOURCE FROZEN entry. Codex's source review; findings
   are fixed in new commits and the head is frozen again.
2. Codex's four-file successor on the frozen head (`scripts/official_asset_reference.json`, `official_assets.py`
   `REFERENCE_SHA256`, the `reconcile_public_root.py` V4 pins, `docs/source-provenance.md`) for the two pinned files
   .115 changes (`app.js`, and `site-data.ts`, which changes only by the `SiteSettings.newsOn` switch; `site-core.ts`,
   `site-ranks.ts` and every rank-planner file, `app.js` included, are byte-identical to 58abea31), with its coverage
   receipt. Codex integrates the bytes exactly and qualifies the integrated head with attributable peer review.
3. Codex's byte-gate contract with the asset manifest (63 runtime files, `guild-seats.ts`, `site-news.ts`,
   `roster-effects.ts` and `scheduled-budget.ts` among them: 56 under `worker/src` and 7 static; the earlier count was
   62 before the roster-effects module) and the content approval of the privacy, terms and index root rows, with an attributable
   independent peer review. Re-derive the tuple on the final successor; historical counts are not a current freeze.
4. Before the carry: the policy published by the merge says the owner keeps only the newest verified export until the
   launch is accepted (the owner's answer of 3 Oct 2026). Codex's read-only inventories of 3 Oct 2026 (15:51 and 16:19
   UTC, the task log) found more copies than the two exports first named: three SQL exports (1 Oct 15:13, 1 Oct 19:15
   and 2 Oct 20:08 UTC), two local restore SQLite files of 2 Oct, and three Cloudflare D1 recovery scratch databases
   (created 1 Oct 15:15, 1 Oct 19:16 and 2 Oct 20:10 UTC), with private log and other-root copies still being
   reconciled. Once the fresh .115 export of step 5 is verified, the owner destroys every one of them (a D1 scratch
   database is deleted, never assumed empty), so that the .115 export is the only copy. The task log records the time
   and SHA-256 (or, for a D1 database, its name or UUID) of each destruction, never a path. Then a new finite forward
   carry of the integrated head onto public `main` 6f462d2, its review and exact-commit Codex qualification, the protected
   pull request, green CI and the merge.
5. Before the deploy: a fresh verified private backup (`docs/launch-runbook.md` section 1: exported, then restored
   privately with matching counts), a Time Travel bookmark and a 47-table count baseline. The backup precedes the deploy
   because the deploy runs the irreversible settings-audit rewrite at its first isolate start: this export is the only
   copy of the older rows afterwards, and a deploy without it waits. Codex's deploy qualification on the merged public `main`
   SHA, with the remote D1 import qualification named OPEN. Deploy promptly: the Pages mirror shows the .115 policy from
   the merge on.
6. `bash scripts/deploy-commit.sh <public main sha>` (the owner, or Codex where the owner authorized it in the log). Nothing
   is deployed from the keeper. No command registration and no guide refresh: the guide's text is unchanged.
7. Read-only read-back: the public `/health` names .115 and the bearer one carries `seats`; the static files equal the
   integrated head's; `/privacy` and `/terms` equal the Pages copies; the owner's counts-only read finds 51 tables
   (`worker/schema.sql`: 47 live .114 tables plus the two News and two roster-effects tables); the
   Overview seat line agrees with `/olympus-admin roster`. Named as residuals, not checks: R2, R5 for an ordinary
   account, a queued test account's `/verify-status`, and News as an ordinary confirmed member.

   **The settings-audit read-back: a MANDATORY acceptance gate** (Codex, 3 Oct 2026 13:24 UTC). The rewrite runs at an
   isolate start and a failure only logs and waits for a later start, so the deploy proves nothing about it, and the
   policy says the owner checks it. A marker alone is not enough either: a Settings save that a .114 isolate finished
   during the deploy writes the old shape after the marker, and nothing rewrites it while the marker stands. So
   administrators save no Settings from the start of step 6 until this gate passes, and once `/health` names .115 the
   owner runs this counts-only read (in bash, `npx wrangler d1 execute <keeper database> --remote --command "<the
   query>"`):

   ```sql
   SELECT (SELECT COUNT(*) FROM site_settings WHERE key = 'auditTypedNames') AS marker, (SELECT COUNT(*) FROM audit WHERE action = 'site.settings' AND CASE WHEN json_valid(details) THEN json_type(details, '$.appointed') IS NOT NULL OR json_type(details, '$.notice') = 'text' ELSE 0 END) AS residual, (SELECT COUNT(*) FROM audit WHERE action = 'site.settings' AND json_valid(details) = 0) AS unreadable
   ```

   It passes only with **marker 1, residual 0 and unreadable 0**; the task log records the three numbers and the time,
   never a row. `residual` counts settings rows that still carry a named `appointed` field or a notice's text. If it is
   above 0, the owner deletes the marker (`DELETE FROM site_settings WHERE key = 'auditTypedNames'`) and starts a fresh
   isolate, whose schema check rewrites once more (both UPDATEs touch only rows still in the old shape): a running
   isolate has checked its schema already and does not look again, so the owner redeploys the same commit (`bash
   scripts/deploy-commit.sh <the same public main sha>`, nothing else changes) and requests the bot host's `/health`
   once (the second review round, 3 Oct 2026); then the read is repeated until it passes. `unreadable` counts settings rows whose details are not JSON, which the rewrite leaves alone and no build
   writes; if it is above 0, acceptance waits while the owner inspects those rows privately and Codex qualifies the remedy, with
   no name in the log. `tests/owner_requests_test.cjs` runs this exact query, read from this section, over rows in the
   old shape, after the rewrite, after a later old-shape save and over a row that is not JSON.
8. At action time, carry out the owner's already recorded News authorization (Admin → Settings) once its release/live
   gates are met; optionally post one notice only after the owner approves its exact text.
9. **Acceptance gates.** .115 is not accepted, and no live acceptance or overall signature counts for it, until both of
   these hold:
   - the settings-audit read-back of step 7 has passed (marker 1, residual 0, unreadable 0, in the task log);
   - the newest-only promise is true (Codex, 3 Oct 2026 13:24 UTC; the owner's answer of 3 Oct 2026 is the instruction,
     not the evidence). After the fresh .115 export of step 5 was verified, the owner gives the exact inventory of the
     private copies of the database: every export file (its time and SHA-256, never a path) and every scratch database a
     verification restored into (its creation time, and its name or UUID, or for a local file its SHA-256). It must hold
     exactly one copy, the .115 export, and the task log must hold the owner's destruction receipts: the time and the
     SHA-256 of the destroyed file for each earlier export (1 Oct 15:13, 1 Oct 19:15 and 2 Oct 20:08 UTC), timed after
     the .115 export was verified (step 4); and one for each scratch database (the two local restore files of 2 Oct and
     the three D1 recovery databases of 1 Oct 15:15, 1 Oct 19:16 and 2 Oct 20:10 UTC, and any other copy the
     reconciliation finds), which for a D1 database (it has no SHA-256)
     is its name or UUID, the time it was deleted and a `npx wrangler d1 list` taken afterwards that no longer shows it,
     and for a local file its time and SHA-256 (the second review round, 3 Oct 2026; `docs/launch-runbook.md` section
     1). A plan or an instruction to destroy is not a receipt. Cloudflare's Time Travel history is a separate facility: it is not a private export and not in this
     inventory, nothing here reads or destroys it, and it ages out by itself within its window (30 days on this plan).

   Then Codex's bounded live acceptance and final exact-commit qualification for .115, with attributable peer evidence
   and an explicit statement of how the .114 overall scope is superseded, with residuals listed. The .115 export stays
   as the newest verified export until a
   newer one replaces it or the launch is accepted (`docs/launch-runbook.md` section 1).

**Rollback.** Fix forward first. A rollback goes only to .114 (Cloudflare 59f6dc91), never to .113: every .113 version
switches the always-on Battle.net login back on (the secrets are present) and ignores `rename_holds`. .114 ignores the
new columns and tables: it writes snapshots without `complete`, `trusted` or `first_received_at` (once .115 is back,
those rows read "not yet checked" until the next export and are never a figures base), and it neither shows nor sweeps
News notices. A rollback to .114 therefore needs all of these:
- the owner deletes every row of `site_news_notices` and `site_news_ops` (counts recorded, no text), because .114 would
  keep notices past the lifetime the policy states; after the roll-forward, administrators reload Admin → News before
  posting, since a frozen retry from before the rollback no longer meets its tombstone: from a page opened within the
  30 days before it, it would post its notice again (a page opened earlier is refused for its age, 409 `stale_page`);
- administrators do not save Settings while .114 runs (it writes appointed names into the settings audit again);
- a forward-fix policy pull request or a same-day roll-forward, because the published policy describes .115;
- the rewritten audit rows, the three columns and the two tables stay (harmless under .114). The rollback boundary
  (Codex, 3 Oct 2026 13:24 UTC; `docs/launch-runbook.md` section 9): .114 writes the old shape, the appointed names and
  the notice's text, with every settings save, and the marker keeps .115 from rewriting again, so neither the rollback
  nor the roll-forward nor a mixed-version window ever counts as having rerun the rewrite. Before the roll-forward the
  owner runs the settings-audit read-back of step 7; if a settings save under .114 (or one a .114 isolate finished
  during either deploy) left a residual, the owner deletes the marker row (`DELETE FROM site_settings WHERE key =
  'auditTypedNames'`) so that .115 rewrites once more at the first isolate start after the roll-forward, which is a
  deploy and so starts fresh isolates (both UPDATEs touch only rows still in the old shape), and after the roll-forward
  the read-back must pass again (marker 1, residual 0, unreadable 0) before .115 counts as accepted again; should it not,
  the step-7 remedy (the marker deleted, the same commit redeployed) applies. A `GUILD_MEMBER_CAP` secret, if one was set, is ignored by .114.
The roster effects' two tables (third review round) stay as well, and .114 ignores them: its own diff applies every
promotion and departure due at its next export, the old way in one invocation, which is what finding A is about, so a
rollback while a large backlog is pending (`roster_effect_runs.done_at` empty on the newest run) is a risk to weigh; after
the roll-forward the next export derives a new run that supersedes whatever was left.

**Review fixes (3 Oct 2026).** The review of the .115 head changed, in four commits: the completion stamp rides in the
last member batch (a failed last batch takes the snapshot back out and the watcher retries; `roster.stamp_failed` is
gone), and a row left unfinished for ten minutes is "stuck", written again by the next export and vouched for by sync
once all its member rows are there; the trust base applies after any row that is not itself trusted, re-judges pre-.115
rows in order and is kept to `LINKS_NOT_BEFORE` (with no base there the ingest's own decision stands); `/olympus-admin
queue` counts queued and written rows only; `/verify-status` lets a trusted roster with room outrank an old refusal on
the queue row; `GET /api/news` judges the switch inside its admitted batch and sends the directory's time on the hour;
the cron's figures read the switch from the cleanup's batch; the privacy policy's full-guild and Backups wording; the
roll-forward and read-back counts for the settings audit above; the destruction of the earlier exports before the carry;
the runbook's export and restore steps; the planner's comment cites the logged answer (withdrawn since, below). An
invalid `GUILD_MEMBER_CAP` stays 1000, not "unknown" (the plan's rule; `docs/design.md`). The commit body of `1d1ee42`
says "27 suites": `test:all` ran 28 scripts at that commit (corrected here, never by amending).

**Policy and docs review fixes (3 Oct 2026; Codex 13:24 and 13:26 UTC, `review115/policy-review.md`).** One commit, no
code, schema, `BUILD` or page change (the comment in `schema.ts` names the read-back's notice field too):
- **Who can see News** (privacy, "Who can see it"): "never your name" now covers only the figures the site works out by
  itself (counts and times, never a name or a place in line). A notice is free text an administrator writes for the
  whole guild, and the site does not check what it says, so the News paragraph says the administrators name a member in
  a notice only with that member's agreement and that anyone it names can ask any Olympus officer, or use the private
  request form, to have it changed or deleted, which an administrator does at once (the route the leadership directory
  already gives typed names). Admin -> News keeps its stricter line, "do not name members" (`app.js` unchanged).
- **The rewrite of the older settings rows** is said as it behaves, in the policy ("Appointed roles"), `docs/design.md`,
  the runbook (section 9) and above (Database): once at an isolate start, a failure logged and retried at a later start,
  and checked by the owner. Rollout step 7's read-back now also counts a notice's text and rows that are not JSON and is
  a mandatory acceptance gate; step 5 says why the fresh verified backup must come first; the rollback bullet and the
  runbook (section 9, item 5) state the boundary: an older writer resumed after the marker writes the old shape again,
  and only deleting the marker makes .115 rewrite it.
- **The newest-only promise is accepted on receipts** (rollout step 9 and the runbook, section 1): the owner's inventory
  of every private copy after the .115 export was verified, holding only that export, and a destruction receipt (time
  and SHA-256) in the task log for each earlier export and each scratch database a verification restored into. Time
  Travel is a separate facility, outside that inventory.
- **Typed names across a restore** (the runbook, section 1; the policy's Backups paragraph): right before any restore
  the owner keeps the `appointed` and `leadership` rows privately as the two statements that write them back (made by
  SQLite's `quote()`; a missing row becomes a DELETE), runs them right after the restore and before the site is used,
  through no Worker route and so never into the audit, runs the read-back on the restored database (the marker is never
  copied), and destroys the private files afterwards, the task log recording their times and SHA-256 and two counts.
- Beyond the four findings, from the same review: the appointments and the directory are cleared by an administrator
  after the beta has closed (runbook section 8), not "when the beta ends", which read as a timer.

**Roster and News review fixes (3 Oct 2026; Codex 13:15 UTC, findings 1-5).** Carried here by the second review round
(the commit bodies of ac9156f and 7c98d69 recorded these notes as owed; 6f21a73 added only the CLAUDE.md part):
- **Sync decides before it acts** (finding 1, ac9156f): `/olympus-admin sync` reads the latest snapshot's completion and
  arrival and refuses, before any link, character or role effect, "writing" (complete 0 inside ten minutes) and
  "incomplete" (fewer member rows stored than `member_count`, whatever the completion state), audited as
  `admin.sync_refused` with the counts; the human override stays for a fully stored, genuinely smaller distrusted
  export and for a row left unfinished whose rows are all there. The vouch proves the row count in every branch.
- **Duplicate names are refused, not collapsed** (finding 2, ac9156f): an export whose names collide once normalised is
  a 422 before any read or write, `roster.duplicate_names` audited and logged once in six hours; what staff do is in
  runbook section 10. The completion stamp in the last member batch also proves, in that transaction, that the stored
  rows number `member_count`, and the pre-.115 back-fill's stamp proves the same count: a pre-.115 row with rows missing
  becomes complete 0 ("stuck", written again by the next export), so complete 1 always means every member row is stored.
- **A stale delete never answers with an expired notice's text** (finding 3, 7c98d69): the refusal's read selects the
  title and text only through CASE on the notice being live; past its time a stale delete gets `{id, revision}` only.
  The current revision still deletes after expiry and keeps the tombstone.
- **The figures' compare-and-set carries the switch** (finding 4, 7c98d69): a run already past its reads when News is
  switched off writes nothing (the INSERT ... SELECT and the UPDATE both carry `NEWS_ON_SQL`), and the outcome is
  "superseded", as when another run wrote first.
- **The operation id expires before its record** (finding 5, 7c98d69): `GET /api/admin/news` hands out `opId` with the
  database's time in its first eight characters; a create is accepted only while that time is within 30 days of the
  database clock and not ahead of it, inside the same INSERT as the fence. The record lives 120 days from the create, so
  a stale "Retry the same" meets it or is refused for its age (409 `stale_page`); the time is not signed, which is
  harmless on this staff-only route (the second review round).

**Second review round (3 Oct 2026; over the four commits above, Codex 13:15, 13:24 and 13:26 UTC).** Five commits:
- **The roster** (79815cc): each member batch is one `INSERT ... SELECT` over `json_each` of its 50 members, so a
  changed export of 1,000 members after a full one sends 27 statements (29 when the trust base is read; it was 1,007,
  over D1's per-invocation 1,000 under the rule .115 adopted), held to 40 (`ROSTER_INGEST_STATEMENTS_FULL_GUILD`); a
  completion stamp that finds the rows short after every batch committed is a final 422 (`roster.ingest_unusable`, told
  once in six hours), never a 500 that would hold the watcher's outbox (a failing batch is still retried); the sync's
  "incomplete" refusal names the snapshot to wait past and `/olympus-admin roster` shows the number.
- **The scheduled budget** (77d1904): the role sweep's per-account costs measured exactly (5 on the success path, 7 on
  the failure path, 4 for a held account; the call budget stops a failure run at 11 accounts, so the line's 7 x 20 is
  the cap's bound); tied departures erased in Discord id order by test; the D1 gate above asks the counting rule and a
  limit of at least 1,000.
- **News** (3585bae): the policy lists the next events outside the figures that carry no name, with the titles their
  organizers typed, as the calendar shows them; it states the 30-day posting window inside the 120-day record; members
  get no notice id (its first characters are the second an administrator opened Admin → News); the id's time is called
  a bound, not a signature; the vocabulary guard covers every `worker/src` file .115 changes.
- **The restore** (661bfa1; `docs/launch-runbook.md` section 1): the site is closed at Cloudflare from before the read
  until after the read-back (no window in which a restored name is public; the block is also the freeze of Settings,
  Leadership and News saves); after the restore a redeploy of the same commit starts fresh isolates, so the schema check
  creates what a pre-.115 copy lacks and rewrites its older settings rows before the read-back; a second private file
  deletes every restored notice changed or deleted since the copy and puts back the record of every notice posted since
  (ids and times from the audit, never a text); a D1 scratch database is receipted by name or UUID, deletion time and a
  listing without it. The same fresh-isolate remedy replaces "a later isolate start" in rollout step 7 and the rollback.
- **These notes** (this commit): the items above owed by ac9156f and 7c98d69, the sync and News bullets, the Database
  paragraph's back-fill, the rollback's 30-day boundary, the runtime file count (62), the Tests paragraph's counts,
  design.md's reasons for findings 1-5, CLAUDE.md and README on the two refusals, runbook section 10, the test plan's
  rows 6 to 8, and the `site-admin.ts` comment on the rewrite.

**Third review round (3 Oct 2026; Codex 16:48 UTC, finding A, and review115/provisional-9fed-backend.md section 2).**
One commit: the roster's member effects as a durable, resumable worklist (`src/roster-effects.ts`, `src/roster.ts`;
`docs/design.md` gives the reasons). The diff after a complete snapshot used to apply every member's effect in the
export's own invocation; a complete roster of 1,000 links that had all just verified needed about 4,000 statement
attempts with ROLE_CALL_BUDGET 4, failed partway and after the complete stamp.
- **A run per snapshot, made with its stamp.** The stamp's batch also inserts the snapshot's run (only when the stamp
  held), with the snapshot departures are judged against (the last one whose diff was applied) and the ingest's trust
  decision; an identical export starts a new run of its snapshot, or resumes one never derived.
- **The derivation is bounded.** One batch: the GUID pins, the returns and the first absences in bulk with their audit
  rows, and every promotion, D: note and confirmed departure stored as an item in `roster_effects` (a statement per 500
  members, never one per member); older runs are superseded and their items dropped in the same batch.
- **Slices, admitted before each item.** Every statement attempt of the invocation is counted, and each item is admitted
  at its kind's worst case (`EFFECT_WORST`: promote 15, note 17, departure 6; 11 and 13 once the run's call budget cannot
  afford a grant) against `ROSTER_INGEST_STATEMENTS` (the 700 target less a cold schema check, 536); the claim rides in
  the transaction of the item's database change. Role grants go through the one role writer, within the run's call
  budget; a grant it defers is the role sweep's, as before.
- **Continuation.** Every `/ingest/roster` applies a slice, including an older or repeated export (it still answers
  "older", and now resumes the newest run first); the cron applies one more as a new line of `src/scheduled-budget.ts`
  (`continueRosterEffects`, 40 statements). A run records `done_at` when no item is left; `complete` and the fingerprint
  say nothing about effects.
- **Supersession.** Every derivation statement and claim requires its run to be the newest and its snapshot the newest
  stored, so a slice still running when a newer export is stored applies none of its remaining items, and a newer
  snapshot still being written stops an older run's slice.
- **The identity rules and sync.** Each release and rename is admitted too (the rest held for the next export or sync);
  a realm move's namesake sightings are written in bulk. `/olympus-admin sync` counts and admits the same way against
  `ROSTER_SYNC_STATEMENTS` (516) and answers "Not applied yet (N)" when it stopped short; running it again continues.
- **Small rosters as before.** An export whose effects fit its invocation applies them all at once, grants and welcomes
  included, and its run is done in the same request.
The summary the watcher receives and `roster.ingested` gain `effects` (the run, its items, what this slice applied,
whether any are pending; counts only); `roster.effects_failed` records a slice stopped by a failure (counts and an error
category). Not changed by this commit: the join events of `/ingest/events` still promote and remove per event in their
own invocation (a separate path, bounded by the watcher's batches).

**Withdrawn (owner answer 6, 3 Oct 2026).** The owner's answer 6 makes the in-game ladder ten ranks, the planner's
existing recommended order, and supersedes answer 1; so one commit takes out what .115 had built for answer 1: the role
copy's rewrite (`src/site-data.ts` is 58abea31's text again apart from the `newsOn` switch, and the members' release
note drops its line about it) and the planner's "Use the permission ladder" button (`rank-planner/app.js` is
58abea31's bytes again), with their checks, and the in-game steps for answer 1 here, in the runbook (its former section
10; section 10 is now the roster refusals), README and the test plan. The new preset's details come in .116.

**Tests.** New, in `test:all` before `owner_requests_test`: `tests/guild_seats_test.cjs` (122 checks: the cap, the
latest snapshot only, trust and sync, a probe between member batches, the stamp in the last batch and that batch
failing, an export with no members, an unfinished row inside and past the ten minutes, the trust base over pre-.115 and
unfinished rows, the launch ramp after `LINKS_NOT_BEFORE` with News finding its base, the pre-.115 back-fill, the
refusal order, `/verify-status` (an old refusal outranked by room), own rows only, `/verify`, `getQueue` and attempts
unchanged while full, `/api/me`, the staff views (an invited row not counted), fault injection, the policy texts),
`tests/site_news_test.cjs` (131: the switch, access, the switch flipped inside the read's seam, the field rules,
lifetimes by the database clock, edit refusals, replay, the tombstone, counts-only audit, the cleanup, erasure and
copies, the figures (no round trip given the cleanup's rows), the real scheduled run's D1 round trips, events, the
directory's time on the hour, release notes not newer than `BUILD`, the policy texts, a digest-only vocabulary guard
over the files .115 changes (every `worker/src` file since the second review round, the page script, the planner and
the policies), README.md, CLAUDE.md, the runbook and the .115 sections, the schema in all three places)
and `tests/rank_planner_test.cjs` (20: every page script parses, every planner file equals its pin, the planner's own
buttons over a stub DOM). Changed: `owner_requests_test.cjs` (146: typed names, the one-time rewrite, the policy
sentences), `frontend_check.cjs` (268: the consent boxes and refusal, a .115 section for every new path, lost and
refused News changes included, and the Roles page's In game facts as `site-data.ts` has them), `site_test.cjs` (361:
the tick, the counts-only log), `bundle_runtime_test.cjs` (20: the rewrite in workerd's own D1), `hosts_test.cjs` (89:
the two new modules and `schema.ts` in the bare-console scan). The three build pins (`site_test`, `hosts_test`,
`bnet_retention_test`) read .115. `npm run test:all` 2354/2354 over 28 suites, the bundle in workerd among them.
Codex's findings 1-5 (3 Oct 2026, 13:15 UTC) then grew `guild_seats_test.cjs` 122 -> 160 (the roster fixes, ac9156f:
2392/2392) and `site_news_test.cjs` 131 -> 152 with `frontend_check.cjs` 268 -> 271 (the News fixes, 7c98d69:
2416/2416). The scheduled budget (3 Oct 2026, Codex 13:26 UTC) adds `tests/scheduled_budget_test.cjs` after
`site_news_test` (54: the
table against `scheduled()`'s jobs, each job alone at its line with its workload past its cap, the schema cold and warm,
the whole run warm, cold and cold worst, the capped jobs' continuation over successive runs, the opener's unusable ids);
`role_budget_test`, `role_sweep_test` and `restore_role_test` load the real `scheduled-budget.ts` beside `restore.ts`.
`npm run test:all` with it: 2470/2470 over 29 suites. The policy and docs review fixes change `owner_requests_test.cjs`
(146 -> 165: the settings-audit read-back read from rollout step 7 and run over rows in the old shape, after the
rewrite, over a row that is not JSON, and over a save an older writer made after the marker, with the documented remedy;
the runbook's typed-name statements read from section 1 and run through its `node` line and a simulated restore, an
apostrophe, quotes, letters beyond ASCII, a withheld name and a missing row included, with no audit row added; the new
policy sentences) and `site_news_test.cjs` (152 -> 153: "never your name" for the figures only, and a notice's agreement
and removal route). `npm run test:all`: 2490/2490 over 29 suites. The second review round: `guild_seats_test.cjs` 160 ->
171 (the json_each batches and their fields, the full-guild ingest bound, the final 422 for a short stamp with the next
verification delivered, the refusal's snapshot number, every audit read guarded), `scheduled_budget_test.cjs` 54 -> 60
(the sweep's exact per-account costs, tied departures), `site_news_test.cjs` 153 -> 155 -> 167 (no id for members, event
titles and the 30-day sentence in the policy, the guard over 28 files; a simulated restore with the runbook's News
statements) and `owner_requests_test.cjs` 165 -> 166 (the restore sentence and the runbook's block and fresh isolates).
The .115 suites now count `guild_seats_test` 171, `site_news_test` 167, `scheduled_budget_test` 60,
`owner_requests_test` 166, `frontend_check` 271 and `rank_planner_test` 20. `npm run test:all`: 2522/2522 over 29
suites. The third review round adds `tests/roster_effects_test.cjs` after `scheduled_budget_test` (45: the 1,000-link
counterexample with ROLE_CALL_BUDGET 4 worked off over 11 exports and 10 cron runs, each invocation within the 700
target with its cold schema check (at most 588), every link promoted, deferred and welcomed exactly once, the run done
only at the end; a fault before an item's commit and one after it, then the resume; supersession by a newer export while
a cron slice runs and by a newer snapshot still being written; the stamp's own batch making the run, a refused stamp, a
stop between the stamp and the derivation resumed after the grace and a newer export judging against the last applied
snapshot; small rosters applied whole; each kind's worst case one item apart; a 1,000-member sync over repeated syncs;
a realm move of 300 sighted in bulk and released over admitted syncs) and changes `scheduled_budget_test.cjs` 60 -> 65
(the new line, the cron's slice on its success, failure and deferred paths, the backlog in the whole run, the schema
check's 126 and 129), `guild_seats_test.cjs` (171: the last member batch carries the stamp and then the run) and
`site_news_test.cjs` (167: 51 tables, the vocabulary guard over 29 files with `roster-effects.ts`). `npm run test:all`:
2572/2572 over 30 suites.

**Takeover correction (3 October 2026; not a deployment receipt).** The owner removed the prospective dual-signature
requirement after Claude's usage limit. Codex repaired cumulative notice-debt admission, retry retention, legacy/partial
snapshot completeness, exact-binding atomic rename/release fences, Settings/Leadership stale-save races and the News
form's unproven-absence handling. The focused roster suite now has 87 checks, seats 171, scheduler 65, tickets 59 and
owner requests 191. The final exact-head full-suite receipt supersedes those focused counts; no test of an earlier
source qualifies a later freeze. The statement allowances and 694/700 scheduled model remain unchanged. The official-art
successor must close exactly 63 runtime paths; its four shipping files and actual candidate acceptance remain separate
from source checks. Rollout, backup validation, typed-audit readback and exact-copy cleanup gates above still apply.

## Worker .116 - anonymous policy and contact candidate (6 October 2026)

This source candidate targets the standalone .115 keeper, not the separate unfinished producer composite. The policy
pages retain anonymous PolicyV5 wording and use the finite script-free shell, immutable Battle.net OFF release profile
and canonical contact/case/account forms. Account controls move from the Community card to the bottom policy surface;
saved #/data links redirect to /privacy/account. The existing current-site-session curated copy remains available to
valid denied, departed or banned identities. Case credentials, read/reply, inactivity cutoffs and exact retries remain.

The canonical privacy snapshot and case-context mechanics are dormant references. Production identify-only sign-in,
automatic site/full erasure and local Battle.net unlink remain unavailable. No generation tables, cron, account/session
producer, role writer, recovery protocol or configuration switch is added or activated. This is not full erasure or
full generation safety, and does not recall external or downloaded copies.

Before any release ROOT must check the exact final source, generator and three mirrors; run the standalone compiler,
policy/contact/session-copy suites with actual .115 schema and closed-route DB/provider tripwires; parse the real page
script; and inspect signed-out, member and denied views in the current browser, including official policy assets and
footer placement. Bundle/deploy/private backup/owner publication and provider readback gates remain separate. Historical
71/75 receipts qualify their earlier source only. No current tests, deployment or publication are claimed here.

Rollback is the separately retained exact ec0250d9 keeper source; applying rollback is the owner's reviewed operation,
not an automated database restore. This candidate changes no schema. Retain recovery/drain and typed-audit gates above.


## Worker .117 - footer and recovery wording (7 October 2026)

The public SPA footer omits its Privacy Policy, Terms, account-data and contact link row at the owner's request. Direct /privacy and /terms URLs, the Discord application's policy links, standalone privacy navigation and saved account/contact route redirects remain. The footer retains attribution and the signed-in own-avatar explanation.

The privacy inbox remains a manually reviewed conversation channel. Its form and receipt use that name; conversation credentials grant case access only. Existing-session curated copies remain partial. Automatic full erasure and Battle.net unlink remain unavailable. No authentication, schema, cleanup, role, permission, provider setting or lifetime changes are included.

The privacy policy replaces the obsolete pre-.115 export claim with the actual capture-and-destruction lifecycle. Newest-only custody and attended recovery rules remain; an export can preserve captured records until its verified replacement permits destruction or the applicable release is accepted.

Validation uses the three generated policy mirrors, compiler, real contact/session/News suites, DOM footer views and unchanged route controls. The official-art reference advances only the fixed app.js source pin and its reference digest; official image/font bytes and the approved crest exception remain. Source checks do not establish production publication: exact-head CI, bundle/asset checks and live version/route readback are separate. This patch has no schema change; the applicable exact-release backup and deployment gates remain in force. Rollback is the accepted .116 source; no automatic database restore.

The existing reconciliation helper also advances its two dependency pins to the reviewed art-reference successor; its historical policy/source constraints remain. The publication-helper smoke check must load its --help path without a dependency pin refusal.

## Worker .118 - captured own-account action history (7 October 2026)

Account data controls add script-free action-history pages and a separate current-page JSON download through the
existing POST export form. Default downloads and the initial GET copy remain; query-string continuations are refused.
The captured range excludes later/backdated inserts and the traversal's own audit entries. Canonical signed cursors
bind to the original account, session version and expiry, while every page retains the existing admitted database
version/clock fence. Detectable retained-range changes refuse 409 without claiming completed history.

All other copy sections remain curated and are read afresh for each download. Views and downloads share the existing
soft five-per-hour limiter; the UI and policy disclose that longer histories can require a later window. No all-store
snapshot, complete export, erasure, identity authority, saved-file proof or bounded COUNT workload is promised.
Readonly current/next continuation fields and a validated 429 history retry let the account save its place privately;
reopening account controls refreshes CSRF for the saved value without renewing the original signed session.

Before release, check the exact final source and generated privacy mirrors; run compiler, vectors and house-style
real-SQLite account-copy, script-free form/News and frontend regressions. Cover tied timestamps, actor-or-subject
ownership, exact multi-page union, later/backdated inserts, missing retained rows, tampered and cross-session cursors,
session invalidation/expiry, denied/left/banned own-session access, HTML escaping and the mixed view/download rate limit.
Representative unrelated audit volume must exercise the actual SQL without treating a local timing as a D1 SLA.

Exact-head CI, bundle/asset/native checks, publication, provider version/settings and canonical route readback remain
separate release gates. The official website assets and existing app.js pin are unchanged. This patch has no schema or
configuration change; it uses the retained verified release backup. Rollback is the accepted .117 source, with no
automatic database restore. Release evidence must identify the exact commit and actual checks; this section is a plan,
not a deployment receipt.


## Worker .119 - captured own event-change history

Change: the curated copy now includes a separate captured and paged actor-owned event-change range. Each row exposes
only event ID, change kind, time and distinct known changed-field names. It does not return stored values, event
details or other actors. Current/Next continuations use a separate HMAC purpose/collection and genuine current
account-version/expiry admission. JSON downloads validate both datasets before their copy audit; history views validate the selected dataset. A selected JSON range is
resumed while other sections are freshly read; all-store and immutable-content completion are not claimed.

Configuration: no schema, index, asset, dependency, lifetime, role or production switch changes. Identity-only
sign-in, automated erasure and Battle.net unlink stay unavailable; Battle.net login remains OFF. The existing exact
account export POST route is reused with strict dataset/body-field/CSRF pairing. All views/downloads share the
unchanged approximate five-read hourly budget. Private rate-window continuation keeps the original signed session.

Validation before publication: typecheck, policy generation and exact mirror/digest check, shared vectors, existing
account/News/frontend/host/site/Battle.net and community event suites, plus new real SQLite/session/form/HMAC fixtures
covering zero and multi-page ranges, ties/foreign interleaving, later/backdated inserts, deletions/actor/tuple changes,
malformed stored projections, cross-dataset/account/expiry/version tokens, strict empty-field pairing, CSRF/origin
and shared-limit/private-resume behavior. Qualify the exact commit/tree, bundle runtime and official-asset parity;
required main CI and current-version/provider/browser receipts remain separate gates. Test counts and receipts belong
to actual executions, not this checklist.

Rollout: use the current owner-authorized exact-commit publication/deployment path after those gates. Preserve the
verified newest private export. Confirm deployed version and unchanged bindings, typed-name audit marker1/residual0/
unreadable0, policy/assets parity, then the normal signed-account action and event history forms without putting
private continuations in URLs. Any necessary firewall exception requires its separate exact action-time approval.

Rollback: stop qualification and preserve uncertain-command receipts. This change has no schema replacement; an
exact prior source deployment is a separately admitted provider action. Do not restore a database, regenerate a
continuation for a different session, reset a quota, reissue an uncertain upload or change a closed feature switch
as an automatic rollback. Existing backup custody and preservation-critical writer-drain rules still apply.

## Worker .121 - High Council planner and AddOn guidance (9 October 2026)

Change: current ten-rank recommendation, separately attributed High Council catalogue option, preserved v1 drafts,
explicit owner-policy provenance in new v2 drafts, and the existing owner-approved crest for brand/tab use. All High Council draft
holders have the approved gold/tab toggles; Raid Leader keeps the authenticator safeguard; Veteran has its
repair toggle without invitations. Numeric non-GM allowances remain zero. AddOn 0.6.5 adds informational /olv ranks guidance.

Configuration: no schema, bindings, secrets, role writer, permissions, retention, authentication or feature switches
change. F3 deletion/central-authority proposals remain outside this release. No native rank setup, reset or appointment
is applied. Original catalogue data and saved browser drafts remain available; using the new recommendation is explicit.

Validation: real planner DOM/model regressions include a genuine .120 export round trip, unchanged browser storage,
explicit adoption, rejected forged policy/approval claims, sensitive toggles, zero allowances and positional warnings.
Run required Worker checks, exact source/art pins, bundle runtime and CI; offline AddOn suites and source/installed byte
parity are separate from the owner's full game restart, /olv ranks and /olv status live check. The new TOC module loads
at client startup; /reload alone does not load it. Confirm AddOn 0.6.5 and no Lua error. Record the qualified commit and provider
version. Preserve the newest verified recovery export; this update changes no schema or database lifecycle.

Rollout: publish only the reviewed independent source, wait for exact main CI, deploy its exact committed export and
verify /health plus changed assets byte-for-byte. Preserve the AddOn's local Config.lua and runtime data when installing
only reviewed code files. Export browser drafts before any rollback: .120 cannot read the new v2 draft format.
Rollback uses the separately admitted preceding .120 source; do not restore a database or
reset credentials, counters, queues or roles automatically.

## Worker .120 - captured own contribution-decision history

Change: a third curated partial range includes retained subject/member-actor/staff-actor contribution decisions,
deduplicated when both links match. Only recognized action, time and own relation are returned. JSON downloads
validate all three history datasets before their details-null copy audit; history views validate the selected range.
Legacy actor-only aliases, counterpart identifiers, payment evidence and arbitrary stored text are not projected.

Configuration: no schema/index/asset/dependency/binding/lifetime change. Existing identity-only sign-in, automatic
erasure and unlink remain unavailable and Battle.net login stays OFF. The existing account POST accepts a strictly
paired contribution_decisions selector/contributionDecisions field with a separate HMAC purpose and CSRF binding.
The original action/event forms and API default JSON remain compatible; all views/downloads share the original
approximate five-read account/hour limiter once per request. Resumption does not renew the original signed session.

Validation before publication: ROOT must run typecheck/vectors, the actual policy generator/mirror check, account,
frontend/News/owner/privacy/site/host/Battle.net and contribution regressions. The proposed additions cover live
subject/actor/both and legacy exclusions; zero/1/1000/1001/2005 boundaries; tied timestamps/foreign interleaving;
later/backdated insert exclusion; retained deletion/expiry/ownership/order changes; malformed stored/returned rows
including lookahead; HMAC/account/session/version/expiry mismatch before payload; genuine DB-clock fences;
strict dataset/field/mode/CSRF/origin pairing; real script-free Current/Next; shared quota/private429 and same-session
later-window resumption. The 6001-own/100000-unrelated fixture records query plans/local timing without a D1 SLA.
Actual test, native, asset, exact-commit CI, bundle/private parity and provider/browser receipts are separate gates.

Rollout: only the owner-authorized exact-commit release path after those gates, preserving the verified newest
private export and all uncertain-action receipts. Check actual version/bindings/policy/asset parity and the third
script-free account form. No current candidate document is publication, adoption, provider or Claude acceptance.
Rollback: separately admitted prior-source deployment, no automatic database restore, quota reset, uncertain upload
retry, continuation reissue for another session or activation of a closed control.

## Worker .122 - public post-beta role guidance (9 October 2026)

Change: the public role descriptions use proposed post-beta guidance instead of promising the old Captain rank or
a native Treasurer rank. Co-GM and Treasurer are High Council appointments; Officer is below High Council in the
proposal. High Council bank-rights and Raid Leader authenticator guidance remain subject to attended GM setup,
and no numeric bank allowance is approved. The current native ladder is neither certified nor changed.

Configuration: no schema, binding, secret, role ID, application key, group, voting seat, appointment default,
authorization, bank permission, queue, retention, dependency, asset or feature-switch change. Only the reviewed
ten copy windows, BUILD, the three build-test pins, the obsolete role-description regressions and dated documentation
change. F3 design, central-authority activation and native setup remain outside this release.

Validation: run typecheck and the real site, host, Battle.net retention and frontend suites, including the public boot-data
copy boundary and unchanged application/appointment choices. Required full Worker, policy, asset, bundle and CI
qualification belongs to the exact release commit; actual Claude scoped review and provider/browser receipts are
separate gates. Record executed checks rather than treating this checklist as their results.

Rollout: publish only after the owner's reviewed exact-commit gates, then verify the .122 build and updated public
role descriptions. No native permission or role assignment follows from the copy. No database migration or backup
lifecycle change is needed. Rollback is a separately admitted prior-source deployment; do not change guild ranks,
roles, bank limits, credentials, counters or queues as an automatic rollback.
