'use strict';
// Focused execution of the real local UI with an independent in-memory API.
// This does not qualify browser layout, real reporters or production admission.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'lab.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.text = ''; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(key, fn) { this.events[key] = fn; }
  querySelectorAll(tag) { return this.children.flatMap(child => typeof child === 'string' ? [] : [...(child.tagName === tag.toUpperCase() ? [child] : []), ...child.querySelectorAll(tag)]); }
}
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
function harness(options = {}) {
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  nodes.get('account').value = 'reporter-a'; nodes.get('scenario').value = 'fresh';
  const document = { hidden: options.hidden === true, events: {}, getElementById: id => nodes.get(id), createElement: tag => new Element(tag), addEventListener(key, fn) { this.events[key] = fn; } };
  const window = { events: {}, addEventListener(key, fn) { this.events[key] = fn; } };
  let mono = 0, tick = null, gets = 0, waitPreview = null;
  const lab = { now: 1792512000, account: 'reporter-a', receipt: null, conflict: false };
  const calls = [];
  const guild = { guildKey: 'guild-a', label: 'Synthetic Guild A', realmGroup: 'Test realm', product: 'Test product', faction: 'Test faction' };
  const snapshot = () => ({ syntheticOnly: true, now: lab.now, identity: { id: lab.account, label: 'Synthetic ' + lab.account, reporter: lab.account !== 'reader' }, csrfToken: 'local-token', contract: { format: 'olympus-shared-census-observation-v1', consentVersion: 'v1', guilds: [guild], canReport: lab.account !== 'reader', allowedGuildKeys: lab.account === 'reader' ? [] : ['guild-a'], limits: {} }, summary: { audience: 'private', evaluatedAt: lab.now, coverageComplete: false, rows: [{ ...guild, state: lab.conflict ? 'conflicted' : lab.receipt?.state === 'accepted' ? 'reported' : 'unavailable', reportedCharacters: lab.conflict ? null : 100, reportedOnline: lab.conflict ? null : 20, observedAt: lab.conflict ? null : lab.now, sourceReceivedAt: lab.conflict ? null : lab.now, expiresAt: lab.now + 86400 }] }, receipts: lab.receipt ? [{ ...lab.receipt }] : [] });
  async function fetch(route, request) {
    assert.ok(route.startsWith('/') && !route.startsWith('//')); assert.equal(request.credentials, 'same-origin'); assert.equal(request.redirect, 'error');
    if (request.method !== 'GET') { assert.equal(request.headers['X-Census-CSRF'], 'local-token'); assert.equal(request.headers['Content-Type'], 'application/json'); }
    calls.push({ route, method: request.method, body: request.body && JSON.parse(request.body) });
    const body = calls.at(-1).body; let value;
    if (route === '/__lab/state') { gets++; if (options.failInitial && gets === 1) throw Error('Synthetic network interruption'); value = snapshot(); }
    else if (route === '/__lab/session') { lab.account = body.account; value = snapshot(); }
    else if (route === '/__lab/preview') {
      if (waitPreview) await waitPreview;
      value = { previewId: 'preview-a', expiresAt: lab.now + 300, observation: { guildKey: body.guildKey, reportedCharacters: 100, reportedOnline: 20, observedAt: lab.now, sourceReceivedAt: lab.now, capturedAt: lab.now, addonVersion: '0.1.0' } };
    } else if (route === '/api/community/shared-census/intents') value = { intent: 'intent-a', expiresAt: lab.now + 300 };
    else if (route === '/api/community/shared-census/reports') {
      if (options.reportFailure === 'known-400') return { ok: false, status: 400, json: async () => ({ error: { code: 'report_time', message: 'The synthetic request was refused: report_time.' } }) };
      lab.receipt = { receiptId: 'receipt-a', guildKey: 'guild-a', state: 'accepted', receivedAt: lab.now, expiresAt: lab.now + 86400, sourceVerified: false, membershipProof: false, gameIdentityProven: false };
      if (options.reportFailure === '500-after-commit') return { ok: false, status: 500, json: async () => ({ error: { code: 'internal_refusal', message: 'The synthetic lab refused an internal operation.' } }) };
      if (options.reportFailure === 'non-json-403-after-commit') return { ok: false, status: 403, json: async () => { throw Error('Opaque gateway HTML'); } };
      if (options.reportFailure === 'unrecognized-403-after-commit') return { ok: false, status: 403, json: async () => ({ error: { code: 'gateway_denied', message: 'Not a service contract' } }) };
      if (options.reportFailure === 'network-after-commit') throw Error('Synthetic connection lost after commit');
      value = body.simulateLostResponse ? { state: 'unknown', intent: 'intent-a' } : { ...lab.receipt };
    } else if (route.endsWith('/outcome')) value = { state: 'accepted', receipt: lab.receipt };
    else if (request.method === 'DELETE') { lab.receipt.state = 'withdrawn'; value = { ...lab.receipt }; }
    else throw Error('Unexpected local route: ' + route);
    return { ok: true, status: 200, json: async () => value };
  }
  vm.runInNewContext(source, { document, window, performance: { now: () => mono }, setInterval: fn => (tick = fn, 1), clearInterval: () => {}, AbortController, fetch, Date, Map, Object, Array, Number, String, JSON, Math, encodeURIComponent });
  const click = async id => { await nodes.get(id).events.click(); await flush(); };
  const visible = value => { document.hidden = !value; document.events.visibilitychange(); };
  const consent = value => { nodes.get('consent').checked = value; nodes.get('consent').events.change(); };
  return { nodes, lab, calls, click, visible, consent, elapsed(seconds) { mono = seconds * 1000; tick?.(); }, deferPreview() { let release; waitPreview = new Promise(resolve => { release = resolve; }); return release; } };
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
  console.log('TOTAL ' + passed + ' passed, ' + failed + ' failed; synthetic in-memory UI/API only.');
  if (failed) process.exitCode = 1;
})();
