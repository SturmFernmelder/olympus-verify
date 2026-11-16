/** A NEW attended claim from a historical signed whisper. Live verifiers stay
 * unchanged. No old upload is replayed, no role request or notice is sent. */
import type {Env} from './env';
import {originalWatcherIntake285,LATE_FORWARD_SINCE285,type OriginalWatcherIntake285} from './watcher-late-origin285';
import {ordinaryIntakeShape280} from './tithe-receipt280';
import {now,linksNotBefore} from './db';
import {normalizeCharacter,normalizeCodeInput,ticketFor,ticketNonce,codeFor,isValidCode,dayBucket} from './codes';
import {captureLaunchVerification,captureNativeMembershipProof,type NativeMembershipProof} from './launch-verification227';
import {nativeMembershipSourceMatches} from './native-rank-schemes';
import {apiJson,b64u,isSiteAdmin,originalUserSession,PAGE_VERSION,sameOrigin,type SiteUser} from './site-core';
import {admittedReadAs,FENCE_REFUSED,type CommunitySubject} from './community-context';
import {privacyBoundSiteRoleActionEnv,privacyCaptureFromColumns,admittedPrivacySubjectWrite,privacyGenerationExpressionFenceSql,privacyBoundSubjectEnv} from './privacy-serving-authority';
import {consumeRateLimit280,rateLimitHeaders280} from './soft-rate-limit280';
import {DB_NOW,snapshotDataFields,snapshotDataArray} from './account-generation-contracts';
import {rest,DiscordError} from './discord';
import {NEUTRAL_IDENTITY_PURPOSE280,NEUTRAL_IDENTITY_PROFILE280,NEUTRAL_IDENTITY_REASON280,NEUTRAL_IDENTITY_GUILD280,NEUTRAL_IDENTITY_CARRIER280} from './consumed-identity280';
const PURPOSE='olympus-late-whisper-claim285-v1',MAX_AGE=30*86400,MAX_OBSERVATIONS=32;
const ID=/^[1-9][0-9]{16,19}$/,HEX32=/^[0-9a-f]{32}$/,HEX64=/^[0-9a-f]{64}$/,GUID=/^Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}$/;
const PF=['id','discord_id','name_key','name','created_at','expires_at','consumed_at','consumed_source','nonce'] as const;
type Scalar=string|number|null;
type Pending=Readonly<Record<typeof PF[number],Scalar>&{privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null}>;
type Observation=Readonly<{input:'intake242'|'quarantine'|'new-intake';source:'whisper';character:string;nameKey:string;guid:string;code:string;nativeMembership:NativeMembershipProof}>;
type Evidence=Readonly<{observations:readonly Observation[]}>;
type Envelope=Readonly<{version:285;kind:'late-verification-claim';inventory:Readonly<{currentStateSHA256:string;quarantineSHA256:string}>;observations:readonly Observation[]}>;
type Native=Readonly<{id:number;exported_at:number;source:string;member_count:number;name:string;name_key:string;guid:string}>;
type Plan=Readonly<{pending:Pending;native:Native;subject:string;generation:string|null;revision:number|null;observedAt:number;memberAtObservation:boolean;envelopeDigest:string;pendingDigest:string;inputCount:number;distinctEvidence:number;cutoff:number}>;
type Preview=Readonly<{nonce:string;subject:string;generation:string|null;revision:number|null;requestId:number;pendingDigest:string;envelopeDigest:string;snapshotId:number;snapshotAt:number;snapshotSource:string;observedAt:number;issuedAt:number;expiresAt:number}>;
const encoder=new TextEncoder(),encode=encoder.encode.bind(encoder),subtle=crypto.subtle;
const sign=subtle.sign.bind(subtle),digest=subtle.digest.bind(subtle),importKey=subtle.importKey.bind(subtle),encrypt=subtle.encrypt.bind(subtle),decrypt=subtle.decrypt.bind(subtle);
const json=JSON.stringify.bind(JSON),parse=JSON.parse.bind(JSON),hex=(v:ArrayBuffer)=>[...new Uint8Array(v)].map(n=>n.toString(16).padStart(2,'0')).join('');
const hash=async(v:string)=>hex(await digest('SHA-256',encode(v))),random=()=>hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
class Held extends Error{constructor(readonly code:string,readonly unavailable=false,readonly status=409){super(code);}}
const fail=(code:string,unavailable=false):never=>{throw new Held(code,unavailable);};
const int=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v)&&BigInt(v)<=18446744073709551615n;
const gen=(v:unknown):v is string|null=>v===null||typeof v==='string'&&HEX32.test(v);
const equalHex=(a:string,b:string)=>{let n=a.length^b.length;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return n===0;};
const tuple=(p:Pending)=>[...PF.map(k=>p[k]),p.privacy_generation,p.privacy_revision,p.privacy_state];
const zero={roleChangesSent:0,noticesSent:0,automaticRetry:false,inventoryScope:'submitted-group-only'};
function capture(env:Env){
 const keys=['DB','GUILD_ID','VERIFY_SECRET','COOKIE_SECRET','SITE_ADMINS','VERIFY_MEMBERSHIP_ONLY','VERIFY_NATIVE_SCOPE','LINKS_NOT_BEFORE','BLOCKING_ROLE_IDS','DISCORD_BOT_TOKEN'] as const,proto=Object.getPrototypeOf(env),slots=keys.map(k=>Object.getOwnPropertyDescriptor(env,k));
 if(slots.slice(0,7).some(s=>!s||!Object.hasOwn(s,'value'))||!slots[9]||!Object.hasOwn(slots[9],'value')||slots.some((s,i)=>s?!Object.hasOwn(s,'value'):keys[i]! in env))return fail('configuration_held');
 const launch=captureLaunchVerification(env),secret=env.VERIFY_SECRET,cookie=env.COOKIE_SECRET,cutoff=linksNotBefore(env),block=env.BLOCKING_ROLE_IDS??'';
 if(launch.mode!=='members-only'||!launch.scope||env.GUILD_ID!==NEUTRAL_IDENTITY_GUILD280||typeof secret!=='string'||!secret.length||typeof cookie!=='string'||!cookie.length||typeof env.DISCORD_BOT_TOKEN!=='string'||!env.DISCORD_BOT_TOKEN.length||typeof block!=='string')return fail('configuration_held');
 const blocking=block.split(',').map(x=>x.trim()).filter(Boolean);if(blocking.length>100||blocking.some(x=>!validId(x)))return fail('configuration_held');
 const check=()=>{if(Object.getPrototypeOf(env)!==proto||keys.some((k,i)=>{const d=Object.getOwnPropertyDescriptor(env,k),s=slots[i];return s===undefined?d!==undefined||k in env:!d||!['value','get','set','writable','enumerable','configurable'].every(p=>Object.is(s[p as keyof PropertyDescriptor],d[p as keyof PropertyDescriptor]));})||!launch.current()||linksNotBefore(env)!==cutoff)fail('configuration_changed');};check();
 return Object.freeze({launch,secret,cookie,cutoff,blocking:Object.freeze(blocking),check});
}
function envelope(raw:unknown):Envelope{
 const e=snapshotDataFields(raw,['version','kind','inventory','observations'],'late_envelope');if(e.version!==285||e.kind!=='late-verification-claim')return fail('envelope_invalid');
 const inv=snapshotDataFields(e.inventory,['currentStateSHA256','quarantineSHA256'],'late_inventory');if(typeof inv.currentStateSHA256!=='string'||!HEX64.test(inv.currentStateSHA256)||typeof inv.quarantineSHA256!=='string'||!HEX64.test(inv.quarantineSHA256))return fail('inventory_invalid');
 const rows=snapshotDataArray(e.observations,MAX_OBSERVATIONS,'late_observations');if(!rows.length)return fail('observations_empty');
 const observations=rows.map(raw=>{const r=snapshotDataFields(raw,['input','source','character','guid','code','nativeMembership'],'late_observation');
  if(r.source==='mail')return fail('mail_requires_historical_guid_continuity');
  if(!['intake242','quarantine'].includes(String(r.input))||r.source!=='whisper'||typeof r.character!=='string'||!r.character.trim()||r.character.length>100||/[\x00-\x1f\x7f]/.test(r.character)||typeof r.guid!=='string'||!GUID.test(r.guid)||typeof r.code!=='string'||r.code.length>32)return fail('observation_shape_invalid');
  const nameKey=normalizeCharacter(r.character),code=normalizeCodeInput(r.code),proof=captureNativeMembershipProof(r.nativeMembership);if(!nameKey||!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,7}$/.test(code)||!proof)return fail('signed_observation_required');
  return Object.freeze({input:r.input as Observation['input'],source:'whisper' as const,character:r.character.trim(),nameKey,guid:r.guid,code,nativeMembership:proof});});
 return Object.freeze({version:285,kind:'late-verification-claim',inventory:Object.freeze(inv) as Envelope['inventory'],observations:Object.freeze(observations)});
}
async function verifyObservations(c:ReturnType<typeof capture>,e:Evidence){
 c.check();const scope=c.launch.scope!,scopeHash=(await hash('native-scope|1|'+scope.guild+'|'+scope.realm)).slice(0,16),key=await importKey('raw',encode(c.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);c.check();
 for(const o of e.observations){const p=o.nativeMembership,t=now();if(p.observedAt<c.cutoff||p.observedAt<t-MAX_AGE||p.observedAt>t+5)return fail('observation_outside_age_or_cutoff');if(!equalHex(scopeHash,p.scopeHash))return fail('observation_scope_mismatch');
  const message=['membership','1',o.nameKey,o.guid,o.code,p.member?'1':'0',p.observedAt,p.scopeHash].join('|'),mac=hex(await sign('HMAC',key,encode(message))).slice(0,32);c.check();if(!equalHex(mac,p.mac))return fail('observation_signature_invalid');}
 if(e.observations.some(o=>o.code!==e.observations[0]!.code))return fail('mixed_request_group');
}
function pending(raw:unknown):Pending{
 const p=snapshotDataFields(raw,[...PF,'privacy_generation','privacy_state','privacy_revision'],'late_pending') as unknown as Pending;
 if(!int(p.id,1)||!validId(p.discord_id)||typeof p.name_key!=='string'||typeof p.name!=='string'||!int(p.created_at,1)||!int(p.expires_at,1)||p.expires_at<=p.created_at||p.expires_at>p.created_at+86400||p.consumed_at!==null||p.consumed_source!==null||p.nonce!==null&&(typeof p.nonce!=='string'||!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{3}$/.test(p.nonce))||!gen(p.privacy_generation)||p.privacy_revision!==null&&!int(p.privacy_revision))return fail('original_request_unavailable');
 if(p.privacy_state!==null&&p.privacy_state!=='active')return fail('account_unavailable',true);return Object.freeze(p);
}
async function resolveRequest(c:ReturnType<typeof capture>,e:Evidence,read:(s:D1PreparedStatement[])=>Promise<D1Result[]>,env:Env):Promise<Pending>{
 const first=e.observations[0]!,ticket=first.code.length===7,low=Math.min(...e.observations.map(o=>o.nativeMembership.observedAt)),high=Math.max(...e.observations.map(o=>o.nativeMembership.observedAt));
 // The original request-day/next-day allowance below intersects the live named-code rule at EACH signed send time.
 const validWhenSent=ticket|| (await Promise.all(e.observations.map(o=>isValidCode(c.secret,o.character,o.code,new Date(o.nativeMembership.observedAt*1000))))).every(Boolean);c.check();
 if(!validWhenSent)return fail('code_not_valid_when_observed');
 const rows=(await read([env.DB.prepare('SELECT '+PF.map(k=>'p.'+k).join(',')+',s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision FROM pending p LEFT JOIN privacy_subjects s ON s.subject_id=p.discord_id WHERE '+(ticket?'p.nonce=?1':'p.nonce IS NULL AND p.name_key=?1')+' AND p.consumed_at IS NULL AND p.created_at<=?2 AND p.expires_at>?3 ORDER BY p.id LIMIT 33').bind(ticket?ticketNonce(first.code):first.nameKey,high,low)]))[0]!.results;
 if(rows.length>32)return fail('request_history_truncated');const matching:Pending[]=[];
 for(const raw of rows){const p=pending(raw),opened=Number(p.created_at)*1000,expected=ticket?[await ticketFor(c.secret,String(p.nonce),dayBucket(new Date(opened)))]:[await codeFor(c.secret,first.character,dayBucket(new Date(opened))),await codeFor(c.secret,first.character,dayBucket(new Date(opened+86400000)))];c.check();if(expected.includes(first.code)&&e.observations.every(o=>Number(p.created_at)<=o.nativeMembership.observedAt&&o.nativeMembership.observedAt<Number(p.expires_at))&&(ticket||e.observations.every(o=>o.nameKey===p.name_key)))matching.push(p);}
 if(matching.length!==1)return fail(matching.length?'ambiguous_original_request':'no_unconsumed_original_request');
 if(e.observations.some(o=>o.guid!==first.guid||o.nameKey!==first.nameKey))return fail('conflicting_signed_senders');return matching[0]!;
}
const targetSQL=(id:string,g:string)=>'('+privacyGenerationExpressionFenceSql(id,g)+" AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id="+id+" AND j.state IN('waiting_role','held','erasing')) AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id="+id+" AND banned=1) AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id="+id+" AND denied=1) AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id="+id+" AND state='reapply'))";
async function plan(c:ReturnType<typeof capture>,e:Evidence,read:(s:D1PreparedStatement[])=>Promise<D1Result[]>,env:Env):Promise<Plan>{
 await verifyObservations(c,e);const p=await resolveRequest(c,e,read,env);return planFromPending(c,e,p,read,env);
}
async function planFromPending(c:ReturnType<typeof capture>,e:Evidence,p:Pending,read:(s:D1PreparedStatement[])=>Promise<D1Result[]>,env:Env):Promise<Plan>{
 const o=e.observations[0]!,subject=String(p.discord_id),g=p.privacy_generation;
 const sql='SELECT s.id,s.exported_at,s.source,s.member_count,r.name,r.name_key,r.guid,(SELECT COUNT(*) FROM roster_members x WHERE x.snapshot_id=s.id) AS actual_count,(SELECT COUNT(*) FROM roster_members x WHERE x.snapshot_id=s.id AND x.guid=?2) AS guid_count,'+targetSQL('?1','?3')+" AS target_current,(SELECT COUNT(*) FROM characters WHERE discord_id=?1 AND status NOT IN('unbound','denied')) AS existing_links,(SELECT COUNT(*) FROM characters WHERE name_key=?4 OR guid=?2) AS existing_identity FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id AND r.guid=?2 WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.exported_at>"+DB_NOW+'-600 AND s.exported_at<='+DB_NOW+' AND s.exported_at>=?5 LIMIT 2';
 const rows=(await read([env.DB.prepare(sql).bind(subject,o.guid,g,o.nameKey,c.cutoff)]))[0]!.results;if(rows.length!==1)return fail('native_guid_not_current');const r=rows[0] as Record<string,unknown>;
 if(r.target_current!==1)return fail('account_unavailable',true);if(r.existing_links!==0)return fail('account_already_linked');if(r.existing_identity!==0)return fail('character_identity_has_history');
 if(!int(r.id,1)||!int(r.exported_at,1)||typeof r.source!=='string'||!nativeMembershipSourceMatches(r.source,c.launch.scope!.guild,c.launch.scope!.realm)||!int(r.member_count,1)||r.actual_count!==r.member_count||r.guid_count!==1||r.name_key!==o.nameKey||r.guid!==o.guid||typeof r.name!=='string'||normalizeCharacter(r.name)!==r.name_key)return fail('native_identity_or_source_changed');
 const exportedAt=r.exported_at;
 if(e.observations.some(o=>!o.nativeMembership.member&&o.nativeMembership.observedAt>=exportedAt))return fail('negative_observation_not_superseded');
 const proofTimes=e.observations.map(o=>o.nativeMembership.observedAt),selected=e.observations[proofTimes.indexOf(Math.min(...proofTimes))]!,evidence=new Set(e.observations.map(o=>json([o.nameKey,o.guid,o.code,o.nativeMembership])));
 return Object.freeze({pending:p,native:Object.freeze({id:r.id,exported_at:r.exported_at,source:r.source,member_count:r.member_count,name:r.name,name_key:r.name_key as string,guid:r.guid as string}),subject,generation:g,revision:p.privacy_revision,observedAt:selected.nativeMembership.observedAt,memberAtObservation:selected.nativeMembership.member,envelopeDigest:await hash(json(e)),pendingDigest:await hash(json(tuple(p))),inputCount:e.observations.length,distinctEvidence:evidence.size,cutoff:c.cutoff});
}
function guards(p:Plan,deadline:number,memberAt:number){
 const values:Scalar[]=[json(tuple(p.pending)),p.subject,p.generation,p.native.id,p.native.exported_at,p.native.source,p.native.name_key,p.native.guid,p.cutoff,deadline,p.native.member_count,memberAt];
 const request='EXISTS(SELECT 1 FROM pending p WHERE '+PF.map((k,i)=>'p.'+k+" IS json_extract(?1,'$["+i+"]')").join(' AND ')+')';
 const source='EXISTS(SELECT 1 FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id WHERE s.id=?4 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.exported_at=?5 AND s.source=?6 AND s.member_count=?11 AND s.complete=1 AND s.trusted=1 AND s.exported_at>'+DB_NOW+'-600 AND s.exported_at<='+DB_NOW+' AND s.exported_at>=?9 AND s.member_count=(SELECT COUNT(*) FROM roster_members x WHERE x.snapshot_id=s.id) AND r.name_key=?7 AND r.guid=?8 AND (SELECT COUNT(*) FROM roster_members x WHERE x.snapshot_id=s.id AND x.guid=?8)=1)';
 const standing=targetSQL('?2','?3')+" AND (?3 IS NULL OR EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?2 AND generation=?3 AND state='active' AND revision IS json_extract(?1,'$[10]')))",fresh='?10>'+DB_NOW+' AND ?12>='+DB_NOW+'-60 AND ?12<='+DB_NOW+'+5 AND '+p.observedAt+'>='+DB_NOW+'-'+MAX_AGE+' AND '+p.observedAt+'>=?9 AND '+p.observedAt+'<='+DB_NOW+'+5';
 return {values,request,source,standing,fresh,sql:[request,source,standing,fresh,"NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?2 AND status NOT IN('unbound','denied'))","NOT EXISTS(SELECT 1 FROM characters WHERE name_key=?7 OR guid=?8)"].map(x=>'('+x+')').join(' AND ')};
}
async function currentMember(env:Env,c:ReturnType<typeof capture>,subject:string){
 let raw:unknown;try{raw=await rest<unknown>(env,'GET','/guilds/'+NEUTRAL_IDENTITY_GUILD280+'/members/'+subject,undefined,1);}catch(e){if(e instanceof DiscordError&&e.status===404)return fail('account_unavailable',true);throw e;}
 const v=raw as {user?:{id?:unknown;bot?:unknown};pending?:unknown;roles?:unknown};if(!v||v.user?.id!==subject||v.user.bot===true||v.pending===true||!Array.isArray(v.roles)||v.roles.length>250||v.roles.some(r=>!validId(r))||v.user.bot!==undefined&&typeof v.user.bot!=='boolean'||v.pending!==undefined&&typeof v.pending!=='boolean')return fail('account_unavailable',true);
 if(v.roles.some(r=>c.blocking.includes(r as string)))return fail('account_unavailable',true);return now();
}
const key=async(secret:string)=>importKey('raw',await digest('SHA-256',encode(PURPOSE+'\0preview\0'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
const decode=(s:string)=>{if(!/^[A-Za-z0-9_-]+$/.test(s))return fail('preview_invalid');const v=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));if(b64u(v)!==s)return fail('preview_invalid');return v;};
async function seal(secret:string,binding:string,p:Preview){const iv=crypto.getRandomValues(new Uint8Array(12));return '1.'+b64u(iv)+'.'+b64u(new Uint8Array(await encrypt({name:'AES-GCM',iv,additionalData:encode(binding)},await key(secret),encode(json(p)))));}
async function open(secret:string,binding:string,token:unknown):Promise<Preview>{try{if(typeof token!=='string'||token.length>10000)fail('preview_invalid');const m=/^1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(token as string);if(!m)fail('preview_invalid');return snapshotDataFields(parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(await decrypt({name:'AES-GCM',iv:decode(m![1]!),additionalData:encode(binding)},await key(secret),decode(m![2]!)))),['nonce','subject','generation','revision','requestId','pendingDigest','envelopeDigest','snapshotId','snapshotAt','snapshotSource','observedAt','issuedAt','expiresAt'],'late_preview') as unknown as Preview;}catch{return fail('preview_invalid');}}
// Closed authored numbered statements only. Unused high values are not passed to Native D1.
const statement=(env:Env,sql:string,values:readonly Scalar[])=>env.DB.prepare(sql).bind(...values.slice(0,Math.max(0,...[...sql.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])))));
type ClaimProvenance285=Readonly<{kind:'attended';actor:string;inventory:Envelope['inventory']}>|Readonly<{kind:'new-intake';bodyDigest:string;ids:readonly string[]}>;
const NEW_INTAKE_NOT_BEFORE285=LATE_FORWARD_SINCE285; // Same fixed source boundary as the original authenticated request issuer.
async function issueNeutralClaim285(c:ReturnType<typeof capture>,p:Plan,effect:Env,expiresAt:number,memberAt:number,nonce:string,provenance:ClaimProvenance285,progress:{writeStarted:boolean},check:()=>void):Promise<string>{
  const g=guards(p,expiresAt,memberAt),acceptedAt=now(),purpose=provenance.kind==='attended'?PURPOSE:'olympus-new-intake-late-whisper285-v1',receiptDigest=await hash(json([purpose,p.envelopeDigest,tuple(p.pending),p.generation,p.native,acceptedAt,nonce])),receiptId=receiptDigest.slice(0,32),consumedSource=provenance.kind==='attended'?'late-whisper285':'late-whisper-intake285',actor=provenance.kind==='attended'?provenance.actor:'watcher',auditAction=provenance.kind==='attended'?'verify.late_claim285':'verify.late_intake285';check();
  const v:Scalar[]=[...g.values,acceptedAt,p.native.name,receiptId,receiptDigest,actor,json({version:285,kind:purpose,groupDigest:p.envelopeDigest,...(provenance.kind==='attended'?{inventory:provenance.inventory}:{originalIntakeBodyDigest:provenance.bodyDigest,intakeIDs:provenance.ids,automaticNotBefore:NEW_INTAKE_NOT_BEFORE285}),originalRequestId:p.pending.id,originalRequestCreatedAt:p.pending.created_at,originalRequestExpiresAt:p.pending.expires_at,signedObservedAt:p.observedAt,memberAtObservation:p.memberAtObservation,acceptedAt,snapshotId:p.native.id,snapshotAt:p.native.exported_at,roleChangesSent:0,noticesSent:0,_privacySubjectIds:[...new Set([...(provenance.kind==='attended'?[provenance.actor]:[]),p.subject])]})];
  const claimed="EXISTS(SELECT 1 FROM pending WHERE id=json_extract(?1,'$[0]') AND discord_id=?2 AND created_at IS json_extract(?1,'$[4]') AND expires_at IS json_extract(?1,'$[5]') AND nonce IS json_extract(?1,'$[8]') AND consumed_at=?13 AND consumed_source='"+consumedSource+"' AND name_key=?7 AND name=?14)";
  const identity="EXISTS(SELECT 1 FROM characters WHERE name_key=?7 AND name=?14 AND discord_id=?2 AND guid=?8 AND status='member' AND bound_at=?13 AND verified_at=?13 AND member_since=?13 AND source='whisper')";
  const stmts=[statement(effect,'SELECT CASE WHEN '+g.sql+" THEN 1 ELSE json_extract('late_claim_admission_changed','$') END AS admitted",g.values),
   statement(effect,'INSERT INTO members(discord_id)VALUES(?2)ON CONFLICT(discord_id)DO NOTHING',v),
   statement(effect,"UPDATE pending SET consumed_at=?13,consumed_source='"+consumedSource+"',name_key=?7,name=?14 WHERE "+PF.map((k,i)=>k+" IS json_extract(?1,'$["+i+"]')").join(' AND ')+ ' RETURNING id',v),
   statement(effect,"INSERT INTO characters(name_key,name,discord_id,guid,status,bound_at,verified_at,member_since,source)SELECT CASE WHEN changes()=1 AND "+claimed+" THEN ?7 ELSE json_extract('late_claim_consume_unknown','$') END,?14,?2,?8,'member',?13,?13,?13,'whisper' RETURNING name_key",v),
   statement(effect,"INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,created_at,expires_at,attempts,checked_at)SELECT CASE WHEN changes()=1 AND "+claimed+' AND '+identity+' AND '+g.source+' AND '+g.standing+' AND '+g.fresh+" THEN ?15 ELSE json_extract('late_claim_identity_changed','$') END,?2,'"+NEUTRAL_IDENTITY_PURPOSE280+"',NULL,'"+NEUTRAL_IDENTITY_GUILD280+"','"+NEUTRAL_IDENTITY_CARRIER280+"',1,'settled','"+NEUTRAL_IDENTITY_REASON280+"',NULL,?3,?16,?4,?8,'"+NEUTRAL_IDENTITY_PROFILE280+"',NULL,NULL,?13,?10,0,?13 RETURNING id",v),
   statement(effect,"INSERT INTO audit(ts,actor,action,subject,details)SELECT ?13,?17,'"+auditAction+"',?2,?18 WHERE changes()=1 AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?15 AND request_digest=?16) RETURNING id",v),
   statement(effect,'SELECT CASE WHEN changes()=1 AND '+claimed+' AND '+identity+" AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?15 AND request_digest=?16 AND attempts=0 AND state='settled') THEN 1 ELSE json_extract('late_claim_receipt_unconfirmed','$') END AS admitted",v)];
  const target=privacyCaptureFromColumns(p.subject,{privacy_generation:p.generation,privacy_state:p.pending.privacy_state,privacy_revision:p.revision});progress.writeStarted=true;const out=await admittedPrivacySubjectWrite(effect,p.subject,target,stmts);check();
  if(out.length!==7||out.some(r=>r.success!==true)||out[2]?.meta?.changes!==1||out[2]?.results.length!==1||out[4]?.meta?.changes!==1||out[4]?.results.length!==1||out[6]?.results.length!==1)throw new Held('apply_receipt_unconfirmed');
  const consumedRow=snapshotDataFields(out[2]!.results[0],['id'],'late_consume_receipt'),neutralRow=snapshotDataFields(out[4]!.results[0],['id'],'late_identity_receipt'),terminal=snapshotDataFields(out[6]!.results[0],['admitted'],'late_terminal_receipt');
  if(consumedRow.id!==p.pending.id||neutralRow.id!==receiptId||terminal.admitted!==1)throw new Held('apply_receipt_unconfirmed');return receiptId;
}
export async function handleSiteLateProof285(request:Request,env:Env,admin:SiteUser,body:Record<string,unknown>={}):Promise<Response>{
 let action='count';const progress={writeStarted:false};
 try{
  const b=snapshotDataFields(body,Object.hasOwn(body,'confirm')||Object.hasOwn(body,'previewToken')?['action','envelope','previewToken','confirm']:['action','envelope'],'late_body');action=String(b.action);
  if(!['count','preview','apply'].includes(action)||action==='apply'&&(b.confirm!==true||typeof b.previewToken!=='string')||action!=='apply'&&(Object.hasOwn(b,'confirm')||Object.hasOwn(b,'previewToken')))return fail('request_invalid');
  if(request.method!=='POST'||new URL(request.url).search||!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)return fail('bad_origin_or_page');
  const original=originalUserSession(admin),c=capture(env);if(!isSiteAdmin(env,original.u))throw new Held('admin_required',true,403);
  const limits=consumeRateLimit280('late-proof285:'+original.u+':'+(action==='apply'?'apply':'read'),action==='apply'?5:90,60);if(limits.limited)return apiJson({...zero,result:'held',reason:'slow_down',linksChanged:0,counts:{eligible:0,held:0,unavailable:1}},429,rateLimitHeaders280(limits));
  const actor:CommunitySubject=Object.freeze({discordId:original.u,sessionVersion:original.v,expiresAt:original.e,privacyGeneration:original.g,accountIncarnation:original.n,originalSession:original}),effect=privacyBoundSiteRoleActionEnv(env,original);
  const check=()=>{c.check();if(originalUserSession(admin)!==original||!isSiteAdmin(env,original.u))fail('admin_admission_changed',true);};
  const read=async(s:D1PreparedStatement[])=>{check();const r=await admittedReadAs(effect,actor,'applicantWrite',s);check();if(r===FENCE_REFUSED)return fail('admin_admission_changed',true);return r;};
  await read([]);const e=envelope(b.envelope),p=await plan(c,e,read,effect);check();
  const binding=json([PURPOSE,original.u,original.v,original.e,original.g,original.n,c.launch.scope,c.cutoff]),preview=action==='apply'?await open(c.cookie,binding,b.previewToken):null;
  if(preview&&(!HEX32.test(preview.nonce)||preview.subject!==p.subject||preview.generation!==p.generation||preview.revision!==p.revision||preview.requestId!==p.pending.id||preview.pendingDigest!==p.pendingDigest||preview.envelopeDigest!==p.envelopeDigest||preview.snapshotId!==p.native.id||preview.snapshotAt!==p.native.exported_at||preview.snapshotSource!==p.native.source||preview.observedAt!==p.observedAt||!int(preview.issuedAt,1)||preview.issuedAt>now()||!int(preview.expiresAt,1)||preview.expiresAt<=now()||preview.expiresAt>preview.issuedAt+300))return fail('preview_changed');
  const memberAt=await currentMember(effect,c,p.subject);check();const expiresAt=preview?.expiresAt??Math.min(now()+300,p.native.exported_at+600,original.e),g=guards(p,expiresAt,memberAt);
  const fresh=async()=>{const r=await read([effect.DB.prepare('SELECT CASE WHEN '+g.sql+" THEN 1 ELSE json_extract('late_claim_admission_changed','$') END AS admitted").bind(...g.values)]);if((r[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)return fail('admission_changed',true);};await fresh();
  if(action==='count')return apiJson({...zero,result:'eligible',linksChanged:0,counts:{eligible:1,held:0,unavailable:0},reason:null,inputCount:p.inputCount,distinctEvidence:p.distinctEvidence});
  if(action==='preview'){
   const t=now(),v=Object.freeze({nonce:random(),subject:p.subject,generation:p.generation,revision:p.revision,requestId:Number(p.pending.id),pendingDigest:p.pendingDigest,envelopeDigest:p.envelopeDigest,snapshotId:p.native.id,snapshotAt:p.native.exported_at,snapshotSource:p.native.source,observedAt:p.observedAt,issuedAt:t,expiresAt}) satisfies Preview,previewToken=await seal(c.cookie,binding,v);check();await fresh();
   return apiJson({...zero,result:'eligible',linksChanged:0,counts:{eligible:1,held:0,unavailable:0},candidate:{subject:p.subject,character:p.native.name,guid:p.native.guid,requestId:p.pending.id,observedAt:p.observedAt,snapshotId:p.native.id,snapshotAt:p.native.exported_at},previewToken,expiresAt,meaning:'Historical signed whisper plus current native membership. Apply sends no message or role change.'});
  }
  const receiptId=await issueNeutralClaim285(c,p,effect,expiresAt,memberAt,preview!.nonce,{kind:'attended',actor:original.u,inventory:e.inventory},progress,check);await read([]);
  return apiJson({...zero,result:'linked',linksChanged:1,pendingConsumed:true,neutralReceiptId:receiptId,automaticRoleGrant:false});
 }catch(error){const h=error instanceof Held?error:null,status=h?.status??(error instanceof DiscordError&&[403,429].includes(error.status)?error.status:503);
  if(progress.writeStarted)return apiJson({...zero,result:'outcome_unknown',linksChanged:null,linksMayHaveChanged:true,recovery:'Inspect the current link and retained request; do not retry an uncertain apply.'},503);
  return apiJson({...zero,result:'held',linksChanged:0,reason:h?.code??'late_proof_unavailable',counts:{eligible:0,held:h&&!h.unavailable?1:0,unavailable:!h||h.unavailable?1:0}},action==='count'&&status===409?200:status);
 }
}


/** A NEW future observation from the existing authenticated intake. This never reopens a stored outbox. */
type IntakeOutcome285=Readonly<{kind:'not_applicable'|'linked'|'known_no_effect'|'outcome_unknown';selectedIds:readonly string[];unprocessedIds:readonly string[];reason:string|null;linksChanged:0|1|null;roleRequestCreated:boolean}>;
const intakeOutcomes285=new WeakMap<Response,IntakeOutcome285>();
/** Only the original response carries source-owned no-effect classification; JSON and clones cannot mint it. */
export function lateWhisperIntakeOutcome285(response:Response):IntakeOutcome285|null{return intakeOutcomes285.get(response)??null;}
export async function processNewLateWhisperIntake285(origin:OriginalWatcherIntake285):Promise<Response>{
 const progress={writeStarted:false};let selectedIds:readonly string[]=Object.freeze([]),unprocessedIds:readonly string[]=Object.freeze([]),spent=false,roleRequestCreated=false;
 const finish=(kind:IntakeOutcome285['kind'],reason:string|null,linksChanged:0|1|null,status:number)=>{const response=apiJson({...zero,result:kind==='known_no_effect'?'held':kind,reason,linksChanged,...(kind==='outcome_unknown'?{linksMayHaveChanged:true}:{}),automaticRoleGrant:false},status);intakeOutcomes285.set(response,Object.freeze({kind,selectedIds,unprocessedIds,reason,linksChanged,roleRequestCreated}));return response;};
 try{
  const original=originalWatcherIntake285(origin);original.check();
  const rows=snapshotDataArray(original.entries,25,'late_intake_rows'),ids=rows.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row))return '';const d=Object.getOwnPropertyDescriptor(row,'id');return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[A-Za-z0-9:._-]{1,128}$/.test(d.value)?d.value:'';});
  const candidates=rows.map((row,index)=>{if(!ordinaryIntakeShape280(row)||row.type!=='verify'||row.source!=='whisper'||typeof row.character!=='string'||typeof row.guid!=='string'||!GUID.test(row.guid)||typeof row.code!=='string')return null;const proof=captureNativeMembershipProof(row.nativeMembership);if(!proof||proof.observedAt<NEW_INTAKE_NOT_BEFORE285||proof.observedAt>now()+5||row.observedAt!==proof.observedAt)return null;return {row,index,proof,code:normalizeCodeInput(row.code)};}).filter((v):v is NonNullable<typeof v>=>v!==null);
  const trigger=candidates.find(v=>v.proof.observedAt<=now()-600);
  if(!trigger){unprocessedIds=Object.freeze(ids.filter(Boolean));original.check();return finish('not_applicable',null,0,200);}
  const first=trigger,rawGroup=rows.map((raw,index)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const row=raw as Record<string,unknown>;return row.type==='verify'&&typeof row.code==='string'&&normalizeCodeInput(row.code)===first.code?{row,index}:null;}).filter((v):v is NonNullable<typeof v>=>v!==null),chosen=new Set(rawGroup.map(v=>v.index));selectedIds=Object.freeze(rawGroup.map(v=>ids[v.index]!).filter(Boolean));unprocessedIds=Object.freeze(ids.filter((id,index)=>!!id&&!chosen.has(index)));
  original.spend();spent=true;original.check();
  if(ids.filter(Boolean).length!==new Set(ids.filter(Boolean)).size)return finish('known_no_effect','duplicate_intake_id',0,409);
  const env=original.env,c=capture(env),check=()=>{original.check();c.check();};check();
  const capturedGroup=rawGroup.map(v=>{const row=v.row;if(!ordinaryIntakeShape280(row)||row.source!=='whisper'||typeof row.character!=='string'||typeof row.guid!=='string'||!GUID.test(row.guid))return null;const proof=captureNativeMembershipProof(row.nativeMembership);if(!proof||proof.observedAt<NEW_INTAKE_NOT_BEFORE285||proof.observedAt>now()+5||row.observedAt!==proof.observedAt)return null;return {...v,proof,code:first.code};});
  if(capturedGroup.some(v=>v===null))return finish('known_no_effect','intake_group_not_qualified',0,409);
  const group=capturedGroup.filter((v):v is NonNullable<typeof v>=>v!==null);
  if(group.some(v=>v.row.guild!==undefined&&v.row.guild!==c.launch.scope!.guild))return finish('known_no_effect','approved_branch_authority_pending',0,409);
  const observations=Object.freeze(group.map(v=>Object.freeze({input:'new-intake' as const,source:'whisper' as const,character:v.row.character as string,nameKey:normalizeCharacter(v.row.character as string),guid:v.row.guid as string,code:v.code,nativeMembership:v.proof})));
  const evidence=Object.freeze({version:285,kind:'new-intake-late-whisper',automaticNotBefore:NEW_INTAKE_NOT_BEFORE285,originalBodyDigest:original.bodyDigest,intakeIDs:selectedIds,observations});
  const nativeRead=async(statements:D1PreparedStatement[])=>{check();const result=await env.DB.batch(statements);check();if(result.length!==statements.length||result.some(r=>r.success!==true))throw new Held('late_intake_read_unconfirmed',true);return result;};
  await verifyObservations(c,evidence);const pending=await resolveRequest(c,evidence,nativeRead,env),target=privacyCaptureFromColumns(String(pending.discord_id),{privacy_generation:pending.privacy_generation,privacy_state:pending.privacy_state,privacy_revision:pending.privacy_revision});
  // Bind the original target/G immediately after its joint pending/privacy read, before roster/provider work.
  const effect=privacyBoundSubjectEnv(env,String(pending.discord_id),target),read=async(statements:D1PreparedStatement[])=>{check();const result=await effect.DB.batch(statements);check();if(result.length!==statements.length||result.some(r=>r.success!==true))throw new Held('late_intake_read_unconfirmed',true);return result;};
  const p=await planFromPending(c,evidence,pending,read,effect),memberAt=await currentMember(effect,c,p.subject);check();
  const expiresAt=Math.min(now()+300,p.native.exported_at+600,original.expiresAt),g=guards(p,expiresAt,memberAt);
  const fresh=await read([effect.DB.prepare('SELECT CASE WHEN '+g.sql+" THEN 1 ELSE json_extract('late_claim_admission_changed','$') END AS admitted").bind(...g.values)]);if((fresh[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)throw new Held('late_intake_admission_changed',true);
  await issueNeutralClaim285(c,p,effect,expiresAt,memberAt,random(),{kind:'new-intake',bodyDigest:original.bodyDigest,ids:selectedIds},progress,check);
  const sourceCurrent=async()=>{const facts=await read([effect.DB.prepare('SELECT CASE WHEN ('+g.source+') AND ('+g.standing+') AND ('+g.fresh+") THEN 1 ELSE json_extract('late_intake_source_changed','$') END AS admitted").bind(...g.values)]);if((facts[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)throw new Held('late_intake_source_changed',true);};
  await sourceCurrent();check();const {requestRoleReconciliation242}=await import('./role-reconcile242');check();
  const requested=await requestRoleReconciliation242(effect,p.subject,'new-future-whisper285');check();await sourceCurrent();check();
  if(requested.kind!=='created'&&requested.kind!=='already_pending')throw new Held('role_request_unconfirmed',true);
  roleRequestCreated=requested.kind==='created';return finish('linked',null,1,200);
 }catch(error){const h=error instanceof Held?error:null;
  if(progress.writeStarted||!spent)return finish('outcome_unknown',null,null,503);
  return finish('known_no_effect',h?.code??'late_intake_unavailable',0,error instanceof DiscordError&&[403,429].includes(error.status)?error.status:409);
 }
}
