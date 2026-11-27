import { DB_NOW, communityFeatures, organizerIds, qualifiesSql } from './community-context';
import { eventWarHeadForAccount } from './community-event-delivery';
import { rosterDecisionSql } from './community-events';
import { eventParticipantNameSql226, eventParticipantSql226 } from './guild-event-owner226';
import { guildActorBatch219, guildActorFence219, guildCalendarRolesNow219, type GuildActor219 } from './guild-command-authority219';
import { type CalendarEvent219, eventId219 } from './guild-calendar219';
import { now } from './db';
import { siteAdmins } from './site-core';
import type { Env } from './env';

type Manager = { sql:string; values:readonly string[] };
type Roles = Awaited<ReturnType<typeof guildCalendarRolesNow219>>;
type Signup = { discord_id:string; label:string; decision:string|null; decision_revision:number };
const ID=/^[1-9]\d{16,19}$/;
const EVENT_OPEN=`e.op_id NOT LIKE 'team316:%' AND e.status='scheduled' AND e.starts_at>${DB_NOW} AND e.retain_until>${DB_NOW}`;

/** Discord controls have a signed actor. Reusing a website session here would
 * lose that original actor's deadline, account birth, or privacy generation. */
async function manager(env:Env,a:GuildActor219,event:CalendarEvent219,firstWarParam:number,displayRoles?:Roles):Promise<Manager|null> {
  if (!communityFeatures(env).has('events')||event.status!=='scheduled'||event.starts_at<=now()) return null;
  const eligible=await env.DB.prepare(`SELECT e.created_by FROM community_events e WHERE e.id=?1 AND e.revision=?2
    AND ${EVENT_OPEN} AND ${qualifiesSql('?3')} AND ${guildActorFence219(env,a,3)}`).bind(eventId219(event.id),event.revision,a.id).first<{created_by:string|null}>();
  if (!eligible) return null;
  if (siteAdmins(env).has(a.id)) return {sql:'1',values:[]};
  const own=eligible.created_by===a.id;
  if (own && organizerIds(env).has(a.id)) return {sql:'e.created_by=?5',values:[]};
  const roles=displayRoles??await guildCalendarRolesNow219(env,a.id,a.guild);
  if (roles.council) return {sql:'1',values:[]};
  if (own && roles.officer) return {sql:'e.created_by=?5',values:[]};
  const war=await eventWarHeadForAccount(env,a.id);
  return war?.condition(firstWarParam) ?? null;
}

export async function mayAssignRaid307(env:Env,a:GuildActor219,event:CalendarEvent219,displayRoles:Roles):Promise<boolean> {
  return !!await manager(env,a,event,9,displayRoles);
}

/** The picker contains only actual, currently eligible signups. The optional
 * subject read obtains the revision that will be shown on the decision menu. */
export async function raidAssignmentChoices307(env:Env,a:GuildActor219,event:CalendarEvent219,until:number,page:number,subject?:string):Promise<Signup[]> {
  if (!Number.isSafeInteger(page)||page<1||page>100||!Number.isSafeInteger(until)||until>a.deadline||until<=now()||(subject!==undefined&&!ID.test(subject))) return [];
  const permitted=await manager(env,a,event,8);
  if (!permitted) return [];
  const results=await guildActorBatch219(env,a,[env.DB.prepare(`SELECT s.discord_id,${eventParticipantNameSql226(env,'u')} AS label,s.decision,s.decision_revision
    FROM community_event_signups s JOIN community_events e ON e.id=s.event_id JOIN site_users u ON u.discord_id=s.discord_id
    WHERE e.id=?1 AND e.revision=?2 AND (?3 IS NULL OR s.discord_id=?3) AND ${DB_NOW}<?4 AND ${EVENT_OPEN}
    AND (${permitted.sql}) AND ${qualifiesSql('?5')} AND ${guildActorFence219(env,a,5)} AND ${eventParticipantSql226(env,'s.discord_id')}
    ORDER BY s.updated_at,s.discord_id LIMIT ?6 OFFSET ?7`).bind(event.id,event.revision,subject??null,until,a.id,21,(page-1)*20,...permitted.values)]);
  return results[0]!.results as Signup[];
}

export async function decideRaidSignup307(env:Env,a:GuildActor219,event:CalendarEvent219,until:number,subject:string,revision:number,decision:'accepted'|'bench'|null):Promise<boolean> {
  if (!ID.test(subject)||!Number.isSafeInteger(revision)||revision<0||!Number.isSafeInteger(until)||until>a.deadline||until<=now()
    ||(decision!==null&&decision!=='accepted'&&decision!=='bench')) return false;
  const permitted=await manager(env,a,event,9);
  if (!permitted) return false;
  const open=`${EVENT_OPEN} AND e.revision=?2 AND ${DB_NOW}<?8 AND (${permitted.sql})`;
  const target=`discord_id=?3 AND ${eventParticipantSql226(env,'?3')}`;
  const actor=`(${guildActorFence219(env,a,5)} AND ${qualifiesSql('?5')})`;
  const result=await guildActorBatch219(env,a,[
    env.DB.prepare(rosterDecisionSql(env,decision===null,target,open,actor)).bind(event.id,event.revision,subject,decision,a.id,now(),revision,until,...permitted.values),
    env.DB.prepare('UPDATE community_events SET signup_generation=signup_generation+1 WHERE id=?1 AND changes()=1').bind(event.id),
    env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?1,'community.roster_decided',?2,'{"entries":1}' WHERE changes()=1`).bind(a.id,event.id),
  ]);
  const row=result[0]!.results[0] as {discord_id?:string;decision?:string|null;revision?:number}|undefined;
  return row?.discord_id===subject && row.decision===decision && row.revision===revision+1;
}
