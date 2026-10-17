/** Private unbound candidate. This DO journal is independent of restored D1, not of privileged DO PITR/deployment rollback. */
import {ServingRecoveryGate,servingOriginalRequestTuple,servingOriginalBody,type ServingFloorReopenInput} from './privacy-serving-recovery-gate';
import {PrivacyRecoverySuppression} from './privacy-recovery-suppression';
import {runOriginalSuppressionCompanionAlarm} from './privacy-recovery-erasure-companion';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeHeaders} from './privacy-native-http-intrinsics';
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {PrivacySuccessorRecovery} from './privacy-successor-floor';
export const RECOVERY_FLOOR_TARGET=Object.freeze({account:'e3c65eaa984aeb7a2df849e5a066cb54',database:'7e2cf8fd-a9e3-48f6-975a-890f1360e5d0',worker:'olympus-verify'});
export const RECOVERY_FLOOR_NAME='olympus-verify/7e2cf8fd-a9e3-48f6-975a-890f1360e5d0/recovery-floor-v1';
export const RECOVERY_FLOOR_PROTOCOL='olympus-private-recovery-floor-v1';
export const FLOOR_NOW="CAST(strftime('%s','now') AS INTEGER)";
const HEX32=/^[0-9a-f]{32}$/,HEX40=/^[0-9a-f]{40}$/,HEX64=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export {RecoveryFloorHeld} from './privacy-recovery-held';
const held=():never=>{throw new RecoveryFloorHeld();};
export type FloorStorage={setAlarm?(time:number):Promise<void>;sql:{exec(sql:string,...bindings:(string|number|null)[]):{toArray():Record<string,unknown>[]}};transactionSync<T>(callback:()=>T):T};
type FloorEnvironment={PRIVACY_RECOVERY_OPERATOR_SECRET?:string;PRIVACY_RECOVERY_INITIALIZER_SECRET?:string;PRIVACY_SERVING_GATE_SECRET?:string;PRIVACY_RECOVERY_SUCCESSOR_SECRET?:string;PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET?:string};
export const FLOOR_DDL=`CREATE TABLE IF NOT EXISTS recovery_floor(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),protocol TEXT NOT NULL CHECK(protocol='${RECOVERY_FLOOR_PROTOCOL}'),
 account TEXT NOT NULL CHECK(account='${RECOVERY_FLOOR_TARGET.account}'),database_id TEXT NOT NULL CHECK(database_id='${RECOVERY_FLOOR_TARGET.database}'),worker TEXT NOT NULL CHECK(worker='${RECOVERY_FLOOR_TARGET.worker}'),
 sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence BETWEEN 1 AND 9007199254740991),
 credential_epoch TEXT NOT NULL CHECK(length(credential_epoch)=32 AND credential_epoch NOT GLOB '*[^0-9a-f]*'),
 write_epoch TEXT NOT NULL CHECK(length(write_epoch)=32 AND write_epoch NOT GLOB '*[^0-9a-f]*' AND write_epoch<>credential_epoch),
 source_tree TEXT NOT NULL CHECK(length(source_tree)=40 AND source_tree NOT GLOB '*[^0-9a-f]*'),deployment_version TEXT NOT NULL,
 operation_id TEXT NOT NULL CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
 changed_at INTEGER NOT NULL CHECK(typeof(changed_at)='integer' AND changed_at BETWEEN 1 AND 9007199254740991))`;
export const JOURNAL_DDL=`CREATE TABLE IF NOT EXISTS recovery_journal(
 operation_id TEXT PRIMARY KEY CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
 purpose TEXT NOT NULL CHECK(purpose IN('initialize','reserve','advance')),nonce TEXT NOT NULL CHECK(length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*'),
 original_floor TEXT NOT NULL,request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 9007199254740691),expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at BETWEEN 301 AND 9007199254740991 AND expires_at=created_at+300),
 state TEXT NOT NULL CHECK(state IN('reserved','complete','unknown')),result_digest TEXT CHECK(result_digest IS NULL OR (length(result_digest)=64 AND result_digest NOT GLOB '*[^0-9a-f]*')),
 completed_at INTEGER CHECK(completed_at IS NULL OR (typeof(completed_at)='integer' AND completed_at BETWEEN 1 AND 9007199254740991)),
 CHECK((state='reserved' AND result_digest IS NULL AND completed_at IS NULL) OR (state<>'reserved' AND result_digest IS NOT NULL AND completed_at IS NOT NULL)))`;
/** Native dispatch custody survives client/process restart. No caller-supplied nonce or renewed deadline. */
export const COMPLETION_DDL=`CREATE TABLE IF NOT EXISTS recovery_completion_attempt(
 operation_id TEXT NOT NULL CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
 phase INTEGER NOT NULL CHECK(typeof(phase)='integer' AND phase IN(0,1)),original_journal TEXT NOT NULL,
 requested TEXT NOT NULL CHECK(requested IN('complete','unknown') AND (phase=0 OR requested='unknown')),
 result_digest TEXT NOT NULL CHECK(length(result_digest)=64 AND result_digest NOT GLOB '*[^0-9a-f]*'),
 state TEXT NOT NULL CHECK(state IN('reserved','complete','refused','unknown')),
 finished_at INTEGER CHECK(finished_at IS NULL OR (typeof(finished_at)='integer' AND finished_at BETWEEN 1 AND 9007199254740991)),
 PRIMARY KEY(operation_id,phase),
 CHECK((state='reserved' AND finished_at IS NULL) OR (state<>'reserved' AND finished_at IS NOT NULL)),
 CHECK((requested='complete' AND state IN('reserved','complete','refused')) OR (requested='unknown' AND state IN('reserved','unknown'))))`;
/** Role epochs are lifetime claims of immutable accepted activations (2026-10-11). No automatic legacy backfill. */
export const EPOCH_CLAIM_DDL=`CREATE TABLE IF NOT EXISTS recovery_epoch_claim(
 kind TEXT NOT NULL CHECK(kind IN('credential','write')),
 epoch TEXT NOT NULL CHECK(length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),
 native_floor TEXT NOT NULL CHECK(length(native_floor) BETWEEN 1 AND 2048 AND json_valid(native_floor)),
 PRIMARY KEY(kind,epoch),
 CHECK(epoch=json_extract(native_floor,CASE kind WHEN 'credential' THEN '$[6]' ELSE '$[7]' END)))`;
export const COMPLETION_TUPLE_SQL="json_array(operation_id,phase,original_journal,requested,result_digest,state,finished_at)";
export const FLOOR_TUPLE_SQL="json_array(singleton,protocol,account,database_id,worker,sequence,credential_epoch,write_epoch,source_tree,deployment_version,operation_id,changed_at)";
export const JOURNAL_TUPLE_SQL="json_array(operation_id,purpose,nonce,original_floor,request_digest,created_at,expires_at,state,result_digest,completed_at)";
export function originalSecret(env:FloorEnvironment):string{
 const d=Object.getOwnPropertyDescriptor(env,'PRIVACY_RECOVERY_OPERATOR_SECRET');if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length<32||d.value.length>4096||/[^\x21-\x7e]/.test(d.value))return held();return d.value;
}
export function originalInitializationSecret(env:FloorEnvironment):string{
 const operator=originalSecret(env),d=Object.getOwnPropertyDescriptor(env,'PRIVACY_RECOVERY_INITIALIZER_SECRET');if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length<32||d.value.length>4096||/[^\x21-\x7e]/.test(d.value)||d.value===operator)return held();return d.value;
}
const macPurpose=(path:string)=>path==='/v1/initialize'?'privacy-recovery-floor-initializer-v1':'privacy-recovery-floor-operator-v1';
export async function recoveryFloorMac(secret:string,method:string,path:string,body:string):Promise<string>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const b=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([macPurpose(path),method,path,body])));
 return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function verifyMac(secret:string,path:string,body:string,value:string):Promise<boolean>{
 if(!HEX64.test(value))return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(value.match(/../g)!,v=>parseInt(v,16)),new TextEncoder().encode(JSON.stringify([macPurpose(path),'POST',path,body])));
}
type Common={operationId:string;nonce:string;createdAt:number;expiresAt:number;requestDigest:string};
function record(raw:string,keys:readonly string[]):Record<string,unknown>{
 if(new TextEncoder().encode(raw).length>8192)return held();let v:unknown;try{v=JSON.parse(raw);}catch{return held();}
 if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v)!==raw||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))return held();return v as Record<string,unknown>;
}
function common(v:Record<string,unknown>):Common{
 if(typeof v.operationId!=='string'||!HEX32.test(v.operationId)||typeof v.nonce!=='string'||!HEX32.test(v.nonce)||typeof v.requestDigest!=='string'||!HEX64.test(v.requestDigest)||!Number.isSafeInteger(v.createdAt)||!Number.isSafeInteger(v.expiresAt)||(v.createdAt as number)<=0||v.expiresAt!==(v.createdAt as number)+300)return held();
 return {operationId:v.operationId,nonce:v.nonce,createdAt:v.createdAt as number,expiresAt:v.expiresAt as number,requestDigest:v.requestDigest};
}
export function validateFloorTuple(raw:unknown):string{
 if(typeof raw!=='string'||raw.length>2048)return held();let a:unknown;try{a=JSON.parse(raw);}catch{return held();}
 if(!Array.isArray(a)||a.length!==12||JSON.stringify(a)!==raw||a[0]!==1||a[1]!==RECOVERY_FLOOR_PROTOCOL||a[2]!==RECOVERY_FLOOR_TARGET.account||a[3]!==RECOVERY_FLOOR_TARGET.database||a[4]!==RECOVERY_FLOOR_TARGET.worker||!Number.isSafeInteger(a[5])||a[5]<1||!HEX32.test(typeof a[6]==='string'?a[6]:'')||!HEX32.test(typeof a[7]==='string'?a[7]:'')||a[6]===a[7]||!HEX40.test(typeof a[8]==='string'?a[8]:'')||!UUID.test(typeof a[9]==='string'?a[9]:'')||!HEX32.test(typeof a[10]==='string'?a[10]:'')||!Number.isSafeInteger(a[11])||a[11]<1)return held();return raw;
}
export function validateJournalTuple(raw:unknown):string{
 if(typeof raw!=='string'||raw.length>4096)return held();let a:unknown;try{a=JSON.parse(raw);}catch{return held();}
 if(!Array.isArray(a)||a.length!==10||JSON.stringify(a)!==raw||!HEX32.test(typeof a[0]==='string'?a[0]:'')||!['initialize','reserve','advance'].includes(a[1])||!HEX32.test(typeof a[2]==='string'?a[2]:'')||typeof a[3]!=='string'||(a[1]==='initialize'?a[3]!=='' : validateFloorTuple(a[3])!==a[3])||!HEX64.test(typeof a[4]==='string'?a[4]:'')||!Number.isSafeInteger(a[5])||a[5]<1||!Number.isSafeInteger(a[6])||a[6]!==a[5]+300||!['reserved','complete','unknown'].includes(a[7])||(a[1]!=='reserve'&&a[7]!=='complete'))return held();
 if(a[7]==='reserved'&&(a[8]!==null||a[9]!==null))return held();
 if(a[7]!=='reserved'&&(!HEX64.test(typeof a[8]==='string'?a[8]:'')||!Number.isSafeInteger(a[9])||a[9]<1))return held();return raw;
}
export function validateCompletionTuple(raw:unknown):string{
 if(typeof raw!=='string'||raw.length>6144)return held();let a:unknown;try{a=JSON.parse(raw);}catch{return held();}
 if(!Array.isArray(a)||a.length!==7||JSON.stringify(a)!==raw||typeof a[0]!=='string'||!HEX32.test(a[0])||!Number.isInteger(a[1])||!([0,1] as unknown[]).includes(a[1])||typeof a[2]!=='string'||!['complete','unknown'].includes(a[3])||typeof a[4]!=='string'||!HEX64.test(a[4])||!['reserved','complete','refused','unknown'].includes(a[5]))return held();
 const j=JSON.parse(validateJournalTuple(a[2])) as unknown[];if(j[0]!==a[0]||j[1]!=='reserve'||j[7]!=='reserved'||(a[1]===1&&a[3]!=='unknown'))return held();
 if(a[5]==='reserved'?a[6]!==null:!Number.isSafeInteger(a[6])||(a[6] as number)<1)return held();
 if(a[3]==='complete'?!['reserved','complete','refused'].includes(a[5]):!['reserved','unknown'].includes(a[5]))return held();return raw;
}
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
/** Shared native Body mixin/reader lane is servingOriginalBody from Gate. */
/** Plain fetch-capable class; deliberately absent from index exports/configuration. Only private binding dispatch is planned. */
export class PrivacyRecoveryFloor{
 private readonly storage:FloorStorage;private readonly env:FloorEnvironment;
 constructor(ctx:{storage:FloorStorage},env:FloorEnvironment){this.storage=ctx.storage;this.env=env;this.storage.transactionSync(()=>{this.storage.sql.exec(FLOOR_DDL);this.storage.sql.exec(JOURNAL_DDL);this.storage.sql.exec(COMPLETION_DDL);this.storage.sql.exec(EPOCH_CLAIM_DDL);});}
 async alarm():Promise<void>{await runOriginalSuppressionCompanionAlarm(this.storage);}
 private rows(sql:string,...b:(string|number|null)[]){return this.storage.sql.exec(sql,...b).toArray();}
 private one(sql:string,...b:(string|number|null)[]):Record<string,unknown>{const r=this.rows(sql,...b);if(r.length!==1)return held();return r[0]!;}
 private floor():string{return validateFloorTuple(this.one(`SELECT ${FLOOR_TUPLE_SQL} tuple FROM recovery_floor WHERE singleton=1`).tuple);}
 private journal(operation:string):string{return validateJournalTuple(this.one(`SELECT ${JOURNAL_TUPLE_SQL} tuple FROM recovery_journal WHERE operation_id=?`,operation).tuple);}
 private completion(operation:string):string|null{const r=this.rows(`SELECT ${COMPLETION_TUPLE_SQL} tuple FROM recovery_completion_attempt WHERE operation_id=? ORDER BY phase DESC LIMIT 1`,operation);if(r.length>1)return held();return r.length?validateCompletionTuple(r[0]!.tuple):null;}
 private currentClaims(native:string):void{
  const f=JSON.parse(validateFloorTuple(native)) as unknown[];
  const r=this.rows(`SELECT kind,CASE WHEN instr(native_floor,char(0))=0 THEN native_floor ELSE NULL END AS native_floor FROM recovery_epoch_claim WHERE kind='credential' AND epoch=?1
   UNION ALL SELECT kind,CASE WHEN instr(native_floor,char(0))=0 THEN native_floor ELSE NULL END AS native_floor FROM recovery_epoch_claim WHERE kind='write' AND epoch=?2`,f[6] as string,f[7] as string);
  if(r.length!==2||r.map(v=>v.kind).sort().join('|')!=='credential|write'||r.some(v=>validateFloorTuple(v.native_floor)!==native))return held();
 }
 private claimActivation(native:string):void{
  const f=JSON.parse(validateFloorTuple(native)) as unknown[];
  const r=this.rows(`INSERT INTO recovery_epoch_claim(kind,epoch,native_floor)
   SELECT 'credential',?1,?3 WHERE ?3=(SELECT ${FLOOR_TUPLE_SQL} FROM recovery_floor WHERE singleton=1)
   UNION ALL SELECT 'write',?2,?3 WHERE ?3=(SELECT ${FLOOR_TUPLE_SQL} FROM recovery_floor WHERE singleton=1) RETURNING kind`,f[6] as string,f[7] as string,native);
  if(r.length!==2||r.map(v=>v.kind).sort().join('|')!=='credential|write')return held();
 }
 private fresh(v:Common,ordinaryAdvance=false):void{this.one(`SELECT CASE WHEN ?1<=${FLOOR_NOW} AND ?2>${FLOOR_NOW} AND (?3=0 OR NOT EXISTS(SELECT 1 FROM sqlite_master WHERE lower(name)='recovery_serving_gate' AND type IN('table','view'))) THEN 1 ELSE json_extract('recovery_deadline_or_managed_advance_held','$') END admitted`,v.createdAt,v.expiresAt,ordinaryAdvance?1:0);}
 private insert(v:Common,purpose:'initialize'|'reserve'|'advance',floor:string,state:'reserved'|'complete'='reserved'):void{
  const rows=this.rows(`INSERT INTO recovery_journal(operation_id,purpose,nonce,original_floor,request_digest,created_at,expires_at,state,result_digest,completed_at)
   SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10 WHERE ?6<=${FLOOR_NOW} AND ?7>${FLOOR_NOW}
    AND ((?2='initialize' AND ?4='' AND EXISTS(SELECT 1 FROM recovery_floor WHERE singleton=1 AND operation_id=?1))
      OR (?2<>'initialize' AND ?4=(SELECT ${FLOOR_TUPLE_SQL} FROM recovery_floor WHERE singleton=1)))
   RETURNING operation_id`,v.operationId,purpose,v.nonce,floor,v.requestDigest,v.createdAt,v.expiresAt,state,state==='complete'?v.requestDigest:null,state==='complete'?v.createdAt:null);if(rows.length!==1)return held();
 }
 /** Only the gate's accepted original reopen transaction may call this; ordinary /advance remains closed once a managed gate exists. */
 private reopenServingFloor(original:string,value:ServingFloorReopenInput):string{
  const c=common(value as unknown as Record<string,unknown>);if(this.floor()!==validateFloorTuple(original))return held();this.currentClaims(original);const f=JSON.parse(original) as unknown[];
  if(typeof value.credentialEpoch!=='string'||value.credentialEpoch.length!==32||/[^0-9a-f]/.test(value.credentialEpoch)||typeof value.writeEpoch!=='string'||value.writeEpoch.length!==32||/[^0-9a-f]/.test(value.writeEpoch)||value.credentialEpoch===value.writeEpoch||value.credentialEpoch===f[6]||value.writeEpoch===f[7]||typeof value.sourceTree!=='string'||value.sourceTree.length!==40||/[^0-9a-f]/.test(value.sourceTree)||typeof value.deploymentVersion!=='string'||value.deploymentVersion.length!==36||!UUID.test(value.deploymentVersion))return held();
  this.rows(`SELECT CASE WHEN ?1<=${FLOOR_NOW} AND ?2>${FLOOR_NOW} AND NOT EXISTS(SELECT 1 FROM recovery_epoch_claim WHERE(kind='credential' AND epoch=?3)OR(kind='write' AND epoch=?4)) THEN 1 ELSE json_extract('serving_reopen_epoch_held','$') END admitted`,c.createdAt,c.expiresAt,value.credentialEpoch,value.writeEpoch);
  this.insert(c,'advance',original,'complete');const r=this.rows(`UPDATE recovery_floor SET sequence=sequence+1,credential_epoch=?1,write_epoch=?2,source_tree=?3,deployment_version=?4,operation_id=?5,changed_at=${FLOOR_NOW}
   WHERE singleton=1 AND ${FLOOR_TUPLE_SQL}=?6 AND sequence<9007199254740991 AND credential_epoch<>?1 AND write_epoch<>?2
    AND ?7<=${FLOOR_NOW} AND ?8>${FLOOR_NOW} RETURNING singleton`,value.credentialEpoch,value.writeEpoch,value.sourceTree,value.deploymentVersion,c.operationId,original,c.createdAt,c.expiresAt);
  if(r.length!==1)return held();const native=this.floor();this.claimActivation(native);return native;
 }

 async fetch(request:Request):Promise<Response>{
  try{
   const originalRequest=servingOriginalRequestTuple(request),u=new URL(originalRequest.url);if(u.origin!=='https://privacy-recovery-floor.invalid')return response({error:'recovery_floor_held'},404);
   if(u.pathname.startsWith('/v1/suppression/')||u.pathname==='/v2/suppression/reserve'||u.pathname==='/v2/suppression/status-observe'||u.pathname==='/v3/suppression/associate-original'||u.pathname==='/v3/suppression/resolve-original')return await new PrivacyRecoverySuppression(this.storage,this.env,{floor:()=>this.floor(),claims:native=>this.currentClaims(native),validateFloor:validateFloorTuple}).fetch(request);
   if(u.pathname.startsWith('/v1/serving/'))return new ServingRecoveryGate(this.storage,this.env,{floor:()=>this.floor(),claims:native=>this.currentClaims(native),validateFloor:validateFloorTuple,reopenFloor:(original,value)=>this.reopenServingFloor(original,value)}).fetch(request);
   if(u.pathname.startsWith('/v2/successor/'))return await new PrivacySuccessorRecovery(this.storage,this.env,{floor:()=>this.floor(),claims:native=>this.currentClaims(native),validateFloor:validateFloorTuple,advanceFloor:(original,value)=>this.reopenServingFloor(original,value),floorTupleSQL:FLOOR_TUPLE_SQL,journalTupleSQL:JOURNAL_TUPLE_SQL,completionTupleSQL:COMPLETION_TUPLE_SQL}).fetch(request);
    if(originalRequest.method==='GET'&&u.pathname==='/v1/floor'&&!u.search)return response({floor:this.floor(),readyToReopen:false});
   if(originalRequest.method==='GET'&&u.pathname==='/v1/status'&&[...u.searchParams.keys()].join('|')==='operation'&&HEX32.test(u.searchParams.get('operation')??''))return response({journal:this.journal(u.searchParams.get('operation')!),attempt:this.completion(u.searchParams.get('operation')!),readyToReopen:false});
   if(originalRequest.method!=='POST'||u.search||!['/v1/initialize','/v1/reserve','/v1/advance','/v1/completion-reserve','/v1/complete'].includes(u.pathname))return response({error:'recovery_floor_held'},404);
   const captureSecret=()=>u.pathname==='/v1/initialize'?originalInitializationSecret(this.env):originalSecret(this.env),secret=captureSecret(),headers=Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,request,[]) as Headers;checkOriginalNativeHeaders(headers);const get=ORIGINAL_HEADER_DESCRIPTORS.get!.value,proof=Reflect.apply(get,headers,['X-Olympus-Recovery-Proof']) as string|null;
   const keys=['PRIVACY_RECOVERY_OPERATOR_SECRET','PRIVACY_RECOVERY_INITIALIZER_SECRET','PRIVACY_SERVING_GATE_SECRET'] as const,prototype=Object.getPrototypeOf(this.env),slots=keys.map(key=>({key,descriptor:Object.getOwnPropertyDescriptor(this.env,key)}));
   const check=()=>{checkOriginalNativeRequest(request);checkOriginalNativeHeaders(headers);if(servingOriginalRequestTuple(request).url!==originalRequest.url||servingOriginalRequestTuple(request).method!==originalRequest.method||Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,request,[])!==headers||Reflect.apply(get,headers,['X-Olympus-Recovery-Proof'])!==proof||Object.getPrototypeOf(this.env)!==prototype||captureSecret()!==secret)return held();for(const s of slots){const actual=Object.getOwnPropertyDescriptor(this.env,s.key),before=s.descriptor;if(before===undefined?actual!==undefined:!actual||['value','get','set','writable','enumerable','configurable'].some(k=>before[k as keyof PropertyDescriptor]!==actual[k as keyof PropertyDescriptor]))return held();}};check();
   const raw=await servingOriginalBody(request,check);check();if(!(await verifyMac(secret,u.pathname,raw,proof??'')))return response({error:'recovery_floor_held'},403);check();
   const names=['operationId','nonce','createdAt','expiresAt','requestDigest'];
   const v=record(raw,u.pathname==='/v1/initialize'?[...names,'credentialEpoch','writeEpoch','sourceTree','deploymentVersion']:u.pathname==='/v1/advance'?[...names,'originalFloor','credentialEpoch','writeEpoch','sourceTree','deploymentVersion']:u.pathname==='/v1/reserve'?[...names,'originalFloor']:u.pathname==='/v1/completion-reserve'?['originalJournal','result','resultDigest','priorAttempt']:['originalAttempt']);
   const out=this.storage.transactionSync(()=>{check();
    if(u.pathname==='/v1/completion-reserve'){
     const original=validateJournalTuple(v.originalJournal),a=JSON.parse(original) as unknown[];if(a[1]!=='reserve'||a[7]!=='reserved'||!['complete','unknown'].includes(v.result as string)||typeof v.resultDigest!=='string'||!HEX64.test(v.resultDigest))return held();
     if(this.journal(a[0] as string)!==original)return held();let phase=0,prior:string|null=null;
     if(v.priorAttempt!==null){prior=validateCompletionTuple(v.priorAttempt);const p=JSON.parse(prior) as unknown[];if(p[0]!==a[0]||p[1]!==0||p[2]!==original||p[3]!=='complete'||p[5]!=='refused'||v.result!=='unknown')return held();phase=1;}
     const inserted=this.rows(`INSERT INTO recovery_completion_attempt(operation_id,phase,original_journal,requested,result_digest,state,finished_at)
      SELECT ?1,?2,?3,?4,?5,'reserved',NULL WHERE ?3=(SELECT ${JOURNAL_TUPLE_SQL} FROM recovery_journal WHERE operation_id=?1)
       AND ((?2=0 AND ?6 IS NULL AND NOT EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE operation_id=?1))
        OR (?2=1 AND ?6=(SELECT ${COMPLETION_TUPLE_SQL} FROM recovery_completion_attempt WHERE operation_id=?1 AND phase=0 AND state='refused')))
      RETURNING operation_id`,a[0] as string,phase,original,v.result as string,v.resultDigest,prior);
     if(inserted.length!==1)return held();return {journal:original,attempt:this.completion(a[0] as string),readyToReopen:false};
    }
    if(u.pathname==='/v1/complete'){
     const original=validateCompletionTuple(v.originalAttempt),a=JSON.parse(original) as unknown[];if(a[5]!=='reserved'||this.completion(a[0] as string)!==original||this.journal(a[0] as string)!==a[2])return held();
     const r=this.rows(`UPDATE recovery_completion_attempt SET state=CASE WHEN requested='unknown' THEN 'unknown'
       WHEN json_extract(original_journal,'$[6]')>${FLOOR_NOW} AND json_extract(original_journal,'$[3]')=(SELECT ${FLOOR_TUPLE_SQL} FROM recovery_floor WHERE singleton=1) THEN 'complete' ELSE 'refused' END,finished_at=${FLOOR_NOW}
      WHERE operation_id=?2 AND phase=?3 AND ${COMPLETION_TUPLE_SQL}=?1 AND state='reserved' AND original_journal=(SELECT ${JOURNAL_TUPLE_SQL} FROM recovery_journal WHERE operation_id=recovery_completion_attempt.operation_id) RETURNING state,${COMPLETION_TUPLE_SQL} tuple`,original,a[0] as string,a[1] as number);
     if(r.length!==1)return held();const state=r[0]!.state,terminal=validateCompletionTuple(r[0]!.tuple);
     const settled=this.rows(`UPDATE recovery_journal SET state=?1,result_digest=?2,completed_at=json_extract(?4,'$[6]')
      WHERE operation_id=?5 AND ${JOURNAL_TUPLE_SQL}=?3 AND state='reserved' AND ?1 IN('complete','unknown')
       AND EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE operation_id=?5 AND phase=?6 AND ${COMPLETION_TUPLE_SQL}=?4 AND state=?1) RETURNING operation_id`,state as string,a[4] as string,a[2] as string,terminal,a[0] as string,a[1] as number);
     if(state==='refused'?settled.length!==0:settled.length!==1)return held();const journal=this.journal(a[0] as string),attempt=this.completion(a[0] as string);
     return state==='refused'?{error:'recovery_floor_held',journal,attempt,readyToReopen:false}:{journal,attempt,readyToReopen:false};
    }
    const c=common(v);this.fresh(c,u.pathname==='/v1/advance');
    if(u.pathname==='/v1/initialize'){
     if(this.rows('SELECT singleton FROM recovery_floor UNION ALL SELECT 1 FROM recovery_journal UNION ALL SELECT 1 FROM recovery_completion_attempt UNION ALL SELECT 1 FROM recovery_epoch_claim LIMIT 1').length!==0)return held();
    }else{const native=this.floor();if(native!==validateFloorTuple(v.originalFloor))return held();this.currentClaims(native);}
    if(u.pathname==='/v1/reserve'){this.insert(c,'reserve',v.originalFloor as string);return {journal:this.journal(c.operationId),readyToReopen:false};}
    if(typeof v.credentialEpoch!=='string'||!HEX32.test(v.credentialEpoch)||typeof v.writeEpoch!=='string'||!HEX32.test(v.writeEpoch)||v.credentialEpoch===v.writeEpoch||typeof v.sourceTree!=='string'||!HEX40.test(v.sourceTree)||typeof v.deploymentVersion!=='string'||!UUID.test(v.deploymentVersion))return held();
    if(u.pathname==='/v1/initialize'){
     this.rows(`INSERT INTO recovery_floor(singleton,protocol,account,database_id,worker,sequence,credential_epoch,write_epoch,source_tree,deployment_version,operation_id,changed_at)VALUES(1,?1,?2,?3,?4,1,?5,?6,?7,?8,?9,${FLOOR_NOW}) RETURNING singleton`,RECOVERY_FLOOR_PROTOCOL,RECOVERY_FLOOR_TARGET.account,RECOVERY_FLOOR_TARGET.database,RECOVERY_FLOOR_TARGET.worker,v.credentialEpoch,v.writeEpoch,v.sourceTree,v.deploymentVersion,c.operationId);
     this.insert(c,'initialize','', 'complete');const native=this.floor();this.claimActivation(native);return {floor:native,journal:this.journal(c.operationId),readyToReopen:false};
    }
    this.insert(c,'advance',v.originalFloor as string,'complete');
    const r=this.rows(`UPDATE recovery_floor SET sequence=sequence+1,credential_epoch=?1,write_epoch=?2,source_tree=?3,deployment_version=?4,operation_id=?5,changed_at=${FLOOR_NOW}
     WHERE singleton=1 AND ${FLOOR_TUPLE_SQL}=?6 AND credential_epoch<>?1 AND write_epoch<>?2 AND sequence<9007199254740991 RETURNING singleton`,v.credentialEpoch,v.writeEpoch,v.sourceTree,v.deploymentVersion,c.operationId,v.originalFloor as string);
    if(r.length!==1)return held();const native=this.floor();this.claimActivation(native);return {floor:native,journal:this.journal(c.operationId),readyToReopen:false};
   });return response(out,Object.hasOwn(out,'error')?409:200);
  }catch{return response({error:'recovery_floor_held'},409);}
 }
}
