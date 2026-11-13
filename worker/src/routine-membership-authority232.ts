/** New .232 routine authority. Retained .230 receipts prove identity lineage only;
 * this issuer never recreates a consumed-whisper capability or a provider ACK.
 * Every new operation needs its own original current Native read and claim. */
import type { Env } from './env';
import { intVar } from './env';
import { linksNotBefore } from './db';
import { privacyProviderCustodyDatabase,privacyGenerationFenceSql } from './privacy-serving-authority';
import { captureLaunchVerification } from './launch-verification227';
import { captureNativeRankConfig232,historicalNativeRankPolicy232,NATIVE_RANK_NAMES232,NATIVE_SCOPE232,NATIVE_GUILD232,SHARED_MEMBER232 } from './native-rank-reconciliation232';
import {captureCanonicalRankConfig233} from './canonical-ranks233';
import {recognizedMembershipAnchor232 as ANCHOR} from './roster-verification275';
import {DIRECTIVE_RANK_NAMES,DIRECTIVE_NATIVE_PROFILE,nativeMembershipSourceMatches,qualifiedNativeSnapshotSource} from './native-rank-schemes';
import {directiveSnapshotSql280} from './directive-native-authority';

declare const routine232Brand:unique symbol;
export type RoutineMembership232=Readonly<{[routine232Brand]:true}>;
export type RoutineMembership232Facts=Readonly<{subject:string;subjectGeneration:string|null;snapshotId:number;snapshotExportedAt:number;
 deadline:number;primary:Readonly<{guid:string;nameKey:string;rank:string;index:number}>|null;policyRaw:string;
 rankQualified:boolean;rankProfile:string|null;
 cause:'eligible'|'departure'|'ban'|'rename_hold'|'blocking_role'}>;
type Scalar=string|number|null;
type Record232={facts:RoutineMembership232Facts;db:D1Database;sourceDB:D1Database;check:()=>void;close:()=>void;effectCheck:(env:Env)=>void;values:readonly Scalar[];effectEnv:Env};
const originals=new WeakMap<RoutineMembership232,Record232>();
const ID=/^[1-9][0-9]{16,19}$/,HEX32=/^[0-9a-f]{32}$/,GUID=/^Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}$/;
const CONFIG=Object.freeze(['CANONICAL_ENTITLEMENTS233','CANONICAL_RANKS233','NATIVE_RANK_SYNC232','GUILD_ID','ROLE_GUILD_MEMBER','VERIFY_MEMBERSHIP_ONLY','VERIFY_NATIVE_SCOPE',
 'LINKS_NOT_BEFORE','LINKS_NOT_BEFORE_CLOCK_GATED','ROSTER_MIN_MEMBERS','ROSTER_MAX_SHRINK_PCT',
 'PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_WRITE_ADMISSION_EPOCH',
 'SHARED_MEMBERSHIP230_MODE','SHARED_MEMBERSHIP230_CLOSURE_JSON','SHARED_MEMBERSHIP230_CLOSURE_SHA256',
 'PRIVACY_ERASURE_ENABLED','PRIVACY_NATIVE_ERASURE_ENABLED','MEMBERSHIP_ROLE_SETTLEMENT_ENABLED',
 'DISCORD_APP_ID','DISCORD_BOT_TOKEN','BLOCKING_ROLE_IDS','ROLE_OFFICER','ROLE_MODERATOR','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER',
 'ROLE_RAID_LEADER','LINK_ROLE_ID','MEMBERSHIP_RETIRED_ROLE_ID','QR_NATIVE_ROLE_MAP','FULL_RELEASE_ROLES','INTROS_ROLES',
 'TREASURY_COSMETIC_ROLES','BETA_RESET_SOURCE_EPOCH','BETA_RESET_DISPATCH_SEAL_MODE','BETA_RESET_REMOVALS_ENABLED','ROLE_CALL_BUDGET']);
const held=():never=>{throw Error('routine_membership232_held');};
function slots(object:object,keys:readonly string[]):()=>void{
 const proto=Object.getPrototypeOf(object),saved=keys.map(k=>Object.getOwnPropertyDescriptor(object,k));
 const check=()=>{if(Object.getPrototypeOf(object)!==proto)return held();for(let i=0;i<keys.length;i++){
  const a=saved[i],b=Object.getOwnPropertyDescriptor(object,keys[i]!);
  if(a===undefined?!!b||keys[i]! in object:!Object.hasOwn(a,'value')||!b||!Object.hasOwn(b,'value')||
   ['value','get','set','writable','enumerable','configurable'].some(k=>!Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor])))return held();
 }};check();return check;
}
/** Original read graph is held across every subsequent await. Accessors are never executed. */
function graph(input:unknown):()=>void{
 const checks:(()=>void)[]=[],seen=new Set<object>();
 const visit=(v:unknown)=>{if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);const keys=Reflect.ownKeys(v);
  if(keys.some(k=>typeof k!=='string'))return held();checks.push(slots(v,keys as string[]));
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k)!;if(!Object.hasOwn(d,'value'))return held();visit(d.value);}
 };visit(input);return()=>{for(const c of checks)c();};
}
/** Recognized source-authored historic receipts, not generic member rows. An
 * observed-present .230 row proves the accepted identity, never role ownership.
 * Descendant own .232 ACKs retain that identity through ordinary pending expiry. */
const ROWS=`COALESCE((SELECT json_group_array(json_array(name_key,guid,rank,rank_index)) FROM
 (SELECT name_key,guid,rank,rank_index FROM roster_members WHERE snapshot_id=s.id ORDER BY name_key)), '[]')`;
const LINKS=`COALESCE((SELECT json_group_array(json_array(name_key,guid,status,bound_at,verified_at,source,anchor_id)) FROM
 (SELECT c.name_key,c.guid,c.status,c.bound_at,c.verified_at,c.source,
 (SELECT a.id FROM role_settlements a WHERE ${ANCHOR('?2','?3','?4')} ORDER BY a.created_at DESC,a.id LIMIT 1) AS anchor_id
 FROM characters c WHERE c.discord_id=?1 AND c.status NOT IN('unbound','denied') ORDER BY c.name_key)), '[]')`;
const STANDING=`json_array(COALESCE((SELECT banned FROM members WHERE discord_id=?1),0),
 COALESCE((SELECT denied FROM site_users WHERE discord_id=?1),0),EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?1 AND state='reapply'))`;
/** The original launch link fence is global, not just one account's alt set.
 * A second active binding must not inherit or share this character's authority. */
const GUID_CONFLICTS=`SELECT own.guid FROM characters own JOIN characters other ON other.guid=own.guid AND other.status IN('member','left_pending')
 WHERE own.discord_id=?1 AND own.status='member' GROUP BY own.guid HAVING COUNT(*)<>1`;
const READ=`SELECT CAST(strftime('%s','now') AS INTEGER) AS at,p.generation,p.state,s.id,s.exported_at,s.source,s.member_count,s.complete,s.trusted,
 COALESCE((SELECT member_count FROM roster_snapshots old WHERE old.id<s.id AND old.complete=1 AND old.trusted=1 AND old.source=s.source ORDER BY old.id DESC LIMIT 1),s.member_count) AS previous_count,
 ${ROWS} AS rows_json,${LINKS} AS links_json,${STANDING} AS standing_json,NOT EXISTS(${GUID_CONFLICTS}) AS guid_unique
 FROM roster_snapshots s LEFT JOIN privacy_subjects p ON p.subject_id=?1 WHERE s.id=(SELECT MAX(id) FROM roster_snapshots)`;
/** Closed canonical-only exclusion, repeated against the original pinned source.
 * No excluded link supplies an anchor, eligible character or departure cause. */
const INERT_LEGACY=(canonical:string,cutoff:string)=>`(((json_extract(${canonical},'$.enabled')=1 AND c.status='member')
 AND (typeof(c.bound_at)='integer' AND c.bound_at>0 AND c.bound_at<${cutoff}))
 AND ((typeof(c.verified_at)='integer' AND c.verified_at>=c.bound_at AND c.verified_at<${cutoff})
 AND (c.source IN('whisper','mail') AND json_extract(j.value,'$[6]') IS NULL AND a.id IS NULL))
 AND NOT EXISTS(SELECT 1 FROM roster_members legacy WHERE legacy.snapshot_id=s.id AND (legacy.name_key=c.name_key OR legacy.guid=c.guid)))`;
type SourceRow={at:number;generation:string|null;state:string|null;id:number;exported_at:number;source:string;member_count:number;complete:number;trusted:number;previous_count:number;rows_json:string;links_json:string;standing_json:string;guid_unique:number};

export async function captureRoutineMembership232(env:Env,subject:string):Promise<RoutineMembership232|null>{
 try{
  if(!ID.test(subject)||/[^0-9]/.test(subject))return null;const originalSelection=captureNativeRankConfig232(env),launch=captureLaunchVerification(env),canonical=captureCanonicalRankConfig233(env);
  if(canonical.present&&(canonical.mode!=='enabled'||!canonical.current()))return null;
  const historical=canonical.mode==='enabled'?historicalNativeRankPolicy232():null,selection=historical?{mode:'enabled' as const,policy:historical,raw:JSON.stringify(historical),current:originalSelection.current}:originalSelection;
  if(selection.mode!=='enabled'||!selection.policy||!selection.raw||!selection.current())return null;
  const scope='addon-native-v1:'+JSON.stringify({version:1,...NATIVE_SCOPE232});
  if(launch.mode!=='members-only'||launch.scope?.provenance!==scope||!launch.current())return null;
  const configCheck=slots(env,[...CONFIG,'DB']),sourceDB=Object.getOwnPropertyDescriptor(env,'DB')?.value;
  if(!sourceDB||env.GUILD_ID!==NATIVE_GUILD232||env.ROLE_GUILD_MEMBER!==SHARED_MEMBER232||env.VERIFY_MEMBERSHIP_ONLY!=='true'||env.SHARED_MEMBERSHIP230_MODE!=='enabled')return null;
  let active=true;
  const db=privacyProviderCustodyDatabase(env),check=()=>{configCheck();if(!active||!selection.current()||!canonical.current()||!launch.current()||Object.getOwnPropertyDescriptor(env,'DB')?.value!==sourceDB)return held();};check();
  const cutoff=linksNotBefore(env);
  const results=await db.batch([db.prepare(READ).bind(subject,selection.raw,canonical.mode==='enabled'?canonical.raw:'null',cutoff)]);const resultCheck=graph(results);check();
  if(results.length!==1||results[0]?.success!==true||results[0].results.length!==1)return null;
  const row=results[0].results[0] as SourceRow;const at=row.at,floor=intVar(env.ROSTER_MIN_MEMBERS,0),shrink=intVar(env.ROSTER_MAX_SHRINK_PCT,10);
  if(!Number.isSafeInteger(at)||at<1||!Number.isSafeInteger(row.id)||row.id<1||!Number.isSafeInteger(row.exported_at)||row.exported_at>at||row.exported_at<=at-600||row.exported_at<cutoff||!nativeMembershipSourceMatches(row.source,NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)||row.complete!==1||row.trusted!==1||row.guid_unique!==1||row.state!==null&&row.state!=='active'||row.generation!==null&&(row.generation.length!==32||!HEX32.test(row.generation)))return null;
  const rows=JSON.parse(row.rows_json) as unknown[][],links=JSON.parse(row.links_json) as unknown[][],standing=JSON.parse(row.standing_json) as number[];
  if(!Array.isArray(rows)||rows.length!==row.member_count||rows.length<floor||rows.length>1000||!Number.isSafeInteger(row.previous_count)||(row.previous_count-rows.length)*100>shrink*row.previous_count||!Array.isArray(links)||!links.length||links.length>100||standing.length!==3||standing.some(v=>v!==0&&v!==1))return null;
  const directiveSource=row.source===qualifiedNativeSnapshotSource(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm),rankNames=directiveSource?DIRECTIVE_RANK_NAMES:NATIVE_RANK_NAMES232;
  const rankQualified=directiveSource&&rows.every(r=>Array.isArray(r)&&r.length===4&&typeof r[3]==='number'&&Number.isInteger(r[3])&&r[3]>=0&&r[3]<10&&r[2]===DIRECTIVE_RANK_NAMES[r[3]]);
  const byGuid=new Map<string,Readonly<{guid:string;nameKey:string;rank:string;index:number}>>(),names=new Set<string>(),unknownGuidKeys=new Set<string>(),seenNativeGuids=new Set<string>(),unknownRankKeys=new Set<string>(),unknownRankGuids=new Set<string>();
  for(const r of rows){if(!Array.isArray(r)||r.length!==4)return null;const [key,guid,rank,index]=r;
   if(typeof key!=='string'||!key||names.has(key))return null;
   names.add(key);
   // .237: unknown ranks prove no rank or departure. Keep every identity in
   // the global fences, while holding only accounts linked to those rows.
   const rankKnown=typeof index==='number'&&Number.isInteger(index)&&index>=0&&index<=9&&rank===rankNames[index];
   if(!rankKnown)unknownRankKeys.add(key);
   // Offline unrelated members can lack a GUID. They prove no identity and do
   // not block a different fully proved character's rank. Target names whose
   // identity is unknown remain held, including an apparent old departure.
   if(guid===null||guid===''){unknownGuidKeys.add(key);continue;}
   if(typeof guid!=='string'||guid!==guid.trim()||!GUID.test(guid)||seenNativeGuids.has(guid))return null;
   seenNativeGuids.add(guid);
   if(!rankKnown){unknownRankGuids.add(guid);continue;}
   byGuid.set(guid,Object.freeze({guid,nameKey:key,rank:rank as string,index}));
  }
  const eligible:Readonly<{guid:string;nameKey:string;rank:string;index:number}>[]=[],seenLinks=new Set<string>();let qualifiedLinks=0;
  for(const l of links){if(!Array.isArray(l)||l.length!==7)return null;const [key,guid,status,bound,verified,source,anchor]=l;
   // An unfinished alt is not a verified native identity. Freeze its state for
   // this operation, but it neither outranks nor blocks an already verified main.
   if(status==='verified'||status==='queued')continue;
   if(typeof key!=='string'||!key||typeof guid!=='string'||guid!==guid.trim()||!GUID.test(guid)||seenLinks.has(guid)||typeof bound!=='number'||!Number.isSafeInteger(bound)||bound<1||bound>at||typeof verified!=='number'||!Number.isSafeInteger(verified)||verified<bound||verified>at||!['whisper','mail'].includes(String(source))||!['member','left_pending','left'].includes(String(status)))return null;
   seenLinks.add(guid);
   // Match either identity direction before legacy exclusion or left handling;
   // an uncertain higher alt must not disappear and lower another alt's rank.
   if(unknownRankKeys.has(key)||unknownRankGuids.has(guid))return null;
   const native=byGuid.get(guid);
   // .234: an absent prelaunch link is inert, not departure/identity/ownership.
   // Keep its exact row in the captured graph; it may not jam an independently
   // proved current character. A matching/unknown native name or GUID still holds.
   if(canonical.mode==='enabled'&&status==='member'&&bound<cutoff&&verified<cutoff&&anchor===null&&!native&&!names.has(key))continue;
   // Reverification deliberately preserves a character's original link clocks.
   // Admission is established by the source-owned anchor's post-cutoff birth,
   // required in READ and at every later admission, not by rewriting those clocks.
   if(verified<Math.max(1,canonical.mode==='enabled'?bound:cutoff,bound)||typeof anchor!=='string'||anchor.length!==32||!HEX32.test(anchor))return null;
   qualifiedLinks++;if(native){if(native.nameKey!==key||status!=='member')return null;eligible.push(native);}
   // left_pending is the first missing export, not the existing lifecycle's
   // confirmed departure. It cannot strip access or lower another alt's rank.
   else if(status!=='left'||unknownGuidKeys.has(key))return null;
  }
  if(!qualifiedLinks)return null; // Unfinished/inert legacy links prove neither identity nor departure.
  eligible.sort((a,b)=>a.index-b.index||(a.guid<b.guid?-1:a.guid>b.guid?1:0));
  const cause:RoutineMembership232Facts['cause']=standing[0]===1||standing[1]===1?'ban':standing[2]===1?'rename_hold':eligible.length?'eligible':'departure';
  const primary=cause==='eligible'?eligible[0]!:null,deadline=Math.min(at+300,row.exported_at+600);
  const facts=Object.freeze({subject,subjectGeneration:row.generation,snapshotId:row.id,snapshotExportedAt:row.exported_at,deadline,primary,policyRaw:selection.raw,cause,rankQualified,rankProfile:rankQualified?DIRECTIVE_NATIVE_PROFILE:null});
  const values=Object.freeze([subject,row.generation,row.id,row.exported_at,row.source,row.member_count,row.rows_json,row.links_json,row.standing_json,deadline,cutoff,row.previous_count,selection.raw,canonical.mode==='enabled'?canonical.raw:'null']);
  const effectCheck=(effect:Env)=>{check();const d=Object.getOwnPropertyDescriptor(effect,'DB');if(!d||!Object.hasOwn(d,'value')||d.value!==sourceDB&&d.value!==db)return held();
   for(const key of CONFIG){const a=Object.getOwnPropertyDescriptor(env,key),b=Object.getOwnPropertyDescriptor(effect,key);if(a===undefined?!!b||key in effect:!b||!Object.hasOwn(b,'value')||!Object.is(a.value,b.value))return held();}};
  const cap=Object.freeze({}) as RoutineMembership232,effectEnv={...env,DB:db};check();resultCheck();effectCheck(effectEnv);
  originals.set(cap,{facts,db,sourceDB,check:()=>{check();resultCheck();},close:()=>{active=false;},effectCheck,values,effectEnv});return cap;
 }catch{return null;}
}
export function assertRoutineMembership232(env:Env,cap:RoutineMembership232):void{const r=originals.get(cap);if(!r)return held();r.check();r.effectCheck(env);if(Math.floor(Date.now()/1000)>=r.facts.deadline)return held();}
export function routineMembership232Facts(cap:RoutineMembership232):RoutineMembership232Facts{const r=originals.get(cap);if(!r)return held();r.check();return r.facts;}
export function routineMembership232Environment(env:Env,cap:RoutineMembership232):Env{assertRoutineMembership232(env,cap);return originals.get(cap)!.effectEnv;}
export function closeRoutineMembership232(cap:RoutineMembership232):void{originals.get(cap)?.close();}
/** Fixed authored JSON comparisons freeze every linked alt and the exact original
 * current Native profile. Deadline, standing and generation are checked in SQL
 * at every queue/claim/final admission, including across provider awaits. */
export function routineMembership232Predicate(env:Env,cap:RoutineMembership232,start=1,rankConversion=false):Readonly<{sql:string;values:readonly Scalar[];next:number}>{
 assertRoutineMembership232(env,cap);if(!Number.isSafeInteger(start)||start<1||start>75)return held();const r=originals.get(cap)!;
 if(rankConversion&&!r.facts.rankQualified)return held();
 const q=(n:number)=>'?'+(start+n),replace=(sql:string)=>sql.replace(/\?1\b/g,q(0));
 return Object.freeze({sql:`${privacyGenerationFenceSql(start,start+1)} AND ${q(9)}>CAST(strftime('%s','now') AS INTEGER) ${rankConversion?`AND (${directiveSnapshotSql280(q(2),NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)})`:''}
  AND EXISTS(SELECT 1 FROM roster_snapshots s LEFT JOIN privacy_subjects p ON p.subject_id=${q(0)} WHERE
  (s.id=${q(2)} AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.exported_at=${q(3)} AND s.source=${q(4)})
  AND (s.member_count=${q(5)} AND s.complete=1 AND s.trusted=1 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id))
  AND (s.exported_at>=${q(10)} AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER))
  AND ((${ROWS})=${q(6)} AND (${replace(STANDING)})=${q(8)} AND NOT EXISTS(${replace(GUID_CONFLICTS)})
  AND (SELECT COUNT(*) FROM characters WHERE discord_id=${q(0)} AND status NOT IN('unbound','denied'))=json_array_length(${q(7)}))
  AND NOT EXISTS(SELECT 1 FROM json_each(${q(7)}) j
   LEFT JOIN characters c ON c.discord_id=${q(0)} AND c.name_key=json_extract(j.value,'$[0]') AND c.guid IS json_extract(j.value,'$[1]')
   LEFT JOIN role_settlements a ON a.id=json_extract(j.value,'$[6]')
   WHERE CASE WHEN (c.name_key IS NOT NULL AND c.status=json_extract(j.value,'$[2]') AND c.bound_at=json_extract(j.value,'$[3]'))
   AND (c.verified_at IS json_extract(j.value,'$[4]') AND c.source IS json_extract(j.value,'$[5]'))
   AND (c.status IN('verified','queued') OR (${ANCHOR(q(12),q(13),q(10))}) OR (${INERT_LEGACY(q(13),q(10))})) THEN 0 ELSE 1 END=1)
  AND COALESCE((SELECT member_count FROM roster_snapshots old WHERE old.id<s.id AND old.complete=1 AND old.trusted=1 AND old.source=s.source ORDER BY old.id DESC LIMIT 1),s.member_count)=${q(11)})`,
 values:r.values,next:start+r.values.length});
}
