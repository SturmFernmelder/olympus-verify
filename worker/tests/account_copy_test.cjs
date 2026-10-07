// Build .71 (1 Oct 2026): the member's own copy (GET /api/me/export) and the erasure/export integration check across every
// feature (consolidation batch 7), through the REAL src/*.ts against the REAL schema in SQLite; Discord's HTTP side is
// stubbed. A member with data in every site and community feature downloads their copy: every section present, nothing
// about anyone else in it (no other Discord id, no staff), the attachment headers, the rate limit, the audit row; a denied
// member still gets theirs. Then the member is erased through the real deleteSiteData and EVERY table and column of the
// schema is scanned for their id: only the documented residue may remain (the bot's own verification rows and the dated
// log, and an active restriction case with its rows and period; .74: the copy is one admitted batch); the same scan for an erased staff member finds them only
// where the design says (the log). Run from the worker folder:  node tests/account_copy_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, hooks = {}) {
  let batches = 0; // .74: numbered per request, for the beforeBatch/afterBatch hooks
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
      hooks.beforeBatch?.(++batches); // .74: a test may change the facts between the context read and this payload batch
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
let BEFORE = null, AFTER = null; // .74: armed by a test, each fires once
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", ORG = "300000000000000002", OTHER = "300000000000000004", STAFF = "472099715253796864", STAFF2 = "472099715253796865";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const confirm = (id, name, guid = null) => {
  db.prepare("INSERT INTO members (discord_id, linked_at) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING").run(id, T - 86400);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES (?, ?, ?, 'member', ?, ?)").run(name.toLowerCase().split("-")[0], name, id, T, guid);
};
const ON = { COMMUNITY_FEATURES: "directory,crafting,events,attendance,trials,restrictions,departures,contributions", CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "400", COMMUNITY_ORGANIZERS: ORG, SITE_ADMINS: `${STAFF},${STAFF2}` };
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
// .118: real same-path form requests; continuation never travels in a query string.
const accountForm = async (session, over = ON) => {
  const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account", { headers: { Cookie: session } }), env(over), ctx);
  const text = await res.text(), form = (text.match(/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/) || [])[1] || "";
  return { nonce: (res.headers.get("Set-Cookie") || "").split(";")[0], csrf: (form.match(/name="csrf" value="([^"]+)"/) || [])[1] || "" };
};
const postCopy = async (session, actions = "", mode = "download", controls, over = ON) => {
  const f = controls || await accountForm(session, over);
  const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account/export", { method: "POST", headers: { Cookie: [session, f.nonce].filter(Boolean).join("; "), Origin: "https://guild.example", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: f.csrf, actions, mode }).toString() }), env(over), ctx);
  const text = await res.text(); let body = {};
  try { body = JSON.parse(text); } catch { /* Script-free history/refusal HTML. */ }
  return { status: res.status, headers: res.headers, text, body };
};
const one = (sql, ...p) => db.prepare(sql).get(...p);
const iso = (s) => new Date(s * 1000).toISOString();
/** Every (table, column) of the whole schema holding `id` as a value, as "table.column". */
const whereIs = (id) => {
  const hits = [];
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    for (const c of db.prepare(`PRAGMA table_info("${t.name}")`).all()) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}" WHERE "${c.name}" = ?`).get(id).n;
      if (n > 0) hits.push(`${t.name}.${c.name}`);
    }
  }
  return hits.sort();
};

(async () => {
  siteUser(MEMBER, { global_name: "Mia", nick: "Mia the Mage" }); confirm(MEMBER, "Mia One", "Player-1-0001"); confirm(MEMBER, "Mia Two", "Player-1-0002");
  siteUser(ORG, { global_name: "Org" }); confirm(ORG, "Org Char"); siteUser(OTHER, { global_name: "Oz" }); confirm(OTHER, "Oz Alt"); siteUser(STAFF, { global_name: "Vik" }); confirm(STAFF, "Vik Admin"); siteUser(STAFF2, { global_name: "Ann" });
  // the site's own data about the member
  // .77: the application through the REAL writer (PUT /api/application) with a Discord picker reference and the member's own words (Codex's normal-writer regression, 05:08); the review itself is the staff's later action
  const hexOf = (hours) => { const b = new Array(168).fill(0); for (const h of hours) b[h] = 1; let x = ""; for (let i = 0; i < 168; i += 4) x += ((b[i] << 3) | (b[i + 1] << 2) | (b[i + 2] << 1) | b[i + 3]).toString(16); return x; };
  const evenings = Array.from({ length: 7 }, (_, d) => Array.from({ length: 5 }, (_, h) => d * 24 + 18 + h)).flat();
  const app = await call("PUT", "/api/application", MEMBER, { position: "officer", backups: [], class: "mage", role: "dps", region: "eu", character: "Mia One", fallback: true, ack: true, board: true, avail: hexOf(evenings), availTz: "Europe/Stockholm", answers: { experience: "Cleared Naxx in 2006 and again in 2020.", why: "Oz said I should apply", leadership: "Led a 40-man raid for two years.", scenario: "Move it to DMs, then decide by the rules.", hours: "10to20", voice: "yes", references: [{ kind: "discord", key: OTHER, label: "Oz (@u04)" }, { kind: "name", label: "Fern" }] } });
  check("(fixture) the member's application saved through the real writer, with a Discord picker reference", app.status === 200 && JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id = ?", MEMBER).answers).references[0].key === OTHER, JSON.stringify(app.body).slice(0, 200));
  db.prepare("UPDATE site_applications SET status = 'reviewing', reviewed_by = ?, reviewed_at = ? WHERE discord_id = ?").run(STAFF, T, MEMBER);
  db.prepare("INSERT INTO site_votes (voter_id, ballot, slot, nominee_kind, nominee_key, nominee_label, reason, created_at, updated_at) VALUES (?, 'officer', 1, 'discord', ?, 'Oz', 'steady hand', ?, ?)").run(MEMBER, OTHER, T, T);
  db.prepare("INSERT INTO site_board_votes (voter_id, candidate_id, role_key, vote, created_at, updated_at) VALUES (?, ?, 'officer', 1, ?, ?)").run(MEMBER, OTHER, T, T);
  db.prepare("INSERT INTO site_friends (owner_id, friend_kind, friend_key, friend_label, note, created_at) VALUES (?, 'discord', ?, 'Oz', 'raids together', ?)").run(MEMBER, OTHER, T);
  db.prepare("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, 'Mia Three', 'mia three', 'approved', ?, ?, ?)").run(MEMBER, T, STAFF, T);
  db.prepare("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, 'Oz Res', 'oz res', 'approved', ?, ?, ?)").run(OTHER, T, STAFF, T); // another member's reservation the admin approved
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, consumed_at, consumed_source) VALUES (?, 'mia one', 'Mia One', ?, ?, ?, 'whisper')").run(MEMBER, T - 100, T + 86400, T - 50);
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.member', ?, ?)").run(T - 40, MEMBER, JSON.stringify({ discordId: MEMBER, roleGranted: true }));
  // the community features, through their real routes
  let r = await call("PUT", "/api/community/profile", MEMBER, { revision: 0, listed: true, main: "Mia One", raidRole: "healer", professions: [{ name: "alchemy", skill: 300 }], alts: ["Mia Two"], crafts: [{ profession: "alchemy", recipe: "Elixir of Fortitude" }] });
  check("(fixture) the member's directory profile", r.status === 200);
  const EV = "E".repeat(22), start = Math.floor(RealDate.now() / 1000) + 3 * 86400;
  r = await call("POST", "/api/community/events", ORG, { opId: EV, title: "Raid night", startsAt: iso(start), durationMin: 120 });
  check("(fixture) an event by an organizer", r.status === 200);
  r = await call("PUT", "/api/community/events/rsvp", MEMBER, { eventId: EV, status: "yes", character: "Mia One", revision: 0 });
  check("(fixture) the member's answer", r.status === 200);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "T".repeat(22), discordId: MEMBER, reviewDueAt: iso(T + 30 * 86400), sponsorDiscordId: OTHER });
  check("(fixture) a trial about the member with a sponsor", r.status === 200);
  r = await call("POST", "/api/admin/community/restrictions", STAFF, { action: "create", caseId: "R".repeat(22), discordId: MEMBER, category: "conduct_removal", reviewAt: iso(T + 30 * 86400), expiresAt: iso(T + 180 * 86400) });
  check("(fixture) a restriction case about the member", r.status === 200);
  r = await call("POST", "/api/admin/community/restrictions", STAFF, { action: "add_characters", caseId: "R".repeat(22), expectedRevision: r.body.case.revision });
  check("(fixture) its watch-list", r.status === 200 && r.body.case.characters.length === 2);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, left_at) VALUES ('mia old', 'Mia Old', ?, 'left', ?, ?)").run(MEMBER, T - 10 * 86400, T - 2 * 86400);
  const made = await load("./community-departures").departureIntake(env(ON), T);
  check("(fixture) a departure review item", made === 1);
  // .75: the member's contribution ledger: this week's obligation and a receipt an officer recorded (the officer is the observer; a staff id in the bot's rows)
  const pol = load("./community-contribution-policy");
  r = await call("POST", "/api/admin/community/contributions", STAFF, { action: "obligation", discordId: MEMBER, periodStart: iso(pol.periodStart(T, pol.DEFAULT_CONTRIBUTION_POLICY)) });
  check("(fixture) the member's obligation for this week", r.status === 200 && r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  r = await call("POST", "/api/admin/community/contributions", STAFF, { action: "receipt", source: "officer_manual", sourceId: "mail-1", payerName: "Mia One", amountCopper: 10000, observedAt: iso(T - 60), matchedDiscordId: MEMBER, status: "matched" });
  check("(fixture) a receipt recorded by the officer and matched to the member", r.status === 200 && r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  // .74: the member's own queue row (the officer, the watcher's claim and the note are not theirs to copy), and more than a page of actions naming them as subject or as actor
  db.prepare("INSERT INTO invite_queue (name_key, name, discord_id, note, status, created_at, written_at, invited_at, approved_by, claimed_by, attempts, last_reason, last_reason_at) VALUES ('mia one', 'Mia One', ?, 'note set by the addon', 'invited', ?, ?, ?, ?, 'officer-watcher-1', 1, 'offline', ?)").run(MEMBER, T - 100, T - 90, T - 80, STAFF, T - 95);
  const noise = db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, ?, 'test.noise', ?, NULL)");
  for (let i = 0; i < 1005; i++) noise.run(T + 1000 + i, i % 2 ? MEMBER : "system", i % 2 ? "something" : MEMBER);

  console.log("\n== the member's own copy ==");
  const copySession = await cookieFor(MEMBER);
  r = await call("GET", "/api/me/export", MEMBER, undefined, ON, { Cookie: copySession });
  const copy = r.body, text = JSON.stringify(copy);
  check("GET /api/me/export answers the signed-in account's copy as a JSON attachment", r.status === 200 && r.headers.get("Content-Disposition") === 'attachment; filename="olympus-my-data.json"' && /no-store/.test(r.headers.get("Cache-Control") || "") && typeof copy.generatedAt === "string", r.status, JSON.stringify(copy).slice(0, 200));
  check("the account section: Discord names, sign-ins, standing", copy.account.discordId === MEMBER && copy.account.displayName === "Mia" && copy.account.nickname === "Mia the Mage" && copy.account.firstSignIn === iso(T) && copy.account.inServer === true && copy.account.denied === false);
  check("the site section: the application (the member's view), votes and friends by the labels chosen, board votes by role, reserved names", copy.site.application && copy.site.application.position === "officer" && copy.site.votes.length === 1 && copy.site.votes[0].nominee.label === "Oz" && copy.site.boardVotes.length === 1 && copy.site.boardVotes[0].role === "officer" && copy.site.friends[0].label === "Oz" && copy.site.reserved[0].name === "Mia Three" && copy.site.reserved[0].status === "approved", JSON.stringify(copy.site).slice(0, 400));
  check("the verification section: not banned, a current Battle.net link without the tag, the bound characters, the code requests without any code", copy.verification.bannedFromVerifying === false && copy.verification.battleNet.linked === true && !("battletag" in copy.verification.battleNet) && copy.verification.characters.length === 3 && copy.verification.characters.some((c) => c.name === "Mia Old" && c.status === "left") && copy.verification.codeRequests.length === 1 && copy.verification.codeRequests[0].usedThrough === "whisper" && !/code":/.test(text));
  check("the actions: fixed action names with their time, nothing else; .74: the earliest 1000 naming the account as subject OR actor, with a continuation when more exist", copy.actions.entries.some((a) => a.action === "roster.member") && copy.actions.entries.every((a) => Object.keys(a).sort().join() === "action,at") && copy.actions.entries.length === 1000 && copy.actions.truncated === true && (typeof copy.actions.nextCursor === "string" && copy.actions.nextCursor.length > 0 && copy.actions.nextCursor.length <= 140 && copy.actions.capture.kind === "retained_action_range"), copy.actions.entries.length, copy.actions.nextCursor);
  check("  .74: no structural reference to another Discord account: the nominee's and the friend's `kind` are gone, the labels the member chose stay", !("kind" in copy.site.votes[0].nominee) && copy.site.votes[0].nominee.label === "Oz" && copy.site.friends.length === 1 && !("kind" in copy.site.friends[0]) && copy.site.friends[0].label === "Oz");
  check("  .74: the member's own queue state: character, status, attempts, dates and the fixed refusal reason; never the officer, the claim or the note", copy.verification.inviteQueue.length === 1 && copy.verification.inviteQueue[0].character === "Mia One" && copy.verification.inviteQueue[0].status === "invited" && copy.verification.inviteQueue[0].attempts === 1 && copy.verification.inviteQueue[0].lastRefusal.reason === "offline" && copy.verification.inviteQueue[0].invitedAt === iso(T - 80) && !text.includes("officer-watcher-1") && !text.includes("note set by the addon"), JSON.stringify(copy.verification.inviteQueue));
  r = await postCopy(copySession, copy.actions.nextCursor);
  check("  .118: the same-path POST continuation answers the next bounded page of retained actions and a fresh own-account copy", r.status === 200 && r.body.account.discordId === MEMBER && r.body.actions.entries.length >= 5 && r.body.actions.entries.length <= 1000 && r.body.actions.truncated === false && r.body.actions.nextCursor === null && r.body.actions.entries.every((a) => a.at >= copy.actions.entries.at(-1).at) && r.body.actions.entries.some((a) => a.action === "test.noise"), r.body.actions && r.body.actions.entries.length);
  r = await call("GET", "/api/me/export?actions=zzz", MEMBER);
  check("  .74: a malformed continuation is 400 invalid_cursor (and counts as no copy)", r.status === 400 && r.body.error === "invalid_cursor");
  check("  .74/.76: the about text says how the copy was captured (one database transaction), no more", copy.about.includes("read together in one database transaction at generatedAt"));
  check("  .76: generatedAt is the database's clock inside the copy's batch (the real clock, not this process's fixed time)", Math.abs(RealDate.now() / 1000 - Date.parse(copy.generatedAt) / 1000) < 300 && Math.abs(Date.parse(copy.generatedAt) / 1000 - T) > 86400, copy.generatedAt);
  check("  .76/.77: the application saved through the normal writer carries its references as kind and label only in the own copy (the stored row keeps the key for the site's own use); the member's own words stay", copy.site.application.answers.references.length === 2 && copy.site.application.answers.references.every((x) => !("key" in x)) && copy.site.application.answers.references[0].label === "Oz (@u04)" && copy.site.application.answers.references[1].kind === "name" && copy.site.application.answers.why === "Oz said I should apply" && JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id = ?", MEMBER).answers).references[0].key === OTHER);
  check("every community feature's section is present through the registry", ["directory", "events", "trials", "restrictions", "departures", "contributions"].every((k) => k in copy.community) && copy.community.contributions.obligations.length === 1 && copy.community.contributions.receipts.length === 1 && !("payerName" in copy.community.contributions.receipts[0]) && copy.community.directory.main.name === "Mia One" && copy.community.events.signups.length === 1 && copy.community.trials.trials.length === 1 && copy.community.restrictions.cases.length === 1 && copy.community.restrictions.watchList.length === 2 && copy.community.departures.departures.length === 1, Object.keys(copy.community).join());
  check("MINIMIZATION: no other member's Discord id and no staff id anywhere in the copy (the organizer, the sponsor, the admin, the nominee, the candidate, the friend)", !text.includes(ORG) && !text.includes(OTHER) && !text.includes(STAFF) && !text.includes(STAFF2), text.match(/\d{17,20}/g));
  check("  no staff notes/reasons/identities or private verification/code hashes; only the intentional continuation integrity MAC is present", !/admin_note|ban_reason|reviewed_by|added_by|sponsor|incarnation|nonce|write_nonce/.test(text));
  check("the copy is audited as site.copy_exported with no details", one("SELECT details FROM audit WHERE action = 'site.copy_exported' AND actor = ?", MEMBER).details === null);
  for (let i = 0; i < 3; i++) await call("GET", "/api/me/export", MEMBER); // two copies above (the first and the continuation), three here
  r = await call("GET", "/api/me/export", MEMBER);
  check("five copies an hour: the sixth is 429 slow_down", r.status === 429 && r.body.error === "slow_down");
  db.prepare("UPDATE site_users SET denied = 1, denied_at = ?, denied_by = ? WHERE discord_id = ?").run(T, STAFF, OTHER);
  r = await call("GET", "/api/me/export", OTHER);
  check("a denied member still gets their copy (the reader boundary is the session alone), with the denial dated and nobody named", r.status === 200 && r.body.account.denied === true && r.body.account.deniedAt === iso(T) && !JSON.stringify(r.body).includes(STAFF));
  const res = await indexMod.default.fetch(new Request("https://guild.example/api/me/export"), env(ON), ctx);
  check("without a session: 401", res.status === 401);

  console.log("\n== .74: the whole copy is ONE admitted transaction (Codex's review of .71, 04:24) ==");
  let lastBatch = 0;
  BEFORE = (i) => { lastBatch = i; };
  r = await call("GET", "/api/me/export", OTHER);
  check("a copy is read in exactly one batch: the keeper's sections and every registry section in the same admitted transaction", r.status === 200 && lastBatch === 1 && ["refs", "directory", "events", "trials", "restrictions", "departures"].every((k) => k in r.body.community), lastBatch, Object.keys(r.body.community || {}).join());
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(OTHER); } };
  r = await call("GET", "/api/me/export", OTHER);
  check("the session invalidated between the context read and the batch: 401 signed_out, no section of the copy", r.status === 401 && r.body.error === "signed_out" && !("community" in r.body) && !("account" in r.body), JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE site_users SET session_version = 1 WHERE discord_id = ?").run(OTHER);
  let late = false;
  AFTER = (i) => { if (i === 1) db.prepare("UPDATE site_users SET session_version = 3 WHERE discord_id = ?").run(OTHER); if (i >= 2) late = true; };
  r = await call("GET", "/api/me/export", OTHER);
  AFTER = null;
  check("the session invalidated right after the batch: the whole admitted transaction is answered without a later database read or all-store completion claim", r.status === 200 && late === false && "restrictions" in r.body.community && r.body.about.startsWith("A curated partial copy about your own Discord account"), JSON.stringify(r.body).slice(0, 120));
  db.prepare("UPDATE site_users SET session_version = 1 WHERE discord_id = ?").run(OTHER);
  check("(no hook left armed)", BEFORE === null && AFTER === null);

  console.log("\n== erasure through the real deleteSiteData, then every table scanned ==");
  const before = whereIs(MEMBER);
  check("(before: the member's id sits in many tables)", before.length >= 12, before.join(" "));
  const deleted = await siteAdmin.deleteSiteData(env(ON), MEMBER, STAFF);
  const after = whereIs(MEMBER);
  const allowed = ["audit.actor", "audit.subject", "characters.discord_id", "community_restriction_cases.discord_id", "community_restriction_periods.discord_id", "invite_queue.discord_id", "members.discord_id", "pending.discord_id"];
  check("after the erasure the id remains ONLY in the documented residue: the bot's own verification rows (members, characters, pending, the invite queue), the dated log, and the active restriction case with its period", deleted && after.every((h) => allowed.includes(h)), after.filter((h) => !allowed.includes(h)).join(" ") || "(no unexpected hit)");
  check("  the site account, application, votes, board votes, friends and reservations are gone", !one("SELECT 1 FROM site_users WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM site_applications WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM site_votes WHERE voter_id = ?", MEMBER) && !one("SELECT 1 FROM site_board_votes WHERE voter_id = ?", MEMBER) && !one("SELECT 1 FROM site_friends WHERE owner_id = ?", MEMBER) && !one("SELECT 1 FROM site_reserved WHERE owner_id = ?", MEMBER));
  check("  every community feature's rows about them are gone or anonymized: profile, ref, answer, trial, departure item; the case's watch-list rows stay with the active case", !one("SELECT 1 FROM community_profiles WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_event_signups WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_trials WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", MEMBER) && one("SELECT COUNT(*) AS n FROM community_restriction_characters WHERE case_id = ?", "R".repeat(22)).n === 2);
  const staffBefore = whereIs(STAFF);
  await siteAdmin.deleteSiteData(env(ON), STAFF, STAFF2);
  const staffAfter = whereIs(STAFF);
  const staffAllowed = ["audit.actor", "audit.subject", "characters.discord_id", "members.discord_id"];
  check("an erased staff member is anonymized everywhere they acted (the application's reviewer, the reservation's approver, the denial, the trial's creator, the case's setter, the watch-list's adder, the queue row's approver) and remains only in the dated log and the bot's own rows", staffBefore.length > staffAfter.length && staffAfter.every((h) => staffAllowed.includes(h)), staffAfter.filter((h) => !staffAllowed.includes(h)).join(" ") || "(no unexpected hit)");
  check("  the case shows no setter, the reservation no approver, the denial no admin", one("SELECT set_by FROM community_restriction_cases WHERE id = ?", "R".repeat(22)).set_by === "erased" && one("SELECT approved_by FROM site_reserved WHERE name = 'Oz Res'").approved_by === null && one("SELECT denied_by FROM site_users WHERE discord_id = ?", OTHER).denied_by === null);

  console.log("\n== .118: a retained own-action range, signed to one genuine session ==");
  {
    const savedDb = db, savedT = T, savedBefore = BEFORE, savedAfter = AFTER;
    let rangeDb = null;
    try {
      rangeDb = freshDb(); db = rangeDb; BEFORE = null; AFTER = null;
      load("./schema").forgetSchemaCheck();
      const exporter = load("./site-export");
      let serial = 0;
      const newAccount = (size = 0, over = {}) => {
        const id = String(310000000000000000n + BigInt(++serial)); siteUser(id, over);
        const expected = [], rowIds = [];
        const insert = db.prepare("INSERT INTO audit (ts,actor,action,subject,details) VALUES (?,?,?,?,NULL)");
        for (let i = 0; i < size; i++) {
          const at = T + 1000 + Math.floor(i / 700), action = i === 0 ? "site.copy_exported" : "range." + String(i).padStart(5, "0");
          // One row matching both actor and subject counts ONCE; foreign rows interleave their ids.
          const result = insert.run(at, i % 3 === 0 || i % 3 === 1 ? id : "system", action, i % 3 === 0 || i % 3 === 2 ? id : "not-an-account");
          rowIds.push(Number(result.lastInsertRowid)); expected.push({ at: iso(at), action });
          insert.run(at, OTHER, "foreign." + i, OTHER);
        }
        return { id, expected, rowIds };
      };
      const start = async (id, session) => call("GET", "/api/me/export", id, undefined, ON, { Cookie: session });
      const copies = id => one("SELECT COUNT(*) AS n FROM audit WHERE actor=? AND action='site.copy_exported'", id).n;
      const cookiePayload = session => JSON.parse(Buffer.from(session.slice(session.indexOf("=") + 1).split(".")[0], "base64url").toString("utf8"));
      const signedSession = async payload => {
        const encoded = siteCore.b64u(new TextEncoder().encode(JSON.stringify(payload)));
        return "__Host-olg=" + encoded + "." + await siteCore.sign(env().COOKIE_SECRET, "session", encoded);
      };
      const internal = async (session, user, cursor) => {
        const res = await exporter.exportMyData(new Request("https://guild.example/api/me/export", { headers: { Cookie: session } }), env(ON), user, cursor);
        return { status: res.status, body: await res.json() };
      };

      for (const size of [1001, 2005]) {
        const f = newAccount(size), session = await cookieFor(f.id), first = await start(f.id, session), a = first.body.actions;
        check(`.118 ${size}: initial page captures all own rows once, bounded to 1000 including actor/subject double matches`, first.status === 200 && a.entries.length === 1000 && a.capture.kind === "retained_action_range" && a.capture.count === size && a.capture.delivered === 1000 && a.capture.remaining === size - 1000 && a.capture.complete === false && a.truncated === true && typeof a.currentCursor === "string" && typeof a.nextCursor === "string");
        db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)").run(T - 100000, f.id, "after.capture.backdated", f.id);
        db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)").run(T + 100000, f.id, "after.capture.future", f.id);
        db.prepare("UPDATE site_users SET nick='Fresh nickname after capture' WHERE discord_id=?").run(f.id);
        const pages = [a]; let next = a.nextCursor, finalResponse = first;
        for (let pageNumber = 1; pageNumber <= 2 && next; pageNumber++) {
          finalResponse = await postCopy(session, next); pages.push(finalResponse.body.actions);
          if (finalResponse.status !== 200 || !finalResponse.body.actions) break;
          next = finalResponse.body.actions.nextCursor;
        }
        const entries = pages.flatMap(p => p?.entries || []);
        check(`.118 ${size}: exact chronological traversal across tied timestamps has no duplicate, missing or foreign actions`, finalResponse.status === 200 && JSON.stringify(entries) === JSON.stringify(f.expected) && new Set(entries.map(x => x.action)).size === size && pages.map(p => p.entries.length).join() === (size === 1001 ? "1000,1" : "1000,1000,5"));
        check(`.118 ${size}: capture time/count persist; postcapture inserts and newly generated copy audits cannot enter the range`, pages.every((p,i) => p.capture.at === a.capture.at && p.capture.count === size && p.capture.delivered === Math.min((i+1)*1000,size) && p.capture.remaining === Math.max(size-(i+1)*1000,0) && p.capture.complete === (i === pages.length-1)) && !entries.some(x => x.action.startsWith("after.capture.")) && entries.filter(x => x.action === "site.copy_exported").length === 1 && pages.at(-1).nextCursor === null && pages.at(-1).truncated === false);
        const same = await postCopy(session, a.currentCursor);
        check(`.118 ${size}: downloading the current page repeats its retained actions while other copy sections are freshly read`, same.status === 200 && JSON.stringify(same.body.actions.entries) === JSON.stringify(a.entries) && same.body.actions.capture.at === a.capture.at && same.body.actions.capture.count === size && same.body.account.nickname === "Fresh nickname after capture" && same.body.about.includes("Other sections are freshly read") && same.body.coverage.completeErasure === false);
      }

      {
        const f = newAccount(), session = await cookieFor(f.id);
        db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)").run(T, OTHER, "foreign.only", OTHER);
        const first = await start(f.id, session), again = await postCopy(session, first.body.actions.currentCursor);
        check(".118 an empty captured own range remains complete and empty after its first copy audit is inserted", first.status === 200 && again.status === 200 && first.body.actions.capture.count === 0 && again.body.actions.capture.count === 0 && again.body.actions.entries.length === 0 && again.body.actions.capture.complete === true && again.body.actions.nextCursor === null);
      }
      for (const change of ["delivered-delete", "remaining-delete", "membership-drop", "remaining-order-drop", "delete-at-batch"]) {
        const f = newAccount(1001), session = await cookieFor(f.id), first = await start(f.id, session);
        const mutate = () => change === "remaining-order-drop" ? db.prepare("UPDATE audit SET ts=? WHERE id=?").run(T+999,f.rowIds[1000]) : change === "membership-drop"
          ? db.prepare("UPDATE audit SET actor=?,subject=? WHERE id=?").run(OTHER,OTHER,f.rowIds[1000])
          : db.prepare("DELETE FROM audit WHERE id=?").run(f.rowIds[change === "delivered-delete" ? 0 : 1000]);
        if (change !== "delete-at-batch") mutate();
        const beforeCopies = copies(f.id);
        const form = await accountForm(session); let batches = 0;
        BEFORE = () => { batches++; if(change === "delete-at-batch") { BEFORE = null; mutate(); } };
        const response = await postCopy(session, first.body.actions.nextCursor, "download", form); BEFORE = null;
        check(`.118 ${change}: changed captured membership/count is 409 without a completed payload or export audit`, response.status === 409 && response.body.error === "history_changed" && !("actions" in response.body) && !("account" in response.body) && !response.headers.get("Content-Disposition") && copies(f.id) === beforeCopies && batches === 1);
      }

      {
        const f = newAccount(1001), session = await cookieFor(f.id), first = await start(f.id, session), token = first.body.actions.nextCursor;
        const user = await siteCore.currentUser(env(), new Request("https://guild.example/", { headers: { Cookie: session } }));
        const parts = token.split("."), altered = [];
        for (let i = 1; i <= 7; i++) { const p = parts.slice(); p[i] = String(Number(p[i]) + 1); altered.push(p.join(".")); }
        const mac = parts.slice(); mac[8] = (mac[8][0] === "A" ? "B" : "A") + mac[8].slice(1); altered.push(mac.join("."));
        for (const raw of ["0", "-1", "01", "1000000000000", "9007199254740992"]) { const p = parts.slice(); p[1] = raw; altered.push(p.join(".")); }
        const beforeCopies = copies(f.id); let batches = 0; BEFORE = () => { batches++; };
        for (let i=0;i<altered.length;i++) {
          const response = await internal(session, user, altered[i]);
          check(`.118 altered cursor field/MAC/canonical bound ${i+1}: refused before any admitted payload batch`, response.status === 400 && response.body.error === "invalid_cursor" && !("actions" in response.body) && batches === 0 && copies(f.id) === beforeCopies);
        }
        BEFORE = null;
        for (const query of [token, "1.2", ""]) {
          let attempted = 0; BEFORE = () => { attempted++; };
          const response = await call("GET", "/api/me/export?actions=" + encodeURIComponent(query), f.id, undefined, ON, { Cookie: session }); BEFORE = null;
          check(".118 signed, unsigned and empty API cursor queries all refuse before payload admission", response.status === 400 && response.body.error === "invalid_cursor" && response.body.message.includes("account form") && attempted === 0 && copies(f.id) === beforeCopies);
        }
        const other = newAccount(), otherSession = await cookieFor(other.id), otherForm = await accountForm(otherSession);
        let attempted = 0; BEFORE = () => { attempted++; };
        const crossed = await postCopy(otherSession, token, "download", otherForm); BEFORE = null;
        check(".118 another account's own genuine CSRF/session cannot consume the captured token", crossed.status === 400 && crossed.body.error === "invalid_cursor" && attempted === 0 && copies(other.id) === 0);
        const replace = async (payload, passedVersion) => {
          const replacement = await signedSession(payload), form = await accountForm(replacement); let count = 0; BEFORE = () => { count++; };
          const response = await postCopy(replacement, token, "download", form); BEFORE = null;
          return response.status === 400 && response.body.error === "invalid_cursor" && count === 0 && copies(f.id) === beforeCopies && payload.v === passedVersion;
        };
        const payload = cookiePayload(session);
        check(".118 a fresh valid session with a different signed expiry cannot reuse the old cursor", await replace({ ...payload, e: payload.e + 60 }, 1));
        db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(f.id);
        check(".118 a fresh valid replacement session version cannot reuse the old cursor", await replace({ ...payload, v: 2 }, 2));
        db.prepare("UPDATE site_users SET session_version=1 WHERE discord_id=?").run(f.id);
        for (const wrongUser of [{ ...user, discord_id: other.id }, { ...user, session_version: 2 }]) {
          let count = 0; BEFORE = () => { count++; }; const response = await internal(session, wrongUser, token); BEFORE = null;
          check(".118 passed-user id/version cannot substitute for the original signed context", response.status === 401 && response.body.error === "signed_out" && count === 0 && !("actions" in response.body));
        }
      }
      {
        const f = newAccount(1), session = await cookieFor(f.id), form = await accountForm(session), payload = cookiePayload(session);
        const originalTime = T, beforeCopies = copies(f.id); let batches = 0;
        try { T = payload.e + 1; BEFORE = () => { batches++; }; const response = await postCopy(session, "", "download", form);
          check(".118 actor-clock expiry refuses the saved real form before any payload batch", response.status === 401 && response.text.includes("Session unavailable") && batches === 0 && copies(f.id) === beforeCopies);
        } finally { T = originalTime; BEFORE = null; }
        const expired = await signedSession({ ...payload, e: Math.floor(RealDate.now()/1000)-1 }); batches = 0; BEFORE = () => { batches++; };
        const response = await start(f.id, expired); BEFORE = null;
        check(".118 genuine SQLite-clock expiry refuses an attempted admitted API batch without any payload or export audit", [401,409].includes(response.status) && ["signed_out","conflict"].includes(response.body.error) && batches === 1 && !("account" in response.body) && !("actions" in response.body) && copies(f.id) === beforeCopies);
      }
      for (const standing of ["denied", "departed", "banned"]) {
        const f = newAccount(1, { denied: standing === "denied" ? 1 : 0, in_server: standing === "departed" ? 0 : 1 });
        if (standing === "banned") db.prepare("INSERT INTO members(discord_id,linked_at,banned) VALUES(?,?,1)").run(f.id,T);
        const session = await cookieFor(f.id), response = await start(f.id,session);
        check(`.118 ${standing}: a genuine valid session retains only its own partial-copy authority`, response.status === 200 && response.body.account.discordId === f.id && response.body.actions.capture.count === 1 && response.body.coverage.completeErasure === false && !JSON.stringify(response.body).includes(OTHER) && (standing !== "denied" || response.body.account.denied === true) && (standing !== "departed" || response.body.account.inServer === false) && (standing !== "banned" || response.body.verification.bannedFromVerifying === true));
      }
      {
        const f = newAccount(1001), session = await cookieFor(f.id), first = await start(f.id,session), form = await accountForm(session);
        const results = [first, await postCopy(session,first.body.actions.currentCursor,"history",form), await postCopy(session,first.body.actions.currentCursor,"download",form), await postCopy(session,first.body.actions.nextCursor,"history",form), await postCopy(session,first.body.actions.nextCursor,"download",form)];
        const sixth = await postCopy(session,first.body.actions.currentCursor,"history",form);
        check(".118 initial API download, history views and JSON downloads share five copy reads per hour", results.every(x => x.status === 200) && sixth.status === 429 && sixth.text.includes("slow_down") && sixth.text.includes("Five copy views or downloads") && copies(f.id) === 6); // one seeded pre-capture audit plus five accepted reads
      }
      // .118 representative local SQL load: diagnostics only, no timing SLA or query-plan efficiency assertion.
      {
        const originalTime=T, times=[]; let f;
        db.exec("BEGIN");
        try {
          f=newAccount(6001);
          const unrelated=db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)");
          for(let i=0;i<100000;i++) unrelated.run(T,OTHER,"unrelated.bulk",OTHER);
          db.exec("COMMIT");
        } catch(error) { db.exec("ROLLBACK"); throw error; }
        const session=await cookieFor(f.id), pages=[];
        const timed=async(label,operation)=>{const at=performance.now();try{return await operation();}finally{times.push({label,ms:Math.round((performance.now()-at)*100)/100});}};
        try {
          let response=await timed("page1",()=>start(f.id,session)); pages.push(response.body.actions);
          let next=response.body.actions.nextCursor;
          for(let i=2;i<=5;i++) { response=await timed("page"+i,()=>postCopy(session,next)); pages.push(response.body.actions); next=response.body.actions.nextCursor; }
          check(".118 6001 own rows amid 100000 unrelated rows: five bounded reads reach 5000 and truthfully retain 1001", response.status===200 && pages.length===5 && pages.every((p,i)=>p.entries.length===1000 && p.capture.count===6001 && p.capture.delivered===(i+1)*1000 && p.capture.complete===false) && pages.at(-1).capture.remaining===1001 && pages.at(-1).nextCursor===next && next!==null);
          const beforeLimited=copies(f.id), limited=await timed("limited-page6",()=>postCopy(session,next,"history"));
          check(".118 the sixth large-range read is 429 without a false completed payload or a new export audit", limited.status===429 && limited.text.includes("slow_down") && !("actions" in limited.body) && copies(f.id)===beforeLimited);
          T+=3601; const fresh=await accountForm(session);
          for(let i=6;i<=7;i++) { response=await timed("resumed-page"+i,()=>postCopy(session,next,"download",fresh)); pages.push(response.body.actions); next=response.body.actions.nextCursor; }
          const entries=pages.flatMap(p=>p.entries);
          check(".118 after the shared rate window the same signed cookie/continuation resumes to exact range completion", response.status===200 && pages.map(p=>p.entries.length).join()==="1000,1000,1000,1000,1000,1000,1" && JSON.stringify(entries)===JSON.stringify(f.expected) && new Set(entries.map(x=>x.action)).size===6001 && pages.every(p=>p.capture.at===pages[0].capture.at && p.capture.count===6001) && pages.at(-1).capture.delivered===6001 && pages.at(-1).capture.remaining===0 && pages.at(-1).capture.complete===true && next===null && entries.filter(x=>x.action==="site.copy_exported").length===1 && copies(f.id)===beforeLimited+2);
        } finally { T=originalTime; console.log(".118 local read elapsed milliseconds (diagnostic only; scan/index cost is not guaranteed): "+JSON.stringify(times)); }
      }
      console.log("\n== .119: separate actor-owned retained event-change capture ==");
      {
        const eventForm = async session => {
          const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account", { headers: { Cookie: session } }), env(ON), ctx);
          const text = await res.text(), forms = [...text.matchAll(/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/g)];
          const form = forms.find(x => x[1].includes('name="collection" value="event_changes"'))?.[1] || "";
          return { nonce: (res.headers.get("Set-Cookie") || "").split(";")[0], csrf: (form.match(/name="csrf" value="([^"]+)"/) || [])[1] || "", text };
        };
        const eventPost = async (session, token = "", mode = "download", controls, extra = {}, headers = {}) => {
          const f = controls || await eventForm(session);
          const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account/export", { method: "POST", headers: { Cookie: [session,f.nonce].join("; "), Origin: "https://guild.example", "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams({ csrf: f.csrf, collection: "event_changes", eventChanges: token, mode, ...extra }).toString() }), env(ON), ctx);
          const text = await res.text(); let body = {}; try { body = JSON.parse(text); } catch { /* Real script-free view/refusal. */ }
          return { status: res.status, text, body, headers: res.headers };
        };
        const seedEvents = (size, over = {}) => {
          const f = newAccount(0, over), expected = [], rowIds = [];
          const put = db.prepare("INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)");
          for (let i=0;i<size;i++) {
            const eventId = "E"+String(i).padStart(21,"0"), at=T+2000+Math.floor(i/700), action=i===0?"created":i===size-1?"cancelled":"updated", fields=action==="updated"?["title","capacity"]:[];
            rowIds.push(Number(put.run(eventId,action,f.id,at,JSON.stringify(fields)).lastInsertRowid));
            expected.push({ eventId,action,at:iso(at),changedFieldNames:fields });
            put.run("F"+String(i).padStart(21,"0"),"updated",OTHER,at,'["details"]');
          }
          return { ...f,expected,rowIds };
        };
        for (const size of [0,1,1000,1001,2005]) {
          const f=seedEvents(size), session=await cookieFor(f.id), form=await eventForm(session), first=await eventPost(session,"","download",form);
          const page=first.body.eventChanges;
          check(`.119 ${size}: own actor range has exact count, bounded page and explicit curated partial coverage`, first.status===200 && form.csrf!=="" && page.capture.kind==="retained_event_change_range" && page.capture.count===size && page.entries.length===Math.min(size,1000) && page.capture.delivered===Math.min(size,1000) && page.capture.remaining===Math.max(size-1000,0) && page.capture.complete===(size<=1000) && first.body.coverage.eventChangesPageLimit===1000 && first.body.coverage.completeErasure===false && typeof page.currentCursor==="string");
          db.prepare("INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)").run("B".repeat(22),"updated",f.id,T-9000,'["title"]');
          db.prepare("INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)").run("L".repeat(22),"updated",f.id,T+9000,'["details"]');
          const pages=[page]; let token=page.nextCursor;
          while(token) { const response=await eventPost(session,token); check(".119 real Next POST admits the same event capture",response.status===200); pages.push(response.body.eventChanges); token=response.body.eventChanges.nextCursor; }
          check(`.119 ${size}: ties and interleaved foreign ids traverse exactly once; later/backdated own changes are excluded`, JSON.stringify(pages.flatMap(p=>p.entries))===JSON.stringify(f.expected) && pages.every(p=>p.capture.count===size && p.capture.at===page.capture.at) && pages.at(-1).capture.complete===true && token===null);
          if(size===1) {
            const same=await eventPost(session,page.currentCursor), actions=await start(f.id,session);
            check(".119 same-page JSON retains its event capture while the original action capture remains a separate dataset",same.status===200 && JSON.stringify(same.body.eventChanges.entries)===JSON.stringify(f.expected) && same.body.eventChanges.capture.count===1 && actions.status===200 && actions.body.actions.capture.kind==="retained_action_range");
          }
        }
        for (const mutation of ["delivered-delete","remaining-delete","actor-drop","tuple-drop"]) {
          const f=seedEvents(1001), session=await cookieFor(f.id), first=await eventPost(session), token=first.body.eventChanges.nextCursor;
          if(mutation==="actor-drop") db.prepare("UPDATE community_event_changes SET actor=? WHERE id=?").run(OTHER,f.rowIds[1000]);
          else if(mutation==="tuple-drop") db.prepare("UPDATE community_event_changes SET at=? WHERE id=?").run(T+1999,f.rowIds[1000]);
          else db.prepare("DELETE FROM community_event_changes WHERE id=?").run(f.rowIds[mutation==="delivered-delete"?0:1000]);
          const before=copies(f.id), response=await eventPost(session,token);
          check(`.119 ${mutation}: observable captured count/position changes refuse completion and audit`,response.status===409 && response.body.error==="event_history_changed" && !("eventChanges" in response.body) && !("account" in response.body) && !response.headers.get("Content-Disposition") && copies(f.id)===before);
        }
        for (const [name,patch] of [["event-id","event_id='bad'"],["unknown-field","fields='[\"unknown\"]'"],["duplicate-field","fields='[\"title\",\"title\"]'"],["non-array","fields='{}'"],["empty-updated","fields='[]'"],["oversized-json","fields='"+JSON.stringify(["x".repeat(260)])+"'"]]) {
          const f=seedEvents(3), session=await cookieFor(f.id); db.exec("UPDATE community_event_changes SET "+patch+" WHERE id="+f.rowIds[1]);
          const before=copies(f.id), response=await eventPost(session);
          check(`.119 malformed stored ${name} is a refusal with no projected arbitrary text/audit`,response.status===409 && response.body.error==="event_history_changed" && !("eventChanges" in response.body) && copies(f.id)===before);
        }
        {
          const f=seedEvents(1001), session=await cookieFor(f.id), first=await eventPost(session), token=first.body.eventChanges.nextCursor, form=await eventForm(session), actionForm=await accountForm(session);
          const actionFirst=await start(f.id,session), actionToken=actionFirst.body.actions.currentCursor;
          const badParts=token.split("."); badParts[8]=(badParts[8][0]==="A"?"B":"A")+badParts[8].slice(1); const bad=badParts.join("."), before=copies(f.id);
          let batches=0; BEFORE=()=>{batches++;};
          for(const [label,raw] of [["changed MAC",bad],["other dataset",actionToken]]) {
            const r=await eventPost(session,raw,"download",form);
            check(".119 "+label+" refuses before admitted batch and shared-limit charge",r.status===400 && r.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          }
          const crossed=await postCopy(session,token,"download",actionForm);
          check(".119 event token cannot continue the original action range",crossed.status===400 && crossed.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          for(const extra of [{actions:""},{collection:"actions"},{collection:""},{collection:"unknown"},{mode:"unknown"}]) {
            const r=await eventPost(session,token,"history",form,extra);
            check(".119 strict collection/field/mode pairing refuses even empty mismatched fields",r.status===400 && r.text.includes("invalid_form") && !r.text.includes(token) && batches===0 && copies(f.id)===before);
          }
          const wrongCsrf=await eventPost(session,token,"history",actionForm), origin=await eventPost(session,token,"history",form,{}, {Origin:"https://other.example"});
          check(".119 event dataset uses real bound CSRF and same-origin admission",wrongCsrf.status===403 && origin.status===403 && batches===0 && copies(f.id)===before);
          for(const path of ["?eventChanges="+encodeURIComponent(token),"?collection=event_changes"]) {
            const r=await call("GET","/api/me/export"+path,f.id,undefined,ON,{Cookie:session});
            check(".119 API query cannot select/continue a dataset",r.status===400 && r.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          }
          BEFORE=null;
          const other=seedEvents(1), otherSession=await cookieFor(other.id); batches=0; BEFORE=()=>{batches++;};
          const crossedAccount=await eventPost(otherSession,token); BEFORE=null;
          check(".119 another valid account cannot use a signed event continuation",crossedAccount.status===400 && crossedAccount.body.error==="invalid_cursor" && batches===0 && copies(other.id)===0);
          const payload=cookiePayload(session), replacement=await signedSession({...payload,e:payload.e+60}); batches=0; BEFORE=()=>{batches++;};
          const expiry=await eventPost(replacement,token); BEFORE=null;
          check(".119 valid replacement expiry cannot reinterpret the original event token",expiry.status===400 && expiry.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(f.id);
          const newVersion=await signedSession({...payload,v:2}); batches=0; BEFORE=()=>{batches++;}; const version=await eventPost(newVersion,token); BEFORE=null;
          check(".119 valid replacement version cannot continue the original event session",version.status===400 && version.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
        }
        for(const standing of ["denied","departed","banned"]) {
          const f=seedEvents(1,{denied:standing==="denied"?1:0,in_server:standing==="departed"?0:1}); if(standing==="banned") db.prepare("INSERT INTO members(discord_id,linked_at,banned) VALUES(?,?,1)").run(f.id,T);
          const r=await eventPost(await cookieFor(f.id));
          check(".119 "+standing+": real valid site session reads its own event changes without guild grant",r.status===200 && r.body.account.discordId===f.id && r.body.eventChanges.capture.count===1 && r.body.coverage.completeErasure===false && !JSON.stringify(r.body.eventChanges).includes(OTHER));
        }
        {
          const f=seedEvents(1), session=await cookieFor(f.id), form=await eventForm(session), before=copies(f.id);
          const expired=await signedSession({...cookiePayload(session),e:Math.floor(RealDate.now()/1000)-1}); let batches=0; BEFORE=()=>{batches++;};
          const response=await eventPost(expired,"","history",form); BEFORE=null;
          check(".119 genuine database-clock expiry refuses an attempted admitted event batch, with no rows/completion/audit",[401,409].includes(response.status) && batches===1 && !response.text.includes("Current event-change page continuation") && copies(f.id)===before);
          const user=await siteCore.currentUser(env(),new Request("https://guild.example/",{headers:{Cookie:session}})); batches=0; BEFORE=()=>{batches++;};
          const wrong=await exporter.exportMyEventChanges(new Request("https://guild.example/privacy/account/export",{method:"POST",headers:{Cookie:session}}),env(ON),{...user,discord_id:OTHER}); BEFORE=null;
          check(".119 passed-user primitives cannot substitute for the signed event subject",wrong.status===401 && batches===0 && copies(f.id)===before);
        }
        {
          const f=seedEvents(2005), session=await cookieFor(f.id), first=await eventPost(session), page=first.body.eventChanges, form=await eventForm(session);
          const history=await eventPost(session,page.currentCursor,"history",form);
          check(".119 script-free event view escapes/presents only known projected data and POST-only Current/Next controls",history.status===200 && history.text.includes("Current event-change page continuation") && history.text.includes("Next event-change page continuation") && history.text.includes('name="collection" value="event_changes"') && history.text.includes('name="eventChanges" value="'+page.nextCursor+'"') && !history.text.includes('name="actions"') && !history.text.includes("<script") && !history.text.includes("?eventChanges="));
          await postCopy(session); await eventPost(session,page.currentCursor); await postCopy(session);
          const before=copies(f.id), limited=await eventPost(session,page.nextCursor,"history",form);
          check(".119 action/download/event views share five reads; valid sixth event view retains matching private POST continuation",limited.status===429 && limited.text.includes("Saved event-change continuation") && limited.text.includes('name="eventChanges" value="'+page.nextCursor+'"') && limited.text.includes('name="collection" value="event_changes"') && !limited.text.includes('name="actions"') && copies(f.id)===before);
          const time=T; try { T+=3601; const r=await eventPost(session,page.nextCursor,"download",await eventForm(session)); check(".119 rate-window resume keeps original signed event capture and fresh form",r.status===200 && r.body.eventChanges.capture.count===2005 && r.body.eventChanges.capture.delivered===2000 && r.body.eventChanges.capture.remaining===5 && r.body.eventChanges.capture.at===page.capture.at); } finally {T=time;}
        }
      }
    } finally { BEFORE = savedBefore; AFTER = savedAfter; T = savedT; rangeDb?.close(); db = savedDb; }
  }

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
