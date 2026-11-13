'use strict';
// Evergreen Stage 2 (12 Nov 2026), guides lane: Olympus University. CL2-052 (101/201/301 tracks), CL2-057 (quizzes,
// exams, grading, explanations, scores), CL2-058 (race guides), CL2-059 (the directive's section template), CL2-060
// (Theory paired with Praxis, mistakes and fixes), CL2-202 (class page without a spec), CL2-205 (#/guides is the hub),
// CL2-206 (scores in one localStorage key, clearable and exportable, nothing sent) and CL2-207 (related links).
// Plain Node over the shipped files: the real validator, the real build check and the real renderer in a small DOM shim.
// GUIDES_TEST_ROOT=<checkout> runs the same checks against another checkout (read-only), for the fail-before receipt.
// Run from worker/: node tests/evergreen1112_guides_test.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), cp = require('node:child_process');
const repo = path.resolve(process.env.GUIDES_TEST_ROOT || path.join(__dirname, '../..'));
const worker = path.join(repo, 'worker'), stat = path.join(worker, 'public/static'), uni = path.join(stat, 'university');
// INT-UNI-3 (12 Nov 2026): the university build tools moved out of the published static folder.
const tools = path.join(repo, 'scripts/university');
const readText = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const json = (...p) => JSON.parse(readText(...p));
let passed = 0, failed = 0;
const pending = [];
function check(name, run) {
  pending.push((async () => {
    let ok = false, detail = '';
    try { const result = await run(); ok = result === true; if (!ok) detail = typeof result === 'string' ? result : JSON.stringify(result); }
    catch (error) { detail = error && error.message || String(error); }
    return [name, ok, detail];
  }));
}
const KEY = 'olympus.university.v1';
const DIRECTIVE_ORDER = ['overview', 'talents', 'rotation', 'stat-caps', 'gear', 'consumables', 'macros', 'praxis'];
const rules = () => { const module = { exports: {} }; vm.runInNewContext(readText(uni, 'validate.js'), { module }, { filename: 'validate.js', timeout: 2000 }); return module.exports; };
const listJson = dir => fs.readdirSync(path.join(uni, dir)).filter(f => f.endsWith('.json')).sort().map(f => json(uni, dir, f));
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');

// ---------- Build check, data coverage and the honesty rules ----------
check('the build check (scripts/university/validate.cjs) passes over every university file', () => {
  const r = cp.spawnSync(process.execPath, [path.join(tools, 'validate.cjs'), '--quiet'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 && /university: valid/.test(r.stdout) || (r.stdout + r.stderr).slice(-600);
});
check('the generated talent facts and questions are current (generate-talent-facts.cjs --check)', () => {
  const r = cp.spawnSync(process.execPath, [path.join(tools, 'generate-talent-facts.cjs'), '--check'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 || (r.stdout + r.stderr).slice(-400);
});
// INT-UNI-3 (12 Nov 2026): everything under worker/public/ is served by the assets binding, so a build tool kept there
// would be downloadable. No CommonJS, Python, shell or TypeScript file, no build/ folder and no migration map may remain.
check('INT-UNI-3: no build tool or build-only file remains under worker/public/, and the tools run from scripts/university/', () => {
  const bad = [], walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(worker, p).split(path.sep).join('/');
    if (e.isDirectory()) { if (e.name === 'build') bad.push(rel + '/'); walk(p); }
    else if (/\.(cjs|py|sh|ts|ps1|bat)$/i.test(e.name) || e.name === 'migration-map.json') bad.push(rel);
  } };
  walk(path.join(worker, 'public'));
  const moved = ['validate.cjs', 'generate-talent-facts.cjs', 'migrate-guides218.cjs', 'migration-map.json'].filter(f => !fs.existsSync(path.join(tools, f)));
  return bad.length === 0 && moved.length === 0 || JSON.stringify({ underPublic: bad, missingFromScripts: moved });
});
check('the shared rules use the directive section order and the three tracks', () => {
  const R = rules();
  return JSON.stringify(R.SECTIONS.map(s => s[0])) === JSON.stringify(DIRECTIVE_ORDER) && JSON.stringify(R.TRACKS.map(t => t[0])) === '["101","201","301"]';
});
check('the hub lists 9 classes (27 specs), 5 Alliance races and 12 professions; Warrior, Human and Alchemy are complete', () => {
  const ix = json(uni, 'index.json'), by = k => ix.guides.filter(g => g.kind === k);
  const races = by('race').map(r => r.id).sort().join();
  return by('class').length === 9 && by('class').reduce((n, c) => n + c.specs.length, 0) === 27 && races === 'dwarf,gnome,human,night-elf,skyborne'
    && by('profession').length === 12 && ['warrior', 'human', 'alchemy'].every(id => ix.guides.find(g => g.id === id).status === 'complete')
    || JSON.stringify(ix.guides.map(g => g.kind + ':' + g.id + ':' + g.status));
});
check('every class and profession guide has 101, 201 and 301 tracks whose chapters follow the directive order', () => {
  const ix = json(uni, 'index.json'), bad = [];
  for (const g of ix.guides.filter(x => x.file)) {
    const guide = json(uni, g.file), owners = [guide, ...(guide.specs || [])];
    for (const o of owners) for (const t of ['101', '201', '301']) {
      const track = o.tracks && o.tracks[t];
      if (!track) { bad.push(g.id + ' ' + (o.id || '') + ' ' + t); continue; }
      const order = track.chapters.map(c => DIRECTIVE_ORDER.indexOf(c.section));
      if (order.some((x, i) => x < 0 || (i && x < order[i - 1]))) bad.push(g.id + ' ' + o.id + ' ' + t + ' order');
      const covered = new Set([...track.chapters.map(c => c.section), ...track.omitted.map(o2 => o2.section)]);
      if (DIRECTIVE_ORDER.some(s => !covered.has(s))) bad.push(g.id + ' ' + o.id + ' ' + t + ' coverage');
    }
  }
  return bad.length === 0 || bad.slice(0, 8).join('; ');
});
check('every chapter of the complete guides pairs Theory with Praxis (steps and a mistake with its fix) or says what is unavailable', () => {
  const bad = [];
  for (const file of ['courses/warrior.json', 'races/human.json', 'professions/alchemy.json']) {
    const g = json(uni, file);
    for (const o of [g, ...(g.specs || [])]) for (const t of ['101', '201', '301']) for (const c of o.tracks[t].chapters) {
      if (c.unavailable !== undefined) { if (!c.unavailable || c.praxis) bad.push(c.id); continue; }
      if (!c.theory.length || !c.praxis || !c.praxis.steps.length || !c.praxis.mistakes.length || c.praxis.mistakes.some(m => !m.fix || !m.facts.length)) bad.push(c.id);
    }
  }
  return bad.length === 0 || bad.join(', ');
});
check('every quiz question cites at least one fact, and each Warrior track has an exam pool for the class and each spec', () => {
  const qs = listJson('quizzes').flatMap(d => d.questions);
  const pool = (scope, tier) => qs.filter(q => q.scope === scope && q.tier === tier).length;
  const scopes = ['class:warrior', 'spec:warrior-arms', 'spec:warrior-fury', 'spec:warrior-protection'];
  return qs.every(q => Array.isArray(q.facts) && q.facts.length >= 1) && scopes.every(s => pool(s, 101) > 0 && pool(s, 201) > 0)
    && pool('race:human', 101) > 0 && pool('profession:alchemy', 101) > 0 && pool('profession:alchemy', 201) > 0;
});
check('no grade-A fact in use carries the October snapshot wording, and the Warrior course cites no re-check fact', () => {
  const facts = new Map(listJson('facts').flatMap(d => d.facts.map(f => [f.id, { ...(d.defaults || {}), ...f }])));
  const warrior = JSON.stringify(json(uni, 'courses/warrior.json'));
  const cited = [...warrior.matchAll(/"((?:class-warrior|talents-warrior|common|class-hunter)\.[a-z0-9.-]+)"/g)].map(m => m[1]);
  const stale = cited.filter(id => facts.get(id) && (facts.get(id).recheck || /snapshot|16 Oct snapshot/i.test(facts.get(id).value || '')));
  const unflagged = [...facts.values()].filter(f => f.grade === 'A' && !f.recheck && !(f.sources || []).includes('talents-data'));
  return stale.length === 0 && unflagged.length === 0 || 'stale ' + stale.join(',') + ' unflagged ' + unflagged.map(f => f.id).join(',');
});

function mutateBundle() {
  const R = rules(), ix = json(uni, 'index.json'), entry = ix.guides.find(g => g.id === 'warrior');
  const guide = json(uni, entry.file);
  const bundle = { sources: json(uni, 'sources.json'), factFiles: guide.factFiles.map(f => json(uni, 'facts', f + '.json')), guides: [guide],
    quizFiles: guide.quizFiles.map(f => json(uni, 'quizzes', f + '.json')), presets: json(uni, 'presets/warrior.json') };
  return { R, bundle, guide, quiz: bundle.quizFiles.find(d => d.file === 'class-warrior') };
}
const refused = (mutate, pattern) => () => {
  const { R, bundle, guide, quiz } = mutateBundle();
  if (R.validateBundle(bundle).errors.length) return 'the untouched bundle already fails';
  mutate({ bundle, guide, quiz });
  const errors = R.validateBundle(bundle).errors;
  return errors.some(e => pattern.test(e)) || 'not refused: ' + errors.slice(0, 3).join(' | ');
};
check('the validator refuses an answer its cited facts do not hold', refused(({ quiz }) => { quiz.questions[0].choices[0] = 'Mortal Strike'; }, /is not found in its cited facts/));
check('the validator refuses a question that cites an unavailable (grade U) fact', refused(({ quiz }) => { quiz.questions[0].facts.push('class-warrior.hit-cap-at-level-60'); }, /unavailable \(grade U\)/));
check('the validator refuses a freehand distractor', refused(({ quiz }) => { quiz.questions[0].choices[1] = 'Heroic Leap'; }, /not drawn from a cited or sibling fact/));
check('the validator refuses a distractor fact from another topic', refused(({ quiz }) => { quiz.questions[0].distractorFacts = ['class-warrior.flask-rule']; }, /distractor facts must be siblings/));
check('the validator refuses a Classic reference fact without an "In Classic 1.12" stem', refused(({ quiz }) => {
  const q = quiz.questions.find(x => x.id === 'class-warrior.tank-flask'); q.stem = 'Which flask is a tank staple?';
}, /must start 'In Classic 1.12'/));
check('the validator refuses a question citing a fact marked for re-check', refused(({ bundle, quiz }) => {
  bundle.factFiles.find(d => d.file === 'class-warrior').facts.find(f => f.id === 'class-warrior.change-2').recheck = 'test';
  void quiz;
}, /marked for re-check|re-check fact/));
check('the validator refuses chapters out of the directive order and a section neither covered nor omitted', () => {
  const a = refused(({ guide }) => { guide.specs[0].tracks['101'].chapters.reverse(); }, /section order/)();
  const b = refused(({ guide }) => { guide.specs[0].tracks['101'].omitted.pop(); }, /every section is covered/)();
  return a === true && b === true || [a, b].join(' / ');
});
check('the validator refuses a complete chapter without a mistake and its fix', refused(({ guide }) => { guide.specs[0].tracks['101'].chapters[1].praxis.mistakes = []; }, /at least one mistake/));
check('the validator refuses a praxis step whose number its facts do not hold', refused(({ guide }) => { guide.specs[0].tracks['101'].chapters[1].praxis.steps[2].text = 'Slam has a 12-second cooldown.'; }, /states a number its facts do not hold/));
check('the validator refuses a macro that runs a script (custom scripts stay disabled, 5 Nov ruling)', refused(({ guide }) => {
  const c = guide.specs[0].tracks['101'].chapters[1]; c.macros = [{ name: 'Burst', body: '/run DoSomething()', grade: 'C', facts: ['class-warrior.slam'] }];
}, /script command/));
check('the build refuses a grade-A talent fact whose number is not in the 10 November rank text', () => {
  const { R, bundle } = mutateBundle(), data = json(stat, 'talents/data.json'), talents = new Map();
  for (const c of data.classes) for (const t of c.trees) for (const x of t.talents) talents.set(x.id, x);
  const f = bundle.factFiles.find(d => d.file === 'class-warrior').facts.find(x => x.id === 'class-warrior.weaponmaster-at-5-5');
  f.value = f.value.replace('15%', '25%');
  return R.validateBundle(bundle, { talents }).errors.some(e => /not in Weaponmaster's current rank text/.test(e));
});
check('CL2-203: class quests, baseline spells, unconfirmed reports and myths are separate chapters (Priest, Paladin, Druid)', () => {
  const chapters = cls => { const g = json(uni, 'courses', cls + '.json'); return new Map(g.tracks['101'].chapters.map(c => [c.id, c.theory])); };
  const priest = chapters('priest'), paladin = chapters('paladin'), druid = chapters('druid');
  const facts = new Map(['priest', 'paladin', 'druid'].flatMap(c => json(uni, 'facts', 'class-' + c + '.json').facts.map(f => [f.id, f])));
  const quests = [...priest.get('priest-101-class-quests'), ...paladin.get('paladin-101-class-quests'), ...druid.get('druid-101-class-quests')].map(id => facts.get(id).label);
  return quests.every(l => !/Not applicable|^No quest needed|^Must be |Unconfirmed/.test(l))
    && priest.get('priest-101-myths').some(id => /Shadowmourne/.test(facts.get(id).label)) && priest.get('priest-101-baseline-spells').length === 2
    && paladin.get('paladin-101-unconfirmed').length >= 1 && druid.get('druid-101-unconfirmed').length >= 1 || JSON.stringify(quests);
});
check('the migration recorded every .218 class and profession entry it moved', () => {
  const g = json(stat, 'guides218.json'), map = json(tools, 'migration-map.json').entries.map(e => e.from);
  const want = [];
  g.classes.forEach((c, ci) => {
    c.changes.forEach((_, i) => want.push(`classes[${ci}].changes[${i}]`)); c.classQuests.forEach((_, i) => want.push(`classes[${ci}].classQuests[${i}]`));
    c.specs.forEach((s, si) => { for (const k of ['priorities', 'raid', 'consumables']) s.pro[k].forEach((_, i) => want.push(`classes[${ci}].specs[${si}].pro.${k}[${i}]`));
      for (const k of ['rotation', 'leveling', 'tips']) s.beginner[k].forEach((_, i) => want.push(`classes[${ci}].specs[${si}].beginner.${k}[${i}]`)); });
  });
  g.professions.forEach((p, pi) => { for (const k of ['changes', 'leveling', 'raidValue', 'unknowns']) p[k].forEach((_, i) => want.push(`professions[${pi}].${k}[${i}]`)); });
  const missing = want.filter(w => !map.includes(w));
  return missing.length === 0 || missing.length + ' missing, e.g. ' + missing.slice(0, 5).join(', ');
});

// ---------- Renderer source rules ----------
check('university.js and validate.js build DOM without HTML strings, eval or a random draw', () => {
  const bad = [];
  for (const f of ['university.js', 'validate.js']) {
    const src = strip(readText(uni, f));
    for (const re of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function/, /Math\.random/, /sessionStorage/, /indexedDB/i, /\.style\./])
      if (re.test(src)) bad.push(f + ' ' + re);
  }
  return bad.length === 0 || bad.join(', ');
});
check('scores use one localStorage key, every storage call sits inside try, and nothing is posted', () => {
  const src = strip(readText(uni, 'university.js'));
  const calls = src.split('\n').filter(l => /localStorage/.test(l));
  return src.split('"' + KEY + '"').length === 2 && calls.length >= 3 && calls.every(l => /try \{[^}]*localStorage/.test(l))
    && !/method:\s*["']POST|sendBeacon|XMLHttpRequest/.test(src) && (src.match(/fetch\(/g) || []).length === 1 || calls.join('\n');
});
check('guides218.js no longer prints the beta snapshot wording and still accepts guides218.json', () => {
  const src = readText(stat, 'guides218.js'), ctx = {}; ctx.window = ctx;
  vm.runInNewContext(src, ctx, { filename: 'guides218.js' });
  const g = json(stat, 'guides218.json'); ctx.OlympusGuides.validate(g, g.talentRevision);
  return !/Beta snapshot build|From the talent snapshot|Beta talent data|Beta talents compared/.test(src) && !/closed in the beta/.test(g.tools.preBis.note) || 'stale wording remains';
});
check('app.js routes #/guides to the university, the library to #/guides/library, #/resources to the hub and tools to guides218.js', () => {
  const app = readText(stat, 'app.js');
  const route = /ROUTES\.guides = \(main, parts\) => parts\.length === 1 && parts\[0\] === "library" \? resourcesView\("guides"\)\(main\)\s*: parts\[0\] === "tools" \? guidesView218\(main, parts\) : universityView\(main, parts\);/.test(app);
  return route && /ROUTES\.resources = \(main, parts\) => parts\.length \? [^\n]*: universityView\(main, \[\]\);/.test(app)
    && /\["#\/guides", "Olympus University"\]/.test(app) && /\["#\/guides\/library", "Publisher library"\]/.test(app)
    && /loadMemberScript\("OlympusUniversityRules", "\/static\/university\/validate\.js"\)/.test(app);
});
check('the privacy policy says quiz scores stay in the browser, and the generated policy module matches', () => {
  const html = readText(repo, 'policies/privacy.html'), mod = readText(worker, 'src/policy-content.ts');
  const r = cp.spawnSync(process.execPath, [path.join(worker, 'scripts/build-policy-content.mjs'), '--check'], { cwd: worker, encoding: 'utf8', timeout: 60000 });
  return /Olympus University quiz scores\.<\/strong> Your answers and best scores[^<]*never sent to Olympus/.test(html) && /Olympus University quiz scores/.test(mod) && r.status === 0 || (r.stdout + r.stderr).slice(-300);
});

// ---------- The real renderer in a small DOM shim ----------
class Node {
  constructor(doc, tag, text) { this.ownerDocument = doc; this.nodeType = tag ? 1 : 3; this.tagName = tag ? tag.toUpperCase() : '#text'; this.childNodes = []; this.parentNode = null; this.attrs = {}; this.listeners = {}; this._text = text || ''; this._checked = false; }
  get value() { return this._value !== undefined ? this._value : (this.attrs.value || ''); } set value(v) { this._value = String(v); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get textContent() { return this.nodeType === 3 ? this._text : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this.childNodes = []; if (v !== '') this.appendChild(new Node(this.ownerDocument, null, String(v))); }
  get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = String(v); }
  get id() { return this.attrs.id || ''; }
  get hidden() { return 'hidden' in this.attrs; } set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get disabled() { return 'disabled' in this.attrs; } set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
  get checked() { return this._checked; } set checked(v) { this._checked = !!v; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.childNodes.push(n); return n; }
  replaceChildren(...nodes) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; for (const n of nodes) this.appendChild(typeof n === 'string' ? new Node(this.ownerDocument, null, n) : n); }
  remove() { if (this.parentNode) { this.parentNode.childNodes = this.parentNode.childNodes.filter(n => n !== this); this.parentNode = null; } }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); } removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  dispatch(t) { const ev = { type: t, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const fn of this.listeners[t] || []) fn(ev); return ev; }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; } select() {} scrollIntoView() {}
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  matches(sel) {
    const m = /^([a-z0-9]*)((?:\[[^\]]+\])*)(?:\.([a-z0-9-]+))?$/i.exec(sel.trim()); if (!m) throw Error('selector ' + sel);
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    if (m[3] && !this.className.split(' ').includes(m[3])) return false;
    for (const a of m[2].match(/\[[^\]]+\]/g) || []) { const [, k, v] = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(a); if (!(k in this.attrs) || (v !== undefined && this.attrs[k] !== v)) return false; }
    return true;
  }
  querySelectorAll(sel) { return this.all().filter(n => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function page(storage) {
  const doc = { activeElement: null, createElement: tag => new Node(doc, tag), createTextNode: t => new Node(doc, null, t) };
  const container = new Node(doc, 'div');
  const store = new Map(), log = [];
  const localStorage = storage === 'throws' ? { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } }
    : { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { log.push(k); store.set(k, String(v)); }, removeItem: k => { store.delete(k); } };
  const requests = [];
  const files = new Map();
  const fetch = async (url, init) => {
    requests.push([url, init && init.method || 'GET']);
    const rel = url.replace(/^\/static\/university\//, '');
    if (rel === url || rel.includes('..')) return { ok: false, status: 404, json: async () => ({}) };
    const body = files.has(rel) ? files.get(rel) : JSON.parse(readText(uni, rel));
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  const ctx = { document: doc, fetch, localStorage, navigator: { clipboard: { writeText: async () => {} } }, console };
  ctx.window = ctx;
  vm.runInNewContext(readText(uni, 'validate.js'), ctx, { filename: 'validate.js' });
  vm.runInNewContext(readText(uni, 'university.js'), ctx, { filename: 'university.js' });
  return { ctx, doc, container, store, log, requests, files };
}
const settle = async (p, until) => { for (let i = 0; i < 200; i++) { await new Promise(r => setImmediate(r)); if (until(p)) return true; } return false; };
async function open(parts, storage, prepare) {
  const p = page(storage);
  if (prepare) prepare(p);
  p.ctx.OlympusUniversity.mount(p.container, { parts, talentRevision: json(stat, 'guides218.json').talentRevision, canAttach: true, onAttach() {} });
  await settle(p, x => !/Opening Olympus University/.test(x.container.textContent));
  return p;
}
const text = n => n ? n.textContent : '';
const quizzes = () => new Map(listJson('quizzes').flatMap(d => d.questions.map(q => [q.id, q])));
function answer(box, q, right) {
  const want = right ? q.choices[q.answer] : q.choices.find((_, i) => i !== q.answer);
  const label = box.querySelectorAll('label').find(l => l.textContent === want);
  box.querySelectorAll('input').find(i => i.id === label.getAttribute('for')).checked = true;
}

check('renderer: the hub lists classes Druid to Warrior, races, professions by group, the hub tools, the exam index, scores and resources', async () => {
  const p = await open([]);
  const h2 = p.container.querySelectorAll('h2').map(text), classes = p.container.querySelectorAll('section')[0].querySelectorAll('h3').map(text).map(s => s.trim());
  const groups = p.container.querySelectorAll('h3').map(text).filter(t => ['Primary crafting', 'Gathering', 'Secondary'].includes(t));
  const hrefs = p.container.querySelectorAll('a').map(a => a.getAttribute('href'));
  const jumps = p.container.querySelectorAll('button').filter(b => 'data-jump' in b.attrs).map(b => b.getAttribute('data-jump'));
  const want = ['Class guides', 'Race guides', 'Profession guides', 'Hub tools', 'Mastery exams', 'Your scores', 'More resources'];
  const ix = json(uni, 'index.json'), exams = ix.guides.reduce((n, g) => n + (g.exams || []).length, 0);
  return text(p.container.querySelector('h1')) === 'Olympus University' && JSON.stringify(h2) === JSON.stringify(want)
    && JSON.stringify(classes) === JSON.stringify([...classes].sort()) && classes[0] === 'Druid' && classes[8] === 'Warrior' && groups.join() === 'Primary crafting,Gathering,Secondary'
    && !/Not written yet\.|Full course with quizzes/.test(p.container.textContent) && new RegExp(exams + ' exams').test(p.container.textContent)
    && ['#/guides/exams', '#/guides/tools/attunements', '#/guides/tools/buffs', '#/guides/tools/raid-structure', '#/guides/tools/changes', '#/talents', '#/addons', '#/roles', '#/governance'].every(h => hrefs.includes(h))
    && jumps.length === 5 && jumps.every(id => p.container.querySelector('section[id="' + id + '"]'))
    && p.requests.every(([url, method]) => method === 'GET' && url === '/static/university/index.json') || JSON.stringify({ h2, classes, groups, jumps });
});
check('renderer: the exam index lists every exam in index.json in the hub order, links each one and shows this browser\'s best', async () => {
  const ix = json(uni, 'index.json');
  const p = await open(['exams'], undefined, x => x.store.set(KEY, JSON.stringify({ v: 1, q: {}, best: { 'spec:warrior-arms:101': 70 }, x: {} })));
  const links = p.container.querySelectorAll('a').map(a => a.getAttribute('href')).filter(h => /^#\/guides\/exam\//.test(h));
  const want = ix.guides.flatMap(g => (g.exams || []).map(x => '#/guides/exam/' + x.scope.replace(':', '-') + '/' + x.tier));
  const groups = p.container.querySelectorAll('article').map(a => text(a.querySelector('h3')).trim());
  const classes = groups.slice(0, 9), races = groups.slice(9, 14);
  const arms = p.container.querySelectorAll('a').find(a => a.getAttribute('href') === '#/guides/exam/spec-warrior-arms/101');
  return text(p.container.querySelector('h1')) === 'Mastery exams' && links.length === want.length && want.every(h => links.includes(h))
    && JSON.stringify(classes) === JSON.stringify([...classes].sort()) && classes[0] === 'Druid' && JSON.stringify(races) === JSON.stringify([...races].sort())
    && /best 70%/.test(text(arms)) && /your best 70%/.test(arms.getAttribute('aria-label'))
    && p.requests.every(([url]) => url === '/static/university/index.json') || JSON.stringify({ n: links.length, want: want.length, groups });
});
check('the exam index in index.json equals the pools the pages draw from (one shared rule in validate.js)', () => {
  const R = rules(), ix = json(uni, 'index.json'), bad = [];
  for (const entry of ix.guides.filter(g => g.file)) {
    const guide = json(uni, entry.file);
    const b = R.validateBundle({ sources: json(uni, 'sources.json'), factFiles: guide.factFiles.map(f => json(uni, 'facts', f + '.json')), guides: [guide],
      quizFiles: guide.quizFiles.map(f => json(uni, 'quizzes', f + '.json')), presets: entry.kind === 'class' ? json(uni, 'presets', entry.id + '.json') : undefined });
    if (JSON.stringify(R.examCatalogue(guide, b.questions)) !== JSON.stringify(entry.exams)) bad.push(entry.id);
  }
  return bad.length === 0 || bad.join(', ');
});
check('renderer: #/guides/class/warrior shows the class course with "Class course" current, not the first spec (CL2-202)', async () => {
  const p = await open(['class', 'warrior']);
  const current = p.container.querySelectorAll('a').filter(a => a.getAttribute('aria-current') === 'page').map(text);
  return text(p.container.querySelector('h1')) === 'Warrior' && current.includes('Class course') && current.includes('101 Foundations') || JSON.stringify(current);
});
check('renderer: a spec track renders Overview, the track, the sections in directive order, the exam and related links', async () => {
  const p = await open(['class', 'warrior', 'arms', '201']);
  const h2 = p.container.querySelectorAll('h2').map(text);
  const want = ['Overview', 'Course tracks', '201 Intermediate', 'Talents', 'Stat caps', 'Pre-BiS and BiS', 'Consumables', 'PvP and raid praxis', 'Mastery exam', 'Related'];
  const chapters = p.container.querySelectorAll('article').filter(a => 'data-chapter' in a.attrs && !('data-unavailable' in a.attrs));
  const paired = chapters.every(a => { const h4 = a.querySelectorAll('h4').map(text); return h4.includes('Theory') && h4.includes('Praxis') && h4.includes('Common mistakes') && h4.includes('Check yourself'); });
  const unavailable = p.container.querySelectorAll('article').filter(a => 'data-unavailable' in a.attrs).map(text);
  return JSON.stringify(h2) === JSON.stringify(want) && chapters.length >= 5 && paired && unavailable.some(t => /Not available yet/.test(t)) || JSON.stringify(h2);
});
check('renderer: a chapter quiz grades instantly with the explanation and cited facts, and records the score in one key', async () => {
  const p = await open(['class', 'warrior', 'arms', '101', 'warrior-arms-101-rotation']);
  const Q = quizzes(), chapter = p.container.querySelector('article[data-chapter="warrior-arms-101-rotation"]');
  const boxes = chapter.querySelectorAll('fieldset');
  answer(boxes[0], Q.get(boxes[0].getAttribute('data-question')), true);
  boxes[0].querySelector('button').click();
  answer(boxes[1], Q.get(boxes[1].getAttribute('data-question')), false);
  boxes[1].querySelector('button').click();
  const saved = JSON.parse(p.store.get(KEY)), ids = boxes.map(b => b.getAttribute('data-question'));
  return boxes[0].getAttribute('data-correct') === 'true' && /Correct\./.test(text(boxes[0])) && /Based on:/.test(text(boxes[0]))
    && boxes[1].getAttribute('data-correct') === 'false' && /The answer is: /.test(text(boxes[1])) && boxes[0].querySelectorAll('input').every(i => i.disabled)
    && saved.v === 1 && saved.q[ids[0]].a === 1 && saved.q[ids[0]].c === 1 && saved.q[ids[1]].c === 0 && [...p.store.keys()].join() === KEY
    && p.doc.activeElement && p.doc.activeElement.getAttribute('id') === 'chapter-warrior-arms-101-rotation' || JSON.stringify({ ids, saved });
});
check('renderer: a quiz question is a fieldset with a legend and labelled radio inputs (keyboard and screen-reader semantics)', async () => {
  const p = await open(['class', 'warrior', '101']);
  const boxes = p.container.querySelectorAll('fieldset');
  return boxes.length > 0 && boxes.every(b => b.querySelector('legend') && b.querySelectorAll('input').every(i => i.getAttribute('type') === 'radio' && b.querySelectorAll('label').some(l => l.getAttribute('for') === i.getAttribute('id')))
    && b.querySelector('div[aria-live="polite"]'));
});
check('renderer: the mastery exam draws a fixed set per attempt, grades on submit and keeps the best score', async () => {
  const Q = quizzes();
  const p = await open(['exam', 'spec-warrior-arms', '101']);
  const ids = p.container.querySelectorAll('fieldset').map(b => b.getAttribute('data-question'));
  const again = (await open(['exam', 'spec-warrior-arms', '101'])).container.querySelectorAll('fieldset').map(b => b.getAttribute('data-question'));
  for (const b of p.container.querySelectorAll('fieldset')) answer(b, Q.get(b.getAttribute('data-question')), true);
  p.container.querySelector('form').dispatch('submit');
  const best = JSON.parse(p.store.get(KEY)).best['spec:warrior-arms:101'];
  const next = await open(['exam', 'spec-warrior-arms', '101'], undefined, x => x.store.set(KEY, JSON.stringify({ v: 1, q: {}, best: {}, x: { 'spec:warrior-arms:101': 1 } })));
  const nextIds = next.container.querySelectorAll('fieldset').map(b => b.getAttribute('data-question'));
  return ids.length === 10 && JSON.stringify(ids) === JSON.stringify(again) && best === 100 && /10 of 10 \(100%\)/.test(text(p.container.querySelector('div[role="status"]')))
    && JSON.stringify(nextIds) !== JSON.stringify(ids) && JSON.stringify([...nextIds].sort()) !== JSON.stringify([...ids].sort()) || JSON.stringify({ n: ids.length, best, ids, nextIds });
});
// Review of 12 Nov 2026: "Take a new exam" and "New set of questions" must bring new questions, not the same set reordered.
check('a new attempt draws a different set of questions, and ten attempts reach most of every exam and chapter pool', () => {
  const R = rules(), ix = json(uni, 'index.json'), bad = [];
  let pool = 0, reached = 0, choiceStuck = 0, questions = 0;
  for (const g of ix.guides.filter(x => x.file)) {
    const guide = json(uni, g.file), qs = guide.quizFiles.flatMap(f => json(uni, 'quizzes', f + '.json').questions);
    for (const x of g.exams || []) {
      const p = R.examPool(qs, x.scope, x.tier, g.kind === 'class' ? g.id : null);
      if (p.length <= 10) continue;
      const draw = a => R.order(p, q => q.id, a).slice(0, 10).map(q => q.id).sort().join();
      if (draw(0) === draw(1)) bad.push(x.scope + ':' + x.tier + ' attempt 1 = attempt 0');
      const all = new Set(); for (let a = 0; a < 10; a++) R.order(p, q => q.id, a).slice(0, 10).forEach(q => all.add(q.id));
      pool += p.length; reached += all.size;
    }
    const byChapter = new Map(); for (const q of qs) { if (!byChapter.has(q.chapter)) byChapter.set(q.chapter, []); byChapter.get(q.chapter).push(q); }
    for (const [id, p] of byChapter) if (p.length > 5) {
      const draw = a => R.order(p, q => q.id, a).slice(0, 5).map(q => q.id).sort().join();
      if ([1, 2, 3].every(a => draw(a) === draw(0))) bad.push(id + ' chapter quiz never changes');
    }
    for (const q of qs) { questions++; const seen = new Set(); for (let a = 0; a < 10; a++) seen.add(R.order(q.choices.map((t, i) => i), i => q.id + ':' + i, a).join()); if (seen.size === 1) choiceStuck++; }
  }
  return bad.length === 0 && reached >= 0.85 * pool && choiceStuck === 0 || JSON.stringify({ bad: bad.slice(0, 6), nBad: bad.length, pool, reached, choiceStuck, questions });
});
check('renderer: "Export my scores" shows the stored JSON and "Clear my scores" (confirmed) removes the key', async () => {
  const p = await open([], undefined, x => x.store.set(KEY, JSON.stringify({ v: 1, q: { 'class-warrior.affray': { a: 2, c: 1 } }, best: { 'class:warrior:101': 80 }, x: {} })));
  const button = name => p.container.querySelectorAll('button').find(b => text(b) === name);
  const listed = /Warrior 101 Foundations exam: best 80%/.test(p.container.textContent);
  button('Export my scores').click();
  const exported = p.container.querySelector('textarea').value;
  button('Clear my scores').click();
  const stillThere = p.store.has(KEY);
  button('Yes, clear all my scores').click();
  await settle(p, () => true);
  return JSON.parse(exported).best['class:warrior:101'] === 80 && stillThere && !p.store.has(KEY) && listed;
});
check('renderer: with storage blocked the quiz still grades and the page says scores last only for the visit', async () => {
  const p = await open(['race', 'human'], 'throws');
  const Q = quizzes(), box = p.container.querySelector('fieldset');
  answer(box, Q.get(box.getAttribute('data-question')), true); box.querySelector('button').click();
  const hub = await open([], 'throws');
  return box.getAttribute('data-correct') === 'true' && /not keeping scores/.test(hub.container.textContent);
});
check('renderer: every .218 class, spec and profession link and every race opens its course with no error', async () => {
  const g = json(stat, 'guides218.json'), routes = [];
  for (const c of g.classes) { routes.push(['class', c.id]); for (const sp of c.specs) routes.push(['class', c.id, sp.id]); }
  for (const pr of g.professions) routes.push(['profession', pr.key]);
  for (const r of ['dwarf', 'gnome', 'human', 'night-elf', 'skyborne']) routes.push(['race', r]);
  const bad = [];
  for (const parts of routes) {
    const p = await open(parts), h1 = text(p.container.querySelector('h1'));
    if (!h1 || / not found$/.test(h1) || p.container.querySelector('p[role="alert"]') || /There is no such|carried over from the earlier/.test(p.container.textContent)) bad.push(parts.join('/') + ' :: ' + (h1 || text(p.container).slice(0, 80)));
  }
  const frost = await open(['class', 'mage', 'frost']);
  return bad.length === 0 && routes.length === 9 + 27 + 12 + 5 && text(frost.container.querySelector('h1')) === 'Frost Mage' || bad.slice(0, 6).join(' | ') || routes.length;
});
check('renderer: an unwritten race says so, and an unknown guide or chapter is refused', async () => {
  // Every race is written now; a planned index entry must still render "not written yet" and load no course file.
  const planned = x => { const ix = json(uni, 'index.json'), d = ix.guides.find(g => g.id === 'dwarf'); d.status = 'planned'; d.file = null; delete d.exams; delete d.chapters; x.files.set('index.json', ix); };
  const a = await open(['race', 'dwarf'], undefined, planned), b = await open(['class', 'warrior', 'nope']), c = await open(['class', 'warrior', 'arms', '101', 'missing-chapter']), d = await open(['race', 'orc']);
  const h1 = x => x.container.querySelectorAll('h1').map(text);
  return /has not been written yet/.test(a.container.textContent) && a.requests.length === 1
    && JSON.stringify([b, c, d].map(h1)) === '[["Spec not found"],["Chapter not found"],["Race guide not found"]]' && !c.container.querySelector('fieldset') || JSON.stringify([b, c, d].map(h1));
});
// INT-UNI-1 / CL2-105 (12 Nov 2026): every university address that names nothing renders one H1 ending in "not found",
// one role="status" sentence and a link back to #/guides, and loads no course file it does not need.
check('INT-UNI-1: an unknown class, spec, profession, race, track, chapter, exam or page renders one "… not found" H1, a status sentence and a way back', async () => {
  const cases = [['class/no-such-class', 'Class guide not found'], ['class/warrior/nope', 'Spec not found'], ['profession/no-such-profession', 'Profession guide not found'],
    ['race/orc', 'Race guide not found'], ['class/warrior/401', 'Track not found'], ['class/warrior/arms/999', 'Track not found'], ['race/human/401', 'Track not found'],
    ['class/warrior/arms/101/missing-chapter', 'Chapter not found'], ['race/human/101/Bad_Chapter!', 'Chapter not found'], ['exam/spec-warrior-nope/101', 'Exam not found'],
    ['exam/class-nope/101', 'Exam not found'], ['exam/class-warrior/401', 'Exam not found'], ['nonsense', 'Guide not found'], ['class/warrior/arms/101/x/y', 'Page not found']];
  const bad = [];
  for (const [route, want] of cases) {
    const p = await open(route.split('/')), h1 = p.container.querySelectorAll('h1').map(text);
    const status = p.container.querySelectorAll('[role="status"]').map(text).filter(Boolean), back = p.container.querySelectorAll('a').some(a => a.getAttribute('href') === '#/guides' && /Back to Olympus University/.test(text(a)));
    if (JSON.stringify(h1) !== JSON.stringify([want]) || status.length !== 1 || !/\.$/.test(status[0]) || !back || p.container.querySelector('[role="alert"]')) bad.push(route + ' :: ' + JSON.stringify({ h1, status, back }));
  }
  return bad.length === 0 || bad.join(' | ');
});
check('renderer: the Related rail links the talent calculator, hub tools, the Class Lead office, the Workshop charter and the exam index (CL2-207)', async () => {
  const hrefs = async parts => (await open(parts)).container.querySelector('nav[aria-label="Related"]').querySelectorAll('a').map(a => a.getAttribute('href'));
  const cls = await hrefs(['class', 'druid', 'balance']), prof = await hrefs(['profession', 'tailoring']), race = await hrefs(['race', 'gnome']);
  return ['#/talents/druid', '#/guides/tools/attunements', '#/guides/tools/buffs', '#/guides/tools/raid-structure', '#/guides/profession/alchemy', '#/roles/class_lead:druid', '#/guides/exams'].every(h => cls.includes(h))
    && ['#/guides/tools/buffs', '#/roles/artisan', '#/governance/title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord', '#/guides/exams'].every(h => prof.includes(h))
    && race.filter(h => /^#\/guides\/class\//.test(h)).length === 9 || JSON.stringify({ cls, prof, race });
});
check('renderer: a course file that breaks the honesty rule is not shown at all (closed validation)', async () => {
  const p = await open(['race', 'human'], undefined, x => { const q = json(uni, 'quizzes/race-human.json'); q.questions[0].choices[0] = '+5% crit'; x.files.set('quizzes/race-human.json', q); });
  return /did not pass its checks/.test(p.container.textContent) && !p.container.querySelector('fieldset');
});
check('renderer: presets show "Talent build" (not "Beta snapshot build") with Attach for current codes', async () => {
  const p = await open(['class', 'warrior', 'fury', '201']);
  const cards = p.container.querySelectorAll('article[data-preset]');
  return cards.length >= 1 && cards.every(c => /Talent build · Level/.test(c.textContent) && !/Beta snapshot/.test(c.textContent) && c.querySelectorAll('button').some(b => text(b) === 'Attach to my application'));
});

// ---------- Review repairs (12 Nov 2026): two reviewers' content and behaviour findings on the lane ----------
const allFacts = () => new Map(listJson('facts').flatMap(d => d.facts.map(f => [f.id, { ...(d.defaults || {}), ...f }])));
const guideFiles = () => ['courses', 'races', 'professions'].flatMap(d => fs.readdirSync(path.join(uni, d)).filter(f => f.endsWith('.json')).map(f => json(uni, d, f)));
const chaptersOf = g => [g, ...(g.specs || [])].flatMap(o => ['101', '201', '301'].flatMap(t => o.tracks[t].chapters));
// REV-UNI-4 (12 Nov 2026): a re-run of the reviewer's comparison over the base guides218.json (dfca7a2) found these old
// lines with no trace in the university: no fact, step or question carries them and no heldBack record holds them (one
// had only its "(1 Oct)" date recorded). None has a per-line source, so each is held back with its reason. A record
// counts only when it holds at least half of the line, so a date fragment cannot stand in for a whole claim.
const REV_UNI_4_DROPS = [
  ['warrior', 'classes[0].specs[0].beginner.leveling[0]', "Warcraft Tavern's author calls Arms the traditional leveling pick and prefers Bloodthrill over Weaponmaster while leveling."],
  ['warrior', 'classes[0].specs[1].beginner.leveling[0]', 'Warcraft Tavern rates every Warrior spec viable for leveling but says Fury takes more damage and has more downtime.'],
  ['warrior', 'classes[0].specs[1].beginner.tips[1]', 'Queuing Heroic Strike no longer raises your off-hand hit chance in Forever.'],
  ['warrior', 'classes[0].specs[1].beginner.tips[2]', 'Unbridled Wrath no longer doubles its Rage with two-handed weapons.'],
  ['warrior', 'classes[0].specs[1].pro.raid[2].note', "Blizzard's 30 Sep deep dive also had it make Whirlwind hit with both weapons; the snapshot text no longer mentions that."],
  ['warrior', 'classes[0].specs[1].pvp.overview[0]', 'Warcraft Tavern says Fury has no real PvP tools, and that Berserker Stance and Death Wish leave it fragile.'],
  ['warrior', 'classes[0].specs[2].beginner.leveling[0]', 'Warcraft Tavern rates all three Warrior specs viable for leveling, but its Protection guide says the spec does poorly when you are not tanking.'],
  ['warrior', 'classes[0].specs[2].pvp.overview[0]', 'Protection is built for dungeons and raids; Warcraft Tavern says it does poorly when you are not tanking.'],
  ['warrior', 'classes[0].specs[2].beginner.tips[2]', "Thunder Clap's threat was lowered to balance its new damage, so pair it with Demoralizing Shout on big pulls."],
  ['warrior', 'classes[0].specs[2].beginner.leveling[2]', 'Rend and Sunder Armor tag mobs instantly (1 Oct), so you claim shared quest mobs quickly.'],
  ['warlock', 'classes[7].specs[2].beginner.leveling[0]', 'Warcraft Tavern rates Destruction the hardest of the three to level alone and recommends Affliction for leveling.'],
  ['druid', 'classes[8].specs[1].beginner.rotation[4]', 'In Bear Form, use Swipe when you need threat on several targets.'],
];
const heldNorm = s => String(s).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
const holds = (h, from, text) => h.from.split(/,\s*/).includes(from) && heldNorm(h.text).length >= 0.5 * heldNorm(text).length && (heldNorm(h.text).includes(heldNorm(text)) || heldNorm(text).includes(heldNorm(h.text)));
check('REV-UNI-4: every old line the migration dropped with no trace has a heldBack record that holds it, with a reason', () => {
  const bad = REV_UNI_4_DROPS.filter(([course, from, text]) => !(json(uni, 'courses', course + '.json').heldBack || []).some(h => holds(h, from, text) && h.reason.length > 20)).map(x => x[1]);
  const fragment = !holds({ from: 'classes[0].specs[2].beginner.leveling[2]', text: '(1 Oct)' }, REV_UNI_4_DROPS[9][1], REV_UNI_4_DROPS[9][2]);
  return bad.length === 0 && fragment || JSON.stringify({ notHeld: bad, fragmentRefused: fragment });
});

// CONTENT-01 and CONTENT-09 (12 Nov 2026): Blizzard's hotfixes of 6 and 10 November 2026 (one dated source, g218-156 in
// both catalogues) lowered the Tanning Rack to skill 125, let weapon imbues and weapon totems work together, set
// Stormstrike to 100% weapon damage on an 8 sec cooldown, Mental Dexterity to 33/66/100%, Maelstrom Weapon to 20% per
// stack at every rank, and made Wrack speed up Siphon Life, Corruption and Bane of Agony instead of adding 10%.
// An earlier review (12 Nov) had marked the talent data as superseded by the 2 Nov notes; the hotfix proves the reverse.
const HOTFIX_URL = 'https://worldofwarcraft.blizzard.com/en-us/news/24315281/wow-forever-hotfixes-november-11-2026';
// A stale claim is refused unless its own sentence dates it as history ("had", "was", "until", "before").
const HOTFIX_STALE = [/Tanning Rack at 140|skill-140 camp object/i, /matching (?:weapon )?imbue,? (?:you )?gets? nothing|(?:get|gets|expect) nothing from (?:a|the|that) [^.]*totem/i,
  /150% normalized/i, /Stormstrike[^.]*six-second|six-second cooldown/i, /50%, 100% or 150%/, /triggers twice as often|doubled the chance for Maelstrom/i,
  /4% per stack/i, /other Shadow DoTs[^.]*10%|10% harder/i, /Wrack \(snapshot\)|36 Shadow damage/i, /check the tooltip in game|Go by the tooltip in game/i];
const historical = sentence => /\b(?:had|was|were|until|before)\b/i.test(sentence);
const staleHotfixClaims = strings => strings.flatMap(([where, s]) => s.split(/(?<=[.;!?])\s+|\(|\)/).filter(x => !historical(x) && HOTFIX_STALE.some(re => re.test(x))).map(x => where + ': ' + x.slice(0, 100)));
check('CONTENT-01/09: one dated Blizzard hotfix source in both catalogues, and the hotfixed facts state what the site\'s talent data and that source say', () => {
  const g = json(stat, 'guides218.json'), S = new Map(json(uni, 'sources.json').sources.map(s => [s.id, s])), F = allFacts(), data = json(stat, 'talents/data.json'), bad = [];
  const tal = new Map(data.classes.flatMap(c => c.trees.flatMap(t => t.talents.map(x => [x.id, x]))));
  const hs = S.get('g218-156');
  if (!g.sources[156] || g.sources[156].url !== HOTFIX_URL || g.sources[156].kind !== 'official' || g.sources[156].checkedAt !== '2026-11-12' || !hs || hs.url !== HOTFIX_URL || hs.label !== g.sources[156].label) bad.push('hotfix source');
  const want = { 'profession-leatherworking.camp-objects': /Tanning Rack at 125/, 'profession-leatherworking.tanning-rack-skill': /6 November 2026 lowered the Tanning Rack's skill requirement to 125 \(it was 140\)/,
    'class-shaman.imbues-with-totems': /weapon imbues and weapon totems work at the same time/, 'class-shaman.stormstrike': /100% weapon damage and has an 8-second cooldown/,
    'class-shaman.change-7': /Stormstrike deals 100% weapon damage on an 8-second cooldown/, 'class-shaman.intellect-into-power': /33%, 66% or 100%/, 'class-shaman.maelstrom-weapon': /20% at every rank[^.]*6, 7, 8, 9 or 10 times per minute/,
    'class-warlock.wrack-snapshot': /deal their periodic damage 100% faster/ };
  for (const [id, re] of Object.entries(want)) { const f = F.get(id); if (!f || !re.test(f.value) || (id !== 'class-warlock.wrack-snapshot' && !f.sources.includes('g218-156'))) bad.push(id); }
  // The source of truth is the site's own 10 November talent data; the hotfix text must agree with it.
  const ss = tal.get('shaman-enhancement-stormstrike'), md = tal.get('shaman-enhancement-mental-dexterity'), mw = tal.get('shaman-enhancement-maelstrom-weapon'), wr = tal.get('warlock-affliction-wrack');
  if (!/100% weapon damage/.test(ss.descriptions[0]) || !/8 sec cooldown/.test(ss.cost)) bad.push('talent data Stormstrike');
  if (md.descriptions.map(d => /(\d+)% of your Intellect/.exec(d)[1]).join() !== '33,66,100') bad.push('talent data Mental Dexterity');
  if (!mw.descriptions.every(d => /by 20%/.test(d)) || mw.descriptions.map(d => /about (\d+) times per minute/.exec(d)[1]).join() !== '6,7,8,9,10') bad.push('talent data Maelstrom Weapon');
  if (!/60 Shadow damage every 1 sec[^.]*\. While channeling, your Siphon Life, Corruption, and Bane of Agony effects on the target deal their periodic damage 100% faster/.test(wr.descriptions[0])) bad.push('talent data Wrack');
  // The generated talent facts are no longer marked superseded, and Mental Dexterity gets its value question back.
  for (const id of ['talents-shaman.enhancement-mental-dexterity.r1', 'talents-shaman.enhancement-mental-dexterity.r3', 'talents-shaman.enhancement-stormstrike', 'talents-shaman.enhancement-stormstrike.r1'])
    if (!F.get(id) || F.get(id).supersededBy || /superseded/i.test(F.get(id).note || '')) bad.push(id + ' still superseded');
  if (!quizzes().has('talents-shaman.enhancement-mental-dexterity.value')) bad.push('no Mental Dexterity value question');
  const rack = quizzes().get('profession-leatherworking.rack-skill');
  if (!rack || rack.choices[rack.answer] !== '125' || rack.choices.includes('140')) bad.push('rack-skill question');
  return bad.length === 0 || bad.join('; ');
});
check('CONTENT-01/09: no university text and no guides218.json text (Discord /guide, tools, presets) states a pre-hotfix claim as current', () => {
  // Fact notes and heldBack records are dated history by design; every other string is checked sentence by sentence.
  const uniCurrent = uniStrings().filter(([w]) => !/\.note$|\.heldBack\[/.test(w));
  const g = json(stat, 'guides218.json'), gs = [], walk = (v, w) => { if (typeof v === 'string') gs.push([w, v]); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, w + '/' + i)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, w + '/' + k); };
  walk(g.classes, 'guides218/classes'); walk(g.professions, 'guides218/professions'); walk(g.tools, 'guides218/tools'); walk(g.presets, 'guides218/presets');
  const bad = staleHotfixClaims([...uniCurrent, ...gs]);
  // The matcher itself refuses the four pre-hotfix wordings Codex listed and accepts a dated history sentence.
  const probe = staleHotfixClaims([['p1', 'Stormstrike deals 150% normalized weapon damage on a six-second cooldown.'], ['p2', 'A Shaman with the matching imbue gets nothing from the totem.'],
    ['p3', 'Mental Dexterity converts 50%, 100% or 150% of Intellect into Attack Power.'], ['p4', 'Wrack makes your other Shadow DoTs hit the target 10% harder for 6 sec.'], ['ok', "Blizzard's 2 November notes had given 150% normalized weapon damage."]]);
  return bad.length === 0 && probe.length === 4 && !probe.some(x => x.startsWith('ok')) || JSON.stringify({ bad: bad.slice(0, 6), n: bad.length, probe });
});
check('CONTENT-01/09: the rendered Leatherworking, Enhancement and Dwarf pages give the hotfix values and cite the dated hotfix', async () => {
  const bad = [];
  for (const [parts, must] of [[['profession', 'leatherworking', '101'], [/Tanning Rack at 125/, /skill-125 camp object/]], [['class', 'shaman', 'enhancement', '101'], [/100% weapon damage on an 8 sec cooldown/, /33%, 66% or 100% of your Intellect/]],
    [['class', 'shaman', 'enhancement', '201'], [/your own weapon imbue and the matching totem work at the same time/]], [['race', 'dwarf', '201'], [/a Windfury Weapon Shaman still gains from Windfury Totem/]]]) {
    const p = await open(parts), t = p.container.textContent;
    const cites = p.container.querySelectorAll('a').some(a => a.getAttribute('href') === HOTFIX_URL);
    const stale = staleHotfixClaims([[parts.join('/'), t]]).filter(x => !/had given|it was 140|got nothing/.test(x));
    if (!must.every(re => re.test(t)) || !cites || stale.length) bad.push(parts.join('/') + ' ' + JSON.stringify({ missing: must.filter(re => !re.test(t)).map(String), cites, stale: stale.slice(0, 3) }));
  }
  return bad.length === 0 || bad.join(' | ');
});
// Round 3 (13 Nov 2026), misc item 1: guides218.json classes[7].changes[7] still said "No Blizzard note confirms the
// hotfix yet." The cited hotfix page (g218-156, read once on 13 Nov) has no Improved Drains or Healthstone note in any
// section up to 11 November, and the site's 10 November talent data already gives Improved Drains the datamined text.
// So the line states what the talent data holds, dates the Blizzard silence and cites the hotfix page.
check('round 3: the Warlock Improved Drains line agrees with the talent data and dates the Blizzard silence with the hotfix source', () => {
  const g = json(stat, 'guides218.json'), x = g.classes[7].changes[7], data = json(stat, 'talents/data.json');
  const drains = data.classes.find(c => c.id === 'warlock').trees.flatMap(t => t.talents).find(t => t.id === 'warlock-affliction-improved-drains');
  const dataSays = drains && drains.descriptions.every(d => /Drain Life, Drain Soul, and Drain Mana/.test(d) && !/Wrack/.test(d));
  const hotfix = g.sources[156], untilDate = (/up to (\d+ November 2026)/.exec(x.text) || [])[1];
  return g.classes[7].id === 'warlock' && /Improved Drains/.test(x.text) && dataSays && /10 November talent data has the same text/.test(x.text)
    && !/No Blizzard note confirms the hotfix yet/.test(x.text) && x.sources.includes(156) && hotfix.url === HOTFIX_URL
    && untilDate === '11 November 2026' && /November 11, 2026/.test(hotfix.label) && x.status === 'pending'
    || JSON.stringify({ text: x.text, sources: x.sources, dataSays, untilDate });
});
// Round 4 item 7 (13 Nov 2026): guides218.json source 15 and its university copy g218-15 still said "16 Oct 2026 snapshot"
// while grade A is the 10 November export, and the university copy of the Warlock line (change-8) said "No Blizzard note
// confirms the healing yet." with no date or hotfix source. This checkout's build check (scripts/university/validate.cjs,
// run over the tested checkout's static folder) now refuses both, and a copy with either drift put back is refused.
const ownValidator = path.join(__dirname, '../../scripts/university/validate.cjs');
const runValidator = staticDir => cp.spawnSync(process.execPath, [ownValidator, '--quiet'], { encoding: 'utf8', timeout: 60000, env: { ...process.env, UNIVERSITY_STATIC: staticDir } });
check('round 4: source 15 and g218-15 name the 10 November export that grade A names, and the Warlock Healthstone copies agree on the date and the hotfix source', () => {
  const g = json(stat, 'guides218.json'), s = json(uni, 'sources.json').sources, f = json(uni, 'facts', 'class-warlock.json').facts.find(x => x.id === 'class-warlock.change-8');
  const copy = s.find(x => x.id === 'g218-15'), r = runValidator(stat);
  const ok = /10 November 2026 export, client 1\.60\.1\.70755/.test(g.grades.A) && /10 November 2026, client 1\.60\.1\.70755/.test(g.sources[15].label) && !/16 Oct|70425/.test(g.sources[15].label)
    && copy && copy.label === g.sources[15].label && copy.checkedAt === g.sources[15].checkedAt
    && /up to 11 November 2026/.test(g.classes[7].changes[7].text) && f && /up to 11 November 2026/.test(f.value) && !/\byet\b/.test(f.value) && f.sources.includes('g218-156')
    && r.status === 0;
  return ok || JSON.stringify({ label15: g.sources[15].label, copy: copy && copy.label, change8: f && f.value, sources: f && f.sources, validator: (r.stdout + r.stderr).slice(-400) });
});
check('round 4: the build check refuses the 16 October label on the pinned talent data and an undated Warlock Healthstone copy', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'evg1112-r4-uni-'));
  try {
    fs.cpSync(uni, path.join(tmp, 'university'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'talents'));
    fs.copyFileSync(path.join(stat, 'talents', 'data.json'), path.join(tmp, 'talents', 'data.json'));
    fs.copyFileSync(path.join(stat, 'guides218.json'), path.join(tmp, 'guides218.json'));
    const edit = (rel, fn) => { const p = path.join(tmp, rel), j = JSON.parse(fs.readFileSync(p, 'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j)); };
    const control = runValidator(tmp);
    edit('guides218.json', j => { j.sources[15].label = 'Talent data, beta build 1.60.1.70425 (16 Oct 2026 snapshot)'; });
    edit('university/sources.json', j => { j.sources.find(x => x.id === 'g218-15').label = 'Talent data, beta build 1.60.1.70425 (16 Oct 2026 snapshot)'; });
    edit('university/facts/class-warlock.json', j => { const f = j.facts.find(x => x.id === 'class-warlock.change-8'); f.value = f.value.replace(/Blizzard's hotfix notes up to 11 November 2026 do not mention it\./, 'No Blizzard note confirms the healing yet.'); f.sources = f.sources.filter(x => x !== 'g218-156'); });
    const mutated = runValidator(tmp), out = mutated.stdout + mutated.stderr;
    return control.status === 0 && mutated.status === 1 && /g218-15: the pinned talent data must be labelled with the export grade A names/.test(out) && /fact class-warlock\.change-8: .*up to 11 November 2026/.test(out)
      || JSON.stringify({ control: control.status, controlOut: (control.stdout + control.stderr).slice(-300), mutated: mutated.status, out: out.slice(-500) });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
// Review of round 4 (13 Nov 2026): once source 15 is the 10 November export, the texts that cite it must report that data.
check('round 4 review: the Priest, Shaman and Feral texts that cite source 15 report the 10 November data and agree with their university copies', () => {
  const g = json(stat, 'guides218.json'), fact = (file, id) => json(uni, 'facts', file + '.json').facts.find(x => x.id === id);
  const priest = g.classes[4].changes[0], shaman = g.classes[5].changes[7], feral = g.classes[8].specs[1].pro.raid[2];
  const enh = fact('class-shaman', 'class-shaman.change-8'), resto = fact('class-shaman', 'class-shaman.change-9'), swipe = fact('class-druid', 'class-druid.swipe-in-the-beta-snapshot');
  const nov = n => n.trees.flatMap(t => t.talents.map(x => x.name)), cls = id => json(stat, 'talents', 'data.json').classes.find(c => c.id === id);
  const priestNow = nov(cls('priest')), shamanNow = nov(cls('shaman'));
  const october = /October|beta snapshot|beta build/;
  const ok = [priest.text, shaman.text, feral.label, feral.value].every(t => !october.test(t))
    && /10 November talent data/.test(priest.text) && ['Penance', 'Divine Aegis', 'Soul Warding', 'Prayer of Mending', 'Holy Binding', 'Improved Mind Flay', 'Dark Inspiration'].every(n => priest.text.includes(n) && priestNow.includes(n))
    && ['Lightwell', 'Force of Will', 'Shadow Affinity'].every(n => !priestNow.includes(n)) && !priest.text.includes('Binding Heal')
    && !/no Call of Thunder/.test(shaman.text) && shamanNow.includes('Call of Thunder')
    && ['Shield Specialization', 'Enhancing Totems', 'Two-Handed Axes and Maces', 'Improved Weapon Totems', 'Weapon Mastery', "Nature's Guidance", 'Totemic Mastery'].every(n => shaman.text.includes(n) && !shamanNow.includes(n) && (enh.value + resto.value).includes(n))
    && feral.label === swipe.label && feral.value === swipe.value && feral.grade === 'A' && /10%, 20% or 30%/.test(feral.value);
  return ok || JSON.stringify({ priest: priest.text, shaman: shaman.text, feral, swipe: swipe && swipe.value });
});
check('round 4 review: the build check refuses a text that cites source 15 but describes the October snapshot', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'evg1112-r4r-uni-'));
  try {
    fs.cpSync(uni, path.join(tmp, 'university'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'talents'));
    fs.copyFileSync(path.join(stat, 'talents', 'data.json'), path.join(tmp, 'talents', 'data.json'));
    const g = json(stat, 'guides218.json');
    fs.writeFileSync(path.join(tmp, 'guides218.json'), JSON.stringify(g));
    const control = runValidator(tmp);
    g.classes[8].specs[1].pro.raid[2].value = 'In the pinned October beta build, Feral Instinct added 10% Swipe damage at rank 1.';
    fs.writeFileSync(path.join(tmp, 'guides218.json'), JSON.stringify(g));
    const mutated = runValidator(tmp), out = mutated.stdout + mutated.stderr;
    return control.status === 0 && mutated.status === 1 && /classes\[8\]\.specs\[1\]\.pro\.raid\[2\]: cites source 15 \(the 10 November export\) but describes the October data/.test(out)
      || JSON.stringify({ control: control.status, controlOut: (control.stdout + control.stderr).slice(-300), mutated: mutated.status, out: out.slice(-500) });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
check('review: the validator refuses a question that cites a superseded fact without the fact that supersedes it', refused(({ bundle, quiz }) => {
  const q = quiz.questions.find(x => x.facts.some(id => id.startsWith('talents-warrior.')));
  const f = bundle.factFiles.find(d => d.file === 'talents-warrior').facts.find(x => q.facts.includes(x.id));
  f.supersededBy = 'class-warrior.flask-rule'; f.note = 'Superseded in a test.';
}, /cites a superseded fact without class-warrior\.flask-rule/));
check('review: no generated value question shows its own answer elsewhere in the quoted text (Spirit Tap)', () => {
  const bad = listJson('quizzes').flatMap(d => d.questions).filter(q => q.generated && /\.value$/.test(q.id))
    .filter(q => { const quoted = (/“([^”]*)”/.exec(q.stem) || [, ''])[1].replace('___', ''); return (quoted.match(/\d+(?:\.\d+)?%?/g) || []).includes(q.choices[q.answer]); });
  return !quizzes().has('talents-priest.shadow-spirit-tap.value') && bad.length === 0 || bad.map(q => q.id).join(', ');
});
check('review: preset rationales hold no ungraded claim the courses held back (Dual Specialization, Smite base damage, Warcraft Tavern advice)', () => {
  const g = json(stat, 'guides218.json'), bad = [];
  for (const p of g.presets) for (const w of p.why) if (/Dual Specialization|base damage in the client data|Warcraft Tavern/.test(w)) bad.push(p.id + ': ' + w.slice(0, 60));
  const copies = fs.readdirSync(path.join(uni, 'presets')).every(f => JSON.stringify(json(uni, 'presets', f).presets) === JSON.stringify(g.presets.filter(p => p.classId === f.replace('.json', ''))));
  return bad.length === 0 && copies || JSON.stringify({ bad, copies });
});
check('review: the Skyborne Read Leyline and Skysight chapter is written from the 26 Oct notes and has a quiz', () => {
  const F = allFacts(), sky = json(uni, 'races/skyborne.json'), ch = chaptersOf(sky).find(c => c.id === 'skyborne-101-other-racials');
  const ids = ['race-skyborne.read-leyline', 'race-skyborne.attuned', 'race-skyborne.skysight', 'race-skyborne.charged'];
  const facts = ids.map(id => F.get(id));
  const qs = [...quizzes().values()].filter(q => q.chapter === 'skyborne-101-other-racials');
  return ch && ch.unavailable === undefined && ids.every(id => ch.theory.includes(id)) && facts.every(f => f && f.grade === 'B' && f.sources.includes('g218-50'))
    && /50%/.test(facts[0].value) && /100%/.test(facts[1].value) && /15%/.test(facts[2].value) && /30%/.test(facts[3].value) && qs.length >= 2
    && !/Read Ley Line/.test(JSON.stringify(chaptersOf(sky)) + JSON.stringify(sky.overview)) || JSON.stringify({ ch: ch && ch.unavailable, qs: qs.length });
});
check('review: Warrior steps say only what their facts hold (dual-wield miss line gone, PvP steps cite the Hunter facts, hit cap not "expertise")', () => {
  const w = json(uni, 'courses/warrior.json'), all = chaptersOf(w), F = allFacts();
  const dw = all.find(c => c.id === 'warrior-fury-101-dual-wield').praxis.steps[0].text;
  const pvp = all.find(c => c.id === 'warrior-arms-201-pvp').praxis.steps;
  const hunter = pvp.find(s => /^Against Hunters/.test(s.text)).facts, rogue = pvp.find(s => /^Against Rogues/.test(s.text)).facts;
  return !/miss more often/.test(dw) && ['class-hunter.change-8', 'class-hunter.change-3'].every(id => hunter.includes(id)) && rogue.includes('class-hunter.vs-rogue-sap-distract')
    && !/expertise cap/i.test(JSON.stringify(all.map(c => [c.title, c.praxis]))) && F.get('class-warrior.hit-and-expertise-caps').label === 'Hit cap' || JSON.stringify({ dw, hunter, rogue });
});
check('review: the validator refuses an overview point with no fact (profession partner and scope lines)', refused(({ guide }) => { guide.overview.points.push({ text: 'Mining supplies most of the materials.' }); }, /cites no fact/));
check('review: profession pages drop the uncited partner and scope lines, and the Alchemy fix no longer contradicts its unknown', () => {
  const al = json(uni, 'professions/alchemy.json'), text = guideFiles().filter(g => g.kind === 'profession').map(g => JSON.stringify(g.overview)).join(' ');
  const fix = chaptersOf(al).flatMap(c => (c.praxis && c.praxis.mistakes) || []).find(m => /Scholomance/.test(m.mistake)).fix;
  return !/usual partner|supplies the leather|supplies most of the materials|come from Blizzard posts, the beta/.test(text) && /not known yet/.test(fix) && !/removes the need/.test(fix) || fix;
});
check('review: Champion of the Light is taught with the 2 Nov values, and explanations cite the facts they state', () => {
  const F = allFacts(), c = F.get('class-paladin.champion-of-the-light'), Q = quizzes();
  return /12%, 24%, 36%, 48% or 60%/.test(c.value) && c.sources.includes('g218-150') && /10\/20\/30%/.test(c.note || '')
    && ['profession-blacksmithing.stones-with-poisons', 'profession-blacksmithing.stones-with-imbues'].every(id => Q.get('profession-blacksmithing.windfury-source').facts.includes(id))
    && Q.get('class-shaman.farseer-personal').facts.includes('class-shaman.no-bloodlust') || JSON.stringify(c);
});
check('review: the Gnome guide teaches Eureka! on Power Word: Shield from the 16 Oct notes', () => {
  const F = allFacts(), f = F.get('common.racial-gnome-eureka-shield'), g = json(uni, 'races/gnome.json');
  const ch = chaptersOf(g).find(c => c.id === 'gnome-101-priest');
  return f && f.grade === 'B' && f.sources.includes('g218-49') && ch.theory.includes(f.id) && ch.praxis.steps.some(s => (s.facts || []).includes(f.id))
    && !g.heldBack.some(h => /no reviewed fact says Eureka! covers Power Word: Shield/.test(h.reason));
});
check('renderer: a track states each omission reason once, preset chapters carry no duplicate "check in game" step, and race leads open with their facts', async () => {
  const human = await open(['race', 'human', '201']), arms = await open(['class', 'warrior', 'arms', '301']);
  const counts = p => { const s = p.container.querySelectorAll('section').find(x => /Intermediate|Advanced/.test(text(x.querySelector('h2')))); const seen = new Map(); for (const li of s.querySelectorAll('li')) { const t = text(li).replace(/^[^:]*: /, ''); seen.set(t, (seen.get(t) || 0) + 1); } return [...seen.values()].every(n => n === 1); };
  // REV-UNI-1 of FOLLOWUP-TASKS.md (12 Nov 2026; its receipt is filed as followup-uni/REV-UNI-3.md, and REV-UNI-3 of the
  // task list is the /guide footer): the preset block already says to check a build in game, so a preset chapter's own steps must
  // not repeat it in any wording (check, compare or verify a build or talents in game, or open it in the calculator first).
  const ownCheck = t => /\b(?:check|compare|verify|confirm)\b[^.]*\b(?:builds?|talents?|points)\b[^.]*\bin[- ]game\b/i.test(t) || /\bin[- ]game\b[^.]*\bbefore you (?:spend|use|attach|commit)/i.test(t)
    || /\b(?:open|load)\b[^.]*\btalent calculator\b/i.test(t);
  const dup = guideFiles().flatMap(chaptersOf).filter(c => c.presets && c.praxis && c.praxis.steps.some(s => ownCheck(s.text))).map(c => c.id);
  const shown = ['Check a build against your talents in game before you use it or attach it to an application.', 'Open a build in the talent calculator and check it against your talents in game before you spend points.',
    'Open the dungeon build below in the talent calculator and check it against your talents in game before you spend points.', 'Compare the build with your talents in-game first.'].every(ownCheck);
  const leads = guideFiles().filter(g => g.kind === 'race').filter(g => /one of the five Alliance races/.test(g.overview.lead)).map(g => g.id);
  return counts(human) && counts(arms) && shown && dup.length === 0 && leads.length === 0 || JSON.stringify({ dup, leads, shown });
});
check('renderer: the hub says how many chapters are written and waiting, computed from the index, and claims no more', async () => {
  const ix = json(uni, 'index.json'), p = await open([]);
  const written = ix.guides.reduce((n, g) => n + (g.chapters ? g.chapters.written : 0), 0), waiting = ix.guides.reduce((n, g) => n + (g.chapters ? g.chapters.waiting.reduce((a, b) => a + b, 0) : 0), 0);
  const status = text(p.container.querySelector('p.uni-hub-status')), lead = text(p.container.querySelector('p.uni-lead'));
  const real = guideFiles().flatMap(chaptersOf), realWaiting = real.filter(c => c.unavailable !== undefined).length;
  return status.includes(written + ' chapters are written') && status.includes(waiting + ' chapters are not available yet') && waiting === realWaiting && written === real.length - realWaiting
    && !/Every course below has|Every chapter pairs Theory with Praxis and ends with a quiz/.test(p.container.textContent) && /Each written chapter pairs Theory with Praxis/.test(lead) || JSON.stringify({ status, lead });
});

// INT-UNI-2 / CL2-173, CL2-177 (12 Nov 2026): schedule lines are dated facts in guides218.json's wording, and the hub
// says Forever launched (4 November 2026) and gives the first raid unlock date. The shared rule is checked, and the
// files are scanned with an independent pattern so a weakened rule cannot pass.
const uniStrings = () => {
  const out = [], walk = (v, where) => { if (typeof v === 'string') out.push([where, v]); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, where + '[' + i + ']')); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where + '.' + k); };
  for (const dir of ['', 'courses', 'races', 'professions', 'facts', 'quizzes', 'presets']) for (const f of fs.readdirSync(path.join(uni, dir)).filter(x => x.endsWith('.json'))) walk(json(uni, dir, f), (dir ? dir + '/' : '') + f);
  return out;
};
check('INT-UNI-2: no university string says the raids "open on" a date, uses "9 Dec" shorthand or calls the launch upcoming or announced', () => {
  const R = rules(), STALE = /\b9 Dec\b(?!ember)|\bopens? (?:on |from )?9 Dec|\braids? (?:that )?open\b|\bFrom 9 Dec|announced (?:global )?launch|upcoming launch/i;
  const bad = uniStrings().filter(([, s]) => STALE.test(s) || (R.scheduleWording && R.scheduleWording(s)));
  const raid = uniStrings().filter(([, s]) => /Raid unlock date: 9 December 2026/.test(s)).length;
  return typeof R.scheduleWording === 'function' && bad.length === 0 && raid >= 40 || JSON.stringify({ rule: typeof R.scheduleWording, bad: bad.slice(0, 4).map(([w, s]) => w + ': ' + s.slice(0, 90)), nBad: bad.length, raid });
});
check('INT-UNI-2: the shared rule refuses "open on 9 Dec", "From 9 Dec", a date with no year and an announced launch, and accepts the dated wording', () => {
  const R = rules();
  if (typeof R.scheduleWording !== 'function') return 'validate.js exports no scheduleWording rule';
  const refused = ['Barrow Deeps, Hyjal Summit and Onyxia\'s Lair open on 9 December 2026.', 'The first raids open on 9 Dec 2026.', 'From 9 Dec 2026: The Barrow Deeps',
    'Molten Core is not one of the raids that open on 9 December.', 'The guides record the announced global launch for 4 November 2026.', 'Phase tables wait for the raids on 9 December.'];
  const accepted = ['Raid unlock date: 9 December 2026, for Barrow Deeps, Hyjal Summit and Onyxia\'s Lair.', 'First raid unlock date: 9 December 2026.', 'Forever launched worldwide on 4 November 2026 at 23:00 UTC.',
    'Insect Swarm gives you a way out when they open on you.', 'No raid-wide Bloodlust has been announced.'];
  const a = refused.filter(t => !R.scheduleWording(t)), b = accepted.filter(t => R.scheduleWording(t));
  return a.length === 0 && b.length === 0 || JSON.stringify({ notRefused: a, wronglyRefused: b });
});
check('INT-UNI-2: the hub says Forever launched on 4 November 2026 and gives the first raid unlock date, and never says "announced"', async () => {
  const p = await open([]), t = p.container.textContent;
  const hunter = await open(['class', 'hunter', '201']);
  return /Forever launched worldwide on 4 November 2026 at 23:00 UTC\. First raid unlock date: 9 December 2026\./.test(t) && !/announced|upcoming/i.test(t)
    && /Raid unlock date: 9 December 2026/.test(hunter.container.textContent) && !/open on 9 Dec/.test(hunter.container.textContent) || JSON.stringify({ hub: t.slice(0, 400) });
});
// REV-UNI-2 (12 Nov 2026): examView built the legend before it collected the grades its questions cite, so no exam
// page showed "How to read the grades". Every exam must show it, listing exactly the grades its drawn questions cite.
check('REV-UNI-2: a mastery exam shows the "How to read the grades" legend with the grades its questions cite', async () => {
  const F = allFacts(), Q = quizzes(), bad = [];
  for (const parts of [['exam', 'spec-warrior-arms', '101'], ['exam', 'class-warrior', '201'], ['exam', 'race-human', '101'], ['exam', 'profession-alchemy', '101']]) {
    const p = await open(parts), legend = p.container.querySelector('details.uni-legend');
    const ids = p.container.querySelectorAll('fieldset').map(b => b.getAttribute('data-question'));
    const want = ['A', 'B', 'C', 'D', 'E', 'U'].filter(g => ids.some(id => Q.get(id).facts.some(f => F.get(f).grade === g)));
    const shown = legend ? legend.querySelectorAll('dt').map(text) : [];
    if (!ids.length || !legend || text(legend.querySelector('summary')) !== 'How to read the grades' || JSON.stringify(shown) !== JSON.stringify(want)) bad.push(parts.join('/') + ' ' + JSON.stringify({ legend: !!legend, shown, want }));
  }
  return bad.length === 0 || bad.join(' | ');
});

// Browser part (opt-in): node tests/evergreen1112_guides_test.cjs --base http://127.0.0.1:<harness> --cdp <port>
// INT-UNI-1, INT-UNI-2 and REV-UNI-2 in the real site at 1280 and 375 px (member persona).
async function browserChecks(base, port) {
  const { launch, instrument, idle, viewport, sleep } = await import('file:///C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs');
  const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'guides-edge-'));
  const cdp = await launch({ port, profile }), st = await instrument(cdp), out = [];
  const go = async (width, route) => { await viewport(cdp, width, 900); await cdp.send('Page.navigate', { url: base + '/#/' + route }); await idle(st); await cdp.send('Page.reload', {}); await idle(st); await sleep(900); };
  try {
    await cdp.send('Page.navigate', { url: base + '/__qa/member' }); await idle(st);
    for (const width of [1280, 375]) {
      const missing = [];
      for (const route of ['guides/class/no-such-class', 'guides/class/warrior/nope', 'guides/profession/no-such-profession', 'guides/race/orc', 'guides/class/warrior/401', 'guides/class/warrior/arms/101/missing-chapter', 'guides/exam/class-nope/101']) {
        await go(width, route);
        const r = await cdp.eval(`(() => { const m = document.querySelector('main'), back = m.querySelector('.uni a[href="#/guides"]');
          return { h1: [...m.querySelectorAll('h1')].map(h => h.textContent.trim()), status: [...m.querySelectorAll('.uni [role=status]')].map(s => s.textContent.trim()).filter(Boolean),
            back: back ? Math.round(back.getBoundingClientRect().height) : 0, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
        if (r.h1.length !== 1 || !/ not found$/.test(r.h1[0]) || r.status.length !== 1 || r.back < 44 || r.overflow > 0) missing.push(route + ' ' + JSON.stringify(r));
      }
      out.push(['browser ' + width + ' px INT-UNI-1: seven unknown university addresses each show one "… not found" H1, one status sentence and a 44 px way back', missing.length === 0, missing]);
      await go(width, 'guides/exam/spec-warrior-arms/101');
      const exam = await cdp.eval(`(() => { const d = document.querySelector('main details.uni-legend'); return { legend: !!d && d.getClientRects().length > 0, summary: d ? d.querySelector('summary').textContent : null, grades: d ? [...d.querySelectorAll('dt')].map(x => x.textContent) : [] }; })()`);
      out.push(['browser ' + width + ' px REV-UNI-2: the Arms 101 exam shows "How to read the grades"', exam.legend && exam.summary === 'How to read the grades' && exam.grades.length > 0, exam]);
      await go(width, 'resources');
      const hub = await cdp.eval(`(() => { const t = document.querySelector('main').textContent, s = document.querySelector('main .uni-hub-schedule'); return { schedule: s ? s.textContent : null, announced: /announced/i.test(t), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      out.push(['browser ' + width + ' px INT-UNI-2: #/resources (the hub) says Forever launched and gives the first raid unlock date, and never "announced"',
        /^Forever launched worldwide on 4 November 2026 at 23:00 UTC\. First raid unlock date: 9 December 2026\.$/.test(hub.schedule || '') && !hub.announced && hub.overflow <= 0, hub]);
    }
    if (st.exceptions.length) out.push(['browser: no page exceptions', false, st.exceptions.slice(0, 3)]);
  } finally { await Promise.race([cdp.close(), sleep(3000)]); try { cdp.proc.kill(); } catch { /* gone */ } try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold it */ } }
  return out;
}

(async () => {
  for (const run of pending) {
    const [name, ok, detail] = await run();
    if (ok) passed++; else failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + String(detail).slice(0, 400)));
  }
  const at = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  if (at('--base') && at('--cdp')) for (const [name, ok, detail] of await browserChecks(at('--base'), Number(at('--cdp')))) {
    if (ok) passed++; else failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + ' :: ' + JSON.stringify(detail).slice(0, 600));
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
})();
