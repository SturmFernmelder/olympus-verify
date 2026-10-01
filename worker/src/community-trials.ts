/**
 * .61 (1 Oct 2026): trial reviews, consolidation batch 4a of Codex's adapter map, ported from Olympus Forever's
 * src/trials.ts (frozen candidate manifest 296db2c8…) onto the .56 door.
 *
 * A trial is a staff record about a member: when it started, when its review is due, whether it was extended, and how it
 * concluded (passed, or ended with a fixed reason). It is descriptive: nothing here kicks anyone, grants or removes a
 * role, approves anything or feeds admission; a due date only puts the trial at the head of the staff list. There are no
 * notes; every audit row has a fixed action and at most a fixed reason code.
 *
 *  - GET /api/community/trial/me: the member's own trial (the open one, else the most recently concluded still kept),
 *    without sponsor, creator or reviewer. It needs a signed-in account in good standing (applicantWrite), not a
 *    roster-confirmed character: a trial comes before the guild.
 *  - GET /api/admin/community/trials, POST /api/admin/community/trials, POST /api/admin/community/trials/update:
 *    SITE_ADMINS (communityStaff), who need no character of their own. A staff member never opens, extends or concludes
 *    a trial about themselves (own_record). A sponsor is never the member.
 *
 * Keeper rule (a deliberate deviation from the donor): a trial is opened only for an account that has signed in here
 * (a site_users row). The donor let a trial wait for someone who had never signed in and guarded the insert against a
 * just-erased account with tombstones; the keeper keeps no tombstones for erased accounts, so the row itself is the
 * guard: the insert requires it in the statement, erasure deletes the member's trials in the same batch
 * (community-context.ts registry). Since .72 a write's answer is read inside the write's own transaction, so a trial
 * cannot vanish between a write and its read-back; the `account_deleted` / `not_found` answers on those paths remain as
 * defined fallbacks, never a 500.
 *
 * Writes follow the repaired fence: the staff member's own row, session version and cookie expiry are judged inside the
 * first statement (fenceSql applicantWrite), the trial's integer revision and random incarnation inside the update, and
 * a per-write nonce admits the audit row. Seconds in D1; ISO-8601 at the boundary.
 *
 * Lifetime (.66; Codex's review of .61, 1 Oct 02:50 UTC: `retain_until` is the EFFECTIVE cutoff, not a cron selection
 * time): a concluded trial is available for 30 days after it concluded, an open one for 30 days after its review was due
 * unless extended or concluded first. Past `retain_until`, judged by the database clock inside every statement, a row
 * is gone from the member's own view, the staff list, the account copy, the due count and every replay or conflict
 * payload; an extension or a conclusion is refused inside the first write (`trial_expired`); and an expired open trial
 * does not block a new one, because one-open-trial-per-member is judged inside the insert at database time (the .61
 * partial unique index is dropped). The bounded cron purge (`sweepCommunityTrials`) is physical cleanup only and
 * reports its remaining backlog; it runs whatever the flag says. The paired donor was cron-only too; this is an
 * improvement selected for the keeper, not a keeper-only regression.
 *
 * Reads (.66): the own view and the staff list run behind `admittedRead`, so the reader's live row, session version,
 * cookie expiry and standing are re-stated in the same batch as the payload; and every `/api/admin/community/*` route
 * requires `communityStaff` (community-routes.ts), so a denied or departed SITE_ADMIN reads nothing here.
 *
 * .72 (Codex's final trial reader review of .66, 1 Oct 03:55 UTC: 33 of 133 cases): EVERY payload a write route answers
 * is read under admission. The row a write changed is read inside the write's own batch (the last statement, the same
 * transaction and instant as the fence: the accepted atomic snapshot), so a committed write is acknowledged with what it
 * wrote and never undone; every other read a write route makes (the pre-write state, a replay, a lost compare-and-set,
 * the fallback that explains a refusal) runs behind `admittedRead`, so a staff member denied, departed, signed out,
 * erased or expired between the context read and that payload receives a refusal and no trial.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, readJson, type SiteUser } from "./site-core";
import { admitted, admittedRead, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { secondsToIso, isoToSeconds } from "./community-time";
import { cursorParts, encodeCursor } from "./community-directory";

export const TRIAL_LIMITS = { maxReviewDays: 90, pageSize: 100 } as const;
export const TRIAL_RETENTION_S = 30 * 86400;
export const TRIAL_STATUSES = ["active", "extended", "passed", "ended"] as const;
type TrialStatus = (typeof TRIAL_STATUSES)[number];
const ENDED_REASONS = ["withdrew", "inactive", "staff_decision"] as const;
type Reason = "review_passed" | (typeof ENDED_REASONS)[number];
const ID = /^[A-Za-z0-9_-]{22}$/;
const DISCORD_ID = /^\d{17,20}$/;
const DISPLAY = "COALESCE(u.nick, u.global_name, u.username)";

type TrialRow = { id: string; discord_id: string; sponsor_discord_id: string | null; started_at: number; review_due_at: number; status: TrialStatus; outcome_reason: Reason | null; concluded_at: number | null; created_by: string | null; op_hash: string | null; updated_at: number; incarnation: string; revision: number; display_name: string | null; live: number };
/** The row is still within its lifetime, by the database clock (.66). */
const LIVE = `t.retain_until > ${DB_NOW}`;
const SELECT = `SELECT t.id, t.discord_id, t.sponsor_discord_id, t.started_at, t.review_due_at, t.status, t.outcome_reason, t.concluded_at, t.created_by, t.op_hash, t.updated_at, t.incarnation, t.revision, ${DISPLAY} AS display_name, (${LIVE}) AS live
  FROM community_trials t LEFT JOIN site_users u ON u.discord_id = t.discord_id`;
const outcomeOf = (s: TrialStatus) => (s === "passed" || s === "ended" ? s : null);
const staffShape = (r: TrialRow) => ({ id: r.id, discordId: r.discord_id, displayName: r.display_name, status: r.status, sponsorDiscordId: r.sponsor_discord_id, startedAt: secondsToIso(r.started_at), reviewDueAt: secondsToIso(r.review_due_at), outcome: outcomeOf(r.status), reason: r.outcome_reason, updatedAt: secondsToIso(r.updated_at), revision: r.revision });
const ownShape = (r: TrialRow) => ({ status: r.status, startedAt: secondsToIso(r.started_at), reviewDueAt: secondsToIso(r.review_due_at), outcome: outcomeOf(r.status), reason: r.outcome_reason, updatedAt: secondsToIso(r.updated_at) });
const trialStmt = (env: Env, id: string) => env.DB.prepare(`${SELECT} WHERE t.id = ?1`).bind(id);
/** .72: one trial behind the reader's admission; FENCE_REFUSED when the reader lost standing since the context read. */
async function readTrial(env: Env, ctx: CommunityContext, id: string): Promise<TrialRow | null | typeof FENCE_REFUSED> {
  const out = await admittedRead(env, ctx, "applicantWrite", [trialStmt(env, id)]);
  return out === FENCE_REFUSED ? FENCE_REFUSED : ((out[0]!.results[0] as TrialRow | undefined) ?? null);
}
/** .72: the trial as this write left it, read as the write batch's last statement: the row carrying the write's nonce. */
const writtenTrial = (env: Env, id: string, nonce: string) => env.DB.prepare(`${SELECT} WHERE t.id = ?1 AND t.nonce = ?2`).bind(id, nonce);

class Bad extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
const bad = (e: unknown): Response | null => (e instanceof Bad ? apiJson({ error: e.code }, e.status) : null);
const safeInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;
const onlyKeys = (body: Record<string, unknown>, allowed: readonly string[]) => {
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw new Bad("invalid_request");
};
/** A review due date: ISO UTC, after `at`, at most 90 days ahead. */
function dueDate(raw: unknown, at: number): number {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)) throw new Bad("invalid_review_due_at");
  let s: number;
  try {
    s = isoToSeconds(raw, "exact");
  } catch {
    throw new Bad("invalid_review_due_at");
  }
  if (s <= at || s > at + TRIAL_LIMITS.maxReviewDays * 86400) throw new Bad("invalid_review_due_at");
  return s;
}
const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
const needPage = (request: Request) => (request.headers.get("X-Olympus") !== PAGE_VERSION ? apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409) : null);
const conflict = (error: string, row: TrialRow | null) => apiJson({ error, ...(row ? { trial: staffShape(row) } : {}) }, 409);

/** GET /api/community/trial/me → {trial | null}: the member's own live trial, if any; null is "none recorded", not a refusal. */
export async function trialMe(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("trials")) return featureOff();
  if (!ctx.capabilities.applicantWrite) return refusal(env, request, "applicantWrite");
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(`${SELECT} WHERE t.discord_id = ?1 AND ${LIVE} ORDER BY (t.status IN ('active', 'extended')) DESC, COALESCE(t.concluded_at, t.updated_at) DESC, t.id LIMIT 1`).bind(ctx.subject!.discordId),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const row = out[0]!.results[0] as TrialRow | undefined;
  return apiJson({ trial: row ? ownShape(row) : null });
}

/** GET /api/admin/community/trials[?status=][&cursor=] → {trials, nextCursor}: live trials, review-due first; open before concluded. */
export async function listTrials(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  try {
    const status = url.searchParams.get("status") ?? "";
    if (status !== "" && !(TRIAL_STATUSES as readonly string[]).includes(status)) throw new Bad("invalid_status");
    const parts = cursorParts(url.searchParams.get("cursor"));
    if (parts === "invalid") throw new Bad("invalid_cursor");
    let after: { closed: number; due: number; id: string } | null = null;
    if (parts) {
      const [version, kind, cStatus, closed, due, id] = parts;
      if (parts.length !== 6 || version !== 1 || kind !== "trials" || cStatus !== status || (closed !== 0 && closed !== 1) || !safeInt(due) || !text(id) || !ID.test(id)) throw new Bad("invalid_cursor");
      after = { closed, due, id };
    }
    const closed = "(t.status IN ('passed', 'ended'))";
    const out = await admittedRead(env, ctx, "applicantWrite", [
      env.DB.prepare(
        `${SELECT} WHERE ${LIVE} AND (?1 = '' OR t.status = ?1) AND (?2 = 0 OR ${closed} > ?3 OR (${closed} = ?3 AND (t.review_due_at > ?4 OR (t.review_due_at = ?4 AND t.id > ?5))))
         ORDER BY ${closed}, t.review_due_at, t.id LIMIT ?6`,
      ).bind(status, after ? 1 : 0, after?.closed ?? 0, after?.due ?? 0, after?.id ?? "", TRIAL_LIMITS.pageSize + 1),
    ]);
    if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    const all = out[0]!.results as TrialRow[];
    const page = all.slice(0, TRIAL_LIMITS.pageSize);
    const last = page.at(-1);
    return apiJson({ trials: page.map(staffShape), nextCursor: all.length > TRIAL_LIMITS.pageSize && last ? encodeCursor([1, "trials", status, outcomeOf(last.status) === null ? 0 : 1, last.review_due_at, last.id]) : null });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

async function opHash(discordId: string, due: number, sponsor: string | null): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["trial-create-v1", discordId, due, sponsor])));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const auditIfAdmitted = (env: Env, trialId: string, nonce: string, at: number, actor: string, action: string, detail: object | null) =>
  env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, ?2, ?3, discord_id, ?4 FROM community_trials WHERE id = ?5 AND nonce = ?6").bind(at, actor, action, detail === null ? null : JSON.stringify(detail), trialId, nonce);

/** POST /api/admin/community/trials {opId, discordId, reviewDueAt, sponsorDiscordId?} → {trial}; the id IS the opId. */
export async function createTrial(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.features.has("trials")) return featureOff();
  const reload = needPage(request);
  if (reload) return reload;
  if (rateLimited(`ct:${admin.discord_id}`, 30, 60)) return apiJson({ error: "slow_down" }, 429);
  try {
    onlyKeys(body, ["opId", "discordId", "reviewDueAt", "sponsorDiscordId"]);
    const { opId, discordId, sponsorDiscordId } = body;
    if (!text(opId) || !ID.test(opId)) throw new Bad("invalid_op_id");
    if (!text(discordId) || !DISCORD_ID.test(discordId) || discordId === admin.discord_id) throw new Bad("invalid_discord_id");
    const t = now();
    const due = dueDate(body.reviewDueAt, t);
    let sponsor: string | null = null;
    if (sponsorDiscordId !== undefined && sponsorDiscordId !== null) {
      if (!text(sponsorDiscordId) || !DISCORD_ID.test(sponsorDiscordId) || sponsorDiscordId === discordId) throw new Bad("invalid_sponsor_discord_id");
      sponsor = sponsorDiscordId;
    }
    const hash = await opHash(discordId, due, sponsor);
    const nonce = randomToken(), incarnation = randomToken();
    const me = admin.discord_id;
    // ?1 id, ?2 hash, ?3 member, ?4 sponsor, ?5 now, ?6 due, ?7 me, ?8 incarnation, ?9 nonce, ?10 retain, ?11 version, ?12 expiry
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `INSERT INTO community_trials (id, op_id, op_hash, discord_id, sponsor_discord_id, started_at, review_due_at, status, created_by, updated_by, created_at, updated_at, incarnation, revision, nonce, retain_until)
         SELECT ?1, ?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, NULL, ?5, ?5, ?8, 1, ?9, ?10
         WHERE EXISTS (SELECT 1 FROM site_users su WHERE su.discord_id = ?3)
           AND NOT EXISTS (SELECT 1 FROM community_trials o WHERE o.discord_id = ?3 AND o.status IN ('active', 'extended') AND o.retain_until > ${DB_NOW})
           AND ${fenceSql("applicantWrite", 7, 11, 12)}
         ON CONFLICT DO NOTHING`,
      ).bind(opId, hash, discordId, sponsor, t, due, me, incarnation, nonce, due + TRIAL_RETENTION_S, ctx.subject!.sessionVersion, ctx.subject!.expiresAt),
      auditIfAdmitted(env, opId, nonce, t, me, "community.trial_created", null),
      writtenTrial(env, opId, nonce), // .72: the payload, in the write's own transaction
    ]);
    if (out !== FENCE_REFUSED) {
      const row = out[2]!.results[0] as TrialRow | undefined;
      return row ? apiJson({ trial: staffShape(row) }) : conflict("account_deleted", null);
    }
    // .72: the refusal is explained from ONE admitted read: the operation's trial (a replay or a conflict), the member's
    // live open trial, the account's sign-in; a reader who lost standing meanwhile learns nothing of any of them
    const read = await admittedRead(env, ctx, "applicantWrite", [
      trialStmt(env, opId),
      env.DB.prepare(`SELECT 1 AS hit FROM community_trials t WHERE t.discord_id = ?1 AND t.status IN ('active', 'extended') AND ${LIVE}`).bind(discordId),
      env.DB.prepare("SELECT 1 AS hit FROM site_users WHERE discord_id = ?1").bind(discordId),
    ]);
    if (read === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    const existing = (read[0]!.results[0] as TrialRow | undefined) ?? null;
    if (existing && (existing.created_by !== me || existing.op_hash !== hash)) return apiJson({ error: "op_conflict" }, 409);
    if (existing && existing.live !== 1) return apiJson({ error: "conflict", message: "That operation's trial is past its lifetime. Reload the page, then try again." }, 409); // .66: no expired payload
    if (existing) return apiJson({ trial: staffShape(existing), replay: true });
    if (read[1]!.results.length) return conflict("trial_open_exists", null);
    if (!read[2]!.results.length) return apiJson({ error: "unknown_account", message: "That account has never signed in here; a trial is recorded once it has." }, 409);
    return refusal(env, request, "applicantWrite");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** POST /api/admin/community/trials/update {id, revision, action: 'extend'|'conclude', reviewDueAt?, outcome?, reason?} → {trial} */
export async function updateTrial(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.features.has("trials")) return featureOff();
  const reload = needPage(request);
  if (reload) return reload;
  try {
    onlyKeys(body, ["id", "revision", "action", "reviewDueAt", "outcome", "reason"]);
    const { id, revision, action, outcome, reason } = body;
    if (!text(id) || !ID.test(id)) throw new Bad("invalid_id");
    if (!safeInt(revision) || revision < 1) throw new Bad("invalid_revision");
    if (action !== "extend" && action !== "conclude") throw new Bad("invalid_action");
    const t = now();
    let due: number | null = null;
    let next: { status: TrialStatus; reason: Reason | null };
    if (action === "extend") {
      if (outcome !== undefined || reason !== undefined) throw new Bad("invalid_request");
      due = dueDate(body.reviewDueAt, t);
      next = { status: "extended", reason: null };
    } else {
      if (body.reviewDueAt !== undefined) throw new Bad("invalid_request");
      if (outcome !== "passed" && outcome !== "ended") throw new Bad("invalid_outcome");
      const allowed: readonly unknown[] = outcome === "passed" ? ["review_passed"] : ENDED_REASONS;
      if (!allowed.includes(reason)) throw new Bad("invalid_reason");
      next = { status: outcome, reason: reason as Reason };
    }
    const current = await readTrial(env, ctx, id); // .72: the pre-write state, behind the reader's admission
    if (current === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!current) return apiJson({ error: "not_found" }, 404);
    if (current.live !== 1) return apiJson({ error: "trial_expired", message: "This trial is past its lifetime and can no longer be extended or concluded." }, 409); // .66: no payload
    if (current.discord_id === admin.discord_id) return conflict("own_record", current);
    if (current.revision !== revision) return conflict("stale_revision", current);
    if (outcomeOf(current.status) !== null) return conflict("trial_concluded", current);
    if (due !== null && due <= current.review_due_at) throw new Bad("invalid_review_due_at");
    const me = admin.discord_id, nonce = randomToken();
    const auditAction = action === "extend" ? "community.trial_extended" : next.status === "passed" ? "community.trial_passed" : "community.trial_ended";
    // ?1 id, ?2 incarnation, ?3 revision, ?4 status, ?5 reason, ?6 due|NULL, ?7 now, ?8 nonce, ?9 me, ?10 version, ?11 expiry
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `UPDATE community_trials SET status = ?4, outcome_reason = ?5, review_due_at = COALESCE(?6, review_due_at), concluded_at = CASE WHEN ?6 IS NULL THEN ?7 ELSE NULL END,
           retain_until = COALESCE(?6, ?7) + ${TRIAL_RETENTION_S}, revision = revision + 1, nonce = ?8, updated_by = ?9, updated_at = ?7
         WHERE id = ?1 AND incarnation = ?2 AND revision = ?3 AND status IN ('active', 'extended') AND discord_id <> ?9 AND (?6 IS NULL OR ?6 > review_due_at)
           AND retain_until > ${DB_NOW} AND ${fenceSql("applicantWrite", 9, 10, 11)}`,
      ).bind(id, current.incarnation, revision, next.status, next.reason, due, t, nonce, me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt),
      auditIfAdmitted(env, id, nonce, t, me, auditAction, next.reason === null ? null : { reason: next.reason }),
      writtenTrial(env, id, nonce), // .72: the payload, in the write's own transaction
    ]);
    if (out !== FENCE_REFUSED) {
      const written = out[2]!.results[0] as TrialRow | undefined;
      return written ? apiJson({ trial: staffShape(written) }) : apiJson({ error: "not_found" }, 404);
    }
    const row = await readTrial(env, ctx, id); // .72: the refusal explained from an admitted read
    if (row === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!row) return apiJson({ error: "not_found" }, 404); // the member's erase landed in between: a defined answer, never a 500
    if (row.live !== 1) return apiJson({ error: "trial_expired", message: "This trial is past its lifetime and can no longer be extended or concluded." }, 409); // .66: the deadline passed during the request
    if (row.incarnation !== current.incarnation || row.revision !== revision) return conflict("stale_revision", row);
    if (outcomeOf(row.status) !== null) return conflict("trial_concluded", row);
    return refusal(env, request, "applicantWrite");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/**
 * Cron step: physical cleanup of trials past their lifetime (which already ended for every read and write at the
 * deadline, .66); bounded per run, with the backlog still waiting reported in the audit row. Runs whatever the flag says.
 */
export async function sweepCommunityTrials(env: Env, at = now(), limit = 100): Promise<{ deleted: number; remaining: number }> {
  const [r, left] = await env.DB.batch([
    env.DB.prepare("DELETE FROM community_trials WHERE id IN (SELECT id FROM community_trials WHERE retain_until <= ?1 ORDER BY retain_until, id LIMIT ?2)").bind(at, limit),
    env.DB.prepare("SELECT COUNT(*) AS n FROM community_trials WHERE retain_until <= ?1").bind(at),
  ]);
  const deleted = r?.meta?.changes ?? 0;
  const remaining = (left?.results[0] as { n: number } | undefined)?.n ?? 0;
  if (deleted || remaining) await audit(env, "cron", "community.trials_expired", undefined, { deleted, remaining });
  return { deleted, remaining };
}

/** Live open trials whose review is due: the head of the staff list, as a count for the admin overview. */
export async function trialsDueCount(env: Env, at = now()): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM community_trials t WHERE t.status IN ('active', 'extended') AND t.review_due_at <= ?1 AND ${LIVE}`).bind(at).first<{ n: number }>();
  return row?.n ?? 0;
}

registerCommunityData(
  "trials",
  (env, id) => [
    env.DB.prepare("DELETE FROM community_trials WHERE discord_id = ?1").bind(id),
    env.DB.prepare(
      `UPDATE community_trials SET sponsor_discord_id = CASE WHEN sponsor_discord_id = ?1 THEN NULL ELSE sponsor_discord_id END,
         created_by = CASE WHEN created_by = ?1 THEN NULL ELSE created_by END, updated_by = CASE WHEN updated_by = ?1 THEN NULL ELSE updated_by END
       WHERE ?1 IN (sponsor_discord_id, created_by, updated_by)`,
    ).bind(id),
  ],
  (env, id) => ({
    // .74: a plan, run in the copy's one admitted batch
    statements: [env.DB.prepare(`SELECT t.status, t.started_at, t.review_due_at, t.outcome_reason, t.concluded_at, t.updated_at, t.retain_until FROM community_trials t WHERE t.discord_id = ?1 AND ${LIVE} ORDER BY t.started_at, t.id`).bind(id)],
    shape: ([rows]) => ({
      trials: (rows!.results as { status: TrialStatus; started_at: number; review_due_at: number; outcome_reason: Reason | null; concluded_at: number | null; updated_at: number; retain_until: number }[]).map((r) => ({ status: r.status, startedAt: secondsToIso(r.started_at), reviewDueAt: secondsToIso(r.review_due_at), outcome: outcomeOf(r.status), reason: r.outcome_reason, concludedAt: r.concluded_at === null ? null : secondsToIso(r.concluded_at), updatedAt: secondsToIso(r.updated_at), retainUntil: secondsToIso(r.retain_until) })),
    }),
  }),
);
