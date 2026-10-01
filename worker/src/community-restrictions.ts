/**
 * .69 (1 Oct 2026): restriction cases, their watch-list and the return review, consolidation batch 4b (first half) of
 * Codex's adapter map, ported from Olympus Forever's src/restrictions.ts and src/return-review.ts (frozen candidate
 * manifest 296db2c8…) onto the keeper's door, on the contract Codex set at 02:41 UTC:
 *
 *  - These are STAFF RECORDS and REVIEW EVIDENCE only. Nothing here sanctions anyone, recognizes a person, or grants,
 *    holds or revokes a Discord role, admission or site access (roles.ts stays the one role writer; the bot's
 *    `/olympus-admin ban` stays the one manual moderation action). A case says what staff decided and when; the return
 *    review says that the SAME Discord account signed in here after a case was set, and that ANOTHER account holds, in
 *    the keeper's own `characters` table, a character a case's watch-list names. The donor's role jobs, eligibility
 *    effects, holds and tithe coupling are not ported.
 *  - A case is about a Discord id (a staff record may precede or outlive the member's sign-in). Categories: ban (no
 *    expiry; a review date), conduct_removal and tithe_removal (an expiry at most 730 days ahead; a review at most 365
 *    days ahead). Appeals: none → requested → upheld (→ requested again) or overturned (resolves the case). A review
 *    continues (new review date) or lifts (resolves). An officer may record that a RETURN was reviewed (acknowledge):
 *    the exact return, named by the member's account as created and its last sign-in, both after the case was set; it
 *    records the review, nothing else. A resolved case is kept 30 days.
 *  - The watch-list: the case member's own characters, copied from the keeper's `characters` only by an explicit staff
 *    action (add_characters), with EXACT keeper provenance (the proof key `name_key`, the full name, and the GUID as
 *    pinned at the addition). A key or GUID another account holds in `characters` is shown to staff in the return review
 *    as `watched_character` evidence with its provenance (`by: "guid"` or `"name"`); it never recognizes a person and
 *    never denies anything. Review at most 90 days after the addition or the last documented renewal.
 *  - Retention period (PRIV-4, the keeper's form): the 12 months are ONE period per MEMBER (`community_restriction_periods`),
 *    opened by the member's first addition on any of their cases and renewed only by `renew_characters` with a fixed
 *    reason code. Every row expires at the period's deadline, capped at its own case's expiry; removing a key, adding
 *    it again, opening a sibling case, replaying a request or erasing the account never restarts the clock; once the
 *    period has ended, additions are refused (`renewal_required`) until a documented renewal. The period lives while
 *    any unresolved case of the member exists and goes with the last one (a lift, an overturn, or the purge), so a case
 *    opened later, with no other case in play, opens a fresh period (the agreed "later case" rule). This gives the
 *    donor's sibling-lifetime rules without its per-case hand-over machinery; stated here for Codex's acceptance.
 *  - Erasure and minimization (.73, Codex's selected contract of 1 Oct 04:04 UTC; .69's header promised only the
 *    inactive watch rows and the 03:46 log entry overstated it, both corrected here): a member's erasure deletes their
 *    INACTIVE cases (resolved, overturned or past their expiry) with their watch-list rows and clears their
 *    acknowledgement (it belonged to the account that returned); an ACTIVE case with its rows survives (the one
 *    case-bound exception, like the keeper's ban reason), and the member's period only while an unresolved case
 *    remains; the privacy text must say so. A staff member's erasure anonymizes them as setter ('erased', the column is
 *    NOT NULL), reviewer, acknowledger, resolver, adder and renewer. The account copy lists the member's live cases
 *    (dates and outcomes, no staff), their live watch-list rows (names and dates) and the period. The purge
 *    (`sweepCommunityRestrictions`) is physical cleanup, bounded, and runs whatever the flag says.
 *  - Every write is the staff member's fenced batch (fenceSql applicantWrite, the opaque `incarnation.revision` token
 *    compared inside the statement, a per-write nonce admitting the rest); every read runs behind `admittedRead`;
 *    `communityStaff` is required by community-routes.ts; the staff writes share the current-page contract.
 * Seconds in D1; ISO-8601 at the boundary. Behind `restrictions` in COMMUNITY_FEATURES (off).
 *
 * .73 (Codex's preliminary .69 findings and selected contract, 1 Oct 04:04 UTC): (1) `retain_until` is the EFFECTIVE
 * availability cutoff by the database clock (a finite case: its expiry while unresolved; resolved: 30 days after; a ban:
 * none until resolved): a past-deadline case is gone from every staff, member, account-copy, replay and conflict read
 * and takes no change (`LIVE_CASE` inside every read and every first statement), so no lift or overturn can restart a
 * 30-day clock after the deadline; (2) every payload is read under the reader's admission: the list reads the cases and
 * their rows in one admitted batch, the pre-action read, every conflict payload, a replay and the fallback after a
 * refusal are admitted reads, and the case a write changed is read inside the write's own batch (its nonce, the same
 * transaction as the fence); (3) add_characters binds the exact keeper facts at its first statement (every pinned
 * owner, proof key, full name and GUID still bound in `characters`, through json_each over the pinned set) and pins the
 * member's period as still open by the database clock, so a binding that changed or a period that ended between the
 * read and the write admits nothing; whether a period is open is judged by the database clock in every view;
 * (4) the staff list continues by keyset cursor beyond its page, so every reviewable case is reachable; (5) the
 * orphan-period cleanup honors the run's limit.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, type SiteUser } from "./site-core";
import { admitted, admittedRead, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { secondsToIso, isoToSeconds } from "./community-time";
import { validateName } from "./community-names";
import { cursorParts, encodeCursor } from "./community-directory";

export const RESTRICTION_CATEGORIES = ["ban", "conduct_removal", "tithe_removal"] as const;
type Category = (typeof RESTRICTION_CATEGORIES)[number];
export const RESTRICTION_LIMITS = { maxReviewDays: 365, maxExpiryDays: 730, resolvedRetentionDays: 30, listLimit: 200, watchReviewDays: 90, watchPeriodDays: 365, maxWatchPerCase: 25, returnReviewLimit: 500 } as const;
export const RENEWAL_REASONS = ["ongoing_risk", "appeal_pending", "repeat_return"] as const;
type RenewalReason = (typeof RENEWAL_REASONS)[number];
const DAY = 86400;
const ID = /^[A-Za-z0-9_-]{22}$/;
const DISCORD_ID = /^\d{17,20}$/;
const TOKEN = /^([A-Za-z0-9_-]{22})\.(\d{1,9})$/;
const RETURN_TOKEN = /^(\d{1,12})\.(\d{1,12})$/;
export const ERASED_STAFF = "erased";
const DISPLAY = "COALESCE(u.nick, u.global_name, u.username)";
/** The keeper statuses under which a character is still bound to its account. */
const BOUND = "('verified', 'queued', 'member', 'left_pending', 'left')";
const ACTIVE = (a: string) => `(${a}.resolved_at IS NULL AND ${a}.appeal_status <> 'overturned' AND (${a}.category = 'ban' OR ${a}.expires_at > ${DB_NOW}))`;
const UNRESOLVED = (a: string) => `(${a}.resolved_at IS NULL AND ${a}.appeal_status <> 'overturned')`;
/** .73: the row is still within its lifetime by the database clock (a ban's lifetime ends only through its resolution). */
const LIVE_CASE = (a: string) => `(${a}.retain_until IS NULL OR ${a}.retain_until > ${DB_NOW})`;

type CaseRow = { id: string; discord_id: string; category: Category; set_by: string; set_at: number; review_at: number; expires_at: number | null; appeal_status: "none" | "requested" | "upheld" | "overturned"; review_outcome: "continued" | "lifted" | null; reviewed_at: number | null; acknowledged_at: number | null; resolved_at: number | null; incarnation: string; revision: number; retain_until: number | null; active: number; display_name: string | null; member_first_login: number | null; member_last_login: number | null; period_until: number | null; period_open: number | null };
const CASE_SELECT = `SELECT c.id, c.discord_id, c.category, c.set_by, c.set_at, c.review_at, c.expires_at, c.appeal_status, c.review_outcome, c.reviewed_at, c.acknowledged_at, c.resolved_at, c.incarnation, c.revision, c.retain_until,
    ${ACTIVE("c")} AS active, ${DISPLAY} AS display_name, u.first_login AS member_first_login, u.last_login AS member_last_login,
    (SELECT p.retain_until FROM community_restriction_periods p WHERE p.discord_id = c.discord_id) AS period_until,
    (SELECT p.retain_until > ${DB_NOW} FROM community_restriction_periods p WHERE p.discord_id = c.discord_id) AS period_open
  FROM community_restriction_cases c LEFT JOIN site_users u ON u.discord_id = c.discord_id`;
type WatchRow = { case_id: string; character_key: string; character_name: string; proof_key: string; guid: string | null; added_at: number; review_at: number; expires_at: number; renewed_at: number | null; renewal_reason: RenewalReason | null; revision: number };
const WATCH_COLUMNS = "case_id, character_key, character_name, proof_key, guid, added_at, review_at, expires_at, renewed_at, renewal_reason, revision";
const iso = (s: number | null) => (s === null ? null : secondsToIso(s));

const watchView = (w: WatchRow) => ({ key: w.character_key, name: w.character_name, proof: { nameKey: w.proof_key, guidPinned: w.guid !== null }, addedAt: secondsToIso(w.added_at), reviewAt: secondsToIso(w.review_at), expiresAt: secondsToIso(w.expires_at), renewedAt: iso(w.renewed_at), renewalReason: w.renewal_reason, revision: w.revision });
const returned = (r: CaseRow) => r.member_first_login !== null && r.member_last_login !== null && r.member_last_login > r.set_at;
function caseView(r: CaseRow, at: number, characters: WatchRow[]) {
  const active = r.active === 1;
  const periodOpen = r.period_open === 1; // .73: by the database clock, read with the case
  return {
    caseId: r.id, discordId: r.discord_id, displayName: r.display_name, category: r.category,
    setBy: r.set_by === ERASED_STAFF ? null : r.set_by, setAt: secondsToIso(r.set_at), reviewAt: secondsToIso(r.review_at), expiresAt: iso(r.expires_at),
    appealStatus: r.appeal_status, reviewOutcome: r.review_outcome, reviewedAt: iso(r.reviewed_at), acknowledgedAt: iso(r.acknowledged_at), resolvedAt: iso(r.resolved_at),
    revision: `${r.incarnation}.${r.revision}`,
    // the same Discord account signed in here after the case was set: the return an officer may record as reviewed. The
    // token names that exact account (as created) and sign-in, so a later sign-in or a recreated account needs a new review.
    returnedAt: returned(r) ? secondsToIso(r.member_last_login!) : null,
    returnToken: returned(r) ? `${r.member_first_login}.${r.member_last_login}` : null,
    active, reviewDue: active && r.review_at <= at,
    characters: active ? characters.map(watchView) : [],
    charactersRetainUntil: active && periodOpen ? secondsToIso(r.period_until!) : null,
    charactersRenewalRequired: active && r.period_until !== null && !periodOpen,
  };
}

class Bad extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
const bad = (e: unknown): Response | null => (e instanceof Bad ? apiJson({ error: e.code }, e.status) : null);
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;
const safeInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
const needPage = (request: Request) => (request.headers.get("X-Olympus") !== PAGE_VERSION ? apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409) : null);
function timeOf(raw: unknown, code: string): number {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)) throw new Bad(code);
  try {
    return isoToSeconds(raw, "exact");
  } catch {
    throw new Bad(code);
  }
}
/** The bounds every case's dates must meet. */
function validateDates(category: Category, reviewAt: number, expiresAt: number | null, at: number): void {
  if (reviewAt <= at || reviewAt > at + RESTRICTION_LIMITS.maxReviewDays * DAY) throw new Bad("invalid_review_date");
  if (category === "ban") {
    if (expiresAt !== null) throw new Bad("invalid_expiry");
  } else if (expiresAt === null || expiresAt <= at || expiresAt > at + RESTRICTION_LIMITS.maxExpiryDays * DAY || reviewAt > expiresAt) throw new Bad("invalid_expiry");
}

/** The live watch rows of the cases a subquery names, in one statement (.73: the list's second statement, the same admitted batch). */
const watchRowsOf = (env: Env, caseIdsSql: string, binds: unknown[]) =>
  env.DB.prepare(`SELECT ${WATCH_COLUMNS} FROM community_restriction_characters WHERE case_id IN (${caseIdsSql}) AND expires_at > ${DB_NOW} ORDER BY case_id, character_name, character_key`).bind(...binds);
const groupWatch = (rows: WatchRow[]): Map<string, WatchRow[]> => {
  const out = new Map<string, WatchRow[]>();
  for (const w of rows) out.set(w.case_id, [...(out.get(w.case_id) ?? []), w]);
  return out;
};
type CaseRead = { row: CaseRow; chars: WatchRow[] };
const caseStmt = (env: Env, id: string) => env.DB.prepare(`${CASE_SELECT} WHERE c.id = ?1 AND ${LIVE_CASE("c")}`).bind(id);
/** .73: one live case and its live rows behind the reader's admission; null when none is live; FENCE_REFUSED when the reader lost standing. */
async function readCase(env: Env, ctx: CommunityContext, id: string): Promise<CaseRead | null | typeof FENCE_REFUSED> {
  const out = await admittedRead(env, ctx, "applicantWrite", [caseStmt(env, id), watchRowsOf(env, "SELECT ?1", [id])]);
  if (out === FENCE_REFUSED) return FENCE_REFUSED;
  const row = out[0]!.results[0] as CaseRow | undefined;
  return row ? { row, chars: out[1]!.results as WatchRow[] } : null;
}
/** .73: the case as this write left it, read as the write batch's last two statements (the row carrying the write's nonce, its live rows). */
const writtenCase = (env: Env, id: string, nonce: string): D1PreparedStatement[] => [
  env.DB.prepare(`${CASE_SELECT} WHERE c.id = ?1 AND c.nonce = ?2 AND ${LIVE_CASE("c")}`).bind(id, nonce),
  watchRowsOf(env, "SELECT a.id FROM community_restriction_cases a WHERE a.id = ?1 AND a.nonce = ?2", [id, nonce]),
];
const writtenFrom = (out: D1Result[]): CaseRead | null => {
  const row = out.at(-2)!.results[0] as CaseRow | undefined;
  return row ? { row, chars: out.at(-1)!.results as WatchRow[] } : null;
};
const viewOf = (read: CaseRead, at: number) => caseView(read.row, at, read.chars);
const conflict = (error: string, read: CaseRead | null, at: number, status = 409) => apiJson({ error, ...(read ? { case: viewOf(read, at) } : {}) }, status);

/**
 * GET /api/admin/community/restrictions[?discordId=][&cursor=] → {enabled, cases, nextCursor, truncated}: one member's live
 * cases (newest first) or every active case by review date; .73: the rows come in the same admitted batch (a subquery
 * repeats the page's selection) and a keyset cursor continues beyond the page, so every reviewable case is reachable.
 */
export async function listRestrictions(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  if (!ctx.features.has("restrictions")) return featureOff();
  const id = url.searchParams.get("discordId");
  if (id !== null && !DISCORD_ID.test(id)) return apiJson({ error: "invalid_request" }, 400);
  const parts = cursorParts(url.searchParams.get("cursor"));
  if (parts === "invalid") return apiJson({ error: "invalid_cursor" }, 400);
  let after: { t: number; id: string } | null = null;
  if (parts) {
    const [version, kind, scope, t, cid] = parts;
    if (parts.length !== 5 || version !== 1 || kind !== "restrictions" || scope !== (id ?? "") || !safeInt(t) || !text(cid) || !ID.test(cid)) return apiJson({ error: "invalid_cursor" }, 400);
    after = { t, id: cid };
  }
  const at = now();
  const limit = RESTRICTION_LIMITS.listLimit;
  // ?1 the scope (a member id, or '' for the active list), ?2 cursor on, ?3 cursor time, ?4 cursor id, ?5 page + 1
  const where = id
    ? `c.discord_id = ?1 AND ${LIVE_CASE("c")} AND (?2 = 0 OR c.set_at < ?3 OR (c.set_at = ?3 AND c.id > ?4))`
    : `?1 = '' AND ${ACTIVE("c")} AND ${LIVE_CASE("c")} AND (?2 = 0 OR c.review_at > ?3 OR (c.review_at = ?3 AND c.id > ?4))`;
  const order = id ? "c.set_at DESC, c.id" : "c.review_at, c.id";
  const binds = [id ?? "", after ? 1 : 0, after?.t ?? 0, after?.id ?? "", limit + 1];
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(`${CASE_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ?5`).bind(...binds),
    watchRowsOf(env, `SELECT c.id FROM community_restriction_cases c WHERE ${where} ORDER BY ${order} LIMIT ?5`, binds),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const all = out[0]!.results as CaseRow[];
  const page = all.slice(0, limit);
  const chars = groupWatch(out[1]!.results as WatchRow[]);
  const last = page.at(-1);
  const nextCursor = all.length > limit && last ? encodeCursor([1, "restrictions", id ?? "", id ? last.set_at : last.review_at, last.id]) : null;
  return apiJson({ enabled: true, cases: page.map((r) => caseView(r, at, chars.get(r.id) ?? [])), nextCursor, truncated: nextCursor !== null });
}

const auditIfAdmitted = (env: Env, caseId: string, nonce: string, at: number, actor: string, action: string, detail: object) =>
  env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, ?2, ?3, discord_id, ?4 FROM community_restriction_cases WHERE id = ?5 AND nonce = ?6").bind(at, actor, action, JSON.stringify(detail), caseId, nonce);
const CASE_ADMITTED = "EXISTS (SELECT 1 FROM community_restriction_cases a WHERE a.id = ?1 AND a.nonce = ?2)";
/** The period goes with the member's last unresolved case (the "later case" rule); run in a resolving batch after the case's own update. */
const dropPeriodIfLast = (env: Env, caseId: string, nonce: string, member: string) =>
  env.DB.prepare(`DELETE FROM community_restriction_periods WHERE discord_id = ?3 AND ${CASE_ADMITTED} AND NOT EXISTS (SELECT 1 FROM community_restriction_cases o WHERE o.discord_id = ?3 AND o.id <> ?1 AND ${UNRESOLVED("o")})`).bind(caseId, nonce, member);

/** POST /api/admin/community/restrictions {action, caseId, ...}: one explicit staff change, one fenced batch; every payload under the reader's admission (.73). */
export async function restrictionAction(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.features.has("restrictions")) return featureOff();
  const reload = needPage(request);
  if (reload) return reload;
  if (rateLimited(`rs:${admin.discord_id}`, 60, 60)) return apiJson({ error: "slow_down" }, 429);
  try {
    const { action, caseId } = body;
    if (!text(caseId) || !ID.test(caseId)) throw new Bad("invalid_request");
    const at = now();
    const me = admin.discord_id, actor = me;
    const session = { v: ctx.subject!.sessionVersion, e: ctx.subject!.expiresAt };
    if (action === "create") return await createCase(request, env, ctx, body, caseId, me, at, session);
    const tokenMatch = text(body.expectedRevision) ? TOKEN.exec(body.expectedRevision) : null;
    if (!tokenMatch) throw new Bad("invalid_request");
    const expected = { token: body.expectedRevision as string, incarnation: tokenMatch[1]!, revision: Number(tokenMatch[2]) };
    const current = await readCase(env, ctx, caseId); // .73: the pre-action state behind the reader's admission; a past-deadline case is not found
    if (current === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!current) return apiJson({ error: "case_not_found" }, 404);
    if (current.row.incarnation !== expected.incarnation) return conflict("stale", current, at);
    if (current.row.discord_id === me) return conflict("own_record", current, at);
    if (action === "add_characters" || action === "renew_characters" || action === "remove_character") return await watchListAction(request, env, ctx, body, current, expected, me, at, session);
    if (current.row.resolved_at !== null) return conflict("case_resolved", current, at);
    // ---- the case changes
    let set: string, where: string, binds: unknown[], auditAction: string, resolving = false;
    const outcome = body.outcome, appeal = body.appealStatus;
    if (action === "acknowledge") {
      const ret = text(body.returnToken) ? RETURN_TOKEN.exec(body.returnToken) : null;
      if (!ret) throw new Bad("invalid_request");
      set = "acknowledged_at = ?4, acknowledged_by = ?5";
      where = `category <> 'ban' AND acknowledged_at IS NULL AND EXISTS (SELECT 1 FROM site_users u WHERE u.discord_id = community_restriction_cases.discord_id AND u.first_login = ?10 AND u.last_login = ?11 AND u.last_login > community_restriction_cases.set_at)`;
      binds = [Number(ret[1]), Number(ret[2])];
      auditAction = "community.restriction_acknowledged";
    } else if (action === "review" && outcome === "continued") {
      const next = timeOf(body.nextReviewAt, "invalid_review_date");
      if (next <= at || next > at + RESTRICTION_LIMITS.maxReviewDays * DAY) throw new Bad("invalid_review_date");
      set = "review_outcome = 'continued', reviewed_at = ?4, reviewed_by = ?5, review_at = ?10";
      where = "(category = 'ban' OR expires_at >= ?10)";
      binds = [next];
      auditAction = "community.restriction_review_continued";
    } else if (action === "review" && outcome === "lifted") {
      set = `review_outcome = 'lifted', reviewed_at = ?4, reviewed_by = ?5, resolved_at = ?4, resolved_by = ?5, retain_until = ?4 + ${RESTRICTION_LIMITS.resolvedRetentionDays * DAY}`;
      where = "1";
      binds = [];
      auditAction = "community.restriction_lifted";
      resolving = true;
    } else if (action === "appeal" && appeal === "requested") {
      set = "appeal_status = 'requested'";
      where = "appeal_status IN ('none', 'upheld')";
      binds = [];
      auditAction = "community.restriction_appeal_requested";
    } else if (action === "appeal" && appeal === "upheld") {
      set = "appeal_status = 'upheld'";
      where = "appeal_status = 'requested'";
      binds = [];
      auditAction = "community.restriction_appeal_upheld";
    } else if (action === "appeal" && appeal === "overturned") {
      set = `appeal_status = 'overturned', resolved_at = ?4, resolved_by = ?5, retain_until = ?4 + ${RESTRICTION_LIMITS.resolvedRetentionDays * DAY}`;
      where = "appeal_status = 'requested'";
      binds = [];
      auditAction = "community.restriction_overturned";
      resolving = true;
    } else throw new Bad("invalid_request");
    const nonce = randomToken();
    // ?1 id, ?2 revision, ?3 nonce, ?4 now, ?5 me, ?6 incarnation, ?7 member, ?8 version, ?9 expiry (the fence), ?10.. the action's
    // .73: only an ACTIVE case within its lifetime by the database clock takes a change (no past-deadline mutation or revival)
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `UPDATE community_restriction_cases SET ${set}, revision = revision + 1, nonce = ?3, updated_at = ?4, updated_by = ?5
         WHERE id = ?1 AND incarnation = ?6 AND revision = ?2 AND discord_id = ?7 AND discord_id <> ?5 AND ${ACTIVE("community_restriction_cases")} AND ${LIVE_CASE("community_restriction_cases")} AND (${where}) AND ${fenceSql("applicantWrite", 5, 8, 9)}`,
      ).bind(caseId, expected.revision, nonce, at, me, expected.incarnation, current.row.discord_id, session.v, session.e, ...binds),
      auditIfAdmitted(env, caseId, nonce, at, actor, auditAction, { category: current.row.category }),
      ...(resolving
        ? [env.DB.prepare(`DELETE FROM community_restriction_characters WHERE case_id = ?1 AND ${CASE_ADMITTED}`).bind(caseId, nonce), dropPeriodIfLast(env, caseId, nonce, current.row.discord_id)]
        : []),
      ...writtenCase(env, caseId, nonce), // .73: the payload, in the write's own transaction
    ]);
    if (out !== FENCE_REFUSED) {
      const written = writtenFrom(out);
      return written ? apiJson({ ok: true, case: viewOf(written, at) }) : apiJson({ error: "case_not_found" }, 404);
    }
    const row = await readCase(env, ctx, caseId); // .73: the refusal explained from an admitted read
    if (row === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!row) return apiJson({ error: "case_not_found" }, 404);
    if (`${row.row.incarnation}.${row.row.revision}` !== expected.token) return conflict("stale", row, at);
    if (row.row.resolved_at !== null) return conflict("case_resolved", row, at);
    return conflict("not_applicable", row, at);
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** The staff page's suggested dates for a case opened from a departure review (.70); staff change them through the normal actions. */
export const RESTRICTION_DEFAULT_DAYS: Record<Category, { review: number; expiry: number | null }> = { conduct_removal: { review: 180, expiry: 365 }, tithe_removal: { review: 90, expiry: 180 }, ban: { review: 365, expiry: null } };
export const isRestrictionCategory = (v: unknown): v is Category => (RESTRICTION_CATEGORIES as readonly unknown[]).includes(v);

/**
 * The statements that record a case inside ANOTHER admitted batch (.70: a departure review's open_restriction): the case
 * row and its audit row, each only while `admittedSql` holds (the other batch's nonce, bound at `admittedBinds` after the
 * case's own ten parameters), so the case exists exactly when that batch's own first statement was admitted. Same row,
 * same audit action and the same date bounds as a direct create. A duplicate case id fails the whole batch.
 */
export function restrictionCaseStatements(env: Env, input: { caseId: string; discordId: string; staffId: string; category: Category; reviewAt: number; expiresAt: number | null }, admittedSql: (p1: number, p2: number) => string, admittedBinds: [string, string], at: number): D1PreparedStatement[] {
  if (!ID.test(input.caseId) || !DISCORD_ID.test(input.discordId) || input.discordId === input.staffId) throw new Bad("invalid_request");
  validateDates(input.category, input.reviewAt, input.expiresAt, at);
  return [
    env.DB.prepare(
      `INSERT INTO community_restriction_cases (id, discord_id, category, set_by, set_at, review_at, expires_at, retain_until, incarnation, revision, nonce, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, 1, ?9, ?5 WHERE ${admittedSql(10, 11)}`,
    ).bind(input.caseId, input.discordId, input.category, input.staffId, at, input.reviewAt, input.expiresAt, randomToken(), randomToken(), ...admittedBinds),
    env.DB.prepare(`INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, ?2, 'community.restriction_set', ?3, ?4 WHERE ${admittedSql(5, 6)}`).bind(at, input.staffId, input.discordId, JSON.stringify({ category: input.category, from: "departure_review" }), ...admittedBinds),
  ];
}

async function createCase(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>, caseId: string, me: string, at: number, session: { v: number; e: number }): Promise<Response> {
  for (const k of Object.keys(body)) if (!["action", "caseId", "discordId", "category", "reviewAt", "expiresAt"].includes(k)) throw new Bad("invalid_request");
  const { discordId, category } = body;
  if (!text(discordId) || !DISCORD_ID.test(discordId) || discordId === me) throw new Bad("invalid_request");
  if (!text(category) || !(RESTRICTION_CATEGORIES as readonly string[]).includes(category)) throw new Bad("invalid_request");
  const reviewAt = timeOf(body.reviewAt, "invalid_review_date");
  const expiresAt = body.expiresAt === null || body.expiresAt === undefined ? null : timeOf(body.expiresAt, "invalid_expiry");
  validateDates(category as Category, reviewAt, expiresAt, at);
  const nonce = randomToken(), incarnation = randomToken();
  // ?1 id, ?2 member, ?3 category, ?4 me, ?5 now, ?6 review, ?7 expiry (also retain_until), ?8 incarnation, ?9 nonce, ?10 version, ?11 cookie expiry
  const out = await admitted(env, ctx, [
    env.DB.prepare(
      `INSERT INTO community_restriction_cases (id, discord_id, category, set_by, set_at, review_at, expires_at, retain_until, incarnation, revision, nonce, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, 1, ?9, ?5 WHERE ${fenceSql("applicantWrite", 4, 10, 11)} ON CONFLICT DO NOTHING`,
    ).bind(caseId, discordId, category, me, at, reviewAt, expiresAt, incarnation, nonce, session.v, session.e),
    auditIfAdmitted(env, caseId, nonce, at, me, "community.restriction_set", { category }),
    ...writtenCase(env, caseId, nonce), // .73: the payload, in the write's own transaction
  ]);
  if (out !== FENCE_REFUSED) {
    const written = writtenFrom(out);
    return written ? apiJson({ ok: true, case: viewOf(written, at) }) : apiJson({ error: "case_not_found" }, 404);
  }
  // .73: a replay or a conflict, explained from ONE admitted read: the live case under that id, or any row under it
  const read = await admittedRead(env, ctx, "applicantWrite", [caseStmt(env, caseId), watchRowsOf(env, "SELECT ?1", [caseId]), env.DB.prepare("SELECT 1 AS hit FROM community_restriction_cases WHERE id = ?1").bind(caseId)]);
  if (read === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const row = read[0]!.results[0] as CaseRow | undefined;
  // a retry of the same creation answers the case as it is now; anything else under that id is refused
  if (row && row.discord_id === discordId && row.category === category && row.review_at === reviewAt && row.expires_at === expiresAt) return apiJson({ ok: true, replay: true, case: viewOf({ row, chars: read[1]!.results as WatchRow[] }, at) });
  if (read[2]!.results.length) return apiJson({ error: "case_conflict" }, 409); // another case, or one past its lifetime, holds that id
  return refusal(env, request, "applicantWrite");
}

/** The member's own characters as the keeper holds them, still bound: exact provenance for the watch-list. */
async function provenCharacters(env: Env, discordId: string): Promise<{ key: string; name: string; proofKey: string; guid: string | null }[]> {
  const rows = await env.DB.prepare(`SELECT name_key, name, guid FROM characters WHERE discord_id = ?1 AND status IN ${BOUND} ORDER BY name_key LIMIT ?2`).bind(discordId, RESTRICTION_LIMITS.maxWatchPerCase + 1).all<{ name_key: string; name: string; guid: string | null }>();
  return rows.results.flatMap((r) => {
    const v = validateName(r.name);
    return v.ok && v.proofKey === r.name_key ? [{ key: v.key, name: v.name, proofKey: r.name_key, guid: r.guid }] : []; // a name the site cannot show exactly is not evidence
  });
}

async function watchListAction(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>, current: CaseRead, expected: { token: string; incarnation: string; revision: number }, me: string, at: number, session: { v: number; e: number }): Promise<Response> {
  const action = body.action as "add_characters" | "renew_characters" | "remove_character";
  const allowed = ["action", "caseId", "expectedRevision", ...(action === "renew_characters" ? ["reason"] : action === "remove_character" ? ["key"] : [])];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw new Bad("invalid_request");
  if (action === "renew_characters" && !(RENEWAL_REASONS as readonly unknown[]).includes(body.reason)) throw new Bad("invalid_reason");
  if (action === "remove_character" && !text(body.key, 160)) throw new Bad("invalid_request");
  const c = current.row;
  if (`${c.incarnation}.${c.revision}` !== expected.token) return conflict("stale", current, at);
  if (c.resolved_at !== null) return conflict("case_resolved", current, at);
  if (c.active !== 1) return conflict("not_applicable", current, at);
  const live = current.chars; // .73: read in the same admitted batch as the case
  const period = c.period_until; // the MEMBER's period deadline, or null when none was ever opened (or it went with the last case)
  const periodOpen = c.period_open === 1; // .73: by the database clock
  const caseCap = c.expires_at ?? Number.MAX_SAFE_INTEGER;
  const nonce = randomToken();
  const member = c.discord_id;
  // ?1 id, ?2 revision, ?3 nonce, ?4 now, ?5 me, ?6 incarnation, ?7 member, ?8 version, ?9 expiry, ?10.. the action's pins
  const caseUpdate = (pin: string, binds: unknown[]) =>
    env.DB.prepare(
      `UPDATE community_restriction_cases SET revision = revision + 1, nonce = ?3, updated_at = ?4, updated_by = ?5
       WHERE id = ?1 AND incarnation = ?6 AND revision = ?2 AND discord_id = ?7 AND discord_id <> ?5 AND ${ACTIVE("community_restriction_cases")} AND ${LIVE_CASE("community_restriction_cases")} AND ${fenceSql("applicantWrite", 5, 8, 9)} ${pin}`,
    ).bind(c.id, expected.revision, nonce, at, me, expected.incarnation, member, session.v, session.e, ...binds);
  const PERIOD_NONE = "AND NOT EXISTS (SELECT 1 FROM community_restriction_periods p WHERE p.discord_id = ?7)";
  // .73: the period as read AND still open by the database clock: a period that ended meanwhile admits no addition
  const PERIOD_OPEN = `AND EXISTS (SELECT 1 FROM community_restriction_periods p WHERE p.discord_id = ?7 AND p.retain_until = ?10 AND p.retain_until > ${DB_NOW})`;
  const PERIOD_IS = `AND EXISTS (SELECT 1 FROM community_restriction_periods p WHERE p.discord_id = ?7 AND p.retain_until = ?10)`;
  // .73: every pinned character is still bound in the keeper's table to this member under this proof key, full name and GUID
  const FACTS = (p: number) =>
    `AND NOT EXISTS (SELECT 1 FROM json_each(?${p}) j WHERE NOT EXISTS (SELECT 1 FROM characters k WHERE k.discord_id = ?7 AND k.name_key = json_extract(j.value, '$.proofKey') AND k.name = json_extract(j.value, '$.name') AND k.guid IS json_extract(j.value, '$.guid') AND k.status IN ${BOUND}))`;
  let statements: D1PreparedStatement[], auditAction: string, detail: object;
  if (action === "add_characters") {
    if (period !== null && !periodOpen) return conflict("renewal_required", current, at); // an ended period: the documented renewal comes first
    const proven = await provenCharacters(env, member);
    const fresh = proven.filter((p) => !live.some((w) => w.character_key === p.key));
    if (fresh.length === 0) return conflict(proven.length ? "no_new_characters" : "no_proven_characters", current, at);
    if (live.length + fresh.length > RESTRICTION_LIMITS.maxWatchPerCase) return conflict("too_many_characters", current, at);
    const deadline = Math.min(periodOpen ? period! : at + RESTRICTION_LIMITS.watchPeriodDays * DAY, caseCap);
    const reviewAt = Math.min(at + RESTRICTION_LIMITS.watchReviewDays * DAY, deadline);
    const pinned = JSON.stringify(fresh);
    statements = [
      periodOpen ? caseUpdate(`${PERIOD_OPEN} ${FACTS(11)}`, [period, pinned]) : caseUpdate(`${PERIOD_NONE} ${FACTS(10)}`, [pinned]),
      // the member's first addition opens their period (12 months; never a fresh one while a period exists)
      ...(periodOpen ? [] : [env.DB.prepare(`INSERT INTO community_restriction_periods (discord_id, opened_at, retain_until, nonce) SELECT ?3, ?4, ?5, ?2 WHERE ${CASE_ADMITTED}`).bind(c.id, nonce, member, at, at + RESTRICTION_LIMITS.watchPeriodDays * DAY)]),
      // a row the purge has not reached yet (expired) is replaced as a new addition; a live row is never touched; the deadline lies ahead by the database clock
      env.DB.prepare(
        `INSERT INTO community_restriction_characters (case_id, character_key, character_name, proof_key, guid, added_at, added_by, review_at, expires_at, revision)
         SELECT ?1, json_extract(j.value, '$.key'), json_extract(j.value, '$.name'), json_extract(j.value, '$.proofKey'), json_extract(j.value, '$.guid'), ?4, ?5, ?6, ?7, 1 FROM json_each(?3) j WHERE ${CASE_ADMITTED} AND ?7 > ${DB_NOW}
         ON CONFLICT(case_id, character_key) DO UPDATE SET character_name = excluded.character_name, proof_key = excluded.proof_key, guid = excluded.guid, added_at = excluded.added_at, added_by = excluded.added_by,
           review_at = excluded.review_at, expires_at = excluded.expires_at, renewed_at = NULL, renewed_by = NULL, renewal_reason = NULL, revision = community_restriction_characters.revision + 1
         WHERE community_restriction_characters.expires_at <= ${DB_NOW}`,
      ).bind(c.id, nonce, pinned, at, me, reviewAt, deadline),
    ];
    auditAction = "community.restriction_watch_added";
    detail = { category: c.category, count: fresh.length };
  } else if (action === "renew_characters") {
    if (period === null) return conflict("no_period", current, at); // nothing to renew: the first addition opens the period
    const newEnd = at + RESTRICTION_LIMITS.watchPeriodDays * DAY;
    const rowEnd = Math.min(newEnd, caseCap);
    statements = [
      caseUpdate(PERIOD_IS, [period]),
      env.DB.prepare(`UPDATE community_restriction_periods SET retain_until = ?4, renewed_at = ?3, renewal_reason = ?5, nonce = ?2 WHERE discord_id = ?6 AND ${CASE_ADMITTED}`).bind(c.id, nonce, at, newEnd, body.reason, member),
      env.DB.prepare(
        `UPDATE community_restriction_characters SET renewed_at = ?3, renewed_by = ?4, renewal_reason = ?5, review_at = ?6, expires_at = ?7, revision = revision + 1
         WHERE case_id = ?1 AND expires_at > ${DB_NOW} AND ${CASE_ADMITTED}`,
      ).bind(c.id, nonce, at, me, body.reason, Math.min(at + RESTRICTION_LIMITS.watchReviewDays * DAY, rowEnd), rowEnd),
    ];
    auditAction = "community.restriction_watch_renewed";
    detail = { category: c.category, reason: body.reason };
  } else {
    if (!live.some((w) => w.character_key === body.key)) return conflict("character_not_found", current, at, 404);
    statements = [caseUpdate("", []), env.DB.prepare(`DELETE FROM community_restriction_characters WHERE case_id = ?1 AND ${CASE_ADMITTED} AND character_key = ?3`).bind(c.id, nonce, body.key)];
    auditAction = "community.restriction_watch_removed";
    detail = { category: c.category };
  }
  statements.push(auditIfAdmitted(env, c.id, nonce, at, me, auditAction, detail), ...writtenCase(env, c.id, nonce)); // .73: the payload, in the write's own transaction
  const out = await admitted(env, ctx, statements);
  if (out !== FENCE_REFUSED) {
    const written = writtenFrom(out);
    return written ? apiJson({ ok: true, case: viewOf(written, at) }) : apiJson({ error: "case_not_found" }, 404);
  }
  const row = await readCase(env, ctx, c.id); // .73: the refusal explained from an admitted read
  if (row === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  if (!row) return apiJson({ error: "case_not_found" }, 404);
  if (`${row.row.incarnation}.${row.row.revision}` !== expected.token) return conflict("stale", row, at);
  if (row.row.resolved_at !== null) return conflict("case_resolved", row, at);
  if (action === "add_characters") {
    if (row.row.period_until !== null && row.row.period_open !== 1) return conflict("renewal_required", row, at); // the period ended by the database clock
    return conflict("binding_changed", row, at); // the keeper's record of a pinned character changed (owner, name or GUID) between the read and the write: reload
  }
  return conflict("not_applicable", row, at);
}

type ReturnRow = { case_id: string; discord_id: string; display_name: string | null; category: Category; set_at: number; review_at: number; expires_at: number | null; appeal_status: string; last_login: number };
type WatchedRow = ReturnRow & { character_name: string; added_at: number; watch_expires_at: number; by_guid: number; case_member: string };

/**
 * GET /api/admin/community/return-review → read-only staff evidence: (1) the SAME Discord account signed in here after
 * an active case about it was set; (2) ANOTHER account holds, in the keeper's `characters`, a character an active case's
 * watch-list names (by the pinned GUID or by the proof key), and signed in after it was watch-listed. Nothing here
 * denies, holds or recognizes anyone; it is what an officer reviews. Bounded; `truncated`/`watchList` say when rows
 * were left out.
 */
export async function returnReview(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("restrictions")) return featureOff();
  const at = now();
  const lim = RESTRICTION_LIMITS.returnReviewLimit + 1;
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(
      `SELECT c.id AS case_id, c.discord_id, ${DISPLAY} AS display_name, c.category, c.set_at, c.review_at, c.expires_at, c.appeal_status, u.last_login
       FROM community_restriction_cases c JOIN site_users u ON u.discord_id = c.discord_id
       WHERE ${ACTIVE("c")} AND u.last_login > c.set_at ORDER BY c.discord_id, c.set_at, c.id LIMIT ?1`,
    ).bind(lim),
    env.DB.prepare(
      `SELECT w.case_id, k.discord_id, ${DISPLAY} AS display_name, c.category, w.added_at AS set_at, w.review_at, w.expires_at AS watch_expires_at, c.expires_at, c.appeal_status, u.last_login,
              w.character_name, w.added_at, (w.guid IS NOT NULL AND k.guid = w.guid) AS by_guid, c.discord_id AS case_member
       FROM community_restriction_characters w JOIN community_restriction_cases c ON c.id = w.case_id
       JOIN characters k ON (k.name_key = w.proof_key OR (w.guid IS NOT NULL AND k.guid = w.guid)) AND k.discord_id <> c.discord_id AND k.status IN ${BOUND}
       JOIN site_users u ON u.discord_id = k.discord_id
       WHERE w.expires_at > ${DB_NOW} AND ${ACTIVE("c")} AND u.last_login > w.added_at ORDER BY k.discord_id, w.added_at, w.case_id LIMIT ?1`,
    ).bind(lim),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const returns = out[0]!.results as ReturnRow[], watched = out[1]!.results as WatchedRow[];
  const truncated = returns.length >= lim, watchPartial = watched.length >= lim;
  const members = new Map<string, { discordId: string; displayName: string | null; lastLoginAt: string; reasons: object[] }>();
  const add = (r: ReturnRow, reason: object) => {
    const m = members.get(r.discord_id) ?? { discordId: r.discord_id, displayName: r.display_name, lastLoginAt: secondsToIso(r.last_login), reasons: [] };
    m.reasons.push(reason);
    members.set(r.discord_id, m);
  };
  for (const r of returns.slice(0, lim - 1)) add(r, { kind: "restriction", caseId: r.case_id, category: r.category, setAt: secondsToIso(r.set_at), reviewAt: secondsToIso(r.review_at), expiresAt: iso(r.expires_at), appealStatus: r.appeal_status, reviewDue: r.review_at <= at });
  for (const r of watched.slice(0, lim - 1)) add(r, { kind: "watched_character", caseId: r.case_id, category: r.category, characterName: r.character_name, by: r.by_guid === 1 ? "guid" : "name", watchedAt: secondsToIso(r.added_at), reviewAt: secondsToIso(r.review_at), expiresAt: secondsToIso(r.watch_expires_at), appealStatus: r.appeal_status, reviewDue: r.review_at <= at });
  return apiJson({
    generatedAt: secondsToIso(at),
    evidence: "same_discord_login_after_restriction",
    watchList: watchPartial ? "partial" : "complete",
    explanation: "Only dated evidence is shown: the same Discord account signed in here after each listed active case was set. A watched character is different evidence: another account signed in after a character on an active case's watch-list, which this bot holds bound to that account by its proof key or its pinned GUID. It is review evidence only, not proof of who someone is; nothing is denied, held or revoked by it." + (watchPartial ? " The watch-list evidence was too large to read completely; some rows are missing." : ""),
    members: [...members.values()],
    truncated,
  });
}

/** Cron step, whatever the flag says: expired or orphaned watch-list rows, cases past their deadline, periods without an unresolved case; bounded. */
export async function sweepCommunityRestrictions(env: Env, at = now(), limit = 100): Promise<{ rows: number; cases: number; periods: number }> {
  const due = "SELECT id FROM community_restriction_cases WHERE retain_until IS NOT NULL AND retain_until <= ?1 ORDER BY retain_until, id LIMIT ?2";
  const [rows, , cases, periods] = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM community_restriction_characters WHERE rowid IN (
         SELECT w.rowid FROM community_restriction_characters w LEFT JOIN community_restriction_cases c ON c.id = w.case_id
         WHERE w.expires_at <= ?1 OR c.id IS NULL OR NOT ${ACTIVE("c")} ORDER BY w.expires_at, w.case_id, w.character_key LIMIT ?2)`,
    ).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_restriction_characters WHERE case_id IN (${due})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_restriction_cases WHERE id IN (${due})`).bind(at, limit),
    // .73: bounded like the rest of the run
    env.DB.prepare(`DELETE FROM community_restriction_periods WHERE rowid IN (SELECT p.rowid FROM community_restriction_periods p WHERE NOT EXISTS (SELECT 1 FROM community_restriction_cases c WHERE c.discord_id = p.discord_id AND ${UNRESOLVED("c")}) LIMIT ?1)`).bind(limit),
  ]);
  const n = { rows: rows?.meta?.changes ?? 0, cases: cases?.meta?.changes ?? 0, periods: periods?.meta?.changes ?? 0 };
  if (n.rows || n.cases || n.periods) await audit(env, "cron", "community.restrictions_expired", undefined, n);
  return n;
}

registerCommunityData(
  "restrictions",
  (env, id) => [
    // the member (.73, Codex's selected contract): the acknowledgement belonged to the account that returned; INACTIVE cases go
    // with their rows; an ACTIVE case and its rows stay (the one case-bound exception); the period only while an unresolved case remains
    env.DB.prepare("UPDATE community_restriction_cases SET acknowledged_at = NULL, acknowledged_by = NULL WHERE discord_id = ?1").bind(id),
    env.DB.prepare(`DELETE FROM community_restriction_characters WHERE case_id IN (SELECT c.id FROM community_restriction_cases c WHERE c.discord_id = ?1 AND NOT ${ACTIVE("c")})`).bind(id),
    env.DB.prepare(`DELETE FROM community_restriction_cases WHERE discord_id = ?1 AND NOT ${ACTIVE("community_restriction_cases")}`).bind(id),
    env.DB.prepare(`DELETE FROM community_restriction_periods WHERE discord_id = ?1 AND NOT EXISTS (SELECT 1 FROM community_restriction_cases c WHERE c.discord_id = ?1 AND ${UNRESOLVED("c")})`).bind(id),
    // the staff member: anonymized everywhere they acted
    env.DB.prepare(`UPDATE community_restriction_cases SET set_by = CASE WHEN set_by = ?1 THEN '${ERASED_STAFF}' ELSE set_by END, reviewed_by = CASE WHEN reviewed_by = ?1 THEN NULL ELSE reviewed_by END, acknowledged_by = CASE WHEN acknowledged_by = ?1 THEN NULL ELSE acknowledged_by END, resolved_by = CASE WHEN resolved_by = ?1 THEN NULL ELSE resolved_by END, updated_by = CASE WHEN updated_by = ?1 THEN NULL ELSE updated_by END WHERE ?1 IN (set_by, reviewed_by, acknowledged_by, resolved_by, updated_by)`).bind(id),
    env.DB.prepare("UPDATE community_restriction_characters SET added_by = CASE WHEN added_by = ?1 THEN NULL ELSE added_by END, renewed_by = CASE WHEN renewed_by = ?1 THEN NULL ELSE renewed_by END WHERE ?1 IN (added_by, renewed_by)").bind(id),
  ],
  (env, id) => ({
    // .74: a plan, run in the copy's one admitted batch; .73: live rows only, by the database clock (the effective cutoff)
    statements: [
      env.DB.prepare(`SELECT category, set_at, review_at, expires_at, appeal_status, review_outcome, reviewed_at, acknowledged_at, resolved_at, ${ACTIVE("community_restriction_cases")} AS active FROM community_restriction_cases WHERE discord_id = ?1 AND ${LIVE_CASE("community_restriction_cases")} ORDER BY set_at, id`).bind(id),
      env.DB.prepare(`SELECT c.category, w.character_name, w.added_at, w.review_at, w.expires_at, w.renewed_at, w.renewal_reason FROM community_restriction_characters w JOIN community_restriction_cases c ON c.id = w.case_id WHERE c.discord_id = ?1 AND w.expires_at > ${DB_NOW} AND ${LIVE_CASE("c")} ORDER BY w.added_at, w.character_key`).bind(id),
      env.DB.prepare("SELECT opened_at, retain_until, renewed_at, renewal_reason FROM community_restriction_periods WHERE discord_id = ?1").bind(id),
    ],
    shape: ([cases, rows, period]) => {
      const p = (period!.results[0] ?? null) as { opened_at: number; retain_until: number; renewed_at: number | null; renewal_reason: string | null } | null;
      return {
        cases: (cases!.results as Record<string, number | string | null>[]).map((r) => ({ category: r.category, setAt: secondsToIso(r.set_at as number), reviewAt: secondsToIso(r.review_at as number), expiresAt: iso(r.expires_at as number | null), appealStatus: r.appeal_status, reviewOutcome: r.review_outcome, reviewedAt: iso(r.reviewed_at as number | null), acknowledgedAt: iso(r.acknowledged_at as number | null), resolvedAt: iso(r.resolved_at as number | null), active: r.active === 1 })),
        watchList: (rows!.results as Record<string, number | string | null>[]).map((r) => ({ category: r.category, characterName: r.character_name, addedAt: secondsToIso(r.added_at as number), reviewAt: secondsToIso(r.review_at as number), expiresAt: secondsToIso(r.expires_at as number), renewedAt: iso(r.renewed_at as number | null), renewalReason: r.renewal_reason })),
        watchListPeriod: p ? { openedAt: secondsToIso(p.opened_at), retainUntil: secondsToIso(p.retain_until), renewedAt: iso(p.renewed_at), renewalReason: p.renewal_reason } : null,
      };
    },
  }),
);
