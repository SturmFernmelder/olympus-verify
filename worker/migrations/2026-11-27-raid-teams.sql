-- A standing raid team is independent of native guild rank, calendar RSVPs and Discord roles.
CREATE TABLE IF NOT EXISTS raid_teams316 (
  id TEXT PRIMARY KEY NOT NULL,
  leader_id TEXT NOT NULL,
  leader_birth TEXT NOT NULL,
  leader_guid TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  philosophy TEXT NOT NULL,
  schedule TEXT NOT NULL,
  timezone TEXT NOT NULL,
  loot TEXT NOT NULL,
  expectations TEXT NOT NULL,
  needs TEXT NOT NULL,
  weekly_windows TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(weekly_windows) AND json_type(weekly_windows)='array'),
  role_needs TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(role_needs) AND json_type(role_needs)='array'),
  status TEXT NOT NULL CHECK(status IN ('forming','recruiting','full','reserves','inactive')),
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS raid_teams316_leader ON raid_teams316(leader_id);
CREATE TABLE IF NOT EXISTS raid_team_seats316 (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES raid_teams316(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  account_birth TEXT NOT NULL,
  character_guid TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('tank','healer','melee','ranged','flex')),
  state TEXT NOT NULL CHECK(state IN ('submitted','waitlisted','declined','withdrawn','offered_primary','offered_reserve','primary','reserve')),
  note TEXT NOT NULL DEFAULT '',
  is_officer INTEGER NOT NULL DEFAULT 0 CHECK(is_officer IN (0,1)),
  group_number INTEGER CHECK(group_number IS NULL OR group_number BETWEEN 1 AND 8),
  charter_revision INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (team_id,discord_id)
);
CREATE INDEX IF NOT EXISTS raid_team_seats316_subject ON raid_team_seats316(discord_id,account_birth,state);
CREATE INDEX IF NOT EXISTS raid_team_seats316_status ON raid_team_seats316(team_id,state);
CREATE TABLE IF NOT EXISTS raid_raider_profiles316 (
  discord_id TEXT PRIMARY KEY NOT NULL,
  account_birth TEXT NOT NULL,
  character_guid TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('tank','healer','melee','ranged','flex')),
  class_name TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL,
  availability TEXT NOT NULL,
  notes TEXT NOT NULL,
  listed INTEGER NOT NULL CHECK(listed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS raid_raider_profiles316_listing ON raid_raider_profiles316(listed,role,discord_id);
CREATE INDEX IF NOT EXISTS raid_teams316_character_guid ON characters(guid,discord_id) WHERE guid IS NOT NULL;
