/** Fixed serving-lifecycle DDL; canonical/runtime/migration bytes are checked together. */
export const PRIVACY_SERVING_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS privacy_subjects (
  subject_id TEXT PRIMARY KEY CHECK(length(subject_id) BETWEEN 17 AND 20 AND subject_id NOT GLOB '*[^0-9]*'),
  generation TEXT NOT NULL CHECK(length(generation)=32 AND generation NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN('active','retiring','retired')),
  revision INTEGER NOT NULL CHECK(revision>=0), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  erased_at INTEGER, retain_until INTEGER,
  CHECK((state='retired' AND erased_at IS NOT NULL AND retain_until=erased_at+31622400) OR (state<>'retired' AND retain_until IS NULL))
 )`,
 `CREATE TABLE IF NOT EXISTS privacy_serving_jobs (
  operation_id TEXT PRIMARY KEY CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
  subject_id TEXT, subject_generation TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  original_session_version INTEGER NOT NULL, original_session_expires INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN('waiting_role','held','erasing','complete')),
  hold_reason TEXT, role_checked_at INTEGER, staff_access TEXT NOT NULL DEFAULT 'unknown' CHECK(staff_access IN('human-managed','none','unknown')),
  created_at INTEGER NOT NULL, completed_at INTEGER, last_attempt_at INTEGER, retain_until INTEGER NOT NULL, original_account_incarnation TEXT CHECK(original_account_incarnation IS NULL OR (typeof(original_account_incarnation)='text' AND length(original_account_incarnation)=32 AND length(CAST(original_account_incarnation AS BLOB))=32 AND instr(original_account_incarnation,char(0))=0 AND original_account_incarnation NOT GLOB '*[^0-9a-f]*')),
  CHECK(retain_until=created_at+31622400), CHECK((state='complete' AND completed_at IS NOT NULL) OR (state<>'complete' AND completed_at IS NULL))
 )`,
 `CREATE UNIQUE INDEX IF NOT EXISTS privacy_serving_jobs_open ON privacy_serving_jobs(subject_id) WHERE state<>'complete'`,
 `CREATE INDEX IF NOT EXISTS privacy_serving_jobs_retain ON privacy_serving_jobs(retain_until)`,
 `CREATE TABLE IF NOT EXISTS privacy_denial_markers (
  subject_key TEXT PRIMARY KEY, denied_at INTEGER NOT NULL, retain_until INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason='rejected_guild_application_or_membership'),
  CHECK(retain_until=denied_at+31536000)
 )`,
 `CREATE TABLE IF NOT EXISTS privacy_restore_replay (
  operation_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, retired_generation TEXT NOT NULL,
  erased_at INTEGER NOT NULL, retain_until INTEGER NOT NULL CHECK(retain_until=erased_at+31622400),
  scope TEXT NOT NULL CHECK(scope='serving_account'), recovery_custody TEXT NOT NULL DEFAULT 'operator-held' CHECK(recovery_custody IN('operator-held','receipt-confirmed')),
  custody_receipt_digest TEXT CHECK(custody_receipt_digest IS NULL OR length(custody_receipt_digest)=64)
 )`,
 `CREATE INDEX IF NOT EXISTS privacy_restore_replay_subject ON privacy_restore_replay(subject_id,retired_generation)`,
 `CREATE TABLE IF NOT EXISTS privacy_provider_messages(
  operation_id TEXT PRIMARY KEY CHECK(length(operation_id) BETWEEN 32 AND 96),
  purpose TEXT NOT NULL CHECK(purpose IN('review','notice','guild_log','event_publication','event_reminder')),subjects TEXT NOT NULL CHECK(json_valid(subjects) AND json_type(subjects)='array'),
  channel_id TEXT NOT NULL,message_id TEXT,state TEXT NOT NULL CHECK(state IN('claimed','unknown','known','cleaning','removed','refused')),
  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_requested IN(0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,retain_until INTEGER NOT NULL,
  CHECK(retain_until=created_at+31622400)
 )`,
 `CREATE INDEX IF NOT EXISTS privacy_provider_messages_cleanup ON privacy_provider_messages(cleanup_requested,state,created_at)`,
] as const;

/** Separate declarations only. Native routes never install or reconstruct the selected next profile. */
export const PRIVACY_REJECTION_SCHEMA=Object.freeze(["CREATE TABLE privacy_rejection_decisions (\n decision_id TEXT PRIMARY KEY CHECK(typeof(decision_id)='text' AND length(decision_id)=32 AND length(CAST(decision_id AS BLOB))=32 AND instr(decision_id,char(0))=0 AND decision_id NOT GLOB '*[^0-9a-f]*'),\n subject_key TEXT NOT NULL CHECK(typeof(subject_key)='text' AND length(subject_key)=43 AND length(CAST(subject_key AS BLOB))=43 AND instr(subject_key,char(0))=0 AND subject_key NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(subject_key,43,1) IN('A','E','I','M','Q','U','Y','c','g','k','o','s','w','0','4','8')),\n target_account_incarnation TEXT NOT NULL CHECK(typeof(target_account_incarnation)='text' AND length(target_account_incarnation)=32 AND length(CAST(target_account_incarnation AS BLOB))=32 AND instr(target_account_incarnation,char(0))=0 AND target_account_incarnation NOT GLOB '*[^0-9a-f]*'),\n target_generation TEXT CHECK(target_generation IS NULL OR (typeof(target_generation)='text' AND length(target_generation)=32 AND length(CAST(target_generation AS BLOB))=32 AND instr(target_generation,char(0))=0 AND target_generation NOT GLOB '*[^0-9a-f]*')),\n protocol TEXT NOT NULL CHECK(protocol='original-guild-membership-rejection-v1'),\n source TEXT NOT NULL CHECK(source IN('member_application_decline','explicit_membership_deny')),\n scope TEXT NOT NULL CHECK(scope IN('pure_member_including_fallback0','pure_member_including_fallback1')),\n rejected_at INTEGER NOT NULL CHECK(typeof(rejected_at)='integer' AND rejected_at>0 AND rejected_at<=9007199223204991),\n retain_until INTEGER NOT NULL CHECK(typeof(retain_until)='integer' AND retain_until=rejected_at+31536000)\n)", "CREATE TABLE privacy_rejection_expiry_control (\n singleton INTEGER PRIMARY KEY CHECK(singleton=1),\n protocol TEXT NOT NULL CHECK(protocol='original-guild-rejection-expiry-v1'),\n observed_at INTEGER NOT NULL DEFAULT 0 CHECK(typeof(observed_at)='integer' AND observed_at BETWEEN 0 AND 253402300799),\n selected_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(selected_count)='integer' AND selected_count BETWEEN 0 AND 1000)\n)", "CREATE INDEX privacy_rejection_decisions_expiry ON privacy_rejection_decisions(retain_until,decision_id)", "CREATE INDEX privacy_rejection_decisions_subject ON privacy_rejection_decisions(subject_key,decision_id)", "CREATE UNIQUE INDEX site_applications_rejection_event ON site_applications(rejection_event_id) WHERE rejection_event_id IS NOT NULL", "CREATE UNIQUE INDEX site_users_account_incarnation ON site_users(account_incarnation)", "CREATE UNIQUE INDEX site_users_rejection_event ON site_users(rejection_event_id) WHERE rejection_event_id IS NOT NULL"]);
