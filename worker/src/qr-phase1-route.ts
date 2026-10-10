import type { Env } from './env';
import { apiJson,currentUser,readSession,sameOrigin,PAGE_VERSION,rateLimited } from './site-core';
import { readInteractionBody } from './discord';
import { requireQr,createWebsiteRequest,enrollKey,revokeKey,issueChallenge,cancelChallenge,prepareAttestation,ingestAttestation,requestStatus,QrHeld,QR_PROFILE,type QrSession } from './qr-phase1';
import { readPrivacySubject } from './privacy-serving-authority';
import { queueProofRoles,queueRosterRankRoles,settleRoleIntent,settleOwnedRoleBatch } from './role-settlements';
/** Registered before generic /api/ dispatch. Route-bound signed cookie + strict same-origin. Never uses a site token. */
export async function handleQrApi(request:Request,env:Env):Promise<Response>{
 const u=new URL(request.url),path=u.pathname;
 try{
 requireQr(env);
 const session=await readSession(env,request) as (QrSession&{u:string})|null,user=await currentUser(env,request);
 if(!session||!user||session.u!==user.discord_id||!Number.isSafeInteger(session.v)||!Number.isSafeInteger(session.e))return apiJson({error:'signed_out'},401);
 const subject=await readPrivacySubject(env,session.u);if(!subject||subject.state!=='active'||subject.subjectGeneration!==session.g)return apiJson({error:'current_serving_generation_required'},409);
 if(env.SITE_GUILD_ID!==env.GUILD_ID)return apiJson({error:'guild_scope_mismatch'},503);
 if(request.method!=='GET'&&(!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION))return apiJson({error:'bad_origin'},403);
 if(rateLimited('qr:'+session.u,20,60))return apiJson({error:'rate_limited'},429);
 if(request.method==='GET'&&path==='/api/qr/profile')return apiJson({phase:1,profile:QR_PROFILE,leaseHours:24,requires:'Verified GUID and native High Council slot 1; Officer and site admin do not qualify',trust:'councillor_browser_attestation'});
 if(request.method==='GET'&&path==='/api/qr/status')return apiJson(await requestStatus(env,session.u,u.searchParams.get('code')||''));
 // Read-only recovery survives a lost proof response/reload. It exposes only this original generation's own receipts.
 const ownedProof=`EXISTS(SELECT 1 FROM verification_requests v JOIN councillor_keys k ON k.id=p.key_id WHERE v.code=p.code AND ((p.requester=?1 AND v.subject_generation=?2) OR (p.signer=?1 AND k.subject_generation=?2)))`;
 if(request.method==='GET'&&path==='/api/qr/receipts'){
 const proofs=await env.DB.prepare(`SELECT p.id,p.code,p.created_at,p.expires_at FROM verification_proofs p WHERE ${ownedProof} ORDER BY p.created_at DESC,p.id LIMIT 10`).bind(session.u,session.g).all<{id:string;code:string;created_at:number;expires_at:number}>();
 const receipts=[];for(const p of proofs.results){const operations=await env.DB.prepare('SELECT id,state,reason,desired FROM role_settlements WHERE proof_id=?1 ORDER BY desired,created_at,id LIMIT 14').bind(p.id).all<{id:string;state:string;reason:string;desired:number}>();receipts.push({proofId:p.id,code:p.code,createdAt:p.created_at,expiresAt:p.expires_at,operations:operations.results.map(r=>({operationId:r.id,state:r.state,reason:r.reason}))});}return apiJson({receipts});}
 if(request.method!=='POST')return apiJson({error:'not_found'},404);
 const raw=await readInteractionBody(request,2048);if(raw===null)return apiJson({error:'body_too_large'},413);let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{return apiJson({error:'invalid_json'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b))return apiJson({error:'invalid_json'},400);
 const fields=(...keys:string[])=>Object.keys(b).sort().join(',')===keys.sort().join(',');
 if(path==='/api/qr/request'&&fields())return apiJson(await createWebsiteRequest(env,session.u,session));
 if(path==='/api/qr/enroll'&&fields('guid','publicKey')&&typeof b.guid==='string')return apiJson(await enrollKey(env,session.u,b.guid,b.publicKey,session));
 if(path==='/api/qr/revoke'&&fields('keyId')&&typeof b.keyId==='string'){await revokeKey(env,session.u,b.keyId,session);return apiJson({revoked:true});}
 if(path==='/api/qr/challenge'&&fields('keyId')&&typeof b.keyId==='string')return apiJson(await issueChallenge(env,session.u,b.keyId,session.v,session.e));
 if(path==='/api/qr/automatic-lease'&&fields('keyId','optIn')&&typeof b.keyId==='string'&&b.optIn===true)return apiJson(await issueChallenge(env,session.u,b.keyId,session.v,session.e,'automatic'));
 if(path==='/api/qr/cancel-challenge'&&fields('nonce')&&typeof b.nonce==='string'){await cancelChallenge(env,session.u,b.nonce,session);return apiJson({cancelled:true});}
 if(path==='/api/qr/prepare'&&fields('wire')&&typeof b.wire==='string')return apiJson(await prepareAttestation(env,session.u,b.wire));
 const drain=async(operations:string[])=>{const first=operations.slice(0,2),r=await settleOwnedRoleBatch(env,first,{id:session.u,...session});return {...r,remaining:[...r.remaining,...operations.slice(first.length)]};};
 if(path==='/api/qr/proof') {const proof=await ingestAttestation(env,session.u,session,b);const operations=await queueProofRoles(env,proof.proofId);return apiJson({...proof,operations,...await drain(operations)},202);}
 if(path==='/api/qr/resume-proof'&&fields('proofId')&&typeof b.proofId==='string'&&/^[0-9a-f]{32}$/.test(b.proofId)){
 const own=await env.DB.prepare(`SELECT 1 FROM verification_proofs p WHERE p.id=?3 AND ${ownedProof}`).bind(session.u,session.g,b.proofId).first();if(!own)return apiJson({error:'proof_not_owned'},403);
 const operations=await queueProofRoles(env,b.proofId);return apiJson({operations,...await drain(operations)},202);}
 if(path==='/api/qr/rank-sync'&&fields()) {const latest=await env.DB.prepare('SELECT MAX(id) AS id FROM roster_snapshots').first<{id:number}>();const operations=await queueRosterRankRoles(env,session.u,latest?.id??0,session.g);return apiJson({operations,...await drain(operations)},202);}
 if(path==='/api/qr/settle-batch'&&fields('operationIds','reconcileOnly')&&Array.isArray(b.operationIds)&&typeof b.reconcileOnly==='boolean')return apiJson(await settleOwnedRoleBatch(env,b.operationIds as string[],{id:session.u,...session},b.reconcileOnly));
 if(path==='/api/qr/settle'&&fields('operationId','reconcileOnly')&&typeof b.operationId==='string'&&typeof b.reconcileOnly==='boolean'){
 const owned=await env.DB.prepare(`SELECT 1 FROM role_settlements r LEFT JOIN verification_proofs p ON p.id=r.proof_id WHERE r.id=?1 AND ((p.signer=?2 OR p.requester=?2) OR (r.subject=?2 AND r.purpose IN('roster_native_rank','roster_privileged_rank')))
 AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND session_version=?3) AND ?4>CAST(strftime('%s','now') AS INTEGER)`).bind(b.operationId,session.u,session.v,session.e).first();
 if(!owned)return apiJson({error:'operation_not_owned'},403);return apiJson(await settleRoleIntent(env,b.operationId,b.reconcileOnly,{id:session.u,...session}));}
 return apiJson({error:'invalid_request'},400);
 }catch(e){return apiJson({error:e instanceof QrHeld?e.code:'verification_held'},409);}
}
