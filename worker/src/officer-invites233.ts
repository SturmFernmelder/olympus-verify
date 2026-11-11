/** Attended Knight invites only. A WHO/unit observation cannot grant membership or a Discord role. */
import type { Env } from './env';
import { now, type PendingRow } from './db';
import { isValidCode, isValidTicket, normalizeCharacter, normalizeCodeInput, ticketNonce, TICKET_LENGTH } from './codes';
import { API, credentialFetch, json, type AttemptBudget } from './discord';
import { captureLaunchVerification, launchVerificationEnv } from './launch-verification227';
import { pendingPrivacyCapture, admittedPrivacySubjectWrite, privacyBoundSubjectEnv, privacyGenerationFenceSql } from './privacy-serving-authority';
import { classifyKnightRoles229 } from './launch-operations229';
import { canonicalOlympusGuildName, FLAGSHIP_GUILD_NAME } from './guild-affiliation229';
import { createPrivacyAdmissionAlias } from './privacy-write-admission';

export const OFFICER_INVITE_PROTOCOL233='officer-operations-v233' as const;
export const OFFICER_INVITE_SOURCE233='native-who-unit-v233' as const;
export const OFFICER_INVITE_SOURCE242='native-who-whisper-v242' as const;
type InviteSource=typeof OFFICER_INVITE_SOURCE233|typeof OFFICER_INVITE_SOURCE242;
const sourcePair=(p:Record<string,unknown>)=>(p.version===233&&p.source===OFFICER_INVITE_SOURCE233)||(p.version===242&&p.source===OFFICER_INVITE_SOURCE242);
const GUILD='236932545793490944',HEX32=/^[0-9a-f]{32}$/,HEX64=/^[0-9a-f]{64}$/,GUID=/^Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}$/;
const DB_NOW="CAST(strftime('%s','now') AS INTEGER)";
type Proof233=Readonly<{version:233|242;proofId:string;fullName:string;unitGuid:string;unitFullName:string;whisperAt:number;requestedAt:number;observedAt:number;scopeHash:string;guildState:'unguilded';source:InviteSource;before:string;after:string;mac:string}>;
type Input233=Readonly<{character:string;code:string;guid:string;source:'whisper';nativeInvite:Proof233}>;
type OriginalPending233=PendingRow & {consumed_source:string|null};
type Stored233=Readonly<{version:233|242;proofId:string;guid:string;fullName:string;scopeHash:string;observedAt:number;expiresAt:number;generation:string|null;pendingId:number;source:InviteSource}>;
export type OfficerInvite233=Readonly<{queueId:number;proofId:string;name:string;guid:string;fullName:string;scopeHash:string;observedAt:number;expiresAt:number;reason:'knight-unguilded';source:InviteSource}>;
const text=(x:unknown,max=100):x is string=>typeof x==='string'&&!!x&&x===x.trim()&&new TextEncoder().encode(x).length<=max&&!/[\x00-\x1f\x7f|]/.test(x);
const integer=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0;
function own(object:unknown,names:readonly string[]):Record<string,unknown>|null{
 try{if(!object||typeof object!=='object'||Array.isArray(object)||![Object.prototype,null].includes(Object.getPrototypeOf(object)))return null;
  if(Reflect.ownKeys(object).length!==names.length||Object.keys(object).sort().join(',')!==names.slice().sort().join(','))return null;
  const out:Record<string,unknown>={};for(const name of names){const d=Object.getOwnPropertyDescriptor(object,name);if(!d||!Object.hasOwn(d,'value'))return null;out[name]=d.value;}return out;
 }catch{return null;}
}
export function captureOfficerInvite233(input:unknown):Input233|null{
 const b=own(input,['character','code','guid','source','nativeInvite']);
 if(!b||!text(b.character)||typeof b.code!=='string'||!/^([A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{7})$/.test(b.code)||typeof b.guid!=='string'||!GUID.test(b.guid)||b.source!=='whisper')return null;
 const p=own(b.nativeInvite,['version','proofId','fullName','unitGuid','unitFullName','whisperAt','requestedAt','observedAt','scopeHash','guildState','source','before','after','mac']);
 if(!p||!sourcePair(p)||typeof p.proofId!=='string'||!HEX32.test(p.proofId)||!text(p.fullName)||p.fullName!==p.unitFullName||p.unitGuid!==b.guid
  ||normalizeCharacter(p.fullName)!==normalizeCharacter(b.character)||p.guildState!=='unguilded'||![OFFICER_INVITE_SOURCE233,OFFICER_INVITE_SOURCE242].includes(p.source as InviteSource)
  ||!integer(p.whisperAt)||!integer(p.requestedAt)||!integer(p.observedAt)||p.whisperAt>p.requestedAt||p.requestedAt>p.observedAt||p.observedAt-p.requestedAt>15||p.observedAt-p.whisperAt>=600
  ||typeof p.scopeHash!=='string'||!/^[0-9a-f]{16}$/.test(p.scopeHash)||typeof p.before!=='string'||!HEX64.test(p.before)||typeof p.after!=='string'||!HEX64.test(p.after)||p.before===p.after
  ||typeof p.mac!=='string'||!HEX32.test(p.mac))return null;
 return Object.freeze({...b,nativeInvite:Object.freeze(p)}) as unknown as Input233;
}
export function officerInviteMessage233(b:Input233):string{
 const p=b.nativeInvite;
 return ['invite','233',normalizeCharacter(b.character),b.guid,normalizeCodeInput(b.code),p.fullName,p.whisperAt,p.requestedAt,p.observedAt,p.scopeHash,p.proofId,p.guildState,p.source,p.before,p.after,p.unitGuid,p.unitFullName].join('|');
}
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const equal=(a:string,b:string)=>{let n=a.length^b.length;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return n===0;};
function selection(env:Env){
 const keys=['DB','GUILD_ID','SITE_GUILD_ID','DISCORD_BOT_TOKEN','VERIFY_SECRET','BLOCKING_ROLE_IDS','VERIFY_MEMBERSHIP_ONLY','VERIFY_NATIVE_SCOPE','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_WRITE_ADMISSION_EPOCH'] as const;
 const proto=Object.getPrototypeOf(env),slots=keys.map(k=>Object.getOwnPropertyDescriptor(env,k));
 const check=()=>{if(Object.getPrototypeOf(env)!==proto)throw Error('officer233_environment_changed');for(let i=0;i<keys.length;i++){const a=slots[i],b=Object.getOwnPropertyDescriptor(env,keys[i]!);if(a===undefined?!!b||keys[i]! in env:!Object.hasOwn(a,'value')||!b||!Object.hasOwn(b,'value')||['value','get','set','writable','enumerable','configurable'].some(k=>!Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor])))throw Error('officer233_environment_changed');}};
 check();if(env.GUILD_ID!==GUILD||env.SITE_GUILD_ID!==GUILD||typeof env.DISCORD_BOT_TOKEN!=='string'||!env.DISCORD_BOT_TOKEN||typeof env.VERIFY_SECRET!=='string'||!env.VERIFY_SECRET)throw Error('officer233_configuration_held');
 return check;
}
function blockers(env:Env):string[]|null{
 const raw=env.BLOCKING_ROLE_IDS;if(raw===undefined||raw==='')return [];
 if(typeof raw!=='string')return null;const rows=raw.split(/[\s,]+/).filter(Boolean);return rows.length<=250&&rows.every(x=>/^[1-9][0-9]{16,19}$/.test(x))&&new Set(rows).size===rows.length?rows:null;
}
export type OfficerReadSchedule271 = Readonly<{before:()=>Promise<boolean>;observe:(response:Response)=>Promise<void>}>;
async function roles(env:Env,subject:string,b:AttemptBudget,check:()=>void,schedule?:OfficerReadSchedule271):Promise<readonly string[]|null>{
 check();for(const key of ['limit','attempts','retries'] as const){const d=Object.getOwnPropertyDescriptor(b,key);if(!d||!Object.hasOwn(d,'value')||!Number.isSafeInteger(d.value)||d.value<0)return null;}
 if(schedule){const allowed=await schedule.before();check();if(!allowed)return null;}
 if(b.attempts>=b.limit||b.retries!==0)return null;
 const previous=b.attempts;b.attempts=previous+1;const limit=b.limit;
 const current=()=>{check();for(const [key,value] of [['limit',limit],['attempts',previous+1],['retries',0]] as const){const d=Object.getOwnPropertyDescriptor(b,key);if(!d||!Object.hasOwn(d,'value')||d.value!==value)throw Error('officer233_budget_changed');}};
 const response=await credentialFetch(API+'/guilds/'+GUILD+'/members/'+subject,{method:'GET',headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN}},current);current();
 if(schedule){await schedule.observe(response);current();}
 if(response.status!==200){try{await response.body?.cancel();}catch{}return null;}
 const reader=response.body?.getReader();if(!reader)return null;let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();current();if(r.done)break;size+=r.value.byteLength;if(size>32768){await reader.cancel();return null;}chunks.push(r.value);}}finally{reader.releaseLock();}
 const all=new Uint8Array(size);let pos=0;for(const c of chunks){all.set(c,pos);pos+=c.length;}const row=JSON.parse(new TextDecoder().decode(all));current();
 if(!row||row.user?.id!==subject||!Array.isArray(row.roles)||row.roles.length>250||row.roles.some((r:unknown)=>typeof r!=='string'||!/^\d{17,20}$/.test(r))||new Set(row.roles).size!==row.roles.length)return null;
 return Object.freeze(row.roles.slice());
}
const standing=(subjectAt:number)=>`COALESCE((SELECT banned FROM members WHERE discord_id=?${subjectAt}),0)=0 AND COALESCE((SELECT denied FROM site_users WHERE discord_id=?${subjectAt}),0)=0 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?${subjectAt} AND state='reapply')`;
function stored(value:unknown):Stored233|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try{const n=JSON.parse(value),p=own(n,['version','proofId','guid','fullName','scopeHash','observedAt','expiresAt','generation','pendingId','source']);
  if(!p||!sourcePair(p)||typeof p.proofId!=='string'||!HEX32.test(p.proofId)||typeof p.guid!=='string'||!GUID.test(p.guid)||!text(p.fullName)||typeof p.scopeHash!=='string'||!/^[0-9a-f]{16}$/.test(p.scopeHash)
   ||!integer(p.observedAt)||!integer(p.expiresAt)||p.expiresAt>p.observedAt+60||p.expiresAt<=p.observedAt||!integer(p.pendingId)||![OFFICER_INVITE_SOURCE233,OFFICER_INVITE_SOURCE242].includes(p.source as InviteSource)||p.generation!==null&&(typeof p.generation!=='string'||!HEX32.test(p.generation)))return null;
  return Object.freeze(p) as unknown as Stored233;
 }catch{return null;}
}
/** Private original result-graph witness. No serialized row or caller receipt can mint publication authority. */
function originalAckGraph233(input:unknown):()=>void{
 const checks:(()=>void)[]=[],seen=new Set<object>();
 const visit=(v:unknown)=>{if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
  const proto=Object.getPrototypeOf(v),keys=Reflect.ownKeys(v),slots=keys.map(k=>Object.getOwnPropertyDescriptor(v,k)!);
  if(keys.some(k=>typeof k!=='string')||slots.some(d=>!Object.hasOwn(d,'value')))throw Error('officer233_ack_graph');
  checks.push(()=>{const next=Reflect.ownKeys(v);if(Object.getPrototypeOf(v)!==proto||next.length!==keys.length||next.some((k,i)=>k!==keys[i]))throw Error('officer233_ack_graph');
   for(let i=0;i<keys.length;i++){const a=slots[i]!,b=Object.getOwnPropertyDescriptor(v,keys[i]!);if(!b||!Object.hasOwn(b,'value')||['value','get','set','writable','enumerable','configurable'].some(k=>!Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor])))throw Error('officer233_ack_graph');}});
  for(const d of slots)visit(d.value);
 };visit(input);return()=>{for(const c of checks)c();};
}
export async function postOfficerInvite233(original:Env,body:unknown):Promise<Response>{
 const input=captureOfficerInvite233(body),proofId=input?.nativeInvite.proofId??null;let writeAttempted=false,active=true;
 const unknown=()=>json({protocol:OFFICER_INVITE_PROTOCOL233,result:'unknown',reason:'admission-outcome-unknown',proofId,inviteQueued:false,roleGranted:false,pendingConsumed:false},503);
 const held=(reason:string)=>json({protocol:OFFICER_INVITE_PROTOCOL233,result:'held',reason,proofId,inviteQueued:false,roleGranted:false,pendingConsumed:false});
 try{
  const check=selection(original),launch=captureLaunchVerification(original);if(launch.mode!=='members-only'||!launch.scope||!launch.current()||canonicalOlympusGuildName(launch.scope.guild)!==FLAGSHIP_GUILD_NAME)return held('native-scope-unavailable');
  if(!input)return held('native-proof-invalid');const p=input.nativeInvite;
  const sourceCurrent=()=>{check();if(!launch.current())throw Error('officer233_source_changed');};
  const current=()=>{sourceCurrent();if(p.observedAt<=now()-60||p.observedAt>now()+5)throw Error('officer233_source_expired');};sourceCurrent();
  const scopeHash=(await sha('native-scope|1|'+launch.scope.guild+'|'+launch.scope.realm)).slice(0,16);sourceCurrent();if(scopeHash!==p.scopeHash)return held('native-scope-mismatch');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(original.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);sourceCurrent();
  const mac=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(officerInviteMessage233(input)))).slice(0,32);sourceCurrent();if(!equal(mac,p.mac))return held('native-proof-invalid');
  // Authenticated original identity/proof only. This terminal receipt precedes every D1/provider/effect path.
  if(p.observedAt<=now()-60)return held('native-source-expired');current();
  const ticket=input.code.length===TICKET_LENGTH,valid=ticket?await isValidTicket(original.VERIFY_SECRET,input.code):await isValidCode(original.VERIFY_SECRET,input.character,input.code);current();if(!valid)return held('verification-code-invalid');
  const nativeEnv=launchVerificationEnv(original,launch);let env=nativeEnv;const rows=await env.DB.prepare(`SELECT p.*,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision FROM pending p LEFT JOIN privacy_subjects s ON s.subject_id=p.discord_id
   WHERE (${ticket?'p.nonce=?1':'p.name_key=?1'} AND p.created_at<=?2 AND p.expires_at>${DB_NOW}) AND (p.consumed_at IS NULL OR p.consumed_source='membership_refused') ORDER BY p.id DESC LIMIT 2`).bind(ticket?ticketNonce(input.code):normalizeCharacter(input.character),p.whisperAt).all<OriginalPending233>();current();
  if(!rows.success||rows.results.length!==1)return held('original-request-unavailable');const pending=Object.freeze({...rows.results[0]!});
  if(!/^[1-9][0-9]{16,19}$/.test(pending.discord_id)||pending.created_at>p.whisperAt||pending.expires_at<=now())return held('original-request-unavailable');
  const capture=pendingPrivacyCapture(pending);env=privacyBoundSubjectEnv(env,pending.discord_id,capture);
  const native=await env.DB.prepare(`SELECT s.id,s.exported_at,s.source FROM roster_snapshots s WHERE (s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1)
   AND (s.source=?1 AND s.exported_at>${DB_NOW}-600 AND s.exported_at<=${DB_NOW} AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id))
   AND NOT EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=s.id AND (r.guid=?2 OR r.name_key=?3))`).bind(launch.scope.provenance,input.guid,normalizeCharacter(input.character)).first<{id:number;exported_at:number;source:string}>();current();
  if(!native||!integer(native.id)||!integer(native.exported_at))return held('native-roster-required');
  const blocked=blockers(original);if(blocked===null)return held('blocking-policy-unavailable');
  const memberRoles=await roles(original,pending.discord_id,{limit:1,attempts:0,retries:0},current);current();
  if(!memberRoles)return held('discord-standing-unknown');if(classifyKnightRoles229(memberRoles)!=='knight')return held('knight-standing-required');if(blocked.some(x=>memberRoles.includes(x)))return held('blocking-role-held');
  const expires=Math.min(p.observedAt+60,pending.expires_at);if(expires<=now())return held('native-source-expired');
  const note=JSON.stringify({version:p.version,proofId:p.proofId,guid:input.guid,fullName:p.fullName,scopeHash:p.scopeHash,observedAt:p.observedAt,expiresAt:expires,generation:capture?.subjectGeneration??null,pendingId:pending.id,source:p.source});
  const nameKey=normalizeCharacter(input.character);
  const guard=`EXISTS(SELECT 1 FROM pending p WHERE (p.id=?1 AND p.discord_id=?2 AND p.created_at=?3 AND p.expires_at=?4) AND (p.nonce IS ?5 AND p.name_key=?6 AND p.name=?7 AND p.consumed_at IS ?8 AND p.consumed_source IS ?9))
   AND (${standing(2)}) AND ?10>${DB_NOW}
   AND NOT EXISTS(SELECT 1 FROM characters c WHERE (c.name_key=?11 OR c.guid=?12) AND (c.discord_id<>?2 OR c.status IN('member','left_pending')))
   AND NOT EXISTS(SELECT 1 FROM invite_queue q WHERE (q.discord_id=?2 OR q.name_key=?11) AND q.status IN('queued','written','invited') AND (?18 IS NULL OR q.id<>?18))
   AND EXISTS(SELECT 1 FROM roster_snapshots s WHERE (s.id=?15 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.exported_at=?16 AND s.source=?17)
    AND (s.complete=1 AND s.trusted=1 AND s.exported_at>${DB_NOW}-600 AND s.exported_at<=${DB_NOW} AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id))
    AND NOT EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=s.id AND (r.guid=?12 OR r.name_key=?11)))`;
  const values=[pending.id,pending.discord_id,pending.created_at,pending.expires_at,pending.nonce??null,pending.name_key,pending.name,pending.consumed_at,pending.consumed_source,expires,nameKey,input.guid,input.character,note,native.id,native.exported_at,native.source,null];current();
  writeAttempted=true;
  const out=await admittedPrivacySubjectWrite(env,pending.discord_id,capture,[env.DB.prepare(`INSERT INTO invite_queue(name_key,name,discord_id,note,status,created_at,approved_by,priority)
   SELECT ?11,?13,?2,?14,'queued',${DB_NOW},'officer233-pending',0 WHERE ${guard} RETURNING id,created_at`).bind(...values)]);current();
  const graph=originalAckGraph233(out);graph();
  const birth=out[0]?.results[0] as {id?:unknown;created_at?:unknown}|undefined,id=birth?.id,created=birth?.created_at;
  if(out.length!==1||out[0]?.success!==true)return unknown();
  if(out.length===1&&out[0]?.meta?.changes===0&&out[0]?.results.length===0)return held('queue-or-current-policy-held');
  if(out.length!==1||out[0]?.meta?.changes!==1||out[0]?.results.length!==1||!birth||!integer(id)||!integer(created)||created>=expires)return unknown();
  const ackCurrent=()=>{if(!active)throw Error('officer233_original_ack_closed');current();graph();
   if(out[0]?.success!==true||out[0]?.meta?.changes!==1||out[0]?.results[0]!==birth||birth.id!==id||birth.created_at!==created)throw Error('officer233_original_ack_changed');};ackCurrent();
  // Publication is reachable only in this invocation after the real ACK1. It never looks up a stage receipt.
  const publicationEnv=privacyBoundSubjectEnv({...nativeEnv,DB:createPrivacyAdmissionAlias(nativeEnv.DB,ackCurrent)},pending.discord_id,capture);
  const publishValues=values.slice();publishValues[17]=id;publishValues.push(created);ackCurrent();
  const published=await admittedPrivacySubjectWrite(publicationEnv,pending.discord_id,capture,[publicationEnv.DB.prepare(`UPDATE invite_queue SET approved_by='officer233'
   WHERE (id=?18 AND created_at=?19 AND discord_id=?2 AND name_key=?11 AND name=?13 AND note=?14)
    AND (approved_by='officer233-pending' AND status='queued' AND attempts=0) AND ${guard} RETURNING id`).bind(...publishValues)]);ackCurrent();
  if(published.length!==1||published[0]?.success!==true||published[0]?.meta?.changes!==1||published[0]?.results.length!==1||(published[0]?.results[0] as {id?:unknown}|undefined)?.id!==id)return unknown();
  return json({protocol:OFFICER_INVITE_PROTOCOL233,result:'queued',reason:'knight-unguilded',proofId,queueId:id,expiresAt:expires,inviteQueued:true,roleGranted:false,pendingConsumed:false});
 }catch{return writeAttempted?unknown():held('source-or-policy-held');}
 finally{active=false;}
}
/** Bounded read-only projection. Original queued expiry is never renewed by a fresh role GET. */
export async function readOfficerInvites233(env:Env,budget:AttemptBudget,limit=3,pageAt=now(),schedule?:OfficerReadSchedule271):Promise<{invites:OfficerInvite233[];heldReasons:string[]}>{
 const result:{invites:OfficerInvite233[];heldReasons:string[]}={invites:[],heldReasons:[]};
 try{
  const check=selection(env),launch=captureLaunchVerification(env);if(launch.mode!=='members-only'||!launch.scope||!launch.current()||canonicalOlympusGuildName(launch.scope.guild)!==FLAGSHIP_GUILD_NAME||!integer(pageAt)||pageAt>now()||pageAt<=now()-60||!Number.isSafeInteger(limit)||limit<0||limit>3){result.heldReasons.push('officer-invite-read-held');return result;}
  for(const key of ['limit','attempts','retries'] as const){const d=Object.getOwnPropertyDescriptor(budget,key);if(!d||!Object.hasOwn(d,'value')||!Number.isSafeInteger(d.value)||d.value<0)throw Error('budget');}
  if(budget.retries!==0)throw Error('budget');
  const remaining=Math.max(0,Math.min(limit,budget.limit-budget.attempts));if(!remaining)return result;
  const scopeHash=(await sha('native-scope|1|'+launch.scope.guild+'|'+launch.scope.realm)).slice(0,16);check();if(!launch.current())throw Error('scope');
  const rows=await env.DB.prepare(`SELECT q.id,q.name,q.name_key,q.discord_id,q.note,s.generation,s.state FROM invite_queue q LEFT JOIN privacy_subjects s ON s.subject_id=q.discord_id
   WHERE (q.approved_by='officer233' AND q.status='queued' AND q.attempts=0 AND q.created_at<=?2) AND (${standing(0).replaceAll('?0','q.discord_id')})
    AND CASE WHEN json_valid(q.note)=1 AND length(CAST(q.note AS BLOB))<=2048 THEN
     (json_type(q.note)='object' AND (json_type(q.note,'$.version')='integer' AND json_extract(q.note,'$.version')=233)
      AND (json_extract(q.note,'$.source')='native-who-unit-v233' AND json_extract(q.note,'$.scopeHash')=?3)
      AND (json_type(q.note,'$.observedAt')='integer' AND json_type(q.note,'$.expiresAt')='integer')
      AND (json_extract(q.note,'$.observedAt')>${DB_NOW}-60 AND json_extract(q.note,'$.observedAt')<=?2+5)
      AND (json_extract(q.note,'$.expiresAt')>${DB_NOW} AND json_extract(q.note,'$.expiresAt')>json_extract(q.note,'$.observedAt') AND json_extract(q.note,'$.expiresAt')<=json_extract(q.note,'$.observedAt')+60))
     ELSE 0 END
   ORDER BY q.id LIMIT ?1`).bind(remaining,pageAt,scopeHash).all<{id:number;name:string;name_key:string;discord_id:string;note:string;generation:string|null;state:string|null}>();check();
  if(!rows.success)throw Error('read');const blocked=blockers(env);if(blocked===null)throw Error('policy');
  for(const row of rows.results){
   const n=stored(row.note);if(!integer(row.id)||!text(row.name)||normalizeCharacter(row.name)!==row.name_key||!/^\d{17,20}$/.test(row.discord_id)||!n||n.scopeHash!==scopeHash||n.generation!==row.generation||row.state!==null&&row.state!=='active'||n.expiresAt<=now()||n.observedAt>pageAt+5||normalizeCharacter(n.fullName)!==row.name_key){result.heldReasons.push('officer-invite-source-held');continue;}
   const fresh=await roles(env,row.discord_id,budget,check,schedule);check();if(!launch.current())throw Error('scope');
   if(!fresh||classifyKnightRoles229(fresh)!=='knight'||blocked.some(x=>fresh.includes(x))||n.expiresAt<=now()){result.heldReasons.push('officer-invite-standing-held');continue;}
   const current=await env.DB.prepare(`SELECT 1 FROM invite_queue q WHERE (q.id=?1 AND q.discord_id=?2 AND q.name_key=?3 AND q.note=?4) AND (q.approved_by='officer233' AND q.status='queued' AND q.attempts=0)
    AND (${standing(2)}) AND (${privacyGenerationFenceSql(2,5)}) AND ?6>${DB_NOW}
    AND NOT EXISTS(SELECT 1 FROM characters c WHERE (c.name_key=?3 OR c.guid=?7) AND (c.discord_id<>?2 OR c.status IN('member','left_pending')))
    AND EXISTS(SELECT 1 FROM roster_snapshots s WHERE (s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.source=?8)
     AND (s.exported_at>${DB_NOW}-600 AND s.exported_at<=${DB_NOW} AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id))
     AND NOT EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=s.id AND (r.guid=?7 OR r.name_key=?3)))`)

    .bind(row.id,row.discord_id,row.name_key,row.note,n.generation,n.expiresAt,n.guid,launch.scope.provenance).first();check();if(!launch.current())throw Error('scope');
   if(!current){result.heldReasons.push('officer-invite-current-policy-held');continue;}
   result.invites.push(Object.freeze({queueId:row.id,proofId:n.proofId,name:row.name,guid:n.guid,fullName:n.fullName,scopeHash:n.scopeHash,observedAt:n.observedAt,expiresAt:n.expiresAt,reason:'knight-unguilded',source:n.source}));
  }
  return result;
 }catch{return {invites:[],heldReasons:['officer-invite-read-unknown']};}
}
