// The Verify button and /verify, end to end through the REAL src/interactions.ts and src/ingest.ts against the REAL
// schema (node:sqlite): press the button, read the reply a member sees, whisper the code as the watcher would relay
// it, and check who got linked. Only Discord's HTTP side (role grants, messages) is stubbed.
// Run from the worker folder:  node tests/verify_button_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

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
      run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      // like D1, a batch reports each statement as { meta: { changes, last_row_id } }
      _exec: () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return api;
  },
  batch: async (stmts) => { db.exec("BEGIN"); try { const o = stmts.map((s) => s._exec()); db.exec("COMMIT"); return o; } catch (e) { db.exec("ROLLBACK"); throw e; } },
};

let VERIFIED = [];
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
// discord.ts is real (reply, json, userOf, option are pure), with fetch refused so nothing can reach Discord.
globalThis.fetch = async () => { throw new Error("no network in tests"); };
const stubs = {
  "./review": { onVerified: async (_env, pending, source) => { VERIFIED.push({ ...pending, source }); }, approvePending: async () => ({}), denyPending: async () => ({}) },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
};
const cache = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const { handleInteraction } = load("./interactions");
const { postVerify } = load("./ingest");
const { recordRelay } = load("./relays");

const GUILD = "1549537348516188200", A = "111111111111111111", B = "222222222222222222";
const env = { DB: D1, GUILD_ID: GUILD, VERIFY_SECRET: "button-test-secret", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROLE_GUILD_MEMBER: "1549581282227265566", CHANNEL_VISITOR_CHAT: "" };
const button = (user) => ({ type: 3, guild_id: GUILD, data: { custom_id: "guide:verify" }, member: { user: { id: user }, roles: [] } });
const slash = (user, character) => ({ type: 2, guild_id: GUILD, data: { name: "verify", options: character ? [{ name: "character", type: 3, value: character }] : [] }, member: { user: { id: user }, roles: [] } });
const content = async (res) => (await res.json()).data.content;
let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };

(async () => {
  console.log("== until an upgraded officer PC has checked in, the button asks for the character ==");
  const early = await (await handleInteraction(env, button(A))).json();
  check("no relay has reported addon 0.6.0 yet: the name form opens, as before 27 Sep", early.type === 9 && early.data.custom_id === "guide:verify-modal");
  check("  and no request code was minted", db.prepare("SELECT COUNT(*) AS n FROM pending").get().n === 0);
  // the officer's watcher reports in, with the addon's login note behind it
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: false, version: "0.6.0", addon: "0.6.0" });

  console.log("\n== the button: a code and the whole line to paste, nothing typed ==");
  const first = await content(await handleInteraction(env, button(A)));
  const code = (first.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  check("the button answers with a 7-symbol request code", !!code);
  check("  and the exact line to paste in game", first.includes("```\n/w Fern Melder !verify " + code + "\n```"));
  check("  from whichever character should be linked", first.includes("any of yours"));
  check("  nobody online: the reply says so, with how long the code holds", first.includes("No officer is online right now"));
  const again = await content(await handleInteraction(env, button(A)));
  check("pressing it again shows the same code, not a new one", again.includes(code) && db.prepare("SELECT COUNT(*) AS n FROM pending WHERE discord_id = ?1").get(A).n === 1);
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: null, version: "0.6.0", addon: "0.6.0" });
  const unsure = await content(await handleInteraction(env, button(A)));
  check("the watcher cannot tell (.62): the reply names Fern Melder without claiming anyone is online or that nobody is", unsure.includes("/w Fern Melder !verify " + code) && unsure.includes("Send it while Fern Melder") && !unsure.includes("No officer is online") && !unsure.includes("is online now"));

  console.log("\n== presence: the reply names who is online ==");
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0", addon: "0.6.0" });
  const online = await content(await handleInteraction(env, button(A)));
  check("online: the reply says Fern Melder is online now", online.includes("**Fern Melder** is online now"));
  await recordRelay(env, { officer: "alt officer", character: "Alt Officer", online: true, version: "0.5.9" });
  const onlyCapable = await content(await handleInteraction(env, button(A)));
  check("  an officer whose addon predates request codes is not named for one", !onlyCapable.includes("Alt Officer"));

  console.log("\n== the whisper decides the character ==");
  const r = await postVerify(env, { character: "Kira Moonfall", code, source: "whisper" });
  check("the watcher's relay of the whisper links Kira Moonfall to this account", (await r.json()).result === "verified" && db.prepare("SELECT discord_id FROM characters WHERE name_key = 'kira moonfall'").get().discord_id === A);
  check("  and her invite is queued under her name", VERIFIED.length === 1 && VERIFIED[0].name === "Kira Moonfall");
  const status = await content(await handleInteraction(env, { type: 3, guild_id: GUILD, data: { custom_id: "guide:status" }, member: { user: { id: A }, roles: [] } }));
  check("My status shows the character, no dangling code", status.includes("Kira Moonfall") && !status.includes("any of your characters"));
  const next = await content(await handleInteraction(env, button(A)));
  const code2 = (next.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  check("after it is used, the button gives a fresh code for another character", code2 && code2 !== code);

  console.log("\n== /verify with and without a character ==");
  const bare = await content(await handleInteraction(env, slash(A)));
  check("/verify with nothing typed behaves like the button", bare.includes(code2));
  const named = await content(await handleInteraction(env, slash(A, "Thrall")));
  check("/verify Thrall gives a 6-symbol code bound to Thrall", /Your code for \*\*Thrall\*\*: `[A-Z2-9]{6}`/.test(named) && named.includes("logged in as **Thrall**"));

  console.log("\n== a verification ban closes the account's open codes ==");
  const OFFICER = "1549581384035893328";
  env.ROLE_OFFICER = OFFICER;
  const pressB = await content(await handleInteraction(env, button(B)));
  const codeB = (pressB.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  check("B holds an open request code", !!codeB);
  await handleInteraction(env, {
    type: 2, guild_id: GUILD, member: { user: { id: A }, roles: [OFFICER] },
    data: { name: "olympus-admin", options: [{ type: 1, name: "ban", options: [{ name: "user", type: 6, value: B }, { name: "reason", type: 3, value: "test" }] }] },
  });
  check("the ban closes it", db.prepare("SELECT consumed_source FROM pending WHERE discord_id = ?1 ORDER BY id DESC").get(B).consumed_source === "banned");
  const late = await (await postVerify(env, { character: "Banned Late", code: codeB, source: "whisper" })).json();
  check("  so a whisper of it afterwards links nothing", late.result !== "verified" && !db.prepare("SELECT 1 FROM characters WHERE name_key = 'banned late'").get());

  console.log("\n== the guide promises only what the config delivers (.51/.52, Codex 00:38 and the content candidate) ==");
  const { guideMessage } = load("./guide");
  const guideText = (e) => JSON.stringify(guideMessage(e));
  const off = guideText({ ...env, SET_NICKNAME: "false" });
  check("with the role configured and nicknames off, the guide names the role, the roster and the access checks, and no nickname", /Olympus Guild Member\*\* role opens the member channels once your verified character appears on the officer-exported guild roster and the access checks pass/.test(off) && !/nickname/i.test(off));
  check("  with nicknames on, the nickname is described as staff-enabled", /When enabled by guild staff, your Discord nickname updates/.test(guideText({ ...env, SET_NICKNAME: "true" })));
  check("  with no role, no role sentence and the plain title", !/Guild Member/.test(guideText({ ...env, ROLE_GUILD_MEMBER: "" })) && /"title":"Join Olympus"/.test(guideText({ ...env, ROLE_GUILD_MEMBER: "" })));
  check("  under review mode an officer reviews before the invite queues; under auto it queues", /officer reviews the confirmed request before your invite enters the queue/.test(guideText({ ...env, ADMISSION_MODE: "review" })) && /your invite enters the queue; an officer sends it/.test(off));
  check("  the website is called optional, Battle.net is not promised (.114: its sign-in is switched off), codes private, no DM, and no #help-desk anywhere", /The website is optional for this verification flow/.test(off) && !/Battle\.net/.test(off) && /never sends you a DM/.test(off) && !/help-desk/.test(off) && !/olympus-2-x/.test(off));
  check("  the overflow guilds are sent to the configured visitors channel", /<#555000000000000009>/.test(guideText({ ...env, CHANNEL_VISITOR_CHAT: "555000000000000009" })) && /the visitors channel/.test(off));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
