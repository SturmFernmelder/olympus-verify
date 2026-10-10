/** Identify-only history continuation (owner takeover, 2026-10-10). Cursors convey integrity, never admission. */
import type { Env } from './env';
import { apiJson, sign, verify } from './site-core';
import { secondsToIso } from './community-time';
import { ownContributionCopyDecisionSource } from './community-contributions';
import { PRIVACY_FAMILY_HISTORY_COLLECTIONS, privacyFamilyHistoryDefinition } from './privacy-access-family-history';
import { FormError } from './policy-form-core';
import { privacyAccessActionStatements, privacyAccessConsumedReadFence, PRIVACY_ACCESS_NOW, type PrivacyAccessGrant } from './privacy-access';

export const PRIVACY_HISTORY_COLLECTIONS=['actions','eventChanges','contributionDecisions'] as const;
export const PRIVACY_ALL_HISTORY_COLLECTIONS=[...PRIVACY_HISTORY_COLLECTIONS,...PRIVACY_FAMILY_HISTORY_COLLECTIONS] as const;
export type PrivacyHistoryCollection=typeof PRIVACY_ALL_HISTORY_COLLECTIONS[number];
export const PRIVACY_HISTORY_SECONDS=86400;
export const PRIVACY_HISTORY_LIMIT=1000;
const MAX=999999999999;
// A 32-byte MAC has two zero padding bits in its final base64url character; refuse equivalent noncanonical spellings.
const CURSOR=/^2\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/;
const whole=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=MAX;
export type PrivacyHistoryPosition={high:number;total:number;seen:number;ts:number;id:number;expires:number;captured:number};
type Position=PrivacyHistoryPosition;
type RecordValue=Record<string,unknown>;
export interface PrivacyHistoryDefinition {idField:string;timeField:string;statements:(env:Env,id:string,p:Position|null,pageLimit:number)=>D1PreparedStatement[];project:(r:RecordValue,at:number)=>RecordValue}
const payload=(p:Position)=>`2.${p.high}.${p.total}.${p.seen}.${p.ts}.${p.id}.${p.expires}.${p.captured}`;
const binding=(c:PrivacyHistoryCollection,g:PrivacyAccessGrant,p:string)=>JSON.stringify(['privacy-identify-history',c,p,g.subject,g.generation,g.state,g.revision]);
async function token(env:Env,g:PrivacyAccessGrant,c:PrivacyHistoryCollection,p:Position):Promise<string>{
 const raw=payload(p);return raw+'.'+await sign(env.COOKIE_SECRET,'privacy-own-history-v1',binding(c,g,raw));
}
async function position(env:Env,g:PrivacyAccessGrant,c:PrivacyHistoryCollection,raw:string|null):Promise<Position|null>{
 if(raw===null)return null;
 const m=raw.length<=140?CURSOR.exec(raw):null;if(!m)throw new FormError('invalid_history_cursor');
 const values=m.slice(1,8).map(Number);if(!values.every(whole))throw new FormError('invalid_history_cursor');
 const p={high:values[0]!,total:values[1]!,seen:values[2]!,ts:values[3]!,id:values[4]!,expires:values[5]!,captured:values[6]!};
 if(p.captured===0||p.expires!==p.captured+PRIVACY_HISTORY_SECONDS||p.seen>p.total||p.id>p.high||
  (p.total===0)!==(p.high===0)||(p.seen===0?p.ts!==0||p.id!==0:p.id===0||p.seen>=p.total)||
  !await verify(env.COOKIE_SECRET,'privacy-own-history-v1',binding(c,g,payload(p)),m[8]!))throw new FormError('invalid_history_cursor');
 return Object.freeze(p);
}
export const PRIVACY_PROJECTED_ROW_BYTES=16384;
// Conservative bound of every closed projected field, including escaping, replacement UTF-8, keys and fixed ISO/flag expansion.
export function privacyProjectedByteSql(fields:readonly string[]):string {
 if(fields.length===0||fields.some(f=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f)))throw new FormError('privacy_copy_unconfirmed',503);
 return '('+fields.map(f=>'3*length(CAST(json_quote('+f+') AS BLOB))+128').join('+')+')';
}
export function boundedPrivacyHistoryStatements(env:Env,id:string,source:string,fields:readonly string[],idField:string,timeField:string,p:Position|null,pageLimit:number):D1PreparedStatement[]{
 if((pageLimit!==25&&pageLimit!==1000)||![idField,timeField].every(f=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(f)))throw new FormError('privacy_copy_unconfirmed',503);
 const bytes=privacyProjectedByteSql(fields),range='('+source+')',bounded=p?1:0,after=p&&p.seen>0?1:0,params=[id,bounded,p?.high??0,after,p?.ts??0,p?.id??0];
 const remains='(?4=0 OR '+timeField+'>?5 OR ('+timeField+'=?5 AND '+idField+'>?6))';
 return [
 env.DB.prepare('SELECT CASE WHEN COALESCE(MAX('+bytes+'),0)<='+PRIVACY_PROJECTED_ROW_BYTES+' THEN COALESCE(MAX('+idField+'),0) ELSE json_extract(\'privacy_copy_oversize\',\'$\') END AS high_water,COUNT(*) AS total_count,COALESCE(SUM(CASE WHEN '+remains+' THEN 1 ELSE 0 END),0) AS remaining_count FROM '+range+' WHERE (?2=0 OR '+idField+'<=?3)').bind(...params),
 env.DB.prepare('SELECT * FROM '+range+' WHERE '+idField+'<=CASE WHEN ?2=1 THEN ?3 ELSE (SELECT COALESCE(MAX('+idField+'),0) FROM '+range+') END AND '+remains+' AND '+bytes+'<='+PRIVACY_PROJECTED_ROW_BYTES+' ORDER BY '+timeField+','+idField+' LIMIT '+(pageLimit+1)).bind(...params),
 ];
}
export function privacyBoundedScalarStatement(env:Env,id:string,source:string,fields:readonly string[],byteLimit=PRIVACY_PROJECTED_ROW_BYTES):D1PreparedStatement{
 if(byteLimit!==16384&&byteLimit!==131072)throw new FormError('privacy_copy_unconfirmed',503);
 return env.DB.prepare('SELECT * FROM ('+source+') WHERE CASE WHEN '+privacyProjectedByteSql(fields)+'<='+byteLimit+' THEN 1 ELSE json_extract(\'privacy_copy_oversize\',\'$\') END').bind(id);
}
function statements(env:Env,id:string,c:PrivacyHistoryCollection,p:Position|null,pageLimit:number):D1PreparedStatement[]{
 const source=c==='actions'?'SELECT ts,id,action FROM audit WHERE subject=?1 OR actor=?1':c==='eventChanges'?'SELECT id,event_id,action,at,fields FROM community_event_changes WHERE actor=?1':ownContributionCopyDecisionSource();
 const fields=c==='actions'?['ts','action']:c==='eventChanges'?['event_id','action','at','fields']:['at','action','retain_until','own_subject','own_actor'];
 return boundedPrivacyHistoryStatements(env,id,source,fields,'id',c==='actions'?'ts':'at',p,pageLimit);
}
const eventFields=new Set(['title','details','startsAt','durationMin','capacity','roleTargets']);
const decisions=new Set(['allocation_reversed','receipt_voided','removal_recorded','state_open','state_exempt','state_disputed','state_resolved','contact_acknowledged','contact_officer_contact','contact_final_notice','contact_final_acknowledged','contact_final_officer_contact']);
function project(c:PrivacyHistoryCollection,r:RecordValue,at:number):RecordValue{
 if(c==='actions'){
  if(typeof r.action!=='string'||!/^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(r.action))throw new FormError('privacy_copy_unconfirmed',503);
  return {at:secondsToIso(r.ts as number),action:r.action};
 }
 if(c==='eventChanges'){
  // Same closed projection as the aggregate identify-only copy, including legacy/malformed JSON refusal.
  if(typeof r.event_id!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(r.event_id)||!['created','updated','cancelled'].includes(r.action as string)||typeof r.fields!=='string'||r.fields.length>256)throw new FormError('privacy_copy_unconfirmed',503);
  let fields:unknown;try{fields=JSON.parse(r.fields);}catch{throw new FormError('privacy_copy_unconfirmed',503);}
  if(!Array.isArray(fields)||fields.length>6||fields.some(f=>typeof f!=='string'||!eventFields.has(f))||new Set(fields).size!==fields.length||(r.action==='updated'?fields.length===0:fields.length!==0))throw new FormError('privacy_copy_unconfirmed',503);
  return {eventId:r.event_id,action:r.action,at:secondsToIso(r.at as number),changedFieldNames:fields};
 }
 if(typeof r.action!=='string'||!decisions.has(r.action)||!whole(r.retain_until)||r.retain_until<=at||
  (r.own_subject!==0&&r.own_subject!==1)||(r.own_actor!==0&&r.own_actor!==1)||(r.own_subject!==1&&r.own_actor!==1))throw new FormError('privacy_copy_unconfirmed',503);
 return {action:r.action,at:secondsToIso(r.at as number),relation:r.own_subject===1?r.own_actor===1?'both':'subject':'actor'};
}
export async function preparePrivacyHistory(env:Env,g:PrivacyAccessGrant,c:PrivacyHistoryCollection,raw:string|null,pageLimit=PRIVACY_HISTORY_LIMIT){
 if(g.purpose!=='own_export'||!PRIVACY_ALL_HISTORY_COLLECTIONS.includes(c))throw new FormError('privacy_purpose_refused',403);
 if(pageLimit!==25&&pageLimit!==1000)throw new FormError('privacy_purpose_refused',403);
 const old=await position(env,g,c,raw);
 const definition:PrivacyHistoryDefinition=PRIVACY_FAMILY_HISTORY_COLLECTIONS.includes(c as typeof PRIVACY_FAMILY_HISTORY_COLLECTIONS[number])?privacyFamilyHistoryDefinition(c as typeof PRIVACY_FAMILY_HISTORY_COLLECTIONS[number]):{idField:'id',timeField:c==='actions'?'ts':'at',statements:(e,id,p,limit)=>statements(e,id,c,p,limit),project:(r,at)=>project(c,r,at)};
 return {old,definition,pageLimit,statements:definition.statements(env,g.subject,old,pageLimit)};
}
export async function finishPrivacyHistory(env:Env,g:PrivacyAccessGrant,c:PrivacyHistoryCollection,prepared:Awaited<ReturnType<typeof preparePrivacyHistory>>,at:unknown,m:RecordValue|undefined,rows:unknown){
 const {old,definition,pageLimit}=prepared;
 if(!whole(at)||at===0||at>=g.expiresAt||!m||!Array.isArray(rows)||!whole(m.high_water)||!whole(m.total_count)||!whole(m.remaining_count))throw new FormError('privacy_copy_unconfirmed',503);
 if((m.total_count===0)!==(m.high_water===0)||m.remaining_count>m.total_count||
  (old&&(m.high_water!==old.high||m.total_count!==old.total||m.remaining_count!==old.total-old.seen||at<old.captured)))throw new FormError('privacy_history_changed',409);
 const initial:Position=old??{high:m.high_water,total:m.total_count,seen:0,ts:0,id:0,expires:at+PRIVACY_HISTORY_SECONDS,captured:at};
 if(rows.length!==Math.min(pageLimit+1,m.remaining_count))throw new FormError('privacy_copy_unconfirmed',503);
 let previous=initial.seen>0?{ts:initial.ts,id:initial.id}:null,last:{ts:number;id:number}|null=null;
 const entries:RecordValue[]=[];
 for(const [index,value]of rows.entries()){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new FormError('privacy_copy_unconfirmed',503);
  const r=value as RecordValue,ts=r[definition.timeField],id=r[definition.idField];
  if(!whole(ts)||!whole(id)||id===0||id>initial.high||(previous&&(ts<previous.ts||(ts===previous.ts&&id<=previous.id))))throw new FormError('privacy_copy_unconfirmed',503);
  previous={ts,id};const projected=definition.project(r,at);
  if(index<pageLimit){last=previous;entries.push(projected);}
 }
 const delivered=initial.seen+entries.length,remaining=initial.total-delivered;
 if(!whole(delivered)||remaining<0||(remaining>0&&entries.length!==pageLimit))throw new FormError('privacy_copy_unconfirmed',503);
 const currentCursor=await token(env,g,c,initial),nextCursor=remaining>0&&last?await token(env,g,c,{...initial,seen:delivered,ts:last.ts,id:last.id}):null;
 return {collection:c,entries,currentCursor,nextCursor,capture:{at:secondsToIso(initial.captured),expiresAt:secondsToIso(initial.expires),count:initial.total,delivered,remaining,complete:remaining===0}};
}
/** Seven native batch statements plus the original grant read. No schema, scheduled or provider operation. */
export async function exportPrivacyHistory(env:Env,g:PrivacyAccessGrant,c:PrivacyHistoryCollection,raw:string|null):Promise<Response>{
 const prepared=await preparePrivacyHistory(env,g,c,raw),old=prepared.old;
 let out:D1Result[];try{out=await env.DB.batch([...privacyAccessActionStatements(env,g),
  env.DB.prepare(`SELECT CASE WHEN ?1 IS NULL OR (${PRIVACY_ACCESS_NOW}<?1 AND ${PRIVACY_ACCESS_NOW}>=?2) THEN ${PRIVACY_ACCESS_NOW} ELSE json_extract('privacy_history_expired','$') END AS at`).bind(old?.expires??null,old?.captured??null),
  ...prepared.statements,privacyAccessConsumedReadFence(env,g,old?.expires??null)]);}catch{throw new FormError('privacy_copy_unconfirmed',503);}
 const at=(out[3]?.results[0] as {at?:unknown}|undefined)?.at,m=out[4]?.results[0] as RecordValue|undefined,rows=out[5]?.results;
 if(out.length!==7||(out[6]?.results[0] as {admitted?:unknown}|undefined)?.admitted!==1||!whole(at))throw new FormError('privacy_copy_unconfirmed',503);
 const history=await finishPrivacyHistory(env,g,c,prepared,at,m,rows);
 return apiJson({generatedAt:secondsToIso(at),identity:{discordId:g.subject,authority:'fresh_identify_only',expiresAt:secondsToIso(g.expiresAt)},
  coverage:{kind:'curated_partial',ownAccountOnly:true,completeErasure:false,collection:c,pageLimit:PRIVACY_HISTORY_LIMIT,
   note:'Complete concerns this selected retained history range only. Other account sections are not included. Count and position changes refuse continuation; this is not an immutable content snapshot, proof of download or erasure.'},
  history,
  continuation:'Save currentCursor to reread this page or nextCursor to continue. Connect Discord again at /privacy/access, select this history and paste the cursor into the form. Each page needs a fresh twelve-minute privacy grant. The original range and twenty-four-hour traversal deadline never extend; a changed range requires a new capture.'},
  200,{'Content-Disposition':`attachment; filename="olympus-my-${c}-history.json"`,'Referrer-Policy':'no-referrer'});
}
