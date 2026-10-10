/**
 * Reserved names into the invite queue (build .41, 29 Sep 2026).
 *
 * People enter the character names they reserved in Blizzard's name reservation on the guild site. An admin approves
 * the ones promised a seat (the "chosen half" of the main guild), and approved names go to the TOP of the invite queue:
 * invite_queue.priority = 1, which getQueue and waitlistPosition serve before everything else. Nothing here invites
 * anyone: the officer's key press still sends each invite, and the code whisper still links Discord (a queue row
 * never links a character by itself; see postEvents "joined").
 *
 * Before launch the names do not exist in game, so approved names wait until settings.launchAt (the cron queues them
 * then, when settings.autoQueue is on). An admin can also queue them by hand.
 *
 * Set-based on purpose: one SELECT picks up to CHUNK names, then one batch of five statements moves all of them, so
 * the cost of a run does not grow with the number of names.
 */
import { errorRef } from "./log";
import type { Env } from "./env";
import { audit, now } from "./db";
import { loadSettings } from "./site-data";
import { SCHEDULED_CAPS } from './scheduled-budget';

const CHUNK = 250; // ids go into the SQL as integers, not bound parameters, so D1's 100-parameter cap does not apply
const ROUNDS = 4;  // up to 1,000 names per run: more than the guild has seats
const ACTIVE = "('queued','written','invited')";

export interface QueueOutcome { queued: number; bumped: number; inGuild: number; blocked: number; contested: number; more: boolean }

/**
 * Queue approved names: the given ids, or every approved one (oldest approval first). Names claimed by more than one
 * account where more than one claim is approved are left alone ("contested") until an admin releases one of them.
 */
export async function queueReserved(env: Env, actor: string, ids?: number[]): Promise<QueueOutcome> {
  return queueReservedRounds(env,actor,ids,ROUNDS);
}
async function queueReservedRounds(env: Env, actor: string, ids: number[]|undefined,rounds:number): Promise<QueueOutcome> {
  const out: QueueOutcome = { queued: 0, bumped: 0, inGuild: 0, blocked: 0, contested: 0, more: false };
  const only = ids?.filter((x) => Number.isInteger(x) && x > 0).slice(0, 500);
  if (ids && !only?.length) return out;
  const filter = only ? `AND r.id IN (${only.join(",")})` : "";
  // Held back, and counted rather than picked: a name more than one account has an approved or queued claim on, and
  // names whose owner is banned from verifying. Leaving them out of the pick keeps them from blocking the rest.
  const contested = `EXISTS (SELECT 1 FROM site_reserved r2 WHERE r2.name_key = r.name_key AND r2.owner_id <> r.owner_id AND r2.status IN ('approved','queued'))`;
  const banned = `EXISTS (SELECT 1 FROM members m WHERE m.discord_id = r.owner_id AND m.banned = 1)`;
  const held = await env.DB.prepare(
    `SELECT SUM(CASE WHEN ${contested} THEN 1 ELSE 0 END) AS contested,
            SUM(CASE WHEN NOT ${contested} AND ${banned} THEN 1 ELSE 0 END) AS banned
       FROM site_reserved r WHERE r.status = 'approved' ${filter}`,
  ).first<{ contested: number | null; banned: number | null }>();
  out.contested = held?.contested ?? 0;
  out.blocked = held?.banned ?? 0;
  for (let round = 0; round < rounds; round++) {
    const cand = await env.DB.prepare(
      `SELECT r.id AS id FROM site_reserved r
        WHERE r.status = 'approved' ${filter} AND NOT ${contested} AND NOT ${banned}
        ORDER BY r.approved_at, r.id
        LIMIT ${CHUNK + 1}`,
    ).all<{ id: number }>();
    const go = cand.results.slice(0, CHUNK).map((r) => r.id);
    out.more = cand.results.length > CHUNK;
    if (!go.length) break;
    const step = await queueChunk(env, go);
    out.inGuild += step.inGuild;
    out.bumped += step.bumped;
    out.queued += step.queued;
    if (!out.more) break;
  }
  if (out.queued || out.bumped || out.inGuild) await audit(env, actor, "site.reserved_queued", undefined, { ...out });
  return out;
}

/** One chunk of approved, uncontested names: a single batch, so the chunk moves as a whole or not at all. */
async function queueChunk(env: Env, go: number[]): Promise<{ inGuild: number; bumped: number; queued: number }> {
  const list = go.join(","); // integers from our own table
  const t = now();
  const res = await env.DB.batch([
    // 1. Already in the guild (a linked member under this name): nothing to invite.
    env.DB.prepare(
      `UPDATE site_reserved SET status = 'in_guild', queued_at = ?1
        WHERE id IN (${list}) AND status = 'approved'
          AND EXISTS (SELECT 1 FROM characters c WHERE c.name_key = site_reserved.name_key AND c.status = 'member')`,
    ).bind(t),
    // 2. Already waiting in the queue (they verified with a code, say): move that row to the front instead of adding one.
    env.DB.prepare(
      `UPDATE invite_queue SET priority = 1
        WHERE status IN ${ACTIVE} AND priority < 1
          AND name_key IN (SELECT name_key FROM site_reserved WHERE id IN (${list}) AND status = 'approved')`,
    ),
    env.DB.prepare(
      `UPDATE site_reserved SET status = 'queued', queued_at = ?1,
              queue_id = (SELECT MIN(q.id) FROM invite_queue q WHERE q.name_key = site_reserved.name_key AND q.status IN ${ACTIVE})
        WHERE id IN (${list}) AND status = 'approved'
          AND EXISTS (SELECT 1 FROM invite_queue q WHERE q.name_key = site_reserved.name_key AND q.status IN ${ACTIVE})`,
    ).bind(t),
    // 3. Everyone else gets a new row at the top. discord_id is the account that entered the name; the whisper decides
    //    whose it really is.
    env.DB.prepare(
      `INSERT INTO invite_queue (name_key, name, discord_id, note, status, created_at, approved_by, priority)
       SELECT name_key, name, owner_id, NULL, 'queued', ?1, 'site', 1 FROM site_reserved
        WHERE id IN (${list}) AND status = 'approved'
        ORDER BY approved_at, id`,
    ).bind(t),
    env.DB.prepare(
      `UPDATE site_reserved SET status = 'queued', queued_at = ?1,
              queue_id = (SELECT MAX(q.id) FROM invite_queue q WHERE q.name_key = site_reserved.name_key AND q.approved_by = 'site' AND q.status = 'queued')
        WHERE id IN (${list}) AND status = 'approved'`,
    ).bind(t),
  ]);
  return { inGuild: res[0]?.meta?.changes ?? 0, bumped: res[2]?.meta?.changes ?? 0, queued: res[3]?.meta?.changes ?? 0 };
}

/** The cron's part: from launch, approved names go into the queue by themselves (settings.autoQueue). Never throws. */
export async function autoQueueReserved(env: Env): Promise<QueueOutcome | null> {
  try {
    const s = await loadSettings(env);
    if (!s.autoQueue || now() < s.launchAt) return null;
    return await queueReservedRounds(env, "system",undefined,SCHEDULED_CAPS.autoQueueRounds);
  } catch (e) {
    console.error("reserved names: auto-queue failed", errorRef(e));
    return null;
  }
}

/**
 * Take reserved names back out: the owner removed them, deleted their data, or an admin released them. A queue row
 * the site added is cancelled while it is still waiting; a row that was already there on its own (they verified) only
 * loses its place at the front.
 */
export function releaseReservedStatements(env: Env, where: { ids?: number[]; ownerId?: string }, actor: string): D1PreparedStatement[] {
  const ids = where.ids?.filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
  // ?1 = who, ?2 = when, ?3 = the owner (only when releasing by owner)
  let cond: string;
  const args: unknown[] = [actor, now()];
  if (ids?.length) cond = `id IN (${ids.join(",")})`;
  else if (where.ownerId) {
    cond = "owner_id = ?3";
    args.push(where.ownerId);
  } else return [];
  const queued = `SELECT queue_id FROM site_reserved WHERE ${cond} AND status = 'queued' AND queue_id IS NOT NULL`;
  return [
    // ?1 and ?2 appear in every statement so the same arguments bind to all three.
    env.DB.prepare(
      // 'invited' too: an invite that fired and was not accepted goes back to the queue after 30 minutes (sweepInviteQueue).
      `UPDATE invite_queue SET status = 'cancelled'
        WHERE status IN ${ACTIVE} AND approved_by = 'site' AND ?1 IS NOT NULL AND ?2 IS NOT NULL AND id IN (${queued})`,
    ).bind(...args),
    env.DB.prepare(
      `UPDATE invite_queue SET priority = 0
        WHERE status IN ${ACTIVE} AND approved_by <> 'site' AND ?1 IS NOT NULL AND ?2 IS NOT NULL AND id IN (${queued})`,
    ).bind(...args),
    env.DB.prepare(`UPDATE site_reserved SET status = 'released', released_by = ?1, released_at = ?2 WHERE ${cond} AND status <> 'released'`).bind(...args),
  ];
}

export async function releaseReserved(env: Env, where: { ids?: number[]; ownerId?: string }, actor: string): Promise<number> {
  const statements = releaseReservedStatements(env, where, actor);
  if (!statements.length) return 0;
  const res = await env.DB.batch(statements);
  return res[2]?.meta?.changes ?? 0;
}
