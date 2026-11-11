# Permanent release qualification

The owner's 10 November 2026 restructuring mandate is effective for every future
release. It replaces the 334-suite pre-deployment aggregate, legacy static-source
projection test pins and throwaway operator helper control loops. This policy
supersedes conflicting testing instructions in dated release notes and reports.

## Four checks

1. **TypeScript:** `tsc --noEmit` over the current Worker source.
2. **Genuine Workerd/D1 behavior:** bounded tests of the actual current Worker and
   genuine local D1. Assert observable admission, persistence, refusal and role
   behavior. Mock external Discord HTTP only; do not replace D1 with an imitation
   or require the code to contain historical strings or file hashes.
3. **Lua 1,000-member performance:** exercise the real addon with synthetic native
   APIs at 920 and 1,000 members. Assert bounded roster reads, hashing, polling and
   hardware-action behavior. This offline benchmark is not a native FPS claim.
4. **D1 SQLite backup integrity:** immediately before an authorized production
   deployment, export a fresh production backup, restore it only into temporary
   local SQLite, and require `integrity_check=ok` and no foreign-key violations.
   Compare its actual portable catalogue with the current live catalogue when
   supplied, excluding only explicit provider-managed objects. Do not use a
   historical file digest or object count as a universal test oracle.

From `worker/`, using the existing Node version and installed locked dependencies:

```sh
npm run qualify
```

CI also exercises the two explicit current lease/Treasury runtime groups in the
same Workerd process: `npm run qualify -- --target lease --target treasury`.

`npm test` and `npm run test:all` are compatibility aliases to this bounded Worker
qualification. They never expand the retired historical suite chain. TypeScript
runs once; actual Workerd checks have a 180-second whole-run limit, with no
automatic retries. Extend a targeted behavioral check for a material changed
path instead of adding every historical test to the default command.

From the repository root, using the existing Lupa 2.8 LuaJIT environment:

```sh
python addon/tests/run_lua_suites.py --suite performance235
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

## CI and merge

The workflow has three bounded jobs and the existing required `check` collector:

| Job | Scope |
|---|---|
| `worker` | TypeScript plus targeted genuine Workerd/D1 verification; existing secret scanning is retained |
| `addon` | Only the Lua performance benchmark |
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
historical fixture pins. The current 443-live/442-portable inventory is retained
as dated evidence; future actual catalogue changes require their own review.

Production deployment, Discord writes and feature activation still require their
existing authorization. Keep ordinary public, serving-version, cron and protected
empty-note readbacks after deployment, with their prior owner-scoped exceptions.
Member interaction and branch verification checks remain pending until explicitly
resumed. A CI/documentation change does not redeploy the stable Worker or bump its
runtime BUILD. It also does not resolve the separately recorded intermittent D1
resource delays.

The [legacy configuration archive](legacy-qualification/README.md) is retained for
diagnosis and historical attribution; it is not an alternative qualification path.
