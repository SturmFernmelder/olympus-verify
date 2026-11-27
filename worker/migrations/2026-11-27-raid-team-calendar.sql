-- The existing calendar owns times, RSVP, attendance and retention. Team-only
-- names, policy and original invitees live outside guild-wide event payloads.
CREATE TABLE IF NOT EXISTS raid_team_events316 (
  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES raid_teams316(id) ON DELETE CASCADE,
  series_id TEXT NOT NULL,
  occurrence INTEGER NOT NULL CHECK(occurrence BETWEEN 0 AND 7),
  request_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  timezone TEXT NOT NULL,
  group_mask INTEGER NOT NULL CHECK(group_mask BETWEEN 0 AND 255),
  assembly_minutes INTEGER NOT NULL CHECK(assembly_minutes BETWEEN 0 AND 120),
  preparation TEXT NOT NULL,
  charter_revision INTEGER NOT NULL,
  loot TEXT NOT NULL,
  expectations TEXT NOT NULL,
  UNIQUE(team_id,series_id,occurrence)
);
CREATE INDEX IF NOT EXISTS raid_team_events316_team ON raid_team_events316(team_id,event_id);
CREATE TABLE IF NOT EXISTS raid_team_invites316 (
  event_id TEXT NOT NULL REFERENCES raid_team_events316(event_id) ON DELETE CASCADE,
  seat_id TEXT NOT NULL REFERENCES raid_team_seats316(id) ON DELETE CASCADE,
  character_guid TEXT NOT NULL,
  group_number INTEGER NOT NULL,
  answer TEXT CHECK(answer IN('confirmed','tentative','unavailable','late','substitute')),
  answer_nonce TEXT,
  PRIMARY KEY(event_id,seat_id)
);
CREATE INDEX IF NOT EXISTS raid_team_invites316_seat ON raid_team_invites316(seat_id,event_id);
