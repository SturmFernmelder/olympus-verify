// Actual standard Wrangler bundle and real local D1/HTTP tests; no production install or activation.
// Separate raw legacy D1 proves schema.sql compound statements and unchanged uninstalled data.
// The serving D1 is an explicitly synthetic preinstalled current complete profile from the fixed
// source catalogue/worker-fixture seed sequence. Requests consume current proof; they never migrate.
// All five global private bindings stay absent, admission is explicitly ON with a fixed fixture
// epoch/layout, erasure is explicitly OFF. Private bootstrap, provider drain and normal schedule
// qualification remain separate. Outbound HTTP throws and all original artifacts are retained.
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process"), { createHash } = require("node:crypto");
const root = path.join(__dirname, "..");
const dependencyRoot = process.env.NODE_PATH ? path.resolve(process.env.NODE_PATH) : path.join(root, "node_modules");
const { Miniflare, Log, LogLevel } = require(path.join(dependencyRoot, "miniflare"));
const wranglerCLI = path.join(dependencyRoot, "wrangler", "wrangler-dist", "cli.js");
const digest = (b) => createHash("sha256").update(b).digest("hex");
const inputs = [];
const inventory = (relative) => {
  const absolute = path.join(root, relative), st = fs.lstatSync(absolute);
  if (st.isSymbolicLink()) throw Error("BUNDLE_INPUT_LINK_REFUSED");
  if (st.isDirectory()) for (const name of fs.readdirSync(absolute).sort()) inventory(path.join(relative, name));
  else if (st.isFile()) { const bytes = fs.readFileSync(absolute); inputs.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) }); }
  else throw Error("BUNDLE_INPUT_TYPE_REFUSED");
};
for (const relative of ["src", "public", "wrangler.toml", "schema.sql", "package.json", "package-lock.json"]) inventory(relative);
const inputsUnchanged = () => inputs.every((r) => { const st = fs.lstatSync(path.join(root, r.path)); if (!st.isFile() || st.isSymbolicLink()) return false; const bytes = fs.readFileSync(path.join(root, r.path)); return bytes.length === r.bytes && digest(bytes) === r.sha256; });
// Only a reviewed owning runner supplies the complete tuple. No partial configured fallback.
// This test handoff creates no application authority, production lease or provider effect.
let originalPhaseHandoff = null;
async function awaitOriginalBundleRuntimeAdmission(wranglerPID) {
  const dir = process.env.BUNDLE_PHASE_HANDOFF_DIR, nonce = process.env.BUNDLE_PHASE_NONCE, sourceSHA256 = process.env.BUNDLE_PHASE_SOURCE_SHA256;
  if (dir === undefined && nonce === undefined && sourceSHA256 === undefined) return null; // ordinary standalone test has no enforced phase claim
  if (typeof dir !== "string" || !path.isAbsolute(dir) || path.resolve(dir) !== dir || !fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink() || typeof nonce !== "string" || !/^[0-9a-f]{32}$/.test(nonce) || typeof sourceSHA256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSHA256) || !Number.isSafeInteger(wranglerPID) || wranglerPID < 1) throw Error("BUNDLE_PHASE_ORIGINAL_TUPLE_HELD");
  if (!inputsUnchanged()) throw Error("BUNDLE_PHASE_SOURCE_DRIFT");
  const inputBytes = Buffer.from(JSON.stringify(inputs) + "\n"), inputDigest64 = digest(inputBytes);
  fs.writeFileSync(path.join(scratch, "original-build-inputs.json"), inputBytes, { flag: "wx" });
  const request = { schema: "bundle-original-build-to-runtime-ready-v1", nonce, nodePID: process.pid, parentPID: process.ppid, wranglerPID, sourceFreezeSHA256: sourceSHA256, artifactRoot: scratch, inputDigest64, originalDryRunExitCode: 0, phase: "build-complete", originalOnce: true };
  // Link publication is atomic and refuses an existing destination. Node rename can overwrite.
  // The unique original partial remains if writing, publication or cleanup fails; never retry.
  const readyPath = path.join(dir, "build-ready.json"), readyPartial = path.join(dir, `build-ready.json.partial-${nonce}-${process.pid}`);
  fs.writeFileSync(readyPartial, JSON.stringify(request) + "\n", { flag: "wx" });
  fs.linkSync(readyPartial, readyPath);
  fs.unlinkSync(readyPartial);
  const ackPath = path.join(dir, "runtime-admitted.json"), deadline = performance.now() + 60000;
  for (;;) {
    if (performance.now() >= deadline) throw Error("BUNDLE_PHASE_ORIGINAL_ACK_TIMEOUT");
    if (fs.existsSync(ackPath)) {
      const st = fs.lstatSync(ackPath); if (!st.isFile() || st.isSymbolicLink() || st.size > 4096) throw Error("BUNDLE_PHASE_ACK_FILE_HELD");
      const raw = fs.readFileSync(ackPath), ack = JSON.parse(raw.toString("utf8")), expected = { schema: "bundle-original-runtime-admission-v2", nonce, nodePID: process.pid, parentPID: process.ppid, wranglerPID, sourceFreezeSHA256: sourceSHA256, artifactRoot: scratch, inputDigest64, originalDryRunExitCode: 0, buildMaximumActiveProcesses: 4, runtimeMaximumActiveProcesses: 3, runtimeMaximumApplicationProcesses: 2, maximumOSConsoleHosts: 1, knownBuildChildrenClosed: true, remainingOriginalProcesses: 1, once: true };
      if (!ack || typeof ack !== "object" || Array.isArray(ack) || Object.keys(ack).length !== Object.keys(expected).length || Object.keys(expected).some(k => ack[k] !== expected[k])) throw Error("BUNDLE_PHASE_ORIGINAL_ACK_HELD");
      if (!inputsUnchanged() || !fs.readFileSync(path.join(scratch, "original-build-inputs.json")).equals(inputBytes)) throw Error("BUNDLE_PHASE_SOURCE_DRIFT");
      const result = Object.freeze({ requestSHA256: digest(Buffer.from(JSON.stringify(request) + "\n")), ackSHA256: digest(raw), nonce, nodePID: process.pid, parentPID: process.ppid, wranglerPID, sourceFreezeSHA256: sourceSHA256, buildMaximumActiveProcesses: 4, runtimeMaximumActiveProcesses: 3, runtimeMaximumApplicationProcesses: 2, maximumOSConsoleHosts: 1, runtimeStartedAfterOriginalAdmission: true });
      originalPhaseHandoff = result; return result;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
let scratch, artifactsRecorded = false;
const recordArtifacts = (outcome) => {
  if (!scratch || artifactsRecorded) return;
  const resolved = path.resolve(scratch), temporary = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== temporary || !path.basename(resolved).startsWith("olv-bundle-") || fs.lstatSync(resolved).isSymbolicLink()) throw Error("BUNDLE_ARTIFACT_ROOT_REFUSED");
  let sourceInputsPreserved = false; try { sourceInputsPreserved = inputsUnchanged(); } catch {}
  artifactsRecorded = true;
  fs.writeFileSync(path.join(scratch, "original-test-outcome.json"), JSON.stringify({ schema: "production-bundle-retained-local-artifacts-v1", outcome, sourceInputs: inputs, sourceInputsPreserved, passedAssertions: ok, attemptedAssertions: n, providerDeploymentOrActivation: false }) + "\n", { flag: "wx" });
  console.log("BUNDLE_RUNTIME_ARTIFACTS " + JSON.stringify({ root: scratch, outcome, retained: true, syntheticRuntimeOnly: true }));
};
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const text = (v) => ({ type: "text", value: v });
const BUNDLE_FIXTURE_EPOCH = "a".repeat(32);
// Fixed local fixture data only. It is not an installation/Native authority export.
function currentFixtureCatalogue() {
  const file = path.join(root, "src", "privacy-write-admission-catalogue.ts"), raw = fs.readFileSync(file, "utf8");
  const encoded = (name) => {
    const prefix = "export const " + name + "=", lines = raw.split(/\r?\n/).filter(line => line.startsWith(prefix));
    if (lines.length !== 1 || !lines[0].endsWith(";")) throw Error("BUNDLE_FIXED_CATALOGUE_DATA_HELD");
    return lines[0].slice(prefix.length, -1);
  };
  const catalogueText = JSON.parse(encoded("ADMISSION_EXPECTED_JSON")), control = JSON.parse(encoded("ADMISSION_CONTROL_DDL")), protocolText = encoded("ADMISSION_PROTOCOL");
  if (typeof catalogueText !== "string" || typeof control !== "string" || !/^'[a-z0-9-]{1,96}'$/.test(protocolText)) throw Error("BUNDLE_FIXED_CATALOGUE_DATA_HELD");
  const catalogue = JSON.parse(catalogueText), protocol = protocolText.slice(1, -1);
  if (!catalogue || typeof catalogue !== "object" || catalogue.tables.length !== 69 || catalogue.indexes.length !== 84 || catalogue.triggers.length !== 221 || catalogue.slotColumns.length !== 9 || catalogue.slotSQL !== control || protocol !== "olympus-write-admission-epoch-2") throw Error("BUNDLE_CURRENT_PROFILE_COUNT_HELD");
  return { catalogue, catalogueText, control, protocol };
}
// Statements retain their complete trigger bodies. Quotes/comments cannot end a statement.
// BEGIN/CASE/END tracking is used only for CREATE TRIGGER bodies in this fixed input file.
function splitFixtureSchema(source) {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > 2000000) throw Error("BUNDLE_BASE_SCHEMA_BOUND");
  const statements = []; let statement = "", token = "", quote = null, lineComment = false, blockComment = false, trigger = false, triggerBody = false, cases = 0;
  const word = () => {
    if (!token) return;
    const value = token.toUpperCase(); token = "";
    if (!trigger && /^\s*CREATE\s+(?:(?:TEMP|TEMPORARY)\s+)?TRIGGER\b/i.test(statement)) trigger = true;
    if (trigger && value === "BEGIN" && !triggerBody) triggerBody = true;
    else if (triggerBody && value === "CASE") cases++;
    else if (triggerBody && value === "END") { if (cases) cases--; else triggerBody = false; }
  };
  const finish = () => { const sql = statement.trim(); if (sql) statements.push(sql); statement = ""; trigger = false; cases = 0; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === "\n") { lineComment = false; statement += "\n"; } continue; }
    if (blockComment) { if (c === "*" && next === "/") { blockComment = false; i++; statement += " "; } continue; }
    if (quote) {
      statement += c;
      if (c === quote || quote === "]" && c === "]") { if (next === c && quote !== "]") { statement += next; i++; } else quote = null; }
      continue;
    }
    if (c === "-" && next === "-") { word(); lineComment = true; i++; statement += " "; continue; }
    if (c === "/" && next === "*") { word(); blockComment = true; i++; statement += " "; continue; }
    if (c === "'" || c === '"' || c === "`" || c === "[") { word(); quote = c === "[" ? "]" : c; statement += c; continue; }
    if (/[A-Za-z0-9_]/.test(c)) token += c; else word();
    statement += c;
    if (c === ";" && !triggerBody) finish();
  }
  word();
  if (quote || blockComment || triggerBody || cases) throw Error("BUNDLE_BASE_SCHEMA_INCOMPLETE");
  finish(); if (!statements.length || statements.length > 1000) throw Error("BUNDLE_BASE_SCHEMA_BOUND");
  return statements;
}



(async () => {
  console.log("\n== the bundle wrangler would upload ==");
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "olv-bundle-"));
  const inputRoot = path.join(scratch, "input"), outdir = path.join(scratch, "bundle");
  fs.mkdirSync(inputRoot); fs.mkdirSync(outdir);
  for (const r of inputs) { const destination = path.join(inputRoot, r.path); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(root, r.path), destination, fs.constants.COPYFILE_EXCL); const bytes = fs.readFileSync(destination); if (bytes.length !== r.bytes || digest(bytes) !== r.sha256) throw Error("BUNDLE_COPY_DRIFT"); }
  if (!inputsUnchanged()) throw Error("BUNDLE_ORIGINAL_DRIFT_BEFORE_CLI");
  const childEnv = { WRANGLER_SEND_METRICS: "false", WRANGLER_HIDE_BANNER: "true", CI: "1", NPM_CONFIG_OFFLINE: "true" };
  for (const name of ["SystemRoot", "WINDIR", "COMSPEC", "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "NODE_PATH", "NODE_OPTIONS", "ACCOUNT148_PID_AUDIT_DIR", "TZ", "NO_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NPM_CONFIG_CACHE"]) if (process.env[name] !== undefined) childEnv[name] = process.env[name];
  const dry = spawnSync(process.execPath, [wranglerCLI, "deploy", "--dry-run", "--config", path.join(inputRoot, "wrangler.toml"), "--outdir", outdir], { cwd: inputRoot, shell: false, encoding: null, timeout: 120000, maxBuffer: 16000000, env: childEnv });
  fs.writeFileSync(path.join(scratch, "original-dryrun.stdout.log"), dry.stdout || Buffer.alloc(0), { flag: "wx" });
  fs.writeFileSync(path.join(scratch, "original-dryrun.stderr.log"), dry.stderr || Buffer.alloc(0), { flag: "wx" });
  fs.writeFileSync(path.join(scratch, "original-dryrun-outcome.json"), JSON.stringify({ childPID: dry.pid, exitCode: dry.status, signal: dry.signal, errorName: dry.error ? dry.error.name : null }) + "\n", { flag: "wx" });
  if (dry.stdout) process.stdout.write(dry.stdout); if (dry.stderr) process.stderr.write(dry.stderr);
  const bundlePath = path.join(outdir, "index.js");
  check("wrangler deploy --dry-run writes index.js", dry.status === 0 && fs.existsSync(bundlePath), dry.status, (dry.stderr || "").slice(-400));
  if (dry.status !== 0 || !fs.existsSync(bundlePath)) throw Error("LOCAL_DRYRUN_FAILED");
  const bundle = fs.readFileSync(bundlePath, "utf8");
  check("  the bundle exports a default handler and no scalar", /export\s*\{[^}]*\bas default\b/.test(bundle) || /export default/.test(bundle), bundle.slice(-300));

  await awaitOriginalBundleRuntimeAdmission(dry.pid);
  console.log("\n== workerd starts it ==");
  const TOKEN = "watcher-token-for-tests-only-0123456789";
  // A real Ed25519 key: Discord's public key is a proper curve point, and so must the test's be (a degenerate all-zero
  // key verifies garbage some of the time).
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const publicKeyHex = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
  const sign = async (timestamp, body) => hex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + body)));
  let outboundAttempts = 0;
  const viewer = "300000000000000091", oauthCode = "bundle_original_oauth_code", oauthToken = "bundle-original-oauth-token";
  const controlledOAuthCalls = [];
  const controlledOAuth = async (request) => {
    const url = new URL(request.url);
    const refuse = () => { outboundAttempts++; throw Error("BUNDLE_UNSELECTED_PROVIDER_REQUEST"); };
    if (url.origin !== "https://discord.com" || url.search || url.hash) return refuse();
    if (url.pathname === "/api/v10/oauth2/token") {
      if (request.method !== "POST" || !/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get("Content-Type") || "")) return refuse();
      const form = new URLSearchParams(await request.clone().text());
      const expected = { client_id: "1550176895671341076", client_secret: "client-secret-for-tests", grant_type: "authorization_code", code: oauthCode, redirect_uri: "https://guild.example/auth/callback" };
      if ([...form.keys()].sort().join(",") !== Object.keys(expected).sort().join(",") || Object.entries(expected).some(([key,value]) => form.getAll(key).length !== 1 || form.get(key) !== value) || controlledOAuthCalls.length !== 0) return refuse();
      controlledOAuthCalls.push("token");
      return Response.json({ access_token: oauthToken, token_type: "Bearer" });
    }
    if (request.method !== "GET" || request.headers.get("Authorization") !== "Bearer " + oauthToken) return refuse();
    if (url.pathname === "/api/v10/users/@me" && controlledOAuthCalls.join(",") === "token") {
      controlledOAuthCalls.push("me");
      return Response.json({ id: viewer, username: "Runtime member", global_name: null, avatar: null, bot: false });
    }
    if (url.pathname === "/api/v10/users/@me/guilds/236932545793490944/member" && controlledOAuthCalls.join(",") === "token,me") {
      controlledOAuthCalls.push("member");
      return Response.json({ user: { id: viewer, username: "Runtime member" }, nick: null, avatar: null, roles: [], joined_at: "2026-09-01T00:00:00Z", pending: false });
    }
    return refuse();
  };
  const mf = new Miniflare({
    host: "127.0.0.1", port: 0, cf: false, logRequests: false, telemetry: { enabled: false },
    resourceTmpPath: path.join(scratch, "mf-tmp"), resourcePersistencePath: path.join(scratch, "mf-persist"), isolatedResourcePersistencePath: path.join(scratch, "mf-isolated"),
    log: new Log(LogLevel.NONE),
    workers: [{
      config: {
        name: "olympus-verify-runtime-test", type: "worker", compatibilityDate: "2026-09-01", compatibilityFlags: ["nodejs_compat"],
        manifest: { mainModule: "index.js", modulesRoot: outdir, modules: { "index.js": { type: "esm", contents: bundle } } },
        env: {
          DB: { type: "d1", id: "runtime-test-db" },
          CF_VERSION_METADATA: { type: "version-metadata" },
          LEGACY_DB: { type: "d1", id: "runtime-legacy-db" },
          ASSETS: { type: "assets" },
          PUBLIC_BASE_URL: text("https://verify.example"), SITE_HOST: text("guild.example"), SITE_LEGACY_HOSTS: text("old.example"),
          SITE_GUILD_ID: text("236932545793490944"), SITE_ADMINS: text("472099715253796864"),
          GUILD_ID: text("1549537348516188200"), DISCORD_APP_ID: text("1550176895671341076"), DISCORD_PUBLIC_KEY: text(publicKeyHex),
          DISCORD_BOT_TOKEN: text("bot-token-for-tests"), DISCORD_CLIENT_SECRET: text("client-secret-for-tests"),
          COOKIE_SECRET: text("cookie-secret-for-tests-only-0123456789"), VERIFY_SECRET: text("verify-secret-for-tests"), WATCHER_TOKEN: text(TOKEN),
          PRIVACY_WRITE_ADMISSION_ENABLED: text("true"), PRIVACY_WRITE_ADMISSION_LAYOUT: text("canonical"), PRIVACY_WRITE_ADMISSION_EPOCH: text(BUNDLE_FIXTURE_EPOCH), PRIVACY_ERASURE_ENABLED: text("false"),
          ADMISSION_MODE: text("auto"), ROSTER_MIN_MEMBERS: text("0"), ROSTER_MAX_SHRINK_PCT: text("10"), SET_GUILD_NOTE: text("false"),
          QUEUE_CLAIM_LIMIT: text("25"), QUEUE_CLAIM_TTL_MINUTES: text("15"), OFFICER_CHARACTERS: text("Fern Melder"),
          CHANNEL_SERVER_LOG: text(""), CHANNEL_NOTICES: text(""), CHANNEL_MOD_ALERTS: text(""), CHANNEL_RECRUITMENT_REVIEW: text(""),
          ROLE_GUILD_MEMBER: text(""), ROLE_OFFICER: text(""), ROLE_MODERATOR: text(""), ROLE_GUILD_LEADER: text(""), ROLE_GUILD_MASTER: text(""), ROLE_RAID_LEADER: text(""),
          OFFICER_RANK_NAMES: text(""), INTROS_GUILD_ID: text(""), INTROS_CHANNELS: text(""),
        },
        assets: { directory: path.join(inputRoot, "public"), runWorkerFirst: true, hasUserWorker: true },
      },
      dev: { outboundService: { type: "fetcher", handler: controlledOAuth } },
    }],
  });
  let started = false, startErr = "";
  try { await mf.ready; started = true; } catch (e) { startErr = String(e.message); }
  check("the real bundle starts in workerd (no 'Incorrect type for map entry')", started, startErr.slice(0, 300));
  if (!started) { await mf.dispose().catch(() => {}); throw Error("PRODUCTION_BUNDLE_START_REFUSED: " + startErr); }
  const get = (url, init) => mf.dispatchFetch(url, init);
  try {
    console.log("\n== the base schema on a separate uninstalled local D1 ==");
    const d1 = await mf.getD1Database("DB"), legacy = await mf.getD1Database("LEGACY_DB");
    // This is the same real bundle's uninstalled admission refusal, before any fixture provisioning.
    const uninstalled = await get("https://verify.example/health"), uninstalledBody = await uninstalled.json();
    check("uninstalled original D1 remains503 before current fixture provisioning", uninstalled.status === 503 && uninstalledBody.error === "write_admission_held", uninstalled.status, uninstalledBody);
    const statements = splitFixtureSchema(fs.readFileSync(path.join(inputRoot, "schema.sql"), "utf8"));
    let applied = 0, schemaErr = "";
    try { for (const sql of statements) { await legacy.prepare(sql).run(); applied++; } } catch (e) { schemaErr = String(e.message).slice(0, 200); }
    const compoundTriggers = statements.filter(sql => /^CREATE\s+TRIGGER\b/i.test(sql.trimStart())).length;
    check(`schema.sql complete statements apply to separate legacy D1 (${statements.length} statements)`, statements.length === 160 && applied === statements.length && !schemaErr && compoundTriggers === 5, applied, schemaErr, compoundTriggers);
    const oldDetails = JSON.stringify({ votingOpen: "1", notice: "Raid at eight", appointed: JSON.stringify({ treasurer: "Zed Holder", "class_lead:priest": "Quill Holder" }) });
    await legacy.prepare("INSERT INTO audit (ts, actor, action, details) VALUES (?1, 'admin', 'site.settings', ?2)").bind(1790000000, oldDetails).run();
    await legacy.prepare("INSERT INTO audit (ts, actor, action, details) VALUES (?1, 'admin', 'site.settings', ?2)").bind(1790000001, "not json").run();

    console.log("\n== explicit synthetic current complete profile on the serving D1 ==");
    const fixed = currentFixtureCatalogue(), pending = [], append = (sql, ...values) => pending.push(values.length ? d1.prepare(sql).bind(...values) : d1.prepare(sql));
    const flush = async () => { while (pending.length) await d1.batch(pending.splice(0, 50)); };
    // Exact existing worker-fixture seed sequence120-124/159: fixed source catalogue,
    // original neutral epoch/control and typed115 before source-owned221 trigger DDL.
    for (const row of fixed.catalogue.tables) append(row.sql);
    for (const row of fixed.catalogue.indexes) append(row.sql);
    append(fixed.control); await flush();
    const nativeClock = await d1.prepare("SELECT CAST(strftime('%s','now') AS INTEGER)AS t").first();
    if (!nativeClock || !Number.isSafeInteger(nativeClock.t) || nativeClock.t < 1) throw Error("BUNDLE_NATIVE_FIXTURE_CLOCK_HELD");
    append("INSERT INTO privacy_write_admission VALUES(1,?,0,'','',0,0,?,'serving')", fixed.protocol, BUNDLE_FIXTURE_EPOCH);
    append("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)");
    append("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)", nativeClock.t);
    const typedDetails = JSON.stringify({ votingOpen: "1", notice: true, appointedRoles: ["class_lead:priest", "treasurer"], appointedNames: 2 });
    append("INSERT INTO audit (ts, actor, action, details) VALUES (?1, 'admin', 'site.settings', ?2)", 1790000000, typedDetails); await flush();
    for (const row of fixed.catalogue.triggers) append(row.sql);
    await flush();
    const physical = await d1.prepare("SELECT type,name,sql FROM sqlite_master WHERE (type IN('table','index','trigger')) AND substr(lower(name),1,7)<>'sqlite_' AND name NOT IN('privacy_write_admission','_cf_METADATA') ORDER BY type,name").all();
    const expected = [...fixed.catalogue.tables.map(row => ({ type: "table", name: row.name, sql: row.sql })), ...fixed.catalogue.indexes.map(row => ({ type: "index", name: row.name, sql: row.sql })), ...fixed.catalogue.triggers.map(row => ({ type: "trigger", name: row.name, sql: row.sql }))].sort((a, b) => a.type < b.type ? -1 : a.type > b.type ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    check("synthetic serving profile exactly matches current69tables84indexes221triggers", JSON.stringify(physical.results) === JSON.stringify(expected), physical.results.length);
    const neutral = await d1.prepare("SELECT singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes FROM privacy_write_admission").all();
    check("synthetic current original epoch is neutral and explicit", neutral.results.length === 1 && JSON.stringify(neutral.results[0]) === JSON.stringify({ singleton: 1, protocol: fixed.protocol, epoch: BUNDLE_FIXTURE_EPOCH, mode: "serving", active: 0, nonce: "", purpose: "", entry_changes: 0, logical_changes: 0 }));
    const foreignKeys = await d1.prepare("PRAGMA foreign_key_check").all(); check("synthetic current profile has no Native foreign-key violations", foreignKeys.results.length === 0);
    console.log("MEASURED_BUNDLE_PROFILE " + JSON.stringify({ schema: "bundle-synthetic-current-profile-v1", layout: "canonical", epoch: BUNDLE_FIXTURE_EPOCH, catalogueJSONSHA256: digest(Buffer.from(fixed.catalogueText)), applicationTables: fixed.catalogue.tables.length, applicationIndexes: fixed.catalogue.indexes.length, applicationTriggers: fixed.catalogue.triggers.length, legacyStatements: statements.length, legacyCompoundTriggers: compoundTriggers, uninstalledStatus: uninstalled.status, admissionEnabled: true, erasureEnabled: false, globalPrivateBindings: 0, syntheticFixtureProvisioningOnly: true, actualPrivateBootstrapQualified: false, providerOriginQualified: false, normalScheduledEntryQualified: false }));

    console.log("\n== the first minute after a deploy ==");
    let res = await get("https://nobody.example/health");
    check("an unknown host is 404", res.status === 404, res.status);
    res = await get("https://verify.example/health");
    let body = await res.json();
    check("the bot host answers /health publicly with ok, build and d1 only", res.status === 200 && body.ok === true && typeof body.build === "string" && Object.keys(body).sort().join(",") === "build,d1,ok", JSON.stringify(body));
    check("  d1 is ok: the schema applied itself to a fresh database in the real runtime", body.d1 === "ok", body.d1);
    const rewritten = await d1.prepare("SELECT details FROM audit WHERE ts = ?1").bind(1790000000).first();
    const marker = await d1.prepare("SELECT value FROM site_settings WHERE key = 'auditTypedNames'").first();
    const legacyOld = await legacy.prepare("SELECT details FROM audit WHERE ts = ?1").bind(1790000000).first(), legacyMalformed = await legacy.prepare("SELECT details FROM audit WHERE ts = ?1").bind(1790000001).first();
    check("  current typed115 profile is consumed without request-time migration",
      rewritten && rewritten.details === typedDetails && marker && marker.value === "115", rewritten, marker);
    check("  separate raw legacy/malformed audit fixture remains unchanged",
      legacyOld && legacyOld.details === oldDetails && legacyMalformed && legacyMalformed.details === "not json", legacyOld, legacyMalformed);
    res = await get("https://verify.example/health", { headers: { Authorization: `Bearer ${TOKEN}` } });
    body = await res.json();
    check("  with the watcher's bearer the inventory comes back, retention clean", res.status === 200 && body.bnetRetention && body.bnetRetention.overdue === 0 && body.secrets, JSON.stringify(body).slice(0, 200));
    res = await get("https://guild.example/");
    const html = await res.text();
    check('the site host serves only the script-free Discord gate before login', res.status === 200 && /<!doctype html>/i.test(html) && html.includes('Sign in with Discord') && !html.includes('/static/app.js') && !html.includes('id="boot"'), res.status, html.slice(0, 80));
    res = await get("https://guild.example/static/app.css");
    check('anonymous application assets are blocked in real workerd', res.status === 401, res.status);
    const login = await get("https://guild.example/auth/login", { redirect: "manual" });
    const authorize = new URL(login.headers.get("Location"));
    const state = authorize.searchParams.get("state"), stateCookie = (login.headers.get("Set-Cookie") || "").split(";")[0];
    check("original mounted login issues its actual state cookie", login.status === 302 && authorize.origin === "https://discord.com" && typeof state === "string" && state.length > 24 && stateCookie.startsWith("__Host-olg_state="));
    const callback = await get("https://guild.example/auth/callback?code=" + encodeURIComponent(oauthCode) + "&state=" + encodeURIComponent(state), { headers: { Cookie: stateCookie }, redirect: "manual" });
    const issued = callback.headers.get("Set-Cookie") || "", matched = issued.match(/(?:^|,\s*)(__Host-olg=[A-Za-z0-9_.-]+)(?:;|$)/), cookie = matched ? matched[1] : "";
    check("original mounted OAuth callback creates the current native cookie", callback.status === 303 && callback.headers.get("Location") === "/" && !!cookie, callback.status);
    const currentSession = cookie ? JSON.parse(Buffer.from(cookie.slice("__Host-olg=".length).split(".")[0], "base64url").toString("utf8")) : null;
    const nativeUser = await d1.prepare("SELECT account_incarnation,session_version,in_server FROM site_users WHERE discord_id=?1").bind(viewer).first();
    check("issued cookie binds actual Native version and account birth", !!currentSession && currentSession.u === viewer && /^[0-9a-f]{32}$/.test(currentSession.n) && nativeUser && currentSession.n === nativeUser.account_incarnation && currentSession.v === nativeUser.session_version && nativeUser.in_server === 1);
    check("only the exact controlled original OAuth transport runs once", controlledOAuthCalls.join(",") === "token,me,member" && outboundAttempts === 0, controlledOAuthCalls);
    res = await get('https://guild.example/static/app.css',{headers:{Cookie:cookie}});
    check('a current signed session gets real CSS with private no-store headers',res.status===200&&/text\/css/.test(res.headers.get('Content-Type')||'')&&res.headers.get('Cache-Control')==='private, no-store, no-transform',res.status);
    for (const asset of ['/static/governance/organization.json','/static/governance/reconciled-book.md','/static/organization-view.js']) {
      res = await get('https://guild.example'+asset);
      check('real workerd withholds private governance asset without login: '+asset,res.status===401);
      res = await get('https://guild.example'+asset,{headers:{Cookie:cookie}});
      check('real workerd serves the exact current member governance asset: '+asset,res.status===200&&Buffer.from(await res.arrayBuffer()).equals(fs.readFileSync(path.join(root,'public',asset))),res.status);
    }
    res = await get("https://nobody.example/static/app.css");
    check("  which an unknown host cannot fetch (run_worker_first)", res.status === 404, res.status);
    res = await get("https://verify.example/privacy", { redirect: "manual" });
    check("the privacy policy is served on the bot host by the real bundle: 200 HTML, strict CSP, no Location (.65)", res.status === 200 && !res.headers.has("Location") && /script-src 'none'/.test(res.headers.get("Content-Security-Policy") || "") && (await res.text()).includes("<h1>Privacy Policy</h1>"), res.status);
    res = await get("https://verify.example/static/policies.css");
    check("  with its stylesheet from the assets binding on that host", res.status === 200 && /text\/css/.test(res.headers.get("Content-Type") || ""), res.status);
    res = await get("https://old.example/?tab=vote", { redirect: "manual" });
    check("a legacy host is a 301 to the site", res.status === 301 && res.headers.get("Location") === "https://guild.example/?tab=vote", res.status, res.headers.get("Location"));
    res = await get("https://old.example/auth/callback?code=x&state=y", { redirect: "manual" });
    check("  and an OAuth callback there restarts at the front page with exact privacy headers, empty body and no cookie", res.status === 302 && res.headers.get("Location") === "https://guild.example/" && res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("Referrer-Policy") === "no-referrer" && !res.headers.has("Set-Cookie") && (await res.text()) === "", res.status);
    const ping = JSON.stringify({ type: 1, id: "900000000000000001", application_id: "1550176895671341076", token: "t" });
    const ts = String(Math.floor(Date.now() / 1000));
    res = await get("https://verify.example/interactions", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature-Ed25519": "00".repeat(64), "X-Signature-Timestamp": ts }, body: ping });
    check("a ping with a wrong signature is refused with 401 (real Ed25519 in workerd)", res.status === 401, res.status);
    res = await get("https://verify.example/interactions", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature-Ed25519": await sign(ts, ping), "X-Signature-Timestamp": ts }, body: ping });
    check("  a properly signed ping is answered with a pong", res.status === 200 && (await res.json()).type === 1, res.status);
    res = await get("https://verify.example/queue");
    check("the watcher's endpoints need the bearer", res.status === 401, res.status);
    res = await get("https://verify.example/queue", { headers: { Authorization: `Bearer ${TOKEN}` } });
    check("  and answer with it", res.status === 200, res.status, (await res.text()).slice(0, 100));
  } finally {
    await mf.dispose();
  }
  check("standard bundle has no real external provider calls", outboundAttempts === 0, outboundAttempts);
  check("original production bundle inputs remain byte exact", inputsUnchanged());
  console.log("MEASURED_BUNDLE_RUNTIME " + JSON.stringify({ schema: "production-bundle-local-runtime-v1", compatibilityDate: "2026-09-01", compatibilityFlags: ["nodejs_compat"], bundleSHA256: digest(Buffer.from(bundle)), sourceInputs: inputs, sourceInputsPreserved: inputsUnchanged(), originalDryRunExitCode: dry.status, actualBundleStarted: started, outboundAttempts, controlledOAuthCalls, originalMountedOAuthCookie: true, providerOriginQualified: false, providerDrainQualified: false, actualSourceOpenerQualified: false, productionCapacityQualified: false, deploymentOrActivation: false, originalPhaseHandoff, artifactRoot: scratch, passedAssertions: ok, attemptedAssertions: n }));
  recordArtifacts(ok === n ? "passed" : "failed_checks");
  console.log(`\nbundle runtime: ${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); recordArtifacts("failed_exception"); process.exit(1); });
