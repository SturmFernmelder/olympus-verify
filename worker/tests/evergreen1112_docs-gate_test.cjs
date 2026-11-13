'use strict';
// Evergreen 12 Nov 2026, lane docs-gate. Plain Node, no dependency. Fails on dfca7a2 and passes on the lane head.
// 1. The D1 statement counter and the query-plan detector the bounded gate now uses (CL2-024), exercised against a
//    genuine SQLite engine (node:sqlite) behind a D1-shaped adapter, so their behaviour is proven, not their text.
// 2. CI runs the directive's whole gate under the four required job names (CL2-022, CL2-023, CL2-182).
// 3. The documents no longer state the false or stale facts the Stage 1 audit found (CL2-021, CL2-161 and others).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), {DatabaseSync} = require('node:sqlite');
// DOCS_GATE_ROOT=<checkout> reads the documents and data of another checkout (read-only), for a fail-before receipt.
// The counter module, the Worker entry and the fixtures always come from this checkout.
const root = path.resolve(process.env.DOCS_GATE_ROOT || path.join(__dirname, '../..'));
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
  // 12 Nov review (REV-GATE-1): an equality join on an unindexed column plans as SEARCH ... USING AUTOMATIC ... INDEX,
  // which builds an index over the whole table on every run. On a physical table that is a full scan.
  const automatic = await mod.fullScans(genuine, [
    {sql: 'SELECT m.banned FROM members m LEFT JOIN audit a ON a.action = m.discord_id', values: []},
    {sql: 'SELECT m.banned FROM members m LEFT JOIN audit ON audit.action = m.discord_id', values: []},
    {sql: 'WITH recent AS MATERIALIZED (SELECT name_key FROM roster_members WHERE snapshot_id = ?1) SELECT m.banned FROM members m LEFT JOIN recent x ON x.name_key = m.discord_id', values: [1]},
    {sql: 'SELECT m.banned FROM members m LEFT JOIN (SELECT action FROM audit GROUP BY action) AS d ON d.action = m.discord_id', values: []},
    {sql: 'SELECT m.banned FROM members m LEFT JOIN (SELECT action FROM audit GROUP BY action) ON action = m.discord_id', values: []},
  ]);
  const autoRows = automatic.scans.filter(s => / USING AUTOMATIC /.test(s.detail));
  check('an unindexed equality join (automatic index) on a table, by alias or by name, is reported as a full scan of that table',
    autoRows.length === 2 && autoRows.every(s => s.table === 'audit' && /^SEARCH (?:a|audit) USING AUTOMATIC (?:PARTIAL )?(?:COVERING )?INDEX \(action=\?\)/.test(s.detail)));
  check('an automatic index on a CTE, a derived table or an unnamed subquery is not counted as a table read',
    automatic.unresolved.length === 0 && !automatic.scans.some(s => /^SEARCH (?:x|d|\(subquery-\d+\)) /.test(s.detail)));
  check('the allow-list key of an automatic-index scan names the table and the exact plan text',
    mod.scanCounts(automatic.scans)['audit: SEARCH a USING AUTOMATIC COVERING INDEX (action=?) LEFT-JOIN'] === 1);
  const maskedAuto = {prepare: sql => sql.startsWith('EXPLAIN QUERY PLAN SELECT * FROM members') ? {all: async () => ({results: [{detail: 'SEARCH zz USING AUTOMATIC COVERING INDEX (x=?)'}]})} : genuine.prepare(sql)};
  const closedAuto = await mod.fullScans(maskedAuto, [{sql: 'SELECT * FROM members', values: []}]);
  check('an automatic-index target that cannot be resolved to a table is reported, so the gate fails closed', closedAuto.unresolved.length === 1 && closedAuto.scans.length === 0);
  // Round 3 (13 Nov 2026), misc item 2: the PARTIAL form. When the join also constrains the inner table with a term no
  // index serves, SQLite plans SEARCH <alias> USING AUTOMATIC PARTIAL COVERING INDEX (...). It still reads the whole
  // table to build that index, and the module comment and release-qualification.md say it is counted.
  db.exec('CREATE TABLE notes(id INTEGER PRIMARY KEY, subject TEXT, kind TEXT);');
  const partialSql = [
    {sql: 'SELECT m.banned FROM members m LEFT JOIN notes n ON n.subject = m.discord_id AND n.kind IS NOT NULL', values: []},
    {sql: 'SELECT m.banned FROM members m LEFT JOIN notes ON notes.subject = m.discord_id AND notes.kind = ?1', values: ['x']},
    {sql: 'WITH recent AS MATERIALIZED (SELECT subject, kind FROM notes WHERE id > ?1) SELECT m.banned FROM members m LEFT JOIN recent r ON r.subject = m.discord_id AND r.kind IS NOT NULL', values: [0]},
  ];
  // The case is not vacuous: the engine really plans the PARTIAL form for all three statements.
  const planned = partialSql.map(({sql, values}) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...values).map(r => r.detail));
  check('SQLite plans the PARTIAL form of an automatic index for a join with an unindexed constraint on the inner table',
    planned.every(rows => rows.some(d => / USING AUTOMATIC PARTIAL (?:COVERING )?INDEX /.test(d))));
  const partial = await mod.fullScans(genuine, partialSql);
  const partialRows = partial.scans.filter(s => / USING AUTOMATIC PARTIAL /.test(s.detail));
  check('a PARTIAL automatic index on a table, by alias or by name, is reported as a full scan of that table',
    partialRows.length === 2 && partialRows.every(s => s.table === 'notes') && partialRows.some(s => /^SEARCH n USING AUTOMATIC PARTIAL /.test(s.detail)) && partialRows.some(s => /^SEARCH notes USING AUTOMATIC PARTIAL /.test(s.detail)));
  check('a PARTIAL automatic index on a CTE is not counted as a table read, and the CTE\'s own rowid lookup is not a scan',
    partial.unresolved.length === 0 && !partial.scans.some(s => /^SEARCH r /.test(s.detail)) && !partial.scans.some(s => /^SCAN notes\b/.test(s.detail)));
  check('the allow-list key of a PARTIAL automatic-index scan names the table and the exact plan text',
    mod.scanCounts(partial.scans)['notes: SEARCH n USING AUTOMATIC PARTIAL COVERING INDEX (subject=?) LEFT-JOIN'] === 1);
  const maskedPartial = {prepare: sql => sql.startsWith('EXPLAIN QUERY PLAN SELECT * FROM members') ? {all: async () => ({results: [{detail: 'SEARCH zz USING AUTOMATIC PARTIAL COVERING INDEX (x=?)'}]})} : genuine.prepare(sql)};
  const closedPartial = await mod.fullScans(maskedPartial, [{sql: 'SELECT * FROM members', values: []}]);
  check('a PARTIAL automatic-index target that cannot be resolved to a table is reported, so the gate fails closed', closedPartial.unresolved.length === 1 && closedPartial.scans.length === 0);
  db.close();
  const runtime = read('worker/tests/launch_roster_pacing271_runtime.mjs'), target = read('worker/tests/launch_roster_pacing271_workerd_test.cjs');
  // Round 5 gate (13 Nov 2026). The pins were the route versions of 12 Nov (officer-operations-v233, launch-membership-v1);
  // the Worker now serves the page at officer-operations-v234 and takes the native roster at native-roster-v2, and Codex's
  // runtime follows it. The versions are read from the router in src/index.ts, so the check follows the routes the Worker
  // actually serves instead of a remembered string, and it now also pins the strict display call and the drained
  // deferred work (Codex counts waitUntil continuations since 805e968).
  const router = read('worker/src/index.ts'), served = re => (router.match(re) || [])[1];
  const pageVersion = served(/path==='\/queue\/launch-operations'&&versions\.length===1&&versions\[0\]==='([a-z0-9-]+)'/);
  const ingestVersion = served(/path==='\/ingest\/roster'&&versions\.length===1&&versions\[0\]==='([a-z0-9-]+)'/);
  const displayVersion = (read('worker/src/unverified.ts').match(/export const STRICT_ROSTER_DISPLAY_PROTOCOL_V2 = "([a-z0-9-]+)"/) || [])[1];
  check('the promotions target measures the page, the strict display and a 1,000-member ingest through worker.fetch',
    !!pageVersion && !!ingestVersion && !!displayVersion && runtime.includes('response = await worker.fetch(request, env, measuredContext)')
    && runtime.includes("call('GET', '/queue/launch-operations?keyVersion=" + pageVersion + "')") && runtime.includes("call('GET', '/queue/unverified?keyVersion=" + displayVersion + "')")
    && runtime.includes("call('POST', '/ingest/roster?keyVersion=" + ingestVersion + "'")
    && runtime.includes('page.statements < DIRECTIVE_STATEMENT_LIMIT') && runtime.includes('display.statements < DIRECTIVE_STATEMENT_LIMIT')
    && runtime.includes('ingest.statements <= ROSTER_INGEST_STATEMENTS && ingest.allDeferredDrained'));
  // Round 5 gate: the first half of this check (every table explained, no unresolved alias, the reads planned before the
  // ingest writes) is still guaranteed and checked here in its current form. The second half ("pins each known scan
  // exactly", KNOWN_REQUEST_SCANS with 'privacy_subjects: SCAN ps': 40) was removed from the runtime in the 13 Nov merge
  // 0984102 ("do not pin the old dfca plan strings"): the promotions target now records scans but fails on none. That is
  // a lost guarantee of the gate, reported to Codex; it is the separate check below and stays red until a current
  // allow-list is enforced again (or the documents stop claiming one).
  // Round 5 gate review: renamed from "...explains every table and pins each known scan exactly"; the pin is the
  // LOST GUARANTEE check below.
  check('the promotions target explains every table of the page, display and ingest with no unresolved alias, and plans and times the display reads before the ingest writes',
    runtime.includes('await fullScans(genuine, log)') && runtime.includes('result.explained === log.length && result.explained > 0 && result.unresolved.length === 0')
    && ['page', 'display', 'ingest'].every(name => runtime.includes("await explain('" + name + "', " + name + '.log)'))
    && runtime.indexOf("await explain('display'") < runtime.indexOf("call('POST', '/ingest/roster") && runtime.indexOf("timedOriginal('display'") < runtime.indexOf("call('POST', '/ingest/roster"));
  const qualifyHelp = read('worker/scripts/qualify.cjs');
  const claimsAllowList = /every full scan of any table must match the recorded allow-list/.test(qualifyHelp) || /remove\s+the entry from the allow-list/.test(read('docs/release-qualification.md'));
  const enforcesAllowList = /KNOWN_[A-Z_]*SCANS/.test(runtime) && /JSON\.stringify\(scanCounts\([^)]*\)\)\s*===\s*JSON\.stringify\(/.test(runtime);
  check('LOST GUARANTEE (reported to Codex, round 5): a full scan outside the documented allow-list fails the promotions target, as qualify --help and release-qualification.md say',
    enforcesAllowList || !claimsAllowList);
  // 12 Nov review (REV-GATE-2): the ingest's members scan comes from BOUND_AND_NOTE_SELECT's UNION ALL arm, not from
  // BOUND_SELECT (characters LEFT JOIN privacy_subjects). Proven on the schema, then the two descriptions are checked.
  const roster = read('worker/src/roster.ts'), schemaDb = new DatabaseSync(':memory:');
  schemaDb.exec(read('worker/schema.sql'));
  const boundSql = roster.match(/const BOUND_SELECT=`([^`]*)`/)[1], noteArm = roster.match(/const BOUND_AND_NOTE_SELECT=BOUND_SELECT\+`([^`]*)`/)[1];
  const planOf = sql => schemaDb.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(r => r.detail);
  check('BOUND_SELECT alone scans characters only; BOUND_AND_NOTE_SELECT adds the members scan',
    planOf(boundSql).includes('SCAN c') && !planOf(boundSql).includes('SCAN m') && planOf(boundSql + noteArm).includes('SCAN m'));
  schemaDb.close();
  const rqDoc = read('docs/release-qualification.md'), memberRow = rqDoc.split('\n').find(line => line.startsWith('   |') && line.includes('`SCAN m`')) ?? '';
  // Round 5 gate: the runtime comment this check also read sat on the KNOWN_REQUEST_SCANS entry 'members: SCAN m': 1,
  // removed with the allow-list (see the lost-guarantee check above). Where the runtime still names the members scan it
  // must attribute it the same way; the documented row is checked as before, against the plan proven above.
  const runtimeNames = /SCAN m\b/.test(runtime);
  // Round 5 gate review: renamed from "the known-scans table and the runtime comment attribute..."; the runtime half
  // applies only while the runtime names the scan (today it does not, so only the documented row is pinned).
  check('the known-scans table attributes the members scan to BOUND_AND_NOTE_SELECT, and so does the runtime wherever it names that scan',
    memberRow.includes('BOUND_AND_NOTE_SELECT') && /UNION ALL[^|]*banned=0/.test(memberRow)
    && (!runtimeNames || /BOUND_AND_NOTE_SELECT[\s\S]{0,240}UNION ALL arm reads every member with banned=0 \(SCAN m\)[\s\S]{0,40}'members: SCAN m': 1/.test(runtime)));
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
  // MNT-RUN-001 (Codex): the scheduled budget test's preamble must state the source schedule qualifier as the source has it.
  const budgetSrc = read('worker/src/scheduled-budget.ts'), scheduleTest = read('worker/tests/scheduled_budget_test.cjs');
  const qualified = (budgetSrc.match(/export const EPOCH2_SCHEDULE_QUALIFIED=(true|false) as const;/) || [])[1];
  const preamble = scheduleTest.slice(0, scheduleTest.indexOf('\nconst '));
  check('the scheduled budget test preamble states the source schedule qualifier as the source sets it (' + qualified + ')',
    qualified === 'true' && !/qualifier stays false/.test(preamble) && /EPOCH2_SCHEDULE_QUALIFIED has been true since \.161/.test(preamble));
  // MNT-BRANCH-001 (Codex): the download document describes the package the builder makes now, and keeps 0.6.21 historical.
  const pack = require(path.join(root, 'scripts/build-verify-addon.cjs'));
  const download = read('docs/verify-addon-download.md'), split = download.indexOf('\n## Historical');
  const current = split < 0 ? download : download.slice(0, split), past = split < 0 ? '' : download.slice(split);
  const excluded = JSON.parse(read(pack.MANIFEST)).localFilesExcluded;
  check('the addon download document describes the current package (' + pack.VERSION + ', ' + pack.FILES.length + ' files) and every private-file exclusion',
    current.includes('olympus-verify-' + pack.VERSION + '.zip') && current.includes('allow-list of ' + pack.FILES.length + ' public files')
    && excluded.every(name => current.includes('`' + name + '`')) && current.includes('--check'));
  check('the 0.6.21 package, its 17 source files and the retired pin model appear only as history',
    !/0\.6\.21|\b17 (?:listed )?source files|pins the three/.test(current) && /0\.6\.21/.test(past) && /17 listed source files/.test(past));
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
  // Round 3 (13 Nov 2026), misc item 1: the university authoring guide passes the university's own schedule rule line by
  // line (the build applies it to every course string), and its supersededBy row describes the generator's SUPERSEDED
  // list as the generator defines it.
  const uniRules = (() => { const m = {exports: {}}; vm.runInNewContext(read('worker/public/static/university/validate.js'), {module: m}, {timeout: 2000}); return m.exports; })();
  const authoring = read('docs/university-authoring.md');
  const refusedLines = typeof uniRules.scheduleWording === 'function' ? authoring.split('\n').filter(line => uniRules.scheduleWording(line)) : ['validate.js has no scheduleWording'];
  check('the university authoring guide uses the dated schedule wording the university build enforces' + (refusedLines.length ? ' :: ' + refusedLines.map(l => l.trim().slice(0, 90)).join(' | ') : ''),
    refusedLines.length === 0 && /Raid unlock date: 9 December 2026/.test(authoring));
  const literal = (read('scripts/university/generate-talent-facts.cjs').match(/^const SUPERSEDED = (\{[\s\S]*?\});$/m) || [])[1];
  const superseded = literal ? Object.keys(vm.runInNewContext('(' + literal + ')', {}, {timeout: 1000})) : null;
  const supersededRow = authoring.split('\n').find(line => line.startsWith('| `supersededBy` |')) || '';
  check('the authoring guide describes the generator\'s SUPERSEDED list as it is (' + (superseded ? superseded.length + ' entries' : 'not found') + ')',
    Array.isArray(superseded) && (superseded.length === 0 ? /The list is empty/.test(supersededRow) && !/list: Mental Dexterity and Stormstrike/.test(supersededRow) : superseded.every(id => supersededRow.includes(id))));
  const readme = read('README.md');
  check('README names the current site host', !readme.includes('guild.roachcouncil.com') || /former|legacy|old/i.test(readme.slice(Math.max(0, readme.indexOf('guild.roachcouncil.com') - 200), readme.indexOf('guild.roachcouncil.com') + 200)));
}

// 12 Nov 2026 follow-up (route cases): every file under the member-gated talent archive has an anonymous post-deployment
// case, and each recorded expectation is what the actual Worker entry answers an anonymous caller (asset and database
// bindings are traps, so the check also proves the 401 comes before any read).
async function routes() {
  const crypto = require('node:crypto'), cases = JSON.parse(read('tools/public-route-cases.json')).cases;
  const expected = Number((read('tools/check-public-routes.cjs').match(/const EXPECTED_CASES=(\d+);/) || [])[1]);
  check('the post-deployment replay expects exactly the recorded number of route cases (' + cases.length + ')', expected === cases.length);
  const site = 'https://olympus.roachcouncil.com', dir = 'worker/public/static/talents/archive';
  const files = [];
  const walk = rel => { for (const e of fs.readdirSync(path.join(root, rel), {withFileTypes: true})) e.isDirectory() ? walk(rel + '/' + e.name) : files.push(rel.slice('worker/public'.length) + '/' + e.name); };
  if (fs.existsSync(path.join(root, dir))) walk(dir);
  const archive = cases.filter(c => c.url.startsWith(site + '/static/talents/archive/'));
  check('every talent archive file has exactly one anonymous GET route case (' + files.length + ' files)',
    files.length > 0 && files.every(file => archive.filter(c => c.method === 'GET' && c.url === site + file).length === 1) && archive.length === files.length);
  const {load} = require('./helpers/privacy129_fixture.cjs');
  const index = load('index').default;
  let touched = 0;
  const env = {PUBLIC_BASE_URL: 'https://olympus-verify.roach-council.workers.dev', SITE_HOST: 'olympus.roachcouncil.com',
    ASSETS: {fetch: async () => { touched++; return new Response('asset', {status: 200}); }}};
  Object.defineProperty(env, 'DB', {get() { touched++; throw Error('anonymous static request touched the database'); }});
  const answers = [];
  for (const c of archive) {
    const response = await index.fetch(new Request(c.url, {method: c.method}), env, {waitUntil() {}, passThroughOnException() {}});
    const body = Buffer.from(await response.arrayBuffer());
    answers.push(response.status === c.status && crypto.createHash('sha256').update(body).digest('hex') === c.bodySHA256
      && c.headers.every(h => { const v = response.headers.get(h.name); return h.mode === 'absent' ? v === null : h.mode === 'equals' ? v === h.value : typeof v === 'string' && v.includes(h.value); }));
  }
  check('the actual Worker entry answers each talent archive case exactly as recorded (401, before any asset or database read)',
    archive.length > 0 && answers.length === archive.length && answers.every(Boolean) && archive.every(c => c.status === 401) && touched === 0);
  // Round 3 (13 Nov 2026), misc item 3: the owner approved 90 public behaviours; the replay now expects more. Where the
  // count is documented, the difference must be explained: which paths, why, and that each asserts an anonymous refusal.
  const rq = read('docs/release-qualification.md'), claude = read('CLAUDE.md');
  const para = rq.split(/\n\s*\n/).find(p => p.includes('tools/check-public-routes.cjs')) || '';
  const added = expected - 90, paths = archive.map(c => new URL(c.url).pathname);
  check('release qualification explains the ' + expected + ' route cases: the 90 approved behaviours plus each added archive path, named, as an anonymous 401 refusal',
    added === archive.length && para.includes(expected + ' cases') && para.includes('the 90 public behaviours the owner approved') && paths.every(p => para.includes('`' + p + '`'))
    && /\b401\b/.test(para) && /anonymous/.test(para) && /no public behaviour/.test(para));
  const probes = [...claude.matchAll(/all (\d+) public probes/g)].map(m => Number(m[1]));
  check('CLAUDE.md states the same post-deployment probe count and says what the two additions are',
    probes.length === 1 && probes[0] === expected && /all \d+ public probes \(the 90 owner-approved behaviours plus the two anonymous refusals of the member-gated talent archive files/.test(claude));
}

// Round 3 (13 Nov 2026), misc item 4 (CL2-233): the integration documents about Daniel's Olympus Guild addon name the
// current author release and state the activation limits as a table: what is off now, what must be true before it is
// switched on, and who switches it. The release number is Codex's record of the author release ZIP (12 Nov 2026); the
// site's own minimum stays 1.5.7 in resources169.json. Each document must cover the switches that concern it.
const CURRENT_AUTHOR_RELEASE = '1.5.8';
const INTEGRATION_DOCS = {
  'docs/dan155-integration.md': ['ARMY_SITE_AGGREGATE_ENABLED', 'site-feed-v1', 'LINK_ENABLED', 'QueueSelf', '/olv census on'],
  'docs/addon-guild-roster-integration.md': ['/olv olympus on', '/olv census on', 'QueueSelf'],
  'docs/unified-addon196.md': ['ARMY_SITE_AGGREGATE_ENABLED', 'site-feed-v1'],
  'docs/army-qr-publishing.md': ['ARMY_SITE_AGGREGATE_ENABLED', 'site-feed-v1'],
  'docs/olympus-link.md': ['LINK_ENABLED'],
  'docs/launch229-addon-audit.md': ['LINK_ENABLED'],
};
function integration() {
  for (const [file, switches] of Object.entries(INTEGRATION_DOCS)) {
    const text = read(file), lines = text.split('\n');
    const start = lines.findIndex(l => /Current (?:author release|status) \(12 November 2026\)/.test(l));
    const header = lines.findIndex((l, i) => i > start && start >= 0 && l === '| Off now | Before it is switched on | Who switches it |');
    const rows = [];
    for (let i = header + 2; header > 0 && i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i].split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim()));
    const intro = start >= 0 ? lines.slice(start, header > 0 ? header : start + 1).join('\n') : '';
    const named = new RegExp('Olympus Guild ' + CURRENT_AUTHOR_RELEASE.replace(/\./g, '\\.') + '\\b').test(intro);
    const complete = rows.length > 0 && rows.every(r => r.length === 3 && r.every(c => c.length > 10) && /\bowner\b|\bofficer\b/i.test(r[2]));
    const covered = switches.filter(s => !rows.some(r => r[0].includes(s)));
    check('CL2-233 ' + file + ' names Olympus Guild ' + CURRENT_AUTHOR_RELEASE + ' and states what is off, what must be true first and who switches it' + (covered.length ? ' (missing ' + covered.join(', ') + ')' : ''),
      start >= 0 && start < 12 && named && complete && covered.length === 0 && header > 0);
  }
  const main = read('docs/dan155-integration.md');
  check('CL2-233 the integration record dates the 1.5.5 text as a record and keeps 1.5.7 and 1.5.8 unqualified',
    /## Record of 10 November 2026 \(Olympus 1\.5\.5\)/.test(main) && /Verify has not qualified 1\.5\.7 or 1\.5\.8/.test(main) && main.indexOf('## Current status') < main.indexOf('## Record of 10 November 2026'));
}

(async () => {
  await budget(); ci(); docs(); await routes(); integration();
  console.log(`\n${passed}/${passed + failed} docs-gate checks passed`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
