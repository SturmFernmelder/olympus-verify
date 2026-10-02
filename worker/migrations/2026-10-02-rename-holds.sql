-- Build .114 (2 October 2026, Viktor's item 9): renames Blizzard required (src/rename-review.ts). A site administrator
-- marks a roster rename as required by Blizzard; the account must apply again and its Guild Member grants are held
-- (src/roles.ts) while a row is in state 'reapply'. Closed rows go thirty days after closing (the cron).
-- The Worker applies the same statements itself at first request (src/schema.ts); this file is the record.
CREATE TABLE IF NOT EXISTS rename_holds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id  TEXT NOT NULL,
  old_name    TEXT NOT NULL,
  new_name    TEXT NOT NULL,
  char_key    TEXT NOT NULL,
  guid        TEXT,
  nonce       TEXT NOT NULL,
  audit_id    INTEGER,
  state       TEXT NOT NULL CHECK (state IN ('reapply', 'approved', 'cancelled')),
  decided_by  TEXT NOT NULL,
  decided_at  INTEGER NOT NULL,
  closed_by   TEXT,
  closed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS rename_holds_account ON rename_holds(discord_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS rename_holds_audit ON rename_holds(audit_id) WHERE audit_id IS NOT NULL;
