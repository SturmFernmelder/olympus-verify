-- Councillor browser attestation and durable one-effect role outcomes. Activation remains OFF.
CREATE TABLE IF NOT EXISTS councillor_keys (
 id TEXT PRIMARY KEY, signer TEXT NOT NULL, signer_guid TEXT NOT NULL, public_key TEXT NOT NULL,
 subject_generation TEXT NOT NULL, roster_id INTEGER NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, UNIQUE(signer,public_key));

CREATE TABLE IF NOT EXISTS councillor_challenges (
 nonce TEXT PRIMARY KEY, key_id TEXT NOT NULL REFERENCES councillor_keys(id), signer TEXT NOT NULL,
 session_version INTEGER NOT NULL, session_expires INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER,
 mode TEXT NOT NULL CHECK(mode IN('single','automatic')), max_proofs INTEGER NOT NULL CHECK(max_proofs IN(1,10)),
 proofs_used INTEGER NOT NULL DEFAULT 0 CHECK(proofs_used>=0 AND proofs_used<=max_proofs));

CREATE TABLE IF NOT EXISTS verification_requests (
 code TEXT PRIMARY KEY, requester TEXT NOT NULL, subject_generation TEXT,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','proved','expired')),
 session_version INTEGER, session_expires INTEGER);

CREATE TABLE IF NOT EXISTS verification_proofs (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE REFERENCES verification_requests(code),
 challenge TEXT NOT NULL REFERENCES councillor_challenges(nonce), signer TEXT NOT NULL,
 key_id TEXT NOT NULL REFERENCES councillor_keys(id), requester TEXT NOT NULL,
 requester_guid TEXT NOT NULL, requester_name TEXT NOT NULL, native_rank INTEGER NOT NULL, rank_name TEXT NOT NULL, native_profile TEXT NOT NULL,
 signer_guid TEXT NOT NULL, snapshot_id INTEGER NOT NULL, subject_generation TEXT,
 digest TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS role_settlements (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, purpose TEXT NOT NULL,
 proof_id TEXT, guild_id TEXT NOT NULL, role_id TEXT NOT NULL, desired INTEGER NOT NULL CHECK(desired IN(0,1)),
 state TEXT NOT NULL CHECK(state IN('pending','dispatching','settled','held','unknown')),
 reason TEXT NOT NULL, claim_nonce TEXT, subject_generation TEXT, request_digest TEXT,
 roster_id INTEGER, native_guid TEXT, native_profile TEXT, native_rank INTEGER, native_rank_name TEXT,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts IN(0,1)),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, checked_at INTEGER,
 UNIQUE(proof_id,role_id,desired));

CREATE INDEX IF NOT EXISTS qr_request_subject ON verification_requests(requester,expires_at);

CREATE INDEX IF NOT EXISTS qr_key_subject ON councillor_keys(signer,revoked_at);

CREATE INDEX IF NOT EXISTS role_settlement_subject ON role_settlements(subject,state);
