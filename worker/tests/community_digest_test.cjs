// Build .85 (1 Oct 2026): the officer digest (counts only, the fenced lease/intent/halt state on site_settings) and the
// coverage report, consolidation batch 7, through the REAL src/*.ts against the REAL schema in SQLite; Discord's HTTP
// side is stubbed and scripted (every post and delete is recorded). Covers the switch and the hour, the first post and
// its payload (no mention, no id), the counts per feature and their lifetimes, yesterday's deletion (ok, refused, 404,
// transient with the ten-minute wait and the three attempts), a refused post, an uncertain post and the halt, the resume
// route (fenced, audited, the page header, a non-admin), a crash between the frozen intent and the send, an unreadable
// state, a superseded run, a held lease, switching off and moving the channel, the cron wiring, the staff view, and the
// coverage report's four unavailable reasons and its classification. Run from the worker folder:
// node tests/community_digest_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, hooks = {}) {
  let batches = 0;
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    let params = [];
    const api = {
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings for SQL query (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        params = p;
        return api;
      },
      first: async () => { hooks.count?.(); return db.prepare(sql).get(...params) ?? null; },
      all: async () => { hooks.count?.(); return { results: db.prepare(sql).all(...params) }; },
      run: async () => { hooks.count?.(); return exec(sql, params); },
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      hooks.count?.();
      hooks.beforeBatch?.(++batches);
      db.exec("BEGIN");
      let out;
      try { out = stmts.map((s) => s._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      hooks.afterBatch?.(batches);
      return out;
    },
  };
}
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  return db;
}
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let LOGS = [];
globalThis.fetch = async (url) => { throw new Error("no network in tests: " + url); };
const stubs = {};
const cache = {};
function load(name) {
  const key = name.replace(/^\.\.\//, "./");
  if (stubs[key]) return stubs[key];
  const file = path.join(root, "src", name.replace(/^\.\//, "").replace(/^\.\.\//, "") + ".ts");
  const rel = path.relative(path.join(root, "src"), file).replace(/\\/g, "/");
  if (cache[rel]) return cache[rel].exports;
  const mod = { exports: {} };
  cache[rel] = mod;
  const dir = path.dirname(rel);
  new Function("module", "exports", "require", transpile(file))(mod, mod.exports, (p) => load(dir === "." ? p : p.startsWith("../") ? p.slice(3).replace(/^/, "./") : "./" + dir + "/" + p.replace(/^\.\//, "")));
  return mod.exports;
}
const realDiscord = (() => { const m = { exports: {} }; new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(m, m.exports, (p) => load(p)); return m.exports; })();
// the scripted Discord side: every post and delete is recorded; POST/DELETE decide the answer
class DiscordError extends Error { constructor(status) { super("discord " + status); this.status = status; this.body = ""; } }
let POSTS = [], DELETES = [], ATTEMPTS = [];
let POST = async () => ({ id: "900000000000000001" });
let DELETE = async () => undefined;
Object.assign(stubs, {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => { throw new Error("the digest must not use postMessage (its 429 retry); .91"); },
    staffNotice: async () => {},
    addRole: async () => {},
    removeRole: async () => {},
    guildMember: async () => ({ roles: [] }),
    setNickname: async () => {},
    rest: async (_env, method, p, body, attempt) => {
      if (method === "DELETE" && p.startsWith("/channels/")) { DELETES.push(p); ATTEMPTS.push(attempt); return DELETE(p); }
      if (method === "POST" && /^\/channels\/\d+\/messages$/.test(p)) { const channelId = p.split("/")[2]; POSTS.push({ channelId, payload: body }); ATTEMPTS.push(attempt); return POST(channelId, body); }
      throw new Error("no REST in tests: " + method + " " + p);
    },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
});
const siteCore = load("./site-core"), indexMod = load("./index"), digest = load("./community-digest");

let T = 1790500000; // Sun 27 Sep 2026 09:06:40 UTC
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let db = freshDb();
let statements = 0;
let BEFORE = null, AFTER = null;
const MODCH = "1554266499039105075", OTHERCH = "1554266647378919505";
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", STAFF = "472099715253796864", STAFF2 = "472099715253796865";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const ON = { COMMUNITY_FEATURES: "trials,restrictions,departures,contributions,privacy_intake,directory", OFFICER_DIGEST_ENABLED: "true", CHANNEL_MOD_ALERTS: MODCH, SITE_ADMINS: `${STAFF},${STAFF2}` };
// Normal feature requests need a session current to both the actor and the real SQL clock.
// sessionCookie captures expiry before its first await; restore the business clock before signing settles.
const cookieFor = async (id, version = 1) => {
  const actorTime = T;
  let issued;
  try {
    T = Math.max(actorTime, Math.floor(RealDate.now() / 1000));
    issued = siteCore.sessionCookie(env(), id, version);
  } finally {
    T = actorTime;
  }
  return (await issued).split(";")[0];
};
const call = async (method, path, id, body, over = ON, extraHeaders = {}) => {
  const headers = { Cookie: await cookieFor(id), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...extraHeaders };
  const res = await indexMod.default.fetch(new Request("https://guild.example" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const DAY = 86400;
const REAL_NOW = Math.floor(RealDate.now() / 1000);
const EXPIRED = REAL_NOW - 1, FUTURE = REAL_NOW + 30 * DAY;
const id22 = (c) => c.repeat(22);
const state = () => { const r = one("SELECT value FROM site_settings WHERE key = 'officer_digest'"); return r ? JSON.parse(r.value) : null; };
const setState = (s) => db.prepare("UPDATE site_settings SET value = ? WHERE key = 'officer_digest'").run(typeof s === "string" ? s : JSON.stringify(s));
const audits = (action) => all("SELECT * FROM audit WHERE action = ? ORDER BY id", action);
const noIds = (s) => !/\d{17,20}/.test(s);
const run = (over = ON) => digest.runOfficerDigest(env(over));
const dayOf = (t) => new RealDate(t * 1000).toISOString().slice(0, 10);
const nextDay = () => { T += DAY; };

(async () => {
  siteUser(MEMBER, { global_name: "Mia" }); siteUser(STAFF, { global_name: "Vik" }); siteUser(STAFF2, { global_name: "Ann" });

  console.log("\n== the switch, the hour, the first post ==");
  check("off: nothing happens and no state row is written", (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "off" && state() === null && POSTS.length === 0);
  check("on without a staff channel: off", digest.digestEnabled(env({ ...ON, CHANNEL_MOD_ALERTS: "" })) === false && (await run({ ...ON, CHANNEL_MOD_ALERTS: "" })) === "off");
  check("the review channel stands in when there is no alerts channel", digest.digestEnabled(env({ ...ON, CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: OTHERCH })) === true);
  check("before 15:00 UTC: not due, no state row", (await run()) === "not_due" && state() === null);
  T += 6 * 3600; // 15:06:40 UTC
  let day0 = dayOf(T);
  let r = await run();
  let s = state();
  check("the first post: posted to the alerts channel with the empty text", r === "posted" && POSTS.length === 1 && POSTS[0].channelId === MODCH && POSTS[0].payload.content === "**Officer digest:** nothing is waiting for an officer today.", r, JSON.stringify(POSTS[0]));
  check("the payload mentions nobody and carries the enforced nonce", JSON.stringify(POSTS[0].payload.allowed_mentions) === '{"parse":[]}' && POSTS[0].payload.enforce_nonce === true && typeof POSTS[0].payload.nonce === "string" && POSTS[0].payload.nonce.length <= 25 && noIds(POSTS[0].payload.content));
  check("the state: today, posted, final, no lease, no intent, the message tracked", s && s.day === day0 && s.outcome === "posted" && s.final === true && s.lease === null && s.intent === null && s.posted && s.posted.channelId === MODCH && s.posted.messageId === "900000000000000001" && s.posted.day === day0 && s.attempts === 1 && s.halted === false, JSON.stringify(s));
  let a = audits("community.officer_digest_posted");
  check("the audit row: cron, no subject, the counts, no id", a.length === 1 && a[0].actor === "cron" && a[0].subject === null && JSON.parse(a[0].details).counts.invitesWaiting === 0 && noIds(a[0].details), JSON.stringify(a));
  check("a second run the same day: done, nothing posted", (await run()) === "done_today" && POSTS.length === 1);
  check("the staff view reads the state and the preview in one admitted read", await (async () => { const v = await call("GET", "/api/admin/community/digest", STAFF); return v.status === 200 && v.body.enabled === true && v.body.channelConfigured === true && v.body.postsAfterUtcHour === 15 && v.body.state.day === day0 && v.body.state.outcome === "posted" && v.body.state.postedDay === day0 && v.body.state.halted === false && v.body.preview.includes("nothing is waiting") && v.body.counts.trialsDue === 0; })());
  check("the staff view for a member is refused", (await call("GET", "/api/admin/community/digest", MEMBER)).status >= 400);

  console.log("\n== the counts and their lifetimes ==");
  const ins = (sql, ...p) => db.prepare(sql).run(...p);
  ins("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES ('alpha', 'Alpha', ?, 'queued', ?)", MEMBER, T);
  ins("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES ('beta', 'Beta', ?, 'written', ?)", MEMBER, T);
  ins("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES ('gamma', 'Gamma', ?, 'joined', ?)", MEMBER, T);
  const trial = (id, due, retain) => ins("INSERT INTO community_trials (id, op_id, discord_id, started_at, review_due_at, status, created_at, updated_at, incarnation, retain_until) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)", id, id, MEMBER, T - 30 * DAY, due, T, T, id22("i"), retain);
  trial(id22("A"), T - 1, FUTURE); trial(id22("B"), T + DAY, FUTURE); trial(id22("C"), T - 1, EXPIRED);
  const dep = (id, status) => ins("INSERT INTO community_departure_reviews (id, discord_id, character_key, character_name, proof_key, kind, observed_at, status, reviewed_by, reviewed_at, created_at, retain_until) VALUES (?, ?, ?, ?, ?, 'left', ?, ?, ?, ?, ?, ?)", id, MEMBER, "k" + id.slice(0, 3), "Name " + id.slice(0, 1), "k" + id.slice(0, 3), T - DAY, status, status === "open" ? null : STAFF, status === "open" ? null : T, T, FUTURE);
  dep(id22("D"), "open"); dep(id22("E"), "acknowledged");
  const kase = (id, reviewAt, resolved) => ins("INSERT INTO community_restriction_cases (id, discord_id, category, set_by, set_at, review_at, expires_at, resolved_at, updated_at, incarnation) VALUES (?, ?, 'conduct_removal', ?, ?, ?, ?, ?, ?, ?)", id, MEMBER, STAFF, T - 10 * DAY, reviewAt, FUTURE, resolved, T, id22("c"));
  kase(id22("F"), T - 1, null); kase(id22("G"), T + DAY, null); kase(id22("H"), T - 1, T - DAY);
  const priv = (id, closed, retain) => ins("INSERT INTO community_privacy_cases (case_id, code_hash, payload_hash, kind, status, retention_days, retain_until, created_at, updated_at, closed_at) VALUES (?, ?, 'p', 'access', ?, 90, ?, ?, ?, ?)", id, "h".repeat(64), closed ? "completed" : "received", retain, T, T, closed ? T : null);
  priv(id22("P"), false, FUTURE); priv(id22("Q"), true, FUTURE); priv(id22("R"), false, EXPIRED);
  ins("INSERT INTO community_alt_claims (discord_id, name, name_key, status, claimed_at, updated_at) VALUES (?, 'Alt One', 'alt one', 'claimed', ?, ?)", MEMBER, T, T);
  ins("INSERT INTO community_alt_claims (discord_id, name, name_key, status, claimed_at, updated_at) VALUES (?, 'Alt Two', 'alt two', 'officer_confirmed', ?, ?)", MEMBER, T, T);
  ins("INSERT INTO community_contribution_policies (version, amount_copper, anchor_weekday, anchor_hour_utc, grace_hours, final_notice_days, review_days, new_member_exempt_days, created_at) VALUES ('v1', 10000, 1, 0, 0, 7, 7, 14, ?)", T);
  const oblig = (ps, finalNotice, finalContact, finalAck, retain) => ins("INSERT INTO community_contribution_obligations (guild_scope, discord_id, period_start, due_at, policy_version, amount_copper, eligible, state, final_notice_at, final_officer_contact_at, final_acknowledged_at, retain_until, created_at, updated_at) VALUES ('olympus', ?, ?, ?, 'v1', 10000, 1, 'open', ?, ?, ?, ?, ?, ?)", MEMBER, ps, ps + 7 * DAY, finalNotice, finalContact, finalAck, retain, T, T);
  oblig(T - 40 * DAY, T - 20 * DAY, T - 8 * DAY, null, FUTURE); // past its review date by the officer contact
  oblig(T - 33 * DAY, T - 20 * DAY, null, T - 6 * DAY, FUTURE); // the acknowledgement is six days old: not yet
  oblig(T - 26 * DAY, T - 20 * DAY, T - 8 * DAY, null, EXPIRED); // past, but gone by the database clock
  oblig(T - 19 * DAY, null, null, null, FUTURE); // no final notice yet
  let c = await digest.digestCounts(env(ON), T);
  check("the counts: 2 invites, 1 trial, 1 departure, 1 case, 1 private request, 1 claim, 1 dues week (lifetimes by the database clock)", JSON.stringify(c) === JSON.stringify({ invitesWaiting: 2, trialsDue: 1, departuresOpen: 1, casesReviewDue: 1, privateRequestsOpen: 1, claimsToReview: 1, duesPastReview: 1 }), JSON.stringify(c));
  let text = digest.digestContent(c);
  check("the text names every count in words, nothing else", text === "**Officer digest:** 2 invites are queued or written; 1 trial review is due; 1 departure item is open; 1 restriction case is due for review; 1 private request is open; 1 character claim waits for review; 1 dues week has passed its final review date. Review on the site's admin pages." && noIds(text), text);
  c = await digest.digestCounts(env({ ...ON, COMMUNITY_FEATURES: "trials" }), T);
  check("a feature that is off contributes null and is not mentioned; the invites always count", c.invitesWaiting === 2 && c.trialsDue === 1 && c.departuresOpen === null && c.casesReviewDue === null && c.privateRequestsOpen === null && c.claimsToReview === null && c.duesPastReview === null && digest.digestContent(c) === "**Officer digest:** 2 invites are queued or written; 1 trial review is due. Review on the site's admin pages.", JSON.stringify(c));
  check("plural forms", digest.digestContent({ invitesWaiting: 0, trialsDue: 2, departuresOpen: 3, casesReviewDue: 2, privateRequestsOpen: 2, claimsToReview: 2, duesPastReview: 2 }) === "**Officer digest:** 2 trial reviews are due; 3 departure items are open; 2 restriction cases are due for review; 2 private requests are open; 2 character claims wait for review; 2 dues weeks have passed their final review date. Review on the site's admin pages.");

  console.log("\n== the next day: yesterday's digest goes first ==");
  nextDay(); let day1 = dayOf(T);
  POST = async () => ({ id: "900000000000000002" });
  r = await run(); s = state();
  check("yesterday's message deleted, today's posted with the counts", r === "posted" && DELETES.length === 1 && DELETES[0] === `/channels/${MODCH}/messages/900000000000000001` && POSTS.length === 2 && POSTS[1].payload.content.includes("2 invites are queued or written") && s.posted.messageId === "900000000000000002" && s.posted.day === day1 && s.day === day1 && s.attempts === 1, r, DELETES.join(","), JSON.stringify(s));
  nextDay(); DELETE = async () => { throw new DiscordError(403); }; POST = async () => ({ id: "900000000000000003" });
  r = await run(); s = state();
  check("a refused deletion is recorded (stage delete, status none) and today still posts", r === "posted" && audits("community.officer_digest_failed").length === 1 && JSON.parse(audits("community.officer_digest_failed")[0].details).stage === "delete" && s.posted.messageId === "900000000000000003", r, JSON.stringify(audits("community.officer_digest_failed")));
  nextDay(); DELETE = async () => { throw new DiscordError(404); }; POST = async () => ({ id: "900000000000000004" });
  r = await run();
  check("a 404 on deletion counts as deleted: no failure row", r === "posted" && audits("community.officer_digest_failed").length === 1 && state().posted.messageId === "900000000000000004");
  nextDay(); let day4 = dayOf(T); DELETE = async () => { throw new DiscordError(500); }; POST = async () => ({ id: "900000000000000005" });
  const postsBefore = POSTS.length;
  r = await run(); s = state();
  check("a transient deletion failure waits ten minutes, keeps the old message tracked, posts nothing", r === "transient" && s.notBefore === T + 600 && s.attempts === 1 && s.posted.messageId === "900000000000000004" && s.lease === null && POSTS.length === postsBefore, r, JSON.stringify(s));
  check("within the wait: waiting", (await run()) === "waiting");
  T += 600; DELETE = async () => undefined;
  r = await run(); s = state();
  check("after the wait: deleted and posted, the second attempt of the day", r === "posted" && s.attempts === 2 && s.final === true && s.posted.messageId === "900000000000000005" && s.day === day4, r, JSON.stringify(s));
  nextDay(); DELETE = async () => { throw new DiscordError(500); };
  for (let i = 0; i < 3; i++) { r = await run(); T += 600; }
  s = state();
  check("three transient attempts in a day, then done for the day", r === "transient" && s.attempts === 3 && (await run()) === "done_today" && POSTS.length === postsBefore + 1, r, JSON.stringify(s));
  nextDay(); DELETE = async () => undefined; POST = async () => ({ id: "900000000000000006" });
  check("the next day recovers", (await run()) === "posted" && state().posted.messageId === "900000000000000006");

  console.log("\n== a refused post, an uncertain post, the halt and the resume ==");
  nextDay(); POST = async () => { throw new DiscordError(403); };
  r = await run(); s = state();
  check("a definitive 4xx on the post: refused, the day given up, nothing frozen, not halted, the status in the audit row", r === "refused" && s.intent === null && s.final === true && s.halted === false && s.posted === null && JSON.parse(audits("community.officer_digest_failed").at(-1).details).status === 403 && (await run()) === "done_today", r, JSON.stringify(s));
  nextDay(); POST = async () => ({ id: "900000000000000007" });
  check("tomorrow posts again", (await run()) === "posted");
  nextDay(); POST = async () => { throw new DiscordError(429); };
  r = await run(); s = state();
  check(".91 (1): a 429 on the post is a definitive non-send: transient (ten minutes), the frozen intent cleared, NOT a halt", r === "transient" && s.halted === false && s.intent === null && s.notBefore === T + 600 && JSON.parse(audits("community.officer_digest_failed").at(-1).details).status === 429, r, JSON.stringify(s));
  check("  every send and delete is made with no in-library 429 retry (attempt 1)", ATTEMPTS.length > 0 && ATTEMPTS.every((a) => a === 1));
  T += 600; POST = async () => ({ id: "900000000000000020" });
  check("  after the wait the digest is posted from a fresh state", (await run()) === "posted" && state().posted.messageId === "900000000000000020");
  nextDay(); let dayU = dayOf(T); POST = async () => { throw new DiscordError(500); };
  r = await run(); s = state();
  check("a 5xx on the post: uncertain, HALTED, the intent kept frozen (channel, nonce, text), the audit row with stage and status", r === "uncertain" && s.halted === true && s.final === true && s.intent && s.intent.channelId === MODCH && s.intent.day === dayU && s.intent.content.includes("Officer digest") && /^od\d{8}/.test(s.intent.nonce) && JSON.parse(audits("community.officer_digest_failed").at(-1).details).status === 500, r, JSON.stringify(s));
  const postsHalted = POSTS.length;
  check("halted: nothing is posted again, today or tomorrow", (await run()) === "halted" && (nextDay(), (await run()) === "halted") && POSTS.length === postsHalted);
  check("the staff view shows the halt", (await call("GET", "/api/admin/community/digest", STAFF)).body.state.halted === true);
  let v = await call("POST", "/api/admin/community/digest/resume", STAFF, {}, ON, { "X-Olympus": "1" });
  check("resume without the page's version: reload (409), nothing changed", v.status === 409 && v.body.error === "reload" && state().halted === true);
  v = await call("POST", "/api/admin/community/digest/resume", MEMBER, {});
  check("resume by a member: refused, nothing changed", v.status >= 400 && state().halted === true, v.status);
  v = await call("POST", "/api/admin/community/digest/resume", STAFF, {});
  s = state(); a = audits("community.officer_digest_resumed");
  check("resume by an administrator: the halt lifted, the intent cleared, today given up, audited with the admin as actor", v.status === 200 && v.body.resumed === true && s.halted === false && s.intent === null && s.final === true && s.day === dayOf(T) && s.outcome === "resumed" && a.length === 1 && a[0].actor === STAFF && JSON.parse(a[0].details).from === "uncertain" && one("SELECT updated_by FROM site_settings WHERE key = 'officer_digest'").updated_by === STAFF, v.status, JSON.stringify(v.body), JSON.stringify(s));
  check("resumed: done for today, tomorrow posts (the message from before the halt is the administrator's to remove)", (await run()) === "done_today" && (nextDay(), POST = async () => ({ id: "900000000000000008" }), (await run()) === "posted") && POSTS.length === postsHalted + 1);
  v = await call("POST", "/api/admin/community/digest/resume", STAFF, {});
  check("resume when not halted: nothing to do", v.status === 200 && v.body.resumed === false && v.body.reason === "not_halted" && audits("community.officer_digest_resumed").length === 1);
  db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF2);
  v = await call("POST", "/api/admin/community/digest/resume", STAFF2, {});
  check(".91 (4): a denied administrator's resume learns nothing from the state, not even not_halted: 403 denied", v.status === 403 && v.body.error === "denied" && !("reason" in v.body), v.status, JSON.stringify(v.body));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(STAFF2);

  console.log("\n== a crash between the frozen intent and the send; an unreadable state; a superseded run; a held lease ==");
  nextDay();
  s = state(); setState({ ...s, intent: { channelId: MODCH, nonce: "od20260101abcdefghijkl", content: "frozen", day: s.day, startedAt: T - 1000 }, final: false });
  r = await run(); s = state();
  check("a frozen intent with no recorded outcome halts the digest at the next run", r === "uncertain" && s.halted === true && s.intent && s.intent.content === "frozen" && JSON.parse(audits("community.officer_digest_failed").at(-1).details).stage === "post" && POSTS.length === postsHalted + 1, r, JSON.stringify(s));
  v = await call("POST", "/api/admin/community/digest/resume", STAFF, {});
  check("resumed again", v.body.resumed === true && state().halted === false);
  setState("not json at all");
  check("an unreadable state halts", (await run()) === "halted" && POSTS.length === postsHalted + 1);
  setState(JSON.stringify({ day: "x", outcome: "posted" }));
  check("an incomplete state halts too", (await run()) === "halted");
  v = await call("POST", "/api/admin/community/digest/resume", STAFF, {});
  s = state();
  check("the administrator's resume rewrites an unreadable state into a clean one", v.body.resumed === true && s.halted === false && s.outcome === "resumed" && s.posted === null && s.intent === null && s.lease === null && JSON.parse(audits("community.officer_digest_resumed").at(-1).details).from === "unreadable", JSON.stringify(s));
  nextDay(); POST = async () => ({ id: "900000000000000009" });
  check("and the digest runs again", (await run()) === "posted" && state().posted.messageId === "900000000000000009");
  nextDay();
  let fired = false;
  AFTER = (i) => { if (i === 1) { fired = true; setState({ ...state(), lease: null, outcome: "elsewhere" }); AFTER = null; } }; // the lease is batch 1 of this run; another writer takes the row right after it
  r = await run(); s = state();
  check("a run whose compare-and-set loses after its lease stops: superseded, nothing posted, the other writer's state untouched", fired && r === "superseded" && s.outcome === "elsewhere" && POSTS.length === postsHalted + 2, r, JSON.stringify(s));
  setState({ ...state(), lease: { token: "t", until: T + 100 } });
  check("a held lease: busy", (await run()) === "busy");
  setState({ ...state(), lease: null });
  check("released: posted", (await run()) === "posted");
  check("(every armed hook fired)", AFTER === null && BEFORE === null);

  console.log("\n== switched off, moved, and the cron wiring ==");
  const delsBefore = DELETES.length;
  r = await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" }); s = state();
  check("switched off: the posted digest is deleted, the state cleared of it, audited as removed", r === "cleaned_up" && DELETES.length === delsBefore + 1 && s.posted === null && s.final === true && audits("community.officer_digest_removed").length === 1 && noIds(audits("community.officer_digest_removed")[0].details), r, JSON.stringify(s));
  check("off and clean: off", (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "off" && DELETES.length === delsBefore + 1);
  nextDay(); POST = async () => ({ id: "900000000000000030" });
  check("(fixture) posted again", (await run()) === "posted");
  DELETE = async () => { throw new DiscordError(500); };
  const delsCap = DELETES.length;
  for (let i = 0; i < 3; i++) { r = await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" }); T += 600; }
  s = state();
  check(".91 (2): the off cleanup is bounded by the three attempts a day like every other attempt (the day's post was the first): two transient deletes reach the cap, then done for the day, the post still tracked, no fourth delete", r === "done_today" && DELETES.length === delsCap + 2 && s.attempts === 3 && s.outcome === "transient" && s.posted !== null && (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "done_today" && DELETES.length === delsCap + 2, r, JSON.stringify(s));
  DELETE = async () => undefined;
  nextDay();
  check("  the next day it is cleaned up", (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "cleaned_up" && state().posted === null);
  nextDay(); POST = async () => ({ id: "900000000000000031" });
  check("(fixture) posted again", (await run()) === "posted");
  T = T - (T % DAY) + DAY + 14 * 3600; // the next day at 14:00 UTC, before the posting hour
  POST = async () => ({ id: "900000000000000032" });
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH }); s = state();
  check(".91 (3): moved to another channel before the posting hour: the old post is deleted now, nothing is posted yet (not_due), no lease left; .97: that cleanup counted as the day's first attempt", r === "not_due" && DELETES.at(-1) === `/channels/${MODCH}/messages/900000000000000031` && s.posted === null && s.lease === null && s.attempts === 1 && s.outcome === "cleaned_up" && POSTS.at(-1).payload.content !== undefined && POSTS.at(-1).channelId === MODCH, r, JSON.stringify(s));
  T += 3600;
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH }); s = state();
  check("  at the hour it posts in the new channel, the day's second attempt", r === "posted" && POSTS.at(-1).channelId === OTHERCH && s.posted.channelId === OTHERCH && s.attempts === 2, r, JSON.stringify(s));
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH });
  check("  (fixture) back in the alerts channel for the rest of the suite", (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "cleaned_up" && (nextDay(), POST = async () => ({ id: "900000000000000033" }), (await run()) === "posted"));
  // .97 (Codex's review of .91, 08:40, group 2): the exact four-invocation trace, one actual REST call each
  nextDay(); T = T - (T % DAY) + 14 * 3600 + 6 * 60; // 14:06 UTC, before the posting hour; yesterday's post is in the alerts channel
  DELETE = async () => { throw new DiscordError(429, "{}"); };
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH }); s = state();
  check(".97: 14:06, moved, the delete rate-limited: transient, attempt 1, the post still tracked, ten minutes to wait", r === "transient" && s.attempts === 1 && s.posted !== null && s.notBefore === T + 600, r, JSON.stringify(s));
  T += 600; DELETE = async () => undefined;
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH }); s = state();
  check("  14:16, the delete succeeds before the hour: not_due, the cleanup counted as attempt 2, the post untracked, no lease, audited as removed", r === "not_due" && s.attempts === 2 && s.posted === null && s.lease === null && JSON.parse(audits("community.officer_digest_removed").at(-1).details).stage === "cleanup", r, JSON.stringify(s));
  T += 50 * 60; POST = async () => ({ id: "900000000000000040" });
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH }); s = state();
  check("  15:06, the post succeeds in the new channel: attempt 3 of the day", r === "posted" && s.attempts === 3 && s.posted.channelId === OTHERCH && s.posted.messageId === "900000000000000040", r, JSON.stringify(s));
  const delsAtCap = DELETES.length;
  DELETE = async () => { throw new DiscordError(429, "{}"); };
  r = await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" }); s = state();
  check("  a fourth invocation (switched off) the same day: done_today by the cap, no delete attempted, the post still tracked for tomorrow", r === "done_today" && DELETES.length === delsAtCap && s.posted !== null && s.posted.messageId === "900000000000000040", r, JSON.stringify(s));
  DELETE = async () => undefined;
  nextDay();
  check("  the next day the cleanup goes through", (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "cleaned_up" && state().posted === null);
  nextDay(); POST = async () => ({ id: "900000000000000010" });
  check("switched on again: posted", (await run()) === "posted");
  POST = async () => ({ id: "900000000000000011" });
  r = await run({ ...ON, CHANNEL_MOD_ALERTS: OTHERCH }); s = state();
  check("moved to another channel the same day: the old digest deleted, the new one posted there", r === "posted" && DELETES.at(-1) === `/channels/${MODCH}/messages/900000000000000010` && POSTS.at(-1).channelId === OTHERCH && s.posted.channelId === OTHERCH && s.posted.messageId === "900000000000000011", r, JSON.stringify(s));
  r = await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" });
  check("off, a refused deletion: tracking stops and the refusal is audited (stage cleanup)", (DELETE = async () => { throw new DiscordError(403); }, nextDay(), POST = async () => ({ id: "900000000000000012" }), (await run()) === "posted" && (await run({ ...ON, OFFICER_DIGEST_ENABLED: "false" })) === "refused" && state().posted === null && JSON.parse(audits("community.officer_digest_failed").at(-1).details).stage === "cleanup"), r);
  DELETE = async () => undefined;
  nextDay(); POST = async () => ({ id: "900000000000000013" });
  const waits = [];
  await indexMod.default.scheduled({ cron: "*/30 * * * *" }, env(ON), { waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})) });
  await Promise.all(waits);
  check("the cron runs the digest", state().posted && state().posted.messageId === "900000000000000013" && POSTS.at(-1).payload.content.includes("Officer digest"));
  check("no console line carried a secret or an id (the digest logs only error categories)", LOGS.every(noIds));

  console.log("\n== the coverage report ==");
  const cov = (id = STAFF) => call("GET", "/api/admin/community/coverage", id);
  v = await cov();
  check("no export: coverage null with the reason, the limitations stated", v.status === 200 && v.body.coverage === null && v.body.unavailableReason === "no_export" && v.body.snapshot === null && Array.isArray(v.body.limitations) && v.body.limitations.length === 4 && typeof v.body.generatedAt === "string", JSON.stringify(v.body));
  check("a member is refused", (await cov(MEMBER)).status >= 400);
  const snap = (exportedAt, count) => { ins("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count) VALUES (?, ?, 'addon', ?)", exportedAt, T, count); return one("SELECT id FROM roster_snapshots ORDER BY id DESC LIMIT 1").id; };
  const rm = (sid, key, name, extra = {}) => ins("INSERT INTO roster_members (snapshot_id, name_key, name, rank, class, last_online) VALUES (?, ?, ?, ?, ?, ?)", sid, key, name, extra.rank ?? "Member", extra.cls ?? "Warrior", extra.lastOnline ?? null);
  const REAL_NOW = Math.floor(RealDate.now() / 1000);
  let sid = snap(REAL_NOW - 8 * DAY, 1); rm(sid, "old one", "Old One");
  v = await cov();
  check("an export older than seven days by the database clock: stale, with the snapshot described", v.body.coverage === null && v.body.unavailableReason === "stale" && v.body.snapshot.memberCount === 1 && v.body.snapshot.rowsPresent === 1, JSON.stringify(v.body.snapshot), v.body.unavailableReason);
  sid = snap(REAL_NOW - 7 * DAY - 1, 1); rm(sid, "edge one", "Edge One");
  v = await cov();
  const digestSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "community-digest.ts"), "utf8");
  check(".97 (Codex's review of .91, group 1): the baseline is older-than-seven-days: one second older than seven days is stale, and the acquisition's freshness test is `exported_at >= DB_NOW - 7 days` (exactly seven days is fresh)", v.body.coverage === null && v.body.unavailableReason === "stale" && digestSrc.includes("(exported_at >= ${DB_NOW} - ${COVERAGE_STALE_S}) AS fresh") && !digestSrc.includes("(exported_at > ${DB_NOW}"), v.body.unavailableReason);
  sid = snap(REAL_NOW - 7 * DAY + 3600, 1); rm(sid, "fresh one", "Fresh One");
  v = await cov();
  check(".91 (5): freshness is judged by the database clock in the admitted acquisition, not the actor's clock (this suite's clock runs weeks ahead): an export six days and 23 hours old is fresh, and generatedAt is the database's time", v.body.unavailableReason === null && v.body.coverage !== null && Math.abs(new RealDate(v.body.generatedAt).getTime() / 1000 - REAL_NOW) < 120, v.body.unavailableReason, v.body.generatedAt);
  sid = snap(REAL_NOW - 100, 3); rm(sid, "one", "One"); rm(sid, "two", "Two");
  v = await cov();
  check("a row count that does not match the export's member count: count_mismatch", v.body.coverage === null && v.body.unavailableReason === "count_mismatch" && v.body.snapshot.rowsPresent === 2 && v.body.snapshot.memberCount === 3, v.body.unavailableReason);
  // the good export: eight characters, seven accounts, one of each class
  const B = "400000000000000002", C = "400000000000000003", D = "400000000000000004", E = "400000000000000005", F = "400000000000000006", G = "400000000000000007", H = "400000000000000008";
  for (const idd of [B, C, D, E, F, G, H]) ins("INSERT INTO members (discord_id, banned) VALUES (?, ?)", idd, idd === C ? 1 : 0);
  const chr = (key, name, idd, status) => ins("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?, ?, ?, ?, ?)", key, name, idd, status, T - DAY);
  chr("bela", "Bela", B, "member"); chr("cato", "Cato", C, "member"); chr("dido", "Dido", D, "verified"); chr("echo", "Echo", E, "member"); chr("fern", "Fern", F, "member"); chr("gaia", "Gaia", G, "member"); chr("hera", "Hera", H, "member"); chr("hera two", "Hera Two", H, "member");
  siteUser(B); siteUser(C); siteUser(E, { denied: 1 }); siteUser(F, { in_server: 0 }); siteUser(H);
  ins("INSERT INTO community_restriction_cases (id, discord_id, category, set_by, set_at, review_at, expires_at, updated_at, incarnation) VALUES (?, ?, 'conduct_removal', ?, ?, ?, ?, ?, ?)", id22("Z"), H, STAFF, T, T + 30 * DAY, FUTURE, T, id22("z"));
  sid = snap(REAL_NOW - 50, 9);
  rm(sid, "alf", "Alf", { rank: "Initiate", cls: "Mage", lastOnline: T - 3600 }); rm(sid, "bela", "Bela"); rm(sid, "cato", "Cato"); rm(sid, "dido", "Dido"); rm(sid, "echo", "Echo"); rm(sid, "fern", "Fern"); rm(sid, "gaia", "Gaia"); rm(sid, "hera", "Hera"); rm(sid, "hera two", "Hera Two");
  v = await cov();
  const cv = v.body.coverage;
  check("a fresh matching export: the report", v.status === 200 && v.body.unavailableReason === null && cv && cv.rosterRows === 9 && cv.boundRows === 8 && cv.distinctPeople === 7 && v.body.snapshot.memberCount === 9, JSON.stringify(v.body).slice(0, 400));
  check("every class once (two characters of one restricted account)", cv && JSON.stringify(cv.totals) === JSON.stringify({ unbound: 1, covered: 1, banned: 1, bound_not_member: 1, denied: 1, not_in_server: 1, no_site_account: 1, restricted: 2 }), cv && JSON.stringify(cv.totals));
  check("the entries are ordered by name key with the account and class; an unbound row names no account", cv && cv.entries.map((e) => e.name).join(",") === "Alf,Bela,Cato,Dido,Echo,Fern,Gaia,Hera,Hera Two" && cv.entries[0].class === "unbound" && cv.entries[0].discordId === null && cv.entries[0].rank === "Initiate" && cv.entries[0].gameClass === "Mage" && cv.entries[0].lastOnline === new RealDate((T - 3600) * 1000).toISOString() && cv.entries[1].discordId === B && cv.entries[1].class === "covered" && cv.entries[3].class === "bound_not_member", cv && JSON.stringify(cv.entries));
  check("people group characters by account", cv && cv.people.length === 7 && cv.people.find((p) => p.discordId === H).characters.map((x) => x.name + ":" + x.class).join(",") === "Hera:restricted,Hera Two:restricted");
  check("the report is read behind the staff member's own admission: a signed-out session is refused", (await indexMod.default.fetch(new Request("https://guild.example/api/admin/community/coverage", { headers: { Origin: "https://guild.example", "X-Olympus": "2" } }), env(ON), ctx)).status >= 400);
  sid = snap(REAL_NOW - 10, 2001);
  const big = db.prepare("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, ?, ?)");
  for (let i = 0; i < 2001; i++) big.run(sid, "n" + String(i).padStart(5, "0"), "N" + i);
  v = await cov();
  check("more than 2000 rows: too_large, rowsPresent capped at 2000", v.body.coverage === null && v.body.unavailableReason === "too_large" && v.body.snapshot.rowsPresent === 2000 && v.body.snapshot.memberCount === 2001, v.body.unavailableReason, JSON.stringify(v.body.snapshot));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
