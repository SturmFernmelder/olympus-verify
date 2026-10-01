-- Build .70 (1 October 2026): departure review items (worker/src/community-departures.ts). The Worker applies the same
-- statements itself at first request (src/schema.ts); this file is the record. Additive only.

-- Build .70 (1 Oct 2026): departure review items (worker/src/community-departures.ts), ported from Olympus Forever's
-- departure_reviews. One bounded staff review item per confirmed departure (the keeper's own characters.status 'left'
-- with its left_at) of an account that has signed in here; a kick or a leave as the keeper's own audit row says, else
-- unknown. Nothing here changes a role, membership or a case by itself; an admin may acknowledge the item or open a
-- restriction case from it. 30 days after the departure the item is gone (retain_until, the effective cutoff). Unix
-- seconds. The Worker creates it itself (src/schema.ts); migrations/2026-10-01-community-departures.sql is the record.
CREATE TABLE IF NOT EXISTS community_departure_reviews (
  id                  TEXT PRIMARY KEY CHECK (length(id) = 22),   -- random, never reused: also the row's incarnation
  discord_id          TEXT NOT NULL,
  character_key       TEXT NOT NULL CHECK (length(character_key) BETWEEN 2 AND 160),   -- the community key (full name)
  character_name      TEXT NOT NULL CHECK (length(character_name) BETWEEN 2 AND 40),
  proof_key           TEXT NOT NULL,                              -- the keeper's characters.name_key
  kind                TEXT NOT NULL CHECK (kind IN ('left', 'removed', 'unknown')),
  observed_at         INTEGER NOT NULL,                           -- characters.left_at
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'restriction_opened')),
  restriction_case_id TEXT,
  reviewed_by         TEXT,                                       -- NULL once that admin's account is erased
  reviewed_at         INTEGER,
  created_at          INTEGER NOT NULL,
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce               TEXT,
  retain_until        INTEGER NOT NULL,
  CHECK ((status = 'open') = (reviewed_at IS NULL)),
  CHECK ((status = 'restriction_opened') = (restriction_case_id IS NOT NULL)),
  UNIQUE (discord_id, proof_key, observed_at)
);
CREATE INDEX IF NOT EXISTS community_departure_reviews_status ON community_departure_reviews(status, observed_at);
CREATE INDEX IF NOT EXISTS community_departure_reviews_retain ON community_departure_reviews(retain_until);
