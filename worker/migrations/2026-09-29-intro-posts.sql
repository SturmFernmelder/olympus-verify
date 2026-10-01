-- 29 Sep 2026 (build .39): the bot's pinned channel intros in Asmongold's server (src/intros.ts).
--
-- The Worker creates these itself on its first request after the deploy (src/schema.ts, idempotent), so running this
-- file is optional. Running it more than once is harmless:
--   npx wrangler d1 execute olympus-verify --remote --file=migrations/2026-09-29-intro-posts.sql

CREATE TABLE IF NOT EXISTS intro_posts (
  guild_id       TEXT NOT NULL,
  intro_key      TEXT NOT NULL,
  parent_id      TEXT NOT NULL,        -- the configured channel or forum (INTROS_CHANNELS)
  channel_id     TEXT NOT NULL,        -- where the message lives: that channel, or the forum post
  message_id     TEXT NOT NULL,
  hash           TEXT NOT NULL,
  posted_at      INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (guild_id, intro_key)
);

-- One refresh at a time per server; a lock older than two minutes is taken over (a crashed run frees itself).
CREATE TABLE IF NOT EXISTS intro_locks (
  guild_id       TEXT PRIMARY KEY,
  holder         TEXT NOT NULL,
  until          INTEGER NOT NULL
);
