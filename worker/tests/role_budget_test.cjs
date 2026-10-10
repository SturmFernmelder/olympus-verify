// .95 (P-20, Codex's review of .90, 1 Oct 08:15 UTC): the role writer's budget bounds ACTUAL requests to Discord.
// Runs the REAL src/discord.ts (its rest() with the 429 retry), src/roles.ts, src/restore.ts and src/backfill.ts,
// transpiled by TypeScript, over schema.sql in SQLite; only the network is faked, at fetch(). From the worker folder:
//   node tests/role_budget_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const transpile = (name) => ts.transpileModule(fs.readFileSync(path.join(root, "src", name), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = (name, stubs) => { const m = { exports: {} }; new Function("module", "exports", "require", transpile(name))(m, m.exports, (p) => { if (!(p in stubs)) throw new Error(`no stub for ${p} in ${name}`); return stubs[p]; }); return m.exports; };

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
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
const GUILD = "236932545793490944", ROLE = "1549581282227265566", BLOCK = "1399774654893133864";
const stubs = {
  // This budget fixture has no privacy subject or rank mapping; refuse accidental expansion of its mocked lane.
  "./privacy-serving-authority": { privacyCaptureFromColumns: (_subject, row) => { if (row.privacy_generation !== null || row.privacy_state !== null) throw Error("unexpected privacy fixture"); return null; } },
  "./role-rank-continuation": { RANK_CONTINUATION_HTTP_RESERVE: 20, continueRosterRanks: async () => { throw Error("rank continuation outside legacy role-budget fixture"); } },
  "./env": { intVar: (v, d) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) ? n : d; }, staffChannel: () => "" },
  "./db": {
    now: () => NOW,
    audit: async (_env, actor, action, subject, details) => {
      db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?1, ?2, ?3, ?4, ?5)").run(NOW, actor, action, subject ?? null, details === undefined ? null : JSON.stringify(details));
    },
  },
};
const discord = load("discord.ts", stubs);
stubs["./discord"] = discord;
const roles = load("roles.ts", stubs);
stubs["./roles"] = roles;
const scheduled = load("scheduled-budget.ts", stubs);
// Keep this historical ten-account/retry scenario explicit; actual joined caps remain covered by scheduled_budget and rank integration.
stubs["./scheduled-budget"] = { ...scheduled, SCHEDULED_CAPS: { ...scheduled.SCHEDULED_CAPS, roleSweepAccounts: 10 } };
const restore = load("restore.ts", stubs);
const backfill = load("backfill.ts", stubs);

// ---- the network: every request is recorded; RATE answers the FIRST request of EVERY call with a 429 and its retry normally
// (a call is one method+path; its requests come in pairs, so the odd request of a key is the limited one): Codex's scenario
let FETCHES = [], MEMBERS = {}, RATE = false, INVENTORY_DOWN = false, BAN_ON_PUT = null, hits = new Map(), LOOKUP_FAIL = new Set();
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", key = `${method} ${u.pathname}`;
  FETCHES.push(key);
  const hit = (hits.get(key) || 0) + 1;
  hits.set(key, hit);
  if (RATE && hit % 2 === 1) return json({ message: "You are being rate limited.", retry_after: 0.001, global: false }, 429);
  let m;
  if ((m = u.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/roles$/))) return INVENTORY_DOWN ? json({ message: "down" }, 500) : json([{ id: ROLE }, { id: BLOCK }]);
  if ((m = u.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)$/)) && method === "GET") return LOOKUP_FAIL.has(m[2]) ? json({ message: "down" }, 500) : MEMBERS[m[2]] === undefined ? json({ code: 10007 }, 404) : json({ roles: MEMBERS[m[2]], user: { id: m[2], username: "u" } });
  if ((m = u.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/))) {
    const id = m[2], role = m[3];
    if (method === "PUT") { MEMBERS[id] = [...new Set([...(MEMBERS[id] || []), role])]; if (BAN_ON_PUT === id) db.prepare("UPDATE members SET banned = 1 WHERE discord_id = ?1").run(id); return new Response(null, { status: 204 }); }
    if (method === "DELETE") { MEMBERS[id] = (MEMBERS[id] || []).filter((r) => r !== role); return new Response(null, { status: 204 }); }
  }
  return json({ message: "unexpected in this suite: " + key }, 500);
};
const env = (over = {}) => ({ DB: D1, DISCORD_BOT_TOKEN: "test-token", GUILD_ID: GUILD, ROLE_GUILD_MEMBER: ROLE, BLOCKING_ROLE_IDS: BLOCK, ...over });
const id = (n) => String(400000000000000000n + BigInt(n));
function member(did, { status = "member", banned = 0, name = "m" + did.slice(-3) } = {}) {
  db.prepare("INSERT INTO members (discord_id, banned) VALUES (?1, ?2) ON CONFLICT(discord_id) DO UPDATE SET banned = ?2").run(did, banned);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?1, ?2, ?3, ?4, 1)").run(name.toLowerCase(), name, did, status);
}
const reset = () => { FETCHES = []; hits = new Map(); LOOKUP_FAIL = new Set(); RATE = false; INVENTORY_DOWN = false; BAN_ON_PUT = null; roles.forgetRolesCheck(); restore.forgetLocalThrottle(); NOW += 601; };
const roleWriterFetches = () => FETCHES.filter((k) => /\/guilds\//.test(k)).length;
const lastAudit = (action) => { const r = db.prepare("SELECT details FROM audit WHERE action = ?1 ORDER BY id DESC LIMIT 1").get(action); return r ? JSON.parse(r.details) : null; };
const audits = (action) => db.prepare("SELECT COUNT(*) AS k FROM audit WHERE action = ?1").get(action).k;
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };

(async () => {
  console.log("== rest(): the 429 retry is a request of the budget ==");
  reset(); RATE = true;
  let b = { limit: 10, attempts: 0, retries: 0 };
  let r = await discord.rest(env(), "GET", `/guilds/${GUILD}/roles`, undefined, 0, undefined, b);
  check("a 429 answered by a retry: two requests, the retry counted as an attempt and a retry", Array.isArray(r) && FETCHES.length === 2 && b.attempts === 1 && b.retries === 1);
  reset(); RATE = true;
  b = { limit: 1, attempts: 1, retries: 0 };
  let threw = null;
  try { await discord.rest(env(), "DELETE", `/guilds/${GUILD}/members/${id(1)}/roles/${ROLE}`, undefined, 0, "x", b); } catch (e) { threw = e; }
  check("at the limit, a retry the run cannot afford is not made: the 429 is the call's failure (one request)", threw instanceof discord.DiscordError && threw.status === 429 && FETCHES.length === 1 && b.attempts === 1 && b.retries === 0);
  reset(); RATE = true;
  b = { limit: 1, attempts: 1, retries: 0 };
  await discord.removeRole(env(), id(1), ROLE, "mandatory", b, true);
  check("  a MANDATORY removal retries whatever is left, counted: two requests, attempts 2", FETCHES.length === 2 && b.attempts === 2 && b.retries === 1);
  reset();
  b = { limit: 10, attempts: 0, retries: 0 };
  await discord.guildMember(env(), id(1), b);
  check("  without a 429 nothing is counted by rest() itself (the caller counts the call)", FETCHES.length === 1 && b.attempts === 0 && b.retries === 0);

  console.log("\n== the sweep under Codex's scenario: ten members lacking the role, every route 429 then 200, budget 40 ==");
  const TEN = Array.from({ length: 10 }, (_, k) => id(10 + k));
  for (const did of TEN) { member(did); MEMBERS[did] = []; }
  reset(); RATE = true;
  let s = await restore.sweepMemberRoles(env({ ROLE_CALL_BUDGET: "40", ROLE_SWEEP_PER_RUN: "10" }), "cron");
  const grantedNow = TEN.filter((d) => MEMBERS[d].includes(ROLE));
  check("the run makes no more requests than its budget: every request through the role writer is counted, retries included", roleWriterFetches() === s.attempts && s.attempts <= 40, roleWriterFetches(), JSON.stringify(s));
  check("  requests, logical calls and retries are distinguished in the result (38 requests = 19 calls + 19 retries: the inventory, then look, fresh look and PUT per account)", s.attempts === 38 && s.calls === 19 && s.retries === 19, JSON.stringify(s));
  check("  six accounts fully handled (each granted), none half-handled, the stop truthful", grantedNow.length === 6 && s.restored.length === 6 && s.budgetExhausted === true && s.checked === 6, grantedNow.length);
  const sweepRow = lastAudit("role.sweep"), stopRow = lastAudit("role.budget_exhausted");
  check("  the receipts carry attempts, calls and retries (role.sweep and role.budget_exhausted)", sweepRow.attempts === 38 && sweepRow.calls === 19 && sweepRow.retries === 19 && sweepRow.stopped === true && stopRow.attempts === 38 && stopRow.calls === 19 && stopRow.retries === 19 && stopRow.limit === 40, JSON.stringify({ sweepRow, stopRow }));
  check("  the rotation cursor is the last account finished", sweepRow.c === grantedNow[grantedNow.length - 1]);
  reset(); RATE = true;
  s = await restore.sweepMemberRoles(env({ ROLE_CALL_BUDGET: "40", ROLE_SWEEP_PER_RUN: "10" }), "cron");
  check("the next run finishes the other four within its budget (the inventory read again: the ten minutes passed)", TEN.every((d) => MEMBERS[d].includes(ROLE)) && s.restored.length === 4 && s.attempts <= 40 && roleWriterFetches() === s.attempts, JSON.stringify(s));
  reset();
  s = await restore.sweepMemberRoles(env({ ROLE_CALL_BUDGET: "40", ROLE_SWEEP_PER_RUN: "10" }), "cron");
  check("  with the roles in place a sweep costs one request per account and no retries", s.attempts === 10 && s.calls === 10 && s.retries === 0 && s.budgetExhausted === false, JSON.stringify(s));

  console.log("\n== the inventory read is a request of the run; a run that asked in vain does not ask again ==");
  const FIVE = Array.from({ length: 5 }, (_, k) => id(30 + k));
  for (const did of FIVE) { member(did); MEMBERS[did] = []; }
  reset(); INVENTORY_DOWN = true;
  const budget = roles.callBudget(env({ ROLE_CALL_BUDGET: "40" }));
  const outcomes = [];
  for (const did of FIVE) outcomes.push(await roles.grantMemberRole(env(), did, "r", "promote", undefined, budget));
  check("five grants in one run while Discord does not answer the inventory: ONE inventory request, every grant unverified, nothing granted, the budget charged once", FETCHES.filter((k) => /\/roles$/.test(k)).length === 1 && outcomes.every((o) => o === "unverified") && budget.attempts === 1 && budget.calls === 1 && budget.inventoryFailed === true && FIVE.every((d) => !MEMBERS[d].includes(ROLE)), JSON.stringify({ outcomes, budget, FETCHES }));
  reset();
  const budget2 = roles.callBudget(env());
  check("  the next run asks again (the failure was never cached) and grants", (await roles.grantMemberRole(env(), FIVE[0], "r", "promote", undefined, budget2)) === "granted" && FETCHES.filter((k) => /\/roles$/.test(k)).length === 1 && budget2.attempts === 3 && budget2.calls === 3, JSON.stringify({ budget2, FETCHES }));
  const budget3 = roles.callBudget(env());
  check("  a grant while the ten-minute copy is valid costs no inventory request (two requests: the fresh look and the PUT)", (await roles.grantMemberRole(env(), FIVE[1], "r", "promote", undefined, budget3)) === "granted" && budget3.attempts === 2 && roles.inventoryCalls(env(), budget3) === 0, JSON.stringify(budget3));
  reset(); INVENTORY_DOWN = true;
  s = await restore.sweepMemberRoles(env({ ROLE_CALL_BUDGET: "40" }), "cron");
  check("the sweep with the inventory down: one inventory request beyond the looks, then it stops as unverified (the same answer for everyone), the account kept for the next run, no budget stop", FETCHES.filter((k) => /\/roles$/.test(k)).length === 1 && s.attempts === s.checked + 1 && s.retries === 0 && s.failed.length === 1 && s.failed[0].error === "unverified" && s.restored.length === 0 && s.budgetExhausted === false && FIVE.slice(2).every((d) => !MEMBERS[d].includes(ROLE)), JSON.stringify(s), JSON.stringify(FETCHES));

  console.log("\n== the mandatory removal after a ban is reserved before the PUT and counted ==");
  const LB = id(50); member(LB); MEMBERS[LB] = [];
  reset();
  await roles.rolesConfigured(env()); // the copy is warm
  FETCHES = [];
  BAN_ON_PUT = LB;
  const budget4 = roles.callBudget(env({ ROLE_CALL_BUDGET: "6" }));
  const o4 = await roles.grantMemberRole(env(), LB, "r", "promote", undefined, budget4);
  check("a ban that lands during the PUT: the role is removed again at once; the look, the PUT and the removal are three counted requests", o4 === "banned" && !MEMBERS[LB].includes(ROLE) && budget4.attempts === 3 && budget4.calls === 3 && FETCHES.length === 3 && audits("role.revoked_after_ban") === 1, JSON.stringify({ o4, budget4, FETCHES }));
  db.prepare("UPDATE members SET banned = 0 WHERE discord_id = ?1").run(LB);
  reset();
  await roles.rolesConfigured(env());
  const budget5 = roles.callBudget(env({ ROLE_CALL_BUDGET: "5" }));
  budget5.attempts = 2; // two requests already spent by the run: three left, the PUT and its possible removal (with retries) need four
  const o5 = await roles.grantMemberRole(env(), LB, "r", "promote", undefined, budget5);
  check("  a grant whose PUT and owed removal cannot both be afforded is refused BEFORE the PUT: budget, nothing granted, the stop audited", o5 === "budget" && !MEMBERS[LB].includes(ROLE) && budget5.exhausted === true && audits("role.budget_exhausted") >= 1, JSON.stringify({ o5, budget5 }));
  db.prepare("UPDATE members SET banned = 0 WHERE discord_id = ?1").run(LB);
  reset(); RATE = true;
  await roles.rolesConfigured(env());
  FETCHES = []; hits = new Map();
  BAN_ON_PUT = LB;
  const budget6 = roles.callBudget(env({ ROLE_CALL_BUDGET: "8" }));
  const o6 = await roles.grantMemberRole(env(), LB, "r", "promote", undefined, budget6);
  check("  with every route rate-limited once the removal still happens (its retry is mandatory): six requests, three calls, three retries, within the eight reserved", o6 === "banned" && !MEMBERS[LB].includes(ROLE) && budget6.attempts === 6 && budget6.calls === 3 && budget6.retries === 3 && FETCHES.length === 6, JSON.stringify({ o6, budget6, FETCHES }));
  db.prepare("UPDATE members SET banned = 0 WHERE discord_id = ?1").run(LB);

  console.log("\n== the backfill page: examined, finished and next tell the truth when the budget stops it ==");
  const PAGE = Array.from({ length: 5 }, (_, k) => id(60 + k));
  for (const did of PAGE) { member(did); MEMBERS[did] = []; }
  reset();
  await roles.rolesConfigured(env());
  const bq = (q) => backfill.backfillOptions(new URLSearchParams(q));
  let out = await backfill.backfillRoles(env({ ROLE_CALL_BUDGET: "13" }), bq(`apply=1&limit=10&after=${id(59)}`));
  check("apply, budget 13, five members lacking the role: two granted (each three requests, reserved at eight), examined 2 of the 5 selected, not finished, next continues after the second", out.granted === 2 && out.examined === 2 && out.selected === 5 && out.finished === false && out.cursor === PAGE[1] && out.next.includes(`after=${PAGE[1]}`) && /budget/.test(out.note) && out.attempts === 6 && out.calls === 6, JSON.stringify(out));
  reset();
  await roles.rolesConfigured(env());
  out = await backfill.backfillRoles(env({ ROLE_CALL_BUDGET: "5" }), bq(`limit=10&after=${id(59)}`));
  check("a dry run reserves one call (two requests) per account: with five, four are looked at, the fifth not afforded; next after the fourth, nothing granted", out.examined === 4 && out.wouldGrant === 2 && out.alreadyHad === 2 && out.finished === false && out.cursor === PAGE[3] && out.granted === 0 && out.attempts === 4, JSON.stringify(out));
  reset();
  await roles.rolesConfigured(env());
  out = await backfill.backfillRoles(env({ ROLE_CALL_BUDGET: "40" }), bq(`apply=1&limit=10&after=${id(59)}`));
  check("with room for the whole short page it finishes: examined 5, finished, no next, the three remaining granted", out.examined === 5 && out.granted === 3 && out.finished === true && out.next === null && PAGE.every((d) => MEMBERS[d].includes(ROLE)), JSON.stringify(out));

  console.log("\n== .99 (Codex's review of .95, group 2): a lookup Discord does not answer stops the page at that account ==");
  const THREE = Array.from({ length: 3 }, (_, k) => id(70 + k));
  for (const did of THREE) { member(did); MEMBERS[did] = []; }
  reset();
  await roles.rolesConfigured(env());
  LOOKUP_FAIL = new Set([THREE[1]]);
  out = await backfill.backfillRoles(env({ ROLE_CALL_BUDGET: "40" }), bq(`apply=1&limit=10&after=${id(69)}`));
  check("the second account's lookup answers 500: the page stops there, one examined and granted, not finished, next continues AT the unanswered account, the note says why", out.examined === 1 && out.granted === 1 && out.finished === false && out.cursor === THREE[0] && out.next.includes(`after=${THREE[0]}`) && /did not answer a member lookup \(500\)/.test(out.note) && out.failed.length === 1 && out.failed[0].id === THREE[1] && !MEMBERS[THREE[2]].includes(ROLE), JSON.stringify(out));
  reset();
  await roles.rolesConfigured(env());
  LOOKUP_FAIL = new Set(THREE);
  out = await backfill.backfillRoles(env({ ROLE_CALL_BUDGET: "40" }), bq(`apply=1&limit=10&after=${id(69)}`));
  check("  every lookup unanswered: nothing examined, not finished, next is the same page (never a finished page of failures)", out.examined === 0 && out.finished === false && out.cursor === id(69) && out.failed.length === 1 && out.granted === 0, JSON.stringify(out));
  reset();
  await roles.rolesConfigured(env());
  out = await backfill.backfillRoles(env({ ROLE_CALL_BUDGET: "40" }), bq(`apply=1&limit=10&after=${THREE[0]}`));
  check("  once Discord answers, the continuation from the cursor finishes the two remaining accounts", out.examined === 2 && out.granted === 2 && out.finished === true && THREE.every((d) => MEMBERS[d].includes(ROLE)), JSON.stringify(out));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
