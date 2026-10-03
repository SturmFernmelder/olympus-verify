-- Build .115 (3 October 2026, Viktor's item B of 2 October): whether Olympus I has room (src/guild-seats.ts). A roster
-- snapshot records whether its export was trusted against the last trusted one (1, 0, or NULL while unchecked), whether
-- all of its member rows are in (NULL before .115, 0 while they are written, 1 once all are in), and when that exact
-- roster first arrived (received_at moves with every identical re-export). src/roster.ts writes them; the seat count
-- reads only a complete, trusted, fresh latest snapshot.
-- Item A of the same day: News (src/site-news.ts). site_news_notices holds the plain-text notices administrators post
-- for the whole guild, each living 1 to 90 days from posting; site_news_ops records every create for 120 days, also after
-- its notice is deleted or expired, so a stale retry cannot post it again. The cron deletes both when their time is up
-- (an operation record never while its notice exists). Unix seconds.
-- Item C of the same day changes no schema: once, at its first request, the Worker rewrites the site.settings audit rows
-- written before .115 to role keys and counts (src/schema.ts redactSettingsAudit, marked by the site_settings row
-- auditTypedNames). That rewrite is deliberately not in this file: run by hand ahead of the deploy, it would set the
-- marker while .114 still writes typed names into the log.
-- The Worker applies the same statements itself at its first request (src/schema.ts); this file is the record. Its ALTER
-- TABLE lines fail harmlessly ("duplicate column name") once the Worker has migrated itself; never run it after the
-- deploy. Additive only. The database goes from 47 to 49 tables.
ALTER TABLE roster_snapshots ADD COLUMN trusted INTEGER;
ALTER TABLE roster_snapshots ADD COLUMN complete INTEGER;
ALTER TABLE roster_snapshots ADD COLUMN first_received_at INTEGER;
CREATE INDEX IF NOT EXISTS roster_snapshots_first ON roster_snapshots(first_received_at);
CREATE TABLE IF NOT EXISTS site_news_notices (
  id           TEXT PRIMARY KEY CHECK (length(id) = 22),
  op_hash      TEXT NOT NULL,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce        TEXT,
  created_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_by   TEXT,
  updated_at   INTEGER NOT NULL,
  retain_until INTEGER NOT NULL,
  CHECK (retain_until > created_at AND retain_until <= created_at + 7776000)
);
CREATE INDEX IF NOT EXISTS site_news_notices_order ON site_news_notices(created_at);
CREATE INDEX IF NOT EXISTS site_news_notices_retain ON site_news_notices(retain_until);
CREATE INDEX IF NOT EXISTS site_news_notices_created_by ON site_news_notices(created_by);
CREATE INDEX IF NOT EXISTS site_news_notices_updated_by ON site_news_notices(updated_by);
CREATE TABLE IF NOT EXISTS site_news_ops (
  id          TEXT PRIMARY KEY CHECK (length(id) = 22),
  nonce       TEXT NOT NULL,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  purge_after INTEGER NOT NULL CHECK (purge_after > created_at)
);
CREATE INDEX IF NOT EXISTS site_news_ops_purge ON site_news_ops(purge_after);
CREATE INDEX IF NOT EXISTS site_news_ops_created_by ON site_news_ops(created_by);
