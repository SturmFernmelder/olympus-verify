/**
 * News: Viktor's request (2 Oct 2026, item A), build .115. A members' page under Community -> News that says what is
 * going on in the guild, and short notices the site's administrators post for the whole guild.
 *
 * - Confirmed members only (the community pages' `confirmedGuildData`, read behind the reader boundary `admittedRead`),
 *   and only while SiteSettings.newsOn is on. It is off by default and switched in Admin -> Settings; while it is off
 *   the page answers news_off, no notice can be posted and the figures are not computed. Nothing reaches /api/public
 *   but that one boolean.
 * - Automatic items are counts and times, never names: the seat state (guild-seats.ts memberSeats, times on the hour),
 *   joined and left counts between complete and trusted roster exports only, application counts masked below 5 and
 *   named for what they count, the next scheduled events (title and time only), when the leadership directory last
 *   changed (never its names), the beta's dates and the site's release notes. No officer-digest state: the owner's daily
 *   issue stays private (task log, 2 Oct 23:41 UTC). One exception the policy states (review of 3 Oct 2026): an event's
 *   title is free text its organizer wrote (community-events.ts, 1 to 80 characters), the same title confirmed members
 *   already see on the Calendar, so News passes it on as the organizer gave it and the policy's "never a name" covers the
 *   counts and times only.
 * - Notices are plain text (the page renders them through textContent) and live 1 to 90 days, judged by the database
 *   clock in every read and write; the cron then deletes them. A create is an operation under an id the server handed
 *   the page (adminList) with the database's time in it. Its row in site_news_ops, the tombstone, is kept 120 days from
 *   the create and never removed while the notice exists; it is not kept for ever. So the id itself expires: a create
 *   is accepted only within 30 days of the id being handed out, and the record outlives that window (Codex's finding 5,
 *   3 Oct 2026 13:15 UTC). That is the real boundary: a stale "Retry the same" either meets the record or is refused for
 *   its age, so it cannot post a deleted or expired notice again. A replay re-checks that its author is still staff.
 * - The dated log records counts only. No audit row ever holds a title or a body.
 * - A site-* module on the community primitives (the write fence, the nonce, the erasure and export registry) with site_*
 *   tables, because it is site content kept by SITE_ADMINS, like site-leadership.ts (docs/design.md, .115).
 *
 * Seconds everywhere (db.ts now()); the account copy converts to ISO-8601 at its boundary (community-time.ts).
 */
import type { Env } from "./env";
import { audit, linksNotBefore, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, type SiteUser } from "./site-core";
import { cleanText, loadSettings, settingsFrom } from "./site-data";
import { admitted, admittedRead, communityContext, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { secondsToIso } from "./community-time";
import { hourOf, memberSeats, seatsFrom, seatsPlan } from "./guild-seats";
import { leadershipStampStatement } from "./site-leadership";
import { errorRef } from "./log";

export const NEWS_LIMITS = {
  titleMax: 80,
  bodyMax: 2000,
  liveMax: 20,
  days: [1, 3, 7, 14, 30, 60, 90],
  defaultDays: 30,
  opsKeepS: 120 * 86400, // how long an operation record (the tombstone) is kept from the create: longer than any notice lives
  // How long an operation id the server handed out may still create a notice (Codex's finding 5, 3 Oct 2026). Shorter
  // than opsKeepS: a create is never earlier than its id, so every create still accepted meets the record of an earlier
  // one, and an id whose record the cleanup could have removed is refused for its age.
  opIssueMaxAgeS: 30 * 86400,
  eventsDays: 14,
  eventsMax: 5,
  figuresEveryS: 3 * 3600, // at most eight computing runs a day, and only while News is on
  readsPerMin: 30,
  writesPerMin: 20,
} as const;
/** Blizzard names 21 October 2026 as the beta's last full day, and no hour (site-leadership.ts). */
export const BETA_LAST_FULL_DAY = "2026-10-21";
/** The cron's cached figures: counts and the snapshot ids they were computed from. The ids are never sent. */
export const FIGURES_KEY = "newsFigures";

export interface ReleaseNote {
  build: string;
  date: string;
  lines: readonly string[];
}
/**
 * What changed on the site, newest first, in plain words for members: no personal names, lines of at most 200
 * characters. site_news_test checks that the newest entry is never newer than index.ts BUILD; the entry for a build is
 * added in the commit that moves BUILD to it.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    build: ".133",
    date: "2026-10-10",
    lines: [
      "Staff site-data deletion now finishes together with its audit record, so a failed step does not leave a partial cleanup.",
      "If completion cannot be confirmed, the site asks staff to inspect the account and audit record before trying again.",
      "This improves the existing site-only action. Complete account erasure and the proposed safety marker remain unavailable.",
    ],
  },
  {
    build: ".132",
    date: "2026-10-10",
    lines: [
      "Home and the guild guides use one checked current-beta identity. The full-release identity switch remains unavailable.",
      "Governance includes the reviewed 40-page draft PDF and its download package. These documents issue no appointments.",
      "Event organizers can preview, publish, reconcile and remove a Discord announcement. Automatic announcements and reminders remain off.",
    ],
  },
  {
    build: ".128",
    date: "2026-10-09",
    lines: [
      "The public Governance page contains the complete draft charter, search, chapter links and the adoption and appointment templates.",
      "Organization explains the proposed offices, ten guild ranks and all 95 requested role labels. Publication makes no appointments.",
    ],
  },
  {
    build: ".126",
    date: "2026-10-09",
    lines: [
      "Calendar edits keep the saved start time. At a repeated clock-change hour, choose the earlier or later occurrence for a new time.",
      "Calendar forms show the exact start in UTC and let you enter UTC directly. Times skipped by a clock change are refused.",
    ],
  },
  {
    build: ".115",
    date: "2026-10-03",
    lines: [
      "Community → News: notices from the administrators, the guild in figures and what is coming up, for confirmed members once the administrators switch it on.",
      "Home, Apply and /verify-status say plainly when Olympus I is full, from the officers' latest roster export, and show your own place in line.",
      "Administrators confirm that each person they name agreed to be named, and remove a name on request by typing Name withheld in its place.",
      "The privacy policy and terms describe News, a full guild, typed names and the backups.",
    ],
  },
  {
    build: ".114",
    date: "2026-10-02",
    lines: [
      "Community → Leadership lists the Guild Master and officers of Olympus I to Olympus X for confirmed members.",
      "The top bar shows your own Discord picture again.",
      "People search shows every name a member goes by: server nickname, display name and username.",
      "Battle.net sign-in is switched off. Verifying with the in-game whisper code works as before.",
      "A rename Blizzard requires asks the member to verify the new name and apply again; an ordinary rename keeps the link.",
    ],
  },
];

const ID = /^[A-Za-z0-9_-]{22}$/;
const DAY_S = 86400;
const LIVE = `retain_until > ${DB_NOW}`;
// The same reading of the stored switch as site-data.ts settingsFrom (bool): '1' or 'true' is on, anything else or no row is off.
const NEWS_ON_SQL = "(SELECT value FROM site_settings WHERE key = 'newsOn') IN ('1', 'true')";
const ADMIN_COLUMNS = "SELECT id, title, body, revision, created_by, updated_by, created_at, updated_at, retain_until FROM site_news_notices";

type NoticeRow = { id: string; title: string; body: string; revision: number; created_at: number; updated_at: number; retain_until: number };
type AdminRow = NoticeRow & { created_by: string | null; updated_by: string | null };
const rowsOf = <T>(r: D1Result<unknown> | undefined): T[] => ((r?.results ?? []) as T[]);
// Members get no id (review of 3 Oct 2026): a notice's id is its operation id, whose first eight characters are the
// database second at which an administrator opened Admin -> News, and the staff-activity times members see are on the
// hour. The members' page reads only the title, the text and the three times (app.js communityNews), so nothing is lost;
// the staff views and the administrator's own copy keep the id.
const memberNotice = (r: NoticeRow) => ({ title: r.title, body: r.body, postedAt: r.created_at, editedAt: r.revision > 1 ? r.updated_at : null, until: r.retain_until });
const adminNotice = (r: AdminRow) => ({ id: r.id, ...memberNotice(r), revision: r.revision, createdBy: r.created_by, updatedBy: r.updated_by });
const newsOnFrom = (env: Env, value: string | null | undefined) => settingsFrom(env, typeof value === "string" ? [{ key: "newsOn", value }] : []).newsOn;

// A new notice's operation id (Codex's finding 5, 3 Oct 2026): 22 base64url characters, the first eight the database's
// time when the server handed it out (48 bits, most significant first), then fourteen random ones. The id still matches
// ID, so the tables and every other path are unchanged.
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function newOpId(dbNow: number): string {
  let head = "";
  for (let k = 7; k >= 0; k--) head += B64URL[Math.floor(dbNow / 64 ** k) % 64];
  return head + randomToken().slice(0, 14);
}
/**
 * The time in an operation id that matches ID. The prefix is not signed (review of 3 Oct 2026): it bounds a FIXED id, a
 * stale "Retry the same" whose form was opened more than opIssueMaxAgeS ago, and proves nothing about where an id came
 * from. A staff client that builds an id with the current time in it behaves exactly like a fresh form on this staff-only
 * route, which is harmless: such an id has no record yet, so it can only post a new notice, and its own record then guards
 * it like any other.
 */
function opIssuedAt(id: string): number {
  let t = 0;
  for (const c of id.slice(0, 8)) t = t * 64 + B64URL.indexOf(c);
  return t;
}

// ---------- the members' page ----------

type Masked = number | "few";
interface RosterWindow { joined: number; left: number }
interface AppWindow { firstSaved: Masked; decided: Masked }
interface StoredFigures {
  v: 1;
  asOf: number;
  latestId: number;
  dayBaseId: number | null;
  weekBaseId: number | null;
  countingSince: number | null;
  roster: { day: RosterWindow | null; week: RosterWindow | null };
  applications: { day: AppWindow; week: AppWindow };
}

const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const idOrNull = (v: unknown): v is number | null => v === null || (Number.isSafeInteger(v) && (v as number) > 0);
const masked = (v: unknown): v is Masked => v === "few" || (count(v) && (v === 0 || (v as number) >= 5));
const rosterWindow = (v: unknown): v is RosterWindow | null => v === null || (!!v && typeof v === "object" && count((v as RosterWindow).joined) && count((v as RosterWindow).left));
const appWindow = (v: unknown): v is AppWindow => !!v && typeof v === "object" && masked((v as AppWindow).firstSaved) && masked((v as AppWindow).decided);

/** The stored figures, only when every field has its shape; anything else reads as none (the page then shows no figures). */
function parseFigures(raw: string | null | undefined): StoredFigures | null {
  if (typeof raw !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const f = v as StoredFigures;
  if (!f || typeof f !== "object" || f.v !== 1 || !count(f.asOf) || !Number.isSafeInteger(f.latestId) || f.latestId <= 0) return null;
  if (!idOrNull(f.dayBaseId) || !idOrNull(f.weekBaseId) || !(f.countingSince === null || count(f.countingSince))) return null;
  if (!f.roster || !rosterWindow(f.roster.day) || !rosterWindow(f.roster.week)) return null;
  if (!f.applications || !appWindow(f.applications.day) || !appWindow(f.applications.week)) return null;
  return f;
}

/** What members see of the figures: an explicitly built object, never the stored row (no snapshot ids). The counting start is on the hour, like every roster time shown to members. */
function figuresDto(f: StoredFigures | null) {
  if (!f) return null;
  const rw = (w: RosterWindow | null) => (w === null ? null : { joined: w.joined, left: w.left });
  const aw = (w: AppWindow) => ({ firstSaved: w.firstSaved, decided: w.decided });
  return {
    asOf: f.asOf,
    countingSince: f.countingSince === null ? null : hourOf(f.countingSince),
    roster: { day: rw(f.roster.day), week: rw(f.roster.week) },
    applications: { day: aw(f.applications.day), week: aw(f.applications.week) },
  };
}

/**
 * GET /api/news: confirmed members, while News is on. One admitted batch: the switch again, the live notices, the seat
 * state, the cached figures, the directory's last change (on the hour) and (with the events feature) the next scheduled
 * events. Seconds throughout.
 */
export async function newsPage(request: Request, env: Env): Promise<Response> {
  const ctx = await communityContext(env, request);
  if (ctx.subject && rateLimited(`nr:${ctx.subject.discordId}`, NEWS_LIMITS.readsPerMin, 60)) {
    return apiJson({ error: "slow_down", message: "Too many pages in one minute. Wait a moment, then carry on." }, 429);
  }
  const settings = await loadSettings(env);
  if (!settings.newsOn) return apiJson({ error: "news_off", message: "The News page is switched off." }, 404);
  const at = now();
  const seats = seatsPlan(env, at); // no account: the guild's state only, never anyone's place
  const withEvents = ctx.features.has("events");
  // The switch is judged again inside the admitted batch (review of 3 Oct 2026), as every write judges it inside its
  // statement: a page read racing an administrator switching News off gets news_off, never the payload. The read above
  // stays for launchAt and to spare the batch while News is off.
  const out = await admittedRead(env, ctx, "confirmedGuildData", [
    env.DB.prepare(`SELECT (${NEWS_ON_SQL}) AS news_on`),
    env.DB.prepare(`SELECT id, title, body, revision, created_at, updated_at, retain_until FROM site_news_notices WHERE ${LIVE} ORDER BY created_at DESC, id LIMIT ${NEWS_LIMITS.liveMax}`),
    ...seats.statements,
    env.DB.prepare("SELECT value FROM site_settings WHERE key = ?1").bind(FIGURES_KEY),
    leadershipStampStatement(env),
    // title and time only: never the creator, the details, the capacity or the sign-ups
    ...(withEvents
      ? [env.DB.prepare(`SELECT id, title, starts_at, duration_min FROM community_events WHERE status = 'scheduled' AND starts_at > ?1 AND starts_at < ?2 ORDER BY starts_at, id LIMIT ${NEWS_LIMITS.eventsMax}`).bind(at, at + NEWS_LIMITS.eventsDays * DAY_S)]
      : []),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  if (rowsOf<{ news_on: number }>(out[0])[0]?.news_on !== 1) return apiJson({ error: "news_off", message: "The News page is switched off." }, 404);
  const k = seats.statements.length;
  const shaped = seats.shape(out.slice(2, 2 + k));
  const figures = rowsOf<{ value: string }>(out[2 + k])[0]?.value ?? null;
  const stamp = rowsOf<{ updated_at: number }>(out[3 + k])[0]?.updated_at ?? null;
  return apiJson({
    now: at,
    notices: rowsOf<NoticeRow>(out[1]).map(memberNotice),
    seats: memberSeats(env, shaped.seats),
    figures: figuresDto(parseFigures(figures)),
    events: withEvents ? rowsOf<{ id: string; title: string; starts_at: number; duration_min: number }>(out[4 + k]).map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, durationMin: e.duration_min })) : null,
    // on the hour, like every staff-activity time members see (review of 3 Oct 2026): the exact second would say when an
    // administrator saved the directory; the page shows the day
    leadership: { updatedAt: typeof stamp === "number" ? hourOf(stamp) : null },
    beta: { lastFullDay: BETA_LAST_FULL_DAY, launchAt: settings.launchAt },
    releases: RELEASE_NOTES.slice(0, 5),
  });
}

// ---------- the administrators' side ----------

type Valid = { title: string; text: string; days: number };
const invalid = (field: string, message: string) => apiJson({ error: "invalid", field, message }, 400);
const exactKeys = (body: Record<string, unknown>, keys: readonly string[]) => {
  const got = Object.keys(body);
  return got.length === keys.length && keys.every((k) => Object.hasOwn(body, k));
};
const charCount = (s: string) => Array.from(s).length;

/** The fields of a notice, cleaned (control characters out, newlines kept in the body) and checked; nothing is ever cut. */
function noticeValues(body: Record<string, unknown>): Valid | Response {
  if (typeof body.title !== "string") return invalid("title", "The notice needs a title.");
  const title = cleanText(body.title, NEWS_LIMITS.titleMax + 1);
  if (!title || charCount(title) > NEWS_LIMITS.titleMax) return invalid("title", `The title needs 1 to ${NEWS_LIMITS.titleMax} characters.`);
  if (typeof body.body !== "string") return invalid("body", "The notice needs some text.");
  const text = cleanText(body.body, NEWS_LIMITS.bodyMax + 1, true);
  if (!text || charCount(text) > NEWS_LIMITS.bodyMax) return invalid("body", `The text needs 1 to ${NEWS_LIMITS.bodyMax} characters.`);
  const days = body.days;
  if (typeof days !== "number" || !Number.isInteger(days) || !(NEWS_LIMITS.days as readonly number[]).includes(days)) {
    return invalid("days", `A notice is shown for ${NEWS_LIMITS.days.join(", ")} days.`);
  }
  return { title, text, days };
}

async function opHash(v: Valid): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["news-create-v1", v.title, v.text, v.days])));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The audit row of a notice write, applied only when the batch's first statement stored this write's nonce: the operation and how many notices are live, never a title or a body. */
const auditIfWritten = (env: Env, id: string, nonce: string, me: string, op: "created" | "edited" | "deleted") =>
  env.DB.prepare(
    `INSERT INTO audit (ts, actor, action, subject, details)
     SELECT ${DB_NOW}, ?3, 'site.news_notice', ?1, json_object('op', ?4, 'live', (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE} AND (?4 <> 'deleted' OR id <> ?1)))
      WHERE EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1 AND nonce = ?2)`,
  ).bind(id, nonce, me, op);

/**
 * /api/admin/news (SITE_ADMINS, checked by site-api.ts before site-admin.ts hands it on), then communityStaff and the
 * write fence:
 *   GET                                        the live notices, how many expired ones await the cleanup, how many operation records are kept,
 *                                              and opId, the id for this page's next new notice
 *   POST        {id, title, body, days}        create; the id is the operation's (the opId a GET handed out, accepted for 30 days)
 *   POST update {id, revision, title, body, days}
 *   POST delete {id, revision}                 allowed while News is off and after a notice expired: it is cleanup
 */
export async function handleNewsAdmin(request: Request, env: Env, parts: string[], _admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const ctx = await communityContext(env, request);
  if (!ctx.capabilities.communityStaff) return refusal(env, request, "applicantWrite");
  const m = request.method;
  const sub = parts.join("/");
  if (m === "GET" && sub === "") return adminList(request, env, ctx);
  if (m !== "POST" || !(sub === "" || sub === "update" || sub === "delete")) return apiJson({ error: "not_found" }, 404);
  // site-api.ts lets admin calls skip the page check; a notice write keeps it, so a page older than PAGE_VERSION reloads
  // first (.115 did not move PAGE_VERSION: a .114 page has no Admin -> News to send from)
  if (request.headers.get("X-Olympus") !== PAGE_VERSION) {
    return apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409);
  }
  if (rateLimited(`nw:${ctx.subject!.discordId}`, NEWS_LIMITS.writesPerMin, 60)) {
    return apiJson({ error: "slow_down", message: "Too many saves in one minute. Wait a moment, then try again." }, 429);
  }
  if (sub === "") return createNotice(request, env, ctx, body);
  if (sub === "update") return updateNotice(request, env, ctx, body);
  return deleteNotice(request, env, ctx, body);
}

async function adminList(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const out = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(`${ADMIN_COLUMNS} WHERE ${LIVE} ORDER BY created_at DESC, id LIMIT ${NEWS_LIMITS.liveMax}`),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM site_news_notices WHERE retain_until <= ${DB_NOW}) AS expired, (SELECT COUNT(*) FROM site_news_ops) AS ops,
              (SELECT value FROM site_settings WHERE key = 'newsOn') AS news_on, ${DB_NOW} AS db_now`,
    ),
  ]);
  if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const c = rowsOf<{ expired: number; ops: number; news_on: string | null; db_now: number }>(out[1])[0];
  return apiJson({
    now: now(),
    newsOn: newsOnFrom(env, c?.news_on),
    limits: NEWS_LIMITS,
    notices: rowsOf<AdminRow>(out[0]).map(adminNotice),
    awaitingCleanup: c?.expired ?? 0, // past their time: hidden from every read already, deleted by the next cron runs
    operationRecords: c?.ops ?? 0,
    // Codex's finding 5 (3 Oct 2026): the page's next create goes under this id, stamped with the database clock of this
    // read, so createNotice can refuse it once it is older than opIssueMaxAgeS. Without a time from the database there is
    // no id, and the page cannot post (fail closed).
    opId: Number.isSafeInteger(c?.db_now) && c!.db_now > 0 ? newOpId(c!.db_now) : null,
  });
}

async function createNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>): Promise<Response> {
  if (!exactKeys(body, ["id", "title", "body", "days"])) return apiJson({ error: "invalid_request", message: "That request could not be read." }, 400);
  if (typeof body.id !== "string" || !ID.test(body.id)) return invalid("id", "That operation id could not be read.");
  const id = body.id;
  const v = noticeValues(body);
  if (v instanceof Response) return v;
  const hash = await opHash(v);
  const issued = opIssuedAt(id);
  const me = ctx.subject!.discordId, nonce = randomToken();
  // The operation record first: the fence, the switch and the live count are judged inside it by the database, and an id
  // that already has a record (a replay, or a notice since deleted or expired) inserts nothing, so the notice cannot come
  // back. The record is kept opsKeepS from now, so the id's own age is judged here too, by the same clock (Codex's finding
  // 5, 3 Oct 2026): handed out no more than opIssueMaxAgeS ago and not after now. An id old enough for its record to be
  // gone therefore inserts nothing either. The lifetime is computed in SQL from the record's own time; the table's CHECK
  // bounds it.
  const out = await admitted(env, ctx, [
    env.DB.prepare(
      `INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after)
       SELECT ?4, ?5, ?1, ${DB_NOW}, ${DB_NOW} + ${NEWS_LIMITS.opsKeepS}
        WHERE ${fenceSql("applicantWrite", 1, 2, 3)} AND ${NEWS_ON_SQL}
          AND (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE}) < ${NEWS_LIMITS.liveMax}
          AND ?6 > ${DB_NOW} - ${NEWS_LIMITS.opIssueMaxAgeS} AND ?6 <= ${DB_NOW}
       ON CONFLICT(id) DO NOTHING`,
    ).bind(me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, id, nonce, issued),
    env.DB.prepare(
      `INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until)
       SELECT o.id, ?3, ?4, ?5, 1, o.nonce, ?6, o.created_at, ?6, o.created_at, o.created_at + ?7 * ${DAY_S} FROM site_news_ops o WHERE o.id = ?1 AND o.nonce = ?2`,
    ).bind(id, nonce, hash, v.title, v.text, me, v.days),
    auditIfWritten(env, id, nonce, me, "created"),
    env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND nonce = ?2`).bind(id, nonce), // the answer, in the write's own transaction
  ]);
  if (out !== FENCE_REFUSED) {
    const row = rowsOf<AdminRow>(out[3])[0];
    return row ? apiJson({ notice: adminNotice(row) }) : apiJson({ error: "not_found" }, 404);
  }
  // Refused: explained from one read by the database clock.
  const why = await env.DB.prepare(
    `SELECT EXISTS (SELECT 1 FROM site_news_ops WHERE id = ?1) AS op, EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1) AS present,
            (SELECT created_by FROM site_news_notices WHERE id = ?1) AS author, (SELECT op_hash FROM site_news_notices WHERE id = ?1) AS hash,
            EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1 AND ${LIVE}) AS live,
            (SELECT value FROM site_settings WHERE key = 'newsOn') AS news_on, (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE}) AS live_count,
            (?2 > ${DB_NOW} - ${NEWS_LIMITS.opIssueMaxAgeS} AND ?2 <= ${DB_NOW}) AS id_ok`,
  )
    .bind(id, issued)
    .first<{ op: number; present: number; author: string | null; hash: string | null; live: number; news_on: string | null; live_count: number; id_ok: number }>();
  if (why?.op) {
    if (!why.present) return apiJson({ error: "deleted", message: "That notice was deleted or its time ran out; it is not posted again." }, 409);
    if (why.author !== me || why.hash !== hash) return apiJson({ error: "op_conflict", message: "A different notice was already posted under this operation. Reload and write it again." }, 409);
    if (!why.live) return apiJson({ error: "expired", message: "That notice's time is up; it is no longer shown." }, 409);
    // The same author and the same text: the earlier attempt stored it. A replay answers only while its author is still staff.
    const fresh = await communityContext(env, request);
    if (!fresh.capabilities.communityStaff) return refusal(env, request, "applicantWrite");
    const again = await admittedRead(env, fresh, "applicantWrite", [env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND ${LIVE}`).bind(id)]);
    if (again === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    const row = rowsOf<AdminRow>(again[0])[0];
    return row ? apiJson({ notice: adminNotice(row), replay: true }) : apiJson({ error: "deleted", message: "That notice was deleted or its time ran out; it is not posted again." }, 409);
  }
  // No record under this id, and the id is too old (or was never handed out by this server): nothing was stored under it,
  // and it can no longer store anything. The page starts again with a fresh id (app.js refusedCreate).
  if (!why?.id_ok) {
    return apiJson({ error: "stale_page", message: `This form can no longer post: a form posts only within ${NEWS_LIMITS.opIssueMaxAgeS / DAY_S} days of being opened. Nothing was posted.` }, 409);
  }
  if (!newsOnFrom(env, why?.news_on)) return apiJson({ error: "news_off", message: "News is switched off (Admin → Settings); notices cannot be posted while it is off." }, 409);
  if ((why?.live_count ?? 0) >= NEWS_LIMITS.liveMax) return apiJson({ error: "too_many", message: `At most ${NEWS_LIMITS.liveMax} notices can be shown at once. Delete one first.` }, 409);
  return refusal(env, request, "applicantWrite");
}

const revisionOf = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 1 ? v : null);

async function updateNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>): Promise<Response> {
  if (!exactKeys(body, ["id", "revision", "title", "body", "days"])) return apiJson({ error: "invalid_request", message: "That request could not be read." }, 400);
  if (typeof body.id !== "string" || !ID.test(body.id)) return invalid("id", "That notice id could not be read.");
  const id = body.id;
  const revision = revisionOf(body.revision);
  if (revision === null) return invalid("revision", "That revision could not be read.");
  const v = noticeValues(body);
  if (v instanceof Response) return v;
  const me = ctx.subject!.discordId, nonce = randomToken();
  // The new lifetime counts from the original posting; whether it is still ahead, and whether the notice is still live,
  // is the database clock's decision inside the statement (no JavaScript pre-check). op_hash stays: it names the create.
  const out = await admitted(env, ctx, [
    env.DB.prepare(
      `UPDATE site_news_notices SET title = ?6, body = ?7, retain_until = created_at + ?8 * ${DAY_S}, revision = revision + 1, nonce = ?5, updated_by = ?1, updated_at = ${DB_NOW}
        WHERE id = ?4 AND revision = ?9 AND ${LIVE} AND created_at + ?8 * ${DAY_S} > ${DB_NOW} AND ${NEWS_ON_SQL} AND ${fenceSql("applicantWrite", 1, 2, 3)}`,
    ).bind(me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, id, nonce, v.title, v.text, v.days, revision),
    auditIfWritten(env, id, nonce, me, "edited"),
    env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND nonce = ?2`).bind(id, nonce),
  ]);
  if (out !== FENCE_REFUSED) {
    const row = rowsOf<AdminRow>(out[2])[0];
    return row ? apiJson({ notice: adminNotice(row) }) : apiJson({ error: "not_found" }, 404);
  }
  const read = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(
      `SELECT id, title, body, revision, created_by, updated_by, created_at, updated_at, retain_until, (${LIVE}) AS live, (created_at + ?2 * ${DAY_S} > ${DB_NOW}) AS period_ok
         FROM site_news_notices WHERE id = ?1`,
    ).bind(id, v.days),
    env.DB.prepare("SELECT value FROM site_settings WHERE key = 'newsOn'"),
  ]);
  if (read === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const row = rowsOf<AdminRow & { live: number; period_ok: number }>(read[0])[0];
  if (!row) return apiJson({ error: "not_found", message: "That notice no longer exists." }, 404);
  if (!newsOnFrom(env, rowsOf<{ value: string }>(read[1])[0]?.value)) return apiJson({ error: "news_off", message: "News is switched off (Admin → Settings); notices cannot be changed while it is off. They can still be deleted." }, 409);
  if (!row.live) return apiJson({ error: "expired", message: "That notice's time is up; it can no longer be changed." }, 409);
  if (!row.period_ok) return apiJson({ error: "period_passed", field: "days", message: "That period has already passed since the notice was posted. Choose a longer one." }, 400);
  if (row.revision !== revision) return apiJson({ error: "stale_revision", message: "Someone changed this notice first: reload it.", notice: adminNotice(row) }, 409);
  return refusal(env, request, "applicantWrite");
}

async function deleteNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>): Promise<Response> {
  if (!exactKeys(body, ["id", "revision"])) return apiJson({ error: "invalid_request", message: "That request could not be read." }, 400);
  if (typeof body.id !== "string" || !ID.test(body.id)) return invalid("id", "That notice id could not be read.");
  const id = body.id;
  const revision = revisionOf(body.revision);
  if (revision === null) return invalid("revision", "That revision could not be read.");
  const me = ctx.subject!.discordId, nonce = randomToken();
  // Whatever the switch says and even after expiry: deleting is cleanup. The operation record stays as the tombstone.
  const out = await admitted(env, ctx, [
    env.DB.prepare(`UPDATE site_news_notices SET nonce = ?5 WHERE id = ?4 AND revision = ?6 AND ${fenceSql("applicantWrite", 1, 2, 3)}`).bind(
      me,
      ctx.subject!.sessionVersion,
      ctx.subject!.expiresAt,
      id,
      nonce,
      revision,
    ),
    auditIfWritten(env, id, nonce, me, "deleted"),
    env.DB.prepare("DELETE FROM site_news_notices WHERE id = ?1 AND nonce = ?2").bind(id, nonce),
  ]);
  if (out !== FENCE_REFUSED) return apiJson({ ok: true, id });
  // Codex's finding 3 (3 Oct 2026, 13:15 UTC): deleting stays possible after expiry, because it is cleanup, but a refusal
  // answers with the notice's title and text only while it is live, judged by the database clock inside this read. Past
  // its time a notice is gone from every read (adminList, newsPage, the update refusal), and a stale delete must not
  // bring it back: it gets the id and the current revision only, enough to delete it with the current revision.
  const read = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(
      `SELECT id, revision, created_by, updated_by, created_at, updated_at, retain_until, (${LIVE}) AS live,
              CASE WHEN ${LIVE} THEN title END AS title, CASE WHEN ${LIVE} THEN body END AS body
         FROM site_news_notices WHERE id = ?1`,
    ).bind(id),
  ]);
  if (read === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const row = rowsOf<AdminRow & { live: number }>(read[0])[0];
  if (!row) return apiJson({ error: "not_found", message: "That notice no longer exists." }, 404);
  if (row.revision !== revision) {
    if (row.live === 1) return apiJson({ error: "stale_revision", message: "Someone changed this notice first: reload it.", notice: adminNotice(row) }, 409);
    return apiJson({ error: "stale_revision", message: "Someone changed this notice first, and its time is up: it is no longer shown, and the cleanup deletes it.", notice: { id: row.id, revision: row.revision } }, 409);
  }
  return refusal(env, request, "applicantWrite");
}

// ---------- the cron ----------

type SettingRow = { key: string; value: string };
const FIGURE_SETTINGS = "SELECT key, value FROM site_settings WHERE key IN (?1, ?2)";

/**
 * Physical cleanup, whatever the switch says: notices past their time (already gone from every read at that moment)
 * and operation records past purge_after whose notice is gone (a record is never removed while its notice exists).
 * Bounded per run; the backlog still waiting is in the audit row, which is written only when there was something.
 * The same batch reads the switch and the figures' cache for refreshNewsFigures (review of 3 Oct 2026: newsCron), so the
 * figures cost no round trip of their own while News is off or the cache is fresh.
 */
export async function sweepSiteNews(env: Env, at: number = now(), limit = 200): Promise<{ deleted: number; opsDeleted: number; remaining: number; settings: SettingRow[] }> {
  const [n, o, left, settings] = await env.DB.batch([
    env.DB.prepare("DELETE FROM site_news_notices WHERE id IN (SELECT id FROM site_news_notices WHERE retain_until <= ?1 ORDER BY retain_until, id LIMIT ?2)").bind(at, limit),
    env.DB.prepare(
      `DELETE FROM site_news_ops WHERE id IN (SELECT o.id FROM site_news_ops o WHERE o.purge_after <= ?1 AND NOT EXISTS (SELECT 1 FROM site_news_notices n WHERE n.id = o.id)
         ORDER BY o.purge_after, o.id LIMIT ?2)`,
    ).bind(at, limit),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM site_news_notices WHERE retain_until <= ?1) AS notices,
              (SELECT COUNT(*) FROM site_news_ops o WHERE o.purge_after <= ?1 AND NOT EXISTS (SELECT 1 FROM site_news_notices n WHERE n.id = o.id)) AS ops`,
    ).bind(at),
    env.DB.prepare(FIGURE_SETTINGS).bind("newsOn", FIGURES_KEY),
  ]);
  const deleted = n?.meta?.changes ?? 0;
  const opsDeleted = o?.meta?.changes ?? 0;
  const c = rowsOf<{ notices: number; ops: number }>(left)[0];
  const remaining = (c?.notices ?? 0) + (c?.ops ?? 0);
  if (deleted || opsDeleted || remaining) await audit(env, "cron", "site.news_expired", undefined, { deleted, opsDeleted, remaining });
  return { deleted, opsDeleted, remaining, settings: rowsOf<SettingRow>(settings) };
}

/**
 * The cron's News work: the cleanup, always, then the figures from the switch and the cache the cleanup's batch read.
 * Each step logs its own failure as a bounded category (log.ts errorRef); a failed cleanup leaves the figures to read the
 * settings themselves, so one cannot stop the other.
 */
export async function newsCron(env: Env): Promise<void> {
  let known: SettingRow[] | undefined;
  try {
    known = (await sweepSiteNews(env)).settings;
  } catch (e) {
    console.error("site news sweep failed", errorRef(e));
  }
  try {
    await refreshNewsFigures(env, now(), known);
  } catch (e) {
    console.error("news figures failed", errorRef(e));
  }
}

const maskCount = (n: number): Masked => (n === 0 ? 0 : n < 5 ? "few" : n); // fewer than five is never a number: it could point at a person
const LATEST_SNAPSHOT = "SELECT id, member_count, exported_at, received_at, trusted, complete, first_received_at FROM roster_snapshots ORDER BY id DESC LIMIT 1";
// The roster that was current at a moment: the newest complete, trusted export that had first arrived by then (never one
// from before LINKS_NOT_BEFORE, never a pre-.115 row: first_received_at is NULL there). The batch is one transaction, so
// every base it finds is at or below the latest id.
const BASE_SNAPSHOT =
  "SELECT id FROM roster_snapshots WHERE first_received_at <= ?1 AND complete = 1 AND trusted = 1 AND exported_at >= ?2 ORDER BY first_received_at DESC, id DESC LIMIT 1";
const COUNTING_SINCE = "SELECT MIN(first_received_at) AS t FROM roster_snapshots WHERE complete = 1 AND trusted = 1 AND exported_at >= ?1";
const NOT_IN = "SELECT COUNT(*) AS n FROM roster_members a WHERE a.snapshot_id = ?1 AND NOT EXISTS (SELECT 1 FROM roster_members b WHERE b.snapshot_id = ?2 AND b.name_key = a.name_key)";
// Applications, counted for what they are: accounts whose application was FIRST saved in the window (created_at), and
// applications whose decision (accepted or declined) was LAST saved in it (reviewed_at). A withdrawal is not a decision.
const APPLICATIONS = `SELECT COALESCE(SUM(created_at >= ?1), 0) AS od, COALESCE(SUM(created_at >= ?2), 0) AS ow,
  COALESCE(SUM(status IN ('accepted', 'declined') AND reviewed_at >= ?1), 0) AS dd, COALESCE(SUM(status IN ('accepted', 'declined') AND reviewed_at >= ?2), 0) AS dw
  FROM site_applications`;

export type FiguresOutcome = "off" | "fresh" | "unusable" | "computed" | "superseded";

/**
 * The News figures, computed at most every three hours and only while News is on (one round trip otherwise, none when
 * the caller passes the settings rows it already read: newsCron). The latest
 * snapshot must count under the seat rule (guild-seats.ts seatsFrom: complete, trusted, after LINKS_NOT_BEFORE, fresh);
 * otherwise the stored row is kept as it is and nothing is written. The anti-joins run only when the snapshot ids
 * changed since the stored row. The write is a compare-and-set on the value read and on the switch, so a concurrent run
 * changes nothing and neither does a run that News was switched off under ("superseded" in both cases).
 * A rename counts as one join and one leave; the counts are net.
 */
export async function refreshNewsFigures(env: Env, at: number = now(), known?: SettingRow[]): Promise<FiguresOutcome> {
  const rows = known ?? (await env.DB.prepare(FIGURE_SETTINGS).bind("newsOn", FIGURES_KEY).all<SettingRow>()).results;
  if (!settingsFrom(env, rows).newsOn) return "off";
  const prevRaw = rows.find((r) => r.key === FIGURES_KEY)?.value ?? null;
  const prev = parseFigures(prevRaw);
  if (prev && prev.asOf > at - NEWS_LIMITS.figuresEveryS) return "fresh";
  const cut = linksNotBefore(env);
  const ids = await env.DB.batch([
    env.DB.prepare(LATEST_SNAPSHOT),
    env.DB.prepare(BASE_SNAPSHOT).bind(at - DAY_S, cut),
    env.DB.prepare(BASE_SNAPSHOT).bind(at - 7 * DAY_S, cut),
    env.DB.prepare(COUNTING_SINCE).bind(cut),
  ]);
  const latest = rowsOf<{ id: number; member_count: number; exported_at: number; received_at: number; trusted: number | null; complete: number | null; first_received_at: number | null }>(ids[0])[0] ?? null;
  if (!latest || seatsFrom(env, at, latest, null).reason !== null) return "unusable";
  const dayBaseId = rowsOf<{ id: number }>(ids[1])[0]?.id ?? null;
  const weekBaseId = rowsOf<{ id: number }>(ids[2])[0]?.id ?? null;
  const since = rowsOf<{ t: number | null }>(ids[3])[0]?.t ?? null;
  const same = !!prev && prev.latestId === latest.id && prev.dayBaseId === dayBaseId && prev.weekBaseId === weekBaseId;
  const pairs: Array<[number, number]> = [];
  const needs = (base: number | null) => !same && base !== null && base !== latest.id;
  for (const base of [dayBaseId, weekBaseId]) if (needs(base)) pairs.push([latest.id, base!], [base!, latest.id]);
  const res = await env.DB.batch([
    ...pairs.map(([a, b]) => env.DB.prepare(NOT_IN).bind(a, b)),
    env.DB.prepare(APPLICATIONS).bind(at - DAY_S, at - 7 * DAY_S),
  ]);
  const nOf = (i: number) => Number(rowsOf<{ n: number }>(res[i])[0]?.n ?? 0);
  let i = 0;
  const windowFor = (base: number | null, kept: RosterWindow | null): RosterWindow | null => {
    if (same) return kept;
    if (base === null) return null;
    if (base === latest.id) return { joined: 0, left: 0 };
    const w = { joined: nOf(i), left: nOf(i + 1) };
    i += 2;
    return w;
  };
  const day = windowFor(dayBaseId, prev?.roster.day ?? null);
  const week = windowFor(weekBaseId, prev?.roster.week ?? null);
  const a = rowsOf<{ od: number; ow: number; dd: number; dw: number }>(res[pairs.length])[0] ?? { od: 0, ow: 0, dd: 0, dw: 0 };
  const next: StoredFigures = {
    v: 1,
    asOf: at,
    latestId: latest.id,
    dayBaseId,
    weekBaseId,
    countingSince: typeof since === "number" ? since : null,
    roster: { day, week },
    applications: {
      day: { firstSaved: maskCount(Number(a.od)), decided: maskCount(Number(a.dd)) },
      week: { firstSaved: maskCount(Number(a.ow)), decided: maskCount(Number(a.dw)) },
    },
  };
  const value = JSON.stringify(next);
  // The write reads the switch again (Codex's finding 4, 3 Oct 2026 13:15 UTC): the run read it before its other reads,
  // and an administrator may switch News off while it computes. Off at the write means nothing is written, the stored
  // row stays as it was, and the outcome is "superseded", as when another run wrote first.
  const write =
    prevRaw === null
      ? env.DB.prepare(`INSERT OR IGNORE INTO site_settings (key, value, updated_at, updated_by) SELECT ?1, ?2, ?3, NULL WHERE ${NEWS_ON_SQL}`).bind(FIGURES_KEY, value, at)
      : env.DB.prepare(`UPDATE site_settings SET value = ?3, updated_at = ?4, updated_by = NULL WHERE key = ?1 AND value = ?2 AND ${NEWS_ON_SQL}`).bind(FIGURES_KEY, prevRaw, value, at);
  const done = await write.run();
  return (done.meta?.changes ?? 0) > 0 ? "computed" : "superseded";
}

// ---------- erasure and the account copy ----------

registerCommunityData(
  "news",
  // The notices stay: they are announcements to the guild. Their author is forgotten, on the notice and on its operation record.
  (env, id) => [
    env.DB.prepare("UPDATE site_news_notices SET created_by = NULL WHERE created_by = ?1").bind(id),
    env.DB.prepare("UPDATE site_news_notices SET updated_by = NULL WHERE updated_by = ?1").bind(id),
    env.DB.prepare("UPDATE site_news_ops SET created_by = NULL WHERE created_by = ?1").bind(id),
  ],
  // Every copy carries this section; a member who never wrote a notice gets two empty lists. A notice whose time is up but
  // that the cleanup has not reached yet is still listed (keptUntil in the past): the copy shows what is held.
  (env, id) => ({
    statements: [
      env.DB.prepare("SELECT id, title, revision, created_at, updated_at, retain_until FROM site_news_notices WHERE created_by = ?1 OR updated_by = ?1 ORDER BY created_at, id").bind(id),
      env.DB.prepare("SELECT o.id, o.created_at, o.purge_after FROM site_news_ops o WHERE o.created_by = ?1 AND NOT EXISTS (SELECT 1 FROM site_news_notices n WHERE n.id = o.id) ORDER BY o.created_at, o.id").bind(id),
    ],
    shape: ([notices, gone]) => ({
      notices: rowsOf<{ id: string; title: string; revision: number; created_at: number; updated_at: number; retain_until: number }>(notices).map((r) => ({
        id: r.id,
        title: r.title,
        postedAt: secondsToIso(r.created_at),
        editedAt: r.revision > 1 ? secondsToIso(r.updated_at) : null,
        keptUntil: secondsToIso(r.retain_until),
      })),
      deletedNotices: rowsOf<{ id: string; created_at: number; purge_after: number }>(gone).map((r) => ({ id: r.id, postedAt: secondsToIso(r.created_at), keptUntil: secondsToIso(r.purge_after) })),
    }),
  }),
);
