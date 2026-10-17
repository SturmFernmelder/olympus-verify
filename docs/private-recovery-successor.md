# Private recovery successor (.162)

This is the attended return to configured serving after the .161 cutover incident. The original
install-and-reopen operation timed out in its tail, after the Native open. Native was then SERVING at the
original next write epoch (E1), while the Floor gate stayed `closing_held` for that operation forever.

Service was restored on 17 Oct 2026 in OFF mode: the five managed serving values were removed, admission
stayed enabled at E1, and the code stayed b04. This document is the reviewed path back to configured mode.
**Nothing here is authorized by itself.** Each step marked A1-A3 needs its own explicit owner approval.
Root executes every provider call; Claude does independent read-only readbacks.

## What it is

There are three pieces. Main's code stays b04 throughout.

1. **`olympus-privacy-successor`.** A new private worker
   (`worker/wrangler.privacy-successor.private.toml`, entry `src/privacy-private-successor-entry.ts`).
   - It is reached only through main's unchanged `/private-production-control/<cmd>` adapter, by re-pointing
     main's `PRIVACY_PRODUCTION_CONTROL` binding.
   - Command mapping: `status` → census, `reopen` → recover, `observe-cut` → observe.
   - It is default OFF. `PRIVACY_SUCCESSOR_CONTROL_ENABLED` gates census and observe;
     `PRIVACY_SUCCESSOR_RECOVER_ENABLED` additionally gates recover.
   - It refuses when any base operator, initializer, serving or original control root is bound.
2. **One additive dispatch line in `PrivacyRecoveryFloor.fetch`.** It routes `/v2/successor/*` to
   `src/privacy-successor-floor.ts`, which adds two new tables: `recovery_successor_attempt` and the
   lifetime epoch ledger `recovery_successor_epoch`. The class, the entry re-export, and every base route,
   predicate, 5-second bound and 300-second lifetime are unchanged.
3. **One owner-signed `recover` chain** (`src/privacy-successor-control.ts`, `src/privacy-successor-native.ts`):
   - **S0 — Native precheck.** Read-only, at the exact source epoch and mode, plus the audit-sequence
     watermark. A refusal has no effect.
   - **S1 — DO reserve.** One transaction, acknowledged **before any Native write**. It re-verifies the owner
     proof and records the fresh attempt id and nonce, the targets E2 and C2, the burned E1 and C1, the census
     (safety S, opaque preserved P, earlier-successor X) and the watermark. Burned or target epochs can never
     be future targets.
   - **S2 — Native fence.** One batch: the whole-profile proof at the source, the watermark, the epoch CAS
     `E1 serving → E2 closed` with RETURNING, and the final closed proof. The counters are carried; the CAS is
     the cut.
   - **S3 — DO fenced.** Stores the fence ACK and derives the open identity:
     `sha256(['olympus-private-successor-floor-open-v1', attemptId, requestDigest, sha256(fenceAck)])`. That
     value gives a 32-hex operationId, a 32-hex nonce, and the full 64-hex requestDigest (the `co:619-620` shape).
   - **S4 — Native open.** One batch: `E2 closed → serving`, bound to the exact closed tuple.
   - **S5 — DO open.** One transaction, only over the acknowledged Native SERVING. It runs the unchanged
     `reopenServingFloor` (complete base `advance` journal row, Floor sequence +1, C2/E2 claims), then sets the
     gate to `managed_open` and moves the suppression control Floor pointer.

## What it never does

- It never retries, resumes, completes, refuses, relabels or deletes any predecessor journal, attempt, cut or
  lifecycle row, and never renews the predecessor's 02:25:06-02:30:06 clock.
- It never derives or labels a predecessor child identity. Unresolved rows stay an opaque set.
- It never uses Native SERVING, a later read or old JSON as an acknowledgement.
- It creates no new Floor and rotates no base root. It uses no Source8, release evidence or emergency tool.
- It is not a general reopen route. It refuses unless the gate is the exact expired predecessor tuple, the
  suppression journal and companions are empty, every copy has expired, and no ticket exists.
- It does not enable erasure, intake, QR, reset or item 15.

## Preserved rows between reads

Between S1 and S3/S5, the preserved set P may change only along the non-authority transitions that the base
routes can still make on expired rows (`/v1/completion-reserve` and `/v1/complete`):

- a phase-0 attempt `reserved → refused` (when complete was requested) or `reserved → unknown` (when unknown
  was requested);
- a new phase-0 attempt on a journal that was reserved and had no attempt;
- a new phase-1 attempt, requesting unknown, after a refused phase 0;
- a journal `reserved → unknown`, only together with its unknown attempt.

Several such steps may occur between reads. Anything else fails closed: a new base journal, any `complete`, a
relabel, a clock or Floor change, or any change to S or X.

## Lost replies

Every lost reply is that attempt's own unknown. There is no retry and no clock renewal, and re-sending the
same command is refused. After `expiresAt`, a **new owner-approved attempt** needs a fresh id and fresh target
epochs. It may fence again from whatever Native state is observed (E1 serving, E2 closed or E2 serving), but
only when every earlier attempt has expired un-opened.

| Lost at | Native | DO | Exit (each needs separate owner approval) |
|---|---|---|---|
| S1 | E1 serving | attempt reserved | new attempt from E1 serving; or stay OFF at E1 |
| S2 | E2 closed (if it committed) | reserved | new attempt from E2 closed (OFF is impossible) |
| S3 | E2 closed | fenced | new attempt from E2 closed |
| S4 | E2 serving | fenced, gate `closing_held` | new attempt from E2 serving; or OFF at E2 |
| S5 | E2 serving | maybe opened | signed `observe` of the exact attemptId and requestDigest; if opened, success |

## Attended runbook

1. **Step 0 — qualify.** CI must pass on the exact head. Root cross-reviews and runs the focused suites
   (`npm run test:successor`, the unchanged suites and `npm run test:all`), and both agents sign the exact
   commit and tree.
2. **A1 — deploy private code.**
   - Generate two fresh distinct roots: `PRIVACY_RECOVERY_SUCCESSOR_SECRET` (given to the Floor and the
     successor) and `PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET` (the owner command root, given to the Floor and the
     successor).
   - Deploy `--target privacy-floor`.
   - Deploy `--target privacy-successor --bind-source-tree` with both flags `false`.
   - Read both versions back.
   - Preconditions: Root holds the exact serving-gate root removed from main at 02:42, and the C1 value.
     Public service is unaffected, because main in OFF mode never calls the Floor.
3. **A2 — rehearsal while main is OFF.**
   - Main PATCH-1 (binding-only): re-point `PRIVACY_PRODUCTION_CONTROL` to `olympus-privacy-successor`, keeping
     every other current binding (including `COMMUNITY_FEATURES` with `census`).
   - Set `PRIVACY_SUCCESSOR_CONTROL_ENABLED='true'`.
   - Run `census` three times and record the census, the digest, the Native observation and the step timings.
     Expect: gate `closing_held` with the predecessor tuple, opaque unresolved rows all on the predecessor clock,
     Native E1 serving, and no successor rows.
4. **A3 — recover.**
   - Attest the exact main deployment and the exact Workers bound to D1 `7e2cf8fd`, and that no Time Travel or
     import is running.
   - Run `--prepare` to generate the fresh ids and epochs.
   - Main PATCH-2: configured HELD at C2/E2. Add the five managed values with
     `PRIVACY_SERVING_SOURCE_TREE=5b244885…` and set `PRIVACY_WRITE_ADMISSION_EPOCH=E2`. Carry every other current
     binding exactly. Read back V_main2.
   - Set `PRIVACY_SUCCESSOR_RECOVER_ENABLED='true'` and read back the successor version.
   - Pass a latency gate under configured HELD, then wait out the owner-chosen quiet period.
   - Take a fresh census, then run one `--execute-once recover` with `servingVersion=V_main2`.
5. **After a 200.**
   - Read back the census: Floor sequence 2 at C2/E2/tree/V_main2, gate `managed_open`, attempt `opened`.
   - Read back Native: E2 serving.
   - Read back public: the site returns 200 and `GET /health` returns HTTP 200 with `d1:"not_checked"` in
     configured full privacy mode (`worker/src/index.ts:177`). That health response is deliberately returned
     before Floor/D1 admission and also exists while the gate is HELD; it is not serving proof on its own.
     Check the admitted site and API behavior as well: a signed-out `/api/me` returns 401 `signed_out`, not
     `original_serving_held`.
   - Check the next two `*/15` ticks.
   - Then turn both successor flags off.
   - Keep main pinned to the exact accepted `V_main2`. The opened Floor tuple includes main's deployment
     version; a new main version from a deployment, binding change or secret change will hold serving.
6. **After anything else.** Do not retry. Wait past `expiresAt + 60 s`, run census and observe, and follow the
   lost-reply table.

### Pinned main after recovery

The 17 October 2026 recovery accepted main version `9dbdfc1a-330b-4c65-9681-7d3f5316c7a6`, serving the existing
`.161` application through the open Epoch 2 privacy gate. Leave that live main version, its bindings and secrets
untouched. A source merge or documentation update does not require a Worker deployment.

Do not redeploy main directly from the repository's `worker/wrangler.toml`: it is not a snapshot of the accepted
live configuration, and its `PRIVACY_PRODUCTION_CONTROL` still names the old operator rather than the live
successor. Plan and authorize an OFF-mode transition before a future direct main deployment. Any subsequent
return to configured serving needs its reviewed lifecycle procedure; editing repository configuration alone
does not update the Floor's accepted version. This documentation correction authorizes no deployment or live
configuration change.

### Rollback matrix

| Phase | Safe exit | Never |
|---|---|---|
| before PATCH-2 | stay or return to OFF at E1 | — |
| after PATCH-2, fence not committed | binding PATCH back to OFF at E1 (the attempt dies at expiry) | — |
| fence committed (E2 closed) | a new attempt only | any Cloudflare rollback of main or the Floor |
| Native E2 serving, DO not opened | new attempt, or a forward binding PATCH to OFF at E2 | any rollback |
| opened | stay; emergency exit is a forward PATCH to OFF at E2 | rolling back the Floor worker while an attempt is unexpired |

## Residuals (all flags stay false)

- **`providerDrainQualified`.** The fence serializes D1 admission only. Provider calls already in flight from
  OFF main (for example Discord) are not covered.
- **Raw-DB writers.** Any deploy with `PRIVACY_WRITE_ADMISSION_ENABLED != 'true'` gets the raw DB
  (`index.ts:77-80`). These are excluded by attestation only.
- **`restoreBarrierQualified`.** The audit-sequence watermark only detects a restore to a **lower** audit
  sequence. An earlier snapshot with the same sequence (for example, business changes without an audit append)
  is not detected; the test suite shows this explicitly. A restore after the census capture, and DO PITR, are
  procedural.
- **Frozen main version.** After success the Floor binds V_main2 (`client:59`). Any later main version or
  setting change holds the site unless it goes through OFF mode or a further reviewed DO release. Item 15 and
  the fresh-roles work therefore move to a later release.
- **Successor custody.** A holder of `PRIVACY_RECOVERY_SUCCESSOR_SECRET` could post fabricated fence or open
  ACKs to the DO within an attempt window. The DO cannot see Native; no-reconstruction is enforced in source
  (in-isolate brands, single use, in-order transitions bound to the owner-verified request digest).
- **Repository drift.** Main's repository `wrangler.toml` still names `olympus-privacy-operator`, while live
  points at the successor after PATCH-1. This must be reconciled in a later release.
- **Bundle bytes.** The successor bundle includes the inert predecessor operator module through the migration
  module's imports; it is never mounted. The migration module's additive export (`SUCCESSOR_NATIVE_SEAMS`,
  `successorCurrentProfileProof`) reuses the existing transport, prepare, row, graph and digest seams and
  changes main's bundle bytes for any future build from this tree.
