'use strict';
// Actual normal and identify-only OAuth/form exports on synthetic Native D1 data.
// Run one bounded group per process; retain the real five-download limiter.
// node tests/treasury_owncopy280_workerd_test.cjs --out <evidence> [--group malformed|ownership|edges]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { build } = require('esbuild');
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const groups = {
  malformed: ['nul-sourceid', 'nul-v2-sourceid', 'bad-ts-text', 'verified'],
  ownership: ['short-hex', 'duplicate', 'duplicate-own', 'empty-binding'],
  edges: ['valid-min', 'valid-max', 'left', 'unbound'],
};
const group = option('--group') || 'malformed';
assert(Object.hasOwn(groups, group), 'one named bounded group');
assert(args.every((arg, i) => i % 2 ? true : ['--out', '--group'].includes(arg)) && args.length % 2 === 0, 'closed test arguments');
const cases = groups[group];
assert(cases.length <= 4, 'at most four normal/identify downloads per isolate and process');
const root = path.resolve(__dirname, '..'), out = path.resolve(option('--out') || fs.mkdtempSync(path.join(os.tmpdir(), 'oc280-evidence-')));
fs.mkdirSync(out, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ID = '300000000000000003', GUILD = '236932545793490944', BASE = 'https://guild.example';
const privateText = 'SYNTHETIC_PRIVATE_CORRESPONDENCE_OWNCOPY', privateHash = 'f19c73ab'.repeat(8);
const keys = ['ts', 'version', 'sourceId', 'source', 'guid', 'copper', 'kind', 'observedAt', 'retainUntil', 'classification'].sort();
const http = [], checks = [], observations = [];
const check = (name, pass) => { checks.push({ name, pass: !!pass }); console.log((pass ? 'PASS ' : 'FAIL ') + name); };
const jar = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const forbidden = text => text.includes(privateText) || text.includes(privateHash);
let mf;
(async () => {
  const built = await build({ entryPoints: [path.join(__dirname, 'treasury_owncopy280_workerd_fixture.mjs')], absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:async_hooks'], tsconfig: path.join(root, 'tsconfig.json'), metafile: true, logLevel: 'silent' });
  const bundle = built.outputFiles[0].text;
  const pins = Object.keys(built.metafile.inputs).map(file => ({ path: path.relative(root, path.resolve(root, file)).replaceAll('\\', '/'), sha256: hash(fs.readFileSync(path.resolve(root, file))) }));
  fs.writeFileSync(path.join(out, 'bundle.mjs'), bundle);
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'oc280-'));
  try {
    mf = new Miniflare(convertV4MiniflareOptions({ rootPath: runtime, script: bundle, modules: true, name: 'owncopy280', compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], host: '127.0.0.1', port: 0, cf: false, log: new Log(LogLevel.NONE), logRequests: false, telemetry: { enabled: false }, unsafeRegisterWorker: false, unsafeLocalExplorer: false, unsafeObservability: false, resourceTmpPath: path.join(runtime, 't'), resourcePersistencePath: path.join(runtime, 'p'), isolatedResourcePersistencePath: path.join(runtime, 'i'),
      d1Databases: Object.fromEntries(cases.map(kind => ['DB_' + kind.replaceAll('-', '_'), 'owncopy280-' + kind])),
      outboundService: async request => {
        const url = new URL(request.url), route = url.pathname.replace(/^\/api\/v10/, ''), auth = request.headers.get('Authorization');
        http.push({ method: request.method, origin: url.origin, path: route });
        assert.equal(url.origin, 'https://discord.com', 'only synthetic Discord replies');
        if (request.method === 'POST' && ['/oauth2/token', '/api/oauth2/token'].includes(route)) {
          const form = new URLSearchParams(await request.text());
          assert.equal(form.get('client_secret'), 'synthetic-native-client'); assert.equal(form.get('code'), 'code-' + ID);
          return Response.json({ access_token: 'tok-' + ID, token_type: 'Bearer', scope: form.get('redirect_uri').endsWith('/privacy/callback') ? 'identify' : 'identify guilds.members.read' });
        }
        if (auth === 'Bearer tok-' + ID && route === '/users/@me') return Response.json({ id: ID, username: 'audit_owner', global_name: 'Synthetic owner', avatar: null });
        if (auth === 'Bearer tok-' + ID && route === '/users/@me/guilds/' + GUILD + '/member') return Response.json({ user: { id: ID }, roles: [], joined_at: '2020-01-01T00:00:00Z', pending: false, nick: null });
        throw Error('Unplanned synthetic provider route');
      },
    }));
    await mf.ready;
    for (const kind of cases) {
      const directory = path.join(out, kind); fs.mkdirSync(directory);
      const front = route => BASE + '/front' + route + (route.includes('?') ? '&' : '?') + 'case=' + kind;
      const call = (method, route, { cookie, form } = {}) => mf.dispatchFetch(front(route), { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { 'X-Fixture-Origin': BASE, 'X-Olympus': '2' } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, redirect: 'manual', ...(form ? { body: new URLSearchParams(form).toString() } : {}) });
      for (const phase of ['setup', 'mutate']) {
        const response = await mf.dispatchFetch('http://fixture.invalid/' + phase + '?case=' + kind, { method: 'POST' });
        const raw = await response.text(); fs.writeFileSync(path.join(directory, phase + '.json'), raw);
        assert.equal(response.status, 200, phase + ' original Native setup: ' + raw);
      }
      const login = await call('GET', '/auth/login');
      const state = new URL(login.headers.get('Location')).searchParams.get('state');
      const callback = await call('GET', '/auth/callback?code=code-' + ID + '&state=' + encodeURIComponent(state), { cookie: jar(login) });
      assert.equal(callback.status, 303, 'normal original OAuth callback');
      const normal = await call('GET', '/api/me/export', { cookie: jar(callback) }), normalRaw = await normal.text();
      fs.writeFileSync(path.join(directory, 'normal.json'), normalRaw);
      const normalBody = JSON.parse(normalRaw), normalInspect = await (await mf.dispatchFetch('http://fixture.invalid/inspect?case=' + kind)).json();
      fs.writeFileSync(path.join(directory, 'normal-native.json'), JSON.stringify(normalInspect, null, 2));

      const entry = await call('GET', '/privacy/signin'), csrf = /name="csrf" value="([^"]+)"/.exec(await entry.text())?.[1];
      assert(csrf, 'original privacy signin CSRF');
      const start = await call('POST', '/privacy/signin', { cookie: jar(entry), form: { csrf } });
      assert(start.headers.get('Location'), 'original privacy signin redirect');
      const identifyState = new URL(start.headers.get('Location')).searchParams.get('state');
      const identifyCallback = await call('GET', '/privacy/callback?code=code-' + ID + '&state=' + encodeURIComponent(identifyState) + '&iss=https%3A%2F%2Fdiscord.com', { cookie: jar(start) });
      assert.equal(identifyCallback.status, 303, 'identify original OAuth callback');
      const cookie = jar(identifyCallback), page = await call('GET', '/privacy/access', { cookie }), html = await page.text();
      const originalForm = /<form method="post" action="\/privacy\/access\/export">([\s\S]*?)<\/form>/.exec(html);
      assert(originalForm, 'original access export form');
      const form = { csrf: /name="csrf" value="([^"]+)"/.exec(originalForm[1])[1], grant: /name="grant" value="([^"]+)"/.exec(originalForm[1])[1] };
      const identified = await call('POST', '/privacy/access/export', { cookie, form }), identifiedRaw = await identified.text();
      fs.writeFileSync(path.join(directory, 'identify.json'), identifiedRaw);
      const identifiedBody = JSON.parse(identifiedRaw), identifiedInspect = await (await mf.dispatchFetch('http://fixture.invalid/inspect?case=' + kind)).json();
      fs.writeFileSync(path.join(directory, 'identify-native.json'), JSON.stringify(identifiedInspect, null, 2));

      const treasury = normalBody.community?.treasury242, records = treasury?.receipts ?? [];
      const excluded = ['short-hex', 'duplicate', 'duplicate-own', 'empty-binding'].includes(kind);
      const facts = normalInspect.sourceFacts;
      const expected = excluded ? [] : [
        { ts: facts.currentClock.ts, version: 242, sourceId: facts.currentId, source: 'mail', guid: facts.guid, copper: 700, kind: null, observedAt: facts.currentClock.observedAt, retainUntil: facts.currentClock.retainUntil, classification: 'unclassified_receipt' },
        { ts: facts.now, version: 2, sourceId: 'd'.repeat(24), source: 'tithe-gold-v2', guid: facts.guid, copper: 900, kind: 'trade', observedAt: facts.now, retainUntil: facts.now + 2592000, classification: 'unclassified_receipt' },
      ];
      const canonical = value => JSON.stringify(value.map(row => Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]]))));
      for (const [flow, response, raw, body, inspect] of [['normal', normal, normalRaw, normalBody, normalInspect], ['identify', identified, identifiedRaw, identifiedBody, identifiedInspect]]) {
        check(kind + ' ' + flow + ' actual full-index Native1000 export below100 physicalSQL', response.status === 200 && inspect.accounts === 1000 && inspect.copy.physicalStatements < 100 && inspect.actualLocalWorkerdD1 && inspect.originalWireObserver && inspect.clockOverride === false && inspect.handlerOverride === false && inspect.issuerOverride === false);
        observations.push({ kind, flow, status: response.status, physicalSQL: inspect.copy.physicalStatements, elapsedMilliseconds: inspect.copy.elapsedMilliseconds, treasury: body.community?.treasury242 ?? null, authority: body.identity?.authority ?? 'ordinary_session' });
      }
      check(kind + ' exact GUID/current unique association; no name fallback or malformed receipt', canonical(records) === canonical(expected));
      check(kind + ' receipt DTO contains only closed scalar fields', records.every(row => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(keys)));
      check(kind + ' original receipt clocks/amounts/classification unchanged', records.every(row => ['ts', 'observedAt', 'retainUntil'].every(key => Number.isSafeInteger(row[key]) && row[key] > 0) && row.retainUntil === row.observedAt + 2592000 && [700, 900].includes(row.copper) && row.classification === 'unclassified_receipt') && canonical(records) === canonical(expected));
      check(kind + ' private correspondence and payload hash absent from HTTP', !forbidden(normalRaw));
      check(kind + ' private correspondence and payload hash absent from actual Native response bytes', normalInspect.wires.every(wire => typeof wire.responseBody === 'string' && !forbidden(wire.responseBody)));
      check(kind + ' truthful unsupported coverage is informational only', treasury?.coverage === 'unique_current_registered_guid_only' && treasury?.unsupported === 'omitted' && treasury?.automaticCredit === false);
      check(kind + ' identify curated copy deliberately omits treasury family', identifiedBody.community?.treasury242 === undefined && !forbidden(identifiedRaw));
      check(kind + ' identify original Native response bytes omit treasury correspondence', identifiedInspect.wires.every(wire => typeof wire.responseBody === 'string' && !forbidden(wire.responseBody)));
      check(kind + ' normal and identify keep intentional distinct source families', treasury !== undefined && identifiedBody.community?.treasury242 === undefined);
    }
    check('only synthetic OAuth token POST and provider reads', http.every(call => call.method === 'GET' || call.method === 'POST' && ['/oauth2/token', '/api/oauth2/token'].includes(call.path)));
    const stable = pins.every(pin => hash(fs.readFileSync(path.resolve(root, pin.path))) === pin.sha256);
    check('all actually compiled source inputs remained unchanged', stable);
    const result = { at: new Date().toISOString(), group, cases, checks, passed: checks.filter(check => check.pass).length, total: checks.length, stable, pins, bundleSHA256: hash(bundle), fixtureSHA256: hash(fs.readFileSync(path.join(__dirname, 'treasury_owncopy280_workerd_fixture.mjs'))), observations, http, runtime, limits: ['Synthetic stored receipt shapes; not collector upload, live provider or game acceptance', 'Recorded-live pre-seal Native layout only', 'Each process serves at most four cases through the real rate limiter; no override, issuer replacement or clock redating', 'Normal current registered GUID association is not fresh verification, promotion or automatic-credit authority', 'Compiled input hashes are custody metadata, never a historical source-hash acceptance oracle'] };
    fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(result.passed + '/' + result.total + ' current own-copy checks');
    if (result.passed !== result.total) process.exitCode = 1;
  } finally { if (mf) await mf.dispose(); }
})().catch(error => {
  fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ at: new Date().toISOString(), error: String(error.stack), checks, observations }, null, 2));
  console.error(error.stack); process.exitCode = 1;
});
