'use strict';
// Focused fixtures use real candidate blobs; corruptions exist only in memory or a private disposable Git repo.
const cp = require('node:child_process'), crypto = require('node:crypto'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { loadSnapshot, verify, pushCandidates } = require('../check-projections.cjs');
const root = path.resolve(__dirname, '../..'), base = loadSnapshot(root), hash = b => crypto.createHash('sha256').update(b).digest('hex');
let passed = 0, failed = 0;
function check(label, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + label); ok ? passed++ : failed++; }
function rejects(label, fn, pattern) { try { fn(); check(label, false); } catch (e) { check(label, pattern.test(e.message)); } }
function changed(file, edit) { return new Map([[file, Buffer.from(edit(base.get(file).toString('utf8')))]]); }
function fixture(changes = new Map(), repin = false) {
  const bytes = new Map(changes), get = p => bytes.has(p) ? bytes.get(p) : base.get(p);
  if (repin) {
    // Keep upstream byte pins internally consistent to reach the independent downstream projection assertions.
    const refPath = 'scripts/official_asset_reference.json', ref = JSON.parse(get(refPath));
    for (const row of [...ref.assets, ...ref.fixed_art_source_pins, ref.approved_extractor]) if (bytes.has(row.path)) {
      row.bytes = get(row.path).length; row.sha256 = hash(get(row.path));
    }
    bytes.set(refPath, Buffer.from(JSON.stringify(ref)));
    bytes.set('scripts/official_assets.py', Buffer.from(get('scripts/official_assets.py').toString().replace(/^REFERENCE_SHA256='[a-f0-9]{64}'/m, "REFERENCE_SHA256='" + hash(get(refPath)) + "'")));
    let reconciliation = get('scripts/reconcile_public_root.py').toString();
    for (const file of ['official_assets.py', 'official_asset_reference.json']) reconciliation = reconciliation.replace(new RegExp("'" + file.replace(/\./g, '\\.') + "':'[a-f0-9]{64}'"), "'" + file + "':'" + hash(get('scripts/' + file)) + "'");
    bytes.set('scripts/reconcile_public_root.py', Buffer.from(reconciliation));
  }
  return { ...base, get };
}
check('real staged projection graph passes', verify(base).result === 'PASS');
rejects('asset bytes are not silently refreshed', () => verify(fixture(changed('worker/public/static/app.css', s => s + '\n'))), /byte pin drift/);
rejects('fixed source byte drift is refused', () => verify(fixture(changed('worker/src/site-data.ts', s => s + '\n'))), /byte pin drift/);
rejects('extractor byte drift is refused', () => verify(fixture(changed('tools/build-site-assets.py', s => s + '\n'))), /byte pin drift/);
rejects('finite talent art producer drift is refused', () => verify(fixture(changed('tools/build-talent-art.py', s => s + '\n'))), /byte pin drift/);
rejects('talent art map byte drift is refused', () => verify(fixture(changed('worker/public/static/talents/art.json', s => s + '\n'))), /byte pin drift/);
rejects('talent art provenance byte drift is refused', () => verify(fixture(changed('worker/public/static/talents/art-provenance.json', s => s + '\n'))), /byte pin drift/);
rejects('reference hash drift is refused', () => verify(fixture(changed('scripts/official_asset_reference.json', s => s + '\n'))), /reference digest drift/);
rejects('V4 helper byte drift is refused', () => verify(fixture(changed('scripts/public_history.py', s => s + '\n'))), /V4 helper digest drift/);
rejects('network guard byte drift is refused', () => verify(fixture(changed('scripts/pages_network_guard.cjs', s => s + '\n'))), /network guard digest drift/);
rejects('required documentation is not optional', () => verify(fixture(new Map([['README.md', Buffer.alloc(0)]]))), /required document/);
rejects('governance reader hash is independently bound', () => verify(fixture(changed('worker/public/static/app.js', s => s.replace(/const GOVERNANCE_SHA256 = "[a-f0-9]{64}"/, 'const GOVERNANCE_SHA256 = "' + '0'.repeat(64) + '"')), true)), /governance reader digest/);
rejects('both governance size guards remain required', () => verify(fixture(changed('worker/public/static/app.js', s => s.replace(/data.book.bytes !== \d+/, 'data.book.bytes !== 1')), true)), /both governance reader sizes/);
rejects('policy mirror drift is refused', () => verify(fixture(changed('privacy.html', s => s + '\n'))), /policy root mirror drift/);
rejects('generated policy body drift is refused', () => verify(fixture(changed('worker/src/policy-content.ts', s => s.replace('<h1>Olympus Verify</h1>', '<h1>Changed</h1>')))), /generated policy body drift/);
rejects('generated policy source digest drift is refused', () => verify(fixture(changed('worker/src/policy-content.ts', s => s.replace(/POLICY_SOURCE_DIGEST = "[a-f0-9]{64}"/, 'POLICY_SOURCE_DIGEST = "' + '0'.repeat(64) + '"')))), /policy source digest drift/);
const runtimeBuild = base.get('worker/src/index.ts').toString('utf8').match(/^const BUILD = "([^"]+)";/m);
if (!runtimeBuild) throw new Error('runtime BUILD declaration required for health pin fixture');
const hostPinFile = 'worker/tests/hosts_test.cjs', hostSource = base.get(hostPinFile).toString('utf8');
const hostPin = JSON.stringify(runtimeBuild[1]), stalePin = '"stale-build"';
if (hostSource.split(hostPin).length !== 2) throw new Error('exactly one current runtime BUILD host literal required');
const staleHost = changed(hostPinFile, s => s.replace(hostPin, stalePin)), staleHostSource = staleHost.get(hostPinFile).toString('utf8');
check('health BUILD negative fixture changes exactly one current host literal', staleHostSource !== hostSource && !staleHostSource.includes(hostPin) && staleHostSource.split(stalePin).length === 2 && staleHostSource.replace(stalePin, hostPin) === hostSource);
rejects('health BUILD pins bind actual runtime BUILD', () => verify(fixture(staleHost)), /runtime health BUILD pin/);
check('newer CI-only docs do not require a runtime bump', verify(fixture(changed('docs/deploy-checklist.md', s => s + '\n## Worker .999 — CI-only history\n'))).result === 'PASS');
const one = '1'.repeat(40), two = '2'.repeat(40), zero = '0'.repeat(40);
check('pre-push uses actual local SHA and deduplicates', JSON.stringify(pushCandidates('refs/heads/a ' + one + ' refs/heads/a ' + two + '\nrefs/heads/b ' + one + ' refs/heads/b ' + zero + '\n')) === JSON.stringify([one]));
check('remote ref deletion has no candidate', pushCandidates('(delete) ' + zero + ' refs/heads/a ' + one + '\n').length === 0);
rejects('malformed hook input does not fall back to HEAD', () => pushCandidates('refs/heads/a HEAD refs/heads/a ' + zero), /invalid pre-push input/);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-projections-'));
function git(args, input) { return cp.execFileSync('git', args, { cwd: temp, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
try {
  git(['init', '-q']);
  fs.mkdirSync(path.join(temp, 'scripts')); fs.writeFileSync(path.join(temp, 'scripts', 'selected.txt'), 'committed\n');
  git(['add', 'scripts/selected.txt']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  const first = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(temp, 'scripts', 'selected.txt'), 'staged\n'); git(['add', 'scripts/selected.txt']);
  fs.writeFileSync(path.join(temp, 'scripts', 'selected.txt'), 'unstaged\n');
  const indexBefore = fs.readFileSync(path.join(temp, '.git', 'index'));
  check('index reader uses staged bytes rather than worktree or HEAD', loadSnapshot(temp).get('scripts/selected.txt').toString() === 'staged\n');
  check('revision reader uses outgoing commit even when index differs', loadSnapshot(temp, first).get('scripts/selected.txt').toString() === 'committed\n');
  check('reading snapshots does not update the index or working file', indexBefore.equals(fs.readFileSync(path.join(temp, '.git', 'index'))) && fs.readFileSync(path.join(temp, 'scripts', 'selected.txt'), 'utf8') === 'unstaged\n');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('\n' + passed + '/' + (passed + failed) + ' passed');
if (failed) process.exitCode = 1;
