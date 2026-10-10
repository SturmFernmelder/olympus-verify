/**
 * Build .48 (30 Sep 2026): retention of Battle.net-derived data.
 *
 * Blizzard's Developer API Terms allow data obtained from their API to be retained for at most 30 days. What this
 * Worker obtains from Blizzard is the BattleTag and the Battle.net account id read at `/bnet/link` (oauth.ts:
 * members.battletag, bnet_conn_id, refreshed on every Battle.net login through linked_at) and, on the dormant Phase 3
 * path, the account id and character list (members.bnet_account_id / bnet_linked_at, bnet_characters). Since build .32
 * none of it gates anything: the in-game whisper is the proof of control and the Guild Member role follows the roster.
 * So the rule is retention only, exactly as agreed with Codex on 30 Sep (23:28 UTC): data not refreshed by a fresh
 * Blizzard login within 29 days is purged (one day inside the limit, for a late cron), every reader treats an unpurged
 * stale row as absent, and nothing about admission, character links, the role or the queue changes. No DM, no notice.
 *
 * Copies: the audit rows that record a link keep the BattleTag as their subject; those older than the cutoff are
 * scrubbed too. Nothing derived from the tag outlives it (Codex review, 23:55 UTC): a ban binds the Discord account
 * and the characters bound to it, never the BattleTag, so the same Battle.net account may link again from another
 * Discord account once the tag is gone. The link grants nothing since .32, so that costs nothing.
 */
import type { Env } from "./env";
import { audit, now } from "./db";

/** Days a Battle.net record stays without a fresh Blizzard login: one day inside Blizzard's 30. */
export const BNET_TTL_DAYS = 29;
export const BNET_TTL_S = BNET_TTL_DAYS * 86400;
/** Blizzard's limit; only the health line and the tests use it directly. */
export const BNET_BLIZZARD_LIMIT_S = 30 * 86400;

/** Newest linked_at that is already stale at `at` (stale means linked_at <= cutoff). */
export const bnetCutoff = (at = now()) => at - BNET_TTL_S;
/**
 * A timestamp further ahead of the clock than this is not evidence of a recent login: the readers treat the record as
 * stale and, since .50, so does the purge (Codex's second review, 1 Oct 00:05 UTC: a far-future row was kept forever
 * and showed up in /health as a negative age).
 */
export const BNET_FUTURE_SLACK_S = 300;
const bnetFuture = (at = now()) => at + BNET_FUTURE_SLACK_S;

/**
 * Whether a stored Battle.net record may still be shown or relied on: refreshed within the last 29 days and not from
 * the future. A record with no timestamp has no evidence of freshness and counts as stale; the purge never invents one.
 */
export function bnetFresh(linkedAt: number | null | undefined, at = now()): boolean {
  return typeof linkedAt === "number" && Number.isFinite(linkedAt) && linkedAt > bnetCutoff(at) && linkedAt <= bnetFuture(at);
}

/**
 * Whether this Discord account ever completed a Battle.net link (the audit keeps the fact after the tag is gone).
 * .50: used by /verify-status to tell exactly those people about the copy of the tag that earlier builds pushed into
 * Discord's own record of the connection, which no purge of ours reaches.
 */
export async function everLinked(env: Env, discordId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS hit FROM audit WHERE actor = ?1 AND action IN ('link.ok', 'bnet.linked') LIMIT 1").bind(discordId).first<{ hit: number }>();
  return !!row;
}

/** The audit actions whose subject is a BattleTag (oauth.ts; bnet.linked from the retired Phase 3 path). */
export const BNET_AUDIT_ACTIONS = ["link.ok", "link.metadata_failed", "link.battletag_taken", "link.banned", "bnet.linked"] as const;
export const EXPIRED_SUBJECT = "[expired]";

export interface BnetPurgeResult {
  /** members rows whose BattleTag / account id / linked_at were cleared */
  members: number;
  /** members rows whose Phase 3 account id was cleared */
  phase3: number;
  /** bnet_characters rows deleted */
  characters: number;
  /** audit rows whose BattleTag subject was replaced */
  audit: number;
}

/**
 * Purge everything Blizzard-derived that was not refreshed within the TTL. Idempotent; run by the cron and, cheaply,
 * before a new link is stored so a stale namesake row can never block a fresh link. Every statement is conditional on
 * the row still being stale, so a login that lands in between wins.
 */
export async function purgeBattleNetData(env: Env, at = now()): Promise<BnetPurgeResult> {
  const cutoff = bnetCutoff(at);
  const future = bnetFuture(at);
  // Stale: no timestamp, at or past the cutoff, or further in the future than a clock could explain.
  const [m, p3, ch, au] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE members SET activity_at=MAX(COALESCE(activity_at,0),CASE WHEN linked_at>0 AND linked_at<=?2 THEN linked_at ELSE 0 END),battletag = NULL, bnet_conn_id = NULL, linked_at = NULL
        WHERE (battletag IS NOT NULL OR bnet_conn_id IS NOT NULL OR linked_at IS NOT NULL) AND (linked_at IS NULL OR linked_at <= ?1 OR linked_at > ?2)`,
    ).bind(cutoff, future),
    env.DB.prepare(
      `UPDATE members SET activity_at=MAX(COALESCE(activity_at,0),CASE WHEN bnet_linked_at>0 AND bnet_linked_at<=?2 THEN bnet_linked_at ELSE 0 END),bnet_account_id = NULL, bnet_linked_at = NULL
        WHERE (bnet_account_id IS NOT NULL OR bnet_linked_at IS NOT NULL) AND (bnet_linked_at IS NULL OR bnet_linked_at <= ?1 OR bnet_linked_at > ?2)`,
    ).bind(cutoff, future),
    env.DB.prepare("DELETE FROM bnet_characters WHERE fetched_at IS NULL OR fetched_at <= ?1 OR fetched_at > ?2").bind(cutoff, future),
    env.DB.prepare(
      `UPDATE audit SET subject = ?2 WHERE action IN (${BNET_AUDIT_ACTIONS.map((_, i) => `?${i + 4}`).join(", ")})
        AND (ts <= ?1 OR ts > ?3) AND subject IS NOT NULL AND subject <> ?2`,
    ).bind(cutoff, EXPIRED_SUBJECT, future, ...BNET_AUDIT_ACTIONS),
  ]);
  const result: BnetPurgeResult = {
    members: m?.meta?.changes ?? 0,
    phase3: p3?.meta?.changes ?? 0,
    characters: ch?.meta?.changes ?? 0,
    audit: au?.meta?.changes ?? 0,
  };
  if (result.members || result.phase3 || result.characters || result.audit) {
    await audit(env, "cron", "bnet.retention", undefined, result); // counts only, never a tag
  }
  return result;
}

/**
 * .51: rows that only the retired Phase 3 path could have written (characters, pending rows and roster snapshots with
 * source 'api', its audit actions, Battle.net character and account rows). The flag was never on, so every count should
 * be zero on the live database; this read, in the watcher's /health, is the preflight that lets the all-copy claim be
 * stated as a fact rather than inferred from config (Codex's review of .50, 1 Oct 00:30 UTC). Counts only, no values.
 */
export interface LegacyApiCounts {
  characters: number;
  pending: number;
  snapshots: number;
  audit: number;
  bnetCharacters: number;
  accountIds: number;
  /** 1 when the .48 fingerprint column exists (that build was never deployed; a 1 here means a database this code did not expect). */
  fingerprintColumn: number;
}
export async function legacyApiCounts(env: Env): Promise<LegacyApiCounts> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM characters WHERE source = 'api') AS characters,
       (SELECT COUNT(*) FROM pending WHERE consumed_source = 'api') AS pending,
       (SELECT COUNT(*) FROM roster_snapshots WHERE source = 'api') AS snapshots,
       (SELECT COUNT(*) FROM audit WHERE action IN ('verify.api_confirmed', 'bnet.linked', 'bnet.roster_failed')) AS audit,
       (SELECT COUNT(*) FROM bnet_characters) AS bnetCharacters,
       (SELECT COUNT(*) FROM members WHERE bnet_account_id IS NOT NULL OR bnet_linked_at IS NOT NULL) AS accountIds`,
  ).first<LegacyApiCounts>();
  let fingerprintColumn = 0;
  try {
    await env.DB.prepare("SELECT bnet_hash FROM members LIMIT 0").all();
    fingerprintColumn = 1;
  } catch (e) {
    // .54: only the known "no such column" answer means absent; any other failure propagates, so /health shows an
    // error instead of a zero that a deploy gate could mistake for a clean database (Codex, 1 Oct 01:04 UTC).
    if (!/no such column/i.test(String(e))) throw e;
  }
  return { characters: row?.characters ?? 0, pending: row?.pending ?? 0, snapshots: row?.snapshots ?? 0, audit: row?.audit ?? 0, bnetCharacters: row?.bnetCharacters ?? 0, accountIds: row?.accountIds ?? 0, fingerprintColumn };
}

export interface BnetRetentionStatus {
  /** Records past the TTL that the purge has not cleared yet (should be 0 after every cron run). */
  overdue: number;
  /** Age in days of the oldest Battle.net record still stored, or null when there is none. */
  oldestAgeDays: number | null;
}

/**
 * For /health: whether the purge keeps up. A record older than Blizzard's 30 days would be a breach, not a backlog.
 * .50: counts every copy the purge clears, with the purge's own notion of stale (a connection id without a tag, an
 * account id without a timestamp, a far-future timestamp, an audit subject not yet scrubbed), so the line cannot say
 * "nothing overdue" while something is. The oldest age looks only at timestamps a clock could have produced.
 */
export async function bnetRetentionStatus(env: Env, at = now()): Promise<BnetRetentionStatus> {
  const cutoff = bnetCutoff(at);
  const future = bnetFuture(at);
  const actions = BNET_AUDIT_ACTIONS.map((_, i) => `?${i + 4}`).join(", ");
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM members WHERE (battletag IS NOT NULL OR bnet_conn_id IS NOT NULL) AND (linked_at IS NULL OR linked_at <= ?1 OR linked_at > ?2))
       + (SELECT COUNT(*) FROM members WHERE bnet_account_id IS NOT NULL AND (bnet_linked_at IS NULL OR bnet_linked_at <= ?1 OR bnet_linked_at > ?2))
       + (SELECT COUNT(*) FROM bnet_characters WHERE fetched_at IS NULL OR fetched_at <= ?1 OR fetched_at > ?2)
       + (SELECT COUNT(*) FROM audit WHERE action IN (${actions}) AND (ts <= ?1 OR ts > ?2) AND subject IS NOT NULL AND subject <> ?3) AS overdue,
       (SELECT MIN(t) FROM (SELECT MIN(linked_at) AS t FROM members WHERE (battletag IS NOT NULL OR bnet_conn_id IS NOT NULL) AND linked_at <= ?2
                            UNION ALL SELECT MIN(bnet_linked_at) FROM members WHERE bnet_account_id IS NOT NULL AND bnet_linked_at <= ?2
                            UNION ALL SELECT MIN(fetched_at) FROM bnet_characters WHERE fetched_at <= ?2
                            UNION ALL SELECT MIN(ts) FROM audit WHERE action IN (${actions}) AND ts <= ?2 AND subject IS NOT NULL AND subject <> ?3)) AS oldest`,
  )
    .bind(cutoff, future, EXPIRED_SUBJECT, ...BNET_AUDIT_ACTIONS)
    .first<{ overdue: number; oldest: number | null }>();
  return {
    overdue: row?.overdue ?? 0,
    // .51: a record a few minutes ahead of the clock (allowed skew) is age zero, never -1 (Codex, 1 Oct 00:38 UTC)
    oldestAgeDays: typeof row?.oldest === "number" ? Math.max(0, Math.floor((at - row.oldest) / 86400)) : null,
  };
}
