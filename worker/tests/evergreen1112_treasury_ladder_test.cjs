'use strict';
// Round 5 (13 Nov 2026), Treasury roster ladder: the real site-treasury-access.ts over the real Native-admitted SQLite schema
// (the harness pattern of treasury_read_gate218_test.cjs, read and reused here, not edited). Production still runs the
// ORIGINAL CANONICAL_RANKS233 policy (version 1, tracked in wrangler.toml); the release adds the Directive policy (version 2).
// Each policy must admit exactly its own officer name/index pairs on its own exact source, with every roster fence intact,
// and nothing else may open the roster route. Synthetic data only; no provider beyond a fixture Discord member read.
// Usage: node tests/evergreen1112_treasury_ladder_test.cjs [--section original|directive|cross|negatives|forms|all] [--only <scenario name part>]
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite'), ts = require('typescript'), entry = require('./helpers/privacy129_fixture.cjs');
const root = path.resolve(__dirname, '..'), SUBJECT = '300000000000000002', GUILD = '236932545793490944';
const args = process.argv.slice(2), section = args.includes('--section') ? args[args.indexOf('--section') + 1] : 'all';
const SCOPE = { version: 1, guild: 'OLYMPUS PRIME', realm: 'Fixture Live Realm' };
const PLAN = '/* treasury plan */', ASSET = '/static/treasury-plan207.js';
const results = [], statements = {};
const check = (name, pass, observed) => { results.push({ name, pass: !!pass }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (pass || observed === undefined ? '' : ' :: ' + JSON.stringify(observed).slice(0, 400))); };

const transpiled = new Map();
function sourceGraph(provider) {
  const cache = new Map();
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal, setTimeout, clearTimeout, console: { log() {}, error() {}, warn() {} },
    fetch: async (url, init) => provider(String(url), init) });
  function load(name) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('Fixture source name refused');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    // Transpiled once per run; every scenario still gets fresh module instances in a fresh context.
    if (!transpiled.has(name)) transpiled.set(name, ts.transpileModule(fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    const js = transpiled.get(name);
    vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })(dependency => {
      if (dependency === 'node:async_hooks') return require(dependency);
      if (!dependency.startsWith('./')) throw Error('External source dependency refused');
      return load(dependency.slice(2));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

// The production configuration, read from the tracked wrangler.toml exactly as the .218 suite reads it.
const toml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const tomlValue = name => { const line = toml.split(/\r?\n/).find(v => v.startsWith(name + ' = ')); if (!line) throw Error('config_missing_' + name); const raw = line.slice(line.indexOf('=') + 1).trim(), quote = raw[0], end = raw.indexOf(quote, 1); if (!['"', "'"].includes(quote) || end < 1) throw Error('config_literal'); return raw.slice(1, end); };
const TRACKED = ['CANONICAL_RANKS233', 'FULL_RELEASE_ROLES', 'NATIVE_RANK_SYNC232', 'QR_NATIVE_ROLE_MAP', 'QR_RANK_MAPPING_ENABLED', 'QR_PRIVILEGED_RANK_MAPPING_ENABLED', 'STAFF_TEN_RANK_ROLES', 'ROLE_GUILD_MASTER', 'ROLE_GUILD_LEADER', 'ROLE_OFFICER', 'ROLE_RAID_LEADER', 'VERIFY_MEMBERSHIP_ONLY'];
const tracked = Object.fromEntries(TRACKED.map(n => [n, tomlValue(n)]));
const ranks = JSON.parse(tracked.CANONICAL_RANKS233).ranks;
const policyJSON = (version, profile, extra = {}) => JSON.stringify({ version, enabled: extra.enabled ?? true, profile, guildId: extra.guildId ?? GUILD, ranks });
const V1_PROFILE = 'olympus-canonical-ranks-20261106-v1', V2_PROFILE = 'olympus-canonical-ranks-directive-20261112-v2';
const POLICY = { original: tracked.CANONICAL_RANKS233, directive: policyJSON(2, V2_PROFILE) };
const OFFICER_ROLE = tracked.ROLE_OFFICER, ABSENT = Symbol('absent');
const V1_NAMES = ['Guild Master', 'Stewart', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Initiate'];
const V2_NAMES = ['Guild Master', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
const NAMES = { original: V1_NAMES, directive: V2_NAMES }, OFFICER_SLOTS = { original: 6, directive: 5 };
const OFFICER = { original: ['Officer', 3], directive: ['Officer', 2] }, DEMOTED = { original: ['Member', 8], directive: ['Member', 7] };
const sourceFor = (load, kind, scope = SCOPE) => kind === 'original' ? 'addon-native-v1:' + JSON.stringify(scope) : load('native-rank-schemes').qualifiedNativeSnapshotSource(scope.guild, scope.realm);

async function fresh({ policy = 'original', admin = false, roles = null, cutoff = 'past', env: extraEnv = {}, onAsset = null, onStatement = null } = {}) {
  const calls = { discord: 0, assets: 0, statements: 0 };
  let live = null;
  const provider = async url => {
    if (url.startsWith('https://discord.com/api/') && url.includes('/guilds/' + GUILD + '/members/' + SUBJECT)) {
      calls.discord++;
      if (roles === null) return new Response(JSON.stringify({ message: 'Unknown Member', code: 10007 }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ user: { id: SUBJECT, username: 'fictional-member' }, roles, pending: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw Error('unexpected provider request ' + url);
  };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); entry.installCurrentEntryEpoch(db);
  let envRef = null;
  const now = db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) t").get().t, load = sourceGraph(provider);
  const native = entry.originalNativePort(db, { statement: sql => { calls.statements++; if (onStatement && envRef) onStatement(sql, envRef); } });
  const canonical = policy === 'original' || policy === 'directive' ? POLICY[policy] : policy === ABSENT ? undefined : policy;
  const rawEnv = entry.currentEntryEnvironment({ DB: native, COOKIE_SECRET: 'treasury-ladder-fictional-cookie-secret-only', VERIFY_SECRET: 'treasury-ladder-fictional-verify-only',
    SITE_HOST: 'guild.example', PUBLIC_BASE_URL: 'https://verify.example', DISCORD_APP_ID: '1550176895671341076', SITE_GUILD_ID: GUILD, GUILD_ID: GUILD, DISCORD_BOT_TOKEN: 'fictional-bot-token',
    SITE_ADMINS: admin ? SUBJECT : '300000000000000999', ...tracked,
    VERIFY_NATIVE_SCOPE: JSON.stringify(SCOPE),
    ...(cutoff === 'past' ? { LINKS_NOT_BEFORE: String(Math.floor(Date.now() / 1000) - 86400), LINKS_NOT_BEFORE_CLOCK_GATED: 'false' }
      : { LINKS_NOT_BEFORE: String(Math.floor(Date.now() / 1000) - 60), LINKS_NOT_BEFORE_CLOCK_GATED: 'false' }) });
  if (canonical === undefined) delete rawEnv.CANONICAL_RANKS233; else rawEnv.CANONICAL_RANKS233 = canonical;
  Object.assign(rawEnv, extraEnv);
  const writer = load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = { ...rawEnv, DB: writer, ASSETS: { fetch: async () => { calls.assets++; if (onAsset && live) await onAsset(live); return new Response(PLAN, { status: 200, headers: { 'Content-Type': 'text/javascript' } }); } } };
  envRef = env;
  const write = (sql, ...a) => writer.prepare(sql).bind(...a).run();
  live = { db, writer, write, env, load };
  await write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version) VALUES(?,?,?,?,?,1,0,1)', SUBJECT, 'fictional-member', now, now, now);
  await write('INSERT INTO members(discord_id) VALUES(?)', SUBJECT);
  const issued = await entry.issueOriginalEntryCookie(load, db, rawEnv, SUBJECT), gate = load('site-treasury-access');
  const open = async (pathname = ASSET) => { const response = await gate.treasuryAfterMemberGate(new Request('https://guild.example' + pathname, { headers: { Cookie: issued.cookie } }), env, pathname); return { status: response.status, text: await response.text() }; };
  const measured = async (pathname = ASSET) => { const before = calls.statements, out = await open(pathname); out.statements = calls.statements - before; return out; };
  return { db, now, write, env, gate, open, measured, calls, load, close: () => db.close() };
}
// One GUID-pinned character on the newest export; options mirror the .218 suite's roster().
async function roster(f, { rank, index, source, trusted = 1, complete = 1, guid = 'Player-4209-0000AA01', rowGuid = guid, age = 60, memberCount = 1, duplicateRow = false }) {
  await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('qaofficer','Qaofficer',?,'member',?,?)", SUBJECT, f.now, guid);
  await f.write('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) VALUES(1,?,?,?,?,?,?,?)', f.now - age, f.now, source, memberCount, trusted, complete, f.now);
  await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,'qaofficer','Qaofficer',?,?,?)", rank, index, rowGuid);
  if (duplicateRow) await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,'qaofficer2','Qaofficertwo','Member',7,?)", rowGuid);
}
const publishTreasurer = async f => {
  const publication = await f.load('site-appointed-identities').prepareAppointmentPublication(f.env, { treasurer: '<@' + SUBJECT + '>' });
  assert.equal(publication.ok, true, JSON.stringify(publication));
  await f.write("INSERT INTO site_settings(key,value,updated_at) VALUES('appointed',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", JSON.stringify(publication.stored), f.now);
  f.calls.discord = 0;
};
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
async function scenario(name, options, run) {
  if (only && !name.includes(only)) return;
  let f;
  try { f = await fresh(options); await run(f); }
  catch (error) { check(name + ' (scenario ran)', false, String(error && error.stack || error)); }
  finally { if (f) f.close(); }
}
const admitted = (out, f) => out.status === 200 && out.text === PLAN && f.calls.assets === 1 && f.calls.discord === 0;
const refusedBefore = (out, f) => out.status === 403 && !out.text.includes(PLAN) && f.calls.assets === 0;
const refusedAfter = (out, f) => out.status === 403 && !out.text.includes(PLAN) && f.calls.assets === 1;
const want = s => section === 'all' || section === s;

(async () => {
  // ------------------------------------------------ positives: each policy admits exactly its own officer tier
  for (const kind of ['original', 'directive']) {
    if (!want(kind)) continue;
    for (let slot = 0; slot < 10; slot++) {
      const rank = NAMES[kind][slot], officer = slot < OFFICER_SLOTS[kind];
      await scenario(kind + ' ' + rank + '(' + slot + ')', { policy: kind }, async f => {
        await roster(f, { rank, index: slot, source: sourceFor(f.load, kind) });
        const out = await f.measured();
        if (officer) { statements[kind] = Math.max(statements[kind] || 0, out.statements); }
        check(`${kind} policy: ${rank}(${slot}) ${officer ? 'reads the plan by the roster route (200, one asset fetch, no Discord call)' : 'is refused'}; ${out.statements} statements`,
          (officer ? admitted(out, f) : out.status === 403 && f.calls.assets === 0 && f.calls.discord === 1) && out.statements > 0 && out.statements < 100, { out, calls: f.calls });
      });
    }
    await scenario(kind + ' ladder and description', { policy: kind }, async f => {
      const ladder = f.gate.currentLadder(f.env);
      check(`${kind} policy: currentLadder is the ${kind} ladder on its own exact source`, !!ladder && JSON.stringify([...ladder.names]) === JSON.stringify(NAMES[kind]) && ladder.source === sourceFor(f.load, kind), ladder && { names: ladder.names, source: ladder.source });
      // Codex Root's review of 98dc690 (13 Nov 2026): the ladder must not hand out a permission list a caller could change.
      const before = JSON.stringify([ladder && Object.keys(ladder).sort(), ladder && [...ladder.names]]);
      let threw = 0;
      for (const attempt of [() => ladder.officers.add('Member'), () => { ladder.officers = new Set(['Member']); if (ladder.officers) throw new Error('assigned'); }, () => ladder.names.push('Member'), () => { ladder.names[NAMES[kind].indexOf('Member')] = 'Officer'; if (ladder.names[NAMES[kind].indexOf('Member')] === 'Officer') throw new Error('rewritten'); }, () => { ladder.policy = kind === 'original' ? 'directive' : 'original233'; if (ladder.policy !== (kind === 'original' ? 'original233' : 'directive')) throw new Error('switched'); }]) {
        try { attempt(); } catch { threw++; }
      }
      check(`${kind} policy: the ladder carries no officer list and nothing reachable from it can be changed`, !!ladder && !('officers' in ladder) && Object.isFrozen(ladder) && Object.isFrozen(ladder.names)
        && JSON.stringify(Object.keys(ladder).sort()) === JSON.stringify(['cutoff', 'names', 'policy', 'source']) && JSON.stringify([Object.keys(ladder).sort(), [...ladder.names]]) === before
        && f.gate.officerRank('Member', NAMES[kind].indexOf('Member'), ladder.names, ladder.policy) === false && f.gate.officerRank('Officer', NAMES[kind].indexOf('Officer'), ladder.names, ladder.policy) === true
        && f.gate.officerRank('Officer', NAMES[kind].indexOf('Officer'), ladder.names, 'no-such-policy') === false, { keys: ladder && Object.keys(ladder), threw });
      const text = f.gate.treasuryGateDescription(f.env);
      check(`${kind} policy: the refusal description names the active ladder's officer ranks in the owner's words`, text.includes('Leader, High Council, Officer, Officer Alt and Raid Leader rank on the latest verified roster') && !/Stewart|Treasurer rank/.test(text), text);
      await roster(f, { rank: 'Veteran', index: NAMES[kind].indexOf('Veteran'), source: sourceFor(f.load, kind) });
      const access = JSON.parse((await f.open('/api/treasury-plan/access')).text);
      check(`${kind} policy: a refused member's access answer carries that same description`, access.canRead === false && access.admits === text, access);
    });
  }
  // ------------------------------------------------ cross-profile: a pair from one ladder is never read under the other
  if (want('cross')) for (const [active, other] of [['directive', 'original'], ['original', 'directive']]) {
    for (let slot = 0; slot < 10; slot++) {
      const rank = NAMES[other][slot], alsoActive = slot < OFFICER_SLOTS[active] && NAMES[active][slot] === rank && slot < OFFICER_SLOTS[other];
      await scenario(`cross ${other} ${rank}(${slot}) under ${active}`, { policy: active }, async f => {
        await roster(f, { rank, index: slot, source: sourceFor(f.load, active) });
        const out = await f.open();
        check(`${active} policy: the ${other} pair ${rank}(${slot}) is ${alsoActive ? 'admitted only because it is also a ' + active + ' officer pair' : 'refused'}`,
          alsoActive ? admitted(out, f) : refusedBefore(out, f), { out, calls: f.calls });
      });
    }
  }
  // ------------------------------------------------ negatives under EACH policy (an officer pair valid on that ladder)
  if (want('negatives')) for (const kind of ['original', 'directive']) {
    const [rank, index] = OFFICER[kind], other = kind === 'original' ? 'directive' : 'original';
    const neg = (name, options, setup, expectAfter = false, extra = {}) => scenario(kind + ' ' + name, { policy: kind, ...options, ...extra }, async f => {
      await setup(f);
      const out = await f.open();
      check(`${kind} policy: ${name} is refused${expectAfter ? ' after the asset fetch' : ''}`, expectAfter ? refusedAfter(out, f) : refusedBefore(out, f), { out, calls: f.calls });
    });
    const own = f => sourceFor(f.load, kind);
    await neg('the other policy\'s source', {}, f => roster(f, { rank, index, source: sourceFor(f.load, other) }));
    await neg('a foreign realm source', {}, f => roster(f, { rank, index, source: sourceFor(f.load, kind, { ...SCOPE, realm: SCOPE.realm + ' OTHER' }) }));
    await neg('the generic addon source', {}, f => roster(f, { rank, index, source: 'addon' }));
    await neg('a stale export (13 hours old)', {}, f => roster(f, { rank, index, source: own(f), age: 13 * 3600 }));
    await neg('an incomplete export', {}, f => roster(f, { rank, index, source: own(f), complete: 0 }));
    await neg('an untrusted export', {}, f => roster(f, { rank, index, source: own(f), trusted: 0 }));
    await neg('a row count mismatch', {}, f => roster(f, { rank, index, source: own(f), memberCount: 2 }));
    await neg('an export from the future', {}, f => roster(f, { rank, index, source: own(f), age: -600 }));
    await neg('an export before the launch cut', { cutoff: 'recent' }, f => roster(f, { rank, index, source: own(f), age: 3600 }));
    await neg('a character that is not GUID-pinned', {}, f => roster(f, { rank, index, source: own(f), guid: null, rowGuid: 'Player-4209-0000AA01' }));
    await neg('a GUID listed twice on the export', {}, f => roster(f, { rank, index, source: own(f), duplicateRow: true, memberCount: 2 }));
    await neg('a GUID bound to two accounts', {}, async f => {
      await roster(f, { rank, index, source: own(f) });
      await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version) VALUES(?,?,?,?,?,1,0,1)', '300000000000000004', 'fictional-other', f.now, f.now, f.now);
      await f.write('INSERT INTO members(discord_id) VALUES(?)', '300000000000000004');
      await f.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('qaother','Qaother','300000000000000004','member',?,?)", f.now, 'Player-4209-0000AA01');
    });
    await neg('a banned account', {}, async f => { await roster(f, { rank, index, source: own(f) }); await f.write('UPDATE members SET banned=1 WHERE discord_id=?', SUBJECT); });
    await neg('a rename re-apply hold', {}, async f => {
      await roster(f, { rank, index, source: own(f) });
      await f.write("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,guid,nonce,state,decided_by,decided_at) VALUES(?,'Qaofficer','Qanew','qaofficer',?,'n1','reapply','300000000000000999',?)", SUBJECT, 'Player-4209-0000AA01', f.now);
    });
    await neg('a newer incomplete export (newest only)', {}, async f => {
      await roster(f, { rank, index, source: own(f) });
      await f.write('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) VALUES(2,?,?,?,1,1,0,?)', f.now - 30, f.now, own(f), f.now);
      await f.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(2,'qaofficer','Qaofficer',?,?,'Player-4209-0000AA01')", rank, index);
    });
    await neg('a rank that changes during the asset fetch', { onAsset: l => l.write('UPDATE roster_members SET rank=?,rank_index=? WHERE snapshot_id=1', ...DEMOTED[kind]) }, f => roster(f, { rank, index, source: own(f) }), true);
    await neg('a newer incomplete export arriving during the asset fetch', { onAsset: l => l.write("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) SELECT 2,exported_at,received_at,source,0,1,0,first_received_at FROM roster_snapshots WHERE id=1") }, f => roster(f, { rank, index, source: own(f) }), true);
    await neg('a session revoked during the asset fetch', { onAsset: l => l.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', SUBJECT) }, f => roster(f, { rank, index, source: own(f) }), true);
    await neg('a ban during the asset fetch', { onAsset: l => l.write('UPDATE members SET banned=1 WHERE discord_id=?', SUBJECT) }, f => roster(f, { rank, index, source: own(f) }), true);
    await neg('a publication withdrawn during the asset fetch (appointment route, no roster rank)', { onAsset: l => l.write("UPDATE site_settings SET value='{}' WHERE key='appointed'") }, async f => {
      await roster(f, { rank: DEMOTED[kind][0], index: DEMOTED[kind][1], source: own(f) }); await publishTreasurer(f);
    }, true, { roles: [] });
    // Policy change in flight: the request env is a per-request bound copy, so a change to the outer configuration while
    // the roster read or the asset fetch is awaited cannot mix into this decision (assertSameConfig, ROSTER_KEYS); the
    // next request is judged wholly by the new policy, which refuses this ladder's pair.
    await scenario(kind + ' policy changed in flight', { policy: kind, onAsset: l => { l.env.CANONICAL_RANKS233 = POLICY[other]; } }, async f => {
      await roster(f, { rank, index, source: own(f) });
      const first = await f.open(), mixed = f.calls.assets === 1 && (first.status === 200 ? first.text === PLAN : !first.text.includes(PLAN));
      f.calls.assets = 0; f.calls.discord = 0;
      const next = await f.open();
      check(`${kind} policy: a policy switched to ${other} during the asset fetch never mixes two ladders, and the next request refuses the ${kind} pair`,
        mixed && f.env.CANONICAL_RANKS233 === POLICY[other] && refusedBefore(next, f), { first, next, calls: f.calls });
    });
    await scenario(kind + ' config snapshot holds a policy change', { policy: kind }, async f => {
      const keys = ['QR_NATIVE_ROLE_MAP', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED', 'CANONICAL_RANKS233', 'VERIFY_MEMBERSHIP_ONLY', 'VERIFY_NATIVE_SCOPE', 'GUILD_ID'];
      const env = { ...f.env }, snap = f.gate.configSnapshot(env, keys);
      env.CANONICAL_RANKS233 = POLICY[other];
      let held = false; try { f.gate.assertSameConfig(env, keys, snap); } catch (error) { held = error.message === 'treasury_original_request_held'; }
      check(`${kind} policy: the roster re-admission's configuration check refuses a policy that differs from the one that chose the read`, held);
    });
  }
  // ------------------------------------------------ policy forms that must close the roster route (and only it)
  if (want('forms')) {
    const forms = [
      ['absent', ABSENT, true], ['off', 'off', true], ['empty', '', true],
      ['disabled original', policyJSON(1, V1_PROFILE, { enabled: false }), false], ['disabled Directive', policyJSON(2, V2_PROFILE, { enabled: false }), false],
      ['malformed JSON', '{"version":1,', false], ['version 3', policyJSON(3, V2_PROFILE), false],
      ['original profile with version 2', policyJSON(2, V1_PROFILE), false], ['Directive profile with version 1', policyJSON(1, V2_PROFILE), false],
      ['a different policy guild id', policyJSON(1, V1_PROFILE, { guildId: '111111111111111111' }), false],
    ];
    for (const [label, raw, discordOpen] of forms) {
      for (const kind of ['original', 'directive']) {
        const [rank, index] = OFFICER[kind];
        await scenario(`form ${label} roster ${kind}`, { policy: raw }, async f => {
          await roster(f, { rank, index, source: sourceFor(f.load, kind) });
          const out = await f.open();
          check(`policy ${label}: currentLadder is null and a ${kind} officer pair is refused by the roster route`, f.gate.currentLadder(f.env) === null && refusedBefore(out, f) && !f.gate.treasuryGateDescription(f.env).includes('latest verified roster'), { out, calls: f.calls });
        });
      }
      await scenario(`form ${label} admin`, { policy: raw, admin: true }, async f => { const out = await f.open(); check(`policy ${label}: the site admin route still admits`, admitted(out, f), out); });
      await scenario(`form ${label} appointment`, { policy: raw, roles: [] }, async f => { await publishTreasurer(f); const out = await f.open(); check(`policy ${label}: the published appointment route still admits`, admitted(out, f), out); });
      // treasuryDiscordRoles (unchanged) closes the Discord route whenever a policy is present but not enabled and current.
      await scenario(`form ${label} discord`, { policy: raw, roles: [OFFICER_ROLE] }, async f => {
        const out = await f.open();
        check(`policy ${label}: the Discord route ${discordOpen ? 'still admits after one Discord read' : 'stays closed exactly as treasuryDiscordRoles decides'}`,
          discordOpen ? out.status === 200 && out.text === PLAN && f.calls.discord === 1 : out.status === 403 && f.calls.assets === 0 && f.gate.treasuryDiscordRoles(f.env) === null, { out, calls: f.calls });
      });
    }
    await scenario('form environment guild differs', { policy: 'original', env: { GUILD_ID: '111111111111111111' } }, async f => {
      await roster(f, { rank: 'Officer', index: 3, source: sourceFor(f.load, 'original') });
      const out = await f.open();
      check('an environment GUILD_ID other than the policy guild closes the roster route', f.gate.currentLadder(f.env) === null && refusedBefore(out, f), { out, calls: f.calls });
    });
    for (const kind of ['original', 'directive']) await scenario(kind + ' Discord route under the active policy', { policy: kind, roles: [OFFICER_ROLE] }, async f => {
      const out = await f.open(); check(`${kind} policy: the Discord officer route still admits after one Discord read`, out.status === 200 && out.text === PLAN && f.calls.discord === 1, out);
    });
  }
  const failed = results.filter(r => !r.pass);
  console.log('\nSTATEMENTS ' + JSON.stringify(statements));
  console.log(`${results.length - failed.length}/${results.length} checks passed (section ${section})`);
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
