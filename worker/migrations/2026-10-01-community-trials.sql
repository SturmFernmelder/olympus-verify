-- Build .61 (1 October 2026): trial reviews (worker/src/community-trials.ts). The Worker applies the same statement itself at
-- first request (src/schema.ts); this file is the record. Additive only.

-- Build .61 (1 Oct 2026): trial reviews (worker/src/community-trials.ts), ported from Olympus Forever's trial_reviews.
-- A staff record about a member (start, review due, extended, passed or ended with a fixed reason); descriptive only:
-- nothing here changes a role, membership or admission. Opened only for an account that has signed in here; erasure
-- deletes the member's trials and anonymizes them as sponsor, creator or reviewer; a concluded trial goes 30 days after
-- its conclusion, an open one 30 days after its review was due (retain_until). Unix seconds. Same as
-- migrations/2026-10-01-community-trials.sql; the Worker creates it itself.
CREATE TABLE IF NOT EXISTS community_trials (
  id                 TEXT PRIMARY KEY CHECK (length(id) = 22),   -- the creating operation's id
  op_id              TEXT NOT NULL,
  op_hash            TEXT,                                        -- what the create wrote, hashed: a replay is compared with this
  discord_id         TEXT NOT NULL,                               -- the member on trial
  sponsor_discord_id TEXT,                                        -- never the member; NULL once that account is erased
  started_at         INTEGER NOT NULL,
  review_due_at      INTEGER NOT NULL CHECK (review_due_at > started_at),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'passed', 'ended')),
  outcome_reason     TEXT,                                        -- review_passed | withdrew | inactive | staff_decision
  concluded_at       INTEGER,
  created_by         TEXT,                                        -- the admin; NULL once erased
  updated_by         TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  incarnation        TEXT NOT NULL,                               -- random per row: a decision never lands on a row that reused the id
  revision           INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce              TEXT,                                        -- per write: admits the audit row
  retain_until       INTEGER NOT NULL,
  CHECK ((status IN ('active', 'extended') AND outcome_reason IS NULL AND concluded_at IS NULL)
      OR (status = 'passed' AND COALESCE(outcome_reason, '') = 'review_passed' AND concluded_at IS NOT NULL)
      OR (status = 'ended' AND COALESCE(outcome_reason, '') IN ('withdrew', 'inactive', 'staff_decision') AND concluded_at IS NOT NULL)),
  CHECK (sponsor_discord_id IS NULL OR sponsor_discord_id <> discord_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS community_trials_open ON community_trials(discord_id) WHERE status IN ('active', 'extended');
CREATE INDEX IF NOT EXISTS community_trials_member ON community_trials(discord_id);
CREATE INDEX IF NOT EXISTS community_trials_due ON community_trials(review_due_at);
CREATE INDEX IF NOT EXISTS community_trials_retain ON community_trials(retain_until);
CREATE INDEX IF NOT EXISTS community_trials_sponsor ON community_trials(sponsor_discord_id);
