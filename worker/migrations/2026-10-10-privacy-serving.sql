CREATE TABLE IF NOT EXISTS privacy_subjects (
  subject_id TEXT PRIMARY KEY CHECK(length(subject_id) BETWEEN 17 AND 20 AND subject_id NOT GLOB '*[^0-9]*'),
  generation TEXT NOT NULL CHECK(length(generation)=32 AND generation NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN('active','retiring','retired')),
  revision INTEGER NOT NULL CHECK(revision>=0), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  erased_at INTEGER, retain_until INTEGER,
  CHECK((state='retired' AND erased_at IS NOT NULL AND retain_until=erased_at+31622400) OR (state<>'retired' AND retain_until IS NULL))
 );
CREATE TABLE IF NOT EXISTS privacy_serving_jobs (
  operation_id TEXT PRIMARY KEY CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
  subject_id TEXT, subject_generation TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  original_session_version INTEGER NOT NULL, original_session_expires INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN('waiting_role','held','erasing','complete')),
  hold_reason TEXT, role_checked_at INTEGER, staff_access TEXT NOT NULL DEFAULT 'unknown' CHECK(staff_access IN('human-managed','none','unknown')),
  created_at INTEGER NOT NULL, completed_at INTEGER, last_attempt_at INTEGER, retain_until INTEGER NOT NULL,
  CHECK(retain_until=created_at+31622400), CHECK((state='complete' AND completed_at IS NOT NULL) OR (state<>'complete' AND completed_at IS NULL))
 );
CREATE UNIQUE INDEX IF NOT EXISTS privacy_serving_jobs_open ON privacy_serving_jobs(subject_id) WHERE state<>'complete';
CREATE INDEX IF NOT EXISTS privacy_serving_jobs_retain ON privacy_serving_jobs(retain_until);
CREATE TABLE IF NOT EXISTS privacy_denial_markers (
  subject_key TEXT PRIMARY KEY, denied_at INTEGER NOT NULL, retain_until INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason='rejected_guild_application_or_membership'),
  CHECK(retain_until=denied_at+31536000)
 );
CREATE TABLE IF NOT EXISTS privacy_restore_replay (
  operation_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, retired_generation TEXT NOT NULL,
  erased_at INTEGER NOT NULL, retain_until INTEGER NOT NULL CHECK(retain_until=erased_at+31622400),
  scope TEXT NOT NULL CHECK(scope='serving_account'), recovery_custody TEXT NOT NULL DEFAULT 'operator-held' CHECK(recovery_custody IN('operator-held','receipt-confirmed')),
  custody_receipt_digest TEXT CHECK(custody_receipt_digest IS NULL OR length(custody_receipt_digest)=64)
 );
CREATE INDEX IF NOT EXISTS privacy_restore_replay_subject ON privacy_restore_replay(subject_id,retired_generation);
CREATE TABLE IF NOT EXISTS privacy_provider_messages(
  operation_id TEXT PRIMARY KEY CHECK(length(operation_id) BETWEEN 32 AND 96),
  purpose TEXT NOT NULL CHECK(purpose IN('review','notice','guild_log','event_publication','event_reminder')),subjects TEXT NOT NULL CHECK(json_valid(subjects) AND json_type(subjects)='array'),
  channel_id TEXT NOT NULL,message_id TEXT,state TEXT NOT NULL CHECK(state IN('claimed','unknown','known','cleaning','removed','refused')),
  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_requested IN(0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,retain_until INTEGER NOT NULL,
  CHECK(retain_until=created_at+31622400)
 );
CREATE INDEX IF NOT EXISTS privacy_provider_messages_cleanup ON privacy_provider_messages(cleanup_requested,state,created_at);
