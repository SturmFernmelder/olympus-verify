# Build .164 — Native serving erasure

The owner authorized a Native-only account-erasure release under the single-agent waiver. This release keeps ordinary website, bot and scheduled traffic on the installed D1 admission epoch. A private Floor service or an incomplete private serving identity must not become a prerequisite for ordinary traffic in this release. The original D1 write-admission and current-epoch SQL guards remain required.

## Configuration scope

The paired main and cutover profiles enable `PRIVACY_ERASURE_ENABLED`, `PRIVACY_NATIVE_ERASURE_ENABLED` and `PRIVACY_ERASURE_ATTEMPT_DISCIPLINE`. The separate attempt-fence flag remains absent. Guild Census, fresh-role and staff configuration, their launch clocks, QR settings, beta-reset removal and every other feature setting retain their existing values. The applied marker records the exact paired source profile; it is not a provider deployment or activation receipt.

## User-facing scope

An authenticated account owner can submit one erasure request and read its bounded status using the issued private status credentials. Scheduled work processes the queue in bounded batches. Request acceptance is not instant completion, an external role effect or proof that every copy has been deleted. A lost response does not prove rollback. The status distinguishes completed live D1 cleanup from an external cleanup hold or unresolved original operation.

An acknowledged guild-role removal ends that bounded slice. A later automatic continuation checks current absence again before the atomic account cleanup; no further user click is required. This keeps the measured maximum at 164 attempted statements within the existing installed 196-statement erasure envelope. The original 700-statement whole-schedule target remains unchanged. An unremovable managed/above-bot role or provider outage can leave that account pending without holding unrelated website or scheduled work.

Native erasure and the fresh-role grant configuration can coexist. The captured exact Native switch removes the old global erasure-on grant prohibition; every existing per-account retiring/generation guard and the November 4 23:00 UTC launch clock remain in force. Legacy erasure without Native mode retains its original grant restriction.

The Native status requirement is `local_only`. Its fixed scoped authentication code binds the original operation, digest, generation and expiry; the user-facing receipt contains no account ID. `servingAccountErased` requires the actual atomic Native terminal result and replay guard. `allCopiesErased` remains false independently. Necessary raw-ID generation barriers and unresolved external/provider custody stay internal and purpose limited: deleting them merely to make the receipt appear anonymous would permit stale-writer or recovery-copy rebirth.

Keyed safety and replay receipts retain only their stated purpose and original expiry. They remain pseudonymous personal data when they can be related to an account; they are not described as universally non-identifying. Active bans, separately justified safety cases, Discord/platform records, existing recovery copies and information held on another person's device have their own limits and obligations. Live D1 erasure does not rewrite a provider recovery history, delete a downloaded file or certify every physical copy.

## Qualification and release

Qualification uses focused tests of the actual Native erasure transaction, queue/status behavior, entry routing and source-identical safety guards, plus typecheck and the existing policy/configuration contracts. Existing assertions and individual deadlines remain intact. The owner stopped the repeated local aggregate test-runner review loop; it is not restarted for this release. Test and CI results belong to exact source receipts and must not be inferred from this document.

Before an authorized deployment, take and verify a fresh production backup and pin the exact merged source and configuration. Preserve the installed Native epoch, ordinary `*/15` schedule and all unrelated bindings/secrets. Record the actual deployed version and code ETag, public website and health responses, and the next actual ordinary scheduled callback. No provider operation, release signature or successful live erasure is asserted by this source document.

## Stop and rollback

Stop on an unexpected profile, binding, version, receipt or unknown operation outcome and preserve its evidence. A deployment rollback does not erase already accepted requests or resolve an uncertain write. Any rollback must retain admission and current-epoch safeguards and reconcile queued work explicitly; never restore an older database or private recovery state merely to clear a held status.
