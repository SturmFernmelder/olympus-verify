-- Build .69 (1 October 2026): restriction cases, watch-list and member-level period (worker/src/community-restrictions.ts). The
-- Worker applies the same statements itself at first request (src/schema.ts); this file is the record. Additive only.

-- Build .69 (1 Oct 2026): restriction cases, their watch-list and the member-level retention period (worker/src/community-restrictions.ts),
-- ported from Olympus Forever's restriction_cases / restriction_case_characters on the keeper's contract: staff records and
-- review evidence only, no role, admission or site effect. A case is about a Discord id and survives the member's erasure
-- while active (like the bot's ban reason); its acknowledgement does not. Unix seconds. The Worker creates these itself
-- (src/schema.ts); migrations/2026-10-01-community-restrictions.sql holds the same statements.
CREATE TABLE IF NOT EXISTS community_restriction_cases (
  id              TEXT PRIMARY KEY CHECK (length(id) = 22),  -- the staff page's operation id: a retried create applies once
  discord_id      TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('ban', 'conduct_removal', 'tithe_removal')),
  set_by          TEXT NOT NULL,                             -- 'erased' once that staff member's account is erased
  set_at          INTEGER NOT NULL,
  review_at       INTEGER NOT NULL,
  expires_at      INTEGER,                                   -- NULL only for a ban, which has a review date instead
  appeal_status   TEXT NOT NULL DEFAULT 'none' CHECK (appeal_status IN ('none', 'requested', 'upheld', 'overturned')),
  review_outcome  TEXT CHECK (review_outcome IN ('continued', 'lifted')),
  reviewed_at     INTEGER,
  reviewed_by     TEXT,
  acknowledged_at INTEGER,                                   -- an officer recorded that the member's return was reviewed
  acknowledged_by TEXT,
  resolved_at     INTEGER,
  resolved_by     TEXT,
  updated_at      INTEGER NOT NULL,
  updated_by      TEXT,
  retain_until    INTEGER,                                   -- the expiry; a resolution sets 30 days on; NULL for an unresolved ban
  incarnation     TEXT NOT NULL,                             -- random per row: a decision never lands on a row that reused the id
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce           TEXT,
  CHECK ((category = 'ban') = (expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS community_restriction_cases_member ON community_restriction_cases(discord_id);
CREATE INDEX IF NOT EXISTS community_restriction_cases_review ON community_restriction_cases(review_at);
CREATE INDEX IF NOT EXISTS community_restriction_cases_retain ON community_restriction_cases(retain_until);

-- The watch-list: the case member's own characters as the keeper's `characters` held them at the addition (exact
-- provenance: the proof key, the full name, the pinned GUID), added only by an explicit staff action. Review at most 90
-- days after the addition or the last documented renewal; expiry at the member's period deadline, capped at the case's.
CREATE TABLE IF NOT EXISTS community_restriction_characters (
  case_id         TEXT NOT NULL,
  character_key   TEXT NOT NULL CHECK (length(character_key) BETWEEN 2 AND 160),  -- the community key (full name)
  character_name  TEXT NOT NULL CHECK (length(character_name) BETWEEN 2 AND 40),
  proof_key       TEXT NOT NULL,                             -- the keeper's characters.name_key
  guid            TEXT,                                      -- characters.guid as pinned at the addition
  added_at        INTEGER NOT NULL,
  added_by        TEXT,
  review_at       INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  renewed_at      INTEGER,
  renewed_by      TEXT,
  renewal_reason  TEXT CHECK (renewal_reason IN ('ongoing_risk', 'appeal_pending', 'repeat_return')),
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CHECK (review_at >= added_at AND review_at <= expires_at),
  CHECK ((renewed_at IS NULL) = (renewal_reason IS NULL)),
  PRIMARY KEY (case_id, character_key)
);
CREATE INDEX IF NOT EXISTS community_restriction_characters_key ON community_restriction_characters(proof_key);
CREATE INDEX IF NOT EXISTS community_restriction_characters_expiry ON community_restriction_characters(expires_at);

-- PRIV-4 in the keeper's form: ONE watch-list retention period per MEMBER (12 months from the first addition or the
-- last documented renewal), alive while any unresolved case of theirs exists. No per-row or per-case clock can restart it.
CREATE TABLE IF NOT EXISTS community_restriction_periods (
  discord_id      TEXT PRIMARY KEY,
  opened_at       INTEGER NOT NULL,
  retain_until    INTEGER NOT NULL,
  renewed_at      INTEGER,
  renewal_reason  TEXT CHECK (renewal_reason IN ('ongoing_risk', 'appeal_pending', 'repeat_return')),
  nonce           TEXT
);
