/** One bounded automatic serving-erasure continuation. No operator session is fabricated.
 * Purpose receipts and provider/recovery debt stay separate from local account completion.
 */
import type {Env} from './env';
import {CURRENT_ERASURE_SQL,PRIVACY_DB_NOW,admitInactiveServingAccount,type AccountErasureProof} from './privacy-serving-authority';
import {continueServingErasure} from './privacy-serving-erase';
import {cleanupPrivacyMessages} from './privacy-provider-messages';
import {admitInactiveBotAccount} from './privacy-inactive-bot';
export const SERVING_ERASURE_JOB_WORST=148;

export async function runServingErasureJob(env:Env):Promise<{attempted:number;completed:number;held:number}>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return{attempted:0,completed:0,held:0};
 let row=await env.DB.prepare(`SELECT operation_id AS operationId,subject_id AS subject,subject_generation AS subjectGeneration,request_digest AS requestDigest,last_attempt_at
 FROM privacy_serving_jobs WHERE state IN('waiting_role','held') AND retain_until>${PRIVACY_DB_NOW} AND (last_attempt_at IS NULL OR last_attempt_at<=${PRIVACY_DB_NOW}-120)
 ORDER BY COALESCE(last_attempt_at,0),created_at,operation_id LIMIT 1`).first<Omit<AccountErasureProof,'purpose'>&{last_attempt_at:number|null}>();
 if(!row){const admitted=await admitInactiveServingAccount(env)??await admitInactiveBotAccount(env);if(admitted)row={...admitted,last_attempt_at:null};}
 if(!row){
  // Completed local erasure can leave more than two pointer pages. Continue that independent
  // purpose custody in the same bounded job; no old account authority or new role effect is minted.
  const debt=await env.DB.prepare(`SELECT json_extract(x.value,'$.id') AS subject FROM privacy_provider_messages m JOIN json_each(m.subjects)x
  WHERE m.cleanup_requested=1 AND m.state IN('known','cleaning') ORDER BY m.created_at,m.operation_id LIMIT 1`).first<{subject:string}>();
  if(debt&&/^\d{17,20}$/.test(debt.subject))await cleanupPrivacyMessages(env,debt.subject);
  return{attempted:0,completed:0,held:0};
 }
 const proof:AccountErasureProof={purpose:'account_erasure',subject:row.subject,subjectGeneration:row.subjectGeneration,operationId:row.operationId,requestDigest:row.requestDigest};
 const claim=await env.DB.prepare(`UPDATE privacy_serving_jobs SET last_attempt_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND last_attempt_at IS ?5 AND ${CURRENT_ERASURE_SQL}`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,row.last_attempt_at).run();
 if(claim.meta.changes!==1)return{attempted:0,completed:0,held:0};
 let completed=0,reason='continuation_failed';
 try{const out=await continueServingErasure(env,proof);if(out.state==='complete')completed=1;else reason=out.reason??'provider_or_storage_hold';}
 finally{if(!completed)await env.DB.prepare(`UPDATE privacy_serving_jobs SET state='held',hold_reason=?5 WHERE operation_id=?1 AND ${CURRENT_ERASURE_SQL}`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,reason).run();}
 return{attempted:1,completed,held:completed?0:1};
}
