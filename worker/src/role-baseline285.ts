/** An attended NEW grant-only starting point. This records neither the outcome
 * of an old HTTP request nor its cancellation. Old receipts stay byte-for-byte
 * unchanged and historically uncertain. Existing roles remain manual custody.
 * The private capability can exempt one exact old row only from a NEW canonical
 * PUT's physical barrier; it supplies no Native identity, grant or DELETE power. */
import type {Env} from './env';
import {now} from './db';
import {DB_NOW,snapshotDataFields,snapshotDataArray} from './account-generation-contracts';
import {rest,DiscordError} from './discord';
import {apiJson,b64u,isSiteAdmin,siteAdmins,originalUserSession,PAGE_VERSION,sameOrigin,type SiteUser} from './site-core';
import {admittedReadAs,FENCE_REFUSED,type CommunitySubject} from './community-context';
import {consumeRateLimit280,rateLimitHeaders280} from './soft-rate-limit280';
import {privacyProviderCustodyDatabase,privacyBoundSiteRoleActionEnv,privacyGenerationExpressionFenceSql,privacyAccountIncarnation,PRIVACY_YEAR,PrivacySiteRequestHeld} from './privacy-serving-authority';
import {PrivacyWriteAdmissionHeld} from './privacy-write-admission';
import {OriginalSchemaPlanHeld} from './privacy-schema-source-plan';
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {ADMISSION_REASONS,heldCause,isHeldCause} from './log';
import {captureRoutineMembership232,closeRoutineMembership232,routineMembership232Facts,routineMembership232Predicate,assertRoutineMembership232,type RoutineMembership232} from './routine-membership-authority232';
import {captureCanonicalRankConfig233,captureCanonicalEntitlements233,CANONICAL_MANAGED_ROLE_IDS233,CANONICAL_PROFILE233,CANONICAL_GUILD233,highestCanonicalRank233} from './canonical-ranks233';
import {NATIVE_RANK_PROFILE232,NATIVE_RANK_NAMES232,SHARED_MEMBER232,NATIVE_STAFF232,historicalNativeRankPolicy232} from './native-rank-reconciliation232';
import {nativeRankSchemeForCanonical} from './native-rank-schemes';
import {canonicalRankWitnessMatches280} from './canonical-native-authority280';

export const ROLE_BASELINE_ACTION285='role.baseline285_adopted';
export const ROLE_BASELINE_MIN_AGE285=86400;
const PURPOSE='olympus-role-grant-baseline285-v1',FINDING_PAGE=8,PREVIEW_SECONDS=300;
const FIELDS=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','reason','claim_nonce','subject_generation','request_digest','roster_id','native_guid','native_profile','native_rank','native_rank_name','attempts','created_at','expires_at','checked_at'] as const;
type Scalar=string|number|null;
type Old=Readonly<Record<typeof FIELDS[number],Scalar>>;
type AuditRow=Readonly<{id:number;ts:number;actor:string;subject:string;details:string;actorCurrent:number}>;
type State=Readonly<{at:number;generation:string|null;revision:number|null;targetCurrent:number;oldCount:number;activeClaims:number;old:readonly Old[];findings:readonly AuditRow[];nextAuditId:number}>;
type Payload=Readonly<{receiptId:number;nonce:string;subject:string;generation:string|null;actor:string;actorGeneration:string|null;actorSessionVersion:number;actorAccountIncarnation:string;guildId:string;policyDigest:string;entitlementsDigest:string;oldId:string;oldTupleDigest:string;observedRoles:readonly string[];snapshotId:number;snapshotAt:number;expectedRole:string;adoptedAt:number;expiresAt:number;grantOnly:true;manualExistingRoles:true;historicalUnknown:true}>;
type Preview=Readonly<{nonce:string;subject:string;generation:string|null;revision:number|null;oldTupleDigest:string;observedRoles:readonly string[];snapshotId:number;snapshotAt:number;expectedRole:string;issuedAt:number;expiresAt:number}>;
export type RoleGrantBaseline285=Readonly<{kind:'original_signed_grant_baseline285'}>;
export type RoleGrantBaselineFacts285=Readonly<{receiptId:number;oldId:string;oldTupleDigest:string;subject:string;generation:string|null;adoptedAt:number;expiresAt:number;manualExistingRoles:true;historicalUnknown:true;grantOnly:true}>;
type Config=ReturnType<typeof captureConfig>;
type Record285={env:Env;config:Config;db:D1Database;payload:Payload;old:Old;audit:AuditRow;facts:RoleGrantBaselineFacts285;check:()=>void};
const originals=new WeakMap<RoleGrantBaseline285,Record285>();
const ID=/^[1-9][0-9]{16,19}$/,HEX32=/^[0-9a-f]{32}$/,HEX64=/^[0-9a-f]{64}$/,GUID=/^Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}$/;
const FAMILY=Object.freeze([...new Set([...CANONICAL_MANAGED_ROLE_IDS233,SHARED_MEMBER232,...Object.values(NATIVE_STAFF232)])]);
export const ROLE_BASELINE_FAMILY_IDS285=FAMILY;
const FAMILY_JSON=JSON.stringify(FAMILY);
const RELATED_PURPOSES="'verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank','fresh_roster_rank','staff_roster_rank','canonical_migration233','canonical_migration_remove233','canonical_migration_compensation233'";
const json=JSON.stringify.bind(JSON),parse=JSON.parse.bind(JSON),encoder=new TextEncoder(),encode=encoder.encode.bind(encoder),subtle=crypto.subtle;
const importKey=subtle.importKey.bind(subtle),sign=subtle.sign.bind(subtle),verify=subtle.verify.bind(subtle),digest=subtle.digest.bind(subtle),encrypt=subtle.encrypt.bind(subtle),decrypt=subtle.decrypt.bind(subtle),random=crypto.getRandomValues.bind(crypto);
class Held extends Error{constructor(readonly code:string,readonly status=409){super(code);}}
const held=():never=>{throw new Held('baseline_unavailable');};
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v)&&BigInt(v)<=18446744073709551615n;
const generation=(v:unknown):v is string|null=>v===null||typeof v==='string'&&HEX32.test(v);
const hex=(bytes:ArrayBuffer|Uint8Array)=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const hash=async(value:string)=>hex(await digest('SHA-256',encode(value)));
const nonce=()=>hex(random(new Uint8Array(16)));
const own=(o:object,k:string)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;};
const sameSlot=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined)=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
function captureConfig(env:Env){
 const keys=['DB','GUILD_ID','COOKIE_SECRET','SITE_ADMINS','BLOCKING_ROLE_IDS'] as const,proto=Object.getPrototypeOf(env),slots=keys.map(k=>Object.getOwnPropertyDescriptor(env,k));
 if(slots.slice(0,4).some(s=>!s||!Object.hasOwn(s,'value'))||slots[4]&&!Object.hasOwn(slots[4],'value')||!slots[4]&&'BLOCKING_ROLE_IDS'in env)return held();
 const secret=own(env,'COOKIE_SECRET'),guild=own(env,'GUILD_ID'),admins=own(env,'SITE_ADMINS'),db=own(env,'DB') as D1Database;
 const canonical=captureCanonicalRankConfig233(env),entitlements=captureCanonicalEntitlements233(env);
 if(typeof secret!=='string'||!secret.length||guild!==CANONICAL_GUILD233||typeof admins!=='string'||canonical.mode!=='enabled'||!canonical.policy||entitlements.mode==='held')return held();
 const actorIds=[...siteAdmins(env)].sort();if(!actorIds.length||actorIds.length>64)return held();
 const blocking=slots[4]?.value??'';if(typeof blocking!=='string')return held();const blockingRoles=blocking.split(',').map(v=>v.trim()).filter(Boolean);if(blockingRoles.length>100||blockingRoles.some(v=>!validId(v)))return held();
 const check=()=>{if(Object.getPrototypeOf(env)!==proto||keys.some((k,i)=>!sameSlot(slots[i],Object.getOwnPropertyDescriptor(env,k))||slots[i]===undefined&&k in env)||!canonical.current()||!entitlements.current())return held();};check();
 return Object.freeze({secret,guild,admins,actorIds:Object.freeze(actorIds),blockingRoles:Object.freeze(blockingRoles),db,canonical,entitlements,check});
}
const related=(alias:string,subject:string,guild:string,family:string)=>`${alias}.subject=${subject} AND ${alias}.guild_id=${guild} AND (${alias}.role_id IN(SELECT value FROM json_each(${family})) OR ${alias}.purpose IN(${RELATED_PURPOSES}))`;
/** Closed informational scope shared with the audit. SQL text is not an issuer,
 * signature, receipt classifier or permission to exempt any operation. */
export function roleBaselineRelatedSql285(alias:string,subject:string,guild:string,family:string):string{
 const expression=/^(?:\?[1-9][0-9]{0,2}|[a-z][a-z0-9_]{0,30}\.[a-z][a-z0-9_]{0,30})$/;
 if(!/^[a-z][a-z0-9_]{0,30}$/.test(alias)||![subject,guild,family].every(v=>expression.test(v)))return held();return related(alias,subject,guild,family);
}
const noPrivacyJob=(id:string)=>`NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=${id} AND j.state<>'complete' AND j.state IN('waiting_role','held','erasing'))`;
const currentTarget=(id:string,g:string)=>`(${privacyGenerationExpressionFenceSql(id,g)} AND ${noPrivacyJob(id)} AND NOT EXISTS(SELECT 1 FROM members m WHERE m.discord_id=${id} AND m.banned=1) AND NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=${id} AND u.denied=1) AND NOT EXISTS(SELECT 1 FROM rename_holds h WHERE h.discord_id=${id} AND h.state='reapply'))`;
// The owner's durable decision follows the adopter's account and continuing
// access, not an ordinary logout. Original preview/action sessions remain
// fenced separately by admittedReadAs and the Native predicate.
const actorCurrent=(actor:string,g:string,n:string)=>`(${currentTarget(actor,g)} AND EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=${actor} AND u.account_incarnation=${n} AND u.denied=0 AND u.in_server=1))`;
/** Informational only: include the exact adopter standing in both audit fact
 * snapshots. This SQL text does not verify a signature or issue a capability. */
export function roleBaselineAuditActorCurrentSql285(alias:string):string{
 if(!/^[a-z][a-z0-9_]{0,30}$/.test(alias))return held();
 return `CASE WHEN json_valid(${alias}.details) THEN ${actorCurrent(alias+'.actor',`json_extract(${alias}.details,'$.payload.actorGeneration')`,`json_extract(${alias}.details,'$.payload.actorAccountIncarnation')`)} ELSE 0 END`;
}
/** Bound the candidate page, not the lifetime number of decisions. This is
 * informational filtering only; every returned record still needs its HMAC,
 * complete immutable old tuple, policy and current standing verified. */
export function roleBaselineRelevantFindingSql285(alias:string,subject:string,g:string,guild:string,family:string):string{
 const expression=/^(?:\?[1-9][0-9]{0,2}|[a-z][a-z0-9_]{0,30}\.[a-z][a-z0-9_]{0,30})$/;
 if(!/^[a-z][a-z0-9_]{0,30}$/.test(alias)||![subject,g,guild,family].every(v=>expression.test(v)))return held();
 return `(CASE WHEN json_valid(${alias}.details) THEN json_extract(${alias}.details,'$.payload.subject')=${subject} AND json_extract(${alias}.details,'$.payload.generation') IS ${g} AND json_extract(${alias}.details,'$.payload.oldId') IN(SELECT baseline_old285.id FROM role_settlements baseline_old285 WHERE ${related('baseline_old285',subject,guild,family)} AND baseline_old285.subject_generation IS ${g} AND baseline_old285.attempts=1 AND baseline_old285.state IN('dispatching','unknown')) ELSE 0 END)`;
}
const subjectEntitlementsDigest=async(config:Config,subject:string,g:string|null)=>hash(json({kind:'effective-subject-entitlements285-v1',guildId:config.guild,subject,generation:g,entries:config.entitlements.manifest?.entries.filter(e=>e.subject===subject&&e.generation===g).map(e=>e.roleKey)??[]}));
// The imported retention constant participates in the serving module cycle.
// Read it only after entry initialization, retaining the same one-year fence.
const READ=()=>`SELECT ${DB_NOW} AS at,p.generation,p.revision,
 ${currentTarget('?1','p.generation')} AS targetCurrent,
 (SELECT COUNT(*) FROM role_settlements r WHERE ${related('r','?1','?2','?3')} AND r.attempts=1 AND r.state IN('dispatching','unknown')) AS oldCount,
 (SELECT COUNT(*) FROM role_settlements r WHERE ${related('r','?1','?2','?3')} AND r.attempts=0 AND r.state IN('pending','dispatching') AND r.expires_at>${DB_NOW}) AS activeClaims,
 COALESCE((SELECT json_group_array(json_array(${FIELDS.map(k=>'r.'+k).join(',')})) FROM(SELECT ${FIELDS.join(',')} FROM role_settlements r WHERE ${related('r','?1','?2','?3')} AND r.attempts=1 AND r.state IN('dispatching','unknown') ORDER BY r.id LIMIT 2)r),'[]') AS oldJSON,
 COALESCE((SELECT json_group_array(json_object('id',a.id,'ts',a.ts,'actor',a.actor,'subject',a.subject,'details',a.details,'actorCurrent',${roleBaselineAuditActorCurrentSql285('a')})) FROM(SELECT a.id,a.ts,a.actor,a.subject,a.details FROM audit a WHERE a.action='${ROLE_BASELINE_ACTION285}' AND a.actor IN(SELECT value FROM json_each(?4)) AND a.subject=?1 AND a.ts>${DB_NOW}-${PRIVACY_YEAR} AND ${roleBaselineRelevantFindingSql285('a','?1','p.generation','?2','?3')} ORDER BY a.ts DESC,a.id DESC LIMIT ${FINDING_PAGE})a),'[]') AS findingsJSON,
 (SELECT COALESCE(MAX(id),0)+1 FROM audit) AS nextAuditId
 FROM(SELECT 1)one LEFT JOIN privacy_subjects p ON p.subject_id=?1`;
function oldFromTuple(input:unknown):Old{
 const tuple=snapshotDataArray(input,FIELDS.length,'baseline_old_tuple');if(tuple.length!==FIELDS.length||tuple.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'))return held();
 return Object.freeze(Object.fromEntries(FIELDS.map((k,i)=>[k,tuple[i]]))) as Old;
}
const tuple=(old:Old):readonly Scalar[]=>Object.freeze(FIELDS.map(k=>old[k]));
function eligible(old:Old,subject:string,g:string|null,at:number):boolean{
 if(old.subject!==subject||old.subject_generation!==g||old.guild_id!==CANONICAL_GUILD233||!validId(old.role_id)||!FAMILY.includes(old.role_id)||typeof old.id!=='string'||!HEX32.test(old.id)||old.proof_id!==null||old.attempts!==1||!['dispatching','unknown'].includes(String(old.state))||typeof old.claim_nonce!=='string'||!HEX32.test(old.claim_nonce)||typeof old.native_guid!=='string'||!GUID.test(old.native_guid)||!integer(old.created_at,1)||!integer(old.expires_at,1)||old.expires_at<=old.created_at||old.expires_at>old.created_at+300||old.created_at>at-ROLE_BASELINE_MIN_AGE285||old.expires_at>at||typeof old.reason!=='string'||encode(old.reason).length>4096||old.checked_at!==null&&(!integer(old.checked_at,1)||old.checked_at<old.created_at||old.checked_at>at)||old.roster_id!==null&&!integer(old.roster_id,1)||old.desired!==0&&old.desired!==1)return false;
 if(typeof old.request_digest!=='string'||!(old.desired===0?HEX32:HEX64).test(old.request_digest))return false;
 if(old.purpose==='launch_membership230')return old.native_profile==='prime-native-230'&&old.role_id===SHARED_MEMBER232&&old.desired===1&&old.native_rank===null&&old.native_rank_name===null;
 const ordinary=['launch_routine_membership232','fresh_roster_rank','staff_roster_rank'].includes(String(old.purpose))&&old.native_profile===NATIVE_RANK_PROFILE232;
 const canonical=['canonical_consumed233','canonical_routine233'].includes(String(old.purpose))&&typeof old.native_profile==='string'&&(old.native_profile===CANONICAL_PROFILE233||!!nativeRankSchemeForCanonical(old.native_profile))&&(old.purpose!=='canonical_consumed233'||old.desired===1);
 if(!ordinary&&!canonical||!integer(old.native_rank)||old.native_rank>9)return false;
 const names=typeof old.native_profile==='string'?nativeRankSchemeForCanonical(old.native_profile)?.names??NATIVE_RANK_NAMES232:NATIVE_RANK_NAMES232;
 if(old.native_rank_name!==names[old.native_rank])return false;
 if(ordinary){const policy=historicalNativeRankPolicy232();return old.purpose==='launch_routine_membership232'?old.role_id===SHARED_MEMBER232:old.purpose==='staff_roster_rank'?Object.values(NATIVE_STAFF232).some(id=>id===old.role_id):policy.ranks.some(r=>r.roleId===old.role_id);}
 return true;
}
type BaselineReadStep285='config-before'|'prepare'|'bind'|'first'|'config-after'|'own-fields'|'old-json'|'old-rows'|'old-tuple'|'findings-json'|'findings-rows'|'finding-fields';
async function readState(db:D1Database,config:Config,subject:string,native?:Readonly<{sql:string;values:readonly Scalar[]}>,progress?:(step:BaselineReadStep285)=>void):Promise<State>{
 progress?.('config-before');config.check();
 progress?.('prepare');const statement=db.prepare(READ()+(native?' WHERE ('+native.sql+')':''));
 progress?.('bind');const bound=statement.bind(subject,config.guild,FAMILY_JSON,json(config.actorIds),...(native?native.values:[]));
 progress?.('first');const raw=await bound.first();
 progress?.('config-after');config.check();if(!raw)return held();
 progress?.('own-fields');
 const r=snapshotDataFields(raw,['at','generation','revision','targetCurrent','oldCount','activeClaims','oldJSON','findingsJSON','nextAuditId'],'baseline_read');
 if(!integer(r.at,1)||!generation(r.generation)||r.revision!==null&&!integer(r.revision)||r.targetCurrent!==0&&r.targetCurrent!==1||!integer(r.oldCount)||!integer(r.activeClaims)||typeof r.oldJSON!=='string'||typeof r.findingsJSON!=='string'||!integer(r.nextAuditId,1))return held();
 progress?.('old-json');const oldInput=parse(r.oldJSON);
 progress?.('old-rows');const oldRows=snapshotDataArray(oldInput,2,'baseline_old_rows');
 const old=oldRows.map(input=>{progress?.('old-tuple');return oldFromTuple(input);});
 progress?.('findings-json');const findingInput=parse(r.findingsJSON);
 progress?.('findings-rows');const findings=snapshotDataArray(findingInput,FINDING_PAGE,'baseline_findings').map(input=>{
  progress?.('finding-fields');
  const a=snapshotDataFields(input,['id','ts','actor','subject','details','actorCurrent'],'baseline_finding');
  if(!integer(a.id,1)||!integer(a.ts,1)||!validId(a.actor)||a.subject!==subject||typeof a.details!=='string'||encode(a.details).length>24000||a.actorCurrent!==0&&a.actorCurrent!==1)return held();return Object.freeze(a) as AuditRow;
 });
 return Object.freeze({at:r.at,generation:r.generation,revision:r.revision as number|null,targetCurrent:Number(r.targetCurrent),oldCount:r.oldCount,activeClaims:r.activeClaims,old:Object.freeze(old),findings:Object.freeze(findings),nextAuditId:r.nextAuditId});
}
const signingKey=(secret:string)=>importKey('raw',encode(PURPOSE+'\0finding\0'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const payloadKeys='receiptId,nonce,subject,generation,actor,actorGeneration,actorSessionVersion,actorAccountIncarnation,guildId,policyDigest,entitlementsDigest,oldId,oldTupleDigest,observedRoles,snapshotId,snapshotAt,expectedRole,adoptedAt,expiresAt,grantOnly,manualExistingRoles,historicalUnknown';
function roles(input:unknown):readonly string[]{const list=snapshotDataArray(input,250,'baseline_roles');if(list.some(v=>!validId(v))||new Set(list).size!==list.length)return held();const sorted=(list as string[]).slice().sort();if(json(sorted)!==json(list))return held();return Object.freeze(sorted);}
async function verifyFinding(config:Config,a:AuditRow,old:Old,state:State):Promise<Payload|null>{
 try{
  if(a.actorCurrent!==1||!config.actorIds.includes(a.actor)||a.ts<=state.at-PRIVACY_YEAR)return null;
  const d=snapshotDataFields(parse(a.details),['version','kind','payload','signature','_privacySubjectIds'],'baseline_details'),p=snapshotDataFields(d.payload,payloadKeys.split(','),'baseline_payload');
  const refs=[...new Set([a.actor,a.subject])];if(d.version!==1||d.kind!==PURPOSE||typeof d.signature!=='string'||!HEX64.test(d.signature)||json(d._privacySubjectIds)!==json(refs)||Object.keys(p).join(',')!==payloadKeys||json({version:d.version,kind:d.kind,payload:p,signature:d.signature,_privacySubjectIds:refs})!==a.details)return null;
  if(p.receiptId!==a.id||p.actor!==a.actor||p.subject!==a.subject||p.subject!==old.subject||p.generation!==state.generation||!generation(p.actorGeneration)||!integer(p.actorSessionVersion,1)||typeof p.actorAccountIncarnation!=='string'||privacyAccountIncarnation(p.actorAccountIncarnation)!==p.actorAccountIncarnation||p.guildId!==config.guild||p.policyDigest!==await hash(config.canonical.raw!)||p.entitlementsDigest!==await subjectEntitlementsDigest(config,p.subject as string,state.generation)||typeof p.nonce!=='string'||!HEX32.test(p.nonce)||p.grantOnly!==true||p.manualExistingRoles!==true||p.historicalUnknown!==true||!integer(p.adoptedAt,1)||p.adoptedAt!==a.ts||p.adoptedAt>state.at||!integer(p.expiresAt,1)||p.expiresAt!==p.adoptedAt+PRIVACY_YEAR||p.expiresAt<=state.at||!integer(p.snapshotId,1)||!integer(p.snapshotAt,1)||p.snapshotAt>p.adoptedAt||p.snapshotAt<=p.adoptedAt-600||!validId(p.expectedRole)||!config.canonical.policy!.ranks.some(r=>r.roleId===p.expectedRole)||typeof p.oldTupleDigest!=='string'||!HEX64.test(p.oldTupleDigest))return null;
  roles(p.observedRoles);if(p.oldId!==old.id||!eligible(old,a.subject,state.generation,state.at)||await hash(json(tuple(old)))!==p.oldTupleDigest)return null;
  const bytes=Uint8Array.from(d.signature.match(/../g)!,x=>parseInt(x,16));if(!await verify('HMAC',await signingKey(config.secret),bytes,encode(json(p))))return null;config.check();return Object.freeze(p) as Payload;
 }catch{return null;}
}
async function fromState(env:Env,config:Config,db:D1Database,state:State,subject:string,g:string|null):Promise<RoleGrantBaseline285|null>{
 if(state.targetCurrent!==1||state.generation!==g||state.oldCount!==1||state.old.length!==1||state.activeClaims!==0||!eligible(state.old[0]!,subject,g,state.at))return null;
 const old=state.old[0]!;
 for(const a of state.findings){const payload=await verifyFinding(config,a,old,state);if(!payload)continue;
  const check=()=>{config.check();if(privacyProviderCustodyDatabase(env)!==db||now()>=payload.expiresAt)return held();};check();
  const facts=Object.freeze({receiptId:a.id,oldId:String(old.id),oldTupleDigest:payload.oldTupleDigest,subject,generation:g,adoptedAt:payload.adoptedAt,expiresAt:payload.expiresAt,manualExistingRoles:true as const,historicalUnknown:true as const,grantOnly:true as const});
  const cap=Object.freeze({kind:'original_signed_grant_baseline285' as const});originals.set(cap,{env,config,db,payload,old,audit:a,facts,check});return cap;
 }return null;
}
export async function captureRoleGrantBaseline285(env:Env,subject:string,g:string|null):Promise<RoleGrantBaseline285|null>{
 try{if(!validId(subject)||!generation(g))return null;const config=captureConfig(env),db=privacyProviderCustodyDatabase(env),state=await readState(db,config,subject);return await fromState(env,config,db,state,subject,g);}catch{return null;}
}
export function roleGrantBaselineFacts285(cap:RoleGrantBaseline285):RoleGrantBaselineFacts285{const r=originals.get(cap);if(!r)return held();r.check();return r.facts;}
/** Embed ONLY inside a new canonical PUT's existing physical-row barrier. All
 * other old rows/claims and every DELETE retain their original predicates. */
export function roleGrantBaselinePredicate285(env:Env,cap:RoleGrantBaseline285,start=1,alias='old'):Readonly<{sql:string;values:readonly Scalar[];next:number;check:()=>void}>{
 const r=originals.get(cap);if(!r||r.env!==env||!integer(start,1)||start>75||!/^[a-z][a-z0-9_]{0,30}$/.test(alias))return held();r.check();
 const p=r.payload,q=(i:number)=>'?'+(start+i),values:readonly Scalar[]=Object.freeze([r.audit.id,r.audit.details,p.actor,p.actorGeneration,p.actorAccountIncarnation,p.subject,p.generation,p.expiresAt,json(tuple(r.old))]);
 const match=FIELDS.map((k,i)=>`${alias}.${k} IS json_extract(${q(8)},'$[${i}]')`).join(' AND ');
 const sql=`(${match} AND ${q(7)}>${DB_NOW} AND EXISTS(SELECT 1 FROM audit a WHERE a.id=${q(0)} AND a.action='${ROLE_BASELINE_ACTION285}' AND a.actor=${q(2)} AND a.subject=${q(5)} AND a.details=${q(1)} AND a.ts>${DB_NOW}-${PRIVACY_YEAR}) AND ${actorCurrent(q(2),q(3),q(4))} AND ${currentTarget(q(5),q(6))})`;
 return Object.freeze({sql,values,next:start+values.length,check:r.check});
}
function decode(raw:string):Uint8Array{if(!/^[A-Za-z0-9_-]+$/.test(raw))return held();const data=Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));if(b64u(data)!==raw)return held();return data;}
const previewKey=async(secret:string)=>importKey('raw',await digest('SHA-256',encode(PURPOSE+'\0preview\0'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
async function seal(config:Config,binding:string,p:Preview):Promise<string>{const iv=random(new Uint8Array(12));return'1.'+b64u(iv)+'.'+b64u(new Uint8Array(await encrypt({name:'AES-GCM',iv,additionalData:encode(binding)},await previewKey(config.secret),encode(json(p)))));}
async function open(config:Config,binding:string,raw:unknown):Promise<Preview>{
 try{if(typeof raw!=='string'||raw.length>32768)return held();const m=/^1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(raw);if(!m)return held();const data=parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(await decrypt({name:'AES-GCM',iv:decode(m[1]!),additionalData:encode(binding)},await previewKey(config.secret),decode(m[2]!))));
  const p=snapshotDataFields(data,['nonce','subject','generation','revision','oldTupleDigest','observedRoles','snapshotId','snapshotAt','expectedRole','issuedAt','expiresAt'],'baseline_preview');
  if(typeof p.nonce!=='string'||!HEX32.test(p.nonce)||!validId(p.subject)||!generation(p.generation)||p.revision!==null&&!integer(p.revision)||typeof p.oldTupleDigest!=='string'||!HEX64.test(p.oldTupleDigest)||!integer(p.snapshotId,1)||!integer(p.snapshotAt,1)||!validId(p.expectedRole)||!integer(p.issuedAt,1)||!integer(p.expiresAt,1)||p.issuedAt>now()||p.expiresAt<=p.issuedAt||p.expiresAt>p.issuedAt+PREVIEW_SECONDS)return held();return Object.freeze({...p,observedRoles:roles(p.observedRoles)}) as Preview;
 }catch{throw new Held('baseline_preview_invalid',400);}
}
async function memberRoles(env:Env,subject:string):Promise<readonly string[]>{
 let raw:unknown;try{raw=await rest<unknown>(env,'GET',`/guilds/${CANONICAL_GUILD233}/members/${subject}`,undefined,1);}catch(e){if(e instanceof DiscordError&&e.status===404)return held();throw e;}
 if(!raw||typeof raw!=='object')return held();const d=raw as {user?:{id?:unknown;bot?:unknown};roles?:unknown;pending?:unknown};
 if(d.user?.id!==subject||d.user.bot===true||d.pending===true||d.user.bot!==undefined&&typeof d.user.bot!=='boolean'||d.pending!==undefined&&typeof d.pending!=='boolean'||!Array.isArray(d.roles))return held();
 return roles(d.roles.slice().sort());
}
function expectedRole(config:Config,cap:RoutineMembership232):string{
 const f=routineMembership232Facts(cap);if(f.cause!=='eligible'||!f.primary||!canonicalRankWitnessMatches280(config.canonical.policy,f.canonicalRankProfile,f.rankQualified))return held();
 const extra=config.entitlements.manifest?.entries.filter(e=>e.subject===f.subject&&e.generation===f.subjectGeneration).map(e=>config.canonical.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[];
 return highestCanonicalRank233(config.canonical.policy!,{index:f.primary.index,name:f.primary.rank},extra)?.roleId??held();
}
const summary=(cap:RoleGrantBaseline285)=>({adopted:true,roleChangesSent:0,manualRemovals:true,...roleGrantBaselineFacts285(cap)});
type BaselineStage285='request'|'preview-open'|'actor-admission'|'source-capture'|'action-context'|'action-admission'|'action-source-capture'|'state-read'|'finding-read'|'old-tuple-digest'|'discord-read'|'post-discord-admission'|'native-read'|'preview-seal'|'preview-final-read'|'confirmation-read'|'finding-digests'|'finding-signature'|'finding-append'|'post-append-admission';
const SCHEMA_DIAGNOSTIC_CAUSES285=Object.freeze(['direct_method_accessor','direct_method_drift','direct_method_missing','direct_port','direct_statement','original_bind_accessor','original_bind_limit','original_bind','original_binds','original_named_parameter','original_parameter_count','original_parameter_limit','original_sql_comment','original_sql_nul','original_sql_quote','original_sql','physical_parameter_accessor','physical_parameter_buffer','physical_parameter_bytes','physical_parameter_drift','physical_parameter_limit','physical_parameter_plan_mismatch','physical_parameter_value','physical_parameters','physical_source_bind_drift','physical_sql_limit','physical_sql_plan_mismatch','physical_statement_accessor','physical_statement_drift','physical_statement','source_profile_limit'] as const);
const STATE_DIAGNOSTIC_CAUSES285=Object.freeze(['baseline_read','baseline_old_rows','baseline_old_tuple','baseline_findings','baseline_finding'] as const);
/** Only fixed source-owned classifications leave the catch. Arbitrary message
 * text, accessors and foreign exception metadata are never copied or invoked. */
function baselineFailureDiagnostic285(error:unknown){
 const ownData=(input:unknown,key:string)=>{if(!input||typeof input!=='object')return null;const descriptor=Object.getOwnPropertyDescriptor(input,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;};
 const rawMessage=ownData(error,'message'),message=typeof rawMessage==='string'?rawMessage.slice(0,2048):null;
 const classify=<T extends readonly string[]>(family:'write-admission'|'schema-plan'|'state-data',prefix:string,allowed:T)=>{
  for(let i=0;i<allowed.length;i++){const cause=allowed[i]!;if(message===prefix+cause)return {failure:family,cause};}
  return {failure:family};
 };
 if(error instanceof PrivacyWriteAdmissionHeld)return classify('write-admission','privacy_write_admission_held:',ADMISSION_REASONS);
 if(error instanceof OriginalSchemaPlanHeld)return classify('schema-plan','original_schema_plan_held:',SCHEMA_DIAGNOSTIC_CAUSES285);
 if(error instanceof PrivacySiteRequestHeld)return {failure:'site-admission'};
 if(error instanceof RecoveryFloorHeld)return {failure:'serving-floor'};
 for(let i=0;i<STATE_DIAGNOSTIC_CAUSES285.length;i++)if(message===STATE_DIAGNOSTIC_CAUSES285[i])return classify('state-data','',STATE_DIAGNOSTIC_CAUSES285);
 const rawCause=ownData(ownData(error,'cause'),'message'),causeMessage=typeof rawCause==='string'?rawCause.slice(0,2048):null;
 if(message?.startsWith('D1_')||causeMessage?.startsWith('D1_')){
  const cause=heldCause(Object.freeze({message,cause:Object.freeze({message:causeMessage})}));
  return {failure:'d1-provider',...(isHeldCause(cause)?{cause}:{})};
 }
 return {};
}
export async function handleSiteRoleBaseline285(request:Request,env:Env,admin:SiteUser,body:Record<string,unknown>={}):Promise<Response>{
 let cap:RoutineMembership232|null=null,appendStarted=false;
 let stage:BaselineStage285='request';
 let readStep:BaselineReadStep285|null=null;const readProgress=(step:BaselineReadStep285)=>{readStep=step;};
 try{
  if(!['GET','POST'].includes(request.method))throw new Held('method_not_allowed',405);
  const original=originalUserSession(admin),config=captureConfig(env);if(!isSiteAdmin(env,original.u))throw new Held('baseline_unavailable',403);
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(k=>k!=='subject')||query.getAll('subject').length>1)throw new Held('baseline_request_invalid',400);
  const posting=request.method==='POST',input=posting?snapshotDataFields(body,['subject','previewToken','confirm'],'baseline_body'):null;
  if(posting&&(query.size||!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION||input!.confirm!==true)||!posting&&Object.keys(body).length)throw new Held('baseline_request_invalid',400);
  const subject=posting?input!.subject:query.get('subject');if(!validId(subject))throw new Held('baseline_request_invalid',400);
  const limits=consumeRateLimit280('role-baseline285:'+request.method+':'+original.u,posting?5:30,60);if(limits.limited)return apiJson({error:'slow_down',roleChangesSent:0},429,rateLimitHeaders280(limits));
  const binding=json([PURPOSE,config.guild,original.u,original.v,original.e,original.g,original.n,config.canonical.raw,config.entitlements.raw]);
  stage='preview-open';const preview=posting?await open(config,binding,input!.previewToken):null;
  if(preview&&preview.subject!==subject)throw new Held('baseline_preview_invalid',400);
  const actor:CommunitySubject=Object.freeze({discordId:original.u,sessionVersion:original.v,expiresAt:original.e,privacyGeneration:original.g,accountIncarnation:original.n,originalSession:original});
  const check=()=>{config.check();if(originalUserSession(admin)!==original||!isSiteAdmin(env,original.u))return held();};check();
  let selection;
  if(preview)selection={subject,snapshotId:preview.snapshotId,snapshotAt:preview.snapshotAt,expectedRole:preview.expectedRole,expiresAt:preview.expiresAt};
  else{
   // The ordinary issuer first determines the real source/expected rank. A
   // selected attended capture then retains the original actor in every final
   // Native predicate. A targetless role-action context never mints a cap.
   stage='actor-admission';const admitted=await admittedReadAs(env,actor,'applicantWrite',[]);check();if(admitted===FENCE_REFUSED)return held();
   stage='source-capture';cap=await captureRoutineMembership232(env,subject);check();if(!cap)return held();const first=routineMembership232Facts(cap);
   selection={subject,snapshotId:first.snapshotId,snapshotAt:first.snapshotExportedAt,expectedRole:expectedRole(config,cap),expiresAt:Math.min(first.deadline,original.e)};
   closeRoutineMembership232(cap);cap=null;
  }
  stage='action-context';const actionEnv=privacyBoundSiteRoleActionEnv(env,original,selection);
  const read=async()=>{check();const result=await admittedReadAs(actionEnv,actor,'applicantWrite',[]);check();if(result===FENCE_REFUSED)return held();};
  stage='action-admission';await read();stage='action-source-capture';cap=await captureRoutineMembership232(actionEnv,subject);check();if(!cap)return held();
  const f=routineMembership232Facts(cap),wanted=expectedRole(config,cap),db=privacyProviderCustodyDatabase(actionEnv);
  stage='state-read';let state=await readState(db,config,subject,undefined,readProgress);readStep=null;check();
  if(state.targetCurrent!==1||state.generation!==f.subjectGeneration)return held();
  stage='finding-read';const existing=await fromState(actionEnv,config,db,state,subject,f.subjectGeneration);check();
  const alreadyAdopted=existing&&(!preview||originals.get(existing)!.payload.nonce===preview.nonce);
  if(state.oldCount!==1||state.old.length!==1||state.activeClaims!==0||!eligible(state.old[0]!,subject,f.subjectGeneration,state.at))return held();
  stage='old-tuple-digest';const old=state.old[0]!,oldDigest=await hash(json(tuple(old)));check();
  if(preview&&(preview.expiresAt<=now()||preview.generation!==state.generation||preview.revision!==state.revision||preview.oldTupleDigest!==oldDigest||preview.snapshotId!==f.snapshotId||preview.snapshotAt!==f.snapshotExportedAt||preview.expectedRole!==wanted))throw new Held('baseline_preview_changed');
  stage='discord-read';const observedRoles=await memberRoles(actionEnv,subject);check();stage='post-discord-admission';await read();assertRoutineMembership232(actionEnv,cap);
  if(observedRoles.some(r=>config.blockingRoles.includes(r)))return held();
  stage='native-read';const nativeRead=routineMembership232Predicate(actionEnv,cap,5,true);
  const afterProvider=await readState(db,config,subject,nativeRead,readProgress);readStep=null;check();assertRoutineMembership232(actionEnv,cap);
  if(afterProvider.targetCurrent!==1||afterProvider.generation!==state.generation||afterProvider.revision!==state.revision||afterProvider.oldCount!==1||afterProvider.old.length!==1||afterProvider.activeClaims!==0||json(tuple(afterProvider.old[0]!))!==json(tuple(old)))return held();state=afterProvider;
  if(alreadyAdopted){const original=originals.get(existing!)!;if(!state.findings.some(a=>a.id===original.audit.id&&a.details===original.audit.details&&a.actorCurrent===1))return held();return apiJson({...summary(existing!),alreadyAdopted:true});}
  if(!posting){
   const at=now(),p=Object.freeze({nonce:nonce(),subject,generation:state.generation,revision:state.revision,oldTupleDigest:oldDigest,observedRoles,snapshotId:f.snapshotId,snapshotAt:f.snapshotExportedAt,expectedRole:wanted,issuedAt:at,expiresAt:Math.min(at+PREVIEW_SECONDS,f.deadline,original.e)}) satisfies Preview;
   stage='preview-seal';const previewToken=await seal(config,binding,p);check();assertRoutineMembership232(actionEnv,cap);
   stage='preview-final-read';const final=await readState(db,config,subject,nativeRead,readProgress);readStep=null;check();assertRoutineMembership232(actionEnv,cap);
   if(final.targetCurrent!==1||final.generation!==state.generation||final.revision!==state.revision||final.oldCount!==1||final.old.length!==1||final.activeClaims!==0||json(tuple(final.old[0]!))!==json(tuple(old))||p.expiresAt<=now())return held();
   return apiJson({previewToken,expiresAt:p.expiresAt,roleChangesSent:0,observedRoles,receipt:{id:old.id,roleId:old.role_id,desired:old.desired,createdAt:old.created_at},expectedRole:wanted,snapshotId:f.snapshotId,snapshotAt:f.snapshotExportedAt,manualRemovals:true,historicalUnknown:true,meaning:'A new grant-only starting point. This cannot determine or cancel the old request; existing roles stay manual.'});
  }
  if(json(observedRoles)!==json(preview!.observedRoles))throw new Held('baseline_preview_changed');
  stage='confirmation-read';state=await readState(db,config,subject,undefined,readProgress);readStep=null;check();assertRoutineMembership232(actionEnv,cap);
  if(state.targetCurrent!==1||state.generation!==preview!.generation||state.revision!==preview!.revision||state.oldCount!==1||state.old.length!==1||state.activeClaims!==0||json(tuple(state.old[0]!))!==json(tuple(old))||!eligible(old,subject,state.generation,state.at)||preview!.expiresAt<=now())throw new Held('baseline_preview_changed');
  stage='finding-digests';const payload=Object.freeze({receiptId:state.nextAuditId,nonce:preview!.nonce,subject,generation:state.generation,actor:original.u,actorGeneration:original.g,actorSessionVersion:original.v,actorAccountIncarnation:original.n,guildId:config.guild,policyDigest:await hash(config.canonical.raw!),entitlementsDigest:await subjectEntitlementsDigest(config,subject,state.generation),oldId:String(old.id),oldTupleDigest:oldDigest,observedRoles:observedRoles.filter(r=>FAMILY.includes(r)),snapshotId:f.snapshotId,snapshotAt:f.snapshotExportedAt,expectedRole:wanted,adoptedAt:state.at,expiresAt:state.at+PRIVACY_YEAR,grantOnly:true,manualExistingRoles:true,historicalUnknown:true}) satisfies Payload;
  stage='finding-signature';const signature=hex(await sign('HMAC',await signingKey(config.secret),encode(json(payload)))),refs=[...new Set([original.u,subject])],details=json({version:1,kind:PURPOSE,payload,signature,_privacySubjectIds:refs});
  const values:Scalar[]=[payload.receiptId,payload.adoptedAt,original.u,subject,details,json(tuple(old)),FAMILY_JSON,state.generation,preview!.nonce];
  const native=routineMembership232Predicate(actionEnv,cap,values.length+1,true);values.push(...native.values);
  const match=FIELDS.map((k,i)=>`r.${k} IS json_extract(?6,'$[${i}]')`).join(' AND '),family=related('r','?4',"'"+config.guild+"'",'?7');
  const sql=`INSERT INTO audit(id,ts,actor,action,subject,details) SELECT ?1,?2,?3,'${ROLE_BASELINE_ACTION285}',?4,?5 WHERE ?1=(SELECT COALESCE(MAX(id),0)+1 FROM audit)
   AND (${native.sql}) AND ${currentTarget('?4','?8')}
   AND EXISTS(SELECT 1 FROM role_settlements r WHERE ${match} AND r.created_at<=${DB_NOW}-${ROLE_BASELINE_MIN_AGE285} AND r.expires_at<=${DB_NOW})
   AND (SELECT COUNT(*) FROM role_settlements r WHERE ${family} AND r.attempts=1 AND r.state IN('dispatching','unknown'))=1
   AND NOT EXISTS(SELECT 1 FROM role_settlements r WHERE ${family} AND r.attempts=0 AND r.state IN('pending','dispatching') AND r.expires_at>${DB_NOW})
   AND NOT EXISTS(SELECT 1 FROM audit a WHERE a.action='${ROLE_BASELINE_ACTION285}' AND a.actor=?3 AND a.subject=?4 AND CASE WHEN json_valid(a.details) THEN json_extract(a.details,'$.payload.nonce')=?9 ELSE 0 END) RETURNING id`;
  stage='finding-append';check();assertRoutineMembership232(actionEnv,cap);appendStarted=true;const result=await db.prepare(sql).bind(...values).all<{id:number}>();check();
  if(result.success!==true||result.meta.changes!==1||result.results.length!==1||result.results[0]!.id!==payload.receiptId)throw new Held('baseline_append_unconfirmed');
  stage='post-append-admission';await read();return apiJson({adopted:true,roleChangesSent:0,receiptId:payload.receiptId,oldId:old.id,expiresAt:payload.expiresAt,grantOnly:true,manualRemovals:true,historicalUnknown:true,automaticGrant:false});
 }catch(e){
  const status=e instanceof Held?e.status:e instanceof DiscordError?e.status:503;
  const responseStatus=status===429?429:status===400?400:status===403?403:status===405?405:status===409?409:503;
  // Private diagnostics contain only source-owned phases and bounded status
  // metadata. No exception/body is logged; sink failures preserve recovery.
  if(responseStatus===503)try{console.warn('role.baseline285_unavailable',e instanceof DiscordError?{stage,kind:'provider',...(Number.isSafeInteger(status)&&status>=100&&status<=599?{providerStatus:status}:{}),...(readStep?{readStep}:{})}:{stage,kind:'unexpected',...(readStep?{readStep}:{}),...baselineFailureDiagnostic285(e)});}catch{/* Preserve the original response. */}
  return apiJson({error:appendStarted?'baseline_record_outcome_unconfirmed':e instanceof Held?e.code:'baseline_unavailable',roleChangesSent:0,...(appendStarted?{recordOutcome:'unconfirmed',recovery:'Read this account again; no role change or automatic record retry occurred.'}:{})},responseStatus);
 }finally{if(cap)closeRoutineMembership232(cap);}
}
