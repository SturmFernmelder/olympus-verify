/**
 * The guild site's admin API (build .41, .43, .45): SITE_ADMINS only, checked by site-api.ts on every call before it
 * gets here. This is the only code that ever counts votes.
 *
 *   GET  overview                          counts, the professions of open applications, settings
 *   PUT  settings                          reservation time and whether it is confirmed, launch, the open/closed switches,
 *                                          the appointed roles {roleKey: name}, the roles without a public vote [roleKey]
 *                                          (.115: namesConfirmed when a typed name is added or changed)
 *   GET  applications?position&backups&profession&status&q&offset, GET applications/{id}
 *   POST applications/{id}/status          {status, note}
 *   POST users/{id}/deny {reason}, POST users/{id}/undeny, POST users/{id}/delete {mentions} (legacy site-only deletion)
 *   POST users/{id}/mentions               only what others entered about an account that never signed in here
 *   GET  availability?role                 the weekly grid of every open application, summed per UTC hour
 *   GET  board?role&minAccountDays&minServerDays&includeDenied&includeLeft&onlyApplicants, GET board/voters?role&candidate
 *   GET  votes?ballot&(the same filters), GET votes/voters?ballot&kind&key          (write-in nominations)
 *   GET  reserved?status&q&offset, POST reserved/{approve|unapprove|release|queue} {ids}
 *   GET  friends?q
 *   GET  lookup?q, GET account/{id}
 *   GET  export/{applications|board|votes|friends|reserved|users}
 *   GET  audit; GET audit-log?family&actor&subject&window&before&limit (.125: safe staff page)
 *   .114: GET|PUT bnet-switch {on, confirm}; GET|PUT leadership {guilds, namesConfirmed (.115)}; GET beta-reset, PUT beta-reset/closed {betaClosedAt},
 *         POST beta-reset {confirm, notice}; GET renames, POST renames/forced {auditId, confirm}, POST renames/{id}/approve|cancel
 *   .115: GET news, POST news {id,title,body,days}, POST news/update {id,revision,title,body,days}, POST news/delete {id,revision}
 *         (site-news.ts); settings.newsOn
 */
import { errorRef } from "./log";
import type { Env } from "./env";
import { audit, likeArg, now } from "./db";
import { normalizeCharacter } from "./codes";
import { apiJson, appOut, avatarUrl, BOARD_COUNTS, choicesOf, forgetBoardCounts, isSiteAdmin, labelOf, ON_BOARD, onBoardSql, readJson, readSession, sameOrigin, PAGE_VERSION, ROLE_OF_FIRST, searchMembers, shownName, UNDER_ROLE, type AppRow, type SiteUser } from "./site-core";
import { AVAIL_HOURS, availBits, BALLOTS, ballotOf, cleanAppointed, cleanNoVote, cleanText, fitFromBits, loadSettings, parseTime, POSITION_KEYS, professionOf, raidFit, roleLabel, settingsFrom, type SiteSettings } from "./site-data";
import { queueReserved, releaseReserved, releaseReservedStatements } from "./site-queue";
import { guildSeats } from "./guild-seats";
import { accountInfo, ownerOfCharacter } from "./lookup";
import { communityEraseStatements, fenceSql } from "./community-context";
import { handleCommunityAdmin } from "./community-routes";
import { rest } from "./discord";
import { bnetLoginState, setBnetSwitch } from "./bnet-switch";
import { betaResetState, loadLeadership, NAME_WITHHELD, recordBetaClosed, runBetaReset, saveLeadership } from "./site-leadership";
import { closeRenameHold, listRenames, markForcedRename } from "./rename-review";
import { handleNewsAdmin } from "./site-news";

const PAGE = 50;
const STATUSES = new Set(["submitted", "reviewing", "accepted", "declined", "withdrawn"]);
/**
 * An application's professions as rows (json_each), for SQL that has site_applications as `a`. The answers are always
 * JSON the Worker wrote, but a row that somehow is not reads as none instead of failing the whole query.
 */
const PROFESSIONS_OF_A = "json_each(CASE WHEN json_valid(a.answers) THEN a.answers ELSE '{}' END, '$.professions')";

export async function handleAdmin(request: Request, env: Env, path: string, admin: SiteUser, _waitUntil: (p: Promise<unknown>) => void): Promise<Response> {
  const m = request.method;
  const url = new URL(request.url);
  const q = url.searchParams;
  const parts = path.slice("/api/admin/".length).split("/");
  const body = m === "GET" ? {} : await readJson(request);
  if (body === null) return apiJson({ error: "bad_request" }, 400);
  const actor = admin.discord_id;

  if (parts[0] === "community") return handleCommunityAdmin(request, env, path, admin, body); // .57
  if (m === "GET" && parts[0] === "overview") return apiJson(await overview(env));
  if (m === "PUT" && parts[0] === "settings") return saveSettings(env, actor, body);
  // .114: the Battle.net sign-in switch (bnet-switch.ts), the I-X leadership directory and the beta reset (site-leadership.ts), forced renames (rename-review.ts)
  if (parts[0] === "bnet-switch" && !parts[1]) {
    if (m === "GET") return apiJson(await bnetLoginState(env));
    if (m === "PUT") {
      if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload" }, 409);
      const session = await readSession(env, request);
      if (!session || session.u !== actor) return apiJson({ error: "signed_out" }, 401);
      const on = body.on === true;
      if (on && body.confirm !== "ENABLE") return apiJson({ error: "confirm", message: "Type ENABLE to record a future enable request. Collection stays off until its reviewed release gates pass." }, 400);
      const r = await setBnetSwitch(env, actor, on, { sessionVersion: session.v, expiresAt: session.e });
      return r.ok ? apiJson({ ok: true, state: r.state }) : apiJson({ error: r.error, message: r.message }, 409);
    }
  }
  if (parts[0] === "leadership" && !parts[1]) {
    if (m === "GET") return apiJson(await loadLeadership(env));
    if (m === "PUT") {
      const r = await saveLeadership(env, actor, body);
      return r.ok ? apiJson({ ok: true, guilds: r.guilds }) : apiJson({ error: r.error, message: r.message }, r.error === "stale_directory" ? 409 : 400);
    }
  }
  if (parts[0] === "news") return handleNewsAdmin(request, env, parts.slice(1), admin, body); // .115: News notices (site-news.ts)
  if (parts[0] === "beta-reset") {
    if (m === "GET" && !parts[1]) return apiJson(await betaResetState(env));
    if (m === "PUT" && parts[1] === "closed") {
      const r = await recordBetaClosed(env, actor, body.betaClosedAt);
      return r.ok ? apiJson({ ok: true, state: await betaResetState(env) }) : apiJson({ error: r.status === 409 ? "reset_done" : "invalid", message: r.message }, r.status);
    }
    if (m === "POST" && !parts[1]) {
      const r = await runBetaReset(env, actor, body);
      return r.ok ? apiJson({ ok: true, cleared: r.cleared, state: await betaResetState(env) }) : apiJson({ error: "refused", message: r.message }, r.status);
    }
  }
  if (parts[0] === "renames") {
    if (m === "GET" && !parts[1]) return apiJson(await listRenames(env));
    if (m === "POST" && parts[1] === "forced") {
      if (body.confirm !== "REAPPLY") return apiJson({ error: "confirm", message: "Type REAPPLY to confirm." }, 400);
      const auditId = typeof body.auditId === "number" && Number.isInteger(body.auditId) && body.auditId > 0 ? body.auditId : 0;
      if (!auditId) return apiJson({ error: "bad_request" }, 400);
      const r = await markForcedRename(env, actor, auditId);
      return r.ok ? apiJson(r) : apiJson({ error: r.error, message: r.message }, r.status);
    }
    if (m === "POST" && /^\d{1,12}$/.test(parts[1] ?? "") && (parts[2] === "approve" || parts[2] === "cancel")) {
      const r = await closeRenameHold(env, actor, Number(parts[1]), parts[2] === "approve" ? "approved" : "cancelled");
      return r.ok ? apiJson({ ok: true }) : apiJson({ error: r.error, message: r.message, missing: r.missing }, r.status);
    }
  }
  if (m === "GET" && parts[0] === "applications" && !parts[1]) return listApplications(env, q);
  if (m === "GET" && parts[0] === "applications" && parts[1]) return applicationDetail(env, parts[1]);
  if (m === "POST" && parts[0] === "applications" && parts[2] === "status") return setStatus(env, actor, parts[1], body);
  if (m === "POST" && parts[0] === "users" && parts[2] === "deny") return deny(env, actor, parts[1], body);
  if (m === "POST" && parts[0] === "users" && parts[2] === "undeny") return undeny(env, actor, parts[1]);
  if (m === "POST" && parts[0] === "users" && parts[2] === "delete") {
    if (!isId(parts[1])) return apiJson({ error: "bad_request" }, 400);
    if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload" }, 409);
    try {
      return (await deleteSiteData(env, parts[1], actor, body.mentions === true, request)) ? apiJson({ ok: true }) : apiJson({ error: "not_found", message: "That account has nothing on this site." }, 404);
    } catch (e) {
      if (!(e instanceof SiteErasureHeld)) throw e;
      return apiJson({ error: "erasure_held", message: "Site-only deletion was not confirmed. Inspect the account and its audit record before trying again. Full erasure remains unavailable." }, 503);
    }
  }
  if (m === "POST" && parts[0] === "users" && parts[2] === "mentions") {
    if (!isId(parts[1])) return apiJson({ error: "bad_request" }, 400);
    return deleteMentions(env, parts[1], actor);
  }
  if (m === "GET" && parts[0] === "availability") return availability(env, q);
  if (m === "GET" && parts[0] === "board" && !parts[1]) return boardTallies(env, q);
  if (m === "GET" && parts[0] === "board" && parts[1] === "voters") return boardVoters(env, q);
  if (m === "GET" && parts[0] === "votes" && !parts[1]) return tallies(env, q);
  if (m === "GET" && parts[0] === "votes" && parts[1] === "voters") return voters(env, q);
  if (m === "GET" && parts[0] === "reserved") return listReserved(env, q);
  if (m === "POST" && parts[0] === "reserved" && parts[1]) return reservedAction(env, actor, parts[1], body);
  if (m === "GET" && parts[0] === "friends") return friends(env, q);
  if (m === "GET" && parts[0] === "lookup") return lookup(env, q);
  if (m === "GET" && parts[0] === "account" && parts[1]) {
    if (!/^\d{17,20}$/.test(parts[1])) return apiJson({ error: "bad_request" }, 400);
    return apiJson(await accountWithNames(env, parts[1]));
  }
  if (m === "GET" && parts[0] === "export" && parts[1]) return exportPage(env, parts[1], q);
  if (m === "GET" && parts[0] === "audit-log" && !parts[1]) return auditLog(request, env, q, admin);
  if (m === "GET" && parts[0] === "audit") return recentAudit(request, env, admin);
  return apiJson({ error: "not_found" }, 404);
}

/** accountInfo, plus the account's names from Discord when neither the site nor the bot has them yet (one call). */
async function accountWithNames(env: Env, id: string) {
  const info = await accountInfo(env, id);
  if (!info.names.username && env.DISCORD_BOT_TOKEN) {
    try {
      const u = await rest<{ username: string; global_name?: string | null }>(env, "GET", `/users/${id}`, undefined, 1);
      info.names.username = u.username;
      info.names.displayName = u.global_name ?? null;
    } catch {
      /* unknown or deleted account: shown by id */
    }
  }
  return info;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^\d{17,20}$/.test(v);
const intParam = (v: string | null, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
export { likeArg }; // kept here too for the tests

function userOut(env: Env, r: { discord_id: string; username: string | null; global_name: string | null; nick: string | null; avatar: string | null; account_created: number | null; server_joined: number | null; in_server: number; denied: number }) {
  return {
    id: r.discord_id,
    username: r.username,
    displayName: r.global_name,
    nick: r.nick,
    label: labelOf({ username: r.username, displayName: r.global_name, nick: r.nick }),
    shown: shownName({ username: r.username, displayName: r.global_name, nick: r.nick }), // .114: every differing name, display only
    avatarUrl: avatarUrl(env, r.discord_id, r.avatar),
    accountCreated: r.account_created,
    serverJoined: r.server_joined,
    inServer: !!r.in_server,
    denied: !!r.denied,
  };
}

// ---------- overview and settings ----------

async function overview(env: Env) {
  const c = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM site_users) AS users,
            (SELECT COUNT(*) FROM site_users WHERE denied = 1) AS denied,
            (SELECT COUNT(*) FROM site_users WHERE in_server = 0) AS left,
            (SELECT COUNT(DISTINCT voter_id) FROM site_votes) AS voters,
            (SELECT COUNT(*) FROM site_votes) AS votes,
            (SELECT COUNT(DISTINCT voter_id) FROM site_board_votes) AS boardVoters,
            (SELECT COUNT(*) FROM site_board_votes) AS boardVotes,
            (SELECT COUNT(DISTINCT owner_id) FROM site_friends) AS friendLists,
            (SELECT COUNT(*) FROM site_friends) AS friends`,
  ).first<Record<string, number>>();
  const apps = await env.DB.prepare("SELECT position, status, COUNT(*) AS n FROM site_applications GROUP BY position, status").all<{ position: string; status: string; n: number }>();
  const reserved = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM site_reserved GROUP BY status").all<{ status: string; n: number }>();
  const queue = await env.DB.prepare(
    "SELECT COUNT(*) AS waiting, SUM(CASE WHEN priority > 0 THEN 1 ELSE 0 END) AS reserved FROM invite_queue WHERE status IN ('queued','written')",
  ).first<{ waiting: number; reserved: number | null }>();
  // .45: who plans to take which profession, over the open applications of accounts that are not denied.
  const profs = await env.DB.prepare(
    `SELECT j.value AS profession, COUNT(*) AS n
       FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id, ${PROFESSIONS_OF_A} j
      WHERE a.status IN ('submitted','reviewing') AND u.denied = 0 AND j.type = 'text'
      GROUP BY j.value`,
  ).all<{ profession: string; n: number }>();
  return {
    now: now(),
    counts: c ?? {},
    applications: apps.results,
    professions: profs.results.filter((r) => professionOf(r.profession)),
    reserved: reserved.results,
    queue: { waiting: queue?.waiting ?? 0, reserved: queue?.reserved ?? 0 },
    seats: (await guildSeats(env)).seats, // .115 (item B): exact, staff only (guild-seats.ts)
    settings: await loadSettings(env),
  };
}

async function saveSettings(env: Env, actor: string, body: Record<string, unknown>): Promise<Response> {
  const read = await env.DB.prepare("SELECT key, value FROM site_settings").all<{ key: string; value: string }>();
  const cur = settingsFrom(env, read.results);
  const storedValues = new Map(read.results.map((r) => [r.key, r.value]));
  const next: Partial<Record<keyof SiteSettings, string>> = {};
  const time = (k: "namesOpenAt" | "launchAt") => {
    if (body[k] === undefined) return true;
    const t = typeof body[k] === "number" ? Math.floor(body[k] as number) : parseTime(String(body[k]), -1);
    if (!(t > 1_700_000_000 && t < 2_200_000_000)) return false;
    next[k] = String(t);
    return true;
  };
  if (!time("namesOpenAt")) return apiJson({ error: "invalid", field: "namesOpenAt", message: "That reservation time could not be read." }, 400);
  if (!time("launchAt")) return apiJson({ error: "invalid", field: "launchAt", message: "That launch time could not be read." }, 400);
  // .115: newsOn switches the members' News page (site-news.ts); saved and audited like the other switches
  for (const k of ["namesTimeConfirmed", "namesOpen", "autoQueue", "applicationsOpen", "votingOpen", "newsOn"] as const) {
    if (body[k] !== undefined) next[k] = body[k] === true ? "1" : "0";
  }
  if (body.notice !== undefined) next.notice = cleanText(body.notice, 300);
  let appointedObj: Record<string, string> | null = null; // .115: the cleaned map itself, for the consent check and the audit's role keys
  if (body.appointed !== undefined) {
    appointedObj = cleanAppointed(body.appointed);
    if (!appointedObj) return apiJson({ error: "invalid", field: "appointed", message: "The appointed roles could not be read." }, 400);
    next.appointed = JSON.stringify(appointedObj);
  }
  if (body.noVote !== undefined) {
    const noVote = cleanNoVote(body.noVote);
    if (!noVote) return apiJson({ error: "invalid", field: "noVote", message: "The roles without a public vote could not be read." }, 400);
    next.noVote = JSON.stringify(noVote);
  }
  // .115 (Viktor's item C, 2 Oct 2026): an appointed name is public on the open web, so it is typed only after that person
  // agreed. A name added, or changed for a role, needs the administrator's namesConfirmed; keeping a name, clearing one
  // (the role reopens) or typing NAME_WITHHELD (the role stays appointed) does not. The comparison is with what is stored
  // now, read above; the atomic expected-value guard below also refuses a removal/replacement after this read. Refused
  // before anything is written: the whole save waits for the tick. The server checks the tick, not the agreement itself.
  if (appointedObj) {
    const stored = cur.appointed;
    const changed = Object.entries(appointedObj).filter(([key, who]) => who !== NAME_WITHHELD && !(Object.prototype.hasOwnProperty.call(stored, key) && stored[key] === who));
    if (changed.length > 0 && body.namesConfirmed !== true) {
      return apiJson({ error: "confirm_names", field: "appointed", message: "Confirm that each person you name agreed to be named. Appointed names are public on the open web." }, 400);
    }
  }
  const entries = Object.entries(next) as Array<[string, string]>;
  if (!entries.length) return apiJson({ ok: true, settings: cur });
  const t = now();
  const expected = Object.fromEntries(entries.map(([k]) => [k, storedValues.get(k) ?? null]));
  // Materialize admission before any target row changes: either EVERY submitted key still has its exact stored value
  // (including absence), or no key is written. One statement prevents an appointed/notice removal from being undone
  // between the consent comparison and the write, and prevents a stale save from partially applying other switches.
  const saved = await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at, updated_by)
     WITH admission AS MATERIALIZED (
       SELECT 1 WHERE NOT EXISTS (
         SELECT 1 FROM json_each(?2) expected LEFT JOIN site_settings current ON current.key = expected.key
          WHERE current.value IS NOT expected.value
       )
     )
     SELECT next.key, next.value, ?3, ?4 FROM json_each(?1) next, admission WHERE 1
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).bind(JSON.stringify(next), JSON.stringify(expected), t, actor).run();
  if ((saved.meta?.changes ?? 0) === 0) {
    return apiJson({ error: "stale_settings", message: "Settings changed while this save was pending. Nothing was saved. Reload the page before editing again." }, 409);
  }
  await audit(env, actor, "site.settings", undefined, settingsAuditDetails(next, appointedObj, body.namesConfirmed === true));
  return apiJson({ ok: true, settings: await loadSettings(env) });
}

/**
 * What the dated log keeps of a settings save. .115 (Viktor, item C, 2 Oct 2026): the dated log outlives an erasure, so
 * typed names and the notice text are counted, never written. The appointed map becomes its role keys (sorted, from the
 * cleaned map, never from its JSON text) and how many names were saved; the notice becomes whether a non-empty one was
 * saved, as the beta reset records it (site-leadership.ts); namesConfirmed is recorded only when it was sent. The
 * switches, newsOn, the roles without a public vote and the times are kept as before. schema.ts redactSettingsAudit
 * rewrites the rows written before .115 to the same shape once, at an isolate start (marker auditTypedNames; a failure is
 * logged and a fresh isolate tries again), and the counts-only read-back of docs/deploy-checklist.md .115 rollout step 7
 * is the acceptance gate that it did (Codex, 3 Oct 2026 13:24 UTC; the second review round).
 */
function settingsAuditDetails(next: Partial<Record<keyof SiteSettings, string>>, appointed: Record<string, string> | null, namesConfirmed: boolean): Record<string, unknown> {
  const { appointed: _names, notice, ...rest } = next;
  const out: Record<string, unknown> = { ...rest };
  if (notice !== undefined) out.notice = notice !== "";
  if (appointed) {
    out.appointedRoles = Object.keys(appointed).sort();
    out.appointedNames = Object.keys(appointed).length;
  }
  if (namesConfirmed) out.namesConfirmed = true;
  return out;
}

// ---------- applications ----------

async function listApplications(env: Env, q: URLSearchParams): Promise<Response> {
  const where: string[] = [];
  const args: unknown[] = [];
  const position = q.get("position") ?? "";
  if (position && POSITION_KEYS.has(position)) {
    args.push(position);
    const n = args.length;
    // With backups=1, a backup choice counts too (Class Lead backups carry their class: class_lead:mage).
    where.push(q.get("backups") === "1"
      ? `(a.position = ?${n} OR a.backup1 = ?${n} OR a.backup2 = ?${n} OR (?${n} = 'class_lead' AND (a.backup1 LIKE 'class\\_lead:%' ESCAPE '\\' OR a.backup2 LIKE 'class\\_lead:%' ESCAPE '\\')))`
      : `a.position = ?${n}`);
  }
  // .45: the applications that plan to take a profession (the Overview's professions table links here).
  const profession = professionOf(q.get("profession") ?? "");
  if (profession) {
    args.push(profession.key);
    where.push(`EXISTS (SELECT 1 FROM ${PROFESSIONS_OF_A} j WHERE j.value = ?${args.length})`);
  }
  const status = q.get("status") ?? "";
  if (status === "denied") where.push("u.denied = 1");
  else if (status && STATUSES.has(status)) {
    args.push(status);
    where.push(`a.status = ?${args.length} AND u.denied = 0`);
  } else if (status === "open") where.push("a.status IN ('submitted','reviewing') AND u.denied = 0");
  const text = cleanText(q.get("q"), 40);
  if (text) {
    // Names: plain LIKE, which ignores case for A-Z (SQLite's LOWER() would not touch É either, so it adds nothing).
    // Character keys: the same normalisation they were stored with.
    args.push(likeArg(text), likeArg(normalizeCharacter(text)));
    const n = args.length - 1;
    where.push(`(u.username LIKE ?${n} ESCAPE '\\' OR u.global_name LIKE ?${n} ESCAPE '\\' OR u.nick LIKE ?${n} ESCAPE '\\' OR a.char_key LIKE ?${n + 1} ESCAPE '\\')`);
  }
  const sql = `FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
  const offset = intParam(q.get("offset"), 0, 1_000_000, 0);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n ${sql}`).bind(...args).first<{ n: number }>();
  const sort = q.get("sort") === "old" ? "a.created_at ASC" : "a.updated_at DESC";
  const rows = await env.DB.prepare(`SELECT a.*, u.username, u.global_name, u.nick, u.avatar, u.account_created, u.server_joined, u.in_server, u.denied ${sql} ORDER BY ${sort} LIMIT ${PAGE} OFFSET ${offset}`)
    .bind(...args)
    .all<Record<string, unknown>>();
  return apiJson({
    total: total?.n ?? 0,
    offset,
    pageSize: PAGE,
    items: rows.results.map((r) => ({ user: userOut(env, r as never), ...appOut(r as never, true) })),
  });
}

async function applicationDetail(env: Env, id: string): Promise<Response> {
  if (!isId(id)) return apiJson({ error: "bad_request" }, 400);
  const row = await env.DB.prepare(
    "SELECT a.*, u.username, u.global_name, u.nick, u.avatar, u.account_created, u.server_joined, u.in_server, u.denied, u.denied_reason FROM site_users u LEFT JOIN site_applications a ON a.discord_id = u.discord_id WHERE u.discord_id = ?1",
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return apiJson({ error: "not_found" }, 404);
  const friendsOf = await env.DB.prepare("SELECT friend_kind AS kind, friend_key AS key, friend_label AS label, note FROM site_friends WHERE owner_id = ?1 ORDER BY created_at")
    .bind(id)
    .all();
  const listedBy = await env.DB.prepare(
    "SELECT f.owner_id AS id, u.username, u.global_name, u.nick, f.note FROM site_friends f LEFT JOIN site_users u ON u.discord_id = f.owner_id WHERE f.friend_kind = 'discord' AND f.friend_key = ?1 ORDER BY f.created_at LIMIT 50",
  )
    .bind(id)
    .all<{ id: string; username: string | null; global_name: string | null; nick: string | null; note: string | null }>();
  const nominated = await env.DB.prepare(
    "SELECT v.ballot, COUNT(*) AS n FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id AND u.denied = 0 WHERE v.nominee_kind = 'discord' AND v.nominee_key = ?1 GROUP BY v.ballot ORDER BY n DESC",
  )
    .bind(id)
    .all<{ ballot: string; n: number }>();
  const cast = await env.DB.prepare("SELECT ballot, slot, nominee_kind AS kind, nominee_key AS key, nominee_label AS label, reason FROM site_votes WHERE voter_id = ?1 ORDER BY ballot, slot")
    .bind(id)
    .all();
  // The voting board: for and against, per role, from voters who are not denied and still in the server.
  const board = await env.DB.prepare(
    `SELECT v.role_key AS role, SUM(CASE WHEN v.vote > 0 THEN 1 ELSE 0 END) AS yes, SUM(CASE WHEN v.vote < 0 THEN 1 ELSE 0 END) AS no
       FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id AND u.denied = 0 AND u.in_server = 1
      WHERE v.candidate_id = ?1 GROUP BY v.role_key`,
  )
    .bind(id)
    .all<{ role: string; yes: number; no: number }>();
  const boardCast = await env.DB.prepare("SELECT COUNT(*) AS n FROM site_board_votes WHERE voter_id = ?1").bind(id).first<{ n: number }>();
  const info = await accountInfo(env, id);
  const app = row.position ? appOut(row as never, true) : null;
  const tally = new Map(board.results.map((r) => [r.role, r]));
  const roles = app ? choicesOf(row as never as AppRow).filter((r) => ballotOf(r)) : []; // Raider and Member are not voted on
  return apiJson({
    user: { ...userOut(env, { ...row, discord_id: id } as never), deniedReason: row.denied_reason ?? null },
    application: app,
    // Every role they are (or were) listed under, their own choices first, with the board's counts.
    board: [...roles, ...board.results.map((r) => r.role).filter((r) => !roles.includes(r))].map((r) => ({
      role: r,
      label: roleLabel(r),
      choice: roles.indexOf(r) + 1,
      yes: tally.get(r)?.yes ?? 0,
      no: tally.get(r)?.no ?? 0,
    })),
    boardVotesCast: boardCast?.n ?? 0,
    friends: friendsOf.results,
    listedBy: listedBy.results.map((r) => ({ id: r.id, label: labelOf({ username: r.username, displayName: r.global_name, nick: r.nick }), note: r.note })),
    nominated: nominated.results.map((r) => ({ ballot: r.ballot, label: ballotOf(r.ballot)?.label ?? roleLabel(r.ballot), n: r.n })),
    votesCast: cast.results,
    account: info,
  });
}

async function setStatus(env: Env, actor: string, id: string, body: Record<string, unknown>): Promise<Response> {
  if (!isId(id)) return apiJson({ error: "bad_request" }, 400);
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) return apiJson({ error: "invalid", message: "Unknown status." }, 400);
  const note = body.note === undefined ? undefined : cleanText(body.note, 1000, true);
  // .114 (Codex, log 19:17 UTC): a withdrawn application is the member's to submit again before anyone accepts it; this is
  // what makes "a new application that the leadership reviews" real after a rename Blizzard required (rename-review.ts)
  if (status === "accepted") {
    const cur = await env.DB.prepare("SELECT status FROM site_applications WHERE discord_id = ?1").bind(id).first<{ status: string }>();
    if (cur?.status === "withdrawn") return apiJson({ error: "withdrawn", message: "This application is withdrawn: the member has to submit it again before it can be accepted." }, 409);
  }
  const r = await env.DB.prepare(
    `UPDATE site_applications SET status = ?2, reviewed_by = ?3, reviewed_at = ?4${note === undefined ? "" : ", admin_note = ?5"} WHERE discord_id = ?1 AND NOT (?2 = 'accepted' AND status = 'withdrawn')`,
  )
    .bind(...[id, status, actor, now(), ...(note === undefined ? [] : [note || null])])
    .run();
  if (!r.meta.changes) return apiJson({ error: "not_found" }, 404);
  forgetBoardCounts();
  await audit(env, actor, "site.application_status", id, { status });
  return applicationDetail(env, id);
}

async function deny(env: Env, actor: string, id: string, body: Record<string, unknown>): Promise<Response> {
  if (!isId(id)) return apiJson({ error: "bad_request" }, 400);
  const reason = cleanText(body.reason, 300) || null;
  const r = await env.DB.prepare(
    "UPDATE site_users SET denied = 1, denied_reason = ?2, denied_at = ?3, denied_by = ?4, session_version = session_version + 1 WHERE discord_id = ?1",
  )
    .bind(id, reason, now(), actor)
    .run();
  if (!r.meta.changes) return apiJson({ error: "not_found", message: "That account never signed in here." }, 404);
  const released = await releaseReserved(env, { ownerId: id }, actor);
  forgetBoardCounts();
  await audit(env, actor, "site.denied", id, { reason, released });
  return applicationDetail(env, id);
}

async function undeny(env: Env, actor: string, id: string): Promise<Response> {
  if (!isId(id)) return apiJson({ error: "bad_request" }, 400);
  const r = await env.DB.prepare("UPDATE site_users SET denied = 0, denied_reason = NULL, denied_at = NULL, denied_by = NULL WHERE discord_id = ?1 AND denied = 1")
    .bind(id)
    .run();
  if (!r.meta.changes) return apiJson({ error: "not_found", message: "That account is not denied." }, 404);
  forgetBoardCounts();
  await audit(env, actor, "site.undenied", id);
  return applicationDetail(env, id);
}

/**
 * What other members entered about an account: write-ins naming it, friends-list entries, and references in their
 * applications (taken out of the list; the rest of the application stays as written). As statements for one batch.
 */
function mentionDeletes(env: Env, id: string) {
  // .133: scrub the consuming-time document, never a stale whole-answer copy prepared before the batch.
  // Descending index removal preserves every other value (including primitives and large numeric spellings).
  // Ambiguous duplicate keys and malformed/non-array legacy documents remain untouched; this is site-only erasure.
  const exactReference = `CASE WHEN e.type = 'object' THEN
    (SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key = 'kind') = 1
    AND (SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key = 'key') = 1
    AND json_type(e.value, '$.kind') = 'text' AND json_extract(e.value, '$.kind') = 'discord'
    AND json_type(e.value, '$.key') = 'text' AND json_extract(e.value, '$.key') = ?1 ELSE 0 END`;
  return [
    env.DB.prepare("DELETE FROM site_votes WHERE nominee_kind = 'discord' AND nominee_key = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_friends WHERE friend_kind = 'discord' AND friend_key = ?1").bind(id),
    env.DB.prepare(`UPDATE site_applications AS a SET answers = (
      WITH RECURSIVE matches(idx, ordinal) AS (
        SELECT CAST(e.key AS INTEGER), ROW_NUMBER() OVER (ORDER BY CAST(e.key AS INTEGER) DESC)
        FROM json_each(a.answers, '$.references') e WHERE ${exactReference}
      ), scrubbed(ordinal, text) AS (
        SELECT 0, a.answers UNION ALL
        SELECT s.ordinal + 1, json_remove(s.text, '$.references[' || m.idx || ']')
        FROM scrubbed s JOIN matches m ON m.ordinal = s.ordinal + 1
      ) SELECT text FROM scrubbed ORDER BY ordinal DESC LIMIT 1
    ) WHERE a.discord_id <> ?1 AND CASE
      WHEN NOT json_valid(a.answers) THEN 0
      WHEN json_type(a.answers) <> 'object' THEN 0
      WHEN COALESCE(json_type(a.answers, '$.references'), '') <> 'array' THEN 0
      WHEN (SELECT COUNT(*) FROM json_each(a.answers) f WHERE f.key = 'references') <> 1 THEN 0
      ELSE EXISTS (SELECT 1 FROM json_each(a.answers, '$.references') e WHERE ${exactReference}) END`).bind(id),
  ];
}

/**
 * Legacy site-only deletion: what they entered, their votes, the votes others cast
 * on their application, and the account row. Staff do this on request from the admin page (the site has no "delete my
 * data" button: the policy linked from the Discord application says to ask staff). Reserved names already in the
 * invite queue are taken out of it. A permanent denial outlives the data: the row stays with nothing in it but the id
 * and the denial, so the same account cannot simply sign up again. With `mentions`, what other members entered about
 * the account goes too. This does not delete the bot's verification records or complete full erasure.
 * .133: reservation release, registered site erasers and the existing restore/audit record commit in one transaction.
 * The original signed staff session and captured target state are consumed before any mutation. A refusal aborts the
 * whole D1 batch, including opaque registry statements; no current-session fallback exists for internal callers.
 */
class SiteErasureHeld extends Error {
  constructor() { super("site_erasure_held"); }
}

export async function deleteSiteData(env: Env, id: string, actor: string, mentions = false, request?: Request): Promise<boolean> {
  if (!request || !isId(id) || !isSiteAdmin(env, actor) || request.method !== "POST" ||
      new URL(request.url).pathname !== `/api/admin/users/${id}/delete` ||
      request.headers.get("X-Olympus") !== PAGE_VERSION || !sameOrigin(request)) throw new SiteErasureHeld();
  const session = await readSession(env, request);
  if (!session || session.u !== actor || !Number.isSafeInteger(session.v) || session.v < 1 ||
      !Number.isSafeInteger(session.e)) throw new SiteErasureHeld();
  const row = await env.DB.prepare("SELECT denied, denied_at, session_version, first_login FROM site_users WHERE discord_id = ?1")
    .bind(id).first<{ denied: number; denied_at: number | null; session_version: number; first_login: number }>();
  if (!row) return false;
  const statements = [
    // CASE is lazy: its invalid JSON branch deliberately aborts a refused transaction before any registry mutation.
    // D1 batch() rolls the complete sequence back when any statement fails. The database clock judges cookie expiry.
    env.DB.prepare(`SELECT CASE WHEN ${fenceSql("authenticatedIdentity", 1, 2, 3)}
      AND EXISTS (SELECT 1 FROM site_users target WHERE target.discord_id = ?4 AND target.session_version = ?5
        AND target.first_login = ?6 AND target.denied = ?7 AND target.denied_at IS ?8)
      THEN 1 ELSE json_extract('site_erasure_refused', '$') END AS admitted`)
      .bind(actor, session.v, session.e, id, row.session_version, row.first_login, row.denied, row.denied_at),
    ...releaseReservedStatements(env, { ownerId: id }, actor),
    ...(mentions ? await mentionDeletes(env, id) : []),
    ...communityEraseStatements(env, id), // .56: every community feature's rows, in the same batch
    // .71: the account's identity as a staff actor on the site's own tables goes too (the audit log keeps actor ids: the dated log the privacy text names)
    env.DB.prepare("UPDATE site_applications SET reviewed_by = NULL WHERE reviewed_by = ?1").bind(id),
    env.DB.prepare("UPDATE site_reserved SET approved_by = CASE WHEN approved_by = ?1 THEN NULL ELSE approved_by END, released_by = CASE WHEN released_by = ?1 THEN 'erased' ELSE released_by END WHERE ?1 IN (approved_by, released_by)").bind(id),
    env.DB.prepare("UPDATE site_settings SET updated_by = NULL WHERE updated_by = ?1").bind(id),
    env.DB.prepare("UPDATE site_users SET denied_by = NULL WHERE denied_by = ?1").bind(id),
    // .74: and on the bot's invite queue (the approving officer, the watcher's claim); the queue row itself is the bot's and stays
    env.DB.prepare("UPDATE invite_queue SET approved_by = NULL WHERE approved_by = ?1").bind(id),
    env.DB.prepare("UPDATE invite_queue SET claimed_by = NULL WHERE claimed_by = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_applications WHERE discord_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_votes WHERE voter_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_board_votes WHERE voter_id = ?1 OR candidate_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_friends WHERE owner_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_reserved WHERE owner_id = ?1").bind(id),
    row.denied
      ? env.DB.prepare(
          `UPDATE site_users SET username = NULL, global_name = NULL, nick = NULL, avatar = NULL, account_created = NULL, server_joined = NULL,
             first_login = COALESCE(denied_at, first_login), last_login = COALESCE(denied_at, first_login), session_version = session_version + 1
           WHERE discord_id = ?1`,
        ).bind(id)
      : env.DB.prepare("DELETE FROM site_users WHERE discord_id = ?1").bind(id),
    // The dated audit is also the existing manual-restore replay record. Its failure rolls back every earlier write.
    env.DB.prepare("INSERT INTO audit(ts, actor, action, subject, details) SELECT CAST(strftime('%s', 'now') AS INTEGER), ?1, 'site.data_deleted', ?2, ?3 WHERE changes() = 1")
      .bind(actor, id, JSON.stringify({ mentions })),
    // A silent/ignored terminal mutation or audit insert must fail inside the transaction, before it can commit.
    env.DB.prepare(`SELECT CASE WHEN changes() = 1 AND EXISTS (
      SELECT 1 FROM audit WHERE id = last_insert_rowid() AND actor = ?1 AND action = 'site.data_deleted'
        AND subject = ?2 AND details = ?3
    ) THEN 1 ELSE json_extract('site_erasure_receipt_refused', '$') END AS recorded`)
      .bind(actor, id, JSON.stringify({ mentions })),
  ];
  try {
    const results = await env.DB.batch<{ admitted?: number; recorded?: number }>(statements);
    if (!Array.isArray(results) || results.length !== statements.length || results.some(r => !r || ("success" in r && r.success !== true)) ||
        results[0]?.results?.[0]?.admitted !== 1 || results.at(-2)?.meta?.changes !== 1 ||
        results.at(-1)?.results?.[0]?.recorded !== 1) throw new SiteErasureHeld();
  } catch {
    // A refused transaction or unreadable/lost result is held. Never infer success or run a partial repair/retry.
    forgetBoardCounts();
    throw new SiteErasureHeld();
  }
  forgetBoardCounts();
  return true;
}

/**
 * For someone who never signed in here but asks to be forgotten: only what others entered about them. Refused (409)
 * once the account has signed in, so this can never remove an account's own data: that is deleteSiteData, from the
 * account's own admin page, with its own confirmation.
 */
async function deleteMentions(env: Env, id: string, actor: string): Promise<Response> {
  if (await env.DB.prepare("SELECT 1 FROM site_users WHERE discord_id = ?1").bind(id).first()) {
    return apiJson({ error: "signed_up", message: "This account has signed in here since. Open its page and use “Delete their site data” there." }, 409);
  }
  const done = await env.DB.batch(await mentionDeletes(env, id));
  const removed = done.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  if (!removed) return apiJson({ error: "not_found", message: "Nothing on this site names that account." }, 404);
  await audit(env, actor, "site.mentions_deleted", id, { removed });
  return apiJson({ ok: true, removed });
}

// ---------- availability ----------

/**
 * When the applicants can play: the grid of every open application (not denied), summed per UTC hour of the week. With
 * a role, only the applications that name it (first choice or backup). The page draws it in the admin's own time.
 */
async function availability(env: Env, q: URLSearchParams): Promise<Response> {
  const role = q.get("role") ?? "";
  const ballot = role ? ballotOf(role) : null;
  if (role && !ballot && !POSITION_KEYS.has(role)) return apiJson({ error: "not_found" }, 404);
  const rows = await env.DB.prepare(
    `SELECT a.avail, a.fit_na, a.fit_eu FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id
      WHERE a.status IN ('submitted','reviewing') AND u.denied = 0 AND a.avail IS NOT NULL
        ${role ? `AND ${UNDER_ROLE(1)}` : ""}`,
  )
    .bind(...(role ? [role] : []))
    .all<{ avail: string; fit_na: number | null; fit_eu: number | null }>();
  const hours = new Array<number>(AVAIL_HOURS).fill(0);
  let n = 0;
  let na = 0;
  let eu = 0;
  for (const r of rows.results) {
    const bits = availBits(r.avail);
    if (!bits) continue;
    n++;
    for (let h = 0; h < AVAIL_HOURS; h++) hours[h] += bits[h];
    const fit = r.fit_na === null || r.fit_eu === null ? fitFromBits(bits) : { na: r.fit_na, eu: r.fit_eu };
    if (fit.na >= 3) na++;
    if (fit.eu >= 3) eu++;
  }
  return apiJson({ role: role || null, applications: n, hours, fits: { na, eu } });
}

// ---------- the voting board ----------

/**
 * For and against, per role. Without a role: every role with its number of applicants on the board, voters, and the
 * three with the best balance among those on the board now. With one: every applicant under it (on the board now, or
 * voted on before they left it, flagged), with their counts. Voters are filtered like the write-ins below.
 */
async function boardTallies(env: Env, q: URLSearchParams): Promise<Response> {
  const f = voterFilter(q);
  const n = f.args.length;
  const role = q.get("role") ?? "";
  const yesNo = "SUM(CASE WHEN v.vote > 0 THEN 1 ELSE 0 END) AS yes, SUM(CASE WHEN v.vote < 0 THEN 1 ELSE 0 END) AS no";
  if (!role) {
    const rows = await env.DB.prepare(
      `SELECT v.role_key AS role, v.candidate_id AS id, ${yesNo}
         FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id
         JOIN site_applications a ON a.discord_id = v.candidate_id
         JOIN site_users cu ON cu.discord_id = v.candidate_id
        WHERE ${f.sql} AND ${onBoardSql("cu")} AND (${ROLE_OF_FIRST} = v.role_key OR a.backup1 = v.role_key OR a.backup2 = v.role_key)
        GROUP BY v.role_key, v.candidate_id`,
    )
      .bind(...f.args)
      .all<{ role: string; id: string; yes: number; no: number }>();
    const voters = await env.DB.prepare(
      `SELECT v.role_key AS role, COUNT(DISTINCT v.voter_id) AS n FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id WHERE ${f.sql} GROUP BY v.role_key`,
    )
      .bind(...f.args)
      .all<{ role: string; n: number }>();
    const onBoard = await env.DB.prepare(BOARD_COUNTS).all<{ rk: string; n: number }>();
    const byRole = new Map<string, Array<{ id: string; yes: number; no: number }>>();
    for (const r of rows.results) {
      const list = byRole.get(r.role) ?? [];
      list.push(r);
      byRole.set(r.role, list);
    }
    const tops = new Map([...byRole].map(([k, list]) => [k, list.sort((x, y) => y.yes - y.no - (x.yes - x.no) || y.yes - x.yes).slice(0, 3)]));
    const names = await namesOf(env, [...new Set([...tops.values()].flat().map((r) => r.id))]);
    const count = new Map(onBoard.results.map((r) => [r.rk, r.n]));
    const vc = new Map(voters.results.map((r) => [r.role, r.n]));
    return apiJson({
      roles: BALLOTS.map((b) => ({
        key: b.key,
        label: b.label,
        applicants: count.get(b.key) ?? 0,
        voters: vc.get(b.key) ?? 0,
        top: (tops.get(b.key) ?? []).map((r) => ({ id: r.id, label: names.get(r.id)?.label ?? r.id, yes: r.yes, no: r.no })),
      })),
    });
  }
  const b = ballotOf(role);
  if (!b) return apiJson({ error: "not_found" }, 404);
  // Everyone listed under the role now, and everyone with votes for it; one query, the counts from the filtered voters.
  const rows = await env.DB.prepare(
    `WITH t AS (
       SELECT v.candidate_id AS id, ${yesNo}
         FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id
        WHERE v.role_key = ?${n + 1} AND ${f.sql}
        GROUP BY v.candidate_id)
     SELECT cu.discord_id AS id, cu.username, cu.global_name, cu.nick, cu.avatar, cu.denied, cu.in_server,
            a.status, a.class, a.avail, a.position, a.class_lead, a.region, a.backup1, a.backup2, a.board_at,
            COALESCE(t.yes, 0) AS yes, COALESCE(t.no, 0) AS no
       FROM site_users cu
       LEFT JOIN site_applications a ON a.discord_id = cu.discord_id
       LEFT JOIN t ON t.id = cu.discord_id
      WHERE t.id IS NOT NULL
         OR (a.discord_id IS NOT NULL AND ${onBoardSql("cu")}
             AND (${ROLE_OF_FIRST} = ?${n + 1} OR a.backup1 = ?${n + 1} OR a.backup2 = ?${n + 1}))`,
  )
    .bind(...f.args, b.key)
    .all<Record<string, unknown>>();
  const voters = await env.DB.prepare(
    `SELECT COUNT(DISTINCT v.voter_id) AS n FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id WHERE v.role_key = ?${n + 1} AND ${f.sql}`,
  )
    .bind(...f.args, b.key)
    .first<{ n: number }>();
  return apiJson({
    role: { key: b.key, label: b.label },
    voters: voters?.n ?? 0,
    candidates: rows.results
      .map((r) => {
        const id = String(r.id);
        const app = r.position ? (r as never as AppRow) : null;
        const choice = app ? choicesOf(app).indexOf(b.key) + 1 : 0;
        const onBoard = !!app && (r.status === "submitted" || r.status === "reviewing") && r.board_at !== null && !r.denied && !!r.in_server && choice > 0;
        return {
          id,
          label: labelOf({ username: (r.username as string) ?? null, displayName: (r.global_name as string) ?? null, nick: (r.nick as string) ?? null }),
          avatarUrl: avatarUrl(env, id, (r.avatar as string) ?? null),
          yes: Number(r.yes ?? 0),
          no: Number(r.no ?? 0),
          onBoard,
          status: (r.status as string) ?? null,
          denied: !!r.denied,
          choice,
          class: (r.class as string) ?? null,
          fit: raidFit(r.avail as string | null),
        };
      })
      .sort((x, y) => y.yes - y.no - (x.yes - x.no) || y.yes - x.yes || (x.label < y.label ? -1 : 1)),
  });
}

/** Names and avatars for a few accounts (the summary's leaders), 90 ids a query (D1 allows 100 bound values). */
async function namesOf(env: Env, ids: string[]) {
  const out = new Map<string, { label: string; avatar: string | null }>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await env.DB.prepare(`SELECT discord_id, username, global_name, nick, avatar FROM site_users WHERE discord_id IN (${chunk.map((_, j) => `?${j + 1}`).join(",")})`)
      .bind(...chunk)
      .all<{ discord_id: string; username: string | null; global_name: string | null; nick: string | null; avatar: string | null }>();
    for (const r of rows.results) out.set(r.discord_id, { label: labelOf({ username: r.username, displayName: r.global_name, nick: r.nick }), avatar: r.avatar });
  }
  return out;
}

async function boardVoters(env: Env, q: URLSearchParams): Promise<Response> {
  const b = ballotOf(q.get("role") ?? "");
  const candidate = q.get("candidate") ?? "";
  if (!b || !isId(candidate)) return apiJson({ error: "bad_request" }, 400);
  const f = voterFilter(q);
  const n = f.args.length;
  const rows = await env.DB.prepare(
    `SELECT u.*, v.vote, v.updated_at AS votedAt FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id
      WHERE v.role_key = ?${n + 1} AND v.candidate_id = ?${n + 2} AND ${f.sql}
      ORDER BY v.vote DESC, v.updated_at LIMIT 1000`,
  )
    .bind(...f.args, b.key, candidate)
    .all<Record<string, unknown>>();
  return apiJson({ voters: rows.results.map((r) => ({ ...userOut(env, r as never), vote: r.vote, votedAt: r.votedAt })) });
}

// ---------- write-in nominations ----------

/**
 * Filters for the tallies: who counts as a voter. Account age and time in the server come from Discord (the account
 * id and joined_at at sign-in), so a wave of fresh accounts or people who joined yesterday can be seen and set aside.
 */
function voterFilter(q: URLSearchParams): { sql: string; args: number[] } {
  const parts = ["1 = 1"];
  const args: number[] = [];
  const t = now();
  const acc = intParam(q.get("minAccountDays"), 0, 36500, 0);
  if (acc) {
    args.push(t - acc * 86400);
    parts.push(`u.account_created IS NOT NULL AND u.account_created <= ?${args.length}`);
  }
  const srv = intParam(q.get("minServerDays"), 0, 36500, 0);
  if (srv) {
    args.push(t - srv * 86400);
    parts.push(`u.server_joined IS NOT NULL AND u.server_joined <= ?${args.length}`);
  }
  if (q.get("includeDenied") !== "1") parts.push("u.denied = 0");
  if (q.get("includeLeft") !== "1") parts.push("u.in_server = 1");
  if (q.get("onlyApplicants") === "1") parts.push("EXISTS (SELECT 1 FROM site_applications a WHERE a.discord_id = u.discord_id AND a.status <> 'withdrawn')");
  return { sql: parts.join(" AND "), args };
}

async function tallies(env: Env, q: URLSearchParams): Promise<Response> {
  const f = voterFilter(q);
  const ballot = q.get("ballot") ?? "";
  if (!ballot) {
    // Every ballot at a glance: voters and the leading three. SQLite picks the three (one small query per ballot, all
    // in one batch), so the Worker never walks every nominee group: with thousands of them that alone passed the free
    // plan's 10 ms of CPU.
    const n = f.args.length;
    const tops = await env.DB.batch(
      BALLOTS.map((bl) =>
        env.DB.prepare(
          `SELECT v.nominee_kind AS kind, v.nominee_key AS key, MAX(v.nominee_label) AS label, COUNT(*) AS n,
                  MAX(s.username) AS username, MAX(s.global_name) AS globalName, MAX(s.nick) AS nick
             FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id
             LEFT JOIN site_users s ON v.nominee_kind = 'discord' AND s.discord_id = v.nominee_key
            WHERE v.ballot = ?${n + 1} AND ${f.sql}
            GROUP BY v.nominee_kind, v.nominee_key
            ORDER BY n DESC, label
            LIMIT 3`,
        ).bind(...f.args, bl.key),
      ),
    );
    const voterCounts = await env.DB.prepare(
      `SELECT v.ballot, COUNT(DISTINCT v.voter_id) AS voters FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id WHERE ${f.sql} GROUP BY v.ballot`,
    )
      .bind(...f.args)
      .all<{ ballot: string; voters: number }>();
    const vc = new Map(voterCounts.results.map((r) => [r.ballot, r.voters]));
    return apiJson({
      ballots: BALLOTS.map((bl, i) => ({
        key: bl.key,
        label: bl.label,
        seats: bl.seats,
        voters: vc.get(bl.key) ?? 0,
        // A signed-up nominee by the names Discord gave the site, like the per-role list; anyone else by what voters sent.
        top: ((tops[i]?.results ?? []) as Array<{ kind: string; key: string; label: string; n: number; username: string | null; globalName: string | null; nick: string | null }>)
          .map((r) => ({ kind: r.kind, key: r.key, label: r.username ? labelOf({ username: r.username, displayName: r.globalName, nick: r.nick }) : r.label, votes: r.n })),
      })),
    });
  }
  const b = ballotOf(ballot);
  if (!b) return apiJson({ error: "not_found" }, 404);
  const rows = await env.DB.prepare(
    `SELECT v.nominee_kind AS kind, v.nominee_key AS key, COUNT(*) AS votes,
            (SELECT v2.nominee_label FROM site_votes v2 WHERE v2.ballot = v.ballot AND v2.nominee_kind = v.nominee_kind AND v2.nominee_key = v.nominee_key
              GROUP BY v2.nominee_label ORDER BY COUNT(*) DESC, v2.nominee_label LIMIT 1) AS label,
            SUM(CASE WHEN v.slot = 1 THEN 1 ELSE 0 END) AS first,
            n.username AS username, n.global_name AS globalName, n.nick AS nick, n.avatar AS avatar,
            (SELECT a.position FROM site_applications a WHERE a.discord_id = v.nominee_key AND v.nominee_kind = 'discord') AS applied
       FROM site_votes v
       JOIN site_users u ON u.discord_id = v.voter_id
       LEFT JOIN site_users n ON v.nominee_kind = 'discord' AND n.discord_id = v.nominee_key
      WHERE v.ballot = ?${f.args.length + 1} AND ${f.sql}
      GROUP BY v.nominee_kind, v.nominee_key
      ORDER BY votes DESC, first DESC
      LIMIT 200`,
  )
    .bind(...f.args, b.key)
    .all<{ kind: string; key: string; label: string; votes: number; first: number; username: string | null; globalName: string | null; nick: string | null; avatar: string | null; applied: string | null }>();
  const voters = await env.DB.prepare(`SELECT COUNT(DISTINCT v.voter_id) AS n FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id WHERE v.ballot = ?${f.args.length + 1} AND ${f.sql}`)
    .bind(...f.args, b.key)
    .first<{ n: number }>();
  return apiJson({
    ballot: { key: b.key, label: b.label, seats: b.seats },
    voters: voters?.n ?? 0,
    nominees: rows.results.map((r) => ({
      kind: r.kind,
      key: r.key,
      // A signed-in nominee is shown with the names Discord gave us, not the label the voter's page sent.
      label: r.kind === "discord" && r.username ? labelOf({ username: r.username, displayName: r.globalName, nick: r.nick }) : r.label,
      avatarUrl: r.kind === "discord" ? avatarUrl(env, r.key, r.avatar) : null,
      votes: r.votes,
      first: r.first,
      appliedFor: r.applied,
      signedUp: !!r.username,
    })),
  });
}

async function voters(env: Env, q: URLSearchParams): Promise<Response> {
  const b = ballotOf(q.get("ballot") ?? "");
  const kind = q.get("kind") === "name" ? "name" : "discord";
  const key = cleanText(q.get("key"), 64);
  if (!b || !key) return apiJson({ error: "bad_request" }, 400);
  const f = voterFilter(q);
  const n = f.args.length;
  const rows = await env.DB.prepare(
    `SELECT u.*, v.slot, v.reason, v.updated_at AS votedAt FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id
      WHERE v.ballot = ?${n + 1} AND v.nominee_kind = ?${n + 2} AND v.nominee_key = ?${n + 3} AND ${f.sql}
      ORDER BY v.updated_at LIMIT 500`,
  )
    .bind(...f.args, b.key, kind, key)
    .all<Record<string, unknown>>();
  return apiJson({ voters: rows.results.map((r) => ({ ...userOut(env, r as never), slot: r.slot, reason: r.reason, votedAt: r.votedAt })) });
}

// ---------- reserved names ----------

async function listReserved(env: Env, q: URLSearchParams): Promise<Response> {
  const where: string[] = [];
  const args: unknown[] = [];
  const status = q.get("status") || "active"; // "all" (and anything unknown) filters nothing
  if (status === "active") where.push("r.status <> 'released'");
  else if (["claimed", "approved", "queued", "in_guild", "released"].includes(status)) {
    args.push(status);
    where.push(`r.status = ?${args.length}`);
  }
  if (q.get("contested") === "1") where.push("EXISTS (SELECT 1 FROM site_reserved r2 WHERE r2.name_key = r.name_key AND r2.owner_id <> r.owner_id AND r2.status <> 'released')");
  if (q.get("applicants") === "accepted") where.push("EXISTS (SELECT 1 FROM site_applications a WHERE a.discord_id = r.owner_id AND a.status = 'accepted')");
  const text = cleanText(q.get("q"), 40);
  if (text) {
    args.push(likeArg(normalizeCharacter(text)), likeArg(text));
    const n = args.length - 1;
    where.push(`(r.name_key LIKE ?${n} ESCAPE '\\' OR u.username LIKE ?${n + 1} ESCAPE '\\' OR u.global_name LIKE ?${n + 1} ESCAPE '\\')`);
  }
  const sql = `FROM site_reserved r LEFT JOIN site_users u ON u.discord_id = r.owner_id ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
  const offset = intParam(q.get("offset"), 0, 1_000_000, 0);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n ${sql}`).bind(...args).first<{ n: number }>();
  const rows = await env.DB.prepare(
    `SELECT r.*, u.username, u.global_name, u.nick, u.avatar, u.account_created, u.server_joined, u.in_server, u.denied,
            (SELECT COUNT(*) FROM site_reserved r2 WHERE r2.name_key = r.name_key AND r2.owner_id <> r.owner_id AND r2.status <> 'released') AS others,
            (SELECT q.status FROM invite_queue q WHERE q.id = r.queue_id) AS queueStatus,
            (SELECT a.status FROM site_applications a WHERE a.discord_id = r.owner_id) AS appStatus,
            (SELECT a.position FROM site_applications a WHERE a.discord_id = r.owner_id) AS appPosition
       ${sql} ORDER BY r.id DESC LIMIT ${PAGE} OFFSET ${offset}`,
  )
    .bind(...args)
    .all<Record<string, unknown>>();
  return apiJson({
    total: total?.n ?? 0,
    offset,
    pageSize: PAGE,
    items: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      queuedAt: r.queued_at,
      queueStatus: r.queueStatus ?? null,
      contested: Number(r.others ?? 0),
      owner: userOut(env, { ...r, discord_id: r.owner_id } as never),
      application: r.appStatus ? { status: r.appStatus, position: r.appPosition } : null,
    })),
  });
}

async function reservedAction(env: Env, actor: string, action: string, body: Record<string, unknown>): Promise<Response> {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200) : [];
  if (action === "queue") {
    // Queue the chosen ones, or with no ids every approved name. Before launch the names do not exist in game yet.
    const out = await queueReserved(env, actor, ids.length ? ids : undefined);
    return apiJson({ ok: true, ...out });
  }
  if (!ids.length) return apiJson({ error: "invalid", message: "Select at least one name." }, 400);
  const list = ids.join(",");
  if (action === "approve") {
    // Entered names, and queued names whose invite ended without them joining (declined, cancelled, gave up): approved
    // again, the next Queue gives them a fresh row at the front.
    const r = await env.DB.prepare(
      `UPDATE site_reserved SET status = 'approved', approved_by = ?1, approved_at = ?2, queue_id = NULL, queued_at = NULL
        WHERE id IN (${list})
          AND (status = 'claimed'
               OR (status = 'queued' AND NOT EXISTS (SELECT 1 FROM invite_queue q WHERE q.id = site_reserved.queue_id
                                                       AND q.status IN ('queued','written','invited','joined'))))`,
    )
      .bind(actor, now())
      .run();
    await audit(env, actor, "site.reserved_approved", undefined, { n: r.meta.changes });
    return apiJson({ ok: true, changed: r.meta.changes });
  }
  if (action === "unapprove") {
    const r = await env.DB.prepare(`UPDATE site_reserved SET status = 'claimed', approved_by = NULL, approved_at = NULL WHERE id IN (${list}) AND status = 'approved'`).run();
    await audit(env, actor, "site.reserved_unapproved", undefined, { n: r.meta.changes });
    return apiJson({ ok: true, changed: r.meta.changes });
  }
  if (action === "release") {
    const n = await releaseReserved(env, { ids }, actor);
    await audit(env, actor, "site.reserved_released", undefined, { n });
    return apiJson({ ok: true, changed: n });
  }
  return apiJson({ error: "not_found" }, 404);
}

// ---------- friends ----------

async function friends(env: Env, q: URLSearchParams): Promise<Response> {
  const text = cleanText(q.get("q"), 40);
  const args: unknown[] = [];
  let where = "";
  if (text) {
    args.push(likeArg(text));
    where = "WHERE f.friend_label LIKE ?1 ESCAPE '\\'";
  }
  const rows = await env.DB.prepare(
    `SELECT f.friend_kind AS kind, f.friend_key AS key, MAX(f.friend_label) AS label, COUNT(*) AS n,
            GROUP_CONCAT(COALESCE(u.username, f.owner_id), ', ') AS owners,
            (SELECT COUNT(*) FROM site_users s WHERE f.friend_kind = 'discord' AND s.discord_id = f.friend_key) AS signedUp
       FROM site_friends f LEFT JOIN site_users u ON u.discord_id = f.owner_id
       ${where}
      GROUP BY f.friend_kind, f.friend_key
      ORDER BY n DESC, label
      LIMIT 200`,
  )
    .bind(...args)
    .all<{ kind: string; key: string; label: string; n: number; owners: string | null; signedUp: number }>();
  return apiJson({ friends: rows.results.map((r) => ({ ...r, signedUp: !!r.signedUp, owners: (r.owners ?? "").slice(0, 400) })) });
}

// ---------- lookup ----------

async function lookup(env: Env, q: URLSearchParams): Promise<Response> {
  const text = cleanText(q.get("q"), 40).replace(/^@/, "");
  if (Array.from(text).length < 2) return apiJson({ discord: [], characters: [], site: [] });
  // A Discord id pasted in.
  if (/^\d{17,20}$/.test(text)) return apiJson({ discord: [], characters: [], site: [], account: await accountWithNames(env, text) });
  let discord: unknown[] = [];
  let limited = false;
  try {
    if (env.DISCORD_BOT_TOKEN && /^\d{17,20}$/.test(env.SITE_GUILD_ID ?? "")) {
      const out = await searchMembers(env, text);
      limited = !!out.limited;
      discord = out.found.map((f) => ({ id: f.id, label: shownName(f), avatarUrl: avatarUrl(env, f.id, f.avatar) })); // .114: every differing name (display only)
    }
  } catch (e) {
    console.error("admin lookup search", errorRef(e));
  }
  const key = normalizeCharacter(text);
  const chars = await env.DB.prepare(
    `SELECT name, discord_id AS id, status FROM characters WHERE name_key LIKE ?1 ESCAPE '\\' AND status NOT IN ('unbound','denied')
     UNION ALL
     SELECT name, owner_id AS id, 'reserved:' || status FROM site_reserved WHERE name_key LIKE ?1 ESCAPE '\\' AND status <> 'released'
     LIMIT 30`,
  )
    .bind(likeArg(key))
    .all<{ name: string; id: string; status: string }>();
  const site = await env.DB.prepare(
    `SELECT * FROM site_users WHERE username LIKE ?1 ESCAPE '\\' OR global_name LIKE ?1 ESCAPE '\\' OR nick LIKE ?1 ESCAPE '\\' LIMIT 25`,
  )
    .bind(likeArg(text))
    .all<Record<string, unknown>>();
  const exact = await ownerOfCharacter(env, text);
  return apiJson({
    limited: limited || undefined,
    discord,
    characters: chars.results,
    site: site.results.map((r) => userOut(env, r as never)),
    exactOwner: exact?.id ?? null,
  });
}

// ---------- export ----------

/**
 * One page of an export, as JSON: the page (app.js) fetches every page and builds the CSV file in the browser. A
 * single request building the whole file took 15-45 ms of CPU for a few hundred voters in testing, and the free plan
 * allows 10. Pages are small enough to stay well under that; applications carry their answers, so theirs are smaller.
 */
const EXPORTS: Record<string, { sql: string; page: number }> = {
  applications: {
    page: 150,
    sql: `SELECT a.discord_id, u.username, u.global_name, u.nick, a.position, a.class_lead, a.backup1, a.backup2, a.fallback, a.character, a.class, a.role, a.region,
                 (SELECT group_concat(j.value, ' ') FROM ${PROFESSIONS_OF_A} j) AS professions,
                 a.avail_tz, a.avail, a.status, a.admin_note, a.created_at, a.updated_at, u.account_created, u.server_joined, u.denied, a.answers
            FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id ORDER BY a.created_at, a.discord_id`,
  },
  board: {
    page: 800,
    sql: `SELECT v.role_key, v.candidate_id, c.username AS candidate_username, v.vote, v.voter_id, u.username AS voter_username,
                 u.account_created, u.server_joined, u.denied, u.in_server, v.updated_at
            FROM site_board_votes v JOIN site_users u ON u.discord_id = v.voter_id LEFT JOIN site_users c ON c.discord_id = v.candidate_id
           ORDER BY v.role_key, v.candidate_id, v.voter_id`,
  },
  votes: {
    page: 800,
    sql: `SELECT v.voter_id, u.username AS voter_username, u.account_created, u.server_joined, u.denied, u.in_server,
                 v.ballot, v.slot, v.nominee_kind, v.nominee_key, v.nominee_label, v.reason, v.updated_at
            FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id ORDER BY v.ballot, v.nominee_key, v.voter_id, v.slot`,
  },
  friends: {
    page: 800,
    sql: `SELECT f.owner_id, u.username AS owner_username, f.friend_kind, f.friend_key, f.friend_label, f.note, f.created_at
            FROM site_friends f LEFT JOIN site_users u ON u.discord_id = f.owner_id ORDER BY f.owner_id, f.created_at, f.friend_key`,
  },
  reserved: {
    page: 800,
    sql: `SELECT r.id, r.name, r.status, r.owner_id, u.username AS owner_username, r.created_at, r.approved_at, r.queued_at, r.queue_id,
                 (SELECT q.status FROM invite_queue q WHERE q.id = r.queue_id) AS queue_status
            FROM site_reserved r LEFT JOIN site_users u ON u.discord_id = r.owner_id ORDER BY r.id`,
  },
  users: {
    page: 800,
    sql: `SELECT discord_id, username, global_name, nick, account_created, server_joined, first_login, last_login, in_server, denied, denied_reason
            FROM site_users ORDER BY first_login, discord_id`,
  },
};

async function exportPage(env: Env, kind: string, q: URLSearchParams): Promise<Response> {
  const key = kind.replace(/\.csv$/, "");
  const e = Object.prototype.hasOwnProperty.call(EXPORTS, key) ? EXPORTS[key] : undefined; // not "constructor" and the like
  if (!e) return apiJson({ error: "not_found" }, 404);
  const offset = intParam(q.get("offset"), 0, 10_000_000, 0);
  const res = await env.DB.prepare(`${e.sql} LIMIT ${e.page + 1} OFFSET ${offset}`).raw({ columnNames: true });
  const [columns, ...rows] = res as unknown[][];
  const more = rows.length > e.page;
  return apiJson({ columns: columns ?? [], rows: rows.slice(0, e.page), next: more ? offset + e.page : null });
}

async function recentAudit(request: Request, env: Env, admin: SiteUser): Promise<Response> {
  // Keep Overview's five-field contract and newest 100 site actions, but share the safe projection and final admission.
  const s = await readSession(env, request);
  if (!s || s.u !== admin.discord_id || s.v !== admin.session_version) return apiJson(AUDIT_SIGNED_OUT, 401);
  const session: AuditSession = Object.freeze({ u: s.u, v: s.v, e: s.e });
  const rows = await env.DB.prepare(
    `SELECT id, ts, actor, action, subject, substr(details, 1, ${AUDIT_DETAILS_MAX}) AS details,
            length(details) > ${AUDIT_DETAILS_MAX} AS cut
       FROM audit WHERE action LIKE 'site.%' ORDER BY id DESC LIMIT 100`,
  ).all<AuditRow>();
  const page = { audit: rows.results.map(safeAuditEntry).map((r) => ({
    ts: r.ts, actor: r.actor, action: r.action, subject: r.subject,
    details: [r.details ? JSON.stringify(r.details) : "", r.detailsWithheld ? "Private or unrecognized details withheld" : ""].filter(Boolean).join(" · ") || null,
  })) };
  return admitAudit(env, session, page);
}

// ---------- the audit log page ----------

/**
 * Admin -> Audit log (the owner's request of 7 Oct 2026, item 5: "Full staff audit page"): the whole dated log, bot,
 * roster, role and website actions alike, filtered, paged and with names. Staff only, because the entries carry Discord
 * ids: it sits behind the /api/admin/* gate (site-api.ts, SITE_ADMINS). It reads and never writes, and reading leaves no
 * audit row of its own: the privacy policy says a staff change is recorded in the dated log and reading is not. The
 * Overview's "Show recent activity" (recentAudit above) retains its five-field contract and uses the same safe
 * projection and final admission.
 *
 * The audit table has no retention purge and only grows, so a filtered keyset query could read every row looking for a
 * page of a rare action. Each request therefore looks at one stretch of at most AUDIT_SCAN ids, newest first, walking the
 * primary key: the stretch ends at the cursor (or the newest id), and the window is a filter on ts itself, never an id
 * floor (Codex's review, 7 Oct 2026 19:58 UTC: ids and stamps need not run in the same order). When the stretch held fewer
 * matches than a page, `next` is the stretch's own start and `exhausted` stays false until the oldest id is reached, so the
 * page can say which stretch it searched and offer Older without ever claiming there are no entries at all; `likelyEnd`
 * says when the rest of the log was stamped before the window.
 *
 * Admission (Codex's required change A30-AUDIT-01, 7 Oct 2026 21:23:59 UTC): the gate in site-api.ts judged the account
 * once, before the reads, so a session revoked, expired, denied with a version bump or erased while the page was being
 * read still got the payload, and only the next request with the same cookie was refused. The handler therefore binds the
 * request's own signed session (readSession: u, v, e) before any audit read, requires it to be the account the gate
 * admitted (discord id and session version), and keeps those three values: a later version or a renewed expiry is never
 * captured. It builds the whole answer first, then runs ONE last statement on every 200 path, the early empty ones
 * included: the community fence (community-context.ts fenceSql "applicantWrite": the live site_users row with that
 * version, not denied, in the server, and the cookie's expiry ahead of the database's own clock) with the bound values,
 * plus SITE_ADMINS again (zero I/O). The answer leaves only when that holds (else 401 and nothing of it); a failure of
 * the statement itself is 503 and nothing of it; nothing asynchronous follows the admission. Five statements at most:
 * the oldest and newest ids, the window's earliest-stamped id, the page, the names, the admission.
 */
const AUDIT_SCAN = 2000;
const AUDIT_WINDOWS: Record<string, number> = { "1d": 86_400, "7d": 7 * 86_400, "30d": 30 * 86_400, all: 0 };
/**
 * The actors the code writes that are not a Discord id (db.ts audit callers). "auto" approves every invite queued under
 * ADMISSION_MODE=auto (review.ts onVerified), so most invite.queued rows carry it; "admin" as the design names it.
 */
const AUDIT_SYSTEM_ACTORS = new Set(["watcher", "system", "cron", "site", "auto", "admin"]);
const AUDIT_PARAMS = new Set(["family", "actor", "subject", "window", "before", "limit"]);
/** Bound historical text before parsing; oversized or malformed text is withheld, never returned as a prefix. */
const AUDIT_DETAILS_MAX = 4000;

/** The staff page is a projection, never a replay of historical text. New actions start withheld until reviewed here.
 * Each registered action fixes its actor policy, subject kind and its own typed detail keys. OAuth tags, verification tickets/codes,
 * GUIDs, errors, reasons, case/payment/evidence identifiers and arbitrary free text have no rule.
 */
type AuditValueRule = "count" | "boolean" | "id" | readonly string[];
type AuditSubjectKind = "id" | "character";
type AuditRule = { actor: "id-or-system" | "withheld"; subject: AuditSubjectKind | "id-or-character" | "none"; fields: Record<string, AuditValueRule> };
const AUDIT_RULES: Record<string, AuditRule> = Object.create(null);
function auditRules(actions: string, subject: AuditRule["subject"], fields: AuditRule["fields"] = {}, actor: AuditRule["actor"] = "id-or-system"): void {
  for (const action of actions.split(" ")) AUDIT_RULES[action] = { actor, subject, fields };
}
auditRules("site.login site.login_not_member site.left_server site.application_withdrawn site.copy_exported", "id");
auditRules("site.application_submitted site.application_updated site.settings site.leadership site.beta_closed", "none");
auditRules("site.application_status", "id", { status: ["submitted", "reviewing", "accepted", "declined", "withdrawn"] });
auditRules("site.denied", "id", { released: "count" });
auditRules("site.undenied", "id");
auditRules("site.data_deleted", "id", { mentions: "boolean" });
auditRules("site.mentions_deleted", "id", { removed: "count" });
auditRules("site.votes_saved", "none", { picks: "count" });
auditRules("site.friends_saved", "none", { friends: "count" });
auditRules("site.reserved_saved", "none", { added: "count", removed: "count" });
auditRules("site.reserved_approved site.reserved_unapproved site.reserved_released", "none", { n: "count" });
auditRules("site.reserved_queued", "none", { queued: "count", bumped: "count", inGuild: "count" });
auditRules("site.beta_reset", "none", { appointed: "count", directoryNames: "count", notice: "boolean" });
auditRules("site.login_failed", "none", { step: ["token", "member"], status: "count" });
auditRules("site.news_notice", "none", { op: ["created", "edited", "deleted"], live: "count" });
auditRules("site.news_expired", "none", { deleted: "count", opsDeleted: "count", remaining: "count" });
auditRules("bnet.switch", "none", { enableRequested: "boolean", collectionEnabled: "boolean" });
auditRules("bnet.retention", "none", { members: "count", phase3: "count", characters: "count", audit: "count" });
auditRules("link.started link.bnet_not_configured link.bnet_login_started link.battletag_taken link.banned link.ok link.metadata_failed bnet.linked", "none");
auditRules("link.bnet_token_failed link.bnet_userinfo_failed", "none", { status: "count" });
auditRules("role.backfilled role.blocked role.blocked_removed role.misconfigured role.held_reapply role.revoke_pending role.revoked_after_hold role.revoked_reapply role.revoked_after_ban role.revoked_banned role.restored role.restore_failed", "id");
// .125 R3 (Claude, 9 Oct 2026): roster.ts stores a character, while interactions.ts removes by Discord ID. Only the
// four roster writers below include discordId in their detail; this is deliberately not an all-actions ID allowance.
auditRules("role.remove_failed", "id-or-character");
auditRules("role.add_failed role.deferred role.refused_banned roles.read_failed", "character", { discordId: "id" });
auditRules("role.backfill_page role.sweep_failed", "none");
auditRules("role.budget_exhausted", "none", { attempts: "count", calls: "count", retries: "count", limit: "count" });
auditRules("role.sweep", "none", { checked: "count", restored: "count", failed: "count", unfinished: "count", absent: "count", blocked: "count", revoked: "count", calls: "count", attempts: "count", retries: "count", stopped: "boolean" });
auditRules("verify.invalid_code verify.ticket_mismatch verify.no_pending verify.banned verify.bound_elsewhere verify.already_used verify.already_linked verify.confirmed verify.already_member verify.roster_not_current verify.ticket_reused verify.guid_pinned verify.refused_bound verify.requested verify.ticket_issued", "none");
auditRules("invite.queued invite.failed invite.fired invite.joined_stale_link invite.joined_unconfirmed", "character");
auditRules("invite.declined invite.expired", "character", { attempts: "count" });
auditRules("invite.joined", "character", { promoted: "boolean" });
auditRules("invite.resumed", "character", { position: "count", attempts: "count" });
auditRules("review.denied rename.forced rename.approved rename.cancelled", "character");
auditRules("roster.namesake_released roster.stale_link_released roster.namesake_seen roster.renamed roster.returned roster.left_pending roster.remove_failed roster.removed_unlinked roster.left roster.freed_seat", "character");
auditRules("roster.member", "character", { roleGranted: "boolean", roleBlocked: "boolean" });
auditRules("roster.rename_waiting roster.rename_blocked roster.rename_swap", "none");
auditRules("roster.identity_held", "none", { count: "count", stale: "count", cap: "count" });
auditRules("roster.duplicate_names", "none", { members: "count", duplicates: "count" });
auditRules("roster.ingest_unusable", "none", { members: "count", stored: "count" });
auditRules("roster.ingest_failed roster.first_seen_failed roster.distrusted", "none", { members: "count" });
auditRules("roster.ingested roster.sync", "none", { members: "count", promoted: "count", stripped: "count", released: "count", renamed: "count", deferred: "count" });
auditRules("roster.effects_failed", "none", { seq: "count", applied: "count" });
auditRules("admin.ban admin.unban admin.discord_ban admin.discord_ban_failed", "id");
auditRules("admin.unbind", "character");
auditRules("admin.sync", "none", { promoted: "count", stripped: "count", released: "count", renamed: "count", deferred: "count", trustedSet: "boolean" });
auditRules("admin.sync_refused", "none", { memberCount: "count", stored: "count" });
auditRules("admin.refresh_guide admin.post_guide intros.refresh", "none");
auditRules("notice.no_channel notice.failed notice.suppressed", "id", { cap: "count" });
auditRules("notice.flush_failed", "none", { count: "count" });
auditRules("notice.capped", "none", { cap: "count" });
auditRules("notice.posted", "none", { users: "count" });
auditRules("staff_notice.failed nick.failed note.failed note.set", "none");
auditRules("guild.full", "none", { candidates: "count" });
auditRules("guild.full_notified", "none", { candidates: "count", posted: "boolean" });
auditRules("rank.mismatch_reported", "none", { count: "count", posted: "boolean" });
auditRules("queue.swept", "none", { requeued: "count", expired: "count", max: "count" });
auditRules("community.profile_created community.profile_updated community.alt_confirmed community.alt_rejected", "id");
auditRules("community.name_conflict", "id", { names: "count" });
auditRules("community.profiles_expired community.events_expired community.departures_recorded", "none", { deleted: "count", created: "count" });
auditRules("community.departures_expired community.trials_expired", "none", { deleted: "count", remaining: "count" });
auditRules("community.restrictions_expired", "none", { rows: "count", cases: "count", periods: "count" });
auditRules("community.rsvp community.event_created community.event_updated community.event_cancelled", "none");
auditRules("community.attendance_recorded", "none", { entries: "count" });
// Dedicated case and contribution pages retain their own authorization/projections. This aggregate page shows the
// action without private case linkage, reasons, status, evidence, contact or payment detail.
auditRules("community.privacy_case_updated community.departure_acknowledged community.departure_restriction_opened community.trial_created community.trial_extended community.trial_passed community.trial_ended community.restriction_set community.restriction_acknowledged community.restriction_review_continued community.restriction_lifted community.restriction_appeal_requested community.restriction_appeal_upheld community.restriction_overturned community.restriction_watch_added community.restriction_watch_renewed community.restriction_watch_removed community.contribution_evidence community.contribution_obligation community.contribution_receipt community.contribution_allocate community.contribution_void community.contribution_reverse community.contribution_state community.contribution_contact community.contribution_removal", "none");
// .125 R2: this action is written by the member, so revealing or filtering its actor would expose the private linkage.
auditRules("community.contribution_acknowledged", "none", {}, "withheld");
auditRules("community.officer_digest_posted community.officer_digest_failed community.officer_digest_removed community.officer_digest_resumed", "none");

// .125 R1/R2: filtering must obey the same disclosure policy as rendering. Bind a finite JSON action list as ONE value,
// rather than one placeholder per action (D1 allows at most 100 bound parameters per statement). Unknown actions do
// not participate. Eligibility is a constant derived only from the reviewed registry, never from stored/user text.
const AUDIT_ACTOR_ACTIONS = JSON.stringify(Object.keys(AUDIT_RULES).filter((a) => AUDIT_RULES[a].actor === "id-or-system"));
const AUDIT_SUBJECT_ACTIONS: Record<AuditSubjectKind, string> = {
  id: JSON.stringify(Object.keys(AUDIT_RULES).filter((a) => AUDIT_RULES[a].subject === "id" || AUDIT_RULES[a].subject === "id-or-character")),
  character: JSON.stringify(Object.keys(AUDIT_RULES).filter((a) => AUDIT_RULES[a].subject === "character" || AUDIT_RULES[a].subject === "id-or-character")),
};

interface AuditEntry {
  id: number;
  ts: number;
  actor: string;
  actorName: string | null;
  action: string;
  subject: string | null;
  subjectName: string | null;
  subjectWithheld: boolean;
  details: Record<string, string | number | boolean> | null;
  detailsWithheld: boolean;
}
type AuditRow = { id: number; ts: number; actor: string; action: string; subject: string | null; details: string | null; cut: number | null };

/** Character subjects only for writers that store a character label; never a BattleTag, opaque case id or free text. */
function auditCharacter(value: string): boolean {
  return Array.from(value).length <= 40 && /^[\p{L}][\p{L}' -]*$/u.test(value);
}

function safeAuditEntry(row: AuditRow): AuditEntry {
  const rule = Object.prototype.hasOwnProperty.call(AUDIT_RULES, row.action) ? AUDIT_RULES[row.action] : null;
  const actor = rule?.actor === "id-or-system" && (isId(row.actor) || AUDIT_SYSTEM_ACTORS.has(row.actor)) ? row.actor : "withheld";
  const subject = rule && row.subject !== null &&
    ((rule.subject === "id" || rule.subject === "id-or-character") && isId(row.subject) ||
     (rule.subject === "character" || rule.subject === "id-or-character") && auditCharacter(row.subject)) ? row.subject : null;
  let details: AuditEntry["details"] = null;
  let detailsWithheld = !rule || !!row.cut;
  if (row.details !== null) {
    detailsWithheld = true;
    if (rule && !row.cut) {
      try {
        const stored: unknown = JSON.parse(row.details);
        if (stored !== null && typeof stored === "object" && !Array.isArray(stored)) {
          const kept: Record<string, string | number | boolean> = {};
          let dropped = false;
          for (const [key, value] of Object.entries(stored)) {
            const validation = Object.prototype.hasOwnProperty.call(rule.fields, key) ? rule.fields[key] : null;
            const valid = validation === "count" ? typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000 :
              validation === "boolean" ? typeof value === "boolean" :
              validation === "id" ? isId(value) :
              Array.isArray(validation) && typeof value === "string" && validation.includes(value);
            if (valid) kept[key] = value as string | number | boolean;
            else dropped = true;
          }
          if (Object.keys(kept).length) details = kept;
          detailsWithheld = dropped;
        }
      } catch { /* malformed historical detail stays withheld */ }
    }
  }
  return {
    id: row.id, ts: row.ts, actor, actorName: null, action: rule ? row.action : "unknown",
    subject, subjectName: null, subjectWithheld: row.subject !== null && subject === null,
    details, detailsWithheld,
  };
}

const AUDIT_REFUSALS: Record<string, string> = {
  query: "Only family, actor, subject, window, before and limit can be given, each once.",
  family: "The family is a lowercase action prefix such as role, site or roster.",
  actor: "The actor is a Discord ID (17 to 20 digits) or one of watcher, system, cron, site, auto and admin.",
  subject: "The subject is a Discord ID (17 to 20 digits) or a character label (up to 40 letters, spaces, apostrophes and hyphens), matched exactly where that action shows it.",
  window: "The window is 1d, 7d, 30d or all.",
  before: "The cursor is a positive whole number.",
  limit: "The page size is a whole number from 10 to 100.",
};

interface AuditQuery {
  family: string | null;
  actor: string | null;
  subject: string | null;
  subjectKind: AuditSubjectKind | null;
  window: string;
  before: number | null;
  limit: number;
}

/**
 * The page's parameters, every one optional, bounded and checked; anything else is refused (400) rather than ignored, so
 * a mistyped filter never comes back as the unfiltered log. An empty value is the same as none (the page's form sends
 * nothing for an empty box anyway).
 */
function auditQuery(q: URLSearchParams): AuditQuery | { field: string } {
  const seen = new Set<string>();
  for (const k of q.keys()) {
    if (!AUDIT_PARAMS.has(k) || seen.has(k)) return { field: "query" };
    seen.add(k);
  }
  const get = (k: string) => {
    const v = q.get(k);
    return v === null || v === "" ? null : v;
  };
  const family = get("family");
  if (family !== null && !/^[a-z][a-z_]{1,19}$/.test(family)) return { field: "family" };
  const actor = get("actor");
  if (actor !== null && !isId(actor) && !AUDIT_SYSTEM_ACTORS.has(actor)) return { field: "actor" };
  const subject = get("subject");
  const subjectKind = subject === null ? null : isId(subject) ? "id" : auditCharacter(subject) ? "character" : null;
  if (subject !== null && subjectKind === null) return { field: "subject" };
  const window = get("window") ?? "7d";
  if (!Object.prototype.hasOwnProperty.call(AUDIT_WINDOWS, window)) return { field: "window" };
  const before = get("before");
  if (before !== null && !/^[1-9]\d{0,14}$/.test(before)) return { field: "before" };
  const limitText = get("limit");
  // written as the cursor is, without leading zeros (010 is refused as before=01 is): 10 to 99, or 100
  const limit = limitText === null ? 50 : /^(?:[1-9]\d|100)$/.test(limitText) ? Number(limitText) : 0;
  if (limit < 10 || limit > 100) return { field: "limit" };
  return { family, actor, subject, subjectKind, window, before: before === null ? null : Number(before), limit };
}

/** What a private 200 carries, built whole before the final admission (A30-AUDIT-01). */
interface AuditPage {
  entries: AuditEntry[];
  next: number | null;
  scanned: { lo: number; hi: number } | null;
  exhausted: boolean;
  likelyEnd: boolean;
  window: string;
  limit: number;
}

/** The request's own signed session as readSession read it (id, version, expiry): the one identity the admission judges. */
interface AuditSession {
  readonly u: string;
  readonly v: number;
  readonly e: number;
}

const AUDIT_SIGNED_OUT = { error: "signed_out", message: "You are signed out. Sign in with Discord again." };

async function auditLog(request: Request, env: Env, q: URLSearchParams, admin: SiteUser): Promise<Response> {
  // A30-AUDIT-01 (Codex, 7 Oct 2026 21:23:59 UTC): bind the signed session before any audit read. It must be the account
  // the gate admitted (site-api.ts currentUser) at the version the gate saw; the three values are copied once and never
  // read again, so neither a later version nor a renewed expiry can stand in for the cookie this request carried.
  const s = await readSession(env, request);
  if (!s || s.u !== admin.discord_id || s.v !== admin.session_version) return apiJson(AUDIT_SIGNED_OUT, 401);
  const session: AuditSession = Object.freeze({ u: s.u, v: s.v, e: s.e });
  const p = auditQuery(q);
  if ("field" in p) return apiJson({ error: "bad_request", field: p.field, message: AUDIT_REFUSALS[p.field] }, 400);
  const page = await auditPage(env, p);
  return admitAudit(env, session, page);
}

/**
 * The final admission (A30-AUDIT-01): ONE statement, after the whole answer is built and before any of it leaves, on every
 * 200 path. The community fence (community-context.ts fenceSql "applicantWrite") judges the bound id, version and expiry
 * inside the statement, by the database's own clock, through site_users' primary key: the live row, the same version, not
 * denied, in the server, the cookie not yet expired. SITE_ADMINS is checked again beside it (zero I/O). A refusal is 401
 * with nothing of the answer; a statement that fails or answers neither 1 nor 0 is 503 with nothing of it (fail closed).
 * Nothing asynchronous follows: the prebuilt answer is only serialized.
 */
async function admitAudit(env: Env, s: AuditSession, page: AuditPage | { audit: { ts: number; actor: string; action: string; subject: string | null; details: string | null }[] }): Promise<Response> {
  let held: unknown;
  try {
    held = (await env.DB.prepare(`SELECT (${fenceSql("applicantWrite", 1, 2, 3)}) AS ok`).bind(s.u, s.v, s.e).first<{ ok: number }>())?.ok;
  } catch (e) {
    console.error("admin audit log admission", errorRef(e));
    held = null;
  }
  if (held !== 1 && held !== 0) return apiJson({ error: "unavailable", message: "The audit log could not be checked just now, so nothing is shown. Try again in a moment." }, 503);
  if (held !== 1 || !isSiteAdmin(env, s.u)) return apiJson(AUDIT_SIGNED_OUT, 401);
  return apiJson(page);
}

/** The page itself (statements 1 to 4); it returns the answer and sends nothing: admitAudit decides whether it leaves. */
async function auditPage(env: Env, p: AuditQuery): Promise<AuditPage> {
  const shape = { window: p.window, limit: p.limit };
  // 1. The stretch's top: the cursor (exclusive) or the newest id, never above the newest (a cursor from nowhere would
  //    otherwise walk empty ids). MAX on the primary key reads one row.
  //    The oldest id is read in the same statement: each subquery is SQLite's one-row min/max on the primary key (a single
  //    SELECT MIN(id), MAX(id) would scan the table).
  const top = await env.DB.prepare("SELECT (SELECT MIN(id) FROM audit) AS oldest, (SELECT MAX(id) FROM audit) AS newest").first<{ oldest: number | null; newest: number | null }>();
  const newest = top?.newest ?? 0;
  const oldest = top?.oldest ?? 1;
  const hi = p.before === null ? newest : Math.min(p.before - 1, newest);
  // 2. The window, on the same clock that stamps the rows (db.ts now(), which audit() writes as ts). Codex's review of the
  //    design (7 Oct 2026, 19:58 UTC): an id is not a time, so the page query filters on ts itself and nothing ends a
  //    search early on the assumption that ids and stamps run in the same order. One audit_ts entry (ORDER BY ts, id
  //    LIMIT 1, where MIN(id) ... WHERE ts >= ? would walk the primary key up from the oldest row) settles two things:
  //    no row at all is stamped inside the window (a true empty answer), or the earliest-stamped row's id, below which
  //    matches are unlikely but still possible (a row stamped out of order); the search then goes on down to the oldest
  //    id and only there says it is exhausted.
  const cutoff = p.window === "all" ? null : now() - AUDIT_WINDOWS[p.window];
  let likelyFrom = oldest;
  if (cutoff !== null) {
    const first = await env.DB.prepare("SELECT id FROM audit WHERE ts >= ?1 ORDER BY ts, id LIMIT 1").bind(cutoff).first<{ id: number }>();
    if (!first) return { entries: [], next: null, scanned: null, exhausted: true, likelyEnd: true, ...shape }; // nothing stamped inside the window
    likelyFrom = first.id;
  }
  if (hi < oldest) return { entries: [], next: null, scanned: null, exhausted: true, likelyEnd: true, ...shape };
  const lo = Math.max(oldest, hi - AUDIT_SCAN + 1);
  // 3. The page: newest first inside [lo, hi], one more row than a page to know whether the stretch holds more. The unary
  //    + keeps SQLite from answering a filter through audit_actor_action (which would read every row of that actor and
  //    family in the table, then sort them): the walk stays on the primary key, at most AUDIT_SCAN rows. The family is a
  //    range, "role." up to "role/" ('/' follows '.'), exact and case-sensitive where LIKE folds case and needs escapes;
  //    "role" therefore never matches roles.*. Details are cut in SQL, so a long row never leaves the database whole.
  const args: unknown[] = [lo, hi];
  const where: string[] = [];
  if (cutoff !== null) {
    args.push(cutoff);
    where.push(`+ts >= ?${args.length}`); // the window itself, on the walk (the unary + keeps audit_ts out of the plan)
  }
  if (p.family !== null) {
    args.push(p.family + ".", p.family + "/");
    where.push(`+action >= ?${args.length - 1} AND +action < ?${args.length}`);
  }
  if (p.actor !== null) {
    args.push(p.actor, AUDIT_ACTOR_ACTIONS);
    where.push(`+actor = ?${args.length - 1} AND +action IN (SELECT value FROM json_each(?${args.length}))`);
  }
  if (p.subject !== null) {
    args.push(p.subject, AUDIT_SUBJECT_ACTIONS[p.subjectKind!]);
    where.push(`+subject = ?${args.length - 1} AND +action IN (SELECT value FROM json_each(?${args.length}))`);
  }
  args.push(p.limit + 1);
  const rows = (
    await env.DB.prepare(
      `SELECT id, ts, actor, action, subject, substr(details, 1, ${AUDIT_DETAILS_MAX}) AS details, length(details) > ${AUDIT_DETAILS_MAX} AS cut
         FROM audit
        WHERE id BETWEEN ?1 AND ?2${where.map((w) => " AND " + w).join("")}
        ORDER BY id DESC LIMIT ?${args.length}`,
    )
      .bind(...args)
      .all<{ id: number; ts: number; actor: string; action: string; subject: string | null; details: string | null; cut: number | null }>()
  ).results;
  const more = rows.length > p.limit;
  const page = (more ? rows.slice(0, p.limit) : rows).map(safeAuditEntry);
  // the last row shown is the exclusive cursor; with no more matches in this stretch, the stretch's start, while older
  // ids remain anywhere in the log (a row stamped out of order can sit below the window's earliest-stamped id)
  const next = more ? page[page.length - 1].id : lo > oldest ? lo : null;
  // 4. Names, in one statement for every approved Discord id among actors, subjects and per-rule detail (at most 3 x limit, bound as one
  //    JSON array): the site's own account row as the site already shows it (shownName), else the bot's member row. Only
  //    approved actor/subject/detail ids participate; withheld actors and private/unknown subjects never reach it.
  const ids = [...new Set(page.flatMap((r) => [r.actor, r.subject, r.details?.discordId]).filter(isId))];
  const names = new Map<string, string>();
  if (ids.length) {
    const found = await env.DB.prepare(
      `SELECT j.value AS id, s.username AS su, s.global_name AS sg, s.nick AS sn, m.username AS mu, m.global_name AS mg
         FROM json_each(?1) j
         LEFT JOIN site_users s ON s.discord_id = j.value
         LEFT JOIN members m ON m.discord_id = j.value`,
    )
      .bind(JSON.stringify(ids))
      .all<{ id: string; su: string | null; sg: string | null; sn: string | null; mu: string | null; mg: string | null }>();
    for (const r of found.results) {
      // a site row erased down to its denial keeps no name: the member row may still have one
      const name = r.su ? shownName({ username: r.su, displayName: r.sg, nick: r.sn }) : r.mu ? shownName({ username: r.mu, displayName: r.mg }) : null;
      if (name) names.set(r.id, name);
    }
  }
  return {
    entries: page.map((r) => ({ ...r,
      actorName: names.get(r.actor) ?? null, subjectName: r.subject === null ? null : names.get(r.subject) ?? null,
      // A generated local name for this rule's validated detail ID, never a stored free-text field or provider lookup.
      details: r.details && isId(r.details.discordId) && names.has(r.details.discordId) ? { ...r.details, discordIdName: names.get(r.details.discordId)! } : r.details,
    })),
    next,
    scanned: { lo, hi },
    exhausted: next === null,
    // below the window's earliest-stamped id, further matches need a row stamped out of order: the page says so in words
    likelyEnd: !more && lo <= likelyFrom,
    ...shape,
  };
}
