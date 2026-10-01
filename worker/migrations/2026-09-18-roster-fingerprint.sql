-- Roster snapshot fingerprints (18 September 2026).
--
-- ingestRoster rewrote every member row on every export. With a 1,000-member guild exporting about once a minute
-- that is ~60,000 row-writes an hour, and on 18 September it exhausted D1's free-tier allowance of 100,000 rows
-- written per day (enforced by Cloudflare since 1 September 2026); every POST /ingest/roster then returned 500
-- until midnight UTC. Storing a fingerprint of each snapshot lets an unchanged export refresh one row instead of
-- a thousand.
--
-- Apply once against the live database:
--   npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-18-roster-fingerprint.sql
-- Re-running it is harmless: a duplicate-column error means it has already been applied.

ALTER TABLE roster_snapshots ADD COLUMN content_hash TEXT;
