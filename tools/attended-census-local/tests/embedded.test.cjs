'use strict';
// Fictional native payloads and parent sessions only; no real account, game, provider or disk store.
const assert = require('node:assert/strict'), http = require('node:http'), crypto = require('node:crypto');
const { createAttendedServer, HEADERS } = require('../serve.cjs');
const protocol = require('../../guild-qr-pilot/protocol.js');
const { LOCAL_REAL_CONSENT_VERSION } = require('../../shared-census-lab/core.cjs');
let app, parentServer, port, origin, originOverride, passed = 0;
let wall = 1792530000000, monotonic = 1000, nextGate = null, observedAdmission = null;
const parents = new Map([['A', { key: 'A', read: true, guard: true }], ['B', { key: 'B', read: true, guard: true }]]);
const requestParents = new WeakMap(), admissionCounts = new WeakMap(), censusOwners = new Map();
const fail = code => Object.assign(Error(code), { code, status: 403 });
const cookieValue = req => /(?:^|;\s*)census_local=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
function guard(req) {
  const original = requestParents.get(req);
  if (!original || parents.get(original.key) !== original || !original.guard) throw fail('parent_context_changed');
  const owned = cookieValue(req);
  if (owned && censusOwners.get(owned) !== original) throw fail('parent_cookie_owner_required');
}
async function admit(req) {
  const count = (admissionCounts.get(req) || 0) + 1;
  admissionCounts.set(req, count);
  const allowed = requestParents.get(req)?.read === true;
  if (observedAdmission?.route === req.url) { observedAdmission.ready.resolve(); observedAdmission = null; }
  if (nextGate?.route === req.url && nextGate.count === count) {
    const gate = nextGate; nextGate = null; gate.ready.resolve(); await gate.release.promise;
  }
  if (!allowed) throw fail('parent_reader_required');
}
const hooks = () => ({ origin: () => originOverride || origin, admit, guard });
function client(parent = 'A') { return { parent, cookie: '', csrf: '' }; }
function request(route, { c, method = 'GET', value, headers = {} } = {}) {
  const bytes = value === undefined ? null : Buffer.from(JSON.stringify(value));
  const supplied = { Host: `127.0.0.1:${port}`, 'X-Synthetic-Parent': c?.parent || 'A', ...headers };
  if (c?.cookie) supplied.Cookie = c.cookie;
  if (bytes) Object.assign(supplied, { Origin: origin, 'X-Census-CSRF': c?.csrf || '', 'Content-Type': 'application/json', 'Content-Length': bytes.length });
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, method, headers: supplied, agent: false }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => {
        const text = Buffer.concat(chunks).toString(); let json; try { json = JSON.parse(text); } catch {}
        if (c && res.headers['set-cookie']?.length) c.cookie = res.headers['set-cookie'][0].split(';')[0];
        if (c && json?.csrf) c.csrf = json.csrf;
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    }); req.setTimeout(10000, () => req.destroy(Error('Owned embedded HTTP deadline'))); req.on('error', reject); req.end(bytes);
  });
}
const post = (c, route, value) => request(route, { c, method: 'POST', value });
async function enter(c) { const result = await request('/local/session', { c }); assert.equal(result.status, 200, result.text); return result; }
function payload() { return { format: 'olympus-stat-observation-v1', scope: 'own-guild', source: 'volunteer-client', sourceVerified: false, membershipProof: false, addonVersion: '0.1.0', realmGroup: 'Synthetic Embedded Realm', faction: 'Alliance', observedAt: wall / 1000, guilds: [{ name: 'Synthetic Embedded Guild', receivedAt: wall / 1000, reportedCharacters: 240, online: 60 }] }; }
async function scan(c) {
  const started = await post(c, '/local/start', {}); assert.equal(started.status, 201, started.text);
  const frames = await protocol.encodeFrames(payload(), started.json.nonce, { nowSeconds: wall / 1000 });
  return { ...started.json, frames };
}
async function preview(c) { const qr = await scan(c), out = await post(c, '/local/preview', { scanId: qr.scanId, frames: qr.frames }); assert.equal(out.status, 201, out.text); return out.json; }
async function intent(c, previewId) { const out = await post(c, '/local/intent', { previewId, consentVersion: LOCAL_REAL_CONSENT_VERSION }); assert.equal(out.status, 201, out.text); return out.json; }
function delayed(c, route, value) {
  const bytes = Buffer.from(JSON.stringify(value)); let req;
  const ready = Promise.withResolvers(); observedAdmission = { route, ready };
  const response = new Promise((resolve, reject) => {
    req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', agent: false, headers: { Host: `127.0.0.1:${port}`, Origin: origin, 'X-Synthetic-Parent': c.parent, Cookie: c.cookie, 'X-Census-CSRF': c.csrf, 'Content-Type': 'application/json', 'Content-Length': bytes.length } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, text }); });
    }); req.setTimeout(10000, () => req.destroy(Error('Owned delayed body deadline'))); req.on('error', reject); req.write(bytes.subarray(0, 1));
  });
  return { response, ready: ready.promise.then(() => new Promise(resolve => setImmediate(resolve))), finish() { req.end(bytes.subarray(1)); } };
}
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
async function holdDigest(c, change) {
  const qr = await scan(c), original = crypto.subtle.digest, ready = Promise.withResolvers(), release = Promise.withResolvers(); let held = false;
  crypto.subtle.digest = async function (...args) { if (!held) { held = true; ready.resolve(); await release.promise; } return original.apply(this, args); };
  try { const response = post(c, '/local/preview', { scanId: qr.scanId, frames: qr.frames }); await ready.promise; change(); release.resolve(); return await response; }
  finally { release.resolve(); crypto.subtle.digest = original; }
}
async function main() {
  await check('Parent hooks are all-or-none functions and embedded mode is explicit', async () => {
    for (const options of [{ origin: () => origin }, { admit }, { guard }, { origin: () => origin, admit }, { ...hooks(), guard: null }, { ...hooks(), origin: 'http://127.0.0.1:1234' }, { ...hooks(), guard: async () => {} }, { embeddedLocal: true }, { embeddedLocal: 'true' }]) assert.throws(() => createAttendedServer(options), TypeError);
  });
  await check('Never-listened callable server closes finitely and repeatedly without a listener', async () => {
    const unused = createAttendedServer(); let timer;
    try { await Promise.race([unused.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Close hung without listener')), 1000); })]); await unused.close(); assert.equal(unused.server.listening, false); }
    finally { clearTimeout(timer); }
  });
  app = createAttendedServer({ ...hooks(), embeddedLocal: true, now: () => wall, monotonicNow: () => monotonic });
  parentServer = http.createServer((req, res) => {
    const parent = parents.get(req.headers['x-synthetic-parent'] || 'A'); requestParents.set(req, parent);
    const writeHead = res.writeHead;
    res.writeHead = function (code, headers) {
      const value = headers?.['Set-Cookie'];
      if (value) { const match = /^census_local=([a-f0-9]{48});/.exec(value); if (match) censusOwners.set(match[1], parent); }
      return writeHead.call(this, code, headers);
    };
    app.handler(req, res);
  });
  await new Promise(resolve => parentServer.listen(0, '127.0.0.1', resolve)); port = parentServer.address().port; origin = `http://127.0.0.1:${port}`;
  const a = client(), b = client('B'); let p, issued;
  await check('Only the parent listens; embedded framing changes exactly the two specified headers', async () => {
    assert.equal(app.server.listening, false); assert.equal(app.origin(), origin);
    const out = await request('/'); assert.equal(out.status, 200, out.text);
    for (const [name, value] of Object.entries(HEADERS)) {
      const expected = name === 'Content-Security-Policy' ? value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : name === 'X-Frame-Options' ? 'SAMEORIGIN' : value;
      assert.equal(out.headers[name.toLowerCase()], expected, name);
    }
    assert.equal(out.text.includes('/__army-view/frame-host.js'), false);
    const head = await request('/', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.text, '');
  });
  await check('Supplying parent hooks alone never enables same-origin framing', async () => {
    const original = app; app = createAttendedServer({ ...hooks(), now: () => wall, monotonicNow: () => monotonic });
    try { const out = await request('/'); assert.equal(out.status, 200); assert.equal(out.headers['x-frame-options'], 'DENY'); assert.equal(out.headers['content-security-policy'], HEADERS['Content-Security-Policy']); }
    finally { await app.close(); app = original; }
  });
  await check('A Promise-returning guard is refused before any local session or data response', async () => {
    const original = app; app = createAttendedServer({ ...hooks(), guard: () => Promise.resolve(true), embeddedLocal: true, now: () => wall, monotonicNow: () => monotonic });
    try { const out = await request('/local/session'); assert.equal(out.status, 503); assert.equal(out.json.error.code, 'synchronous_parent_guard_required'); assert.equal(out.headers['set-cookie'], undefined); assert.equal(app.status().activeSessions, 0); }
    finally { await app.close(); app = original; }
  });
  await check('Parent origin must be canonical HTTP IPv4 loopback on every resolution', async () => {
    for (const invalid of ['https://127.0.0.1:1234', 'http://localhost:1234', 'http://example.invalid', origin + '/', origin + '/path', origin + '?x=1', origin + '#x', 'http://user@127.0.0.1:1234', 'http://127.1:1234']) { originOverride = invalid; assert.throws(() => app.origin()); }
    originOverride = null; assert.equal(app.origin(), origin);
  });
  await check('Admission fences static files, status, session issuance and state reads', async () => {
    parents.get('A').read = false;
    try { for (const route of ['/', '/bridge.js', '/local/status', '/local/session', '/local/state']) assert.equal((await request(route, { c: a })).status, 403, route); assert.equal(app.status().activeSessions, 0); }
    finally { parents.get('A').read = true; }
    await enter(a); await enter(b); assert.equal((await request('/local/state', { c: a })).status, 200);
  });
  await check('Original census cookie cannot be adopted by a different admitted parent identity', async () => {
    const copied = { ...a, parent: 'B' }; assert.equal((await request('/local/state', { c: copied })).status, 403); assert.equal((await post(copied, '/local/start', {})).status, 403); assert.equal(app.status().activeScans, 0);
  });
  await check('Fresh admission after a delayed start body prevents scan creation', async () => {
    const waiting = delayed(a, '/local/start', {}); await waiting.ready; parents.get('A').read = false; waiting.finish();
    try { assert.equal((await waiting.response).status, 403); assert.equal(app.status().activeScans, 0); }
    finally { parents.get('A').read = true; }
  });
  await check('Fresh admission after awaited assembly prevents guild registration and preview', async () => {
    try { const out = await holdDigest(a, () => { parents.get('A').read = false; }); assert.equal(out.status, 403, out.text); assert.equal(app.status().guildRegistrations, 0); assert.equal(app.status().activePreviews, 0); assert.equal(app.status().activeScans, 0); }
    finally { parents.get('A').read = true; }
  });
  await check('Synchronous original parent guard is checked again after awaited assembly', async () => {
    try { const out = await holdDigest(a, () => { parents.get('A').guard = false; }); assert.equal(out.status, 403, out.text); assert.equal(app.status().guildRegistrations, 0); assert.equal(app.status().activePreviews, 0); }
    finally { parents.get('A').guard = true; }
  });
  await check('Decoded preview remains original one-guild data with separate consent', async () => {
    p = await preview(a); assert.equal(p.reporterIdentitySynthetic, true); assert.equal(p.payload.sourceVerified, false); assert.equal(p.payload.membershipProof, false); assert.equal(p.expiresAt, wall / 1000 + 300); assert.equal(app.status().census.intents, 0); assert.equal(app.status().census.receipts, 0);
  });
  await check('Fresh admission after a delayed intent body prevents consent intent and report buffer', async () => {
    const waiting = delayed(a, '/local/intent', { previewId: p.previewId, consentVersion: LOCAL_REAL_CONSENT_VERSION }); await waiting.ready; parents.get('A').read = false; waiting.finish();
    try { assert.equal((await waiting.response).status, 403); assert.equal(app.status().census.intents, 0); assert.equal(app.status().pendingReportBuffers, 0); }
    finally { parents.get('A').read = true; }
    issued = await intent(a, p.previewId);
  });
  await check('Fresh admission after a delayed submit body prevents the actual core commit', async () => {
    const waiting = delayed(a, '/local/submit', { previewId: p.previewId, intent: issued.intent }); await waiting.ready; parents.get('A').read = false; waiting.finish();
    try { assert.equal((await waiting.response).status, 403); assert.equal(app.status().census.receipts, 0); assert.equal(app.status().submissions, 0); }
    finally { parents.get('A').read = true; }
    const submitted = await post(a, '/local/submit', { previewId: p.previewId, intent: issued.intent }); assert.equal(submitted.status, 200, submitted.text);
    assert.equal((await request('/local/state', { c: a })).json.receipts.length, 1); assert.equal(app.status().pendingReportBuffers, 0);
  });
  await check('Parent admission time remains inside the original 30-second start budget', async () => {
    const gate = { route: '/local/start', count: 1, ready: Promise.withResolvers(), release: Promise.withResolvers() }; nextGate = gate;
    const response = post(b, '/local/start', {}); await gate.ready.promise; wall += 30000; monotonic += 30000; gate.release.resolve();
    const out = await response; assert.equal(out.status, 409, out.text); assert.equal(out.json.error.code, 'scan_expired'); assert.equal(app.status().activeScans, 0);
  });
  await check('Original parent identity rotation during awaited admission returns no private data', async () => {
    const gate = { route: '/local/state', count: 1, ready: Promise.withResolvers(), release: Promise.withResolvers() }; nextGate = gate;
    const response = request('/local/state', { c: b }); await gate.ready.promise; parents.set('B', { key: 'B', read: true, guard: true }); gate.release.resolve();
    const out = await response; assert.equal(out.status, 403); assert.equal(out.text.includes('Synthetic Embedded Guild'), false); assert.equal(out.text.includes('receiptId'), false);
  });
  await check('Callable child close discards memory and refuses later requests without closing parent listener', async () => {
    await app.close(); await app.close(); assert.equal(app.server.listening, false); assert.equal(parentServer.listening, true); const out = await request('/local/state', { c: a }); assert.equal(out.status, 503); assert.equal(app.status().receiptHandles, 0); assert.equal(app.status().guildRegistrations, 0);
  });
  await new Promise(resolve => parentServer.close(resolve));
  console.log('OWNED_EMBEDDED_PARENT_STOPPED ' + JSON.stringify({ providerRequests: 0, syntheticFixturesOnly: true, realObservationsSaved: false }));
  console.log(`${passed} passed, 0 failed`);
}
main().catch(async error => { console.error(error.stack); process.exitCode = 1; try { await app?.close(); } catch {} if (parentServer?.listening) await new Promise(resolve => parentServer.close(resolve)); });
