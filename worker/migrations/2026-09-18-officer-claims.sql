-- Per-officer claims on the invite queue (18 September 2026).
--
-- Until now GET /queue returned every waiting invite to every caller, so a second officer running the addon would
-- write the same entries into their own OlympusQueue.lua and fire the same invites — duplicate invites, wasted key
-- presses, and "already in a guild" errors for the applicant. A claim gives one officer a short exclusive hold on a
-- row; the hold lapses on its own if that officer stops polling, so nothing is stranded when a client goes offline.
--
-- Apply once against the live database:
--   npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-18-officer-claims.sql
-- Re-running it is harmless: a duplicate-column error means it has already been applied.

ALTER TABLE invite_queue ADD COLUMN claimed_by TEXT;
ALTER TABLE invite_queue ADD COLUMN claimed_at INTEGER;
CREATE INDEX IF NOT EXISTS invite_queue_claim ON invite_queue(status, claimed_by, claimed_at);
