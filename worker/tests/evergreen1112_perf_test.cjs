'use strict';
// Evergreen 12 Nov 2026, lane perf (CL2-072, CL2-073, CL2-077, CL2-249): the real Worker (src/*.ts transpiled) over
// the real schema in SQLite behind the repository's original Native D1 port, real sessions from the sole OAuth PROFILE
// issuer, and a counted fake for Discord's REST side only. It measures what a signed-in page load costs and checks:
//   - the catalogue rides once per page load (the boot) and every key the page reads is there; /api/me and /api/public
//     no longer repeat it (CL2-072, CL2-249);
//   - a signed-in GET / needs at most a fixed number of D1 round trips (CL2-073);
//   - a burst of requests whose hourly membership check is due makes one Discord call, and still fails closed (CL2-077);
//   - this build's app.js and app.css are kept privately in the member's browser, everything else stays no-store, member
//     JSON/script/style lose only no-transform, the page is gzip from the Worker, and sign-out and a new build leave
//     the kept copy unusable (CL2-076, owner ruling of 13 Nov 2026).
// Run from worker/: node tests/evergreen1112_perf_test.cjs [--root <another worker folder, read-only>] [--json <file>]
// With --root it loads that tree's source instead (used for the fail-before receipt on the base dfca7a2).
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = path.resolve(opt('--root') || path.join(__dirname, '..'));
const JSON_OUT = opt('--json');
process.env.PRIVACY129_TYPESCRIPT = process.env.PRIVACY129_TYPESCRIPT || require.resolve('typescript');
const ts = require('typescript');
const entry = require(path.join(ROOT, 'tests', 'helpers', 'privacy129_fixture.cjs'));

let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (why.length ? '  ' + why.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') : '')); };
const report = { root: ROOT };

// ---------- the real Worker source, with Discord's REST side counted ----------
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
globalThis.fetch = async url => { throw new Error('no network in tests: ' + url); };
const stubs = {}, cache = {};
function load(name) {
  if (name === 'node:async_hooks') return require(name);
  const key = name.replace(/^\.\.\//, './');
  if (stubs[key]) return stubs[key];
  const file = path.join(ROOT, 'src', name.replace(/^\.\//, '').replace(/^\.\.\//, '') + '.ts');
  const rel = path.relative(path.join(ROOT, 'src'), file).replace(/\\/g, '/');
  if (cache[rel]) return cache[rel].exports;
  const mod = { exports: {} };
  cache[rel] = mod;
  const dir = path.dirname(rel);
  new Function('module', 'exports', 'require', transpile(file))(mod, mod.exports, p => load(dir === '.' ? p : p.startsWith('../') ? './' + p.slice(3) : './' + dir + '/' + p.replace(/^\.\//, '')));
  return mod.exports;
}
const realDiscord = (() => { const m = { exports: {} }; new Function('module', 'exports', 'require', transpile(path.join(ROOT, 'src', 'discord.ts')))(m, m.exports, p => load(p)); return m.exports; })();
const MEMBER = '300000000000000003', STAFF = '472099715253796864', LEAVER = '300000000000000006', FLAKY = '300000000000000007';
const GUILD = '236932545793490944', ROLE_MEMBER = '1549581282227265566';
const discord = { memberGets: 0, delayMs: 0, mode: new Map() }; // mode per id: 'ok' | 'gone' | 'error'
const fakeRest = async (_env, method, route) => {
  const one = /^\/guilds\/(\d+)\/members\/(\d+)$/.exec(String(route).split('?')[0]);
  if (method !== 'GET' || !one) throw new realDiscord.DiscordError(403, '{"message":"refused in tests"}');
  discord.memberGets++;
  if (discord.delayMs) await new Promise(r => setTimeout(r, discord.delayMs));
  const mode = discord.mode.get(one[2]) || 'ok';
  if (mode === 'gone') throw new realDiscord.DiscordError(404, '{"message":"Unknown Member","code":10007}');
  if (mode === 'error') throw new realDiscord.DiscordError(500, '{"message":"upstream"}');
  return { user: { id: one[2], username: 'u' + one[2].slice(-2), global_name: null, avatar: null, bot: false }, nick: null, avatar: null, roles: [ROLE_MEMBER], pending: false };
};
Object.assign(stubs, {
  './discord': { ...realDiscord, rest: fakeRest, logLine: async () => {}, postMessage: async () => ({ id: '1' }), staffNotice: async () => {}, addRole: async () => {}, removeRole: async () => {}, guildMember: async () => ({ roles: [] }), setNickname: async () => {} },
  './dm': { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  './review': { onVerified: async () => {} },
});
const indexMod = load('./index');

// ---------- database, environment, counted Native port ----------
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
entry.installCurrentEntryEpoch(db);
function countedPort() {
  const counter = { roundTrips: 0 };
  const port = entry.originalNativePort(db, { count: () => { counter.roundTrips++; } });
  counter.statements = () => port.nativeTrace.length;
  counter.boundBytes = () => port.nativeTrace.reduce((sum, row) => sum + row.params.reduce((s, v) => s + (typeof v === 'string' ? v.length : 8), 0), 0);
  return { port, counter };
}
// The deployed files the CL2-076 checks read (exact bytes and the content type the assets binding gives them); every
// other path answers a small stand-in, as before. A Range request gets 206, as the binding answers one.
const REAL_ASSETS = { '/static/app.js': 'text/javascript; charset=utf-8', '/static/app.css': 'text/css; charset=utf-8', '/static/talents/data.json': 'application/json; charset=utf-8' };
const ASSETS = { fetch: async request => {
  const pathname = new URL(request.url).pathname, type = REAL_ASSETS[pathname];
  const file = type ? path.join(ROOT, 'public', pathname) : null;
  if (file && fs.existsSync(file)) {
    const bytes = fs.readFileSync(file);
    if (request.headers.get('Range')) return new Response(bytes.subarray(0, 100), { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes 0-99/${bytes.length}` } });
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': type } });
  }
  if (pathname.endsWith('.png')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
  return new Response('/* asset ' + pathname + ' */', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
} };
const env = (DB, over = {}) => entry.currentEntryEnvironment({ DB, ASSETS, COOKIE_SECRET: 'cookie-secret-for-tests-only-0123456789', VERIFY_SECRET: 'verify-secret-for-tests', WATCHER_TOKEN: 'watcher-token-for-tests-only-0123456789',
  GUILD_ID: GUILD, DISCORD_APP_ID: '1550176895671341076', DISCORD_CLIENT_SECRET: 'client-secret', DISCORD_PUBLIC_KEY: '00', DISCORD_BOT_TOKEN: 'bot-token-for-tests-only',
  PUBLIC_BASE_URL: 'https://verify.example', SITE_HOST: 'guild.example', SITE_GUILD_ID: GUILD, SITE_ADMINS: STAFF, ROLE_OFFICER: '1549581672272625734', ROLE_GUILD_MEMBER: ROLE_MEMBER,
  ADMISSION_MODE: 'auto', OFFICER_CHARACTERS: 'Fern Melder', ROSTER_MIN_MEMBERS: '0', ROSTER_MAX_SHRINK_PCT: '10', CHANNEL_SERVER_LOG: '', CHANNEL_NOTICES: '', CHANNEL_MOD_ALERTS: '', CHANNEL_RECRUITMENT_REVIEW: '',
  ROLE_MODERATOR: '', ROLE_GUILD_LEADER: '', ROLE_GUILD_MASTER: '', ROLE_RAID_LEADER: '',
  COMMUNITY_FEATURES: 'directory,crafting,privacy_intake,events,attendance,trials,contributions,departures,restrictions', COMMUNITY_ORGANIZERS: '', CONTRIBUTIONS_MODE: 'ledger', CONTRIBUTIONS_RETENTION_DAYS: '400',
  PRIVACY_INTAKE_ENABLED: 'true', PRIVACY_INTAKE_MONITORED: 'true', PRIVACY_INTAKE_RETENTION_DAYS: '90', ...over });
const ctx = { waitUntil: () => {}, passThroughOnException() {} };
async function fixtureRun(sql, ...params) {
  const admitted = load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(env(entry.originalNativePort(db)).DB, 'writer', 'canonical', entry.ENTRY_EPOCH);
  await admitted.prepare(sql).bind(...params).run();
}
const now = Math.floor(Date.now() / 1000);
async function seedUser(id, name) {
  await fixtureRun('INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, NULL, ?, ?, 1, 0, 1)', id, 'u' + id.slice(-2), name, now, now);
  await fixtureRun('INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING', id);
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid, member_since) VALUES (?, ?, ?, 'member', ?, ?, ?)", name.toLowerCase(), name, id, now - 86400, 'Player-1-' + id.slice(-4), now - 86400);
}
const checkedAt = (id, t) => fixtureRun('UPDATE site_users SET checked_at = ? WHERE discord_id = ?', t, id);
const cookies = new Map();
const cookieFor = async id => {
  if (!cookies.has(id)) cookies.set(id, (await entry.issueOriginalEntryCookie(name => load('./' + name), db, env(entry.originalNativePort(db)), id)).cookie);
  return cookies.get(id);
};
async function request(who, pathname, init = {}) {
  const { port, counter } = countedPort();
  const discordBefore = discord.memberGets;
  const headers = { Cookie: await cookieFor(who), 'Sec-Fetch-Site': 'same-origin', 'X-Olympus': '2', ...(init.headers || {}) };
  const started = performance.now();
  const response = await indexMod.default.fetch(new Request('https://guild.example' + pathname, { method: init.method || 'GET', headers }), env(port), ctx);
  const text = await response.text();
  if (args.includes('--trace') && pathname === '/') console.log('TRACE', who, pathname, JSON.stringify(port.nativeTrace.map(row => row.sql.replace(/\s+/g, ' ').slice(0, 70))));
  return { status: response.status, text, bytes: Buffer.byteLength(text), ms: +(performance.now() - started).toFixed(1),
    roundTrips: counter.roundTrips, statements: counter.statements(), boundBytes: counter.boundBytes(), discord: discord.memberGets - discordBefore };
}
// CL2-076: the Response itself, its headers and raw bytes (nothing decoded). who === null sends no cookie.
async function raw(who, pathname, init = {}) {
  const headers = { ...(who ? { Cookie: await cookieFor(who) } : {}), 'Sec-Fetch-Site': 'same-origin', 'X-Olympus': '2', ...(init.headers || {}) };
  const response = await indexMod.default.fetch(new Request('https://guild.example' + pathname, { method: init.method || 'GET', headers }), env(entry.originalNativePort(db)), ctx);
  return { status: response.status, h: name => response.headers.get(name), bytes: Buffer.from(await response.arrayBuffer()) };
}
const bootOf = html => { const m = html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/); return m ? JSON.parse(m[1]) : null; };

// Every catalogue key the page script reads (M().x, meta.x after const meta = M(), S.meta.x): the readers of the boot copy.
const APP_JS = fs.readFileSync(path.join(ROOT, 'public', 'static', 'app.js'), 'utf8');
const readers = new Map();
for (const m of APP_JS.matchAll(/\b(?:M\(\)|S\.meta|meta)\??\.(\w+)/g)) {
  const line = APP_JS.slice(0, m.index).split('\n').length;
  if (!readers.has(m[1])) readers.set(m[1], []);
  readers.get(m[1]).push(line);
}
// "meta." also matches unrelated locals in a few views (e.g. talent stats' own meta object); only keys the catalogue
// defines or that the page reads through M()/S.meta are catalogue readers.
const CATALOGUE_ONLY_VIA_M = new Set([...APP_JS.matchAll(/\b(?:M\(\)|S\.meta)\??\.(\w+)/g)].map(m => m[1]));

(async () => {
  await seedUser(MEMBER, 'Mia One'); await seedUser(STAFF, 'Vik Admin'); await seedUser(LEAVER, 'Lea Ver'); await seedUser(FLAKY, 'Fla Ky');
  for (const id of [MEMBER, STAFF, LEAVER, FLAKY]) await checkedAt(id, now); // steady state: the hourly check is not due
  // Warm the isolate once per persona (schema check, key import), as a running Worker would be.
  for (const who of [MEMBER, STAFF]) { await request(who, '/'); await request(who, '/api/me'); }
  for (const who of [LEAVER, FLAKY]) await cookieFor(who); // issued once, before any concurrent request

  // ---- what one page load costs, member and admin ----
  report.load = {};
  for (const [label, who] of [['member', MEMBER], ['admin', STAFF]]) {
    const doc = await request(who, '/'), me = await request(who, '/api/me'), pub = await request(who, '/api/public');
    report.load[label] = { document: { status: doc.status, bytes: doc.bytes, roundTrips: doc.roundTrips, statements: doc.statements, boundBytes: doc.boundBytes, discordCalls: doc.discord, ms: doc.ms },
      apiMe: { status: me.status, bytes: me.bytes, roundTrips: me.roundTrips, statements: me.statements }, apiPublic: { status: pub.status, bytes: pub.bytes, roundTrips: pub.roundTrips } };
    console.log('MEASURE', label, JSON.stringify(report.load[label]));
    const boot = bootOf(doc.text), meJson = JSON.parse(me.text), pubJson = JSON.parse(pub.text);
    check(`${label}: GET / is the signed-in page with a boot`, doc.status === 200 && !!boot && boot.signedIn === true && boot.user?.id === who);
    check(`${label}: the boot carries the catalogue`, !!boot?.meta && Array.isArray(boot.meta.positions) && Array.isArray(boot.meta.appointments) && !!boot.meta.roleGuides201);
    const copies = doc.text.split('"roleGuides201"').length - 1;
    check(`${label}: the document holds exactly one copy of the catalogue (CL2-072)`, copies === 1, 'copies=' + copies);
    check(`${label}: /api/me no longer repeats the catalogue (CL2-072)`, me.status === 200 && !('meta' in meJson) && me.bytes < 20000, 'bytes=' + me.bytes);
    check(`${label}: /api/me still answers what the page reads from it`, meJson.signedIn === true && meJson.inServer === true && meJson.denied === false && typeof meJson.applicationEditorProof === 'string' && !!meJson.settings);
    check(`${label}: /api/public is the settings only (CL2-072, CL2-249)`, pub.status === 200 && !('meta' in pubJson) && !!pubJson.settings && pub.bytes < 4096, 'bytes=' + pub.bytes);
    check(`${label}: the boot and /api/me agree on the account's own data`, JSON.stringify({ ...boot, meta: undefined, build: undefined, joinUrl: undefined, community: undefined, qrVerification: undefined, now: 0, applicationEditorProof: 0 }) === JSON.stringify({ ...meJson, meta: undefined, now: 0, applicationEditorProof: 0 }));
    // CL2-072: everything the page script reads from the catalogue is still there.
    const missing = [...CATALOGUE_ONLY_VIA_M].filter(key => !(key in (boot?.meta || {})));
    check(`${label}: every catalogue key the page reads is in the boot`, missing.length === 0, missing.join(','));
    check(`${label}: the unread nativeRankGuides201 (14 KB) is not sent`, !!boot && !('nativeRankGuides201' in boot.meta));
    if (label === 'member') {
      // The catalogue in the boot equals the Worker's own catalogue for the same ruleset (nothing lost by the splice).
      const data = load('./site-data');
      const state = await data.loadSiteState(env(entry.originalNativePort(db)));
      const expected = JSON.parse(JSON.stringify(data.meta(state.ruleset)));
      delete expected.nativeRankGuides201;
      check('the boot catalogue equals meta(ruleset) of the Worker', JSON.stringify(boot.meta) === JSON.stringify(expected));
      report.catalogueKeys = Object.keys(boot.meta);
      report.readers = Object.fromEntries([...readers].filter(([k]) => k in boot.meta).map(([k, lines]) => [k, lines]));
      report.unreadKeys = Object.keys(boot.meta).filter(k => !readers.has(k));
    }
  }
  const memberDoc = report.load.member.document;
  // CL2-073: the base needs about 15 Native round trips for this page; the batched boot needs 8 or fewer.
  check('member GET / needs at most 8 D1 round trips (CL2-073)', memberDoc.roundTrips <= 8, 'roundTrips=' + memberDoc.roundTrips);
  check('admin GET / needs at most 8 D1 round trips (CL2-073)', report.load.admin.document.roundTrips <= 8, 'roundTrips=' + report.load.admin.document.roundTrips);
  check('member GET / makes no Discord call while the hourly check is not due', memberDoc.discordCalls === 0);

  // ---- CL2-077: a burst of due requests makes one Discord call ----
  discord.delayMs = 40;
  await checkedAt(MEMBER, now - 7200);
  // Member-gated files only (the login page's public assets and the own-record /api/me read skip the hourly check).
  const burstFiles = ['/', '/static/app.css', '/static/app.js', '/static/wow/frame.png', '/static/wow/divider.png', '/static/guides218.js', '/static/guides218.css', '/static/resources169.js', '/static/resources169.css', '/static/organization-view.js'];
  const before = discord.memberGets;
  const burst = await Promise.all(burstFiles.map(p => request(MEMBER, p)));
  const calls = discord.memberGets - before;
  report.burst = { requests: burstFiles.length, discordCalls: calls, statuses: burst.map(r => r.status) };
  console.log('MEASURE burst', JSON.stringify(report.burst));
  check('a burst of 10 due requests makes one Discord member read (CL2-077)', calls === 1, 'calls=' + calls);
  check('every request of the burst is served', burst.every(r => r.status === 200), JSON.stringify(report.burst.statuses));
  const row = db.prepare('SELECT checked_at, in_server FROM site_users WHERE discord_id = ?').get(MEMBER);
  check('the shared check recorded the new time once', row.in_server === 1 && row.checked_at >= now, JSON.stringify(row));
  const after = await request(MEMBER, '/static/app.css');
  check('the next request after the burst makes no Discord call', after.status === 200 && after.discord === 0);

  // Fail closed is unchanged: Discord unavailable holds every request of the burst; one call is still shared.
  discord.mode.set(FLAKY, 'error'); await checkedAt(FLAKY, now - 7200);
  const flakyBefore = discord.memberGets;
  const flaky = await Promise.all(burstFiles.slice(1, 6).map(p => request(FLAKY, p)));
  check('Discord unavailable: every due request is held (503) and one call is shared', flaky.every(r => r.status === 503) && discord.memberGets - flakyBefore === 1, JSON.stringify({ statuses: flaky.map(r => r.status), calls: discord.memberGets - flakyBefore }));
  check('Discord unavailable: nothing was written for the account', db.prepare('SELECT checked_at FROM site_users WHERE discord_id = ?').get(FLAKY).checked_at === now - 7200);
  // A departed member: one call, every request refused, the row ends its sessions.
  discord.mode.set(LEAVER, 'gone'); await checkedAt(LEAVER, now - 7200);
  const leaverBefore = discord.memberGets;
  const gone = await Promise.all(burstFiles.slice(1, 6).map(p => request(LEAVER, p)));
  const leaverRow = db.prepare('SELECT in_server, session_version FROM site_users WHERE discord_id = ?').get(LEAVER);
  const leftAudits = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND action = 'site.left_server'").get(LEAVER).n;
  check('Discord says gone: every due request is refused (403) after one shared call', gone.every(r => r.status === 403) && discord.memberGets - leaverBefore === 1, JSON.stringify({ statuses: gone.map(r => r.status), calls: discord.memberGets - leaverBefore }));
  check('Discord says gone: the account leaves once (one audit row, sessions ended)', leaverRow.in_server === 0 && leftAudits === 1, JSON.stringify({ leaverRow, leftAudits }));
  // An expired share: two requests that read the same expired entry in the same tick start one new flight between
  // them, not one each (Stage 2 review of 12 Nov 2026: the base head awaited before replacing, so the second deleted
  // the first's new flight). Called directly so both reads of the map happen before any await.
  const api = load('./site-api');
  const flakyUser = db.prepare('SELECT * FROM site_users WHERE discord_id = ?').get(FLAKY);
  const directEnv = env(entry.originalNativePort(db));
  await api.stillMember(directEnv, { ...flakyUser }); // settles an 'unavailable' share for this key (5 s)
  const realNow = Date.now;
  Date.now = () => realNow() + 6000; // the share has expired
  try {
    const raceBefore = discord.memberGets;
    const raced = await Promise.all([api.stillMember(directEnv, { ...flakyUser }), api.stillMember(directEnv, { ...flakyUser }), api.stillMember(directEnv, { ...flakyUser })]);
    const raceCalls = discord.memberGets - raceBefore;
    report.expiredShare = { calls: raceCalls, statuses: raced.map(r => r && r.status) };
    check('an expired share: three concurrent checks start one new Discord read, not one each', raceCalls === 1, JSON.stringify(report.expiredShare));
    check('an expired share: every one of them is still held (503)', raced.every(r => r && r.status === 503), JSON.stringify(report.expiredShare.statuses));
  } finally { Date.now = realNow; }
  discord.delayMs = 0;

  // page(): a throw while shaping the community context hides the community pages (community: null) and the page
  // still loads, as the base's try/catch around communityContext and contextDto did (Stage 2 review, 12 Nov 2026).
  const communityMod = load('./community-context');
  const realDto = communityMod.contextDto;
  communityMod.contextDto = () => { throw new Error('contextDto failed in test'); };
  let failedDto;
  try { failedDto = await request(MEMBER, '/'); } catch (e) { failedDto = { status: 'threw: ' + e.message, text: '' }; } finally { communityMod.contextDto = realDto; }
  const failedBoot = failedDto.status === 200 ? bootOf(failedDto.text) : null;
  check('a throw in contextDto still serves the page with community: null', failedDto.status === 200 && !!failedBoot && failedBoot.community === null, 'status=' + failedDto.status);

  // ---- CL2-076 (owner ruling of 13 Nov 2026, "Yes, both"): this build's app.js and app.css are kept privately in the
  // member's browser; member script, style, JSON and the page itself are compressed in transit; nothing personal is
  // kept, and the public answers are unchanged.
  const zlib = require('node:zlib'), sha = b => require('node:crypto').createHash('sha256').update(b).digest('hex');
  const BUILD_NOW = /const BUILD = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf8'))[1];
  const V = '?v=' + encodeURIComponent(BUILD_NOW), IMMUTABLE = 'private, max-age=31536000, immutable';
  report.cl2076 = { build: BUILD_NOW, files: {} };
  const docPlain = await raw(MEMBER, '/'), docHtml = docPlain.bytes.toString('utf8');
  for (const file of ['/static/app.js', '/static/app.css']) {
    check(`CL2-076: the signed-in page requests ${file} with this build's version`, docHtml.includes(`"${file}${V}"`));
    const disk = fs.readFileSync(path.join(ROOT, 'public', file));
    const m = await raw(MEMBER, file + V), a = await raw(STAFF, file + V);
    report.cl2076.files[file] = { bytes: m.bytes.length, sha256: sha(m.bytes), member: m.h('Cache-Control'), admin: a.h('Cache-Control'), vary: m.h('Vary') };
    check(`CL2-076: member ${file}?v=<build> is kept privately for a year (immutable, no no-store)`, m.status === 200 && m.h('Cache-Control') === IMMUTABLE, m.h('Cache-Control'));
    check(`CL2-076: ${file}?v=<build> does not vary on Cookie and keeps the security headers`, !/cookie/i.test(m.h('Vary') || '') && m.h('X-Content-Type-Options') === 'nosniff' && m.h('X-Frame-Options') === 'DENY' && /noindex/.test(m.h('X-Robots-Tag') || '') && m.h('Strict-Transport-Security') === 'max-age=31536000' && m.h('Cross-Origin-Opener-Policy') === 'same-origin', { vary: m.h('Vary') });
    check(`CL2-076: ${file}?v=<build> is the deployed file byte for byte, the same for a member and an admin`, m.bytes.equals(disk) && a.bytes.equals(disk) && a.h('Cache-Control') === m.h('Cache-Control') && a.h('Content-Type') === m.h('Content-Type'));
    for (const [label, query] of [['no version', ''], ['an older build', '?v=' + encodeURIComponent('2026-11-11.278 Previous build')], ['an extra parameter', V + '&x=1'], ['the version spelled differently', '?v=' + BUILD_NOW.replace(/ /g, '+')]]) {
      const r = await raw(MEMBER, file + query);
      check(`CL2-076: ${file} with ${label} is not kept (private, no-store, Vary: Cookie)`, r.status === 200 && r.h('Cache-Control') === 'private, no-store' && r.h('Vary') === 'Cookie', r.h('Cache-Control'));
    }
    const part = await raw(MEMBER, file + V, { headers: { Range: 'bytes=0-99' } });
    check(`CL2-076: a partial (206) answer for ${file}?v=<build> is not kept`, part.status === 206 && part.h('Cache-Control') === 'private, no-store', part.status + ' ' + part.h('Cache-Control'));
    const anon = await raw(null, file + V);
    check(`CL2-076: signed out, ${file}?v=<build> is refused (401) with the public headers unchanged`, anon.status === 401 && anon.h('Cache-Control') === 'no-store, no-transform' && !anon.bytes.includes('use strict'), anon.status + ' ' + anon.h('Cache-Control'));
  }
  const json = await raw(MEMBER, '/static/talents/data.json');
  check('CL2-076: an unversioned member JSON file may be compressed but is not kept (private, no-store, Vary: Cookie)', json.status === 200 && json.h('Cache-Control') === 'private, no-store' && json.h('Vary') === 'Cookie', json.h('Cache-Control'));
  const png = await raw(MEMBER, '/static/wow/frame.png');
  check('CL2-076: a member image keeps private, no-store, no-transform (nothing re-encodes it)', png.status === 200 && png.h('Cache-Control') === 'private, no-store, no-transform', png.h('Cache-Control'));
  for (const [label, who, p] of [['member /api/me', MEMBER, '/api/me'], ['member /api/public', MEMBER, '/api/public'], ['admin /api/admin/audit-log', STAFF, '/api/admin/audit-log']]) {
    const r = await raw(who, p);
    check(`CL2-076: ${label} stays no-store and drops only no-transform`, r.status === 200 && r.h('Cache-Control') === 'no-store' && /application\/json/.test(r.h('Content-Type') || ''), r.status + ' ' + r.h('Cache-Control'));
  }
  for (const p of ['/api/privacy/config', '/api/me/erasure/status']) {
    const r = await raw(MEMBER, p);
    check(`CL2-076: the gate-exempt ${p} keeps its headers exactly (no-store, no-transform)`, /no-store/.test(r.h('Cache-Control') || '') && /no-transform/.test(r.h('Cache-Control') || ''), r.status + ' ' + r.h('Cache-Control'));
  }
  // The page: gzip by the Worker, the same page after decoding, no-transform and the exact CSP kept.
  const strip = html => html.replace(/<script type="application\/json" id="boot">[\s\S]*?<\/script>/, '');
  // The clock fields (now, community.now) and the per-request editor proof differ between any two loads.
  const bootNorm = html => { const b = bootOf(html); return b && JSON.stringify({ ...b, now: 0, applicationEditorProof: 0, community: b.community && { ...b.community, now: 0 } }); };
  const gunzip = b => { try { return zlib.gunzipSync(b).toString('utf8'); } catch { return ''; } };
  const gz = await raw(MEMBER, '/', { headers: { 'Accept-Encoding': 'gzip, deflate, br' } }), unzipped = gunzip(gz.bytes);
  report.cl2076.document = { raw: docPlain.bytes.length, sent: gz.bytes.length, contentEncoding: gz.h('Content-Encoding') };
  console.log('MEASURE CL2-076 document', JSON.stringify(report.cl2076.document));
  check('CL2-076: the signed-in page is sent gzip when the browser takes it (under a quarter of the size)', gz.status === 200 && gz.h('Content-Encoding') === 'gzip' && gz.bytes[0] === 0x1f && gz.bytes[1] === 0x8b && gz.bytes.length * 4 < docPlain.bytes.length, report.cl2076.document);
  check('CL2-076: decoded, it is the same page and the same boot', !!unzipped && strip(unzipped) === strip(docHtml) && bootNorm(unzipped) === bootNorm(docHtml));
  check('CL2-076: the page keeps no-store, no-transform and its exact security policy, and varies on Accept-Encoding', gz.h('Cache-Control') === 'no-store, no-transform' && docPlain.h('Cache-Control') === 'no-store, no-transform' && !!gz.h('Content-Security-Policy') && gz.h('Content-Security-Policy') === docPlain.h('Content-Security-Policy') && gz.h('Vary') === 'Accept-Encoding' && docPlain.h('Vary') === 'Accept-Encoding', { vary: gz.h('Vary') });
  check('CL2-076: without Accept-Encoding the page is sent uncompressed, as before', docPlain.status === 200 && !docPlain.h('Content-Encoding') && !!bootOf(docHtml));
  for (const ae of ['gzip;q=0', 'identity', 'br', 'deflate, br;q=1']) {
    const r = await raw(MEMBER, '/', { headers: { 'Accept-Encoding': ae } });
    check(`CL2-076: Accept-Encoding "${ae}" gets the page uncompressed`, r.status === 200 && !r.h('Content-Encoding') && !!bootOf(r.bytes.toString('utf8')));
  }
  const star = await raw(MEMBER, '/', { headers: { 'Accept-Encoding': '*' } });
  check('CL2-076: Accept-Encoding "*" gets gzip', star.h('Content-Encoding') === 'gzip' && !!gunzip(star.bytes));
  const head = await raw(MEMBER, '/', { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
  check('CL2-076: HEAD gets the same headers and no body', head.status === 200 && head.bytes.length === 0 && head.h('Content-Encoding') === 'gzip' && head.h('Content-Security-Policy') === gz.h('Content-Security-Policy') && head.h('Cache-Control') === 'no-store, no-transform');
  const rangedPage = await raw(MEMBER, '/', { headers: { 'Accept-Encoding': 'gzip', Range: 'bytes=0-99' } });
  check('CL2-076: a Range request on the page gets the whole page (200, no Content-Range)', rangedPage.status === 200 && !rangedPage.h('Content-Range') && strip(gunzip(rangedPage.bytes)) === strip(docHtml));
  const gate = await raw(null, '/', { headers: { 'Accept-Encoding': 'gzip' } });
  check('CL2-076: the signed-out sign-in page is unchanged (not compressed by the Worker)', gate.status === 200 && !gate.h('Content-Encoding') && /no-store/.test(gate.h('Cache-Control') || '') && /Enter Olympus/.test(gate.bytes.toString('utf8')));
  // Review finding 1 (13 Nov 2026): text the requester chose is never compressed next to the member's data and the
  // per-session proof (BREACH). The decision is made where the page is built (site.ts pageText), from what the caller
  // put into the page, and memberDocument sends anything but 'fixed' uncompressed.
  const site = load('./site'), transport = fs.existsSync(path.join(ROOT, 'src', 'member-transport.ts')) ? load('./member-transport') : null; // the base has none
  const shapes = [[{}, 'fixed'], [{ flash: { kind: 'updating' } }, 'fixed'], [{ flash: { kind: 'cancelled', detail: undefined } }, 'fixed'], [{ flash: { kind: 'expired', detail: undefined } }, 'fixed'],
    [{ flash: { kind: 'discord_error', detail: 'zq-guess' } }, 'from-request'], [{ flash: { kind: 'discord_error', detail: 'token 502' } }, 'from-request'], [{ flash: { kind: 'not_configured', detail: 'COOKIE_SECRET' } }, 'from-request'],
    [{ flash: { kind: 'no_such_kind' } }, 'from-request'], [{ flash: { kind: 'updating', extra: 'x' } }, 'from-request'], [{ flash: { kind: 'updating' }, q: 'x' }, 'from-request'], [{ q: 'x' }, 'from-request'], [{ flash: 'text' }, 'from-request']];
  const decided = typeof site.pageText === 'function' ? shapes.map(([extra, want]) => [JSON.stringify(extra), site.pageText(extra), want]) : null;
  check('CL2-076 echo: the page counts as fixed only with no extra or a listed flash kind without detail; any detail or other key is from-request', !!decided && decided.every(([, got, want]) => got === want), decided ? decided.filter(([, got, want]) => got !== want) : 'site.ts exports no pageText');
  const docHeaders = () => new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-transform' });
  const docReq = method => new Request('https://guild.example/', { method, headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
  const SAMPLE = '<!doctype html><title>t</title>' + 'x'.repeat(4000);
  const outs = {};
  for (const [label, text, method] of [['fixed', 'fixed', 'GET'], ['from-request', 'from-request', 'GET'], ['from-request HEAD', 'from-request', 'HEAD'], ['no decision', undefined, 'GET']]) {
    if (!transport) { outs[label] = { encoding: 'no member-transport.ts' }; continue; }
    const r = await transport.memberDocument(docReq(method), SAMPLE, 200, docHeaders(), text), b = Buffer.from(await r.arrayBuffer());
    outs[label] = { encoding: r.headers.get('Content-Encoding'), vary: r.headers.get('Vary'), bytes: b.length, same: b.toString('utf8') === (method === 'HEAD' ? '' : SAMPLE) };
  }
  check('CL2-076 echo: memberDocument gzips a fixed page for a browser that takes gzip', outs.fixed.encoding === 'gzip' && outs.fixed.vary === 'Accept-Encoding', outs.fixed);
  check('CL2-076 echo: memberDocument sends a from-request page (GET and HEAD), or one with no decision, uncompressed and byte for byte', ['from-request', 'from-request HEAD', 'no decision'].every(k => outs[k].encoding === null && outs[k].vary === null && outs[k].same), outs);
  // Through the real Worker entry: the callback's error page for a signed-in member carries the ?error= text in the
  // boot's flash detail, beside the member's data and the editor proof, and goes out uncompressed. (Today the callback
  // also runs on a snapshot of the request that keeps only the cookie and the client address, privacy-serving-site-
  // oauth.ts, so its Accept-Encoding never reaches page(); this check holds even if that changes.)
  const ECHO = 'zq' + 'x'.repeat(30) + '-guess';
  const echoed = await raw(MEMBER, '/auth/callback?error=' + encodeURIComponent(ECHO), { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
  const echoedBoot = bootOf(echoed.bytes.toString('utf8'));
  report.cl2076.echo = { status: echoed.status, contentEncoding: echoed.h('Content-Encoding'), vary: echoed.h('Vary'), bytes: echoed.bytes.length, flash: echoedBoot && echoedBoot.flash }; report.cl2076.decision = { decided, outs };
  check('CL2-076 echo: a signed-in member\'s callback error page carrying ?error= text is sent uncompressed', echoed.status === 200 && !echoed.h('Content-Encoding') && echoed.bytes[0] === 0x3c && !!echoedBoot && !!echoedBoot.flash && echoedBoot.flash.detail === ECHO.slice(0, 40) && echoedBoot.applicationEditorProof !== undefined, report.cl2076.echo);
  check('CL2-076 echo: it keeps no-store, no-transform and the exact security policy', echoed.h('Cache-Control') === 'no-store, no-transform' && echoed.h('Content-Security-Policy') === docPlain.h('Content-Security-Policy'), echoed.h('Cache-Control'));
  const again = await raw(MEMBER, '/', { headers: { 'Accept-Encoding': 'gzip' } });
  check('CL2-076 echo: the ordinary signed-in page is still compressed', again.status === 200 && again.h('Content-Encoding') === 'gzip' && !!bootOf(gunzip(again.bytes)));
  const anonEcho = await raw(null, '/auth/callback?error=' + encodeURIComponent(ECHO), { headers: { 'Accept-Encoding': 'gzip' } });
  check('CL2-076 echo: signed out, the callback error answer is unchanged (sign-in page, not compressed by the Worker, no Vary: Accept-Encoding)', anonEcho.status === gate.status && !anonEcho.h('Content-Encoding') && !/accept-encoding/i.test(anonEcho.h('Vary') || '') && anonEcho.h('Cache-Control') === gate.h('Cache-Control') && /Enter Olympus/.test(anonEcho.bytes.toString('utf8')), anonEcho.status + ' ' + anonEcho.h('Cache-Control'));
  // Sign-out: the browser may keep its copy of the script (owner-accepted), but nothing it asks for is answered.
  const OUT = '300000000000000008';
  await seedUser(OUT, 'Out Going'); await checkedAt(OUT, now);
  const kept = await raw(OUT, '/static/app.js' + V), meBefore = await raw(OUT, '/api/me');
  const signedOff = await raw(OUT, '/auth/logout', { method: 'POST' });
  const meAfter = await raw(OUT, '/api/me'), pubAfter = await raw(OUT, '/api/public'), jsAfter = await raw(OUT, '/static/app.js' + V), pageAfter = await raw(OUT, '/');
  report.cl2076.signOut = { before: [kept.status, meBefore.status], logout: signedOff.status, after: { apiMe: meAfter.status, apiPublic: pubAfter.status, appJs: jsAfter.status, page: pageAfter.status } };
  check('CL2-076 sign-out: before it, the script is served for keeping and /api/me answers', kept.status === 200 && kept.h('Cache-Control') === IMMUTABLE && meBefore.status === 200);
  check('CL2-076 sign-out: sign-out succeeds and clears the session cookie', signedOff.status === 200 && /__Host-olg=;/.test(signedOff.h('Set-Cookie') || ''));
  check('CL2-076 sign-out: the old session cookie gets no API answer (401) and no script from the Worker', meAfter.status === 401 && pubAfter.status === 401 && jsAfter.status === 401 && jsAfter.h('Cache-Control') === 'no-store, no-transform', report.cl2076.signOut.after);
  check('CL2-076 sign-out: the page is the sign-in page, which loads no app.js', pageAfter.status === 200 && /Enter Olympus/.test(pageAfter.bytes.toString('utf8')) && !pageAfter.bytes.toString('utf8').includes('/static/app.js'));
  // Review finding 4 (13 Nov 2026): a signed-in account the gate does not admit (here one that left the server) still
  // makes its three own-record reads; they lose no-transform like every member /api answer and stay no-store.
  const DEPARTED = '300000000000000009';
  await seedUser(DEPARTED, 'De Parted'); await checkedAt(DEPARTED, now); await cookieFor(DEPARTED);
  await fixtureRun('UPDATE site_users SET in_server = 0 WHERE discord_id = ?', DEPARTED);
  const ownReads = {};
  const GATE_REFUSAL = 'This account cannot enter the guild site.';
  for (const p of ['/api/me', '/api/application', '/api/community/context']) { const r = await raw(DEPARTED, p), body = r.bytes.toString('utf8'); ownReads[p] = { status: r.status, cache: r.h('Cache-Control'), gate: body.includes(GATE_REFUSAL) }; }
  const refusedPage = await raw(DEPARTED, '/api/public'), refusedBody = refusedPage.bytes.toString('utf8');
  report.cl2076.ownReads = { ...ownReads, '/api/public': { status: refusedPage.status, cache: refusedPage.h('Cache-Control'), gate: refusedBody.includes(GATE_REFUSAL) } };
  // /api/application has no GET answer of its own: the API answers it 403 itself, after the gate let it through.
  check('CL2-076: a signed-in account that is not admitted passes the gate for its three own-record reads, each answered no-store without no-transform; the gate refuses anything else (no-store, no-transform)',
    Object.values(ownReads).every(v => !v.gate && v.cache === 'no-store') && ownReads['/api/me'].status === 200 && ownReads['/api/community/context'].status === 200
    && refusedPage.status === 403 && report.cl2076.ownReads['/api/public'].gate && refusedPage.h('Cache-Control') === 'no-store, no-transform', report.cl2076.ownReads);
  // A new build: the same Worker with only its BUILD string changed (in memory, as a deployment of the next build
  // would be), over the same modules and database. Its page names the new version, and the old version is not kept.
  const NEXT = '2026-11-14.281 Next build', VN = '?v=' + encodeURIComponent(NEXT);
  const nextIndex = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(path.join(ROOT, 'src', 'index.ts'), 'utf8').replace(/const BUILD = "[^"]+"/, 'const BUILD = ' + JSON.stringify(NEXT)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(nextIndex, nextIndex.exports, p => load(p));
  const viaNext = async (pathname, init = {}) => { const r = await nextIndex.exports.default.fetch(new Request('https://guild.example' + pathname, { headers: { Cookie: await cookieFor(MEMBER), 'Sec-Fetch-Site': 'same-origin', 'X-Olympus': '2', ...(init.headers || {}) } }), env(entry.originalNativePort(db)), ctx); return { status: r.status, h: n => r.headers.get(n), text: await r.text() }; };
  const nextPage = await viaNext('/'), oldJs = await viaNext('/static/app.js' + V), newJs = await viaNext('/static/app.js' + VN), oldCss = await viaNext('/static/app.css' + V);
  report.cl2076.update = { page: nextPage.status, oldJs: oldJs.h('Cache-Control'), newJs: newJs.h('Cache-Control'), oldCss: oldCss.h('Cache-Control') };
  check('CL2-076 update: the next build\'s page asks for app.js and app.css with the new version only', nextPage.status === 200 && nextPage.text.includes('"/static/app.js' + VN + '"') && nextPage.text.includes('"/static/app.css' + VN + '"') && !nextPage.text.includes(V), report.cl2076.update);
  check('CL2-076 update: after the new build the old version is answered but not kept, the new one is kept', oldJs.status === 200 && oldJs.h('Cache-Control') === 'private, no-store' && oldCss.h('Cache-Control') === 'private, no-store' && newJs.h('Cache-Control') === IMMUTABLE, report.cl2076.update);

  // tools/public-route-cases.json must stay true (a guard): its anonymous member-gated static files (401), the cases
  // beside this change, are answered by the real Worker entry before any asset or database read, exactly as recorded.
  const routeCases = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'tools', 'public-route-cases.json'), 'utf8')).cases.filter(c => c.status === 401 && new URL(c.url).pathname.startsWith('/static/'));
  let touched = 0;
  const trapEnv = { PUBLIC_BASE_URL: 'https://olympus-verify.roach-council.workers.dev', SITE_HOST: 'olympus.roachcouncil.com', ASSETS: { fetch: async () => { touched++; return new Response('asset'); } } };
  Object.defineProperty(trapEnv, 'DB', { get() { touched++; throw Error('an anonymous request touched the database'); } });
  const wrongCases = [];
  for (const c of routeCases) {
    const r = await indexMod.default.fetch(new Request(c.url, { method: c.method }), trapEnv, ctx), body = Buffer.from(await r.arrayBuffer());
    const same = r.status === c.status && sha(body) === c.bodySHA256 && c.headers.every(h => { const v = r.headers.get(h.name); return h.mode === 'absent' ? v === null : h.mode === 'equals' ? v === h.value : typeof v === 'string' && v.includes(h.value); });
    if (!same) wrongCases.push(c.url);
  }
  check(`public routes: the ${routeCases.length} recorded anonymous /static/ 401 cases answer exactly as recorded`, routeCases.length > 40 && wrongCases.length === 0 && touched === 0, { wrong: wrongCases.slice(0, 5), touched });

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`${ok}/${n} checks passed`);
  process.exit(ok === n ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
