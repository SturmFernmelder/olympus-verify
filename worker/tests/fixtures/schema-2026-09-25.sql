-- Frozen copy of schema.sql as deployed on 25 Sep 2026 (build .37): tests/tickets_guid_relays_test.cjs checks that src/schema.ts brings it up to date.
-- olympus-verify D1 schema. Apply with: wrangler d1 execute olympus-verify --file=schema.sql
-- Names are stored normalized (ASCII-lowercased, realm stripped) in *_key columns; display forms are kept alongside.

CREATE TABLE IF NOT EXISTS members (
  discord_id     TEXT PRIMARY KEY,
  discord_name   TEXT,
  battletag      TEXT,            -- from the Discord `connections` scope (type battlenet, verified)
  bnet_conn_id   TEXT,            -- Discord's id for that connection
  linked_at      INTEGER,         -- unix seconds
  banned         INTEGER NOT NULL DEFAULT 0,   -- 1 = refuse re-link and admission
  ban_reason     TEXT,
  bnet_account_id TEXT,           -- Phase 3: Battle.net OAuth account id (wow.profile)
  bnet_linked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS members_battletag ON members(battletag) WHERE battletag IS NOT NULL;

-- One character name binds to at most one Discord identity (Phase 4 rule). Rebinding needs an officer unbind.
CREATE TABLE IF NOT EXISTS characters (
  name_key       TEXT PRIMARY KEY,   -- normalized
  name           TEXT NOT NULL,      -- as first seen in game / as typed
  discord_id     TEXT NOT NULL REFERENCES members(discord_id),
  status         TEXT NOT NULL,      -- pending | verified | queued | member | left | unbound
  bound_at       INTEGER NOT NULL,
  verified_at    INTEGER,
  member_since   INTEGER,
  left_at        INTEGER,
  source         TEXT                -- whisper | mail | api
);
CREATE INDEX IF NOT EXISTS characters_discord ON characters(discord_id);

-- /verify requests. The code itself is never stored: it is recomputed from VERIFY_SECRET + name + day.
CREATE TABLE IF NOT EXISTS pending (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id     TEXT NOT NULL,
  name_key       TEXT NOT NULL,
  name           TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  consumed_at    INTEGER,
  consumed_source TEXT
);
CREATE INDEX IF NOT EXISTS pending_name ON pending(name_key, consumed_at);

-- Invites the addon should fire on its next flush (written to OlympusQueue.lua by the watcher).
CREATE TABLE IF NOT EXISTS invite_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name_key       TEXT NOT NULL,
  name           TEXT NOT NULL,
  discord_id     TEXT NOT NULL,
  note           TEXT,               -- public note text the addon sets after they join (Discord ID)
  status         TEXT NOT NULL,      -- queued | written | invited | joined | expired | cancelled | declined
                                     -- 'declined' is terminal on purpose: only re-running /verify makes a new row
  created_at     INTEGER NOT NULL,
  written_at     INTEGER,
  invited_at     INTEGER,
  joined_at      INTEGER,
  approved_by    TEXT,               -- Discord ID of the officer (review mode) or 'auto'
  claimed_by     TEXT,               -- which officer's watcher currently holds this row (see migrations/2026-09-18-officer-claims.sql)
  claimed_at     INTEGER,            -- refreshed on every poll; a claim older than QUEUE_CLAIM_TTL_MINUTES is up for grabs
  attempts       INTEGER NOT NULL DEFAULT 0,  -- refusals that are the applicant's to fix; a full guild does not count
  retry_after    INTEGER,            -- getQueue skips the row until this time; a hard refusal backs off instead of retrying
  last_reason    TEXT,               -- refusalCode() in ingest.ts: guild_full | in_another_guild | offline | declined | other
  last_reason_at INTEGER             -- when that reason was recorded; /verify-status reads both back to the applicant
);
CREATE INDEX IF NOT EXISTS invite_queue_status ON invite_queue(status);
CREATE INDEX IF NOT EXISTS invite_queue_claim ON invite_queue(status, claimed_by, claimed_at);

-- Full roster exports from the addon's SavedVariables (or, Phase 3, the guild API). Newest wins.
CREATE TABLE IF NOT EXISTS roster_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  exported_at    INTEGER NOT NULL,   -- addon time() at export
  received_at    INTEGER NOT NULL,
  source         TEXT NOT NULL,      -- addon | api
  member_count   INTEGER NOT NULL,
  content_hash   TEXT                -- fingerprint of who/rank/note; an identical export reuses this row instead of rewriting every member
);
CREATE TABLE IF NOT EXISTS roster_members (
  snapshot_id    INTEGER NOT NULL REFERENCES roster_snapshots(id) ON DELETE CASCADE,
  name_key       TEXT NOT NULL,
  name           TEXT NOT NULL,
  rank           TEXT,
  rank_index     INTEGER,
  level          INTEGER,
  class          TEXT,
  public_note    TEXT,
  officer_note   TEXT,
  guid           TEXT,
  last_online    INTEGER,
  PRIMARY KEY (snapshot_id, name_key)
);

-- When each character first appeared on an exported roster (see migrations/2026-09-25-first-seen.sql). The game gives
-- addons no join date; this is what the unverified-removal grace period is measured from.
CREATE TABLE IF NOT EXISTS roster_first_seen (
  name_key   TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  actor          TEXT NOT NULL,      -- discord id, 'watcher', 'system', 'cron'
  action         TEXT NOT NULL,
  subject        TEXT,               -- character name / discord id
  details        TEXT                -- JSON
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts);

-- Phase 3: characters reported by the Battle.net profile API for a linked account.
CREATE TABLE IF NOT EXISTS bnet_characters (
  discord_id     TEXT NOT NULL,
  character_id   TEXT NOT NULL,
  name           TEXT NOT NULL,
  realm_or_ruleset TEXT,
  level          INTEGER,
  fetched_at     INTEGER NOT NULL,
  PRIMARY KEY (discord_id, character_id)
);
