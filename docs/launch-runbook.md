# Launch runbook (the keeper's side)

The owner's steps, in order, from the jointly signed head to the public launch, and what is checked between them. This
is the keeper's (Olympus Verify's) side; the donor's private phase (Olympus Forever on `olympusforever.roachcouncil.com`)
follows Codex's private-phase contract and is referred to here only where it gates a keeper step. Written 1 October 2026
on head .101 and revised on head .108 for Codex's 12:06 UTC review (R1-R4); every later build adds its section to
`deploy-checklist.md`, not here, unless a step changes.

Nothing below is an agent's step. The agents prepare exact commits and sign them in the task log
(`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`); Viktor runs the commands, or Codex where Viktor has authorized
it in the log. The never-run list in `CLAUDE.md` stands throughout: `wrangler deploy` from a working folder, `wrangler
secret put`, `db:init` against the remote database, `register`, the watcher against the live Worker, `cutover-config.sh
--apply` before its gates, the publication helpers beyond `--help`.

## 0. What "signed" means

A step takes a commit only when the task log holds, on that exact SHA, the author's signature and the other agent's
countersignature (a scoped countersignature counts for the scope it names; a whole-head signature for a deploy). Both
agents' final same-head signatures are the last gate before the launch deploy. The keeper checkout has no remote and its
history stays private, so hosted CI runs only on the public repository: a deploy takes the shipping commit below, and the
push-to-`main` CI run on exactly that commit must be green (`scripts/ci-gate.sh`: the worker, watcher and addon jobs all
`success`).

**The shipping commit.** A deploy takes the public `main` commit P that carries a jointly signed keeper commit K, never K
itself and never a working folder. P carries K when P's root tree holds exactly K's root entries with the same object
IDs, plus `index.html`, `privacy.html` and `terms.html`, which are the same blobs as `policies/index.html`,
`policies/privacy.html` and `policies/terms.html`; then `worker/`, `addon/`, `watcher/`, `scripts/`, `docs/` and every
other entry are byte-identical to K. The check is `git ls-tree <P>` in the public clone against `git ls-tree <K>` in the
keeper. Both agents sign P (the final tuple is regenerated on P), its push-to-`main` CI run is green, and the owner
deploys it from a clean clone of the public repository (`npm ci` in that clone's `worker/`, then
`bash scripts/deploy-commit.sh <P>`); the dry-run bundles of P and of K (`--dry-run --outdir`) have a byte-identical
`index.js` (the source map and wrangler's README name the temporary export folder and differ). If P reaches `main`
through a pull request, the run that counts is the push-to-`main` run on the resulting `main` commit,
whose tree must equal the reviewed one; a pull-request run tests GitHub's merge commit, not P. The first P is the
publication of section 5, which therefore runs before step 1. Every later P (the cutover commit of step 3, a flag change
of step 4, a later build) is a pull request on the public `main` that changes exactly the files the next signed keeper
commit changes, with the same blobs, checked by the same rule; the publication helpers make only the first P (they pin
the public parent `e0c1fcee…`).

The launch is judged on the ACTUAL final tuple, never on an earlier build's or a prepared candidate's state: the final
head and its tree; the policies served at `/privacy` and `/terms` from that head (and their native generator parity);
the source; the official asset tuple (the reviewed asset contract and manifest); the required documents; the reviewed
literal classifications regenerated for that head; the deployment profile (`worker/wrangler.toml`,
`worker/wrangler.cutover.toml`) and, after step 3, the opening marker (`worker/wrangler.cutover.applied` and its commit);
the aggregate CI result on that head; and both agents' exact final signatures. Throughout, these stay as reviewed: the
bot's stable Interactions endpoint on the workers.dev host, the 18 cutover keys and nothing else, the donor's private
database and owner limiter (its own contract), the sign-in callback restart on the legacy host, and every community flag
off until step 4.

## 1. Deploy the keeper chain to the current server (pre-cutover)

The live Worker is .46; the deployable chain is .51 onwards (.47-.50 never start in workerd). Every commit ships the live
`worker/wrangler.toml`, which still names the Olympus server and `guild.roachcouncil.com`, so a deploy before the cutover
changes nothing about which server is served. Section 5 runs first: the commit deployed here is the shipping commit P of
the signed head (section 0), in a clean clone of the public repository, after its push-to-`main` CI run is green.

```bash
bash scripts/deploy-commit.sh <P> --dry-run --outdir /tmp/olympus-check   # the bundle from the exact commit, nothing uploaded
bash scripts/deploy-commit.sh <P>                                          # the deploy, from `git archive` of that commit
```

Check afterwards: `GET <PUBLIC_BASE_URL>/health` answers `ok` with the build string of the commit (`BUILD` in
`worker/src/index.ts`); the site at `SITE_HOST` loads and signs in; `/privacy` and `/terms` are served by the Worker. The
community flags are all off in this configuration (`COMMUNITY_FEATURES = ""`, `CONTRIBUTIONS_MODE = "off"`,
`PRIVACY_INTAKE_ENABLED = "false"`, `OFFICER_DIGEST_ENABLED = "false"`), so the Community pages and the Admin → Community
tab do not appear yet; that is expected.

Secrets are unchanged by a deploy (`DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `VERIFY_SECRET`, `WATCHER_TOKEN`,
`COOKIE_SECRET`, optionally `BNET_CLIENT_SECRET`); none is read by the agents and none needs to change for the chain.

**Before the first deploy of the chain: a verified private backup.** The first chain build migrates the keeper database
at boot (`src/schema.ts`: new tables and columns, and `DROP INDEX IF EXISTS community_trials_open`). Before it, the owner:

1. exports the live keeper database to a private file outside every repository (`npx wrangler d1 export <keeper database>
   --remote --output <private path>`), records its SHA-256, and records the D1 Time Travel bookmark of the same moment
   (`npx wrangler d1 time-travel info <keeper database>`);
2. validates the restore on a PRIVATE scratch database, never the live one: import the export there and compare the row
   counts of the core tables (`members`, `characters`, `site_users`, `site_applications`, `invite_queue`) with the live
   ones read at export time; the backup counts as verified only when they match;
3. keeps both (the export and the bookmark) until the launch is accepted.

No restore is authorized by this runbook; restoring the live database is a separate decision of the owner.

**Rollback: to a pinned, reviewed rollback-compatibility point, not to any older build.** The schema changes of the chain
are not all additive: .66 drops the index `community_trials_open` that .61's boot creates, so a build from .61 to .65
would recreate it and enforce the old one-open-trial rule against rows written since (never a rollback target); and a
build older than a feature's own module does not run that feature's retention purge, so its rows would outlive their
deadline. Each deploy's checklist section therefore names its rollback target, and the reviewers pin it:

- while every community flag is off and no community row exists (steps 1 to 3), the target is the previously deployed
  signed build, or .46 (`0a29611`) if none of the chain was deployed before;
- once any community flag has been on, the target is a signed build at or after .66 that carries the retention purge of
  every feature that holds rows (in practice the previously deployed signed build of this chain), never .46;
- the retention maintenance keeps running through any rollback: the cron purges are part of every such target and are
  never switched off to make a rollback fit.

`bash scripts/deploy-commit.sh <rollback target>` performs it, from the checkout that holds the target: the public clone
for a shipping commit, the keeper for .46 (`0a29611`), which was never published.

## 2. The donor's private phase (Codex's contract; gates step 3)

Per Codex's 08:36 and 09:27 entries: the donor is deployed by the owner with `--env privatetest` (TEST_MODE, the owner
allowlist, the private D1 and the fixture copy of the keeper database, the limiter), the new canonical owner Discord and
optional Battle.net sign-in are tested on `olympusforever.roachcouncil.com`, the old-host callbacks drain, and then a
separately reviewed donor successor removes the old route (`olympus.roachcouncil.com`) and `PUBLIC_LEGACY_HOSTS` from BOTH
donor profiles. Nothing public launches in this phase.

**Completed, and attributed to Codex (root).** The donor's private deploy of `cccad5d` ran at 09:59 UTC on 1 October 2026,
and its drain successor `d3bd4883e25a89807b8f81fe8690a0d3f03bae65` (routes `olympusforever.roachcouncil.com` only,
`PUBLIC_LEGACY_HOSTS` empty in both profiles) was deployed privately at 11:13 UTC (provider version `2fa93aa9…`). Codex's
live receipt `Olympus/consolidation-2026-09-30/evidence/root/donor-private-d3-deployment/root-live-private-drain-receipt.json`
(SHA-256 `204e9b683abf96e0c2fc5a8b3a61558b661be56082b9516cc7022fd95e63f012`) records the authoritative, unfiltered
Cloudflare custom-domain table with exactly one domain, `olympusforever.roachcouncil.com`, and the old host absent. That
receipt is Codex's observation; Claude Code acknowledged it within its scope (task log, 11:22 UTC) and made no
observation of its own. It is evidence of the donor's private phase, not a keeper launch and not the keeper's gate.

**The keeper's gate is a fresh readback.** Immediately before the keeper claims `olympus.roachcouncil.com` (step 3), the
owner reads the provider again: the unfiltered custom-domain list shows `olympus.roachcouncil.com` bound to no Worker,
and that readback is recorded in the task log. The keeper's `scripts/cutover-config.sh --check` cannot see the donor's
routes; this readback is the owner's.

**Never back to the donor.** Once the keeper owns `olympus.roachcouncil.com`, the old donor alias is never restored: a
donor rollback keeps `olympusforever.roachcouncil.com` canonical and the stable interactions host, and never re-attaches
the old host.

## 3. The keeper cutover

Only after step 2's readback and with the pre-cutover pair reviewed (`bash scripts/cutover-config.sh --check` exits 0 on
`main`, the "pre-cutover" state):

```bash
bash scripts/cutover-config.sh            # show the difference once more: the 18 keys below and nothing else
bash scripts/cutover-config.sh --apply    # copies worker/wrangler.cutover.toml over worker/wrangler.toml and writes the marker
git add worker/wrangler.toml worker/wrangler.cutover.applied && git commit -m "Cutover configuration applied"
bash scripts/cutover-config.sh --check    # the "applied" state: live file identical to the profile, the marker's hash matching
```

The marker records the time of the apply, so the apply happens once, in the keeper, and is never repeated in the public
clone. Both agents sign that keeper commit; the owner carries its two files, as the exact same blobs, to a pull request
on the public `main` (the shipping-commit rule of section 0); `--check` passes there too, the push-to-`main` CI run is
green, and both agents sign the resulting public commit. Then, in the public clone:

```bash
bash scripts/deploy-commit.sh <cutover P>
```

What the cutover changes (and only this; the script's `--check` fails on anything else): the routes
(`olympus.roachcouncil.com` added, `guild.roachcouncil.com` kept as the legacy host), `GUILD_ID` → Asmongold's server
`236932545793490944`, the six role ids (`ROLE_GUILD_MEMBER`, `ROLE_OFFICER`, `ROLE_MODERATOR`, `ROLE_GUILD_LEADER`,
`ROLE_GUILD_MASTER` empty, `ROLE_RAID_LEADER`), the channels (`CHANNEL_RECRUITMENT_REVIEW`, `CHANNEL_MOD_ALERTS`,
`CHANNEL_SERVER_LOG`, `CHANNEL_NOTICES`, `CHANNEL_VISITOR_CHAT`), `SET_NICKNAME = "false"`, `BLOCKING_ROLE_IDS` (Quarantine
and Flagellant), `SITE_HOST = "olympus.roachcouncil.com"` and `SITE_LEGACY_HOSTS = "guild.roachcouncil.com"` (a browser on the
old host gets a 301 to the new one; sign-in and OAuth paths restart at the new root with a 302, never a forward), and
`VERIFY_OPEN_SINCE = "2026-10-02"` (gate 6: the day after the planned 1 October opening of verification in Asmongold's
server, so nobody there is offered for removal before `UNVERIFIED_GRACE_DAYS` after it; if the opening slips past
2 October, the date is re-reviewed forward before the deploy).

Before the deploy the custom domain `olympus.roachcouncil.com` must be free (step 2) and added to the keeper Worker by the
owner in the Cloudflare dashboard, or wrangler adds it from the routes on deploy; `guild.roachcouncil.com` stays bound.
After the deploy: `/health` shows the new build; `https://olympus.roachcouncil.com/` is the site and
`https://guild.roachcouncil.com/` answers 301 to it; the bot's commands in Asmongold's server answer (the Interactions
endpoint of the Discord application `1550176895671341076` stays `<PUBLIC_BASE_URL>/interactions` on the workers.dev
hostname; it does not move).

Then, owner only, the command list and the channel intros for the new server:

```bash
cd worker                 # once, from the repository root; both commands run in worker/
npm run register          # rewrites the guild's command list for GUILD_ID (reads the bot token from the environment or worker/.dev.vars)
npm run register:intros   # the pinned guide and the channel intros
```

Rollback of the cutover needs its own reviewed route and marker plan, written and signed before it is used: which host
the keeper keeps, which marker state the repository returns to, and the rollback target of step 1. Deploying the
pre-cutover commit (`bash scripts/deploy-commit.sh <pre-cutover-sha>`, whose `wrangler.toml` names the Olympus server and
`guild.roachcouncil.com`) detaches `olympus.roachcouncil.com` from the keeper, and the host is then left unowned: it is
never handed back to the donor. A later claim of the host repeats step 2's fresh readback. The marker commit stays in
history and the marker is never removed. After the cutover only the seven activation keys change, through
`cutover-config.sh --activate` (step 4), which appends a record and leaves the cutover's own `profile_sha256` and
`applied_at` as they are; any other edit of either file fails `--check`.

## 4. Switching the community features on

Each switch is a reviewed configuration change committed and deployed like any build (the Worker reads
`COMMUNITY_FEATURES` at request time; a deploy is the switch).

**How a switch is made after the cutover.** The keeper edits `worker/wrangler.cutover.toml`, changing only the activation
keys (`COMMUNITY_FEATURES`, `CONTRIBUTIONS_MODE`, `CONTRIBUTIONS_RETENTION_DAYS`, `PRIVACY_INTAKE_ENABLED`,
`PRIVACY_INTAKE_MONITORED`, `PRIVACY_INTAKE_RETENTION_DAYS`, `OFFICER_DIGEST_ENABLED`), commits nothing yet, and runs
`bash scripts/cutover-config.sh --activate`. It refuses unless the marker exists, the live file is the profile the marker
records last and is committed clean, and the profile differs from it in those keys and nothing else. It then copies the
profile over the live file and appends one record (`activation_profile_sha256`, `activated_at`) to the marker. Both agents
sign that keeper commit; its three changed files reach the public `main` as the same blobs by pull request (section 0);
`--check` passes there; CI, both signatures on the resulting `main` commit, and `deploy-commit.sh` follow. Switching a
flag back off is the same step.

**The decided activation** (Codex's proposal of 1 October 2026; the two operating choices answered by Viktor the same
day). Limits and lists stay as they are: `COMMUNITY_DIRECTORY_LIMIT = "2500"`, `COMMUNITY_ORGANIZERS = ""`, `SITE_ADMINS`
and `CONTRIBUTIONS_SCOPE` unchanged.
1. **First activation, after the cutover:** `COMMUNITY_FEATURES =
   "directory,crafting,events,attendance,trials,restrictions,departures,privacy_intake,contributions"`,
   `CONTRIBUTIONS_MODE = "ledger"`, `CONTRIBUTIONS_RETENTION_DAYS = "90"` (dues: the built-in policy of one gold, 10,000
   copper, a week with a 14-day new-member exemption and manual receipts; no automatic sanction),
   `PRIVACY_INTAKE_RETENTION_DAYS = "30"`, `OFFICER_DIGEST_ENABLED = "true"` (counts only, to the private review channel
   `CHANNEL_MOD_ALERTS`). The private intake stays closed: `PRIVACY_INTAKE_ENABLED` and `PRIVACY_INTAKE_MONITORED` stay
   `"false"`, so the staff inbox shows and no new case is accepted.
2. **Second activation, once Viktor has actually read the staff queue** (he reviews it each working day; cases are kept
   30 days from their last activity): `PRIVACY_INTAKE_ENABLED = "true"`, `PRIVACY_INTAKE_MONITORED = "true"`.

Suggested order and prerequisites, flag by flag:

| Flag (`COMMUNITY_FEATURES`) | Also needed | What appears |
|---|---|---|
| `directory`, `crafting` | — | Community → Directory, My profile, the crafting search; Admin → Community → Character claims |
| `events`, `attendance` | — (a `SITE_ADMINS` member with a roster-confirmed character already organizes; more organizers in `COMMUNITY_ORGANIZERS` are optional and separately authorized) | Calendar, answers, My attendance; the organizer's pages |
| `trials` | — | My trial; Admin → Community → Trials |
| `departures`, `restrictions` | — | Admin → Community → Departures (with the return review) and Cases |
| `contributions` | `CONTRIBUTIONS_MODE = "ledger"`, `CONTRIBUTIONS_RETENTION_DAYS` (1..3650) | My dues (the member's), Admin → Community → Ledger; without the mode the ledger is read-only |
| `privacy_intake` | `PRIVACY_INTAKE_ENABLED = "true"`, `PRIVACY_INTAKE_MONITORED = "true"` only once an administrator reads the queue, `PRIVACY_INTAKE_RETENTION_DAYS` | the private request form (no sign-in) and Admin → Community → Private inbox |
| the digest | `OFFICER_DIGEST_ENABLED = "true"` and a staff channel (`CHANNEL_MOD_ALERTS` or the review channel) | one daily post of counts after 15:00 UTC; Admin → Community shows its state |

`ROLE_CALL_BUDGET` (40 requests per role-writing run) needs no change. Every feature's retention and erasure are registered
in the Worker; a flag is switched on only when the privacy policy served at `/privacy` from the FINAL signed head says
what the feature does, checked on that head's policy (not on an earlier build's or a prepared copy).

## 5. Publication (the public repository)

The repository `olympus-verify` is published as a snapshot by the owner, on the final jointly signed head, BEFORE the
first deploy of step 1: the published commit is the first shipping commit (section 0), the only commit hosted CI can
test. Every input below belongs to that same final head and tree; nothing is taken from an earlier build or a prepared
candidate. The rename (item 8) comes before item 3, because the helpers require the renamed origin.

**Which helpers.** The helpers committed in `scripts/` are the reviewed successor bundle (Codex's
`publication-reference-crest112-v1`, integrated after both reviews; hashes in `docs/source-provenance.md`): one coherent
set of the six V4 files and the Pages helper and network guard, in which the reference names the four fixed source files
at `32f19b9` and the owner-approved crest exception, the Pages helper checks the bundle's exact staging, reference and
asset-loader digests before it imports anything, and both `stage_publication.py` and `reconcile_public_root.py` name the
exact future origin `https://github.com/SturmFernmelder/olympus-verify.git` (the name the owner authorized; this is not a
claim that the rename has happened). The original V4 and Pages-v2 hashes stay as historical evidence only. A later change
to one of the four fixed files needs another reviewed successor before publication.

1. **The runner root, before anything runs.** The owner copies the exact reviewed bundle (the six V4 files, the Pages
   helper and its guard, keeping their `scripts/` adjacency) into an owner-reviewed runner root outside the keeper
   checkout and outside the public clone. Every helper below runs from that root (`python <runner>/scripts/…`) with
   `--keeper-repo`/`--repo` pointing at the keeper checkout, and every output is a NEW directory below the runner root,
   outside both source repositories. The staging helper itself enforces this: its output must be a new directory below
   its own root (`require_new_output_inside_publication_candidate`) and must not overlap the keeper or the public clone
   (`source_output_overlap`), so it cannot write into the keeper, `.publication/` included.
2. **Inputs on the final head.** The final head and its tree; the seven required documents at their bytes; the
   deployment profile files; the official asset tuple (the externally reviewed asset contract and asset manifest, with
   their SHA-256 values), which the successor reference must match: the four fixed files
   (`worker/public/static/app.js`, `worker/public/static/rank-planner/app.js`, `worker/src/site-ranks.ts`,
   `worker/src/site-data.ts`), the native CSS/JS, and the crest `worker/public/static/olympus-icon.png` as the single
   owner-approved exception (a recalculated hash is never a substitute for that review); the reviewed literal
   classifications regenerated for that head
   (`Olympus/consolidation-2026-09-30/claude-review/literal-classifications-<head>.json`, its hash posted by Claude Code);
   the native policy generator parity receipt for that head's policies.
3. **The audit.** `python <runner>/scripts/publication_audit.py --repo <keeper checkout> --head <final-sha> --out
   <runner>/out/audit-<final-sha>.json --current-only`; the only blocking findings allowed are test fixtures listed in
   the classifications file.
4. **The additive staging, validated first.** `python <runner>/scripts/stage_publication.py --keeper-repo <keeper
   checkout> --keeper-head <final-sha> --public-repo <public clone> --public-head <pinned public parent> --out
   <runner>/out/snapshot-<final-sha> --require-official-assets --literal-classifications <file> --asset-contract
   <contract> --asset-contract-sha256 <hash> --asset-manifest <manifest> --asset-manifest-sha256 <hash>`, then
   `python <runner>/scripts/validate_publication.py` on its manifest. This output is not edited afterwards; its tree,
   manifest and validator receipt are pinned by hash and revalidated during the reconciliation.
5. **The owner namespace and the two receipts.** Codex (root) prepares, outside the keeper, the public clone and the
   additive output, a separately owned Pages namespace with its `.pages-reconciliation-owner.json` marker (schema
   `olympus-pages-owned-output-root-v1`, `prepared_by` `root_codex`); both reviewers then post their separately
   attributed review receipts for the exact three-root policy source and pre-commit reconciliation (`reviewer_role`
   `root_codex` and `actual_claude_code`, each bound to the request's hash, the final head and tree, the policy source
   pins, the parity receipt and the namespace, each with the hash of its own task-log entry).
6. **The reconciliation.** `python <runner>/scripts/reconcile_public_root.py prepare --arguments <arguments.json>
   --arguments-sha256 <hash>` with the request (schema `olympus-pages-exact-policy-reconciliation-v2`, the final head,
   `stageable: true`), the additive manifest and validator receipt from step 4, the asset tuple, the two receipts and a
   new output directory inside the Pages namespace; it replaces exactly the public parent's three root HTML files
   (`index.html`, `privacy.html`, `terms.html`) and nothing else. Then `python <runner>/scripts/reconcile_public_root.py
   validate` on its pinned pre-commit receipt with the same keeper and public repositories. The helper verifies the
   bundle's V4 files and its network guard by SHA-256 before importing anything and never commits, pushes or approves.
7. **Still `ready=false`.** Every receipt above says `readyForPublication: false`, and stays so until the real public
   commit exists with its ref and object closure, its history scan has passed, both agents have signed that publication
   head, and the owner has authorized the push.
8. **The rename.** `olympus-verify-policies` becomes `olympus-verify` only with the reviewed bundle whose
   `stage_publication.py` AND `reconcile_public_root.py` both name `https://github.com/SturmFernmelder/olympus-verify.git`, and whose Pages dependency pins match the
   bundle before import; the existing origin check is never relaxed and the original V4 inputs are never edited in place.
   The Worker serves `/privacy` and `/terms` only once step 1 has deployed the shipping commit (live .46 does not), so
   until then the Pages copy is the only public one. A rename redirects everything except the GitHub Pages project URL:
   the Discord application's Privacy Policy and Terms of Service URLs (`https://sturmfernmelder.github.io/olympus-verify-policies/…`)
   stop answering at the rename. As soon as `https://sturmfernmelder.github.io/olympus-verify/privacy.html` and `terms.html`
   answer 200 with the published policy bytes, the owner sets those two URLs in the Developer Portal (or, after step 1,
   the Worker's own `<PUBLIC_BASE_URL>/privacy` and `/terms`). No new repository ever takes the old name: GitHub would stop
   redirecting it.

## 6. After the launch

- The watcher (`watcher/`) keeps polling `/queue` with its bearer; its configuration (`watcher/config.json`, never read by
  the agents) points at `PUBLIC_BASE_URL`, unchanged by the cutover.
- The addon exports the roster as before; roles follow the roster (`roles.ts`, one writer).
- The daily digest, the sweeps and the retention purges run from the cron.
- Every later change is a build: `BUILD` bumped, a "Worker .NN" section in `deploy-checklist.md`, both signatures, then
  its shipping commit on the public `main` (section 0), green CI on it, both signatures on it, and `deploy-commit.sh`.
