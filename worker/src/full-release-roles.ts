/** Fresh full-release roles (Revision 4; owner decisions of 16 Oct 2026). Pure: the lane configuration capture, the lane
 * constants and every lane SQL text. No D1, no HTTP, no env read after the capture, no module-load effect.
 * Default OFF: FULL_RELEASE_ROLES and STAFF_TEN_RANK_ROLES absent or "" (staff also "false") select every .160 path; an
 * invalid present value is configured and held, never absent. Lane role IDs are disjoint from the twelve
 * (beta-reset-policy.ts:9-14), so no lane fence can match a twelve row and no twelve statement or bind changes.
 * Codex Root P1s of 16 Oct 2026 (22:44:12 and 23:18:45 UTC), corrected here and in the lane block of role-settlements.ts:
 * P1-A, absence is not custody discharge: an attempted effect (attempts=1) is settled only by its own acknowledged request
 * and confirming read; a later read never closes it, and a row some other path closed by an absence read still fences.
 * P1-B, one staff producer: the staff lane holds while the legacy privileged producer (role-settlements.ts :136-140, :268-272)
 * is reachable, i.e. whenever QR_PRIVILEGED_RANK_MAPPING_ENABLED is "true" (the matrix is in docs/deploy-checklist.md).
 */
import { DB_NOW, sha256 } from './account-generation-contracts';
import { privacyGenerationFenceSql } from './privacy-serving-authority';
import { NATIVE_RANKS } from './qr-phase1';
import { parseNativeRoleMap,privilegedNativeMap } from './native-rank-adapter';
import { BETA_RESET_CUTOFF,BETA_RESET_ROLE_IDS } from './beta-reset-policy';
import { intVar } from './env';

// --- purposes (role_settlements.purpose has no CHECK, schema.sql:980-988). .160 never acts on them: settleRoleIntent
// holds at :272, reconcileRemovalReceipt refuses at :351, continuation and the website batch select old purposes only.
export const FRESH_MEMBERSHIP='fresh_roster_membership';
export const FRESH_RANK='fresh_roster_rank';
export const STAFF_RANK='staff_roster_rank';
export const FRESH_REMOVAL_BAN='fresh_removal_ban';
export const FRESH_REMOVAL_DEPARTURE='fresh_removal_departure';
export const FRESH_REMOVAL_RENAME_HOLD='fresh_removal_rename_hold';
export const FRESH_REMOVAL_BLOCKING_ROLE='fresh_removal_blocking_role';
export const STAFF_REMOVAL_BAN='staff_removal_ban';
export const STAFF_REMOVAL_DEPARTURE='staff_removal_departure';
export const FRESH_GRANT_PURPOSES=Object.freeze([FRESH_MEMBERSHIP,FRESH_RANK] as const);
export const LANE_GRANT_PURPOSES=Object.freeze([FRESH_MEMBERSHIP,FRESH_RANK,STAFF_RANK] as const);
export const FRESH_REMOVAL_PURPOSES=Object.freeze([FRESH_REMOVAL_BAN,FRESH_REMOVAL_DEPARTURE,FRESH_REMOVAL_RENAME_HOLD,FRESH_REMOVAL_BLOCKING_ROLE] as const);
export const STAFF_REMOVAL_PURPOSES=Object.freeze([STAFF_REMOVAL_BAN,STAFF_REMOVAL_DEPARTURE] as const);
export const LANE_REMOVAL_PURPOSES=Object.freeze([...FRESH_REMOVAL_PURPOSES,...STAFF_REMOVAL_PURPOSES] as const);
export const LANE_PURPOSES=Object.freeze([...LANE_GRANT_PURPOSES,...LANE_REMOVAL_PURPOSES] as const);
/** Bot staff custody: our own settled PUT (the rankTargets :138 form) plus the lane's purpose. */
export const STAFF_GRANT_FAMILY=Object.freeze(['verified_privileged_rank','roster_privileged_rank',STAFF_RANK] as const);
/** Staff replacement family (fences §5): an unknown bot Officer PUT or removal blocks a Raid Leader grant. */
export const STAFF_FAMILY=Object.freeze([...STAFF_GRANT_FAMILY,STAFF_REMOVAL_BAN,STAFF_REMOVAL_DEPARTURE] as const);
export type LaneGrantPurpose=typeof LANE_GRANT_PURPOSES[number];
export type LaneRemovalPurpose=typeof LANE_REMOVAL_PURPOSES[number];
export type LanePurpose=typeof LANE_PURPOSES[number];
export const LANE_REASONS=Object.freeze({awaiting:'awaiting_dispatch',dispatching:'dispatching',admitted:'admitted_before_effect',
 expired:'expired_without_dispatch',qualifyHeld:'lane_qualify_held',stale:'lane_intent_stale',currentness:'lane_currentness_changed',
 pastAbsent:'past_effect_absent',observedPresent:'past_effect_observed_present',confirmed:'fresh_server_confirmed',
 absenceBatch:'fresh_server_absence_batch',effectConfirmed:'effect_and_current_server_confirmed',removed:'removed',absent:'absent',
 providerUnknown:'provider_outcome_unknown',removalUnknown:'provider_or_confirmation_unknown',confirmationUnknown:'confirmation_or_admission_unknown',
 compensated:'removed_after_admission_changed',frozen:'frozen_configuration_changed',factsChanged:'original_role_facts_changed',
 compensationParent:'compensation_parent_changed'} as const);
/** Pass audits, written with actor 'system'. state and tick carry the cursors; tick never references a subject. */
export const FRESH_AUDIT=Object.freeze({state:'role.fresh_state',tick:'role.fresh_tick',failed:'role.fresh_failed',configHeld:'role.fresh_config_held',
 grantsHeld:'role.fresh_grants_held',profileHeld:'role.fresh_profile_held',linkMissing:'role.fresh_link_missing'} as const);

// --- time, caps and minimum entries (Revision 4 A4 and budget; values pinned by tests)
export const FRESH_INTERVAL_SECONDS=300; // THROTTLE_SECONDS (restore.ts:96); also the ingest trigger unless the newest snapshot changed
export const FRESH_LEASE_SECONDS=300;
export const FRESH_LEASE_KEY='fullReleaseRolesPass';
export const FRESH_ACK_WINDOW_SECONDS=300;
export const FRESH_BACKOFF_SECONDS=3600;
export const LANE_INTENT_SECONDS=300;
export const LANE_ROSTER_FRESH_SECONDS=600;
export const FRESH_EFFECT_SPACING_MS=250; // restore.ts:299
export const FRESH_CAUSE_ROTATION_PER_PASS=3;
export const FRESH_DEPARTURE_SUBJECTS_PER_PASS=1;
export const FRESH_GRANT_SUBJECTS_PER_PASS=2;
export const STAFF_SUBJECTS_PER_PASS=1;
export const FRESH_PRESENCE_PER_PASS=3;
export const FRESH_EFFECTS_PER_SUBJECT=2;
/** Fixed candidate window per walk and pass, taken before any expensive filter (completeness major 5). */
export const FRESH_WALK_WINDOW=50;
export const FRESH_REMOVAL_MIN_ENTRY=6;
export const FRESH_CAUSE_MIN_ENTRY=7;
export const FRESH_EFFECT_MIN_LEFT=8; // role-settlements.ts:280
export const FRESH_RECONCILE_MIN_LEFT=4; // :275
export const FRESH_CLAIM_MIN_LEFT=2;
export const STAFF_MIN_ENTRY=20; // RANK_CONTINUATION_HTTP_RESERVE semantics (role-rank-continuation.ts:9, :37)
export const LEGACY_BAN_ALLOWANCE=16; // settleMembershipRemoval's own allowance (role-settlements.ts:519)
export const FRESH_EPOCH_FLOOR=BETA_RESET_CUTOFF;
export const FRESH_CONFIG_MAX_BYTES=1024;
/** Codex-gated (activation gate 0): without acceptance a present spent row that is not current stays unknown. */
export const LANE_OBSERVED_PRESENT_ENABLED=false;

// --- configuration capture (A1, Q6). Synchronous, descriptor-based: an accessor or inherited key is never invoked.
export const LANE_CONFIG_KEYS=Object.freeze(['FULL_RELEASE_ROLES','STAFF_TEN_RANK_ROLES','LINKS_NOT_BEFORE','LINKS_NOT_BEFORE_CLOCK_GATED','ROSTER_MIN_MEMBERS','ROSTER_MAX_SHRINK_PCT',
 'ROLE_CALL_BUDGET','GUILD_ID','DISCORD_APP_ID','DISCORD_BOT_TOKEN','ROLE_GUILD_MEMBER','ROLE_OFFICER','ROLE_MODERATOR','ROLE_GUILD_LEADER',
 'ROLE_GUILD_MASTER','ROLE_RAID_LEADER','MEMBERSHIP_RETIRED_ROLE_ID','BLOCKING_ROLE_IDS','INTROS_ROLES','QR_NATIVE_ROLE_MAP',
 'QR_PRIVILEGED_RANK_MAPPING_ENABLED','QR_BETA_FERN_EXCEPTION_ENABLED','PRIVACY_ERASURE_ENABLED'] as const);
type LaneKey=typeof LANE_CONFIG_KEYS[number];
export type LaneFreshMode='absent'|'held'|'removals'|'grants';
export type LaneStaffMode='absent'|'held'|'all'|'raid-leader';
export type LaneFreshConfig=Readonly<{version:1;epoch:string;epochStart:number;grants:boolean;membership:string;native:readonly string[]}>;
export type LaneStaffEntry=Readonly<{idx:number;name:string;role:string}>;
/** One capture per entry (the index.ts watcher thunk, handleInteraction, ingestRoster), taken before any await and passed on.
 * current() is a descriptor witness over every key read; it never throws. Nothing re-reads env configuration later.
 */
export type LaneCapture=Readonly<{
 configured:boolean;fresh:LaneFreshMode;staff:LaneStaffMode;freshReason:string;staffReason:string;
 raw:string|null;cfg:LaneFreshConfig|null;freshIds:readonly string[];guild:string;appId:string;
 floor:number;shrink:number;callLimit:number;linksNotBefore:number;
 staffIds:readonly string[];managedStaff:readonly string[];staffMap:readonly LaneStaffEntry[];blocking:readonly string[];
 current:()=>boolean;
}>;
type LaneSlot=Readonly<{kind:'absent'}>|Readonly<{kind:'held'}>|Readonly<{kind:'value';value:unknown;writable:boolean;enumerable:boolean;configurable:boolean}>;
const ABSENT_SLOT:LaneSlot=Object.freeze({kind:'absent'}),HELD_SLOT:LaneSlot=Object.freeze({kind:'held'});
function laneSlot(env:unknown,key:string):LaneSlot{
 try{
  if(!env||typeof env!=='object')return ABSENT_SLOT; // no property at all: nothing is configured
  const d=Object.getOwnPropertyDescriptor(env,key);
  if(!d)return key in env?HELD_SLOT:ABSENT_SLOT;
  if(!Object.hasOwn(d,'value'))return HELD_SLOT;
  return Object.freeze({kind:'value',value:d.value,writable:!!d.writable,enumerable:!!d.enumerable,configurable:!!d.configurable});
 }catch{return HELD_SLOT;}
}
const sameSlot=(a:LaneSlot,b:LaneSlot):boolean=>a.kind===b.kind&&(a.kind!=='value'||b.kind==='value'&&Object.is(a.value,b.value)
 &&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable);
/** undefined: absent (no key, or an own undefined); null: held (accessor, inherited or not a string). */
const slotText=(s:LaneSlot):string|undefined|null=>s.kind==='absent'?undefined:s.kind==='held'?null:s.value===undefined?undefined:typeof s.value==='string'?s.value:null;
const LANE_ID=/^[1-9][0-9]{16,19}$/,LINKS_DIGITS=/^[1-9][0-9]{8,10}$/,EPOCH_LABEL=/^olympus-full-release-[a-z0-9-]{1,32}$/;
const FRESH_KEYS=['version','epoch','epochStart','grants','membership','native'] as const;
/** A Discord snowflake within 2^64-1, as every owner-supplied fresh ID must be. */
export const laneRoleId=(v:unknown):v is string=>typeof v==='string'&&LANE_ID.test(v)&&BigInt(v)<=18446744073709551615n;
const list=(v:string|undefined)=>(v||'').split(',').map(x=>x.trim()).filter(Boolean);
type FreshCheck=Readonly<{cfg:LaneFreshConfig;reason:''}>|Readonly<{cfg:null;reason:string}>;
/** Tier R: removals, and which IDs are fresh. Canonical compact JSON in key order, eleven distinct new IDs. */
function freshTierR(raw:string,text:(k:LaneKey)=>string|undefined):FreshCheck{
 const fail=(reason:string):FreshCheck=>({cfg:null,reason});
 if(new TextEncoder().encode(raw).length>FRESH_CONFIG_MAX_BYTES)return fail('fresh_config_size');
 let o:unknown;try{o=JSON.parse(raw);}catch{return fail('fresh_config_json');}
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return fail('fresh_config_shape');
 const r=o as Record<string,unknown>;
 if(Object.keys(r).join(',')!==FRESH_KEYS.join(','))return fail('fresh_config_keys');
 if(!Array.isArray(r.native)||r.native.length!==10||r.native.some(x=>typeof x!=='string'))return fail('fresh_config_native');
 if(JSON.stringify({version:r.version,epoch:r.epoch,epochStart:r.epochStart,grants:r.grants,membership:r.membership,native:r.native})!==raw)return fail('fresh_config_not_canonical');
 if(r.version!==1)return fail('fresh_config_version');
 if(typeof r.epoch!=='string'||!EPOCH_LABEL.test(r.epoch))return fail('fresh_config_epoch');
 if(typeof r.epochStart!=='number'||!Number.isSafeInteger(r.epochStart)||r.epochStart<FRESH_EPOCH_FLOOR)return fail('fresh_config_epoch_start');
 if(typeof r.grants!=='boolean')return fail('fresh_config_grants');
 const ids=[r.membership,...r.native as string[]];
 if(!ids.every(laneRoleId)||new Set(ids).size!==11)return fail('fresh_config_ids');
 const reserved=new Set<string>(BETA_RESET_ROLE_IDS);
 for(const k of ['GUILD_ID','DISCORD_APP_ID','ROLE_GUILD_MEMBER','ROLE_OFFICER','ROLE_MODERATOR','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER','ROLE_RAID_LEADER','MEMBERSHIP_RETIRED_ROLE_ID'] as const){const v=text(k);if(v)reserved.add(v);}
 for(const v of [...list(text('BLOCKING_ROLE_IDS')),...list(text('INTROS_ROLES'))])reserved.add(v);
 const map=text('QR_NATIVE_ROLE_MAP');
 if(map!==undefined&&map!==''){try{for(const id of parseNativeRoleMap(map).roles)reserved.add(id);}catch{return fail('qr_native_map_unparsable');}}
 if(ids.some(id=>reserved.has(id as string)))return fail('fresh_config_reserved_id');
 return {cfg:Object.freeze({version:1,epoch:r.epoch,epochStart:r.epochStart,grants:r.grants,membership:r.membership as string,native:Object.freeze((r.native as string[]).slice())}),reason:''};
}
export function captureLaneConfig(env:unknown):LaneCapture{
 const slots=LANE_CONFIG_KEYS.map(k=>laneSlot(env,k));
 const slot=(k:LaneKey)=>slots[LANE_CONFIG_KEYS.indexOf(k)]!;
 const current=()=>{try{for(let i=0;i<LANE_CONFIG_KEYS.length;i++)if(!sameSlot(slots[i]!,laneSlot(env,LANE_CONFIG_KEYS[i]!)))return false;return true;}catch{return false;}};
 const fullText=slotText(slot('FULL_RELEASE_ROLES')),staffText=slotText(slot('STAFF_TEN_RANK_ROLES'));
 const freshPresent=fullText!==''&&fullText!==undefined,staffPresent=staffText!==''&&staffText!==undefined&&staffText!=='false';
 const descriptorHeld=slots.some(s=>slotText(s)===null);
 const text=(k:LaneKey):string|undefined=>{const v=slotText(slot(k));return v===null?undefined:v;};
 const lnbText=text('LINKS_NOT_BEFORE'),linksNotBefore=lnbText!==undefined&&LINKS_DIGITS.test(lnbText)?Number(lnbText):0;
 const clockGate=slot('LINKS_NOT_BEFORE_CLOCK_GATED');
 const invalidClockGate=clockGate.kind!=='absent'&&(clockGate.kind!=='value'||clockGate.value!=='true'&&clockGate.value!=='false');
 const guildText=text('GUILD_ID'),appText=text('DISCORD_APP_ID'),token=text('DISCORD_BOT_TOKEN');
 const guild=laneRoleId(guildText)?guildText:'',appId=laneRoleId(appText)?appText:'';
 const base=descriptorHeld?'configuration_descriptor_held':invalidClockGate?'links_clock_gate_invalid':!guild||!appId||!token?'discord_configuration':'';
 let fresh:LaneFreshMode='absent',freshReason='absent',cfg:LaneFreshConfig|null=null;
 if(freshPresent){
  if(base){fresh='held';freshReason=base;}
  else if(typeof fullText!=='string'){fresh='held';freshReason='fresh_config_type';}
  else{const r=freshTierR(fullText,text);
   if(!r.cfg){fresh='held';freshReason=r.reason;}
   else{cfg=r.cfg;
    // Tier G: grants also need exact LINKS_NOT_BEFORE digits (db.ts:123 and the Number(...) binds agree), no beta exception, erasure off.
    const g=!cfg.grants?'grants_disabled':!linksNotBefore?'links_not_before_invalid':cfg.epochStart<linksNotBefore?'epoch_before_links_not_before'
     :text('QR_BETA_FERN_EXCEPTION_ENABLED')==='true'?'beta_fern_exception_enabled':text('PRIVACY_ERASURE_ENABLED')==='true'?'erasure_enabled':'';
    fresh=g?'removals':'grants';freshReason=g||'tier_g';}}
 }
 const staffIds=Object.freeze([text('ROLE_GUILD_LEADER')??'',text('ROLE_OFFICER')??'',text('ROLE_RAID_LEADER')??'']);
 let staff:LaneStaffMode='absent',staffReason='absent',managedStaff:readonly string[]=Object.freeze([]),staffMap:readonly LaneStaffEntry[]=Object.freeze([]);
 if(staffPresent){
  const mode=staffText==='true'?'all':staffText==='raid-leader'?'raid-leader':null;
  const reserved=new Set<string>([...BETA_RESET_ROLE_IDS,guild,appId,text('ROLE_GUILD_MEMBER')??'',text('MEMBERSHIP_RETIRED_ROLE_ID')??'',...(cfg?[cfg.membership,...cfg.native]:[])].filter(Boolean));
  let mapRoles:readonly string[]=[];const map=text('QR_NATIVE_ROLE_MAP');if(map){try{mapRoles=parseNativeRoleMap(map).roles;}catch{}}
  // P1-B: legacy rankTargets (:136-140) and settleRoleIntent (:268-272) act on these three IDs exactly when this key is "true",
  // for beta-five and ten-rank alike (QR_RANK_MAPPING_ENABLED only narrows the profile), and the legacy fences
  // (ROSTER_CURRENT :79-80, PROOF_CURRENT :60-61) never see a spent lane PUT. So the two producers never run together.
  const reason=base||(!mode?'staff_switch_invalid':text('QR_PRIVILEGED_RANK_MAPPING_ENABLED')==='true'?'legacy_privileged_producer_reachable'
   :!linksNotBefore?'links_not_before_invalid':linksNotBefore<FRESH_EPOCH_FLOOR?'links_not_before_before_cutoff' // the twelve are granted until the cutoff
   :!staffIds.every(laneRoleId)||new Set(staffIds).size!==3||staffIds.some(id=>reserved.has(id)||mapRoles.includes(id))?'staff_role_configuration':'');
  if(reason||!mode){staff='held';staffReason=reason||'staff_switch_invalid';}
  else{staff=mode;staffReason=mode;managedStaff=Object.freeze(mode==='all'?staffIds.slice():[staffIds[2]!]);
   const wanted=privilegedNativeMap('ten-rank',{ROLE_GUILD_LEADER:staffIds[0]!,ROLE_OFFICER:staffIds[1]!,ROLE_RAID_LEADER:staffIds[2]!});
   staffMap=Object.freeze(NATIVE_RANKS.map((name,idx)=>({idx,name:name as string,role:wanted.wanted(name,idx)}))
    .filter((e):e is LaneStaffEntry=>e.role!==null&&managedStaff.includes(e.role)).map(e=>Object.freeze(e)));}
 }
 const callLimit=Math.min(50,Math.max(4,intVar(text('ROLE_CALL_BUDGET'),40))); // callBudget (roles.ts:90)
 return Object.freeze({configured:fresh!=='absent'||staff!=='absent',fresh,staff,freshReason,staffReason,
  raw:freshPresent&&typeof fullText==='string'?fullText:null,cfg,freshIds:Object.freeze(cfg?[cfg.membership,...cfg.native]:[]),guild,appId,
  floor:intVar(text('ROSTER_MIN_MEMBERS'),0),shrink:intVar(text('ROSTER_MAX_SHRINK_PCT'),10),callLimit,linksNotBefore,
  staffIds,managedStaff,staffMap,blocking:Object.freeze(list(text('BLOCKING_ROLE_IDS'))),current});
}
/** D: the configuration digest stored as request_digest on fresh rows (account-generation-contracts.ts:15). */
export const laneDigest=(raw:string):Promise<string>=>sha256(raw);
/** JS clock gates (SQL ?8<=DB_NOW stays authoritative). Fresh opens at epochStart, staff at LINKS_NOT_BEFORE. */
export function laneClock(cap:LaneCapture,nowSeconds:number):Readonly<{fresh:boolean;grants:boolean;staff:boolean}>{
 const fresh=(cap.fresh==='removals'||cap.fresh==='grants')&&!!cap.cfg&&Number.isSafeInteger(nowSeconds)&&nowSeconds>=cap.cfg.epochStart;
 const staff=(cap.staff==='all'||cap.staff==='raid-leader')&&cap.linksNotBefore>0&&Number.isSafeInteger(nowSeconds)&&nowSeconds>=cap.linksNotBefore;
 return Object.freeze({fresh,grants:fresh&&cap.fresh==='grants',staff});
}
/** ?16: cfg.native in NATIVE_RANKS order for fresh; the three staff IDs (Guild Leader, Officer, Raid Leader) for staff. */
export const laneFamilyJson=(cap:LaneCapture,lane:'fresh'|'staff'):string=>JSON.stringify(lane==='fresh'?cap.cfg?.native??[]:cap.staffIds);
export const laneStaffMapJson=(cap:LaneCapture):string=>JSON.stringify(cap.staffMap);
export const laneManagedJson=(cap:LaneCapture):string=>JSON.stringify(cap.managedStaff);

// --- SQL. Binds are numbered; bindsFor() trims a value list to the highest index a text references (D1 refuses extras).
export function maxBindIndex(sql:string):number{let max=0;for(const m of sql.matchAll(/\?(\d+)/g))max=Math.max(max,Number(m[1]));return max;}
export function bindsFor(sql:string,values:readonly unknown[]):unknown[]{const n=maxBindIndex(sql);if(values.length<n)throw Error('lane_bind_count');return values.slice(0,n);}
const lit=(values:readonly string[])=>values.map(v=>{if(!/^[a-z_]+$/.test(v))throw Error('lane_literal');return `'${v}'`;}).join(',');
const rankNameSql=(index:string,from=0,to=9)=>`CASE ${index} ${NATIVE_RANKS.slice(from,to+1).map((n,i)=>`WHEN ${from+i} THEN '${n}'`).join(' ')} END`;
const STAFF_SLOT_PROBE=privilegedNativeMap('ten-rank',{ROLE_GUILD_LEADER:'10000000000000000',ROLE_OFFICER:'10000000000000001',ROLE_RAID_LEADER:'10000000000000002'});
/** [rank index, slot in ?16] of privilegedNativeMap('ten-rank') (native-rank-adapter.ts:20-26): 0->0, 2->1, 4->2. */
const STAFF_RANK_SLOTS=NATIVE_RANKS.map((name,idx)=>[idx,STAFF_SLOT_PROBE.roles.indexOf(STAFF_SLOT_PROBE.wanted(name,idx)??'')] as const).filter(([,slot])=>slot>=0);
const GEN=privacyGenerationFenceSql(2,6);
const ID_J="json_extract(j.value,'$.id')",ROLE_J="json_extract(j.value,'$.role')",DESIRED_J="json_extract(j.value,'$.desired')",PURPOSE_J="json_extract(j.value,'$.purpose')";
const SPENT=(a:string)=>`${a}.attempts=1 AND ${a}.state IN('dispatching','unknown')`;
/** P1-A: an attempted effect closed by a later read rather than by its own acknowledged request: .160 settleRoleIntent :277
 * (held past_effect_absent) and :296-297 on a DELETE (absent while current), reconcileRemovalReceipt :367 (settled absent or
 * membership_retirement_absent; the erasure debt visit and the rank continuation reach it), and the same texts of the earlier
 * lane build. Its request may still land after that read and after any successor, so it keeps fencing like a spent row.
 * Presence-only closes of an attempted PUT are uncertain for the same reason: the lost request may land again later.
 * Only acknowledged closes (removed, effect_and_current_server_confirmed) and attempts=0 rows are resolved.
 */
const ABSENCE_CLOSED=(a:string)=>`${a}.attempts=1 AND ((${a}.state='held' AND ${a}.reason='past_effect_absent')
 OR (${a}.state='settled' AND ${a}.reason IN('absent','membership_retirement_absent','fresh_server_confirmed','past_effect_observed_present')))`;
/** Unresolved physical custody: spent, or closed by an absence read (P1-A). */
export const unresolvedSql=(a:string)=>`((${SPENT(a)}) OR (${ABSENCE_CLOSED(a)}))`;
/** Spent and due for an outcome read: expired, and never observed or last observed FRESH_BACKOFF_SECONDS ago. */
const spentDueSql=(a:string)=>`${SPENT(a)} AND ${a}.expires_at<=${DB_NOW} AND (${a}.checked_at IS NULL OR ${a}.checked_at<=${DB_NOW}-${FRESH_BACKOFF_SECONDS})`;
const noLaterSettledRemovalSql=(h:string,x:string)=>`NOT EXISTS(SELECT 1 FROM role_settlements ${x} WHERE ${x}.subject=${h}.subject AND ${x}.guild_id=${h}.guild_id AND ${x}.role_id=${h}.role_id
 AND ${x}.id<>${h}.id AND ${x}.desired=0 AND ${x}.state='settled' AND ${x}.created_at>=${h}.created_at)`;

/** §1. One matching row suffices, so it is weaker than identifyNativeProfile (note f); it errs toward keeping roles. */
export const tenRankEvidenceSql=(x:string)=>`EXISTS(SELECT 1 FROM roster_members z WHERE z.snapshot_id=${x}.id AND z.rank_index BETWEEN 5 AND 9 AND z.rank=${rankNameSql('z.rank_index',5,9)})`;
/** §2. Grant eligibility only: the floor plus the shrink check against the previous LIVE complete export, never a beta row. */
export const liveBaselineSql=(s:string,floor='?12',shrink='?15',epoch='?8')=>`${s}.member_count>=${floor} AND NOT EXISTS(SELECT 1 FROM roster_snapshots lbp WHERE lbp.id=(SELECT lbq.id FROM roster_snapshots lbq
 WHERE lbq.id<${s}.id AND lbq.complete=1 AND lbq.exported_at>=${epoch} AND ${tenRankEvidenceSql('lbq')} ORDER BY lbq.id DESC LIMIT 1) AND (lbp.member_count-${s}.member_count)*100>${shrink}*lbp.member_count)`;
/** §3. ROSTER_CURRENT :72-77, :80 with stored trust replaced by the live baseline and the role-blind :78-79 removed.
 * Binds: ?1 roster ?2 subject ?3 guid ?4 rank name ?5 rank ?6 generation ?8 lane epoch ?12 floor ?15 shrink.
 * Privacy generation, ban and rename hold stay subject-wide (Codex point 3).
 */
export const LANE_ROSTER_CURRENT=`EXISTS(SELECT 1 FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id JOIN characters c ON c.guid=r.guid AND c.discord_id=?2
 WHERE s.id=?1 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.exported_at<=${DB_NOW} AND s.exported_at>${DB_NOW}-${LANE_ROSTER_FRESH_SECONDS}
 AND ?8>0 AND ?8<=${DB_NOW} AND s.exported_at>=?8 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
 AND ${tenRankEvidenceSql('s')} AND ${liveBaselineSql('s')}
 AND r.guid=?3 AND r.rank=?4 AND r.rank_index=?5 AND c.status='member'
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=?3)=1 AND (SELECT COUNT(*) FROM characters WHERE guid=?3 AND status IN('member','left_pending'))=1
 AND ${GEN} AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply'))`;
/** §4. The physical (subject, guild, role) fence: any purpose, either desired value, no epoch/digest/roster/generation filter.
 * P1-A: on unresolved custody, so a spent row and an attempted row closed by an absence read both fence (an earlier uncertain
 * PUT or DELETE may still land after a successor). It is in every guard, so M2 never confirms past an uncertain removal. */
export const targetFenceSql=(S:string,G:string,R:string,I:string)=>`NOT EXISTS(SELECT 1 FROM role_settlements u WHERE u.subject=${S} AND u.guild_id=${G} AND u.role_id=${R} AND u.id<>${I} AND ${unresolvedSql('u')})`;
/** In flight (not yet expired) or observed within FRESH_BACKOFF_SECONDS and still unresolved, or closed by an absence read
 * (P1-A: fenced until an attended resolution, so never worth a visit): a walk skips that target. */
const targetStuckSql=(S:string,G:string,R:string)=>`EXISTS(SELECT 1 FROM role_settlements ts WHERE ts.subject=${S} AND ts.guild_id=${G} AND ts.role_id=${R}
 AND ((${SPENT('ts')} AND (ts.expires_at>${DB_NOW} OR ts.checked_at>${DB_NOW}-${FRESH_BACKOFF_SECONDS})) OR (${ABSENCE_CLOSED('ts')})))`;
/** §5. Rank-replacement dependency (desired=1 rank rows only), historical targets included through role history. */
export const rankFamilyFenceSql=(S:string,G:string,I:string,lane:'fresh'|'staff',family='?16')=>`NOT EXISTS(SELECT 1 FROM role_settlements u WHERE u.subject=${S} AND u.guild_id=${G} AND u.id<>${I} AND ${unresolvedSql('u')}
 AND (u.role_id IN(SELECT value FROM json_each(${family})) OR EXISTS(SELECT 1 FROM role_settlements f WHERE f.subject=u.subject AND f.guild_id=u.guild_id AND f.role_id=u.role_id
 AND f.purpose IN(${lit(lane==='fresh'?[FRESH_RANK]:STAFF_FAMILY)}))))`;
const rankOrderException=(o:string,c:Readonly<{guild:string;generation:string;guid:string;profile:string;rank:string;rankName:string}>)=>`NOT(${o}.state='held'
 AND ((${o}.attempts=0 AND (${o}.reason='lane_qualify_held' OR (${o}.reason='expired_without_dispatch' AND ${o}.expires_at<=${DB_NOW})))
 OR (${o}.attempts=1 AND ${o}.claim_nonce IS NOT NULL AND ${o}.reason='claimed_not_dispatched'))
 AND ${o}.guild_id=${c.guild} AND ${o}.subject_generation IS ${c.generation} AND ${o}.native_guid IS ${c.guid}
 AND ${o}.native_profile IS ${c.profile} AND ${o}.native_rank IS ${c.rank} AND ${o}.native_rank_name IS ${c.rankName})`;
/** §6 (the :287-291 analogue). A never-dispatched marker or expired row of the same facts no longer blocks (completeness minor). */
export const laneRankOrderSql=(purpose:typeof FRESH_RANK|typeof STAFF_RANK)=>`NOT EXISTS(SELECT 1 FROM role_settlements old JOIN role_settlements current ON current.id=?7
 WHERE old.subject=current.subject AND old.desired=0 AND old.state<>'settled' AND old.purpose='${purpose}' AND old.roster_id=current.roster_id
 AND ${rankOrderException('old',{guild:'current.guild_id',generation:'current.subject_generation',guid:'current.native_guid',profile:'current.native_profile',rank:'current.native_rank',rankName:'current.native_rank_name'})})`;
/** Producer form. Sibling rows of one INSERT...SELECT do not see each other; the consumer form enforces the order. */
export const laneRankOrderProducerSql=(purpose:typeof FRESH_RANK|typeof STAFF_RANK)=>`NOT EXISTS(SELECT 1 FROM role_settlements old
 WHERE old.subject=?2 AND old.desired=0 AND old.state<>'settled' AND old.purpose='${purpose}' AND old.roster_id=?1
 AND ${rankOrderException('old',{guild:'?11',generation:'?6',guid:'?3',profile:"'ten-rank'",rank:'?5',rankName:'?4'})})`;
/** §7. A removal created at or after the grant (a ban and unban inside 300 s) holds the stale grant. */
export const GRANT_AFTER_REMOVAL=`NOT EXISTS(SELECT 1 FROM role_settlements x JOIN role_settlements cur ON cur.id=?7
 WHERE x.subject=cur.subject AND x.guild_id=cur.guild_id AND x.role_id=cur.role_id AND x.desired=0 AND x.id<>cur.id AND x.created_at>=cur.created_at)`;
export const grantAfterRemovalProducerSql=(R:string)=>`NOT EXISTS(SELECT 1 FROM role_settlements x WHERE x.subject=?2 AND x.guild_id=?11 AND x.role_id=${R} AND x.desired=0 AND x.created_at>=${DB_NOW})`;

/** §8. The accepted consumption sources (whisper, mail and the review.ts:85 card forms), never banned/refused/unbind/rename/lifecycle. */
export const acceptedSourceSql=(lp:string)=>`(${lp}.consumed_source IN('whisper','mail') OR (${lp}.consumed_source GLOB 'whisper:card:[1-9]*' AND length(${lp}.consumed_source) BETWEEN 30 AND 33
 AND substr(${lp}.consumed_source,14) NOT GLOB '*[^0-9]*') OR (${lp}.consumed_source GLOB 'mail:card:[1-9]*' AND length(${lp}.consumed_source) BETWEEN 27 AND 30
 AND substr(${lp}.consumed_source,11) NOT GLOB '*[^0-9]*'))`;
/** ACK_FOR (Q3): the watcher's acknowledgement within FRESH_ACK_WINDOW_SECONDS, tied to this consumption: no other consumption
 * of the same account and name in between, a same-second tie refused. Malformed details raise no SQL error. */
export const ackForSql=(lp:string)=>`EXISTS(SELECT 1 FROM audit ak WHERE ak.ts>=${lp}.consumed_at AND ak.ts<=${lp}.consumed_at+${FRESH_ACK_WINDOW_SECONDS}
 AND ak.actor='watcher' AND ak.action IN('verify.confirmed','verify.already_linked') AND ak.subject=${lp}.name
 AND (CASE WHEN json_valid(ak.details) THEN json_extract(ak.details,'$.discordId') END)=${lp}.discord_id
 AND NOT EXISTS(SELECT 1 FROM pending lp2 WHERE lp2.discord_id=${lp}.discord_id AND lp2.name_key=${lp}.name_key AND lp2.id<>${lp}.id
 AND lp2.consumed_at>=${lp}.consumed_at AND lp2.consumed_at<=ak.ts))`;
type LinkArgs=Readonly<{lane:'fresh'|'staff';c:string;subject:string;epoch:string;digest:string;generation:string}>;
/** Route 1 (an acknowledged accepted consumption at or after the lane epoch) or Route 2 (a settled lane grant on the GUID). */
export const laneLinkedCharacterSql=(a:LinkArgs)=>`(EXISTS(SELECT 1 FROM pending lp WHERE lp.discord_id=${a.subject} AND lp.name_key=${a.c}.name_key
 AND lp.consumed_at>=${a.epoch} AND lp.consumed_at<=${DB_NOW} AND ${acceptedSourceSql('lp')} AND ${ackForSql('lp')})
 OR EXISTS(SELECT 1 FROM role_settlements pg WHERE pg.subject=${a.subject} AND pg.native_guid=${a.c}.guid AND pg.desired=1 AND pg.state='settled'
 AND pg.purpose IN(${lit(a.lane==='fresh'?FRESH_GRANT_PURPOSES:[STAFF_RANK])})${a.lane==='fresh'?` AND pg.request_digest=${a.digest}`:''} AND pg.subject_generation IS ${a.generation}))`;
/** LANE_LINK for the consumer and the producers (?14 the bound accepted pending id, or NULL for Route 2). */
export const laneLinkSql=(lane:'fresh'|'staff')=>`EXISTS(SELECT 1 FROM characters lc WHERE lc.discord_id=?2 AND lc.guid=?3 AND lc.status='member' AND (
 (?14 IS NOT NULL AND EXISTS(SELECT 1 FROM pending lp WHERE lp.id=?14 AND lp.discord_id=?2 AND lp.name_key=lc.name_key
 AND lp.consumed_at>=?8 AND lp.consumed_at<=${DB_NOW} AND ${acceptedSourceSql('lp')} AND ${ackForSql('lp')}))
 OR (?14 IS NULL AND EXISTS(SELECT 1 FROM role_settlements pg WHERE pg.subject=?2 AND pg.native_guid=?3 AND pg.desired=1 AND pg.state='settled'
 AND pg.purpose IN(${lit(lane==='fresh'?FRESH_GRANT_PURPOSES:[STAFF_RANK])})${lane==='fresh'?' AND pg.request_digest=?13':''} AND pg.subject_generation IS ?6))))`;
/** The newest acknowledged accepted consumption of this character. Binds: ?1 subject ?2 guid ?3 lane epoch. */
export const LANE_PICK_ACCEPTED=`SELECT lp.id FROM characters lc JOIN pending lp ON lp.discord_id=lc.discord_id AND lp.name_key=lc.name_key
 WHERE lc.discord_id=?1 AND lc.guid=?2 AND lc.status='member' AND lp.consumed_at>=?3 AND lp.consumed_at<=${DB_NOW}
 AND ${acceptedSourceSql('lp')} AND ${ackForSql('lp')} ORDER BY lp.consumed_at DESC,lp.id DESC LIMIT 1`;
/** Owner round 3, "Highest-ranked one": the lowest rank_index (ties by GUID) among linked member characters listed once.
 * fresh binds: ?1 snapshot ?2 subject ?3 generation ?4 epochStart ?5 D.
 * staff binds: ?1 snapshot ?2 subject ?3 generation ?4 LINKS_NOT_BEFORE ?5 the mode's staff map JSON: the lowest
 * staff-mapped character of the same verified set (completeness minor), with its mapped role.
 */
export function primaryPickSql(lane:'fresh'|'staff'):string{
 const link=laneLinkedCharacterSql({lane,c:'c',subject:'?2',epoch:'?4',digest:'?5',generation:'?3'});
 return lane==='fresh'?`SELECT r.guid,r.rank,r.rank_index FROM characters c JOIN roster_members r ON r.snapshot_id=?1 AND r.name_key=c.name_key AND r.guid=c.guid
 WHERE c.discord_id=?2 AND c.status='member' AND c.guid IS NOT NULL AND r.rank_index BETWEEN 0 AND 9 AND r.rank=${rankNameSql('r.rank_index')}
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=?1 AND guid=r.guid)=1 AND ${link}
 ORDER BY r.rank_index,r.guid LIMIT 1`:`SELECT r.guid,r.rank,r.rank_index,json_extract(m.value,'$.role') AS role FROM characters c
 JOIN roster_members r ON r.snapshot_id=?1 AND r.name_key=c.name_key AND r.guid=c.guid
 JOIN json_each(?5) m ON json_extract(m.value,'$.idx')=r.rank_index AND json_extract(m.value,'$.name')=r.rank
 WHERE c.discord_id=?2 AND c.status='member' AND c.guid IS NOT NULL
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=?1 AND guid=r.guid)=1 AND ${link}
 ORDER BY r.rank_index,r.guid LIMIT 1`;
}
/** Staff wanted_any: the lowest staff-mapped member character listed on the snapshot, linked or not; its role is never
 * removed. Binds: ?1 snapshot ?2 subject ?3 the mode's staff map JSON. */
export const STAFF_WANTED_ANY=`SELECT r.guid,r.rank,r.rank_index,json_extract(m.value,'$.role') AS role FROM characters c
 JOIN roster_members r ON r.snapshot_id=?1 AND r.name_key=c.name_key AND r.guid=c.guid
 JOIN json_each(?3) m ON json_extract(m.value,'$.idx')=r.rank_index AND json_extract(m.value,'$.name')=r.rank
 WHERE c.discord_id=?2 AND c.status='member' AND c.guid IS NOT NULL ORDER BY r.rank_index,r.guid LIMIT 1`;
/** The highest-ranked listed member character, linked or not: the facts a staff removal row carries. Binds: ?1 snapshot ?2 subject. */
export const LANE_LISTED_TOP=`SELECT r.guid,r.rank,r.rank_index FROM characters c JOIN roster_members r ON r.snapshot_id=?1 AND r.name_key=c.name_key AND r.guid=c.guid
 WHERE c.discord_id=?2 AND c.status='member' AND c.guid IS NOT NULL AND r.rank_index BETWEEN 0 AND 9 AND r.rank=${rankNameSql('r.rank_index')}
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=?1 AND guid=r.guid)=1 ORDER BY r.rank_index,r.guid LIMIT 1`;

/** §10. A character is live-seen with a GUID that a lane grant row names (producers write those only on live ten-rank
 * snapshots), or that a complete ten-rank snapshot exported at or after E lists under the same name. */
export const liveSeenSql=(c:string,E:string)=>`(${c}.guid IS NOT NULL AND (EXISTS(SELECT 1 FROM role_settlements g WHERE g.subject=${c}.discord_id
 AND g.purpose IN(${lit(LANE_GRANT_PURPOSES)}) AND g.native_guid=${c}.guid)
 OR (${E}>0 AND EXISTS(SELECT 1 FROM roster_snapshots ls WHERE ls.id>=(SELECT MIN(f.id) FROM roster_snapshots f WHERE f.exported_at>=${E}) AND ls.exported_at>=${E}
 AND ls.complete=1 AND EXISTS(SELECT 1 FROM roster_members lr WHERE lr.snapshot_id=ls.id AND lr.name_key=${c}.name_key AND lr.guid=${c}.guid)
 AND ${tenRankEvidenceSql('ls')}))))`;
/** The departure cause (owner: characters never seen on a live roster are ignored). No roster-absence term: an
 * authoritative 'left' removes roles even while the newest roster still lists the character. */
export const departedSql=(X:string,E:string)=>`NOT EXISTS(SELECT 1 FROM characters dc WHERE dc.discord_id=${X} AND dc.status IN('member','left_pending') AND ${liveSeenSql('dc',E)})`;
/** Selection only: a proven superset of departedSql (the newest-snapshot fact implies fact (b)). */
export const departurePrefilterSql=(X:string,E:string)=>`NOT EXISTS(SELECT 1 FROM characters pc WHERE pc.discord_id=${X} AND pc.status IN('member','left_pending') AND pc.guid IS NOT NULL AND (
 EXISTS(SELECT 1 FROM role_settlements pgr WHERE pgr.subject=pc.discord_id AND pgr.purpose IN(${lit(LANE_GRANT_PURPOSES)}) AND pgr.native_guid=pc.guid)
 OR EXISTS(SELECT 1 FROM roster_snapshots n JOIN roster_members nr ON nr.snapshot_id=n.id AND nr.name_key=pc.name_key AND nr.guid=pc.guid
 WHERE n.id=(SELECT MAX(id) FROM roster_snapshots) AND n.complete=1 AND n.exported_at>=${E} AND ${tenRankEvidenceSql('n')})))`;
/** Staff departure only: a beta officer never seen on a live roster has not left the live guild. */
export const everLiveSql=(X:string,E:string)=>`(EXISTS(SELECT 1 FROM role_settlements eg WHERE eg.subject=${X} AND eg.purpose IN(${lit(LANE_GRANT_PURPOSES)}) AND eg.native_guid IS NOT NULL)
 OR (${E}>0 AND EXISTS(SELECT 1 FROM characters ec WHERE ec.discord_id=${X} AND ec.guid IS NOT NULL AND EXISTS(SELECT 1 FROM roster_snapshots els
 WHERE els.id>=(SELECT MIN(ef.id) FROM roster_snapshots ef WHERE ef.exported_at>=${E}) AND els.exported_at>=${E} AND els.complete=1
 AND EXISTS(SELECT 1 FROM roster_members elr WHERE elr.snapshot_id=els.id AND elr.name_key=ec.name_key AND elr.guid=ec.guid) AND ${tenRankEvidenceSql('els')}))))`;

/** §11. Fresh custody: a settled or spent fresh grant on the target with no later settled removal (R omitted: any target). */
export const freshHeldGrantSql=(X:string,G:string,R?:string)=>`EXISTS(SELECT 1 FROM role_settlements h WHERE h.subject=${X} AND h.guild_id=${G}${R?` AND h.role_id=${R}`:''} AND h.desired=1
 AND h.purpose IN(${lit(FRESH_GRANT_PURPOSES)}) AND (h.state='settled' OR (${SPENT('h')})) AND ${noLaterSettledRemovalSql('h','hx')})`;
/** Settled only (completeness major 2): a spent grant never counts as satisfied, so its subject is revisited and reconciled. */
export const freshSettledGrantSql=(X:string,G:string,R?:string)=>`EXISTS(SELECT 1 FROM role_settlements sg WHERE sg.subject=${X} AND sg.guild_id=${G}${R?` AND sg.role_id=${R}`:''} AND sg.desired=1
 AND sg.purpose IN(${lit(FRESH_GRANT_PURPOSES)}) AND sg.state='settled' AND ${noLaterSettledRemovalSql('sg','sgx')})`;
/** Our own settled staff PUT with no later settled removal. A role first observed present, re-added after a bot removal
 * or assigned by hand is never in custody. */
export const staffCustodySql=(X:string,G:string,R:string)=>`EXISTS(SELECT 1 FROM role_settlements sh WHERE sh.subject=${X} AND sh.guild_id=${G} AND sh.role_id=${R}
 AND sh.desired=1 AND sh.attempts=1 AND sh.state='settled' AND sh.purpose IN(${lit(STAFF_GRANT_FAMILY)}) AND ${noLaterSettledRemovalSql('sh','shx')})`;
/** Bans only (owner decision): the bot's own removals do not end custody, so a bot-given staff role that reappears while
 * the ban stands is removed again. An observed absence outside a ban removal still ends it. */
export const staffBanCustodySql=(X:string,G:string,R:string)=>`EXISTS(SELECT 1 FROM role_settlements bh WHERE bh.subject=${X} AND bh.guild_id=${G} AND bh.role_id=${R}
 AND bh.desired=1 AND bh.attempts=1 AND bh.state='settled' AND bh.purpose IN(${lit(STAFF_GRANT_FAMILY)})
 AND NOT EXISTS(SELECT 1 FROM role_settlements bx WHERE bx.subject=bh.subject AND bx.guild_id=bh.guild_id AND bx.role_id=bh.role_id
 AND bx.id<>bh.id AND bx.desired=0 AND bx.state='settled' AND bx.created_at>=bh.created_at AND bx.purpose<>'${STAFF_REMOVAL_BAN}'
 AND NOT(bx.attempts=1 AND bx.purpose IN(${lit([STAFF_REMOVAL_DEPARTURE,...STAFF_GRANT_FAMILY])}))))`;
const freshHeldDueSql=(X:string,G:string)=>`EXISTS(SELECT 1 FROM role_settlements fh WHERE fh.subject=${X} AND fh.guild_id=${G} AND fh.desired=1
 AND fh.purpose IN(${lit(FRESH_GRANT_PURPOSES)}) AND (fh.state='settled' OR (${SPENT('fh')})) AND ${noLaterSettledRemovalSql('fh','fhx')}
 AND NOT ${targetStuckSql('fh.subject','fh.guild_id','fh.role_id')})`;
const staffCustodyDueSql=(X:string,G:string,managed:string)=>`EXISTS(SELECT 1 FROM json_each(${managed}) sm WHERE ${staffCustodySql(X,G,'sm.value')} AND NOT ${targetStuckSql(X,G,'sm.value')})`;

/** Major 3. Every live-seen member/left_pending character of the account is listed on snapshot N. */
export const accountSnapshotCompleteSql=(X:string,N:string,E:string)=>`NOT EXISTS(SELECT 1 FROM characters kc WHERE kc.discord_id=${X} AND kc.status IN('member','left_pending')
 AND ${liveSeenSql('kc',E)} AND NOT EXISTS(SELECT 1 FROM roster_members kr WHERE kr.snapshot_id=${N} AND kr.name_key=kc.name_key AND kr.guid=kc.guid))`;
/** The lane role a listed rank maps to, or NULL: fresh cfg.native[index]; staff the Guild Master/Officer/Raid Leader slots of ?16. */
export const laneRoleForRankSql=(lane:'fresh'|'staff',idx:string,name:string,family='?16')=>lane==='fresh'
 ?`(CASE WHEN ${name}=${rankNameSql(idx)} THEN json_extract(${family},'$['||CAST(${idx} AS INTEGER)||']') END)`
 :`(CASE ${STAFF_RANK_SLOTS.map(([i,slot])=>`WHEN ${idx}=${i} AND ${name}='${NATIVE_RANKS[i]}' THEN json_extract(${family},'$[${slot}]')`).join(' ')} END)`;
/** Major 3. Authority to remove an unwanted held rank or staff role R: the snapshot lists every live-seen character of the
 * account, or every open settled grant of R names a character that is listed with a rank not mapping to R or has left
 * the status machine. A missing main, or a grant without a recorded character, never authorizes a removal from an
 * incomplete snapshot; the visit is then grant-only.
 */
export function rankRemovalAuthoritySql(lane:'fresh'|'staff',X:string,G:string,N:string,R:string,E:string,family='?16'):string{
 const open=`SELECT 1 FROM role_settlements ja WHERE ja.subject=${X} AND ja.guild_id=${G} AND ja.role_id=${R} AND ja.desired=1 AND ja.state='settled'
 AND ja.purpose IN(${lit(lane==='fresh'?[FRESH_RANK]:STAFF_GRANT_FAMILY)}) AND ${noLaterSettledRemovalSql('ja','jax')}`;
 return `(${accountSnapshotCompleteSql(X,N,E)} OR (EXISTS(${open}) AND NOT EXISTS(${open} AND (ja.native_guid IS NULL OR EXISTS(SELECT 1 FROM characters jc
 WHERE jc.discord_id=${X} AND jc.guid=ja.native_guid AND jc.status IN('member','left_pending') AND NOT EXISTS(SELECT 1 FROM roster_members jr
 WHERE jr.snapshot_id=${N} AND jr.name_key=jc.name_key AND jr.guid=jc.guid AND ${laneRoleForRankSql(lane,'jr.rank_index','jr.rank',family)} IS NOT ${R}))))))`;
}

// --- §9 the lane consumer (settleLaneIntent). Binds (laneParams): ?1 roster ?2 subject ?3 guid ?4 rank name ?5 rank
// ?6 generation ?7 row id ?8 lane epoch ?9 nonce ?10 role ?11 guild ?12 floor ?13 D (staff NULL) ?14 accepted pending id
// ?15 shrink ?16 family IDs JSON. Not appended: :285, :287-291 and betaGrantSql (lane roles are never twelve).
export type LaneKind=Readonly<{lane:'fresh'|'staff';purpose:LaneGrantPurpose;desired:0|1}>;
export function laneKind(purpose:string,desired:number):LaneKind{
 if(purpose===FRESH_MEMBERSHIP&&desired===1)return Object.freeze({lane:'fresh',purpose,desired});
 if((purpose===FRESH_RANK||purpose===STAFF_RANK)&&(desired===0||desired===1))return Object.freeze({lane:purpose===FRESH_RANK?'fresh':'staff',purpose,desired});
 throw Error('lane_kind');
}
export type LaneParamInput=Readonly<{rosterId:number;subject:string;guid:string;rankName:string;rank:number;generation:string|null;id:string;
 epoch:number;nonce:string|null;role:string;guild:string;floor:number;digest:string|null;pending:number|null;shrink:number;family:readonly string[]}>;
export const laneParams=(p:LaneParamInput):unknown[]=>[p.rosterId,p.subject,p.guid,p.rankName,p.rank,p.generation,p.id,p.epoch,p.nonce,p.role,
 p.guild,p.floor,p.digest,p.pending,p.shrink,JSON.stringify(p.family)];
export function laneIntentPredicateSql(k:LaneKind):string{
 const parts=[LANE_ROSTER_CURRENT,targetFenceSql('?2','?11','?10','?7')];
 if(k.purpose!==FRESH_MEMBERSHIP)parts.push(`?4=${rankNameSql('?5')} AND ?10 ${k.desired===1?'IS':'IS NOT'} ${laneRoleForRankSql(k.lane,'?5','?4')}`);
 if(k.purpose!==FRESH_MEMBERSHIP&&k.desired===1)parts.push(rankFamilyFenceSql('?2','?11','?7',k.lane),laneRankOrderSql(k.purpose));
 if(k.desired===1)parts.push(GRANT_AFTER_REMOVAL,laneLinkSql(k.lane));
 if(k.desired===0){if(k.lane==='staff')parts.push(staffCustodySql('?2','?11','?10'));parts.push(rankRemovalAuthoritySql(k.lane,'?2','?11','?1','?10','?8'));}
 return parts.join('\n AND ');
}
export const laneIntentCurrentSql=(k:LaneKind)=>`SELECT 1 WHERE ${laneIntentPredicateSql(k)}`;
/** The guard for claim, admission, receipt and fresh_server_confirmed; valid inside UPDATE role_settlements only. */
export const laneGuardSql=(k:LaneKind)=>`${laneIntentPredicateSql(k)} AND ?9 IS NOT NULL AND request_digest ${k.lane==='fresh'?'=?13':'IS NULL'}`;
export const laneUpdateSql=(k:LaneKind,set:string,extra='')=>`UPDATE role_settlements SET ${set} WHERE id=?7 AND ${laneGuardSql(k)} ${extra} RETURNING id`;
/** The settleRoleIntent :293-318 statements in lane form. confirm closes only a never-dispatched row. A later presence or
 * absence read never discharges an attempted PUT or DELETE; confirmSpent is only an observation stamp. The two unknown
 * texts retain the original custody contract (binds ?1 id ?2 nonce). */
export function laneConsumerSql(k:LaneKind){
 const spentExpired=`AND attempts=1 AND state IN('dispatching','unknown') AND expires_at<=${DB_NOW}`;
 return Object.freeze({
  current:laneIntentCurrentSql(k),
  confirm:laneUpdateSql(k,`state='settled',reason='fresh_server_confirmed',checked_at=${DB_NOW}`,`AND state='pending' AND attempts=0`),
  confirmSpent:laneUpdateSql(k,`checked_at=${DB_NOW}`,spentExpired),
  claim:laneUpdateSql(k,`state='dispatching',attempts=1,claim_nonce=?9,reason='dispatching'`,`AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}`),
  admit:laneUpdateSql(k,`reason='admitted_before_effect'`,`AND claim_nonce=?9 AND state='dispatching'`),
  receipt:laneUpdateSql(k,`state='settled',reason='effect_and_current_server_confirmed',checked_at=${DB_NOW}`,`AND claim_nonce=?9`),
  providerUnknown:`UPDATE role_settlements SET state='unknown',reason='provider_outcome_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`,
  confirmationUnknown:`UPDATE role_settlements SET state='unknown',reason='confirmation_or_admission_unknown' WHERE id=?1 AND claim_nonce=?2`,
 });
}
/** This invocation knows it never called the provider. Only its unique claimed nonce may be closed; a lost reply to this
 * write remains unresolved and never authorizes another effect. No current config or privacy generation can rewrite a peer. */
export const LANE_CLAIM_NOT_DISPATCHED=`UPDATE role_settlements SET state='held',reason='claimed_not_dispatched',checked_at=${DB_NOW}
 WHERE id=?1 AND claim_nonce=?2 AND attempts=1 AND state='dispatching' RETURNING id`;

// --- §12 lane removals. Binds: ?1 op id ?2 subject ?3 purpose ?4 guild ?5 role ?6 generation ?7 lane epoch ?8 D or NULL
// ?9 plan JSON [{id,role}] ?10 nonce ?11 roster id (blocking only) or NULL. The cause is re-evaluated in every statement.
const removalCauseSql=(purpose:LaneRemovalPurpose)=>purpose===FRESH_REMOVAL_BAN||purpose===STAFF_REMOVAL_BAN?`EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)`
 :purpose===FRESH_REMOVAL_DEPARTURE?departedSql('?2','?7'):purpose===STAFF_REMOVAL_DEPARTURE?`${departedSql('?2','?7')} AND ${everLiveSql('?2','?7')}`
 :purpose===FRESH_REMOVAL_RENAME_HOLD?`EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply')`:'1=1'; // blocking: the fresh member read in code (:494)
export function laneRemovalSql(purpose:LaneRemovalPurpose){
 if(!(LANE_REMOVAL_PURPOSES as readonly string[]).includes(purpose))throw Error('lane_removal_purpose');
 const cause=`?3='${purpose}' AND ?7>0 AND ?7<=${DB_NOW} AND ${removalCauseSql(purpose)} AND ${GEN}`;
 const auth=(R:string)=>`(${cause}${purpose===STAFF_REMOVAL_BAN?` AND ${staffBanCustodySql('?2','?4',R)}`:purpose===STAFF_REMOVAL_DEPARTURE?` AND ${staffCustodySql('?2','?4',R)}`:''})`;
 // A standing ban may remove a separately acknowledged bot grant without discharging any older uncertain request.
 // A read-only close, never-dispatched row or lost PUT is not this custody. Non-ban removal keeps the full target fence.
 const fence=(R:string,I:string)=>{
  const original=targetFenceSql('?2','?4',R,I);
  if(purpose!==FRESH_REMOVAL_BAN&&purpose!==STAFF_REMOVAL_BAN)return original;
  const family=purpose===FRESH_REMOVAL_BAN?FRESH_GRANT_PURPOSES:STAFF_GRANT_FAMILY;
  return `(${original} OR EXISTS(SELECT 1 FROM role_settlements ack WHERE ack.subject=?2 AND ack.guild_id=?4 AND ack.role_id=${R}
 AND ack.desired=1 AND ack.attempts=1 AND ack.state='settled' AND ack.reason='effect_and_current_server_confirmed' AND ack.purpose IN(${lit(family)})
 AND NOT EXISTS(SELECT 1 FROM role_settlements later WHERE later.subject=ack.subject AND later.guild_id=ack.guild_id AND later.role_id=ack.role_id
 AND later.desired=0 AND later.state='settled' AND later.created_at>=ack.created_at AND later.purpose<>'${purpose}')))`;
 };
 return Object.freeze({
  precheck:`SELECT 1 WHERE ${cause}`,
  disposal:`UPDATE role_settlements SET state='held',reason='expired_without_dispatch' WHERE subject=?2 AND purpose=?3 AND guild_id=?4
 AND role_id IN(SELECT json_extract(value,'$.role') FROM json_each(?9)) AND desired=0 AND state='pending' AND attempts=0 AND expires_at<=${DB_NOW}`,
  insert:`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,roster_id,created_at,expires_at)
SELECT ${ID_J},?2,?3,?4,${ROLE_J},0,'pending','awaiting_dispatch',?6,?8,?11,${DB_NOW},${DB_NOW}+${LANE_INTENT_SECONDS} FROM json_each(?9) j
WHERE ${auth(ROLE_J)} AND ${fence(ROLE_J,ID_J)}
 AND NOT EXISTS(SELECT 1 FROM role_settlements o WHERE o.subject=?2 AND o.purpose=?3 AND o.guild_id=?4 AND o.role_id=${ROLE_J} AND o.state<>'settled'
 AND NOT(o.state='held' AND ((o.reason='expired_without_dispatch' AND o.attempts=0) OR (o.reason='claimed_not_dispatched' AND o.attempts=1 AND o.claim_nonce IS NOT NULL))))`,
  /** The group's claimable rows. Binds: ?1 subject ?2 purpose ?3 guild ?4 generation ?5 roles JSON. */
  rows:`SELECT id,role_id FROM role_settlements WHERE subject=?1 AND purpose=?2 AND guild_id=?3 AND subject_generation IS ?4 AND desired=0
 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND role_id IN(SELECT value FROM json_each(?5)) ORDER BY created_at,id LIMIT 14`,
  absent:`UPDATE role_settlements SET state='settled',reason='absent',checked_at=${DB_NOW} WHERE id=?1 AND subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5
 AND desired=0 AND state='pending' AND attempts=0 AND ${auth('?5')} AND ${fence('?5','?1')} RETURNING id`,
  claim:`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='dispatching' WHERE id=?1 AND subject=?2 AND purpose=?3 AND guild_id=?4
 AND role_id=?5 AND desired=0 AND subject_generation IS ?6 AND request_digest IS ?8 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}
 AND ${auth('?5')} AND ${fence('?5','?1')} RETURNING id`,
  proof:`SELECT 1 WHERE ${auth('?5')} AND ${fence('?5','?1')} AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?1 AND subject=?2 AND purpose=?3
 AND guild_id=?4 AND role_id=?5 AND desired=0 AND subject_generation IS ?6 AND state='dispatching' AND attempts=1 AND claim_nonce=?10 AND expires_at>${DB_NOW})`,
  receipt:`UPDATE role_settlements SET state='settled',reason='removed',checked_at=${DB_NOW} WHERE id=?1 AND subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5
 AND claim_nonce=?10 AND state='dispatching' AND attempts=1 AND ${auth('?5')} RETURNING id`,
  failure:`UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?10 AND state='dispatching'`,
 });
}

// --- §13 exact-tuple statements. TUPLE binds: ?1 id ?2 subject ?3 guild ?4 role ?5 purpose ?6 desired ?7 attempts ?8 state
// ?9 claim_nonce ?10 created_at ?11 expires_at ?12 subject_generation ?13 request_digest. None validates D or the managed set:
// a spent row closes by outcome read even after D or a fresh role ID changed (completeness major 4, the :264 escape).
export const LANE_TUPLE=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose=?5 AND desired=?6 AND attempts=?7 AND state=?8
 AND claim_nonce IS ?9 AND created_at=?10 AND expires_at=?11 AND subject_generation IS ?12 AND request_digest IS ?13`;
export type LaneTupleRow=Readonly<{id:string;subject:string;guild_id:string;role_id:string;purpose:string;desired:number;attempts:number;state:string;
 claim_nonce:string|null;created_at:number;expires_at:number;subject_generation:string|null;request_digest:string|null}>;
export const laneTupleBinds=(r:LaneTupleRow):unknown[]=>[r.id,r.subject,r.guild_id,r.role_id,r.purpose,r.desired,r.attempts,r.state,r.claim_nonce,
 r.created_at,r.expires_at,r.subject_generation,r.request_digest];
/** Backoff marker on a never-dispatched lane row held by inventory or hierarchy; it can no longer be claimed. */
export const LANE_MARK_QUALIFY_HELD=`UPDATE role_settlements SET state='held',reason='lane_qualify_held',checked_at=${DB_NOW} WHERE ${LANE_TUPLE}
 AND purpose IN(${lit(LANE_GRANT_PURPOSES)}) AND state='pending' AND attempts=0 RETURNING id`;
// P1-A (Codex 22:44/23:18 UTC, 16 Oct): the earlier build's LANE_SPENT_REMOVAL_ABSENT (settled absent), LANE_PAST_EFFECT_ABSENT
// (held past_effect_absent), LANE_COMPENSATION_CHILD_ABSENT and LANE_COMPENSATION_PARENT_HELD closed an attempted effect from
// an expired source plus an absent read. They are gone: every outcome read below only stamps checked_at, the row stays spent
// (unknown or dispatching) and keeps fencing its target. Only the own acknowledged request (receipt, compensateGrant) settles.
/** Codex-gated (LANE_OBSERVED_PRESENT_ENABLED): not current, present, expired; a PUT only (an uncertain DELETE observed present
 * may still land), and never past an unresolved row on the same target (the M2 rule). */
export const LANE_OBSERVED_PRESENT=`UPDATE role_settlements SET state='settled',reason='past_effect_observed_present',checked_at=${DB_NOW} WHERE ${LANE_TUPLE}
 AND purpose IN(${lit(LANE_GRANT_PURPOSES)}) AND desired=1 AND ${SPENT('role_settlements')} AND expires_at<=${DB_NOW}
 AND ${targetFenceSql('role_settlements.subject','role_settlements.guild_id','role_settlements.role_id','role_settlements.id')} RETURNING id`;
/** A spent row read and left unknown is stamped, so walks skip it for FRESH_BACKOFF_SECONDS instead of re-reading every wrap.
 * Present or absent, this is the only write an outcome read makes (P1-A). */
export const LANE_SPENT_OBSERVED=`UPDATE role_settlements SET checked_at=${DB_NOW} WHERE ${LANE_TUPLE} AND ${SPENT('role_settlements')} AND expires_at<=${DB_NOW}
 AND (purpose IN(${lit(LANE_PURPOSES)}) OR purpose='grant_compensation') RETURNING id`;
/** The spent lane parent of a spent grant_compensation child, stamped with the child (LANE_SPENT_OBSERVED) so both back off;
 * never a state change (P1-A). The :353 parent equalities. Binds: the first four TUPLE values of the child. */
export const LANE_COMPENSATION_PARENT_OBSERVED=`UPDATE role_settlements SET checked_at=${DB_NOW}
 WHERE id=(SELECT request_digest FROM role_settlements WHERE id=?1 AND purpose='grant_compensation' AND desired=0 AND attempts=1)
 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND desired=1 AND ${SPENT('role_settlements')} AND expires_at<=${DB_NOW}
 AND purpose IN(${lit(LANE_GRANT_PURPOSES)}) RETURNING id`;
/** Spent lane rows of one subject, compensation children of lane parents included. Binds: ?1 subject ?2 guild ?3 limit. */
export const LANE_SPENT_ROWS=`SELECT id,subject,purpose,guild_id,role_id,desired,state,attempts,claim_nonce,created_at,expires_at,subject_generation,request_digest,
 roster_id,native_guid,native_profile,native_rank,native_rank_name,reason,checked_at FROM role_settlements
 WHERE subject=?1 AND guild_id=?2 AND ${SPENT('role_settlements')} AND expires_at<=${DB_NOW}
 AND (purpose IN(${lit(LANE_PURPOSES)}) OR (purpose='grant_compensation' AND EXISTS(SELECT 1 FROM role_settlements pp WHERE pp.id=role_settlements.request_digest
 AND pp.purpose IN(${lit(LANE_GRANT_PURPOSES)})))) ORDER BY created_at,id LIMIT ?3`;
/** Departure plan from custody only (major 1): fresh targets in custody, historical lane IDs included. Binds: ?1 subject ?2 guild. */
export const FRESH_CUSTODY_ROLES=`SELECT DISTINCT h.role_id FROM role_settlements h WHERE h.subject=?1 AND h.guild_id=?2 AND h.desired=1
 AND h.purpose IN(${lit(FRESH_GRANT_PURPOSES)}) AND (h.state='settled' OR (${SPENT('h')})) AND ${noLaterSettledRemovalSql('h','hx')} ORDER BY h.role_id LIMIT 24`;
/** The present roles the producer leaves alone: a settled fresh grant with no later settled removal (grant debt's 'satisfied').
 * Binds: ?1 subject ?2 guild ?3 roles JSON. */
export const FRESH_SETTLED_ROLES=`SELECT value AS role FROM json_each(?3) WHERE ${freshSettledGrantSql('?1','?2','value')}`;
/** Managed staff IDs in bot custody. Binds: ?1 subject ?2 guild ?3 managed IDs JSON. ban: the ban custody form. */
export const staffCustodyRolesSql=(ban:boolean)=>`SELECT mid.value AS role_id FROM json_each(?3) mid WHERE ${(ban?staffBanCustodySql:staffCustodySql)('?1','?2','mid.value')}`;

// --- §14 lease. The value holds only {leaseUntil,n}, never a subject ID (privacy-serving-erase.ts:71, :297 scan values).
export const freshLeaseValue=(leaseUntil:number,nonce:string):string=>JSON.stringify({leaseUntil,n:nonce});
export const FRESH_LEASE_ACQUIRE=`INSERT INTO site_settings(key,value,updated_at,updated_by) SELECT '${FRESH_LEASE_KEY}',?1,${DB_NOW},'system:fresh-roles'
 WHERE ${DB_NOW}<json_extract(?1,'$.leaseUntil') ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
 WHERE (CASE WHEN json_valid(site_settings.value) THEN json_extract(site_settings.value,'$.leaseUntil') END)<=${DB_NOW} RETURNING key`;
export const FRESH_LEASE_RELEASE=`UPDATE site_settings SET value='{"leaseUntil":0}',updated_at=${DB_NOW} WHERE key='${FRESH_LEASE_KEY}' AND value=?1 COLLATE BINARY`;
/** The interval read, before any write (an audit_ts range). snapshot_id ($.n) lets the ingest trigger run early on a changed export. */
export const FRESH_INTERVAL_SELECT=`SELECT ts,action,CASE WHEN json_valid(details) THEN json_extract(details,'$.n') END AS snapshot_id FROM audit
 WHERE ts>${DB_NOW}-${FRESH_INTERVAL_SECONDS} AND action IN(${[FRESH_AUDIT.state,FRESH_AUDIT.tick,FRESH_AUDIT.failed,FRESH_AUDIT.configHeld,FRESH_AUDIT.grantsHeld].map(a=>`'${a}'`).join(',')})
 ORDER BY ts DESC,id DESC LIMIT 1`;
/** Cursor state: the newest role.fresh_state or reference-free role.fresh_tick, each through audit_actor_action. */
export const FRESH_STATE_SELECT=`SELECT id,details FROM (SELECT id,details FROM audit WHERE actor='system' AND action='${FRESH_AUDIT.state}' ORDER BY id DESC LIMIT 1)
 UNION ALL SELECT id,details FROM (SELECT id,details FROM audit WHERE actor='system' AND action='${FRESH_AUDIT.tick}' ORDER BY id DESC LIMIT 1) ORDER BY id DESC LIMIT 1`;
export const NEWEST_SNAPSHOT_SELECT='SELECT MAX(id) AS id FROM roster_snapshots';
/** The :110 form; identifyNativeProfile on these rows must return 'ten-rank' before any grant or staff step. */
export const PROFILE_ROWS_SELECT='SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11';

// --- §15 selection walks. Each reads a fixed window of FRESH_WALK_WINDOW candidates after its cursor before any expensive
// filter (major 5) and returns at least one row carrying window_end and window_size, plus the selected subjects (or one row
// with discord_id NULL). Next cursor: the last selected subject when the limit was reached, else window_end, else "" when
// window_size is below the window. PRIV: a missing privacy row is a Discord-only member, held only when a row is not active.
const PRIV_COLUMNS='p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision';
const PRIV_ACTIVE="(p.state IS NULL OR p.state='active')";
const notBannedSql=(X:string)=>`NOT EXISTS(SELECT 1 FROM members mb WHERE mb.discord_id=${X} AND mb.banned=1)`;
const notReapplySql=(X:string)=>`NOT EXISTS(SELECT 1 FROM rename_holds rh WHERE rh.discord_id=${X} AND rh.state='reapply')`;
const characterWindowSql=(window:string)=>`SELECT DISTINCT discord_id AS subject FROM characters WHERE discord_id>?1 ORDER BY discord_id LIMIT ${window}`;
const settlementWindowSql=(window:string)=>`SELECT DISTINCT subject FROM role_settlements WHERE subject>?1 ORDER BY subject LIMIT ${window}`;
const walkSql=(win:string,ctes:string,sel:string)=>`WITH w AS (${win}),bounds AS (SELECT MAX(w.subject) AS window_end,COUNT(*) AS window_size FROM w),${ctes}sel AS (${sel})
SELECT sel.*,bounds.window_end,bounds.window_size FROM bounds LEFT JOIN sel ON 1=1 ORDER BY sel.discord_id`;
/** (f) Hierarchy and blocking backoff on the current snapshot: one visit per changed export or per FRESH_BACKOFF_SECONDS. */
export const backoffSql=(X:string,N:string,lane:'fresh'|'staff')=>`EXISTS(SELECT 1 FROM role_settlements b WHERE b.subject=${X} AND b.roster_id=${N}
 AND COALESCE(b.checked_at,b.created_at)>${DB_NOW}-${FRESH_BACKOFF_SECONDS} AND ((b.state='held' AND b.reason='lane_qualify_held'
 AND b.purpose IN(${lit(lane==='fresh'?FRESH_GRANT_PURPOSES:[STAFF_RANK])}))${lane==='fresh'?` OR b.purpose='${FRESH_REMOVAL_BLOCKING_ROLE}'`:''}))`;
/** (a) M1 cause rotation (the roles.ts:304-308 shape). Binds: ?1 cursor ?2 limit. Rename holds join only while the fresh
 * lane can act (completeness minor); a non-active privacy row is skipped in code and passed by the cursor (:311). */
export const causeRotationSelectSql=(withHolds:boolean)=>`SELECT selected.discord_id,${PRIV_COLUMNS},
 EXISTS(SELECT 1 FROM members m WHERE m.discord_id=selected.discord_id AND m.banned=1) AS banned
FROM (SELECT m.discord_id FROM members m WHERE m.banned=1${withHolds?` UNION SELECT h.discord_id FROM rename_holds h WHERE h.state='reapply'`:''}) selected
LEFT JOIN privacy_subjects p ON p.subject_id=selected.discord_id WHERE selected.discord_id>?1 ORDER BY selected.discord_id LIMIT ?2`;
const spentFreshSql=(X:string,G:string)=>`EXISTS(SELECT 1 FROM role_settlements sd WHERE sd.subject=${X} AND sd.guild_id=${G} AND ${spentDueSql('sd')}
 AND (sd.purpose IN(${lit([...FRESH_GRANT_PURPOSES,...FRESH_REMOVAL_PURPOSES])}) OR (sd.purpose='grant_compensation' AND EXISTS(SELECT 1 FROM role_settlements sdp
 WHERE sdp.id=sd.request_digest AND sdp.purpose IN(${lit(FRESH_GRANT_PURPOSES)})))))`;
const spentDepartureSql=(X:string,G:string)=>`EXISTS(SELECT 1 FROM role_settlements sd WHERE sd.subject=${X} AND sd.guild_id=${G} AND ${spentDueSql('sd')}
 AND sd.purpose IN(${lit([FRESH_REMOVAL_DEPARTURE,STAFF_REMOVAL_DEPARTURE])}))`;
const spentRecentSql=(X:string,G:string)=>`EXISTS(SELECT 1 FROM role_settlements sr WHERE sr.subject=${X} AND sr.guild_id=${G} AND ${SPENT('sr')}
 AND (sr.expires_at>${DB_NOW} OR sr.checked_at>${DB_NOW}-${FRESH_BACKOFF_SECONDS}) AND sr.purpose IN(${lit([...FRESH_GRANT_PURPOSES,...FRESH_REMOVAL_PURPOSES])}))`;
/** Departure events (major 1): a superset of what the departure walk owes (fresh custody, a settled staff PUT of the bot's own,
 * a spent departure removal), applied inside the bounded event window so an event for an account owing nothing costs no
 * statement (the LINKS_NOT_BEFORE release writes one roster.left per released binding). */
export const departureOwedSql=(X:string,G:string)=>`(${freshHeldGrantSql(X,G)} OR EXISTS(SELECT 1 FROM role_settlements oh WHERE oh.subject=${X} AND oh.guild_id=${G}
 AND oh.desired=1 AND oh.attempts=1 AND oh.state='settled' AND oh.purpose IN(${lit(STAFF_GRANT_FAMILY)}) AND ${noLaterSettledRemovalSql('oh','ohx')}) OR ${spentDepartureSql(X,G)})`;
/** (b) Departure walk with the custody term (major 1): fresh custody, or staff custody on a managed ID with EVER_LIVE, or a
 * spent departure removal due for an outcome read. Banned accounts belong to the rotation. A subject owing nothing is
 * never selected, so a historical departure costs no request and never takes the per-pass slot.
 * Binds: ?1 cursor (single: the subject) ?2 epochStart or 0 ?3 LINKS_NOT_BEFORE or 0 (staff inactive) ?4 guild ?5 limit
 * ?6 window ?7 managed staff IDs JSON ('[]' when inactive). single: one subject, e.g. a departure this export just demoted. */
export function departureWalkSelectSql(single=false):string{
 return walkSql(single?'SELECT ?1 AS subject':settlementWindowSql('?6'),'',`SELECT w.subject AS discord_id,${PRIV_COLUMNS},${spentDepartureSql('w.subject','?4')} AS spent
 FROM w LEFT JOIN privacy_subjects p ON p.subject_id=w.subject WHERE ${PRIV_ACTIVE} AND ${notBannedSql('w.subject')}
 AND ((?2>0 AND ${freshHeldDueSql('w.subject','?4')} AND ${departurePrefilterSql('w.subject','?2')})
 OR (?3>0 AND ${staffCustodyDueSql('w.subject','?4','?7')} AND ${departurePrefilterSql('w.subject','?3')} AND ${everLiveSql('w.subject','?3')})
 OR ${spentDepartureSql('w.subject','?4')}) ORDER BY w.subject LIMIT ?5`);
}
const freshPickIndexSql=(X:string,N:string,E:string,D:string,generation:string)=>`(SELECT r2.rank_index FROM characters c2
 JOIN roster_members r2 ON r2.snapshot_id=${N} AND r2.name_key=c2.name_key AND r2.guid=c2.guid
 WHERE c2.discord_id=${X} AND c2.status='member' AND c2.guid IS NOT NULL AND r2.rank_index BETWEEN 0 AND 9 AND r2.rank=${rankNameSql('r2.rank_index')}
 AND ${laneLinkedCharacterSql({lane:'fresh',c:'c2',subject:X,epoch:E,digest:D,generation})} ORDER BY r2.rank_index,r2.guid LIMIT 1)`;
/** (c) Grant debt. Satisfied = settled membership AND the settled wanted rank of the exact link set (major 2 and the
 * PRIMARY_PICK alignment minor; the per-snapshot GUID-uniqueness count is left to PRIMARY_PICK). A subject with a fresh row
 * in flight or observed within the backoff waits for the presence walk.
 * Binds: ?1 cursor ?2 captured newest snapshot ?3 epochStart ?4 guild ?5 membership ?6 cfg.native JSON ?7 limit ?8 window ?9 D. */
export const GRANT_DEBT_SELECT=walkSql(characterWindowSql('?8'),`cand AS MATERIALIZED (SELECT w.subject,${PRIV_COLUMNS},
 ${freshPickIndexSql('w.subject','?2','?3','?9','p.generation')} AS pick FROM w LEFT JOIN privacy_subjects p ON p.subject_id=w.subject
 WHERE ${PRIV_ACTIVE} AND ${notBannedSql('w.subject')} AND ${notReapplySql('w.subject')}),`,`SELECT cand.subject AS discord_id,cand.privacy_generation,cand.privacy_state,cand.privacy_revision
 FROM cand WHERE cand.pick IS NOT NULL AND NOT ${backoffSql('cand.subject','?2','fresh')} AND NOT ${spentRecentSql('cand.subject','?4')}
 AND ((NOT ${freshSettledGrantSql('cand.subject','?4','?5')} AND NOT ${targetStuckSql('cand.subject','?4','?5')}
 AND ${targetFenceSql('cand.subject','?4','?5',"''")})
 OR (NOT ${freshSettledGrantSql('cand.subject','?4',"json_extract(?6,'$['||CAST(cand.pick AS INTEGER)||']')")}
 AND NOT ${targetStuckSql('cand.subject','?4',"json_extract(?6,'$['||CAST(cand.pick AS INTEGER)||']')")}
 AND ${rankFamilyFenceSql('cand.subject','?4',"''",'fresh','?6')}))
 ORDER BY cand.subject LIMIT ?7`);
/** (d) Staff walk: (a) the lowest staff-mapped verified character's role, unless retired by a settled staff-family grant
 * on the same GUID and rank; (b) bot custody on a managed ID that no listed member character maps to, only with removal
 * authority (major 3); (c) spent ten-rank staff rows on any of the three staff IDs due for an outcome read (major 2; after a
 * switch to raid-leader the Officer and Guild Leader rows still close by outcome read, major 4, so they never fence Raid Leader).
 * Binds: ?1 cursor ?2 snapshot ?3 LINKS_NOT_BEFORE ?4 guild ?5 the mode's staff map JSON ?6 limit ?7 managed IDs JSON
 * ?8 window ?9 the three staff IDs JSON. */
export const STAFF_WALK_SELECT=walkSql(characterWindowSql('?8'),`cand AS MATERIALIZED (SELECT w.subject,${PRIV_COLUMNS},
 (SELECT json_object('g',r2.guid,'i',r2.rank_index,'role',json_extract(m2.value,'$.role')) FROM characters c2
 JOIN roster_members r2 ON r2.snapshot_id=?2 AND r2.name_key=c2.name_key AND r2.guid=c2.guid
 JOIN json_each(?5) m2 ON json_extract(m2.value,'$.idx')=r2.rank_index AND json_extract(m2.value,'$.name')=r2.rank
 WHERE c2.discord_id=w.subject AND c2.status='member' AND c2.guid IS NOT NULL
 AND ${laneLinkedCharacterSql({lane:'staff',c:'c2',subject:'w.subject',epoch:'?3',digest:'NULL',generation:'p.generation'})} ORDER BY r2.rank_index,r2.guid LIMIT 1) AS pick,
 EXISTS(SELECT 1 FROM role_settlements sp WHERE sp.subject=w.subject AND sp.guild_id=?4 AND sp.role_id IN(SELECT value FROM json_each(?9))
 AND ${spentDueSql('sp')} AND (sp.purpose='${STAFF_RANK}' OR (sp.purpose IN('verified_privileged_rank','roster_privileged_rank') AND sp.native_profile='ten-rank')
 OR (sp.purpose='grant_compensation' AND EXISTS(SELECT 1 FROM role_settlements spp WHERE spp.id=sp.request_digest AND spp.purpose='${STAFF_RANK}')))) AS spent
 FROM w LEFT JOIN privacy_subjects p ON p.subject_id=w.subject
 WHERE ${PRIV_ACTIVE} AND ${notBannedSql('w.subject')} AND ${notReapplySql('w.subject')} AND NOT ${backoffSql('w.subject','?2','staff')}),`,
`SELECT cand.subject AS discord_id,cand.privacy_generation,cand.privacy_state,cand.privacy_revision,cand.spent FROM cand
 WHERE (cand.pick IS NOT NULL AND NOT ${targetStuckSql('cand.subject','?4',"json_extract(cand.pick,'$.role')")}
 AND ${rankFamilyFenceSql('cand.subject','?4',"''",'staff','?9')}
 AND NOT EXISTS(SELECT 1 FROM role_settlements t WHERE t.subject=cand.subject AND t.guild_id=?4 AND t.role_id=json_extract(cand.pick,'$.role')
 AND t.desired=1 AND t.state='settled' AND t.purpose IN(${lit(STAFF_GRANT_FAMILY)}) AND t.native_guid=json_extract(cand.pick,'$.g')
 AND t.native_rank=json_extract(cand.pick,'$.i') AND ${noLaterSettledRemovalSql('t','tx')}))
 OR EXISTS(SELECT 1 FROM json_each(?7) mid WHERE ${staffCustodySql('cand.subject','?4','mid.value')} AND NOT ${targetStuckSql('cand.subject','?4','mid.value')}
 AND ${targetFenceSql('cand.subject','?4','mid.value',"''")}
 AND EXISTS(SELECT 1 FROM characters bc JOIN roster_members br ON br.snapshot_id=?2 AND br.name_key=bc.name_key AND br.guid=bc.guid WHERE bc.discord_id=cand.subject AND bc.status='member')
 AND NOT EXISTS(SELECT 1 FROM characters bc2 JOIN roster_members br2 ON br2.snapshot_id=?2 AND br2.name_key=bc2.name_key AND br2.guid=bc2.guid
 JOIN json_each(?5) bm ON json_extract(bm.value,'$.idx')=br2.rank_index AND json_extract(bm.value,'$.name')=br2.rank
 WHERE bc2.discord_id=cand.subject AND bc2.status='member' AND json_extract(bm.value,'$.role')=mid.value)
 AND ${rankRemovalAuthoritySql('staff','cand.subject','?4','?2','mid.value','?3','?9')})
 OR cand.spent ORDER BY cand.subject LIMIT ?6`);
/** (e) Presence walk: settled fresh custody of a subject that is not a departure candidate, or a spent fresh row due for an
 * outcome read (major 2: the visit then reconciles even when every wanted role is present).
 * Binds: ?1 cursor ?2 guild ?3 limit ?4 window ?5 epochStart. */
export const PRESENCE_WALK_SELECT=walkSql(settlementWindowSql('?4'),'',`SELECT w.subject AS discord_id,${PRIV_COLUMNS},${spentFreshSql('w.subject','?2')} AS spent
 FROM w LEFT JOIN privacy_subjects p ON p.subject_id=w.subject WHERE ${PRIV_ACTIVE} AND ${notBannedSql('w.subject')} AND ${notReapplySql('w.subject')}
 AND ((${freshSettledGrantSql('w.subject','?2')} AND NOT ${departurePrefilterSql('w.subject','?5')}) OR ${spentFreshSql('w.subject','?2')})
 ORDER BY w.subject LIMIT ?3`);

// --- §16 producers. Binds: laneParams with ?7 '' and ?14 the LANE_PICK_ACCEPTED id (or NULL), then ?17 the plan JSON
// [{id,role,desired,purpose}] and ?18 (fresh: cfg.membership; staff: the mode's managed IDs JSON). Every json_each row is
// fenced on its own; a desired=0 rank or staff row also needs removal authority on the captured snapshot (major 3).
export function laneProducerSql(lane:'fresh'|'staff'){
 const purposes:readonly string[]=lane==='fresh'?FRESH_GRANT_PURPOSES:[STAFF_RANK];
 const roles=lane==='fresh'?`((${PURPOSE_J}='${FRESH_MEMBERSHIP}' AND ${DESIRED_J}=1 AND ${ROLE_J}=?18)
 OR (${PURPOSE_J}='${FRESH_RANK}' AND ${ROLE_J} IN(SELECT value FROM json_each(?16)) AND ${DESIRED_J}=(${ROLE_J} IS ${laneRoleForRankSql('fresh','?5','?4')})))`
  :`(${PURPOSE_J}='${STAFF_RANK}' AND ${ROLE_J} IN(SELECT value FROM json_each(?18)) AND ${DESIRED_J}=(${ROLE_J} IS ${laneRoleForRankSql('staff','?5','?4')}))`;
 const rank=lane==='fresh'?`${PURPOSE_J}='${FRESH_RANK}'`:'1=1',P=lane==='fresh'?FRESH_RANK:STAFF_RANK;
 return Object.freeze({
  disposal:`UPDATE role_settlements SET state='held',reason='expired_without_dispatch'
 WHERE subject=?2 AND guild_id=?11 AND purpose IN(${lit(purposes)}) AND state='pending' AND attempts=0 AND expires_at<=${DB_NOW}
 AND EXISTS(SELECT 1 FROM json_each(?17) j WHERE role_settlements.role_id=${ROLE_J} AND role_settlements.desired=${DESIRED_J} AND role_settlements.purpose=${PURPOSE_J})`,
  insert:`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,created_at,expires_at)
SELECT ${ID_J},?2,${PURPOSE_J},?11,${ROLE_J},${DESIRED_J},'pending','awaiting_dispatch',?6,?13,?1,?3,'ten-rank',?5,?4,${DB_NOW},${DB_NOW}+${LANE_INTENT_SECONDS} FROM json_each(?17) j
 WHERE ?13 ${lane==='fresh'?'IS NOT NULL':'IS NULL'} AND ?4=${rankNameSql('?5')} AND ${roles}
 AND ${LANE_ROSTER_CURRENT} AND ${targetFenceSql('?2','?11',ROLE_J,ID_J)}
 AND NOT EXISTS(SELECT 1 FROM role_settlements o WHERE o.subject=?2 AND o.guild_id=?11 AND o.purpose=${PURPOSE_J} AND o.role_id=${ROLE_J} AND o.desired=${DESIRED_J} AND o.state='pending')
 AND (${DESIRED_J}=0 OR (${grantAfterRemovalProducerSql(ROLE_J)} AND ${laneLinkSql(lane)}))
 AND (NOT(${rank}) OR ${DESIRED_J}=0 OR (${rankFamilyFenceSql('?2','?11',ID_J,lane)} AND ${laneRankOrderProducerSql(P)}))
 AND (NOT(${rank}) OR ${DESIRED_J}=1 OR (${lane==='staff'?`${staffCustodySql('?2','?11',ROLE_J)} AND `:''}${rankRemovalAuthoritySql(lane,'?2','?11','?1',ROLE_J,'?8')}))`,
  /** Exact-tuple adoption (the :123-125 form); each plan item must match exactly one row, else 'lane_currentness_changed'. */
  adoption:`SELECT id,role_id,desired,purpose FROM role_settlements WHERE subject=?2 AND guild_id=?11 AND roster_id=?1 AND subject_generation IS ?6 AND native_guid=?3
 AND native_rank=?5 AND native_rank_name=?4 AND native_profile='ten-rank' AND request_digest ${lane==='fresh'?'=?13':'IS NULL AND ?13 IS NULL'} AND state='pending' AND attempts=0
 AND expires_at>${DB_NOW} AND purpose IN(${lit(purposes)}) LIMIT 24`,
 });
}
/** Pending lane rows of one subject and snapshot: removals first, then membership, then rank. Binds: ?1 subject ?2 guild
 * ?3 roster ?4 generation ?5 limit. */
export const LANE_PENDING_ROWS=`SELECT id,purpose,desired,role_id FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND roster_id=?3 AND subject_generation IS ?4
 AND purpose IN(${lit(LANE_GRANT_PURPOSES)}) AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}
 ORDER BY desired,CASE purpose WHEN '${FRESH_MEMBERSHIP}' THEN 0 ELSE 1 END,created_at,id LIMIT ?5`;
/** settleStaffRankAbsences' candidates. Binds: ?1 subject ?2 roster ?3 generation ?4 guild ?5 managed IDs JSON. */
export const STAFF_ABSENCE_ROWS=`SELECT * FROM role_settlements WHERE subject=?1 AND roster_id=?2 AND subject_generation IS ?3 AND guild_id=?4
 AND purpose='${STAFF_RANK}' AND desired=0 AND state='pending' AND attempts=0 AND role_id IN(SELECT value FROM json_each(?5)) ORDER BY id LIMIT 4`;
/** settleStaffRankAbsences: every target row correlated on its own (unlike :159-167, no first-row bind reuse).
 * Binds: laneParams of the first row, then ?17 the absent row IDs JSON and ?18 the managed IDs JSON. */
export const STAFF_ABSENCE_SETTLE=`UPDATE role_settlements SET state='settled',reason='fresh_server_absence_batch',checked_at=${DB_NOW}
 WHERE id IN(SELECT value FROM json_each(?17)) AND subject=?2 AND roster_id=?1 AND subject_generation IS ?6 AND guild_id=?11 AND native_guid=?3 AND native_rank_name=?4
 AND native_rank=?5 AND native_profile='ten-rank' AND purpose='${STAFF_RANK}' AND desired=0 AND state='pending' AND attempts=0 AND role_id IN(SELECT value FROM json_each(?18))
 AND ${LANE_ROSTER_CURRENT}
 AND ${targetFenceSql('role_settlements.subject','role_settlements.guild_id','role_settlements.role_id','role_settlements.id')}
 AND ${staffCustodySql('role_settlements.subject','role_settlements.guild_id','role_settlements.role_id')} RETURNING id`;
