// Actual shared module, guide/intros and Worker page/API projections against the real schema and node:sqlite.
// Synthetic identities only. No network, mutable profile selection or provider effect.
const fs = require("fs"), path = require("path"), ts = require("typescript"), assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, ".."), cache = {};
const entry = require("./helpers/privacy129_fixture.cjs");
function load(name) {
  if (name === "node:async_hooks" || name === "./node:async_hooks") return require("node:async_hooks");
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
check("exact closed owner-public PvE direction with realmless public terminology", JSON.stringify(current) === JSON.stringify({ schema: "olympus-ruleset-profile-v1", revision: "forever-public-pve-alliance-20261023-v1", phase: "public_direction", game: "World of Warcraft: Forever", guild: "Olympus", realm: "Realmless (ruleset-based)", ruleset: "PvE", faction: "Alliance" }));
const legacyPublic = Object.freeze({ ...current, realm: "Realm not announced" });
check("exact legacy public realm label is corrected for display without mutating the profile", profile.rulesetLabel(legacyPublic) === label && legacyPublic.realm === "Realm not announced" && profile.rulesetRealmLabel(legacyPublic) === current.realm);
check("display correction does not relabel a historical, future, different-revision, faction, ruleset or arbitrary realm", [profile.historicalBetaRulesetProfile(), { ...legacyPublic, phase: "full_release" }, { ...legacyPublic, revision: "synthetic-public-v1" }, { ...legacyPublic, faction: "Horde" }, { ...legacyPublic, ruleset: "PvP" }, { ...current, realm: "Synthetic Other Realm" }].every(p => profile.rulesetRealmLabel(p) === p.realm));
check("historical beta remains separately pinned for signed observations", profile.historicalBetaRulesetProfile().revision === "forever-beta-pvp2-v1" && profile.historicalBetaRulesetProfile().realm === "Classic Beta PvP 2" && profile.historicalBetaRulesetProfile().ruleset === "PvP");
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
const roleplayPvp = profile.parseRulesetProfile({ ...synthetic, ruleset: "Roleplay-PvP" });
check("announced Roleplay-PvP is an explicit supported identity value, never implicit activation", roleplayPvp?.ruleset === "Roleplay-PvP" && profile.rulesetSwitchReadiness(roleplayPvp).available === false && profile.currentRulesetProfile() === current && profile.parseRulesetProfile({ ...synthetic, ruleset: "Roleplay-PvE" }) === null);
check("confirmed NA reservation source fallback is 27 October 20 UTC and needs no saved setting", data.DEFAULT_NAMES_OPEN_AT === 1793131200 && data.DEFAULT_NAMES_OPEN_AT === Date.UTC(2026, 9, 27, 20) / 1000 && data.settingsFrom({}, []).namesOpenAt === 1793131200 && data.settingsFrom({}, []).namesTimeConfirmed === true);
check("both Wrangler source defaults use the same announced NA reservation hour", ["wrangler.toml", "wrangler.cutover.toml"].every(file => /^NAME_RESERVATION_AT = "2026-10-27T20:00:00Z"/m.test(fs.readFileSync(path.join(root, file), "utf8"))));
check("an overridden different reservation hour is not confirmed automatically", data.settingsFrom({ NAME_RESERVATION_AT: "2026-10-27T07:00:00Z" }, []).namesTimeConfirmed === false && data.settingsFrom({}, [{ key: "namesOpenAt", value: "1793084400" }]).namesTimeConfirmed === false);
check("saved reservation hour and explicit admin confirmation remain authoritative", data.settingsFrom({}, [{ key: "namesOpenAt", value: "1793084400" }, { key: "namesTimeConfirmed", value: "1" }]).namesTimeConfirmed === true && data.settingsFrom({}, [{ key: "namesOpenAt", value: "1793131200" }, { key: "namesTimeConfirmed", value: "0" }]).namesTimeConfirmed === false && data.settingsFrom({}, [{ key: "namesOpenAt", value: "1793084400" }]).namesOpenAt === 1793084400);
check("local name validation retains normalization while distinguishing its rule from Blizzard availability", data.parseCharacterName("fern melder").name === "Fern Melder" && /guild planning list/.test(data.parseCharacterName("F Melder").error) && /local input rule, not a Blizzard/.test(data.parseCharacterName("F Melder").error) && /Blizzard makes the final naming decision/.test(data.parseCharacterName("Fern").error));
check("both detailed regional raid-lead guides accommodate 10, 20 and 40-player groups", ["raid_leader_na", "raid_leader_eu"].every(key => { const position = data.POSITIONS.find(p => p.key === key); return position.info.about.includes("10, 20 or 40 players") && position.blurb.includes("10-, 20- or 40-player") && position.info.duties.length >= 6 && position.info.expect.length >= 4; }));
for (const target of ["full_release", synthetic, true, "beta", null]) check("shape/request input never opens activation: " + (typeof target), profile.rulesetSwitchReadiness(target).available === false && profile.rulesetSwitchReadiness(target).futureProfileConfigured === false && profile.currentRulesetProfile() === current);
const betaSnapshot = profile.betaRulesetSnapshot();
check("public meta uses the resolved public-copy snapshot and an explicitly unavailable switch", data.meta(betaSnapshot).ruleset === current && data.meta(betaSnapshot).rulesetSwitch.code === "full_release_unavailable" && data.meta(betaSnapshot).rulesetSwitch.ownerEligibilityQualified === false && data.meta(betaSnapshot).rulesetSwitch.projectionSyncQualified === false);
check("meta without a resolved snapshot carries no identity and says so", data.meta().ruleset === null && data.meta().rulesetHeld === "ruleset_unresolved" && data.meta().rulesetSwitch.available === false);
const guideEnv = { OFFICER_CHARACTERS: "Synthetic Officer", ADMISSION_MODE: "review", ROLE_GUILD_MEMBER: "700000000000000003", SET_NICKNAME: "true", SET_GUILD_NOTE: "false", CHANNEL_VISITOR_CHAT: "700000000000000004", RULESET_PROFILE: JSON.stringify(synthetic), FUTURE_IDENTITY: "SYNTHETIC_PRIVATE_SENTINEL" };
const reviewGuide = guide.guideMessage(guideEnv, current), reviewText = reviewGuide.embeds[0].description;
check("real guide projects shared public direction and ignores arbitrary future environment fields", reviewText.includes(label) && !JSON.stringify(reviewGuide).includes("SYNTHETIC_PRIVATE_SENTINEL") && !reviewText.includes("Synthetic Future Realm"));
check("guide preserves officer review, checked-roster role, enabled nickname and visitor semantics", reviewText.includes("officer reviews") && reviewText.includes("officer-exported guild roster") && reviewText.includes("nickname updates") && reviewText.includes("<#700000000000000004>"));
const simpleText = guide.guideMessage({ ...guideEnv, ADMISSION_MODE: "auto", ROLE_GUILD_MEMBER: "", SET_NICKNAME: "false" }, current).embeds[0].description;
check("guide auto/unconfigured paths retain original conditional claims", !simpleText.includes("officer reviews") && !simpleText.includes("Guild Member** role") && !simpleText.includes("nickname updates") && simpleText.includes(label));
check("guide preserves no-DM and empty mention policy", reviewText.includes("never sends you a DM") && JSON.stringify(reviewGuide.allowed_mentions) === '{"parse":[]}');
const identityIntros = intros.INTROS.filter(i => ["olympus-info", "guild-announcements"].includes(i.key));
for (const intro of identityIntros) check("real intro projects same profile: " + intro.key, JSON.stringify(intros.renderEmbeds(intro, {}, betaSnapshot)).includes(label));
for (const intro of intros.INTROS) check("real intro within Discord limits: " + intro.key, intros.validateEmbeds(intros.renderEmbeds(intro, {}, betaSnapshot)).length === 0);
check("current owner public decision date is explicit in the rendered guild announcement", JSON.stringify(intros.renderEmbeds(intros.INTROS.find(i => i.key === "guild-announcements"), {}, betaSnapshot)).includes("(owner public direction 23 October 2026)"));
check("a held snapshot renders no identity token", (() => { try { intros.renderEmbeds(identityIntros[0], {}, { mode: "full_release", profile: null, held: "future_profile_missing", revision: "", digest: null, activatedAt: null, activatedBy: null }); return false; } catch (e) { return e.message === "ruleset_profile_held"; } })());

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
  const db = new DatabaseSync(":memory:"); entry.installCurrentEntryEpoch(db);
  const userId = "700000000000000001", env = { DB: d1(db), COOKIE_SECRET: "synthetic-ruleset-cookie-secret-only", VERIFY_SECRET: "synthetic-ruleset-verify-secret", GUILD_ID: "700000000000000002", SITE_GUILD_ID: "700000000000000002", SITE_HOST: "guild.example", SITE_ADMINS: userId, COMMUNITY_FEATURES: "", ROLE_GUILD_MEMBER: "", ADMISSION_MODE: "review", SET_NICKNAME: "false", SET_GUILD_NOTE: "false", OFFICER_CHARACTERS: "Synthetic Officer", NAME_RESERVATION_AT: "0", LAUNCH_AT: "0", RULESET_PROFILE: JSON.stringify(synthetic), FUTURE_IDENTITY: "SYNTHETIC_PRIVATE_SENTINEL" };
  Object.assign(env,entry.currentEntryEnvironment({...env, DB:entry.originalNativePort(db),DISCORD_APP_ID:"1550176895671341076",PUBLIC_BASE_URL:"https://verify.example"}));
  const originalEnv = {...env};
  env.DB=load("./privacy-write-admission").createPrivacyWriteAdmissionDatabase(originalEnv.DB,"writer","canonical",entry.ENTRY_EPOCH);
  const site = load("./site"), core = load("./site-core"), t = Math.floor(Date.now()/1000);
  const pageBoot = async (over = {}, headers = {}, ready = true) => {
    const res = await site.handleSite(new Request("https://guild.example/", { headers }), { ...env, ...over }, "/", ready, "synthetic-candidate", () => {});
    const html = await res.text(); const match = html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/);
    return { status: res.status, html, boot: match ? JSON.parse(match[1]) : null };
  };
  const anon = await pageBoot();
  check("actual anonymous Worker page is the script-free sign-in gate with no profile/settings boot or arbitrary environment field", anon.status === 200 && anon.boot === null && anon.html.includes('href="/auth/login"') && !/<script\b|id="boot"|\/static\/app\.(?:js|css)/i.test(anon.html) && !anon.html.includes("SYNTHETIC_PRIVATE_SENTINEL") && !anon.html.includes("Synthetic Future Realm"));
  await env.DB.prepare("INSERT INTO site_users(discord_id,username,in_server,denied,first_login,last_login,session_version) VALUES(?,?,1,0,?,?,1)").bind(userId, "synthetic-member", t, t).run();
  const issued=await entry.issueOriginalEntryCookie(name=>load("./"+name),db,originalEnv,userId);
  const cookie = issued.cookie, member = await pageBoot({}, { Cookie: cookie });
  check("actual signed-in Worker boot carries the exact shared identity and unavailable switch without arbitrary environment fields", member.status === 200 && member.boot.signedIn === true && member.boot.meta.ruleset.revision === current.revision && JSON.stringify(member.boot.meta.ruleset) === JSON.stringify(current) && member.boot.meta.rulesetSwitch.available === false && !member.html.includes("SYNTHETIC_PRIVATE_SENTINEL") && !member.html.includes("Synthetic Future Realm"));
  const api = await site.handleSite(new Request("https://guild.example/api/me", { headers: { Cookie: cookie } }), env, "/api/me", true, "synthetic-candidate", () => {}), apiData = await api.json();
  check("actual authenticated /api/me identity agrees with boot and guide", api.status === 200 && JSON.stringify(apiData.meta.ruleset) === JSON.stringify(current) && reviewText.includes(profile.rulesetLabel(apiData.meta.ruleset)));
  const broken = await pageBoot({ DB: { prepare() { throw new Error("synthetic DB outage"); } } }, { Cookie: cookie }, false);
  check("actual signed-cookie DB failure holds at the script-free sign-in gate without settings or eligibility promise", broken.status === 503 && broken.boot === null && broken.html.includes('href="/auth/login"') && broken.html.includes("updating") && !/<script\b|id="boot"|\/static\/app\.(?:js|css)/i.test(broken.html) && !broken.html.includes("SYNTHETIC_PRIVATE_SENTINEL") && !broken.html.includes("Synthetic Future Realm"));
  const settingsBefore = JSON.stringify(db.prepare("SELECT * FROM site_settings ORDER BY key").all());
  const refused = await site.handleSite(new Request("https://guild.example/api/admin/ruleset", { method: "PUT", headers: { Cookie: cookie, Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify(synthetic) }), env, "/api/admin/ruleset", true, "synthetic-candidate", () => {});
  check("unimplemented switch route refuses and cannot change settings", refused.status === 404 && JSON.stringify(db.prepare("SELECT * FROM site_settings ORDER BY key").all()) === settingsBefore && profile.currentRulesetProfile() === current);
  db.close(); console.log(`${n}/${n} passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
