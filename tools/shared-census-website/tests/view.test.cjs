'use strict';
// Real reusable module over an independent synthetic DOM/API. No browser or live admission claim.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '..', 'census-view.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'census-view.css'), 'utf8');
class Target {
  constructor() { this.handlers = new Map(); this.events = {}; }
  addEventListener(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); this.events[type] = event => Promise.all([...this.handlers.get(type) || []].map(handler => handler(event || {}))); }
  removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn); if (!this.handlers.get(type)?.size) { this.handlers.delete(type); delete this.events[type]; } }
}
class Element extends Target {
  constructor(tag = 'div', document) { super(); this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.attributes = {}; this.dataset = {}; this.text = ''; this.checked = false; this.disabled = false; this.hidden = false; this._value = undefined; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  set value(value) { this._value = String(value); }
  get value() { return this._value === undefined ? this.tagName === 'SELECT' ? this.children[0]?.value || '' : '' : this._value; }
  append(...children) { for (const child of children) if (typeof child !== 'string') child.parentNode = this; this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = []; this.append(...children); }
  insertBefore(child, before) { const index = this.children.indexOf(before); if (index < 0) throw Error('Missing insertion anchor'); child.parentNode = this; this.children.splice(index, 0, child); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  matches(selector) { const attr = selector.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/); return attr ? Object.hasOwn(this.attributes, attr[1]) && (attr[2] === undefined || this.attributes[attr[1]] === attr[2]) : selector.startsWith('.') ? (this.className || '').split(' ').includes(selector.slice(1)) : this.tagName === selector.toUpperCase(); }
  querySelectorAll(selector) { return this.children.flatMap(child => typeof child === 'string' ? [] : [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
function harness(options = {}) {
  const document = new Target(), window = new Target();
  document.hidden = options.hidden === true; document.defaultView = window; window.location = { hostname: options.hostname || '127.0.0.1' };
  const imageResources = { workers: [], bitmaps: [], pixels: [], assemblerCalls: [], headerReads: 0, lateWorkers: [] };
  document.createElement = tag => {
    const node = new Element(tag, document);
    if (tag === 'canvas') { node.width = 0; node.height = 0; let image;
      node.getContext = () => ({ clearRect() {}, drawImage(value) { image = value; }, getImageData() { const pixels = new Uint8ClampedArray(node.width * node.height * 4); pixels[0] = image.frame; imageResources.pixels.push(pixels); return { width: node.width, height: node.height, data: pixels }; } });
    }
    return node;
  };
  document.createTextNode = text => { const node = new Element('#text', document); node.textContent = text; return node; };
  document.getElementById = () => { throw Error('A reusable view must never query global IDs'); };
  let mono = 0, wall = 1792512000000, gets = 0, waitPreview = null, waitQrStart = null, waitBitmap = null, fence = true; const timers = new Map(), refusals = [];
  class LocalDate extends Date { static now() { return wall; } }
  const lab = { now: 1792512000, account: 'reporter-a', receipt: null, conflict: false }, calls = [];
  const guild = { guildKey: 'guild-a', label: 'Synthetic Guild A', realmGroup: 'Test realm', product: 'Test product', faction: 'Alliance' };
  const qrPayload = { format: 'olympus-stat-observation-v1', scope: 'own-guild', source: 'volunteer-client', sourceVerified: false, membershipProof: false, addonVersion: '0.1.0', realmGroup: guild.realmGroup, faction: guild.faction, observedAt: lab.now, guilds: [{ name: guild.label, receivedAt: lab.now, reportedCharacters: 100, online: 20 }] };
  const qrHash = crypto.createHash('sha256').update(JSON.stringify(qrPayload)).digest('hex'), nonce = 'a'.repeat(32);
  window.Blob = Blob; window.crypto = crypto.webcrypto;
  window.createImageBitmap = async (blob, resize) => {
    if (waitBitmap) await waitBitmap;
    const bytes = new Uint8Array(await blob.arrayBuffer()), bitmap = { frame: bytes.at(-1), width: resize.resizeWidth, height: resize.resizeHeight, closes: 0, close() { this.closes++; } }; imageResources.bitmaps.push(bitmap); return bitmap;
  };
  window.Worker = class {
    constructor(url) { assert.equal(url, '/__census-local/qr-decoder.js'); this.posts = []; this.terminated = false; imageResources.workers.push(this); }
    postMessage(message, transfer) {
      assert.equal(message.type, 'decode'); assert.equal(message.width, 342); assert.equal(message.height, 342); assert.equal(transfer[0], message.buffer); this.posts.push(message);
      const part = new Uint8Array(message.buffer)[0], handler = this.onmessage;
      const deliver = () => handler?.({ data: { type: 'decoded', id: message.id, generation: message.generation, text: options.badFrame ? 'FOREIGN' : 'OLCS1|' + nonce + '|' + part } });
      if (options.deferWorker) imageResources.lateWorkers.push(deliver); else Promise.resolve().then(deliver);
    }
    terminate() { this.terminated = true; }
  };
  // Codec/image behavior is fake here to isolate UI ownership and timing. The
  // separate transport/browser checks must prove actual PNG/jsQR/protocol bytes.
  window.OlympusGuildQRProtocol = { LIMITS: { captureMs: 30000, reviewMs: 900000, parts: 14, imageFileBytes: 4194304, imageHeaderBytes: 262144, decodedSide: 1280 }, inspectImageHeader(bytes, mime, limits) { imageResources.headerReads++; assert.equal(mime, 'image/png'); assert.equal(bytes.length, limits.fileBytes); return { width: 342, height: 342 }; }, createAssembler(configuration) {
    assert.equal(configuration.nonce, nonce); assert.ok(Number.isSafeInteger(configuration.clock())); let active = true, parts = new Set();
    return { clear() { active = false; parts.clear(); }, async add(frame) { assert.ok(active); if (!frame.startsWith('OLCS1|' + nonce + '|')) throw Error('Wrong scan'); imageResources.assemblerCalls.push(frame); parts.add(frame); return parts.size === 2 ? { status: 'complete', received: 2, total: 2, payload: qrPayload } : { status: 'pending', received: parts.size, total: 2 }; } };
  } };
  const snapshot = () => ({ syntheticOnly: true, now: lab.now, identity: { id: lab.account, label: 'Synthetic ' + lab.account, reporter: lab.account !== 'reader' }, csrfToken: 'local-token', contract: { format: 'olympus-shared-census-observation-v1', consentVersion: 'v1', guilds: [guild], canReport: lab.account !== 'reader', allowedGuildKeys: lab.account === 'reader' ? [] : ['guild-a'], limits: {} }, summary: { audience: 'private', evaluatedAt: lab.now, coverageComplete: false, rows: [{ ...guild, state: lab.conflict ? 'conflicted' : lab.receipt?.state === 'accepted' ? 'reported' : 'unavailable', reportedCharacters: lab.conflict ? null : 100, reportedOnline: lab.conflict ? null : 20, observedAt: lab.conflict ? null : lab.now, sourceReceivedAt: lab.conflict ? null : lab.now, expiresAt: lab.now + 86400 }] }, receipts: lab.receipt ? [{ ...lab.receipt }] : [] });
  const errorResponse = (status, code) => ({ ok: false, status, json: async () => ({ error: { code, message: 'The synthetic request was refused: ' + code + '.' } }) });
  async function fetch(route, request) {
    assert.ok(route.startsWith('/') && !route.startsWith('//')); assert.equal(request.credentials, 'same-origin'); assert.equal(request.redirect, 'error');
    if (request.method !== 'GET') { assert.equal(request.headers['X-Census-CSRF'], 'local-token'); assert.equal(request.headers['Content-Type'], 'application/json'); }
    calls.push({ route, method: request.method, body: request.body && JSON.parse(request.body) });
    const body = calls.at(-1).body; let value;
    if (route === '/__lab/state') { gets++; if (options.failInitial && gets === 1) throw Error('Synthetic network interruption'); value = snapshot(); }
    else if (route === '/__lab/session') { lab.account = body.account; value = snapshot(); }
    else if (route === '/__lab/qr/start') { if (waitQrStart) await waitQrStart; value = { syntheticOnly: true, qrId: 'qr-owned', nonce, expiresAt: lab.now + 30, frameCount: 2, images: ['/__lab/qr/qr-owned/images/1', options.foreignImage ? 'https://example.invalid/image.png' : '/__lab/qr/qr-owned/images/2'], payloadSHA256: options.wrongQrHash ? '0'.repeat(64) : qrHash }; }
    else if (route.startsWith('/__lab/qr/qr-owned/images/')) { const frame = Number(route.at(-1)), bytes = new Uint8Array(32); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); bytes[31] = frame; return { ok: true, status: 200, headers: { get: key => key === 'Content-Type' ? 'image/png' : key === 'Content-Length' ? String(bytes.length) : null }, arrayBuffer: async () => bytes.buffer }; }
    else if (route === '/__lab/qr/cancel') { assert.deepEqual(Object.keys(body), ['qrId']); assert.equal(body.qrId, 'qr-owned'); value = { syntheticOnly: true, state: 'cancelled' }; }
    else if (route === '/__lab/qr/accept') { assert.deepEqual(Object.keys(body).sort(), ['nonce', 'payloadSHA256', 'qrId']); assert.equal(body.payloadSHA256, qrHash); assert.equal(body.nonce, nonce); value = { syntheticOnly: true, previewId: 'preview-from-qr', expiresAt: lab.now + 300, observation: { guildKey: 'guild-a', reportedCharacters: 100, reportedOnline: 20, observedAt: lab.now, sourceReceivedAt: lab.now, capturedAt: lab.now, addonVersion: '0.1.0' } }; }
    else if (route === '/__lab/preview') { if (waitPreview) await waitPreview; value = { previewId: 'preview-a', expiresAt: lab.now + 300, observation: { guildKey: body.guildKey, reportedCharacters: 100, reportedOnline: 20, observedAt: lab.now, sourceReceivedAt: lab.now, capturedAt: lab.now, addonVersion: '0.1.0' } }; }
    else if (route === '/api/community/shared-census/intents') value = { intent: 'intent-a', expiresAt: lab.now + 300 };
    else if (route === '/api/community/shared-census/reports') {
      if (options.reportFailure === 'known-400') return errorResponse(400, 'report_time');
      if (options.reportFailure === 'context-401') return errorResponse(401, 'website_session_required');
      if (options.reportFailure === 'context-403') return errorResponse(403, 'website_reader_required');
      lab.receipt = { receiptId: 'receipt-a', guildKey: 'guild-a', state: 'accepted', receivedAt: lab.now, expiresAt: lab.now + 86400, sourceVerified: false, membershipProof: false, gameIdentityProven: false };
      if (options.reportFailure === '500-after-commit') return { ok: false, status: 500, json: async () => ({ error: { code: 'internal_refusal', message: 'The synthetic lab refused an internal operation.' } }) };
      if (options.reportFailure === 'non-json-403-after-commit') return { ok: false, status: 403, json: async () => { throw Error('Opaque gateway HTML'); } };
      if (options.reportFailure === 'unrecognized-403-after-commit') return { ok: false, status: 403, json: async () => ({ error: { code: 'gateway_denied', message: 'Not a service contract' } }) };
      if (options.reportFailure === 'network-after-commit') throw Error('Synthetic connection lost after commit');
      if (options.reportFailure === '503-after-commit') return errorResponse(503, 'clock_invalid');
      value = body.simulateLostResponse ? { state: 'unknown', intent: 'intent-a' } : { ...lab.receipt };
    } else if (route.endsWith('/outcome')) value = { state: 'accepted', receipt: lab.receipt };
    else if (request.method === 'DELETE') { lab.receipt.state = 'withdrawn'; value = { ...lab.receipt }; }
    else throw Error('Unexpected local route: ' + route);
    return { ok: true, status: 200, json: async () => value };
  }
  const module = { exports: {} };
  vm.runInNewContext(source, { module, window, performance: { now: () => mono }, setInterval: fn => { const id = {}; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id), AbortController, fetch, Date: LocalDate, Map, WeakMap, Object, Array, Number, String, JSON, Math, Promise, Uint8Array, Uint8ClampedArray, TextEncoder, encodeURIComponent });
  const host = new Element('div', document), api = module.exports;
  const controller = api.mount(host, { syntheticOnly: options.syntheticOnly !== false, live: () => fence, onRefused: status => refusals.push(status) });
  const getNodes = target => new Map(target.querySelectorAll('[data-census-control]').map(node => [node.attributes['data-census-control'], node]));
  const nodes = getNodes(host), click = async id => { await nodes.get(id).events.click(); await flush(); };
  const visible = value => { document.hidden = !value; document.events.visibilitychange?.(); };
  const consent = value => { nodes.get('consent').checked = value; nodes.get('consent').events.change(); };
  return { nodes, lab, calls, click, visible, consent, controller, host, api, refusals, document, window, timers, getNodes, imageResources, qrHash, setFence(value) { fence = value; }, elapsed(seconds) { mono = seconds * 1000; wall = 1792512000000 + mono; for (const fn of timers.values()) fn(); }, rollBackWall() { wall -= 1000; for (const fn of timers.values()) fn(); }, releaseWorkers() { for (const fn of imageResources.lateWorkers.splice(0)) fn(); }, deferBitmap() { let release; waitBitmap = new Promise(resolve => { release = resolve; }); return release; }, deferQrStart() { let release; waitQrStart = new Promise(resolve => { release = resolve; }); return release; }, async qrMode() { nodes.get('input-mode').value = 'qr'; await nodes.get('input-mode').events.change(); await flush(); }, deferPreview() { let release; waitPreview = new Promise(resolve => { release = resolve; }); return release; } };
}

let passed = 0, failed = 0;
async function check(name, fn) { try { await fn(); console.log('PASS ' + name); passed++; } catch (error) { console.error('FAIL ' + name + ': ' + error.message); failed++; } }
(async () => {
  await check('first hidden load exposes read-only Refresh when made visible, without a CSRF token', async () => {
    const app = harness({ hidden: true }); await flush(); assert.equal(app.calls.length, 0); assert.equal(app.nodes.get('refresh-button').disabled, true);
    app.visible(true); assert.equal(app.nodes.get('refresh-button').disabled, false); assert.equal(app.nodes.get('preview-button').disabled, true);
    await app.click('refresh-button'); assert.match(app.nodes.get('status').textContent, /View refreshed/); assert.equal(app.nodes.get('preview-button').disabled, false);
  });
  await check('failed initial GET can be recovered by deliberate Refresh without enabling other controls', async () => {
    const app = harness({ failInitial: true }); await flush(); assert.equal(app.nodes.get('refresh-button').disabled, false); assert.equal(app.nodes.get('preview-button').disabled, true);
    await app.click('refresh-button'); assert.equal(app.nodes.get('preview-button').disabled, false); assert.equal(app.calls.filter(call => call.method === 'GET').length, 2);
  });
  await check('each fixture requires new explicit consent and intent before the closed synthetic submission', async () => {
    const app = harness(); await flush(); await app.click('preview-button'); assert.equal(app.nodes.get('consent').checked, false); assert.equal(app.nodes.get('intent-button').disabled, true);
    app.consent(true); await app.click('intent-button'); assert.equal(app.nodes.get('submit-button').disabled, false); await app.click('submit-button');
    const report = app.calls.find(call => call.route.endsWith('/reports')); assert.deepEqual(Object.keys(report.body).sort(), ['intent', 'previewId', 'simulateLostResponse']);
    assert.match(app.nodes.get('receipts-list').textContent, /receipt-a/); assert.doesNotMatch(app.nodes.get('receipts-list').textContent, /Observed/);
    await app.click('preview-button'); assert.equal(app.nodes.get('consent').checked, false); assert.equal(app.nodes.get('intent-button').disabled, true);
  });
  await check('redacted conflict retains its generic state while withholding all counts', async () => {
    const app = harness(); await flush(); app.lab.conflict = true; await app.click('refresh-button');
    assert.match(app.nodes.get('summary-rows').textContent, /Conflicted at the last evaluation/); assert.doesNotMatch(app.nodes.get('summary-rows').textContent, /100|20/);
  });
  await check('unknown submission freezes account and resubmission and recovers only the original intent', async () => {
    const app = harness(); await flush(); await app.click('preview-button'); app.consent(true); await app.click('intent-button'); app.nodes.get('simulate-loss').checked = true; await app.click('submit-button');
    assert.equal(app.nodes.get('outcome-panel').hidden, false); assert.equal(app.nodes.get('account').disabled, true); assert.equal(app.nodes.get('submit-button').disabled, true);
    await app.click('check-outcome'); assert.equal(app.nodes.get('outcome-panel').hidden, true); assert.equal(app.nodes.get('account').disabled, false);
    assert.equal(app.calls.filter(call => call.route.endsWith('/reports')).length, 1); assert.ok(app.calls.some(call => call.route === '/api/community/shared-census/intents/intent-a/outcome'));
  });
  await check('online and expired count read boundaries are enforced without a refresh or new observation', async () => {
    const app = harness(); await flush(); await app.click('preview-button'); app.consent(true); await app.click('intent-button'); await app.click('submit-button'); const requests = app.calls.length;
    app.elapsed(901); assert.match(app.nodes.get('summary-rows').textContent, /over 15 minutes old/); app.elapsed(86401); assert.match(app.nodes.get('summary-rows').textContent, /expired/); assert.equal(app.calls.length, requests);
  });
  await check('hiding clears preview and consent, aborts ownership, and ignores a later completed response', async () => {
    const app = harness(); await flush(); const release = app.deferPreview(); const pending = app.nodes.get('preview-button').events.click(); await new Promise(setImmediate);
    app.visible(false); assert.equal(app.nodes.get('preview-panel').hidden, true); app.visible(true); release(); await pending; await flush();
    assert.equal(app.nodes.get('preview-panel').hidden, true); assert.equal(app.nodes.get('consent').checked, false); assert.match(app.nodes.get('summary-rows').textContent, /paused/);
    await app.click('refresh-button'); assert.doesNotMatch(app.nodes.get('summary-rows').textContent, /paused/);
  });
  await check('reader mode disables reporting while leaving private view refresh available', async () => {
    const app = harness(); await flush(); app.nodes.get('account').value = 'reader'; await app.nodes.get('account').events.change(); await flush();
    assert.equal(app.nodes.get('preview-button').disabled, true); assert.equal(app.nodes.get('consent').disabled, true); assert.equal(app.nodes.get('refresh-button').disabled, false);
  });
  for (const failure of ['500-after-commit', 'non-json-403-after-commit', 'unrecognized-403-after-commit', 'network-after-commit']) await check(failure + ' retains the original unknown intent until outcome recovery, without resubmission', async () => {
    const app = harness({ reportFailure: failure }); await flush(); await app.click('preview-button'); app.consent(true); await app.click('intent-button'); await app.click('submit-button');
    assert.equal(app.lab.receipt.state, 'accepted'); assert.equal(app.nodes.get('outcome-panel').hidden, false); assert.equal(app.nodes.get('account').disabled, true); assert.equal(app.nodes.get('submit-button').disabled, true);
    assert.equal(app.calls.filter(call => call.route.endsWith('/reports')).length, 1); assert.match(app.nodes.get('status').textContent, /not confirmed/);
    await app.click('check-outcome'); assert.equal(app.nodes.get('outcome-panel').hidden, true); assert.equal(app.nodes.get('account').disabled, false); assert.match(app.nodes.get('receipts-list').textContent, /accepted/);
    assert.ok(app.calls.some(call => call.route === '/api/community/shared-census/intents/intent-a/outcome')); assert.equal(app.calls.filter(call => call.route.endsWith('/reports')).length, 1);
  });
  await check('recognized bounded service 400 is a definite refusal and does not manufacture an unknown receipt', async () => {
    const app = harness({ reportFailure: 'known-400' }); await flush(); await app.click('preview-button'); app.consent(true); await app.click('intent-button'); await app.click('submit-button');
    assert.equal(app.lab.receipt, null); assert.equal(app.nodes.get('outcome-panel').hidden, true); assert.equal(app.nodes.get('account').disabled, false); assert.equal(app.nodes.get('preview-panel').hidden, true); assert.match(app.nodes.get('status').textContent, /report_time/);
    assert.equal(app.calls.filter(call => call.route.endsWith('/reports')).length, 1);
  });

  await check('mount is explicit synthetic loopback only and does not use global ID lookup', async () => {
    assert.throws(() => harness({ syntheticOnly: false }), /restricted/); assert.throws(() => harness({ hostname: 'olympus.roachcouncil.com' }), /restricted/);
    const app = harness(); await flush(); assert.match(app.host.textContent, /Shared census · local preview/); assert.match(app.host.textContent, /Synthetic data/); app.controller.destroy();
  });
  await check('destroy clears route DOM, drafts, global listeners, timers and later response revival', async () => {
    const app = harness(); await flush(); const release = app.deferPreview(), pending = app.nodes.get('preview-button').events.click(); await new Promise(setImmediate);
    app.controller.destroy(); app.controller.destroy(); assert.equal(app.host.children.length, 0); assert.equal(app.document.handlers.size, 0); assert.equal(app.window.handlers.size, 0); assert.equal(app.timers.size, 0);
    assert.equal(app.nodes.get('summary-rows').children.length, 0); assert.equal(app.nodes.get('receipts-list').children.length, 0); assert.equal(app.nodes.get('preview-button').handlers.size, 0);
    release(); await pending; await flush(); assert.equal(app.host.children.length, 0); assert.equal(app.nodes.get('preview-panel').hidden, true);
  });
  await check('two view hosts have unique labels and scoped controls; destroying one preserves the other', async () => {
    const app = harness(); await flush(); const other = new Element('div', app.document), second = app.api.mount(other, { syntheticOnly: true }); await second.ready;
    const otherNodes = app.getNodes(other); assert.notEqual(app.nodes.get('account').id, otherNodes.get('account').id);
    await otherNodes.get('preview-button').events.click(); await flush(); assert.equal(otherNodes.get('preview-panel').hidden, false); assert.equal(app.nodes.get('preview-panel').hidden, true);
    second.destroy(); assert.equal(other.children.length, 0); assert.equal(app.nodes.get('preview-button').disabled, false); app.controller.destroy();
  });
  await check('remount on the same host disposes the previous view and its pending response', async () => {
    const app = harness(); await flush(); const release = app.deferPreview(), pending = app.nodes.get('preview-button').events.click(); await new Promise(setImmediate);
    const replacement = app.api.mount(app.host, { syntheticOnly: true }); await replacement.ready; const replacementNodes = app.getNodes(app.host);
    release(); await pending; await flush(); assert.equal(replacementNodes.get('preview-panel').hidden, true); assert.equal(app.nodes.get('preview-button').handlers.size, 0);
    assert.equal(app.document.handlers.get('visibilitychange').size, 1); replacement.destroy();
  });
  await check('live admission fence rejects requests and suppresses results when the route becomes stale', async () => {
    const app = harness(); await flush(); const release = app.deferPreview(), pending = app.nodes.get('preview-button').events.click(); await new Promise(setImmediate);
    app.setFence(false); release(); await pending; await flush(); assert.equal(app.nodes.get('preview-panel').hidden, true);
    const calls = app.calls.length; await app.controller.refresh(); assert.equal(app.calls.length, calls); assert.deepEqual(app.refusals, []); app.controller.destroy();
  });
  for (const status of [401, 403]) await check('current ' + status + ' notifies outer admission once without a production state write', async () => {
    const app = harness({ reportFailure: 'context-' + status }); await flush(); await app.click('preview-button'); app.consent(true); await app.click('intent-button'); await app.click('submit-button');
    assert.deepEqual(app.refusals, [status]); assert.equal(app.lab.receipt, null); assert.equal(app.nodes.get('outcome-panel').hidden, true); app.controller.destroy();
  });
  await check('503 after commit remains unknown and never calls outer admission refusal callback', async () => {
    const app = harness({ reportFailure: '503-after-commit' }); await flush(); await app.click('preview-button'); app.consent(true); await app.click('intent-button'); await app.click('submit-button');
    assert.deepEqual(app.refusals, []); assert.equal(app.nodes.get('outcome-panel').hidden, false); await app.click('check-outcome'); assert.equal(app.nodes.get('outcome-panel').hidden, true); app.controller.destroy();
  });
  await check('synthetic QR images pass canvas/worker/assembler review before an explicit digest-only bridge and new consent', async () => {
    const app = harness(); await flush(); await app.qrMode();
    assert.equal(app.nodes.get('preview-button').hidden, true); assert.equal(app.calls.filter(call => call.route.includes('/qr/')).length, 0);
    await app.click('qr-scan-button');
    assert.equal(app.imageResources.workers.length, 1); assert.equal(app.imageResources.workers[0].posts.length, 2); assert.equal(app.imageResources.headerReads, 2); assert.equal(app.imageResources.assemblerCalls.length, 2);
    assert.equal(app.imageResources.workers[0].terminated, true); assert.equal(app.nodes.get('qr-canvas').width, 0); assert.equal(app.nodes.get('qr-review').hidden, false); assert.equal(app.nodes.get('preview-panel').hidden, true);
    assert.equal(app.nodes.get('consent').checked, false); assert.equal(app.calls.some(call => call.route.endsWith('/intents') || call.route.endsWith('/reports') || call.route.endsWith('/qr/accept')), false);
    await app.click('qr-use-button');
    const bridge = app.calls.find(call => call.route.endsWith('/qr/accept'));
    assert.deepEqual(Object.keys(bridge.body).sort(), ['nonce', 'payloadSHA256', 'qrId']); assert.equal(bridge.body.payloadSHA256, app.qrHash); assert.equal(app.nodes.get('preview-panel').hidden, false); assert.equal(app.nodes.get('qr-review').hidden, true);
    assert.equal(app.nodes.get('consent').checked, false); assert.equal(app.nodes.get('intent-button').disabled, true); assert.equal(app.calls.some(call => call.route.endsWith('/intents') || call.route.endsWith('/reports')), false);
    app.consent(true); await app.click('intent-button'); await app.click('submit-button'); assert.equal(app.calls.filter(call => call.route.endsWith('/reports')).length, 1);
    assert.equal(app.nodes.get('input-mode').disabled, false); app.controller.destroy();
  });
  await check('Stop terminates a pending QR worker, clears pixels and consent, and ignores a late worker message', async () => {
    const app = harness({ deferWorker: true }); await flush(); await app.qrMode(); const pending = app.nodes.get('qr-scan-button').events.click(); await flush();
    assert.equal(app.imageResources.workers.length, 1); await app.click('qr-stop-button'); app.releaseWorkers(); await pending; await flush();
    assert.equal(app.imageResources.workers[0].terminated, true); assert.ok(app.imageResources.pixels.every(bytes => bytes.every(byte => byte === 0))); assert.equal(app.nodes.get('qr-canvas').width, 0);
    assert.equal(app.nodes.get('qr-review').hidden, true); assert.equal(app.nodes.get('preview-panel').hidden, true); assert.equal(app.nodes.get('consent').checked, false);
    assert.equal(app.calls.filter(call => call.route.endsWith('/qr/cancel')).length, 1); assert.equal(app.calls.some(call => call.route.endsWith('/qr/accept') || call.route.endsWith('/reports')), false); app.controller.destroy();
  });
  await check('the original 30-second deadline includes a pending start request and cannot revive after expiry', async () => {
    const app = harness(); await flush(); await app.qrMode(); const release = app.deferQrStart(), pending = app.nodes.get('qr-scan-button').events.click(); await flush();
    app.elapsed(30); release(); await pending; await flush(); assert.equal(app.imageResources.workers.length, 0); assert.equal(app.nodes.get('qr-review').hidden, true);
    assert.equal(app.nodes.get('qr-use-button').disabled, true); assert.equal(app.calls.some(call => call.route.endsWith('/qr/accept') || call.route.includes('/images/')), false); app.controller.destroy();
  });
  await check('decoded review expires at the original handle rather than extending to the pilot review ceiling', async () => {
    const app = harness(); await flush(); await app.qrMode(); await app.click('qr-scan-button'); assert.equal(app.nodes.get('qr-review').hidden, false);
    app.elapsed(30); assert.equal(app.nodes.get('qr-review').hidden, true); assert.equal(app.nodes.get('qr-use-button').disabled, true); assert.equal(app.nodes.get('consent').checked, false);
    assert.equal(app.calls.some(call => call.route.endsWith('/qr/accept') || call.route.endsWith('/intents')), false); app.controller.destroy();
  });
  await check('wall-clock rollback cancels the active scan without accepting a late decode', async () => {
    const app = harness({ deferWorker: true }); await flush(); await app.qrMode(); const pending = app.nodes.get('qr-scan-button').events.click(); await flush();
    app.rollBackWall(); app.releaseWorkers(); await pending; await flush(); assert.equal(app.imageResources.workers[0].terminated, true); assert.equal(app.nodes.get('qr-review').hidden, true);
    assert.equal(app.calls.some(call => call.route.endsWith('/qr/accept')), false); app.controller.destroy();
  });
  await check('an image bitmap arriving after Stop is immediately closed and never sent to a worker', async () => {
    const app = harness(); await flush(); await app.qrMode(); const release = app.deferBitmap(), pending = app.nodes.get('qr-scan-button').events.click(); await flush();
    await app.click('qr-stop-button'); release(); await pending; await flush(); assert.equal(app.imageResources.bitmaps.length, 1); assert.equal(app.imageResources.bitmaps[0].closes, 1);
    assert.equal(app.imageResources.workers.length, 0); assert.equal(app.nodes.get('qr-review').hidden, true); app.controller.destroy();
  });
  for (const change of ['mode', 'scenario', 'guild', 'account', 'hidden', 'destroy']) await check('changing ' + change + ' clears QR review and draft consent without acceptance', async () => {
    const app = harness(); await flush(); await app.qrMode(); await app.click('qr-scan-button'); assert.equal(app.nodes.get('qr-review').hidden, false);
    if (change === 'mode') { app.nodes.get('input-mode').value = 'fixture'; await app.nodes.get('input-mode').events.change(); }
    else if (change === 'scenario') { app.nodes.get('scenario').value = 'masked'; await app.nodes.get('scenario').events.change(); }
    else if (change === 'guild') { app.nodes.get('guild').value = 'different-synthetic-guild'; await app.nodes.get('guild').events.change(); }
    else if (change === 'account') { app.nodes.get('account').value = 'reporter-b'; await app.nodes.get('account').events.change(); await flush(); }
    else if (change === 'hidden') app.visible(false); else app.controller.destroy();
    assert.equal(app.nodes.get('qr-review').hidden, true); assert.equal(app.nodes.get('consent').checked, false); assert.equal(app.nodes.get('preview-panel').hidden, true); assert.equal(app.nodes.get('qr-canvas').width, 0);
    assert.equal(app.calls.some(call => call.route.endsWith('/qr/accept') || call.route.endsWith('/intents') || call.route.endsWith('/reports')), false); app.controller.destroy();
  });
  for (const failure of ['foreignImage', 'badFrame', 'wrongQrHash']) await check(failure + ' cannot produce an accepted preview or an automatic consent/intent/report', async () => {
    const app = harness({ [failure]: true }); await flush(); await app.qrMode(); await app.click('qr-scan-button');
    assert.equal(app.nodes.get('qr-review').hidden, true); assert.equal(app.nodes.get('preview-panel').hidden, true); assert.equal(app.nodes.get('consent').checked, false); assert.equal(app.nodes.get('qr-canvas').width, 0);
    assert.equal(app.calls.some(call => call.route.endsWith('/qr/accept') || call.route.endsWith('/intents') || call.route.endsWith('/reports')), false);
    if (failure === 'foreignImage') assert.equal(app.imageResources.workers.length, 0); else assert.ok(app.imageResources.workers.every(worker => worker.terminated)); app.controller.destroy();
  });
  await check('unknown census submission freezes the QR mode and source controls too', async () => {
    const app = harness(); await flush(); await app.qrMode(); await app.click('qr-scan-button'); await app.click('qr-use-button'); app.consent(true); await app.click('intent-button'); app.nodes.get('simulate-loss').checked = true; await app.click('submit-button');
    assert.equal(app.nodes.get('input-mode').disabled, true); assert.equal(app.nodes.get('qr-scan-button').disabled, true); assert.equal(app.nodes.get('guild').disabled, true); await app.click('check-outcome'); assert.equal(app.nodes.get('input-mode').disabled, false); app.controller.destroy();
  });
  await check('QR path exposes no real-input, capture, paste or permission surface', async () => {
    const app = harness(); await flush(); const inputs = app.host.querySelectorAll('input'); assert.ok(inputs.every(input => input.attributes.type === 'checkbox')); assert.equal(app.host.querySelectorAll('textarea').length, 0);
    assert.equal(/getUserMedia|getDisplayMedia|navigator\.clipboard|localStorage|sessionStorage|type:\s*["']file/.test(source), false); app.controller.destroy();
  });
  await check('every CSS selector is scoped under the reusable view and there are no global resets', async () => {
    function selectors(text) { let at = 0, result = []; while (at < text.length) { const open = text.indexOf('{', at); if (open < 0) break; const head = text.slice(at, open).trim(); let depth = 1, end = open + 1; for (; end < text.length && depth; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; } if (head.startsWith('@media')) result.push(...selectors(text.slice(open + 1, end - 1))); else result.push(...head.split(',').map(s => s.trim())); at = end; } return result; }
    const rules = selectors(css.replace(/\/\*[^]*?\*\//g, '')); assert.ok(rules.length > 100); assert.ok(rules.every(selector => selector.startsWith('.shared-census-local'))); assert.ok(!/:root/.test(css));
  });
  console.log('TOTAL ' + passed + ' passed, ' + failed + ' failed; synthetic in-memory UI/API only.');
  if (failed) process.exitCode = 1;
})();
