'use strict';
// Actual signed collector intake -> OAuth -> original Native E2 erasure -> replay.
// Only Discord HTTP and fixture data are synthetic. No source/clock/issuer override.
// Usage: node tests/erased_replay280_workerd_test.cjs --out <evidence> [--port 0] [--cases success,lost,rollback,foreign,race,mutbody,1001]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { build } = require('esbuild'), { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const root = path.resolve(__dirname, '..');
const out = path.resolve(option('--out') || fs.mkdtempSync(path.join(os.tmpdir(), 'em280-evidence-')));
const port = Number(option('--port') || 0), allowed = new Set(['success', 'lost', 'rollback', 'foreign', 'race', 'mutbody', '1001']);
const cases = (option('--cases') || [...allowed].join(',')).split(',');
assert(Number.isInteger(port) && port >= 0 && port <= 65535 && cases.length && new Set(cases).size === cases.length && cases.every(c => allowed.has(c)), 'bounded case/port arguments');
fs.mkdirSync(out, { recursive: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const buildOptions = { entryPoints: [path.join(__dirname, 'erased_replay280_workerd_fixture.mjs')], absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:async_hooks'], metafile: true, logLevel: 'silent' };
let bundle, pins, mutantSites = 0;
const mutant = args.includes('--mutant-ingress');
async function compile() {
  if (mutant) buildOptions.plugins = [{ name: 'test-only-erased-ingress-mutant', setup(builder) { builder.onLoad({ filter: /tithe-receipt280\.ts$/ }, input => {
    const original = fs.readFileSync(input.path, 'utf8');
    const contents = original.replace(/erasedReceiptBlocksSql280\('erased','\?[48]'\)/g, matched => { mutantSites++; const key = /\?[48]/.exec(matched)[0]; return JSON.stringify("(" + key + " IS NULL AND 0)"); });
    assert.equal(mutantSites, 3, 'exact three original ingress barriers only'); return { contents, loader: 'ts' };
  }); } }];
  const compiled = await build(buildOptions); bundle = compiled.outputFiles[0].text;
  pins = Object.keys(compiled.metafile.inputs).map(file => ({ path: path.resolve(root, file), sha256: hash(fs.readFileSync(path.resolve(root, file))) }));
fs.writeFileSync(path.join(out, 'bundle.mjs'), bundle);
}
const checks = [], observations = [];
function check(name, pass) { checks.push({ name, pass: !!pass }); console.log((pass ? 'PASS ' : 'FAIL ') + name); }
const noAcknowledgement = answer => Array.isArray(answer?.acknowledgements) && answer.acknowledgements.length === 0;
const noFalseNoEffect = answer => answer?.version === 242
  && JSON.stringify(Object.keys(answer).sort()) === JSON.stringify(['version', 'acknowledgements', 'deferred', 'policyHolds'].sort())
  && Array.isArray(answer.acknowledgements) && Array.isArray(answer.policyHolds)
  && Array.isArray(answer.deferred) && answer.deferred.length === 0;
const rows = value => value?.results || [];
const markerKey = '0123456789abcdef01234567';
(async () => {
  await compile();
  for (const kind of cases) {
    const directory = path.join(out, kind + '-' + crypto.randomUUID()); fs.mkdirSync(directory);
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'em280-')), http = []; let mf;
    const create = () => new Miniflare(convertV4MiniflareOptions({ rootPath: runtime, script: bundle, modules: true, name: 'erased-replay280', compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], host: '127.0.0.1', port, cf: false, log: new Log(LogLevel.NONE), logRequests: false, telemetry: { enabled: false }, unsafeRegisterWorker: false, unsafeLocalExplorer: false, unsafeObservability: false, resourceTmpPath: path.join(runtime, 't'), resourcePersistencePath: path.join(runtime, 'p'), isolatedResourcePersistencePath: path.join(runtime, 'i'), d1Databases: { DB: 'erased-replay280' }, outboundService: async request => {
      const url = new URL(request.url), route = url.pathname.replace(/^\/api\/v10/, ''), auth = request.headers.get('Authorization');
      http.push({ method: request.method, origin: url.origin, path: route }); assert.equal(url.origin, 'https://discord.com');
      const id = '300000000000000003', guild = '236932545793490944';
      if (request.method === 'POST' && ['/oauth2/token', '/api/oauth2/token'].includes(route)) {
        const body = new URLSearchParams(await request.text()); assert.equal(body.get('client_secret'), 'synthetic-marker-client'); assert.equal(body.get('code'), 'code-' + id);
        return Response.json({ access_token: 'tok-marker', token_type: 'Bearer', scope: body.get('redirect_uri').endsWith('/privacy/callback') ? 'identify' : 'identify guilds.members.read' });
      }
      if (auth === 'Bearer tok-marker' && route === '/users/@me') return Response.json({ id, username: 'marker-owner', global_name: 'Synthetic marker owner', avatar: null });
      if (auth === 'Bearer tok-marker' && route === '/users/@me/guilds/' + guild + '/member') return Response.json({ user: { id }, roles: [], joined_at: '2020-01-01T00:00:00Z', pending: false, nick: null });
      if (auth === 'Bot synthetic-marker-bot' && route === '/guilds/' + guild + '/roles') return Response.json([{ id: guild, name: '@everyone', position: 0, permissions: '0', managed: false }, ...['1551234567890123456', '1551234567890123457', '1551234567890123458'].map((role, i) => ({ id: role, name: 'Synthetic role ' + i, position: i + 1, permissions: '0', managed: false }))]);
      if (auth === 'Bot synthetic-marker-bot' && route === '/guilds/' + guild + '/members/' + id) return Response.json({ user: { id }, roles: [], joined_at: '2020-01-01T00:00:00Z' });
      throw Error('Unexpected synthetic provider route');
    } }));
    try {
      mf = create(); await mf.ready;
      const response = await mf.dispatchFetch('http://fixture.invalid/test?kind=' + kind, { method: 'POST' });
      const text = await response.text(); fs.writeFileSync(path.join(directory, 'response.json'), text);
      const result = JSON.parse(text); assert.equal(response.status, 200, result.error);
      check(kind + ' actual full index/Native/original clock', result.actualLocalWorkerdD1 && result.fullIndex && result.originalNativeIssuer && result.clockOverride === false);
      check(kind + ' original genuinely admitted before erasure', result.intake.status === 200 && result.intake.body.acknowledgements?.length === 1 && result.intake.body.acknowledgements[0].id === markerKey);
      check(kind + ' original collector body unchanged', result.originalUnchanged === true && JSON.stringify(JSON.parse(result.original)) === result.original);
      const before = rows(result.before.receipts), after = rows(result.after.receipts), markers = rows(result.after.markers), original = JSON.parse(result.original);
      if (['rollback', '1001'].includes(kind)) {
        check(kind + ' terminal holds and exact original receipts survive', result.erasure.body.state !== 'complete' && before.length === (kind === '1001' ? 1001 : 1) && JSON.stringify(after) === JSON.stringify(before));
        check(kind + ' original replay barrier custody unchanged', JSON.stringify(markers) === JSON.stringify(rows(result.before.markers)));
      } else {
        const own = markers.filter(m => m.subject === markerKey);
        check(kind + ' original receipts erased and only minimal own marker retained', after.length === 0 && own.length === 1 && own[0].actor === 'system' && own[0].action === 'treasury.erased_replay280' && own[0].details === null && own[0]?.ts === original.requestedAt + 2592000);
        check(kind + ' no replay acknowledgement or recreated receipt', noAcknowledgement(result.replay.body) && after.length === 0 && rows((result.final || result.after).receipts).length === 0);
        if (kind !== 'race') check(kind + ' completed erasure or real lost terminal acknowledgement', kind === 'lost' ? result.terminalLost === true : result.erasure.body.state === 'complete');
        if (kind === 'mutbody') check('different freshly signed body with original opaque key stays blocked at original expiry', result.replayInput.id === original.id && result.replayInput.donation.copper === original.donation.copper + 1 && result.replayInput.evidence.mac !== original.evidence.mac && own[0]?.ts === original.requestedAt + 2592000);
        if (kind === 'foreign') check('foreign malformed custody does not globally block erasure', markers.length === 2 && markers.some(m => m.subject === 'f'.repeat(24) && m.details !== null));
        if (kind === 'race') check('adjacent erase race never fabricates a no-effect receipt', noFalseNoEffect(result.replay.body));
      }
      check(kind + ' replay leaves exact retained receipts and marker expiry unchanged',
        JSON.stringify(rows((result.final || result.after).receipts)) === JSON.stringify(after)
        && JSON.stringify(rows((result.final || result.after).markers)) === JSON.stringify(markers));
      if (['success', 'lost'].includes(kind)) {
        await mf.dispose(); mf = create(); await mf.ready;
        const resumed = await mf.dispatchFetch('http://fixture.invalid/resume?kind=resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: result.original });
        const restart = await resumed.json(); fs.writeFileSync(path.join(directory, 'restart.json'), JSON.stringify(restart, null, 2));
        check(kind + ' persisted-isolate replay still refused without marker renewal', resumed.status === 200 && noAcknowledgement(restart.replay.body) && rows(restart.after.receipts).length === 0 && JSON.stringify(rows(restart.before.markers)) === JSON.stringify(rows(restart.after.markers)));
      }
      check(kind + ' no provider role/payment/message mutation', http.every(r => r.method === 'GET' || r.method === 'POST' && ['/oauth2/token', '/api/oauth2/token'].includes(r.path)));
      observations.push({ kind, directory, runtime, responseSHA256: hash(text), requests: result.requests, http });
    } finally { if (mf) await mf.dispose(); }
  }
  const stable = pins.every(p => hash(fs.readFileSync(p.path)) === p.sha256); check('compiled current source remained unchanged', stable);
  const result = { at: new Date().toISOString(), testOnlyMutant: mutant, mutantSites, checks, passed: checks.filter(c => c.pass).length, total: checks.length, stable, bundleSHA256: hash(bundle), pins, observations, limits: ['Synthetic local Native/D1 and external replies; no production or game-client acceptance', 'Observer retains actual response metadata/counts rather than bulky copied Native payloads; original requests/responses are not modified', 'Whole-account source/hold budgets are distinct from the identify-only less-than100SQL requirement'] };
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(result.passed + '/' + result.total + ' actual erased replay checks'); if (result.passed !== result.total) process.exitCode = 1;
})().catch(error => { fs.writeFileSync(path.join(out, 'ERROR.json'), JSON.stringify({ at: new Date().toISOString(), error: String(error.stack), checks, observations }, null, 2)); console.error(error.stack); process.exitCode = 1; });
