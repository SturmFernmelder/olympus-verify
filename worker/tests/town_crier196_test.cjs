// Real News implementation and original Native admission over real SQLite.
// Only Discord's targeted publication lookup is mocked; no outbound is allowed.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const entry = require('./helpers/privacy129_fixture.cjs');
const root = path.join(__dirname, '..'), cache = new Map();
let T = 1792754000, network = 0;
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T * 1000])); } static now() { return T * 1000; } };
const GUILD = '500000000000000001', ADMIN = '500000000000000071', EDITOR = '500000000000000072', MEMBER = '500000000000000073';
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input));
  if (u.origin !== 'https://discord.com' || !new RegExp(`^/api/v10/guilds/${GUILD}/members/[0-9]{17,20}$`).test(u.pathname) || init.method && init.method !== 'GET') { network++; throw Error('outbound request refused'); }
  const id = u.pathname.split('/').at(-1);
  return new Response(JSON.stringify({ user: { id, username: 'fixture-' + id.slice(-2) }, roles: [], pending: false }), { headers: { 'Content-Type': 'application/json' } });
};
function load(name) {
  if (name === 'node:async_hooks') return require(name);
  const file = path.join(root, 'src', name.replace(/^\.\//, '') + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', source)(mod, mod.exports, p => load(p)); return mod.exports;
}
const news = load('./site-news'), identities = load('./site-appointed-identities'), admission = load('./privacy-write-admission');
let pass = 0, total = 0;
function check(label, ok, detail) { total++; if (ok) pass++; console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok && detail) console.log(detail); }
const noticeBody = id => ({ id, title: 'Guild dispatch', body: 'Plain text guild news.', days: 30 });
async function fixture(office = 'office_50') {
  T += 61; // Independent original sessions and per-minute limiter windows.
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  db.function('strftime', (format, input) => { if (format !== '%s' || input !== 'now') throw Error('unexpected fixture clock'); return String(T); });
  entry.installCurrentEntryEpoch(db, { now: T });
  let before = null, after = null, beforeRan = false, afterRan = false;
  const matches = (plan, text) => plan.some(p => p.statement.includes(text));
  const raw = entry.originalNativePort(db, {
    beforeBatch: async plan => { if (before && matches(plan, before.text)) { const hook = before; before = null; beforeRan = true; await hook.fn(); } },
    afterBatch: async plan => { if (after && matches(plan, after.text)) { const hook = after; after = null; afterRan = true; await hook.fn(); } },
  });
  const DB = admission.createPrivacyWriteAdmissionDatabase(raw, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = entry.currentEntryEnvironment({ DB, COOKIE_SECRET: 'crier-tests-only-cookie-secret-0123456789', DISCORD_BOT_TOKEN: 'fixture-only', DISCORD_APP_ID: '1550176895671341076', SITE_GUILD_ID: GUILD, GUILD_ID: GUILD, SITE_HOST: 'guild.example', PUBLIC_BASE_URL: 'https://verify.example', SITE_ADMINS: ADMIN, COMMUNITY_FEATURES: 'directory' });
  const write = (sql, ...params) => DB.prepare(sql).bind(...params).run();
  const cookies = new Map();
  for (const id of [ADMIN, EDITOR, MEMBER]) {
    await write('INSERT INTO site_users(discord_id,username,in_server,denied,first_login,last_login,account_incarnation)VALUES(?,?,1,0,?,?,?)', id, 'fixture-' + id.slice(-2), T, T, id.padStart(32, 'a'));
    const issued = await entry.issueOriginalEntryCookie(n => load('./' + n), db, { ...env, DB: raw }, id); cookies.set(id, issued.cookie);
    await write('INSERT INTO members(discord_id,banned)VALUES(?,0)', id);
  }
  await write("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('newsOn','1',?,?)", T, ADMIN);
  const prepared = await identities.prepareAppointmentPublication(env, { [office]: `<@${EDITOR}>` });
  if (!prepared.ok) throw Error('publication fixture refused');
  await write("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('appointed',?,?,?)", JSON.stringify(prepared.stored), T, ADMIN);
  const call = async (method = 'GET', parts = [], body = {}, id = EDITOR, headers = {}, oldAdmin = false) => {
    const request = new Request('https://guild.example/api/news/editor' + (parts.length ? '/' + parts.join('/') : ''), { method, headers: { Cookie: cookies.get(id), Origin: 'https://guild.example', 'X-Olympus': '2', ...headers } });
    const actor = { discord_id: id };
    const r = oldAdmin ? await news.handleNewsAdmin(request, env, parts, actor, body) : await news.handleTownCrierEditor(request, env, parts, actor, body);
    return { status: r.status, body: await r.json() };
  };
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const revoke = () => write("UPDATE site_settings SET value='{}' WHERE key='appointed'");
  return { db, raw, DB, env, write, call, one, revoke, before(text, fn) { before = { text, fn }; beforeRan = false; }, after(text, fn) { after = { text, fn }; afterRan = false; }, get beforeRan() { return beforeRan; }, get afterRan() { return afterRan; }, close() { db.close(); } };
}
(async () => {
  {
    const f = await fixture();
    const catalogue = JSON.stringify(f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
    let r = await f.call();
    check('published Lead Correspondent receives existing limits and a DB-clock operation ID', r.status === 200 && r.body.newsOn && r.body.notices.length === 0 && r.body.limits.liveMax === 20 && r.body.limits.titleMax === 80 && r.body.limits.bodyMax === 2000 && /^[A-Za-z0-9_-]{22}$/.test(r.body.opId));
    const body = noticeBody(r.body.opId), id = body.id;
    r = await f.call('POST', [], body);
    check('nonadmin editor creates through existing nonce/op/tombstone transaction', r.status === 200 && r.body.notice.revision === 1 && f.one('SELECT COUNT(*) AS n FROM site_news_ops').n === 1 && f.one('SELECT COUNT(*) AS n FROM audit WHERE action=\'site.news_notice\'').n === 1);
    check('editor DTO omits author account identifiers', !Object.hasOwn(r.body.notice, 'createdBy') && !Object.hasOwn(r.body.notice, 'updatedBy') && !JSON.stringify(r.body).includes(EDITOR));
    r = await f.call('POST', [], body);
    check('same author/content create replay returns the existing notice exactly once', r.status === 200 && r.body.replay && f.one('SELECT COUNT(*) AS n FROM site_news_notices').n === 1 && f.one('SELECT COUNT(*) AS n FROM audit WHERE action=\'site.news_notice\'').n === 1);
    r = await f.call('POST', ['update'], { ...body, revision: 1, title: 'Updated dispatch' });
    check('editor update uses revision compare-and-set and original retention anchor', r.status === 200 && r.body.notice.revision === 2 && f.one('SELECT retain_until-created_at AS life FROM site_news_notices WHERE id=?', id).life === 30 * 86400);
    r = await f.call('POST', ['update'], { ...body, revision: 1 });
    check('stale editor update returns the current revision without author IDs', r.status === 409 && r.body.error === 'stale_revision' && r.body.notice.revision === 2 && !Object.hasOwn(r.body.notice, 'createdBy'));
    await f.write("UPDATE site_settings SET value='0' WHERE key='newsOn'");
    r = await f.call('POST', ['update'], { ...body, revision: 2 });
    check('News OFF prevents editor changes using the existing DB-clock switch', r.status === 409 && r.body.error === 'news_off');
    r = await f.call('POST', ['delete'], { id, revision: 2 });
    check('editor may clean up while News OFF but operation tombstone remains', r.status === 200 && r.body.ok && !f.one('SELECT 1 AS n FROM site_news_notices WHERE id=?', id) && f.one('SELECT 1 AS n FROM site_news_ops WHERE id=?', id));
    await f.write("UPDATE site_settings SET value='1' WHERE key='newsOn'");
    r = await f.call('POST', [], body);
    check('deleted notice cannot be recreated by replaying its old operation', r.status === 409 && r.body.error === 'deleted' && !f.one('SELECT 1 AS n FROM site_news_notices WHERE id=?', id));
    check('audits contain counts/operations, never content', !f.one("SELECT 1 AS n FROM audit WHERE details LIKE '%dispatch%' OR details LIKE '%Plain text%'") && f.one('SELECT COUNT(*) AS n FROM audit WHERE action=\'site.news_notice\'').n === 3);
    check('editor introduces no schema objects', catalogue === JSON.stringify(f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()));
    f.close();
  }
  {
    const f = await fixture();
    const r = await f.call('GET', [], {}, MEMBER);
    check('ordinary member has no editor read or operation ID', r.status === 403 && r.body.error === 'news_editor_forbidden' && !Object.hasOwn(r.body, 'notices') && !Object.hasOwn(r.body, 'opId'));
    await f.write("UPDATE site_settings SET value=? WHERE key='appointed'", JSON.stringify({ office_50: `<@${EDITOR}>` }));
    check('a raw canonical pointer without signed publication consent is insufficient', (await f.call()).status === 403);
    f.close();
  }
  {
    const f = await fixture('office_12');
    check('Broadcaster alone is not Town Crier editor', (await f.call()).status === 403);
    let r = await f.call('GET', [], {}, ADMIN, {}, true), id = r.body.opId;
    r = await f.call('POST', [], noticeBody(id), ADMIN, {}, true);
    check('existing admin News handler retains its original DTO and authority', r.status === 200 && r.body.notice.createdBy === ADMIN && r.body.notice.updatedBy === ADMIN);
    f.close();
  }
  {
    const f = await fixture();
    const id = (await f.call()).body.opId;
    check('cross-origin editor write refuses', (await f.call('POST', [], noticeBody(id), EDITOR, { Origin: 'https://other.example' })).status === 403);
    check('stale numeric page version asks the editor to reload', (await f.call('POST', [], noticeBody(id), EDITOR, { 'X-Olympus': '1' })).status === 409);
    check('nonnumeric page header fails the existing origin guard', (await f.call('POST', [], noticeBody(id), EDITOR, { 'X-Olympus': 'old' })).status === 403);
    for (const [label, change] of [['title80', { title: 'a'.repeat(81) }], ['body2000', { body: 'a'.repeat(2001) }], ['days', { days: 2 }], ['extra authority field', { communityStaff: true }]]) {
      const r = await f.call('POST', [], { ...noticeBody(id), ...change });
      check('existing input limit rejects ' + label, r.status === 400 && !f.one('SELECT 1 AS n FROM site_news_notices'));
    }
    f.close();
  }
  {
    const f = await fixture(), id = (await f.call()).body.opId;
    f.before('INSERT INTO site_news_ops', f.revoke);
    const r = await f.call('POST', [], noticeBody(id));
    check('appointment revoked immediately before create cannot write or disclose content', f.beforeRan && r.status === 403 && !Object.hasOwn(r.body, 'notice') && !f.one('SELECT 1 AS n FROM site_news_notices') && !f.one('SELECT 1 AS n FROM site_news_ops'));
    f.close();
  }
  {
    const f = await fixture(), id = (await f.call()).body.opId;
    await f.call('POST', [], noticeBody(id));
    f.before('UPDATE site_news_notices SET title', f.revoke);
    const r = await f.call('POST', ['update'], { ...noticeBody(id), revision: 1, title: 'Unauthorized update' });
    check('revoked appointment cannot race the update committing statement', f.beforeRan && r.status === 403 && !Object.hasOwn(r.body, 'notice') && f.one('SELECT title,revision FROM site_news_notices WHERE id=?', id).title === 'Guild dispatch' && f.one('SELECT revision FROM site_news_notices WHERE id=?', id).revision === 1);
    f.close();
  }
  {
    const f = await fixture(), id = (await f.call()).body.opId;
    await f.call('POST', [], noticeBody(id));
    f.before('UPDATE site_news_notices SET nonce', () => f.write('UPDATE site_users SET in_server=0 WHERE discord_id=?', EDITOR));
    const r = await f.call('POST', ['delete'], { id, revision: 1 });
    check('lost membership cannot race the delete committing statement', f.beforeRan && r.status === 403 && !Object.hasOwn(r.body, 'notice') && !!f.one('SELECT 1 AS n FROM site_news_notices WHERE id=?', id));
    f.close();
  }
  {
    const f = await fixture(), id = (await f.call()).body.opId;
    await f.call('POST', [], noticeBody(id));
    f.before('AS op, EXISTS', f.revoke);
    const r = await f.call('POST', [], noticeBody(id));
    check('create replay/error explanation re-admits office authority before reading', f.beforeRan && r.status === 403 && !Object.hasOwn(r.body, 'notice') && !Object.hasOwn(r.body, 'replay'));
    f.close();
  }
  {
    const f = await fixture(), id = (await f.call()).body.opId;
    f.after('INSERT INTO site_news_ops', f.revoke);
    const r = await f.call('POST', [], noticeBody(id));
    check('postcommit revocation withholds the receipt without undoing or repeating the committed notice', f.afterRan && r.status === 403 && !Object.hasOwn(r.body, 'notice') && f.one('SELECT COUNT(*) AS n FROM site_news_notices').n === 1 && f.one('SELECT COUNT(*) AS n FROM site_news_ops').n === 1);
    f.close();
  }
  {
    const f = await fixture();
    f.before('SELECT id, title, body', f.revoke);
    const r = await f.call();
    check('editor list payload is withheld when assignment changes before its read', f.beforeRan && r.status === 403 && !Object.hasOwn(r.body, 'notices') && !Object.hasOwn(r.body, 'opId'));
    f.close();
  }
  check('no network outside the explicit mocked member GET occurred', network === 0);
  console.log(`\n${pass}/${total} passed; unexpected outbound=${network}`);
  if (pass !== total || network) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
