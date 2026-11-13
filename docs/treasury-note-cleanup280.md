# Attended receipt-note cleanup

This is the owner's 12 November 2026 authorization to blank the `note` field on existing `treasury.receipt242` rows whose source is `mail` or `whisper-declaration`. It is a one-time operation in the serving D1 database, not a local journal purge or an account relink.

Keep every row, other field and column, original `payloadHash`, observation time and retention deadline unchanged. The retained checksum commits to the old payload, including its note: someone who can read the other original fields may be able to confirm a guessed short note. It remains for original replay/deduplication custody under the owner's preservation instruction. This cleanup therefore removes the text, not every possible fingerprint of it. Do not silently replace or delete the checksum.

## Before applying

1. Qualify and deploy the prospective receipt-ingress containment first. Otherwise a later legacy upload could add note text after the one-time marker is recorded.
2. Complete the exact-candidate release and review gates. Codex Root must take and locally restore/check a fresh D1 backup immediately before the attended operation, comparing its catalogue with the current live catalogue. A historical or schema-only fixture is insufficient.
3. Sign in with the authorized owner account and use the current donation-ledger cleanup control. Its route is `POST /api/admin/treasury/ledger/note-redaction`; the actions are `preview`, `apply` and `status`. Ordinary staff or administrator status does not authorize it.
4. Read the fresh counts. A malformed, duplicate-key, unsupported or unpaired-surrogate note row holds the scope for classification. No note text should enter a response, screenshot, log or console. Do not bypass a hold, edit a row or enlarge the scope to make the counts match an old report.

The server fixes the row ceiling and checks the scope again inside the admitted transaction. Historical counts such as 43 notes or 58 receipts are not equality gates. Natural retention and a newer covered receipt can change the fresh counts.

## Apply once, then read status

The control submits the original review token once with the confirmation `BLANK RECEIPT NOTES`. It must not automatically resend an apply request. An expiry or refusal does not settle an earlier uncertain attempt. Read status before preparing a new review.

After a lost or uncertain reply, use **Check cleanup status** in a fresh request. A scoped `503 receipt_note_cleanup_unconfirmed` does not say whether the transaction committed. An apply refusal with `409 receipt_note_cleanup_held` occurs before that request's mutation; it does not determine the outcome of any earlier attempt. The status response reports the recorded completion and current remaining/unclassified counts. A malformed completion marker is unconfirmed, not a successful cleanup.

The one-time marker is `site_settings['maintenance:treasury-note-redaction280']`. The same transaction records the counts-only `treasury.receipt_note_redaction280` audit event. A completed marker makes later apply submissions return status without another update, including submissions carrying an expired old review. Never remove or alter the marker to force another run.

## Readback and restore

Confirm the recorded operation, zero remaining covered notes and the expected unclassified count. Check preservation of every non-note field and original deadline through the reviewed counts/content-free evidence; do not export the erased text as a verification step.

A database restore can reintroduce note text or an older marker state. Treat it as a separate recovery incident: inspect the restored ingress version, marker, completion audit and remaining counts, then obtain a separately reviewed owner decision. Do not reuse an old review token, delete a marker, replay an uncertain apply or change the backup privately. Ordinary retention deadlines must not restart.

Already captured local files, backups and unknown delivery originals remain under their existing custody and the separate owner retention decision. No command in this runbook authorizes deleting them.
