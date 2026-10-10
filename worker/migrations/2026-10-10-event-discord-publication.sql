-- Explicit organizer publication only. Unix seconds; no reminder scheduler or role authority.
CREATE TABLE IF NOT EXISTS community_event_deliveries (
  event_id TEXT NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose = 'publication'),
  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),
  starts_at INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),
  payload_hash TEXT,
  op_id TEXT NOT NULL CHECK (length(op_id) = 22),
  claim_nonce TEXT NOT NULL CHECK (length(claim_nonce) = 22),
  state TEXT NOT NULL CHECK (state IN ('claimed','posted','refused','unknown','removed')),
  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),
  actor TEXT,
  session_version INTEGER,
  session_expires INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  retain_until INTEGER NOT NULL,
  result_code TEXT,
  PRIMARY KEY (event_id,purpose)
);
CREATE INDEX IF NOT EXISTS community_event_deliveries_retain ON community_event_deliveries(retain_until);
