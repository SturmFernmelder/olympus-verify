// Build .56 (1 Oct 2026): the community adapter contract (consolidation batch 1), through the REAL src/*.ts (transpiled
// by TypeScript itself) against the REAL schema in SQLite (node:sqlite). Discord's HTTP side is stubbed. Covers the
// context for a stranger, an applicant, a roster-confirmed member, a banned one, a denied one, someone who left the
// server and a SITE_ADMIN; the feature list parser and its two dependencies; the write fence admitting a first write
// and refusing after sign-out, denial, leaving the server, losing the roster, a ban and an expired cookie (before any
// SQL), with the refusal naming the reason and a lost race answered as conflict; a later statement bound to the first
// one's nonce; the erase registry running inside deleteSiteData; the export; and the time helpers.
// Run from the worker folder:  node tests/community_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, hooks = {}) {
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
      db.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
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
const context = load("./community-context"), refs = load("./community-refs"), time = load("./community-time"), names = load("./community-names");
const siteCore = load("./site-core"), siteAdmin = load("./site-admin"), indexMod = load("./index");

let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let db = freshDb();
let statements = 0;
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; } }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), in_server: 1, denied: 0, session_version: 1, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, row.username, T, T, row.in_server, row.denied, row.session_version);
};
const confirm = (id, name) => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?, ?, ?, 'member', ?)").run(name.toLowerCase(), name, id, T);
};
const cookieFor = async (id, version = 1) => (await siteCore.sessionCookie(env(), id, version)).split(";")[0];
const req = (url, cookie, init = {}) => new Request(url, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } });
const APPLICANT = "300000000000000001", MEMBER = "300000000000000002", BANNED = "300000000000000003", DENIED = "300000000000000004", LEFT = "300000000000000005", STAFF = "472099715253796864";

// .133: construct an original signed staff Request before the real site-only eraser consumes it.
// Both clocks make this explicit test session valid when the suite freezes or advances its business clock.
async function erasureRequest(target, actor) {
  const site = load("./site-core");
  const version = db.prepare("SELECT session_version FROM site_users WHERE discord_id = ?").get(actor)?.session_version ?? 1;
  const expiry = Math.max(Math.floor(Date.now() / 1000), db.prepare("SELECT CAST(strftime('%s', 'now') AS INTEGER) AS clock").get().clock) + 3600;
  const body = site.b64u(new TextEncoder().encode(JSON.stringify({ u: actor, v: version, e: expiry })));
  const mac = await site.sign(env().COOKIE_SECRET, "session", body);
  return new Request("https://guild.example/api/admin/users/" + target + "/delete", {
    method: "POST", headers: { Cookie: "__Host-olg=" + body + "." + mac, Origin: "https://guild.example", "X-Olympus": "2" },
  });
}

(async () => {
  console.log("\n== the context: who may do what, from keeper facts only ==");
  siteUser(APPLICANT); siteUser(MEMBER); confirm(MEMBER, "Fern Melder"); siteUser(BANNED); confirm(BANNED, "Bad Actor"); db.prepare("UPDATE members SET banned = 1 WHERE discord_id = ?").run(BANNED);
  siteUser(DENIED, { denied: 1 }); siteUser(LEFT, { in_server: 0 }); siteUser(STAFF);
  let res = await indexMod.default.fetch(req("https://guild.example/api/community/context"), env(), ctx);
  check("a stranger gets 401 signed_out from the site's own gate", res.status === 401 && (await res.json()).error === "signed_out");
  const dto = async (id, over) => (await (await indexMod.default.fetch(req("https://guild.example/api/community/context", await cookieFor(id)), env(over), ctx)).json());
  let d = await dto(APPLICANT);
  check("an applicant: identity and applicantWrite, no guild data, not staff", d.capabilities.authenticatedIdentity && d.capabilities.applicantWrite && !d.capabilities.confirmedGuildData && !d.capabilities.communityStaff && d.subject.discordId === APPLICANT, JSON.stringify(d));
  d = await dto(MEMBER);
  check("a roster-confirmed member: confirmedGuildData from characters.status = 'member'", d.capabilities.confirmedGuildData && !d.capabilities.communityStaff);
  d = await dto(BANNED);
  check("a banned account with a confirmed character: no guild data", d.capabilities.applicantWrite && !d.capabilities.confirmedGuildData);
  d = await dto(DENIED);
  check("a denied account: identity only", d.capabilities.authenticatedIdentity && !d.capabilities.applicantWrite && !d.capabilities.confirmedGuildData);
  d = await dto(LEFT);
  check("someone who left the server: identity only", d.capabilities.authenticatedIdentity && !d.capabilities.applicantWrite);
  d = await dto(STAFF);
  check("a SITE_ADMIN: communityStaff (distinct from the bot's officer roles), no guild data without a character", d.capabilities.communityStaff && !d.capabilities.confirmedGuildData);
  d = await dto(STAFF, { SITE_ADMINS: "" });
  check("  and not staff when not listed", !d.capabilities.communityStaff);
  check("the DTO carries the member's own id, the capabilities, every feature flag and the clock, nothing else", Object.keys(d).sort().join(",") === "capabilities,features,now,subject" && Object.keys(d.features).length === context.COMMUNITY_FEATURES.length);
  check("organizer (.59): a confirmed member listed in COMMUNITY_ORGANIZERS, or a confirmed SITE_ADMIN; never an applicant", (await dto(MEMBER, { COMMUNITY_ORGANIZERS: MEMBER })).capabilities.organizer === true && (await dto(MEMBER)).capabilities.organizer === false && (await dto(APPLICANT, { COMMUNITY_ORGANIZERS: APPLICANT })).capabilities.organizer === false && (await dto(STAFF)).capabilities.organizer === false);
  const cycled = await dto(APPLICANT);
  const cookieV1 = await cookieFor(APPLICANT, 1);
  db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(APPLICANT);
  res = await indexMod.default.fetch(req("https://guild.example/api/community/context", cookieV1), env(), ctx);
  check("a cookie from before a sign-out is a stranger again (session_version)", res.status === 401 && cycled.subject.discordId === APPLICANT);
  db.prepare("UPDATE site_users SET session_version = 1 WHERE discord_id = ?").run(APPLICANT);

  console.log("\n== the feature list ==");
  const feats = (v) => [...context.communityFeatures({ COMMUNITY_FEATURES: v })].sort().join(",");
  check("names are parsed, trimmed, case-folded; unknown names dropped", feats(" Directory , events,bogus ") === "directory,events");
  check("crafting needs directory; attendance needs events", feats("crafting") === "" && feats("attendance") === "" && feats("directory,crafting,events,attendance") === "attendance,crafting,directory,events");
  check("empty means none", feats("") === "" && feats(undefined) === "");
  check("the DTO shows them", (await dto(APPLICANT, { COMMUNITY_FEATURES: "directory" })).features.directory === true && (await dto(APPLICANT)).features.directory === false);

  console.log("\n== the write fence ==");
  const realNow = () => Math.floor(RealDate.now() / 1000);
  const fenced = (id, version, cap, ref, expires = realNow() + 3600) => [
    // a first statement admitted by the fence: here the member's ref row, with the fence's three binds at ?1, ?2 and ?5
    env().DB.prepare(`INSERT INTO community_refs (discord_id, ref, created_at) SELECT ?1, ?3, ?4 WHERE ${context.fenceSql(cap, 1, 2, 5)} ON CONFLICT(discord_id) DO NOTHING`).bind(id, version, ref, T, expires),
  ];
  const contextFor = async (id, version = 1) => context.communityContext(env(), req("https://guild.example/x", await cookieFor(id, version)));
  let c = await contextFor(APPLICANT);
  let out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "A".repeat(22)));
  check("an applicant's first write is admitted and lands", out !== context.FENCE_REFUSED && one("SELECT ref FROM community_refs WHERE discord_id = ?", APPLICANT).ref === "A".repeat(22));
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "confirmedGuildData", "B".repeat(22)));
  check("the same applicant is refused a guild-data write (no roster-confirmed character)", out === context.FENCE_REFUSED);
  res = await context.refusal(env(), req("https://guild.example/x", await cookieFor(APPLICANT)), "confirmedGuildData");
  check("  and the refusal says guild_unconfirmed (403)", res.status === 403 && (await res.json()).error === "guild_unconfirmed");
  c = await contextFor(MEMBER);
  out = await context.admitted(env(), c, fenced(MEMBER, 1, "confirmedGuildData", "C".repeat(22)));
  check("a confirmed member's guild-data write is admitted", out !== context.FENCE_REFUSED && one("SELECT ref FROM community_refs WHERE discord_id = ?", MEMBER).ref === "C".repeat(22));
  db.prepare("DELETE FROM community_refs").run();
  // the facts change between the context read and the write: each one refuses inside the statement
  const after = async (id, mutate, cap, label) => {
    const cx = await contextFor(id);
    mutate();
    const r = await context.admitted(env(), cx, fenced(id, 1, cap, "D".repeat(22)));
    const why = await context.refusal(env(), req("https://guild.example/x", await cookieFor(id)), cap);
    const body = await why.json();
    check(label, r === context.FENCE_REFUSED && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", id), r === context.FENCE_REFUSED, JSON.stringify(body));
    return body;
  };
  let b = await after(APPLICANT, () => db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(APPLICANT), "applicantWrite", "signed out between the read and the write: refused in the statement");
  check("  answered signed_out", b.error === "signed_out");
  db.prepare("UPDATE site_users SET session_version = 1 WHERE discord_id = ?").run(APPLICANT);
  b = await after(APPLICANT, () => db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(APPLICANT), "applicantWrite", "denied between the read and the write: refused");
  check("  answered denied", b.error === "denied");
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(APPLICANT);
  b = await after(APPLICANT, () => db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(APPLICANT), "applicantWrite", "left the server between the read and the write: refused");
  check("  answered not_member", b.error === "not_member");
  db.prepare("UPDATE site_users SET in_server = 1 WHERE discord_id = ?").run(APPLICANT);
  b = await after(MEMBER, () => db.prepare("UPDATE characters SET status = 'left' WHERE discord_id = ?").run(MEMBER), "confirmedGuildData", "the character left the roster between the read and the write: refused");
  check("  answered guild_unconfirmed", b.error === "guild_unconfirmed");
  db.prepare("UPDATE characters SET status = 'member' WHERE discord_id = ?").run(MEMBER);
  b = await after(MEMBER, () => db.prepare("UPDATE members SET banned = 1 WHERE discord_id = ?").run(MEMBER), "confirmedGuildData", "banned between the read and the write: refused");
  check("  answered guild_unconfirmed too (a ban is not announced as such to the member)", b.error === "guild_unconfirmed");
  db.prepare("UPDATE members SET banned = 0 WHERE discord_id = ?").run(MEMBER);
  c = await contextFor(APPLICANT);
  const before = statements;
  T += 8 * 86400; // the cookie's seven days are over
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "E".repeat(22)));
  check("an expired session is refused before any SQL runs", out === context.FENCE_REFUSED && statements === before);
  T -= 8 * 86400;
  // Codex's .56 review (01:50): the code check happened before the batch; a session expiring between that check and the
  // first SQL still committed. The fence now carries the cookie expiry and compares it with the database's own clock
  // inside the statement. The test's JavaScript clock is frozen in September, so the precheck passes; the real clock
  // in SQLite is what refuses.
  c = await contextFor(APPLICANT);
  c = { ...c, subject: { ...c.subject, expiresAt: realNow() - 5 } }; // "valid" to the frozen precheck, expired to the database
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "X".repeat(22), realNow() - 5));
  check("a session that expired by the time the first SQL runs is refused INSIDE the statement, by the database clock (Codex 01:50)", out === context.FENCE_REFUSED && !one("SELECT 1 FROM community_refs WHERE ref = ?", "X".repeat(22)));
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "Y".repeat(22), realNow() + 60));
  check("  and one still valid at that instant is admitted", out !== context.FENCE_REFUSED && !!one("SELECT 1 FROM community_refs WHERE ref = ?", "Y".repeat(22)));
  db.prepare("DELETE FROM community_refs WHERE discord_id = ?").run(APPLICANT);
  check("  the fence SQL names the database clock, not a bound time", /strftime\('%s', 'now'\)/.test(context.fenceSql("applicantWrite", 1, 2, 3)) && context.DB_NOW.includes("strftime"));
  c = await contextFor(APPLICANT);
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "F".repeat(22)));
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "G".repeat(22)));
  check("a write whose first statement changes nothing although the facts hold (the ON CONFLICT no-op here, a lost compare-and-set in a feature) is refused", out === context.FENCE_REFUSED);
  res = await context.refusal(env(), req("https://guild.example/x", await cookieFor(APPLICANT)), "applicantWrite");
  check("  and answered as conflict (409), since nothing about the member explains it", res.status === 409 && (await res.json()).error === "conflict");
  check("an empty batch is refused", (await context.admitted(env(), c, [])) === context.FENCE_REFUSED);
  check("randomToken is 22 base64url characters and not repeated", /^[A-Za-z0-9_-]{22}$/.test(context.randomToken()) && context.randomToken() !== context.randomToken());

  console.log("\n== erasure and export through the registry ==");
  check("refs registered itself", context.communityDataNames().includes("refs"));
  const exported = await context.communityExport(env(), APPLICANT);
  check("the export carries the member's ref", exported.refs && exported.refs.ref === "F".repeat(22));
  const deleted = await siteAdmin.deleteSiteData(env(), APPLICANT, STAFF, false, await erasureRequest(APPLICANT, STAFF));
  check("deleteSiteData removes the community rows in its own batch", deleted === true && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", APPLICANT) && !one("SELECT 1 FROM site_users WHERE discord_id = ?", APPLICANT));
  db.prepare("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?) ON CONFLICT(discord_id) DO NOTHING").run(MEMBER, "M".repeat(22), T);
  await siteAdmin.deleteSiteData(env(), DENIED, STAFF, false, await erasureRequest(DENIED, STAFF));
  check("  and leaves other members' rows (another account's deletion does not touch this ref)", !!one("SELECT 1 FROM community_refs WHERE discord_id = ?", MEMBER));
  check("refOf answers null afterwards", (await refs.refOf(env(), APPLICANT)) === null);

  console.log("\n== time at the boundary ==");
  check("seconds to milliseconds is exact", time.secondsToMs(1790500000) === 1790500000000);
  check("milliseconds to seconds refuses a subsecond value without a policy", (() => { try { time.msToSeconds(1790500000500); return false; } catch (e) { return e instanceof RangeError; } })());
  check("  floor and ceil are explicit", time.msToSeconds(1790500000500, "floor") === 1790500000 && time.msToSeconds(1790500000500, "ceil") === 1790500001);
  check("  an unknown rounding option is refused before the value is read (Codex's helper-seam note)", (() => { try { time.msToSeconds(1790500000000, "round"); return false; } catch (e) { return e instanceof RangeError && /unsupported_rounding/.test(e.message); } })());
  check("  negatives, non-integers and absurd values are refused", ["-1", "1.5", "big"].every((k) => { try { time.msToSeconds(k === "-1" ? -1 : k === "1.5" ? 1.5 : time.MAX_DATE_MS + 1000); return false; } catch (e) { return e instanceof RangeError; } }));
  check("ISO round trip", time.secondsToIso(1790500000) === "2026-09-27T09:06:40.000Z" && time.isoToSeconds("2026-09-27T09:06:40Z") === 1790500000);
  check("  a subsecond ISO needs a policy", (() => { try { time.isoToSeconds("2026-09-27T09:06:40.250Z"); return false; } catch (e) { return e instanceof RangeError; } })() && time.isoToSeconds("2026-09-27T09:06:40.250Z", "floor") === 1790500000);
  const proj = time.projectSeconds({ created_at: 1790500000, updated_at: null, name: "x" }, ["created_at", "updated_at", "missing"]);
  check("projection converts only the named own fields; null stays null; missing stays missing", proj.created_at === "2026-09-27T09:06:40.000Z" && proj.updated_at === null && !("missing" in proj) && !("name" in proj));

  console.log("\n== character identity: two keys, and a binding that is proven, unproven or a conflict (Codex 01:19) ==");
  const a = names.validateName("Anne-Marie Smith"), bN = names.validateName("Anne-Beth Smith");
  check("two distinct hyphenated full names share the keeper's proof key but never the community key", a.ok && bN.ok && a.proofKey === "anne" && bN.proofKey === "anne" && a.key === "anne-marie smith" && bN.key === "anne-beth smith" && a.key !== bN.key);
  check("the community key keeps non-ASCII capitals, collapses spaces and applies NFC", names.communityKey("  Ðismas   Ðanero ") === "Ðismas Ðanero".replace("Ð", "Ð") && names.communityKey("Fern   Melder") === "fern melder" && names.communityKey("Ame\u0301lie") === names.communityKey("Am\u00e9lie"));
  check("validation: shape, length, type", !names.validateName("x").ok && !names.validateName("Anne--Marie").ok && !names.validateName("-Anne").ok && !names.validateName(42).ok && !names.validateName("A".repeat(41)).ok && names.validateName("O'Neil Smith").ok);
  // the keeper holds one proof row under the truncated key: "Anne-Marie Smith" bound to MEMBER
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES ('anne', 'Anne-Marie Smith', ?, 'member', ?, 'Player-1-AAAA')").run(MEMBER, T);
  let r = await names.resolveCharacter(env(), MEMBER, "Anne-Marie Smith");
  check("the owner's claim of the stored full name is proven, with the GUID", r.state === "proven" && r.guid === "Player-1-AAAA" && r.proofKey === "anne");
  r = await names.resolveCharacter(env(), MEMBER, "Anne-Beth Smith");
  check("the same owner's claim of the OTHER full name sharing the proof key is a conflict (name_mismatch), not proven and not silently merged", r.state === "conflict" && r.reason === "name_mismatch");
  r = await names.resolveCharacter(env(), APPLICANT, "Anne-Marie Smith");
  check("another account's claim of a bound name is a conflict (other_account)", r.state === "conflict" && r.reason === "other_account");
  r = await names.resolveCharacter(env(), MEMBER, "Nobody Here");
  check("a name the keeper has never seen is unproven: a label, never proof", r.state === "unproven" && r.proofKey === "nobody here");
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(APPLICANT);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES ('twin', 'Twin Name', ?, 'member', ?, 'Player-1-AAAA')").run(APPLICANT, T);
  r = await names.resolveCharacter(env(), MEMBER, "Anne-Marie Smith");
  check("a GUID that another account's row also carries makes even the owner's claim a conflict (guid_other_account)", r.state === "conflict" && r.reason === "guid_other_account");
  check("the keeper's proof key itself is unchanged (codes.ts still cuts at the first hyphen; existing bindings keep their bytes)", load("./codes").normalizeCharacter("Anne-Marie Smith") === "anne");

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
