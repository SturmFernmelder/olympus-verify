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
    for (const row of [...ref.assets, ...ref.required_public_resources, ...ref.fixed_art_source_pins, ref.approved_extractor]) if (bytes.has(row.path)) {
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
for (const replacement of ['build: ".219", date: "2026-10-30"', 'build: ".218", date: "2026-10-29"']) {
  rejects('current release note cannot drift from runtime build/date: ' + replacement, () => verify(fixture(changed('worker/src/site-news.ts', s => s.replace('build: ".218", date: "2026-10-30"', replacement)))), /current release note exactly matches runtime BUILD/);
}
const council218 = 'worker/public/static/governance/council-composition-master218.md';
rejects('Master218 Cabinet document byte drift is refused', () => verify(fixture(changed(council218, s => s + '\n'))), /byte pin drift/);
rejects('Master218 Cabinet document cannot become runtime code', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.runtime_paths.push(council218); return JSON.stringify(r); }), true)), /one exact non-art Master218 Council reference/);
for (const name of ['treasury-plan207.js','treasury-plan-content207.js','treasury-plan-model207.js','treasury-plan207.css']) {
  const file = 'worker/public/static/' + name;
  rejects('treasury207 resource byte drift is refused: ' + name, () => verify(fixture(changed(file, s => s + '\n'))), /byte pin drift/);
  rejects('treasury207 resource is mandatory runtime code: ' + name, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r=JSON.parse(s);r.runtime_paths=r.runtime_paths.filter(path=>path!==file);return JSON.stringify(r); }), true)), /four exact ordinary treasury207 planning resources/);
}
for (const name of ['guides218.js','guides218.css','guides218.json']) {
  const file = 'worker/public/static/' + name;
  rejects('guides218 resource byte drift is refused: ' + name, () => verify(fixture(changed(file, s => s + '\n'))), /byte pin drift/);
  if (!name.endsWith('.json')) rejects('guides218 resource is mandatory runtime code: ' + name, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r=JSON.parse(s);r.runtime_paths=r.runtime_paths.filter(path=>path!==file);return JSON.stringify(r); }), true)), /three exact ordinary guides218 resources/);
}
for (const file of ['worker/public/static/legal-view196.js', 'worker/public/static/approved-guild-helper196.js']) {
  rejects('master196 view byte drift is refused: ' + file, () => verify(fixture(changed(file, s => s + '\n'))), /byte pin drift/);
  rejects('master196 view is required runtime code: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r=JSON.parse(s); r.runtime_paths=r.runtime_paths.filter(path=>path!==file); return JSON.stringify(r); }), true)), /two exact non-art master196 view resources/);
}
rejects('asset bytes are not silently refreshed', () => verify(fixture(changed('worker/public/static/app.css', s => s + '\n'))), /byte pin drift/);
rejects('fixed source byte drift is refused', () => verify(fixture(changed('worker/src/site-data.ts', s => s + '\n'))), /byte pin drift/);
rejects('extractor byte drift is refused', () => verify(fixture(changed('tools/build-site-assets.py', s => s + '\n'))), /byte pin drift/);
rejects('finite talent art producer drift is refused', () => verify(fixture(changed('tools/build-talent-art.py', s => s + '\n'))), /byte pin drift/);
rejects('finite login media verifier drift is refused', () => verify(fixture(changed('tools/check-login-portal.py', s => s + '\n'))), /byte pin drift/);
rejects('login render provenance drift is refused', () => verify(fixture(changed('worker/public/static/wow/login/dark-portal-provenance.json', s => s + '\n'))), /byte pin drift/);
const loginVideo = 'worker/public/static/wow/login/dark-portal.webm';
rejects('login video bytes are not silently refreshed', () => verify(fixture(new Map([[loginVideo, Buffer.concat([base.get(loginVideo), Buffer.from([0])])]]))), /byte pin drift/);
const loginStill = 'worker/public/static/wow/login/olympus-dark-portal.png';
rejects('custom login still bytes are not silently refreshed', () => verify(fixture(new Map([[loginStill, Buffer.concat([base.get(loginStill), Buffer.from([0])])]]))), /byte pin drift/);
rejects('custom login still is never relabeled official', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.login_art_exception.classification = 'official_blizzard'; return JSON.stringify(r); }), true)), /nonofficial owner login art exception/);
rejects('custom login still tuple cannot move to another path', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.login_art_exception.asset.path = 'worker/public/static/wow/login/another.png'; return JSON.stringify(r); }), true)), /nonofficial owner login art exception/);
rejects('custom login still requires its one asset row', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.assets = r.assets.filter(row => row.path !== loginStill); return JSON.stringify(r); }), true)), /closed owner login art asset binding/);
const loginVariants = ['worker/public/static/wow/login/olympus-dark-portal-wide.png', 'worker/public/static/wow/login/olympus-dark-portal-portrait.png'];
for (const file of loginVariants) rejects('each current login variant byte drift is refused: ' + file, () => verify(fixture(new Map([[file, Buffer.concat([base.get(file), Buffer.from([0])])]]))), /byte pin drift/);
rejects('current login variants cannot be relabeled official', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.login_art_variants.classification = 'official_blizzard'; return JSON.stringify(r); }), true)), /nonofficial owner login art variants/);
rejects('current login variants require both exact paths', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.login_art_variants.assets[0].path = 'worker/public/static/wow/login/alias.png'; return JSON.stringify(r); }), true)), /nonofficial owner login art variants/);
rejects('current login variant reference digest cannot be repinned', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.login_art_variants.assets[1].sha256 = '0'.repeat(64); return JSON.stringify(r); }), true)), /nonofficial owner login art variants/);
rejects('current login variants do not allow a third variant', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.login_art_variants.assets.push({ ...r.login_art_variants.assets[0] }); return JSON.stringify(r); }), true)), /nonofficial owner login art variants/);
rejects('current login variants require two separate asset rows', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.assets = r.assets.filter(row => row.path !== loginVariants[0]); return JSON.stringify(r); }), true)), /two-variant512-asset571-public-path binding/);
for (const file of ['worker/public/static/talents/analysis.js', 'worker/public/static/talents/guide-builds179.js']) {
  rejects('talent comparison code byte drift is refused: ' + file, () => verify(fixture(changed(file, s => s + '\n'))), /byte pin drift/);
  rejects('talent comparison code cannot be relabeled official artwork: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.official_paths.push(file); return JSON.stringify(r); }), true)), /two-variant512-asset571-public-path binding/);
}
// .186 optional level-60 sheet: exact bytes, never artwork, never a native exception; only the script is runtime code.
for (const file of ['worker/public/static/talents/stats60.js', 'worker/public/static/talents/naked60-186.json', 'worker/public/static/talents/stat-effects186.json']) {
  rejects('level-60 sheet byte drift is refused: ' + file, () => verify(fixture(changed(file, s => s + '\n'))), /byte pin drift/);
  rejects('level-60 sheet resource cannot be relabeled official artwork: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.official_paths.push(file); return JSON.stringify(r); }), true)), /two-variant512-asset571-public-path binding/);
  rejects('level-60 sheet resource cannot become a native exception: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.native_paths.push(file); return JSON.stringify(r); }), true)), /three exact non-art level-60 sheet resources/);
  rejects('level-60 sheet resource row is mandatory: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.required_public_resources = r.required_public_resources.filter(row => row.path !== file); return JSON.stringify(r); }), true)), /two-variant512-asset571-public-path binding/);
}
rejects('the level-60 sheet script remains reviewed runtime code', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.runtime_paths = r.runtime_paths.filter(p => p !== 'worker/public/static/talents/stats60.js'); return JSON.stringify(r); }), true)), /three exact non-art level-60 sheet resources/);
for (const file of ['worker/public/static/talents/naked60-186.json', 'worker/public/static/talents/stat-effects186.json'])
  rejects('level-60 sheet data never becomes runtime code: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.runtime_paths.push(file); return JSON.stringify(r); }), true)), /three exact non-art level-60 sheet resources/);
rejects('512 asset cap is not broadened for another custom image', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.assets.push({ ...r.login_art_variants.assets[0], path: 'worker/public/static/wow/login/extra.png' }); return JSON.stringify(r); }), true)), /closed owner login art asset binding/);
rejects('talent art map byte drift is refused', () => verify(fixture(changed('worker/public/static/talents/art.json', s => s + '\n'))), /byte pin drift/);
rejects('talent art provenance byte drift is refused', () => verify(fixture(changed('worker/public/static/talents/art-provenance.json', s => s + '\n'))), /byte pin drift/);
rejects('v2 protocol source cannot drift independently from its shipping copy', () => verify(fixture(changed('tools/army-qr-live/protocol.js', s => s + '\n'))), /exact live Army protocol projection/);
const retiredArmyZip = 'worker/public/static/army-live/olympus-army-addon-0.2.0.zip';
rejects('retired standalone Army ZIP cannot return to the shipping Git tree', () => { const f = fixture(); f.entries = new Map(f.entries).set(retiredArmyZip, {mode:'100644',oid:'0'.repeat(40)}); verify(f); }, /retired standalone Army ZIP must remain absent/);
rejects('retired standalone Army ZIP cannot return as runtime code', () => verify(fixture(changed('scripts/official_asset_reference.json', s => { const r = JSON.parse(s); r.runtime_paths.push(retiredArmyZip); return JSON.stringify(r); }), true)), /retired standalone Army ZIP must remain absent/);
for (const file of ['worker/public/static/army-live/sanitized-export.js', 'worker/public/static/army-live/savedvariables-import.js']) {
  rejects('dedicated aggregate code byte drift is refused: ' + file, () => verify(fixture(changed(file, s => s + '\n'))), /byte pin drift/);
  rejects('dedicated aggregate code cannot become official artwork: ' + file, () => verify(fixture(changed('scripts/official_asset_reference.json', s => {const r=JSON.parse(s);r.official_paths[0]=file;return JSON.stringify(r);}), true)), /eight exact non-art Army resources/);
}
for (const file of ['tools/shared-census-website/website-overlay.cjs', 'tools/army-qr-local/website-overlay.cjs']) {
  rejects('each local overlay requires the exact app source: ' + file, () => verify(fixture(changed(file, s => s.replace(/EXPECTED_SOURCE_SHA256\s*=\s*['"][a-f0-9]{64}['"]/, "EXPECTED_SOURCE_SHA256='" + '0'.repeat(64) + "'")))), /local overlay app-source pin drift/);
  rejects('each local overlay source declaration is mandatory: ' + file, () => verify(fixture(changed(file, s => s.replace('EXPECTED_SOURCE_SHA256', 'UNRECOGNIZED_SOURCE_SHA256')))), /local overlay source declaration/);
}
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
// .218 reviewed calculator heading lineage and independently stale attachment pins.
// Fixed reviewed P285, heading-only and recovery successors; none is read from a generator.
const talentCalculator218 = 'worker/public/static/talents/calculator.js';
const talentGenerator218 = 'scripts/build-talent-build-contract.cjs', talentProjection218 = 'worker/src/talent-build-contract.ts';
const talentPriorSource218 = 'fbed6f34d022cea57a6760d96bd7b04f0419effa25b0f47eaa85d72e92636b14';
const talentCurrentSource218 = '0830ff6fc69ef3a3430bf1cdf31a272f3a5a84da4bcedfba2ae398748cd131c8';
const talentNewHeading218 = 'h("h1", { class: "talents-eyebrow", text: "Olympus · Forever talents" })';
const talentOldHeading218 = 'h("p", { class: "talents-eyebrow", text: "Olympus · Forever talents" })';
const actualCalculator218 = base.get(talentCalculator218).toString('utf8');
const talentHeadingSource218 = "2d36ebb635a97d706f18a9509174d3c8ecfab3e7e80d792ecc49cf97ff90fcb6";
const talentRecoveryEdits218 = [
  {
    "old": "      build = emptyBuild(data, options.className || \"warrior\");",
    "new": "      const linkedClass = classOf(data, options.className || \"warrior\");\n      build = emptyBuild(data, linkedClass ? linkedClass.id : \"warrior\");\n      if (!linkedClass) message = \"That linked class is unavailable. Showing a blank Warrior plan; choose a supported class below.\";"
  },
  {
    "old": "        if (incoming.ok) build = incoming.build; else message = incoming.error;",
    "new": "        if (incoming.ok) {\n          build = incoming.build;\n          if (!linkedClass) message = \"That linked class is unavailable. Showing the checked \" + classOf(data, build.className).name + \" shared plan.\";\n        } else message = incoming.error + (!linkedClass ? \" That linked class is unavailable. Showing a blank Warrior plan; choose a supported class below.\" : \"\");"
  }
];
let headingOnlyCalculator218 = actualCalculator218;
for (const edit of talentRecoveryEdits218.slice().reverse()) {
  if (headingOnlyCalculator218.split(edit.new).length !== 2) throw Error("one exact reviewed calculator recovery edit required");
  headingOnlyCalculator218 = headingOnlyCalculator218.replace(edit.new, edit.old);
}
check("the exact two reviewed unknown-class recovery edits preserve the entire heading-only calculator", hash(base.get(talentCalculator218)) === talentCurrentSource218
  && hash(Buffer.from(headingOnlyCalculator218)) === talentHeadingSource218);
check('the exact reviewed talent heading successor preserves every old calculator byte outside p-to-h1', hash(Buffer.from(headingOnlyCalculator218)) === talentHeadingSource218
  && headingOnlyCalculator218.split(talentNewHeading218).length === 2 && !headingOnlyCalculator218.includes(talentOldHeading218)
  && hash(Buffer.from(headingOnlyCalculator218.replace(talentNewHeading218, talentOldHeading218))) === talentPriorSource218);
function talentPinChange218(file, current, stale) {
  const original = base.get(file).toString('utf8');
  if (original.split(current).length !== 2 || current === stale) throw Error('one exact non-noop talent pin mutation required');
  return changed(file, source => source.replace(current, stale));
}
const oldTalentGenerator218 = talentPinChange218(talentGenerator218, talentCurrentSource218, talentPriorSource218);
const oldTalentProjection218 = talentPinChange218(talentProjection218, talentCurrentSource218, talentPriorSource218);
rejects('an independently stale calculator generator pin is refused before late CI', () => verify(fixture(oldTalentGenerator218)), /talent calculator source and generated serializer pin/);
rejects('an independently stale generated serializer pin is refused before late CI', () => verify(fixture(oldTalentProjection218)), /talent calculator source and generated serializer pin/);
rejects('a mutually consistent old generator and TS pin cannot credit the new calculator bytes', () => verify(fixture(new Map([...oldTalentGenerator218, ...oldTalentProjection218]))), /talent calculator source and generated serializer pin/);
const headingTalentGenerator218 = talentPinChange218(talentGenerator218, talentCurrentSource218, talentHeadingSource218);
const headingTalentProjection218 = talentPinChange218(talentProjection218, talentCurrentSource218, talentHeadingSource218);
rejects('a stale heading-only generator cannot qualify the recovery calculator', () => verify(fixture(headingTalentGenerator218)), /talent calculator source and generated serializer pin/);
rejects('mutually consistent heading-only generator and TS pins cannot qualify the recovery calculator', () => verify(fixture(new Map([...headingTalentGenerator218, ...headingTalentProjection218]))), /talent calculator source and generated serializer pin/);
rejects('calculator body drift still refuses when ordinary upstream asset byte pins are internally consistent', () => verify(fixture(changed(talentCalculator218, source => source + '\n// isolated unreviewed calculator body\n'), true)), /talent calculator source and generated serializer pin/);
rejects('an independently stale generated normalized data pin is refused', () => verify(fixture(talentPinChange218(talentProjection218, '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c', '0'.repeat(64)))), /talent normalized input and generated data pin/);
rejects('an independently stale generated upstream pin is refused', () => verify(fixture(talentPinChange218(talentProjection218, '260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588', '0'.repeat(64)))), /talent upstream and revision pins/);
rejects('an independently stale generated revision cannot borrow the unchanged upstream pin', () => verify(fixture(talentPinChange218(talentProjection218, 'TALENT_SNAPSHOT_REVISION = "260cf99b52db"', 'TALENT_SNAPSHOT_REVISION = "000000000000"'))), /talent upstream and revision pins/);

const talentMetadata218 = [
  ['TALENT_SNAPSHOT_REVISION', '260cf99b52db', /talent upstream and revision pins/],
  ['TALENT_SNAPSHOT_DATA_SHA256', '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c', /talent normalized input and generated data pin/],
  ['TALENT_SNAPSHOT_UPSTREAM_SHA256', '260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588', /talent upstream and revision pins/],
  ['TALENT_SERIALIZER_SOURCE_SHA256', '0830ff6fc69ef3a3430bf1cdf31a272f3a5a84da4bcedfba2ae398748cd131c8', /talent calculator source and generated serializer pin/],
];
for (const [name, value, error] of talentMetadata218) {
  const declaration = 'export const ' + name + ' = "' + value + '";', stale = '0'.repeat(value.length);
  const original = base.get(talentProjection218).toString('utf8');
  if (original.split(declaration).length !== 2) throw Error('one exact reviewed metadata declaration required: ' + name);
  const mutateDeclaration = replacement => changed(talentProjection218, text => text.replace(declaration, replacement));
  rejects('commented correct metadata cannot mask a stale active export: ' + name,
    () => verify(fixture(mutateDeclaration('// ' + declaration + '\nexport const ' + name + ' = "' + stale + '";'))), /talent exact generated metadata prefix/);
  rejects('a duplicate metadata declaration is refused: ' + name,
    () => verify(fixture(mutateDeclaration(declaration + '\n' + declaration))), /talent exact generated metadata prefix/);
  rejects('a false-guarded correct declaration cannot mask a stale active export: ' + name,
    () => verify(fixture(mutateDeclaration('if (false) {\n' + declaration + '\n}\nexport const ' + name + '="' + stale + '";'))), /talent exact generated metadata prefix/);
  rejects('a block-commented correct declaration cannot mask a compact stale export: ' + name,
    () => verify(fixture(mutateDeclaration('/*\n' + declaration + '\n*/\nexport const ' + name + '="' + stale + '";'))), /talent exact generated metadata prefix/);
  rejects('an appended compact duplicate cannot escape exact metadata uniqueness: ' + name,
    () => verify(fixture(changed(talentProjection218, text => text + '\nexport const ' + name + '="' + value + '";\n'))), error);
}

const talentGeneratorFields218 = [
  ['INPUT_SHA256', '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c', /talent normalized input and generated data pin/],
  ['UPSTREAM_SHA256', '260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588', /talent upstream and revision pins/],
  ['CALCULATOR_SHA256', '0830ff6fc69ef3a3430bf1cdf31a272f3a5a84da4bcedfba2ae398748cd131c8', /talent calculator source and generated serializer pin/],
  ['REVISION', '260cf99b52db', /talent upstream and revision pins/],
];
for (const [name, value, error] of talentGeneratorFields218) {
  const declaration = "const " + name + " = '" + value + "';", stale = '0'.repeat(value.length);
  const original = base.get(talentGenerator218).toString('utf8');
  if (original.split(declaration).length !== 2) throw Error('one exact reviewed generator declaration required: ' + name);
  const mutateGenerator = replacement => changed(talentGenerator218, text => text.replace(declaration, replacement));
  rejects('a stale active generator field is independently refused: ' + name,
    () => verify(fixture(mutateGenerator("const " + name + " = '" + stale + "';"))), error);
  rejects('a commented correct generator field cannot mask a stale active declaration: ' + name,
    () => verify(fixture(mutateGenerator('// ' + declaration + "\nconst " + name + " = '" + stale + "';"))), /talent exact generator metadata prefix/);
  rejects('a duplicate generator declaration is refused: ' + name,
    () => verify(fixture(mutateGenerator(declaration + '\n' + declaration))), /talent exact generator metadata prefix/);
  rejects('a false-guarded generator declaration cannot mask a stale active declaration: ' + name,
    () => verify(fixture(mutateGenerator('if (false) {\n' + declaration + "\n}\nconst " + name + "='" + stale + "';"))), /talent exact generator metadata prefix/);
  rejects('a block-commented correct generator field cannot mask a compact stale declaration: ' + name,
    () => verify(fixture(mutateGenerator('/*\n' + declaration + "\n*/\nconst " + name + "='" + stale + "';"))), /talent exact generator metadata prefix/);
  rejects('an appended compact generator duplicate cannot escape declaration uniqueness: ' + name,
    () => verify(fixture(changed(talentGenerator218, text => text + "\nconst " + name + "='" + value + "';\n"))), error);
}

console.log('\n' + passed + '/' + (passed + failed) + ' passed');
if (failed) process.exitCode = 1;
