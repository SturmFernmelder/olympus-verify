-- Build .115, third review round (3 October 2026; Codex's finding A of 16:48 UTC): a roster export's member effects as a
-- durable, resumable worklist (src/roster-effects.ts, src/roster.ts). Before, a complete roster of members who had all just
-- verified needed about 4,000 statement attempts in one invocation (D1 allows 1,000 on Workers Paid) and failed partway,
-- after the snapshot was already stamped complete. roster_effect_runs holds one run per complete snapshot's diff (created
-- in the stamp's transaction) with when it was derived, how many items it had, when its backlog was empty and whether a
-- newer run took over first; roster_effects holds the pending items (a promotion, an officer's D: note, a confirmed
-- departure), each done in the transaction of its database change and removed when its slice ends. Unix seconds.
-- The Worker applies the same statements itself at its first request (src/schema.ts); this file is the record. Additive
-- only. The database goes from 49 to 51 tables.
CREATE TABLE IF NOT EXISTS roster_effect_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id      INTEGER NOT NULL,
  prev_snapshot_id INTEGER,
  removals         INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  derived_at       INTEGER,
  items            INTEGER,
  done_at          INTEGER,
  superseded_at    INTEGER
);
CREATE TABLE IF NOT EXISTS roster_effects (
  run_id     INTEGER NOT NULL,
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('promote', 'note', 'depart')),
  name_key   TEXT NOT NULL,
  name       TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  guid       TEXT,
  done_at    INTEGER,
  claim      TEXT,
  PRIMARY KEY (run_id, seq)
);
