-- Build .75 (1 Oct 2026): the contribution (tithe) ledger (worker/src/community-contributions.ts), ported from Olympus
-- Forever's contributions (eight tables, prefixed together). Integer copper; every amount sum the Worker forms is guarded
-- against the range a JavaScript number keeps exactly. A member row carries the random incarnation and the revision every
-- write compares; an obligation is one member's week under an immutable policy version; a receipt is one observed payment
-- (idempotent on source and source id); the allocation journal is append-only (a reversal is a negative row); horizons keep
-- purged weeks and observations from being recorded again; evidence is an officer's attestation of one week's payment
-- records; decisions are the dated staff facts about one week. Every personal row carries retain_until fixed from the
-- retention in force when it was written. Nothing here notifies, sanctions or changes a role. Unix seconds. The Worker
-- creates them itself (src/schema.ts); migrations/2026-10-01-community-contributions.sql is the record.
CREATE TABLE IF NOT EXISTS community_contribution_policies (
  version                TEXT PRIMARY KEY,
  amount_copper          INTEGER NOT NULL CHECK (amount_copper > 0),
  anchor_weekday         INTEGER NOT NULL CHECK (anchor_weekday BETWEEN 0 AND 6),
  anchor_hour_utc        INTEGER NOT NULL CHECK (anchor_hour_utc BETWEEN 0 AND 23),
  grace_hours            INTEGER NOT NULL CHECK (grace_hours >= 0),
  final_notice_days      INTEGER NOT NULL CHECK (final_notice_days >= 1),
  review_days            INTEGER NOT NULL CHECK (review_days >= 1),
  new_member_exempt_days INTEGER NOT NULL CHECK (new_member_exempt_days >= 0),
  created_at             INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_contribution_members (
  guild_scope  TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  incarnation  TEXT NOT NULL CHECK (length(incarnation) = 22),
  revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce        TEXT,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_scope, discord_id)
);
CREATE TABLE IF NOT EXISTS community_contribution_obligations (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_scope              TEXT NOT NULL,
  discord_id               TEXT NOT NULL,
  period_start             INTEGER NOT NULL,
  due_at                   INTEGER NOT NULL,
  policy_version           TEXT NOT NULL REFERENCES community_contribution_policies(version),
  amount_copper            INTEGER NOT NULL CHECK (amount_copper > 0),
  eligible                 INTEGER NOT NULL CHECK (eligible IN (0, 1)),
  state                    TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'exempt', 'disputed', 'resolved')),
  acknowledged_at          INTEGER,
  officer_contact_at       INTEGER,
  final_notice_at          INTEGER,
  final_acknowledged_at    INTEGER,
  final_officer_contact_at INTEGER,
  revision                 INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  facts_revision           INTEGER NOT NULL DEFAULT 1 CHECK (facts_revision >= 1),
  removal_case_id          TEXT,
  retain_until             INTEGER NOT NULL,
  op_nonce                 TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  UNIQUE (guild_scope, discord_id, period_start)
);
CREATE INDEX IF NOT EXISTS community_contribution_obligations_retain ON community_contribution_obligations(retain_until);
CREATE TABLE IF NOT EXISTS community_contribution_receipts (
  id                  TEXT PRIMARY KEY CHECK (length(id) = 22),
  guild_scope         TEXT NOT NULL,
  source              TEXT NOT NULL CHECK (source IN ('officer_manual', 'mail', 'bank_log')),
  source_id           TEXT NOT NULL,
  payload_hash        TEXT NOT NULL,
  payer_name          TEXT,
  amount_copper       INTEGER NOT NULL CHECK (amount_copper > 0),
  retired_copper      INTEGER NOT NULL DEFAULT 0 CHECK (retired_copper >= 0),
  observed_at         INTEGER NOT NULL,
  observer_discord_id TEXT,
  matched_discord_id  TEXT,
  status              TEXT NOT NULL CHECK (status IN ('matched', 'unmatched', 'disputed', 'rejected')),
  voided_at           INTEGER,
  retain_until        INTEGER NOT NULL,
  created_at          INTEGER NOT NULL,
  UNIQUE (guild_scope, source, source_id)
);
CREATE INDEX IF NOT EXISTS community_contribution_receipts_member ON community_contribution_receipts(guild_scope, matched_discord_id);
CREATE INDEX IF NOT EXISTS community_contribution_receipts_retain ON community_contribution_receipts(retain_until);
CREATE TABLE IF NOT EXISTS community_contribution_allocation_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id      TEXT NOT NULL,
  obligation_id   INTEGER NOT NULL,
  amount_copper   INTEGER NOT NULL CHECK (amount_copper <> 0),
  member_revision INTEGER NOT NULL,
  nonce           TEXT NOT NULL,
  actor           TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_contribution_allocation_events_receipt ON community_contribution_allocation_events(receipt_id);
CREATE INDEX IF NOT EXISTS community_contribution_allocation_events_week ON community_contribution_allocation_events(obligation_id);
CREATE TABLE IF NOT EXISTS community_contribution_horizons (
  guild_scope TEXT NOT NULL,
  kind        TEXT NOT NULL,
  horizon     INTEGER NOT NULL,
  PRIMARY KEY (guild_scope, kind)
);
CREATE TABLE IF NOT EXISTS community_contribution_evidence (
  guild_scope  TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('complete', 'partial', 'stale', 'unavailable')),
  attested_at  INTEGER NOT NULL,
  retain_until INTEGER NOT NULL,
  nonce        TEXT,
  PRIMARY KEY (guild_scope, period_start)
);
CREATE TABLE IF NOT EXISTS community_contribution_decisions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_scope     TEXT NOT NULL,
  discord_id      TEXT NOT NULL,
  obligation_id   INTEGER NOT NULL,
  action          TEXT NOT NULL,
  actor           TEXT NOT NULL,
  member_revision INTEGER NOT NULL,
  nonce           TEXT NOT NULL,
  at              INTEGER NOT NULL,
  retain_until    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_contribution_decisions_member ON community_contribution_decisions(guild_scope, discord_id);
CREATE INDEX IF NOT EXISTS community_contribution_decisions_retain ON community_contribution_decisions(retain_until);
