import { eventParticipantSql226, eventParticipantNameSql226 } from './guild-event-owner226';
/** Signed Discord calendar adapter. Uses the existing event tables and privacy
 * families, but never calls the browser writer with a fabricated session. */
import type { Env } from './env';
import { now } from './db';
import { DB_NOW, communityFeatures, randomToken } from './community-context';
import { scanLimit } from './community-directory';
import { calendarRoom, EVENT_RETENTION_S, historyStatement, opHash, parseField, rsvpStatements, timeOf } from './community-events';
import { isoToSeconds, secondsToIso } from './community-time';
import { currentGuildActor219, guildActorBatch219, guildActorFence219, guildStaffNow219, type GuildActor219 } from './guild-command-authority219';
import { attendanceUnlocked219, markerPrefix219, rsvpPreferenceSql219, RSVP_CHOICES_219, type RsvpChoice219 } from './guild-calendar-metadata219';

export interface CalendarEvent219 { id:string;title:string;details:string;starts_at:number;duration_min:number;capacity:number|null;status:string;revision:number;retain_until:number;created_at:number;publication_closed:number;yes:number;accepted:number;bench:number;own_attendance:string|null }
const ID=/^[A-Za-z0-9_-]{22}$/;
export function eventId219(value:unknown):string {if(typeof value!=='string'||!ID.test(value))throw Error('Choose an event ID from /raid list.');return value;}
export async function readCalendar219(env:Env,a:GuildActor219,id?:string,page=1,history=false):Promise<CalendarEvent219[]> {
 if(!communityFeatures(env).has('events'))throw Error('The guild calendar is switched off.');
 const scope=id?'id=?1':history?`?1 IS NULL AND starts_at<=${DB_NOW}`:`?1 IS NULL AND status='scheduled' AND starts_at>${DB_NOW}`;
 const order=history?'DESC':'ASC';
 const rows=await guildActorBatch219(env,a,[env.DB.prepare(`WITH page AS MATERIALIZED (
   SELECT id,title,details,starts_at,duration_min,capacity,status,revision,retain_until,created_at,publication_closed
     FROM community_events WHERE retain_until>${DB_NOW} AND ${scope}
     ORDER BY starts_at ${order},id ${order} LIMIT 6 OFFSET ?2
  ), signups AS (
   SELECT s.event_id,SUM(s.status='yes') AS yes,SUM(s.decision='accepted') AS accepted,SUM(s.decision='bench') AS bench
     FROM page p JOIN community_event_signups s ON s.event_id=p.id
     WHERE ${eventParticipantSql226(env,'s.discord_id')} GROUP BY s.event_id
  )
  SELECT p.*,COALESCE(s.yes,0) AS yes,COALESCE(s.accepted,0) AS accepted,COALESCE(s.bench,0) AS bench,
    a.state AS own_attendance FROM page p LEFT JOIN signups s ON s.event_id=p.id
    LEFT JOIN community_event_attendance a ON a.event_id=p.id AND a.discord_id=?3 AND ?4=1 AND p.starts_at<=${DB_NOW}
    ORDER BY p.starts_at ${order},p.id ${order}`).bind(id?eventId219(id):null,(page-1)*5,a.id,communityFeatures(env).has('attendance')?1:0)]);
 return rows[0]!.results as unknown as CalendarEvent219[];
}
export function raidCapacityText(e:CalendarEvent219):string {
 const open=e.status==='scheduled'&&e.starts_at>now();
 const places=(count:number,label:string)=>`${Math.max(0,count)} ${label} place${count===1?'':'s'}`;
 const capacity=e.capacity===null?'No fixed capacity':open
  ?`${places(e.capacity-e.yes,'open signup')} · ${places(e.capacity-e.accepted,'unassigned roster')}`
  :`Capacity ${e.capacity}`;
 return `${capacity} · ${e.accepted} accepted · ${e.bench} on the officer waitlist`;
}
function calendarStartUtc219(value:string):string {
 if(value.endsWith('Z'))return value;
 try {
  // Validate the wall-clock date before Date.parse can normalize an impossible date.
  timeOf(value.slice(0,-6)+'Z','invalid_starts_at');
  return secondsToIso(isoToSeconds(value));
 } catch {
  throw Error('Enter a valid ISO start time with whole seconds and Z or a UTC offset.');
 }
}
export async function createCalendar219(env:Env,a:GuildActor219,v:Record<string,unknown>):Promise<CalendarEvent219> {
 if(!communityFeatures(env).has('events')||!await guildStaffNow219(env,a))throw Error('Only a currently verified Raid Leader, Officer, High Councillor or site Admin can schedule events.');
 const at=now(),title=parseField('title',v.title,at) as string,details=parseField('details',v.details??'',at) as string;
 if(typeof v.starts!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v.starts))throw Error('Include Z or a UTC offset in the start time.');
 const startsAt=parseField('startsAt',calendarStartUtc219(v.starts),at) as number;
 if(startsAt<=at)throw Error('Schedule a future start time.');
 const durationMin=parseField('durationMin',v.minutes,at) as number,capacity=parseField('capacity',v.capacity??null,at) as number|null;
 const id=randomToken(),nonce=randomToken(),endsAt=startsAt+durationMin*60,hash=await opHash({title,details,startsAt,durationMin,capacity,roleTargets:null});
 const out=await guildActorBatch219(env,a,[env.DB.prepare(`INSERT INTO community_events(id,op_id,op_hash,title,details,starts_at,duration_min,ends_at,capacity,role_targets,status,created_by,revision,nonce,created_at,updated_at,retain_until)
  SELECT ?1,?1,?2,?3,?4,?5,?6,?7,?8,NULL,'scheduled',?9,1,?10,?11,?11,?12 WHERE ${guildActorFence219(env,a,9)} AND ?5>${DB_NOW} ON CONFLICT DO NOTHING`)
  .bind(id,hash,title,details,startsAt,durationMin,endsAt,capacity,a.id,nonce,at,endsAt+EVENT_RETENTION_S),historyStatement(env,id,'created',a.id,at,[],nonce),
  env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ?1,?2,'community.event_created',?3,NULL WHERE EXISTS(SELECT 1 FROM community_events WHERE id=?3 AND nonce=?4)`).bind(at,a.id,id,nonce)]);
 if(out[0]?.meta.changes!==1)throw Error('The event creation could not be confirmed. Check /raid list before scheduling again.');
 const event=(await readCalendar219(env,a,id))[0];if(!event)throw Error('The created event readback is held. Check the website calendar.');return event;
}
export async function rsvpCalendar219(env:Env,a:GuildActor219,id:string,revision:number,choice:string):Promise<boolean> {
 if(!communityFeatures(env).has('events')||!(RSVP_CHOICES_219 as readonly string[]).includes(choice))throw Error('Choose Tank, Healer, Melee, Ranged, Tentative, Bench or Absent.');
 const pick=choice as RsvpChoice219,status=pick==='absent'?'no':['tentative','bench'].includes(pick)?'tentative':'yes';
 const raidRole=pick==='tank'?'tank':pick==='healer'?'healer':['melee','ranged'].includes(pick)?'damage':null;
 const nonce=randomToken(),at=now(),event=eventId219(id),success=`EXISTS(SELECT 1 FROM community_event_signups WHERE event_id=?1 AND discord_id=?2 AND write_nonce=?3)`;
 const statements=rsvpStatements(env,{eventId:event,me:a.id,status,character:null,raidRole,keepChar:true,keepRole:false,revision:0,anyRevision:true,eventRevision:revision,nonce,newRef:randomToken(),at,limit:scanLimit(env),fence:guildActorFence219(env,a,2),sessionVersion:a.version,expiresAt:a.deadline,remindMention:null});
 const result=await guildActorBatch219(env,a,[...statements,
  env.DB.prepare(`DELETE FROM community_event_changes WHERE event_id=?1 AND actor=?2 AND ${markerPrefix219('rsvp219')} AND ${success}`).bind(event,a.id,nonce),
  env.DB.prepare(`INSERT INTO community_event_changes(event_id,action,actor,at,fields) SELECT ?1,'updated',?2,?4,?5 WHERE ${success}`).bind(event,a.id,nonce,at,JSON.stringify(['rsvp219',pick,nonce]))]);
 return result[0]?.meta.changes===1;
}
export const ROSTER_PAGE_219 = 20;
export async function calendarRoster219(env:Env,a:GuildActor219,id:string,page=1):Promise<Record<string,unknown>[]> {
 const out=await guildActorBatch219(env,a,[env.DB.prepare(`SELECT ${eventParticipantNameSql226(env,'u')} display_name,s.character_name,s.status,s.raid_role,s.decision,${rsvpPreferenceSql219()} AS preference,
  CASE WHEN ?3=1 AND s.discord_id=?4 THEN (SELECT state FROM community_event_attendance x WHERE x.event_id=s.event_id AND x.discord_id=s.discord_id) END attendance, CASE WHEN ?3=1 AND s.discord_id=?4 THEN 1 ELSE 0 END attendance_visible
  FROM community_event_signups s JOIN site_users u ON u.discord_id=s.discord_id WHERE s.event_id=?1 AND ${eventParticipantSql226(env,'s.discord_id')}
  AND EXISTS(SELECT 1 FROM community_events e WHERE e.id=s.event_id AND e.retain_until>${DB_NOW}) ORDER BY s.updated_at,s.discord_id LIMIT ${ROSTER_PAGE_219+1} OFFSET ?2`).bind(eventId219(id),(page-1)*ROSTER_PAGE_219,communityFeatures(env).has('attendance')?1:0,a.id)]);
 return out[0]!.results as Record<string,unknown>[];
}
export async function attendanceCalendar219(env:Env,a:GuildActor219,id:string,action:string,target:unknown,state:unknown):Promise<boolean> {
 if(!communityFeatures(env).has('attendance')||!await guildStaffNow219(env,a))throw Error('Attendance requires a currently verified Raid Leader, Officer, High Councillor or site Admin.');
 const event=eventId219(id),nonce=randomToken(),at=now(),limit=scanLimit(env);
 if(action==='lock') {
  const out=await guildActorBatch219(env,a,[env.DB.prepare(`INSERT INTO community_event_changes(event_id,action,actor,at,fields)
   SELECT id,'updated',?2,?3,?4 FROM community_events WHERE id=?1 AND status='scheduled' AND starts_at<=${DB_NOW} AND retain_until>${DB_NOW}
    AND ${attendanceUnlocked219('community_events.id')} AND ${guildActorFence219(env,a,2)}`).bind(event,a.id,at,JSON.stringify(['attendance219','locked',nonce])),
   env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ?1,?2,'community.attendance_locked',?3,NULL WHERE changes()=1`).bind(at,a.id,event)]);
  return out[0]?.meta.changes===1;
 }
 if(action!=='record'||typeof target!=='string'||!/^[0-9]{17,20}$/.test(target)||!['present','absent','excused','unknown'].includes(String(state)))throw Error('Select an existing signup and an explicit observed attendance state.');
 const targetStanding=`${eventParticipantSql226(env,'?3')} AND (EXISTS(SELECT 1 FROM community_event_signups WHERE event_id=?1 AND discord_id=?3) OR EXISTS(SELECT 1 FROM community_event_attendance WHERE event_id=?1 AND discord_id=?3) OR EXISTS(SELECT 1 FROM community_profiles WHERE discord_id=?3 AND listed=1))`;
 const admitted=`EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND attendance_nonce=?5)`;
 const out=await guildActorBatch219(env,a,[env.DB.prepare(`UPDATE community_events SET attendance_nonce=?5 WHERE id=?1 AND status='scheduled' AND starts_at<=${DB_NOW} AND retain_until>${DB_NOW}
  AND ${attendanceUnlocked219('community_events.id')} AND ${guildActorFence219(env,a,2)} AND ${targetStanding} AND ${calendarRoom('json_array(?3)','?6')}`).bind(event,a.id,target,state,nonce,limit),
  env.DB.prepare(`INSERT INTO community_event_attendance(event_id,discord_id,state,source,reason_code,recorded_by,recorded_at,revision,write_nonce)
   SELECT ?1,?3,?4,'officer',NULL,?2,${DB_NOW},1,?5 WHERE ${admitted} ON CONFLICT(event_id,discord_id) DO UPDATE SET state=excluded.state,source='officer',reason_code=NULL,recorded_by=excluded.recorded_by,recorded_at=excluded.recorded_at,revision=community_event_attendance.revision+1,write_nonce=excluded.write_nonce`).bind(event,a.id,target,state,nonce),
  env.DB.prepare(`UPDATE community_events SET attendance_generation=attendance_generation+1 WHERE id=?1 AND attendance_nonce=?2`).bind(event,nonce),
  env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?2,'community.attendance',?1,NULL WHERE ${admitted}`).bind(event,a.id,target,state,nonce)]);
 if(!await currentGuildActor219(env,a))throw Error('Attendance readback is held. Reload the calendar before another action.');
 return out[0]?.meta.changes===1;
}
