-- Build .82 (1 Oct 2026): the private request intake (worker/src/community-privacy-intake.ts), ported from Olympus
-- Forever's privacy_cases/privacy_case_messages/privacy_case_operations. A case is a manually handled private
-- conversation for someone who can no longer reach Discord: no sign-in, no email, no IP; the requester holds a
-- browser-generated case id and code (only the code's SHA-256 is stored); it never proves who owns an account and never
-- exports, deletes or changes anything by itself. Retention is fixed per case at creation (retention_days) and
-- retain_until is the effective cutoff by the database clock; the cleanup cron deletes expired cases. The operations
-- table keys each staff action by the id the admin page generates so a replay never reapplies. Unix seconds. The Worker
-- creates them itself (src/schema.ts); migrations/2026-10-01-community-privacy-intake.sql is the record.
CREATE TABLE IF NOT EXISTS community_privacy_cases (
  case_id        TEXT PRIMARY KEY CHECK (length(case_id) = 22),
  code_hash      TEXT NOT NULL CHECK (length(code_hash) = 64),
  payload_hash   TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('access', 'deletion', 'correction', 'objection', 'other')),
  subject_hint   TEXT CHECK (subject_hint IS NULL OR length(subject_hint) <= 64),
  character_hint TEXT CHECK (character_hint IS NULL OR length(character_hint) <= 64),
  status         TEXT NOT NULL CHECK (status IN ('received', 'in_review', 'needs_verification', 'completed', 'declined')),
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  retain_until   INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  closed_at      INTEGER
);
CREATE INDEX IF NOT EXISTS community_privacy_cases_retain ON community_privacy_cases(retain_until);
CREATE INDEX IF NOT EXISTS community_privacy_cases_created ON community_privacy_cases(created_at);
CREATE INDEX IF NOT EXISTS community_privacy_cases_open ON community_privacy_cases(closed_at);
CREATE TABLE IF NOT EXISTS community_privacy_messages (
  case_id    TEXT NOT NULL,
  message_id TEXT NOT NULL CHECK (length(message_id) = 22),
  author     TEXT NOT NULL CHECK (author IN ('requester', 'staff')),
  text       TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  text_hash  TEXT NOT NULL,
  nonce      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (case_id, message_id)
);
CREATE INDEX IF NOT EXISTS community_privacy_messages_order ON community_privacy_messages(case_id, created_at);
CREATE TABLE IF NOT EXISTS community_privacy_operations (
  case_id      TEXT NOT NULL,
  op_id        TEXT NOT NULL CHECK (length(op_id) = 22),
  payload_hash TEXT NOT NULL,
  nonce        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (case_id, op_id)
);
