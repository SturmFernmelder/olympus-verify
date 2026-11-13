import {neutralIdentityShape280,neutralIdentityTagged280} from './consumed-identity280';
/** Five explicit source families. Export is an own-only bounded projection; erasure runs in its caller's ONE batch. */
import {BETA_WINDOW_COLUMNS,betaWindowErasureStatement,betaWindowOwnSelect,projectOwnBetaWindowCopy} from './qr-beta-fern-data';
import type { Env } from './env';
import {nativeErasureMode} from './privacy-native-mode';
import { ownCopyProofFacts,ownCopyRankFacts } from './privacy-account-coverage';
import {relatedUnresolvedStaffSql,unresolvedStaffGrantSql} from './privacy-erasure-staff-custody';
import { registerCommunityData,type ExportPlan } from './community-context';
import { registerServingPrivacyFamilies } from './privacy-business-catalog';
import {BETA_RESET_GUILD_ID} from './beta-reset-policy';
const related=`subject=?1 OR proof_id IN(SELECT id FROM verification_proofs WHERE requester=?1 OR signer=?1)`;
// The new routine family retains unresolved custody regardless of a malformed
// attempt count. Its removal/compensation child may still need the exact own PUT
// parent; no generation filter or current-role GET can erase that old witness.
const native232Tagged=(a:string)=>`(${neutralIdentityTagged280(a)} OR ${a}.purpose IN('launch_routine_membership232','native_rank_compensation232','canonical_identity233','canonical_entitlement233','canonical_consumed233','canonical_routine233','canonical_compensation233','canonical_migration233','canonical_migration_remove233','canonical_migration_compensation233','canonical_migration_reservation239') OR ${a}.native_profile IS 'olympus-prime-live-20261105-v1' OR ${a}.native_profile IS 'olympus-canonical-ranks-20261106-v1' OR ${a}.native_profile IS 'olympus-canonical-migration-20261106-v1')`;
/** This new purpose has no dispatch/claim path. Only its exact expired Native
 * no-network shape may leave custody after positively observed generation
 * retirement/supersession. A missing subject row is not retirement authority. */
const migration239ExpiredLease=(a:string)=>`(CASE WHEN ((${a}.purpose='canonical_migration_reservation239' AND ${a}.native_profile='olympus-canonical-migration-20261106-v1')
 AND (${a}.guild_id='${BETA_RESET_GUILD_ID}' AND ${a}.role_id='1552077551839617104' AND ${a}.desired=0 AND ${a}.state='pending' AND ${a}.reason='canonical239_reservation_pending')
 AND (${a}.attempts=0 AND ${a}.claim_nonce IS NULL AND ${a}.checked_at IS NULL AND ${a}.proof_id IS NULL AND ${a}.roster_id IS NULL AND ${a}.native_guid IS NULL AND ${a}.native_rank IS NULL AND ${a}.native_rank_name IS NULL)
 AND (typeof(${a}.id)='text' AND length(${a}.id)=32 AND length(CAST(${a}.id AS BLOB))=32 AND ${a}.id NOT GLOB '*[^0-9a-f]*')
 AND (typeof(${a}.request_digest)='text' AND length(${a}.request_digest)=64 AND length(CAST(${a}.request_digest AS BLOB))=64 AND ${a}.request_digest NOT GLOB '*[^0-9a-f]*')
 AND (${a}.subject_generation IS NULL OR (typeof(${a}.subject_generation)='text' AND length(${a}.subject_generation)=32 AND length(CAST(${a}.subject_generation AS BLOB))=32 AND ${a}.subject_generation NOT GLOB '*[^0-9a-f]*'))
 AND (typeof(${a}.created_at)='integer' AND ${a}.created_at>0 AND typeof(${a}.expires_at)='integer' AND ${a}.expires_at>${a}.created_at AND ${a}.expires_at<=${a}.created_at+300 AND ${a}.expires_at<=CAST(strftime('%s','now') AS INTEGER))
 AND NOT EXISTS(SELECT 1 FROM role_settlements lease_child239 WHERE lease_child239.request_digest=${a}.id)
 AND EXISTS(SELECT 1 FROM privacy_subjects lease_subject239 WHERE lease_subject239.subject_id=${a}.subject
 AND ((lease_subject239.generation IS ${a}.subject_generation AND lease_subject239.state IN('retiring','retired')) OR (lease_subject239.generation IS NOT ${a}.subject_generation AND lease_subject239.state IN('active','retiring','retired'))))) THEN 1 ELSE 0 END)`;
const native232Unresolved=(a:string)=>`((${neutralIdentityTagged280(a)} AND NOT(${neutralIdentityShape280(a)})) OR ${native232Tagged(a)} AND ${a}.state IN('pending','dispatching','unknown') AND NOT(${migration239ExpiredLease(a)}))`;
const native232CurrentAbsence=`EXISTS(SELECT 1 FROM role_settlements ni JOIN privacy_serving_jobs nj ON ni.id=nj.operation_id||':native_role_inventory'
 WHERE ni.subject=?1 AND ni.subject=nj.subject_id AND ni.subject_generation=nj.subject_generation AND ni.request_digest=nj.request_digest
 AND ni.purpose='native_account_erasure_inventory' AND ni.desired=0 AND ni.attempts=0 AND ni.state='settled' AND ni.reason='observed_absent'
 AND ni.checked_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-60 AND CAST(strftime('%s','now') AS INTEGER)
 AND nj.state IN('waiting_role','held','erasing') AND nj.retain_until>CAST(strftime('%s','now') AS INTEGER))`;
/** .239 retention facts are one statement-local snapshot, scoped to the
 * original related roots and their necessary lineage. The absence observation
 * is ALWAYS this erasure operation's ?1, including cross-subject proof roots. */
const native239RetentionFacts=`WITH
 q239_roots AS MATERIALIZED(SELECT r239.rowid AS q239_row,r239.* FROM role_settlements r239 WHERE (${related})),
 q239_negatives AS MATERIALIZED(SELECT * FROM q239_roots WHERE purpose='canonical_migration_remove233' AND desired=0
  UNION SELECT e239.rowid AS q239_row,e239.* FROM role_settlements e239 JOIN q239_roots r239 ON e239.request_digest=r239.id WHERE e239.purpose='canonical_migration_remove233' AND e239.desired=0),
 q239_positive AS MATERIALIZED(SELECT DISTINCT kept239.rowid AS q239_row,kept239.* FROM role_settlements kept239 JOIN q239_negatives n239
  ON kept239.subject=n239.subject AND kept239.guild_id=n239.guild_id AND kept239.role_id=n239.role_id AND kept239.subject_generation IS n239.subject_generation
  WHERE kept239.desired=1 AND kept239.attempts=1 AND kept239.state='settled' AND kept239.reason IN('native232_put_acknowledged_and_confirmed','canonical233_put_acknowledged_and_confirmed','canonical233_migration_put_acknowledged_and_confirmed','launch230_put_acknowledged_and_confirmed')),
 q239_base_rows AS MATERIALIZED(SELECT * FROM q239_roots UNION SELECT * FROM q239_positive),
 q239_base_self AS MATERIALIZED(SELECT r239.*,CASE WHEN ${native232Unresolved('r239')} THEN 1 ELSE 0 END AS q239_unresolved,
  CASE WHEN (${native232Tagged('r239')}) AND r239.desired=1 AND r239.attempts=1 AND r239.state='settled' AND r239.reason IN('native232_put_acknowledged_and_confirmed','canonical233_put_acknowledged_and_confirmed','canonical233_migration_put_acknowledged_and_confirmed') AND NOT ${native232CurrentAbsence} THEN 1 ELSE 0 END AS q239_positive_keep FROM q239_base_rows r239),
 q239_dependencies AS MATERIALIZED(SELECT nd.rowid AS q239_row,nd.request_digest,nd.subject,nd.guild_id,nd.role_id,CASE WHEN ${native232Unresolved('nd')} THEN 1 ELSE 0 END AS q239_unresolved
  FROM role_settlements nd JOIN q239_base_rows r239 ON nd.request_digest=r239.id AND nd.subject=r239.subject AND nd.guild_id=r239.guild_id AND nd.role_id=r239.role_id),
 q239_base_flags AS MATERIALIZED(SELECT r239.*,CASE WHEN r239.q239_unresolved=1 OR r239.q239_positive_keep=1
  OR EXISTS(SELECT 1 FROM q239_dependencies nd WHERE nd.request_digest=r239.id AND nd.subject=r239.subject AND nd.guild_id=r239.guild_id AND nd.role_id=r239.role_id AND nd.q239_unresolved=1) THEN 1 ELSE 0 END AS q239_keep FROM q239_base_self r239),
 q239_negative_flags AS MATERIALIZED(SELECT n239.*,CASE WHEN NOT ${native232CurrentAbsence}
  OR EXISTS(SELECT 1 FROM q239_base_flags kept239 WHERE kept239.subject=n239.subject AND kept239.guild_id=n239.guild_id AND kept239.role_id=n239.role_id AND kept239.subject_generation IS n239.subject_generation AND kept239.desired=1 AND kept239.attempts=1 AND kept239.state='settled' AND kept239.reason IN('native232_put_acknowledged_and_confirmed','canonical233_put_acknowledged_and_confirmed','canonical233_migration_put_acknowledged_and_confirmed','launch230_put_acknowledged_and_confirmed') AND kept239.q239_keep=1) THEN 1 ELSE 0 END AS q239_keep FROM q239_negatives n239),
 q239_retained AS MATERIALIZED(SELECT r239.q239_row FROM q239_roots r239 WHERE EXISTS(SELECT 1 FROM q239_base_flags b239 WHERE b239.q239_row=r239.q239_row AND b239.q239_keep=1)
  OR EXISTS(SELECT 1 FROM q239_negative_flags n239 WHERE n239.q239_row=r239.q239_row AND n239.q239_keep=1)
  OR EXISTS(SELECT 1 FROM q239_negative_flags n239 WHERE n239.request_digest=r239.id AND n239.q239_keep=1)) `;
/** .240 (2026-11-08): an ordinary settled removal remains a blocker while its
 * original positive ACK survives. Keep uncertainty too: routine parent selection
 * checks global incoming references, including NULL/mismatched child metadata.
 * This preserves lineage only; an observed zero-attempt row never becomes an ACK
 * or ownership. M removal retention above is unchanged. Neither child nor parent
 * gains a lifetime beyond the positive parent retained by this same DELETE. */
const native240RetentionFacts=native239RetentionFacts+`,
 q240_routine_children AS MATERIALIZED(SELECT child240.q239_row FROM q239_roots child240
  JOIN role_settlements parent240 ON child240.request_digest=parent240.id
  WHERE child240.desired=0 AND child240.state='settled'
  AND parent240.desired=1 AND parent240.attempts=1 AND parent240.state='settled'
  AND parent240.reason IN('native232_put_acknowledged_and_confirmed','canonical233_put_acknowledged_and_confirmed','canonical233_migration_put_acknowledged_and_confirmed','launch230_put_acknowledged_and_confirmed')
  AND (EXISTS(SELECT 1 FROM q239_retained kept240 WHERE kept240.q239_row=parent240.rowid)
   OR NOT EXISTS(SELECT 1 FROM q239_roots erased240 WHERE erased240.q239_row=parent240.rowid))),
 q240_retained AS MATERIALIZED(SELECT q239_row FROM q239_retained UNION SELECT q239_row FROM q240_routine_children) `;
const native232Retained=`EXISTS(SELECT 1 FROM q240_retained kept239 WHERE kept239.q239_row=role_settlements.rowid)`;
/** Fixed source-owned parameter positions only; no caller SQL or operational proof is issued. */
export function qrErasureCustodyClearSql(identity:'?1'|'?2',native=false):string{
 if(identity!=='?1'&&identity!=='?2')throw Error('qr_erasure_identity_parameter_held');
 const selected=identity==='?1'?related:related.replaceAll('?1','?2');
 const clear=`NOT EXISTS(SELECT 1 FROM role_settlements WHERE (${selected}) AND attempts=1
 AND state IN('dispatching','unknown')) AND NOT ${relatedUnresolvedStaffSql(identity)}`;
 // Treasury grants are attended new effects. An old absence observation cannot
 // cancel an unknown PUT or precede its later ACK. Retain unknown custody; a
 // known returned grant needs a strictly later whole-second Native observation.
 // Only Treasury's exact stored HTTP-refusal or proven pre-request no-send
 // nonapplication receipt is exempt. It retains its spent claim. Missing/malformed receipt fields, a lost
 // call, generic errors and all dispatching/unknown states remain held.
 const definiteRefusal=`tg.state='held' AND tg.reason IN('treasury_provider_definite_refusal','treasury_pre_dispatch_refused')
 AND typeof(tg.claim_nonce)='text' AND length(tg.claim_nonce)=32 AND tg.claim_nonce NOT GLOB '*[^0-9a-f]*'
 AND typeof(tg.request_digest)='text' AND length(tg.request_digest)=64 AND tg.request_digest NOT GLOB '*[^0-9a-f]*'
 AND typeof(tg.checked_at)='integer' AND tg.checked_at>=tg.created_at AND tg.checked_at<=CAST(strftime('%s','now') AS INTEGER)`;
 const treasury=`NOT EXISTS(SELECT 1 FROM role_settlements tg WHERE tg.subject=${identity} AND tg.purpose='treasury_cosmetic' AND tg.desired=1 AND tg.attempts=1
 AND NOT(${definiteRefusal})
 AND (tg.state IN('dispatching','unknown') OR tg.checked_at IS NULL OR ${native?`NOT EXISTS(SELECT 1 FROM role_settlements tn JOIN privacy_serving_jobs tj ON tn.id=tj.operation_id||':native_role_inventory'
 WHERE tn.subject=${identity} AND tn.subject=tj.subject_id AND tn.subject_generation=tj.subject_generation AND tn.request_digest=tj.request_digest AND tn.purpose='native_account_erasure_inventory' AND tn.attempts=0 AND tn.state='settled' AND tn.reason='observed_absent' AND tn.checked_at>tg.checked_at
 AND tn.checked_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-60 AND CAST(strftime('%s','now') AS INTEGER) AND tj.state IN('waiting_role','held','erasing') AND tj.retain_until>CAST(strftime('%s','now') AS INTEGER))`:'1'}))`;
 if(native)return `(${treasury} AND ((${clear}) OR EXISTS(SELECT 1 FROM role_settlements nr JOIN privacy_serving_jobs j ON nr.id=j.operation_id||':native_role_inventory'
 WHERE nr.subject=${identity} AND nr.subject=j.subject_id AND nr.subject_generation=j.subject_generation AND nr.request_digest=j.request_digest
 AND nr.purpose='native_account_erasure_inventory' AND nr.desired=0 AND nr.attempts=0 AND nr.state='settled' AND nr.reason='observed_absent'
 AND nr.checked_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-60 AND CAST(strftime('%s','now') AS INTEGER)
 AND j.state IN('waiting_role','held','erasing') AND j.retain_until>CAST(strftime('%s','now') AS INTEGER))))`;
 // Ordinary partial admin deletion has no erasure job. Its original no-unknown-effect
 // predicate remains sufficient; full account erasure separately consumes its native receipt.
 return `(${clear} AND ${treasury})`;
}
export function qrErasureStatements(env:Env,id:string):D1PreparedStatement[]{return [
 // Never discard the sole durable no-repeat receipt while a provider effect remains unknown.
 env.DB.prepare(`SELECT CASE WHEN ${qrErasureCustodyClearSql('?1',nativeErasureMode(env))} THEN 1 ELSE json_extract('qr_provider_custody_held','$') END AS admitted`).bind(id),
 env.DB.prepare(`${nativeErasureMode(env)?native240RetentionFacts:''}DELETE FROM role_settlements WHERE (${related})${nativeErasureMode(env)?" AND NOT(attempts=1 AND state IN('dispatching','unknown')) AND NOT "+native232Retained+" AND rowid NOT IN(SELECT g.rowid FROM role_settlements g WHERE "+unresolvedStaffGrantSql('g')+")":''}`).bind(id),
 // Native mode must retain the exact proof/FK ancestry of a preserved unknown effect.
 // Revoke this account's signing/request authority without erasing its sole custody link.
 ...(nativeErasureMode(env)?[
  env.DB.prepare("UPDATE councillor_keys SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)) WHERE signer=?1").bind(id),
  env.DB.prepare("UPDATE verification_requests SET state='expired',used_at=COALESCE(used_at,CAST(strftime('%s','now') AS INTEGER)) WHERE requester=?1").bind(id),
  env.DB.prepare("UPDATE qr_beta_fern_windows SET revoked_at=COALESCE(revoked_at,CAST(strftime('%s','now') AS INTEGER)) WHERE actor=?1 OR requester_id=?1").bind(id),
 ]:[]),
 env.DB.prepare(`DELETE FROM verification_proofs WHERE (requester=?1 OR signer=?1)${nativeErasureMode(env)?' AND NOT EXISTS(SELECT 1 FROM role_settlements r WHERE r.proof_id=verification_proofs.id)':''}`).bind(id),
 env.DB.prepare(`DELETE FROM verification_requests WHERE (requester=?1 OR beta_window_id IN(SELECT id FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1))${nativeErasureMode(env)?' AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.code=verification_requests.code)':''}`).bind(id),
 env.DB.prepare(`DELETE FROM councillor_challenges WHERE (signer=?1 OR beta_window_id IN(SELECT id FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1))${nativeErasureMode(env)?' AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.challenge=councillor_challenges.nonce)':''}`).bind(id),
 env.DB.prepare(`DELETE FROM councillor_keys WHERE (signer=?1 OR beta_window_id IN(SELECT id FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1))${nativeErasureMode(env)?' AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.key_id=councillor_keys.id) AND NOT EXISTS(SELECT 1 FROM councillor_challenges c WHERE c.key_id=councillor_keys.id)':''}`).bind(id),
 nativeErasureMode(env)?env.DB.prepare(`DELETE FROM qr_beta_fern_windows WHERE (actor=?1 OR requester_id=?1)
 AND NOT EXISTS(SELECT 1 FROM councillor_keys k WHERE k.beta_window_id=qr_beta_fern_windows.id)
 AND NOT EXISTS(SELECT 1 FROM councillor_challenges c WHERE c.beta_window_id=qr_beta_fern_windows.id)
 AND NOT EXISTS(SELECT 1 FROM verification_requests r WHERE r.beta_window_id=qr_beta_fern_windows.id)
 AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.beta_window_id=qr_beta_fern_windows.id)`).bind(id):betaWindowErasureStatement(env,id),
 ];}
export function qrExportPlan(env:Env,id:string):ExportPlan {
 const selects=[
 ['betaFernWindows',betaWindowOwnSelect],
 ['councillorKeys','SELECT id,signer_guid,created_at,expires_at,revoked_at FROM councillor_keys WHERE signer=?1 ORDER BY created_at,id'],
 ['challenges','SELECT created_at,expires_at,used_at,mode,max_proofs,proofs_used FROM councillor_challenges WHERE signer=?1 ORDER BY created_at,nonce'],
 ['requests','SELECT created_at,expires_at,used_at,state FROM verification_requests WHERE requester=?1 ORDER BY created_at,code'],
 ['attestations',"SELECT id,CASE WHEN requester=?1 THEN 'requester' ELSE 'signer' END AS own_part,CASE WHEN requester=?1 THEN CASE WHEN typeof(requester_name)='text' AND length(requester_name) BETWEEN 1 AND 60 AND length(CAST(requester_name AS BLOB))<=240 AND instr(requester_name,char(0))=0 THEN requester_name ELSE json_extract('privacy_qr_copy_text_refused','$') END ELSE NULL END AS requester_name,CASE WHEN requester=?1 THEN native_rank ELSE NULL END AS native_rank,CASE WHEN requester=?1 THEN CASE WHEN typeof(rank_name)='text' AND length(rank_name) BETWEEN 1 AND 64 AND length(CAST(rank_name AS BLOB))<=256 AND instr(rank_name,char(0))=0 THEN rank_name ELSE json_extract('privacy_qr_copy_text_refused','$') END ELSE NULL END AS rank_name,created_at,expires_at FROM verification_proofs WHERE requester=?1 OR signer=?1 ORDER BY created_at,id"],
 ['roleOutcomes',`SELECT CASE WHEN ${neutralIdentityTagged280('role_settlements')} THEN NULL ELSE id END AS id,purpose,desired,state,reason,attempts,
  CASE WHEN ${neutralIdentityTagged280('role_settlements')} THEN NULL ELSE native_rank END AS native_rank,
  CASE WHEN ${neutralIdentityTagged280('role_settlements')} THEN NULL WHEN native_rank_name IS NULL THEN NULL ELSE CASE WHEN typeof(native_rank_name)='text' AND length(native_rank_name) BETWEEN 1 AND 64 AND length(CAST(native_rank_name AS BLOB))<=256 AND instr(native_rank_name,char(0))=0 THEN native_rank_name ELSE json_extract('privacy_qr_copy_text_refused','$') END END AS native_rank_name,
  CASE WHEN ${neutralIdentityTagged280('role_settlements')} THEN 1 ELSE 0 END AS __identity_control280,created_at,expires_at,checked_at FROM role_settlements WHERE subject=?1 ORDER BY role_settlements.created_at,role_settlements.id`],
 ] as const;
 return {statements:selects.flatMap(([,sql])=>[env.DB.prepare(`${sql} LIMIT 1000`).bind(id),env.DB.prepare(`SELECT COUNT(*) AS count FROM (${sql})`).bind(id)]),
 shape:(results)=>Object.fromEntries(selects.map(([name],i)=>[name,{rows:results[i*2]!.results.map(raw=>{const r=raw as Record<string,unknown>;return name==='betaFernWindows'?projectOwnBetaWindowCopy(r):name==='attestations'?{...r,...ownCopyProofFacts(r)}:name==='roleOutcomes'?projectRoleOutcome280(r):r;}),total:(results[i*2+1]!.results[0] as {count:number}).count,limit:1000,complete:(results[i*2+1]!.results[0] as {count:number}).count<=1000}]))};
}
/** This flag describes only the exported record, never the member's current roles. */
function projectRoleOutcome280(raw:Record<string,unknown>){
 const {__identity_control280,...row}=raw;const base={...row,...ownCopyRankFacts(row)};
 return __identity_control280===1?{...base,recordKind:'identity-control',roleGranted:false,
  roleGrantedMeaning:'This identity-control record makes no Discord role grant; current roles are separate. Rank fields are not part of this record kind.'}:base;
}
registerCommunityData('councillor_verification',qrErasureStatements,qrExportPlan);
registerServingPrivacyFamilies('councillor_verification',[
 {table:'councillor_keys',columns:'id,signer,signer_account_incarnation,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at,revoked_at,beta_window_id'},
 {table:'councillor_challenges',columns:'nonce,key_id,signer,signer_account_incarnation,session_version,session_expires,created_at,expires_at,used_at,mode,max_proofs,proofs_used,beta_window_id'},
 {table:'verification_requests',columns:'code,requester,requester_account_incarnation,subject_generation,created_at,expires_at,used_at,state,session_version,session_expires,beta_window_id'},
 {table:'verification_proofs',columns:'id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at,beta_window_id'},
 {table:'qr_beta_fern_windows',columns:BETA_WINDOW_COLUMNS},
 {table:'role_settlements',columns:'id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,created_at,expires_at,checked_at'},
]);
