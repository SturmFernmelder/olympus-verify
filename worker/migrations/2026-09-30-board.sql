-- 30 Sep 2026 (build .43): backup choices, the weekly availability grid, the voting board, and Raid Leader / Raid
-- Assist split into NA and EU.
--
-- The Worker applies all of this itself on its first request after the deploy (src/schema.ts, idempotent), so running
-- this file is optional. If you do run it, run it once, BEFORE `npm run deploy`:
--   npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-30-board.sql
-- A second run fails on the ALTERs with "duplicate column name" -- harmless.

ALTER TABLE site_applications ADD COLUMN backup1 TEXT;
ALTER TABLE site_applications ADD COLUMN backup2 TEXT;
ALTER TABLE site_applications ADD COLUMN avail TEXT;
ALTER TABLE site_applications ADD COLUMN avail_tz TEXT;
ALTER TABLE site_applications ADD COLUMN fit_na INTEGER;
ALTER TABLE site_applications ADD COLUMN fit_eu INTEGER;
ALTER TABLE site_applications ADD COLUMN board_at INTEGER;
CREATE INDEX IF NOT EXISTS site_votes_nominee ON site_votes(nominee_kind, nominee_key);

CREATE TABLE IF NOT EXISTS site_board_votes (
  voter_id     TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  role_key     TEXT NOT NULL,
  vote         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (voter_id, candidate_id, role_key)
);
CREATE INDEX IF NOT EXISTS site_board_votes_tally ON site_board_votes(role_key, candidate_id);
CREATE INDEX IF NOT EXISTS site_board_votes_candidate ON site_board_votes(candidate_id);

-- Raid Leader and Raid Assist applications go to NA or EU by the applicant's region; Raid Leader nominations by the
-- nominee's own application (EU when they applied from Europe), otherwise NA.
UPDATE site_applications SET position = position || CASE WHEN region = 'eu' THEN '_eu' ELSE '_na' END
 WHERE position IN ('raid_leader', 'raid_assist');
UPDATE site_votes SET ballot = 'raid_leader' || CASE WHEN EXISTS (
    SELECT 1 FROM site_applications a WHERE site_votes.nominee_kind = 'discord' AND a.discord_id = site_votes.nominee_key AND a.region = 'eu')
  THEN '_eu' ELSE '_na' END
 WHERE ballot = 'raid_leader';
