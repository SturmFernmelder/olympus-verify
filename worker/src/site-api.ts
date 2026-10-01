/**
 * The guild site's API for signed-in members (build .41; .43 adds the voting board, backup choices and the weekly
 * availability grid, and drops "Delete my data": staff delete on request, from the admin page; .45 adds roles chosen
 * without a public vote and the professions answer). Admin calls are passed on to site-admin.ts.
 *
 * Every write re-reads the settings (open/closed switches), refuses a permanently denied account, and at most once an
 * hour asks Discord whether the person is still in SITE_GUILD_ID. Nothing here ever returns anyone's vote but the
 * caller's own, and no count of votes of any kind.
 */
import { errorRef } from "./log";
import type { Env } from "./env";
import { audit, now } from "./db";
import { DiscordError, rest } from "./discord";
import { apiJson, appOut, avatarUrl, BOARD_COUNTS, boardCountCache, choicesOf, currentUser, forgetBoardCounts, isSiteAdmin, labelOf, ON_BOARD, PAGE_VERSION, parseAnswers, rateLimited, readJson, ROLE_OF_FIRST, sameOrigin, searchMembers, UNDER_ROLE, type AppRow, type Found, type SiteUser } from "./site-core";
import {
  AVAIL_HEX,
  availBits,
  ballotOf,
  fitFromBits,
  BALLOTS,
  BOARD_ANSWERS,
  choiceOf,
  CLASS_KEY_SET,
  cleanText,
  cleanTimeZone,
  currentPosition,
  HOUR_KEYS,
  isAppointed,
  isLeadership,
  isNoVote,
  LIMITS,
  loadSettings,
  meta,
  parseCharacterName,
  parseLink,
  parsePick,
  POSITION_KEYS,
  PROFESSIONS,
  professionOf,
  QUESTIONS,
  raidFit,
  REGION_KEYS,
  ROLE_KEYS,
  roleKeyOf,
  roleLabel,
  VOICE_KEYS,
  type Pick,
  type SiteSettings,
} from "./site-data";
import { releaseReserved } from "./site-queue";
import { handleAdmin } from "./site-admin";
import { handleCommunity } from "./community-routes";
import { exportMyData } from "./site-export";
import { handlePrivacyIntake } from "./community-privacy-intake";

export const DENIED_TEXT =
  "Your registration with Olympus has been permanently denied. Joke and abusive applications are not reconsidered.";
const MEMBER_RECHECK = 3600;

export async function handleApi(request: Request, env: Env, path: string, waitUntil: (p: Promise<unknown>) => void): Promise<Response> {
  const m = request.method;
  if (m === "GET" && path === "/api/public") return apiJson({ settings: await loadSettings(env), meta: meta(), now: now() });
  // .82: the private request intake needs no session: the requester holds a case id and code (community-privacy-intake.ts)
  if (path === "/api/privacy/config" || path === "/api/privacy/requests" || path.startsWith("/api/privacy/requests/")) return handlePrivacyIntake(request, env, path);
  const user = await currentUser(env, request);
  if (!user) return apiJson({ error: "signed_out", message: "You are signed out. Sign in with Discord again." }, 401);
  if (m !== "GET" && m !== "HEAD" && !sameOrigin(request)) return apiJson({ error: "bad_origin", message: "Refused: that request did not come from this page." }, 403);
  const admin = isSiteAdmin(env, user.discord_id);
  if (path.startsWith("/api/admin/")) {
    if (!admin) return apiJson({ error: "forbidden" }, 403);
    return handleAdmin(request, env, path, user, waitUntil);
  }
  // .56: the community modules (consolidation batches 1-8) apply their own write fence (community-context.ts).
  if (path.startsWith("/api/community/")) return handleCommunity(request, env, path);
  if (m === "GET" && path === "/api/me") return apiJson(await meData(env, user));
  if (m === "GET" && path === "/api/me/export") return exportMyData(request, env, user); // .71: the member's own copy
  if (m === "GET" && path === "/api/search") return search(env, user, new URL(request.url), admin);
  if (m === "GET" && (path === "/api/board" || path.startsWith("/api/board/"))) {
    // The board shows other members' applications, so it is for members in good standing only: not denied, still in
    // Asmongold's server (checked with Discord at most hourly, as for a save), and not read by a script at speed.
    if (user.denied) return apiJson({ error: "denied", message: DENIED_TEXT }, 403);
    if (rateLimited(`r:${user.discord_id}`, 90, 60)) return apiJson({ error: "slow_down", message: "Too many pages in one minute. Wait a moment, then carry on." }, 429);
    const gone = await stillMember(env, user);
    if (gone) return gone;
    let role = "";
    try {
      role = path === "/api/board" ? "" : decodeURIComponent(path.slice("/api/board/".length));
    } catch {
      return apiJson({ error: "not_found", message: "There is no such role." }, 404);
    }
    return role ? boardRole(env, user, role, new URL(request.url).searchParams) : boardSummary(env, user);
  }

  // Everything below changes something.
  if (user.denied) return apiJson({ error: "denied", message: DENIED_TEXT }, 403);
  // A page loaded before .43 would save an application without the grid, and write-ins with the old roles (its full
  // list replaces the new one): it is told to reload instead.
  if (request.headers.get("X-Olympus") !== PAGE_VERSION) {
    return apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409);
  }
  // Board votes come one click at a time, so they get a roomier limit of their own.
  const vote = m === "PUT" && path === "/api/board/vote";
  if (rateLimited(`${vote ? "b" : "w"}:${user.discord_id}`, vote ? 120 : 30, 60)) {
    return apiJson({ error: "slow_down", message: vote ? "Too many votes in one minute. Wait a moment, then carry on." : "Too many saves in one minute. Wait a moment, then try again." }, 429);
  }
  const body = await readJson(request);
  if (body === null) return apiJson({ error: "bad_request", message: "That request could not be read." }, 400);
  const gone = await stillMember(env, user);
  if (gone) return gone;
  if (m === "PUT" && path === "/api/application") return saveApplication(env, user, body);
  if (m === "DELETE" && path === "/api/application") return withdrawApplication(env, user);
  if (m === "PUT" && path === "/api/votes") return saveVotes(env, user, body);
  if (vote) return saveBoardVote(env, user, body);
  if (m === "PUT" && path === "/api/friends") return saveFriends(env, user, body);
  if (m === "PUT" && path === "/api/reserved") return saveReserved(env, user, body);
  return apiJson({ error: "not_found" }, 404);
}

// ---------- reading ----------

export function publicUser(env: Env, u: SiteUser, admin: boolean) {
  return {
    id: u.discord_id,
    username: u.username,
    displayName: u.global_name,
    nick: u.nick,
    avatarUrl: avatarUrl(env, u.discord_id, u.avatar),
    accountCreated: u.account_created,
    serverJoined: u.server_joined,
    isAdmin: admin,
  };
}

/**
 * What a member sees of a reserved name. Whether it was approved is the admin's private list, so "claimed" and
 * "approved" both read "saved". A queued name follows its invite: "queued" only while that invite is still live, "in
 * the guild" once it was accepted, and "ended" when it ended without them (declined, cancelled, gave up), which also
 * lets them take the name off their list again.
 */
export function shownReserved(status: string, queueStatus: string | null): "saved" | "queued" | "in_guild" | "ended" {
  if (status === "in_guild") return "in_guild";
  if (status !== "queued") return "saved";
  if (queueStatus === "queued" || queueStatus === "written" || queueStatus === "invited") return "queued";
  return queueStatus === "joined" ? "in_guild" : "ended";
}
type ReservedRow = { id: number; name: string; name_key: string; status: string; queueStatus: string | null };
const myReserved = (env: Env, id: string) =>
  env.DB.prepare(
    `SELECT r.id, r.name, r.name_key, r.status, q.status AS queueStatus
       FROM site_reserved r LEFT JOIN invite_queue q ON q.id = r.queue_id
      WHERE r.owner_id = ?1 AND r.status <> 'released' ORDER BY r.id`,
  )
    .bind(id)
    .all<ReservedRow>();
const reservedOut = (rows: ReservedRow[]) => rows.map((r) => ({ id: r.id, name: r.name, status: shownReserved(r.status, r.queueStatus) }));

/** A role members vote on and write people in for: neither appointed nor chosen without a public vote. */
const boardOpenFor = (s: SiteSettings, key: string) => !isAppointed(s, key) && !isNoVote(s, key);

export async function meData(env: Env, user: SiteUser, settings?: SiteSettings) {
  const s = settings ?? (await loadSettings(env));
  const id = user.discord_id;
  const app = await env.DB.prepare("SELECT * FROM site_applications WHERE discord_id = ?1").bind(id).first<AppRow>();
  const votes = await env.DB.prepare(
    "SELECT ballot, slot, nominee_kind AS kind, nominee_key AS key, nominee_label AS label, reason FROM site_votes WHERE voter_id = ?1 ORDER BY ballot, slot",
  )
    .bind(id)
    .all<{ ballot: string; slot: number; kind: string; key: string; label: string; reason: string | null }>();
  const friends = await env.DB.prepare(
    "SELECT friend_kind AS kind, friend_key AS key, friend_label AS label, note FROM site_friends WHERE owner_id = ?1 ORDER BY created_at, friend_label",
  )
    .bind(id)
    .all<{ kind: string; key: string; label: string; note: string | null }>();
  const reserved = await myReserved(env, id);
  // The roles other members wrote this account in for (roles only: never who, never how many). The Home page tells
  // them, so someone put forward for a role can apply for it and be on the voting board.
  const nominated = await env.DB.prepare(
    `SELECT DISTINCT v.ballot FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id AND u.denied = 0
      WHERE v.nominee_kind = 'discord' AND v.nominee_key = ?1 AND v.voter_id <> ?1`,
  )
    .bind(id)
    .all<{ ballot: string }>();
  // Votes on an appointed role's board, or on a role now chosen without a public vote, no longer count as "voted on":
  // that board is closed.
  const board = await env.DB.prepare(MY_BOARD_VOTES).bind(id).all<{ rk: string; n: number }>();
  const boardVotes = board.results.filter((r) => boardOpenFor(s, r.rk)).reduce((n, r) => n + r.n, 0);
  const admin = isSiteAdmin(env, id);
  return {
    signedIn: true,
    now: now(),
    user: publicUser(env, user, admin),
    denied: !!user.denied,
    deniedText: user.denied ? DENIED_TEXT : undefined,
    settings: s,
    meta: meta(),
    application: app ? appOut(app) : null,
    votes: votes.results,
    boardVotes,
    nominatedFor: user.denied ? [] : nominated.results.map((r) => r.ballot).filter((b) => ballotOf(b) && boardOpenFor(s, b)),
    friends: friends.results,
    reserved: reservedOut(reserved.results),
  };
}

// ---------- the application ----------

type Fail = { error: string; field: string; message: string };
const fail = (field: string, message: string): Fail => ({ error: "invalid", field, message });
const bad = (f: Fail) => apiJson(f, 400);

export interface ValidApp {
  position: string;
  class_lead: string | null;
  backup1: string | null;
  backup2: string | null;
  fallback: number;
  character: string | null;
  char_key: string | null;
  class: string;
  role: string;
  region: string;
  avail: string;
  avail_tz: string | null;
  fit_na: number;
  fit_eu: number;
  board: boolean; // an application naming a voted leadership role, whose applicant agreed to the board (required for those)
  answers: string; // JSON
}

export function validateApplication(body: Record<string, unknown>, selfId: string, appointed: Record<string, string> = {}, noVote: readonly string[] = []): Fail | ValidApp {
  const taken = (key: string) => isAppointed({ appointed }, key);
  const region = String(body.region ?? "");
  // A page opened before the NA/EU split may still send the old Raid Leader or Raid Assist; the region decides.
  const position = currentPosition(String(body.position ?? ""), region);
  if (!POSITION_KEYS.has(position)) return fail("position", "Choose what you are applying for.");
  let classLead: string | null = null;
  if (position === "class_lead") {
    classLead = String(body.classLead ?? "");
    if (!CLASS_KEY_SET.has(classLead)) return fail("classLead", "Choose the class you would lead.");
  }
  const first = roleKeyOf(position, classLead);
  if (taken(first)) {
    return position === "class_lead"
      ? fail("classLead", `${roleLabel(first)} has been appointed (${appointed[first]}): choose another class.`)
      : fail("position", `${roleLabel(first)} has been appointed (${appointed[first]}): choose another first choice.`);
  }

  // Up to two backups, in order: roles they would also take if the first choice goes to someone else.
  const rawBackups = Array.isArray(body.backups) ? body.backups.map((b) => String(b ?? "")).filter(Boolean) : [];
  if (rawBackups.length > LIMITS.backups) return fail("backups", `At most ${LIMITS.backups} backup choices.`);
  const backups: string[] = [];
  for (const key of rawBackups) {
    const c = choiceOf(key);
    if (!c) return fail("backups", "One of the backup choices does not exist.");
    if (key === first) return fail("backups", "A backup choice is the same as your first choice.");
    if (backups.includes(key)) return fail("backups", "The two backup choices are the same.");
    if (taken(key)) return fail("backups", `${c.label} has been appointed (${appointed[key]}): choose another backup, or none.`);
    backups.push(key);
  }
  // Any leadership choice brings the leadership questions; only one that is voted on brings the board (.45: a role
  // chosen without a public vote has no board, so an application naming only such roles stays with the leadership).
  const leading = isLeadership(position) || backups.some((k) => choiceOf(k)?.leadership);
  const voted = [first, ...backups].some((k) => choiceOf(k)?.leadership && !isNoVote({ noVote }, k));

  let character: string | null = null;
  let charKey: string | null = null;
  if (cleanText(body.character, 40)) {
    const c = parseCharacterName(body.character);
    if ("error" in c) return fail("character", c.error);
    character = c.name;
    charKey = c.key;
  }
  const cls = String(body.class ?? "");
  if (!CLASS_KEY_SET.has(cls) && cls !== "undecided") return fail("class", "Choose the class you plan to play, or “undecided”.");
  const role = String(body.role ?? "");
  if (!ROLE_KEYS.has(role)) return fail("role", "Choose the role you plan to play.");
  if (!REGION_KEYS.has(region)) return fail("region", "Choose where you play from.");

  // When they can play: the grid, as 168 UTC hours. At least one block of three hours.
  const avail = String(body.avail ?? "").toLowerCase();
  const bits = AVAIL_HEX.test(avail) ? availBits(avail) : null;
  if (!bits) return fail("avail", "Mark the times you can play on the grid.");
  if (bits.filter(Boolean).length < 3) return fail("avail", "Mark at least one block of time you can usually play.");
  const availTz = cleanTimeZone(body.availTz);

  const raw = (body.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  for (const q of QUESTIONS) {
    if (q.leadership && !leading) continue;
    if (q.key === "logs") {
      const link = parseLink(raw.logs);
      if (typeof link !== "string") return fail("logs", link.error);
      if (link) answers.logs = link;
      continue;
    }
    const text = cleanText(raw[q.key], q.max, q.long);
    const min = q.long ? 10 : 2;
    if (q.required && Array.from(text).length < min) {
      return fail(q.key, q.long ? `“${q.label}” needs an answer (at least ${min} characters).` : `“${q.label}” needs an answer.`);
    }
    if (text) answers[q.key] = text;
  }
  if (leading) {
    const hours = String(raw.hours ?? "");
    if (!HOUR_KEYS.has(hours)) return fail("hours", "Say how many hours a week you can give the role.");
    answers.hours = hours;
  }
  const voice = String(raw.voice ?? "");
  if (!VOICE_KEYS.has(voice)) return fail("voice", "Say whether you can use voice chat.");
  answers.voice = voice;

  // The professions they plan to take on their main (optional): Forever's own, at most two primary ones.
  const profIn = raw.professions === undefined || raw.professions === null ? [] : raw.professions;
  if (!Array.isArray(profIn) || profIn.length > PROFESSIONS.length) return fail("professions", "Those professions could not be read. Choose them again.");
  const profs = new Set<string>();
  for (const k of profIn) {
    const p = professionOf(String(k ?? ""));
    if (!p) return fail("professions", "One of those professions is not in Forever. Choose them again.");
    profs.add(p.key);
  }
  if (PROFESSIONS.filter((p) => p.kind === "primary" && profs.has(p.key)).length > LIMITS.primaryProfessions) {
    return fail("professions", `At most ${LIMITS.primaryProfessions} primary professions: that is all one character can learn. Cooking, First Aid and Fishing come on top.`);
  }
  if (profs.size) answers.professions = PROFESSIONS.filter((p) => profs.has(p.key)).map((p) => p.key);

  const refsIn = Array.isArray(raw.references) ? raw.references : [];
  if (refsIn.length > LIMITS.references) return fail("references", `At most ${LIMITS.references} references.`);
  const refs: Pick[] = [];
  for (const r of refsIn) {
    const p = parsePick(r);
    if ("error" in p) return fail("references", p.error);
    if (p.kind === "discord" && p.key === selfId) return fail("references", "You cannot be your own reference.");
    if (!refs.some((x) => x.kind === p.kind && x.key === p.key)) refs.push(p);
  }
  if (refs.length) answers.references = refs;
  // Voted leadership roles put their applications on the board, and the form asks for that in so many words.
  if (voted && body.board !== true) return fail("board", "A leadership role you chose is voted on: tick the box to agree to your application being shown on the voting board (or keep it ticked) and save again, or choose only roles that are not voted on.");
  if (body.ack !== true) return fail("ack", "Tick the box to confirm you have read the warning about joke and abusive applications.");
  answers.ackAt = now();
  const fit = fitFromBits(bits);

  return {
    position,
    class_lead: classLead,
    backup1: backups[0] ?? null,
    backup2: backups[1] ?? null,
    fallback: body.fallback === false ? 0 : 1,
    character,
    char_key: charKey,
    class: cls,
    role,
    region,
    avail,
    avail_tz: availTz,
    fit_na: fit.na,
    fit_eu: fit.eu,
    board: voted,
    answers: JSON.stringify(answers),
  };
}

async function saveApplication(env: Env, user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const s = await loadSettings(env);
  if (!s.applicationsOpen) return apiJson({ error: "closed", message: "Applications are closed right now." }, 403);
  const existing = await env.DB.prepare("SELECT status, answers FROM site_applications WHERE discord_id = ?1").bind(user.discord_id).first<{ status: string; answers: string }>();
  if (existing && (existing.status === "accepted" || existing.status === "declined")) {
    return apiJson({ error: "decided", message: "Your application has already been decided, so it can no longer be changed." }, 409);
  }
  const a = validateApplication(body, user.discord_id, s.appointed, s.noVote);
  // A page opened before a role was put to the vote hid the board box: the list it lacked comes back with the refusal,
  // so the page can show the box and the applicant tick it, without losing what they typed.
  if ("error" in a) return a.field === "board" ? apiJson({ ...a, noVote: s.noVote }, 400) : bad(a);
  const answers = JSON.parse(a.answers) as { references?: Pick[]; professions?: string[] };
  let changed = false;
  if (answers.references?.length) {
    answers.references = await trustedLabels(env, answers.references);
    changed = true;
  }
  // A page from before .45 sends no professions at all (the form always sends a list, empty or not): keep the stored ones.
  const sent = (body.answers ?? {}) as Record<string, unknown>;
  const kept = existing && sent.professions === undefined ? parseAnswers(existing.answers).professions : undefined;
  if (Array.isArray(kept) && kept.length) {
    answers.professions = PROFESSIONS.filter((p) => kept.includes(p.key)).map((p) => p.key);
    changed = true;
  }
  if (changed) a.answers = JSON.stringify(answers);
  const t = now();
  // board_at keeps the first time they agreed; an application with no voted leadership role left has nothing on the board.
  await env.DB.prepare(
    `INSERT INTO site_applications (discord_id, position, class_lead, backup1, backup2, fallback, character, char_key, class, role, region, avail, avail_tz, fit_na, fit_eu, board_at, answers, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, CASE WHEN ?16 = 1 THEN ?18 END, ?17, 'submitted', ?18, ?18)
     ON CONFLICT(discord_id) DO UPDATE SET position = ?2, class_lead = ?3, backup1 = ?4, backup2 = ?5, fallback = ?6, character = ?7, char_key = ?8,
       class = ?9, role = ?10, region = ?11, avail = ?12, avail_tz = ?13, fit_na = ?14, fit_eu = ?15,
       board_at = CASE WHEN ?16 = 1 THEN COALESCE(site_applications.board_at, ?18) END, answers = ?17, updated_at = ?18,
       status = CASE WHEN site_applications.status = 'withdrawn' THEN 'submitted' ELSE site_applications.status END`,
  )
    .bind(user.discord_id, a.position, a.class_lead, a.backup1, a.backup2, a.fallback, a.character, a.char_key, a.class, a.role, a.region, a.avail, a.avail_tz, a.fit_na, a.fit_eu, a.board ? 1 : 0, a.answers, t)
    .run();
  forgetBoardCounts(); // this isolate's cached board counts: the applicant sees their own change at once
  await audit(env, user.discord_id, existing ? "site.application_updated" : "site.application_submitted", undefined, { position: a.position, backups: [a.backup1, a.backup2].filter(Boolean) });
  const row = await env.DB.prepare("SELECT * FROM site_applications WHERE discord_id = ?1").bind(user.discord_id).first<AppRow>();
  return apiJson({ ok: true, application: row ? appOut(row) : null });
}

async function withdrawApplication(env: Env, user: SiteUser): Promise<Response> {
  const r = await env.DB.prepare(
    "UPDATE site_applications SET status = 'withdrawn', updated_at = ?2 WHERE discord_id = ?1 AND status IN ('submitted','reviewing')",
  )
    .bind(user.discord_id, now())
    .run();
  if (!r.meta.changes) return apiJson({ error: "nothing", message: "There is no open application to withdraw." }, 409);
  forgetBoardCounts();
  await audit(env, user.discord_id, "site.application_withdrawn");
  const row = await env.DB.prepare("SELECT * FROM site_applications WHERE discord_id = ?1").bind(user.discord_id).first<AppRow>();
  return apiJson({ ok: true, application: row ? appOut(row) : null });
}

/**
 * The label on a Discord pick comes from the voter's page, so it could say anything. For accounts that have signed in
 * here, the names Discord gave the site replace it; for the rest the tallies show the Discord id beside the label.
 */
async function trustedLabels<T extends Pick>(env: Env, picks: T[]): Promise<T[]> {
  const ids = [...new Set(picks.filter((p) => p.kind === "discord").map((p) => p.key))];
  if (!ids.length) return picks;
  const known = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await env.DB.prepare(`SELECT discord_id, username, global_name, nick FROM site_users WHERE discord_id IN (${chunk.map((_, j) => `?${j + 1}`).join(",")})`)
      .bind(...chunk)
      .all<{ discord_id: string; username: string | null; global_name: string | null; nick: string | null }>();
    for (const r of rows.results) if (r.username) known.set(r.discord_id, labelOf({ username: r.username, displayName: r.global_name, nick: r.nick }));
  }
  return picks.map((p) => (p.kind === "discord" && known.has(p.key) ? { ...p, label: known.get(p.key)! } : p));
}

// ---------- the voting board ----------

const BOARD_PAGE = 20;

/** A small, fast, deterministic hash (FNV-1a). */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * This member's votes on applications that are on the board now, per role (a vote on someone who has since left the
 * board is kept, and counts again if they come back, but it is not "voted on" here). `?1` is the voter.
 */
const MY_BOARD_VOTES = `SELECT v.role_key AS rk, COUNT(*) AS n FROM site_board_votes v
       JOIN site_applications a ON a.discord_id = v.candidate_id
       JOIN site_users u ON u.discord_id = v.candidate_id
      WHERE v.voter_id = ?1 AND ${ON_BOARD} AND (${ROLE_OF_FIRST} = v.role_key OR a.backup1 = v.role_key OR a.backup2 = v.role_key)
      GROUP BY v.role_key`;


/**
 * How many applicants each role has on the board, and how many of them this member has voted on. A role that is
 * appointed or chosen without a public vote shows none: it has no board, and how many applied for it is the
 * leadership's business.
 */
async function boardSummary(env: Env, user: SiteUser): Promise<Response> {
  const settings = await loadSettings(env);
  let cached = boardCountCache.value;
  if (!cached || now() - cached.at >= 30) {
    const rows = await env.DB.prepare(BOARD_COUNTS).all<{ rk: string; n: number }>();
    cached = boardCountCache.value = { at: now(), counts: new Map(rows.results.map((r) => [r.rk, r.n])) };
  }
  const mine = await env.DB.prepare(MY_BOARD_VOTES).bind(user.discord_id).all<{ rk: string; n: number }>();
  const v = new Map(mine.results.map((r) => [r.rk, r.n]));
  // A voter who is on the board themself cannot vote on their own application: "votable" leaves them out, so their
  // "voted on 4 of 24" can reach the end.
  const own = await env.DB.prepare(
    `SELECT a.position, a.class_lead, a.region, a.backup1, a.backup2 FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id WHERE a.discord_id = ?1 AND ${ON_BOARD}`,
  )
    .bind(user.discord_id)
    .first<{ position: string; class_lead: string | null; region: string | null; backup1: string | null; backup2: string | null }>();
  const self = new Set(own ? choicesOf(own) : []);
  return apiJson({
    roles: BALLOTS.map((b) => {
      if (!boardOpenFor(settings, b.key)) return { key: b.key, applicants: 0, votable: 0, voted: 0 };
      const applicants = cached!.counts.get(b.key) ?? 0;
      return { key: b.key, applicants, votable: Math.max(0, applicants - (self.has(b.key) ? 1 : 0)), voted: v.get(b.key) ?? 0 };
    }),
  });
}

/**
 * One role's applicants, 20 a page, in an order of their own for every voter: the last six digits of the applicant's
 * id through a+b*x mod a prime, with a and b from a hash of voter and role. That is a shuffle SQLite can sort and page by
 * itself: stable when the page is reloaded, different for every voter, so nobody is first for everyone. Filters: class,
 * raid evenings (NA or EU, three or more, stored at save time), and "not voted on yet". Answers are read for the page
 * being shown only.
 */
async function boardRole(env: Env, user: SiteUser, roleKey: string, q: URLSearchParams): Promise<Response> {
  const ballot = ballotOf(roleKey);
  if (!ballot) return apiJson({ error: "not_found", message: "There is no such role." }, 404);
  const settings = await loadSettings(env);
  if (isAppointed(settings, ballot.key)) return appointedRole(ballot.key, settings);
  if (isNoVote(settings, ballot.key)) return noVoteRole(ballot.key);
  const me = user.discord_id;
  const cls = q.get("class") ?? "";
  const fitWanted = q.get("fit") ?? "";
  const todo = q.get("todo") === "1";
  const offset = Math.max(0, Math.min(Number.parseInt(q.get("offset") ?? "0", 10) || 0, 1_000_000));
  // Every query binds exactly the values it names: ?1 is always the role.
  const base = `FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id WHERE ${ON_BOARD} AND ${UNDER_ROLE(1)}`;
  const myVoteSql = (k: number) => `SELECT v.vote FROM site_board_votes v WHERE v.voter_id = ?${k} AND v.candidate_id = a.discord_id AND v.role_key = ?1`;
  const args: unknown[] = [ballot.key];
  const filters: string[] = [];
  if (cls && CLASS_KEY_SET.has(cls)) {
    args.push(cls);
    filters.push(`a.class = ?${args.length}`);
  }
  if (fitWanted === "na") filters.push("a.fit_na >= 3");
  if (fitWanted === "eu") filters.push("a.fit_eu >= 3");
  let meAt = 0;
  if (todo) {
    args.push(me);
    meAt = args.length;
    filters.push(`a.discord_id <> ?${meAt} AND NOT EXISTS (${myVoteSql(meAt)})`);
  }
  const where = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN a.discord_id = ?2 THEN 1 ELSE 0 END) AS self, SUM(CASE WHEN EXISTS (${myVoteSql(2)}) THEN 1 ELSE 0 END) AS voted ${base}`,
  )
    .bind(ballot.key, me)
    .first<{ total: number; self: number | null; voted: number | null }>();
  const matching = where
    ? ((await env.DB.prepare(`SELECT COUNT(*) AS n ${base}${where}`).bind(...args).first<{ n: number }>())?.n ?? 0)
    : (totals?.total ?? 0);
  const seed = fnv(`${me}|${ballot.key}`);
  const mul = 1 + (seed % 1_000_002); // 1 .. P-1
  const add = fnv(`${ballot.key}|${me}`) % 1_000_003;
  const pageArgs = [...args];
  if (!meAt) {
    pageArgs.push(me);
    meAt = pageArgs.length;
  }
  const k = pageArgs.length;
  const rows = await env.DB.prepare(
    `SELECT a.discord_id, a.position, a.class_lead, a.backup1, a.backup2, a.class, a.role, a.region, a.avail, a.answers,
            u.username, u.global_name, u.nick, u.avatar, (${myVoteSql(meAt)}) AS myVote
       ${base}${where}
      ORDER BY ((CAST(substr(a.discord_id, -6) AS INTEGER) * ?${k + 1} + ?${k + 2}) % 1000003), a.discord_id
      LIMIT ${BOARD_PAGE} OFFSET ?${k + 3}`,
  )
    .bind(...pageArgs, mul, add, offset)
    .all<Record<string, unknown>>();
  return apiJson({
    role: { key: ballot.key, label: ballot.label },
    votingOpen: settings.votingOpen,
    total: totals?.total ?? 0,
    votable: (totals?.total ?? 0) - (totals?.self ?? 0), // everyone here but the voter themself
    matching,
    voted: totals?.voted ?? 0,
    offset,
    pageSize: BOARD_PAGE,
    candidates: rows.results.map((r) => {
      const id = String(r.discord_id);
      const answers = parseAnswers(r.answers as string | undefined);
      const choice = choicesOf({ position: String(r.position), class_lead: (r.class_lead as string) ?? null, region: (r.region as string) ?? null, backup1: (r.backup1 as string) ?? null, backup2: (r.backup2 as string) ?? null }).indexOf(ballot.key) + 1;
      return {
        id,
        label: labelOf({ username: (r.username as string) ?? null, displayName: (r.global_name as string) ?? null, nick: (r.nick as string) ?? null }),
        avatarUrl: avatarUrl(env, id, (r.avatar as string) ?? null),
        class: r.class ?? null,
        role: r.role ?? null,
        region: r.region ?? null,
        fit: raidFit(r.avail as string | null),
        choice, // 1 = their first choice, 2 or 3 = a backup
        // Only the written answers the application form says are shown here; logs, references and notes stay private.
        answers: Object.fromEntries(BOARD_ANSWERS.filter((k) => typeof answers[k] === "string").map((k) => [k, answers[k]])),
        myVote: Number(r.myVote ?? 0),
        self: id === me,
      };
    }),
  });
}

/** The answer for a role that has been appointed: nothing to vote on, and who holds it. */
const appointedRole = (key: string, s: SiteSettings) =>
  apiJson({ error: "appointed", appointed: s.appointed[key], message: `${roleLabel(key)} has been appointed (${s.appointed[key]}): there is no vote for it.` }, 409);
/** The answer for a role chosen without a public vote: it takes applications, but there is no board to show or vote on. */
const noVoteRole = (key: string) =>
  apiJson({ error: "no_vote", message: `${roleLabel(key)} is chosen by the guild's leadership without a public vote: there is no voting board for it.` }, 409);

async function saveBoardVote(env: Env, user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const s = await loadSettings(env);
  if (!s.votingOpen) return apiJson({ error: "closed", message: "Voting is closed right now." }, 403);
  const ballot = ballotOf(String(body.role ?? ""));
  const candidate = String(body.candidate ?? "");
  const vote = Number(body.vote);
  if (!ballot || !/^\d{17,20}$/.test(candidate) || ![1, -1, 0].includes(vote)) return apiJson({ error: "bad_request", message: "That vote could not be read." }, 400);
  if (candidate === user.discord_id) return apiJson({ error: "self", message: "You cannot vote on your own application." }, 400);
  if (vote !== 0 && isAppointed(s, ballot.key)) return appointedRole(ballot.key, s);
  if (vote !== 0 && isNoVote(s, ballot.key)) return noVoteRole(ballot.key);
  if (vote === 0) {
    // Taking a vote back always works, even when the applicant has left the board since.
    await env.DB.prepare("DELETE FROM site_board_votes WHERE voter_id = ?1 AND candidate_id = ?2 AND role_key = ?3").bind(user.discord_id, candidate, ballot.key).run();
    return apiJson({ ok: true, vote });
  }
  const on = await env.DB.prepare(
    `SELECT 1 AS ok FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id WHERE a.discord_id = ?2 AND ${ON_BOARD} AND ${UNDER_ROLE(1)}`,
  )
    .bind(ballot.key, candidate)
    .first<{ ok: number }>();
  if (!on) return apiJson({ error: "gone", message: "That application is no longer on the board for this role." }, 409);
  await env.DB.prepare(
    `INSERT INTO site_board_votes (voter_id, candidate_id, role_key, vote, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(voter_id, candidate_id, role_key) DO UPDATE SET vote = ?4, updated_at = ?5`,
  )
    .bind(user.discord_id, candidate, ballot.key, vote, now())
    .run();
  return apiJson({ ok: true, vote });
}

// ---------- write-in nominations ----------

export function validateVotes(input: unknown, selfId: string): Fail | Array<Pick & { ballot: string; slot: number; reason: string | null }> {
  if (!Array.isArray(input)) return fail("votes", "Nothing to save.");
  const maxSlots = BALLOTS.reduce((n, b) => n + b.seats, 0);
  if (input.length > maxSlots) return fail("votes", "Too many picks.");
  const out: Array<Pick & { ballot: string; slot: number; reason: string | null }> = [];
  for (const raw of input) {
    const v = (raw ?? {}) as Record<string, unknown>;
    // A page opened before the NA/EU split may still send the old single Raid Leader ballot.
    const ballot = ballotOf(v.ballot === "raid_leader" ? "raid_leader_na" : String(v.ballot ?? ""));
    if (!ballot) return fail("votes", "One of those roles does not exist.");
    const slot = Number(v.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > ballot.seats) return fail(ballot.key, `${ballot.label}: pick slot out of range.`);
    const p = parsePick(v);
    if ("error" in p) return fail(`${ballot.key}:${slot}`, `${ballot.label}: ${p.error}`);
    if (p.kind === "discord" && p.key === selfId) return fail(`${ballot.key}:${slot}`, `${ballot.label}: you cannot nominate yourself.`);
    if (out.some((o) => o.ballot === ballot.key && o.slot === slot)) return fail(`${ballot.key}:${slot}`, `${ballot.label}: two picks in one slot.`);
    if (out.some((o) => o.ballot === ballot.key && o.kind === p.kind && o.key === p.key)) {
      return fail(`${ballot.key}:${slot}`, `${ballot.label}: you picked ${p.label} twice.`);
    }
    out.push({ ...p, ballot: ballot.key, slot, reason: cleanText(v.reason, LIMITS.reason) || null });
  }
  return out;
}

async function saveVotes(env: Env, user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const s = await loadSettings(env);
  if (!s.votingOpen) return apiJson({ error: "closed", message: "Voting is closed right now." }, 403);
  const checked = validateVotes(body.votes, user.discord_id);
  if (!Array.isArray(checked)) return bad(checked);
  // An appointed role, or one chosen without a public vote, takes no write-ins: what a member had written in for it
  // stays as it was (and counts again if the role is opened to the vote), and whatever the page sends for it is
  // ignored. Everything else is replaced as a whole.
  const frozen = BALLOTS.map((b) => b.key).filter((k) => !boardOpenFor(s, k));
  const v = await trustedLabels(env, checked.filter((x) => !frozen.includes(x.ballot)));
  const t = now();
  await env.DB.batch([
    frozen.length
      ? env.DB.prepare(`DELETE FROM site_votes WHERE voter_id = ?1 AND ballot NOT IN (${frozen.map((_, i) => `?${i + 2}`).join(", ")})`).bind(user.discord_id, ...frozen)
      : env.DB.prepare("DELETE FROM site_votes WHERE voter_id = ?1").bind(user.discord_id),
    ...v.map((x) =>
      env.DB.prepare(
        "INSERT INTO site_votes (voter_id, ballot, slot, nominee_kind, nominee_key, nominee_label, reason, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
      ).bind(user.discord_id, x.ballot, x.slot, x.kind, x.key, x.label, x.reason, t),
    ),
  ]);
  await audit(env, user.discord_id, "site.votes_saved", undefined, { picks: v.length });
  const saved = await env.DB.prepare(
    "SELECT ballot, slot, nominee_kind AS kind, nominee_key AS key, nominee_label AS label, reason FROM site_votes WHERE voter_id = ?1 ORDER BY ballot, slot",
  )
    .bind(user.discord_id)
    .all<{ ballot: string; slot: number; kind: string; key: string; label: string; reason: string | null }>();
  return apiJson({ ok: true, votes: saved.results });
}

// ---------- friends ----------

export function validateFriends(input: unknown, selfId: string): Fail | Array<Pick & { note: string | null }> {
  if (!Array.isArray(input)) return fail("friends", "Nothing to save.");
  if (input.length > LIMITS.friends) return fail("friends", `At most ${LIMITS.friends} friends.`);
  const out: Array<Pick & { note: string | null }> = [];
  for (const raw of input) {
    const p = parsePick(raw);
    if ("error" in p) return fail("friends", p.error);
    if (p.kind === "discord" && p.key === selfId) return fail("friends", "You are already on your own list.");
    if (out.some((o) => o.kind === p.kind && o.key === p.key)) continue;
    out.push({ ...p, note: cleanText((raw as { note?: unknown }).note, LIMITS.friendNote) || null });
  }
  return out;
}

async function saveFriends(env: Env, user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const checked = validateFriends(body.friends, user.discord_id);
  if (!Array.isArray(checked)) return bad(checked);
  const v = await trustedLabels(env, checked);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM site_friends WHERE owner_id = ?1").bind(user.discord_id),
    ...v.map((f, i) =>
      env.DB.prepare(
        "INSERT INTO site_friends (owner_id, friend_kind, friend_key, friend_label, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      ).bind(user.discord_id, f.kind, f.key, f.label, f.note, t + i), // + i keeps the order they were listed in
    ),
  ]);
  await audit(env, user.discord_id, "site.friends_saved", undefined, { friends: v.length });
  return apiJson({ ok: true, friends: v.map((f) => ({ kind: f.kind, key: f.key, label: f.label, note: f.note })) });
}

// ---------- reserved names ----------

async function saveReserved(env: Env, user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const s = await loadSettings(env);
  if (!s.namesOpen || now() < s.namesOpenAt) {
    return apiJson({ error: "closed", message: "Reserved names can be entered once Blizzard's name reservation opens." }, 403);
  }
  const input = Array.isArray(body.names) ? body.names : null;
  if (!input) return bad(fail("names", "Nothing to save."));
  const wanted: Array<{ name: string; key: string }> = [];
  for (const raw of input) {
    if (!cleanText(raw, 40)) continue; // an empty box
    const c = parseCharacterName(raw);
    if ("error" in c) return bad(fail("names", c.error));
    if (!wanted.some((w) => w.key === c.key)) wanted.push(c);
  }
  if (wanted.length > LIMITS.reserved) return bad(fail("names", `At most ${LIMITS.reserved} names: that is how many Blizzard lets one account reserve.`));

  const current = await myReserved(env, user.discord_id);
  const keep = new Set(wanted.map((w) => w.key));
  // Only a live invite holds a name on the list; one that ended can come off like any other.
  const locked = current.results.filter((r) => shownReserved(r.status, r.queueStatus) === "queued" && !keep.has(r.name_key));
  if (locked.length) {
    return apiJson({ error: "locked", field: "names", message: `${locked.map((r) => r.name).join(", ")} is already in the invite queue, so it stays on your list. Ask an officer if it should come off.` }, 409);
  }
  const drop = current.results.filter((r) => !keep.has(r.name_key)).map((r) => r.id);
  if (drop.length) await releaseReserved(env, { ids: drop }, user.discord_id);
  const have = new Set(current.results.map((r) => r.name_key));
  const add = wanted.filter((w) => !have.has(w.key));
  const t = now();
  if (add.length) {
    await env.DB.batch(
      add.map((w) =>
        env.DB.prepare("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at) VALUES (?1, ?2, ?3, 'claimed', ?4)").bind(user.discord_id, w.name, w.key, t),
      ),
    );
  }
  // Counts only: the audit log outlives a deletion, so it carries no names.
  if (add.length || drop.length) await audit(env, user.discord_id, "site.reserved_saved", undefined, { added: add.length, removed: drop.length });
  const rows = await myReserved(env, user.discord_id);
  return apiJson({ ok: true, reserved: reservedOut(rows.results) });
}

// ---------- member search ----------

async function search(env: Env, user: SiteUser, url: URL, admin: boolean): Promise<Response> {
  const q = cleanText(url.searchParams.get("q"), 32).replace(/^@/, "");
  if (Array.from(q).length < 2) return apiJson({ results: [] });
  if (rateLimited(`s:${user.discord_id}`, 40, 60)) return apiJson({ error: "slow_down", message: "Searching too fast. Wait a few seconds.", results: [] }, 429);
  if (!/^\d{17,20}$/.test(env.SITE_GUILD_ID ?? "") || !env.DISCORD_BOT_TOKEN) return apiJson({ results: [], unavailable: true });
  let out: { found: Found[]; limited?: boolean };
  try {
    out = await searchMembers(env, q);
  } catch (e) {
    console.error("site search", errorRef(e));
    return apiJson({ results: [], unavailable: true });
  }
  const ids = out.found.map((f) => f.id);
  const onSite = new Set<string>();
  const linked = new Set<string>();
  if (ids.length) {
    const marks = ids.map((_, i) => `?${i + 1}`).join(",");
    const a = await env.DB.prepare(`SELECT discord_id FROM site_users WHERE discord_id IN (${marks})`).bind(...ids).all<{ discord_id: string }>();
    for (const r of a.results) onSite.add(r.discord_id);
    if (admin) {
      const b = await env.DB.prepare(`SELECT DISTINCT discord_id FROM characters WHERE status NOT IN ('unbound','denied') AND discord_id IN (${marks})`)
        .bind(...ids)
        .all<{ discord_id: string }>();
      for (const r of b.results) linked.add(r.discord_id);
    }
  }
  return apiJson({
    limited: out.limited || undefined,
    results: out.found.map((f) => ({
      id: f.id,
      username: f.username,
      displayName: f.displayName,
      nick: f.nick,
      label: labelOf(f),
      avatarUrl: avatarUrl(env, f.id, f.avatar),
      onSite: onSite.has(f.id),
      self: f.id === user.discord_id,
      ...(admin ? { linked: linked.has(f.id) } : {}),
    })),
  });
}

// ---------- membership, deletion, plumbing ----------

/** At most hourly on a save: still in SITE_GUILD_ID? Left = no more saving (reading still works). */
async function stillMember(env: Env, user: SiteUser): Promise<Response | null> {
  if (now() - (user.checked_at ?? 0) < MEMBER_RECHECK || !env.DISCORD_BOT_TOKEN || !/^\d{17,20}$/.test(env.SITE_GUILD_ID ?? "")) {
    return user.in_server ? null : notMember();
  }
  try {
    const m = await rest<{ nick?: string | null; avatar?: string | null; pending?: boolean }>(env, "GET", `/guilds/${env.SITE_GUILD_ID}/members/${user.discord_id}`, undefined, 1);
    await env.DB.prepare(
      "UPDATE site_users SET nick = ?2, avatar = CASE WHEN ?3 IS NOT NULL THEN ?3 WHEN avatar LIKE 'g:%' THEN NULL ELSE avatar END, in_server = 1, checked_at = ?4 WHERE discord_id = ?1",
    )
      .bind(user.discord_id, m.nick ?? null, m.avatar ? `g:${m.avatar}` : null, now())
      .run();
    return null;
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404) {
      await env.DB.prepare("UPDATE site_users SET in_server = 0, checked_at = ?2 WHERE discord_id = ?1").bind(user.discord_id, now()).run();
      await audit(env, user.discord_id, "site.left_server");
      return notMember();
    }
    return null; // Discord busy or down: do not lock people out because of it
  }
}

const notMember = () =>
  apiJson({ error: "not_member", message: "You are no longer in Asmongold's Discord server, so this cannot be saved. Rejoin it, then sign in again." }, 403);
