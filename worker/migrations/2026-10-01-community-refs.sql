-- Build .56 (1 October 2026): first table of the community modules ported from Olympus Forever (worker/src/community-*.ts: ).
-- One opaque, random, stable reference per member, shown to other members instead of a Discord id. Created inside the
-- member's first admitted community write; deleted with the account. The Worker applies the same statement itself at
-- first request (src/schema.ts); this file is the record. Additive only.
CREATE TABLE IF NOT EXISTS community_refs (
  discord_id TEXT PRIMARY KEY,
  ref        TEXT NOT NULL UNIQUE CHECK (length(ref) = 22),
  created_at INTEGER NOT NULL
);
