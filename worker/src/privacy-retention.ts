/** Automatic finite local retention. This never claims provider-message or private-export disposal.
 * All clocks are consumed from the database; historical beta requests/first-seen dates age from the
 * recorded cutoff only after the attended beta reset confirms that same cutoff.
 */
import type { Env } from './env';
import { privacyAccessPurgeStatements } from './privacy-access';
import { PRIVACY_DB_NOW as T, PRIVACY_YEAR as YEAR } from './privacy-serving-authority';
import {betaRetentionClockSql as betaAged} from './privacy-retention-clocks';
const expired=(clock:string)=>`${clock}<=${T}-${YEAR}`;
const active=(identity:string)=>`EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=${identity} AND c.status NOT IN('unbound','denied','left'))`;
/** Fixed statement census is part of the joined scheduled budget. Each selection has a finite deterministic page. */
export function servingRetentionStatements(env:Env):D1PreparedStatement[]{return [
 ...privacyAccessPurgeStatements(env),
 env.DB.prepare(`DELETE FROM privacy_denial_markers WHERE subject_key IN(SELECT subject_key FROM privacy_denial_markers WHERE retain_until<=${T} ORDER BY retain_until,subject_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_restore_replay WHERE operation_id IN(SELECT operation_id FROM privacy_restore_replay WHERE retain_until<=${T} ORDER BY retain_until,operation_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_serving_jobs WHERE operation_id IN(SELECT operation_id FROM privacy_serving_jobs WHERE state='complete' AND retain_until<=${T} ORDER BY retain_until,operation_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_subjects WHERE subject_id IN(SELECT s.subject_id FROM privacy_subjects s WHERE s.state='retired' AND s.retain_until<=${T}
  AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=s.subject_id AND j.state<>'complete') ORDER BY s.retain_until,s.subject_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM pending WHERE id IN(SELECT id FROM pending WHERE ${expired(betaAged('created_at'))} AND (consumed_at IS NOT NULL OR expires_at<=${T}) ORDER BY created_at,id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_first_seen WHERE name_key IN(SELECT f.name_key FROM roster_first_seen f WHERE ${expired(betaAged('f.first_seen'))}
  AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.name_key=f.name_key AND c.status NOT IN('unbound','denied','left'))
  AND NOT EXISTS(SELECT 1 FROM roster_members m WHERE m.name_key=f.name_key AND m.snapshot_id=(SELECT MAX(id) FROM roster_snapshots WHERE complete=1)) ORDER BY f.first_seen,f.name_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM invite_queue WHERE id IN(SELECT q.id FROM invite_queue q WHERE q.status IN('cancelled','expired','declined','joined')
  AND ${expired('COALESCE(q.joined_at,q.invited_at,q.written_at,q.created_at)')} AND NOT ${active('q.discord_id')} ORDER BY q.created_at,q.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_applications WHERE discord_id IN(SELECT a.discord_id FROM site_applications a WHERE a.status IN('declined','withdrawn')
  AND ${expired('a.updated_at')} ORDER BY a.updated_at,a.discord_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_reserved WHERE id IN(SELECT r.id FROM site_reserved r WHERE r.status='released' AND ${expired('COALESCE(r.released_at,r.created_at)')}
  AND NOT EXISTS(SELECT 1 FROM invite_queue q WHERE q.id=r.queue_id AND q.status IN('queued','written','invited')) ORDER BY COALESCE(r.released_at,r.created_at),r.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_friends WHERE rowid IN(SELECT f.rowid FROM site_friends f WHERE f.friend_kind='discord' AND ${expired('f.created_at')}
  AND NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=f.friend_key) AND NOT ${active('f.friend_key')} ORDER BY f.created_at,f.owner_id,f.friend_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM site_votes WHERE rowid IN(SELECT v.rowid FROM site_votes v WHERE v.nominee_kind='discord' AND ${expired('v.updated_at')}
  AND NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=v.nominee_key) AND NOT ${active('v.nominee_key')} ORDER BY v.updated_at,v.voter_id,v.ballot,v.slot LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM relays WHERE officer_id IN(SELECT officer_id FROM relays WHERE online=0 AND ${expired('seen_at')} ORDER BY seen_at,officer_id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_effects WHERE rowid IN(SELECT e.rowid FROM roster_effects e JOIN roster_effect_runs r ON r.id=e.run_id WHERE ${expired('r.created_at')}
  AND (r.done_at IS NOT NULL OR r.superseded_at IS NOT NULL) ORDER BY r.created_at,e.run_id,e.seq LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_effect_runs WHERE id IN(SELECT r.id FROM roster_effect_runs r WHERE ${expired('r.created_at')}
  AND (r.done_at IS NOT NULL OR r.superseded_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM roster_effects e WHERE e.run_id=r.id) ORDER BY r.created_at,r.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_members WHERE rowid IN(SELECT m.rowid FROM roster_members m JOIN roster_snapshots s ON s.id=m.snapshot_id WHERE ${expired('s.first_received_at')}
  AND s.id<>(SELECT MAX(id) FROM roster_snapshots WHERE complete=1) AND NOT EXISTS(SELECT 1 FROM roster_effect_runs r WHERE (r.snapshot_id=s.id OR r.prev_snapshot_id=s.id) AND r.done_at IS NULL AND r.superseded_at IS NULL)
  ORDER BY s.first_received_at,m.snapshot_id,m.name_key LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM roster_snapshots WHERE id IN(SELECT s.id FROM roster_snapshots s WHERE ${expired('s.first_received_at')}
  AND s.id<>(SELECT MAX(id) FROM roster_snapshots WHERE complete=1) AND NOT EXISTS(SELECT 1 FROM roster_members m WHERE m.snapshot_id=s.id)
  AND NOT EXISTS(SELECT 1 FROM roster_effect_runs r WHERE (r.snapshot_id=s.id OR r.prev_snapshot_id=s.id) AND r.done_at IS NULL AND r.superseded_at IS NULL) ORDER BY s.first_received_at,s.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM audit WHERE id IN(SELECT id FROM audit WHERE ${expired('ts')} ORDER BY ts,id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM privacy_provider_messages WHERE operation_id IN(SELECT operation_id FROM privacy_provider_messages WHERE state IN('removed','refused') AND retain_until<=${T} ORDER BY retain_until,operation_id LIMIT 1000)`),
 ];}
export const SERVING_RETENTION_STATEMENTS=20;
export async function sweepServingRetention(env:Env):Promise<number>{
 // Short privacy credentials keep their own fixed deadlines even while account-retention work is paused.
 const statements=env.PRIVACY_RETENTION_ENABLED==='true'?servingRetentionStatements(env)
  :env.PRIVACY_ACCESS_ENABLED==='true'?privacyAccessPurgeStatements(env):[];
 if(statements.length===0)return 0;
 const out=await env.DB.batch(statements);
 if(out.length!==statements.length)throw Error('privacy_retention_outcome_unknown');
 return out.reduce((n,r)=>n+(r.meta?.changes??0),0);
}
