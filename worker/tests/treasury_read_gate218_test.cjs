'use strict';
// .218 officer-only Treasury plan: the real site-treasury-access.ts over the real Native-admitted SQLite schema.
// Members are refused the plan's four files and get canRead:false; admins, officer roster ranks and configured Discord
// officer roles are admitted. No write, no schema change, one Discord read at most, and HEAD replies carry no body.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite'), ts = require('typescript'), entry = require('./helpers/privacy129_fixture.cjs');
const root = path.resolve(__dirname, '..'), SUBJECT = '300000000000000002', GUILD = '236932545793490944', OFFICER_ROLE = '300000000000000777';
let checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log('PASS ' + name); };

function sourceGraph(provider) {
  const cache = new Map();
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal, setTimeout, clearTimeout, console: { log() {}, error() {}, warn() {} },
    fetch: async (url, init) => provider(String(url), init) });
  function load(name) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('Fixture source name refused');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const js = ts.transpileModule(fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })(dependency => {
      if (dependency === 'node:async_hooks') return require(dependency);
      if (!dependency.startsWith('./')) throw Error('External source dependency refused');
      return load(dependency.slice(2));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

const ROLE_IDS = n => Array.from({ length: n }, (_, i) => String(400000000000000000n + BigInt(i)));
const PROFILES = { 'beta-five': 5, 'ten-rank': 10, 'ten-rank-treasurer-v1': 10, 'ten-rank-council-treasurer-v1': 10 };
async function fresh({ admin = false, roles = null, profile = 'ten-rank', cutoff = 'past', map = null, onStatement = null, onDiscord = null, onAsset = null } = {}) {
  const calls = { discord: 0, assets: 0, statements: 0 };
  let live = null; // set once the database exists; the hooks below run INSIDE the awaited provider and asset reads
  const provider = async url => {
    if (url.startsWith('https://discord.com/api/') && url.includes('/guilds/' + GUILD + '/members/' + SUBJECT)) {
      calls.discord++;
      if (onDiscord && live) await onDiscord(live);
      if (roles === null) return new Response(JSON.stringify({ message: 'Unknown Member', code: 10007 }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ user: { id: SUBJECT, username: 'fictional-member' }, roles, pending: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw Error('unexpected provider request ' + url);
  };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); entry.installCurrentEntryEpoch(db);
  let envRef = null;
  const now = db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) t").get().t, native = entry.originalNativePort(db, { statement: sql => { calls.statements++; if (onStatement && envRef) onStatement(sql, envRef); } }), load = sourceGraph(provider);
  const rawEnv = entry.currentEntryEnvironment({ DB: native, COOKIE_SECRET: 'treasury-gate-fictional-cookie-secret-only', VERIFY_SECRET: 'treasury-gate-fictional-verify-only',
    SITE_HOST: 'guild.example', PUBLIC_BASE_URL: 'https://verify.example', DISCORD_APP_ID: '1550176895671341076', SITE_GUILD_ID: GUILD, GUILD_ID: GUILD, DISCORD_BOT_TOKEN: 'fictional-bot-token', ROLE_OFFICER: OFFICER_ROLE, ROLE_GUILD_LEADER: '', ROLE_GUILD_MASTER: '', ROLE_RAID_LEADER: '',
    SITE_ADMINS: admin ? SUBJECT : '300000000000000999',
    QR_NATIVE_ROLE_MAP: map ?? JSON.stringify({ profile, roles: ROLE_IDS(PROFILES[profile]) }),
    ...(cutoff === 'past' ? { LINKS_NOT_BEFORE: String(Math.floor(Date.now() / 1000) - 86400), LINKS_NOT_BEFORE_CLOCK_GATED: 'false' }
      : cutoff === 'recent' ? { LINKS_NOT_BEFORE: String(Math.floor(Date.now() / 1000) - 60), LINKS_NOT_BEFORE_CLOCK_GATED: 'false' }
      : cutoff === 'gated-future' ?{ LINKS_NOT_BEFORE: String(Math.floor(Date.now() / 1000) + 86400), LINKS_NOT_BEFORE_CLOCK_GATED: 'true' }
      : { LINKS_NOT_BEFORE: '', LINKS_NOT_BEFORE_CLOCK_GATED: 'false' }) });
  const writer = load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = { ...rawEnv, DB: writer, ASSETS: { fetch: async () => { calls.assets++; if (onAsset && live) await onAsset(live); return new Response('/* treasury plan */', { status: 200, headers: { 'Content-Type': 'text/javascript' } }); } } };
  envRef = env;
  live = { db, writer, write: (sql, ...args) => writer.prepare(sql).bind(...args).run() };
  const write = (sql, ...args) => writer.prepare(sql).bind(...args).run();
  await write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version) VALUES(?,?,?,?,?,1,0,1)', SUBJECT, 'fictional-member', now, now, now);
  await write('INSERT INTO members(discord_id) VALUES(?)', SUBJECT);
  const issued = await entry.issueOriginalEntryCookie(load, db, rawEnv, SUBJECT), gate = load('site-treasury-access');
  const request = (pathname, options = {}) => new Request('https://guild.example' + pathname, { method: options.method || 'GET', headers: { Cookie: issued.cookie } });
  const open = async (pathname, options = {}) => { const response = await gate.treasuryAfterMemberGate(request(pathname, options), env, pathname.split('?')[0]); return { status: response.status, text: await response.text(), response }; };
  const schema = () => JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY name').all());
  return { db, now, write, env, gate, open, calls, schema, load, close: () => db.close() };
}
async function roster(f, { rank, index, trusted = 1, complete = 1, status = 'member', guid = 'Player-4209-0000AA01', rowGuid = guid, age = 60, memberCount = 1, duplicateRow = false }) {
  const exported = f.now - age;
  await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('qaofficer','Qaofficer',?,?,?,?)", SUBJECT, status, f.now, guid);
  await f.write('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) VALUES(1,?,?,?,?,?,?,?)', exported, f.now, 'addon', memberCount, trusted, complete, f.now);
  await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,'qaofficer','Qaofficer',?,?,?)", rank, index, rowGuid);
  if (duplicateRow) await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,'qaofficer2','Qaofficertwo','Member',7,?)", rowGuid);
}
const canRead = async f => JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead;
async function scenario(name, options, run) { const f = await fresh(options); try { await run(f); console.log('CASE ' + name); } finally { f.close(); } }
const f218 = {};
const ASSETS = ['/static/treasury-plan207.js', '/static/treasury-plan-model207.js', '/static/treasury-plan-content207.js', '/static/treasury-plan207.css'];

(async () => {
  {
    // Real Native request path; provider-role changes happen INSIDE the awaited asset read.
    const roles218 = [OFFICER_ROLE], order218 = [];
    let owner218 = null, atAsset218 = null;
    await scenario('Discord snapshot is request-local and followed by final Native admission', {
      roles: roles218,
      onDiscord: async () => { order218.push('discord:' + owner218.calls.discord); },
      onAsset: async () => {
        order218.push('asset');
        check('one fresh Discord observation precedes protected asset storage', owner218.calls.discord === 1 && JSON.stringify(order218) === '["discord:1","asset"]');
        atAsset218 = owner218.calls.statements;
        roles218.splice(0); // Upstream change after the already-read response; no local/provider strong-consistency claim.
      },
    }, async f => {
      owner218 = f;
      const firstStart218 = f.calls.statements;
      const first218 = await f.open(ASSETS[0]);
      const firstEnd218 = f.calls.statements;
      check('the retained first response honestly uses its one provider snapshot', first218.status === 200 && first218.text === '/* treasury plan */'
        && roles218.length === 0 && f.calls.discord === 1 && f.calls.assets === 1);
      check('actual Native statements follow the asset await within the full request budget', atAsset218 > firstStart218 && firstEnd218 > atAsset218
        && firstEnd218 - firstStart218 < 100);
      const secondStart218 = f.calls.statements;
      const second218 = await f.open(ASSETS[0]);
      const secondCost218 = f.calls.statements - secondStart218;
      check('a separate request reads the changed provider response and refuses without another asset fetch', second218.status === 403
        && JSON.parse(second218.text).error === 'officer_only' && !second218.text.includes('/* treasury plan */')
        && f.calls.discord === 2 && f.calls.assets === 1 && JSON.stringify(order218) === '["discord:1","asset","discord:2"]'
        && secondCost218 > 0 && secondCost218 < 100);
      console.log('OBSERVED SNAPSHOT ' + JSON.stringify({ firstStatus:first218.status, secondStatus:second218.status, providerReads:2, assetFetches:f.calls.assets,
        firstStatements:firstEnd218-firstStart218, firstStatementsAtAsset:atAsset218-firstStart218, firstStatementsAfterAsset:firstEnd218-atAsset218,
        secondStatements:secondCost218, order:order218 }));
    });
  }

  // Any current, independently GUID-bound officer character qualifies, before any result limit.
  const addCharacter = async (f, name, guid, rank, index) => {
    await f.write('INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?,?,?,\'member\',?,?)', name.toLowerCase(), name, SUBJECT, f.now, guid);
    await f.write('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,?,?,?,?,?)', name.toLowerCase(), name, rank, index, guid);
    await f.write('UPDATE roster_snapshots SET member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=1) WHERE id=1');
  };
  const openMeasured = async (f, path = ASSETS[0], options = {}) => {
    const before = f.calls.statements, out = await f.open(path, options), statements = f.calls.statements - before;
    console.log('OBSERVED ' + JSON.stringify({ path, status: out.status, body: out.text, statements, discord: f.calls.discord, assets: f.calls.assets }));
    check('complete Treasury request consumes fewer than 100 physical Native statements', statements > 0 && statements < 100);
    return out;
  };
  const publishOffice = async f => {
    // Real publication producer signs the fictional subject's current account; no invented proof or source rewrite.
    const publication = await f.load('site-appointed-identities').prepareAppointmentPublication(f.env, { treasurer: '<@' + SUBJECT + '>' });
    assert.equal(publication.ok, true);
    await f.write("INSERT INTO site_settings(key,value,updated_at) VALUES('appointed',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", JSON.stringify(publication.stored), f.now);
    f.calls.discord = 0;
  };
  await scenario('independently GUID-bound Officer plus Alt', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await addCharacter(f, 'Qaalt', 'Player-4209-0000AA02', 'Alt', 8);
    const out = await openMeasured(f);
    check('a separately GUID-pinned Alt does not revoke its account officer', out.status === 200 && out.text === '/* treasury plan */' && f.calls.discord === 0);
  });
  await scenario('two independently GUID-bound Officers', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await addCharacter(f, 'Qaofficertwo', 'Player-4209-0000AA02', 'Officer', 2);
    const out = await openMeasured(f);
    check('two valid officer characters qualify without an account-level exact-one constraint', out.status === 200 && out.text === '/* treasury plan */' && f.calls.discord === 0);
  });
  await scenario('officer after several independently bound low-rank alts', {}, async f => {
    await roster(f, { rank: 'Alt', index: 8 });
    await addCharacter(f, 'Qaaltbefore', 'Player-4209-0000AA02', 'Alt', 8);
    await addCharacter(f, 'Qamemberbefore', 'Player-4209-0000AA03', 'Member', 7);
    await addCharacter(f, 'Qalaterofficer', 'Player-4209-0000AA04', 'Officer', 2);
    const out = await openMeasured(f);
    check('rank filtering precedes the limit so earlier alts cannot hide a valid later officer', out.status === 200 && f.calls.discord === 0);
  });
  await scenario('roster demotion while asset storage is awaited', { onAsset: async f => { await f.write("UPDATE roster_members SET rank='Member',rank_index=7 WHERE snapshot_id=1"); } }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    const out = await openMeasured(f);
    check('a demoted officer receives no protected asset bytes after storage returns', out.status === 403 && !out.text.includes('/* treasury plan */') && JSON.parse(out.text).error === 'officer_only' && f.calls.assets === 1 && f.calls.discord === 0);
  });
  await scenario('new latest incomplete roster while asset storage is awaited', { onAsset: async f => { await f.write("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) SELECT 2,exported_at,received_at,source,0,1,0,first_received_at FROM roster_snapshots WHERE id=1"); } }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    const out = await openMeasured(f);
    check('delivery rechecks the latest complete trusted export instead of retaining the former officer snapshot', out.status === 403 && !out.text.includes('/* treasury plan */') && f.calls.assets === 1 && f.calls.discord === 0);
  });
  await scenario('withdrawn published Treasurer while asset storage is awaited', { roles: [], onAsset: async f => { await f.write("UPDATE site_settings SET value='{}' WHERE key='appointed'"); } }, async f => {
    await publishOffice(f);
    const out = await openMeasured(f);
    check('withdrawn D1 appointment releases no protected bytes and does not silently adopt another source', out.status === 403 && !out.text.includes('/* treasury plan */') && JSON.parse(out.text).error === 'officer_only' && f.calls.assets === 1 && f.calls.discord === 0);
  });
  await scenario('unchanged valid published Treasurer', { roles: [] }, async f => {
    await publishOffice(f);
    const out = await openMeasured(f);
    check('a still-published real appointment remains sufficient without an officer roster or a new Discord read', out.status === 200 && out.text === '/* treasury plan */' && f.calls.discord === 0);
  });
  await scenario('independent admin remains valid with demoted roster and withdrawn unrelated appointment', { admin: true, onAsset: async f => { await f.write("UPDATE roster_members SET rank='Member',rank_index=7 WHERE snapshot_id=1"); await f.write("UPDATE site_settings SET value='{}' WHERE key='appointed'"); } }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    const out = await openMeasured(f);
    check('admin admission is not coupled to a lower-priority roster or appointment', out.status === 200 && out.text === '/* treasury plan */' && f.calls.discord === 0);
  });
  await scenario('independent current Discord officer with non-officer roster', { roles: [OFFICER_ROLE], onAsset: async f => { await f.write("UPDATE roster_members SET rank='Initiate',rank_index=9 WHERE snapshot_id=1"); } }, async f => {
    await roster(f, { rank: 'Member', index: 7 });
    const out = await openMeasured(f);
    check('actually proved Discord officer admission remains independent of native rank', out.status === 200 && out.text === '/* treasury plan */' && f.calls.discord === 1);
  });
  await scenario('officer session revoked during asset storage', { onAsset: async f => { await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT); } }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    const out = await openMeasured(f);
    check('roster proof never bypasses the original session refusal', out.status === 403 && !out.text.includes('/* treasury plan */') && JSON.parse(out.text).error === 'account_changed' && f.calls.discord === 0);
  });
  await scenario('duplicated GUID still refuses an officer', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2, duplicateRow: true, memberCount: 2 });
    const out = await openMeasured(f);
    check('allow-any-character does not relax per-character export GUID uniqueness', out.status === 403 && f.calls.assets === 0);
  });

  await scenario('ordinary member', {}, async f => {
    const before = f.schema(), settings = f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n;
    const access = await f.open('/api/treasury-plan/access');
    check('an ordinary member is told canRead:false in the exact two-field answer', access.status === 200 && JSON.stringify(JSON.parse(access.text)) === JSON.stringify({ format: 'olympus-treasury-access-v1', canRead: false }));
    check('the access answer is private and never cached', access.response.headers.get('Cache-Control') === 'private, no-store, no-transform' && access.response.headers.get('Vary') === 'Cookie');
    for (const asset of ASSETS) {
      const out = await f.open(asset);
      check('a member is refused ' + asset + ' with officer_only', out.status === 403 && JSON.parse(out.text).error === 'officer_only' && JSON.parse(out.text).message.includes('officers and above'));
    }
    check('no plan byte was fetched from asset storage for a member', f.calls.assets === 0);
    check('the Discord officer path was read at most once per check and found no officer role', f.calls.discord === 1 + ASSETS.length);
    check('no row or schema object changed', f.schema() === before && f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n === settings);
    const post = await f.open('/api/treasury-plan/access', { method: 'POST' });
    check('only GET and HEAD are accepted', post.status === 405 && post.response.headers.get('Allow') === 'GET, HEAD');
    const query = await f.open('/api/treasury-plan/access?x=1');
    check('the access check refuses any query string', query.status === 400);
    const head = await f.open('/static/treasury-plan207.js', { method: 'HEAD' });
    check('a refused HEAD carries no body', head.status === 403 && head.text === '');
    check('other paths are not handled by the Treasury gate', await f.gate.treasuryAfterMemberGate(new Request('https://guild.example/static/app.js'), f.env, '/static/app.js') === null && await f.gate.treasuryAfterMemberGate(new Request('https://guild.example/static/royal-writs199.js'), f.env, '/static/royal-writs199.js') === null);
  });
  await scenario('site admin', { admin: true }, async f => {
    const access = await f.open('/api/treasury-plan/access');
    check('a site admin is admitted without any Discord read', JSON.parse(access.text).canRead === true && f.calls.discord === 0);
    for (const asset of ASSETS) { const out = await f.open(asset); check('an admin receives ' + asset + ' privately', out.status === 200 && out.text === '/* treasury plan */' && out.response.headers.get('Cache-Control') === 'private, no-store, no-transform'); }
    const head = await f.open('/static/treasury-plan207.js', { method: 'HEAD' });
    check('an admitted HEAD carries no body', head.status === 200 && head.text === '');
  });
  for (const [profile, rank, index, admitted] of [['ten-rank', 'Guild Master', 0, true], ['ten-rank', 'High Council', 1, true], ['ten-rank', 'Officer', 2, true], ['ten-rank', 'Officer Alt', 3, true],
    ['ten-rank', 'Raid Leader', 4, true], ['ten-rank', 'Veteran', 5, false], ['ten-rank', 'Raider', 6, false], ['ten-rank', 'Member', 7, false], ['ten-rank', 'Officer', 6, false],
    ['ten-rank', 'Raid Leader', 2, false], ['ten-rank', 'Officer', 1, false], ['ten-rank', 'Treasurer', 2, false], ['ten-rank', 'officer', 2, false],
    ['ten-rank-council-treasurer-v1', 'Treasurer', 2, true], ['ten-rank-council-treasurer-v1', 'Officer', 3, true], ['ten-rank-council-treasurer-v1', 'Officer Alt', 3, false],
    ['ten-rank-treasurer-v1', 'Treasurer', 1, true], ['ten-rank-treasurer-v1', 'High Council', 1, false]]) {
    await scenario(profile + ' roster ' + rank + ' at ' + index, { profile }, async f => {
      await roster(f, { rank, index });
      const admittedNow = await canRead(f);
      check(`under ${profile}, rank ${rank} at index ${index} ${admitted ? 'is' : 'is not'} officer tier`, admittedNow === admitted && (admitted ? f.calls.discord === 0 : f.calls.discord === 1));
    });
  }
  await scenario('beta-five profile', { profile: 'beta-five' }, async f => {
    await roster(f, { rank: 'Officer', index: 1 });
    check('beta-era native authority never carries into the Treasury read, even for a beta Officer', await canRead(f) === false && f.calls.discord === 1);
  });
  await scenario('prelaunch clock-gated cut', { cutoff: 'gated-future' }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    check('before the clock-gated launch cut opens, the roster path is withheld', await canRead(f) === false);
  });
  await scenario('no launch cut', { cutoff: 'none' }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    check('without a configured launch cut, the roster path is withheld', await canRead(f) === false);
  });
  await scenario('unconfigured rank map', { map: 'not json' }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    check('an unparseable native rank map withholds the roster path', await canRead(f) === false);
  });
  for (const [name, options] of [['stale export (13 hours old)', { age: 13 * 3600 }], ['future export', { age: -600 }], ['row count below member_count', { memberCount: 2 }],
    ['GUID listed twice on the export', { duplicateRow: true, memberCount: 2 }], ['name-only character link', { guid: null, rowGuid: 'Player-4209-0000AA01' }]]) {
    await scenario(name, {}, async f => {
      await roster(f, { rank: 'Officer', index: 2, ...options });
      check('an officer rank grants nothing with a ' + name, await canRead(f) === false);
    });
  }
  await scenario('export before the launch cut', { cutoff: 'recent' }, async f => {
    await roster(f, { rank: 'Officer', index: 2, age: 3600 });
    check('an export from before the launch cut grants nothing, even when fresh rules would otherwise pass', await canRead(f) === false);
  });
  await scenario('second bound character on the GUID', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version) VALUES(?,?,?,?,?,1,0,1)', '300000000000000004', 'fictional-other', f.now, f.now, f.now);
    await f.write('INSERT INTO members(discord_id) VALUES(?)', '300000000000000004');
    await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('qaother','Qaother','300000000000000004','member',?,?)", f.now, 'Player-4209-0000AA01');
    check('a GUID bound to two member characters grants nothing', await canRead(f) === false);
  });
  await scenario('rename re-apply hold', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await f.write("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,guid,nonce,state,decided_by,decided_at) VALUES(?,'Qaofficer','Qanew','qaofficer',?,'n1','reapply','300000000000000999',?)", SUBJECT, 'Player-4209-0000AA01', f.now);
    check('an account under a rename re-apply hold is not admitted by rank', await canRead(f) === false);
  });
  const BETA = JSON.stringify({ profile: 'beta-five', roles: ROLE_IDS(5) });
  await scenario('roster config changed mid-read', { onStatement: (sql, env) => { if (sql.includes('FROM roster_snapshots s')) { env.QR_NATIVE_ROLE_MAP = BETA; env.LINKS_NOT_BEFORE = ''; } } }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    const decided = await canRead(f);
    check('a configuration change in flight cannot mix into the roster decision: it follows the configuration that chose the read', f.env.QR_NATIVE_ROLE_MAP === BETA && f.env.LINKS_NOT_BEFORE === '' && decided === true && f.calls.discord === 0);
  });
  await scenario('discord config changed mid-read', { roles: [OFFICER_ROLE], onStatement: (sql, env) => { if (sql.includes('FROM roster_snapshots s')) { env.ROLE_OFFICER = '300000000000000999'; env.GUILD_ID = '111111111111111111'; } } }, async f => {
    const decided = await canRead(f);
    check('a role or guild change in flight cannot mix into the Discord decision either', f.env.ROLE_OFFICER === '300000000000000999' && f.env.GUILD_ID === '111111111111111111' && decided === true && f.calls.discord === 1);
  });
  // Codex Root 05:57:39: account changes committed while Discord or asset storage is awaited must refuse, with no plan byte.
  const recreate = async l => {
    const row = l.db.prepare('SELECT * FROM site_users WHERE discord_id=?').get(SUBJECT);
    const keep = ['discord_id', 'username', 'global_name', 'nick', 'avatar', 'account_created', 'server_joined', 'first_login', 'last_login', 'checked_at', 'in_server', 'session_version', 'denied'];
    await l.writer.batch([l.writer.prepare('DELETE FROM site_users WHERE discord_id=?1 AND account_incarnation=?2').bind(SUBJECT, row.account_incarnation),
      l.writer.prepare('INSERT INTO site_users(' + keep.join(',') + ') VALUES(' + keep.map((_, i) => '?' + (i + 1)).join(',') + ')').bind(...keep.map(k => row[k] ?? null))]);
    l.recreated = l.db.prepare('SELECT account_incarnation AS n FROM site_users WHERE discord_id=?').get(SUBJECT).n !== row.account_incarnation;
  };
  for (const [name, options, expectError] of [
    ['denied during the Discord read', { roles: [OFFICER_ROLE], onDiscord: l => l.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT) }, 'account_changed'],
    ['session revoked during the Discord read', { roles: [OFFICER_ROLE], onDiscord: l => l.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT) }, 'account_changed'],
    ['erased and recreated during the Discord read', { roles: [OFFICER_ROLE], onDiscord: recreate }, 'account_changed'],
  ]) {
    await scenario(name + ' (access answer)', options, async f => {
      const out = await f.open('/api/treasury-plan/access'), body = JSON.parse(out.text || '{}');
      check('access answer: ' + name + ' refuses the original caller instead of answering canRead', out.status === 403 && body.error === expectError && body.canRead === undefined && f.calls.discord === 1);
    });
    await scenario(name + ' (plan file)', options, async f => {
      const out = await f.open('/static/treasury-plan-content207.js');
      check('plan file: ' + name + ' returns no plan byte', out.status === 403 && !out.text.includes('treasury plan') && f.calls.discord === 1);
    });
  }
  for (const [name, options, expectError] of [
    ['denied during the asset fetch', { admin: true, onAsset: l => l.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT) }, 'account_changed'],
    ['session revoked during the asset fetch', { admin: true, onAsset: l => l.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT) }, 'account_changed'],
    ['banned during the asset fetch', { admin: true, onAsset: l => l.write('UPDATE members SET banned=1 WHERE discord_id=?', SUBJECT) }, 'forbidden'],
    ['denied during the asset fetch after a Discord admission', { roles: [OFFICER_ROLE], onAsset: l => l.write('UPDATE site_users SET denied=1 WHERE discord_id=?', SUBJECT) }, 'account_changed'],
  ]) {
    await scenario(name, options, async f => {
      const out = await f.open('/static/treasury-plan207.js'), body = JSON.parse(out.text || '{}');
      check(name + ': the fetched plan bytes are withheld and the original caller is refused', out.status === 403 && body.error === expectError && !out.text.includes('treasury plan') && f.calls.assets === 1);
    });
  }
  await scenario('erase and recreate really changes the incarnation', { roles: [OFFICER_ROLE], onDiscord: async l => { await recreate(l); f218.recreated = l.recreated; } }, async f => {
    await f.open('/api/treasury-plan/access');
    check('the erase/recreate hook really replaced the account incarnation (the case above is not vacuous)', f218.recreated === true);
  });
  await scenario('no account change keeps the admitted answer', { roles: [OFFICER_ROLE], onDiscord: () => {}, onAsset: () => {} }, async f => {
    const access = await f.open('/api/treasury-plan/access'), file = await f.open('/static/treasury-plan207.js');
    check('with hooks that change nothing, the Discord officer is still admitted and receives the plan', access.status === 200 && JSON.parse(access.text).canRead === true && file.status === 200 && file.text === '/* treasury plan */');
  });
  await scenario('newer incomplete export', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await f.write('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) VALUES(2,?,?,?,1,1,0,?)', f.now - 30, f.now, 'addon', f.now);
    await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(2,'qaofficer','Qaofficer','Officer',2,'Player-4209-0000AA01')");
    check('a newer incomplete export withholds the older officer rank', await canRead(f) === false);
  });
  await scenario('untrusted roster', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2, trusted: 0 });
    check('an officer rank on an untrusted export grants nothing', JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead === false);
  });
  await scenario('incomplete roster', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2, complete: 0 });
    check('an officer rank on an incomplete export grants nothing', JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead === false);
  });
  await scenario('unverified character', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2, status: 'pending' });
    check('an officer rank on a character that is not a confirmed member grants nothing', JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead === false);
  });
  await scenario('different guid', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2, rowGuid: 'Player-4209-0000BB02' });
    check('a namesake with a different pinned GUID grants nothing', JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead === false);
  });
  await scenario('newer untrusted export', {}, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await f.write('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) VALUES(2,?,?,?,1,0,1,?)', f.now, f.now, 'addon', f.now);
    await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(2,'qaofficer','Qaofficer','Officer',2,'Player-4209-0000AA01')");
    check('only the newest export counts, so a newer untrusted export withholds the older officer rank', JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead === false);
  });
  await scenario('discord officer role', { roles: [OFFICER_ROLE] }, async f => {
    const access = JSON.parse((await f.open('/api/treasury-plan/access')).text), out = await f.open('/static/treasury-plan-content207.js');
    check('a configured Discord officer role admits the member after one Discord read', access.canRead === true && out.status === 200 && f.calls.discord === 2);
  });
  await scenario('other discord role', { roles: ['300000000000000888'] }, async f => {
    check('an unrelated Discord role grants nothing', JSON.parse((await f.open('/api/treasury-plan/access')).text).canRead === false);
  });
  await scenario('discord rate limit', {}, async f => {
    const results = [];
    for (let i = 0; i < 22; i++) results.push((await f.open('/api/treasury-plan/access')).status);
    check('the Discord path allows three full page loads a minute, then answers 429 instead of reading again', f.gate.TREASURY_DISCORD_READS_PER_MINUTE === 20 && results.slice(0, 20).every(s => s === 200) && results.slice(20).every(s => s === 429) && f.calls.discord === 20);
  });
  await scenario('banned member', { admin: false }, async f => {
    await roster(f, { rank: 'Officer', index: 2 });
    await f.write('UPDATE members SET banned=1 WHERE discord_id=?', SUBJECT);
    const out = await f.open('/api/treasury-plan/access');
    check('a banned account is refused before any rank is read', out.status === 403 && f.calls.discord === 0);
  });
  await scenario('signed out', {}, async f => {
    const out = await f.gate.treasuryAfterMemberGate(new Request('https://guild.example/api/treasury-plan/access'), f.env, '/api/treasury-plan/access');
    check('a signed-out request is answered 401', out.status === 401);
  });
  const load = sourceGraph(async () => { throw Error('no provider'); }), gate = load('site-treasury-access');
  const ten = ['Guild Master', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
  check('officerRank pins officer-tier names to their exact index in the given ladder only', gate.officerRank('Officer Alt', 3, ten) && !gate.officerRank('Treasurer', 1, ten) && !gate.officerRank('Officer Alt', 2, ten)
    && !gate.officerRank('officer', 2, ten) && !gate.officerRank('Officer', '2', ten) && !gate.officerRank('Veteran', 5, ten));
  const past = String(Math.floor(Date.now() / 1000) - 60), future = String(Math.floor(Date.now() / 1000) + 3600);
  const ladder = (profile, cut, gated) => gate.currentLadder({ QR_NATIVE_ROLE_MAP: JSON.stringify({ profile, roles: ROLE_IDS(PROFILES[profile]) }), LINKS_NOT_BEFORE: cut, LINKS_NOT_BEFORE_CLOCK_GATED: gated });
  const held = run => { try { run(); return false; } catch (error) { return error.message === 'treasury_original_request_held'; } };
  const snap = gate.configSnapshot({ QR_NATIVE_ROLE_MAP: 'a', LINKS_NOT_BEFORE: '1', LINKS_NOT_BEFORE_CLOCK_GATED: 'true' }, ['QR_NATIVE_ROLE_MAP', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED']);
  check('assertSameConfig accepts the same configuration and refuses a changed, removed or added value, or a different key list',
    !held(() => gate.assertSameConfig({ QR_NATIVE_ROLE_MAP: 'a', LINKS_NOT_BEFORE: '1', LINKS_NOT_BEFORE_CLOCK_GATED: 'true' }, ['QR_NATIVE_ROLE_MAP', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED'], snap))
    && held(() => gate.assertSameConfig({ QR_NATIVE_ROLE_MAP: 'b', LINKS_NOT_BEFORE: '1', LINKS_NOT_BEFORE_CLOCK_GATED: 'true' }, ['QR_NATIVE_ROLE_MAP', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED'], snap))
    && held(() => gate.assertSameConfig({ QR_NATIVE_ROLE_MAP: 'a', LINKS_NOT_BEFORE_CLOCK_GATED: 'true' }, ['QR_NATIVE_ROLE_MAP', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED'], snap))
    && held(() => gate.assertSameConfig({ QR_NATIVE_ROLE_MAP: 'a', LINKS_NOT_BEFORE: '2', LINKS_NOT_BEFORE_CLOCK_GATED: 'true' }, ['QR_NATIVE_ROLE_MAP', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED'], snap))
    && held(() => gate.assertSameConfig({ QR_NATIVE_ROLE_MAP: 'a' }, ['QR_NATIVE_ROLE_MAP'], snap)) && Object.isFrozen(snap));
  check('currentLadder withholds beta-five, a clock-gated future cut and an empty cut, and returns the exact configured ladder otherwise',
    ladder('beta-five', past, 'false') === null && ladder('ten-rank', future, 'true') === null && ladder('ten-rank', '', 'false') === null
    && JSON.stringify(ladder('ten-rank', past, 'false').names) === JSON.stringify(ten) && ladder('ten-rank', past, 'false').cutoff === Number(past)
    && ladder('ten-rank-council-treasurer-v1', past, 'false').names[2] === 'Treasurer');
  console.log(`\n${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
