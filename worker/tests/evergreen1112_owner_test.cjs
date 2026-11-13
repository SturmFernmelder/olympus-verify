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
// Round 3 (CL2-016, CL2-091): more synthetic accounts, their Discord roles (changed by the test), and a bot that answers
// the announcement's channel, self and message calls. Every posted message is kept so a check can count them.
const OFFICER_ROLE = '1554262223038324840', RAID_CHANNEL = '1554266022444408872', APP_ID = '1550176895671341076';
const OFF_A = '300000000000000003', OFF_B = '300000000000000004', FORMER = '300000000000000005', COGM = '300000000000000006', TREAS = '300000000000000007',
  OLD_COGM = '300000000000000008', OLD_TREAS = '300000000000000009', JUSTICE = '300000000000000010', COUNCIL45 = '300000000000000011', BOTH = '300000000000000012', EX_TREAS = '300000000000000013',
  RANK_TREAS = '300000000000000014', VICE = '300000000000000015'; // round 5 final (13 Nov 2026): the rank_treasurer key and office_92
for (const [id, name] of [[OFF_A, 'offa'], [OFF_B, 'offb'], [FORMER, 'former'], [COGM, 'cogm'], [TREAS, 'treas'], [OLD_COGM, 'oldcogm'], [OLD_TREAS, 'oldtreas'], [JUSTICE, 'justice'], [COUNCIL45, 'council'], [BOTH, 'both'], [EX_TREAS, 'extreas'], [RANK_TREAS, 'ranktreas'], [VICE, 'vice']]) users.set(id, { id, username: name, global_name: name, avatar: null });
const rolesOf = new Map([[OFF_A, [OFFICER_ROLE]], [OFF_B, [OFFICER_ROLE]], [FORMER, [OFFICER_ROLE]]]);
const posted = [];
const member = id => ({ user: users.get(id), nick: null, avatar: null, joined_at: '2024-01-15T12:00:00.000Z', roles: [...(rolesOf.get(id) || [])], pending: false });
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
  if (auth.startsWith('Bot ') && m === 'GET' && p === '/users/@me') return res(200, { id: APP_ID, username: 'olympus', bot: true });
  if (auth.startsWith('Bot ') && m === 'GET' && p === `/channels/${RAID_CHANNEL}`) return res(200, { id: RAID_CHANNEL, guild_id: GUILD, type: 0 });
  if (auth.startsWith('Bot ') && m === 'POST' && p === `/channels/${RAID_CHANNEL}/messages`) {
    const b = JSON.parse(init.body), msg = { id: String(1560000000000000000n + BigInt(posted.length + 1)), channel_id: RAID_CHANNEL, author: { id: APP_ID, bot: true }, content: b.content, components: b.components, embeds: [], attachments: [], type: 0, nonce: b.nonce, mention_everyone: false, mention_roles: [], mentions: [] };
    posted.push(msg); return res(200, msg);
  }
  return res(404, { code: 0 });
};

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.function('strftime', (format, value) => { if (format !== '%s' || value !== 'now') throw Error('unexpected clock input'); return String(T); });
entry.installCurrentEntryEpoch(db, { now: T });
const port = entry.originalNativePort(db, {});
// Round 3: the calendar and announcement settings, switched on only for the CL2-016 and CL2-091 sections.
let EXTRA = {};
const rawEnv = () => entry.currentEntryEnvironment({
  DB: port, GUILD_ID: '1549537348516188200', DISCORD_APP_ID: '1550176895671341076', DISCORD_CLIENT_SECRET: 'client-secret',
  DISCORD_BOT_TOKEN: 'bot-token', DISCORD_PUBLIC_KEY: '00', COOKIE_SECRET: 'cookie-secret-for-tests-only-0123456789',
  VERIFY_SECRET: 'verify-secret-for-tests', WATCHER_TOKEN: 'watcher-token-for-tests-only-0123456789', PUBLIC_BASE_URL: 'https://verify.example',
  SITE_HOST: 'guild.example', SITE_GUILD_ID: GUILD, SITE_ADMINS: ADMIN, SITE_JOIN_URL: 'https://discord.gg/example', INTROS_GUILD_ID: GUILD,
  INTROS_ROLES: '', INTROS_CHANNELS: '', ADMISSION_MODE: 'auto', SET_GUILD_NOTE: 'false', QUEUE_CLAIM_LIMIT: '25', QUEUE_CLAIM_TTL_MINUTES: '15',
  ROSTER_MIN_MEMBERS: '0', ROSTER_MAX_SHRINK_PCT: '100', CHANNEL_SERVER_LOG: '', CHANNEL_NOTICES: '', ...EXTRA,
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

  console.log('== CL2-175: reserved-name entry after Blizzard\'s reservation ended ==');
  await signIn(ADMIN); await signIn(MEMBER); await signIn(OTHER);
  let r = await call('PUT', '/api/admin/settings', { who: ADMIN, body: { namesOpen: true } });
  const stored = db.prepare("SELECT value FROM site_settings WHERE key = 'namesOpen'").get();
  check('CL2-175', 'setup: the admin stores namesOpen = true', r.status === 200 && stored && stored.value === '1', r);
  r = await call('PUT', '/api/reserved', { who: MEMBER, body: { names: ['Fern Melder', 'Ana Light'] } });
  check('CL2-175', 'setup: during the reservation a member records two names', r.status === 200 && (await reservedOf(MEMBER)) === 'Ana Light|Fern Melder', r);
  r = await call('PUT', '/api/reserved', { who: OTHER, body: { names: ['Bob Stone'] } });
  check('CL2-175', 'setup: a second member records one name', r.status === 200, r);

  T = Date.parse('2026-11-12T18:00:00Z') / 1000; // after the reservation ended; sessions are signed in again for the new day
  jar.clear(); await signIn(ADMIN); await signIn(MEMBER); await signIn(OTHER);
  const before = rowsOf(MEMBER);
  r = await call('PUT', '/api/reserved', { who: MEMBER, body: { names: ['Fern Melder', 'Ana Light', 'Nova Star'] } });
  check('CL2-175', 'adding a name after the window is refused (403, specific message) while namesOpen is stored true', r.status === 403 && r.data?.error === 'names_closed' && /closed when Blizzard's name reservation ended on 3 November 2026/.test(r.data?.message || ''), r);
  check('CL2-175', '  and nothing was written', rowsOf(MEMBER) === before, rowsOf(MEMBER));
  r = await call('PUT', '/api/reserved', { who: MEMBER, body: { names: ['Fern Melder', 'Ana Bright'] } });
  check('CL2-175', 'changing a recorded name (one out, one in) is refused and changes nothing', r.status === 403 && r.data?.error === 'names_closed' && rowsOf(MEMBER) === before, r);
  r = await call('PUT', '/api/reserved', { who: OTHER, body: { names: ['Cara Moon'] } });
  check('CL2-175', 'a member whose saved list is replaced by a new name is refused too', r.status === 403 && rowsOf(OTHER) === 'Bob Stone:claimed', r);
  check('CL2-175', 'the member still sees the names they recorded (GET /api/me)', (await reservedOf(MEMBER)) === 'Ana Light|Fern Melder', await reservedOf(MEMBER));
  r = await call('PUT', '/api/reserved', { who: MEMBER, body: { names: ['fern melder', 'ANA LIGHT'] } });
  check('CL2-175', 'saving the same names again (any capitalization) is not an addition', r.status === 200 && rowsOf(MEMBER) === before, r);
  r = await call('PUT', '/api/reserved', { who: MEMBER, body: { names: ['Fern Melder'] } });
  check('CL2-175', 'the member can still remove their own name', r.status === 200 && (r.data?.reserved || []).map(x => x.name).join('|') === 'Fern Melder' && (await reservedOf(MEMBER)) === 'Fern Melder', r);
  r = await call('GET', '/api/admin/reserved?status=all', { who: ADMIN });
  const items = (r.data?.items || []).map(x => x.name + ':' + x.status).sort().join('|');
  check('CL2-175', 'the admin Reserved names list still returns the recorded names (and the released one)', r.status === 200 && items === 'Ana Light:released|Bob Stone:claimed|Fern Melder:claimed', items || r);
  r = await call('GET', '/api/admin/reserved', { who: ADMIN });
  check('CL2-175', 'the default admin list (no filter) still answers', r.status === 200 && Array.isArray(r.data?.items) && r.data.items.some(x => x.name === 'Fern Melder'), r.status);
  r = await call('POST', '/api/admin/reserved/approve', { who: ADMIN, body: { ids: db.prepare("SELECT id FROM site_reserved WHERE name = 'Bob Stone'").all().map(x => x.id) } });
  check('CL2-175', 'officers can still act on a recorded name (approve)', r.status === 200 && r.data?.changed === 1, r);
  r = await call('PUT', '/api/reserved', { who: OTHER, body: { names: [] } });
  check('CL2-175', 'a member can empty their list after the window', r.status === 200 && rowsOf(OTHER) === 'Bob Stone:released', rowsOf(OTHER));

  console.log('== CL2-175: the page copy ==');
  const app = fs.readFileSync(path.join(ROOT, 'public/static/app.js'), 'utf8'), data = fs.readFileSync(path.join(ROOT, 'src/site-data.ts'), 'utf8');
  const pageAt = (app.match(/const NAME_ENTRY_CLOSED_AT = (\d+);/) || [])[1], serverAt = (data.match(/export const NAME_ENTRY_CLOSED_AT = (\d+);/) || [])[1];
  check('CL2-175', 'page and Worker close entry at the same instant, the end of 3 November 2026 in UTC', !!pageAt && pageAt === serverAt && Number(pageAt) === Date.UTC(2026, 10, 4) / 1000, { pageAt, serverAt });
  check('CL2-175', 'the admin switch says it can no longer open entry', app.includes('This switch no longer opens entry: the site has refused new or changed names since Blizzard\'s name reservation ended on 3 November 2026.'), '');
}

// ---------------------------------------------------------------- Part 1b (round 3): CL2-016 and CL2-091 on the real Worker
// Direct test rows go through the write-admission port, as the historical treasury test does (raw writes are refused).
const testWriter = () => load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(port, 'writer', 'canonical', entry.ENTRY_EPOCH);
const confirm = async (id, name) => { await testWriter().prepare('INSERT OR IGNORE INTO members(discord_id) VALUES(?)').bind(id).run(); return testWriter()
  .prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES(?,?,?,'member',?)").bind(name.toLowerCase(), name, id, T).run(); };
const opId = () => crypto.randomBytes(16).toString('base64url');
const iso = s => new Date(s * 1000).toISOString();
// Everything a refused call could have changed about one event: the row, its history, its attendance, its announcement.
const snapshot = id => JSON.stringify({
  e: db.prepare('SELECT title,details,starts_at,duration_min,capacity,status,revision,nonce,attendance_nonce,attendance_generation,signup_generation,created_by,publication_closed FROM community_events WHERE id=?').get(id),
  c: db.prepare('SELECT action,actor,at,fields FROM community_event_changes WHERE event_id=? ORDER BY id').all(id),
  a: db.prepare('SELECT discord_id,state,revision,recorded_by FROM community_event_attendance WHERE event_id=? ORDER BY discord_id').all(id),
  d: db.prepare('SELECT state,message_id,claim_nonce,actor FROM community_event_deliveries WHERE event_id=?').all(id),
  audit: db.prepare('SELECT COUNT(*) AS n FROM audit WHERE subject=?').get(id).n,
});
async function raidCommand(actorId, title, startsAt) {
  // The Discord /raid path itself (guild-calendar219.ts createCalendar219), so created_by is whoever ran the command.
  const env = { ...rawEnv(), DB: testWriter() }, authority = load('./guild-command-authority219'), calendar = load('./guild-calendar219');
  const actor = await authority.captureGuildActor219(env, { guild_id: GUILD, member: { user: { id: actorId, username: users.get(actorId).username } } }, T, T);
  return (await calendar.createCalendar219(env, actor, { title, starts: iso(startsAt), minutes: 60 })).id;
}

async function part1b() {
  EXTRA = { COMMUNITY_FEATURES: 'events,attendance', INTROS_CHANNELS: 'raid-signups=' + RAID_CHANNEL, ROLE_OFFICER: OFFICER_ROLE, EVENT_DISCORD_DELIVERY: 'on',
    ASSETS: { fetch: async () => new Response('/* treasury plan */', { status: 200, headers: { 'Content-Type': 'text/javascript' } }) } };
  jar.clear();
  for (const [id, name] of [[ADMIN, 'Fernadmin'], [MEMBER, 'Alicemember'], [OFF_A, 'Officera'], [OFF_B, 'Officerb'], [FORMER, 'Formerofficer']]) { await signIn(id); await confirm(id, name); }

  console.log('== CL2-016: officers manage the events they created (owner ruling, 13 November 2026) ==');
  const at = T;
  const evA = await raidCommand(OFF_A, 'Officer A raid', at + 3 * 3600);
  const evB = await raidCommand(OFF_B, 'Officer B raid', at + 3 * 3600);
  const evF = await raidCommand(FORMER, 'Former officer raid', at + 3 * 3600);
  const evCancel = await raidCommand(OFF_A, 'Officer A second raid', at + 3 * 3600);
  const evAttend = await raidCommand(OFF_A, 'Officer A attendance raid', at + 1800);
  const evAttendF = await raidCommand(FORMER, 'Former officer attendance raid', at + 1800);
  const creators = db.prepare(`SELECT id, created_by FROM community_events WHERE id IN (?,?,?,?,?,?)`).all(evA, evB, evF, evCancel, evAttend, evAttendF);
  check('CL2-016', 'setup: the /raid command records who ran it as the event\'s creator', creators.length === 6 && creators.every(r => r.created_by === ({ [evA]: OFF_A, [evB]: OFF_B, [evF]: FORMER, [evCancel]: OFF_A, [evAttend]: OFF_A, [evAttendF]: FORMER })[r.id]), creators);
  rolesOf.delete(FORMER); // FORMER ran /raid as an officer and has since lost the role
  const rev = id => db.prepare('SELECT revision FROM community_events WHERE id=?').get(id).revision;
  const edit = (who, id, title) => call('POST', '/api/community/events/update', { who, body: { eventId: id, revision: rev(id), title } });
  const refusedUnchanged = async (label, id, run, want) => {
    const before = snapshot(id), r = await run();
    check('CL2-016', label, r.status >= 400 && want(r) && snapshot(id) === before, { status: r.status, data: r.data, changed: snapshot(id) !== before });
  };

  let r = await call('GET', `/api/community/event?id=${evA}`, { who: OFF_A });
  check('CL2-016', 'the creator officer sees canManage on their event, without the organizer-only sign-up refs', r.status === 200 && r.data?.event?.canManage === true && (r.data.signups || []).every(s => !('ref' in s)), r.data?.event);
  r = await call('GET', `/api/community/events?from=${encodeURIComponent(iso(at))}&to=${encodeURIComponent(iso(at + 86400))}`, { who: OFF_A });
  const listed = Object.fromEntries((r.data?.events || []).map(e => [e.id, e.canManage]));
  check('CL2-016', 'in the calendar list the officer manages their own events only', r.status === 200 && listed[evA] === true && listed[evCancel] === true && listed[evB] === false && listed[evF] === false, listed);
  r = await call('GET', `/api/community/event?id=${evA}`, { who: OFF_B });
  check('CL2-016', 'another officer sees no canManage on it', r.status === 200 && r.data?.event?.canManage === false, r.data?.event);
  r = await call('GET', `/api/community/event?id=${evF}`, { who: FORMER });
  check('CL2-016', 'a former officer sees no canManage on the event they created', r.status === 200 && r.data?.event?.canManage === false, r.data?.event);

  r = await edit(OFF_A, evA, 'Officer A raid, renamed');
  check('CL2-016', 'edit: the creator officer may', r.status === 200 && r.data?.event?.title === 'Officer A raid, renamed' && r.data.event.canManage === true, r);
  await refusedUnchanged('edit: another officer may not (not_event_organizer), and the event is unchanged', evA, () => edit(OFF_B, evA, 'Taken over'), x => x.data?.error === 'not_event_organizer');
  await refusedUnchanged('edit: a former officer who created it may not (not_organizer), unchanged', evF, () => edit(FORMER, evF, 'Still mine'), x => x.status === 403 && x.data?.error === 'not_organizer');
  await refusedUnchanged('edit: a member may not (not_organizer), unchanged', evA, () => edit(MEMBER, evA, 'Member edit'), x => x.status === 403 && x.data?.error === 'not_organizer');
  r = await edit(ADMIN, evB, 'Officer B raid, admin edit');
  check('CL2-016', 'edit: an admin may edit any officer\'s event', r.status === 200 && r.data?.event?.title === 'Officer B raid, admin edit', r);

  const preview = who => call('GET', `/api/community/events/discord?eventId=${evA}`, { who });
  const publish = async (who, id) => {
    const p = await call('GET', `/api/community/events/discord?eventId=${id}`, { who });
    return p.status !== 200 ? p : call('POST', '/api/community/events/discord/publish', { who, body: { eventId: id, revision: p.data.revision, opId: opId(), payloadHash: p.data.payloadHash } });
  };
  r = await preview(OFF_A);
  check('CL2-016', 'announcement: the creator officer reads the preview and may publish', r.status === 200 && r.data?.canPublish === true, r);
  await refusedUnchanged('announcement: another officer may not publish it, nothing is posted', evA, async () => { const n = posted.length, x = await publish(OFF_B, evA); return { ...x, status: posted.length === n ? x.status : 200 }; }, x => x.status === 404 || x.status === 403);
  await refusedUnchanged('announcement: a former officer may not publish their own event', evF, async () => { const n = posted.length, x = await publish(FORMER, evF); return { ...x, status: posted.length === n ? x.status : 200 }; }, x => x.status === 403 && x.data?.error === 'not_organizer');
  await refusedUnchanged('announcement: a member may not publish it', evA, async () => { const n = posted.length, x = await publish(MEMBER, evA); return { ...x, status: posted.length === n ? x.status : 200 }; }, x => x.status === 403 && x.data?.error === 'not_organizer');
  let n = posted.length;
  r = await publish(OFF_A, evA);
  check('CL2-016', 'announcement: the creator officer publishes it (one message posted)', r.status === 200 && r.data?.delivery?.state === 'posted' && posted.length === n + 1, r);
  n = posted.length;
  r = await publish(ADMIN, evB);
  check('CL2-016', 'announcement: an admin publishes another officer\'s event', r.status === 200 && r.data?.delivery?.state === 'posted' && posted.length === n + 1, r);

  const cancel = (who, id) => call('POST', '/api/community/events/cancel', { who, body: { eventId: id, revision: rev(id) } });
  await refusedUnchanged('cancel: another officer may not, unchanged', evCancel, () => cancel(OFF_B, evCancel), x => x.data?.error === 'not_event_organizer');
  await refusedUnchanged('cancel: a former officer who created it may not, unchanged', evF, () => cancel(FORMER, evF), x => x.status === 403 && x.data?.error === 'not_organizer');
  await refusedUnchanged('cancel: a member may not, unchanged', evCancel, () => cancel(MEMBER, evCancel), x => x.status === 403 && x.data?.error === 'not_organizer');
  r = await cancel(OFF_A, evCancel);
  check('CL2-016', 'cancel: the creator officer may', r.status === 200 && r.data?.event?.status === 'cancelled', r);
  r = await cancel(ADMIN, evF);
  check('CL2-016', 'cancel: an admin may cancel an event created by someone else', r.status === 200 && r.data?.event?.status === 'cancelled', r);

  r = await call('PUT', '/api/community/events/rsvp', { who: MEMBER, body: { eventId: evAttend, status: 'yes', revision: 0 } });
  const r2 = await call('PUT', '/api/community/events/rsvp', { who: MEMBER, body: { eventId: evAttendF, status: 'yes', revision: 0 } });
  check('CL2-016', 'setup: a member signs up for both attendance events', r.status === 200 && r2.status === 200, [r.status, r2.status]);
  T += 3600; // both attendance events have started
  const list = (who, id) => call('GET', `/api/community/event/attendance?id=${id}`, { who });
  r = await list(OFF_A, evAttend);
  const ref = (r.data?.attendance || [])[0]?.ref;
  check('CL2-016', 'attendance: the creator officer reads the list', r.status === 200 && typeof ref === 'string' && r.data.event.canManage === true, r);
  const record = (who, id, state, revision) => call('POST', '/api/community/attendance/record', { who, body: { eventId: id, entries: [{ ref, state, revision }] } });
  r = await list(OFF_B, evAttend);
  check('CL2-016', 'attendance: another officer may not read the list (not_event_organizer)', r.status === 403 && r.data?.error === 'not_event_organizer' && !('attendance' in (r.data || {})), r);
  await refusedUnchanged('attendance: another officer may not record, unchanged', evAttend, () => record(OFF_B, evAttend, 'absent', 0), x => x.status === 403 && x.data?.error === 'not_event_organizer');
  r = await list(FORMER, evAttendF);
  check('CL2-016', 'attendance: a former officer may not read the list of the event they created', r.status === 403 && r.data?.error === 'not_organizer', r);
  await refusedUnchanged('attendance: a former officer may not record on it, unchanged', evAttendF, () => record(FORMER, evAttendF, 'present', 0), x => x.status === 403 && x.data?.error === 'not_organizer');
  await refusedUnchanged('attendance: a member may not record, unchanged', evAttend, () => record(MEMBER, evAttend, 'present', 0), x => x.status === 403 && x.data?.error === 'not_organizer');
  r = await record(OFF_A, evAttend, 'present', 0);
  check('CL2-016', 'attendance: the creator officer records it', r.status === 200 && r.data?.results?.[0]?.result === 'ok' && db.prepare('SELECT state FROM community_event_attendance WHERE event_id=?').get(evAttend)?.state === 'present', r);
  r = await record(ADMIN, evAttend, 'excused', 1);
  check('CL2-016', 'attendance: an admin records on an officer\'s event', r.status === 200 && r.data?.results?.[0]?.result === 'ok' && db.prepare('SELECT state FROM community_event_attendance WHERE event_id=?').get(evAttend)?.state === 'excused', r);
  // Round 5 (owner, 13 Nov 2026, about 12:15 UTC) widened CL2-016: the creator officer now decides its own event's
  // roster and schedules events on the website; the full matrix is in evergreen1112_cal_test.cjs.
  r = await call('POST', '/api/community/events/decide', { who: OFF_A, body: { eventId: evA, entries: [{ ref, decision: 'accepted', revision: 0 }] } });
  check('CL2-016', 'round 5: the creator officer\'s roster decision on its own event is not refused for its role', r.status !== 403 && r.data?.error !== 'not_organizer', r);
  r = await call('POST', '/api/community/events/decide', { who: OFF_B, body: { eventId: evA, entries: [{ ref, decision: 'accepted', revision: 0 }] } });
  check('CL2-016', 'round 5: another officer\'s roster decision on it is refused (403 not_organizer, with the role sentence)', r.status === 403 && r.data?.error === 'not_organizer' && /belongs to another organizer/.test(r.data?.message || ''), r);
  r = await call('POST', '/api/community/events', { who: OFF_A, body: { opId: opId(), title: 'Website event', startsAt: iso(T + 7200), durationMin: 60 } });
  check('CL2-016', 'round 5: an officer schedules an event on the website', r.status === 200 && r.data?.event?.title === 'Website event', r);
  r = await call('POST', '/api/community/events', { who: MEMBER, body: { opId: opId(), title: 'Member event', startsAt: iso(T + 7200), durationMin: 60 } });
  check('CL2-016', 'round 5: a member still cannot (403 not_organizer)', r.status === 403 && r.data?.error === 'not_organizer', r);

  console.log('== CL2-091: the Treasury appointment route reads the Co-Guild Master and Lord High Treasurer seats ==');
  const holders = [[COGM, 'Cogmseat'], [TREAS, 'Treasseat'], [OLD_COGM, 'Oldcogm'], [OLD_TREAS, 'Oldtreas'], [JUSTICE, 'Justiceseat'], [COUNCIL45, 'Councilseat'], [BOTH, 'Bothkeys'], [EX_TREAS, 'Extreas'], [RANK_TREAS, 'Ranktreas'], [VICE, 'Viceseat']];
  for (const [id, name] of holders) { await signIn(id); await confirm(id, name); }
  const appoint = map => call('PUT', '/api/admin/settings', { who: ADMIN, body: { appointed: Object.fromEntries(Object.entries(map).map(([k, id]) => [k, `<@${id}>`])), appointedCharactersConfirmed: true, namesConfirmed: true } });
  // Round 5 final (13 Nov 2026, Codex's d54a954): the appointment route admits five closed keys of the same two seat
  // families (site-treasury-access.ts TREASURY_APPOINTMENT_SEATS): office_19 with its alias co_gm, office_86 with its
  // aliases treasurer and rank_treasurer, each only with its own current publication proof (the admin route writes it as
  // "<key>:publication:<64 hex>" beside the pointer). office_92 is in the co_gm family's source keys but is not a key.
  r = await appoint({ office_19: COGM, office_86: EX_TREAS, co_gm: OLD_COGM, treasurer: OLD_TREAS, rank_treasurer: RANK_TREAS, office_92: VICE, office_101: JUSTICE, office_45: COUNCIL45, office_97: BOTH });
  check('CL2-091', 'setup: the admin publishes the seats (office_19, office_86, the co_gm, treasurer and rank_treasurer keys, office_92 and three other Council seats)', r.status === 200, r);
  const access = async who => (await call('GET', '/api/treasury-plan/access', { who })).data;
  const plan = async who => (await call('GET', '/static/treasury-plan207.js', { who })).status;
  const proved = (key, id) => { let stored = {}; try { stored = JSON.parse(db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get()?.value || '{}'); } catch { /* none */ }
    return stored[key] === `<@${id}>` && Object.keys(stored).filter(k => k.startsWith(key + ':publication:')).length === 1 && Object.entries(stored).some(([k, v]) => new RegExp('^' + key + ':publication:[0-9a-f]{64}$').test(k) && v === `<@${id}>`); };
  let a = await access(COGM);
  check('CL2-091', 'the holder of the published Co-Guild Master seat (office_19) is admitted', a?.canRead === true, a);
  a = await access(EX_TREAS);
  check('CL2-091', 'the holder of the published Lord High Treasurer seat (office_86) is admitted', a?.canRead === true, a);
  for (const [id, key, what] of [[OLD_COGM, 'co_gm', 'the co_gm key (office_19\'s alias)'], [OLD_TREAS, 'treasurer', 'the treasurer key (office_86\'s alias)'], [RANK_TREAS, 'rank_treasurer', 'the rank_treasurer key (office_86\'s historical alias)']]) {
    a = await access(id);
    check('CL2-091', `${what} published with its own exact publication proof admits its holder`, proved(key, id) && a?.canRead === true, a);
    const s = await plan(id);
    check('CL2-091', `  the plan's data file follows the same gate for ${what} (200)`, s === 200, s);
  }
  for (const [id, what] of [[VICE, 'the Vice Guild Master seat (office_92, in the co_gm family but not a Treasury key)'], [JUSTICE, 'another Council seat (office_101, Justice)'], [COUNCIL45, 'the High Council appointment office_45'], [MEMBER, 'a member with no seat']]) {
    a = await access(id);
    check('CL2-091', `${what} no longer admits, and the refusal names the two seats`, a?.canRead === false && /the holders of the published Co-Guild Master and Lord High Treasurer seats/.test(a.admits || ''), a);
    const s = await plan(id);
    check('CL2-091', `  the plan's data file follows the same gate for ${what} (403)`, s === 403, s);
  }
  check('CL2-091', 'the seat holders read the plan\'s data file (200)', (await plan(COGM)) === 200 && (await plan(EX_TREAS)) === 200, '');
  r = await appoint({ office_19: COGM, office_86: TREAS, co_gm: BOTH, office_97: BOTH });
  check('CL2-091', 'setup: the Treasurer seat moves to a new holder; the old co_gm key goes to someone else', r.status === 200, r);
  a = await access(EX_TREAS);
  check('CL2-091', 'a former holder of the Lord High Treasurer seat is no longer admitted', a?.canRead === false, a);
  check('CL2-091', '  and the former holder\'s data-file request is refused', (await plan(EX_TREAS)) === 403, '');
  a = await access(TREAS);
  check('CL2-091', 'the new holder of the Lord High Treasurer seat is admitted', a?.canRead === true, a);
  // Round 5 final: the second publication withdraws treasurer and rank_treasurer and moves co_gm to BOTH, so each former
  // key holder's publication is gone and refuses them (access and data file); BOTH is admitted through co_gm alone (its
  // other seat, office_97, admits nothing).
  const withdrawn = [];
  for (const id of [OLD_COGM, OLD_TREAS, RANK_TREAS]) withdrawn.push({ id, access: await access(id), plan: await plan(id) });
  a = await access(BOTH);
  check('CL2-091', 'a withdrawn co_gm, treasurer or rank_treasurer publication refuses its former holder, and the new co_gm holder (also on another Council seat) is admitted through co_gm',
    withdrawn.every(w => w.access?.canRead === false && w.plan === 403) && proved('co_gm', BOTH) && a?.canRead === true, { withdrawn, a });
  r = await appoint({ office_19: BOTH, office_86: TREAS, co_gm: BOTH });
  a = await access(BOTH);
  check('CL2-091', 'the same person on co_gm and on the Co-Guild Master seat is admitted (through the seat)', r.status === 200 && a?.canRead === true, a);
  a = await access(COGM);
  check('CL2-091', 'the replaced Co-Guild Master seat holder is refused', a?.canRead === false, a);
  const treasury = load('./site-treasury-access');
  // Round 5 final: five closed keys, all of the two families: the primary keys office_19 and office_86, the family keys
  // co_gm and treasurer themselves, and rank_treasurer, catalogued as an alias of office_86. No other key (office_92 included).
  check('CL2-091', 'the gate exports exactly the five keys of the Co-Guild Master and Lord High Treasurer families', JSON.stringify(treasury.TREASURY_APPOINTMENT_SEATS) === '["office_19","office_86","co_gm","treasurer","rank_treasurer"]' && Object.isFrozen(treasury.TREASURY_APPOINTMENT_SEATS)
    && (() => { const src = fs.readFileSync(path.join(ROOT, 'src/site-role-directory203.ts'), 'utf8'), offices = fs.readFileSync(path.join(ROOT, 'src/governance-offices.ts'), 'utf8');
      return /key: 'co_gm'[^\n]*primaryKey: 'office_19'/.test(src) && /key: 'treasurer'[^\n]*primaryKey: 'office_86'/.test(src) && /"key": "rank_treasurer",\s*"label": "[^"]*",\s*"group": "office",\s*"aliasOf": "office_86"/.test(offices); })(), treasury.TREASURY_APPOINTMENT_SEATS);
  EXTRA = {};
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
  console.log('== CL2-175 through the harness (' + URL0 + ') ==');
  let r = await http('admin', 'PUT', '/api/admin/settings', { namesOpen: true });
  check('CL2-175', 'harness: the admin stores namesOpen = true', r.status === 200 && r.data?.settings?.namesOpen === true, r.status);
  const fresh = 'Qaowner ' + String.fromCharCode(97 + (Date.now() % 26)) + 'ight';
  r = await http('member', 'PUT', '/api/reserved', { names: [fresh] });
  check('CL2-175', 'harness: a member adding a name now is refused with names_closed', r.status === 403 && r.data?.error === 'names_closed', { status: r.status, data: r.data });
  r = await http('member', 'GET', '/api/me');
  check('CL2-175', 'harness: the member\'s own reserved list still reads', r.status === 200 && Array.isArray(r.data?.reserved), r.status);
  r = await http('admin', 'GET', '/api/admin/reserved?status=all');
  check('CL2-175', 'harness: the admin Reserved names list still reads', r.status === 200 && Array.isArray(r.data?.items), r.status);
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

    console.log('== CL2-175: Home as a member and as an applicant in Edge ==');
    for (const persona of ['member', 'applicant']) {
      await go(URL0 + '/__qa/' + persona);
      for (const [width, height] of [[1280, 900], [375, 812]]) {
        await size(width, height);
        await go(URL0 + '/#/');
        let state = null;
        for (let i = 0; i < 50; i++) { state = await cdp.eval(`(() => { const m = document.querySelector('main'); const n = document.querySelector('#names'); return m && n ? { main: m.innerText, names: n.innerText, cards: m.querySelectorAll('.launch-and-admission218 .date-card').length, count: (document.getElementById('names-count') || {}).textContent || '', overflow: document.documentElement.scrollWidth - innerWidth } : null; })()`); if (state) break; await sleep(200); }
        report.home[persona + '@' + width] = state && { cards: state.cards, count: state.count, overflow: state.overflow, notice: /Website name entry is open/.test(state.main), names: state.names.slice(0, 400) };
        check('CL2-175', `Home as ${persona} at ${width} px no longer says website name entry is open`, !!state && !/Website name entry is open|Website name entry opens soon/.test(state.main) && state.cards === 1, report.home[persona + '@' + width]);
        check('CL2-175', `  the names panel says entry closed when Blizzard's reservation ended, with no entry boxes (${persona}, ${width} px)`, !!state && state.names.includes('Name entry on this site closed when it ended.') && !/Save names/.test(state.names) && state.overflow <= 0, state && state.names.slice(0, 300));
      }
    }
    await go(URL0 + '/__qa/admin');
    await size(1280, 900);
    await go(URL0 + '/#/admin/settings');
    let hint = null;
    for (let i = 0; i < 50; i++) { hint = await cdp.eval(`(() => { const l = [...document.querySelectorAll('label.check')].find(x => x.textContent.includes('People may enter reserved names')); return l ? l.textContent : null; })()`); if (hint) break; await sleep(200); }
    check('CL2-175', 'admin Settings: the name-entry switch carries the one-sentence note that it no longer opens entry', !!hint && hint.includes('This switch no longer opens entry'), hint);
    if (!args.only || args.only === 'round3') await part2round3(cdp, go, size);
    if (args.report) fs.writeFileSync(args.report, JSON.stringify(report, null, 2) + '\n');
  } finally { await cdp.close(); }
}

// Round 3 through the harness (CL2-016, CL2-091): the harness's officer persona holds the Discord Officer role; its
// treasurer and cogm personas hold only the old co_gm and treasurer keys. Website events can only be created by an
// organizer (the admin), so the officer's own-event page view is shown by rewriting canManage in the event answer the
// page reads; the Worker still refuses that officer every write (checked here over HTTP and on the real Worker above).
async function part2round3(cdp, go, size) {
  console.log('== CL2-091 through the harness ==');
  for (const persona of ['treasurer', 'cogm']) {
    const r = await http(persona, 'GET', '/api/treasury-plan/access');
    check('CL2-091', `harness: the ${persona} persona (only the old ${persona === 'cogm' ? 'co_gm' : 'treasurer'} key) is refused, and the sentence names the two seats`, r.status === 200 && r.data?.canRead === false && /the holders of the published Co-Guild Master and Lord High Treasurer seats/.test(r.data.admits || ''), r.data);
  }
  await go(URL0 + '/__qa/admin'); await size(1280, 900); await go(URL0 + '/#/admin/appointments');
  let seats = null;
  for (let i = 0; i < 50 && !seats; i++) { seats = await cdp.eval(`(() => { const t = document.querySelector('main')?.textContent || ''; return /Treasury-plan access seat/.test(t) ? t : null; /* the rows sit in collapsed details */ })()`); if (!seats) await sleep(200); }
  const kinds = seats ? [...seats.matchAll(/\(([a-z_0-9]+)\)\n?[^\n]*/g)].length : 0;
  check('CL2-091', 'admin Settings labels office_19 and office_86 as the Treasury-plan access seats, and co_gm and treasurer as display aliases', !!seats && /Co-Guild Master — Treasury-plan access seat \(office_19\)/.test(seats) && /Lord High Treasurer · Minister of the Imperial Exchequer — Treasury-plan access seat \(office_86\)/.test(seats)
    && /Co-Guild Master — Leadership display alias \(co_gm\)/.test(seats) && !/Treasury-plan access appointment/.test(seats) && /The older co_gm and treasurer records are display aliases and open nothing\./.test(seats), seats ? (seats.match(/[^\n]*Treasury-plan[^\n]*/g) || []).slice(0, 4) : kinds);

  console.log('== CL2-016 through the harness ==');
  const startsAt = new Date(Math.ceil(Date.now() / 1000 + 3 * 3600) * 1000).toISOString();
  let r = await http('admin', 'POST', '/api/community/events', { opId: crypto.randomBytes(16).toString('base64url'), title: 'QA round 3 raid', startsAt, durationMin: 60 });
  const id = r.data?.event?.id;
  check('CL2-016', 'harness setup: the admin schedules a website event', r.status === 200 && typeof id === 'string', r.status);
  if (!id) return;
  const before = await http('officer', 'GET', `/api/community/event?id=${id}`);
  check('CL2-016', 'harness: the officer persona does not manage an event the admin created', before.status === 200 && before.data?.event?.canManage === false, before.data?.event);
  r = await http('officer', 'POST', '/api/community/events/update', { eventId: id, revision: before.data?.event?.revision, title: 'Taken over' });
  const after = await http('officer', 'GET', `/api/community/event?id=${id}`);
  check('CL2-016', 'harness: the officer\'s edit of that event is refused and changes nothing', r.status === 409 && r.data?.error === 'not_event_organizer' && after.data?.event?.title === 'QA round 3 raid' && after.data?.event?.revision === before.data?.event?.revision, { status: r.status, error: r.data?.error });
  r = await http('officer', 'GET', `/api/community/events/discord?eventId=${id}`);
  check('CL2-016', 'harness: the officer cannot read that event\'s announcement preview', r.status === 404 || r.status === 403, r.status);

  const discordPage = async () => {
    await go('about:blank'); // a fresh page load each time: the same hash again would leave the previous view in place
    await go(URL0 + `/#/community/calendar/${id}/discord`);
    let s = null;
    for (let i = 0; i < 60; i++) { s = await cdp.eval(`(() => { const m = document.querySelector('main'); if (!m) return null; const t = m.innerText; return { refused: t.includes('Only the event\'s organizer, the High Council, the War Heads or a site administrator can manage its announcement.'), panel: !!m.querySelector('[data-announcement-preview]'), publish: [...m.querySelectorAll('button')].some(b => /Publish announcement|Update announcement/.test(b.textContent)), reminder: !!m.querySelector('[data-event-reminder]'), loaded: t.includes('Announcement status') || /Ready to publish|could not|not currently eligible|Only the event\'s organizer|unresolved|switched off|published/i.test(t) }; })()`); if (s && (s.refused || (s.panel && s.loaded && (s.reminder || i > 25)))) break; await sleep(200); }
    return s;
  };
  await go(URL0 + '/__qa/officer'); await size(1280, 900);
  let page = await discordPage();
  check('CL2-016', 'page: an officer who did not create the event is refused the announcement page, with no reminder panel', !!page && page.refused && !page.panel && !page.reminder, page);
  // The officer's own event: the event answer the page reads says canManage (what the Worker answers for the creator officer).
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/community/event?id=*', requestStage: 'Response' }] });
  const paused = async p => {
    try {
      const body = await cdp.send('Fetch.getResponseBody', { requestId: p.requestId });
      const json = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
      if (json && json.event) json.event.canManage = true;
      await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode || 200, responseHeaders: (p.responseHeaders || []).filter(x => !/^content-(length|encoding)$/i.test(x.name)), body: Buffer.from(JSON.stringify(json)).toString('base64') });
    } catch { try { await cdp.send('Fetch.continueRequest', { requestId: p.requestId }); } catch { /* gone */ } }
  };
  cdp.on('Fetch.requestPaused', p => { paused(p); });
  page = await discordPage();
  check('CL2-016', 'page: an officer the Worker says manages the event gets the announcement panel, still without the reminder panel', !!page && !page.refused && page.panel && page.publish && !page.reminder, page);
  await go(URL0 + `/#/community/calendar/${id}`);
  let buttons = null;
  for (let i = 0; i < 50 && !buttons; i++) { buttons = await cdp.eval(`(() => { const l = [...document.querySelectorAll('main a.btn')].map(a => a.textContent); return l.includes('Edit') ? l : null; })()`); if (!buttons) await sleep(200); }
  check('CL2-016', 'page: on such an event the officer sees Edit, Attendance and Discord announcement', !!buttons && ['Edit', 'Attendance', 'Discord announcement'].every(b => buttons.includes(b)), buttons);
  await cdp.send('Fetch.disable');
  await go(URL0 + '/__qa/admin');
  page = await discordPage();
  check('CL2-016', 'page: an admin still gets the announcement panel and the reminder panel', !!page && !page.refused && page.panel && page.reminder, page);
}

(async () => {
  try { await part1(); } catch (e) { check('setup', 'part 1 completed without an exception: ' + (e && e.stack || e), false); }
  if (!args.only || args.only === 'round3') { try { await part1b(); } catch (e) { check('setup', 'part 1b (CL2-016, CL2-091) completed without an exception: ' + (e && e.stack || e), false); } }
  if (URL0) { try { await part2(); } catch (e) { check('setup', 'part 2 completed without an exception: ' + (e && e.stack || e), false); } }
  console.log(`\n${failures} failure(s)`);
  process.exit(Math.min(failures, 99));
})();
