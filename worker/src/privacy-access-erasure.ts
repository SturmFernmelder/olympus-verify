/** Identify-only serving erasure admission; uses the serving job and central role settlement, never site login. */
import type { Env } from './env';
import { statusByAccountErasureProof, PRIVACY_REPLAY, type AccountErasureProof } from './privacy-serving-authority';
import { PRIVACY_ACCESS_NOW as T, privacyAccessFormAction, privacyAccessActionStatements, privacyAccessConsumedReadFence, privacyAccessHash, privacyAccessRandomId, type PrivacyAccessGrant } from './privacy-access';
import { FormError } from './policy-form-core';
import { escapeText as e, htmlResponse } from './policy-render';

const digestFor=(g:PrivacyAccessGrant,generation:string)=>privacyAccessHash(JSON.stringify(['identify_only_erasure',g.sessionHash,g.subject,g.generation,g.state,g.revision,g.grantId,generation,g.expiresAt,g.csrfHash]));
async function ownAdmittedProof(env:Env,g:PrivacyAccessGrant):Promise<AccountErasureProof|null>{
 // A replay may read only this already consumed operation. It cannot repair admission or renew any deadline.
 if(g.state==='retiring'||g.state==='retired'){
  const old=await env.DB.prepare(`SELECT j.operation_id,j.subject_generation,j.request_digest FROM privacy_access_grants a JOIN privacy_serving_jobs j ON j.operation_id=a.erasure_operation
  WHERE a.session_hash=?1 AND a.purpose='own_erasure' AND a.grant_id=?2 AND a.subject_id=?3 AND a.subject_generation=?4 AND a.state=?5 AND a.revision=?6
  AND a.csrf_hash=?7 AND a.created_at=?8 AND a.expires_at=?9 AND a.expires_at>${T} AND a.consumed_at IS NOT NULL
  AND j.subject_id=?3 AND j.subject_generation=?4 AND j.retain_until>${T}`)
  .bind(g.sessionHash,g.grantId,g.subject,g.generation,g.state,g.revision,g.csrfHash,g.createdAt,g.expiresAt).first<{operation_id:string;subject_generation:string;request_digest:string}>();
  return old?{purpose:'account_erasure',subject:g.subject,subjectGeneration:old.subject_generation,operationId:old.operation_id,requestDigest:old.request_digest}:null;
 }
 const row=await env.DB.prepare(`SELECT subject_generation,request_digest FROM privacy_serving_jobs WHERE operation_id=?1 AND subject_id=?2
 AND original_session_version=0 AND original_session_expires=?3 AND retain_until>${T}
 AND EXISTS(SELECT 1 FROM privacy_access_grants a WHERE a.session_hash=?4 AND a.purpose='own_erasure' AND a.grant_id=?1
 AND a.subject_id=?2 AND a.subject_generation IS ?5 AND a.state IS ?6 AND a.revision IS ?7 AND a.csrf_hash=?8
 AND a.created_at=?9 AND a.expires_at=?3 AND a.expires_at>${T} AND a.consumed_at IS NOT NULL)`)
 .bind(g.grantId,g.subject,g.expiresAt,g.sessionHash,g.generation,g.state,g.revision,g.csrfHash,g.createdAt).first<{subject_generation:string;request_digest:string}>();
 if(!row||!/^[0-9a-f]{32}$/.test(row.subject_generation)||row.request_digest!==await digestFor(g,row.subject_generation))return null;
 return {purpose:'account_erasure',subject:g.subject,subjectGeneration:row.subject_generation,operationId:g.grantId,requestDigest:row.request_digest};
}
async function admittedErasure(env:Env,g:PrivacyAccessGrant):Promise<AccountErasureProof|null>{
 if(g.consumedAt!==null)return ownAdmittedProof(env,g);
 if(g.state==='retiring'||g.state==='retired'){
  try{
   await env.DB.batch([...privacyAccessActionStatements(env,g),env.DB.prepare(`UPDATE privacy_access_grants SET erasure_operation=(SELECT operation_id
    FROM privacy_serving_jobs WHERE subject_id=?1 AND subject_generation=?2 AND retain_until>${T} ORDER BY created_at DESC,operation_id DESC LIMIT 1)
    WHERE session_hash=?3 AND purpose='own_erasure' AND grant_id=?4 AND consumed_at IS NOT NULL`).bind(g.subject,g.generation,g.sessionHash,g.grantId),privacyAccessConsumedReadFence(env,g)]);
  }catch{/* Resolve only a committed same-grant pointer; never recapture the current account/job. */}
  return ownAdmittedProof(env,g).catch(()=>null);
 }
 const generation=g.generation??privacyAccessRandomId(),requestDigest=await digestFor(g,generation);
 const proof:AccountErasureProof={purpose:'account_erasure',subject:g.subject,subjectGeneration:generation,operationId:g.grantId,requestDigest};
 try{
 const out=await env.DB.batch([...privacyAccessActionStatements(env,g),
 env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 OR (subject_id=?2 AND state<>'complete'))
 THEN 1 ELSE json_extract('privacy_identify_erasure_conflict','$') END AS admitted`).bind(g.grantId,g.subject),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)
 VALUES(?1,?2,'retiring',1,${T},${T}) ON CONFLICT(subject_id) DO UPDATE SET state='retiring',revision=revision+1,updated_at=${T}
 WHERE generation=?2 AND state='active'`).bind(g.subject,generation),
 env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until)
 VALUES(?1,?2,?3,?4,0,?5,'waiting_role',${T},${T}+${PRIVACY_REPLAY})`).bind(g.grantId,g.subject,generation,requestDigest,g.expiresAt),
 env.DB.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1').bind(g.subject),
 env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?2 AND generation=?3 AND state='retiring' AND revision=?5)
 AND EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 AND subject_id=?2 AND subject_generation=?3 AND request_digest=?4
 AND original_session_version=0 AND original_session_expires=?6 AND state='waiting_role' AND retain_until>${T})
 AND EXISTS(SELECT 1 FROM privacy_access_grants WHERE session_hash=?7 AND purpose='own_erasure' AND grant_id=?1 AND consumed_at IS NOT NULL AND expires_at=?6 AND expires_at>${T})
 THEN 1 ELSE json_extract('privacy_identify_erasure_unconfirmed','$') END AS admitted`).bind(g.grantId,g.subject,generation,requestDigest,(g.revision??0)+1,g.expiresAt,g.sessionHash),
 ]);
 if(out.length!==8||(out[7]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)throw new FormError('privacy_erasure_unconfirmed',503);
 return proof;
 }catch{
  // An incomplete transport reply can have committed. Resolve only this exact durable request; do not recapture.
  return ownAdmittedProof(env,g).catch(()=>null);
 }
}
export async function erasePrivacyAccess(request:Request,env:Env):Promise<Response>{
 if(new URL(request.url).pathname!=='/privacy/access/erasure')throw new FormError('privacy_purpose_refused',403);
 if(env.PRIVACY_ERASURE_ENABLED!=='true')throw new FormError('privacy_erasure_unavailable',503);
 const g=await privacyAccessFormAction(request,env,'own_erasure',true),proof=await admittedErasure(env,g);
 const status=proof?await statusByAccountErasureProof(env,proof).catch(()=>null):null;
 const body=status?`<p>Request <code>${e(status.operationId)}</code>: <strong>${e(status.state)}</strong>.</p><p>${status.servingAccountErased?'Serving account erasure was recorded after the bot-managed Guild Member role was confirmed absent.':'Your request is queued or held. Serving account erasure is not complete.'}</p><p>Discord role settlement is performed by the existing central role writer. Manually assigned staff permissions require human handling. Active bans and safety cases can be retained under policy exceptions. External cleanup has ${e(status.externalCleanup.known)} known pointer(s), ${e(status.externalCleanup.unknown)} unknown outcome(s), and ${e(status.externalCleanup.expiredUnresolved)} unresolved record(s) past their original deadline. Recovery copies have separate custody; this does not mean every copy was erased.</p><p>Save this private status code and request ID. The status code reads only this request until its fixed original deadline and grants no account access.</p><pre>${e(status.statusToken)}</pre><p><a href="/privacy/account">Check this erasure request</a></p>`:
 `<p>Request <code>${e(g.grantId)}</code> could not be confirmed. Keep this ID and retry the same form while this connection is current, or ask an Olympus officer for attended help. A previously retired account is not reopened by this connection.</p>`;
 return htmlResponse(request,'Privacy erasure request',body+'<p><a href="/privacy/contact">Account help</a> · <a href="/privacy/access">Privacy account connection</a></p>',status?status.state==='complete'?200:202:503);
}
