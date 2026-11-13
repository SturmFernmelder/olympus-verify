'use strict';
// Evergreen 12 Nov 2026 follow-up: the owner's two rulings of 13 November 2026.
//   CL2-074 (login art): WebP copies of the two approved login stills, served to browsers that support WebP through
//     <source type="image/webp"> entries ahead of the PNG sources; the PNGs stay the fallback and are unchanged.
//   CL2-175 (name entry): Blizzard's name reservation ended on 3 November 2026, so the website refuses a new or changed
//     reserved name whatever the stored namesOpen switch says; members still see and can remove their own names, the
//     admin Reserved names list is unchanged, and Home no longer says that website name entry is open.
//
// Part 1 always runs: the real src/*.ts (transpiled by TypeScript) of --source, against the real schema in node:sqlite
// with a synthetic clock and a fake Discord (no network). Part 2 runs when --url is given: a local QA harness serving
// --source (harness-s2/server.cjs) for the HTTP checks, and with --cdp a headless Edge for the page checks. Nothing here
// reaches production or any external host. Each check prints PASS or FAIL with its issue id; the exit code is the number
// of failures, so the same file run with --source pointing at the integrated base (1e51050) lists what was wrong before.
//
//   node tests/evergreen1112_owner_test.cjs [--source <worktree>] [--url http://127.0.0.1:63696 --cdp 63697 --profile <new dir>]
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => (arg.startsWith('--') ? [...out, [arg.slice(2), all[i + 1]]] : out), []));
const SOURCE = path.resolve(args.source || path.join(__dirname, '..', '..'));
const ROOT = path.join(SOURCE, 'worker');
const URL0 = args.url || '';
const CDP_PORT = Number(args.cdp || 0);
let failures = 0;
const check = (id, label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail && !ok ? ' :: ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------- Part 1: the real Worker in process
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
const entry = require(path.join(ROOT, 'tests', 'helpers', 'privacy129_fixture.cjs'));
const { DatabaseSync } = require('node:sqlite');
let T = Date.parse('2026-10-29T12:00:00Z') / 1000; // during Blizzard's reservation (27 October to 3 November 2026)
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [T * 1000])); }
  static now() { return T * 1000; }
};
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const cache = {};
function load(name) {
  if (name === 'node:async_hooks' || name === './node:async_hooks') return require('node:async_hooks');
  const file = path.join(ROOT, 'src', name.replace(/^\.\//, '') + '.ts');
  if (cache[file]) return cache[file].exports;
  const mod = { exports: {} };
  cache[file] = mod;
  new Function('module', 'exports', 'require', transpile(file))(mod, mod.exports, p => load(p));
  return mod.exports;
}

// A fake Discord: OAuth, the member endpoint for Asmongold's server, nothing else.
const GUILD = '236932545793490944', ADMIN = '472099715253796864', MEMBER = '300000000000000001', OTHER = '300000000000000002';
const users = new Map([[ADMIN, { id: ADMIN, username: 'fernmelder', global_name: 'Fern', avatar: null }], [MEMBER, { id: MEMBER, username: 'alice', global_name: 'Alice', avatar: null }], [OTHER, { id: OTHER, username: 'bob', global_name: 'Bob', avatar: null }]]);
const member = id => ({ user: users.get(id), nick: null, avatar: null, joined_at: '2024-01-15T12:00:00.000Z', roles: [] });
const realFetch = globalThis.fetch; // part 2 talks to the local harness and Edge with the real fetch
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), p = u.pathname.replace(/^\/api\/v10/, ''), m = init.method || 'GET';
  const auth = new Headers(init.headers).get('Authorization') || '';
  const res = (status, obj) => new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  if (m === 'POST' && p === '/oauth2/token') return res(200, { access_token: 'tok-' + new URLSearchParams(init.body).get('code').slice(5), token_type: 'Bearer' });
  if (auth.startsWith('Bearer ')) {
    const id = auth.slice(7).replace(/^tok-/, '');
    if (p === '/users/@me') return users.has(id) ? res(200, users.get(id)) : res(401, {});
    if (p === `/users/@me/guilds/${GUILD}/member`) return users.has(id) ? res(200, member(id)) : res(404, { code: 10004 });
    return res(404, {});
  }
  let x;
  if ((x = p.match(/^\/guilds\/(\d+)\/members\/(\d+)$/))) return users.has(x[2]) ? res(200, member(x[2])) : res(404, { code: 10007 });
  return res(404, { code: 0 });
};

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.function('strftime', (format, value) => { if (format !== '%s' || value !== 'now') throw Error('unexpected clock input'); return String(T); });
entry.installCurrentEntryEpoch(db, { now: T });
const port = entry.originalNativePort(db, {});
const rawEnv = () => entry.currentEntryEnvironment({
  DB: port, GUILD_ID: '1549537348516188200', DISCORD_APP_ID: '1550176895671341076', DISCORD_CLIENT_SECRET: 'client-secret',
  DISCORD_BOT_TOKEN: 'bot-token', DISCORD_PUBLIC_KEY: '00', COOKIE_SECRET: 'cookie-secret-for-tests-only-0123456789',
  VERIFY_SECRET: 'verify-secret-for-tests', WATCHER_TOKEN: 'watcher-token-for-tests-only-0123456789', PUBLIC_BASE_URL: 'https://verify.example',
  SITE_HOST: 'guild.example', SITE_GUILD_ID: GUILD, SITE_ADMINS: ADMIN, SITE_JOIN_URL: 'https://discord.gg/example', INTROS_GUILD_ID: GUILD,
  INTROS_ROLES: '', INTROS_CHANNELS: '', ADMISSION_MODE: 'auto', SET_GUILD_NOTE: 'false', QUEUE_CLAIM_LIMIT: '25', QUEUE_CLAIM_TTL_MINUTES: '15',
  ROSTER_MIN_MEMBERS: '0', ROSTER_MAX_SHRINK_PCT: '100', CHANNEL_SERVER_LOG: '', CHANNEL_NOTICES: '',
});
const waits = [];
const ctx = { waitUntil: p => waits.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (waits.length) await waits.shift(); };
const jar = new Map();
const cookieOf = (res, name) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (kv.slice(0, i) === name) return kv.slice(i + 1); } return null; };
let index;
async function call(method, pathname, { who, body } = {}) {
  const h = new Headers();
  if (who && jar.has(who)) h.set('Cookie', jar.get(who));
  if (method !== 'GET') { h.set('X-Olympus', '2'); h.set('Origin', 'https://guild.example'); }
  if (body !== undefined) h.set('Content-Type', 'application/json');
  const res = await index.fetch(new Request('https://guild.example' + pathname, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), rawEnv(), ctx);
  await settle();
  let data = null; try { data = await res.clone().json(); } catch { /* not JSON */ }
  return { status: res.status, data };
}
async function signIn(id) {
  const start = await index.fetch(new Request('https://guild.example/auth/login'), rawEnv(), ctx);
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const res = await index.fetch(new Request(`https://guild.example/auth/callback?code=code-${id}&state=${encodeURIComponent(state)}`, { headers: { Cookie: `__Host-olg_state=${cookieOf(start, '__Host-olg_state')}` } }), rawEnv(), ctx);
  await settle();
  const c = cookieOf(res, '__Host-olg');
  if (!c) throw Error('sign-in failed for ' + id + ': ' + res.status);
  jar.set(id, `__Host-olg=${c}`);
}
const reservedOf = async who => ((await call('GET', '/api/me', { who })).data?.reserved || []).map(r => r.name).sort().join('|');
const rowsOf = owner => db.prepare("SELECT name, status FROM site_reserved WHERE owner_id = ? ORDER BY name").all(owner).map(r => r.name + ':' + r.status).join('|');

async function part1() {
  index = load('./index').default;

  console.log('== CL2-074: the gate page offers the WebP copies ahead of the PNG fallback ==');
  {
    const access = load('./site-access'), cacheMod = load('./policy-asset-cache');
    const html = await access.siteSignIn(new Request('https://guild.example/'), 200).text();
    const picture = (html.match(/<picture class="login-portal-art">[\s\S]*?<\/picture>/) || [''])[0];
    const sources = [...picture.matchAll(/<source\b[^>]*>/g)].map(m => m[0]);
    const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
    const url = p => cacheMod.immutablePolicyAssetUrl(p);
    const want = [
      { media: '(max-aspect-ratio: 6/5)', type: 'image/webp', srcset: url('/static/wow/login/olympus-dark-portal-portrait.webp'), width: '852', height: '1847' },
      { media: '(max-aspect-ratio: 6/5)', type: undefined, srcset: url('/static/wow/login/olympus-dark-portal-portrait.png'), width: '852', height: '1847' },
      { media: undefined, type: 'image/webp', srcset: url('/static/wow/login/olympus-dark-portal-wide.webp'), width: '1916', height: '821' },
    ];
    const got = sources.map(tag => ({ media: attr(tag, 'media'), type: attr(tag, 'type'), srcset: attr(tag, 'srcset'), width: attr(tag, 'width'), height: attr(tag, 'height') }));
    check('CL2-074', 'portrait WebP, portrait PNG, then wide WebP sources, each with its media, size and digest address', JSON.stringify(got) === JSON.stringify(want), got);
    const img = (picture.match(/<img\b[^>]*>/) || [''])[0];
    check('CL2-074', 'the PNG <img> fallback keeps its source, empty alt, aria-hidden and 1916x821 size', img === `<img class="login-portal-poster" src="${url('/static/wow/login/olympus-dark-portal-wide.png')}" alt="" aria-hidden="true" width="1916" height="821">`, img);
    check('CL2-074', 'the default stays the stills with no video, and the page adds no preload hint for the art', !/<video\b/.test(html) && !/rel="preload"/.test(html), '');
    const login = path.join(ROOT, 'public/static/wow/login');
    const pinned = Object.fromEntries(cacheMod.LOGIN_ASSETS.map(p => [p, cacheMod.immutablePolicyAssetUrl(p).split('/')[3]]));
    const webps = ['olympus-dark-portal-wide', 'olympus-dark-portal-portrait'];
    const dims = b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' && b.toString('latin1', 12, 16) === 'VP8X' ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)] : null;
    const facts = webps.map(n => {
      const webp = fs.existsSync(path.join(login, n + '.webp')) ? fs.readFileSync(path.join(login, n + '.webp')) : null, png = fs.readFileSync(path.join(login, n + '.png'));
      return { n, exists: !!webp, pinned: !!webp && pinned['/static/wow/login/' + n + '.webp'] === sha(webp), dims: webp && dims(webp), png: [png.readUInt32BE(16), png.readUInt32BE(20)], lossy: !!webp && webp.includes(Buffer.from('VP8 ')), bytes: webp && webp.length };
    });
    check('CL2-074', 'both WebP files exist, are lossy, have the PNG pixel size and match the digest pin', facts.every(f => f.exists && f.pinned && f.lossy && JSON.stringify(f.dims) === JSON.stringify(f.png) && f.bytes < 400000), facts);
    const stills = [['olympus-dark-portal-wide.png', '17661fd0184e3a20fd6ed366673e64fc66baef41ed378bfdf5ab9f3ed0a16dc6'], ['olympus-dark-portal-portrait.png', '218063b8ba4e5496c659a310cb46cd26d5c14d4784a7e66f9497d968e1679659'], ['olympus-dark-portal.png', '7c344640d2dd628a6b235323cb27a2a8962ac4026a920d2c1809b652b1494342'], ['dark-portal.webm', '930ca8937c601245c7893cdc46750de3eca729c5fa9b91ef11dc08d87687521c']];
    check('CL2-074', 'the PNGs, the older still and dark-portal.webm are unchanged and still present', stills.every(([f, h]) => fs.existsSync(path.join(login, f)) && sha(fs.readFileSync(path.join(login, f))) === h), '');
    const webpUrl = url('/static/wow/login/olympus-dark-portal-wide.webp');
    const served = webpUrl ? await index.fetch(new Request('https://guild.example' + webpUrl), { ...rawEnv(), ASSETS: { fetch: async r => new Response(fs.readFileSync(path.join(ROOT, 'public', new URL(r.url).pathname)), { status: 200, headers: { 'Content-Type': 'image/webp' } }) } }, ctx) : null;
    check('CL2-074', 'the signed-out digest address serves the wide WebP as an immutable public asset', !!served && served.status === 200 && /immutable/.test(served.headers.get('Cache-Control') || ''), served && served.status);
  }

}

// ---------------------------------------------------------------- Part 2: the harness and a headless Edge
async function http(persona, method, p, body) {
  const headers = { Cookie: `QA209_persona=${persona}`, 'X-Olympus': '2', Origin: URL0 };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await realFetch(URL0 + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const text = await res.text();
    if (res.status === 429 && attempt < 3) { await sleep(3000); continue; }
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
}
async function launchEdge(port, profile) {
  fs.mkdirSync(profile, { recursive: true });
  const proc = cp.spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--lang=en-US', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) { await sleep(250); try { targets = await (await realFetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { /* not up */ } }
  if (!targets) { proc.kill(); throw Error('edge did not expose CDP'); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), listeners = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) for (const fn of listeners.get(msg.method) || []) fn(msg.params);
  };
  const cdp = {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
    async eval(expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    async close() { try { await Promise.race([cdp.send('Browser.close'), sleep(3000)]); } catch { /* gone */ } try { ws.close(); } catch { /* gone */ } await sleep(300); try { proc.kill(); } catch { /* gone */ } },
  };
  return cdp;
}

async function part2() {
  if (!CDP_PORT) return;

  const cdp = await launchEdge(CDP_PORT, args.profile || path.join(require('node:os').tmpdir(), 'owner1112-' + Date.now()));
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable'); await cdp.send('Log.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const requests = new Map(), consoleErrors = [];
    cdp.on('Network.responseReceived', p => { const q = requests.get(p.requestId) || {}; requests.set(p.requestId, { ...q, url: p.response.url, mime: p.response.mimeType, status: p.response.status }); });
    cdp.on('Network.loadingFinished', p => { const q = requests.get(p.requestId) || {}; requests.set(p.requestId, { ...q, bytes: p.encodedDataLength }); });
    cdp.on('Log.entryAdded', p => { if (p.entry.level === 'error') consoleErrors.push(p.entry.text); });
    cdp.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') consoleErrors.push(p.args.map(a => a.value ?? a.description ?? '').join(' ')); });
    const go = async url => { await cdp.send('Page.navigate', { url }); await sleep(400); for (let i = 0; i < 60; i++) { if (await cdp.eval('document.readyState') === 'complete') break; await sleep(200); } };
    const size = async (width, height) => { await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); };
    const report = { gate: {}, home: {} };

    console.log('== CL2-074: the signed-out gate page in Edge ==');
    await go(URL0 + '/__qa/anonymous');
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      // A blank page first, so the previous page cannot fetch art for the new width while it is torn down.
      await go('about:blank');
      await size(width, height);
      requests.clear(); consoleErrors.length = 0;
      await go(URL0 + '/');
      await sleep(1200);
      const page = await cdp.eval(`new Promise(resolve => {
        // Total layout shift, and the part whose shifted nodes are inside the portal art (the picture and its image).
        let cls = 0, artCls = 0; try { new PerformanceObserver(list => { for (const e of list.getEntries()) { if (e.hadRecentInput) continue; cls += e.value; if ((e.sources || []).some(s => s.node && s.node.nodeType === 1 && s.node.closest('.login-portal'))) artCls += e.value; } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
        const img = document.querySelector('.login-portal-art img'); const box = img && img.getBoundingClientRect();
        setTimeout(() => resolve({ cls, artCls, currentSrc: img && img.currentSrc, complete: img && img.complete, natural: img && [img.naturalWidth, img.naturalHeight], box: box && [Math.round(box.width), Math.round(box.height)], overflow: document.documentElement.scrollWidth - innerWidth }), 300);
      })`);
      const images = [...requests.values()].filter(q => /\/wow\/login\//.test(q.url || ''));
      const chosen = images.map(q => ({ file: (q.url || '').split('/').pop(), mime: q.mime, bytes: q.bytes, status: q.status }));
      const csp = consoleErrors.filter(t => /Content Security Policy|Refused to load/i.test(t));
      report.gate[width] = { ...page, currentSrc: (page.currentSrc || '').split('/').pop(), requests: chosen, cspErrors: csp.length };
      const want = width >= 768 ? 'olympus-dark-portal-wide.webp' : 'olympus-dark-portal-portrait.webp';
      check('CL2-074', `gate at ${width} px: the browser chose ${want}, the only login image fetched`, (page.currentSrc || '').endsWith(want) && chosen.length === 1 && chosen[0].file === want && chosen[0].mime === 'image/webp' && chosen[0].status === 200, report.gate[width]);
      check('CL2-074', `gate at ${width} px: transfer under 400 kB, decoded at the PNG's pixel size`, chosen.length === 1 && chosen[0].bytes < 400000 && JSON.stringify(page.natural) === JSON.stringify(width >= 768 ? [1916, 821] : [852, 1847]), report.gate[width]);
      check('CL2-074', `gate at ${width} px: the art causes no layout shift (total under 0.005), no CSP refusal, no horizontal overflow`, page.artCls === 0 && page.cls < 0.005 && csp.length === 0 && page.overflow <= 0, report.gate[width]);
    }

    if (args.report) fs.writeFileSync(args.report, JSON.stringify(report, null, 2) + '\n');
  } finally { await cdp.close(); }
}

(async () => {
  try { await part1(); } catch (e) { check('setup', 'part 1 completed without an exception: ' + (e && e.stack || e), false); }
  if (URL0) { try { await part2(); } catch (e) { check('setup', 'part 2 completed without an exception: ' + (e && e.stack || e), false); } }
  console.log(`\n${failures} failure(s)`);
  process.exit(Math.min(failures, 99));
})();
