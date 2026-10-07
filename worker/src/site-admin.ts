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
 *   POST users/{id}/deny {reason}, POST users/{id}/undeny, POST users/{id}/delete {mentions} (everything the site holds)
 *   POST users/{id}/mentions               only what others entered about an account that never signed in here
 *   GET  availability?role                 the weekly grid of every open application, summed per UTC hour
 *   GET  board?role&minAccountDays&minServerDays&includeDenied&includeLeft&onlyApplicants, GET board/voters?role&candidate
 *   GET  votes?ballot&(the same filters), GET votes/voters?ballot&kind&key          (write-in nominations)
 *   GET  reserved?status&q&offset, POST reserved/{approve|unapprove|release|queue} {ids}
 *   GET  friends?q
 *   GET  lookup?q, GET account/{id}
 *   GET  export/{applications|board|votes|friends|reserved|users}
 *   GET  audit
 *   .114: GET|PUT bnet-switch {on, confirm}; GET|PUT leadership {guilds, namesConfirmed (.115)}; GET beta-reset, PUT beta-reset/closed {betaClosedAt},
 *         POST beta-reset {confirm, notice}; GET renames, POST renames/forced {auditId, confirm}, POST renames/{id}/approve|cancel
 *   .115: GET news, POST news {id,title,body,days}, POST news/update {id,revision,title,body,days}, POST news/delete {id,revision}
 *         (site-news.ts); settings.newsOn
 */
import { errorRef } from "./log";
import type { Env } from "./env";
import { audit, likeArg, now } from "./db";
import { normalizeCharacter } from "./codes";
import { apiJson, appOut, avatarUrl, BOARD_COUNTS, choicesOf, forgetBoardCounts, labelOf, ON_BOARD, onBoardSql, readJson, readSession, PAGE_VERSION, ROLE_OF_FIRST, searchMembers, shownName, UNDER_ROLE, type AppRow, type SiteUser } from "./site-core";
import { AVAIL_HOURS, availBits, BALLOTS, ballotOf, cleanAppointed, cleanNoVote, cleanText, fitFromBits, loadSettings, parseTime, POSITION_KEYS, professionOf, raidFit, roleLabel, settingsFrom, type SiteSettings } from "./site-data";
import { queueReserved, releaseReserved } from "./site-queue";
import { guildSeats } from "./guild-seats";
import { accountInfo, ownerOfCharacter, referencesNaming } from "./lookup";
import { communityEraseStatements } from "./community-context";
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
    return (await deleteSiteData(env, parts[1], actor, body.mentions === true)) ? apiJson({ ok: true }) : apiJson({ error: "not_found", message: "That account has nothing on this site." }, 404);
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
  if (m === "GET" && parts[0] === "audit") return recentAudit(env);
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
async function mentionDeletes(env: Env, id: string) {
  const refs = await referencesNaming(env, id);
  return [
    env.DB.prepare("DELETE FROM site_votes WHERE nominee_kind = 'discord' AND nominee_key = ?1").bind(id),
    env.DB.prepare("DELETE FROM site_friends WHERE friend_kind = 'discord' AND friend_key = ?1").bind(id),
    ...refs.map((r) => env.DB.prepare("UPDATE site_applications SET answers = ?2 WHERE discord_id = ?1").bind(r.owner, r.answers)),
  ];
}

/**
 * Everything the site holds about one account, removed at once: what they entered, their votes, the votes others cast
 * on their application, and the account row. Staff do this on request from the admin page (the site has no "delete my
 * data" button: the policy linked from the Discord application says to ask staff). Reserved names already in the
 * invite queue are taken out of it. A permanent denial outlives the data: the row stays with nothing in it but the id
 * and the denial, so the same account cannot simply sign up again. With `mentions`, what other members entered about
 * the account goes too (mentionDeletes: their Discord name, and any reason or note written about them).
 */
export async function deleteSiteData(env: Env, id: string, actor: string, mentions = false): Promise<boolean> {
  const row = await env.DB.prepare("SELECT denied FROM site_users WHERE discord_id = ?1").bind(id).first<{ denied: number }>();
  if (!row) return false;
  await releaseReserved(env, { ownerId: id }, actor);
  await env.DB.batch([
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
  ]);
  forgetBoardCounts();
  await audit(env, actor, "site.data_deleted", id, { mentions });
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

async function recentAudit(env: Env): Promise<Response> {
  const rows = await env.DB.prepare("SELECT ts, actor, action, subject, details FROM audit WHERE action LIKE 'site.%' ORDER BY id DESC LIMIT 100").all();
  return apiJson({ audit: rows.results });
}
