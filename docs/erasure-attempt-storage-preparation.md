# Erasure attempt storage preparation — 16 October 2026

This is an unpublished storage preparation component. It installs no fence/retry sender,
receipt issuer, terminal writer, new status reader or versioned copy/replay format. No
application recovery is activated by installation. Original unknown root/child tickets,
journals and provider outcomes remain unknown. The existing Worker flag remains OFF by
default, and this component changes no serving D1 statement, scheduled allowance or clock.

## Actual source cut

- `privacy-recovery-attempt-schema.ts`: four fixed new tables, exact main/temp schema
  recognition, immutable installation readback, refusal for unrepresented data, combined
  retention selection and next alarm deadline.
- `privacy-recovery-attempt-install.ts`: attended CLOSED installation and exact-request
  observation. It executes only after the existing suppression operator ingress accepts
  the original native Request/Headers, HMAC, distinct key roots and environment custody.
- `privacy-recovery-suppression.ts`: two fixed operator routes, existing copy/status/replay
  refusals and the installed-family branch of the existing expiry route.
- `privacy-recovery-erasure-companion.ts`: uses a shared retention page and combined
  earliest alarm when installed; preserves the original uninstalled mutation path.
- `privacy-serving-recovery-gate.ts`: old cut observation refuses an unrepresented family.
  Attended close still records its original cut and returns `drainQualified:false`.

The original Floor constructor and its `/v1/suppression/` routing already suffice; they are
unchanged. Original journal16, companion11 and copy17 tuple formats and all their CREATE
declarations are unchanged. No index or trigger is added to an original table. No fifth
copy table is created ahead of an implemented versioned reader.

## Attended installation and lost replies

`POST /v1/suppression/install-attempt-storage` accepts the closed fields `operationId`,
`nonce`, `requestDigest`, `createdAt`, `expiresAt`, `originalFloor`, `originalGate`,
`expectedActionSequence`. It uses the existing operator MAC domain/header. A serving key
does not authorize it. Its own fixed300-second interval must be current on the actual
SQLite clock; a caller boolean cannot establish CLOSED or freshness.

The native transaction checks the exact original base schema, actual current Floor and
epoch claims, exact `closing_held` gate and control, expected action sequence, and absence
of all running/unknown tickets (including provider descendants), reserved/unknown recovery
journals/completion attempts and reserved/unknown/expired_unknown suppression journals.
A reserved original companion also holds installation. All new objects must be absent;
partial layouts, temporary shadows, aliases, changed DDL or added user indexes/triggers
refuse. It creates exactly four declarations, advances the existing action sequence once,
inserts the immutable installation record and reads back that exact record/schema inside
the same transaction. Failure or expiry rolls everything back. Reinstallation is refused.

`POST /v1/suppression/observe-attempt-installation` takes only `originalInstallRequest`,
the canonical JSON of that known original request. It compares every original field,
expected sequence plus one, and the fixed source schema digest to actual stored data.
The caller need not know the lost reply or Native `installed_at`. Observation does not
write, increment sequence, renew a deadline or issue authority. A late response is explicitly
historical storage preparation with readiness/retry/unknown-resolution flags false.

## New private storage

| Table | Permanent identity and acknowledged facts | Expiring facts |
| --- | --- | --- |
| `recovery_erasure_attempt_control` | Protocol, fixed four-table schema digest, install operation/nonce/request digest, original Floor/gate, original300-second request and Native installed time, installation sequence | None; this is a single installation record |
| `recovery_erasure_attempt_fence` | Unique original operation and fence ID, stable original-relation/ticket/job-read/terminal/status digests, actual fence-Native/child digests, original nonce/reserve sequence, from/to token, original window, receipt/action sequences and fixed retention deadline | Purpose-only subject/generation/birth facts become null/expired at the original expiry+366days |
| `recovery_erasure_attempt_retry` | Unique retry ID and unique operation/fence pair, consumed-fence digest, new claim token, own ticket/job-read/terminal/status digests, nonce/window/sequence, state and actual Native completion digest/time | Purpose-only subject/generation redacted at original reserve expiry+366days or actual committed erasure+366days |
| `recovery_erasure_attempt_companion` | Retry ID, stable original-relation digest, actual Native completion digest, action sequence and original replay deadline | Mutable source/birth and original rejection facts; marker facts retain the original rejection+365days, replay facts retain the original erasure/reserve deadline |

Stable relation digests must be constructed by a future source-owned acknowledged producer
from redaction-invariant facts; this component does not compute or issue them. Mutable
`source_digest`/birth/rejection fields are not treated as immutable cross-retention equality.
No raw Discord ID, raw account-birth nonce, credential or staff text is introduced. The
original rejection key is retained only by its companion's original active-marker rule.

Tokens use the same safe upper bound253402300798. A future F1 must refuse advancement
from that ceiling; it must not issue an unstorable `to_token` or widen the bound. A unique
fence/retry identity remains occupied after expiry. No DELETE or identity reuse exists.
Schema/FK/uniqueness constraints alone are not acknowledged dispatch authority: actual
receipt/reserve/commit producers and their consuming guards remain unimplemented.

## Retention and original readers

Installed mode selects one deterministic total100-row page, ordered by deadline/family/ID,
across original journal, original companion, fence, retry and retry companion. A row due
for both marker and replay expiry counts once. One shared `action_sequence` transition
covers the page. Actual returned IDs must match the selected identities; an update failure
or sequence overflow aborts the entire native transaction.

The original journal transition is unchanged: reserved/unknown become `expired_unknown`,
committed becomes `expired_committed`, and only the original identity fields are redacted.
Installed-mode alarms now also perform that original journal identity expiry; this is
explicitly additive behavior. New retry unknowns likewise remain permanent
`expired_unknown`. Neither expiry nor an alarm settles any root, child, provider or journal.

The existing explicit expiry route, in installed mode, uses the same one page and returns
`independent_erasure_attempt_storage_identity_expiry` with `redactedRecords`; it does not
run the old second100 journal page. Every existing companion armer selects the earliest
deadline across all five data families. Remaining overdue rows schedule the next original
alarm at `max(actual_host_now+1, earliest_original_deadline*1000)`. Deadlines are never renewed.

When the family is absent, original mutation SQL, table declarations and retention semantics
remain intact. This is **not** total DO query parity: entry into retention, alarm and the
affected original readers adds a bounded main/temp schema probe; after an actual alarm
write, layout continuity is rechecked. Installed mode performs additional fixed schema and
control reads plus at most five family updates for the shared100 selected rows. Serving OFF
D1 SQL and scheduled700 limits are unchanged, but this source-only component does not
establish any measured future196/700 recovery cost or site-tail liveness result.

Legacy cut observation, v1 capture/page/replay/open and relevant old recovery/status readers
refuse **any** new fence/retry/companion row, including expired consumption tombstones.
Installed-empty storage can still be observed and follows the original receipt formats.
No old v1 receipt silently represents new data. A future versioned copy/status path must
be implemented before useful new rows can coexist with managed recovery/reopen.

## Rollback and qualification

The existing Floor pins Worker source/version/epochs; it does not pin the independently
deployed DO code. New code can reject unsupported schema/data, but cannot force an older DO
deployment to execute these checks. Preventing DO rollback/PITR/reset while unresolved
recovery exists remains an explicit attended deployment condition. No external rollback
barrier, anti-restore theorem or production qualification is claimed by these tables.

The new `privacy_recovery_attempt_storage_test.cjs` is authored for the existing direct
Node/TypeScript/SQLite harness. It covers real authenticated installation, atomic failures,
post-COMMIT lost replies observed using the original request, custody/schema refusals,
shared100 retention, alarms, permanent unknown/consumption and legacy-reader refusals.
Seeded future-family rows test data constraints only; they are never used to mint serving
authority. Existing tests and package wiring are untouched as requested. **No test, parser,
typecheck, SQLite or Workerd execution has occurred for this component yet.** Runtime and
integration qualification remain assigned to Root after the current Claude runtime slot.
