/** Serving erasure authority, distinct from the dormant .129 foundation.
 * A retained raw ID here is operational restore/write-suppression identity, not the denial marker.
 * A database restored from an old export is NEVER its own evidence of current replay authority.
 */
import type { Env } from './env';
import type { PendingRow } from './db';
import { readSession, sameOrigin, PAGE_VERSION, sign, verify, b64u, apiJson } from './site-core';
import {inactiveBetaRetentionSatisfiedSql} from './privacy-retention-clocks';

export const PRIVACY_DB_NOW = "CAST(strftime('%s','now') AS INTEGER)";
export const PRIVACY_YEAR = 365 * 86400;
export const PRIVACY_REPLAY = 366 * 86400;
const HEX32 = /^[0-9a-f]{32}$/;
const ID = /^\d{17,20}$/;
const HEX64 = /^[0-9a-f]{64}$/;
export type PrivacySubject = { subject: string; subjectGeneration: string; state: 'active'|'retiring'|'retired'; revision: number };
export type AccountErasureProof = { purpose: 'account_erasure'; subject: string; subjectGeneration: string; operationId: string; requestDigest: string };
export type MemberRoleSettlement = { state: 'absent'|'removed'|'held'|'unknown'; checkedAt: number|null; staffAccess: 'human-managed'|'none'|'unknown' };
export type ErasureRoleSettler = (env: Env, proof: AccountErasureProof) => Promise<MemberRoleSettlement>;
export { PRIVACY_SERVING_SCHEMA } from './privacy-serving-schema';

const randomHex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function privacySubjectKey(env: Env, subject: string): Promise<string> {
 if(!ID.test(subject) || !env.COOKIE_SECRET) throw Error('privacy_identity_unavailable');
 return sign(env.COOKIE_SECRET,'privacy-denial-v1',subject);
}
async function digest(text: string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** Fixed identifiers only. A missing row does not itself authorize a role operation. */
export const privacySubjectWritableSql=(idExpression:string):string=>`NOT EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=${idExpression} AND ps.state<>'active')`;
export function privacyGenerationFenceSql(subjectParam:number,generationParam:number):string {
 return privacyGenerationExpressionFenceSql(`?${subjectParam}`,`?${generationParam}`);
}
/** Authored SQL expressions only; callers never pass a user-controlled identifier or SQL fragment. */
export const privacyGenerationExpressionFenceSql=(subject:string,generation:string):string=>`(CASE WHEN ${generation} IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subject}) ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subject} AND generation=${generation} AND state='active') END)`;
/** A strict literal is captured from a verified cookie/row, never an SQL identifier or arbitrary request text. */
export function privacyGenerationLiteralFenceSql(subjectExpression:string,generation:string|null):string{
 if(generation===null)return `NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subjectExpression})`;
 if(!HEX32.test(generation))throw Error('privacy_generation_invalid');
 return `EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subjectExpression} AND generation='${generation}' AND state='active')`;
}
export class PrivacySiteRequestHeld extends Error{constructor(){super('privacy_site_request_held');}}
const nativePrivacyDatabases=new WeakMap<D1Database,D1Database>();
const privacyDatabaseOverheads=new WeakMap<D1Database,number>();
const privacyBoundActors=new WeakMap<D1Database,string>();
/** Explicit operational custody only: its own native effect-claim predicates remain mandatory.
 * A late provider response must be recordable after ordinary account admission has closed.
 */
export function privacyProviderCustodyDatabase(env:Env):D1Database{return nativePrivacyDatabases.get(env.DB)??env.DB;}
export const privacyDatabaseAdmissionOverhead=(db:D1Database):number=>privacyDatabaseOverheads.get(db)??0;
export function registerPrivacyCountedDatabase(db:D1Database,native:D1Database,overhead:number):void{nativePrivacyDatabases.set(db,native);privacyDatabaseOverheads.set(db,overhead);}
export const privacyActorAlreadyBound=(env:Env,subject:string):boolean=>privacyBoundActors.get(env.DB)===subject;
/** Request-bound database facade. Every protected site operation consumes the ORIGINAL cookie generation,
 * version and expiry in the same native batch as its payload, including legacy writes without their own fence.
 * It does not keep a transaction open across awaits. New login/generation is never read to repair an old request.
 */
export function privacyBoundSiteEnv(env:Env,session:{u:string;v:number;e:number;g:string|null}):Env{
 const guard=()=>env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2)
 AND ?3>${PRIVACY_DB_NOW} AND ${privacyGenerationFenceSql(1,4)} THEN 1 ELSE json_extract('privacy_site_request_refused','$') END AS admitted`).bind(session.u,session.v,session.e,session.g);
 return privacyBoundDbEnv(env,guard);
}
/** An authenticated bot/OAuth invocation keeps the original subject generation across all later awaits.
 * Captured absence never adopts a newly created authority. A retired identity needs genuine fresh site OAuth.
 */
export function privacyBoundSubjectEnv(env:Env,subject:string,capture:PrivacySubject|null):Env{
 if(!ID.test(subject)||capture?.subject!==subject&&capture!==null||capture&&capture.state!=='active')throw new PrivacySiteRequestHeld();
 const bound=privacyBoundDbEnv(env,()=>env.DB.prepare(`SELECT CASE WHEN ${privacyGenerationFenceSql(1,2)} THEN 1 ELSE json_extract('privacy_bot_request_refused','$') END AS admitted`).bind(subject,capture?.subjectGeneration??null));
 privacyBoundActors.set(bound.DB,subject);return bound;
}
function privacyBoundDbEnv(env:Env,guard:()=>D1PreparedStatement):Env{
 const base=env.DB;
 const rawStatements=new WeakMap<object,D1PreparedStatement>();
 const batch=async<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{
  const raw=statements.map(s=>rawStatements.get(s as object)??s);
  let out:D1Result<T>[];
  try{out=await base.batch<T>([guard(),...raw]);}catch{throw new PrivacySiteRequestHeld();}
  if(out.length!==raw.length+1||(out[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)throw Error('privacy_site_request_unknown');
  return out.slice(1);
 };
 const prepare=(sql:string):D1PreparedStatement=>{
  let raw=base.prepare(sql);
  const wrapper={
   bind(...values:unknown[]){raw=raw.bind(...values);rawStatements.set(wrapper,raw);return wrapper;},
   async all<T=unknown>(){return (await batch<T>([wrapper as unknown as D1PreparedStatement]))[0]!;},
   async run<T=unknown>(){return (await batch<T>([wrapper as unknown as D1PreparedStatement]))[0]!;},
   async first<T=unknown>(column?:string){const result=(await batch<T>([wrapper as unknown as D1PreparedStatement]))[0]?.results[0]??null;return column&&result!==null?(result as Record<string,unknown>)[column]??null:result;},
   async raw<T=unknown>(options?:{columnNames?:boolean}){
    // Existing staff CSV reads need raw column metadata. Consume original admission before and after
    // the read; raw is never accepted for mutation, and a delayed result is withheld after closure/ABA.
    if(!/^\s*SELECT\b/i.test(sql))throw Error('privacy_unqualified_raw_query');
    await batch([]);const result=options?.columnNames===true?await raw.raw<T>({columnNames:true}):await raw.raw<T>();await batch([]);return result;
   },
  };
  rawStatements.set(wrapper,raw);return wrapper as unknown as D1PreparedStatement;
 };
 const bound={...env,DB:new Proxy(base,{get(target,key,receiver){if(key==='prepare')return prepare;if(key==='batch')return batch;if(key==='exec'||key==='withSession')return ()=>{throw Error('privacy_unqualified_database_operation');};const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}})};
 nativePrivacyDatabases.set(bound.DB,nativePrivacyDatabases.get(base)??base);privacyDatabaseOverheads.set(bound.DB,privacyDatabaseAdmissionOverhead(base)+1);return bound;
}
export async function readPrivacySubject(env: Env, subject: string):Promise<PrivacySubject|null>{
 if(!ID.test(subject))return null;
 const row=await env.DB.prepare('SELECT subject_id AS subject,generation AS subjectGeneration,state,revision FROM privacy_subjects WHERE subject_id=?1').bind(subject).first<PrivacySubject>();
 if(!row)return null;
 if(row.subject!==subject||!HEX32.test(row.subjectGeneration)||!['active','retiring','retired'].includes(row.state)||!Number.isSafeInteger(row.revision)||row.revision<0)throw Error('privacy_authority_invalid');
 return Object.freeze({...row});
}
/** These fields were read beside the pending proof in ONE original SQLite statement, before ticket/roster awaits. */
export function pendingPrivacyCapture(p:PendingRow):PrivacySubject|null{
 return privacyCaptureFromColumns(p.discord_id,p);
}
export function privacyCaptureFromColumns(subject:string,p:{privacy_generation?:string|null;privacy_state?:string|null;privacy_revision?:number|null}):PrivacySubject|null{
 if(p.privacy_generation===undefined||p.privacy_state===undefined)throw Error('privacy_pending_capture_missing');
 if(p.privacy_generation===null&&p.privacy_state===null)return null;
 if(!p.privacy_generation||!HEX32.test(p.privacy_generation)||p.privacy_state!=='active'||!Number.isSafeInteger(p.privacy_revision))throw new PrivacySiteRequestHeld();
 return Object.freeze({subject,subjectGeneration:p.privacy_generation,state:'active',revision:p.privacy_revision!});
}
export function pendingRequestFence(env:Env,p:PendingRow):D1PreparedStatement{
 return env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM pending WHERE id=?1 AND discord_id=?2 AND created_at=?3 AND name_key=?4 AND nonce IS ?5)
 THEN 1 ELSE json_extract('privacy_pending_proof_refused','$') END AS admitted`).bind(p.id,p.discord_id,p.created_at,p.name_key,p.nonce??null);
}
export async function erasureRoleHold(env:Env,subject:string):Promise<boolean>{
 if(!ID.test(subject))return true;
 return !!await env.DB.prepare("SELECT 1 AS held FROM privacy_subjects WHERE subject_id=?1 AND state<>'active'").bind(subject).first();
}
function proofValues(p:AccountErasureProof):[string,string,string,string]{
 if(p.purpose!=='account_erasure'||!ID.test(p.subject)||!HEX32.test(p.subjectGeneration)||!HEX32.test(p.operationId)||!HEX64.test(p.requestDigest))throw Error('privacy_proof_invalid');
 return [p.operationId,p.subject,p.subjectGeneration,p.requestDigest];
}
export const CURRENT_ERASURE_SQL=`EXISTS(SELECT 1 FROM privacy_serving_jobs j JOIN privacy_subjects s ON s.subject_id=j.subject_id
 WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4
 AND j.state IN('waiting_role','held') AND s.state='retiring' AND s.generation=?3 AND j.retain_until>${PRIVACY_DB_NOW})`;
export async function currentAccountErasureProof(env:Env,p:AccountErasureProof):Promise<boolean>{
 const values=proofValues(p);return (await env.DB.prepare(`SELECT (${CURRENT_ERASURE_SQL}) AS current`).bind(...values).first<{current:number}>())?.current===1;
}
export async function readErasureProof(env:Env,operationId:string):Promise<AccountErasureProof|null>{
 if(!HEX32.test(operationId))return null;
 const row=await env.DB.prepare("SELECT subject_id AS subject,subject_generation AS subjectGeneration,operation_id AS operationId,request_digest AS requestDigest FROM privacy_serving_jobs WHERE operation_id=?1 AND state IN('waiting_role','held')").bind(operationId).first<Omit<AccountErasureProof,'purpose'>>();
 if(!row)return null;const proof={purpose:'account_erasure' as const,...row};proofValues(proof);return proof;
}
export type ErasureRequestResult={operationId:string;state:'waiting_role'|'held'|'complete';holdReason:string|null;servingAccountErased:boolean;allCopiesErased:false;externalCleanup:{known:number;unknown:number;expiredUnresolved:number};recoveryCopies:'operator-held';staffAccess:'human-managed'|'none'|'unknown';statusToken:string;statusExpires:number};
type StatusRow={state:ErasureRequestResult['state'];hold_reason:string|null;staff_access:ErasureRequestResult['staffAccess'];request_digest:string;subject_generation:string;retain_until:number};
async function statusResult(env:Env,operationId:string,row:StatusRow):Promise<ErasureRequestResult>{
 const body=b64u(new TextEncoder().encode(JSON.stringify({o:operationId,d:row.request_digest,g:row.subject_generation,e:row.retain_until})));
 const debt=await privacyProviderCustodyDatabase(env).prepare(`SELECT COALESCE(SUM(m.state IN('known','cleaning')),0) AS known,COALESCE(SUM(m.state IN('claimed','unknown')),0) AS unknown,
 COALESCE(SUM(m.retain_until<=${PRIVACY_DB_NOW}),0) AS expiredUnresolved FROM privacy_provider_messages m
 WHERE m.state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM privacy_serving_jobs j JOIN json_each(m.subjects)x WHERE j.operation_id=?1 AND j.request_digest=?2 AND json_extract(x.value,'$.id')=j.subject_id)`)
 .bind(operationId,row.request_digest).first<{known:number;unknown:number;expiredUnresolved:number}>();
 return {operationId,state:row.state,holdReason:row.hold_reason,servingAccountErased:row.state==='complete',allCopiesErased:false,externalCleanup:debt??{known:0,unknown:0,expiredUnresolved:0},recoveryCopies:'operator-held',staffAccess:row.staff_access,
 statusToken:body+'.'+await sign(env.COOKIE_SECRET,'erasure-status-v1',body),statusExpires:row.retain_until};
}
/** Trusted purpose caller only: its genuine identity proof must be consumed before this adapter.
 * This is not an HTTP admission or ordinary session. Exact retained job read plus debt read cost2.
 */
export async function statusByAccountErasureProof(env:Env,proof:AccountErasureProof):Promise<ErasureRequestResult|null>{
 const values=proofValues(proof);
 const row=await privacyProviderCustodyDatabase(env).prepare(`SELECT state,hold_reason,staff_access,request_digest,subject_generation,retain_until
 FROM privacy_serving_jobs WHERE operation_id=?1 AND subject_id=?2 AND subject_generation=?3 AND request_digest=?4 AND retain_until>${PRIVACY_DB_NOW}`)
 .bind(...values).first<StatusRow>();
 return row?statusResult(env,proof.operationId,row):null;
}
/** A purpose-only status credential survives ordinary cookie expiry; its fixed original job deadline is never renewed.
 * It contains no Discord ID and is accepted only in a same-origin POST body, never a URL or ordinary admission.
 */
export async function erasureRequestStatus(env:Env,request:Request,operationId:string,statusToken?:string):Promise<ErasureRequestResult|null>{
 if(!HEX32.test(operationId))return null;
 if(statusToken!==undefined){
  if(typeof statusToken!=='string'||statusToken.length>1024||!sameOrigin(request)||request.method!=='POST'||request.headers.get('X-Olympus')!==PAGE_VERSION)return null;
  const pieces=statusToken.split('.');if(pieces.length!==2||!await verify(env.COOKIE_SECRET,'erasure-status-v1',pieces[0]!,pieces[1]!))return null;
  let p:{o?:unknown;d?:unknown;g?:unknown;e?:unknown};
  try{p=JSON.parse(atob(pieces[0]!.replace(/-/g,'+').replace(/_/g,'/')));}catch{return null;}
  if(p.o!==operationId||typeof p.d!=='string'||!HEX64.test(p.d)||typeof p.g!=='string'||!HEX32.test(p.g)||!Number.isSafeInteger(p.e))return null;
  const row=await env.DB.prepare(`SELECT state,hold_reason,staff_access,request_digest,subject_generation,retain_until FROM privacy_serving_jobs
   WHERE operation_id=?1 AND request_digest=?2 AND subject_generation=?3 AND retain_until=?4 AND retain_until>${PRIVACY_DB_NOW}`)
   .bind(operationId,p.d,p.g,p.e).first<StatusRow>();
  return row?statusResult(env,operationId,row):null;
 }
 const session=await readSession(env,request);if(!session||!ID.test(session.u))return null;
 const row=await env.DB.prepare(`SELECT state,hold_reason,staff_access,request_digest,subject_generation,retain_until FROM privacy_serving_jobs WHERE operation_id=?1 AND subject_id=?2
 AND original_session_version=?3 AND original_session_expires=?4 AND ?4>${PRIVACY_DB_NOW} AND retain_until>${PRIVACY_DB_NOW}`)
 .bind(operationId,session.u,session.v,session.e).first<StatusRow>();
 if(!row)return null;
 if(row.request_digest!==await digest(JSON.stringify(['serving_account',session.u,row.subject_generation,operationId,session.v,session.e,session.g??null])))return null;
 return statusResult(env,operationId,row);
}
/** Genuine original cookie admission; no generic create-if-missing authority and no staff acting-as-subject. */
export async function requestServingErasure(env:Env,request:Request,operationId:string):Promise<Response>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return apiJson({error:'feature_disabled'},503);
 if(request.method!=='POST'||new URL(request.url).pathname!=='/api/me/erasure'||!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION||!HEX32.test(operationId))return apiJson({error:'invalid_request'},400);
 const session=await readSession(env,request);
 if(!session||!ID.test(session.u)||!Number.isSafeInteger(session.v)||session.v<1||!Number.isSafeInteger(session.e))return apiJson({error:'signed_out'},401);
 const prior=await erasureRequestStatus(env,request,operationId);if(prior)return apiJson({...prior,replay:true},prior.state==='complete'?200:202);
 const subject=await readPrivacySubject(env,session.u);
 if((subject?.subjectGeneration??null)!==(session.g??null))return apiJson({error:'signed_out'},401);
 if(subject&&subject.state!=='active')return apiJson({error:'erasure_in_progress'},409);
 const generation=subject?.subjectGeneration??randomHex(),requestDigest=await digest(JSON.stringify(['serving_account',session.u,generation,operationId,session.v,session.e,session.g??null]));
 const expectedRevision=subject?.revision??null;
 try {
 const out=await env.DB.batch<{admitted?:number;recorded?:number}>([
 env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2) AND ?3>${PRIVACY_DB_NOW}
 AND (CASE WHEN ?4 IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1) ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?5 AND revision=?4 AND state='active') END)
 AND ${privacyGenerationFenceSql(1,7)}
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?6 OR (subject_id=?1 AND state<>'complete'))
 THEN 1 ELSE json_extract('privacy_admission_refused','$') END AS admitted`).bind(session.u,session.v,session.e,expectedRevision,generation,operationId,session.g??null),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',1,${PRIVACY_DB_NOW},${PRIVACY_DB_NOW})
 ON CONFLICT(subject_id) DO UPDATE SET state='retiring',revision=revision+1,updated_at=${PRIVACY_DB_NOW} WHERE generation=?2 AND state='active'`).bind(session.u,generation),
 env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until)
 VALUES(?1,?2,?3,?4,?5,?6,'waiting_role',${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}+${PRIVACY_REPLAY})`).bind(operationId,session.u,generation,requestDigest,session.v,session.e),
 env.DB.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1 AND session_version=?2').bind(session.u,session.v),
 env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 AND request_digest=?2 AND state='waiting_role')
 THEN 1 ELSE json_extract('privacy_admission_unconfirmed','$') END AS recorded`).bind(operationId,requestDigest),
 ]);
 if(out.length!==5||out[0]?.results[0]?.admitted!==1||out.at(-1)?.results[0]?.recorded!==1)throw Error('privacy_admission_unknown');
 }catch{
 const observed=await erasureRequestStatus(env,request,operationId).catch(()=>null);
 return observed?apiJson({...observed,responseRecovered:true},202):apiJson({error:'erasure_outcome_unknown',operationId},503);
 }
 const status=await erasureRequestStatus(env,request,operationId).catch(()=>null);
 return status?apiJson(status,202):apiJson({error:'erasure_outcome_unknown',operationId},503);
}

/** Automatic inactive-account admission is a distinct source-derived purpose, never a synthesized login.
 * One oldest unused account per run; the database consumes its original inactivity/version/generation
 * snapshot with closure and durable job creation. Zero user-supplied identity or session is accepted.
 */
export async function admitInactiveServingAccount(env:Env):Promise<AccountErasureProof|null>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true'||env.PRIVACY_RETENTION_ENABLED!=='true')return null;
 const row=await env.DB.prepare(`SELECT u.discord_id,u.session_version,u.last_login,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision
 FROM site_users u LEFT JOIN privacy_subjects p ON p.subject_id=u.discord_id
 WHERE u.last_login<=${PRIVACY_DB_NOW}-${PRIVACY_YEAR} AND (p.state IS NULL OR p.state='active')
 AND ${inactiveBetaRetentionSatisfiedSql('u.discord_id')}
 AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=u.discord_id AND c.status NOT IN('unbound','denied','left'))
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=u.discord_id AND j.state<>'complete')
 ORDER BY u.last_login,u.discord_id LIMIT 1`).first<{discord_id:string;session_version:number;last_login:number;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null}>();
 if(!row||!ID.test(row.discord_id))return null;
 const capture=privacyCaptureFromColumns(row.discord_id,row),generation=capture?.subjectGeneration??randomHex(),operationId=randomHex();
 const requestDigest=await digest(JSON.stringify(['inactive_serving_account',row.discord_id,generation,operationId,row.session_version,row.last_login]));
 const proof:AccountErasureProof={purpose:'account_erasure',subject:row.discord_id,subjectGeneration:generation,operationId,requestDigest};
 const current=`EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2 AND last_login=?3 AND last_login<=${PRIVACY_DB_NOW}-${PRIVACY_YEAR})
 AND ${privacyGenerationFenceSql(1,4)} AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?1 AND status NOT IN('unbound','denied','left'))
 AND ${inactiveBetaRetentionSatisfiedSql('?1')}
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE subject_id=?1 AND state<>'complete')`;
 try{
 const result=await env.DB.batch([
 env.DB.prepare(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('privacy_inactive_admission_refused','$') END AS admitted`).bind(row.discord_id,row.session_version,row.last_login,capture?.subjectGeneration??null),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',1,${PRIVACY_DB_NOW},${PRIVACY_DB_NOW})
 ON CONFLICT(subject_id)DO UPDATE SET state='retiring',revision=revision+1,updated_at=${PRIVACY_DB_NOW} WHERE generation=?2 AND state='active'`).bind(row.discord_id,generation),
 env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until)
 VALUES(?1,?2,?3,?4,?5,0,'waiting_role',${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}+${PRIVACY_REPLAY})`).bind(operationId,row.discord_id,generation,requestDigest,row.session_version),
 env.DB.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1 AND session_version=?2').bind(row.discord_id,row.session_version),
 env.DB.prepare(`SELECT CASE WHEN changes()=1 AND ${CURRENT_ERASURE_SQL} THEN 1 ELSE json_extract('privacy_inactive_admission_unconfirmed','$') END AS recorded`).bind(operationId,row.discord_id,generation,requestDigest),
 ]);
 if(result.length!==5||(result.at(-1)?.results[0] as {recorded?:number}|undefined)?.recorded!==1)throw Error('privacy_inactive_admission_unknown');
 }catch{return await currentAccountErasureProof(env,proof).catch(()=>false)?proof:null;}
 return proof;
}

/** Login is a separately authenticated OAuth result, not repair of a missing generation.
 * Capture occurs after /users/@me and before the awaited member lookup. This original capture is
 * consumed with the site-user write. A retired ID alone never bans a genuine new membership.
 */
export async function admittedPrivacyOAuthWrite(env:Env,subject:string,capture:PrivacySubject|null,issuedAt:number|null,write:D1PreparedStatement):Promise<D1Result & {privacySubject:PrivacySubject}>{
 if(!ID.test(subject)||capture?.subject!==subject&&capture!==null)throw Error('privacy_oauth_refused');
 const key=await privacySubjectKey(env,subject),newGeneration=randomHex();
 const generation=capture?.subjectGeneration??null,revision=capture?.revision??null,state=capture?.state??null;
 const allowed=`(CASE WHEN ?2 IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1)
 ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?2 AND revision=?3 AND state=?4
 AND (state='active' OR (state='retired' AND ?5 IS NOT NULL AND ?5>erased_at))) END)
 AND NOT EXISTS(SELECT 1 FROM privacy_denial_markers WHERE subject_key=?6 AND retain_until>${PRIVACY_DB_NOW})`;
 const out=await env.DB.batch<{admitted?:number;recorded?:number}>([
 env.DB.prepare(`SELECT CASE WHEN ${allowed} THEN 1 ELSE json_extract('privacy_oauth_refused','$') END AS admitted`).bind(subject,generation,revision,state,issuedAt,key),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)
 VALUES(?1,?2,'active',1,${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}) ON CONFLICT(subject_id) DO UPDATE SET
 generation=CASE WHEN state='retired' THEN ?2 ELSE generation END,state='active',revision=revision+1,updated_at=${PRIVACY_DB_NOW},retain_until=NULL
 WHERE state IN('active','retired') RETURNING subject_id AS subject,generation AS subjectGeneration,state,revision`).bind(subject,newGeneration),
 write,
 ]);
 const admittedSubject=out[1]?.results[0] as unknown as PrivacySubject|undefined;
 if(out.length!==3||out[0]?.results[0]?.admitted!==1||!admittedSubject||admittedSubject.subject!==subject||admittedSubject.state!=='active'||!HEX32.test(admittedSubject.subjectGeneration))throw Error('privacy_oauth_unknown');
 return {...out[2]!,privacySubject:Object.freeze({...admittedSubject})};
}

/** Original request-generation consumption for bot/accountless writes. Missing is a captured absence,
 * not permission to replace a later generation. Guard and payload share one atomic native batch.
 */
export async function admittedPrivacySubjectWrite(env:Env,subject:string,capture:PrivacySubject|null,statements:D1PreparedStatement[]):Promise<D1Result[]>{
 if(!ID.test(subject)||capture?.subject!==subject&&capture!==null||capture&&capture.state!=='active')throw Error('privacy_write_refused');
 const out=await env.DB.batch<{admitted?:number;recorded?:number}>([
 env.DB.prepare(`SELECT CASE WHEN ${privacyGenerationFenceSql(1,2)} THEN 1 ELSE json_extract('privacy_write_refused','$') END AS admitted`).bind(subject,capture?.subjectGeneration??null),
 ...statements,
 ]);
 if(out.length!==statements.length+1||out[0]?.results[0]?.admitted!==1)throw Error('privacy_write_unknown');
 return out.slice(1);
}
