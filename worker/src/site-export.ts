import './privacy-access-data';
/**
 * .71 (1 Oct 2026): the member's own copy, consolidation batch 7 of Codex's adapter map (the donor's src/rights.ts, made
 * the keeper's way). GET /api/me/export answers, to the signed-in account alone, selected retained records about it:
 * the site account, their application, votes, board votes, friends and reserved names; the bot's view (whether they are
 * banned from verifying, whether a Battle.net link is current, the characters bound to them, their code requests, and
 * the dated actions that name them); and every community feature's rows through the registry (community-context.ts
 * registerCommunityData), so a feature that stores a member's data without an exporter cannot exist.
 *
 * Minimization: the copy is about the member, never about others. Another member's Discord id never appears (a vote or
 * a friend shows the label the member chose, a board vote shows the role and the vote, not the candidate; a case or a
 * trial shows dates and outcomes, not the staff); the ban reason and the staff's review notes are the staff's words and
 * are not copied; codes are never stored, so none can be copied. Actions are the fixed action names with their time.
 *
 * The keeper's own statements AND every community section's statements (the registry's plans, .74) run in ONE batch
 * behind the reader boundary (`admittedRead`, capability authenticatedIdentity: the live row and the session alone, so a
 * denied or departed member can still read their copy): one transaction, one instant. A version invalidated, an erasure
 * or the database cookie deadline before that batch refuses the whole copy; after it nothing is queried again, so the
 * body is never a partial "everything" (Codex's review of .71, 1 Oct 04:24 UTC: the .71 exporters ran after the batch
 * on their own, and one read after the reader lost standing returned a case). Five copies an hour per account; each is
 * audited as `site.copy_exported` with no details while its original admission is still current.
 * A successful captured read is preserved if a later erasure closes that best-effort audit. The answer is a JSON attachment.
 *
 * .74, Codex's complementary review of .71 (1 Oct 04:36 UTC): the copy carries no STRUCTURAL reference to another Discord
 * account (a vote's nominee and a friend are the label the member chose, without the `kind` that said "a Discord
 * account"; the member's own free text may still mention people); it includes the member's own invite-queue state
 * (character, status, attempts, dates, the fixed refusal reason; never the officer, the watcher's claim or the note); the
 * dated actions are those naming the account as their subject OR their actor, the earliest 1000 from the point asked
 * for, with `actions.nextCursor` and `?actions=<cursor>` continuing them in bounded pages; and the `about` text says how
 * the copy was captured rather than promising more.
 *
 * .76 (Codex's complementary .71/.74 findings, 1 Oct 05:05 UTC): `generatedAt` is the database's own clock read INSIDE the
 * copy's batch (its first statement), so "read together at generatedAt" is literally the capture instant and not the
 * body's later preparation time; and the application's parsed answers carry their references as kind and label only in
 * the OWN copy (the structural account key is another member's id; appOut, the forms and the member's free text are
 * untouched everywhere else).
 *
 * .118 (7 Oct 2026, Codex): captured-history slice; the dated notes above describe previous cursor behaviour.
 * Initial GET still returns a curated partial JSON copy. Continuation tokens are accepted only through
 * the existing account POST form and internal argument, never in an address. Actions bind an admitted
 * high-water/count to the signed session claims; later/backdated inserts and new copy-audit entries
 * cannot enter that retained range. A script-free history view and JSON download share five reads/hour.
 * Non-action sections are fresh for each JSON download. Traversing retained actions is not an immutable
 * all-store snapshot, erasure, identity grant or proof that a browser saved the response.
 */
import type { Env } from "./env";
import './qr-phase1-data';
import { audit } from "./db";
import { bnetFresh } from "./bnet-retention";
import { apiJson, appOut, rateLimited, sign, verify, type AppRow, type SiteUser } from "./site-core";
import { admittedReadAs, communityContext, communityExportPlan, FENCE_REFUSED, type CommunitySubject } from "./community-context";
import { secondsToIso } from "./community-time";
import { ownEventChangeStatements } from "./community-events";
import { ownContributionDecisionStatements } from "./community-contributions";
import { privacySubjectKey } from './privacy-serving-authority';

const ACTIONS_LIMIT = 1000;
/** Integrity only: signed-session admission remains mandatory for every page. */
export const ACTION_CURSOR_LIMIT = 140;
const HISTORY_MAX = 999999999999;
const HISTORY_CURSOR = /^1\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.([A-Za-z0-9_-]{43})$/;
export const actionCursorShape = (raw: string): boolean => raw.length <= ACTION_CURSOR_LIMIT && HISTORY_CURSOR.test(raw);
const whole = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= HISTORY_MAX;
interface HistoryPosition { high: number; total: number; seen: number; ts: number; id: number; expires: number; captured: number; }
interface HistoryPlan { position: HistoryPosition | null; statements: D1PreparedStatement[]; }
export interface OwnActionHistoryPage {
  entries: { at: string; action: string }[]; truncated: boolean; currentCursor: string; nextCursor: string | null;
  capture: { kind: "retained_action_range"; at: string; count: number; delivered: number; remaining: number; complete: boolean };
}
export interface OwnActionHistoryView {
  generatedAt: string;
  coverage: { kind: "curated_partial"; ownAccountOnly: true; actionsPageLimit: number; completeErasure: false };
  actions: OwnActionHistoryPage;
}
const historyData = (payload: string, s: CommunitySubject) => JSON.stringify([payload, s.discordId, s.sessionVersion, s.expiresAt]);
const historyPayload = (p: HistoryPosition) => `1.${p.high}.${p.total}.${p.seen}.${p.ts}.${p.id}.${p.expires}.${p.captured}`;
async function historyToken(env: Env, s: CommunitySubject, p: HistoryPosition): Promise<string> {
  const payload = historyPayload(p);
  return `${payload}.${await sign(env.COOKIE_SECRET, "own-actions", historyData(payload, s))}`;
}
async function prepareHistory(env: Env, s: CommunitySubject, raw?: string): Promise<HistoryPlan | null> {
  let p: HistoryPosition | null = null;
  if (raw !== undefined) {
    if (raw.length > ACTION_CURSOR_LIMIT) return null;
    const parts = HISTORY_CURSOR.exec(raw); if (!parts) return null;
    const nums = parts.slice(1, 8).map(Number); if (!nums.every(whole)) return null;
    p = { high: nums[0]!, total: nums[1]!, seen: nums[2]!, ts: nums[3]!, id: nums[4]!, expires: nums[5]!, captured: nums[6]! };
    if (p.expires !== s.expiresAt || p.captured === 0 || p.captured >= p.expires || p.seen > p.total || p.id > p.high ||
        (p.total === 0) !== (p.high === 0) || (p.seen === 0 ? p.ts !== 0 || p.id !== 0 : p.id === 0 || p.seen >= p.total)) return null;
    const payload = historyPayload(p);
    if (!await verify(env.COOKIE_SECRET, "own-actions", historyData(payload, s), parts[8]!)) return null;
  }
  const bounded = p ? 1 : 0, after = p && p.seen > 0 ? 1 : 0;
  // These two statements run behind the original probe in the SAME batch. First-page SQL derives its own high-water.
  const meta = env.DB.prepare(
    "SELECT COALESCE(MAX(id),0) AS high_water, COUNT(*) AS total_count, COALESCE(SUM(CASE WHEN ?4=0 OR ts>?5 OR (ts=?5 AND id>?6) THEN 1 ELSE 0 END),0) AS remaining_count FROM audit WHERE (subject=?1 OR actor=?1) AND (?2=0 OR id<=?3)"
  ).bind(s.discordId, bounded, p?.high ?? 0, after, p?.ts ?? 0, p?.id ?? 0);
  const rows = env.DB.prepare(
    "SELECT ts,id,action FROM audit WHERE (subject=?1 OR actor=?1) AND id<=CASE WHEN ?2=1 THEN ?3 ELSE (SELECT COALESCE(MAX(id),0) FROM audit WHERE subject=?1 OR actor=?1) END AND (?4=0 OR ts>?5 OR (ts=?5 AND id>?6)) ORDER BY ts,id LIMIT ?7"
  ).bind(s.discordId, bounded, p?.high ?? 0, after, p?.ts ?? 0, p?.id ?? 0, ACTIONS_LIMIT + 1);
  return { position: p, statements: [meta, rows] };
}
type HistoryStart = { ok: true; id: string; subject: CommunitySubject; plan: HistoryPlan } | { ok: false; response: Response };
async function beginHistory(request: Request, env: Env, user: SiteUser, raw?: string): Promise<HistoryStart> {
  // Passed-user primitives are captured before awaiting; they never grant authority on their own.
  const callerId = user.discord_id, callerVersion = user.session_version;
  if (typeof callerId !== "string" || typeof callerVersion !== "number") return { ok: false, response: apiJson({ error: "signed_out" }, 401) };
  if (["actions", "eventChanges", "contributionDecisions", "collection"].some(key => new URL(request.url).searchParams.has(key))) return { ok: false, response: apiJson({ error: "invalid_cursor", message: "Use the account form to continue history; cursors are not accepted in addresses." }, 400) };
  const ctx = await communityContext(env, request), s = ctx.subject;
  if (!s || s.discordId !== callerId || s.sessionVersion !== callerVersion || !Number.isSafeInteger(s.sessionVersion) || s.sessionVersion < 0 || !whole(s.expiresAt))
    return { ok: false, response: apiJson({ error: "signed_out" }, 401) };
  const subject: CommunitySubject = Object.freeze({ discordId: String(s.discordId), sessionVersion: Number(s.sessionVersion), expiresAt: Number(s.expiresAt),privacyGeneration:s.privacyGeneration });
  const plan = await prepareHistory(env, subject, raw);
  if (!plan) return { ok: false, response: apiJson({ error: "invalid_cursor" }, 400) };
  if (rateLimited(`cx:${subject.discordId}`, 5, 3600))
    return { ok: false, response: apiJson({ error: "slow_down", message: "Five copy views or downloads an hour. Try again later." }, 429) };
  return { ok: true, id: subject.discordId, subject, plan };
}
async function finishHistory(env: Env, s: CommunitySubject, plan: HistoryPlan, at: number, metadata: D1Result, rows: D1Result): Promise<OwnActionHistoryPage | null> {
  const m = metadata.results[0] as { high_water?: unknown; total_count?: unknown; remaining_count?: unknown } | undefined;
  if (!m || !whole(m.high_water) || !whole(m.total_count) || !whole(m.remaining_count) || !whole(at) || at === 0 || at >= s.expiresAt) return null;
  const old = plan.position;
  if ((m.total_count === 0) !== (m.high_water === 0) || m.remaining_count > m.total_count ||
      (old && (m.high_water !== old.high || m.total_count !== old.total || m.remaining_count !== old.total - old.seen || at < old.captured))) return null;
  const initial: HistoryPosition = old ?? { high: m.high_water, total: m.total_count, seen: 0, ts: 0, id: 0, expires: s.expiresAt, captured: at };
  if (rows.results.length !== Math.min(ACTIONS_LIMIT + 1, m.remaining_count)) return null;
  const r = rows.results as { ts: number; id: number; action: string }[];
  let previous = initial.seen > 0 ? { ts: initial.ts, id: initial.id } : null;
  for (const row of r) {
    if (!whole(row.ts) || !whole(row.id) || row.id === 0 || row.id > initial.high || typeof row.action !== "string" ||
        (previous && (row.ts < previous.ts || (row.ts === previous.ts && row.id <= previous.id)))) return null;
    previous = row;
  }
  const page = r.slice(0, ACTIONS_LIMIT), delivered = initial.seen + page.length, remaining = initial.total - delivered;
  if (!whole(delivered) || remaining < 0 || (remaining > 0 && page.length !== ACTIONS_LIMIT)) return null;
  const last = page.at(-1);
  return {
    entries: page.map(row => ({ at: secondsToIso(row.ts), action: row.action })), truncated: remaining > 0,
    currentCursor: await historyToken(env, s, initial),
    nextCursor: remaining > 0 && last ? await historyToken(env, s, { ...initial, seen: delivered, ts: last.ts, id: last.id }) : null,
    capture: { kind: "retained_action_range", at: secondsToIso(initial.captured), count: initial.total, delivered, remaining, complete: remaining === 0 },
  };
}
const historyChanged = () => apiJson({ error: "history_changed", message: "The retained action range changed. Start a new capture; no completed history is claimed." }, 409);
async function historyRefusal(env: Env, request: Request): Promise<Response> {
  const fresh = await communityContext(env, request);
  return fresh.subject ? apiJson({ error: "conflict", message: "Your session changed while the copy was being made. Try again." }, 409) : apiJson({ error: "signed_out", message: "You are signed out. Sign in with Discord again." }, 401);
}
const iso = (s: number | null | undefined) => (typeof s === "number" ? secondsToIso(s) : null);

/** A separate collection and MAC domain; action continuations cannot select this dataset. */
export const EVENT_CHANGE_CURSOR_LIMIT = 140;
const EVENT_CHANGE_CURSOR = /^1\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.([A-Za-z0-9_-]{43})$/;
export const eventChangeCursorShape = (raw: string): boolean => raw.length <= EVENT_CHANGE_CURSOR_LIMIT && EVENT_CHANGE_CURSOR.test(raw);
export interface OwnEventChangePage {
  entries: { eventId: string; action: "created" | "updated" | "cancelled"; at: string; changedFieldNames: string[] }[];
  truncated: boolean; currentCursor: string; nextCursor: string | null;
  capture: { kind: "retained_event_change_range"; at: string; count: number; delivered: number; remaining: number; complete: boolean };
}
export interface OwnEventChangeHistoryView {
  generatedAt: string;
  coverage: { kind: "curated_partial"; ownAccountOnly: true; eventChangesPageLimit: number; completeErasure: false };
  eventChanges: OwnEventChangePage;
}
const eventChangeData = (payload: string, s: CommunitySubject) => JSON.stringify(["site-session", "event_changes", payload, s.discordId, s.sessionVersion, s.expiresAt]);
async function eventChangeToken(env: Env, s: CommunitySubject, p: HistoryPosition): Promise<string> {
  const payload = historyPayload(p);
  return `${payload}.${await sign(env.COOKIE_SECRET, "own-event-changes", eventChangeData(payload, s))}`;
}
async function prepareEventChanges(env: Env, s: CommunitySubject, raw?: string): Promise<HistoryPlan | null> {
  let p: HistoryPosition | null = null;
  if (raw !== undefined) {
    if (raw.length > EVENT_CHANGE_CURSOR_LIMIT) return null;
    const parts = EVENT_CHANGE_CURSOR.exec(raw); if (!parts) return null;
    const nums = parts.slice(1, 8).map(Number); if (!nums.every(whole)) return null;
    p = { high: nums[0]!, total: nums[1]!, seen: nums[2]!, ts: nums[3]!, id: nums[4]!, expires: nums[5]!, captured: nums[6]! };
    if (p.expires !== s.expiresAt || p.captured === 0 || p.captured >= p.expires || p.seen > p.total || p.id > p.high ||
        (p.total === 0) !== (p.high === 0) || (p.seen === 0 ? p.ts !== 0 || p.id !== 0 : p.id === 0 || p.seen >= p.total)) return null;
    const payload = historyPayload(p);
    if (!await verify(env.COOKIE_SECRET, "own-event-changes", eventChangeData(payload, s), parts[8]!)) return null;
  }
  return { position: p, statements: ownEventChangeStatements(env, s.discordId, p) };
}
async function beginEventChanges(request: Request, env: Env, user: SiteUser, raw?: string): Promise<HistoryStart> {
  const callerId = user.discord_id, callerVersion = user.session_version;
  if (typeof callerId !== "string" || typeof callerVersion !== "number") return { ok: false, response: apiJson({ error: "signed_out" }, 401) };
  if (["actions", "eventChanges", "contributionDecisions", "collection"].some(key => new URL(request.url).searchParams.has(key))) return { ok: false, response: apiJson({ error: "invalid_cursor", message: "Use the account form; continuations are not accepted in addresses." }, 400) };
  const ctx = await communityContext(env, request), s = ctx.subject;
  if (!s || s.discordId !== callerId || s.sessionVersion !== callerVersion || !Number.isSafeInteger(s.sessionVersion) || s.sessionVersion < 0 || !whole(s.expiresAt))
    return { ok: false, response: apiJson({ error: "signed_out" }, 401) };
  const subject: CommunitySubject = Object.freeze({ discordId: String(s.discordId), sessionVersion: Number(s.sessionVersion), expiresAt: Number(s.expiresAt),privacyGeneration:s.privacyGeneration });
  const plan = await prepareEventChanges(env, subject, raw);
  if (!plan) return { ok: false, response: apiJson({ error: "invalid_cursor" }, 400) };
  if (rateLimited(`cx:${subject.discordId}`, 5, 3600)) return { ok: false, response: apiJson({ error: "slow_down", message: "Five copy views or downloads an hour. Try again later." }, 429) };
  return { ok: true, id: subject.discordId, subject, plan };
}
const EVENT_CHANGE_FIELDS = new Set(["title", "details", "startsAt", "durationMin", "capacity", "roleTargets"]);
async function finishEventChanges(env: Env, s: CommunitySubject, plan: HistoryPlan, at: number, metadata: D1Result, rows: D1Result): Promise<OwnEventChangePage | null> {
  const m = metadata.results[0] as { high_water?: unknown; total_count?: unknown; remaining_count?: unknown } | undefined;
  if (!m || !whole(m.high_water) || !whole(m.total_count) || !whole(m.remaining_count) || !whole(at) || at === 0 || at >= s.expiresAt) return null;
  const old = plan.position;
  if ((m.total_count === 0) !== (m.high_water === 0) || m.remaining_count > m.total_count ||
      (old && (m.high_water !== old.high || m.total_count !== old.total || m.remaining_count !== old.total - old.seen || at < old.captured))) return null;
  const initial: HistoryPosition = old ?? { high: m.high_water, total: m.total_count, seen: 0, ts: 0, id: 0, expires: s.expiresAt, captured: at };
  if (rows.results.length !== Math.min(1001, m.remaining_count)) return null;
  const projected: OwnEventChangePage["entries"] = [];
  let previous = initial.seen > 0 ? { ts: initial.ts, id: initial.id } : null;
  let last: { ts: number; id: number } | null = null;
  for (const [index, raw] of rows.results.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (!whole(r.at) || !whole(r.id) || r.id === 0 || r.id > initial.high || typeof r.event_id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(r.event_id) ||
        (r.action !== "created" && r.action !== "updated" && r.action !== "cancelled") || typeof r.fields !== "string" || r.fields.length > 256 ||
        (previous && (r.at < previous.ts || (r.at === previous.ts && r.id <= previous.id)))) return null;
    let fields: unknown;
    try { fields = JSON.parse(r.fields); } catch { return null; }
    if (!Array.isArray(fields) || fields.length > 6 || fields.some(f => typeof f !== "string" || !EVENT_CHANGE_FIELDS.has(f)) || new Set(fields).size !== fields.length ||
        (r.action === "updated" ? fields.length === 0 : fields.length !== 0)) return null;
    previous = { ts: r.at, id: r.id };
    if (index < 1000) {
      last = previous;
      projected.push({ eventId: r.event_id, action: r.action, at: secondsToIso(r.at), changedFieldNames: fields as string[] });
    }
  }
  const delivered = initial.seen + projected.length, remaining = initial.total - delivered;
  if (!whole(delivered) || remaining < 0 || (remaining > 0 && projected.length !== 1000)) return null;
  return {
    entries: projected, truncated: remaining > 0, currentCursor: await eventChangeToken(env, s, initial),
    nextCursor: remaining > 0 && last ? await eventChangeToken(env, s, { ...initial, seen: delivered, ts: last.ts, id: last.id }) : null,
    capture: { kind: "retained_event_change_range", at: secondsToIso(initial.captured), count: initial.total, delivered, remaining, complete: remaining === 0 },
  };
}
const eventChangesChanged = () => apiJson({ error: "event_history_changed", message: "The retained event-change range changed. Start a new capture; no completed history is claimed." }, 409);
/** Internal own-session adapter only; no additional public route or authority. */
export async function exportMyEventChanges(request: Request, env: Env, user: SiteUser, cursor?: string): Promise<Response> {
  const start = await beginEventChanges(request, env, user, cursor);
  if (!start.ok) return start.response;
  const out = await admittedReadAs(env, start.subject, "authenticatedIdentity", [env.DB.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at"), ...start.plan.statements]);
  if (out === FENCE_REFUSED) return historyRefusal(env, request);
  const at = (out[0]!.results[0] as { at: number }).at;
  const eventChanges = await finishEventChanges(env, start.subject, start.plan, at, out[1]!, out[2]!);
  if (!eventChanges) return eventChangesChanged();
  const body: OwnEventChangeHistoryView = { generatedAt: secondsToIso(at), coverage: { kind: "curated_partial", ownAccountOnly: true, eventChangesPageLimit: 1000, completeErasure: false }, eventChanges };
  await audit(env, start.id, "site.copy_exported", start.id).catch(()=>{});
  return apiJson(body);
}
/** .120: separate retained contribution-decision collection, cursor purpose and minimal projection. */
export const CONTRIBUTION_DECISION_CURSOR_LIMIT = 140;
const CONTRIBUTION_DECISION_CURSOR = /^1\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.(0|[1-9]\d{0,11})\.([A-Za-z0-9_-]{43})$/;
export const contributionDecisionCursorShape = (raw: string): boolean => raw.length <= CONTRIBUTION_DECISION_CURSOR_LIMIT && CONTRIBUTION_DECISION_CURSOR.test(raw);
export interface OwnContributionDecisionPage {
  entries: { action: string; at: string; relation: "subject" | "actor" | "both" }[];
  truncated: boolean; currentCursor: string; nextCursor: string | null;
  capture: { kind: "retained_contribution_decision_range"; at: string; count: number; delivered: number; remaining: number; complete: boolean };
}
export interface OwnContributionDecisionHistoryView {
  generatedAt: string;
  coverage: { kind: "curated_partial"; ownAccountOnly: true; contributionDecisionsPageLimit: number; completeErasure: false };
  contributionDecisions: OwnContributionDecisionPage;
}
const contributionDecisionData = (payload: string, s: CommunitySubject) => JSON.stringify(["site-session", "contribution_decisions", payload, s.discordId, s.sessionVersion, s.expiresAt]);
async function contributionDecisionToken(env: Env, s: CommunitySubject, p: HistoryPosition): Promise<string> {
  const payload = historyPayload(p);
  return `${payload}.${await sign(env.COOKIE_SECRET, "own-contribution-decisions", contributionDecisionData(payload, s))}`;
}
async function prepareContributionDecisions(env: Env, s: CommunitySubject, raw?: string): Promise<HistoryPlan | null> {
  let p: HistoryPosition | null = null;
  if (raw !== undefined) {
    if (raw.length > CONTRIBUTION_DECISION_CURSOR_LIMIT) return null;
    const parts = CONTRIBUTION_DECISION_CURSOR.exec(raw); if (!parts) return null;
    const nums = parts.slice(1, 8).map(Number); if (!nums.every(whole)) return null;
    p = { high: nums[0]!, total: nums[1]!, seen: nums[2]!, ts: nums[3]!, id: nums[4]!, expires: nums[5]!, captured: nums[6]! };
    if (p.expires !== s.expiresAt || p.captured === 0 || p.captured >= p.expires || p.seen > p.total || p.id > p.high ||
        (p.total === 0) !== (p.high === 0) || (p.seen === 0 ? p.ts !== 0 || p.id !== 0 : p.id === 0 || p.seen >= p.total)) return null;
    const payload = historyPayload(p);
    if (!await verify(env.COOKIE_SECRET, "own-contribution-decisions", contributionDecisionData(payload, s), parts[8]!)) return null;
  }
  return { position: p, statements: ownContributionDecisionStatements(env, s.discordId, p) };
}
async function beginContributionDecisions(request: Request, env: Env, user: SiteUser, raw?: string): Promise<HistoryStart> {
  const callerId = user.discord_id, callerVersion = user.session_version;
  if (typeof callerId !== "string" || typeof callerVersion !== "number") return { ok: false, response: apiJson({ error: "signed_out" }, 401) };
  if (["actions", "eventChanges", "contributionDecisions", "collection"].some(key => new URL(request.url).searchParams.has(key))) return { ok: false, response: apiJson({ error: "invalid_cursor", message: "Use the account form; continuations are not accepted in addresses." }, 400) };
  const ctx = await communityContext(env, request), s = ctx.subject;
  if (!s || s.discordId !== callerId || s.sessionVersion !== callerVersion || !Number.isSafeInteger(s.sessionVersion) || s.sessionVersion < 0 || !whole(s.expiresAt))
    return { ok: false, response: apiJson({ error: "signed_out" }, 401) };
  const subject: CommunitySubject = Object.freeze({ discordId: String(s.discordId), sessionVersion: Number(s.sessionVersion), expiresAt: Number(s.expiresAt),privacyGeneration:s.privacyGeneration });
  const plan = await prepareContributionDecisions(env, subject, raw);
  if (!plan) return { ok: false, response: apiJson({ error: "invalid_cursor" }, 400) };
  if (rateLimited(`cx:${subject.discordId}`, 5, 3600)) return { ok: false, response: apiJson({ error: "slow_down", message: "Five copy views or downloads an hour. Try again later." }, 429) };
  return { ok: true, id: subject.discordId, subject, plan };
}
const CONTRIBUTION_DECISION_ACTIONS = new Set(["allocation_reversed", "receipt_voided", "removal_recorded", "state_open", "state_exempt", "state_disputed", "state_resolved", "contact_acknowledged", "contact_officer_contact", "contact_final_notice", "contact_final_acknowledged", "contact_final_officer_contact"]);
async function finishContributionDecisions(env: Env, s: CommunitySubject, plan: HistoryPlan, at: number, metadata: D1Result | undefined, rows: D1Result | undefined): Promise<OwnContributionDecisionPage | null> {
  if (!metadata || !Array.isArray(metadata.results) || metadata.results.length !== 1 || !rows || !Array.isArray(rows.results)) return null;
  const rawMeta = metadata.results[0];
  if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) return null;
  const m = rawMeta as { high_water?: unknown; total_count?: unknown; remaining_count?: unknown };
  if (!whole(m.high_water) || !whole(m.total_count) || !whole(m.remaining_count) || !whole(at) || at === 0 || at >= s.expiresAt) return null;
  const old = plan.position;
  if ((m.total_count === 0) !== (m.high_water === 0) || m.remaining_count > m.total_count ||
      (old && (m.high_water !== old.high || m.total_count !== old.total || m.remaining_count !== old.total - old.seen || at < old.captured))) return null;
  const initial: HistoryPosition = old ?? { high: m.high_water, total: m.total_count, seen: 0, ts: 0, id: 0, expires: s.expiresAt, captured: at };
  if (rows.results.length !== Math.min(1001, m.remaining_count)) return null;
  const projected: OwnContributionDecisionPage["entries"] = [];
  let previous = initial.seen > 0 ? { ts: initial.ts, id: initial.id } : null;
  let last: { ts: number; id: number } | null = null;
  for (const [index, raw] of rows.results.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (!whole(r.at) || !whole(r.id) || r.id === 0 || r.id > initial.high || !whole(r.retain_until) || r.retain_until <= at || typeof r.action !== "string" || !CONTRIBUTION_DECISION_ACTIONS.has(r.action) ||
        (r.own_subject !== 0 && r.own_subject !== 1) || (r.own_actor !== 0 && r.own_actor !== 1) || (r.own_subject !== 1 && r.own_actor !== 1) ||
        (previous && (r.at < previous.ts || (r.at === previous.ts && r.id <= previous.id)))) return null;
    previous = { ts: r.at, id: r.id };
    if (index < 1000) {
      last = previous;
      projected.push({ action: r.action, at: secondsToIso(r.at), relation: r.own_subject === 1 ? r.own_actor === 1 ? "both" : "subject" : "actor" });
    }
  }
  const delivered = initial.seen + projected.length, remaining = initial.total - delivered;
  if (!whole(delivered) || remaining < 0 || (remaining > 0 && projected.length !== 1000)) return null;
  return {
    entries: projected, truncated: remaining > 0, currentCursor: await contributionDecisionToken(env, s, initial),
    nextCursor: remaining > 0 && last ? await contributionDecisionToken(env, s, { ...initial, seen: delivered, ts: last.ts, id: last.id }) : null,
    capture: { kind: "retained_contribution_decision_range", at: secondsToIso(initial.captured), count: initial.total, delivered, remaining, complete: remaining === 0 },
  };
}
const contributionDecisionsChanged = () => apiJson({ error: "contribution_history_changed", message: "The retained contribution-decision range changed. Start a new capture; no completed history is claimed." }, 409);
/** Internal own-session adapter only, not a public route or rights-only identity. */
export async function exportMyContributionDecisions(request: Request, env: Env, user: SiteUser, cursor?: string): Promise<Response> {
  const start = await beginContributionDecisions(request, env, user, cursor);
  if (!start.ok) return start.response;
  const out = await admittedReadAs(env, start.subject, "authenticatedIdentity", [env.DB.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at"), ...start.plan.statements]);
  if (out === FENCE_REFUSED) return historyRefusal(env, request);
  const clock = out[0]?.results?.[0] as { at?: unknown } | undefined;
  if (!clock || !whole(clock.at)) return contributionDecisionsChanged();
  const at = clock.at;
  const contributionDecisions = await finishContributionDecisions(env, start.subject, start.plan, at, out[1], out[2]);
  if (!contributionDecisions) return contributionDecisionsChanged();
  const body: OwnContributionDecisionHistoryView = { generatedAt: secondsToIso(at), coverage: { kind: "curated_partial", ownAccountOnly: true, contributionDecisionsPageLimit: 1000, completeErasure: false }, contributionDecisions };
  await audit(env, start.id, "site.copy_exported", start.id).catch(()=>{});
  return apiJson(body);
}

/** .76: the member's application for their OWN copy: the parsed answers' references carry kind and label only (the key is another member's id). */
function ownApplication(a: ReturnType<typeof appOut>) {
  const answers: Record<string, unknown> = { ...a.answers };
  if (Object.hasOwn(answers, 'references')) {
    // Restored legacy answers can have any shape. Expose only the chosen reference label,
    // never counterpart keys or nested objects, through either own-copy admission path.
    answers.references = Array.isArray(answers.references) ? (answers.references as unknown[])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
      .map(r => ({ kind: r.kind === 'discord' || r.kind === 'name' ? r.kind : null, label: typeof r.label === 'string' ? r.label : null })) : null;
  }
  return { ...a, answers };
}

export async function exportMyData(request: Request, env: Env, user: SiteUser, actionCursor?: string, eventCursor?: string, contributionCursor?: string): Promise<Response> {
  if ([actionCursor, eventCursor, contributionCursor].filter(cursor => cursor !== undefined).length > 1) return apiJson({ error: "invalid_cursor" }, 400);
  const start = contributionCursor !== undefined ? await beginContributionDecisions(request, env, user, contributionCursor) : eventCursor !== undefined ? await beginEventChanges(request, env, user, eventCursor) : await beginHistory(request, env, user, actionCursor);
  if (!start.ok) return start.response;
  const { id, subject } = start;
  const history = eventCursor !== undefined || contributionCursor !== undefined ? await prepareHistory(env, subject) : start.plan;
  const eventHistory = eventCursor !== undefined ? start.plan : await prepareEventChanges(env, subject);
  const decisionHistory = contributionCursor !== undefined ? start.plan : await prepareContributionDecisions(env, subject);
  if (!history || !eventHistory || !decisionHistory) return apiJson({ error: "invalid_cursor" }, 400);
  const plan = communityExportPlan(env, id);
  const privacyCopy=env.PRIVACY_ERASURE_ENABLED==='true'||env.PRIVACY_RETENTION_ENABLED==='true';
  const markerKey=privacyCopy?await privacySubjectKey(env,id):null;
  const privacyStatements=!privacyCopy?[]:[
    env.DB.prepare('SELECT state,hold_reason,staff_access,created_at,completed_at,retain_until FROM privacy_serving_jobs WHERE subject_id=?1 ORDER BY created_at,operation_id LIMIT 1001').bind(id),
    env.DB.prepare("SELECT purpose,state,cleanup_requested,created_at,updated_at,retain_until FROM privacy_provider_messages WHERE EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1) ORDER BY created_at,operation_id LIMIT 1001").bind(id),
    env.DB.prepare('SELECT erased_at,retain_until,scope,recovery_custody FROM privacy_restore_replay WHERE subject_id=?1 ORDER BY erased_at,operation_id LIMIT 1001').bind(id),
    env.DB.prepare('SELECT denied_at,retain_until,reason FROM privacy_denial_markers WHERE subject_key=?1').bind(markerKey),
  ];
  const out = await admittedReadAs(env, subject, "authenticatedIdentity", [
    env.DB.prepare("SELECT CAST(strftime('%s', 'now') AS INTEGER) AS at"), // .76: the capture instant, the database's clock inside this batch
    env.DB.prepare("SELECT discord_id, username, global_name, nick, avatar, account_created, server_joined, first_login, last_login, checked_at, in_server, denied, denied_at FROM site_users WHERE discord_id = ?1").bind(id),
    env.DB.prepare("SELECT * FROM site_applications WHERE discord_id = ?1").bind(id),
    env.DB.prepare("SELECT ballot, slot, nominee_kind, nominee_label, reason, created_at, updated_at FROM site_votes WHERE voter_id = ?1 ORDER BY ballot, slot").bind(id),
    env.DB.prepare("SELECT role_key, vote, created_at, updated_at FROM site_board_votes WHERE voter_id = ?1 ORDER BY role_key, created_at").bind(id),
    env.DB.prepare("SELECT friend_kind, friend_label, note, created_at FROM site_friends WHERE owner_id = ?1 ORDER BY created_at, friend_label").bind(id),
    env.DB.prepare("SELECT name, status, created_at, approved_at, queued_at, released_at FROM site_reserved WHERE owner_id = ?1 ORDER BY id").bind(id),
    env.DB.prepare("SELECT banned, linked_at, bnet_linked_at, username, global_name, names_at FROM members WHERE discord_id = ?1").bind(id),
    env.DB.prepare("SELECT name, status, bound_at, verified_at, member_since, left_at, source FROM characters WHERE discord_id = ?1 ORDER BY bound_at, name").bind(id),
    env.DB.prepare("SELECT name, created_at, expires_at, consumed_at, consumed_source FROM pending WHERE discord_id = ?1 ORDER BY created_at").bind(id),
    // .74: the member's own queue state, never the officer, the claim or the note; the actions naming them as subject OR actor, paged
    env.DB.prepare("SELECT name, status, attempts, created_at, written_at, invited_at, joined_at, retry_after, last_reason, last_reason_at FROM invite_queue WHERE discord_id = ?1 ORDER BY created_at, id").bind(id),
    ...history.statements,
    ...eventHistory.statements,
    ...decisionHistory.statements,
    // .114: the account's rename records (rename-review.ts), without the administrators' identities
    env.DB.prepare("SELECT old_name, new_name, state, decided_at, closed_at FROM rename_holds WHERE discord_id = ?1 ORDER BY decided_at, id").bind(id),
    ...plan.statements,
    ...privacyStatements,
  ]);
  if (out === FENCE_REFUSED) return historyRefusal(env, request);
  const [clock, account, app, votes, board, friends, reserved, member, characters, requests, queue, historyMeta, historyRows, eventMeta, eventRows, decisionMeta, decisionRows, renames] = out;
  type Rec = Record<string, unknown>;
  const a = (account!.results[0] ?? null) as Rec | null;
  if (!a) return apiJson({ error: "conflict", message: "The account row was not present in the admitted copy. Try again." }, 409);
  const m = (member!.results[0] ?? null) as Rec | null;
  const at = (clock!.results[0] as { at: number }).at;
  const actionPage = await finishHistory(env, subject, history, at, historyMeta!, historyRows!);
  if (!actionPage) return historyChanged();
  const eventPage = await finishEventChanges(env, subject, eventHistory, at, eventMeta!, eventRows!);
  if (!eventPage) return eventChangesChanged();
  const decisionPage = await finishContributionDecisions(env, subject, decisionHistory, at, decisionMeta, decisionRows);
  if (!decisionPage) return contributionDecisionsChanged();
  const body = {
    generatedAt: secondsToIso((clock!.results[0] as { at: number }).at),
    coverage: { kind: "curated_partial", ownAccountOnly: true, excluded: ["staff notes/reasons/identities", "raw roster snapshots", "private payment details", "provider logs", "external Discord posts/connections", "private recovery backups", "local watcher/game/download copies"], actionsPageLimit: 1000, eventChangesPageLimit: 1000, contributionDecisionsPageLimit: 1000, completeErasure: false },
    about: "A curated partial copy about your own Discord account, with account, site, verification and community sections read together in one database transaction at generatedAt (the database's clock inside that read). Actions, actor-linked eventChanges and subject/actor-linked contributionDecisions are separately captured retained ranges with their own capture.at and continuation. Contribution decisions include only current recognized actions, time and your relation; payment evidence, counterpart identities and arbitrary actor text are omitted. Later inserts are excluded from each continued range. A download continuing one range captures its other history datasets afresh. Other sections are freshly read for this download, not frozen across pages; no all-store or immutable content snapshot is claimed. Continue through the account form. History completion concerns this retained range only, not every store, external service, recovery copy or erasure.",
    account: a
      ? { discordId: a.discord_id, username: a.username, displayName: a.global_name, nickname: a.nick, avatar: a.avatar, accountCreated: iso(a.account_created as number | null), joinedServer: iso(a.server_joined as number | null), firstSignIn: iso(a.first_login as number), lastSignIn: iso(a.last_login as number), lastMembershipCheck: iso(a.checked_at as number | null), inServer: a.in_server === 1, denied: a.denied === 1, deniedAt: iso(a.denied_at as number | null) }
      : null,
    site: {
      application: app!.results[0] ? ownApplication(appOut(app!.results[0] as AppRow)) : null,
      votes: (votes!.results as Rec[]).map((v) => ({ ballot: v.ballot, slot: v.slot, nominee: { label: v.nominee_label }, reason: v.reason, createdAt: iso(v.created_at as number), updatedAt: iso(v.updated_at as number) })), // .74: the label chosen, no structural account reference
      boardVotes: (board!.results as Rec[]).map((v) => ({ role: v.role_key, vote: v.vote, createdAt: iso(v.created_at as number), updatedAt: iso(v.updated_at as number) })),
      friends: (friends!.results as Rec[]).map((f) => ({ label: f.friend_label, note: f.note, createdAt: iso(f.created_at as number) })),
      reserved: (reserved!.results as Rec[]).map((r) => ({ name: r.name, status: r.status, createdAt: iso(r.created_at as number), approvedAt: iso(r.approved_at as number | null), queuedAt: iso(r.queued_at as number | null), releasedAt: iso(r.released_at as number | null) })),
    },
    verification: {
      known: m !== null,
      bannedFromVerifying: m?.banned === 1,
      battleNet: m ? { linked: bnetFresh(m.linked_at as number | null), linkedAt: bnetFresh(m.linked_at as number | null) ? iso(m.linked_at as number) : null, profileLinkedAt: bnetFresh(m.bnet_linked_at as number | null) ? iso(m.bnet_linked_at as number) : null } : null,
      discordNames: m ? { username: m.username, displayName: m.global_name, readAt: iso(m.names_at as number | null) } : null,
      characters: (characters!.results as Rec[]).map((c) => ({ name: c.name, status: c.status, boundAt: iso(c.bound_at as number), verifiedAt: iso(c.verified_at as number | null), memberSince: iso(c.member_since as number | null), leftAt: iso(c.left_at as number | null), source: c.source })),
      codeRequests: (requests!.results as Rec[]).map((p) => ({ character: p.name, createdAt: iso(p.created_at as number), expiresAt: iso(p.expires_at as number), usedAt: iso(p.consumed_at as number | null), usedThrough: p.consumed_source })),
      renameRecords: (renames!.results as Rec[]).map((r) => ({ from: r.old_name, to: r.new_name, state: r.state, decidedAt: iso(r.decided_at as number), closedAt: iso(r.closed_at as number | null) })), // .114
      inviteQueue: (queue!.results as Rec[]).map((q) => ({ character: q.name, status: q.status, attempts: q.attempts, createdAt: iso(q.created_at as number), writtenAt: iso(q.written_at as number | null), invitedAt: iso(q.invited_at as number | null), joinedAt: iso(q.joined_at as number | null), retryAfter: iso(q.retry_after as number | null), lastRefusal: q.last_reason ? { reason: q.last_reason, at: iso(q.last_reason_at as number | null) } : null })),
    },
    actions: actionPage,
    eventChanges: eventPage,
    contributionDecisions: decisionPage,
    community: plan.shape(out.slice(18,18+plan.statements.length)), // Three two-result history plans precede registry results.
    ...(privacyCopy?{privacyLifecycle:{coverage:'own minimized serving controls; no private provider pointers, proof digests or other account identifiers',allCopiesErased:false,
      erasureRequests:{complete:out[18+plan.statements.length]!.results.length<=1000,rows:out[18+plan.statements.length]!.results.slice(0,1000)},
      providerCleanup:{complete:out[19+plan.statements.length]!.results.length<=1000,rows:out[19+plan.statements.length]!.results.slice(0,1000)},
      recoverySuppression:{complete:out[20+plan.statements.length]!.results.length<=1000,rows:out[20+plan.statements.length]!.results.slice(0,1000)},
      rejectionMarker:out[21+plan.statements.length]!.results}}:{}),
  };
  await audit(env, id, "site.copy_exported", id).catch(()=>{});
  return apiJson(body, 200, { "Content-Disposition": 'attachment; filename="olympus-my-data.json"' });
}

/** Internal adapter, not a new public route. Same own-session fence and copy budget. */
export async function exportMyHistory(request: Request, env: Env, user: SiteUser, actionCursor?: string): Promise<Response> {
  const start = await beginHistory(request, env, user, actionCursor);
  if (!start.ok) return start.response;
  const out = await admittedReadAs(env, start.subject, "authenticatedIdentity", [
    env.DB.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at"),
    ...start.plan.statements,
  ]);
  if (out === FENCE_REFUSED) return historyRefusal(env, request);
  const at = (out[0]!.results[0] as { at: number }).at;
  const actions = await finishHistory(env, start.subject, start.plan, at, out[1]!, out[2]!);
  if (!actions) return historyChanged();
  const body: OwnActionHistoryView = {
    generatedAt: secondsToIso(at),
    coverage: { kind: "curated_partial", ownAccountOnly: true, actionsPageLimit: ACTIONS_LIMIT, completeErasure: false },
    actions,
  };
  // The response is a history view, not proof that a file was saved.
  await audit(env, start.id, "site.copy_exported", start.id).catch(()=>{});
  return apiJson(body);
}
