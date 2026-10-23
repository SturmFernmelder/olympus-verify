# Keeper watcher original custody

The original .196 custody slice changed `watcher/watcher.py`, added `watcher/tests/test_custody196.py`, and documented the local delivery contract. The reviewed successor also adds the attended local utility and tests described below. Both retain the keeper's existing HMAC/code formats, ingest paths, source timestamps and age limits, queue cap, three-attempt initial transport / one-attempt queued transport policy, auth/rate/redirect pauses and backend Native/Link guards. Preparing this source does not install or start a watcher, read user configuration/state, contact a provider or activate a v3 protocol.

## Ingest custody and backpressure

`post()` now returns `Delivery.DELIVERED`, `Delivery.HELD` (`durable-held`) or `Delivery.NO_CUSTODY`. Boolean compatibility is deliberate: only delivered is true. Callers must distinguish held custody from no custody instead of interpreting every false result as buffered.

Before HTTP, the original JSON body is cloned, its original local intake time is captured, and the record is saved using flush, file fsync and atomic replacement. A digest pins its path/body/time and a digest of the configured origin/officer/token context; the credential itself is not written into custody metadata. The digest detects accidental alteration and context changes; it is not a game-source attestation or a substitute for server admission. The transport receives a separate clone and cannot mutate the retained original. Retrying uses that exact original body and time, under the same bound context. New work never overtakes an older original.

At the existing queue cap, older records are never ejected and a new unowned body is not sent. A reservation write failure dispatches nothing and stops new custody in that process. Local atomic-replace uncertainty retains the in-memory original and leaves the source unconsumed; restart sees either the prior state/source cursor or the committed original and its claim. Existing unreadable state now fails closed with the original file untouched instead of starting empty.

Source dedupe claims are committed in the same save as their body. A no-custody result restores the exact prior seen list and raises `NoCustody` to stop source consumption. Chat chunk cursors and SavedVariables mtimes therefore cannot skip unowned work. Previously completed siblings remain deduped when a partial chunk/file is reread. Combined event bodies commit their keys together and suppress duplicate siblings within that body. The roster watermark is likewise saved atomically with its original, then rolled back in memory if custody could not be established.

The existing transport's JSON-object acknowledgment convention remains. An empty/unreadable 2xx or an untyped `(True, None)` is held, not delivery. The original non-auth/rate 4xx transport result remains `(True, None)` for compatibility, with a separate internal numeric refusal marker. Such an explicitly refused original is durably retained for attended review and is not automatically retried or called applied. A known receipt that could not be durably settled also stays retained and stops dispatch. A persisted acknowledgment can be settled without another HTTP request.

## Queue-file acknowledgment

The queue-file hash, pending IDs and actual newly captured `/queue/written` officer/body now share one save before its one-attempt HTTP dispatch. While that original is unknown, later queue polls only retry the bound original; they do not merge newer IDs, rewrite its officer or create another queue-file acknowledgment. Restart resends the exact captured body only under the same bound context. Settlement clears the original and pending IDs together; a settlement failure restores both and stops dispatch.

Old bare `queue_written_pending` IDs have no captured original officer/body. They remain held without a guessed owner or synthesized original. Old outbox entries without captured custody, changed original bytes and context changes also remain held. There is no automatic migration, reset, pruning, TTL takeover or token/origin rebinding. Attended recovery needs genuine evidence of the original operation and its current outcome; this slice does not invent it.

## Qualification and remaining limits

The first new isolated leaf passed 24 tests. A subsequent source review closed the roster watermark/custody crash window and added that regression plus queue-ack settlement coverage; the resulting 26 tests passed in 1.668 seconds. The affected original `test_watcher.py` then passed 61 tests in 16.339 seconds with its original two skips. Existing test files, assertions and deadlines were unchanged. Each process had a 120,000 ms outer bound and used temporary synthetic files and stubbed transport only. The standalone Discord-relay test reads unchanged parser regexes and does not exercise the changed delivery/state path; it was not unnecessarily rerun for this slice.

First-run receipts and complete retained outputs are in the separate A196 audit folder. The original 61-test stdout wrapper decoded Windows output as UTF-8 and replaced some typographic log punctuation; its retained text hash is not a raw-byte stdout claim. The ASCII unittest stderr retains the complete pass/skip result. No production counter, installed client or real clipboard/provider action was observed here.

This is local process/file durability, not a physical all-copy or power-loss guarantee. A server acknowledgment lost before local settlement still has the existing distributed uncertainty: the same original may be retried under the existing policy, without a new timestamp or owner. There is no new server outcome query, external exactly-once guarantee or protection against a person deliberately rewriting the private state file and recomputing local metadata. State remains a single-writer file; no multiprocess writer support is added.

Further donor recoveries remain explicit: v3 attestation and source-proof dependencies, selective timestamp retirement, isolated poison-body scheduling, original-owner legacy recovery, addon getter/roster feedback and independent withheld mailbox/whisper obligations. They are not claimed as implemented by this queue-custody slice. Existing .194/.195 Native E2, 443-object schema, privacy generations, source-clock rules and Link-OFF constraints remain; a queued client original cannot authorize an operation that the current server refuses.


## Attended known-outcome recovery and same-process persistence

The normal watcher entry point and the offline recovery tool acquire the same exclusive state lease before writing. State and every parent must be ordinary paths: symbolic links, Windows reparse/junction paths and multi-link state files are refused. A crashed process can leave a lock; neither age nor PID reuse automatically reclaims it. After independently stopping every writer, an operator must inspect a stale lock before removing that lock alone. Direct imports/older watcher processes or deliberate private-file edits are outside this cooperating-writer exclusion.

While the current process retains an actual acknowledgment, its loop can retry that acknowledgment's local settlement save. It verifies the same retained original and queue ownership, sends no HTTP, and only resumes dispatch after local persistence succeeds. Reservation failures and unknown provider outcomes cannot take that path. Process death before an acknowledgment is persisted still loses that receipt and remains unknown; a restart cannot invent it.

Stop the watcher before attended recovery. Use the exact private state path, without loading its credential configuration:

```text
python custody_recovery.py --state <private-state-path> inspect
python custody_recovery.py --state <private-state-path> retire-refused --lane outbox --state-sha256 <inspection-state-sha> --item-sha256 <inspection-item-sha> --reason "Reviewed the recorded explicit nonapplication"
python custody_recovery.py --state <private-state-path> settle-acknowledged --lane queue-written --state-sha256 <inspection-state-sha> --item-sha256 <inspection-item-sha> --reason "Reviewed the recorded original acknowledgment"
```

Inspection prints only hashes, counts and classifications. Mutation accepts only the first outbox original or the exact captured queue acknowledgment. It requires both exact state and complete-item hashes, a retained original digest, and the recorded outcome matching the chosen action. Only recorded HTTP400/401/403/404/405/429 nonapplication may be retired, with `deliveryAcknowledged=false`; this is an explicit operator decision to stop delivery of a rejected body, never a successful ingest or a resend. A recorded acknowledgment may be locally settled with `deliveryAcknowledged=true`. Bare legacy IDs, altered originals, untrusted status codes and unknown outcomes remain held. The tool makes no provider request and does not rewrite clocks, source cursors, dedupe keys, queue capacity, credentials or bindings.

Before state replacement, it exclusively writes the complete original and attended reason to a same-parent `<state>.custody-archive-<state-sha>-<item-sha>.json` receipt. These are private files containing original personal/proof data: do not upload or commit them. New receipt/temp files use owner-only POSIX permissions or a protected Windows owner/SYSTEM DACL. There is no archive-directory redirect. A pre-existing receipt/temp, changed state bytes/file identity, occupied lease or uncertain replacement stops the operation and requires inspection; never repeat a mutation blindly. Archives are continuing local custody, not automatic disposal or a physical all-copy erasure guarantee. Apply the same attended privacy/retention review as the private source state; no automatic archive deletion is introduced.

This does not solve genuinely unknown legacy delivery or a provider acknowledgment lost at process death. Genuine original-owner/current-outcome evidence is still required before any further retirement or migration. Restoring an old owner context does not itself prove delivery. Unknown originals are not quarantined to permit newer work to overtake them. No live watcher, real state file or protected action is exercised by adding these controls.
