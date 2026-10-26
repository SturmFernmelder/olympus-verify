# Keeper watcher original custody

The original .196 custody slice changed `watcher/watcher.py`, added `watcher/tests/test_custody196.py`, and documented the local delivery contract. The reviewed successor also adds the attended local utility and tests described below. Both retain the keeper's existing HMAC/code formats, ingest paths, source timestamps and age limits, queue cap, three-attempt initial transport / one-attempt queued transport policy, auth/rate/redirect pauses and backend Native/Link guards. Preparing this source does not install or start a watcher, read user configuration/state, contact a provider or activate a v3 protocol.

The .196/.197 results below retain their original source-qualification scope. The later
[25 October one-host acceptance](#later-bounded-host-acceptance-25-october-2026) is separate:
it supersedes a blanket pending-installation status for that host, not the original
qualification history or the limits on normal ingestion and unknown provider outcomes.

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

The normal watcher entry point and the offline recovery tool acquire the same exclusive state lease before writing. State and every parent must be ordinary paths: symbolic links, Windows reparse/junction paths and multi-link state files are refused. The .197 successor (watcher 0.6.8, owner-authorized 24 October 2026) holds an OS-owned advisory lock: a nonblocking byte lock on Windows and `flock` on Linux/POSIX. The kernel releases it on normal exit, forced termination, logoff or reboot. Its ordinary marker file deliberately remains on disk and is reused without deletion; deleting a live lock could split ownership across different files. No PID, timestamp or timeout proves ownership ended.

The old .196 PID/token lock format is never adopted, even if its PID looks absent or its timestamp is old: an older writer does not participate in OS locking. Stop every old writer and inspect that legacy lock before an attended, one-time removal of that lock alone. Unknown, malformed or partially initialized marker files also require inspection. State and custody archives must not be deleted to bypass a hold. Direct imports/older processes that bypass the entry-point lease, deliberate private-file changes and nonlocal filesystem lock semantics remain outside the cooperating-writer exclusion.

While the current process retains an actual acknowledgment, its loop can retry that acknowledgment's local settlement save. It verifies the same retained original and queue ownership, sends no HTTP, and only resumes dispatch after local persistence succeeds. Reservation failures and unknown provider outcomes cannot take that path. Process death before an acknowledgment is persisted still loses that receipt and remains unknown; a restart cannot invent it.

A reservation or other unacknowledged local persistence failure now stops the normal watcher process with exit code 2, before it consumes another lane. It logs only the phase, exception class and numeric errno/winerror. It does not sit in a permanently halted polling loop. A replace can commit and then report failure; therefore the original is not discarded and no same-process resend is guessed. After inspecting/fixing storage, restart with the same state and configuration: a fresh load sees either the prior unconsumed source or its committed original and dedupe claim. Keep private state outside OneDrive or another syncing folder. This is safe fail-stop/reload behavior, not automatic in-process reservation recovery; no cause is inferred for the historical intermittent host failure.

Stop the watcher before attended recovery. Use the exact private state path, without loading its credential configuration:

```text
python custody_recovery.py --state <private-state-path> inspect
python custody_recovery.py --state <private-state-path> retire-refused --lane outbox --state-sha256 <inspection-state-sha> --item-sha256 <inspection-item-sha> --reason "Reviewed the recorded explicit nonapplication"
python custody_recovery.py --state <private-state-path> settle-acknowledged --lane queue-written --state-sha256 <inspection-state-sha> --item-sha256 <inspection-item-sha> --reason "Reviewed the recorded original acknowledgment"
```

Inspection prints only hashes, counts and classifications. Mutation accepts only the first outbox original or the exact captured queue acknowledgment. It requires both exact state and complete-item hashes, a retained original digest, and the recorded outcome matching the chosen action. Recorded HTTP400/401/403/404/405/429 nonapplication and the source-owned `/ingest/roster` HTTP422 refusal may be retired, with `deliveryAcknowledged=false`; this is an explicit operator decision to stop delivery of a rejected body, never a successful ingest or a resend. The current transport pauses on 401/403/429 rather than recording them as final refusals; those historical allowlist entries do not claim a newly produced receipt. A recorded acknowledgment may be locally settled with `deliveryAcknowledged=true`. Bare legacy IDs, altered originals, untrusted status codes and unknown outcomes remain held. The tool makes no provider request and does not rewrite clocks, source cursors, dedupe keys, queue capacity, credentials or bindings.

Before state replacement, it exclusively writes the complete original and attended reason to a same-parent `<state>.custody-archive-<state-sha>-<item-sha>.json` receipt. These are private files containing original personal/proof data: do not upload or commit them. New receipt/temp files use owner-only POSIX permissions or a protected Windows owner/SYSTEM DACL. There is no archive-directory redirect. A pre-existing receipt/temp, changed state bytes/file identity, occupied lease or uncertain replacement stops the operation and requires inspection; never repeat a mutation blindly. Archives are continuing local custody, not automatic disposal or a physical all-copy erasure guarantee. Apply the same attended privacy/retention review as the private source state; no automatic archive deletion is introduced.

This does not solve genuinely unknown legacy delivery or a provider acknowledgment lost at process death. Genuine original-owner/current-outcome evidence is still required before any further retirement or migration. Restoring an old owner context does not itself prove delivery. Unknown originals are not quarantined to permit newer work to overtake them. No live watcher, real state file or protected action is exercised by adding these controls.

HTTP409 remains held: the Worker can return a privacy hold after an inner write already applied, so it is not evidence of definite nonapplication. A policy for attended retirement of possibly applied work is a separate owner decision. Token/origin/officer rotation still changes the custody binding; queued originals are not rebound, replayed under new authority or silently discarded. Drain and inspect known custody before planned rotation when possible; unresolved or legacy records need genuine outcome/owner evidence and a separately reviewed recovery procedure. Installing 0.6.8 on officer machines, changing scheduled tasks and migrating any existing private state/legacy lock are attended operator steps, not effects of a Worker deployment. Copy the complete watcher source package, including `custody_recovery.py`; copying only `watcher.py` is insufficient.

The .197 focused tests use temporary synthetic files and stubbed transport. They exercise actual child-process termination/restart and live-writer exclusion, precommit and commit-then-error reservation reloads, and archive-first retirement of a recorded roster422 followed by later verification delivery. Windows results are recorded separately from the Linux/POSIX implementation; local Windows tests do not claim Linux execution or live installation.

## Later bounded host acceptance (25 October 2026)

The owner-authorized post-.198 host operation accepted **Watcher 0.6.8** on one Windows
host. The retained `root-watcher-host-acceptance-final.json` records exact merged source
binding for `watcher.py`, `custody_recovery.py` and `run-watcher.cmd`, a byte-exact copy of
the existing state to a protected ordinary private path, and only the configured
`state_file` location change. The original state and original failed attempts remain
retained. Historical release text saying .198 itself did not install the watcher remains
true; this was a later, separately authorized host operation.

Its actual controlled proof covers cooperating-writer exclusion while the lease owner is
alive, owned forced termination, reacquisition afterward with the same retained lock
marker, and unchanged state bytes. The record also attributes **52 focused synthetic
custody/restart tests** and **one authenticated health GET**. The independent
`review-host-actual-v1.json` accepted that bounded host scope. Both receipts are retained
outside the published source under the owner workspace's
`post198-host-closeout-2026-10-25/evidence/`; no credential configuration or state payload
is reproduced here. The three source hashes still matched that receipt during the
26 October source fact-check; no restart or health request was repeated by that review.

The acceptance explicitly records **`normalIngestStarted: false`**. It does not qualify
normal watcher polling, queue claims or acknowledgments, game-client reload, current
AddOn integration, role/verification actions, unattended operation, every officer PC or
Linux runtime behavior. Installed source and an accepted restart check are not evidence
that normal ingestion is currently running. A successful health response also does not
prove that its backend performed no existing health/schema/Native work.

The original **AA-W61 storage-fault cause remains unknown**. A working lease, current
empty custody counters or later successful checks do not settle historical ambiguous
provider originals, establish their nonapplication, or authorize a replay. HTTP409 and
unknown/legacy delivery retain the holds and original-owner/current-outcome requirements
above. The host acceptance does not activate Olympus Link, an Army exporter, a protocol
migration or any other release gate. This documentation update performs no installation,
state/configuration change, custody recovery, test, provider call or watcher start.
