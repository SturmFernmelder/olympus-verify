import {captureBetaRoleDispatch,type BetaRoleDispatch} from './beta-reset-policy';
/**
 * Put Guild Member back on someone the database already counts as in the guild, when Discord says they lack it.
 *
 * Why this exists (25 Sep 2026). promote() grants the role once, on the transition into membership, and every roster
 * pass skips status = 'member' after that. MEE6's role menus in #pick-your-role write a member's whole role list from
 * MEE6's own copy of it. When someone picks a class in the same moment this bot grants Guild Member, MEE6's copy
 * predates the grant and its write takes the role away again. The audit log shows it for Magnus Manipulate at
 * 14:06 UTC: Paladin added by MEE6, Guild Member added by this bot, then one MEE6 update, "DPS added, Guild Member
 * removed". Nothing ever gave it back, and /verify kept answering "already verified and in the guild".
 *
 * Checking is free: every guild interaction carries the member's current roles. Only a missing role costs a Discord
 * call. A banned account never gets the role back, because /olympus-admin ban leaves its characters at 'member'
 * until the in-game kick reaches the roster.
 */
import { intVar, type Env } from "./env";
import { audit, now, type PrivacyReference } from "./db";
import { DiscordError, explainDiscordError, guildMember, logLine } from "./discord";
import { grantMemberRole, heldBlockingRole, reconcileBanned, readBannedSweepReferences280, removeIfBlocked, budgetExhausted, callBudget, takeCall, affords, reserve, inventoryCalls, GRANT_CALLS, type CallBudget } from "./roles";
import { SCHEDULED_CAPS, type RoleSweepLane1112 } from "./scheduled-budget";
import { captureCanonicalRankConfig233 } from "./canonical-ranks233";
import { privacyCaptureFromColumns,privacyGenerationFenceSql,privacyProviderCustodyDatabase,type PrivacySubject } from './privacy-serving-authority';
import { continueRosterRanks,RANK_CONTINUATION_HTTP_RESERVE } from './role-rank-continuation';
import { isPrivacyWriteAdmissionDatabase } from './privacy-write-admission';
import { membershipSettlementEnabled,membershipTransitionEnabled } from './membership-role-transition';
type SweepSubject={discord_id:string;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null;rank_snapshot_id:number|null};

export type RestoreResult = "has-role" | "restored" | "not-member" | "banned" | "blocked" | "held" | "failed" | "unknown";

export async function restoreMemberRole(env: Env, userId: string, roles: string[] | undefined, source: string,originalDispatch?:BetaRoleDispatch): Promise<RestoreResult> {
  const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
  const role = env.ROLE_GUILD_MEMBER;
  if (!role) return "has-role"; // no member role configured: nothing to restore
  if (!roles || !/^\d{5,25}$/.test(userId)) return "unknown"; // not a guild interaction, so no roles to compare
  if (roles.includes(role)) return "has-role";
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM characters WHERE discord_id = ?1 AND status IN ('member','left_pending')) AS n, " +
      "(SELECT banned FROM members WHERE discord_id = ?1) AS banned, (SELECT generation FROM privacy_subjects WHERE subject_id=?1) AS privacy_generation, (SELECT state FROM privacy_subjects WHERE subject_id=?1) AS privacy_state, (SELECT revision FROM privacy_subjects WHERE subject_id=?1) AS privacy_revision",
  )
    .bind(userId)
    .first<{ n: number; banned: number | null } & SweepSubject>();
  if (!row || !row.n) return "not-member";
  if (row.banned) return "banned";
  if(row.privacy_state&&row.privacy_state!=='active')return 'held';
  const capture=privacyCaptureFromColumns(userId,row),reference={subject:userId,capture};
  // .55: a held blocking role (Quarantine, Flagellant) withholds the restore; the sweep gives the role back once lifted.
  if (heldBlockingRole(env, roles)) {
    await audit(env, "system", "role.blocked", userId, { source, blockedBy: heldBlockingRole(env, roles) },reference);
    return "blocked";
  }
  try {
    // .58: the writer re-reads the member and the ban at the effect; the payload's roles above were only the first look.
    const writer=grantMemberRole as unknown as (...args:[Env,string,string,string,string[]|undefined,undefined,{subjectGeneration:string|null},BetaRoleDispatch])=>ReturnType<typeof grantMemberRole>;
    const outcome = await writer(env, userId, `olympus-verify: Guild Member restored (${source}); the roster already has this member`, source, roles,undefined,{subjectGeneration:capture?.subjectGeneration??null},roleDispatch);
    if (outcome === "misconfigured" || outcome === "unverified") return "failed";
    if (outcome === "banned") return "banned";
    if (outcome === "blocked") return "blocked";
    if (outcome === "held") return "held"; // .114: a rename Blizzard required; /verify-status explains it (rename-review.ts)
    if (outcome === "not-in-server") return "unknown";
    if (outcome !== "granted") return "has-role";
  } catch (e) {
    await audit(env, "system", "role.restore_failed", userId, { source, error: String(e).slice(0, 200) },reference);
    await logLine(env, `⚠️ role: <@${userId}> is in the guild but has no Guild Member, and putting it back failed: ${explainDiscordError(e)}`,[reference]);
    return "failed";
  }
  await audit(env, "system", "role.restored", userId, { source },reference);
  await logLine(env, `♻️ role: Guild Member was missing for <@${userId}> although the roster has them in the guild — restored (${source}).`,[reference]);
  return "restored";
}

/** The line shown to the member, or "" when there is nothing to say. */
export function restoreNote(r: RestoreResult): string {
  if (r === "restored") return "Your **Guild Member** role had gone missing. It is back now.";
  if (r === "failed") return "Your **Guild Member** role is missing and the bot could not put it back. Staff have been told.";
  if (r === "blocked") return "Your **Guild Member** role is on hold while a server restriction is on your account; ask a server moderator about that.";
  if (r === "held") return "Automatic restoration of your **Guild Member** role is currently on hold. Ask an officer to check your access.";
  return "";
}

// ---------- the automatic sweep ----------
//
// Nobody should have to press anything. Twice an hour from the cron, and every five minutes while the watcher is
// polling (which is exactly when promotions happen), one sweep looks at a handful of accounts the database counts as
// in the guild and puts Guild Member back wherever Discord shows it missing:
//   1. every promotion since the last sweep, once it is SETTLE_SECONDS old -- MEE6's stale write lands around the
//      grant, so this is where lost roles turn up, and it catches them within minutes;
//   2. then, with whatever budget is left, the next accounts in a rotation over every member, so older cases (the
//      role lost before this existed, someone who left the Discord and came back) are found too.
// State lives in the newest `role.sweep` audit row: the last promotion's audit id and the rotation cursor.

/** Accounts one sweep may look at. Each costs a member lookup, plus a grant when the role is gone, so 10 keeps a
 *  sweep at about 22 Discord calls, inside the 50 a free-plan Worker may make per request. ROLE_SWEEP_PER_RUN
 *  raises it on a paid plan, at most to SCHEDULED_CAPS.roleSweepAccounts (20; it was 50 until .115: each account may
 *  cost up to seven D1 statements, and the cron's run shares one invocation's statement limit with every other job;
 *  Codex, 3 Oct 2026 13:26 UTC, scheduled-budget.ts). */
export const SWEEP_DEFAULT = 10;
/** A fresh grant is left alone this long before it is checked: MEE6's stale write lands seconds to minutes later. */
export const SETTLE_SECONDS = 180;
/** The watcher polls /queue every 30 seconds; a sweep rides on those polls at most this often. */
export const THROTTLE_SECONDS = 300;
/** .60: banned accounts one sweep re-checks for a Guild Member role they should not hold (5; .115: read from scheduled-budget.ts, which counts them). */
export const BANNED_PER_RUN = SCHEDULED_CAPS.roleSweepBanned;
/** .99: member lookups Discord did not answer (403, 500, a network error) before a sweep stops: those accounts stay unfinished and are retried first next run. */
export const LOOKUP_FAILURES_PER_RUN = 2;

interface SweepState {
  a: number; // audit id of the last promotion already looked at
  c: string; // rotation cursor: the last discord_id looked at ("" = start over)
  b?: string; // .60: banned-reconciliation cursor
}

type Progress280=Readonly<{state:'recorded'|'held'|'unknown';reason:string}>;
type ProgressMode280='ordinary'|'ban'|'combined';
type ProgressHead280=Readonly<{id:number|null;ts:number|null;details:string|null;work:Partial<SweepState>|null;valid:boolean;reference:PrivacyReference|null}>;
type ProgressRow280={ac_id:number|null;ac_ts:number|null;ac_details:string|null;ac_valid:number;b_id:number|null;b_ts:number|null;b_details:string|null;b_valid:number;
 ac_generation:string|null;ac_state:string|null;ac_revision:number|null;b_generation:string|null;b_state:string|null;b_revision:number|null};
const cursor280=(value:unknown):value is string=>typeof value==='string'&&(value===''||/^[0-9]{17,20}$/.test(value));
// Malformed/unknown records are relevant to both heads, so they cannot be
// silently skipped in favour of an older apparently usable progress record.
const object280=(alias:string)=>`CASE WHEN json_valid(${alias}.details) THEN CASE WHEN json_type(${alias}.details)='object'
 AND (SELECT COUNT(*) FROM json_each(${alias}.details))=(SELECT COUNT(DISTINCT key) FROM json_each(${alias}.details)) THEN 1 ELSE 0 END ELSE 0 END`;
const relevant280=(lane:'ordinary'|'ban',alias='s')=>`CASE WHEN (${object280(alias)})=1 THEN CASE
 WHEN json_type(${alias}.details,'$.lane') IS NULL THEN 1
 WHEN json_type(${alias}.details,'$.lane')='text' AND json_extract(${alias}.details,'$.lane') IN('ordinary','ban')
 THEN json_extract(${alias}.details,'$.lane')='${lane}' ELSE 1 END ELSE 1 END=1`;
const headId280=(lane:'ordinary'|'ban')=>`(SELECT s.id FROM audit s WHERE s.action='role.sweep' AND (${relevant280(lane)}) ORDER BY s.id DESC LIMIT 1)`;
const field280=(alias:string,key:'c'|'b')=>`CASE WHEN json_valid(${alias}.details) THEN CASE WHEN json_type(${alias}.details,'$.${key}')='text' THEN json_extract(${alias}.details,'$.${key}') ELSE NULL END ELSE NULL END`;
const progressRead280=`SELECT ac.id AS ac_id,ac.ts AS ac_ts,ac.details AS ac_details,${object280('ac')} AS ac_valid,
 b.id AS b_id,b.ts AS b_ts,b.details AS b_details,${object280('b')} AS b_valid,
 (SELECT generation FROM privacy_subjects WHERE subject_id=${field280('ac','c')}) AS ac_generation,
 (SELECT state FROM privacy_subjects WHERE subject_id=${field280('ac','c')}) AS ac_state,
 (SELECT revision FROM privacy_subjects WHERE subject_id=${field280('ac','c')}) AS ac_revision,
 (SELECT generation FROM privacy_subjects WHERE subject_id=${field280('b','b')}) AS b_generation,
 (SELECT state FROM privacy_subjects WHERE subject_id=${field280('b','b')}) AS b_state,
 (SELECT revision FROM privacy_subjects WHERE subject_id=${field280('b','b')}) AS b_revision
 FROM (SELECT ${headId280('ordinary')} AS ac,${headId280('ban')} AS b) h
 LEFT JOIN audit ac ON ac.id=h.ac LEFT JOIN audit b ON b.id=h.b`;
function parseProgress280(row:ProgressRow280,lane:'ordinary'|'ban'):ProgressHead280{
 const ordinary=lane==='ordinary',id=ordinary?row.ac_id:row.b_id,ts=ordinary?row.ac_ts:row.b_ts,details=ordinary?row.ac_details:row.b_details;
 if(id===null)return Object.freeze({id:null,ts:null,details:null,work:{},valid:true,reference:null});
 let work:Partial<SweepState>|null=null,valid=(ordinary?row.ac_valid:row.b_valid)===1,reference:PrivacyReference|null=null;
 try{
  const value=JSON.parse(details!) as Record<string,unknown>,legacy=!Object.hasOwn(value,'lane');
  valid=valid&&(legacy||value.lane===lane);
  if(ordinary){valid=valid&&(!Object.hasOwn(value,'a')?legacy:Number.isSafeInteger(value.a)&&Number(value.a)>=0)&&(!Object.hasOwn(value,'c')?legacy:cursor280(value.c));
   if(valid)work={...(Object.hasOwn(value,'a')?{a:Number(value.a)}:{}),...(Object.hasOwn(value,'c')?{c:value.c as string}:{})};
  }else{valid=valid&&(!Object.hasOwn(value,'b')?legacy:cursor280(value.b));if(valid)work={...(Object.hasOwn(value,'b')?{b:value.b as string}:{})};}
  const cursor=ordinary?work?.c:work?.b;
  if(cursor){try{reference=Object.freeze({subject:cursor,capture:privacyCaptureFromColumns(cursor,{privacy_generation:ordinary?row.ac_generation:row.b_generation,privacy_state:ordinary?row.ac_state:row.b_state,privacy_revision:ordinary?row.ac_revision:row.b_revision})});}catch{valid=false;}}
 }catch{valid=false;}
 return Object.freeze({id,ts,details,work,valid,reference});
}
function progressContext280(env:Env,canonical:ReturnType<typeof captureCanonicalRankConfig233>){
 const proto=Object.getPrototypeOf(env),descriptor=Object.getOwnPropertyDescriptor(env,'DB');
 return()=>{const current=Object.getOwnPropertyDescriptor(env,'DB');
  if(Object.getPrototypeOf(env)!==proto||!descriptor||!current||!Object.hasOwn(descriptor,'value')||!Object.hasOwn(current,'value')||
   ['value','get','set','writable','enumerable','configurable'].some(key=>!Object.is(descriptor[key as keyof PropertyDescriptor],current[key as keyof PropertyDescriptor]))||!canonical.current())throw Error('role_sweep_progress_source_held');
 };
}
// A fixed passive audit writer, never role/effect authority. The same-statement
// CAS is lane-local; a different lane's append cannot overwrite this lane.
async function recordProgress280(env:Env,mode:ProgressMode280,trigger:string,details:Record<string,unknown>,heads:{ac:ProgressHead280;b:ProgressHead280},references:readonly PrivacyReference[],check:()=>void,referenceHeld=false):Promise<Progress280>{
 const own=mode==='ordinary'?[heads.ac]:mode==='ban'?[heads.b]:[heads.ac,heads.b];
 if(referenceHeld||own.some(h=>!h.valid))return Object.freeze({state:'held',reason:'original_progress_or_reference_held'});
 try{check();}catch{return Object.freeze({state:'held',reason:'original_progress_source_held'});}
 const refs=[...references],seen=new Map<string,string|null>();
 for(const r of refs){if(!/^[0-9]{17,20}$/.test(r.subject))return Object.freeze({state:'held',reason:'original_progress_reference_invalid'});
  const g=r.capture?.subjectGeneration??null;if(seen.has(r.subject)&&seen.get(r.subject)!==g)return Object.freeze({state:'held',reason:'original_progress_reference_changed'});seen.set(r.subject,g);}
 const recorded={...details,...(seen.size?{_privacySubjectIds:[...seen.keys()]}:{})};
 const values:(string|number|null)[]=[now(),'system','role.sweep',trigger,JSON.stringify(recorded)],guards:string[]=[];
 for(const [subject,generation]of seen){const at=values.length+1;values.push(subject,generation);guards.push(privacyGenerationFenceSql(at,at+1));}
 for(const lane of mode==='combined'?['ordinary','ban'] as const:[mode] as readonly ('ordinary'|'ban')[]){
  const h=lane==='ordinary'?heads.ac:heads.b;
  if(h.id===null)guards.push(`${headId280(lane)} IS NULL`);
  else{const at=values.length+1;values.push(h.id,h.ts,h.details);guards.push(`EXISTS(SELECT 1 FROM audit original WHERE original.id=?${at} AND original.ts IS ?${at+1} AND original.details IS ?${at+2} AND original.action='role.sweep' AND original.id=${headId280(lane)})`);}
 }
 try{
  check();const result=await env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ?1,?2,?3,?4,?5 WHERE ${guards.map(g=>'('+g+')').join(' AND ')}`).bind(...values).run();check();
  const success=Object.getOwnPropertyDescriptor(result,'success'),meta=Object.getOwnPropertyDescriptor(result,'meta');
  const changes=meta&&Object.hasOwn(meta,'value')&&meta.value&&typeof meta.value==='object'?Object.getOwnPropertyDescriptor(meta.value,'changes'):undefined;
  if(success?.value!==true||!changes||!Object.hasOwn(changes,'value')||!Number.isSafeInteger(changes.value)||changes.value<0||changes.value>1)return Object.freeze({state:'unknown',reason:'original_progress_response_unknown'});
  return Object.freeze(changes.value===1?{state:'recorded',reason:'original_progress_recorded'}:{state:'held',reason:'original_progress_changed'});
 }catch{return Object.freeze({state:'unknown',reason:'original_progress_response_unknown'});}
}

export interface SweepResult {
  checked: number;
  restored: string[];
  failed: Array<{ id: string; error: string }>;
  absent: number;
  /** .55: accounts holding a blocking role: skipped, or stripped of Guild Member while it is held */
  blocked: string[];
  /** .60: banned accounts found still holding Guild Member and stripped of it */
  revoked: string[];
  /** .90: the run stopped at its Discord-call budget (ROLE_CALL_BUDGET); the rest waits for the next run */
  budgetExhausted: boolean;
  /** .90/.95: logical Discord calls this run made through the role writer */
  calls: number;
  /** .95: requests actually made (every call's first request and every 429 retry); the budget bounds these */
  attempts: number;
  /** .95: 429 retries among them */
  retries: number;
  /** .99: accounts whose member lookup Discord did not answer: not finished, not passed by the watermark or the cursor, retried next run */
  unfinished: string[];
  /** Ban lane successor (12 Nov 2026): the lane a canonical-mode run took; absent on the legacy combined run */
  lane?: RoleSweepLane1112;
  /** After a canonical "ban" lane run: the banned rotation's cursor and its observation count (never authority) */
  bannedCursor?: string;
  observed?: number;
  /** Passive audit persistence only; never authority to repeat a provider effect. */
  progress?: Progress280;
}

/** Never throws: it runs inside waitUntil, where an error would only vanish. `parent` (Revision 4, configured mode only): the
 * /queue invocation's Discord-call budget, shared with the fresh-role pass that follows; without it the run makes its own.
 * `lane` (ban lane successor, 12 Nov 2026, agreed with Codex): with the canonical ranks selected the caller must name
 * exactly one lane, chosen before any lane-specific read: "ordinary" runs only the promotion and member walk, "ban" only
 * the banned rotation (at most one banned, held or debt account). A run never falls through to the other lane when its
 * own is empty, failed or held, and it never changes the other lane's cursor. Without a lane in canonical mode the run
 * holds (role.sweep_failed). Without the canonical ranks the lane is ignored and the legacy combined run is unchanged. */
export async function sweepMemberRoles(env: Env, trigger: "cron" | "watcher", parent?: CallBudget,originalDispatch?:BetaRoleDispatch,lane?:RoleSweepLane1112): Promise<SweepResult | null> {
  const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
  try {
    return await sweepInner(env, trigger, parent,roleDispatch,lane);
  } catch (e) {
    try {
      await audit(env, "system", "role.sweep_failed", trigger, { error: String(e).slice(0, 300) });
    } catch {
      /* the audit itself failed; nothing left to tell */
    }
    return null;
  }
}

/** This isolate's last sweep, so most of the watcher's polls are turned away without reading D1 at all. */
let lastLocal = 0;
/** Tests only: forget the in-memory throttle, as a fresh isolate would. */
export const forgetLocalThrottle = () => {
  lastLocal = 0;
};

async function sweepInner(env: Env, trigger: "cron" | "watcher", parent:CallBudget|undefined,roleDispatch:BetaRoleDispatch,lane:RoleSweepLane1112|undefined): Promise<SweepResult | null> {
  const canonicalProgress280=captureCanonicalRankConfig233(env),progressCheck280=progressContext280(env,canonicalProgress280);progressCheck280();
  const role = env.ROLE_GUILD_MEMBER;
  if (!role) return null;
  const t = now();
  if (trigger === "watcher" && t - lastLocal < THROTTLE_SECONDS) return null;
  // A failed sweep counts too. Otherwise one that keeps failing before it writes its row is retried on every
  // 30-second poll, and the first-run lookup below scans the whole audit table each time.
  const recent = await env.DB.prepare("SELECT ts FROM audit WHERE action IN ('role.sweep','role.sweep_failed') ORDER BY id DESC LIMIT 1")
    .first<{ ts: number }>();
  if (trigger === "watcher" && recent && t - recent.ts < THROTTLE_SECONDS) {
    lastLocal = recent.ts;
    return null;
  }
  lastLocal = t;
  // Ban lane successor (12 Nov 2026): the lane is checked before any lane-specific read and before any Discord request.
  // The installed role slice is 120 statements and the ordinary walk alone reaches 117/118, so a banned visit of up to
  // 50 cannot follow it in the same run. Repair round (13 Nov 2026): after the Watcher's throttle, so a Watcher call
  // without a lane writes at most one role.sweep_failed row per throttle window instead of one per poll.
  const canonicalLanes = canonicalProgress280.present;
  if (canonicalLanes && lane !== "ordinary" && lane !== "ban") throw Error("role_sweep_lane_required");
  progressCheck280();
  const originalProgress280=await env.DB.prepare(progressRead280).first<ProgressRow280>();progressCheck280();
  if(!originalProgress280)throw Error('role_sweep_progress_read_unknown');
  const heads280={ac:parseProgress280(originalProgress280,'ordinary'),b:parseProgress280(originalProgress280,'ban')};
  let state:SweepState|null=(canonicalLanes?(lane==='ban'?heads280.b.work:heads280.ac.work):{...heads280.ac.work,...heads280.b.work}) as SweepState|null;
  const originalCursorReference=heads280.ac.reference;
  if (canonicalLanes && lane === "ban") return sweepBannedLane(env, trigger, parent ?? callBudget(env), state, heads280,progressCheck280, roleDispatch);
  if (!state || typeof state.a !== "number") {
    // First sweep: start with the last day's promotions (the audit_ts index makes this cheap). Successor (12 Nov 2026):
    // in canonical mode the banned rotation's cursor survives this start.
    const first = await env.DB.prepare("SELECT MIN(id) AS id FROM audit WHERE ts >= ?1 AND action<>'treasury.erased_replay280'").bind(t - 86400).first<{ id: number | null }>();
    state = { a: Math.max(0, (first?.id ?? 1) - 1), c: "", ...(typeof state?.b === "string" ? { b: state.b } : {}) };
  }
  const budget = Math.min(SCHEDULED_CAPS.roleSweepAccounts, Math.max(1, intVar(env.ROLE_SWEEP_PER_RUN, SWEEP_DEFAULT))); // .115: the scheduled D1 budget's cap (scheduled-budget.ts)
  const calls = parent ?? callBudget(env); // .90 (P-20): this run's Discord-call budget, shared with the banned reconciliation below

  // 1. Promotions since the last sweep, oldest first. `id > ?` walks the primary key, so only new rows are read.
  const promos = await env.DB.prepare(
    "SELECT id, ts, json_extract(details, '$.discordId') AS did FROM audit WHERE id > ?1 AND action = 'roster.member' ORDER BY id LIMIT ?2",
  )
    .bind(state.a, budget * 4)
    .all<{ id: number; ts: number; did: string | null }>();
  const fresh: string[] = [];
  const settled: Array<{ id: number; did: string }> = []; // .95: the promotions this selection covers, in order; the watermark passes them only as far as their accounts are finished
  for (const p of promos.results) {
    if (p.ts > t - SETTLE_SECONDS) break; // too fresh: it, and everything after it, waits for the next sweep
    const did = typeof p.did === "string" && /^\d{5,25}$/.test(p.did) ? p.did : "";
    if (did && !fresh.includes(did) && fresh.length >= budget) break;
    settled.push({ id: p.id, did });
    if (did && !fresh.includes(did)) fresh.push(did);
  }
  let priority: string[] = [];
  const captures=new Map<string,PrivacySubject|null>();
  const rankSnapshots=new Map<string,number|null>();
  const rankMapping=env.QR_RANK_MAPPING_ENABLED==='true'||env.QR_PRIVILEGED_RANK_MAPPING_ENABLED==='true';
  if (fresh.length) {
    const ph = fresh.map((_, k) => `?${k + 1}`).join(",");
    const still = await env.DB.prepare(
      `SELECT DISTINCT c.discord_id,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision,(SELECT MAX(id) FROM roster_snapshots) AS rank_snapshot_id FROM characters c LEFT JOIN privacy_subjects p ON p.subject_id=c.discord_id WHERE c.discord_id IN (${ph}) AND status IN ('member','left_pending') AND (p.state IS NULL OR p.state='active') ` +
        "AND NOT EXISTS (SELECT 1 FROM members m WHERE m.discord_id = c.discord_id AND m.banned = 1)",
    )
      .bind(...fresh)
      .all<SweepSubject>();
    for(const row of still.results)captures.set(row.discord_id,privacyCaptureFromColumns(row.discord_id,row));
    for(const row of still.results)rankSnapshots.set(row.discord_id,row.rank_snapshot_id);
    const keep = new Set(still.results.map((r) => r.discord_id));
    priority = fresh.filter((d) => keep.has(d));
  }

  // 2. The rotation, with the rest of the budget. Banned accounts never get the role back (see restoreMemberRole).
  let cursor = typeof state.c === "string" ? state.c : "";
  const rotation: string[] = [];
  const room = budget - priority.length;
  if (room > 0) {
    const rows = await env.DB.prepare(
      "SELECT DISTINCT c.discord_id,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision,(SELECT MAX(id) FROM roster_snapshots) AS rank_snapshot_id FROM characters c LEFT JOIN privacy_subjects p ON p.subject_id=c.discord_id WHERE status = 'member' AND c.discord_id > ?1 AND (p.state IS NULL OR p.state='active') " +
        "AND NOT EXISTS (SELECT 1 FROM members m WHERE m.discord_id = c.discord_id AND m.banned = 1) ORDER BY c.discord_id LIMIT ?2",
    )
      .bind(cursor, room)
      .all<SweepSubject>();
    for(const row of rows.results)captures.set(row.discord_id,privacyCaptureFromColumns(row.discord_id,row));
    for(const row of rows.results)rankSnapshots.set(row.discord_id,row.rank_snapshot_id);
    for (const r of rows.results) if (!priority.includes(r.discord_id)) rotation.push(r.discord_id);
    cursor = rows.results.length < room ? "" : rows.results[rows.results.length - 1].discord_id; // wrap at the end
  }

  const restored: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const blocked: string[] = [];
  let absent = 0;
  let checked = 0;
  let stopped = false; // the budget
  let halted = false; // .95: a refusal that would repeat for everyone this run (403, misconfigured, unverified)
  let lastRotationDone = "";
  const done = new Set<string>(); // .95: the accounts this run finished, whatever the outcome
  const unfinished: string[] = []; // .99: lookups Discord did not answer
  let rotationHeld = false; // .99: the rotation cursor never passes an unfinished account
  const handle = async (id: string): Promise<"done" | "stop" | "unfinished"> => {
    if(!captures.has(id))return 'unfinished';
    const capture=captures.get(id)!,reference={subject:id,capture};
    let m: Awaited<ReturnType<typeof guildMember>>;
    try {
      m = await guildMember(env, id, calls);
    } catch (e) {
      // .99 (Codex's review of .95, 09:15): a lookup Discord did not answer (403, 500, a network error) leaves the account
      // UNFINISHED: its promotion stays ahead of the watermark and the rotation does not pass it, so the next run reaches it
      // first; a 404 is a definitive answer (absent, below) and finishes the account
      failed.push({ id, error: e instanceof DiscordError ? `lookup ${e.status}` : String(e).slice(0, 120) });
      return "unfinished";
    }
    checked++;
    if (!m) {
      absent++; // not in the Discord (any more); nothing to give
      return "done";
    }
    // .55: a blocking role held (Quarantine, Flagellant) takes Guild Member away while it lasts, and no grant is made.
    try {
      if (await removeIfBlocked(env, id, m.roles, `sweep:${trigger}`, calls,{subjectGeneration:capture?.subjectGeneration??null},roleDispatch)) {
        blocked.push(id);
        return "done";
      }
    } catch (e) {
      failed.push({ id, error: e instanceof DiscordError ? `remove ${e.status}` : String(e).slice(0, 120) });
      return "done";
    }
    // Continue native ranks for an already-confirmed member as well. The roster and privacy generation
    // came from the original selection, before any Discord await; a later roster is never substituted.
    const continueRanks=async()=>{
      const snapshot=rankSnapshots.get(id);
      if(rankMapping&&Number.isSafeInteger(snapshot)&&snapshot!>0)
        await continueRosterRanks(env,id,snapshot!,{subjectGeneration:capture?.subjectGeneration??null},calls,isPrivacyWriteAdmissionDatabase(privacyProviderCustodyDatabase(env))&&trigger==='cron'?1:2,roleDispatch);
    };
    if (m.roles.includes(role)) { await continueRanks(); return "done"; }
    try {
      const writer=grantMemberRole as unknown as (...args:[Env,string,string,string,string[]|undefined,typeof calls,{subjectGeneration:string|null},BetaRoleDispatch])=>ReturnType<typeof grantMemberRole>;
      const outcome = await writer(env, id, `olympus-verify: Guild Member restored (sweep); the roster has this member`, `sweep:${trigger}`, m.roles, calls,{subjectGeneration:capture?.subjectGeneration??null},roleDispatch);
      if (outcome === "blocked") {
        blocked.push(id);
        return "done";
      }
      if (outcome === "budget") return "stop"; // unreachable with the reservation below; kept so a changed cost can never half-handle an account
      if (outcome === "misconfigured" || outcome === "unverified") {
        failed.push({ id, error: outcome });
        return "stop"; // the same answer for everyone else this run; the next run asks again, this account first
      }
      if (outcome !== "granted") return "done";
      restored.push(id);
      await audit(env, "system", "role.restored", id, { source: `sweep:${trigger}` },reference);
      // An installed cron grant completes membership now. Keep this account ahead of the
      // original promotion watermark/rotation cursor; its next fresh sweep continues ranks.
      // This avoids combining two durable role phases in one 120-statement role slice.
      if(isPrivacyWriteAdmissionDatabase(privacyProviderCustodyDatabase(env))&&trigger==='cron'&&rankMapping)return 'unfinished';
      await continueRanks();
      await new Promise((res) => setTimeout(res, 250)); // keep a run of grants off Discord's rate limiter
      return "done";
    } catch (e) {
      failed.push({ id, error: e instanceof DiscordError ? `grant ${e.status}` : String(e).slice(0, 120) });
      await audit(env, "system", "role.restore_failed", id, { source: `sweep:${trigger}`, error: String(e).slice(0, 200) },reference);
      // 403 means the bot's role cannot grant Guild Member at all; every other try would fail the same way.
      return e instanceof DiscordError && e.status === 403 ? "stop" : "done";
    }
  };
  for (const id of [...priority, ...rotation]) {
    // .90/.95 (P-20): the whole account reserved before its first request (the look; then the grant's inventory read when
    // it is due, the writer's fresh look, the PUT and the mandatory removal after a ban, each with its possible 429 retry):
    // stop BEFORE an account the budget cannot finish, so nobody is half-handled; the rotation resumes at the last one done
    const membershipCalls=1+GRANT_CALLS+inventoryCalls(env,calls);
    // The blocking branch ends without a grant or native-rank work. Reserve the complete largest branch,
    // including the caller's initial lookup, before touching this account; central requests never retry.
    const completeCalls=membershipSettlementEnabled(env)?Math.max(9+(rankMapping?RANK_CONTINUATION_HTTP_RESERVE:0),membershipTransitionEnabled(env)&&env.MEMBERSHIP_RETIRED_ROLE_ID?17:9):reserve(membershipCalls)+(rankMapping?RANK_CONTINUATION_HTTP_RESERVE:0);
    if (calls.limit-calls.attempts<completeCalls || !takeCall(calls)) {
      await budgetExhausted(env, calls, `sweep:${trigger}`);
      stopped = true;
      break;
    }
    const outcome = await handle(id);
    if (outcome === "stop") {
      if (calls.exhausted) stopped = true;
      else halted = true;
      break;
    }
    if (outcome === "unfinished") {
      unfinished.push(id);
      if (rotation.includes(id)) rotationHeld = true;
      if (unfinished.length >= LOOKUP_FAILURES_PER_RUN) {
        halted = true; // Discord is not answering lookups: stop here; everything from the first unfinished account is retried next run
        break;
      }
      continue;
    }
    done.add(id);
    if (rotation.includes(id) && !rotationHeld) lastRotationDone = id;
  }
  // .95 (Codex's review of .90): the watermark advances only through promotions whose accounts this run finished (or
  // dropped as no longer eligible); an unfinished priority account's promotion is read again by the next run, which takes
  // it first, so a left_pending account the rotation never visits is not lost when the budget stops
  let a = state.a;
  for (const s of settled) {
    if (s.did && priority.includes(s.did) && !done.has(s.did)) break;
    a = s.id;
  }

  // .90/.95/.99: stopped early (the budget, a refusal that would repeat), or a rotation account left unfinished: the rotation
  // resumes at the last account finished before it (never at the end of a page it did not reach, never past an unfinished one)
  if (stopped || halted || rotationHeld) cursor = lastRotationDone || (typeof state.c === "string" ? state.c : "");
  if (stopped) await logLine(env, `⏳ role sweep: stopped after ${calls.attempts} requests to Discord (${calls.calls} calls, ${calls.retries} retried; this run's budget, ROLE_CALL_BUDGET); the rest waits for the next sweep.`);
  if (restored.length) {
    await logLine(
      env,
      `♻️ role sweep: Guild Member was missing for ${restored.map((d) => `<@${d}>`).join(", ")} although the roster has them in the guild — restored.`,
      restored.map(subject=>({subject,capture:captures.get(subject)??null})),
    );
  }
  if (failed.length) {
    await logLine(
      env,
      `⚠️ role sweep: ${failed.length} account(s) could not be checked or given Guild Member: ` +
        failed.slice(0, 5).map((f) => `<@${f.id}> (${f.error})`).join(", ") +
        (failed.some((f) => f.error === "grant 403") ? ` — ${explainDiscordError(new DiscordError(403, ""))}` : ""),
      failed.map(f=>({subject:f.id,capture:captures.get(f.id)??null})),
    );
  }
  if (blocked.length) {
    await logLine(env, `⛔ role sweep: Guild Member withheld or removed for ${blocked.map((d) => `<@${d}>`).join(", ")} while a server restriction is on the account.`,blocked.map(subject=>({subject,capture:captures.get(subject)??null})));
  }
  // 3. .60: banned accounts still holding Guild Member (a late grant that landed after the ban, or a removal that failed)
  //    lose it; up to BANNED_PER_RUN per run, in a rotation of their own. .63: every banned account, whatever its
  //    characters' status, and with the ban re-read after the member GET (Codex's review of .60).
  //    Successor (12 Nov 2026): in canonical mode this runs only in the "ban" lane (sweepBannedLane); the ordinary lane
  //    leaves the banned rotation and its cursor exactly as they were.
  if (canonicalLanes) {
    const progress=await recordProgress280(env,'ordinary',trigger,{ a, c: cursor, checked, restored: restored.length, failed: failed.length, unfinished: unfinished.length, absent, blocked: blocked.length, revoked: 0, calls: calls.calls, attempts: calls.attempts, retries: calls.retries, stopped: stopped || calls.exhausted, lane: "ordinary" },heads280,[...captures].map(([subject,capture])=>({subject,capture})).concat(originalCursorReference?[originalCursorReference]:[]),progressCheck280);
    return { checked, restored, failed, absent, blocked, revoked: [], budgetExhausted: stopped || calls.exhausted, calls: calls.calls, attempts: calls.attempts, retries: calls.retries, unfinished, lane: "ordinary",progress };
  }
  const banned = await reconcileBanned(env, typeof state.b === "string" ? state.b : "", BANNED_PER_RUN, calls,roleDispatch);
  for (const id of banned.failed) failed.push({ id, error: "revoke failed" });
  await logBanned(env, banned);
  let passive:ReturnType<typeof readBannedSweepReferences280>|null=null;
  try{passive=readBannedSweepReferences280(env,banned);}catch{/* Progress only; never retry a provider operation. */}
  const references=[...captures].map(([subject,capture])=>({subject,capture})).concat(originalCursorReference?[originalCursorReference]:[],passive?.references??[],passive?.retained&&banned.cursor&&heads280.b.reference?[heads280.b.reference]:[]);
  const progress=await recordProgress280(env,'combined',trigger,{ a, c: cursor, b: banned.cursor, checked, restored: restored.length, failed: failed.length, unfinished: unfinished.length, absent, blocked: blocked.length, revoked: banned.revoked.length, calls: calls.calls, attempts: calls.attempts, retries: calls.retries, stopped: stopped || calls.exhausted },heads280,references,progressCheck280,!passive||passive.held);
  return { checked, restored, failed, absent, blocked, revoked: banned.revoked, budgetExhausted: stopped || calls.exhausted, calls: calls.calls, attempts: calls.attempts, retries: calls.retries, unfinished,progress };
}

/** The banned rotation's server-log lines, shared by the legacy combined run and the canonical "ban" lane. */
async function logBanned(env: Env, banned: Awaited<ReturnType<typeof reconcileBanned>>): Promise<void> {
  if (banned.revoked.length) {
    // REV-BAN-1 (12 Nov 2026): a removal that leaves rank roles for later runs says so here instead of as a failure.
    // Successor (12 Nov 2026): the sweep is only the safety net, and its banned lane gets a run about every 30 minutes.
    const left = banned.remaining > 0 ? ` ${banned.remaining} more rank ${banned.remaining === 1 ? "role is" : "roles are"} left; the role sweep removes one per run, about every 30 minutes.` : "";
    await logLine(env, `🚫 role sweep: ${banned.rank ? "Olympus rank role removed from" : "Guild Member removed from"} ${banned.revoked.map((d) => `<@${d}>`).join(", ")}: banned from verifying.${left}`);
  }
  if (banned.held.length) {
    await logLine(env, `⏸️ role sweep: Guild Member removed from ${banned.held.map((d) => `<@${d}>`).join(", ")}: applying again after a rename Blizzard required.`); // .114
  }
}

/**
 * Ban lane successor (12 Nov 2026, agreed with Codex): the canonical "ban" lane. Only the banned rotation runs (at most
 * BANNED_PER_RUN, one banned, held or debt account); no promotion, linked-member or rotation query is made. The ordinary
 * lane alone records `b`; it never copies another lane's IDs. Nothing falls through to the ordinary walk when this
 * lane is empty, failed or held. Progress publication is source/generation fenced and lane-CAS guarded.
 */
async function sweepBannedLane(env: Env, trigger: "cron" | "watcher", calls: CallBudget, state: SweepState | null, heads280:{ac:ProgressHead280;b:ProgressHead280},progressCheck280:()=>void, roleDispatch: BetaRoleDispatch): Promise<SweepResult> {
  const banned = await reconcileBanned(env, typeof state?.b === "string" ? state.b : "", BANNED_PER_RUN, calls, roleDispatch);
  const failed = banned.failed.map((id) => ({ id, error: "revoke failed" }));
  await logBanned(env, banned);
  let passive:ReturnType<typeof readBannedSweepReferences280>|null=null;
  try{passive=readBannedSweepReferences280(env,banned);}catch{/* Progress only; never retry a provider operation. */}
  const references=[...passive?.references??[],...passive?.retained&&banned.cursor&&heads280.b.reference?[heads280.b.reference]:[]];
  const progress=await recordProgress280(env,'ban',trigger,{ b: banned.cursor, checked: banned.checked.length, restored: 0, failed: failed.length, unfinished: 0, absent: 0, blocked: 0, revoked: banned.revoked.length, observed: banned.observed, calls: calls.calls, attempts: calls.attempts, retries: calls.retries, stopped: calls.exhausted, lane: "ban" },heads280,references,progressCheck280,!passive||passive.held);
  return { checked: banned.checked.length, restored: [], failed, absent: 0, blocked: [], revoked: banned.revoked, budgetExhausted: calls.exhausted, calls: calls.calls, attempts: calls.attempts, retries: calls.retries, unfinished: [], lane: "ban", bannedCursor: banned.cursor, observed: banned.observed,progress };
}
