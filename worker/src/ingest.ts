import {NEUTRAL_IDENTITY_PURPOSE280,NEUTRAL_IDENTITY_PROFILE280,NEUTRAL_IDENTITY_REASON280,NEUTRAL_IDENTITY_GUILD280,NEUTRAL_IDENTITY_CARRIER280} from './consumed-identity280';
import { readPrivacySubject, admittedPrivacySubjectWrite, pendingPrivacyCapture,privacyBoundSubjectEnv,PrivacySiteRequestHeld,privacyCaptureFromColumns,privacyGenerationFenceSql,privacyProviderCustodyDatabase,type PrivacySubject } from './privacy-serving-authority';
/** Endpoints for the officer-side watcher (bearer WATCHER_TOKEN). */
import { intVar, staffChannel, type Env } from "./env";
import { nativeSnapshotSource } from './native-rank-schemes';
import { audit, getCharacter, linksNotBefore, now, openPendingFor, openTicket, type PendingRow,type PrivacyReference } from "./db";
import { codeFor, dayBucket, isValidCode, isValidTicket, normalizeCharacter, normalizeCodeInput, TICKET_LENGTH, ticketFor, ticketNonce } from "./codes";
import { json, logLine, postMessage, staffNotice } from "./discord";
import { onVerified } from "./review";
import { flushNotices, notify, noticeBatch, type NoticeBatch } from "./dm";
import { demote, guidOf, ingestRoster, isCurrentRoster, latestRosterEntry, onLatestRoster, promote, ROSTER_PIN_WITHIN, type RosterMemberIn } from "./roster";
import { callBudget,type GrantOutcome } from "./roles"; // .90 (P-20): the join events' promotions share one Discord-call budget per batch
import {captureBetaRoleDispatch,type BetaRoleDispatch} from './beta-reset-policy';
import type { RemovalDispatch } from './role-settlements';
import { guildSeats, seatsStaffLine } from "./guild-seats";
import { messageOperationId,postPrivacyMessage } from './privacy-provider-messages';
import { captureLaneConfig } from './full-release-roles';
import { captureLaunchVerification,launchVerificationRefusal,launchVerificationEnv,captureNativeMembershipProof,verifyNativeMembershipProof,captureLaunchMembershipSource,launchMembershipFence,launchMembershipCurrent,launchMembershipPredicate,assertLaunchMembershipMode,launchContradictionRestriction,LaunchVerificationHeld,type LaunchVerificationCapture,type NativeMembershipProof,type LaunchMembershipSource } from './launch-verification227';

type WatcherCapture = { references: PrivacyReference[] };
type CapturedQueue = {id:number;discord_id:string;name_key:string;name:string;created_at:number;status:string;attempts:number|null;retry_after:number|null;last_reason:string|null;claimed_by:string|null;claimed_at:number|null;last_reason_at:number|null;note:string|null;written_at:number|null;invited_at:number|null;joined_at:number|null;approved_by:string|null;priority:number;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null};
const queueSelect = "SELECT q.*,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision FROM invite_queue q LEFT JOIN privacy_subjects p ON p.subject_id=q.discord_id ";
/** The event consumes the physical row it originally observed, never a replacement under its name/id. */
function queueMutation(env:Env,row:CapturedQueue,set:string,values:unknown[]):D1PreparedStatement {
  const at=values.length+1;
  return env.DB.prepare(`UPDATE invite_queue SET ${set} WHERE id=?${at} AND discord_id=?${at+1}
    AND name_key=?${at+2} AND name=?${at+3} AND created_at=?${at+4} AND status=?${at+5}
    AND attempts IS ?${at+6} AND retry_after IS ?${at+7} AND last_reason IS ?${at+8}
    AND claimed_by IS ?${at+9} AND claimed_at IS ?${at+10} AND last_reason_at IS ?${at+11}
    AND note IS ?${at+12} AND written_at IS ?${at+13} AND invited_at IS ?${at+14}
    AND joined_at IS ?${at+15} AND approved_by IS ?${at+16} AND priority=?${at+17}`)
    .bind(...values,row.id,row.discord_id,row.name_key,row.name,row.created_at,row.status,row.attempts,row.retry_after,row.last_reason,
      row.claimed_by,row.claimed_at,row.last_reason_at,row.note,row.written_at,row.invited_at,row.joined_at,row.approved_by,row.priority);
}
function pendingFingerprintFence(env:Env,p:PendingRow,identity?:IdentityIntent280):D1PreparedStatement {
  const original=identity?identityIntents280.get(identity):null;if(identity&&!original)consumed230Held();original?.check();
  // The same original guard precedes every business write. An already linked
  // row may keep its old source and may have its GUID updated by this batch;
  // neither permits adopting a replacement row read after the claim.
  const holder=original?.holder;
  const binding=holder?` AND EXISTS(SELECT 1 FROM characters c LEFT JOIN privacy_subjects hs ON hs.subject_id=c.discord_id
    WHERE c.name_key=?8 AND c.name=?9 AND c.discord_id=?10 AND c.guid IS ?11 AND c.status=?12
    AND c.bound_at IS ?13 AND typeof(c.bound_at)=?19 AND c.verified_at IS ?14 AND typeof(c.verified_at)=?20
    AND c.source IS ?15 AND hs.generation IS ?16 AND hs.state IS ?17 AND hs.revision IS ?18)`:'';
  return env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM pending WHERE id=?1 AND discord_id=?2
    AND created_at=?3 AND name_key=?4 AND name=?5 AND expires_at=?6 AND nonce IS ?7 AND consumed_at IS NULL
    AND expires_at>CAST(strftime('%s','now') AS INTEGER))${binding} THEN 1 ELSE json_extract('privacy_pending_proof_refused','$') END AS admitted`)
    .bind(p.id,p.discord_id,p.created_at,p.name_key,p.name,p.expires_at,p.nonce??null,...(holder??[]));
}
function bindWatcher(env:Env,subject:string,capture:PrivacySubject|null,context:WatcherCapture):Env {
  context.references.push({subject,capture});
  return privacyBoundSubjectEnv(env,subject,capture);
}
/** Logging/notification helpers deliberately swallow delivery failures; recheck the original
 * authority before reporting ordinary success, without changing or retrying any payload. */
async function assertWatcherCurrent(env:Env,context:WatcherCapture):Promise<void>{
  const seen=new Set<string>();
  for(const reference of context.references){
    const key=`${reference.subject}:${reference.capture?.subjectGeneration??'absent'}`;
    if(seen.has(key))continue;seen.add(key);
    await privacyBoundSubjectEnv(env,reference.subject,reference.capture).DB.prepare('SELECT 1 AS watcher_current').first();
  }
}
/** A failed native result never proves rollback. Only an observed retired/replaced original generation proves a hold. */
async function watcherHeldResult(env:Env,context:WatcherCapture):Promise<Response> {
  for(const reference of context.references) {
    try {
      const current=await readPrivacySubject(env,reference.subject);
      if(current?.subjectGeneration!==reference.capture?.subjectGeneration||current&&current.state!=='active')
        return json({result:'privacy_held'},409);
    }catch { /* An unavailable read proves no outcome. */ }
  }
  return json({result:'outcome_unknown'},503);
}
/** Identifiable staff posts use the same late-pointer custody as guild-log messages. */
async function watcherStaffNotice(env:Env,payload:unknown,kind:string,references:PrivacyReference[],operationKey:string):Promise<boolean> {
  const channel=staffChannel(env);if(!channel)return false;
  try {
    const operation=await messageOperationId('guild_log',JSON.stringify([kind,operationKey,payload,references.map(r=>[r.subject,r.capture?.subjectGeneration??null])]));
    return !!await postPrivacyMessage(env,'guild_log',channel,payload,references,operation);
  }catch {
    await audit(env,'system','staff_notice.failed',kind,{channel,reason:'privacy_message_not_confirmed'},references);
    return false;
  }
}

/** The shortest WATCHER_TOKEN accepted: README asks for 32+ random characters, and an empty secret must never be a key. */
export const WATCHER_TOKEN_MIN = 32;

/**
 * Build .49: an unset or short WATCHER_TOKEN refuses everyone (before, an empty secret accepted "Bearer " with nothing
 * after it), and both sides are hashed before the constant-time compare so the token's length is not observable.
 */
export async function watcherAuthorized(env: Env, request: Request): Promise<boolean> {
  const token = env.WATCHER_TOKEN ?? "";
  if (token.length < WATCHER_TOKEN_MIN) return false;
  const h = request.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return false;
  const [given, expected] = await Promise.all([sha256(h.slice(7)), sha256(token)]);
  return timingSafeEqual(given, expected);
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i]! ^ b[i]!;
  return r === 0;
}

interface VerifyIn {
  character: string;
  code: string;
  source: "whisper" | "mail";
  ts?: number;
  officer?: string;
  /** The whisperer's character ID, from the whisper event itself (the addon signs it; watcher 0.6.0+). Optional. */
  guid?: string;
  /** Owner addon native membership MAC, bound to this code/GUID/scope/time; never a user claim. */
  nativeMembership?: unknown;
}

/** Only this module's successful original pending-consumption path can mint this
 * capability. A copied result, old member row or later read cannot recreate it. */
declare const consumed230Brand: unique symbol;
export type OriginalConsumedMembership230 = Readonly<{[consumed230Brand]:true}>;
export type Consumed230Facts = Readonly<{subject:string;subjectGeneration:string|null;pendingId:number;consumedAt:number;
  admittedAt:number;pendingExpiresAt:number;source:LaunchMembershipSource;fingerprint:string;deadline:number}>;
type Consumed230Record = {facts:Consumed230Facts;db:D1Database;check:()=>void;effectCheck:(env:Env)=>void;pendingValues:readonly (string|number|null)[]};
const consumed230Originals = new WeakMap<OriginalConsumedMembership230,Consumed230Record>();
const CONSUMED230_CONFIG = ['CANONICAL_ENTITLEMENTS233','CANONICAL_RANKS233','GUILD_ID','ROLE_GUILD_MEMBER','VERIFY_MEMBERSHIP_ONLY','VERIFY_NATIVE_SCOPE','VERIFY_SECRET',
  'LINKS_NOT_BEFORE','LINKS_NOT_BEFORE_CLOCK_GATED','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_LAYOUT',
  'PRIVACY_WRITE_ADMISSION_EPOCH','SHARED_MEMBERSHIP230_MODE','SHARED_MEMBERSHIP230_CLOSURE_JSON','SHARED_MEMBERSHIP230_CLOSURE_SHA256',
  'PRIVACY_ERASURE_ENABLED','PRIVACY_NATIVE_ERASURE_ENABLED','MEMBERSHIP_ROLE_SETTLEMENT_ENABLED','QR_PHASE1_ENABLED',
  'DISCORD_APP_ID','DISCORD_BOT_TOKEN','BLOCKING_ROLE_IDS','ROLE_OFFICER','ROLE_MODERATOR','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER',
  'ROLE_RAID_LEADER','LINK_ROLE_ID','MEMBERSHIP_RETIRED_ROLE_ID','QR_NATIVE_ROLE_MAP','FULL_RELEASE_ROLES','INTROS_ROLES',
  'TREASURY_COSMETIC_ROLES','BETA_RESET_SOURCE_EPOCH','BETA_RESET_DISPATCH_SEAL_MODE','BETA_RESET_REMOVALS_ENABLED','ROLE_CALL_BUDGET'] as const;
function consumed230Held():never {throw new LaunchVerificationHeld();}
function original230Slots(object:object,keys:readonly string[]):()=>void {
  const proto=Object.getPrototypeOf(object),slots=keys.map(key=>Object.getOwnPropertyDescriptor(object,key));
  const check=()=>{if(Object.getPrototypeOf(object)!==proto)consumed230Held();for(let n=0;n<keys.length;n++){
    const before=slots[n],after=Object.getOwnPropertyDescriptor(object,keys[n]!);
    if(before===undefined){if(after||keys[n]! in object)consumed230Held();}
    else if(!Object.hasOwn(before,'value')||!after||!Object.hasOwn(after,'value')||
      ['value','writable','enumerable','configurable','get','set'].some(key=>!Object.is(before[key as keyof PropertyDescriptor],after[key as keyof PropertyDescriptor])))consumed230Held();
  }};check();return check;
}
function captureConsumed230Config(env:Env) {
  let active=true,slots:()=>void;const close=()=>{active=false;};
  try{slots=original230Slots(env,CONSUMED230_CONFIG);}catch{return Object.freeze({enabled:false,check:()=>consumed230Held(),assertEffect:(_effect:Env)=>consumed230Held(),close});}
  const check=()=>{if(!active)consumed230Held();slots();};
  const mode=Object.getOwnPropertyDescriptor(env,'SHARED_MEMBERSHIP230_MODE');
  return Object.freeze({enabled:!!mode&&Object.hasOwn(mode,'value')&&mode.value==='enabled',check,close,
    assertEffect(effect:Env){check();for(const key of CONSUMED230_CONFIG){const a=Object.getOwnPropertyDescriptor(env,key),b=Object.getOwnPropertyDescriptor(effect,key);
      if(a===undefined?!!b||key in effect:!b||!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value')||!Object.is(a.value,b.value))consumed230Held();}}
  });
}
/** The result and selected graph descriptors stay original across fingerprint crypto
 * and every later provider await. This helper is private and is called only after the
 * actual admitted batch returns; it does not accept a caller-asserted ACK flag. */
async function mintConsumed230(env:Env,selection:ReturnType<typeof captureConsumed230Config>,pending:PendingRow,
  pendingCheck:()=>void,capture:PrivacySubject|null,source:LaunchMembershipSource,allDone:D1Result[],consumeIndex:number,
  consumedAt:number,nameKey:string,name:string,via:'whisper'|'mail',identity:IdentityIntent280,identityIndex:number):Promise<OriginalConsumedMembership230> {
  selection.check();pendingCheck();assertLaunchMembershipMode(env,source);
  if(!Array.isArray(allDone))consumed230Held();const length=Object.getOwnPropertyDescriptor(allDone,'length')?.value;
  if(!Number.isSafeInteger(length)||length<4||length>10)consumed230Held();
  const graphChecks:(()=>void)[]=[original230Slots(allDone,['length',...Array.from({length},(_v,n)=>String(n))])];
  for(const item of allDone){graphChecks.push(original230Slots(item,['success','results','meta']));if(item.success!==true)consumed230Held();}
  graphChecks.push(assertIdentityReceipt280(env,identity,allDone,identityIndex));
  const consumed=allDone[consumeIndex];if(!consumed||!consumed.meta||typeof consumed.meta!=='object'||!Array.isArray(consumed.results))consumed230Held();
  graphChecks.push(original230Slots(consumed.meta,['changes']),original230Slots(consumed.results,['length','0']));
  if(consumed.meta.changes!==1||consumed.results.length!==1)consumed230Held();
  const row=consumed.results[0] as Record<string,unknown>;if(!row||typeof row!=='object')consumed230Held();
  graphChecks.push(original230Slots(row,['id','consumed_at','admitted_at']));
  const admittedAt=row.admitted_at;
  if(row.id!==pending.id||row.consumed_at!==consumedAt||!Number.isSafeInteger(admittedAt)||Number(admittedAt)<1||
    !Number.isSafeInteger(pending.id)||pending.id<1||!Number.isSafeInteger(pending.expires_at)||pending.expires_at<=Number(admittedAt)||
    source.nameKey!==nameKey||capture!==null&&(capture.subject!==pending.discord_id||capture.state!=='active'))consumed230Held();
  const db=privacyProviderCustodyDatabase(env),generation=capture?.subjectGeneration??null;
  const pendingValues=Object.freeze([pending.id,pending.discord_id,pending.created_at,pending.expires_at,pending.nonce??null,consumedAt,via,nameKey,name,generation]);
  const deadline=Math.min(Number(admittedAt)+300,source.exportedAt+600,source.nativeObservedAt+600,pending.expires_at);
  if(deadline<=Number(admittedAt))consumed230Held();
  const check=()=>{selection.check();pendingCheck();for(const witness of graphChecks)witness();assertLaunchMembershipMode(env,source);};check();
  const digestInput=JSON.stringify(['original-consumed-membership230',...pendingValues,source.snapshotId,source.guid,source.provenance,source.nativeObservedAt,admittedAt,deadline]);
  const fingerprint=Array.from(await sha256(digestInput),byte=>byte.toString(16).padStart(2,'0')).join('');check();
  const facts=Object.freeze({subject:pending.discord_id,subjectGeneration:generation,pendingId:pending.id,consumedAt,admittedAt:Number(admittedAt),
    pendingExpiresAt:pending.expires_at,source,fingerprint,deadline});
  const cap=Object.freeze({}) as OriginalConsumedMembership230;
  consumed230Originals.set(cap,{facts,db,pendingValues,check,effectCheck:selection.assertEffect});return cap;
}
export function assertConsumed230Original(env:Env,cap:OriginalConsumedMembership230):void {
  const saved=consumed230Originals.get(cap),database=env&&typeof env==='object'?Object.getOwnPropertyDescriptor(env,'DB'):undefined;
  if(!saved||!database||!Object.hasOwn(database,'value')||database.value!==saved.db)consumed230Held();saved.check();
  saved.effectCheck(env);
  assertLaunchMembershipMode(env,saved.facts.source);
}
export function consumed230Facts(cap:OriginalConsumedMembership230):Consumed230Facts {
  const saved=consumed230Originals.get(cap);if(!saved)consumed230Held();saved.check();return saved.facts;
}
export function consumed230Predicate(env:Env,cap:OriginalConsumedMembership230,start=1):Readonly<{sql:string;values:readonly (string|number|null)[];next:number}> {
  assertConsumed230Original(env,cap);if(!Number.isSafeInteger(start)||start<1||start>75)consumed230Held();const saved=consumed230Originals.get(cap)!;
  const at=(offset:number)=>'?'+(start+offset),launch=launchMembershipPredicate(env,saved.facts.source,start+10);
  return Object.freeze({sql:`EXISTS(SELECT 1 FROM pending p WHERE p.id=${at(0)} AND p.discord_id=${at(1)} AND p.created_at=${at(2)}
    AND p.expires_at=${at(3)} AND p.nonce IS ${at(4)} AND p.consumed_at=${at(5)} AND p.consumed_source=${at(6)} AND p.name_key=${at(7)} AND p.name=${at(8)})
    AND ${privacyGenerationFenceSql(start+1,start+9)} AND EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=${at(1)} AND c.name_key=${at(7)} AND c.name=${at(8)}
      AND c.guid=?${start+17} AND c.status='member') AND (SELECT COUNT(*) FROM characters WHERE guid=?${start+17} AND status IN('member','left_pending'))=1
    AND ?${start+18}>CAST(strftime('%s','now') AS INTEGER) AND (${launch.sql})`,
    values:Object.freeze([...saved.pendingValues,...launch.values,saved.facts.source.guid,saved.facts.deadline]),next:start+19});
}
/** Separate private PREWRITE intent. It cannot satisfy OriginalConsumed230 or any role API. */
declare const identityIntent280Brand:unique symbol;
type IdentityIntent280=Readonly<{[identityIntent280Brand]:true}>;
type OriginalHolder280={name_key:string;name:string;discord_id:string;guid:string|null;status:string;bound_at:number;verified_at:number|null;source:string|null;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null;bound_type:string;verified_type:string};
const HOLDER280_FIELDS=Object.freeze(['name_key','name','discord_id','guid','status','bound_at','verified_at','source','privacy_generation','privacy_state','privacy_revision','bound_type','verified_type']);
type IdentityIntentRecord280={db:D1Database;check:()=>void;holder:readonly (string|number|null)[]|null;values:readonly (string|number|null)[];source:LaunchMembershipSource;used:boolean};
const identityIntents280=new WeakMap<IdentityIntent280,IdentityIntentRecord280>();
async function captureIdentityIntent280(env:Env,selection:ReturnType<typeof captureConsumed230Config>,pending:PendingRow,pendingCheck:()=>void,
 capture:PrivacySubject|null,source:LaunchMembershipSource,t:number,nameKey:string,name:string,via:'whisper'|'mail',holder:OriginalHolder280|null,holderCheck:()=>void):Promise<IdentityIntent280>{
 selection.check();pendingCheck();assertLaunchMembershipMode(env,source);
 const captureCheck=capture?original230Slots(capture,['subject','subjectGeneration','state','revision']):()=>{};
 const deadline=Math.min(t+300,source.exportedAt+600,source.nativeObservedAt+600,pending.expires_at);
 if(!selection.enabled||pending.consumed_at!==null||!Number.isSafeInteger(t)||t<1||deadline<=t||
   env.GUILD_ID!==NEUTRAL_IDENTITY_GUILD280||
   source.nameKey!==nameKey||!/^Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}$/.test(source.guid)||
   capture!==null&&(capture.subject!==pending.discord_id||capture.state!=='active'))consumed230Held();
 const generation=capture?.subjectGeneration??null,db=privacyProviderCustodyDatabase(env);
 const check=()=>{selection.check();selection.assertEffect(env);pendingCheck();captureCheck();holderCheck();assertLaunchMembershipMode(env,source);};check();
 const originalHolder=holder?Object.freeze(HOLDER280_FIELDS.map(k=>holder[k as keyof OriginalHolder280])):null;
 if(holder&&(holder.discord_id!==pending.discord_id||!holder.name_key||normalizeCharacter(holder.name)!==holder.name_key||
  (holder.name_key===nameKey?holder.status!=='member'||holder.guid!==null&&typeof holder.guid!=='string':holder.guid!==source.guid)||
  !['verified','queued','member','left','left_pending'].includes(holder.status)||!Number.isSafeInteger(holder.bound_at)||holder.verified_at!==null&&!Number.isSafeInteger(holder.verified_at)||
  holder.source!==null&&typeof holder.source!=='string'||holder.privacy_generation!==generation||holder.privacy_state!==(capture?.state??null)||holder.privacy_revision!==(capture?.revision??null)))consumed230Held();
 const tuple=Object.freeze([pending.id,pending.discord_id,pending.created_at,pending.expires_at,pending.nonce??null,t,via,nameKey,name,generation,
  source.snapshotId,source.guid,source.provenance,source.nativeObservedAt,source.exportedAt,source.cutoff,deadline,env.GUILD_ID,NEUTRAL_IDENTITY_CARRIER280]);
 // The versioned identity digest has no selected role/rank/profile vocabulary.
 const digest=Array.from(await sha256(JSON.stringify(['original-identity-prewrite280-v2',pending.name_key,pending.name,...tuple.slice(0,-1),originalHolder?['original-holder',...originalHolder]:['new-name-binding']])),b=>b.toString(16).padStart(2,'0')).join('');check();
 const cap=Object.freeze({}) as IdentityIntent280;
 identityIntents280.set(cap,{db,check,source,holder:originalHolder,used:false,values:Object.freeze([digest.slice(0,32),digest,...tuple])});return cap;
}
/** One guarded INSERT in the SAME Native link batch. A refused guard throws and rolls back all original statements. */
function identityIntentStatement280(env:Env,cap:IdentityIntent280):D1PreparedStatement {
 const r=identityIntents280.get(cap);if(!r||r.used||privacyProviderCustodyDatabase(env)!==r.db)consumed230Held();r.check();r.used=true;
 // Values3..12 are the original pending/consumption tuple,13..21 source/deadline/config.
 const launch=launchMembershipPredicate(env,r.source,r.holder?35:22);
 // Two distinct captured witnesses, never an OR over arbitrary current names.
 // A NULL historical verification time is not a historical proof. Only a
 // genuinely consumed fresh proof may record its first verification time;
 // the prewrite holder fence still requires the original NULL exactly.
 const firstVerified=r.holder!==null&&r.holder[0]===r.values[9]&&r.holder[6]===null;
 const verified=firstVerified?"c.verified_at IS ?8 AND typeof(c.verified_at)='integer'":'c.verified_at IS ?28 AND typeof(c.verified_at)=?34';
 const binding=r.holder?`EXISTS(SELECT 1 FROM characters c LEFT JOIN privacy_subjects hs ON hs.subject_id=c.discord_id
   WHERE c.name_key=?22 AND c.name=?23 AND c.discord_id=?24 AND c.guid=?14 AND c.status=?26
   AND c.bound_at IS ?27 AND typeof(c.bound_at)=?33 AND (${verified})
   AND c.source IS ?29 AND hs.generation IS ?30 AND hs.state IS ?31 AND hs.revision IS ?32
   AND ?24=?4 AND ?30 IS ?12)`:
   `EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=?4 AND c.name_key=?10 AND c.name=?11
   AND c.guid=?14 AND c.status IN('verified','member') AND c.source IN('whisper','mail') AND c.bound_at<=?8 AND c.verified_at<=?8)`;
 const claimed=`EXISTS(SELECT 1 FROM pending p WHERE p.id=?3 AND p.discord_id=?4 AND p.created_at=?5 AND p.expires_at=?6 AND p.nonce IS ?7
  AND p.consumed_at=?8 AND p.consumed_source=?9 AND p.name_key=?10 AND p.name=?11)`;
 const guard=`(${claimed})
  AND ${privacyGenerationFenceSql(4,12)} AND (${binding})
  AND (SELECT COUNT(*) FROM characters WHERE guid=?14 AND status NOT IN('unbound','denied'))=1
  AND ?8<=CAST(strftime('%s','now') AS INTEGER) AND ?19>CAST(strftime('%s','now') AS INTEGER)
  AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?4 AND banned=1)
  AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?4 AND denied=1)
  AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?4 AND state='reapply')
  AND NOT EXISTS(SELECT 1 FROM role_settlements duplicate WHERE duplicate.purpose='${NEUTRAL_IDENTITY_PURPOSE280}' AND duplicate.request_digest=?2) AND (${launch.sql})`;
 return env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,created_at,expires_at,attempts,checked_at)
  SELECT CASE WHEN (${guard}) THEN ?1 ELSE json_extract('neutral_identity_original_changed','$') END,?4,'${NEUTRAL_IDENTITY_PURPOSE280}',NULL,?20,?21,1,'settled','${NEUTRAL_IDENTITY_REASON280}',NULL,?12,?2,?13,?14,'${NEUTRAL_IDENTITY_PROFILE280}',NULL,NULL,?8,?19,0,?8
  WHERE (${claimed}) RETURNING id`).bind(...r.values,...(r.holder??[]),...launch.values);
}

/** Source-owned post-ACK witness only. Bad or lost receipt metadata mints no role cap. */
function assertIdentityReceipt280(env:Env,cap:IdentityIntent280,results:D1Result[],index:number):()=>void {
 const r=identityIntents280.get(cap);if(!r||!r.used||privacyProviderCustodyDatabase(env)!==r.db||!Number.isSafeInteger(index)||index!==results.length-1)consumed230Held();r.check();
 const receipt=results[index];if(!receipt||receipt.success!==true||!receipt.meta||receipt.meta.changes!==1||!Array.isArray(receipt.results)||receipt.results.length!==1)consumed230Held();
 const row=receipt.results[0] as Record<string,unknown>;if(!row||typeof row!=='object'||row.id!==r.values[0])consumed230Held();
 const checks=[original230Slots(results,['length',String(index)]),original230Slots(receipt,['success','meta','results']),original230Slots(receipt.meta,['changes']),original230Slots(receipt.results,['length','0']),original230Slots(row,['id'])];
 const check=()=>{r.check();for(const c of checks)c();};check();return check;
}

function memberRoleResult230(outcome:GrantOutcome|undefined) {
  const roleOutcome=outcome==='granted'?'granted':outcome==='has-role'?'observed-present':outcome==='unknown'?'unknown':outcome==='no-role'||outcome===undefined?'not-attempted':'held';
  return {pendingConsumed:true,inviteQueued:false,roleOutcome,roleGranted:roleOutcome==='granted'||roleOutcome==='observed-present'};
}

/** A successful native verification gets a bounded direct rank visit rather
 * than waiting behind the periodic account rotation. Shared access is still
 * granted only by its original writer; a rank hold never invents a base ACK. */
async function verifiedRankResult232(env:Env,subject:string,outcome:GrantOutcome|undefined,originalConsumed?:OriginalConsumedMembership230):Promise<Readonly<{rankOutcome?:string;rankReason?:string;roleGranted?:boolean;roleOutcome?:'granted'|'observed-present'|'held'|'unknown'}>>{
  const C=await import('./canonical-ranks233'),canonical=C.captureCanonicalRankConfig233(env);
  if(canonical.present){
    try{
      if(!originalConsumed||canonical.mode!=='enabled')return {rankOutcome:'held',rankReason:'canonical233_configuration_held'};
      const effect={...env,DB:privacyProviderCustodyDatabase(env)};assertConsumed230Original(effect,originalConsumed);
      if(outcome==='granted'||outcome==='has-role')return {rankOutcome:'settled',rankReason:outcome==='granted'?'canonical233_original_grant':'canonical233_current_role_observed'};
      if(outcome==='unknown')return {rankOutcome:'unknown',rankReason:'canonical233_original_effect_unknown'};
      const pass=await import('./full-release-pass'),r=await pass.runVerifiedRank232(effect,subject,callBudget(effect));assertConsumed230Original(effect,originalConsumed);
      const granted=r.rank?.outcomes.some(o=>o.state==='settled'&&o.reason==='canonical233_put_acknowledged_and_confirmed')===true;
      return {rankOutcome:r.rank?.state??r.state,rankReason:r.rank?.reason??r.reason,...granted?{roleGranted:true,roleOutcome:'granted' as const}:r.state==='unknown'?{roleGranted:false,roleOutcome:'unknown' as const}:{}};
    }catch{return {rankOutcome:'held',rankReason:'canonical233_followup_held'};}
  }
  const N=await import('./native-rank-reconciliation232'),selection=N.captureNativeRankConfig232(env);
  if(!selection.present)return {};
  if(selection.mode!=='enabled'||outcome!=='granted'&&outcome!=='has-role')return {rankOutcome:'held',rankReason:'native232_membership_or_configuration_held'};
  try{
    const pass=await import('./full-release-pass'),result=await pass.runVerifiedRank232(env,subject,callBudget(env));
    const reason=result.rank?.reason??result.reason,baseWithdrawn=result.base?.reason==='native232_delete_acknowledged_and_confirmed'||reason==='native232_shared_access_required_first';
    return {rankOutcome:result.rank?.state??result.state,rankReason:reason,...result.base?.state==='unknown'?{roleGranted:false as const,roleOutcome:'unknown' as const}:baseWithdrawn?{roleGranted:false as const,roleOutcome:'held' as const}:{}};
  }catch{return {rankOutcome:'held',rankReason:'native232_followup_held'};}
}

/** A player GUID as the client writes it ("Player-4613-0ABCDEF0"), or null. */
export function playerGuid(v: unknown): string | null {
  const g = guidOf(v);
  return g && /^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/.test(g) ? g : null;
}

export async function postVerify(env: Env, body: VerifyIn,originalDispatch?:BetaRoleDispatch): Promise<Response> {
  const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
  const launch = captureLaunchVerification(env);
  const consumedSelection230=captureConsumed230Config(env);
  if (launch.mode === 'held') return json({ result: 'verification_configuration_held', roleGranted: false, inviteQueued: false, pendingConsumed: false }, 503);
  const context:WatcherCapture={references:[]};
  try {
    // Copy all selected request primitives and the strict native proof before any await.
    let originalBody=body;
    if(launch.mode==='members-only'){
      const copied:Record<string,unknown>={};
      for(const field of ['character','code','source','ts','officer','guid','nativeMembership']){const d=Object.getOwnPropertyDescriptor(body,field);if(d&&!Object.hasOwn(d,'value'))throw new LaunchVerificationHeld();copied[field]=d?.value;}
      copied.nativeMembership=captureNativeMembershipProof(copied.nativeMembership);originalBody=Object.freeze(copied) as unknown as VerifyIn;
    }
    const result=await postVerifyInner(launchVerificationEnv(env,launch),originalBody,context,roleDispatch,launch,consumedSelection230);
    if(result.status<400)await assertWatcherCurrent(env,context);
    return result;
  }
  catch(error) { if(error instanceof PrivacySiteRequestHeld||error instanceof LaunchVerificationHeld)return watcherHeldResult(env,context);throw error; }
  finally {consumedSelection230.close();}
}

async function postVerifyInner(env: Env, body: VerifyIn,context:WatcherCapture,roleDispatch:BetaRoleDispatch,launch:LaunchVerificationCapture,consumedSelection230:ReturnType<typeof captureConsumed230Config>): Promise<Response> {
  const originalEnv=env;
  const name = (body.character ?? "").trim();
  const nameKey = normalizeCharacter(name);
  if (!nameKey || !body.code) return json({ error: "character and code required" }, 400);

  // .242: preserve captured expired observations and return an explicit no-effect outcome.
  if(body.ts!==undefined && (!Number.isSafeInteger(body.ts)||body.ts<=now()-600||body.ts>now()+5))
    return json({result:'source_expired',pendingConsumed:false,roleGranted:false,inviteQueued:false});

  // Two kinds of code, told apart by length (codes.ts). A character code names its character up front; a request code
  // ("ticket") names nobody, and the character is the whisper's sender -- which the game server vouches for.
  const code = normalizeCodeInput(body.code);
  const ticket = code.length === TICKET_LENGTH;
  const valid = ticket ? await isValidTicket(env.VERIFY_SECRET, code) : await isValidCode(env.VERIFY_SECRET, name, code);
  if (!valid) {
    await audit(env, "watcher", "verify.invalid_code", name, { source: body.source, ticket });
    return json({ result: "invalid" });
  }
  let pending: PendingRow | null = ticket ? await openTicket(env, ticketNonce(code)!) : await openPendingFor(env, nameKey);
  const pendingCheck230=pending?original230Slots(pending,['id','discord_id','name_key','name','created_at','expires_at','consumed_at','nonce','privacy_generation','privacy_state','privacy_revision']):()=>consumed230Held();
  if(pending?.privacy_state&&pending.privacy_state!=='active')return json({result:'privacy_held'},409);
  // Bind immediately after the joint pending/generation read, before ticket crypto or any later await.
  const privacyCapture=pending?pendingPrivacyCapture(pending):null;
  const reference=pending?{subject:pending.discord_id,capture:privacyCapture}:undefined;
  if(pending)env=bindWatcher(env,pending.discord_id,privacyCapture,context);
  // A request code is good for the one request that showed it, and no other. issueTicket never hands out a nonce while
  // an older code for it could still pass, and this makes that a rule rather than a timing argument: an old code whose
  // nonce has since been given to somebody else's request does not match that request's code, so it cannot claim it.
  if (pending && ticket && code !== (await ticketFor(env.VERIFY_SECRET, pending.nonce ?? "", dayBucket(new Date(pending.created_at * 1000))))) {
    await audit(env, "watcher", "verify.ticket_mismatch", name, { source: body.source, pendingId: pending.id },reference);
    pending = null;
  }
  // SEN-01 (30 Oct 2026): a character code depends only on the name and the day, so a code shown for an earlier request
  // would also claim the name's next request, opened by another account once the first lapsed. A request accepts only
  // the codes of the day it opened and of the next day (it lives 24 hours); /verify shows the opening day's code.
  if (pending && !ticket) {
    const opened = pending.created_at * 1000;
    const own = [await codeFor(env.VERIFY_SECRET, name, dayBucket(new Date(opened))), await codeFor(env.VERIFY_SECRET, name, dayBucket(new Date(opened + 86_400_000)))];
    if (!own.includes(code)) {
      await audit(env, "watcher", "verify.code_predates_request", name, { source: body.source, pendingId: pending.id },reference);
      pending = null;
    }
  }
  if (!pending) {
    // Membership-only launch verification never reopens the historical invite queue.
    if (launch.mode === 'members-only' || !launch.current()) return json({ result: 'no_pending' });
    // A valid code with no open request is usually an expired request or a replay. There is one case where it is
    // deliberate: we refused this character's invite because they were in another guild, told them to leave and
    // whisper the code back, and they have now done it. Whispering it again is how they say "done".
    const resumed = await resumeAfterGuildLeave(env, nameKey, name, body.source,context);
    if(resumed&&'refused'in resumed)return json({result:'no_pending'});
    if (resumed) return json({ result: "resumed", ...resumed });
    await audit(env, "watcher", "verify.no_pending", name, { source: body.source, ticket },reference);
    if (ticket) await noteTicketReuse(env, code, nameKey, name,context);
    return json({ result: "no_pending" });
  }
  if(privacyCapture && privacyCapture.state!=='active')return json({result:'privacy_held'},409);
  // A ban closes the account's open requests (/olympus-admin ban), but a code whispered in the moment before the ban,
  // or a request opened by an older build, must not link anything either.
  // Known standing refusals are not an uncertain consuming batch. Keep the
  // same-statement fences below for a restriction that arrives after this read.
  // These scalar facts replace the former member-only read at the same cost.
  const account = await env.DB.prepare(`SELECT (SELECT banned FROM members WHERE discord_id=?1) AS banned,
    EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND denied=1) AS denied,
    EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?1 AND state='reapply') AS rename_held`)
    .bind(pending.discord_id).first<{banned:number|null;denied:number;rename_held:number}>();
  if(!account)return json({result:'outcome_unknown'},503);
  if (account?.banned) {
    await closeRequest(env, pending, "banned");
    await audit(env, "watcher", "verify.banned", name, { discordId: pending.discord_id, source: body.source, ticket },reference);
    await logLine(env, `⛔ verify: **${name}** whispered a valid code for <@${pending.discord_id}>, who is banned from verifying. Nothing was linked.`,[reference!]);
    return json({ result: "banned" });
  }
  if(account.denied||account.rename_held)return json({result:'verification_refused',reason:account.denied?'site_denied':'rename_review_required',pendingConsumed:false,roleGranted:false,inviteQueued:false},409);
  const existing = await env.DB.prepare("SELECT c.*,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision,typeof(c.bound_at) AS bound_type,typeof(c.verified_at) AS verified_type FROM characters c LEFT JOIN privacy_subjects s ON s.subject_id=c.discord_id WHERE c.name_key=?1").bind(nameKey).first<OriginalHolder280>();
  const existingCheck280=existing?original230Slots(existing,HOLDER280_FIELDS):()=>{};
  if (existing && existing.discord_id !== pending.discord_id && !["unbound", "denied", "left"].includes(existing.status)) {
    const references=[reference!,{subject:existing.discord_id,capture:privacyCaptureFromColumns(existing.discord_id,existing)}];
    await audit(env, "watcher", "verify.bound_elsewhere", name, { pendingFor: pending.discord_id, boundTo: existing.discord_id, ticket },references);
    // A request code is closed here: the addon and the watcher have already tied it to this sender, so left open it
    // would sit unusable for a day while Get my code kept showing it. The next press issues a fresh one.
    if (ticket) await closeRequest(env, pending, "refused");
    await logLine(env, `⚠️ verify: **${name}** whispered a valid code but the name is bound to <@${existing.discord_id}> (request from <@${pending.discord_id}>). Not re-linked — an officer must /olympus-admin unbind first.`,references);
    return json({ result: "bound_elsewhere" });
  }
  // The name may be free while the CHARACTER is not: a linked member renamed since the last export, and the link has
  // not followed yet (a rename waits one export when the old holder of the new name must be released first). The
  // whisper's own GUID says which character this is (the addon reads it from the whisper event); failing that, a
  // current roster says which character has this name. If a live link is pinned to it, that link is the character's.
  const whisperGuid = playerGuid(body.guid);
  const onRoster = await latestRosterEntry(env, nameKey);
  const current = !!onRoster && isCurrentRoster(env, onRoster);
  const rosterGuid = current ? guidOf(onRoster!.guid) : null;
  const nativeMembership=launch.mode==='members-only'?await verifyNativeMembershipProof(env,launch,body.nativeMembership as NativeMembershipProof|null,name,whisperGuid,code):null;
  const launchRefusal = launchVerificationRefusal(launch, { current, exportedAt: onRoster?.exportedAt ?? null, rosterGuid, whisperGuid,source:onRoster?.source??null,nativeMembership:launch.mode==='legacy'||nativeMembership?.member===true }, now());
  if (launchRefusal) {
    if(launchRefusal.result!=='membership_not_confirmed')return json(launchRefusal,503);
    // 5 Nov 2026: a late roster/proof is not a native statement of absence. In
    // the observed exchange the fresh roster arrived three seconds after the
    // whisper; consuming its request here made a recoverable delay permanent.
    // Only the original authenticated negative proof may close this request.
    // Missing/stale/unmatched inputs retain every grant fence and the request.
    if(nativeMembership?.member!==false)return json({...launchRefusal,result:'membership_source_pending',
      error:'Verification is waiting for fresh, trusted guild membership data. Your request remains open. No role or invite was issued.'},503);
    // A definitive refusal closes only this original request, so Get my code can
    // issue a new nonce. No character, review, invite or role is created here.
    // A lost/changed Native result is unknown, never acknowledged as a refusal.
    try{
      const restriction=launchContradictionRestriction(env,launch,nativeMembership,onRoster,nameKey);
      const refused=await admittedPrivacySubjectWrite(env,pending.discord_id,privacyCapture,[pendingFingerprintFence(env,pending),
        env.DB.prepare(`UPDATE pending SET consumed_at=?8,consumed_source='membership_refused' WHERE id=?1 AND discord_id=?2
          AND created_at=?3 AND name_key=?4 AND name=?5 AND expires_at=?6 AND nonce IS ?7 AND consumed_at IS NULL RETURNING id`)
          .bind(pending.id,pending.discord_id,pending.created_at,pending.name_key,pending.name,pending.expires_at,pending.nonce??null,now()),...(restriction?[restriction]:[])]);
      if(refused[1]?.meta?.changes!==1||refused[1]?.results?.length!==1)return json({result:'outcome_unknown'},503);
      return json({...launchRefusal,pendingConsumed:true,requestRefused:true},409);
    }catch{return json({result:'outcome_unknown'},503);}
  }
  const launchSource=onRoster?captureLaunchMembershipSource(env,launch,onRoster,nameKey,nativeMembership):null;
  const who = whisperGuid ?? rosterGuid;
  const holder = who
    ? await env.DB.prepare(
        "SELECT c.name_key,c.name,c.discord_id,c.guid,c.status,c.bound_at,c.verified_at,c.source,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision,typeof(c.bound_at) AS bound_type,typeof(c.verified_at) AS verified_type FROM characters c LEFT JOIN privacy_subjects s ON s.subject_id=c.discord_id WHERE c.guid = ?1 AND c.name_key <> ?2 AND c.status IN ('verified','queued','member','left','left_pending') LIMIT 1",
      )
        .bind(who, nameKey)
        .first<OriginalHolder280>()
    : null;
  const holderCheck280=holder?original230Slots(holder,HOLDER280_FIELDS):()=>{};
  if (holder && holder.discord_id !== pending.discord_id) {
    const references=[reference!,{subject:holder.discord_id,capture:privacyCaptureFromColumns(holder.discord_id,holder)}];
    await audit(env, "watcher", "verify.bound_elsewhere", name, { pendingFor: pending.discord_id, boundTo: holder.discord_id, as: holder.name, ticket },references);
    if (ticket) await closeRequest(env, pending, "refused");
    // SEN-01: a character-code request stays open with the same code, and the watcher that relayed it drops a repeat.
    await logLine(env, `⚠️ verify: **${name}** whispered a valid code, but this character is linked to <@${holder.discord_id}> as **${holder.name}** (renamed since). Not re-linked — an officer decides. Once it is settled, the member retries with **Get my code** (a request code, while those are on), by mail, or by whispering another officer: the same code whispered to the same officer is not relayed again.`,references);
    return json({ result: "bound_elsewhere" });
  }
  const t = now();
  // A request code whispered from a character that is already this account's member: nothing to link or admit. The same
  // goes for this account's own character under its new name: the next export carries the link there.
  const alreadyLinked = (!!existing && existing.discord_id === pending.discord_id && existing.status === "member") || !!holder;
  // One batch, so the request is never used up without the link being made (D1 runs a batch as one transaction).
  //  1. characters.discord_id REFERENCES members(discord_id), and D1 enforces foreign keys: the account row first.
  //  2. Claim the request. The guard makes a second whisper of the same code (from another character, at the same
  //     moment) lose cleanly instead of linking a second character, and re-checks, inside the transaction, that nobody
  //     else has bound the name since it was read above. A ticket learns its character here.
  //  3. Link the character -- only if step 2 claimed the request for this very name at this very second, and never
  //     over this account's own member row (a duplicate relay of the same whisper landing after the promotion).
  // A new binding starts with the whisper's own GUID when the addon supplied it, else without one even if the name had
  // one: the next roster export then pins the character actually on the roster, so a recreated or namesake character
  // never inherits an old pin.
  const stmts = [
    env.DB.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT(discord_id) DO NOTHING").bind(pending.discord_id),
    env.DB.prepare(
      `UPDATE pending SET consumed_at = ?2, consumed_source = ?3, name_key = ?4, name = ?5
        WHERE id = ?1 AND consumed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM characters WHERE name_key = ?4 AND discord_id <> ?6 AND status NOT IN ('unbound', 'denied', 'left'))
          ${consumedSelection230.enabled&&launchSource?"RETURNING id,consumed_at,CAST(strftime('%s','now') AS INTEGER) AS admitted_at":''}`,
    ).bind(pending.id, t, body.source, nameKey, name, pending.discord_id),
  ];
  if (!alreadyLinked) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, source, guid)
         SELECT ?1, ?2, ?3, 'verified', ?4, ?4, ?5, ?7
          WHERE EXISTS (SELECT 1 FROM pending WHERE id = ?6 AND consumed_at = ?4 AND name_key = ?1)
         ON CONFLICT(name_key) DO UPDATE SET name = ?2, discord_id = ?3, status = 'verified', bound_at = ?4, verified_at = ?4, left_at = NULL, source = ?5, guid = ?7
          WHERE NOT (characters.discord_id = ?3 AND characters.status = 'member')`,
      ).bind(nameKey, name, pending.discord_id, t, body.source, pending.id, whisperGuid),
    );
  } else if (whisperGuid && !holder) {
    // A recreated character gets its newly proved GUID. A note-created Member
    // can also lack verified_at: record its FIRST time only from this fresh,
    // independently proved native whisper/mail, never retime a prior proof.
    const firstVerified=consumedSelection230.enabled&&launchSource!==null&&existing?.verified_at===null&&(body.source==='whisper'||body.source==='mail');
    stmts.push(
      env.DB.prepare(
        `UPDATE characters SET guid = ?2,verified_at=CASE WHEN ?6=1 AND verified_at IS NULL THEN ?5 ELSE verified_at END
         WHERE name_key = ?1 AND discord_id = ?3 AND ((guid IS NULL OR guid <> ?2) OR (?6=1 AND verified_at IS NULL))
           AND EXISTS (SELECT 1 FROM pending WHERE id = ?4 AND consumed_at = ?5 AND name_key = ?1)`,
      ).bind(nameKey, whisperGuid, pending.discord_id, pending.id, t,firstVerified?1:0),
    );
  }
  let identityIntent280:IdentityIntent280|undefined;
  if(consumedSelection230.enabled&&launchSource&&(body.source==='whisper'||body.source==='mail')){
    // A same-name Member keeps its original source just like a renamed holder.
    // This fresh proof does not rewrite the old link or manufacture its origin.
    const originalHolder=holder??(alreadyLinked?existing:null),originalCheck=holder?holderCheck280:existingCheck280;
    try{
      const identity=await captureIdentityIntent280(env,consumedSelection230,pending,pendingCheck230,privacyCapture,launchSource,t,nameKey,name,body.source,originalHolder,originalCheck);
      identityIntent280=identity;
      stmts.push(identityIntentStatement280(env,identity));
    }catch{return json({result:'verification_configuration_held',pendingConsumed:false,roleGranted:false,inviteQueued:false},409);}
  }
  let allDone:D1Result[];
  if (!launch.current()) return json({ result: 'verification_configuration_held', roleGranted: false, inviteQueued: false, pendingConsumed: false }, 503);
  try {
    const guards=[pendingFingerprintFence(env,pending,identityIntent280),...(launchSource?[launchMembershipFence(env,launchSource)]:[])];
    allDone = await admittedPrivacySubjectWrite(env,pending.discord_id,privacyCapture,[...guards,...stmts]);
  } catch {
    // A competing relay or account closure can refuse the original consuming proof. Read only
    // to classify the outcome: never adopt a replacement pending row/generation or retry a write.
    try {
      const subject=await readPrivacySubject(originalEnv,pending.discord_id);
      if (subject?.subjectGeneration !== privacyCapture?.subjectGeneration || subject && subject.state !== 'active')
        return json({result:'privacy_held'},409);
      const after=await originalEnv.DB.prepare('SELECT discord_id,created_at,name_key,nonce,expires_at,consumed_at FROM pending WHERE id=?1')
        .bind(pending.id).first<{discord_id:string;created_at:number;name_key:string;nonce:string|null;expires_at:number;consumed_at:number|null}>();
      // Only a *different* named consumer proves that this relay did not land. A same-name
      // consumed proof can be our own committed batch with a lost reply; do not restart it.
      if(after&&after.discord_id===pending.discord_id&&after.created_at===pending.created_at&&after.expires_at===pending.expires_at&&
          after.nonce===(pending.nonce??null)&&after.consumed_at!==null&&after.name_key!==nameKey)
        return json({result:'no_pending'});
    } catch { /* An unavailable observation cannot prove refusal or rollback. */ }
    return json({result:'outcome_unknown'},503);
  }
  const done=allDone.slice(launchSource?2:1);
  if (!done[1]?.meta?.changes) {
    // Lost a race: the request was used a moment ago, or the name was linked to another account a moment ago.
    const after = await env.DB.prepare("SELECT consumed_at, name FROM pending WHERE id = ?1").bind(pending.id).first<{ consumed_at: number | null; name: string }>();
    if (!after?.consumed_at) {
      await audit(env, "watcher", "verify.bound_elsewhere", name, { pendingFor: pending.discord_id, ticket, race: true },reference);
      if (ticket) await closeRequest(env, pending, "refused");
      return json({ result: "bound_elsewhere" });
    }
    await audit(env, "watcher", "verify.already_used", name, { source: body.source, ticket, usedBy: after.name },reference);
    if (ticket && after.name && normalizeCharacter(after.name) !== nameKey) {
      // Another character got there first with the same request code: it was shared or leaked. Worth a line, because
      // the owner of the request is about to find a character linked that may not be theirs.
      await logLine(env, `⚠️ verify: **${name}** whispered the request code of <@${pending.discord_id}> that **${after.name}** had just used. Not linked.`,[reference!]);
    }
    return json({ result: "no_pending" });
  }
  const resolved: PendingRow = { ...pending, name_key: nameKey, name, consumed_at: t };
  if(identityIntent280){try{assertIdentityReceipt280(env,identityIntent280,allDone,allDone.length-1);}catch{return json({result:'outcome_unknown'},503);}}
  let originalConsumed230:OriginalConsumedMembership230|undefined;
  if(consumedSelection230.enabled&&launchSource&&(body.source==='whisper'||body.source==='mail')){
    try{if(!identityIntent280)consumed230Held();originalConsumed230=await mintConsumed230(env,consumedSelection230,pending,pendingCheck230,privacyCapture,launchSource,allDone,3,t,nameKey,name,body.source,identityIntent280,allDone.length-1);}
    catch{/* The link may be acknowledged while new role authority is held. Never adopt a later pending row or ACK. */}
  }
  if (alreadyLinked) {
    // An already linked member may have lost their Discord role. A newly proved
    // native source can reach the existing writer; never replay an unknown intent.
    const roleOutcome=launchSource?await promote(env,pending.discord_id,nameKey,name,undefined,whisperGuid,undefined,privacyCapture,roleDispatch,launchSource,originalConsumed230):undefined;
    const rankResult=launchSource?await verifiedRankResult232(env,pending.discord_id,roleOutcome,originalConsumed230):{};
    await audit(env, "watcher", "verify.already_linked", name, { discordId: pending.discord_id, source: body.source },reference);
    if(launchSource&&!await launchMembershipCurrent(env,launchSource))return json({result:'outcome_unknown',pendingConsumed:true,roleOutcome:'unknown',inviteQueued:false},503);
    return json({ result: "member", discordId: pending.discord_id, name,...(launchSource?memberRoleResult230(roleOutcome):{}),...rankResult });
  }
  await audit(env, "watcher", "verify.confirmed", name, { discordId: pending.discord_id, source: body.source, officer: body.officer, ticket, guid: whisperGuid },reference);
  await logLine(env, `✅ verify: **${name}** confirmed in game (${body.source}${ticket ? ", request code" : ""}) for <@${pending.discord_id}>.`,[reference!]);
  // ... and only when the roster's character under this name is the one that whispered, where that is known.
  if (onRoster && current && (!whisperGuid || !rosterGuid || whisperGuid === rosterGuid)) {
    // Already in the guild (an existing member linking their Discord, or someone an officer invited by hand):
    // nothing to admit, so no review card — the role follows now. The roster export stays the source of truth
    // for keeping it (a newer snapshot without the name still strips it). Only a current roster says so: the beta's
    // last export, read on launch day, would grant the role to whoever took the name on live and pin the wrong
    // character to them. The GUID is taken only from a very fresh export; otherwise the next export pins it.
    await audit(env, "watcher", "verify.already_member", name, { discordId: pending.discord_id, source: body.source },reference);
    const roleOutcome=await promote(env, pending.discord_id, nameKey, name, undefined, whisperGuid ?? (now() - onRoster.exportedAt <= ROSTER_PIN_WITHIN ? onRoster.guid : null),undefined,privacyCapture,roleDispatch,launchSource??undefined,originalConsumed230);
    const rankResult=launchSource?await verifiedRankResult232(env,pending.discord_id,roleOutcome,originalConsumed230):{};
    if(launchSource&&!await launchMembershipCurrent(env,launchSource))return json({result:'outcome_unknown',pendingConsumed:true,roleOutcome:'unknown',inviteQueued:false},503);
    return json({ result: "member", discordId: pending.discord_id, name,...(launchSource?memberRoleResult230(roleOutcome):{}),...rankResult });
  }
  if (onRoster) await audit(env, "watcher", "verify.roster_not_current", name, { exportedAt: onRoster.exportedAt },reference);
  await onVerified(env, resolved, body.source,privacyCapture);
  return json({ result: "verified", discordId: pending.discord_id, name });
}

async function closeRequest(env: Env, p:PendingRow, why: "refused" | "banned") {
  await env.DB.prepare(`UPDATE pending SET consumed_at=?8,consumed_source=?9 WHERE id=?1 AND discord_id=?2
    AND created_at=?3 AND name_key=?4 AND name=?5 AND expires_at=?6 AND nonce IS ?7 AND consumed_at IS NULL`)
    .bind(p.id,p.discord_id,p.created_at,p.name_key,p.name,p.expires_at,p.nonce??null,now(),why).run();
}

/**
 * A request code that another character has already used, whispered again by a different one: the code was shared or
 * leaked. The addon and the watcher refuse the second character on the officer's own PC; this is what the staff log
 * shows when it reaches the Worker anyway (a second officer's watcher, say).
 */
async function noteTicketReuse(env: Env, code: string, nameKey: string, name: string,context:WatcherCapture) {
  const nonce = ticketNonce(code);
  if (!nonce) return;
  const used = await env.DB.prepare(
    "SELECT p.*,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision FROM pending p LEFT JOIN privacy_subjects s ON s.subject_id=p.discord_id WHERE p.nonce = ?1 AND p.consumed_at IS NOT NULL AND p.created_at > ?2 ORDER BY p.id DESC LIMIT 1",
  )
    .bind(nonce, now() - 48 * 3600)
    .first<PendingRow>();
  if (!used?.name || normalizeCharacter(used.name) === nameKey) return;
  const capture=pendingPrivacyCapture(used),reference={subject:used.discord_id,capture};
  env=bindWatcher(env,used.discord_id,capture,context);
  if (code !== (await ticketFor(env.VERIFY_SECRET, nonce, dayBucket(new Date(used.created_at * 1000))))) return;
  await audit(env, "watcher", "verify.ticket_reused", name, { discordId: used.discord_id, usedBy: used.name },reference);
  await logLine(env, `⚠️ verify: **${name}** whispered the request code of <@${used.discord_id}> that **${used.name}** already used. Not linked.`,[reference]);
}

interface EventIn {
  type: "invite" | "joined" | "left" | "removed" | "guild_full" | "note" | "queue_loaded" | "flush" | "identity";
  /** identity: the character ID the addon read from a whisper that carried a valid code. */
  guid?: string;
  name?: string;
  ts?: number;
  ok?: boolean;
  detail?: string;
  /**
   * Where the watcher got this. Only "addon" (the addon's own SavedVariables, written after C_GuildInfo.MemberExistsByName
   * or a real CHAT_MSG_SYSTEM) and "token" (an outgoing officer whisper carrying an HMAC the addon computed) are
   * authoritative. "chatlog" is the plain text of a guild system line, which a player can reproduce exactly with
   * /emote — the client writes "<Name> has joined the guild." for both, and nothing in the text distinguishes them.
   * An untrusted join therefore never grants a role and an untrusted departure never removes one.
   */
  origin?: "addon" | "token" | "chatlog";
  reason?: string;
  /** guild_full: the addon's ranked shortlist of who could be removed, with the evidence it ranked on. */
  candidates?: Array<{ name?: string; level?: number; rank?: string; days?: number }>;
}

const isAuthoritative = (e: EventIn) => e.origin === "addon" || e.origin === "token";

/**
 * Events relayed by the watcher — from the addon's SavedVariables (invites fired, joins noticed, notes), from an
 * officer's outgoing confirmation whisper (HMAC-signed by the addon), and from guild system lines in the chat log.
 * Idempotent.
 *
 * Trust matters here. An authoritative join grants the role immediately. An unauthenticated one only marks the
 * invite queue and waits for a roster export to confirm it, because the chat-log text is forgeable with /emote.
 * Symmetrically, an authoritative departure removes the role now, while an unauthenticated one only arms the
 * removal (status left_pending) so the next roster export completes or cancels it.
 */
/**
 * How long a refused invite waits before it is offered again.
 *
 * The three cases are genuinely different and treating them alike is what produced the 19 September mess: 91 people
 * parked in `invited`, roughly 50 of them simply still in another guild, nobody retried and nobody told. A full
 * guild is our problem and clears on its own, so it retries soon and does not count against the applicant. Being in
 * another guild is theirs to fix and clears only when they act, so it backs off hard rather than burning one of the
 * officer's protected invite key presses every poll. Anything else — offline, declined, mistyped — sits in between.
 */
const INVITE_RETRY_FULL = 15 * 60;
const INVITE_RETRY_GUILDED = 6 * 3600;
const INVITE_RETRY_OTHER = 30 * 60;
/** An invite that fired but was never accepted comes back into play after this, so `invited` is no longer terminal. */
const INVITE_RECHECK = 30 * 60;

/**
 * The server's refusal text, reduced to something worth storing and worth showing a person.
 *
 * Matching happens once, here, so the backoff, the stored reason and the sentence the applicant eventually reads can
 * never disagree about what went wrong.
 */
export function refusalCode(detail: string | null | undefined): string {
  const why = (detail || "").toLowerCase();
  if (why.includes("guild is full")) return "guild_full";
  if (why.includes("already in a guild")) return "in_another_guild";
  if (why.includes("not found")) return "offline";
  if (why.includes("declin")) return "declined";
  return "other";
}

/**
 * The same thing in the second person, for /verify-status.
 *
 * This is the channel that has to carry it. The addon whispers a refusal the moment it happens, but only reaches
 * whoever is online at that moment; the people parked in another guild since 19 September mostly are not, and DMs
 * are barred while the app is flagged. A slash command works regardless. It has to include what to do about it,
 * because "your invite was refused" without the fix is a politer way of telling someone nothing.
 */
export function explainRefusal(code: string | null | undefined): string {
  switch (code) {
    case "in_another_guild":
      return (
        "**we cannot invite you while you are in another guild** \u2014 a character can only be in one at a time, and this " +
        "verification is for Olympus and no other guild. Type `/gquit` in game to leave your current guild, then " +
        "whisper your code back to the officer who messaged you: that returns you to the exact place in line you " +
        "already held, instead of waiting for the queue to come round again. If you would rather not whisper, the " +
        "invite still retries on its own"
      );
    case "ready_after_gquit":
      return (
        "**you are back in line at your original place** \u2014 you told us you left your old guild, so the hold on " +
        "your invite is lifted and an officer will send it shortly. Stay logged in on that character"
      );
    case "guild_full":
      return "the guild has reached its configured 1000-character planning limit, so no invite can go out yet \u2014 you keep your place in the queue";
    case "offline":
      return "the last invite went out while that character was offline \u2014 be logged in on it and the next one will land";
    case "declined":
      return (
        "**you declined the guild invite in game**, so no more are sent \u2014 that is deliberate, not a fault. If it " +
        "was a mis-click, press **Get my code** in the pinned guide (or run `/verify`) and whisper the new code, and you go back in the queue"
      );
    default:
      return "the last invite did not go through \u2014 it retries automatically";
  }
}

/** A batch of game events can decline, refuse, admit and remove several people; their notices go out as one post. */
export async function postEvents(env: Env, body: { events: EventIn[] },originalDispatch?:BetaRoleDispatch): Promise<Response> {
  // Item 15: the beta dispatch mode for every departure in this batch, captured before this entry's first await.
  const removal: RemovalDispatch = originalDispatch??captureBetaRoleDispatch(env);
  const notices = noticeBatch();
  const context:WatcherCapture={references:[]};
  let result:Response;
  try {
    result=await postEventsInner(env, body, notices,context,removal);
  } catch(error) {
    if(error instanceof PrivacySiteRequestHeld)result=await watcherHeldResult(env,context);
    else throw error;
  } finally {
    await flushNotices(env, notices);
  }
  try {if(result.status<400)await assertWatcherCurrent(env,context);}
  catch(error){if(error instanceof PrivacySiteRequestHeld)return watcherHeldResult(env,context);throw error;}
  return result;
}

async function postEventsInner(env: Env, body: { events: EventIn[] }, notices: NoticeBatch,context:WatcherCapture,removal:RemovalDispatch): Promise<Response> {
  const calls = callBudget(env); // .90 (P-20)
  const originalEnv=env;
  let applied = 0;
  for (const e of body.events ?? []) {
    let env=originalEnv;
    if (e.type === "invite" && e.name) {
      const key = normalizeCharacter(e.name);
      if (e.ok === false) {
        const code = refusalCode(e.detail);
        const full = code === "guild_full";
        const guilded = code === "in_another_guild";
        const backoff = full ? INVITE_RETRY_FULL : guilded ? INVITE_RETRY_GUILDED : INVITE_RETRY_OTHER;
        const row = await env.DB.prepare(
          queueSelect+"WHERE q.name_key = ?1 AND q.status IN ('queued','written','invited') ORDER BY id DESC LIMIT 1",
        )
          .bind(key)
          .first<CapturedQueue>();
        if(!row){await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code});applied++;continue;}
        const capture=privacyCaptureFromColumns(row.discord_id,row),reference={subject:row.discord_id,capture};
        env=bindWatcher(env,row.discord_id,capture,context);

        // Neither a full guild nor an offline applicant is something the person can act on, so neither counts
        // towards giving up on them. Offline mattered more than it looked: an invite fires at a moment nobody can
        // predict, so "not logged in just then" was costing an attempt, and six of those -- spread over a few hours
        // by the backoff -- retired the row entirely. People were being dropped from the queue for being asleep.
        const freeMiss = full || code === "offline";
        const attempts = (row.attempts ?? 0) + (freeMiss ? 0 : 1);
        // A decline is a person saying no. It is the only refusal in this pipeline that is a decision rather than
        // a condition, and retrying it argues with them -- six popups over three hours to someone who already
        // clicked "no". While the guild is at its cap it is also a seat: 91 people are waiting, and holding one
        // open for somebody who passed costs the next person their turn. So it stops here, and the whole value of
        // stopping is that they are told how to come back. Re-running /verify makes a new row, which is the back
        // of the queue -- the price of the turn they passed on, and cheap next to losing their place silently.
        if (code === "declined") {
          const result=await queueMutation(env,row,
            "status='declined',attempts=?1,last_reason=?2,last_reason_at=?3,retry_after=NULL,claimed_by=NULL,claimed_at=NULL",
            [attempts,code,now()]).run();
          if(!result.meta.changes)continue;
          await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code},reference);applied++;
          await audit(env, "system", "invite.declined", e.name, { attempts },reference);
          await notify(
            env,
            row.discord_id,
            `Your guild invite for **${e.name}** was declined, so we will not send another. If that was a ` +
              `mis-click, press **Get my code** in the pinned guide (or run \`/verify\`) and whisper the new code, and you go back in the queue.`,
            "invite declined",
            notices,
            capture,
          );
          continue;
        }

        const max = Math.max(1, intVar(env.INVITE_MAX_ATTEMPTS, 6));
        if (attempts >= max) {
          const result=await queueMutation(env,row,"status='expired',attempts=?1,last_reason=?2,last_reason_at=?3",[attempts,code,now()]).run();
          if(!result.meta.changes)continue;
          await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code},reference);applied++;
          await audit(env, "system", "invite.expired", e.name, { attempts, detail: e.detail },reference);
          await watcherStaffNotice(
            env,
            {
              content:
                `\u23f3 **${e.name}** has been given up on after ${attempts} refused invites \u2014 last reason: ${e.detail || "unknown"}. ` +
                `They are still verified, so re-running \`/verify\` puts them back in the queue.`,
              allowed_mentions: { parse: [] },
            },
            "invite expired",
            [reference],`${row.id}:${row.created_at}:${attempts}:${code}`,
          );
          continue;
        }

        const result=await queueMutation(env,row,
          "status='queued',attempts=?1,retry_after=?2,last_reason=?3,last_reason_at=?4,claimed_by=NULL,claimed_at=NULL",
          [attempts,now()+backoff,code,now()]).run();
        if(!result.meta.changes)continue;
        await audit(env,"watcher","invite.failed",e.name,{detail:e.detail,code},reference);applied++;

        // Tell staff once, the first time, that someone is waiting on themselves rather than on us.
        if (guilded && attempts === 1) {
          await watcherStaffNotice(
            env,
            {
              content:
                `\u26d4 **${e.name}** cannot be invited: they are still in another guild. The invite will keep retrying every ` +
                `${Math.round(INVITE_RETRY_GUILDED / 3600)}h, but it only succeeds once they leave it themselves.`,
              allowed_mentions: { parse: [] },
            },
            "applicant in another guild",
            [reference],`${row.id}:${row.created_at}:${attempts}:${code}`,
          );
          // And tell the applicant, who is the only person who can act on it. While the anti-spam flag is up this
          // costs nothing and sends nothing -- notify() drops it without calling Discord -- and it starts working
          // the day the appeal is granted. Until then the same sentence is waiting for them in /verify-status.
          await notify(
            env,
            row.discord_id,
            `Your guild invite for **${e.name}** could not be sent: ${explainRefusal("in_another_guild")}.`,
            "invite refused: in another guild",
            notices,
            capture,
          );
        }
        continue;
      }
      const rows=await env.DB.prepare(queueSelect+"WHERE q.name_key=?1 AND q.status IN ('queued','written') ORDER BY id").bind(key).all<CapturedQueue>();
      const references:PrivacyReference[]=[];
      for(const row of rows.results){
        const capture=privacyCaptureFromColumns(row.discord_id,row),reference={subject:row.discord_id,capture};
        const scoped=bindWatcher(originalEnv,row.discord_id,capture,context);
        const r=await queueMutation(scoped,row,"status='invited',invited_at=?1,retry_after=?2,last_reason=NULL,last_reason_at=NULL",[e.ts??now(),now()+INVITE_RECHECK]).run();
        if(r.meta.changes)references.push(reference);
      }
      if (references.length) {
        applied++;
        await audit(env, "watcher", "invite.fired", e.name, { detail: e.detail },references);
      }
    } else if (e.type === "joined" && e.name) {
      // the addon saw the character on the roster (MemberExistsByName), or an officer's signed confirmation whisper
      // went out, or the chat log merely said "has joined the guild" — only the first two are trusted
      const key = normalizeCharacter(e.name);
      const c = await getCharacter(env, key);
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      // Capture fallback queue ownership before the roster/provider await. A no-character
      // event still cannot adopt a freshly recreated request under the same character name.
      const queueRows=await env.DB.prepare(queueSelect+"WHERE q.name_key=?1 AND q.status IN ('queued','written','invited') ORDER BY id").bind(key).all<CapturedQueue>();
      const queueReferences=queueRows.results.map(row=>({subject:row.discord_id,capture:privacyCaptureFromColumns(row.discord_id,row)}));
      const trusted = isAuthoritative(e) || (await onLatestRoster(env, key));
      const cutoff = linksNotBefore(env);
      if (c && trusted && !c.guid && cutoff && c.bound_at < cutoff && ["verified", "queued", "left_pending"].includes(c.status)) {
        // A link from before LINKS_NOT_BEFORE with no GUID pinned: this join may be a namesake of the character that
        // was linked. The next roster export (which carries GUIDs) releases or confirms it; a join line never does.
        await audit(env, "watcher", "invite.joined_stale_link", e.name, { origin: e.origin, discordId: c.discord_id, boundAt: c.bound_at },reference);
        applied++;
        continue;
      }
      if (c && ["verified", "queued", "left_pending"].includes(c.status)) {
        if (trusted) {
          await promote(env, c.discord_id, key, c.name, notices, undefined, calls,privacyCaptureFromColumns(c.discord_id,c),removal);
          applied++;
          await audit(env, "watcher", "invite.joined", e.name, { detail: e.detail, origin: e.origin, promoted: true },reference);
          continue;
        }
        // Unverified claim: record it, grant nothing. The roster export decides.
        await audit(env, "watcher", "invite.joined_unconfirmed", e.name, { detail: e.detail, origin: e.origin, discordId: c.discord_id },reference);
        applied++;
      }
      const joinedReferences:PrivacyReference[]=[];
      for(let i=0;i<queueRows.results.length;i++){
        const row=queueRows.results[i]!,queueReference=queueReferences[i]!;
        if(reference&&queueReference.subject!==reference.subject)continue;
        const scoped=bindWatcher(env,row.discord_id,queueReference.capture,context);
        const r=await queueMutation(scoped,row,"status='joined',joined_at=?1",[e.ts??now()]).run();
        if(r.meta.changes)joinedReferences.push(queueReference);
      }
      if (joinedReferences.length) {
        applied++;
        await audit(env, "watcher", "invite.joined", e.name, { detail: e.detail },joinedReferences);
      }
    } else if (e.type === "left" && e.name) {
      // "has left the guild" / "has been kicked out of the guild by X"
      const key = normalizeCharacter(e.name);
      const c = await getCharacter(env, key);
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      if (c && (c.status === "member" || c.status === "left_pending")) {
        if (isAuthoritative(e)) {
          await demote(env, c.discord_id, key, c.name, e.detail || "in game", { batch: notices,capture:reference!.capture,removal });
          applied++;
        } else if (c.status === "member") {
          // Forgeable text: arm the removal instead of performing it. The next roster export either confirms the
          // departure (and the role goes) or shows them still on the roster (and the flag is cleared).
          await env.DB.prepare(`UPDATE characters SET status = 'left_pending' WHERE name_key = ?1 AND discord_id=?2 AND ${privacyGenerationFenceSql(2,3)}`).bind(key,c.discord_id,reference!.capture?.subjectGeneration??null).run();
          await audit(env, "watcher", "roster.left_pending", e.name, { detail: e.detail, origin: e.origin, discordId: c.discord_id },reference);
          await logLine(
            env,
            `\u23f3 roster: **${c.name}** (<@${c.discord_id}>) looks like they left the guild (${e.detail || "chat log"}). ` +
              `The role stays until a roster export confirms it.`,
            [reference!],
          );
          applied++;
        }
      }
    } else if (e.type === "removed" && e.name) {
      // An officer freed a seat from the panel. Authoritative by construction — only their own client writes this —
      // and deliberately distinguished from an ordinary departure so the person is told why and keeps their binding.
      const key = normalizeCharacter(e.name);
      const c = await getCharacter(env, key);
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      if (e.ok === false) {
        await audit(env, "watcher", "roster.remove_failed", e.name, { detail: e.detail },reference);
        applied++;
      } else if (c && (c.status === "member" || c.status === "left_pending")) {
        await demote(env, c.discord_id, key, c.name, e.detail || "removed to free a seat", { space: e.reason === "space", batch: notices,capture:privacyCaptureFromColumns(c.discord_id,c),removal });
        applied++;
      } else {
        await audit(env, "watcher", "roster.removed_unlinked", e.name, { detail: e.detail, reason: e.reason },reference);
        // A removal for being unverified has no Discord side to undo (there is no binding), so the log line is the
        // only place staff see it happened, and who did it.
        if (e.reason === "unverified") {
          await logLine(env, `\u{1F6AA} removed in game for not verifying: **${e.name}**${e.detail ? ` \u2014 ${e.detail}` : ""}.`,reference?[reference]:undefined);
        }
        applied++;
      }
    } else if (e.type === "identity" && e.name) {
      // The addon's signed note naming the character behind a confirmed code. Normally its GUID arrived with the
      // verification itself; this pins a link that was made without it (a note in a later chat-log write, say). Only a
      // fresh, unpinned link, and never a GUID another live link already holds.
      const g = playerGuid(e.guid);
      if (g && isAuthoritative(e)) {
        const key=normalizeCharacter(e.name),c=await getCharacter(env,key);
        if(!c||c.privacy_state&&c.privacy_state!=='active')continue;
        const capture=privacyCaptureFromColumns(c.discord_id,c);
        env=bindWatcher(env,c.discord_id,capture,context);
        const r = await env.DB.prepare(
          `UPDATE characters SET guid = ?2
            WHERE name_key = ?1 AND discord_id=?4 AND ${privacyGenerationFenceSql(4,5)} AND guid IS NULL AND bound_at >= ?3 AND status IN ('verified','queued','member','left_pending')
              AND NOT EXISTS (SELECT 1 FROM characters c2 WHERE c2.guid = ?2 AND c2.name_key <> ?1 AND c2.status IN ('verified','queued','member','left','left_pending'))`,
        )
          .bind(key, g, now() - 6 * 3600,c.discord_id,capture?.subjectGeneration??null)
          .run();
        if (r.meta.changes) await audit(env, "watcher", "verify.guid_pinned", e.name, { guid: g },{subject:c.discord_id,capture});
      }
      applied++;
    } else if (e.type === "guild_full") {
      await audit(env, "watcher", "guild.full", undefined, { detail: e.detail, candidates: e.candidates?.length ?? 0 });
      applied++;
      await noticeGuildFull(env, e);
    } else if (e.type === "note" && e.name) {
      const c=await getCharacter(env,normalizeCharacter(e.name));
      if(c?.privacy_state&&c.privacy_state!=='active')continue;
      const reference=c?{subject:c.discord_id,capture:privacyCaptureFromColumns(c.discord_id,c)}:undefined;
      if(reference)env=bindWatcher(env,reference.subject,reference.capture,context);
      await audit(env, "watcher", e.ok === false ? "note.failed" : "note.set", e.name, { detail: e.detail },reference);
      applied++;
    }
  }
  return json({ applied });
}

export async function postRoster(env: Env, body: { exportedAt: number; members: RosterMemberIn[];nativeGuild?:string;nativeRealm?:string;nativeRankTable?:unknown }, defer?: (label: string, work: () => Promise<unknown>) => void,originalDispatch?:BetaRoleDispatch,rankProtocol=false): Promise<Response> {
  const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
  const launch=captureLaunchVerification(env);
  if(launch.mode==='held')return json({error:'verification_native_scope_unconfirmed'},503);
  if(launch.mode==='members-only'){
    if(!launch.scope||body.nativeGuild!==launch.scope.guild||body.nativeRealm!==launch.scope.realm)return json({error:'native_roster_scope_mismatch'},409);
    env=launchVerificationEnv(env,launch);
  }
  // Revision 4 (A1): the lane configuration is captured here, before any await of this export, and handed to ingestRoster
  // (roster.ts cannot import the lane module: full-release-roles reaches roster.ts, so that would be a module-load cycle).
  const lane = captureLaneConfig(env);
  if (!Array.isArray(body.members) || !body.exportedAt) return json({ error: "exportedAt and members[] required" }, 400);
  const source=launch.mode==='members-only' ? rankProtocol
    ? nativeSnapshotSource(launch.scope!.guild,launch.scope!.realm,body.nativeRankTable,body.members)
    : launch.scope!.provenance : "addon";
  const summary = await ingestRoster(env, body.exportedAt, body.members, source, lane.configured && defer ? { cap: lane, defer } : undefined,roleDispatch);
  // .115 (Codex's review of f975, 3 Oct 2026, 13:15 UTC, finding 2): an export refused for duplicate names is a 422, which
  // the watcher takes as final (watcher.py Worker.call: a 4xx is not retried, since sending it again changes nothing).
  // The review of 3 Oct 2026 added "unusable" (every batch committed, and the stored rows still fell short of the count):
  // final for the same reason, so it never holds the watcher's later posts behind it as a retried 500 would.
  return json(summary, "refused" in summary ? 422 : 200);
}

/**
 * Invites for one officer's client to fire.
 *
 * `officer` is that watcher's identity. Before per-officer claims this endpoint handed every waiting invite to every
 * caller, so a second officer running the addon would write the same rows into their own OlympusQueue.lua and invite
 * the same people — duplicate invites and a confusing "already in a guild" for the applicant. A claim is an exclusive
 * hold that is refreshed on every poll and lapses after QUEUE_CLAIM_TTL_MINUTES of silence, so an officer who closes
 * the game hands their rows back on their own rather than stranding them.
 *
 * With no officer given (an older watcher, or a one-officer setup) the behaviour is exactly as before.
 */
export async function getQueue(env: Env, officer = "", presenceOnly = false, cacheOnly242 = false): Promise<Response> {
  // .227: verification-only collectors still report presence on this endpoint,
  // but neither a new nor an older host may claim retained invitation rows.
  const launch = captureLaunchVerification(env);
  if (launch.mode === 'held' || !launch.current() || launch.mode === 'members-only' && !launch.scope)
    return json({ error: 'verification_configuration_held' }, 503);
  // Honor the host's read-only intent even when this implementation selects legacy
  // mode. It must not claim retained invitations before the host rejects a reply.
  if (presenceOnly === true || launch.mode === 'members-only' && !cacheOnly242) return json({ presenceOnly: true, entries: [], setGuildNote: false });
  // Explicit, version-fenced members-only cache reads never enter invitation or relay dispatch.
  if (cacheOnly242) {
    if (launch.mode !== 'members-only') return json({ error: 'unsupported_protocol' }, 400);
    return json({ presenceOnly: true, entries: [], setGuildNote: false, verificationResults: await (await import('./role-reconcile242')).verificationResults242(env) });
  }
  const who = officer.trim().slice(0, 64);
  const ttl = Math.max(1, intVar(env.QUEUE_CLAIM_TTL_MINUTES, 15)) * 60;
  const limit = Math.max(1, intVar(env.QUEUE_CLAIM_LIMIT, 25));
  const extra = Math.max(0, intVar(env.QUEUE_CLAIM_PRIORITY_EXTRA, 10));
  const t = now();

  if (who) {
    // A row that is backing off after a refusal is not offered again until its retry_after has passed, so a hard
    // refusal costs one invite key press rather than one per poll.
    const live = "status IN ('queued','written') AND (retry_after IS NULL OR retry_after <= ?2)";
    const free = "(claimed_by IS NULL OR claimed_at IS NULL OR claimed_at < ?3)"; // unclaimed, or its officer stopped polling
    // 1. Claims are sticky: whatever this officer already holds stays theirs while their watcher keeps polling. The
    //    game client only reads the queue file at /reload, so a row that moved to another officer would still sit in
    //    this officer's client and could be invited twice. Until 29 Sep (build .41) each poll re-claimed the top rows
    //    in queue order instead, so a burst of reserved names at the top pushed held rows out to the next officer.
    const kept = await env.DB.prepare(
      `UPDATE invite_queue SET claimed_at = ?2
        WHERE id IN (SELECT id FROM invite_queue WHERE claimed_by = ?1 AND ${live} ORDER BY priority DESC, id LIMIT ?3)`,
    )
      .bind(who, t, limit + extra)
      .run();
    let held = kept.meta?.changes ?? 0;
    // 2. The spare capacity takes new rows in queue order (reserved names first).
    if (held < limit) {
      const got = await env.DB.prepare(
        `UPDATE invite_queue SET claimed_by = ?1, claimed_at = ?2
          WHERE id IN (SELECT id FROM invite_queue WHERE ${live} AND ${free} ORDER BY priority DESC, id LIMIT ?4)`,
      )
        .bind(who, t, t - ttl, limit - held)
        .run();
      held += got.meta?.changes ?? 0;
    }
    // 3. Reserved names may go on top of a full hand, up to QUEUE_CLAIM_PRIORITY_EXTRA of them. Held rows never move,
    //    so without this a lone officer holding rows that cannot be invited yet (players offline) would never be
    //    handed the reserved names at all.
    if (held < limit + extra) {
      await env.DB.prepare(
        `UPDATE invite_queue SET claimed_by = ?1, claimed_at = ?2
          WHERE id IN (SELECT id FROM invite_queue WHERE ${live} AND priority > 0 AND ${free} ORDER BY priority DESC, id LIMIT ?4)`,
      )
        .bind(who, t, t - ttl, limit + extra - held)
        .run();
    }
  }

  const ready = "status IN ('queued','written') AND (retry_after IS NULL OR retry_after <= ?2)";
  // Build .41: reserved names the guild site queued (priority 1) come first, then everyone else in the order they
  // arrived. The same order everywhere: this claim, this list, the positions below, and waitlistPosition.
  type Row = { id: number; name: string; discord_id: string; note: string | null; status: string; last_reason: string | null; priority: number };
  // Only the rows this call claimed or kept (claimed_at = now): at most QUEUE_CLAIM_LIMIT, plus reserved names.
  const rows = who
    ? await env.DB.prepare(`SELECT id, name, discord_id, note, status, last_reason, priority FROM invite_queue WHERE ${ready} AND claimed_by = ?1 AND claimed_at = ?2 ORDER BY priority DESC, id`)
        .bind(who, t)
        .all<Row>()
    : await env.DB.prepare(`SELECT id, name, discord_id, note, status, last_reason, priority FROM invite_queue WHERE ${ready.replace("?2", "?1")} ORDER BY priority DESC, id`)
        .bind(t)
        .all<Row>();

  // Each entry's place in the global line, 1-based -- not its index in the slice this officer happens to hold.
  //
  // getQueue claims a slice (ORDER BY id LIMIT QUEUE_CLAIM_LIMIT), so with two officers running the addon the
  // second one's first row is globally somewhere past the first one's last claim. Numbering the returned array
  // would hand every officer their own "1", and /verify-status already quotes the global number straight to the
  // applicant (waitlistPosition's count; since .115 read for the account's own rows in guild-seats.ts). Two surfaces
  // disagreeing about someone's place in line is a support ticket, so both count the same rows the same way.
  //
  // That means counting WITHOUT the retry_after filter, exactly as waitlistPosition does: a row backing off after
  // a refusal is still ahead of you and still gets served first, so it still occupies a place.
  //
  // Deliberately a second SELECT of ids rather than ROW_NUMBER() OVER (ORDER BY id). The ready set is tens of rows
  // and the cost is noise, whereas a window function D1 turned out to reject at runtime would take the entire
  // invite queue down -- and this queue is the only path any applicant has into the guild.
  const ordered = await env.DB.prepare("SELECT id FROM invite_queue WHERE status IN ('queued','written') ORDER BY priority DESC, id").all<{ id: number }>();
  const positionOf = new Map<number, number>();
  ordered.results.forEach((r, i) => positionOf.set(r.id, i + 1));

  return json({
    generatedAt: t,
    officer: who,
    claimTtlSeconds: ttl,
    setGuildNote: env.SET_GUILD_NOTE === "true",
    waiting: ordered.results.length,
    entries: rows.results.map((r) => ({
      id: r.id,
      character: r.name,
      discordId: r.discord_id,
      note: r.note ?? "",
      status: r.status,
      position: positionOf.get(r.id) ?? 0,
      // Carried so the officer panel can mark the row that is actionable right now: somebody who just left their
      // old guild because we asked them to and is standing there with no guild at all.
      lastReason: r.last_reason ?? "",
      // 1 = a reserved name from the guild site: the panel marks it, and it goes before the rest.
      priority: r.priority ?? 0,
    })),
  });
}

export async function postQueueWritten(env: Env, body: { ids: number[]; officer?: string }): Promise<Response> {
  const who = (body.officer ?? "").trim().slice(0, 64);
  let n = 0;
  for (const id of body.ids ?? []) {
    // Only mark rows this officer actually holds: a stale acknowledgement must not overwrite a row that has since
    // been reclaimed by someone else.
    const r = await env.DB.prepare(
      "UPDATE invite_queue SET status = 'written', written_at = ?2 WHERE id = ?1 AND status = 'queued' AND (?3 = '' OR claimed_by IS NULL OR claimed_by = ?3)",
    )
      .bind(id, now(), who)
      .run();
    n += r.meta.changes ?? 0;
  }
  return json({ marked: n });
}

/**
 * "I have left my old guild" — the applicant whispering their code back after an in_another_guild refusal.
 *
 * Nothing here grants anything new. The row already exists and already holds its original, low id; the refusal
 * merely parked it behind a retry_after. Clearing that makes it servable again AT ITS ORIGINAL POSITION, which is
 * exactly what the refusal whisper promised them ("your place in the queue is kept"). They jump nobody: they were
 * at the front when we tried to invite them, which is why we tried.
 *
 * The attempt the refusal charged them is refunded too. Being in another guild is the one refusal the applicant
 * can actually fix, and letting it eat their INVITE_MAX_ATTEMPTS budget would mean the person who did what we
 * asked runs out of tries sooner than the person who ignored us.
 *
 * Authentication is the same as any other whispered code: the code is an HMAC over their character name, and the
 * game itself vouches for the sender of a whisper. No new trust path, and nothing here can be triggered by
 * anybody except the character it concerns.
 */
async function resumeAfterGuildLeave(env: Env, nameKey: string, name: string, source: string,context:WatcherCapture) {
  const row = await env.DB.prepare(
    queueSelect+"WHERE q.name_key = ?1 AND q.status IN ('queued','written','invited') ORDER BY id LIMIT 1",
  )
    .bind(nameKey)
    .first<CapturedQueue>();
  if (!row) return null;
  const capture=privacyCaptureFromColumns(row.discord_id,row),reference={subject:row.discord_id,capture};
  env=bindWatcher(env,row.discord_id,capture,context);

  const t = now();
  // Only meaningful for a row actually held back by that refusal. A row already servable needs no help, and
  // re-firing on every stray whisper would refund an attempt each time.
  if (row.last_reason !== "in_another_guild" || (row.retry_after ?? 0) <= t) return null;

  const attempts = Math.max(0, (row.attempts ?? 0) - 1);
  const result=await queueMutation(env,row,
    "status='queued',retry_after=NULL,claimed_by=NULL,claimed_at=NULL,attempts=?1,last_reason='ready_after_gquit',last_reason_at=?2",
    [attempts,t]).run();
  if(!result.meta.changes)return {refused:true} as const;

  const pos = await waitlistPosition(env, nameKey);
  await audit(env, "watcher", "invite.resumed", name, { discordId: row.discord_id, source, position: pos, attempts },reference);
  await logLine(
    env,
    `\u{1F513} **${name}** (<@${row.discord_id}>) left their old guild and confirmed it — back in the queue at #${pos}, ready to invite.`,
    [reference],
  );
  await notify(
    env,
    row.discord_id,
    `Thanks — **${name}** is back in the invite queue at position ${pos}. An officer will invite you shortly.`,
    "resumed after leaving guild",
    undefined,capture,
  );
  return { name, position: pos, attempts };
}

/** Where an applicant sits in the queue while the guild is full, 1-based; 0 when they are not waiting. */
export async function waitlistPosition(env: Env, nameKey: string): Promise<number> {
  const mine = await env.DB.prepare(
    "SELECT id, priority FROM invite_queue WHERE name_key = ?1 AND status IN ('queued','written') ORDER BY priority DESC, id LIMIT 1",
  )
    .bind(nameKey)
    .first<{ id: number; priority: number | null }>();
  if (!mine) return 0;
  // Ahead: every higher-priority row, and every same-priority row that arrived first (getQueue's order).
  const ahead = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM invite_queue WHERE status IN ('queued','written') AND (priority > ?2 OR (priority = ?2 AND id < ?1))",
  )
    .bind(mine.id, mine.priority ?? 0)
    .first<{ n: number }>();
  return (ahead?.n ?? 0) + 1;
}

/**
 * Tell staff the guild is full and who the addon would suggest removing — once an hour at most. The list is posted
 * rather than acted on: the addon ranks, a human decides, and putting the shortlist in a channel means the decision
 * is visible to the other officers instead of happening quietly in one person's client.
 */
async function noticeGuildFull(env: Env, e: EventIn): Promise<void> {
  const channel = staffChannel(env);
  if (!channel) return;
  const recent = await env.DB.prepare("SELECT ts FROM audit WHERE action = 'guild.full_notified' ORDER BY id DESC LIMIT 1").first<{ ts: number }>();
  if (recent && now() - recent.ts < 3600) return;

  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM invite_queue WHERE status IN ('queued','written')").first<{ n: number }>();
  const lines = [
    `\u{1F6D1} **The guild is full.** Invites are being refused, and ${waiting?.n ?? 0} verified applicant(s) are waiting for a seat.`,
  ];
  // .115 (item B): the count the members are shown (guild-seats.ts), so staff read the same state they do.
  lines.push(seatsStaffLine((await guildSeats(env)).seats));
  if (e.candidates?.length) {
    lines.push("", "The addon's suggestions, longest away first \u2014 **nobody has been removed**:");
    for (const c of e.candidates.slice(0, 5)) {
      lines.push(`\u2022 **${c.name ?? "?"}** \u2014 level ${c.level ?? "?"}, ${c.rank ?? "?"}, away ${Math.floor(c.days ?? 0)} days`);
    }
    lines.push("", "Officers and anyone with a hold note are excluded. Remove from the officer panel in game; each removal takes two clicks and frees one seat.");
  } else {
    lines.push("", `Nobody currently meets the removal criteria${e.detail ? ` (${e.detail})` : ""}, so the queue will keep waiting until someone leaves.`);
  }
  const posted = await staffNotice(env, { content: lines.join("\n"), allowed_mentions: { parse: [] } }, "guild is full");
  // Written either way, for the same reason as the officer rank check: a notice that cannot be delivered must not be
  // retried on every event that triggers it.
  await audit(env, "system", "guild.full_notified", undefined, { candidates: e.candidates?.length ?? 0, posted });
}

/**
 * Half-hourly housekeeping on the invite queue, run from the scheduled handler.
 *
 * Two jobs. An invite that fired and was never accepted comes back into play once its recheck time passes, so
 * `invited` stops being the hole that swallowed 91 people on 19 September. And a row that has been refused more
 * times than we are willing to keep pressing for is retired, with staff told, instead of retrying forever.
 */
export async function sweepInviteQueue(env: Env): Promise<{ requeued: number; expired: number }> {
  const t = now();
  const max = Math.max(1, intVar(env.INVITE_MAX_ATTEMPTS, 6));

  // A NULL retry_after means "due now", not "skip forever".
  //
  // The column arrived with the .18 migration, so every row already sitting in `invited` at that moment got NULL --
  // which is precisely the 91 people this sweep was written to rescue. `retry_after IS NOT NULL` excluded all of
  // them. getQueue does not serve `invited` either, so they were invisible to both halves of the system and stayed
  // parked while the fix for them ran past every half hour reporting nothing to do.
  const re = await env.DB.prepare(
    "UPDATE invite_queue SET status = 'queued', claimed_by = NULL, claimed_at = NULL, retry_after = NULL " +
      "WHERE status = 'invited' AND (retry_after IS NULL OR retry_after <= ?1) AND attempts < ?2",
  )
    .bind(t, max)
    .run();
  const requeued = re.meta.changes ?? 0;

  const ex = await env.DB.prepare("UPDATE invite_queue SET status = 'expired' WHERE status IN ('queued','written','invited') AND attempts >= ?1")
    .bind(max)
    .run();
  const expired = ex.meta.changes ?? 0;

  // Audited every run, not only when it changed something. A sweep that reports nothing and a sweep that never ran
  // looked identical in the audit table all day, which is why a stuck queue read as a quiet one.
  await audit(env, "cron", "queue.swept", undefined, { requeued, expired, max });
  if (expired) {
    await staffNotice(
      env,
      {
        content:
          `\u23f3 ${expired} invite(s) retired after ${max} refusals each. Those people are still verified \u2014 ` +
          `re-running \`/verify\` puts them back in the queue. \`/olympus-admin queue\` lists what is still waiting.`,
        allowed_mentions: { parse: [] },
      },
      "invites retired",
    );
  }
  return { requeued, expired };
}
