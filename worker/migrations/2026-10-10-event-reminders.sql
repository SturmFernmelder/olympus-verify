-- One organizer-opted sixty-minute reminder; same finite parent retention clock.
ALTER TABLE community_events ADD COLUMN reminder_closed INTEGER NOT NULL DEFAULT 0 CHECK (reminder_closed IN (0, 1));
CREATE TABLE IF NOT EXISTS community_event_reminders (
  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,
  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),
  starts_at INTEGER NOT NULL,
  actor TEXT,
  consent_version INTEGER,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  host TEXT NOT NULL,
  op_id TEXT NOT NULL CHECK (length(op_id) = 22),
  claim_nonce TEXT,
  state TEXT NOT NULL CHECK (state IN ('armed','claimed','posted','refused','unknown','cancelled','removed')),
  message_id TEXT,
  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),
  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  retain_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_event_reminders_due ON community_event_reminders(state,last_attempt_at,starts_at,event_id);
