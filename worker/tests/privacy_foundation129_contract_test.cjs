// Concrete local source/SQLite qualification. No caller, route or live erasure is enabled.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fixture, load, root } = require('./helpers/privacy129_fixture.cjs');
const catalog = load('privacy-store-catalog'), core = load('account-lifecycle'), erase = load('privacy-erasure');
const coverage = load('privacy-foundation-coverage'), authority = load('account-root-authority');
const scope = load('account-root-scope'), site = load('site-core');
let checks = 0;
const eq = (name, actual, expected) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), name); checks++; console.log('PASS ' + name); };
const ok = (name, value) => { assert.ok(value, name); checks++; console.log('PASS ' + name); };
const A = '123456789012345678', B = '987654321098765432', GUILD = '236932545793490944', APP = '1550176895671341076';
const G = '1'.repeat(32), P = '2'.repeat(32), E = '3'.repeat(32), D = '4'.repeat(64);
const origin = 'https://example.invalid', secret = 'SYNTHETIC-FOUNDATION129-HMAC';
async function seed(f) {
  f.db.prepare('INSERT INTO generation_control VALUES(1,?,0,0)').run(E);
  f.db.prepare('INSERT INTO root_authority_scope VALUES(1,?,?,0,?)').run(GUILD, APP, await scope.rootScopeProvenance(origin, GUILD, APP));
  for (const subject of [A, B]) {
    f.db.prepare("INSERT INTO account_generations VALUES(?,?,'active',0,'reviewed-legacy',?)").run(subject, G, D);
    for (const purpose of ['account_write', 'role_grant', 'role_remove', 'erasure'])
      f.db.prepare('INSERT INTO account_purpose_generations(account_id,account_generation,purpose,generation,updated_at) VALUES(?,?,?,?,?)').run(subject, G, purpose, P, f.now);
    f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,session_version,checked_at) VALUES(?,?,?,7,?)').run(subject, f.now, f.now, f.now);
    f.db.prepare('INSERT INTO members(discord_id,banned) VALUES(?,0)').run(subject);
  }
}
const operation = f => ({ subject: A, accountGeneration: G, purposeGeneration: P, epoch: E, operationId: '5'.repeat(32),
  requestDigest: '6'.repeat(64), accountRevision: 0, controlRevision: 0, provenanceDigest: D, expiresAt: f.now + 3600 });
async function signedRequest(f) {
  const body = site.b64u(new TextEncoder().encode(JSON.stringify({ u: A, v: 7, e: f.now + 7200 })));
  return new Request(origin + '/api/dormant', { headers: { Cookie: '__Host-olg=' + body + '.' + await site.sign(secret, 'session', body) } });
}
const config = f => ({ db: f.port, origin, guildId: GUILD, roleGuildId: GUILD, applicationId: APP, cookieSecret: secret });
async function run() {
  eq('all six lifecycle composition gates remain off', Object.values(core.LIFECYCLE_COMPOSITION), [false, false, false, false, false, false]);
  eq('root dispatcher entry remains off', authority.ROOT_AUTHORITY_ENTRY_ENABLED, false);
  eq('54 immutable logical stores have 19 local plans and 35 holds', [catalog.STORE_CATALOG.length,
    catalog.STORE_CATALOG.filter(s => s.plan).length, catalog.STORE_CATALOG.filter(s => !s.plan).length], [54, 19, 35]);
  eq('role-ledger stores occupy original final ordinals and remain held', catalog.STORE_CATALOG.slice(52).map(s => [s.table, s.plan, s.referenceCoverage]),
    [['role_grants', null, 'unqualified'], ['role_attempts', null, 'unqualified']]);
  ok('all 54 reference projections remain unqualified', catalog.STORE_CATALOG.every(s => s.referenceCoverage === 'unqualified'));
  const entry = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');
  ok('production entry imports none of the dormant foundation modules', !/from\s+['"]\.\/(?:account-lifecycle|account-root-authority|privacy-erasure|privacy-foundation-coverage)['"]/.test(entry));

  let f = fixture(false), report = await coverage.inspectFoundationCoverage(f.port);
  eq('actual baseline schema cannot qualify planned profile', report.physicalProfile, 'held');
  eq('current 67-table baseline keeps the dormant 63-name census explicitly truncated', report.censusMayBeTruncated, true);
  eq('bounded baseline missing-name vector is reported exactly', [...report.missingStores].sort(),
    [...catalog.FOUNDATION_TABLES, 'site_login_flows', 'role_grants', 'role_attempts', 'site_users', 'site_votes'].sort());
  eq('the truncated names are physically present rather than claimed absent',
    f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('site_users','site_votes') ORDER BY name").all().map(r => r.name), ['site_users', 'site_votes']);
  eq('baseline report never provides full erasure authority', [report.completeErasureQualified, report.accountAuthorityAdopted], [false, false]);
  f.db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at) VALUES(?,?,?,?,?)').run(A, 'fixture', 'Fixture', f.now, f.now + 3600);
  const r = await core.retireExistingAccount(f.port, operation(f));
  eq('actual baseline retirement refuses missing schema', [r.status, r.reason], ['refused', 'unclassified_schema']);
  eq('baseline refusal does not erase ordinary rows', f.db.prepare('SELECT COUNT(*) n FROM pending').get().n, 1);
  f.db.close();

  f = fixture(); report = await coverage.inspectFoundationCoverage(f.port);
  eq('planned fixture has 62 raw physical tables including SQLite sequence', f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n, 62);
  eq('test-local fixture qualifies only exact physical profile', [report.physicalProfile, report.reason], ['qualified', 'physical_shape_only_all_reference_and_completion_gates_held']);
  eq('complete field/reference purpose disposition is still held', [report.referenceCoverageUnqualified.length, report.foundationDispositionUnqualified.length, report.completeErasureQualified], [54, 7, false]);
  for (const s of catalog.STORE_CATALOG) {
    const columns = f.db.prepare(`PRAGMA table_info('${s.table}')`).all().map(c => c.name);
    ok(s.table + ' has real authored physical fields', columns.length > 0);
    if (s.plan) ok(s.table + ' exact local-owner field exists', columns.includes(s.plan.owner));
  }
  eq('global controls are distinct from five ordinary/custody foundations', coverage.FOUNDATION_DISPOSITIONS.filter(s => s.finalDisposition === 'preserve_control').map(s => s.table), ['generation_control', 'root_authority_scope']);
  for (const table of ['privacy_erasure_jobs', 'privacy_erasure_progress', 'privacy_external_outbox', 'account_purpose_generations'])
    ok(table + ' actual FK dependency is present', f.db.prepare(`PRAGMA foreign_key_list('${table}')`).all().length > 0);
  f.db.exec('CREATE TABLE community_event_deliveries(event_id TEXT,actor TEXT,session_version INTEGER,session_expires INTEGER)');
  report = await coverage.inspectFoundationCoverage(f.port);
  eq('new delivery130 store cannot silently qualify the old profile', [report.physicalProfile, report.unexpectedTables], ['held', ['community_event_deliveries']]);
  eq('delivery future extension is explicit rather than an ordinal 54 append', [coverage.FUTURE_DELIVERY_STORE.coverage, catalog.STORE_CATALOG.length], ['unqualified', 54]);
  f.db.close();

  for (const [name, change] of [
    ['old52 progress', x => x.db.exec('DELETE FROM privacy_erasure_progress WHERE ordinal>=52')],
    ['count-correct substituted role store', x => x.db.exec("UPDATE privacy_erasure_progress SET store_key='fake_role_grants' WHERE ordinal=52")],
    ['held role-plan promotion', x => x.db.exec("UPDATE privacy_erasure_progress SET state='done' WHERE ordinal=52")],
    ['wrong held-reference reason', x => x.db.exec("UPDATE privacy_erasure_progress SET held_reason='invented_qualified' WHERE ordinal=53")],
    ['wrong catalog digest', x => x.db.exec("UPDATE privacy_erasure_jobs SET catalog_digest='" + '7'.repeat(64) + "'")],
    ['wrong catalog version', x => x.db.exec("UPDATE privacy_erasure_jobs SET catalog_version='old52'")],
  ]) {
    f = fixture(); await seed(f);
    f.db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at) VALUES(?,?,?,?,?)').run(A, 'fixture', 'Fixture', f.now, f.now + 3600);
    const op = operation(f); await core.retireExistingAccount(f.port, op); change(f);
    const status = await erase.runErasureSlice(f.port, core.reference(op));
    eq(name + ' refuses a destructive local slice', f.db.prepare('SELECT COUNT(*) n FROM pending').get().n, 1);
    ok(name + ' cannot claim completion or local completion', status.status === 'held' && !status.allStoresErased && !status.localPlansFinished);
    eq(name + ' retains unresolved role-removal custody', f.db.prepare('SELECT state FROM privacy_external_outbox').get().state, 'held');
    f.db.close();
  }

  for (const [name, change] of [
    ['NULL check clock', x => x.db.exec('UPDATE site_users SET checked_at=NULL WHERE discord_id=' + A)],
    ['exact one-hour boundary', x => x.db.prepare('UPDATE site_users SET checked_at=? WHERE discord_id=?').run(x.now - 3600, A)],
    ['older membership check', x => x.db.prepare('UPDATE site_users SET checked_at=? WHERE discord_id=?').run(x.now - 3601, A)],
    ['future membership check', x => x.db.prepare('UPDATE site_users SET checked_at=? WHERE discord_id=?').run(x.now + 1, A)],
    ['left preferred Discord guild', x => x.db.prepare('UPDATE site_users SET in_server=0 WHERE discord_id=?').run(A)],
    ['own current rejection', x => x.db.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?').run(A)],
  ]) {
    f = fixture(); await seed(f); const issuer = authority.createRootAuthority(config(f)), request = await signedRequest(f);
    const positive = await issuer.captureSite(request, 'account_write'); eq(name + ' begins with fresh fixture ticket', positive.state, 'captured');
    change(f); eq(name + ' holds a new protected capture', (await issuer.captureSite(request, 'account_write')).state, 'held');
    eq(name + ' also holds original ticket at consuming SQL', (await issuer.current(positive.ticket)).state, 'held');
    issuer.close(); f.db.close();
  }
  f = fixture(); await seed(f);
  f.db.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?').run(B);
  let issuer = authority.createRootAuthority(config(f)), result = await issuer.captureSite(await signedRequest(f), 'account_write');
  eq('another account rejection cannot reject this account', result.state, 'captured');
  eq('copied shaped ticket cannot become purpose authority', issuer.consumePlan({ ...issuer.describe(result.ticket) }).state, 'held');
  f.advance(3600); eq('an outage cannot renew original membership proof', (await issuer.current(result.ticket)).state, 'held');
  issuer.close(); f.db.close();

  f = fixture(); await seed(f); const op = operation(f); await core.retireExistingAccount(f.port, op);
  assert.throws(() => f.db.prepare('DELETE FROM account_generations WHERE account_id=?').run(A), /FOREIGN KEY/); checks++;
  eq('ordinary account cannot disappear beneath unresolved request custody', f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state, 'retiring');
  // Test-native FK demonstration only, not a product completion executor.
  f.db.prepare('DELETE FROM privacy_erasure_jobs WHERE subject=?').run(A);
  eq('qualified fixture job deletion cascades dependent progress/outbox by actual FK', [f.db.prepare('SELECT COUNT(*) n FROM privacy_erasure_progress').get().n, f.db.prepare('SELECT COUNT(*) n FROM privacy_external_outbox').get().n], [0, 0]);
  f.db.prepare('DELETE FROM account_purpose_generations WHERE account_id=?').run(A);
  f.db.prepare('DELETE FROM account_generations WHERE account_id=?').run(A);
  eq('test-native subject purge preserves independent global controls', [f.db.prepare('SELECT epoch FROM generation_control').get().epoch, f.db.prepare('SELECT guild_id FROM root_authority_scope').get().guild_id], [E, GUILD]);
  eq('test-native subject purge preserves other account', f.db.prepare('SELECT COUNT(*) n FROM account_generations WHERE account_id=?').get(B).n, 1);
  f.db.close();
  console.log(JSON.stringify({ suite: 'privacy-foundation129-contract', passed: checks, total: checks, providerCalls: 0, schema: 'actual baseline plus separate test-local planned fixture', activated: false }));
}
run().catch(e => { console.error(e); process.exitCode = 1; });
