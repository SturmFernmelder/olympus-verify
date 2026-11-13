'use strict';
// Evergreen 12 Nov 2026, lane docs-gate. Plain Node, no dependency. Fails on dfca7a2 and passes on the lane head.
// 1. The D1 statement counter and the query-plan detector the bounded gate now uses (CL2-024), exercised against a
//    genuine SQLite engine (node:sqlite) behind a D1-shaped adapter, so their behaviour is proven, not their text.
// 2. CI runs the directive's whole gate under the four required job names (CL2-022, CL2-023, CL2-182).
// 3. The documents no longer state the false or stale facts the Stage 1 audit found (CL2-021, CL2-161 and others).
const fs = require('node:fs'), path = require('node:path'), {DatabaseSync} = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
let passed = 0, failed = 0;
const check = (label, ok) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + label); };

// A D1-shaped adapter over node:sqlite: prepare/bind/all/first/run and batch, nothing else.
function d1(db) {
  const statement = (sql, values) => ({
    bind: (...next) => statement(sql, next),
    all: async () => ({results: db.prepare(sql).all(...values)}),
    first: async column => { const row = db.prepare(sql).get(...values) ?? null; return column === undefined || row === null ? row : row[column]; },
    run: async () => { const r = db.prepare(sql).run(...values); return {meta: {changes: r.changes}}; },
    raw: async () => db.prepare(sql).all(...values).map(Object.values),
    __sql: sql, __values: values,
  });
  return {prepare: sql => statement(sql, []), batch: async list => Promise.all(list.map(s => s.all()))};
}

async function budget() {
  let mod;
  try { mod = await import(path.join(__dirname, 'd1_statement_budget.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:')); }
  catch { check('the bounded gate has a D1 statement counter module', false); return; }
  check('the bounded gate has a D1 statement counter module', typeof mod.countingD1 === 'function' && typeof mod.fullScans === 'function');
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE roster_members(snapshot_id INTEGER, name_key TEXT, level INTEGER, PRIMARY KEY(snapshot_id,name_key)); CREATE TABLE role_settlements(id TEXT PRIMARY KEY, subject TEXT, state TEXT); CREATE INDEX role_settlement_subject ON role_settlements(subject,state);");
  const genuine = d1(db), counter = mod.countingD1(genuine);
  counter.start();
  await counter.native.prepare('SELECT 1').first();
  await counter.native.batch([counter.native.prepare("INSERT INTO roster_members VALUES(1,'a',60)"), counter.native.prepare('SELECT * FROM roster_members WHERE snapshot_id=?1').bind(1), counter.native.prepare('SELECT 2').bind()]);
  await counter.native.prepare('SELECT * FROM role_settlements WHERE subject=?1 AND state=?2').bind('x', 'held').all();
  const log = counter.stop();
  check('every batch element and every single statement counts as one physical statement', log.length === 5);
  await counter.native.prepare('SELECT 3').first();
  check('nothing is counted outside start/stop', counter.stop().length === 5);
  let refused = false;
  try { await counter.native.batch([genuine.prepare('SELECT 1')]); } catch { refused = true; }
  check('a statement the counter did not prepare is refused, so traffic cannot bypass it', refused);
  check('binds are recorded with their statement for the plan check', JSON.stringify(log[2].values) === '[1]' && log[2].sql.includes('snapshot_id=?1'));
  const indexed = await mod.fullScans(genuine, log, ['roster_members', 'role_settlements']);
  check('indexed lookups on roster_members and role_settlements are not reported as full scans', indexed.explained === 3 && indexed.scans.length === 0);
  const scans = await mod.fullScans(genuine, [
    {sql: 'SELECT COUNT(*) FROM roster_members rm WHERE rm.level > ?1', values: [1]},
    {sql: 'SELECT * FROM role_settlements r ORDER BY r.subject', values: []},
    {sql: 'SELECT * FROM role_settlements WHERE state = ?1', values: ['held']},
  ], ['roster_members', 'role_settlements']);
  check('a full scan is reported through a table alias', scans.scans.some(s => s.table === 'roster_members' && /^SCAN rm/.test(s.detail)));
  check('a full walk of an index is reported as a full scan', scans.scans.some(s => s.table === 'role_settlements' && /^SCAN r USING (?:COVERING )?INDEX role_settlement_subject/.test(s.detail)));
  check('an unindexed filter is reported as a full scan', scans.scans.some(s => s.table === 'role_settlements' && /^SCAN role_settlements/.test(s.detail)));
  // 12 Nov review of CL2-024: with no table list every table is checked, comma joins resolve, a repeated statement counts
  // each time, CTE and derived-table scans are not table reads, and a SCAN target that cannot be resolved is reported.
  db.exec("CREATE TABLE members(discord_id TEXT PRIMARY KEY, banned INTEGER); CREATE TABLE audit(id INTEGER PRIMARY KEY, action TEXT);");
  const every = await mod.fullScans(genuine, [
    {sql: 'SELECT * FROM audit WHERE action = ?1', values: ['x']},
    {sql: 'SELECT * FROM audit WHERE action = ?1', values: ['x']},
    {sql: 'SELECT m.banned FROM role_settlements r, members m WHERE r.subject = ?1 AND m.banned = 1', values: ['x']},
    {sql: 'SELECT m.banned FROM role_settlements r,members m WHERE r.subject = ?1 AND m.banned = 1', values: ['x']},
    {sql: 'WITH recent AS MATERIALIZED (SELECT * FROM roster_members WHERE snapshot_id = ?1) SELECT COUNT(*) FROM recent x, (SELECT 1 AS one) AS d', values: [1]},
  ]);
  check('every table is checked when no table list is given: scans of audit and members are reported',
    every.explained === 5 && every.scans.filter(s => s.table === 'audit').length === 2 && every.scans.filter(s => s.table === 'members' && /^SCAN m\b/.test(s.detail)).length === 2);
  check('a comma join, with or without a space, resolves its alias', every.scans.filter(s => s.table === 'members').length === 2 && every.unresolved.length === 0);
  check('a scan of a CTE, an alias of it or a derived table is not counted as a table read', !every.scans.some(s => /^SCAN (?:recent|x|d)\b/.test(s.detail)));
  check('scanCounts gives exact per-plan counts for the allow-list comparison', typeof mod.scanCounts === 'function' && mod.scanCounts(every.scans)['audit: SCAN audit'] === 2);
  const masked = {prepare: sql => sql.startsWith('EXPLAIN QUERY PLAN SELECT * FROM members') ? {all: async () => ({results: [{detail: 'SCAN zz'}]})} : genuine.prepare(sql)};
  const closed = await mod.fullScans(masked, [{sql: 'SELECT * FROM members', values: []}]);
  check('a SCAN target that cannot be resolved to a table is reported, so the gate fails closed', closed.unresolved.length === 1 && closed.scans.length === 0);
  db.close();
  const runtime = read('worker/tests/launch_roster_pacing271_runtime.mjs'), target = read('worker/tests/launch_roster_pacing271_workerd_test.cjs');
  check('the promotions target measures the page, the strict display and a 1,000-member ingest through worker.fetch',
    runtime.includes("call('GET', '/queue/launch-operations?keyVersion=officer-operations-v233')") && runtime.includes("call('POST', '/ingest/roster?keyVersion=launch-membership-v1'")
    && runtime.includes('page.statements < DIRECTIVE_STATEMENT_LIMIT') && runtime.includes('ingest.statements <= ROSTER_INGEST_STATEMENTS'));
  check('the promotions target explains every table and pins each known scan exactly',
    runtime.includes('await fullScans(genuine, log)') && runtime.includes('KNOWN_REQUEST_SCANS') && runtime.includes("'privacy_subjects: SCAN ps': 40")
    && runtime.includes('result.unresolved.length === 0') && runtime.indexOf("await timed('display'") < runtime.indexOf("call('POST', '/ingest/roster"));
  check('the promotions target fails unless all sixteen budget checks pass', target.includes("fixtureCall('budget')") && target.includes('budget.checks.length===16'));
}

function ci() {
  const yml = read('.github/workflows/ci.yml');
  const jobs = [...yml.matchAll(/^  ([a-z]+):\n    name: ([a-z]+)$/gm)].map(m => m[1] + '=' + m[2]);
  check('the four required job names are unchanged', JSON.stringify(jobs) === JSON.stringify(['worker=worker', 'addon=addon', 'backup=backup', 'check=check']));
  check('the addon job runs every offline Lua suite', yml.includes('run_lua_suites.py --all-offline') && !yml.includes('--suite performance235'));
  check('the worker job runs the complete Watcher suite with Lua required', /OLYMPUS_REQUIRE_LUA: '1'\n\s+run: python3 -m unittest discover -s watcher\/tests\n/.test(yml) && !yml.includes("-p 'test_launch*.py'"));
  check('Lupa is installed only by hash', !yml.includes("'lupa==2.8'") && (yml.match(/--require-hashes --no-deps -r addon\/tests\/requirements-lupa\.txt/g) || []).length === 2);
  check('the worker job checks generated artifacts and the served addon package', ['npm run check:policies', 'npm run check:link-core', 'npm run check:vectors', 'node ../scripts/build-verify-addon.cjs --check'].every(c => yml.includes(c)));
  const runner = read('addon/tests/run_lua_suites.py');
  check('only the archive-dependent suite stays out of the offline run', runner.includes('NEEDS_EXTERNAL_ARCHIVE = {"dan155_census"}') && runner.includes('--all-offline'));
  check('test_intake242.py sits with the other Watcher suites', fs.existsSync(path.join(root, 'watcher/tests/test_intake242.py')) && !fs.existsSync(path.join(root, 'watcher/test_intake242.py')));
}

function docs() {
  const claude = read('CLAUDE.md');
  const audit = claude.slice(claude.indexOf('## Current Evergreen audit'), claude.indexOf('\n## ', claude.indexOf('## Current Evergreen audit') + 5));
  check('CLAUDE.md has a current audit section', audit.length > 50);
  check('the audit section names no build that can go stale and points to the deploy checklist and the shared log', !/\.\d{3}\b/.test(audit) && audit.includes('docs/deploy-checklist.md') && audit.includes('claude_code_x_chatgpt_codex.md'));
  check('the audit section keeps the 10 November qualification policy', audit.includes('10 November 2026'));
  check('CLAUDE.md names the flagship guild OLYMPUS PRIME, never Olympus I as its name', claude.includes('OLYMPUS PRIME') && !/Seats[^\n]*Olympus I\b/.test(claude));
  check('CLAUDE.md no longer says npm test runs check:policies', !/check:policies[^\n]*(?:part of|in) `?npm test/.test(claude));
  check('CLAUDE.md no longer says the schema proof runs once per isolate', !/once per isolate/i.test(claude));
  check('CLAUDE.md marks frontend_check and the hosts suite as historical diagnostics outside the gate',
    !claude.includes('add a check there with every') && !claude.includes('the hosts suite fails on a bare one')
    && /frontend_check\.cjs[\s\S]{0,700}historical\s+diagnostic/.test(claude) && /Nothing in the gate enforces this now: `tests\/hosts_test\.cjs`/.test(claude));
  check('CLAUDE.md says ROLE_GUILD_MEMBER is the Member rank role with two write paths',
    !claude.includes('legacy Guild Member writer') && /ROLE_GUILD_MEMBER[\s\S]{0,200}same\s+role,\s+`1552077551839617104`/.test(claude) && claude.includes('two write paths'));
  const rq = read('docs/release-qualification.md');
  check('release qualification documents the offline Lua run, the Watcher suite and the D1 assertions', rq.includes('--all-offline') && rq.includes('unittest discover -s watcher/tests') && rq.includes('ROSTER_INGEST_STATEMENTS') && rq.includes('role_settlements'));
  check('release qualification states the current D1 catalogue', rq.includes('444 live') && rq.includes('443 portable'));
  const history = read('docs/owner-instruction-history.md');
  check('owner instruction history has the 12 November rulings', history.includes('12 November 2026') && /There is no\s+"Stewart" rank/.test(history) && !history.includes('Any member-facing text you write') && history.includes('one localStorage key'));
  check('owner instruction history no longer heads superseded instructions "Current"', !/^#+ Current/m.test(history));
  const checklist = read('docs/deploy-checklist.md');
  const missing = [];
  for (let n = 229; n <= 279; n++) if (!new RegExp('^#{2,3} .*\\.' + n + '\\b', 'm').test(checklist)) missing.push(n);
  check('the deploy checklist has an entry for every build .229 to .279' + (missing.length ? ' (missing ' + missing.join(',') + ')' : ''), missing.length === 0);
  const readme = read('README.md');
  check('README names the current site host', !readme.includes('guild.roachcouncil.com') || /former|legacy|old/i.test(readme.slice(Math.max(0, readme.indexOf('guild.roachcouncil.com') - 200), readme.indexOf('guild.roachcouncil.com') + 200)));
}

(async () => {
  await budget(); ci(); docs();
  console.log(`\n${passed}/${passed + failed} docs-gate checks passed`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
