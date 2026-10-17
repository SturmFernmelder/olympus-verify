/** Private source-owned lifecycle. Initialization is CLOSED; opening needs distinct original authenticated receipts and one native Floor/gate transaction. */
import type {FloorStorage} from './privacy-recovery-floor';
import {assertNoRecoveryAttemptData} from './privacy-recovery-attempt-schema';
import {validateOriginalProfileMigrationReceipt} from './privacy-migration-receipt-validation';
import {recoveryScalarArrayJSON,recoveryDataUtf8Bytes,assertOriginalRecoveryDataIntrinsics} from './privacy-recovery-data-json';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeHeaders,captureOriginalNativeRequestBody,checkOriginalNativeBodyReader,readOriginalNativeBodyPacket,cancelOriginalNativeBodyReader,releaseOriginalNativeBodyReader} from './privacy-native-http-intrinsics';

import {SUPPRESSION_COMPANION_DDL} from './privacy-recovery-erasure-companion';
import {SUPPRESSION_CONTROL_DDL,SUPPRESSION_JOURNAL_DDL,SUPPRESSION_COPY_DDL,SUPPRESSION_CONTROL_SQL,suppressionOpenGuard,suppressionKeyFingerprint,suppressionNativeKeyGuard} from './privacy-recovery-suppression';
declare const physicalReplayMigrationBrand:unique symbol;
export type OriginalPhysicalReplayMigration=Readonly<{[physicalReplayMigrationBrand]:true}>;
const physicalReplayMigrations=new WeakMap<OriginalPhysicalReplayMigration,{raw:string;native:string;gate:string;epoch:string;check:()=>void}>();
/** Read-only lookup, never a registrar: only the authenticated receiver below issues this evidence. */
export function originalPhysicalReplayMigrationEpoch(value:OriginalPhysicalReplayMigration,raw:string,native:string,gate:string):Readonly<{epoch:string;check:()=>void}>{
 const s=physicalReplayMigrations.get(value);if(!s||s.raw!==raw||s.native!==native||s.gate!==gate)return refuse();s.check();return Object.freeze({epoch:s.epoch,check:s.check});
}
export const SERVING_GATE_PROTOCOL='olympus-private-serving-gate-v1';
export const SERVING_GATE_TABLE='recovery_serving_gate';
export const SERVING_GATE_DDL=`CREATE TABLE recovery_serving_gate(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),protocol TEXT NOT NULL CHECK(protocol='${SERVING_GATE_PROTOCOL}'),
 native_floor TEXT NOT NULL CHECK(length(native_floor) BETWEEN 1 AND 2048 AND json_valid(native_floor)),
 state TEXT NOT NULL CHECK(state IN('managed_open','closing_held')),
 operation_id TEXT,nonce TEXT,request_digest TEXT,created_at INTEGER,expires_at INTEGER,next_write_epoch TEXT,closed_at INTEGER,
 CHECK((state='managed_open' AND operation_id IS NULL AND nonce IS NULL AND request_digest IS NULL AND created_at IS NULL AND expires_at IS NULL AND next_write_epoch IS NULL AND closed_at IS NULL)
 OR (state='closing_held' AND length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*' AND length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*'
 AND length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*' AND typeof(created_at)='integer' AND created_at BETWEEN 1 AND 9007199254740691
 AND typeof(expires_at)='integer' AND expires_at=created_at+300 AND length(next_write_epoch)=32 AND next_write_epoch NOT GLOB '*[^0-9a-f]*'
 AND typeof(closed_at)='integer' AND closed_at>=created_at AND closed_at<expires_at)))`;
export const SERVING_TICKET_DDL=`CREATE TABLE recovery_serving_ticket(
 ticket_id TEXT PRIMARY KEY CHECK(length(ticket_id)=32 AND ticket_id NOT GLOB '*[^0-9a-f]*'),
 parent_ticket_id TEXT CHECK(parent_ticket_id IS NULL OR(length(parent_ticket_id)=32 AND parent_ticket_id NOT GLOB '*[^0-9a-f]*' AND parent_ticket_id<>ticket_id)),
 native_floor TEXT NOT NULL CHECK(length(native_floor) BETWEEN 1 AND 2048 AND json_valid(native_floor)),
 floor_sequence INTEGER NOT NULL CHECK(typeof(floor_sequence)='integer' AND floor_sequence BETWEEN 1 AND 9007199254740991 AND floor_sequence=json_extract(native_floor,'$[5]')),
 purpose TEXT NOT NULL CHECK(purpose IN('fetch','scheduled','deferred','d1','provider')),
 nonce TEXT NOT NULL CHECK(length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*'),request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 9007199254740691),
 expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at=created_at+300),
 state TEXT NOT NULL CHECK(state IN('running','settled','unknown')),result_digest TEXT,finished_at INTEGER,
 CHECK((parent_ticket_id IS NULL AND purpose IN('fetch','scheduled')) OR(parent_ticket_id IS NOT NULL AND purpose IN('deferred','d1','provider'))),
 CHECK((state='running' AND result_digest IS NULL AND finished_at IS NULL) OR(state<>'running' AND length(result_digest)=64 AND result_digest NOT GLOB '*[^0-9a-f]*' AND typeof(finished_at)='integer' AND finished_at>=created_at)))`;
export const SERVING_TICKET_FLOOR_INDEX_DDL='CREATE INDEX recovery_serving_ticket_floor_state ON recovery_serving_ticket(floor_sequence,state,ticket_id)';
export const SERVING_TICKET_PARENT_INDEX_DDL='CREATE INDEX recovery_serving_ticket_parent_state ON recovery_serving_ticket(parent_ticket_id,state,ticket_id)';
export const SERVING_GATE_TUPLE_SQL='json_array(singleton,protocol,native_floor,state,operation_id,nonce,request_digest,created_at,expires_at,next_write_epoch,closed_at)';
export const SERVING_TICKET_TUPLE_SQL='json_array(ticket_id,parent_ticket_id,native_floor,floor_sequence,purpose,nonce,request_digest,created_at,expires_at,state,result_digest,finished_at)';
export const SERVING_GATE_NOW="CAST(strftime('%s','now') AS INTEGER)";
export const SERVING_TICKET_UNRESOLVED_SQL=`SELECT CASE WHEN instr(native_floor,char(0))=0 THEN ${SERVING_TICKET_TUPLE_SQL} ELSE NULL END AS tuple
 FROM recovery_serving_ticket WHERE floor_sequence=?1 AND state IN('running','unknown') ORDER BY state,ticket_id LIMIT 1`;
export const SERVING_TICKET_CHILD_UNRESOLVED_SQL="SELECT 1 FROM recovery_serving_ticket WHERE parent_ticket_id=?1 AND state IN('running','unknown') LIMIT 1";
type GateEnvironment={PRIVACY_RECOVERY_OPERATOR_SECRET?:string;PRIVACY_RECOVERY_INITIALIZER_SECRET?:string;PRIVACY_SERVING_GATE_SECRET?:string};
type Authority={floor():string;claims(native:string):void;validateFloor(raw:unknown):string;reopenFloor?(original:string,value:ServingFloorReopenInput):string};
const refuse=():never=>{throw Error('serving_recovery_gate_held');};
const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x);
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const common=(v:Record<string,unknown>)=>{if(!hex(v.nonce,32)||!hex(v.requestDigest,64)||!integer(v.createdAt)||v.createdAt>9007199254740691||v.expiresAt!==v.createdAt+300)return refuse();};
function secretValue(env:GateEnvironment,name:keyof GateEnvironment):string{const d=Object.getOwnPropertyDescriptor(env,name);if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length<32||d.value.length>4096||/[^\x21-\x7e]/.test(d.value))return refuse();return d.value;}
function roots(env:GateEnvironment){const operator=secretValue(env,'PRIVACY_RECOVERY_OPERATOR_SECRET'),serving=secretValue(env,'PRIVACY_SERVING_GATE_SECRET');if(operator===serving)return refuse();
 const d=Object.getOwnPropertyDescriptor(env,'PRIVACY_RECOVERY_INITIALIZER_SECRET');let initializer:string|null=null;if(d){initializer=secretValue(env,'PRIVACY_RECOVERY_INITIALIZER_SECRET');if(initializer===operator||initializer===serving)return refuse();}else if('PRIVACY_RECOVERY_INITIALIZER_SECRET' in env)return refuse();return {operator,serving,initializer};}
const purpose=(path:string)=>path==='/v1/serving/initialize-closed'?'olympus-private-serving-initialize-closed-v1':path==='/v1/serving/reopen'?'olympus-private-serving-reopen-v1':path==='/v1/serving/observe-cut'||path==='/v1/serving/reconcile-reopen'?'olympus-private-serving-lifecycle-observe-v1':path==='/v1/serving/close'?'olympus-private-serving-close-v1':'olympus-private-serving-ticket-v1';
// Private primitives for the existing action MAC only. No new signer or receipt export.
type ActionMacSlot=Readonly<{receiver:object;key:string;descriptor:PropertyDescriptor;chain:readonly Readonly<{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}>[]}>;
const actionMacSame=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
function captureActionMacSlot(receiver:object,key:string):ActionMacSlot{const chain:{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}[]=[];let p:object|null=receiver;for(let depth=0;p&&depth<32;depth++){const descriptor=Object.getOwnPropertyDescriptor(p,key),prototype=Object.getPrototypeOf(p);chain.push(Object.freeze({ref:p,prototype,descriptor:descriptor?Object.freeze({...descriptor}):undefined}));if(descriptor)return Object.freeze({receiver,key,descriptor:Object.freeze({...descriptor}),chain:Object.freeze(chain)});p=prototype;}return refuse();}
function checkActionMacSlot(slot:ActionMacSlot):void{let p:object|null=slot.receiver;for(const row of slot.chain){if(p!==row.ref||Object.getPrototypeOf(row.ref)!==row.prototype||!actionMacSame(Object.getOwnPropertyDescriptor(row.ref,slot.key),row.descriptor))return refuse();p=row.prototype;}}
function originalActionMacData(slot:ActionMacSlot):unknown{checkActionMacSlot(slot);if(!Object.hasOwn(slot.descriptor,'value'))return refuse();return slot.descriptor.value;}
function originalActionMacNativeProperty(slot:ActionMacSlot):unknown{checkActionMacSlot(slot);const d=slot.descriptor;if(Object.hasOwn(d,'value'))return d.value;if(typeof d.get!=='function'||d.set!==undefined)return refuse();const value=Reflect.apply(d.get,slot.receiver,[]);checkActionMacSlot(slot);return value;}
const actionCryptoSlot=captureActionMacSlot(globalThis,'crypto'),actionCrypto=originalActionMacNativeProperty(actionCryptoSlot);if(!actionCrypto||typeof actionCrypto!=='object')refuse();
const actionSubtleSlot=captureActionMacSlot(actionCrypto as object,'subtle'),actionSubtle=originalActionMacNativeProperty(actionSubtleSlot);if(!actionSubtle||typeof actionSubtle!=='object')refuse();
const actionImportSlot=captureActionMacSlot(actionSubtle as object,'importKey'),actionSignSlot=captureActionMacSlot(actionSubtle as object,'sign'),actionImport=originalActionMacData(actionImportSlot),actionSign=originalActionMacData(actionSignSlot);if(typeof actionImport!=='function'||typeof actionSign!=='function')refuse();
const actionBufferSlot=captureActionMacSlot(globalThis,'ArrayBuffer'),actionByteSlot=captureActionMacSlot(globalThis,'Uint8Array'),actionBuffer=originalActionMacData(actionBufferSlot),actionByte=originalActionMacData(actionByteSlot);if(typeof actionBuffer!=='function'||typeof actionByte!=='function')refuse();
const actionBufferPrototypeSlot=captureActionMacSlot(actionBuffer as Function,'prototype'),actionBufferPrototype=originalActionMacData(actionBufferPrototypeSlot),actionBytePrototypeSlot=captureActionMacSlot(actionByte as Function,'prototype'),actionBytePrototype=originalActionMacData(actionBytePrototypeSlot);if(!actionBufferPrototype||typeof actionBufferPrototype!=='object'||!actionBytePrototype||typeof actionBytePrototype!=='object')refuse();
const actionBufferLengthSlot=captureActionMacSlot(actionBufferPrototype as object,'byteLength'),actionBufferLength=actionBufferLengthSlot.descriptor.get;if(Object.hasOwn(actionBufferLengthSlot.descriptor,'value')||typeof actionBufferLength!=='function'||actionBufferLengthSlot.descriptor.set!==undefined)refuse();
const actionSlots=Object.freeze([actionCryptoSlot,actionSubtleSlot,actionImportSlot,actionSignSlot,actionBufferSlot,actionByteSlot,actionBufferPrototypeSlot,actionBytePrototypeSlot,actionBufferLengthSlot]);
function assertOriginalActionMacIntrinsics():void{assertOriginalRecoveryDataIntrinsics();for(const slot of actionSlots)checkActionMacSlot(slot);}
async function originalServingActionMac(secret:string,parts:readonly string[]):Promise<string>{
 if(typeof secret!=='string')return refuse();assertOriginalActionMacIntrinsics();
 const secretBytes=recoveryDataUtf8Bytes(secret),messageBytes=recoveryDataUtf8Bytes(recoveryScalarArrayJSON(parts));assertOriginalActionMacIntrinsics();
 const key=await Reflect.apply(actionImport as Function,actionSubtle,['raw',secretBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']]);assertOriginalActionMacIntrinsics();
 const out=await Reflect.apply(actionSign as Function,actionSubtle,['HMAC',key,messageBytes]);assertOriginalActionMacIntrinsics();
 if(!out||typeof out!=='object'||Object.getPrototypeOf(out)!==actionBufferPrototype||Reflect.ownKeys(out).length||Reflect.apply(actionBufferLength!,out,[])!==32)return refuse();
 const bytes=Reflect.construct(actionByte as Function,[out]) as Uint8Array;let mac='';for(let i=0;i<32;i++)mac+=bytes[i]!.toString(16).padStart(2,'0');assertOriginalActionMacIntrinsics();return mac;
}

export async function servingGateMac(secret:string,method:string,path:string,body:string):Promise<string>{return originalServingActionMac(secret,[purpose(path),method,path,body]);}
async function verify(secret:string,path:string,body:string,mac:string):Promise<boolean>{if(!hex(mac,64))return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,Uint8Array.from(mac.match(/../g)!,v=>parseInt(v,16)),new TextEncoder().encode(JSON.stringify([purpose(path),'POST',path,body])));}
/** One source-owned native body lane for private Floor/Gate/suppression. No raw reader escapes. */
const ORIGINAL_BODY_BYTES=Uint8Array;
export async function servingOriginalBody(request:Request,boundary:()=>void=()=>undefined):Promise<string>{
 checkOriginalNativeRequest(request);const headers=Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,request,[]) as Headers;checkOriginalNativeHeaders(headers);const get=ORIGINAL_HEADER_DESCRIPTORS.get!.value;
 const type=Reflect.apply(get,headers,['Content-Type']) as string|null,declared=Reflect.apply(get,headers,['Content-Length']) as string|null;
 if(type!=='application/json'||declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>8192))return refuse();let last=Date.now();if(!Number.isSafeInteger(last)||last<=0)return refuse();
 const check=()=>{const now=Date.now();if(!Number.isSafeInteger(now)||now<last)return refuse();last=now;checkOriginalNativeRequest(request);checkOriginalNativeHeaders(headers);if(Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,request,[])!==headers||Reflect.apply(get,headers,['Content-Type'])!==type||Reflect.apply(get,headers,['Content-Length'])!==declared)return refuse();boundary();};check();
 const cap=captureOriginalNativeRequestBody(request);if(cap===null)return refuse();checkOriginalNativeBodyReader(cap);let eof=false,size=0,timer:ReturnType<typeof setTimeout>|undefined;const chunks:{bytes:Uint8Array;length:number}[]=[];
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('serving_original_body_held')),5000);});
 try{for(;;){check();checkOriginalNativeBodyReader(cap);const packet=await Promise.race([readOriginalNativeBodyPacket(cap),timeout]);check();checkOriginalNativeBodyReader(cap);if(packet.done){eof=true;break;}if(packet.value===undefined)return refuse();const length=packet.value.byteLength;size+=length;if(size>8192)return refuse();chunks.push({bytes:packet.value,length});}}
 finally{if(timer!==undefined)clearTimeout(timer);if(eof){try{releaseOriginalNativeBodyReader(cap);}catch{return refuse();}}else{void cancelOriginalNativeBodyReader(cap,'original_body_unknown').then(()=>{try{releaseOriginalNativeBodyReader(cap);}catch{}},()=>{try{releaseOriginalNativeBodyReader(cap);}catch{}});}}
 check();const out=new ORIGINAL_BODY_BYTES(size);let offset=0;for(const chunk of chunks){for(let index=0;index<chunk.length;index++)out[offset+index]=chunk.bytes[index]!;offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(out);
}
function record(raw:string,keys:string[]):Record<string,unknown>{let v:unknown;try{v=JSON.parse(raw);}catch{return refuse();}if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v)!==raw||Object.keys(v).sort().join('|')!==keys.sort().join('|'))return refuse();return v as Record<string,unknown>;}
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const closed={readyToReopen:false,servingAdmissionQualified:false,providerDrainQualified:false,unmanagedOldVersionClosureQualified:false};
/** Private initializer/cut/opener journals. Creation is an explicit initializer operation, never a constructor side effect. */
export const SERVING_CUT_DDL=`CREATE TABLE recovery_serving_cut(
 operation_id TEXT PRIMARY KEY CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
 original_gate TEXT NOT NULL CHECK(json_valid(original_gate)),original_floor TEXT NOT NULL CHECK(json_valid(original_floor)),
 floor_sequence INTEGER NOT NULL CHECK(typeof(floor_sequence)='integer' AND floor_sequence>0),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>0),expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300),
 root_count INTEGER NOT NULL CHECK(typeof(root_count)='integer' AND root_count>=0),child_count INTEGER NOT NULL CHECK(typeof(child_count)='integer' AND child_count>=0),
 CHECK(operation_id=json_extract(original_gate,'$[4]') AND original_floor=json_extract(original_gate,'$[2]')
  AND floor_sequence=json_extract(original_floor,'$[5]') AND created_at=json_extract(original_gate,'$[7]') AND expires_at=json_extract(original_gate,'$[8]')))`;
export const SERVING_LIFECYCLE_DDL=`CREATE TABLE recovery_serving_lifecycle(
 operation_id TEXT PRIMARY KEY CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),
 purpose TEXT NOT NULL CHECK(purpose IN('initialize_closed','reopen')),nonce TEXT NOT NULL CHECK(length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*'),
 request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>0),expires_at INTEGER NOT NULL CHECK(expires_at=created_at+300),
 original_floor TEXT NOT NULL CHECK(json_valid(original_floor)),original_gate TEXT NOT NULL CHECK(json_valid(original_gate)),
 original_cut TEXT,all_writer_receipt TEXT,migration_receipt TEXT,accepted_source_receipt TEXT,
 result_floor TEXT NOT NULL CHECK(json_valid(result_floor)),result_gate TEXT NOT NULL CHECK(json_valid(result_gate)),
 replay_receipt TEXT,completed_at INTEGER NOT NULL CHECK(typeof(completed_at)='integer' AND completed_at>=created_at AND completed_at<expires_at),
 CHECK((purpose='initialize_closed' AND replay_receipt IS NULL AND original_cut IS NULL AND all_writer_receipt IS NULL AND migration_receipt IS NULL AND accepted_source_receipt IS NULL)
  OR(purpose='reopen' AND replay_receipt IS NOT NULL AND json_valid(replay_receipt) AND original_cut IS NOT NULL AND all_writer_receipt IS NOT NULL AND migration_receipt IS NOT NULL AND accepted_source_receipt IS NOT NULL
   AND json_valid(original_cut) AND json_valid(all_writer_receipt) AND json_valid(migration_receipt) AND json_valid(accepted_source_receipt))))`;
export const SERVING_CUT_TUPLE_SQL='json_array(operation_id,original_gate,original_floor,floor_sequence,created_at,expires_at,root_count,child_count)';
export const SERVING_LIFECYCLE_TUPLE_SQL='json_array(operation_id,purpose,nonce,request_digest,created_at,expires_at,original_floor,original_gate,original_cut,all_writer_receipt,migration_receipt,accepted_source_receipt,result_floor,result_gate,completed_at,replay_receipt)';
const SERVING_NATIVE_FLOOR_TUPLE_SQL='json_array(singleton,protocol,account,database_id,worker,sequence,credential_epoch,write_epoch,source_tree,deployment_version,operation_id,changed_at)';
export type ServingFloorReopenInput=Readonly<{operationId:string;nonce:string;requestDigest:string;createdAt:number;expiresAt:number;credentialEpoch:string;writeEpoch:string;sourceTree:string;deploymentVersion:string}>;
/** Ordered transport contracts. Only the private producer may sign after its actual receipt WeakMaps admit all original inputs. */
export type ServingRecoveryReceiptTransport=Readonly<{allWriterCut:string;migrationReceipt:string;acceptedSourceReceipt:string;suppressionReceipt:string}>;
const receiptDomain='olympus-private-serving-recovery-receipts-v2';
export async function servingRecoveryReceiptMac(secret:string,value:ServingRecoveryReceiptTransport):Promise<string>{
 const text=JSON.stringify([receiptDomain,value.allWriterCut,value.migrationReceipt,value.acceptedSourceReceipt,value.suppressionReceipt]);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const out=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));return [...new Uint8Array(out)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function verifyRecoveryReceiptMac(secret:string,value:ServingRecoveryReceiptTransport,mac:string):Promise<boolean>{
 if(!hex(mac,64))return false;const text=JSON.stringify([receiptDomain,value.allWriterCut,value.migrationReceipt,value.acceptedSourceReceipt,value.suppressionReceipt]);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(mac.match(/../g)!,v=>parseInt(v,16)),new TextEncoder().encode(text));
}
const LIFE_PATHS=['/v1/serving/initialize-closed','/v1/serving/observe-cut','/v1/serving/reopen','/v1/serving/reconcile-reopen'] as const;
const LIFE_URL=ORIGINAL_REQUEST_DESCRIPTORS.url!.get!,LIFE_METHOD=ORIGINAL_REQUEST_DESCRIPTORS.method!.get!,LIFE_HEADERS=ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,LIFE_HEADER_GET=ORIGINAL_HEADER_DESCRIPTORS.get!.value as typeof Headers.prototype.get;
type GateSlot=Readonly<{object:object;prototype:object|null;key:PropertyKey;descriptor:PropertyDescriptor|undefined}>;
const slot=(object:object,key:PropertyKey):GateSlot=>Object.freeze({object,prototype:Object.getPrototypeOf(object),key,descriptor:Object.getOwnPropertyDescriptor(object,key)});
function sameSlot(s:GateSlot):void{const d=Object.getOwnPropertyDescriptor(s.object,s.key),a=s.descriptor;if(Object.getPrototypeOf(s.object)!==s.prototype||(a===undefined?d!==undefined:!d||['value','get','set','writable','enumerable','configurable'].some(k=>d[k as keyof PropertyDescriptor]!==a[k as keyof PropertyDescriptor])))return refuse();}
const LIFE_INTRINSIC_SLOTS=Object.freeze([...['url','method','headers','body'].map(k=>slot(Request.prototype,k)),slot(Headers.prototype,'get')]);
/** Native URL/method before any ordinary property read; own shadows refuse without executing getters. */
export function servingOriginalRequestTuple(request:Request):Readonly<{url:string;method:string}>{
 checkOriginalNativeRequest(request);if(!request||typeof request!=='object'||Object.getPrototypeOf(request)!==Request.prototype)return refuse();
 for(const s of LIFE_INTRINSIC_SLOTS)sameSlot(s);for(const k of ['url','method','headers','body'])if(Object.getOwnPropertyDescriptor(request,k)!==undefined)return refuse();
 const url=Reflect.apply(LIFE_URL,request,[]) as string,method=Reflect.apply(LIFE_METHOD,request,[]) as string;
 if(typeof url!=='string'||typeof method!=='string')return refuse();return Object.freeze({url,method});
}
function lifecycleRequest(request:Request,env:GateEnvironment):Readonly<{roots:ReturnType<typeof roots>;headers:Headers;proof:string|null;receiptProof:string|null;check:()=>void}>{
 for(const s of LIFE_INTRINSIC_SLOTS)sameSlot(s);
 if(Object.getPrototypeOf(request)!==Request.prototype)return refuse();const slots:GateSlot[]=['url','method','headers','body'].map(k=>slot(request,k));if(slots.some(s=>s.descriptor!==undefined))return refuse();
 slots.push(...LIFE_INTRINSIC_SLOTS);const headers=Reflect.apply(LIFE_HEADERS,request,[]) as Headers;
 checkOriginalNativeHeaders(headers);if(Object.getPrototypeOf(headers)!==Headers.prototype)return refuse();const get=slot(headers,'get');if(get.descriptor!==undefined)return refuse();slots.push(get,slot(Headers.prototype,'get'));
 const captured=roots(env),rootSlots=(['PRIVACY_RECOVERY_OPERATOR_SECRET','PRIVACY_RECOVERY_INITIALIZER_SECRET','PRIVACY_SERVING_GATE_SECRET'] as const).map(k=>slot(env,k));slots.push(...rootSlots);
 const url=Reflect.apply(LIFE_URL,request,[]),method=Reflect.apply(LIFE_METHOD,request,[]),keys=['Content-Type','Content-Length','X-Olympus-Serving-Proof','X-Olympus-Recovery-Receipt-Proof'],values=keys.map(k=>Reflect.apply(LIFE_HEADER_GET,headers,[k]) as string|null);
 const check=()=>{checkOriginalNativeRequest(request);checkOriginalNativeHeaders(headers);for(const s of slots)sameSlot(s);if(Reflect.apply(LIFE_URL,request,[])!==url||Reflect.apply(LIFE_METHOD,request,[])!==method||Reflect.apply(LIFE_HEADERS,request,[])!==headers||JSON.stringify(roots(env))!==JSON.stringify(captured)||keys.some((k,i)=>Reflect.apply(LIFE_HEADER_GET,headers,[k])!==values[i]))return refuse();};check();return Object.freeze({roots:captured,headers,proof:values[2]!,receiptProof:values[3]!,check});
}

/** Same original FloorStorage; constructor performs no SQL. Lifecycle effects exist only at explicit authenticated routes. */
export class ServingRecoveryGate{
 constructor(private storage:FloorStorage,private env:GateEnvironment,private authority:Authority){}
 private rows(sql:string,...bindings:(string|number|null)[]){return this.storage.sql.exec(sql,...bindings).toArray();}
 private schema():void{const expected=[['table',SERVING_GATE_TABLE,SERVING_GATE_DDL],['table','recovery_serving_ticket',SERVING_TICKET_DDL],['index','recovery_serving_ticket_floor_state',SERVING_TICKET_FLOOR_INDEX_DDL],['index','recovery_serving_ticket_parent_state',SERVING_TICKET_PARENT_INDEX_DDL]];
  const rows=this.rows("SELECT type,name,sql FROM sqlite_master WHERE name IN('recovery_serving_gate','recovery_serving_ticket','recovery_serving_ticket_floor_state','recovery_serving_ticket_parent_state') OR(tbl_name IN('recovery_serving_gate','recovery_serving_ticket') AND sql IS NOT NULL AND type IN('index','trigger')) ORDER BY name");
  if(rows.length!==expected.length||rows.some(r=>!expected.some(e=>r.type===e[0]&&r.name===e[1]&&r.sql===e[2])))return refuse();}
 private parse(raw:unknown,length:number):unknown[]{if(typeof raw!=='string'||raw.length>6144)return refuse();let a:unknown;try{a=JSON.parse(raw);}catch{return refuse();}if(!Array.isArray(a)||a.length!==length||JSON.stringify(a)!==raw)return refuse();return a;}
 private gate(native:string):string{const r=this.rows(`SELECT CASE WHEN instr(native_floor,char(0))=0 THEN ${SERVING_GATE_TUPLE_SQL} ELSE NULL END AS tuple FROM recovery_serving_gate WHERE singleton=1`);if(r.length!==1)return refuse();const a=this.parse(r[0]!.tuple,11);if(a[0]!==1||a[1]!==SERVING_GATE_PROTOCOL||this.authority.validateFloor(a[2])!==native||!['managed_open','closing_held'].includes(a[3] as string))return refuse();
  if(a[3]==='managed_open'){if(a.slice(4).some(v=>v!==null))return refuse();}else if(!hex(a[4],32)||!hex(a[5],32)||!hex(a[6],64)||!integer(a[7])||a[7]>9007199254740691||a[8]!==a[7]+300||!hex(a[9],32)||!integer(a[10])||a[10]<a[7]||a[10]>=(a[8] as number))return refuse();return r[0]!.tuple as string;}
 private validateTicket(raw:unknown):string{const a=this.parse(raw,12),f=JSON.parse(this.authority.validateFloor(a[2])) as unknown[];if(!hex(a[0],32)||a[1]!==null&&(!hex(a[1],32)||a[1]===a[0])||a[3]!==f[5]||!['fetch','scheduled','deferred','d1','provider'].includes(a[4] as string)||!hex(a[5],32)||!hex(a[6],64)||!integer(a[7])||a[7]>9007199254740691||a[8]!==a[7]+300||!['running','settled','unknown'].includes(a[9] as string))return refuse();
  if(a[1]===null?!['fetch','scheduled'].includes(a[4] as string):!['deferred','d1','provider'].includes(a[4] as string))return refuse();if(a[9]==='running'?(a[10]!==null||a[11]!==null):!hex(a[10],64)||!integer(a[11])||a[11]<a[7])return refuse();return raw as string;}
 private ticket(id:string):string{const r=this.rows(`SELECT CASE WHEN instr(native_floor,char(0))=0 THEN ${SERVING_TICKET_TUPLE_SQL} ELSE NULL END AS tuple FROM recovery_serving_ticket WHERE ticket_id=?1`,id);if(r.length!==1)return refuse();return this.validateTicket(r[0]!.tuple);}
 private original():{native:string;gate:string}{this.schema();const native=this.authority.floor();this.authority.claims(native);return {native,gate:this.gate(native)};}
 private lifecycleSchema():void{
  this.schema();const expected=[['table','recovery_serving_cut',SERVING_CUT_DDL],['table','recovery_serving_lifecycle',SERVING_LIFECYCLE_DDL]];
  const r=this.rows("SELECT type,name,sql FROM sqlite_master WHERE name IN('recovery_serving_cut','recovery_serving_lifecycle') OR(tbl_name IN('recovery_serving_cut','recovery_serving_lifecycle') AND sql IS NOT NULL AND type IN('index','trigger')) ORDER BY name");
  if(r.length!==2||r.some(v=>!expected.some(e=>v.type===e[0]&&v.name===e[1]&&v.sql===e[2])))return refuse();
 }
 private captureCut(native:string,gate:string):void{
  const g=this.parse(gate,11),f=this.parse(native,12);if(g[3]!=='closing_held'||g[2]!==native)return refuse();
  const r=this.rows(`INSERT INTO recovery_serving_cut(operation_id,original_gate,original_floor,floor_sequence,created_at,expires_at,root_count,child_count)
   SELECT ?1,?2,?3,?4,?5,?6,(SELECT COUNT(*) FROM recovery_serving_ticket WHERE floor_sequence=?4 AND parent_ticket_id IS NULL),
    (SELECT COUNT(*) FROM recovery_serving_ticket WHERE floor_sequence=?4 AND parent_ticket_id IS NOT NULL)
   WHERE ?2=(SELECT ${SERVING_GATE_TUPLE_SQL} FROM recovery_serving_gate WHERE singleton=1) AND ?3=(SELECT native_floor FROM recovery_serving_gate WHERE singleton=1)
    AND NOT EXISTS(SELECT 1 FROM recovery_serving_ticket WHERE floor_sequence=?4 AND native_floor<>?3) RETURNING operation_id`,g[4] as string,gate,native,f[5] as number,g[7] as number,g[8] as number);
  if(r.length!==1)return refuse();
 }
 private observeCut(native:string,gate:string):string{
  assertNoRecoveryAttemptData(this.storage);
  this.lifecycleSchema();const g=this.parse(gate,11),f=this.parse(native,12);if(g[3]!=='closing_held')return refuse();
  const r=this.rows(`SELECT ${SERVING_CUT_TUPLE_SQL} tuple FROM recovery_serving_cut WHERE operation_id=?1`,g[4] as string);if(r.length!==1)return refuse();const c=this.parse(r[0]!.tuple,8);
  if(c[0]!==g[4]||c[1]!==gate||c[2]!==native||c[3]!==f[5]||c[4]!==g[7]||c[5]!==g[8])return refuse();
  const n=this.rows(`SELECT COUNT(*) total,SUM(CASE WHEN parent_ticket_id IS NULL THEN 1 ELSE 0 END) roots,SUM(CASE WHEN parent_ticket_id IS NOT NULL THEN 1 ELSE 0 END) children,
   SUM(CASE WHEN state='settled' THEN 1 ELSE 0 END) settled,SUM(CASE WHEN state='running' THEN 1 ELSE 0 END) running,SUM(CASE WHEN state='unknown' THEN 1 ELSE 0 END) unknown,
   SUM(CASE WHEN purpose='provider' THEN 1 ELSE 0 END) providers,SUM(CASE WHEN purpose='provider' AND state='settled' THEN 1 ELSE 0 END) provider_settled,
   SUM(CASE WHEN purpose='provider' AND state='running' THEN 1 ELSE 0 END) provider_running,SUM(CASE WHEN purpose='provider' AND state='unknown' THEN 1 ELSE 0 END) provider_unknown,
   SUM(CASE WHEN native_floor<>?2 THEN 1 ELSE 0 END) foreign_floor,${SERVING_GATE_NOW} observed_at FROM recovery_serving_ticket WHERE floor_sequence=?1`,f[5] as number,native);
  if(n.length!==1)return refuse();const x=n[0]!,keys=['total','roots','children','settled','running','unknown','providers','provider_settled','provider_running','provider_unknown','foreign_floor'],counts=keys.map(k=>x[k]===null?0:x[k]);
  if(counts.some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0)||counts[1]!==c[6]||counts[2]!==c[7]||counts[0]!==Number(counts[1])+Number(counts[2])||counts[0]!==Number(counts[3])+Number(counts[4])+Number(counts[5])||counts[6]!==Number(counts[7])+Number(counts[8])+Number(counts[9])||counts[10]!==0||!integer(x.observed_at)||(x.observed_at as number)<(g[10] as number))return refuse();
  return JSON.stringify(['native-serving-cut-v1',gate,native,g[4],f[5],g[7],g[8],x.observed_at,...counts.slice(1,10)]);
 }
 private initializeClosed(v:Record<string,unknown>,keyFingerprint:string):Response{
  common(v);if(!hex(keyFingerprint,64)||!hex(v.operationId,32)||!hex(v.nextWriteEpoch,32))return refuse();const native=this.authority.floor();this.authority.claims(native);
  if(this.authority.validateFloor(v.originalFloor)!==native||v.nextWriteEpoch===this.parse(native,12)[7]||this.rows("SELECT 1 FROM sqlite_master WHERE lower(name) IN('recovery_serving_gate','recovery_serving_ticket','recovery_serving_ticket_floor_state','recovery_serving_ticket_parent_state','recovery_serving_cut','recovery_serving_lifecycle','recovery_suppression_control','recovery_suppression_journal','recovery_suppression_copy') OR lower(tbl_name) IN('recovery_serving_gate','recovery_serving_ticket','recovery_serving_cut','recovery_serving_lifecycle','recovery_suppression_control','recovery_suppression_journal','recovery_suppression_copy') LIMIT 1").length!==0)return refuse();
  this.rows(`SELECT CASE WHEN ?1<=${SERVING_GATE_NOW} AND ?2>${SERVING_GATE_NOW} AND NOT EXISTS(SELECT 1 FROM recovery_epoch_claim WHERE kind='write' AND epoch=?3)
   AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE state IN('reserved','unknown')) AND NOT EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE state IN('reserved','unknown'))
   THEN 1 ELSE json_extract('serving_initialization_held','$') END admitted`,v.createdAt as number,v.expiresAt as number,v.nextWriteEpoch);
  for(const sql of [SERVING_GATE_DDL,SERVING_TICKET_DDL,SERVING_TICKET_FLOOR_INDEX_DDL,SERVING_TICKET_PARENT_INDEX_DDL,SERVING_CUT_DDL,SERVING_LIFECYCLE_DDL,SUPPRESSION_CONTROL_DDL,SUPPRESSION_JOURNAL_DDL,SUPPRESSION_COPY_DDL,SUPPRESSION_COMPANION_DDL])this.rows(sql);
  const control=this.rows("INSERT INTO recovery_suppression_control(singleton,protocol,native_floor,action_sequence,key_fingerprint)VALUES(1,'olympus-independent-erasure-suppression-v1',?1,0,?2) RETURNING singleton",native,keyFingerprint);if(control.length!==1)return refuse();
  const r=this.rows(`INSERT INTO recovery_serving_gate(singleton,protocol,native_floor,state,operation_id,nonce,request_digest,created_at,expires_at,next_write_epoch,closed_at)
   SELECT 1,?1,?2,'closing_held',?3,?4,?5,?6,?7,?8,${SERVING_GATE_NOW} WHERE ?6<=${SERVING_GATE_NOW} AND ?7>${SERVING_GATE_NOW} RETURNING singleton`,SERVING_GATE_PROTOCOL,native,v.operationId,v.nonce as string,v.requestDigest as string,v.createdAt as number,v.expiresAt as number,v.nextWriteEpoch);
  if(r.length!==1)return refuse();const gate=this.gate(native);this.captureCut(native,gate);
  const saved=this.rows(`INSERT INTO recovery_serving_lifecycle(operation_id,purpose,nonce,request_digest,created_at,expires_at,original_floor,original_gate,result_floor,result_gate,completed_at)
   SELECT ?1,'initialize_closed',?2,?3,?4,?5,?6,?7,?6,?7,${SERVING_GATE_NOW} WHERE ?4<=${SERVING_GATE_NOW} AND ?5>${SERVING_GATE_NOW} RETURNING operation_id`,v.operationId,v.nonce as string,v.requestDigest as string,v.createdAt as number,v.expiresAt as number,native,gate);if(saved.length!==1)return refuse();
  this.lifecycleSchema();return response({scope:'private_serving_original_initialized_closed',gate,nativeCut:this.observeCut(native,gate),...closed});
 }
 private receiptTransport(v:Record<string,unknown>,native:string,gate:string,cut:string,migration:readonly unknown[]):{migration:readonly unknown[];source:unknown[]}{
  const g=this.parse(gate,11),f=this.parse(native,12),c=this.parse(cut,17),w=this.parse(v.allWriterCut,16),m=migration,s=this.parse(v.acceptedSourceReceipt,8);
  if(w[0]!=='all-writer-cut-v1'||w[1]!==gate||w[2]!==native||w[3]!==g[4]||w[4]!==f[8]||w[5]!==f[9]||w[6]!==f[5]||w[7]!==g[7]||w[8]!==g[8]||!hex(w[15],64))return refuse();
  if(w.slice(9,15).some(x=>typeof x!=='number'||!Number.isSafeInteger(x)||x<0)||w[9]!==c[8]||w[10]!==c[9]||w[11]!==c[11]||w[12]!==c[12]||w[11]!==0||w[12]!==0||w[13]!==0||w[14]!==0||c[11]!==0||c[12]!==0||c[15]!==0||c[16]!==0)return refuse();
  if(m.length!==17||recoveryScalarArrayJSON(m)!==v.migrationReceipt||m[0]!=='closed-profile-migration-v2'||m[1]!==native||m[2]!==gate||m[3]!==g[4]||m[9]!==g[9])return refuse();
  if(s[0]!=='accepted-recovery-source-v1'||s[1]!==m[4]||s[2]!==m[12]||!hex(s[3],40)||typeof s[4]!=='string'||s[4].length!==36||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s[4])||!hex(s[5],32)||s[5]===f[6]||!hex(s[6],32)||s[6]!==g[9]||s[5]===s[6]||!hex(s[7],64))return refuse();
  return {migration:m,source:s};
 }
 private reopen(v:Record<string,unknown>,keyFingerprint:string,migration:readonly unknown[]):Response{
  common(v);this.lifecycleSchema();const {native,gate}=this.original(),nowCut=this.parse(this.observeCut(native,gate),17),g=this.parse(gate,11),originalCut=this.parse(v.originalCut,17);
  if(!hex(v.operationId,32)||v.operationId===g[4]||v.originalGate!==gate||v.originalFloor!==native||typeof this.authority.reopenFloor!=='function'||!integer(originalCut[7])||(originalCut[7] as number)<(g[10] as number)||(originalCut[7] as number)>(nowCut[7] as number)||originalCut.some((x,i)=>i!==7&&x!==nowCut[i]))return refuse();const cut=v.originalCut as string;
  const {migration:m,source:s}=this.receiptTransport(v,native,gate,cut,migration);suppressionOpenGuard(this.storage,native,gate,v.suppressionReceipt,keyFingerprint);
  this.rows(`SELECT CASE WHEN ?1<=${SERVING_GATE_NOW} AND ?2>${SERVING_GATE_NOW} AND ?3<=${SERVING_GATE_NOW} AND ?4>${SERVING_GATE_NOW} AND ?7>${SERVING_GATE_NOW}
   AND ?5=(SELECT ${SERVING_GATE_TUPLE_SQL} FROM recovery_serving_gate WHERE singleton=1 AND state='closing_held')
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_lifecycle WHERE operation_id=?6)
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_ticket WHERE state IN('running','unknown'))
   AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE state IN('reserved','unknown')) AND NOT EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE state IN('reserved','unknown'))
   THEN 1 ELSE json_extract('serving_reopen_original_receipts_held','$') END admitted`,v.createdAt as number,v.expiresAt as number,m[5] as number,m[6] as number,gate,v.operationId,g[8] as number);
  const next=this.authority.reopenFloor(native,Object.freeze({operationId:v.operationId,nonce:v.nonce as string,requestDigest:v.requestDigest as string,createdAt:v.createdAt as number,expiresAt:v.expiresAt as number,credentialEpoch:s[5] as string,writeEpoch:s[6] as string,sourceTree:s[3] as string,deploymentVersion:s[4] as string}));this.authority.claims(next);
  const a=this.parse(next,12),o=this.parse(native,12);if(a[5]!==Number(o[5])+1||a[6]!==s[5]||a[7]!==s[6]||a[8]!==s[3]||a[9]!==s[4]||a[10]!==v.operationId)return refuse();
  const r=this.rows(`UPDATE recovery_serving_gate SET native_floor=?1,state='managed_open',operation_id=NULL,nonce=NULL,request_digest=NULL,created_at=NULL,expires_at=NULL,next_write_epoch=NULL,closed_at=NULL
   WHERE singleton=1 AND ${SERVING_GATE_TUPLE_SQL}=?2 AND state='closing_held' AND ?3<=${SERVING_GATE_NOW} AND ?4>${SERVING_GATE_NOW}
   AND ?5>${SERVING_GATE_NOW} AND ?6>${SERVING_GATE_NOW} AND EXISTS(SELECT 1 FROM recovery_floor WHERE ${SERVING_NATIVE_FLOOR_TUPLE_SQL}=?1) RETURNING singleton`,next,gate,v.createdAt as number,v.expiresAt as number,m[6] as number,g[8] as number);
  if(r.length!==1)return refuse();const suppression=this.rows(`UPDATE recovery_suppression_control SET native_floor=?1 WHERE singleton=1 AND native_floor=?2 AND action_sequence=json_extract(?3,'$[10]') AND key_fingerprint=?4 RETURNING singleton`,next,native,v.suppressionReceipt as string,keyFingerprint);if(suppression.length!==1)return refuse();const resultGate=this.gate(next);
  const saved=this.rows(`INSERT INTO recovery_serving_lifecycle(operation_id,purpose,nonce,request_digest,created_at,expires_at,original_floor,original_gate,original_cut,all_writer_receipt,migration_receipt,accepted_source_receipt,result_floor,result_gate,completed_at,replay_receipt)
   SELECT ?1,'reopen',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,${SERVING_GATE_NOW},?14 WHERE ?4<=${SERVING_GATE_NOW} AND ?5>${SERVING_GATE_NOW} AND ?15>${SERVING_GATE_NOW} RETURNING operation_id`,v.operationId,v.nonce as string,v.requestDigest as string,v.createdAt as number,v.expiresAt as number,native,gate,cut,v.allWriterCut as string,v.migrationReceipt as string,v.acceptedSourceReceipt as string,next,resultGate,v.suppressionReceipt as string,g[8] as number);
  if(saved.length!==1)return refuse();return response({scope:'private_serving_original_reopened',gate:resultGate,floor:next,operationId:v.operationId,...closed});
 }
 /** Only a MAC-authenticated original opener with an ACTUAL independent physical copy ACK may
  * explain a restored old epoch. Normal M17 input retains the receiver's exact original Floor guard. */
 private physicalMigration(v:Record<string,unknown>,keyFingerprint:string,requestCheck:()=>void):OriginalPhysicalReplayMigration|undefined{
  const m=this.parse(v.migrationReceipt,17),f=this.parse(v.originalFloor,12);if(m[8]===f[7]||m[7]!=='current-cookie'&&m[7]!=='current-cookie-pre-seal')return undefined;
  const c=this.parse(v.suppressionReceipt,17);if(!hex(m[8],32)||c[5]!=='private_export'&&c[5]!=='time_travel')return refuse();
  const native=v.originalFloor as string,gate=v.originalGate as string,raw=v.migrationReceipt as string;
  const check=()=>{requestCheck();const current=this.original();if(current.native!==native||current.gate!==gate)return refuse();suppressionOpenGuard(this.storage,native,gate,v.suppressionReceipt,keyFingerprint);};check();
  const evidence=Object.freeze({}) as OriginalPhysicalReplayMigration;physicalReplayMigrations.set(evidence,{raw,native,gate,epoch:m[8] as string,check});return evidence;
 }
 private async lifecycleFetch(request:Request,u:URL):Promise<Response>{
  const requestTuple=servingOriginalRequestTuple(request),original=lifecycleRequest(request,this.env);
  if(requestTuple.method!=='POST'||u.search||u.hash)return response({error:'serving_recovery_gate_held'},404);
  const isInit=u.pathname==='/v1/serving/initialize-closed',secret=isInit?original.roots.initializer:original.roots.operator;if(secret===null)return refuse();
  const raw=await servingOriginalBody(request,original.check);original.check();if(!await verify(secret,u.pathname,raw,original.proof??''))return response({error:'serving_recovery_gate_held'},403);original.check();
  const base=['operationId','nonce','requestDigest','createdAt','expiresAt'],reopenKeys=[...base,'originalGate','originalFloor','originalCut','allWriterCut','migrationReceipt','acceptedSourceReceipt','suppressionReceipt'],keys=isInit?[...base,'nextWriteEpoch','originalFloor']:u.pathname==='/v1/serving/observe-cut'?['originalGate','originalFloor']:u.pathname==='/v1/serving/reconcile-reopen'?['originalReopen']:reopenKeys;
  const v=record(raw,keys);let validatedMigration:readonly unknown[]|null=null;
  if(u.pathname==='/v1/serving/reopen'){if(typeof v.allWriterCut!=='string'||typeof v.migrationReceipt!=='string'||typeof v.acceptedSourceReceipt!=='string'||typeof v.suppressionReceipt!=='string')return refuse();const receipts=Object.freeze({allWriterCut:v.allWriterCut,migrationReceipt:v.migrationReceipt,acceptedSourceReceipt:v.acceptedSourceReceipt,suppressionReceipt:v.suppressionReceipt});if(!await verifyRecoveryReceiptMac(secret,receipts,original.receiptProof??''))return response({error:'serving_recovery_gate_held'},403);original.check();if(typeof v.originalFloor!=='string'||typeof v.originalGate!=='string')return refuse();const m=this.parse(v.migrationReceipt,17),f=this.parse(v.originalFloor,12);let physical:OriginalPhysicalReplayMigration|undefined;if(m[7]==='current-cookie'&&m[8]!==f[7]){const fingerprint=await suppressionKeyFingerprint(original.roots.operator);original.check();physical=this.physicalMigration(v,fingerprint,original.check);}validatedMigration=await validateOriginalProfileMigrationReceipt(v.migrationReceipt,v.originalFloor,v.originalGate,physical);original.check();}
  const keyFingerprint=await suppressionKeyFingerprint(original.roots.operator);original.check();
  return this.storage.transactionSync(()=>{original.check();
   if(isInit)return this.initializeClosed(v,keyFingerprint);
   const currentFloor=this.authority.floor();this.authority.claims(currentFloor);const suppressionControl=suppressionNativeKeyGuard(this.storage,currentFloor,keyFingerprint);
   if(u.pathname==='/v1/serving/reconcile-reopen'){
    this.lifecycleSchema();if(typeof v.originalReopen!=='string')return refuse();const o=record(v.originalReopen,reopenKeys);common(o);if(!hex(o.operationId,32))return refuse();const r=this.rows(`SELECT ${SERVING_LIFECYCLE_TUPLE_SQL} tuple FROM recovery_serving_lifecycle WHERE operation_id=?1 AND purpose='reopen'`,o.operationId);if(r.length!==1)return refuse();
    const a=this.parse(r[0]!.tuple,16),expected=[o.operationId,'reopen',o.nonce,o.requestDigest,o.createdAt,o.expiresAt,o.originalFloor,o.originalGate,o.originalCut,o.allWriterCut,o.migrationReceipt,o.acceptedSourceReceipt],native=this.authority.floor();this.authority.claims(native);if(expected.some((x,i)=>a[i]!==x)||a[15]!==o.suppressionReceipt||a[12]!==native||a[13]!==this.gate(native))return refuse();return response({scope:'private_serving_same_original_reopen_observation',operation:r[0]!.tuple,...closed});
   }
   if(u.pathname==='/v1/serving/observe-cut'){const {native,gate}=this.original();if(v.originalGate!==gate||v.originalFloor!==native)return refuse();return response({scope:'private_serving_original_native_cut_observation',nativeCut:this.observeCut(native,gate),suppressionControl,...closed});}
   if(validatedMigration===null)return refuse();return this.reopen(v,keyFingerprint,validatedMigration);
  });
 }

 async fetch(request:Request):Promise<Response>{try{const originalRequest=servingOriginalRequestTuple(request),u=new URL(originalRequest.url);if(u.origin!=='https://privacy-recovery-floor.invalid')return response({error:'serving_recovery_gate_held'},404);
  if(LIFE_PATHS.includes(u.pathname as typeof LIFE_PATHS[number]))return await this.lifecycleFetch(request,u);
  if(originalRequest.method==='GET'&&u.pathname==='/v1/serving/status'&&[...u.searchParams.keys()].join('|')==='ticket'&&hex(u.searchParams.get('ticket'),32))return this.storage.transactionSync(()=>{const {native,gate}=this.original(),ticket=this.ticket(u.searchParams.get('ticket')!);if((JSON.parse(ticket) as unknown[])[2]!==native)return refuse();return response({scope:'private_serving_original_observation',gate,ticket,...closed});});
  if(originalRequest.method==='GET'&&u.pathname==='/v1/serving/unresolved'&&!u.search)return this.storage.transactionSync(()=>{const {native,gate}=this.original(),sequence=(JSON.parse(native) as unknown[])[5] as number,r=this.rows(SERVING_TICKET_UNRESOLVED_SQL,sequence);if(r.length>1)return refuse();const first=r.length?this.validateTicket(r[0]!.tuple):null;if(first&&(JSON.parse(first) as unknown[])[2]!==native)return refuse();return response({scope:'private_serving_local_unresolved_observation',gate,localUnresolved:first!==null,firstTicket:first,drainQualified:false,...closed});});
  if(originalRequest.method!=='POST'||u.search||!['/v1/serving/claim','/v1/serving/settle','/v1/serving/close'].includes(u.pathname))return response({error:'serving_recovery_gate_held'},404);
  const original=lifecycleRequest(request,this.env),captured=original.roots,secret=u.pathname==='/v1/serving/close'?captured.operator:captured.serving,raw=await servingOriginalBody(request,original.check);original.check();if(!await verify(secret,u.pathname,raw,original.proof??''))return response({error:'serving_recovery_gate_held'},403);original.check();
  const v=record(raw,u.pathname==='/v1/serving/claim'?['ticketId','parentTicket','purpose','nonce','requestDigest','createdAt','expiresAt','originalFloor']:u.pathname==='/v1/serving/settle'?['originalTicket','result','resultDigest']:['operationId','nonce','requestDigest','createdAt','expiresAt','nextWriteEpoch','originalGate']);
  return this.storage.transactionSync(()=>{original.check();const {native,gate}=this.original(),g=JSON.parse(gate) as unknown[];
   if(u.pathname==='/v1/serving/claim'){common(v);if(g[3]!=='managed_open'||this.authority.validateFloor(v.originalFloor)!==native||!hex(v.ticketId,32)||!['fetch','scheduled','deferred','d1','provider'].includes(v.purpose as string))return refuse();let parent:string|null=null;
    if(v.parentTicket!==null){const p=JSON.parse(this.validateTicket(v.parentTicket)) as unknown[];parent=p[0] as string;if(p[2]!==native||p[9]!=='running'||p[7]!==v.createdAt||p[8]!==v.expiresAt||this.ticket(parent)!==v.parentTicket||parent===v.ticketId||!['deferred','d1','provider'].includes(v.purpose as string))return refuse();}else if(!['fetch','scheduled'].includes(v.purpose as string))return refuse();
    const r=this.rows(`INSERT INTO recovery_serving_ticket(ticket_id,parent_ticket_id,native_floor,floor_sequence,purpose,nonce,request_digest,created_at,expires_at,state,result_digest,finished_at)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,'running',NULL,NULL WHERE ?8<=${SERVING_GATE_NOW} AND ?9>${SERVING_GATE_NOW} RETURNING ticket_id`,v.ticketId,parent,native,(JSON.parse(native) as unknown[])[5] as number,v.purpose as string,v.nonce as string,v.requestDigest as string,v.createdAt as number,v.expiresAt as number);if(r.length!==1)return refuse();return response({scope:'private_serving_original_ticket',ticket:this.ticket(v.ticketId),...closed});}
   if(u.pathname==='/v1/serving/settle'){const original=this.validateTicket(v.originalTicket),a=JSON.parse(original) as unknown[];if(a[2]!==native||a[9]!=='running'||this.ticket(a[0] as string)!==original||!['settled','unknown'].includes(v.result as string)||!hex(v.resultDigest,64))return refuse();
    const r=this.rows(`UPDATE recovery_serving_ticket SET state=?1,result_digest=?2,finished_at=${SERVING_GATE_NOW} WHERE ticket_id=?3 AND ${SERVING_TICKET_TUPLE_SQL}=?4 AND state='running' AND created_at<=${SERVING_GATE_NOW}
     AND (?1='unknown' OR(expires_at>${SERVING_GATE_NOW} AND NOT EXISTS(${SERVING_TICKET_CHILD_UNRESOLVED_SQL.replace('?1','?3')}))) RETURNING ticket_id`,v.result as string,v.resultDigest,a[0] as string,original);if(r.length!==1)return refuse();return response({scope:'private_serving_original_terminal_ticket',ticket:this.ticket(a[0] as string),...closed});}
   common(v);if(g[3]!=='managed_open'||v.originalGate!==gate||!hex(v.operationId,32)||!hex(v.nextWriteEpoch,32)||v.nextWriteEpoch===(JSON.parse(native) as unknown[])[7])return refuse();
   const r=this.rows(`UPDATE recovery_serving_gate SET state='closing_held',operation_id=?1,nonce=?2,request_digest=?3,created_at=?4,expires_at=?5,next_write_epoch=?6,closed_at=${SERVING_GATE_NOW}
    WHERE singleton=1 AND ${SERVING_GATE_TUPLE_SQL}=?7 AND state='managed_open' AND ?4<=${SERVING_GATE_NOW} AND ?5>${SERVING_GATE_NOW}
    AND NOT EXISTS(SELECT 1 FROM recovery_epoch_claim WHERE kind='write' AND epoch=?6) RETURNING singleton`,v.operationId as string,v.nonce as string,v.requestDigest as string,v.createdAt as number,v.expiresAt as number,v.nextWriteEpoch as string,gate);if(r.length!==1)return refuse();const resultGate=this.gate(native),lifecycle=this.rows("SELECT name FROM sqlite_master WHERE name IN('recovery_serving_cut','recovery_serving_lifecycle')");if(lifecycle.length!==0){this.lifecycleSchema();this.captureCut(native,resultGate);}return response({scope:'private_serving_original_close_cut',gate:resultGate,drainQualified:false,...closed});
  });
 }catch{return response({error:'serving_recovery_gate_held'},409);}}
}
