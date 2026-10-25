// Actual finite generator, public policy responder and viewer; pure/minimal DOM, no D1/Workerd/provider.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript'), { pathToFileURL } = require('node:url');
const worker = path.join(__dirname, '..'), repo = path.join(worker, '..'), read = file => fs.readFileSync(file, 'utf8');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
let checks = 0, fetches = 0, navigationReads = 0, allowNavigationRead = false, navigationUser = null, navigationFailure = false;
const check = async (name, run) => { await run(); checks++; console.log('PASS ' + name); };
const cache = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (name === 'site-core') return { securityHeaders: headers => { headers.set('Cache-Control','no-store, no-transform'); return headers; }, SESSION_COOKIE: '__Host-olg', currentUser: async () => { navigationReads++; if (!allowNavigationRead) throw Error('Public legal reader may not authenticate'); if (navigationFailure) throw Error('Fixture privacy hold'); return navigationUser; } };
  if (name === 'site-brand') return { olympusSocialMetadata: () => '' };
  assert.ok(['policies', 'policy-content', 'policy-render', 'member-legal-navigation'].includes(name), name);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const compiled = ts.transpileModule(read(path.join(worker, 'src', name + '.ts')), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal(compiled.diagnostics.length, 0); new Function('module', 'exports', 'require', compiled.outputText)(module, module.exports, load); return module.exports;
}
class Node {
  constructor(tag, document, text) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.nodeType = tag.toLowerCase() === '#text' ? 3 : 1; this.data = text || ''; this.children = []; this.parentNode = null; this.attributes = {}; this.listeners = {}; this.className = ''; this.id = ''; }
  get childNodes() { return this.children; }
  get textContent() { return this.nodeType === 3 ? this.data : this.children.map(n => n.textContent).join(''); }
  set textContent(text) { this.replaceChildren(); if (text) this.append(new Node('#text', this.ownerDocument, String(text))); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children.forEach(n => n.parentNode = null); this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; } }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return name === 'id' ? this.id || null : this.attributes[name] ?? null; }
  all(predicate) { return this.children.flatMap(n => [...(predicate(n) ? [n] : []), ...n.all(predicate)]); }
  querySelectorAll(selector) { return this.all(n => selector === 'main' ? n.tagName === 'MAIN' : selector === 'main#policy-content' ? n.tagName === 'MAIN' && n.id === 'policy-content' : selector === '[id]' ? !!n.id : selector === 'a[href]' ? n.tagName === 'A' && n.getAttribute('href') !== null : selector.startsWith('#') ? n.id === selector.slice(1) : false); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  fire(type, event) { for (const fn of (this.listeners[type] || []).slice()) fn(event); }
  scrollIntoView() { this.scrolled = true; }
  focus() { this.focused = true; }
}
function browser(fetch) {
  const requests = [], parses = [], imported = [], document = { createElement: tag => new Node(tag, document) };
  document.importNode = (source, deep) => { imported.push(source.tagName); const copy = new Node(source.tagName, document, source.data); for (const [k, v] of Object.entries(source.attributes)) copy.setAttribute(k, v); if (deep) for (const child of source.childNodes) copy.append(document.importNode(child, true)); return copy; };
  class Parser {
    parseFromString(html, kind) {
      parses.push(html); assert.equal(kind, 'text/html');
      const parsed = new Node('document', document), stack = [parsed];
      for (const token of html.replace(/<!--[^]*?-->/g, '').match(/<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('</')) { stack.pop(); continue; }
        if (token.startsWith('<')) { const [, name, attrs] = /^<([a-z0-9]+)([^>]*)>$/.exec(token); const node = document.createElement(name); for (const [, k, v] of attrs.matchAll(/([a-z-]+)="([^"]*)"/g)) node.setAttribute(k, v); stack.at(-1).append(node); if (name !== 'br') stack.push(node); }
        else stack.at(-1).append(new Node('#text', document, token));
      }
      return parsed;
    }
  }
  const sandbox = { AbortController, TextDecoder, Object, DOMParser: Parser, fetch: (...args) => { requests.push(args); fetches++; return fetch(...args); } }; sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(read(path.join(worker, 'public/static/legal-view196.js')), sandbox, { timeout: 1000 });
  const root = document.createElement('div');
  return { api: sandbox.OlympusLegalView, root, requests, parses, imported, document };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const reply = text => new Response(text, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

(async () => {
  const generator = await import(pathToFileURL(path.join(worker, 'scripts/build-policy-content.v116.mjs')).href), grammar = await import(pathToFileURL(path.join(worker, 'scripts/policy-slots.mjs')).href);
  const generated = generator.build(), content = load('policy-content'), policies = load('policies'), canonical = {};
  for (const kind of ['privacy', 'terms']) canonical[kind] = await policies.policyResponse(new Request('https://olympus.roachcouncil.com/legal/' + kind), '/legal/' + kind).text();
  await check('canonical source, generated legal documents and mirrors agree; both slots and BNET OFF remain exact', () => {
    assert.deepEqual(generator.run(true), { policyVersion: generated.version, mirrors: 3, bnetLogin: 'OFF', publication: false });
    for (const kind of ['privacy', 'terms']) { const source = read(path.join(repo, 'policies', kind + '.html')); assert.equal(source, read(path.join(repo, kind + '.html'))); assert.deepEqual(grammar.slots(source).map(s => s.name), ['ACCOUNT_CONTROLS', 'BNET_LOGIN']); const slot = grammar.slots(source).find(s => s.name === 'BNET_LOGIN'); assert.equal(source.split('\n').slice(slot.start + 1, slot.end).join('\n'), ''); assert.equal((source.match(/See also the/g)||[]).length,kind==='terms'?1:0); if(kind==='terms'){const related='<p class="meta related">See also the <a href="./privacy.html">Privacy Policy</a> for account data and erasure limits.</p>';assert.equal(source.split(related).length,2);assert.ok(canonical[kind].includes(related.replace('href="./privacy.html"','href="/legal/privacy"')));} assert.ok(!canonical[kind].includes('aria-label="Policies"')); assert.ok(canonical[kind].includes('src="/static/olympus-icon.png"')); assert.ok(!canonical[kind].includes('<img src="/static/wow/icon-shield.png"')); }
    assert.equal(content.PRIVACY_DESCRIBES_BNET_LOGIN, false);
  });
  await check('canonical legal navigation never authenticates or redirects; signed-in SPA viewing is explicit enhancement only', async () => {
    const navigation=load('member-legal-navigation').memberLegalNavigation, env={}, before=navigationReads;
    assert.equal(await navigation(new Request('https://guild.example/legal/privacy'),env,'/legal/privacy'),null);
    assert.equal(navigationReads,before);
    allowNavigationRead=true; navigationUser={in_server:1,denied:0};
    for(const kind of ['privacy','terms']) for(const method of ['GET','HEAD']) {
      const request=new Request('https://guild.example/legal/'+kind+'?ignored=private',{method,headers:{Cookie:'__Host-olg=fixture'}});
      assert.equal(await navigation(request,env,'/legal/'+kind),null);
      const r=policies.policyResponse(request,'/legal/'+kind);
      assert.equal(r.status,200); assert.equal(r.headers.get('Location'),null); assert.ok(!r.headers.has('Set-Cookie'));
      assert.equal(r.headers.get('Cache-Control'),'no-store, no-transform'); assert.ok(r.headers.get('Content-Security-Policy').includes("script-src 'none'"));
      assert.equal(await r.text(),method==='HEAD'?'':canonical[kind]);
    }
    for(const user of [null,{in_server:0,denied:0},{in_server:1,denied:1}]) { navigationUser=user; assert.equal(await navigation(new Request('https://guild.example/legal/privacy',{headers:{Cookie:'__Host-olg=fixture'}}),env,'/legal/privacy'),null); }
    navigationUser={in_server:1,denied:0}; navigationFailure=true; assert.equal(await navigation(new Request('https://guild.example/legal/privacy',{headers:{Cookie:'__Host-olg=fixture'}}),env,'/legal/privacy'),null); navigationFailure=false;
    const reads=navigationReads; assert.equal(await navigation(new Request('https://guild.example/privacy/access',{headers:{Cookie:'__Host-olg=fixture'}}),env,'/privacy/access'),null); assert.equal(navigationReads,reads); assert.equal(navigationReads,before); allowNavigationRead=false;
  });
  await check('existing Native/Link conditions, erasure limitations and copy treatment are byte-identical', () => {
    const privacy = read(path.join(repo, 'policies/privacy.html'));
    for (const [start, end, hash] of [
      ['<h2>Councillor browser verification</h2>', '<h2>Getting rid of it</h2>', '96ccb507c6ecc091da4a21bde9f2210bc6d94e3f0e08c5c59dba59c3f0337a98'],
      ['<h2>Getting rid of it</h2>', '<h2>Your copy</h2>', '7eda56a2a374069ce376defadf74fae750c62e4a9cf38231775c6443e6d7f1f5'],
      ['<h2>Your copy</h2>', '<h2>Contact</h2>', 'f73fd3367bae414d4d83c174220f1fd3eb44cd5f8bec101c4c5830653a60923e'],
    ]) {
      let selected=privacy.slice(privacy.indexOf(start),privacy.indexOf(end));
      if(start==='<h2>Getting rid of it</h2>'){
        const explicitSafetyPurpose="Its purpose is to recognize the same account if it tries to evade that original guild-application or membership rejection after erasure. It is a keyed, pseudonymous safety record, not anonymous data or a guarantee of complete account unlinking. ";
        assert.equal(sha(selected),'dd77ba14c9db0883863a3c3d5d9e0052807d9b449ba39ad7f5a47dd1a5fca7c6');
        assert.equal(selected.split(explicitSafetyPurpose).length,2);
        selected=selected.replace(explicitSafetyPurpose,'');
      }
      assert.equal(sha(selected),hash);
    }
    assert.ok(privacy.includes('Rich Campbell')); assert.ok(privacy.includes('on behalf of Asmongold and Rich Campbell'));
  });
  await check('new disclosures distinguish Olympus-only default directory, opt-out, opt-in details and private talent code', () => {
    const privacy = read(path.join(repo, 'policies/privacy.html'));
    for (const phrase of ['configured Olympus membership or rank role', 'may opt out of the listing', 'extra self-published profile details remain opt-in', 'does not create a new stored Discord roster or picture archive', 'For supported native-rank listings and extended-office appointments', 'not published on the voting board or member directory', 'current appointment proof, an admitted account session']) assert.ok(privacy.toLowerCase().includes(phrase.toLowerCase()), phrase);
    assert.ok(!privacy.includes('For the Co-Guild Master and Treasurer only')); assert.ok(!privacy.includes('sent to Fernmelder')); assert.ok(privacy.includes('including if you never registered here')); assert.ok(privacy.includes('without creating an account or changing a Discord role')); assert.ok(!privacy.includes('An appointment gives no powers in the bot, the site or Discord.'));
    assert.ok(!/never your\s+Discord picture/.test(privacy)); assert.ok(!privacy.includes("Voting-board cards continue to use the game's icons."));
    for (const phrase of ['Administrator application views may show the applicant’s stored Discord picture', 'Voting-board cards show that picture only after the applicant separately opts in', 'beside the game’s class icon', 'explicitly confirm that one revision', 'no blind resend', 'no extra notice-body copy or webhook token', '366 days', 'Tithe Payer (25 gold)', 'Patron of the Treasury (100 gold)', 'Benefactor of Olympus (500 gold)', 'actual current Discord role']) assert.ok(privacy.includes(phrase), phrase);
  });
  await check('actual public responder retains script-free CSP, no cookie/session, GET/HEAD and old-route 410', async () => {
    for (const kind of ['privacy', 'terms']) { const url = '/legal/' + kind, response = policies.policyResponse(new Request('https://olympus.roachcouncil.com' + url), url); assert.equal(response.status, 200); assert.ok(response.headers.get('Content-Security-Policy').includes("script-src 'none'")); assert.ok(response.headers.get('Content-Security-Policy').includes("connect-src 'none'")); assert.equal(response.headers.get('Set-Cookie'), null); assert.equal(await policies.policyResponse(new Request('https://olympus.roachcouncil.com' + url, { method: 'HEAD' }), url).text(), ''); assert.equal(policies.policyResponse(new Request('https://olympus.roachcouncil.com' + url, { method: 'POST' }), url).status, 405); }
    for (const url of ['/privacy', '/terms']) { const response = policies.policyResponse(new Request('https://olympus.roachcouncil.com' + url), url); assert.equal(response.status, 410); assert.equal(await response.text(), ''); assert.equal(response.headers.get('Location'), null); }
  });
  const b = browser(async () => reply(canonical.privacy));
  await check('finite viewer validator accepts actual canonical and decorated text for each matching kind only', () => {
    for (const kind of ['privacy', 'terms']) { assert.ok(b.api.validatePolicyText(content.policyDocument('/legal/' + kind), kind).startsWith('<main id="policy-content"')); assert.ok(b.api.validatePolicyText(canonical[kind], kind).includes('On this page')); assert.throws(() => b.api.validatePolicyText(canonical[kind], kind === 'privacy' ? 'terms' : 'privacy')); }
    const related=b.api.validatePolicyText(canonical.terms,'terms');assert.ok(related.includes('<p class="meta related">See also the <a href="/legal/privacy">Privacy Policy</a>'));assert.ok(!related.includes('aria-label="Policies"'));
  });
  await check('executable/resource elements, event handlers, unsafe URLs, ambiguous roots and parser tricks are refused before parsing', async () => {
    const bad = ['<script>alert(1)</script>', '<style>body{}</style>', '<link rel="stylesheet" href="/static/app.css">', '<img src="/privacy/account">', '<iframe src="/privacy/account"></iframe>', '<object></object>', '<svg></svg>', '<math></math>', '<template></template>', '<form></form>', '<input>', '<video></video>', '<base href="/">', '<p onclick="bad()">x</p>', '<p style="color:red">x</p>', '<a href="javascript:bad()">x</a>', '<a href="data:text/html,x">x</a>', '<a href="//example.com">x</a>', '<a href="https://olympus.roachcouncil.com/privacy/access?account=x">x</a>', '<a href="&#106;avascript:x">x</a>', '<p class="meta" class="meta">x</p>', '<!--><img src="/privacy/account">-->', '<!-- x --!><img src="/privacy/account">-->', '<span id="policy-section-1"></span>', '<a href="#policy-section-999999">x</a>', '<p><strong>x</p></strong>', '<h1>Privacy Policy</h1>'];
    for(const unsafeRelated of ['<p class="meta related extra">x</p>','<p class="related meta">x</p>','<a href="/legal/privacy?account=x">x</a>','<a href="/legal/terms#private">x</a>','<a href="https://evil.example/legal/privacy">x</a>','<a href="https://olympus.roachcouncil.com/legal/privacy">x</a>','<a href="./privacy.html">x</a>'])bad.push(unsafeRelated);
    for (const attack of bad) assert.throws(() => b.api.validatePolicyText(canonical.privacy.replace('</main>', attack + '</main>'), 'privacy'), attack);
    assert.throws(() => b.api.validatePolicyText(canonical.privacy + '<main></main>', 'privacy')); assert.throws(() => b.api.validatePolicyText(canonical.privacy.replace('id="policy-content"', 'id="other"'), 'privacy'));
    assert.equal(b.parses.length, 0); assert.equal(b.requests.length, 0);
    const hostile = browser(async () => reply(canonical.privacy.replace('</main>', '<img src="/privacy/account"></main>'))), instance = hostile.api.mount(hostile.root, { kind: 'privacy' }); await instance.ready; assert.equal(hostile.parses.length, 0); assert.equal(hostile.imported.length, 0); assert.ok(hostile.root.textContent.includes('could not be opened')); instance.destroy();
  });
  let live = true, instance;
  await check('mount fetches one fixed public URL without cookies/query/referrer and imports only validated main children', async () => {
    const shell = b.document.createElement('header'); shell.textContent = 'Existing shell'; b.root.append(shell);
    instance = b.api.mount(b.root, { kind: 'privacy', isCurrent: () => live }); await instance.ready;
    assert.equal(b.requests.length, 1); const [url, settings] = b.requests[0]; assert.equal(url, '/legal/privacy'); assert.equal(settings.credentials, 'omit'); assert.equal(settings.redirect, 'error'); assert.equal(settings.referrerPolicy, 'no-referrer'); assert.equal(settings.cache, 'no-store'); assert.equal(settings.headers, undefined); assert.equal(settings.body, undefined);
    assert.equal(b.parses.length, 1); assert.ok(b.parses[0].startsWith('<main id="policy-content"')); assert.ok(!b.parses[0].includes('<head')); assert.ok(!b.imported.includes('MAIN')); assert.ok(!b.imported.includes('IMG')); assert.equal(shell.textContent, 'Existing shell');
    const article = b.root.all(n => n.tagName === 'ARTICLE')[0]; assert.equal(article.className, 'frame gold parchment legal-paper196'); assert.ok(article.textContent.includes('Privacy Policy'));
  });
  await check('contents navigation scrolls within the imported article without replacing the SPA hash', () => {
    const article = b.root.all(n => n.tagName === 'ARTICLE')[0], link = article.querySelectorAll('a[href]').find(a => a.getAttribute('href').startsWith('#')); let prevented = false;
    article.fire('click', { target: link, preventDefault() { prevented = true; } }); const target = article.querySelector(link.getAttribute('href')); assert.ok(prevented && target.scrolled && target.focused); assert.ok(target.id.startsWith('legal196-privacy-'));
    instance.destroy(); assert.equal(article.listeners.click.length, 0); assert.equal(b.root.textContent, 'Existing shell'); assert.equal(b.requests[0][1].signal.aborted, true);
  });
  await check('destroy aborts a pending fetch; late response cannot parse/import or alter the shell', async () => {
    const wait = deferred(), pending = browser(() => wait.promise), controller = pending.api.mount(pending.root, { kind: 'terms' }); controller.destroy(); wait.resolve(reply(canonical.terms)); await controller.ready; assert.equal(pending.parses.length, 0); assert.equal(pending.root.children.length, 0); assert.equal(pending.requests[0][1].signal.aborted, true);
  });
  await check('destroy cancels an active body reader and stale route admission suppresses content', async () => {
    let cancelled = 0; const started = deferred(), stream = new ReadableStream({ cancel() { cancelled++; } }), response = new Response(stream, { headers: { 'Content-Type': 'text/html' } });
    const getReader = response.body.getReader.bind(response.body); response.body.getReader = () => { const reader = getReader(); started.resolve(); return reader; };
    const waiting = browser(async () => response), controller = waiting.api.mount(waiting.root, { kind: 'privacy' }); await started.promise; controller.destroy(); await controller.ready; assert.equal(cancelled, 1); assert.equal(waiting.parses.length, 0);
    const wait = deferred(), stale = browser(() => wait.promise); let current = true; const held = stale.api.mount(stale.root, { kind: 'privacy', isCurrent: () => current }); current = false; wait.resolve(reply(canonical.privacy)); await held.ready; assert.equal(stale.parses.length, 0); assert.equal(stale.root.children.length, 0);
  });
  await check('oversized declared/streamed bodies, bad encoding/type/status, redirect and request errors remain plain failures', async () => {
    const responses = [new Response('x', { headers: { 'Content-Type': 'text/html', 'Content-Length': '256001' } }), new Response(new Uint8Array(256001), { headers: { 'Content-Type': 'text/html' } }), new Response(Uint8Array.of(0xff), { headers: { 'Content-Type': 'text/html' } }), new Response('x', { headers: { 'Content-Type': 'application/json' } }), new Response('x', { status: 503 }), { status: 200, redirected: true, headers: new Headers({ 'Content-Type': 'text/html' }) }];
    for (const response of responses) { const failed = browser(async () => response), controller = failed.api.mount(failed.root, { kind: 'privacy' }); await controller.ready; assert.equal(failed.parses.length, 0); assert.ok(failed.root.textContent.includes('could not be opened')); assert.equal(failed.requests[0][1].signal.aborted, true); controller.destroy(); }
    const failed = browser(async () => { throw Error('server internals must not be reflected'); }), controller = failed.api.mount(failed.root, { kind: 'terms' }); await controller.ready; assert.ok(!failed.root.textContent.includes('internals')); controller.destroy();
  });
  await check('remount disposes the prior reader; invalid kinds and already obsolete routes fetch nothing', async () => {
    const reuse = browser(async url => reply(canonical[url.endsWith('terms') ? 'terms' : 'privacy'])); const first = reuse.api.mount(reuse.root, { kind: 'privacy' }); await first.ready; const previousArticle = reuse.root.all(n => n.tagName === 'ARTICLE')[0]; const second = reuse.api.mount(reuse.root, { kind: 'terms' }); await second.ready; assert.equal(previousArticle.listeners.click.length, 0); assert.ok(reuse.root.textContent.includes('Terms of Service')); assert.ok(!reuse.root.textContent.includes('Current Olympus Discord directory')); second.destroy();
    const before = reuse.requests.length; for (const kind of ['__proto__', 'Privacy', '/legal/privacy?x', '', undefined]) assert.throws(() => reuse.api.mount(reuse.root, { kind })); assert.equal(reuse.requests.length, before); const obsolete = reuse.api.mount(reuse.root, { kind: 'privacy', isCurrent: () => false }); await obsolete.ready; assert.equal(reuse.requests.length, before);
  });
  await check('policy grammar permits only the two declared local crest assets and retains strict slot grammar', () => {
    const brandMeta = '<meta property="og:image" content="https://olympus.roachcouncil.com/static/olympus-icon.png">';
    assert.equal(grammar.validateHtml('<html><head>' + brandMeta + '</head><main></main></html>'), true);
    for (const invalid of ['<html><main>' + brandMeta + '</main></html>', '<html><head>' + brandMeta.replace('olympus.roachcouncil.com', 'evil.example') + '</head></html>', '<html><head>' + brandMeta.replace('olympus-icon.png', 'olympus-icon.png?account=private') + '</head></html>']) assert.throws(() => grammar.validateHtml(invalid));
    for (const icon of ['/static/wow/icon-shield.png', '/static/olympus-icon.png']) assert.equal(grammar.validateHtml('<html><main><img src="' + icon + '"></main></html>'), true);
    for (const icon of ['/static/other.png', 'https://cdn.example/crest.png', 'data:image/png,x']) assert.throws(() => grammar.validateHtml('<html><main><img src="' + icon + '"></main></html>'));
    assert.throws(() => grammar.fillSlots(read(path.join(repo, 'policies/privacy.html')), { ACCOUNT_CONTROLS: '', BNET_LOGIN: '', EXTRA: '' }));
  });
  console.log(`\n${checks}/${checks} passed; ${fetches} fixture-only fixed-route fetches; no actual network/SQLite/Workerd/provider effects`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
