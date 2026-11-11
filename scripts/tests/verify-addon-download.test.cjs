#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const {load} = require('../../worker/tests/helpers/privacy129_fixture.cjs');
const index = load('index').default, {armyReporterPage} = load('army-pages');
const pack = require('../build-verify-addon.cjs');
const paths = ['/' + pack.ZIP.slice('worker/public/'.length), '/' + pack.MANIFEST.slice('worker/public/'.length)];
const calls = [];
const env = {PUBLIC_BASE_URL:'https://bot.example', SITE_HOST:'site.example', ASSETS:{async fetch(request) {
  calls.push(request); const url = new URL(request.url);
  assert(paths.includes(url.pathname)); assert.equal(url.search, ''); assert.equal(request.method, 'GET');
  assert.deepEqual([...request.headers], []); assert.equal(request.redirect, 'manual');
  return new Response(fs.readFileSync(path.join(root, 'worker/public', url.pathname)), {headers:{'Set-Cookie':'must-not-escape=1','Content-Type':'text/plain','Location':'https://unexpected.example'}});
}}};
Object.defineProperty(env, 'DB', {get(){throw Error('public download touched database');}});
const ctx = {waitUntil(){throw Error('public download scheduled work');}};
let passed = 0;
async function check(label, fn) { await fn(); passed++; console.log('PASS ' + label); }
async function fetchAt(host, file, method = 'GET') { return index.fetch(new Request('https://' + host + file, {method, headers:{Cookie:'private=not-forwarded', Authorization:'not-forwarded'}}), env, ctx); }
(async () => {
  for (let i = 0; i < paths.length; i++) {
    const file = paths[i], bytes = fs.readFileSync(path.join(root, 'worker/public', file));
    await check('anonymous real entry serves exact bytes and safe headers: ' + file, async () => {
      const r = await fetchAt('site.example', file + '?ignored=private'); assert.equal(r.status, 200);
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes); assert.equal(r.headers.get('content-type'), i === 0 ? 'application/zip' : 'application/json; charset=utf-8');
      assert.equal(r.headers.get('set-cookie'), null); assert.equal(r.headers.get('location'), null);
      assert.equal(r.headers.get('cache-control'), 'no-store, no-transform'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('content-disposition'), i === 0 ? `attachment; filename="olympus-verify-${pack.VERSION}.zip"` : null);
    });
    await check('HEAD has no body: ' + file, async () => { const r = await fetchAt('site.example', file, 'HEAD'); assert.equal(r.status, 200); assert.equal(await r.text(), ''); });
    for (const host of ['bot.example','unknown.example']) await check('download denied on ' + host + ': ' + file, async () => {
      const before = calls.length, r = await fetchAt(host, file); assert.equal(r.status, 404); assert.equal(calls.length, before);
    });
    for (const method of ['POST','PUT','DELETE','OPTIONS']) await check(method + ' cannot access public asset: ' + file, async () => {
      const before = calls.length, r = await fetchAt('site.example', file, method); assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET, HEAD'); assert.equal(calls.length, before);
    });
    for (const alias of [file + '/', file.replace('olympus-verify', '%6flympus-verify'), file.replace('olympus-verify', 'OLYMPUS-VERIFY'), file.replace('/static/', '/%73tatic/')]) await check('encoded/case/trailing alias denied: ' + alias, async () => {
      const before = calls.length, r = await fetchAt('site.example', alias); assert.equal(r.status, 404); assert.equal(calls.length, before);
    });
  }
  await check('asset redirect/failure cannot become a public response', async () => {
    const e = {...env, ASSETS:{fetch:async()=>new Response(null,{status:302,headers:{Location:'https://unexpected.example'}})}};
    const r = await index.fetch(new Request('https://site.example' + paths[0]), e, ctx); assert.equal(r.status, 404); assert.equal(r.headers.get('location'), null);
  });
  await check('an earlier package path cannot bypass the current public download allowlist', async () => {
    const before = calls.length;
    const r = await fetchAt('site.example', '/static/olympus-verify/olympus-verify-0.6.29.zip');
    assert.equal(r.status, 404); assert.equal(calls.length, before);
  });
  await check('setup HTML links Verify update while preserving Olympus Guild and Army retirement', async () => {
    const html = await armyReporterPage(new Request('https://site.example/army/report')).text();
    for (const file of paths) assert(html.includes('href="' + file + '"'));
    assert(html.includes('Download Olympus Verify ' + pack.VERSION));
    assert(html.includes('https://www.curseforge.com/wow/addons/olympus-guild')); assert(html.includes('There is no separate Army addon download.'));
    assert(!html.includes('olympus-army-addon-0.2.0.zip')); assert(html.includes('preserve private Config.lua'));
  });
  const native = await require('./helpers/verify-addon-native-assets.cjs')(root);
  console.log(JSON.stringify({passed:passed+native.checks,failed:0,unitChecks:passed,nativeAssetChecks:native.checks,assetRequests:calls.length,databaseReads:0,providerCalls:0}));
})().catch(e => {console.error(e); process.exitCode=1;});
