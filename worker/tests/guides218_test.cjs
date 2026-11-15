// .218 Olympus guides and tools: the actual guides218.js over the actual guides218.json, with a minimal DOM.
// Pure local computation: no Worker, browser session, provider, network or account action.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const crypto = require('node:crypto');
const worker = path.join(__dirname, '..'), stat = path.join(worker, 'public/static');
const SOURCE = fs.readFileSync(path.join(stat, 'guides218.js'), 'utf8'), CSS = fs.readFileSync(path.join(stat, 'guides218.css'), 'utf8');
const DATA_TEXT = fs.readFileSync(path.join(stat, 'guides218.json'), 'utf8'), DATA = JSON.parse(DATA_TEXT);
const talents = JSON.parse(fs.readFileSync(path.join(stat, 'talents/data.json'), 'utf8'));
const calcModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(stat, 'talents/calculator.js'), 'utf8'), { module: calcModule }, { filename: 'calculator.js', timeout: 1000 });
const calculator = calcModule.exports;
const tsCache = new Map();
function loadTs(name) {
  name = name.replace(/^\.\//, '');
  if (!['talent-build-contract', 'talent-build-attachment'].includes(name)) throw Error('Unexpected dependency: ' + name);
  if (tsCache.has(name)) return tsCache.get(name).exports;
  const module = { exports: {} }; tsCache.set(name, module);
  const out = ts.transpileModule(fs.readFileSync(path.join(worker, 'src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', out)(module, module.exports, loadTs);
  return module.exports;
}
const { talentBuildAttachment } = loadTs('talent-build-attachment');
let count = 0;
const check = (name, ok) => { assert.ok(ok, name); count++; console.log('PASS ' + name); };
const clone = v => JSON.parse(JSON.stringify(v));

// ---- minimal DOM ----
class Node { constructor(doc) { this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; } }
class Text extends Node { constructor(doc, text) { super(doc); this.data = String(text); } get textContent() { return this.data; } }
class El extends Node {
  constructor(doc, tag) { super(doc); this.tagName = tag.toUpperCase(); this.attributes = {}; this.listeners = {}; this.className = ''; this.checked = false; this.disabled = false; this.value = ''; }
  appendChild(child) { if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1); child.parentNode = this; this.childNodes.push(child); return child; }
  replaceChildren(...kids) { for (const k of this.childNodes) k.parentNode = null; this.childNodes = []; for (const k of kids) this.appendChild(k); }
  remove() { if (this.parentNode) { this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; } }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'disabled') this.disabled = true; if (k === 'checked') this.checked = true; if (k === 'value') this.value = String(v); }
  getAttribute(k) { return Object.hasOwn(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); }
  fire(t) { for (const f of this.listeners[t] || []) f({ type: t, target: this }); }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '') this.appendChild(new Text(this.ownerDocument, v)); }
  all(pred) { const out = []; const walk = n => { for (const c of n.childNodes) if (c instanceof El) { if (pred(c)) out.push(c); walk(c); } }; walk(this); return out; }
  tags(tag) { return this.all(e => e.tagName === tag.toUpperCase()); }
}
function page(fetchImpl) {
  const doc = { createElement: tag => new El(doc, tag), createTextNode: text => new Text(doc, text) };
  const fetches = [];
  const context = { document: doc, fetch: (url, init) => { fetches.push([url, init]); return fetchImpl(url, init); }, console, Object, JSON, Number, String, Array, Set, Map, Math, Error, Promise, encodeURIComponent };
  context.window = context;
  vm.runInNewContext(SOURCE, context, { filename: 'guides218.js', timeout: 2000 });
  const box = doc.createElement('main');
  return { api: context.OlympusGuides, doc, box, fetches };
}
const ok = data => async () => ({ ok: true, status: 200, json: async () => clone(data) });
const settle = () => new Promise(r => setTimeout(r, 5));
async function mounted(options, data = DATA) {
  const p = page(ok(data)); const instance = p.api.mount(p.box, options); await settle(); await settle();
  return { ...p, instance };
}
const text = n => n.textContent.replace(/\s+/g, ' ');
const links = n => n.tags('a').map(a => a.getAttribute('href'));
// CL2-052, CL2-057 (our 58b96f8): #/guides is now the Olympus University hub of university/university.js, which reads only its own files.
async function university(parts, options = {}) {
  const doc = { createElement: tag => new El(doc, tag), createTextNode: text => new Text(doc, text) }, fetches = [], uni = path.join(stat, 'university');
  const context = { document: doc, console, fetch: async (url, init) => { fetches.push([url, init]); const rel = url.replace(/^\/static\/university\//, '');
    if (rel === url || rel.includes('..')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(uni, rel), 'utf8')) }; } };
  context.window = context;
  for (const file of ['validate.js', 'university.js']) vm.runInNewContext(fs.readFileSync(path.join(uni, file), 'utf8'), context, { filename: file, timeout: 2000 });
  const box = doc.createElement('main'), instance = context.OlympusUniversity.mount(box, { parts, talentRevision: talents.revision, ...options });
  // Unit h1 guidesname (owner, 15 Nov 2026): the loading line is "Opening the guides…" again, as before 58b96f8.
  for (let i = 0; i < 50 && text(box).includes('Opening the guides'); i++) await settle();
  return { box, fetches, instance };
}

(async () => {
  // 1. Source policy.
  check('the renderer has no HTML-string, style, eval, storage or randomness sink', !/innerHTML|outerHTML|insertAdjacentHTML|\.style\b|setAttribute\(["']style|eval\(|new Function|localStorage|sessionStorage|Math\.random|document\.write/.test(SOURCE));
  check('the renderer fetches only its own catalogue, same-origin, refusing redirects', (SOURCE.match(/fetch\(/g) || []).length === 1 && SOURCE.includes('const DATA_URL = "/static/guides218.json"') && SOURCE.includes('redirect: "error"') && SOURCE.includes('credentials: "same-origin"'));
  const art222=new Set(JSON.parse(fs.readFileSync(path.join(__dirname,'../../scripts/official_asset_reference.json'),'utf8')).assets.map(row=>row.path)),urls222=[...CSS.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1].trim().replace(/^['\"]|['\"]$/g,''));
  const safeCSS222=css=>!/@import/i.test(css)&&[...css.matchAll(/url\(([^)]+)\)/g)].every(m=>{const u=m[1].trim().replace(/^['\"]|['\"]$/g,'');return u.startsWith('/static/wow/')&&art222.has('worker/public'+u)&&/\.(?:png|jpg)$/.test(u);});
  check('the stylesheet uses only pinned local game artwork and retains reduced-motion/forced-colors rules',urls222.length===22&&safeCSS222(CSS)&&CSS.includes('prefers-reduced-motion')&&CSS.includes('forced-colors'));
  check('the CSS artwork boundary rejects remote, data and unlisted local URLs',!safeCSS222(CSS+'url(https://example.invalid/x.png)')&&!safeCSS222(CSS+'url(data:image/png;base64,AA)')&&!safeCSS222(CSS+'url(/static/wow/unlisted.png)'));

  // 2. Closed validation of the real catalogue and refusals of altered copies.
  const api = page(ok(DATA)).api;
  check('the real catalogue passes the closed validator for the pinned talent snapshot', api.validate(clone(DATA), talents.revision) && DATA.talentRevision === talents.revision);
  const refuse = (name, mutate) => { const d = clone(DATA); mutate(d); let thrown = false; try { api.validate(d, talents.revision); } catch { thrown = true; } check('refused: ' + name, thrown); };
  refuse('another schema', d => { d.schema = 'olympus-guides-v2'; });
  refuse('another talent revision', d => { d.talentRevision = '000000000000'; });
  refuse('a source on an unlisted host', d => { d.sources[0].url = 'https://example.com/x'; });
  refuse('a Classic DB2 source with an unreviewed build', d => { d.sources[0].url = 'https://wago.tools/db2/Spell/csv?build=1.60.1.70790'; });
  refuse('an http source', d => { d.sources[0].url = d.sources[0].url.replace('https:', 'http:'); });
  refuse('a catalogue source on the licence host', d => { d.sources[0].url = 'https://creativecommons.org/licenses/by/4.0/'; });
  refuse('an Unavailable claim with a value', d => { const c = d.classes[0].specs[0].pro.priorities[0] || (d.classes[0].specs[0].pro.priorities[0] = { label: 'x', value: 'y', grade: 'E', sources: [0] }); c.grade = 'U'; c.value = 'guess'; });
  refuse('an unknown grade', d => { const c = d.classes[0].specs[0].pro.priorities[0] || (d.classes[0].specs[0].pro.priorities[0] = { label: 'x', value: 'y', grade: 'E', sources: [0] }); c.grade = 'Z'; });
  refuse('a citation past the source list', d => { d.classes[0].changes[0] ? d.classes[0].changes[0].sources = [d.sources.length] : d.tools.whatChanged[0].sources = [d.sources.length]; });
  refuse('a preset code from another snapshot', d => { d.presets[0].code = d.presets[0].code.replace(talents.revision, 'aaaaaaaaaaaa'); });
  refuse('a preset whose code level disagrees', d => { d.presets[0].level = d.presets[0].level === 60 ? 30 : 60; });
  refuse('a preset whose tree split does not add up', d => { d.presets[0].treePoints[0] += 1; });
  refuse('a spec citing a missing preset', d => { d.classes[0].specs[0].presets.push('missing-preset'); });
  refuse('eight classes', d => { d.classes.pop(); });
  refuse('eleven professions', d => { d.professions.pop(); });
  refuse('an unknown profession group', d => { d.professions[0].type = 'unknown'; });
  refuse('an unknown checklist row kind', d => { d.tools.preBis.checklist[0].kind = 'task'; });
  refuse('an unavailable raid fact treated as an action', d => { d.tools.attunements[0].steps.find(row => row.grade === 'U').kind = 'action'; });
  refuse('a buff with an invalid raid context', d => { d.tools.worldBuffs[0].raid = 'open'; });
  refuse('a consumable with an unrecognized role', d => { d.tools.consumables[0].roles = ['damage']; });
  const flaskRow = (data, id) => data.tools.consumables.find(row => row.id === 'flask-of-' + id);
  refuse('a duplicate Classic flask spell ID', d => { flaskRow(d, 'supreme-power').classicFlaskSpellId = flaskRow(d, 'the-titans').classicFlaskSpellId; });
  refuse('a Classic flask included in additive encounter stats', d => { flaskRow(d, 'the-titans').stats = { stamina: 9 }; });
  refuse('a Classic flask without its versioned source', d => { flaskRow(d, 'the-titans').sources = [14]; });
  refuse('a Classic flask without a recorded duration', d => { flaskRow(d, 'the-titans').durationMin = null; });
  refuse('a Classic flask presented as Forever evidence', d => { flaskRow(d, 'the-titans').grade = 'C'; });
  refuse('a stat key inherited from the label map prototype', d => { d.tools.worldBuffs[0].stats.constructor = 1; });

  // 3. Every preset is a real, attachable build from the pinned snapshot.
  for (const p of DATA.presets) {
    const parsed = calculator.parseBuild(talents, p.code), attached = talentBuildAttachment(p.code);
    if (!(parsed.ok && parsed.build.className === p.classId && parsed.build.level === p.level && parsed.points === p.points && JSON.stringify(parsed.treePoints) === JSON.stringify(p.treePoints)
      && parsed.points === (p.level === 60 ? 51 : 21) && attached && attached.code === p.code)) assert.fail('preset ' + p.id + ' is not a valid attachable build');
    const spec = DATA.classes.find(c => c.id === p.classId).specs.find(s => s.id === p.specId);
    if (!spec || !spec.presets.includes(p.id) || p.treePoints.indexOf(Math.max(...p.treePoints)) !== talents.classes.find(c => c.id === p.classId).trees.findIndex(t => t.id === p.specId)) assert.fail('preset ' + p.id + ' is not in its own spec tree');
  }
  check(`all ${DATA.presets.length} presets parse, validate at their level's full budget, attach unchanged and sit in their own spec tree`, DATA.presets.length >= 27);
  check('every spec has at least one level-60 starting point', DATA.classes.every(c => c.specs.every(s => s.presets.some(id => DATA.presets.find(p => p.id === id).level === 60))));
  check('presets are labelled starting points, never best or optimal', DATA.presets.every(p => !/\b(best|optimal|bis)\b/i.test(p.label + ' ' + p.why.join(' '))));

  // 4. Talent-change counts are computed from the snapshot itself.
  const counts = tree => { const c = { changed: 0, same: 0, moved: 0, new: 0 }; for (const t of tree.talents) if (t.classic && Object.hasOwn(c, t.classic.status)) c[t.classic.status]++; c.classicOnly = (tree.removedClassic || []).length; return c; };
  check('each spec and class summary matches the talent snapshot exactly', DATA.classes.every(c => { const cls = talents.classes.find(x => x.id === c.id);
    return c.specs.every((s, i) => JSON.stringify(s.whatChanged) === JSON.stringify(counts(cls.trees[i]))); })
    && DATA.classSummary.every(x => { const cls = talents.classes.find(c => c.id === x.id), sum = { changed: 0, same: 0, moved: 0, new: 0, classicOnly: 0 }; for (const t of cls.trees) for (const [k, v] of Object.entries(counts(t))) sum[k] += v; return ['changed', 'same', 'moved', 'new', 'classicOnly'].every(k => sum[k] === x[k]); }));
  // Source URLs are the publishers' own slugs (for example a Classic pre-raid page); the rule is about Olympus wording.
  check('policy words never appear in Olympus text', !/\bGDKP\b|buy(ing)? gold|real[- ]money|best[- ]in[- ]slot|\bBiS\b/i.test(DATA_TEXT.replace(/"url":"[^"]*"/g, '')));
  check('every profession gold note carries the Blizzard-policy caveat', DATA.professions.every(p => /subject to Blizzard policy\.?$/.test(p.goldNote)));

  // 5. Hub.
  let m = await mounted({ view: 'hub', talentRevision: talents.revision });
  // CL2-052, CL2-057 (our 58b96f8, ab493c0): the hub checks read the University hub, which replaced the guides218.js hub at #/guides.
  const hub = await university([]);
  const hubLinks = links(hub.box);
  check('the hub retains all existing class, spec, profession and tool links', DATA.classes.every(c => hubLinks.includes('#/guides/class/' + c.id) && c.specs.every(s => hubLinks.includes('#/guides/class/' + c.id + '/' + s.id)))
    && DATA.professions.every(p => hubLinks.includes('#/guides/profession/' + p.key)) && ['attunements', 'buffs', 'changes'].every(t => hubLinks.includes('#/guides/tools/' + t)));
  // CL2-205 (our 58b96f8): the publisher library moved from #/guides to #/guides/library.
  check('the hub keeps the calculator, addons, publisher library, game updates and member guide one click away', ['#/talents', '#/addons', '#/guides/library', '#/updates', '#/guide/member'].every(h => hubLinks.includes(h)));
  // CL2-052 (our 58b96f8): the hub has one H1, and its scope note comes from university/index.json. Unit h1 guidesname (owner,
  // 15 Nov 2026): the H1 is "Class & profession guides" again, as before 58b96f8.
  const hubIndex = JSON.parse(fs.readFileSync(path.join(stat, 'university/index.json'), 'utf8')), hubScopeNote = hubIndex.scopeNote;
  check('the hub has one Class & profession guides heading and states the scope note once',
    hub.box.tags('h1').map(text).join('|') === 'Class & profession guides' && text(hub.box).split(hubScopeNote.slice(0, 60)).length === 2);
  const classLandingLinks = hubLinks.filter(h => /^#\/guides\/class\/[a-z]+$/.test(h));
  const professionHeadings = hub.box.tags('h3').map(text).filter(t => ['Primary crafting', 'Gathering', 'Secondary'].includes(t));
  check('the hub alphabetizes classes and groups professions by the kind of training',
    classLandingLinks.join(',') === [...classLandingLinks].sort().join(',') && professionHeadings.join(',') === 'Primary crafting,Gathering,Secondary');
  // Our 58b96f8: every class and profession card of the hub has one icon (university.js:221, :172); races have none. Each is a pinned official asset.
  const hubIcons = hub.box.tags('img');
  check('class and profession icons are local official art only', hubIcons.length === hubIndex.guides.filter(g => g.kind === 'class' || g.kind === 'profession').length
    && hubIcons.every(i => /^\/static\/wow\/(class|prof|role)-[a-z_]+\.png$/.test(i.getAttribute('src')) && art222.has('worker/public' + i.getAttribute('src'))));
  // CL2-052 (our 58b96f8): the University hub reads only its index, same-origin and refusing redirects (university.js:27-33, :506-508).
  check('exactly one same-origin catalogue fetch', m.fetches.length === 1 && m.fetches[0][0] === '/static/guides218.json' && m.fetches[0][1].redirect === 'error'
    && hub.fetches.length === 1 && hub.fetches[0][0] === '/static/university/index.json' && hub.fetches[0][1].redirect === 'error' && hub.fetches[0][1].credentials === 'same-origin');

  // 6. Class view, presets and attach.
  const attached = [];
  const cls = DATA.classes[0], spec = cls.specs[1];
  // CL2-052, CL2-059 (our 58b96f8): the class and spec guides are University courses; a spec address opens its 101 track, whose
  // sections come from the chapters of courses/warrior.json (Fury 101: talents, rotation) under the titles of validate.js SECTIONS.
  m = await university(['class', cls.id, spec.id], { canAttach: true, onAttach: p => attached.push(p) });
  check('the class view names the class, marks the chosen spec and shows its sections', m.box.tags('h1').length === 1 && text(m.box.tags('h1')[0]) === spec.name + ' ' + cls.name
    && m.box.all(e => e.getAttribute('aria-current') === 'page' && e.getAttribute('href') === '#/guides/class/' + cls.id + '/' + spec.id).length === 1
    && ['Overview', '101 Foundations', 'Talents', 'Rotation', 'Mastery exam'].every(t => m.box.tags('h2').some(h => text(h) === t)));
  const cards = m.box.all(e => e.getAttribute('data-preset'));
  // CL2-089, CL2-090 (our e0f7077) and our 58b96f8: every preset is a current 10 November build, and a course card says "Talent build" (university.js:298).
  check('preset cards are labelled as talent builds, with no beta snapshot label', cards.length > 0 && cards.every(card => text(card).includes('Talent build · Level ') && !text(card).includes('Beta snapshot')));
  // Our 58b96f8: the caution stands once above the builds of a talent chapter (university.js:379); this track has one such chapter.
  check('the saved builds carry one shared caution, with short card headings and no visible revision hash',
    text(m.box).split('Check a build against your talents in game before you use it or attach it to an application.').length === 2
    && cards.every(card => !text(card).includes(DATA.talentRevision) && !text(card.tags('h5')[0]).startsWith('Olympus starting point'))
    && !text(m.box).includes('Talent snapshot Talent snapshot'));
  // Our 58b96f8: a spec's presets sit in the talent chapters of its tracks (courses/warrior.json: Fury 101 and 201), each linking the calculator (university.js:300).
  const specCards = [...cards];
  for (const tier of ['201', '301']) specCards.push(...(await university(['class', cls.id, spec.id, tier])).box.all(e => e.getAttribute('data-preset')));
  check('every preset of the spec renders once with its exact calculator link', specCards.length === spec.presets.length && spec.presets.every(id => { const p = DATA.presets.find(x => x.id === id), card = specCards.find(c => c.getAttribute('data-preset') === id);
    return card && card.tags('a').some(a => a.getAttribute('href') === '#/talents/' + p.classId + '/' + encodeURIComponent(p.code) && text(a) === 'Load in the talent calculator'); }));
  const attachButton = cards[0].tags('button').find(b => text(b) === 'Attach to my application');
  attachButton.fire('click');
  // The first card of the 101 track is the first preset of its chapters in the course file.
  const specCourse = JSON.parse(fs.readFileSync(path.join(stat, 'university/courses', cls.id + '.json'), 'utf8')).specs.find(s => s.id === spec.id);
  const first = DATA.presets.find(x => x.id === specCourse.tracks['101'].chapters.flatMap(c => c.presets || [])[0]);
  check('Attach hands over exactly the preset identity and build, frozen, and says what happens next', attached.length === 1 && Object.isFrozen(attached[0]) && JSON.stringify(attached[0]) === JSON.stringify({ presetId: first.id, label: first.label, classId: first.classId, level: first.level, code: first.code })
    && text(cards[0]).includes('Opening your application with this build'));
  // Our 58b96f8: the Feral course's 201 track holds its talent chapter, raid build and the Berserk fact (facts/class-druid.json, presets/druid.json).
  const feralGuide = await university(['class', 'druid', 'feral-combat', '201']);
  check('Feral instructions use the current first-party tuning while the build codes retain their snapshot',
    text(feralGuide.box).includes('Berserk was removed') && text(feralGuide.box).includes('115% threat bonus')
    && !text(feralGuide.box).includes('Berserk lasts 15 s')
    && links(feralGuide.box).includes('https://us.forums.blizzard.com/en/wow/t/2360696/9'));
  const arcaneSnapshot = DATA.presets.find(entry => entry.id === 'mage-arcane-raid-60');
  // A preset's rank in a talent of its class, decoded from its code; null when the 10 November data has no such talent.
  const presetRank = (preset, name) => { const flat = talents.classes.find(row => row.id === preset.classId).trees.flatMap(tree => tree.talents), index = flat.findIndex(row => row.name === name);
    return index < 0 ? null : calculator.parseBuild(talents, preset.code).build.ranks[index]; };
  // CL2-089, CL2-090 (our e0f7077, owner ruling of 12 Nov "Update data, rewrite presets"): the re-authored build holds no removed talent and says where its hit comes from.
  check('the Arcane raid preset says Arcane Focus was removed and takes its spell hit from Precision',
    !!arcaneSnapshot && presetRank(arcaneSnapshot, 'Arcane Focus') === null && presetRank(arcaneSnapshot, 'Precision') === 3
    && arcaneSnapshot.why.some(line => line.includes('Arcane Focus was removed') && line.includes('Precision (3/3: 6% hit with all spells)')));
  const source9 = DATA.sources.findIndex(row => row.url === 'https://us.forums.blizzard.com/en/wow/t/2360696/9');
  const classFact = id => DATA.classes.find(row => row.id === id);
  const specFact = (id, spec) => classFact(id).specs.find(row => row.id === spec);
  const official = (row, needles) => row?.sources.includes(source9) && (row.grade === 'B' || row.status === 'announced')
    && needles.every(needle => (row.value || row.text).includes(needle));
  const feralFacts = specFact('druid', 'feral-combat');
  check('Feral quick start distinguishes talented Lacerate and the two late Feral choices',
    official(classFact('druid').changes[1], ['Lacerate', 'row 4']) && !classFact('druid').changes[1].text.includes('Lacerate at 42')
    && feralFacts.beginner.rotation[1].includes('Predatory Discipline') && feralFacts.beginner.rotation[1].includes('31 points')
    && feralFacts.beginner.rotation[2].includes('Lacerate on row 4') && feralFacts.beginner.rotation[2].includes('Primal Bite on row 7'));
  check('the Arcane beginner rotation uses the confirmed 18-second stack duration',
    specFact('mage', 'arcane').beginner.rotation[4].includes('18-second duration') && !specFact('mage', 'arcane').beginner.rotation[4].includes('datamine'));
  check('Warrior Slam and Flurry use the November ranks and cooldowns',
    official(specFact('warrior', 'arms').pro.priorities[5], ['15 seconds', '2.5 or 5 seconds'])
    && official(specFact('warrior', 'fury').pro.priorities[4], ['10%, 20% or 30%', 'no Death Wish prerequisite']));
  const furyLeveling = DATA.presets.find(entry => entry.id === 'warrior-fury-leveling-30');
  // CL2-089, CL2-090 (our e0f7077): the re-authored leveling build takes Death Wish at 30 and states that Flurry no longer needs it.
  check('the Fury leveling preset takes Death Wish at level 30 and states the November Flurry rule',
    !!furyLeveling && presetRank(furyLeveling, 'Death Wish') === 1 && furyLeveling.why.some(line => line.includes('Death Wish at level 30') && line.includes('Flurry no longer depends on it')));
  check('class overviews defer shared editorial scope to the current catalogue header',
    DATA.classes.every(entry => entry.overview.every(line => !line.startsWith('Besides the talent snapshot, this page uses Blizzard'))));
  check('Priest Holy Binding and Shadow Word: Death cite the official November update',
    official(classFact('priest').changes[7], ['replaced Binding Heal with Holy Binding', '30% of maximum health', 'no backlash on a miss'])
    && specFact('priest', 'holy').beginner.tips[2].includes('half the amount'));
  check('Rogue current rows explain Shank, Death Mark and retired talents',
    official(classFact('rogue').changes[5], ['loses Murder', 'Shank'])
    && official(classFact('rogue').changes[7], ['Quietus', 'Cutthroat', 'Thousand Cuts', 'Death Mark'])
    && official(specFact('rogue', 'subtlety').pro.priorities[1], ['Rupture and Garrote', '15%']));
  // CONTENT-01, CONTENT-09 (our 90a1a07): Blizzard's hotfix of 10 November 2026 set Stormstrike to 100% weapon damage on an 8-second
  // cooldown; the row cites that dated hotfix source (receipt followup-uni/CONTENT-09.md).
  const hotfix1110 = DATA.sources.findIndex(row => row.url === 'https://worldofwarcraft.blizzard.com/en-us/news/24315281/wow-forever-hotfixes-november-11-2026');
  const hotfixed = (row, needles) => hotfix1110 >= 0 && row?.sources.includes(hotfix1110) && row.grade === 'B' && needles.every(needle => row.value.includes(needle));
  check('Shaman specs use Totemic Call, Call of Thunder, updated Stormstrike and Riptide',
    official(classFact('shaman').changes[2], ['Totemic Call', '30 seconds'])
    && official(specFact('shaman', 'elemental').pro.priorities[0], ['Replaces Lava Burst', '5% critical strike chance'])
    && hotfixed(specFact('shaman', 'enhancement').pro.priorities[0], ['100% weapon damage', '8-second cooldown', 'hotfix of 10 November 2026'])
    && official(specFact('shaman', 'restoration').pro.priorities[0], ['no initial heal', '12 seconds']));
  // R4-7 (our 2fcd7c6): the lines citing source 15 report the 10 November talent data. The Shaman list is the Enhancement tree's
  // removedClassic in talents/data.json; the Priest count is its talents whose classic status is "new".
  const removedEnhancement = talents.classes.find(row => row.id === 'shaman').trees.find(tree => tree.id === 'enhancement').removedClassic.map(row => row.name || row);
  const newPriestTalents = talents.classes.find(row => row.id === 'priest').trees.flatMap(tree => tree.talents).filter(row => row.classic && row.classic.status === 'new').length;
  check('the Shaman and Priest snapshot notes report the 10 November talent data apart from the November class changes',
    classFact('shaman').changes.some(row => row.status === 'pinned-data' && row.text.includes('the Enhancement tree in the 10 November talent data no longer has '
      + removedEnhancement.slice(0, -1).join(', ') + ' or ' + removedEnhancement.at(-1)))
    && !classFact('shaman').changes.some(row => row.text.includes('removed: Call of Thunder'))
    && official(classFact('shaman').changes[4], ['Call of Thunder replaces Lava Burst'])
    && classFact('priest').changes[0].status === 'pinned-data' && classFact('priest').changes[0].sources.includes(source9)
    && classFact('priest').changes[0].text.includes('The 10 November talent data has ' + newPriestTalents + ' Priest talents that Classic does not')
    && classFact('priest').changes[0].text.includes('Holy Binding'));
  check('Paladin updates distinguish retired Holy and Protection talents from the new Retribution capstone',
    specFact('paladin', 'holy').beginner.leveling[0].includes('Voice of Truth was removed from the Holy tree')
    && specFact('paladin', 'protection').beginner.leveling[0].includes('Improved Seal of Fury is gone')
    && official(specFact('paladin', 'retribution').pro.priorities[1], ['15 seconds', 'three stacks'])
    && official(specFact('paladin', 'retribution').pro.priorities[2], ['five times']));
  check('Hunter notes retain trap and Sniper Shot mechanics alongside November tuning',
    official(classFact('hunter').changes[1], ['in combat', 'scale with Attack Power', '30-second cooldown'])
    && official(specFact('hunter', 'marksmanship').pro.priorities[2], ['4-second cast', '15-second cooldown', '45-yard range', 'three shots gain 10 yards', 'doubled']));
  // CL2-089, CL2-090 (our e0f7077, owner ruling of 12 Nov "Update data, rewrite presets"): every code moved from revision 260cf99b52db
  // to 02e1e101d1a5, the 33 builds below were re-authored ([digits now, digits before], from guides218.json at e0f7077 and its parent)
  // and every reviewedAt went from 2026-10-31 to 2026-11-12. undoE0f7077 undoes exactly that change and nothing else, so any other
  // code, provenance or order still changes the digest pinned on .279.
  const REAUTHORED_E0F7077 = {
    'warrior-arms-raid-60': ['30323213032215201550500000120000000000000000000000000', '3030521303251520155050000000000000000000000000000000'],
    'warrior-arms-pvp-60': ['05323013132015231050501000000000000005000000000000000', '0332501313201523105050100000000000005000000000000000'],
    'warrior-arms-leveling-30': ['30323013032100000000000000000000000000000000000000000', '3032501303010000000000000000000000000000000000000000'],
    'warrior-fury-raid-60': ['32023010000000000550530055122100231000000000000000000', '3200501000000000055053005152210501000000000000000000'],
    'warrior-fury-leveling-30': ['00000000000000000050530205000100000000000000000000000', '0000000000000000005053025000010000000000000000000000'],
    'warrior-protection-raid-60': ['05023010000000000000000000000000000250533120331021351', '0500501000000000000000000000000000250533120331021351'],
    'warrior-protection-dungeon-30': ['00000000000000000000000000000000000250303020321000000', '0000000000000000000000000000000000250303020321000000'],
    'paladin-holy-raid-60': ['503202150221012515012213000000000005000000000000000', '05320213225111051500230002000000005000000000000000'],
    'paladin-holy-dungeon-30': ['503200150220010000000000000000000000000000000000000', '05320013122101000000000000000000000000000000000000'],
    'paladin-protection-raid-60': ['000000000000000005530213251351153105000000000000000', '00000000000000000553051332133155105000000000000000'],
    'paladin-protection-dungeon-30': ['000000000000000000530212201320000000000000000000000', '00000000000000000053021310131100000000000000000000'],
    'paladin-retribution-raid-60': ['050050000000000005030000000000000005233301201301351', '50003000000000000503000000000000005225331101330321'],
    'paladin-retribution-leveling-30': ['000000000000000000000000000000000005230301201300100', '00000000000000000000000000000000005215301201100000'],
    'hunter-beast-mastery-leveling-30': ['15202205021100000000000000000000000000000000000000', '05202105041100000000000000000000000000000000000000'],
    'rogue-assassination-raid-60': ['005323202515510313023030000000000000002000000000000000', '00502312551521051302303000000000000020000000000000000'],
    'rogue-assassination-leveling-30': ['025300212005010000000000000000000000000000000000000000', '02512000500501000000000000000000000000000000000000000'],
    'rogue-combat-raid-60': ['005303202010000003210330012012321551000000000000000000', '00532012500000000325023000015152310000000000000000000'],
    'rogue-combat-leveling-30': ['000000000000000003200331210011301000000000000000000000', '00000000000000000320033211014100000000000000000000000'],
    'rogue-subtlety-raid-60': ['005203011000000003200030000000000000105203031321021151', '00502300200000000302003000000000003020213310213211501'],
    'rogue-subtlety-pvp-60': ['000000000000000000050332210211000000032233231321221100', '00000000000000000005033212211000000320223310213211050'],
    'shaman-enhancement-raid-60': ['05320000000000000550303100512122510500000000000000', '05320000000000000550320310051122510500000000000000'],
    'shaman-enhancement-leveling-30': ['00000000000000000530303100510000000000000000000000', '00000000000000000510320310051000000000000000000000'],
    'mage-arcane-raid-60': ['05322522312231153150000000000000000003000000000000000', '0552225223121311531230000000000000000000000000000000000'],
    'mage-arcane-leveling-30': ['03200520310131000000000000000000000000000000000000000', '0032005203101310000000000000000000000000000000000000000'],
    'mage-fire-raid-60': ['00000000000000000055523331232133131203000000000000000', '0000000000000000000235523331321351310050000000000000000'],
    'mage-fire-leveling-30': ['00000000000000000005303301200130000000000000000000000', '0000000000000000000205303301001300000000000000000000000'],
    'mage-frost-raid-60': ['02321520000130000000000000000000000053500030121301251', '0302205003001300000000000000000000000555000331021301201'],
    'mage-frost-pvp-60': ['00300000000000000000000000000000000253532333121331251', '0000000000000000000000000000000000002555323331121331251'],
    'mage-frost-leveling-30': ['00000000000000000000000000000000000053032201101300000', '0000000000000000000000000000000000000500223301101300000'],
    'druid-feral-combat-raid-60': ['0000000000000000552302321230101250010550300000000000', '0000000000000000552000321211322120510550300000000000'],
    'druid-feral-combat-dungeon-60': ['0000000000000000552323321231021255100300000000000000', '0000000000000000552323321201320125510300000000000000'],
    'druid-feral-combat-leveling-30': ['0000000000000000502003021230021000000000000000000000', '0000000000000000502003021200320100000000000000000000'],
    'druid-restoration-dungeon-30': ['0000000000000000000000000000000000005053005100110000', '0000000000000000000000000000000000005050035100110000'],
  };
  const undoE0f7077 = ({ id, code, provenance }) => {
    const [, revision, classId, level, digits] = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.(30|60)\.([0-9]+)$/.exec(code) || [];
    const pair = Object.hasOwn(REAUTHORED_E0F7077, id) ? REAUTHORED_E0F7077[id] : [digits, digits];
    const oldCode = revision === '02e1e101d1a5' && pair[0] === digits ? ['ot1', '260cf99b52db', classId, level, pair[1]].join('.') : code;
    const oldProvenance = JSON.stringify(provenance) === '{"kind":"olympus-editorial","reviewedAt":"2026-11-12"}' ? { kind: 'olympus-editorial', reviewedAt: '2026-10-31' } : provenance;
    return { id, code: oldCode, provenance: oldProvenance };
  };
  const presetDigest = presets => crypto.createHash('sha256').update(JSON.stringify(presets.map(({ id, code, provenance }) => undoE0f7077({ id, code, provenance })))).digest('hex');
  const pinnedPresetDigest = '1d1bf9833dde57644f6bf6ef93d0ff64d06c6d4987ab5ca158857a67e438c775';
  // The inverse must refuse: another valid code in a re-authored slot, another reviewedAt, and two presets swapped.
  const tamperedPresets = [clone(DATA.presets), clone(DATA.presets), clone(DATA.presets)];
  tamperedPresets[0][0].code = DATA.presets[1].code;
  tamperedPresets[1][57].provenance.reviewedAt = '2026-11-13';
  [tamperedPresets[2][0], tamperedPresets[2][1]] = [tamperedPresets[2][1], tamperedPresets[2][0]];
  check('the ordered 58 builds, codes and provenance are frozen across factual updates apart from the 10 November re-authoring',
    DATA.presets.length === 58 && presetDigest(DATA.presets) === pinnedPresetDigest && tamperedPresets.every(presets => presetDigest(presets) !== pinnedPresetDigest));
  // CL2-089, CL2-090 (our e0f7077): the re-authored builds no longer take a removed talent; their notes say what was removed or
  // replaced (why[2]) or give the new cap they now take (why[0]).
  const presetWarning = (id, index = 2) => DATA.presets.find(row => row.id === id).why[index];
  check('re-authored builds name the talents that were removed or replaced and the caps they now take',
    presetWarning('druid-feral-combat-raid-60').includes('Berserk and Improved Shifting Power were removed')
    && presetWarning('paladin-protection-raid-60').includes('Improved Seal of Fury and One-Handed Weapon Specialization were removed')
    && presetWarning('rogue-subtlety-pvp-60').includes('Cutthroat was removed')
    && presetWarning('priest-holy-dungeon-30').includes('Holy Binding, which replaced Binding Heal')
    && presetWarning('shaman-elemental-leveling-30').includes('Call of Thunder, which replaced Lava Burst')
    && presetWarning('mage-fire-raid-60', 0).includes('Critical Mass (3/3)')
    && presetWarning('warrior-fury-raid-60', 0).includes('Flurry (3/3'));
  // CL2-089, CL2-090 (our e0f7077): each layout or rank note of a re-authored build, with the rank its code now holds.
  const furtherVerifiedWarnings = [
    ['mage-arcane-leveling-30', 'Missile Barrage', 2, 'Missile Barrage (row 2) and Arcane Resilience (row 1, now three ranks) take two points each'],
    ['mage-fire-leveling-30', 'Improved Fire Blast', 2, 'Improved Fire Blast, now on row 3'],
    ['hunter-beast-mastery-leveling-30', 'Pathfinding', 2, 'Pathfinding, now on row 3'],
    ['shaman-enhancement-raid-60', 'Improved Ghost Wolf', 2, 'Improved Ghost Wolf is on row 4'],
    ['shaman-enhancement-leveling-30', 'Improved Ghost Wolf', 0, 'Improved Ghost Wolf moved to row 4, so it waits until after level 30'],
    ['paladin-retribution-raid-60', 'Conviction', 3, 'Conviction (3/3)'],
    ['paladin-retribution-leveling-30', 'Conviction', 3, 'Conviction (3/3)'],
  ];
  check('each additional November layout or rank note has a matching allocation in its re-authored build code',
    furtherVerifiedWarnings.every(([id, talent, ranks, warning]) => {
      const preset = DATA.presets.find(row => row.id === id);
      const tree = talents.classes.find(row => row.id === preset.classId);
      const index = tree.trees.flatMap(spec => spec.talents).findIndex(row => row.name === talent);
      return calculator.parseBuild(talents, preset.code).build.ranks[index] === ranks && preset.why.some(line => line.includes(warning));
    }));
  // CL2-202 (our 58b96f8): a class address opens the class course, which has no builds, so the attach checks read the first spec's
  // 101 track; with applications closed it shows the reason above the builds and disables Attach (university.js:294, :380).
  m = await university(['class', cls.id, cls.specs[0].id], { canAttach: false, attachReason: 'Applications are closed right now, so a build cannot be attached.', onAttach: () => attached.push('no') });
  const closedButtons = m.box.tags('button').filter(b => text(b) === 'Attach to my application');
  check('with applications closed every attach button is disabled and the reason is shown', closedButtons.length > 0 && closedButtons.every(b => b.disabled) && text(m.box).includes('Applications are closed right now'));
  // CL2-202 (our 58b96f8): #/guides/class/<class> shows the class course with "Class course" current, not the first spec (university.js:450).
  m = await university(['class', cls.id]);
  const noHandler = await university(['class', cls.id, cls.specs[0].id]);
  check('without an attach handler there is no attach button; the class address opens the class course',
    noHandler.box.all(e => e.getAttribute('data-preset')).length > 0 && noHandler.box.tags('button').every(b => text(b) !== 'Attach to my application')
    && text(m.box.tags('h1')[0]) === cls.name && m.box.all(e => e.getAttribute('aria-current') === 'page' && e.getAttribute('href') === '#/guides/class/' + cls.id).map(text).join('|') === 'Class course');
  // INT-UNI-1, CL2-105 (our 2188391): an unknown spec or class gets a "not found" page that says which part is missing (university.js:435, :490-499).
  m = await university(['class', cls.id, 'nope']);
  check('an unknown spec says the class has no spec by that name', text(m.box).includes(cls.name + ' has no spec by that name.'));
  m = await university(['class', 'nope']);
  // Unit h1 guidesname (owner, 15 Nov 2026; the lead's decision in its finishing round): the sentence does not name the
  // section, as the guides pages before 58b96f8 did not ("There is no such guide.").
  check('an unknown class says there is no such guide', text(m.box).includes('There is no such class guide.'));

  // 7. Grades: U renders "Unavailable", never a number.
  // Our 58b96f8, 1fe1725: a grade-U fact renders "Unavailable" in place of a value, with the grade legend (university.js:155, :161-165).
  // The Arms 201 stat-caps chapter cites the grade-U fact class-warrior.hit-cap-at-level-60 (courses/warrior.json, facts/class-warrior.json).
  const uFact = JSON.parse(fs.readFileSync(path.join(stat, 'university/facts/class-warrior.json'), 'utf8')).facts.find(f => f.id === 'class-warrior.hit-cap-at-level-60');
  m = await university(['class', DATA.classes[0].id, DATA.classes[0].specs[0].id, '201']);
  const uClaim = m.box.all(e => e.getAttribute('data-grade') === 'U' && e.tagName === 'LI').find(li => text(li).includes(uFact.label));
  check('an unavailable value renders as "Unavailable" with its legend, never 0', uFact.grade === 'U' && uFact.value === null && !!uClaim && text(uClaim.tags('strong')[0]) === uFact.label && text(uClaim.tags('span')[0]) === 'Unavailable' && m.box.tags('details').some(d => text(d).includes('How to read the grades')));

  // 8. Profession and tools.
  const prof = DATA.professions[0];
  // CL2-059 (our 1fe1725, 58b96f8): a profession guide is a course; the .218 sections became chapters of its 101 and 201 tracks and
  // the gold note is a 201 praxis step (university/professions/alchemy.json).
  m = await university(['profession', prof.key]);
  const prof201 = await university(['profession', prof.key, '201']);
  check('a profession guide shows its sections and the policy-caveated gold note', text(m.box.tags('h1')[0]) === prof.name + ' guide'
    && ['What Forever changes for ' + prof.name, 'Skill ranks, trainers and leveling', 'Raid consumables', 'Gold and the Auction House'].every(t => [...m.box.tags('h3'), ...prof201.box.tags('h3')].some(h => text(h) === t))
    && text(prof201.box).includes(prof.goldNote));
  const attunements = { view: 'tool', tool: 'attunements', talentRevision: talents.revision };
  m = await mounted(attunements);
  const raidSections = DATA.tools.attunements.map(a => m.box.tags('section').find(s => text(s.tags('h2')[0]).startsWith(a.raid)));
  const gearSection = m.box.tags('section').find(s => text(s.tags('h2')[0]) === 'Pre-raid gear checklist');
  const actionLabels = section => section.tags('label').map(text);
  const taskCounts = box => box.all(e => e.getAttribute('role') === 'status').map(text);
  check('only the five concrete Onyxia quest steps are raid checkboxes',
    raidSections.map(s => s.tags('input').length).join('|') === '5|0|0'
    && actionLabels(raidSections[0]).join('|') === '1. Burning Steppes|2. The True Masters|3. Blackrock Depths|4. Stormwind|5. Upper Blackrock Spire');
  const [slots, prep] = gearSection.tags('ul').filter(list => list.className === 'guides218-checklist');
  check('the sixteen gear slots use reader-facing names and only five pre-raid rows are actions',
    actionLabels(slots).join('|') === 'Head|Neck|Shoulders|Back|Chest|Wrists|Hands|Waist|Legs|Feet|Ring 1|Ring 2|Trinket 1|Trinket 2|Main hand|Off hand / Ranged'
    && actionLabels(prep).join('|') === 'Start the Onyxia attunement early|Build fire resistance for Onyxia|Run the new max-level dungeons|Plan with Forever tools|Plan raid buffs');
  const rowFor = (section, label) => section.tags('li').find(li => [...li.tags('strong'), ...li.tags('label')].some(e => text(e) === label));
  const evidenceShown = (section, claim, action) => {
    const row = rowFor(section, claim.label);
    return !!row && row.getAttribute('data-grade') === claim.grade && !!row.tags('input').length === action
      && text(row).includes(claim.value === null ? 'Unavailable' : claim.value)
      && (!claim.note || text(row).includes(claim.note))
      && claim.sources.every(index => links(row).includes(DATA.sources[index].url));
  };
  check('the raid requirements, preparation references and gear guidance retain each grade, value, note and source',
    DATA.tools.attunements.every((a, i) => evidenceShown(raidSections[i], a.requirement, false)
      && a.steps.every(row => evidenceShown(raidSections[i], row, row.kind === 'action')))
    && DATA.tools.preBis.checklist.every(row => evidenceShown(gearSection, row, row.kind === 'action'))
    && DATA.tools.preBis.slots.every(slot => evidenceShown(slots, slot.guidance, true)));
  const firstRequirement = rowFor(raidSections[0], DATA.tools.attunements[0].requirement.label);
  const firstSlot = rowFor(slots, DATA.tools.preBis.slots[0].guidance.label);
  check('claim and nested gear labels are visually distinct from the evidence beneath them',
    [firstRequirement, firstSlot].every(row => row?.tags('strong')[0]?.className === 'guides218-claim-label')
    && /\.guides218-claim-label\s*\{[^}]*display\s*:\s*block[^}]*font-weight\s*:\s*600/.test(CSS));
  const allBoxes = m.box.tags('input'), labelTargets = m.box.tags('label').map(e => e.getAttribute('for'));
  check('all 26 checkbox labels are associated and the page-only notice appears once',
    allBoxes.length === 26 && new Set(labelTargets).size === 26
    && allBoxes.every(box => box.getAttribute('type') === 'checkbox' && labelTargets.includes(box.getAttribute('id')))
    && text(m.box).split('Ticks stay on this page only').length === 2);
  const actionClaims = [
    ...DATA.tools.attunements.flatMap(raid => raid.steps.filter(row => row.kind === 'action')),
    ...DATA.tools.preBis.slots.map(slot => slot.guidance),
    ...DATA.tools.preBis.checklist.filter(row => row.kind === 'action'),
  ];
  check('each checklist checkbox has its own instruction, expanded evidence grade and any note as its description',
    new Set(allBoxes.map(box => box.getAttribute('aria-describedby'))).size === 26
    && allBoxes.every((box, index) => {
      const claim = actionClaims[index], id = box.getAttribute('aria-describedby');
      const description = box.parentNode.all(node => id && node.getAttribute('id') === id)[0];
      return description && text(description).includes(claim.value ?? 'Unavailable')
        && description.tags('abbr')[0].getAttribute('aria-label') === DATA.grades[claim.grade]
        && (!claim.note || text(description).includes(claim.note)) && links(description).length === 0;
    }));
  const questInput = raidSections[0].tags('input')[0], slotInput = slots.tags('input')[0], prepInput = prep.tags('input')[0];
  questInput.checked = true; questInput.fire('change');
  slotInput.checked = true; slotInput.fire('change');
  check('checking quest and gear tasks updates only their two counters', taskCounts(m.box).join('|') === '1 of 5 done.|1 of 16 done.|0 of 5 done.');
  questInput.checked = false; questInput.fire('change');
  prepInput.checked = true; prepInput.fire('change');
  check('unchecking restores the quest count without changing other tasks', taskCounts(m.box).join('|') === '0 of 5 done.|1 of 16 done.|1 of 5 done.');
  m.instance.destroy();
  const reopened = m.api.mount(m.box, attunements);
  await settle(); await settle();
  check('reopening the same cached catalogue starts with every checkbox and counter reset',
    m.fetches.length === 1 && m.box.tags('input').length === 26 && m.box.tags('input').every(box => !box.checked)
    && taskCounts(m.box).join('|') === '0 of 5 done.|0 of 16 done.|0 of 5 done.');
  reopened.destroy();
  const legacyAttunements = clone(DATA);
  for (const row of [...legacyAttunements.tools.attunements.flatMap(a => a.steps), ...legacyAttunements.tools.preBis.checklist]) delete row.kind;
  const legacyChecklist = await mounted(attunements, legacyAttunements);
  check('an older catalogue retains readable references and does not guess which ones are tasks',
    legacyChecklist.box.tags('input').length === 16 && text(legacyChecklist.box).includes(legacyAttunements.tools.attunements[0].steps[5].note));
  const buffTool = { view: 'tool', tool: 'buffs', talentRevision: talents.revision };
  m = await mounted(buffTool);
  const liveTotals = box => box.all(e => e.getAttribute('role') === 'status' && e.getAttribute('aria-live') === 'polite')[0];
  const encounter = (box, id) => liveTotals(box).all(e => e.getAttribute('data-buff-context') === id)[0];
  const figures = (box, id) => encounter(box, id).tags('li').map(text).sort().join('|');
  const buffInput = (box, id) => box.tags('input').find(input => input.getAttribute('id') === 'guides218-buff-' + id);
  const choose = (box, id, checked = true) => { const input = buffInput(box, id); input.checked = checked; input.fire('change'); };
  const filterRole = (box, value) => { const select = box.tags('select')[0]; select.value = value; select.fire('change'); };
  const badge = (box, id) => text(buffInput(box, id).parentNode.all(e => e.className === 'guides218-status')[0]);
  const universal = ['major-healing-potion', 'fire-protection-potions', 'forever-food-changes', 'first-aid-curatives', 'scrolls'];
  const visibleConsumables = box => box.tags('label').filter(label => text(label).endsWith(' · Consumable')).length;
  for (const [role, expected] of [['', 24], ['tank', 13], ['healer', 10], ['melee', 12], ['ranged', 8], ['caster', 13]]) {
    filterRole(m.box, role);
    assert.equal(visibleConsumables(m.box), expected, role);
    assert.ok(universal.every(id => buffInput(m.box, id)) && DATA.tools.worldBuffs.every(r => buffInput(m.box, r.id)), role);
  }
  filterRole(m.box, 'ranged');
  const hunterSource = DATA.sources.findIndex(s => s.url === 'https://www.warcrafttavern.com/wow-classic/guides/pve-marksmanship-hunter-enchants-consumables/');
  check('each role retains universal consumables and ranged includes both cited Classic Hunter elixirs',
    visibleConsumables(m.box) === 8 && hunterSource >= 0
    && ['elixir-of-the-mongoose', 'elixir-of-greater-agility'].every(id => buffInput(m.box, id)
      && DATA.tools.consumables.some(r => r.id === id && r.grade === 'E' && r.sources.includes(hunterSource))));
  filterRole(m.box, '');
  check('raid status badges distinguish outside raid, unestimated and reference effects',
    ['rallying-cry', 'songflower-serenade', 'dire-maul-tribute', 'warchiefs-blessing'].every(id => badge(m.box, id) === 'Outside raid preview')
    && badge(m.box, 'camp-buffs') === 'No raid estimate' && badge(m.box, 'elixir-of-cunning') === 'Raid reference');
  choose(m.box, 'rallying-cry');
  check('Rallying Cry contributes its five exact values in open world and none inside a raid',
    figures(m.box, 'open-world') === 'Attack power: +140|Critical strike %: +10|Healing: +80|Spell critical %: +10|Spell power: +80'
    && figures(m.box, 'raid') === '' && text(liveTotals(m.box)).includes('omitted from raid totals'));
  choose(m.box, 'elixir-of-the-grizzly');
  choose(m.box, 'elixir-of-cunning');
  check('the same visible selection produces different open-world and raid reference totals',
    figures(m.box, 'open-world') === 'Agility: +25|Attack power: +140|Critical strike %: +12|Healing: +80|Intellect: +25|Spell critical %: +10|Spell power: +80|Strength: +25'
    && figures(m.box, 'raid') === 'Agility: +25|Critical strike %: +2|Intellect: +25|Strength: +25');
  filterRole(m.box, 'ranged');
  check('changing to Ranged excludes the hidden Grizzly pick from both previews and discloses it',
    !buffInput(m.box, 'elixir-of-the-grizzly') && buffInput(m.box, 'elixir-of-cunning').checked
    && text(liveTotals(m.box)).includes('2 selected in this view') && text(liveTotals(m.box)).includes('1 hidden by the role filter')
    && figures(m.box, 'open-world') === 'Agility: +25|Attack power: +140|Critical strike %: +10|Healing: +80|Intellect: +25|Spell critical %: +10|Spell power: +80'
    && figures(m.box, 'raid') === 'Agility: +25|Intellect: +25');
  filterRole(m.box, '');
  check('restoring Every role restores hidden picks and their exact effects', buffInput(m.box, 'elixir-of-the-grizzly').checked
    && !text(liveTotals(m.box)).includes('hidden by the role filter') && figures(m.box, 'raid').includes('Strength: +25'));
  choose(m.box, 'rallying-cry', false);
  choose(m.box, 'elixir-of-the-grizzly', false);
  choose(m.box, 'elixir-of-cunning', false);
  choose(m.box, 'songflower-serenade');
  choose(m.box, 'juju-ember');
  check('Classic numeric references stay marked in each relevant context with recorded durations',
    figures(m.box, 'open-world') === 'Agility: +15|Critical strike %: +5|Fire resistance: +15|Intellect: +15|Spell critical %: +5|Spirit: +15|Stamina: +15|Strength: +15'
    && figures(m.box, 'raid') === 'Fire resistance: +15'
    && ['open-world', 'raid'].every(id => text(encounter(m.box, id)).includes('not Forever-verified')
      && text(encounter(m.box, id)).includes('Shortest recorded duration: 10 min.')));
  const songflower = buffInput(m.box, 'songflower-serenade').parentNode;
  const tribute = buffInput(m.box, 'dire-maul-tribute').parentNode;
  check('Songflower and all three Dire Maul effects cite exact Classic spell IDs and versioned original client data',
    text(songflower).includes('melee, ranged and spell critical strike chance (spell 15366)')
    && text(tribute).includes("Mol'dar's Moxie increases total Stamina by 15% (spell 22818)")
    && text(tribute).includes("Fengus' Ferocity adds 200 attack power (22817)")
    && text(tribute).includes("Slip'kik's Savvy adds 3 percentage points of spell critical strike chance (22820)")
    && [songflower, tribute].every(row => links(row).includes('https://wago.tools/db2/SpellEffect/csv?build=1.15.9.69722')));
  choose(m.box, 'major-mana-potion');
  check('both encounter summaries separate recorded durations from selections without a recorded duration',
    text(encounter(m.box, 'open-world')).includes('1 of 3 selections without a recorded duration.')
    && text(encounter(m.box, 'raid')).includes('1 of 2 selections without a recorded duration.')
    && ['open-world','raid'].every(id => text(encounter(m.box,id)).includes('Shortest recorded duration: 10 min.'))
    && text(buffInput(m.box,'major-mana-potion').parentNode).includes('No duration recorded.'));
  choose(m.box, 'major-mana-potion', false);
  const comparison = m.box.all(node => node.getAttribute('data-classic-flask') !== null)[0];
  const flaskIds = ['the-titans', 'distilled-wisdom', 'supreme-power'];
  check('three grade-E flask rows use unique Classic spell IDs, one described native radio group and original tooltips',
    flaskIds.map(id => flaskRow(DATA,id).classicFlaskSpellId).join(',') === '17626,17627,17628'
    && flaskIds.every(id => {
      const input = buffInput(m.box, 'flask-of-' + id), row = flaskRow(DATA, id);
      return row.grade === 'E' && row.durationMin === 120 && row.stats === undefined
        && input.getAttribute('type') === 'radio' && input.getAttribute('name') === 'guides218-classic-flask'
        && input.getAttribute('aria-describedby') === 'guides218-classic-flask-rule'
        && text(input.parentNode).includes('Classic spell ' + row.classicFlaskSpellId)
        && links(input.parentNode).includes('https://wago.tools/db2/Spell/csv?build=1.15.9.69722');
    }) && text(comparison).includes('One flask can be active at a time'));
  const encounterBefore = ['open-world','raid'].map(id => figures(m.box,id));
  choose(m.box, 'flask-of-the-titans');
  check('the separate comparison shows Titans with 1,200 maximum health and its recorded duration',
    text(comparison).includes('+1,200 maximum health') && text(comparison).includes('Recorded duration: 120 min.'));
  choose(m.box, 'flask-of-distilled-wisdom');
  check('selecting Distilled Wisdom replaces Titans and does not change either encounter',
    text(comparison).includes('+2,000 maximum mana') && !text(comparison).includes('+1,200 maximum health')
    && !buffInput(m.box, 'flask-of-the-titans').checked && buffInput(m.box, 'flask-of-distilled-wisdom').checked
    && ['open-world','raid'].every((id,index) => figures(m.box,id) === encounterBefore[index]));
  choose(m.box, 'flask-of-supreme-power');
  filterRole(m.box, 'tank');
  check('role filtering preserves the separate choice without lending its effect to an encounter',
    !buffInput(m.box, 'flask-of-supreme-power') && text(comparison).includes('Up to +150 spell damage')
    && ['open-world','raid'].every(id => !text(encounter(m.box,id)).includes('+150')));
  filterRole(m.box, '');
  comparison.tags('button').find(button => text(button) === 'Clear flask choice').fire('click');
  check('the separate flask comparison can be cleared without clearing an encounter selection',
    text(comparison).includes('Choose a Classic flask') && flaskIds.every(id => !buffInput(m.box, 'flask-of-' + id).checked)
    && ['open-world','raid'].every((id,index) => figures(m.box,id) === encounterBefore[index]));
  const legacyBuffs = clone(DATA);
  for (const id of flaskIds) delete flaskRow(legacyBuffs,id).classicFlaskSpellId;
  const legacyBuffTool = await mounted(buffTool, legacyBuffs);
  check('older catalogues retain ordinary choices without a fabricated flask comparison',
    flaskIds.every(id => buffInput(legacyBuffTool.box,'flask-of-' + id).getAttribute('type') === 'checkbox')
    && !legacyBuffTool.box.all(node => node.getAttribute('data-classic-flask') !== null).length);
  choose(m.box, 'songflower-serenade', false);
  choose(m.box, 'juju-ember', false);
  choose(m.box, 'camp-buffs');
  check('a camp buff without a recorded figure stays visible and out of raid totals',
    text(encounter(m.box, 'open-world')).includes('No numeric effects recorded') && figures(m.box, 'raid') === ''
    && text(liveTotals(m.box)).includes('without a raid estimate are omitted'));
  const uncertain = clone(DATA);
  uncertain.tools.worldBuffs.find(r => r.id === 'camp-buffs').stats = { stamina: 17 };
  const uncertainTool = await mounted(buffTool, uncertain);
  choose(uncertainTool.box, 'camp-buffs');
  check('an unestimated raid context still excludes a numeric effect from the raid preview',
    figures(uncertainTool.box, 'open-world') === 'Stamina: +17' && figures(uncertainTool.box, 'raid') === '');
  m = await mounted({ view: 'tool', tool: 'changes', talentRevision: talents.revision });
  check('the compendium shows the class table with every class and a calculator link each', m.box.tags('tr').length === 10 && DATA.classSummary.every(x => links(m.box).includes('#/talents/' + x.id)));
  const classLabels = m.box.tags('tr').slice(1).map(row => text(row.tags('th')[0]));
  const alphabetical = DATA.classSummary.map(row => row.name).sort((a, b) => a.localeCompare(b, 'en'));
  check('the compendium renders alphabetical class labels from Druid to Warrior',
    JSON.stringify(classLabels) === JSON.stringify(alphabetical) && classLabels[0] === 'Druid' && classLabels.at(-1) === 'Warrior');
  const raidAura = DATA.tools.whatChanged.find(row => row.topic === 'Raid auras');
  check('the raid aura compendium retains the October raid-wide coverage and November crit conflict rule',
    official(raidAura, ['Battle Shout', 'Trueshot Aura', 'Grace of Air', 'Strength of Earth', 'Windfury', 'Flametongue', 'mutually exclusive'])
    && raidAura.sources.includes(49));
  const legacy = DATA.tools.whatChanged.find(row => row.topic === 'Legacy challenges and spending');
  check('the Legacy challenge count and spending cap appear with Blizzard’s official article',
    legacy?.status === 'announced' && legacy.text.includes('65 Legacy Challenges') && legacy.text.includes('16 points per character')
    && legacy.sources.some(index => DATA.sources[index].url === 'https://news.blizzard.com/en-us/article/24307383'));
  const structureUrl = '#/guides/tools/raid-structure';
  // CL2-057 (our 58b96f8, ab493c0): the University hub lists the four tools in its "Hub tools" section.
  const hubWithStructure = await university([]);
  const raidTools = hubWithStructure.box.tags('section').find(s => text(s.tags('h2')[0]) === 'Hub tools');
  check('Hub tools links to Fox’s guide', !!raidTools && links(raidTools).includes(structureUrl));
  m = await mounted({ view: 'tool', tool: 'raid-structure', talentRevision: talents.revision });
  const assignments = m.box.tags('tbody')[0]?.tags('tr').map(row =>
    text(row.tags('td')[0]).match(/\d–\d/g)?.join(','));
  check('Fox’s guide credits the author and groups one roster into four 10s, two 20s and one 40',
    text(m.box.tags('h1')[0]) === 'Raid team structure & leadership' && text(m.box).includes('akaFoxSlayer')
    && assignments?.join('|') === '1–2,3–4,5–6,7–8|1–4,5–8|1–8');
  check('the raid grouping table names the first Forever raids with their announced capacities',
    m.box.tags('tbody')[0]?.tags('th').map(text).join('|') === 'Barrow Deeps · 10 players|Hyjal Summit · 20 players|Onyxia’s Lair · 40 players'
    && text(m.box).includes('9 December 2026') /* CL2-177 (12 Nov 2026): a dated unlock fact */ && links(m.box).includes('https://worldofwarcraft.blizzard.com/en-us/news/24303009'));
  const raidPublisher = m.box.tags('a').find(a => a.getAttribute('href') === 'https://worldofwarcraft.blizzard.com/en-us/news/24303009');
  check('Fox’s guide uses the same safe external window and referrer policy for the publisher link',
    raidPublisher?.getAttribute('target') === '_blank' && raidPublisher.getAttribute('rel') === 'noopener noreferrer');
  check('farm rotation advice links directly to the governing article', links(m.box).includes('#/governance/the-guild-statute-of-olympus/article-s11')
    && text(m.box).includes('affected participants’ consent'));
  m = await mounted({ view: 'tool', tool: 'nope', talentRevision: talents.revision });
  check('an unknown tool says so', text(m.box).includes('There is no such tool.'));
  // Unit h1 guidesname (owner, 15 Nov 2026: "Instead of university rename it back to its old name that it had for the guides."):
  // the tool pages name the section as GUIDES_TITLE did before 58b96f8, "Class & profession guides": the breadcrumb root, the
  // hub link of the Related list and the way back from an unknown tool.
  const toolNames = [];
  for (const tool of ['attunements', 'buffs', 'raid-structure', 'changes']) {
    const t = await mounted({ view: 'tool', tool, talentRevision: talents.revision });
    const root = t.box.all(e => e.getAttribute('aria-label') === 'Breadcrumb').map(n => n.tags('a')[0]);
    const hubLinks = t.box.all(e => e.getAttribute('aria-label') === 'Related').flatMap(n => n.tags('a')).filter(a => a.getAttribute('href') === '#/guides');
    toolNames.push([...root.map(a => [text(a), a.getAttribute('href')]), ...hubLinks.map(text)]);
  }
  const toolBack = m.box.tags('a').filter(a => a.getAttribute('href') === '#/guides').map(text);
  check('the tool pages name the section Class & profession guides in the breadcrumb, the Related list and the way back',
    JSON.stringify(toolNames) === JSON.stringify(Array(4).fill([['Class & profession guides', '#/guides'], 'Class & profession guides'])) && JSON.stringify(toolBack) === '["Back to Class & profession guides"]');

  // 9. External links, failure, revision mismatch and teardown.
  // Our 58b96f8: the class course renders its source links with external() (university.js:136), only for allow-listed https hosts.
  m = await university(['class', DATA.classes[2].id]);
  const external = m.box.tags('a').filter(a => /^https:/.test(a.getAttribute('href') || ''));
  check('external source links open safely and only on listed hosts', external.length > 0 && external.every(a => a.getAttribute('target') === '_blank' && a.getAttribute('rel') === 'noopener noreferrer'));
  const sourceLines = box => box.all(node => node.className === 'guides218-sources');
  const topic = 'https://us.forums.blizzard.com/en/wow/t/2360696';
  check('the three topic aliases converge without changing the dated notes',
    [1, 17, 118].every(index => DATA.sources[index].url === topic && DATA.sources[index].kind === 'official')
    && [[47, 4], [48, 5], [49, 6], [50, 7], [150, 9]].every(([index, post]) => DATA.sources[index].url === topic + '/' + post));
  const citationFixture = clone(DATA);
  const publisherPrefixed = DATA.sources.findIndex(source => source.label.startsWith(source.publisher + ': '));
  citationFixture.classes[0].changes[0].sources = [1, 1, 17, 118, 150, 86, publisherPrefixed];
  const citation = await mounted({ view: 'class', classId: DATA.classes[0].id, talentRevision: talents.revision }, citationFixture);
  const [baseTopicLink, datedPostLink, playerPostLink, prefixedTitleLink] = sourceLines(citation.box)[0].tags('a');
  check('a citation combines same-topic aliases and keeps every source title and the exact dated post',
    links(sourceLines(citation.box)[0]).join('|') === [topic, topic + '/9', DATA.sources[86].url, DATA.sources[publisherPrefixed].url].join('|')
    && text(baseTopicLink) === 'Blizzard Entertainment — ' + [1, 17, 118].map(index => DATA.sources[index].label).join(' / ')
    && text(datedPostLink) === 'Blizzard Entertainment — ' + DATA.sources[150].label);
  // Our 1fe1725, 58b96f8: the courses cite these sources as g218-<n> (university/sources.json) through university.js sourcesLine
  // (:145-151). The Druid class course cites the player report g218-86, the Paladin class course the publisher-prefixed g218-18.
  const uniSourceLink = (box, url) => box.all(node => node.className === 'uni-sources').flatMap(line => line.tags('a')).find(a => a.getAttribute('href') === url);
  const uniPlayerPost = uniSourceLink((await university(['class', 'druid'])).box, DATA.sources[86].url);
  check('Blizzard hosts player posts without getting publisher credit for their claims',
    [86, 120].every(index => DATA.sources[index].kind === 'community' && DATA.sources[index].publisher === 'Blizzard forums (player posts)')
    && !!uniPlayerPost && text(uniPlayerPost).startsWith('Blizzard forums (player posts) — Beta player report'));
  const prefixed = DATA.sources[publisherPrefixed];
  const uniPrefixed = uniSourceLink((await university(['class', 'paladin'])).box, prefixed.url);
  check('a source title starting with its publisher renders that publisher once and keeps its topic',
    !!uniPrefixed && text(uniPrefixed) === prefixed.publisher + ' — ' + prefixed.label.slice(prefixed.publisher.length + 2));
  // CL2-052, CL2-057 (our 58b96f8): the class, spec and profession pages are University courses (university.js), and the
  // course and tool breadcrumbs start at the hub ("Class & profession guides" again since unit h1 guidesname). Site fault f1 (15 Nov 2026): a course credits the Talents
  // Forever data once exactly when it cites a Talents Forever source or shows a talent build; the changes tool keeps its credit.
  // f1 review round: also when an overview point, praxis step or common mistake of the page (default track 101) rests on a fact
  // citing a Talents Forever source; that text shows no citation, so it is read from the University data files.
  const uniRead = rel => JSON.parse(fs.readFileSync(path.join(stat, 'university', rel), 'utf8'));
  const tfIds = new Set(uniRead('sources.json').sources.filter(s => s.publisher === 'Talents Forever').map(s => s.id));
  const uniFacts = new Map(fs.readdirSync(path.join(stat, 'university', 'facts')).filter(f => f.endsWith('.json')).flatMap(f => { const d = uniRead('facts/' + f); return d.facts.map(x => [x.id, { ...(d.defaults || {}), ...x }]); }));
  const tfText = ([kind, id, spec]) => {
    const g = uniRead(uniRead('index.json').guides.find(e => e.kind === kind && e.id === id).file), owner = spec ? g.specs.find(s => s.id === spec) : g;
    return [...owner.overview.points.map(p => p.facts || []), ...owner.tracks['101'].chapters.filter(c => c.unavailable === undefined && c.praxis)
      .flatMap(c => [...c.praxis.steps.map(s => s.facts || []), ...c.praxis.mistakes.map(m => m.facts)])].some(ids => ids.some(f => uniFacts.get(f).sources.some(s => tfIds.has(s))));
  };
  const guideViews = [
    ...DATA.classes.flatMap(c => [['class', c.id], ...c.specs.map(s => ['class', c.id, s.id])]),
    ...DATA.professions.map(p => ['profession', p.key]),
    ...['attunements', 'buffs', 'raid-structure', 'changes'].map(tool => ({ view: 'tool', tool }))
  ];
  for (const opts of guideViews) {
    const course = Array.isArray(opts);
    const { box } = course ? await university(opts) : await mounted({ ...opts, talentRevision: talents.revision });
    const purposeByName = new Map();
    const citationLines = course ? box.all(node => node.className === 'uni-sources') : sourceLines(box);
    for (const line of citationLines) {
      const anchors = line.tags('a');
      assert.equal(new Set(links(line)).size, anchors.length, JSON.stringify(opts) + ': repeated destination in one citation');
      for (const a of anchors) {
        const [name, href] = [text(a), a.getAttribute('href')];
        assert.match(name, /^.+ — .+$/, JSON.stringify(opts) + ': source title missing');
        const [publisher, title] = name.split(' — ', 2);
        assert.ok(!title.startsWith(publisher + ': ') && !title.startsWith(publisher + ' '), JSON.stringify(opts) + ': repeated publisher');
        assert.ok(!purposeByName.has(name) || purposeByName.get(name) === href, JSON.stringify(opts) + ': same link name identifies different sources');
        purposeByName.set(name, href);
      }
    }
    const credit = box.all(e => e.className.includes(course ? 'uni-talent-credit' : 'guides218-talent-credit'));
    const talentData = course && (citationLines.some(line => line.tags('a').some(a => text(a).startsWith('Talents Forever — '))) || box.all(e => e.getAttribute('data-preset') !== null).length > 0 || tfText(opts));
    assert.equal(credit.length, talentData || opts.tool === 'changes' ? 1 : 0, JSON.stringify(opts));
    if (credit.length) {
      assert.deepEqual(links(credit[0]), ['https://talentsforever.com/', 'https://creativecommons.org/licenses/by/4.0/']);
      assert.equal(text(credit[0]).match(/CC BY 4\.0/g).length, 1);
    }
    assert.ok(box.tags('a').filter(a => /^https:/.test(a.getAttribute('href') || ''))
      .every(a => a.getAttribute('target') === '_blank' && a.getAttribute('rel') === 'noopener noreferrer'), JSON.stringify(opts));
    const breadcrumbs = box.all(e => e.getAttribute('aria-label') === 'Breadcrumb')[0];
    assert.equal(text(breadcrumbs.tags('a')[0]), 'Class & profession guides');
  }
  check('all guide pages use distinct names for different citations, safe source links, relevant credits and consistent breadcrumbs', guideViews.length === 52);
  let calls = 0; const failing = page(async () => { calls++; return { ok: false, status: 503, json: async () => ({}) }; });
  failing.api.mount(failing.box, { view: 'hub', talentRevision: talents.revision }); await settle(); await settle();
  check('a failed catalogue read says so and does not show part of a page', text(failing.box).includes('The guides could not be loaded.') && failing.box.tags('h1').length === 0);
  failing.api.mount(failing.box, { view: 'hub', talentRevision: talents.revision }); await settle(); await settle();
  check('a later visit asks again after a failure', calls === 2);
  m = await mounted({ view: 'hub', talentRevision: '111111111111' });
  check('a catalogue for another talent revision is refused as a whole', text(m.box).includes('The guides could not be loaded.'));
  m = await mounted({ view: 'hub', talentRevision: talents.revision });
  const before = m.box.childNodes.length; m.instance.destroy();
  check('destroy removes the page and its listeners', before === 1 && m.box.childNodes.length === 0);
  console.log(`\n${count} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
