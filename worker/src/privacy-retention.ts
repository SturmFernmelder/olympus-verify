/** Automatic finite local retention. This never claims provider-message or private-export disposal.
 * All clocks are consumed from the database; historical beta requests/first-seen dates age from the
 * recorded cutoff only after the attended beta reset confirms that same cutoff.
 */
import {betaProvenanceRetentionStatements} from './qr-beta-fern-data';
import {betaResetCursorRetentionStatement} from './beta-reset-scan';
import {betaResetReceiptRetentionStatements} from './beta-reset-retention';
import type { Env } from './env';
import { privacyAccessPurgeStatements } from './privacy-access';
import { PRIVACY_DB_NOW as T, PRIVACY_YEAR as YEAR } from './privacy-serving-authority';
import {betaRetentionClockSql as betaAged} from './privacy-retention-clocks';
import { rulesetPublicationRetentionStatement,rulesetActivationAttributionRetentionStatement } from './ruleset-publication-data';
import { bnetCustodyMarkerSql } from './bnet-retention';
const expired=(clock:string)=>`${clock}<=${T}-${YEAR}`;
const active=(identity:string)=>`EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=${identity} AND c.status NOT IN('unbound','denied','left'))`;
/** Source scheduling custody only; this supplies no account, ticket, epoch or provider authority. */
declare const originalRetentionScheduleBrand:unique symbol;
export type OriginalServingRetentionSchedule=Readonly<{[originalRetentionScheduleBrand]:true}>;
const retentionScheduleHeld=():never=>{throw Error('privacy_retention_original_schedule_held');};
type RetentionClockSlot=Readonly<{target:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}>;
const retentionGlobalDateSlots:RetentionClockSlot[]=[];
let retentionGlobalDateTarget:object|null=globalThis,retentionGlobalDateDescriptor:PropertyDescriptor|undefined;
while(retentionGlobalDateTarget){
 if(retentionGlobalDateSlots.length>=16)retentionScheduleHeld();
 const descriptor=Object.getOwnPropertyDescriptor(retentionGlobalDateTarget,'Date'),prototype=Object.getPrototypeOf(retentionGlobalDateTarget);
 retentionGlobalDateSlots.push(Object.freeze({target:retentionGlobalDateTarget,prototype,descriptor:descriptor?Object.freeze({...descriptor}):undefined}));
 if(descriptor){retentionGlobalDateDescriptor=descriptor;break;}retentionGlobalDateTarget=prototype;
}
if(!retentionGlobalDateDescriptor||!Object.hasOwn(retentionGlobalDateDescriptor,'value')||typeof retentionGlobalDateDescriptor.value!=='function')retentionScheduleHeld();
const retentionDate=retentionGlobalDateDescriptor!.value as DateConstructor,retentionNow=Object.getOwnPropertyDescriptor(retentionDate,'now');
const originalRetentionSchedules=new WeakMap<OriginalServingRetentionSchedule,{phase:'general'|'beta';check:()=>void;spent:boolean}>();
function retentionGlobalDateCurrent():void{
 for(const slot of retentionGlobalDateSlots){
  if(Object.getPrototypeOf(slot.target)!==slot.prototype)return retentionScheduleHeld();
  const descriptor=Object.getOwnPropertyDescriptor(slot.target,'Date');
  if(slot.descriptor===undefined){if(descriptor!==undefined)return retentionScheduleHeld();}
  else if(!descriptor||!['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(descriptor[k as keyof PropertyDescriptor],slot.descriptor![k as keyof PropertyDescriptor])))return retentionScheduleHeld();
 }
}
function retentionClockMethod():Function{
 retentionGlobalDateCurrent();const now=Object.getOwnPropertyDescriptor(retentionDate,'now');
 if(!retentionNow||!now||!Object.hasOwn(retentionNow,'value')||typeof retentionNow.value!=='function'||!['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(now[k as keyof PropertyDescriptor],retentionNow[k as keyof PropertyDescriptor])))return retentionScheduleHeld();return retentionNow.value;
}
/** Shared index body calls this once before its first await. Phase never comes from a later clock. */
export function captureServingRetentionSchedule():OriginalServingRetentionSchedule{
 const read=()=>{const ms=Reflect.apply(retentionClockMethod(),retentionDate,[]) as unknown;if(typeof ms!=='number'||!Number.isSafeInteger(ms)||ms<1||ms>253402300799999)return retentionScheduleHeld();return ms;};
 const original=read(),phase=Math.floor(original/900000)%2===0?'general':'beta';let latest=original;
 const check=()=>{const now=read();if(now<latest)return retentionScheduleHeld();latest=now;};check();
 const cap=Object.freeze({}) as OriginalServingRetentionSchedule;originalRetentionSchedules.set(cap,{phase,check,spent:false});return cap;
}
function originalRetentionSchedule(cap:OriginalServingRetentionSchedule):{phase:'general'|'beta';check:()=>void;spent:boolean}{const s=originalRetentionSchedules.get(cap);if(!s)return retentionScheduleHeld();s.check();return s;}
/** Fixed statement census is part of the joined scheduled budget. Each selection has a finite deterministic page. */
function generalServingRetentionStatements(env:Env):D1PreparedStatement[]{return [
 rulesetPublicationRetentionStatement(env),
 ...privacyAccessPurgeStatements(env),
 env.DB.prepare(`DELETE FROM privacy_denial_markers WHERE subject_key IN(SELECT subject_key FROM privacy_denial_markers WHERE retain_until<=${T} ORDER BY retain_until,subject_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_restore_replay WHERE operation_id IN(SELECT operation_id FROM privacy_restore_replay WHERE retain_until<=${T} ORDER BY retain_until,operation_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_serving_jobs WHERE operation_id IN(SELECT operation_id FROM privacy_serving_jobs WHERE state='complete' AND retain_until<=${T} ORDER BY retain_until,operation_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_subjects WHERE subject_id IN(SELECT s.subject_id FROM privacy_subjects s WHERE s.state='retired' AND s.retain_until<=${T}
  AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=s.subject_id AND j.state<>'complete') ORDER BY s.retain_until,s.subject_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM pending WHERE id IN(SELECT id FROM pending WHERE ${expired(betaAged('created_at'))} AND (consumed_at IS NOT NULL OR expires_at<=${T}) ORDER BY created_at,id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_first_seen WHERE name_key IN(SELECT f.name_key FROM roster_first_seen f WHERE ${expired(betaAged('f.first_seen'))}
  AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.name_key=f.name_key AND c.status NOT IN('unbound','denied','left'))
  AND NOT EXISTS(SELECT 1 FROM roster_members m WHERE m.name_key=f.name_key AND m.snapshot_id=(SELECT MAX(id) FROM roster_snapshots WHERE complete=1)) ORDER BY f.first_seen,f.name_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM invite_queue WHERE id IN(SELECT q.id FROM invite_queue q WHERE q.status IN('cancelled','expired','declined','joined')
  AND ${expired('COALESCE(q.joined_at,q.invited_at,q.written_at,q.created_at)')} AND NOT ${active('q.discord_id')} ORDER BY q.created_at,q.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_applications WHERE discord_id IN(SELECT a.discord_id FROM site_applications a WHERE a.status IN('declined','withdrawn')
  AND ${expired('a.updated_at')} ORDER BY a.updated_at,a.discord_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_reserved WHERE id IN(SELECT r.id FROM site_reserved r WHERE r.status='released' AND ${expired('COALESCE(r.released_at,r.created_at)')}
  AND NOT EXISTS(SELECT 1 FROM invite_queue q WHERE q.id=r.queue_id AND q.status IN('queued','written','invited')) ORDER BY COALESCE(r.released_at,r.created_at),r.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_friends WHERE rowid IN(SELECT f.rowid FROM site_friends f WHERE f.friend_kind='discord' AND ${expired('f.created_at')}
  AND NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=f.friend_key) AND NOT ${active('f.friend_key')} ORDER BY f.created_at,f.owner_id,f.friend_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_votes WHERE rowid IN(SELECT v.rowid FROM site_votes v WHERE v.nominee_kind='discord' AND ${expired('v.updated_at')}
  AND NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=v.nominee_key) AND NOT ${active('v.nominee_key')} ORDER BY v.updated_at,v.voter_id,v.ballot,v.slot LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM relays WHERE officer_id IN(SELECT officer_id FROM relays WHERE online=0 AND ${expired('seen_at')} ORDER BY seen_at,officer_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_effects WHERE rowid IN(SELECT e.rowid FROM roster_effects e JOIN roster_effect_runs r ON r.id=e.run_id WHERE ${expired('r.created_at')}
  AND (r.done_at IS NOT NULL OR r.superseded_at IS NOT NULL) ORDER BY r.created_at,e.run_id,e.seq LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_effect_runs WHERE id IN(SELECT r.id FROM roster_effect_runs r WHERE ${expired('r.created_at')}
  AND (r.done_at IS NOT NULL OR r.superseded_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM roster_effects e WHERE e.run_id=r.id) ORDER BY r.created_at,r.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_members WHERE rowid IN(SELECT m.rowid FROM roster_members m JOIN roster_snapshots s ON s.id=m.snapshot_id WHERE ${expired('s.first_received_at')}
  AND s.id<>(SELECT MAX(id) FROM roster_snapshots WHERE complete=1) AND NOT EXISTS(SELECT 1 FROM roster_effect_runs r WHERE (r.snapshot_id=s.id OR r.prev_snapshot_id=s.id) AND r.done_at IS NULL AND r.superseded_at IS NULL)
  ORDER BY s.first_received_at,m.snapshot_id,m.name_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_snapshots WHERE id IN(SELECT s.id FROM roster_snapshots s WHERE ${expired('s.first_received_at')}
  AND s.id<>(SELECT MAX(id) FROM roster_snapshots WHERE complete=1) AND NOT EXISTS(SELECT 1 FROM roster_members m WHERE m.snapshot_id=s.id)
  AND NOT EXISTS(SELECT 1 FROM roster_effect_runs r WHERE (r.snapshot_id=s.id OR r.prev_snapshot_id=s.id) AND r.done_at IS NULL AND r.superseded_at IS NULL) ORDER BY s.first_received_at,s.id LIMIT 1000)`),
 // .147: local audit expiry cannot erase the sole warning about an unconfirmed external BattleTag copy.
 // Purge and retention are separate jobs: hold a raw successful account link until its exact minimal marker exists.
 // Only the closed payload-free marker is a continuing exception; scrubbed duplicate history still expires.
 env.DB.prepare(`DELETE FROM audit WHERE id IN(SELECT a.id FROM audit a WHERE ${expired('a.ts')}
  AND NOT (${bnetCustodyMarkerSql('a')})
  AND (a.action NOT IN('link.ok','bnet.linked') OR length(a.actor) NOT BETWEEN 17 AND 20 OR a.actor NOT GLOB '[1-9]*' OR a.actor GLOB '*[^0-9]*' OR typeof(a.ts)<>'integer'
    OR EXISTS(SELECT 1 FROM audit m WHERE m.actor=a.actor AND ${bnetCustodyMarkerSql('m')})) ORDER BY a.ts,a.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_provider_messages WHERE operation_id IN(SELECT operation_id FROM privacy_provider_messages WHERE state IN('removed','refused') AND retain_until<=${T} ORDER BY retain_until,operation_id LIMIT 1000)`),
 ];}
/** Complete manual batch remains all27; only the scheduled wrapper alternates its bounded pages. */
export function servingRetentionStatements(env:Env):D1PreparedStatement[]{
 const beta=betaProvenanceRetentionStatements(env),general=generalServingRetentionStatements(env);if(beta.length!==6||general.length!==21)throw Error('privacy_retention_statement_census');return [...beta,...general];
}
export const SERVING_RETENTION_STATEMENTS=27;
export async function sweepServingRetention(env:Env,originalSchedule?:OriginalServingRetentionSchedule):Promise<number>{
 // Shared index supplies its original entry capture. Direct trusted calls capture once before construction.
 const cap=originalSchedule??captureServingRetentionSchedule(),schedule=originalRetentionSchedule(cap);if(schedule.spent)return retentionScheduleHeld();schedule.spent=true;
 // Every15-minute tick still purges short credentials; all general and B1 pages run every30minutes.
 // Source Native predicates consume original row expiry; wall-clock phase supplies no deletion authority.
 let statements:D1PreparedStatement[]=[];
 if(env.PRIVACY_RETENTION_ENABLED==='true'){
  if(schedule.phase==='general'){statements=generalServingRetentionStatements(env);if(statements.length!==21)throw Error('privacy_retention_statement_census');}
  else{const beta=betaProvenanceRetentionStatements(env),credentials=privacyAccessPurgeStatements(env);if(beta.length!==6||credentials.length!==2)throw Error('privacy_retention_statement_census');statements=[...beta,...credentials];}
 }else if(env.PRIVACY_ACCESS_ENABLED==='true'){statements=privacyAccessPurgeStatements(env);if(statements.length!==2)throw Error('privacy_retention_statement_census');}
 // Local source lifecycle is unconditional in the original beta phase. Removal/access/retention
 // switches cannot strand its personal cursor or acknowledged terminal records. No new trigger,
 // second capture, later-clock phase selection, provider call, or admission path is introduced.
 if(schedule.phase==='beta'){const receipts=betaResetReceiptRetentionStatements(env);if(receipts.length!==2)throw Error('privacy_retention_statement_census');statements.push(betaResetCursorRetentionStatement(env),...receipts,rulesetActivationAttributionRetentionStatement(env));}
 // General remains21; beta is at most12 (6 provenance + 2 credentials + 3 reset lifecycle + 1 attribution).
 if(statements.length>21)throw Error('privacy_retention_statement_census');
 schedule.check();if(statements.length===0)return 0;
 const out=await env.DB.batch(statements);schedule.check();
 if(out.length!==statements.length)throw Error('privacy_retention_outcome_unknown');
 return out.reduce((n,r)=>n+(r.meta?.changes??0),0);
}
