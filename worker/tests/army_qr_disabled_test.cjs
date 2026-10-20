'use strict';
// Actual TS graph and original Native SQLite fixture. No replacement session or production configuration.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require(process.env.PRIVACY129_TYPESCRIPT || 'typescript');
const entry = require('./helpers/privacy129_fixture.cjs');
const root = path.resolve(__dirname, '..');
let checks = 0, providerCalls = 0;
const logs = [];
function check(name, condition) { assert.ok(condition, name); checks++; console.log('PASS ' + name); }

function sourceGraph() {
  const cache = new Map();
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal,
    setTimeout, clearTimeout,
    console: { log: (...values) => logs.push(values), error: (...values) => logs.push(values), warn: (...values) => logs.push(values) },
    fetch() { providerCalls++; throw Error('Provider transport is forbidden in the Army staging fixture'); } });
  function load(name) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('Fixture source name refused');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const source = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })(dependency => {
      if (dependency === 'node:async_hooks') return require(dependency);
      if (!dependency.startsWith('./')) throw Error('External source dependency refused');
      return load(dependency.slice(2));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

const EXPECTED = { format: 'olympus-army-qr-review-v1', activationEnabled: false, uploadsEnabled: false, storageEnabled: false };
const API_ROOT = '/api/community/army/qr';
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'BREW'];
const PATHS = ['', '/', '/session', '/start', '/preview', '/intent', '/submit', '/outcome', '/withdraw', '/unknown', '/unknown/deeper', '/%2Fsubmit'];
const QUERIES = ['', '?ignored=1', '?activationEnabled=true&uploadsEnabled=true&storageEnabled=true'];
function unreadRequest(method, pathname, query) {
  let pulls = 0;
  const stream = ['GET', 'HEAD'].includes(method) ? null : new ReadableStream({
    pull() { pulls++; throw Error('Disabled route consumed an original body'); },
  }, { highWaterMark: 0 });
  const request = new Request('https://guild.example' + pathname + query, { method,
    headers: { Cookie: 'fictional_cookie=never_reflect', Origin: 'https://untrusted.example',
      'Content-Type': 'application/octet-stream', 'X-Olympus': 'untrusted-page' },
    ...(stream ? { body: stream, duplex: 'half' } : {}) });
  return { request, pulls: () => pulls, close: async () => { if (request.body) await request.body.cancel(); } };
}

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  try {
    entry.installCurrentEntryEpoch(db);
    const native = entry.originalNativePort(db);
    const env = entry.currentEntryEnvironment({ DB: native, COOKIE_SECRET: 'army-staging-fixture-only-0123456789',
      VERIFY_SECRET: 'army-staging-verification-fixture-only', SITE_HOST: 'guild.example',
      SITE_GUILD_ID: '236932545793490944', GUILD_ID: '1549537348516188200', SITE_ADMINS: '',
      COMMUNITY_FEATURES: 'directory,census', PUBLIC_BASE_URL: 'https://verify.example' });
    const load = sourceGraph(), staged = load('army-qr-review'), routes = load('community-routes');
    const contract = staged.armyQrReviewContract();
    assert.deepEqual({ ...contract }, EXPECTED);
    check('review contract is closed, source-fixed and frozen with every collection switch false',
      Object.isFrozen(contract) && Object.keys(contract).length === 4);
    assert.throws(() => { contract.uploadsEnabled = true; }, TypeError);
    assert.deepEqual({ ...staged.armyQrReviewContract() }, EXPECTED);
    check('mutating a returned contract cannot enable the next review contract', contract.uploadsEnabled === false);

    let envReads = 0, requestReads = 0;
    const blockedEnv = new Proxy({}, { get() { envReads++; throw Error('Disabled route read an environment setting or DB'); } });
    const blockedRequest = new Proxy({}, { get() { requestReads++; throw Error('Disabled route read a request or body'); } });
    const early = await routes.handleCommunity(blockedRequest, blockedEnv, API_ROOT);
    assert.deepEqual(await early.json(), { error: 'not_found', ...EXPECTED });
    check('Army prefix refuses before reading method, Community context, body, DB or environment',
      early.status === 404 && requestReads === 0 && envReads === 0 && native.nativeTrace.length === 0 && providerCalls === 0);

    let variants = 0;
    for (const method of METHODS) {
      for (const child of PATHS) for (const query of QUERIES) {
        const path = API_ROOT + child, original = unreadRequest(method, path, query);
        try {
          const response = await routes.handleCommunity(original.request, blockedEnv, new URL(original.request.url).pathname);
          assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'not_found', ...EXPECTED });
          assert.equal(original.request.bodyUsed, false); assert.equal(original.pulls(), 0);
          assert.equal(response.headers.get('Set-Cookie'), null); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
          assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
          assert.match(response.headers.get('Cache-Control'), /no-store/);
          assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
          variants++;
        } finally { await original.close(); }
      }
      check(method + ' exact root and all child/query variants are terminal disabled responses with unread bodies', true);
    }
    check('all 288 original request variants remain zero-context, zero-SQL, zero-provider and zero-log',
      variants === 288 && envReads === 0 && native.nativeTrace.length === 0 && providerCalls === 0 && logs.length === 0);

    for (const path of [API_ROOT + '?upload=true', API_ROOT + '/submit?ignored=1', API_ROOT + '/unknown#fragment']) {
      const response = staged.armyQrReviewRefusal(path);
      assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'not_found', ...EXPECTED });
    }
    check('direct callers retaining query or fragment text cannot evade the disabled prefix', true);
    for (const path of ['/api/community/army', '/api/community/army/qrs', '/api/community/army/qr-copy', '/api/community/census/preview', '/api/community/context']) {
      assert.equal(staged.armyQrReviewRefusal(path), null);
    }
    check('prefix matching cannot replace neighboring Community or legacy Census handlers', true);

    const features = { ...env, COMMUNITY_FEATURES: 'directory,census,army_qr,army-qr',
      ARMY_QR_ENABLED: true, ARMY_QR_UPLOADS_ENABLED: true, ARMY_QR_STORAGE_ENABLED: true };
    const featureResponse = await routes.handleCommunity(blockedRequest, features, API_ROOT + '/submit');
    assert.deepEqual(await featureResponse.json(), { error: 'not_found', ...EXPECTED });
    check('existing or invented feature/configuration values cannot activate upload or storage',
      featureResponse.status === 404 && requestReads === 0 && native.nativeTrace.length === 0);

    const contextRequest = new Request('https://guild.example/api/community/context');
    const originalContext = await load('community-context').communityContext(env, contextRequest, { guildRoleRead: true });
    const contextResponse = await routes.handleCommunity(contextRequest, env, '/api/community/context');
    assert.deepEqual(await contextResponse.json(), JSON.parse(JSON.stringify(load('community-context').contextDto(originalContext))));
    check('unrelated original Community context still returns its actual anonymous capability contract',
      contextResponse.status === 200 && originalContext.subject === null && !contextResponse.headers.has('Set-Cookie'));
    for (const feature of ['', 'census']) {
      const original = unreadRequest('POST', '/api/community/census/preview', '');
      try {
        const response = await routes.handleCommunity(original.request, { ...env, COMMUNITY_FEATURES: feature }, '/api/community/census/preview');
        assert.equal(response.status, feature ? 401 : 404);
        assert.deepEqual(await response.json(), { error: feature ? 'signed_out' : 'not_found' });
        assert.equal(original.request.bodyUsed, false); assert.equal(original.pulls(), 0);
      } finally { await original.close(); }
    }
    check('legacy Census keeps its original feature-OFF and signed-out refusals without a new upload contract', true);
    check('focused fixture leaves Native schema/settings and production transport untouched',
      native.nativeTrace.length === 0 && providerCalls === 0 && logs.length === 0 && db.prepare('SELECT COUNT(*) n FROM site_users').get().n === 0);
    console.log(checks + '/' + checks + ' Army QR disabled staging checks passed');
  } finally { db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
