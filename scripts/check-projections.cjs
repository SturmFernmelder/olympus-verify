#!/usr/bin/env node
'use strict';
// .168: read the candidate's Git objects, never refresh projections or execute candidate code.
const cp = require('node:child_process'), crypto = require('node:crypto'), fs = require('node:fs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString('utf8'));
const need = (ok, message) => { if (!ok) throw Error(message); };
const BOOT = ['LICENSE', 'README.md', 'CLAUDE.md', 'THIRD_PARTY_NOTICES.md', 'docs/source-provenance.md', 'docs/design.md', 'docs/deploy-checklist.md',
  'docs/treasury-plan207.md', 'index.html', 'privacy.html', 'terms.html', 'worker/src/index.ts', 'worker/src/policy-content.ts',
  'worker/src/site-data.ts', 'worker/src/site-ranks.ts', 'worker/src/site-core.ts', 'worker/src/site-news.ts',
  'worker/tests/site_test.cjs', 'worker/tests/hosts_test.cjs', 'worker/tests/bnet_retention_test.cjs'];
function git(cwd, args, input) {
  const r = cp.spawnSync('git', args, { cwd, input, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  need(!r.error && r.status === 0, 'git read failed: ' + args[0]);
  return r.stdout;
}
function loadSnapshot(cwd, revision = null) {
  const entries = new Map();
  const raw = git(cwd, revision ? ['ls-tree', '-r', '-z', '--full-tree', revision + '^{tree}'] : ['ls-files', '--stage', '-z']);
  for (const row of raw.toString('utf8').split('\0').filter(Boolean)) {
    const tab = row.indexOf('\t'), header = row.slice(0, tab).split(' '), file = row.slice(tab + 1);
    need(tab > 0, 'unreadable Git entry');
    if (!revision) need(header[2] === '0', 'unmerged index entry: ' + file);
    entries.set(file, { mode: header[0], oid: header[revision ? 2 : 1] });
  }
  const wanted = [...entries.keys()].filter(p => BOOT.includes(p) || /^(scripts\/|policies\/|worker\/scripts\/|worker\/public\/static\/)/.test(p)
    || /^addon\/OlympusStatsPilot\/(?:OlympusStatsPilot\.toc|Core\.lua|OlympusStatsPilot\.lua|Army\.lua|Libs\/StatsPilotQr\.lua|README\.md|ARMY\.md)$/.test(p) || ['tools/army-qr-live/protocol.js','tools/guild-qr-pilot/pilot.js','tools/guild-qr-pilot/decoder.js'].includes(p)
    || ['tools/build-site-assets.py', 'tools/wow-cursor-provenance.json', 'tools/build-talent-art.py', 'tools/check-login-portal.py',
      'tools/shared-census-website/website-overlay.cjs', 'tools/army-qr-local/website-overlay.cjs'].includes(p));
  const ids = [...new Set(wanted.map(p => entries.get(p).oid))], blobs = new Map();
  const batch = git(cwd, ['cat-file', '--batch'], ids.join('\n') + '\n');
  let offset = 0;
  for (const id of ids) {
    const end = batch.indexOf(10, offset), fields = batch.subarray(offset, end).toString('ascii').split(' ');
    need(end >= offset && fields[0] === id && fields[1] === 'blob' && /^\d+$/.test(fields[2]), 'not a regular candidate blob');
    const size = Number(fields[2]); offset = end + 1;
    need(offset + size < batch.length && batch[offset + size] === 10, 'truncated Git blob');
    blobs.set(id, batch.subarray(offset, offset + size)); offset += size + 1;
  }
  need(offset === batch.length, 'unexpected Git blob output');
  return { identity: revision || 'index', entries, get(file) {
    const entry = entries.get(file);
    need(entry && ['100644', '100755'].includes(entry.mode) && blobs.has(entry.oid), 'missing/non-file candidate input: ' + file);
    return blobs.get(entry.oid);
  }, mode(file) { return entries.get(file)?.mode; } };
}
function verify(snapshot) {
  let checks = 0;
  const check = (ok, label) => { checks++; need(ok, label); };
  const get = p => snapshot.get(p), text = p => get(p).toString('utf8');
  const match = (p, pattern, label) => { const m = pattern.exec(text(p)); check(!!m, label); return m[1]; };
  const pin = row => {
    check(row && typeof row.path === 'string' && Number.isSafeInteger(row.bytes) && /^[a-f0-9]{64}$/.test(row.sha256), 'invalid byte pin');
    const bytes = get(row.path);
    check(bytes.length === row.bytes && sha(bytes) === row.sha256 && (!row.mode || snapshot.mode(row.path) === row.mode), 'byte pin drift: ' + row.path);
  };
  const refPath = 'scripts/official_asset_reference.json', ref = json(get(refPath));
  const referencePin = match('scripts/official_assets.py', /^REFERENCE_SHA256=['"]([a-f0-9]{64})['"]/m, 'reference hash declaration');
  check(sha(get(refPath)) === referencePin, 'official asset reference digest drift');
  check(Array.isArray(ref.assets) && ref.assets.length > 0 && Array.isArray(ref.fixed_art_source_pins), 'asset reference rows');
  const loginArt = ref.login_art_exception, loginPin = loginArt?.asset;
  check(loginArt && loginArt.usage === 'login_background_only' && loginArt.instruction_date === '2026-10-19'
    && loginArt.classification === 'ai_custom_art_not_official_blizzard'
    && loginArt.owner_instruction === 'Build .172 owner-approved custom login background'
    && loginPin?.path === 'worker/public/static/wow/login/olympus-dark-portal.png' && loginPin.mode === '100644'
    && loginPin.bytes === 2761774 && loginPin.sha256 === '7c344640d2dd628a6b235323cb27a2a8962ac4026a920d2c1809b652b1494342'
    && !ref.official_paths.includes(loginPin.path) && !ref.native_paths.includes(loginPin.path), 'exact nonofficial owner login art exception');
  const loginRows = ref.assets.filter(row => row.path === loginPin.path);
  check(ref.assets.length <= 512 && loginRows.length === 1
    && ['path', 'mode', 'bytes', 'sha256'].every(key => loginRows[0][key] === loginPin[key]), 'closed owner login art asset binding');
  pin(loginPin);
  const variants = ref.login_art_variants, variantPins = variants?.assets;
  const expectedVariants = [
    { path: 'worker/public/static/wow/login/olympus-dark-portal-wide.png', mode: '100644', bytes: 2972596, sha256: '17661fd0184e3a20fd6ed366673e64fc66baef41ed378bfdf5ab9f3ed0a16dc6' },
    { path: 'worker/public/static/wow/login/olympus-dark-portal-portrait.png', mode: '100644', bytes: 2803728, sha256: '218063b8ba4e5496c659a310cb46cd26d5c14d4784a7e66f9497d968e1679659' }
  ];
  check(variants && JSON.stringify(Object.keys(variants).sort()) === JSON.stringify(['assets', 'classification', 'instruction_date', 'owner_instruction', 'usage'])
    && variants.usage === 'login_background_only' && variants.instruction_date === '2026-10-19'
    && variants.classification === 'imagegen_derived_custom_art_not_official_blizzard'
    && variants.owner_instruction === 'Build .173 owner-approved fullscreen wide and portrait login backgrounds'
    && Array.isArray(variantPins) && variantPins.length === 2 && variantPins.every((row, i) =>
      JSON.stringify(Object.keys(row).sort()) === JSON.stringify(['bytes', 'mode', 'path', 'sha256'])
      && ['path', 'mode', 'bytes', 'sha256'].every(key => row[key] === expectedVariants[i][key])
      && !ref.official_paths.includes(row.path) && !ref.native_paths.includes(row.path)), 'exact nonofficial owner login art variants');
  check(ref.assets.length === 512 && new Set(ref.assets.map(row => row.path)).size === 512
    && ref.required_public_resources.length === 59 && new Set(ref.required_public_resources.map(row => row.path)).size === 59
    && new Set([...ref.assets, ...ref.required_public_resources].map(row => row.path)).size === 571
    && ref.official_paths.length === 494 && ref.fixed_art_source_pins.length === 7
    && variantPins.every(expected => { const rows = ref.assets.filter(row => row.path === expected.path); return rows.length === 1
      && ['path', 'mode', 'bytes', 'sha256'].every(key => rows[0][key] === expected[key]); }), 'closed two-variant512-asset571-public-path binding');
  const talentComparisonResources = ['worker/public/static/talents/analysis.js', 'worker/public/static/talents/guide-builds179.js'];
  check(talentComparisonResources.every(file => ref.required_public_resources.filter(row => row.path === file).length === 1
    && ref.runtime_paths.includes(file) && !ref.official_paths.includes(file) && !ref.native_paths.includes(file)), 'two exact non-art talent comparison resources');
  // .186: the optional level-60 sheet is one runtime script plus two graded data files, none of them artwork.
  const talentSheetResources = ['worker/public/static/talents/stats60.js', 'worker/public/static/talents/naked60-186.json', 'worker/public/static/talents/stat-effects186.json'];
  check(talentSheetResources.every(file => ref.required_public_resources.filter(row => row.path === file).length === 1
    && ref.runtime_paths.includes(file) === file.endsWith('.js') && !ref.official_paths.includes(file) && !ref.native_paths.includes(file)), 'three exact non-art level-60 sheet resources');
  const master199Resources = ['worker/public/static/role-rank199.js', 'worker/public/static/royal-writs199.js'];
  check(master199Resources.every(file => ref.required_public_resources.filter(row => row.path === file).length === 1 && ref.runtime_paths.includes(file) && !ref.official_paths.includes(file) && !ref.native_paths.includes(file)), 'two exact non-art master199 catalogue resources');
  const master196Resources = ['worker/public/static/legal-view196.js', 'worker/public/static/approved-guild-helper196.js'];
  check(master196Resources.every(file => ref.required_public_resources.filter(row => row.path === file).length === 1
    && ref.runtime_paths.filter(path => path === file).length === 1 && !ref.official_paths.includes(file) && !ref.native_paths.includes(file)), 'two exact non-art master196 view resources');
  // .205: the wide overview and its context are two exact non-art modules, not new art exceptions.
  const organization205Resources = ['worker/public/static/organization-overview205.js', 'worker/public/static/organization-context205.js'];
  check(organization205Resources.every(file => ref.required_public_resources.filter(row => row.path === file && row.mode === '100644').length === 1
    && ref.runtime_paths.filter(path => path === file).length === 1 && !ref.assets.some(row => row.path === file)
    && !ref.official_paths.includes(file) && !ref.native_paths.includes(file)), 'two exact non-art organization205 resources');
  const treasury207 = ['treasury-plan207.js','treasury-plan-content207.js','treasury-plan-model207.js','treasury-plan207.css'].map(name=>'worker/public/static/'+name);
  check(treasury207.every(file=>ref.required_public_resources.filter(row=>row.path===file&&row.mode==='100644').length===1&&ref.runtime_paths.filter(path=>path===file).length===1&&!ref.assets.some(row=>row.path===file)&&!ref.official_paths.includes(file)&&!ref.native_paths.includes(file)), 'four exact ordinary treasury207 planning resources');
  check(text('worker/public/static/app.js').includes('import("/static/treasury-plan207.js")') && text('worker/public/static/treasury-plan207.js').includes('/static/treasury-plan-content207.js') && text('worker/public/static/treasury-plan207.js').includes('/static/treasury-plan-model207.js'), 'treasury207 app and pure module dependencies');
  const guides218 = ['guides218.js','guides218.css','guides218.json'].map(name=>'worker/public/static/'+name);
  check(guides218.every(file=>ref.required_public_resources.filter(row=>row.path===file&&row.mode==='100644').length===1&&ref.runtime_paths.filter(path=>path===file).length===(file.endsWith('.json')?0:1)&&!ref.assets.some(row=>row.path===file)&&!ref.official_paths.includes(file)&&!ref.native_paths.includes(file)), 'three exact ordinary guides218 resources');
  check(text('worker/public/static/app.js').includes('memberTool(main, "OlympusGuides", "/static/guides218.js", "/static/guides218.css"') && text('worker/public/static/guides218.js').includes('const DATA_URL = "/static/guides218.json"'), 'guides218 app and catalogue dependencies');
  const council206Record = 'worker/public/static/governance/council-composition-2026-10-28.md';
  check(ref.required_public_resources.filter(row => row.path === council206Record && row.mode === '100644').length === 1 && !ref.runtime_paths.includes(council206Record) && !ref.assets.some(row => row.path === council206Record) && !ref.official_paths.includes(council206Record) && !ref.native_paths.includes(council206Record), 'one exact non-art current Council206 record');
  const council218Record = 'worker/public/static/governance/council-composition-master218.md';
  check(ref.required_public_resources.filter(row => row.path === council218Record && row.mode === '100644').length === 1
    && !ref.runtime_paths.includes(council218Record) && !ref.assets.some(row => row.path === council218Record)
    && !ref.official_paths.includes(council218Record) && !ref.native_paths.includes(council218Record), 'one exact non-art Master218 Council reference');
  const staticReferences = file => [...new Set(text(file).match(/\/static\/[A-Za-z0-9_./-]*/g) || [])].sort();
  check(JSON.stringify(staticReferences(organization205Resources[0])) === JSON.stringify(['/static/organization-context205.js'])
    && staticReferences(organization205Resources[1]).length === 0, 'exact organization205 context dependency; context introduces no static asset dependency');
  for (const row of variantPins) pin(row);
  for (const row of [...ref.assets, ...ref.required_public_resources, ...ref.fixed_art_source_pins, ref.approved_extractor]) pin(row);
  // .179: only four exact dormant resources; no new artwork exception or runtime switch.
  const armyRoot = 'worker/public/static/army-qr-review/', armyNames = ['protocol.js', 'decoder.js', 'pilot.js', 'manifest.json'];
  check(ref.required_public_resources.filter(row => row.path.startsWith(armyRoot)).length === 4
    && armyNames.every(name => ref.required_public_resources.some(row => row.path === armyRoot + name)), 'four closed dormant Army resources');
  const armyManifest = json(get(armyRoot + 'manifest.json'));
  check(armyManifest.format === 'olympus-army-qr-dormant-review-v1' && armyManifest.activation === false && armyManifest.uploads === false
    && armyManifest.runtimeOverride === false && armyManifest.shippingHtml === false, 'dormant Army manifest gates');
  for (const name of armyNames.slice(0, 3)) check(text(armyRoot + name).startsWith("/* Dormant Army QR review bytes. No runtime activation or upload switch. */\n(function () {\n  'use strict';\n  const activation = false, uploads = false;\n  return; // Unconditional source-fixed stop; retained source below is never executed.\n"), 'dormant Army unconditional gate: ' + name);

  // .180: explicit owner authorization replaces the prior disabled-only restriction; old resources stay dormant.
  const liveRoot = 'worker/public/static/army-live/', liveNames = ['army.css','army.js','protocol.js','report.js','pilot.js','decoder.js','sanitized-export.js','savedvariables-import.js'];
  check(ref.required_public_resources.filter(row => row.path.startsWith(liveRoot)).length === 8 && liveNames.every(name => ref.required_public_resources.some(row => row.path === liveRoot + name) && ref.runtime_paths.includes(liveRoot + name) && !ref.official_paths.includes(liveRoot + name) && !ref.native_paths.includes(liveRoot + name)), 'eight exact non-art Army resources');
  check(get(liveRoot+'protocol.js').equals(get('tools/army-qr-live/protocol.js')), 'exact live Army protocol projection');
  const retiredArmyZip = liveRoot + 'olympus-army-addon-0.2.0.zip';
  check(!snapshot.entries.has(retiredArmyZip) && !ref.required_public_resources.some(row => row.path === retiredArmyZip) && !ref.runtime_paths.includes(retiredArmyZip), 'retired standalone Army ZIP must remain absent');
  for (const file of ref.required_documents) check(get(file).length > 0, 'required document: ' + file);
  const v4Text = match('scripts/reconcile_public_root.py', /^V4_PINS=(\{[^\r\n]+\})/m, 'V4 pin declaration');
  const v4 = [...v4Text.matchAll(/'([^']+)':'([a-f0-9]{64})'/g)];
  check(v4.length === 6, 'six V4 helper pins');
  for (const [, file, digest] of v4) check(sha(get('scripts/' + file)) === digest, 'V4 helper digest drift: ' + file);
  for (const [name, pattern, file] of [
    ['network guard', /^GUARD_SHA256=['"]([a-f0-9]{64})['"]/m, 'scripts/pages_network_guard.cjs']]) {
    const digest = match('scripts/reconcile_public_root.py', pattern, name + ' hash declaration');
    check(sha(get(file)) === digest, name + ' digest drift');
  }
  const provenance = json(get(ref.provenance_path));
  for (const extraction of provenance.additional_extractions || []) if (extraction.source_record) {
    pin(extraction.source_record);
    check(JSON.stringify(json(get(extraction.source_record.path))) === JSON.stringify(extraction.source_record_data), 'cursor embedded provenance drift');
  }
  const folder = 'worker/public/static/governance/', model = json(get(folder + 'organization.json'));
  pin({ ...model.book, path: 'worker/public' + model.book.path });
  const app = text('worker/public/static/app.js');
  check(app.includes('import("/static/organization-view.js")') && app.includes('import("/static/organization-overview205.js")'), 'organization app imports retain chart and exact wide overview modules');
  check(app.includes('const GOVERNANCE_SHA256 = "' + model.book.sha256 + '"'), 'governance reader digest drift');
  check(app.includes('bytes.length !== ' + model.book.bytes) && app.includes('data.book.bytes !== ' + model.book.bytes), 'both governance reader sizes');
  for (const row of json(get(folder + 'downloads-manifest.json')).artifacts) pin({ ...row, path: folder + row.file });
  // The same canonical policies feed the root mirrors and generated documents. This does not run a generator.
  const generated = text('worker/src/policy-content.ts'), sourceHashes = [];
  for (const [file, key] of [['index.html', 'INDEX'], ['privacy.html', 'PRIVACY'], ['terms.html', 'TERMS']]) {
    const source = text('policies/' + file);
    check(get(file).equals(get('policies/' + file)), 'policy root mirror drift: ' + file);
    sourceHashes.push(file + '\n' + sha(Buffer.from(source)));
    const declaration = new RegExp('^const ' + key + ' = (.+);$', 'm').exec(generated);
    check(!!declaration, 'generated policy declaration: ' + key);
    const html = JSON.parse(declaration[1]), main = /<main>\n([\s\S]*?)\n<\/main>/.exec(source)?.[1];
    check(typeof main === 'string', 'canonical policy main: ' + file);
    const body = main.replace('<p class="meta" style="margin-top:2.5rem">See also the <a href="./terms.html">', '<p class="meta related">See also the <a href="/legal/terms">')
      .replace('<p class="meta" style="margin-top:2.5rem">See also the <a href="./privacy.html">', '<p class="meta related">See also the <a href="/legal/privacy">')
      .replaceAll('href="./privacy.html"', 'href="/legal/privacy"').replaceAll('href="./terms.html"', 'href="/legal/terms"');
    check(html.includes('<main id="policy-content" tabindex="-1">\n' + body + '\n</main>'), 'generated policy body drift: ' + file);
  }
  check(generated.includes('export const POLICY_SOURCE_DIGEST = "' + sha(Buffer.from(sourceHashes.join('\n'))) + '";'), 'policy source digest drift');
  const build = match('worker/src/index.ts', /^const BUILD = "([^"]+)";/m, 'runtime BUILD declaration');
  const releaseNote = /export const RELEASE_NOTES: readonly ReleaseNote\[\] = \[\s*\{\s*build: "(\.[0-9]+)", date: "([0-9]{4}-[0-9]{2}-[0-9]{2})"/.exec(text('worker/src/site-news.ts'));
  check(!!releaseNote && build.startsWith(releaseNote[2] + releaseNote[1] + ' '), 'current release note exactly matches runtime BUILD number and date');
  for (const file of ['site_test.cjs', 'hosts_test.cjs', 'bnet_retention_test.cjs'])
    check(text('worker/tests/' + file).includes('"' + build + '"'), 'runtime health BUILD pin: ' + file);
  const number = /^\d{4}-\d{2}-\d{2}\.(\d+) /.exec(build)?.[1];
  check(!!number && new RegExp('^## Worker \\.' + number + '(?: | —|$)', 'm').test(text('docs/deploy-checklist.md')), 'runtime BUILD deploy section');
  // .181: inspect these declarations as inert bytes; never load or run a candidate overlay in the hook.
  for (const file of ['tools/shared-census-website/website-overlay.cjs', 'tools/army-qr-local/website-overlay.cjs']) {
    const digest = match(file, /^const EXPECTED_SOURCE_SHA256\s*=\s*['"]([a-f0-9]{64})['"]/m, 'local overlay source declaration: ' + file);
    check(sha(get('worker/public/static/app.js')) === digest, 'local overlay app-source pin drift: ' + file);
  }
  return { candidate: snapshot.identity, checks, build, result: 'PASS', readOnly: true,
    limits: 'Projection/pin consistency only: no unit/runtime/security/publication/license/live qualification; policy body/digest parity, not a replacement for the full generator or publication tests.' };
}
function pushCandidates(input) {
  const ids = [];
  for (const line of input.split(/\r?\n/).filter(Boolean)) {
    const fields = line.split(' ');
    need(fields.length === 4 && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(fields[1]) && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(fields[3]), 'invalid pre-push input');
    if (!/^0+$/.test(fields[1])) ids.push(fields[1]); // A deleted remote ref has no local candidate.
  }
  return [...new Set(ids)];
}
function main(args, input = '') {
  const start = performance.now();
  need(args.length === 0 || args.length === 1 && args[0] === '--index' || args.length === 1 && args[0] === '--pre-push'
    || args.length === 2 && args[0] === '--rev' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(args[1]), 'use --index, --rev <full SHA>, or --pre-push');
  const candidates = args[0] === '--pre-push' ? pushCandidates(input) : [args[0] === '--rev' ? args[1] : null];
  const results = candidates.map(rev => verify(loadSnapshot(process.cwd(), rev)));
  return { results, elapsedMs: Math.round(performance.now() - start), deletedRefsOnly: candidates.length === 0 };
}
module.exports = { loadSnapshot, verify, pushCandidates, main };
if (require.main === module) {
  try { console.log(JSON.stringify(main(process.argv.slice(2), process.argv[2] === '--pre-push' ? fs.readFileSync(0, 'utf8') : ''))); }
  catch (e) { console.error('FAIL projection check: ' + e.message); process.exitCode = 1; }
}
