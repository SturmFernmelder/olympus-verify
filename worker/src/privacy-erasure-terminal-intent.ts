/** Source-owned terminal intent. Neither a scalar proof nor caller SQL can issue this capability. */
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {recoveryScalarArraySha256,recoveryIsDataArray} from './privacy-recovery-data-json';
import {assertOriginalErasureJobRead,consumeOriginalErasureJobRead,originalErasureJobReadFacts,type OriginalErasureJobRead,type OriginalErasureJobFacts} from './privacy-erasure-terminal-job-read';
import {assertAccountErasureTerminalGroup,originalAccountErasureTerminalGroupFacts,type OriginalAccountErasureTerminalGroup} from './privacy-account-erasure-terminal-group';

declare const originalTerminalIntentBrand:unique symbol;
export type OriginalErasureTerminalIntent=Readonly<{[originalTerminalIntentBrand]:true}>;
export type OriginalErasureTerminalIntentFacts=Readonly<{job:OriginalErasureJobRead;group:OriginalAccountErasureTerminalGroup;jobFacts:OriginalErasureJobFacts;terminalIntentDigest:string;statusBindingDigest:string;terminalIndex:number}>;
const intents=new WeakMap<OriginalErasureTerminalIntent,{facts:OriginalErasureTerminalIntentFacts;spent:boolean}>();
const held=():never=>{throw new RecoveryFloorHeld();};
function originalBindData(value:unknown):unknown{if(value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return value;if(!value||typeof value!=='object'||Reflect.ownKeys(value).length!==1)return held();const d=Object.getOwnPropertyDescriptor(value,'blob');if(!d||!Object.hasOwn(d,'value')||!recoveryIsDataArray(d.value))return held();return ['blob',d.value];}

/** The group issuer belongs to the actual erasure source and privately projects its exact ordered plans.
 * Group/assert accessors reject copied tuples, altered statement refs and unrelated writer groups. */
export async function captureOriginalAccountErasureTerminalIntent(job:OriginalErasureJobRead,group:OriginalAccountErasureTerminalGroup):Promise<OriginalErasureTerminalIntent>{
 assertOriginalErasureJobRead(job);assertAccountErasureTerminalGroup(group,job);
 const jobFacts=originalErasureJobReadFacts(job),original=originalAccountErasureTerminalGroupFacts(group,job);
 // The issuer owns the plan snapshots; this consumer does not accept SQL/arrays from a caller.
 const logical=original.logical;
 if(!recoveryIsDataArray(logical)||logical.length<3||logical.length>1000||!Number.isSafeInteger(original.terminalIndex)||original.terminalIndex!==logical.length-1)return held();
 const p=jobFacts.proof,proofData=[p.purpose,p.subject,p.subjectGeneration,p.operationId,p.requestDigest,p.accountIncarnation];
 const planData:unknown[]=[];for(let i=0;i<logical.length;i++){const d=Object.getOwnPropertyDescriptor(logical,String(i));if(!d||!Object.hasOwn(d,'value')||!d.value||typeof d.value!=='object')return held();const sql=Object.getOwnPropertyDescriptor(d.value,'sql'),binds=Object.getOwnPropertyDescriptor(d.value,'values');if(!sql||!binds||!Object.hasOwn(sql,'value')||!Object.hasOwn(binds,'value')||typeof sql.value!=='string')return held();let bindData:unknown=null;if(binds.value!==null){if(!recoveryIsDataArray(binds.value))return held();const list:unknown[]=[];for(let j=0;j<binds.value.length;j++){const b=Object.getOwnPropertyDescriptor(binds.value,String(j));if(!b||!Object.hasOwn(b,'value'))return held();list.push(originalBindData(b.value));}bindData=list;}planData.push([sql.value,bindData]);}
 const statusBindingDigest=await recoveryScalarArraySha256(['source-erasure-status-binding-v1',p.operationId,p.subjectGeneration,p.requestDigest,jobFacts.originalRetainUntil]);
 assertOriginalErasureJobRead(job);assertAccountErasureTerminalGroup(group,job);
 const serialized=['source-erasure-terminal-sql-bind-intent-v2',proofData,jobFacts.jobReadDigest,statusBindingDigest,planData,original.terminalIndex];
 assertOriginalErasureJobRead(job);assertAccountErasureTerminalGroup(group,job);consumeOriginalErasureJobRead(job);
 const terminalIntentDigest=await recoveryScalarArraySha256(serialized);
 assertOriginalErasureJobRead(job);assertAccountErasureTerminalGroup(group,job);
 const facts=Object.freeze({job,group,jobFacts,terminalIntentDigest,statusBindingDigest,terminalIndex:original.terminalIndex});
 const intent=Object.freeze({}) as OriginalErasureTerminalIntent;intents.set(intent,{facts,spent:false});return intent;
}
export function assertOriginalErasureTerminalIntent(intent:OriginalErasureTerminalIntent):void{const state=intents.get(intent);if(!state)return held();assertOriginalErasureJobRead(state.facts.job);assertAccountErasureTerminalGroup(state.facts.group,state.facts.job);}
export function originalErasureTerminalIntentFacts(intent:OriginalErasureTerminalIntent):OriginalErasureTerminalIntentFacts{assertOriginalErasureTerminalIntent(intent);return intents.get(intent)!.facts;}
/** Called by the specialized original D1 child, once before independent reserve and Native dispatch. */
export function consumeOriginalErasureTerminalIntent(intent:OriginalErasureTerminalIntent):OriginalErasureTerminalIntentFacts{assertOriginalErasureTerminalIntent(intent);const state=intents.get(intent)!;if(state.spent)return held();state.spent=true;return state.facts;}
