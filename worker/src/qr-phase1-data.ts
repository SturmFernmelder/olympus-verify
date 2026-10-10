/** Five explicit source families. Export is an own-only bounded projection; erasure runs in its caller's ONE batch. */
import type { Env } from './env';
import { registerCommunityData,type ExportPlan } from './community-context';
import { registerServingPrivacyFamilies } from './privacy-business-catalog';
const related=`subject=?1 OR proof_id IN(SELECT id FROM verification_proofs WHERE requester=?1 OR signer=?1)`;
export function qrErasureStatements(env:Env,id:string):D1PreparedStatement[]{return [
 // Never discard the sole durable no-repeat receipt while a provider effect remains unknown.
 env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM role_settlements WHERE (${related}) AND attempts=1
 AND state IN('dispatching','unknown')) THEN 1 ELSE json_extract('qr_provider_custody_held','$') END AS admitted`).bind(id),
 env.DB.prepare(`DELETE FROM role_settlements WHERE ${related}`).bind(id),
 env.DB.prepare('DELETE FROM verification_proofs WHERE requester=?1 OR signer=?1').bind(id),
 env.DB.prepare('DELETE FROM verification_requests WHERE requester=?1').bind(id),
 env.DB.prepare('DELETE FROM councillor_challenges WHERE signer=?1').bind(id),
 env.DB.prepare('DELETE FROM councillor_keys WHERE signer=?1').bind(id),
 ];}
export function qrExportPlan(env:Env,id:string):ExportPlan {
 const selects=[
 ['councillorKeys','SELECT id,signer_guid,created_at,expires_at,revoked_at FROM councillor_keys WHERE signer=?1 ORDER BY created_at,id'],
 ['challenges','SELECT created_at,expires_at,used_at,mode,max_proofs,proofs_used FROM councillor_challenges WHERE signer=?1 ORDER BY created_at,nonce'],
 ['requests','SELECT created_at,expires_at,used_at,state FROM verification_requests WHERE requester=?1 ORDER BY created_at,code'],
 ['attestations',"SELECT id,CASE WHEN requester=?1 THEN 'requester' ELSE 'signer' END AS own_part,created_at,expires_at FROM verification_proofs WHERE requester=?1 OR signer=?1 ORDER BY created_at,id"],
 ['roleOutcomes','SELECT id,purpose,desired,state,reason,attempts,created_at,expires_at,checked_at FROM role_settlements WHERE subject=?1 ORDER BY created_at,id'],
 ] as const;
 return {statements:selects.flatMap(([,sql])=>[env.DB.prepare(`${sql} LIMIT 1000`).bind(id),env.DB.prepare(`SELECT COUNT(*) AS count FROM (${sql})`).bind(id)]),
 shape:(results)=>Object.fromEntries(selects.map(([name],i)=>[name,{rows:results[i*2]!.results,total:(results[i*2+1]!.results[0] as {count:number}).count,limit:1000,complete:(results[i*2+1]!.results[0] as {count:number}).count<=1000}]))};
}
registerCommunityData('councillor_verification',qrErasureStatements,qrExportPlan);
registerServingPrivacyFamilies('councillor_verification',[
 {table:'councillor_keys',columns:'id,signer,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at,revoked_at'},
 {table:'councillor_challenges',columns:'nonce,key_id,signer,session_version,session_expires,created_at,expires_at,used_at,mode,max_proofs,proofs_used'},
 {table:'verification_requests',columns:'code,requester,subject_generation,created_at,expires_at,used_at,state,session_version,session_expires'},
 {table:'verification_proofs',columns:'id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at'},
 {table:'role_settlements',columns:'id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,created_at,expires_at,checked_at'},
]);
