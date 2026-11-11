'use strict';
// Native Request and the real assets service: a JavaScript Fetcher double accepts
// redirect:error, while workerd rejects it before ASSETS.fetch can run.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');

module.exports = async function verifyAddonNativeAssets(root) {
  const localRequire = createRequire(path.join(root, 'worker/package.json'));
  const esbuild = localRequire('esbuild');
  const {Miniflare, Log, LogLevel} = localRequire('miniflare');
  const pack = require('../../build-verify-addon.cjs');
  const paths = [pack.MANIFEST, pack.ZIP].map(p => '/' + p.slice('worker/public/'.length));
  const route = path.join(root, 'worker/src/verify-addon-download.ts');
  const current = fs.readFileSync(route, 'utf8');
  assert.equal(current.split("redirect: 'manual'").length, 2);
  const prior = current.replace("redirect: 'manual'", "redirect: 'error'");
  assert.equal(prior.replace("redirect: 'error'", "redirect: 'manual'"), current);
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  let checks = 0;

  async function fixture(before, redirects = false) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-verify-native-assets-'));
    const assets = path.join(scratch, 'assets');
    fs.mkdirSync(path.join(assets, 'static/olympus-verify'), {recursive: true});
    for (const p of paths) fs.copyFileSync(path.join(root, 'worker/public', p), path.join(assets, p));
    if (redirects) fs.writeFileSync(path.join(assets, '_redirects'),
      paths.map(p => p + ' https://unexpected.invalid/only 302').join('\n') + '\n');
    // Observe the exact Request, then delegate to the genuine native binding.
    // No response, asset bytes or redirect behavior is supplied by a JS double.
    const entry = `import app from ${JSON.stringify(path.join(root, 'worker/src/index.ts'))};
      export default { async fetch(request, env, ctx) {
        const trace = [], original = env.ASSETS;
        const scoped = {...env, ASSETS: {fetch(asset) {
          const url = new URL(asset.url);
          trace.push({method: asset.method, path: url.pathname, search: url.search,
            headers: [...asset.headers], redirect: asset.redirect});
          return original.fetch(asset);
        }}};
        try {
          const result = await app.fetch(request, scoped, ctx), headers = new Headers(result.headers);
          headers.set('X-Fixture-Asset-Trace', JSON.stringify(trace));
          return new Response(result.body, {status: result.status, headers});
        } catch (error) {
          return Response.json({name: error.name, message: error.message,
            assetCalls: trace.length}, {status: 500});
        }
      }};`;
    const output = await esbuild.build({
      stdin: {contents: entry, resolveDir: path.join(root, 'worker'), sourcefile: 'verify-native-assets.mjs'},
      bundle: true, platform: 'browser', external: ['node:*'], format: 'esm',
      target: 'es2022', write: false,
      plugins: [{name: 'one-token-historical-counterexample', setup(build) {
        build.onLoad({filter: /verify-addon-download\.ts$/}, args => ({
          contents: before ? prior : current, loader: 'ts', resolveDir: path.dirname(args.path),
        }));
      }}],
    });
    const mf = new Miniflare({
      host: '127.0.0.1', port: 0, cf: false, logRequests: false, telemetry: {enabled: false},
      unsafeLocalExplorer: false, unsafeObservability: false,
      resourceTmpPath: path.join(scratch, 'tmp'), resourcePersistencePath: path.join(scratch, 'persist'),
      isolatedResourcePersistencePath: path.join(scratch, 'isolated'), log: new Log(LogLevel.NONE),
      workers: [{config: {
        name: 'verify-native-assets-test', compatibilityDate: '2026-09-01',
        compatibilityFlags: ['nodejs_compat'],
        manifest: {mainModule: 'index.js', modulesRoot: scratch,
          modules: {'index.js': {type: 'esm', contents: output.outputFiles[0].contents}}},
        // A database is deliberately absent. These exact public paths cannot read one.
        env: {ASSETS: {type: 'assets'}, SITE_HOST: {type: 'text', value: 'site.example'},
          PUBLIC_BASE_URL: {type: 'text', value: 'https://bot.example'}},
        assets: {directory: assets, runWorkerFirst: true, hasUserWorker: true},
      }, dev: {unsafeRegisterWorker: false, outboundService: {type: 'fetcher', handler() {
        throw Error('native asset test attempted external network');
      }}}}],
    });
    return {mf, async dispose() {
      await mf.dispose();
      const resolved = path.resolve(scratch);
      assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
      assert(path.basename(resolved).startsWith('olympus-verify-native-assets-'));
      assert(!fs.lstatSync(resolved).isSymbolicLink());
      fs.rmSync(resolved, {recursive: true, force: true});
    }};
  }

  for (const before of [true, false]) {
    const local = await fixture(before);
    try {
      for (const p of paths) for (const method of ['GET', 'HEAD']) {
        const response = await local.mf.dispatchFetch('https://site.example' + p + '?private=not-forwarded', {
          method, headers: {Cookie: 'PRIVATE_COOKIE', Authorization: 'PRIVATE_AUTH',
            Referer: 'https://private.invalid', Location: 'https://private.invalid'},
        });
        if (before) {
          assert.equal(response.status, 500);
          if (method === 'GET') {
            const error = await response.json();
            assert.equal(error.name, 'TypeError');
            assert(error.message.includes('Invalid redirect'));
            assert.equal(error.assetCalls, 0);
          } else await response.arrayBuffer();
        } else {
          assert.equal(response.status, 200);
          assert.deepEqual(JSON.parse(response.headers.get('X-Fixture-Asset-Trace')), [
            {method: 'GET', path: p, search: '', headers: [], redirect: 'manual'},
          ]);
          assert.equal(response.headers.get('set-cookie'), null);
          assert.equal(response.headers.get('location'), null);
          const body = Buffer.from(await response.arrayBuffer());
          if (method === 'HEAD') assert.equal(body.length, 0);
          else assert.deepEqual(body, fs.readFileSync(path.join(root, 'worker/public', p)));
          assert.equal(response.headers.get('content-type'), p.endsWith('.zip')
            ? 'application/zip' : 'application/json; charset=utf-8');
          assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
          assert.equal(response.headers.get('content-disposition'), p.endsWith('.zip')
            ? `attachment; filename="olympus-verify-${pack.VERSION}.zip"` : null);
        }
        checks++;
      }
      if (!before) {
        for (const host of ['bot.example', 'unknown.example']) {
          const response = await local.mf.dispatchFetch('https://' + host + paths[0]);
          assert.equal(response.status, 404);
          assert.equal(response.headers.get('X-Fixture-Asset-Trace'), '[]');
          checks++;
        }
        for (const p of [paths[0] + '/', paths[0].replace('olympus-verify', '%6flympus-verify')]) {
          const response = await local.mf.dispatchFetch('https://site.example' + p);
          assert.equal(response.status, 404);
          assert.equal(response.headers.get('X-Fixture-Asset-Trace'), '[]');
          checks++;
        }
        for (const p of paths) for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
          const response = await local.mf.dispatchFetch('https://site.example' + p, {method});
          assert.equal(response.status, 405);
          assert.equal(response.headers.get('allow'), 'GET, HEAD');
          assert.equal(response.headers.get('X-Fixture-Asset-Trace'), '[]');
          await response.arrayBuffer();
          checks++;
        }
        const previous = await local.mf.dispatchFetch('https://site.example/static/olympus-verify/olympus-verify-0.6.29.zip');
        assert.equal(previous.status, 404);
        assert.equal(previous.headers.get('X-Fixture-Asset-Trace'), '[]');
        await previous.arrayBuffer();
        checks++;
      }
    } finally { await local.dispose(); }
  }
  const redirects = await fixture(false, true);
  try {
    for (const p of paths) {
      const response = await redirects.mf.dispatchFetch('https://site.example' + p, {redirect: 'manual'});
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('location'), null);
      assert.equal(JSON.parse(response.headers.get('X-Fixture-Asset-Trace')).length, 1);
      await response.arrayBuffer();
      checks++;
    }
  } finally { await redirects.dispose(); }
  assert.equal(checks, 23);
  console.log('PASS native Request/real ASSETS: historical error counterexample and 23 integration checks');
  return {checks, priorRouteSHA256: sha(prior), routeSHA256: sha(current)};
};
