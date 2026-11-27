/** Private team occurrences share the event clock, RSVP and attendance ledgers.
 * The public calendar envelope deliberately carries no team title, rules, group or notes. */
import type { Env } from './env';
import { now } from './db';
import { admitted, admittedRead, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, type CommunityContext } from './community-context';
import { apiJson } from './site-core';
import { calendarRoom, EVENT_RETENTION_S, rsvpStatements, type RsvpStatus } from './community-events';
import { scanLimit } from './community-directory';
import { attendanceUnlocked219 } from './guild-calendar-metadata219';
import { raidIncludesGroup316 as includesGroup, raidTeamInvitationSql316 as linkedInvitation, raidTeamManagerSql316, raidTeamMemberSql316, raidTeamOccurrenceVisible316 } from './raid-teams316';

const BASE = '/api/community/raid-teams/';
const ID = /^[A-Za-z0-9_-]{22}$/;
const GUID = /^Player-\d{1,10}-[a-fA-F0-9]{1,16}$/;
const DAY = 86400;
const enc = new TextEncoder();
type Body = Record<string,unknown>;
class CalendarInput extends Error {}
function integer(value:unknown,lo:number,hi:number,label:string):number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value<lo || value>hi) throw new CalendarInput('Check '+label+'.');
  return value;
}
function bounded(value:unknown,max:number,required:boolean,label:string,multiline=false):string {
  if (typeof value!=='string') throw new CalendarInput('Enter '+label+'.');
  const s=value.normalize('NFC').replace(/\r\n?/g,'\n').trim();
  const visible=multiline?s.replace(/[\n\t]/g,' '):s;
  if ((!s&&required)||enc.encode(s).length>max||/[\p{Cc}\p{Cs}\u202A-\u202E\u2066-\u2069]/u.test(visible)) throw new CalendarInput('Check '+label+' and its length.');
  return s;
}
function eventId(value:unknown):string {
  if(typeof value!=='string'||!ID.test(value)) throw new CalendarInput('Select an existing event.');
  return value;
}
function zoneOf(value:unknown):string {
  const zone=bounded(value,80,true,'the time zone');
  try { return new Intl.DateTimeFormat('en-US',{timeZone:zone}).resolvedOptions().timeZone; }
  catch { throw new CalendarInput('Use an IANA time zone, for example America/Chicago.'); }
}
/** Repeat in the chosen local wall clock. Folds and gaps need an explicit alternative time. */
export function weeklyRaidStarts316(local:unknown,zone:string,count:number):number[] {
  if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new CalendarInput('Enter a local date and time.');
  const wall=Date.parse(local+':00Z');
  if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==local) throw new CalendarInput('Enter a real local date and time.');
  const f=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function displayed(ms:number):number {
    const p=Object.fromEntries(f.formatToParts(ms).map(k=>[k.type,k.value]));
    return Date.UTC(+p.year!,+p.month!-1,+p.day!,+p.hour!,+p.minute!);
  }
  return Array.from({length:count},(_,i)=>{
    const desired=wall+i*7*DAY*1000;
    const guesses=[desired-36*3600000,desired,desired+36*3600000];
    const offsets=new Set(guesses.map(t=>displayed(t)-t));
    const answers=[...offsets].map(o=>desired-o).filter(t=>displayed(t)===desired);
    if(answers.length!==1) throw new CalendarInput('An occurrence falls in a skipped or repeated local hour. Choose another time.');
    return answers[0]!/1000;
  });
}
function common(b:Body) {
  return {title:bounded(b.title,200,true,'a raid title'),timezone:zoneOf(b.timezone),
    duration:integer(b.durationMin,15,720,'the duration'),assembly:integer(b.assemblyMinutes??0,0,120,'the assembly offset'),
    preparation:bounded(b.preparation??'',500,false,'the preparation notes',true)};
}
function dates(b:Body,zone:string,count:number) {
  const values=weeklyRaidStarts316(b.localStart,zone,count),at=now();
  if(values[0]!<=at||values[values.length-1]!>at+366*DAY) throw new CalendarInput('Schedule a future raid within one year.');
  return values;
}
function writeGate(ctx:CommunityContext) {
  const s=ctx.subject!;
  return {sql:fenceSql('confirmedGuildData',1,2,3,s.privacyGeneration,s.accountIncarnation),args:[s.discordId,s.sessionVersion,s.expiresAt] as [string,number,number]};
}
const manager = (team:string,actor:string)=>raidTeamManagerSql316(team,actor);
const member = (team:string,actor:string)=>raidTeamMemberSql316(team,actor);
function subgroupMask(groups:unknown):number {
  if(!Array.isArray(groups)||groups.length>8||new Set(groups).size!==groups.length) throw new CalendarInput('Select up to eight distinct subgroups.');
  return groups.reduce((mask,n)=>mask | (1 << (integer(n,1,8,'the subgroup')-1)),0);
}
function groupLabel(mask:number) {
  const groups=Array.from({length:8},(_,i)=>i+1).filter(i=>mask & (1<<(i-1)));
  return groups.length ? (groups.length===1?'Group ':'Groups ')+groups.join(', ') : 'Whole team';
}
const held = ()=>apiJson({error:'team_calendar_changed',message:'Check your current raid team, its invitations, and the latest calendar revision before trying again.'},409);
const missing = ()=>apiJson({error:'not_found'},404);
async function digest(s:string) {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function schedule(env:Env,ctx:CommunityContext,team:string,b:Body) {
  const op=eventId(b.opId),rev=integer(b.teamRevision,1,2147483647,'the charter revision');
  const group=subgroupMask(b.groups),capacity=integer(b.capacity,1,100,'the raid capacity');
  const count=integer(b.occurrences??1,1,8,'the number of weekly occurrences');
  const v=common(b),starts=dates(b,v.timezone,count),g=writeGate(ctx),nonce=randomToken(), db=env.DB;
  const key=JSON.stringify([team,op,ctx.subject!.discordId,ctx.subject!.accountIncarnation]), hash=await digest(JSON.stringify([key,rev,group,capacity,v,starts]));
  const ids=await Promise.all(starts.map(async(_,i)=>(await digest(key+'|'+i)).slice(0,22)));
  const anchor=ids[0]!,sql:D1PreparedStatement[]=[];
  for(let i=0;i<count;i++){
    const id=ids[i]!,start=starts[i]!,end=start+v.duration*60;
    sql.push(db.prepare(`INSERT INTO community_events(id,op_id,title,details,starts_at,duration_min,ends_at,capacity,created_by,nonce,created_at,updated_at,retain_until,publication_closed,reminder_closed)
      SELECT ?5,?6,'Team raid','',?7,?8,?9,?10,?1,?11,${DB_NOW},${DB_NOW},?12,1,1
      FROM raid_teams316 t WHERE t.id=?4 AND t.revision=?13 AND t.status<>'inactive' AND ${g.sql} AND ${manager('t.id','?1')}
      AND ?7>${DB_NOW} AND EXISTS(SELECT 1 FROM raid_team_seats316 s WHERE s.team_id=t.id AND ${includesGroup('?14','s.group_number')} AND ${member('s.team_id','s.discord_id')})
      AND (?15<>0 OR (
        (SELECT COUNT(*) FROM raid_team_events316 xe JOIN community_events ce ON ce.id=xe.event_id WHERE xe.team_id=t.id AND ce.retain_until>${DB_NOW})+?17<=64
        AND (SELECT COUNT(*) FROM raid_team_seats316 s WHERE s.team_id=t.id AND s.state IN ('primary','reserve') AND ${includesGroup('?14','s.group_number')})<=100
        AND NOT EXISTS(SELECT 1 FROM raid_team_seats316 s WHERE s.team_id=t.id AND s.state IN ('primary','reserve') AND ${includesGroup('?14','s.group_number')}
          AND (SELECT COUNT(*) FROM raid_team_seats316 owned JOIN raid_team_invites316 ii ON ii.seat_id=owned.id JOIN community_events ce ON ce.id=ii.event_id
               WHERE owned.discord_id=s.discord_id)+?17>128)))
      AND (?15=0 OR EXISTS(SELECT 1 FROM community_events root WHERE id=?16 AND nonce=?11)) ON CONFLICT DO NOTHING`)
        .bind(...g.args,team,id,'team316:'+id,start,v.duration,end,capacity,nonce,end+EVENT_RETENTION_S,rev,group,i,anchor,count),
      db.prepare(`INSERT INTO raid_team_events316(event_id,team_id,series_id,occurrence,request_hash,title,timezone,group_mask,assembly_minutes,preparation,charter_revision,loot,expectations)
        SELECT ?1,t.id,?3,?4,?5,?6,?7,?8,?9,?10,t.revision,t.loot,t.expectations FROM raid_teams316 t
        WHERE t.id=?2 AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND nonce=?11)`)
        .bind(id,team,op,i,hash,v.title,v.timezone,group,v.assembly,v.preparation,nonce),
      db.prepare(`INSERT INTO raid_team_invites316(event_id,seat_id,character_guid,group_number)
        SELECT ?1,s.id,s.character_guid,COALESCE(s.group_number,0) FROM raid_team_seats316 s
        WHERE s.team_id=?2 AND ${includesGroup('?3','s.group_number')} AND ${member('s.team_id','s.discord_id')}
        AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND nonce=?4)`).bind(id,team,group,nonce));
  }
  const out=await admitted(env,ctx,sql);
  if(out!==FENCE_REFUSED) return apiJson({eventIds:ids},201);
  const replay=await admittedRead(env,ctx,'confirmedGuildData',[db.prepare(`SELECT COUNT(*) n FROM raid_team_events316 x WHERE x.team_id=?1 AND x.series_id=?2
    AND EXISTS(SELECT 1 FROM community_events ce WHERE ce.id=x.event_id AND ce.retain_until>${DB_NOW})
    AND x.request_hash=?3 AND ${manager('x.team_id','?4')}`).bind(team,op,hash,ctx.subject!.discordId)]);
  if(replay!==FENCE_REFUSED && (replay[0]?.results[0] as {n:number}|undefined)?.n===count)return apiJson({eventIds:ids});
  return apiJson({error:'scheduling_held',message:'Refresh the charter and select a group with confirmed seats. Scheduling supports up to 64 retained team raids, 100 invited seats per occurrence, and 128 retained invitations per member across teams. Try fewer occurrences or a smaller subgroup if a limit was reached.'},409);
}

const personalJoin = `JOIN raid_team_invites316 i ON i.event_id=x.event_id
  JOIN raid_team_seats316 s ON s.id=i.seat_id AND s.team_id=x.team_id AND s.character_guid=i.character_guid
  AND ${includesGroup('x.group_mask','s.group_number')}`;
const eventColumns = `e.id eventId,x.title,t.name teamName,x.group_mask groupMask,e.starts_at startsAt,e.ends_at endsAt,
  e.revision,x.timezone,x.assembly_minutes assemblyMinutes,x.preparation,x.loot,x.expectations,x.charter_revision charterRevision,
  e.status,e.capacity,e.duration_min durationMin`;
const answerColumns = `CASE WHEN r.rsvp_starts_at<>e.starts_at THEN NULL WHEN i.answer_nonce=r.write_nonce THEN i.answer WHEN r.status='yes' THEN 'confirmed'
  WHEN r.status='tentative' THEN 'tentative' WHEN r.status='no' THEN 'unavailable' END answer`;
type EventDTO = {eventId:string;title:string;teamName:string;groupMask:number;startsAt:number;endsAt:number;revision:number;
  timezone:string;assemblyMinutes:number;preparation:string;loot:string;expectations:string;charterRevision:number;status:string;capacity:number;durationMin:number;answer:string|null};
function shortText(s:string,max:number) {
  let value='',len=0;
  for(const rune of s.replace(/[\p{Cc}\p{Cs}\u202A-\u202E\u2066-\u2069]+/gu,' ')) {const n=enc.encode(rune).length;if(len+n>max)break;value+=rune;len+=n;}
  return encodeURIComponent(value);
}
export function addonCalendarImport316(guid:string,at:number,events:readonly EventDTO[]) {
  if(!GUID.test(guid)||events.length>24) throw new CalendarInput('The personal schedule exceeds the addon limit.');
  const lines=events.map(e=>{
    const assembly=new Date((e.startsAt-e.assemblyMinutes*60)*1000).toISOString().slice(0,16).replace('T',' ');
    const group=groupLabel(e.groupMask)+' · Assemble '+assembly+' UTC';
    return [e.eventId,e.revision,e.startsAt,e.durationMin,shortText(e.teamName,120),shortText(e.title,200),shortText(group,80),shortText(e.preparation,500)].join('|');
  });
  return [`OLR1|${guid}|${at}|${lines.length}`,...lines].join('\n');
}
async function mine(request:Request,env:Env,ctx:CommunityContext) {
  const at=now(),db=env.DB,me=ctx.subject!.discordId,guid=new URL(request.url).searchParams.get('guid');
  if(guid&&!GUID.test(guid)) return missing();
  const chars=`SELECT k.guid,k.name FROM characters k WHERE k.discord_id=?1 AND k.status='member' AND k.guid IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM characters kd WHERE kd.guid=k.guid AND kd.name_key<>k.name_key) ORDER BY k.name_key`;
  const rows=await admittedRead(env,ctx,'confirmedGuildData',[
    db.prepare(chars).bind(me),
    db.prepare(`SELECT ${eventColumns},${answerColumns},s.character_guid guid FROM raid_team_seats316 s
      JOIN raid_team_invites316 i ON i.seat_id=s.id AND i.character_guid=s.character_guid
      JOIN raid_team_events316 x ON x.event_id=i.event_id AND x.team_id=s.team_id
      JOIN community_events e ON e.id=x.event_id JOIN raid_teams316 t ON t.id=x.team_id
      LEFT JOIN community_event_signups r ON r.event_id=x.event_id AND r.discord_id=s.discord_id
      WHERE s.discord_id=?1 AND s.character_guid=COALESCE(?2,(SELECT guid FROM (${chars}) LIMIT 1))
      AND ${member('s.team_id','?1')} AND ${includesGroup('x.group_mask','s.group_number')} AND t.status<>'inactive'
      AND (r.status IS NULL OR r.status<>'no' OR r.rsvp_starts_at<>e.starts_at) AND e.status='scheduled' AND e.starts_at>?3 AND e.starts_at<=?3+604800 AND e.retain_until>${DB_NOW}
      ORDER BY e.starts_at,e.id LIMIT 25`).bind(me,guid,at)]);
  if(rows===FENCE_REFUSED)return refusal(env,request,'confirmedGuildData');
  const characters=rows[0]!.results as unknown as {guid:string;name:string}[];
  const selectedGuid=guid??characters[0]?.guid??null;
  if(guid&&!characters.some(k=>k.guid===guid))return missing();
  const events=(rows[1]!.results as unknown as EventDTO[]).map(e=>({...e,groupLabel:groupLabel(e.groupMask)}));
  if(events.length>24)return apiJson({error:'schedule_overflow',message:'More than 24 raids in the next seven days. Use the team calendars until the whole week fits.'},409);
  return apiJson({characters,selectedGuid,raid:events[0]??null,events,addonImport:selectedGuid?addonCalendarImport316(selectedGuid,at,events):''});
}
async function list(request:Request,env:Env,ctx:CommunityContext,team:string){
  const db=env.DB,me=ctx.subject!.discordId,query=new URL(request.url).searchParams,selected=query.get('eventId'),after=query.get('after');
  if(selected&&!ID.test(selected))return missing();
  const cursor=after?/^(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(after):null;
  if(after&&!cursor)throw new CalendarInput('Open the team calendar again to reload the page.');
  const allow=manager('x.team_id','?2');
  const sql=[db.prepare(`SELECT ${eventColumns},${answerColumns},COALESCE(r.revision,0) rsvpRevision,${allow} canManage,
      (${linkedInvitation('e.id','x.team_id','?2')} AND t.status<>'inactive' AND e.status='scheduled' AND e.starts_at>${DB_NOW}) canRespond
    FROM raid_team_events316 x JOIN community_events e ON e.id=x.event_id JOIN raid_teams316 t ON t.id=x.team_id
    LEFT JOIN raid_team_seats316 s ON s.team_id=x.team_id AND s.discord_id=?2
    LEFT JOIN raid_team_invites316 i ON i.event_id=x.event_id AND i.seat_id=s.id AND i.character_guid=s.character_guid
    LEFT JOIN community_event_signups r ON r.event_id=x.event_id AND r.discord_id=?2
    WHERE x.team_id=?1 AND e.retain_until>${DB_NOW} AND (?3 IS NULL OR e.id=?3)
    AND ${raidTeamOccurrenceVisible316('e.id','x.team_id','?2')}
    AND (?4=0 OR (e.starts_at,e.id)>(?4,?5)) ORDER BY e.starts_at,e.id LIMIT 51`).bind(team,me,selected,cursor?Number(cursor[1]):0,cursor?.[2]??'')];
  if(selected)sql.push(db.prepare(`SELECT s.id seatId,k.name,s.role,i.group_number groupNumber,${answerColumns},
    a.state attendance,COALESCE(a.revision,0) attendanceRevision FROM raid_team_events316 x ${personalJoin}
    JOIN community_events e ON e.id=x.event_id JOIN characters k ON k.guid=s.character_guid AND k.discord_id=s.discord_id AND k.status='member'
    LEFT JOIN community_event_signups r ON r.event_id=e.id AND r.discord_id=s.discord_id
    LEFT JOIN community_event_attendance a ON a.event_id=e.id AND a.discord_id=s.discord_id
    WHERE x.team_id=?1 AND x.event_id=?3 AND e.retain_until>${DB_NOW} AND ${member('s.team_id','s.discord_id')}
    AND (${allow} OR s.discord_id=?2) ORDER BY i.group_number,k.name_key LIMIT 201`).bind(team,me,selected));
  const out=await admittedRead(env,ctx,'confirmedGuildData',sql);
  if(out===FENCE_REFUSED)return refusal(env,request,'confirmedGuildData');
  const events=(out[0]!.results as unknown as EventDTO[]).map(e=>({...e,groupLabel:groupLabel(e.groupMask)}));
  if(selected&&!events.length)return missing();
  if((out[1]?.results.length??0)>200)return apiJson({error:'roster_too_large'},409);
  const page=events.slice(0,50),last=page[page.length-1];
  return apiJson({events:page,roster:out[1]?.results??[],next:events.length>50&&last?last.startsAt+'.'+last.eventId:null});
}
async function change(env:Env,ctx:CommunityContext,team:string,b:Body){
  const id=eventId(b.eventId),rev=integer(b.revision,1,2147483647,'the event revision'),g=writeGate(ctx),nonce=randomToken();
  const v=b.action==='edit'?common(b):null,start=v?dates(b,v.timezone,1)[0]!:0,end=start+(v?.duration??0)*60;
  const set=v?'starts_at=?8,duration_min=?9,ends_at=?10,retain_until=?11':"status='cancelled',retain_until=MIN(retain_until,"+DB_NOW+"+2592000)";
  const first=env.DB.prepare(`UPDATE community_events SET ${set},revision=revision+1,updated_at=${DB_NOW},nonce=?7
    WHERE id=?5 AND revision=?6 AND starts_at>${DB_NOW} AND status='scheduled' AND ${g.sql}
    AND EXISTS(SELECT 1 FROM raid_team_events316 x WHERE x.event_id=?5 AND x.team_id=?4 AND ${manager('x.team_id','?1')})`);
  const rest=v?[env.DB.prepare(`UPDATE raid_team_events316 SET title=?2,timezone=?3,assembly_minutes=?4,preparation=?5
    WHERE event_id=?1 AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND nonce=?6)`).bind(id,v.title,v.timezone,v.assembly,v.preparation,nonce)]:[];
  const out=await admitted(env,ctx,[first.bind(...g.args,team,id,rev,nonce,...(v?[start,v.duration,end,end+EVENT_RETENTION_S]:[])),...rest]);
  return out===FENCE_REFUSED?held():apiJson({eventId:id,revision:rev+1});
}
const RESPONSES:Readonly<Record<string,RsvpStatus>>={confirmed:'yes',tentative:'tentative',unavailable:'no',late:'yes',substitute:'tentative'};
async function rsvp(env:Env,ctx:CommunityContext,team:string,b:Body){
  const id=eventId(b.eventId),revision=integer(b.revision,1,2147483647,'the event revision'),s=ctx.subject!,nonce=randomToken();
  if(typeof b.answer!=='string'||!Object.hasOwn(RESPONSES,b.answer))throw new CalendarInput('Choose a current response.');
  const standing=fenceSql('confirmedGuildData',2,3,14,s.privacyGeneration,s.accountIncarnation);
  const writes=rsvpStatements(env,{eventId:id,me:s.discordId,status:RESPONSES[b.answer]!,character:null,raidRole:null,
    keepChar:true,keepRole:true,revision:integer(b.rsvpRevision??0,0,2147483647,'the current RSVP revision'),anyRevision:false,eventRevision:revision,nonce,newRef:randomToken(),at:now(),limit:scanLimit(env),
    fence:`${standing} AND ${linkedInvitation('e.id','?18','?2')} AND EXISTS(SELECT 1 FROM raid_teams316 WHERE id=?18 AND status<>'inactive')`,
    teamScope:{id:team,currentInvite:linkedInvitation('e.id','?18','o.discord_id')},sessionVersion:s.sessionVersion,expiresAt:s.expiresAt,remindMention:null});
  writes.push(env.DB.prepare(`UPDATE raid_team_invites316 SET answer=?3,answer_nonce=?4 WHERE event_id=?1 AND seat_id IN
    (SELECT id FROM raid_team_seats316 WHERE team_id=?5 AND discord_id=?2)
    AND EXISTS(SELECT 1 FROM community_event_signups r WHERE r.event_id=?1 AND r.discord_id=?2 AND r.write_nonce=?4)`)
    .bind(id,s.discordId,b.answer,nonce,team));
  return (await admitted(env,ctx,writes))===FENCE_REFUSED?held():apiJson({eventId:id,answer:b.answer});
}
async function attendance(env:Env,ctx:CommunityContext,team:string,b:Body){
  if(!ctx.features.has('attendance'))return missing();
  const id=eventId(b.eventId),rev=integer(b.revision,1,2147483647,'the event revision'),
    rowRev=integer(b.attendanceRevision,0,2147483647,'the recorded attendance revision'),g=writeGate(ctx),nonce=randomToken();
  const seat=b.seatId,state=b.state;
  if(typeof seat!=='string'||seat.length>64||typeof state!=='string'||!['present','absent','excused','unknown'].includes(state))throw new CalendarInput('Select an invited player and the observed attendance.');
  const eligible=`SELECT s.discord_id FROM raid_team_events316 x ${personalJoin} WHERE x.event_id=?5 AND x.team_id=?4 AND s.id=?7
    AND ${member('s.team_id','s.discord_id')} AND ${manager('x.team_id','?1')}`;
  const out=await admitted(env,ctx,[env.DB.prepare(`UPDATE community_events SET attendance_nonce=?8,attendance_generation=attendance_generation+1
    WHERE id=?5 AND revision=?6 AND starts_at<=${DB_NOW} AND retain_until>${DB_NOW} AND status='scheduled'
      AND ${attendanceUnlocked219('community_events.id')} AND ${g.sql} AND EXISTS(${eligible})
      AND COALESCE((SELECT revision FROM community_event_attendance WHERE event_id=?5 AND discord_id=(${eligible})),0)=?9
      AND ${calendarRoom('json_array(('+eligible+'))','?10')}`).bind(...g.args,team,id,rev,seat,nonce,rowRev,scanLimit(env)),
    env.DB.prepare(`INSERT INTO community_event_attendance(event_id,discord_id,state,source,recorded_by,recorded_at,revision,write_nonce)
      SELECT e.id,s.discord_id,?3,'officer',?4,${DB_NOW},1,?5 FROM community_events e JOIN raid_team_seats316 s ON s.id=?2
      WHERE e.id=?1 AND e.attendance_nonce=?5 ON CONFLICT(event_id,discord_id) DO UPDATE SET state=excluded.state,source=excluded.source,
      reason_code=NULL,recorded_by=excluded.recorded_by,recorded_at=excluded.recorded_at,revision=community_event_attendance.revision+1,write_nonce=excluded.write_nonce`)
    .bind(id,seat,state,ctx.subject!.discordId,nonce)]);
  return out===FENCE_REFUSED?held():apiJson({eventId:id,state,attendanceRevision:rowRev+1});
}
export async function handleRaidTeamCalendar316(request:Request,env:Env,ctx:CommunityContext):Promise<Response>{
  if(!ctx.features.has('events'))return missing();
  if(!ctx.subject||!ctx.capabilities.confirmedGuildData)return refusal(env,request,'confirmedGuildData');
  const path=new URL(request.url).pathname.slice(BASE.length);
  try{
    if(path==='my-next-raid')return request.method==='GET'?await mine(request,env,ctx):apiJson({error:'method_not_allowed'},405);
    const m=/^([a-f0-9-]{36})\/calendar$/i.exec(path);if(!m)return missing();
    const team=m[1]!;
    if(request.method==='GET')return await list(request,env,ctx,team);
    return apiJson({error:'method_not_allowed'},405);
  }catch(err){if(err instanceof CalendarInput)return apiJson({error:'invalid_schedule',message:err.message},400);throw err;}
}
export async function writeRaidTeamCalendar316(env:Env,ctx:CommunityContext,team:string,b:Body):Promise<Response>{
  try{
    switch(b.action){
      case 'schedule':return await schedule(env,ctx,team,b);
      case 'edit':case 'cancel':return await change(env,ctx,team,b);
      case 'rsvp':return await rsvp(env,ctx,team,b);
      case 'attendance':return await attendance(env,ctx,team,b);
      default:throw new CalendarInput('Choose a calendar action.');
    }
  }catch(err){if(err instanceof CalendarInput)return apiJson({error:'invalid_schedule',message:err.message},400);throw err;}
}
