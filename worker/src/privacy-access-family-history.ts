/** Closed own-copy collection descriptors. Client strings select a name, never SQL, columns, owners or ordering. */
import type { Env } from './env';
import { FormError } from './policy-form-core';
import { secondsToIso } from './community-time';
import { PROFESSIONS } from './community-directory';
import { ownContributionHistorySource, projectOwnContributionHistory } from './community-contributions';
import { DB_NOW } from './community-context';
import type { PrivacyHistoryDefinition, PrivacyHistoryPosition } from './privacy-access-history';
import { boundedPrivacyHistoryStatements } from './privacy-access-history';

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
] as const;
export type PrivacyFamilyHistoryCollection=typeof PRIVACY_FAMILY_HISTORY_COLLECTIONS[number];
type Rec=Record<string,unknown>;
const now=DB_NOW;
const fail=():never=>{throw new FormError('privacy_copy_unconfirmed',503);};
const iso=(v:unknown)=>v===null?null:typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?secondsToIso(v):fail();
const pick=(r:Rec,fields:string)=>Object.fromEntries(fields.split(',').map(k=>[k,r[k]]));
const live=(a:string)=>`(${a}.retain_until IS NULL OR ${a}.retain_until>${now})`;
const profile='EXISTS(SELECT 1 FROM community_profiles p WHERE p.discord_id=?1)';
const sources:Record<PrivacyFamilyHistoryCollection,string>={
 'site.votes':'SELECT rowid AS __history_id,0 AS __history_at,ballot,slot,nominee_label,reason,created_at,updated_at FROM site_votes WHERE voter_id=?1',
 'site.boardVotes':'SELECT rowid AS __history_id,0 AS __history_at,role_key,vote,created_at,updated_at FROM site_board_votes WHERE voter_id=?1',
 'site.friends':'SELECT rowid AS __history_id,0 AS __history_at,friend_label,note,created_at FROM site_friends WHERE owner_id=?1',
 'site.reserved':'SELECT rowid AS __history_id,0 AS __history_at,name,status,created_at,approved_at,queued_at,released_at FROM site_reserved WHERE owner_id=?1',
 'verification.characters':'SELECT rowid AS __history_id,0 AS __history_at,name,status,bound_at,verified_at,member_since,left_at,source FROM characters WHERE discord_id=?1',
 'verification.codeRequests':'SELECT rowid AS __history_id,0 AS __history_at,name,created_at,expires_at,consumed_at,consumed_source FROM pending WHERE discord_id=?1',
 'verification.inviteQueue':'SELECT rowid AS __history_id,0 AS __history_at,name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at FROM invite_queue WHERE discord_id=?1',
 'verification.renameRecords':'SELECT rowid AS __history_id,0 AS __history_at,old_name,new_name,state,decided_at,closed_at FROM rename_holds WHERE discord_id=?1',
 'privacyLifecycle.erasureRequests':'SELECT rowid AS __history_id,0 AS __history_at,state,hold_reason,staff_access,created_at,completed_at,retain_until FROM privacy_serving_jobs WHERE subject_id=?1',
 'privacyLifecycle.providerCleanup':"SELECT rowid AS __history_id,0 AS __history_at,purpose,state,cleanup_requested,created_at,updated_at,retain_until FROM privacy_provider_messages WHERE EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)",
 'privacyLifecycle.recoverySuppression':'SELECT rowid AS __history_id,0 AS __history_at,erased_at,retain_until,scope,recovery_custody FROM privacy_restore_replay WHERE subject_id=?1',
 'community.directory.professions':`SELECT rowid AS __history_id,0 AS __history_at,profession,skill,updated_at FROM community_professions WHERE discord_id=?1 AND ${profile}`,
 'community.directory.alts':`SELECT rowid AS __history_id,0 AS __history_at,name,status,proof,updated_at FROM community_alt_claims WHERE discord_id=?1 AND ${profile}`,
 'community.directory.crafts':'SELECT rowid AS __history_id,0 AS __history_at,profession,recipe_name,updated_at FROM community_craft_offers WHERE discord_id=?1',
 'community.events.signups':'SELECT s.rowid AS __history_id,0 AS __history_at,s.event_id,e.title,e.starts_at,s.status,s.character_name,s.raid_role,s.updated_at FROM community_event_signups s JOIN community_events e ON e.id=s.event_id WHERE s.discord_id=?1',
 'community.events.created':'SELECT rowid AS __history_id,0 AS __history_at,id,title,starts_at,status FROM community_events WHERE created_by=?1',
 'community.events.attendance':'SELECT a.rowid AS __history_id,0 AS __history_at,a.event_id,e.title,e.starts_at,a.state,a.reason_code,a.recorded_at FROM community_event_attendance a JOIN community_events e ON e.id=a.event_id WHERE a.discord_id=?1',
 'community.trials.trials':`SELECT t.rowid AS __history_id,0 AS __history_at,t.status,t.started_at,t.review_due_at,t.outcome_reason,t.concluded_at,t.updated_at,t.retain_until FROM community_trials t WHERE t.discord_id=?1 AND t.retain_until>${now}`,
 'community.restrictions.cases':`SELECT c.rowid AS __history_id,0 AS __history_at,c.category,c.set_at,c.review_at,c.expires_at,c.appeal_status,c.review_outcome,c.reviewed_at,c.acknowledged_at,c.resolved_at,(c.resolved_at IS NULL AND c.appeal_status<>'overturned' AND (c.category='ban' OR c.expires_at>${now})) AS active FROM community_restriction_cases c WHERE c.discord_id=?1 AND ${live('c')}`,
 'community.restrictions.watchList':`SELECT w.rowid AS __history_id,0 AS __history_at,c.category,w.character_name,w.added_at,w.review_at,w.expires_at,w.renewed_at,w.renewal_reason FROM community_restriction_characters w JOIN community_restriction_cases c ON c.id=w.case_id WHERE c.discord_id=?1 AND w.expires_at>${now} AND ${live('c')}`,
 'community.departures.departures':`SELECT d.rowid AS __history_id,0 AS __history_at,d.character_name,d.kind,d.observed_at,d.status,d.reviewed_at,d.retain_until FROM community_departure_reviews d WHERE d.discord_id=?1 AND d.retain_until>${now}`,
 'community.contributions.obligations':ownContributionHistorySource('obligations'),
 'community.contributions.receipts':ownContributionHistorySource('receipts'),
 'community.news.notices':'SELECT rowid AS __history_id,0 AS __history_at,id,title,revision,created_at,updated_at,retain_until FROM site_news_notices WHERE created_by=?1 OR updated_by=?1',
 'community.news.deletedNotices':'SELECT o.rowid AS __history_id,0 AS __history_at,o.id,o.created_at,o.purge_after FROM site_news_ops o WHERE o.created_by=?1 AND NOT EXISTS(SELECT 1 FROM site_news_notices n WHERE n.id=o.id)',
 'community.event_delivery.publications':'SELECT rowid AS __history_id,0 AS __history_at,event_id,purpose,event_revision,state,cleanup_requested,created_at,updated_at,retain_until,result_code FROM community_event_deliveries WHERE actor=?1',
 'community.event_reminders.reminders':'SELECT rowid AS __history_id,0 AS __history_at,event_id,event_revision,state,starts_at,created_at,retain_until FROM community_event_reminders WHERE actor=?1',
 'community.privacy_access.connections':'SELECT rowid AS __history_id,0 AS __history_at,purpose,created_at,expires_at,consumed_at FROM privacy_access_grants WHERE subject_id=?1',
 'community.councillor_verification.councillorKeys':'SELECT rowid AS __history_id,0 AS __history_at,id,signer_guid,created_at,expires_at,revoked_at FROM councillor_keys WHERE signer=?1',
 'community.councillor_verification.challenges':'SELECT rowid AS __history_id,0 AS __history_at,created_at,expires_at,used_at,mode,max_proofs,proofs_used FROM councillor_challenges WHERE signer=?1',
 'community.councillor_verification.requests':'SELECT rowid AS __history_id,0 AS __history_at,created_at,expires_at,used_at,state FROM verification_requests WHERE requester=?1',
 'community.councillor_verification.attestations':"SELECT rowid AS __history_id,0 AS __history_at,id,CASE WHEN requester=?1 THEN 'requester' ELSE 'signer' END AS own_part,created_at,expires_at FROM verification_proofs WHERE requester=?1 OR signer=?1",
 'community.councillor_verification.roleOutcomes':'SELECT rowid AS __history_id,0 AS __history_at,id,purpose,desired,state,reason,attempts,created_at,expires_at,checked_at FROM role_settlements WHERE subject=?1',
};
const rawFields:Partial<Record<PrivacyFamilyHistoryCollection,string>>={
 'site.votes':'ballot,slot,nominee_label,reason,created_at,updated_at','site.boardVotes':'role_key,vote,created_at,updated_at',
 'site.friends':'friend_label,note,created_at','site.reserved':'name,status,created_at,approved_at,queued_at,released_at',
 'verification.characters':'name,status,bound_at,verified_at,member_since,left_at,source','verification.codeRequests':'name,created_at,expires_at,consumed_at,consumed_source',
 'verification.inviteQueue':'name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at','verification.renameRecords':'old_name,new_name,state,decided_at,closed_at',
 'privacyLifecycle.erasureRequests':'state,hold_reason,staff_access,created_at,completed_at,retain_until','privacyLifecycle.providerCleanup':'purpose,state,cleanup_requested,created_at,updated_at,retain_until',
 'privacyLifecycle.recoverySuppression':'erased_at,retain_until,scope,recovery_custody','community.privacy_access.connections':'purpose,created_at,expires_at,consumed_at',
 'community.councillor_verification.councillorKeys':'id,signer_guid,created_at,expires_at,revoked_at','community.councillor_verification.challenges':'created_at,expires_at,used_at,mode,max_proofs,proofs_used',
 'community.councillor_verification.requests':'created_at,expires_at,used_at,state','community.councillor_verification.attestations':'id,own_part,created_at,expires_at',
 'community.councillor_verification.roleOutcomes':'id,purpose,desired,state,reason,attempts,created_at,expires_at,checked_at',
};
const results=['published','reconciled','removed','admission_changed','discord_refused','outcome_unknown'];
const projectedFields:Partial<Record<PrivacyFamilyHistoryCollection,string>>={
 'community.directory.professions':'profession,skill,updated_at','community.directory.alts':'name,status,proof,updated_at','community.directory.crafts':'profession,recipe_name,updated_at',
 'community.events.signups':'event_id,title,starts_at,status,character_name,raid_role,updated_at','community.events.created':'id,title,starts_at,status','community.events.attendance':'event_id,title,starts_at,state,reason_code,recorded_at',
 'community.trials.trials':'status,started_at,review_due_at,outcome_reason,concluded_at,updated_at,retain_until','community.restrictions.cases':'category,set_at,review_at,expires_at,appeal_status,review_outcome,reviewed_at,acknowledged_at,resolved_at,active',
 'community.restrictions.watchList':'category,character_name,added_at,review_at,expires_at,renewed_at,renewal_reason','community.departures.departures':'character_name,kind,observed_at,status,reviewed_at,retain_until',
 'community.contributions.obligations':'guild_scope,period_start,due_at,policy_version,amount_copper,paid,paid_magnitude,eligible,state,acknowledged_at,officer_contact_at,final_notice_at,final_acknowledged_at,final_officer_contact_at',
 'community.contributions.receipts':'guild_scope,source,amount_copper,retired_copper,observed_at,status,voided_at,expired,allocated,allocated_magnitude',
 'community.news.notices':'id,title,revision,created_at,updated_at,retain_until','community.news.deletedNotices':'id,created_at,purge_after',
 'community.event_delivery.publications':'event_id,purpose,event_revision,state,cleanup_requested,created_at,updated_at,retain_until,result_code','community.event_reminders.reminders':'event_id,event_revision,state,starts_at,created_at,retain_until',
};
function project(c:PrivacyFamilyHistoryCollection,r:Rec):Rec {
 const fields=rawFields[c];if(fields)return pick(r,fields);
 switch(c){
  case 'community.directory.professions':if(!PROFESSIONS.includes(r.profession as typeof PROFESSIONS[number])||!(r.skill===null||typeof r.skill==='number'&&Number.isInteger(r.skill)&&r.skill>=0&&r.skill<=450))return fail();return {name:r.profession,skill:r.skill,updatedAt:iso(r.updated_at)};
  case 'community.directory.alts':if(typeof r.name!=='string'||!['claimed','officer_confirmed','rejected'].includes(r.status as string)||!['self','keeper'].includes(r.proof as string))return fail();return {name:r.name,status:r.status,proof:r.proof,updatedAt:iso(r.updated_at)};
  case 'community.directory.crafts':if(!PROFESSIONS.includes(r.profession as typeof PROFESSIONS[number])||typeof r.recipe_name!=='string')return fail();return {profession:r.profession,recipe:r.recipe_name,source:'self',updatedAt:iso(r.updated_at)};
  case 'community.events.signups':return {eventId:r.event_id,title:r.title,startsAt:iso(r.starts_at),status:r.status,character:r.character_name,raidRole:r.raid_role,updatedAt:iso(r.updated_at)};
  case 'community.events.created':return {id:r.id,title:r.title,startsAt:iso(r.starts_at),status:r.status};
  case 'community.events.attendance':return {eventId:r.event_id,title:r.title,startsAt:iso(r.starts_at),state:r.state,reasonCode:r.reason_code,recordedAt:iso(r.recorded_at)};
  case 'community.trials.trials':return {status:r.status,startedAt:iso(r.started_at),reviewDueAt:iso(r.review_due_at),outcome:r.status==='passed'||r.status==='ended'?r.status:null,reason:r.outcome_reason,concludedAt:iso(r.concluded_at),updatedAt:iso(r.updated_at),retainUntil:iso(r.retain_until)};
  case 'community.restrictions.cases':return {category:r.category,setAt:iso(r.set_at),reviewAt:iso(r.review_at),expiresAt:iso(r.expires_at),appealStatus:r.appeal_status,reviewOutcome:r.review_outcome,reviewedAt:iso(r.reviewed_at),acknowledgedAt:iso(r.acknowledged_at),resolvedAt:iso(r.resolved_at),active:r.active===1};
  case 'community.restrictions.watchList':return {category:r.category,characterName:r.character_name,addedAt:iso(r.added_at),reviewAt:iso(r.review_at),expiresAt:iso(r.expires_at),renewedAt:iso(r.renewed_at),renewalReason:r.renewal_reason};
  case 'community.departures.departures':return {characterName:r.character_name,kind:r.kind,observedAt:iso(r.observed_at),status:r.status,reviewedAt:iso(r.reviewed_at),retainUntil:iso(r.retain_until)};
  case 'community.contributions.obligations':case 'community.contributions.receipts':try{return projectOwnContributionHistory(c.endsWith('.obligations')?'obligations':'receipts',r);}catch{return fail();}
  case 'community.news.notices':return {id:r.id,title:r.title,postedAt:iso(r.created_at),editedAt:(r.revision as number)>1?iso(r.updated_at):null,keptUntil:iso(r.retain_until)};
  case 'community.news.deletedNotices':return {id:r.id,postedAt:iso(r.created_at),keptUntil:iso(r.purge_after)};
  case 'community.event_delivery.publications':return {eventId:r.event_id,purpose:r.purpose,revision:r.event_revision,state:r.state,removalPending:r.cleanup_requested===1,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),retainUntil:iso(r.retain_until),result:typeof r.result_code==='string'&&results.includes(r.result_code)?r.result_code:null};
  case 'community.event_reminders.reminders':return {eventId:r.event_id,revision:r.event_revision,state:r.state,startsAt:iso(r.starts_at),createdAt:iso(r.created_at),retainUntil:iso(r.retain_until)};
 }
 return fail();
}
/** Hidden native rowid order is stable across mutable display timestamps; rowid is never an exported data field. */
export function privacyFamilyHistoryDefinition(c:PrivacyFamilyHistoryCollection):PrivacyHistoryDefinition {
 if(!PRIVACY_FAMILY_HISTORY_COLLECTIONS.includes(c))return fail();
 const source=sources[c];
 return {idField:'__history_id',timeField:'__history_at',project:r=>project(c,r),statements:(env:Env,id:string,p:PrivacyHistoryPosition|null,pageLimit:number)=>{
  const fields=(rawFields[c]??projectedFields[c]);if(!fields)return fail();
  return boundedPrivacyHistoryStatements(env,id,source,fields.split(','),'__history_id','__history_at',p,pageLimit);
 }};
}
