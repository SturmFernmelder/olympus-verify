# Launch runbook (the keeper's side)

The owner's steps, in order, from the release-qualified head to the public launch, and what is checked between them. This
is the keeper's (Olympus Verify's) side; the donor's private phase (Olympus Forever on `olympusforever.roachcouncil.com`)
follows Codex's private-phase contract and is referred to here only where it gates a keeper step. Written 1 October 2026
on head .101 and revised on head .108 for Codex's 12:06 UTC review (R1-R4); every later build adds its section to
`deploy-checklist.md`, not here, unless a step changes. The steps below were carried out on 1 and 2 October 2026;
section 7 records what was done and what is live. The prospective qualification and restore rules below were corrected
on 3 Oct 2026 under the owner's Codex takeover instruction; historical signatures retain their original scope.

Nothing below is an agent's step. The agents prepare exact commits and sign them in the task log
(`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`); Viktor runs the commands, or Codex where Viktor has authorized
it in the log. The never-run list in `CLAUDE.md` stands throughout: `wrangler deploy` from a working folder, `wrangler
secret put`, `db:init` against the remote database, `register`, the watcher against the live Worker, `cutover-config.sh
--apply` before its gates, the publication helpers beyond `--help`.

## 0. What "signed" means

Before 3 Oct 2026 the procedure required the author's signature and the other agent's countersignature on the same SHA.
Viktor then instructed Codex to take over after Claude's usage limit and finish without dual sign-off. For new actions,
the task log must hold Codex's own release qualification on the exact final commit/tree, with independent peer evidence
and the applicable source, tests, bundle, policies/assets, CI and actual-version/live gates or expressly named residuals.
No new Claude signature is required or implied. The interrupted .115 checkpoint
`568c76d958eeee2f2786798bd959b0b2ae8ec299` preserves work only; it is not qualified for release.
The keeper checkout has no remote and its
history stays private, so hosted CI runs only on the public repository: a deploy takes the shipping commit below, and the
push-to-`main` CI run on exactly that commit must be green (`scripts/ci-gate.sh`: the worker, watcher and addon jobs all
`success`).

**The shipping commit.** A deploy takes the public `main` commit P that carries a release-qualified keeper commit K, never K
itself and never a working folder. P carries K when P's root tree holds exactly K's root entries with the same object
IDs, plus `index.html`, `privacy.html` and `terms.html`, which are the same blobs as `policies/index.html`,
`policies/privacy.html` and `policies/terms.html`; then `worker/`, `addon/`, `watcher/`, `scripts/`, `docs/` and every
other entry are byte-identical to K. The check is `git ls-tree <P>` in the public clone against `git ls-tree <K>` in the
keeper. Codex qualifies P under this section (the final tuple is regenerated on P), its push-to-`main` CI run is green, and the owner
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
the aggregate CI result on that head; and Codex's exact final qualification with attributable peer evidence. Throughout, these stay as reviewed: the
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
   ones read at export time; the backup counts as verified only when they match. The scratch database is a full copy
   too, so it is deleted once the counts are recorded, and its deletion is recorded in the task log: for a D1 scratch
   database its name or UUID, the time of the deletion and a `npx wrangler d1 list` taken afterwards that no longer
   shows it (a database has no SHA-256); for a local file its time and SHA-256, as for an export (step 4);
3. keeps only the newest verified export and its bookmark (the owner's answer of 3 Oct 2026): once a new export has
   been verified (step 2), the previous one is destroyed; the bookmark ages out with Cloudflare's point-in-time window;
4. destroys the last export once the launch release is accepted, and from then on destroys each export once its own
   release is accepted; every destruction is recorded in the task log: the time and the SHA-256 of the destroyed
   file, never its path. The privacy policy of .115 states exactly this rule. .115's own export also still holds the
   settings audit rows as they were before the one-time rewrite, until it is destroyed under this rule.

**The newest-only rule is accepted on receipts, not on the instruction** (Codex, 3 Oct 2026 13:24 UTC). A release whose
policy states it is accepted only after this check (for .115: `docs/deploy-checklist.md`, "Worker .115", rollout step
9): after the newest export was verified, the owner gives the exact inventory of the private copies (every export file
by its time and SHA-256, every scratch database a verification restored into by its creation time and its name or UUID,
or for a local file its SHA-256; never a path); it holds exactly that newest export, and the task log holds a
destruction receipt for every earlier export (time and SHA-256) and every scratch database (as step 2 above says: a D1
database by its name or UUID, the deletion time and the listing without it; a file by time and SHA-256). Cloudflare's
point-in-time history (Time Travel) is a separate
facility: it is not a private export and not in this inventory, this rule neither reads nor destroys it, and it ages out
by itself within its window.

No restore is authorized by this runbook; restoring the live database is a separate decision of the owner. Since .115
(3 Oct 2026) the privacy policy binds that decision: if the owner ever restores an export or a point in time, the site
is closed from just before the restore until the steps below are done, and the owner repeats on the restored database
every deletion recorded since the copy was taken. They are read beforehand, by subject and time and never by content,
from the audit log of the database being replaced: the account erasures (`site.data_deleted`, `site.mentions_deleted`)
and the community deletions each module audits; the News notices have a file of their own (step 1 below). Lifetimes need
no replay step of their own: the retention purges delete what has run out when maintenance resumes after safe reopening.

**Restore refusal unless actual quiescence is proved (3 Oct 2026).** Before the final private capture, every
preservation-critical writer must be identified, new admissions excluded, and all previously admitted operations
proved completed or definitively canceled, including pending SQL and associated post-response work on every serving
or retiring version. Cover Settings/Leadership writes and their audit seams, News, and relevant bot/cron/admin-SQL
writers or deletion records. Keep that exclusion through replacement, schema recovery, replay and read-back.
No finite longest lifetime for an admitted HTTP save has been established. A fixed wait, two or more equal captures,
asking staff to stop, closing a browser tab, website WAF closure or an ordinary redeploy does not supply this proof.
Equal captures are a cross-check only; an admitted writer can still be waiting before its commit.
If actual quiescence cannot be proved and maintained, **refuse the restore before the final capture or replacement**.
This runbook supplies no provider cancel-all operation or current runtime barrier.

A future authoritative maintenance epoch would have to fence every preservation-critical commit and its audit,
survive database replacement, cover old versions, and reject stale admitted writers after reopening. That epoch barrier
is **not implemented**; it must not be assumed from proposed .116 work or a deployment receipt.

**What a restore must keep** (Codex, 3 Oct 2026 13:26 UTC; the second review round of 3 Oct 2026). The deletion replay
cannot carry two kinds of change, because their audit entries hold no content, on purpose:

- **Typed names.** The appointed roles and the Olympus I-X directory are two `site_settings` rows, `appointed` and
  `leadership`, and their audit entries (`site.settings`, `site.leadership`) record counts only, never a name (section
  9). So the replay cannot tell which names were removed or corrected on request since the copy was taken. The owner
  puts back those two rows exactly as they stood right before the restore, privately, never through the audit.
- **News notices.** A notice changed on request since the copy (a name taken out, say) would come back with its earlier
  text, and a notice posted since the copy has neither a row nor its operation record on the copy, so an administrator
  page opened before the restore could post it again with "Retry the same" (its id is still inside its 30 days). The
  audit has each notice's id and the time it was posted, changed or deleted (`site.news_notice`, never a title or a
  text), and that is enough: every restored notice changed or deleted since the copy is deleted, so none comes back in
  an earlier form (a notice changed since is posted again by an administrator if it is still wanted), and every notice
  posted since the copy gets its operation record back, the tombstone, kept 120 days from its posting like the original,
  so a stale retry is answered "deleted".

The steps, in order:

0. **Close new admissions and prove quiescence; keep both conditions through step 5.** The Worker serves the restored database the moment it is in
   place and has no maintenance switch, so a restored name or notice would be public, crawlers included, until the
   statements below ran. The owner therefore first blocks the site's host (`SITE_HOST`) in the Cloudflare dashboard
   with a custom rule (Security, WAF, custom rules: hostname equals the site's host, action Block) and checks that the
   site's front page answers with Cloudflare's block page; the legacy hosts only redirect there. This blocks new website
   admissions, not saves admitted earlier. The bot host (`PUBLIC_BASE_URL`), cron and direct SQL must be assessed as
   writers of preservation-critical state, regardless of whether their answers show names. The task log records the
   exclusion's scope, actual terminal-state evidence for admitted work and when each relevant gate closed/reopened.
   Telling administrators not to save is an additional precaution only. If exclusion or actual quiescence cannot be
   established and maintained, nothing is restored; no wait or capture-equality shortcut advances to step 1.
1. **After the quiescence evidence, right before restoring**, the owner reads from the database being replaced, into private files outside every
   repository, kept like an export, the statements that write the typed names back (SQLite's `quote()` writes each
   value as a literal, so an apostrophe or any other character in a name survives) and the statements for the News
   notices (`<since>` is the copy's time in Unix seconds less 300: the export's start, or the Time Travel timestamp; the
   margin only adds statements that change nothing or delete a notice changed just before the copy), and turns each
   result into a SQL file:

   ```bash
   npx wrangler d1 execute <keeper database> --remote --json --command "SELECT CASE WHEN s.key IS NULL THEN 'DELETE FROM site_settings WHERE key = ' || quote(k.key) || ';' ELSE 'INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (' || quote(s.key) || ', ' || quote(s.value) || ', ' || quote(s.updated_at) || ', ' || quote(s.updated_by) || ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;' END AS stmt FROM (SELECT 'appointed' AS key UNION ALL SELECT 'leadership') AS k LEFT JOIN site_settings AS s ON s.key = k.key ORDER BY k.key" > <private dir>/typed-names.json
   node -e "const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(r[0].results.map((x) => x.stmt).join('\n') + '\n')" <private dir>/typed-names.json > <private dir>/typed-names.sql
   npx wrangler d1 execute <keeper database> --remote --json --command "SELECT stmt FROM (SELECT 1 AS o, subject AS id, 'DELETE FROM site_news_notices WHERE id = ' || quote(subject) || ';' AS stmt FROM audit WHERE action = 'site.news_notice' AND ts >= <since> AND CASE WHEN json_valid(details) THEN json_extract(details, '$.op') END IN ('edited', 'deleted') GROUP BY subject UNION ALL SELECT 2, subject, 'INSERT OR IGNORE INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (' || quote(subject) || ', ''restored'', NULL, ' || MIN(ts) || ', ' || (MIN(ts) + 10368000) || ');' FROM audit WHERE action = 'site.news_notice' AND ts >= <since> AND CASE WHEN json_valid(details) THEN json_extract(details, '$.op') END = 'created' GROUP BY subject) ORDER BY o, id" > <private dir>/news.json
   node -e "const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(r[0].results.map((x) => x.stmt).join('\n') + '\n')" <private dir>/news.json > <private dir>/news.sql
   ```

   The typed-names file holds exactly two statements. A key without a row gives a DELETE: no `appointed` row means the
   default Treasurer appointment (`site-data.ts DEFAULT_APPOINTED`), so the restored database must not keep one either.
   The News file holds a DELETE for each notice changed or deleted since the copy and an `INSERT OR IGNORE` of the
   operation record (no author, its posting time, 120 days = 10368000 seconds) for each notice posted since; it holds
   ids and times only, never a title or a text. The owner also runs the settings-audit read-back
   (`docs/deploy-checklist.md`, "Worker .115", rollout step 7) on the database being replaced and records its three
   numbers. The marker is never copied (step 4 says why).
2. **The restore.** The site stays blocked.
3. **Fresh isolates, then the files.** A running isolate checks the schema once (`schema.ts ensureSchema`) and does not
   look again after a restore, so it would neither create a table or column the copy lacks (a copy taken before .115 has
   no News tables) nor rewrite the copy's older settings rows, for as long as it lives. So the owner first redeploys the
   version that is live, the same qualified commit (`bash scripts/deploy-commit.sh <the live P>`, section 1; nothing else
   changes), and uses a separately reviewed schema-recovery entry point that maintains exclusion of ordinary writers.
   A request served by a new isolate runs the schema check: tables, columns and the one-time rewrite. Redeployment
   does not prove every old invocation ended; a generic bot `/health` request must not reopen bot/cron writers merely
   to reach recovery. If recovery cannot be performed while the quiescence/exclusion precondition remains true, stop.
   A counts-only read
   then confirms the News tables are there (`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN
   ('site_news_notices', 'site_news_ops')` gives 2). Then the owner runs the two files, then the deletion replay:
   `npx wrangler d1 execute <keeper database> --remote --file <private dir>/typed-names.sql`, the same for
   `news.sql`. Each statement stands alone and each file can be run again with the same result; they go through no
   Worker route, so the dated log never receives a name. Reading the two settings rows again (`SELECT key, value,
   updated_at, updated_by FROM site_settings WHERE key IN ('appointed', 'leadership')`) must give exactly what the file
   wrote; the owner compares privately.
4. **The settings-audit read-back runs on the restored database**, after step 3's fresh isolates. A copy taken before
   the .115 rewrite holds the old shape and no marker, so the new isolate's schema check rewrites it; copying the marker
   over would stop that, which is why it is never copied. A copy that carries the marker but still holds a named field
   (a save a .114 isolate made after the marker) is handled as rollout step 7 says: the marker is deleted, the same
   commit is redeployed once more for a fresh isolate (as in step 3), and the read is repeated.
5. **The site opens again** (the block removed) only when actual exclusion/quiescence has been maintained, no old
   admitted writer can resume after reopening, step 3 compared equal and both files ran, the read-back
   passes (marker 1, residual 0, unreadable 0) and the deletion replay is done. Comparison equality is not a drain proof.
   Then the private `.json` and `.sql`
   files are destroyed; the task log records the time and SHA-256 of each file when it was made and when it was
   destroyed, how many appointed roles and directory names were put back, and how many notices were deleted and
   operation records put back, never a path, a name or a text.

If the two settings rows or the News audit cannot be read before the restore, the restored site stays closed until the
owner and Codex have qualified how the changes made on request are carried over, with attributable peer review.
Missing quiescence still refuses replacement; missing capture evidence is never permission to reopen. Rehearse steps 1 and 3 on the
private scratch database an export verification uses (the backup's step 2 above), before it is deleted: the commands
are the owner's, and the `node` lines read wrangler's `--json` output as one result whose `results` hold the rows.

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
clone. Codex qualifies that keeper commit under section 0; the owner carries its two files, as the exact same blobs, to a pull request
on the public `main` (the shipping-commit rule of section 0); `--check` passes there too, the push-to-`main` CI run is
green, and Codex qualifies the resulting public commit under section 0. Then, in the public clone:

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
2 October, the date is re-reviewed forward before the deploy; after the cutover that move is an activation, step 4, and
the date only ever moves forward).

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
history and the marker is never removed. After the cutover only the eight activation keys change (the seven community
keys and, forward only, `VERIFY_OPEN_SINCE`), through `cutover-config.sh --activate` (step 4), which appends a record and
leaves the cutover's own `profile_sha256` and `applied_at` as they are; any other edit of either file fails `--check`.

## 4. Switching the community features on

Each switch is a reviewed configuration change committed and deployed like any build (the Worker reads
`COMMUNITY_FEATURES` at request time; a deploy is the switch).

**How a switch is made after the cutover.** The keeper edits `worker/wrangler.cutover.toml`, changing only the activation
keys (`COMMUNITY_FEATURES`, `CONTRIBUTIONS_MODE`, `CONTRIBUTIONS_RETENTION_DAYS`, `PRIVACY_INTAKE_ENABLED`,
`PRIVACY_INTAKE_MONITORED`, `PRIVACY_INTAKE_RETENTION_DAYS`, `OFFICER_DIGEST_ENABLED`, and gate 6's `VERIFY_OPEN_SINCE`),
commits nothing yet, and runs `bash scripts/cutover-config.sh --activate`. It refuses unless the marker exists, the live
file is the profile the marker records last and is committed clean, and the profile differs from it in those keys and
nothing else; a changed `VERIFY_OPEN_SINCE` must stay one `KEY = "YYYY-MM-DD"` line naming a real calendar day strictly
later than the live one (an earlier, equal, empty, removed or malformed date is refused, so a member's grace before a
removal may be offered is never shortened; an activation that leaves the date alone is not affected). It then copies the
profile over the live file and appends one record (`activation_profile_sha256`, `activated_at`) to the marker. Codex
qualifies that keeper commit; its three changed files reach the public `main` as the same blobs by pull request (section 0);
`--check` passes there; CI, exact-commit qualification under section 0, and `deploy-commit.sh` follow. Switching a
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

**The opening date** (Codex, 1 October 2026, 23:14 UTC). The command registration and the guide in Asmongold's server were
not yet available late on 1 October, so the reviewed date moves forward to `VERIFY_OPEN_SINCE = "2026-10-09"`;
`UNVERIFIED_GRACE_DAYS` stays 3, so nobody first seen before 9 October is offered for removal before 12 October 00:00 UTC.
Counted from the cutover's 2 October, offers could start on 5 October 00:00 UTC; if the opening has not happened by then,
the move is deployed before that time as its own date-only activation (the community keys unchanged), otherwise it may
travel with the first activation. If the opening slips past 9 October too, the date moves forward again the same way.
Moving it forward only lengthens the grace; the offers stay officer suggestions and nothing becomes automatic.

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

The repository `olympus-verify` is published as a snapshot by the owner, on the final release-qualified head, BEFORE the
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
   (an exact-head literal-classification artifact and hash, attributed to its actual author; historical Claude
   artifacts remain in `Olympus/consolidation-2026-09-30/claude-review/`);
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
5. **The owner namespace and exact-head review receipts.** Codex (root) prepares, outside the keeper, the public clone and the
   additive output, a separately owned Pages namespace with its `.pages-reconciliation-owner.json` marker (schema
   `olympus-pages-owned-output-root-v1`, `prepared_by` `root_codex`). The currently pinned constructor's two-receipt
   vocabulary (`root_codex` and `actual_claude_code`) predates the takeover; a new-head receipt must never fabricate
   Claude approval. Before new use, a reviewed exact-head constructor successor must implement section 0's Codex
   qualification with separately attributable peer evidence. Its receipts bind the request's hash, final head/tree,
   policy source pins, parity receipt, namespace and each author's own task-log entry. This documentation batch does
   not change the constructor or supply such receipts.
6. **The reconciliation.** `python <runner>/scripts/reconcile_public_root.py prepare --arguments <arguments.json>
   --arguments-sha256 <hash>` with the request (schema `olympus-pages-exact-policy-reconciliation-v2`, the final head,
   `stageable: true`), the additive manifest and validator receipt from step 4, the asset tuple, the two receipts and a
   new output directory inside the Pages namespace; it replaces exactly the public parent's three root HTML files
   (`index.html`, `privacy.html`, `terms.html`) and nothing else. Then `python <runner>/scripts/reconcile_public_root.py
   validate` on its pinned pre-commit receipt with the same keeper and public repositories. The helper verifies the
   bundle's V4 files and its network guard by SHA-256 before importing anything and never commits, pushes or approves.
7. **Still `ready=false`.** Every receipt above says `readyForPublication: false`, and stays so until the real public
   commit exists with its ref and object closure, its history scan has passed, Codex has qualified that publication
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
- Every later change is a build: `BUILD` bumped, a "Worker .NN" section in `deploy-checklist.md`, exact-head qualification
  under section 0, then its shipping commit on the public `main`, green CI and its qualification, and `deploy-commit.sh`.

## 7. Launch record (1 and 2 October 2026)

What was done, in order, and what is live. Every step below has both agents' signatures in the task log and a frozen
receipt under `Olympus/consolidation-2026-09-30/evidence/root/` (named in brackets); a step is described here only to
the extent those receipts show it. Times are UTC. The live code stayed build .113 throughout (one bundle, `index.js`
`1c417f22…`); only the configuration changed between deploys.

| When | What | Keeper commit / public `main` | Cloudflare version |
|---|---|---|---|
| 1 Oct 19:31 | Step 1: the keeper chain deployed to the current server | `eab8e48` / `90dbc94e` | `9357088f` |
| 1 Oct 21:40 | Step 3: the cutover (`--apply` 20:36:18): Asmongold's server, `olympus.roachcouncil.com`, `guild.roachcouncil.com` answering 301 | `5bd1eef` / `84832fbc` | `319a1cd0` |
| 1 Oct 23:22 | The owner rotated the Discord bot token and replaced the Worker secret in the dashboard (no code or profile change) | (none) | `1e009521` |
| 2 Oct 02:42 | E2: `VERIFY_OPEN_SINCE` moved forward to 2026-10-09 (`--activate`, forward only) [`protective-date5ebf-postupload`] | `a76b3ee6` / `5ebf756c` | `9827ab10` |
| 2 Oct 04:10 | E3, the first activation: the nine community features, the dues ledger (90 days), privacy-case retention 30 days, the officer digest; the private intake closed [`first-features-fc21-operating`] | `bc2ec08f` / `fc21f343` | `fdf41b8f` |
| 2 Oct 05:01 | E4, the second activation: `PRIVACY_INTAKE_ENABLED` and `PRIVACY_INTAKE_MONITORED` true [`intake-e4-operating`] | `9e2628f9` / `364c5620` | `a18a10aa` |

Live since 05:01:58 on 2 October: public `main` `364c5620` (profile `d3c318d0`) as version `a18a10aa` at 100%. The
`main` commits between are tooling or reviewed carries only (`caafdcb0`: the undici override, never deployed on its own).

**In Asmongold's server** (ROOT operated, both agents reviewed):
- **Commands.** Six registered by operation `20261002b`, which kept the three existing command IDs and their staff overrides (`/olympus-intros`, `/olympus-lookup`, "Olympus linked characters": Olympus Guild Leader and Olympus Officer only) and added `/verify`, `/verify-status` and `/olympus-admin` [`command-registration113-20261002b-*`]. An earlier attempt `20261002a` stopped at its first read (403, no write).
- **`/olympus-admin`.** Its default stays Manage Roles, and the two staff roles were given role overrides by the owner's decision [`admin-command-staff-applied`].
- **The guide.** Posted once and pinned in #join-olympus [`discord113-guide-applied`]; the channel topic was saved and read back [`discord113-join-topic-readback`].
- **The intros.** The twelve channel intros refreshed in place (three updated, nine current) [`discord113-intros-applied`].
- **Channel visibility.** The owner approved five `@everyone` View changes from Deny to Passthrough: #olympus-info, #join-olympus, #olympus-notices and the two visitor channels [`discord113-public-five-inherit-applied`]. They inherit the server-level View, which roles such as Verified have and `@everyone` does not; Olympus Guild Members stay denied in the visitor channels.

**On the site:** the staff pages were read in the site administrator's session [`staff-purpose-live-readonly-v1`]. The
private inbox was viewed empty and paused before E4 and accepts new cases since; no case was created for a test.

**Rollback.** Never select a version that carries the old, invalidated bot token: `319a1cd0`, `9357088f` or anything
earlier, including the pre-cutover profile. Do not select `1e009521` either, because it moves the opening date back to
2 October. If a rollback is ever needed, it is to an earlier version of the rotated-token chain that keeps the date:
`fdf41b8f` (E3, intake closed) or `9827ab10` (E2, community off), all build .113 with every retention purge. After a
rollback in the dashboard the live service is behind `main` and the keeper until a reviewed forward change is
deployed. Records already written keep their own retention (`retain_until`), whatever the flags.

**.114 changes the rollback rule (2 Oct 2026).** Every version before .114 is build .113, which has no Battle.net
switch: with the two Blizzard secrets present, rolling back to `fdf41b8f`, `9827ab10` or any other .113 version switches
the old always-on Battle.net login back on (anyone with the direct link could link again). Once .114 is live, its own
version is the rollback floor for ordinary incidents; a rollback below it is also a decision to reopen the login, and the
privacy policy served by .113 still describes that login. It also drops the rename holds: .113 does not know the
`rename_holds` table, so it grants Guild Member to an account an administrator asked to apply again, and it does not clean
closed holds; the rows stay and are honoured again once .114 or later is back. The exact .114 version ids are recorded
here once deployed.

**.114 live, and .115's rule (3 Oct 2026).** .114 was deployed on 2 October (task log 21:54 UTC) from public `main`
`6f462d2` as Cloudflare version `59f6dc91`, and accepted, bounded, by both agents at 22:19 and 22:20 UTC. Once .115 is
live, `59f6dc91` is the only rollback target, under the conditions in `docs/deploy-checklist.md` ("Worker .115",
Rollback): the News rows deleted by the owner, no Settings saves while .114 runs, a forward-fix policy pull request
or a same-day roll-forward, and after the roll-forward the settings-audit read-back again (section 9, item 5). Every
.113 version stays excluded.

**What is not yet accepted.** The live configuration is delivered and signed, but the following are still open, and the
launch counts as accepted only once each is observed or explicitly named as a residual in Codex's final qualification:
- an ordinary Discord account's view of the five channels and the guide's Get my code / My status;
- the officer's current game client and a full roster export from it (realm, guild, rank);
- the watcher run against that roster with its state preserved;
- an ordinary member's own pages on the site;
- the first scheduled officer digest after 15:00 (counts only, in the private review channel);
- Codex's whole-tool qualification on one final commit under section 0, with attributable independent peer evidence.

## 8. The end of the beta (from 22 October 2026; Viktor's item 8, build .114)

Blizzard gives 21 October 2026 as the beta's last full day and no hour, and the launch as 4 November 2026. Viktor's scope,
confirmed through Codex (log 17:42 and 17:57 UTC, 2 Oct): Olympus guild ranks and guild leadership assignments are chosen
again from scratch for the full release; Asmongold's general roles, applications, votes and private records are not
touched. Nothing runs on a timer; every step below is a person's.

1. **Wait until the beta has actually closed.** Do not guess an hour.
2. **Record the closing moment** on the site: Admin → Settings → End of the beta → "The beta closed at" → Record. It must
   be in the past; the reset stays locked until it is recorded.
3. **Reset**: same block → Reset guild leadership → type RESET. The appointed roles become an explicit empty list (the
   default Treasurer appointment does not come back) and the Olympus I-X leadership directory empties. Optionally set a
   notice such as "Guild roles are open again for the full release". Applications, votes, memberships, links, bans and the
   dated log are kept. Suggested window: 22 to 26 October, so that applications and votes for the full release can finish
   before 4 November.
4. **In game**: the Guild Master (Viktor, or an approved GM) sets the ranks by hand from the new decisions. The website
   cannot change game ranks; the rank planner only drafts. The in-game ladder decision changed on 3 Oct 2026 (owner
   answer 6: ten ranks, the Treasurer at index 2 right below Officer, no Probation), and its planner preset and in-game
   steps come in a later release.
5. **In Discord** (a person with Manage Roles; the bot cannot, its role sits below these): remove Olympus Officer, Olympus
   Guild Leader, Olympus Raid Leader, Olympus Council GM and Olympus Council Officer from everyone who is not kept. Keep
   Viktor and at least one Olympus Guild Leader, or nobody can use /olympus-admin, /olympus-intros and the officer lookups.
6. **Assign the new leaders**: Discord roles by hand, each named person reviewed first (the Council roles only after that
   review), the site's appointed roles in Admin → Settings, the I-X directory in the same place.
7. **Announce once**: a site notice and, if wanted, one staff post in #guild-announcements; no per-member mentions.

Launch-day items that are not part of the reset and still need a reviewed path before 4 November: `LINKS_NOT_BEFORE` (it
is not an activation key, so `scripts/cutover-config.sh` refuses it today) and a cutoff for invite-queue rows made during
the beta (an invite to a beta name would reach whoever holds that name on live).

## 9. Typed names (from build .115)

Two places on the site hold names an administrator types, tied to no Discord account: the appointed roles (Admin →
Settings; public on the open web, signed in or not) and the Olympus I-X leadership directory (confirmed members). The
privacy policy promises consent and removal on request, so:

1. **Ask first.** Type a name only after that person agreed to be named there. The page's consent box must be ticked to
   add a name or give a role another holder; the server checks that it was ticked, not that the person agreed, so the
   asking is the administrator's.
2. **Remove on request, at once.** For an appointed role, type Name withheld in place of the name (the role stays
   appointed, its board and applications closed) or clear it (the role reopens for applications). In the directory,
   clear the entry or type Name withheld. Neither needs the box. A request may come to any Olympus officer or through
   the private request form; it does not need the person's Discord account.
3. **Correct on request** the same way, with the box ticked for the corrected name.
4. **The dated log records counts only**: which roles were appointed, how many names were saved, whether the notice was
   set and the box ticked; never a name. Since .115 the older log rows get the same shape: .115 rewrites them once at an
   isolate start, and a failure is logged and tried again at a later start, so the deploy is accepted only after the
   read-back in item 5. Search engines and web archives may have copied a public name; removal here cannot recall their
   copies, and the policy says so.
5. **The rewrite's read-back, and the rollback boundary** (Codex, 3 Oct 2026 13:24 UTC). The marker `auditTypedNames`
   records that the rewrite ran once; it says nothing about rows written after it. An older writer resumed after the
   marker writes the old shape again (the appointed names and the notice's text): a .114 isolate that finishes a
   Settings save during a deploy, or .114 itself after a rollback. .115 does not rewrite again while the marker stands,
   and neither a rollback, a roll-forward nor a mixed-version window ever counts as having rerun it. So administrators
   save no Settings from the start of a deploy or rollback until the read-back passes, and after the .115 deploy, after
   any roll-forward to .115 and after a restore the owner runs the counts-only settings-audit read-back
   (`docs/deploy-checklist.md`, "Worker .115", rollout step 7). It must give marker 1, residual 0 and unreadable 0. If
   residual is above 0, the owner deletes the marker (`DELETE FROM site_settings WHERE key = 'auditTypedNames'`) and
   starts a fresh isolate, whose schema check rewrites the remaining old-shape rows (only those): running isolates have
   checked their schema already and do not look again, so the owner redeploys the same commit (`bash
   scripts/deploy-commit.sh <the same P>`, section 1) and requests the bot host's `/health` once; then the read is
   repeated until it passes (the second review round, 3 Oct 2026). If unreadable is above 0, acceptance waits while the
   owner inspects the rows privately and Codex qualifies the remedy with attributable peer evidence. The task log
   records the three numbers, never a row. During a restore, section 1's recovery path must maintain actual
   quiescence/exclusion; an ordinary bot health request is not permission to reopen writers.
6. **Across a restore**, section 1 first requires actual write quiescence, maintained exclusion and proof that no old
   admitted writer can resume after reopening; without them, refuse the restore. Under those conditions the owner
   preserves the two rows privately after the terminal-state evidence and writes them back before the site opens
   again ("What a restore must keep"), never through the audit. Website closure or equal captures alone is insufficient.

## 10. When the roster is refused (from build .115)

An officer's steps, from the server log; nothing here needs the owner. The roster still decides Guild Member, so while
an export is refused nothing the roster drives changes: no promotion, no departure (a member who left keeps Guild Member
and the private channels until an export is applied again) and the seat line turns "unknown" once the last applied
export is 48 hours old. Fail closed, by design (Codex, 3 Oct 2026 13:15 UTC, finding 2; the second review round).

1. **"an export of N members was refused: A / a, ... the same name more than once, ignoring case and realm"**
   (`roster.duplicate_names`, logged once every six hours while it lasts). The bot tells characters apart by the name
   without its realm and ignoring case, so two characters whose names differ only there cannot both be on one export,
   and every export is refused until each name appears once. Rename or remove one character of each pair the line names
   (or ask its owner to), then let the addon export again (`/olv sync`); the first export without a collision is applied
   as usual. Do not edit the export by hand: the next one from the addon would bring the pair back.
2. **"an export of N members was refused: only M of its member rows were stored"** (`roster.ingest_unusable`). Nothing
   was applied and the last export stands. It has no known cause in the officers' hands: tell Codex in the task
   log (the counts, never a name); the next export is tried afresh.
3. **`/olympus-admin sync` answers "Nothing applied"**: the latest snapshot is still being written (run it again in a
   few minutes), or it stores fewer member rows than its export listed. In the second case the reply names the
   snapshot, #N; wait until `/olympus-admin roster` shows a snapshot newer than #N (an identical export may first only
   mark #N unfinished; the export after it is written in full), then run sync again.
4. **A large export is applied over several exports** (the third review round, 3 Oct 2026; Codex 16:48 UTC, finding A).
   When many linked characters reach the roster at once (launch day), one export applies what fits in its own request
   and the rest follows with the next exports and the cron every 30 minutes; nothing is refused and nothing is needed
   from anyone. `/olympus-admin sync` does the same and says "Not applied yet (N)": run it again until that line is gone.
