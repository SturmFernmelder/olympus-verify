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
  'https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-october-15/2360696.rss',
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
    check('actual route logs no session, account or provider payload', state.logs.length === 0);
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
    let changed = false; const matched = [], ids = ['blizzard-notes', 'wowhead-forever', 'wowhead-blues-forever183'];
    f.state.cache = {
      async match(request) {
        const cacheKey = request.url.split('/').pop(); assert.ok(ids.includes(cacheKey)); matched.push(request.url);
        const id = cacheKey === 'wowhead-blues-forever183' ? 'wowhead-blues' : cacheKey;
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
