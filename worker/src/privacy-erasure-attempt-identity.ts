/** Phase 2 preparation only (owner, 2026-10-16). An acknowledged claim is not a fence,
 * retry permission, terminal result or authority to resolve independent unknown custody. */
import type {Env} from './env';
import {captureAccountErasureProof,originalErasureJobBirthSql,CURRENT_ERASURE_SQL,PRIVACY_DB_NOW,privacyProviderCustodyDatabase,type AccountErasureProof} from './privacy-serving-authority';
import {globalServingMode,captureOriginalErasureAttemptOrigin} from './privacy-global-serving-origin';
import {assertPrivacyAdmissionWitness} from './privacy-write-admission';
import {RecoveryFloorHeld} from './privacy-recovery-held';

declare const attemptBrand:unique symbol;
export type OriginalErasureAttempt=Readonly<{[attemptBrand]:true}>;
type Facts=Readonly<{proof:Readonly<AccountErasureProof>;previous:number|null;claimed:number}>;
type State={env:Env;facts:Facts;check:()=>void;entered:boolean;read:boolean};
const attempts=new WeakMap<OriginalErasureAttempt,State>();
const MARKER='attempt_unresolved',MAX_CLAIM=253402300798;
const held=():never=>{throw new RecoveryFloorHeld();};
const same=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined)=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
const integer=(v:unknown,max=MAX_CLAIM):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=max;

/** Default OFF. Invalid values/dependencies hold new claims but do not disable the independent debt lane. */
export function erasureAttemptFenceMode(env:Env):boolean|null{
 const d=Object.getOwnPropertyDescriptor(env,'PRIVACY_ERASURE_ATTEMPT_FENCE');
 if(!d)return 'PRIVACY_ERASURE_ATTEMPT_FENCE'in env?null:false;
 if(!Object.hasOwn(d,'value'))return null;
 if(d.value===undefined||d.value==='false')return false;
 if(d.value!=='true')return null;
 for(const key of ['PRIVACY_ERASURE_ENABLED','PRIVACY_ERASURE_ATTEMPT_DISCIPLINE','PRIVACY_WRITE_ADMISSION_ENABLED'] as const){const value=Object.getOwnPropertyDescriptor(env,key);if(!value||!Object.hasOwn(value,'value')||value.value!=='true')return null;}
 try{if(globalServingMode(env)!=='configured')return null;assertPrivacyAdmissionWitness(privacyProviderCustodyDatabase(env));}catch{return null;}
 return true;
}

/** This producer executes its own fixed consuming CAS. There is no exported row/packet issuer. */
export async function claimOriginalErasureAttempt(env:Env,input:AccountErasureProof,previous:number|null):Promise<OriginalErasureAttempt|null>{
 if(erasureAttemptFenceMode(env)!==true)return held();
 if(previous!==null&&!integer(previous,253402300799))return held();
 const origin=captureOriginalErasureAttemptOrigin(env),original=captureAccountErasureProof(input),proof=original.proof,prototype=Object.getPrototypeOf(env),keys=Reflect.ownKeys(env),descriptors=keys.map(k=>Object.freeze({...Object.getOwnPropertyDescriptor(env,k)!})),custody=privacyProviderCustodyDatabase(env);
 const current=()=>{origin.check();original.check();if(Object.getPrototypeOf(env)!==prototype||Reflect.ownKeys(env).length!==keys.length||keys.some((k,i)=>!same(descriptors[i],Object.getOwnPropertyDescriptor(env,k)))||erasureAttemptFenceMode(env)!==true)return held();assertPrivacyAdmissionWitness(custody);};current();
 const row=await env.DB.prepare(`UPDATE privacy_serving_jobs SET last_attempt_at=MAX(${PRIVACY_DB_NOW},COALESCE(last_attempt_at,0)+1),hold_reason='${MARKER}' WHERE operation_id=?1 AND last_attempt_at IS ?5 AND (?5 IS NULL OR(typeof(last_attempt_at)='integer' AND ?5>=1 AND ?5<${MAX_CLAIM})) AND ${PRIVACY_DB_NOW} BETWEEN 1 AND ${MAX_CLAIM} AND COALESCE(hold_reason,'') NOT IN('${MARKER}','independent_suppression_outcome_unknown') AND ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)}) RETURNING last_attempt_at AS claimed`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,previous).first<{claimed:number}>();
 current();if(row===null)return null;
 if(typeof row!=='object'||Reflect.ownKeys(row).length!==1)return held();
 const descriptor=Object.getOwnPropertyDescriptor(row,'claimed'),rowPrototype=Object.getPrototypeOf(row);
 if(!descriptor||!Object.hasOwn(descriptor,'value')||!integer(descriptor.value)||previous!==null&&descriptor.value<=previous)return held();
 const saved=Object.freeze({...descriptor}),facts=Object.freeze({proof,previous,claimed:descriptor.value as number});
 const check=()=>{current();if(Object.getPrototypeOf(row)!==rowPrototype||Reflect.ownKeys(row).length!==1||!same(saved,Object.getOwnPropertyDescriptor(row,'claimed')))return held();};check();
 const cap=Object.freeze({}) as OriginalErasureAttempt;attempts.set(cap,{env,facts,check,entered:false,read:false});return cap;
}
/** Lookup only: copied handles, another environment, or another operation/birth/generation never match. */
export function originalErasureAttemptFacts(cap:OriginalErasureAttempt,env:Env,input:AccountErasureProof):Facts{
 const s=attempts.get(cap);if(!s||s.env!==env)return held();s.check();
 const p=captureAccountErasureProof(input);p.check();const original=s.facts.proof;
 if(p.proof.operationId!==original.operationId||p.proof.subject!==original.subject||p.proof.subjectGeneration!==original.subjectGeneration||p.proof.requestDigest!==original.requestDigest||p.proof.accountIncarnation!==original.accountIncarnation)return held();
 return s.facts;
}
export function enterOriginalErasureAttempt(cap:OriginalErasureAttempt,env:Env,proof:AccountErasureProof):void{
 originalErasureAttemptFacts(cap,env,proof);const s=attempts.get(cap)!;if(s.entered)return held();s.entered=true;
}
export function consumeOriginalErasureAttemptJobRead(cap:OriginalErasureAttempt,env:Env,proof:AccountErasureProof):Facts{
 const facts=originalErasureAttemptFacts(cap,env,proof),s=attempts.get(cap)!;if(!s.entered||s.read)return held();s.read=true;return facts;
}
