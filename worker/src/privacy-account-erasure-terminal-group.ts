/** Custody for one source-built terminal group. Data projections cannot register arbitrary SQL. */
import type {Env} from './env';
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {originalAccountErasureProducerFacts} from './privacy-serving-erase';
import {originalPrivacyAdmissionOpaqueReference,originalPrivacyAdmissionBatchLineage} from './privacy-write-admission';
import {originalPrivacyAuthorityBatchLineage,originalPrivacyStatementGroupProjection} from './privacy-serving-authority';
import {lowerOriginalSchemaSQL,type OriginalPhysicalSchemaPlan} from './privacy-schema-source-plan';
import {assertOriginalErasureJobRead,originalErasureJobReadFacts,type OriginalErasureJobRead} from './privacy-erasure-terminal-job-read';
import {assertOriginalAccountErasureNativeFrame,originalAccountErasureNativeFrameFacts,type OriginalAccountErasureNativeFrame} from './privacy-global-serving-origin';
import {originalErasureTerminalIntentFacts,assertOriginalErasureTerminalIntent,type OriginalErasureTerminalIntent} from './privacy-erasure-terminal-intent';
declare const originalTerminalGroupBrand:unique symbol;
declare const originalTerminalAckBrand:unique symbol;
type Bind=string|number|null|Readonly<{blob:readonly number[]}>;
type Logical=Readonly<{sql:string;values:readonly Bind[]|null}>;
export type OriginalAccountErasureTerminalGroup=Readonly<{[originalTerminalGroupBrand]:true}>;
export type OriginalAccountErasureTerminalAcknowledgement=Readonly<{[originalTerminalAckBrand]:true}>;
type GroupState={job:OriginalErasureJobRead;env:Env;statements:D1PreparedStatement[];logical:readonly Logical[];physical:readonly OriginalPhysicalSchemaPlan[];terminalIndex:number;check:()=>void};
const groups=new WeakMap<OriginalAccountErasureTerminalGroup,GroupState>();
const acknowledgements=new WeakMap<OriginalAccountErasureTerminalAcknowledgement,{group:OriginalAccountErasureTerminalGroup;facts:Readonly<{erasedAt:number;nativeResultDigest:string}>;check:()=>void}>();
const acknowledgedFrames=new WeakSet<OriginalAccountErasureNativeFrame>();
const held=():never=>{throw new RecoveryFloorHeld();};
const primitiveJSON=JSON.stringify,subtle=crypto.subtle,digestMethod=subtle.digest,encoder=new TextEncoder();
const bufferPrototype=ArrayBuffer.prototype,bufferLength=Object.getOwnPropertyDescriptor(bufferPrototype,'byteLength')!.get!,ByteView=Uint8Array;
const data=(o:object,k:PropertyKey):unknown=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;};
const sameDescriptor=(a:PropertyDescriptor|undefined,b:PropertyDescriptor):boolean=>!!a&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
function bytes(v:unknown):readonly number[]|null{
 if(v===null||typeof v!=='object')return null;
 if(Array.isArray(v)){const length=data(v,'length');if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>2000000||Reflect.ownKeys(v).length!==length+1)return held();const out:number[]=[];for(let i=0;i<length;i++){const b=data(v,String(i));if(typeof b!=='number'||!Number.isInteger(b)||b<0||b>255)return held();out.push(b);}return out;}
 const blob=Object.getOwnPropertyDescriptor(v,'blob');if(blob&&Object.hasOwn(blob,'value')&&Reflect.ownKeys(v).length===1)return bytes(blob.value);
 // Global owned plan values are original copied buffers; use intrinsic brand getters, never ordinary properties.
 try{const n=Reflect.apply(bufferLength,v,[]) as number;if(Object.getPrototypeOf(v)!==bufferPrototype||Reflect.ownKeys(v).length||!Number.isSafeInteger(n)||n<0||n>2000000)return held();const view=new ByteView(v as ArrayBuffer),out:number[]=[];for(let i=0;i<n;i++)out.push(view[i]!);return out;}catch{return held();}
}
function sameBind(a:unknown,b:Bind):boolean{if(b===null||typeof b!=='object')return Object.is(a,b);const x=bytes(a);return !!x&&x.length===b.blob.length&&x.every((v,i)=>v===b.blob[i]);}
function sameValues(actual:unknown,expected:readonly Bind[]):boolean{if(actual===null)return expected.length===0;if(!Array.isArray(actual)||data(actual,'length')!==expected.length||Reflect.ownKeys(actual).length!==expected.length+1)return false;for(let i=0;i<expected.length;i++)if(!sameBind(data(actual,String(i)),expected[i]!))return false;return true;}
/** The registry is written only in private completeServingAccount after its exact source plan exists. */
export function captureAccountErasureTerminalGroup(env:Env,job:OriginalErasureJobRead,statements:D1PreparedStatement[]):OriginalAccountErasureTerminalGroup{
 assertOriginalErasureJobRead(job,env);const facts=originalErasureJobReadFacts(job),producer=originalAccountErasureProducerFacts(env,statements),projection=originalPrivacyStatementGroupProjection(env.DB,statements);
 for(const key of ['purpose','subject','subjectGeneration','operationId','requestDigest','accountIncarnation'] as const)if(facts.proof[key]!==producer.proof[key])return held();
 const logical=projection.logical,terminalIndex=logical.length-1;if(logical.length<3||logical.length>150||!logical[terminalIndex]!.sql.includes('AS recorded')||!logical[terminalIndex]!.sql.includes('AS erasedAt'))return held();
 const physical=Object.freeze(logical.map(p=>lowerOriginalSchemaSQL(p.sql,p.values))),check=()=>{assertOriginalErasureJobRead(job,env);producer.check();projection.check();for(const p of physical)p.check();};check();
 const group=Object.freeze({}) as OriginalAccountErasureTerminalGroup;groups.set(group,{job,env,statements,logical,physical,terminalIndex,check});return group;
}
export function assertAccountErasureTerminalGroup(group:OriginalAccountErasureTerminalGroup,job:OriginalErasureJobRead):void{const s=groups.get(group);if(!s||s.job!==job)return held();s.check();}
export function originalAccountErasureTerminalGroupFacts(group:OriginalAccountErasureTerminalGroup,job:OriginalErasureJobRead):Readonly<{logical:readonly Logical[];physical:readonly OriginalPhysicalSchemaPlan[];statements:readonly object[];terminalIndex:number}>{
 assertAccountErasureTerminalGroup(group,job);const s=groups.get(group)!;return Object.freeze({logical:s.logical,physical:s.physical,statements:Object.freeze(s.statements.map(originalPrivacyAdmissionOpaqueReference)),terminalIndex:s.terminalIndex});
}
/** Exact input identity plus privately recorded transformations; text equality is only the final value check. */
export function assertAccountErasurePhysicalTerminalBatch(group:OriginalAccountErasureTerminalGroup,job:OriginalErasureJobRead,inputStatements:D1PreparedStatement[],ownedPlans:readonly unknown[]):Readonly<{nativeTerminalIndex:number;check:()=>void}>{
 assertAccountErasureTerminalGroup(group,job);const s=groups.get(group)!,checks:(()=>void)[]=[];let current=originalPrivacyAdmissionOpaqueReference(inputStatements),central:ReturnType<typeof originalPrivacyAdmissionBatchLineage>=null,nativeSeen=false,offset=0;
 for(let depth=0;current!==originalPrivacyAdmissionOpaqueReference(s.statements);depth++){
  if(depth>=32)return held();const admission=originalPrivacyAdmissionBatchLineage(current),authority=admission?null:originalPrivacyAuthorityBatchLineage(current),lineage=admission??authority;if(!lineage)return held();checks.push(lineage.check);lineage.check();
  if(admission?.kind==='native'){if(nativeSeen)return held();nativeSeen=true;}
  if(admission?.kind==='central'){if(central||admission.purpose!=='writer'||admission.payloadOffset!==2||!admission.physical||!admission.logical)return held();central=admission;offset+=2;}
  if(authority)offset+=authority.guardCount;
  current=lineage.parent;
 }
 if(!nativeSeen||!central?.physical||!central.logical||inputStatements.length!==central.physical.length||ownedPlans.length!==inputStatements.length||central.physical.length!==central.logical.length+4)return held();
 const nativeTerminalIndex=s.terminalIndex+offset;if(nativeTerminalIndex!==inputStatements.length-3)return held();
 const originalPlanArray=Object.getPrototypeOf(ownedPlans),planKeys=Reflect.ownKeys(ownedPlans),planDescriptors=planKeys.map(k=>Object.getOwnPropertyDescriptor(ownedPlans,k));if(planDescriptors.some(d=>!d||!Object.hasOwn(d,'value')))return held();
 const records=central.physical.map((p,i)=>{const record=data(ownedPlans,String(i));if(!record||typeof record!=='object'||data(record,'sql')!==p.sql||!sameValues(data(record,'values'),p.values))return held();return {record,sql:Object.getOwnPropertyDescriptor(record,'sql')!,values:Object.getOwnPropertyDescriptor(record,'values')!};});
 const check=()=>{s.check();for(const f of checks)f();if(Object.getPrototypeOf(ownedPlans)!==originalPlanArray||Reflect.ownKeys(ownedPlans).length!==planKeys.length)return held();for(let i=0;i<planKeys.length;i++)if(!sameDescriptor(Object.getOwnPropertyDescriptor(ownedPlans,planKeys[i]!),planDescriptors[i]!))return held();for(let i=0;i<records.length;i++){const saved=records[i]!,p=central!.physical![i]!;p.check();if(!sameDescriptor(Object.getOwnPropertyDescriptor(saved.record,'sql'),saved.sql)||!sameDescriptor(Object.getOwnPropertyDescriptor(saved.record,'values'),saved.values)||!sameValues(saved.values.value,p.values))return held();}};check();return Object.freeze({nativeTerminalIndex,check});
}
function originalPacket(packet:unknown):Readonly<{text:string;check:()=>void}>{
 const originals:{ref:object;prototype:object|null;keys:(string|symbol)[];descriptors:PropertyDescriptor[]}[]=[],seen=new Set<object>();let slots=0,total=0;
 const encode=(v:unknown,depth:number):string=>{if(depth>10||++slots>50000)return held();if(v===undefined)return '["undefined"]';if(v===null)return '["null"]';if(typeof v==='string'){total+=encoder.encode(v).length;if(total>2000000)return held();return '["string",'+primitiveJSON(v)+']';}if(typeof v==='boolean')return '["boolean",'+primitiveJSON(v)+']';if(typeof v==='number'){if(!Number.isFinite(v))return held();return '["number",'+primitiveJSON(Object.is(v,-0)?'-0':String(v))+']';}if(!v||typeof v!=='object'||seen.has(v))return held();seen.add(v);const prototype=Object.getPrototypeOf(v),keys=Reflect.ownKeys(v);if(keys.some(k=>typeof k!=='string')||keys.length>4096)return held();const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(v,k));if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))return held();originals.push({ref:v,prototype,keys,descriptors:descriptors as PropertyDescriptor[]});
  if(Array.isArray(v)){const length=data(v,'length');if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||keys.length!==length+1)return held();let out='["array",[';for(let i=0;i<length;i++){if(i)out+=',';out+=encode(data(v,String(i)),depth+1);}return out+']]';}
  let out='["object",[';const names=(keys as string[]).slice().sort();for(let i=0;i<names.length;i++){if(i)out+=',';const key=names[i]!;out+='['+primitiveJSON(key)+','+encode(data(v,key),depth+1)+']';}return out+']]';
 };const text=encode(packet,0);if(encoder.encode(text).length>2000000)return held();const check=()=>{for(const s of originals){const keys=Reflect.ownKeys(s.ref);if(Object.getPrototypeOf(s.ref)!==s.prototype||keys.length!==s.keys.length||s.keys.some(k=>!keys.includes(k)))return held();for(let i=0;i<s.keys.length;i++)if(!sameDescriptor(Object.getOwnPropertyDescriptor(s.ref,s.keys[i]!),s.descriptors[i]!))return held();}};check();return Object.freeze({text,check});
}
/** Only a genuine landed original Global Native frame can issue; raw/copy packet inputs are absent. */
export async function captureAccountErasureTerminalAcknowledgement(group:OriginalAccountErasureTerminalGroup,job:OriginalErasureJobRead,frame:OriginalAccountErasureNativeFrame,intent:OriginalErasureTerminalIntent):Promise<OriginalAccountErasureTerminalAcknowledgement>{
 assertOriginalErasureTerminalIntent(intent);const intentFacts=originalErasureTerminalIntentFacts(intent);if(intentFacts.job!==job||intentFacts.group!==group)return held();assertOriginalAccountErasureNativeFrame(frame,intent);assertAccountErasureTerminalGroup(group,job);if(acknowledgedFrames.has(frame))return held();acknowledgedFrames.add(frame);
 const native=originalAccountErasureNativeFrameFacts(frame,intent),physical=assertAccountErasurePhysicalTerminalBatch(group,job,native.inputStatements,native.ownedPlans),packet=originalPacket(native.packet),results=data(native.packet as object,String(physical.nativeTerminalIndex));
 if(!results||typeof results!=='object'||data(results,'success')!==true)return held();const rows=data(results,'results');if(!Array.isArray(rows)||data(rows,'length')!==1)return held();const row=data(rows,'0');if(!row||typeof row!=='object'||Reflect.ownKeys(row).length!==2||data(row,'recorded')!==1)return held();const erasedAt=data(row,'erasedAt'),jobFacts=originalErasureJobReadFacts(job),ticket=native.originalTicket;
 if(typeof erasedAt!=='number'||!Number.isSafeInteger(erasedAt)||erasedAt<jobFacts.observedAt||erasedAt>=jobFacts.originalRetainUntil||erasedAt>253402300799||!Array.isArray(ticket)||ticket.length!==12||typeof ticket[7]!=='number'||typeof ticket[8]!=='number'||erasedAt<ticket[7]||erasedAt>=ticket[8])return held();
 const check=()=>{assertOriginalErasureTerminalIntent(intent);if(originalErasureTerminalIntentFacts(intent)!==intentFacts||intentFacts.job!==job||intentFacts.group!==group)return held();assertOriginalAccountErasureNativeFrame(frame,intent);assertAccountErasureTerminalGroup(group,job);physical.check();native.check();packet.check();};check();const digest=await digestMethod.call(subtle,'SHA-256',encoder.encode(packet.text));check();if(!(digest instanceof ArrayBuffer)||digest.byteLength!==32)return held();let nativeResultDigest='';const b=new Uint8Array(digest);for(let i=0;i<32;i++)nativeResultDigest+=b[i]!.toString(16).padStart(2,'0');const ack=Object.freeze({}) as OriginalAccountErasureTerminalAcknowledgement;acknowledgements.set(ack,{group,facts:Object.freeze({erasedAt,nativeResultDigest}),check});return ack;
}
export function assertAccountErasureTerminalAcknowledgement(ack:OriginalAccountErasureTerminalAcknowledgement,group:OriginalAccountErasureTerminalGroup):void{const s=acknowledgements.get(ack);if(!s||s.group!==group)return held();s.check();}
export function originalAccountErasureTerminalAcknowledgementFacts(ack:OriginalAccountErasureTerminalAcknowledgement,group:OriginalAccountErasureTerminalGroup):Readonly<{erasedAt:number;nativeResultDigest:string}>{assertAccountErasureTerminalAcknowledgement(ack,group);return acknowledgements.get(ack)!.facts;}
