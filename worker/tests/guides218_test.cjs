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
  const hubLinks = links(m.box);
  check('the hub retains all existing class, spec, profession and tool links', DATA.classes.every(c => hubLinks.includes('#/guides/class/' + c.id) && c.specs.every(s => hubLinks.includes('#/guides/class/' + c.id + '/' + s.id)))
    && DATA.professions.every(p => hubLinks.includes('#/guides/profession/' + p.key)) && ['attunements', 'buffs', 'changes'].every(t => hubLinks.includes('#/guides/tools/' + t)));
  check('the hub keeps the calculator, addons, publisher library, game updates and member guide one click away', ['#/talents', '#/addons', '#/guides', '#/updates', '#/guide/member'].every(h => hubLinks.includes(h)));
  check('the hub has one Class & profession guides heading and states the scope note once',
    m.box.tags('h1').map(text).join('|') === 'Class & profession guides' && text(m.box).split(DATA.scopeNote.slice(0, 60)).length === 2);
  const classLandingLinks = hubLinks.filter(h => /^#\/guides\/class\/[a-z]+$/.test(h));
  const professionHeadings = m.box.tags('h3').map(text).filter(t => ['Primary crafting', 'Gathering', 'Secondary'].includes(t));
  check('the hub alphabetizes classes and groups professions by the kind of training',
    classLandingLinks.join(',') === [...classLandingLinks].sort().join(',') && professionHeadings.join(',') === 'Primary crafting,Gathering,Secondary');
  check('class and profession icons are local official art only', m.box.tags('img').every(i => /^\/static\/wow\/(class|prof|role)-[a-z_]+\.png$/.test(i.getAttribute('src'))));
  check('exactly one same-origin catalogue fetch', m.fetches.length === 1 && m.fetches[0][0] === '/static/guides218.json' && m.fetches[0][1].redirect === 'error');

  // 6. Class view, presets and attach.
  const attached = [];
  const cls = DATA.classes[0], spec = cls.specs[1];
  m = await mounted({ view: 'class', classId: cls.id, specId: spec.id, talentRevision: talents.revision, canAttach: true, onAttach: p => attached.push(p) });
  check('the class view names the class, marks the chosen spec and shows its sections', m.box.tags('h1').length === 1 && text(m.box.tags('h1')[0]) === cls.name + ' guide'
    && m.box.all(e => e.getAttribute('aria-current') === 'page' && e.getAttribute('href') === '#/guides/class/' + cls.id + '/' + spec.id).length === 1
    && [spec.name + ': quick start', spec.name + ': advanced', spec.name + ': PvP', spec.name + ': talent starting points', spec.name + ': talent tree changes'].every(t => m.box.tags('h2').some(h => text(h) === t)));
  const cards = m.box.all(e => e.getAttribute('data-preset'));
  check('historical preset codes stay visible with an explicit beta snapshot label', cards.length > 0 && cards.every(card => text(card).includes('Beta snapshot build')));
  check('the saved builds carry one shared caution, with short card headings and no visible revision hash',
    text(m.box).split('Compare these saved builds with Blizzard’s current talent notes').length === 2
    && cards.every(card => !text(card).includes(DATA.talentRevision) && !text(card.tags('h3')[0]).startsWith('Olympus starting point'))
    && !text(m.box).includes('Talent snapshot Talent snapshot'));
  check('every preset of the spec renders once with its exact calculator link', cards.length === spec.presets.length && spec.presets.every(id => { const p = DATA.presets.find(x => x.id === id), card = cards.find(c => c.getAttribute('data-preset') === id);
    return card && card.tags('a').some(a => a.getAttribute('href') === '#/talents/' + p.classId + '/' + encodeURIComponent(p.code) && text(a) === 'Load this build in the talent calculator'); }));
  const attachButton = cards[0].tags('button').find(b => text(b) === 'Attach to my application');
  attachButton.fire('click');
  const first = DATA.presets.find(x => x.id === spec.presets[0]);
  check('Attach hands over exactly the preset identity and build, frozen, and says what happens next', attached.length === 1 && Object.isFrozen(attached[0]) && JSON.stringify(attached[0]) === JSON.stringify({ presetId: first.id, label: first.label, classId: first.classId, level: first.level, code: first.code })
    && text(cards[0]).includes('Opening your application with this build'));
  const feralGuide = await mounted({ view: 'class', classId: 'druid', specId: 'feral-combat', talentRevision: talents.revision });
  check('Feral instructions use the current first-party tuning while the build codes retain their snapshot',
    text(feralGuide.box).includes('Berserk was removed') && text(feralGuide.box).includes('115% threat bonus')
    && !text(feralGuide.box).includes('Berserk lasts 15 s')
    && links(feralGuide.box).includes('https://us.forums.blizzard.com/en/wow/t/2360696/9'));
  const arcaneSnapshot = DATA.presets.find(entry => entry.id === 'mage-arcane-raid-60');
  check('the historical Arcane raid preset flags its points in the removed Arcane Focus talent',
    arcaneSnapshot?.why.some(text => text.includes('still contains points in Arcane Focus') && text.includes('Blizzard removed that talent')));
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
  check('the Fury leveling preset distinguishes its October allocation from the November Flurry rule',
    furyLeveling?.why.some(line => line.includes('October build takes Death Wish') && line.includes('Flurry no longer depends on it')));
  check('class overviews defer shared editorial scope to the current catalogue header',
    DATA.classes.every(entry => entry.overview.every(line => !line.startsWith('Besides the talent snapshot, this page uses Blizzard'))));
  check('Priest Holy Binding and Shadow Word: Death cite the official November update',
    official(classFact('priest').changes[7], ['replaced Binding Heal with Holy Binding', '30% of maximum health', 'no backlash on a miss'])
    && specFact('priest', 'holy').beginner.tips[2].includes('half the amount'));
  check('Rogue current rows explain Shank, Death Mark and retired talents',
    official(classFact('rogue').changes[5], ['loses Murder', 'Shank'])
    && official(classFact('rogue').changes[7], ['Quietus', 'Cutthroat', 'Thousand Cuts', 'Death Mark'])
    && official(specFact('rogue', 'subtlety').pro.priorities[1], ['Rupture and Garrote', '15%']));
  check('Shaman specs use Totemic Call, Call of Thunder, updated Stormstrike and Riptide',
    official(classFact('shaman').changes[2], ['Totemic Call', '30 seconds'])
    && official(specFact('shaman', 'elemental').pro.priorities[0], ['Replaces Lava Burst', '5% critical strike chance'])
    && official(specFact('shaman', 'enhancement').pro.priorities[0], ['150% normalized weapon damage', 'six-second cooldown'])
    && official(specFact('shaman', 'restoration').pro.priorities[0], ['no initial heal', '12 seconds']));
  check('the Shaman and Priest snapshot notes distinguish historical entries from the November class changes',
    classFact('shaman').changes.some(row => row.status === 'pinned-data' && row.text.includes('The October snapshot had no Call of Thunder in Elemental'))
    && !classFact('shaman').changes.some(row => row.text.includes('removed: Call of Thunder'))
    && official(classFact('shaman').changes[4], ['Call of Thunder replaces Lava Burst'])
    && classFact('priest').changes[0].status === 'pinned-data' && classFact('priest').changes[0].sources.includes(source9)
    && classFact('priest').changes[0].text.includes('Binding Heal (since replaced by Holy Binding)'));
  check('Paladin updates distinguish retired Holy and Protection talents from the new Retribution capstone',
    specFact('paladin', 'holy').beginner.leveling[0].includes('Voice of Truth was removed from the Holy tree')
    && specFact('paladin', 'protection').beginner.leveling[0].includes('Improved Seal of Fury is gone')
    && official(specFact('paladin', 'retribution').pro.priorities[1], ['15 seconds', 'three stacks'])
    && official(specFact('paladin', 'retribution').pro.priorities[2], ['five times']));
  check('Hunter notes retain trap and Sniper Shot mechanics alongside November tuning',
    official(classFact('hunter').changes[1], ['in combat', 'scale with Attack Power', '30-second cooldown'])
    && official(specFact('hunter', 'marksmanship').pro.priorities[2], ['4-second cast', '15-second cooldown', '45-yard range', 'three shots gain 10 yards', 'doubled']));
  const originalPresetIdentities = DATA.presets.map(({ id, code, provenance }) => ({ id, code, provenance }));
  check('the ordered 58 beta builds, codes and provenance are frozen across factual updates',
    originalPresetIdentities.length === 58 && crypto.createHash('sha256').update(JSON.stringify(originalPresetIdentities)).digest('hex') === '1d1bf9833dde57644f6bf6ef93d0ff64d06c6d4987ab5ca158857a67e438c775');
  const presetWarning = id => DATA.presets.find(row => row.id === id).why[2];
  check('affected beta builds name their own removed, moved or re-ranked allocations',
    presetWarning('druid-feral-combat-raid-60').includes('Berserk removed')
    && presetWarning('paladin-protection-raid-60').includes('Improved Seal of Fury removed')
    && presetWarning('rogue-subtlety-pvp-60').includes('Cutthroat removed')
    && presetWarning('priest-holy-dungeon-30').includes('Binding Heal replaced by Holy Binding')
    && presetWarning('shaman-elemental-leveling-30').includes('Lava Burst replaced by Call of Thunder')
    && presetWarning('mage-fire-raid-60').includes('Critical Mass now caps at 3')
    && presetWarning('warrior-fury-raid-60').includes('Flurry now caps at 3'));
  const furtherVerifiedWarnings = [
    ['mage-arcane-leveling-30', 'Missile Barrage', 2, 'increased Arcane Resilience to three ranks'],
    ['mage-fire-leveling-30', 'Improved Fire Blast', 2, 'moved Improved Fire Blast to row 3'],
    ['hunter-beast-mastery-leveling-30', 'Pathfinding', 2, 'Pathfinding to row 3'],
    ['shaman-enhancement-raid-60', 'Improved Ghost Wolf', 2, 'Improved Ghost Wolf to row 4'],
    ['shaman-enhancement-leveling-30', 'Improved Ghost Wolf', 2, 'Improved Ghost Wolf to row 4'],
    ['paladin-retribution-raid-60', 'Conviction', 5, 'Conviction now caps at 3'],
    ['paladin-retribution-leveling-30', 'Conviction', 5, 'Conviction now caps at 3'],
  ];
  check('each additional November warning has a matching allocation in the unchanged build code',
    furtherVerifiedWarnings.every(([id, talent, ranks, warning]) => {
      const preset = DATA.presets.find(row => row.id === id);
      const tree = talents.classes.find(row => row.id === preset.classId);
      const index = tree.trees.flatMap(spec => spec.talents).findIndex(row => row.name === talent);
      return calculator.parseBuild(talents, preset.code).build.ranks[index] === ranks && preset.why.some(line => line.includes(warning));
    }));
  m = await mounted({ view: 'class', classId: cls.id, talentRevision: talents.revision, canAttach: false, attachReason: 'Applications are closed right now, so a build cannot be attached.', onAttach: () => attached.push('no') });
  const closedButtons = m.box.tags('button').filter(b => text(b) === 'Attach to my application');
  check('with applications closed every attach button is disabled and the reason is shown', closedButtons.length > 0 && closedButtons.every(b => b.disabled) && text(m.box).includes('Applications are closed right now'));
  m = await mounted({ view: 'class', classId: cls.id, talentRevision: talents.revision });
  check('without an attach handler there is no attach button; the class view defaults to the first spec', m.box.tags('button').every(b => text(b) !== 'Attach to my application') && m.box.tags('h2').some(h => text(h) === cls.specs[0].name + ': quick start'));
  m = await mounted({ view: 'class', classId: cls.id, specId: 'nope', talentRevision: talents.revision });
  check('an unknown spec says there is no such guide', text(m.box).includes('There is no such guide.'));
  m = await mounted({ view: 'class', classId: 'nope', talentRevision: talents.revision });
  check('an unknown class says there is no such guide', text(m.box).includes('There is no such guide.'));

  // 7. Grades: U renders "Unavailable", never a number.
  // Replace (not add) a raid claim: the list is capped at six, and an over-long list is refused as a whole.
  const withU = clone(DATA), raid = withU.classes[0].specs[0].pro.raid; raid.splice(0, raid.length ? 1 : 0, { label: 'Hit cap in Forever', value: null, grade: 'U', sources: [] });
  m = await mounted({ view: 'class', classId: withU.classes[0].id, specId: withU.classes[0].specs[0].id, talentRevision: talents.revision }, withU);
  const uClaim = m.box.all(e => e.getAttribute('data-grade') === 'U' && e.tagName === 'LI').find(li => text(li).includes('Hit cap in Forever'));
  check('an unavailable value renders as "Unavailable" with its legend, never 0', !!uClaim && text(uClaim.tags('strong')[0]) === 'Hit cap in Forever' && text(uClaim.tags('span')[0]) === 'Unavailable' && m.box.tags('details').some(d => text(d).includes('How to read the grades')));

  // 8. Profession and tools.
  const prof = DATA.professions[0];
  m = await mounted({ view: 'profession', profession: prof.key, talentRevision: talents.revision });
  check('a profession guide shows its sections and the policy-caveated gold note', text(m.box.tags('h1')[0]) === prof.name + ' guide' && ['What Forever changes', 'Leveling', 'Value for the raid', 'Gold'].every(t => m.box.tags('h2').some(h => text(h) === t)) && text(m.box).includes(prof.goldNote));
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
  const hubWithStructure = await mounted({ view: 'hub', talentRevision: talents.revision });
  const raidTools = hubWithStructure.box.tags('section').find(s => text(s.tags('h2')[0]) === 'Raid preparation tools');
  check('Raid preparation tools links to Fox’s guide', !!raidTools && links(raidTools).includes(structureUrl));
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

  // 9. External links, failure, revision mismatch and teardown.
  m = await mounted({ view: 'class', classId: DATA.classes[2].id, talentRevision: talents.revision });
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
  check('Blizzard hosts player posts without getting publisher credit for their claims',
    [86, 120].every(index => DATA.sources[index].kind === 'community' && DATA.sources[index].publisher === 'Blizzard forums (player posts)')
    && text(playerPostLink).startsWith('Blizzard forums (player posts) — Beta player report'));
  const prefixed = DATA.sources[publisherPrefixed];
  check('a source title starting with its publisher renders that publisher once and keeps its topic',
    text(prefixedTitleLink) === prefixed.publisher + ' — ' + prefixed.label.slice(prefixed.publisher.length + 2));
  const guideViews = [
    ...DATA.classes.flatMap(c => [{ view: 'class', classId: c.id }, ...c.specs.map(s => ({ view: 'class', classId: c.id, specId: s.id }))]),
    ...DATA.professions.map(p => ({ view: 'profession', profession: p.key })),
    ...['attunements', 'buffs', 'raid-structure', 'changes'].map(tool => ({ view: 'tool', tool }))
  ];
  for (const opts of guideViews) {
    const { box } = await mounted({ ...opts, talentRevision: talents.revision });
    const purposeByName = new Map();
    for (const line of sourceLines(box)) {
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
    const credit = box.all(e => e.className.includes('guides218-talent-credit'));
    assert.equal(credit.length, opts.view === 'class' || opts.tool === 'changes' ? 1 : 0, JSON.stringify(opts));
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
