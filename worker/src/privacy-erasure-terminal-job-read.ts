/** Native job facts for the one actual terminal producer. This receipt is not a drain, reservation or erasure result. */
import type {Env} from './env';
import {recoveryScalarArraySha256,recoveryIsDataArray} from './privacy-recovery-data-json';
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {captureAccountErasureProof,originalErasureJobBirthSql,CURRENT_ERASURE_SQL,PRIVACY_DB_NOW,privacyProviderCustodyDatabase,type AccountErasureProof} from './privacy-serving-authority';
import {assertPrivacyAdmissionWitness} from './privacy-write-admission';
import {accountErasureRoleSettledSql} from './roles';
import {qrErasureCustodyClearSql} from './qr-phase1-data';
import {ORIGINAL_REJECTION_COMPANION_READ_SQL,canonicalRejectionKey} from './privacy-rejection-decision';
import {privacySubjectKey} from './privacy-serving-authority';
import {recoveryParseDataJSON,recoveryScalarArrayJSON} from './privacy-recovery-data-json';

declare const originalJobReadBrand:unique symbol;
export type OriginalErasureJobRead=Readonly<{[originalJobReadBrand]:true}>;
export type OriginalErasureJobFacts=Readonly<{proof:Readonly<AccountErasureProof>;jobReadDigest:string;observedAt:number;originalCreatedAt:number;originalRetainUntil:number;originalState:'waiting_role'|'held';roleCheckedAt:number;roleOutcome:'absent'|'removed';originalStaffAccess:'none'|'human-managed'|'unknown';companion:Readonly<{birthKind:'site'|'absence';markerKey:string;markerState:'active'|'none';originalRejectedAt:number|null;markerRetainUntil:number|null;nativeScalar:string;companionDigest:string}>}>;
type Method=Readonly<{receiver:object;name:string;fn:Function;chain:readonly Readonly<{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}>[]}>;
type RecordState={check:()=>void;facts:OriginalErasureJobFacts;env:Env;db:D1Database;used:boolean};
const originalReads=new WeakMap<OriginalErasureJobRead,RecordState>();
const held=():never=>{throw new RecoveryFloorHeld();};
const same=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined)=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>a[k as keyof PropertyDescriptor]===b[k as keyof PropertyDescriptor]);
const data=(object:object,key:PropertyKey):unknown=>{const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;};
function method(receiver:object,name:string):Method{const chain:{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}[]=[];let p:object|null=receiver;for(let i=0;p&&p!==Object.prototype&&i<32;i++){const d=Object.getOwnPropertyDescriptor(p,name),next=Object.getPrototypeOf(p);chain.push({ref:p,prototype:next,descriptor:d?Object.freeze({...d}):undefined});if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')return held();return Object.freeze({receiver,name,fn:d.value,chain:Object.freeze(chain)});}p=next;}return held();}
function checkMethod(m:Method):void{let p:object|null=m.receiver;for(const slot of m.chain){if(p!==slot.ref||Object.getPrototypeOf(slot.ref)!==slot.prototype||!same(slot.descriptor,Object.getOwnPropertyDescriptor(slot.ref,m.name)))return held();p=slot.prototype;}}
function invoke(m:Method,args:readonly unknown[]):unknown{checkMethod(m);const result=Reflect.apply(m.fn,m.receiver,args);checkMethod(m);return result;}
function snapshot(object:object,keys:readonly string[]):Readonly<{values:Readonly<Record<string,unknown>>;check:()=>void}>{const prototype=Object.getPrototypeOf(object),names=Reflect.ownKeys(object);if(names.length!==keys.length||keys.some(k=>!names.includes(k)))return held();const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(object,k));if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))return held();const saved=descriptors.map(d=>Object.freeze({...d!})),values=Object.freeze(Object.fromEntries(keys.map((k,i)=>[k,saved[i]!.value])));const check=()=>{const now=Reflect.ownKeys(object);if(Object.getPrototypeOf(object)!==prototype||now.length!==keys.length||keys.some(k=>!now.includes(k)))return held();for(let i=0;i<keys.length;i++)if(!same(saved[i],Object.getOwnPropertyDescriptor(object,keys[i]!)))return held();};check();return Object.freeze({values,check});}
const integer=(value:unknown,minimum=0,maximum=253402300799):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=minimum&&value<=maximum;
const hex=(value:unknown,size:number):value is string=>typeof value==='string'&&value.length===size&&!/[^0-9a-f]/.test(value);
const sha=recoveryScalarArraySha256;

/** Source-fixed statement only; no caller row, predicate, SQL, hash or current incarnation is accepted. */
export async function captureOriginalAccountErasureJobRead(env:Env,input:AccountErasureProof):Promise<OriginalErasureJobRead>{
 const captured=captureAccountErasureProof(input),proof=captured.proof;
 const envPrototype=Object.getPrototypeOf(env),dbDescriptor=Object.getOwnPropertyDescriptor(env,'DB'),guildDescriptor=Object.getOwnPropertyDescriptor(env,'GUILD_ID'),roleDescriptor=Object.getOwnPropertyDescriptor(env,'ROLE_GUILD_MEMBER'),secretDescriptor=Object.getOwnPropertyDescriptor(env,'COOKIE_SECRET');
 if(!dbDescriptor||!guildDescriptor||!roleDescriptor||!secretDescriptor||[dbDescriptor,guildDescriptor,roleDescriptor,secretDescriptor].some(d=>!Object.hasOwn(d,'value')))return held();
 const db=dbDescriptor.value as D1Database,guild=guildDescriptor.value,memberRole=roleDescriptor.value;
 if(!db||typeof db!=='object'||typeof guild!=='string'||guild.length<17||guild.length>20||/[^0-9]/.test(guild)||typeof memberRole!=='string'||memberRole.length<17||memberRole.length>20||/[^0-9]/.test(memberRole))return held();
 const custody=privacyProviderCustodyDatabase(env);assertPrivacyAdmissionWitness(custody);
 const prepare=method(db,'prepare'),batch=method(db,'batch');
 const envCheck=()=>{captured.check();if(Object.getPrototypeOf(env)!==envPrototype||!same(dbDescriptor,Object.getOwnPropertyDescriptor(env,'DB'))||!same(guildDescriptor,Object.getOwnPropertyDescriptor(env,'GUILD_ID'))||!same(roleDescriptor,Object.getOwnPropertyDescriptor(env,'ROLE_GUILD_MEMBER'))||!same(secretDescriptor,Object.getOwnPropertyDescriptor(env,'COOKIE_SECRET')))return held();checkMethod(prepare);checkMethod(batch);assertPrivacyAdmissionWitness(custody);};
 envCheck();const markerKey=await privacySubjectKey(env,proof.subject);envCheck();if(!canonicalRejectionKey(markerKey))return held();
 const sql=`SELECT ${ORIGINAL_REJECTION_COMPANION_READ_SQL} AS recovery_companion,j.operation_id,j.subject_id,j.subject_generation,j.request_digest,j.original_account_incarnation,j.original_session_version,j.original_session_expires,j.state,j.created_at,j.last_attempt_at,j.retain_until,r.checked_at AS role_checked_at,r.reason AS role_outcome,j.staff_access,s.generation AS current_generation,s.state AS subject_state,${PRIVACY_DB_NOW} AS observed_at,a.session_hash AS grant_session,a.subject_generation AS grant_generation,a.state AS grant_state,a.revision AS grant_revision,a.grant_id AS grant_id,a.csrf_hash AS grant_csrf,a.created_at AS grant_created,a.expires_at AS grant_expires,a.consumed_at AS grant_consumed,(SELECT COUNT(*) FROM privacy_access_grants ag WHERE ag.grant_id=j.operation_id AND ag.subject_id=j.subject_id AND ag.purpose='own_erasure' AND ag.consumed_at IS NOT NULL) AS grant_count
 FROM privacy_serving_jobs j JOIN privacy_subjects s ON s.subject_id=j.subject_id JOIN role_settlements r ON r.id=j.operation_id LEFT JOIN privacy_access_grants a ON a.grant_id=j.operation_id AND a.subject_id=j.subject_id AND a.purpose='own_erasure' AND a.consumed_at IS NOT NULL
 WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4 AND ${originalErasureJobBirthSql(proof)}
 AND (${CURRENT_ERASURE_SQL}) AND (${accountErasureRoleSettledSql}) AND ${qrErasureCustodyClearSql('?2')}
 AND EXISTS(SELECT 1 FROM role_settlements r WHERE r.id=?1 AND r.guild_id=?5 AND r.role_id=?6 AND r.desired=0)`;
 const binds=Object.freeze([proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,guild,memberRole,markerKey]);
 envCheck();const prepared=invoke(prepare,[sql]);if(!prepared||typeof prepared!=='object')return held();const bind=method(prepared,'bind');
 const bound=invoke(bind,binds);if(!bound||typeof bound!=='object')return held();const first=method(bound,'first');
 const statementCheck=()=>{envCheck();checkMethod(bind);checkMethod(first);};statementCheck();
 const row=await invoke(first,[]);statementCheck();
 if(!row||typeof row!=='object'||recoveryIsDataArray(row))return held();
 // Capture the returned Native row immediately, before the digest await. Null-prototype transport is legitimate.
 const keys=['recovery_companion','operation_id','subject_id','subject_generation','request_digest','original_account_incarnation','original_session_version','original_session_expires','state','created_at','last_attempt_at','retain_until','role_checked_at','role_outcome','staff_access','current_generation','subject_state','observed_at','grant_session','grant_generation','grant_state','grant_revision','grant_id','grant_csrf','grant_created','grant_expires','grant_consumed','grant_count'] as const;
 const original=snapshot(row,keys),v=original.values;
 if(v.operation_id!==proof.operationId||v.subject_id!==proof.subject||v.subject_generation!==proof.subjectGeneration||v.request_digest!==proof.requestDigest||v.original_account_incarnation!==proof.accountIncarnation||v.current_generation!==proof.subjectGeneration||v.subject_state!=='retiring'||!['waiting_role','held'].includes(v.state as string)||!['absent','removed'].includes(v.role_outcome as string)||!['none','human-managed','unknown'].includes(v.staff_access as string))return held();
 if(!integer(v.original_session_version)||!integer(v.original_session_expires)||!integer(v.created_at,1)||!integer(v.retain_until,1)||v.retain_until!==v.created_at+366*86400||!integer(v.observed_at,1)||v.observed_at<v.created_at||v.observed_at>=v.retain_until||!integer(v.role_checked_at,1)||v.role_checked_at>v.observed_at||v.role_checked_at<=v.observed_at-60||v.last_attempt_at!==null&&!integer(v.last_attempt_at,1))return held();
 if(proof.accountIncarnation!==null&&!hex(proof.accountIncarnation,32))return held();
 const identify=v.original_session_version===0&&v.original_session_expires>0,bot=proof.accountIncarnation===null&&v.original_session_version===0&&v.original_session_expires===0;
 if(proof.accountIncarnation===null&&!identify&&!bot)return held();
 // The original consumed identify grant is retained by the actual source purge while this exact job is pending.
 // Its original720-second expiry may now be past; admission consumption must have happened inside it.
 if(identify){
  if(v.grant_count!==1||!hex(v.grant_session,64)||!hex(v.grant_csrf,64)||v.grant_id!==proof.operationId||v.grant_expires!==v.original_session_expires||!integer(v.grant_created,1)||v.grant_expires!==v.grant_created+720||!integer(v.grant_consumed,1)||v.grant_consumed<v.grant_created||v.grant_consumed>=v.grant_expires)return held();
  if(v.grant_generation===null?(v.grant_state!==null||v.grant_revision!==null):!hex(v.grant_generation,32)||!['active','retiring','retired'].includes(v.grant_state as string)||!integer(v.grant_revision))return held();
  const sourceDigest=await sha(['identify_only_erasure_incarnation_v1',v.grant_session,proof.subject,v.grant_generation,v.grant_state,v.grant_revision,v.grant_id,proof.subjectGeneration,v.grant_expires,v.grant_csrf,proof.accountIncarnation===null?0:1,proof.accountIncarnation]);statementCheck();original.check();if(sourceDigest!==proof.requestDigest)return held();
 }
 // Bot0/0 retains its existing distinct source activity/digest consuming marker guard in the actual group.

 const marker=recoveryParseDataJSON(v.recovery_companion as string);if(!recoveryIsDataArray(marker)||marker.length!==3||recoveryScalarArrayJSON(marker)!==v.recovery_companion||!['active','none'].includes(marker[0] as string))return held();
 const markerState=marker[0] as 'active'|'none',originalRejectedAt=marker[1],markerRetainUntil=marker[2];
 if(markerState==='none'?(originalRejectedAt!==null||markerRetainUntil!==null):!integer(originalRejectedAt,1)||!integer(markerRetainUntil,1)||markerRetainUntil!==originalRejectedAt+31536000||originalRejectedAt>v.observed_at||markerRetainUntil<=v.observed_at)return held();
 const check=()=>{statementCheck();original.check();};check();
 const jobReadDigest=await sha(['source-erasure-original-job-read-v1',sql,binds,keys.map(k=>v[k])]);check();
 const companionDigest=await sha(['source-erasure-minimal-recovery-companion-v1',proof.operationId,proof.subject,proof.subjectGeneration,proof.accountIncarnation,markerKey,markerState,originalRejectedAt,markerRetainUntil,v.observed_at,jobReadDigest]);check();
 const companion=Object.freeze({birthKind:proof.accountIncarnation===null?'absence' as const:'site' as const,markerKey,markerState,originalRejectedAt:originalRejectedAt as number|null,markerRetainUntil:markerRetainUntil as number|null,nativeScalar:v.recovery_companion as string,companionDigest});
 const facts=Object.freeze({proof,jobReadDigest,companion,observedAt:v.observed_at,originalCreatedAt:v.created_at,originalRetainUntil:v.retain_until,originalState:v.state as 'waiting_role'|'held',roleCheckedAt:v.role_checked_at,roleOutcome:v.role_outcome as 'absent'|'removed',originalStaffAccess:v.staff_access as 'none'|'human-managed'|'unknown'});
 const handle=Object.freeze({}) as OriginalErasureJobRead;originalReads.set(handle,{check,facts,env,db,used:false});return handle;
}
export function assertOriginalErasureJobRead(read:OriginalErasureJobRead,env?:Env):void{const state=originalReads.get(read);if(!state||env!==undefined&&state.env!==env)return held();state.check();}
export function originalErasureJobReadFacts(read:OriginalErasureJobRead):OriginalErasureJobFacts{assertOriginalErasureJobRead(read);return originalReads.get(read)!.facts;}
/** One intent may consume this original read. Consumption is not reservation or terminal success. */
export function consumeOriginalErasureJobRead(read:OriginalErasureJobRead):void{assertOriginalErasureJobRead(read);const state=originalReads.get(read)!;if(state.used)return held();state.used=true;}

/** Exact same Native fact expression at the actual deletion boundary. No JSON/caller clock can issue it. */
export function originalAccountErasureCompanionGuardStatement(env:Env,read:OriginalErasureJobRead):D1PreparedStatement{
 assertOriginalErasureJobRead(read,env);const f=originalErasureJobReadFacts(read),p=f.proof,c=f.companion;
 return env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4 AND ${originalErasureJobBirthSql(p)} AND j.state IN('waiting_role','held') AND j.created_at=${f.originalCreatedAt} AND j.retain_until=${f.originalRetainUntil} AND ${ORIGINAL_REJECTION_COMPANION_READ_SQL}=?5 COLLATE BINARY) AND ?6<=${PRIVACY_DB_NOW} THEN 1 ELSE json_extract('original_recovery_companion_changed_held','$') END AS admitted`).bind(p.operationId,p.subject,p.subjectGeneration,p.requestDigest,c.nativeScalar,f.observedAt,c.markerKey);
}
