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
check('the build check (build/validate.cjs) passes over every university file', () => {
  const r = cp.spawnSync(process.execPath, [path.join(uni, 'build/validate.cjs'), '--quiet'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 && /university: valid/.test(r.stdout) || (r.stdout + r.stderr).slice(-600);
});
check('the generated talent facts and questions are current (generate-talent-facts.cjs --check)', () => {
  const r = cp.spawnSync(process.execPath, [path.join(uni, 'build/generate-talent-facts.cjs'), '--check'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 || (r.stdout + r.stderr).slice(-400);
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
check('the migration recorded every .218 class and profession entry it moved', () => {
  const g = json(stat, 'guides218.json'), map = json(uni, 'build/migration-map.json').entries.map(e => e.from);
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

check('renderer: the hub lists classes alphabetically, professions by group, unwritten races, the tools and a scores panel', async () => {
  const p = await open([]);
  const h2 = p.container.querySelectorAll('h2').map(text), classes = p.container.querySelectorAll('section')[0].querySelectorAll('h3').map(text).map(s => s.trim());
  const groups = p.container.querySelectorAll('h3').map(text).filter(t => ['Primary crafting', 'Gathering', 'Secondary'].includes(t));
  return text(p.container.querySelector('h1')) === 'Olympus University' && JSON.stringify(classes) === JSON.stringify([...classes].sort())
    && classes[0] === 'Druid' && classes[8] === 'Warrior' && groups.join() === 'Primary crafting,Gathering,Secondary'
    && (p.container.textContent.match(/Not written yet\./g) || []).length === 4 && /Warrior is a full course/.test(p.container.textContent) && h2.includes('Your scores') && h2.includes('Raid preparation tools')
    && p.requests.every(([url, method]) => method === 'GET' && url === '/static/university/index.json') || JSON.stringify({ h2, classes, groups });
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
    && JSON.stringify(nextIds) !== JSON.stringify(ids) || JSON.stringify({ n: ids.length, best });
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
check('renderer: old deep links still open (#/guides/class/mage/frost, #/guides/profession/first-aid) and migrated courses say so', async () => {
  const a = await open(['class', 'mage', 'frost']), b = await open(['profession', 'first-aid']), c = await open(['profession', 'alchemy']);
  return text(a.container.querySelector('h1')) === 'Frost Mage' && /carried over from the earlier guide pages/.test(a.container.textContent)
    && text(b.container.querySelector('h1')) === 'First Aid guide' && text(c.container.querySelector('h1')) === 'Alchemy guide' && !/carried over/.test(c.container.textContent);
});
check('renderer: an unwritten race says so, and an unknown guide or chapter is refused', async () => {
  const a = await open(['race', 'dwarf']), b = await open(['class', 'warrior', 'nope']), c = await open(['class', 'warrior', 'arms', '101', 'missing-chapter']), d = await open(['race', 'orc']);
  return /has not been written yet/.test(a.container.textContent) && [b, c, d].every(x => /There is no such guide\./.test(x.container.textContent));
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

(async () => {
  for (const run of pending) {
    const [name, ok, detail] = await run();
    if (ok) passed++; else failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + String(detail).slice(0, 400)));
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
})();
