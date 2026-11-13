'use strict';
// Evergreen 12 Nov 2026, lane perf (CL2-072, CL2-073, CL2-077, CL2-249): the real Worker (src/*.ts transpiled) over
// the real schema in SQLite behind the repository's original Native D1 port, real sessions from the sole OAuth PROFILE
// issuer, and a counted fake for Discord's REST side only. It measures what a signed-in page load costs and checks:
//   - the catalogue rides once per page load (the boot) and every key the page reads is there; /api/me and /api/public
//     no longer repeat it (CL2-072, CL2-249);
//   - a signed-in GET / needs at most a fixed number of D1 round trips (CL2-073);
//   - a burst of requests whose hourly membership check is due makes one Discord call, and still fails closed (CL2-077).
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
const ASSETS = { fetch: async request => new Response('/* asset ' + new URL(request.url).pathname + ' */', { headers: { 'Content-Type': 'text/css; charset=utf-8' } }) };
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

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(`${ok}/${n} checks passed`);
  process.exit(ok === n ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
