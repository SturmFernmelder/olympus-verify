-- 29 Sep 2026 (build .41): the guild site (guild.roachcouncil.com), Discord names for linked members, and the
-- reserved-name priority in the invite queue.
--
-- The Worker applies all of this itself on its first request after the deploy (src/schema.ts, idempotent), so running
-- this file is optional. If you do run it, run it once, BEFORE `npm run deploy`:
--   npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-29-guild-site.sql
-- A second run fails on the ALTERs with "duplicate column name" -- harmless.

ALTER TABLE members ADD COLUMN username TEXT;
ALTER TABLE members ADD COLUMN global_name TEXT;
ALTER TABLE members ADD COLUMN names_at INTEGER;
ALTER TABLE invite_queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS invite_queue_order ON invite_queue(status, priority, id);

CREATE TABLE IF NOT EXISTS site_users (
  discord_id      TEXT PRIMARY KEY,
  username        TEXT,
  global_name     TEXT,               -- Discord display name
  nick            TEXT,               -- nickname in SITE_GUILD_ID at the last check
  avatar          TEXT,               -- avatar hash on Discord's CDN (server avatar preferred)
  account_created INTEGER,            -- from the account id (a Discord snowflake)
  server_joined   INTEGER,            -- joined SITE_GUILD_ID
  first_login     INTEGER NOT NULL,
  last_login      INTEGER NOT NULL,
  checked_at      INTEGER,            -- last membership check (sign-in, or the bot's hourly re-check on a save)
  in_server       INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,   -- bumped on sign-out: every older session cookie stops working
  denied          INTEGER NOT NULL DEFAULT 0,   -- 1 = permanently denied (joke or abusive application)
  denied_reason   TEXT,
  denied_at       INTEGER,
  denied_by       TEXT
);

CREATE TABLE IF NOT EXISTS site_applications (
  discord_id  TEXT PRIMARY KEY,
  position    TEXT NOT NULL,          -- site-data.ts POSITIONS
  class_lead  TEXT,                   -- the class, for a Class Lead application
  fallback    INTEGER NOT NULL DEFAULT 1,  -- still wants a place as a member if not picked for this
  character   TEXT,                   -- main character as typed ("First Last")
  char_key    TEXT,
  class       TEXT,
  role        TEXT,                   -- tank | healer | dps
  region      TEXT,
  answers     TEXT NOT NULL,          -- JSON: the free-text answers (site-data.ts QUESTIONS)
  status      TEXT NOT NULL,          -- submitted | reviewing | accepted | declined | withdrawn
  admin_note  TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS site_applications_position ON site_applications(position, status);

-- Nominations for senior roles. Nobody but SITE_ADMINS ever sees a count.
CREATE TABLE IF NOT EXISTS site_votes (
  voter_id      TEXT NOT NULL,
  ballot        TEXT NOT NULL,        -- site-data.ts ballots(), e.g. officer or class_lead:mage
  slot          INTEGER NOT NULL,     -- 1..seats of that ballot
  nominee_kind  TEXT NOT NULL,        -- discord | name (someone not on Discord, typed by hand)
  nominee_key   TEXT NOT NULL,        -- Discord id, or the typed name normalized
  nominee_label TEXT NOT NULL,        -- as shown when chosen
  reason        TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (voter_id, ballot, slot)
);
CREATE INDEX IF NOT EXISTS site_votes_tally ON site_votes(ballot, nominee_kind, nominee_key);

CREATE TABLE IF NOT EXISTS site_friends (
  owner_id     TEXT NOT NULL,
  friend_kind  TEXT NOT NULL,         -- discord | name
  friend_key   TEXT NOT NULL,
  friend_label TEXT NOT NULL,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (owner_id, friend_kind, friend_key)
);
CREATE INDEX IF NOT EXISTS site_friends_friend ON site_friends(friend_kind, friend_key);

-- Character names people reserved in Blizzard's name reservation, entered on the site. An admin approves the ones
-- promised a seat; approved names go to the top of the invite queue at launch (site-queue.ts). The code whisper still
-- links Discord: a queue row never links anyone by itself.
CREATE TABLE IF NOT EXISTS site_reserved (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,          -- normalizeCharacter(name)
  status      TEXT NOT NULL,          -- claimed | approved | queued | in_guild | released
  created_at  INTEGER NOT NULL,
  approved_by TEXT,
  approved_at INTEGER,
  queue_id    INTEGER,                -- the invite_queue row carrying it
  queued_at   INTEGER,
  released_by TEXT,                   -- the owner, an admin, or 'system'
  released_at INTEGER
);
CREATE INDEX IF NOT EXISTS site_reserved_owner ON site_reserved(owner_id, status);
CREATE INDEX IF NOT EXISTS site_reserved_name ON site_reserved(name_key, status);
CREATE INDEX IF NOT EXISTS site_reserved_status ON site_reserved(status, id);

-- Admin-editable settings (reservation time, launch time, open/closed switches). Defaults live in site-data.ts.
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
