-- Closed source semantic input; routes never install this file.
CREATE TRIGGER privacy_rejection_decisions_expire_before_delete BEFORE DELETE ON privacy_rejection_decisions
BEGIN
 SELECT CASE WHEN typeof(OLD.decision_id)='text' AND length(OLD.decision_id)=32 AND length(CAST(OLD.decision_id AS BLOB))=32 AND instr(OLD.decision_id,char(0))=0
  AND OLD.decision_id NOT GLOB '*[^0-9a-f]*'
  AND typeof(OLD.target_account_incarnation)='text' AND length(OLD.target_account_incarnation)=32 AND length(CAST(OLD.target_account_incarnation AS BLOB))=32 AND instr(OLD.target_account_incarnation,char(0))=0
  AND OLD.target_account_incarnation NOT GLOB '*[^0-9a-f]*'
  AND (OLD.target_generation IS NULL OR (typeof(OLD.target_generation)='text'
   AND length(OLD.target_generation)=32 AND length(CAST(OLD.target_generation AS BLOB))=32 AND instr(OLD.target_generation,char(0))=0 AND OLD.target_generation NOT GLOB '*[^0-9a-f]*'))
  AND typeof(OLD.rejected_at)='integer' AND OLD.rejected_at>0
  AND OLD.rejected_at<=9007199223204991 AND typeof(OLD.retain_until)='integer'
  AND OLD.retain_until=OLD.rejected_at+31536000
  AND OLD.protocol='original-guild-membership-rejection-v1'
  AND OLD.source IN('member_application_decline','explicit_membership_deny')
  AND OLD.scope IN('pure_member_including_fallback0','pure_member_including_fallback1')
  AND typeof(OLD.subject_key)='text' AND length(CAST(OLD.subject_key AS BLOB))=43
  AND instr(OLD.subject_key,char(0))=0 AND OLD.subject_key NOT GLOB '*[^A-Za-z0-9_-]*'
  AND substr(OLD.subject_key,43,1) IN('A','E','I','M','Q','U','Y','c','g','k','o','s','w','0','4','8')
  AND typeof(strftime('%s','now'))='text' AND length(strftime('%s','now')) BETWEEN 1 AND 12 AND length(CAST(strftime('%s','now') AS BLOB))=length(strftime('%s','now')) AND instr(strftime('%s','now'),char(0))=0 AND strftime('%s','now') NOT GLOB '*[^0-9]*' AND substr(strftime('%s','now'),1,1) BETWEEN '1' AND '9' AND CAST(CAST(strftime('%s','now') AS INTEGER) AS TEXT)=strftime('%s','now')
  AND CAST(strftime('%s','now') AS INTEGER)>0 AND CAST(strftime('%s','now') AS INTEGER)<=9007199254740991
  AND OLD.rejected_at<=CAST(strftime('%s','now') AS INTEGER)
 THEN 1 ELSE RAISE(ABORT,'rejection_tuple_held') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM site_users INDEXED BY site_users_rejection_event WHERE rejection_event_id=OLD.decision_id
   AND (account_incarnation IS NOT OLD.target_account_incarnation OR rejection_subject_key IS NOT OLD.subject_key
    OR rejection_scope IS NOT OLD.scope OR rejection_window_expired IS NOT 0))
  AND NOT EXISTS(
   SELECT 1 FROM site_applications a INDEXED BY site_applications_rejection_event
   LEFT JOIN site_users u ON u.discord_id=a.discord_id WHERE a.rejection_event_id=OLD.decision_id
    AND (u.account_incarnation IS NOT OLD.target_account_incarnation OR a.rejection_subject_key IS NOT OLD.subject_key
     OR a.rejection_scope IS NOT OLD.scope OR a.rejection_window_expired IS NOT 0))
 THEN 1 ELSE RAISE(ABORT,'rejection_reference_held') END;
 SELECT CASE WHEN OLD.retain_until<=CAST(strftime('%s','now') AS INTEGER)
  OR (NOT EXISTS(SELECT 1 FROM site_users INDEXED BY site_users_rejection_event WHERE rejection_event_id=OLD.decision_id)
   AND NOT EXISTS(SELECT 1 FROM site_applications INDEXED BY site_applications_rejection_event WHERE rejection_event_id=OLD.decision_id))
 THEN 1 ELSE RAISE(ABORT,'active_rejection_reference_held') END;
 UPDATE site_users SET rejection_event_id=NULL,rejection_window_expired=1
  WHERE rejection_event_id=OLD.decision_id AND OLD.retain_until<=CAST(strftime('%s','now') AS INTEGER);
 UPDATE site_applications SET rejection_event_id=NULL,rejection_window_expired=1
  WHERE rejection_event_id=OLD.decision_id AND OLD.retain_until<=CAST(strftime('%s','now') AS INTEGER);
END;

CREATE TRIGGER privacy_rejection_expiry_control_no_insert BEFORE INSERT ON privacy_rejection_expiry_control
BEGIN SELECT RAISE(ABORT,'rejection_expiry_control_immutable'); END;

CREATE TRIGGER privacy_rejection_expiry_control_no_delete BEFORE DELETE ON privacy_rejection_expiry_control
BEGIN SELECT RAISE(ABORT,'rejection_expiry_control_immutable'); END;

CREATE TRIGGER privacy_rejection_expiry_control_guard BEFORE UPDATE ON privacy_rejection_expiry_control
BEGIN
 SELECT CASE WHEN OLD.singleton=1 AND NEW.singleton=1
  AND OLD.protocol='original-guild-rejection-expiry-v1' AND NEW.protocol=OLD.protocol
  AND typeof(OLD.observed_at)='integer' AND OLD.observed_at BETWEEN 0 AND 253402300799
  AND typeof(OLD.selected_count)='integer' AND OLD.selected_count BETWEEN 0 AND 1000
  AND typeof(NEW.observed_at)='integer' AND NEW.observed_at BETWEEN 1 AND 253402300799
  AND NEW.observed_at>=OLD.observed_at
  AND typeof(strftime('%s','now'))='text'
  AND instr(strftime('%s','now'),char(0))=0
  AND length(CAST(strftime('%s','now') AS BLOB))=length(strftime('%s','now'))
  AND strftime('%s','now')=CAST(NEW.observed_at AS TEXT)
  AND typeof(NEW.selected_count)='integer' AND NEW.selected_count BETWEEN 0 AND 1000
 THEN 1 ELSE RAISE(ABORT,'rejection_expiry_control_held') END;
END;

CREATE TRIGGER privacy_rejection_expiry_control_page AFTER UPDATE ON privacy_rejection_expiry_control
BEGIN
 -- DELETE's ORDER/LIMIT is inside the SELECT; no unsupported trigger DML LIMIT/RETURNING/CTE.
 -- Fixed source/profile has no other trigger mutating this control or the candidate event set.
 DELETE FROM privacy_rejection_decisions WHERE decision_id IN(
  SELECT decision_id FROM privacy_rejection_decisions INDEXED BY privacy_rejection_decisions_expiry
  WHERE retain_until<=NEW.observed_at ORDER BY retain_until,decision_id LIMIT 1000);
 -- The existing event BEFORE DELETE validates OLD and expires exact matching own refs first.
 -- changes() reports this DELETE's direct rows, not nested ref updates; Native must verify it.
 SELECT CASE WHEN changes()=NEW.selected_count THEN 1 ELSE RAISE(ABORT,'rejection_expiry_page_held') END;
END;

CREATE TRIGGER privacy_rejection_decisions_immutable BEFORE UPDATE ON privacy_rejection_decisions BEGIN SELECT RAISE(ABORT,'rejection_decision_immutable'); END;

CREATE TRIGGER site_users_account_incarnation_immutable BEFORE UPDATE OF account_incarnation ON site_users WHEN NEW.account_incarnation IS NOT OLD.account_incarnation BEGIN SELECT RAISE(ABORT,'original_account_incarnation_changed'); END;

CREATE TRIGGER site_users_rejection_owner_delete BEFORE DELETE ON site_users WHEN EXISTS(SELECT 1 FROM site_applications WHERE discord_id=OLD.discord_id AND (rejection_event_id IS NOT NULL OR rejection_subject_key IS NOT NULL OR rejection_scope IS NOT NULL OR rejection_window_expired<>0)) BEGIN SELECT RAISE(ABORT,'surviving_rejection_owner_held'); END;

CREATE TRIGGER qr_beta_fern_window_immutable BEFORE UPDATE ON qr_beta_fern_windows WHEN
 NEW.id IS NOT OLD.id OR NEW.actor IS NOT OLD.actor OR NEW.account_incarnation IS NOT OLD.account_incarnation OR NEW.subject_generation IS NOT OLD.subject_generation OR NEW.session_version IS NOT OLD.session_version OR NEW.session_expires IS NOT OLD.session_expires OR NEW.guild_id IS NOT OLD.guild_id OR NEW.application_id IS NOT OLD.application_id OR NEW.signer_guid IS NOT OLD.signer_guid OR NEW.signer_name IS NOT OLD.signer_name OR NEW.guild_name IS NOT OLD.guild_name OR NEW.realm_name IS NOT OLD.realm_name OR NEW.guild_realm IS NOT OLD.guild_realm OR NEW.game_build IS NOT OLD.game_build OR NEW.game_interface IS NOT OLD.game_interface OR NEW.native_rank IS NOT OLD.native_rank OR NEW.native_rank_index IS NOT OLD.native_rank_index OR NEW.native_rank_count IS NOT OLD.native_rank_count OR NEW.roster_id IS NOT OLD.roster_id OR NEW.links_not_before IS NOT OLD.links_not_before OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR NEW.review_digest IS NOT OLD.review_digest OR NEW.requester_id IS NOT OLD.requester_id OR NEW.requester_name IS NOT OLD.requester_name OR NEW.requester_guid IS NOT OLD.requester_guid OR NEW.requester_generation IS NOT OLD.requester_generation OR NEW.requester_account_incarnation IS NOT OLD.requester_account_incarnation OR NEW.request_code IS NOT OLD.request_code OR NEW.request_created_at IS NOT OLD.request_created_at OR NEW.request_expires_at IS NOT OLD.request_expires_at OR NEW.membership_role IS NOT OLD.membership_role OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at) OR (NEW.revoked_at IS NOT NULL AND (typeof(NEW.revoked_at)<>'integer' OR NEW.revoked_at<OLD.created_at OR NEW.revoked_at>CAST(strftime('%s','now') AS INTEGER)))
 BEGIN SELECT RAISE(ABORT,'beta_window_immutable'); END;

CREATE TRIGGER qr_beta_key_window_immutable BEFORE UPDATE OF beta_window_id ON councillor_keys WHEN NEW.beta_window_id IS NOT OLD.beta_window_id BEGIN SELECT RAISE(ABORT,'beta_key_window_immutable'); END;

CREATE TRIGGER qr_beta_challenge_window_immutable BEFORE UPDATE OF beta_window_id ON councillor_challenges WHEN NEW.beta_window_id IS NOT OLD.beta_window_id BEGIN SELECT RAISE(ABORT,'beta_challenge_window_immutable'); END;

CREATE TRIGGER qr_beta_proof_window_immutable BEFORE UPDATE OF beta_window_id ON verification_proofs WHEN NEW.beta_window_id IS NOT OLD.beta_window_id BEGIN SELECT RAISE(ABORT,'beta_proof_window_immutable'); END;

CREATE TRIGGER qr_beta_request_window_immutable BEFORE UPDATE OF beta_window_id ON verification_requests WHEN (OLD.beta_window_id IS NOT NULL AND NEW.beta_window_id IS NOT OLD.beta_window_id) OR (OLD.beta_window_id IS NULL AND NEW.beta_window_id IS NOT NULL AND (OLD.state<>'pending' OR NEW.state<>'proved' OR NOT EXISTS(SELECT 1 FROM verification_proofs p JOIN qr_beta_fern_windows w ON w.id=p.beta_window_id WHERE p.code=OLD.code AND p.requester=OLD.requester AND p.beta_window_id=NEW.beta_window_id AND w.request_code=OLD.code AND w.requester_id=OLD.requester))) BEGIN SELECT RAISE(ABORT,'beta_request_window_immutable'); END;
