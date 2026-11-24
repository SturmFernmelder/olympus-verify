/**
 * Discord names for linked members, for the officers' roster window in game (build .41, 29 Sep 2026).
 *
 * The addon shows each guild member's Discord username, and the display name when it differs. Those change whenever
 * the person likes, so they are refreshed from three places, cheapest first:
 *   1. every interaction with the bot carries the member's current names (index.ts calls recordNames);
 *   2. every sign-in on the guild site does the same (site.ts);
 *   3. the half-hourly cron reads a few of the stalest ones from Discord (refreshNames, GET /users/{id}).
 * Only accounts that already have a members row are touched: this never creates a record of anyone.
 */
import { errorRef } from "./log";
import type { Env } from "./env";
import { intVar } from "./env";
import { now } from "./db";
import { DiscordError, rest } from "./discord";
import { SCHEDULED_CAPS } from "./scheduled-budget";
import { privacyGenerationExpressionFenceSql, privacyGenerationLiteralFenceSql, readPrivacySubject, type PrivacySubject } from './privacy-serving-authority';

export interface DiscordNames { id: string; username?: string | null; global_name?: string | null }

/** Apply the same text limits to current Discord responses and older cached labels. */
export function isDiscordRosterLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && value.trim().length > 0
    && !/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(value);
}

/** Source is a Discord user object carried by an authenticated provider response. */
export function exactDiscordNames(subject: string, raw: unknown): DiscordNames | null {
  if (!raw || typeof raw !== 'object') return null;
  const user = raw as Partial<DiscordNames> & { bot?: boolean };
  if (user.id !== subject || user.bot === true || !isDiscordRosterLabel(user.username)) return null;
  return { id: subject, username: user.username, global_name: isDiscordRosterLabel(user.global_name) ? user.global_name : null };
}

export interface VerifiedNameTarget {
  subject: string;
  nameKey: string;
  guid: string;
  privacy: PrivacySubject | null;
}

const linkedNameTarget = `discord_id=?1 AND banned=0
  AND ${privacyGenerationExpressionFenceSql('members.discord_id','?4')}
  AND NOT EXISTS (SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=?1 AND j.state<>'complete' AND j.state IN ('waiting_role','held','erasing'))
  AND NOT EXISTS (SELECT 1 FROM site_users s WHERE s.discord_id=?1 AND s.denied=1)
  AND NOT EXISTS (SELECT 1 FROM rename_holds r WHERE r.discord_id=?1 AND r.state='reapply')
  AND EXISTS (SELECT 1 FROM characters c WHERE c.discord_id=?1 AND c.name_key=?2 AND c.guid=?3 AND c.status='member')
  AND (SELECT count(*) FROM characters c WHERE c.guid=?3)=1`;

/** Display metadata is optional. A missed lookup/write is recovered by the normal names refresh. */
export async function refreshVerifiedNames(env: Env, target: VerifiedNameTarget): Promise<void> {
  try {
    const { subject, nameKey, guid, privacy } = target;
    if (privacy && (privacy.subject !== subject || privacy.state !== 'active')) return;
    const params = [subject, nameKey, guid, privacy?.subjectGeneration ?? null];
    const at = now();
    if (!env.DISCORD_BOT_TOKEN || !/^\d{17,20}$/.test(env.GUILD_ID)) return;
    const due = await env.DB.prepare(`SELECT 1 AS due FROM members WHERE ${linkedNameTarget}
      AND (NULLIF(TRIM(username),'') IS NULL OR names_at IS NULL OR names_at<?5)`).bind(...params, at - STALE_AFTER).first();
    if (!due) return;
    const member = await rest<{ user?: unknown; pending?: boolean }>(env, 'GET', `/guilds/${env.GUILD_ID}/members/${subject}`, undefined, 1);
    if (!member || member.pending === true) return;
    const names = exactDiscordNames(subject, member.user);
    if (!names) return;
    await env.DB.prepare(`UPDATE members SET username=?5, global_name=?6, names_at=?7 WHERE ${linkedNameTarget}
      AND (names_at IS NULL OR names_at<?7 OR (names_at=?7 AND NULLIF(TRIM(username),'') IS NULL))`)
      .bind(...params, names.username, names.global_name, at).run();
  } catch { /* Verification has its own durable acknowledgment. */ }
}

/** Re-written at most once a day unless something changed, so an interaction costs a read, not a write. */
const RECORD_EVERY = 86400;
/** The cron re-reads names older than this. */
const STALE_AFTER = 7 * 86400;

/** `fresh` = just read from Discord: stamp it even when nothing changed, so the cron moves on to the next one. */
export async function recordNames(env: Env, user: DiscordNames | undefined | null, fresh = false, originalCapture?:PrivacySubject|null): Promise<void> {
  if (!user || !/^\d{17,20}$/.test(user.id ?? "") || !user.username) return;
  const capture=originalCapture===undefined?await readPrivacySubject(env,user.id):originalCapture;
  if(capture&&(capture.state!=='active'||capture.subject!==user.id))return;
  const t = now();
  await env.DB.prepare(
    `UPDATE members SET username = ?2, global_name = ?3, names_at = ?4
      WHERE discord_id = ?1 AND ${privacyGenerationLiteralFenceSql('discord_id',capture?.subjectGeneration??null)}
       AND (?6 = 1 OR username IS NOT ?2 OR global_name IS NOT ?3 OR names_at IS NULL OR names_at < ?5)`,
  )
    .bind(user.id, user.username.slice(0, 64), user.global_name ? user.global_name.slice(0, 64) : null, t, t - RECORD_EVERY, fresh ? 1 : 0)
    .run();
}

/** Never throws: a names refresh is housekeeping and must not cost anything else in the same run. */
export async function refreshNames(env: Env, limit = intVar(env.NAMES_PER_RUN, 5)): Promise<{ refreshed: number; gone: number }> {
  const out = { refreshed: 0, gone: 0 };
  const n = Math.max(0, Math.min(SCHEDULED_CAPS.namesPerRun, limit)); // 20, counted in the cron's D1 budget (.115, scheduled-budget.ts)
  if (!n || !env.DISCORD_BOT_TOKEN) return out;
  try {
    const standing = `NOT EXISTS (SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=m.discord_id AND j.state<>'complete' AND j.state IN ('waiting_role','held','erasing'))
          AND NOT EXISTS (SELECT 1 FROM site_users s WHERE s.discord_id=m.discord_id AND s.denied=1)
          AND NOT EXISTS (SELECT 1 FROM rename_holds h WHERE h.discord_id=m.discord_id AND h.state='reapply')
          AND EXISTS (SELECT 1 FROM characters c WHERE c.discord_id=m.discord_id AND c.status NOT IN ('unbound','denied'))`;
    // Rotate within each group on the real 15-minute schedule. A permanently refused
    // subject cannot monopolize a one-read budget. Reserve one turn in four for stale handles.
    const tick=Math.floor(now()/900);
    const rows = await env.DB.prepare(
      `WITH due AS (
        SELECT m.discord_id AS id,m.names_at,ps.generation,NULLIF(TRIM(m.username),'') IS NULL AS missing
        FROM members m LEFT JOIN privacy_subjects ps ON ps.subject_id=m.discord_id
        WHERE (m.names_at IS NULL OR m.names_at < ?1) AND m.banned=0
          AND (ps.state IS NULL OR ps.state='active') AND ${standing}),
      ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY missing ORDER BY id)-1 AS position,
        COUNT(*) OVER(PARTITION BY missing) AS size FROM due)
        SELECT id,names_at,generation FROM ranked
        ORDER BY CASE WHEN ?3%4=0 THEN missing ELSE 1-missing END,
          (position+size-(CASE WHEN missing THEN ?3-CAST(?3/4 AS INTEGER) ELSE CAST(?3/4 AS INTEGER) END)%size)%size
        LIMIT ?2`,
    )
      .bind(now() - STALE_AFTER, n, tick)
      .all<{ id: string; generation:string|null; names_at:number|null }>();
    for (const r of rows.results) {
      const stamp=now();
      const where=`m.discord_id=?1 AND m.names_at IS ?2 AND m.banned=0
        AND ${privacyGenerationExpressionFenceSql('m.discord_id','?3')} AND ${standing}`;
      try {
        // attempt 1: no waiting out a 429 here. The cron run's Discord budget is shared with the role sweep, and the
        // names can wait half an hour.
        const u = await rest<{ id: string; username: string; global_name?: string | null }>(env, "GET", `/users/${r.id}`, undefined, 1);
        const names = exactDiscordNames(r.id, u);
        if (!names) continue;
        const result=await env.DB.prepare(`UPDATE members AS m SET username=?5,global_name=?6,names_at=?4 WHERE ${where}`)
          .bind(r.id,r.names_at,r.generation,stamp,names.username,names.global_name).run();
        if(result.meta.changes===1) out.refreshed++;
      } catch (e) {
        if (e instanceof DiscordError && e.status === 404) {
          // A deleted account: keep the last names we saw, stop asking.
          const result=await env.DB.prepare(`UPDATE members AS m SET names_at=?4 WHERE ${where}`).bind(r.id,r.names_at,r.generation,stamp).run();
          if(result.meta.changes===1)out.gone++;
          continue;
        }
        if (e instanceof DiscordError && e.status === 429) break; // try the rest next run
        throw e;
      }
    }
  } catch (e) {
    console.error("names refresh", errorRef(e));
  }
  return out;
}

export interface VerifiedMember {
  name: string;           // as on the roster
  guid: string | null;    // the character's GUID, when the link has pinned one
  status: string;         // characters.status: member, verified, queued, left_pending, ...
  discordId: string;
  username: string | null;
  displayName: string | null; // null when the account has none, or it is the username again
}

/** Everyone on this roster snapshot whose character is linked, with their Discord names. */
export async function verifiedOnRoster(env: Env, snapshotId: number): Promise<VerifiedMember[]> {
  const rows = await env.DB.prepare(
    `SELECT rm.name AS name, c.guid AS guid, c.status AS status, c.discord_id AS discordId,
            COALESCE(NULLIF(TRIM(m.username),''),NULLIF(TRIM(su.username),'')) AS username,
            CASE WHEN NULLIF(TRIM(m.username),'') IS NOT NULL THEN NULLIF(TRIM(m.global_name),'')
                 WHEN NULLIF(TRIM(su.username),'') IS NOT NULL THEN NULLIF(TRIM(su.global_name),'') END AS globalName
       FROM roster_members rm
       JOIN characters c ON c.name_key = rm.name_key AND c.status NOT IN ('unbound', 'denied')
       LEFT JOIN members m ON m.discord_id = c.discord_id
       LEFT JOIN site_users su ON su.discord_id = c.discord_id
      WHERE rm.snapshot_id = ?1
      ORDER BY rm.name`,
  )
    .bind(snapshotId)
    .all<{ name: string; guid: string | null; status: string; discordId: string; username: string | null; globalName: string | null }>();
  return rows.results.map((r) => ({
    name: r.name,
    guid: r.guid ?? null,
    status: r.status,
    discordId: r.discordId,
    username: isDiscordRosterLabel(r.username) ? r.username : null,
    displayName: isDiscordRosterLabel(r.globalName) && r.globalName.toLowerCase() !== (r.username ?? "").toLowerCase() ? r.globalName : null,
  }));
}
