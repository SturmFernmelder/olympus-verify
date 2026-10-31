# Attended Stockades legacy-role reset

This operator tool removes assignments of fourteen fixed legacy roles from **Olympus: The Stockades & Court of
Appeals**, Discord server `1549537348516188200`. It keeps the role definitions. The owner's 28 October 2026
instruction approved this bounded cleanup and a reusable bot operation in place of individual Discord UI clicks.

The tool is a Python standard-library CLI, not a website feature, scheduled job or Worker endpoint. Its operation
ledger is a local file. It neither reads nor resets D1, website verification records, applications, roster history
or the existing main-server beta-reset policy. No Worker deployment or new D1 schema is needed.

The prior attended Discord UI cleanup reported all fourteen roles at zero assignments. That historical result is
not a current bot preview, a live test of this tool or proof that assignments cannot return. A new use begins with
a fresh Discord preview. This tool does not automatically grant roles again or establish a Twitch-style membership
integration.

## Exact scope

No command accepts a different guild or an arbitrary role list. The fixed scope name is `stockades-legacy-14`.
Counts are role assignments; a person holding several selected roles counts several times.

| Role | Discord role ID |
|---|---|
| Guild Member | `1549581282227265566` |
| Veteran | `1555039815395713136` |
| Tank | `1549582112636665996` |
| Healer | `1549582122971562075` |
| DPS | `1549582133197017290` |
| Druid | `1549582202126344283` |
| Hunter | `1549582423992574094` |
| Mage | `1549582577575137340` |
| Paladin | `1549582703442137251` |
| Priest | `1549582829896208465` |
| Rogue | `1549582894161199246` |
| Shaman | `1549583033198317678` |
| Warlock | `1549583125368279161` |
| Warrior | `1549583202744533022` |

Guild Master, Guild Leader, Moderator, Officer, Raid Leader, the Beta staff roles, Olympus Verify, MEE6,
Battle.net Linked, Server Booster and every other unselected role stay outside the removal scope. The tool must
not kick, ban or prune members, delete role definitions, change permissions, alter role order or replace a member's
whole role array. It uses individual selected-role removals and checks preservation against its preview.

## Before starting

Use an attended terminal and the intended bot's **bot token**. The bot must belong to the Stockades server, have
the `GUILD_MEMBERS` privileged intent needed for a complete member inventory and hold Manage Roles. Its highest
role must be above every selected role. In particular, **Veteran may be above the bot**: a hierarchy refusal is a
hold, not a reason to skip that role or call the reset complete. This tool never elevates the bot or changes the
server's permissions. A missing role, changed definition or inaccessible inventory needs review.

Supply the token through either `OLYMPUS_ROLE_RESET_BOT_TOKEN` in the process environment or `--prompt-token`,
which requests it privately through `getpass`. Do not put a token in a command argument, job path, script, chat,
screenshot or evidence file. Do not use a Discord user token. The tool does not read `watcher/config.json`,
`worker/.dev.vars`, browser sessions or another application's credential store. Avoid shell history and transcript
logging while entering credentials. An existing environment token can be used without a token flag.

Run the examples from the repository root with Python 3. Use a new private job path under the ignored
`tools/out/stockades-role-reset/` directory. Keep the job in place while work is unresolved. Use one attended
operator process per job; do not copy a live job into parallel runners or hand-edit its journal.

## Preview, confirm and apply a bounded slice

```text
python tools/stockades-role-reset.py preview --job tools/out/stockades-role-reset/job1 --prompt-token
```

Preview performs reads. Review the reported guild, scope, selected role definitions, per-role assignment counts,
protected-role checks and plan SHA-256. Preview is not removal authorization by itself. Confirm only the displayed
plan for this exact server. Copy its actual digest in place of `PLAN_SHA256` below; the placeholder is not usable.

```text
python tools/stockades-role-reset.py run --job tools/out/stockades-role-reset/job1 --confirm-plan PLAN_SHA256 --confirm-guild 1549537348516188200 --confirm-scope stockades-legacy-14 --max-removals 25 --prompt-token
```

The default maximum is 25 removals per invocation. Repeat an attended `run` only after checking the current job
status and resolving any unknown outcome. It continues the same retained plan rather than starting a fresh
unbounded sweep. A no-assignment preview still needs the tool's final verification; it does not justify synthetic
role grants to make a test case.

Plans expire **30 minutes after preview**. Expiry applies to the first run and every resumed run. An unfinished
expired plan stays paused; `status` reports `expired: true` and exits 2 while pending operations remain. Reconcile
its unresolved intents before considering a new preview; do not overwrite, discard
or replace an uncertain job just to obtain a fresh expiry. A new preview is a new inventory and needs its own
review and digest confirmation. The tool does not silently renew approval or operate unattended.
`run` requires an interactive terminal even when the token comes from the environment. The exact plan/guild/scope
arguments still apply; a terminal is an attendance guard, not independent proof of who approved the plan.
Missing or whitespace-containing tokens and noninteractive prompt/run attempts are refused before a new job
directory is created. A nonblank token is not validated locally: if Discord rejects it, or the first provider read
fails, preview leaves an empty private job directory containing its database and lock file but no plan or selected
member IDs. Keep that diagnostic distinct from a successful preview and use a new job path; the tool cannot redact
a job that never acquired a valid plan. Reusing the same path is refused rather than overwriting it.

## Status and uncertain results

```text
python tools/stockades-role-reset.py status --job tools/out/stockades-role-reset/job1
python tools/stockades-role-reset.py reconcile --job tools/out/stockades-role-reset/job1 --prompt-token
```

`status` reads the local ledger only and needs no token. It is not a new Discord observation. `reconcile` makes
**GET requests only** to check uncertain retained intents; it never replays their DELETE requests. A timeout or
lost answer after a removal request is an unknown outcome, even if it may have succeeded. Resolve it through
readback. Do not treat a request retry, a blank list, a permission error, a partial scan or an expired plan as
completion. If Discord still shows the role or the readback is unavailable, retain the unresolved state and review
it before further writes.

Reconciliation cannot prove the fate of an earlier request solely from an unrelated role count. Preserve the
original intent and the tool's stated uncertainty. A fresh preview does not erase old custody or authorize a
blind replay of unknown dispatches. Rate limits and provider errors may stop a slice; inspect the result rather
than launching parallel runs or changing permissions.

A cooldown exceeding one minute or expiry before the transport opens is recorded as a **known not-dispatched**
refusal. It leaves the assignment unspent; this is the only case that can restore a claimed row to pending.
Every actual transport attempt remains spent, including DELETE 429/403/404/5xx responses: there is no automatic
DELETE retry. GET 429 may retry once only when all supplied backoff values are usable and the longest is at most
60 seconds. Longer or ambiguous backoff stops the process. Only Discord's explicit HTTP 404 / code 10007
(`Unknown Member`) establishes member absence; a generic 404 cannot settle uncertainty.

## Verify against Discord

```text
python tools/stockades-role-reset.py verify --job tools/out/stockades-role-reset/job1 --prompt-token
```

A verified job is terminal: a second `verify` is refused before provider reads and cannot overwrite its original
successful proof or reopen the job. Blocked previews remain blocked; `reconcile` and `verify` refuse them before
provider reads, even if a legacy job previously acquired a misleading ready-to-verify label.

Verification performs a fresh whole-server member scan, checks selected assignments, compares the exact role
definitions and checks protected roles on the plan's selected subjects. Unrelated members gaining a boost,
linking Battle.net or leaving do not fail this scoped membership comparison. Changed protected roles on a selected
subject still fail it. Existing version-1 jobs retain their original whole-server digest comparison; the tool
does not rewrite those plans or their hashes. A completed removal slice is not final verification. Only a complete,
usable scan with the expected role definitions and protected-role checks can support success. New assignments
or a changed server state are reported, not silently folded into the confirmed plan. Verification is a point-in-time
observation; keep old MEE6 self-role grants disabled if those labels are retired.

Keep live qualification separate from local tests: unit tests exercise a fake Discord service and cannot prove
the real bot's intent approval, role hierarchy, inventory permissions, Discord readbacks or current counts. The
historical UI cleanup, a successful offline test and an actual successful bot verification are distinct evidence.

## Local privacy and closeout

The active job records Discord account IDs and role assignments needed to resume and reconcile the exact plan.
They are personal data. **This local file is not covered by the website's Native E2 erasure/export machinery.**
Only selected removal subject/role pairs are retained; the tool does not retain member names, avatars or a full
member list. New version-2 plans retain one canonical digest of protected account/role pairs on selected subjects;
aggregate protected-role counts still describe the whole scan. That digest is private operational evidence, not
an anonymity guarantee. A blocked preview retains only aggregates and role definitions: no selected subject IDs,
operations or protected membership digest. It can never become dispatchable by fixing permissions afterward;
use a newly reviewed preview after the blocker is addressed.
Keep it private, outside publication artifacts and Git. `tools/out/` is already ignored; that is not encryption or
an access-control guarantee. Avoid unprotected backups, cloud shares and pasting raw job contents into tickets.

Reduce settled operation evidence to its counts-only receipt without waiting for unrelated guild churn to stop:

```text
python tools/stockades-role-reset.py redact --job tools/out/stockades-role-reset/job1
```

`redact` is local-only and needs no token. It is allowed when every operation is settled
(`confirmed_absent` / `observed_absent`), even if verification failed or has never run. Never-dispatched pending
rows (`attempts=0`) can also be abandoned after plan expiry, or immediately for a blocked legacy plan. An unexpired,
dispatchable pending plan cannot be redacted. Any `dispatching`, `acknowledged`, `unknown` or `held` row prevents
redaction even after expiry: GET-only reconciliation must resolve custody first. There is no timed deletion of
uncertain intents and no automatic replay.

If a held or unknown assignment is still present, reconciliation deliberately keeps it held. It cannot prove that
the earlier DELETE never reached Discord and will not resend it. If removal is still wanted, review the retained
uncertainty and obtain a separately reviewed fresh preview/plan in a new job directory; its exact plan/guild/scope
confirmation authorizes only that new operation. Alternatively, an authorized operator may remove the assignment
outside this tool. After current readback shows the assignment absent, GET-only `reconcile` on the **original** job
records `observed_absent`; this is current absence, not proof of what caused it. The original job can then be redacted
once all other intents meet the same settled boundary.

If the assignment is deliberately kept, this tool has no safe forced-close or automatic retention expiry for the
unresolved original job. Its planned subject IDs remain private until absence/member departure settles custody or
an explicitly reviewed future custody design supplies another truthful closeout. Do not delete the directory by
hand or label it redacted/successful to bypass that limitation. This unresolved-custody retention exception remains
an operational limitation; a new preview does not erase it.

Before an attended `redact`, review `status`, the exact job ID, unsettled counts, any abandoned pending rows and the
last scan. This bounded successor keeps the existing local-only CLI; it does not add an implicit dispatch approval
or a new confirmation bypass.

Privacy closeout **does not assert successful removal**. The receipt retains actual operation counts, abandoned
unprocessed counts and the last verification's residual assignments and preservation/uncertainty flags. A scan is
current **relative to this job's operation journal**, not a guarantee of Discord's later state. Every later operation
transition marks that scan noncurrent even within the same second; the original proof stays in `last_verification`.
`status.verification_current` and receipt `last_verification_is_current` disclose this boundary. A legacy proof without
the freshness marker is retained as history, with no current-proof claim. For a stale/unproven or missing scan,
top-level scan fields (`role_counts`, `verified_at`, preservation fields) are `null` and `verification_succeeded` is
false. A new successful scan after operation changes restores a current proof; a terminal success cannot be replaced.
Failed current checks remain false. New
assignments seen by a failed scan remain reported rather than replaced with zero. This allows settled member IDs
to be erased independently of an unrelated role rename, reordering or protected-membership churn.
The command removes raw account IDs from the job and retains this truthful aggregate receipt.
It also removes membership digests and compacts the local database so deleted values are not left in its free pages.
It is not a way to abandon uncertain custody or manufacture a successful closeout. Copies, terminal transcripts
and external backups are separate artifacts; redacting this job does not erase them or alter Discord audit logs.

Keep these limits explicit: Discord's member paging contract is the inventory authority; a short successful page
cannot independently prove server-side completeness. Approximate guild counts are not substituted for an exact
scan. Windows creation uses absolute System32 identity/ACL tools, strips the bot-token environment variable from
those children and accepts only the currently supported `S-1-5-21-…` account-SID form. Microsoft Entra/cloud-account
`S-1-12-1-…` identities are not supported and fail closed; this successor does not broaden identity or ACL authority.
Reopening takes the OS lock but does not independently audit a changed
Windows DACL: keep the directory private and review its ACL if another operator or administrator touched it.
The Windows path is covered by local Windows tests; the existing hosted job runs on Linux. These facts are not
live bot qualification or a new Windows CI matrix claim.

## Local test and CI integration

```text
python tools/tests/test_stockades_role_reset.py
```

The standard-library tests use a fake Discord service; no live bot token or network permission changes belong in
the tests. CI runs them as a separate step in the existing `watcher` job. The existing Worker shards, addon job
and required collectors remain in place. This operator feature does not change Worker BUILD or projection pins,
register commands, run a cron callback, add a D1 table or enable any production role-dispatch gate.
