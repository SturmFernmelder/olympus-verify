/**
 * .72 (1 Oct 2026): the contribution (tithe) ledger, consolidation batch 5 of Codex's adapter map, ported from Olympus
 * Forever's src/contributions/ledger.ts (frozen candidate manifest 296db2c8…) onto the keeper's door, on the map's
 * conditions: all eight tables prefixed together (`community_contribution_*`); integer copper with the input ceiling and
 * the guarded magnitude sums (never a rounded amount, never a D1 "integer overflow"); the weekly period contracts of the
 * pure policy (community-contribution-policy.ts, in SECONDS); exact export, erase and retirement; no donor approval or
 * Battle.net prerequisite (the keeper's facts decide who may write: community-context.ts); the mail reference as a
 * lookup aid, never payment proof (the routes); and NO effect on anyone: nothing here sends a notice, grants or removes
 * a role, admits or removes a member, or opens a case. The donor's removal step opened a restriction case in the same
 * batch; here `recordRemoval` records that an officer resolved the week after an in-game removal and may LINK an
 * existing case the officer opened through the restrictions module (.69) — a restriction from a ledger decision stays
 * a separately reviewed keeper manual action, as the map orders.
 *
 * Persistence rules kept from the donor: every write that changes a member's ledger bumps `community_contribution_members
 * .revision` in the same batch (and so does the purge for every member it touches); writes that act on a snapshot
 * compare its opaque revision token (`incarnation.revision`), so a stale snapshot, or one of a deleted and recreated
 * row, writes nothing; every later statement requires the random nonce the first statement stored; an allocation or a
 * decision row is inserted only while its obligation and receipt still belong to the member. The acting session is the
 * keeper's: `fenceSql("applicantWrite", …)` inside the first statement (a member acknowledging, or a staff member
 * recording), the same fence every community write carries.
 *
 * Reads (.72/.73's rule from the start): every read a route makes on a member's behalf runs behind the acting session's
 * admission (`readAs`: the same SQL probe as community-context.ts admittedRead, in the payload's own batch), so a reader
 * denied, departed, signed out or expired between the context read and the payload receives `reader_refused` and no
 * ledger; a receipt's or an attestation's lifetime is judged by the database clock (`DB_NOW`) inside the statement.
 * Cron and the suites read without a fence.
 *
 * Lifetime (.78, Codex's SELECTED ledger retention contract, 1 Oct 05:19 UTC): `retain_until` is the EFFECTIVE
 * database-time availability and action cutoff. An expired week (`LIVE_WEEK`) is absent from every view, snapshot and
 * copy, takes no contact, state, reversal, allocation or removal (each first statement requires the week live) and is
 * never revived. An expired receipt funds no NEW allocation even when its deadline is crossed between the snapshot and
 * the write (the allocation insert requires the receipt live and unvoided); at the deadline its private fields (source
 * id, payer, observer) leave the staff view before the purge scrubs them, and while it still pays a LIVE week it exposes
 * only the allocated/retired relationship that week needs (no original amount). Already-spent copper is preserved and no
 * journal is filtered before its retirement (the donor's minimal allocated-credit exception). A decision requalifies
 * the exact facts it relied on at the admitted write: a contact allowed under the week's evidence state requires that
 * attestation live in its first statement; a removal linking a case requires the case live about that member. The weekly
 * opener binds the captured account incarnation and the current roster proof at the INSERT (the .76 departures
 * pattern). Constant policy reads (`ensurePolicy`, the default policy) are initialization, not private acquisition.
 * .80 (the frozen .75 persistence review, 1 Oct 05:35 UTC): every standalone read a write makes AFTER its batch (the
 * new week's id, a receipt's existing row for a replay or a conflict) runs under the acting session's admission, so the
 * committed effect stays while a reader who lost standing meanwhile receives no row; the fence's own re-check
 * (`fenceRefusal`) is judged by the database clock in SQL, never by the request's JavaScript time; an expired receipt
 * under a source id is never replayed (`past_retention`); and the purge bumps the revisions only of the members whose
 * rows THAT bounded run selects, never of every member with an expired row.
 *
 * Writes are refused (503 contributions_disabled) unless `CONTRIBUTIONS_MODE = "ledger"` AND a finite
 * `CONTRIBUTIONS_RETENTION_DAYS` (1..3650) is configured, so storage never starts without a purge; every personal record
 * carries `retain_until` fixed from the retention in force when it was written, so the purge never depends on the
 * current configuration. The feature flag `contributions` (COMMUNITY_FEATURES) gates the routes on top of that.
 *
 * .88 (Codex's frozen .80 review, 1 Oct 06:49 UTC): the new-receipt batch's private magnitude probe acquires nothing unless
 * the acting session's fence holds in that same statement; a removal captures the linked case's exact incarnation and
 * requires it at the write; the weekly opener's eligibility (the new-member exemption counted from the member's earliest
 * roster-confirmed `member_since`) is restated at the INSERT from the characters as they are then, so a changed age with
 * the other eligibility is `proof_changed` (the GUID need not be unchanged when the eligibility is the same); and no
 * receipt, week or evidence row is born at or past its `retain_until` by the database clock (`?retain > DB_NOW` inside the
 * INSERT; a refused birth is `past_retention`).
 * .94 (Codex's frozen .88 review, 1 Oct 07:53 UTC): the decision journal too. Every decision-bearing write (a state
 * change, a contact, a reversal, a void, a removal) captures its journal deadline (the actor's `now` plus the retention
 * in force) BEFORE its batch and requires it to be ahead of the database clock in its FIRST mutation, the per-member
 * compare-and-set every later statement depends on, so no effect commits with a journal born at or past its deadline;
 * the decision INSERTs restate it. A refused first mutation is `stale` only while that deadline is still ahead of the
 * database clock (a probe in the same batch); otherwise the birth was refused: `past_retention`, nothing written. A
 * journal that expires after a valid commitment is purged without undoing the effect, as before.
 */
import type { Env } from "./env";
import { now } from "./db";
import { admittedReadAs, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, registerCommunityData, type CommunitySubject } from "./community-context";
import {
  type Allocation,
  type ContributionPolicy,
  DATE_LIMIT,
  DAY,
  DEFAULT_CONTRIBUTION_POLICY,
  type EvaluationResult,
  type EvidenceState,
  firstEligiblePeriod,
  HOUR,
  type Obligation,
  type Receipt,
  MAX_COPPER_AMOUNT,
  MAX_COPPER_TOTAL,
  WEEK,
  allocate,
  evaluate,
  isPeriodStart,
  obligationKey,
  periodStart,
} from "./community-contribution-policy";
import { SCHEDULED_CAPS } from "./scheduled-budget";

const SOURCES = ["officer_manual", "mail", "bank_log"] as const;
const STATUSES = ["matched", "unmatched", "disputed", "rejected"] as const;
const DISCORD_ID = /^\d{17,20}$/;
/** Reject control codes, bidi overrides/isolates, BOM and lone surrogates; preserve other Unicode unchanged. */
const UNSAFE_PAYER_NAME = /[\p{Cc}‪-‮⁦-⁩﻿]|\p{Cs}/u;
const T = "community_contribution_";
/** .78: the week / the receipt is within its lifetime by the database clock. */
const LIVE_WEEK = (a: string) => `${a}.retain_until > ${DB_NOW}`;
const LIVE_RECEIPT = (a: string) => `${a}.retain_until > ${DB_NOW} AND ${a}.voided_at IS NULL`;

export class ContributionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/*
 * Exact amounts (the donor's Codex 13:00:00 / 13:34:05 / 13:37:55 / 13:40:25 series): SQLite adds copper in exact 64-bit
 * integers, but a value past MAX_COPPER_TOTAL silently rounds once it becomes a JavaScript number, and SUM itself raises
 * "integer overflow" (a D1 error, a 500) once a partial sum passes 2^63 - 1. So every amount aggregate is read by ONE
 * statement that returns both its magnitude (the floating-point TOTAL of |amount| over its rows; TOTAL never raises) and
 * the exact SUM formed only over rows admitted by the gate "that magnitude <= MAX_COPPER_TOTAL" (gatedSumSql): when the
 * gate fails no row qualifies, so SUM is NULL and cannot raise; when it passes every partial sum is within
 * MAX_COPPER_TOTAL, so SUM is exact. JavaScript refuses anything past the bound as contribution_overflow (409), never a
 * rounded body, never a 500.
 */
const SAFE_REAL = `${MAX_COPPER_TOTAL}.0`;
const UNSUPPORTED = "9007199254740992.0";
const magnitudeOf = (x: string) => `(CASE WHEN typeof(${x}) = 'integer' THEN ABS(CAST(${x} AS REAL)) ELSE ${UNSUPPORTED} END)`;
type Rows = { table: string; where: (alias: string) => string };
const magnitudeSql = (rows: Rows) => `(SELECT TOTAL(${magnitudeOf("m.amount_copper")}) FROM ${rows.table} m WHERE ${rows.where("m")})`;
const gatedSumSql = (rows: Rows) =>
  `(SELECT SUM(s.amount_copper) FROM (SELECT TOTAL(${magnitudeOf("g.amount_copper")}) AS magnitude FROM ${rows.table} g WHERE ${rows.where("g")}) gt,
      ${rows.table} s WHERE gt.magnitude <= ${SAFE_REAL} AND ${rows.where("s")})`;
const journal = (where: Rows["where"]): Rows => ({ table: `${T}allocation_events`, where });
const receiptJournal = (receipt: string) => journal((a) => `${a}.receipt_id = ${receipt}`);
const weekJournal = (week: string) => journal((a) => `${a}.obligation_id = ${week}`);
const pairJournal = (receipt: string, week: string) => journal((a) => `${a}.receipt_id = ${receipt} AND ${a}.obligation_id = ${week}`);
const memberReceipts = (scope: string, id: string): Rows => ({ table: `${T}receipts`, where: (a) => `${a}.guild_scope = ${scope} AND ${a}.matched_discord_id = ${id}` });

const overflow = () => new ContributionError("contribution_overflow");
function storedCopper(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw overflow();
  return value;
}
function safeMagnitude(magnitude: unknown): void {
  if (typeof magnitude !== "number" || !(magnitude <= MAX_COPPER_TOTAL)) throw overflow();
}
function exactSum(total: unknown, magnitude: unknown): number {
  safeMagnitude(magnitude);
  return total === null ? 0 : storedCopper(total);
}
function plus(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw overflow();
  return result;
}

/** SQL, the largest magnitude in one member's ledger in one scope (a REAL; never an error); within MAX_COPPER_TOTAL every amount handed to JavaScript is exact. */
function ledgerMagnitudeSql(scope: string, id: string): string {
  const receipts = memberReceipts(scope, id);
  const eachReceipt = `FROM ${receipts.table} r WHERE ${receipts.where("r")}`;
  const eachWeek = `FROM ${T}obligations o WHERE o.guild_scope = ${scope} AND o.discord_id = ${id}`;
  const remainder = `(CASE WHEN typeof(r.retired_copper) = 'integer'
      THEN ABS(CAST(r.amount_copper - r.retired_copper - COALESCE(${gatedSumSql(receiptJournal("r.id"))}, 0) AS REAL))
      ELSE ${UNSUPPORTED} END)`;
  return `MAX(${magnitudeSql(receipts)},
    (SELECT COALESCE(MAX(${magnitudeSql(receiptJournal("r.id"))}), 0.0) ${eachReceipt}),
    (SELECT COALESCE(MAX(${magnitudeSql(weekJournal("o.id"))}), 0.0) ${eachWeek}),
    (SELECT TOTAL(${remainder}) ${eachReceipt}),
    (SELECT COALESCE(MAX(${magnitudeOf("o.amount_copper")}), 0.0) ${eachWeek}))`;
}
const ledgerGuard = (env: Env, guildScope: string, id: string) => env.DB.prepare(`SELECT ${ledgerMagnitudeSql("?1", "?2")} AS magnitude`).bind(guildScope, id);
function checkLedger(guard: D1Result | undefined): void {
  safeMagnitude((guard?.results[0] as { magnitude: unknown } | undefined)?.magnitude);
}

export function contributionRetentionDays(env: Env): number | null {
  const raw = env.CONTRIBUTIONS_RETENTION_DAYS;
  if (!raw || !/^\d{1,4}$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 1 && days <= 3650 ? days : null;
}
export function contributionsWritable(env: Env): boolean {
  return env.CONTRIBUTIONS_MODE === "ledger" && contributionRetentionDays(env) !== null;
}
function requireWritable(env: Env): void {
  if (!contributionsWritable(env)) throw new ContributionError("contributions_disabled");
}
/** A read under the acting session's admission when a fence is given (the same probe as admittedRead, in this batch); a plain batch for cron and the suites. */
async function readAs(env: Env, fence: SessionFence | undefined, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  if (!fence) return env.DB.batch(statements);
  const out = await admittedReadAs(env, fence, "applicantWrite", statements);
  if (out === FENCE_REFUSED) throw new ContributionError("reader_refused");
  return out;
}
/** The retention period in force for a record written now, in seconds (writes are refused without one). */
const retentionS = (env: Env) => contributionRetentionDays(env)! * DAY;
export const contributionScope = (env: Env): string => env.CONTRIBUTIONS_SCOPE || "olympus";

function scope(value: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/.test(value)) throw new ContributionError("invalid_scope");
}
function discordId(value: string): void {
  if (typeof value !== "string" || !DISCORD_ID.test(value)) throw new ContributionError("invalid_discord_id");
}

type PolicyRow = { version: string; amount_copper: number; anchor_weekday: number; anchor_hour_utc: number; grace_hours: number; final_notice_days: number; review_days: number; new_member_exempt_days: number };
const policyFromRow = (r: PolicyRow): ContributionPolicy => ({ version: r.version, amountCopper: r.amount_copper, anchorWeekday: r.anchor_weekday, anchorHourUtc: r.anchor_hour_utc, graceHours: r.grace_hours, finalNoticeDays: r.final_notice_days, reviewDays: r.review_days, newMemberExemptDays: r.new_member_exempt_days });
const toRow = (p: ContributionPolicy): PolicyRow => ({ version: p.version, amount_copper: p.amountCopper, anchor_weekday: p.anchorWeekday, anchor_hour_utc: p.anchorHourUtc, grace_hours: p.graceHours, final_notice_days: p.finalNoticeDays, review_days: p.reviewDays, new_member_exempt_days: p.newMemberExemptDays });
const samePolicy = (a: ContributionPolicy, b: ContributionPolicy) => JSON.stringify(policyFromRow(toRow(a))) === JSON.stringify(policyFromRow(toRow(b)));

/** Stores an immutable policy version; the same version with different values is refused; every version shares the week anchor already stored. */
export async function ensurePolicy(env: Env, policy: ContributionPolicy = DEFAULT_CONTRIBUTION_POLICY, at = now()): Promise<void> {
  requireWritable(env);
  periodStart(at, policy); // validates every field
  const r = toRow(policy);
  await env.DB.prepare(
    `INSERT INTO ${T}policies (version, amount_copper, anchor_weekday, anchor_hour_utc, grace_hours, final_notice_days, review_days, new_member_exempt_days, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
     WHERE NOT EXISTS (SELECT 1 FROM ${T}policies WHERE anchor_weekday <> ?3 OR anchor_hour_utc <> ?4)
     ON CONFLICT(version) DO NOTHING`,
  )
    .bind(r.version, r.amount_copper, r.anchor_weekday, r.anchor_hour_utc, r.grace_hours, r.final_notice_days, r.review_days, r.new_member_exempt_days, at)
    .run();
  const stored = await env.DB.prepare(`SELECT * FROM ${T}policies WHERE version = ?1`).bind(policy.version).first<PolicyRow>();
  if (!stored) throw new ContributionError("policy_anchor_change");
  if (!samePolicy(policyFromRow(stored), policy)) throw new ContributionError("policy_conflict");
}

/** An opaque snapshot token: the member row's random incarnation and its revision; handed back unchanged as expectedRevision. */
export type LedgerRevision = string;
const REVISION = /^([A-Za-z0-9_-]{16,64})\.(\d{1,15})$/;
const revisionToken = (row: { incarnation: string; revision: number } | undefined): LedgerRevision | null => (row ? `${row.incarnation}.${row.revision}` : null);
function parseRevision(token: LedgerRevision): { incarnation: string; revision: number } {
  const m = typeof token === "string" ? REVISION.exec(token) : null;
  if (!m) throw new ContributionError("invalid_revision");
  return { incarnation: m[1]!, revision: Number(m[2]) };
}

/**
 * The acting session: the keeper's subject (Discord id, session version, cookie expiry), re-stated inside the first
 * statement by fenceSql("applicantWrite"): the live row, the version, the expiry by the database clock, not denied, in
 * the server. The same fence for a member acknowledging and for a staff member recording.
 */
export type SessionFence = CommunitySubject;
const fenceAt = (fence: SessionFence | undefined, idPos: number, vPos: number, ePos: number) => (fence ? ` AND ${fenceSql("applicantWrite", idPos, vPos, ePos)}` : "");
const fenceBinds = (fence: SessionFence | undefined) => (fence ? [fence.discordId, fence.sessionVersion, fence.expiresAt] : []);

/** A new member row gets a fresh random incarnation; an existing one keeps its incarnation and bumps its revision; only when this request's obligation row was inserted. */
const bumpMemberFor = (env: Env, guildScope: string, id: string, at: number, opNonce: string) =>
  env.DB.prepare(
    `INSERT INTO ${T}members (guild_scope, discord_id, incarnation, revision, nonce, updated_at)
     SELECT ?1, ?2, ?4, 1, NULL, ?3 WHERE EXISTS (SELECT 1 FROM ${T}obligations WHERE guild_scope = ?1 AND discord_id = ?2 AND op_nonce = ?5)
     ON CONFLICT(guild_scope, discord_id) DO UPDATE SET revision = revision + 1, updated_at = ?3`,
  ).bind(guildScope, id, at, randomToken(), opNonce);

type ObligationInput = { guildScope: string; discordId: string; periodStart: number; eligible: boolean; policy?: ContributionPolicy; fence?: SessionFence; proof?: { firstLogin: number; sessionVersion: number } };

/** One obligation per member and week under a pinned policy version; an existing week is returned unchanged. */
export async function createObligation(env: Env, input: ObligationInput, at = now()): Promise<{ id: number; created: boolean }> {
  return openObligation(env, input, at, () => ensurePolicy(env, input.policy ?? DEFAULT_CONTRIBUTION_POLICY, at));
}

/**
 * createObligation's body. `ensure` stores or checks the policy at the point createObligation always did (after the
 * input checks, before the insert); the weekly opener passes one that runs once per run (.115, its D1 budget).
 */
async function openObligation(env: Env, input: ObligationInput, at: number, ensure: () => Promise<void>): Promise<{ id: number; created: boolean }> {
  requireWritable(env);
  const policy = input.policy ?? DEFAULT_CONTRIBUTION_POLICY;
  scope(input.guildScope);
  discordId(input.discordId);
  if (!isPeriodStart(input.periodStart, policy)) throw new ContributionError("invalid_period");
  obligationKey(input.guildScope, input.discordId, input.periodStart);
  const retainUntil = input.periodStart + WEEK + retentionS(env);
  if (retainUntil <= at) throw new ContributionError("past_retention");
  if (Math.max(retainUntil, input.periodStart + WEEK + policy.graceHours * HOUR) > DATE_LIMIT) throw new ContributionError("invalid_period");
  await ensure();
  const opNonce = randomToken();
  // .78: the opener's captured facts, re-stated at the insert: the account's row as read (its incarnation) and a roster-confirmed character now;
  // .88: and the eligibility it writes, recomputed from the member's CURRENT roster-confirmed characters (the earliest `member_since` plus the
  // exemption at or before the week's start: the same rule as firstEligiblePeriod, since the week's start is a period boundary)
  const fb = fenceBinds(input.fence).length;
  const proofSql = input.proof
    ? ` AND EXISTS (SELECT 1 FROM site_users pu WHERE pu.discord_id = ?2 AND pu.first_login = ?${11 + fb} AND pu.session_version = ?${12 + fb})
        AND EXISTS (SELECT 1 FROM characters pc WHERE pc.discord_id = ?2 AND pc.status = 'member')
        AND (SELECT MIN(pa.member_since) FROM characters pa WHERE pa.discord_id = ?2 AND pa.status = 'member' AND typeof(pa.member_since) = 'integer' AND pa.member_since > 0) IS NOT NULL
        AND ?7 = (CASE WHEN (SELECT MIN(pa.member_since) FROM characters pa WHERE pa.discord_id = ?2 AND pa.status = 'member' AND typeof(pa.member_since) = 'integer' AND pa.member_since > 0) + ?${13 + fb} <= ?3 THEN 1 ELSE 0 END)`
    : "";
  const proofBinds = input.proof ? [input.proof.firstLogin, input.proof.sessionVersion, policy.newMemberExemptDays * DAY] : [];
  // ?1 scope, ?2 member, ?3 period, ?4 due, ?5 version, ?6 amount, ?7 eligible, ?8 now, ?9 retain, ?10 opNonce, ?11.. the fence, then the proof (first login, session version, the exemption in seconds)
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ${T}obligations (guild_scope, discord_id, period_start, due_at, policy_version, amount_copper, eligible, state, retain_until, op_nonce, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?9, ?10, ?8, ?8
       WHERE ?3 > COALESCE((SELECT horizon FROM ${T}horizons WHERE guild_scope = ?1 AND kind = 'obligation'), 0) AND ?9 > ${DB_NOW}${fenceAt(input.fence, 11, 12, 13)}${proofSql}
       ON CONFLICT(guild_scope, discord_id, period_start) DO NOTHING`,
    ).bind(input.guildScope, input.discordId, input.periodStart, input.periodStart + WEEK, policy.version, policy.amountCopper, input.eligible ? 1 : 0, at, retainUntil, opNonce, ...fenceBinds(input.fence), ...proofBinds),
    bumpMemberFor(env, input.guildScope, input.discordId, at, opNonce),
  ]);
  // .80: the new row's id is a later standalone read: under the acting session's admission (a committed insert stays either way); .88: with the deadline judged by the database clock, for the explanation
  const [found, deadline] = await readAs(env, input.fence, [
    env.DB.prepare(`SELECT id FROM ${T}obligations o WHERE o.guild_scope = ? AND o.discord_id = ? AND o.period_start = ? AND ${LIVE_WEEK("o")}`).bind(input.guildScope, input.discordId, input.periodStart),
    env.DB.prepare(`SELECT (?1 > ${DB_NOW}) AS live`).bind(retainUntil),
  ]);
  const row = found!.results[0] as { id: number } | undefined;
  if (!row) {
    // born at or past its deadline by the database clock (past_retention); the account, its roster proof or its eligibility changed since the scan (proof_changed); or at/before the horizon
    if ((deadline!.results[0] as { live: number } | undefined)?.live !== 1) throw new ContributionError("past_retention");
    throw new ContributionError(input.proof && (inserted!.meta.changes ?? 0) === 0 ? "proof_changed" : "past_retention");
  }
  return { id: row.id, created: (inserted!.meta.changes ?? 0) > 0 };
}

export interface ReceiptInput {
  guildScope: string;
  source: (typeof SOURCES)[number];
  /** An actual source identifier: the officer's receipt id, or the source's own event id. Never derived from the amount. */
  sourceId: string;
  payerName: string | null;
  amountCopper: number;
  observedAt: number;
  observerDiscordId: string;
  matchedDiscordId: string | null;
  status: (typeof STATUSES)[number];
}

/** Idempotent on (scope, source, source id): an identical retry returns the same receipt, a different one is refused; a receipt's status and match never change in place (void + a new receipt). */
export async function recordReceipt(env: Env, input: ReceiptInput, at = now(), fence?: SessionFence): Promise<{ id: string; created: boolean }> {
  requireWritable(env);
  scope(input.guildScope);
  if (!(SOURCES as readonly string[]).includes(input.source)) throw new ContributionError("invalid_receipt");
  if (typeof input.sourceId !== "string" || !/^[A-Za-z0-9:._-]{1,128}$/.test(input.sourceId)) throw new ContributionError("invalid_receipt");
  if (input.payerName !== null && (typeof input.payerName !== "string" || input.payerName.length > 64 || UNSAFE_PAYER_NAME.test(input.payerName))) throw new ContributionError("invalid_receipt");
  if (!Number.isSafeInteger(input.amountCopper) || input.amountCopper <= 0) throw new ContributionError("invalid_receipt");
  if (!Number.isSafeInteger(input.observedAt) || input.observedAt <= 0 || input.observedAt > at) throw new ContributionError("invalid_receipt");
  discordId(input.observerDiscordId);
  if (!(STATUSES as readonly string[]).includes(input.status)) throw new ContributionError("invalid_receipt");
  if ((input.status === "matched" && input.matchedDiscordId === null) || (input.status === "unmatched" && input.matchedDiscordId !== null)) throw new ContributionError("invalid_receipt");
  if (input.matchedDiscordId !== null) discordId(input.matchedDiscordId);
  const retainUntil = input.observedAt + retentionS(env);
  if (retainUntil <= at) throw new ContributionError("past_retention");
  const payloadHash = await sha256Hex(JSON.stringify([input.guildScope, input.source, input.sourceId, input.payerName, input.amountCopper, input.observedAt, input.observerDiscordId, input.matchedDiscordId, input.status]));
  if (input.amountCopper > MAX_COPPER_AMOUNT) {
    // the input ceiling is for a new receipt only: an identical retry of one stored before it is a replay of stored data (.80: an admitted, live-only read)
    const [found] = await readAs(env, fence, [env.DB.prepare(`SELECT id, payload_hash FROM ${T}receipts r WHERE r.guild_scope = ? AND r.source = ? AND r.source_id = ? AND ${LIVE_WEEK("r")}`).bind(input.guildScope, input.source, input.sourceId)]);
    const stored = found!.results[0] as { id: string; payload_hash: string } | undefined;
    if (stored?.payload_hash !== payloadHash) throw new ContributionError("invalid_receipt");
    return { id: stored.id, created: false };
  }
  const id = randomToken();
  // ?1 id, ?2 scope, ?3 source, ?4 sourceId, ?5 hash, ?6 payer, ?7 amount, ?8 observed, ?9 observer, ?10 matched, ?11 status, ?12 retain, ?13 now, ?14.. the fence
  const stmts = [
    // .88: the member's private magnitude is read only while the acting session's fence holds in this same statement (no row otherwise); the explanation below is an admitted read
    env.DB.prepare(`SELECT ${magnitudeSql(memberReceipts("?1", "?2"))} + CAST(?3 AS REAL) > ${SAFE_REAL} AS over_limit WHERE 1${fenceAt(fence, 4, 5, 6)}`).bind(input.guildScope, input.matchedDiscordId, input.amountCopper, ...fenceBinds(fence)),
    env.DB.prepare(
      `INSERT INTO ${T}receipts (id, guild_scope, source, source_id, payload_hash, payer_name, amount_copper, observed_at, observer_discord_id, matched_discord_id, status, retain_until, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
       WHERE ?8 > COALESCE((SELECT horizon FROM ${T}horizons WHERE guild_scope = ?2 AND kind = 'receipt:' || ?3), 0) AND ?12 > ${DB_NOW}
         AND ${magnitudeSql(memberReceipts("?2", "?10"))} + CAST(?7 AS REAL) <= ${SAFE_REAL}${fenceAt(fence, 14, 15, 16)}
       ON CONFLICT(guild_scope, source, source_id) DO NOTHING`,
    ).bind(id, input.guildScope, input.source, input.sourceId, payloadHash, input.payerName, input.amountCopper, input.observedAt, input.observerDiscordId, input.matchedDiscordId, input.status, retainUntil, at, ...fenceBinds(fence)),
  ];
  if (input.matchedDiscordId) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO ${T}members (guild_scope, discord_id, incarnation, revision, nonce, updated_at)
         SELECT ?1, ?2, ?5, 1, NULL, ?3 WHERE EXISTS (SELECT 1 FROM ${T}receipts WHERE id = ?4)
         ON CONFLICT(guild_scope, discord_id) DO UPDATE SET revision = revision + 1, updated_at = ?3`,
      ).bind(input.guildScope, input.matchedDiscordId, at, id, randomToken()),
    );
  }
  const [probe, inserted] = await env.DB.batch(stmts);
  if ((inserted!.meta.changes ?? 0) > 0) return { id, created: true };
  // .80: the explanation is a later standalone read: admitted, and live-only (an expired receipt under that source id is never replayed; it is past_retention until the purge frees the id)
  const [found] = await readAs(env, fence, [env.DB.prepare(`SELECT id, payload_hash FROM ${T}receipts r WHERE r.guild_scope = ? AND r.source = ? AND r.source_id = ? AND ${LIVE_WEEK("r")}`).bind(input.guildScope, input.source, input.sourceId)]);
  const existing = found!.results[0] as { id: string; payload_hash: string } | undefined;
  if (existing && existing.payload_hash === payloadHash) return { id: existing.id, created: false };
  if (existing) throw new ContributionError("receipt_conflict");
  if ((probe!.results[0] as { over_limit: number } | undefined)?.over_limit !== 0) throw new ContributionError("contribution_limit");
  throw new ContributionError("past_retention");
}

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ObligationRow = PolicyRow & {
  id: number;
  guild_scope: string;
  discord_id: string;
  period_start: number;
  due_at: number;
  amount_copper: number;
  eligible: number;
  state: Obligation["state"];
  acknowledged_at: number | null;
  officer_contact_at: number | null;
  final_notice_at: number | null;
  final_acknowledged_at: number | null;
  final_officer_contact_at: number | null;
  revision: number;
  facts_revision: number;
};
const OBLIGATION_SELECT = `SELECT o.id, o.guild_scope, o.discord_id, o.period_start, o.due_at, o.amount_copper, o.eligible, o.state,
    o.acknowledged_at, o.officer_contact_at, o.final_notice_at, o.final_acknowledged_at, o.final_officer_contact_at, o.revision, o.facts_revision,
    p.version, p.amount_copper AS policy_amount, p.anchor_weekday, p.anchor_hour_utc, p.grace_hours, p.final_notice_days, p.review_days, p.new_member_exempt_days
  FROM ${T}obligations o JOIN ${T}policies p ON p.version = o.policy_version`;
function obligationFromRow(r: ObligationRow & { policy_amount: number }): Obligation {
  return { guildScope: r.guild_scope, discordId: r.discord_id, periodStart: r.period_start, dueAt: r.due_at, amountCopper: storedCopper(r.amount_copper), policy: policyFromRow({ ...r, amount_copper: storedCopper(r.policy_amount) }), eligible: r.eligible === 1, state: r.state };
}

export interface MemberSnapshot {
  revision: LedgerRevision | null;
  obligations: Obligation[];
  obligationIds: Map<string, number>;
  receipts: Receipt[];
  allocations: Allocation[];
}

/** One consistent read of a member's ledger: revision, obligations, their matched receipts and allocation sums. */
export async function memberSnapshot(env: Env, guildScope: string, id: string, at = now(), fence?: SessionFence): Promise<MemberSnapshot> {
  const [member, obligations, receipts, sums, guard] = await readAs(env, fence, [
    env.DB.prepare(`SELECT incarnation, revision FROM ${T}members WHERE guild_scope = ? AND discord_id = ?`).bind(guildScope, id),
    env.DB.prepare(`${OBLIGATION_SELECT} WHERE o.guild_scope = ? AND o.discord_id = ? AND ${LIVE_WEEK("o")} ORDER BY o.period_start`).bind(guildScope, id),
    env.DB.prepare(
      `SELECT r.id, r.guild_scope, r.amount_copper, r.retired_copper, (r.retain_until <= ${DB_NOW}) AS expired,
         ${gatedSumSql(receiptJournal("r.id"))} AS allocated, ${magnitudeSql(receiptJournal("r.id"))} AS allocated_magnitude,
         r.observed_at, r.matched_discord_id, r.status
       FROM ${T}receipts r
       WHERE r.guild_scope = ?1 AND r.matched_discord_id = ?2 AND r.retired_copper < r.amount_copper AND r.voided_at IS NULL`,
    ).bind(guildScope, id),
    env.DB.prepare(
      `SELECT p.receipt_id, p.obligation_id, ${gatedSumSql(pairJournal("p.receipt_id", "p.obligation_id"))} AS amount,
         ${magnitudeSql(pairJournal("p.receipt_id", "p.obligation_id"))} AS magnitude
       FROM (SELECT DISTINCT e.receipt_id, e.obligation_id FROM ${T}allocation_events e
             JOIN ${T}obligations o ON o.id = e.obligation_id WHERE o.guild_scope = ? AND o.discord_id = ? AND ${LIVE_WEEK("o")}) p`,
    ).bind(guildScope, id),
    ledgerGuard(env, guildScope, id),
  ]);
  checkLedger(guard);
  const obligationRows = obligations!.results as (ObligationRow & { policy_amount: number })[];
  const pure = obligationRows.map(obligationFromRow);
  const ids = new Map<string, number>();
  const keyOf = new Map<number, string>();
  for (const [i, row] of obligationRows.entries()) {
    const key = obligationKey(pure[i]!.guildScope, pure[i]!.discordId, pure[i]!.periodStart);
    ids.set(key, row.id);
    keyOf.set(row.id, key);
  }
  const allocations: Allocation[] = [];
  for (const s of sums!.results as { receipt_id: string; obligation_id: number; amount: unknown; magnitude: unknown }[]) {
    const amount = exactSum(s.amount, s.magnitude);
    if (amount < 0) throw new ContributionError("ledger_inconsistent");
    if (amount === 0) continue;
    allocations.push({ receiptId: s.receipt_id, obligationKey: keyOf.get(s.obligation_id)!, amountCopper: amount, reversedAt: null });
  }
  type SnapshotReceiptRow = { id: string; guild_scope: string; amount_copper: unknown; retired_copper: unknown; expired: number; allocated: unknown; allocated_magnitude: unknown; observed_at: number; matched_discord_id: string | null; status: Receipt["status"] };
  return {
    revision: revisionToken(member!.results[0] as { incarnation: string; revision: number } | undefined),
    obligations: pure,
    obligationIds: ids,
    receipts: (receipts!.results as SnapshotReceiptRow[])
      .map((r) => ({
        id: r.id,
        guildScope: r.guild_scope,
        // past its deadline a receipt counts only for what it already pays; otherwise what is not yet retired
        amountCopper: r.expired ? exactSum(r.allocated, r.allocated_magnitude) : plus(storedCopper(r.amount_copper), -storedCopper(r.retired_copper)),
        observedAt: r.observed_at,
        matchedDiscordId: r.matched_discord_id,
        status: r.status,
      }))
      .filter((r) => r.amountCopper > 0),
    allocations,
  };
}

const PAID_SQL = `SELECT ${gatedSumSql(weekJournal("?1"))} AS total, ${magnitudeSql(weekJournal("?1"))} AS magnitude`;
const exactRow = (row: unknown) => {
  const r = row as { total: unknown; magnitude: unknown } | undefined;
  return exactSum(r?.total ?? null, r?.magnitude);
};
/** One read: the member's revision, and the obligation (which must belong to that member) with its paid sum. */
async function precheck(env: Env, guildScope: string, id: string, obligationId: number, fence?: SessionFence) {
  const [member, rows, paid] = await readAs(env, fence, [
    env.DB.prepare(`SELECT incarnation, revision FROM ${T}members WHERE guild_scope = ? AND discord_id = ?`).bind(guildScope, id),
    env.DB.prepare(`${OBLIGATION_SELECT} WHERE o.id = ? AND o.guild_scope = ? AND o.discord_id = ? AND ${LIVE_WEEK("o")}`).bind(obligationId, guildScope, id), // .78: an expired week is not found
    env.DB.prepare(PAID_SQL).bind(obligationId),
  ]);
  const obligation = (rows!.results as (ObligationRow & { policy_amount: number })[])[0] ?? null;
  return { revision: revisionToken(member!.results[0] as { incarnation: string; revision: number } | undefined), obligation, paid: obligation ? exactRow(paid!.results[0]) : 0 };
}
function evaluationInputs(row: ObligationRow, paid: number, evidence: EvidenceState, at: number) {
  return { paidCopper: paid, exemption: row.state === "exempt", disputed: row.state === "disputed", evidence, acknowledgedAt: row.acknowledged_at, officerContactAt: row.officer_contact_at, finalNoticeAt: row.final_notice_at, finalAcknowledgedAt: row.final_acknowledged_at, finalOfficerContactAt: row.final_officer_contact_at, now: at, revision: row.revision, storedRevision: row.facts_revision };
}

/**
 * The per-member compare-and-swap that opens every snapshot-based write, storing this request's nonce and requiring the
 * acting session in the same statement. .94: a decision-bearing write passes its journal deadline, required to be ahead
 * of the database clock HERE, in the first mutation and before any effect (`?7 > DB_NOW`); the fence follows it.
 */
function casMember(env: Env, guildScope: string, id: string, expected: LedgerRevision, nonce: string, at: number, fence?: SessionFence, deadline: number | null = null) {
  const { incarnation, revision } = parseRevision(expected);
  const birth = deadline === null ? "" : ` AND ?7 > ${DB_NOW}`;
  const f = deadline === null ? 7 : 8;
  return env.DB.prepare(
    `UPDATE ${T}members SET revision = revision + 1, nonce = ?5, updated_at = ?6
     WHERE guild_scope = ?1 AND discord_id = ?2 AND incarnation = ?3 AND revision = ?4${birth}${fenceAt(fence, f, f + 1, f + 2)}`,
  ).bind(guildScope, id, incarnation, revision, nonce, at, ...(deadline === null ? [] : [deadline]), ...fenceBinds(fence));
}
/** .94: the journal deadline a decision-bearing write captures before its batch: the actor's `now` plus the retention in force. */
const journalDeadline = (env: Env, at: number) => at + retentionS(env);
/** .94: the last statement of a decision-bearing batch: is the captured deadline still ahead of the database clock? */
const birthProbe = (env: Env, deadline: number) => env.DB.prepare(`SELECT (?1 > ${DB_NOW}) AS live`).bind(deadline);
/** .94: a first mutation that changed nothing is `stale` only while the journal's deadline is ahead of the database clock; otherwise the birth was refused. */
function staleOrRefused(probe: D1Result<unknown> | undefined): "stale" {
  if ((probe?.results[0] as { live?: number } | undefined)?.live !== 1) throw new ContributionError("past_retention");
  return "stale";
}
const nextRevision = (expected: LedgerRevision) => parseRevision(expected).revision + 1;
const ADMITTED = `EXISTS (SELECT 1 FROM ${T}members WHERE guild_scope = ?1 AND discord_id = ?2 AND nonce = ?3)`;
// .78: the week live and the receipt live and unvoided, by the database clock at the write (a deadline crossed since the snapshot admits nothing)
const OWNED_PAIR = `EXISTS (SELECT 1 FROM ${T}obligations o WHERE o.id = ?5 AND o.guild_scope = ?1 AND o.discord_id = ?2 AND ${LIVE_WEEK("o")})
  AND EXISTS (SELECT 1 FROM ${T}receipts r WHERE r.id = ?4 AND r.guild_scope = ?1 AND r.matched_discord_id = ?2 AND ${LIVE_RECEIPT("r")})`;

/** Plan allocations with the pure allocate() on one snapshot and apply them atomically; a stale snapshot writes nothing. */
export async function applyAllocations(env: Env, guildScope: string, id: string, actor: string, at = now(), fence?: SessionFence): Promise<{ status: "applied" | "stale" | "nothing"; allocations: Allocation[]; unallocatedCredit: { receiptId: string; amountCopper: number }[] }> {
  requireWritable(env);
  const snap = await memberSnapshot(env, guildScope, id, at, fence);
  if (snap.revision === null) return { status: "nothing", allocations: [], unallocatedCredit: [] };
  let plan: ReturnType<typeof allocate>;
  try {
    plan = allocate(snap.obligations, snap.receipts, snap.allocations, at);
  } catch (err) {
    if (err instanceof RangeError && err.message === "contribution_overflow") throw new ContributionError("contribution_overflow");
    throw err;
  }
  if (!plan.allocations.length) return { status: "nothing", allocations: [], unallocatedCredit: plan.unallocatedCredit };
  const nonce = randomToken();
  const results = await env.DB.batch([
    casMember(env, guildScope, id, snap.revision, nonce, at, fence),
    ...plan.allocations.map((a) =>
      env.DB.prepare(`INSERT INTO ${T}allocation_events (receipt_id, obligation_id, amount_copper, member_revision, nonce, actor, created_at) SELECT ?4, ?5, ?6, ?7, ?3, ?8, ?9 WHERE ${ADMITTED} AND ${OWNED_PAIR}`).bind(
        guildScope, id, nonce, a.receiptId, snap.obligationIds.get(a.obligationKey)!, a.amountCopper, nextRevision(snap.revision!), actor, at,
      ),
    ),
  ]);
  if ((results[0]!.meta.changes ?? 0) === 0) return { status: "stale", allocations: [], unallocatedCredit: [] };
  const written = plan.allocations.filter((_, i) => (results[i + 1]!.meta.changes ?? 0) > 0);
  return { status: "applied", allocations: written, unallocatedCredit: plan.unallocatedCredit };
}

/**
 * Journal a decision in the same admitted batch; `effect` (.78) is the SQL that proves the decision's own statement applied
 * (?3 nonce, ?4 week, ?5 action, ?8 now), so no decision is journaled without its effect; `deadline` (?9, .94) is the
 * journal's deadline, already required ahead of the database clock by the batch's first mutation and restated here.
 */
const decision = (env: Env, guildScope: string, id: string, nonce: string, obligationId: number, action: string, actor: string, revision: number, at: number, deadline: number, effect: string) =>
  env.DB.prepare(
    `INSERT INTO ${T}decisions (guild_scope, discord_id, obligation_id, action, actor, member_revision, nonce, at, retain_until)
     SELECT ?1, ?2, ?4, ?5, ?6, ?7, ?3, ?8, ?9 WHERE ${ADMITTED} AND ?9 > ${DB_NOW} AND EXISTS (SELECT 1 FROM ${T}obligations o WHERE o.id = ?4 AND o.guild_scope = ?1 AND o.discord_id = ?2 AND ${LIVE_WEEK("o")}) AND ${effect}`,
  ).bind(guildScope, id, nonce, obligationId, action, actor, revision, at, deadline);
/** Clear contact facts and realign facts_revision: old warnings never carry over to a changed obligation. */
const resetFacts = (env: Env, guildScope: string, id: string, nonce: string, obligationId: number, at: number) =>
  env.DB.prepare(
    `UPDATE ${T}obligations SET revision = revision + 1, facts_revision = revision + 1,
       acknowledged_at = NULL, officer_contact_at = NULL, final_notice_at = NULL, final_acknowledged_at = NULL, final_officer_contact_at = NULL, updated_at = ?5
     WHERE id = ?4 AND guild_scope = ?1 AND discord_id = ?2 AND ${LIVE_WEEK(`${T}obligations`)} AND ${ADMITTED}`,
  ).bind(guildScope, id, nonce, obligationId, at);

/** Reverse a pair's whole current allocation; the obligation's contact facts are cleared and its revision realigned. */
export async function reverseAllocation(env: Env, input: { guildScope: string; discordId: string; receiptId: string; obligationId: number; expectedRevision: LedgerRevision; actor: string; fence?: SessionFence }, at = now()): Promise<"reversed" | "stale" | "nothing"> {
  requireWritable(env);
  parseRevision(input.expectedRevision);
  const pre = await precheck(env, input.guildScope, input.discordId, input.obligationId, input.fence);
  if (pre.revision === null || !pre.obligation) throw new ContributionError("not_found");
  if (pre.revision !== input.expectedRevision) return "stale";
  const [receipt, pair] = await readAs(env, input.fence, [
    env.DB.prepare(`SELECT 1 AS hit FROM ${T}receipts r WHERE r.id = ? AND r.guild_scope = ? AND r.matched_discord_id = ? AND ${LIVE_WEEK("r")}`).bind(input.receiptId, input.guildScope, input.discordId), // .78: live by the database clock
    env.DB.prepare(`SELECT ${gatedSumSql(pairJournal("?1", "?2"))} AS total, ${magnitudeSql(pairJournal("?1", "?2"))} AS magnitude`).bind(input.receiptId, input.obligationId),
  ]);
  if (!receipt!.results.length) throw new ContributionError("not_found");
  const current = exactRow(pair!.results[0]);
  if (current <= 0) return "nothing";
  const nonce = randomToken();
  const deadline = journalDeadline(env, at);
  const { guildScope, discordId: id } = input;
  const results = await env.DB.batch([
    casMember(env, guildScope, id, input.expectedRevision, nonce, at, input.fence, deadline),
    env.DB.prepare(`INSERT INTO ${T}allocation_events (receipt_id, obligation_id, amount_copper, member_revision, nonce, actor, created_at) SELECT ?4, ?5, ?6, ?7, ?3, ?8, ?9 WHERE ${ADMITTED} AND ${OWNED_PAIR}`).bind(
      guildScope, id, nonce, input.receiptId, input.obligationId, -current, nextRevision(input.expectedRevision), input.actor, at,
    ),
    resetFacts(env, guildScope, id, nonce, input.obligationId, at),
    decision(env, guildScope, id, nonce, input.obligationId, "allocation_reversed", input.actor, nextRevision(input.expectedRevision), at, deadline, `EXISTS (SELECT 1 FROM ${T}allocation_events e WHERE e.nonce = ?3 AND e.obligation_id = ?4)`),
    birthProbe(env, deadline),
  ]);
  return (results[0]!.meta.changes ?? 0) > 0 ? "reversed" : staleOrRefused(results[results.length - 1]);
}

/** Void invalid evidence: every active allocation of the receipt reversed, the facts of every week it paid cleared, a decision per week, the receipt never spendable again. */
export async function voidReceipt(env: Env, input: { guildScope: string; discordId: string; receiptId: string; expectedRevision: LedgerRevision; actor: string; fence?: SessionFence }, at = now()): Promise<"voided" | "stale" | "already_voided"> {
  requireWritable(env);
  parseRevision(input.expectedRevision);
  const { guildScope, discordId: id, receiptId } = input;
  const [member, receipt] = await readAs(env, input.fence, [
    env.DB.prepare(`SELECT incarnation, revision FROM ${T}members WHERE guild_scope = ? AND discord_id = ?`).bind(guildScope, id),
    env.DB.prepare(`SELECT voided_at, ${magnitudeSql(receiptJournal("?1"))} AS magnitude FROM ${T}receipts WHERE id = ?1 AND guild_scope = ?2 AND matched_discord_id = ?3`).bind(receiptId, guildScope, id),
  ]);
  const token = revisionToken(member!.results[0] as { incarnation: string; revision: number } | undefined);
  const row = receipt!.results[0] as { voided_at: number | null; magnitude: unknown } | undefined;
  if (token === null || !row) throw new ContributionError("not_found");
  if (token !== input.expectedRevision) return "stale";
  if (row.voided_at !== null) return "already_voided";
  safeMagnitude(row.magnitude);
  const nonce = randomToken();
  const deadline = journalDeadline(env, at);
  const next = nextRevision(input.expectedRevision);
  const paidWeeks = `SELECT obligation_id FROM ${T}allocation_events WHERE receipt_id = ?4 GROUP BY obligation_id HAVING SUM(amount_copper) > 0`;
  const owned = `EXISTS (SELECT 1 FROM ${T}receipts r WHERE r.id = ?4 AND r.guild_scope = ?1 AND r.matched_discord_id = ?2 AND r.voided_at IS NULL)`;
  const results = await env.DB.batch([
    casMember(env, guildScope, id, input.expectedRevision, nonce, at, input.fence, deadline),
    env.DB.prepare(
      `INSERT INTO ${T}decisions (guild_scope, discord_id, obligation_id, action, actor, member_revision, nonce, at, retain_until)
       SELECT ?1, ?2, o.id, 'receipt_voided', ?5, ?6, ?3, ?7, ?8 FROM ${T}obligations o
       WHERE o.id IN (${paidWeeks}) AND o.guild_scope = ?1 AND o.discord_id = ?2 AND ${ADMITTED} AND ${owned} AND ?8 > ${DB_NOW}`,
    ).bind(guildScope, id, nonce, receiptId, input.actor, next, at, deadline),
    env.DB.prepare(
      `UPDATE ${T}obligations SET revision = revision + 1, facts_revision = revision + 1,
         acknowledged_at = NULL, officer_contact_at = NULL, final_notice_at = NULL, final_acknowledged_at = NULL, final_officer_contact_at = NULL, updated_at = ?5
       WHERE id IN (${paidWeeks}) AND guild_scope = ?1 AND discord_id = ?2 AND ${ADMITTED} AND ${owned}`,
    ).bind(guildScope, id, nonce, receiptId, at),
    env.DB.prepare(
      `INSERT INTO ${T}allocation_events (receipt_id, obligation_id, amount_copper, member_revision, nonce, actor, created_at)
       SELECT ?4, obligation_id, -SUM(amount_copper), ?5, ?3, ?6, ?7 FROM ${T}allocation_events
       WHERE receipt_id = ?4 AND ${ADMITTED} AND ${owned} GROUP BY obligation_id HAVING SUM(amount_copper) > 0`,
    ).bind(guildScope, id, nonce, receiptId, next, input.actor, at),
    env.DB.prepare(`UPDATE ${T}receipts SET voided_at = ?5 WHERE id = ?4 AND guild_scope = ?1 AND matched_discord_id = ?2 AND voided_at IS NULL AND ${ADMITTED}`).bind(guildScope, id, nonce, receiptId, at),
    birthProbe(env, deadline),
  ]);
  return (results[0]!.meta.changes ?? 0) > 0 ? "voided" : staleOrRefused(results[results.length - 1]);
}

/** Exemption, dispute and resolution; returning an obligation to 'open' clears the old contacts. */
export async function setObligationState(env: Env, input: { guildScope: string; discordId: string; obligationId: number; state: Obligation["state"]; expectedRevision: LedgerRevision; actor: string; fence?: SessionFence }, at = now()): Promise<"updated" | "stale"> {
  requireWritable(env);
  if (!["open", "exempt", "disputed", "resolved"].includes(input.state)) throw new ContributionError("invalid_state");
  parseRevision(input.expectedRevision);
  const pre = await precheck(env, input.guildScope, input.discordId, input.obligationId, input.fence);
  if (pre.revision === null || !pre.obligation) throw new ContributionError("not_found");
  if (pre.revision !== input.expectedRevision) return "stale";
  const nonce = randomToken();
  const deadline = journalDeadline(env, at);
  const { guildScope, discordId: id } = input;
  const results = await env.DB.batch([
    casMember(env, guildScope, id, input.expectedRevision, nonce, at, input.fence, deadline),
    env.DB.prepare(
      `UPDATE ${T}obligations SET state = ?5, revision = revision + 1, facts_revision = CASE WHEN ?5 IN ('exempt', 'resolved') THEN revision + 1 ELSE facts_revision END, updated_at = ?6
       WHERE id = ?4 AND guild_scope = ?1 AND discord_id = ?2 AND ${LIVE_WEEK(`${T}obligations`)} AND ${ADMITTED}`,
    ).bind(guildScope, id, nonce, input.obligationId, input.state, at),
    ...(input.state === "open" ? [resetFacts(env, guildScope, id, nonce, input.obligationId, at)] : []),
    decision(env, guildScope, id, nonce, input.obligationId, `state_${input.state}`, input.actor, nextRevision(input.expectedRevision), at, deadline, `EXISTS (SELECT 1 FROM ${T}obligations o2 WHERE o2.id = ?4 AND o2.state = substr(?5, 7) AND o2.updated_at = ?8)`),
    birthProbe(env, deadline),
  ]);
  return (results[0]!.meta.changes ?? 0) > 0 ? "updated" : staleOrRefused(results[results.length - 1]);
}

const CONTACT_COLUMNS = { acknowledged: "acknowledged_at", officer_contact: "officer_contact_at", final_notice: "final_notice_at", final_acknowledged: "final_acknowledged_at", final_officer_contact: "final_officer_contact_at" } as const;
export type ContactKind = keyof typeof CONTACT_COLUMNS;
/** The stages in which each contact may be recorded; anything else would be a contact the policy did not call for. */
export const CONTACT_STAGES: Record<ContactKind, readonly string[]> = {
  acknowledged: ["notice_available", "acknowledged"],
  officer_contact: ["notice_available", "acknowledged"],
  final_notice: ["final_notice"],
  final_acknowledged: ["final_notice"],
  final_officer_contact: ["final_notice"],
};

/** Record one explicit human contact fact at the server's clock; set once, only while the facts belong to the current revision, only when the evaluation calls for it. */
export async function recordContact(env: Env, input: { guildScope: string; discordId: string; obligationId: number; kind: ContactKind; evidence: EvidenceState; expectedRevision: LedgerRevision; actor: string; fence?: SessionFence }, at = now()): Promise<"recorded" | "stale" | "already_recorded" | "facts_stale" | "not_applicable"> {
  requireWritable(env);
  const column = Object.hasOwn(CONTACT_COLUMNS, input.kind) ? CONTACT_COLUMNS[input.kind] : undefined;
  if (!column) throw new ContributionError("invalid_contact");
  parseRevision(input.expectedRevision);
  const pre = await precheck(env, input.guildScope, input.discordId, input.obligationId, input.fence);
  if (pre.revision === null || !pre.obligation) throw new ContributionError("not_found");
  if (pre.revision !== input.expectedRevision) return "stale";
  if (pre.obligation[column] !== null) return "already_recorded";
  if (pre.obligation.facts_revision !== pre.obligation.revision) return "facts_stale";
  const { stage } = evaluate(obligationFromRow(pre.obligation), evaluationInputs(pre.obligation, pre.paid, input.evidence, at));
  if (!CONTACT_STAGES[input.kind].includes(stage)) return "not_applicable";
  if ((input.kind === "final_acknowledged" || input.kind === "final_officer_contact") && pre.obligation.final_notice_at === null) return "not_applicable";
  const nonce = randomToken();
  const deadline = journalDeadline(env, at);
  const { guildScope, discordId: id } = input;
  // .78: the evidence state the evaluation relied on (every contact stage requires complete evidence) is re-stated at the write, live by the database clock
  const evidenceSql = `EXISTS (SELECT 1 FROM ${T}evidence e JOIN ${T}obligations o ON o.guild_scope = e.guild_scope AND o.period_start = e.period_start WHERE o.id = ?4 AND e.state = ?7 AND e.retain_until > ${DB_NOW})`;
  const results = await env.DB.batch([
    casMember(env, guildScope, id, input.expectedRevision, nonce, at, input.fence, deadline),
    env.DB.prepare(`UPDATE ${T}obligations SET ${column} = ?5, updated_at = ?6 WHERE id = ?4 AND guild_scope = ?1 AND discord_id = ?2 AND ${column} IS NULL AND facts_revision = revision AND ${LIVE_WEEK(`${T}obligations`)} AND ${evidenceSql} AND ${ADMITTED}`).bind(guildScope, id, nonce, input.obligationId, at, at, input.evidence),
    decision(env, guildScope, id, nonce, input.obligationId, `contact_${input.kind}`, input.actor, nextRevision(input.expectedRevision), at, deadline, `EXISTS (SELECT 1 FROM ${T}obligations o2 WHERE o2.id = ?4 AND o2.${column} = ?8)`),
    birthProbe(env, deadline),
  ]);
  if ((results[0]!.meta.changes ?? 0) === 0) return staleOrRefused(results[results.length - 1]);
  return (results[1]!.meta.changes ?? 0) > 0 ? "recorded" : "facts_stale"; // the week or its attestation changed between the evaluation and the write
}

/** Read-only: the pure evaluation of one obligation from its stored facts and allocation sum. */
export async function evaluateObligation(env: Env, obligationId: number, evidence: EvidenceState, at = now()): Promise<EvaluationResult | null> {
  const [rows, paid] = await env.DB.batch([env.DB.prepare(`${OBLIGATION_SELECT} WHERE o.id = ? AND ${LIVE_WEEK("o")}`).bind(obligationId), env.DB.prepare(PAID_SQL).bind(obligationId)]);
  const row = (rows!.results as (ObligationRow & { policy_amount: number })[])[0];
  if (!row) return null;
  return evaluate(obligationFromRow(row), evaluationInputs(row, exactRow(paid!.results[0]), evidence, at));
}

export const EVIDENCE_STATES = ["complete", "partial", "stale", "unavailable"] as const;

/** An officer's attestation of one week's payment evidence (non-personal); changing its state clears the facts of every obligation in that week, re-attesting the same state keeps them. */
export async function attestEvidence(env: Env, input: { guildScope: string; periodStart: number; state: EvidenceState; fence?: SessionFence }, at = now()): Promise<void> {
  requireWritable(env);
  scope(input.guildScope);
  if (!(EVIDENCE_STATES as readonly string[]).includes(input.state)) throw new ContributionError("invalid_evidence");
  if (!isPeriodStart(input.periodStart, DEFAULT_CONTRIBUTION_POLICY)) throw new ContributionError("invalid_period");
  if (input.periodStart > at) throw new ContributionError("invalid_period");
  const retainUntil = input.periodStart + WEEK + retentionS(env);
  if (retainUntil <= at) throw new ContributionError("past_retention");
  const nonce = randomToken();
  const [, result] = await env.DB.batch([
    // ?1 scope, ?2 period, ?3 state, ?4 now, ?5.. the fence
    env.DB.prepare(
      `UPDATE ${T}obligations SET revision = revision + 1, facts_revision = revision + 1,
         acknowledged_at = NULL, officer_contact_at = NULL, final_notice_at = NULL, final_acknowledged_at = NULL, final_officer_contact_at = NULL, updated_at = ?4
       WHERE guild_scope = ?1 AND period_start = ?2 AND ${LIVE_WEEK(`${T}obligations`)}${fenceAt(input.fence, 5, 6, 7)}
         AND NOT EXISTS (SELECT 1 FROM ${T}evidence e WHERE e.guild_scope = ?1 AND e.period_start = ?2 AND e.state = ?3 AND e.retain_until > ${DB_NOW})`,
    ).bind(input.guildScope, input.periodStart, input.state, at, ...fenceBinds(input.fence)),
    // ?1 scope, ?2 period, ?3 state, ?4 now, ?5 retain, ?6 nonce, ?7.. the fence
    env.DB.prepare(
      `INSERT INTO ${T}evidence (guild_scope, period_start, state, attested_at, retain_until, nonce)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ?5 > ${DB_NOW}${fenceAt(input.fence, 7, 8, 9)}
       ON CONFLICT(guild_scope, period_start) DO UPDATE SET state = excluded.state, attested_at = excluded.attested_at, nonce = excluded.nonce`,
    ).bind(input.guildScope, input.periodStart, input.state, at, retainUntil, nonce, ...fenceBinds(input.fence)),
    env.DB.prepare(
      `UPDATE ${T}members SET revision = revision + 1, updated_at = ?3
       WHERE EXISTS (SELECT 1 FROM ${T}obligations o WHERE o.guild_scope = ${T}members.guild_scope AND o.discord_id = ${T}members.discord_id AND o.guild_scope = ?1 AND o.period_start = ?2)
         AND EXISTS (SELECT 1 FROM ${T}evidence WHERE guild_scope = ?1 AND period_start = ?2 AND nonce = ?4)`,
    ).bind(input.guildScope, input.periodStart, at, nonce),
  ]);
  if ((result!.meta.changes ?? 0) === 0) {
    if (input.fence) await requireFence(env, input.fence); // the fence's own reason first (session_expired, standing_lost)
    throw new ContributionError("past_retention"); // .88: otherwise the attestation would be born at or past its deadline by the database clock
  }
}

/** Why the fence refuses now, if it does, judged by the database clock and facts in SQL (.80): the session ended (session_expired), or the actor lost standing (denied, left the server: standing_lost). */
export async function fenceRefusal(env: Env, fence: SessionFence): Promise<"session_expired" | "standing_lost" | null> {
  const row = await env.DB.prepare(`SELECT (${fenceSql("authenticatedIdentity", 1, 2, 3)}) AS session_ok, (${fenceSql("applicantWrite", 1, 2, 3)}) AS standing_ok`).bind(fence.discordId, fence.sessionVersion, fence.expiresAt).first<{ session_ok: number; standing_ok: number }>();
  if (row?.session_ok !== 1) return "session_expired";
  if (row.standing_ok !== 1) return "standing_lost";
  return null;
}
async function requireFence(env: Env, fence: SessionFence): Promise<void> {
  const why = await fenceRefusal(env, fence);
  if (why) throw new ContributionError(why);
}

/** The member's current opaque revision token, or null when they have no ledger. */
export async function memberRevision(env: Env, guildScope: string, id: string, fence?: SessionFence): Promise<LedgerRevision | null> {
  const [rows] = await readAs(env, fence, [env.DB.prepare(`SELECT incarnation, revision FROM ${T}members WHERE guild_scope = ? AND discord_id = ?`).bind(guildScope, id)]);
  return revisionToken((rows!.results[0] as { incarnation: string; revision: number } | undefined) ?? undefined);
}
/** A week's evidence state: 'unavailable' until an officer attests it (and again once that attestation is past its deadline). */
export async function weekEvidence(env: Env, guildScope: string, start: number): Promise<EvidenceState> {
  const row = await env.DB.prepare(`SELECT state FROM ${T}evidence WHERE guild_scope = ? AND period_start = ? AND retain_until > ${DB_NOW}`).bind(guildScope, start).first<{ state: EvidenceState }>();
  return row?.state ?? "unavailable";
}
/** The evidence state of the week an obligation belongs to (unavailable when the obligation is not this member's or nothing was attested), one admitted read. */
export async function obligationEvidence(env: Env, guildScope: string, id: string, obligationId: number, fence?: SessionFence): Promise<EvidenceState> {
  const [rows] = await readAs(env, fence, [
    env.DB.prepare(`SELECT e.state FROM ${T}obligations o JOIN ${T}evidence e ON e.guild_scope = o.guild_scope AND e.period_start = o.period_start AND e.retain_until > ${DB_NOW} WHERE o.id = ? AND o.guild_scope = ? AND o.discord_id = ? AND ${LIVE_WEEK("o")}`).bind(obligationId, guildScope, id),
  ]);
  return ((rows!.results[0] as { state: EvidenceState } | undefined)?.state ?? "unavailable");
}

export const LEDGER_VIEW_LIMIT = 1000;
type ViewObligationRow = ObligationRow & { policy_amount: number; paid: number };
type ViewReceiptRow = { id: string; source: string; source_id: string; payer_name: string | null; observer_discord_id: string | null; amount_copper: number; retired_copper: number; allocated: number; expired: number; observed_at: number; status: string; voided_at: number | null };
type StoredObligationRow = Omit<ViewObligationRow, "paid"> & { paid: unknown; paid_magnitude: unknown };
type StoredReceiptRow = Omit<ViewReceiptRow, "amount_copper" | "retired_copper" | "allocated"> & { amount_copper: unknown; retired_copper: unknown; allocated: unknown; allocated_magnitude: unknown };

/** The statements of one member's display view (the member's row, their weeks with paid sums, their matched receipts, the scope's attestations, the magnitude guard). */
export const ledgerViewStatements = (env: Env, guildScope: string, id: string): D1PreparedStatement[] => [
  env.DB.prepare(`SELECT incarnation, revision FROM ${T}members WHERE guild_scope = ? AND discord_id = ?`).bind(guildScope, id),
  env.DB.prepare(
    `SELECT * FROM (${OBLIGATION_SELECT.replace("SELECT o.id,", `SELECT ${gatedSumSql(weekJournal("o.id"))} AS paid, ${magnitudeSql(weekJournal("o.id"))} AS paid_magnitude, o.id,`)}
     WHERE o.guild_scope = ?1 AND o.discord_id = ?2 AND ${LIVE_WEEK("o")}) ORDER BY period_start DESC LIMIT ?3`,
  ).bind(guildScope, id, LEDGER_VIEW_LIMIT + 1),
  env.DB.prepare(
    `SELECT r.id, r.source, r.source_id, r.payer_name, r.observer_discord_id, r.amount_copper, r.retired_copper, r.observed_at, r.status, r.voided_at, (r.retain_until <= ${DB_NOW}) AS expired,
       ${gatedSumSql(receiptJournal("r.id"))} AS allocated, ${magnitudeSql(receiptJournal("r.id"))} AS allocated_magnitude
     FROM ${T}receipts r WHERE r.guild_scope = ?1 AND r.matched_discord_id = ?2 ORDER BY r.observed_at DESC, r.id LIMIT ?3`,
  ).bind(guildScope, id, LEDGER_VIEW_LIMIT + 1),
  env.DB.prepare(`SELECT period_start, state FROM ${T}evidence WHERE guild_scope = ? AND retain_until > ${DB_NOW}`).bind(guildScope),
  ledgerGuard(env, guildScope, id),
];
/** One consistent read of a member's ledger for display: obligations newest first with paid sums, stage and the acknowledgement they call for; matched receipts newest first; bounded. Behind the acting session's admission when a fence is given. */
export async function ledgerView(env: Env, guildScope: string, id: string, at = now(), fence?: SessionFence) {
  return ledgerViewFrom(await readAs(env, fence, ledgerViewStatements(env, guildScope, id)), at);
}
/** The display view shaped from the statements' results (ledgerViewStatements), read in the caller's batch. */
export function ledgerViewFrom([member, obligations, receipts, evidence, guard]: D1Result[], at: number) {
  checkLedger(guard);
  const weekState = new Map((evidence!.results as { period_start: number; state: EvidenceState }[]).map((e) => [e.period_start, e.state]));
  const oRows = obligations!.results as StoredObligationRow[];
  const rRows = receipts!.results as StoredReceiptRow[];
  const truncated = { obligations: oRows.length > LEDGER_VIEW_LIMIT, receipts: rRows.length > LEDGER_VIEW_LIMIT };
  const shownReceipts = rRows.slice(0, LEDGER_VIEW_LIMIT).flatMap((stored) => {
    const r: ViewReceiptRow = { ...stored, amount_copper: storedCopper(stored.amount_copper), retired_copper: storedCopper(stored.retired_copper), allocated: exactSum(stored.allocated, stored.allocated_magnitude) };
    if (r.expired) {
      // .78: past its deadline a receipt is shown only while it still pays a live week, and then only as the allocated/retired
      // relationship that week needs: no original amount, no credit figure, no source id, payer or observer (the purge scrubs them later)
      if (r.allocated <= 0) return [];
      const spent = plus(r.allocated, r.retired_copper);
      return [{ row: { ...r, source_id: null as unknown as string, payer_name: null, observer_discord_id: null, amount_copper: spent }, allocatedCopper: r.allocated, retiredCopper: r.retired_copper, unallocatedCopper: 0 }];
    }
    const open = plus(plus(r.amount_copper, -r.retired_copper), -r.allocated);
    // a voided receipt is never spendable
    return [{ row: r, allocatedCopper: r.allocated, retiredCopper: r.retired_copper, unallocatedCopper: r.voided_at === null ? open : 0 }];
  });
  const unallocatedCopper = shownReceipts.reduce((s, r) => plus(s, r.unallocatedCopper), 0);
  return {
    revision: revisionToken(member!.results[0] as { incarnation: string; revision: number } | undefined),
    complete: !truncated.obligations && !truncated.receipts,
    truncated,
    obligations: oRows.slice(0, LEDGER_VIEW_LIMIT).map((stored) => {
      const pure = obligationFromRow(stored);
      const o: ViewObligationRow = { ...stored, amount_copper: pure.amountCopper, paid: exactSum(stored.paid, stored.paid_magnitude) };
      const evidenceState = weekState.get(o.period_start) ?? "unavailable";
      const result = evaluate(pure, evaluationInputs(o, o.paid, evidenceState, at));
      const canAcknowledge =
        CONTACT_STAGES.acknowledged.includes(result.stage) && o.acknowledged_at === null && o.facts_revision === o.revision
          ? ("acknowledged" as const)
          : result.stage === "final_notice" && o.final_notice_at !== null && o.final_acknowledged_at === null && o.facts_revision === o.revision
            ? ("final_acknowledged" as const)
            : null;
      return { row: o, evidence: evidenceState, stage: result.stage, nextReviewAt: result.nextReviewAt, canAcknowledge };
    }),
    receipts: shownReceipts,
    unallocatedCopper,
  };
}

/**
 * The removal step: records that an officer resolved the week after an in-game removal, in one admitted batch, only
 * while the week is in officer_review under the current evidence. It may LINK an existing restriction case about the
 * member (opened through the restrictions module, .69); it never opens one, never touches a role (the keeper's rule:
 * a restriction from a ledger decision is a separately reviewed manual action). The week's `removal_case_id` makes a
 * retry a replay of this exact removal.
 */
export async function recordRemoval(env: Env, input: { guildScope: string; discordId: string; obligationId: number; expectedRevision: LedgerRevision; caseId: string | null; staffId: string; fence: SessionFence }, at = now()): Promise<"recorded" | "replay" | "stale" | "not_in_officer_review" | "case_conflict" | "facts_changed"> {
  requireWritable(env);
  parseRevision(input.expectedRevision);
  const { guildScope, discordId: id } = input;
  const [weekRows, linkedRows] = await readAs(env, input.fence, [
    env.DB.prepare(`SELECT state, removal_case_id FROM ${T}obligations WHERE id = ?1 AND guild_scope = ?2 AND discord_id = ?3`).bind(input.obligationId, guildScope, id),
    // an existing restriction case about this member (community-restrictions.ts, .69), within its lifetime; never opened here
    env.DB.prepare(`SELECT c.incarnation FROM community_restriction_cases c WHERE c.id = ?1 AND c.discord_id = ?2 AND (c.retain_until IS NULL OR c.retain_until > ${DB_NOW})`).bind(input.caseId ?? "", id),
  ]);
  const week = weekRows!.results[0] as { state: string; removal_case_id: string | null } | undefined;
  if (!week) throw new ContributionError("not_found");
  if (week.state === "resolved" && week.removal_case_id !== null) return week.removal_case_id === (input.caseId ?? "") ? "replay" : "case_conflict";
  const linked = linkedRows!.results[0] as { incarnation: string } | undefined; // .88: the exact case USED by this decision, by its random incarnation
  if (input.caseId !== null && !linked) return "case_conflict";
  const pre = await precheck(env, guildScope, id, input.obligationId, input.fence);
  if (pre.revision === null || !pre.obligation) throw new ContributionError("not_found");
  if (pre.revision !== input.expectedRevision) return "stale";
  const evidence = await obligationEvidence(env, guildScope, id, input.obligationId, input.fence);
  const { stage } = evaluate(obligationFromRow(pre.obligation), evaluationInputs(pre.obligation, pre.paid, evidence, at));
  if (stage !== "officer_review") return "not_in_officer_review";
  const nonce = randomToken();
  const deadline = journalDeadline(env, at);
  // .78: the facts the decision relied on, re-stated at the write: the week live and still open, the evidence state used, and (when linked) the case live about this
  // member; .88: the SAME case as read (its incarnation, ?8): a case replaced under the same id since the evaluation is facts_changed
  const caseSql = input.caseId === null ? "?8 = ''" : `EXISTS (SELECT 1 FROM community_restriction_cases c WHERE c.id = ?6 AND c.discord_id = ?2 AND c.incarnation = ?8 AND (c.retain_until IS NULL OR c.retain_until > ${DB_NOW}))`;
  const results = await env.DB.batch([
    casMember(env, guildScope, id, input.expectedRevision, nonce, at, input.fence, deadline),
    env.DB.prepare(
      `UPDATE ${T}obligations SET state = 'resolved', removal_case_id = ?6, revision = revision + 1, facts_revision = revision + 1, updated_at = ?5
       WHERE id = ?4 AND guild_scope = ?1 AND discord_id = ?2 AND state = 'open' AND ${LIVE_WEEK(`${T}obligations`)} AND ${caseSql}
         AND EXISTS (SELECT 1 FROM ${T}evidence e WHERE e.guild_scope = ?1 AND e.period_start = ${T}obligations.period_start AND e.state = ?7 AND e.retain_until > ${DB_NOW}) AND ${ADMITTED}`,
    ).bind(guildScope, id, nonce, input.obligationId, at, input.caseId ?? "", evidence, linked?.incarnation ?? ""),
    decision(env, guildScope, id, nonce, input.obligationId, "removal_recorded", `staff:${input.staffId}`, nextRevision(input.expectedRevision), at, deadline, `EXISTS (SELECT 1 FROM ${T}obligations o2 WHERE o2.id = ?4 AND o2.state = 'resolved' AND o2.removal_case_id IS NOT NULL AND o2.updated_at = ?8)`),
    birthProbe(env, deadline),
  ]);
  if ((results[0]!.meta.changes ?? 0) === 0) return staleOrRefused(results[results.length - 1]);
  return (results[1]!.meta.changes ?? 0) > 0 ? "recorded" : "facts_changed"; // the week, its attestation or the linked case changed between the evaluation and the write
}

/**
 * Retention purge (one batch, bounded per run, whatever the configuration says now): members whose ledger changes get a
 * new revision first; the scope's admission horizons advance past every expired week and observation; expired weeks
 * retire their allocated copper into each receipt (a purge never frees credit) and go with their allocation rows; an
 * expired receipt still paying a retained week is scrubbed to what the week needs; expired receipts nothing refers to
 * go; expired decisions and evidence go; member rows with nothing left go. A week whose receipts' amounts or journals
 * are past the safe bound is kept rather than purged with its credit freed (its member's ledger is refused on every read
 * until repaired).
 */
export function contributionCleanupStatements(env: Env, at: number, limit = 100): D1PreparedStatement[] {
  const retirable = `NOT EXISTS (SELECT 1 FROM ${T}receipts pr
      WHERE pr.id IN (SELECT pe.receipt_id FROM ${T}allocation_events pe WHERE pe.obligation_id = po.id)
        AND (${magnitudeOf("pr.amount_copper")} > ${SAFE_REAL} OR ${magnitudeSql(receiptJournal("pr.id"))} > ${SAFE_REAL}))`;
  const oldObligations = `SELECT po.id FROM ${T}obligations po WHERE po.retain_until <= ?1 AND ${retirable} ORDER BY po.retain_until, po.id LIMIT ?2`;
  const oldReceiptsScrub = `SELECT ps.id FROM ${T}receipts ps WHERE ps.retain_until <= ?1 AND ps.payload_hash <> 'expired' ORDER BY ps.retain_until, ps.id LIMIT ?2`;
  const oldReceiptsDelete = `SELECT pd.id FROM ${T}receipts pd WHERE pd.retain_until <= ?1 AND NOT EXISTS (SELECT 1 FROM ${T}allocation_events pe WHERE pe.receipt_id = pd.id) ORDER BY pd.retain_until, pd.id LIMIT ?2`;
  return [
    // .80: only the members whose rows THIS bounded run touches (the same LIMIT sets as the statements below), never every member with an expired row
    env.DB.prepare(
      `UPDATE ${T}members SET revision = revision + 1
       WHERE EXISTS (SELECT 1 FROM ${T}obligations o WHERE o.guild_scope = ${T}members.guild_scope AND o.discord_id = ${T}members.discord_id AND o.id IN (${oldObligations}))
          OR EXISTS (SELECT 1 FROM ${T}receipts r WHERE r.guild_scope = ${T}members.guild_scope AND r.matched_discord_id = ${T}members.discord_id
                       AND (r.id IN (SELECT e.receipt_id FROM ${T}allocation_events e WHERE e.obligation_id IN (${oldObligations})) OR r.id IN (${oldReceiptsScrub}) OR r.id IN (${oldReceiptsDelete})))`,
    ).bind(at, limit),
    env.DB.prepare(`INSERT INTO ${T}horizons (guild_scope, kind, horizon) SELECT guild_scope, 'obligation', MAX(period_start) FROM ${T}obligations WHERE retain_until <= ?1 GROUP BY guild_scope ON CONFLICT(guild_scope, kind) DO UPDATE SET horizon = MAX(horizon, excluded.horizon)`).bind(at),
    env.DB.prepare(`INSERT INTO ${T}horizons (guild_scope, kind, horizon) SELECT guild_scope, 'receipt:' || source, MAX(observed_at) FROM ${T}receipts WHERE retain_until <= ?1 GROUP BY guild_scope, source ON CONFLICT(guild_scope, kind) DO UPDATE SET horizon = MAX(horizon, excluded.horizon)`).bind(at),
    env.DB.prepare(
      `UPDATE ${T}receipts SET retired_copper = retired_copper + (SELECT COALESCE(SUM(e.amount_copper), 0) FROM ${T}allocation_events e WHERE e.receipt_id = ${T}receipts.id AND e.obligation_id IN (${oldObligations}))
       WHERE id IN (SELECT receipt_id FROM ${T}allocation_events WHERE obligation_id IN (${oldObligations}))`,
    ).bind(at, limit),
    env.DB.prepare(`DELETE FROM ${T}allocation_events WHERE obligation_id IN (${oldObligations})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM ${T}obligations WHERE id IN (${oldObligations})`).bind(at, limit),
    env.DB.prepare(`UPDATE ${T}receipts SET payer_name = NULL, observer_discord_id = NULL, source_id = 'expired:' || id, payload_hash = 'expired' WHERE id IN (${oldReceiptsScrub})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM ${T}receipts WHERE id IN (${oldReceiptsDelete})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM ${T}decisions WHERE id IN (SELECT id FROM ${T}decisions WHERE retain_until <= ?1 ORDER BY retain_until LIMIT ?2)`).bind(at, limit),
    env.DB.prepare(`DELETE FROM ${T}evidence WHERE rowid IN (SELECT rowid FROM ${T}evidence WHERE retain_until <= ?1 ORDER BY retain_until LIMIT ?2)`).bind(at, limit),
    env.DB.prepare(
      `DELETE FROM ${T}members WHERE rowid IN (SELECT m.rowid FROM ${T}members m
         WHERE NOT EXISTS (SELECT 1 FROM ${T}obligations o WHERE o.guild_scope = m.guild_scope AND o.discord_id = m.discord_id)
           AND NOT EXISTS (SELECT 1 FROM ${T}receipts r WHERE r.guild_scope = m.guild_scope AND r.matched_discord_id = m.discord_id)
           AND NOT EXISTS (SELECT 1 FROM ${T}decisions d WHERE d.guild_scope = m.guild_scope AND d.discord_id = m.discord_id) LIMIT ?1)`,
    ).bind(limit),
  ];
}
/** Cron step, whatever the flag or the mode says: the purge batch; returns the rows it removed or scrubbed. */
export async function sweepCommunityContributions(env: Env, at = now(), limit = 100): Promise<number> {
  const results = await env.DB.batch(contributionCleanupStatements(env, at, limit));
  return results.slice(3).reduce((n, r) => n + (r?.meta?.changes ?? 0), 0);
}

/** Account deletion (all scopes): the member's obligations, matched receipts, allocation rows touching either, decisions and member row; their id removed from others' records as observer and actor. */
export function contributionDeletionStatements(env: Env, id: string): D1PreparedStatement[] {
  const actors = "(?1, 'user:' || ?1, 'staff:' || ?1, 'member:' || ?1)";
  return [
    env.DB.prepare(`DELETE FROM ${T}allocation_events WHERE obligation_id IN (SELECT id FROM ${T}obligations WHERE discord_id = ?1) OR receipt_id IN (SELECT id FROM ${T}receipts WHERE matched_discord_id = ?1)`).bind(id),
    env.DB.prepare(`DELETE FROM ${T}decisions WHERE discord_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM ${T}obligations WHERE discord_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM ${T}receipts WHERE matched_discord_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM ${T}members WHERE discord_id = ?1`).bind(id),
    env.DB.prepare(`UPDATE ${T}receipts SET observer_discord_id = NULL WHERE observer_discord_id = ?1`).bind(id),
    env.DB.prepare(`UPDATE ${T}allocation_events SET actor = 'erased' WHERE actor IN ${actors}`).bind(id),
    env.DB.prepare(`UPDATE ${T}decisions SET actor = 'erased' WHERE actor IN ${actors}`).bind(id),
  ];
}

/** Own retained contribution decisions. This constructor executes nothing and grants no authority. */
export function ownContributionDecisionStatements(env: Env, id: string, position: { high: number; seen: number; ts: number; id: number } | null): D1PreparedStatement[] {
  const bounded = position ? 1 : 0, after = position && position.seen > 0 ? 1 : 0;
  const own = "(discord_id=?1 OR actor='member:'||?1 OR actor='staff:'||?1)", live = `retain_until>${DB_NOW}`;
  return [
    env.DB.prepare(`SELECT COALESCE(MAX(id),0) AS high_water, COUNT(*) AS total_count, COALESCE(SUM(CASE WHEN ?4=0 OR at>?5 OR (at=?5 AND id>?6) THEN 1 ELSE 0 END),0) AS remaining_count FROM ${T}decisions WHERE ${own} AND ${live} AND (?2=0 OR id<=?3)`).bind(id, bounded, position?.high ?? 0, after, position?.ts ?? 0, position?.id ?? 0),
    env.DB.prepare(`SELECT id,at,action,retain_until,(discord_id=?1) AS own_subject,(actor='member:'||?1 OR actor='staff:'||?1) AS own_actor FROM ${T}decisions WHERE ${own} AND ${live} AND id<=CASE WHEN ?2=1 THEN ?3 ELSE (SELECT COALESCE(MAX(id),0) FROM ${T}decisions WHERE ${own} AND ${live}) END AND (?4=0 OR at>?5 OR (at=?5 AND id>?6)) ORDER BY at,id LIMIT 1001`).bind(id, bounded, position?.high ?? 0, after, position?.ts ?? 0, position?.id ?? 0),
  ];
}

/** The member's own records for the account copy (a .74 plan, read in the copy's one admitted batch): weeks with paid sums and contact dates, matched receipts with allocated/retired/open amounts; never who observed or recorded, payer names, source ids or others' receipts. */
export function contributionExportPlan(env: Env, id: string): { statements: D1PreparedStatement[]; shape: (results: D1Result[]) => Record<string, unknown> } {
  return {
    statements: [
      env.DB.prepare(
        `SELECT o.id, o.guild_scope, o.period_start, o.due_at, o.policy_version, o.amount_copper, o.eligible, o.state,
           o.acknowledged_at, o.officer_contact_at, o.final_notice_at, o.final_acknowledged_at, o.final_officer_contact_at,
           ${gatedSumSql(weekJournal("o.id"))} AS paid, ${magnitudeSql(weekJournal("o.id"))} AS paid_magnitude
         FROM ${T}obligations o WHERE o.discord_id = ? AND ${LIVE_WEEK("o")} ORDER BY o.guild_scope, o.period_start`,
      ).bind(id),
      env.DB.prepare(
        `SELECT r.guild_scope, r.source, r.amount_copper, r.retired_copper, r.observed_at, r.status, r.voided_at, (r.retain_until <= ${DB_NOW}) AS expired,
           ${gatedSumSql(receiptJournal("r.id"))} AS allocated, ${magnitudeSql(receiptJournal("r.id"))} AS allocated_magnitude
         FROM ${T}receipts r WHERE r.matched_discord_id = ?1 ORDER BY r.guild_scope, r.observed_at`,
      ).bind(id),
    ],
    shape: ([obligations, receipts]) => shapeExport(obligations!, receipts!),
  };
}
function shapeExport(obligations: D1Result, receipts: D1Result): Record<string, unknown> {
  const iso = (s: unknown) => (typeof s === "number" ? new Date(s * 1000).toISOString() : null);
  try {
    return {
      obligations: (obligations!.results as Record<string, unknown>[]).map((o) => ({
        guildScope: o.guild_scope, periodStart: iso(o.period_start), dueAt: iso(o.due_at), policyVersion: o.policy_version, amountCopper: storedCopper(o.amount_copper), paidCopper: exactSum(o.paid, o.paid_magnitude),
        eligible: o.eligible === 1, state: o.state, acknowledgedAt: iso(o.acknowledged_at), officerContactAt: iso(o.officer_contact_at), finalNoticeAt: iso(o.final_notice_at), finalAcknowledgedAt: iso(o.final_acknowledged_at), finalOfficerContactAt: iso(o.final_officer_contact_at),
      })),
      receipts: (receipts!.results as Record<string, unknown>[]).flatMap((r) => {
        const amount = storedCopper(r.amount_copper), retired = storedCopper(r.retired_copper), allocated = exactSum(r.allocated, r.allocated_magnitude);
        if (r.expired === 1) {
          // .78: past its deadline, only while it still pays a live week, and only the allocated/retired relationship that week needs
          return allocated > 0 ? [{ guildScope: r.guild_scope, source: r.source, amountCopper: plus(allocated, retired), allocatedCopper: allocated, retiredCopper: retired, unallocatedCopper: 0, observedAt: iso(r.observed_at), status: r.status, voidedAt: iso(r.voided_at) }] : [];
        }
        const open = plus(plus(amount, -retired), -allocated);
        return [{ guildScope: r.guild_scope, source: r.source, amountCopper: amount, allocatedCopper: allocated, retiredCopper: retired, unallocatedCopper: r.voided_at === null ? open : 0, observedAt: iso(r.observed_at), status: r.status, voidedAt: iso(r.voided_at) }];
      }),
      note: "Who observed or recorded a payment, payer names as written in the source, source identifiers and unmatched evidence are not included.",
    };
  } catch (e) {
    if (e instanceof ContributionError && e.code === "contribution_overflow") return { error: "contribution_overflow", note: "An amount in this ledger is outside the range this software represents exactly; the officers must repair it before it can be copied." };
    throw e;
  }
}

/**
 * The member's mail reference: a lookup aid for the officer matching an in-game mail to an account (an HMAC of the scope
 * and the account under VERIFY_SECRET, label tithe-ref-v1, shown as TITHE-XXXX-XXXX without the letters I, L, O or the
 * digits 0, 1). It proves nothing by itself and is never payment proof: the officer still records the receipt.
 */
export async function mailReference(env: Env, guildScope: string, id: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.VERIFY_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`tithe-ref-v1|${guildScope}|${id}`)));
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[mac[i]! % alphabet.length];
  return `TITHE-${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * Cron, while the flag is on and the ledger writable: this week's obligation for every roster-confirmed account that has
 * signed in here (the keeper rule) and has none yet; eligible once the new-member exemption counted from the keeper's own
 * `member_since` has passed (firstEligiblePeriod), else recorded as exempt-by-age (eligible = 0); bounded per run. A
 * record only: nothing here notifies anyone or changes a role.
 *
 * .115 (Codex, 3 Oct 2026 13:26 UTC): the run shares one invocation's D1 statement limit with every other cron job, and
 * at 200 accounts and six statements each this opener alone could pass it (1,201). So a run opens at most
 * SCHEDULED_CAPS.obligationsPerRun weeks (30; `limit` can only lower it), in Discord id order among the accounts without
 * this week's row: a created row drops out of the scan, so the next run continues with the next accounts (a guild of
 * 1,000 is opened within about 17 hours of the week's start; nothing is due before the week ends). The policy is stored or
 * checked once per run, before the first account, instead of once per account (two statements an account fewer; the
 * policy rows never change). An id the loop would skip is left out by the scan itself (the same 17 to 20 digits as
 * DISCORD_ID), so it can never hold one of the run's slots.
 */
export async function openWeeklyObligations(env: Env, at = now(), limit: number = SCHEDULED_CAPS.obligationsPerRun): Promise<number> {
  if (!contributionsWritable(env)) return 0;
  const cap = Math.max(0, Math.min(SCHEDULED_CAPS.obligationsPerRun, Math.floor(limit)));
  if (!cap) return 0;
  const policy = DEFAULT_CONTRIBUTION_POLICY;
  const guildScope = contributionScope(env);
  const start = periodStart(at, policy);
  const rows = await env.DB.prepare(
    `SELECT c.discord_id, MIN(c.member_since) AS joined, u.first_login, u.session_version FROM characters c JOIN site_users u ON u.discord_id = c.discord_id
     WHERE c.status = 'member' AND typeof(c.member_since) = 'integer' AND c.member_since > 0
       AND length(c.discord_id) BETWEEN 17 AND 20 AND c.discord_id NOT GLOB '*[^0-9]*'
       AND NOT EXISTS (SELECT 1 FROM ${T}obligations o WHERE o.guild_scope = ?1 AND o.discord_id = c.discord_id AND o.period_start = ?2)
     GROUP BY c.discord_id ORDER BY c.discord_id LIMIT ?3`,
  ).bind(guildScope, start, cap).all<{ discord_id: string; joined: number; first_login: number; session_version: number }>();
  let policyOnce: Promise<void> | null = null;
  const ensureOnce = () => (policyOnce ??= ensurePolicy(env, policy, at));
  let n = 0;
  for (const r of rows.results) {
    if (!DISCORD_ID.test(r.discord_id)) continue; // kept as a second guard; the scan above already leaves these out
    try {
      // .78: the account's incarnation as read and a roster-confirmed character NOW are re-stated at the insert (the .76 departures pattern)
      const { created } = await openObligation(env, { guildScope, discordId: r.discord_id, periodStart: start, eligible: firstEligiblePeriod(r.joined, policy) <= start, policy, proof: { firstLogin: r.first_login, sessionVersion: r.session_version } }, at, ensureOnce);
      if (created) n++;
    } catch (e) {
      if (!(e instanceof ContributionError && e.code === "proof_changed")) throw e; // the account was erased/recreated or lost its roster proof since the scan: nothing recorded
    }
  }
  return n;
}

registerCommunityData("contributions", (env, id) => contributionDeletionStatements(env, id), (env, id) => contributionExportPlan(env, id));
