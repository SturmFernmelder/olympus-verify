// Loads the REAL src/dm.ts (transpiled by TypeScript itself) with its imports stubbed, and checks what reaches Discord.
// Run from the worker folder:  node tests/notices_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "dm.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

let AUDIT = [], POSTS = [], LOGS = [], NOW = 1790380800, FAIL_POST = false;
const stubs = {
  // Legacy notice delivery uses a captured absent subject; native privacy/custody suites qualify the real adapters.
  "./privacy-serving-authority": { readPrivacySubject: async () => null },
  "./privacy-provider-messages": { postPrivacyMessage: async (env, _kind, channel, payload) => { await stubs["./discord"].postMessage(env, channel, payload); return true; } },
  "./db": { now: () => NOW, audit: async (_env, _actor, action, target, detail) => { AUDIT.push({ action, target, detail, ts: NOW }); } },
  "./env": { intVar: (v, d) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) ? n : d; } },
  "./discord": {
    postMessage: async (_env, channel, payload) => { if (FAIL_POST) throw Object.assign(new Error("Discord 403"), { status: 403 }); POSTS.push({ channel, ...payload }); },
    logLine: async (_env, text) => { LOGS.push(text); },
    explainDiscordError: (e) => String(e),
  },
};
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, (p) => stubs[p]);
const { notify, noticeBatch, flushNotices, composeNotices } = mod.exports;

const DB = { prepare: (sql) => ({ bind: (since) => ({ first: async () => {
  const action = (sql.match(/action = '([^']+)'/) || [])[1];
  return { n: AUDIT.filter((a) => a.action === action && a.ts > since).length };
} }) }) };
const env = (over = {}) => ({ DB, CHANNEL_NOTICES: "1550000000000000001", NOTICE_RATE_CAP: "10", ...over });
const reset = () => { AUDIT = []; POSTS = []; LOGS = []; FAIL_POST = false; };
let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };
const A = "111111111111111111", B = "222222222222222222", C = "333333333333333333";

(async () => {
  // --- what is public, what is not ---
  const posts = composeNotices([
    { userId: A, content: "Welcome to Olympus — **Tater Toe** is on the guild roster.", kind: "welcome" },
    { userId: B, content: "Your application for **Secret Sam** was not approved.", kind: "review" },
    { userId: C, content: "Your guild invite for **Cee** was declined.", kind: "invite declined" },
    { userId: B, content: "another private thing", kind: "invite refused: in another guild" },
  ]);
  check("public and private notices become separate posts", posts.length === 2);
  check("the welcome is said in full, with a mention", posts[0].content === `<@${A}> Welcome to Olympus — **Tater Toe** is on the guild roster.`);
  const all = posts.map((p) => p.content).join("\n");
  check("private details never reach the channel (denied / declined / names)", !/not approved|declined|Secret Sam|Cee|another guild/.test(all));
  check("private post points to /verify-status", posts[1].content.includes("/verify-status"));
  check("a member with two private notices is mentioned once", (posts[1].content.match(new RegExp(B, "g")) || []).length === 1);
  check("each post may ping exactly the members it names", JSON.stringify(posts[1].users.sort()) === JSON.stringify([B, C].sort()));
  check("an unknown future kind is private by default", composeNotices([{ userId: A, content: "x", kind: "something new" }])[0].content.includes("/verify-status"));

  // --- chunking: never more than 20 pings in one post ---
  const many = Array.from({ length: 45 }, (_, i) => ({ userId: String(100000000000000000n + BigInt(i)), content: `Welcome — **P${i}**.`, kind: "welcome" }));
  const chunked = composeNotices(many);
  check("45 welcomes -> 3 posts of at most 20 mentions each", chunked.length === 3 && chunked.every((p) => p.users.length <= 20));
  check("every post stays under 1900 characters", chunked.every((p) => p.content.length <= 1900));

  // --- a roster sync: ten promotions, ONE post ---
  reset();
  const batch = noticeBatch();
  for (let i = 0; i < 10; i++) await notify(env(), String(200000000000000000n + BigInt(i)), `Welcome — **W${i}**.`, "welcome", batch);
  check("batched notices post nothing until flushed", POSTS.length === 0);
  await flushNotices(env(), batch);
  check("ten promotions in one sync -> exactly one post", POSTS.length === 1 && POSTS[0].users === undefined && POSTS[0].allowed_mentions.users.length === 10);
  check("mentions are locked to users: no @everyone, @here or roles", JSON.stringify(POSTS[0].allowed_mentions.parse) === "[]");
  check("posted to the configured channel", POSTS[0].channel === "1550000000000000001");

  // --- single notice posts immediately ---
  reset();
  await notify(env(), A, "Thanks — **Tater** is back in the invite queue at position 3.", "resumed after leaving guild");
  check("a lone notice posts at once", POSTS.length === 1 && POSTS[0].content.startsWith(`<@${A}>`));
  check("  .90 (P-19): a notice that is not the welcome is reduced to the private text in the channel; the detail is for /verify-status", POSTS[0].content.includes("/verify-status") && !POSTS[0].content.includes("invite queue"));
  reset();
  await notify(env(), A, "A seat was freed.", "seat-freed");
  check("  a freed seat likewise", POSTS.length === 1 && POSTS[0].content.includes("/verify-status") && !POSTS[0].content.includes("seat"));

  // --- the cap: dropped, never queued, one log line ---
  reset();
  for (let i = 0; i < 10; i++) AUDIT.push({ action: "notice.posted", ts: NOW });
  await notify(env(), A, "x", "welcome"); await notify(env(), B, "y", "welcome");
  check("over the per-minute cap: nothing posted", POSTS.length === 0);
  check("  each drop audited", AUDIT.filter((a) => a.action === "notice.suppressed").length === 2);
  check("  one log line per window, not one per drop", LOGS.length === 1 && LOGS[0].includes("dropped, not queued"));

  // --- no channel configured: nothing posted anywhere, gap audited ---
  reset();
  const r = await notify(env({ CHANNEL_NOTICES: "" }), A, "x", "welcome");
  check("no channel: returns false, posts nothing", r === false && POSTS.length === 0);
  check("  and says so in the audit", AUDIT.some((a) => a.action === "notice.no_channel"));

  // --- hostile input ---
  reset();
  check("a non-snowflake user id is refused (no mention-syntax injection)", (await notify(env(), "@everyone", "x", "welcome")) === false && POSTS.length === 0);

  // --- failure must not escape a finally block ---
  reset(); FAIL_POST = true;
  const b2 = noticeBatch(); await notify(env(), A, "x", "welcome", b2);
  let threw = false; try { await flushNotices(env(), b2); } catch { threw = true; }
  check("flushNotices never throws, even when Discord refuses", !threw);
  check("  the failure is audited and logged once", AUDIT.some((a) => a.action === "notice.failed") && LOGS.length === 1);

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})();
