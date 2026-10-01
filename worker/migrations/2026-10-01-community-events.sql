-- Build .59 (1 October 2026): the guild calendar with sign-ups, capacity and attendance (worker/src/community-events.ts).
-- The Worker applies the same statements itself at first request (src/schema.ts); this file is the record. Additive only.

-- Build .59 (1 Oct 2026): the guild calendar with sign-ups, capacity and attendance (worker/src/community-events.ts),
-- ported from Olympus Forever's guild_events / guild_event_signups / guild_event_changes / event_attendance. Organizers
-- (SITE_ADMINS or COMMUNITY_ORGANIZERS, confirmed guild members) create, edit and cancel; confirmed members answer.
-- Capacity is judged inside the RSVP statement; the calendar's distinct members are bounded (COMMUNITY_DIRECTORY_LIMIT);
-- an event and everything under it go 30 days after it ends (retain_until). All timestamps unix seconds. Same as
-- migrations/2026-10-01-community-events.sql; the Worker creates them itself.
CREATE TABLE IF NOT EXISTS community_events (
  id                    TEXT PRIMARY KEY CHECK (length(id) = 22),          -- the creating operation's id (a retried create applies once)
  op_id                 TEXT NOT NULL,
  op_hash               TEXT,                                               -- what the create wrote, hashed: a replay is compared with this
  title                 TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  details               TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 500),
  starts_at             INTEGER NOT NULL CHECK (starts_at > 0),
  duration_min          INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 720),
  ends_at               INTEGER NOT NULL CHECK (ends_at = starts_at + duration_min * 60),
  capacity              INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100),
  role_targets          TEXT CHECK (role_targets IS NULL OR json_valid(role_targets)), -- {"tank":n,"healer":n,"damage":n}
  status                TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by            TEXT,                                               -- NULL once the creator's account is erased
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  signup_generation     INTEGER NOT NULL DEFAULT 0 CHECK (signup_generation >= 0),     -- moves with every answer and erase
  attendance_generation INTEGER NOT NULL DEFAULT 0 CHECK (attendance_generation >= 0), -- moves with every attendance write
  nonce                 TEXT,                                               -- per organizer write: admits the rest of its batch
  attendance_nonce      TEXT,                                               -- per attendance write
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  retain_until          INTEGER NOT NULL                                    -- ends_at + 30 days; a cancellation brings it forward
);
CREATE UNIQUE INDEX IF NOT EXISTS community_events_op ON community_events(created_by, op_id);
CREATE INDEX IF NOT EXISTS community_events_window ON community_events(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS community_events_retain ON community_events(retain_until);

CREATE TABLE IF NOT EXISTS community_event_signups (               -- one effective answer per member and event
  event_id       TEXT NOT NULL,
  discord_id     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),
  character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),
  character_key  TEXT,                                             -- communityKey(character_name)
  raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  rsvp_starts_at INTEGER NOT NULL,                                 -- the start the member answered for (changedSinceRsvp)
  updated_at     INTEGER NOT NULL,
  write_nonce    TEXT,
  PRIMARY KEY (event_id, discord_id),
  CHECK ((character_name IS NULL) = (character_key IS NULL))
);
CREATE INDEX IF NOT EXISTS community_event_signups_member ON community_event_signups(discord_id);
CREATE INDEX IF NOT EXISTS community_event_signups_status ON community_event_signups(event_id, status);

CREATE TABLE IF NOT EXISTS community_event_changes (               -- edit history: action, who, when, which fields; no values
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  action   TEXT NOT NULL CHECK (action IN ('created', 'updated', 'cancelled')),
  actor    TEXT,                                                   -- NULL once that account is erased
  at       INTEGER NOT NULL,
  fields   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fields))
);
CREATE INDEX IF NOT EXISTS community_event_changes_event ON community_event_changes(event_id);
CREATE INDEX IF NOT EXISTS community_event_changes_actor ON community_event_changes(actor);

CREATE TABLE IF NOT EXISTS community_event_attendance (            -- recorded by an organizer after the start; missing = unknown
  event_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('present', 'absent', 'excused', 'unknown')),
  source      TEXT NOT NULL DEFAULT 'officer' CHECK (source IN ('officer', 'observed')), -- 'observed' reserved; no route accepts a source
  reason_code TEXT CHECK (reason_code IS NULL OR (reason_code IN ('late', 'left_early') AND state = 'present')),
  recorded_by TEXT,                                                -- NULL once the recorder's account is erased
  recorded_at INTEGER NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  write_nonce TEXT,
  PRIMARY KEY (event_id, discord_id)
);
CREATE INDEX IF NOT EXISTS community_event_attendance_member ON community_event_attendance(discord_id);
CREATE INDEX IF NOT EXISTS community_event_attendance_recorder ON community_event_attendance(recorded_by);
