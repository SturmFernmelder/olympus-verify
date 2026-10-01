/**
 * .85 (1 Oct 2026): the officer digest and the coverage report, consolidation batch 7 of Codex's adapter map (the donor's
 * src/officer-digest.ts, src/officer-queue.ts and src/coverage.ts, frozen candidate manifest 296db2c8…), translated to
 * the keeper's own queue and roster state: no donor role job, no donor query, no new grant, no DM path, no new table.
 *
 * THE DIGEST. Once a day, after 15:00 UTC (the cron runs every half hour), the bot posts to the keeper's staff channel
 * (`staffChannel`: CHANNEL_MOD_ALERTS, else the review channel) HOW MANY things wait for an officer, as counts and nothing
 * else: invites queued or written, trial reviews due, departure items open, restriction cases due for review, private
 * requests open, character claims to review, dues weeks past their final review date; each only while its feature is on
 * (a feature that is off contributes nothing and is not mentioned). It names nobody and carries no mention, id, link or
 * timestamp. Every count is COUNT(*) over the module's own live predicate by the database clock; the dues count is by the
 * recorded contact dates alone (a week paid after its final contact still counts here; the ledger page shows its stage).
 * Delivery follows the donor's fenced discipline on the keeper's `site_settings` row `officer_digest`: a run claims a
 * five-minute lease by compare-and-set on the EXACT previous value, every later write compares the value this run last
 * wrote (a concurrent or superseded run changes nothing), the post's channel, nonce and text are frozen in the state
 * BEFORE the send, and a send whose outcome was never recorded (a crash between the frozen intent and the answer, a 5xx,
 * a network failure, an answer without an id) HALTS the digest: nothing is posted again automatically until an
 * administrator has checked the channel and resumed it (`POST /api/admin/community/digest/resume`, fenced and audited).
 * A definitive 4xx answer is a recorded outcome: no message exists, so the day is given up and tomorrow tries again.
 * Yesterday's digest is deleted before today's is posted (a definitive refusal to delete stops tracking it; 404 counts
 * as deleted); a transient failure waits ten minutes; at most three attempts a day. Switched off, or moved to another
 * channel, the bot deletes the digest it posted earlier before anything else. The audit row
 * (`community.officer_digest_posted` with the counts, `_failed` with the stage and a bounded status, `_removed`,
 * `_resumed` with the administrator) is written in the same batch as the state write and only when that write took
 * effect (`changes() = 1`); never an id, never free text. OFFICER_DIGEST_ENABLED = "true" switches the digest on.
 *
 * THE COVERAGE REPORT (`GET /api/admin/community/coverage`). For the officers' admin page: every character on the
 * keeper's LATEST roster export next to what the bot and the site know about the account bound to it (bound or not, a
 * member by the bot's own record, banned from verifying, signed in to the site, in the server, denied, under an active
 * restriction case). Read-only, no provider call, no enforcement; the cached facts are read in ONE admitted batch with the
 * roster rows. Whenever the denominator cannot be stated honestly (no export, an export older than seven days, more than
 * 2000 rows, a row count that does not match the export's member count) the report says `coverage: null` with the
 * reason, never a partial one. Not proof of Battle.net ownership and not a Discord role census (no privileged intent).
 *
 * .91 (Codex's .85 review, 1 Oct 07:06 UTC): the send and the delete go through `rest` with no in-library 429 retry (a 429 is a
 * definitive non-send: `transient`, the frozen intent cleared, ten minutes' wait; a retry inside a long `retry_after` could
 * otherwise post after another run reclaimed the lease and halted); the three-attempts cap bounds the off/moved cleanup too;
 * the cleanup of a switched-off or moved digest happens BEFORE the posting-hour gate (no early send); the resume's reads
 * (`not_halted`, `already_resumed`) are admitted reads; the coverage report's seven-day freshness and its `generatedAt` are
 * judged by the database clock inside the admitted batch.
 */
import type { Env } from "./env";
import { staffChannel } from "./env";
import { now } from "./db";
import { rest } from "./discord";
import { errorRef } from "./log";
import { apiJson, PAGE_VERSION, type SiteUser } from "./site-core";
import { admitted, admittedRead, communityFeatures, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, type CommunityContext, type CommunityFeature } from "./community-context";
import { secondsToIso } from "./community-time";

export const OFFICER_DIGEST_HOUR_UTC = 15; // 10:00 in Texas in summer, 09:00 in winter
export const DIGEST_LIMITS = { attemptsPerDay: 3, leaseSeconds: 5 * 60, retrySeconds: 10 * 60 } as const;
const STATE_KEY = "officer_digest";
const SNOWFLAKE = /^\d{17,20}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (at: number) => new Date(at * 1000).toISOString().slice(0, 10);

// ---------- the counts ----------
export interface DigestCounts {
  invitesWaiting: number;
  trialsDue: number | null;
  departuresOpen: number | null;
  casesReviewDue: number | null;
  privateRequestsOpen: number | null;
  claimsToReview: number | null;
  duesPastReview: number | null;
}
/** The seven counts, in this order; ?1 is the invocation's time where a stored date is compared with it, every lifetime is judged by the database clock (each module's own predicate, restated). */
const COUNTS: ReadonlyArray<{ key: keyof DigestCounts; feature: CommunityFeature | null; sql: string; binds: boolean }> = [
  { key: "invitesWaiting", feature: null, binds: false, sql: "SELECT COUNT(*) AS n FROM invite_queue WHERE status IN ('queued', 'written')" },
  { key: "trialsDue", feature: "trials", binds: true, sql: `SELECT COUNT(*) AS n FROM community_trials t WHERE t.status IN ('active', 'extended') AND t.review_due_at <= ?1 AND t.retain_until > ${DB_NOW}` },
  { key: "departuresOpen", feature: "departures", binds: false, sql: `SELECT COUNT(*) AS n FROM community_departure_reviews d WHERE d.status = 'open' AND d.retain_until > ${DB_NOW}` },
  { key: "casesReviewDue", feature: "restrictions", binds: true, sql: `SELECT COUNT(*) AS n FROM community_restriction_cases c WHERE c.resolved_at IS NULL AND c.appeal_status <> 'overturned' AND (c.category = 'ban' OR c.expires_at > ${DB_NOW}) AND (c.retain_until IS NULL OR c.retain_until > ${DB_NOW}) AND c.review_at <= ?1` },
  { key: "privateRequestsOpen", feature: "privacy_intake", binds: false, sql: `SELECT COUNT(*) AS n FROM community_privacy_cases c WHERE c.closed_at IS NULL AND c.retain_until > ${DB_NOW}` },
  { key: "claimsToReview", feature: "directory", binds: false, sql: "SELECT COUNT(*) AS n FROM community_alt_claims WHERE status = 'claimed'" },
  // the earliest recorded final contact plus the policy's review days has passed (the policy module's officer_review clock, by stored dates only)
  { key: "duesPastReview", feature: "contributions", binds: true, sql: `SELECT COUNT(*) AS n FROM community_contribution_obligations o JOIN community_contribution_policies p ON p.version = o.policy_version WHERE o.state = 'open' AND o.eligible = 1 AND o.final_notice_at IS NOT NULL AND COALESCE(MIN(o.final_acknowledged_at, o.final_officer_contact_at), o.final_acknowledged_at, o.final_officer_contact_at) + p.review_days * 86400 <= ?1 AND o.retain_until > ${DB_NOW}` },
];
export const countStatements = (env: Env, at: number): D1PreparedStatement[] => COUNTS.map((c) => (c.binds ? env.DB.prepare(c.sql).bind(at) : env.DB.prepare(c.sql)));
/** The counts from the statements' results, in order; a feature that is off reads as null whatever its rows say. */
export function countsFrom(env: Env, results: D1Result[]): DigestCounts {
  const f = communityFeatures(env);
  const n = (i: number) => (results[i]?.results[0] as { n?: number } | undefined)?.n ?? 0;
  const gated = (i: number) => (COUNTS[i].feature !== null && !f.has(COUNTS[i].feature) ? null : n(i));
  return { invitesWaiting: n(0), trialsDue: gated(1), departuresOpen: gated(2), casesReviewDue: gated(3), privateRequestsOpen: gated(4), claimsToReview: gated(5), duesPastReview: gated(6) };
}
export async function digestCounts(env: Env, at = now()): Promise<DigestCounts> {
  return countsFrom(env, await env.DB.batch(countStatements(env, at)));
}

/** The digest text: counts only, far under Discord's 2,000 characters, no mention, no id, no link, no date. */
export function digestContent(c: DigestCounts): string {
  const some = (n: number | null, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : []);
  const parts = [
    ...some(c.invitesWaiting, "invite is queued or written", "invites are queued or written"),
    ...some(c.trialsDue, "trial review is due", "trial reviews are due"),
    ...some(c.departuresOpen, "departure item is open", "departure items are open"),
    ...some(c.casesReviewDue, "restriction case is due for review", "restriction cases are due for review"),
    ...some(c.privateRequestsOpen, "private request is open", "private requests are open"),
    ...some(c.claimsToReview, "character claim waits for review", "character claims wait for review"),
    ...some(c.duesPastReview, "dues week has passed its final review date", "dues weeks have passed their final review date"),
  ];
  if (parts.length === 0) return "**Officer digest:** nothing is waiting for an officer today.";
  return `**Officer digest:** ${parts.join("; ")}. Review on the site's admin pages.`;
}

// ---------- the fenced state ----------
interface DigestState {
  day: string | null; // the UTC day the state is about
  outcome: string; // a fixed word: never | posted | refused | transient | uncertain | cleaned_up | resumed | unreadable
  attempts: number; // this day's attempts
  final: boolean; // nothing more to do today
  notBefore: number; // a transient failure's wait
  lease: { token: string; until: number } | null;
  posted: { channelId: string; messageId: string; day: string } | null; // the digest currently in the channel
  intent: { channelId: string; nonce: string; content: string; day: string; startedAt: number } | null; // frozen before the send
  halted: boolean;
}
const EMPTY: DigestState = { day: null, outcome: "never", attempts: 0, final: false, notBefore: 0, lease: null, posted: null, intent: null, halted: false };
const KEYS = ["day", "outcome", "attempts", "final", "notBefore", "lease", "posted", "intent", "halted"];
const nonNegative = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && SNOWFLAKE.test(v);
const day = (v: unknown): v is string => typeof v === "string" && DAY_RE.test(v);
/** Only a complete, well-typed state unlocks anything; any other stored value reads as HALTED until an administrator resumes. */
function parse(raw: string | null): DigestState {
  if (raw === null) return { ...EMPTY };
  const unreadable: DigestState = { ...EMPTY, outcome: "unreadable", halted: true };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return unreadable;
  }
  if (!object(v) || !KEYS.every((k) => Object.hasOwn(v, k))) return unreadable;
  const { day: d, outcome, attempts, final, notBefore, lease, posted, intent, halted } = v;
  if (!(d === null || day(d)) || !text(outcome, 40) || !nonNegative(attempts) || typeof final !== "boolean" || !nonNegative(notBefore) || typeof halted !== "boolean") return unreadable;
  if (!(lease === null || (object(lease) && text(lease.token, 64) && nonNegative(lease.until)))) return unreadable;
  if (!(posted === null || (object(posted) && id(posted.channelId) && id(posted.messageId) && day(posted.day)))) return unreadable;
  if (!(intent === null || (object(intent) && id(intent.channelId) && text(intent.nonce, 25) && text(intent.content, 2000) && day(intent.day) && nonNegative(intent.startedAt)))) return unreadable;
  return { day: d, outcome, attempts, final, notBefore, halted, lease: lease as DigestState["lease"], posted: posted as DigestState["posted"], intent: intent as DigestState["intent"] };
}
const readRaw = async (env: Env) => (await env.DB.prepare("SELECT value FROM site_settings WHERE key = ?1").bind(STATE_KEY).first<{ value: string }>())?.value ?? null;
export const readDigestState = async (env: Env): Promise<DigestState> => parse(await readRaw(env));
/** Compare-and-set on the exact previous value: a concurrent or superseded run changes nothing. */
const casStatement = (env: Env, prev: string | null, next: DigestState, at: number) =>
  prev === null
    ? env.DB.prepare("INSERT OR IGNORE INTO site_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, NULL)").bind(STATE_KEY, JSON.stringify(next), at)
    : env.DB.prepare("UPDATE site_settings SET value = ?3, updated_at = ?4 WHERE key = ?1 AND value = ?2").bind(STATE_KEY, prev, JSON.stringify(next), at);
/** The audit row applies only when the compare-and-set just before it in the batch wrote its row (changes() = 1); fixed words, counts and a bounded status only. */
const auditStatement = (env: Env, at: number, action: string, detail: Record<string, unknown>) =>
  env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, 'cron', ?2, NULL, ?3 WHERE changes() = 1").bind(at, action, JSON.stringify(detail));
const boundedStatus = (e: unknown): number | null => {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" && Number.isInteger(s) && s >= 100 && s <= 599 ? s : null;
};
const definitive = (status: number | null) => status !== null && status >= 400 && status < 500 && status !== 429;

export const digestEnabled = (env: Env): boolean => env.OFFICER_DIGEST_ENABLED === "true" && SNOWFLAKE.test(staffChannel(env));
export type DigestOutcome = "off" | "not_due" | "done_today" | "waiting" | "busy" | "superseded" | "halted" | "posted" | "transient" | "uncertain" | "refused" | "cleaned_up";

/** One cron attempt (every half hour). `at` is the invocation's time, in seconds. */
export async function runOfficerDigest(env: Env, at = now()): Promise<DigestOutcome> {
  const on = digestEnabled(env);
  const channel = staffChannel(env);
  let raw = await readRaw(env);
  let st = parse(raw);
  if (!on && !st.posted) return "off"; // nothing to post and nothing of ours in a channel
  if (st.halted) return "halted";
  const today = dayOf(at);
  const needsCleanup = st.posted !== null && (!on || st.posted.channelId !== channel);
  const due = !on || new Date(at * 1000).getUTCHours() >= OFFICER_DIGEST_HOUR_UTC;
  // .91 (2): the attempts cap bounds every kind of attempt today, the cleanup included
  if (st.day === today && st.attempts >= DIGEST_LIMITS.attemptsPerDay) return "done_today";
  if (on && !needsCleanup && st.day === today && st.final) return "done_today";
  if (!needsCleanup && !due) return "not_due"; // .91 (3): a tracked post in the wrong place is cleaned up whatever the hour; a new post waits for it
  if (st.notBefore > at) return "waiting";
  if (st.lease && st.lease.until > at) return "busy";
  const write = async (next: DigestState, auditRow?: [string, Record<string, unknown>]) => {
    const [res] = await env.DB.batch([casStatement(env, raw, next, at), ...(auditRow ? [auditStatement(env, at, auditRow[0], auditRow[1])] : [])]);
    if ((res?.meta.changes ?? 0) !== 1) return false;
    raw = JSON.stringify(next);
    st = next;
    return true;
  };
  if (!(await write({ ...st, lease: { token: randomToken(), until: at + DIGEST_LIMITS.leaseSeconds } }))) return "busy";
  const attempts = st.day === today ? st.attempts : 0;
  const auditAction = (outcome: DigestOutcome) => (outcome === "posted" ? "community.officer_digest_posted" : outcome === "cleaned_up" ? "community.officer_digest_removed" : "community.officer_digest_failed");
  const settle = async (outcome: DigestOutcome, patch: Partial<DigestState>, detail?: Record<string, unknown>): Promise<DigestOutcome> =>
    (await write({ ...st, day: today, outcome, attempts: attempts + 1, final: false, notBefore: 0, lease: null, ...patch }, detail ? [auditAction(outcome), { outcome, ...detail }] : undefined)) ? outcome : "superseded";
  // a post whose outcome was never recorded (a crash between the frozen intent and the answer) is never sent again automatically
  if (st.intent) return settle("uncertain", { halted: true, final: true }, { stage: "post", status: null });
  const remove = async (posted: NonNullable<DigestState["posted"]>): Promise<"removed" | "transient" | "refused"> => {
    try {
      // .91 (1): attempt 1 = no in-library wait-and-retry on 429; a 429 is transient here, and this run waits ten minutes like any other transient failure
      await rest(env, "DELETE", `/channels/${posted.channelId}/messages/${posted.messageId}`, undefined, 1, "officer_digest_remove");
      return "removed";
    } catch (e) {
      const status = boundedStatus(e);
      if (status === 404) return "removed";
      if (!definitive(status)) console.error("officer digest delete failed", errorRef(e));
      return definitive(status) ? "refused" : "transient";
    }
  };
  // switched off or moved: delete the digest where it was posted before anything else
  if (needsCleanup && st.posted) {
    const r = await remove(st.posted);
    if (r === "transient") return settle("transient", { notBefore: at + DIGEST_LIMITS.retrySeconds });
    if (!on) return settle(r === "refused" ? "refused" : "cleaned_up", { posted: null, final: true }, r === "refused" ? { stage: "cleanup" } : {});
    // .97 (Codex's review of .91, 08:40): before the posting hour this cleanup IS the invocation's attempt: counted against the
    // day's cap like every other attempt, the lease released, the post untracked, nothing posted yet (not_due); the post follows at the hour
    if (!due) {
      const row: [string, Record<string, unknown>] = r === "refused" ? ["community.officer_digest_failed", { outcome: "refused", stage: "cleanup" }] : ["community.officer_digest_removed", { outcome: "cleaned_up", stage: "cleanup" }];
      return (await write({ ...st, day: today, outcome: r === "refused" ? "refused" : "cleaned_up", attempts: attempts + 1, final: false, notBefore: 0, lease: null, posted: null }, row)) ? "not_due" : "superseded";
    }
    if (!(await write({ ...st, posted: null }, r === "refused" ? ["community.officer_digest_failed", { outcome: "refused", stage: "cleanup" }] : undefined))) return "superseded";
  }
  if (!on) return "off";
  // yesterday's digest goes before today's
  if (st.posted && st.posted.day !== today) {
    const r = await remove(st.posted);
    if (r === "transient") return settle("transient", { notBefore: at + DIGEST_LIMITS.retrySeconds });
    if (!(await write({ ...st, posted: null }, r === "refused" ? ["community.officer_digest_failed", { outcome: "refused", stage: "delete" }] : undefined))) return "superseded";
  }
  const counts = await digestCounts(env, at);
  const content = digestContent(counts);
  const intent = { channelId: channel, nonce: `od${today.replaceAll("-", "")}${randomToken().slice(0, 12)}`, content, day: today, startedAt: at };
  if (!(await write({ ...st, intent }))) return "superseded";
  try {
    // .91 (1): attempt 1 = no in-library wait-and-retry on 429, so no send can happen after this run's lease has lapsed and another run halted on the frozen intent
    const answer = (await rest(env, "POST", `/channels/${channel}/messages`, { content, allowed_mentions: { parse: [] }, nonce: intent.nonce, enforce_nonce: true }, 1)) as { id?: unknown } | undefined;
    const messageId = answer?.id;
    if (!id(messageId)) return settle("uncertain", { halted: true, final: true }, { stage: "post", status: null }); // an answer we cannot read is not a result
    return settle("posted", { posted: { channelId: channel, messageId, day: today }, intent: null, final: true }, { counts });
  } catch (e) {
    const status = boundedStatus(e);
    console.error("officer digest post failed", errorRef(e));
    if (status === 429) return settle("transient", { intent: null, notBefore: at + DIGEST_LIMITS.retrySeconds }, { stage: "post", status }); // .91 (1): rate-limited = not sent; try again later from a fresh state
    if (definitive(status)) return settle("refused", { intent: null, final: true }, { stage: "post", status }); // Discord answered: no message exists
    // the request may still have created the message: halt with the frozen intent kept
    return settle("uncertain", { halted: true, final: true }, { stage: "post", status });
  }
}

/** GET /api/admin/community/digest: the counts now, the preview and the digest's state, in one admitted read (never an id, never a failure's text). */
export async function digestStatus(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const at = now();
  const out = await admittedRead(env, ctx, "applicantWrite", [...countStatements(env, at), env.DB.prepare("SELECT value FROM site_settings WHERE key = ?1").bind(STATE_KEY)]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const counts = countsFrom(env, out);
  const st = parse((out[COUNTS.length]?.results[0] as { value?: string } | undefined)?.value ?? null);
  return apiJson({
    enabled: digestEnabled(env),
    channelConfigured: SNOWFLAKE.test(staffChannel(env)),
    postsAfterUtcHour: OFFICER_DIGEST_HOUR_UTC,
    counts,
    preview: digestContent(counts),
    state: { day: st.day, outcome: st.outcome, attempts: st.attempts, halted: st.halted, postedDay: st.posted?.day ?? null, waitingUntil: st.notBefore > at ? secondsToIso(st.notBefore) : null },
  });
}

/** POST /api/admin/community/digest/resume: the administrator has checked the channel (and removed a duplicate by hand); today is given up, tomorrow posts again. Fenced, compare-and-set, audited. */
export async function resumeDigest(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser): Promise<Response> {
  if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409);
  if (!ctx.subject) return refusal(env, request, "applicantWrite");
  // .91 (4): the state is read under the administrator's admission (a denied, departed, re-versioned or expired administrator learns nothing)
  const stateStmt = () => env.DB.prepare("SELECT value FROM site_settings WHERE key = ?1").bind(STATE_KEY);
  const first = await admittedRead(env, ctx, "applicantWrite", [stateStmt()]);
  if (first === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const raw = (first[0]?.results[0] as { value?: string } | undefined)?.value ?? null;
  const st = parse(raw);
  if (raw === null || !st.halted) return apiJson({ ok: true, resumed: false, reason: "not_halted" });
  const at = now();
  const next: DigestState = { ...st, day: dayOf(at), outcome: "resumed", final: true, notBefore: 0, lease: null, intent: null, halted: false };
  // ?1 key, ?2 the exact value read, ?3 the next value, ?4 now, ?5 the admin (also the fence's id), ?6 session version, ?7 expiry: the state write and its audit row only while the admin's fence holds
  const out = await admitted(env, ctx, [
    env.DB.prepare(`UPDATE site_settings SET value = ?3, updated_at = ?4, updated_by = ?5 WHERE key = ?1 AND value = ?2 AND ${fenceSql("applicantWrite", 5, 6, 7)}`).bind(STATE_KEY, raw, JSON.stringify(next), at, admin.discord_id, ctx.subject.sessionVersion, ctx.subject.expiresAt),
    env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, ?2, 'community.officer_digest_resumed', NULL, ?3 WHERE changes() = 1").bind(at, admin.discord_id, JSON.stringify({ from: st.outcome })),
  ]);
  if (out === FENCE_REFUSED) {
    const again = await admittedRead(env, ctx, "applicantWrite", [stateStmt()]); // .91 (4): the lost-CAS explanation is an admitted read too
    if (again === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!parse((again[0]?.results[0] as { value?: string } | undefined)?.value ?? null).halted) return apiJson({ ok: true, resumed: false, reason: "already_resumed" });
    return refusal(env, request, "applicantWrite");
  }
  return apiJson({ ok: true, resumed: true });
}

// ---------- the coverage report ----------
export const COVERAGE_MAX_ROWS = 2000;
export const COVERAGE_STALE_S = 7 * 86400;
export const COVERAGE_LIMITATIONS = [
  "Only the bot's own binding of a character to a Discord account counts (an in-game whisper or mail proved it); it is not proof of Battle.net ownership.",
  "Discord role holders cannot be listed without the GUILD_MEMBERS privileged intent, so people holding a role without being on the roster are not shown.",
  "The site's facts (signed in, in the server, denied) are cached observations read in one batch with the roster; nothing is fetched for this report.",
  "The report is not authorization to remove anyone; the officers decide, through the bot's own actions.",
] as const;
export type CoverageClass = "unbound" | "bound_not_member" | "banned" | "no_site_account" | "not_in_server" | "denied" | "restricted" | "covered";
export type CoverageUnavailable = "no_export" | "stale" | "too_large" | "count_mismatch";
type CoverageRow = { name_key: string; name: string; rank: string | null; class: string | null; last_online: number | null; discord_id: string | null; binding: string | null; in_server: number | null; denied: number | null; site_id: string | null; banned: number | null; restricted: number };
type Snapshot = { id: number; exported_at: number; received_at: number; member_count: number };

const classify = (r: CoverageRow): CoverageClass => {
  if (!r.discord_id || r.binding === "unbound") return "unbound";
  if (r.binding !== "member") return "bound_not_member"; // pending, verified, queued, left_pending, left: bound, but not a member by the bot's record
  if (r.banned === 1) return "banned";
  if (!r.site_id) return "no_site_account";
  if (r.in_server !== 1) return "not_in_server";
  if (r.denied === 1) return "denied";
  if (r.restricted === 1) return "restricted";
  return "covered";
};

/** GET /api/admin/community/coverage: the latest roster export next to the bot's and the site's cached facts; `coverage: null` with a reason when the denominator cannot be stated. */
export async function coverageReport(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  // .91 (5): the clock, the snapshot's freshness and the rows are one admitted acquisition at the database's own time;
  // .97 (Codex's review of .91, 08:40): the selected baseline is older-than-seven-days: exactly seven days is still fresh
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(`SELECT ${DB_NOW} AS at`),
    env.DB.prepare(`SELECT id, exported_at, received_at, member_count, (exported_at >= ${DB_NOW} - ${COVERAGE_STALE_S}) AS fresh FROM roster_snapshots ORDER BY id DESC LIMIT 1`),
    env.DB.prepare(
      `SELECT m.name_key, m.name, m.rank, m.class, m.last_online, c.discord_id, c.status AS binding, u.in_server, u.denied, u.discord_id AS site_id, mb.banned,
              EXISTS (SELECT 1 FROM community_restriction_cases r WHERE r.discord_id = c.discord_id AND r.resolved_at IS NULL AND r.appeal_status <> 'overturned' AND (r.category = 'ban' OR r.expires_at > ${DB_NOW}) AND (r.retain_until IS NULL OR r.retain_until > ${DB_NOW})) AS restricted
       FROM roster_members m
       LEFT JOIN characters c ON c.name_key = m.name_key
       LEFT JOIN members mb ON mb.discord_id = c.discord_id
       LEFT JOIN site_users u ON u.discord_id = c.discord_id
       WHERE m.snapshot_id = (SELECT id FROM roster_snapshots ORDER BY id DESC LIMIT 1)
       ORDER BY m.name_key LIMIT ?1`,
    ).bind(COVERAGE_MAX_ROWS + 1),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const at = (out[0]?.results[0] as { at: number }).at;
  const snap = out[1]?.results[0] as (Snapshot & { fresh: number }) | undefined;
  const rows = (out[2]?.results ?? []) as CoverageRow[];
  const base = {
    generatedAt: secondsToIso(at),
    explanation: "Cached facts the bot and the site hold, next to the latest roster export. Not proof of Battle.net ownership and not a Discord role census.",
    limitations: COVERAGE_LIMITATIONS,
    snapshot: snap ? { exportedAt: secondsToIso(snap.exported_at), receivedAt: secondsToIso(snap.received_at), memberCount: snap.member_count, rowsPresent: Math.min(rows.length, COVERAGE_MAX_ROWS) } : null,
  };
  const unavailable = (reason: CoverageUnavailable) => apiJson({ ...base, unavailableReason: reason, coverage: null });
  if (!snap) return unavailable("no_export");
  if (snap.fresh !== 1) return unavailable("stale"); // judged by the database clock in the same acquisition
  if (rows.length > COVERAGE_MAX_ROWS) return unavailable("too_large");
  if (rows.length !== snap.member_count) return unavailable("count_mismatch");
  const totals: Partial<Record<CoverageClass, number>> = {};
  const people = new Map<string, { discordId: string; characters: { name: string; class: CoverageClass }[] }>();
  const entries = rows.map((r) => {
    const cls = classify(r);
    totals[cls] = (totals[cls] ?? 0) + 1;
    if (r.discord_id && cls !== "unbound") {
      const p = people.get(r.discord_id) ?? { discordId: r.discord_id, characters: [] };
      p.characters.push({ name: r.name, class: cls });
      people.set(r.discord_id, p);
    }
    return { name: r.name, rank: r.rank, gameClass: r.class, lastOnline: r.last_online === null ? null : secondsToIso(r.last_online), discordId: cls === "unbound" ? null : r.discord_id, class: cls };
  });
  return apiJson({
    ...base,
    unavailableReason: null,
    coverage: { rosterRows: rows.length, boundRows: entries.filter((e) => e.class !== "unbound").length, distinctPeople: people.size, totals, people: [...people.values()], entries },
  });
}
