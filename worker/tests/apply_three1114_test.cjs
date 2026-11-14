'use strict';
// Owner rulings of 14 November 2026. Asked "Should Core Raider and Crafter keep their own Apply buttons on the site?",
// the owner answered "No, three choices only"; asked "How does a Raider become Core Raider?", "Raid leads grant it".
// Covered and tested here: Core Raider (office_25) and Crafter (office_27) have no application of their own, the
// application choices are Guild Member, Raider and Artisan, and Core Raider reads "Granted by the raid leads.".
// Deliberately NOT tested (not ruled): which offices are raid leads, any criterion, withdrawal, rank or Discord effects,
// and any rule for applications already saved with one of the two targets.
//
// Real sources only: the catalogue (organization.json), the generated server and browser rows, the real Worker modules
// (transpiled as evergreen1112_governance_test.cjs loads them), the real generator in --check mode, and the pages drawn
// by the real app.js and organization-view.js on the authenticated Worker/SQLite page fixture of frontend_check.cjs.
// Checks tagged RULING fail on the tree before the ruling (main f8ac52a4); checks tagged INVARIANT pass on both.
// Checks tagged ANSWER cover the owner's two text answers of 14 Nov 2026 (section (f) and the pages) and fail on 6d5e744.
// A self-check rebuilds the Worker modules from an in-memory copy of governance-offices.ts in which office_25 is made
// eligible again, and requires the ruling predicates to fail on it.
// Usage, from the worker folder: node tests/apply_three1114_test.cjs
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), vm = require('node:vm'), { Module } = require('node:module');
const worker = path.join(__dirname, '..'), repo = path.join(worker, '..');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const ts = require(path.join(worker, 'node_modules', 'typescript'));
let n = 0, ok = 0;
function check(kind, name, pass, detail = '') {
  n++; if (pass) ok++;
  console.log((pass ? 'PASS ' : 'FAIL ') + kind + ' ' + name + (pass || !detail ? '' : ' :: ' + detail));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CORE_RAIDER_TEXT = 'Granted by the raid leads. There is no separate application: apply as Raider.';
const CRAFTER_TEXT = 'There is no separate application: apply as Artisan.';
const ORDINARY = ['member', 'raider', 'artisan'];

// ---------------------------------------------------------------- the real Worker modules, optionally from a mutant source
function workerModules(overrides = {}) {
  const loaded = {};
  function load(name) {
    if (name.startsWith('node:')) return require(name);
    name = name.replace(/^\.\//, '');
    if (loaded[name]) return loaded[name].exports;
    const m = { exports: {} }; loaded[name] = m;
    const source = Object.hasOwn(overrides, name) ? overrides[name] : read('worker/src/' + name + '.ts');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('module', 'exports', 'require', js)(m, m.exports, load);
    return m.exports;
  }
  return { offices: load('governance-offices'), tracks: load('application-track199'), directory: load('site-role-directory203').ROLE_DIRECTORY_203 };
}
// The browser catalogue is a classic script; evaluate it as the page does (a global), not through the package's module type.
const browserRows = () => { const context = vm.createContext({}); vm.runInContext(read('worker/public/static/role-rank199.js'), context, { filename: 'role-rank199.js' }); return context.OlympusRoleRank199.offices; };
const model = JSON.parse(read('worker/public/static/governance/organization.json'));
const real = workerModules();

// ---------------------------------------------------------------- the ruling predicates (also run on the mutant)
const term = (m, key) => m.terms.find(t => t.officeKey === key);
const appointment = (m, key) => m.appointments.find(t => t.key === key);
const catalogueRow = (row, text) => !!row && row.applicationEligible === false && same(row.applicationRoleKeys, []) && row.acquisition === text;
function admittedIntents(mods) {
  const out = [];
  const keys = [null, ...mods.offices.OFFICE_APPOINTMENTS.map(o => o.key)];
  for (const track of mods.offices.APPLICATION_TRACKS_199.map(t => t.id)) for (const key of keys) {
    const intent = mods.tracks.validateApplicationIntent199(track, key, () => false);
    if (intent && !intent.error && !mods.tracks.reservedApplication201({ applicationTrack: track, targetOffice: key })) out.push(track + '/' + (key || 'null'));
  }
  return out.sort();
}
const ADMITTED = ['artisan/null', 'artisan/office_07', 'member/null', 'patron/null', 'raider/null'];
const refusedTarget = (mods, track, key) => { const v = mods.tracks.validateApplicationIntent199(track, key, () => false); return !!v && v.error === 'invalid' && v.field === 'targetOffice'; };
const EXPECTED_TARGETS = { artisan: [{ applicationTrack: 'artisan', targetOffice: 'office_07' }], raider: [{ applicationTrack: 'raider', targetOffice: null }], member: [{ applicationTrack: 'member', targetOffice: null }] };
const targetsAsRuled = dir => dir.families.every(f => same((f.applicationTargets || []).map(t => ({ applicationTrack: t.applicationTrack, targetOffice: t.targetOffice })), EXPECTED_TARGETS[f.key] || []));
const raidStanding = dir => dir.families.find(f => f.key === 'raid_standing');
const openFamilies = dir => dir.families.filter(f => f.eligibility === 'open_application').map(f => f.key).sort();
const rulingPredicates = mods => ({
  admitted: same(admittedIntents(mods), ADMITTED),
  coreRaiderRefused: refusedTarget(mods, 'raider', 'office_25'),
  crafterRefused: refusedTarget(mods, 'artisan', 'office_27'),
  targets: targetsAsRuled(mods.directory),
  standing: raidStanding(mods.directory)?.eligibility === 'standing' && (raidStanding(mods.directory)?.applicationTargets || []).length === 0,
  threeOpen: same(openFamilies(mods.directory), ['artisan', 'member', 'raider']),
  serverRows: catalogueRow(mods.offices.OFFICE_APPOINTMENTS.find(o => o.key === 'office_25'), CORE_RAIDER_TEXT) && catalogueRow(mods.offices.OFFICE_APPOINTMENTS.find(o => o.key === 'office_27'), CRAFTER_TEXT),
});

// ---------------------------------------------------------------- (a) catalogue and generated rows
check('RULING', 'organization.json term office_25 (Core Raider): applicationEligible false, applicationRoleKeys [], acquisition "' + CORE_RAIDER_TEXT + '"',
  catalogueRow(term(model, 'office_25'), CORE_RAIDER_TEXT) && term(model, 'office_25').label === 'Core Raider', JSON.stringify(term(model, 'office_25') && { e: term(model, 'office_25').applicationEligible, k: term(model, 'office_25').applicationRoleKeys, a: term(model, 'office_25').acquisition }));
check('RULING', 'organization.json term office_27 (Crafter): applicationEligible false, applicationRoleKeys [], acquisition "' + CRAFTER_TEXT + '"',
  catalogueRow(term(model, 'office_27'), CRAFTER_TEXT) && term(model, 'office_27').label === 'Crafter', JSON.stringify(term(model, 'office_27') && { e: term(model, 'office_27').applicationEligible, k: term(model, 'office_27').applicationRoleKeys, a: term(model, 'office_27').acquisition }));
const eligibleOrdinary = model.terms.filter(t => t.tier === 'member_specialist' && ORDINARY.includes(t.applicationTrack) && t.applicationEligible).map(t => t.officeKey);
check('RULING', 'exactly one member_specialist term on an ordinary track is eligible: office_07 (Artisan)', same(eligibleOrdinary, ['office_07']), eligibleOrdinary.join(','));
// That no other field of the two terms changed is checked by evergreen1112_governance_test.cjs (CL2-039 digests).
check('RULING', 'the two terms keep their application tracks (raider, artisan) and labels (Core Raider, Crafter), and the server rows carry the ruled values', term(model, 'office_25').applicationTrack === 'raider' && term(model, 'office_27').applicationTrack === 'artisan'
  && term(model, 'office_25').applicationLabel === 'Core Raider' && term(model, 'office_27').applicationLabel === 'Crafter' && rulingPredicates(real).serverRows);
const pick = row => row && JSON.parse(JSON.stringify(row));
const rowsAgree = ['office_25', 'office_27'].every(key => { const s = pick(real.offices.OFFICE_APPOINTMENTS.find(o => o.key === key)), b = pick(browserRows().find(o => o.key === key)), o = pick(appointment(model, key)); return !!s && same(s, b) && same(s, o); });
check('INVARIANT', 'server rows (governance-offices.ts), browser rows (role-rank199.js) and organization.json appointments are deep-equal for office_25 and office_27', rowsAgree);
check('RULING', 'the served rows of office_25 and office_27 carry the ruled values', catalogueRow(appointment(model, 'office_25'), CORE_RAIDER_TEXT) && catalogueRow(appointment(model, 'office_27'), CRAFTER_TEXT)
  && catalogueRow(browserRows().find(o => o.key === 'office_25'), CORE_RAIDER_TEXT) && catalogueRow(browserRows().find(o => o.key === 'office_27'), CRAFTER_TEXT));
const gen = cp.spawnSync(process.execPath, [path.join(repo, 'scripts/build-governance-offices.cjs'), '--check'], { cwd: worker, encoding: 'utf8' });
check('INVARIANT', 'the generator reproduces all three files (node ../scripts/build-governance-offices.cjs --check, as check:master196 calls it)', gen.status === 0, (gen.stderr || '').split('\n').find(l => /Error/.test(l)) || 'exit ' + gen.status);

// ---------------------------------------------------------------- (b) the real intent check over all six tracks
const admitted = admittedIntents(real);
check('RULING', 'over all six tracks and every office key plus no office, the admitted non-reserved intents are exactly member/null, raider/null, artisan/null, artisan/office_07, patron/null', same(admitted, ADMITTED), admitted.join(','));
check('RULING', 'raider/office_25 (Core Raider) is refused with field targetOffice', refusedTarget(real, 'raider', 'office_25'));
check('RULING', 'artisan/office_27 (Crafter) is refused with field targetOffice', refusedTarget(real, 'artisan', 'office_27'));
check('INVARIANT', 'raider/office_11 (Bench) stays refused with field targetOffice', refusedTarget(real, 'raider', 'office_11'));
check('INVARIANT', 'member/null, raider/null and artisan/office_07 are still accepted', ['member', 'raider'].every(t => same(real.tracks.validateApplicationIntent199(t, null, () => false), { applicationTrack: t, targetOffice: null }))
  && same(real.tracks.validateApplicationIntent199('artisan', 'office_07', () => false), { applicationTrack: 'artisan', targetOffice: 'office_07' }));
// How an application already saved with raider/office_25 or artisan/office_27 is shown (for example its board
// descriptor, applicationIntentDto199, site-api.ts) is not ruled and deliberately not tested here.

// ---------------------------------------------------------------- (c) the real role directory
check('RULING', 'every family\'s applicationTargets: artisan -> artisan/office_07, raider -> raider/null, member -> member/null, [] elsewhere', targetsAsRuled(real.directory),
  real.directory.families.filter(f => (f.applicationTargets || []).length).map(f => f.key + ':' + f.applicationTargets.map(t => t.applicationTrack + '/' + t.targetOffice).join('+')).join(' '));
check('RULING', 'Raid Team Standing (Core Raider, Bench) has eligibility "standing" and no target', rulingPredicates(real).standing, raidStanding(real.directory)?.eligibility);
check('RULING', 'exactly three families accept applications (artisan, member, raider)', rulingPredicates(real).threeOpen, openFamilies(real.directory).join(','));

// ---------------------------------------------------------------- (e) the fixed sentences in app.js
const app = read('worker/public/static/app.js');
check('INVARIANT', 'the Roles notice says "Member, Raider and Artisan are open for applications." (app.js, Roles chooser)', app.includes('noticeBox("info","pos-officer",h("p",{text:"Member, Raider and Artisan are open for applications. "+reservedNotice201}),'));
check('INVARIANT', 'the Member guide step says "Member, Raider and Artisan are open for applications." (app.js, guide)', app.includes('["Choose a role", "Member, Raider and Artisan are open for applications. Read the role\'s duties and expectations before you apply.", "#/roles", "Explore roles"],'));
const familyLabel = key => real.directory.families.find(f => f.key === key)?.label || '';
check('INVARIANT', 'the three names in that sentence are the families that accept applications (Guild Member, Raider, Artisan / Crafter)', /Member/.test(familyLabel('member')) && /Raider/.test(familyLabel('raider')) && /Artisan/.test(familyLabel('artisan')));

// ---------------------------------------------------------------- (f) the owner's two text answers of 14 Nov 2026
// 1. "Drop "Core" (Recommended)": the raider track's label becomes "Raider & PvE Progression Track". Nothing else changes.
// 2. "Artisan only (Recommended)": the overview sentence becomes "Profession coordination and the Artisan application."
// Not covered, so not tested: the Artisan track's label, the standing introduction, the Core Raider term note, any other
// wording. Checks tagged ANSWER fail on 6d5e744 (the branch before these two answers). That no other field of the
// application tracks changed is checked by evergreen1112_governance_test.cjs (CL2-039 digest 6d20757d, with a finite inverse).
const NEW_RAIDER_LABEL = 'Raider & PvE Progression Track', OLD_RAIDER_LABEL = 'Core Raider & PvE Progression Track';
const NEW_WORKSHOP_TEXT = 'Profession coordination and the Artisan application.', OLD_WORKSHOP_TEXT = 'Profession coordination and the Artisan / Crafter application.';
// The six labels at 6d5e744, with only the raider label replaced as answered.
const LABELS1114 = [['member', 'Sworn Guild Member'], ['raider', NEW_RAIDER_LABEL], ['artisan', 'Master Artisan & Guild Workshop Crafter'],
  ['officer', 'Officer Corps & Branch Leadership Application'], ['high_council', 'High Council Application'], ['patron', 'Royal Patron & Flagship Olympus I Charter']];
const browserTracks = () => { const context = vm.createContext({}); vm.runInContext(read('worker/public/static/role-rank199.js'), context, { filename: 'role-rank199.js' }); return JSON.parse(JSON.stringify(context.OlympusRoleRank199.tracks)); };
const trackSources = { 'server module (governance-offices.ts)': JSON.parse(JSON.stringify(real.offices.APPLICATION_TRACKS_199)), 'browser module (role-rank199.js)': browserTracks(), 'organization.json applicationTracks': model.applicationTracks };
const raiderLabels = Object.entries(trackSources).map(([where, rows]) => [where, rows.filter(t => t.id === 'raider').map(t => t.label)]);
check('ANSWER', 'the raider track\'s label is exactly "' + NEW_RAIDER_LABEL + '" in the server module, the browser module and organization.json',
  raiderLabels.every(([, labels]) => same(labels, [NEW_RAIDER_LABEL])), JSON.stringify(raiderLabels));
const oldLabelFiles = ['scripts/build-governance-offices.cjs', 'worker/src/governance-offices.ts', 'worker/public/static/role-rank199.js', 'worker/public/static/governance/organization.json'].filter(rel => read(rel).includes(OLD_RAIDER_LABEL));
check('ANSWER', 'the old label "' + OLD_RAIDER_LABEL + '" occurs in none of the three generated files nor in the generator', oldLabelFiles.length === 0, oldLabelFiles.join(','));
const labelRows = Object.entries(trackSources).map(([where, rows]) => [where, rows.map(t => [t.id, t.label])]);
check('ANSWER', 'the six track labels are exactly those of 6d5e744 with only the raider label changed (member, artisan, officer, high_council, patron unchanged), in all three files',
  labelRows.every(([, rows]) => same(rows, LABELS1114)), JSON.stringify(labelRows.filter(([, rows]) => !same(rows, LABELS1114))));
const overviewSource = read('worker/public/static/organization-overview205.js');
const workshopCall = 'groupSection("workshop", "org-alliance-independent", "' + NEW_WORKSHOP_TEXT + '")';
check('ANSWER', 'the overview\'s workshop group sentence is exactly "' + NEW_WORKSHOP_TEXT + '" (organization-overview205.js, one workshop groupSection)',
  overviewSource.split('groupSection("workshop"').length === 2 && overviewSource.split(workshopCall).length === 2);
const staticFiles = (dir => { const out = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) out.push(p); } })(dir); return out; })(path.join(worker, 'public', 'static'));
const oldSentenceFiles = staticFiles.filter(file => fs.readFileSync(file).includes(Buffer.from(OLD_WORKSHOP_TEXT, 'utf8'))).map(file => path.relative(repo, file).replace(/\\/g, '/'));
check('ANSWER', 'the old sentence "' + OLD_WORKSHOP_TEXT + '" occurs in no file under worker/public/static (' + staticFiles.length + ' files read as bytes)', staticFiles.length > 100 && oldSentenceFiles.length === 0, oldSentenceFiles.join(','));

// ---------------------------------------------------------------- self-check: an in-memory mutant makes office_25 eligible again
{
  const source = read('worker/src/governance-offices.ts');
  const at = source.indexOf('"key": "office_25",'), start = source.lastIndexOf('\n  {', at), end = source.indexOf('\n  }', at);
  const block = source.slice(start, end);
  const mutantBlock = block.replace(/"applicationEligible": (?:true|false)/, '"applicationEligible": true')
    .replace(/"applicationRoleKeys": \[[^\]]*\]/, '"applicationRoleKeys": [\n      "raider"\n    ]')
    .replace(/"acquisition": "[^"]*"/, '"acquisition": "Apply on /#/vote; acceptance, appointment and access require separate officer review."');
  const unique = at > 0 && source.split('"key": "office_25",').length === 2 && start > 0 && end > at;
  let mutant = null;
  try { if (unique) mutant = workerModules({ 'governance-offices': source.slice(0, start) + mutantBlock + source.slice(end) }); } catch (error) { mutant = null; }
  const verdict = mutant && rulingPredicates(mutant);
  const failing = verdict ? Object.entries(verdict).filter(([, v]) => !v).map(([k]) => k) : [];
  check('SELF-CHECK', 'with office_25 eligible again (in memory), the intent, directory and row predicates fail',
    !!verdict && ['admitted', 'coreRaiderRefused', 'targets', 'standing', 'threeOpen', 'serverRows'].every(k => failing.includes(k)), 'failing: ' + failing.join(','));
  // On the tree before the ruling office_25 is already eligible, so there the mutant equals the real source.
  console.log('     (mutant ' + (mutantBlock === block ? 'equals the real source: office_25 is already eligible here' : 'differs from the real source in the office_25 row') + ')');
}

// ---------------------------------------------------------------- (d) pages drawn by the real app.js and organization-view.js
// The authenticated Worker/SQLite page fixture of frontend_check.cjs (the prefix pinned through frontend_fixture_prefix217.cjs,
// as page_heading_launch218_test.cjs uses it). Two fixture-only seams, each refused unless its boundary is unique:
// the page's two dynamic module imports are served from the real files evaluated in the page's own context (the fixture
// runs app.js as a classic script, where import() has no loader), and the page document gains createElementNS for the
// chart's SVG nodes. No production file is changed and no page helper is replaced.
const frontendSource = fs.readFileSync(path.join(__dirname, 'frontend_check.cjs'), 'utf8');
const starts = [...frontendSource.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts.length !== 1) throw Error('apply1114_frontend_fixture_boundary');
const prefix = frontendSource.slice(0, starts[0].index);
require('./frontend_fixture_prefix217.cjs').historicalFrontendPrefix217(prefix); // throws on any drift of the pinned prefix
const appRead = 'const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
const sandboxLine = '  sandbox.globalThis = sandbox; sandbox.self = sandbox;\n';
if (prefix.split(appRead).length !== 2 || prefix.split(sandboxLine).length !== 2) throw Error('apply1114_frontend_seam_boundary');
function moduleImports1114(source) {
  for (const spec of ['/static/organization-view.js', '/static/organization-overview205.js']) {
    const expression = 'import("' + spec + '")';
    if (source.split(expression).length !== 2) throw Error('apply1114_module_import_boundary');
    source = source.replace(expression, 'globalThis.__module1114("' + spec + '")');
  }
  return source;
}
function module1114(sandbox, spec) {
  const staticRoot = path.join(root, 'public', 'static'), cache = module1114.cache.get(sandbox) || new Map();
  module1114.cache.set(sandbox, cache);
  if (typeof sandbox.document.createElementNS !== 'function') sandbox.document.createElementNS = (_ns, tag) => sandbox.document.createElement(tag);
  const loadSync = name => {
    if (!['organization-view.js', 'organization-overview205.js', 'organization-context205.js'].includes(name)) throw Error('apply1114_unlisted_module ' + name);
    if (cache.has(name)) return cache.get(name).exports;
    const m = { exports: {} }; cache.set(name, m);
    const out = ts.transpileModule(fs.readFileSync(path.join(staticRoot, name), 'utf8'), { compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext('(function(exports, require, module) {\n' + out + '\n})', sandbox, { filename: name })(m.exports, key => loadSync(key.replace(/^\/static\//, '')), m);
    return m.exports;
  };
  return Promise.resolve().then(() => loadSync(spec.replace(/^\/static\//, '')));
}
const prepared = prefix.replace(appRead, 'const APP_JS = (' + moduleImports1114.toString() + ')(fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8"));')
  .replace(sandboxLine, sandboxLine + '  sandbox.__module1114 = spec => module1114(sandbox, spec);\n');

async function pages1114() {
  const local = { n: 0, ok: 0 }, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (kind, name, pass, detail = '') => { local.n++; if (pass) local.ok++; console.log((pass ? 'PASS ' : 'FAIL ') + kind + ' ' + name + (pass || !detail ? '' : ' :: ' + detail)); };
  const CORE = 'Granted by the raid leads. There is no separate application: apply as Raider.', CRAFT = 'There is no separate application: apply as Artisan.';
  await siteUser(MEMBER, { global_name: 'Apply three reader' }); await character(MEMBER, 'Apply Reader', 'Player-1-1114');
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('applicationsOpen','1',?) ON CONFLICT(key) DO UPDATE SET value='1'", now);
  const page = await openPage(MEMBER);
  verdict('INVARIANT', 'the page fixture starts from a genuine authenticated Worker response with the real app.js', page.response.status === 200 && page.boot?.user?.id === MEMBER && !!page.app);
  const mainOf = () => page.app.querySelector('main');
  const texts = [];
  // Organization
  await page.go('#/organization');
  page.document.getElementById('organization-view-style')?.dispatchEvent(new Event('load'));
  const drawn = await waitFor(() => (mainOf()?.querySelectorAll('li.org-office-card') || []).length === 103, 'organization register', 8000);
  const org = mainOf();
  verdict('INVARIANT', 'the Organization page draws all 103 register cards through the real route and module', drawn, org ? org.textContent.slice(0, 160) : 'no main');
  if (org) texts.push(['Organization', org.textContent]);
  const card = key => org?.querySelector('li.org-office-card[data-office-key="' + key + '"]');
  const cardTexts = key => (card(key)?.children || []).filter(c => c.tagName === 'P').map(c => c.textContent);
  const linked = org ? org.querySelectorAll('a[data-office-application]').map(a => a.getAttribute('data-office-application')) : [];
  verdict('RULING', 'no Organization link applies to office_25 (Core Raider), office_27 (Crafter) or office_11 (Bench)', drawn && !linked.some(k => ['office_25', 'office_27', 'office_11'].includes(k)), [...new Set(linked)].join(','));
  verdict('RULING', 'the Core Raider card reads "Standing. ' + CORE + '"', drawn && cardTexts('office_25').includes('Standing. ' + CORE) && !card('office_25').querySelector('a[data-office-application]'), cardTexts('office_25').join(' | '));
  verdict('RULING', 'the Crafter card reads exactly "' + CRAFT + '" and never "Applications accepted"', drawn && cardTexts('office_27').includes(CRAFT) && !card('office_27').textContent.includes('Applications accepted') && !card('office_27').querySelector('a[data-office-application]'), cardTexts('office_27').join(' | '));
  verdict('RULING', 'the Bench card starts its standing line with "Standing."', drawn && cardTexts('office_11').some(t => t.startsWith('Standing.')) && !card('office_11').textContent.includes('Applications accepted'), cardTexts('office_11').join(' | '));
  const row = org?.querySelector('[aria-label="Ordinary applications"]'), rowLinks = row ? row.querySelectorAll('a').map(a => a.getAttribute('href')) : [];
  verdict('RULING', 'the "Ordinary applications" row has exactly #/vote/artisan/office_07, #/vote/raider/new and #/vote/member/new', same([...rowLinks].sort(), ['#/vote/artisan/office_07', '#/vote/member/new', '#/vote/raider/new']), rowLinks.join(','));
  // Owner's answer of 14 Nov 2026, "Artisan only": the Alliance overview (drawn on this page by the real organization-overview205.js).
  const WORKSHOP_NEW = 'Profession coordination and the Artisan application.', WORKSHOP_OLD = 'Profession coordination and the Artisan / Crafter application.';
  const workshopGroups = org ? org.querySelectorAll('details[data-catalog-group="workshop"]') : [];
  const workshopTexts = workshopGroups.length === 1 ? (workshopGroups[0].children || []).filter(c => c.tagName === 'P').map(c => c.textContent) : [];
  verdict('ANSWER', 'the Alliance overview\'s workshop group prints exactly "' + WORKSHOP_NEW + '" and the old sentence appears nowhere on the Organization page',
    drawn && workshopGroups.length === 1 && same(workshopTexts, [WORKSHOP_NEW]) && !org.textContent.includes(WORKSHOP_OLD), workshopGroups.length + ' group(s): ' + workshopTexts.join(' | '));
  // Roles
  await page.go('#/roles');
  await waitFor(() => !!mainOf()?.querySelector('[data-role-family203="raid_standing"]'), 'roles directory', 4000);
  const roles = mainOf();
  if (roles) texts.push(['Roles', roles.textContent]);
  const applyFamilies = roles ? roles.querySelectorAll('button[data-family-apply203]').map(b => b.getAttribute('data-family-apply203')).sort() : [];
  verdict('RULING', 'the Roles page has Apply buttons exactly for artisan, member and raider', same(applyFamilies, ['artisan', 'member', 'raider']), applyFamilies.join(','));
  const standingCard = roles?.querySelector('details[data-role-family203="raid_standing"]');
  verdict('RULING', 'the Raid Team Standing card has no Apply button and its badge reads "Standing"', !!standingCard && !standingCard.querySelector('button[data-family-apply203]') && standingCard.querySelector('summary span.badge')?.textContent === 'Standing',
    standingCard ? standingCard.querySelector('summary span.badge')?.textContent : 'no card');
  // Apply chooser
  await page.go('#/apply');
  await waitFor(() => !!mainOf()?.querySelector('#application-track-chooser228'), 'apply chooser', 4000);
  const chooser = mainOf()?.querySelector('#application-track-chooser228');
  if (mainOf()) texts.push(['Apply', mainOf().textContent]);
  const chooserFamilies = chooser ? chooser.querySelectorAll('a[data-family-apply203]').map(a => a.getAttribute('data-family-apply203')).sort() : [];
  verdict('RULING', 'the Apply chooser offers exactly artisan, member and raider', same(chooserFamilies, ['artisan', 'member', 'raider']), chooserFamilies.join(','));
  verdict('INVARIANT', 'the Apply chooser keeps the optional Member/PvP link', !!chooser?.querySelector('a[data-activity-member203][href="#/vote/member/new"]'));
  const offending = texts.filter(([, t]) => t.includes('Apply as Core Raider') || t.includes('Apply as Crafter')).map(([p]) => p);
  verdict('RULING', '"Apply as Core Raider" and "Apply as Crafter" appear on no rendered page (Organization, Roles, Apply)', texts.length === 3 && offending.length === 0, 'on: ' + offending.join(','));
  // Typed addresses, for a signed-in member with no saved application (nothing here concerns saved applications).
  for (const route of ['#/vote/raider/office_25', '#/vote/artisan/office_27']) {
    await page.go(route); await waitFor(() => !!mainOf()?.textContent.includes('Application track unavailable') || !!mainOf()?.querySelector('form'), route, 4000);
    verdict('RULING', route + ' opens no form and reads "Application track unavailable"', !mainOf()?.querySelector('form') && !mainOf()?.querySelector('[data-target-office]') && mainOf()?.textContent.includes('Application track unavailable'));
  }
  const trackBadges = {};
  for (const [route, office] of [['#/vote/raider/new', null], ['#/vote/artisan/office_07', 'office_07']]) {
    await page.go(route); await waitFor(() => !!mainOf()?.querySelector('form'), route, 4000);
    verdict('INVARIANT', route + ' opens the application form' + (office ? ' with its exact target' : ''), !!mainOf()?.querySelector('form') && (!office || !!mainOf()?.querySelector('[data-target-office="' + office + '"]')));
    const boxes = mainOf() ? mainOf().querySelectorAll('[data-application-track]') : [];
    trackBadges[route] = { boxes: boxes.length, track: boxes[0]?.getAttribute('data-application-track') || null, badges: boxes.length ? (boxes[0].children || []).filter(c => c.tagName === 'SPAN' && /\bbadge\b/.test(c.getAttribute('class') || '') && /\bblue\b/.test(c.getAttribute('class') || '')).map(c => c.textContent) : [] };
    if (mainOf()) texts.push([route, mainOf().textContent]);
  }
  // Owner's answer of 14 Nov 2026, "Drop "Core"": the application view's track badge (applicationBadges199 in the real app.js).
  verdict('ANSWER', 'the raider application view prints the track badge "Raider & PvE Progression Track"; the artisan view keeps "Master Artisan & Guild Workshop Crafter"',
    same(trackBadges['#/vote/raider/new'], { boxes: 1, track: 'raider', badges: ['Raider & PvE Progression Track'] }) && same(trackBadges['#/vote/artisan/office_07'], { boxes: 1, track: 'artisan', badges: ['Master Artisan & Guild Workshop Crafter'] }), JSON.stringify(trackBadges));
  const oldLabelPages = texts.filter(([, t]) => t.includes('Core Raider & PvE Progression Track')).map(([p]) => p);
  verdict('ANSWER', 'the old label "Core Raider & PvE Progression Track" appears on no rendered page (Organization, Roles, Apply, both application views)', texts.length === 5 && oldLabelPages.length === 0, 'on: ' + oldLabelPages.join(','));
  return local;
}

(async () => {
  const pageModule = new Module(__filename, module); pageModule.filename = __filename; pageModule.paths = Module._nodeModulePaths(__dirname);
  pageModule._compile(prepared + '\n' + module1114.toString() + '\nmodule1114.cache = new WeakMap();\nmodule.exports = (' + pages1114.toString() + ')();', __filename);
  const pageResult = await pageModule.exports;
  n += pageResult.n; ok += pageResult.ok;
  console.log('\n' + ok + '/' + n + ' passed');
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error.stack); process.exit(1); });
