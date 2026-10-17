/** .162 guarded recovery successor, Native side. One attempt owns at most one epoch fence (source -> fresh target,
 * mode closed) and one open (target closed -> serving). Each is a single-use capability over ONE source-owned D1
 * batch built from the existing whole-profile proof. A thrown or unconfirmed batch is that attempt's own unknown:
 * it is never retried, and no later read can mint its acknowledgement. The audit-sequence watermark only detects
 * a restore to a LOWER audit sequence; an earlier same-sequence snapshot is not detected (restoreBarrierQualified=false). */
import {SUCCESSOR_NATIVE_SEAMS as N,successorCurrentProfileProof} from './privacy-cookie-profile-migration';
import {PrivacyWriteAdmissionHeld,type AdmissionLayout} from './privacy-write-admission';

const held=(reason:string):never=>{throw new PrivacyWriteAdmissionHeld(reason);};
const hex32=(x:unknown):x is string=>typeof x==='string'&&x.length===32&&!/[^0-9a-f]/.test(x);
const counter=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const clock=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=253402300799;
const PROOF_ROW=['admitted','original_tuple','observed_at','cfkv_present'] as const,WATERMARK_ROW=['watermark_admitted','audit_sequence'] as const;
export const SUCCESSOR_WATERMARK_SQL="SELECT CASE WHEN (SELECT seq FROM sqlite_sequence WHERE name='audit')>=CAST(?1 AS INTEGER) THEN 1 ELSE json_extract('successor_native_watermark_held','$') END AS watermark_admitted,(SELECT seq FROM sqlite_sequence WHERE name='audit') AS audit_sequence";
const CONTROL_TUPLE_SQL=`SELECT ${N.TUPLE} AS control_tuple,(SELECT seq FROM sqlite_sequence WHERE name='audit') AS audit_sequence,${N.NOW} AS observed_at FROM ${N.SLOT} WHERE singleton=1`;

export type SuccessorNativeInput=Readonly<{layout:AdmissionLayout;sourceEpoch:string;sourceMode:'serving'|'closed';targetEpoch:string;createdAt:number;expiresAt:number;watermark:number}>;
declare const fenceBrand:unique symbol,fenceAckBrand:unique symbol,openBrand:unique symbol,openAckBrand:unique symbol;
export type SuccessorNativeFence=Readonly<{[fenceBrand]:true}>;
export type SuccessorNativeFenceAck=Readonly<{[fenceAckBrand]:true}>;
export type SuccessorNativeOpen=Readonly<{[openBrand]:true}>;
export type SuccessorNativeOpenAck=Readonly<{[openAckBrand]:true}>;
export type SuccessorFenceFacts=Readonly<{preTuple:string;closedTuple:string;fencedAt:number;nativeResultDigest:string;auditSequence:number}>;
export type SuccessorOpenFacts=Readonly<{servingTuple:string;openedAt:number;nativeResultDigest:string}>;
type Witness={assert:()=>void};
type Fence={native:D1Database;witness:Witness;input:SuccessorNativeInput;precheck:Witness;phase:'prepared'|'dispatched'|'complete'|'unknown';facts:SuccessorFenceFacts|null;packet:Witness|null;openSpent:boolean};
type Open={fence:Fence;closedTuple:string;servingTuple:string;notBefore:number;phase:'prepared'|'dispatched'|'complete'|'unknown';row:Witness;facts:SuccessorOpenFacts|null;packet:Witness|null};
const fences=new WeakMap<SuccessorNativeFence,Fence>(),fenceAcks=new WeakMap<SuccessorNativeFenceAck,Fence>();
const opens=new WeakMap<SuccessorNativeOpen,Open>(),openAcks=new WeakMap<SuccessorNativeOpenAck,Open>();

function input(x:SuccessorNativeInput):SuccessorNativeInput{
 if(!x||typeof x!=='object'||Reflect.ownKeys(x).length!==7)return held('successor_native_input');
 const v=Object.fromEntries(['layout','sourceEpoch','sourceMode','targetEpoch','createdAt','expiresAt','watermark'].map(k=>[k,N.own(x,k)]));
 if(v.layout!=='canonical'&&v.layout!=='recorded-live-20261010'||!hex32(v.sourceEpoch)||!hex32(v.targetEpoch)||v.sourceEpoch===v.targetEpoch||v.sourceMode!=='serving'&&v.sourceMode!=='closed'
  ||!clock(v.createdAt)||v.expiresAt!==v.createdAt+300||!counter(v.watermark))return held('successor_native_input');
 return Object.freeze(v) as unknown as SuccessorNativeInput;
}
/** Exact nine-field control tuple at one epoch/mode with neutral activity; counters are carried, never chosen. */
function tuple(raw:unknown,epoch:string,mode:'serving'|'closed'):unknown[]{
 if(typeof raw!=='string'||raw.length>1024)return held('successor_native_tuple');let a:unknown;try{a=JSON.parse(raw);}catch{return held('successor_native_tuple');}
 if(!Array.isArray(a)||a.length!==9||JSON.stringify(a)!==raw||a[0]!==1||a[1]!==N.VERSION||a[2]!==epoch||a[3]!==mode||a[4]!==0||a[5]!==''||a[6]!==''||!counter(a[7])||!counter(a[8]))return held('successor_native_tuple');return a;
}
function proofStep(layout:AdmissionLayout,mode:'serving'|'closed',bound:string|null,epoch:string,start:number,end:number):{sql:string;binds:(string|number)[]}{
 const p=successorCurrentProfileProof(layout,mode,bound!==null),binds:(string|number)[]=[p.objects,bound??'',epoch,String(end),String(start)];if(p.optional!==null)binds.push(p.optional);return {sql:p.sql,binds};
}
function batchOut(out:unknown,length:number,reason:string):void{
 if(!Array.isArray(out)||N.own(out,'length')!==length)return held(reason);
 for(let i=0;i<length;i++){const item=N.own(out,String(i)),error=item&&typeof item==='object'?Object.getOwnPropertyDescriptor(item,'error'):undefined;if(N.own(item,'success')!==true||error&&(!Object.hasOwn(error,'value')||error.value!==undefined))return held(reason);}
}

/** Read-only current-state observation for the census. Never authority, never an acknowledgement. */
export async function observeSuccessorNative(native:D1Database,layout:AdmissionLayout):Promise<Readonly<{controlTuple:string;auditSequence:number|null;observedAt:number;profileAdmitted:boolean}>>{
 if(layout!=='canonical'&&layout!=='recorded-live-20261010')return held('successor_native_input');const witness=N.methods(native);
 const p=N.prepared(native,witness,CONTROL_TUPLE_SQL,[]),first=N.statementMethod(p.statement,'first');p.witness.assert();first.assert();
 const raw=await Reflect.apply(first.value,p.statement,[]),row=N.rowSnapshot(raw,['control_tuple','audit_sequence','observed_at']);p.witness.assert();first.assert();row.witness.assert();
 const [controlTuple,auditSequence,observedAt]=row.values;if(typeof controlTuple!=='string'||auditSequence!==null&&!counter(auditSequence)||!clock(observedAt))return held('successor_native_observation');
 const a=JSON.parse(controlTuple) as unknown[];let profileAdmitted=false;
 if(Array.isArray(a)&&a.length===9&&hex32(a[2])&&(a[3]==='serving'||a[3]==='closed')){
  const step=proofStep(layout,a[3] as 'serving'|'closed',controlTuple,a[2] as string,observedAt as number,(observedAt as number)+300);
  try{const q=N.prepared(native,witness,step.sql,step.binds),f=N.statementMethod(q.statement,'first'),r=await Reflect.apply(f.value,q.statement,[]),s=N.rowSnapshot(r,PROOF_ROW);q.witness.assert();f.assert();s.witness.assert();profileAdmitted=s.values[0]===1&&s.values[1]===controlTuple;}
  catch{profileAdmitted=false;}
 }
 return Object.freeze({controlTuple,auditSequence:auditSequence as number|null,observedAt:observedAt as number,profileAdmitted});
}

/** S0: read-only precheck at the exact source epoch/mode plus the watermark. Refusal has no effect. */
export async function captureSuccessorNativeFence(native:D1Database,raw:SuccessorNativeInput):Promise<SuccessorNativeFence>{
 const x=input(raw),witness=N.methods(native),proof=proofStep(x.layout,x.sourceMode,null,x.sourceEpoch,x.createdAt,x.expiresAt);
 const steps=[proof,{sql:SUCCESSOR_WATERMARK_SQL,binds:[String(x.watermark)]}];for(const s of steps)N.bounded(s.sql,s.binds);
 const plans=steps.map(s=>N.prepared(native,witness,s.sql,s.binds));plans.forEach(p=>p.witness.assert());witness.assert();
 const out=await native.batch(plans.map(p=>p.statement)),graph=N.graph(out);plans.forEach(p=>p.witness.assert());witness.assert();graph.witness.assert();batchOut(out,2,'successor_native_precheck');
 const pre=N.rowSnapshot(N.resultRow(N.own(out,'0')),PROOF_ROW),mark=N.rowSnapshot(N.resultRow(N.own(out,'1')),WATERMARK_ROW);
 if(pre.values[0]!==1||mark.values[0]!==1||!counter(mark.values[1])||(mark.values[1] as number)<x.watermark||!clock(pre.values[2])||(pre.values[2] as number)<x.createdAt||(pre.values[2] as number)>=x.expiresAt)return held('successor_native_precheck');
 tuple(pre.values[1],x.sourceEpoch,x.sourceMode);
 const precheck={assert(){plans.forEach(p=>p.witness.assert());graph.witness.assert();pre.witness.assert();mark.witness.assert();witness.assert();}};precheck.assert();
 const cap=Object.freeze({}) as SuccessorNativeFence;fences.set(cap,{native,witness,input:x,precheck,phase:'prepared',facts:null,packet:null,openSpent:false});return cap;
}
/** S2: ONE batch. Proof at the source plus watermark, the epoch CAS with RETURNING, and the final closed proof.
 * Counters are deliberately unbound: the atomic CAS is the cut and RETURNING records the consumed counters. */
export async function executeSuccessorNativeFence(cap:SuccessorNativeFence):Promise<SuccessorNativeFenceAck>{
 const s=fences.get(cap);if(!s||s.phase!=='prepared')return held('successor_native_fence_foreign_or_spent');s.precheck.assert();s.phase='dispatched';const x=s.input;
 try{
  const steps=[proofStep(x.layout,x.sourceMode,null,x.sourceEpoch,x.createdAt,x.expiresAt),{sql:SUCCESSOR_WATERMARK_SQL,binds:[String(x.watermark)]},
   {sql:`UPDATE ${N.SLOT} SET epoch=?1,mode='closed' WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?2 AND mode=?3 AND active=0 AND nonce='' AND purpose='' AND ?4<=${N.NOW} AND ?5>${N.NOW} RETURNING ${N.TUPLE} AS original_tuple`,binds:[x.targetEpoch,x.sourceEpoch,x.sourceMode,x.createdAt,x.expiresAt]},
   proofStep(x.layout,'closed',null,x.targetEpoch,x.createdAt,x.expiresAt)];
  for(const step of steps)N.bounded(step.sql,step.binds);const plans=steps.map(step=>N.prepared(s.native,s.witness,step.sql,step.binds));plans.forEach(p=>p.witness.assert());s.witness.assert();
  const out=await s.native.batch(plans.map(p=>p.statement)),graph=N.graph(out);plans.forEach(p=>p.witness.assert());s.witness.assert();graph.witness.assert();batchOut(out,4,'successor_native_fence_ack');
  const pre=N.rowSnapshot(N.resultRow(N.own(out,'0')),PROOF_ROW),mark=N.rowSnapshot(N.resultRow(N.own(out,'1')),WATERMARK_ROW),changed=N.rowSnapshot(N.resultRow(N.own(out,'2')),['original_tuple']),last=N.rowSnapshot(N.resultRow(N.own(out,'3')),PROOF_ROW);
  const before=tuple(pre.values[1],x.sourceEpoch,x.sourceMode),after=tuple(last.values[1],x.targetEpoch,'closed');
  if(pre.values[0]!==1||mark.values[0]!==1||!counter(mark.values[1])||last.values[0]!==1||changed.values[0]!==last.values[1]||N.own(N.own(N.own(out,'2'),'meta'),'changes')!==1
   ||before[7]!==after[7]||before[8]!==after[8]||!clock(pre.values[2])||!clock(last.values[2])||(pre.values[2] as number)<x.createdAt||(last.values[2] as number)<(pre.values[2] as number)||(last.values[2] as number)>=x.expiresAt)return held('successor_native_fence_ack');
  const packet={assert(){graph.witness.assert();plans.forEach(p=>p.witness.assert());pre.witness.assert();mark.witness.assert();changed.witness.assert();last.witness.assert();s.witness.assert();}};packet.assert();
  const nativeResultDigest=await N.digest(graph.copy,packet);packet.assert();
  s.facts=Object.freeze({preTuple:pre.values[1] as string,closedTuple:last.values[1] as string,fencedAt:last.values[2] as number,nativeResultDigest,auditSequence:mark.values[1] as number});s.packet=packet;s.phase='complete';
  const ack=Object.freeze({}) as SuccessorNativeFenceAck;fenceAcks.set(ack,s);return ack;
 }catch(error){s.phase='unknown';throw error;}
}
export function successorNativeFenceFacts(ack:SuccessorNativeFenceAck):SuccessorFenceFacts{const s=fenceAcks.get(ack);if(!s||s.phase!=='complete'||!s.facts||!s.packet)return held('successor_native_fence_ack_foreign');s.packet.assert();return s.facts;}
/** S4 capture: exact closed tuple at the target epoch, from [fencedAt, expiresAt). One open per fence. */
export async function captureSuccessorNativeOpen(ack:SuccessorNativeFenceAck):Promise<SuccessorNativeOpen>{
 const s=fenceAcks.get(ack);if(!s||s.phase!=='complete'||!s.facts||!s.packet||s.openSpent)return held('successor_native_open_foreign_or_spent');s.packet.assert();s.openSpent=true;const x=s.input,f=s.facts;
 const step=proofStep(x.layout,'closed',f.closedTuple,x.targetEpoch,f.fencedAt,x.expiresAt),p=N.prepared(s.native,s.witness,step.sql,step.binds),first=N.statementMethod(p.statement,'first');p.witness.assert();first.assert();
 const raw=await Reflect.apply(first.value,p.statement,[]),row=N.rowSnapshot(raw,PROOF_ROW);p.witness.assert();first.assert();row.witness.assert();s.packet.assert();
 if(row.values[0]!==1||row.values[1]!==f.closedTuple||!clock(row.values[2])||(row.values[2] as number)<f.fencedAt||(row.values[2] as number)>=x.expiresAt)return held('successor_native_open_capture');
 const closed=tuple(f.closedTuple,x.targetEpoch,'closed'),servingTuple=JSON.stringify([...closed.slice(0,3),'serving',...closed.slice(4)]);
 const record:Open={fence:s,closedTuple:f.closedTuple,servingTuple,notBefore:f.fencedAt,phase:'prepared',row:{assert(){p.witness.assert();first.assert();row.witness.assert();s.packet!.assert();}},facts:null,packet:null};
 const cap=Object.freeze({}) as SuccessorNativeOpen;opens.set(cap,record);return cap;
}
/** S4: ONE batch. Bound closed proof, the mode CAS on the exact closed tuple, and the bound serving proof. */
export async function executeSuccessorNativeOpen(cap:SuccessorNativeOpen):Promise<SuccessorNativeOpenAck>{
 const s=opens.get(cap);if(!s||s.phase!=='prepared')return held('successor_native_open_foreign_or_spent');s.row.assert();s.phase='dispatched';const x=s.fence.input;
 try{
  const steps=[proofStep(x.layout,'closed',s.closedTuple,x.targetEpoch,s.notBefore,x.expiresAt),
   {sql:`UPDATE ${N.SLOT} SET mode='serving' WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?1 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${N.TUPLE}=?2 AND ?3<=${N.NOW} AND ?4>${N.NOW} RETURNING ${N.TUPLE} AS original_tuple`,binds:[x.targetEpoch,s.closedTuple,s.notBefore,x.expiresAt]},
   proofStep(x.layout,'serving',s.servingTuple,x.targetEpoch,s.notBefore,x.expiresAt)];
  for(const step of steps)N.bounded(step.sql,step.binds);const plans=steps.map(step=>N.prepared(s.fence.native,s.fence.witness,step.sql,step.binds));plans.forEach(p=>p.witness.assert());s.row.assert();
  const out=await s.fence.native.batch(plans.map(p=>p.statement)),graph=N.graph(out);plans.forEach(p=>p.witness.assert());s.row.assert();graph.witness.assert();batchOut(out,3,'successor_native_open_ack');
  const pre=N.rowSnapshot(N.resultRow(N.own(out,'0')),PROOF_ROW),changed=N.rowSnapshot(N.resultRow(N.own(out,'1')),['original_tuple']),last=N.rowSnapshot(N.resultRow(N.own(out,'2')),PROOF_ROW);
  if(pre.values[0]!==1||pre.values[1]!==s.closedTuple||changed.values[0]!==s.servingTuple||last.values[0]!==1||last.values[1]!==s.servingTuple||N.own(N.own(N.own(out,'1'),'meta'),'changes')!==1
   ||!clock(pre.values[2])||!clock(last.values[2])||(pre.values[2] as number)<s.notBefore||(last.values[2] as number)<(pre.values[2] as number)||(last.values[2] as number)>=x.expiresAt)return held('successor_native_open_ack');
  const packet={assert(){graph.witness.assert();plans.forEach(p=>p.witness.assert());pre.witness.assert();changed.witness.assert();last.witness.assert();s.row.assert();}};packet.assert();
  const nativeResultDigest=await N.digest(graph.copy,packet);packet.assert();
  s.facts=Object.freeze({servingTuple:s.servingTuple,openedAt:last.values[2] as number,nativeResultDigest});s.packet=packet;s.phase='complete';
  const ack=Object.freeze({}) as SuccessorNativeOpenAck;openAcks.set(ack,s);return ack;
 }catch(error){s.phase='unknown';throw error;}
}
export function successorNativeOpenFacts(ack:SuccessorNativeOpenAck):SuccessorOpenFacts{const s=openAcks.get(ack);if(!s||s.phase!=='complete'||!s.facts||!s.packet)return held('successor_native_open_ack_foreign');s.packet.assert();return s.facts;}
