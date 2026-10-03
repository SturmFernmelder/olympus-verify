// Runs the REAL sweep in src/restore.ts, with its REAL SQL, against schema.sql in SQLite (node:sqlite, Node 22.5+).
// Discord is faked. Run from the worker folder:  node tests/role_sweep_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "src", "restore.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
// A D1-shaped wrapper: prepare(sql).bind(...).first()/all()/run()
const D1 = {
  prepare(sql) {
    let params = [];
    const api = {
      bind: (...p) => { params = p; return api; },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return api;
  },
};

let NOW = 1790380800;
const ROLE = "1549581282227265566";
class DiscordError extends Error { constructor(status, body) { super(`Discord ${status}: ${body}`); this.status = status; this.body = body; } }
let MEMBERS = {}, GRANTS = [], LOGS = [], LOOKUPS = [], GRANT_FAIL = null, REMOVES = [];
const ROLE_ID = "1549581282227265566", BLOCK = "1399774654893133864", FLAG = "1307420957140320297";
let GUILD_ROLES = [ROLE_ID, BLOCK, FLAG];
const stubs = {
  "./env": { intVar: (v, d) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) ? n : d; } },
  "./db": {
    now: () => NOW,
    audit: async (_env, actor, action, subject, details) => {
      db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?1, ?2, ?3, ?4, ?5)")
        .run(NOW, actor, action, subject ?? null, details === undefined ? null : JSON.stringify(details));
    },
  },
  "./discord": {
    DiscordError,
    guildMember: async (_env, id) => { LOOKUPS.push(id); return MEMBERS[id] === undefined ? null : { roles: MEMBERS[id] }; },
    addRole: async (_env, id, role) => { if (GRANT_FAIL) throw GRANT_FAIL; GRANTS.push(id); MEMBERS[id] = [...(MEMBERS[id] || []), role]; },
    removeRole: async (_env, id, role) => { REMOVES.push(id); MEMBERS[id] = (MEMBERS[id] || []).filter((r) => r !== role); },
    rest: async (_env, method, p) => { if (method === "GET" && /\/roles$/.test(p)) return GUILD_ROLES.map((id) => ({ id })); throw new Error("no REST in tests"); },
    logLine: async (_env, text) => { LOGS.push(text); },
    explainDiscordError: (e) => String(e && e.message || e),
  },
};
// .55: the real roles.ts (the one role writer) with the same stubs
const rolesJs = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "roles.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const rolesMod = { exports: {} };
new Function("module", "exports", "require", rolesJs)(rolesMod, rolesMod.exports, (p) => stubs[p]);
stubs["./roles"] = rolesMod.exports;
// .115: restore.ts reads its per-run caps from the real scheduled-budget.ts (the scheduled D1 budget; Codex, 3 Oct 2026 13:26 UTC)
const budgetMod = { exports: {} };
new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "scheduled-budget.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(budgetMod, budgetMod.exports, () => ({}));
stubs["./scheduled-budget"] = budgetMod.exports;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, (p) => stubs[p]);
const { sweepMemberRoles, forgetLocalThrottle, SETTLE_SECONDS, THROTTLE_SECONDS } = mod.exports;
const env = (over = {}) => ({ DB: D1, ROLE_GUILD_MEMBER: ROLE, GUILD_ID: "236932545793490944", BLOCKING_ROLE_IDS: `${BLOCK}, ${FLAG}`, ...over });

const id = (n) => String(300000000000000000n + BigInt(n));
const A = id(1), B = id(2), C = id(3), D = id(4), E = id(5), F = id(6), G = id(7), H = id(8);
function member(did, { status = "member", banned = 0, name = "c" + did.slice(-2) } = {}) {
  db.prepare("INSERT INTO members (discord_id, banned) VALUES (?1, ?2) ON CONFLICT(discord_id) DO UPDATE SET banned = ?2").run(did, banned);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?1, ?2, ?3, ?4, 1)").run(name.toLowerCase(), name, did, status);
}
function promoted(did, ago) {
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?1, 'system', 'roster.member', 'x', ?2)")
    .run(NOW - ago, JSON.stringify({ discordId: did, roleGranted: true }));
}
const reset = () => { GRANTS = []; LOGS = []; LOOKUPS = []; GRANT_FAIL = null; };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const lastSweep = () => { const r = db.prepare("SELECT details FROM audit WHERE action = 'role.sweep' ORDER BY id DESC LIMIT 1").get(); return r ? JSON.parse(r.details) : null; };

(async () => {
  // A lost the role to MEE6; B kept it; C is banned; D left the guild; E left the Discord; F was promoted a minute ago.
  member(A); member(B); member(C, { banned: 1 }); member(D, { status: "left" }); member(E); member(F);
  MEMBERS = { [A]: ["class"], [B]: [ROLE], [C]: [], [D]: [], [F]: [ROLE] };
  promoted(B, 7200); promoted(A, 3600); promoted(C, 3000); promoted(F, 60);

  reset();
  const r1 = await sweepMemberRoles(env(), "cron");
  check("first sweep: A gets Guild Member back", GRANTS.includes(A));
  // .60: the banned account IS looked at, by the reconciliation step, to make sure it holds no Guild Member; it is never granted
  check("  the banned account is never given the role (since .60 the sweep looks at it only to take the role away)", !GRANTS.includes(C) && !MEMBERS[C].includes(ROLE));
  check("  a member who left the guild is not touched", !LOOKUPS.includes(D));
  check("  someone no longer in the Discord is counted, not granted", r1.absent === 1 && !GRANTS.includes(E));
  check("  B, who kept the role, is left alone", LOOKUPS.includes(B) && !GRANTS.includes(B));
  check("  one #server-log line names who was restored", LOGS.length === 1 && LOGS[0].includes(A));
  check("  role.restored is audited per account", db.prepare("SELECT COUNT(*) AS k FROM audit WHERE action = 'role.restored'").get().k === 1);
  const s1 = lastSweep();
  const aId = db.prepare("SELECT id FROM audit WHERE action = 'roster.member' AND details LIKE ?1").get(`%${C}%`).id;
  check("  the watermark stops before F's promotion, still settling", s1.a === aId);
  check("  the rotation wrapped (fewer members than the budget)", s1.c === "");

  reset();
  check("watcher polls inside five minutes do nothing", (await sweepMemberRoles(env(), "watcher")) === null && LOOKUPS.length === 0);

  // Five minutes on: F's promotion has settled, and MEE6 has since taken F's role too. G is promoted and loses it.
  NOW += THROTTLE_SECONDS + 1;
  member(G); MEMBERS[G] = ["class"]; MEMBERS[F] = ["class"]; promoted(G, SETTLE_SECONDS + 5);
  reset();
  const r2 = await sweepMemberRoles(env({ ROLE_SWEEP_PER_RUN: "2" }), "watcher");
  check("next sweep (budget 2): the settled promotions come first, F and G restored", GRANTS.includes(F) && GRANTS.includes(G) && r2.checked === 2);
  // .58: every grant costs two member reads: the sweep's look, then the writer's fresh read at the effect; .60: plus one
  // look at the banned account C by the reconciliation step
  check("  and with the budget spent, no rotation this time (two looks per grant since .58, one banned check since .60)", LOOKUPS.length === 5);

  // Budget 1 and two new promotions: one per sweep, none skipped.
  NOW += THROTTLE_SECONDS + 1;
  member(H); MEMBERS[H] = []; MEMBERS[A] = []; promoted(A, SETTLE_SECONDS + 10); promoted(H, SETTLE_SECONDS + 5);
  reset();
  await sweepMemberRoles(env({ ROLE_SWEEP_PER_RUN: "1" }), "cron");
  const first = [...GRANTS];
  reset();
  await sweepMemberRoles(env({ ROLE_SWEEP_PER_RUN: "1" }), "cron");
  check("budget 1: two promotions take two sweeps, in order, none skipped", first.join() === A && GRANTS.join() === H);

  // .90 (P-20): the run's Discord-call budget. Three members lack the role; each restoration costs three requests (the look,
  // the writer's fresh look, the grant) and is reserved at eight (.95: each call with its possible 429 retry, the mandatory
  // removal after a ban included); with thirteen the sweep finishes two and stops BEFORE the third, cursor at the last done.
  NOW += THROTTLE_SECONDS + 1;
  MEMBERS[A] = ["class"]; MEMBERS[B] = ["class"]; MEMBERS[H] = ["class"];
  reset();
  const r4 = await sweepMemberRoles(env({ ROLE_CALL_BUDGET: "13" }), "cron");
  check(".90: a run stops before an account its Discord-call budget cannot finish: two restored of three, the stop audited once, told to staff", GRANTS.length === 2 && r4.budgetExhausted === true && r4.attempts <= 13 && r4.calls === r4.attempts && r4.retries === 0 && db.prepare("SELECT COUNT(*) AS k FROM audit WHERE action = 'role.budget_exhausted'").get().k === 1 && LOGS.some((l) => l.includes("budget")));
  check("  the rotation cursor stays at the last account finished, not at the end of the page it did not reach", lastSweep().c === GRANTS[GRANTS.length - 1] && !GRANTS.includes(H));
  NOW += THROTTLE_SECONDS + 1; reset();
  const r5 = await sweepMemberRoles(env({ ROLE_CALL_BUDGET: "13" }), "cron");
  check("  the next run continues from there, restores the third and wraps the rotation (the banned reconciliation then stops at the budget, truthfully reported)", r5 !== null && GRANTS.includes(H) && lastSweep().c === "" && r5.attempts <= 13);

  // .95 (Codex's P20 group 1): an unfinished priority account keeps its promotion: the watermark advances only through finished work
  NOW += THROTTLE_SECONDS + 1; reset();
  const LP = id(9); member(LP, { status: "left_pending", name: "lp" }); MEMBERS[LP] = ["class"]; MEMBERS[A] = ["class"]; MEMBERS[B] = ["class"];
  promoted(A, SETTLE_SECONDS + 30); promoted(B, SETTLE_SECONDS + 20); promoted(LP, SETTLE_SECONDS + 10);
  const r6 = await sweepMemberRoles(env({ ROLE_CALL_BUDGET: "13" }), "cron");
  const lpPromo = db.prepare("SELECT MAX(id) AS id FROM audit WHERE action = 'roster.member' AND details LIKE ?1").get(`%${LP}%`).id;
  check(".95: the budget stops before the third priority account (left_pending: the rotation never visits it): the watermark holds before its promotion", r6.budgetExhausted === true && GRANTS.length === 2 && !GRANTS.includes(LP) && lastSweep().a < lpPromo, JSON.stringify(lastSweep()), lpPromo);
  NOW += THROTTLE_SECONDS + 1; reset();
  await sweepMemberRoles(env(), "cron"); // the default budget: room for the rotation to wrap as well
  check("  the next run takes it first and restores it; the watermark passes its promotion; the rotation wraps", GRANTS[0] === LP && MEMBERS[LP].includes(ROLE) && lastSweep().a >= lpPromo && lastSweep().c === "", JSON.stringify(GRANTS), JSON.stringify(lastSweep()));

  // .99 (Codex's review of .95, 09:15, group 1): three left_pending promotions whose member lookups Discord does not answer (500)
  NOW += THROTTLE_SECONDS + 1; reset();
  const L1 = id(40), L2 = id(41), L3 = id(42);
  for (const did of [L1, L2, L3]) { member(did, { status: "left_pending", name: "lp" + did.slice(-2) }); MEMBERS[did] = ["class"]; }
  promoted(L1, SETTLE_SECONDS + 30); promoted(L2, SETTLE_SECONDS + 20); promoted(L3, SETTLE_SECONDS + 10);
  const aBefore = lastSweep().a;
  const savedLookup = stubs["./discord"].guildMember;
  stubs["./discord"].guildMember = async (_env, mid) => { if ([L1, L2, L3].includes(mid)) { LOOKUPS.push(mid); throw new DiscordError(500, "{}"); } return savedLookup(_env, mid); };
  const r7 = await sweepMemberRoles(env(), "cron");
  check(".99: lookups Discord does not answer leave the accounts UNFINISHED: two attempted, the run stops at the second (the bounded stop), nobody checked or granted, the watermark unchanged", r7.unfinished.length === 2 && r7.failed.length === 2 && r7.checked === 0 && GRANTS.length === 0 && lastSweep().a === aBefore && lastSweep().unfinished === 2 && LOOKUPS.filter((x) => [L1, L2, L3].includes(x)).length === 2, JSON.stringify(r7), JSON.stringify(lastSweep()), aBefore);
  stubs["./discord"].guildMember = savedLookup;
  NOW += THROTTLE_SECONDS + 1; reset();
  const r8 = await sweepMemberRoles(env(), "cron");
  check("  once Discord answers, the next run takes those promotions first and restores all three; the watermark passes them", [L1, L2, L3].every((d) => GRANTS.includes(d)) && r8.unfinished.length === 0 && lastSweep().a > aBefore, JSON.stringify(GRANTS), JSON.stringify(lastSweep()));
  check("  a 404 (not in the server) stays a finished answer: absent is counted, not unfinished", (() => { return r1.absent === 1; })());

  // Discord refuses (the bot's role cannot grant it): stop at the first 403, audit it, tell staff.
  NOW += THROTTLE_SECONDS + 1;
  MEMBERS[A] = []; MEMBERS[B] = []; reset(); GRANT_FAIL = new DiscordError(403, '{"code":50013}');
  const r3 = await sweepMemberRoles(env(), "cron");
  check("a 403 stops the sweep after the first refusal", r3.failed.length === 1 && GRANTS.length === 0);
  check("  it is audited and staff are told", db.prepare("SELECT COUNT(*) AS k FROM audit WHERE action = 'role.restore_failed'").get().k === 1 && LOGS.some((l) => l.includes("could not")));

  // A sweep that fails part-way is throttled like a finished one, so it is not retried on every 30-second poll.
  NOW += THROTTLE_SECONDS + 1;
  reset();
  const realPrepare = D1.prepare;
  D1.prepare = (sql) => { if (sql.includes("json_extract")) throw new Error("D1 hiccup"); return realPrepare(sql); };
  check("a sweep that fails part-way returns null", (await sweepMemberRoles(env(), "watcher")) === null);
  D1.prepare = realPrepare;
  check("  and leaves a role.sweep_failed row", db.prepare("SELECT COUNT(*) AS k FROM audit WHERE action = 'role.sweep_failed'").get().k === 1);
  NOW += 30;
  reset();
  check("  so the next poll, 30 seconds later, does nothing", (await sweepMemberRoles(env(), "watcher")) === null && LOOKUPS.length === 0);
  forgetLocalThrottle();
  reset();
  check("  even on a fresh isolate: the failed row in D1 throttles it", (await sweepMemberRoles(env(), "watcher")) === null && LOOKUPS.length === 0);

  // A broken database never escapes waitUntil.
  reset();
  const broken = { DB: { prepare() { throw new Error("D1 is down"); } }, ROLE_GUILD_MEMBER: ROLE };
  check("an error inside the sweep is swallowed, never thrown", (await sweepMemberRoles(broken, "cron")) === null);

  reset();
  check("no Guild Member role configured: nothing happens", (await sweepMemberRoles(env({ ROLE_GUILD_MEMBER: "" }), "cron")) === null && LOOKUPS.length === 0);

  console.log("\n== blocking roles (.55, tracker D04): no grant while held, the role taken away, given back once lifted ==");
  reset(); REMOVES = []; forgetLocalThrottle(); rolesMod.exports.forgetRolesCheck();
  const Q = id(21), R = id(22);
  member(Q, { name: "quar" }); member(R, { name: "flag" });
  MEMBERS[Q] = [BLOCK]; MEMBERS[R] = [ROLE, FLAG];
  promoted(Q, SETTLE_SECONDS + 10); promoted(R, SETTLE_SECONDS + 10);
  NOW += THROTTLE_SECONDS + 1;
  let rb = await sweepMemberRoles(env(), "cron");
  check("a quarantined member on the roster is not granted the role", !GRANTS.includes(Q) && rb.blocked.includes(Q));
  check("  and it is audited as role.blocked with the blocking role", !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.blocked' AND subject = ? AND details LIKE ?").get(Q, `%${BLOCK}%`));
  check("a member holding Guild Member and a blocking role loses Guild Member while it lasts", REMOVES.includes(R) && !MEMBERS[R].includes(ROLE) && rb.blocked.includes(R));
  check("  audited as role.blocked_removed", !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.blocked_removed' AND subject = ?").get(R));
  check("  staff see one line about the restriction", LOGS.some((l) => /withheld or removed/.test(l) && l.includes(R)));
  check("  the sweep's own audit counts them", lastSweep().blocked === 2);
  reset(); REMOVES = []; forgetLocalThrottle();
  MEMBERS[Q] = []; MEMBERS[R] = []; // the restrictions were lifted
  promoted(Q, SETTLE_SECONDS + 10); promoted(R, SETTLE_SECONDS + 10); // the roster confirms them again, so they are priority items
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("once the blocking role is gone the sweep gives Guild Member back", GRANTS.includes(Q) && GRANTS.includes(R) && rb.blocked.length === 0);
  check("with no BLOCKING_ROLE_IDS configured nothing is blocked (the guard is off, not failing)", (() => { reset(); REMOVES = []; forgetLocalThrottle(); MEMBERS[Q] = [BLOCK]; NOW += THROTTLE_SECONDS + 1; return true; })());
  rb = await sweepMemberRoles(env({ BLOCKING_ROLE_IDS: "" }), "cron");
  check("  (the member with the former blocking role keeps the role, nothing removed)", REMOVES.length === 0 && rb.blocked.length === 0);

  console.log("\n== the fail-closed configuration check (.55) ==");
  reset(); REMOVES = []; forgetLocalThrottle(); rolesMod.exports.forgetRolesCheck();
  const S = id(23); member(S, { name: "miss" }); MEMBERS[S] = []; promoted(S, SETTLE_SECONDS + 10);
  GUILD_ROLES = [BLOCK, FLAG]; // the Guild Member role id is not a role of this server
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("when ROLE_GUILD_MEMBER is not a role of the guild, nothing is granted and the run stops as misconfigured", GRANTS.length === 0 && rb.failed.some((f) => f.error === "misconfigured") && !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.misconfigured'").get());
  GUILD_ROLES = [ROLE_ID, BLOCK, FLAG];
  check("  the check is cached for the isolate: forgetting it is what a new isolate does", (await rolesMod.exports.rolesConfigured(env())) === "missing" && (rolesMod.exports.forgetRolesCheck(), (await rolesMod.exports.rolesConfigured(env())) === "ok"));
  check("  the cache is keyed by guild and role ids: a changed configuration is read afresh (.58, Codex 01:35)", (await rolesMod.exports.rolesConfigured(env({ ROLE_GUILD_MEMBER: "999999999999999998" }))) === "missing" && (await rolesMod.exports.rolesConfigured(env())) === "ok");

  console.log("\n== unknown inventory and fresh reads at the effect (.58, Codex 01:35) ==");
  reset(); REMOVES = []; forgetLocalThrottle(); rolesMod.exports.forgetRolesCheck();
  const U = id(24); member(U, { name: "unk" }); MEMBERS[U] = []; promoted(U, SETTLE_SECONDS + 10);
  const savedRest = stubs["./discord"].rest;
  stubs["./discord"].rest = async () => { const e = new DiscordError(403, "{}"); throw e; };
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("when the guild's roles cannot be read (403), nothing is granted and the run stops as unverified", GRANTS.length === 0 && rb.failed.some((f) => f.error === "unverified"));
  stubs["./discord"].rest = savedRest;
  reset(); forgetLocalThrottle();
  promoted(U, SETTLE_SECONDS + 10);
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("  the failure was not cached: the next run reads the inventory again and grants", GRANTS.includes(U));
  reset(); REMOVES = []; forgetLocalThrottle();
  const V = id(25); member(V, { name: "race" }); MEMBERS[V] = []; promoted(V, SETTLE_SECONDS + 10);
  // between the sweep's own lookup and the write, Quarantine lands on the account: the writer's fresh read sees it
  let reads = 0;
  const savedMember = stubs["./discord"].guildMember;
  stubs["./discord"].guildMember = async (_env, mid) => { reads++; if (mid === V && reads >= 2) MEMBERS[V] = [BLOCK]; return MEMBERS[mid] === undefined ? null : { roles: MEMBERS[mid] }; };
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  stubs["./discord"].guildMember = savedMember;
  check("a restriction that lands between the sweep's look and the write is seen by the writer's fresh read: no grant", !GRANTS.includes(V) && rb.blocked.includes(V));
  reset(); REMOVES = []; forgetLocalThrottle();
  const W = id(26); member(W, { name: "ban" }); MEMBERS[W] = []; promoted(W, SETTLE_SECONDS + 10);
  const savedMember2 = stubs["./discord"].guildMember;
  stubs["./discord"].guildMember = async (_env, mid) => { if (mid === W) db.prepare("UPDATE members SET banned = 1 WHERE discord_id = ?").run(W); return MEMBERS[mid] === undefined ? null : { roles: MEMBERS[mid] }; };
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  stubs["./discord"].guildMember = savedMember2;
  check("a ban written to D1 after the sweep selected the account is seen by the writer's fresh ban read: no grant", !GRANTS.includes(W));
  db.prepare("UPDATE members SET banned = 0 WHERE discord_id = ?").run(W);

  console.log("\n== a ban that lands during the PUT is undone on the spot; banned holders are reconciled (.60, Codex 01:56) ==");
  reset(); REMOVES = []; forgetLocalThrottle();
  const X = id(27); member(X, { name: "lateban" }); MEMBERS[X] = []; promoted(X, SETTLE_SECONDS + 10);
  const savedAdd = stubs["./discord"].addRole;
  stubs["./discord"].addRole = async (_env, mid, role) => { await savedAdd(_env, mid, role); if (mid === X) db.prepare("UPDATE members SET banned = 1 WHERE discord_id = ?").run(X); };
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  stubs["./discord"].addRole = savedAdd;
  check("the ban that landed while the grant was in flight is seen by the post-write read: the role is removed again at once", GRANTS.includes(X) && REMOVES.includes(X) && !MEMBERS[X].includes(ROLE) && !rb.restored.includes(X));
  check("  audited as role.revoked_after_ban", !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.revoked_after_ban' AND subject = ?").get(X));
  reset(); REMOVES = []; forgetLocalThrottle();
  const Y = id(28); member(Y, { name: "heldban", banned: 1 }); MEMBERS[Y] = [ROLE]; // a banned account still holding the role (a late PUT, or a failed removal)
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("the sweep's banned reconciliation removes Guild Member from a banned account that still holds it", REMOVES.includes(Y) && rb.revoked.includes(Y) && !MEMBERS[Y].includes(ROLE) && !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.revoked_banned' AND subject = ?").get(Y));
  check("  and the sweep's audit carries the count and a cursor of its own", lastSweep().revoked === 1 && typeof lastSweep().b === "string");
  reset(); REMOVES = []; forgetLocalThrottle();
  const Z = id(29); member(Z, { name: "stuckban", banned: 1 }); MEMBERS[Z] = [ROLE];
  const savedRemove = stubs["./discord"].removeRole;
  stubs["./discord"].removeRole = async (_env, mid) => { if (mid === Z) throw new DiscordError(500, "{}"); };
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  stubs["./discord"].removeRole = savedRemove;
  check("a removal that fails is recorded as role.revoke_pending and reported, and the next run tries again", rb.failed.some((f) => f.id === Z && f.error === "revoke failed") && !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.revoke_pending' AND subject = ?").get(Z));
  reset(); REMOVES = []; forgetLocalThrottle();
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("  (the retry succeeds once Discord answers)", REMOVES.includes(Z) && rb.revoked.includes(Z));

  console.log("\n== every banned account is reconciled, and the ban is re-read before the revoke (.63, Codex's review of .60) ==");
  reset(); REMOVES = []; forgetLocalThrottle();
  // Codex's P1: a banned holder whose role removal failed, after which roster.demote committed `left`; .60 never selected it again
  const QB = id(30); member(QB, { name: "leftban", status: "left", banned: 1 }); MEMBERS[QB] = [ROLE];
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  check("a banned account with no active character (demoted to left after a failed removal) is still reconciled: the role goes", REMOVES.includes(QB) && rb.revoked.includes(QB) && !MEMBERS[QB].includes(ROLE) && !!db.prepare("SELECT 1 FROM audit WHERE action = 'role.revoked_banned' AND subject = ?").get(QB));
  check("  nothing is granted to it", !GRANTS.includes(QB));
  reset(); REMOVES = []; forgetLocalThrottle();
  // Codex's P2: the unban completes while the member GET is in flight; the stale selection must not strip the role
  const UB = id(31); member(UB, { name: "unbanned", banned: 1 }); MEMBERS[UB] = [ROLE];
  const savedMember3 = stubs["./discord"].guildMember;
  stubs["./discord"].guildMember = async (_env, mid) => { const m = await savedMember3(_env, mid); if (mid === UB) db.prepare("UPDATE members SET banned = 0 WHERE discord_id = ?").run(UB); return m; };
  NOW += THROTTLE_SECONDS + 1;
  rb = await sweepMemberRoles(env(), "cron");
  stubs["./discord"].guildMember = savedMember3;
  check("an unban that completed during the member read is seen by the ban re-read before the revoke: the role stays", LOOKUPS.includes(UB) && !REMOVES.includes(UB) && !rb.revoked.includes(UB) && MEMBERS[UB].includes(ROLE));
  check("  and no revoke audit row names it", !db.prepare("SELECT 1 FROM audit WHERE action IN ('role.revoked_banned', 'role.revoke_pending') AND subject = ?").get(UB));
  const st = await rolesMod.exports.rolesStatus(env({ BLOCKING_ROLE_IDS: `${BLOCK},999999999999999999` }));
  check("  rolesStatus names a configured blocking role the guild does not have", st.guildMember === true && st.blockingMissing.length === 1 && st.blockingMissing[0] === "999999999999999999");
  check("  blockingRoleIds drops anything that is not a snowflake", JSON.stringify(rolesMod.exports.blockingRoleIds({ BLOCKING_ROLE_IDS: ` ${BLOCK} , nope, 12, ${FLAG}` })) === JSON.stringify([BLOCK, FLAG]));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})();
