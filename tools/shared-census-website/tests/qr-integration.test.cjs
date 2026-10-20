'use strict';
// Independent finite HTTP checks. One owned child holds the original Worker fixture
// and an actual synthetic Lua/PNG generator; all decoded pixels remain in test RAM.
const assert = require('node:assert/strict'), http = require('node:http'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const dependency = process.env.NODE_PATH || path.join(ROOT, 'worker/node_modules');
const { readSyntheticPng } = require('./synthetic-png.cjs');
const jsQR = require('../../guild-qr-pilot/vendor/jsqr-1.4.0.js');
const protocol = require('../../guild-qr-pilot/protocol.js');
const START = 1792530000, consentVersion = 'synthetic-census-v1';
const qrStart = '/__lab/qr/start', qrAccept = '/__lab/qr/accept', qrCancel = '/__lab/qr/cancel';
const intentPath = '/api/community/shared-census/intents', reportPath = '/api/community/shared-census/reports';
let child, origin, port, logicalNow = START, passed = 0, failed = 0;
const waiting = new Map(), backlog = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, operation) { try { await operation(); passed++; console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); } }
function waitMessage(type, timeout = 25000) {
  if (backlog.has(type)) { const message = backlog.get(type); backlog.delete(type); return Promise.resolve(message); }
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { waiting.delete(type); reject(Error('Owned fixture event timed out: ' + type)); }, timeout); waiting.set(type, message => { clearTimeout(timer); resolve(message); }); });
}
function send(message) { if (!child?.connected) throw Error('Owned child is not connected'); child.send(message); }
async function command(type, extra = {}) { const next = waitMessage(type + '-ack'); send({ type, ...extra }); return next; }
async function start() {
  const boot = String.raw`
    const {createWebsiteServer}=require('./tools/shared-census-website/serve.cjs');
    const {createFixture}=require('./tools/shared-census-website/qr-fixtures.cjs');
    let app,clock=${START},holdNext=false,release;
    const factory=async input=>{const result=await createFixture(input);if(holdNext){holdNext=false;process.send({type:'generation-held'});await new Promise(resolve=>{release=resolve;});release=null;}return result;};
    createWebsiteServer({port:0,now:()=>clock,qrFixtureFactory:factory}).then(value=>{app=value;process.send({type:'ready',origin:app.origin(),pid:process.pid});}).catch(error=>{console.error(error.stack);process.exitCode=1;process.disconnect();});
    process.on('message',async message=>{
      if(message.type==='hold-next'){holdNext=true;process.send({type:'hold-next-ack'});}
      if(message.type==='release'){release?.();process.send({type:'release-ack'});}
      if(message.type==='advance'){clock+=message.seconds;process.send({type:'advance-ack',now:clock});}
      if(message.type==='close'&&app){release?.();const status=app.status();await app.close();process.send({type:'closed',status});process.disconnect();}
    });`;
  const ready = waitMessage('ready');
  child = spawn(process.execPath, ['-e', boot], { cwd: ROOT, env: { ...process.env, NODE_PATH: dependency }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.on('data', bytes => process.stdout.write('[owned QR fixture] ' + bytes));
  child.stderr.on('data', bytes => process.stderr.write('[owned QR fixture] ' + bytes));
  child.on('message', message => { const listener = waiting.get(message.type); if (listener) { waiting.delete(message.type); listener(message); } else backlog.set(message.type, message); });
  const value = await ready; assert.match(value.origin, /^http:\/\/127\.0\.0\.1:\d+$/); origin = value.origin; port = Number(new URL(origin).port);
  console.log('OWNED_QR_FIXTURE ' + JSON.stringify({ origin, pid: value.pid, syntheticOnly: true, realInput: false }));
}
function client() { return { cookies: new Map(), csrf: null }; }
const cookieLine = c => [...c.cookies].map(([key, value]) => key + '=' + value).join('; ');
function adopt(c, headers, json) {
  if (!c) return;
  for (const row of headers['set-cookie'] || []) { const first = row.split(';')[0], index = first.indexOf('='), key = first.slice(0, index), value = first.slice(index + 1); if (/max-age=0/i.test(row) || !value) c.cookies.delete(key); else c.cookies.set(key, value); }
  if (json?.csrfToken) c.csrf = json.csrfToken;
}
function request(route, { method = 'GET', c = null, value, raw, headers = {}, security = true, timeout = 20000, update = true } = {}) {
  const body = raw === undefined ? value === undefined ? null : Buffer.from(JSON.stringify(value)) : Buffer.from(raw);
  const supplied = { Host: '127.0.0.1:' + port };
  if (c?.cookies.size) supplied.Cookie = cookieLine(c);
  if (body !== null) { supplied['Content-Type'] = 'application/json'; supplied['Content-Length'] = body.length; }
  if (['POST', 'DELETE'].includes(method) && security) { supplied.Origin = origin; if (c?.csrf) supplied['X-Census-CSRF'] = c.csrf; }
  for (const [key, value] of Object.entries(headers)) { if (value === null) delete supplied[key]; else supplied[key] = value; }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, method, headers: supplied, agent: false }, res => {
      const chunks = []; res.on('data', bytes => chunks.push(bytes)); res.on('end', () => { const bytes = Buffer.concat(chunks), text = bytes.toString('utf8'); let json; try { json = JSON.parse(text); } catch {} if (update) adopt(c, res.headers, json); resolve({ status: res.statusCode, headers: res.headers, bytes, text, json }); });
    });
    req.setTimeout(timeout, () => req.destroy(Error('Owned QR HTTP deadline'))); req.on('error', reject); req.end(body);
  });
}
const counts = status => Object.fromEntries(['fixturePreviews', 'syntheticSubmissions', 'unknownResponses', 'intents', 'receipts', 'contents', 'attempts', 'contentPayloads'].map(key => [key, status.census[key]]));
async function status() { const out = await request('/__preview/status'); assert.equal(out.status, 200); return out.json; }
async function choose(c, mode) { return request('/__preview/' + mode, { c }); }
async function state(c) { const out = await request('/__lab/state', { c }); assert.equal(out.status, 200); return out.json; }
async function reset(c) { const out = await request('/__lab/reset', { method: 'POST', c, value: {} }); assert.equal(out.status, 200); logicalNow = out.json.now; return out.json; }
async function makeQr(c, scenario = 'fresh', guildKey = 'guild-oak') { const out = await request(qrStart, { method: 'POST', c, value: { guildKey, scenario } }); assert.equal(out.status, 201, out.text); return out.json; }
async function decode(c, qr) {
  assert.equal(qr.syntheticOnly, true); assert.match(qr.qrId, /^[a-zA-Z0-9-]{1,100}$/); assert.match(qr.nonce, /^[0-9a-f]{32}$/); assert.match(qr.payloadSHA256, /^[0-9a-f]{64}$/);
  assert.equal(qr.expiresAt, logicalNow + 30); assert.ok(Number.isInteger(qr.frameCount) && qr.frameCount >= 1 && qr.frameCount <= 14); assert.equal(qr.images.length, qr.frameCount); assert.equal(new Set(qr.images).size, qr.frameCount);
  const assembler = protocol.createAssembler({ nonce: qr.nonce, clock: () => logicalNow * 1000 }); let complete;
  for (let index = 0; index < qr.images.length; index++) {
    assert.equal(qr.images[index], '/__lab/qr/' + qr.qrId + '/images/' + (index + 1));
    const image = await request(qr.images[index], { c }); assert.equal(image.status, 200); assert.equal(image.headers['content-type'], 'image/png'); assert.equal(image.headers['cache-control'], 'no-store'); assert.equal(image.headers['access-control-allow-origin'], undefined); assert.equal(image.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.ok(image.bytes.length < 4 * 1024 * 1024);
    const png = readSyntheticPng(image.bytes); assert.ok(png.width <= 1280 && png.height <= 1280); const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: 'dontInvert' }); assert.ok(decoded?.data?.startsWith('OLCS1|'), 'Actual Lua rendered PNG must decode to OLCS1'); complete = await assembler.add(decoded.data); png.data.fill(0); image.bytes.fill(0);
  }
  assert.equal(complete.status, 'complete'); const canonical = JSON.stringify(complete.payload); assert.equal(crypto.createHash('sha256').update(canonical).digest('hex'), qr.payloadSHA256); assert.equal(complete.payload.sourceVerified, false); assert.equal(complete.payload.membershipProof, false); assert.equal(complete.payload.scope, 'own-guild'); assert.equal(complete.payload.guilds.length, 1); return complete.payload;
}
async function accept(c, qr, extra = {}) { return request(qrAccept, { method: 'POST', c, value: { qrId: qr.qrId, nonce: qr.nonce, payloadSHA256: qr.payloadSHA256, ...extra } }); }
function slowPost(c, route, value) {
  const bytes = Buffer.from(JSON.stringify(value)); let req;
  const response = new Promise((resolve, reject) => { req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', agent: false, headers: { Host: '127.0.0.1:' + port, Origin: origin, Cookie: cookieLine(c), 'X-Census-CSRF': c.csrf, 'Content-Type': 'application/json', 'Content-Length': bytes.length } }, res => { const chunks = []; res.on('data', value => chunks.push(value)); res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, json }); }); }); req.setTimeout(20000, () => req.destroy(Error('Owned QR delayed-body deadline'))); req.on('error', reject); req.write(bytes.subarray(0, 8)); });
  return { response, finish() { req.end(bytes.subarray(8)); }, destroy() { req.destroy(); } };
}
function abortablePost(c, route, value) {
  const bytes = Buffer.from(JSON.stringify(value)); let req;
  const response = new Promise((resolve, reject) => {
    req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', agent: false, headers: { Host: '127.0.0.1:' + port, Origin: origin, Cookie: cookieLine(c), 'X-Census-CSRF': c.csrf, 'Content-Type': 'application/json', 'Content-Length': bytes.length } }, res => { res.resume(); res.on('end', () => reject(Error('Aborted generation unexpectedly returned HTTP' + res.statusCode))); });
    req.setTimeout(20000, () => req.destroy(Error('Owned abortable QR deadline')));
    req.on('error', error => error.code === 'ECONNRESET' ? resolve({ aborted: true }) : reject(error));
    req.end(bytes);
  });
  return { response, abort() { req.destroy(); } };
}
async function entered(before) { const end = Date.now() + 3000; while (Date.now() < end) { if ((await status()).admissionChecks > before.admissionChecks) return; await pause(10); } throw Error('Original Worker admission was not reached'); }
const refused = out => assert.ok(out.status >= 400 && out.status < 500, 'Expected4xx, got' + out.status);

(async () => {
  console.log('COMMAND ' + process.execPath + ' ' + __filename);
  console.log('PROVENANCE fictional fixture PNG pixels only; original decoder/protocol; no camera screen file user input or production transport');
  await start();
  try {
    await check('fresh unauthenticated QR routes cannot mint website or census sessions', async () => { for (const route of [qrStart, qrAccept, qrCancel]) { const out = await request(route, { method: 'POST', value: {} }); assert.equal(out.status, 401); assert.equal(out.headers['set-cookie'], undefined); } });
    const a = client(); await choose(a, 'member'); await state(a);
    await check('QR controls require original Host Origin CSRF and same-origin fetch metadata', async () => { const before = await status(); for (const headers of [{ Host: 'example.invalid' }, { Origin: null }, { Origin: 'https://foreign.invalid' }, { 'X-Census-CSRF': 'wrong' }, { 'Sec-Fetch-Site': 'cross-site' }]) { const out = await request(qrStart, { method: 'POST', c: a, value: { guildKey: 'guild-oak', scenario: 'fresh' }, headers }); assert.equal(out.status, 403); } assert.deepEqual(counts(await status()), counts(before)); });
    await check('strict QR controls reject arbitrary payload data duplicate keys and invalid UTF8', async () => { const before = await status(); for (const raw of [Buffer.from([0xff]), Buffer.from('{"guildKey":"guild-oak","scenario":"fresh","\\u0073cenario":"masked"}'), Buffer.alloc(4097, 32), Buffer.from('{"guildKey":"guild-oak","scenario":"fresh","playerName":"DO-NOT-ECHO"}')]) { const out = await request(qrStart, { method: 'POST', c: a, raw }); refused(out); assert.ok(!out.text.includes('DO-NOT-ECHO')); } assert.deepEqual(counts(await status()), counts(before)); });
    await reset(a);
    let qr, payload, preview, prepared, receipt;
    await check('actual synthetic Lua PNG frames round-trip through original jsQR and strict OLCS1 protocol', async () => { const before = await status(); qr = await makeQr(a); payload = await decode(a, qr); const after = await status(); assert.equal(payload.guilds[0].name, 'Synthetic Oak'); assert.equal(payload.guilds[0].reportedCharacters, 240); assert.equal(payload.guilds[0].online, 60); assert.deepEqual(counts(after), counts(before)); });
    await check('handle nonce and canonical digest are all bound and no arbitrary decoded DTO is accepted', async () => { const before = await status(); for (const patch of [{ nonce: '0'.repeat(32) }, { payloadSHA256: '0'.repeat(64) }, { qrId: 'not-a-handle' }, { payload }, { reportedCharacters: 999 }]) refused(await accept(a, qr, patch)); assert.deepEqual(counts(await status()), counts(before)); });
    await check('accept maps only immutable server payload to private preview without auto-consent intent or report', async () => { const before = await status(), out = await accept(a, qr); assert.equal(out.status, 200, out.text); preview = out.json; assert.equal(preview.syntheticOnly, true); assert.ok(preview.previewId); assert.equal(preview.expiresAt - logicalNow, 300); assert.equal(preview.observation.reportedCharacters, payload.guilds[0].reportedCharacters); assert.equal(preview.observation.reportedOnline, payload.guilds[0].online); assert.equal(preview.observation.observedAt, payload.observedAt); assert.equal(preview.observation.sourceReceivedAt, payload.guilds[0].receivedAt); const after = await status(); assert.equal(after.census.intents, before.census.intents); assert.equal(after.census.receipts, before.census.receipts); assert.equal(after.census.syntheticSubmissions, before.census.syntheticSubmissions); });
    await check('explicit normal consent remains required before any QR-derived report', async () => { const before = await status(); const bad = await request(intentPath, { method: 'POST', c: a, value: { guildKey: 'guild-oak', previewId: preview.previewId, consentVersion: 'unapproved' } }); assert.equal(bad.status, 403); assert.deepEqual(counts(await status()), counts(before)); const out = await request(intentPath, { method: 'POST', c: a, value: { guildKey: 'guild-oak', previewId: preview.previewId, consentVersion } }); assert.equal(out.status, 201); prepared = out.json; assert.equal((await status()).census.receipts, 0); });
    await check('QR-derived lost response keeps original-intent recovery and one immutable receipt', async () => { const before = await status(); const sent = await request(reportPath, { method: 'POST', c: a, value: { intent: prepared.intent, previewId: preview.previewId, simulateLostResponse: true } }); assert.equal(sent.status, 202); assert.equal(sent.json.state, 'unknown'); const result = await request(intentPath + '/' + prepared.intent + '/outcome', { c: a }); assert.equal(result.status, 200); receipt = result.json.receipt; assert.equal(receipt.state, 'accepted'); assert.equal(receipt.sourceVerified, false); assert.equal(receipt.gameIdentityProven, false); assert.equal(receipt.reporterAccountAssociated, true); const after = await status(); assert.equal(after.census.receipts, before.census.receipts + 1); const retry = await request(reportPath, { method: 'POST', c: a, value: { intent: prepared.intent, previewId: preview.previewId, simulateLostResponse: false } }); assert.equal(retry.status, 200); assert.equal(retry.json.receiptId, receipt.receiptId); assert.deepEqual(counts(await status()), counts(after)); });
    await check('shared reader projection preserves original QR source time and private withdrawal', async () => { const out = await request('/api/community/shared-census/summary', { c: a }); assert.equal(out.status, 200); const row = out.json.rows.find(row => row.guildKey === 'guild-oak'); assert.equal(row.reportedCharacters, 240); assert.equal(row.observedAt, payload.observedAt); assert.equal(row.sourceReceivedAt, payload.guilds[0].receivedAt); assert.equal(out.json.coverageComplete, false); const withdrawn = await request('/api/community/shared-census/receipts/' + receipt.receiptId, { method: 'DELETE', c: a, value: {} }); assert.equal(withdrawn.status, 200); assert.equal(withdrawn.json.state, 'withdrawn'); });
    await reset(a);
    await check('masked QR counts stay suppressed through actual PNG decoding and accept mapping', async () => { const masked = await makeQr(a, 'masked'), decoded = await decode(a, masked), out = await accept(a, masked); assert.equal(decoded.guilds[0].reportedCharacters, 'few'); assert.equal(decoded.guilds[0].online, null); assert.equal(out.status, 200); assert.equal(out.json.observation.reportedCharacters, 'few'); assert.equal(out.json.observation.reportedOnline, null); });
    await check('cancel clears only the original owned handle and stops future image or accept reads', async () => { const cancelled = await makeQr(a), before = await status(), out = await request(qrCancel, { method: 'POST', c: a, value: { qrId: cancelled.qrId } }); assert.equal(out.status, 200); assert.equal(out.json.state, 'cancelled'); refused(await request(cancelled.images[0], { c: a })); refused(await accept(a, cancelled)); assert.deepEqual(counts(await status()), counts(before)); });
    await check('another eligible website and census session cannot read accept or cancel owned QR handle', async () => { const original = await makeQr(a), b = client(); await choose(b, 'admin'); await state(b); for (const operation of [() => request(original.images[0], { c: b }), () => accept(b, original), () => request(qrCancel, { method: 'POST', c: b, value: { qrId: original.qrId } })]) assert.equal((await operation()).status, 403); assert.equal((await request(original.images[0], { c: a })).status, 200); await request(qrCancel, { method: 'POST', c: a, value: { qrId: original.qrId } }); });
    await check('image bounds traversal and query variations cannot expose other files', async () => { const original = await makeQr(a); for (const suffix of ['0', String(original.frameCount + 1), '../1', '1?x=1', '1%2f..%2f1']) refused(await request('/__lab/qr/' + original.qrId + '/images/' + suffix, { c: a })); await request(qrCancel, { method: 'POST', c: a, value: { qrId: original.qrId } }); });
    await check('census reader has no QR producer capability despite admitted website membership', async () => { const s = await request('/__lab/session', { method: 'POST', c: a, value: { account: 'reader' } }); assert.equal(s.status, 200); assert.equal((await request(qrStart, { method: 'POST', c: a, value: { guildKey: 'guild-oak', scenario: 'fresh' } })).status, 403); await reset(a); });
    for (const mode of ['unconfirmed', 'denied', 'guest']) await check('website ' + mode + ' cannot enter QR producer image or accept routes', async () => { const c = client(); await choose(c, mode); for (const operation of [() => request(qrStart, { method: 'POST', c, value: { guildKey: 'guild-oak', scenario: 'fresh' } }), () => request('/__lab/qr/not-owned/images/1', { c }), () => request(qrAccept, { method: 'POST', c, value: { qrId: 'not-owned', nonce: '0'.repeat(32), payloadSHA256: '0'.repeat(64) } })]) assert.equal((await operation()).status, 403); });
    for (const rotation of ['website', 'census']) await check('slow QR start body rechecks original ' + rotation + ' session before generation', async () => { await reset(a); const before = await status(), pending = slowPost(a, qrStart, { guildKey: 'guild-oak', scenario: 'fresh' }); try { await entered(before); if (rotation === 'website') await choose(a, 'unconfirmed'); else await request('/__lab/session', { method: 'POST', c: a, value: { account: 'reader' } }); pending.finish(); refused(await pending.response); assert.deepEqual(counts(await status()), counts(before)); } finally { pending.destroy(); } if (rotation === 'website') await choose(a, 'member'); await state(a); });
    for (const rotation of ['website', 'census']) await check('completed generator rechecks original ' + rotation + ' session before returning PNG handle', async () => { await reset(a); await command('hold-next'); const held = waitMessage('generation-held'), pending = request(qrStart, { method: 'POST', c: a, value: { guildKey: 'guild-oak', scenario: 'fresh' } }); await held; const before = await status(); if (rotation === 'website') await choose(a, 'unconfirmed'); else await request('/__lab/session', { method: 'POST', c: a, value: { account: 'reader' } }); await command('release'); refused(await pending); assert.deepEqual(counts(await status()), counts(before)); if (rotation === 'website') await choose(a, 'member'); await state(a); });
    await check('aborted start before handle delivery clears completed PNGs and pending scan without accepting anything', async () => {
      await reset(a); const before = await status(); assert.equal(before.census.qrActiveScans, 0); assert.equal(before.census.qrRendering, 0);
      await command('hold-next'); const held = waitMessage('generation-held'), pending = abortablePost(a, qrStart, { guildKey: 'guild-oak', scenario: 'fresh' }); await held;
      pending.abort(); assert.equal((await pending.response).aborted, true); await status(); await command('release');
      let after; const until = Date.now() + 3000;
      while (Date.now() < until) { after = await status(); if (after.census.qrRendering === 0 && after.census.qrActiveScans === 0) break; await pause(10); }
      assert.equal(after.census.qrRendering, 0); assert.equal(after.census.qrActiveScans, 0); assert.equal(after.census.qrScansCreated, before.census.qrScansCreated); assert.equal(after.census.qrPreviewsAccepted, before.census.qrPreviewsAccepted); assert.deepEqual(counts(after), counts(before));
    });
    await check('original30second scan deadline includes generator await and never starts after rendering', async () => { await reset(a); await command('hold-next'); const held = waitMessage('generation-held'), pending = request(qrStart, { method: 'POST', c: a, value: { guildKey: 'guild-oak', scenario: 'fresh' } }); await held; const advanced = await command('advance', { seconds: 31 }); logicalNow = advanced.now; await command('release'); const out = await pending; refused(out); assert.ok(!out.json?.qrId); assert.equal((await status()).census.receipts, 0); });
    await check('already-issued QR handle expires at original scan deadline even if image was read', async () => { await reset(a); const original = await makeQr(a); assert.equal((await request(original.images[0], { c: a })).status, 200); const advanced = await command('advance', { seconds: 31 }); logicalNow = advanced.now; refused(await request(original.images[0], { c: a })); refused(await accept(a, original)); assert.equal((await status()).census.intents, 0); });
    await check('final settings Native guards and outbound transport remain unchanged', async () => { const value = await status(); assert.equal(value.productionConnection, false); assert.equal(value.productionActivation, false); assert.equal(value.actualWebsiteWrites, false); assert.equal(value.arbitraryInput, false); assert.equal(value.outboundProviderRequests, 0); assert.equal(value.fixtureGuards.settingsEqual, true); assert.equal(value.fixtureGuards.nativeAdmissionEqual, true); });
  } finally {
    if (child?.connected) { const stopped = waitMessage('closed', 10000); send({ type: 'close' }); const result = await stopped; console.log('OWNED_QR_FIXTURE_STOPPED ' + JSON.stringify({ outboundProviderRequests: result.status.outboundProviderRequests, fixtureGuards: result.status.fixtureGuards })); }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (synthetic local QR HTTP integration)'); if (failed) process.exitCode = 1;
})().catch(error => { if (child && !child.killed) child.kill(); console.error(error.stack); process.exitCode = 1; });
