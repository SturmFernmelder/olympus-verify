// Owner items3/4/11, .169: actual public-source parser/cache/renderer; no provider calls or D1 writes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
let n = 0;
function check(name, condition) { assert.ok(condition, name); n++; console.log('PASS ' + name); }
const moduleObject = { exports: {} };
const source = fs.readFileSync(path.join(root, 'src/site-resources.ts'), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('module', 'exports', javascript)(moduleObject, moduleObject.exports);
const { loadResourceUpdates, resourcePublicCache, RESOURCE_FEED_LIMITS: limits } = moduleObject.exports;
const AT = Math.floor(Date.parse('2026-10-19T00:30:00Z') / 1000), DAY = 86400;
const ids = ['blizzard-notes', 'wowhead-forever', 'wowhead-blues'];
const hosts = { 'blizzard-notes': 'us.forums.blizzard.com', 'wowhead-forever': 'www.wowhead.com', 'wowhead-blues': 'www.wowhead.com' };
const idFor = url => url.includes('us.forums.blizzard.com') ? ids[0] : url.includes('blue-tracker') ? ids[2] : ids[1];
const item = (id, extra = '') => `<item><title>Current &amp; useful</title><link>https://${hosts[id]}/${id === ids[0] ? 'en/wow/t/notes/2360696/6' : 'news=383436/forever-news'}</link><pubDate>Sun, 18 Oct 2026 18:00:00 +0000</pubDate><category>Forever</category>${extra}</item>`;
const rss = body => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Publisher</title>${body}</channel></rss>`;
const response = body => new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
const fixtureFetch = async url => response(rss(item(idFor(url))));
const cacheOf = values => { const calls = { get: [], put: [] }; return { calls, async get(id) { calls.get.push(id); return values[id] ?? null; }, async put(id, value) { calls.put.push([id, value]); values[id] = value; } }; };
const saved = (id, age = 10, extra = {}) => ({ version: 1, sourceId: id, fetchedAt: AT - age, omittedItems: 0, items: [{ title: 'Prior public headline', url: `https://${hosts[id]}/prior`, publishedAt: AT - DAY }], ...extra });
const every = (result, predicate) => result.sources.length === 3 && result.sources.every(predicate);

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.parent = null; }
  append(...nodes) { for (const child of nodes) { this.children.push(child); child.parent = this; } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
  fire(name) { this.listeners[name]?.({ target: this }); }
}
const walk = element => [element, ...element.children.flatMap(walk)];
const textOf = element => walk(element).map(node => node.textContent).join(' ');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function renderer(fetcher) {
  const visibility = {}, intervals = new Map(), calls = [], document = { visibilityState: 'visible', createElement: tag => new Element(tag), addEventListener(name, fn) { visibility[name] = fn; }, removeEventListener(name, fn) { if (visibility[name] === fn) delete visibility[name]; } };
  let serial = 0;
  const window = {}, context = { window, document, URL, Date, Set, AbortController, console, fetch: async (...args) => { calls.push(args); return fetcher(...args); }, setInterval(fn, ms) { intervals.set(++serial, { fn, ms }); return serial; }, clearInterval(id) { intervals.delete(id); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/static/resources169.js'), 'utf8'), context, { filename: 'resources169.js' });
  return { api: window.OlympusResources, document, intervals, calls, hide() { document.visibilityState = 'hidden'; visibility.visibilitychange?.(); }, show() { document.visibilityState = 'visible'; visibility.visibilitychange?.(); } };
}

(async () => {
  let fetches = 0;
  const disabledCache = { async get() { throw Error('disabled cache access'); }, async put() { throw Error('disabled write'); } };
  const off = await loadResourceUpdates({ enabled: false, now: AT, cache: disabledCache, fetcher: async () => { fetches++; throw Error('disabled fetch'); } });
  check('disabled News performs zero publisher fetch and zero cache access', off.enabled === false && fetches === 0 && every(off, s => s.status === 'disabled' && s.items.length === 0 && s.checkedAt === null && s.fetchedAt === null));
  const calls = [], goodCache = cacheOf({});
  const good = await loadResourceUpdates({ enabled: true, now: AT, cache: goodCache, fetcher: async (url, init) => { calls.push([url, init]); return fixtureFetch(url); } });
  check('actual three-source parser returns attributed plain-text items and separate source dates', every(good, s => s.status === 'fresh' && s.fetchedAt === AT && s.checkedAt === AT && s.items[0].title === 'Current & useful' && s.items[0].publishedAt < AT && s.failure === null));
  check('only exact primary HTTPS feeds are fetched without credentials or redirects', calls.length === 3 && calls.every(([url, init]) => /^https:\/\//.test(url) && init.redirect === 'manual' && init.signal instanceof AbortSignal && Object.keys(init.headers).join() === 'Accept') && calls.some(([url]) => url.endsWith('blue-tracker?rss')) && calls.some(([url]) => url.includes('/2360696.rss')));
  check('cache receives only explicit public records, never request/auth fields', goodCache.calls.put.length === 3 && goodCache.calls.put.every(([id, value]) => ids.includes(id) && Object.keys(value).sort().join() === 'fetchedAt,items,omittedItems,sourceId,version' && Object.keys(value.items[0]).sort().join() === 'publishedAt,title,url'));
  const mixed = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async url => response(rss(item(idFor(url)) + item(idFor(url)).replace('<category>Forever</category>', '<category>Live</category>').replace('news=383436', 'news=1'))) });
  check('Forever filtering uses exact publisher category rather than /forever/ URL shape', mixed.sources[1].items.length === 1 && mixed.sources[1].items[0].url.includes('/news=383436/'));
  check('all-WoW blue tracker remains explicitly all-WoW', mixed.sources[2].items.length === 2 && mixed.sources[2].scope.includes('All-WoW'));
  const unsafe = ['http://www.wowhead.com/a', 'https://www.wowhead.com.evil.invalid/a', 'https://127.0.0.1/a', 'https://user:pass@www.wowhead.com/a', 'https://www.wowhead.com:444/a', 'javascript:alert(1)', '//www.wowhead.com/a', 'https://us.forums.blizzard.com/a'];
  const unsafeCalls = [];
  const rejected = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async url => { unsafeCalls.push(url); return response(rss(idFor(url) === ids[1] ? unsafe.map(link => item(ids[1]).replace(/<link>.*?<\/link>/, `<link>${link}</link>`)).join('') : item(idFor(url)))); } });
  check('SSRF, credentials, noncanonical ports and cross-publisher item URLs are omitted', rejected.sources[1].items.length === 0 && rejected.sources[1].omittedItems === unsafe.length);
  check('unsafe item URLs never become additional network fetches', unsafeCalls.length === 3 && unsafeCalls.every(url => calls.some(([fixed]) => url === fixed)));
  const many = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async url => response(rss(Array.from({ length: 20 }, (_, i) => item(idFor(url)).replace('Current &amp; useful', '<![CDATA[<b>' + 'x'.repeat(300) + '</b>]]>').replace(/<link>.*?<\/link>/, `<link>https://${hosts[idFor(url)]}/${i}</link>`)).join(''))) });
  check('titles are plain text capped at240 and each source returns at most12 items', every(many, s => s.items.length === 12 && s.items.every(x => x.title.length === 240 && !/[<>]/.test(x.title))));
  const noDate = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async url => response(rss(item(idFor(url)).replace(/<pubDate>.*?<\/pubDate>/, ''))) });
  check('missing publisher date remains null rather than navigation time', every(noDate, s => s.items[0].publishedAt === null));
  for (const badDate of ['tomorrow', 'Mon, 19 Oct 2037 18:00:00 +0000']) {
    const out = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async url => response(rss(item(idFor(url)).replace(/<pubDate>.*?<\/pubDate>/, `<pubDate>${badDate}</pubDate>`))) });
    check(`invalid/future publisher date is omitted: ${badDate}`, every(out, s => s.items.length === 0 && s.omittedItems === 1));
  }
  for (const [name, body] of [['unclosed', '<rss><channel><item>'], ['mismatched', '<rss><channel></rss></channel>'], ['external DTD', '<!DOCTYPE rss SYSTEM "https://evil.invalid/schema"><rss><channel/></rss>'], ['entity declaration', '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///private">]><rss><channel/></rss>'], ['unknown entity', rss('<item><title>&external;</title></item>')], ['invalid numeric entity', rss('<item><title>&#xD800;</title></item>')], ['multiple roots', '<rss><channel/></rss><rss><channel/></rss>']]) {
    const out = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => response(body) });
    check(`malformed/unsafe XML fails closed: ${name}`, every(out, s => s.status === 'unavailable' && s.failure === 'malformed' && s.items.length === 0 && s.fetchedAt === null));
  }
  const html = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => new Response('<html>challenge</html>', { headers: { 'Content-Type': 'text/html' } }) });
  check('publisher HTML challenges are not treated as a fresh feed', every(html, s => s.failure === 'content_type' && s.fetchedAt === null));
  const redirect = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.invalid/' } }) });
  check('redirects are refused without following Location', every(redirect, s => s.failure === 'redirect'));
  const large = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => new Response('x', { headers: { 'Content-Type': 'application/xml', 'Content-Length': String(limits.bytes + 1) } }) });
  check('oversized Content-Length is refused', every(large, s => s.failure === 'too_large'));
  let cancelled = 0;
  const streaming = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(limits.bytes + 1)); }, cancel() { cancelled++; return new Promise(() => {}); } })) });
  check('streamed byte cap cancels without waiting for an unacknowledged cancellation', cancelled === 3 && every(streaming, s => s.failure === 'too_large'));
  const invalidUtf8 = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => response(new Uint8Array([0xc3, 0x28])) });
  check('invalid UTF8 is refused instead of replacement-character parsing', every(invalidUtf8, s => s.failure === 'malformed'));
  let cacheFetches = 0;
  const cached = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf(Object.fromEntries(ids.map(id => [id, saved(id)]))), fetcher: async () => { cacheFetches++; throw Error('fresh cache must not fetch'); } });
  check('fresh public cache reuses actual prior retrieval time without faking a new check', cacheFetches === 0 && every(cached, s => s.status === 'fresh' && s.fetchedAt === AT - 10 && s.checkedAt === AT - 10));
  const stale = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf(Object.fromEntries(ids.map(id => [id, saved(id, 601)]))), fetcher: async () => new Response(null, { status: 503 }) });
  check('failed refresh labels retained headlines stale and preserves successful retrieval timestamp', every(stale, s => s.status === 'stale' && s.fetchedAt === AT - 601 && s.checkedAt === AT && s.failure === 'upstream' && s.items.length === 1));
  const expired = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf(Object.fromEntries(ids.map(id => [id, saved(id, DAY + 1)]))), fetcher: async () => { throw Error('network unavailable'); } });
  check('public cache older than one day cannot appear as current or stale content', every(expired, s => s.status === 'unavailable' && s.fetchedAt === null && s.items.length === 0));
  const corrupt = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf(Object.fromEntries(ids.map(id => [id, saved(id, 1, { sourceId: 'other', cookie: 'never-project' })]))), fetcher: fixtureFetch });
  check('wrong-source cache records are discarded and re-fetched', every(corrupt, s => s.items[0].title === 'Current & useful' && !JSON.stringify(s).includes('never-project')));
  const cacheWrites = [], adapter = resourcePublicCache({ async match() { return null; }, async put(key, value) { cacheWrites.push({ key, value: await value.json(), headers: value.headers }); } });
  await adapter.put(ids[0], saved(ids[0]));
  check('Cache API keys contain only the fixed public-source ID and no member request', cacheWrites[0].key.url === 'https://olympus.roachcouncil.com/__public-publisher-headlines169/blizzard-notes' && !cacheWrites[0].headers.has('Set-Cookie') && cacheWrites[0].headers.get('Cache-Control').includes('public'));

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/static/resources169.json'), 'utf8'));
  check('catalog covers21 curated addons,12 guide sources and6 news/discovery sources', catalog.version === 1 && catalog.addons.length === 21 && catalog.guides.length === 12 && catalog.newsSources.length === 6);
  check('catalog explicitly disclaims exhaustive inventory and independent compatibility qualification', /not every addon/.test(catalog.disclaimer) && /not.*guarantee of in-game compatibility/.test(catalog.disclaimer));
  check('every addon carries publisher identity, rationale, advertised client/release and limits', catalog.addons.every(a => a.id && a.name && a.category && a.rationale && a.status && a.version && /^2026-10-\d{2}$/.test(a.releasedAt) && a.gameBuild.includes('Forever') && a.sourceKind && a.limitations.length && new URL(a.url).protocol === 'https:'));
  check('all catalog IDs are unique and guide provisional boundaries remain explicit', new Set([...catalog.addons, ...catalog.guides, ...catalog.newsSources].map(x => x.id)).size === 39 && catalog.guides.every(g => g.scope && g.status && g.sourceKind && g.limitations.length) && catalog.guides.find(g => g.id === 'wow-professions').limitations.some(x => /untested/.test(x)));
  check('Blizzard News is direct-link only and forums are not mislabelled all-official', catalog.newsSources.find(s => s.id === 'blizzard-news').status === 'Direct link only' && /not every topic/.test(catalog.newsSources.find(s => s.id === 'blizzard-forum').scope));
  check('source adapter has no database, cron, schema, settings or credential dependencies', !/env\.DB|site_settings|COOKIE_SECRET|Authorization:|registerCommunityData|scheduled\(/.test(source));

  const r = renderer(async url => { assert.equal(url, '/static/resources169.json'); return Response.json(catalog); }), holder = new Element('div');
  const mounted = r.api.mount(holder, { view: 'addons' }); await settle();
  check('actual renderer mounts catalog cards through text nodes and original safe links', walk(holder).filter(x => x.tagName === 'ARTICLE').length === 21 && textOf(holder).includes('Author lists Forever') && walk(holder).filter(x => x.tagName === 'A').every(x => x.href.startsWith('https://') && x.rel === 'noopener noreferrer'));
  const search = walk(holder).find(x => x.tagName === 'INPUT' && x.type === 'search'); search.value = 'Syndicator'; search.fire('input');
  check('catalog search includes documented dependency/limitation text', walk(holder).filter(x => x.tagName === 'ARTICLE').length === 1 && textOf(holder).includes('Baganator'));
  const select = walk(holder).find(x => x.tagName === 'SELECT'); search.value = ''; select.value = 'Forever discoveries'; select.fire('change');
  check('category filter exposes8 reviewed Forever-focused discoveries', walk(holder).filter(x => x.tagName === 'ARTICLE').length === 8);
  mounted.destroy(); check('unmount removes the view and leaves no polling timer', holder.children.length === 0 && r.intervals.size === 0);
  const u = renderer(async url => { assert.equal(url, '/api/resource-updates'); return Response.json(good); }), updateHolder = new Element('div');
  const updates = u.api.mount(updateHolder, { view: 'updates' }); await settle();
  check('updates render separate actual retrieval/attempt/publisher dates and3 source filters', textOf(updateHolder).includes('Last successful retrieval:') && textOf(updateHolder).includes('Last retrieval attempt:') && textOf(updateHolder).includes('Published:') && walk(updateHolder).filter(x => x.type === 'checkbox').length === 3);
  check('only visible updates view schedules exactly60second refresh', u.intervals.size === 1 && [...u.intervals.values()][0].ms === 60000 && u.calls.length === 1);
  walk(updateHolder).find(x => x.type === 'checkbox').checked = false; walk(updateHolder).find(x => x.type === 'checkbox').fire('change');
  check('source checkbox filters headlines without fetching or changing source freshness', walk(updateHolder).filter(x => x.tagName === 'ARTICLE').length === 2 && u.calls.length === 1);
  u.hide(); check('hidden view stops polling immediately', u.intervals.size === 0);
  u.show(); await settle(); check('visible view resumes one bounded same-origin source read', u.calls.length === 2 && u.intervals.size === 1 && u.calls.every(([url, init]) => url === '/api/resource-updates' && init.cache === 'no-store' && init.credentials === 'same-origin'));
  updates.destroy(); check('updates destroy stops polling and aborts its controller', u.intervals.size === 0 && updateHolder.children.length === 0);
  let refusedStatus = 0;
  const denied = renderer(async () => new Response(null, { status: 403 })), deniedHolder = new Element('div');
  denied.api.mount(deniedHolder, { view: 'updates', onRefused(status) { refusedStatus = status; } }); await settle();
  check('fresh server refusal invokes root handler, removes data and stops auto polling', refusedStatus === 403 && denied.intervals.size === 0 && walk(deniedHolder).filter(x => x.tagName === 'ARTICLE').length === 0);
  let pendingSignal;
  const pending = renderer((_url, init) => { pendingSignal = init.signal; return new Promise(() => {}); }), pendingHolder = new Element('div');
  const pendingMount = pending.api.mount(pendingHolder, { view: 'updates' }); await settle(); pending.hide();
  check('visibility loss aborts an active update read without waiting for its reply', pendingSignal.aborted && pending.intervals.size === 0); pendingMount.destroy();
  const unsafeCatalog = structuredClone(catalog); unsafeCatalog.addons[0].url = 'javascript:alert(1)';
  const unsafeUi = renderer(async () => Response.json(unsafeCatalog)), unsafeHolder = new Element('div'); unsafeUi.api.mount(unsafeHolder, { view: 'addons' }); await settle();
  check('catalog renderer refuses unsafe source URLs instead of constructing an active link', walk(unsafeHolder).filter(x => x.tagName === 'A').length === 0 && textOf(unsafeHolder).includes('could not be loaded'));

  const began = performance.now(); let timeoutCancels = 0;
  const timed = await loadResourceUpdates({ enabled: true, now: AT, cache: cacheOf({}), fetcher: async () => response(new ReadableStream({ cancel() { timeoutCancels++; return new Promise(() => {}); } })) });
  const elapsed = performance.now() - began;
  check('fixed8second deadline includes a hung body and unacknowledged cancellation', limits.timeoutMs === 8000 && elapsed >= 8000 && elapsed < 11000 && timeoutCancels === 3 && every(timed, s => s.failure === 'timeout' && s.status === 'unavailable'));
  console.log(`\n${n}/${n} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
