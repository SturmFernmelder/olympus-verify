-- Build .62 (1 October 2026): a watcher that cannot tell whether the officer's client is in the world omits `online`
-- (watcher 0.6.5, the v3 proposal's presence repair). The Worker records that sighting and marks the relay's presence
-- unknown from then until a report states it; while marked, the relay is neither online nor "known" (src/relays.ts).
-- The Worker applies the same statement itself at first request (src/schema.ts); this file is the record. Additive only.
ALTER TABLE relays ADD COLUMN unknown_since INTEGER;
