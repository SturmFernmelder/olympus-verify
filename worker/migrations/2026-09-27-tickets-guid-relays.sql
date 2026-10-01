-- 27 Sep 2026: request codes, GUID-pinned links, relay presence.
--
-- The Worker applies these itself on its first request after the deploy (src/schema.ts, idempotent), so running this
-- file is optional. If you do run it, run it once, BEFORE `npm run deploy`:
--   npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-27-tickets-guid-relays.sql
-- A second run fails on the two ALTERs with "duplicate column name" -- harmless.

ALTER TABLE pending ADD COLUMN nonce TEXT;
CREATE INDEX IF NOT EXISTS pending_nonce ON pending(nonce, consumed_at);

ALTER TABLE characters ADD COLUMN guid TEXT;

CREATE TABLE IF NOT EXISTS relays (
  officer_id     TEXT PRIMARY KEY,
  character      TEXT NOT NULL,
  online         INTEGER NOT NULL DEFAULT 0,
  seen_at        INTEGER NOT NULL,
  changed_at     INTEGER NOT NULL,
  version        TEXT,
  addon          TEXT
);
