/** Explicit slash consent to the same one-shot, durable reminder protocol used
 * by the website. Unknown/claimed/posted operations never become retryable. */
import type { Env } from './env';
import { DB_NOW, communityFeatures, randomToken } from './community-context';
import { contentOf, destination } from './community-event-delivery';
import { guildActorBatch219, guildActorFence219, guildStaffNow219, type GuildActor219 } from './guild-command-authority219';
import { eventId219, readCalendar219 } from './guild-calendar219';
import { markerPrefix219 } from './guild-calendar-metadata219';

export async function consentCalendarReminder219(env:Env,a:GuildActor219,eventId:string,mode:string):Promise<string|null> {
 if(!await guildStaffNow219(env,a))throw Error('Reminders require a currently verified Raid Leader, Officer, High Councillor or site Admin.');
 if(!['arm','now','cancel'].includes(mode))throw Error('Choose arm, now or cancel.');
 const id=eventId219(eventId),d=destination(env);
 if(!d||env.EVENT_DISCORD_DELIVERY!=='on'||env.EVENT_DISCORD_REMINDERS!=='on'||!communityFeatures(env).has('events'))throw Error('Discord event reminders are switched off.');
 const event=(await readCalendar219(env,a,id))[0];if(!event)throw Error('This event is unavailable.');
 const op=randomToken(),fence=guildActorFence219(env,a,2);
 if(mode==='cancel'){
  const out=await guildActorBatch219(env,a,[env.DB.prepare(`UPDATE community_event_reminders SET state=CASE WHEN state IN('claimed','unknown') THEN 'unknown' WHEN state='posted' THEN state ELSE 'cancelled' END,
   cleanup_requested=CASE WHEN message_id IS NOT NULL OR state IN('claimed','unknown') THEN 1 ELSE cleanup_requested END,updated_at=${DB_NOW}
   WHERE event_id=?1 AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND op_id NOT LIKE 'team316:%') AND ${fence}`).bind(id,a.id)]);
  return out[0]?.meta.changes===1?'cancelled':null;
 }
 const current=`EXISTS(SELECT 1 FROM community_event_reminders WHERE event_id=?1 AND actor=?2 AND op_id=?3 AND state='armed')`;
 const out=await guildActorBatch219(env,a,[env.DB.prepare(`INSERT INTO community_event_reminders(event_id,event_revision,starts_at,actor,consent_version,consent_account_incarnation,guild_id,channel_id,host,op_id,state,frozen_content,created_at,updated_at,last_attempt_at,retain_until)
  SELECT e.id,e.revision,e.starts_at,?2,?4,?5,?6,?7,?8,?3,'armed',?9,${DB_NOW},${DB_NOW},0,e.retain_until FROM community_events e
  WHERE e.id=?1 AND e.op_id NOT LIKE 'team316:%' AND e.reminder_closed=0 AND e.status='scheduled' AND e.starts_at>${DB_NOW} AND e.starts_at<=e.created_at+366*86400 AND e.retain_until>${DB_NOW} AND e.revision=?10 AND ${fence}
  ON CONFLICT(event_id) DO UPDATE SET event_revision=excluded.event_revision,starts_at=excluded.starts_at,actor=excluded.actor,consent_version=excluded.consent_version,consent_account_incarnation=excluded.consent_account_incarnation,
   guild_id=excluded.guild_id,channel_id=excluded.channel_id,host=excluded.host,op_id=excluded.op_id,state='armed',frozen_content=excluded.frozen_content,claim_nonce=NULL,mention_ids=NULL,updated_at=${DB_NOW},last_attempt_at=0,retain_until=MIN(community_event_reminders.retain_until,excluded.retain_until)
  WHERE community_event_reminders.retain_until>${DB_NOW} AND community_event_reminders.state IN('armed','cancelled','refused') AND community_event_reminders.message_id IS NULL AND community_event_reminders.cleanup_requested=0`)
  .bind(id,a.id,op,a.version,a.birth,d.guild,d.channel,d.host,'**Raid reminder**\n'+contentOf(event,d),event.revision),
  env.DB.prepare(`DELETE FROM community_event_changes WHERE event_id=?1 AND actor=?2 AND ${markerPrefix219('organizer219')} AND ${current}`).bind(id,a.id,op),
  env.DB.prepare(`INSERT INTO community_event_changes(event_id,action,actor,at,fields) SELECT ?1,'updated',?2,${DB_NOW},?4 WHERE ${current}`).bind(id,a.id,op,JSON.stringify(['organizer219','reminder',op])),
  env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?2,'community.event_reminder_consent',?1,NULL WHERE ${current}`).bind(id,a.id,op)]);
 return out[0]?.meta.changes===1?op:null;
}
