-- Build .76 (1 Oct 2026): where the departure intake's bounded scan stopped (worker/src/community-departures.ts), so the
-- next cron run continues from there and a long run of candidates the site cannot record never starves a later valid
-- departure; kept when a run ends at its bounds, cleared once a run scans to the end. One row: one shared operational
-- cursor (a departure time and a character name key), no Discord account ID. The Worker creates it itself (src/schema.ts);
-- migrations/2026-10-01-community-departure-scan.sql is the record.
CREATE TABLE IF NOT EXISTS community_departure_scan (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  left_at    INTEGER NOT NULL,
  name_key   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
