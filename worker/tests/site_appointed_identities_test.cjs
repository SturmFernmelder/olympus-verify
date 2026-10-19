// Real source and Native SQLite: explicit two-office opt-in, member-only projection,
// original-session races, own-copy coverage and the unchanged exact-pointer eraser.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const entry = require('./helpers/privacy129_fixture.cjs');
const root = path.join(__dirname, '..'), sourcePins = new Map(), cache = new Map();
const T = 1792000000, RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T * 1000])); } static now() { return T * 1000; } };
let network = 0;
let originalTestFetch = async () => { network++; throw Error('provider calls are forbidden in this suite'); };
globalThis.fetch = (...args) => originalTestFetch(...args);
function load(name) {
  if (name === 'node:async_hooks') return require(name);
  const file = path.join(root, 'src', name.replace(/^\.\//, '') + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const bytes = fs.readFileSync(file); sourcePins.set(file, bytes); const mod = { exports: {} }; cache.set(file, mod);
  const code = ts.transpileModule(bytes.toString('utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', code)(mod, mod.exports, p => load(p)); return mod.exports;
}
const identities = load('./site-appointed-identities'), api = load('./site-api'), core = load('./site-core'), site = load('./site');
const cleanup = load('./privacy-native-erasure-cleanup'), admission = load('./privacy-write-admission');
const ADMIN = '300000000000000071', HOLDER = '300000000000000072', SECOND = '300000000000000073', VIEWER = '300000000000000074', STRANGER = '300000000000000075';
let passed = 0, total = 0;
function check(label, ok, detail) { total++; if (ok) passed++; console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok && detail) console.log(detail); }
async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); db.function('strftime', (format, input) => { if (format !== '%s' || input !== 'now') throw Error('unexpected fixture clock'); return String(T); }); entry.installCurrentEntryEpoch(db, { now: T });
  let before = null, beforeSave = null, beforeAccounts = null;
  const raw = entry.originalNativePort(db, { beforeBatch: async plan => {
    if (before && plan.some(p => p.statement.includes('AS appointment') || p.statement.includes('FROM audit WHERE'))) { const f = before; before = null; await f(); }
    if (beforeSave && plan.some(p => p.statement.includes('WITH admission AS MATERIALIZED') && p.statement.includes('INSERT INTO site_settings'))) { const f = beforeSave; beforeSave = null; await f(); }
    if (beforeAccounts && plan.some(p => p.statement.includes('FROM json_each(?1) wanted'))) { const f = beforeAccounts; beforeAccounts = null; await f(); }
  } });
  const DB = admission.createPrivacyWriteAdmissionDatabase(raw, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = entry.currentEntryEnvironment({ DB, COOKIE_SECRET: 'appointment-tests-only-cookie-secret-0123456789', SITE_HOST: 'guild.example', PUBLIC_BASE_URL: 'https://verify.example', SITE_GUILD_ID: '300000000000000001', SITE_ADMINS: ADMIN, DISCORD_APP_ID: '300000000000000002', VERIFY_SECRET: 'appointment-tests-only-verify', ROSTER_MIN_MEMBERS: '0', ROSTER_MAX_SHRINK_PCT: '100', COMMUNITY_FEATURES: '' });
  const write = (sql, ...params) => DB.prepare(sql).bind(...params).run();
  const cookies = new Map();
  for (const [id, username, display, nick] of [[ADMIN, 'test-admin', 'Test Administrator', null], [HOLDER, 'holder-one', 'First Display', 'First Nick'], [SECOND, 'holder-two', null, null], [VIEWER, 'test-viewer', null, null], [STRANGER, 'test-stranger', null, null]]) {
    await write('INSERT INTO site_users(discord_id,username,global_name,nick,in_server,denied,first_login,last_login,checked_at,account_incarnation)VALUES(?,?,?,?,1,0,?,?,?,?)', id, username, display, nick, T, T, T, id.padStart(32, 'a'));
    const issued = await entry.issueOriginalEntryCookie(n => load('./' + n), db, { ...env, DB: raw }, id); cookies.set(id, issued.cookie);
    await write('INSERT INTO members(discord_id,banned)VALUES(?,0)', id);
    if (id !== STRANGER) await write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,member_since)VALUES(?,?,?,'member',?,?,?)", 'proof-' + id, 'Proof ' + id.slice(-2), id, T - 50, T - 40, T - 30);
  }
  const setting = async value => write("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('appointed',?,?,?)ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by", typeof value === 'string' ? value : JSON.stringify(value), T, ADMIN);
  const call = async (method, url, id, body) => {
    const headers = { Origin: 'https://guild.example', 'Content-Type': 'application/json', 'X-Olympus': '2', ...(id ? { Cookie: cookies.get(id) } : {}) };
    const r = await api.handleApi(new Request('https://guild.example' + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, new URL('https://guild.example' + url).pathname, () => {});
    return { status: r.status, body: await r.json() };
  };
  const page = async id => {
    const r = await site.handleSite(new Request('https://guild.example/', { headers: id ? { Cookie: cookies.get(id) } : {} }), env, '/', true, 'test .167', () => {});
    const html = await r.text(), boot = /<script type="application\/json" id="boot">([^]*?)<\/script>/.exec(html);
    return { status: r.status, html, boot: boot ? JSON.parse(boot[1]) : null };
  };
  const publish = async map => {
    const r = await call('PUT', '/api/admin/settings', ADMIN, { appointed: map, namesConfirmed: true, appointedCharactersConfirmed: true });
    if (r.status !== 200) throw Error('explicit publication setup refused: ' + JSON.stringify(r));
    return JSON.parse(db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value);
  };
  return { db, env, raw, DB, write, setting, call, page, publish, cookies, before(fn) { before = fn; }, beforeSave(fn) { beforeSave = fn; }, beforeAccounts(fn) { beforeAccounts = fn; }, close() { db.close(); } };
}
(async () => {
  check('only exact canonical Discord pointers opt in', identities.appointmentAccountId('<@' + HOLDER + '>') === HOLDER && [HOLDER, '<@!' + HOLDER + '>', '@holder-one', 'holder-one', '<@' + HOLDER + '> extra', 'Name withheld', '<@1>'].every(v => identities.appointmentAccountId(v) === null));
  check('publication confirmation is required for either supported pointer', !identities.appointmentPublicationConfirmation({ co_gm: '<@' + HOLDER + '>' }, {}) && !identities.appointmentPublicationConfirmation({ treasurer: '<@' + HOLDER + '>' }, { appointedCharactersConfirmed: 'true' }) && identities.appointmentPublicationConfirmation({ treasurer: '<@' + HOLDER + '>' }, { appointedCharactersConfirmed: true }));
  check('typed labels and other roles retain existing semantics', identities.appointmentPublicationConfirmation({ co_gm: 'Typed person', officer: '<@' + HOLDER + '>' }, {}));
  for (const state of ['eligible', 'no-character', 'absent', 'denied', 'departed', 'banned', 'retiring', 'waiting_role', 'held', 'erasing']) {
    const f = await fixture(), target = SECOND;
    if (state === 'no-character') await f.write('DELETE FROM characters WHERE discord_id=?', target);
    if (state === 'absent') await f.write('DELETE FROM site_users WHERE discord_id=?', target);
    if (state === 'denied') await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', target);
    if (state === 'departed') await f.write('UPDATE site_users SET in_server=0 WHERE discord_id=?', target);
    if (state === 'banned') await f.write('UPDATE members SET banned=1 WHERE discord_id=?', target);
    if (state === 'retiring') await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", target);
    if (['waiting_role', 'held', 'erasing'].includes(state)) {
      const generation = f.db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?').get(target).generation;
      const birth = f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(target).account_incarnation;
      await f.write('INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)VALUES(?,?,?,?,?,?,?,?,?,?)', 'b'.repeat(32), target, generation, 'c'.repeat(64), 1, T + 1000, birth, state, T, T + 31622400);
    }
    const expected = ['eligible', 'no-character'].includes(state) ? 'eligible' : state === 'absent' ? 'no_current_profile' : 'unavailable';
    const status = (await identities.appointmentAccountStatuses(f.env, [target])).get(target);
    const r = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: { co_gm: '<@' + HOLDER + '>', treasurer: '<@' + target + '>' }, notice: 'all or none', namesConfirmed: true, appointedCharactersConfirmed: true });
    check('.175 ' + state + ' picker hint agrees with the actual save guard without requiring character proof', status === expected && (expected === 'eligible' ? r.status === 200 : r.status === 409 && r.body.error === 'appointed_account_unavailable' && r.body.role === 'treasurer' && r.body.accountStatus === expected && !f.db.prepare("SELECT 1 FROM site_settings WHERE key='notice'").get()));
    if (expected !== 'eligible') check('.175 ' + state + ' refusal names only the appointment role without private identity details', r.body.message.startsWith('Treasurer / Guild Bank:') && !JSON.stringify(r.body).includes(target) && !JSON.stringify(r.body).includes('holder-two') && !JSON.stringify(r.body).includes('privacy_subjects'));
    if (state === 'absent') check('.175 absent-profile guidance uses normal account sign-in without asserting historical absence', r.body.message.includes('normal Sign in with Discord flow with this account') && !r.body.message.includes('never signed'));
    f.close();
  }
  {
    const f = await fixture(), originalFetch = originalTestFetch;
    f.env.DISCORD_BOT_TOKEN = 'fixture-only';
    originalTestFetch = async () => new Response(JSON.stringify([{ user: { id: HOLDER, username: 'holder-one', global_name: 'First Display' } }, { user: { id: '300000000000000099', username: 'no-profile' } }]), { headers: { 'Content-Type': 'application/json' } });
    try {
      let r = await f.call('GET', '/api/search?purpose=appointment&q=fix175', ADMIN);
      check('.175 admin appointment search returns current eligible and absent-profile hints', r.status === 200 && r.body.results[0].appointmentStatus === 'eligible' && r.body.results[1].appointmentStatus === 'no_current_profile');
      await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', HOLDER);
      r = await f.call('GET', '/api/search?purpose=appointment&q=fix175', ADMIN);
      check('.175 repeated cached Discord names still get fresh appointment standing', r.body.results[0].appointmentStatus === 'unavailable');
      r = await f.call('GET', '/api/search?purpose=appointment&q=fix175', VIEWER);
      check('.175 members cannot request appointment standing by adding the admin purpose parameter', r.status === 200 && r.body.results.every(row => !('appointmentStatus' in row)));
      r = await f.call('GET', '/api/search?q=fix175', ADMIN);
      check('.175 ordinary search retains its existing data contract', r.body.results.every(row => !('appointmentStatus' in row)));
      f.beforeAccounts(async () => f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', ADMIN));
      let refused = false;
      try { r = await f.call('GET', '/api/search?purpose=appointment&q=fix175', ADMIN); refused = r.status !== 200 && !r.body.results; } catch { refused = true; }
      check('.175 appointment hints retain the original fresh reader fence', refused);
    } finally { originalTestFetch = originalFetch; f.close(); }
  }
  {
    const f = await fixture();
    await f.write('DELETE FROM site_users WHERE discord_id=?', STRANGER);
    const info = await load('./lookup').accountInfo(f.env, STRANGER), text = load('./lookup').accountText(info);
    check('.175 lookup describes the current missing profile without claiming no historical login', !info.site.signedUp && text.includes('Guild site: no current site profile.') && !text.includes('never signed in'));
    f.close();
  }
  {
    const f = await fixture(), appointed = { co_gm: '<@' + HOLDER + '>', treasurer: '<@' + SECOND + '>', officer: '<@' + VIEWER + '>', 'class_lead:priest': '<@' + VIEWER + '>', leveling: 'Typed public holder', liaison: 'Name withheld' };
    const stored = await f.publish(appointed), rawBefore = f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value;
    const state = await load('./site-data').loadSiteState(f.env);
    const expected = { ...state.settings, appointed: { co_gm: 'Appointed member', treasurer: 'Appointed member', officer: 'Appointed member', 'class_lead:priest': 'Appointed member', leveling: 'Typed public holder', liaison: 'Name withheld' } };
    const safe = settings => JSON.stringify(settings) === JSON.stringify(expected) && ![HOLDER, SECOND, VIEWER, ':publication:'].some(v => JSON.stringify(settings).includes(v));
    for (const [label, id] of [['anonymous', null], ['unconfirmed', STRANGER], ['confirmed member', VIEWER], ['admin', ADMIN]]) {
      const r = await f.call('GET', '/api/public', id);
      check(label + ' public HTTP settings retain closed offices and all ordinary values without account pointers or proofs', r.status === 200 && safe(r.body.settings) && !('identities' in r.body) && JSON.stringify(r.body.meta) === JSON.stringify(load('./site-data').meta(state.ruleset)) && r.body.now === T);
    }
    for (const [label, id] of [['unconfirmed', STRANGER], ['confirmed member', VIEWER], ['admin', ADMIN]]) {
      const r = await f.call('GET', '/api/me', id), p = await f.page(id);
      check(label + ' own HTTP data masks only settings associations', r.status === 200 && r.body.user.id === id && safe(r.body.settings));
      check(label + ' real member boot contains the same masked settings without proof keys', p.status === 200 && p.boot?.user.id === id && safe(p.boot.settings) && !p.html.includes(':publication:'));
    }
    const publicPage = await f.page();
    check('the real anonymous sign-in page carries no appointment account or proof boot', publicPage.status === 200 && publicPage.boot === null && ![HOLDER, SECOND, ':publication:'].some(v => publicPage.html.includes(v)));
    const overview = await f.call('GET', '/api/admin/overview', ADMIN);
    check('the exact admin editing read retains all canonical pointers and typed labels without internal proofs', overview.status === 200 && JSON.stringify(overview.body.settings.appointed) === JSON.stringify(appointed) && !JSON.stringify(overview.body.settings).includes(':publication:'));
    const memberRead = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('masking general settings preserves fresh confirmed-member identity publication', memberRead.status === 200 && memberRead.body.scope === 'confirmed_guild_members' && memberRead.body.identities.length === 2 && memberRead.body.identities.find(p => p.role === 'co_gm').appointment === appointed.co_gm);
    const board = await f.call('GET', '/api/board/treasurer', STRANGER);
    check('an unconfirmed board read keeps the closed-role conflict without its account association', board.status === 409 && board.body.error === 'appointed' && board.body.appointed === 'Appointed member' && board.body.message.includes('Appointed member') && !JSON.stringify(board.body).includes(SECOND));
    const first = await f.call('PUT', '/api/application', STRANGER, { position: 'treasurer' });
    check('an unconfirmed first-choice application remains refused without echoing the private pointer', first.status === 400 && first.body.field === 'position' && first.body.message.includes('Appointed member') && !JSON.stringify(first.body).includes(SECOND));
    const classLead = await f.call('PUT', '/api/application', STRANGER, { position: 'class_lead', classLead: 'priest' });
    check('an unconfirmed class-lead choice retains its specific refusal without echoing the private pointer', classLead.status === 400 && classLead.body.field === 'classLead' && classLead.body.message.includes('Appointed member') && !JSON.stringify(classLead.body).includes(VIEWER));
    const backup = await f.call('PUT', '/api/application', STRANGER, { position: 'member', backups: ['treasurer'] });
    check('an unconfirmed backup application remains refused without echoing the private pointer', backup.status === 400 && backup.body.field === 'backups' && backup.body.message.includes('Appointed member') && !JSON.stringify(backup.body).includes(SECOND));
    const vote = await f.call('PUT', '/api/board/vote', STRANGER, { role: 'treasurer', candidate: HOLDER, vote: 1 });
    check('an unconfirmed board vote keeps its original appointment conflict without disclosing the holder', vote.status === 409 && vote.body.error === 'appointed' && vote.body.appointed === 'Appointed member' && !JSON.stringify(vote.body).includes(SECOND) && !f.db.prepare('SELECT 1 FROM site_board_votes WHERE voter_id=?').get(STRANGER) && !f.db.prepare('SELECT 1 FROM site_applications WHERE discord_id=?').get(STRANGER));
    await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', VIEWER);
    const denied = await f.call('GET', '/api/me', VIEWER), deniedPage = await f.page(VIEWER), deniedRead = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('denied own data carries only masked settings while the actual identity read stays refused', denied.status === 200 && denied.body.denied === true && safe(denied.body.settings) && deniedRead.status === 403 && !('identities' in deniedRead.body));
    check('the real denied sign-in page contains no association or internal proof boot', deniedPage.status === 200 && deniedPage.boot === null && ![HOLDER, SECOND, ':publication:'].some(v => deniedPage.html.includes(v)));
    check('every public/general read leaves the private stored map and HMAC proofs byte-identical', f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value === rawBefore && Object.keys(stored).filter(k => k.includes(':publication:')).length === 2);
    f.close();
  }
  {
    const f = await fixture(); await f.setting({ co_gm: 'Typed one', treasurer: 'Typed two' });
    let r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('typed labels never cause fuzzy matching or automatic character disclosure', r.status === 200 && r.body.identities.length === 0);
    await f.setting({ co_gm: '<@' + HOLDER + '>', treasurer: '<@' + SECOND + '>' });
    r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('legacy pointers with names-only consent cannot publish private identities or characters', r.status === 200 && r.body.identities.length === 0);
    const legacyCopy = await f.call('GET', '/api/me/export', HOLDER);
    check('own export does not misdescribe a legacy pointer as publication consent', legacyCopy.status === 200 && legacyCopy.body.site.appointmentPublications.length === 0);
    await f.setting({ co_gm: 'Typed one', treasurer: 'Typed two' });
    const next = { co_gm: '<@' + HOLDER + '>', treasurer: '<@' + SECOND + '>', officer: '<@' + VIEWER + '>' };
    r = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: next, appointedCharactersConfirmed: true });
    check('the original namesConfirmed requirement is preserved', r.status === 400 && r.body.error === 'confirm_names');
    r = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: next, namesConfirmed: true });
    check('generic name confirmation cannot authorize character publication', r.status === 400 && r.body.error === 'confirm_appointed_characters');
    check('refused publication leaves the original setting byte-identical', f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value === JSON.stringify({ co_gm: 'Typed one', treasurer: 'Typed two' }));
    r = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: next, namesConfirmed: true, appointedCharactersConfirmed: true });
    check('explicit association saves the exact pointer without changing role authority', r.status === 200 && r.body.settings.appointed.co_gm === next.co_gm && r.body.settings.appointed.treasurer === next.treasurer && load('./site-data').isAppointed(r.body.settings, 'co_gm'));
    const savedRaw = JSON.parse(f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value);
    const proofKeys = Object.keys(savedRaw).filter(k => k.includes(':publication:'));
    check('only the server authors one lowercase-HMAC proof for each supported current account', proofKeys.length === 2 && proofKeys.every(k => /^(co_gm|treasurer):publication:[0-9a-f]{64}$/.test(k)) && savedRaw[proofKeys.find(k => k.startsWith('co_gm:'))] === next.co_gm);
    check('generic settings omit every internal proof key and retain genuine role count only', Object.keys(r.body.settings.appointed).length === 3 && !JSON.stringify(r.body).includes(':publication:'));
    const forged = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: { ...next, ['co_gm:publication:' + '0'.repeat(64)]: next.co_gm }, namesConfirmed: true, appointedCharactersConfirmed: true });
    check('client-forged or replayed internal proof fields are refused rather than accepted', forged.status === 400 && forged.body.error === 'internal_appointed_fields');
    const details = f.db.prepare("SELECT details FROM audit WHERE action='site.settings' ORDER BY id DESC LIMIT 1").get().details;
    check('the audit records the confirmation and role keys, never identities or characters', JSON.parse(details).appointedCharactersConfirmed === true && JSON.parse(details).appointedNames === 3 && !details.includes(HOLDER) && !details.includes(SECOND) && !details.includes('First Nick') && !details.includes(':publication:'));
    r = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: next });
    check('unchanged submitted pointers also require explicit publication review', r.status === 400 && r.body.error === 'confirm_appointed_characters');
    r = await f.call('GET', '/api/appointed-identities', VIEWER);
    const one = r.body.identities.find(x => x.role === 'co_gm'), two = r.body.identities.find(x => x.role === 'treasurer');
    check('a confirmed member reads exactly two supported offices', r.status === 200 && r.body.scope === 'confirmed_guild_members' && r.body.identities.length === 2);
    check('the current nickname/global name and username remain distinct', one.displayName === 'First Nick' && one.username === 'holder-one' && one.label === 'First Nick · First Display (@holder-one)' && one.appointment === next.co_gm);
    check('an absent differing display name remains an honest username fallback', two.displayName === 'holder-two' && two.label === '@holder-two');
    check('only proven current characters are returned without IDs or staff data', one.characters.length === 1 && one.characters[0].status === 'member' && !('id' in one) && !('source' in one.characters[0]) && !JSON.stringify(r.body).includes('test-viewer'));
    const publicData = await f.call('GET', '/api/public');
    check('the anonymous settings endpoint never gains private character enrichment', publicData.status === 200 && !('identities' in publicData.body) && !JSON.stringify(publicData.body).includes('Proof 72'));
    for (const status of ['pending', 'left', 'left_pending', 'unbound', 'denied']) await f.write('INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at)VALUES(?,?,?,?,?,?)', status, 'Hidden ' + status, HOLDER, status, T - 10, T - 5);
    await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at)VALUES('note','Note only',?,'member',?,NULL)", HOLDER, T - 5);
    await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at)VALUES('future','Future proof',?,'verified',?,?)", HOLDER, T, T + 1);
    r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('pending/departed/unbound/denied/note-only/future links stay private', r.body.identities.find(x => x.role === 'co_gm').characters.length === 1, { characters: r.body.identities.find(x => x.role === 'co_gm').characters, databaseAt: f.db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at").get() });
    const own = await f.call('GET', '/api/me/export', HOLDER), other = await f.call('GET', '/api/me/export', VIEWER);
    check('the real own-copy route includes only the matching current publication association', own.status === 200 && own.body.site.appointmentPublications.length === 1 && own.body.site.appointmentPublications[0].role === 'co_gm' && own.body.site.appointmentPublications[0].audience === 'confirmed_guild_members' && !JSON.stringify(own.body.site.appointmentPublications).includes(SECOND));
    check('own publication metadata exposes neither private proof nor account birth', !JSON.stringify(own.body.site.appointmentPublications).includes(':publication:') && !JSON.stringify(own.body.site.appointmentPublications).includes(f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(HOLDER).account_incarnation));
    check('other account copies receive no association or counterpart pointer', other.status === 200 && other.body.site.appointmentPublications.length === 0);
    check('the coverage inventory acknowledges the selected association, not complete settings', own.body.coverage.storeInventory.stores.some(s => s.store === 'site_settings' && s.coverage === 'selected' && s.description.includes('exact Co-Guild Master or Treasurer')));
    await f.publish({ co_gm: '<@' + HOLDER + '>' });
    const missing = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: { co_gm: '<@' + HOLDER + '>', treasurer: '<@300000000000000099>' }, namesConfirmed: true, appointedCharactersConfirmed: true });
    check('an unavailable target cannot obtain a publication proof through a confirmed save', missing.status === 409 && missing.body.error === 'appointed_account_unavailable');
    r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('a holder without a current site identity is honestly unavailable', r.status === 200 && r.body.identities.length === 1);
    for (const [label, sql, value] of [['denied', 'UPDATE site_users SET denied=? WHERE discord_id=?', 1], ['departed', 'UPDATE site_users SET in_server=? WHERE discord_id=?', 0], ['banned', 'UPDATE members SET banned=? WHERE discord_id=?', 1]]) {
      await f.write(sql, value, HOLDER); r = await f.call('GET', '/api/appointed-identities', VIEWER);
      check('a ' + label + ' holder is not published', r.body.identities.length === 0);
      await f.write(sql, label === 'departed' ? 1 : 0, HOLDER);
    }
    await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", HOLDER); r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('a retiring holder is hidden before terminal erasure', r.body.identities.length === 0);
    await f.write("UPDATE privacy_subjects SET state='active' WHERE subject_id=?", HOLDER);
    await f.publish(next);
    const gen = f.db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?').get(HOLDER).generation;
    const birth = f.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(HOLDER).account_incarnation;
    await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", HOLDER);
    await f.write("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)VALUES(?,?,?,?,?,?,?,'waiting_role',?,?)", 'b'.repeat(32), HOLDER, gen, 'c'.repeat(64), 2, T + 1000, birth, T, T + 31622400);
    const erased = await cleanup.cleanupNativePersonalReferences({ ...f.env, PRIVACY_NATIVE_ERASURE_ENABLED: 'true', PRIVACY_ERASURE_ENABLED: 'true' }, { purpose: 'account_erasure', subject: HOLDER, subjectGeneration: gen, operationId: 'b'.repeat(32), requestDigest: 'c'.repeat(64), accountIncarnation: birth });
    const final = JSON.parse(f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value);
    check('unchanged Native cleanup withholds the exact pointer and preserves appointed closure', erased.state === 'cleaned' && final.co_gm === 'Name withheld' && load('./site-data').isAppointed({ appointed: final }, 'co_gm'));
    const ownProofs = Object.keys(final).filter(k => k.startsWith('co_gm:publication:'));
    check('the unchanged Native eraser withholds every matching proof value too', ownProofs.length === 1 && ownProofs.every(k => final[k] === 'Name withheld') && final.treasurer === next.treasurer);
    r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('erasing one holder preserves the other holder separate current proof', r.status === 200 && r.body.identities.length === 1 && r.body.identities[0].role === 'treasurer');
    check('the own-publication projection clears with that exact pointer, without Native edits', (await identities.ownAppointmentPublicationsStatement(f.env, HOLDER).all()).results.length === 0);
    f.close();
  }
  for (const kind of ['anonymous', 'unconfirmed', 'denied', 'departed', 'banned']) {
    const f = await fixture(); await f.publish({ co_gm: '<@' + HOLDER + '>' });
    if (kind === 'denied') await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', VIEWER);
    if (kind === 'departed') await f.write('UPDATE site_users SET in_server=0 WHERE discord_id=?', VIEWER);
    if (kind === 'banned') await f.write('UPDATE members SET banned=1 WHERE discord_id=?', VIEWER);
    const r = await f.call('GET', '/api/appointed-identities', kind === 'anonymous' ? null : kind === 'unconfirmed' ? STRANGER : VIEWER);
    check(kind + ' viewers receive no private identity or characters', [401, 403].includes(r.status) && !('identities' in r.body)); f.close();
  }
  for (const kind of ['denied', 'departed', 'replacement-birth', 'retiring', 'pointer-replaced', 'holder-replacement-birth']) {
    const f = await fixture(); await f.publish({ co_gm: '<@' + HOLDER + '>' });
    f.before(async () => {
      if (kind === 'denied') await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', VIEWER);
      if (kind === 'departed') await f.write('UPDATE site_users SET in_server=0 WHERE discord_id=?', VIEWER);
      if (kind === 'replacement-birth') {
        await f.write('DELETE FROM site_users WHERE discord_id=?', VIEWER);
        await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?,?,?,?,?,1,0,2,?)', VIEWER, 'test-viewer', T, T, T, 'f'.repeat(32));
      }
      if (kind === 'retiring') await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", HOLDER);
      if (kind === 'pointer-replaced') await f.setting({ co_gm: 'Name withheld' });
      if (kind === 'holder-replacement-birth') {
        await f.write('DELETE FROM site_users WHERE discord_id=?', HOLDER);
        await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?,?,?,?,?,1,0,2,?)', HOLDER, 'new-holder-birth', T, T, T, 'e'.repeat(32));
      }
    });
    const r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check(kind + ' at the actual payload boundary cannot leak the prior association', ['retiring', 'pointer-replaced', 'holder-replacement-birth'].includes(kind) ? r.status === 200 && r.body.identities.length === 0 : r.status !== 200 && !('identities' in r.body)); f.close();
  }
  {
    const f = await fixture();
    for (const raw of ['{', '[]', '{"co_gm":"<@' + HOLDER + '>","co_gm":"<@' + SECOND + '>"}']) {
      await f.setting(raw); const r = await f.call('GET', '/api/appointed-identities', VIEWER);
      check('malformed/duplicate appointment data grants no publication: ' + raw.slice(0, 12), r.status === 200 && r.body.identities.length === 0);
    }
    await f.publish({ co_gm: '<@' + HOLDER + '>' });
    for (let i = 0; i < 51; i++) await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at)VALUES(?,?,?,'verified',?,?)", 'extra-' + i.toString().padStart(2, '0'), 'Additional ' + i, HOLDER, T - 3, T - 2);
    const r = await f.call('GET', '/api/appointed-identities', VIEWER);
    check('large character sets are bounded and explicitly report truncation', r.body.identities[0].characters.length === 50 && r.body.identities[0].charactersTruncated === true); f.close();
  }
  for (const change of ['retiring', 'denied', 'birth-replaced', 'raw-map-replaced']) {
    const f = await fixture(); await f.setting({ co_gm: 'Original typed holder' });
    f.beforeSave(async () => {
      if (change === 'retiring') await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", HOLDER);
      if (change === 'denied') await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', HOLDER);
      if (change === 'birth-replaced') {
        await f.write('DELETE FROM site_users WHERE discord_id=?', HOLDER);
        await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,in_server,denied,account_incarnation)VALUES(?,?,?,?,1,0,?)', HOLDER, 'replacement', T, T, 'd'.repeat(32));
      }
      if (change === 'raw-map-replaced') await f.setting({ co_gm: 'Name withheld' });
    });
    const r = await f.call('PUT', '/api/admin/settings', ADMIN, { appointed: { co_gm: '<@' + HOLDER + '>' }, notice: 'Must not partially save', namesConfirmed: true, appointedCharactersConfirmed: true });
    const rawMap = f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value;
    check(change + ' before the consuming save refuses the entire proof/map/notice transaction', r.status === 409 && r.body.error === (change === 'raw-map-replaced' ? 'stale_settings' : 'appointed_account_unavailable') && (change === 'raw-map-replaced' || r.body.role === 'co_gm') && !rawMap.includes(':publication:') && !f.db.prepare("SELECT 1 FROM site_settings WHERE key='notice'").get()); f.close();
  }
  {
    const f = await fixture(), approved = await f.publish({ co_gm: '<@' + HOLDER + '>' });
    const key = Object.keys(approved).find(k => k.startsWith('co_gm:publication:'));
    for (const [label, map] of [
      ['forged MAC', { co_gm: approved.co_gm, ['co_gm:publication:' + '0'.repeat(64)]: approved.co_gm }],
      ['another pointer', { co_gm: '<@' + SECOND + '>', [key]: '<@' + SECOND + '>' }],
      ['another office', { treasurer: approved.co_gm, [key.replace('co_gm:', 'treasurer:')]: approved.co_gm }],
    ]) {
      await f.setting(map); const r = await f.call('GET', '/api/appointed-identities', VIEWER);
      check('a private proof cannot authorize ' + label, r.status === 200 && r.body.identities.length === 0);
    }
    f.close();
  }
  check('no provider calls or source mutations were used', network === 0 && [...sourcePins].every(([file, bytes]) => fs.readFileSync(file).equals(bytes)));
  console.log(`\n${passed}/${total} appointed identity checks passed`); if (passed !== total) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
