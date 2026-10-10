// Actual shared module, guide/intros and Worker page/API projections against the real schema and node:sqlite.
// Synthetic identities only. No network, mutable profile selection or provider effect.
const fs = require("fs"), path = require("path"), ts = require("typescript"), assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, ".."), cache = {};
function load(name) {
  const relative = name.replace(/^\.\//, "");
  if (cache[relative]) return cache[relative].exports;
  const mod = { exports: {} }; cache[relative] = mod;
  const source = fs.readFileSync(path.join(root, "src", relative + ".ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", code)(mod, mod.exports, (p) => load("./" + path.posix.normalize(path.posix.join(path.posix.dirname(relative), p))));
  return mod.exports;
}
let n = 0;
const check = (name, predicate) => { assert.ok(predicate, name); n++; console.log("PASS " + name); };
globalThis.fetch = async () => { throw new Error("No provider access in ruleset tests"); };
const profile = load("./ruleset-profile"), data = load("./site-data"), guide = load("./guide"), intros = load("./intros");
const current = profile.currentRulesetProfile(), label = profile.rulesetLabel();
check("exact closed public-beta profile", JSON.stringify(current) === JSON.stringify({ schema: "olympus-ruleset-profile-v1", revision: "forever-beta-pvp2-v1", phase: "beta", game: "World of Warcraft: Forever", guild: "Olympus", realm: "Classic Beta PvP 2", ruleset: "PvP", faction: "Alliance" }));
check("current profile is frozen and parser returns a separate frozen projection", Object.isFrozen(current) && Object.isFrozen(profile.parseRulesetProfile(current)) && profile.parseRulesetProfile(current) !== current);
const bad = [null, [], {}, "beta", { ...current, phase: true }, { ...current, phase: "release" }, { ...current, faction: "Other" }, { ...current, ruleset: "Other" }, { ...current, realm: "" }, { ...current, realm: " "+current.realm }, { ...current, realm: "x".repeat(81) }, { ...current, realm: "<script>x</script>" }, { ...current, realm: "@everyone" }, { ...current, realm: "A\nB" }, { ...current, realm: "A\u200bB" }, { ...current, revision: "../secret" }, { ...current, game: "Other" }, { ...current, guild: "Other" }, { ...current, extra: "SYNTHETIC_PRIVATE_SENTINEL" }, Object.assign(Object.create({ inherited: true }), current)];
for (const [i, value] of bad.entries()) check(`invalid closed profile ${i + 1} refused`, profile.parseRulesetProfile(value) === null);
let getterCalls = 0;
const accessor = { ...current }; Object.defineProperty(accessor, "realm", { get() { getterCalls++; return current.realm; }, enumerable: true });
check("untrusted accessor is refused without invoking it", profile.parseRulesetProfile(accessor) === null && getterCalls === 0);
const symbol = { ...current }; symbol[Symbol("extra")] = 1;
check("non-string extra key refused", profile.parseRulesetProfile(symbol) === null);
const synthetic = profile.parseRulesetProfile({ ...current, phase: "full_release", revision: "synthetic-future-v1", realm: "Synthetic Future Realm", ruleset: "Normal", faction: "Horde" });
check("synthetic future shape can be inspected without changing current profile", synthetic && profile.rulesetLabel(synthetic).includes("Synthetic Future Realm") && profile.currentRulesetProfile() === current);
for (const target of ["full_release", synthetic, true, "beta", null]) check("shape/request input never opens activation: " + (typeof target), profile.rulesetSwitchReadiness(target).available === false && profile.rulesetSwitchReadiness(target).futureProfileConfigured === false && profile.currentRulesetProfile() === current);
check("public meta uses shared revision and explicitly unavailable switch", data.meta().ruleset === current && data.meta().rulesetSwitch.code === "full_release_unavailable" && data.meta().rulesetSwitch.ownerEligibilityQualified === false && data.meta().rulesetSwitch.projectionSyncQualified === false);
const guideEnv = { OFFICER_CHARACTERS: "Synthetic Officer", ADMISSION_MODE: "review", ROLE_GUILD_MEMBER: "700000000000000003", SET_NICKNAME: "true", SET_GUILD_NOTE: "false", CHANNEL_VISITOR_CHAT: "700000000000000004", RULESET_PROFILE: JSON.stringify(synthetic), FUTURE_IDENTITY: "SYNTHETIC_PRIVATE_SENTINEL" };
const reviewGuide = guide.guideMessage(guideEnv), reviewText = reviewGuide.embeds[0].description;
check("real guide projects shared beta and ignores arbitrary future environment fields", reviewText.includes(label) && !JSON.stringify(reviewGuide).includes("SYNTHETIC_PRIVATE_SENTINEL") && !reviewText.includes("Synthetic Future Realm"));
check("guide preserves officer review, checked-roster role, enabled nickname and visitor semantics", reviewText.includes("officer reviews") && reviewText.includes("officer-exported guild roster") && reviewText.includes("nickname updates") && reviewText.includes("<#700000000000000004>"));
const simpleText = guide.guideMessage({ ...guideEnv, ADMISSION_MODE: "auto", ROLE_GUILD_MEMBER: "", SET_NICKNAME: "false" }).embeds[0].description;
check("guide auto/unconfigured paths retain original conditional claims", !simpleText.includes("officer reviews") && !simpleText.includes("Guild Member** role") && !simpleText.includes("nickname updates") && simpleText.includes(label));
check("guide preserves no-DM and empty mention policy", reviewText.includes("never sends you a DM") && JSON.stringify(reviewGuide.allowed_mentions) === '{"parse":[]}');
const identityIntros = intros.INTROS.filter(i => ["olympus-info", "guild-announcements"].includes(i.key));
for (const intro of identityIntros) check("real intro projects same profile: " + intro.key, JSON.stringify(intros.renderEmbeds(intro, {})).includes(label));
for (const intro of intros.INTROS) check("real intro within Discord limits: " + intro.key, intros.validateEmbeds(intros.renderEmbeds(intro, {})).length === 0);
check("original fixed ruleset/faction decision retained in guild announcement", intros.INTROS.find(i => i.key === "guild-announcements").embeds[0].description.includes("(decided 16 September 2026)"));

function d1(db) {
  const prepare = sql => {
    let args = [];
    const run = () => { const st = db.prepare(sql); if (st.columns().length) return { results: st.all(...args), meta: { changes: 0 } }; const r = st.run(...args); return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; };
    const statement = { bind(...p) { assert.ok(p.length <= 100); args = p; return statement; }, first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => run(), _run: run };
    return statement;
  };
  return { prepare, batch: async statements => { db.exec("BEGIN"); try { const results = statements.map(s => s._run()); db.exec("COMMIT"); return results; } catch(e) { db.exec("ROLLBACK"); throw e; } } };
}
(async () => {
  const db = new DatabaseSync(":memory:"); db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  const userId = "700000000000000001", env = { DB: d1(db), COOKIE_SECRET: "synthetic-ruleset-cookie-secret-only", VERIFY_SECRET: "synthetic-ruleset-verify-secret", GUILD_ID: "700000000000000002", SITE_GUILD_ID: "700000000000000002", SITE_HOST: "guild.example", SITE_ADMINS: userId, COMMUNITY_FEATURES: "", ROLE_GUILD_MEMBER: "", ADMISSION_MODE: "review", SET_NICKNAME: "false", SET_GUILD_NOTE: "false", OFFICER_CHARACTERS: "Synthetic Officer", NAME_RESERVATION_AT: "0", LAUNCH_AT: "0", RULESET_PROFILE: JSON.stringify(synthetic), FUTURE_IDENTITY: "SYNTHETIC_PRIVATE_SENTINEL" };
  const site = load("./site"), core = load("./site-core"), t = Math.floor(Date.now()/1000);
  const pageBoot = async (over = {}, headers = {}, ready = true) => {
    const res = await site.handleSite(new Request("https://guild.example/", { headers }), { ...env, ...over }, "/", ready, "synthetic-candidate", () => {});
    const html = await res.text(); const match = html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/);
    return { status: res.status, html, boot: JSON.parse(match[1]) };
  };
  const anon = await pageBoot();
  check("actual anonymous Worker boot carries exact shared profile and no arbitrary environment field", anon.status === 200 && anon.boot.meta.ruleset.revision === current.revision && JSON.stringify(anon.boot.meta.ruleset) === JSON.stringify(current) && !anon.html.includes("SYNTHETIC_PRIVATE_SENTINEL") && !anon.html.includes("Synthetic Future Realm"));
  db.prepare("INSERT INTO site_users(discord_id,username,in_server,denied,first_login,last_login,session_version) VALUES(?,?,1,0,?,?,1)").run(userId, "synthetic-member", t, t);
  const cookie = (await core.sessionCookie(env, userId, 1)).split(";")[0], member = await pageBoot({}, { Cookie: cookie });
  check("actual signed-in Worker boot shares identity", member.status === 200 && member.boot.signedIn === true && JSON.stringify(member.boot.meta.ruleset) === JSON.stringify(anon.boot.meta.ruleset));
  const api = await site.handleSite(new Request("https://guild.example/api/me", { headers: { Cookie: cookie } }), env, "/api/me", true, "synthetic-candidate", () => {}), apiData = await api.json();
  check("actual authenticated /api/me identity agrees with boot and guide", api.status === 200 && JSON.stringify(apiData.meta.ruleset) === JSON.stringify(current) && reviewText.includes(profile.rulesetLabel(apiData.meta.ruleset)));
  const broken = await pageBoot({ DB: { prepare() { throw new Error("synthetic DB outage"); } } }, {}, false);
  check("actual DB-failure boot preserves public identity without eligibility promise", broken.status === 503 && broken.boot.settings === null && JSON.stringify(broken.boot.meta.ruleset) === JSON.stringify(current) && broken.boot.meta.rulesetSwitch.available === false);
  const settingsBefore = JSON.stringify(db.prepare("SELECT * FROM site_settings ORDER BY key").all());
  const refused = await site.handleSite(new Request("https://guild.example/api/admin/ruleset", { method: "PUT", headers: { Cookie: cookie, Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify(synthetic) }), env, "/api/admin/ruleset", true, "synthetic-candidate", () => {});
  check("unimplemented switch route refuses and cannot change settings", refused.status === 404 && JSON.stringify(db.prepare("SELECT * FROM site_settings ORDER BY key").all()) === settingsBefore && profile.currentRulesetProfile() === current);
  db.close(); console.log(`${n}/${n} passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
