# Erasure attempt identity preparation

Unpublished Phase 2 checkpoint based on `5bea76e7`. This code prepares acknowledged claim identity and the existing consuming terminal guard. It does not implement a fence, retry, new suppression reservation, historical outcome resolution, or restore/reopen permission.

`PRIVACY_ERASURE_ATTEMPT_FENCE` remains absent in configuration. Absent or `false` preserves the previous SQL and request sequence. The exact `true` preparation path requires erasure, attempt discipline, write admission and an original configured serving context. It uses an acknowledged increasing integer claim token, the exact original proof/incarnation, the same environment and original source lineage. The original job read and atomic companion guard consume that token and `attempt_unresolved`. No query or scheduled allowance is added.

A lost claim response issues no attempt capability. Changing the token or marker makes the original terminal transaction abort. Original unknown children, roots, journal reservations, companions and provider custody remain untouched. A token is unique only within the enabled writer's admitted database history; an older writer, flag rollback or restore is not a drain.

Codex Privacy ran the new application regression: 46/46, exit 0. It exercises actual admitted SQLite batches, original Floor/serving contexts and the existing synthetic provider. The first run failed 41/42 because a bound JavaScript number was represented as REAL; the corrected SQL checks the stored integer column while retaining the exact previous-token comparison. Failed evidence is preserved separately. The unchanged discipline regression passed 96/96, exit 0; final TypeScript checking exited 0. Root reviewed the source and verified that every existing test file and the entire original test:all command prefix remain unchanged. The new test is appended and has a dedicated script.

These are focused local results. No complete final-candidate CI, Workerd qualification, independent Claude acceptance, deployment or activation is claimed. BUILD remains .160 for this private preparation checkpoint.

The next Phase 2 cut requires an immediate source-owned site fence, a single append-only successor with exact positive commit/status receipts, and actual alarm retention. Preserve the full original unknown attempt and its independent recovery barrier even if a later attempt confirms local serving erasure. Historical unknowns without the prospective fence remain held. The 700 scheduled target and every original application assertion remain.

## Agreed continuation boundary

Genuine Claude's 16 October 12:55 UTC scope review accepts that append-only direction with the following concrete requirements. This documents the next cut; it does not claim those parts are implemented here.

| Fence flag | Discipline flag | New-claim behavior |
|---|---|---|
| Absent or `false` | Absent or `false` | Original .160 legacy SQL and calls |
| Absent or `false` | `true` | Original .160 Phase 1 SQL and calls |
| `true` | `true` | New increasing-token preparation, requiring original configured serving context, erasure and admission exactly `true` |
| Invalid fence or dependency | Any | Hold new claims; preserve independent debt reconciliation |

The original claim uses `MAX(DB_NOW, COALESCE(last_attempt_at,0)+1)`. The first NULL token is therefore valid, and a same-second successor must still increase it. The token-aware predicate in the original atomic companion guard, rather than the separate 60-second role-receipt age check, supplies the intended fence serialization point.

Only rejection of the actual first-original-reservation Native dispatch inside its still-running callback may start a fence. A valid later POST after a known preterminal hold can create that first genuine reservation; it is not excluded merely because the HTTP response says replay. Capture the actual original-reserve dispatch identity and current POST source, and require a unique fence per operation. Existing unknown reservations, successor attempts, terminal restore-replay rows and completed jobs cannot qualify. No caller boolean, old unknown frame check, context revival or elapsed-time observation can create authority. The original child, root, journal and companion remain unknown after a successful fence. Later local retry success must have its own real committed acknowledgement and exact-operation status receipt.

The separate Durable Object family needs an authenticated attended CLOSED installer, fixed new tables, the existing shared action sequence, bounded real alarm expiry, and readers that either represent the new family exactly or refuse it. Preserve the original journal/companion schemas. Raw source facts retain original deadlines; immutable purpose-bound relation digests survive redaction to prevent reuse and are not a claim of anonymity. The separately deployed DO script is not Floor-pinned. Prohibiting an old DO rollback while new sensitive or unresolved rows exist is a deployment condition, not a source-enforced provider guarantee.

The serving Floor pins the configured source version. Every shipment, flag change and rollback needs an attended CLOSED reopen, which refuses unresolved original custody. Fence-mode activation must begin with zero unresolved custody. Preserving an original unknown intentionally freezes that configured version; an attended close remains possible, but installing a fresh epoch cannot bypass the debt or protect the earlier restored-open interval.

The proposed F1/F2 group adds two logical D1 statements plus four admission controls on the site path. No cron fence or extra cron D1 query is proposed. The 196 erasure and 700 whole-schedule figures remain invariants to measure on the final source. While `EPOCH2_SCHEDULE_QUALIFIED=false`, configured cron erasure is not reachable, so a prospective successor would be reached through a later site replay. The fence dispatcher also needs a bounded Native call, both actual five-second child claim/settle RPCs, a bounded receipt RPC and sufficient original `created+300` time for the entire remaining parent/root and final-write tail. D1 statement arithmetic alone establishes no such timing result.

The source trace identifies eight remaining RPCs from the eligible rejection: fence child claim/settle, positive fence receipt, original-terminal unknown settlement, final job-write child claim/settle, deferred-parent settlement and root settlement. Their existing five-second limits total 40 seconds, before separately bounded fence Native execution, final-write Native execution and local processing. Existing Native calls have no independent five-second limit. Additional receipt/observation calls must increase the tail. The late unknown-settlement cleanup allowance cannot be used to start new fence work after the original window.
