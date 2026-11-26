/** Both calendar surfaces exclude retiring participants from rosters and counts.
 * The production owner's exception still requires current account and ban checks. */
import type { Env } from './env';
import { qualifiesSql } from './community-context';
import { discordCommandOwner225, DISCORD_BOT_OWNER_225 } from './discord-command-owner225';
import { privacySubjectWritableSql } from './privacy-serving-authority';

export function eventOwnerEnabled226(env: Env): boolean {
  return discordCommandOwner225(env, DISCORD_BOT_OWNER_225, env.GUILD_ID);
}

export function eventParticipantSql226(env: Env, id: string): string {
  const member = `(${qualifiesSql(id)} AND ${privacySubjectWritableSql(id)})`;
  if (!eventOwnerEnabled226(env)) return member;
  return `(((${member}) OR (${id}='${DISCORD_BOT_OWNER_225}'
    AND EXISTS(SELECT 1 FROM site_users eo226 WHERE eo226.discord_id=${id} AND eo226.in_server=1 AND eo226.denied=0)
    AND NOT EXISTS(SELECT 1 FROM members eb226 WHERE eb226.discord_id=${id} AND eb226.banned=1)))
    AND (${id}<>'${DISCORD_BOT_OWNER_225}' OR (${privacySubjectWritableSql(id)}
    AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs ej226 WHERE ej226.subject_id=${id} AND ej226.state<>'complete'))))`;
}

export function eventParticipantNameSql226(env: Env, alias: string, fallback = 'Member'): string {
  const ordinary = `COALESCE(${alias}.nick,${alias}.global_name,${alias}.username,'${fallback}')`;
  if (!eventOwnerEnabled226(env)) return ordinary;
  return `CASE WHEN ${alias}.discord_id='${DISCORD_BOT_OWNER_225}' THEN
    COALESCE(NULLIF(TRIM(${alias}.nick),''),NULLIF(TRIM(${alias}.global_name),''),NULLIF(TRIM(${alias}.username),''),'Fernmelder')
    ELSE ${ordinary} END`;
}
