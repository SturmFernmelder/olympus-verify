/** Exact pre-seal/current-profile cutover for Build230. Dormant: no mounted route.
 * Original ACK capabilities stay in one owner process. Source-owned plans alone grant no
 * provider custody; the qualified operator must bracket UUID A/B and preserve unknowns. */
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_COOKIE_MIGRATION_SOURCES_JSON} from './privacy-write-admission-catalogue';
import {PROVIDER_METADATA_CURRENT_SQL,PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} from './privacy-provider-metadata';
import {SUCCESSOR_NATIVE_SEAMS as N} from './privacy-cookie-profile-migration';
import {parseSharedMemberClosure230,sharedMember230SHA256,SHARED_MEMBER230_SEAL_PREFIX,SHARED_MEMBER230_GUILD,SHARED_MEMBER230_ROLE,type SharedMemberClosure230} from './shared-membership-cutover230';

type Step230=Readonly<{sql:string;values:readonly (string|number)[]}>;
export type SharedMember230PlanId='precheck'|'fence-and-seal'|'closed-read'|'open-enabled'|'open-off-abort';
export const SHARED_MEMBER230_LAYOUT='recorded-live-pre-seal-20261017';
const PROFILE=JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive as {objects:(string|null)[][]};
import {raidPhysicalObjects316} from './raid-schema316';
const APP_OBJECTS=JSON.stringify(raidPhysicalObjects316(PROFILE.objects));
/** Exact historical provider companion only; its values are never read or mutated. */
export const SHARED_MEMBER230_OPTIONAL_CF_KV_JSON=JSON.stringify((JSON.parse(ADMISSION_COOKIE_MIGRATION_SOURCES_JSON)['public-predecessor'].recordedLive.objects as (string|null)[][]).filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'));
const NOW="CAST(strftime('%s','now') AS INTEGER)",TUPLE='json_array(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)';
function held(s:string):never{throw Error(s);}
// FIRST cutover accepts only source-original legacy successful PUT receipts. The
// original beginBetaLegacyGrant/dispatchBetaLegacyGrant pair writes exactly this
// tuple, only after its own returned PUT. No later GET can create this reason.
// Every other row, including malformed/unattempted/held/past-absence/unknown,
// holds. No privacy-generation filter hides older custody. No row is deleted.
const hex32Sql=(v:string)=>`(typeof(${v})='text' AND length(${v})=32 AND length(CAST(${v} AS BLOB))=32 AND instr(${v},char(0))=0 AND ${v} NOT GLOB '*[^0-9a-f]*')`;
const ORIGINAL_LEGACY_ACK=`r.purpose='beta_guard_grant' AND r.desired=1 AND r.attempts=1 AND r.state='settled' AND r.reason='legacy_put_acknowledged'
 AND ${hex32Sql('r.id')} AND ${hex32Sql('r.claim_nonce')} AND typeof(r.subject)='text' AND length(r.subject) BETWEEN 17 AND 20 AND length(CAST(r.subject AS BLOB))=length(r.subject) AND instr(r.subject,char(0))=0 AND r.subject GLOB '[1-9]*' AND r.subject NOT GLOB '*[^0-9]*'
 AND typeof(r.created_at)='integer' AND r.created_at>0 AND r.created_at<1792688400 AND typeof(r.expires_at)='integer' AND r.expires_at=r.created_at+300
 AND typeof(r.checked_at)='integer' AND r.checked_at>=r.created_at AND r.checked_at<1792688400 AND r.checked_at<=${NOW}
 AND r.subject_generation IS NULL AND r.proof_id IS NULL AND r.request_digest IS NULL AND r.roster_id IS NULL AND r.native_guid IS NULL AND r.native_profile IS NULL AND r.native_rank IS NULL AND r.native_rank_name IS NULL
 AND NOT EXISTS(SELECT 1 FROM role_settlements child WHERE child.request_digest=r.id)`;
/** Source-only alias choice; no request-provided identifiers or SQL fragments. */
export function sharedMember230LegacyAckSql(alias:'r'|'old'):string{if(alias!=='r'&&alias!=='old')return held('member230_legacy_ack_alias');return alias==='r'?ORIGINAL_LEGACY_ACK:ORIGINAL_LEGACY_ACK.replaceAll('r.','old.');}
export const SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL=`NOT EXISTS(SELECT 1 FROM role_settlements r WHERE r.guild_id='${SHARED_MEMBER230_GUILD}' AND r.role_id='${SHARED_MEMBER230_ROLE}' AND NOT(CASE WHEN ${ORIGINAL_LEGACY_ACK} THEN 1 ELSE 0 END))`;
export const SHARED_MEMBER230_DEBT_PREDICATE_DESCRIPTION='first-cutover-all-physical-target-custody-except-source-original-precutoff-legacy-put-ack-with-no-child-v1';
type Witness={assert:()=>void};
const own=N.own;
function tuple(raw:unknown,epoch:string,mode:'serving'|'closed'):unknown[]{
 if(typeof raw!=='string'||raw.length>1024)return held('member230_tuple');let a:unknown;try{a=JSON.parse(raw);}catch{return held('member230_tuple');}
 if(!Array.isArray(a)||a.length!==9||JSON.stringify(a)!==raw||a[0]!==1||a[1]!==N.VERSION||a[2]!==epoch||a[3]!==mode||a[4]!==0||a[5]!==''||a[6]!==''
  ||![a[7],a[8]].every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0))return held('member230_tuple');return a;
}
/** The complete serving application profile, plus only the source-owned optional _cf_KV.
 * The independent exact _cf_METADATA companion remains outside that catalogue.
 * No later-layout alias, DDL fallback, schema learning or provider-value read. */
export function sharedMember230CurrentProfileProof(mode:'serving'|'closed',bound:boolean):string{
 if(mode!=='serving'&&mode!=='closed'||typeof bound!=='boolean')return held('member230_profile_input');
 return `WITH actual AS MATERIALIZED(SELECT type,name,tbl_name,sql FROM main.sqlite_master WHERE ${PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL}),
 expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1)
 UNION ALL SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?6) WHERE EXISTS(SELECT 1 FROM actual WHERE name='_cf_KV'))
 SELECT CASE WHEN ${PROVIDER_METADATA_CURRENT_SQL} AND (SELECT COUNT(*) FROM actual)=(SELECT COUNT(*) FROM expected)
 AND NOT EXISTS(SELECT type,name,tbl_name,sql FROM actual EXCEPT SELECT type,name,tbl_name,sql FROM expected)
 AND NOT EXISTS(SELECT type,name,tbl_name,sql FROM expected EXCEPT SELECT type,name,tbl_name,sql FROM actual)
 AND (SELECT foreign_keys FROM pragma_foreign_keys)=1 AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) AND NOT EXISTS(SELECT 1 FROM temp.sqlite_master)
 AND (SELECT COUNT(*) FROM privacy_write_admission)=1 AND EXISTS(SELECT 1 FROM privacy_write_admission WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?3 AND mode='${mode}'
 AND active=0 AND nonce='' AND purpose='' AND typeof(entry_changes)='integer' AND entry_changes>=0 AND typeof(logical_changes)='integer' AND logical_changes>=0${bound?` AND ${TUPLE}=?2`:''})
 AND ?5<=${NOW} AND ?4>${NOW} THEN 1 ELSE json_extract('member230_current_profile_held','$') END AS admitted,
 (SELECT ${TUPLE} FROM privacy_write_admission WHERE singleton=1) AS original_tuple,${NOW} AS observed_at`;
}
function step(sql:string,values:readonly (string|number)[]):Step230{N.bounded(sql,values);return Object.freeze({sql,values:Object.freeze([...values])});}
function profile(c:SharedMemberClosure230,mode:'serving'|'closed',bound:string|null,old=false):Step230{return step(sharedMember230CurrentProfileProof(mode,bound!==null),[APP_OBJECTS,bound??'',old?c.priorEpoch:c.writeEpoch,String(c.expiresAt),String(c.createdAt),SHARED_MEMBER230_OPTIONAL_CF_KV_JSON]);}
const key=(c:SharedMemberClosure230)=>SHARED_MEMBER230_SEAL_PREFIX+c.operationId;
function clear(c:SharedMemberClosure230,json:string,sealed:boolean):Step230{return step(`SELECT CASE WHEN ${SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL} AND ${sealed?'EXISTS':'NOT EXISTS'}(SELECT 1 FROM site_settings WHERE key=?1${sealed?' AND value=?2':''}) THEN 1 ELSE json_extract('member230_old_custody_or_seal_held','$') END AS cleared`,sealed?[key(c),json]:[key(c)]);}
/** Immutable plan indexes for the qualified preview RPC. No SQL is accepted on the wire.
 * Opening is source-private to the operator holding the actual original FenceAck below. */
export function sharedMember230NativePlan(id:SharedMember230PlanId,json:string,closedTuple?:string):readonly Step230[]{
 const c=parseSharedMemberClosure230(json);
 if(id==='precheck')return Object.freeze([profile(c,'serving',null,true),clear(c,json,false)]);
 if(id==='fence-and-seal')return Object.freeze([profile(c,'serving',null,true),clear(c,json,false),
  step(`UPDATE privacy_write_admission SET active=1,nonce=?1,purpose='writer' WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?2 AND mode='serving' AND active=0 AND nonce='' AND purpose='' RETURNING active,nonce,purpose`,[c.operationId,c.priorEpoch]),
  step('INSERT INTO site_settings(key,value,updated_at) VALUES(?1,?2,'+NOW+')',[key(c),json]),
  step(`UPDATE privacy_write_admission SET active=0,nonce='',purpose='' WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?1 AND mode='serving' AND active=1 AND nonce=?2 AND purpose='writer' RETURNING active,nonce,purpose`,[c.priorEpoch,c.operationId]),
  step(`UPDATE privacy_write_admission SET epoch=?1,mode='closed' WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?2 AND mode='serving' AND active=0 AND nonce='' AND purpose='' AND ?3<=${NOW} AND ?4>${NOW} RETURNING ${TUPLE} AS original_tuple`,[c.writeEpoch,c.priorEpoch,c.createdAt,c.expiresAt]),
  profile(c,'closed',null),clear(c,json,true)]);
 if(id!=='closed-read'&&id!=='open-enabled'&&id!=='open-off-abort')return held('member230_plan');
 if(closedTuple===undefined)return held('member230_original_tuple_required');const a=tuple(closedTuple,c.writeEpoch,'closed');
 if(id==='closed-read')return Object.freeze([profile(c,'closed',closedTuple),clear(c,json,true)]);
 const serving=JSON.stringify([...a.slice(0,3),'serving',...a.slice(4)]);
 return Object.freeze([profile(c,'closed',closedTuple),clear(c,json,true),
  step(`UPDATE privacy_write_admission SET mode='serving' WHERE singleton=1 AND protocol='${N.VERSION}' AND epoch=?1 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?2 AND ?3<=${NOW} AND ?4>${NOW} RETURNING ${TUPLE} AS original_tuple`,[c.writeEpoch,closedTuple,c.createdAt,c.expiresAt]),
  profile(c,'serving',serving),clear(c,json,true)]);
}
declare const fenceBrand:unique symbol,ackBrand:unique symbol,openBrand:unique symbol,openAckBrand:unique symbol;
export type SharedMember230Fence=Readonly<{[fenceBrand]:true}>;
export type SharedMember230FenceAck=Readonly<{[ackBrand]:true}>;
export type SharedMember230Open=Readonly<{[openBrand]:true}>;
export type SharedMember230OpenAck=Readonly<{[openAckBrand]:true}>;
type Fence={native:D1Database;witness:Witness;json:string;digest:string;c:SharedMemberClosure230;check:()=>void;phase:'prepared'|'dispatched'|'complete'|'unknown';facts:Readonly<{preTuple:string;closedTuple:string;fencedAt:number;nativeDigest:string}>|null;openSpent:boolean};
type Open={f:Fence;id:'open-enabled'|'open-off-abort';phase:'prepared'|'dispatched'|'complete'|'unknown';facts:Readonly<{servingTuple:string;openedAt:number;nativeDigest:string;mode:'enabled'|'off'}>|null};
const fences=new WeakMap<SharedMember230Fence,Fence>(),acks=new WeakMap<SharedMember230FenceAck,Fence>(),opens=new WeakMap<SharedMember230Open,Open>(),openAcks=new WeakMap<SharedMember230OpenAck,Open>();
async function execute(native:D1Database,witness:Witness,plan:readonly Step230[]):Promise<{out:D1Result[];check:()=>void;digest:()=>Promise<string>}>{
 const p=plan.map(s=>N.prepared(native,witness,s.sql,s.values));for(const x of p)x.witness.assert();witness.assert();
 const out=await native.batch(p.map(x=>x.statement)),graph=N.graph(out);for(const x of p)x.witness.assert();witness.assert();graph.witness.assert();
 if(!Array.isArray(out)||own(out,'length')!==plan.length)return held('member230_batch_shape');
 for(let i=0;i<out.length;i++){const r=own(out,String(i)),e=r&&typeof r==='object'?Object.getOwnPropertyDescriptor(r,'error'):undefined;if(own(r,'success')!==true||e&&(!Object.hasOwn(e,'value')||e.value!==undefined))return held('member230_batch_unknown');}
 const check=()=>{for(const x of p)x.witness.assert();witness.assert();graph.witness.assert();};check();return {out,check,digest:()=>N.digest(graph.copy,{assert:check})};
}
const row=(r:D1Result,keys:readonly string[])=>N.rowSnapshot(N.resultRow(r),keys);
function proofRow(r:D1Result,c:SharedMemberClosure230,epoch:string,mode:'serving'|'closed'):{raw:string;at:number;check:()=>void}{const p=row(r,['admitted','original_tuple','observed_at']);
 if(p.values[0]!==1||typeof p.values[2]!=='number'||!Number.isSafeInteger(p.values[2])||p.values[2]<c.createdAt||p.values[2]>=c.expiresAt)return held('member230_profile_ack');tuple(p.values[1],epoch,mode);return {raw:p.values[1] as string,at:p.values[2],check:p.witness.assert};}
function cleared(r:D1Result):()=>void{const p=row(r,['cleared']);if(p.values[0]!==1)return held('member230_debt_ack');return p.witness.assert;}
/** S0 is read-only. Its cap comes only from the actual exact-profile native result. */
export async function captureSharedMember230Fence(native:D1Database,json:string,digest:string):Promise<SharedMember230Fence>{
 const c=parseSharedMemberClosure230(json);if(!/^[0-9a-f]{64}$/.test(digest)||await sharedMember230SHA256(json)!==digest||await sharedMember230SHA256(SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL)!==c.debtPredicateSHA256)return held('member230_context_digest');
 const witness=N.methods(native),r=await execute(native,witness,sharedMember230NativePlan('precheck',json)),p=proofRow(r.out[0]!,c,c.priorEpoch,'serving'),d=cleared(r.out[1]!);
 const check=()=>{r.check();p.check();d();};check();const cap=Object.freeze({}) as SharedMember230Fence;fences.set(cap,{native,witness,json,digest,c,check,phase:'prepared',facts:null,openSpent:false});return cap;
}
/** S2 includes the FINAL debt predicate and fence in ONE native atomic batch. A late claim rolls all back. */
export async function executeSharedMember230Fence(cap:SharedMember230Fence):Promise<SharedMember230FenceAck>{
 const f=fences.get(cap);if(!f||f.phase!=='prepared')return held('member230_fence_foreign_or_spent');f.check();f.phase='dispatched';
 try{const r=await execute(f.native,f.witness,sharedMember230NativePlan('fence-and-seal',f.json)),pre=proofRow(r.out[0]!,f.c,f.c.priorEpoch,'serving'),post=proofRow(r.out[6]!,f.c,f.c.writeEpoch,'closed'),d1=cleared(r.out[1]!),d2=cleared(r.out[7]!),changed=row(r.out[5]!,['original_tuple']),entered=row(r.out[2]!,['active','nonce','purpose']),released=row(r.out[4]!,['active','nonce','purpose']);
  const a=tuple(pre.raw,f.c.priorEpoch,'serving'),b=tuple(post.raw,f.c.writeEpoch,'closed');
  if(changed.values[0]!==post.raw||[2,3,4,5].some(i=>r.out[i]?.meta.changes!==1)||JSON.stringify(entered.values)!==JSON.stringify([1,f.c.operationId,'writer'])||JSON.stringify(released.values)!==JSON.stringify([0,'',''])||a[7]!==b[7]||a[8]!==b[8]||post.at<pre.at)return held('member230_fence_ack');
  const previous=f.check,check=()=>{previous();r.check();pre.check();post.check();d1();d2();changed.witness.assert();entered.witness.assert();released.witness.assert();};check();const nativeDigest=await r.digest();check();f.check=check;f.facts=Object.freeze({preTuple:pre.raw,closedTuple:post.raw,fencedAt:post.at,nativeDigest});f.phase='complete';const ack=Object.freeze({}) as SharedMember230FenceAck;acks.set(ack,f);return ack;
 }catch(e){f.phase='unknown';throw e;}
}
export function sharedMember230FenceFacts(ack:SharedMember230FenceAck):Readonly<{preTuple:string;closedTuple:string;fencedAt:number;nativeDigest:string}>{const f=acks.get(ack);if(!f||f.phase!=='complete'||!f.facts)return held('member230_fence_ack_foreign');f.check();return f.facts;}
/** Caller is the same qualified operator after its actual B/abort provider/config bracket.
 * No serialized facts/SELECT can recreate the original ACK. Enabled and OFF abort share one spend. */
export async function captureSharedMember230Open(ack:SharedMember230FenceAck,mode:'enabled'|'off'):Promise<SharedMember230Open>{
 const f=acks.get(ack);if(!f||f.phase!=='complete'||!f.facts||f.openSpent||mode!=='enabled'&&mode!=='off')return held('member230_open_foreign_or_spent');f.check();f.openSpent=true;
 const r=await execute(f.native,f.witness,sharedMember230NativePlan('closed-read',f.json,f.facts.closedTuple)),p=proofRow(r.out[0]!,f.c,f.c.writeEpoch,'closed'),d=cleared(r.out[1]!);if(p.raw!==f.facts.closedTuple)return held('member230_closed_tuple_changed');
 const previous=f.check,check=()=>{previous();r.check();p.check();d();};check();f.check=check;const cap=Object.freeze({}) as SharedMember230Open;opens.set(cap,{f,id:mode==='enabled'?'open-enabled':'open-off-abort',phase:'prepared',facts:null});return cap;
}
export async function executeSharedMember230Open(cap:SharedMember230Open):Promise<SharedMember230OpenAck>{
 const o=opens.get(cap);if(!o||o.phase!=='prepared'||!o.f.facts)return held('member230_open_foreign_or_spent');const f=o.f;f.check();o.phase='dispatched';
 try{const r=await execute(f.native,f.witness,sharedMember230NativePlan(o.id,f.json,f.facts!.closedTuple)),pre=proofRow(r.out[0]!,f.c,f.c.writeEpoch,'closed'),post=proofRow(r.out[3]!,f.c,f.c.writeEpoch,'serving'),d1=cleared(r.out[1]!),d2=cleared(r.out[4]!),changed=row(r.out[2]!,['original_tuple']);
  const a=tuple(pre.raw,f.c.writeEpoch,'closed'),b=tuple(post.raw,f.c.writeEpoch,'serving');if(pre.raw!==f.facts!.closedTuple||changed.values[0]!==post.raw||r.out[2]?.meta.changes!==1||a[7]!==b[7]||a[8]!==b[8]||post.at<pre.at)return held('member230_open_ack');
  const previous=f.check,check=()=>{previous();r.check();pre.check();post.check();d1();d2();changed.witness.assert();};check();const nativeDigest=await r.digest();check();f.check=check;o.facts=Object.freeze({servingTuple:post.raw,openedAt:post.at,nativeDigest,mode:o.id==='open-enabled'?'enabled':'off'});o.phase='complete';const ack=Object.freeze({}) as SharedMember230OpenAck;openAcks.set(ack,o);return ack;
 }catch(e){o.phase='unknown';throw e;}
}
export function sharedMember230OpenFacts(ack:SharedMember230OpenAck):Readonly<{servingTuple:string;openedAt:number;nativeDigest:string;mode:'enabled'|'off'}>{const o=openAcks.get(ack);if(!o||o.phase!=='complete'||!o.facts)return held('member230_open_ack_foreign');o.f.check();return o.facts;}
