'use strict';
// Independent synthetic DOM/transport cases for the actual local bridge source.
// No addon/native capture, QR decoding, real data, browser or provider claim.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
const clone = value => JSON.parse(JSON.stringify(value));
class Target {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, handler) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(handler); }
  async emit(type) { await Promise.all((this.handlers.get(type) || []).map(handler => handler({ type }))); }
}
class Element extends Target {
  constructor(tag = 'div') { super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.after = []; this.disabled = false; this.hidden = false; this.checked = false; this.text = ''; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  append(child) { this.children.push(child); }
  insertAdjacentElement(position,child) { assert.equal(position,'afterend');this.after.push(child);return child; }
  setAttribute(name,value) { this.attrs[name]=String(value); }
  replaceChildren(...children) { this.text = ''; this.children = [...children]; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(selector === 'button[data-accepted]' && child.tagName === 'BUTTON' && Object.hasOwn(child.dataset, 'accepted') ? [child] : []), ...child.querySelectorAll(selector)]); }
}
function harness(options = {}) {
  let wall = 1792497600000, nextTimer = 0, receipt = null, outcome = 'accepted';
  const document = new Target(), window = new Target(), timers = new Map(), calls = [], queued = new Map(), refusals = new Map();
  const nodes = Object.fromEntries(['local-status','local-use','local-draft','local-source','local-consent','local-intent','local-submit','local-recover','local-results','local-refresh','start','review'].map(id => [id, new Element(id === 'local-consent' ? 'input' : 'div')]));
  const sources = ['paste','image','window','camera'].map(value => { const node = new Element('button'); node.dataset.source = value; return node; });
  document.hidden = false; document.getElementById = id => { assert.ok(nodes[id], 'Known bridge UI element: ' + id); return nodes[id]; };
  document.createElement = tag => new Element(tag); document.querySelectorAll = selector => { assert.equal(selector, '[data-source]'); return sources; };
  class Clock extends Date { static now() { return wall; } }
  const local = value => ({ localOnly: true, syntheticOnly: false, ...value });
  const payload = { observedAt: wall / 1000, guilds: [{ name: 'Fictional QA Guild', receivedAt: wall / 1000, reportedCharacters: 100, online: 20 }] };
  function state(label = 'Fictional QA Guild') {
    return local({ summary: receipt ? { rows: [{ label, state: receipt.state === 'accepted' ? 'reported' : 'unavailable', reportedCharacters: 100, reportedOnline: 20 }] } : null, receipts: receipt ? [clone(receipt)] : [] });
  }
  const contract = { consentVersion: 'local-real-census-v1' };
  async function fetch(route, request = {}) {
    assert.match(route, /^\/local\/[a-z]+$/); assert.equal(request.credentials, 'same-origin'); assert.equal(request.cache, 'no-store');
    const body = request.body === undefined ? undefined : JSON.parse(request.body), call = { route, body, method: request.method || 'GET', signal: request.signal, keepalive: request.keepalive }; calls.push(call);
    if(request.keepalive!==undefined){assert.equal(route,'/local/cancel');assert.equal(request.keepalive,true);}
    if (body !== undefined) { assert.equal(request.method, 'POST'); assert.equal(request.headers['Content-Type'], 'application/json'); assert.equal(request.headers['X-Census-CSRF'], 'fictional-csrf'); }
    if(refusals.has(route)){const refused=refusals.get(route);refusals.delete(route);return{ok:false,status:refused.status,json:async()=>{if(refused.malformed)throw Error('Malformed local JSON');return clone(refused.value);}};}
    const pending = queued.get(route)?.shift();
    let value;
    if (route === '/local/session') value = local({ csrf: 'fictional-csrf' });
    else if (route === '/local/state') value = state();
    else if (route === '/local/start') value = local({ scanId: 'a'.repeat(32), nonce: 'b'.repeat(32), expiresAt: wall + 30000 + (options.extendedDeadline ? 1 : 0) });
    else if (route === '/local/cancel') value = local({ state: 'cancelled' });
    else if (route === '/local/preview') value = local({ previewId: 'c'.repeat(32), expiresAt: Math.floor(wall / 1000) + 300, contract, payload });
    else if (route === '/local/intent') value = local({ intent: 'd'.repeat(32), issuedAt: Math.floor(wall / 1000), expiresAt: Math.floor(wall / 1000) + 300 });
    else if (route === '/local/submit') {
      receipt = local({ receiptId: 'e'.repeat(32), state: 'accepted' }); value = receipt;
      if (options.lostSubmission) throw Error('Fictional response lost after memory commit');
    } else if (route === '/local/outcome') value = local({ state: outcome, ...(outcome === 'accepted' ? { receipt } : {}) });
    else if (route === '/local/withdraw') { receipt.state = 'withdrawn'; value = receipt; }
    else throw Error('Unexpected local route');
    if (pending) { pending.call = call; value = await pending.promise; }
    return { ok: true, status: 200, json: async () => clone(value) };
  }
  vm.runInNewContext(source, { document, window, fetch, AbortController, Date: Clock, setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); } }, { filename: 'actual-local-bridge.js' });
  const count = route => calls.filter(call => call.route === '/local/' + route).length;
  async function click(id) { if (!nodes[id].disabled && !nodes[id].hidden) await nodes[id].emit('click'); await flush(); }
  function defer(route) { let resolve,reject; const pending = { promise: new Promise((accept,refuse) => { resolve = accept;reject=refuse; }), resolve(value) { resolve(local(value)); }, reject(error){reject(error);} }; if (!queued.has('/local/' + route)) queued.set('/local/' + route, []); queued.get('/local/' + route).push(pending); return pending; }
  async function decoded() { const original = await window.AttendedCensusBridge.start(); window.AttendedCensusBridge.decoded(payload, ['Fictional part 1', 'Fictional part 2'], original); return original; }
  async function reviewed() { await decoded(); await click('local-use'); }
  async function consent(value = true) { nodes['local-consent'].checked = value; await nodes['local-consent'].emit('change'); await flush(); }
  async function prepared() { await reviewed(); await consent(); await click('local-intent'); }
  return { nodes, sources, document, window, timers, calls, count, click, defer, decoded, reviewed, consent, prepared, state, payload, contract,
    notes:()=>[...nodes['local-use'].after,...nodes.review.children],
    refuse(route,status,value,malformed=false){refusals.set('/local/'+route,{status,value,malformed});},
    async ready() { await flush(); },
    async clear() { window.AttendedCensusBridge.clear(); await flush(); },
    async hidden(value = true) { document.hidden = value; await document.emit('visibilitychange'); await flush(); },
    async pagehide() { await window.emit('pagehide'); await flush(); },
    async elapsed(milliseconds) { wall += milliseconds; for (const fn of [...timers.values()]) fn(); await flush(); },
    outcome(value) { outcome = value; }
  };
}
let passed = 0, failed = 0;
async function check(label, operation) { try { await operation(); passed++; console.log('PASS ' + label); } catch (error) { failed++; console.error('FAIL ' + label + ': ' + error.stack); } }
(async () => {
  await check('initial view obtains only a local session and count view, with no observation or write', async () => {
    const h = harness(); await h.ready(); assert.equal(h.count('session'), 1); assert.equal(h.count('state'), 1); assert.equal(h.calls.filter(call => call.method === 'POST').length, 0); assert.equal(h.nodes['local-use'].disabled, true); assert.equal(h.nodes['local-draft'].hidden, true); assert.equal(h.nodes['local-consent'].checked, false);
  });
  await check('starting and decoding do not consent, hand off or submit automatically', async () => {
    const h = harness(); await h.ready(); const scan = await h.decoded(); assert.equal(scan.expiresAt, 1792497630000); // Controlled clock is independent of host time.
    assert.equal(h.count('start'), 1); assert.equal(h.count('preview'), 0); assert.equal(h.count('intent'), 0); assert.equal(h.count('submit'), 0); assert.equal(h.nodes['local-use'].disabled, false); assert.equal(h.nodes['local-consent'].checked, false);
  });
  await check('handoff sends only original frames and handle and leaves consent and intent separate', async () => {
    const h = harness(); await h.ready(); await h.reviewed(); assert.deepEqual(h.calls.find(call => call.route === '/local/preview').body, { scanId: 'a'.repeat(32), frames: ['Fictional part 1', 'Fictional part 2'] }); assert.equal(h.nodes['local-draft'].hidden, false); assert.equal(h.nodes['local-consent'].checked, false); assert.equal(h.nodes['local-intent'].disabled, true); assert.equal(h.nodes['local-submit'].disabled, true); assert.equal(h.count('intent'), 0); assert.equal(h.count('submit'), 0);
  });
  await check('disabled intent and submission cannot bypass fresh explicit consent', async () => {
    const h = harness(); await h.ready(); await h.reviewed(); await h.click('local-intent'); await h.click('local-submit'); assert.equal(h.count('intent'), 0); assert.equal(h.count('submit'), 0);
  });
  await check('consent prepares only the original preview-bound intent and never submits', async () => {
    const h = harness(); await h.ready(); await h.prepared(); assert.deepEqual(h.calls.find(call => call.route === '/local/intent').body, { previewId: 'c'.repeat(32), consentVersion: 'local-real-census-v1' }); assert.equal(h.nodes['local-consent'].disabled, true); assert.equal(h.nodes['local-submit'].disabled, false); assert.equal(h.count('intent'), 1); assert.equal(h.count('submit'), 0);
  });
  await check('deliberate submission uses exact original intent once and clears consent', async () => {
    const h = harness(); await h.ready(); await h.prepared(); await h.click('local-submit'); assert.deepEqual(h.calls.find(call => call.route === '/local/submit').body, { previewId: 'c'.repeat(32), intent: 'd'.repeat(32) }); assert.equal(h.count('submit'), 1); assert.equal(h.nodes['local-consent'].checked, false); assert.equal(h.nodes['local-draft'].hidden, true); assert.match(h.nodes['local-results'].textContent, /Your local receipt · accepted/); await h.click('local-submit'); assert.equal(h.count('submit'), 1);
  });
  await check('withdrawal targets only the displayed own receipt and refreshes its outcome', async () => {
    const h = harness(); await h.ready(); await h.prepared(); await h.click('local-submit'); const button = h.nodes['local-results'].querySelectorAll('button[data-accepted]')[0]; assert.equal(button.disabled, false); await button.emit('click'); await flush(); assert.deepEqual(h.calls.find(call => call.route === '/local/withdraw').body, { receiptId: 'e'.repeat(32) }); assert.match(h.nodes['local-results'].textContent, /Your local receipt · withdrawn/); assert.equal(h.nodes['local-results'].querySelectorAll('button[data-accepted]')[0].disabled, true);
  });
  await check('lost response freezes all replacement controls and recovers only original intent', async () => {
    const h = harness({ lostSubmission: true }); await h.ready(); await h.prepared(); await h.click('local-submit'); assert.equal(h.nodes['local-recover'].hidden, false); for (const id of ['start','local-use','local-intent','local-submit','local-consent','local-refresh']) assert.equal(h.nodes[id].disabled, true, id); assert.ok(h.sources.every(button => button.disabled)); await assert.rejects(h.window.AttendedCensusBridge.start(), /original unknown outcome/); h.outcome('pending'); await h.click('local-recover'); assert.equal(h.nodes['local-recover'].hidden, false); assert.equal(h.count('submit'), 1); h.outcome('accepted'); await h.click('local-recover'); assert.equal(h.nodes['local-recover'].hidden, true); assert.equal(h.nodes.start.disabled, false); assert.deepEqual(h.calls.filter(call => call.route === '/local/outcome').map(call => call.body), [{ intent: 'd'.repeat(32) }, { intent: 'd'.repeat(32) }]); assert.equal(h.count('submit'), 1);
  });
  await check('clear aborts delayed handoff and ignores its late response and consent', async () => {
    const h = harness(); await h.ready(); await h.decoded(); const wait = h.defer('preview'), action = h.click('local-use'); await flush(); assert.ok(wait.call.signal); await h.clear(); assert.equal(wait.call.signal.aborted, true); wait.resolve({ previewId: 'late', expiresAt: 1792497900, contract: h.contract, payload: h.payload }); await action; assert.equal(h.nodes['local-draft'].hidden, true); assert.equal(h.nodes['local-consent'].checked, false); assert.equal(h.nodes['local-intent'].disabled, true); assert.equal(h.nodes['local-source'].textContent, ''); assert.equal(h.count('submit'), 0);
  });
  await check('clear aborts delayed intent and does not adopt its eventual identifier', async () => {
    const h = harness(); await h.ready(); await h.reviewed(); await h.consent(); const wait = h.defer('intent'), action = h.click('local-intent'); await flush(); await h.clear(); assert.equal(wait.call.signal.aborted, true); wait.resolve({ intent: 'late-intent' }); await action; assert.equal(h.nodes['local-submit'].disabled, true); assert.equal(h.nodes['local-draft'].hidden, true); assert.equal(h.count('submit'), 0);
  });
  await check('hidden recovery is aborted and its late response cannot unlock unknown state', async () => {
    const h = harness({ lostSubmission: true }); await h.ready(); await h.prepared(); await h.click('local-submit'); const wait = h.defer('outcome'), action = h.click('local-recover'); await flush(); await h.hidden(); assert.equal(wait.call.signal.aborted, true); wait.resolve({ state: 'accepted' }); await action; assert.equal(h.nodes['local-recover'].hidden, false); assert.equal(h.nodes['local-results'].textContent, ''); assert.equal(h.nodes['local-consent'].checked, false); const reads = h.count('state'); await h.hidden(false); assert.equal(h.count('state'), reads); assert.equal(h.nodes.start.disabled, true); await h.click('local-recover'); assert.equal(h.nodes['local-recover'].hidden, true); assert.equal(h.count('submit'), 1);
  });
  await check('pagehide clears displayed real-local aggregate and draft without withdrawing receipt', async () => {
    const h = harness(); await h.ready(); await h.prepared(); await h.click('local-submit'); assert.match(h.nodes['local-results'].textContent, /Fictional QA Guild/); await h.pagehide(); assert.equal(h.nodes['local-results'].textContent, ''); assert.equal(h.nodes['local-consent'].checked, false); assert.equal(h.nodes['local-draft'].hidden, true); assert.equal(h.count('withdraw'), 0); assert.equal(h.timers.size, 0); assert.ok(h.count('cancel') >= 1);
  });
  await check('a refresh completing after clear cannot repopulate cleared observations', async () => {
    const h = harness(); await h.ready(); const wait = h.defer('state'); await h.click('local-refresh'); await h.clear(); wait.resolve({ summary: { rows: [{ label: 'Late data', state: 'reported', reportedCharacters: 100, reportedOnline: 20 }] }, receipts: [] }); await flush(); assert.equal(h.nodes['local-results'].textContent, '');
  });
  await check('refresh sequence prevents older responses from overwriting newer census state', async () => {
    const h = harness(); await h.ready(); const older = h.defer('state'), newer = h.defer('state'); await h.click('local-refresh'); await h.click('local-refresh'); newer.resolve({ summary: { rows: [{ label: 'New view', state: 'reported', reportedCharacters: 100, reportedOnline: 20 }] }, receipts: [] }); await flush(); assert.match(h.nodes['local-results'].textContent, /New view/); older.resolve({ summary: { rows: [{ label: 'Old view', state: 'reported', reportedCharacters: 100, reportedOnline: 20 }] }, receipts: [] }); await flush(); assert.match(h.nodes['local-results'].textContent, /New view/); assert.doesNotMatch(h.nodes['local-results'].textContent, /Old view/);
  });
  await check('hidden refresh does not request or automatically restore observations when visible', async () => {
    const h = harness(); await h.ready(); await h.hidden(); const reads = h.count('state'); await h.click('local-refresh'); assert.equal(h.count('state'), reads); await h.hidden(false); assert.equal(h.count('state'), reads); assert.equal(h.nodes['local-results'].textContent, ''); await h.click('local-refresh'); assert.equal(h.count('state'), reads + 1);
  });
  await check('original scan deadline disables handoff at exactly thirty seconds without renewal', async () => {
    const h = harness(); await h.ready(); await h.decoded(); await h.elapsed(30000); assert.equal(h.nodes['local-use'].disabled, true); await h.click('local-use'); assert.equal(h.count('preview'), 0); assert.equal(h.timers.size, 0); assert.match(h.nodes['local-status'].textContent, /original handoff deadline ended/);
  });
  await check('preview deadline clears prepared consent and intent rather than submitting automatically', async () => {
    const h = harness(); await h.ready(); await h.prepared(); await h.elapsed(300000); assert.equal(h.nodes['local-consent'].checked, false); assert.equal(h.nodes['local-draft'].hidden, true); assert.equal(h.nodes['local-submit'].disabled, true); assert.equal(h.count('submit'), 0); assert.equal(h.timers.size, 0);
  });
  await check('wrong scan and empty or excessive original-frame sets cannot become reviewed handoffs', async () => {
    const h = harness(); await h.ready(); const scan = await h.window.AttendedCensusBridge.start(); assert.throws(() => h.window.AttendedCensusBridge.decoded(h.payload, ['part'], { scanId: 'f'.repeat(32) }), /owned scan/); assert.throws(() => h.window.AttendedCensusBridge.decoded(h.payload, [], scan), /owned scan/); assert.throws(() => h.window.AttendedCensusBridge.decoded(h.payload, Array(15).fill('part'), scan), /owned scan/); assert.equal(h.nodes['local-use'].disabled, true); assert.equal(h.count('preview'), 0);
  });
  await check('server descriptor cannot extend the original thirty-second limit', async () => {
    const h = harness({ extendedDeadline: true }); await h.ready(); await assert.rejects(h.window.AttendedCensusBridge.start(), /original scan deadline/); assert.equal(h.nodes['local-use'].disabled, true); assert.equal(h.count('preview'), 0);
  });
  await check('owned handoff notes appear beside Use and decoded review with passive accessible timers',async()=>{
    const h=harness();await h.ready();const notes=h.notes();assert.equal(notes.length,2);assert.ok(notes.every(note=>note.hidden));await h.window.AttendedCensusBridge.start();assert.ok(notes.every(note=>!note.hidden&&/30s remaining in the original 30-second scan/.test(note.textContent)));assert.ok(notes.every(note=>note.attrs.role==='timer'&&note.attrs['aria-live']==='off'&&/handoff time remaining/.test(note.attrs['aria-label'])));assert.equal(h.count('preview'),0);assert.equal(h.count('submit'),0);
  });
  await check('decoding cannot reset the handoff countdown or confuse it with the longer browser review',async()=>{
    const h=harness();await h.ready();const scan=await h.window.AttendedCensusBridge.start();await h.elapsed(21000);h.window.AttendedCensusBridge.decoded(h.payload,['Original fictional part'],scan);assert.ok(h.notes().every(note=>/9s remaining/.test(note.textContent)));assert.ok(h.notes().every(note=>/longer browser-review expiry does not extend this handoff/.test(note.textContent)));await h.elapsed(8999);assert.equal(h.nodes['local-use'].disabled,false);assert.ok(h.notes().every(note=>/1s remaining/.test(note.textContent)));await h.elapsed(1);assert.equal(h.nodes['local-use'].disabled,true);assert.ok(h.notes().every(note=>/handoff expired/.test(note.textContent)&&/can no longer be handed off/.test(note.textContent)));assert.equal(h.timers.size,0);await h.click('local-use');assert.equal(h.count('preview'),0);
  });
  await check('successful handoff clears its timer notes without extending the separate preview or consenting',async()=>{
    const h=harness();await h.ready();await h.decoded();await h.elapsed(12000);await h.click('local-use');assert.ok(h.notes().every(note=>note.hidden&&note.textContent===''));assert.equal(h.nodes['local-draft'].hidden,false);assert.equal(h.nodes['local-consent'].checked,false);assert.equal(h.nodes['local-intent'].disabled,true);assert.equal(h.count('preview'),1);assert.equal(h.count('intent'),0);assert.equal(h.count('submit'),0);await h.elapsed(300000);assert.equal(h.nodes['local-draft'].hidden,true);assert.equal(h.timers.size,0);
  });
  await check('clear, hidden and pagehide remove owned countdown text and never resume it',async()=>{
    for(const stop of ['clear','hidden','pagehide']){const h=harness();await h.ready();await h.decoded();await h[stop]();assert.ok(h.notes().every(note=>note.hidden&&note.textContent===''));assert.equal(h.timers.size,0);const starts=h.count('start');await h.hidden(false);assert.equal(h.count('start'),starts);assert.ok(h.notes().every(note=>note.hidden));}
  });
  await check('known local refusal codes use bounded fixed clock, session, source and ownership messages only',async()=>{
    const cases={local_clock_refused:/clock moved backwards or became unavailable/,original_local_session_required:/original local session expired or changed/,own_scan_required:/original owned QR scan is no longer available/,scan_expired:/original 30-second QR scan expired/,qr_payload_refused:/canonical-format, checksum, masking or source-time checks/,complete_unique_frames_required:/original unique QR parts/,complete_frames_required:/frame set did not complete/,one_guild_scope_required:/different guild, realm or faction/,source_expired:/original source time expired/,reporter_required:/reader and cannot submit/,csrf_required:/original local page token did not pass/};
    for(const[code,expected]of Object.entries(cases)){const h=harness();await h.ready();h.refuse('start',503,{localOnly:true,error:{code,message:'DO_NOT_ECHO_RAW_FRAME_OR_GUILD'},payload:'DO_NOT_ECHO_RAW_FRAME_OR_GUILD'});await assert.rejects(h.window.AttendedCensusBridge.start(),error=>{assert.match(error.message,expected);assert.match(error.message,/HTTP 503/);assert.doesNotMatch(error.message,/DO_NOT_ECHO/);return true;});assert.ok(h.notes().every(note=>note.hidden));assert.equal(h.count('preview'),0);assert.equal(h.count('intent'),0);assert.equal(h.count('submit'),0);assert.equal(h.nodes['local-consent'].checked,false);}
  });
  await check('unknown, inherited-looking, out-of-scope or malformed refusals cannot reflect arbitrary response text',async()=>{
    const cases=[{localOnly:true,error:{code:'unknown_DO_NOT_ECHO'}},{localOnly:true,error:{code:'__proto__',message:'DO_NOT_ECHO'}},{localOnly:true,error:{code:'constructor',message:'DO_NOT_ECHO'}},{localOnly:false,error:{code:'local_clock_refused',message:'DO_NOT_ECHO'}},{localOnly:true,error:{code:42,message:'DO_NOT_ECHO'}},'DO_NOT_ECHO',null];
    for(const value of cases){const h=harness();await h.ready();h.refuse('start',400,value);await assert.rejects(h.window.AttendedCensusBridge.start(),error=>{assert.match(error.message,/local census refused this operation/);assert.match(error.message,/HTTP 400/);assert.doesNotMatch(error.message,/DO_NOT_ECHO|clock moved backwards/);return true;});}const h=harness();await h.ready();h.refuse('start',502,null,true);await assert.rejects(h.window.AttendedCensusBridge.start(),/local census refused this operation.*HTTP 502/);
  });
  await check('count-view refusal can expose a fixed reason without echoing a source observation or making a write',async()=>{
    const h=harness();await h.ready();h.refuse('state',503,{localOnly:true,error:{code:'local_clock_refused'},payload:'DO_NOT_ECHO'});await h.click('local-refresh');assert.match(h.nodes['local-status'].textContent,/clock moved backwards or became unavailable/);assert.doesNotMatch(h.nodes['local-status'].textContent,/DO_NOT_ECHO/);assert.equal(h.calls.filter(call=>call.method==='POST').length,0);
  });
  await check('clear dispatches normal CSRF cancellation synchronously before iframe teardown and returns strict acknowledgement',async()=>{
    const h=harness();await h.ready();await h.reviewed();
    const completion=h.window.AttendedCensusBridge.clear();
    assert.equal(h.count('cancel'),1);const call=h.calls.find(call=>call.route==='/local/cancel');assert.deepEqual(call.body,{});assert.equal(call.method,'POST');assert.equal(call.keepalive,true);assert.equal(call.signal,undefined);assert.equal(h.nodes['local-draft'].hidden,true);assert.equal(await completion,true);
    assert.equal(h.count('withdraw'),0);assert.equal(h.count('submit'),0);
  });
  await check('repeated Stop and pagehide share one in-flight cancel and never queue a post-ack cancellation',async()=>{
    const h=harness();await h.ready();await h.reviewed();const waiting=h.defer('cancel');
    const first=h.window.AttendedCensusBridge.clear(),second=h.window.AttendedCensusBridge.clear(),leaving=h.window.emit('pagehide');
    assert.strictEqual(first,second);assert.equal(h.count('cancel'),1);waiting.resolve({state:'cancelled'});assert.equal(await first,true);await leaving;assert.equal(await h.window.AttendedCensusBridge.clear(),true);await flush();assert.equal(h.count('cancel'),1);
    await h.window.AttendedCensusBridge.start();assert.equal(h.count('cancel'),1);assert.equal(await h.window.AttendedCensusBridge.clear(),true);assert.equal(h.count('cancel'),2);
  });
  await check('a current new start waits for cancel ACK while a cleared start cannot adopt it or queue another cancel',async()=>{
    const h=harness();await h.ready();const waiting=h.defer('cancel');h.window.AttendedCensusBridge.clear();
    const old=h.window.AttendedCensusBridge.start().then(()=>null,error=>error);h.window.AttendedCensusBridge.clear();const current=h.window.AttendedCensusBridge.start();await flush();assert.equal(h.count('start'),0);assert.equal(h.count('cancel'),1);
    waiting.resolve({state:'cancelled'});assert.match((await old).message,/local scan ended/);const scan=await current;h.window.AttendedCensusBridge.decoded(h.payload,['Fictional original part'],scan);await flush();assert.equal(h.count('start'),1);assert.equal(h.count('cancel'),1);assert.equal(h.nodes['local-use'].disabled,false);
  });
  await check('refused or malformed cancellation ACK blocks a replacement scan without automatic retry',async()=>{
    for(const malformed of [false,true]){const h=harness();await h.ready();h.refuse('cancel',503,{localOnly:true,error:{code:'local_clock_refused'}},malformed);assert.equal(await h.window.AttendedCensusBridge.clear(),false);await assert.rejects(h.window.AttendedCensusBridge.start(),/cancellation was not acknowledged/);await flush();assert.equal(h.count('cancel'),1);assert.equal(h.count('start'),0);assert.equal(h.count('submit'),0);}
  });
  await check('a wrong in-band cancellation state or lost response is not an acknowledgement',async()=>{
    for(const lost of [false,true]){const h=harness();await h.ready();const waiting=h.defer('cancel'),completion=h.window.AttendedCensusBridge.clear();if(lost)waiting.reject(Error('Fictional cancellation response lost'));else waiting.resolve({state:'pending'});assert.equal(await completion,false);await assert.rejects(h.window.AttendedCensusBridge.start(),/cancellation was not acknowledged/);assert.equal(h.count('cancel'),1);assert.equal(h.count('start'),0);}
  });
  await check('a failed cancellation attempt is retained across later clear and pagehide without an automatic retry',async()=>{
    const h=harness();await h.ready();const waiting=h.defer('cancel'),first=h.window.AttendedCensusBridge.clear();waiting.reject(Error('Fictional lost acknowledgement'));assert.equal(await first,false);assert.strictEqual(h.window.AttendedCensusBridge.clear(),first);await h.pagehide();await h.hidden();assert.equal(await h.window.AttendedCensusBridge.clear(),false);await h.hidden(false);await assert.rejects(h.window.AttendedCensusBridge.start(),/cancellation was not acknowledged/);assert.equal(h.count('cancel'),1);assert.equal(h.count('start'),0);assert.equal(h.count('submit'),0);
  });
  await check('clearing without an obtained CSRF token returns missing ACK without issuing an unauthenticated mutation',async()=>{
    const h=harness();const completion=h.window.AttendedCensusBridge.clear();assert.equal(h.count('cancel'),0);assert.equal(await completion,false);await h.ready();assert.equal(h.count('cancel'),0);assert.equal(h.calls.filter(call=>call.method==='POST').length,0);
  });
  await check('clear aborts an already dispatched start and its late reply cannot restore a scan',async()=>{
    const h=harness();await h.ready();const waiting=h.defer('start'),old=h.window.AttendedCensusBridge.start().then(()=>null,error=>error);await flush();assert.ok(waiting.call.signal);const completion=h.window.AttendedCensusBridge.clear();assert.equal(waiting.call.signal.aborted,true);assert.equal(h.count('cancel'),1);assert.equal(await completion,true);waiting.resolve({scanId:'a'.repeat(32),nonce:'b'.repeat(32),expiresAt:1792497630000});assert.match((await old).message,/local scan ended/);assert.equal(h.nodes['local-use'].disabled,true);assert.equal(h.count('start'),1);assert.equal(h.count('submit'),0);
  });
  await check('only cancellation uses keepalive while unknown submission keeps its original recovery and no replacement',async()=>{
    const h=harness({lostSubmission:true});await h.ready();await h.prepared();await h.click('local-submit');assert.equal(await h.window.AttendedCensusBridge.clear(),false);assert.ok(h.calls.every(call=>call.route==='/local/cancel'?call.keepalive===true:call.keepalive===undefined));assert.equal(h.nodes['local-recover'].hidden,false);await assert.rejects(h.window.AttendedCensusBridge.start(),/original unknown outcome/);await h.click('local-recover');assert.deepEqual(h.calls.find(call=>call.route==='/local/outcome').body,{intent:'d'.repeat(32)});assert.equal(h.count('submit'),1);assert.equal(h.count('withdraw'),0);
  });
  await check('unknown cleanup coalesces to false even after cancel ACK and unlocks only through original outcome recovery',async()=>{
    const h=harness({lostSubmission:true});await h.ready();await h.prepared();await h.click('local-submit');const waiting=h.defer('cancel'),first=h.window.AttendedCensusBridge.clear(),second=h.window.AttendedCensusBridge.clear();assert.strictEqual(first,second);assert.equal(h.count('cancel'),1);waiting.resolve({state:'cancelled'});assert.equal(await first,false);assert.equal(await h.window.AttendedCensusBridge.clear(),false);assert.equal(h.count('cancel'),1);h.outcome('pending');await h.click('local-recover');assert.equal(h.window.AttendedCensusBridge.busy(),true);await assert.rejects(h.window.AttendedCensusBridge.start(),/original unknown outcome/);h.outcome('accepted');await h.click('local-recover');assert.equal(h.window.AttendedCensusBridge.busy(),false);await h.window.AttendedCensusBridge.start();assert.equal(h.count('cancel'),1);assert.equal(h.count('start'),2);assert.deepEqual(h.calls.filter(call=>call.route==='/local/outcome').map(call=>call.body),[{intent:'d'.repeat(32)},{intent:'d'.repeat(32)}]);assert.equal(h.count('submit'),1);assert.equal(h.count('withdraw'),0);
  });
  console.log(`${passed}/${passed + failed} attended local bridge checks passed; source SHA256 ${crypto.createHash('sha256').update(source).digest('hex')}`);
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
