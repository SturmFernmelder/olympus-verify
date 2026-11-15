/** Private attended role comparison. A traversal is not an atomic snapshot and
 * this reader never supplies effect/ownership authority. Repairs re-enter the
 * existing Native writer; old requests, manual roles and appointments are kept. */
import type {Env} from './env';
import {now,audit} from './db';
import {rest,DiscordError} from './discord';
import {apiJson,b64u,isSiteAdmin,originalUserSession,PAGE_VERSION,sameOrigin,type SiteUser} from './site-core';
import {admittedReadAs,FENCE_REFUSED,type CommunitySubject} from './community-context';
import {consumeRateLimit280,rateLimitHeaders280} from './soft-rate-limit280';
import {captureCanonicalRankConfig233,captureCanonicalEntitlements233,CANONICAL_MANAGED_ROLE_IDS233,CANONICAL_RANKS233,parseCanonicalRankPolicy233,highestCanonicalRank233} from './canonical-ranks233';
import {STEWARD_CANONICAL_PROFILE,STEWARD_NATIVE_PROFILE} from './native-rank-constants';
import {canonicalRankWitnessMatches280} from './canonical-native-authority280';
import {captureRoutineMembership232,closeRoutineMembership232,routineMembership232Facts} from './routine-membership-authority232';
import {reconcileRoleBatch242} from './role-reconcile242';
import {privacyBoundSiteRoleActionEnv,privacyCaptureFromColumns} from './privacy-serving-authority';

export const ROLE_AUDIT_PAGE283=20;
const PROVIDER_PAGE=1000,CURSOR_SECONDS=900,PREVIEW_SECONDS=300,PURPOSE='private-role-audit283-v1';
const HISTORY_LIMIT=100,CHARACTER_LIMIT=50;
const ID=/^[1-9][0-9]{16,19}$/,encoder=new TextEncoder();
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v)&&BigInt(v)<=18446744073709551615n;
class Held extends Error{constructor(readonly code:string,readonly status=409){super(code);}}
type ProviderMember={id:string;username:string;displayName:string;roles:string[];bot:boolean;pending:boolean;joinedAt:string|null};
type Snapshot={id:number;exported_at:number;received_at:number;member_count:number;complete:number;trusted:number};
type Facts={id:string;generation:string|null;revision:number|null;privacyState:string|null;privacyHeld:number;characters:string;receipts:string;characterCount:number;receiptCount:number;unknownAttempts:number;expiredUnattempted:number};
type Receipt={id:string;role:string;desired:number;state:string;attempts:number;reason:string;created:number;expiry:number;checked:number|null;generation:string|null;parent:string|null};
type Projection={expected:string|null;cause:string;nativeRank:string|null;nativeCharacter:string|null;snapshotId:number|null;deadline:number|null;activeExpected?:string|null;activeCause?:string};
type Cursor={after:string;issuedAt:number;expiresAt:number;page:number};
type Preview={subject:string;issuedAt:number;expiresAt:number;snapshot:number;snapshotAt:number;expected:string;factsDigest:string;observedRoles:string[]};
const MANAGED=new Set(CANONICAL_MANAGED_ROLE_IDS233);
const ownAck=(r:Receipt)=>r.state==='settled'&&r.attempts===1&&r.desired===1&&
 ['canonical233_put_acknowledged_and_confirmed','canonical233_migration_put_acknowledged_and_confirmed'].includes(r.reason)&&
 Number.isSafeInteger(r.checked)&&r.checked!>=r.created&&r.checked!<r.expiry;

/** Informational receipt custody only, deliberately conservative. The writer
 * repeats the full original receipt graph before any removal. */
export function classifyRoleAudit283(roles:readonly string[],expected:string|null,receipts:readonly Receipt[],generation:string|null,sourceHeld:boolean){
 const actual=roles.filter(r=>MANAGED.has(r)),unknown=receipts.filter(r=>r.attempts===1&&['dispatching','unknown'].includes(r.state));
 const expiredUnattempted=receipts.filter(r=>r.attempts===0&&r.expiry<=now()&&['pending','held'].includes(r.state)).length;
 const extra=expected?actual.filter(r=>r!==expected):[];
 const extraOwned=extra.filter(role=>receipts.some(r=>r.role===role&&r.generation===generation&&ownAck(r)&&
   !receipts.some(child=>child.parent===r.id&&child.desired===0&&(child.attempts!==0||child.state==='settled'))));
 const extraUnowned=extra.filter(r=>!extraOwned.includes(r)),missing=expected&&!actual.includes(expected)?[expected]:[];
 return {actual,missing,extraOwned,extraUnowned,unknown:unknown.length,expiredUnattempted,
   sourceHeld,review:sourceHeld||unknown.length>0||extraUnowned.length>0,
   repairable:!sourceHeld&&unknown.length===0&&extraUnowned.length===0&&!!expected&&(missing.length>0||extraOwned.length>0)};
}
function providerPage(raw:unknown,after:string){
 if(!Array.isArray(raw)||raw.length>PROVIDER_PAGE)throw new Held('discord_reply_unconfirmed',503);
 let previous=BigInt(after);const members:ProviderMember[]=[];
 for(const row of raw){
  if(!row||typeof row!=='object'||!row.user||!validId(row.user.id)||BigInt(row.user.id)<=previous||
   !Array.isArray(row.roles)||row.roles.length>250||row.roles.some((r:unknown)=>!validId(r))||new Set(row.roles).size!==row.roles.length||
   typeof row.user.username!=='string'||!row.user.username||row.user.username.length>100||
   row.nick!==undefined&&row.nick!==null&&(typeof row.nick!=='string'||row.nick.length>100)||
   row.user.global_name!==undefined&&row.user.global_name!==null&&(typeof row.user.global_name!=='string'||row.user.global_name.length>100)||
   row.user.bot!==undefined&&typeof row.user.bot!=='boolean'||row.pending!==undefined&&typeof row.pending!=='boolean')throw new Held('discord_reply_unconfirmed',503);
  previous=BigInt(row.user.id);
  const joined=typeof row.joined_at==='string'&&Number.isFinite(Date.parse(row.joined_at))?new Date(row.joined_at).toISOString():null;
  members.push({id:row.user.id,username:row.user.username,displayName:row.nick||row.user.global_name||row.user.username,
   roles:[...row.roles],bot:row.user.bot===true,pending:row.pending===true,joinedAt:joined});
 }
 return {members,scanned:raw.length,complete:raw.length<PROVIDER_PAGE};
}
function decode(raw:string):Uint8Array{
 if(!/^[A-Za-z0-9_-]+$/.test(raw))throw new Held('invalid_token',400);
 const value=Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));
 if(b64u(value)!==raw)throw new Held('invalid_token',400);return value;
}
async function key(secret:string){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(PURPOSE+'\0'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(secret:string,binding:string,value:unknown){const iv=crypto.getRandomValues(new Uint8Array(12));return '1.'+b64u(iv)+'.'+b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(binding)},await key(secret),encoder.encode(JSON.stringify(value)))));}
async function open(secret:string,binding:string,raw:unknown):Promise<Record<string,unknown>>{
 if(typeof raw!=='string'||raw.length>4096)throw new Held('invalid_token',400);const parts=/^1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(raw);
 if(!parts)throw new Held('invalid_token',400);
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(parts[1]!),additionalData:encoder.encode(binding)},await key(secret),decode(parts[2]!))));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
 catch{throw new Held('invalid_token',400);}
}
const digest=async(value:unknown)=>b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)))));
function clock(value:Record<string,unknown>,seconds:number){if(!Number.isSafeInteger(value.issuedAt)||!Number.isSafeInteger(value.expiresAt)||
 (value.issuedAt as number)>now()||(value.expiresAt as number)>(value.issuedAt as number)+seconds||(value.expiresAt as number)<=(value.issuedAt as number)||(value.expiresAt as number)<=now())throw new Held('preview_expired');}
const TARGETS=`SELECT wanted.value AS id,p.generation,p.revision,p.state AS privacyState,
 EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=wanted.value AND j.state IN('waiting_role','held','erasing')) AS privacyHeld,
 (SELECT COUNT(*) FROM characters c WHERE c.discord_id=wanted.value AND c.status NOT IN('unbound','denied')) AS characterCount,
 COALESCE((SELECT json_group_array(json_object('name',c.name,'status',c.status,'legacyNameFirstObservedAt',f.first_seen,'actualJoinedAt',NULL,'currentEpisodeFirstObservedAt',NULL)) FROM (SELECT name_key,name,status FROM characters WHERE discord_id=wanted.value AND status NOT IN('unbound','denied') ORDER BY name_key LIMIT ${CHARACTER_LIMIT}) c LEFT JOIN roster_first_seen f ON f.name_key=c.name_key), '[]') AS characters,
 (SELECT COUNT(*) FROM role_settlements r WHERE r.subject=wanted.value AND r.guild_id=?2 AND r.role_id IN(SELECT value FROM json_each(?3))) AS receiptCount,
 (SELECT COUNT(*) FROM role_settlements r WHERE r.subject=wanted.value AND r.guild_id=?2 AND r.role_id IN(SELECT value FROM json_each(?3)) AND r.attempts=1 AND r.state IN('dispatching','unknown')) AS unknownAttempts,
 (SELECT COUNT(*) FROM role_settlements r WHERE r.subject=wanted.value AND r.guild_id=?2 AND r.role_id IN(SELECT value FROM json_each(?3)) AND r.attempts=0 AND r.expires_at<=CAST(strftime('%s','now')AS INTEGER) AND r.state IN('pending','held')) AS expiredUnattempted,
 COALESCE((SELECT json_group_array(json_object('id',r.id,'role',r.role_id,'desired',r.desired,'state',r.state,'attempts',r.attempts,'reason',r.reason,'created',r.created_at,'expiry',r.expires_at,'checked',r.checked_at,'generation',r.subject_generation,'parent',r.request_digest)) FROM (SELECT id,role_id,desired,state,attempts,reason,created_at,expires_at,checked_at,subject_generation,request_digest FROM role_settlements WHERE subject=wanted.value AND guild_id=?2 AND role_id IN(SELECT value FROM json_each(?3)) ORDER BY created_at DESC,id DESC LIMIT ${HISTORY_LIMIT}) r), '[]') AS receipts
 FROM json_each(?1) wanted LEFT JOIN privacy_subjects p ON p.subject_id=wanted.value`;
const SNAPSHOT='SELECT id,exported_at,received_at,member_count,complete,trusted FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)';
const DENOMINATOR=`SELECT COUNT(DISTINCT c.discord_id) AS subjects FROM characters c WHERE c.status='member'
 AND EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=(SELECT MAX(id) FROM roster_snapshots) AND r.guid=c.guid AND r.name_key=c.name_key)
 AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=c.discord_id AND p.state<>'active')
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=c.discord_id AND j.state IN('waiting_role','held','erasing'))`;

/** Hook after normal handleAdmin authorization/body parsing. Keeping the witnessed
 * SiteUser parameter prevents a caller-shaped tuple from becoming an actor. */
export async function handleSiteRoleAudit283(request:Request,env:Env,admin:SiteUser,body:Record<string,unknown>={}):Promise<Response>{
 let writerEntered=false;
 try{
  if(!['GET','POST'].includes(request.method))return apiJson({error:'method_not_allowed'},405);
  const original=originalUserSession(admin),canonical=captureCanonicalRankConfig233(env),entitlements=captureCanonicalEntitlements233(env);
  const keys=['DB','GUILD_ID','SITE_ADMINS','COOKIE_SECRET','DISCORD_BOT_TOKEN'] as const,slots=keys.map(k=>Object.getOwnPropertyDescriptor(env,k));
  const check=()=>{if(originalUserSession(admin)!==original||!isSiteAdmin(env,original.u)||!canonical.current()||!entitlements.current()||keys.some((k,i)=>{
   const a=slots[i],b=Object.getOwnPropertyDescriptor(env,k);return !a||!b||!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value')||a.value!==b.value;
  }))throw new Held('original_actor_or_configuration_changed',403);};check();
  if(!validId(env.GUILD_ID)||canonical.mode!=='enabled'||!canonical.policy||canonical.policy.guildId!==env.GUILD_ID||!env.DISCORD_BOT_TOKEN||!env.COOKIE_SECRET)throw new Held('role_configuration_held',503);
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(k=>!['cursor','policyPreview','subject'].includes(k))||query.getAll('cursor').length>1||query.getAll('policyPreview').length>1||query.getAll('subject').length>1||query.has('policyPreview')&&query.get('policyPreview')!=='steward-v3'||query.has('subject')&&(!validId(query.get('subject'))||query.has('cursor')))throw new Held('invalid_audit_view',400);
  const planning=query.get('policyPreview')==='steward-v3';
  const singleSubject=query.get('subject');
  // A separately parsed planning policy never replaces the serving env, issues
  // Native authority, or enables any producer. Real cap/source checks still run.
  const proposed=planning?parseCanonicalRankPolicy233(JSON.stringify({version:3,enabled:true,profile:STEWARD_CANONICAL_PROFILE,guildId:env.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))})):null;
  const subject:CommunitySubject=Object.freeze({discordId:original.u,sessionVersion:original.v,expiresAt:original.e,privacyGeneration:original.g,accountIncarnation:original.n,originalSession:original});
  const read=async(statements:D1PreparedStatement[])=>{check();const result=await admittedReadAs(env,subject,'applicantWrite',[
   env.DB.prepare('SELECT NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) AS ok').bind(original.u),...statements]);check();
   if(result===FENCE_REFUSED||(result[0]?.results[0] as {ok?:number}|undefined)?.ok!==1)throw new Held('original_actor_no_longer_admitted',403);return result.slice(1);};
  const limits=consumeRateLimit280('role-audit283:'+request.method+':'+original.u,request.method==='GET'?90:10,60);
  if(limits.limited)return apiJson({error:'slow_down',coverage:{complete:false,gap:'request_rate_limit'}},429,rateLimitHeaders280(limits));
  const binding=JSON.stringify([PURPOSE,env.GUILD_ID,original.u,original.v,original.e,original.g,original.n,canonical.raw,entitlements.raw]);
  const snapshotRead=async()=>{const r=await read([env.DB.prepare(SNAPSHOT)]);return r[0]?.results[0] as Snapshot|undefined;};
  const targetsRead=async(ids:readonly string[])=>{const r=await read([env.DB.prepare(TARGETS).bind(JSON.stringify(ids),env.GUILD_ID,JSON.stringify([...MANAGED]))]);return r[0]!.results as Facts[];};
  const project=async(id:string):Promise<Projection>=>{
   check();const cap=await captureRoutineMembership232(env,id);check();if(!cap)return {expected:null,cause:'source_or_identity_held',nativeRank:null,nativeCharacter:null,snapshotId:null,deadline:null};
   try{const f=routineMembership232Facts(cap),extra=entitlements.manifest?.entries.filter(e=>e.subject===id&&e.generation===f.subjectGeneration).map(e=>canonical.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[];
    const choose=(policy:NonNullable<typeof canonical.policy>)=>f.cause==='eligible'&&!!f.primary&&entitlements.mode!=='held'&&canonicalRankWitnessMatches280(policy,f.canonicalRankProfile,f.rankQualified)?highestCanonicalRank233(policy,{index:f.primary.index,name:f.primary.rank},extra)?.roleId??null:null;
    const activeExpected=choose(canonical.policy!);
    // The inactive view has no serving canonical witness. Its pure projection
    // requires the real Native issuer's exact recognized qualified source;
    // those facts are never copied into an active-policy/writer witness.
    const wanted=proposed?(f.cause==='eligible'&&f.primary&&f.rankQualified&&f.rankProfile===STEWARD_NATIVE_PROFILE&&entitlements.mode!=='held'?highestCanonicalRank233(proposed,{index:f.primary.index,name:f.primary.rank},extra)?.roleId??null:null):activeExpected;
    return {expected:wanted,cause:wanted?'eligible':f.cause==='eligible'?'rank_source_held':f.cause,nativeRank:f.primary?.rank??null,nativeCharacter:f.primary?.nameKey??null,snapshotId:f.snapshotId,deadline:f.deadline,
     ...(planning?{activeExpected,activeCause:activeExpected?'eligible':f.cause==='eligible'?'rank_source_held':f.cause}:{})};
   }finally{closeRoutineMembership232(cap);}
  };
  if(request.method==='POST'){
   if(planning||query.has('cursor')||singleSubject)throw new Held('planning_view_read_only',400);
   if(!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)throw new Held('bad_origin_or_page',403);
   if(Object.keys(body).sort().join(',')!=='confirm,previewToken,subject'||body.confirm!==true||!validId(body.subject))throw new Held('invalid_repair',400);
   const preview=await open(env.COOKIE_SECRET,binding+'|preview',body.previewToken);check();clock(preview,PREVIEW_SECONDS);
   if(Object.keys(preview).sort().join(',')!=='expected,expiresAt,factsDigest,issuedAt,observedRoles,snapshot,snapshotAt,subject'||preview.subject!==body.subject||!validId(preview.expected)||!Number.isSafeInteger(preview.snapshotAt)||typeof preview.factsDigest!=='string'||!Array.isArray(preview.observedRoles)||preview.observedRoles.length>MANAGED.size||preview.observedRoles.some(r=>!validId(r)||!MANAGED.has(r))||new Set(preview.observedRoles).size!==preview.observedRoles.length)throw new Held('invalid_repair',400);
   const snapshot=await snapshotRead(),target=(await targetsRead([body.subject]))[0],projection=await project(body.subject);check();
   if(!snapshot||snapshot.id!==preview.snapshot||snapshot.exported_at!==preview.snapshotAt||snapshot.exported_at<=now()-600||projection.snapshotId!==snapshot.id||projection.expected!==preview.expected||!target||
    target.privacyHeld||target.privacyState!==null&&target.privacyState!=='active'||target.receiptCount>HISTORY_LIMIT||target.characterCount>CHARACTER_LIMIT||await digest(target)!==preview.factsDigest)throw new Held('preview_source_changed');
   check();const receipts=JSON.parse(target.receipts) as Receipt[];
   if(target.unknownAttempts>0||receipts.some(r=>r.attempts===1&&['dispatching','unknown'].includes(r.state)))throw new Held('historical_effect_unresolved');
   const rawMember=await rest<unknown>(env,'GET',`/guilds/${env.GUILD_ID}/members/${body.subject}`,undefined,1);check();await read([]);
   const member=providerPage([rawMember],'0').members[0]!;
   const current=classifyRoleAudit283(member.roles,projection.expected,receipts,target.generation,false);
   if(member.id!==body.subject||member.bot||member.pending||!current.repairable||current.extraUnowned.length||JSON.stringify([...current.actual].sort())!==JSON.stringify([...(preview.observedRoles as string[])].sort()))throw new Held('preview_roles_changed_or_unowned');
   await read([]);check();
   const actionEnv=privacyBoundSiteRoleActionEnv(env,original,{subject:preview.subject as string,snapshotId:preview.snapshot as number,snapshotAt:preview.snapshotAt as number,expectedRole:preview.expected as string,expiresAt:preview.expiresAt as number});
   const requestId=b64u(crypto.getRandomValues(new Uint8Array(18))),reference={subject:body.subject,capture:privacyCaptureFromColumns(body.subject,{privacy_generation:target.generation,privacy_state:target.privacyState,privacy_revision:target.revision})};
   // Attribution only: this action is not the durable role.request242 queue and
   // cannot schedule/replay work. Confirm its admission before entering writer.
   await audit(actionEnv,original.u,'role.audit_requested283',body.subject,{requestId,expectedRole:preview.expected,maxPlannedEffects:2,snapshot:preview.snapshot,snapshotAt:preview.snapshotAt,expiresAt:preview.expiresAt},reference);check();
   const intent=await read([env.DB.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor=?1 AND action='role.audit_requested283' AND subject=?2 AND json_extract(details,'$.requestId')=?3").bind(original.u,body.subject,requestId)]);
   if((intent[0]?.results[0] as {n?:number}|undefined)?.n!==1)throw new Held('repair_intent_unconfirmed');
   clock(preview,PREVIEW_SECONDS);writerEntered=true;
   // Existing writer repeats original Native/provider/custody admission. This
   // is a current reconciliation, never an old-row reset or historical replay.
   const result=await reconcileRoleBatch242(actionEnv,[body.subject]);check();await read([]);check();
   return apiJson({result,requestId,requestIntentRecorded:true,maxPlannedEffects:2,delivery:'inspect_current_roles_with_a_fresh_audit',automaticRetry:false,oldReceiptsPreserved:true});
  }
  if(Object.keys(body).length)throw new Held('invalid_request',400);
  const rawCursor=query.get('cursor');
  const cursorBinding=binding+'|cursor|'+(planning?'steward-v3':'active');
  const cursor=rawCursor?await open(env.COOKIE_SECRET,cursorBinding,rawCursor):{after:'0',issuedAt:now(),expiresAt:Math.min(now()+CURSOR_SECONDS,original.e),page:0};check();clock(cursor,CURSOR_SECONDS);
  if(Object.keys(cursor).sort().join(',')!=='after,expiresAt,issuedAt,page'||cursor.after!=='0'&&!validId(cursor.after)||!Number.isSafeInteger(cursor.page)||(cursor.page as number)<0||(cursor.page as number)>100000)throw new Held('invalid_cursor',400);
  const snapshot=await snapshotRead();check();
  const raw=await rest<unknown>(env,'GET',singleSubject?`/guilds/${env.GUILD_ID}/members/${singleSubject}`:`/guilds/${env.GUILD_ID}/members?limit=${PROVIDER_PAGE}&after=${cursor.after}`,undefined,1);check();await read([]);
  const sourcePage=providerPage(singleSubject?[raw]:raw,cursor.after as string);
  if(singleSubject&&sourcePage.members[0]?.id!==singleSubject)throw new Held('discord_reply_unconfirmed',503);
  const candidateRead=await read([env.DB.prepare(`SELECT wanted.value AS id FROM json_each(?1) wanted WHERE EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=wanted.value AND c.status NOT IN('unbound','denied'))`).bind(JSON.stringify(sourcePage.members.map(m=>m.id)))]);
  const linked=new Set((candidateRead[0]!.results as {id:string}[]).map(r=>r.id));
  const candidates=sourcePage.members.filter(m=>linked.has(m.id)||m.roles.some(r=>MANAGED.has(r))),selected=candidates.slice(0,ROLE_AUDIT_PAGE283),overflow=candidates.length>selected.length;
  const last=overflow?selected.at(-1)!.id:sourcePage.members.at(-1)?.id??cursor.after as string;
  const processed=sourcePage.members.filter(m=>BigInt(m.id)<=BigInt(last)),observedOnly=processed.length-selected.length;
  const page={members:selected,complete:sourcePage.complete&&!overflow};
  const targets=await targetsRead(page.members.map(m=>m.id)),byId=new Map(targets.map(t=>[t.id,t]));
  const rows=[],withheld={privacy:0,membershipScreening:0,bots:0};
  for(const member of page.members){
   const target=byId.get(member.id);if(!target)throw new Held('target_read_unconfirmed',503);
   const privateHeld=!!target.privacyHeld||target.privacyState!==null&&target.privacyState!=='active';
   // Excluded identities never enter response rows, UI caches or CSV. Retain
   // aggregate coverage and revalidate their privacy facts with the whole page.
   if(privateHeld){withheld.privacy++;continue;}if(member.pending){withheld.membershipScreening++;continue;}if(member.bot){withheld.bots++;continue;}
   const projection=await project(member.id);check();
   const sourceHeld=!projection.expected||!snapshot||projection.snapshotId!==snapshot.id;
   const classification=classifyRoleAudit283(member.roles,projection.expected,JSON.parse(target.receipts),target.generation,sourceHeld);
   const historyTruncated=target.receiptCount>HISTORY_LIMIT||target.characterCount>CHARACTER_LIMIT;
   classification.unknown=target.unknownAttempts;
   classification.expiredUnattempted=target.expiredUnattempted;
   classification.review=classification.review||classification.unknown>0||historyTruncated;
   classification.repairable=classification.repairable&&classification.unknown===0&&!historyTruncated&&!planning;
   // Whole-scan rows are observations only. A deliberate per-row Review reads
   // this exact member and issues a new original token, never extends an old one.
   const previewIssuedAt=singleSubject&&classification.repairable?now():null;
   const previewExpiresAt=previewIssuedAt===null?null:Math.min(previewIssuedAt+PREVIEW_SECONDS,original.e,projection.deadline??0);
   const preview=previewIssuedAt!==null?await seal(env.COOKIE_SECRET,binding+'|preview',{subject:member.id,issuedAt:previewIssuedAt,expiresAt:previewExpiresAt!,snapshot:snapshot!.id,snapshotAt:snapshot!.exported_at,expected:projection.expected!,factsDigest:await digest(target),observedRoles:[...classification.actual].sort()} satisfies Preview):null;check();
   rows.push({id:member.id,username:member.username,displayName:member.displayName,discordJoinedAt:member.joinedAt,discordJoinProvenance:'Discord joined_at; not native guild join time',
    bot:false,pending:false,...classification,...projection,activationRequired:planning,maxPlannedEffects:2,
    characters:JSON.parse(target.characters),historyWithheld:false,historyTruncated,
    retainedReceiptCount:Math.min(target.receiptCount,HISTORY_LIMIT),retainedCharacterCount:Math.min(target.characterCount,CHARACTER_LIMIT),
    firstObservedProvenance:'Legacy name-only roster observation; not current character/GUID episode, native guild join time or a grace clock',previewToken:preview,previewIssuedAt,previewExpiresAt});
  }
  const nextCursor=singleSubject||page.complete?null:await seal(env.COOKIE_SECRET,cursorBinding,{issuedAt:cursor.issuedAt as number,expiresAt:cursor.expiresAt as number,after:last,page:(cursor.page as number)+1} satisfies Cursor);check();
  const final=await read([env.DB.prepare(TARGETS).bind(JSON.stringify(page.members.map(m=>m.id)),env.GUILD_ID,JSON.stringify([...MANAGED])),env.DB.prepare(SNAPSHOT),env.DB.prepare(DENOMINATOR)]);check();
  const finalTargets=final[0]!.results as Facts[],finalSnapshot=final[1]?.results[0] as Snapshot|undefined;
  if(JSON.stringify(finalSnapshot??null)!==JSON.stringify(snapshot??null))throw new Held('roster_changed_during_page');
  if(JSON.stringify(finalTargets)!==JSON.stringify(targets))throw new Held('target_changed_during_page');
  const counts={subjects:rows.length,missing:rows.filter(r=>r.missing.length).length,extraOwned:rows.filter(r=>r.extraOwned.length).length,extraUnowned:rows.filter(r=>r.extraUnowned.length).length,
   review:rows.filter(r=>r.review).length,unknown:rows.filter(r=>r.unknown>0).length,historyWithheld:withheld.privacy,withheldCandidates:withheld.privacy+withheld.membershipScreening+withheld.bots,sourceHeld:rows.filter(r=>r.sourceHeld).length,repairable:rows.filter(r=>r.repairable).length};
  return apiJson({guildId:env.GUILD_ID,generatedAt:now(),source:snapshot??null,managedRoles:canonical.policy.ranks,rows,counts,withheld,nextCursor,
   view:planning?'steward-v3':'active',activationRequired:planning,activePolicy:{version:canonical.policy.version,profile:canonical.policy.profile},proposedPolicy:proposed?{version:proposed.version,profile:proposed.profile}:null,
   coverage:{scope:singleSubject?'single_discord_member_read':'one_discord_inventory_page',complete:singleSubject?false:page.complete,singleMemberReadComplete:!!singleSubject,atomicSnapshot:false,providerRowsFetched:sourcePage.scanned,providerRowsProcessed:processed.length,observedOnly,returned:rows.length,traversalExpiresAt:singleSubject?null:cursor.expiresAt,
    nativeLinkedCandidateSubjects:(final[2]?.results[0] as {subjects:number}|undefined)?.subjects??null,nativeLinkedAccountsAbsentFromDiscord:'not_individually_checked',convergenceConfirmed:false,
    note:'Includes unlinked role holders present in Discord. The separate native-linked candidate count is not an overlap or absence proof. Absent accounts were not individually checked; no removal is inferred. Other Discord roles and website appointments are preserved.'},
   custodyMeaning:'Extra-owned means an acknowledged grant receipt was found. Only the existing writer can authorize its removal.',automaticApply:false});
 }catch(error){
  // An actor who lost admission receives no subject/result details. Entering
  // the writer is enough to make an interrupted response outcome uncertain.
  if(writerEntered)return apiJson({error:'repair_outcome_unconfirmed',outcome:'roles_may_have_changed',automaticRetry:false,maxPlannedEffects:2},error instanceof Held?error.status:503);
  if(error instanceof Held)return apiJson({error:error.code,coverage:{complete:false,gap:error.code},automaticRetry:false},error.status);
  const status=error instanceof DiscordError?error.status:503;
  const gap=status===403?'discord_forbidden_members_intent_or_permissions':status===429?'discord_rate_limited':'provider_or_admission_unavailable';
  return apiJson({error:'role_audit_unavailable',coverage:{complete:false,gap},automaticRetry:false},status===403?403:status===429?429:503);
 }
}
