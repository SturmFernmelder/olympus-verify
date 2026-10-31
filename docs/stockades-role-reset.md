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
expired plan is held. Reconcile its unresolved intents before considering a new preview; do not overwrite, discard
or replace an uncertain job just to obtain a fresh expiry. A new preview is a new inventory and needs its own
review and digest confirmation. The tool does not silently renew approval or operate unattended.

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

## Verify against Discord

```text
python tools/stockades-role-reset.py verify --job tools/out/stockades-role-reset/job1 --prompt-token
```

Verification performs a fresh whole-server member scan, checks selected assignments, compares the exact role
definitions and checks protected roles. A completed removal slice is not final verification. Only a complete,
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
member list. Protected membership is compared using aggregate counts and one canonical digest of protected
account/role pairs. That digest is still private operational evidence, not an anonymity guarantee.
Keep it private, outside publication artifacts and Git. `tools/out/` is already ignored; that is not encryption or
an access-control guarantee. Avoid unprotected backups, cloud shares and pasting raw job contents into tickets.

After terminal success and a successful final verification, reduce the retained job to its counts-only receipt:

```text
python tools/stockades-role-reset.py redact --job tools/out/stockades-role-reset/job1
```

`redact` is local-only and needs no token. It is available only for terminal success; it must refuse while any
dispatch or verification is unresolved. It removes raw account IDs from the job and retains a counts receipt.
It also removes membership digests and compacts the local database so deleted values are not left in its free pages.
It is not a way to abandon uncertain custody or manufacture a successful closeout. Copies, terminal transcripts
and external backups are separate artifacts; redacting this job does not erase them or alter Discord audit logs.

## Local test and CI integration

```text
python tools/tests/test_stockades_role_reset.py
```

The standard-library tests use a fake Discord service; no live bot token or network permission changes belong in
the tests. CI runs them as a separate step in the existing `watcher` job. The existing Worker shards, addon job
and required collectors remain in place. This operator feature does not change Worker BUILD or projection pins,
register commands, run a cron callback, add a D1 table or enable any production role-dispatch gate.
