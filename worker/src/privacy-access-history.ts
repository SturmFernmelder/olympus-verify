/** Identify-only history continuation (owner takeover, 2026-10-10). Cursors convey integrity, never admission. */
import type { Env } from './env';
import { apiJson, sign, verify } from './site-core';
import { secondsToIso } from './community-time';
import { ownEventChangeStatements } from './community-events';
import { ownContributionDecisionStatements } from './community-contributions';
import { FormError } from './policy-form-core';
import { privacyAccessActionStatements, privacyAccessConsumedReadFence, PRIVACY_ACCESS_NOW, type PrivacyAccessGrant } from './privacy-access';

export const PRIVACY_HISTORY_COLLECTIONS=['actions','eventChanges','contributionDecisions'] as const;
export type PrivacyHistoryCollection=typeof PRIVACY_HISTORY_COLLECTIONS[number];
export const PRIVACY_HISTORY_SECONDS=86400;
export const PRIVACY_HISTORY_LIMIT=1000;
const MAX=999999999999;
// A 32-byte MAC has two zero padding bits in its final base64url character; refuse equivalent noncanonical spellings.
const CURSOR=/^2\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/;
const whole=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=MAX;
type Position={high:number;total:number;seen:number;ts:number;id:number;expires:number;captured:number};
type RecordValue=Record<string,unknown>;
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
function statements(env:Env,id:string,c:PrivacyHistoryCollection,p:Position|null):D1PreparedStatement[]{
 if(c==='eventChanges')return ownEventChangeStatements(env,id,p);
 if(c==='contributionDecisions')return ownContributionDecisionStatements(env,id,p);
 const bounded=p?1:0,after=p&&p.seen>0?1:0;
 // Identical retained-range predicates to the ordinary own-action history; no CommunitySubject is synthesized.
 return [
 env.DB.prepare('SELECT COALESCE(MAX(id),0) AS high_water,COUNT(*) AS total_count,COALESCE(SUM(CASE WHEN ?4=0 OR ts>?5 OR (ts=?5 AND id>?6) THEN 1 ELSE 0 END),0) AS remaining_count FROM audit WHERE (subject=?1 OR actor=?1) AND (?2=0 OR id<=?3)').bind(id,bounded,p?.high??0,after,p?.ts??0,p?.id??0),
 env.DB.prepare('SELECT ts,id,action FROM audit WHERE (subject=?1 OR actor=?1) AND id<=CASE WHEN ?2=1 THEN ?3 ELSE (SELECT COALESCE(MAX(id),0) FROM audit WHERE subject=?1 OR actor=?1) END AND (?4=0 OR ts>?5 OR (ts=?5 AND id>?6)) ORDER BY ts,id LIMIT 1001').bind(id,bounded,p?.high??0,after,p?.ts??0,p?.id??0),
 ];
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
/** Seven native batch statements plus the original grant read. No schema, scheduled or provider operation. */
export async function exportPrivacyHistory(env:Env,g:PrivacyAccessGrant,c:PrivacyHistoryCollection,raw:string|null):Promise<Response>{
 if(g.purpose!=='own_export'||!PRIVACY_HISTORY_COLLECTIONS.includes(c))throw new FormError('privacy_purpose_refused',403);
 const old=await position(env,g,c,raw),plan=statements(env,g.subject,c,old);
 const out=await env.DB.batch([...privacyAccessActionStatements(env,g),
  env.DB.prepare(`SELECT CASE WHEN ?1 IS NULL OR (${PRIVACY_ACCESS_NOW}<?1 AND ${PRIVACY_ACCESS_NOW}>=?2) THEN ${PRIVACY_ACCESS_NOW} ELSE json_extract('privacy_history_expired','$') END AS at`).bind(old?.expires??null,old?.captured??null),
  ...plan,privacyAccessConsumedReadFence(env,g,old?.expires??null)]);
 const at=(out[3]?.results[0] as {at?:unknown}|undefined)?.at,m=out[4]?.results[0] as RecordValue|undefined,rows=out[5]?.results;
 if(out.length!==7||(out[6]?.results[0] as {admitted?:unknown}|undefined)?.admitted!==1||!whole(at)||at===0||at>=g.expiresAt||!m||!Array.isArray(rows)||
  !whole(m.high_water)||!whole(m.total_count)||!whole(m.remaining_count))throw new FormError('privacy_copy_unconfirmed',503);
 if((m.total_count===0)!==(m.high_water===0)||m.remaining_count>m.total_count||
  (old&&(m.high_water!==old.high||m.total_count!==old.total||m.remaining_count!==old.total-old.seen||at<old.captured)))throw new FormError('privacy_history_changed',409);
 const initial:Position=old??{high:m.high_water,total:m.total_count,seen:0,ts:0,id:0,expires:at+PRIVACY_HISTORY_SECONDS,captured:at};
 if(rows.length!==Math.min(PRIVACY_HISTORY_LIMIT+1,m.remaining_count))throw new FormError('privacy_copy_unconfirmed',503);
 let previous=initial.seen>0?{ts:initial.ts,id:initial.id}:null,last:{ts:number;id:number}|null=null;
 const entries:RecordValue[]=[];
 for(const [index,value]of rows.entries()){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new FormError('privacy_copy_unconfirmed',503);
  const r=value as RecordValue,ts=c==='actions'?r.ts:r.at;
  if(!whole(ts)||!whole(r.id)||r.id===0||r.id>initial.high||(previous&&(ts<previous.ts||(ts===previous.ts&&r.id<=previous.id))))throw new FormError('privacy_copy_unconfirmed',503);
  previous={ts,id:r.id};const projected=project(c,r,at);
  if(index<PRIVACY_HISTORY_LIMIT){last=previous;entries.push(projected);}
 }
 const delivered=initial.seen+entries.length,remaining=initial.total-delivered;
 if(!whole(delivered)||remaining<0||(remaining>0&&entries.length!==PRIVACY_HISTORY_LIMIT))throw new FormError('privacy_copy_unconfirmed',503);
 const currentCursor=await token(env,g,c,initial),nextCursor=remaining>0&&last?await token(env,g,c,{...initial,seen:delivered,ts:last.ts,id:last.id}):null;
 return apiJson({generatedAt:secondsToIso(at),identity:{discordId:g.subject,authority:'fresh_identify_only',expiresAt:secondsToIso(g.expiresAt)},
  coverage:{kind:'curated_partial',ownAccountOnly:true,completeErasure:false,collection:c,pageLimit:PRIVACY_HISTORY_LIMIT,
   note:'Complete concerns this selected retained history range only. Other account sections are not included. Count and position changes refuse continuation; this is not an immutable content snapshot, proof of download or erasure.'},
  history:{collection:c,entries,currentCursor,nextCursor,capture:{at:secondsToIso(initial.captured),expiresAt:secondsToIso(initial.expires),count:initial.total,delivered,remaining,complete:remaining===0}},
  continuation:'Save currentCursor to reread this page or nextCursor to continue. Connect Discord again at /privacy/access, select this history and paste the cursor into the form. Each page needs a fresh twelve-minute privacy grant. The original range and twenty-four-hour traversal deadline never extend; a changed range requires a new capture.'},
  200,{'Content-Disposition':`attachment; filename="olympus-my-${c}-history.json"`,'Referrer-Policy':'no-referrer'});
}
