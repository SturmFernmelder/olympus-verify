-- One-time old-schema supplement. Cold canonical schema already has this column;
-- runtime ensureSchema uses a zero-row probe and guarded ALTER, including duplicate-column races.
ALTER TABLE roster_effects ADD COLUMN subject_generation TEXT;
