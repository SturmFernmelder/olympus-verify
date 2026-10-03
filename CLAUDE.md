# CLAUDE.md

Guidance for the AI coding agents working in this repository (Claude Code reads this file; ChatGPT Codex reads
`AGENTS.md`, which points here). It describes how the code is built and the rules that are easy to break. For what is
deployed and what is open, read the tail of the task log (below) and `docs/deploy-checklist.md` (newest build last).

**Current owner instruction (3 Oct 2026):** Claude Code reached its weekly usage limit; Viktor instructed Codex to
"Take over from here and finish the task yourself without a dual sign off." The interrupted .115 work is preserved
at local non-release checkpoint `568c76d958eeee2f2786798bd959b0b2ae8ec299`; it is not a release qualification.
Codex now carries implementation and exact-commit release qualification under the collaboration rules below.
Historical ownership and signatures remain historical evidence; no new Claude signature is required or implied.

## What this is

Olympus Verify: one Cloudflare Worker (`worker/`, TypeScript, D1) that is the Discord bot for the Olympus guild
(`/verify` with in-game whisper codes, `/verify-status`, `/olympus-admin`, the pinned guide and the channel intros),
the Linked Role and Battle.net login flow, the endpoints for the officer-side Python watcher (`watcher/`), and, on
`SITE_HOST`, the guild site (applications, roles, voting board, friends, reserved names, professions, admin pages). A
WoW addon (`addon/OlympusVerify`) on the officer's client checks codes offline, fires one guild invite per key press
and exports the roster. `tools/` holds operator scripts; `policies/` the privacy and terms pages; `docs/` the design,
deploy checklist and test plan.

Since 30 Sep 2026 this repository is also the target of the consolidation with Olympus Forever (the second Worker at
`Olympus Forever/`): Olympus Verify is the keeper, Forever's better mechanisms are ported here one reviewed commit at
a time, and the site moves from `guild.roachcouncil.com` to `olympus.roachcouncil.com`. Task log:
`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`. Earlier coordination: `Olympus/claude_x_chatgpt.md`.

## Commands

All from `worker/` unless said otherwise. Node 24 (`.nvmrc`); the suites need `node:sqlite` (Node 22.13 or later).

```bash
npm run typecheck                          # tsc --noEmit over src/
npm run check:vectors                      # the 12 shared code vectors (Python, TypeScript and Lua must agree)
npm run check:policies                     # src/policy-content.ts is what policies/*.html give (regenerate: npm run build:policies)
npm run test:all                           # typecheck + vectors + every node suite (real src/*.ts over SQLite) + the bundle in workerd
node tests/bundle_runtime_test.cjs         # the exact dry-run bundle loaded in local Miniflare/workerd (~15 s)
node tests/site_test.cjs                   # one suite (361 checks); each suite prints PASS/FAIL and a total
node tests/frontend_check.cjs              # the REAL public/static/app.js in a minimal DOM against the REAL Worker (271 checks, .93-.115)
node tests/role_budget_test.cjs            # the role writer's request budget: the real discord.ts rest() behind a stubbed fetch (.95/.99)
node tests/guild_seats_test.cjs            # .115: whether Olympus I has room (latest snapshot, trust, the texts, the staff lines, the ingest's statement bound; 171 checks)
node tests/site_news_test.cjs              # .115: News (switch, notices and their ledger, figures, the cron's D1 round trips, the vocabulary guard, a restore's News statements; 167)
node tests/scheduled_budget_test.cjs       # .115: the cron's D1 statement budget (scheduled-budget.ts): each job, the role sweep's per-account costs exactly, cold and warm schema, the whole run, continuation (65)
node tests/roster_effects_test.cjs         # .115: worklist, notice debt, incomplete/legacy snapshots, retries, binding races and sync (87 focused checks at takeover repair; final exact-head receipt remains authoritative)
node tests/rank_planner_test.cjs           # .115: every page script parses, every planner file equals its pin, the planner's own buttons (20)
python tests/unverified_sql_test.py        # SQL suites (from worker/)
python tests/backfill_sql_test.py
npx wrangler deploy --dry-run --outdir <scratch>   # bundle without deploying
# from watcher/:
python tests/test_watcher.py               # 61 tests (2 skipped without a lua binary)
python tests/test_discord_relay.py         # 16 relay cases
# from the repository root:
python tools/tests/test_backfill_roles.py
python tools/tests/test_review.py
bash scripts/tests/deploy-commit.test.sh     # the deploy script's argument contract, with a fake wrangler
bash scripts/tests/cutover-config.test.sh    # the cutover configuration differs from the live one in exactly the expected keys
bash scripts/cutover-config.sh               # show that difference (--check in CI; --apply only as the final cutover step, after the gates; --activate after it, activation keys only)
bash scripts/tests/publication-helper.test.sh # the publication helpers compile, answer --help and load their pinned reference (docs/source-provenance.md)
# addon suites: no system Lua; use the lupa/LuaJIT venv
"C:/Users/vikto/OneDrive/Apps/Olympus Forever/.local-tools/lua-attestation/Scripts/python.exe" addon/tests/run_lua_suites.py
```

CI (`.github/workflows/ci.yml`) runs three jobs (worker: Gitleaks history scan, `npm ci` in `worker/`, `test:all`,
the SQL suites, a syntax check of `public/static/app.js`, the deploy-script contract test, a dry-run bundle; watcher:
the watcher and tools tests; addon: the Lua suites through Lupa 2.8) and one aggregate `check` job that always runs
and fails unless all three report exactly `success` (`scripts/ci-gate.sh`; GitHub alone would count a skipped
required job as passed, so the gate fails on a skipped, cancelled, failed or missing result), which is the status
the ruleset on `main` requires. There is no ESLint or Prettier;
`.editorconfig` sets the style (2 spaces, LF, final newline; Python 4 spaces).

**Never run:** `npm run deploy` or `wrangler deploy` (Viktor deploys, from an exact commit with
`bash scripts/deploy-commit.sh <sha>`); `wrangler secret put` (owner only, it redeploys at once); `npm run db:init`
against the remote database (it re-applies `schema.sql`; the Worker migrates itself in `src/schema.ts`);
`npm run register` / `register:intros` (owner, they rewrite the guild's command list); the watcher against the live
Worker; `scripts/cutover-config.sh --apply` before the cutover's gates are met (it is the authorized final source/config
step: applied once, committed, rechecked and release-qualified on that exact commit before the deploy; it makes the
next deploy of `main` serve Asmongold's server); `scripts/stage_publication.py`, `scripts/validate_publication.py` or
`scripts/reconcile_public_root.py` beyond `--help` (staging a public snapshot is the owner's step on the final release-qualified head, with the externally
reviewed asset contract and manifest; the helpers never fetch, commit or push, but the step is not an agent's);
anything that reads `watcher/config.json`, `worker/.dev.vars` or `Config.lua`.

## Layout

| Path | Contents |
|---|---|
| `worker/src/` | The Worker. Entry `index.ts` (routes, cron, `BUILD`), `env.ts` (bindings and vars), `discord.ts` (REST, interactions), `interactions.ts` (commands), `ingest.ts`/`roster.ts`/`restore.ts`/`unverified.ts` (watcher endpoints, roster diff, role sweep), `oauth.ts` (Linked Role, Battle.net login), `bnet-retention.ts` (the 29-day purge, `bnetFresh`), `intros.ts`/`lookup.ts`/`guide.ts` (Asmongold's server), `site*.ts` (the guild site; `site-news.ts` is News since .115), `guild-seats.ts` (.115: whether Olympus I has room; informational only), `scheduled-budget.ts` (.115: the cron's D1 statement budget and the per-run caps), `roster-effects.ts` (.115: the roster's member effects as a durable worklist; the statement counter and the worst cases), `roles.ts` (the one Guild Member writer), `community-*.ts` (the Forever modules behind `COMMUNITY_FEATURES`: `context.ts` is the fence every write goes through, `names.ts` the identity rule), `schema.ts` (self-applied migrations) |
| `worker/schema.sql`, `worker/migrations/` | The canonical schema and the same statements as dated files. Additive only. |
| `worker/public/static/` | The site's script (`app.js`: the whole site, including the community member, organizer and staff pages since .93-.100), stylesheet, the game art (`tools/build-site-assets.py`), the Olympus crest `olympus-icon.png` (the brand and tab icon, the website's one non-game image since .111) and the rank planner. |
| `worker/tests/` | Node suites (`*_test.cjs`) and Python SQL suites. Each transpiles the real `src/*.ts` and runs the real `schema.sql` in SQLite behind a D1-shaped shim; only Discord's HTTP side is faked. |
| `addon/OlympusVerify/`, `addon/OlympusProbe/`, `addon/test/`, `addon/tests/` | The addon, the read-only probe, the harness and the Lua suites. |
| `watcher/` | The Python watcher (stdlib only) and its tests. |
| `tools/` | `guild-map.py` (server map through the Worker), `backfill-roles.py` (dry-run by default), `build-site-assets.py`. |
| `policies/` | The tracked Privacy Policy and Terms of Service. Since .65 the Worker serves them at `/privacy` and `/terms` from `worker/src/policy-content.ts`, GENERATED by `worker/scripts/build-policy-content.mjs` (`npm run check:policies`, part of `npm test`); edit the HTML here, then regenerate. The GitHub Pages mirror publishes the same files. |
| `docs/` | `design.md` (why), `deploy-checklist.md` (every build: what changed, rollout, rollback, tests), `launch-runbook.md` (the owner's steps from the signed head to the launch: deploy, the donor's private phase as a gate, the cutover, the flags, publication; then the end of the beta, typed names and what officers do when a roster export is refused (section 10); the in-game ladder decision changed on 3 Oct 2026 (owner answer 6: ten ranks, the Treasurer at index 2 right below Officer, no Probation), and its planner preset and in-game steps come in a later release), `source-provenance.md` (what is tracked and what never is, the generated and derived files, the ported modules, the publication helpers and what publication means), `beta-test-plan.md`, the Asmongold docs. |
| `scripts/` | `deploy-commit.sh` (deploy an exact commit), `scan-secrets.sh` (CI), `cutover-config.sh` (.77/.81: shows, checks or, as the final authorized cutover step, applies `worker/wrangler.cutover.toml`, the reviewed cutover configuration kept beside the live `wrangler.toml` so a deploy before the cutover still serves the current server; `--check` accepts two committed states, the reviewed pair or the applied state bound to the profile by the marker `worker/wrangler.cutover.applied`; after the cutover, `--activate` changes only the eight activation keys (the seven community keys and `VERIFY_OPEN_SINCE`, which only moves forward to a real later `YYYY-MM-DD` day) and appends a record to the marker, never rewriting the cutover's own); the publication helpers (Codex's V4, 1 Oct 2026: `publication_audit.py`, `public_history.py`, `official_assets.py` with `official_asset_reference.json`, `stage_publication.py`, `validate_publication.py`; Python 3, standard library; byte-identical to the reviewed candidate except a disclosed LF normalization), and Codex's Pages reconciliation successor (`reconcile_public_root.py` with its hash-pinned `pages_network_guard.cjs`, 1 Oct 2026, exact reviewed bytes), described in `docs/source-provenance.md`. `LICENSE` is proprietary; `THIRD_PARTY_NOTICES.md` names what is not the owner's (the game's interface artwork and the two fonts above all). |

## How the Worker works

- **Routing** (`src/index.ts`): the host is classified first (`classifyHost`: site, bot = `PUBLIC_BASE_URL` or
  localhost, legacy = `SITE_LEGACY_HOSTS` answered with a 301 to the site, unknown = 404, a bad `PUBLIC_BASE_URL` =
  503 for everyone), before the database is touched; then `ensureSchema` (the Worker migrates its own database; until
  it succeeds the watcher gets 503 and commands say "try again"); then, on `SITE_HOST`, `handleSite`; otherwise the bot
  routes. Every fetch that carries a credential goes through `credentialFetch` (never follows a redirect, 8 s
  timeout). `/health` is public only as `ok`/`build`/`d1`; the inventory needs the watcher's bearer. Since .51 every
  request runs the Worker (`run_worker_first`): `/static/*` is handed to the `ASSETS` binding on the site host only,
  and a legacy host answers sign-in and OAuth paths with an uncached 302 to the site's front page, never a forward.
  `POST /interactions` (build .47): body capped at 128 KiB before decoding, Ed25519 signature over timestamp + body
  with a 300 s window, `application_id` must be ours, and a command/button/form id is written to `seen_interactions`
  before it runs and refused if already there. Ping and autocomplete are not ledgered.
- **Timestamps are Unix seconds** everywhere (`db.ts now()`); Forever used milliseconds. Never mix them.
- **Codes:** `HMAC(VERIFY_SECRET, name | day)` for a character code, a 7-symbol ticket for a request code; the same
  vectors are checked from Python, TypeScript and Lua (`npm run check:vectors`, `watcher/tests/vectors.json`).
- **Roles follow the roster:** a roster export from the addon is the truth for Guild Member; a chat-log line can only
  arm a removal, never perform one; an export below `ROSTER_MIN_MEMBERS` or more than `ROSTER_MAX_SHRINK_PCT` smaller
  than the last one is stored but removes nobody. Since .115 an export whose names collide once normalised is refused
  whole (422, nothing stored or read; `roster.duplicate_names`), and so is one whose stored rows fall short of its count
  after every batch committed (`roster.ingest_unusable`; a batch that throws is still a 500 the watcher retries); the
  member rows go in one `json_each` statement per batch of 50, so a changed full-guild export stays far below D1's
  per-invocation limit (`ROSTER_INGEST_STATEMENTS_FULL_GUILD`); `/olympus-admin sync` decides admission on the rows it
  would apply, before any link, character or role effect, and refuses a snapshot still being written or storing fewer
  rows than its count (Codex, 3 Oct 2026 13:15 UTC, findings 1 and 2; the second review round). The effects after a
  complete snapshot are a durable worklist (`roster-effects.ts`; Codex, 3 Oct 2026 16:48 UTC, finding A): a run per
  snapshot made in its stamp's batch, derived in one bounded batch (pins, returns and first absences in bulk; every
  promotion, D: note and confirmed departure an item), applied in slices by every export and the cron, each item admitted
  at its worst case against the invocation's counted statements before it starts and claimed in the transaction of its
  change; a newer run supersedes an older one; `done_at` on the run, never `complete`, says the backlog is empty; a sync
  admits the same way and says "Not applied yet". Links are pinned to
  character GUIDs. Since .55 `src/roles.ts` is the
  one writer: every grant goes through `grantMemberRole` (blocking-role guard, fail-closed config check); only the
  sweep (`removeIfBlocked`), a roster departure and a ban remove the role. New modules never call `addRole`. Since
  .114 a rename Blizzard required (`src/rename-review.ts`) holds every grant while a `rename_holds` row is `reapply`
  (`"held"`), and `revokeForReapply` is the one remover added since .55 (at the decision; the hold is re-read after the
  member GET and after a grant's PUT, and held accounts join the sweep's banned reconciliation).
- **Seats** (`src/guild-seats.ts`, .115, Viktor's item B of 2 Oct 2026): whether Olympus I has room is read from the
  LATEST roster snapshot only, and only when it is complete (stamped in the same batch as its last member rows; a row
  still unfinished `SNAPSHOT_WRITE_GRACE_S` after it arrived is "stuck" and the next export writes it again), trusted
  (judged against the last export that counts, on or after `LINKS_NOT_BEFORE`, pre-.115 rows re-judged in order
  (`roster.ts seatBase`); with no such base the ingest's own decision stands; an identical re-export never raises it;
  `/olympus-admin sync` vouches for it, audited), exported on or after `LINKS_NOT_BEFORE` and fresh (`ROSTER_SEATS_FOR`,
  48 h, beside `ROSTER_CURRENT_FOR` in `roster.ts`). A refused invite within 6 h, on or after `LINKS_NOT_BEFORE`, also
  says full: when the latest export decides, only if the refusal is newer than it. Otherwise "unknown", which makes no
  claim. The cap is `GUILD_MEMBER_CAP` (900..1000; unset or anything else is 1000, never "unknown"). The state is
  informational only: it never touches the queue, codes, roles, removals or invite attempts, and `guildSeats` never
  throws (errorRef). Times shown to members are rounded down to the hour (they would show when the officer was online);
  staff views keep exact times; a place in line reaches only its own account.
- **The bot never DMs** (25 Sep 2026, Discord Developer Compliance). Notices go to `CHANNEL_NOTICES`; every command
  reply is ephemeral with `allowed_mentions: {parse: []}`.
- **Battle.net is optional** for `/verify` since build .32 (25 Sep 2026): the in-game whisper is the proof of
  control. Do not re-gate admission on it. Since .48 Battle.net-derived data is purged 29 days after the last
  Battle.net login (`src/bnet-retention.ts`); read it only through `bnetFresh`, and never invent a `linked_at`. Since
  .50 the tag never enters a persistent Discord message (cards, log lines, the linked-role record) and nothing
  derived from it outlives it; read-only commands are not ledgered so a stored answer cannot outlive the record.
  Since .114 the login is switched off (`src/bnet-switch.ts`): it is on only with the secrets, a privacy policy carrying
  the marked Battle.net section (`PRIVACY_DESCRIBES_BNET_LOGIN`, generated) and the site admin's `bnetLogin` setting;
  every route refuses before any audit, cookie, redirect or exchange, and the bind's write carries the setting. The purge
  stays unconditional.
- **The site** (`site.ts`, `site-core.ts`): HMAC-signed `__Host-olg` session cookie with a per-user
  `session_version`; every write needs the page's `X-Olympus` header and a same-origin `Origin`; CSP is self-only
  for images too (.112: no `data:` images), except Discord's picture host for the member's own picture in the top bar
  (.114, `app.js ownAvatar`, avatar addresses only); `Cache-Control: no-store, no-transform` so Cloudflare injects nothing.
- **The page script** (`public/static/app.js`, vanilla, one IIFE, no bundler): `h(tag, props, ...kids)` builds elements
  (text through `textContent`, never innerHTML; `value` is set as a property; `href` is set only for a fragment, a
  root-relative path or an `https:` URL, and `src` only for a root-relative path (.112: images come from this site:
  the official game art and the crest); anything else is dropped; which URL a caller passes, and where it came from, is
  that caller's responsibility, e.g. the server-provided `S.joinUrl`); `frame`,
  `noticeBox`, `fieldBox`, `selectOf`, `confirmBox(title, bodyText, okText)` (the body is a STRING); `api(method, path,
  body)` throws `ApiError {status, data}`; the hash router `ROUTES[head](main, parts)`. The community pages (.93-.107)
  read the boot's `community` context (`contextDto`) and re-read it after a 403/503 (`refreshCommunity`, which re-renders
  once when it changed); every refusal is shown in words with the Worker's fresh state; an operation whose answer was lost
  freezes its exact bytes and allows only "retry the same" or a check (.100). `tests/frontend_check.cjs` runs the real
  script in a minimal DOM shim (`dataset` reads `data-*` attributes) with `fetch` routed to the real Worker; a test can
  lose a handled answer (`page.drop`), slow a request (`page.delay`), make a handled answer unreadable (`page.garble`) or
  readable but wrong (`page.answer`), fail a request before the Worker (`page.before`), and act between one request's
  batches (`HOOKS.afterBatch`) or between two statements of one batch (`HOOKS.afterStatement`); add a check there with
  every page change.
- **Community modules** (`community-*.ts`, since .56): one identity (the site session), facts from keeper tables only,
  capabilities that name requirements (`applicantWrite`, `confirmedGuildData`, `communityStaff` = `SITE_ADMINS`); a
  write is one batch whose first statement carries `fenceSql` (id, session version and the cookie's expiry, judged by
  the database clock inside the statement) and stores a nonce the rest requires; every feature
  registers erasure and export (`registerCommunityData`) before it stores a row; seconds everywhere, `time.ts` at the
  DTO boundary; tables are `community_*`; character labels are keyed by `names.ts communityKey` (the full name, never
  cut at a hyphen) and bound to a keeper proof only when `resolveCharacter` says `proven` (a collision is `conflict`,
  default-denied, never last-writer-wins); no module ever calls `addRole`.
- **News** (`src/site-news.ts`, .115, item A): a `site-*` module on those primitives (fence, nonce, registry) with
  `site_news_*` tables, behind `SiteSettings.newsOn` (off until an administrator switches it on; no row is off), for
  confirmed members only (`confirmedGuildData` through `admittedRead`, whose batch reads the switch again). Automatic
  items are counts and times, never names (application counts below 5 show as "few"), except the next events' titles,
  which are their organizers' free text as on the Calendar (review of 3 Oct 2026); notices are free text, so the policy's
  "never your name" covers the counts and times only and a notice names a member only with agreement and is changed or
  deleted on request (Codex, 3 Oct 2026 13:24 UTC); the cron (`newsCron`) caches the
  figures at most every 3 h, and only while News is on, reading the switch in the cleanup's own batch and again in the
  write. Notices are plain text with a lifetime of 1 to 90 days computed in SQL by the database clock; every create
  leaves a record in `site_news_ops`, a tombstone kept 120 days from the create (never removed while its notice exists),
  and its id, handed out by Admin -> News with the database's time in its first eight characters, creates only within 30
  days of that time (`opIssueMaxAgeS`, Codex's finding 5 of 3 Oct 2026), so a stale "Retry the same" either meets the
  record or is refused for its age and can never post a deleted or expired notice again. The time is not signed: it
  bounds a fixed id (a stale retry) and proves nothing about where an id came from; an id a staff client builds with the
  current time behaves like a fresh form on this staff-only route. Members never get a notice's id (it would say when an
  administrator opened Admin -> News). A stale delete of an expired notice gets its id and revision, never its text.
  Audit rows carry counts, never a title or a text. The members' "Site updates" are `RELEASE_NOTES` in the same file
  (site_news_test: the newest is never newer than `BUILD`).
- **Typed names** (.115, item C): a name an administrator types (an appointed role in Settings, the I-X directory) is
  added or changed only with `namesConfirmed: true` (the page's consent box, the person agreed); `NAME_WITHHELD`
  ("Name withheld") replaces a name removed on request and keeps an appointed role closed. The `site.settings` audit
  records role keys, a count and booleans, never a name or the notice text; `schema.ts redactSettingsAudit` rewrites the
  older rows once at an isolate start (marker `auditTypedNames`). A failure only logs and a later start retries, and an
  older writer resumed after the marker writes the old shape again, so the counts-only read-back (marker 1, no named
  `appointed` or text `notice` left, no unreadable row; `docs/deploy-checklist.md` .115 rollout step 7, read by
  `owner_requests_test`) is a mandatory acceptance gate after every deploy, roll-forward and restore; "a later start" is
  a fresh isolate (`ensureSchema` checks once per isolate); redeploying the same commit invokes the new-isolate recovery
  path but does not prove old invocations have ended. A restore is unavailable unless actual write quiescence is
  separately proved before the final private capture and maintained through replacement, replay and read-back:
  every preservation-critical writer, all serving/retiring versions, pending SQL and post-response work must be covered.
  WAF closure stops new website admissions; a fixed wait, equal captures, a staff promise or ordinary redeployment
  proves no such drain. Only under that precondition are the `appointed`/`leadership` rows preserved privately and News
  edits/deletions/tombstones replayed. A commit-time maintenance epoch that survives restoration and rejects stale
  writers after reopening is a future design, **not implemented** (`docs/launch-runbook.md` section 1; Codex's
  restore-drain qualification and the owner's takeover instruction, 3 Oct 2026).
- **Logging hygiene:** never log URLs with query strings, tokens, codes, cookies, BattleTags or IPs. Discord errors
  keep the path without the query. Audit rows carry no secrets. Since .51 every `console.*` call that reports a
  failure goes through `log.ts errorRef` (a fixed category and a bounded status; never the message, the name or a
  digest of either); the hosts suite fails on a bare one. Workers Logs keep what is printed.
- **The entry exports functions only.** `src/index.ts` may export the default handler and functions; a scalar export
  makes workerd refuse the bundle at startup (.47 to .50 did not start). `tests/bundle_runtime_test.cjs` loads the real
  dry-run bundle in workerd and is part of `test:all`.
- **Fail closed:** an unknown roster or Discord state holds a grant and never revokes.
- **The cron's D1 budget** (`src/scheduled-budget.ts`, .115, Codex's finding of 3 Oct 2026): the conservative source/test
  accounting charges every statement attempt, each batch element included, and composes `scheduled()` with every job
  it hands to `waitUntil` into one invocation budget against the recorded Paid limit of 1,000. This is not a
  provider-confirmed claim about aggregate batch accounting. Each job's worst case and the per-run caps (role sweep accounts, names, expired profiles,
  weekly obligations, the roster effects' slice) live in that one table, whose recorded target is at or below 700, and the
  allowances of `/ingest/roster` and `/olympus-admin sync` are derived from it; a capped job continues in a fixed order on
  the next run. A new scheduled job, a new schema statement or a raised cap changes the table first;
  `tests/scheduled_budget_test.cjs` measures that accounting model against the source. The interrupted .115 figures
  remain provisional until the roster correction and final exact-head qualification; no caps change by documentation.

## Conventions

- **Every deployable change bumps `BUILD`** in `src/index.ts` (`YYYY-MM-DD.NN word`), moves the three build pins
  (`tests/site_test.cjs`, `tests/hosts_test.cjs`, `tests/bnet_retention_test.cjs`), and adds a "Worker .NN" section to
  `docs/deploy-checklist.md` (what changed, config, rollout, rollback, tests) and, where the reason matters, a dated
  section to `docs/design.md`.
- **Tests with every change**, in the house style: a `.cjs` script that transpiles the real source, runs the real
  schema, fakes only Discord, prints `PASS`/`FAIL` per check and exits non-zero on any failure; add it to `test:all`.
- **Comments say why**, and cite the decision and its date ("Viktor's decision (2026-09-25)", "build .47").
- **Schema changes** go into `schema.sql`, `src/schema.ts` (idempotent, `CREATE ... IF NOT EXISTS` / `addColumn`) and
  a dated file under `migrations/`, all three.
- Bound every D1 value; SQL text interpolates only compile-time fragments. Keep bound parameters per statement under
  100.
- Files are LF; `*.bak*` siblings are ignored by git and should not be created any more (git is the history).

## Collaboration and release qualification (owner takeover, 3 Oct 2026)

- **The task log is append-only.** Headings `## [YYYY-MM-DD HH:MM:SS UTC] Agent — subject`. Never rewrite the other
  agent's text; correct with a new entry.
- **Current qualification:** the owner's direct takeover instruction supersedes the mandatory dual-signature and
  Claude-only ownership rules for new work. Codex may implement the remaining repository work, including source,
  tests, schema, docs, policies and repository guidance, within each expressly assigned batch. Keep parallel file
  ownership explicit and do not overwrite another active author's changes.
- **Exact evidence:** Codex records its own scope and release qualification on the exact final commit/tree, with
  applicable source review, independent peer-review evidence, tests, bundle/assets/policy parity, CI and required
  actual-version/live checks or expressly named residuals. An earlier head or interrupted checkpoint does not qualify
  changed bytes. Single-Codex qualification may release under the same substantive gates; it is not Claude approval.
  A subagent review is separately attributable peer evidence, never a fabricated Claude countersignature.
- **Historical attribution:** the 30 Sep ownership split and earlier dual signatures remain records of their own
  scopes and versions; do not rewrite them or infer that Claude is still running after the confirmed usage limit.
- **Owner gates (Viktor):** deploys, secrets, live Discord/Cloudflare/GitHub/Battle.net changes, permission changes,
  the domain and repository renames, account deletion, new dependencies. Agents prepare exact steps; Viktor runs
  them, or Codex where Viktor has authorized it in the log.
- **Never** type or print a secret; never DM a member; never `git push --force`; never switch branches in this shared
  checkout (use a worktree elsewhere for anything not on `main`).
