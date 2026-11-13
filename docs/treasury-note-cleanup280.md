# Attended receipt-note cleanup

This is the owner's 12 November 2026 authorization to blank the `note` field on existing `treasury.receipt242` rows whose source is `mail` or `whisper-declaration`. It is a one-time operation in the serving D1 database, not a local journal purge or an account relink.

Keep every row, other field and column, original `payloadHash`, observation time and retention deadline unchanged. The retained checksum commits to the old payload, including its note: someone who can read the other original fields may be able to confirm a guessed short note. This note-only implementation retains it for original replay/deduplication custody. The owner's 12 November wording authorized blanking notes while retaining the receipt rows and who/how much/when; it did not explicitly address the checksum. Checksum retention is disclosed behavior, not an explicit owner instruction about hashes. This cleanup therefore removes the text, not every possible fingerprint of it. Do not silently replace or delete the checksum.

## Before applying

1. Qualify and deploy the prospective receipt-ingress containment first. Otherwise a later legacy upload could add note text after the one-time marker is recorded.
2. Complete the exact-candidate release and review gates. Codex Root must take and locally restore/check a fresh D1 backup immediately before the attended operation, comparing its catalogue with the current live catalogue. A historical or schema-only fixture is insufficient.
3. Sign in with the authorized owner account. After its separately reviewed UI280 integration, the donation-ledger view provides **Preview cleanup**, **Apply once** and **Check cleanup status**. The reviewed UI exists in the primary candidate; this runbook does not establish its deployment or browser acceptance. Its route is `POST /api/admin/treasury/ledger/note-redaction`; the actions are `preview`, `apply` and `status`. Ordinary staff or administrator status does not authorize it.
4. Read the fresh counts. A malformed, duplicate-key, unsupported, unpaired-surrogate or alternate stored JSON representation that cannot preserve the exact note-only length manifest holds the scope for classification. This includes escaped Unicode/slashes or whitespace whose stored representation differs from the manifest assumption. A capacity hold over 1,000 receipt rows omits the optional unclassified count because the entire scope was not classified. Invalid rows are excluded from the non-note preservation manifest before Native returns it; census still counts and refuses them. This guard prevents a second duplicate `note` value from entering that manifest after SQLite removes only the first. It never normalizes or deletes the ambiguous original. No note text should enter a response, screenshot, log or console. Do not bypass a hold, edit a row or enlarge the scope to make the counts match an old report.

The server fixes the row ceiling and checks the scope again inside the admitted transaction. Historical counts such as 43 notes or 58 receipts are not equality gates. Natural retention and a newer covered receipt can change the fresh counts.

## Apply once, then read status

The review is signed readable JSON followed by an HMAC, not an opaque token. It includes actor/session/generation/epoch/ceiling/time/operation identifiers and is not suitable for public posts or logs. The UI reads the original `review.id`; preserve the exact signed wire when submitting. The control submits that original review once with the confirmation `BLANK RECEIPT NOTES`. It must not automatically resend an apply request. An expiry or refusal does not settle an earlier uncertain attempt. Read status before preparing a new review.

After a lost or uncertain reply, use **Check cleanup status** in a fresh request. Status, census and ceiling-read errors also produce the scoped unconfirmed response; none authorizes an automatic apply retry. A scoped `503 receipt_note_cleanup_unconfirmed` does not say whether the transaction committed. An apply refusal with `409 receipt_note_cleanup_held` occurs before that request's mutation; it does not determine the outcome of any earlier attempt. The status response reports the recorded completion and current remaining/unclassified counts. A malformed completion marker is unconfirmed, not a successful cleanup.

The one-time marker is `site_settings['maintenance:treasury-note-redaction280']`. The same transaction records the counts-only `treasury.receipt_note_redaction280` audit event. A completed marker makes later apply submissions return status without another update, including submissions carrying an expired old review. Never remove or alter the marker to force another run.

## Readback and restore

Use the repository [release qualification and production rollout gates](../CLAUDE.md#release-qualification-and-production-rollout) for deployment and exact-head signatures. These local Native fixtures do not authorize a production cleanup or prove live catalogue/backup/UI parity. The attended operator must capture the exact deployed version, original preview counts and operation ID, the one submit outcome, and a fresh status readback without note text or review token content.


Confirm the recorded operation, zero remaining covered notes and the expected unclassified count. Check preservation of every non-note field and original deadline through the reviewed counts/content-free evidence; do not export the erased text as a verification step.

A database restore can reintroduce note text or an older marker state. Treat it as a separate recovery incident: inspect the restored ingress version, marker, completion audit and remaining counts, then obtain a separately reviewed owner decision. Do not reuse an old review token, delete a marker, replay an uncertain apply or change the backup privately. Ordinary retention deadlines must not restart.

Already captured local files, backups and unknown delivery originals remain under their existing custody and the separate owner retention decision. No command in this runbook authorizes deleting them.
