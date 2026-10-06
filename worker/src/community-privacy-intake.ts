/**
 * .82 (1 Oct 2026): the private request intake, consolidation batch 6 of Codex's adapter map, ported from Olympus
 * Forever's src/privacy-requests.ts and migrations/0008_privacy_requests.sql (frozen candidate manifest 296db2c8…;
 * Viktor's ask of 30 Sep 23:53: "a private request form for people who can no longer access Discord") onto the keeper.
 *
 * A case is a manually handled, private conversation between a requester and the site's administrators. It needs no
 * Discord sign-in. The browser generates the case id and a 32-byte case code BEFORE submitting, so a lost response never
 * leaves an inaccessible case; only the code's SHA-256 is stored, and the code only ever travels in a POST body. A case
 * proves control of that conversation and nothing else: it never proves who owns an account, and it never exports,
 * deletes, releases a hold or changes a role; the administrators act through the site's own tools and reply here. There
 * is no email, no IP and no staff-only text.
 *
 * Retention is fixed per case when it is created (`retention_days`) and never recomputed from the current setting: a
 * message renews the deadline under the case's own policy, reads never do, and closing pins it. `retain_until` is the
 * EFFECTIVE cutoff by the database clock inside every read and write (an expired case is `case_not_found` at once); the
 * bounded cleanup cron is physical deletion and runs whatever the flag says. Capacity is bounded inside the INSERT (1000
 * stored cases, 200 open, 20 new per rolling hour, 100 messages and 20 requester messages per case, 500 staff operations
 * per case); the in-memory per-IP limiter is only a first filter (the keeper has no rate-limit binding). Public routes
 * are same-origin JSON POSTs read from the actual stream within an 8 KiB budget; the STAFF operation arrives through the
 * site's admin reader (site-core readJson, the shared 64 KiB budget, after the admin gate), and its reply is capped at the
 * field (maxMessageLength): the 8 KiB budget is the public routes' contract only (.89, Codex's review).
 *
 * .89 (Codex's frozen .82 review, 1 Oct 06:49 UTC): a new case is never born at or past its deadline by the database clock
 * (`?deadline > DB_NOW` inside the INSERT; a refused birth is classified by a database-clock probe: an expired deadline
 * is 503 intake_unavailable, a full cap 429 intake_busy); the rolling-hour cap is cut at the database clock inside the
 * INSERT; the requester's exact-replay lookup is read in ONE batch with the live case, joined to it by the code hash, so
 * a deadline passing between the two is never answered as a replay; and the staff explanation classifies an expired or
 * missing case before any prior operation (404 whatever the operation table holds).
 *
 * Staff (communityStaff, community-routes.ts): list, read, and one operation per request (a status, an optional reply),
 * keyed by the operation id the admin page generates, admitted only while the admin's fence holds (fenceSql applicantWrite
 * at the operation insert), the case live and not yet carrying that id; a replay returns the original result without
 * reapplying (it can never reopen a case closed since); the audit row (`community.privacy_case_updated`, the case id,
 * the status, whether a reply was given, never the text) is written in the same batch or not at all. Reads run behind
 * `admittedRead`. Flag `privacy_intake`; new cases need PRIVACY_INTAKE_ENABLED, PRIVACY_INTAKE_MONITORED (someone reads
 * the queue) and a finite PRIVACY_INTAKE_RETENTION_DAYS. Seconds in D1; ISO-8601 at the boundary.
 */
import type { Env } from "./env";
import { now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, sameOrigin, type SiteUser } from "./site-core";
import { admitted, admittedRead, communityFeatures, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, type CommunityContext } from "./community-context";
import { secondsToIso } from "./community-time";

const DAY = 86400, HOUR = 3600;
export const INTAKE_LIMITS = {
  maxDetailsLength: 2000,
  maxMessageLength: 2000,
  maxHintLength: 64,
  /** A strict byte budget for every intake request body, read from the actual stream whatever Content-Length claims. */
  maxBodyBytes: 8192,
  storedCases: 1000,
  openCases: 200,
  newCasesPerHour: 20,
  messagesPerCase: 100,
  requesterMessagesPerCase: 20,
  /** Staff operations are bounded too (status-only updates do not count against the message cap). */
  operationsPerCase: 500,
  readPage: 50,
  adminList: 200,
} as const;
/** A suggested first-review date for staff, counted from the receipt and never reset: an internal prompt, not a legal deadline (none was selected). */
const SUGGESTED_REVIEW_S = 14 * DAY;
export const INTAKE_KINDS = ["access", "deletion", "correction", "objection", "other"] as const;
export const INTAKE_STATUSES = ["received", "in_review", "needs_verification", "completed", "declined"] as const;
const CLOSING = new Set(["completed", "declined"]);
const ID = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^[A-Za-z0-9_-]{43}$/;
type Kind = (typeof INTAKE_KINDS)[number];
type Status = (typeof INTAKE_STATUSES)[number];
/** The case is within its lifetime by the database clock. */
const LIVE = (a: string) => `${a}.retain_until > ${DB_NOW}`;

interface CaseRow {
  case_id: string;
  code_hash: string;
  payload_hash: string;
  kind: Kind;
  status: Status;
  retention_days: number;
  retain_until: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}
const CASE_COLUMNS = "case_id, code_hash, payload_hash, kind, status, retention_days, retain_until, created_at, updated_at, closed_at";

class Bad extends Error {
  constructor(public code: string, public status = 400, public headers: Record<string, string> = {}) {
    super(code);
  }
}
const bad = (e: unknown): Response | null => (e instanceof Bad ? apiJson({ error: e.code }, e.status, e.headers) : null);

export function intakeRetentionDays(env: Env): number | null {
  const raw = env.PRIVACY_INTAKE_RETENTION_DAYS;
  if (!raw || !/^\d{1,4}$/.test(raw)) return null;
  const days = Number(raw);
  return days >= 1 && days <= 3650 ? days : null;
}
/** New cases are accepted only while the form is switched on, someone has confirmed they read the queue, and a retention is set. */
export const intakeOpen = (env: Env): boolean => env.PRIVACY_INTAKE_ENABLED === "true" && env.PRIVACY_INTAKE_MONITORED === "true" && intakeRetentionDays(env) !== null;

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Constant-time comparison of two equal-length hex strings (a wrong code and a missing case take the same path). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Read at most maxBytes of the actual stream, whatever Content-Length claims, and stop as soon as the budget is exceeded. Valid UTF-8 only. */
async function readBodyBytes(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Bad("body_too_large", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new Bad("invalid_json");
  }
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await readBodyBytes(request, INTAKE_LIMITS.maxBodyBytes);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Bad("invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Bad("invalid_request");
  return body as Record<string, unknown>;
}
/** The public routes are plain same-origin JSON POSTs: no session exists to derive a page token from. */
function requireSameOriginJson(request: Request): void {
  if (!sameOrigin(request)) throw new Bad("bad_origin", 403);
  if (!/^application\/json(\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) throw new Bad("unsupported_media_type", 415);
}
// Preserve ordinary Unicode and CR/LF/TAB; refuse non-text controls, bidi overrides/isolates, BOM and lone surrogates;
// validate the raw input before trimming so forbidden characters are never silently removed.
const UNSAFE_REQUEST_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩﻿]|\p{Cs}/u;
function text(value: unknown, max: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new Bad("invalid_request");
    return null;
  }
  if (typeof value !== "string" || UNSAFE_REQUEST_TEXT.test(value)) throw new Bad("invalid_request");
  const trimmed = value.trim();
  if (trimmed.length > max || (required && trimmed.length === 0)) throw new Bad("invalid_request");
  return trimmed.length ? trimmed : null;
}
function credential(body: Record<string, unknown>): { caseId: string; caseCode: string } {
  const { caseId, caseCode } = body;
  if (typeof caseId !== "string" || !ID.test(caseId) || typeof caseCode !== "string" || !CODE.test(caseCode)) throw new Bad("invalid_request");
  return { caseId, caseCode };
}
const notFound = () => apiJson({ error: "case_not_found" }, 404);
const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
/** The first filter for the public routes: the shared in-memory limiter by path and IP (the D1 caps are the real bound). */
function limited(request: Request, path: string): Response | null {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return rateLimited(`pi:${path}:${ip}`, 20, 60) ? apiJson({ error: "rate_limited" }, 429, { "Retry-After": "60" }) : null;
}

/** The row, if the code matches and it is live (point of use). Same answer otherwise. */
async function authorize(row: CaseRow | null, caseCode: string): Promise<CaseRow | null> {
  const codeHash = await sha256Hex(caseCode);
  const matches = timingSafeEqual(codeHash, row?.code_hash ?? "0".repeat(codeHash.length));
  return row && matches ? row : null;
}
const liveCase = (env: Env, caseId: string) => env.DB.prepare(`SELECT ${CASE_COLUMNS} FROM community_privacy_cases c WHERE c.case_id = ?1 AND ${LIVE("c")}`).bind(caseId);
/** The receipt exactly as the creating request answered it: status received and the creation-time deadline. */
const receipt = (row: CaseRow, status = 200) => apiJson({ caseId: row.case_id, status: "received", createdAt: secondsToIso(row.created_at), retentionDeadline: secondsToIso(row.created_at + row.retention_days * DAY) }, status);

/** GET /api/privacy/config, POST /api/privacy/requests[/read|/reply]: the public side, no session. */
export async function handlePrivacyIntake(request: Request, env: Env, path: string): Promise<Response> {
  return privacyDispatch(request, env, path, false);
}
/** Trusted SSR adapter after its origin/CSRF/bounds checks. This is not a separately routable endpoint. */
export async function handlePrivacyIntakeForm(request: Request, env: Env, path: string): Promise<Response> {
  return privacyDispatch(request, env, path, true);
}
async function privacyDispatch(request: Request, env: Env, path: string, contactForm: boolean): Promise<Response> {
  if (!communityFeatures(env).has("privacy_intake")) return featureOff();
  const m = request.method;
  if (m === "GET" && path === "/api/privacy/config") return privacyConfig(env);
  if (m !== "POST") return apiJson({ error: "not_found" }, 404);
  const over = limited(request, path);
  if (over) return over;
  try {
    if (path === "/api/privacy/requests") return await privacyCreate(request, env, contactForm);
    if (path === "/api/privacy/requests/read") return await privacyRead(request, env);
    if (path === "/api/privacy/requests/reply") return await privacyReply(request, env);
    return apiJson({ error: "not_found" }, 404);
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** Whether new cases are accepted, and under what published limits. No secrets. */
function privacyConfig(env: Env): Response {
  return apiJson({ enabled: intakeOpen(env), repliesOpen: true, retentionDays: intakeRetentionDays(env), maxDetailsLength: INTAKE_LIMITS.maxDetailsLength, maxMessageLength: INTAKE_LIMITS.maxMessageLength, monitoringConfirmed: env.PRIVACY_INTAKE_MONITORED === "true" });
}

/** POST /api/privacy/requests {caseId, caseCode, kind, details, subjectHint?, characterHint?} — open a case. Exact retries return the existing receipt, even while intake is paused. */
async function privacyCreate(request: Request, env: Env, contactForm: boolean): Promise<Response> {
  requireSameOriginJson(request);
  const body = await readBody(request);
  const { caseId, caseCode } = credential(body);
  if (typeof body.kind !== "string" || !(INTAKE_KINDS as readonly string[]).includes(body.kind)) throw new Bad("invalid_request");
  if (body.website !== undefined && body.website !== "") throw new Bad("invalid_request"); // the honeypot field stays empty
  const kind = body.kind as Kind;
  const subjectHint = text(body.subjectHint, INTAKE_LIMITS.maxHintLength, false);
  const characterHint = text(body.characterHint, INTAKE_LIMITS.maxHintLength, false);
  const details = text(body.details, INTAKE_LIMITS.maxDetailsLength, true)!;
  const codeHash = await sha256Hex(caseCode);
  const payloadHash = await sha256Hex(JSON.stringify([kind, subjectHint, characterHint, details]));
  const at = now();
  const existing = async (): Promise<Response | null> => {
    const row = await liveCase(env, caseId).first<CaseRow>(); // an expired case is gone for the requester before the cleanup purges it
    if (!row) return null;
    // the ORIGINAL submission receipt, whatever has happened to the case since, so a lost-response retry still matches
    if (timingSafeEqual(row.code_hash, codeHash) && row.payload_hash === payloadHash) return receipt(row);
    return apiJson({ error: "case_conflict" }, 409);
  };
  const retry = await existing();
  if (retry) return retry;
  // Existing JSON cases/read/replies and exact lost-answer creation replays remain actionable.
  // Fresh cases use the tested short form, whose CSRF admission precedes this adapter.
  if (!contactForm) return apiJson({ error: "use_contact_form", contactUrl: "https://olympus.roachcouncil.com/privacy/contact", existingCaseUrl: "https://olympus.roachcouncil.com/privacy/case", message: "Open the short contact form to start a new private case. Existing cases and exact submission retries still work." }, 410);
  const days = intakeRetentionDays(env);
  if (!intakeOpen(env) || days === null) return apiJson({ error: "intake_unavailable" }, 503);
  // admission, the case and its first message in one transaction; every cap is checked inside the INSERT, the rolling hour and the
  // deadline by the database clock (.89): a case is never born at or past its retain_until
  const deadline = at + days * DAY;
  const [created] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO community_privacy_cases (case_id, code_hash, payload_hash, kind, subject_hint, character_hint, status, retention_days, retain_until, created_at, updated_at, closed_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'received', ?7, ?8, ?9, ?9, NULL
       WHERE NOT EXISTS (SELECT 1 FROM community_privacy_cases WHERE case_id = ?1)
         AND ?8 > ${DB_NOW}
         AND (SELECT COUNT(*) FROM community_privacy_cases) < ?10
         AND (SELECT COUNT(*) FROM community_privacy_cases WHERE closed_at IS NULL) < ?11
         AND (SELECT COUNT(*) FROM community_privacy_cases WHERE created_at > ${DB_NOW} - ${HOUR}) < ?12`,
    ).bind(caseId, codeHash, payloadHash, kind, subjectHint, characterHint, days, deadline, at, INTAKE_LIMITS.storedCases, INTAKE_LIMITS.openCases, INTAKE_LIMITS.newCasesPerHour),
    // the details are the first requester message (reads return them; they count towards the requester cap)
    env.DB.prepare(
      `INSERT INTO community_privacy_messages (case_id, message_id, author, text, text_hash, nonce, created_at)
       SELECT ?1, ?1, 'requester', ?2, ?3, ?6, ?4
       WHERE EXISTS (SELECT 1 FROM community_privacy_cases WHERE case_id = ?1 AND payload_hash = ?5 AND created_at = ?4)
         AND NOT EXISTS (SELECT 1 FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?1)`,
    ).bind(caseId, details, await sha256Hex(details), at, payloadHash, randomToken()),
  ]);
  if ((created!.meta.changes ?? 0) === 0) {
    const raced = await existing(); // a concurrent identical submission won the race, or a cap is full
    if (raced) return raced;
    // .89: a deadline already passed by the database clock is not capacity: the intake cannot take a case that would be gone at once
    const live = await env.DB.prepare(`SELECT (?1 > ${DB_NOW}) AS live`).bind(deadline).first<{ live: number }>();
    if (live?.live !== 1) return apiJson({ error: "intake_unavailable" }, 503);
    return apiJson({ error: "intake_busy" }, 429, { "Retry-After": "3600" });
  }
  return apiJson({ caseId, status: "received", createdAt: secondsToIso(at), retentionDeadline: secondsToIso(deadline) }, 201);
}

/** POST /api/privacy/requests/read {caseId, caseCode, before?} — the case and its newest messages, oldest first. */
async function privacyRead(request: Request, env: Env): Promise<Response> {
  requireSameOriginJson(request);
  const body = await readBody(request);
  const { caseId, caseCode } = credential(body);
  if (body.before !== undefined && (typeof body.before !== "string" || !ID.test(body.before))) throw new Bad("invalid_request");
  const before = typeof body.before === "string" ? body.before : null;
  // the case, the cursor and the page from ONE batch, so updatedAt can never be older than a message it returns
  const [caseResult, cursorResult, messages] = await env.DB.batch([
    liveCase(env, caseId),
    env.DB.prepare("SELECT 1 AS found FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?2").bind(caseId, before ?? ""),
    env.DB.prepare(
      `SELECT message_id, author, text, created_at FROM community_privacy_messages
       WHERE case_id = ?1 AND (?2 IS NULL OR (created_at, message_id) < (SELECT created_at, message_id FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?2))
       ORDER BY created_at DESC, message_id DESC LIMIT ?3`,
    ).bind(caseId, before, INTAKE_LIMITS.readPage + 1),
  ]);
  const row = await authorize((caseResult!.results as CaseRow[])[0] ?? null, caseCode);
  if (!row) return notFound();
  if (before !== null && cursorResult!.results.length === 0) throw new Bad("invalid_request");
  const rows = messages!.results as { message_id: string; author: "requester" | "staff"; text: string; created_at: number }[];
  const page = rows.slice(0, INTAKE_LIMITS.readPage).reverse();
  return apiJson({
    caseId: row.case_id,
    kind: row.kind,
    status: row.status,
    createdAt: secondsToIso(row.created_at),
    updatedAt: secondsToIso(row.updated_at),
    retentionDeadline: secondsToIso(row.retain_until),
    messages: page.map((m) => ({ messageId: m.message_id, from: m.author === "requester" ? "you" : "staff", text: m.text, at: secondsToIso(m.created_at) })),
    hasMore: rows.length > INTAKE_LIMITS.readPage,
  });
}

/** POST /api/privacy/requests/reply {caseId, caseCode, messageId, text} — the requester answers staff. */
async function privacyReply(request: Request, env: Env): Promise<Response> {
  requireSameOriginJson(request);
  const body = await readBody(request);
  const { caseId, caseCode } = credential(body);
  if (typeof body.messageId !== "string" || !ID.test(body.messageId)) throw new Bad("invalid_request");
  const messageId = body.messageId;
  const message = text(body.text, INTAKE_LIMITS.maxMessageLength, true)!;
  const at = now();
  const codeHash = await sha256Hex(caseCode);
  // .89: the case and the prior message under this id are read in ONE batch; the prior row is joined to the case live at that instant and to the code,
  // so a deadline passing between the two reads is never answered as a replay (an expired case is 404 whatever the message table holds)
  type Prior = { text_hash: string; created_at: number; author: string };
  const priorStmt = () => env.DB.prepare(`SELECT m.text_hash, m.created_at, m.author FROM community_privacy_messages m JOIN community_privacy_cases c ON c.case_id = m.case_id WHERE m.case_id = ?1 AND m.message_id = ?2 AND c.code_hash = ?3 AND ${LIVE("c")}`).bind(caseId, messageId, codeHash);
  const [caseResult, priorResult] = await env.DB.batch([liveCase(env, caseId), priorStmt()]);
  const row = await authorize((caseResult!.results as CaseRow[])[0] ?? null, caseCode);
  if (!row) return notFound();
  const textHash = await sha256Hex(message);
  // an exact retry succeeds even if the case has closed since; anything else reusing the id is refused
  const replayOf = (m: Prior | undefined): Response | null => (m ? (m.author === "requester" && m.text_hash === textHash ? apiJson({ messageId, at: secondsToIso(m.created_at) }) : apiJson({ error: "message_conflict" }, 409)) : null);
  const retry = replayOf(priorResult!.results[0] as Prior | undefined);
  if (retry) return retry;
  if (row.closed_at !== null) return apiJson({ error: "case_closed" }, 409);
  // the deadline moves only if THIS request's insert succeeded (its nonce), never on a same-second match
  const nonce = randomToken();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO community_privacy_messages (case_id, message_id, author, text, text_hash, nonce, created_at)
       SELECT ?1, ?2, 'requester', ?3, ?4, ?9, ?5
       WHERE EXISTS (SELECT 1 FROM community_privacy_cases c WHERE c.case_id = ?1 AND c.code_hash = ?8 AND c.closed_at IS NULL AND ${LIVE("c")})
         AND NOT EXISTS (SELECT 1 FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?2)
         AND (SELECT COUNT(*) FROM community_privacy_messages WHERE case_id = ?1) < ?6
         AND (SELECT COUNT(*) FROM community_privacy_messages WHERE case_id = ?1 AND author = 'requester') < ?7`,
    ).bind(caseId, messageId, message, textHash, at, INTAKE_LIMITS.messagesPerCase, INTAKE_LIMITS.requesterMessagesPerCase, codeHash, nonce),
    // a new message renews the deadline under the case's OWN retention, never the current setting; monotonic
    env.DB.prepare(
      `UPDATE community_privacy_cases SET updated_at = MAX(updated_at, ?2), retain_until = MAX(retain_until, ?2 + retention_days * ${DAY})
       WHERE case_id = ?1 AND EXISTS (SELECT 1 FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?3 AND nonce = ?4)`,
    ).bind(caseId, at, messageId, nonce),
  ]);
  if ((inserted!.meta.changes ?? 0) === 0) {
    // classify the no-op from the state now, read at one instant: gone or expired first, never a misleading limit
    const [c2, p2] = await env.DB.batch([liveCase(env, caseId), priorStmt()]);
    const current = await authorize((c2!.results as CaseRow[])[0] ?? null, caseCode);
    if (!current) return notFound();
    const raced = replayOf(p2!.results[0] as Prior | undefined);
    if (raced) return raced;
    if (current.closed_at !== null) return apiJson({ error: "case_closed" }, 409);
    return apiJson({ error: "message_limit" }, 429);
  }
  return apiJson({ messageId, at: secondsToIso(at) }, 201);
}

// ---------- staff (SITE_ADMINS, communityStaff through community-routes.ts) ----------
const needPage = (request: Request) => (request.headers.get("X-Olympus") !== PAGE_VERSION ? apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409) : null);

/** GET /api/admin/community/privacy-requests[?state=open|closed] → the live cases, newest activity first, bounded. */
export async function adminListCases(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  if (!ctx.features.has("privacy_intake")) return featureOff();
  const state = url.searchParams.get("state") === "closed" ? "closed" : "open";
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(
      `SELECT c.case_id, c.kind, c.status, c.subject_hint, c.character_hint, c.created_at, c.updated_at, c.retain_until,
              (SELECT COUNT(*) FROM community_privacy_messages m WHERE m.case_id = c.case_id) AS message_count,
              (SELECT author FROM community_privacy_messages m WHERE m.case_id = c.case_id ORDER BY created_at DESC, message_id DESC LIMIT 1) AS last_from
       FROM community_privacy_cases c WHERE ${state === "open" ? "c.closed_at IS NULL" : "c.closed_at IS NOT NULL"} AND ${LIVE("c")}
       ORDER BY c.updated_at DESC, c.case_id LIMIT ?1`,
    ).bind(INTAKE_LIMITS.adminList + 1),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  type Row = { case_id: string; kind: Kind; status: Status; subject_hint: string | null; character_hint: string | null; created_at: number; updated_at: number; retain_until: number; message_count: number; last_from: string | null };
  const all = out[0]!.results as Row[];
  return apiJson({
    enabled: true,
    intakeOpen: intakeOpen(env),
    cases: all.slice(0, INTAKE_LIMITS.adminList).map((r) => ({ caseId: r.case_id, kind: r.kind, status: r.status, subjectHint: r.subject_hint, characterHint: r.character_hint, createdAt: secondsToIso(r.created_at), updatedAt: secondsToIso(r.updated_at), suggestedReviewBy: secondsToIso(r.created_at + SUGGESTED_REVIEW_S), retentionDeadline: secondsToIso(r.retain_until), messageCount: r.message_count, lastFrom: r.last_from === "staff" ? "staff" : "requester" })),
    truncated: all.length > INTAKE_LIMITS.adminList,
  });
}

/** GET /api/admin/community/privacy-requests/case?caseId= → one live case with its whole conversation. */
export async function adminReadCase(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  if (!ctx.features.has("privacy_intake")) return featureOff();
  const caseId = url.searchParams.get("caseId") ?? "";
  if (!ID.test(caseId)) return apiJson({ error: "invalid_request" }, 400);
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(`SELECT case_id, kind, status, subject_hint, character_hint, created_at, updated_at, closed_at, retention_days, retain_until FROM community_privacy_cases c WHERE c.case_id = ?1 AND ${LIVE("c")}`).bind(caseId),
    env.DB.prepare(`SELECT m.message_id, m.author, m.text, m.created_at FROM community_privacy_messages m JOIN community_privacy_cases c ON c.case_id = m.case_id WHERE m.case_id = ?1 AND ${LIVE("c")} ORDER BY m.created_at, m.message_id`).bind(caseId),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const row = out[0]!.results[0] as Record<string, unknown> | undefined;
  if (!row) return notFound();
  const iso = (v: unknown) => (typeof v === "number" ? secondsToIso(v) : null);
  return apiJson({
    caseId: row.case_id, kind: row.kind, status: row.status, subjectHint: row.subject_hint, characterHint: row.character_hint,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), closedAt: iso(row.closed_at), retentionDays: row.retention_days, retentionDeadline: iso(row.retain_until),
    messages: (out[1]!.results as { message_id: string; author: string; text: string; created_at: number }[]).map((m) => ({ messageId: m.message_id, from: m.author, text: m.text, at: secondsToIso(m.created_at) })),
  });
}

/**
 * POST /api/admin/community/privacy-requests/update {caseId, messageId, status, reply?} — one staff operation, keyed by
 * the operation id the admin page generates (also the staff message's id when there is a reply). Everything hinges on
 * inserting the operation row: admitted only while the admin's fence holds, the case is live, the id is new and a
 * supplied reply fits under the message cap. A replay returns the original result without reapplying; the audit row is
 * written with the change or not at all.
 */
export async function adminUpdateCase(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.features.has("privacy_intake")) return featureOff();
  const reload = needPage(request);
  if (reload) return reload;
  if (rateLimited(`piw:${admin.discord_id}`, 60, 60)) return apiJson({ error: "slow_down" }, 429);
  try {
    for (const k of Object.keys(body)) if (!["caseId", "messageId", "status", "reply"].includes(k)) throw new Bad("invalid_request");
    const caseId = body.caseId, opId = body.messageId;
    if (typeof caseId !== "string" || !ID.test(caseId) || typeof opId !== "string" || !ID.test(opId)) throw new Bad("invalid_request");
    if (typeof body.status !== "string" || !(INTAKE_STATUSES as readonly string[]).includes(body.status)) throw new Bad("invalid_request");
    const status = body.status as Status;
    const reply = text(body.reply, INTAKE_LIMITS.maxMessageLength, false);
    const at = now(), me = admin.discord_id;
    const payloadHash = await sha256Hex(JSON.stringify([status, reply]));
    const replyHash = reply ? await sha256Hex(reply) : null;
    const closing = CLOSING.has(status) ? 1 : 0;
    const nonce = randomToken();
    const ADMITTED = "EXISTS (SELECT 1 FROM community_privacy_operations WHERE case_id = ?1 AND op_id = ?2 AND nonce = ?4)";
    // ?1 case, ?2 op, ?3 now, ?4 nonce (payload hash in ?5), ?6 me, ?7 version, ?8 expiry (the fence), ?9 reply, ?10 message cap, ?11 operation cap
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `INSERT INTO community_privacy_operations (case_id, op_id, payload_hash, nonce, created_at)
         SELECT ?1, ?2, ?5, ?4, ?3
         WHERE ${fenceSql("applicantWrite", 6, 7, 8)}
           AND EXISTS (SELECT 1 FROM community_privacy_cases c WHERE c.case_id = ?1 AND ${LIVE("c")})
           AND NOT EXISTS (SELECT 1 FROM community_privacy_operations WHERE case_id = ?1 AND op_id = ?2)
           AND NOT EXISTS (SELECT 1 FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?2)
           AND (?9 IS NULL OR (SELECT COUNT(*) FROM community_privacy_messages WHERE case_id = ?1) < ?10)
           AND (SELECT COUNT(*) FROM community_privacy_operations WHERE case_id = ?1) < ?11`,
      ).bind(caseId, opId, at, nonce, payloadHash, me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, reply, INTAKE_LIMITS.messagesPerCase, INTAKE_LIMITS.operationsPerCase),
      env.DB.prepare(`INSERT INTO community_privacy_messages (case_id, message_id, author, text, text_hash, nonce, created_at) SELECT ?1, ?2, 'staff', ?5, ?6, ?4, ?3 WHERE ?5 IS NOT NULL AND ${ADMITTED}`).bind(caseId, opId, at, nonce, reply, replyHash),
      // closing pins the deadline under the case's own retention; any other staff action renews it the same way
      env.DB.prepare(
        `UPDATE community_privacy_cases SET status = ?5, updated_at = MAX(updated_at, ?3),
           closed_at = CASE WHEN ?6 = 1 THEN COALESCE(closed_at, ?3) ELSE NULL END,
           retain_until = CASE WHEN ?6 = 1 AND closed_at IS NOT NULL THEN retain_until ELSE MAX(retain_until, ?3 + retention_days * ${DAY}) END
         WHERE case_id = ?1 AND ${ADMITTED}`,
      ).bind(caseId, opId, at, nonce, status, closing),
      env.DB.prepare(`INSERT INTO audit (ts, actor, action, subject, details) SELECT ?3, ?5, 'community.privacy_case_updated', NULL, json_object('caseId', ?1, 'status', ?6, 'replied', json(CASE WHEN ?7 IS NULL THEN 'false' ELSE 'true' END)) WHERE ${ADMITTED}`).bind(caseId, opId, at, nonce, me, status, reply),
    ]);
    if (out !== FENCE_REFUSED) return apiJson({ ok: true, status, replied: reply !== null });
    // not admitted: say why, from an admitted read of the state now
    const read = await admittedRead(env, ctx, "applicantWrite", [
      env.DB.prepare("SELECT payload_hash FROM community_privacy_operations WHERE case_id = ?1 AND op_id = ?2").bind(caseId, opId),
      liveCase(env, caseId),
      env.DB.prepare("SELECT 1 AS hit FROM community_privacy_messages WHERE case_id = ?1 AND message_id = ?2").bind(caseId, opId),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_privacy_operations WHERE case_id = ?1").bind(caseId),
    ]);
    if (read === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!read[1]!.results.length) return notFound(); // .89: an expired or missing case first, whatever the operation table holds
    const prior = read[0]!.results[0] as { payload_hash: string } | undefined;
    if (prior) return prior.payload_hash === payloadHash ? apiJson({ ok: true, status, replied: reply !== null, replay: true }) : apiJson({ error: "operation_conflict" }, 409);
    if (read[2]!.results.length) return apiJson({ error: "operation_conflict" }, 409);
    if (((read[3]!.results[0] as { n: number }).n ?? 0) >= INTAKE_LIMITS.operationsPerCase) return apiJson({ error: "operation_limit" }, 429);
    if (reply !== null) return apiJson({ error: "message_limit", statusUpdated: false }, 429);
    return refusal(env, request, "applicantWrite");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** Cron step, whatever the flag says: physical deletion of expired cases with their messages and operations; bounded. */
export async function sweepCommunityPrivacy(env: Env, at = now(), limit = 50): Promise<number> {
  const expired = "SELECT case_id FROM community_privacy_cases WHERE retain_until <= ?1 ORDER BY retain_until, case_id LIMIT ?2";
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM community_privacy_messages WHERE case_id IN (${expired})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_privacy_operations WHERE case_id IN (${expired})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_privacy_cases WHERE case_id IN (${expired})`).bind(at, limit),
  ]);
  return results[2]?.meta?.changes ?? 0;
}
