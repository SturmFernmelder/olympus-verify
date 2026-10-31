'use strict';
// CI scheduling contracts only: no original Worker suite is executed by this test.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const runner = require('../../worker/scripts/ci-shards.cjs');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'worker/package.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'worker/scripts/ci-worker-baseline.json'), 'utf8'));
const entryCensus = require('../test-entry-census.cjs');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').replace(/\r\n/g, '\n');
let passed = 0, total = 0;
function check(label, value) { total++; if (value) passed++; console.log((value ? 'PASS ' : 'FAIL ') + label); }
function rejects(fn) { try { fn(); return false; } catch { return true; } }
const turn = () => new Promise(resolve => setImmediate(resolve));
function job(name) {
  const start = workflow.indexOf('\n  ' + name + ':\n');
  if (start < 0) throw Error('Missing workflow job ' + name);
  return workflow.slice(start + 1).split(/\n(?=  [a-z_]+:\n)/)[0];
}

async function main() {
  const censusResult = entryCensus.audit(root);
  check('every current Worker entry/helper/manual/native/stopped file and declared Lua suite has a source disposition', censusResult.worker.length > 200 && censusResult.lua.length >= 18);
  check('census inventories source without claiming runtime coverage', censusResult.scope.includes('no execution') && censusResult.qualification.includes('No source-only'));
  check('an unclassified new file cannot be hidden by green aliases', rejects(() => entryCensus.classify(['worker/tests/new_test.cjs'], [], [], [])));
  const exception = {path:'worker/tests/manual_test.cjs',kind:'manual',owner:'synthetic owner',reason:'separate gate',evidence:'source only',sha256:'a'.repeat(64)};
  check('an explicitly owned manual gate remains manual', entryCensus.classify([exception.path], [], [], [exception])[0].kind === 'manual');
  check('duplicate or stale exemptions are refused', rejects(() => entryCensus.classify([exception.path], [], [], [exception,exception])) && rejects(() => entryCensus.classify([exception.path], [exception.path], [], [exception])));
  check('missing owner and unsafe traversal cannot become an exception', rejects(() => entryCensus.classify([exception.path], [], [], [{...exception,owner:''}])) && rejects(() => entryCensus.classify(['../private'], [], [], [])));
  check('source-reachable helper is distinguished from direct entry', entryCensus.classify(['worker/tests/a.cjs','worker/tests/b.cjs'], ['worker/tests/a.cjs'], ['worker/tests/b.cjs'], []).map(r=>r.kind).join(',') === 'entry,source-reachable');
  check('Node profile is pinned to the reviewed24.22.1 release', fs.readFileSync(path.join(root,'.nvmrc'),'utf8').trim() === '24.22.1' && job('worker_shard').includes('node-version-file: .nvmrc'));
  const commands = runner.expandScripts(pkg.scripts);
  let originalIndex = 0;
  for (const command of commands) if (command === baseline.commands[originalIndex]) originalIndex++;
  check('all 148 original command occurrences remain an ordered subsequence when future leaves are added', baseline.commands.length === 148 && originalIndex === baseline.commands.length);
  check('the original repeated QR occurrence remains retained alongside future additions', baseline.commands.filter(c => c === 'node tests/qr_browser_test.cjs').length === 2 && new Set(baseline.commands).size === 147 && commands.filter(c => c === 'node tests/qr_browser_test.cjs').length >= 2);
  check('the full original command multiset satisfies its baseline', runner.assertCoverage(commands, baseline) === true);
  check('omitting an original command is refused', rejects(() => runner.assertCoverage(baseline.commands.slice(1), baseline)));
  const duplicate = baseline.commands.indexOf('node tests/qr_browser_test.cjs');
  check('omitting only the repeated original occurrence is also refused', rejects(() => runner.assertCoverage(baseline.commands.filter((_, i) => i !== duplicate), baseline)));
  check('an unexpected baseline shard count is refused', rejects(() => runner.assertCoverage(commands, { ...baseline, shards: 7 })));
  check('recursive and missing npm aliases are refused', rejects(() => runner.expandScripts({ a: 'npm run b', b: 'npm run a' }, 'a')) && rejects(() => runner.expandScripts({}, 'missing')));

  const weights = { 'node tests/frontend_check.cjs': 120, 'roster_effects_test.cjs': { seconds: 90 } };
  const plan = runner.buildPlan(pkg, weights), tasks = plan.flat();
  check('exactly eight nonempty shards are produced', plan.length === 8 && plan.every(s => s.length > 0));
  check('each current occurrence has one unique task identity, including future additions', tasks.length === commands.length && new Set(tasks.map(t => t.id)).size === commands.length);
  check('the partition reconstructs every current command including original duplicates', JSON.stringify([...tasks].sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6))).map(t => t.command)) === JSON.stringify(commands));
  check('weighted scheduling is deterministic for the same input', JSON.stringify(plan) === JSON.stringify(runner.buildPlan(pkg, weights)));
  check('reviewed heavy tasks retain their separate fixed shards', plan[0].some(t => t.command.endsWith('/full_release_roles_identity_test.cjs')) && plan[1].some(t => t.command.endsWith('/privacy_account_coverage_test.cjs')) && plan[2].some(t => t.command.endsWith('/frontend_check.cjs')) && plan[3].some(t => t.command.endsWith('/bundle_runtime_test.cjs')));
  check('observed weights are consumed without changing commands', tasks.find(t => t.command.endsWith('/frontend_check.cjs')).weight === 120 && tasks.find(t => t.command.endsWith('/roster_effects_test.cjs')).weight === 90);
  check('Workerd and both internally partitioned worlds are exclusive outer tasks', ['bundle_runtime_test.cjs', 'roster_effects_test.cjs', 'privacy_admission_job_census_experiment_test.cjs'].every(file => tasks.find(t => t.command.endsWith('/' + file)).exclusive === true));
  check('the original node and TypeScript commands use literal argv without a shell', runner.invocation('node --check public/static/app.js').file === process.execPath && JSON.stringify(runner.invocation('node --check public/static/app.js').args) === '["--check","public/static/app.js"]' && runner.invocation('tsc --noEmit').args.at(-1) === '--noEmit');
  check('unsupported executables and quoted/shell syntax are refused', ['bash script.sh', 'node "file.cjs"', 'node file.cjs; echo bad', 'node file.cjs | cat', 'node $FILE', 'node `file`', 'node file.cjs\nnode other.cjs'].every(command => rejects(() => runner.invocation(command))));
  check('only exact success passes the shard collector', runner.requireShardResult('success') === true && ['failure', 'cancelled', 'skipped', '', undefined, null, 'Success', 'in_progress'].every(result => rejects(() => runner.requireShardResult(result))));

  let active = 0, peak = 0;
  const seen = [];
  const bounded = await runner.runPool(Array.from({ length: 7 }, (_, i) => ({ id: 'bound-' + i })), { concurrency: 2, runTask: async task => {
    active++; peak = Math.max(peak, active); seen.push(task.id); await turn(); active--; return { status: 'success' };
  } });
  check('the pool exercises but never exceeds the requested concurrency', bounded.success && peak === 2 && active === 0 && seen.length === 7 && new Set(seen).size === 7);
  const live = new Set(), violations = [];
  const exclusiveTasks = [{ id: 'a' }, { id: 'b' }, { id: 'solo', exclusive: true }, { id: 'c' }, { id: 'solo-again', exclusive: true }, { id: 'd' }];
  const isolated = await runner.runPool(exclusiveTasks, { concurrency: 3, runTask: async task => {
    if ((task.exclusive && live.size) || [...live].some(x => x.exclusive)) violations.push(task.id);
    live.add(task); await turn(); live.delete(task); return { status: 'success' };
  } });
  check('exclusive tasks drain the active pool and run alone', isolated.success && violations.length === 0 && live.size === 0 && isolated.results.length === exclusiveTasks.length);
  const attempted = [];
  const failed = await runner.runPool([{ id: 'throws' }, { id: 'after-one' }, { id: 'after-two' }], { concurrency: 1, runTask: async task => {
    attempted.push(task.id); if (task.id === 'throws') throw Error('synthetic task failure'); return { status: 'success' };
  } });
  check('one thrown failure cannot hide or skip any later assigned task', !failed.success && attempted.join(',') === 'throws,after-one,after-two' && failed.results.length === 3 && failed.results.find(r => r.id === 'throws').status === 'failure');
  for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
    const r = await runner.runPool([{ id: 'bad' }, { id: 'later' }], { concurrency: 1, runTask: async task => task.id === 'bad' ? { status } : { status: 'success' } });
    check('task result ' + String(status) + ' fails while later tasks still complete', !r.success && r.results.length === 2 && r.results.find(x => x.id === 'later').status === 'success');
  }
  const abort = new AbortController(), started = [];
  const cancelled = await runner.runPool([{ id: 'started' }, { id: 'queued-one' }, { id: 'queued-two' }], { concurrency: 1, signal: abort.signal, runTask: async task => {
    started.push(task.id); abort.abort(); return { status: 'success' };
  } });
  check('cancellation accounts for queued work as cancelled and cannot pass', !cancelled.success && started.join(',') === 'started' && cancelled.results.filter(r => r.status === 'cancelled').length === 2 && cancelled.results.length === 3);
  await assert.rejects(runner.runPool([{ id: 'same' }, { id: 'same' }], { concurrency: 1, runTask: async () => ({ status: 'success' }) }));
  check('duplicate task identities are rejected before execution', true);
  await assert.rejects(runner.runPool([], { concurrency: 0, runTask: async () => ({ status: 'success' }) }));
  check('an invalid concurrency limit is rejected', true);

  const shardJob = job('worker_shard'), collector = job('worker'), final = job('check');
  const concurrency = /\nconcurrency:\n([\s\S]*?)\n(?=\S)/.exec(workflow)?.[1] || '';
  // Parse the actual supported selector shape; do not simulate GitHub's queue or evaluate arbitrary workflow code.
  const uniqueNonPr = /^  group: review-\$\{\{\s*github\.event_name == 'pull_request' && github\.ref \|\| github\.run_id\s*\}\}$/m.test(concurrency);
  const selectedGroup = (event, ref, runId) => uniqueNonPr ? 'review-' + (event === 'pull_request' ? ref : runId) : null;
  check('each non-PR run has its own group, so a newer pending main run cannot replace it', uniqueNonPr
    && ['push', 'workflow_dispatch', 'pull_request_target'].every(event => selectedGroup(event, 'refs/heads/main', 101) !== selectedGroup(event, 'refs/heads/main', 102)));
  check('runs of the same PR share one group and distinct PRs keep separate groups', uniqueNonPr
    && selectedGroup('pull_request', 'refs/pull/1/merge', 101) === selectedGroup('pull_request', 'refs/pull/1/merge', 102)
    && selectedGroup('pull_request', 'refs/pull/1/merge', 101) !== selectedGroup('pull_request', 'refs/pull/2/merge', 101));
  check('only pull-request runs cancel their in-progress predecessor', /^  cancel-in-progress: \$\{\{\s*github\.event_name == 'pull_request'\s*\}\}$/m.test(concurrency));
  check('the addon job retains the missing-declared-suite contract before every Lua suite', job('addon').includes('run: python3 addon/tests/test_lua_runner.py')
    && job('addon').indexOf('run: python3 addon/tests/test_lua_runner.py') < job('addon').indexOf('run: python3 addon/tests/run_lua_suites.py'));
  const matrix = /\n        shard: (\[[^\n]+\])/.exec(shardJob);
  check('the workflow schedules every required matrix value 1 through 8', !!matrix && JSON.stringify(JSON.parse(matrix[1])) === '[1,2,3,4,5,6,7,8]');
  check('matrix fail-fast remains false without continue-on-error', /\n      fail-fast: false\n/.test(shardJob) && !/continue-on-error:\s*true/.test(workflow));
  check('the matrix invokes the real shard runner with its own matrix value', shardJob.includes('run: node scripts/ci-shards.cjs --shard ${{ matrix.shard }}') && shardJob.includes('working-directory: worker'));
  check('compiler annotation matchers stop before original raw suite output begins', shardJob.includes("::remove-matcher owner=tsc::") && shardJob.includes("::remove-matcher owner=eslint-compact::") && shardJob.indexOf('::remove-matcher owner=tsc::') < shardJob.indexOf('run: node scripts/ci-shards.cjs --shard'));
  check('the worker status is an always-run collector depending on the whole matrix', /\n    name: worker\n/.test(collector) && /\n    if: always\(\)\n/.test(collector) && /\n    needs: \[worker_shard\]\n/.test(collector));
  check('the collector consumes the actual matrix result through the exact-success gate', collector.includes('WORKER_SHARDS: ${{ needs.worker_shard.result }}') && collector.includes("requireShardResult(process.env.WORKER_SHARDS)"));
  check('the final check always requires addon, watcher and worker', /\n    if: always\(\)\n/.test(final) && /\n    needs: \[addon, watcher, worker\]\n/.test(final) && final.includes('run: bash scripts/ci-gate.sh') && ['WORKER', 'WATCHER', 'ADDON'].every(name => final.includes(name + ': ${{ needs.' + name.toLowerCase() + '.result }}')));
  check('the original 90-minute job and three-minute census limits remain', /\n    timeout-minutes: 90\n/.test(shardJob) && /name: Actual pinned census Bridge to Lua JSON to strict server\n        if: matrix.shard == 8\n        timeout-minutes: 3\n/.test(shardJob));
  check('census and dry-run packaging remain assigned once to shard8', shardJob.includes('python3 -E -P addon/tests/run_census_consumer.py --fetch-upstream') && shardJob.includes('python3 -E -P addon/tests/run_census_server_chain.py --lua-receipt') && /name: Package the Worker without deploying\n        if: matrix.shard == 8\n/.test(shardJob));
  check('the focused contract and original auxiliary contracts run once on shard7', /name: Deploy and publication contracts and CI scheduling regressions\n        if: matrix.shard == 7\n/.test(shardJob) && ['deploy-commit.test.sh', 'ci-gate.test.sh', 'cutover-config.test.sh', 'publication-helper.test.sh'].every(file => shardJob.includes('bash scripts/tests/' + file)) && (workflow.match(/node scripts\/tests\/ci-workflow\.test\.cjs/g) || []).length === 1);
  const roster = fs.readFileSync(path.join(root, 'worker/tests/roster_effects_test.cjs'), 'utf8');
  const rosterGroups = /const CI_ROSTER_GROUPS = Object\.freeze\(\[([^]*?)\]\.map\(Object\.freeze\)\)/.exec(roster)?.[1] || '';
  const counts = [...rosterGroups.matchAll(/expectedChecks:\s*(\d+)/g)].map(m => Number(m[1]));
  check('the six independent roster worlds retain their original 100-check partition', JSON.stringify(counts) === '[13,5,51,4,4,23]' && counts.reduce((n, x) => n + x, 0) === 100 && roster.includes('selectedRosterGroup === undefined ? 100 : CI_ROSTER_GROUPS'));
  // Resolve real JS bindings rather than accepting a matching spelling in another function's local scope.
  const ts = require(path.join(root, 'worker/node_modules/typescript'));
  const rosterFile = path.join(root, 'worker/tests/roster_effects_test.cjs');
  const program = ts.createProgram([rosterFile], { allowJs: true, noResolve: true, noLib: true, noEmit: true, module: ts.ModuleKind.CommonJS });
  const rosterAst = program.getSourceFile(rosterFile), checker = program.getTypeChecker();
  const debtIdentifiers = [], debtDeclarations = [], wholeWorlds = [];
  const wholeWorldNames = ['constantsFull', 'noticeDebt', 'faultsAndFences', 'manualSync', 'manualNoticeDebt', 'identity'];
  function inspectBinding(node) {
    if (ts.isIdentifier(node) && node.text === 'debtIterations') {
      debtIdentifiers.push(node);
      if (ts.isVariableDeclaration(node.parent) && node.parent.name === node) debtDeclarations.push(node.parent);
    }
    if (ts.isFunctionDeclaration(node) && wholeWorldNames.includes(node.name?.text)) wholeWorlds.push(node);
    ts.forEachChild(node, inspectBinding);
  }
  inspectBinding(rosterAst);
  function containingFunction(node) { for (let p = node.parent; p; p = p.parent) if (ts.isFunctionDeclaration(p)) return p.name?.text; return null; }
  const sharedDebt = debtDeclarations[0], sharedSymbol = sharedDebt && checker.getSymbolAtLocation(sharedDebt.name);
  check('the original notice loop and later diagnostic resolve every debtIterations reference to one shared outer binding', debtDeclarations.length === 1 && !!sharedSymbol && wholeWorlds.length === 6 && wholeWorlds.every(fn => fn.parent === sharedDebt.parent.parent.parent && sharedDebt.getStart(rosterAst) < fn.getStart(rosterAst)) && debtIdentifiers.every(id => checker.getSymbolAtLocation(id) === sharedSymbol) && debtIdentifiers.some(id => containingFunction(id) === 'noticeDebt' && ts.isPostfixUnaryExpression(id.parent)) && debtIdentifiers.filter(id => containingFunction(id) === 'faultsAndFences').length >= 2);
  const entryStates = [...rosterGroups.matchAll(/\{ id: '([^']+)', expectedChecks: (\d+), entryClock: (\d+), entryInteractionSequence: (\d+), entryFaultObservation: (true|false) \}/g)]
    .map(([, id, , clock, interaction, observer]) => [id, Number(clock), Number(interaction), observer === 'true']);
  check('isolated roster entry metadata preserves the original clock, interaction sequence and fault observer', JSON.stringify(entryStates) === JSON.stringify([
    ['constants-full', 1791001234, 0, false], ['notice-debt', 1791007414, 0, false], ['faults-and-fences', 1791015274, 0, false],
    ['manual-sync', 1791016476, 0, true], ['manual-notice-debt', 1791020796, 72, true], ['identity', 1791026256, 163, true],
  ]));
  check('only pristine selected roster children restore entry state while ordinary groups retain drift guards', /if \(selectedRosterGroup !== undefined\) \{\s*if \(db !== undefined \|\| doDb !== undefined \|\| installed \|\| readyPromise !== null\)[^]*?T = recorded\.entryClock;[^]*?iid = recorded\.entryInteractionSequence;\s*observeOriginalFaultHTTP = recorded\.entryFaultObservation;[^]*?selectedEntryState = \{ clock: T, interactionSequence: iid, faultObservation: observeOriginalFaultHTTP \};\s*\}/.test(roster) && roster.includes('if (T !== recorded.entryClock) throw Error') && roster.includes('if (iid !== recorded.entryInteractionSequence || observeOriginalFaultHTTP !== recorded.entryFaultObservation) throw Error') && roster.includes('payload: { entryState: selectedEntryState, exitClock: T, exitInteractionSequence: iid }'));
  const census = fs.readFileSync(path.join(root, 'worker/tests/privacy_admission_job_census_experiment_test.cjs'), 'utf8');
  check('all four census worlds must succeed before the separate exact-union join', census.includes("groups:['1','2','3','4']") && census.includes('if(!result.success)return;') && census.includes("groups:['join']") && census.includes('OLYMPUS_CI_CENSUS_JOIN_FILE:file') && census.includes('rows.length===153&&expected.length===153') && census.includes("throw Error('Duplicate original census cell')") && census.includes('reports.length===153') && census.includes("length===147") && census.includes("protocolAssert('declared joined700 fits700'") && census.includes("protocolAssert('measured current joined attempted per-job maxima fit700'"));
  const censusParent = census.slice(0, census.indexOf('const {compileProtocolFixture}'));
  check('one original last-16UTC startup sample is forwarded to all census worlds and their join', (censusParent.match(/Date\.now\(\)/g) || []).length === 1 && censusParent.includes('const sampledNow=Math.floor(Date.now()/1000),day=86400;let clock=Math.floor(sampledNow/day)*day+16*3600;if(clock>sampledNow)clock-=day;') && censusParent.includes('const sharedEnv={OLYMPUS_CI_CENSUS_CLOCK:String(clock)};') && censusParent.includes("childEnvKey:'OLYMPUS_CI_CENSUS_GROUP',extraEnv:sharedEnv") && censusParent.includes('extraEnv:{...sharedEnv,OLYMPUS_CI_CENSUS_JOIN_FILE:file}') && censusParent.includes("if(result.results.some(row=>row.receipt.payload.clock!==clock))throw Error('Census child baseline clocks differ')"));
  const censusChild = census.slice(census.indexOf('const ciGroup=process.env.OLYMPUS_CI_CENSUS_GROUP'));
  check('census children validate the shared clock before fixture initialization and report that same baseline', censusChild.includes('const clock=Number(process.env.OLYMPUS_CI_CENSUS_CLOCK),now=realNow();') && censusChild.includes("if(!Number.isSafeInteger(clock)||clock%DAY!==16*H||clock>now||clock<now-DAY-90*60||db||native||installed||readyPromise)throw Error('Invalid shared original census clock')") && censusChild.indexOf('T=clock;') >= 0 && censusChild.indexOf('T=clock;') < censusChild.indexOf('protocolInventory();') && censusChild.includes('payload:{clock:T,cells:reports.map'));
  const day = 86400, boundary = 48 * day + 16 * 3600, startup = boundary - 1;
  let sharedClock = Math.floor(startup / day) * day + 16 * 3600;
  if (sharedClock > startup) sharedClock -= day;
  const clockEligible = now => sharedClock <= now && sharedClock >= now - day - 90 * 60;
  check('a pool begun before 16UTC keeps its original sample across 16UTC within the reviewed age bound', sharedClock === boundary - day && clockEligible(startup) && clockEligible(boundary + 89 * 60) && clockEligible(boundary + 90 * 60) && !clockEligible(boundary + 90 * 60 + 1));

  // Only these newly written tiny fixtures receive hosted-CI opt-in. They never import an application suite.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-ci-contract-'));
  const poolModule = path.join(root, 'worker/scripts/ci-case-pool.cjs'), child = path.join(temporary, 'case-child.cjs'), parent = path.join(temporary, 'case-parent.cjs');
  fs.writeFileSync(child, `const fs=require('node:fs');\nconst {writeCaseResult}=require(${JSON.stringify(poolModule)});\nconst group=process.env.OLYMPUS_CI_ROSTER_GROUP;\nif(group==='missing')process.exit(0);\nif(group==='wrong-group'){fs.writeFileSync(process.env.OLYMPUS_CI_CASE_RESULT,JSON.stringify({group:'another-group',ok:2,n:2}));process.exit(0);}\nconst n=group==='pass-two'?3:2;\nwriteCaseResult({group,ok:n,n,payload:{evidence:process.env.PRIVACY_ADMISSION_OUTPUT_DIR}});\nif(group==='nonzero')process.exitCode=7;\n`);
  fs.writeFileSync(parent, `const {runCasePool}=require(${JSON.stringify(poolModule)});\n(async()=>{const r=await runCasePool({file:${JSON.stringify(child)},groups:JSON.parse(process.env.SYNTHETIC_GROUPS),childEnvKey:'OLYMPUS_CI_ROSTER_GROUP'});console.log('SYNTHETIC_POOL_RESULT '+JSON.stringify(r));})().catch(e=>{console.error(e.message);process.exitCode=1;});\n`);
  function casePool(groups, hosted = true) {
    const env = { ...process.env, GITHUB_ACTIONS: hosted ? 'true' : 'false', OLYMPUS_CI_CASE_POOL: '1', SYNTHETIC_GROUPS: JSON.stringify(groups) };
    delete env.OLYMPUS_CI_CASE_RESULT; delete env.OLYMPUS_CI_EXPECTED_CHECKS; delete env.OLYMPUS_CI_ROSTER_GROUP;
    const run = cp.spawnSync(process.execPath, [parent], { env, shell: false, windowsHide: true, encoding: 'utf8' });
    const line = run.stdout?.split(/\r?\n/).find(s => s.startsWith('SYNTHETIC_POOL_RESULT '));
    const result = line ? JSON.parse(line.slice('SYNTHETIC_POOL_RESULT '.length)) : null;
    return { ...run, result };
  }
  const complete = casePool([{ id: 'pass-one', expectedChecks: 2 }, { id: 'pass-two', expectedChecks: 3 }]);
  check('the actual case pool passes only completed child receipts with exact expected checks', complete.status === 0 && complete.result?.success && complete.result.results.length === 2 && complete.result.results.every(r => r.receipt.ok === r.receipt.n));
  check('case worlds receive separate receipt, log and evidence directories', complete.result && new Set(complete.result.results.map(r => r.resultFile)).size === 2 && new Set(complete.result.results.map(r => r.log)).size === 2 && new Set(complete.result.results.map(r => r.receipt.payload.evidence)).size === 2 && complete.result.concurrency >= 1 && complete.result.concurrency <= 4);
  const missing = casePool([{ id: 'missing', expectedChecks: 2 }, { id: 'pass-one', expectedChecks: 2 }]);
  check('a zero-exit child with no receipt fails while its independent peer finishes', missing.status !== 0 && missing.result?.success === false && missing.result.results.find(r => r.id === 'missing').status === 'failure' && missing.result.results.find(r => r.id === 'pass-one').status === 'success');
  const wrongCount = casePool([{ id: 'wrong-count', expectedChecks: 3 }]);
  check('a child cannot substitute a smaller passing check count', wrongCount.status !== 0 && wrongCount.result?.success === false && wrongCount.result.results[0].status === 'failure');
  const wrongGroup = casePool([{ id: 'wrong-group', expectedChecks: 2 }]);
  check('a receipt for another case identity is refused', wrongGroup.status !== 0 && wrongGroup.result?.success === false && wrongGroup.result.results[0].status === 'failure');
  const nonzero = casePool([{ id: 'nonzero', expectedChecks: 2 }]);
  check('a nonzero child exit fails even after a complete receipt was written', nonzero.status === 1 && nonzero.result?.success === false && nonzero.result.results[0].exitCode === 7 && nonzero.result.results[0].receipt.n === 2);
  const local = casePool([{ id: 'pass-one', expectedChecks: 2 }], false);
  check('case pool execution refuses non-hosted opt-in before any child result', local.status !== 0 && local.result === null && local.stderr.includes('hosted-CI opt-in only') && !local.stdout.includes('CI_CASE_RESULT'));
  console.log('Synthetic child fixture evidence: ' + temporary);
  console.log(`\n${passed}/${total} CI workflow checks passed`);
  if (passed !== total) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
