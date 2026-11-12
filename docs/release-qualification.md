# Permanent release qualification

The owner's 10 November 2026 restructuring mandate is effective for every future
release; the owner's 12 November 2026 directive (Pillar 7) names the gate below. It replaces the 334-suite pre-deployment aggregate, legacy static-source
projection test pins and throwaway operator helper control loops. This policy
supersedes conflicting testing instructions in dated release notes and reports.

## The gate

The owner's 12 November 2026 directive (Pillar 7) sets the gate. Each item below
says what runs today and where it still falls short of the directive's wording.

1. **TypeScript:** `tsc --noEmit` over the current Worker source.
2. **Workerd production bundle verification:** not in the gate yet. The bounded
   stages bundle a test entry that imports `src/index.ts` with esbuild and run it
   in Workerd with `nodejs_compat` only; they do not build the wrangler production
   bundle from `wrangler.toml`. That stage is Codex Root's tooling.
3. **Genuine Workerd/D1 behavior:** bounded tests of the actual current Worker and
   genuine local D1. Assert observable admission, persistence, refusal and role
   behavior. Mock external Discord HTTP only; do not replace D1 with an imitation
   or require the code to contain historical strings or file hashes.
4. **D1 statement ceilings and query plans (12 November 2026):** on its own
   1,000-member genuine D1 database, the promotions target sends three requests
   through the actual Worker entry (host routing, watcher bearer, members-only
   protocol, schema proof and the write-admission layer) with a counter in the
   place of the D1 binding (`worker/tests/d1_statement_budget.mjs`). The counter
   counts every physical statement, each batch element and each admission proof
   included, and refuses a statement it did not prepare. The target asserts:
   - `GET /queue/launch-operations` (the officer launch-operations page): under
     100 physical statements (5 on 12 November 2026);
   - `GET /queue/unverified` (the strict roster display): under 100 (3);
   - `POST /ingest/roster` with a changed 1,000-member export: at most
     `ROSTER_INGEST_STATEMENTS` (494), the shipped per-invocation admission model
     (134). Whether the directive's "under 100" applies to this request is an
     open owner question;
   - `EXPLAIN QUERY PLAN` for every statement those requests sent that names
     `roster_members` or `role_settlements`: no full scan of either table;
   - the two Native sweep selectors add no full scan beyond the two recorded
     `role_settlements` index walks (`KNOWN_SWEEP_SCANS`), listed exactly so any
     new scan fails;
   - every read statement of the page and the display, re-run alone, finishes in
     under one second (5 and 3 statements; slowest 26 ms locally).

   Not asserted yet: the identify-only account copy's under-100 budget (it needs
   the OAuth identify-only grant flow inside Workerd; its 98-statement count is
   held only by the historical `privacy_account_coverage_test.cjs`), and the
   directive's "CTE-free" wording (the launch and strict-roster reads use
   `WITH ... AS MATERIALIZED`; how to read it is an open owner question).
5. **Lua addon suites:** every suite that needs no external archive, 41 of the 42
   registered (`run_lua_suites.py --all-offline`). That includes the 1,000-member
   performance benchmark (`performance235`, synthetic native APIs at 920 and
   1,000 members; not a native FPS claim) and the targeted roster, Guild tab and
   promotion suites. Only `dan155_census` stays opt-in: it needs Daniel's 1.5.5
   archive (`--suite dan155_census --dan-archive <zip>`).
6. **Python Watcher suites:** the complete `watcher/tests` folder, 391 tests,
   with `OLYMPUS_REQUIRE_LUA=1` so the two Lua round trips fail instead of
   skipping when Lupa is missing.
7. **D1 SQLite backup integrity:** immediately before an authorized production
   deployment, export a fresh production backup, restore it only into temporary
   local SQLite, and require `integrity_check=ok` and no foreign-key violations.
   Compare its actual portable catalogue with the current live catalogue when
   supplied, excluding only explicit provider-managed objects. Do not use a
   historical file digest or object count as a universal test oracle.

From `worker/`, using the existing Node version and installed locked dependencies:

```sh
npm run qualify
npm run qualify -- --target lease --target treasury --target reconciliation --target promotions
```

The first command is the baseline (typecheck and one Workerd stage). CI runs the
second: the baseline plus the lease, Treasury and reconciliation groups in the
same Workerd process, then the promotions target.

The `--target promotions` check traverses all 50 actual cursor requests against a
genuine local D1 fixture, with only external Discord HTTP substituted. It covers
header pacing, original-source/expiry refusals and signed retry checkpoints, and
it runs the statement-ceiling and query-plan checks above. It runs inside the same
180-second whole-command deadline, without automatic retries, and does not
establish live Discord or native acceptance.

`npm test` and `npm run test:all` are compatibility aliases to this bounded Worker
qualification. They never expand the retired historical suite chain. TypeScript
runs once; actual Workerd checks have a 180-second whole-run limit, with no
automatic retries. Extend a targeted behavioral check for a material changed
path instead of adding every historical test to the default command.

Generated-artifact parity, from `worker/` (each under a second):

```sh
npm run check:policies
npm run check:link-core
npm run check:vectors
node ../scripts/build-verify-addon.cjs --check
```

From the repository root, with Lupa 2.8 (`addon/tests/requirements-lupa.txt`):

```sh
python addon/tests/run_lua_suites.py --all-offline
OLYMPUS_REQUIRE_LUA=1 python -m unittest discover -s watcher/tests
```

For an actual private production backup already exported by the authorized Root:

```sh
python scripts/check-d1-backup.py /private/path/fresh-production.sql --format sql --live-catalogue /private/path/live-catalogue.json
```

The checker accepts SQL exports or SQLite files and does not contact Cloudflare,
read credentials, modify the input, or restore production. Catalogue input may be
a JSON array of `{type,name,tbl_name,sql}` rows or a D1 results envelope. Computed
digests may be recorded as artifact evidence; they are not fixed historical pass
conditions. Backup provenance and freshness must be established from the actual
export receipt, not inferred by this local checker.

### Local timings (12 November 2026)

Measured on the shared Windows host (Node 24.22.1, Python 3.14, Lupa 2.8) on the
docs-gate lane head. CI runners differ; the 180-second cap applies to the whole
qualification command.

| Command | Result | Seconds |
|---|---|---|
| `npm run typecheck` | pass | 17 |
| `npm run qualify` (baseline) | pass | 25 |
| `npm run qualify -- --target lease --target treasury --target reconciliation --target promotions` | pass, 196 checks | 96 of the 180-second cap |
| parity checks (`check:policies`, `check:link-core`, `check:vectors`, addon ZIP) | pass | under 2 together |
| `run_lua_suites.py --all-offline` | 41 suites pass | 23 |
| Watcher suite with `OLYMPUS_REQUIRE_LUA=1` | 391 tests, none skipped | 61 |
| backup job (checker cases, schema restore, CI-gate cases) | pass | 24 |

## CI and merge

The workflow has three bounded jobs and the existing required `check` collector:

| Job | Scope |
|---|---|
| `worker` | Secret scanning; generated-artifact parity (policies, Link core, code vectors, served addon ZIP); TypeScript plus targeted genuine Workerd/D1 verification with the lease, Treasury, reconciliation and promotions targets, D1 statement ceilings and query plans included; the complete Watcher suite with Lupa installed by hash |
| `addon` | Every offline Lua suite (`run_lua_suites.py --all-offline`), Lupa installed by hash |
| `backup` | Genuine valid/corrupt/foreign-key backup-checker cases and a local restore of the tracked schema SQL |
| `check` | Requires all three jobs to report actual success; missing, skipped, cancelled and failed dependencies fail |

CI has no production credentials. Its schema SQL restore is a local integrity
sanity check, **not a fresh production backup**. The actual pre-deployment export
and verification remain required for every authorized production deployment.

The eight Worker shards, automatic Army preview mock workflow, test-entry census
and projection pre-push hook are retired. No fake success statuses replace them.
The existing required `check` name remains; do not require historical job counts
or reintroduce the retired aggregate through a side workflow or an npm alias.
Review the actual diff and current CI results on the exact candidate; retain
applicable owner review/signature authority and honest reviewer attribution.

## Deployment and evidence

Use the existing reusable exact-commit deployment script, not a new per-build
operator framework. Keep source commit/tree, current built-artifact and served
version evidence. Do not demand helper manifests, source-hash pin cascades,
historical projection inverses, counter-signature polling loops or a complete
rerun of unchanged tests. Preserve all earlier failures and signed reports.

Historical source-test hashes, exact-copy wording and mock query-string matches
do not decide whether stable live code may ship. A real type error, behavioral
Workerd/D1 failure, Lua performance regression or corrupt backup still fails its
check. Observed live success must keep its actual scope; it cannot turn an
untested member flow or a held unknown effect into a pass.

This change does not weaken runtime authorization, identity, privacy, replay,
unknown-effect, lease ownership or role hierarchy checks. Dependency integrity,
request signatures and current artifact provenance are distinct from retired
historical fixture pins. The D1 catalogue is 444 live / 443 portable objects
since .266 added the index `audit_reconcile266` (per Codex's record); the
443-live/442-portable figures in the 12 November directive and in earlier notes
are the pre-.266 inventory, kept as dated evidence. Future actual catalogue
changes require their own review.

Production deployment, Discord writes and feature activation still require their
existing authorization. Keep ordinary public, serving-version, cron and protected
empty-note readbacks after deployment, with their prior owner-scoped exceptions.
Member interaction and branch verification checks remain pending until explicitly
resumed. A CI/documentation change does not redeploy the stable Worker or bump its
runtime BUILD. It also does not resolve the separately recorded intermittent D1
resource delays.

The [legacy configuration archive](legacy-qualification/README.md) is retained for
diagnosis and historical attribution; it is not an alternative qualification path.


## Client checks and backend releases

The owner's 10 November clarification removes repeated officer Sync handoffs from backend-only rollouts. A Worker deployment does not require an in-game reload or repeat member interactions when addon/Watcher behavior is unchanged. Record server-side health, genuine D1 behavior and existing applicable native evidence separately. Current roster freshness remains mandatory for an operation that consumes native proof; it is never renewed by a deployment or a test receipt.

An addon code update needs one normal client reload/restart before its new Lua can run. Codex Root may handle the already-authorized officer reload/Sync after observing a safe client state. If the client is busy or unavailable, leave that native acceptance pending without holding an unrelated backend repair or repeatedly asking the owner to press Sync. Never claim that persisted files prove the running client loaded them, that a successful deploy flushes SavedVariables, or that a delivery ACK proves a Discord role. Member and branch checks retain the owner's existing pending status.
