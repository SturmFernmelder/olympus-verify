-- Build .50 (1 October 2026): /verify-status tells everyone who ever linked Battle.net how the copy of their BattleTag
-- that earlier builds pushed into Discord's own connection record goes away (bnet-retention.ts everLinked). The audit
-- keeps the fact of a link after the tag itself is purged; this index makes that one read cheap.
-- The Worker applies the same statement itself at first request (src/schema.ts); this file is the record.
CREATE INDEX IF NOT EXISTS audit_actor_action ON audit(actor, action);
