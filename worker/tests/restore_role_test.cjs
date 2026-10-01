// Loads the REAL src/restore.ts (transpiled by TypeScript itself) with its imports stubbed.
// Run from the worker folder:  node tests/restore_role_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "restore.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

let AUDIT = [], LOGS = [], ADDS = [], SQL = [], FAIL_ADD = null, ROWS = {};
const BLOCK = "1399774654893133864";
const stubs = {
  "./db": { audit: async (_env, _actor, action, subject, detail) => { AUDIT.push({ action, subject, detail }); }, now: () => 1790500000 },
  "./discord": {
    addRole: async (_env, userId, roleId, reason) => { if (FAIL_ADD) throw FAIL_ADD; ADDS.push({ userId, roleId, reason }); },
    removeRole: async () => {},
    guildMember: async () => ({ roles: [] }),
    rest: async (_env, method, p) => { if (method === "GET" && /\/roles$/.test(p)) return [{ id: "1549581282227265566" }, { id: BLOCK }]; throw new Error("no REST in tests"); },
    logLine: async (_env, text) => { LOGS.push(text); },
    explainDiscordError: (e) => String((e && e.message) || e),
  },
};
// .55: the real roles.ts (the one role writer) behind restore.ts, with the same stubs
const rolesJs = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "roles.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const rolesMod = { exports: {} };
new Function("module", "exports", "require", rolesJs)(rolesMod, rolesMod.exports, (p) => stubs[p]);
stubs["./roles"] = rolesMod.exports;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, (p) => stubs[p]);
const { restoreMemberRole, restoreNote } = mod.exports;

const DB = { prepare: (sql) => { SQL.push(sql); return { bind: (id) => ({ first: async () => ROWS[id] ?? { n: 0, banned: null } }) }; } };
const GM = "1549581282227265566", OTHER = "1549581447768186960";
const env = (over = {}) => ({ DB, ROLE_GUILD_MEMBER: GM, GUILD_ID: "236932545793490944", BLOCKING_ROLE_IDS: BLOCK, ...over });
const reset = () => { AUDIT = []; LOGS = []; ADDS = []; SQL = []; FAIL_ADD = null; ROWS = {}; };
let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };
const A = "111111111111111111", B = "222222222222222222";

(async () => {
  reset(); ROWS[A] = { n: 1, banned: 0 };
  check("holding the role: nothing asked, nothing changed", (await restoreMemberRole(env(), A, [OTHER, GM], "status")) === "has-role" && SQL.length === 0 && ADDS.length === 0);

  reset();
  check("no roles in the payload (not a guild interaction): left alone", (await restoreMemberRole(env(), A, undefined, "status")) === "unknown" && SQL.length === 0);

  reset(); ROWS[A] = { n: 1, banned: 0 };
  const r = await restoreMemberRole(env(), A, [OTHER], "verify");
  check("a member without the role gets it back", r === "restored" && ADDS.length === 1 && ADDS[0].userId === A && ADDS[0].roleId === GM);
  check("  and it is audited as role.restored with its source", AUDIT.length === 1 && AUDIT[0].action === "role.restored" && AUDIT[0].detail.source === "verify");
  check("  and staff see one line in #server-log", LOGS.length === 1 && LOGS[0].includes(A) && /restored/.test(LOGS[0]));
  check("  and the member is told", restoreNote(r).includes("It is back now"));
  check("the lookup counts 'member' and 'left_pending' and reads the ban flag", /'member','left_pending'/.test(SQL[0]) && /banned/.test(SQL[0]));

  reset(); ROWS[B] = { n: 0, banned: null };
  check("not in the guild: no role handed out", (await restoreMemberRole(env(), B, [], "status")) === "not-member" && ADDS.length === 0);

  reset(); ROWS[A] = { n: 2, banned: 1 };
  check("banned: never given the role back", (await restoreMemberRole(env(), A, [], "status")) === "banned" && ADDS.length === 0 && AUDIT.length === 0);

  reset(); ROWS[A] = { n: 1, banned: 0 }; FAIL_ADD = new Error("Discord 403: Missing Permissions");
  const f = await restoreMemberRole(env(), A, [], "status");
  check("Discord refuses: reported as failed", f === "failed" && ADDS.length === 0);
  check("  audited as role.restore_failed with the error", AUDIT.length === 1 && AUDIT[0].action === "role.restore_failed" && /403/.test(AUDIT[0].detail.error));
  check("  staff are told in #server-log", LOGS.length === 1 && /failed/.test(LOGS[0]));
  check("  and the member hears that staff know", restoreNote(f).includes("Staff have been told"));

  reset(); ROWS[A] = { n: 1, banned: 0 };
  check("no member role configured: nothing to do", (await restoreMemberRole(env({ ROLE_GUILD_MEMBER: "" }), A, [], "status")) === "has-role" && SQL.length === 0);

  reset();
  check("a malformed user id is never used in a request", (await restoreMemberRole(env(), "abc", [], "status")) === "unknown" && SQL.length === 0);

  check("nothing to say when nothing changed", restoreNote("has-role") === "" && restoreNote("not-member") === "" && restoreNote("banned") === "");

  console.log("\n== a blocking role withholds the restore (.55, tracker D04) ==");
  reset(); ROWS[A] = { n: 1, banned: 0 };
  const rblk = await restoreMemberRole(env(), A, [OTHER, BLOCK], "status");
  check("a quarantined member on the roster gets nothing back", rblk === "blocked" && ADDS.length === 0);
  check("  audited as role.blocked naming the blocking role", AUDIT.some((a) => a.action === "role.blocked" && a.subject === A && a.detail.blockedBy === BLOCK));
  check("  and the member is told it is on hold, without naming the restriction's role", /on hold while a server restriction/.test(restoreNote(rblk)) && !restoreNote(rblk).includes(BLOCK));
  reset(); ROWS[A] = { n: 1, banned: 0 };
  check("without BLOCKING_ROLE_IDS the same roles restore as before", (await restoreMemberRole(env({ BLOCKING_ROLE_IDS: "" }), A, [OTHER, BLOCK], "status")) === "restored" && ADDS.length === 1);
  reset(); ROWS[A] = { n: 1, banned: 1 };
  check("banned still wins over blocked (checked first)", (await restoreMemberRole(env(), A, [OTHER, BLOCK], "status")) === "banned" && ADDS.length === 0);

  console.log("\n== fresh reads at the effect (.58, Codex 01:35) ==");
  reset(); ROWS[A] = { n: 1, banned: 0 };
  let fresh = [BLOCK];
  stubs["./discord"].guildMember = async () => ({ roles: fresh });
  const rr = await restoreMemberRole(env(), A, [OTHER], "status");
  check("an interaction payload without the blocking role does not decide: the writer's fresh member read sees Quarantine and refuses", rr === "blocked" && ADDS.length === 0);
  fresh = [];
  reset(); ROWS[A] = { n: 1, banned: 0 };
  stubs["./discord"].guildMember = async () => null;
  check("  a member who is no longer in the server at the fresh read gets nothing (unknown)", (await restoreMemberRole(env(), A, [OTHER], "status")) === "unknown" && ADDS.length === 0);
  stubs["./discord"].guildMember = async () => ({ roles: [] });
  reset(); ROWS[A] = { n: 1, banned: 0 };
  const savedRest = stubs["./discord"].rest;
  stubs["./discord"].rest = async () => { throw new Error("Discord 500"); };
  rolesMod.exports.forgetRolesCheck();
  check("  when the guild's roles cannot be read, the restore fails closed (failed), nothing granted", (await restoreMemberRole(env(), A, [OTHER], "status")) === "failed" && ADDS.length === 0);
  stubs["./discord"].rest = savedRest;
  reset(); ROWS[A] = { n: 1, banned: 0 };
  let bannedAfterRead = false;
  stubs["./discord"].guildMember = async () => { bannedAfterRead = true; return { roles: [] }; };
  const dbBanAware = { prepare: (sql) => { SQL.push(sql); return { bind: (id) => ({ first: async () => (/^SELECT banned FROM members WHERE discord_id = \?1$/.test(sql) ? { banned: bannedAfterRead ? 1 : 0 } : (ROWS[id] ?? { n: 0, banned: null })) }) }; } };
  check("a ban written while the member read was in flight is seen by the ban read that follows it: banned, nothing granted (.60)", (await restoreMemberRole(env({ DB: dbBanAware }), A, [OTHER], "status")) === "banned" && ADDS.length === 0);
  stubs["./discord"].guildMember = async () => ({ roles: [] });

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})();
