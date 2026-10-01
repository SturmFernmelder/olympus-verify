-- When each character first appeared on an exported roster.
--
-- The game gives addons no guild join date, and "how long has this person been here" is the difference between an
-- unverified member who has had days to link their Discord and one who was invited this morning. postRoster keeps
-- this current from now on; the INSERT below backfills it from every snapshot already stored.
--
-- Backfill caveat: an unchanged roster export refreshes the existing snapshot row's exported_at instead of adding a
-- row (the D1 write-budget fix of 18 Sep), so a snapshot's exported_at can be later than when it was created. The
-- backfilled first_seen can therefore be LATER than the true join — never earlier. That errs toward protecting a
-- member, which is the direction to err in when the outcome is removing them from the guild.
--
-- Apply once:  npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-25-first-seen.sql
CREATE TABLE IF NOT EXISTS roster_first_seen (
  name_key   TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);

INSERT OR IGNORE INTO roster_first_seen (name_key, first_seen)
  SELECT rm.name_key, MIN(s.exported_at)
    FROM roster_members rm
    JOIN roster_snapshots s ON s.id = rm.snapshot_id
   GROUP BY rm.name_key;
