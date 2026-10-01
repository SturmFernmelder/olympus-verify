-- Build .47 (30 Sep 2026): replay ledger for signed Discord interactions. The Worker applies this itself at first request
-- (src/schema.ts); running it by hand first is harmless. `response` holds the handler's answer so a repeated id is
-- answered with it (Codex review of d326709); NULL while the first run is in flight.
CREATE TABLE IF NOT EXISTS seen_interactions (
  id             TEXT PRIMARY KEY,
  seen_at        INTEGER NOT NULL,
  response       TEXT
);
CREATE INDEX IF NOT EXISTS seen_interactions_at ON seen_interactions(seen_at);
