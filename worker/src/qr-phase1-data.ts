/** Five explicit source families. Export is an own-only bounded projection; erasure runs in its caller's ONE batch. */
import {BETA_WINDOW_COLUMNS,betaWindowErasureStatement,betaWindowOwnSelect,projectOwnBetaWindowCopy} from './qr-beta-fern-data';
import type { Env } from './env';
import { ownCopyProofFacts,ownCopyRankFacts } from './privacy-account-coverage';
import {relatedUnresolvedStaffSql} from './privacy-erasure-staff-custody';
import { registerCommunityData,type ExportPlan } from './community-context';
import { registerServingPrivacyFamilies } from './privacy-business-catalog';
const related=`subject=?1 OR proof_id IN(SELECT id FROM verification_proofs WHERE requester=?1 OR signer=?1)`;
/** Fixed source-owned parameter positions only; no caller SQL or operational proof is issued. */
export function qrErasureCustodyClearSql(identity:'?1'|'?2'):string{
 if(identity!=='?1'&&identity!=='?2')throw Error('qr_erasure_identity_parameter_held');
 const selected=identity==='?1'?related:related.replaceAll('?1','?2');
 return `NOT EXISTS(SELECT 1 FROM role_settlements WHERE (${selected}) AND attempts=1
 AND state IN('dispatching','unknown')) AND NOT ${relatedUnresolvedStaffSql(identity)}`;
}
export function qrErasureStatements(env:Env,id:string):D1PreparedStatement[]{return [
 // Never discard the sole durable no-repeat receipt while a provider effect remains unknown.
 env.DB.prepare(`SELECT CASE WHEN ${qrErasureCustodyClearSql('?1')} THEN 1 ELSE json_extract('qr_provider_custody_held','$') END AS admitted`).bind(id),
 env.DB.prepare(`DELETE FROM role_settlements WHERE ${related}`).bind(id),
 env.DB.prepare('DELETE FROM verification_proofs WHERE requester=?1 OR signer=?1').bind(id),
 env.DB.prepare('DELETE FROM verification_requests WHERE requester=?1 OR beta_window_id IN(SELECT id FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1)').bind(id),
 env.DB.prepare('DELETE FROM councillor_challenges WHERE signer=?1 OR beta_window_id IN(SELECT id FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1)').bind(id),
 env.DB.prepare('DELETE FROM councillor_keys WHERE signer=?1 OR beta_window_id IN(SELECT id FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1)').bind(id),
 betaWindowErasureStatement(env,id),
 ];}
export function qrExportPlan(env:Env,id:string):ExportPlan {
 const selects=[
 ['betaFernWindows',betaWindowOwnSelect],
 ['councillorKeys','SELECT id,signer_guid,created_at,expires_at,revoked_at FROM councillor_keys WHERE signer=?1 ORDER BY created_at,id'],
 ['challenges','SELECT created_at,expires_at,used_at,mode,max_proofs,proofs_used FROM councillor_challenges WHERE signer=?1 ORDER BY created_at,nonce'],
 ['requests','SELECT created_at,expires_at,used_at,state FROM verification_requests WHERE requester=?1 ORDER BY created_at,code'],
 ['attestations',"SELECT id,CASE WHEN requester=?1 THEN 'requester' ELSE 'signer' END AS own_part,CASE WHEN requester=?1 THEN CASE WHEN typeof(requester_name)='text' AND length(requester_name) BETWEEN 1 AND 60 AND length(CAST(requester_name AS BLOB))<=240 AND instr(requester_name,char(0))=0 THEN requester_name ELSE json_extract('privacy_qr_copy_text_refused','$') END ELSE NULL END AS requester_name,CASE WHEN requester=?1 THEN native_rank ELSE NULL END AS native_rank,CASE WHEN requester=?1 THEN CASE WHEN typeof(rank_name)='text' AND length(rank_name) BETWEEN 1 AND 64 AND length(CAST(rank_name AS BLOB))<=256 AND instr(rank_name,char(0))=0 THEN rank_name ELSE json_extract('privacy_qr_copy_text_refused','$') END ELSE NULL END AS rank_name,created_at,expires_at FROM verification_proofs WHERE requester=?1 OR signer=?1 ORDER BY created_at,id"],
 ['roleOutcomes',"SELECT id,purpose,desired,state,reason,attempts,native_rank,CASE WHEN native_rank_name IS NULL THEN NULL ELSE CASE WHEN typeof(native_rank_name)='text' AND length(native_rank_name) BETWEEN 1 AND 64 AND length(CAST(native_rank_name AS BLOB))<=256 AND instr(native_rank_name,char(0))=0 THEN native_rank_name ELSE json_extract('privacy_qr_copy_text_refused','$') END END AS native_rank_name,created_at,expires_at,checked_at FROM role_settlements WHERE subject=?1 ORDER BY created_at,id"],
 ] as const;
 return {statements:selects.flatMap(([,sql])=>[env.DB.prepare(`${sql} LIMIT 1000`).bind(id),env.DB.prepare(`SELECT COUNT(*) AS count FROM (${sql})`).bind(id)]),
 shape:(results)=>Object.fromEntries(selects.map(([name],i)=>[name,{rows:results[i*2]!.results.map(raw=>{const r=raw as Record<string,unknown>;return name==='betaFernWindows'?projectOwnBetaWindowCopy(r):name==='attestations'?{...r,...ownCopyProofFacts(r)}:name==='roleOutcomes'?{...r,...ownCopyRankFacts(r)}:r;}),total:(results[i*2+1]!.results[0] as {count:number}).count,limit:1000,complete:(results[i*2+1]!.results[0] as {count:number}).count<=1000}]))};
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
