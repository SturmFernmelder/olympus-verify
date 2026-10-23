/** One bounded automatic serving-erasure continuation. No operator session is fabricated.
 * Purpose receipts and provider/recovery debt stay separate from local account completion.
 */
import type {Env} from './env';
import {nativeErasureMode} from './privacy-native-mode';
import {captureAccountErasureProof,originalErasureJobBirthSql,CURRENT_ERASURE_SQL,PRIVACY_DB_NOW,admitInactiveServingAccount,type AccountErasureProof} from './privacy-serving-authority';
import {continueServingErasure,erasureAttemptDiscipline,ERASURE_ATTEMPT_UNRESOLVED} from './privacy-serving-erase';
import {cleanupPrivacyMessages} from './privacy-provider-messages';
import {newsWebhookCleanupDueSql} from './site-news-webhook';
import {admitInactiveBotAccount} from './privacy-inactive-bot';
import {erasureAttemptFenceMode,claimOriginalErasureAttempt,originalErasureAttemptFacts,type OriginalErasureAttempt} from './privacy-erasure-attempt-identity';
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
/** Attempt discipline only: an attempt that may have reached terminal custody is never selected or claimed again automatically. */
const DISCIPLINE_EXCLUSION=` AND COALESCE(hold_reason,'') NOT IN('${ERASURE_ATTEMPT_UNRESOLVED}','independent_suppression_outcome_unknown')`;
// Native retries are original-operation, idempotent SQL/DELETE continuations. They never
// adopt a historical configured/Floor attempt or assert cancellation of an older HTTP call.
const NATIVE_PENDING='native_attempt_pending';
export async function runServingErasureJob(env:Env):Promise<{attempted:number;completed:number;held:number}>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return{attempted:0,completed:0,held:0};
 // Native .164: alternate database-clock quarter-hours reserve a bounded global
 // message-debt turn, so a held account cannot starve known/cleaning pointers.
 // The existing cleanup page owns rotation and exact bot/author/no-repeat checks;
 // minimized subjects need no account association to continue that custody.
 if(nativeErasureMode(env)){
  const debt=await env.DB.prepare(`SELECT 1 AS due FROM privacy_provider_messages m
  WHERE (m.cleanup_requested=1 OR ${newsWebhookCleanupDueSql}) AND m.state IN('known','cleaning') AND (${PRIVACY_DB_NOW}/900)%2=0 LIMIT 1`).first<{due:number}>();
  if(debt){await cleanupPrivacyMessages(env);return{attempted:0,completed:0,held:0};}
 }
 // An invalid discipline value holds new attempts and inactive admission; the independent provider-message debt lane continues.
 const discipline=erasureAttemptFenceMode(env)===null?null:erasureAttemptDiscipline(env);
 let row=discipline===null?null:await env.DB.prepare(`SELECT operation_id AS operationId,subject_id AS subject,subject_generation AS subjectGeneration,request_digest AS requestDigest,original_account_incarnation AS accountIncarnation,last_attempt_at
 FROM privacy_serving_jobs WHERE state IN('waiting_role','held') AND retain_until>${PRIVACY_DB_NOW} AND (last_attempt_at IS NULL OR last_attempt_at<=${PRIVACY_DB_NOW}-120)${discipline?DISCIPLINE_EXCLUSION:''}
 ORDER BY COALESCE(last_attempt_at,0),created_at,operation_id LIMIT 1`).first<OriginalQueuedErasure>();
 if(row)row=originalQueuedErasure(row);
 if(!row&&discipline!==null){const admitted=await admitInactiveServingAccount(env)??await admitInactiveBotAccount(env);if(admitted){
  // Native admission has already durably retained the exact waiting_role job,
  // birth, generation and fixed deadline. Its physical admission transaction
  // and full terminal cleanup cannot share the installed 196-statement slice.
  // The next ordinary invocation selects this original row through the same
  // queue predicate; no new cadence, identity, deadline or attempt is minted.
  if(nativeErasureMode(env))return{attempted:0,completed:0,held:0};
  const original=captureAccountErasureProof(admitted).proof;row=Object.freeze({subject:original.subject,subjectGeneration:original.subjectGeneration,operationId:original.operationId,requestDigest:original.requestDigest,accountIncarnation:original.accountIncarnation,last_attempt_at:null});}}
 if(!row){
  // Completed local erasure can leave more than two pointer pages. Continue that independent
  // purpose custody in the same bounded job; no old account authority or new role effect is minted.
  // This lane drains only requested/due operation custody. Selecting a message
  // never authorizes marking every other message of its editor for account erasure.
  const debt=await env.DB.prepare(`SELECT 1 AS due FROM privacy_provider_messages m
  WHERE (m.cleanup_requested=1 OR ${newsWebhookCleanupDueSql}) AND m.state IN('known','cleaning') ORDER BY m.created_at,m.operation_id LIMIT 1`).first<{due:number}>();
  if(debt)await cleanupPrivacyMessages(env);
  return{attempted:0,completed:0,held:0};
 }
 if(discipline)return continueDisciplinedQueuedErasure(env,row);
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

/** Attempt discipline only. One compare-and-set claim, shared by cron and the site continuation, writes the durable
 * unresolved marker in the same statement. Only an explicitly known held outcome of this same claimed attempt (which
 * ran no terminal batch) replaces it; throws, unknown outcomes and failed or lost final writes keep it. The guarantee
 * is no new terminal suppression reservation, companion or terminal child beyond the known-hold baseline; the
 * original-proof reads and role/debt work that precede references_clear still run. Turning the flag off, or serving
 * an older writer, restores legacy retry behaviour; that is not a drain. */
async function continueDisciplinedQueuedErasure(env:Env,row:OriginalQueuedErasure):Promise<{attempted:number;completed:number;held:number}>{
 const proof=captureAccountErasureProof({purpose:'account_erasure',subject:row.subject,subjectGeneration:row.subjectGeneration,operationId:row.operationId,requestDigest:row.requestDigest,accountIncarnation:row.accountIncarnation}).proof;
 const fence=erasureAttemptFenceMode(env);if(fence===null)return{attempted:0,completed:0,held:0};
 const marker=nativeErasureMode(env)?NATIVE_PENDING:ERASURE_ATTEMPT_UNRESOLVED;
 let attempt:OriginalErasureAttempt|undefined,claimed:number;
 if(fence){
  const issued=await claimOriginalErasureAttempt(env,proof,row.last_attempt_at);if(!issued)return{attempted:0,completed:0,held:0};
  attempt=issued;claimed=originalErasureAttemptFacts(issued,env,proof).claimed;
 }else{
 const claim=await env.DB.prepare(`UPDATE privacy_serving_jobs SET last_attempt_at=${PRIVACY_DB_NOW},hold_reason='${marker}' WHERE operation_id=?1 AND last_attempt_at IS ?5${DISCIPLINE_EXCLUSION} AND ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)}) RETURNING last_attempt_at AS claimed`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,row.last_attempt_at).first<{claimed:number}>();
 const claimedDescriptor=claim!==null&&typeof claim==='object'?Object.getOwnPropertyDescriptor(claim,'claimed'):undefined;
 if(!claimedDescriptor||!Object.hasOwn(claimedDescriptor,'value')||!Number.isSafeInteger(claimedDescriptor.value)||claimedDescriptor.value<1)return{attempted:0,completed:0,held:0};
 claimed=claimedDescriptor.value as number;
 }
 let completed=0,known:string|null=null,staffAccess:'human-managed'|'none'|'unknown'='unknown';
 try{const out=await continueServingErasure(env,proof,attempt);staffAccess=out.staffAccess;if(out.state==='complete')completed=1;else if(out.state==='held'&&typeof out.reason==='string')known=out.reason;}
 finally{if(!completed)await env.DB.prepare(`UPDATE privacy_serving_jobs SET state='held',hold_reason=COALESCE(?5,hold_reason),staff_access=?6 WHERE operation_id=?1 AND hold_reason='${marker}' AND last_attempt_at IS ?7 AND ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)})`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest,known,staffAccess,claimed).run();}
 return{attempted:1,completed,held:completed?0:1};
}
/** Attempt discipline only: the site continuation selects its own queue row with the cron predicate and claims it
 * through the same compare-and-set. Without the flag the legacy site path is unchanged. */
export async function continueSiteServingErasure(env:Env,operationId:string):Promise<void>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true'||erasureAttemptDiscipline(env)!==true||erasureAttemptFenceMode(env)===null||!/^[0-9a-f]{32}$/.test(operationId))return;
 let row=await env.DB.prepare(`SELECT operation_id AS operationId,subject_id AS subject,subject_generation AS subjectGeneration,request_digest AS requestDigest,original_account_incarnation AS accountIncarnation,last_attempt_at
 FROM privacy_serving_jobs WHERE operation_id=?1 AND state IN('waiting_role','held') AND retain_until>${PRIVACY_DB_NOW} AND (last_attempt_at IS NULL OR last_attempt_at<=${PRIVACY_DB_NOW}-120)${DISCIPLINE_EXCLUSION}`).bind(operationId).first<OriginalQueuedErasure>();
 if(!row)return;
 row=originalQueuedErasure(row);
 await continueDisciplinedQueuedErasure(env,row);
}
