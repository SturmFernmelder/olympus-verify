-- Build .66 (1 October 2026): retain_until is the effective cutoff for trials (worker/src/community-trials.ts). One open
-- trial per member is judged inside the insert at database time, so an open trial past its lifetime does not block a new
-- one; the .61 partial unique index goes. The Worker applies the same statement itself (src/schema.ts). Additive in effect.
DROP INDEX IF EXISTS community_trials_open;
