/** Serving erasure authority, distinct from the dormant .129 foundation.
 * A retained raw ID here is operational restore/write-suppression identity, not the denial marker.
 * A database restored from an old export is NEVER its own evidence of current replay authority.
 */
import type { Env } from './env';
import {snapshotErasureStatusData,snapshotErasureStatusAdmissionData,erasureStatusBody,verifyOriginalErasureStatusCode,originalErasureStatusCodeFacts,type OriginalVerifiedErasureStatusCode} from './privacy-erasure-status-credential';
import {originalErasureStatusAdmissionContext,originalErasureStatusAdmissionReceipt,observeOriginalErasureStatusCompletion} from './privacy-global-serving-origin';
import {ERASURE_STATUS_CODE_READ_SQL,erasureStatusProofReadSql,erasureStatusSessionReadSql} from './privacy-erasure-status-native-data';
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
import {assertOriginalRecoveryDataIntrinsics,recoveryScalarArrayJSON,recoveryDataUtf8Bytes} from './privacy-recovery-data-json';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeHeaders} from './privacy-native-http-intrinsics';
import {originalPrivacyAdmissionOpaqueReference,originalPrivacyAdmissionGroupProjection,createPrivacyAdmissionAlias,copyPrivacyAdmissionBind,isPrivacyWriteAdmissionDatabase,admissionTransportCost,privacyAdmissionAliasDescendsFrom,assertPrivacyAdmissionWitness} from './privacy-write-admission';
import {staffCustodyProjectionSql,staffAccessDetails,type StaffAccessDetails,type StaffCustodyCounts} from './privacy-erasure-staff-custody';
import type { PendingRow } from './db';
import { readSession, sameOrigin, PAGE_VERSION, sign, verify, b64u, apiJson } from './site-core';
import {inactiveBetaRetentionSatisfiedSql} from './privacy-retention-clocks';
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';

export const PRIVACY_DB_NOW = "CAST(strftime('%s','now') AS INTEGER)";
export const PRIVACY_YEAR = 365 * 86400;
export const PRIVACY_REPLAY = 366 * 86400;
const HEX32 = /^[0-9a-f]{32}$/;
const ID = /^\d{17,20}$/;
const HEX64 = /^[0-9a-f]{64}$/;
export type PrivacySubject = { subject: string; subjectGeneration: string; state: 'active'|'retiring'|'retired'; revision: number };
export type AccountErasureProof = { purpose: 'account_erasure'; subject: string; subjectGeneration: string; operationId: string; requestDigest: string; accountIncarnation:string|null };
export type MemberRoleSettlement = { state: 'absent'|'removed'|'held'|'unknown'; checkedAt: number|null; staffAccess: 'human-managed'|'none'|'unknown' };
export type ErasureRoleSettler = (env: Env, proof: AccountErasureProof) => Promise<MemberRoleSettlement>;
export { PRIVACY_SERVING_SCHEMA } from './privacy-serving-schema';

const randomHex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function privacySubjectKey(env: Env, subject: string): Promise<string> {
 if(!ID.test(subject) || !env.COOKIE_SECRET) throw Error('privacy_identity_unavailable');
 return sign(env.COOKIE_SECRET,'privacy-denial-v1',subject);
}
async function digest(text: string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** An original account birth is exactly32 ASCII lowercase hex bytes. No regex end-anchor truncation. */
export function privacyAccountIncarnation(value:unknown):string{
 if(typeof value!=='string'||value.length!==32)throw Error('privacy_account_incarnation_invalid');
 for(let i=0;i<32;i++){const c=value.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102))throw Error('privacy_account_incarnation_invalid');}
 return value;
}
/** Authored column expressions only; strict fixed hex is the only interpolated credential scalar. */
export function privacyAccountIncarnationLiteralFenceSql(column:string,original:unknown):string{
 const n=privacyAccountIncarnation(original);
 return `(typeof(${column})='text' AND length(${column})=32 AND length(CAST(${column} AS BLOB))=32 AND instr(${column},char(0))=0 AND ${column} NOT GLOB '*[^0-9a-f]*' AND ${column}='${n}' COLLATE BINARY)`;
}
/** Fixed identifiers only. A missing row does not itself authorize a role operation. */
export const privacySubjectWritableSql=(idExpression:string):string=>`NOT EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=${idExpression} AND ps.state<>'active')`;
export function privacyGenerationFenceSql(subjectParam:number,generationParam:number):string {
 return privacyGenerationExpressionFenceSql(`?${subjectParam}`,`?${generationParam}`);
}
/** Authored SQL expressions only; callers never pass a user-controlled identifier or SQL fragment. */
export function privacyGenerationExpressionFenceSql(subject:string,generation:string):string{return `(CASE WHEN ${generation} IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subject}) ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subject} AND generation=${generation} AND state='active') END)`;}
/** A strict literal is captured from a verified cookie/row, never an SQL identifier or arbitrary request text. */
export function privacyGenerationLiteralFenceSql(subjectExpression:string,generation:string|null):string{
 if(generation===null)return `NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subjectExpression})`;
 if(!HEX32.test(generation))throw Error('privacy_generation_invalid');
 return `EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=${subjectExpression} AND generation='${generation}' AND state='active')`;
}
export class PrivacySiteRequestHeld extends Error{constructor(){super('privacy_site_request_held');}}
type AuthorityBind=string|number|null|Readonly<{blob:readonly number[]}>;
type AuthorityPlan=Readonly<{sql:string;values:readonly AuthorityBind[]|null}>;
type AuthorityMethod=Readonly<{receiver:object;owner:object;fn:Function}>;
type AuthorityContext=Readonly<{base:D1Database;check:()=>void;guard:AuthorityPlan|null;purpose:'site_session'|'subject_generation'|'provider_custody'}>;
const authorityContexts=new WeakMap<D1Database,AuthorityContext>(),custodyByEnv=new WeakMap<Env,D1Database>();
type OriginalAuthorityProjection=Readonly<{logical:readonly AuthorityPlan[];records:readonly object[];check:()=>void}>;
type OriginalAuthorityBatchLineage=Readonly<{kind:'ordinary'|'counted';parent:object;guardCount:number;check:()=>void}>;
const originalAuthorityProjectors=new WeakMap<D1Database,(plan:D1PreparedStatement[])=>OriginalAuthorityProjection>();
const originalAuthorityBatchLineages=new WeakMap<object,OriginalAuthorityBatchLineage>();
/** Read-only facts from source-owned inert records; no caller-shaped group registration or native unwrap. */
export function originalPrivacyStatementGroupProjection(db:D1Database,plan:D1PreparedStatement[]):OriginalAuthorityProjection{
 if(isPrivacyWriteAdmissionDatabase(db))return originalPrivacyAdmissionGroupProjection(db,plan);
 const project=originalAuthorityProjectors.get(db);if(!project)return authorityHeld();return project(plan);
}
export function originalPrivacyAuthorityBatchLineage(plan:object):OriginalAuthorityBatchLineage|null{const r=originalAuthorityBatchLineages.get(plan)??originalAuthorityBatchLineages.get(originalPrivacyAdmissionOpaqueReference(plan));r?.check();return r??null;}
function originalAuthorityArrayWitness(plan:D1PreparedStatement[]):()=>void{
 if(!Array.isArray(plan))return authorityHeld();const prototype=Object.getPrototypeOf(plan),keys=Reflect.ownKeys(plan),length=Object.getOwnPropertyDescriptor(plan,'length');
 if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>1000||keys.length!==length.value+1)return authorityHeld();for(let i=0;i<length.value;i++)if(!keys.includes(String(i)))return authorityHeld();
 const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(plan,k));if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))return authorityHeld();
 const check=()=>{const now=Reflect.ownKeys(plan);if(Object.getPrototypeOf(plan)!==prototype||now.length!==keys.length||keys.some(k=>!now.includes(k)))return authorityHeld();for(let i=0;i<keys.length;i++){const d=Object.getOwnPropertyDescriptor(plan,keys[i]!),old=descriptors[i]!;if(!d||!['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(d[k as keyof PropertyDescriptor],old[k as keyof PropertyDescriptor])))return authorityHeld();}};check();return check;
}

const ownedCounted=new WeakMap<D1Database,{parent:D1Database;native:D1Database;overhead:number;check:()=>void;registered:boolean}>();
const privacyDatabaseOverheads=new WeakMap<D1Database,number>(),privacyBoundActors=new WeakMap<D1Database,string>();
const authorityHeld=():never=>{throw new PrivacySiteRequestHeld();};
function authorityData(object:object,key:string):unknown{const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!Object.hasOwn(d,'value'))return authorityHeld();return d.value;}
function authoritySlot(receiver:object,name:string):AuthorityMethod|null{let owner:object|null=receiver;for(let i=0;i<4&&owner&&owner!==Object.prototype;i++){const d=Object.getOwnPropertyDescriptor(owner,name);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')return authorityHeld();return Object.freeze({receiver,owner,fn:d.value});}owner=Object.getPrototypeOf(owner);}return null;}
function authorityMethod(receiver:object,name:string):AuthorityMethod{const slot=authoritySlot(receiver,name);if(!slot)return authorityHeld();return slot;}
function authoritySame(method:AuthorityMethod,name:string):void{const current=authorityMethod(method.receiver,name);if(current.owner!==method.owner||current.fn!==method.fn)return authorityHeld();}
function authoritySlotSame(receiver:object,name:string,slot:AuthorityMethod|null):void{const current=authoritySlot(receiver,name);if(current?.owner!==slot?.owner||current?.fn!==slot?.fn)return authorityHeld();}
function authorityEnv(env:Env,db:D1Database):Env{const descriptors=Object.getOwnPropertyDescriptors(env);if(!descriptors.DB||!Object.hasOwn(descriptors.DB,'value'))return authorityHeld();descriptors.DB={value:db,enumerable:true,writable:false,configurable:false};return Object.freeze(Object.create(Object.getPrototypeOf(env),descriptors)) as Env;}
function authorityBase(env:Env):{base:D1Database;prepare:AuthorityMethod;batch:AuthorityMethod;check:()=>void}{const base=authorityData(env,'DB');if(!base||typeof base!=='object'||!isPrivacyWriteAdmissionDatabase(base as D1Database)&&!authorityContexts.has(base as D1Database)&&!ownedCounted.has(base as D1Database))return authorityHeld();const prepare=authorityMethod(base,'prepare'),batch=authorityMethod(base,'batch');const check=()=>{if(authorityData(env,'DB')!==base)return authorityHeld();if(isPrivacyWriteAdmissionDatabase(base as D1Database))assertPrivacyAdmissionWitness(base as D1Database);authorityContexts.get(base as D1Database)?.check();ownedCounted.get(base as D1Database)?.check();authoritySame(prepare,'prepare');authoritySame(batch,'batch');};check();return{base:base as D1Database,prepare,batch,check};}
function authoritySession(value:OriginalSiteSession):OriginalSiteSession{assertOriginalSiteSessionRead(value);const u=authorityData(value,'u'),v=authorityData(value,'v'),e=authorityData(value,'e'),g=authorityData(value,'g'),n=privacyAccountIncarnation(authorityData(value,'n'));if(typeof u!=='string'||!ID.test(u)||typeof v!=='number'||!Number.isSafeInteger(v)||v<1||typeof e!=='number'||!Number.isSafeInteger(e)||e<1||g!==null&&(typeof g!=='string'||g.length!==32||!HEX32.test(g)))return authorityHeld();return Object.freeze({u,v,e,g:g as string|null,n});}
function authoritySubject(subject:string,capture:PrivacySubject|null):Readonly<PrivacySubject>|null{if(typeof subject!=='string'||!ID.test(subject))return authorityHeld();if(capture===null)return null;if(!capture||typeof capture!=='object')return authorityHeld();const actor=authorityData(capture,'subject'),generation=authorityData(capture,'subjectGeneration'),state=authorityData(capture,'state'),revision=authorityData(capture,'revision');if(actor!==subject||typeof generation!=='string'||!HEX32.test(generation)||state!=='active'||typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)return authorityHeld();return Object.freeze({subject,subjectGeneration:generation,state,revision});}
function authorityValues(values:readonly AuthorityBind[]):unknown[]{return values.map(v=>v!==null&&typeof v==='object'?Uint8Array.from(v.blob).buffer:v);}
function authorityOwnPlan<T>(input:unknown,records:WeakMap<object,T>,maximum=149):readonly T[]{if(!Array.isArray(input))return authorityHeld();const size=Object.getOwnPropertyDescriptor(input,'length');if(!size||!Object.hasOwn(size,'value')||!Number.isSafeInteger(size.value)||size.value<0||size.value>maximum)return authorityHeld();for(const key of Reflect.ownKeys(input))if(key!=='length'&&(typeof key!=='string'||!/^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=size.value))return authorityHeld();const selected:T[]=[];for(let i=0;i<size.value;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!Object.hasOwn(d,'value'))return authorityHeld();const record=records.get(d.value);if(!record)return authorityHeld();selected.push(record);}return Object.freeze(selected);}
function authorityColumn(value:unknown):string|undefined{if(value!==undefined&&typeof value!=='string')return authorityHeld();return value as string|undefined;}
function authorityRawOptions(value:unknown):Readonly<{columnNames:boolean}>{if(value===undefined)return Object.freeze({columnNames:false});if(!value||typeof value!=='object'||Reflect.ownKeys(value).some(k=>k!=='columnNames'))return authorityHeld();const d=Object.getOwnPropertyDescriptor(value,'columnNames');if(d&&(!Object.hasOwn(d,'value')||typeof d.value!=='boolean'))return authorityHeld();return Object.freeze({columnNames:d?.value===true});}
/** Operational custody strips only ordinary G/session. Central epoch/schema and original methods remain.
 * It supplies no operation proof; every original retained-result claim predicate is still mandatory. */
export function privacyProviderCustodyDatabase(env:Env):D1Database{
 const original=authorityBase(env),counted=ownedCounted.get(original.base);if(counted){counted.check();if(!counted.registered)return authorityHeld();return counted.native;}
 const prior=custodyByEnv.get(env);if(prior){original.check();return prior;}
 const context=authorityContexts.get(original.base);let base=context?.base??original.base;
 for(let depth=0;authorityContexts.has(base)||ownedCounted.has(base);depth++){if(depth>=32)return authorityHeld();const ordinary=authorityContexts.get(base),countedParent=ownedCounted.get(base);if(ordinary){ordinary.check();base=ordinary.base;}else{countedParent!.check();if(!countedParent!.registered)return authorityHeld();base=countedParent!.native;}}
 if(!isPrivacyWriteAdmissionDatabase(base))return authorityHeld();
 const check=()=>{original.check();context?.check();};const alias=createPrivacyAdmissionAlias(base,check);custodyByEnv.set(env,alias);return alias;
}
export const privacyDatabaseAdmissionOverhead=(db:D1Database):number=>{authorityContexts.get(db)?.check();ownedCounted.get(db)?.check();return privacyDatabaseOverheads.get(db)??0;};
/** Only the source factory below can register a counted sibling, once, against its original parent. */
export function registerPrivacyCountedDatabase(db:D1Database,native:D1Database,overhead:number,parent:D1Database):void{const r=ownedCounted.get(db);if(!r||r.registered||r.parent!==parent||r.native!==native||r.overhead!==overhead||!Number.isSafeInteger(overhead)||overhead<0||!isPrivacyWriteAdmissionDatabase(native))return authorityHeld();r.check();r.registered=true;privacyDatabaseOverheads.set(db,overhead);}
export const privacyActorAlreadyBound=(env:Env,subject:string):boolean=>{const db=authorityData(env,'DB') as D1Database;authorityContexts.get(db)?.check();return privacyBoundActors.get(db)===subject;};
/** Original own-data cookie projection is copied before the first await, never renewed. */
export function privacyBoundSiteEnv(env:Env,session:OriginalSiteSession):Env{
 const captured=authoritySession(session),guard=Object.freeze({sql:`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',captured.n)})
 AND ?3>${PRIVACY_DB_NOW} AND ${privacyGenerationFenceSql(1,4)} THEN 1 ELSE json_extract('privacy_site_request_refused','$') END AS admitted`,values:Object.freeze([captured.u,captured.v,captured.e,captured.g])});
 return privacyBoundDbEnv(env,guard,'site_session',()=>{if(JSON.stringify(authoritySession(session))!==JSON.stringify(captured))return authorityHeld();});
}
/** Original subject/G or explicit absence is copied, with the existing active-state contract. */
export function privacyBoundSubjectEnv(env:Env,subject:string,capture:PrivacySubject|null):Env{
 const captured=authoritySubject(subject,capture),guard=Object.freeze({sql:`SELECT CASE WHEN ${privacyGenerationFenceSql(1,2)} THEN 1 ELSE json_extract('privacy_bot_request_refused','$') END AS admitted`,values:Object.freeze([subject,captured?.subjectGeneration??null])});
 const bound=privacyBoundDbEnv(env,guard,'subject_generation',()=>{if(JSON.stringify(authoritySubject(subject,capture))!==JSON.stringify(captured))return authorityHeld();});privacyBoundActors.set(bound.DB,subject);return bound;
}
function privacyBoundDbEnv(env:Env,guard:AuthorityPlan,purpose:'site_session'|'subject_generation',authority:()=>void):Env{
 const original=authorityBase(env),records=new WeakMap<object,AuthorityPlan>();const check=()=>{original.check();authority();original.check();};check();
 const materialize=(plan:AuthorityPlan):D1PreparedStatement=>{check();const raw=Reflect.apply(original.prepare.fn,original.prepare.receiver,[plan.sql]) as D1PreparedStatement;check();if(plan.values===null)return raw;const bind=authorityMethod(raw,'bind'),out=Reflect.apply(bind.fn,bind.receiver,authorityValues(plan.values)) as D1PreparedStatement;check();authoritySame(bind,'bind');return out;};
 const batch=async<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{check();const selected=authorityOwnPlan(statements,records);const projection=originalPrivacyStatementGroupProjection(db,statements),native=[materialize(guard),...selected.map(materialize)],arrayCheck=originalAuthorityArrayWitness(native),derived=originalPrivacyStatementGroupProjection(original.base,native);const current=()=>{check();projection.check();arrayCheck();derived.check();};current();originalAuthorityBatchLineages.set(originalPrivacyAdmissionOpaqueReference(native),Object.freeze({kind:'ordinary',parent:originalPrivacyAdmissionOpaqueReference(statements),guardCount:1,check:current}));check();let out:D1Result<T>[];try{out=await Reflect.apply(original.batch.fn,original.batch.receiver,[native]) as D1Result<T>[];check();}catch{return authorityHeld();}if(out.length!==selected.length+1||(out[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)return authorityHeld();return out.slice(1);};
 const make=(sql:string,values:readonly AuthorityBind[]|null):D1PreparedStatement=>{check();if(typeof sql!=='string'||sql.includes('\0'))return authorityHeld();const plan=Object.freeze({sql,values}),statement={
  bind(...values:unknown[]){check();return make(sql,Object.freeze(values.map(copyPrivacyAdmissionBind)));},
  async all<T=unknown>(){return(await batch<T>([statement as unknown as D1PreparedStatement]))[0]!;},
  async run<T=unknown>(){return(await batch<T>([statement as unknown as D1PreparedStatement]))[0]!;},
  async first<T=unknown>(column?:string){const key=authorityColumn(column),row=(await batch([statement as unknown as D1PreparedStatement]))[0]?.results[0]??null;return(key&&row!==null?(row as Record<string,unknown>)[key]??null:row) as T|null;},
  async raw<T=unknown>(options?:{columnNames?:boolean}){const selected=authorityRawOptions(options);if(!/^\s*SELECT\b/i.test(sql))return authorityHeld();await batch([]);check();const raw=materialize(plan),method=authorityMethod(raw,'raw'),out=await Reflect.apply(method.fn,method.receiver,selected.columnNames?[Object.freeze({columnNames:true})]:[]) as T[];check();authoritySame(method,'raw');await batch([]);check();return out;},
 };records.set(statement,plan);return Object.freeze(statement) as unknown as D1PreparedStatement;};
 const db=Object.freeze({prepare:(sql:string)=>make(sql,null),batch,exec(){return authorityHeld();},dump(){return authorityHeld();},withSession(){return authorityHeld();}}) as unknown as D1Database;
 originalAuthorityProjectors.set(db,plan=>{check();const selected=authorityOwnPlan(plan,records),arrayCheck=originalAuthorityArrayWitness(plan),current=()=>{check();arrayCheck();const now=authorityOwnPlan(plan,records);if(now.length!==selected.length||now.some((r,i)=>r!==selected[i]))return authorityHeld();};current();return Object.freeze({logical:selected,records:Object.freeze(selected.map(()=>Object.freeze({}))),check:current});});
 authorityContexts.set(db,Object.freeze({base:original.base,check,guard,purpose}));privacyDatabaseOverheads.set(db,privacyDatabaseAdmissionOverhead(original.base)+1);return authorityEnv(env,db);
}
/** Source-owned counted wrappers retain exact own RAW provenance; central creates admitted siblings. */
export function privacyCountedEnvironment(env:Env,count:{used:number;factor?:number;protocol?:boolean}):Env{
 const original=authorityBase(env),overhead=privacyDatabaseAdmissionOverhead(original.base),native=privacyProviderCustodyDatabase(env),protocol=isPrivacyWriteAdmissionDatabase(native);count.protocol=protocol;count.factor=1+overhead;original.check();
 const charge=(sqls:readonly string[],kind:'batch'|'raw',extra:number)=>{original.check();count.used+=kind==='raw'?1+2*extra:sqls.length+extra+(protocol?admissionTransportCost(sqls):0);original.check();};
 const decorate=(base:D1Database,extra:number):D1Database=>{
  if(isPrivacyWriteAdmissionDatabase(base))return createPrivacyAdmissionAlias(base,original.check,(sqls,kind)=>charge(sqls,kind,extra),()=>{original.check();count.used++;original.check();});
  const prepare=authorityMethod(base,'prepare'),batch=authorityMethod(base,'batch'),records=new WeakMap<object,Readonly<{raw:D1PreparedStatement;sql:string;current:()=>void}>>(),RAW=Symbol('raw statement');
  const check=()=>{original.check();authoritySame(prepare,'prepare');authoritySame(batch,'batch');};
  const wrap=(raw:D1PreparedStatement,sql:string):D1PreparedStatement=>{const methods=new Map(['bind','first','all','run','raw'].map(name=>[name,authoritySlot(raw,name)] as const));const method=(name:string)=>{const m=methods.get(name);if(!m)return authorityHeld();return m;};const current=()=>{check();for(const[name,m]of methods)authoritySlotSame(raw,name,m);};current();const read=async(name:string,args:unknown[])=>{current();const m=method(name);charge([sql],name==='raw'?'raw':'batch',extra);current();const out=await Reflect.apply(m.fn,m.receiver,args);current();return out;};const wrapper={
   bind(...values:unknown[]){current();const m=method('bind'),next=Reflect.apply(m.fn,m.receiver,values) as D1PreparedStatement,out=wrap(next,sql);current();return out;},
   first<T=unknown>(column?:string){const key=authorityColumn(column);return read('first',key===undefined?[]:[key]) as Promise<T|null>;},
   all<T=unknown>(){return read('all',[]) as Promise<D1Result<T>>;},run<T=unknown>(){return read('run',[]) as Promise<D1Result<T>>;},
   raw<T=unknown>(options?:{columnNames?:boolean}){const o=authorityRawOptions(options);return read('raw',o.columnNames?[Object.freeze({columnNames:true})]:[]) as Promise<T[]>;},[RAW]:raw,
  };records.set(wrapper,Object.freeze({raw,sql,current}));return Object.freeze(wrapper) as unknown as D1PreparedStatement;};
  const countedDb=Object.freeze({prepare(sql:string){check();const raw=Reflect.apply(prepare.fn,prepare.receiver,[sql]) as D1PreparedStatement,out=wrap(raw,sql);check();return out;},async batch<T=unknown>(statements:D1PreparedStatement[]){check();const owned=authorityOwnPlan(statements,records);charge(owned.map(s=>s.sql),'batch',extra);check();for(const r of owned)r.current();const projection=originalPrivacyStatementGroupProjection(countedDb,statements),native=owned.map(s=>s.raw),arrayCheck=originalAuthorityArrayWitness(native),derived=originalPrivacyStatementGroupProjection(base,native),current=()=>{check();projection.check();arrayCheck();derived.check();for(const r of owned)r.current();};current();originalAuthorityBatchLineages.set(originalPrivacyAdmissionOpaqueReference(native),Object.freeze({kind:'counted',parent:originalPrivacyAdmissionOpaqueReference(statements),guardCount:0,check:current}));const out=await Reflect.apply(batch.fn,batch.receiver,[native]) as D1Result<T>[];check();for(const r of owned)r.current();return out;},exec(){return authorityHeld();},dump(){return authorityHeld();},withSession(){return authorityHeld();}}) as unknown as D1Database;
  originalAuthorityProjectors.set(countedDb,plan=>{check();const owned=authorityOwnPlan(plan,records),arrayCheck=originalAuthorityArrayWitness(plan),raw=owned.map(s=>s.raw),parent=originalPrivacyStatementGroupProjection(base,raw),current=()=>{check();arrayCheck();parent.check();const now=authorityOwnPlan(plan,records);if(now.length!==owned.length||now.some((r,i)=>r!==owned[i]))return authorityHeld();for(const r of owned)r.current();};current();return Object.freeze({logical:parent.logical,records:Object.freeze(owned.map(()=>Object.freeze({}))),check:current});});return countedDb;
 };
 const counted=decorate(original.base,overhead),custody=native===original.base?counted:decorate(native,0);if(!privacyAdmissionAliasDescendsFrom(custody,native))return authorityHeld();ownedCounted.set(counted,{parent:original.base,native:custody,overhead,check:original.check,registered:false});registerPrivacyCountedDatabase(counted,custody,overhead,original.base);return authorityEnv(env,counted);
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
/** A finite plain durable job capture. This creates no cookie/origin brand and never reads a latest account nonce. */
export function captureAccountErasureProof(input:AccountErasureProof):{proof:Readonly<AccountErasureProof>;check:()=>void}{
 const keys=['purpose','subject','subjectGeneration','operationId','requestDigest','accountIncarnation'] as const,slots=keys.map(k=>{const d=input&&Object.getOwnPropertyDescriptor(input,k);if(!d||!Object.hasOwn(d,'value')||d.get||d.set)throw Error('privacy_proof_invalid');return d;});
 const proof=Object.freeze({purpose:slots[0]!.value as 'account_erasure',subject:slots[1]!.value as string,subjectGeneration:slots[2]!.value as string,operationId:slots[3]!.value as string,requestDigest:slots[4]!.value as string,accountIncarnation:slots[5]!.value as string|null});
 if(proof.purpose!=='account_erasure'||typeof proof.subject!=='string'||proof.subject.length<17||proof.subject.length>20||/[^0-9]/.test(proof.subject)||typeof proof.subjectGeneration!=='string'||proof.subjectGeneration.length!==32||/[^0-9a-f]/.test(proof.subjectGeneration)||typeof proof.operationId!=='string'||proof.operationId.length!==32||/[^0-9a-f]/.test(proof.operationId)||typeof proof.requestDigest!=='string'||proof.requestDigest.length!==64||/[^0-9a-f]/.test(proof.requestDigest))throw Error('privacy_proof_invalid');if(proof.accountIncarnation!==null)privacyAccountIncarnation(proof.accountIncarnation);
 const check=()=>{for(let i=0;i<keys.length;i++){const d=Object.getOwnPropertyDescriptor(input,keys[i]!);if(!d||!Object.hasOwn(d,'value')||d.value!==slots[i]!.value)throw Error('privacy_proof_changed');}};check();return {proof,check};
}
export const originalErasureJobBirthSql=(p:AccountErasureProof,column='j.original_account_incarnation')=>{const captured=captureAccountErasureProof(p);return captured.proof.accountIncarnation===null?`${column} IS NULL`:privacyAccountIncarnationLiteralFenceSql(column,captured.proof.accountIncarnation);};
function proofValues(p:AccountErasureProof):[string,string,string,string]{
 p=captureAccountErasureProof(p).proof;
 if(p.purpose!=='account_erasure'||!ID.test(p.subject)||!HEX32.test(p.subjectGeneration)||!HEX32.test(p.operationId)||!HEX64.test(p.requestDigest))throw Error('privacy_proof_invalid');
 return [p.operationId,p.subject,p.subjectGeneration,p.requestDigest];
}
export const CURRENT_ERASURE_SQL=`EXISTS(SELECT 1 FROM privacy_serving_jobs j JOIN privacy_subjects s ON s.subject_id=j.subject_id
 WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4
  AND ((j.original_account_incarnation IS NULL AND j.original_session_version=0 AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=j.subject_id)) OR (j.original_account_incarnation IS NOT NULL AND typeof(j.original_account_incarnation)='text' AND length(j.original_account_incarnation)=32 AND length(CAST(j.original_account_incarnation AS BLOB))=32 AND instr(j.original_account_incarnation,char(0))=0 AND j.original_account_incarnation NOT GLOB '*[^0-9a-f]*' AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=j.subject_id AND account_incarnation=j.original_account_incarnation))) AND j.state IN('waiting_role','held') AND s.state='retiring' AND s.generation=?3 AND j.retain_until>${PRIVACY_DB_NOW})`;
export async function currentAccountErasureProof(env:Env,p:AccountErasureProof):Promise<boolean>{
 const original=captureAccountErasureProof(p);p=original.proof;const values=proofValues(p);original.check();const row=await env.DB.prepare(`SELECT (${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(p)})) AS current`).bind(...values).first<{current:number}>();original.check();return row?.current===1;
}
export async function readErasureProof(env:Env,operationId:string):Promise<AccountErasureProof|null>{
 if(!HEX32.test(operationId))return null;
 const row=await env.DB.prepare("SELECT subject_id AS subject,subject_generation AS subjectGeneration,operation_id AS operationId,request_digest AS requestDigest,original_account_incarnation AS accountIncarnation FROM privacy_serving_jobs WHERE operation_id=?1 AND state IN('waiting_role','held')").bind(operationId).first<Omit<AccountErasureProof,'purpose'>>();
 if(!row)return null;const proof={purpose:'account_erasure' as const,subject:authorityData(row,'subject') as string,subjectGeneration:authorityData(row,'subjectGeneration') as string,operationId:authorityData(row,'operationId') as string,requestDigest:authorityData(row,'requestDigest') as string,accountIncarnation:authorityData(row,'accountIncarnation') as string|null};return captureAccountErasureProof(proof).proof;
}
export type ErasureRequestResult={operationId:string;state:'waiting_role'|'held'|'complete';holdReason:string|null;servingAccountErased:boolean;servingLocalErased:boolean;statusRequirement:'independent'|'local_only'|'unclassified';allCopiesErased:false;externalCleanup:{known:number;unknown:number;expiredUnresolved:number};recoveryCopies:'operator-held';staffAccess:'human-managed'|'none'|'unknown';staffAccessDetails:StaffAccessDetails;statusToken:string;statusExpires:number};
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
 const origin=originalErasureStatusAdmissionReceipt(env,original.terminalRow);if(!origin)return null;
 const config=statusEnv(env),started=originalRecoveryClockMilliseconds();const check=()=>{original.check();config.check();current();origin.check();const now=originalRecoveryClockMilliseconds();if(now<started||now>=started+5000||now<original.values.createdAt*1000||now>=(original.values.createdAt+300)*1000)return statusHeld();};check();
 const body=erasureStatusBody(original.values,'independent'),mac=await statusOriginalMac(config.secret,'erasure-status-v2',body,check);check();return body+'.'+mac;
}

function originalStatusRequest(request:Request):Readonly<{method:string;version:string|null;check:()=>void}>{
 const tuple=()=>{checkOriginalNativeRequest(request);const url=Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.url!.get!,request,[]) as string,method=Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.method!.get!,request,[]) as string,headers=Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,request,[]) as Headers;checkOriginalNativeHeaders(headers);const entries=Reflect.apply(ORIGINAL_HEADER_DESCRIPTORS.entries!.value,headers,[]) as Iterable<[string,string]>,rows:string[][]=[];for(const row of entries)rows.push([row[0],row[1]]);return {text:recoveryScalarArrayJSON([url,method,rows]),method,version:Reflect.apply(ORIGINAL_HEADER_DESCRIPTORS.get!.value,headers,['X-Olympus']) as string|null};};
 const original=tuple(),check=()=>{const now=tuple();if(now.text!==original.text||now.method!==original.method||now.version!==original.version)return statusHeld();};check();return Object.freeze({method:original.method,version:original.version,check});
}
type StatusRow={state:ErasureRequestResult['state'];hold_reason:string|null;staff_access:ErasureRequestResult['staffAccess'];request_digest:string;subject_generation:string;retain_until:number;status_terminal:string};
function originalStatusRow(row:StatusRow):Readonly<{row:StatusRow;check:()=>void}>{const original=snapshotErasureStatusData(row);if(!row||typeof row!=='object'||Reflect.ownKeys(row).length!==7)return statusHeld();const state=authorityData(row,'state'),hold=authorityData(row,'hold_reason'),staff=authorityData(row,'staff_access'),digest=authorityData(row,'request_digest'),g=authorityData(row,'subject_generation'),retain=authorityData(row,'retain_until'),terminal=authorityData(row,'status_terminal');if(typeof terminal!=='string'||terminal.length>1024)return statusHeld();if(!['waiting_role','held','complete'].includes(state as string)||hold!==null&&typeof hold!=='string'||!['human-managed','none','unknown'].includes(staff as string)||typeof digest!=='string'||digest.length!==64||/[^0-9a-f]/.test(digest)||typeof g!=='string'||g.length!==32||/[^0-9a-f]/.test(g)||typeof retain!=='number'||!Number.isSafeInteger(retain)||retain<1)return statusHeld();const copy=Object.freeze({state:state as StatusRow['state'],hold_reason:hold as string|null,staff_access:staff as StatusRow['staff_access'],request_digest:digest,subject_generation:g,retain_until:retain,status_terminal:terminal});return Object.freeze({row:copy,check:original.check});}
async function statusResult(env:Env,operationId:string,input:StatusRow,credential:OriginalVerifiedErasureStatusCode|null=null,current:()=>void=()=>{}):Promise<ErasureRequestResult>{
 const original=originalStatusRow(input),row=original.row,base=authorityBase(env),code=credential?originalErasureStatusCodeFacts(credential,env):null;const check=()=>{original.check();base.check();current();code?.check();};check();
 if(code&&(code.claims.o!==operationId||code.claims.d!==row.request_digest||code.claims.g!==row.subject_generation||code.claims.e!==row.retain_until))return statusHeld();
 const debt=await privacyProviderCustodyDatabase(env).prepare(`SELECT COALESCE(SUM(m.state IN('known','cleaning')),0) AS known,COALESCE(SUM(m.state IN('claimed','unknown')),0) AS unknown,
 COALESCE(SUM(m.retain_until<=${PRIVACY_DB_NOW}),0) AS expiredUnresolved,
 ${staffCustodyProjectionSql('(SELECT subject_id FROM privacy_serving_jobs WHERE operation_id=?1 AND request_digest=?2)')} FROM privacy_provider_messages m
 WHERE m.state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM privacy_serving_jobs j JOIN json_each(m.subjects)x WHERE j.operation_id=?1 AND j.request_digest=?2 AND json_extract(x.value,'$.id')=j.subject_id)`)
 .bind(operationId,row.request_digest).first<{known:number;unknown:number;expiredUnresolved:number}&StaffCustodyCounts>();check();const debtData=snapshotErasureStatusData(debt);debtData.check();
 const required=code?.claims.r??'unclassified',local=false;let independentlyConfirmed=false;
 if(row.state==='complete'&&credential&&code?.claims.v===2&&required==='independent'){try{independentlyConfirmed=await observeOriginalErasureStatusCompletion(env,input,credential,check);check();debtData.check();}catch{independentlyConfirmed=false;}}
 check();debtData.check();const unconfirmed=row.state==='complete'&&!independentlyConfirmed;
 return {operationId,state:unconfirmed?'held':row.state,holdReason:unconfirmed?'independent_suppression_status_unconfirmed':row.hold_reason,servingAccountErased:independentlyConfirmed,servingLocalErased:local,statusRequirement:required,allCopiesErased:false,externalCleanup:debt?{known:debt.known,unknown:debt.unknown,expiredUnresolved:debt.expiredUnresolved}:{known:0,unknown:0,expiredUnresolved:0},recoveryCopies:'operator-held',staffAccess:row.staff_access,staffAccessDetails:staffAccessDetails(row.staff_access,debt),statusToken:code?.code??'',statusExpires:row.retain_until};
}
/** Trusted original proof callers receive no credential from a retained or recovered row. */
export async function statusByAccountErasureProof(env:Env,proof:AccountErasureProof,statusToken?:string):Promise<ErasureRequestResult|null>{
 const original=captureAccountErasureProof(proof);proof=original.proof;const values=proofValues(proof),base=authorityBase(env);const check=()=>{original.check();base.check();};check();
 const row=await privacyProviderCustodyDatabase(env).prepare(erasureStatusProofReadSql(proof.accountIncarnation))
 .bind(...values).first<StatusRow>();check();if(!row)return null;const originalRow=originalStatusRow(row),current=()=>{check();originalRow.check();};current();
 const credential=statusToken===undefined?null:await verifyOriginalErasureStatusCode(env,statusToken,current);current();if(statusToken!==undefined&&!credential)return null;return statusResult(env,proof.operationId,row,credential,current);
}
/** Same original fixed code, including after account/cookie deletion; no code issuance in this reader. */
export async function erasureRequestStatus(env:Env,request:Request,operationId:string,statusToken?:string):Promise<ErasureRequestResult|null>{
 if(typeof operationId!=='string'||operationId.length!==32||!HEX32.test(operationId))return null;
 const base=authorityBase(env);
 if(statusToken!==undefined){
  if(typeof statusToken!=='string'||statusToken.length>1024)return null;const requestData=originalStatusRequest(request),current=()=>{base.check();requestData.check();};current();
  if(!sameOrigin(request)||requestData.method!=='POST'||requestData.version!==PAGE_VERSION)return null;
  const credential=await verifyOriginalErasureStatusCode(env,statusToken,current);current();if(!credential)return null;const code=originalErasureStatusCodeFacts(credential,env);if(code.claims.o!==operationId)return null;
  const row=await privacyProviderCustodyDatabase(env).prepare(ERASURE_STATUS_CODE_READ_SQL)
   .bind(operationId,code.claims.d,code.claims.g,code.claims.e).first<StatusRow>();current();code.check();return row?statusResult(env,operationId,row,credential,current):null;
 }
 const session=await readSession(env,request);if(!session||!ID.test(session.u))return null;
 assertOriginalSiteSessionRead(session);const row=await env.DB.prepare(erasureStatusSessionReadSql(session.n))
 .bind(operationId,session.u,session.v,session.e).first<StatusRow>();
 assertOriginalSiteSessionRead(session);if(!row)return null;const originalRow=originalStatusRow(row),current=()=>{assertOriginalSiteSessionRead(session);originalRow.check();base.check();};current();
 if(row.request_digest!==await digest(JSON.stringify(['serving_account_incarnation_v1',session.u,row.subject_generation,operationId,session.v,session.e,session.g??null,session.n])))return null;current();
 return statusResult(env,operationId,row,null,current);
}
/** Genuine original cookie admission; no generic create-if-missing authority and no staff acting-as-subject. */
export async function requestServingErasure(env:Env,request:Request,operationId:string):Promise<Response>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return apiJson({error:'feature_disabled'},503);
 if(request.method!=='POST'||new URL(request.url).pathname!=='/api/me/erasure'||!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION||!HEX32.test(operationId))return apiJson({error:'invalid_request'},400);
 const session=await readSession(env,request);
 if(!session||!ID.test(session.u)||!Number.isSafeInteger(session.v)||session.v<1||!Number.isSafeInteger(session.e))return apiJson({error:'signed_out'},401);
 assertOriginalSiteSessionRead(session);const prior=await erasureRequestStatus(env,request,operationId);assertOriginalSiteSessionRead(session);if(prior)return apiJson({...prior,replay:true},prior.state==='complete'?200:202);
 const subject=await readPrivacySubject(env,session.u);assertOriginalSiteSessionRead(session);
 if((subject?.subjectGeneration??null)!==(session.g??null))return apiJson({error:'signed_out'},401);
 if(subject&&subject.state!=='active')return apiJson({error:'erasure_in_progress'},409);
 const generation=subject?.subjectGeneration??randomHex(),requestDigest=await digest(JSON.stringify(['serving_account_incarnation_v1',session.u,generation,operationId,session.v,session.e,session.g??null,session.n]));
 assertOriginalSiteSessionRead(session);privacyAccountIncarnation(session.n);const expectedRevision=subject?.revision??null,originalSubject=snapshotErasureStatusData(subject),originalDb=authorityBase(env);let originalStatusCode:string|null=null;const admissionOrigin=originalErasureStatusAdmissionContext(env);admissionOrigin?.check();
 try {
 const out=await env.DB.batch<{admitted?:number;recorded?:number;status_admission?:string}>([
 env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',session.n)}) AND ?3>${PRIVACY_DB_NOW}
 AND (CASE WHEN ?4 IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1) ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?5 AND revision=?4 AND state='active') END)
 AND ${privacyGenerationFenceSql(1,7)}
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?6 OR (subject_id=?1 AND state<>'complete'))
 THEN 1 ELSE json_extract('privacy_admission_refused','$') END AS admitted`).bind(session.u,session.v,session.e,expectedRevision,generation,operationId,session.g??null),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',1,${PRIVACY_DB_NOW},${PRIVACY_DB_NOW})
 ON CONFLICT(subject_id) DO UPDATE SET state='retiring',revision=revision+1,updated_at=${PRIVACY_DB_NOW} WHERE generation=?2 AND state='active'`).bind(session.u,generation),
 env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)
 VALUES(?1,?2,?3,?4,?5,?6,'${session.n}','waiting_role',${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}+${PRIVACY_REPLAY})`).bind(operationId,session.u,generation,requestDigest,session.v,session.e),
 env.DB.prepare(`UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1 AND session_version=?2 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',session.n)}`).bind(session.u,session.v),
 env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 AND request_digest=?2 AND state='waiting_role')
 THEN 1 ELSE json_extract('privacy_admission_unconfirmed','$') END AS recorded,
 (SELECT json_array(operation_id,subject_id,subject_generation,request_digest,created_at,retain_until,original_session_version,original_session_expires,original_account_incarnation)
 FROM privacy_serving_jobs WHERE operation_id=?1 AND request_digest=?2) AS status_admission`).bind(operationId,requestDigest),
 ]);
 const originalAck=snapshotErasureStatusAdmissionData(out,5,'recorded',Object.freeze({operationId,subject:session.u,generation,requestDigest,version:session.v,expires:session.e,incarnation:session.n}));
 const current=()=>{originalAck.check();assertOriginalSiteSessionRead(session);originalSubject.check();originalDb.check();admissionOrigin?.check();};current();originalStatusCode=await issueKnownOriginalStatusCode(env,originalAck,current);current();
 }catch{
 // A failed original code signer may indicate intrinsic drift; hold before any cookie recovery reader.
 statusHmacIntrinsics();
 const observed=await erasureRequestStatus(env,request,operationId).catch(()=>null);
 return observed?apiJson({...observed,responseRecovered:true},202):apiJson({error:'erasure_outcome_unknown',operationId},503);
 }
 const status=originalStatusCode?await erasureRequestStatus(env,request,operationId,originalStatusCode).catch(()=>null):await statusByAccountErasureProof(env,Object.freeze({purpose:'account_erasure' as const,subject:session.u,subjectGeneration:generation,operationId,requestDigest,accountIncarnation:session.n})).catch(()=>null);
 return status?apiJson(status,202):apiJson({operationId,state:'held',holdReason:'independent_suppression_status_unconfirmed',servingAccountErased:false,servingLocalErased:false,statusRequirement:'unclassified',allCopiesErased:false,statusToken:'',privateStatusCodeAvailable:false},202);
}

/** Automatic inactive-account admission is a distinct source-derived purpose, never a synthesized login.
 * One oldest unused account per run; the database consumes its original inactivity/version/generation
 * snapshot with closure and durable job creation. Zero user-supplied identity or session is accepted.
 */
export async function admitInactiveServingAccount(env:Env):Promise<AccountErasureProof|null>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true'||env.PRIVACY_RETENTION_ENABLED!=='true')return null;
 const nativeRow=await env.DB.prepare(`SELECT u.discord_id,u.account_incarnation,u.session_version,u.last_login,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision
 FROM site_users u LEFT JOIN privacy_subjects p ON p.subject_id=u.discord_id
 WHERE u.last_login<=${PRIVACY_DB_NOW}-${PRIVACY_YEAR} AND (p.state IS NULL OR p.state='active')
 AND ${inactiveBetaRetentionSatisfiedSql('u.discord_id')}
 AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=u.discord_id AND c.status NOT IN('unbound','denied','left'))
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=u.discord_id AND j.state<>'complete')
 ORDER BY u.last_login,u.discord_id LIMIT 1`).first<{discord_id:string;account_incarnation:string;session_version:number;last_login:number;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null}>();
 if(!nativeRow)return null;const row=Object.freeze({discord_id:authorityData(nativeRow,'discord_id') as string,account_incarnation:privacyAccountIncarnation(authorityData(nativeRow,'account_incarnation')),session_version:authorityData(nativeRow,'session_version') as number,last_login:authorityData(nativeRow,'last_login') as number,privacy_generation:authorityData(nativeRow,'privacy_generation') as string|null,privacy_state:authorityData(nativeRow,'privacy_state') as string|null,privacy_revision:authorityData(nativeRow,'privacy_revision') as number|null});if(!ID.test(row.discord_id))return null;
 const capture=privacyCaptureFromColumns(row.discord_id,row),generation=capture?.subjectGeneration??randomHex(),operationId=randomHex();
 const requestDigest=await digest(JSON.stringify(['inactive_serving_account_incarnation_v1',row.discord_id,generation,operationId,row.session_version,row.last_login,row.account_incarnation]));
 const proof:AccountErasureProof={purpose:'account_erasure',subject:row.discord_id,subjectGeneration:generation,operationId,requestDigest,accountIncarnation:row.account_incarnation};
 const current=`EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',row.account_incarnation)} AND session_version=?2 AND last_login=?3 AND last_login<=${PRIVACY_DB_NOW}-${PRIVACY_YEAR})
 AND ${privacyGenerationFenceSql(1,4)} AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?1 AND status NOT IN('unbound','denied','left'))
 AND ${inactiveBetaRetentionSatisfiedSql('?1')}
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE subject_id=?1 AND state<>'complete')`;
 try{
 const result=await env.DB.batch([
 env.DB.prepare(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('privacy_inactive_admission_refused','$') END AS admitted`).bind(row.discord_id,row.session_version,row.last_login,capture?.subjectGeneration??null),
 env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',1,${PRIVACY_DB_NOW},${PRIVACY_DB_NOW})
 ON CONFLICT(subject_id)DO UPDATE SET state='retiring',revision=revision+1,updated_at=${PRIVACY_DB_NOW} WHERE generation=?2 AND state='active'`).bind(row.discord_id,generation),
 env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)
 VALUES(?1,?2,?3,?4,?5,0,'${row.account_incarnation}','waiting_role',${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}+${PRIVACY_REPLAY})`).bind(operationId,row.discord_id,generation,requestDigest,row.session_version),
 env.DB.prepare(`UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1 AND session_version=?2 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',row.account_incarnation)}`).bind(row.discord_id,row.session_version),
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
