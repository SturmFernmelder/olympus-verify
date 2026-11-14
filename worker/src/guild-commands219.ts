/** Verify owns these commands in the main guild. Replies are ephemeral. Only an
 * explicitly armed one-shot reminder uses the configured public raid channel;
 * local/live registration checks never create a raid or send a test notice. */
import type { Env } from './env';
import { isOlympusHub224, olympusHub224, olympusModal224 } from './olympus-hub224';
import { isRaidHub222, raidHub222, raidModal222, raidAutocomplete222, assertHubRows222, type HubRow222 } from './raid-hub222';
import { API, credentialFetch, json, reply, subcommand, type Interaction } from './discord';
import { now } from './db';
import { rateLimited } from './site-core';
import { destination, type ActionRow } from './community-event-delivery';
import { runEventReminders } from './community-event-reminders';
import { captureGuildActor219, currentGuildActor219, guildActorBatch219, type GuildActor219 } from './guild-command-authority219';
import { GUILD_COMMAND_NAMES_228 } from './guild-command-definitions228';
import { workshopOrderDraft221 } from './guild-workshop-order221';
import { createCalendar219, readCalendar219, calendarRoster219, rsvpCalendar219, attendanceCalendar219, eventId219, type CalendarEvent219, ROSTER_PAGE_219 } from './guild-calendar219';
import { consentCalendarReminder219 } from './guild-reminder219';
import { RSVP_CHOICES_219 } from './guild-calendar-metadata219';
import { guideLookup219, workshopLookup219, referenceLookup219, safeDiscordText219, type GuildEmbed219 } from './guild-utilities219';
import { siteMemberLink } from './site-return';
import {capturePrivateComponent280} from './private-component280';

const COMPONENT=/^raid219:rsvp:([A-Za-z0-9_-]{22}):([1-9][0-9]{0,8}):(tank|healer|melee|ranged|tentative|bench|absent)$/;
export const isGuildCommand219=(i:Interaction):boolean=>isOlympusHub224(i)||isRaidHub222(i)||(i.type===2&&GUILD_COMMAND_NAMES_228.has(i.data?.name??''))||(i.type===3&&COMPONENT.test(i.data?.custom_id??''));
export function guildCommandReadOnly219(i:Interaction):boolean {
 if(isOlympusHub224(i))return true;
 if(i.type!==2||!GUILD_COMMAND_NAMES_228.has(i.data?.name??''))return false;
 return !['raid','event'].includes(i.data!.name!)||['list','roster'].includes(subcommand(i)??'');
}
const options219=(i:Interaction):Record<string,unknown>=>{
 const sub=i.data?.options?.find(row=>row.type===1),rows=sub?.options??i.data?.options??[];
 return Object.fromEntries(rows.filter(row=>typeof row.name==='string'&&Object.hasOwn(row,'value')).map(row=>[row.name,row.value]));
};
const page219=(value:unknown)=>{if(value===undefined)return 1;if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>100)throw Error('Choose a page from 1 to 100.');return Number(value);};
export function rsvpComponents219(event:Pick<CalendarEvent219,'id'|'revision'>,host:string):ActionRow[] {
 const buttons=RSVP_CHOICES_219.map(choice=>({type:2 as const,style:choice==='absent'?2:3,label:choice[0]!.toUpperCase()+choice.slice(1),custom_id:`raid219:rsvp:${event.id}:${event.revision}:${choice}`}));
 return [{type:1,components:buttons.slice(0,4)},{type:1,components:[...buttons.slice(4),{type:2,style:5,label:'Open calendar',url:siteMemberLink(host,'community/calendar/'+event.id)}]}];
}
export interface Answer219 {content?:string;embeds?:GuildEmbed219[];components?:(ActionRow|HubRow222)[]}
export function assertGuildAnswer219(answer:Answer219):void {
 if((answer.content?.length??0)>2000||(answer.embeds?.length??0)>10||(answer.components?.length??0)>5)throw Error('This result exceeds Discord limits. Open the complete website view.');
 let chars=0;
 for(const embed of answer.embeds??[]){
  if(embed.title.length>256||(embed.description?.length??0)>4096||(embed.fields?.length??0)>25||(embed.footer?.text.length??0)>2048)throw Error('This result exceeds Discord limits. Open the complete website view.');
  chars+=embed.title.length+(embed.description?.length??0)+(embed.footer?.text.length??0);
  for(const field of embed.fields??[]){if(field.name.length>256||field.value.length>1024)throw Error('This result exceeds Discord limits. Open the complete website view.');chars+=field.name.length+field.value.length;}
 }
 assertHubRows222(answer.components??[]);
 if(chars>6000)throw Error('This result exceeds Discord limits. Open the complete website view.');
}
const eventEmbed219=(e:CalendarEvent219,host:string):GuildEmbed219=>({title:safeDiscordText219(e.title,80),url:siteMemberLink(host,'community/calendar/'+e.id),description:`<t:${e.starts_at}:F> · <t:${e.starts_at}:R>\n${e.duration_min} minutes · ${e.capacity??'No fixed'} signup cap\nID: \`${e.id}\`\n${safeDiscordText219(e.details,500)}`,footer:{text:'Signup preferences are not an organizer roster acceptance. Bench is a request, not a staff decision.'}});
export async function executeGuildCommand219(env:Env,a:GuildActor219,i:Interaction):Promise<Answer219> {
 if(isOlympusHub224(i))return olympusHub224(env,a,i);
 if(isRaidHub222(i))return raidHub222(env,a,i);
 const name=i.data?.name??'',sub=subcommand(i)??'',v=options219(i),host=destination(env)!.host,component=COMPONENT.exec(i.data?.custom_id??'');
 if(component){
  const ok=await rsvpCalendar219(env,a,component[1]!,Number(component[2]),component[3]!);
  return {content:ok?`${component[3]==='bench'?'Bench requested; the organizer’s separate roster decision is unchanged.':'Your '+component[3]+' preference was saved.'} Change it on the newest event notice or calendar.`:'Nothing changed. The event, roster capacity, account or button revision is no longer current. Open the calendar and check your signup.'};
 }
 if(name==='guide'||name==='forever'){
  const aliases:Readonly<Record<string,string>>={guide:'class',talents:'talent',consumables:'consumes',buffs:'buffs',attunement:'attunement'};
  return {embeds:[await guideLookup219(env,a,name==='forever'?(aliases[sub]??''):sub,v)]};
 }
 if(name==='workshop')return {embeds:[sub==='order'?workshopOrderDraft221(env,v):await workshopLookup219(env,a,v.query??v.search,page219(v.page))]};
 if(!['raid','event'].includes(name))return {embeds:[await referenceLookup219(env,a,name)]};
 if(['schedule','create'].includes(sub)){
  const event=await createCalendar219(env,a,v);
  return {content:'Created on the website calendar. These private buttons update your own signup. Use /raid list or /raid roster to share the event ID; /raid remind explicitly arms the one public reminder.',embeds:[eventEmbed219(event,host)],components:rsvpComponents219(event,host)};
 }
 if(sub==='list'){
  const events=await readCalendar219(env,a,undefined,page219(v.page));
  return {content:events.length?(events.length>5?'More events: request the next page. ':'')+'Buttons below apply to the FIRST event shown. Open /raid roster with any other event ID for its own buttons.':'No upcoming events are currently scheduled.',embeds:events.slice(0,5).map(e=>eventEmbed219(e,host)),components:events[0]?rsvpComponents219(events[0],host):[]};
 }
 const id=eventId219(v.id),event=(await readCalendar219(env,a,id))[0];if(!event)throw Error('This calendar event is unavailable.');
 if(sub==='roster'){
  const rows=await calendarRoster219(env,a,id,page219(v.page));
  return {embeds:[{title:safeDiscordText219(event.title,80)+' · roster',url:siteMemberLink(host,'community/calendar/'+id),description:rows.length?rows.slice(0,ROSTER_PAGE_219).map(row=>safeDiscordText219(row.display_name,60)+(row.character_name?' / '+safeDiscordText219(row.character_name,40)+' (declared)':'')+' — '+safeDiscordText219(row.preference??row.raid_role??row.status,20)+(row.decision?' · officer: '+safeDiscordText219(row.decision,15):'')+(row.attendance_visible===1?' · own attendance: '+safeDiscordText219(row.attendance??'unrecorded',15):' · attendance private')).join('\n'):'No current eligible signups.',footer:{text:(rows.length>ROSTER_PAGE_219?'More rows: use the next roster page. ':'')+'Tentative / requested Bench / Absent are preferences. Missing attendance stays unrecorded; it is never inferred as absence.'}}],components:event.status==='scheduled'&&event.starts_at>now()?rsvpComponents219(event,host):[]};
 }
 if(sub==='rsvp'){
  const ok=await rsvpCalendar219(env,a,id,event.revision,String(v.choice));
  return {content:ok?'Your signup preference was saved. Requested Bench does not grant or change an organizer roster decision.':'Nothing changed. The event may have started, filled or changed; check the current calendar.'};
 }
 if(sub==='remind'){
  const op=await consentCalendarReminder219(env,a,id,String(v.mode));
  if(!op)throw Error('No reminder change was confirmed. A previously sent, claimed or unknown reminder cannot be armed again; check its status on the website.');
  if(op==='cancelled')return {content:'Reminder cancelled or marked for its existing cleanup process. A message already in flight can remain unknown until reconciled.'};
  if(v.mode==='now')await runEventReminders(env,{eventId:id,opId:op});
  const rows=await guildActorBatch219(env,a,[env.DB.prepare('SELECT state,starts_at FROM community_event_reminders WHERE event_id=?1 AND op_id=?2').bind(id,op)]),row=rows[0]!.results[0] as {state:string;starts_at:number}|undefined;
  return {content:row?.state==='posted'?'The one authorized reminder was delivered to the configured raid channel.':row?.state==='armed'?'One reminder is armed. The ordinary quarter-hour cron sends at the next eligible tick within one hour before start. This is one reminder, not a post every 15 minutes.':'Reminder outcome: '+safeDiscordText219(row?.state??'unconfirmed',30)+'. Do not retry an unknown send; use the website custody/reconciliation view.'};
 }
 if(sub==='attendance'){
  const ok=await attendanceCalendar219(env,a,id,String(v.action),v.member,v.state);
  return {content:ok?(v.action==='lock'?'The post-start attendance record is locked against further website and command edits. Unrecorded members remain unrecorded.':'The explicitly observed attendance state was recorded. Use attendance lock when the record is complete.'):'Nothing changed. Attendance requires a started event and an unlocked record; select an existing signup or listed member.'};
 }
 throw Error('Choose a supported calendar subcommand.');
}
/** Token stays in this original in-memory continuation only. It is never
 * persisted, printed, placed in audit fields or passed to an automatic retry. */
export async function handleGuildCommand219(env:Env,i:Interaction,signedAt:number,defer?:(work:()=>Promise<unknown>)=>void):Promise<Response> {
 if(!isGuildCommand219(i))return reply('Unknown guild command.');
 const privateUpdate=capturePrivateComponent280(env,i,signedAt,'hub');
 if(!defer||typeof i.token!=='string'||i.token.length<20||i.token.length>2048||!/^[A-Za-z0-9_.-]+$/.test(i.token))return i.type===4?json({type:8,data:{choices:[]}}):reply('This command could not start. Open the guild website or run a fresh command.');
 let a:GuildActor219;
 try{a=await captureGuildActor219(env,i,now(),signedAt);}catch{return i.type===4?json({type:8,data:{choices:[]}}):reply('Verify a character and sign in on the Olympus website first. This command needs a current, eligible site account in this server.');}
 if(rateLimited('gc219:'+a.id,30,60))return i.type===4?json({type:8,data:{choices:[]}}):reply('Too many guild commands in one minute. Wait a moment before trying again.');
 try{if(i.type===4&&isRaidHub222(i))return json(await raidAutocomplete222(env,a,i));const modal=isOlympusHub224(i)?olympusModal224(i,a):isRaidHub222(i)?raidModal222(i,a):null;if(modal)return json(modal);}catch{return i.type===4?json({type:8,data:{choices:[]}}):reply('This private control expired or changed. Open /olympus or the raid hub again.');}
 const update=privateUpdate(a.id),path=`${API}/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`;
 defer(async()=>{
  let answer:Answer219;
  try{answer=await executeGuildCommand219(env,a,i);assertGuildAnswer219(answer);}catch(e){answer={content:e instanceof Error&&e.message.length<=300&&!/https?:|token|secret|SQL|constraint/i.test(e.message)?e.message:'The command could not be confirmed. Check the current website state before any repeat action.'};}
  if(!await currentGuildActor219(env,a))answer={content:'Your account or original request changed. This response is held; sign in on the website again.'};
  // New interaction required after expiry. No token refresh, background replay,
  // public fallback, follow-up POST or retry is permitted.
  if(now()>=a.deadline||update&&!privateUpdate(a.id))return;
  try{const response=await credentialFetch(path,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'',embeds:[],components:[],...answer,allowed_mentions:{parse:[]}})},()=>{if(now()>=a.deadline||update&&!privateUpdate(a.id))throw Error('guild_reply_expired_or_changed');});if(!response.ok)console.warn("guild_command_private_reply_unavailable",response.status);await response.body?.cancel();}catch{/* private answer unavailable; no retry */}
 });
 return update?json({type:6}):json({type:5,data:{flags:64}});
}
