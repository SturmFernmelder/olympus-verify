/** One bounded automatic serving-erasure continuation. No operator session is fabricated.
 * Purpose receipts and provider/recovery debt stay separate from local account completion.
 */
import type {Env} from './env';
import {captureAccountErasureProof,originalErasureJobBirthSql,CURRENT_ERASURE_SQL,PRIVACY_DB_NOW,admitInactiveServingAccount,type AccountErasureProof} from './privacy-serving-authority';
import {continueServingErasure} from './privacy-serving-erase';
import {cleanupPrivacyMessages} from './privacy-provider-messages';
import {admitInactiveBotAccount} from './privacy-inactive-bot';
export const SERVING_ERASURE_JOB_WORST=151;

type OriginalQueuedErasure=Readonly<Omit<AccountErasureProof,'purpose'>&{last_attempt_at:number|null}>;
/** Copy the acknowledged original queue row before any subsequent provider/Native await. */
function originalQueuedErasure(row:OriginalQueuedErasure):OriginalQueuedErasure{
 const fields=['subject','subjectGeneration','operationId','requestDigest','accountIncarnation','last_attempt_at'] as const,copy:Record<string,unknown>={};
 for(const k of fields){const d=Object.getOwnPropertyDescriptor(row,k);if(!d||!Object.hasOwn(d,'value')||d.get||d.set)throw Error('erasure_original_queue_held');copy[k]=d.value;}
 const p=captureAccountErasureProof({purpose:'account_erasure',subject:copy.subject,subjectGeneration:copy.subjectGeneration,operationId:copy.operationId,requestDigest:copy.requestDigest,accountIncarnation:copy.accountIncarnation} as AccountErasureProof).proof;
 const last=copy.last_attempt_at;if(last!==null&&(!Number.isSafeInteger(last)||(last as number)<1))throw Error('erasure_original_queue_held');
 return Object.freeze({subject:p.subject,subjectGeneration:p.subjectGeneration,operationId:p.operationId,requestDigest:p.requestDigest,accountIncarnation:p.accountIncarnation,last_attempt_at:last as number|null});
}
export async function runServingErasureJob(env:Env):Promise<{attempted:number;completed:number;held:number}>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return{attempted:0,completed:0,held:0};
 let row=await env.DB.prepare(`SELECT operation_id AS operationId,subject_id AS subject,subject_generation AS subjectGeneration,request_digest AS requestDigest,original_account_incarnation AS accountIncarnation,last_attempt_at
 FROM privacy_serving_jobs WHERE state IN('waiting_role','held') AND retain_until>${PRIVACY_DB_NOW} AND (last_attempt_at IS NULL OR last_attempt_at<=${PRIVACY_DB_NOW}-120)
 ORDER BY COALESCE(last_attempt_at,0),created_at,operation_id LIMIT 1`).first<OriginalQueuedErasure>();
 if(row)row=originalQueuedErasure(row);
 if(!row){const admitted=await admitInactiveServingAccount(env)??await admitInactiveBotAccount(env);if(admitted){const original=captureAccountErasureProof(admitted).proof;row=Object.freeze({subject:original.subject,subjectGeneration:original.subjectGeneration,operationId:original.operationId,requestDigest:original.requestDigest,accountIncarnation:original.accountIncarnation,last_attempt_at:null});}}
 if(!row){
  // Completed local erasure can leave more than two pointer pages. Continue that independent
  // purpose custody in the same bounded job; no old account authority or new role effect is minted.
  const debt=await env.DB.prepare(`SELECT json_extract(x.value,'$.id') AS subject FROM privacy_provider_messages m JOIN json_each(m.subjects)x
  WHERE m.cleanup_requested=1 AND m.state IN('known','cleaning') ORDER BY m.created_at,m.operation_id LIMIT 1`).first<{subject:string}>();
  if(debt&&/^\d{17,20}$/.test(debt.subject))await cleanupPrivacyMessages(env,debt.subject);
  return{attempted:0,completed:0,held:0};
 }
 const proof=captureAccountErasureProof({purpose:'account_erasure',subject:row.subject,subjectGeneration:row.subjectGeneration,operationId:row.operationId,requestDigest:row.requestDigest,accountIncarnation:row.accountIncarnation}).proof;
 const claim=await env.DB.prepare(`UPDATE privacy_serving_jobs SET last_attempt_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND last_attempt_at IS ?5 AND ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)})`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,row.last_attempt_at).run();
 if(claim.meta.changes!==1)return{attempted:0,completed:0,held:0};
 let completed=0,reason='continuation_failed',staffAccess:'human-managed'|'none'|'unknown'='unknown';
 try{const out=await continueServingErasure(env,proof);staffAccess=out.staffAccess;if(out.state==='complete')completed=1;else reason=out.reason??'provider_or_storage_hold';}
 finally{if(!completed)await env.DB.prepare(`UPDATE privacy_serving_jobs SET state='held',hold_reason=?5,staff_access=?6 WHERE operation_id=?1 AND ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)})`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,reason,staffAccess).run();}
 return{attempted:1,completed,held:completed?0:1};
}
