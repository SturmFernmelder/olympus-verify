// Generated from the two raid-team migrations by scripts/build-raid-team-schema.cjs.
function freeze<T extends object>(value:T):T {
  for(const child of Object.values(value)) if(child && typeof child==='object') freeze(child);
  return Object.freeze(value);
}
export const RAID_SCHEMA_DATA316=freeze({
  "tables": [
    {
      "name": "raid_raider_profiles316",
      "sql": "CREATE TABLE raid_raider_profiles316 (\n  discord_id TEXT PRIMARY KEY NOT NULL,\n  account_birth TEXT NOT NULL,\n  character_guid TEXT NOT NULL,\n  role TEXT NOT NULL CHECK(role IN ('tank','healer','melee','ranged','flex')),\n  class_name TEXT NOT NULL DEFAULT '',\n  spec TEXT NOT NULL,\n  availability TEXT NOT NULL,\n  notes TEXT NOT NULL,\n  listed INTEGER NOT NULL CHECK(listed IN (0,1)),\n  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch())\n)",
      "columns": [
        "account_birth",
        "availability",
        "character_guid",
        "class_name",
        "discord_id",
        "listed",
        "notes",
        "revision",
        "role",
        "spec",
        "updated_at"
      ]
    },
    {
      "name": "raid_team_events316",
      "sql": "CREATE TABLE raid_team_events316 (\n  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,\n  team_id TEXT NOT NULL REFERENCES raid_teams316(id) ON DELETE CASCADE,\n  series_id TEXT NOT NULL,\n  occurrence INTEGER NOT NULL CHECK(occurrence BETWEEN 0 AND 7),\n  request_hash TEXT NOT NULL,\n  title TEXT NOT NULL,\n  timezone TEXT NOT NULL,\n  group_mask INTEGER NOT NULL CHECK(group_mask BETWEEN 0 AND 255),\n  assembly_minutes INTEGER NOT NULL CHECK(assembly_minutes BETWEEN 0 AND 120),\n  preparation TEXT NOT NULL,\n  charter_revision INTEGER NOT NULL,\n  loot TEXT NOT NULL,\n  expectations TEXT NOT NULL,\n  UNIQUE(team_id,series_id,occurrence)\n)",
      "columns": [
        "assembly_minutes",
        "charter_revision",
        "event_id",
        "expectations",
        "group_mask",
        "loot",
        "occurrence",
        "preparation",
        "request_hash",
        "series_id",
        "team_id",
        "timezone",
        "title"
      ]
    },
    {
      "name": "raid_team_invites316",
      "sql": "CREATE TABLE raid_team_invites316 (\n  event_id TEXT NOT NULL REFERENCES raid_team_events316(event_id) ON DELETE CASCADE,\n  seat_id TEXT NOT NULL REFERENCES raid_team_seats316(id) ON DELETE CASCADE,\n  character_guid TEXT NOT NULL,\n  group_number INTEGER NOT NULL,\n  answer TEXT CHECK(answer IN('confirmed','tentative','unavailable','late','substitute')),\n  answer_nonce TEXT,\n  PRIMARY KEY(event_id,seat_id)\n)",
      "columns": [
        "answer",
        "answer_nonce",
        "character_guid",
        "event_id",
        "group_number",
        "seat_id"
      ]
    },
    {
      "name": "raid_team_seats316",
      "sql": "CREATE TABLE raid_team_seats316 (\n  id TEXT PRIMARY KEY NOT NULL,\n  team_id TEXT NOT NULL REFERENCES raid_teams316(id) ON DELETE CASCADE,\n  discord_id TEXT NOT NULL,\n  account_birth TEXT NOT NULL,\n  character_guid TEXT NOT NULL,\n  role TEXT NOT NULL CHECK(role IN ('tank','healer','melee','ranged','flex')),\n  state TEXT NOT NULL CHECK(state IN ('submitted','waitlisted','declined','withdrawn','offered_primary','offered_reserve','primary','reserve')),\n  note TEXT NOT NULL DEFAULT '',\n  is_officer INTEGER NOT NULL DEFAULT 0 CHECK(is_officer IN (0,1)),\n  group_number INTEGER CHECK(group_number IS NULL OR group_number BETWEEN 1 AND 8),\n  charter_revision INTEGER NOT NULL,\n  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),\n  created_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  UNIQUE (team_id,discord_id)\n)",
      "columns": [
        "account_birth",
        "character_guid",
        "charter_revision",
        "created_at",
        "discord_id",
        "group_number",
        "id",
        "is_officer",
        "note",
        "revision",
        "role",
        "state",
        "team_id",
        "updated_at"
      ]
    },
    {
      "name": "raid_teams316",
      "sql": "CREATE TABLE raid_teams316 (\n  id TEXT PRIMARY KEY NOT NULL,\n  leader_id TEXT NOT NULL,\n  leader_birth TEXT NOT NULL,\n  leader_guid TEXT NOT NULL,\n  name TEXT NOT NULL COLLATE NOCASE UNIQUE,\n  philosophy TEXT NOT NULL,\n  schedule TEXT NOT NULL,\n  timezone TEXT NOT NULL,\n  loot TEXT NOT NULL,\n  expectations TEXT NOT NULL,\n  needs TEXT NOT NULL,\n  weekly_windows TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(weekly_windows) AND json_type(weekly_windows)='array'),\n  role_needs TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(role_needs) AND json_type(role_needs)='array'),\n  status TEXT NOT NULL CHECK(status IN ('forming','recruiting','full','reserves','inactive')),\n  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),\n  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),\n  created_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch())\n)",
      "columns": [
        "capacity",
        "created_at",
        "expectations",
        "id",
        "leader_birth",
        "leader_guid",
        "leader_id",
        "loot",
        "name",
        "needs",
        "philosophy",
        "revision",
        "role_needs",
        "schedule",
        "status",
        "timezone",
        "updated_at",
        "weekly_windows"
      ]
    }
  ],
  "indexes": [
    {
      "name": "raid_raider_profiles316_listing",
      "sql": "CREATE INDEX raid_raider_profiles316_listing ON raid_raider_profiles316(listed,role,discord_id)",
      "tbl_name": "raid_raider_profiles316"
    },
    {
      "name": "raid_team_events316_team",
      "sql": "CREATE INDEX raid_team_events316_team ON raid_team_events316(team_id,event_id)",
      "tbl_name": "raid_team_events316"
    },
    {
      "name": "raid_team_invites316_seat",
      "sql": "CREATE INDEX raid_team_invites316_seat ON raid_team_invites316(seat_id,event_id)",
      "tbl_name": "raid_team_invites316"
    },
    {
      "name": "raid_team_seats316_status",
      "sql": "CREATE INDEX raid_team_seats316_status ON raid_team_seats316(team_id,state)",
      "tbl_name": "raid_team_seats316"
    },
    {
      "name": "raid_team_seats316_subject",
      "sql": "CREATE INDEX raid_team_seats316_subject ON raid_team_seats316(discord_id,account_birth,state)",
      "tbl_name": "raid_team_seats316"
    },
    {
      "name": "raid_teams316_character_guid",
      "sql": "CREATE INDEX raid_teams316_character_guid ON characters(guid,discord_id) WHERE guid IS NOT NULL",
      "tbl_name": "characters"
    },
    {
      "name": "raid_teams316_leader",
      "sql": "CREATE INDEX raid_teams316_leader ON raid_teams316(leader_id)",
      "tbl_name": "raid_teams316"
    }
  ],
  "triggers": [
    {
      "name": "privacy_admit_raid_raider_profiles316_delete",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_raider_profiles316_delete\" BEFORE DELETE ON \"raid_raider_profiles316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_raider_profiles316_insert",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_raider_profiles316_insert\" BEFORE INSERT ON \"raid_raider_profiles316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_raider_profiles316_update",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_raider_profiles316_update\" BEFORE UPDATE ON \"raid_raider_profiles316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_events316_delete",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_events316_delete\" BEFORE DELETE ON \"raid_team_events316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_events316_insert",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_events316_insert\" BEFORE INSERT ON \"raid_team_events316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_events316_update",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_events316_update\" BEFORE UPDATE ON \"raid_team_events316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_invites316_delete",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_invites316_delete\" BEFORE DELETE ON \"raid_team_invites316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_invites316_insert",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_invites316_insert\" BEFORE INSERT ON \"raid_team_invites316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_invites316_update",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_invites316_update\" BEFORE UPDATE ON \"raid_team_invites316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_seats316_delete",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_seats316_delete\" BEFORE DELETE ON \"raid_team_seats316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_seats316_insert",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_seats316_insert\" BEFORE INSERT ON \"raid_team_seats316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_team_seats316_update",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_team_seats316_update\" BEFORE UPDATE ON \"raid_team_seats316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_teams316_delete",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_teams316_delete\" BEFORE DELETE ON \"raid_teams316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_teams316_insert",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_teams316_insert\" BEFORE INSERT ON \"raid_teams316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    },
    {
      "name": "privacy_admit_raid_teams316_update",
      "sql": "CREATE TRIGGER \"privacy_admit_raid_teams316_update\" BEFORE UPDATE ON \"raid_teams316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    }
  ],
  "objects": [
    [
      "index",
      "raid_raider_profiles316_listing",
      "raid_raider_profiles316",
      "CREATE INDEX raid_raider_profiles316_listing ON raid_raider_profiles316(listed,role,discord_id)"
    ],
    [
      "index",
      "raid_team_events316_team",
      "raid_team_events316",
      "CREATE INDEX raid_team_events316_team ON raid_team_events316(team_id,event_id)"
    ],
    [
      "index",
      "raid_team_invites316_seat",
      "raid_team_invites316",
      "CREATE INDEX raid_team_invites316_seat ON raid_team_invites316(seat_id,event_id)"
    ],
    [
      "index",
      "raid_team_seats316_status",
      "raid_team_seats316",
      "CREATE INDEX raid_team_seats316_status ON raid_team_seats316(team_id,state)"
    ],
    [
      "index",
      "raid_team_seats316_subject",
      "raid_team_seats316",
      "CREATE INDEX raid_team_seats316_subject ON raid_team_seats316(discord_id,account_birth,state)"
    ],
    [
      "index",
      "raid_teams316_character_guid",
      "characters",
      "CREATE INDEX raid_teams316_character_guid ON characters(guid,discord_id) WHERE guid IS NOT NULL"
    ],
    [
      "index",
      "raid_teams316_leader",
      "raid_teams316",
      "CREATE INDEX raid_teams316_leader ON raid_teams316(leader_id)"
    ],
    [
      "index",
      "sqlite_autoindex_raid_raider_profiles316_1",
      "raid_raider_profiles316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_team_events316_1",
      "raid_team_events316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_team_events316_2",
      "raid_team_events316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_team_invites316_1",
      "raid_team_invites316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_team_seats316_1",
      "raid_team_seats316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_team_seats316_2",
      "raid_team_seats316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_teams316_1",
      "raid_teams316",
      null
    ],
    [
      "index",
      "sqlite_autoindex_raid_teams316_2",
      "raid_teams316",
      null
    ],
    [
      "table",
      "raid_raider_profiles316",
      "raid_raider_profiles316",
      "CREATE TABLE raid_raider_profiles316 (\n  discord_id TEXT PRIMARY KEY NOT NULL,\n  account_birth TEXT NOT NULL,\n  character_guid TEXT NOT NULL,\n  role TEXT NOT NULL CHECK(role IN ('tank','healer','melee','ranged','flex')),\n  class_name TEXT NOT NULL DEFAULT '',\n  spec TEXT NOT NULL,\n  availability TEXT NOT NULL,\n  notes TEXT NOT NULL,\n  listed INTEGER NOT NULL CHECK(listed IN (0,1)),\n  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch())\n)"
    ],
    [
      "table",
      "raid_team_events316",
      "raid_team_events316",
      "CREATE TABLE raid_team_events316 (\n  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,\n  team_id TEXT NOT NULL REFERENCES raid_teams316(id) ON DELETE CASCADE,\n  series_id TEXT NOT NULL,\n  occurrence INTEGER NOT NULL CHECK(occurrence BETWEEN 0 AND 7),\n  request_hash TEXT NOT NULL,\n  title TEXT NOT NULL,\n  timezone TEXT NOT NULL,\n  group_mask INTEGER NOT NULL CHECK(group_mask BETWEEN 0 AND 255),\n  assembly_minutes INTEGER NOT NULL CHECK(assembly_minutes BETWEEN 0 AND 120),\n  preparation TEXT NOT NULL,\n  charter_revision INTEGER NOT NULL,\n  loot TEXT NOT NULL,\n  expectations TEXT NOT NULL,\n  UNIQUE(team_id,series_id,occurrence)\n)"
    ],
    [
      "table",
      "raid_team_invites316",
      "raid_team_invites316",
      "CREATE TABLE raid_team_invites316 (\n  event_id TEXT NOT NULL REFERENCES raid_team_events316(event_id) ON DELETE CASCADE,\n  seat_id TEXT NOT NULL REFERENCES raid_team_seats316(id) ON DELETE CASCADE,\n  character_guid TEXT NOT NULL,\n  group_number INTEGER NOT NULL,\n  answer TEXT CHECK(answer IN('confirmed','tentative','unavailable','late','substitute')),\n  answer_nonce TEXT,\n  PRIMARY KEY(event_id,seat_id)\n)"
    ],
    [
      "table",
      "raid_team_seats316",
      "raid_team_seats316",
      "CREATE TABLE raid_team_seats316 (\n  id TEXT PRIMARY KEY NOT NULL,\n  team_id TEXT NOT NULL REFERENCES raid_teams316(id) ON DELETE CASCADE,\n  discord_id TEXT NOT NULL,\n  account_birth TEXT NOT NULL,\n  character_guid TEXT NOT NULL,\n  role TEXT NOT NULL CHECK(role IN ('tank','healer','melee','ranged','flex')),\n  state TEXT NOT NULL CHECK(state IN ('submitted','waitlisted','declined','withdrawn','offered_primary','offered_reserve','primary','reserve')),\n  note TEXT NOT NULL DEFAULT '',\n  is_officer INTEGER NOT NULL DEFAULT 0 CHECK(is_officer IN (0,1)),\n  group_number INTEGER CHECK(group_number IS NULL OR group_number BETWEEN 1 AND 8),\n  charter_revision INTEGER NOT NULL,\n  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),\n  created_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  UNIQUE (team_id,discord_id)\n)"
    ],
    [
      "table",
      "raid_teams316",
      "raid_teams316",
      "CREATE TABLE raid_teams316 (\n  id TEXT PRIMARY KEY NOT NULL,\n  leader_id TEXT NOT NULL,\n  leader_birth TEXT NOT NULL,\n  leader_guid TEXT NOT NULL,\n  name TEXT NOT NULL COLLATE NOCASE UNIQUE,\n  philosophy TEXT NOT NULL,\n  schedule TEXT NOT NULL,\n  timezone TEXT NOT NULL,\n  loot TEXT NOT NULL,\n  expectations TEXT NOT NULL,\n  needs TEXT NOT NULL,\n  weekly_windows TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(weekly_windows) AND json_type(weekly_windows)='array'),\n  role_needs TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(role_needs) AND json_type(role_needs)='array'),\n  status TEXT NOT NULL CHECK(status IN ('forming','recruiting','full','reserves','inactive')),\n  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),\n  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),\n  created_at INTEGER NOT NULL DEFAULT (unixepoch()),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch())\n)"
    ],
    [
      "trigger",
      "privacy_admit_raid_raider_profiles316_delete",
      "raid_raider_profiles316",
      "CREATE TRIGGER \"privacy_admit_raid_raider_profiles316_delete\" BEFORE DELETE ON \"raid_raider_profiles316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_raider_profiles316_insert",
      "raid_raider_profiles316",
      "CREATE TRIGGER \"privacy_admit_raid_raider_profiles316_insert\" BEFORE INSERT ON \"raid_raider_profiles316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_raider_profiles316_update",
      "raid_raider_profiles316",
      "CREATE TRIGGER \"privacy_admit_raid_raider_profiles316_update\" BEFORE UPDATE ON \"raid_raider_profiles316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_events316_delete",
      "raid_team_events316",
      "CREATE TRIGGER \"privacy_admit_raid_team_events316_delete\" BEFORE DELETE ON \"raid_team_events316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_events316_insert",
      "raid_team_events316",
      "CREATE TRIGGER \"privacy_admit_raid_team_events316_insert\" BEFORE INSERT ON \"raid_team_events316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_events316_update",
      "raid_team_events316",
      "CREATE TRIGGER \"privacy_admit_raid_team_events316_update\" BEFORE UPDATE ON \"raid_team_events316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_invites316_delete",
      "raid_team_invites316",
      "CREATE TRIGGER \"privacy_admit_raid_team_invites316_delete\" BEFORE DELETE ON \"raid_team_invites316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_invites316_insert",
      "raid_team_invites316",
      "CREATE TRIGGER \"privacy_admit_raid_team_invites316_insert\" BEFORE INSERT ON \"raid_team_invites316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_invites316_update",
      "raid_team_invites316",
      "CREATE TRIGGER \"privacy_admit_raid_team_invites316_update\" BEFORE UPDATE ON \"raid_team_invites316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_seats316_delete",
      "raid_team_seats316",
      "CREATE TRIGGER \"privacy_admit_raid_team_seats316_delete\" BEFORE DELETE ON \"raid_team_seats316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_seats316_insert",
      "raid_team_seats316",
      "CREATE TRIGGER \"privacy_admit_raid_team_seats316_insert\" BEFORE INSERT ON \"raid_team_seats316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_team_seats316_update",
      "raid_team_seats316",
      "CREATE TRIGGER \"privacy_admit_raid_team_seats316_update\" BEFORE UPDATE ON \"raid_team_seats316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_teams316_delete",
      "raid_teams316",
      "CREATE TRIGGER \"privacy_admit_raid_teams316_delete\" BEFORE DELETE ON \"raid_teams316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_teams316_insert",
      "raid_teams316",
      "CREATE TRIGGER \"privacy_admit_raid_teams316_insert\" BEFORE INSERT ON \"raid_teams316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ],
    [
      "trigger",
      "privacy_admit_raid_teams316_update",
      "raid_teams316",
      "CREATE TRIGGER \"privacy_admit_raid_teams316_update\" BEFORE UPDATE ON \"raid_teams316\" BEGIN SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='olympus-write-admission-epoch-2' AND mode='serving' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND active=1 AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND purpose IN('writer','lifecycle')) THEN 1 ELSE RAISE(ABORT,'privacy_write_admission_required') END; END"
    ]
  ]
});
