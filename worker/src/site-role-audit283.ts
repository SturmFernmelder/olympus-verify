/** Private attended role comparison. A traversal is not an atomic snapshot and
 * this reader never supplies effect/ownership authority. Repairs re-enter the
 * existing Native writer; old requests, manual roles and appointments are kept. */
import type {Env} from './env';
import {now,audit} from './db';
import {rest,DiscordError,originalDiscordGetPacing,type OriginalDiscordGetPacing} from './discord';
import {apiJson,b64u,isSiteAdmin,originalUserSession,PAGE_VERSION,sameOrigin,type SiteUser} from './site-core';
import {admittedReadAs,FENCE_REFUSED,type CommunitySubject} from './community-context';
import {consumeRateLimit280,rateLimitHeaders280} from './soft-rate-limit280';
import {captureCanonicalRankConfig233,captureCanonicalEntitlements233,CANONICAL_MANAGED_ROLE_IDS233,CANONICAL_RANKS233,parseCanonicalRankPolicy233,highestCanonicalRank233} from './canonical-ranks233';
import {STEWARD_CANONICAL_PROFILE,STEWARD_NATIVE_PROFILE,STEWARD_RANK_DIGEST} from './native-rank-constants';
import {canonicalRankWitnessMatches280} from './canonical-native-authority280';
import {captureRoutineMembershipAudit285,closeRoutineMembership232,routineMembership232Facts,observeQualifiedMembershipPlanning283} from './routine-membership-authority232';
import {reconcileRoleBatch242} from './role-reconcile242';
import {canonicalNeverSentDeleteAuditFacts284} from './role-settlements';
import {privacyBoundSiteRoleActionEnv,privacyCaptureFromColumns} from './privacy-serving-authority';
import {readCanonicalPutRefusal285} from './role-put-refusal285';
import {captureRoleGrantBaseline285,roleGrantBaselineFacts285,roleBaselineRelatedSql285,roleBaselineAuditActorCurrentSql285,roleBaselineRelevantFindingSql285,ROLE_BASELINE_FAMILY_IDS285} from './role-baseline285';

export const ROLE_AUDIT_PAGE283=12;
export const ROLE_AUDIT_FOCUSED_PAGE285=6;
const PROVIDER_PAGE=1000,CURSOR_SECONDS=900,PREVIEW_SECONDS=300,PURPOSE='private-role-audit283-v1';
// Advisory UI allowance for an ordinary two-job removal+grant plan. The
// original writer still determines actual jobs/reserves at every dispatch.
const CONFIRM_RESERVE_SECONDS=112;
const HISTORY_LIMIT=100,CHARACTER_LIMIT=50;
const ID=/^[1-9][0-9]{16,19}$/,encoder=new TextEncoder();
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v)&&BigInt(v)<=18446744073709551615n;
class Held extends Error{constructor(readonly code:string,readonly status=409){super(code);}}
type ProviderMember={id:string;username:string;displayName:string;roles:string[];bot:boolean;pending:boolean;joinedAt:string|null};
type Snapshot={id:number;exported_at:number;received_at:number;member_count:number;complete:number;trusted:number};
type Facts={id:string;generation:string|null;revision:number|null;privacyState:string|null;privacyHeld:number;characters:string;receipts:string;characterCount:number;receiptCount:number;unknownAttempts:number;expiredUnattempted:number;activeUnattempted:number;baselineFindings:string};
type Receipt={id:string;role:string;desired:number;state:string;attempts:number;reason:string;created:number;expiry:number;checked:number|null;generation:string|null;parent:string|null;noEffect?:number};
type Projection={expected:string|null;cause:string;nativeRank:string|null;nativeCharacter:string|null;snapshotId:number|null;deadline:number|null;activeExpected?:string|null;activeCause?:string;holdReason?:string|null};
type Cursor={after:string;issuedAt:number;expiresAt:number;page:number;readNotBefore?:number};
type Preview={subject:string;issuedAt:number;expiresAt:number;snapshot:number;snapshotAt:number;expected:string;factsDigest:string;observedRoles:string[];baselineFindingId:number|null};
const MANAGED=new Set(CANONICAL_MANAGED_ROLE_IDS233);
const ownAck=(r:Receipt)=>r.state==='settled'&&r.attempts===1&&r.desired===1&&
 ['canonical233_put_acknowledged_and_confirmed','canonical233_migration_put_acknowledged_and_confirmed'].includes(r.reason)&&
 Number.isSafeInteger(r.checked)&&r.checked!>=r.created&&r.checked!<r.expiry;

/** Informational receipt custody only, deliberately conservative. The writer
 * repeats the full original receipt graph before any removal. */
export function classifyRoleAudit283(roles:readonly string[],expected:string|null,receipts:readonly Receipt[],generation:string|null,sourceHeld:boolean){
 const actual=roles.filter(r=>MANAGED.has(r)),unknown=receipts.filter(r=>r.noEffect!==1&&r.attempts===1&&['dispatching','unknown'].includes(r.state));
 const expiredUnattempted=receipts.filter(r=>r.attempts===0&&r.expiry<=now()&&['pending','held'].includes(r.state)).length;
 const extra=expected?actual.filter(r=>r!==expected):[];
 const extraOwned=extra.filter(role=>receipts.some(r=>r.role===role&&r.generation===generation&&ownAck(r)&&
   !receipts.some(child=>child.parent===r.id&&child.desired===0&&child.noEffect!==1&&(child.attempts!==0||child.state==='settled'))));
 const extraUnowned=extra.filter(r=>!extraOwned.includes(r)),missing=expected&&!actual.includes(expected)?[expected]:[];
 // This is a conservative display/preview restriction only. The writer repeats
 // its full original-row classifier in the same statement before any effect.
 const refusedPutReview=!!expected&&!sourceHeld&&receipts.some(r=>{const refusal=readCanonicalPutRefusal285(r.reason);
  return r.role===expected&&r.generation===generation&&r.desired===1&&r.attempts===1&&r.state==='held'&&!!refusal&&[403,404].includes(refusal.status);});
 const manualPutHeld=missing.length>0&&refusedPutReview;
 return {actual,missing,extraOwned,extraUnowned,unknown:unknown.length,expiredUnattempted,
   sourceHeld,manualPutHeld,refusedPutReview,review:sourceHeld||unknown.length>0||extraUnowned.length>0||manualPutHeld,
   repairable:!sourceHeld&&!manualPutHeld&&unknown.length===0&&extraUnowned.length===0&&!!expected&&(missing.length>0||extraOwned.length>0)};
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
// Reuse the writer's strict, full-row no-dispatch observation once for this
// bounded target set. A reason alone never clears uncertainty or a child edge.
const targetsSQL284=()=>`WITH ${canonicalNeverSentDeleteAuditFacts284()}
 SELECT wanted.value AS id,p.generation,p.revision,p.state AS privacyState,
 EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=wanted.value AND j.state<>'complete' AND j.state IN('waiting_role','held','erasing')) AS privacyHeld,
 (SELECT COUNT(*) FROM characters c WHERE c.discord_id=wanted.value AND c.status NOT IN('unbound','denied')) AS characterCount,
 COALESCE((SELECT json_group_array(json_object('name',c.name,'status',c.status,'legacyNameFirstObservedAt',f.first_seen,'actualJoinedAt',NULL,'currentEpisodeFirstObservedAt',NULL)) FROM (SELECT name_key,name,status FROM characters WHERE discord_id=wanted.value AND status NOT IN('unbound','denied') ORDER BY name_key LIMIT ${CHARACTER_LIMIT}) c LEFT JOIN roster_first_seen f ON f.name_key=c.name_key), '[]') AS characters,
 COALESCE((SELECT json_group_array(json_object('id',b.id,'actor',b.actor,'ts',b.ts,'details',b.details,'actorCurrent',${roleBaselineAuditActorCurrentSql285('b')})) FROM (SELECT a.id,a.actor,a.ts,a.details FROM audit a WHERE a.action='role.baseline285_adopted' AND a.actor IN(SELECT value FROM json_each(?4)) AND a.subject=wanted.value AND ${roleBaselineRelevantFindingSql285('a','wanted.value','p.generation','?2','?3')} ORDER BY a.ts DESC,a.id DESC LIMIT 8) b),'[]') AS baselineFindings,
 (SELECT COUNT(*) FROM role_settlements r WHERE ${roleBaselineRelatedSql285('r','wanted.value','?2','?3')}) AS receiptCount,
 (SELECT COUNT(*) FROM role_settlements r WHERE ${roleBaselineRelatedSql285('r','wanted.value','?2','?3')} AND r.attempts=1 AND r.state IN('dispatching','unknown') AND NOT EXISTS(SELECT 1 FROM audit_no_effect284 n WHERE n.receipt_row=r.rowid)) AS unknownAttempts,
 (SELECT COUNT(*) FROM role_settlements r WHERE ${roleBaselineRelatedSql285('r','wanted.value','?2','?3')} AND r.attempts=0 AND r.expires_at<=CAST(strftime('%s','now')AS INTEGER) AND r.state IN('pending','held')) AS expiredUnattempted,
 (SELECT COUNT(*) FROM role_settlements r WHERE ${roleBaselineRelatedSql285('r','wanted.value','?2','?3')} AND r.attempts=0 AND r.expires_at>CAST(strftime('%s','now')AS INTEGER) AND r.state IN('pending','dispatching')) AS activeUnattempted,
 COALESCE((SELECT json_group_array(json_object('id',r.id,'role',r.role_id,'desired',r.desired,'state',r.state,'attempts',r.attempts,'reason',r.reason,'created',r.created_at,'expiry',r.expires_at,'checked',r.checked_at,'generation',r.subject_generation,'parent',r.request_digest,'noEffect',r.no_effect)) FROM (SELECT r.id,r.role_id,r.desired,r.state,r.attempts,r.reason,r.created_at,r.expires_at,r.checked_at,r.subject_generation,r.request_digest,EXISTS(SELECT 1 FROM audit_no_effect284 n WHERE n.receipt_row=r.rowid) AS no_effect FROM role_settlements r WHERE ${roleBaselineRelatedSql285('r','wanted.value','?2','?3')} ORDER BY r.created_at DESC,r.id DESC LIMIT ${HISTORY_LIMIT}) r), '[]') AS receipts
 FROM json_each(?1) wanted LEFT JOIN privacy_subjects p ON p.subject_id=wanted.value`;
const SNAPSHOT='SELECT id,exported_at,received_at,member_count,complete,trusted FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)';
const DENOMINATOR=`SELECT COUNT(DISTINCT c.discord_id) AS subjects FROM characters c WHERE c.status='member'
 AND EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=(SELECT MAX(id) FROM roster_snapshots) AND r.guid=c.guid AND r.name_key=c.name_key)
 AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=c.discord_id AND p.state<>'active')
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=c.discord_id AND j.state<>'complete' AND j.state IN('waiting_role','held','erasing'))`;
// The focused list chooses accounts to READ, never identities or role authority.
// Binary text order is used consistently for its keyset cursor; provider snowflake
// ordering is used only by the independent whole-server inventory.
const focusedSubjects285=(nativeOnly:boolean)=>`SELECT DISTINCT c.discord_id AS id FROM characters c
 LEFT JOIN privacy_subjects p ON p.subject_id=c.discord_id
 WHERE c.discord_id>?1 AND c.status NOT IN('unbound','denied')
 AND (p.state IS NULL OR p.state='active')
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=c.discord_id AND j.state<>'complete' AND j.state IN('waiting_role','held','erasing'))
 AND ?3=(SELECT MAX(id) FROM roster_snapshots)
 ${nativeOnly?"AND c.status='member' AND EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=?3 AND r.guid=c.guid AND r.name_key=c.name_key)":''}
 ORDER BY c.discord_id LIMIT ?2`;

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
  if([...query.keys()].some(k=>!['cursor','policyPreview','subject','scope'].includes(k))||query.getAll('cursor').length>1||query.getAll('policyPreview').length>1||query.getAll('subject').length>1||query.getAll('scope').length>1||query.has('policyPreview')&&query.get('policyPreview')!=='steward-v3'||query.has('scope')&&!['native','linked','server'].includes(query.get('scope')!)||query.has('subject')&&(!validId(query.get('subject'))||query.has('cursor')||query.has('scope')))throw new Held('invalid_audit_view',400);
  const planning=query.get('policyPreview')==='steward-v3';
  const singleSubject=query.get('subject');
  const scope=query.get('scope')??'server',focused=!singleSubject&&scope!=='server';
  // A separately parsed planning policy never replaces the serving env, issues
  // Native authority, or enables any producer. Real cap/source checks still run.
  const proposed=planning?parseCanonicalRankPolicy233(JSON.stringify({version:3,enabled:true,profile:STEWARD_CANONICAL_PROFILE,guildId:env.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))})):null;
  const subject:CommunitySubject=Object.freeze({discordId:original.u,sessionVersion:original.v,expiresAt:original.e,privacyGeneration:original.g,accountIncarnation:original.n,originalSession:original});
  const read=async(statements:D1PreparedStatement[])=>{check();const result=await admittedReadAs(env,subject,'applicantWrite',[
   env.DB.prepare('SELECT NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) AS ok').bind(original.u),...statements]);check();
   if(result===FENCE_REFUSED||(result[0]?.results[0] as {ok?:number}|undefined)?.ok!==1)throw new Held('original_actor_no_longer_admitted',403);return result.slice(1);};
  const limits=consumeRateLimit280('role-audit283:'+request.method+':'+original.u,request.method==='GET'?90:10,60);
  if(limits.limited)return apiJson({error:'slow_down',coverage:{complete:false,gap:'request_rate_limit'},...(request.method==='POST'?{outcome:'not_started',roleChangeSent:false}:{})},429,rateLimitHeaders280(limits));
  const binding=JSON.stringify([PURPOSE,env.GUILD_ID,original.u,original.v,original.e,original.g,original.n,canonical.raw,entitlements.raw]);
  const snapshotRead=async()=>{const r=await read([env.DB.prepare(SNAPSHOT)]);return r[0]?.results[0] as Snapshot|undefined;};
  const baselineActors285=JSON.stringify((env.SITE_ADMINS??'').split(',').map(value=>value.trim()).filter(validId));
  const targetsRead=async(ids:readonly string[])=>{const r=await read([env.DB.prepare(targetsSQL284()).bind(JSON.stringify(ids),env.GUILD_ID,JSON.stringify(ROLE_BASELINE_FAMILY_IDS285),baselineActors285)]);return r[0]!.results as Facts[];};
  const baselineProjection285=async(target:Facts)=>{
   if(target.unknownAttempts!==1||target.baselineFindings==='[]'||target.receiptCount>HISTORY_LIMIT||target.characterCount>CHARACTER_LIMIT)return null;
   const baseline=await captureRoleGrantBaseline285(env,target.id,target.generation);check();if(!baseline)return null;
   const facts=roleGrantBaselineFacts285(baseline),receipts=JSON.parse(target.receipts) as Receipt[];
   if(!receipts.some(receipt=>receipt.id===facts.oldId&&receipt.attempts===1&&['dispatching','unknown'].includes(receipt.state)&&receipt.noEffect!==1))return null;
   return facts;
  };
  const project=async(id:string):Promise<Projection>=>{
   if(planning){
    check();const observation=await observeQualifiedMembershipPlanning283(env,id);
    if(!observation){check();return {expected:null,cause:'source_or_identity_held',nativeRank:null,nativeCharacter:null,snapshotId:null,deadline:null,activeExpected:null,activeCause:'source_or_identity_held'};}
    try{
     check();
     if(!observation.current()||observation.subject!==id)throw new Held('planning_observation_changed');
     const extra=entitlements.manifest?.entries.filter(e=>e.subject===id&&e.generation===observation.subjectGeneration).map(e=>canonical.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[];
     // Read-only source facts are never a RoutineMembership issuer or active
     // canonical witness. Both policy projections use this one validated read.
     const wanted=proposed&&observation.cause==='eligible'&&observation.primary&&observation.rankQualified&&observation.rankProfile===STEWARD_NATIVE_PROFILE&&observation.rankSchemeDigest===STEWARD_RANK_DIGEST&&entitlements.mode!=='held'?highestCanonicalRank233(proposed,{index:observation.primary.index,name:observation.primary.rank},extra)?.roleId??null:null;
     const activeExpected=observation.activeCause==='eligible'&&observation.activePrimary&&observation.activeSourceQualified&&entitlements.mode!=='held'?highestCanonicalRank233(canonical.policy!,{index:observation.activePrimary.index,name:observation.activePrimary.rank},extra)?.roleId??null:null;
     if(!observation.current())throw new Held('planning_observation_changed');check();
     return {expected:wanted,cause:wanted?'eligible':observation.cause==='eligible'?'rank_source_held':observation.cause,nativeRank:observation.primary?.rank??null,nativeCharacter:observation.primary?.nameKey??null,snapshotId:observation.snapshotId,deadline:observation.deadline,
      activeExpected,activeCause:activeExpected?'eligible':observation.activeCause==='eligible'?'rank_source_held':observation.activeCause};
    }finally{observation.close();}
   }
   check();const diagnostic=await captureRoutineMembershipAudit285(env,id),cap=diagnostic.cap;if(!cap){check();return {expected:null,cause:'source_or_identity_held',holdReason:diagnostic.holdReason,nativeRank:null,nativeCharacter:null,snapshotId:null,deadline:null};}
   try{check();const f=routineMembership232Facts(cap),extra=entitlements.manifest?.entries.filter(e=>e.subject===id&&e.generation===f.subjectGeneration).map(e=>canonical.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[];
    const choose=(policy:NonNullable<typeof canonical.policy>)=>f.cause==='eligible'&&!!f.primary&&entitlements.mode!=='held'&&canonicalRankWitnessMatches280(policy,f.canonicalRankProfile,f.rankQualified)?highestCanonicalRank233(policy,{index:f.primary.index,name:f.primary.rank},extra)?.roleId??null:null;
    const wanted=choose(canonical.policy!);
    return {expected:wanted,cause:wanted?'eligible':f.cause==='eligible'?'rank_source_held':f.cause,holdReason:wanted?null:f.cause==='eligible'?entitlements.mode==='held'?'configuration_held':'native_rank_unmapped':f.cause,nativeRank:f.primary?.rank??null,nativeCharacter:f.primary?.nameKey??null,snapshotId:f.snapshotId,deadline:f.deadline};
   }finally{closeRoutineMembership232(cap);}
  };
  if(request.method==='POST'){
   if(planning||query.has('cursor')||singleSubject||query.has('scope'))throw new Held('planning_view_read_only',400);
   if(!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)throw new Held('bad_origin_or_page',403);
   if(Object.keys(body).sort().join(',')!=='confirm,previewToken,subject'||body.confirm!==true||!validId(body.subject))throw new Held('invalid_repair',400);
   const preview=await open(env.COOKIE_SECRET,binding+'|preview',body.previewToken);check();clock(preview,PREVIEW_SECONDS);
   if(Object.keys(preview).sort().join(',')!=='baselineFindingId,expected,expiresAt,factsDigest,issuedAt,observedRoles,snapshot,snapshotAt,subject'||preview.baselineFindingId!==null&&(!Number.isSafeInteger(preview.baselineFindingId)||Number(preview.baselineFindingId)<1)||preview.subject!==body.subject||!validId(preview.expected)||!Number.isSafeInteger(preview.snapshotAt)||typeof preview.factsDigest!=='string'||!Array.isArray(preview.observedRoles)||preview.observedRoles.length>MANAGED.size||preview.observedRoles.some(r=>!validId(r)||!MANAGED.has(r))||new Set(preview.observedRoles).size!==preview.observedRoles.length)throw new Held('invalid_repair',400);
   const snapshot=await snapshotRead(),target=(await targetsRead([body.subject]))[0],projection=await project(body.subject);check();
   if(!snapshot||snapshot.id!==preview.snapshot||snapshot.exported_at!==preview.snapshotAt||snapshot.exported_at<=now()-600||projection.snapshotId!==snapshot.id||projection.expected!==preview.expected||!target||
    target.privacyHeld||target.privacyState!==null&&target.privacyState!=='active'||target.receiptCount>HISTORY_LIMIT||target.characterCount>CHARACTER_LIMIT||await digest(target)!==preview.factsDigest)throw new Held('preview_source_changed');
   check();const receipts=JSON.parse(target.receipts) as Receipt[];
   const baseline285=await baselineProjection285(target);check();
   if((baseline285?.receiptId??null)!==preview.baselineFindingId)throw new Held('preview_baseline_changed');
   if((target.unknownAttempts>0||receipts.some(r=>r.noEffect!==1&&r.attempts===1&&['dispatching','unknown'].includes(r.state)))&&!baseline285)throw new Held('historical_effect_unresolved');
   const rawMember=await rest<unknown>(env,'GET',`/guilds/${env.GUILD_ID}/members/${body.subject}`,undefined,1);check();await read([]);
   const member=providerPage([rawMember],'0').members[0]!;
   const current=classifyRoleAudit283(member.roles,projection.expected,receipts,target.generation,false);
   const grantOnlyReady285=!!baseline285&&!current.sourceHeld&&!current.manualPutHeld&&current.missing.length===1;
   if(member.id!==body.subject||member.bot||member.pending||(!current.repairable&&!grantOnlyReady285)||current.extraUnowned.length&&!grantOnlyReady285||JSON.stringify([...current.actual].sort())!==JSON.stringify([...(preview.observedRoles as string[])].sort()))throw new Held('preview_roles_changed_or_unowned');
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
  const snapshot=await snapshotRead();check();
  const cursorBinding=binding+'|cursor|'+(planning?'steward-v3':'active')+'|'+scope;
  const cursor=rawCursor?await open(env.COOKIE_SECRET,cursorBinding,rawCursor):{after:'0',issuedAt:now(),expiresAt:Math.min(now()+CURSOR_SECONDS,original.e),page:0,...(focused?{snapshotId:snapshot?.id??null,snapshotAt:snapshot?.exported_at??null}:{})};check();clock(cursor,CURSOR_SECONDS);
  const cursorKeys=(focused?['after','expiresAt','issuedAt','page','snapshotAt','snapshotId',...(Object.hasOwn(cursor,'readNotBefore')?['readNotBefore']:[])]:['after','expiresAt','issuedAt','page']).sort().join(',');
  if(Object.keys(cursor).sort().join(',')!==cursorKeys||cursor.after!=='0'&&!validId(cursor.after)||!Number.isSafeInteger(cursor.page)||(cursor.page as number)<0||(cursor.page as number)>100000)throw new Held('invalid_cursor',400);
  if(focused&&(!snapshot||snapshot.id!==cursor.snapshotId||snapshot.exported_at!==cursor.snapshotAt))throw new Held('focused_source_changed');
  if(Object.hasOwn(cursor,'readNotBefore')&&(!Number.isSafeInteger(cursor.readNotBefore)||(cursor.readNotBefore as number)<(cursor.issuedAt as number)||(cursor.readNotBefore as number)>253402300799))throw new Held('invalid_cursor',400);
  // A signed pause only restricts this same read. It renews no source, cursor,
  // session, preview or effect and creates no persistent cooldown or receipt.
  const readPause=async(notBefore:number,observations:readonly OriginalDiscordGetPacing[],retained=false,otherFailure?:{reason:unknown})=>{
   await read([]);check();const t=now(),remaining=Math.max(0,notBefore-t),floorOnly=otherFailure!==undefined,resumeAvailable=!floorOnly&&Math.max(notBefore,t)<(cursor.expiresAt as number);
   const resumeCursor=resumeAvailable?await seal(env.COOKIE_SECRET,cursorBinding,{...cursor,readNotBefore:notBefore}):null;check();
   const cause=otherFailure?.reason,status=cause instanceof Held?cause.status:cause instanceof DiscordError?cause.status:floorOnly?503:429;
   const gap=cause instanceof Held?cause.code:status===403?'discord_forbidden_members_intent_or_permissions':status===429?'discord_rate_limited':'provider_or_admission_unavailable';
   return apiJson({error:cause instanceof Held?cause.code:'role_audit_unavailable',coverage:{complete:false,gap},automaticRetry:false,resumeCursor,
    readPacing:{version:1,kind:floorOnly?'original-discord-get429-floor':retained?'retained-discord-get429':'original-discord-get429',serverNow:t,notBefore,retryAfterSeconds:remaining,resumeAvailable,traversalExpiresAt:cursor.expiresAt,observations}},status===403?403:status===429?429:503,{'Retry-After':String(remaining)});
  };
  if(focused&&typeof cursor.readNotBefore==='number'&&cursor.readNotBefore>now())return readPause(cursor.readNotBefore,[],true);
  let page:{members:ProviderMember[];complete:boolean},last=cursor.after as string,processedCount=0,observedOnly=0,providerRowsFetched:number|null=null,providerRequests=0,unavailableLinked=0,preWithheld=0;
  if(focused){
   const selectedRead=await read([env.DB.prepare(focusedSubjects285(scope==='native')).bind(cursor.after,ROLE_AUDIT_FOCUSED_PAGE285+1,snapshot!.id)]);
   const ids=(selectedRead[0]!.results as {id:string}[]).map(r=>r.id);
   if(ids.length>ROLE_AUDIT_FOCUSED_PAGE285+1||ids.some((id,i)=>!validId(id)||id<=String(cursor.after)||i>0&&id<=ids[i-1]!))throw new Held('focused_scope_unconfirmed',503);
   const selected=ids.slice(0,ROLE_AUDIT_FOCUSED_PAGE285),members:ProviderMember[]=[];
   processedCount=selected.length;last=selected.at(-1)??last;
   // Bounded pairs, read-only. A failure ends the page; another pair is never
   // launched after a refused/rate-limited response. No provider mutation occurs.
   for(let start=0;start<selected.length;start+=2){
    const pacing=new Map<unknown,OriginalDiscordGetPacing>();
    const pair=await Promise.allSettled(selected.slice(start,start+2).map(async id=>{
     const target=(await targetsRead([id]))[0];check();
     if(!target)throw new Held('target_read_unconfirmed',503);
     if(target.privacyHeld||target.privacyState!==null&&target.privacyState!=='active'){preWithheld++;return null;}
     let raw:unknown;providerRequests++;
     const path=`/guilds/${env.GUILD_ID}/members/${id}`;
     try{raw=await rest<unknown>(env,'GET',path,undefined,1);}
     catch(error){if(error instanceof DiscordError&&error.status===404){unavailableLinked++;return null;}const facts=originalDiscordGetPacing(error,env,path);if(facts)pacing.set(error,facts);throw error;}
     // The next pair's target read and the common post-provider target batch
     // recheck current actor/target admission before more reads or any release.
     // No role decision or private row is released from this intermediate list.
     check();const member=providerPage([raw],'0').members[0]!;
     if(member.id!==id)throw new Held('discord_reply_unconfirmed',503);return member;
    }));
    // Settle both already-started reads: the second original 429 may require a
    // longer wait. Never launch the next pair or classify a partial page.
    const failures=pair.filter((p):p is PromiseRejectedResult=>p.status==='rejected');
    if(failures.length){
     const other=failures.find(p=>!(p.reason instanceof DiscordError)||p.reason.status!==429||!pacing.has(p.reason));
     const observed=failures.flatMap(p=>pacing.has(p.reason)?[pacing.get(p.reason)!]:[]);
     if(observed.length)return readPause(Math.max(...observed.map(p=>p.notBefore)),observed,false,other?{reason:other.reason}:undefined);
     throw failures[0]!.reason;
    }
    members.push(...pair.flatMap(p=>p.status==='fulfilled'&&p.value!==null?[p.value]:[]));
   }
   page={members,complete:ids.length<=ROLE_AUDIT_FOCUSED_PAGE285};
  }else{
   let raw:unknown;providerRequests++;
   try{raw=await rest<unknown>(env,'GET',singleSubject?`/guilds/${env.GUILD_ID}/members/${singleSubject}`:`/guilds/${env.GUILD_ID}/members?limit=${PROVIDER_PAGE}&after=${cursor.after}`,undefined,1);}
   catch(error){if(singleSubject&&error instanceof DiscordError&&error.status===404)raw=null;else throw error;}check();await read([]);
   const sourcePage=providerPage(singleSubject?(raw===null?[]:[raw]):raw,cursor.after as string);providerRowsFetched=sourcePage.scanned;
   if(singleSubject&&raw!==null&&sourcePage.members[0]?.id!==singleSubject)throw new Held('discord_reply_unconfirmed',503);
   const candidateRead=await read([env.DB.prepare(`SELECT wanted.value AS id FROM json_each(?1) wanted WHERE EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=wanted.value AND c.status NOT IN('unbound','denied'))`).bind(JSON.stringify(sourcePage.members.map(m=>m.id)))]);
   const linked=new Set((candidateRead[0]!.results as {id:string}[]).map(r=>r.id));
   const candidates=sourcePage.members.filter(m=>linked.has(m.id)||m.roles.some(r=>MANAGED.has(r))),selected=candidates.slice(0,ROLE_AUDIT_PAGE283),overflow=candidates.length>selected.length;
   last=overflow?selected.at(-1)!.id:sourcePage.members.at(-1)?.id??cursor.after as string;
   const processed=sourcePage.members.filter(m=>BigInt(m.id)<=BigInt(last));processedCount=processed.length;observedOnly=processed.length-selected.length;
   page={members:selected,complete:sourcePage.complete&&!overflow};
  }
  const targets=await targetsRead(page.members.map(m=>m.id)),byId=new Map(targets.map(t=>[t.id,t]));
  const rows=[],withheld={privacy:preWithheld,membershipScreening:0,bots:0};
  for(const member of page.members){
   const target=byId.get(member.id);if(!target)throw new Held('target_read_unconfirmed',503);
   const privateHeld=!!target.privacyHeld||target.privacyState!==null&&target.privacyState!=='active';
   // Excluded identities never enter response rows, UI caches or CSV. Retain
   // aggregate coverage and revalidate their privacy facts with the whole page.
   if(privateHeld){withheld.privacy++;continue;}if(member.pending){withheld.membershipScreening++;continue;}if(member.bot){withheld.bots++;continue;}
   const projection=await project(member.id);check();
   const sourceHeld=!projection.expected||!snapshot||projection.snapshotId!==snapshot.id;
   // A chosen ID receives no distinguishable target-specific hold reason.
   // Only a readable qualified single-account observation is returned.
   if(singleSubject&&sourceHeld)continue;
   const classification=classifyRoleAudit283(member.roles,projection.expected,JSON.parse(target.receipts),target.generation,sourceHeld);
   const historyTruncated=target.receiptCount>HISTORY_LIMIT||target.characterCount>CHARACTER_LIMIT;
   classification.unknown=target.unknownAttempts;
   classification.expiredUnattempted=target.expiredUnattempted;
   classification.review=classification.review||classification.unknown>0||historyTruncated||target.activeUnattempted>0;
   classification.repairable=classification.repairable&&classification.unknown===0&&!historyTruncated&&!planning;
   const baseline285=!sourceHeld&&!historyTruncated&&!planning?await baselineProjection285(target):null;check();
   if(baseline285)classification.repairable=classification.missing.length===1&&!classification.manualPutHeld;
   classification.repairable=classification.repairable&&target.activeUnattempted===0;
   // Whole-scan rows are observations only. A deliberate per-row Review reads
   // this exact member and issues a new original token, never extends an old one.
   const previewIssuedAt=singleSubject&&classification.repairable?now():null;
   const previewExpiresAt=previewIssuedAt===null?null:Math.min(previewIssuedAt+PREVIEW_SECONDS,original.e,projection.deadline??0);
   const preview=previewIssuedAt!==null?await seal(env.COOKIE_SECRET,binding+'|preview',{subject:member.id,issuedAt:previewIssuedAt,expiresAt:previewExpiresAt!,snapshot:snapshot!.id,snapshotAt:snapshot!.exported_at,expected:projection.expected!,factsDigest:await digest(target),observedRoles:[...classification.actual].sort(),baselineFindingId:baseline285?.receiptId??null} satisfies Preview):null;check();
   rows.push({id:member.id,username:member.username,displayName:member.displayName,discordJoinedAt:member.joinedAt,discordJoinProvenance:'Discord joined_at; not native guild join time',
    bot:false,pending:false,...classification,...projection,activationRequired:planning,maxPlannedEffects:2,
    baselineGrantOnly:!!baseline285,baselineFindingId:baseline285?.receiptId??null,blockingUnknown:baseline285?0:classification.unknown,activeUnattempted:target.activeUnattempted,
    characters:JSON.parse(target.characters),historyWithheld:false,historyTruncated,
    retainedReceiptCount:Math.min(target.receiptCount,HISTORY_LIMIT),retainedCharacterCount:Math.min(target.characterCount,CHARACTER_LIMIT),
    firstObservedProvenance:'Legacy name-only roster observation; not current character/GUID episode, native guild join time or a grace clock',previewToken:preview,previewIssuedAt,previewExpiresAt,
    confirmReserveSeconds:CONFIRM_RESERVE_SECONDS,confirmBy:previewExpiresAt===null?null:previewExpiresAt-CONFIRM_RESERVE_SECONDS});
  }
  const nextCursor=singleSubject||page.complete?null:await seal(env.COOKIE_SECRET,cursorBinding,{issuedAt:cursor.issuedAt as number,expiresAt:cursor.expiresAt as number,after:last,page:(cursor.page as number)+1,...(focused?{snapshotId:cursor.snapshotId,snapshotAt:cursor.snapshotAt}:{})} satisfies Cursor);check();
  const final=await read([env.DB.prepare(targetsSQL284()).bind(JSON.stringify(page.members.map(m=>m.id)),env.GUILD_ID,JSON.stringify(ROLE_BASELINE_FAMILY_IDS285),baselineActors285),env.DB.prepare(SNAPSHOT),env.DB.prepare(DENOMINATOR)]);check();
  const finalTargets=final[0]!.results as Facts[],finalSnapshot=final[1]?.results[0] as Snapshot|undefined;
  if(JSON.stringify(finalSnapshot??null)!==JSON.stringify(snapshot??null))throw new Held('roster_changed_during_page');
  if(JSON.stringify(finalTargets)!==JSON.stringify(targets))throw new Held('target_changed_during_page');
  if(singleSubject&&rows.length===0)return apiJson({rows:[],counts:{subjects:0,unavailable:1},nextCursor:null,automaticApply:false,
   coverage:{scope:'single_discord_member_read',complete:false,singleMemberReadComplete:true,atomicSnapshot:false,convergenceConfirmed:false}});
  const counts={subjects:rows.length,missing:rows.filter(r=>r.missing.length).length,extraOwned:rows.filter(r=>r.extraOwned.length).length,extraUnowned:rows.filter(r=>r.extraUnowned.length).length,
   review:rows.filter(r=>r.review).length,unknown:rows.filter(r=>r.unknown>0).length,historyWithheld:withheld.privacy,withheldCandidates:withheld.privacy+withheld.membershipScreening+withheld.bots,sourceHeld:rows.filter(r=>r.sourceHeld).length,repairable:rows.filter(r=>r.repairable).length};
  const returnedCounts=singleSubject?{subjects:counts.subjects,missing:counts.missing,extraOwned:counts.extraOwned,extraUnowned:counts.extraUnowned,review:counts.review,unknown:counts.unknown,sourceHeld:counts.sourceHeld,repairable:counts.repairable,unavailable:0}:counts;
  return apiJson({guildId:env.GUILD_ID,generatedAt:now(),source:snapshot??null,managedRoles:canonical.policy.ranks,rows,counts:returnedCounts,...(singleSubject?{}:{withheld}),nextCursor,comparisonScope:scope,
   view:planning?'steward-v3':'active',activationRequired:planning,activePolicy:{version:canonical.policy.version,profile:canonical.policy.profile},proposedPolicy:proposed?{version:proposed.version,profile:proposed.profile}:null,
   coverage:{scope:singleSubject?'single_discord_member_read':focused?'one_linked_account_page':'one_discord_inventory_page',complete:singleSubject?false:page.complete,singleMemberReadComplete:!!singleSubject,atomicSnapshot:false,providerRowsFetched:singleSubject?null:providerRowsFetched,providerRowsProcessed:singleSubject?null:processedCount,providerRequests,linkedUnavailable:unavailableLinked,observedOnly:singleSubject?null:observedOnly,returned:rows.length,traversalExpiresAt:singleSubject?null:cursor.expiresAt,
    nativeLinkedCandidateSubjects:singleSubject?null:(final[2]?.results[0] as {subjects:number}|undefined)?.subjects??null,nativeLinkedAccountsAbsentFromDiscord:focused?'selected_accounts_individually_read_no_removal_inferred':'not_individually_checked',convergenceConfirmed:false,
    note:focused?'Only the selected linked-account scope was compared. Roster names and Verify button presses alone prove no Discord identity. Unavailable linked accounts are counts only; no absence, erasure or removal is inferred. Use the optional whole-server inventory to inspect unlinked role holders. Other roles and appointments are preserved.':'Includes unlinked role holders present in Discord. The separate native-linked candidate count is not an overlap or absence proof. Absent accounts were not individually checked; no removal is inferred. Other Discord roles and website appointments are preserved.'},
   custodyMeaning:'Extra-owned means an acknowledged grant receipt was found. Only the existing writer can authorize its removal.',automaticApply:false});
 }catch(error){
  // An actor who lost admission receives no subject/result details. Entering
  // the writer is enough to make an interrupted response outcome uncertain.
  if(writerEntered)return apiJson({error:'repair_outcome_unconfirmed',outcome:'roles_may_have_changed',automaticRetry:false,maxPlannedEffects:2},error instanceof Held?error.status:503);
  if(error instanceof Held)return apiJson({error:error.code,coverage:{complete:false,gap:error.code},automaticRetry:false,...(request.method==='POST'?{outcome:'not_started',roleChangeSent:false}:{})},error.status);
  const status=error instanceof DiscordError?error.status:503;
  const gap=status===403?'discord_forbidden_members_intent_or_permissions':status===429?'discord_rate_limited':'provider_or_admission_unavailable';
  return apiJson({error:'role_audit_unavailable',coverage:{complete:false,gap},automaticRetry:false,...(request.method==='POST'?{outcome:'not_started',roleChangeSent:false}:{})},status===403?403:status===429?429:503);
 }
}
