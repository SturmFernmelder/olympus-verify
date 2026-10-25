// Real renderer/model/template in a bounded DOM fixture. No database, provider or live account action.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const worker = path.join(__dirname, '..'), folder = path.join(worker, 'public/static/rank-planner');
const read = file => fs.readFileSync(file, 'utf8');
let checks = 0, networkCalls = 0;
const check = async (name, run) => { await run(); checks++; console.log('PASS ' + name); };
const OWNER = '472099715253796864', OTHER = '372099715253796865', key = owner => 'olympus-admin-rank-draft-v1:' + owner;
let user = null, admins = new Set([OWNER]), authCalls = 0;
const source = read(path.join(worker, 'src/site-ranks.ts'));
const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
assert.equal(compiled.diagnostics.length, 0);
const brandSource = read(path.join(worker, 'src/site-brand.ts'));
const brandCompiled = ts.transpileModule(brandSource, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
assert.equal(brandCompiled.diagnostics.length, 0);
const brand = { exports: {} };
new Function('module', 'exports', 'require', brandCompiled.outputText)(brand, brand.exports, name => { assert.fail('Unexpected site-brand import: ' + name); });
const server = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(server, server.exports, name => {
  if (name === './site-brand') return brand.exports;
  assert.equal(name, './site-core');
  return { currentUser: async () => { authCalls++; return user; }, isSiteAdmin: (_env, id) => /^\d{17,20}$/.test(id) && admins.has(id), securityHeaders: headers => { headers.set('Cache-Control', 'no-store'); headers.set('Content-Security-Policy', "default-src 'self'"); return headers; } };
});
const request = (method = 'GET') => new Request('https://olympus.roachcouncil.com/admin/ranks/fragment', { method });

class Node {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.parentNode = null; this.listeners = {}; this.attributes = {}; this.className = ''; this.value = ''; this.checked = false; this.disabled = false; this.open = false; this.dataset = {}; this.id = ''; this.type = ''; this.isFragment = false; }
  get textContent() { return this.tagName === '#TEXT' ? this.data : this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '' && v !== undefined && v !== null) { const n = new Node('#text', this.ownerDocument); n.data = String(v); this.append(n); } }
  append(...children) { for (let child of children) { if (typeof child === 'string') { const n = new Node('#text', this.ownerDocument); n.data = child; child = n; } if (child.isFragment) { this.append(...child.children.slice()); child.children = []; continue; } child.remove(); child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; } }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  get classList() { const el = this, list = () => el.className.split(/\s+/).filter(Boolean); return { contains: c => list().includes(c), toggle(c, on) { const wanted = on === undefined ? !list().includes(c) : !!on; el.className = [...new Set([...list().filter(x => x !== c), ...(wanted ? [c] : [])])].join(' '); return wanted; } }; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  fire(type) { return Promise.all((this.listeners[type] || []).slice().map(fn => fn({ type, target: this, preventDefault() {} }))); }
  click() { if (!this.disabled) return this.fire('click'); }
  all(test) { return this.children.flatMap(c => [...(test(c) ? [c] : []), ...c.all(test)]); }
  querySelector(selector) { if (selector.startsWith('#')) return this.all(n => n.id === selector.slice(1))[0] || null; if (selector === '[data-olympus-rank-planner]') return this.all(n => n.attributes['data-olympus-rank-planner'] !== undefined)[0] || null; throw Error('Unimplemented selector: ' + selector); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}
function browser() {
  const store = new Map(), writes = [], timers = new Map(), revoked = [], copies = [];
  let timerId = 0, urlId = 0, clipboard = async value => { copies.push(value); };
  const document = { createElement: tag => new Node(tag, document), createDocumentFragment: () => { const n = new Node('#fragment', document); n.isFragment = true; return n; } };
  const body = new Node('body', document); document.body = body; document.querySelector = selector => body.querySelector(selector);
  const sandbox = { document, console, Blob, URL: { createObjectURL: () => 'blob:' + ++urlId, revokeObjectURL: url => revoked.push(url) }, navigator: { clipboard: { writeText: value => clipboard(value) } }, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, String(v)); writes.push(k); } }, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), fetch: () => { networkCalls++; throw Error('No network allowed'); } };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  for (const file of ['catalogue.js', 'model.js', 'app.js']) vm.runInNewContext(read(path.join(folder, file)), sandbox, { filename: file, timeout: 1000 });
  const template = (html, owner = OWNER, embedded = true) => {
    const root = new Node('section', document); root.className = 'olympus-rank-planner' + (embedded ? ' rank-planner-embedded' : ''); root.setAttribute('data-olympus-rank-planner', ''); root.dataset.draftOwner = owner; root.dataset.plannerIdPrefix = embedded ? 'rank-planner-' : '';
    const markup = embedded ? html : JSON.parse(source.match(/const HTML = (".*");/)[1]);
    for (const [, tag, id] of markup.matchAll(/<(\w+)[^>]*\sid="([a-z-]+)"/g)) { const node = document.createElement(tag); node.id = id; root.append(node); }
    const $ = id => root.querySelector('#' + root.dataset.plannerIdPrefix + id);
    $('category').value = 'all'; $('sort').value = 'tier'; body.append(root);
    const label = text => root.all(n => n.tagName === 'BUTTON' && n.getAttribute('aria-label') === text)[0];
    const listeners = () => [root, ...root.all(() => true)].reduce((n, el) => n + Object.values(el.listeners).reduce((a, f) => a + f.length, 0), 0);
    return { root, $, label, listeners };
  };
  return { sandbox, document, store, writes, timers, revoked, copies, template, setClipboard: value => { clipboard = value; } };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

(async () => {
  await check('fragment and compatibility response retain method/schema/session/exact Admin gate', async () => {
    for (const render of [server.exports.rankPlannerPage, server.exports.rankPlannerFragmentPage]) {
      authCalls = 0; user = null;
      const post = await render(request('POST'), {}, true); assert.equal(post.status, 405); assert.equal(post.headers.get('Allow'), 'GET, HEAD'); assert.equal(authCalls, 0);
      assert.equal((await render(request(), {}, false)).status, 503); assert.equal(authCalls, 0);
      assert.equal((await render(request(), {}, true)).status, 401);
      user = { discord_id: OTHER }; assert.equal((await render(request(), {}, true)).status, 403);
      user = { discord_id: OWNER + 'x' }; assert.equal((await render(request(), {}, true)).status, 403);
      user = { discord_id: OWNER }; const head = await render(request('HEAD'), {}, true); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    }
  });
  user = { discord_id: OWNER };
  const response = await server.exports.rankPlannerFragmentPage(request(), {}, true), html = await response.text();
  await check('fragment is fixed authored markup with numeric owner, scoped IDs and no duplicate shell/resources', () => {
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok(html.includes('data-draft-owner="' + OWNER + '"')); assert.ok(html.includes('rank-planner-embedded'));
    assert.ok(html.includes('High Council Slot 2 · Treasurer Slot 3')); assert.ok(!html.includes('Treasurer Slot 2'));
    assert.ok(!/<(?:html|body|main|nav|script|style|link|iframe)\b/i.test(html)); assert.ok(!html.includes('brand-mark')); assert.ok(!html.includes('__PLANNER_OWNER__'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(ids.length, new Set(ids).size); assert.ok(ids.every(id => id.startsWith('rank-planner-')));
    for (const [, id] of html.matchAll(/\b(?:for|aria-labelledby)="([^"]+)"/g)) assert.ok(ids.includes(id), id);
  });
  await check('standalone uses the actual generic owner crest and250px social metadata while the fragment adds no second shell', async () => {
    const standalone = await server.exports.rankPlannerPage(request(), {}, true), page = await standalone.text();
    assert.equal(standalone.status, 200); assert.equal(standalone.headers.get('Cache-Control'), 'no-store');
    assert.ok(page.includes('<title>Olympus \u00b7 Rank planner</title>'));
    assert.ok(page.includes('<link rel="icon" href="/static/olympus-icon.png" type="image/png">'));
    assert.ok(page.includes('<img class="brand-mark" src="/static/olympus-icon.png"'));
    assert.ok(page.includes('<meta property="og:title" content="Olympus \u2014 World of Warcraft: Forever">'));
    assert.ok(page.includes('<meta property="og:image" content="https://olympus.roachcouncil.com/static/olympus-icon.png">'));
    for (const dimension of ['width', 'height']) assert.ok(page.includes('<meta property="og:image:' + dimension + '" content="250">'));
    assert.ok(!page.includes('/static/wow/icon-member-shield.png'));
    const metadata = (page.match(/<meta\b[^>]*>/g) || []).join('');
    assert.ok(!metadata.includes(OWNER)); assert.ok(!metadata.includes('/admin/ranks'));
    assert.ok(!/<(?:html|head|body|main|nav|script|style|link|iframe)\b/i.test(html));
    assert.ok(!html.includes('property="og:')); assert.ok(!html.includes('brand-mark'));
  });
  const b = browser(), Model = b.sandbox.OlympusStaffRankPlanner, catalogue = b.sandbox.OlympusStaffRankCatalogue.ranks, api = b.sandbox.OlympusRankPlanner;
  const p = b.template(html); let current = true, instance;
  await check('mount restores the exact account key and ten-slot Treasurer recommendation without touching shell', () => {
    const shell = b.document.createElement('input'); shell.id = 'search'; shell.value = 'shell stays unchanged'; b.document.body.append(shell);
    instance = api.mount(p.root, { owner: OWNER, isCurrent: () => current });
    const draft = JSON.parse(b.store.get(key(OWNER))); assert.equal(draft.ranks.length, 10); assert.equal(draft.ranks[1].id, 'highcouncil'); assert.equal(draft.review.liveChangesApplied, false);
    assert.equal(p.$('ladder-list').children.length, 10); assert.equal(shell.value, 'shell stays unchanged'); assert.deepEqual([...new Set(b.writes)], [key(OWNER)]);
  });
  await check('planner buttons preserve floor, ceiling, fixed GM and unprotected entry rank', async () => {
    assert.equal(p.label('Move Guild Master down').disabled, true);
    const staleCard = p.label('Review Treasurer in your ladder');
    await p.$('minimum').click(); const small = JSON.parse(b.store.get(key(OWNER))); assert.deepEqual(small.ranks.map(r => r.id), ['gm', 'initiate']);
    assert.equal(p.label('Remove Initiate').disabled, true); assert.equal(staleCard.listeners.click.length, 0);
    await p.label('Add Treasurer').click(); assert.equal(JSON.parse(b.store.get(key(OWNER))).ranks[1].id, 'treasurer');
    await p.$('recommended').click(); assert.equal(JSON.parse(b.store.get(key(OWNER))).ranks.length, 10); assert.equal(p.label('Add Crafter').disabled, true);
  });
  await check('export remains an unapproved JSON draft and opens only its own dialog', async () => {
    await p.$('export').click(); assert.equal(p.$('export-dialog').open, true); assert.equal(Model.importDraft(p.$('export-text').value, catalogue).review.liveChangesApplied, false);
    await p.label('Review Treasurer, rank 3').click(); assert.equal(p.$('editor').open, true); assert.ok(p.$('edit-name')); assert.ok(p.$('perm-auth').checked);
  });
  await check('destroy closes dialogs, removes all listeners/timers and revokes downloads without storage changes', async () => {
    await p.$('download').click(); const before = b.store.get(key(OWNER)); assert.ok(b.timers.size > 0); assert.equal(b.revoked.length, 0);
    instance.destroy(); instance.destroy(); assert.equal(p.$('editor').open, false); assert.equal(p.$('export-dialog').open, false); assert.equal(p.listeners(), 0); assert.equal(b.timers.size, 0); assert.deepEqual(b.revoked, ['blob:1']);
    await p.$('minimum').click(); assert.equal(b.store.get(key(OWNER)), before);
  });
  await check('historical account draft restores byte-for-byte; remount removes previous handlers', async () => {
    const legacy = read(path.join(__dirname, 'fixtures/rank-planner-v1.json')); b.store.set(key(OWNER), legacy);
    instance = api.mount(p.root, { owner: OWNER, isCurrent: () => current }); assert.equal(b.store.get(key(OWNER)), legacy); assert.ok(p.$('notices').textContent.includes('earlier draft is preserved'));
    const oldCount = p.$('recommended').listeners.click.length; instance = api.mount(p.root, { owner: OWNER }); assert.equal(oldCount, 1); assert.equal(p.$('recommended').listeners.click.length, 1); assert.equal(b.store.get(key(OWNER)), legacy);
  });
  await check('mismatched/missing/malformed account or markup is refused before storage', () => {
    const before = b.writes.length;
    assert.throws(() => api.mount(p.root, { owner: OTHER }), /account/);
    const invalid = b.template(html, '<script>'); assert.throws(() => api.mount(invalid.root), /account/);
    const absent = b.template(html); absent.$('export').remove(); assert.throws(() => api.mount(absent.root), /incomplete/);
    const wrongIds = b.template(html); wrongIds.root.dataset.plannerIdPrefix = '#shell'; assert.throws(() => api.mount(wrongIds.root), /markup/); assert.equal(b.writes.length, before);
  });
  await check('a second account cannot read or overwrite the previous account draft', async () => {
    const before = b.store.get(key(OWNER)), other = b.template(html, OTHER); const own = api.mount(other.root, { owner: OTHER });
    await other.$('minimum').click(); assert.equal(JSON.parse(b.store.get(key(OTHER))).ranks.length, 2); assert.equal(b.store.get(key(OWNER)), before); own.destroy();
  });
  await check('an obsolete mount does nothing; a render failure releases every partially registered listener', () => {
    const held = b.template(html), before = b.writes.length; const noOp = api.mount(held.root, { owner: OWNER, isCurrent: () => false });
    assert.equal(held.listeners(), 0); assert.equal(b.writes.length, before); noOp.destroy();
    const broken = b.template(html); broken.$('editor-content').replaceChildren = () => { throw Error('fixture-render-failure'); };
    assert.throws(() => api.mount(broken.root, { owner: OWNER }), /fixture-render-failure/); assert.equal(broken.listeners(), 0); assert.equal(b.timers.size, 0);
  });
  await check('import completing after destroy cannot mutate DOM/storage or clear a new account file input', async () => {
    const file = deferred(); p.$('import-file').files = [{ size: 10, text: () => file.promise }]; p.$('import-file').value = 'retained';
    const pending = p.$('import-file').fire('change'), before = b.store.get(key(OWNER)); instance.destroy(); file.resolve(Model.exportDraft(Model.createDraft(catalogue), catalogue)); await pending;
    assert.equal(b.store.get(key(OWNER)), before); assert.equal(p.$('import-file').value, 'retained');
  });
  await check('isCurrent and owner changes suppress stale file/clipboard success and rejection', async () => {
    for (const reject of [false, true]) {
      let live = true; instance = api.mount(p.root, { owner: OWNER, isCurrent: () => live });
      const file = deferred(); p.$('import-file').files = [{ size: 10, text: () => file.promise }]; const pending = p.$('import-file').fire('change'), before = b.store.get(key(OWNER)); live = false;
      if (reject) file.reject(Error('late read error')); else file.resolve(Model.exportDraft(Model.createDraft(catalogue), catalogue)); await pending; assert.equal(b.store.get(key(OWNER)), before); instance.destroy();
      instance = api.mount(p.root, { owner: OWNER }); const copy = deferred(); b.setClipboard(() => copy.promise); await p.$('export').click(); const copying = p.$('copy').click(); p.root.dataset.draftOwner = OTHER;
      if (reject) copy.reject(Error('late clipboard error')); else copy.resolve(); await copying; assert.equal(p.$('copy').textContent, 'Copy draft'); assert.ok(!p.$('export-text').selected); p.root.dataset.draftOwner = OWNER; instance.destroy();
    }
  });
  await check('current import still validates real model bytes and rejects forged live approval', async () => {
    instance = api.mount(p.root, { owner: OWNER }); const good = Model.exportDraft(Model.createDraft(catalogue, ['gm', 'initiate']), catalogue);
    p.$('import-file').files = [{ size: good.length, text: async () => good }]; await p.$('import-file').fire('change'); assert.equal(JSON.parse(b.store.get(key(OWNER))).ranks.length, 2);
    const bad = JSON.parse(good); bad.review.liveChangesApplied = true; const before = b.store.get(key(OWNER)); p.$('import-file').files = [{ size: 100, text: async () => JSON.stringify(bad) }]; await p.$('import-file').fire('change'); assert.equal(b.store.get(key(OWNER)), before); assert.ok(p.$('feedback').classList.contains('error')); instance.destroy();
  });
  await check('standalone auto-bootstrap compatibility is retained and mount script performs no markup or network writes', () => {
    const standalone = b.template('', OWNER, false); vm.runInNewContext(read(path.join(folder, 'app.js')), b.sandbox, { timeout: 1000 });
    // The first matching fixture is embedded; it must not auto-mount or acquire handlers.
    assert.equal(standalone.$('recommended').listeners.click?.length ?? 0, 0);
    const isolated = browser(), own = isolated.template('', OWNER, false); vm.runInNewContext(read(path.join(folder, 'app.js')), isolated.sandbox, { timeout: 1000 }); assert.equal(own.$('recommended').listeners.click.length, 1); isolated.sandbox.OlympusRankPlanner.mount(own.root).destroy();
    const app = read(path.join(folder, 'app.js')); assert.ok(!/\.innerHTML\s*[=+]|insertAdjacentHTML|outerHTML\s*=|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(app)); assert.equal(networkCalls, 0);
  });
  console.log(`\n${checks}/${checks} passed; network=${networkCalls}; no SQLite/Workerd/provider effects`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
