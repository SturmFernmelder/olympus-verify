import './privacy-access-data';
/** Serving-account completion; independent provider messages/recovery copies retain truthful custody.
 * Dormant .129 completion and restore authority are not enabled by this module.
 */
import type { Env } from './env';
import './community-routes';
import './qr-phase1-data';
import { communityDataNames,communityEraseStatements } from './community-context';
import { mentionDeletes } from './site-admin';
import { servingPrivacyCatalogCurrent } from './privacy-business-catalog';
import { cleanupPrivacyMessages,privacyMessageDebt } from './privacy-provider-messages';
import { CURRENT_ERASURE_SQL, PRIVACY_DB_NOW, PRIVACY_REPLAY, PRIVACY_YEAR, currentAccountErasureProof,
 privacySubjectKey, type AccountErasureProof, type MemberRoleSettlement } from './privacy-serving-authority';

export type ServingCompletion={state:'held'|'unknown'|'complete';reason:string|null;servingAccountErased:boolean;allCopiesErased:false;providerMessages:'unqualified';recoveryCopies:'operator-held';staffAccess:MemberRoleSettlement['staffAccess'];messageDebt?:{known:number;unknown:number}};
const held=(reason:string,state:'held'|'unknown'='held',staffAccess:MemberRoleSettlement['staffAccess']='unknown'):ServingCompletion=>({state,reason,servingAccountErased:false,allCopiesErased:false,providerMessages:'unqualified',recoveryCopies:'operator-held',staffAccess});
type CentralRoleAdapter={settleAccountErasureMemberRole:(env:Env,proof:AccountErasureProof)=>Promise<MemberRoleSettlement>;accountErasureRoleSettledSql:string;reconcileAccountErasureRoleDebt:(env:Env,proof:AccountErasureProof)=>Promise<unknown>};
/** There is exactly one role writer. Its adapter supplies a fixed authored SQL receipt predicate, never request SQL. */
export async function continueServingErasure(env:Env,proof:AccountErasureProof):Promise<ServingCompletion>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return held('feature_disabled');
 if(!await currentAccountErasureProof(env,proof))return held('request_not_current');
 const central=await import('./roles') as unknown as Partial<CentralRoleAdapter>;
 if(typeof central.settleAccountErasureMemberRole!=='function'||typeof central.accountErasureRoleSettledSql!=='string')return held('central_role_adapter_unavailable');
 const outcome=await central.settleAccountErasureMemberRole(env,proof);
 if(!['absent','removed'].includes(outcome.state))return held(outcome.state==='unknown'?'member_role_outcome_unknown':'member_role_held',outcome.state==='unknown'?'unknown':'held',outcome.staffAccess);
 if(!Number.isSafeInteger(outcome.checkedAt)||outcome.checkedAt===null)return held('member_role_receipt_invalid');
 if(typeof central.reconcileAccountErasureRoleDebt!=='function')return held('central_role_debt_adapter_unavailable');
 await central.reconcileAccountErasureRoleDebt(env,proof);
 if(!await currentAccountErasureProof(env,proof))return held('request_not_current');
 await cleanupPrivacyMessages(env,proof.subject);
 return completeServingAccount(env,proof,outcome,central.accountErasureRoleSettledSql);
}

/** Trusted central adapter only. No HTTP caller chooses role outcome or the consuming receipt SQL. */
async function completeServingAccount(env:Env,p:AccountErasureProof,role:MemberRoleSettlement,roleSettledSql:string):Promise<ServingCompletion>{
 if(!await servingPrivacyCatalogCurrent(env))return held('unclassified_storage', 'held',role.staffAccess);
 const markerKey=await privacySubjectKey(env,p.subject);
 const v=[p.operationId,p.subject,p.subjectGeneration,p.requestDigest];
 const identity='?1';
 // Ambiguous/manual references in another owner's record cannot be guessed away. The structured
 // application scrub runs below, but any still-ambiguous raw document closes this batch.
 const unqualified=`EXISTS(SELECT 1 FROM site_settings WHERE instr(value,?2)>0)
 OR EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id<>?2 AND instr(a.answers,?2)>0 AND
 (NOT json_valid(a.answers) OR CASE WHEN json_valid(a.answers) THEN json_type(a.answers)<>'object' OR
 (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='references')<>1 OR
 COALESCE(json_type(a.answers,'$.references'),'')<>'array' ELSE 1 END))`;
 const before=env.DB.prepare(`SELECT CASE WHEN ${CURRENT_ERASURE_SQL} AND (${roleSettledSql})
 AND EXISTS(SELECT 1 FROM role_settlements r WHERE r.id=?1 AND r.guild_id=?6 AND r.role_id=?7 AND r.desired=0)
 AND ?5 BETWEEN ${PRIVACY_DB_NOW}-60 AND ${PRIVACY_DB_NOW}+5 AND NOT(${unqualified})
 THEN 1 ELSE json_extract('privacy_completion_refused','$') END AS admitted`).bind(...v,role.checkedAt,env.GUILD_ID,env.ROLE_GUILD_MEMBER);
 const target='?1';
 const statements:D1PreparedStatement[]=[before,
 env.DB.prepare("UPDATE privacy_serving_jobs SET state='erasing',role_checked_at=?2,staff_access=?3,hold_reason=NULL WHERE operation_id=?1 AND state IN('waiting_role','held')").bind(p.operationId,role.checkedAt,role.staffAccess),
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
 // The marker uses the original denial time. It is neither a ban record nor a refreshed clock.
 env.DB.prepare(`INSERT INTO privacy_denial_markers(subject_key,denied_at,retain_until,reason)
 SELECT ?2,COALESCE(denied_at,first_login),COALESCE(denied_at,first_login)+${PRIVACY_YEAR},'rejected_guild_application_or_membership'
 FROM site_users WHERE discord_id=?1 AND denied=1 AND COALESCE(denied_at,first_login)+${PRIVACY_YEAR}>${PRIVACY_DB_NOW}
 ON CONFLICT(subject_key) DO UPDATE SET denied_at=CASE WHEN retain_until<=${PRIVACY_DB_NOW} THEN excluded.denied_at ELSE MIN(denied_at,excluded.denied_at) END,
 retain_until=CASE WHEN retain_until<=${PRIVACY_DB_NOW} THEN excluded.retain_until ELSE MIN(retain_until,excluded.retain_until) END`).bind(p.subject,markerKey),
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
 env.DB.prepare("UPDATE members SET discord_name=NULL,battletag=NULL,bnet_conn_id=NULL,linked_at=NULL,bnet_account_id=NULL,bnet_linked_at=NULL,username=NULL,global_name=NULL,names_at=NULL WHERE discord_id=?1 AND banned=1").bind(p.subject),
 env.DB.prepare('DELETE FROM members WHERE discord_id=?1 AND banned=0').bind(p.subject),
 // Independent case credentials are not ownership proof. Do not erase another person's case from a hint.
 // The active ban/case exception and provider-message custody are disclosed separately from serving-account completion.
 env.DB.prepare("DELETE FROM audit WHERE actor=?1 OR subject=?1 OR instr(COALESCE(details,''),?1)>0").bind(p.subject),
 env.DB.prepare("DELETE FROM seen_interactions WHERE instr(COALESCE(response,''),?1)>0").bind(p.subject),
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
 THEN 1 ELSE json_extract('privacy_terminal_unconfirmed','$') END AS recorded`).bind(p.operationId,p.subject,p.subjectGeneration),
 ];
 try {
 const out=await env.DB.batch<{admitted?:number;recorded?:number}>(statements);
 if(out.length!==statements.length||out[0]?.results[0]?.admitted!==1||out.at(-1)?.results[0]?.recorded!==1)throw Error('privacy_completion_unknown');
 }catch{
 // A lost result is not a rollback assertion. Completion is claimed only if the durable terminal AND replay are found.
 const observed=await env.DB.prepare("SELECT 1 AS confirmed FROM privacy_serving_jobs j JOIN privacy_restore_replay r ON r.operation_id=j.operation_id WHERE j.operation_id=?1 AND j.state='complete' AND r.subject_id=?2 AND r.retired_generation=?3")
 .bind(p.operationId,p.subject,p.subjectGeneration).first<{confirmed:number}>().catch(()=>null);
 if(observed?.confirmed!==1)return held('local_commit_outcome_unknown','unknown',role.staffAccess);
 }
 await cleanupPrivacyMessages(env,p.subject).catch(()=>{});
 return {state:'complete',reason:null,servingAccountErased:true,allCopiesErased:false,providerMessages:'unqualified',recoveryCopies:'operator-held',staffAccess:role.staffAccess,messageDebt:await privacyMessageDebt(env,p.subject)};
}

function characterReferenceScrub(env:Env,id:string):D1PreparedStatement{
 const match=`CASE WHEN e.type='object' THEN (SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='kind')=1
 AND (SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='key')=1 AND json_extract(e.value,'$.kind')='name'
 AND json_type(e.value,'$.key')='text' AND json_extract(e.value,'$.key') IN(SELECT name_key FROM characters WHERE discord_id=?1) ELSE 0 END`;
 return env.DB.prepare(`UPDATE site_applications AS a SET answers=(WITH RECURSIVE matches(idx,ordinal) AS(
 SELECT CAST(e.key AS INTEGER),ROW_NUMBER() OVER(ORDER BY CAST(e.key AS INTEGER) DESC) FROM json_each(a.answers,'$.references')e WHERE ${match}),
 scrubbed(ordinal,text) AS(SELECT 0,a.answers UNION ALL SELECT s.ordinal+1,json_remove(s.text,'$.references['||m.idx||']') FROM scrubbed s JOIN matches m ON m.ordinal=s.ordinal+1)
 SELECT text FROM scrubbed ORDER BY ordinal DESC LIMIT 1) WHERE a.discord_id<>?1 AND CASE WHEN NOT json_valid(a.answers) THEN 0
 WHEN json_type(a.answers)<>'object' THEN 0 WHEN COALESCE(json_type(a.answers,'$.references'),'')<>'array' THEN 0
 WHEN (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='references')<>1 THEN 0 ELSE EXISTS(SELECT 1 FROM json_each(a.answers,'$.references')e WHERE ${match}) END`).bind(id);
}
