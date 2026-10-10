-- .130: apply once to an existing calendar; the Worker probes/adds this column automatically.
-- No message/actor data is retained here. An expired unresolved publication cannot authorize a new POST.
ALTER TABLE community_events ADD COLUMN publication_closed INTEGER NOT NULL DEFAULT 0 CHECK (publication_closed IN (0, 1));
