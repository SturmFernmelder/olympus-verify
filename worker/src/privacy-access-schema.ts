/** Identify-only privacy admission. Separate from ordinary site sessions and the dormant .129 foundation. */
export const PRIVACY_ACCESS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS privacy_access_oauth(
    state_hash TEXT NOT NULL PRIMARY KEY CHECK(length(state_hash)=64 AND state_hash NOT GLOB '*[^0-9a-f]*'),
    browser_hash TEXT NOT NULL CHECK(length(browser_hash)=64 AND browser_hash NOT GLOB '*[^0-9a-f]*'),
    purpose TEXT NOT NULL CHECK(purpose='privacy_identify'),
    created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER,
    CHECK(expires_at=created_at+300)
  )`,
  `CREATE INDEX IF NOT EXISTS privacy_access_oauth_expiry ON privacy_access_oauth(expires_at)`,
  `CREATE TABLE IF NOT EXISTS privacy_access_grants(
    session_hash TEXT NOT NULL CHECK(length(session_hash)=64 AND session_hash NOT GLOB '*[^0-9a-f]*'),
    purpose TEXT NOT NULL CHECK(purpose IN('own_export','own_erasure')),
    grant_id TEXT NOT NULL UNIQUE CHECK(length(grant_id)=32 AND grant_id NOT GLOB '*[^0-9a-f]*'),
    csrf_hash TEXT NOT NULL CHECK(length(csrf_hash)=64 AND csrf_hash NOT GLOB '*[^0-9a-f]*'),
    subject_id TEXT NOT NULL CHECK(length(subject_id) BETWEEN 17 AND 20 AND subject_id NOT GLOB '*[^0-9]*'),
    subject_generation TEXT,state TEXT,revision INTEGER,
    erasure_operation TEXT CHECK(erasure_operation IS NULL OR (length(erasure_operation)=32 AND erasure_operation NOT GLOB '*[^0-9a-f]*')),
    created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER,
    PRIMARY KEY(session_hash,purpose),CHECK(expires_at=created_at+720),
    CHECK((subject_generation IS NULL AND state IS NULL AND revision IS NULL) OR
      (subject_generation IS NOT NULL AND length(subject_generation)=32 AND subject_generation NOT GLOB '*[^0-9a-f]*'
      AND state IN('active','retiring','retired') AND revision IS NOT NULL AND revision>=0))
  )`,
  `CREATE INDEX IF NOT EXISTS privacy_access_grants_expiry ON privacy_access_grants(expires_at)`,
] as const;
