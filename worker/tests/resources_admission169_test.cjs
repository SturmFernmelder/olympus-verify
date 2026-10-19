// .169 resourceUpdatesPage: actual source and original NativeSQLite/session/admittedRead family.
// Only fixed public publisher transport is answered here. No original source exports, authority,
// clock, schema, session signer or consumer fence are replaced. A full fetch-entry/Workerd run is separate.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript'), entry = require('./helpers/privacy129_fixture.cjs');
const root = path.resolve(__dirname, '..'), SUBJECT = '300000000000000169';
const URL_BASE = 'https://guild.example/api/resource-updates';
const FEEDS = new Set([
  'https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-october-15/2360696.rss',
  'https://www.wowhead.com/news/rss/all', 'https://www.wowhead.com/blue-tracker?rss',
]);
const compiled = new Map();
let n = 0;
function check(name, condition) { assert.ok(condition, name); n++; console.log('PASS ' + name); }
function graph(state) {
  const modules = new Map();
  const cacheStorage = Object.defineProperty({}, 'default', { get() { state.cacheAccess++; return undefined; } });
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal,
    setTimeout, clearTimeout, caches: cacheStorage,
    console: { log(...args) { state.logs.push(args); }, warn(...args) { state.logs.push(args); }, error(...args) { state.logs.push(args); } },
    async fetch(url, init) {
      if (typeof url !== 'string' || !FEEDS.has(url) || init?.redirect !== 'manual' || Object.keys(init.headers).join() !== 'Accept') throw Error('unexpected fixture network request');
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
      return new Response(`<?xml version="1.0"?><rss><channel><item><title>Public publisher headline</title><link>https://${host}/news=169/checked-source</link><pubDate>${new Date(state.now * 1000 - 3600000).toUTCString()}</pubDate><category>Forever</category></item></channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml' } });
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
    const request = new Request(URL_BASE, { headers: options.signedOut ? {} : { Cookie: issued.cookie } });
    const session = await core.readSession(env, request);
    const bound = session ? authority.privacyBoundSiteEnv(env, session) : env;
    state.fetches = []; state.cacheAccess = 0; state.logs = []; state.mutated = false; state.fixtureTrace.clear();
    const firstTrace = native.nativeTrace.length, before = snapshot(); state.expectedSnapshot = before;
    let response, held;
    try {
      // handleApi establishes its own original session binding. The real fetch entry
      // receives the original Native transport and constructs the admitted writer.
      response = options.entry ? await load('index').default.fetch(request, rawEnv, { waitUntil() {} })
        : options.dispatch ? await api.handleApi(request, env, '/api/resource-updates', () => {})
        : await api.resourceUpdatesPage(request, bound);
    } catch (error) {
      if (!options.typedHeld || !(error instanceof authority.PrivacySiteRequestHeld) || error.message !== 'privacy_site_request_held') throw error;
      held = error;
    }
    const trace = native.nativeTrace.map((row, i) => ({ ...row, originalIndex: i })).slice(firstTrace).filter(row => !state.fixtureTrace.has(row.originalIndex));
    const body = response ? await response.json() : null;
    check('actual route executes SELECT/WITH only outside explicit fixture changes', trace.every(row => /^\s*(SELECT|WITH)\b/.test(row.sql)));
    check('actual route leaves all synthetic application/control tables unchanged', snapshot() === state.expectedSnapshot);
    check('actual route logs no session, account or provider payload', state.logs.length === 0);
    return { response, body, held, trace, before };
  }
  async function news(on) { await write("INSERT INTO site_settings(key,value,updated_at)VALUES('newsOn',?,?) ON CONFLICT(key)DO UPDATE SET value=excluded.value", on ? '1' : '0', now); }
  return { db, now, state, hooks, load, env, write, news, snapshot, invoke, close() { db.close(); } };
}
async function caseWith(name, work) { const f = await fresh(); try { await work(f); console.log('CASE ' + name); } finally { f.close(); } }
const noPayload = body => !Object.prototype.hasOwnProperty.call(body, 'sources') && !Object.prototype.hasOwnProperty.call(body, 'items');

(async () => {
  await caseWith('News absent or OFF', async f => {
    const absent = await f.invoke();
    check('absent News row gives normal404 news_off with no public cache/provider access', absent.response.status === 404 && absent.body.error === 'news_off' && noPayload(absent.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
    await f.news(false);
    const off = await f.invoke();
    check('explicit News OFF gives normal404 and zero cache/provider access', off.response.status === 404 && off.body.error === 'news_off' && noPayload(off.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('signed out', async f => {
    await f.news(true); const out = await f.invoke({ signedOut: true });
    check('signed-out request receives the original401 refusal before cache/provider access', out.response.status === 401 && out.body.error === 'signed_out' && noPayload(out.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('unconfirmed and denied', async f => {
    await f.news(true); await f.write("UPDATE characters SET status='verified' WHERE discord_id=?", SUBJECT);
    const unconfirmed = await f.invoke();
    check('unconfirmed subject receives original403 guild_unconfirmed with zero source access', unconfirmed.response.status === 403 && unconfirmed.body.error === 'guild_unconfirmed' && noPayload(unconfirmed.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
    await f.write("UPDATE characters SET status='member' WHERE discord_id=?", SUBJECT); await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT);
    const denied = await f.invoke();
    check('denied subject receives original403 denied with zero source access', denied.response.status === 403 && denied.body.error === 'denied' && noPayload(denied.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  await caseWith('consumer fence races initial context', async f => {
    await f.news(true); let fired = false;
    f.hooks.beforeBatch = async plan => {
      if (fired || !plan.some(row => /AS news_on/.test(row.statement))) return;
      fired = true;
      // Same real before-transaction seam as the existing News reader tests.
      const first = f.state.native.nativeTrace.length;
      await f.write("UPDATE characters SET status='verified' WHERE discord_id=?", SUBJECT);
      const end = f.state.native.nativeTrace.length;
      for (let i = first; i < end; i++) f.state.fixtureTrace.add(i);
      f.state.expectedSnapshot = f.snapshot();
    };
    const out = await f.invoke();
    check('consuming original admittedRead refuses a lost roster proof before provider I/O', fired && out.response.status === 403 && out.body.error === 'guild_unconfirmed' && noPayload(out.body) && f.state.fetches.length === 0 && f.state.cacheAccess === 0);
  });
  for (const outer of [false, true]) {
    await caseWith(outer ? 'actual fetch maps original Native refusal' : 'component preserves original Native refusal', async f => {
      await f.news(true); let fired = false, nativeError = null;
      f.hooks.beforeBatch = plan => {
        if (fired || !plan.some(row => /AS news_on/.test(row.statement))) return;
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
    check('actual GET dispatch returns only the public feed DTO after two switch admissions', out.response.status === 200 && Object.keys(out.body).sort().join() === 'enabled,sources' && out.body.enabled === true && out.body.sources.length === 3 && out.body.sources.every(s => s.status === 'fresh' && s.items.length === 1) && out.trace.filter(row => /AS news_on/.test(row.sql)).length === 2);
    check('actual route fetches only3 fixed publishers without caching an authorization result', f.state.fetches.length === 3 && f.state.fetches.every(url => FEEDS.has(url)) && !JSON.stringify(out.body).includes(SUBJECT) && !JSON.stringify(out.body).includes('account_incarnation'));
    check('successful endpoint response remains private/no-store', out.response.headers.get('Cache-Control')?.includes('no-store') && out.response.headers.get('X-Content-Type-Options') === 'nosniff');
  });
  for (const change of ['news-off', 'denied', 'roster-lost', 'session-version', 'replacement-incarnation']) {
    await caseWith('changed during provider I/O: ' + change, async f => {
      await f.news(true);
      const originalBirth = f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(SUBJECT).account_incarnation;
      f.state.duringProvider = async () => {
        if (change === 'news-off') await f.news(false);
        if (change === 'denied') await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT);
        if (change === 'roster-lost') await f.write("UPDATE characters SET status='verified' WHERE discord_id=?", SUBJECT);
        if (change === 'session-version') await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT);
        if (change === 'replacement-incarnation') {
          await f.write('DELETE FROM site_users WHERE discord_id=?', SUBJECT);
          await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?,?,?,?,?,1,0,1,?)', SUBJECT, 'replacement-fixture', f.now, f.now, f.now, 'f'.repeat(32));
        }
      };
      // The actual outer fetch owns the established503 projection when an
      // original session version/birth disappears during provider I/O.
      const out = await f.invoke({ entry: true });
      const expected = change === 'news-off' ? [404, 'news_off'] : change === 'denied' ? [403, 'denied'] : change === 'roster-lost' ? [403, 'guild_unconfirmed'] : [503, 'erasure_held'];
      check('fresh post-provider admission blocks ' + change + ' and returns no headlines', f.state.mutated && f.state.fetches.length === 3 && out.response.status === expected[0] && out.body.error === expected[1] && noPayload(out.body));
      if (change === 'replacement-incarnation') check('fixture replacement uses a genuine new immutable birth, not a source/session substitution', f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(SUBJECT).account_incarnation !== originalBirth);
    });
  }
  console.log(`\n${n}/${n} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
