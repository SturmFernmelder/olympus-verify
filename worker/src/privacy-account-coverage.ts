/** Complete store inventory; selected account fields remain a curated partial copy. No identity or write authority. */
import { FormError } from './policy-form-core';
import { escapeText as e } from './policy-render';
import { secondsToIso } from './community-time';


/** Closed own-copy projections share original stored metadata across the two admission lanes. */
const ownCopyRefuse=():never=>{throw new FormError('privacy_copy_unconfirmed',503);};
export function ownCopyDate(value:unknown,nullable=false):string|null {
 if(nullable&&value===null)return null;
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>999999999999)return ownCopyRefuse();
 return secondsToIso(value);
}
const ownCopyText=(v:unknown,max:number,nullable=false):string|null=>{
 if(nullable&&v===null)return null;
 return typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v:ownCopyRefuse();
};
const ownCopyInt=(v:unknown,min:number,max:number,nullable=false):number|null=>nullable&&v===null?null:typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max?v:ownCopyRefuse();
const ownCopyEnum=(v:unknown,values:readonly string[],nullable=false):unknown=>nullable&&v===null?null:values.includes(v as string)?v:ownCopyRefuse();
/** Owner finite next-metadata batch (2026-10-11): stored dates and bounded context, never staff/provider authority. */
const ownCopyScope=(v:unknown):string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/.test(v)?v:ownCopyRefuse();
export function ownCopyObligationMetadata(r:Record<string,unknown>){return {guildScope:ownCopyScope(r.guild_scope),createdAt:ownCopyDate(r.created_at),updatedAt:ownCopyDate(r.updated_at),retainUntil:ownCopyDate(r.retain_until)};}
export function ownCopyReceiptMetadata(r:Record<string,unknown>){return {guildScope:ownCopyScope(r.guild_scope),createdAt:ownCopyDate(r.created_at),retainUntil:ownCopyDate(r.retain_until)};}
export function ownCopyDecisionMetadata(r:Record<string,unknown>){return {guildScope:ownCopyScope(r.guild_scope),retainUntil:ownCopyDate(r.retain_until)};}
export function ownCopyQueueHold(r:Record<string,unknown>){return {lastWatcherHoldAt:ownCopyDate(r.claimed_at,true)};}
export function projectOwnTrialCopy(r:Record<string,unknown>){
 const status=ownCopyEnum(r.status,['active','extended','passed','ended']);
 return {status,startedAt:ownCopyDate(r.started_at),reviewDueAt:ownCopyDate(r.review_due_at),outcome:status==='passed'||status==='ended'?status:null,reason:ownCopyEnum(r.outcome_reason,['review_passed','withdrew','inactive','staff_decision'],true),concludedAt:ownCopyDate(r.concluded_at,true),createdAt:ownCopyDate(r.created_at),updatedAt:ownCopyDate(r.updated_at),retainUntil:ownCopyDate(r.retain_until)};
}
export function projectOwnRestrictionCopy(r:Record<string,unknown>){
 if(r.active!==0&&r.active!==1)return ownCopyRefuse();
 return {category:ownCopyEnum(r.category,['ban','conduct_removal','tithe_removal']),setAt:ownCopyDate(r.set_at),reviewAt:ownCopyDate(r.review_at),expiresAt:ownCopyDate(r.expires_at,true),appealStatus:ownCopyEnum(r.appeal_status,['none','requested','upheld','overturned']),reviewOutcome:ownCopyEnum(r.review_outcome,['continued','lifted'],true),reviewedAt:ownCopyDate(r.reviewed_at,true),acknowledgedAt:ownCopyDate(r.acknowledged_at,true),resolvedAt:ownCopyDate(r.resolved_at,true),updatedAt:ownCopyDate(r.updated_at),retainUntil:ownCopyDate(r.retain_until,true),active:r.active===1};
}
export function projectOwnDepartureCopy(r:Record<string,unknown>){return {characterName:ownCopyText(r.character_name,40),kind:ownCopyEnum(r.kind,['left','removed','unknown']),observedAt:ownCopyDate(r.observed_at),status:ownCopyEnum(r.status,['open','acknowledged','restriction_opened']),createdAt:ownCopyDate(r.created_at),reviewedAt:ownCopyDate(r.reviewed_at,true),retainUntil:ownCopyDate(r.retain_until)};}
const ownEventId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{22}$/.test(v)?v:ownCopyRefuse();
const ownCleanup=(v:unknown)=>v===0?false:v===1?true:ownCopyRefuse();
export function projectOwnPublicationCopy(r:Record<string,unknown>){
 const result=typeof r.result_code==='string'&&['published','reconciled','removed','admission_changed','discord_refused','outcome_unknown'].includes(r.result_code)?r.result_code:null;
 return {eventId:ownEventId(r.event_id),purpose:ownCopyEnum(r.purpose,['publication']),revision:ownCopyInt(r.event_revision,1,Number.MAX_SAFE_INTEGER),state:ownCopyEnum(r.state,['claimed','posted','refused','unknown','removed']),startsAt:ownCopyDate(r.starts_at),removalPending:ownCleanup(r.cleanup_requested),createdAt:ownCopyDate(r.created_at),updatedAt:ownCopyDate(r.updated_at),retainUntil:ownCopyDate(r.retain_until),result};
}
export function projectOwnReminderCopy(r:Record<string,unknown>){
 const considered=ownCopyDate(r.last_attempt_at);
 return {eventId:ownEventId(r.event_id),revision:ownCopyInt(r.event_revision,1,Number.MAX_SAFE_INTEGER),state:ownCopyEnum(r.state,['armed','claimed','posted','refused','unknown','cancelled','removed']),startsAt:ownCopyDate(r.starts_at),createdAt:ownCopyDate(r.created_at),updatedAt:ownCopyDate(r.updated_at),lastSchedulerConsideredAt:r.last_attempt_at===0?null:considered,removalPending:ownCleanup(r.cleanup_requested),retainUntil:ownCopyDate(r.retain_until)};
}
/** Closed scope descriptions travel with individual metadata pages as well as the aggregate inventory. */
export function ownMetadataCollectionScope(collection:string):string|null {
 switch(collection){
  case 'community.contributions.obligations':return 'Own live weeks: original row creation/update/retention dates, existing contact/amount facts and bounded guild scope. Allocation events and staff evidence are omitted.';
  case 'community.contributions.receipts':return 'Own matched receipt relationships and original creation/retention dates. Expired receipts remain only while allocated to live own weeks, with the existing minimized allocated/retired amount relationship. Payer/source identifiers and observers are omitted.';
  case 'contributionDecisions':return 'Closed recognized actions, original time/retention deadline, bounded guild scope and exact own subject/actor relation. Own weeks are selected separately; no week join, counterpart identity or staff evidence is included.';
  case 'community.trials.trials':return 'Own live trial status/reason and original row dates, including creation. Creator, reviewer and sponsor identities are omitted.';
  case 'community.restrictions.cases':return 'Own retained restriction metadata and original update date; the nullable lifetime stays exactly as stored. This is no current permission or standing judgment. Staff identities and operational keys are omitted.';
  case 'community.departures.departures':return 'Own retained departure metadata: row creation and observed departure are separate original dates. Staff, proof and case keys are omitted.';
  case 'verification.inviteQueue':return 'Own queue metadata and nullable lastWatcherHoldAt, refreshed on watcher polls. It is not an original claim or invitation date. The claimant, officers and notes are omitted.';
  case 'community.event_delivery.publications':return 'Current stored actor-associated publication row, stored start/row dates and removal-pending flag. Actor association can change while original row creation remains; no immutable original actor or publication attempt history is claimed. Payload and provider pointers are omitted.';
  case 'community.event_reminders.reminders':return 'Current stored actor-associated reminder row. lastSchedulerConsideredAt records scheduler consideration, which may precede eligibility checks and any provider attempt; zero stays null. Actor can change while original row creation remains. No immutable original actor, lifetime consent or send-attempt history is claimed. Credentials and pointers are omitted.';
  case 'community.councillor_verification.betaFernWindows':return 'Own retained actor/requester relationship and original window dates. Actor-only bounded native rank and requester-only request dates remain separate. Operational identifiers, counterpart details and credentials are omitted. OFF or expiry grants no reuse; FK children or unresolved provider debt can retain historical rows. This is selected metadata, not every field or erasure evidence.';
  default:return null;
 }
}
export function ownCopyRankFacts(r:Record<string,unknown>,name='native_rank_name'){
 const nativeRank=ownCopyInt(r.native_rank,0,9,true),rankName=ownCopyText(r[name],64,true);
 if((nativeRank===null)!==(rankName===null))return ownCopyRefuse();
 return {native_rank:nativeRank,[name]:rankName};
}
export function ownCopyProofFacts(r:Record<string,unknown>){
 if(r.own_part==='signer'){
  if(r.requester_name!==null||r.native_rank!==null||r.rank_name!==null)return ownCopyRefuse();
  return {requester_name:null,native_rank:null,rank_name:null};
 }
 if(r.own_part!=='requester')return ownCopyRefuse();
 const rank=ownCopyRankFacts(r,'rank_name');if(rank.native_rank===null)return ownCopyRefuse();
 return {requester_name:ownCopyText(r.requester_name,60),...rank};
}
export function projectOwnDirectoryCopy(kind:'professions'|'alts',r:Record<string,unknown>){
 if(kind==='professions')return {name:ownCopyEnum(r.profession,['alchemy','blacksmithing','enchanting','engineering','herbalism','leatherworking','mining','skinning','tailoring','cooking','fishing','first_aid']),skill:ownCopyInt(r.skill,0,450,true),updatedAt:ownCopyDate(r.updated_at)};
 return {name:ownCopyText(r.name,40),status:ownCopyEnum(r.status,['claimed','officer_confirmed','rejected']),proof:ownCopyEnum(r.proof,['self','keeper']),claimedAt:ownCopyDate(r.claimed_at),reviewedAt:ownCopyDate(r.reviewed_at,true),updatedAt:ownCopyDate(r.updated_at)};
}
export function projectOwnEventCopy(kind:'signups'|'created'|'attendance',r:Record<string,unknown>){
 const id=ownCopyText(kind==='created'?r.id:r.event_id,22);if(!/^[A-Za-z0-9_-]{22}$/.test(id as string))return ownCopyRefuse();
 if(kind==='signups'){const remind=ownCopyInt(r.remind_mention,0,1);if(remind===null||(r.decision===null)!==(r.decided_at===null))return ownCopyRefuse();return {eventId:id,title:ownCopyText(r.title,80,true),startsAt:ownCopyDate(r.starts_at,true),status:ownCopyEnum(r.status,['yes','tentative','no']),character:ownCopyText(r.character_name,40,true),raidRole:ownCopyEnum(r.raid_role,['tank','healer','damage'],true),rsvpStartsAt:ownCopyDate(r.rsvp_starts_at),updatedAt:ownCopyDate(r.updated_at),remindMention:remind===1,decision:ownCopyEnum(r.decision,['accepted','bench','declined'],true),decidedAt:ownCopyDate(r.decided_at,true)};}
 if(kind==='attendance')return {eventId:id,title:ownCopyText(r.title,80,true),startsAt:ownCopyDate(r.starts_at,true),state:ownCopyEnum(r.state,['present','absent','excused','unknown']),source:ownCopyEnum(r.source,['officer','observed']),reasonCode:ownCopyEnum(r.reason_code,['late','left_early'],true),recordedAt:ownCopyDate(r.recorded_at)};
 let roleTargets:Record<string,number>|null=null;
 if(r.role_targets!==null){
  if(typeof r.role_targets!=='string'||r.role_targets.length>128)return ownCopyRefuse();
  let parsed:unknown;try{parsed=JSON.parse(r.role_targets);}catch{return ownCopyRefuse();}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!['tank','healer','damage'].includes(k)))return ownCopyRefuse();
  const p=parsed as Record<string,unknown>;roleTargets={tank:ownCopyInt(p.tank??0,0,100)!,healer:ownCopyInt(p.healer??0,0,100)!,damage:ownCopyInt(p.damage??0,0,100)!};
 }
 const duration=ownCopyInt(r.duration_min,15,720)!;
 if(typeof r.starts_at!=='number'||r.ends_at!==r.starts_at+duration*60)return ownCopyRefuse();
 return {id,title:ownCopyText(r.title,80),startsAt:ownCopyDate(r.starts_at),status:ownCopyEnum(r.status,['scheduled','cancelled']),createdAt:ownCopyDate(r.created_at),updatedAt:ownCopyDate(r.updated_at),endsAt:ownCopyDate(r.ends_at),durationMin:duration,capacity:ownCopyInt(r.capacity,1,100,true),roleTargets,retainUntil:ownCopyDate(r.retain_until)};
}

type CoverageKind='selected'|'collection'|'derived'|'gap'|'shared'|'case'|'anonymous'|'unattributable';
export type AccountCoverageMode='identify'|'ordinary';
interface StoreCoverage {store:string;label:string;coverage:CoverageKind;collections:readonly string[];description:string;handling:string}
const rows:StoreCoverage[]=[
 {
  "store": "audit",
  "label": "Audit",
  "coverage": "selected",
  "collections": [
   "actions"
  ],
  "description": "Account actor/subject action and time only; controlled reference-only or character-attributed rows are omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "bnet_characters",
  "label": "Bnet characters",
  "coverage": "collection",
  "collections": [
   "verification.battleNetCharacters"
  ],
  "description": "Separate identity-only download of fresh historical own character name/realm/level/original fetch time. The dormant connector stays off; character and Battle.net account IDs/tags are withheld.",
  "handling": "Not in the aggregate or ordinary copy. Reconnect Discord at /privacy/access and select this individual history. Missing, filtered and expired records do not prove no data is retained; attended review remains available."
 },
 {
  "store": "characters",
  "label": "Characters",
  "coverage": "selected",
  "collections": [
   "verification.characters"
  ],
  "description": "Own status/name/source/dates; GUID and normalized keys withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_alt_claims",
  "label": "Alt claims",
  "coverage": "selected",
  "collections": [
   "community.directory.alts"
  ],
  "description": "Own directly attributed name/status/proof and original claim/review/update dates, including rows without a profile; reviewer withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_contribution_allocation_events",
  "label": "Contribution allocation events",
  "coverage": "derived",
  "collections": [],
  "description": "Amounts contribute to own obligation/receipt sums; no allocation event history.",
  "handling": "Only an own amount summary is included. Individual allocation events and counterpart payment evidence need attended review."
 },
 {
  "store": "community_contribution_decisions",
  "label": "Contribution decisions",
  "coverage": "selected",
  "collections": [
   "contributionDecisions"
  ],
  "description": "Closed action/original time/retention deadline/bounded guild scope and own actor/subject relation, four exact actor forms. Own weeks are selected separately; no optional week join or counterpart identity.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_contribution_evidence",
  "label": "Contribution evidence",
  "coverage": "shared",
  "collections": [],
  "description": "Guild-period evidence state is not an independently owned account row.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_contribution_horizons",
  "label": "Contribution horizons",
  "coverage": "shared",
  "collections": [],
  "description": "Guild retention/admission horizons; no own row.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_contribution_members",
  "label": "Contribution members",
  "coverage": "gap",
  "collections": [],
  "description": "Own revision/internal version control row is not included directly.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "community_contribution_obligations",
  "label": "Contribution obligations",
  "coverage": "selected",
  "collections": [
   "community.contributions.obligations"
  ],
  "description": "Own live-week amounts/contact dates/state/eligibility, original created/updated/retention dates and derived paid sums.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_contribution_policies",
  "label": "Contribution policies",
  "coverage": "shared",
  "collections": [],
  "description": "Shared versioned dues rules, not own records.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_contribution_receipts",
  "label": "Contribution receipts",
  "coverage": "selected",
  "collections": [
   "community.contributions.receipts"
  ],
  "description": "Own matched retained relationship, original created/retention dates and safe amount/allocation/credit figures; expired allocated relations stay minimized.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_craft_offers",
  "label": "Craft offers",
  "coverage": "selected",
  "collections": [
   "community.directory.crafts"
  ],
  "description": "Own profession/recipe/update; normalized recipe key omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_departure_reviews",
  "label": "Departure reviews",
  "coverage": "selected",
  "collections": [
   "community.departures.departures"
  ],
  "description": "Own character/kind/status and original observation/creation/review/retention dates; staff and proof/case keys omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_departure_scan",
  "label": "Departure scan",
  "coverage": "shared",
  "collections": [],
  "description": "Global scan continuation names are not own account evidence.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "community_event_attendance",
  "label": "Event attendance",
  "coverage": "selected",
  "collections": [
   "community.events.attendance"
  ],
  "description": "Own attendance state/source/reason/date with nullable event context; recorder withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_changes",
  "label": "Event changes",
  "coverage": "selected",
  "collections": [
   "eventChanges"
  ],
  "description": "Own actor event/action/time/changed-field names only.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_deliveries",
  "label": "Event deliveries",
  "coverage": "selected",
  "collections": [
   "community.event_delivery.publications"
  ],
  "description": "Current stored actor-associated publication state/start/removal pending/row dates/result. Actor can change while original creation time stays; no original-actor or attempt history. Payload/pointers omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_reminders",
  "label": "Event reminders",
  "coverage": "selected",
  "collections": [
   "community.event_reminders.reminders"
  ],
  "description": "Current stored actor-associated reminder state/start/row dates, last scheduler consideration and removal-pending flag. Zero consideration stays null; this is not a send-attempt or lifetime consent history. Credentials/pointers omitted. A sent reminder keeps the ids of the members it mentioned; an erasure replaces that member's id with a placeholder and marks the reminder for removal; the list is not copied here (your own reminder-mention choice is in your sign-up copy).",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_event_signups",
  "label": "Event signups",
  "coverage": "selected",
  "collections": [
   "community.events.signups"
  ],
  "description": "Own signup/status/character/raid role/update, original answered-for start, reminder-mention choice and the organizer's roster decision with its date (the deciding organizer withheld); missing event context stays null.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_events",
  "label": "Events",
  "coverage": "selected",
  "collections": [
   "community.events.created"
  ],
  "description": "Own created event ID/title/status, original dates, duration/capacity and closed role targets; free-text details withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_privacy_cases",
  "label": "Privacy cases",
  "coverage": "case",
  "collections": [],
  "description": "Case credential possession, not subject_hint, identifies an existing conversation. Not in identify download.",
  "handling": "Use the saved case ID and private code at /privacy/case. A subject hint or Discord connection does not grant access to a case."
 },
 {
  "store": "community_privacy_messages",
  "label": "Privacy messages",
  "coverage": "case",
  "collections": [],
  "description": "Existing case messages available via case credentials; not in identify copy.",
  "handling": "Use the saved case ID and private code at /privacy/case. A subject hint or Discord connection does not grant access to a case."
 },
 {
  "store": "community_privacy_operations",
  "label": "Privacy operations",
  "coverage": "case",
  "collections": [],
  "description": "Case idempotency/private write credentials/digests, not own identify credentials.",
  "handling": "Use the saved case ID and private code at /privacy/case. A subject hint or Discord connection does not grant access to a case."
 },
 {
  "store": "community_professions",
  "label": "Professions",
  "coverage": "selected",
  "collections": [
   "community.directory.professions"
  ],
  "description": "Own directly attributed profession/skill/update, including rows without a profile.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_profiles",
  "label": "Profiles",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own public ref/listed/main/role/revision and original creation/update/departure dates.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_refs",
  "label": "Refs",
  "coverage": "selected",
  "collections": [
   "aggregate singleton",
   "aggregate singleton"
  ],
  "description": "Own public pseudonym ref and its original creation date.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_restriction_cases",
  "label": "Restriction cases",
  "coverage": "selected",
  "collections": [
   "community.restrictions.cases"
  ],
  "description": "Own closed category/dates/appeal/outcome/active, original update and exact nullable lifetime; null remains indefinite when stored. Staff identity and operational keys withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_restriction_characters",
  "label": "Restriction characters",
  "coverage": "selected",
  "collections": [
   "community.restrictions.watchList"
  ],
  "description": "Own linked case character/watch dates/renewal reason.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_restriction_periods",
  "label": "Restriction periods",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own watch-list opened/deadline/renewal summary.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "community_trials",
  "label": "Trials",
  "coverage": "selected",
  "collections": [
   "community.trials.trials"
  ],
  "description": "Own live trial outcome/reason and original start/creation/update/review/retention dates; supporting staff and creator relationships omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "councillor_challenges",
  "label": "Councillor challenges",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.challenges"
  ],
  "description": "Own signer purpose-like mode/quota/time/use metadata.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "councillor_keys",
  "label": "Councillor keys",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.councillorKeys"
  ],
  "description": "Own key ID/signerGUID/time/revocation; public key/control fields omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "intro_locks",
  "label": "Intro locks",
  "coverage": "shared",
  "collections": [],
  "description": "Guild lock holder is an operation token, not a proved account owner.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "intro_posts",
  "label": "Intro posts",
  "coverage": "shared",
  "collections": [],
  "description": "Shared bot-owned public intros/pointers/hash, no personal owner column.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "invite_queue",
  "label": "Invite queue",
  "coverage": "selected",
  "collections": [
   "verification.inviteQueue"
  ],
  "description": "Own name/status/attempts/dates/closed reason and nullable last refreshed watcher-hold date. This is not an original claim or invite date; notes/officers/claimant omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "members",
  "label": "Members",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own verification flags, Discord names/dates and original genuine activity date; stale Battle.net facts remain filtered.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "pending",
  "label": "Pending",
  "coverage": "selected",
  "collections": [
   "verification.codeRequests"
  ],
  "description": "Own name/creation/expiry/consumption/source; private write credential/code material omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_access_grants",
  "label": "Privacy access grants",
  "coverage": "selected",
  "collections": [
   "community.privacy_access.connections"
  ],
  "description": "Own purpose/creation/expiry/consumption.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_access_oauth",
  "label": "Privacy access oauth",
  "coverage": "anonymous",
  "collections": [],
  "description": "State/browser hashes have no account link in this schema.",
  "handling": "This short-lived browser flow has no stored account owner. Authentication material is not downloaded."
 },
 {
  "store": "privacy_denial_markers",
  "label": "Privacy denial markers",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own keyed rejection time/deadline/closed reason.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_provider_messages",
  "label": "Privacy provider messages",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.providerCleanup"
  ],
  "description": "Own JSON-subject cleanup purpose/state/request/time/deadline summary.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_restore_replay",
  "label": "Privacy restore replay",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.recoverySuppression"
  ],
  "description": "Own erased/deadline/scope/recovery-custody metadata.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_serving_jobs",
  "label": "Privacy serving jobs",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.erasureRequests"
  ],
  "description": "Own request state/hold/staff-access/dates/deadline.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "privacy_subjects",
  "label": "Privacy subjects",
  "coverage": "selected",
  "collections": [
   "privacyLifecycle.subjectRecord"
  ],
  "description": "Own lifecycle record presence, state and original creation/update/erasure/retention dates. Generation and revision credentials are omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "relays",
  "label": "Relays",
  "coverage": "gap",
  "collections": [],
  "description": "Officer/client online and version metadata not in own copy; officer_id is character name key.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "rename_holds",
  "label": "Rename holds",
  "coverage": "selected",
  "collections": [
   "verification.renameRecords"
  ],
  "description": "Own old/new/state/decision/closure dates; operator/action keys withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "role_settlements",
  "label": "Role settlements",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.roleOutcomes"
  ],
  "description": "Own outcome/state/reason/attempt/dates and bounded native rank facts; provider pointers/proof/generation controls withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "roster_effect_runs",
  "label": "Roster effect runs",
  "coverage": "gap",
  "collections": [],
  "description": "Shared per-snapshot run counters; no direct own download.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_effects",
  "label": "Roster effects",
  "coverage": "collection",
  "collections": [
   "verification.rosterEffects"
  ],
  "description": "Separate identity-only download of own original-generation intent kind/name/recorded processing time before provider work and nullable parent-run creation time. Missing original generation refuses; legacy null-generation rows need attended review. This is not provider role-settlement proof.",
  "handling": "Not in the aggregate or ordinary copy. Reconnect Discord at /privacy/access and select this individual history. Missing, filtered and expired records do not prove no data is retained; attended review remains available."
 },
 {
  "store": "roster_first_seen",
  "label": "Roster first seen",
  "coverage": "gap",
  "collections": [],
  "description": "Name-only original first-seen data, no account row.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_members",
  "label": "Roster members",
  "coverage": "gap",
  "collections": [],
  "description": "Raw guild snapshot rows/officer notes excluded.",
  "handling": "Not in this download. Ask an Olympus officer for an attributable safe summary or attended account-data review; expired data is not reconstructed."
 },
 {
  "store": "roster_snapshots",
  "label": "Roster snapshots",
  "coverage": "shared",
  "collections": [],
  "description": "Guild source/trust/count/hash snapshots, no own owner.",
  "handling": "Shared service state, not a separately attributable account record. Applicable public context or attended review may be available."
 },
 {
  "store": "ruleset_publications",
  "label": "Ruleset publications",
  "coverage": "selected",
  "collections": [
   "community.ruleset_publication.operations"
  ],
  "description": "Own actor closed selection/state/time summaries; shared guild payload/custody omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "seen_interactions",
  "label": "Seen interactions",
  "coverage": "unattributable",
  "collections": [],
  "description": "Only interaction ID/time/cached response; no persisted account owner.",
  "handling": "No stored account-owner relation. The service does not infer ownership from names or raw response text."
 },
 {
  "store": "site_applications",
  "label": "Website applications",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own submitted answers/status/create/update/review date; staff reviewer and notes withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_board_votes",
  "label": "Website board votes",
  "coverage": "selected",
  "collections": [
   "site.boardVotes"
  ],
  "description": "Own role/vote/dates; candidate ID withheld.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_friends",
  "label": "Website friends",
  "coverage": "selected",
  "collections": [
   "site.friends"
  ],
  "description": "Own chosen label/note/date; friend key/kind omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_news_notices",
  "label": "Website news notices",
  "coverage": "selected",
  "collections": [
   "community.news.notices"
  ],
  "description": "Own creator/updater ID/title/dates; body omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_news_ops",
  "label": "Website news ops",
  "coverage": "selected",
  "collections": [
   "community.news.deletedNotices"
  ],
  "description": "Own deleted notice ID/post/deadline; private write credential omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_reserved",
  "label": "Website reserved",
  "coverage": "selected",
  "collections": [
   "site.reserved"
  ],
  "description": "Own name/status/dates; staff/queue identifiers omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_settings",
  "label": "Website settings",
  "coverage": "selected",
  "collections": [
   "aggregate singleton",
   "site.settingUpdates"
  ],
  "description": "The ordinary copy includes only your exact Co-Guild Master or Treasurer account-publication association, role, audience and current setting time. Separate identity-only history includes a closed known setting key and original timestamp only when you remain its current last updater. Other values, appointments and counterparts stay withheld; this is not edit history or proof of consent.",
  "handling": "Own exact account-publication associations are selected in the ordinary copy. Reconnect Discord at /privacy/access for separate setting-update metadata. Missing, filtered and expired records do not prove no data is retained; attended review remains available."
 },
 {
  "store": "site_users",
  "label": "Website users",
  "coverage": "selected",
  "collections": [
   "aggregate singleton"
  ],
  "description": "Own account/profile/membership/denial/time summary; session/staff reason/actor omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "site_votes",
  "label": "Website votes",
  "coverage": "selected",
  "collections": [
   "site.votes"
  ],
  "description": "Own ballot/slot/chosen nominee label/reason/dates; nominee key/kind omitted.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "verification_proofs",
  "label": "Verification proofs",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.attestations"
  ],
  "description": "Own involvement/create/expiry metadata; requester-only own character and bounded native rank facts; foreign requester facts withheld from signers.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 },
 {
  "store": "verification_requests",
  "label": "Verification requests",
  "coverage": "selected",
  "collections": [
   "community.councillor_verification.requests"
  ],
  "description": "Own request state/create/expiry/use metadata.",
  "handling": "Selected fields only. Omitted content and staff-related records need attended review; an empty or filtered section is not proof that nothing is retained."
 }
];
rows.push({store:'qr_beta_fern_windows',label:'Named beta verification windows',coverage:'selected',collections:['community.councillor_verification.betaFernWindows'],description:'Own actor/requester relationship and immutable window dates; actor-only bounded native rank or requester-only original request dates.',handling:'Selected retained metadata remains readable after the beta is OFF or the window expires. Window/session/generation/request/review/roster/provider identifiers and counterpart facts are omitted. Original expiry-based cleanup can retain rows while FK children or unresolved provider debt remain. This copy grants no retry, verification, role or opening authority.'},{store:'privacy_rejection_decisions',label:'Original membership rejection',coverage:'derived',collections:['membershipRejection'],description:'Current minimized account mirror, original qualified date and fixed expiry when retained. Independent of the old lifecycle feature flags.',handling:'No staff identity, event key, account birth nonce, HMAC or free text is downloaded. Legacy unknown dates are not inferred; this is not every historical or external copy.'},{store:'privacy_rejection_expiry_control',label:'Rejection expiry control',coverage:'shared',collections:[],description:'A nonpersonal shared native clock and bounded page count.',handling:'No account record or original operation receipt is exposed by the shared control.'});
export const ACCOUNT_DATA_STORES=Object.freeze(rows.map(r=>Object.freeze({...r,collections:Object.freeze(r.collections)})));
const labels:Record<CoverageKind,string>={selected:'Selected own fields',collection:'Separate identity-only download',derived:'Own derived summary',gap:'Attended review',shared:'Shared service state',case:'Saved case credentials',anonymous:'Anonymous browser flow',unattributable:'Attribution unavailable'};
const LIFECYCLE_COPY_STORES=new Set(['privacy_subjects','privacy_serving_jobs','privacy_provider_messages','privacy_restore_replay','privacy_denial_markers']);
function accountCopyStores(mode:AccountCoverageMode,lifecycleRead:boolean):Array<StoreCoverage&{selectedInThisFile:boolean}>{
 return ACCOUNT_DATA_STORES.map(original=>{
  // Identify-only export has no ordinary site.appointmentPublications projection.
  // Its separate metadata history stays available without claiming values in this file.
  const r:StoreCoverage=original.store==='site_settings'&&mode==='identify'?{...original,coverage:'collection',collections:['site.settingUpdates'],
   description:'Separate identity-only download of a closed known setting key and original timestamp only when you remain its current last updater. Values/appointments/counterparts are withheld; this is not edit history or consent evidence.',
   handling:'Not included in this identify-only copy. Reconnect Discord at /privacy/access and select this individual history. Missing, filtered and expired records do not prove no data is retained; attended review remains available.'}:original;
  const unavailable=LIFECYCLE_COPY_STORES.has(r.store)&&!lifecycleRead;
  return {...r,coverage:unavailable?'gap':r.coverage,
   description:unavailable?'Lifecycle records are not included through this connection.':r.description,
   handling:unavailable?'Ask an Olympus officer for attended account-data review. Unavailable projections are not proof that nothing is retained.':r.handling,
   selectedInThisFile:(r.coverage==='selected'||r.coverage==='derived')&&!unavailable};
 });
}
export function accountDataCoverage(mode:AccountCoverageMode,lifecycleRead=true){
 return {schema:'olympus-account-coverage-v1',kind:'curated_partial',mode,totalBusinessStores:ACCOUNT_DATA_STORES.length,allStoresInventoried:true,
  allStoredFieldsDelivered:false,allCopiesIncluded:false,completeErasure:false,
  note:`This inventory accounts for the ${ACCOUNT_DATA_STORES.length} business stores. It describes the selected projections and handling paths, not the existence or count of your records. selectedInThisFile describes a reviewed projection, not returned record presence; feature and retention filters still apply. Complete history flags cover only the selected retained range. Unavailable, filtered and expired records are not reported as zero retained data.`,
  stores:accountCopyStores(mode,lifecycleRead),
  separateSharedControl:{store:'privacy_write_admission',included:false,note:'Shared admission machinery is separate from the inventoried business stores; no control private write credential or account authority is downloaded.'},
  browserCustody:{store:'IndexedDB olympus-attended-beta-v1 / spent',includedInServerCopy:false,serverErasureCanReach:false,localControls:'/static/qr-beta-window-data.html',purpose:'Original one-use named beta attempt; lost replies remain spent',personalFields:['actor account ID','opaque window ID','request code','review digest','generation','session version and expiry','original reservation and cleanup times'],personalRetention:'Fixed 365 days from original local reservation; redacted when local browser controls next run, or earlier by local control; unavailable scripts or offline devices cannot run cleanup',redactedFields:['opaque window ID','spent discriminator'],redactedExpiry:'No automatic expiry grants reuse; the window remains held. This record contains no actor, request, generation or session fields after redaction.'},
  otherCopies:['Discord posts, connections and role assignments','private recovery exports and Cloudflare recovery history','configured independent keyed account-birth/rejection companion; no raw account ID or birth nonce; original rejection facts expire at365 days and separate erasure guard at366 days','operator watcher and game files','previous browser downloads','local councillor signing-key custody','local named beta-attempt custody'],
  help:{attended:'Ask an Olympus officer for account-data review. Staff notes, safety exceptions and other people\'s data require separate review.',case:'/privacy/case',account:'/privacy/account'}};
}
export function accountDataCoverageHtml(lifecycleRead=true,mode:AccountCoverageMode='identify'):string{
 return '<section data-account-coverage-schema="olympus-account-coverage-v1"><h2>What this copy covers</h2><p>Your download remains a curated partial copy. The inventory below accounts for all ' + ACCOUNT_DATA_STORES.length + ' business stores; it does not claim that every stored field or every external, recovery or local copy is included. It lists selected own fields and the handling path for records outside the download. Missing, filtered or expired records are not proof that nothing is retained.</p><p>Ask an Olympus officer for attended account-data review. Existing inbox conversations require their saved case ID and private code at <a href="/privacy/case">Read an existing case</a>. No credential, staff role or guild access is granted by this inventory.</p><details><summary>Review all ' + ACCOUNT_DATA_STORES.length + ' data stores</summary><table><caption>Selected records and remaining handling paths</caption><thead><tr><th scope="col">Data store</th><th scope="col">Download coverage</th><th scope="col">Limits and handling</th></tr></thead><tbody>'+accountCopyStores(mode,lifecycleRead).map(r=>'<tr data-account-store="'+e(r.store)+'"><th scope="row">'+e(r.label)+' <code>'+e(r.store)+'</code></th><td>'+e(labels[r.coverage])+'<p>'+e(r.description)+'</p></td><td>'+e(r.handling)+'</td></tr>').join('')+'</tbody></table></details><p>Browser-only named-test records are separate from this server copy. <a href="/static/qr-beta-window-data.html">Download or remove local attempt details</a> on the device holding them. Personal details use a fixed 365-day local deadline and are redacted when local browser controls next run; only an opaque spent guard remains. Server erasure cannot reach IndexedDB or a downloaded file, and local cleanup grants no retry authority.</p></section>';
}
export const PRIVACY_SUBJECT_COPY_SQL=`SELECT state,created_at,updated_at,erased_at,retain_until FROM privacy_subjects WHERE subject_id=?1 AND CASE WHEN
 state IN('active','retiring','retired') AND typeof(created_at)='integer' AND created_at BETWEEN 0 AND 999999999999
 AND typeof(updated_at)='integer' AND updated_at BETWEEN 0 AND 999999999999
 AND (erased_at IS NULL OR (typeof(erased_at)='integer' AND erased_at BETWEEN 0 AND 999999999999))
 AND (retain_until IS NULL OR (typeof(retain_until)='integer' AND retain_until BETWEEN 0 AND 999999999999))
 AND ((state='retired' AND erased_at IS NOT NULL AND retain_until=erased_at+31622400) OR (state<>'retired' AND retain_until IS NULL))
 THEN 1 ELSE json_extract('privacy_copy_unconfirmed','$') END`;
export const PRIVACY_SUBJECT_COPY_FIELDS=['state','created_at','updated_at','erased_at','retain_until'] as const;
export function projectPrivacySubjectRecord(row:unknown){
 if(row===undefined||row===null)return {recordPresent:false};
 if(typeof row!=='object'||Array.isArray(row))throw new FormError('privacy_copy_unconfirmed',503);
 const r=row as Record<string,unknown>,time=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=999999999999;
 if(!['active','retiring','retired'].includes(r.state as string)||!time(r.created_at)||!time(r.updated_at)||
  !(r.erased_at===null||time(r.erased_at))||!(r.retain_until===null||time(r.retain_until))||
  (r.state==='retired'?(r.erased_at===null||r.retain_until!==(r.erased_at as number)+31622400):r.retain_until!==null))throw new FormError('privacy_copy_unconfirmed',503);
 return {recordPresent:true,state:r.state,createdAt:secondsToIso(r.created_at as number),updatedAt:secondsToIso(r.updated_at as number),erasedAt:r.erased_at===null?null:secondsToIso(r.erased_at as number),retainUntil:r.retain_until===null?null:secondsToIso(r.retain_until as number)};
}
