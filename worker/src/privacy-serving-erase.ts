import './privacy-access-data';
import './ruleset-publication-data';
/** Serving-account completion; independent provider messages/recovery copies retain truthful custody.
 * Dormant .129 completion and restore authority are not enabled by this module.
 */
import type { Env } from './env';
import {nativeErasureMode} from './privacy-native-mode';
import {cleanupNativePersonalReferences} from './privacy-native-erasure-cleanup';
import {cleanupNativeErasureRoles,nativeErasureRolesSettledSql} from './privacy-native-erasure-roles';
import {originalClosedRecoveryCleanupAccount,type OriginalClosedRecoveryReplaySelection,type OriginalClosedCleanupStep} from './privacy-production-control-origin';
import {globalServingMode,dispatchOriginalAccountErasureTerminalBatch} from './privacy-global-serving-origin';
import {captureOriginalAccountErasureJobRead,originalAccountErasureCompanionGuardStatement,originalErasureJobReadFacts} from './privacy-erasure-terminal-job-read';
import {captureAccountErasureTerminalGroup} from './privacy-account-erasure-terminal-group';
import {erasureAttemptFenceMode,enterOriginalErasureAttempt,originalErasureAttemptFacts,type OriginalErasureAttempt} from './privacy-erasure-attempt-identity';
import {rejectionErasureMarkerStatements} from './privacy-rejection-decision';
import {staffAccessDetails,type StaffAccessDetails} from './privacy-erasure-staff-custody';
import {originalPrivacyStatementGroupProjection} from './privacy-serving-authority';
import './community-routes';
import {qrErasureCustodyClearSql} from './qr-phase1-data';
import { communityDataNames,communityEraseStatements } from './community-context';
import { mentionDeletes, mentionExactReferenceSql } from './site-admin';
import { servingPrivacyCatalogAndStaffCustody } from './privacy-business-catalog';
import { cleanupPrivacyMessages,privacyMessageDebt } from './privacy-provider-messages';
import { captureAccountErasureProof,originalErasureJobBirthSql,CURRENT_ERASURE_SQL, PRIVACY_DB_NOW, PRIVACY_REPLAY, PRIVACY_YEAR, currentAccountErasureProof,
 privacySubjectKey, type AccountErasureProof, type MemberRoleSettlement } from './privacy-serving-authority';

type OriginalTerminalProducer=Readonly<{proof:Readonly<AccountErasureProof>;check:()=>void}>;
const originalTerminalProducerGroups=new WeakMap<D1PreparedStatement[],{env:Env;facts:OriginalTerminalProducer}>();
// This private registrar is called only by completeServingAccount's exact authored plan builder below.
function retainOriginalTerminalProducer(env:Env,proof:AccountErasureProof,statements:D1PreparedStatement[],attempt?:OriginalErasureAttempt):void{
 const original=captureAccountErasureProof(proof),db=Object.getOwnPropertyDescriptor(env,'DB');if(!db||!Object.hasOwn(db,'value'))throw Error('privacy_terminal_source_unowned');
 const projection=originalPrivacyStatementGroupProjection(db.value as D1Database,statements),prototype=Object.getPrototypeOf(env),check=()=>{original.check();if(attempt)originalErasureAttemptFacts(attempt,env,proof);projection.check();const now=Object.getOwnPropertyDescriptor(env,'DB');if(Object.getPrototypeOf(env)!==prototype||!now||!['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(now[k as keyof PropertyDescriptor],db[k as keyof PropertyDescriptor])))throw Error('privacy_terminal_source_changed');};check();
 originalTerminalProducerGroups.set(statements,{env,facts:Object.freeze({proof:original.proof,check})});
}
/** Lookup only. A copied array/env or unrelated normal admitted group cannot acquire this source custody. */
export function originalAccountErasureProducerFacts(env:Env,statements:D1PreparedStatement[]):OriginalTerminalProducer{
 const stored=originalTerminalProducerGroups.get(statements);if(!stored||stored.env!==env)throw Error('privacy_terminal_source_unowned');stored.facts.check();return stored.facts;
}

/** Optional default-off attempt discipline. Absent or 'false' keeps every legacy SQL text and request sequence; any other value fails closed. */
export const ERASURE_ATTEMPT_UNRESOLVED='attempt_unresolved';
export function erasureAttemptDiscipline(env:Env):boolean|null{
 const value=env.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE;
 return value===undefined||value==='false'?false:value==='true'?true:null;
}
/** The exact character-reference entry predicate characterReferenceScrub uses, parameterised only by the bound subject slot. */
const characterReferenceMatchSql=(id:'?1'|'?2')=>`CASE WHEN e.type='object' THEN (SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='kind')=1
 AND (SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='key')=1 AND json_extract(e.value,'$.kind')='name'
 AND json_type(e.value,'$.key')='text' AND json_extract(e.value,'$.key') IN(SELECT name_key FROM characters WHERE discord_id=${id}) ELSE 0 END`;
/** Attempt discipline only: an otherwise structured other-owner application that would still contain the subject
 * after the batch's two ordered scrubs (character references, then exact Discord references). The consuming
 * in-batch guard 'privacy_ambiguous_reference_held' stays unchanged and remains the authority. */
function postScrubApplicationReferenceSql():string{
 const removal=(input:string,match:string,name:string)=>`(WITH RECURSIVE ${name}_m(idx,ordinal) AS(SELECT CAST(e.key AS INTEGER),ROW_NUMBER() OVER(ORDER BY CAST(e.key AS INTEGER) DESC) FROM json_each(${input},'$.references')e WHERE ${match}),
 ${name}_s(ordinal,text) AS(SELECT 0,${input} UNION ALL SELECT s.ordinal+1,json_remove(s.text,'$.references['||m.idx||']') FROM ${name}_s s JOIN ${name}_m m ON m.ordinal=s.ordinal+1)
 SELECT text FROM ${name}_s ORDER BY ordinal DESC LIMIT 1)`;
 const afterCharacter=removal('a.answers',characterReferenceMatchSql('?2'),'character_scrub');
 const afterMention=removal(afterCharacter,mentionExactReferenceSql('?2'),'mention_scrub');
 return `EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id<>?2 AND CASE WHEN NOT json_valid(a.answers) THEN 0
 WHEN json_type(a.answers)<>'object' THEN 0 WHEN COALESCE(json_type(a.answers,'$.references'),'')<>'array' THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='references')<>1 THEN 0 ELSE instr(${afterMention},?2)>0 END)`;
}
/** One fixed authored predicate for negative preflight and the consuming atomic guard. */
function ambiguousAccountReferencesSql(discipline=false):string{
 // The legacy watcher grouped names in a typed system audit row. Attribute only names
 // covered by the account's live character ownership interval, preserving the other names.
 const groupedShape=(a:string)=>`CASE WHEN NOT json_valid(${a}.details) THEN 0
 WHEN json_type(${a}.details)<>'object' THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(${a}.details) WHERE key='names')<>1 THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(${a}.details))<>(SELECT COUNT(DISTINCT key) FROM json_each(${a}.details)) THEN 0
 WHEN COALESCE(json_type(${a}.details,'$.names'),'')<>'array' THEN 0
 ELSE NOT EXISTS(SELECT 1 FROM json_each(${a}.details,'$.names') WHERE type<>'text') END`;
 // Ambiguous/manual references in another owner's record cannot be guessed away. The structured
 // application scrub runs below, but any still-ambiguous raw document closes this batch.
 return `EXISTS(SELECT 1 FROM site_settings WHERE instr(value,?2)>0)
 OR EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id<>?2 AND instr(a.answers,?2)>0 AND
 (NOT json_valid(a.answers) OR CASE WHEN json_valid(a.answers) THEN json_type(a.answers)<>'object' OR
 (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='references')<>1 OR
 COALESCE(json_type(a.answers,'$.references'),'')<>'array' ELSE 1 END))
 OR EXISTS(SELECT 1 FROM audit a JOIN characters c ON c.discord_id=?2 AND a.ts>=c.bound_at
 WHERE a.actor='system' AND a.action='roster.identity_held' AND a.subject IS NULL
 AND NOT (${groupedShape('a')}) AND CASE WHEN json_valid(a.details) THEN
 EXISTS(SELECT 1 FROM json_tree(a.details) j WHERE j.type='text' AND
 (j.value=c.name COLLATE NOCASE OR j.value=c.name_key COLLATE NOCASE))
 ELSE instr(lower(COALESCE(a.details,'')),lower(c.name))>0 OR instr(lower(COALESCE(a.details,'')),lower(c.name_key))>0 END)`+(discipline?`
 OR ${postScrubApplicationReferenceSql()}`:'');
}

export type ServingCompletion={state:'held'|'unknown'|'complete';reason:string|null;servingAccountErased:boolean;allCopiesErased:false;providerMessages:'unqualified';recoveryCopies:'operator-held';staffAccess:MemberRoleSettlement['staffAccess'];staffAccessDetails:StaffAccessDetails;messageDebt?:{known:number;unknown:number}};
const held=(reason:string,state:'held'|'unknown'='held',staffAccess:MemberRoleSettlement['staffAccess']='unknown',details=staffAccessDetails(staffAccess)):ServingCompletion=>({state,reason,servingAccountErased:false,allCopiesErased:false,providerMessages:'unqualified',recoveryCopies:'operator-held',staffAccess,staffAccessDetails:details});
type CentralRoleAdapter={settleAccountErasureMemberRole:(env:Env,proof:AccountErasureProof)=>Promise<MemberRoleSettlement>;accountErasureRoleSettledSql:string;reconcileAccountErasureRoleDebt:(env:Env,proof:AccountErasureProof)=>Promise<unknown>};
/** There is exactly one role writer. Its adapter supplies a fixed authored SQL receipt predicate, never request SQL. */
export async function continueServingErasure(env:Env,proof:AccountErasureProof,attempt?:OriginalErasureAttempt):Promise<ServingCompletion>{
 proof=captureAccountErasureProof(proof).proof;
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return held('feature_disabled');
 const discipline=erasureAttemptDiscipline(env);if(discipline===null)return held('erasure_attempt_discipline_invalid');
 const fence=erasureAttemptFenceMode(env);if(fence===null)return held('erasure_attempt_fence_invalid');
 if(fence){if(!attempt)return held('erasure_attempt_identity_required');enterOriginalErasureAttempt(attempt,env,proof);}else if(attempt)return held('erasure_attempt_identity_unexpected');
 // The original six-field job proof was captured before the feature check and first await.
 // Retain its original birth/absence purpose through the ED01 Native current/clear ACK.
 if(!await currentAccountErasureProof(env,proof))return held('request_not_current');
 // .164: a self-authorized Native request has its own bounded role cleanup and fresh
 // consuming absence receipt. Historical unknown effects are retained, not rewritten
 // into successful original acknowledgements or used to stop unrelated public traffic.
 if(nativeErasureMode(env)){
  const references=await cleanupNativePersonalReferences(env,proof);
  if(references.state!=='cleaned')return held('native_reference_cleanup_unconfirmed','unknown');
  const cleanup=await cleanupNativeErasureRoles(env,proof);
  // Provider dispatch and the complete terminal data batch use separate bounded slices.
  // A later automatic continuation reconfirms absence before consuming its fresh receipt.
  if(cleanup.removed>0)return held('native_role_cleanup_progress','held',cleanup.staffAccess);
  if(cleanup.state!=='complete'||!cleanup.receipt||cleanup.checkedAt===null)return held(cleanup.reason,cleanup.state==='unknown'?'unknown':'held');
  const receiptSql=nativeErasureRolesSettledSql(env,proof,cleanup.receipt);
  const current=await env.DB.prepare(`SELECT CASE WHEN ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)}) AND (${receiptSql}) AND NOT(${ambiguousAccountReferencesSql(discipline)}) THEN 1 ELSE 0 END AS current`)
   .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest).first<{current:number}>();
  if(current?.current!==1)return held('native_current_or_reference_unconfirmed');
  await cleanupPrivacyMessages(env,proof.subject);
  return completeServingAccount(env,proof,{state:'absent',checkedAt:cleanup.checkedAt,staffAccess:cleanup.staffAccess},receiptSql,discipline,undefined,true);
 }
 const central=await import('./roles') as unknown as Partial<CentralRoleAdapter>;
 if(typeof central.settleAccountErasureMemberRole!=='function'||typeof central.accountErasureRoleSettledSql!=='string')return held('central_role_adapter_unavailable');
 const outcome=await central.settleAccountErasureMemberRole(env,proof);
 if(!['absent','removed'].includes(outcome.state))return held(outcome.state==='unknown'?'member_role_outcome_unknown':'member_role_held',outcome.state==='unknown'?'unknown':'held',outcome.staffAccess);
 if(!Number.isSafeInteger(outcome.checkedAt)||outcome.checkedAt===null)return held('member_role_receipt_invalid');
 if(typeof central.reconcileAccountErasureRoleDebt!=='function')return held('central_role_debt_adapter_unavailable');
 await central.reconcileAccountErasureRoleDebt(env,proof);
 // One bounded debt reconciliation does not resolve a second unknown provider effect.
 // Reuse both consuming predicates in this existing original Native read; a negative result grants no completion authority.
 const custody=await env.DB.prepare(`SELECT ((${CURRENT_ERASURE_SQL}) AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(proof)})) AS current,CASE WHEN ${qrErasureCustodyClearSql('?2')} THEN 1 ELSE 0 END AS custody_clear,CASE WHEN NOT(${ambiguousAccountReferencesSql(discipline)}) THEN 1 ELSE 0 END AS references_clear`)
 .bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest).first<{current:number;custody_clear:number;references_clear:number}>();
 // Snapshot the original Native ACK immediately; never adopt a mutable bit after another await.
 const custodyRow:unknown=custody;
 if(!custodyRow||typeof custodyRow!=='object'||Array.isArray(custodyRow))return held('current_role_custody_ack_invalid','unknown',outcome.staffAccess);
 const custodyKeys=['current','custody_clear','references_clear'] as const,custodyPrototype=Object.getPrototypeOf(custodyRow);
 const custodyNames=Reflect.ownKeys(custodyRow);
 const custodyDescriptors=custodyKeys.map(key=>Object.getOwnPropertyDescriptor(custodyRow,key));
 if(custodyNames.length!==3||!custodyKeys.every(key=>custodyNames.includes(key))||custodyDescriptors.some(d=>!d||!Object.hasOwn(d,'value')||(d.value!==0&&d.value!==1)))return held('current_role_custody_ack_invalid','unknown',outcome.staffAccess);
 const [originalCurrent,originalClear,originalReferencesClear]=custodyDescriptors.map(d=>d!.value as number);
 const originalDescriptors=custodyDescriptors.map(d=>Object.freeze({...d!}));
 const custodyAckUnchanged=()=>{
  if(custody!==custodyRow||Object.getPrototypeOf(custodyRow)!==custodyPrototype)return false;
  const names=Reflect.ownKeys(custodyRow);if(names.length!==3||!custodyKeys.every(key=>names.includes(key)))return false;
  return custodyKeys.every((key,index)=>{const actual=Object.getOwnPropertyDescriptor(custodyRow,key),original=originalDescriptors[index]!;return !!actual&&Object.hasOwn(actual,'value')&&actual.value===original.value&&actual.writable===original.writable&&actual.enumerable===original.enumerable&&actual.configurable===original.configurable&&actual.get===original.get&&actual.set===original.set;});
 };
 if(originalCurrent!==1||!custodyAckUnchanged())return held('request_not_current');
 if(!await currentAccountErasureProof(env,proof))return held('request_not_current');
 if(!custodyAckUnchanged())return held('current_role_custody_ack_changed','unknown',outcome.staffAccess);
 if(originalClear!==1)return held('current_role_custody_unknown','held',outcome.staffAccess);
 // Known local-read refusal leaves the original proof/job and any historical unknown custody untouched.
 if(originalReferencesClear!==1)return held('ambiguous_personal_reference','held',outcome.staffAccess);
 await cleanupPrivacyMessages(env,proof.subject);
 return completeServingAccount(env,proof,outcome,central.accountErasureRoleSettledSql,discipline,attempt);
}

/** Trusted central adapter only. No HTTP caller chooses role outcome or the consuming receipt SQL. */
async function completeServingAccount(env:Env,p:AccountErasureProof,role:MemberRoleSettlement,roleSettledSql:string,discipline=false,attempt?:OriginalErasureAttempt,native=false):Promise<ServingCompletion>{
 p=captureAccountErasureProof(p).proof;
 const facts=await servingPrivacyCatalogAndStaffCustody(env,p.subject);
 if(!facts.catalogCurrent)return held('unclassified_storage', 'held',role.staffAccess);
 const staffCustody=facts.staffCustody;
 const details={...staffAccessDetails(role.staffAccess,staffCustody),...(native?{automaticGuildRoleRemoval:true}:{})};
 if(!staffCustody)return held('staff_custody_unqualified','held',role.staffAccess,details);
 if(staffCustody.unresolvedBotCustody>0&&!native)return held('bot_staff_custody_unresolved','held',role.staffAccess,details);
 const markerKey=await privacySubjectKey(env,p.subject);
 const v=[p.operationId,p.subject,p.subjectGeneration,p.requestDigest];
 const identity='?1';
 const unqualified=ambiguousAccountReferencesSql(discipline);
 const before=env.DB.prepare(`SELECT CASE WHEN ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(p)}) AND (${roleSettledSql})
 AND EXISTS(SELECT 1 FROM role_settlements r WHERE r.id=${native?"?1||':native_role_inventory'":"?1"} AND r.guild_id=?6 AND r.role_id=?7 AND r.desired=0)
 AND ?5 BETWEEN ${PRIVACY_DB_NOW}-60 AND ${PRIVACY_DB_NOW}+5 AND NOT(${unqualified})
 THEN 1 ELSE json_extract('privacy_completion_refused','$') END AS admitted`).bind(...v,role.checkedAt,env.GUILD_ID,env.ROLE_GUILD_MEMBER);
 const target='?1';
 const rejectionMarker=await rejectionErasureMarkerStatements(env,p,markerKey);
 const configured=globalServingMode(env)==='configured',originalJob=configured?await captureOriginalAccountErasureJobRead(env,p,attempt):null;if(originalJob&&originalErasureJobReadFacts(originalJob).companion.markerKey!==markerKey)throw Error('privacy_original_marker_key_changed');
 const statements:D1PreparedStatement[]=[before,...(originalJob?[originalAccountErasureCompanionGuardStatement(env,originalJob)]:[]),
 env.DB.prepare("UPDATE privacy_serving_jobs SET state='erasing',role_checked_at=?2,staff_access=?3,hold_reason=NULL WHERE operation_id=?1 AND state IN('waiting_role','held')").bind(p.operationId,role.checkedAt,role.staffAccess),
 ...fixedAccountCleanupStatements(env,p,markerKey,rejectionMarker),
 // Replay identity has a fixed 366-day purpose window; private recovery copies have their own operator custody.
 env.DB.prepare(`INSERT INTO privacy_restore_replay(operation_id,subject_id,retired_generation,erased_at,retain_until,scope)
 SELECT ?1,?2,?3,${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}+${PRIVACY_REPLAY},'serving_account'
 WHERE EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE operation_id=?1 AND state='erasing')`).bind(p.operationId,p.subject,p.subjectGeneration),
 env.DB.prepare(`UPDATE privacy_subjects SET state='retired',revision=revision+1,erased_at=${PRIVACY_DB_NOW},updated_at=${PRIVACY_DB_NOW},retain_until=${PRIVACY_DB_NOW}+${PRIVACY_REPLAY}
 WHERE subject_id=?1 AND generation=?2 AND state='retiring'`).bind(p.subject,p.subjectGeneration),
 env.DB.prepare(`UPDATE privacy_serving_jobs SET state='complete',completed_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND state='erasing'`).bind(p.operationId),
 env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM privacy_restore_replay WHERE operation_id=?1 AND subject_id=?2 AND retired_generation=?3)
 AND EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?2 AND generation=?3 AND state='retired')
 AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2) AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?2)
 THEN 1 ELSE json_extract('privacy_terminal_unconfirmed','$') END AS recorded,(SELECT completed_at FROM privacy_serving_jobs j WHERE operation_id=?1 AND subject_id=?2 AND subject_generation=?3 AND state='complete' AND ${originalErasureJobBirthSql(p)}) AS erasedAt`).bind(p.operationId,p.subject,p.subjectGeneration),
 ];
 retainOriginalTerminalProducer(env,p,statements,attempt);
 try {
 const out=configured?await (async()=>{const job=originalJob;if(!job)throw Error('privacy_original_companion_unowned');const group=captureAccountErasureTerminalGroup(env,job,statements);return dispatchOriginalAccountErasureTerminalBatch(env,job,group,statements);})():await env.DB.batch<{admitted?:number;recorded?:number}>(statements);
 const originalAdmissionRow=out[0]?.results[0],originalTerminalRow=out.at(-1)?.results[0];
 const admitted=originalAdmissionRow!==null&&typeof originalAdmissionRow==='object'?Object.getOwnPropertyDescriptor(originalAdmissionRow,'admitted'):undefined,recorded=originalTerminalRow!==null&&typeof originalTerminalRow==='object'?Object.getOwnPropertyDescriptor(originalTerminalRow,'recorded'):undefined;
 if(out.length!==statements.length||!admitted||!Object.hasOwn(admitted,'value')||admitted.value!==1||!recorded||!Object.hasOwn(recorded,'value')||recorded.value!==1)throw Error('privacy_completion_unknown');
 }catch{
 if(configured)return held('independent_suppression_outcome_unknown','unknown',role.staffAccess,details);
 // A lost result is not a rollback assertion. Completion is claimed only if the durable terminal AND replay are found.
 const observed=await env.DB.prepare("SELECT 1 AS confirmed FROM privacy_serving_jobs j JOIN privacy_restore_replay r ON r.operation_id=j.operation_id WHERE j.operation_id=?1 AND j.state='complete' AND r.subject_id=?2 AND r.retired_generation=?3")
 .bind(p.operationId,p.subject,p.subjectGeneration).first<{confirmed:number}>().catch(()=>null);
 if(observed?.confirmed!==1)return held('local_commit_outcome_unknown','unknown',role.staffAccess,details);
 }
 // continueServingErasure already attempted one bounded pointer page before completion.
 // Remaining known/unknown purpose custody survives and the completed-account cron lane
 // resumes it; do not spend a second provider page in this same local completion slice.
 return {state:'complete',reason:null,servingAccountErased:true,allCopiesErased:false,providerMessages:'unqualified',recoveryCopies:'operator-held',staffAccess:role.staffAccess,staffAccessDetails:details,messageDebt:await privacyMessageDebt(env,p.subject)};
}

function characterReferenceScrub(env:Env,id:string):D1PreparedStatement{
 const match=characterReferenceMatchSql('?1');
 return env.DB.prepare(`UPDATE site_applications AS a SET answers=(WITH RECURSIVE matches(idx,ordinal) AS(
 SELECT CAST(e.key AS INTEGER),ROW_NUMBER() OVER(ORDER BY CAST(e.key AS INTEGER) DESC) FROM json_each(a.answers,'$.references')e WHERE ${match}),
 scrubbed(ordinal,text) AS(SELECT 0,a.answers UNION ALL SELECT s.ordinal+1,json_remove(s.text,'$.references['||m.idx||']') FROM scrubbed s JOIN matches m ON m.ordinal=s.ordinal+1)
 SELECT text FROM scrubbed ORDER BY ordinal DESC LIMIT 1) WHERE a.discord_id<>?1 AND CASE WHEN NOT json_valid(a.answers) THEN 0
 WHEN json_type(a.answers)<>'object' THEN 0 WHEN COALESCE(json_type(a.answers,'$.references'),'')<>'array' THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='references')<>1 THEN 0 ELSE EXISTS(SELECT 1 FROM json_each(a.answers,'$.references')e WHERE ${match}) END`).bind(id);
}

/** Same source cleanup bodies for serving completion and independently authorized CLOSED recovery. */
function fixedAccountCleanupStatements(env:Env,p:Readonly<{subject:string;subjectGeneration:string}>,markerKey:string|null,rejectionMarker:readonly D1PreparedStatement[]):D1PreparedStatement[]{
 const target='?1';
 const groupedShape=(a:string)=>`CASE WHEN NOT json_valid(${a}.details) THEN 0
 WHEN json_type(${a}.details)<>'object' THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(${a}.details) WHERE key='names')<>1 THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(${a}.details))<>(SELECT COUNT(DISTINCT key) FROM json_each(${a}.details)) THEN 0
 WHEN COALESCE(json_type(${a}.details,'$.names'),'')<>'array' THEN 0
 ELSE NOT EXISTS(SELECT 1 FROM json_each(${a}.details,'$.names') WHERE type<>'text') END`;
 return [
 env.DB.prepare(`UPDATE privacy_provider_messages SET cleanup_requested=1 WHERE state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)`).bind(p.subject),
 // Before creator anonymization, adopt only this creator's bounded bot publication custody.
 // Unknown dispatches retain a no-repeat record; known pointers remain eligible for automatic DELETE.
 env.DB.prepare(`INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)
 SELECT 'event_publication:'||d.event_id||':'||d.op_id||':'||d.claim_nonce,'event_publication',json_array(json_object('id',?1,'g',?2)),d.channel_id,d.message_id,
 CASE WHEN d.message_id IS NOT NULL THEN 'known' ELSE 'unknown' END,1,d.retain_until-${PRIVACY_REPLAY},${PRIVACY_DB_NOW},d.retain_until
 FROM community_event_deliveries d JOIN community_events e ON e.id=d.event_id WHERE e.created_by=?1 AND d.claim_nonce IS NOT NULL AND d.state NOT IN('removed','refused') AND d.retain_until>${PRIVACY_DB_NOW}
 ON CONFLICT(operation_id)DO NOTHING`).bind(p.subject,p.subjectGeneration),
 ...(!communityDataNames().includes('event_reminders')?[]:[env.DB.prepare(`INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)
 SELECT 'event_reminder:'||d.event_id||':'||d.op_id||':'||d.claim_nonce,'event_reminder',json_array(json_object('id',?1,'g',?2)),d.channel_id,d.message_id,
 CASE WHEN d.message_id IS NOT NULL THEN 'known' ELSE 'unknown' END,1,d.retain_until-${PRIVACY_REPLAY},${PRIVACY_DB_NOW},d.retain_until
 FROM community_event_reminders d LEFT JOIN community_events e ON e.id=d.event_id
 WHERE (d.actor=?1 OR e.created_by=?1) AND d.claim_nonce IS NOT NULL AND d.state IN('claimed','unknown','posted','cleaning') AND d.retain_until>${PRIVACY_DB_NOW}
 ON CONFLICT(operation_id)DO NOTHING`).bind(p.subject,p.subjectGeneration)]),
 ...rejectionMarker,
 // Snapshot proof is distrusted before rows disappear, so a partial historical roster cannot grant anything.
 env.DB.prepare(`UPDATE roster_snapshots SET trusted=0 WHERE id IN(SELECT snapshot_id FROM roster_members WHERE
 name_key IN(SELECT name_key FROM characters WHERE discord_id=?1) OR instr(COALESCE(public_note,''),?1)>0 OR instr(COALESCE(officer_note,''),?1)>0)`).bind(p.subject),
 env.DB.prepare(`DELETE FROM roster_members WHERE name_key IN(SELECT name_key FROM characters WHERE discord_id=?1)
 OR instr(COALESCE(public_note,''),?1)>0 OR instr(COALESCE(officer_note,''),?1)>0`).bind(p.subject),
 env.DB.prepare('DELETE FROM roster_first_seen WHERE name_key IN(SELECT name_key FROM characters WHERE discord_id=?1)').bind(p.subject),
 env.DB.prepare('DELETE FROM relays WHERE officer_id IN(SELECT name_key FROM characters WHERE discord_id=?1) OR character IN(SELECT name FROM characters WHERE discord_id=?1)').bind(p.subject),
 env.DB.prepare(`UPDATE roster_effect_runs SET items=(SELECT COUNT(*) FROM roster_effects e WHERE e.run_id=roster_effect_runs.id AND e.discord_id<>?1)
 WHERE instr(CAST(items AS TEXT),?1)>0 OR EXISTS(SELECT 1 FROM roster_effects e WHERE e.run_id=roster_effect_runs.id AND e.discord_id=?1)`).bind(p.subject),
 env.DB.prepare('DELETE FROM roster_effects WHERE discord_id=?1').bind(p.subject),
 // Typed-name references are attributable only while the link still proves this character belongs to the retiring account.
 env.DB.prepare("DELETE FROM site_votes WHERE nominee_kind='name' AND nominee_key IN(SELECT name_key FROM characters WHERE discord_id=?1)").bind(p.subject),
 env.DB.prepare("DELETE FROM site_friends WHERE friend_kind='name' AND friend_key IN(SELECT name_key FROM characters WHERE discord_id=?1)").bind(p.subject),
 characterReferenceScrub(env,p.subject),
 env.DB.prepare(`UPDATE community_privacy_cases SET subject_hint=CASE WHEN subject_hint=?1 THEN NULL ELSE subject_hint END,
 character_hint=CASE WHEN character_hint IN(SELECT name FROM characters WHERE discord_id=?1) OR character_hint IN(SELECT name_key FROM characters WHERE discord_id=?1) THEN NULL ELSE character_hint END
 WHERE subject_hint=?1 OR character_hint IN(SELECT name FROM characters WHERE discord_id=?1) OR character_hint IN(SELECT name_key FROM characters WHERE discord_id=?1)`).bind(p.subject),
 ...mentionDeletes(env,p.subject), ...communityEraseStatements(env,p.subject),
 // Structured cleanup can leave malformed arrays, duplicate keys or free text. Never silently
 // erase another owner's text, or commit our terminal receipt while this attributable ID remains.
 env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM site_applications
 WHERE discord_id<>?1 AND instr(answers,?1)>0) THEN 1
 ELSE json_extract('privacy_ambiguous_reference_held','$') END AS admitted`).bind(p.subject),
 // Resolve recorded character-only operational subjects while their live ownership interval still exists.
 // Earlier owners' history and arbitrary free text are not inferred from a matching name.
 env.DB.prepare(`UPDATE audit SET details=json_set(details,'$.names',json((SELECT json_group_array(n.value)
 FROM json_each(audit.details,'$.names') n WHERE NOT EXISTS(SELECT 1 FROM characters c
 WHERE c.discord_id=?1 AND audit.ts>=c.bound_at AND
 (n.value=c.name COLLATE NOCASE OR n.value=c.name_key COLLATE NOCASE)))))
 WHERE actor='system' AND action='roster.identity_held' AND subject IS NULL AND (${groupedShape('audit')})
 AND CASE WHEN ${groupedShape('audit')} THEN EXISTS(SELECT 1 FROM json_each(audit.details,'$.names') n
 JOIN characters c ON c.discord_id=?1 AND audit.ts>=c.bound_at
 WHERE n.value=c.name COLLATE NOCASE OR n.value=c.name_key COLLATE NOCASE) ELSE 0 END`).bind(p.subject),
 env.DB.prepare(`DELETE FROM audit WHERE actor=?1 OR subject=?1 OR instr(COALESCE(details,''),?1)>0
 OR EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=?1 AND audit.ts>=c.bound_at AND
 (audit.subject=c.name COLLATE NOCASE OR audit.subject=c.name_key COLLATE NOCASE) AND
 ((audit.actor='watcher' AND audit.action IN('note.set','note.failed','invite.failed','invite.fired','invite.joined','verify.roster_not_current','verify.guid_pinned','roster.remove_failed','roster.removed_unlinked'))
 OR (audit.actor='system' AND audit.action IN('invite.declined','invite.expired','role.remove_held','role.remove_failed','nick.failed'))))`).bind(p.subject),
 ...['pending','invite_queue','bnet_characters','rename_holds','characters'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE discord_id=${target}`).bind(p.subject)),
 env.DB.prepare('DELETE FROM site_board_votes WHERE voter_id=?1 OR candidate_id=?1').bind(p.subject),
 env.DB.prepare('DELETE FROM site_votes WHERE voter_id=?1').bind(p.subject),
 env.DB.prepare('DELETE FROM site_friends WHERE owner_id=?1').bind(p.subject),
 env.DB.prepare('DELETE FROM site_reserved WHERE owner_id=?1').bind(p.subject),
 env.DB.prepare('UPDATE site_reserved SET approved_by=CASE WHEN approved_by=?1 THEN NULL ELSE approved_by END,released_by=CASE WHEN released_by=?1 THEN NULL ELSE released_by END WHERE ?1 IN(approved_by,released_by)').bind(p.subject),
 env.DB.prepare('UPDATE site_applications SET reviewed_by=NULL WHERE reviewed_by=?1').bind(p.subject),
 env.DB.prepare('UPDATE site_users SET denied_by=NULL WHERE denied_by=?1').bind(p.subject),
 env.DB.prepare('UPDATE site_settings SET updated_by=NULL WHERE updated_by=?1').bind(p.subject),
 env.DB.prepare("UPDATE rename_holds SET decided_by=CASE WHEN decided_by=?1 THEN 'erased' ELSE decided_by END,closed_by=CASE WHEN closed_by=?1 THEN NULL ELSE closed_by END WHERE decided_by=?1 OR closed_by=?1").bind(p.subject),
 env.DB.prepare('UPDATE invite_queue SET approved_by=CASE WHEN approved_by=?1 THEN NULL ELSE approved_by END,claimed_by=CASE WHEN claimed_by=?1 THEN NULL ELSE claimed_by END WHERE ?1 IN(approved_by,claimed_by)').bind(p.subject),
 env.DB.prepare('DELETE FROM site_applications WHERE discord_id=?1').bind(p.subject),
 env.DB.prepare('DELETE FROM site_users WHERE discord_id=?1').bind(p.subject),
 ...(markerKey===null?[]:[env.DB.prepare('DELETE FROM privacy_rejection_decisions WHERE subject_key=?1').bind(markerKey)]),
 env.DB.prepare("UPDATE members SET discord_name=NULL,battletag=NULL,bnet_conn_id=NULL,linked_at=NULL,bnet_account_id=NULL,bnet_linked_at=NULL,username=NULL,global_name=NULL,names_at=NULL WHERE discord_id=?1 AND banned=1").bind(p.subject),
 env.DB.prepare('DELETE FROM members WHERE discord_id=?1 AND banned=0').bind(p.subject),
 // Independent case credentials are not ownership proof. Do not erase another person's case from a hint.
 // The active ban/case exception and provider-message custody are disclosed separately from serving-account completion.
 env.DB.prepare("DELETE FROM seen_interactions WHERE instr(COALESCE(response,''),?1)>0").bind(p.subject),
 ];
}

/** The collector has no Native execute/read methods and accepts no caller adapter. Its only inputs are
 * the exact original Native+independent selection issued by the private recovery source. */
export function originalClosedRecoveryCleanupPlans(env:Env,selection:OriginalClosedRecoveryReplaySelection):readonly OriginalClosedCleanupStep[]{
 const facts=originalClosedRecoveryCleanupAccount(selection,env);facts.check();const namespaces=communityDataNames().slice().sort();if(namespaces.length!==13||JSON.stringify(namespaces)!=="[\"contributions\",\"councillor_verification\",\"departures\",\"directory\",\"event_delivery\",\"event_reminders\",\"events\",\"news\",\"privacy_access\",\"refs\",\"restrictions\",\"ruleset_publication\",\"trials\"]")throw Error('closed_recovery_cleanup_namespace_incomplete');const registered=new WeakMap<object,OriginalClosedCleanupStep>();
 const prepare=(sql:string):D1PreparedStatement=>{if(typeof sql!=='string'||sql.length>100000)throw Error('closed_recovery_source_statement');
  const bound=(values:readonly unknown[]):D1PreparedStatement=>{if(values.length>100||values.some(v=>typeof v!=='string'&&(typeof v!=='number'||!Number.isFinite(v))))throw Error('closed_recovery_source_binds');
   const step=Object.freeze({sql,values:Object.freeze(values.slice() as (string|number)[])}),handle=Object.freeze({bind:(...input:unknown[])=>bound(input)});registered.set(handle,step);return handle as unknown as D1PreparedStatement;};return bound([]);};
 const descriptors:PropertyDescriptorMap=Object.getOwnPropertyDescriptors(env);descriptors.DB={value:Object.freeze({prepare}),writable:false,enumerable:true,configurable:false};const collectorEnv=Object.freeze(Object.create(Object.getPrototypeOf(env),descriptors)) as Env;
 const p=Object.freeze({subject:facts.subject,subjectGeneration:facts.generation}),markerKey=facts.markerKey;
 if(facts.markerState==='active'&&markerKey===null)throw Error('closed_recovery_original_marker_key_required');
 const marker= facts.markerState==='active'?[prepare(`SELECT CASE WHEN ?2=?1+31536000 AND ?1>0 AND ?1<=${PRIVACY_DB_NOW} AND ?2>${PRIVACY_DB_NOW} AND NOT EXISTS(SELECT 1 FROM privacy_denial_markers WHERE subject_key=?3 AND(denied_at<>?1 OR retain_until<>?2 OR reason<>'rejected_guild_application_or_membership')) THEN 1 ELSE json_extract('closed_recovery_original_marker_held','$') END AS admitted`).bind(facts.originalRejectedAt!,facts.markerRetainUntil!,markerKey),prepare("INSERT INTO privacy_denial_markers(subject_key,denied_at,retain_until,reason)VALUES(?1,?2,?3,'rejected_guild_application_or_membership') ON CONFLICT(subject_key)DO NOTHING").bind(markerKey,facts.originalRejectedAt!,facts.markerRetainUntil!)]:[prepare(`DELETE FROM privacy_denial_markers WHERE subject_key IN(SELECT subject_key FROM privacy_denial_markers WHERE retain_until<=${PRIVACY_DB_NOW} ORDER BY retain_until,subject_key LIMIT 1000)`)];
 const groupedShape=(a:string)=>`CASE WHEN NOT json_valid(${a}.details) THEN 0
 WHEN json_type(${a}.details)<>'object' THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(${a}.details) WHERE key='names')<>1 THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(${a}.details))<>(SELECT COUNT(DISTINCT key) FROM json_each(${a}.details)) THEN 0
 WHEN COALESCE(json_type(${a}.details,'$.names'),'')<>'array' THEN 0
 ELSE NOT EXISTS(SELECT 1 FROM json_each(${a}.details,'$.names') WHERE type<>'text') END`;
 const unqualified=`EXISTS(SELECT 1 FROM site_settings WHERE instr(value,?1)>0)
 OR EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id<>?1 AND instr(a.answers,?1)>0 AND
 (NOT json_valid(a.answers) OR CASE WHEN json_valid(a.answers) THEN json_type(a.answers)<>'object' OR
 (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='references')<>1 OR
 COALESCE(json_type(a.answers,'$.references'),'')<>'array' ELSE 1 END))
 OR EXISTS(SELECT 1 FROM audit a JOIN characters c ON c.discord_id=?1 AND a.ts>=c.bound_at
 WHERE a.actor='system' AND a.action='roster.identity_held' AND a.subject IS NULL
 AND NOT (${groupedShape('a')}) AND CASE WHEN json_valid(a.details) THEN
 EXISTS(SELECT 1 FROM json_tree(a.details) j WHERE j.type='text' AND
 (j.value=c.name COLLATE NOCASE OR j.value=c.name_key COLLATE NOCASE))
 ELSE instr(lower(COALESCE(a.details,'')),lower(c.name))>0 OR instr(lower(COALESCE(a.details,'')),lower(c.name_key))>0 END)`;
 const pre=prepare(`SELECT CASE WHEN NOT(${unqualified}) THEN 1 ELSE json_extract('closed_recovery_ambiguous_reference_held','$') END AS admitted`).bind(p.subject);
 const statements=[pre,...fixedAccountCleanupStatements(collectorEnv,p,markerKey,marker)],plans=statements.map(statement=>{const plan=registered.get(statement);if(!plan)throw Error('closed_recovery_unregistered_source_body');return plan;});facts.check();return Object.freeze(plans);
}
