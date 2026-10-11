/** Closed own-copy collection descriptors. Client strings select a name, never SQL, columns, owners or ordering. */
import type { Env } from './env';
import { FormError } from './policy-form-core';
import { secondsToIso } from './community-time';
import { projectOwnDirectoryCopy,projectOwnEventCopy,ownCopyProofFacts,ownCopyRankFacts,ownCopyQueueHold,projectOwnTrialCopy,projectOwnRestrictionCopy,projectOwnDepartureCopy,projectOwnPublicationCopy,projectOwnReminderCopy } from './privacy-account-coverage';
import { PROFESSIONS } from './community-directory';
import { ownContributionHistorySource, projectOwnContributionHistory } from './community-contributions';
import { DB_NOW } from './community-context';
import { projectOwnRulesetPublication } from './ruleset-publication-data';
import type { PrivacyHistoryDefinition, PrivacyHistoryPosition } from './privacy-access-history';
import { boundedPrivacyHistoryStatements } from './privacy-access-history';
import type { PrivacyAccessGrant } from './privacy-access';
import { BNET_TTL_S, BNET_FUTURE_SLACK_S } from './bnet-retention';

export const PRIVACY_FAMILY_HISTORY_COLLECTIONS=[
 'site.votes','site.boardVotes','site.friends','site.reserved',
 'verification.characters','verification.codeRequests','verification.inviteQueue','verification.renameRecords',
 'privacyLifecycle.erasureRequests','privacyLifecycle.providerCleanup','privacyLifecycle.recoverySuppression',
 'community.directory.professions','community.directory.alts','community.directory.crafts',
 'community.events.signups','community.events.created','community.events.attendance','community.trials.trials',
 'community.restrictions.cases','community.restrictions.watchList','community.departures.departures',
 'community.contributions.obligations','community.contributions.receipts','community.news.notices','community.news.deletedNotices',
 'community.event_delivery.publications','community.event_reminders.reminders','community.privacy_access.connections',
 'community.councillor_verification.councillorKeys','community.councillor_verification.challenges','community.councillor_verification.requests',
 'community.councillor_verification.attestations','community.councillor_verification.roleOutcomes',
 'community.ruleset_publication.operations',
] as const;
export type PrivacyFamilyHistoryCollection=typeof PRIVACY_FAMILY_HISTORY_COLLECTIONS[number];
type Rec=Record<string,unknown>;
const now=DB_NOW;
const fail=():never=>{throw new FormError('privacy_copy_unconfirmed',503);};
const iso=(v:unknown)=>v===null?null:typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?secondsToIso(v):fail();
const pick=(r:Rec,fields:string)=>Object.fromEntries(fields.split(',').map(k=>[k,r[k]]));
const live=(a:string)=>`(${a}.retain_until IS NULL OR ${a}.retain_until>${now})`;
// Own child history does not require a surviving directory profile.
const sources:Record<PrivacyFamilyHistoryCollection,string>={
 'community.ruleset_publication.operations':`SELECT rowid AS __history_id,0 AS __history_at,profile_revision,selection_revision,target_key,state,result_code,created_at,updated_at,actor_retain_until FROM ruleset_publications WHERE actor=?1 AND actor_retain_until>${now}`,
 'site.votes':'SELECT rowid AS __history_id,0 AS __history_at,ballot,slot,nominee_label,reason,created_at,updated_at FROM site_votes WHERE voter_id=?1',
 'site.boardVotes':'SELECT rowid AS __history_id,0 AS __history_at,role_key,vote,created_at,updated_at FROM site_board_votes WHERE voter_id=?1',
 'site.friends':'SELECT rowid AS __history_id,0 AS __history_at,friend_label,note,created_at FROM site_friends WHERE owner_id=?1',
 'site.reserved':'SELECT rowid AS __history_id,0 AS __history_at,name,status,created_at,approved_at,queued_at,released_at FROM site_reserved WHERE owner_id=?1',
 'verification.characters':'SELECT rowid AS __history_id,0 AS __history_at,name,status,bound_at,verified_at,member_since,left_at,source FROM characters WHERE discord_id=?1',
 'verification.codeRequests':'SELECT rowid AS __history_id,0 AS __history_at,name,created_at,expires_at,consumed_at,consumed_source FROM pending WHERE discord_id=?1',
 'verification.inviteQueue':'SELECT rowid AS __history_id,0 AS __history_at,name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at,claimed_at FROM invite_queue WHERE discord_id=?1',
 'verification.renameRecords':'SELECT rowid AS __history_id,0 AS __history_at,old_name,new_name,state,decided_at,closed_at FROM rename_holds WHERE discord_id=?1',
 'privacyLifecycle.erasureRequests':'SELECT rowid AS __history_id,0 AS __history_at,state,hold_reason,staff_access,created_at,completed_at,retain_until FROM privacy_serving_jobs WHERE subject_id=?1',
 'privacyLifecycle.providerCleanup':"SELECT rowid AS __history_id,0 AS __history_at,purpose,state,cleanup_requested,created_at,updated_at,retain_until FROM privacy_provider_messages WHERE EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)",
 'privacyLifecycle.recoverySuppression':'SELECT rowid AS __history_id,0 AS __history_at,erased_at,retain_until,scope,recovery_custody FROM privacy_restore_replay WHERE subject_id=?1',
 'community.directory.professions':`SELECT rowid AS __history_id,0 AS __history_at,profession,skill,updated_at FROM community_professions WHERE discord_id=?1`,
 'community.directory.alts':`SELECT rowid AS __history_id,0 AS __history_at,name,status,proof,claimed_at,reviewed_at,updated_at FROM community_alt_claims WHERE discord_id=?1`,
 'community.directory.crafts':'SELECT rowid AS __history_id,0 AS __history_at,profession,recipe_name,updated_at FROM community_craft_offers WHERE discord_id=?1',
 'community.events.signups':'SELECT s.rowid AS __history_id,0 AS __history_at,s.event_id,e.title,e.starts_at,s.status,s.character_name,s.raid_role,s.rsvp_starts_at,s.updated_at FROM community_event_signups s LEFT JOIN community_events e ON e.id=s.event_id WHERE s.discord_id=?1',
 'community.events.created':'SELECT rowid AS __history_id,0 AS __history_at,id,title,starts_at,status,created_at,updated_at,ends_at,duration_min,capacity,role_targets,retain_until FROM community_events WHERE created_by=?1',
 'community.events.attendance':'SELECT a.rowid AS __history_id,0 AS __history_at,a.event_id,e.title,e.starts_at,a.state,a.source,a.reason_code,a.recorded_at FROM community_event_attendance a LEFT JOIN community_events e ON e.id=a.event_id WHERE a.discord_id=?1',
 'community.trials.trials':`SELECT t.rowid AS __history_id,0 AS __history_at,CASE WHEN instr(t.status,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE t.status END AS status,t.started_at,t.review_due_at,CASE WHEN instr(t.outcome_reason,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE t.outcome_reason END AS outcome_reason,t.concluded_at,t.created_at,t.updated_at,t.retain_until FROM community_trials t WHERE t.discord_id=?1 AND t.retain_until>${now}`,
 'community.restrictions.cases':`SELECT c.rowid AS __history_id,0 AS __history_at,CASE WHEN instr(c.category,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE c.category END AS category,c.set_at,c.review_at,c.expires_at,CASE WHEN instr(c.appeal_status,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE c.appeal_status END AS appeal_status,CASE WHEN instr(c.review_outcome,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE c.review_outcome END AS review_outcome,c.reviewed_at,c.acknowledged_at,c.resolved_at,c.updated_at,c.retain_until,(c.resolved_at IS NULL AND c.appeal_status<>'overturned' AND (c.category='ban' OR c.expires_at>${now})) AS active FROM community_restriction_cases c WHERE c.discord_id=?1 AND ${live('c')}`,
 'community.restrictions.watchList':`SELECT w.rowid AS __history_id,0 AS __history_at,c.category,w.character_name,w.added_at,w.review_at,w.expires_at,w.renewed_at,w.renewal_reason FROM community_restriction_characters w JOIN community_restriction_cases c ON c.id=w.case_id WHERE c.discord_id=?1 AND w.expires_at>${now} AND ${live('c')}`,
 'community.departures.departures':`SELECT d.rowid AS __history_id,0 AS __history_at,CASE WHEN instr(d.character_name,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE d.character_name END AS character_name,CASE WHEN instr(d.kind,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE d.kind END AS kind,d.observed_at,CASE WHEN instr(d.status,char(0))>0 THEN json_extract('privacy_copy_unconfirmed','$') ELSE d.status END AS status,d.created_at,d.reviewed_at,d.retain_until FROM community_departure_reviews d WHERE d.discord_id=?1 AND d.retain_until>${now}`,
 'community.contributions.obligations':ownContributionHistorySource('obligations'),
 'community.contributions.receipts':ownContributionHistorySource('receipts'),
 'community.news.notices':'SELECT rowid AS __history_id,0 AS __history_at,id,title,revision,created_at,updated_at,retain_until FROM site_news_notices WHERE created_by=?1 OR updated_by=?1',
 'community.news.deletedNotices':'SELECT o.rowid AS __history_id,0 AS __history_at,o.id,o.created_at,o.purge_after FROM site_news_ops o WHERE o.created_by=?1 AND NOT EXISTS(SELECT 1 FROM site_news_notices n WHERE n.id=o.id)',
 'community.event_delivery.publications':'SELECT rowid AS __history_id,0 AS __history_at,CASE WHEN instr(event_id,char(0))>0 THEN json_extract(\'privacy_copy_unconfirmed\',\'$\') ELSE event_id END AS event_id,CASE WHEN instr(purpose,char(0))>0 THEN json_extract(\'privacy_copy_unconfirmed\',\'$\') ELSE purpose END AS purpose,event_revision,starts_at,CASE WHEN instr(state,char(0))>0 THEN json_extract(\'privacy_copy_unconfirmed\',\'$\') ELSE state END AS state,cleanup_requested,created_at,updated_at,retain_until,CASE WHEN instr(result_code,char(0))>0 THEN json_extract(\'privacy_copy_unconfirmed\',\'$\') ELSE result_code END AS result_code FROM community_event_deliveries WHERE actor=?1',
 'community.event_reminders.reminders':'SELECT rowid AS __history_id,0 AS __history_at,CASE WHEN instr(event_id,char(0))>0 THEN json_extract(\'privacy_copy_unconfirmed\',\'$\') ELSE event_id END AS event_id,event_revision,CASE WHEN instr(state,char(0))>0 THEN json_extract(\'privacy_copy_unconfirmed\',\'$\') ELSE state END AS state,starts_at,created_at,updated_at,last_attempt_at,cleanup_requested,retain_until FROM community_event_reminders WHERE actor=?1',
 'community.privacy_access.connections':'SELECT rowid AS __history_id,0 AS __history_at,purpose,created_at,expires_at,consumed_at FROM privacy_access_grants WHERE subject_id=?1',
 'community.councillor_verification.councillorKeys':'SELECT rowid AS __history_id,0 AS __history_at,id,signer_guid,created_at,expires_at,revoked_at FROM councillor_keys WHERE signer=?1',
 'community.councillor_verification.challenges':'SELECT rowid AS __history_id,0 AS __history_at,created_at,expires_at,used_at,mode,max_proofs,proofs_used FROM councillor_challenges WHERE signer=?1',
 'community.councillor_verification.requests':'SELECT rowid AS __history_id,0 AS __history_at,created_at,expires_at,used_at,state FROM verification_requests WHERE requester=?1',
 'community.councillor_verification.attestations':"SELECT rowid AS __history_id,0 AS __history_at,id,CASE WHEN requester=?1 THEN 'requester' ELSE 'signer' END AS own_part,CASE WHEN requester=?1 THEN requester_name ELSE NULL END AS requester_name,CASE WHEN requester=?1 THEN native_rank ELSE NULL END AS native_rank,CASE WHEN requester=?1 THEN rank_name ELSE NULL END AS rank_name,created_at,expires_at FROM verification_proofs WHERE requester=?1 OR signer=?1",
 'community.councillor_verification.roleOutcomes':'SELECT rowid AS __history_id,0 AS __history_at,id,purpose,desired,state,reason,attempts,native_rank,native_rank_name,created_at,expires_at,checked_at FROM role_settlements WHERE subject=?1',
};
const rawFields:Partial<Record<PrivacyFamilyHistoryCollection,string>>={
 'community.ruleset_publication.operations':'profile_revision,selection_revision,target_key,state,result_code,created_at,updated_at,actor_retain_until',
 'site.votes':'ballot,slot,nominee_label,reason,created_at,updated_at','site.boardVotes':'role_key,vote,created_at,updated_at',
 'site.friends':'friend_label,note,created_at','site.reserved':'name,status,created_at,approved_at,queued_at,released_at',
 'verification.characters':'name,status,bound_at,verified_at,member_since,left_at,source','verification.codeRequests':'name,created_at,expires_at,consumed_at,consumed_source',
 'verification.inviteQueue':'name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at,claimed_at','verification.renameRecords':'old_name,new_name,state,decided_at,closed_at',
 'privacyLifecycle.erasureRequests':'state,hold_reason,staff_access,created_at,completed_at,retain_until','privacyLifecycle.providerCleanup':'purpose,state,cleanup_requested,created_at,updated_at,retain_until',
 'privacyLifecycle.recoverySuppression':'erased_at,retain_until,scope,recovery_custody','community.privacy_access.connections':'purpose,created_at,expires_at,consumed_at',
 'community.councillor_verification.councillorKeys':'id,signer_guid,created_at,expires_at,revoked_at','community.councillor_verification.challenges':'created_at,expires_at,used_at,mode,max_proofs,proofs_used',
 'community.councillor_verification.requests':'created_at,expires_at,used_at,state','community.councillor_verification.attestations':'id,own_part,requester_name,native_rank,rank_name,created_at,expires_at',
 'community.councillor_verification.roleOutcomes':'id,purpose,desired,state,reason,attempts,native_rank,native_rank_name,created_at,expires_at,checked_at',
};
const results=['published','reconciled','removed','admission_changed','discord_refused','outcome_unknown'];
const projectedFields:Partial<Record<PrivacyFamilyHistoryCollection,string>>={
 'community.directory.professions':'profession,skill,updated_at','community.directory.alts':'name,status,proof,claimed_at,reviewed_at,updated_at','community.directory.crafts':'profession,recipe_name,updated_at',
 'community.events.signups':'event_id,title,starts_at,status,character_name,raid_role,rsvp_starts_at,updated_at','community.events.created':'id,title,starts_at,status,created_at,updated_at,ends_at,duration_min,capacity,role_targets,retain_until','community.events.attendance':'event_id,title,starts_at,state,source,reason_code,recorded_at',
 'community.trials.trials':'status,started_at,review_due_at,outcome_reason,concluded_at,created_at,updated_at,retain_until','community.restrictions.cases':'category,set_at,review_at,expires_at,appeal_status,review_outcome,reviewed_at,acknowledged_at,resolved_at,updated_at,retain_until,active',
 'community.restrictions.watchList':'category,character_name,added_at,review_at,expires_at,renewed_at,renewal_reason','community.departures.departures':'character_name,kind,observed_at,status,created_at,reviewed_at,retain_until',
 'community.contributions.obligations':'guild_scope,period_start,due_at,policy_version,amount_copper,paid,paid_magnitude,eligible,state,acknowledged_at,officer_contact_at,final_notice_at,final_acknowledged_at,final_officer_contact_at,created_at,updated_at,retain_until',
 'community.contributions.receipts':'guild_scope,source,amount_copper,retired_copper,observed_at,status,voided_at,expired,allocated,allocated_magnitude,created_at,retain_until',
 'community.news.notices':'id,title,revision,created_at,updated_at,retain_until','community.news.deletedNotices':'id,created_at,purge_after',
 'community.event_delivery.publications':'event_id,purpose,event_revision,starts_at,state,cleanup_requested,created_at,updated_at,retain_until,result_code','community.event_reminders.reminders':'event_id,event_revision,state,starts_at,created_at,updated_at,last_attempt_at,cleanup_requested,retain_until',
};
function project(c:PrivacyFamilyHistoryCollection,r:Rec):Rec {
 if(c==='community.ruleset_publication.operations')return projectOwnRulesetPublication(r);
  if(c==='verification.inviteQueue')return {...pick(r,'name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at'),...ownCopyQueueHold(r)};
 const fields=rawFields[c];if(fields){const value=pick(r,fields);return c==='community.councillor_verification.attestations'?{...value,...ownCopyProofFacts(r)}:c==='community.councillor_verification.roleOutcomes'?{...value,...ownCopyRankFacts(r)}:value;}
 switch(c){
  case 'community.directory.professions':return projectOwnDirectoryCopy('professions',r);
  case 'community.directory.alts':return projectOwnDirectoryCopy('alts',r);
  case 'community.directory.crafts':if(!PROFESSIONS.includes(r.profession as typeof PROFESSIONS[number])||typeof r.recipe_name!=='string')return fail();return {profession:r.profession,recipe:r.recipe_name,source:'self',updatedAt:iso(r.updated_at)};
  case 'community.events.signups':return projectOwnEventCopy('signups',r);
  case 'community.events.created':return projectOwnEventCopy('created',r);
  case 'community.events.attendance':return projectOwnEventCopy('attendance',r);
  case 'community.trials.trials':return projectOwnTrialCopy(r);
  case 'community.restrictions.cases':return projectOwnRestrictionCopy(r);
  case 'community.restrictions.watchList':return {category:r.category,characterName:r.character_name,addedAt:iso(r.added_at),reviewAt:iso(r.review_at),expiresAt:iso(r.expires_at),renewedAt:iso(r.renewed_at),renewalReason:r.renewal_reason};
  case 'community.departures.departures':return projectOwnDepartureCopy(r);
  case 'community.contributions.obligations':case 'community.contributions.receipts':try{return projectOwnContributionHistory(c.endsWith('.obligations')?'obligations':'receipts',r);}catch{return fail();}
  case 'community.news.notices':return {id:r.id,title:r.title,postedAt:iso(r.created_at),editedAt:(r.revision as number)>1?iso(r.updated_at):null,keptUntil:iso(r.retain_until)};
  case 'community.news.deletedNotices':return {id:r.id,postedAt:iso(r.created_at),keptUntil:iso(r.purge_after)};
  case 'community.event_delivery.publications':return projectOwnPublicationCopy(r);
  case 'community.event_reminders.reminders':return projectOwnReminderCopy(r);
 }
 return fail();
}
/** Hidden native rowid order is stable across mutable display timestamps; rowid is never an exported data field. */
/** Collection-only own metadata, never extra aggregate previews or authorization. */
export const PRIVACY_COLLECTION_ONLY_HISTORY_COLLECTIONS=['verification.battleNetCharacters','verification.rosterEffects','site.settingUpdates'] as const;
export type PrivacyCollectionOnlyHistoryCollection=typeof PRIVACY_COLLECTION_ONLY_HISTORY_COLLECTIONS[number];
/** These human writes update actor and time together. Background state such as officer_digest does not. */
export const PRIVACY_OWN_SETTING_KEYS=['namesOpenAt','namesTimeConfirmed','namesOpen','launchAt','autoQueue','applicationsOpen','votingOpen','notice','appointed','noVote','newsOn','leadership','betaClosedAt','betaResetAt','betaResetFor','bnetLogin','bnetEnableIntent'] as const;
const originalWhole=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=999999999999;
const originalTime=(v:unknown,nullable=false):string|null=>nullable&&v===null?null:originalWhole(v)?secondsToIso(v):fail();
// No active Phase3 producer or schema text/level maximum exists. SQL's fixed projected byte bound is the text cap.
const originalLabel=(v:unknown,nullable=false):string|null=>nullable&&v===null?null:typeof v==='string'&&v.length>0&&!/[\u0000-\u001f\u007f]/.test(v)?v:fail();
export function privacyCollectionOnlyHistoryNote(c:string):string|null {
 if(c==='verification.battleNetCharacters')return 'Historical own character labels read from retained data, with original fetch time and existing freshness filters. The dormant Battle.net connector remains off. IDs and tags are withheld. Missing, filtered or expired rows do not prove no data is retained.';
 if(c==='verification.rosterEffects')return 'Retained own roster processing intents attributable to the original account link captured when you connected Discord. Missing original linkage refuses this download; legacy unlinked rows need attended review. An absent parent run and unrecorded processing time remain null. Recorded processing time is recorded before provider work and does not confirm a successful role change.';
 if(c==='site.settingUpdates')return 'Key and original update time only for 17 known settings while you remain the current last updater. Setting values and other people are withheld. This is current metadata, not edit history, consent evidence, appointment or access authority.';
 return null;
}

export function privacyCollectionOnlyHistoryDefinition(c:PrivacyCollectionOnlyHistoryCollection,g:PrivacyAccessGrant):PrivacyHistoryDefinition {
 if(!PRIVACY_COLLECTION_ONLY_HISTORY_COLLECTIONS.includes(c))return fail();
 let context:Readonly<{originalGeneration:string}>|undefined;
 if(c==='verification.rosterEffects'){
  if(typeof g.generation!=='string'||!/^[0-9a-f]{32}$/.test(g.generation))throw new FormError('privacy_history_generation_unavailable',409);
  context=Object.freeze({originalGeneration:g.generation});
 }
 const source=c==='verification.battleNetCharacters'?`SELECT rowid AS __history_id,0 AS __history_at,name,realm_or_ruleset,level,fetched_at FROM bnet_characters WHERE discord_id=?1 AND fetched_at>${now}-${BNET_TTL_S} AND fetched_at<=${now}+${BNET_FUTURE_SLACK_S}`:
  c==='verification.rosterEffects'?`SELECT e.rowid AS __history_id,0 AS __history_at,e.kind,e.name,e.done_at,CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS run_present,r.created_at AS run_created_at FROM roster_effects e LEFT JOIN roster_effect_runs r ON r.id=e.run_id WHERE e.discord_id=?1 AND e.subject_generation=?7 AND EXISTS(SELECT 1 FROM privacy_subjects s WHERE s.subject_id=?1 AND s.generation=?7)`:
  `SELECT rowid AS __history_id,0 AS __history_at,key,updated_at FROM site_settings WHERE updated_by=?1 AND key IN (${PRIVACY_OWN_SETTING_KEYS.map(k=>"'"+k+"'").join(',')})`;
 const fields=c==='verification.battleNetCharacters'?['name','realm_or_ruleset','level','fetched_at']:c==='verification.rosterEffects'?['kind','name','done_at','run_present','run_created_at']:['key','updated_at'];
 return {idField:'__history_id',timeField:'__history_at',statements:(env,id,p,limit)=>boundedPrivacyHistoryStatements(env,id,source,fields,'__history_id','__history_at',p,limit,context),project:(r,at)=>{
  if(c==='verification.battleNetCharacters'){
   if(!originalWhole(r.fetched_at)||r.fetched_at<=at-BNET_TTL_S||r.fetched_at>at+BNET_FUTURE_SLACK_S||!(r.level===null||originalWhole(r.level)))return fail();
   return {name:originalLabel(r.name),realmOrRuleset:originalLabel(r.realm_or_ruleset,true),level:r.level,fetchedAt:originalTime(r.fetched_at)};
  }
  if(c==='verification.rosterEffects'){
   if(!['promote','note','depart'].includes(r.kind as string)||(r.run_present!==0&&r.run_present!==1)||(r.run_present===0&&r.run_created_at!==null))return fail();
   return {kind:r.kind,characterName:originalLabel(r.name),processingStatus:r.done_at===null?'pending':'recorded',processingRecordedAt:originalTime(r.done_at,true),run:r.run_present===0?null:{createdAt:originalTime(r.run_created_at)}};
  }
  if(!PRIVACY_OWN_SETTING_KEYS.includes(r.key as typeof PRIVACY_OWN_SETTING_KEYS[number]))return fail();
  return {key:r.key,updatedAt:originalTime(r.updated_at)};
 }};
}

export function privacyFamilyHistoryDefinition(c:PrivacyFamilyHistoryCollection):PrivacyHistoryDefinition {
 if(!PRIVACY_FAMILY_HISTORY_COLLECTIONS.includes(c))return fail();
 const source=sources[c];
 return {idField:'__history_id',timeField:'__history_at',project:r=>project(c,r),statements:(env:Env,id:string,p:PrivacyHistoryPosition|null,pageLimit:number)=>{
  const fields=(rawFields[c]??projectedFields[c]);if(!fields)return fail();
  return boundedPrivacyHistoryStatements(env,id,source,fields.split(','),'__history_id','__history_at',p,pageLimit);
 }};
}
