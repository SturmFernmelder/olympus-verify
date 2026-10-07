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
  r = await call("GET", "/api/me/export", MEMBER);
  const copy = r.body, text = JSON.stringify(copy);
  check("GET /api/me/export answers the signed-in account's copy as a JSON attachment", r.status === 200 && r.headers.get("Content-Disposition") === 'attachment; filename="olympus-my-data.json"' && /no-store/.test(r.headers.get("Cache-Control") || "") && typeof copy.generatedAt === "string", r.status, JSON.stringify(copy).slice(0, 200));
  check("the account section: Discord names, sign-ins, standing", copy.account.discordId === MEMBER && copy.account.displayName === "Mia" && copy.account.nickname === "Mia the Mage" && copy.account.firstSignIn === iso(T) && copy.account.inServer === true && copy.account.denied === false);
  check("the site section: the application (the member's view), votes and friends by the labels chosen, board votes by role, reserved names", copy.site.application && copy.site.application.position === "officer" && copy.site.votes.length === 1 && copy.site.votes[0].nominee.label === "Oz" && copy.site.boardVotes.length === 1 && copy.site.boardVotes[0].role === "officer" && copy.site.friends[0].label === "Oz" && copy.site.reserved[0].name === "Mia Three" && copy.site.reserved[0].status === "approved", JSON.stringify(copy.site).slice(0, 400));
  check("the verification section: not banned, a current Battle.net link without the tag, the bound characters, the code requests without any code", copy.verification.bannedFromVerifying === false && copy.verification.battleNet.linked === true && !("battletag" in copy.verification.battleNet) && copy.verification.characters.length === 3 && copy.verification.characters.some((c) => c.name === "Mia Old" && c.status === "left") && copy.verification.codeRequests.length === 1 && copy.verification.codeRequests[0].usedThrough === "whisper" && !/code":/.test(text));
  check("the actions: fixed action names with their time, nothing else; .74: the earliest 1000 naming the account as subject OR actor, with a continuation when more exist", copy.actions.entries.some((a) => a.action === "roster.member") && copy.actions.entries.every((a) => Object.keys(a).sort().join() === "action,at") && copy.actions.entries.length === 1000 && copy.actions.truncated === true && /^\d+\.\d+$/.test(copy.actions.nextCursor), copy.actions.entries.length, copy.actions.nextCursor);
  check("  .74: no structural reference to another Discord account: the nominee's and the friend's `kind` are gone, the labels the member chose stay", !("kind" in copy.site.votes[0].nominee) && copy.site.votes[0].nominee.label === "Oz" && copy.site.friends.length === 1 && !("kind" in copy.site.friends[0]) && copy.site.friends[0].label === "Oz");
  check("  .74: the member's own queue state: character, status, attempts, dates and the fixed refusal reason; never the officer, the claim or the note", copy.verification.inviteQueue.length === 1 && copy.verification.inviteQueue[0].character === "Mia One" && copy.verification.inviteQueue[0].status === "invited" && copy.verification.inviteQueue[0].attempts === 1 && copy.verification.inviteQueue[0].lastRefusal.reason === "offline" && copy.verification.inviteQueue[0].invitedAt === iso(T - 80) && !text.includes("officer-watcher-1") && !text.includes("note set by the addon"), JSON.stringify(copy.verification.inviteQueue));
  r = await call("GET", "/api/me/export?actions=" + copy.actions.nextCursor, MEMBER);
  check("  .74: the continuation answers the next bounded page of actions after the cursor, the rest of the copy as before", r.status === 200 && r.body.account.discordId === MEMBER && r.body.actions.entries.length >= 5 && r.body.actions.entries.length <= 1000 && r.body.actions.truncated === false && r.body.actions.nextCursor === null && r.body.actions.entries.every((a) => a.at >= copy.actions.entries.at(-1).at) && r.body.actions.entries.some((a) => a.action === "test.noise"), r.body.actions && r.body.actions.entries.length);
  r = await call("GET", "/api/me/export?actions=zzz", MEMBER);
  check("  .74: a malformed continuation is 400 invalid_cursor (and counts as no copy)", r.status === 400 && r.body.error === "invalid_cursor");
  check("  .74/.76: the about text says how the copy was captured (one database transaction), no more", copy.about.includes("read together in one database transaction at generatedAt"));
  check("  .76: generatedAt is the database's clock inside the copy's batch (the real clock, not this process's fixed time)", Math.abs(RealDate.now() / 1000 - Date.parse(copy.generatedAt) / 1000) < 300 && Math.abs(Date.parse(copy.generatedAt) / 1000 - T) > 86400, copy.generatedAt);
  check("  .76/.77: the application saved through the normal writer carries its references as kind and label only in the own copy (the stored row keeps the key for the site's own use); the member's own words stay", copy.site.application.answers.references.length === 2 && copy.site.application.answers.references.every((x) => !("key" in x)) && copy.site.application.answers.references[0].label === "Oz (@u04)" && copy.site.application.answers.references[1].kind === "name" && copy.site.application.answers.why === "Oz said I should apply" && JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id = ?", MEMBER).answers).references[0].key === OTHER);
  check("every community feature's section is present through the registry", ["directory", "events", "trials", "restrictions", "departures", "contributions"].every((k) => k in copy.community) && copy.community.contributions.obligations.length === 1 && copy.community.contributions.receipts.length === 1 && !("payerName" in copy.community.contributions.receipts[0]) && copy.community.directory.main.name === "Mia One" && copy.community.events.signups.length === 1 && copy.community.trials.trials.length === 1 && copy.community.restrictions.cases.length === 1 && copy.community.restrictions.watchList.length === 2 && copy.community.departures.departures.length === 1, Object.keys(copy.community).join());
  check("MINIMIZATION: no other member's Discord id and no staff id anywhere in the copy (the organizer, the sponsor, the admin, the nominee, the candidate, the friend)", !text.includes(ORG) && !text.includes(OTHER) && !text.includes(STAFF) && !text.includes(STAFF2), text.match(/\d{17,20}/g));
  check("  no free text written by staff (the ban reason, review notes) and no tokens or hashes", !/admin_note|ban_reason|reviewed_by|added_by|sponsor|incarnation|nonce|write_nonce/.test(text));
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
  check("the session invalidated right after the batch: the copy read in that transaction is answered whole (nothing is queried afterwards) and labelled complete", r.status === 200 && late === false && "restrictions" in r.body.community && r.body.about.startsWith("A copy of what"), JSON.stringify(r.body).slice(0, 120));
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

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
