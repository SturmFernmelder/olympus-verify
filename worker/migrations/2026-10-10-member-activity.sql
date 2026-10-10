-- Operational account activity time, separate from Blizzard-derived data retention.
-- Runtime zero-row probe makes this one-time ALTER idempotent at the migration boundary.
ALTER TABLE members ADD COLUMN activity_at INTEGER;
