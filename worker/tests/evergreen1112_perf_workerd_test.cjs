'use strict';
// Evergreen 12 Nov 2026, lane perf (CL2-077), genuine local Workerd/D1: the hourly membership check is shared across
// concurrent REQUESTS of one isolate. A single Node process cannot prove that, because Workerd runs each request in
// its own I/O context and a promise started by one request is awaited by another. Ten concurrent requests whose check
// is due call the actual site-api.ts stillMember against a real D1 binding; Discord is the only synthetic HTTP.
// Run from worker/: node tests/evergreen1112_perf_workerd_test.cjs [--root <another worker folder, read-only>]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { buildSync } = require('esbuild'), { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const args = process.argv.slice(2), at = args.indexOf('--root');
const ROOT = path.resolve(at >= 0 ? args[at + 1] : path.join(__dirname, '..'));
const GUILD = '800000000000000001', MEMBER = '800000000000000201', GONE = '800000000000000202', DOWN = '800000000000000203';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'evergreen1112-perf-workerd-'));
// The entry imports the chosen tree's own site-api.ts; only the D1 fixture table below is test-local.
const entry = path.join(work, 'entry.mjs');
fs.writeFileSync(entry, `import { stillMember } from ${JSON.stringify(path.join(ROOT, 'src', 'site-api.ts').replace(/\\/g, '/'))};
export default { async fetch(request, env) {
  const url = new URL(request.url), id = url.searchParams.get('id');
  if (url.pathname === '/setup') {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS site_users (discord_id TEXT PRIMARY KEY, nick TEXT, avatar TEXT, in_server INTEGER, checked_at INTEGER, session_version INTEGER)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, ts INTEGER, actor TEXT, action TEXT, subject TEXT, details TEXT)'),
      ...[${JSON.stringify(MEMBER)}, ${JSON.stringify(GONE)}, ${JSON.stringify(DOWN)}].map(u => env.DB.prepare('INSERT OR REPLACE INTO site_users VALUES (?1, NULL, NULL, 1, 1, 1)').bind(u)),
    ]);
    return Response.json({ ok: true });
  }
  if (url.pathname === '/row') return Response.json(await env.DB.prepare('SELECT in_server, checked_at, session_version, (SELECT COUNT(*) FROM audit WHERE actor = ?1) AS audits FROM site_users WHERE discord_id = ?1').bind(id).first());
  const user = { discord_id: id, account_incarnation: 'a'.repeat(32), session_version: 1, privacyGeneration: null, in_server: 1, checked_at: 1, denied: 0 };
  const held = await stillMember(env, user);
  return Response.json({ status: held ? held.status : 200 });
} };
`);
const bundle = buildSync({ entryPoints: [entry], absWorkingDir: ROOT, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:async_hooks'], tsconfig: path.join(ROOT, 'tsconfig.json'), logLevel: 'silent' }).outputFiles[0].text;
let ok = 0, n = 0;
const check = (name, cond, detail) => { n++; if (cond) ok++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail))); };
const calls = new Map();
(async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ rootPath: work, script: bundle, modules: true, name: 'evergreen1112-perf', compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'], host: '127.0.0.1', port: 0, cf: false, log: new Log(LogLevel.NONE),
    resourceTmpPath: path.join(work, 'tmp'), resourcePersistencePath: path.join(work, 'persist'), isolatedResourcePersistencePath: path.join(work, 'isolated'),
    d1Databases: { DB: 'evergreen1112-perf' }, bindings: { DISCORD_BOT_TOKEN: 'workerd-test-only', SITE_GUILD_ID: GUILD },
    outboundService: async request => {
      const u = new URL(request.url), m = u.pathname.match(/^\/api\/v\d+\/guilds\/(\d+)\/members\/(\d+)$/);
      if (u.origin !== 'https://discord.com' || request.method !== 'GET' || !m || m[1] !== GUILD) throw Error('unexpected outbound ' + request.method + ' ' + u.pathname);
      calls.set(m[2], (calls.get(m[2]) || 0) + 1);
      await new Promise(r => setTimeout(r, 150)); // slow enough that the burst overlaps
      if (m[2] === GONE) return Response.json({ message: 'Unknown Member', code: 10007 }, { status: 404 });
      if (m[2] === DOWN) return Response.json({ message: 'upstream' }, { status: 500 });
      return Response.json({ user: { id: m[2] }, nick: 'Nick', avatar: null, roles: [], pending: false });
    } }));
  try {
    await mf.ready;
    await mf.dispatchFetch('http://fixture.invalid/setup');
    const burst = async id => Promise.all(Array.from({ length: 10 }, () => mf.dispatchFetch('http://fixture.invalid/check?id=' + id).then(r => r.json()).then(j => j.status)));
    const row = async id => (await mf.dispatchFetch('http://fixture.invalid/row?id=' + id)).json();
    const member = await burst(MEMBER);
    check('Workerd: 10 concurrent due requests make one Discord member read (CL2-077)', calls.get(MEMBER) === 1, { calls: calls.get(MEMBER) });
    check('Workerd: all 10 are admitted', member.every(s => s === 200), member);
    const r1 = await row(MEMBER);
    check('Workerd: the check time was written', r1.in_server === 1 && r1.checked_at > 1, r1);
    const gone = await burst(GONE);
    const r2 = await row(GONE);
    check('Workerd: a departed member: one read, all 10 refused, one audit row', calls.get(GONE) === 1 && gone.every(s => s === 403) && r2.in_server === 0 && r2.audits === 1, { calls: calls.get(GONE), statuses: gone, row: r2 });
    const down = await burst(DOWN);
    const r3 = await row(DOWN);
    check('Workerd: Discord unavailable: one read, all 10 held (503), nothing written', calls.get(DOWN) === 1 && down.every(s => s === 503) && r3.checked_at === 1, { calls: calls.get(DOWN), statuses: down, row: r3 });
  } finally { await mf.dispose(); fs.rmSync(work, { recursive: true, force: true }); }
  console.log(`${ok}/${n} checks passed`);
  process.exit(ok === n ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
