# CLAUDE.md

> Local paths below are examples. Replace `C:/path/to`, `C:\path\to` or `<your-user>` with your own checkout or account before running a command.

Guidance for the AI coding agents working in this repository (Claude Code reads this file; ChatGPT Codex reads
`AGENTS.md`, which points here). It describes how the code is built and the rules that are easy to break. For what is
deployed and what is open, read the tail of the task log (below) and `docs/deploy-checklist.md` (newest build last).

## Current Evergreen audit (4 November 2026)

Production Verify .228 shipped at commit `68548e8cff218bdb06b5db9d1f8524235e160363`, tree `291e2e788e5b0a387ba69667b2929b285715074b`. The .229 launch operations successor is prepared under the owner's 5 November instruction; this source paragraph does not assert its deployment. The canonical site is `olympus.roachcouncil.com`. The announced launch time was 4 November at 23:00 UTC. The owner-authorized production queue switch is off. Check the append-only shared log for subsequent live readbacks and launch decisions. The .229 operator guide is `docs/launch229-operator.md`.

The owner's **permanent restructuring mandate of 10 November 2026** supersedes every older full-suite, static-source projection-pin and release-helper requirement in this repository. The current policy is [release qualification](docs/release-qualification.md): TypeScript `tsc --noEmit`, targeted genuine Workerd/D1 behavior, the Lua 1,000-member performance benchmark, and a fresh D1 backup checked with SQLite integrity/foreign-key validation. Do not restart the 334-suite aggregate, require historical source-string/hash reconstruction, or build throwaway operator control loops. Stable live behavior is evidence; genuine runtime failures remain failures.

Review the actual changed code and record its exact commit/tree, test results, live observations and remaining limits. Keep independent reviewer attribution and any expressly applicable owner signature requirements/waivers; never invent a Claude countersignature or usage-exhaustion claim. Historical reports and frozen evidence remain immutable records, not fixtures that must be repaired before the next deployment.

Use the current workflow and runtime receipts for test counts. The dated owner instructions are in [Owner instruction history](docs/owner-instruction-history.md). For merge and deployment, see [Release qualification and production rollout](#release-qualification-and-production-rollout).

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
`Olympus/claude_code_x_chatgpt_codex.md`. The earlier consolidation log stays with its dated history.

## Commands

Node 24 is selected by `.nvmrc`. From `worker/`:

```bash
npm run typecheck             # pure tsc --noEmit
npm run qualify               # typecheck once + bounded genuine Workerd/D1 checks
npm test                      # alias to the same bounded qualification
npm run test:all               # compatibility alias; NEVER the retired aggregate
```

From the repository root:

```bash
python addon/tests/run_lua_suites.py --suite performance235
python scripts/check-d1-backup.py /private/path/fresh-production.sql --format sql --live-catalogue /private/path/live-catalogue.json
```

The Lua command uses the existing Lupa 2.8 LuaJIT interpreter and exercises both 920- and 1,000-member rosters. The backup checker restores only into a temporary local database, runs SQLite integrity and foreign-key checks, and optionally compares an actual current catalogue. A local CI schema check is not a fresh production backup. See [release-qualification.md](docs/release-qualification.md) for the complete bounded workflow and honest evidence scope.

CI has three qualification jobs (`worker`, `addon`, `backup`) and the existing always-run required `check` collector. `worker` runs the bounded qualification; `addon` runs only the performance benchmark; `backup` checks SQLite restoration and the reusable checker's negative cases. The collector refuses failed, cancelled, skipped or missing dependencies. Existing secret scanning remains independent of the retired test aggregate. There are no shard placeholders, mandatory suite-count census, automatic Army preview mock suite or projection pre-push hook. Historical scripts remain diagnostic records; they cannot block a release through a stale string or file hash.

There is no ESLint or Prettier; `.editorconfig` sets 2 spaces, LF and a final newline (Python 4 spaces).

**Never run:** `npm run deploy` or `wrangler deploy` (the authorized Codex Root deploys through the release gate, from an exact commit with
`bash scripts/deploy-commit.sh <sha> --keep-vars` for main); `wrangler secret put` (owner only, it redeploys at once); `npm run db:init`
against the remote database (it re-applies `schema.sql`; the Worker migrates itself in `src/schema.ts`);
`wrangler d1 create olympus-link` or any remote `wrangler d1 execute` against `olympus-link` (.186: Olympus Link's
separate database; owner-only Phase 2 steps in `docs/olympus-link.md`); `npm run register` / `register:intros` outside the authorized one-shot Codex Root flow (they rewrite the guild command list); `tools/stockades-role-reset.py` against live Discord without its separate attended authorization and action-time inventory; the watcher against the live
Worker; `scripts/cutover-config.sh --apply` before the cutover's gates are met (it is the authorized final source/config
step: applied once, committed, rechecked and release-qualified on that exact commit before the deploy; it makes the
next deploy of `main` serve Asmongold's server); `scripts/stage_publication.py`, `scripts/validate_publication.py` or
`scripts/reconcile_public_root.py` beyond `--help` (staging a public snapshot is the owner's step on the final release-qualified head, with the externally
reviewed asset contract and manifest; the helpers never fetch, commit or push, but the step is not an agent's);
anything that reads `watcher/config.json`, `worker/.dev.vars` or `Config.lua`.

## Layout

| Path | Contents |
|---|---|
| `worker/src/` | The Worker. Entry `index.ts` (routes, cron, `BUILD`), `env.ts` (bindings and vars), `discord.ts` (REST, interactions), `interactions.ts` (commands), `ingest.ts`/`roster.ts`/`restore.ts`/`unverified.ts` (watcher endpoints, roster diff, role sweep), `oauth.ts` (Linked Role, Battle.net login), `bnet-retention.ts` (the 29-day purge, `bnetFresh`), `intros.ts`/`lookup.ts`/`guide.ts` (Asmongold's server), `site*.ts` (the guild site; `site-news.ts` is News since .115), `guild-seats.ts` (.115: whether Olympus I has room; informational only), `scheduled-budget.ts` (.115: the cron's D1 statement budget and the per-run caps), `roster-effects.ts` (.115: the roster's member effects as a durable worklist; the statement counter and the worst cases), `roles.ts` (the one Guild Member writer), `community-*.ts` (the Forever modules behind `COMMUNITY_FEATURES`: `community-context.ts` is the fence every write goes through, `community-names.ts` the identity rule), `schema.ts` (self-applied migrations) |
| `worker/schema.sql`, `worker/migrations/` | The canonical schema and the same statements as dated files. Additive only. |
| `worker/public/static/` | The site's script (`app.js`: the whole site, including the community member, organizer and staff pages since .93-.100), stylesheet, the game art (`tools/build-site-assets.py`), the Olympus crest `olympus-icon.png` (the brand and tab icon, the website's one non-game image since .111) and the rank planner. |
| `worker/tests/` | Node suites (`*_test.cjs`) and Python SQL suites. Each transpiles the real `src/*.ts` and runs the real `schema.sql` in SQLite behind a D1-shaped shim; only Discord's HTTP side is faked. |
| `addon/OlympusVerify/`, `addon/OlympusProbe/`, `addon/test/`, `addon/tests/` | The addon, the read-only probe, the harness and the Lua suites. |
| `watcher/` | The Python watcher (stdlib only) and its tests. |
| `tools/` | `guild-map.py` (server map through the Worker), `backfill-roles.py` (dry-run by default), `build-site-assets.py`, `stockades-role-reset.py` (separately gated Discord operation). |
| `policies/` | The tracked Privacy Policy and Terms of Service. The Worker serves the canonical readers at `/legal/privacy` and `/legal/terms` from `worker/src/policy-content.ts`, GENERATED by `worker/scripts/build-policy-content.mjs` (`npm run check:policies`, part of `npm test`); edit the HTML here, then regenerate. The owner's 21 October successor instruction retires exactly `/privacy` and `/terms` with empty HTTP 410 responses without redirects; `/privacy/*` account and erasure handlers remain unchanged. The GitHub Pages mirror publishes the same files. |
| `docs/` | `design.md` (why), `deploy-checklist.md` (every build: what changed, rollout, rollback, tests), `launch-runbook.md` (the owner's steps from the signed head to the launch: deploy, the donor's private phase as a gate, the cutover, the flags, publication; then the end of the beta, typed names and what officers do when a roster export is refused (section 10); the in-game ladder decision changed on 3 Oct 2026 (owner answer 6: ten ranks, the Treasurer at index 2 right below Officer, no Probation); that native-Treasurer recommendation is superseded by the owner's 14 October 2026 confirmation of the existing second native rank (immediately below Guild Master), with Treasurer and Co-Guild Master as appointments; the current ten-rank recommended preset already exists in `worker/public/static/rank-planner/model.js`; the planner produces drafts and protected Guild Master setup remains attended, with rank order and withdrawal permissions reviewed separately; the owner-fixed 22 October 2026, 17:00 UTC member/rank reset has an unshipped automatic-entry candidate, remains removal-OFF with its separate Native qualification gate false, and preserves manual leadership, Council roles, appointments and the directory; see current runbook section 8 and `beta-reset-2026-10-22.md`, with superseded manual-reset instructions retained only as dated history), `source-provenance.md` (what is tracked and what never is, the generated and derived files, the ported modules, the publication helpers and what publication means), `beta-test-plan.md`, the Asmongold docs. |
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
  before it runs and refused if already there. Ping and autocomplete are not ledgered. Since .194 (prepared as .186)
  the bot host also has Olympus Link's `OPTIONS`/`POST /proof` and `POST /api/link/keys` (`src/link.ts`); they answer
  today's 404 unless `LINK_ENABLED` is exactly `"true"` with the complete configuration, and `src/link-core.ts` is
  generated, never edited (`docs/olympus-link.md`).
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
- **Seats** (`src/guild-seats.ts`, .115, the owner's item B of 2 Oct 2026): whether Olympus I has room is read from the
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
  complete batches (`HOOKS.afterBatch`; since .161 frontend races run only between complete Native transactions, and a
  statement-level `afterStatement` hook exists only in the `community_event_*` suites); add a check there with every
  page change.
- **Community modules** (`community-*.ts`, since .56): one identity (the site session), facts from keeper tables only,
  capabilities that name requirements (`applicantWrite`, `confirmedGuildData`, `communityStaff` = `SITE_ADMINS`); a
  write is one batch whose first statement carries `fenceSql` (id, session version and the cookie's expiry, judged by
  the database clock inside the statement) and stores a nonce the rest requires; every feature
  registers erasure and export (`registerCommunityData`) before it stores a row; seconds everywhere, `community-time.ts` at
  the DTO boundary; tables are `community_*`; character labels are keyed by `community-names.ts communityKey` (the full name, never
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
  (site_news_test: the newest build number and date exactly match `BUILD`; preserve the historical inverse chain).
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
  makes Workerd refuse the bundle at startup (.47 to .50 did not start). The bounded qualification loads the actual
  current Worker in Workerd. The old `tests/bundle_runtime_test.cjs` remains a historical diagnostic, outside the default gate.
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

- **Every deployable runtime change bumps `BUILD`** in `src/index.ts` (`YYYY-MM-DD.NN word`) and the newest member-facing `RELEASE_NOTES` row. Add a dated rollout/rollback note to `docs/deploy-checklist.md`. Test/CI/documentation-only changes do not redeploy or bump a stable runtime. Do not update historical BUILD mocks, source-line hashes, prepend inverses or projection pins merely to qualify a release.
- **Generated artifacts describe current bytes.** Rebuild an affected official addon/package manifest from current inputs and verify the actual served artifact when deployed. Current artifact digests, dependency integrity and genuine runtime cryptographic/identity checks remain meaningful. Historical static-source fixture hashes, file sizes and exact-copy strings are retired as push/CI/merge/deployment gates. Preserve old signed evidence; do not rewrite it to manufacture a pass.
- **A watcher behaviour change bumps `WATCHER_VERSION`** (`watcher/watcher.py`): it is sent as `v=` on queue polls, in
  the User-Agent and in the start-up log line, so an unchanged number hides which build an officer runs.
- **In the shared repository, run Git with `-c maintenance.auto=false -c gc.auto=0`** for commands that write objects.
  Git's automatic maintenance after a commit (Git 2.54 on this host) prunes worktree registrations, which can drop
  another agent's worktree; `gc.auto=0` alone does not stop it. Never run `git gc`, `git maintenance` or
  `git worktree prune` there yourself.
- **Use targeted behavioral regressions** for material changed behavior: execute the actual Worker under Workerd with real local D1, mock only external services, and assert observable results. Extend the bounded runtime checks for the affected path when necessary. Lua performance counters and real SQLite corruption/foreign-key cases belong to their respective small checks. Do not append every test to a growing mandatory aggregate or compare historical source text as a runtime oracle.
- **Comments say why**, and cite the decision and its date ("the owner's decision (2026-09-25)", "build .47").
- **Schema changes** go into `schema.sql`, `src/schema.ts` (idempotent, `CREATE ... IF NOT EXISTS` / `addColumn`) and
  a dated file under `migrations/`, all three.
- Bound every D1 value; SQL text interpolates only compile-time fragments. Keep bound parameters per statement under
  100.
- Files are LF; `*.bak*` siblings are ignored by git and should not be created any more (git is the history).

## Release qualification and production rollout

This heading is the stable successor to the earlier `CLAUDE.md:78` deployment reference. Codex Root alone performs the authorized GitHub squash merges, fresh D1 backup, Cloudflare deploy and live Discord registration. Claude Code owns its local implementation and independent review.

Before merge, review the exact changed commit/tree and complete the bounded qualification in [release-qualification.md](docs/release-qualification.md), with automated review and any explicitly applicable owner review authority. Use the current CI job graph; the historical thirteen-job/eight-shard requirement is retired. Require actual success from the current required `check` status and main CI after merge. Do not fabricate green statuses for retired jobs. Immediately before an authorized production deployment, export and locally integrity-check a fresh D1 backup; compare its catalogue with the actual live catalogue, explicitly accounting for provider-only objects. Do not substitute a schema-only CI fixture or historical backup.

Use the existing exact-commit deployment entrypoint and concise reusable tooling. Do not generate per-build hardcoded helper hierarchies, helper hash/manifest/review polling loops, historical projection inverses, fixture repair marathons or new aggregate suite requirements. Keep actual commit/tree and deployed-artifact custody, runtime identity/privacy/standing/unknown-effect fences, Native E2, current D1 preservation and protected RT-16 decisions. Keep Daniel relay, Olympus Link and separate Treasury dispatch behind their existing gates. This policy changes qualification, not production behavior or feature activation.

After deployment, check the release identity, all 90 public probes, the original first-cron audit and the attended RT-16 empty-note readback. The reviewed bot-host robots comment and 60-second first-cron allowances apply to those exact checks. Verify then record post-deploy results in `QA-REPORT.md` and the shared log. Live slash registration and native addon or Watcher acceptance each require their own evidence.

- **The task log is append-only.** Headings `## [YYYY-MM-DD HH:MM:SS UTC] Agent — subject`. Never rewrite the other
  agent's text; correct with a new entry.
- **Exact evidence:** each signature names its scope, source review, independent peer evidence, tests,
  bundle/assets/policy parity, exact shipping-commit CI, and required actual-version/live checks or expressly named
  residuals. An earlier head, component pass or interrupted checkpoint does not qualify changed bytes. A subagent
  review is separately attributable peer evidence, never a Claude countersignature or an aggregate release signature.
- **Historical attribution:** the owner's 3 October takeover allowed single-Codex qualification after Claude's usage
  limit for that earlier work. It remains history; it does not override the renewed collaborative request. The
  30 September ownership split and earlier signatures also remain records of their actual scopes and versions.
- **Owner gates:** secrets, access changes, domain and repository renames, attended account actions and new dependencies need their specific authorization. Release actions follow the Codex Root ownership above.
- **Never** type or print a secret; never DM a member; never `git push --force`; never switch branches in this shared
  checkout (use a worktree elsewhere for anything not on `main`).
