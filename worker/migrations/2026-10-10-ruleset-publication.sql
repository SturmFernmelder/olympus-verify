CREATE TABLE IF NOT EXISTS ruleset_publications (
 guild_id TEXT NOT NULL, publication_id TEXT NOT NULL, target_key TEXT NOT NULL,
 selection_revision INTEGER NOT NULL, profile_revision TEXT NOT NULL, plan_hash TEXT NOT NULL,
 actor TEXT, actor_generation TEXT, session_version INTEGER, session_expires INTEGER,
 parent_id TEXT, channel_id TEXT, message_id TEXT, frozen_payload TEXT, payload_hash TEXT, record_hash TEXT,
 claim_nonce TEXT, stage TEXT NOT NULL CHECK(stage IN('selection','pending','create','edit','pin')),
 state TEXT NOT NULL CHECK(state IN('selected','pending','claimed','unknown','known','applied','refused','superseded','held')),
 result_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, actor_retain_until INTEGER NOT NULL,
 PRIMARY KEY(guild_id,publication_id,target_key)
);
