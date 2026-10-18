/** Identify-only serving erasure admission; uses the serving job and central role settlement, never site login. */
import type { Env } from './env';
import {nativeErasureMode} from './privacy-native-mode';
import {snapshotErasureStatusData,snapshotErasureStatusAdmissionData,erasureStatusBody} from './privacy-erasure-status-credential';
import {originalErasureStatusAdmissionContext,originalErasureStatusAdmissionReceipt} from './privacy-global-serving-origin';
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
import {assertOriginalRecoveryDataIntrinsics,recoveryScalarArrayJSON,recoveryDataUtf8Bytes} from './privacy-recovery-data-json';

import { privacyProviderCustodyDatabase,privacyAccountIncarnation,originalErasureJobBirthSql,statusByAccountErasureProof, PRIVACY_REPLAY, type AccountErasureProof } from './privacy-serving-authority';
import { PRIVACY_ACCESS_NOW as T, privacyAccessTargetBirthSql,privacyAccessFormAction, privacyAccessActionStatements, privacyAccessConsumedReadFence, privacyAccessHash, privacyAccessRandomId, type PrivacyAccessGrant } from './privacy-access';
import { FormError } from './policy-form-core';
import { escapeText as e, htmlResponse } from './policy-render';

const statusHeld=():never=>{throw new RecoveryFloorHeld();};
const statusSame=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
type StatusSlot=Readonly<{value:unknown;receiver:object;check:()=>void}>;
function statusSlot(receiver:object,key:PropertyKey,dataOnly=false):StatusSlot{const chain:{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}[]=[];let p:object|null=receiver;for(let depth=0;p&&depth<32;depth++){const d=Object.getOwnPropertyDescriptor(p,key),prototype=Object.getPrototypeOf(p);chain.push({ref:p,prototype,descriptor:d?Object.freeze({...d}):undefined});if(d){if(dataOnly&&!Object.hasOwn(d,'value')||!Object.hasOwn(d,'value')&&(typeof d.get!=='function'||d.set!==undefined))return statusHeld();const check=()=>{let current:object|null=receiver;for(const s of chain){if(current!==s.ref||Object.getPrototypeOf(s.ref)!==s.prototype||!statusSame(Object.getOwnPropertyDescriptor(s.ref,key),s.descriptor))return statusHeld();current=s.prototype;}};check();const value=Object.hasOwn(d,'value')?d.value:Reflect.apply(d.get!,receiver,[]);check();return Object.freeze({value,receiver,check});}p=prototype;}return statusHeld();}
const statusCrypto=statusSlot(globalThis,'crypto');if(!statusCrypto.value||typeof statusCrypto.value!=='object')statusHeld();
const statusSubtle=statusSlot(statusCrypto.value as object,'subtle');if(!statusSubtle.value||typeof statusSubtle.value!=='object')statusHeld();
const statusImport=statusSlot(statusSubtle.value as object,'importKey',true),statusSign=statusSlot(statusSubtle.value as object,'sign',true),statusBuffer=statusSlot(globalThis,'ArrayBuffer',true),statusBytes=statusSlot(globalThis,'Uint8Array',true);
if(typeof statusImport.value!=='function'||typeof statusSign.value!=='function'||typeof statusBuffer.value!=='function'||typeof statusBytes.value!=='function')statusHeld();
const statusBufferPrototype=statusSlot(statusBuffer.value as Function,'prototype',true),statusBytePrototype=statusSlot(statusBytes.value as Function,'prototype',true);
const statusBufferLength=(()=>{const d=Object.getOwnPropertyDescriptor(statusBufferPrototype.value as object,'byteLength');if(!d||Object.hasOwn(d,'value')||typeof d.get!=='function'||d.set!==undefined)return statusHeld();return Object.freeze({...d});})();
function statusHmacIntrinsics():void{assertOriginalRecoveryDataIntrinsics();statusCrypto.check();statusSubtle.check();statusImport.check();statusSign.check();statusBuffer.check();statusBytes.check();statusBufferPrototype.check();statusBytePrototype.check();if(!statusSame(Object.getOwnPropertyDescriptor(statusBufferPrototype.value as object,'byteLength'),statusBufferLength))return statusHeld();}
const STATUS_ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function statusBase64Bytes(value:Uint8Array,length:number):string{let out='';for(let i=0;i<length;i+=3){const a=value[i]!,b=i+1<length?value[i+1]!:0,c=i+2<length?value[i+2]!:0;out+=STATUS_ALPHABET[a>>>2]!+STATUS_ALPHABET[(a&3)<<4|b>>>4]!;if(i+1<length)out+=STATUS_ALPHABET[(b&15)<<2|c>>>6]!;if(i+2<length)out+=STATUS_ALPHABET[c&63]!;}return out;}
/** Private crypto operation; never exported. Matches site-core key derivation and body-only HMAC. */
async function statusOriginalMac(secret:string,purpose:'erasure-status-v1'|'erasure-status-v2',body:string,current:()=>void):Promise<string>{
 if(typeof secret!=='string'||secret.length<1||secret.length>4096||typeof body!=='string'||body.length>1024)return statusHeld();
 const check=()=>{statusHmacIntrinsics();current();};check();
 const key=await Reflect.apply(statusImport.value as Function,statusSubtle.value,['raw',recoveryDataUtf8Bytes(`olympus-site/${purpose}|${secret}`),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']]);check();
 const output=await Reflect.apply(statusSign.value as Function,statusSubtle.value,['HMAC',key,recoveryDataUtf8Bytes(body)]);check();
 if(!output||typeof output!=='object'||Object.getPrototypeOf(output)!==statusBufferPrototype.value||Reflect.ownKeys(output).length||Reflect.apply(statusBufferLength.get!,output,[])!==32)return statusHeld();
 const bytes=Reflect.construct(statusBytes.value as Function,[output]) as Uint8Array,result=statusBase64Bytes(bytes,32);check();return result;
}
function statusEnv(env:Env):Readonly<{secret:string;check:()=>void}>{const prototype=Object.getPrototypeOf(env),keys=Reflect.ownKeys(env),descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(env,k));const d=Object.getOwnPropertyDescriptor(env,'COOKIE_SECRET');if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value)return statusHeld();const check=()=>{assertOriginalRecoveryDataIntrinsics();const now=Reflect.ownKeys(env);if(Object.getPrototypeOf(env)!==prototype||now.length!==keys.length||keys.some(k=>!now.includes(k)))return statusHeld();for(let i=0;i<keys.length;i++)if(!statusSame(Object.getOwnPropertyDescriptor(env,keys[i]!),descriptors[i]))return statusHeld();};check();return Object.freeze({secret:d.value,check});}
/** The code issuer is private to this original fresh admission producer; raw status rows cannot call it. */
async function issueKnownOriginalStatusCode(env:Env,original:ReturnType<typeof snapshotErasureStatusAdmissionData>,current:()=>void):Promise<string|null>{
 const native=nativeErasureMode(env),origin=native?null:originalErasureStatusAdmissionReceipt(env,original.terminalRow);if(!native&&!origin)return null;
 const config=statusEnv(env),started=originalRecoveryClockMilliseconds();const check=()=>{original.check();config.check();current();origin?.check();const now=originalRecoveryClockMilliseconds();if(now<started||now>=started+5000||now<original.values.createdAt*1000||now>=(original.values.createdAt+300)*1000)return statusHeld();};check();
 const body=erasureStatusBody(original.values,native?'local_only':'independent'),mac=await statusOriginalMac(config.secret,'erasure-status-v2',body,check);check();return body+'.'+mac;
}

const originalKnownStatusCodes=new WeakMap<AccountErasureProof,string>();
const digestFor=(g:PrivacyAccessGrant,generation:string)=>privacyAccessHash(JSON.stringify(['identify_only_erasure_incarnation_v1',g.sessionHash,g.subject,g.generation,g.state,g.revision,g.grantId,generation,g.expiresAt,g.csrfHash,g.targetSitePresent,g.targetAccountIncarnation]));
async function ownAdmittedProof(env:Env,g:PrivacyAccessGrant):Promise<AccountErasureProof|null>{
 // A replay may read only this already consumed operation. It cannot repair admission or renew any deadline.
 if(g.state==='retiring'||g.state==='retired'){
  const old=await env.DB.prepare(`SELECT j.operation_id,j.subject_generation,j.request_digest,j.original_account_incarnation FROM privacy_access_grants a JOIN privacy_serving_jobs j ON j.operation_id=a.erasure_operation
  WHERE a.session_hash=?1 AND a.purpose='own_erasure' AND a.grant_id=?2 AND a.subject_id=?3 AND a.subject_generation=?4 AND a.state=?5 AND a.revision=?6
  AND a.csrf_hash=?7 AND a.created_at=?8 AND a.expires_at=?9 AND a.expires_at>${T} AND a.consumed_at IS NOT NULL
  AND j.subject_id=?3 AND j.subject_generation=?4 AND j.retain_until>${T}`)
  .bind(g.sessionHash,g.grantId,g.subject,g.generation,g.state,g.revision,g.csrfHash,g.createdAt,g.expiresAt).first<{operation_id:string;subject_generation:string;request_digest:string;original_account_incarnation:string|null}>();
  return old?{purpose:'account_erasure',subject:g.subject,subjectGeneration:old.subject_generation,operationId:old.operation_id,requestDigest:old.request_digest,accountIncarnation:old.original_account_incarnation===null?null:privacyAccountIncarnation(old.original_account_incarnation)}:null;
 }
 const row=await env.DB.prepare(`SELECT subject_generation,request_digest,original_account_incarnation FROM privacy_serving_jobs WHERE operation_id=?1 AND subject_id=?2
 AND original_session_version=0 AND original_session_expires=?3 AND retain_until>${T}
 AND EXISTS(SELECT 1 FROM privacy_access_grants a WHERE a.session_hash=?4 AND a.purpose='own_erasure' AND a.grant_id=?1
 AND a.subject_id=?2 AND a.subject_generation IS ?5 AND a.state IS ?6 AND a.revision IS ?7 AND a.csrf_hash=?8
 AND a.created_at=?9 AND a.expires_at=?3 AND a.expires_at>${T} AND a.consumed_at IS NOT NULL)`)
 .bind(g.grantId,g.subject,g.expiresAt,g.sessionHash,g.generation,g.state,g.revision,g.csrfHash,g.createdAt).first<{subject_generation:string;request_digest:string;original_account_incarnation:string|null}>();
 if(!row||row.original_account_incarnation!==g.targetAccountIncarnation||!/^[0-9a-f]{32}$/.test(row.subject_generation)||row.request_digest!==await digestFor(g,row.subject_generation))return null;
 return {purpose:'account_erasure',subject:g.subject,subjectGeneration:row.subject_generation,operationId:g.grantId,requestDigest:row.request_digest,accountIncarnation:row.original_account_incarnation===null?null:privacyAccountIncarnation(row.original_account_incarnation)};
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
 const originalGrant=snapshotErasureStatusData(g),config=statusEnv(env),custody=privacyProviderCustodyDatabase(env),prepare=statusSlot(custody,'prepare',true),batch=statusSlot(custody,'batch',true);const grantCurrent=()=>{originalGrant.check();config.check();if(privacyProviderCustodyDatabase(env)!==custody)return statusHeld();prepare.check();batch.check();};grantCurrent();const admissionOrigin=originalErasureStatusAdmissionContext(env);admissionOrigin?.check();
 const generation=g.generation??privacyAccessRandomId(),requestDigest=await digestFor(g,generation);grantCurrent();
 const proof:AccountErasureProof={purpose:'account_erasure',subject:g.subject,subjectGeneration:generation,operationId:g.grantId,requestDigest,accountIncarnation:g.targetAccountIncarnation};
 try{
 const out=await env.DB.batch([...privacyAccessActionStatements(env,g),
 env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 OR (subject_id=?2 AND state<>'complete'))
 THEN 1 ELSE json_extract('privacy_identify_erasure_conflict','$') END AS admitted`).bind(g.grantId,g.subject),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)
 VALUES(?1,?2,'retiring',1,${T},${T}) ON CONFLICT(subject_id) DO UPDATE SET state='retiring',revision=revision+1,updated_at=${T}
 WHERE generation=?2 AND state='active'`).bind(g.subject,generation),
 env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)
 VALUES(?1,?2,?3,?4,0,?5,${g.targetAccountIncarnation===null?'NULL':`'${privacyAccountIncarnation(g.targetAccountIncarnation)}'`},'waiting_role',${T},${T}+${PRIVACY_REPLAY})`).bind(g.grantId,g.subject,generation,requestDigest,g.expiresAt),
 env.DB.prepare(`UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1 AND ${privacyAccessTargetBirthSql(g,'?1')}`).bind(g.subject),
 env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?2 AND generation=?3 AND state='retiring' AND revision=?5)
 AND EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 AND subject_id=?2 AND subject_generation=?3 AND request_digest=?4
 AND original_account_incarnation IS ${g.targetAccountIncarnation===null?'NULL':`'${privacyAccountIncarnation(g.targetAccountIncarnation)}'`} AND original_session_version=0 AND original_session_expires=?6 AND state='waiting_role' AND retain_until>${T})
 AND EXISTS(SELECT 1 FROM privacy_access_grants WHERE session_hash=?7 AND purpose='own_erasure' AND grant_id=?1 AND consumed_at IS NOT NULL AND expires_at=?6 AND expires_at>${T})
 THEN 1 ELSE json_extract('privacy_identify_erasure_unconfirmed','$') END AS admitted,
 (SELECT json_array(operation_id,subject_id,subject_generation,request_digest,created_at,retain_until,original_session_version,original_session_expires,original_account_incarnation)
 FROM privacy_serving_jobs WHERE operation_id=?1 AND request_digest=?4) AS status_admission`).bind(g.grantId,g.subject,generation,requestDigest,(g.revision??0)+1,g.expiresAt,g.sessionHash),
 ]);
 const originalAck=snapshotErasureStatusAdmissionData(out,8,'admitted',Object.freeze({operationId:g.grantId,subject:g.subject,generation,requestDigest,version:0,expires:g.expiresAt,incarnation:g.targetAccountIncarnation})),originalProof=snapshotErasureStatusData(proof);const current=()=>{originalAck.check();originalProof.check();grantCurrent();admissionOrigin?.check();};current();
 const originalStatusCode=await issueKnownOriginalStatusCode(env,originalAck,current);current();if(originalStatusCode)originalKnownStatusCodes.set(proof,originalStatusCode);
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
 if(proof&&nativeErasureMode(env))await (await import('./privacy-serving-jobs')).continueSiteServingErasure(env,proof.operationId).catch(()=>undefined);
 const status=proof?await statusByAccountErasureProof(env,proof,originalKnownStatusCodes.get(proof)).catch(()=>null):null;
 const body=status?`<p>Request <code>${e(status.operationId)}</code>: <strong>${e(status.state)}</strong>.</p><p>${status.servingAccountErased?'Serving account erasure was recorded after the bot-managed Guild Member role was confirmed absent.':status.servingLocalErased?'Serving-local records were erased. Independent suppression and recovery-copy erasure are not confirmed.':'Your request is queued or held. Independent confirmation of account erasure is not available.'}</p><p>Discord role settlement is performed by the existing central role writer. Staff access classification: ${e(status.staffAccessDetails.classification)}; historical bot-issued receipt(s): ${e(status.staffAccessDetails.historicalBotIssued??'unqualified')}; unresolved bot custody: ${e(status.staffAccessDetails.unresolvedBotCustody??'unqualified')}. Historical bot-issued records do not prove exclusive current ownership. Missing bot history does not prove manual assignment. ${nativeErasureMode(env)?'Attributable Olympus guild roles are removed automatically in bounded retries. Independent server moderation, Administrator access and managed or higher roles are reported separately. Original unknown effects remain in their own custody and are not converted to confirmed provider acknowledgements.':'Staff roles are not removed automatically; unresolved bot custody holds serving erasure and requires attended handling. Manually assigned staff permissions remain human-managed.'} Active bans and safety cases can be retained under policy exceptions. External cleanup has ${e(status.externalCleanup.known)} known pointer(s), ${e(status.externalCleanup.unknown)} unknown outcome(s), and ${e(status.externalCleanup.expiredUnresolved)} unresolved record(s) past their original deadline. Recovery copies have separate custody; this does not mean every copy was erased.</p>${status.statusToken?`<p>Save this private status code and request ID. The status code reads only this request until its fixed original deadline and grants no account access.</p><pre class="privacy-status-code">${e(status.statusToken)}</pre>`:'<p>The original private status code is unavailable. It cannot be issued or renewed from a recovered request. Keep this request ID for attended help.</p>'}<p><a href="/privacy/account">Check this erasure request</a></p>`:
 `<p>Request <code>${e(g.grantId)}</code> could not be confirmed. Keep this ID and retry the same form while this connection is current, or ask an Olympus officer for attended help. A previously retired account is not reopened by this connection.</p>`;
 return htmlResponse(request,'Privacy erasure request',body+'<p><a href="/privacy/contact">Account help</a> · <a href="/privacy/access">Privacy account connection</a></p>',status?status.state==='complete'?200:202:503);
}
