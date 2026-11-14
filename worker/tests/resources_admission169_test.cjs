// .170 resourceUpdatesPage: public publishers for the signed-in site audience,
// independent of Guild News/verified characters; original Native/session/standing fences remain.
// Only fixed public publisher transport is answered here. No original source exports, authority,
// clock, schema, session signer or consumer fence are replaced. A full fetch-entry/Workerd run is separate.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript'), entry = require('./helpers/privacy129_fixture.cjs');
const root = path.resolve(__dirname, '..'), SUBJECT = '300000000000000169';
const URL_BASE = 'https://guild.example/api/resource-updates';
const FEEDS = new Set([
  // Evergreen 12 Nov 2026 (siteui-b, CL2-171): Blizzard's post-launch forum-post feed replaced the beta dev-notes thread.
  'https://us.forums.blizzard.com/en/wow/groups/blizzard-tracker/posts.rss',
  'https://www.wowhead.com/news/rss/all', 'https://www.wowhead.com/forever/blue-tracker?rss',
]);
const compiled = new Map();
let n = 0;
function check(name, condition) { assert.ok(condition, name); n++; console.log('PASS ' + name); }
function graph(state) {
  const modules = new Map();
  const cacheStorage = Object.defineProperty({}, 'default', { get() { state.cacheAccess++; return state.cache; } });
  // Only the expiry cases advance the actor clock, at the genuine issuer's exact
  // signed expiry. SQLite's own clock and every real network deadline stay unchanged.
  class FixtureDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(FixtureDate.now()); }
    static now() { return state.actorClockMs ?? Date.now(); }
  }
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto,
    Date: FixtureDate,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal,
    setTimeout, clearTimeout, caches: cacheStorage,
    console: { log(...args) { state.logs.push(args); }, warn(...args) { state.logs.push(args); }, error(...args) { state.logs.push(args); } },
    async fetch(url, init) {
      if (typeof url !== 'string' || !FEEDS.has(url) || init?.redirect !== 'manual' || Object.keys(init.headers).join() !== 'Accept,User-Agent' || init.headers.Accept !== 'application/rss+xml, application/xml, text/xml' || init.headers['User-Agent'] !== 'OlympusFeedReader/1.185 (+https://olympus.roachcouncil.com)') throw Error('unexpected fixture network request');
      state.fetches.push(url);
      if (state.duringProvider && !state.mutated) {
        state.mutated = true;
        const first = state.native.nativeTrace.length;
        await state.duringProvider();
        const end = state.native.nativeTrace.length;
        for (let i = first; i < end; i++) state.fixtureTrace.add(i);
        state.expectedSnapshot = state.snapshot();
      }
      const host = url.includes('us.forums.blizzard.com') ? 'us.forums.blizzard.com' : 'www.wowhead.com';
      return new Response(`<?xml version="1.0"?><rss><channel><item><title>Public Forever publisher headline</title><link>https://${host}/news=169/checked-source</link><pubDate>${new Date(state.now * 1000 - 3600000).toUTCString()}</pubDate><category>Forever</category></item></channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml' } });
    },
  });
  function load(name) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('fixture module name refused');
    if (modules.has(name)) return modules.get(name).exports;
    const module = { exports: {} }; modules.set(name, module);
    if (!compiled.has(name)) compiled.set(name, ts.transpileModule(fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    vm.runInContext('(function(require,module,exports){' + compiled.get(name) + '\n})', context, { filename: name })(q => {
      if (q === 'node:async_hooks') return require(q);
      if (!q.startsWith('./')) throw Error('external source dependency refused');
      return load(q.slice(2));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}
async function fresh() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const now = db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").get().t;
  entry.installCurrentEntryEpoch(db, { now });
  const state = { now, logs: [], fetches: [], cacheAccess: 0, duringProvider: null, mutated: false, fixtureTrace: new Set() };
  const hooks = {}, load = graph(state);
  const native = entry.originalNativePort(db, { beforeBatch: plan => hooks.beforeBatch?.(plan) }); state.native = native;
  const rawEnv = entry.currentEntryEnvironment({ DB: native,
    COOKIE_SECRET: 'resource169-fixture-cookie-secret-only-0123456789', VERIFY_SECRET: 'resource169-fixture-verification-secret',
    SITE_HOST: 'guild.example', SITE_GUILD_ID: '236932545793490944', GUILD_ID: '1549537348516188200',
    DISCORD_APP_ID: '1550176895671341076', SITE_ADMINS: '', COMMUNITY_ORGANIZERS: '', COMMUNITY_FEATURES: '', PUBLIC_BASE_URL: 'https://verify.example' });
  const writer = load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = { ...rawEnv, DB: writer };
  const write = (sql, ...args) => writer.prepare(sql).bind(...args).run();
  await write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version)VALUES(?,?,?,?,?,1,0,1)', SUBJECT, 'resource-fixture', now, now, now);
  await write('INSERT INTO members(discord_id)VALUES(?)', SUBJECT);
  await write("INSERT INTO characters(name_key,name,discord_id,status,bound_at)VALUES(?,?,?,'member',?)", 'resource witness', 'Resource Witness', SUBJECT, now);
  const issued = await entry.issueOriginalEntryCookie(load, db, rawEnv, SUBJECT);
  const api = load('site-api'), core = load('site-core'), authority = load('privacy-serving-authority');
  function snapshot() {
    return JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({ name }) => [name, db.prepare('SELECT * FROM "' + name.replace(/"/g, '""') + '"').all()]));
  }
  state.snapshot = snapshot;
  async function invoke(options = {}) {
    const pathname = options.path ?? '/api/resource-updates';
    const request = new Request(new URL(pathname, URL_BASE), { headers: options.signedOut ? {} : { Cookie: issued.cookie } });
    const session = await core.readSession(env, request);
    const bound = session ? authority.privacyBoundSiteEnv(env, session) : env;
    state.fetches = []; state.cacheAccess = 0; state.logs = []; state.mutated = false; state.fixtureTrace.clear();
    const firstTrace = native.nativeTrace.length, before = snapshot(); state.expectedSnapshot = before;
    let response, held;
    try {
      // handleApi establishes its own original session binding. The real fetch entry
      // receives the original Native transport and constructs the admitted writer.
      response = options.entry ? await load('index').default.fetch(request, rawEnv, { waitUntil() {} })
        : options.dispatch ? await api.handleApi(request, env, pathname, () => {})
        : await api.resourceUpdatesPage(request, bound);
    } catch (error) {
      if (!options.typedHeld || !(error instanceof authority.PrivacySiteRequestHeld) || error.message !== 'privacy_site_request_held') throw error;
      held = error;
    }
    const trace = native.nativeTrace.map((row, i) => ({ ...row, originalIndex: i })).slice(firstTrace).filter(row => !state.fixtureTrace.has(row.originalIndex));
    const body = response ? await response.json() : null;
    check('actual route executes SELECT/WITH only outside explicit fixture changes', trace.every(row => /^\s*(SELECT|WITH)\b/.test(row.sql)));
    check('actual route leaves all synthetic application/control tables unchanged', snapshot() === state.expectedSnapshot);
    const heldCauses = ['authority', 'sql_json_refused', 'sql_trigger_refused'];
    const fixedHoldLog = line => Array.isArray(line) && (
      line.length === 5 && line[0] === 'privacy request held' && line[1] === 'site_session' && heldCauses.includes(line[2]) &&
        line[3] === 'read' && ['under_100ms', 'under_500ms', 'under_2s', '2s_or_more', 'unknown'].includes(line[4]) ||
      line.length === 6 && line[0] === 'request held' && line[1] === 'site' && line[2] === 'error' && heldCauses.includes(line[3]) &&
        ['read', 'unknown'].includes(line[4]) && line[5] === 'api_other');
    check('actual route logs no session, account or provider payload, only fixed refused-read diagnostics',
      state.logs.length === 0 || (held || response?.status === 503) && state.logs.length <= 2 && state.logs.every(fixedHoldLog));
    if (pathname === '/api/resource-updates') check('public updates never read guild characters, member facts, notices, figures or leadership data', !trace.some(row => /\b(?:FROM|JOIN)\s+(?:characters|members|site_news_notices|site_leadership|roster_snapshots)\b/i.test(row.sql)));
    return { response, body, held, trace, before };
  }
  async function news(on) { await write("INSERT INTO site_settings(key,value,updated_at)VALUES('newsOn',?,?) ON CONFLICT(key)DO UPDATE SET value=excluded.value", on ? '1' : '0', now); }
  return { db, now, state, hooks, load, env, write, news, issued, snapshot, invoke, close() { db.close(); } };
}
async function caseWith(name, work) { const f = await fresh(); try { await work(f); console.log('CASE ' + name); } finally { f.close(); } }
const noPayload = body => !Object.prototype.hasOwnProperty.call(body, 'sources') && !Object.prototype.hasOwnProperty.call(body, 'items');

(async () => {
  // .176 deliberately adds a separate Community viewing boundary. Preserve the
  // original whole-News invariant after reversing ONLY these exact authorized
  // reader/annotation deltas; writes, lifetimes, private fields and clocks still
  // have to match the original source bytes. This is not an arbitrary new pin.
  let originalNews = fs.readFileSync(path.join(root, 'src/site-news.ts'), 'utf8').replace(/\r\n/g, '\n');
  // .265 reverses only the exact owner-directed bounded-audit release note.
  const release265 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".265\", date: \"2026-11-10\", lines: [",
    "      \"Background guild rank checks now use narrower audit lookups while retaining the same eligibility and safety checks.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .265 prepend occurs once', originalNews.split(release265).length === 2);
  originalNews = originalNews.replace(release265, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .264 reverses only the exact owner-directed independent-wakeup release note.
  const release264 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".264\", date: \"2026-11-10\", lines: [",
    "      \"The Watcher can resume pending role checks independently while guarded lease cleanup reports bounded provider failures.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .264 prepend occurs once', originalNews.split(release264).length === 2);
  originalNews = originalNews.replace(release264, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .263 reverses only the exact owner-directed lease-cleanup release note.
  const release263 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".263\", date: \"2026-11-10\", lines: [",
    "      \"Role sweeps retain their own lease cleanup attempt when acquisition acknowledgement is unconfirmed.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .263 prepend occurs once', originalNews.split(release263).length === 2);
  originalNews = originalNews.replace(release263, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .262 reverses only the exact owner-directed bridge-delivery release note.
  const release262 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".262\", date: \"2026-11-10\", lines: [",
    "      \"Independent sync work and saved transfer observations recover without replaying unresolved originals.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .262 prepend occurs once', originalNews.split(release262).length === 2);
  originalNews = originalNews.replace(release262, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .261 reverses only the exact owner-directed bridge-delivery release note.
  const release261 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".261\", date: \"2026-11-10\", lines: [",
    "      \"Addon bridge requests now receive bounded delivery receipts from their configured guild collector.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .261 prepend occurs once', originalNews.split(release261).length === 2);
  originalNews = originalNews.replace(release261, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .260 reverses only the exact owner-directed diagnostic release note.
  const release260 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".260\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank updates now continue through the public Worker route across queued batches.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .260 prepend occurs once', originalNews.split(release260).length === 2);
  originalNews = originalNews.replace(release260, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .259 reverses only the exact owner-directed diagnostic release note.
  const release259 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".259\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank handoff diagnostics now remain visible across deferred callbacks.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .259 prepend occurs once', originalNews.split(release259).length === 2);
  originalNews = originalNews.replace(release259, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .258 reverses only the exact owner-directed diagnostic release note.
  const release258 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".258\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank reconciliation now reports bounded handoff failures for reliable operator follow-up.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .258 prepend occurs once', originalNews.split(release258).length === 2);
  originalNews = originalNews.replace(release258, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .257 reverses only the exact owner-directed live-first release note.
  const release257 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".257\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank updates continue reliably across bounded sync batches.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .257 prepend occurs once', originalNews.split(release257).length === 2);
  originalNews = originalNews.replace(release257, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .256 reverses only the exact owner-directed live-first release note.
  const release256 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".256\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank changes are reconciled after each roster sync.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .256 prepend occurs once', originalNews.split(release256).length === 2);
  originalNews = originalNews.replace(release256, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .255 reverses only the exact owner-directed live-first release note.
  const release255 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".255\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank changes are processed across the full roster after syncing.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .255 prepend occurs once', originalNews.split(release255).length === 2);
  originalNews = originalNews.replace(release255, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .254 reverses only the exact owner-directed live-first release note.
  const release254 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".254\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank updates continue across the full roster after syncing.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .254 prepend occurs once', originalNews.split(release254).length === 2);
  originalNews = originalNews.replace(release254, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .253 reverses only the exact owner-directed live-first release note.
  const release253 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".253\", date: \"2026-11-10\", lines: [",
    "      \"Guild rank updates continue through bounded production batches after a roster sync.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .253 prepend occurs once', originalNews.split(release253).length === 2);
  originalNews = originalNews.replace(release253, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .252 reverses only the exact owner-directed live-first release note.
  const release252 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".252\", date: \"2026-11-10\", lines: [",
    "      \"Verification delivery resumes after time away. Account updates keep moving when an older request is held.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .252 prepend occurs once', originalNews.split(release252).length === 2);
  originalNews = originalNews.replace(release252, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .251 reverses only the exact owner-directed live-first release note.
  const release251 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".251\", date: \"2026-11-10\", lines: [",
    "      \"Verification mail keeps separate delivery records. Donation records expire from their original observation date.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .251 prepend occurs once', originalNews.split(release251).length === 2);
  originalNews = originalNews.replace(release251, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .250 reverses only the exact owner-directed live-first release note.
  const release250 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".250\", date: \"2026-11-10\", lines: [",
    "      \"Legacy Watcher installations retain their existing verification forwarding. Membership-only verification keeps its original native-evidence checks.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .250 prepend occurs once', originalNews.split(release250).length === 2);
  originalNews = originalNews.replace(release250, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .249 reverses only the exact owner-directed live-first release note.
  const release249 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".249\", date: \"2026-11-10\", lines: [",
    "      \"Account update batches finish after one complete roster traversal. Fresh verification whispers and donation receipts retain their own delivery records.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .249 prepend occurs once', originalNews.split(release249).length === 2);
  originalNews = originalNews.replace(release249, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .248 reverses only the exact owner-directed live-first release note.
  const release248 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".248\", date: \"2026-11-10\", lines: [",
    "      \"Status checks do not start account updates. Inactive modes keep their original request behavior.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .248 prepend occurs once', originalNews.split(release248).length === 2);
  originalNews = originalNews.replace(release248, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .247 reverses only the exact owner-directed live-first release note.
  const release247 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".247\", date: \"2026-11-10\", lines: [",
    "      \"Donation observations are included in account-copy accounting and cleanup. Sync status keeps its lightweight request path.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .247 prepend occurs once', originalNews.split(release247).length === 2);
  originalNews = originalNews.replace(release247, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .246 reverses only the exact owner-directed live-first release note.
  const release246 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".246\", date: \"2026-11-10\", lines: [",
    "      \"Rank-update continuations now use the supported request mode and refuse redirects.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .246 prepend occurs once', originalNews.split(release246).length === 2);
  originalNews = originalNews.replace(release246, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .245 reverses only the exact owner-directed live-first release note.
  const release245 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".245\", date: \"2026-11-10\", lines: [",
    "      \"Rank updates continue while the current request has room, with the same per-account identity and request-budget checks.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .245 prepend occurs once', originalNews.split(release245).length === 2);
  originalNews = originalNews.replace(release245, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .244 reverses only the exact owner-directed live-first release note.
  const release244 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".244\", date: \"2026-11-10\", lines: [",
    "      \"Verification, access checks and donation pages preserve the core service's startup order.\",",
    "      \"Donation privacy handling remains available independently of opening the ledger.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .244 prepend occurs once', originalNews.split(release244).length === 2);
  originalNews = originalNews.replace(release244, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .243 reverses only the exact owner-directed live-first release note.
  const release243 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".243\", date: \"2026-11-10\", lines: [",
    "      \"Queued verification proofs keep their original ownership and receive explicit server outcomes.\",",
    "      \"Watcher 0.6.21 improves mixed old-and-new verification batches without discarding pending evidence.\",",
    "      \"Access diagnostics and role refreshes load the existing verification checks when needed.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .243 prepend occurs once', originalNews.split(release243).length === 2);
  originalNews = originalNews.replace(release243, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .242 reverses only the exact owner-directed live-first release note.
  const release242 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".242\", date: \"2026-11-10\", lines: [",
    "      \"Verified character ranks refresh through continuing batches after a roster sync.\",",
    "      \"OlympusVerify 0.6.22 adds persistent verification intake, mail handling and donation observations with Watcher 0.6.20.\",",
    "      \"Use Verify my character on the site, or ask High Council to use /olympus check for access diagnostics.\",",
    "      \"Character nicknames use <Guild Name>; the previous nickname can still be restored.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .242 prepend occurs once', originalNews.split(release242).length === 2);
  originalNews = originalNews.replace(release242, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .241 reverses only the exact recent-rank-priority member release note.
  const release241 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".241\", date: \"2026-11-09\", lines: [",
    "      \"Recent in-game rank changes get priority while older rank updates catch up.\",",
    "      \"Existing verification and account-safety checks still apply.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .241 prepend occurs once', originalNews.split(release241).length === 2);
  originalNews = originalNews.replace(release241, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .240 reverses only the exact retired-role continuity release note.
  const release240 = [
  "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
  "  {",
  "    build: \".240\", date: \"2026-11-08\", lines: [",
  "      \"Promotions and demotions keep syncing after older cosmetic rank roles are retired.\",",
  "      \"The official OlympusVerify addon stays at 0.6.21.\",",
  "    ],",
  "  },",
  ""
  ].join('\n');
  check('Guild News exact authorized .240 prepend occurs once', originalNews.split(release240).length === 2);
  originalNews = originalNews.replace(release240, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .239 reverses only the exact migration coordination release note.
  const release239 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".239\", date: \"2026-11-08\", lines: [",
    "      \"Role cleanup coordinates with background rank checks.\",",
    "      \"Verified guild ranks keep updating after legacy roles are cleaned up.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .239 prepend occurs once', originalNews.split(release239).length === 2);
  originalNews = originalNews.replace(release239, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .238 reverses only the exact rank scheduling release note.
  const release238 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".238\", date: \"2026-11-08\", lines: [",
    "      \"New guild rank changes take priority over older role reconciliation work.\",",
    "      \"Background rank checks continue while the officer roster is fresh.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .238 prepend occurs once', originalNews.split(release238).length === 2);
  originalNews = originalNews.replace(release238, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .237 reverses only the exact scoped-rank validation release note.
  const release237 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".237\", date: \"2026-11-07\", lines: [",
    "      \"An unrecognized roster rank no longer blocks updates for other verified characters.\",",
    "      \"Characters with uncertain rank data stay on hold until their rank is confirmed.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .237 prepend occurs once', originalNews.split(release237).length === 2);
  originalNews = originalNews.replace(release237, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .236 reverses only the exact official addon download repair release note.
  const release236 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".236\", date: \"2026-11-06\", lines: [",
    "      \"The official verification addon download is available with the roster performance repair.\",",
    "      \"The addon remains version 0.6.21 with the same roster performance repair.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .236 prepend occurs once', originalNews.split(release236).length === 2);
  originalNews = originalNews.replace(release236, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .234 reverses only this exact verified character continuity release note.
  // .235 reverses only this exact addon background CPU release note.
  const release235 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".235\", date: \"2026-11-06\", lines: [",
    "      \"The verification addon reuses unchanged roster snapshots to reduce background CPU use.\",",
    "      \"Manual Sync and in-game verification keep their existing checks.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .235 prepend occurs once', originalNews.split(release235).length === 2);
  originalNews = originalNews.replace(release235, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  const release234 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".234\", date: \"2026-11-06\", lines: [",
    "      \"An old unproven character link no longer blocks a freshly verified character from using the nickname buttons.\",",
    "      \"Current character proof, guild standing and Discord nickname permissions are still required.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .234 prepend occurs once', originalNews.split(release234).length === 2);
  originalNews = originalNews.replace(release234, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .233 reverses only this exact unified ranks and officer actions release note.
  const release233 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".233\", date: \"2026-11-06\", lines: [",
    "      \"Use one Olympus rank at a time, with guild access provided by that rank. Uncertain evidence keeps changes on hold.\",",
    "      \"Verified members can choose a character-and-guild nickname and restore their previous server nickname.\",",
    "      \"A movable pending-sync alert lets officers flush verification with one click or key press.\",",
    "      \"Officer queues use the live Veteran and Member ranks. Each invite, promotion or removal requires attended native checks.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .233 prepend occurs once', originalNews.split(release233).length === 2);
  originalNews = originalNews.replace(release233, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .232 reverses only this exact roster/rank reconciliation preparation note.
  const release232 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".232\", date: \"2026-11-05\", lines: [",
    "      \"Native rank checks use the current guild ladder and keep shared guild access alongside the correct rank label.\",",
    "      \"Keep verification codes pending until the exchange is acknowledged; refreshing roster evidence does not consume them.\",",
    "      \"The current named ladder includes Stewart; its new rank label grants no extra staff powers.\",",
    "      \"Native ranks do not create Council appointments. Uncertain roster or provider outcomes keep role changes on hold.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .232 prepend occurs once', originalNews.split(release232).length === 2);
  originalNews = originalNews.replace(release232, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .231 reverses only this exact D1 compatibility release note.
  const release231 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".231\", date: \"2026-11-05\", lines: [",
    "      \"Fix a database compatibility issue that could leave Discord membership access waiting after verification succeeded.\",",
    "      \"Existing account, guild and privacy checks still apply before access can be granted.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .231 prepend occurs once', originalNews.split(release231).length === 2);
  originalNews = originalNews.replace(release231, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .230 reverses only this exact native membership access release note.
  const release230 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".230\", date: \"2026-11-05\", lines: [",
    "      \"Verification reports confirmed membership separately from Guild Member access and shows when access is on hold.\",",
    "      \"A fresh in-game verification can restore missing Guild Member access after the launch access checks pass.\",",
    "      \"Discord verification instructions name OLYMPUS PRIME and direct members to their current account instructions or an officer for help.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .230 prepend occurs once', originalNews.split(release230).length === 2);
  originalNews = originalNews.replace(release230, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .229 reverses only this exact launch operations release note.
  const release229 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".229\", date: \"2026-11-05\", lines: [",
    "      \"OLYMPUS PRIME is the flagship. Legacy Olympus and Olympus I names remain recognized without changing signed records.\",",
    "      \"Staff can scan native roster recommendations for Knight promotions, verified Initiates and advisory space review. Each promotion needs a fresh check and an attended click.\",",
    "      \"The launch desk offers a short guild message and expanded verification bulletin. Unknown guild state remains held for invites.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .229 prepend occurs once', originalNews.split(release229).length === 2);
  originalNews = originalNews.replace(release229, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .228 reverses only the exact Evergreen release note.
  const release228 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".228\", date: \"2026-11-04\", lines: [",
    "      \"The role directory and governance book link to matching ranks, offices and articles. Admin settings group related tools.\",",
    "      \"The guide library includes updated Forever class advice and a raid-team planning reference.\",",
    "      \"The Discord command update prepares /raid hub and direct scheduling and roster commands alongside /event.\",",
    "      \"Site controls reflow at higher zoom on narrow screens. Login artwork credits identify the stills and the optional portal render.\",",
    "      \"Ordinary application declines remain eligible for account erasure. Erasure requests tied to an older denial without verified decision evidence go to private staff review.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .228 prepend occurs once', originalNews.split(release228).length === 2);
  originalNews = originalNews.replace(release228, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .227 reverses only this exact launch-readiness release note.
  const release227 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".227\", date: \"2026-11-03\", lines: [",
    "      \"Verification can require a fresh roster and matching native character identity before an account is linked.\",",
    "      \"The officer addon records completed gold transfers and collected mail for local reconciliation; transfers never automatically grant benefits.\",",
    "      \"The Companion aggregate feed remains off pending live producer evidence and realm mapping.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .227 prepend occurs once', originalNews.split(release227).length === 2);
  originalNews = originalNews.replace(release227, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .226 reverses only the exact owner-event release note.
  const release226 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".226\", date: \"2026-11-03\", lines: [",
    "      \"The bot owner can use raid-announcement buttons, see their signup on event rosters and record their own post-start attendance without character verification.\",",
    "      \"Ordinary member checks, event limits, account safety and staff permissions remain in place.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .226 prepend occurs once', originalNews.split(release226).length === 2);
  originalNews = originalNews.replace(release226, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .225 reverses only this exact owner-access release note.
  const release225 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".225\", date: \"2026-11-02\", lines: [",
    "      \"The bot owner can use private Discord utilities without a verified character. Everyone else retains the existing verification requirement; account safety and staff permissions still apply.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .225 prepend occurs once', originalNews.split(release225).length === 2);
  originalNews = originalNews.replace(release225, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .224 reverses only this exact owner-authorized Cabinet and hub release note.
  const release224 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".224\", date: \"2026-11-02\", lines: [",
    "      \"The twelve reserved High Council portfolios now share a cohesive Imperial Cabinet naming convention, with existing office keys, appointments and historical ballots preserved.\",",
    "      \"The private /olympus hub brings verification, guides, talents, opted-in Workshop lookup, branches and guild roles together. Leadership seats stay reserved; Treasury offers remain paused.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .224 prepend occurs once', originalNews.split(release224).length === 2);
  originalNews = originalNews.replace(release224, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .223 reverses only the exact class-badge correction release note.
  const release223 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".223\", date: \"2026-11-02\", lines: [",
    "      \"Applicant cards now show one class icon beside the colored class name. Discord portraits still require the applicant’s separate consent and fall back to the neutral member emblem.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .223 prepend occurs once', originalNews.split(release223).length === 2);
  originalNews = originalNews.replace(release223, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');

  // .222 reverses only its exact owner-authorized prepend and owner-only DTO gate.
  const release222 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".222\", date: \"2026-11-01\", lines: [",
    "      \"The private raid hub brings event selection, signup preferences, rosters and organizer forms together; existing reminder and attendance safeguards remain.\",",
    "      \"Council guides distinguish the Minister of Propaganda from technical architecture, and use consistent portfolio titles without changing appointments or access.\",",
    "      \"Organization connections use a tree layout with card-border ports. Resource cards use existing game artwork with readable text overlays.\",",
    "      \"Site updates are owner-only. Applicant portrait consent stays intact, with a neutral fallback and one class badge. The retired external news promotion is removed.\",",
    "      \"The beta-role and channel-permission audit is recorded separately; membership assignments and live-release activation remain unchanged.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .222 prepend occurs once', originalNews.split(release222).length === 2);
  originalNews = originalNews.replace(release222, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  const ownerGate222 = "releases: ctx.subject?.discordId === '472099715253796864' ? RELEASE_NOTES.slice(0, 5) : [],";
  check('owner-only release gate has one exact source occurrence', originalNews.split(ownerGate222).length === 2);
  originalNews = originalNews.replace(ownerGate222, 'releases: RELEASE_NOTES.slice(0, 5),');
  // .221 reverses only the exact new evergreen note; all older finite inverses stay intact.
  const release221 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".221\", date: \"2026-11-01\", lines: [",
    "      \"Role search handles regional names and punctuation; the rank crosswalk gives one clear portal-access summary.\",",
    "      \"Launch guidance advances to the announced first raid date after launch, without inventing a regional raid-unlock time.\",",
    "      \"Namespaced account commands open the existing private controls. Forever guides share the current catalogue, and Workshop orders prepare an explicitly unsent commission draft.\",",
    "      \"Officer request release cannot unlink an existing character. Database schema, privacy safeguards and optional integration gates are unchanged.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .221 prepend occurs once', originalNews.split(release221).length === 2);
  originalNews = originalNews.replace(release221, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .220 reverses only the exact new channel-guidance note; historical News stays pinned.
  const release220 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".220\", date: \"2026-11-01\", lines: [",
    "      \"Verification and raid instructions name the renamed Discord channels. Existing channel IDs and routing remain unchanged.\",",
    "      \"Raid notices support RSVP buttons or the website calendar; the raid leader confirms the roster. Reminders still require an explicit organizer opt-in.\",",
    "      \"This guidance update changes no permissions, privacy rules, database schema or optional integration gates.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .220 prepend occurs once', originalNews.split(release220).length === 2);
  originalNews = originalNews.replace(release220, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .219 reverses only this uniquely counted owner release note.
  const release219 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".219\", date: \"2026-10-31\", lines: [",
    "      \"Submitted and Under review applications can be edited in place. Original submission and review history stay on record.\",",
    "      \"Main, declared alts, class, specialization, optional builds, availability, track and notes can be updated. Old or stale editors must reload before saving.\",",
    "      \"Role families have one clear specification with separate regional and class duties. Leadership seats remain reserved appointments.\",",
    "      \"Private /raid and /event commands share the website calendar and seven signup preferences. Authorized officers can arm one reminder and lock attendance after start.\",",
    "      \"Discord guide, talent, Workshop, Treasury, Stockades, Council, branch and launch references use the existing website sources and preserve private access boundaries.\",",
    "      \"No schema or external integration is activated. The relay stays unmounted pending publisher confirmation; cosmetic dispatch, Army publishing and Olympus Link remain OFF.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .219 prepend occurs once', originalNews.split(release219).length === 2);
  originalNews = originalNews.replace(release219, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .218 prepends this exact dated member-facing note. Reverse only this
  // finite, counted literal before the unchanged historical inverses and hash.
  const release218 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".218\", date: \"2026-10-30\", lines: [",
    "      \"Ten native ranks, twelve separate Council portfolios and the guild ministries share one role directory. Institutions and historical mandates are labelled separately.\",",
    "      \"Role guides retain distinct duties, regional remits and collaborators. Leadership seats remain reserved appointments, with no public application shortcut.\",",
    "      \"Class and profession guides, curated addons and new tools accompany an animated talent comparison. Dated sources and provisional advice stay labelled.\",",
    "      \"The practical Officer Operational Guide has one home. The Treasury strategy is restricted to officers and above; public reference material stays separate.\",",
    "      \"Home and Apply separate the announced global launch from website entry and guild invite scheduling. Optional writ proposals remain inactive, with no assumed revenue.\",",
    "      \"Privacy and provider safeguards remain in place. Uncertain host outcomes, real game validation and optional activation are reported separately.\",",
    "    ],",
    "  },",
    "",
  ].join('\n');
  check('Guild News exact authorized .218 prepend occurs once', originalNews.split(release218).length === 2);
  originalNews = originalNews.replace(release218, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .204 corrects only the announced beta DTO and this exact dated release note.
  // Invert these THREE finite literals first; all .197/.196/.176 inverses and
  // the original whole-file SHA safeguard below remain unchanged.
  const authorizedNews204Deltas = [
    [
      'later announced beta schedule constant',
      [
        '/** Later official announcement, 20 Oct 2026: a planned shutdown, not an observed server-closure receipt. */',
        'export const BETA_ANNOUNCED_CLOSURE = Object.freeze({',
        '  announcedClosureAt: 1792774800, // 23 Oct 2026, 10:00 PDT = 17:00 UTC',
        '  announcementDate: "2026-10-20",',
        '  source: "https://us.forums.blizzard.com/en/wow/t/heads-up-wow-forever-stress-test-on-october-21/2387920",',
        '  scheduleStatus: "announced-plan-not-observed",',
        '});',
      ].join('\n'),
      '/** Blizzard names 21 October 2026 as the beta\'s last full day, and no hour (site-leadership.ts). */\nexport const BETA_LAST_FULL_DAY = "2026-10-21";',
    ],
    [
      'exact dated .204 factual-copy release note',
      [
        'export const RELEASE_NOTES: readonly ReleaseNote[] = [',
        '  {',
        '    build: ".204", date: "2026-10-26", lines: [',
        '      "Name-reservation defaults now use North America\'s announced 27 October, 20:00 UTC opening. Saved administrator settings still take precedence.",',
        '      "Beta dates identify Blizzard\'s later planned shutdown, with its source and announcement date, rather than claiming the server closure was observed.",',
        '      "Guild direction uses realmless ruleset terminology. Raid guides cover 10-, 20- and 40-player encounters; planning-name rules remain local, not a Blizzard availability check.",',
        '      "Dated talent evidence, publisher adoption and real game acceptance remain separate from these factual-copy corrections. Optional service and provider gates stay unchanged.",',
        '    ],',
        '  },',
        '',
      ].join('\n'),
      'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n',
    ],
    [
      'announced-plan News response DTO',
      '    beta: { ...BETA_ANNOUNCED_CLOSURE, launchAt: settings.launchAt },',
      '    beta: { lastFullDay: BETA_LAST_FULL_DAY, launchAt: settings.launchAt },',
    ],
  ];
  for (const [label, current, preceding] of authorizedNews204Deltas) {
    check('Guild News exact authorized .204 delta occurs once: ' + label, originalNews.split(current).length === 2);
    originalNews = originalNews.replace(current, preceding);
  }
  // .197 adds this exact dated owner-authorized release note. Reverse only this
  // finite literal before preserving every prior .196/.176 safeguard below.
  const release197 = [
    "export const RELEASE_NOTES: readonly ReleaseNote[] = [",
    "  {",
    "    build: \".197\", date: \"2026-10-24\", lines: [",
    "      \"The owner-supplied guild tabard is the crest across the guild hall, sign-in, Army, rank planning and legal pages. Footer attribution ends at the code-licence notice.\",",
    "      \"Canonical legal pages stay available without JavaScript. Optional login motion can be hidden, and reduced-motion/data-saving visits retain the approved stills.\",",
    "      \"Declared talent builds need separate voting-board sharing consent. Branch links need publication consent and current account checks; neither grants a role or verifies a game character.\",",
    "      \"Army import and watcher restart/custody follow-ups preserve unknown outcomes. Publisher adoption, real game checks and optional feature activation remain separate gates.\",",
    "    ],",
    "  },",
    ""
  ].join('\n');
  check('Guild News exact authorized .197 release note occurs once', originalNews.split(release197).length === 2);
  originalNews = originalNews.replace(release197, 'export const RELEASE_NOTES: readonly ReleaseNote[] = [\n');
  // .196 owner-authorized Town Crier editor, optional webhook custody and
  // dated release-note deltas. Reverse these EIGHT finite exact blocks to the
  // accepted .195 source before the original five .176 reversals and original
  // whole-file safeguard hash below. No arbitrary repin, skip or fallback.
  // Reviewed static provenance: master196-frontend174-news-static-diagnosis.json.
  const authorizedNews196Deltas = [
    [
      "same-origin helper import",
      "import { apiJson, PAGE_VERSION, rateLimited, sameOrigin, type SiteUser } from \"./site-core\";",
      "import { apiJson, PAGE_VERSION, rateLimited, type SiteUser } from \"./site-core\";"
    ],
    [
      "Town Crier and webhook imports",
      "import { errorRef } from \"./log\";\nimport { capturePublishedOfficeAuthority, publishedOfficeAuthorityCondition, type PublishedOfficeAuthority } from './site-appointed-identities';\nimport { newsWebhookMutationPlan } from './site-news-webhook';",
      "import { errorRef } from \"./log\";"
    ],
    [
      "dated .196 release note",
      "export const RELEASE_NOTES: readonly ReleaseNote[] = [\n  {\n    build: \".196\", date: \"2026-10-23\", lines: [\n      \"Public PvE Alliance direction, an Olympus-only Discord directory with opt-out, applicant portraits beside class icons, and listings for all native ranks and extended offices.\",\n      \"Army review, rank planning and legal pages share the guild hall. The approved local helper stays local; unified guild export still requires publisher adoption.\",\n      \"The nine-class talent planner supports comparisons and private application build attachments. Displayed calculations do not claim verified live game statistics.\",\n      \"Optional Town Crier, Stream Shield, Workshop and Treasury controls; Discord webhooks and cosmetic roles require operator configuration. Olympus Link remains off.\",\n    ],\n  },\n",
      "export const RELEASE_NOTES: readonly ReleaseNote[] = [\n"
    ],
    [
      "editor-scoped notice projection",
      "const adminNotice = (r: AdminRow) => ({ id: r.id, ...memberNotice(r), revision: r.revision, createdBy: r.created_by, updatedBy: r.updated_by });\nconst noticeDto = (r: AdminRow, editor?: PublishedOfficeAuthority) => editor ? { id: r.id, ...memberNotice(r), revision: r.revision } : adminNotice(r);\n",
      "const adminNotice = (r: AdminRow) => ({ id: r.id, ...memberNotice(r), revision: r.revision, createdBy: r.created_by, updatedBy: r.updated_by });\n"
    ],
    [
      "office-authorized editor helpers and listing",
      "const editorForbidden = () => apiJson({ error: 'news_editor_forbidden', message: 'Your current Town Crier editor appointment could not be confirmed.' }, 403);\nconst editorCondition = (editor: PublishedOfficeAuthority | undefined, first: number) => editor ? publishedOfficeAuthorityCondition(editor, first) : { sql: '1', values: [] as readonly string[] };\nconst noticeRefusal = (request: Request, env: Env, editor?: PublishedOfficeAuthority) => editor ? editorForbidden() : refusal(env, request, 'applicantWrite');\n/** Each editor read, including a replay/refusal, repeats the exact original map\n * and target incarnation in the same Native transaction as its payload. */\nasync function newsRead(env: Env, ctx: CommunityContext, statements: D1PreparedStatement[], editor?: PublishedOfficeAuthority): Promise<D1Result[] | typeof FENCE_REFUSED> {\n  if (!editor) return admittedRead(env, ctx, 'applicantWrite', statements);\n  const condition = editorCondition(editor, 1);\n  const out = await admittedRead(env, ctx, 'applicantWrite', [env.DB.prepare(`SELECT (${condition.sql}) AS editor_ok`).bind(...condition.values), ...statements]);\n  return out === FENCE_REFUSED || rowsOf<{ editor_ok: number }>(out[0])[0]?.editor_ok !== 1 ? FENCE_REFUSED : out.slice(1);\n}\n\n/** /api/news/editor[/update|delete]. The real signed actor is supplied by the\n * original site API; a boot flag, client actor or fabricated communityStaff is\n * never an editor capability. Existing administrators keep their old handler. */\nexport async function handleTownCrierEditor(request: Request, env: Env, parts: string[], user: SiteUser, body: Record<string, unknown>): Promise<Response> {\n  const ctx = await communityContext(env, request);\n  if (!ctx.subject || ctx.subject.discordId !== user.discord_id || !ctx.capabilities.applicantWrite || ctx.facts.banned) return editorForbidden();\n  if (ctx.capabilities.communityStaff) return handleNewsAdmin(request, env, parts, user, body);\n  const authority = await capturePublishedOfficeAuthority(env, ctx.subject.discordId, ['office_50']);\n  if (!authority || await newsRead(env, ctx, [env.DB.prepare('SELECT 1 AS editor_admitted')], authority) === FENCE_REFUSED) return editorForbidden();\n  const sub = parts.join('/');\n  let response: Response;\n  if (request.method === 'GET' && sub === '') response = await adminList(request, env, ctx, authority);\n  else {\n    if (request.method !== 'POST' || !['', 'update', 'delete'].includes(sub)) return apiJson({ error: 'not_found' }, 404);\n    if (!sameOrigin(request)) return apiJson({ error: 'bad_origin' }, 403);\n    if (request.headers.get('X-Olympus') !== PAGE_VERSION) return apiJson({ error: 'reload', message: 'Reload the page before editing News.' }, 409);\n    if (rateLimited(`nw:${ctx.subject.discordId}`, NEWS_LIMITS.writesPerMin, 60)) return apiJson({ error: 'slow_down' }, 429);\n    response = sub === '' ? await createNotice(request, env, ctx, body, authority)\n      : sub === 'update' ? await updateNotice(request, env, ctx, body, authority)\n        : await deleteNotice(request, env, ctx, body, authority);\n  }\n  // A successful commit remains committed if publication is revoked afterwards;\n  // its earlier content/receipt is withheld, not silently repeated or undone.\n  if (await newsRead(env, ctx, [env.DB.prepare('SELECT 1 AS editor_response_admitted')], authority) === FENCE_REFUSED) return editorForbidden();\n  return response;\n}\n\nasync function adminList(request: Request, env: Env, ctx: CommunityContext, editor?: PublishedOfficeAuthority): Promise<Response> {\n  const out = await newsRead(env, ctx, [\n    env.DB.prepare(`${ADMIN_COLUMNS} WHERE ${LIVE} ORDER BY created_at DESC, id LIMIT ${NEWS_LIMITS.liveMax}`),\n    env.DB.prepare(\n      `SELECT (SELECT COUNT(*) FROM site_news_notices WHERE retain_until <= ${DB_NOW}) AS expired, (SELECT COUNT(*) FROM site_news_ops) AS ops,\n              (SELECT value FROM site_settings WHERE key = 'newsOn') AS news_on, ${DB_NOW} AS db_now`,\n    ),\n  ], editor);\n  if (out === FENCE_REFUSED) return noticeRefusal(request, env, editor);\n  const c = rowsOf<{ expired: number; ops: number; news_on: string | null; db_now: number }>(out[1])[0];\n  return apiJson({\n    now: now(),\n    newsOn: newsOnFrom(env, c?.news_on),\n    limits: NEWS_LIMITS,\n    notices: rowsOf<AdminRow>(out[0]).map(row => noticeDto(row, editor)),\n    awaitingCleanup: c?.expired ?? 0, // past their time: hidden from every read already, deleted by the next cron runs\n    operationRecords: c?.ops ?? 0,\n    // Codex's finding 5 (3 Oct 2026): the page's next create goes under this id, stamped with the database clock of this\n    // read, so createNotice can refuse it once it is older than opIssueMaxAgeS. Without a time from the database there is\n    // no id, and the page cannot post (fail closed).\n    opId: Number.isSafeInteger(c?.db_now) && c!.db_now > 0 ? newOpId(c!.db_now) : null,\n  });\n}\n\n",
      "async function adminList(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {\n  const out = await admittedRead(env, ctx, \"applicantWrite\", [\n    env.DB.prepare(`${ADMIN_COLUMNS} WHERE ${LIVE} ORDER BY created_at DESC, id LIMIT ${NEWS_LIMITS.liveMax}`),\n    env.DB.prepare(\n      `SELECT (SELECT COUNT(*) FROM site_news_notices WHERE retain_until <= ${DB_NOW}) AS expired, (SELECT COUNT(*) FROM site_news_ops) AS ops,\n              (SELECT value FROM site_settings WHERE key = 'newsOn') AS news_on, ${DB_NOW} AS db_now`,\n    ),\n  ]);\n  if (out === FENCE_REFUSED) return refusal(env, request, \"applicantWrite\");\n  const c = rowsOf<{ expired: number; ops: number; news_on: string | null; db_now: number }>(out[1])[0];\n  return apiJson({\n    now: now(),\n    newsOn: newsOnFrom(env, c?.news_on),\n    limits: NEWS_LIMITS,\n    notices: rowsOf<AdminRow>(out[0]).map(adminNotice),\n    awaitingCleanup: c?.expired ?? 0, // past their time: hidden from every read already, deleted by the next cron runs\n    operationRecords: c?.ops ?? 0,\n    // Codex's finding 5 (3 Oct 2026): the page's next create goes under this id, stamped with the database clock of this\n    // read, so createNotice can refuse it once it is older than opIssueMaxAgeS. Without a time from the database there is\n    // no id, and the page cannot post (fail closed).\n    opId: Number.isSafeInteger(c?.db_now) && c!.db_now > 0 ? newOpId(c!.db_now) : null,\n  });\n}\n\n"
    ],
    [
      "create office authority/fenced read",
      "async function createNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>, editor?: PublishedOfficeAuthority): Promise<Response> {\n  if (!exactKeys(body, [\"id\", \"title\", \"body\", \"days\"])) return apiJson({ error: \"invalid_request\", message: \"That request could not be read.\" }, 400);\n  if (typeof body.id !== \"string\" || !ID.test(body.id)) return invalid(\"id\", \"That operation id could not be read.\");\n  const id = body.id;\n  const v = noticeValues(body);\n  if (v instanceof Response) return v;\n  const hash = await opHash(v);\n  const issued = opIssuedAt(id);\n  const me = ctx.subject!.discordId, nonce = randomToken();\n  const condition = editorCondition(editor, 7);\n  // The operation record first: the fence, the switch and the live count are judged inside it by the database, and an id\n  // that already has a record (a replay, or a notice since deleted or expired) inserts nothing, so the notice cannot come\n  // back. The record is kept opsKeepS from now, so the id's own age is judged here too, by the same clock (Codex's finding\n  // 5, 3 Oct 2026): handed out no more than opIssueMaxAgeS ago and not after now. An id old enough for its record to be\n  // gone therefore inserts nothing either. The lifetime is computed in SQL from the record's own time; the table's CHECK\n  // bounds it.\n  const out = await admitted(env, ctx, [\n    env.DB.prepare(\n      `INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after)\n       SELECT ?4, ?5, ?1, ${DB_NOW}, ${DB_NOW} + ${NEWS_LIMITS.opsKeepS}\n        WHERE ${fenceSql(\"applicantWrite\", 1, 2, 3,ctx.subject!.privacyGeneration,ctx.subject!.accountIncarnation)} AND (${condition.sql}) AND ${NEWS_ON_SQL}\n          AND (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE}) < ${NEWS_LIMITS.liveMax}\n          AND ?6 > ${DB_NOW} - ${NEWS_LIMITS.opIssueMaxAgeS} AND ?6 <= ${DB_NOW}\n       ON CONFLICT(id) DO NOTHING`,\n    ).bind(me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, id, nonce, issued, ...condition.values),\n    env.DB.prepare(\n      `INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until)\n       SELECT o.id, ?3, ?4, ?5, 1, o.nonce, ?6, o.created_at, ?6, o.created_at, o.created_at + ?7 * ${DAY_S} FROM site_news_ops o WHERE o.id = ?1 AND o.nonce = ?2`,\n    ).bind(id, nonce, hash, v.title, v.text, me, v.days),\n    auditIfWritten(env, id, nonce, me, \"created\"),\n    env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND nonce = ?2`).bind(id, nonce), // the answer, in the write's own transaction\n  ]);\n  if (out !== FENCE_REFUSED) {\n    const row = rowsOf<AdminRow>(out[3])[0];\n    return row ? apiJson({ notice: noticeDto(row, editor) }) : apiJson({ error: \"not_found\" }, 404);\n  }\n  // Refused: explained from one read by the database clock.\n  const whyStatement = env.DB.prepare(\n    `SELECT EXISTS (SELECT 1 FROM site_news_ops WHERE id = ?1) AS op, EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1) AS present,\n            (SELECT created_by FROM site_news_notices WHERE id = ?1) AS author, (SELECT op_hash FROM site_news_notices WHERE id = ?1) AS hash,\n            EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1 AND ${LIVE}) AS live,\n            (SELECT value FROM site_settings WHERE key = 'newsOn') AS news_on, (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE}) AS live_count,\n            (?2 > ${DB_NOW} - ${NEWS_LIMITS.opIssueMaxAgeS} AND ?2 <= ${DB_NOW}) AS id_ok`,\n  )\n    .bind(id, issued);\n  type Why = { op: number; present: number; author: string | null; hash: string | null; live: number; news_on: string | null; live_count: number; id_ok: number };\n  let why: Why | null;\n  if (editor) {\n    const read = await newsRead(env, ctx, [whyStatement], editor);\n    if (read === FENCE_REFUSED) return editorForbidden();\n    why = rowsOf<Why>(read[0])[0] ?? null;\n  } else why = await whyStatement.first<Why>();\n  if (why?.op) {\n    if (!why.present) return apiJson({ error: \"deleted\", message: \"That notice was deleted or its time ran out; it is not posted again.\" }, 409);\n    if (why.author !== me || why.hash !== hash) return apiJson({ error: \"op_conflict\", message: \"A different notice was already posted under this operation. Reload and write it again.\" }, 409);\n    if (!why.live) return apiJson({ error: \"expired\", message: \"That notice's time is up; it is no longer shown.\" }, 409);\n    // The same author and the same text: the earlier attempt stored it. A replay answers only while its author is still staff.\n    const fresh = editor ? ctx : await communityContext(env, request);\n    if (!editor && !fresh.capabilities.communityStaff) return refusal(env, request, \"applicantWrite\");\n    const again = await newsRead(env, fresh, [env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND ${LIVE}`).bind(id)], editor);\n    if (again === FENCE_REFUSED) return noticeRefusal(request, env, editor);\n    const row = rowsOf<AdminRow>(again[0])[0];\n    return row ? apiJson({ notice: noticeDto(row, editor), replay: true }) : apiJson({ error: \"deleted\", message: \"That notice was deleted or its time ran out; it is not posted again.\" }, 409);\n  }\n  // No record under this id, and the id is too old (or was never handed out by this server): nothing was stored under it,\n  // and it can no longer store anything. The page starts again with a fresh id (app.js refusedCreate).\n  if (!why?.id_ok) {\n    return apiJson({ error: \"stale_page\", message: `This form can no longer post: a form posts only within ${NEWS_LIMITS.opIssueMaxAgeS / DAY_S} days of being opened. Nothing was posted.` }, 409);\n  }\n  if (!newsOnFrom(env, why?.news_on)) return apiJson({ error: \"news_off\", message: \"News is switched off (Admin → Settings); notices cannot be posted while it is off.\" }, 409);\n  if ((why?.live_count ?? 0) >= NEWS_LIMITS.liveMax) return apiJson({ error: \"too_many\", message: `At most ${NEWS_LIMITS.liveMax} notices can be shown at once. Delete one first.` }, 409);\n  return noticeRefusal(request, env, editor);\n}\n\n",
      "async function createNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>): Promise<Response> {\n  if (!exactKeys(body, [\"id\", \"title\", \"body\", \"days\"])) return apiJson({ error: \"invalid_request\", message: \"That request could not be read.\" }, 400);\n  if (typeof body.id !== \"string\" || !ID.test(body.id)) return invalid(\"id\", \"That operation id could not be read.\");\n  const id = body.id;\n  const v = noticeValues(body);\n  if (v instanceof Response) return v;\n  const hash = await opHash(v);\n  const issued = opIssuedAt(id);\n  const me = ctx.subject!.discordId, nonce = randomToken();\n  // The operation record first: the fence, the switch and the live count are judged inside it by the database, and an id\n  // that already has a record (a replay, or a notice since deleted or expired) inserts nothing, so the notice cannot come\n  // back. The record is kept opsKeepS from now, so the id's own age is judged here too, by the same clock (Codex's finding\n  // 5, 3 Oct 2026): handed out no more than opIssueMaxAgeS ago and not after now. An id old enough for its record to be\n  // gone therefore inserts nothing either. The lifetime is computed in SQL from the record's own time; the table's CHECK\n  // bounds it.\n  const out = await admitted(env, ctx, [\n    env.DB.prepare(\n      `INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after)\n       SELECT ?4, ?5, ?1, ${DB_NOW}, ${DB_NOW} + ${NEWS_LIMITS.opsKeepS}\n        WHERE ${fenceSql(\"applicantWrite\", 1, 2, 3,ctx.subject!.privacyGeneration,ctx.subject!.accountIncarnation)} AND ${NEWS_ON_SQL}\n          AND (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE}) < ${NEWS_LIMITS.liveMax}\n          AND ?6 > ${DB_NOW} - ${NEWS_LIMITS.opIssueMaxAgeS} AND ?6 <= ${DB_NOW}\n       ON CONFLICT(id) DO NOTHING`,\n    ).bind(me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, id, nonce, issued),\n    env.DB.prepare(\n      `INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until)\n       SELECT o.id, ?3, ?4, ?5, 1, o.nonce, ?6, o.created_at, ?6, o.created_at, o.created_at + ?7 * ${DAY_S} FROM site_news_ops o WHERE o.id = ?1 AND o.nonce = ?2`,\n    ).bind(id, nonce, hash, v.title, v.text, me, v.days),\n    auditIfWritten(env, id, nonce, me, \"created\"),\n    env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND nonce = ?2`).bind(id, nonce), // the answer, in the write's own transaction\n  ]);\n  if (out !== FENCE_REFUSED) {\n    const row = rowsOf<AdminRow>(out[3])[0];\n    return row ? apiJson({ notice: adminNotice(row) }) : apiJson({ error: \"not_found\" }, 404);\n  }\n  // Refused: explained from one read by the database clock.\n  const why = await env.DB.prepare(\n    `SELECT EXISTS (SELECT 1 FROM site_news_ops WHERE id = ?1) AS op, EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1) AS present,\n            (SELECT created_by FROM site_news_notices WHERE id = ?1) AS author, (SELECT op_hash FROM site_news_notices WHERE id = ?1) AS hash,\n            EXISTS (SELECT 1 FROM site_news_notices WHERE id = ?1 AND ${LIVE}) AS live,\n            (SELECT value FROM site_settings WHERE key = 'newsOn') AS news_on, (SELECT COUNT(*) FROM site_news_notices WHERE ${LIVE}) AS live_count,\n            (?2 > ${DB_NOW} - ${NEWS_LIMITS.opIssueMaxAgeS} AND ?2 <= ${DB_NOW}) AS id_ok`,\n  )\n    .bind(id, issued)\n    .first<{ op: number; present: number; author: string | null; hash: string | null; live: number; news_on: string | null; live_count: number; id_ok: number }>();\n  if (why?.op) {\n    if (!why.present) return apiJson({ error: \"deleted\", message: \"That notice was deleted or its time ran out; it is not posted again.\" }, 409);\n    if (why.author !== me || why.hash !== hash) return apiJson({ error: \"op_conflict\", message: \"A different notice was already posted under this operation. Reload and write it again.\" }, 409);\n    if (!why.live) return apiJson({ error: \"expired\", message: \"That notice's time is up; it is no longer shown.\" }, 409);\n    // The same author and the same text: the earlier attempt stored it. A replay answers only while its author is still staff.\n    const fresh = await communityContext(env, request);\n    if (!fresh.capabilities.communityStaff) return refusal(env, request, \"applicantWrite\");\n    const again = await admittedRead(env, fresh, \"applicantWrite\", [env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND ${LIVE}`).bind(id)]);\n    if (again === FENCE_REFUSED) return refusal(env, request, \"applicantWrite\");\n    const row = rowsOf<AdminRow>(again[0])[0];\n    return row ? apiJson({ notice: adminNotice(row), replay: true }) : apiJson({ error: \"deleted\", message: \"That notice was deleted or its time ran out; it is not posted again.\" }, 409);\n  }\n  // No record under this id, and the id is too old (or was never handed out by this server): nothing was stored under it,\n  // and it can no longer store anything. The page starts again with a fresh id (app.js refusedCreate).\n  if (!why?.id_ok) {\n    return apiJson({ error: \"stale_page\", message: `This form can no longer post: a form posts only within ${NEWS_LIMITS.opIssueMaxAgeS / DAY_S} days of being opened. Nothing was posted.` }, 409);\n  }\n  if (!newsOnFrom(env, why?.news_on)) return apiJson({ error: \"news_off\", message: \"News is switched off (Admin → Settings); notices cannot be posted while it is off.\" }, 409);\n  if ((why?.live_count ?? 0) >= NEWS_LIMITS.liveMax) return apiJson({ error: \"too_many\", message: `At most ${NEWS_LIMITS.liveMax} notices can be shown at once. Delete one first.` }, 409);\n  return refusal(env, request, \"applicantWrite\");\n}\n\n"
    ],
    [
      "update exact authority and atomic webhook cleanup",
      "async function updateNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>, editor?: PublishedOfficeAuthority): Promise<Response> {\n  if (!exactKeys(body, [\"id\", \"revision\", \"title\", \"body\", \"days\"])) return apiJson({ error: \"invalid_request\", message: \"That request could not be read.\" }, 400);\n  if (typeof body.id !== \"string\" || !ID.test(body.id)) return invalid(\"id\", \"That notice id could not be read.\");\n  const id = body.id;\n  const revision = revisionOf(body.revision);\n  if (revision === null) return invalid(\"revision\", \"That revision could not be read.\");\n  const v = noticeValues(body);\n  if (v instanceof Response) return v;\n  const me = ctx.subject!.discordId, nonce = randomToken();\n  const condition = editorCondition(editor, 10);\n  // The new lifetime counts from the original posting; whether it is still ahead, and whether the notice is still live,\n  // is the database clock's decision inside the statement (no JavaScript pre-check). op_hash stays: it names the create.\n  const out = await admitted(env, ctx, [\n    env.DB.prepare(\n      `UPDATE site_news_notices SET title = ?6, body = ?7, retain_until = created_at + ?8 * ${DAY_S}, revision = revision + 1, nonce = ?5, updated_by = ?1, updated_at = ${DB_NOW}\n        WHERE id = ?4 AND revision = ?9 AND ${LIVE} AND created_at + ?8 * ${DAY_S} > ${DB_NOW} AND ${NEWS_ON_SQL} AND ${fenceSql(\"applicantWrite\", 1, 2, 3,ctx.subject!.privacyGeneration,ctx.subject!.accountIncarnation)} AND (${condition.sql})`,\n    ).bind(me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, id, nonce, v.title, v.text, v.days, revision, ...condition.values),\n    newsWebhookMutationPlan(env, id, nonce),\n    auditIfWritten(env, id, nonce, me, \"edited\"),\n    env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND nonce = ?2`).bind(id, nonce),\n  ]);\n  if (out !== FENCE_REFUSED) {\n    const row = rowsOf<AdminRow>(out[3])[0];\n    return row ? apiJson({ notice: noticeDto(row, editor) }) : apiJson({ error: \"not_found\" }, 404);\n  }\n  const read = await newsRead(env, ctx, [\n    env.DB.prepare(\n      `SELECT id, title, body, revision, created_by, updated_by, created_at, updated_at, retain_until, (${LIVE}) AS live, (created_at + ?2 * ${DAY_S} > ${DB_NOW}) AS period_ok\n         FROM site_news_notices WHERE id = ?1`,\n    ).bind(id, v.days),\n    env.DB.prepare(\"SELECT value FROM site_settings WHERE key = 'newsOn'\"),\n  ], editor);\n  if (read === FENCE_REFUSED) return noticeRefusal(request, env, editor);\n  const row = rowsOf<AdminRow & { live: number; period_ok: number }>(read[0])[0];\n  if (!row) return apiJson({ error: \"not_found\", message: \"That notice no longer exists.\" }, 404);\n  if (!newsOnFrom(env, rowsOf<{ value: string }>(read[1])[0]?.value)) return apiJson({ error: \"news_off\", message: \"News is switched off (Admin → Settings); notices cannot be changed while it is off. They can still be deleted.\" }, 409);\n  if (!row.live) return apiJson({ error: \"expired\", message: \"That notice's time is up; it can no longer be changed.\" }, 409);\n  if (!row.period_ok) return apiJson({ error: \"period_passed\", field: \"days\", message: \"That period has already passed since the notice was posted. Choose a longer one.\" }, 400);\n  if (row.revision !== revision) return apiJson({ error: \"stale_revision\", message: \"Someone changed this notice first: reload it.\", notice: noticeDto(row, editor) }, 409);\n  return noticeRefusal(request, env, editor);\n}\n\n",
      "async function updateNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>): Promise<Response> {\n  if (!exactKeys(body, [\"id\", \"revision\", \"title\", \"body\", \"days\"])) return apiJson({ error: \"invalid_request\", message: \"That request could not be read.\" }, 400);\n  if (typeof body.id !== \"string\" || !ID.test(body.id)) return invalid(\"id\", \"That notice id could not be read.\");\n  const id = body.id;\n  const revision = revisionOf(body.revision);\n  if (revision === null) return invalid(\"revision\", \"That revision could not be read.\");\n  const v = noticeValues(body);\n  if (v instanceof Response) return v;\n  const me = ctx.subject!.discordId, nonce = randomToken();\n  // The new lifetime counts from the original posting; whether it is still ahead, and whether the notice is still live,\n  // is the database clock's decision inside the statement (no JavaScript pre-check). op_hash stays: it names the create.\n  const out = await admitted(env, ctx, [\n    env.DB.prepare(\n      `UPDATE site_news_notices SET title = ?6, body = ?7, retain_until = created_at + ?8 * ${DAY_S}, revision = revision + 1, nonce = ?5, updated_by = ?1, updated_at = ${DB_NOW}\n        WHERE id = ?4 AND revision = ?9 AND ${LIVE} AND created_at + ?8 * ${DAY_S} > ${DB_NOW} AND ${NEWS_ON_SQL} AND ${fenceSql(\"applicantWrite\", 1, 2, 3,ctx.subject!.privacyGeneration,ctx.subject!.accountIncarnation)}`,\n    ).bind(me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, id, nonce, v.title, v.text, v.days, revision),\n    auditIfWritten(env, id, nonce, me, \"edited\"),\n    env.DB.prepare(`${ADMIN_COLUMNS} WHERE id = ?1 AND nonce = ?2`).bind(id, nonce),\n  ]);\n  if (out !== FENCE_REFUSED) {\n    const row = rowsOf<AdminRow>(out[2])[0];\n    return row ? apiJson({ notice: adminNotice(row) }) : apiJson({ error: \"not_found\" }, 404);\n  }\n  const read = await admittedRead(env, ctx, \"applicantWrite\", [\n    env.DB.prepare(\n      `SELECT id, title, body, revision, created_by, updated_by, created_at, updated_at, retain_until, (${LIVE}) AS live, (created_at + ?2 * ${DAY_S} > ${DB_NOW}) AS period_ok\n         FROM site_news_notices WHERE id = ?1`,\n    ).bind(id, v.days),\n    env.DB.prepare(\"SELECT value FROM site_settings WHERE key = 'newsOn'\"),\n  ]);\n  if (read === FENCE_REFUSED) return refusal(env, request, \"applicantWrite\");\n  const row = rowsOf<AdminRow & { live: number; period_ok: number }>(read[0])[0];\n  if (!row) return apiJson({ error: \"not_found\", message: \"That notice no longer exists.\" }, 404);\n  if (!newsOnFrom(env, rowsOf<{ value: string }>(read[1])[0]?.value)) return apiJson({ error: \"news_off\", message: \"News is switched off (Admin → Settings); notices cannot be changed while it is off. They can still be deleted.\" }, 409);\n  if (!row.live) return apiJson({ error: \"expired\", message: \"That notice's time is up; it can no longer be changed.\" }, 409);\n  if (!row.period_ok) return apiJson({ error: \"period_passed\", field: \"days\", message: \"That period has already passed since the notice was posted. Choose a longer one.\" }, 400);\n  if (row.revision !== revision) return apiJson({ error: \"stale_revision\", message: \"Someone changed this notice first: reload it.\", notice: adminNotice(row) }, 409);\n  return refusal(env, request, \"applicantWrite\");\n}\n\n"
    ],
    [
      "delete exact authority and atomic webhook cleanup",
      "async function deleteNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>, editor?: PublishedOfficeAuthority): Promise<Response> {\n  if (!exactKeys(body, [\"id\", \"revision\"])) return apiJson({ error: \"invalid_request\", message: \"That request could not be read.\" }, 400);\n  if (typeof body.id !== \"string\" || !ID.test(body.id)) return invalid(\"id\", \"That notice id could not be read.\");\n  const id = body.id;\n  const revision = revisionOf(body.revision);\n  if (revision === null) return invalid(\"revision\", \"That revision could not be read.\");\n  const me = ctx.subject!.discordId, nonce = randomToken();\n  const condition = editorCondition(editor, 7);\n  // Whatever the switch says and even after expiry: deleting is cleanup. The operation record stays as the tombstone.\n  const out = await admitted(env, ctx, [\n    env.DB.prepare(`UPDATE site_news_notices SET nonce = ?5 WHERE id = ?4 AND revision = ?6 AND ${fenceSql(\"applicantWrite\", 1, 2, 3,ctx.subject!.privacyGeneration,ctx.subject!.accountIncarnation)} AND (${condition.sql})`).bind(\n      me,\n      ctx.subject!.sessionVersion,\n      ctx.subject!.expiresAt,\n      id,\n      nonce,\n      revision,\n      ...condition.values,\n    ),\n    newsWebhookMutationPlan(env, id, nonce),\n    auditIfWritten(env, id, nonce, me, \"deleted\"),\n    env.DB.prepare(\"DELETE FROM site_news_notices WHERE id = ?1 AND nonce = ?2\").bind(id, nonce),\n  ]);\n  if (out !== FENCE_REFUSED) return apiJson({ ok: true, id });\n  // Codex's finding 3 (3 Oct 2026, 13:15 UTC): deleting stays possible after expiry, because it is cleanup, but a refusal\n  // answers with the notice's title and text only while it is live, judged by the database clock inside this read. Past\n  // its time a notice is gone from every read (adminList, newsPage, the update refusal), and a stale delete must not\n  // bring it back: it gets the id and the current revision only, enough to delete it with the current revision.\n  const read = await newsRead(env, ctx, [\n    env.DB.prepare(\n      `SELECT id, revision, created_by, updated_by, created_at, updated_at, retain_until, (${LIVE}) AS live,\n              CASE WHEN ${LIVE} THEN title END AS title, CASE WHEN ${LIVE} THEN body END AS body\n         FROM site_news_notices WHERE id = ?1`,\n    ).bind(id),\n  ], editor);\n  if (read === FENCE_REFUSED) return noticeRefusal(request, env, editor);\n  const row = rowsOf<AdminRow & { live: number }>(read[0])[0];\n  if (!row) return apiJson({ error: \"not_found\", message: \"That notice no longer exists.\" }, 404);\n  if (row.revision !== revision) {\n    if (row.live === 1) return apiJson({ error: \"stale_revision\", message: \"Someone changed this notice first: reload it.\", notice: noticeDto(row, editor) }, 409);\n    return apiJson({ error: \"stale_revision\", message: \"Someone changed this notice first, and its time is up: it is no longer shown, and the cleanup deletes it.\", notice: { id: row.id, revision: row.revision } }, 409);\n  }\n  return noticeRefusal(request, env, editor);\n}\n\n",
      "async function deleteNotice(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown>): Promise<Response> {\n  if (!exactKeys(body, [\"id\", \"revision\"])) return apiJson({ error: \"invalid_request\", message: \"That request could not be read.\" }, 400);\n  if (typeof body.id !== \"string\" || !ID.test(body.id)) return invalid(\"id\", \"That notice id could not be read.\");\n  const id = body.id;\n  const revision = revisionOf(body.revision);\n  if (revision === null) return invalid(\"revision\", \"That revision could not be read.\");\n  const me = ctx.subject!.discordId, nonce = randomToken();\n  // Whatever the switch says and even after expiry: deleting is cleanup. The operation record stays as the tombstone.\n  const out = await admitted(env, ctx, [\n    env.DB.prepare(`UPDATE site_news_notices SET nonce = ?5 WHERE id = ?4 AND revision = ?6 AND ${fenceSql(\"applicantWrite\", 1, 2, 3,ctx.subject!.privacyGeneration,ctx.subject!.accountIncarnation)}`).bind(\n      me,\n      ctx.subject!.sessionVersion,\n      ctx.subject!.expiresAt,\n      id,\n      nonce,\n      revision,\n    ),\n    auditIfWritten(env, id, nonce, me, \"deleted\"),\n    env.DB.prepare(\"DELETE FROM site_news_notices WHERE id = ?1 AND nonce = ?2\").bind(id, nonce),\n  ]);\n  if (out !== FENCE_REFUSED) return apiJson({ ok: true, id });\n  // Codex's finding 3 (3 Oct 2026, 13:15 UTC): deleting stays possible after expiry, because it is cleanup, but a refusal\n  // answers with the notice's title and text only while it is live, judged by the database clock inside this read. Past\n  // its time a notice is gone from every read (adminList, newsPage, the update refusal), and a stale delete must not\n  // bring it back: it gets the id and the current revision only, enough to delete it with the current revision.\n  const read = await admittedRead(env, ctx, \"applicantWrite\", [\n    env.DB.prepare(\n      `SELECT id, revision, created_by, updated_by, created_at, updated_at, retain_until, (${LIVE}) AS live,\n              CASE WHEN ${LIVE} THEN title END AS title, CASE WHEN ${LIVE} THEN body END AS body\n         FROM site_news_notices WHERE id = ?1`,\n    ).bind(id),\n  ]);\n  if (read === FENCE_REFUSED) return refusal(env, request, \"applicantWrite\");\n  const row = rowsOf<AdminRow & { live: number }>(read[0])[0];\n  if (!row) return apiJson({ error: \"not_found\", message: \"That notice no longer exists.\" }, 404);\n  if (row.revision !== revision) {\n    if (row.live === 1) return apiJson({ error: \"stale_revision\", message: \"Someone changed this notice first: reload it.\", notice: adminNotice(row) }, 409);\n    return apiJson({ error: \"stale_revision\", message: \"Someone changed this notice first, and its time is up: it is no longer shown, and the cleanup deletes it.\", notice: { id: row.id, revision: row.revision } }, 409);\n  }\n  return refusal(env, request, \"applicantWrite\");\n}\n\n"
    ]
  ];
  for (const [name, current, prior] of authorizedNews196Deltas) {
    check("Guild News exact authorized .196 delta occurs once: " + name, originalNews.split(current).length === 2);
    originalNews = originalNews.replace(current, prior);
  }
  const release176 = [
    '  {',
    '    build: ".176", date: "2026-10-19", lines: [',
    '      "Community viewing recognizes site administrators and current Guild Member Discord roles; member actions retain their existing verification checks.",',
    '      "Appointment searches accept current Discord members by name or user ID without a website sign-in, with separate consent for published names and characters.",',
    '      "A more compact organization chart, steady section buttons and a simpler signed-in header.",',
    '    ],',
    '  },',
    '',
  ].join('\n');
  const authorizedNewsDeltas = [
    ['reader imports', 'import { admitted, admittedRead, admittedCommunityRead, communityReadRefusal, communityContext, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";', 'import { admitted, admittedRead, communityContext, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";'],
    ['dated release note', release176, ''],
    ['explicit role-read context', 'const ctx = await communityContext(env, request, { guildRoleRead: true });', 'const ctx = await communityContext(env, request);'],
    ['read-only payload admission', 'const out = await admittedCommunityRead(env, ctx, [', 'const out = await admittedRead(env, ctx, "confirmedGuildData", ['],
    ['separate reader refusal', 'if (out === FENCE_REFUSED) return communityReadRefusal(env, request);', 'if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");'],
  ];
  for (const [name, current, prior] of authorizedNewsDeltas) {
    check('Guild News authorized .176 delta occurs exactly once: ' + name, originalNews.split(current).length === 2);
    originalNews = originalNews.replace(current, prior);
  }
  check('outside exact authorized .176 reader changes, original whole Guild News safeguards remain unchanged', require('node:crypto').createHash('sha256').update(originalNews).digest('hex') === '6d9bd0840df3840675bac021a7835c5e7865fe4200c52986a46bbedc16a167a1');
  await caseWith('Guild News absent or OFF does not disable public Game updates', async f => {
    const absent = await f.invoke();
    check('absent Guild News switch still permits signed-in public publisher headlines', absent.response.status === 200 && absent.body.sources.length === 3 && f.state.fetches.length === 3);
    const guildAbsent = await f.invoke({ dispatch: true, path: '/api/news' });
    check('absent Guild News remains original404 news_off with no publisher I/O', guildAbsent.response.status === 404 && guildAbsent.body.error === 'news_off' && noPayload(guildAbsent.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
    await f.news(false);
    const off = await f.invoke();
    check('explicit Guild News OFF does not disable public publisher headlines', off.response.status === 200 && off.body.sources.length === 3 && f.state.fetches.length === 3);
    const guildOff = await f.invoke({ dispatch: true, path: '/api/news' });
    check('explicit Guild News OFF retains original404 and zero cache/provider access', guildOff.response.status === 404 && guildOff.body.error === 'news_off' && noPayload(guildOff.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('signed out', async f => {
    await f.news(true); const out = await f.invoke({ signedOut: true });
    check('signed-out request receives the original401 refusal before cache/provider access', out.response.status === 401 && out.body.error === 'signed_out' && noPayload(out.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('unqualified public reader and separate private Community News refusal', async f => {
    await f.news(true); await f.write("UPDATE characters SET status='verified' WHERE discord_id=?", SUBJECT);
    const unconfirmed = await f.invoke();
    check('unconfirmed signed-in subject receives200 public headlines without a guild character proof', unconfirmed.response.status === 200 && unconfirmed.body.sources.length === 3 && f.state.fetches.length === 3);
    const guild = await f.invoke({ dispatch: true, path: '/api/news' });
    check('a subject without roster, current staff or eligible role still receives403 community_unconfirmed for private Guild News', guild.response.status === 403 && guild.body.error === 'community_unconfirmed' && noPayload(guild.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
    await f.write("UPDATE characters SET status='member' WHERE discord_id=?", SUBJECT); await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT);
    const denied = await f.invoke();
    check('denied subject receives original403 denied with zero source access', denied.response.status === 403 && denied.body.error === 'denied' && noPayload(denied.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('no character or bot membership record is needed for public headlines', async f => {
    await f.write('DELETE FROM characters WHERE discord_id=?', SUBJECT); await f.write('DELETE FROM members WHERE discord_id=?', SUBJECT);
    const out = await f.invoke({ entry: true });
    check('normal signed-in shell dispatch permits200 with no linked or verified character', out.response.status === 200 && out.body.sources.length === 3 && f.state.fetches.length === 3);
  });
  await caseWith('initial genuine session expiry', async f => {
    f.state.actorClockMs = f.issued.session.e * 1000;
    const out = await f.invoke({ entry: true });
    check('genuine original cookie refuses at its exact signed expiry before public cache/providers', out.response.status === 401 && out.body.error === 'signed_out' && noPayload(out.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('roster proof lost at the consumer does not change public authority', async f => {
    await f.news(true); let fired = false;
    f.hooks.beforeBatch = async plan => {
      if (fired || !plan.some(row => /AS public_updates/.test(row.statement))) return;
      fired = true;
      // Same real before-transaction seam as the existing News reader tests.
      const first = f.state.native.nativeTrace.length;
      await f.write("UPDATE characters SET status='verified' WHERE discord_id=?", SUBJECT);
      const end = f.state.native.nativeTrace.length;
      for (let i = first; i < end; i++) f.state.fixtureTrace.add(i);
      f.state.expectedSnapshot = f.snapshot();
    };
    const out = await f.invoke();
    check('public read remains200 after roster loss with the current session and standing intact', fired && out.response.status === 200 && out.body.sources.length === 3 && f.state.fetches.length === 3);
  });
  for (const standing of ['denied', 'departed']) {
    await caseWith('actual consuming standing fence: ' + standing, async f => {
      let fired = false;
      f.hooks.beforeBatch = async plan => {
        if (fired || !plan.some(row => /AS public_updates/.test(row.statement))) return;
        fired = true; const first = f.state.native.nativeTrace.length;
        await f.write(standing === 'denied' ? 'UPDATE site_users SET denied=1 WHERE discord_id=?' : 'UPDATE site_users SET in_server=0 WHERE discord_id=?', SUBJECT);
        for (let i = first; i < f.state.native.nativeTrace.length; i++) f.state.fixtureTrace.add(i);
        f.state.expectedSnapshot = f.snapshot();
      };
      const out = await f.invoke();
      check('consuming original applicant fence refuses ' + standing + ' before cache or provider I/O', fired && out.response.status === 403 && out.body.error === (standing === 'denied' ? 'denied' : 'not_member') && noPayload(out.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
    });
  }
  for (const outer of [false, true]) {
    await caseWith(outer ? 'actual fetch maps original Native refusal' : 'component preserves original Native refusal', async f => {
      await f.news(true); let fired = false, nativeError = null;
      f.hooks.beforeBatch = plan => {
        if (fired || !plan.some(row => /AS public_updates/.test(row.statement))) return;
        fired = true;
        try { f.db.prepare("UPDATE characters SET status='verified' WHERE discord_id=?").run(SUBJECT); }
        catch (error) { nativeError = error; throw error; }
      };
      const out = await f.invoke(outer ? { entry: true } : { typedHeld: true });
      check('raw competing write is refused by the original installed Native trigger', fired && nativeError?.message === 'privacy_write_admission_required');
      check(outer ? 'real index fetch maps original typed held to503 without headlines' : 'component throws only the original PrivacySiteRequestHeld type/marker',
        outer ? out.response.status === 503 && out.body.error === 'erasure_held' && noPayload(out.body)
          : out.held instanceof f.load('privacy-serving-authority').PrivacySiteRequestHeld && out.held.message === 'privacy_site_request_held' && out.response === undefined);
      check('refused Native write never reaches public cache or providers', f.state.fetches.length === 0 && f.state.cacheAccess === 0);
    });
  }
  await caseWith('actual API dispatcher positive read', async f => {
    await f.news(true); const out = await f.invoke({ dispatch: true });
    check('actual GET dispatch returns only the public feed DTO after two current-session/standing admissions', out.response.status === 200 && Object.keys(out.body).sort().join() === 'enabled,sources' && out.body.enabled === true && out.body.sources.length === 3 && out.body.sources.every(s => s.status === 'fresh' && s.items.length === 1) && out.trace.filter(row => /AS public_updates/.test(row.sql)).length === 2);
    check('actual route fetches only3 fixed publishers without caching an authorization result', f.state.fetches.length === 3 && f.state.fetches.every(url => FEEDS.has(url)) && !JSON.stringify(out.body).includes(SUBJECT) && !JSON.stringify(out.body).includes('account_incarnation'));
    check('successful endpoint response remains private/no-store', out.response.headers.get('Cache-Control')?.includes('no-store') && out.response.headers.get('X-Content-Type-Options') === 'nosniff');
  });
  for (const change of ['news-off', 'denied', 'departed', 'roster-lost', 'session-version', 'replacement-incarnation', 'retiring', 'expiry']) {
    await caseWith('changed during provider I/O: ' + change, async f => {
      await f.news(true);
      const originalBirth = f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(SUBJECT).account_incarnation;
      f.state.duringProvider = async () => {
        if (change === 'news-off') await f.news(false);
        if (change === 'denied') await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT);
        if (change === 'departed') await f.write('UPDATE site_users SET in_server=0 WHERE discord_id=?', SUBJECT);
        if (change === 'roster-lost') await f.write("UPDATE characters SET status='verified' WHERE discord_id=?", SUBJECT);
        if (change === 'session-version') await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT);
        if (change === 'retiring') await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", SUBJECT);
        if (change === 'expiry') f.state.actorClockMs = f.issued.session.e * 1000;
        if (change === 'replacement-incarnation') {
          await f.write('DELETE FROM site_users WHERE discord_id=?', SUBJECT);
          await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?,?,?,?,?,1,0,1,?)', SUBJECT, 'replacement-fixture', f.now, f.now, f.now, 'f'.repeat(32));
        }
      };
      // The actual outer fetch owns the established503 projection when an
      // original session version/birth disappears during provider I/O.
      const out = await f.invoke({ entry: true });
      if (change === 'news-off' || change === 'roster-lost') check('public post-provider read remains200 despite unrelated private Guild News/roster change: ' + change, f.state.mutated && f.state.fetches.length === 3 && out.response.status === 200 && out.body.sources.length === 3);
      else {
        const expected = change === 'denied' ? [403, 'denied'] : change === 'departed' ? [403, 'not_member'] : change === 'expiry' ? [401, 'signed_out'] : [503, 'erasure_held'];
        check('fresh post-provider admission blocks ' + change + ' and returns no headlines', f.state.mutated && f.state.fetches.length === 3 && out.response.status === expected[0] && out.body.error === expected[1] && noPayload(out.body));
      }
      if (change === 'replacement-incarnation') check('fixture replacement uses a genuine new immutable birth, not a source/session substitution', f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(SUBJECT).account_incarnation !== originalBirth);
    });
  }
  await caseWith('fresh public cache still requires post-cache original session admission', async f => {
    let changed = false; const matched = [], ids = ['blizzard-tracker-forever1112', 'wowhead-forever', 'wowhead-blues-forever183'];
    f.state.cache = {
      async match(request) {
        const cacheKey = request.url.split('/').pop(); assert.ok(ids.includes(cacheKey)); matched.push(request.url);
        const id = cacheKey === 'wowhead-blues-forever183' ? 'wowhead-blues' : cacheKey === 'blizzard-tracker-forever1112' ? 'blizzard-notes' : cacheKey;
        if (!changed) {
          changed = true; const first = f.state.native.nativeTrace.length;
          await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT);
          for (let i = first; i < f.state.native.nativeTrace.length; i++) f.state.fixtureTrace.add(i);
          f.state.expectedSnapshot = f.snapshot();
        }
        return Response.json({ version: 1, sourceId: id, fetchedAt: f.now - 1, omittedItems: 0,
          items: [{ title: 'Cached public headline', url: 'https://' + (id === 'blizzard-notes' ? 'us.forums.blizzard.com' : 'www.wowhead.com') + '/news=170/cached', publishedAt: f.now - 60 }] });
      },
      async put() { throw Error('fresh public cache must not be rewritten'); },
    };
    const out = await f.invoke({ entry: true });
    check('valid fresh cache does zero provider HTTP and contains only fixed public source keys', matched.length === 3 && matched.every(url => url.startsWith('https://olympus.roachcouncil.com/__public-publisher-headlines169/')) && f.state.fetches.length === 0);
    check('cached headlines cannot escape after original session supersession', changed && out.response.status === 503 && out.body.error === 'erasure_held' && noPayload(out.body));
  });
  console.log(`\n${n}/${n} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
