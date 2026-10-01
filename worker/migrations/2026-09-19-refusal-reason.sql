-- Why the last invite on this row was refused, in a form worth showing the applicant.
--
-- Until now a refusal reached staff (a #mod-alerts notice) and the audit log, and stopped there. The person whose
-- invite it was -- the only one who can do anything about "you are still in another guild" -- was told nothing, so
-- roughly 50 people spent 19 September waiting on an invite that could never arrive. Storing the reason on the row
-- is what lets /verify-status answer them, which matters more than usual right now: Discord DMs are barred while
-- the application is under anti-spam review, and a slash command is the one channel that still reaches everyone.
--
-- Values come from refusalCode() in src/ingest.ts: guild_full | in_another_guild | offline | declined | other.
ALTER TABLE invite_queue ADD COLUMN last_reason TEXT;
ALTER TABLE invite_queue ADD COLUMN last_reason_at INTEGER;
