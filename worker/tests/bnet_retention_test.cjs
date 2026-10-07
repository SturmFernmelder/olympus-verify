// Build .48 (30 Sep 2026): retention of Battle.net-derived data, through the REAL src/*.ts (transpiled by TypeScript
// itself) against the REAL schema in SQLite (node:sqlite). Discord's HTTP side is stubbed. Covers the purge (members,
// Phase 3 fields, bnet_characters, audit subjects, the exact 29-day edge, no invented timestamps, idempotence), that a
// ban keeps nothing derived from the tag (Codex review, 23:55 UTC), request-time filtering in /verify-status and the
// officer lookup when the cron is late, no tag in the ban card or the staff log even when fresh, the retired Phase 3
// path answering nothing, a fresh link clearing a stale namesake row instead of being blocked by it, no BattleTag in the
// linked-role record pushed to Discord, the health line counting every copy (conn-id-only, audit-only, far-future), a
// read-only command answered afresh past the deadline instead of from the replay ledger, the note about Discord's own
// copy, and the cron wiring.
// Run from the worker folder:  node tests/bnet_retention_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db) {
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
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => exec(sql, params),
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      db.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
function freshDb(schemaPath = path.join(root, "schema.sql")) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  // .116 fixture only: legacy enabled behavior uses the named synthetic policy profile below, these in-memory
  // settings and fake secrets. Real immutable OFF and owner-session/enable-intent guards remain separately tested.
  db.exec("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('bnetLogin', '1', 0, NULL)");
  return db;
}

const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let LOGS = [], ROLE_REMOVES = [], POSTS = [], PUSHES = [], ROLE_CONN_REPLY = "{}", ROLE_CONN_GET = null, ROLE_CONN_DELETE = 204; // GET answer: null = echo the PUT body
const realDiscord = (() => {
  const mod = { exports: {} };
  new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(mod, mod.exports, () => ({}));
  return mod.exports;
})();
// Discord's role-connection push (oauth.ts) and nothing else may leave the process.
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes("/role-connection")) {
    PUSHES.push({ method: init.method ?? "GET", body: String(init.body ?? "") });
    if (init.method === "DELETE") return new Response(ROLE_CONN_DELETE === 204 ? null : "{}", { status: ROLE_CONN_DELETE });
    if (init.method === "PUT") return new Response(ROLE_CONN_REPLY, { status: 200, headers: { "Content-Type": "application/json" } });
    // GET: what Discord now holds. By default the test echoes the last PUT body (a replace-semantics provider).
    const last = [...PUSHES].reverse().find((p) => p.method === "PUT");
    if (ROLE_CONN_GET instanceof Response) return ROLE_CONN_GET.clone();
    return new Response(ROLE_CONN_GET ?? last?.body ?? "{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error("no network in tests: " + url);
};
const stubs = {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async (_env, channel, payload) => { POSTS.push({ channel, payload }); return { id: "1" }; },
    staffNotice: async () => {},
    addRole: async () => {},
    removeRole: async (_env, id, role) => { ROLE_REMOVES.push({ id, role }); },
    guildMember: async () => ({ roles: [] }),
    setNickname: async () => {},
    rest: async () => { throw new Error("no REST in tests"); },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
};
// .116 test fixture only: each loader has its own module realm/cache. The ordinary loader reads
// immutable production OFF source; named synthetic profiles alter only constant initializers in
// transpiler input, never files, bnetLoginOn, its setting reads, or bnetReleasedOn's predicate.
const POLICY_FIXTURES = Object.freeze({
  enabled: { marker: true, profile: "ON", version: "matching", ownership: true, recovery: true },
  markerOff: { marker: false, profile: "ON", version: "matching", ownership: true, recovery: true },
  releaseOff: { marker: true, profile: "OFF", version: "matching", ownership: true, recovery: true },
  versionMismatch: { marker: true, profile: "ON", version: "mismatch", ownership: true, recovery: true },
  ownershipUnreviewed: { marker: true, profile: "ON", version: "matching", ownership: false, recovery: true },
  recoveryUnreviewed: { marker: true, profile: "ON", version: "matching", ownership: true, recovery: false },
});
function replaceFixtureLiteral(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("test policy fixture source drift: " + before);
  return source.replace(before, after);
}
function createLoader(fixtureName = null) {
  const fixture = fixtureName === null ? null : POLICY_FIXTURES[fixtureName];
  if (fixtureName !== null && !Object.hasOwn(POLICY_FIXTURES, fixtureName)) throw new Error("unknown test policy fixture");
  const cache = {};
  function load(name) {
    if (stubs[name]) return stubs[name];
    if (cache[name]) return cache[name].exports;
    let source = fs.readFileSync(path.join(root, "src", name.replace("./", "") + ".ts"), "utf8");
    if (fixture && name === "./policy-content") {
      source = replaceFixtureLiteral(source, "export const PRIVACY_DESCRIBES_BNET_LOGIN = false;", "export const PRIVACY_DESCRIBES_BNET_LOGIN = " + fixture.marker + ";");
    }
    if (fixture && name === "./policy-release") {
      source = replaceFixtureLiteral(source, 'profile: "OFF" as "OFF" | "ON",', 'profile: "' + fixture.profile + '" as "OFF" | "ON",');
      source = replaceFixtureLiteral(source, "onPolicyVersion: null as string | null,", fixture.version === "matching" ? "onPolicyVersion: POLICY_SOURCE_DIGEST as string | null," : 'onPolicyVersion: "test-only-stale-policy-version" as string | null,');
      source = replaceFixtureLiteral(source, "foreverOwnershipApiReviewed: false,", "foreverOwnershipApiReviewed: " + fixture.ownership + ",");
      source = replaceFixtureLiteral(source, "recoveryPlanReviewed: false,", "recoveryPlanReviewed: " + fixture.recovery + ",");
    }
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    cache[name] = mod;
    new Function("module", "exports", "require", js)(mod, mod.exports, (p) => load(p));
    return mod.exports;
  }
  return load;
}
const load = createLoader("enabled"); // Clearly synthetic ON profile, not a production release approval.
const retention = load("./bnet-retention"), oauth = load("./oauth"), lookup = load("./lookup"), interactions = load("./interactions"), indexMod = load("./index");

let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const DAY = 86400;
const OFFICER = "1549581672272625734", GUILD = "1549537348516188200";
let db = freshDb();
const env = () => ({ DB: d1(db), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: GUILD, DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", ROLE_OFFICER: OFFICER, ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", BNET_CLIENT_ID: "bnet-client-for-tests", BNET_CLIENT_SECRET: "bnet-secret-for-tests" });
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const member = (id, fields) => {
  const cols = Object.keys(fields);
  db.prepare(`INSERT INTO members (discord_id${cols.map((c) => ", " + c).join("")}) VALUES (?${cols.map((_, i) => ", ?").join("")})`).run(id, ...cols.map((c) => fields[c]));
};
const auditRow = (ts, actor, action, subject) => db.prepare("INSERT INTO audit (ts, actor, action, subject) VALUES (?, ?, ?, ?)").run(ts, actor, action, subject);
const admin = async (sub, opts, roles = [OFFICER]) => (await interactions.handleInteraction(env(), { type: 2, id: "1", token: "t", guild_id: GUILD, member: { user: { id: "999999999999999999", username: "officer" }, roles }, data: { name: "olympus-admin", options: [{ name: sub, type: 1, options: Object.entries(opts).map(([k, v]) => ({ name: k, type: 3, value: v })) }] } })).body?.data?.content ?? "";
const status = async (id) => (await interactions.handleInteraction(env(), { type: 2, id: "2", token: "t", guild_id: GUILD, member: { user: { id, username: "u" }, roles: [] }, data: { name: "verify-status" } })).body?.data?.content ?? "";

(async () => {
  console.log("\n== real immutable OFF source and finite synthetic admission controls ==");
  const ordinaryLoad = createLoader();
  const ordinaryPolicy = ordinaryLoad("./policy-content"), ordinaryRelease = ordinaryLoad("./policy-release");
  const ordinarySwitch = ordinaryLoad("./bnet-switch"), ordinaryOauth = ordinaryLoad("./oauth");
  const offDb = freshDb();
  try {
    const offEnv = { ...env(), DB: d1(offDb), SITE_ADMINS: "100000000000000090" };
    const untouched = () => JSON.stringify({
      members: offDb.prepare("SELECT * FROM members").all(),
      audit: offDb.prepare("SELECT * FROM audit").all(),
      settings: offDb.prepare("SELECT * FROM site_settings ORDER BY key").all(),
    });
    const before = untouched();
    check("ordinary source retains the inactive Battle.net policy marker", ordinaryPolicy.PRIVACY_DESCRIBES_BNET_LOGIN === false);
    check("ordinary same-version release remains frozen OFF and unreviewed", Object.isFrozen(ordinaryRelease.BNET_RELEASE) && ordinaryRelease.BNET_RELEASE.profile === "OFF" && ordinaryRelease.BNET_RELEASE.onPolicyVersion === null && ordinaryRelease.BNET_RELEASE.foreverOwnershipApiReviewed === false && ordinaryRelease.BNET_RELEASE.recoveryPlanReviewed === false && ordinaryRelease.bnetReleasedOn() === false);
    ordinarySwitch.setPolicyReadyForTests(true);
    const offState = await ordinarySwitch.bnetLoginState(offEnv);
    check("historical setter plus configured secrets and legacy adminOn cannot activate real OFF source", offState.configured === true && offState.adminOn === true && offState.policyReady === false && offState.effective === false && offState.releaseProfile === "OFF", offState);
    const refusedRoutes = [
      ["start", () => ordinaryOauth.startLinkedRole(offEnv), null],
      ["Discord callback", () => ordinaryOauth.linkedRoleCallback(offEnv, new Request("https://verify.example/oauth/callback?code=fake&state=fake", { headers: { Cookie: "olv_state=fake.fake" } })), "olv_state"],
      ["Blizzard callback", () => ordinaryOauth.bnetLinkCallback(offEnv, new Request("https://verify.example/bnet/link?code=fake&state=fake", { headers: { Cookie: "olv_bnet=fake" } })), "olv_bnet"],
      ["direct bind", () => ordinaryOauth.bindBattletag(offEnv, { id: "100000000000000091", username: "fixture-off" }, { Authorization: "Bearer fixture-only" }, "FixtureOff#91", "fixture-off", "test"), null],
    ];
    for (const [label, invoke, cookie] of refusedRoutes) {
      const response = await invoke(), body = await response.text(), cleared = response.headers.get("Set-Cookie");
      check("real OFF refuses " + label + " before provider effects", response.status === 200 && /switched off/.test(body) && !response.headers.has("Location") && (cookie ? cleared === cookie + "=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" : cleared === null) && response.headers.get("Cache-Control") === "no-store, no-transform");
    }
    check("real OFF route controls leave rows, audit, settings and fake provider calls unchanged", untouched() === before && PUSHES.length === 0 && POSTS.length === 0 && LOGS.length === 0 && ROLE_REMOVES.length === 0);
    const absentAdmission = await ordinarySwitch.setBnetSwitch(offEnv, "100000000000000090", true);
    check("future enable intent needs admitted staff-session facts", absentAdmission.ok === false && absentAdmission.error === "admission_refused" && untouched() === before);
    const expiredAdmission = await ordinarySwitch.setBnetSwitch(offEnv, "100000000000000090", true, { sessionVersion: 0, expiresAt: T - 1 });
    check("expired direct enable-intent admission stores neither intent nor audit", expiredAdmission.ok === false && expiredAdmission.error === "admission_refused" && untouched() === before);
    ordinarySwitch.setPolicyReadyForTests(null);
  } finally { offDb.close(); }
  const syntheticState = await load("./bnet-switch").bnetLoginState(env());
  check("retention fixture explicitly admits synthetic same-version ON with real setting and secrets", syntheticState.configured === true && syntheticState.adminOn === true && syntheticState.policyReady === true && syntheticState.effective === true && syntheticState.releaseProfile === "ON" && syntheticState.releasePolicyVersion === load("./policy-content").POLICY_SOURCE_DIGEST && load("./policy-release").bnetReleasedOn() === true, syntheticState);
  for (const fixtureName of ["markerOff", "releaseOff", "versionMismatch", "ownershipUnreviewed", "recoveryUnreviewed"]) {
    const negativeLoad = createLoader(fixtureName), negativeDb = freshDb();
    try {
      const negativeEnv = { ...env(), DB: d1(negativeDb) }, state = await negativeLoad("./bnet-switch").bnetLoginState(negativeEnv);
      check("synthetic policy guard refuses " + fixtureName, state.configured === true && state.adminOn === true && state.policyReady === false && state.effective === false, state);
      const response = await negativeLoad("./oauth").bindBattletag(negativeEnv, { id: "100000000000000092", username: "fixture-negative" }, { Authorization: "Bearer fixture-only" }, "FixtureNegative#92", "fixture-negative", "test");
      check("refused " + fixtureName + " binds no row and makes no fake provider call", response.status === 200 && /switched off/.test(await response.text()) && negativeDb.prepare("SELECT COUNT(*) AS n FROM members").get().n === 0 && negativeDb.prepare("SELECT COUNT(*) AS n FROM audit").get().n === 0 && PUSHES.length === 0);
    } finally { negativeDb.close(); }
  }
  for (const fault of ["missingClient", "missingSecret", "adminOff", "settingReadFails"]) {
    const guardedLoad = createLoader("enabled"), guardedDb = freshDb();
    try {
      let guardedEnv = { ...env(), DB: d1(guardedDb) };
      if (fault === "missingClient") guardedEnv = { ...guardedEnv, BNET_CLIENT_ID: "" };
      if (fault === "missingSecret") guardedEnv = { ...guardedEnv, BNET_CLIENT_SECRET: "" };
      if (fault === "adminOff") guardedDb.prepare("UPDATE site_settings SET value='0' WHERE key='bnetLogin'").run();
      if (fault === "settingReadFails") guardedEnv = { ...guardedEnv, DB: { prepare: () => ({ bind: () => ({ all: async () => { throw new Error("fixture settings unavailable"); } }) }) } };
      const state = await guardedLoad("./bnet-switch").bnetLoginState(guardedEnv);
      check("synthetic ON still needs actual secrets and readable enabled setting: " + fault, state.policyReady === true && state.effective === false && state.configured === !fault.startsWith("missing") && state.adminOn === fault.startsWith("missing"), state);
      const response = await guardedLoad("./oauth").bindBattletag(guardedEnv, { id: "100000000000000093", username: "fixture-guard" }, { Authorization: "Bearer fixture-only" }, "FixtureGuard#93", "fixture-guard", "test");
      check("refused " + fault + " binds no row and makes no fake provider call", response.status === 200 && /switched off/.test(await response.text()) && guardedDb.prepare("SELECT COUNT(*) AS n FROM members").get().n === 0 && guardedDb.prepare("SELECT COUNT(*) AS n FROM audit").get().n === 0 && PUSHES.length === 0);
    } finally { guardedDb.close(); }
  }


  console.log("\n== the rule ==");
  check("the TTL is 29 days, one day inside Blizzard's 30", retention.BNET_TTL_DAYS === 29 && retention.BNET_TTL_S === 29 * DAY && retention.BNET_BLIZZARD_LIMIT_S === 30 * DAY);
  check("a link refreshed 28 days ago is fresh", retention.bnetFresh(T - 28 * DAY));
  check("  exactly 29 days ago is stale (linked_at <= cutoff)", !retention.bnetFresh(T - 29 * DAY));
  check("  one second inside 29 days is fresh", retention.bnetFresh(T - 29 * DAY + 1));
  check("  no timestamp is stale: nothing invents a refresh", !retention.bnetFresh(null) && !retention.bnetFresh(undefined));
  check("  a timestamp far in the future is not fresh either", !retention.bnetFresh(T + 3600));

  console.log("\n== the purge ==");
  member("100000000000000001", { battletag: "Fresh#1", bnet_conn_id: "c1", linked_at: T - 1 * DAY });
  member("100000000000000002", { battletag: "Stale#2", bnet_conn_id: "c2", linked_at: T - 30 * DAY });
  member("100000000000000003", { battletag: "Edge#3", bnet_conn_id: "c3", linked_at: T - 29 * DAY });
  member("100000000000000004", { battletag: "Inside#4", bnet_conn_id: "c4", linked_at: T - 29 * DAY + 1 });
  member("100000000000000005", { battletag: "Legacy#5", bnet_conn_id: "c5", linked_at: null });
  member("100000000000000006", { battletag: "Banned#6", bnet_conn_id: "c6", linked_at: T - 40 * DAY, banned: 1, ban_reason: "test" });
  member("100000000000000007", { bnet_account_id: "acc7", bnet_linked_at: T - 31 * DAY });
  member("100000000000000008", { bnet_account_id: "acc8", bnet_linked_at: T - 2 * DAY });
  db.prepare("INSERT INTO bnet_characters (discord_id, character_id, name, fetched_at) VALUES ('100000000000000007', 'x1', 'Old Char', ?), ('100000000000000008', 'x2', 'New Char', ?)").run(T - 31 * DAY, T - 2 * DAY);
  auditRow(T - 40 * DAY, "100000000000000002", "link.ok", "Stale#2");
  auditRow(T - 40 * DAY, "100000000000000002", "link.battletag_taken", "Stale#2");
  auditRow(T - 40 * DAY, "cron", "bnet.linked", "Stale#2");
  auditRow(T - 1 * DAY, "100000000000000001", "link.ok", "Fresh#1");
  auditRow(T - 40 * DAY, "999999999999999999", "admin.ban", "100000000000000006");
  let r = await retention.purgeBattleNetData(env());
  check("the purge reports what it did", r.members === 4 && r.phase3 === 1 && r.characters === 1 && r.audit === 3, JSON.stringify(r));
  const m = (id) => one("SELECT battletag, bnet_conn_id, linked_at, bnet_account_id, bnet_linked_at, banned FROM members WHERE discord_id = ?", id);
  check("a link from yesterday is untouched", m("100000000000000001").battletag === "Fresh#1" && m("100000000000000001").linked_at === T - DAY);
  check("a 30-day-old link is cleared: tag, account id and timestamp", m("100000000000000002").battletag === null && m("100000000000000002").bnet_conn_id === null && m("100000000000000002").linked_at === null);
  check("  exactly 29 days old is cleared", m("100000000000000003").battletag === null);
  check("  one second inside is kept", m("100000000000000004").battletag === "Inside#4");
  check("  a tag with no timestamp is cleared, never given an invented one", m("100000000000000005").battletag === null && m("100000000000000005").linked_at === null);
  check("the banned member's tag is cleared too, and the ban stays", m("100000000000000006").battletag === null && m("100000000000000006").banned === 1);
  check("  and nothing derived from the tag is kept anywhere (no column, no audit detail with it)", !Object.keys(m("100000000000000006")).includes("bnet_hash") && !JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes("Banned#6"));
  check("a stale Phase 3 account id is cleared and a fresh one kept", m("100000000000000007").bnet_account_id === null && m("100000000000000008").bnet_account_id === "acc8");
  check("stale Phase 3 characters go, fresh ones stay", !one("SELECT 1 FROM bnet_characters WHERE character_id = 'x1'") && !!one("SELECT 1 FROM bnet_characters WHERE character_id = 'x2'"));
  check("old audit rows that named the tag now say [expired]", one("SELECT COUNT(*) AS n FROM audit WHERE subject = 'Stale#2'").n === 0 && one("SELECT COUNT(*) AS n FROM audit WHERE subject = '[expired]'").n === 3);
  check("  the fresh link's audit row and the ban's row are untouched", one("SELECT subject FROM audit WHERE action = 'link.ok' AND actor = '100000000000000001'").subject === "Fresh#1" && one("SELECT subject FROM audit WHERE action = 'admin.ban'").subject === "100000000000000006");
  check("the purge wrote one counts-only audit row", one("SELECT COUNT(*) AS n FROM audit WHERE action = 'bnet.retention'").n === 1 && !one("SELECT details FROM audit WHERE action = 'bnet.retention'").details.includes("#"));
  r = await retention.purgeBattleNetData(env());
  check("a second run changes nothing and writes nothing", r.members === 0 && r.phase3 === 0 && r.characters === 0 && r.audit === 0 && one("SELECT COUNT(*) AS n FROM audit WHERE action = 'bnet.retention'").n === 1);
  let h = await retention.bnetRetentionStatus(env());
  check("health: nothing overdue; the oldest record still stored is Inside#4, one second inside 29 days", h.overdue === 0 && h.oldestAgeDays === 28, JSON.stringify(h));

  console.log("\n== request-time filtering when the cron is late ==");
  member("100000000000000009", { battletag: "Late#9", bnet_conn_id: "c9", linked_at: T - 35 * DAY });
  h = await retention.bnetRetentionStatus(env());
  check("health counts the overdue row", h.overdue === 1 && h.oldestAgeDays === 35, JSON.stringify(h));
  let text = await status("100000000000000009");
  check("/verify-status shows no Battle.net line for a stale, unpurged link", !/Battle\.net: linked/.test(text), text.slice(0, 120));
  text = await status("100000000000000001");
  check("  and shows a fresh one with the day it goes", /Battle\.net: linked \(Fresh#1\)/.test(text) && text.includes(`<t:${T - DAY + 29 * DAY}:d>`), text.slice(0, 160));
  let info = await lookup.accountInfo(env(), "100000000000000009");
  check("the officer lookup shows no tag for a stale link", info.member && info.member.battletag === null && info.member.linkedAt === null);
  info = await lookup.accountInfo(env(), "100000000000000001");
  check("  and the tag for a fresh one", info.member && info.member.battletag === "Fresh#1");
  text = await admin("ban", { user: "100000000000000009", reason: "test" });
  check("the ban command and its card show no tag for a stale link either (Codex 23:55)", !text.includes("Late#9") && /Battle\.net: not linked/.test(text) && !JSON.stringify(POSTS).includes("Late#9"), text.slice(0, 160));
  text = await admin("unban", { user: "100000000000000009" });
  LOGS = []; POSTS = [];
  const banRes = await interactions.handleInteraction({ ...env(), CHANNEL_MOD_ALERTS: "555000000000000001" }, { type: 2, id: "4", token: "t", guild_id: GUILD, member: { user: { id: "999999999999999999", username: "officer" }, roles: [OFFICER] }, data: { name: "olympus-admin", options: [{ name: "ban", type: 1, options: [{ name: "user", type: 3, value: "100000000000000001" }, { name: "reason", type: 3, value: "test" }] }] } });
  text = banRes.body?.data?.content ?? "";
  const persistent = JSON.stringify(LOGS) + JSON.stringify(POSTS);
  check("a FRESH tag is not written into the staff log or the ban card either, only that a link exists and when it goes (Codex 00:05)", /Battle\.net: linked \(until <t:\d+:d>\)/.test(text) && !text.includes("Fresh#1") && LOGS.length === 1 && POSTS.length === 1 && persistent.includes("Battle.net: linked (until") && !persistent.includes("Fresh#1"), text.slice(0, 160), persistent.slice(0, 200));
  text = await admin("unban", { user: "100000000000000001" });
  check("the retired Phase 3 command is unknown", (await interactions.handleInteraction(env(), { type: 2, id: "5", token: "t", guild_id: GUILD, member: { user: { id: "100000000000000009", username: "u" }, roles: [] }, data: { name: "verify-bnet", options: [{ name: "character", type: 3, value: "Any" }] } })).body?.data?.content === "Unknown command.");
  const gone = await indexMod.default.fetch(new Request("https://verify.example/bnet/start?t=x"), env(), { waitUntil: () => {} });
  check("  and its routes are 404", gone.status === 404 && (await indexMod.default.fetch(new Request("https://verify.example/bnet/callback?code=x&state=y"), env(), { waitUntil: () => {} })).status === 404);
  text = await status("100000000000000001");
  check("/verify-status tells someone who linked how Discord's own copy of the tag goes away", /Discord's own record of this connection/.test(text) && /removing the connection/.test(text), text.slice(-200));
  text = await status("100000000000000002");
  check("  including someone whose tag is already purged (the audit keeps the fact of the link)", /Discord's own record/.test(text) && !/Battle\.net: linked/.test(text));
  text = await status("100000000000000099");
  check("  and not someone who never linked", !/Discord's own record/.test(text));

  console.log("\n== a fresh link clears a stale namesake instead of being blocked by it ==");
  // Late#9 is still stored (cron late). The same Battle.net account now links from a NEW Discord account.
  let res = await oauth.bindBattletag(env(), { id: "100000000000000010", username: "newbie" }, { Authorization: "Bearer x" }, "Late#9", "c9", "test");
  let html = await res.text();
  check("the link succeeds", res.status === 200 && html.includes("Linked"), res.status, html.slice(0, 80));
  check("  the stale row lost the tag and the new row has it", m("100000000000000009").battletag === null && m("100000000000000010").battletag === "Late#9" && m("100000000000000010").linked_at === T);
  res = await oauth.bindBattletag(env(), { id: "100000000000000011", username: "other" }, { Authorization: "Bearer x" }, "Fresh#1", "c1", "test");
  html = await res.text();
  check("a fresh tag held by someone else is still refused", html.includes("already linked") && m("100000000000000011") === undefined, html.slice(0, 80));

  console.log("\n== a ban binds the Discord account, never the tag ==");
  member("100000000000000013", { battletag: "Soon#13", bnet_conn_id: "c13", linked_at: T - 3 * DAY });
  text = await admin("ban", { user: "100000000000000013", reason: "test" });
  check("banning says what it binds and never mentions a fingerprint", /this Discord account cannot verify or link again/.test(text) && !/fingerprint/i.test(text), text.slice(0, 160));
  res = await oauth.bindBattletag(env(), { id: "100000000000000013", username: "banned" }, { Authorization: "Bearer x" }, "Soon#13", "c13", "test");
  check("the banned Discord account cannot link (its own row is banned)", (await res.text()).includes("cannot link"));
  T += 30 * DAY;
  r = await retention.purgeBattleNetData(env());
  check("thirty days on, the banned member's tag is purged like everyone's", m("100000000000000013").battletag === null && m("100000000000000013").banned === 1);
  PUSHES = [];
  res = await oauth.bindBattletag(env(), { id: "100000000000000014", username: "other" }, { Authorization: "Bearer x" }, "Soon#13", "c13", "test");
  check("the same Battle.net account may then link from another Discord account: nothing derived from the tag was kept to say otherwise", (await res.text()).includes("Linked") && m("100000000000000014").battletag === "Soon#13");
  check("the record Discord holds is deleted first (documented endpoint, same scope), then written afresh, then read back with GET (.51/.53)", PUSHES.map((p) => p.method).join(",") === "DELETE,PUT,GET", JSON.stringify(PUSHES.map((p) => p.method)));
  check("  the new record carries the flag, the word 'linked' where the tag used to be, and no BattleTag", PUSHES[1].body.includes('"battlenet_linked":1') && PUSHES[1].body.includes('"platform_username":"linked"') && !PUSHES[1].body.includes("Soon#13") && PUSHES[1].body.split("#").length === 1, PUSHES[1].body);
  check("  and the link is audited as ok with the clearing and the confirmed readback recorded, never the tag in details", one("SELECT details FROM audit WHERE action = 'link.ok' AND actor = '100000000000000014'").details.includes('"cleared":true') && one("SELECT details FROM audit WHERE action = 'link.ok' AND actor = '100000000000000014'").details.includes('"readback":"linked"'));
  ROLE_CONN_GET = JSON.stringify({ platform_name: "Battle.net", platform_username: "Old#1", metadata: { battlenet_linked: "1" } }); // a provider that merged
  LOGS = []; PUSHES = [];
  res = await oauth.bindBattletag(env(), { id: "100000000000000017", username: "seventeen" }, { Authorization: "Bearer x" }, "Tag#17", "c17", "test");
  html = await res.text();
  check("when Discord's answer still carries another name, the member is told to clear the connection and link again", res.status === 502 && /older name/.test(html) && /Connections/.test(html), res.status, html.slice(0, 120));
  check("  audited as metadata_failed with readback: other, and the other name is nowhere: not in the audit, not in the log", one("SELECT details FROM audit WHERE action = 'link.metadata_failed' AND actor = '100000000000000017'").details.includes('"readback":"other"') && !JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes("Old#1") && !JSON.stringify(LOGS).includes("Old#1"));
  check("  the BattleTag itself was saved (the link is real; only Discord's copy is wrong)", m("100000000000000017").battletag === "Tag#17");
  ROLE_CONN_GET = "{}"; // a GET that echoes no username at all
  res = await oauth.bindBattletag(env(), { id: "100000000000000018", username: "eighteen" }, { Authorization: "Bearer x" }, "Tag#18", "c18", "test");
  html = await res.text();
  check("a readback without a username string is 'absent': no 'Linked' without positive proof; a truthful failure with its remedy (.54, Codex 01:04)", res.status === 502 && /did not confirm the role record/.test(html) && /Connections/.test(html) && one("SELECT details FROM audit WHERE action = 'link.metadata_failed' AND actor = '100000000000000018'").details.includes('"readback":"absent"'));
  check("  the BattleTag itself is saved (the binding is real; Discord's record is unproven)", m("100000000000000018").battletag === "Tag#18");
  ROLE_CONN_GET = new Response("nope", { status: 500 });
  res = await oauth.bindBattletag(env(), { id: "100000000000000019", username: "nineteen" }, { Authorization: "Bearer x" }, "Tag#19", "c19", "test");
  check("  a failed GET is 'absent' too, and fails the same way", res.status === 502 && one("SELECT details FROM audit WHERE action = 'link.metadata_failed' AND actor = '100000000000000019'").details.includes('"readback":"absent"'));
  ROLE_CONN_GET = JSON.stringify({ platform_username: 42 });
  res = await oauth.bindBattletag(env(), { id: "100000000000000020", username: "twenty" }, { Authorization: "Bearer x" }, "Tag#20", "c20", "test");
  check("  a non-string username is 'absent', not 'other'", res.status === 502 && one("SELECT details FROM audit WHERE action = 'link.metadata_failed' AND actor = '100000000000000020'").details.includes('"readback":"absent"'));
  ROLE_CONN_GET = new Response("[1,2]", { status: 200, headers: { "Content-Type": "application/json" } });
  res = await oauth.bindBattletag(env(), { id: "100000000000000021", username: "twentyone" }, { Authorization: "Bearer x" }, "Tag#21", "c21", "test");
  check("  an array body is 'absent' too", res.status === 502 && one("SELECT details FROM audit WHERE action = 'link.metadata_failed' AND actor = '100000000000000021'").details.includes('"readback":"absent"'));
  ROLE_CONN_GET = null; ROLE_CONN_REPLY = "not json at all"; ROLE_CONN_DELETE = 403;
  res = await oauth.bindBattletag(env(), { id: "100000000000000022", username: "twentytwo" }, { Authorization: "Bearer x" }, "Tag#22", "c22", "test");
  html = await res.text();
  check("a refused DELETE and a malformed PUT body do not matter when the GET proves the record clean: Linked, with cleared: false recorded", res.status === 200 && /Linked/.test(html) && one("SELECT details FROM audit WHERE action = 'link.ok' AND actor = '100000000000000022'").details.includes('"cleared":false') && one("SELECT details FROM audit WHERE action = 'link.ok' AND actor = '100000000000000022'").details.includes('"readback":"linked"'));
  ROLE_CONN_GET = "{}";
  res = await oauth.bindBattletag(env(), { id: "100000000000000023", username: "twentythree" }, { Authorization: "Bearer x" }, "Tag#23", "c23", "test");
  check("  while a refused DELETE plus an unproven readback is a failure, never 'Linked'", res.status === 502 && one("SELECT details FROM audit WHERE action = 'link.metadata_failed' AND actor = '100000000000000023'").details.includes('"cleared":false'));
  ROLE_CONN_GET = null; ROLE_CONN_REPLY = "{}"; ROLE_CONN_DELETE = 204;

  console.log("\n== the health line counts every copy (Codex 00:05) ==");
  await retention.purgeBattleNetData(env());
  h = await retention.bnetRetentionStatus(env());
  check("clean to start", h.overdue === 0, JSON.stringify(h));
  auditRow(T - 40 * DAY, "100000000000000077", "link.ok", "Ghost#77");
  h = await retention.bnetRetentionStatus(env());
  check("an audit row still naming a tag past the cutoff counts as overdue, and sets the oldest age", h.overdue === 1 && h.oldestAgeDays === 40, JSON.stringify(h));
  r = await retention.purgeBattleNetData(env());
  check("  the purge scrubs it", r.audit === 1 && (await retention.bnetRetentionStatus(env())).overdue === 0);
  member("100000000000000078", { bnet_conn_id: "c78", linked_at: null });
  h = await retention.bnetRetentionStatus(env());
  check("a connection id with no tag and no timestamp counts as overdue", h.overdue === 1, JSON.stringify(h));
  r = await retention.purgeBattleNetData(env());
  check("  the purge clears it", r.members === 1 && m("100000000000000078").bnet_conn_id === null);
  member("100000000000000079", { bnet_account_id: "acc79", bnet_linked_at: null });
  h = await retention.bnetRetentionStatus(env());
  check("an account id with no timestamp counts as overdue", h.overdue === 1, JSON.stringify(h));
  r = await retention.purgeBattleNetData(env());
  check("  the purge clears it", r.phase3 === 1 && m("100000000000000079").bnet_account_id === null);
  member("100000000000000080", { battletag: "Future#80", bnet_conn_id: "c80", linked_at: T + 365 * DAY });
  h = await retention.bnetRetentionStatus(env());
  check("a far-future timestamp counts as overdue and never as a negative age", h.overdue === 1 && (h.oldestAgeDays === null || h.oldestAgeDays >= 0), JSON.stringify(h));
  check("  readers do not show it", !/Battle\.net: linked/.test(await status("100000000000000080")));
  r = await retention.purgeBattleNetData(env());
  check("  the purge clears it instead of keeping it for a year", r.members === 1 && m("100000000000000080").battletag === null && m("100000000000000080").linked_at === null);
  member("100000000000000081", { battletag: "Soon#81", bnet_conn_id: "c81", linked_at: T + 200 });
  check("  while a timestamp a few minutes ahead (clock skew) is left alone", (await retention.purgeBattleNetData(env())).members === 0 && m("100000000000000081").battletag === "Soon#81");
  const skewDb = freshDb();
  skewDb.prepare("INSERT INTO members (discord_id, battletag, bnet_conn_id, linked_at) VALUES ('100000000000000082', 'Skew#82', 'c82', ?)").run(T + 200);
  const skewStatus = await retention.bnetRetentionStatus({ ...env(), DB: d1(skewDb) });
  check("  and alone in a database it reports age 0, never -1 (Codex 00:38)", skewStatus.overdue === 0 && skewStatus.oldestAgeDays === 0, JSON.stringify(skewStatus));

  console.log("\n== a read-only command is answered afresh, never from the replay ledger (Codex 00:05) ==");
  member("100000000000000016", { battletag: "Edge#16", bnet_conn_id: "c16", linked_at: T - 29 * DAY + 2 });
  const waits2 = [];
  const ictx = { waitUntil: (p) => waits2.push(Promise.resolve(p).catch(() => {})) };
  const statusPost = () => indexMod.default.fetch(new Request("https://verify.example/interactions", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature-Ed25519": "00", "X-Signature-Timestamp": String(T) }, body: JSON.stringify({ type: 2, id: "900000000000000031", application_id: "1550176895671341076", token: "t", guild_id: GUILD, member: { user: { id: "100000000000000016", username: "edge" }, roles: [] }, data: { name: "verify-status" } }) }), env(), ictx);
  let sres = await statusPost();
  while (waits2.length) await waits2.shift();
  let stext = JSON.stringify(sres.body ?? (await sres.json()));
  check("two seconds inside the window the status shows the tag", sres.status === 200 && stext.includes("Edge#16"), sres.status, stext.slice(0, 120));
  check("  and the id was not ledgered", !one("SELECT 1 AS hit FROM seen_interactions WHERE id = '900000000000000031'"));
  T += 3;
  sres = await statusPost();
  while (waits2.length) await waits2.shift();
  stext = JSON.stringify(sres.body ?? (await sres.json()));
  check("the same id three seconds later, past the deadline, is answered afresh without the tag", sres.status === 200 && !stext.includes("Edge#16") && !/Battle\.net: linked/.test(stext), stext.slice(0, 160));

  console.log("\n== the retired path's rows are counted, never assumed away (.51, Codex 00:30) ==");
  let legacy = await retention.legacyApiCounts(env());
  // the purge section inserted a bnet.linked audit row on purpose (still counted after its subject was scrubbed: the
  // action is the evidence); its Phase 3 account and character rows have since expired and been purged above
  check("the count is zero for every kind the retired path could write, except the audit row this fixture inserted on purpose", legacy.characters === 0 && legacy.pending === 0 && legacy.snapshots === 0 && legacy.audit === 1 && legacy.bnetCharacters === 0 && legacy.accountIds === 0, JSON.stringify(legacy));
  member("100000000000000050", { discord_name: "apiuser" }); // characters.discord_id references members
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, source) VALUES ('apichar', 'Apichar', '100000000000000050', 'verified', ?, ?, 'api')").run(T, T);
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, consumed_at, consumed_source) VALUES ('100000000000000050', 'apichar', 'Apichar', ?, ?, ?, 'api')").run(T, T, T);
  db.prepare("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash) VALUES (?, ?, 'api', 1, 'h')").run(T, T);
  auditRow(T, "100000000000000050", "verify.api_confirmed", "Apichar");
  legacy = await retention.legacyApiCounts(env());
  check("one inherited row of each kind is counted", legacy.characters === 1 && legacy.pending === 1 && legacy.snapshots === 1 && legacy.audit === 2, JSON.stringify(legacy));
  check("  and the .48 fingerprint column is reported absent here", legacy.fingerprintColumn === 0);
  const hashDb = freshDb();
  hashDb.exec("ALTER TABLE members ADD COLUMN bnet_hash TEXT");
  check("  but present on a database that .48 would have left behind", (await retention.legacyApiCounts({ ...env(), DB: d1(hashDb) })).fingerprintColumn === 1);
  const realDb = d1(db);
  const flakyDb = { ...realDb, prepare: (sql) => (sql.includes("bnet_hash") ? { all: async () => { throw new Error("D1_ERROR: operational failure: SQLITE_BUSY"); } } : realDb.prepare(sql)) };
  let threw = null;
  try { await retention.legacyApiCounts({ ...env(), DB: flakyDb }); } catch (e) { threw = e; }
  check("a D1 failure on the column probe is an error, never read as 'column absent' (.54, Codex 01:04)", threw !== null && /SQLITE_BUSY/.test(String(threw)));
  const flakyHealth = await (await indexMod.default.fetch(new Request("https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } }), { ...env(), DB: flakyDb }, { waitUntil: () => {} })).json();
  check("  and the watcher's /health then shows an error for legacyApi, which no zero gate can pass", typeof flakyHealth.legacyApi === "string" && /^error: /.test(flakyHealth.legacyApi));
  const hres = await indexMod.default.fetch(new Request("https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } }), env(), { waitUntil: () => {} });
  const hj = await hres.json();
  check("  and the watcher's /health carries the counts (the public answer does not)", hj.legacyApi && hj.legacyApi.characters === 1 && !Object.keys(await (await indexMod.default.fetch(new Request("https://verify.example/health"), env(), { waitUntil: () => {} })).json()).includes("legacyApi"), JSON.stringify(hj.legacyApi));
  db.prepare("DELETE FROM characters WHERE name_key = 'apichar'").run();
  db.prepare("DELETE FROM pending WHERE name_key = 'apichar'").run();
  db.prepare("DELETE FROM roster_snapshots WHERE source = 'api'").run();
  db.prepare("DELETE FROM audit WHERE action = 'verify.api_confirmed'").run();
  db.prepare("DELETE FROM members WHERE discord_id = '100000000000000050'").run();

  console.log("\n== the cron and health lines ==");
  member("100000000000000015", { battletag: "Cron#15", bnet_conn_id: "c15", linked_at: T - 60 * DAY });
  const waits = [];
  await indexMod.default.scheduled({ cron: "*/30 * * * *" }, env(), { waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})) });
  while (waits.length) await waits.shift();
  check("the cron purges", m("100000000000000015").battletag === null);
  const healthRes = await indexMod.default.fetch(new Request("https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } }), env(), { waitUntil: () => {} });
  const health = await healthRes.json();
  check("/health carries the retention line: nothing overdue, build .120", health.build.includes(".120") && health.bnetRetention && health.bnetRetention.overdue === 0, JSON.stringify(health.bnetRetention));

  console.log("\n== the schema check adds the column on an older database ==");
  const old = new DatabaseSync(":memory:");
  old.exec(fs.readFileSync(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"), "utf8"));
  const schema = load("./schema");
  schema.forgetSchemaCheck();
  await schema.ensureSchema({ DB: d1(old) });
  check("ensureSchema leaves members without any BattleTag-derived column", !old.prepare("PRAGMA table_info(members)").all().some((c) => c.name === "bnet_hash"));

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
