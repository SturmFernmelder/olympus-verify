-- Read-only. One pass over the state that is not visible from /health or the local logs.
-- Run from worker\:  npx wrangler d1 execute olympus-verify --remote --file=queries/health-check.sql

-- 1. What the Worker has actually been doing, last 2 hours.
SELECT action, COUNT(*) AS n, MAX(ts) AS last_ts
FROM audit WHERE ts > strftime('%s','now') - 7200
GROUP BY action ORDER BY n DESC;

-- 2. Anything that failed in the last 24 hours. Should normally be empty or only dm.failed.
SELECT action, COUNT(*) AS n, MAX(ts) AS last_ts
FROM audit
WHERE ts > strftime('%s','now') - 86400
  AND (action LIKE '%failed%' OR action LIKE '%error%' OR action = 'invite.expired')
GROUP BY action ORDER BY n DESC;

-- 3. The invite queue as it stands.
SELECT status, COUNT(*) AS n FROM invite_queue GROUP BY status ORDER BY n DESC;

-- 4. Why invites are being refused -- the column added in build .19. Empty means no refusal
--    has been reported since the deploy, which is expected until invites are pressed again.
SELECT COALESCE(last_reason,'(none recorded)') AS reason, COUNT(*) AS n, MAX(last_reason_at) AS last_ts
FROM invite_queue GROUP BY reason ORDER BY n DESC;

-- 5. Is the DM circuit breaker armed, and how much is it saving?
SELECT action, COUNT(*) AS n, MAX(ts) AS last_ts
FROM audit WHERE action IN ('dm.sent','dm.failed','dm.blocked','dm.skipped','dm.suppressed')
  AND ts > strftime('%s','now') - 86400
GROUP BY action ORDER BY n DESC;

-- 6. Roster ingest health: the last five snapshots, with their member counts.
SELECT id, exported_at, received_at, source, member_count,
       CASE WHEN content_hash IS NULL THEN '' ELSE substr(content_hash,1,8) END AS hash
FROM roster_snapshots ORDER BY id DESC LIMIT 5;
