/** Fresh full-release role passes (Revision 4, A4; owner decisions of 16 Oct 2026). Orchestration only: every lane SQL text
 * lives in full-release-roles.ts, every Discord request goes through the lane block of role-settlements.ts, and each request
 * debits the invocation's one shared allowance through laneChildBudget (admission reads laneRoom, never `exhausted`).
 * Loaded only by dynamic import from configured branches (the /queue thunk, ingestRoster, the ban interaction), so the
 * unconfigured module graph stays .160's and no twelve row or role is ever selected (lane IDs are disjoint from them).
 *
 * runFreshPass: clock gate (no D1), in-isolate throttle, the interval read before any write (the ingest trigger too, unless
 * the newest snapshot changed: major 5), held handling, the lease, cursors from the newest role.fresh_state or tick, the
 * profile of the captured newest snapshot, then S1 cause rotation (M1), S2 departures (major 1), S3/S4 grant debt and staff
 * by parity, S5 presence (major 2), and one role.fresh_state referencing only active visited subjects (a refused row falls
 * back to a reference-free tick). Every walk reads one fixed window; every cursor passes each visited subject whatever the
 * outcome, and only a request or statement stop keeps it at the last finished subject.
 */
import type { Env } from './env';
import type { CallBudget } from './roles';
import type { PrivacyReference } from './db';
import { audit, now } from './db';
import { logLine } from './discord';
import { identifyNativeProfile } from './native-rank-adapter';
import { privacyCaptureFromColumns,privacyGenerationExpressionFenceSql,readPrivacySubject } from './privacy-serving-authority';
import { DB_NOW,randomGeneration } from './account-generation-contracts';
import { FRESH_CAUSE_CHILD_CAP,FRESH_GRANT_CHILD_CAP,FRESH_REMOVAL_CHILD_CAP,STAFF_CHILD_CAP,laneChildBudget,laneRoom } from './lane-budget';
import { room,type Admission,type StatementCount } from './roster-effects';
import { ROSTER_INGEST_STATEMENTS } from './scheduled-budget';
import * as L from './full-release-roles';
import type { LaneCapture } from './full-release-roles';
import * as R from './role-settlements';
import type { LaneObservation,LaneQueueResult,LaneRemovalGroup,LaneRemovalOutcome,LaneSpentOutcome,Settlement } from './role-settlements';

export type FreshTrigger='watcher'|'ingest';
const ID=/^\d{17,20}$/;
const quoted=(values:readonly string[])=>values.map(v=>`'${v}'`).join(',');

// --- statement worst cases (attempts, as countStatements counts them). Each lane call is admitted against its own bound
// right before it runs; the walks' `spent` flag and a bounded count decide whether the spent-row reader is admitted at all.
/** settleLaneIntent: the facts batch 2, the pick, current twice, claim, admission, current after the effect, the receipt,
 * compensateGrant (its INSERT and a two-statement batch) and the closing unknown. */
export const FRESH_INTENT_STATEMENTS=13;
/** readLaneSpentRows: its read, then per row at most 6 (a reconcile: the facts batch, the pick, current, two tuple UPDATEs). */
export const freshSpentStatements=(rows:number)=>1+6*Math.max(0,Math.min(24,rows));
/** settleLaneRemoval: the historical custody read, per group the pre-check, disposal, INSERT and rows read, and per role
 * at most claim, final proof, receipt and failure. */
export const freshRemovalStatements=(groups:number,roles:number)=>1+4*groups+4*roles;
/** Producers: fresh pick, accepted pick, authority, the settled read of present roles, the disposal+INSERT batch, adoption;
 * staff: the facts batch of 4, accepted pick, authority, the batch of 2, adoption. */
export const FRESH_QUEUE_STATEMENTS=7,STAFF_QUEUE_STATEMENTS=9,STAFF_ABSENCE_STATEMENTS=2,FRESH_MARK_STATEMENTS=2;
/** A spent ten-rank old-purpose staff row is only observed (P1-A): its select and one checked_at stamp. The lane never hands
 * it to .160 settleRoleIntent(reconcileOnly). */
export const FRESH_OLD_OBSERVE_STATEMENTS=2;
/** Pass open: interval, newest snapshot, lease, state, profile, the departure watermark start and three held audits. */
export const FRESH_OPEN_STATEMENTS=9;
/** Pass close: role.fresh_state, its reference-free tick fallback, the lease release. */
export const FRESH_CLOSE_STATEMENTS=3;
/** Without a caller's Admission the pass reserves each bound against this: ROSTER_INGEST_STATEMENTS (700 - SCHEMA_WORST)
 * less the admission-mode sweep (120, wrangler.toml:145). The /queue route's own worst is the caller's to subtract. */
export const FRESH_SWEEP_STATEMENTS=ROSTER_INGEST_STATEMENTS-120;
/** The callers' Admission (stage 4 hooks). The bounds above count logical statements, while a counted env charges attempts:
 * under write admission each write group adds its 4-statement transport and each read group 1 (privacy-write-admission.ts
 * admissionTransportCost), so one logical statement costs at most factor+4. This view of the caller's live count divides the
 * remaining room by that worst, so every admitted bound fits whatever the transport; `used` stays the caller's own. */
export function freshAdmission(count:StatementCount,limit:number):Admission{
 const per=(count.factor??1)+(count.protocol?4:0);
 return Object.freeze({count:Object.freeze({get used(){return count.used;},factor:per}),limit});
}
/** settleLaneBan: privacy, ban and custody reads, the spent count and reader, and one removal of 11 fresh + 3 staff roles. */
export const FRESH_BAN_STATEMENTS=5+freshSpentStatements(24)+freshRemovalStatements(2,24);

// --- per-pass and per-subject limits beyond full-release-roles.ts
/** Departure events checked per pass (one single-subject statement each). */
export const FRESH_DEPARTURE_EVENTS_PER_PASS=4;
/** A missing departure watermark starts this far back (the audit_ts range, once). */
export const FRESH_DEPARTURE_EVENTS_LOOKBACK_SECONDS=3600;
/** settleLaneIntent calls per subject (confirms cost no request; effects stay at FRESH_EFFECTS_PER_SUBJECT). */
export const FRESH_SETTLES_PER_SUBJECT=4;
/** Entry for a grant subject: the screen, the inventory and one effect with its compensation. */
export const FRESH_GRANT_MIN_ENTRY=1+L.FRESH_RECONCILE_MIN_LEFT+L.FRESH_RECONCILE_MIN_LEFT;
/** Privacy references on one role.fresh_state (visited subjects only). */
export const FRESH_STATE_REFERENCES=16;

/** Departure events read per pass: one fixed window past the watermark, whatever is in it. */
export const FRESH_DEPARTURE_EVENT_WINDOW=200;
/** Departure events since the last pass (major 1 latency, whatever the history length): roster.left and roster.freed_seat,
 * which afterDeparture writes for every status-machine departure (roster diff, watcher left/removed, sync, released
 * bindings). One window of ?3 events past the watermark 'h' (an audit id, never a Discord ID), each action an index seek on
 * audit_actor_action, so at most 2*?3 rows are read; only events of accounts that may owe something (departureOwedSql) come
 * back, at most ?2, each row carrying the window's end. A burst owing nothing (the LINKS_NOT_BEFORE release writes one
 * roster.left per released binding) thus costs one statement per window and never delays an owing departure behind it by
 * more than its window. Binds: ?1 watermark ?2 limit ?3 window ?4 guild. */
export const FRESH_DEPARTURE_EVENTS_SELECT=`WITH ev AS (SELECT id,subject_id FROM (SELECT id,CASE WHEN json_valid(details) THEN json_extract(details,'$.discordId') END AS subject_id
 FROM audit WHERE actor='system' AND action='roster.left' AND id>?1 ORDER BY id LIMIT ?3)
 UNION ALL SELECT id,subject_id FROM (SELECT id,CASE WHEN json_valid(details) THEN json_extract(details,'$.discordId') END AS subject_id
 FROM audit WHERE actor='system' AND action='roster.freed_seat' AND id>?1 ORDER BY id LIMIT ?3)),
 w AS (SELECT id,subject_id FROM ev ORDER BY id LIMIT ?3),bounds AS (SELECT MAX(id) AS window_end,COUNT(*) AS window_size FROM w),
 sel AS (SELECT w.id,w.subject_id FROM w WHERE typeof(w.subject_id)='text' AND ${L.departureOwedSql('w.subject_id','?4')} ORDER BY w.id LIMIT ?2)
SELECT sel.id,sel.subject_id,bounds.window_end,bounds.window_size FROM bounds LEFT JOIN sel ON 1=1 ORDER BY sel.id`;
/** The first watermark: just before the audits of the last FRESH_DEPARTURE_EVENTS_LOOKBACK_SECONDS. Binds: ?1 since. */
export const FRESH_DEPARTURE_EVENTS_START='SELECT COALESCE((SELECT MIN(id) FROM audit WHERE ts>=?1),(SELECT MAX(id) FROM audit)+1,1)-1 AS id';
/** How many spent lane rows the reader would read (LANE_SPENT_ROWS' filter, bounded). Binds: ?1 subject ?2 guild. */
export const FRESH_SPENT_COUNT=`SELECT COUNT(*) AS n FROM (SELECT 1 FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND attempts=1 AND state IN('dispatching','unknown')
 AND expires_at<=${DB_NOW} AND (purpose IN(${quoted(L.LANE_PURPOSES)}) OR (purpose='grant_compensation' AND EXISTS(SELECT 1 FROM role_settlements pp
 WHERE pp.id=role_settlements.request_digest AND pp.purpose IN(${quoted(L.LANE_GRANT_PURPOSES)})))) LIMIT 24)`;
const OLD_STAFF_SPENT=`purpose IN('verified_privileged_rank','roster_privileged_rank') AND native_profile='ten-rank' AND attempts=1 AND state IN('dispatching','unknown')
 AND expires_at<=${DB_NOW} AND (checked_at IS NULL OR checked_at<=${DB_NOW}-${L.FRESH_BACKOFF_SECONDS})`;
/** One spent ten-rank old-purpose staff row on any of the three staff IDs due for an outcome read (STAFF_WALK_SELECT part (c));
 * beta-five rows are never read. Binds: ?1 subject ?2 guild ?3 the three staff IDs JSON. */
export const FRESH_OLD_STAFF_SPENT=`SELECT id FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND role_id IN(SELECT value FROM json_each(?3))
 AND ${OLD_STAFF_SPENT} ORDER BY created_at,id LIMIT 1`;
/** The lane's only write on such a row (P1-A): checked_at, so the staff walk skips it for FRESH_BACKOFF_SECONDS. State, reason
 * and nonce stay .160's; the row keeps fencing its target (TARGET_FENCE, the staff family) until an attended resolution.
 * Binds: ?1 id ?2 the three staff IDs JSON. */
export const FRESH_OLD_STAFF_OBSERVED=`UPDATE role_settlements SET checked_at=${DB_NOW} WHERE id=?1 AND role_id IN(SELECT value FROM json_each(?2)) AND ${OLD_STAFF_SPENT}`;
const BANNED_NOW='SELECT 1 AS banned FROM members WHERE discord_id=?1 AND banned=1';
/** role.fresh_state with privacy references, in the db.ts:27-33 form, so a refusal is visible in meta.changes. */
const STATE_AUDIT=`INSERT INTO audit(ts,actor,action,subject,details) SELECT ?1,'system',?2,?3,?4
 WHERE NOT EXISTS(SELECT 1 FROM json_each(?5) j WHERE NOT ${privacyGenerationExpressionFenceSql("json_extract(j.value,'$.id')","json_extract(j.value,'$.g')")})`;

type WalkRow={discord_id:string|null;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null;window_end?:string|null;window_size?:number;spent?:number;banned?:number};
type Visit='done'|'budget'|'statements';
type FreshState={r:string;d:string;g:string;s:string;p:string;k:0|1;h:number|null};
export type FreshPassCounts={visits:number;removed:number;settled:number;confirmed:number;unknown:number;held:number;failed:number;linkMissing:number;requests:number;statements:number};
export type FreshPassResult=Readonly<{state:'skipped'|'held'|'done'|'failed';reason:string;counts:Readonly<FreshPassCounts>}>;
type Ctx={env:Env;cap:LaneCapture;parent:CallBudget;trigger:FreshTrigger;clock:ReturnType<typeof L.laneClock>;snapshot:number|null;tenRank:boolean;D:string|null;
 admit:(n:number)=>boolean;counts:FreshPassCounts;refs:Map<string,PrivacyReference>;linkAudited:boolean;effects:number;stop:string;
 freshCover:readonly string[];staffCover:readonly string[]};

/** This isolate's last pass, so most watcher polls cost no D1 at all (restore.ts:154 form). */
let lastFreshLocal=0;
/** Tests only: forget the in-isolate throttle, as a fresh isolate would. */
export const forgetFreshPassThrottle=()=>{lastFreshLocal=0;};
const emptyCounts=():FreshPassCounts=>({visits:0,removed:0,settled:0,confirmed:0,unknown:0,held:0,failed:0,linkMissing:0,requests:0,statements:0});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/** Error text for an audit: never a Discord ID or a long provider message. */
const redact=(e:unknown)=>String(e instanceof Error?e.message:e).replace(/\d{17,20}/g,'#').slice(0,160);
function parseState(details:string|null|undefined):FreshState{
 let o:Record<string,unknown>={};try{const v=details?JSON.parse(details):null;if(v&&typeof v==='object'&&!Array.isArray(v))o=v as Record<string,unknown>;}catch{/* a malformed row starts over */}
 const c=(v:unknown)=>typeof v==='string'&&(v===''||ID.test(v))?v:'';
 return {r:c(o.r),d:c(o.d),g:c(o.g),s:c(o.s),p:c(o.p),k:o.k===1?1:0,h:typeof o.h==='number'&&Number.isSafeInteger(o.h)&&o.h>=0?o.h:null};
}
function remember(x:Ctx,row:WalkRow){
 if(!row.discord_id||x.refs.has(row.discord_id)||x.refs.size>=FRESH_STATE_REFERENCES)return;
 try{x.refs.set(row.discord_id,{subject:row.discord_id,capture:privacyCaptureFromColumns(row.discord_id,row)});}catch{/* never reference a non-active subject */}
}
function tally(x:Ctx,s:Settlement){
 if(s.state==='unknown')x.counts.unknown++;else if(s.state==='held')x.counts.held++;else if(s.reason==='fresh_server_confirmed')x.counts.confirmed++;else x.counts.settled++;
}
function tallySpent(x:Ctx,o:LaneSpentOutcome){for(const r of o.outcomes)tally(x,r.settlement);}
function tallyRemoval(x:Ctx,o:LaneRemovalOutcome){
 for(const r of o.rows){if(r.state==='unknown')x.counts.unknown++;else if(r.state==='held')x.counts.held++;else if(r.reason==='removed')x.counts.removed++;else x.counts.settled++;}
 if(o.dispatched)x.effects++;
}
/** A visit that threw: counted, and the cursor passes it unless the shared allowance stopped it. */
function failed(x:Ctx,e:unknown):Visit{x.counts.failed++;const m=e instanceof Error?e.message:'';return m==='shared_role_budget'||m==='role_budget'?'budget':'done';}
async function guarded(x:Ctx,visit:()=>Promise<Visit>):Promise<Visit>{
 const before=x.parent.attempts;x.counts.visits++;
 try{return await visit();}catch(e){return failed(x,e);}finally{x.counts.requests+=x.parent.attempts-before;}
}
async function spentCount(x:Ctx,subject:string):Promise<number|null>{
 if(!x.admit(1))return null;
 return (await x.env.DB.prepare(FRESH_SPENT_COUNT).bind(subject,x.cap.guild).first<{n:number}>())?.n??0;
}
async function readSpent(x:Ctx,subject:string,o:LaneObservation,b:CallBudget,rows:number):Promise<Visit>{
 if(!rows)return 'done';if(!x.admit(freshSpentStatements(rows)))return 'statements';
 tallySpent(x,await R.readLaneSpentRows(x.env,x.cap,subject,o,b));return 'done';
}
async function removeGroups(x:Ctx,subject:string,generation:string|null,groups:LaneRemovalGroup[],b:CallBudget,opts:Readonly<{observed?:LaneObservation;rosterId?:number}>={}):Promise<Visit>{
 if(!groups.length)return 'done';
 if(!x.admit(freshRemovalStatements(groups.length,groups.reduce((n,g)=>n+g.roles.length,0))))return 'statements';
 if(x.effects)await sleep(L.FRESH_EFFECT_SPACING_MS); // spacing from the previous subject's effects (settleLaneRemoval spaces its own)
 const out=await R.settleLaneRemoval(x.env,x.cap,subject,generation,groups,b,opts);tallyRemoval(x,out);
 return out.reason==='role_request_budget'?'budget':'done';
}
/** The ban plan: every present fresh role (historical lane IDs only with fresh grant custody) and every present managed staff
 * role still in the bot's ban custody (owner: a bot-given staff role that reappears while the ban stands goes again). */
async function banGroups(x:Pick<Ctx,'env'|'cap'|'clock'|'admit'>,subject:string,roles:readonly string[],historical?:readonly string[]):Promise<LaneRemovalGroup[]|null>{
 const groups:LaneRemovalGroup[]=[],cap=x.cap;
 if(x.clock.fresh){
  let hist=historical;
  if(!hist){if(!x.admit(1))return null;hist=(await x.env.DB.prepare(L.FRESH_CUSTODY_ROLES).bind(subject,cap.guild).all<{role_id:string}>()).results.map(r=>r.role_id).filter(r=>!cap.freshIds.includes(r));}
  const fresh=[...cap.freshIds,...hist].filter(r=>roles.includes(r));if(fresh.length)groups.push({purpose:L.FRESH_REMOVAL_BAN,roles:fresh.slice(0,20)});
 }
 if(x.clock.staff){const present=cap.managedStaff.filter(r=>roles.includes(r));
  if(present.length){if(!x.admit(1))return null;
   const custody=(await x.env.DB.prepare(L.staffCustodyRolesSql(true)).bind(subject,cap.guild,JSON.stringify(present)).all<{role_id:string}>()).results.map(r=>r.role_id);
   if(custody.length)groups.push({purpose:L.STAFF_REMOVAL_BAN,roles:custody});}}
 return groups;
}

/** M1 cause rotation (the reconcileBanned shape, roles.ts:298-343): banned accounts, and rename holds while the fresh lane can
 * act. One counted screen GET; a fresh role, or for a ban a staff role in bot custody, present on it gets NEW removal rows,
 * so a role re-added after a settled removal (MEE6's stale write, restore.ts:4-9) is removed again. Rename holds remove the
 * membership role only. Spent lane rows close GET-free from the same read. */
async function visitCause(x:Ctx,row:WalkRow):Promise<Visit>{
 const subject=row.discord_id!,banned=row.banned===1,cfg=x.cap.cfg;
 if(row.privacy_state!==null&&row.privacy_state!=='active')return 'done'; // skipped and passed (roles.ts:311)
 if(!banned&&(!x.clock.fresh||!cfg))return 'done';
 if(laneRoom(x.parent)<L.FRESH_CAUSE_MIN_ENTRY)return 'budget';
 const b=laneChildBudget(x.parent,FRESH_CAUSE_CHILD_CAP),generation=row.privacy_generation;remember(x,row);
 let screen:LaneObservation;try{screen=await R.laneMemberRead(x.env,b,subject);}catch(e){return failed(x,e);}
 if(!screen.member)return 'done';
 const spent=await spentCount(x,subject);if(spent===null)return 'statements';
 const read=await readSpent(x,subject,screen,b,spent);if(read!=='done')return read;
 const roles=screen.member.roles;
 const groups:LaneRemovalGroup[]|null=banned?await banGroups(x,subject,roles):roles.includes(cfg!.membership)?[{purpose:L.FRESH_REMOVAL_RENAME_HOLD,roles:[cfg!.membership]}]:[];
 if(!groups)return 'statements';
 return removeGroups(x,subject,generation,groups,b);
}
/** Major 1: a departed subject's plan comes from custody only (fresh grant custody, historical IDs included; bot staff custody
 * with EVER_LIVE), absent roles included so their receipts close the debt. The causes are checked in SQL first: nothing
 * owed, or no cause, costs no request. A spent departure removal due for an outcome read is read from the same inventory. */
async function visitDeparture(x:Ctx,row:WalkRow):Promise<Visit>{
 const subject=row.discord_id!,generation=row.privacy_generation,cap=x.cap,cfg=cap.cfg;
 if(laneRoom(x.parent)<L.FRESH_REMOVAL_MIN_ENTRY)return 'budget';
 if(!x.admit(4))return 'statements';remember(x,row);
 const fresh=x.clock.fresh&&cfg?(await x.env.DB.prepare(L.FRESH_CUSTODY_ROLES).bind(subject,cap.guild).all<{role_id:string}>()).results.map(r=>r.role_id):[];
 const staff=x.clock.staff?(await x.env.DB.prepare(L.staffCustodyRolesSql(false)).bind(subject,cap.guild,L.laneManagedJson(cap)).all<{role_id:string}>()).results.map(r=>r.role_id):[];
 const plans:{purpose:LaneRemovalGroup['purpose'];roles:string[];epoch:number}[]=[];
 if(fresh.length)plans.push({purpose:L.FRESH_REMOVAL_DEPARTURE,roles:fresh.slice(0,20),epoch:cfg!.epochStart});if(staff.length)plans.push({purpose:L.STAFF_REMOVAL_DEPARTURE,roles:staff,epoch:cap.linksNotBefore});
 const causes=plans.length?await x.env.DB.batch(plans.map(p=>{const sql=L.laneRemovalSql(p.purpose).precheck;return x.env.DB.prepare(sql).bind(...L.bindsFor(sql,[null,subject,p.purpose,cap.guild,null,generation,p.epoch]));})):[];
 const groups:LaneRemovalGroup[]=plans.filter((_,k)=>!!causes[k]?.results?.length).map(p=>({purpose:p.purpose,roles:p.roles}));
 const spent=row.spent===1?await spentCount(x,subject):0;if(spent===null)return 'statements';
 if(!groups.length&&!spent)return 'done';
 if(laneRoom(x.parent)<L.FRESH_RECONCILE_MIN_LEFT)return 'budget';
 const b=laneChildBudget(x.parent,FRESH_REMOVAL_CHILD_CAP),cover=[...new Set([...groups.flatMap(g=>g.roles),...x.freshCover,...(x.clock.staff?cap.managedStaff:[])])].slice(0,24);
 let o:LaneObservation;try{o=await R.laneQualifyEach(x.env,b,subject,cover);}catch(e){return failed(x,e);}
 const read=await readSpent(x,subject,o,b,spent);if(read!=='done')return read;
 return removeGroups(x,subject,generation,groups,b,{observed:o});
}
/** A blocking role on the member (:480-481, :494): the fresh membership role is removed; the row (even an absent receipt)
 * keys the backoff on this snapshot, so a blocked subject costs one visit per changed export or per hour. */
async function blockingRemoval(x:Ctx,subject:string,generation:string|null,o:LaneObservation,b:CallBudget):Promise<Visit>{
 const cfg=x.cap.cfg;if(!x.clock.fresh||!cfg||x.snapshot===null)return 'done';
 return removeGroups(x,subject,generation,[{purpose:L.FRESH_REMOVAL_BLOCKING_ROLE,roles:[cfg.membership]}],b,{rosterId:x.snapshot,observed:o.kind==='inventory'?o:undefined});
}
/** Settle a producer's rows in its order (removals, membership, rank) on one covering inventory: at most
 * FRESH_EFFECTS_PER_SUBJECT effects, FRESH_EFFECT_SPACING_MS apart, stopping at the first unknown. A hierarchy or server
 * hold marks the never-dispatched row for the backoff. */
async function settleQueued(x:Ctx,subject:string,q:LaneQueueResult,o:LaneObservation,b:CallBudget,cover:readonly string[]):Promise<Visit>{
 let obs=o;
 if(obs.kind!=='inventory'){if(b.limit-b.attempts<2*L.FRESH_RECONCILE_MIN_LEFT)return 'budget';try{obs=await R.laneQualifyEach(x.env,b,subject,cover);}catch(e){return failed(x,e);}}
 let effects=0,settles=0;
 for(const id of q.ids){
  if(effects>=L.FRESH_EFFECTS_PER_SUBJECT||settles>=FRESH_SETTLES_PER_SUBJECT)break;
  if(!x.admit(FRESH_INTENT_STATEMENTS+FRESH_MARK_STATEMENTS))return 'statements';
  if(x.effects)await sleep(L.FRESH_EFFECT_SPACING_MS);
  const before=b.attempts,r=await R.settleLaneIntent(x.env,x.cap,id,false,b,obs,{pending:q.pending});settles++;
  if(b.attempts>before){effects++;x.effects++;}
  tally(x,r);
  if(r.reason==='inventory_hierarchy_or_server_hold')await R.markLaneQualifyHeld(x.env,x.cap,id);
  if(r.reason==='role_request_budget')return 'budget';
  if(r.state==='unknown')break;
 }
 return 'done';
}
/** Grant debt (A4): the screen read, or one inventory when spent rows wait (then the GET-free reader), a blocker's removal,
 * the producer (highest-ranked verified live character, owner round 3; the ack bound to the picked pending id, Q3), then the
 * consumer. prior: the presence visit's read and child budget, counted as this visit's. */
async function visitGrant(x:Ctx,row:WalkRow,prior?:Readonly<{o:LaneObservation;b:CallBudget}>):Promise<Visit>{
 const subject=row.discord_id!,generation=row.privacy_generation;remember(x,row);
 let o:LaneObservation,b:CallBudget;
 if(prior){o=prior.o;b=prior.b;}
 else{
  if(laneRoom(x.parent)<FRESH_GRANT_MIN_ENTRY)return 'budget';
  b=laneChildBudget(x.parent,FRESH_GRANT_CHILD_CAP);
  const spent=await spentCount(x,subject);if(spent===null)return 'statements';
  try{o=spent?await R.laneQualifyEach(x.env,b,subject,x.freshCover):await R.laneMemberRead(x.env,b,subject);}catch(e){return failed(x,e);}
  const read=await readSpent(x,subject,o,b,spent);if(read!=='done')return read;
 }
 if(!o.member)return 'done';
 if(o.blocked)return blockingRemoval(x,subject,generation,o,b);
 if(!x.clock.grants||!x.tenRank||x.snapshot===null)return 'done';
 if(!x.admit(FRESH_QUEUE_STATEMENTS))return 'statements';
 const q=await R.queueFreshRosterRoles(x.env,x.cap,subject,x.snapshot,generation,o);
 if(q.state==='link_missing'){x.counts.linkMissing++;
  if(!x.linkAudited&&x.admit(1)){x.linkAudited=true;const ref=x.refs.get(subject);if(ref)await audit(x.env,'system',L.FRESH_AUDIT.linkMissing,x.trigger,{n:x.snapshot},ref);}
  return 'done';}
 if(q.state!=='queued'||!q.ids.length)return 'done';
 return settleQueued(x,subject,q,o,b,x.freshCover);
}
/** Staff (Part B, ten-rank only): one inventory covering the managed staff IDs (and the fresh IDs, so the reader stays
 * GET-free), spent staff rows (staff_roster_rank through the lane reader; a ten-rank old-purpose row only stamped, P1-A),
 * the producer, the per-row absence settle, then at most two effects. */
async function visitStaff(x:Ctx,row:WalkRow):Promise<Visit>{
 const subject=row.discord_id!,generation=row.privacy_generation,cap=x.cap;
 if(laneRoom(x.parent)<L.STAFF_MIN_ENTRY)return 'budget';
 const b=laneChildBudget(x.parent,STAFF_CHILD_CAP);remember(x,row);
 let o:LaneObservation;try{o=await R.laneQualifyEach(x.env,b,subject,x.staffCover);}catch(e){return failed(x,e);}
 if(row.spent===1){ // before the member check: a member who left still has spent rows to read (the reader reads a 404 as absent)
  const spent=await spentCount(x,subject);if(spent===null)return 'statements';
  const read=await readSpent(x,subject,o,b,spent);if(read!=='done')return read;
  // P1-A (Codex 23:18 UTC): never .160 settleRoleIntent(reconcileOnly) here. Its stale-absence branch (:275-278), its absent-
  // while-current confirm of a DELETE (:296-298) and its compensation branch (:249, reconcileRemovalReceipt :367-368) each
  // close an uncertain effect from a read. The lane records this visit's read on the row (checked_at only) and nothing else.
  if(!x.admit(FRESH_OLD_OBSERVE_STATEMENTS))return 'statements';
  const staffIds=L.laneFamilyJson(cap,'staff'),old=await x.env.DB.prepare(FRESH_OLD_STAFF_SPENT).bind(subject,cap.guild,staffIds).first<{id:string}>();
  if(old){await x.env.DB.prepare(FRESH_OLD_STAFF_OBSERVED).bind(old.id,staffIds).run();
   tally(x,Object.freeze({state:'unknown' as const,reason:'old_staff_spent_unresolved',operationId:old.id,checkedAt:null}));}
 }
 if(!o.member)return 'done';
 if(x.snapshot===null||!x.admit(STAFF_QUEUE_STATEMENTS+STAFF_ABSENCE_STATEMENTS))return x.snapshot===null?'done':'statements';
 const q=await R.queueStaffRankRoles(x.env,cap,subject,x.snapshot,generation,o);
 if(q.state!=='queued'||!q.ids.length)return 'done';
 await R.settleStaffRankAbsences(x.env,cap,subject,x.snapshot,generation,b,o);
 return settleQueued(x,subject,q,o,b,x.staffCover);
}
/** Presence (major 2): one screen GET, or one inventory and the GET-free reader when spent fresh rows are due, even when every
 * role is present. It continues as a grant visit on the same read when a blocker is on the member, membership is missing,
 * the wanted rank is missing or an unwanted fresh rank is present (restore.ts:281). */
async function visitPresence(x:Ctx,row:WalkRow):Promise<Visit>{
 const subject=row.discord_id!,generation=row.privacy_generation,cfg=x.cap.cfg,due=row.spent===1;
 if(!cfg||laneRoom(x.parent)<(due?L.FRESH_RECONCILE_MIN_LEFT:1))return 'budget';
 const b=laneChildBudget(x.parent,FRESH_GRANT_CHILD_CAP);remember(x,row);
 const spent=due?await spentCount(x,subject):0;if(spent===null)return 'statements';
 let o:LaneObservation;try{o=spent?await R.laneQualifyEach(x.env,b,subject,x.freshCover):await R.laneMemberRead(x.env,b,subject);}catch(e){return failed(x,e);}
 const read=await readSpent(x,subject,o,b,spent);if(read!=='done')return read;
 if(!o.member)return 'done';
 let escalate=o.blocked;
 if(!escalate&&x.clock.grants&&x.tenRank&&x.snapshot!==null){
  const roles=o.member.roles;
  if(!roles.includes(cfg.membership))escalate=true;
  else{if(!x.admit(1))return 'statements';
   const pick=await x.env.DB.prepare(L.primaryPickSql('fresh')).bind(x.snapshot,subject,generation,cfg.epochStart,x.D).first<{rank_index:number}>();
   const wanted=pick?cfg.native[pick.rank_index]:undefined;
   escalate=!!wanted&&(!roles.includes(wanted)||cfg.native.some(r=>r!==wanted&&roles.includes(r)));}
 }
 if(!escalate)return 'done';
 // The hierarchy/blocking backoff (BACKOFF, as grant debt applies it): a marked subject is not re-planned from presence either.
 if(x.snapshot!==null){if(!x.admit(1))return 'statements';if(await x.env.DB.prepare(`SELECT 1 AS held WHERE ${L.backoffSql('?1','?2','fresh')}`).bind(subject,x.snapshot).first())return 'done';}
 return visitGrant(x,row,{o,b});
}

/** The captured configuration still holds; a change stops every later visit of the pass (the lane calls hold on their own). */
function live(x:Ctx):boolean{if(x.stop)return false;if(!x.cap.current()){x.stop='lane_configuration_changed';return false;}return true;}
/** One window walk: visit the selected subjects (up to limit), then the next cursor (the last selected when the limit was
 * reached, else window_end, else "" at the end); a request or statement stop keeps the last finished subject. */
async function windowWalk(x:Ctx,sql:string,binds:unknown[],limit:number,cursor:string,visit:(row:WalkRow)=>Promise<Visit>):Promise<string>{
 if(!live(x)||!x.admit(1))return cursor;
 const rows=(await x.env.DB.prepare(sql).bind(...L.bindsFor(sql,binds)).all<WalkRow>()).results,selected=rows.filter(r=>typeof r.discord_id==='string'&&ID.test(r.discord_id));
 let finished=cursor;
 for(const row of selected){
  if(!live(x))return finished;
  const v=await guarded(x,()=>visit(row));if(v!=='done')return finished;finished=row.discord_id!;
 }
 if(selected.length>=limit)return finished;
 const size=rows[0]?.window_size??0;return size<L.FRESH_WALK_WINDOW?'':rows[0]?.window_end??'';
}
async function causeStep(x:Ctx,st:FreshState){
 if(!live(x)||!x.admit(1))return;
 const rows=(await x.env.DB.prepare(L.causeRotationSelectSql(x.clock.fresh)).bind(st.r,L.FRESH_CAUSE_ROTATION_PER_PASS).all<WalkRow>()).results;
 for(const row of rows){
  if(typeof row.discord_id!=='string'||!ID.test(row.discord_id))continue;
  if(!live(x))return;
  if(await guarded(x,()=>visitCause(x,row))!=='done')return;st.r=row.discord_id;
 }
 if(rows.length<L.FRESH_CAUSE_ROTATION_PER_PASS)st.r='';
}
async function departureStep(x:Ctx,st:FreshState,t:number){
 if(!live(x))return;
 const cfg=x.cap.cfg,binds=(c:string)=>[c,x.clock.fresh&&cfg?cfg.epochStart:0,x.clock.staff?x.cap.linksNotBefore:0,x.cap.guild,L.FRESH_DEPARTURE_SUBJECTS_PER_PASS,L.FRESH_WALK_WINDOW,x.clock.staff?L.laneManagedJson(x.cap):'[]'];
 let visits=0;
 if(st.h===null){if(!x.admit(1))return;st.h=(await x.env.DB.prepare(FRESH_DEPARTURE_EVENTS_START).bind(t-FRESH_DEPARTURE_EVENTS_LOOKBACK_SECONDS).first<{id:number}>())?.id??0;}
 else{
  if(!x.admit(1))return;
  const events=(await x.env.DB.prepare(FRESH_DEPARTURE_EVENTS_SELECT).bind(st.h,FRESH_DEPARTURE_EVENTS_PER_PASS,FRESH_DEPARTURE_EVENT_WINDOW,x.cap.guild)
   .all<{id:number|null;subject_id:unknown;window_end:number|null}>()).results,owed=events.filter(e=>typeof e.id==='number');
  let all=true;
  for(const e of owed){
   if(visits>=L.FRESH_DEPARTURE_SUBJECTS_PER_PASS){all=false;break;}
   if(typeof e.subject_id==='string'&&ID.test(e.subject_id)){
    if(!x.admit(1))return;
    const single=L.departureWalkSelectSql(true),row=(await x.env.DB.prepare(single).bind(...L.bindsFor(single,binds(e.subject_id))).all<WalkRow>()).results.find(r=>r.discord_id===e.subject_id);
    if(row){if(!live(x))return;if(await guarded(x,()=>visitDeparture(x,row))!=='done')return;visits++;}
   }
   st.h=e.id!;
  }
  // Every owing event of the window handled (fewer than the limit came back): the watermark passes the whole window.
  const end=events[0]?.window_end;if(all&&owed.length<FRESH_DEPARTURE_EVENTS_PER_PASS&&typeof end==='number'&&end>st.h)st.h=end;
 }
 if(visits<L.FRESH_DEPARTURE_SUBJECTS_PER_PASS)st.d=await windowWalk(x,L.departureWalkSelectSql(),binds(st.d),L.FRESH_DEPARTURE_SUBJECTS_PER_PASS,st.d,row=>visitDeparture(x,row));
}
async function grantStep(x:Ctx,st:FreshState){
 const cfg=x.cap.cfg;if(!x.clock.grants||!x.tenRank||x.snapshot===null||!cfg||!x.D)return;
 st.g=await windowWalk(x,L.GRANT_DEBT_SELECT,[st.g,x.snapshot,cfg.epochStart,x.cap.guild,cfg.membership,JSON.stringify(cfg.native),L.FRESH_GRANT_SUBJECTS_PER_PASS,L.FRESH_WALK_WINDOW,x.D],
  L.FRESH_GRANT_SUBJECTS_PER_PASS,st.g,row=>visitGrant(x,row));
}
async function staffStep(x:Ctx,st:FreshState){
 if(!x.clock.staff||!x.tenRank||x.snapshot===null)return;
 st.s=await windowWalk(x,L.STAFF_WALK_SELECT,[st.s,x.snapshot,x.cap.linksNotBefore,x.cap.guild,L.laneStaffMapJson(x.cap),L.STAFF_SUBJECTS_PER_PASS,L.laneManagedJson(x.cap),L.FRESH_WALK_WINDOW,L.laneFamilyJson(x.cap,'staff')],
  L.STAFF_SUBJECTS_PER_PASS,st.s,row=>visitStaff(x,row));
}
async function presenceStep(x:Ctx,st:FreshState){
 const cfg=x.cap.cfg;if(!x.clock.fresh||!cfg)return;
 st.p=await windowWalk(x,L.PRESENCE_WALK_SELECT,[st.p,x.cap.guild,L.FRESH_PRESENCE_PER_PASS,L.FRESH_WALK_WINDOW,cfg.epochStart],L.FRESH_PRESENCE_PER_PASS,st.p,row=>visitPresence(x,row));
}

/** One fresh-role pass. Never throws: it runs inside a deferral, where an error would only vanish. calls: the invocation's
 * shared allowance (the /queue parent after the legacy sweep, or the export's own). adm: the caller's statement admission
 * (countStatements); without it each bound is reserved against FRESH_SWEEP_STATEMENTS less reserve (what the caller already
 * ran in this invocation, e.g. the /queue route). cap: captured before any await. */
export async function runFreshPass(env:Env,io:Readonly<{calls:CallBudget;adm?:Admission;reserve?:number}>,trigger:FreshTrigger,cap:LaneCapture):Promise<FreshPassResult>{
 const counts=emptyCounts(),t=now(),done=(state:FreshPassResult['state'],reason:string):FreshPassResult=>Object.freeze({state,reason,counts:Object.freeze({...counts})});
 if(!cap||!cap.configured||!io||!io.calls||trigger!=='watcher'&&trigger!=='ingest')return done('skipped','not_configured');
 const clock=L.laneClock(cap,t),open=clock.fresh||clock.staff,held=cap.fresh==='held'||cap.staff==='held';
 if(!open&&!held)return done('skipped','clock_gate'); // before the epoch: no D1 at all. A held lane is audited whatever the clock.
 if(trigger==='watcher'&&t-lastFreshLocal<L.FRESH_INTERVAL_SECONDS)return done('skipped','throttled');
 const adm=io.adm??null,local={used:0},startUsed=adm?adm.count.used:0,reserve=io.reserve;
 const limit=FRESH_SWEEP_STATEMENTS-(typeof reserve==='number'&&Number.isSafeInteger(reserve)&&reserve>0?Math.min(reserve,FRESH_SWEEP_STATEMENTS):0);
 const admit=(n:number)=>{if(adm)return room(adm,FRESH_CLOSE_STATEMENTS)>=n;if(local.used+n+FRESH_CLOSE_STATEMENTS>limit)return false;local.used+=n;return true;};
 let lease:string|null=null,snapshot:number|null|undefined;
 try{
  if(!cap.current())return done('held','lane_configuration_changed');
  if(!admit(FRESH_OPEN_STATEMENTS))return done('held','statement_budget');
  const recent=await env.DB.prepare(L.FRESH_INTERVAL_SELECT).first<{ts:number;action:string;snapshot_id:number|null}>();
  if(recent){
   if(trigger==='watcher'||!open){lastFreshLocal=Math.max(lastFreshLocal,recent.ts);return done('skipped','interval');}
   snapshot=(await env.DB.prepare(L.NEWEST_SNAPSHOT_SELECT).first<{id:number|null}>())?.id??null;
   if(recent.snapshot_id===snapshot)return done('skipped','interval'); // major 5: the ingest trigger runs early only on a changed export
  }
  lastFreshLocal=t;
  if(held){
   await audit(env,'system',L.FRESH_AUDIT.configHeld,trigger,{fresh:cap.freshReason,staff:cap.staffReason,n:snapshot??null});
   await logLine(env,`⏸️ fresh roles: configuration held (fresh: ${cap.freshReason}, staff: ${cap.staffReason}). ${open?'The other lane keeps running.':'No fresh or staff role changes run until it is fixed.'}`);
   if(!open)return done('held','configuration_held');
  }
  const value=L.freshLeaseValue(t+L.FRESH_LEASE_SECONDS,randomGeneration());
  if(!await env.DB.prepare(L.FRESH_LEASE_ACQUIRE).bind(value).first())return done('skipped','lease_held');
  lease=value;
  const st=parseState((await env.DB.prepare(L.FRESH_STATE_SELECT).first<{details:string|null}>())?.details);
  if(snapshot===undefined)snapshot=(await env.DB.prepare(L.NEWEST_SNAPSHOT_SELECT).first<{id:number|null}>())?.id??null;
  let tenRank=false;
  if(snapshot!==null&&(clock.grants||clock.staff)){
   const rows=(await env.DB.prepare(L.PROFILE_ROWS_SELECT).bind(snapshot).all<{rank:string;rank_index:number}>()).results;
   try{tenRank=identifyNativeProfile(rows)==='ten-rank';}catch{tenRank=false;}
  }
  if((clock.grants||clock.staff)&&!tenRank)await audit(env,'system',L.FRESH_AUDIT.profileHeld,trigger,{n:snapshot});
  if(clock.fresh&&!clock.grants)await audit(env,'system',L.FRESH_AUDIT.grantsHeld,trigger,{reason:cap.freshReason,n:snapshot});
  const x:Ctx={env,cap,parent:io.calls,trigger,clock,snapshot,tenRank,D:clock.fresh&&cap.raw!==null?await L.laneDigest(cap.raw):null,admit,counts,refs:new Map(),linkAudited:false,effects:0,stop:'',
   freshCover:clock.fresh?cap.freshIds:[],staffCover:[...(clock.staff?cap.managedStaff:[]),...(clock.fresh?cap.freshIds:[])]};
  await causeStep(x,st);
  await departureStep(x,st,t);
  if(st.k===0){await grantStep(x,st);await staffStep(x,st);}else{await staffStep(x,st);await grantStep(x,st);}
  await presenceStep(x,st);
  counts.statements=adm?adm.count.used-startUsed:local.used;
  // Cursors (Discord IDs or ""), the departure watermark (an audit id), parity and counts. References: active visited subjects only.
  const details={r:st.r,d:st.d,g:st.g,s:st.s,p:st.p,k:st.k===0?1:0,h:st.h,n:snapshot,stop:x.stop||null,visits:counts.visits,removed:counts.removed,settled:counts.settled,
   confirmed:counts.confirmed,unknown:counts.unknown,held:counts.held,failed:counts.failed,linkMissing:counts.linkMissing,attempts:counts.requests};
  const refs=[...x.refs.values()];
  const stored=await env.DB.prepare(STATE_AUDIT).bind(now(),L.FRESH_AUDIT.state,trigger,JSON.stringify(refs.length?{...details,_privacySubjectIds:refs.map(r=>r.subject)}:details),
   JSON.stringify(refs.map(r=>({id:r.subject,g:r.capture?.subjectGeneration??null})))).run();
  if(!Number(stored?.meta?.changes??0))await audit(env,'system',L.FRESH_AUDIT.tick,trigger,details);
  if(counts.removed||counts.settled||counts.unknown||counts.failed)
   await logLine(env,`🎖️ fresh roles (${trigger}): ${counts.removed} removed, ${counts.settled} settled, ${counts.confirmed} confirmed present, ${counts.unknown} unconfirmed, ${counts.held} held, ${counts.failed} failed; ${counts.requests} requests to Discord.`);
  return done('done',x.stop||'pass_complete');
 }catch(e){
  try{await audit(env,'system',L.FRESH_AUDIT.failed,trigger,{error:redact(e),n:snapshot??null});}catch{/* the audit itself failed; nothing left to tell */}
  return done('failed','pass_failed');
 }finally{
  if(lease)try{await env.DB.prepare(L.FRESH_LEASE_RELEASE).bind(lease).run();}catch{/* it expires after FRESH_LEASE_SECONDS */}
 }
}

export type FreshBanResult=Readonly<{state:Settlement['state'];reason:string;removed:number;unknown:number;attempts:number}>;
/** The ban deferral (A3), registered after interactions.ts:419 in configured mode. No lease (row CAS protects); no screen GET:
 * one inventory, the GET-free reader, then removal of every present fresh role and every present managed staff role in the
 * bot's ban custody. parent: limit ROLE_CALL_BUDGET - LEGACY_BAN_ALLOWANCE, so the interaction stays within the allowance.
 * env: the interaction's own (its statements are its own; FRESH_BAN_STATEMENTS bounds them). If it cannot run, the next
 * rotation visit covers the account. Never throws. */
export async function settleLaneBan(env:Env,subject:string,cap:LaneCapture,parent:CallBudget):Promise<FreshBanResult>{
 const t=now(),result=(state:Settlement['state'],reason:string,removed=0,unknown=0,attempts=0):FreshBanResult=>Object.freeze({state,reason,removed,unknown,attempts});
 try{
  if(!cap||!cap.configured||typeof subject!=='string'||!ID.test(subject)||!parent)return result('held','invalid_operation');
  const clock=L.laneClock(cap,t);if(!clock.fresh&&!clock.staff)return result('held','clock_gate');
  if(!cap.current())return result('held','lane_configuration_changed');
  if(laneRoom(parent)<L.FRESH_REMOVAL_MIN_ENTRY)return result('held','role_request_budget');
  const p=await readPrivacySubject(env,subject);if(p&&p.state!=='active')return result('held','privacy_subject_not_active');
  if(!await env.DB.prepare(BANNED_NOW).bind(subject).first())return result('held','removal_cause_withdrawn');
  const historical=clock.fresh?(await env.DB.prepare(L.FRESH_CUSTODY_ROLES).bind(subject,cap.guild).all<{role_id:string}>()).results.map(r=>r.role_id).filter(r=>!cap.freshIds.includes(r)):[];
  const cover=[...new Set([...(clock.fresh?cap.freshIds:[]),...historical,...(clock.staff?cap.managedStaff:[])])].slice(0,24);
  const b=laneChildBudget(parent,FRESH_REMOVAL_CHILD_CAP),x={env,cap,clock,admit:()=>true};
  let o:LaneObservation;try{o=await R.laneQualifyEach(env,b,subject,cover);}catch{return result('held','inventory_hierarchy_or_server_hold',0,0,b.attempts);}
  if(!o.member)return result('settled','not_member',0,0,b.attempts);
  const spent=(await env.DB.prepare(FRESH_SPENT_COUNT).bind(subject,cap.guild).first<{n:number}>())?.n??0;
  if(spent)await R.readLaneSpentRows(env,cap,subject,o,b);
  const groups=await banGroups(x,subject,o.member.roles,historical);
  if(!groups?.length)return result('settled','nothing_present',0,0,b.attempts);
  const out=await R.settleLaneRemoval(env,cap,subject,p?.subjectGeneration??null,groups,b,{observed:o});
  return result(out.state,out.reason,out.rows.filter(r=>r.reason==='removed').length,out.rows.filter(r=>r.state==='unknown').length,b.attempts);
 }catch(e){
  try{await audit(env,'system',L.FRESH_AUDIT.failed,'ban',{error:redact(e)});}catch{/* nothing left to tell */}
  return result('held','ban_visit_failed');
 }
}
