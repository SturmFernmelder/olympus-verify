'use strict';
// Standalone focused runtime check; deliberately absent from the default CI graph.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {buildSync} = require('esbuild');
const {Miniflare, Log, LogLevel, convertV4MiniflareOptions} = require('miniflare');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-display268-'));
let mf;
(async () => {
  try {
    const script = buildSync({entryPoints: [path.join(__dirname, 'strict_roster_display268_runtime.mjs')], absWorkingDir: root,
      bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:async_hooks'],
      tsconfig: path.join(root, 'tsconfig.json'), logLevel: 'silent'}).outputFiles[0].text;
    mf = new Miniflare(convertV4MiniflareOptions({rootPath: temp, script, modules: true,
      compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], host: '127.0.0.1', port: 0, cf: false,
      log: new Log(LogLevel.NONE), logRequests: false, telemetry: {enabled: false}, unsafeRegisterWorker: false,
      unsafeLocalExplorer: false, unsafeObservability: false, d1Databases: {DB: 'strict-display268'},
      resourceTmpPath: path.join(temp, 'tmp'), resourcePersistencePath: path.join(temp, 'persist'),
      isolatedResourcePersistencePath: path.join(temp, 'isolated'),
      outboundService: () => { throw Error('display test attempted an outbound request'); }}));
    const response = await mf.dispatchFetch('http://fixture.invalid/display', {method: 'POST'}), result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.complete, true); assert.equal(result.actualLocalWorkerdD1, true);
    assert(result.checks.length > 0 && result.checks.every(check => check.passed));
    for (const check of result.checks) console.log('PASS ' + check.name);
    console.log('STRICT_DISPLAY268_RESULT ' + JSON.stringify({passed: result.checks.length, actualLocalWorkerdD1: true, providerCalls: 0}));
  } finally {
    if (mf) await mf.dispose();
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert(path.basename(temp).startsWith('olympus-display268-'));
    fs.rmSync(temp, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
