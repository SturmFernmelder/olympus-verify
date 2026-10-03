// Build .51 (1 Oct 2026): the Worker as workerd will run it. `wrangler deploy --dry-run` writes the exact bundle a deploy
// would upload; this loads that bundle in the local Workers runtime (Miniflare/workerd, installed with wrangler) with
// synthetic vars, a fresh in-memory D1 and the real public/ assets, and asks it what a deploy's first minute would:
// does the entry start at all (Codex's review of .49 on the real runtime, 1 Oct 00:23 UTC: a scalar named export made
// workerd refuse the whole bundle, which no CJS suite could see), does the schema apply to a real D1, and does each
// host class answer as the hosts suite says. The base schema (schema.sql) is applied to that D1 first, as `npm run
// db:init` did once for the live database; the Worker's own migration (schema.ts) then adds this build's columns on top,
// which is the live order. Outbound HTTP throws, so nothing leaves the machine.
// Run from the worker folder:  node tests/bundle_runtime_test.cjs      (about 15 s: the dry-run bundle, then workerd)
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const { Miniflare, Log, LogLevel } = require(path.join(root, "node_modules", "miniflare"));
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const text = (v) => ({ type: "text", value: v });

(async () => {
  console.log("\n== the bundle wrangler would upload ==");
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "olv-bundle-"));
  const dry = spawnSync(`npx --no-install wrangler deploy --dry-run --outdir "${outdir}"`, { cwd: root, shell: true, encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } });
  const bundlePath = path.join(outdir, "index.js");
  check("wrangler deploy --dry-run writes index.js", dry.status === 0 && fs.existsSync(bundlePath), dry.status, (dry.stderr || "").slice(-400));
  if (!fs.existsSync(bundlePath)) { console.log(`\n${ok}/${n} passed`); process.exit(1); }
  const bundle = fs.readFileSync(bundlePath, "utf8");
  check("  the bundle exports a default handler and no scalar", /export\s*\{[^}]*\bas default\b/.test(bundle) || /export default/.test(bundle), bundle.slice(-300));

  console.log("\n== workerd starts it ==");
  const TOKEN = "watcher-token-for-tests-only-0123456789";
  // A real Ed25519 key: Discord's public key is a proper curve point, and so must the test's be (a degenerate all-zero
  // key verifies garbage some of the time).
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const publicKeyHex = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
  const sign = async (timestamp, body) => hex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + body)));
  const mf = new Miniflare({
    log: new Log(LogLevel.NONE),
    workers: [{
      config: {
        name: "olympus-verify-runtime-test", type: "worker", compatibilityDate: "2026-09-01",
        manifest: { mainModule: "index.js", modulesRoot: outdir, modules: { "index.js": { type: "esm", contents: bundle } } },
        env: {
          DB: { type: "d1", id: "runtime-test-db" },
          ASSETS: { type: "assets" },
          PUBLIC_BASE_URL: text("https://verify.example"), SITE_HOST: text("guild.example"), SITE_LEGACY_HOSTS: text("old.example"),
          SITE_GUILD_ID: text("236932545793490944"), SITE_ADMINS: text("472099715253796864"),
          GUILD_ID: text("1549537348516188200"), DISCORD_APP_ID: text("1550176895671341076"), DISCORD_PUBLIC_KEY: text(publicKeyHex),
          DISCORD_BOT_TOKEN: text("bot-token-for-tests"), DISCORD_CLIENT_SECRET: text("client-secret-for-tests"),
          COOKIE_SECRET: text("cookie-secret-for-tests-only-0123456789"), VERIFY_SECRET: text("verify-secret-for-tests"), WATCHER_TOKEN: text(TOKEN),
          ADMISSION_MODE: text("auto"), ROSTER_MIN_MEMBERS: text("0"), ROSTER_MAX_SHRINK_PCT: text("10"), SET_GUILD_NOTE: text("false"),
          QUEUE_CLAIM_LIMIT: text("25"), QUEUE_CLAIM_TTL_MINUTES: text("15"), OFFICER_CHARACTERS: text("Fern Melder"),
          CHANNEL_SERVER_LOG: text(""), CHANNEL_NOTICES: text(""), CHANNEL_MOD_ALERTS: text(""), CHANNEL_RECRUITMENT_REVIEW: text(""),
          ROLE_GUILD_MEMBER: text(""), ROLE_OFFICER: text(""), ROLE_MODERATOR: text(""), ROLE_GUILD_LEADER: text(""), ROLE_GUILD_MASTER: text(""), ROLE_RAID_LEADER: text(""),
          OFFICER_RANK_NAMES: text(""), INTROS_GUILD_ID: text(""), INTROS_CHANNELS: text(""),
        },
        assets: { directory: path.join(root, "public"), runWorkerFirst: true, hasUserWorker: true },
      },
      dev: { outboundService: { type: "fetcher", handler: () => { throw new Error("no network in tests"); } } },
    }],
  });
  let started = false, startErr = "";
  try { await mf.ready; started = true; } catch (e) { startErr = String(e.message); }
  check("the real bundle starts in workerd (no 'Incorrect type for map entry')", started, startErr.slice(0, 300));
  if (!started) { await mf.dispose().catch(() => {}); fs.rmSync(outdir, { recursive: true, force: true }); console.log(`\n${ok}/${n} passed`); process.exit(1); }
  const get = (url, init) => mf.dispatchFetch(url, init);
  try {
    console.log("\n== the base schema, as db:init applies it, on a real D1 ==");
    const d1 = await mf.getD1Database("DB");
    // comments out first (none holds a quoted semicolon), then one statement per semicolon: the file's own layout puts
    // trailing comments after a statement's semicolon, which a line-based split would glue to the next statement
    const statements = fs.readFileSync(path.join(root, "schema.sql"), "utf8").replace(/--[^\n]*/g, "").split(";").map((st) => st.trim()).filter(Boolean);
    let applied = 0, schemaErr = "";
    try { for (const st of statements) { await d1.prepare(st).run(); applied++; } } catch (e) { schemaErr = String(e.message).slice(0, 200); }
    check(`schema.sql applies statement by statement to the real D1 (${statements.length} statements)`, applied === statements.length && !schemaErr, applied, schemaErr);
    // .115 (item C): a settings row as .114 wrote it, for the Worker's one-time rewrite (schema.ts redactSettingsAudit) to
    // meet in workerd's own SQLite at its first request; the CJS suites run it in node:sqlite only
    await d1.prepare("INSERT INTO audit (ts, actor, action, details) VALUES (?1, 'admin', 'site.settings', ?2)").bind(1790000000, JSON.stringify({ votingOpen: "1", notice: "Raid at eight", appointed: JSON.stringify({ treasurer: "Zed Holder", "class_lead:priest": "Quill Holder" }) })).run();
    await d1.prepare("INSERT INTO audit (ts, actor, action, details) VALUES (?1, 'admin', 'site.settings', ?2)").bind(1790000001, "not json").run();

    console.log("\n== the first minute after a deploy ==");
    let res = await get("https://nobody.example/health");
    check("an unknown host is 404", res.status === 404, res.status);
    res = await get("https://verify.example/health");
    let body = await res.json();
    check("the bot host answers /health publicly with ok, build and d1 only", res.status === 200 && body.ok === true && typeof body.build === "string" && Object.keys(body).sort().join(",") === "build,d1,ok", JSON.stringify(body));
    check("  d1 is ok: the schema applied itself to a fresh database in the real runtime", body.d1 === "ok", body.d1);
    const rewritten = await d1.prepare("SELECT details FROM audit WHERE ts = ?1").bind(1790000000).first();
    const marker = await d1.prepare("SELECT value FROM site_settings WHERE key = 'auditTypedNames'").first();
    check("  (.115) the one-time rewrite ran in the real D1: the old settings row keeps role keys and counts, no names, and the marker is set",
      rewritten && rewritten.details === JSON.stringify({ votingOpen: "1", notice: true, appointedRoles: ["class_lead:priest", "treasurer"], appointedNames: 2 }) && marker && marker.value === "115" &&
      (await d1.prepare("SELECT details FROM audit WHERE ts = ?1").bind(1790000001).first()).details === "not json", rewritten, marker);
    res = await get("https://verify.example/health", { headers: { Authorization: `Bearer ${TOKEN}` } });
    body = await res.json();
    check("  with the watcher's bearer the inventory comes back, retention clean", res.status === 200 && body.bnetRetention && body.bnetRetention.overdue === 0 && body.secrets, JSON.stringify(body).slice(0, 200));
    res = await get("https://guild.example/");
    const html = await res.text();
    check("the site host serves the page", res.status === 200 && /<!doctype html>/i.test(html) && html.includes("/static/app.css"), res.status, html.slice(0, 80));
    res = await get("https://guild.example/static/app.css");
    check("  and its stylesheet through the assets binding", res.status === 200 && /text\/css/.test(res.headers.get("Content-Type") || ""), res.status, res.headers.get("Content-Type"));
    res = await get("https://nobody.example/static/app.css");
    check("  which an unknown host cannot fetch (run_worker_first)", res.status === 404, res.status);
    res = await get("https://verify.example/privacy", { redirect: "manual" });
    check("the privacy policy is served on the bot host by the real bundle: 200 HTML, strict CSP, no Location (.65)", res.status === 200 && !res.headers.has("Location") && /script-src 'none'/.test(res.headers.get("Content-Security-Policy") || "") && (await res.text()).includes("<h1>Privacy Policy</h1>"), res.status);
    res = await get("https://verify.example/static/policies.css");
    check("  with its stylesheet from the assets binding on that host", res.status === 200 && /text\/css/.test(res.headers.get("Content-Type") || ""), res.status);
    res = await get("https://old.example/?tab=vote", { redirect: "manual" });
    check("a legacy host is a 301 to the site", res.status === 301 && res.headers.get("Location") === "https://guild.example/?tab=vote", res.status, res.headers.get("Location"));
    res = await get("https://old.example/auth/callback?code=x&state=y", { redirect: "manual" });
    check("  and an OAuth callback there restarts at the front page, uncached", res.status === 302 && res.headers.get("Location") === "https://guild.example/" && res.headers.get("Cache-Control") === "no-store", res.status);
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
    await mf.dispose().catch(() => {});
    fs.rmSync(outdir, { recursive: true, force: true });
  }
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
