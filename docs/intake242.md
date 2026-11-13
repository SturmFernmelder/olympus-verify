# Watcher .242 intake

Watcher 0.6.23 reads only saved addon data, retaining original pending IDs and bodies across reloads and outages. It reads OlympusVerify.lua, Olympus.lua, OlympusRecord.lua and OlympusRecordDB.lua, merges entries by their stable source ID and refuses conflicting originals. Batches contain at most 25 entries. It never executes a remote role ID or action.

POST `/ingest/intake242` requires the existing Watcher bearer token and launch-membership protocol. A server `done` or `rejected` receipt is persisted before it is signed into `OlympusQueue.intakeReceipts242`. Missing/unknown verification outcomes retain the original and prevent an automatic second attempt; the explicit original pre-effect `membership_source_pending` response alone permits another attempt. Age is decided by the server, without refreshing captured proof timestamps.

Signed native mail identifies the actual native sender. Only an exact unique current complete/trusted own-guild roster match can supply its GUID, with the collector also present. Original pending, code, ownership, generation and membership guards still decide verification. Remote addon self-claims need a valid original native membership proof. Native Discord observations must match an existing server GUID/name/account binding; they do not create a link.

Donation receipts are unclassified observations in the existing audit JSON ledger, under `treasury.receipt242`. Gold, item identifiers/counts and notes are bounded; there is no tithe allocation or automatic credit. The staff-only GET `/api/admin/treasury/ledger?q=&cursor=` offers search and pagination. Receipt observations have 30-day retention and registered account erasure/export by the existing character relation. No schema migration is required.

Queue verification cache records expire within 300 seconds and are advisory only. Delivery receipts are not current identity or role authority. The strict original invite protocol also accepts version 242 / `native-who-whisper-v242`, preserving its original MAC recipe and changed-WHO unguilded evidence.

Regression source: `watcher/tests/test_intake242.py` (moved there on 12 November 2026 so the Watcher suite in CI runs it with every other Watcher test).

Legacy captured proofs retain their original bytes until an explicit server no-effect expiry receipt. Exact private seen-claim ownership and uniqueness are required before dispatch and claim release. Expiry settlement removes only its own claim in the same atomic local save; an uncertain save restores the original queue and claims and permits local ACK persistence only, never another request.

Presence-only queue polls remain zero-D1. The .622 Watcher requests the bounded verification cache separately through the same launch-version fence; the members-only cache path cannot claim invitation rows.

The .623 addon gives each genuine verification-whisper observation a persistent ID shared by its event and intake entry. A readable native chat line ID is used only for local deduplication within the addon session; when unavailable, a durable sequence distinguishes dispatched observations. Neither identifier is identity or membership authority. Reprocessing the same observation is idempotent; a fresh whisper preserves a new original timestamp/proof without clearing the earlier rejected, spent, or unknown record. Watcher fallback suppression matches that observation, not every later use of the same name/code.

Mirroring an Olympus/OlympusRecord request preserves its original body fields and source ID. UNTRUSTED bridge provenance is stored outside the entry body and alongside Watcher custody. It cannot create or upgrade a native signature; the Worker independently checks original proofs. Real body differences under one ID still hold as source conflicts. Signed receipt GUIDs may be absent or empty with the same MAC serialization; an original GUID-bound row still requires that GUID. Legacy queue hashes include the exact signed receipt/cache inputs, including their original observation/expiry/MAC fields, while excluding generated display times.
