-- Invite retry and expiry (19 September 2026).
--
-- `invited` was a terminal state: getQueue only ever serves 'queued' and 'written', so an invite that fired and was
-- refused left the row parked forever. On 19 September 91 people sat in `invited` — verified, one invite attempt
-- each, then silence. About 50 of them were simply still in another guild, which the game refuses an invite for and
-- which nothing in the pipeline noticed or reported.
--
-- attempts    counts refusals that are the applicant's to fix; a full guild does not count, because that is ours.
-- retry_after holds a row back until a time, so a hard refusal backs off instead of burning an invite key press
--             on every poll. getQueue skips rows whose retry_after is still in the future.
--
-- Apply once against the live database:
--   npx wrangler@4.135.0 d1 execute olympus-verify --remote --file=migrations/2026-09-19-invite-retry.sql
-- Re-running it is harmless: a duplicate-column error means it has already been applied.

ALTER TABLE invite_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invite_queue ADD COLUMN retry_after INTEGER;
