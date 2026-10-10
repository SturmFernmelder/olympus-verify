/**
 * .59 (1 Oct 2026): the guild calendar with sign-ups, capacity and attendance, consolidation batch 3 of Codex's adapter
 * map, ported from Olympus Forever's src/events.ts and src/attendance.ts (frozen candidate manifest 296db2c8…; the CS-5
 * v2 bytes, manifest 7bdf8c34…, for the attendance write's own-result pairing) onto the .56 door.
 *
 * Organizers (SITE_ADMINS, or COMMUNITY_ORGANIZERS; confirmed guild members either way) create, edit and cancel events
 * and record attendance; confirmed guild members answer yes, tentative or no with a character and a raid role. Every
 * write returns {event}: the full event with the viewer's own answer and the counts.
 *
 * Who counts: only answers whose owners qualify at the time of the read or write (community-context.ts qualifiesSql, in
 * the statement), so counts equal the sign-ups a client can page through, and a member who is denied, banned, gone from
 * the server or off the roster stops holding a place at once; their stored answer is kept (it counts again if they
 * qualify again) until the event's retention or their erasure.
 *
 * Capacity is atomic: an RSVP is ONE statement whose own predicate counts the 'yes' answers that hold a place, so two
 * members racing for the last place cannot both get it (D1 runs each statement alone). A capacity LOWERED below the
 * places held is refused (capacity_below_signups); renaming, moving or raising never is.
 *
 * The calendar is bounded where it grows (HL-1): at most `scanLimit` distinct members may have an answer or an
 * attendance row across all events; a write that would add one more is refused (calendar_full) inside its own statement.
 * Reads that list or count fail closed past the bound (events_too_large) instead of showing part of the answers.
 *
 * Cursors carry the event's revision, the sign-up and attendance generations (bumped in the same batch as every write
 * that changes a list) and the digest of the whole visible order, so a page after any change is cursor_stale, never a
 * skipped or repeated row. The organizer's name is shown only while the creator qualifies; otherwise a placeholder.
 *
 * Attendance (CS-5): an organizer records entries by member ref after the event started; the upsert's own RETURNING
 * rows are the answer for this request, and a row another write replaced since is marked `superseded`. Missing means
 * unknown, never absent; attendance never feeds roles, eligibility or any penalty.
 *
 * Seconds everywhere (db.ts now()); ISO-8601 at the boundary (community-time.ts). Retention: an event, its answers,
 * attendance and history go 30 days after it ends (a cancellation brings that forward); erasure removes a member's
 * answers and attendance and anonymizes them as creator or recorder.
 */
import type { Env } from "./env";
import { PrivacySiteRequestHeld } from "./privacy-serving-authority";
import { audit, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, readJson, type SiteUser } from "./site-core";
import { admitted, admittedRead, communityContext, DB_NOW, fenceSql, FENCE_REFUSED, qualifiesSql, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { refAfterSignup } from "./community-refs";
import { validateName } from "./community-names";
import { isoToSeconds, secondsToIso } from "./community-time";
import { RAID_ROLES, scanLimit, type RaidRole, orderDigest, encodeCursor, cursorParts } from "./community-directory";
import { eventDeliveryChanged, eventDeliveryCloseExpired, eventDeliveryExpiry, eventDeliveryOwnerErase } from "./community-event-delivery";
import { eventReminderChanged, eventReminderCloseExpired, eventReminderExpiry, eventReminderOwnerErase } from "./community-event-reminders";

/*
 * .67 (Codex's independent calendar review on .59, 1 Oct 02:50 UTC; four grouped repairs and two contract decisions):
 *  1. The attendance result's payload is read INSIDE the write's batch and requalifies every target: a member who no
 *     longer qualifies at that instant has no private entry in the result (an `invalid` or `stale_revision` row carries
 *     `entry: null`; a committed row whose member cannot be shown is `ok` with `entry: null` and `withheld`), while the
 *     request's own RETURNING rows, their `revision = input + 1` and the `superseded` pairing are kept.
 *  2. Every read (list, detail, attendance list, own history, and the hydration after a write) runs behind the reader
 *     admission boundary (`admittedRead`): the reader's live row, session version, cookie expiry and guild standing are
 *     re-stated in the same batch as the payload; a viewer denied, signed out, banned, departed or expired in between
 *     receives a fresh refusal, never the payload.
 *  3. The list cursor (version 2) carries the digest of the whole visible window's order (start, id), so an event moved
 *     across a page boundary makes the old cursor `cursor_stale` instead of repeating or dropping a row.
 *  4. The list honours the configured read bound exactly as the detail does: the window itself and the qualifying
 *     answers behind the page's counts are counted up to the bound and `events_too_large` refuses past it; no partial
 *     total is ever shown.
 *  Decisions: whatever closes when an event starts (RSVP, update, cancel) or opens then (recording attendance) is judged
 *  by the DATABASE clock inside the first statement, and the refusal texts come from the same clock; a request held
 *  across the start is refused. And an event's response is one snapshot: the organizer's name, the counts and the
 *  viewer's own rows are read in one batch at one instant; the name is the creator's as they qualified at that instant,
 *  never claimed fresher than the rest of the payload.
 */
export const EVENT_RETENTION_S = 30 * 86400;
export const EVENT_LIMITS = { titleMax: 80, detailsMax: 500, durationMin: 15, durationMax: 720, capacityMax: 100, windowDays: 62, horizonDays: 366, pageSize: 100 } as const;
export const ORGANIZER_PLACEHOLDER = "Guild organizer";
const ID = /^[A-Za-z0-9_-]{22}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const RSVP_STATUSES = ["yes", "tentative", "no"] as const;
type RsvpStatus = (typeof RSVP_STATUSES)[number];
export const ATTENDANCE_STATES = ["present", "absent", "excused", "unknown"] as const;
type AttendanceState = (typeof ATTENDANCE_STATES)[number];
const ATTENDANCE_REASONS = ["late", "left_early"] as const;
type ReasonCode = (typeof ATTENDANCE_REASONS)[number];
const ATTENDANCE_MAX_ENTRIES = 100;
const UNSAFE_TEXT = /[\p{Cc}\u202A-\u202E\u2066-\u2069\uFEFF]|\p{Cs}/u;
const UNSAFE_MULTILINE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFEFF]|\p{Cs}/u;
const DISPLAY = "COALESCE(u.nick, u.global_name, u.username, '')";
const EVENT_COLUMNS = `e.id, e.title, e.details, e.starts_at, e.duration_min, e.ends_at, e.capacity, e.role_targets, e.status, e.revision, e.signup_generation, e.attendance_generation, e.created_by,
  (SELECT ${DISPLAY} FROM site_users u WHERE u.discord_id = e.created_by) AS creator_name`;
/** The 'yes' answers to `eventExpr` whose owners qualify at the moment of the statement. */
const placesHeld = (eventExpr: string) => `(SELECT COUNT(*) FROM community_event_signups o WHERE o.event_id = ${eventExpr} AND o.status = 'yes' AND ${qualifiesSql("o.discord_id")})`;
const inCalendar = (idExpr: string) => `(EXISTS (SELECT 1 FROM community_event_signups cs WHERE cs.discord_id = ${idExpr}) OR EXISTS (SELECT 1 FROM community_event_attendance ca WHERE ca.discord_id = ${idExpr}))`;
const calendarMembers = (limitExpr: string) => `(SELECT COUNT(*) FROM (SELECT discord_id FROM community_event_signups UNION SELECT discord_id FROM community_event_attendance LIMIT ${limitExpr}))`;
/** True when the distinct ids of the JSON array `newcomersExpr` not yet in the calendar still fit under `limitExpr`. */
const calendarRoom = (newcomersExpr: string, limitExpr: string) => {
  const joining = `(SELECT COUNT(*) FROM json_each(${newcomersExpr}) nj WHERE NOT ${inCalendar("nj.value")})`;
  return `(${joining} = 0 OR ${calendarMembers(limitExpr)} + ${joining} <= ${limitExpr})`;
};

class Bad extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const safeInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;
const onlyKeys = (body: Record<string, unknown>, allowed: readonly string[]) => {
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw new Bad("invalid_request");
};
const idOf = (raw: unknown, code = "invalid_event_id"): string => {
  if (typeof raw !== "string" || !ID.test(raw)) throw new Bad(code);
  return raw;
};
const revisionOf = (raw: unknown, min: number): number => {
  if (!safeInt(raw) || raw < min) throw new Bad("invalid_revision");
  return raw;
};
function plainText(raw: unknown, min: number, max: number, code: string, multiline = false): string {
  if (typeof raw !== "string" || raw.length > max * 4) throw new Bad(code);
  const normalized = raw.normalize("NFC");
  const t = (multiline ? normalized.replace(/\r\n?/g, "\n") : normalized).trim();
  if ([...t].length < min || t.length > max || (multiline ? UNSAFE_MULTILINE : UNSAFE_TEXT).test(t)) throw new Bad(code);
  return t;
}
function timeOf(raw: unknown, code: string): number {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)) throw new Bad(code);
  let s: number;
  try {
    s = isoToSeconds(raw, "exact");
  } catch {
    throw new Bad(code);
  }
  const canonical = raw.length === 20 ? `${raw.slice(0, 19)}.000Z` : raw;
  if (secondsToIso(s) !== canonical) throw new Bad(code); // an impossible date (2026-02-30) rolled over
  return s;
}
interface RoleTargets { tank: number; healer: number; damage: number }
function roleTargetsOf(raw: unknown): RoleTargets | null {
  if (raw === null) return null;
  if (!isRecord(raw) || Object.keys(raw).some((k) => !(RAID_ROLES as readonly string[]).includes(k))) throw new Bad("invalid_role_targets");
  const out: RoleTargets = { tank: 0, healer: 0, damage: 0 };
  for (const r of RAID_ROLES) {
    const v = raw[r] ?? 0;
    if (!safeInt(v) || v < 0 || v > EVENT_LIMITS.capacityMax) throw new Bad("invalid_role_targets");
    out[r] = v;
  }
  return out;
}
const roleTargetsText = (t: RoleTargets | null) => (t ? JSON.stringify({ tank: t.tank, healer: t.healer, damage: t.damage }) : null);
interface EventValues { title: string; details: string; startsAt: number; durationMin: number; capacity: number | null; roleTargets: RoleTargets | null }
const EVENT_FIELDS = ["title", "details", "startsAt", "durationMin", "capacity", "roleTargets"] as const;
type EventField = (typeof EVENT_FIELDS)[number];
function parseField(field: EventField, raw: unknown, at: number): EventValues[EventField] {
  switch (field) {
    case "title":
      return plainText(raw, 1, EVENT_LIMITS.titleMax, "invalid_title");
    case "details":
      return plainText(raw, 0, EVENT_LIMITS.detailsMax, "invalid_details", true);
    case "startsAt": {
      const s = timeOf(raw, "invalid_starts_at");
      if (s <= at - 86400 || s > at + EVENT_LIMITS.horizonDays * 86400) throw new Bad("invalid_starts_at");
      return s;
    }
    case "durationMin":
      if (!safeInt(raw) || raw < EVENT_LIMITS.durationMin || raw > EVENT_LIMITS.durationMax) throw new Bad("invalid_duration_min");
      return raw;
    case "capacity":
      if (raw === null) return null;
      if (!safeInt(raw) || raw < 1 || raw > EVENT_LIMITS.capacityMax) throw new Bad("invalid_capacity");
      return raw;
    case "roleTargets":
      return roleTargetsOf(raw);
  }
}

// ---------- shapes ----------
type EventRow = { id: string; title: string; details: string; starts_at: number; duration_min: number; ends_at: number; capacity: number | null; role_targets: string | null; status: "scheduled" | "cancelled"; revision: number; signup_generation: number; attendance_generation: number; created_by: string | null; creator_name: string | null };
type MineRow = { event_id: string; status: RsvpStatus; character_name: string | null; raid_role: RaidRole | null; revision: number; rsvp_starts_at: number };
type OwnAttendance = { event_id: string; state: string; source: string; reason_code: string | null; recorded_at: number };
type Counts = { yes: number; tentative: number; no: number; byRole: Record<RaidRole, number> };
const tally = (rows: { status: RsvpStatus; raid_role: RaidRole | null; n: number }[]): Counts => {
  const c: Counts = { yes: 0, tentative: 0, no: 0, byRole: { tank: 0, healer: 0, damage: 0 } };
  for (const r of rows) {
    c[r.status] += r.n;
    if (r.status === "yes" && r.raid_role) c.byRole[r.raid_role] += r.n;
  }
  return c;
};
interface Viewer { id: string; organizer: boolean; staff: boolean }
const viewerOf = (ctx: CommunityContext): Viewer => ({ id: ctx.subject!.discordId, organizer: ctx.capabilities.organizer, staff: ctx.capabilities.communityStaff });
function eventShape(e: EventRow, counts: Counts, mine: MineRow | undefined, viewer: Viewer, creatorQualifies: boolean, own?: OwnAttendance) {
  return {
    id: e.id,
    title: e.title,
    details: e.details,
    startsAt: secondsToIso(e.starts_at),
    durationMin: e.duration_min,
    capacity: e.capacity,
    roleTargets: e.role_targets ? (JSON.parse(e.role_targets) as RoleTargets) : null,
    status: e.status,
    revision: e.revision,
    signupGeneration: e.signup_generation,
    organizer: { displayName: e.created_by !== null && e.creator_name && creatorQualifies ? e.creator_name : ORGANIZER_PLACEHOLDER },
    counts,
    mine: mine ? { status: mine.status, character: mine.character_name, raidRole: mine.raid_role, revision: mine.revision, changedSinceRsvp: mine.rsvp_starts_at !== e.starts_at } : null,
    myAttendance: own ? { state: own.state, source: own.source, reasonCode: own.reason_code, recordedAt: secondsToIso(own.recorded_at) } : null,
    canManage: viewer.organizer && (viewer.staff || (e.created_by !== null && e.created_by === viewer.id)),
  };
}
const QUAL_CREATOR = `(e.created_by IS NOT NULL AND ${qualifiesSql("e.created_by")}) AS creator_ok`;

type CountRow = { event_id: string; status: RsvpStatus; raid_role: RaidRole | null; n: number };
type EventDto = ReturnType<typeof eventShape>;
/** Events (already read, in their order) with counts over qualifying answers, the viewer's own answer and attendance, all from one batch. */
const shapeFrom = (rows: (EventRow & { creator_ok: number })[], countRows: CountRow[], mineRows: MineRow[], ownRows: OwnAttendance[], viewer: Viewer): EventDto[] =>
  rows.map((e) => eventShape(e, tally(countRows.filter((r) => r.event_id === e.id)), mineRows.find((m) => m.event_id === e.id), viewer, e.creator_ok === 1, ownRows.find((a) => a.event_id === e.id)));
/**
 * One event as the viewer may read it now: one fenced batch (.67). `hydration` says why `event` is null although the
 * event may exist: the reader's admission did not hold at the payload, or the answers behind the counts exceed the bound.
 */
async function readEvent(env: Env, ctx: CommunityContext, id: string): Promise<{ event: EventDto | null; hydration?: "refused" | "too_large" }> {
  const viewer = viewerOf(ctx);
  const limit = scanLimit(env);
  const out = await admittedRead(env, ctx, "confirmedGuildData", [
    env.DB.prepare(`SELECT ${EVENT_COLUMNS}, ${QUAL_CREATOR} FROM community_events e WHERE e.id = ?1`).bind(id),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM community_event_signups s WHERE s.event_id = ?1 AND ${qualifiesSql("s.discord_id")} LIMIT ?2)`).bind(id, limit + 1),
    env.DB.prepare(`SELECT s.event_id, s.status, s.raid_role, COUNT(*) AS n FROM community_event_signups s WHERE s.event_id = ?1 AND ${qualifiesSql("s.discord_id")} GROUP BY s.event_id, s.status, s.raid_role`).bind(id),
    env.DB.prepare("SELECT event_id, status, character_name, raid_role, revision, rsvp_starts_at FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2").bind(id, viewer.id),
    env.DB.prepare("SELECT event_id, state, source, reason_code, recorded_at FROM community_event_attendance WHERE event_id = ?1 AND discord_id = ?2").bind(id, viewer.id),
  ]);
  if (out === FENCE_REFUSED) return { event: null, hydration: "refused" };
  const [ev, pre, counts, mine, own] = out;
  const e = (ev!.results as (EventRow & { creator_ok: number })[])[0];
  if (!e) return { event: null };
  if (((pre!.results[0] as { n: number } | undefined)?.n ?? 0) > limit) return { event: null, hydration: "too_large" };
  return { event: shapeFrom([e], counts!.results as CountRow[], mine!.results as MineRow[], ctx.features.has("attendance") ? (own!.results as OwnAttendance[]) : [], viewer)[0] ?? null };
}
const loadEvent = async (env: Env, ctx: CommunityContext, id: string): Promise<EventDto | null> => (await readEvent(env, ctx, id)).event;
/** Only after a returned mutation batch: preserve its acknowledgement without a newly refused event payload. */
async function readEventAfterWrite(env:Env,ctx:CommunityContext,id:string):Promise<{event:EventDto|null;hydration?:'refused'|'too_large'}>{
 try{return await readEvent(env,ctx,id);}catch(error){
  if(error instanceof PrivacySiteRequestHeld)return {event:null,hydration:'refused'};
  throw error;
 }
}

const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
const notOrganizer = () => apiJson({ error: "not_organizer", message: "Only guild organizers can do that." }, 403);
const needPage = (request: Request) => (request.headers.get("X-Olympus") !== PAGE_VERSION ? apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409) : null);
async function gate(request: Request, env: Env, ctx: CommunityContext, feature: "events" | "attendance", organizer = false): Promise<Response | null> {
  if (!ctx.features.has(feature)) return featureOff();
  if (!ctx.capabilities.confirmedGuildData) return refusal(env, request, "confirmedGuildData");
  if (organizer && !ctx.capabilities.organizer) return notOrganizer();
  return null;
}
async function bodyOf(request: Request, keys: readonly string[]): Promise<Record<string, unknown>> {
  const body = await readJson(request);
  if (body === null) throw new Bad("bad_request");
  onlyKeys(body, keys);
  return body;
}
const bad = (e: unknown): Response | null => (e instanceof Bad ? apiJson({ error: e.code }, e.status) : null);

// ---------- reads ----------
/** GET /api/community/events[?from=&to=&cursor=] → {from, to, events, nextCursor} */
export async function listEvents(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "events");
  if (no) return no;
  try {
    const url = new URL(request.url);
    const rawFrom = url.searchParams.get("from"), rawTo = url.searchParams.get("to");
    const parts = cursorParts(url.searchParams.get("cursor"));
    if (parts === "invalid") throw new Bad("invalid_cursor");
    const t = now();
    let from = t, to = t + 31 * 86400;
    if (rawFrom !== null || rawTo !== null) {
      from = timeOf(rawFrom, "invalid_window");
      to = timeOf(rawTo, "invalid_window");
    }
    let after: { digest: string; startsAt: number; id: string } | null = null;
    if (parts) {
      if (parts.length === 6 && parts[0] === 1 && parts[1] === "events") throw new Bad("cursor_stale", 409); // a .59 cursor: no order digest
      const [version, kind, cFrom, cTo, digest, startsAt, id] = parts;
      if (parts.length !== 7 || version !== 2 || kind !== "events" || !safeInt(cFrom) || !safeInt(cTo) || !text(digest, 32) || !HEX32.test(digest) || !safeInt(startsAt) || !text(id) || !ID.test(id)) throw new Bad("invalid_cursor");
      if (rawFrom === null && rawTo === null) {
        from = cFrom;
        to = cTo;
      } else if (cFrom !== from || cTo !== to) throw new Bad("invalid_cursor");
      after = { digest, startsAt, id };
    }
    if (to <= from || to - from > EVENT_LIMITS.windowDays * 86400) throw new Bad("invalid_window");
    if (rateLimited(`ce:${ctx.subject!.discordId}`, 90, 60)) return apiJson({ error: "slow_down", message: "Too many pages in one minute. Wait a moment, then carry on." }, 429);
    const viewer = viewerOf(ctx);
    const limit = scanLimit(env);
    // .67: one fenced batch. The whole window (bounded) gives the order digest the cursor carries; the page is selected in
    // SQL from the same window; the answers behind the page's counts are counted up to the bound before they are tallied.
    const pageSql = `SELECT e.id FROM community_events e WHERE e.ends_at > ?1 AND e.starts_at < ?2 AND (?3 = 0 OR e.starts_at > ?4 OR (e.starts_at = ?4 AND e.id > ?5)) ORDER BY e.starts_at, e.id LIMIT ?6`;
    const pageParams = [from, to, after ? 1 : 0, after?.startsAt ?? 0, after?.id ?? "", EVENT_LIMITS.pageSize + 1];
    const out = await admittedRead(env, ctx, "confirmedGuildData", [
      env.DB.prepare("SELECT e.starts_at, e.id FROM community_events e WHERE e.ends_at > ?1 AND e.starts_at < ?2 ORDER BY e.starts_at, e.id LIMIT ?3").bind(from, to, limit + 1),
      env.DB.prepare(`SELECT ${EVENT_COLUMNS}, ${QUAL_CREATOR} FROM community_events e WHERE e.id IN (${pageSql}) ORDER BY e.starts_at, e.id`).bind(...pageParams),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM community_event_signups s WHERE s.event_id IN (${pageSql}) AND ${qualifiesSql("s.discord_id")} LIMIT ?7)`).bind(...pageParams, limit + 1),
      env.DB.prepare(`SELECT s.event_id, s.status, s.raid_role, COUNT(*) AS n FROM community_event_signups s WHERE s.event_id IN (${pageSql}) AND ${qualifiesSql("s.discord_id")} GROUP BY s.event_id, s.status, s.raid_role`).bind(...pageParams),
      env.DB.prepare(`SELECT event_id, status, character_name, raid_role, revision, rsvp_starts_at FROM community_event_signups WHERE discord_id = ?7 AND event_id IN (${pageSql})`).bind(...pageParams, viewer.id),
      env.DB.prepare(`SELECT event_id, state, source, reason_code, recorded_at FROM community_event_attendance WHERE discord_id = ?7 AND event_id IN (${pageSql})`).bind(...pageParams, viewer.id),
    ]);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
    const [win, evs, pre, counts, mine, own] = out;
    const windowRows = win!.results as { starts_at: number; id: string }[];
    if (windowRows.length > limit || ((pre!.results[0] as { n: number } | undefined)?.n ?? 0) > limit) return apiJson({ error: "events_too_large" }, 503);
    const digest = await orderDigest(windowRows.map((r) => [r.starts_at, r.id]));
    if (after && after.digest !== digest) return apiJson({ error: "cursor_stale" }, 409);
    const rows = evs!.results as (EventRow & { creator_ok: number })[];
    const page = rows.slice(0, EVENT_LIMITS.pageSize);
    const last = page.at(-1);
    const events = shapeFrom(page, counts!.results as CountRow[], mine!.results as MineRow[], ctx.features.has("attendance") ? (own!.results as OwnAttendance[]) : [], viewer);
    return apiJson({ from: secondsToIso(from), to: secondsToIso(to), events, nextCursor: rows.length > EVENT_LIMITS.pageSize && last ? encodeCursor([2, "events", from, to, digest, last.starts_at, last.id]) : null });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

const RANK: Record<RsvpStatus, number> = { yes: 0, tentative: 1, no: 2 };
const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
type OrderKey = [number, string, string];
const cmp = (a: OrderKey, b: OrderKey) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
async function tie(eventId: string, discordId: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`olympus-signup-order-v1|${eventId}|${discordId}`));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** GET /api/community/event?id=[&cursor=] → {event, signups, nextCursor}: sign-ups of qualifying members, by status then name. */
export async function getEvent(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "events");
  if (no) return no;
  try {
    const url = new URL(request.url);
    const id = idOf(url.searchParams.get("id"));
    const parts = cursorParts(url.searchParams.get("cursor"));
    if (parts === "invalid") throw new Bad("invalid_cursor");
    let after: { revision: number; generation: number; digest: string; key: OrderKey } | null = null;
    if (parts) {
      const [version, kind, eventId, revision, generation, digest, rank, name, t] = parts;
      if (parts.length !== 9 || version !== 1 || kind !== "signups" || eventId !== id || !safeInt(revision) || !safeInt(generation) || !text(digest, 32) || !HEX32.test(digest) || !safeInt(rank) || rank < 0 || rank > 2 || !text(name, 512) || !text(t, 32) || !HEX32.test(t)) throw new Bad("invalid_cursor");
      after = { revision, generation, digest, key: [rank, name, t] };
    }
    const viewer = viewerOf(ctx);
    const limit = scanLimit(env);
    const out = await admittedRead(env, ctx, "confirmedGuildData", [
      env.DB.prepare(`SELECT ${EVENT_COLUMNS}, ${QUAL_CREATOR} FROM community_events e WHERE e.id = ?1`).bind(id),
      env.DB.prepare(
        `SELECT s.discord_id, s.status, s.character_name, s.raid_role, s.updated_at, s.rsvp_starts_at, ${DISPLAY} AS display_name, (SELECT r.ref FROM community_refs r WHERE r.discord_id = s.discord_id) AS ref
         FROM community_event_signups s JOIN site_users u ON u.discord_id = s.discord_id
         WHERE s.event_id = ?1 AND ${qualifiesSql("s.discord_id")} LIMIT ?2`,
      ).bind(id, limit + 1),
      env.DB.prepare("SELECT event_id, status, character_name, raid_role, revision, rsvp_starts_at FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2").bind(id, viewer.id),
      env.DB.prepare("SELECT event_id, state, source, reason_code, recorded_at FROM community_event_attendance WHERE event_id = ?1 AND discord_id = ?2").bind(id, viewer.id),
    ]);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData"); // .67: the reader's admission at the payload
    const [ev, signups, mine, own] = out;
    const e = (ev!.results as (EventRow & { creator_ok: number })[])[0];
    if (!e) return apiJson({ error: "event_not_found" }, 404);
    if (after && (after.revision !== e.revision || after.generation !== e.signup_generation)) return apiJson({ error: "cursor_stale" }, 409);
    type SignupRow = { discord_id: string; status: RsvpStatus; character_name: string | null; raid_role: RaidRole | null; updated_at: number; rsvp_starts_at: number; display_name: string; ref: string | null };
    const all = signups!.results as SignupRow[];
    if (all.length > limit) return apiJson({ error: "events_too_large" }, 503);
    const counts = tally(all.map((r) => ({ status: r.status, raid_role: r.raid_role, n: 1 })));
    const ordered = (await Promise.all(all.map(async (r) => ({ r, key: [RANK[r.status], fold(r.display_name), await tie(id, r.discord_id)] as OrderKey })))).sort((a, b) => cmp(a.key, b.key));
    const digest = await orderDigest(ordered.map((x) => x.key));
    if (after && after.digest !== digest) return apiJson({ error: "cursor_stale" }, 409);
    const remaining = after ? ordered.filter((x) => cmp(x.key, after!.key) > 0) : ordered;
    const page = remaining.slice(0, EVENT_LIMITS.pageSize);
    const last = page.at(-1);
    return apiJson({
      event: eventShape(e, counts, (mine!.results as MineRow[])[0], viewer, e.creator_ok === 1, ctx.features.has("attendance") ? (own!.results as OwnAttendance[])[0] : undefined),
      signups: page.map(({ r }) => ({ ...(viewer.organizer ? { ref: r.ref } : {}), displayName: r.display_name, status: r.status, character: r.character_name, raidRole: r.raid_role, updatedAt: secondsToIso(r.updated_at), changedSinceRsvp: r.rsvp_starts_at !== e.starts_at })),
      nextCursor: remaining.length > EVENT_LIMITS.pageSize && last ? encodeCursor([1, "signups", id, e.revision, e.signup_generation, digest, ...last.key]) : null,
    });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

// ---------- RSVP ----------
/** PUT /api/community/events/rsvp {eventId, status, character?, raidRole?, revision} → {event} */
export async function rsvp(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "events");
  if (no) return no;
  const reload = needPage(request);
  if (reload) return reload;
  const me = ctx.subject!.discordId;
  if (rateLimited(`cr:${me}`, 30, 60)) return apiJson({ error: "slow_down", message: "Too many answers in one minute. Wait a moment, then try again." }, 429);
  try {
    const body = await bodyOf(request, ["eventId", "status", "character", "raidRole", "revision"]);
    const eventId = idOf(body.eventId);
    const revision = revisionOf(body.revision, 0);
    if (!(RSVP_STATUSES as readonly unknown[]).includes(body.status)) throw new Bad("invalid_status");
    const status = body.status as RsvpStatus;
    let character: { name: string; key: string } | null = null;
    if (body.character !== undefined && body.character !== null) {
      const v = validateName(isRecord(body.character) ? body.character.name : body.character);
      if (!v.ok) throw new Bad("invalid_character");
      character = { name: v.name, key: v.key };
    }
    if (body.raidRole !== undefined && body.raidRole !== null && !(RAID_ROLES as readonly unknown[]).includes(body.raidRole)) throw new Bad("invalid_raid_role");
    const raidRole = (body.raidRole ?? null) as RaidRole | null;
    const t = now();
    const nonce = randomToken(), newRef = randomToken();
    const limit = scanLimit(env);
    // ?1 event, ?2 me, ?3 version (fence), ?4 status, ?5 name, ?6 key, ?7 role, ?8 now, ?9 revision, ?10 keepChar, ?11 keepRole, ?12 nonce, ?13 limit, ?14 expiry (fence)
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `INSERT INTO community_event_signups (event_id, discord_id, status, character_name, character_key, raid_role, revision, rsvp_starts_at, updated_at, write_nonce)
         SELECT e.id, ?2, ?4, ?5, ?6, ?7, 1, e.starts_at, ?8, ?12 FROM community_events e
         WHERE e.id = ?1 AND e.status = 'scheduled' AND e.starts_at > ${DB_NOW}
           AND (?9 = 0 OR EXISTS (SELECT 1 FROM community_event_signups o WHERE o.event_id = ?1 AND o.discord_id = ?2 AND o.revision = ?9))
           AND (?4 <> 'yes' OR e.capacity IS NULL OR EXISTS (SELECT 1 FROM community_event_signups o WHERE o.event_id = ?1 AND o.discord_id = ?2 AND o.status = 'yes') OR ${placesHeld("?1")} < e.capacity)
           AND ${calendarRoom("json_array(?2)", "?13")}
           AND ${fenceSql("confirmedGuildData", 2, 3, 14)}
         ON CONFLICT(event_id, discord_id) DO UPDATE SET
           status = excluded.status,
           character_name = CASE WHEN ?10 = 1 THEN community_event_signups.character_name ELSE excluded.character_name END,
           character_key = CASE WHEN ?10 = 1 THEN community_event_signups.character_key ELSE excluded.character_key END,
           raid_role = CASE WHEN ?11 = 1 THEN community_event_signups.raid_role ELSE excluded.raid_role END,
           revision = community_event_signups.revision + 1, rsvp_starts_at = excluded.rsvp_starts_at, updated_at = excluded.updated_at, write_nonce = excluded.write_nonce
         WHERE community_event_signups.revision = ?9`,
      ).bind(eventId, me, ctx.subject!.sessionVersion, status, character?.name ?? null, character?.key ?? null, raidRole, t, revision, body.character === undefined ? 1 : 0, body.raidRole === undefined ? 1 : 0, nonce, limit, ctx.subject!.expiresAt),
      env.DB.prepare("UPDATE community_events SET signup_generation = signup_generation + 1 WHERE id = ?1 AND EXISTS (SELECT 1 FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2 AND write_nonce = ?3)").bind(eventId, me, nonce),
      refAfterSignup(env, eventId, me, nonce, newRef, t),
      env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?3, ?2, 'community.rsvp', ?1, NULL WHERE EXISTS (SELECT 1 FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2 AND write_nonce = ?4)").bind(eventId, me, t, nonce),
    ]);
    if (out !== FENCE_REFUSED) return apiJson(await readEventAfterWrite(env, ctx, eventId));
    const state = await env.DB.prepare(
      `SELECT e.status, (e.starts_at <= ${DB_NOW}) AS started, e.capacity, ${placesHeld("e.id")} AS yes,
              (SELECT revision FROM community_event_signups o WHERE o.event_id = e.id AND o.discord_id = ?2) AS mine_revision,
              (SELECT status FROM community_event_signups o WHERE o.event_id = e.id AND o.discord_id = ?2) AS mine_status,
              ${inCalendar("?2")} AS in_calendar, ${calendarRoom("json_array(?2)", "?3")} AS calendar_room
       FROM community_events e WHERE e.id = ?1`,
    ).bind(eventId, me, limit).first<{ status: string; started: number; capacity: number | null; yes: number; mine_revision: number | null; mine_status: string | null; in_calendar: number; calendar_room: number }>();
    if (!state) return apiJson({ error: "event_not_found" }, 404);
    const event = await loadEvent(env, ctx, eventId);
    if (state.status === "cancelled") return apiJson({ error: "event_cancelled", event }, 410);
    if (state.started === 1) return apiJson({ error: "event_started", event }, 409); // .67: the database clock, like the statement
    if ((state.mine_revision ?? 0) !== revision) return apiJson({ error: "stale_revision", event }, 409);
    const wantsPlace = status === "yes" && state.capacity !== null && state.mine_status !== "yes";
    if (wantsPlace && state.yes >= state.capacity!) return apiJson({ error: "event_full", event }, 409);
    if (state.in_calendar !== 1 && state.calendar_room !== 1) return apiJson({ error: "calendar_full", event }, 409);
    const fresh = await communityContext(env, request);
    if ((wantsPlace || state.in_calendar !== 1) && fresh.capabilities.confirmedGuildData) return apiJson({ error: wantsPlace ? "event_full" : "calendar_full", event }, 409);
    return refusal(env, request, "confirmedGuildData");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

// ---------- organizer writes ----------
const historyStatement = (env: Env, eventId: string, action: "created" | "updated" | "cancelled", actor: string, at: number, fields: string[], nonce: string) =>
  env.DB.prepare("INSERT INTO community_event_changes (event_id, action, actor, at, fields) SELECT ?1, ?6, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM community_events WHERE id = ?1 AND nonce = ?5)").bind(eventId, actor, at, JSON.stringify(fields), nonce, action);
async function opHash(v: EventValues): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["event-create-v1", v.title, v.details, v.startsAt, v.durationMin, v.capacity, roleTargetsText(v.roleTargets)])));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST /api/community/events {opId, title, details?, startsAt, durationMin, capacity?, roleTargets?} → {event}; the id IS the opId. */
export async function createEvent(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "events", true);
  if (no) return no;
  const reload = needPage(request);
  if (reload) return reload;
  try {
    const body = await bodyOf(request, ["opId", ...EVENT_FIELDS]);
    const id = idOf(body.opId, "invalid_op_id");
    const t = now();
    const v: EventValues = {
      title: parseField("title", body.title, t) as string,
      details: body.details === undefined ? "" : (parseField("details", body.details, t) as string),
      startsAt: parseField("startsAt", body.startsAt, t) as number,
      durationMin: parseField("durationMin", body.durationMin, t) as number,
      capacity: body.capacity === undefined ? null : (parseField("capacity", body.capacity, t) as number | null),
      roleTargets: body.roleTargets === undefined ? null : (parseField("roleTargets", body.roleTargets, t) as RoleTargets | null),
    };
    const hash = await opHash(v);
    const endsAt = v.startsAt + v.durationMin * 60;
    const me = ctx.subject!.discordId, nonce = randomToken();
    // ?1 id, ?2 me, ?3 version
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `INSERT INTO community_events (id, op_id, op_hash, title, details, starts_at, duration_min, ends_at, capacity, role_targets, status, created_by, revision, nonce, created_at, updated_at, retain_until)
         SELECT ?1, ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'scheduled', ?2, 1, ?12, ?13, ?13, ?14 WHERE ${fenceSql("confirmedGuildData", 2, 3, 15)}
         ON CONFLICT DO NOTHING`,
      ).bind(id, me, ctx.subject!.sessionVersion, hash, v.title, v.details, v.startsAt, v.durationMin, endsAt, v.capacity, roleTargetsText(v.roleTargets), nonce, t, endsAt + EVENT_RETENTION_S, ctx.subject!.expiresAt),
      historyStatement(env, id, "created", me, t, [], nonce),
      env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?2, ?3, 'community.event_created', ?1, NULL WHERE EXISTS (SELECT 1 FROM community_events WHERE id = ?1 AND nonce = ?4)").bind(id, t, me, nonce),
    ]);
    if (out !== FENCE_REFUSED) return apiJson(await readEventAfterWrite(env, ctx, id));
    const existing = await env.DB.prepare("SELECT created_by, op_hash FROM community_events WHERE id = ?1").bind(id).first<{ created_by: string | null; op_hash: string | null }>();
    if (existing && (existing.created_by !== me || existing.op_hash !== hash)) return apiJson({ error: "op_conflict" }, 409);
    if (existing && (await communityContext(env, request)).capabilities.organizer) return apiJson({ ...(await readEvent(env, ctx, id)), replay: true });
    return refusal(env, request, "confirmedGuildData");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

type Stored = { id: string; title: string; details: string; starts_at: number; duration_min: number; capacity: number | null; role_targets: string | null; status: string; revision: number; created_by: string | null; created_at: number; yes: number; started: number };
const stored = (env: Env, id: string) => env.DB.prepare(`SELECT id, title, details, starts_at, duration_min, capacity, role_targets, status, revision, created_by, created_at, ${placesHeld("community_events.id")} AS yes, (starts_at <= ${DB_NOW}) AS started FROM community_events WHERE id = ?1`).bind(id).first<Stored>();
async function organizerRefusal(env: Env, ctx: CommunityContext, row: Stored | null, viewer: Viewer, revision: number, at: number): Promise<Response | null> {
  if (!row) return apiJson({ error: "event_not_found" }, 404);
  const event = () => loadEvent(env, ctx, row.id);
  if (!viewer.staff && (row.created_by === null || row.created_by !== viewer.id)) return apiJson({ error: "not_event_organizer", event: await event() }, 409);
  if (row.status === "cancelled") return apiJson({ error: "event_cancelled", event: await event() }, 410);
  if (row.started === 1) return apiJson({ error: "event_started", event: await event() }, 409); // .67: the database clock, like the statement
  if (row.revision !== revision) return apiJson({ error: "stale_revision", event: await event() }, 409);
  return null;
}

/** POST /api/community/events/update {eventId, revision, ...fields} → {event} */
export async function updateEvent(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "events", true);
  if (no) return no;
  const reload = needPage(request);
  if (reload) return reload;
  try {
    const body = await bodyOf(request, ["eventId", "revision", ...EVENT_FIELDS]);
    const eventId = idOf(body.eventId);
    const revision = revisionOf(body.revision, 1);
    const t = now();
    const given = EVENT_FIELDS.filter((f) => body[f] !== undefined);
    if (given.length === 0) throw new Bad("invalid_request");
    const parsed = new Map(given.map((f) => [f, parseField(f, body[f], t)]));
    const viewer = viewerOf(ctx);
    const row = await stored(env, eventId);
    const refused = await organizerRefusal(env, ctx, row, viewer, revision, t);
    if (refused) return refused;
    const current: EventValues = { title: row!.title, details: row!.details, startsAt: row!.starts_at, durationMin: row!.duration_min, capacity: row!.capacity, roleTargets: row!.role_targets ? (JSON.parse(row!.role_targets) as RoleTargets) : null };
    const next: EventValues = { ...current, ...(Object.fromEntries(parsed) as Partial<EventValues>) };
    // The accepted horizon belongs to the original creation, so repeated edits cannot keep the parent disposition forever.
    if (next.startsAt > row!.created_at + EVENT_LIMITS.horizonDays * 86400) throw new Bad("invalid_starts_at");
    const changed = EVENT_FIELDS.filter((f) => (f === "roleTargets" ? roleTargetsText(next.roleTargets) !== roleTargetsText(current.roleTargets) : next[f] !== current[f]));
    if (changed.length === 0) return apiJson({ ...(await readEvent(env, ctx, eventId)), unchanged: true });
    const lowers = next.capacity !== null && (current.capacity === null || next.capacity < current.capacity);
    const belowHeld = (held: number) => lowers && next.capacity !== null && next.capacity < held;
    const capacityRefusal = async () => apiJson({ error: "capacity_below_signups", event: await loadEvent(env, ctx, eventId) }, 409);
    if (belowHeld(row!.yes)) return capacityRefusal();
    const endsAt = next.startsAt + next.durationMin * 60;
    const me = ctx.subject!.discordId, nonce = randomToken();
    // ?1 id, ?2 revision, ?3 me, ?4 version, ?5.. values
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `UPDATE community_events SET title = ?5, details = ?6, starts_at = ?7, duration_min = ?8, ends_at = ?9, capacity = ?10, role_targets = ?11, retain_until = ?12, revision = revision + 1, nonce = ?13, updated_at = ?14
         WHERE id = ?1 AND revision = ?2 AND status = 'scheduled' AND starts_at > ${DB_NOW} AND ?7 <= created_at + ${EVENT_LIMITS.horizonDays * 86400} AND (created_by = ?3 OR ?15 = 1)
           AND (?10 IS NULL OR (capacity IS NOT NULL AND ?10 >= capacity) OR ?10 >= ${placesHeld("community_events.id")})
           AND ${fenceSql("confirmedGuildData", 3, 4, 16)}`,
      ).bind(eventId, revision, me, ctx.subject!.sessionVersion, next.title, next.details, next.startsAt, next.durationMin, endsAt, next.capacity, roleTargetsText(next.roleTargets), endsAt + EVENT_RETENTION_S, nonce, t, viewer.staff ? 1 : 0, ctx.subject!.expiresAt),
      eventDeliveryChanged(env, eventId, nonce),
      eventReminderChanged(env, eventId, nonce),
      historyStatement(env, eventId, "updated", me, t, changed, nonce),
      env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?2, ?3, 'community.event_updated', ?1, ?5 WHERE EXISTS (SELECT 1 FROM community_events WHERE id = ?1 AND nonce = ?4)").bind(eventId, t, me, nonce, JSON.stringify({ fields: changed })),
    ]);
    if (out !== FENCE_REFUSED) return apiJson(await readEventAfterWrite(env, ctx, eventId));
    const after = await stored(env, eventId);
    const refusedAfter = await organizerRefusal(env, ctx, after, viewer, revision, t);
    if (refusedAfter) return refusedAfter;
    if (next.startsAt > after!.created_at + EVENT_LIMITS.horizonDays * 86400) throw new Bad("invalid_starts_at");
    if (belowHeld(after!.yes)) return capacityRefusal();
    if (lowers && (await communityContext(env, request)).capabilities.organizer) return capacityRefusal();
    return refusal(env, request, "confirmedGuildData");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** POST /api/community/events/cancel {eventId, revision} → {event} */
export async function cancelEvent(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "events", true);
  if (no) return no;
  const reload = needPage(request);
  if (reload) return reload;
  try {
    const body = await bodyOf(request, ["eventId", "revision"]);
    const eventId = idOf(body.eventId);
    const revision = revisionOf(body.revision, 1);
    const t = now();
    const viewer = viewerOf(ctx);
    const refused = await organizerRefusal(env, ctx, await stored(env, eventId), viewer, revision, t);
    if (refused) return refused;
    const me = ctx.subject!.discordId, nonce = randomToken();
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `UPDATE community_events SET status = 'cancelled', revision = revision + 1, nonce = ?5, updated_at = ?6, retain_until = MIN(retain_until, ?7)
         WHERE id = ?1 AND revision = ?2 AND status = 'scheduled' AND starts_at > ${DB_NOW} AND (created_by = ?3 OR ?8 = 1) AND ${fenceSql("confirmedGuildData", 3, 4, 9)}`,
      ).bind(eventId, revision, me, ctx.subject!.sessionVersion, nonce, t, t + EVENT_RETENTION_S, viewer.staff ? 1 : 0, ctx.subject!.expiresAt),
      eventDeliveryChanged(env, eventId, nonce, true),
      eventReminderChanged(env, eventId, nonce),
      historyStatement(env, eventId, "cancelled", me, t, [], nonce),
      env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?2, ?3, 'community.event_cancelled', ?1, NULL WHERE EXISTS (SELECT 1 FROM community_events WHERE id = ?1 AND nonce = ?4)").bind(eventId, t, me, nonce),
    ]);
    if (out !== FENCE_REFUSED) return apiJson(await readEventAfterWrite(env, ctx, eventId));
    return (await organizerRefusal(env, ctx, await stored(env, eventId), viewer, revision, t)) ?? refusal(env, request, "confirmedGuildData");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

// ---------- attendance ----------
type UnionRow = { discord_id: string; ref: string; display_name: string | null; rsvp: RsvpStatus | null; state: AttendanceState | null; source: string | null; reason_code: ReasonCode | null; recorded_at: number | null; revision: number | null; write_nonce: string | null };
const staffRow = (r: UnionRow) => ({ ref: r.ref, displayName: r.display_name, rsvp: r.rsvp, attendance: r.state ? { state: r.state, source: r.source, reasonCode: r.reason_code, recordedAt: secondsToIso(r.recorded_at!), revision: r.revision } : null });
const UNION_SQL = `SELECT m.discord_id, r.ref, ${DISPLAY} AS display_name, s.status AS rsvp, a.state, a.source, a.reason_code, a.recorded_at, a.revision, a.write_nonce
  FROM (SELECT discord_id FROM community_event_signups WHERE event_id = ?1 UNION SELECT discord_id FROM community_event_attendance WHERE event_id = ?1) m
  JOIN community_refs r ON r.discord_id = m.discord_id
  JOIN site_users u ON u.discord_id = m.discord_id
  LEFT JOIN community_event_signups s ON s.event_id = ?1 AND s.discord_id = m.discord_id
  LEFT JOIN community_event_attendance a ON a.event_id = ?1 AND a.discord_id = m.discord_id
  WHERE ${qualifiesSql("m.discord_id")}`;

/** GET /api/community/event/attendance?id=[&cursor=] → {event, attendance, nextCursor, signupGeneration, attendanceGeneration} (organizers) */
export async function attendanceList(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "attendance", true);
  if (no) return no;
  try {
    const url = new URL(request.url);
    const id = idOf(url.searchParams.get("id"));
    const parts = cursorParts(url.searchParams.get("cursor"));
    if (parts === "invalid") throw new Bad("invalid_cursor");
    let after: { signups: number; attendance: number; digest: string; key: [string, string] } | null = null;
    if (parts) {
      const [version, kind, eventId, signups, attendance, digest, name, ref] = parts;
      if (parts.length !== 8 || version !== 1 || kind !== "attendance" || eventId !== id || !safeInt(signups) || !safeInt(attendance) || !text(digest, 32) || !HEX32.test(digest) || !text(name, 512) || !text(ref) || !ID.test(ref)) throw new Bad("invalid_cursor");
      after = { signups, attendance, digest, key: [name, ref] };
    }
    const viewer = viewerOf(ctx);
    const limit = scanLimit(env);
    const out = await admittedRead(env, ctx, "confirmedGuildData", [
      env.DB.prepare(`SELECT ${EVENT_COLUMNS}, ${QUAL_CREATOR} FROM community_events e WHERE e.id = ?1`).bind(id),
      env.DB.prepare(`SELECT s.status, s.raid_role, COUNT(*) AS n FROM community_event_signups s WHERE s.event_id = ?1 AND ${qualifiesSql("s.discord_id")} GROUP BY s.status, s.raid_role`).bind(id),
      env.DB.prepare(`${UNION_SQL} LIMIT ?2`).bind(id, limit + 1),
      env.DB.prepare("SELECT event_id, status, character_name, raid_role, revision, rsvp_starts_at FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2").bind(id, viewer.id),
      env.DB.prepare("SELECT event_id, state, source, reason_code, recorded_at FROM community_event_attendance WHERE event_id = ?1 AND discord_id = ?2").bind(id, viewer.id),
    ]);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData"); // .67
    const [ev, counts, union, mine, own] = out;
    const e = (ev!.results as (EventRow & { creator_ok: number })[])[0];
    if (!e) return apiJson({ error: "event_not_found" }, 404);
    if (after && (after.signups !== e.signup_generation || after.attendance !== e.attendance_generation)) return apiJson({ error: "cursor_stale" }, 409);
    const rows = union!.results as UnionRow[];
    if (rows.length > limit) return apiJson({ error: "events_too_large" }, 503);
    const ordered = rows.filter((r) => r.display_name !== null).map((r) => ({ r, key: [fold(r.display_name!), r.ref] as [string, string] })).sort((a, b) => (a.key[0] < b.key[0] ? -1 : a.key[0] > b.key[0] ? 1 : a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0));
    const digest = await orderDigest(ordered.map((x) => x.key));
    if (after && after.digest !== digest) return apiJson({ error: "cursor_stale" }, 409);
    const remaining = after ? ordered.filter((x) => x.key[0] > after!.key[0] || (x.key[0] === after!.key[0] && x.key[1] > after!.key[1])) : ordered;
    const page = remaining.slice(0, EVENT_LIMITS.pageSize);
    const last = page.at(-1);
    return apiJson({
      event: eventShape(e, tally(counts!.results as { status: RsvpStatus; raid_role: RaidRole | null; n: number }[]), (mine!.results as MineRow[])[0], viewer, e.creator_ok === 1, (own!.results as OwnAttendance[])[0]),
      attendance: page.map(({ r }) => staffRow(r)),
      nextCursor: remaining.length > EVENT_LIMITS.pageSize && last ? encodeCursor([1, "attendance", id, e.signup_generation, e.attendance_generation, digest, ...last.key]) : null,
      signupGeneration: e.signup_generation,
      attendanceGeneration: e.attendance_generation,
    });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

interface Entry { ref: string; value: { state: AttendanceState; reasonCode: ReasonCode | null; revision: number } | null }
function parseEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > ATTENDANCE_MAX_ENTRIES) throw new Bad("invalid_entries");
  const seen = new Set<string>();
  return raw.map((item) => {
    if (!isRecord(item) || !text(item.ref) || !ID.test(item.ref) || seen.has(item.ref) || Object.keys(item).some((k) => !["ref", "state", "reasonCode", "revision"].includes(k))) throw new Bad("invalid_entries");
    seen.add(item.ref);
    const state = item.state, reason = item.reasonCode ?? null, revision = item.revision;
    const ok = (ATTENDANCE_STATES as readonly unknown[]).includes(state) && (reason === null || ((ATTENDANCE_REASONS as readonly unknown[]).includes(reason) && state === "present")) && safeInt(revision) && revision >= 0;
    return { ref: item.ref, value: ok ? { state: state as AttendanceState, reasonCode: reason as ReasonCode | null, revision: revision as number } : null };
  });
}
type Result = { ref: string; result: "ok" | "invalid" | "unknown_member" | "stale_revision"; entry: ReturnType<typeof staffRow> | null; superseded?: true; withheld?: "target_unqualified" };

/** POST /api/community/attendance/record {eventId, entries:[{ref, state, reasonCode?, revision}]} → {event, results} (organizers, after the start). */
export async function recordAttendance(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "attendance", true);
  if (no) return no;
  const reload = needPage(request);
  if (reload) return reload;
  try {
    const body = await bodyOf(request, ["eventId", "entries"]);
    const eventId = idOf(body.eventId);
    const entries = parseEntries(body.entries);
    const t = now();
    const me = ctx.subject!.discordId;
    const refuse = async (): Promise<Response | null> => {
      const s = await env.DB.prepare(`SELECT status, (starts_at > ${DB_NOW}) AS pending FROM community_events WHERE id = ?1`).bind(eventId).first<{ status: string; pending: number }>();
      if (!s) return apiJson({ error: "event_not_found" }, 404);
      if (s.status === "cancelled") return apiJson({ error: "event_cancelled", event: await loadEvent(env, ctx, eventId) }, 410);
      if (s.pending === 1) return apiJson({ error: "event_not_started", event: await loadEvent(env, ctx, eventId) }, 409); // .67: the database clock
      return null;
    };
    const refused = await refuse();
    if (refused) return refused;
    // who each ref names, and whether the organizer may address them: an answer or a row on this event, or a listed profile; qualifying now
    const targets = await env.DB.prepare(
      `SELECT r.ref, r.discord_id FROM community_refs r WHERE r.ref IN (SELECT value FROM json_each(?1))
         AND (EXISTS (SELECT 1 FROM community_event_signups s WHERE s.event_id = ?2 AND s.discord_id = r.discord_id)
              OR EXISTS (SELECT 1 FROM community_event_attendance a WHERE a.event_id = ?2 AND a.discord_id = r.discord_id)
              OR EXISTS (SELECT 1 FROM community_profiles p WHERE p.discord_id = r.discord_id AND p.listed = 1))
         AND ${qualifiesSql("r.discord_id")}`,
    ).bind(JSON.stringify(entries.map((x) => x.ref)), eventId).all<{ ref: string; discord_id: string }>();
    const idOfRef = new Map(targets.results.map((x) => [x.ref, x.discord_id]));
    const writes = entries.filter((x) => x.value !== null && idOfRef.has(x.ref));
    const payload = JSON.stringify(writes.map((x) => [idOfRef.get(x.ref)!, x.value!.state, x.value!.reasonCode, x.value!.revision, x.ref]));
    const creating = [...new Set(writes.filter((x) => x.value!.revision === 0).map((x) => idOfRef.get(x.ref)!))];
    const nonce = randomToken();
    const limit = scanLimit(env);
    const ADMITTED = "EXISTS (SELECT 1 FROM community_events WHERE id = ?1 AND attendance_nonce = ?2)";
    const member = "json_extract(j.value, '$[0]')";
    const statements: D1PreparedStatement[] = [
      // the admitted first statement: the event is open for recording, the calendar has room for every member this may add, the organizer still qualifies
      env.DB.prepare(`UPDATE community_events SET attendance_nonce = ?2 WHERE id = ?1 AND status = 'scheduled' AND starts_at <= ${DB_NOW} AND ?3 = ?3 AND ${calendarRoom("?4", "?5")} AND ${fenceSql("confirmedGuildData", 6, 7, 8)}`).bind(eventId, nonce, t, JSON.stringify(creating), limit, me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt),
    ];
    if (writes.length > 0) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO community_event_attendance (event_id, discord_id, state, source, reason_code, recorded_by, recorded_at, revision, write_nonce)
           SELECT ?1, ${member}, json_extract(j.value, '$[1]'), 'officer', json_extract(j.value, '$[2]'), ?3, ?4, json_extract(j.value, '$[3]') + 1, ?2
           FROM json_each(?5) j
           WHERE ${ADMITTED}
             AND (json_extract(j.value, '$[3]') = 0 OR EXISTS (SELECT 1 FROM community_event_attendance x WHERE x.event_id = ?1 AND x.discord_id = ${member} AND x.revision = json_extract(j.value, '$[3]')))
             AND EXISTS (SELECT 1 FROM community_refs mr WHERE mr.discord_id = ${member} AND mr.ref = json_extract(j.value, '$[4]'))
             AND (EXISTS (SELECT 1 FROM community_event_signups rs WHERE rs.event_id = ?1 AND rs.discord_id = ${member}) OR EXISTS (SELECT 1 FROM community_event_attendance ra WHERE ra.event_id = ?1 AND ra.discord_id = ${member}) OR EXISTS (SELECT 1 FROM community_profiles rp WHERE rp.discord_id = ${member} AND rp.listed = 1))
             AND ${qualifiesSql(member)}
           ON CONFLICT(event_id, discord_id) DO UPDATE SET state = excluded.state, source = excluded.source, reason_code = excluded.reason_code, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at, revision = excluded.revision, write_nonce = excluded.write_nonce
           WHERE community_event_attendance.revision + 1 = excluded.revision
           RETURNING discord_id, state, source, reason_code, recorded_at, revision`,
        ).bind(eventId, nonce, me, t, payload),
      );
    }
    statements.push(
      env.DB.prepare("UPDATE community_events SET attendance_generation = attendance_generation + 1 WHERE id = ?1 AND attendance_nonce = ?2 AND EXISTS (SELECT 1 FROM community_event_attendance WHERE event_id = ?1 AND write_nonce = ?2)").bind(eventId, nonce),
      env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?3, ?4, 'community.attendance_recorded', ?1, ?5 WHERE EXISTS (SELECT 1 FROM community_events WHERE id = ?1 AND attendance_nonce = ?2)").bind(eventId, nonce, t, me, JSON.stringify({ entries: writes.length })),
      // .67: the result's payload, read in the same batch (one instant) and requalifying every target: a member who no
      // longer qualifies has no row here, so nothing private of theirs enters an invalid, stale or committed result
      env.DB.prepare(
        `SELECT r.discord_id, r.ref, ${DISPLAY} AS display_name, s.status AS rsvp, a.state, a.source, a.reason_code, a.recorded_at, a.revision, a.write_nonce
         FROM community_refs r JOIN site_users u ON u.discord_id = r.discord_id
         LEFT JOIN community_event_signups s ON s.event_id = ?1 AND s.discord_id = r.discord_id
         LEFT JOIN community_event_attendance a ON a.event_id = ?1 AND a.discord_id = r.discord_id
         WHERE r.discord_id IN (SELECT value FROM json_each(?2)) AND ${qualifiesSql("r.discord_id")}`,
      ).bind(eventId, JSON.stringify([...idOfRef.values()])),
    );
    const out = await admitted(env, ctx, statements);
    if (out === FENCE_REFUSED) {
      const r2 = await refuse();
      if (r2) return r2;
      const room = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM json_each(?1) nj WHERE NOT ${inCalendar("nj.value")}) AS joining, ${calendarRoom("?1", "?2")} AS room`).bind(JSON.stringify(creating), limit).first<{ joining: number; room: number }>();
      if ((room?.joining ?? 0) > 0 && (room?.room !== 1 || (await communityContext(env, request)).capabilities.organizer)) return apiJson({ error: "calendar_full", event: await loadEvent(env, ctx, eventId) }, 409);
      return refusal(env, request, "confirmedGuildData");
    }
    type Written = { discord_id: string; state: AttendanceState; source: string; reason_code: ReasonCode | null; recorded_at: number; revision: number };
    const written = new Map(writes.length > 0 ? (out[1]!.results as Written[]).map((w) => [w.discord_id, w]) : []);
    const current = new Map((out[out.length - 1]!.results as UnionRow[]).map((r) => [r.ref, r]));
    const results: Result[] = [];
    for (const x of entries) {
      if (!idOfRef.has(x.ref)) {
        results.push({ ref: x.ref, result: x.value === null ? "invalid" : "unknown_member", entry: null });
        continue;
      }
      const row = current.get(x.ref); // absent when the member no longer qualified at the payload (.67)
      const entry = row && row.display_name !== null ? staffRow(row) : null;
      const mine = written.get(idOfRef.get(x.ref)!);
      if (x.value === null) results.push({ ref: x.ref, result: "invalid", entry });
      else if (mine) {
        // CS-5 v2: this request's own committed row, exactly revision + 1; marked superseded when another write replaced it since
        if (mine.revision !== x.value.revision + 1) results.push({ ref: x.ref, result: "stale_revision", entry });
        else if (!row) results.push({ ref: x.ref, result: "ok", entry: null, withheld: "target_unqualified" }); // committed, but nothing private of a member who no longer qualifies
        else results.push({ ref: x.ref, result: "ok", entry: row.display_name !== null ? staffRow({ ...row, ...mine }) : null, ...(row.write_nonce === nonce ? {} : { superseded: true as const }) });
      } else if (!row) results.push({ ref: x.ref, result: "unknown_member", entry: null });
      else if ((row.revision ?? 0) !== x.value.revision) results.push({ ref: x.ref, result: "stale_revision", entry });
      else results.push({ ref: x.ref, result: "unknown_member", entry: null });
    }
    return apiJson({ ...(await readEvent(env, ctx, eventId)), results });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** GET /api/community/attendance/me[?cursor=] → {entries, nextCursor}: the member's own rows, newest event first. */
export async function myAttendance(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, "attendance");
  if (no) return no;
  try {
    const parts = cursorParts(new URL(request.url).searchParams.get("cursor"));
    if (parts === "invalid") throw new Bad("invalid_cursor");
    let after: { startsAt: number; id: string } | null = null;
    if (parts) {
      const [version, kind, startsAt, id] = parts;
      if (parts.length !== 4 || version !== 1 || kind !== "attendance-me" || !safeInt(startsAt) || !text(id) || !ID.test(id)) throw new Bad("invalid_cursor");
      after = { startsAt, id };
    }
    const out = await admittedRead(env, ctx, "confirmedGuildData", [
      env.DB.prepare(
        `SELECT e.id, e.title, e.starts_at, a.state, a.source, a.reason_code, a.recorded_at FROM community_event_attendance a JOIN community_events e ON e.id = a.event_id
         WHERE a.discord_id = ?1 AND (?2 = 0 OR e.starts_at < ?3 OR (e.starts_at = ?3 AND e.id > ?4)) ORDER BY e.starts_at DESC, e.id LIMIT ?5`,
      ).bind(ctx.subject!.discordId, after ? 1 : 0, after?.startsAt ?? 0, after?.id ?? "", EVENT_LIMITS.pageSize + 1),
    ]);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData"); // .67
    const rows = { results: out[0]!.results as { id: string; title: string; starts_at: number; state: string; source: string; reason_code: string | null; recorded_at: number }[] };
    const page = rows.results.slice(0, EVENT_LIMITS.pageSize);
    const last = page.at(-1);
    return apiJson({
      entries: page.map((r) => ({ event: { id: r.id, title: r.title, startsAt: secondsToIso(r.starts_at) }, state: r.state, source: r.source, reasonCode: r.reason_code, recordedAt: secondsToIso(r.recorded_at) })),
      nextCursor: rows.results.length > EVENT_LIMITS.pageSize && last ? encodeCursor([1, "attendance-me", last.starts_at, last.id]) : null,
    });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** Own retained event-change statements only. Construction executes nothing and grants no authority. */
export function ownEventChangeStatements(env: Env, actor: string, position: { high: number; seen: number; ts: number; id: number } | null): D1PreparedStatement[] {
  const bounded = position ? 1 : 0, after = position && position.seen > 0 ? 1 : 0;
  return [
    env.DB.prepare("SELECT COALESCE(MAX(id),0) AS high_water, COUNT(*) AS total_count, COALESCE(SUM(CASE WHEN ?4=0 OR at>?5 OR (at=?5 AND id>?6) THEN 1 ELSE 0 END),0) AS remaining_count FROM community_event_changes WHERE actor=?1 AND (?2=0 OR id<=?3)").bind(actor, bounded, position?.high ?? 0, after, position?.ts ?? 0, position?.id ?? 0),
    env.DB.prepare("SELECT id,event_id,action,at,fields FROM community_event_changes WHERE actor=?1 AND id<=CASE WHEN ?2=1 THEN ?3 ELSE (SELECT COALESCE(MAX(id),0) FROM community_event_changes WHERE actor=?1) END AND (?4=0 OR at>?5 OR (at=?5 AND id>?6)) ORDER BY at,id LIMIT 1001").bind(actor, bounded, position?.high ?? 0, after, position?.ts ?? 0, position?.id ?? 0),
  ];
}

// ---------- retention, erasure, export ----------
/** Cron step: events past their retention deadline go with their answers, attendance and history; bounded per run. */
export async function sweepCommunityEvents(env: Env, at = now(), limit = 100): Promise<number> {
  const due = "SELECT id FROM community_events WHERE retain_until <= ?1 ORDER BY retain_until, id LIMIT ?2";
  const [, delivery, , reminder, , , , ev] = await env.DB.batch([
    eventDeliveryCloseExpired(env, at, limit),
    eventDeliveryExpiry(env, at, limit),
    eventReminderCloseExpired(env, at, limit),
    eventReminderExpiry(env, at, limit),
    env.DB.prepare(`DELETE FROM community_event_signups WHERE event_id IN (${due})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_event_attendance WHERE event_id IN (${due})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_event_changes WHERE event_id IN (${due})`).bind(at, limit),
    env.DB.prepare(`DELETE FROM community_events WHERE id IN (${due})`).bind(at, limit),
  ]);
  const n = ev?.meta?.changes ?? 0;
  const disposed = [...delivery!.results, ...reminder!.results];
  const incomplete = disposed.reduce<number>((sum, row) => sum + ((row as { incomplete?: number }).incomplete === 1 ? 1 : 0), 0);
  if (n || disposed.length) await audit(env, "cron", "community.events_expired", undefined, { deleted: n, discordUnresolved: incomplete });
  return n;
}

registerCommunityData(
  "events",
  (env, id) => [
    eventDeliveryOwnerErase(env, id), // before created_by is anonymized: copied publication text and provider-removal debt
    eventReminderOwnerErase(env, id), // likewise, before a different consenting organizer's creator link is erased
    // the generations move first, so a page read before the erase cannot be continued
    env.DB.prepare("UPDATE community_events SET signup_generation = signup_generation + 1 WHERE id IN (SELECT event_id FROM community_event_signups WHERE discord_id = ?1)").bind(id),
    env.DB.prepare("UPDATE community_events SET attendance_generation = attendance_generation + 1 WHERE id IN (SELECT event_id FROM community_event_attendance WHERE discord_id = ?1)").bind(id),
    env.DB.prepare("DELETE FROM community_event_signups WHERE discord_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM community_event_attendance WHERE discord_id = ?1").bind(id),
    env.DB.prepare("UPDATE community_event_attendance SET recorded_by = NULL WHERE recorded_by = ?1").bind(id),
    env.DB.prepare("UPDATE community_events SET created_by = NULL WHERE created_by = ?1").bind(id),
    env.DB.prepare("UPDATE community_event_changes SET actor = NULL WHERE actor = ?1").bind(id),
  ],
  (env, id) => ({
    // .74: a plan, run in the copy's one admitted batch
    statements: [
      env.DB.prepare("SELECT s.event_id, e.title, e.starts_at, s.status, s.character_name, s.raid_role, s.updated_at FROM community_event_signups s JOIN community_events e ON e.id = s.event_id WHERE s.discord_id = ?1 ORDER BY e.starts_at").bind(id),
      env.DB.prepare("SELECT id, title, starts_at, status FROM community_events WHERE created_by = ?1 ORDER BY starts_at").bind(id),
      env.DB.prepare("SELECT a.event_id, e.title, e.starts_at, a.state, a.reason_code, a.recorded_at FROM community_event_attendance a JOIN community_events e ON e.id = a.event_id WHERE a.discord_id = ?1 ORDER BY e.starts_at").bind(id),
    ],
    shape: ([signups, created, attendance]) => {
      const iso = (r: Record<string, unknown>, k: string) => (typeof r[k] === "number" ? secondsToIso(r[k] as number) : null);
      return {
        signups: (signups!.results as Record<string, unknown>[]).map((r) => ({ eventId: r.event_id, title: r.title, startsAt: iso(r, "starts_at"), status: r.status, character: r.character_name, raidRole: r.raid_role, updatedAt: iso(r, "updated_at") })),
        created: (created!.results as Record<string, unknown>[]).map((r) => ({ id: r.id, title: r.title, startsAt: iso(r, "starts_at"), status: r.status })),
        attendance: (attendance!.results as Record<string, unknown>[]).map((r) => ({ eventId: r.event_id, title: r.title, startsAt: iso(r, "starts_at"), state: r.state, reasonCode: r.reason_code, recordedAt: iso(r, "recorded_at") })),
      };
    },
  }),
);
