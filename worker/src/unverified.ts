/**
 * Who is in the guild but has not linked a Discord account through /verify — and which of them may be removed yet.
 *
 * This is the single definition. The watcher carries it into the addon's queue file, where the officer panel offers
 * removals, and /olympus-admin roster reports the same numbers, so Discord and the game can never disagree about who
 * counts as unverified or who is removable.
 *
 * "Unverified" and "removable" are deliberately different. Until build .32 (25 Sep 2026), verifying required a
 * Battle.net link that passed through Discord's OAuth consent screen, and Discord's review of the app blocked that
 * screen — 299 attempts in one hour, none completed. Almost everyone unverified on that date tried and was stopped by
 * us, not by their own inaction. So the grace period runs from whichever is LATER: when the character first appeared
 * on the roster, or when verification started working again. Nobody is offered for removal before it has elapsed,
 * and nobody whose join date is unknown is offered at all.
 */
import type { Env } from "./env";
import { intVar } from "./env";
import { now } from "./db";

export interface UnverifiedMember {
  name: string;
  rank: string | null;
  rankIndex: number | null;
  level: number | null;
  class: string | null;
  firstSeen: number | null;  // earliest roster export containing the character; null = unknown
  eligibleAt: number | null; // when removal may first be offered; null = unknown join date, never offered
  pending: boolean;          // holds an unexpired /verify code, i.e. part-way through verifying
}

export interface RankCount {
  rank: string | null;
  rankIndex: number | null;
  total: number;
  unverified: number;
}

export interface UnverifiedReport {
  snapshot: { id: number; exportedAt: number; memberCount: number } | null;
  graceDays: number;
  verifyOpenSince: number;
  firstSeenAvailable: boolean; // false until migrations/2026-09-25-first-seen.sql has been applied
  ranks: RankCount[];
  members: UnverifiedMember[];
  /**
   * Request codes issued and not yet whispered (the Get my code button, 27 Sep). They name no character until they are
   * whispered, so `pending` above cannot protect their holders: somebody in this list may be one of them, part-way
   * through verifying. The addon says so above its removal list.
   */
  openTickets: number;
}

/** Anything bound counts as verified except an officer unbind or a denial. Someone who linked a character, left the
 *  guild and came back did verify it; 'verified' and 'queued' are simply part-way through admission. */
const COUNTS_AS_VERIFIED = "c.status NOT IN ('unbound', 'denied')";

/** Build .32: Battle.net no longer required. The day verification became possible for everyone again. */
export const DEFAULT_VERIFY_OPEN_SINCE = Date.UTC(2026, 8, 25) / 1000;

export function verifyOpenSince(env: Env): number {
  const raw = (env.VERIFY_OPEN_SINCE ?? "").trim();
  if (!raw) return DEFAULT_VERIFY_OPEN_SINCE;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 1e9) return Math.floor(n);
  const t = Date.parse(raw);
  return Number.isFinite(t) ? Math.floor(t / 1000) : DEFAULT_VERIFY_OPEN_SINCE;
}

export function eligibleAt(firstSeen: number | null, openSince: number, graceDays: number): number | null {
  return firstSeen === null ? null : Math.max(firstSeen, openSince) + graceDays * 86400;
}

interface Row {
  name: string;
  rank: string | null;
  rankIndex: number | null;
  level: number | null;
  class: string | null;
  firstSeen: number | null;
  pending: number;
}

export async function unverifiedReport(env: Env): Promise<UnverifiedReport> {
  const graceDays = Math.max(0, intVar(env.UNVERIFIED_GRACE_DAYS, 3));
  const openSince = verifyOpenSince(env);
  const base = { graceDays, verifyOpenSince: openSince };
  // Same choice of snapshot as /olympus-admin roster: the newest row. An unchanged export refreshes that row in place.
  const s = await env.DB.prepare("SELECT id, exported_at, member_count FROM roster_snapshots ORDER BY id DESC LIMIT 1")
    .first<{ id: number; exported_at: number; member_count: number }>();
  const t = now();
  let openTickets = 0;
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM pending WHERE nonce IS NOT NULL AND name_key = '' AND consumed_at IS NULL AND expires_at > ?1")
      .bind(t)
      .first<{ n: number }>();
    openTickets = Number(row?.n ?? 0);
  } catch {
    /* before the schema check has added pending.nonce: there are no request codes yet */
  }
  if (!s) return { ...base, snapshot: null, firstSeenAvailable: false, ranks: [], members: [], openTickets };

  const ranks = await env.DB.prepare(
    `SELECT rm.rank AS rank, rm.rank_index AS rankIndex, COUNT(*) AS total,
            SUM(CASE WHEN c.name_key IS NULL THEN 1 ELSE 0 END) AS unverified
       FROM roster_members rm
       LEFT JOIN characters c ON c.name_key = rm.name_key AND ${COUNTS_AS_VERIFIED}
      WHERE rm.snapshot_id = ?1
      GROUP BY rm.rank, rm.rank_index
      ORDER BY rm.rank_index`,
  )
    .bind(s.id)
    .all<RankCount>();

  const select = (withFirstSeen: boolean) =>
    env.DB.prepare(
      `SELECT rm.name AS name, rm.rank AS rank, rm.rank_index AS rankIndex, rm.level AS level, rm.class AS class,
              ${withFirstSeen ? "fs.first_seen" : "NULL"} AS firstSeen,
              EXISTS (SELECT 1 FROM pending p
                       WHERE p.name_key = rm.name_key AND p.consumed_at IS NULL AND p.expires_at > ?2) AS pending
         FROM roster_members rm
         LEFT JOIN characters c ON c.name_key = rm.name_key AND ${COUNTS_AS_VERIFIED}
         ${withFirstSeen ? "LEFT JOIN roster_first_seen fs ON fs.name_key = rm.name_key" : ""}
        WHERE rm.snapshot_id = ?1 AND c.name_key IS NULL
        ORDER BY rm.rank_index DESC, rm.name`,
    )
      .bind(s.id, t)
      .all<Row>();

  let firstSeenAvailable = true;
  let rows;
  try {
    rows = await select(true);
  } catch (e) {
    // The migration has not been applied. Report everyone, offer no one: without a join date there is no grace
    // period to measure, and guessing in the member's disfavour is exactly what this feature must never do.
    if (!/no such table/i.test(String(e))) throw e;
    firstSeenAvailable = false;
    rows = await select(false);
  }

  const members = rows.results.map((r) => ({
    name: r.name,
    rank: r.rank,
    rankIndex: r.rankIndex,
    level: r.level,
    class: r.class,
    firstSeen: r.firstSeen ?? null,
    eligibleAt: eligibleAt(r.firstSeen ?? null, openSince, graceDays),
    pending: !!r.pending,
  }));
  return {
    ...base,
    snapshot: { id: s.id, exportedAt: s.exported_at, memberCount: s.member_count },
    firstSeenAvailable,
    ranks: ranks.results,
    members,
    openTickets,
  };
}
