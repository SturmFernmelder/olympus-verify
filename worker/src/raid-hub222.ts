/** Private calendar controls. Every click recaptures the account and current
 * guild eligibility; mutations still use the original guarded calendar APIs.
 * No hub state, interaction token or attendance preference is persisted here. */
import type { Env } from './env';
import type { Interaction } from './discord';
import { focusedOption, option, subcommand } from './discord';
import { now } from './db';
import { destination } from './community-event-delivery';
import { runEventReminders } from './community-event-reminders';
import { guildStaffNow219, guildActorBatch219, type GuildActor219 } from './guild-command-authority219';
import { DB_NOW, communityFeatures } from './community-context';
import { readCalendar219, createCalendar219, calendarRoster219, attendanceCalendar219, rsvpCalendar219, eventId219, type CalendarEvent219 } from './guild-calendar219';
import { consentCalendarReminder219 } from './guild-reminder219';
import { safeDiscordText219, plainDiscordLabel280, type GuildEmbed219 } from './guild-utilities219';
import { siteMemberLink } from './site-return';

type Button222={type:2;style:number;label:string;custom_id?:string;url?:string};
type Select222={type:3|5;custom_id:string;placeholder:string;min_values:1;max_values:1;options?:{label:string;value:string;description?:string}[]};
export type HubRow222={type:1;components:(Button222|Select222)[]};
export interface HubAnswer222 {content?:string;embeds?:GuildEmbed219[];components?:HubRow222[]}
const CID=/^r222:([0-9]{17,20}):([0-9]{10}):([a-z]{2,10}):(-|[A-Za-z0-9_-]{22}):([0-9]{1,9}):([0-9]{1,3})(?::([0-9]{17,20}))?$/;
const choices=['tank','healer','melee','ranged','tentative','bench','absent'];
export function isRaidHub222(i:Interaction):boolean {
 if((i.type===2||i.type===4)&&i.data?.name==='raid'){
  const sub=subcommand(i);
  // Discord can still send the old bare command and top-level find during registration.
  return sub===undefined||sub==='hub';
 }
 return (i.type===3||i.type===5)&&(i.data?.custom_id??'').startsWith('r222:');
}
function parsed(i:Interaction,a:GuildActor219){
 const m=CID.exec(i.data?.custom_id??'');if(!m||m[1]!==a.id||Number(m[2])<=now()||Number(m[2])>a.deadline||Number(m[6])>100)throw Error('This private control has expired. Open the raid hub again.');
 return {action:m[3]!,id:m[4]!,revision:Number(m[5]),page:Number(m[6]),target:m[7]};
}
function cid(a:GuildActor219,action:string,event?:CalendarEvent219,page=1,target?:string){return ['r222',a.id,a.deadline,action,event?.id??'-',event?.revision??0,page,...(target?[target]:[])].join(':');}
const button=(label:string,id:string,style=2):Button222=>({type:2,style,label,custom_id:id});
const row=(...components:(Button222|Select222)[]):HubRow222=>({type:1,components});
function selected(i:Interaction,type=3){const values=i.data?.values;if(i.type!==3||i.data?.component_type!==type||!Array.isArray(values)||values.length!==1||typeof values[0]!=='string')throw Error('Choose one current option.');return values[0];}
function modalFields(i:Interaction,keys:readonly string[]){
 const out:Record<string,string>={};const rows=i.data?.components;if(!Array.isArray(rows)||rows.length!==keys.length)throw Error('The form is incomplete.');
 for(const r of rows){if(r.type!==1||r.components?.length!==1)throw Error('The form is incomplete.');const f=r.components[0]!;if(f.type!==4||typeof f.custom_id!=='string'||!keys.includes(f.custom_id)||Object.hasOwn(out,f.custom_id)||typeof f.value!=='string'||f.value.length>500)throw Error('The form is incomplete.');out[f.custom_id]=f.value.trim();}
 return out;
}
/** Modals must be the initial response, rather than a deferred edit. Opening a
 * form never creates an event or authorizes a public reminder. */
export function raidModal222(i:Interaction,a:GuildActor219):unknown|null {
 if(i.type!==3)return null;const p=parsed(i,a);
 const definitions:Record<string,{title:string;fields:[string,string,number,boolean][]}>={
  create:{title:'Schedule an Olympus event',fields:[['title','Event title',80,true],['starts','Start: ISO time with Z / UTC offset',40,true],['minutes','Duration: 15–720 minutes',3,true],['capacity','Signup cap: 1–100 (blank: no cap)',3,false],['details','Preparation notes (guild-visible)',500,false]]},
  find:{title:'Open a calendar event',fields:[['id','Event ID from the calendar',22,true]]},
  remind:{title:'Confirm one event reminder',fields:[['mode','ARM, NOW (within one hour), or CANCEL',6,true]]},
  lock:{title:'Finalize recorded attendance',fields:[['confirm','Type LOCK; unrecorded stays unrecorded',4,true]]}
 };
 const def=definitions[p.action];if(!def)return null;
 return {type:9,data:{custom_id:cid(a,p.action==='create'?'save':p.action==='find'?'open':p.action==='remind'?'send':'final',p.id==='-'?undefined:{id:p.id,revision:p.revision} as CalendarEvent219,p.page),title:def.title,components:def.fields.map(([custom_id,label,max_length,required])=>({type:1,components:[{type:4,custom_id,label,style:max_length>100?2:1,max_length,required}]}))}};
}
export async function raidAutocomplete222(env:Env,a:GuildActor219,i:Interaction){
 const focused=focusedOption(i);
 if(focused?.name!=='find'||!communityFeatures(env).has('events'))return {type:8,data:{choices:[]}};
 const term=focused.value.toLowerCase().slice(0,80);
 const out=await guildActorBatch219(env,a,[env.DB.prepare('SELECT id,title,starts_at FROM community_events WHERE retain_until>'+DB_NOW+" AND status='scheduled' AND starts_at>"+DB_NOW+' AND (id=?1 OR instr(lower(title),?1)>0) ORDER BY starts_at,id LIMIT 25').bind(term)]);
 const events=out[0]!.results as unknown as Pick<CalendarEvent219,'id'|'title'|'starts_at'>[];
 return {type:8,data:{choices:events.filter(e=>(e.title+' '+e.id).toLowerCase().includes(term)).slice(0,5).map(e=>({name:plainDiscordLabel280(e.title,75)+' · '+new Date(e.starts_at*1000).toISOString().slice(0,16)+'Z',value:e.id}))}};
}
export async function raidHub222(env:Env,a:GuildActor219,i:Interaction):Promise<HubAnswer222>{
 const find=i.type===2?option<unknown>(i,'find'):undefined;
 const p=i.type===2?{action:'hub',id:typeof find==='string'?eventId219(find):'-',revision:0,page:1,target:undefined}:parsed(i,a);
 const host=destination(env)!.host,staff=await guildStaffNow219(env,a);
 let note='',event:CalendarEvent219|undefined;
 if(i.type===5&&p.action==='save'){
  const f=modalFields(i,['title','starts','minutes','capacity','details']);
  if(!/^[0-9]{2,3}$/.test(f.minutes!)||(f.capacity&&!/^[0-9]{1,3}$/.test(f.capacity)))throw Error('Use whole numbers for minutes and the signup cap.');
  event=await createCalendar219(env,a,{...f,minutes:Number(f.minutes),capacity:f.capacity?Number(f.capacity):undefined});note='Event created. No public announcement or reminder was sent.';
 }else if(i.type===5&&p.action==='open'){const f=modalFields(i,['id']);p.id=eventId219(f.id);}
 if(!event&&p.id!=='-')event=(await readCalendar219(env,a,p.id))[0];
 if(p.id!=='-'&&!event)throw Error('This event is unavailable. Open the raid hub to check the current calendar.');
 if(event&&p.revision&&p.revision!==event.revision)throw Error('This event changed. Open a fresh hub before acting.');
 if(['send','final','attend','person','record','remind','lock'].includes(p.action)&&!staff)throw Error('Only a currently eligible event organizer may use these controls.');
 if(i.type===5&&p.action==='send'&&event){
  const f=modalFields(i,['mode']),mode=f.mode!.toLowerCase();if(!['arm','now','cancel'].includes(mode))throw Error('Enter ARM, NOW or CANCEL. Unknown reminders cannot be resent.');
  const op=await consentCalendarReminder219(env,a,event.id,mode);if(!op)throw Error('No reminder change was confirmed. Check the existing receipt; do not retry an unknown send.');
  if(mode==='now'&&op!=='cancelled')await runEventReminders(env,{eventId:event.id,opId:op});
  note=mode==='cancel'?'Cancellation recorded; an in-flight result may remain unknown.':'One reminder request recorded. The calendar shows its actual delivery state; no repeat send is implied.';
 }
 if(i.type===5&&p.action==='final'&&event){const f=modalFields(i,['confirm']);if(f.confirm!=='LOCK')throw Error('Nothing changed. Type LOCK to finalize attendance.');const ok=await attendanceCalendar219(env,a,event.id,'lock',undefined,undefined);note=ok?'Attendance locked. Missing observations stay unrecorded.':'Nothing changed. The event must have started and attendance must still be unlocked.';}
 if(p.action==='rsvp'&&event){const choice=selected(i);if(!choices.includes(choice))throw Error('Choose a current signup preference.');const ok=await rsvpCalendar219(env,a,event.id,event.revision,choice);note=ok?'Your preference was saved. Bench is a request, not an organizer decision.':'Nothing changed. This event may have started, filled or changed.';}
 if(p.action==='record'&&event){const state=selected(i);if(!p.target||!['present','absent','excused','unknown'].includes(state))throw Error('Choose an observed attendance state.');const ok=await attendanceCalendar219(env,a,event.id,'record',p.target,state);note=ok?'Observed attendance recorded.':'Nothing changed. Choose an existing signup in a started, unlocked event.';}
 const events=event?[]:await readCalendar219(env,a,undefined,p.page);
 const calendarLink=siteMemberLink(host,'community/calendar'+(event?'/'+event.id:''));
 const embeds:GuildEmbed219[]=[{title:event?safeDiscordText219(event.title,80):'Olympus raid & event hub',url:calendarLink,description:event?'<t:'+event.starts_at+':F> · '+event.duration_min+' minutes\n'+safeDiscordText219(event.details,500)+'\nEvent ID: '+event.id:events.length?'Choose an event below to view its roster or set your signup preference.':'No upcoming events are currently scheduled.',footer:{text:'Private controls expire after three minutes. Roles, event revisions and eligibility are checked again on every action.'}}];
 const components:HubRow222[]=[];
 if(event){
  if(p.action==='roster'){const people=await calendarRoster219(env,a,event.id,p.page);embeds[0]!.description+='\n\n'+(people.slice(0,20).map(r=>safeDiscordText219(r.display_name,50)+' — '+safeDiscordText219(r.preference??r.raid_role??r.status,20)+(r.attendance_visible===1?' · '+safeDiscordText219(r.attendance??'unrecorded',15):'')).join('\n')||'No current eligible signups.');components.push(row(button('Previous roster page',cid(a,'roster',event,Math.max(1,p.page-1))),button('Next roster page',cid(a,'roster',event,Math.min(100,p.page+1)))));}
  if(p.action==='attend')components.push(row({type:5,custom_id:cid(a,'person',event),placeholder:'Choose a signup whose attendance you observed',min_values:1,max_values:1}));
  else if(p.action==='person'){const target=selected(i,5);if(!/^[0-9]{17,20}$/.test(target))throw Error('Choose one Discord member.');note='Attendance for <@'+target+'>. Choose only what you directly observed.';components.push(row({type:3,custom_id:cid(a,'record',event,1,target),placeholder:'Observed attendance',min_values:1,max_values:1,options:['present','absent','excused','unknown'].map(value=>({label:value,value}))}));}
  else if(event.status==='scheduled'&&event.starts_at>now())components.push(row({type:3,custom_id:cid(a,'rsvp',event),placeholder:'Your signup preference',min_values:1,max_values:1,options:choices.map(value=>({label:value[0]!.toUpperCase()+value.slice(1),value,description:value==='bench'?'Request Bench; does not change the officer roster':'Your preference; the organizer reviews the roster'}))}));
  components.push(row(button('View roster',cid(a,'roster',event)),button('All upcoming events',cid(a,'hub')), {type:2,style:5,label:'Open calendar',url:calendarLink}));
  if(staff)components.push(row(button('One reminder…',cid(a,'remind',event)),button('Record attendance',cid(a,'attend',event)),button('Lock attendance…',cid(a,'lock',event))));
 }else{
  if(events.length)components.push(row({type:3,custom_id:cid(a,'choose',undefined,p.page),placeholder:'Choose a raid or guild event',min_values:1,max_values:1,options:events.slice(0,5).map(e=>({label:plainDiscordLabel280(e.title,80),value:e.id,description:new Date(e.starts_at*1000).toISOString().slice(0,16)+'Z · '+e.duration_min+' minutes'}))}));
  const nav:Button222[]=[button('Open event by ID…',cid(a,'find'))];if(p.page>1)nav.push(button('Previous events',cid(a,'hub',undefined,p.page-1)));if(events.length>5&&p.page<100)nav.push(button('More events',cid(a,'hub',undefined,p.page+1)));if(staff)nav.push(button('Schedule an event…',cid(a,'create'),1));components.push(row(...nav));
  components.push(row({type:2,style:5,label:'Guild calendar',url:calendarLink},{type:2,style:5,label:'Raid preparation',url:siteMemberLink(host,'resources')}));
 }
 if(p.action==='choose'){const id=eventId219(selected(i));return raidHub222(env,a,{...i,type:2,data:{name:'raid',options:[{type:3,name:'find',value:id}]}});}
 return {content:note||undefined,embeds,components};
}
export function assertHubRows222(rows:HubRow222[]){
 if(rows.length>5)throw Error('Too many control rows.');
 for(const r of rows){if(r.type!==1||!r.components.length||r.components.length>5)throw Error('Invalid control row.');for(const c of r.components){
  if((c.custom_id?.length??0)>100)throw Error('Control ID too long.');
  if(c.type===2){if(c.label.length>80)throw Error('Control label too long.');}
  else if(r.components.length!==1||c.placeholder.length>150||c.min_values!==1||c.max_values!==1||(c.type===3&&(!c.options?.length||c.options.length>25||c.options.some(o=>o.label.length>100||o.value.length>100||(o.description?.length??0)>100))))throw Error('Invalid selection menu.');
 }}
}
