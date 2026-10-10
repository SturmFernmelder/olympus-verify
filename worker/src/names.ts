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
import { privacyGenerationLiteralFenceSql, readPrivacySubject, type PrivacySubject } from './privacy-serving-authority';

export interface DiscordNames { id: string; username?: string | null; global_name?: string | null }

/** Re-written at most once a day unless something changed, so an interaction costs a read, not a write. */
const RECORD_EVERY = 86400;
/** The cron re-reads names older than this. */
const STALE_AFTER = 7 * 86400;

/** `fresh` = just read from Discord: stamp it even when nothing changed, so the cron moves on to the next one. */
export async function recordNames(env: Env, user: DiscordNames | undefined | null, fresh = false, originalCapture?:PrivacySubject|null): Promise<void> {
  if (!user || !/^\d{17,20}$/.test(user.id ?? "") || !user.username) return;
  const capture=originalCapture===undefined?await readPrivacySubject(env,user.id):originalCapture;
  if(capture&&capture.state!=='active')return;
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
    const rows = await env.DB.prepare(
      `SELECT m.discord_id AS id,ps.generation,ps.state,ps.revision FROM members m LEFT JOIN privacy_subjects ps ON ps.subject_id=m.discord_id
        WHERE (m.names_at IS NULL OR m.names_at < ?1)
          AND (ps.state IS NULL OR ps.state='active')
          AND EXISTS (SELECT 1 FROM characters c WHERE c.discord_id = m.discord_id AND c.status NOT IN ('unbound', 'denied'))
        ORDER BY m.names_at IS NOT NULL, m.names_at
        LIMIT ?2`,
    )
      .bind(now() - STALE_AFTER, n)
      .all<{ id: string;generation:string|null;state:'active'|null;revision:number|null }>();
    for (const r of rows.results) {
      const capture:PrivacySubject|null=r.generation===null?null:{subject:r.id,subjectGeneration:r.generation,state:'active',revision:r.revision!};
      try {
        // attempt 1: no waiting out a 429 here. The cron run's Discord budget is shared with the role sweep, and the
        // names can wait half an hour.
        const u = await rest<{ id: string; username: string; global_name?: string | null }>(env, "GET", `/users/${r.id}`, undefined, 1);
        await recordNames(env, u, true,capture);
        out.refreshed++;
      } catch (e) {
        if (e instanceof DiscordError && e.status === 404) {
          // A deleted account: keep the last names we saw, stop asking.
          await env.DB.prepare(`UPDATE members SET names_at=?2 WHERE discord_id=?1 AND ${privacyGenerationLiteralFenceSql('discord_id',capture?.subjectGeneration??null)}`).bind(r.id,now()).run();
          out.gone++;
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
            COALESCE(m.username, su.username) AS username, COALESCE(m.global_name, su.global_name) AS globalName
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
    username: r.username ?? null,
    displayName: r.globalName && r.globalName.toLowerCase() !== (r.username ?? "").toLowerCase() ? r.globalName : null,
  }));
}
