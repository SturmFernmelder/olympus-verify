// Build .82 (1 Oct 2026): the private request intake (consolidation batch 6), through the REAL src/*.ts against the REAL
// schema in SQLite; Discord's HTTP side is stubbed. Covers the flag and the three switches, the receipt and its exact
// retry, conflicts, the honeypot, origin, media type, the body budget, bad JSON and bidi text, reads with a wrong code or
// an unknown case, the reply with its retry, a reused id, the renewed deadline and the requester cap, the staff list,
// read and update (reply, replay, operation conflicts, closing with the pinned deadline, a reply after it refused), the
// fence and the page header, the per-IP limiter and the per-hour cap, the effective cutoff on every path, and the purge
// with the flag off. Run from the worker folder:  node tests/community_privacy_test.cjs
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
Object.assign(stubs, {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => ({ id: "1" }),
    staffNotice: async () => {},
    addRole: async () => {},
    removeRole: async () => {},
    guildMember: async () => ({ roles: [] }),
    setNickname: async () => {},
    rest: async () => { throw new Error("no REST in tests"); },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
});
const siteCore = load("./site-core"), indexMod = load("./index"), intake = load("./community-privacy-intake");

let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let db = freshDb();
let statements = 0;
let BEFORE = null, AFTER = null;
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", STAFF = "472099715253796864", STAFF2 = "472099715253796865";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const ON = { COMMUNITY_FEATURES: "privacy_intake", PRIVACY_INTAKE_ENABLED: "true", PRIVACY_INTAKE_MONITORED: "true", PRIVACY_INTAKE_RETENTION_DAYS: "90", SITE_ADMINS: `${STAFF},${STAFF2}` };
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
/** A signed-in call (staff and member routes). */
const call = async (method, path, id, body, over = ON, extraHeaders = {}) => {
  const headers = { Cookie: await cookieFor(id), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...extraHeaders };
  const res = await indexMod.default.fetch(new Request("https://guild.example" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};
let ipCounter = 0;
/** Legacy inner-case-engine compatibility fixtures; this adapter selection is NOT the shipping public create route.
 * Only exact POST /api/privacy/requests uses the actual trusted form adapter. Other paths use the actual index.
 * New boundary controls below choose actual-public and exercise the real SSR form admission independently. */
const pub = async (path, body, { over = ON, headers = {}, raw, routeProfile = "legacy-engine" } = {}) => {
  if (routeProfile !== "legacy-engine" && routeProfile !== "actual-public") throw new Error("unknown privacy fixture route profile");
  const h = { Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", "CF-Connecting-IP": `203.0.113.${++ipCounter % 250}`, ...headers };
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  const request = new Request("https://guild.example" + path, { method: body === undefined && raw === undefined ? "GET" : "POST", headers: h, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
  const res = routeProfile === "legacy-engine" && path === "/api/privacy/requests" && request.method === "POST"
    ? await intake.handlePrivacyIntakeForm(request, env(over), path)
    : await indexMod.default.fetch(request, env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};

const one = (sql, ...p) => db.prepare(sql).get(...p);
const iso = (s) => new Date(s * 1000).toISOString();
const DAY = 86400;
const id22 = (c) => c.repeat(22), code43 = (c) => c.repeat(43);
const C1 = id22("A"), K1 = code43("k");
const EXPIRED = Math.floor(RealDate.now() / 1000) - 1;

(async () => {
  siteUser(MEMBER, { global_name: "Mia" }); siteUser(STAFF, { global_name: "Vik" }); siteUser(STAFF2, { global_name: "Ann" });

  console.log("\n== current public JSON and actual SSR contact boundaries ==");
  const privacyLegacyDb = db;
  db = freshDb();
  try {
    const publicCreate = { caseId: id22("q"), caseCode: code43("g"), kind: "other", details: "A current public JSON request." };
    let boundary = await pub("/api/privacy/requests", publicCreate, { routeProfile: "actual-public" });
    check("current public JSON fresh creation returns 410 use_contact_form with canonical links and no stored case/message", boundary.status === 410 && boundary.body.error === "use_contact_form" && boundary.body.contactUrl === "https://olympus.roachcouncil.com/privacy/contact" && boundary.body.existingCaseUrl === "https://olympus.roachcouncil.com/privacy/case" && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0 && one("SELECT COUNT(*) AS n FROM community_privacy_messages").n === 0);
    boundary = await pub("/api/privacy/requests", publicCreate, { routeProfile: "actual-public", over: { ...ON, COMMUNITY_FEATURES: "" } });
    check("the actual public JSON route still honours the privacy feature OFF fence", boundary.status === 503 && boundary.body.error === "feature_disabled" && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    boundary = await pub("/api/privacy/requests", publicCreate, { routeProfile: "actual-public", over: { ...ON, PRIVACY_INTAKE_ENABLED: "false" } });
    check("an intake setting cannot restore the retired public JSON creation path", boundary.status === 410 && boundary.body.error === "use_contact_form" && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    const contactGet = await indexMod.default.fetch(new Request("https://guild.example/privacy/contact"), env(ON), ctx);
    const contactHtml = await contactGet.text(), contactSetCookie = contactGet.headers.get("Set-Cookie") ?? "";
    const contactFields = Object.fromEntries(["csrf", "caseId", "caseCode"].map((name) => [name, new RegExp('name="' + name + '" value="([^"]*)"').exec(contactHtml)?.[1] ?? ""]));
    const contactCookie = contactSetCookie.split(";")[0];
    check("the actual contact GET issues a finite signed CSRF token and private form cookie with generated case credentials", contactGet.status === 200 && /^text\/html/.test(contactGet.headers.get("Content-Type") ?? "") && /^__Host-olg_privacy_form=[A-Za-z0-9_-]{43}$/.test(contactCookie) && /Secure/.test(contactSetCookie) && /HttpOnly/.test(contactSetCookie) && /SameSite=Strict/.test(contactSetCookie) && /^\d{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(contactFields.csrf) && /^[A-Za-z0-9_-]{22}$/.test(contactFields.caseId) && /^[A-Za-z0-9_-]{43}$/.test(contactFields.caseCode));
    const contactPayload = { ...contactFields, kind: "correction", details: "Please correct my guild label.", subjectHint: "", characterHint: "" };
    const formPost = async (payload, headers = {}) => {
      const response = await indexMod.default.fetch(new Request("https://guild.example/privacy/contact", { method: "POST", headers: { Origin: "https://guild.example", "Content-Type": "application/x-www-form-urlencoded", Cookie: contactCookie, "CF-Connecting-IP": "198.51.100.91", ...headers }, body: typeof payload === "string" ? payload : new URLSearchParams(payload).toString() }), env(ON), ctx);
      return { status: response.status, text: await response.text() };
    };
    let formResult = await formPost(contactPayload, { Cookie: "" });
    check("the actual contact POST refuses a missing form cookie before storing any case", formResult.status === 403 && formResult.text.includes("form_expired") && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    formResult = await formPost({ ...contactPayload, csrf: "invalid" });
    check("the actual contact POST refuses an invalid CSRF token before storing any case", formResult.status === 403 && formResult.text.includes("form_expired") && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    formResult = await formPost(contactPayload, { Origin: "https://evil.example" });
    check("the actual contact POST retains the same-origin form guard", formResult.status === 403 && formResult.text.includes("bad_origin") && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    const changedCode = (contactFields.caseCode[0] === "a" ? "b" : "a") + contactFields.caseCode.slice(1);
    formResult = await formPost({ ...contactPayload, caseCode: changedCode });
    check("the actual contact CSRF token is bound to the generated case credentials", formResult.status === 403 && formResult.text.includes("form_expired") && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    const duplicateFields = new URLSearchParams(contactPayload); duplicateFields.append("csrf", contactFields.csrf);
    formResult = await formPost(duplicateFields.toString());
    check("the actual finite form parser refuses duplicate fields before intake", formResult.status === 400 && formResult.text.includes("invalid_form") && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    formResult = await formPost({ ...contactPayload, details: "x".repeat(8200) });
    check("the actual contact form retains its 8 KiB streamed body budget before intake", formResult.status === 413 && formResult.text.includes("body_too_large") && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);
    formResult = await formPost(contactPayload);
    const contactCase = one("SELECT retention_days, retain_until, code_hash FROM community_privacy_cases WHERE case_id = ?", contactFields.caseId);
    check("a valid actual contact form creates one case through genuine CSRF admission with its original lifetime and only the code hash", formResult.status === 201 && formResult.text.includes("Private request received") && contactCase?.retention_days === 90 && contactCase.retain_until === T + 90 * DAY && contactCase.code_hash.length === 64 && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 1 && one("SELECT COUNT(*) AS n FROM community_privacy_messages").n === 1 && !JSON.stringify(db.prepare("SELECT * FROM community_privacy_cases").all()).includes(contactFields.caseCode));
    const replayPayload = { caseId: contactFields.caseId, caseCode: contactFields.caseCode, kind: contactPayload.kind, details: contactPayload.details, subjectHint: "", characterHint: "" };
    boundary = await pub("/api/privacy/requests", replayPayload, { routeProfile: "actual-public", over: { ...ON, PRIVACY_INTAKE_ENABLED: "false" } });
    check("the actual public JSON path still returns an exact existing-case receipt while new intake is paused", boundary.status === 200 && boundary.body.caseId === contactFields.caseId && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 1 && one("SELECT COUNT(*) AS n FROM community_privacy_messages").n === 1);
    boundary = await pub("/api/privacy/requests/read", { caseId: contactFields.caseId, caseCode: contactFields.caseCode }, { routeProfile: "actual-public" });
    check("the actual public existing-case read releases the SSR-created conversation with the correct code", boundary.status === 200 && boundary.body.messages.length === 1 && boundary.body.messages[0].text === contactPayload.details && boundary.body.messages[0].from === "you");
    boundary = await pub("/api/privacy/requests/read", { caseId: contactFields.caseId, caseCode: changedCode }, { routeProfile: "actual-public" });
    check("the actual public existing-case read refuses a wrong code without revealing the conversation", boundary.status === 404 && boundary.body.error === "case_not_found" && !("messages" in boundary.body));
    boundary = await pub("/api/privacy/requests", { ...replayPayload, details: "A different payload." }, { routeProfile: "actual-public" });
    check("the actual public existing-case retry remains conflict-checked rather than silently redirected or overwritten", boundary.status === 409 && boundary.body.error === "case_conflict" && one("SELECT COUNT(*) AS n FROM community_privacy_messages").n === 1);
    boundary = await pub("/api/privacy/requests", publicCreate, { routeProfile: "actual-public" });
    check("the successful SSR case does not reopen fresh creation through the actual public JSON path", boundary.status === 410 && boundary.body.error === "use_contact_form" && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 1);
  } finally {
    const privacyBoundaryDb = db;
    db = privacyLegacyDb;
    privacyBoundaryDb.close();
  }

  console.log("\n== the flag and the three switches ==");
  let r = await pub("/api/privacy/config", undefined, { over: { ...ON, COMMUNITY_FEATURES: "" } });
  check("with the flag off every intake route is 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await pub("/api/privacy/config");
  check("the config says new cases are accepted, the retention and the limits, no secrets", r.status === 200 && r.body.enabled === true && r.body.retentionDays === 90 && r.body.maxDetailsLength === 2000 && r.body.monitoringConfirmed === true && !/secret|token/i.test(JSON.stringify(r.body)));
  r = await pub("/api/privacy/config", undefined, { over: { ...ON, PRIVACY_INTAKE_MONITORED: "false" } });
  check("  without someone confirmed to read the queue, new cases are not accepted", r.body.enabled === false && r.body.monitoringConfirmed === false);
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "deletion", details: "Please delete my data." }, { over: { ...ON, PRIVACY_INTAKE_RETENTION_DAYS: "" } });
  check("  a new case without a retention is 503 intake_unavailable (storage never starts without a lifetime)", r.status === 503 && r.body.error === "intake_unavailable");
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "deletion", details: "Please delete my data." }, { over: { ...ON, PRIVACY_INTAKE_ENABLED: "false" } });
  check("  nor while the form is switched off", r.status === 503 && r.body.error === "intake_unavailable" && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 0);

  console.log("\n== opening a case ==");
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "deletion", details: "Please delete my data. I lost my Discord account.", subjectHint: "Mia", characterHint: "Mia One" });
  check("a case is opened: 201 with the receipt (status received, the deadline = creation + the retention), its details are the first message, only the code's hash is stored", r.status === 201 && r.body.caseId === C1 && r.body.status === "received" && r.body.createdAt === iso(T) && r.body.retentionDeadline === iso(T + 90 * DAY) && one("SELECT text, author FROM community_privacy_messages WHERE case_id = ?", C1).text === "Please delete my data. I lost my Discord account." && one("SELECT code_hash, subject_hint FROM community_privacy_cases WHERE case_id = ?", C1).code_hash.length === 64 && !JSON.stringify(db.prepare("SELECT * FROM community_privacy_cases").all()).includes(K1), JSON.stringify(r.body));
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "deletion", details: "Please delete my data. I lost my Discord account.", subjectHint: "Mia", characterHint: "Mia One" });
  check("  the exact retry returns the original receipt (200), even while intake is paused", r.status === 200 && r.body.caseId === C1 && r.body.retentionDeadline === iso(T + 90 * DAY) && (await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "deletion", details: "Please delete my data. I lost my Discord account.", subjectHint: "Mia", characterHint: "Mia One" }, { over: { ...ON, PRIVACY_INTAKE_ENABLED: "false" } })).status === 200);
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "access", details: "Something else." });
  check("  a different submission under that id is 409 case_conflict", r.status === 409 && r.body.error === "case_conflict");
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: code43("x"), kind: "deletion", details: "Please delete my data. I lost my Discord account.", subjectHint: "Mia", characterHint: "Mia One" });
  check("  so is the same submission with another code", r.status === 409 && r.body.error === "case_conflict");
  r = await pub("/api/privacy/requests", { caseId: id22("B"), caseCode: K1, kind: "deletion", details: "x", website: "http://spam" });
  check("the honeypot field filled is 400", r.status === 400 && r.body.error === "invalid_request");
  r = await pub("/api/privacy/requests", { caseId: id22("B"), caseCode: K1, kind: "deletion" });
  check("missing details are 400", r.status === 400);
  r = await pub("/api/privacy/requests", { caseId: id22("B"), caseCode: K1, kind: "deletion", details: "left‮right" });
  check("a bidi override in the text is 400", r.status === 400);
  r = await pub("/api/privacy/requests", { caseId: id22("B"), caseCode: K1, kind: "deletion", details: "x" }, { headers: { Origin: "https://evil.example" } });
  check("another origin is 403 bad_origin", r.status === 403 && r.body.error === "bad_origin");
  r = await pub("/api/privacy/requests", { caseId: id22("B"), caseCode: K1, kind: "deletion", details: "x" }, { headers: { "Content-Type": "text/plain" } });
  check("a non-JSON media type is 415", r.status === 415);
  r = await pub("/api/privacy/requests", undefined, { raw: "{not json" });
  check("unparseable JSON is 400 invalid_json", r.status === 400 && r.body.error === "invalid_json");
  r = await pub("/api/privacy/requests", undefined, { raw: JSON.stringify({ caseId: id22("B"), caseCode: K1, kind: "deletion", details: "y".repeat(9000) }) });
  check("a body past the 8 KiB budget is 413 body_too_large, read from the stream", r.status === 413 && r.body.error === "body_too_large" && !one("SELECT 1 FROM community_privacy_cases WHERE case_id = ?", id22("B")));
  check("nothing about any Discord account was stored", !JSON.stringify(db.prepare("SELECT * FROM community_privacy_cases").all()).includes(MEMBER));

  console.log("\n== reading and replying ==");
  r = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: K1 });
  check("the requester reads the case: kind, status, the deadline, the details as their own first message", r.status === 200 && r.body.kind === "deletion" && r.body.status === "received" && r.body.messages.length === 1 && r.body.messages[0].from === "you" && r.body.messages[0].messageId === C1 && r.body.hasMore === false, JSON.stringify(r.body).slice(0, 300));
  r = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: code43("x") });
  check("  a wrong code is 404 case_not_found, the same answer as an unknown case", r.status === 404 && r.body.error === "case_not_found" && (await pub("/api/privacy/requests/read", { caseId: id22("Z"), caseCode: K1 })).status === 404);
  r = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: K1, before: id22("Q") });
  check("  a cursor naming no message of the case is 400", r.status === 400);
  T += DAY;
  const M1 = id22("M");
  r = await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: M1, text: "I also used the name Mia Two." });
  check("a reply is recorded (201) and renews the deadline under the case's OWN retention from now", r.status === 201 && r.body.messageId === M1 && one("SELECT retain_until, updated_at FROM community_privacy_cases WHERE case_id = ?", C1).retain_until === T + 90 * DAY && one("SELECT updated_at FROM community_privacy_cases WHERE case_id = ?", C1).updated_at === T, JSON.stringify(r.body));
  r = await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: M1, text: "I also used the name Mia Two." });
  check("  the exact retry returns the original answer (200)", r.status === 200 && r.body.messageId === M1 && r.body.at === iso(T));
  r = await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: M1, text: "Different." });
  check("  a reused id with other text is 409 message_conflict", r.status === 409 && r.body.error === "message_conflict");
  for (let i = 0; i < 18; i++) await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: id22(String.fromCharCode(97 + i)), text: `more ${i}` });
  r = await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: id22("y"), text: "one too many" });
  check("the requester's 21st message is 429 message_limit (20 per case, the details included)", r.status === 429 && r.body.error === "message_limit" && one("SELECT COUNT(*) AS n FROM community_privacy_messages WHERE case_id = ? AND author = 'requester'", C1).n === 20);
  r = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: K1 });
  check("  the read pages the newest 50 oldest-first (all 20 here), hasMore false", r.body.messages.length === 20 && r.body.messages[0].messageId === C1 && r.body.hasMore === false);

  console.log("\n== the staff side ==");
  r = await call("GET", "/api/admin/community/privacy-requests", MEMBER);
  check("a member is not staff: 403", r.status === 403);
  r = await call("GET", "/api/admin/community/privacy-requests", STAFF);
  check("staff list the open cases newest activity first: kind, status, hints, message count, who wrote last, a suggested review date; never a code", r.status === 200 && r.body.cases.length === 1 && r.body.cases[0].caseId === C1 && r.body.cases[0].subjectHint === "Mia" && r.body.cases[0].messageCount === 20 && r.body.cases[0].lastFrom === "requester" && r.body.cases[0].suggestedReviewBy === iso(T - DAY + 14 * DAY) && !JSON.stringify(r.body).includes(K1), JSON.stringify(r.body).slice(0, 300));
  r = await call("GET", "/api/admin/community/privacy-requests/case?caseId=" + C1, STAFF);
  check("  and read the whole conversation", r.status === 200 && r.body.messages.length === 20 && r.body.messages[0].from === "requester" && r.body.retentionDays === 90);
  const OP1 = id22("O");
  T += 1; // the staff message is later than the requester's (same-second rows order by id)
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: OP1, status: "needs_verification", reply: "Which character did you verify with?" });
  check("one staff operation: the status moves, the reply is a staff message, audited with the case id, the status and 'replied', never the text", r.status === 200 && r.body.ok === true && r.body.replied === true && one("SELECT status FROM community_privacy_cases WHERE case_id = ?", C1).status === "needs_verification" && one("SELECT author FROM community_privacy_messages WHERE case_id = ? AND message_id = ?", C1, OP1).author === "staff" && one("SELECT actor, details FROM audit WHERE action = 'community.privacy_case_updated'").actor === STAFF && JSON.parse(one("SELECT details FROM audit WHERE action = 'community.privacy_case_updated'").details).replied === true && !one("SELECT 1 FROM audit WHERE details LIKE '%Which character%'"), JSON.stringify(r.body));
  r = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: K1 });
  check("  the requester sees the staff message as 'staff'", r.body.messages.at(-1).from === "staff" && r.body.messages.at(-1).text === "Which character did you verify with?" && r.body.status === "needs_verification");
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: OP1, status: "needs_verification", reply: "Which character did you verify with?" });
  check("  the same operation again is a replay: the original result, nothing reapplied", r.status === 200 && r.body.replay === true && one("SELECT COUNT(*) AS n FROM community_privacy_messages WHERE case_id = ? AND author = 'staff'", C1).n === 1 && one("SELECT COUNT(*) AS n FROM audit WHERE action = 'community.privacy_case_updated'").n === 1);
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: OP1, status: "declined" });
  check("  the same operation id with another payload is 409 operation_conflict", r.status === 409 && r.body.error === "operation_conflict");
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: M1, status: "in_review" });
  check("  an operation id equal to an existing message id is 409 operation_conflict", r.status === 409 && r.body.error === "operation_conflict");
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: id22("P"), status: "in_review" }, ON, { "X-Olympus": "1" });
  check("  a staff write from an old page is told to reload", r.status === 409 && r.body.error === "reload");
  db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF);
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: id22("P"), status: "in_review" });
  check("  a denied admin is refused inside the first statement: 403 denied, no operation, no audit row", r.status === 403 && r.body.error === "denied" && !one("SELECT 1 FROM community_privacy_operations WHERE op_id = ?", id22("P")) && one("SELECT COUNT(*) AS n FROM audit WHERE action = 'community.privacy_case_updated'").n === 1);
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(STAFF);
  T += DAY;
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF2, { caseId: C1, messageId: id22("P"), status: "completed", reply: "Done: everything linked to that account is deleted." });
  check("closing (completed) pins the deadline under the case's own retention from this activity and sets closed_at", r.status === 200 && one("SELECT closed_at, retain_until, status FROM community_privacy_cases WHERE case_id = ?", C1).closed_at === T && one("SELECT retain_until FROM community_privacy_cases WHERE case_id = ?", C1).retain_until === T + 90 * DAY && one("SELECT status FROM community_privacy_cases WHERE case_id = ?", C1).status === "completed");
  r = await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: id22("z"), text: "Thanks" });
  check("  the requester cannot write to a closed case: 409 case_closed", r.status === 409 && r.body.error === "case_closed");
  r = await call("GET", "/api/admin/community/privacy-requests?state=closed", STAFF);
  check("  it is listed under closed cases", r.body.cases.length === 1 && r.body.cases[0].status === "completed" && (await call("GET", "/api/admin/community/privacy-requests", STAFF)).body.cases.length === 0);
  T += DAY;
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: id22("R"), status: "declined" });
  check("  a later status change keeps closed_at and the pinned deadline", r.status === 200 && one("SELECT closed_at, retain_until FROM community_privacy_cases WHERE case_id = ?", C1).closed_at === T - DAY && one("SELECT retain_until FROM community_privacy_cases WHERE case_id = ?", C1).retain_until === T - DAY + 90 * DAY);

  console.log("\n== limits ==");
  let last = null;
  for (let i = 0; i < 21; i++) last = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: K1 }, { headers: { "CF-Connecting-IP": "198.51.100.7" } });
  check("the per-IP limiter answers the 21st request in a minute with 429 rate_limited and Retry-After", last.status === 429 && last.body.error === "rate_limited" && last.headers.get("Retry-After") === "60");
  let made = 0;
  const T0 = T;
  T = Math.floor(RealDate.now() / 1000); // .89: the rolling hour is cut by the DATABASE clock, so these twenty are created at the real clock (the earlier case is older than an hour by it)
  for (let i = 0; i < 20; i++) { const x = await pub("/api/privacy/requests", { caseId: id22(String.fromCharCode(66 + i)), caseCode: K1, kind: "other", details: `case ${i}` }); if (x.status === 201) made++; }
  r = await pub("/api/privacy/requests", { caseId: id22("v"), caseCode: K1, kind: "other", details: "the 21st this hour" });
  check("twenty new cases an hour are admitted inside the INSERT, the hour cut by the database clock; the 21st is 429 intake_busy with Retry-After 3600", made === 20 && r.status === 429 && r.body.error === "intake_busy" && r.headers.get("Retry-After") === "3600" && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 21, made, JSON.stringify(r.body));
  T = Math.floor(RealDate.now() / 1000) - 2 * DAY; // an actor clock two days behind the database's: a one-day retention is already past by the database clock, while the hour's cap is full too
  r = await pub("/api/privacy/requests", { caseId: id22("w"), caseCode: K1, kind: "other", details: "born expired" }, { over: { ...ON, PRIVACY_INTAKE_RETENTION_DAYS: "1" } });
  check("a case whose deadline has already passed by the database clock (the actor's clock behind, a one-day retention) is not born: 503 intake_unavailable, no row; the expiry is classified before the full hour (never 429)", r.status === 503 && r.body.error === "intake_unavailable" && !one("SELECT 1 FROM community_privacy_cases WHERE case_id = ?", id22("w")) && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 21, r.status, JSON.stringify(r.body));
  T = T0;

  console.log("\n== the effective cutoff and the purge ==");
  db.prepare("UPDATE community_privacy_cases SET retain_until = ? WHERE case_id = ?").run(EXPIRED, C1);
  r = await pub("/api/privacy/requests/read", { caseId: C1, caseCode: K1 });
  check("a case past its deadline by the database clock is gone for the requester: 404", r.status === 404);
  r = await pub("/api/privacy/requests/reply", { caseId: C1, caseCode: K1, messageId: M1, text: "I also used the name Mia Two." });
  check("  .89: the requester's EXACT replay of an earlier message is 404 too (the prior row is read with the live case, in one batch), never 200", r.status === 404, r.status, JSON.stringify(r.body));
  r = await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: id22("R"), status: "declined" });
  check("  .89: the staff's exact replay of an earlier operation is 404 too (the case is classified before the operation table), never replay:true", r.status === 404 && !("replay" in r.body), r.status, JSON.stringify(r.body));
  r = await call("GET", "/api/admin/community/privacy-requests?state=closed", STAFF);
  check("  and for staff: not listed, not readable, no operation", r.body.cases.every((c) => c.caseId !== C1) && (await call("GET", "/api/admin/community/privacy-requests/case?caseId=" + C1, STAFF)).status === 404 && (await call("POST", "/api/admin/community/privacy-requests/update", STAFF, { caseId: C1, messageId: id22("S"), status: "in_review" })).status === 404);
  r = await pub("/api/privacy/requests", { caseId: C1, caseCode: K1, kind: "deletion", details: "Please delete my data. I lost my Discord account.", subjectHint: "Mia", characterHint: "Mia One" });
  check("  its id is taken until the purge: the original submission retried is 429 intake_busy, never a replay of an expired case", r.status === 429 && r.body.error === "intake_busy");
  const swept = await intake.sweepCommunityPrivacy(env({ ...ON, COMMUNITY_FEATURES: "" }), EXPIRED + 1); // the cron's own time: at the real clock, not this process's fixed one
  check("the purge runs with the flag off: the expired case, its messages and operations are deleted, bounded", swept === 1 && !one("SELECT 1 FROM community_privacy_cases WHERE case_id = ?", C1) && !one("SELECT 1 FROM community_privacy_messages WHERE case_id = ?", C1) && !one("SELECT 1 FROM community_privacy_operations WHERE case_id = ?", C1) && one("SELECT COUNT(*) AS n FROM community_privacy_cases").n === 20, swept);
  check("(no hook left armed)", BEFORE === null && AFTER === null);

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
