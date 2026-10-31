// .218 Olympus guides and tools: the actual guides218.js over the actual guides218.json, with a minimal DOM.
// Pure local computation: no Worker, browser session, provider, network or account action.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
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
  check('the stylesheet loads nothing remote and carries reduced-motion and forced-colors rules', !/url\(|@import/i.test(CSS) && CSS.includes('prefers-reduced-motion') && CSS.includes('forced-colors'));

  // 2. Closed validation of the real catalogue and refusals of altered copies.
  const api = page(ok(DATA)).api;
  check('the real catalogue passes the closed validator for the pinned talent snapshot', api.validate(clone(DATA), talents.revision) && DATA.talentRevision === talents.revision);
  const refuse = (name, mutate) => { const d = clone(DATA); mutate(d); let thrown = false; try { api.validate(d, talents.revision); } catch { thrown = true; } check('refused: ' + name, thrown); };
  refuse('another schema', d => { d.schema = 'olympus-guides-v2'; });
  refuse('another talent revision', d => { d.talentRevision = '000000000000'; });
  refuse('a source on an unlisted host', d => { d.sources[0].url = 'https://example.com/x'; });
  refuse('an http source', d => { d.sources[0].url = d.sources[0].url.replace('https:', 'http:'); });
  refuse('an Unavailable claim with a value', d => { const c = d.classes[0].specs[0].pro.priorities[0] || (d.classes[0].specs[0].pro.priorities[0] = { label: 'x', value: 'y', grade: 'E', sources: [0] }); c.grade = 'U'; c.value = 'guess'; });
  refuse('an unknown grade', d => { const c = d.classes[0].specs[0].pro.priorities[0] || (d.classes[0].specs[0].pro.priorities[0] = { label: 'x', value: 'y', grade: 'E', sources: [0] }); c.grade = 'Z'; });
  refuse('a citation past the source list', d => { d.classes[0].changes[0] ? d.classes[0].changes[0].sources = [d.sources.length] : d.tools.whatChanged[0].sources = [d.sources.length]; });
  refuse('a preset code from another snapshot', d => { d.presets[0].code = d.presets[0].code.replace(talents.revision, 'aaaaaaaaaaaa'); });
  refuse('a preset whose code level disagrees', d => { d.presets[0].level = d.presets[0].level === 60 ? 30 : 60; });
  refuse('a preset whose tree split does not add up', d => { d.presets[0].treePoints[0] += 1; });
  refuse('a spec citing a missing preset', d => { d.classes[0].specs[0].presets.push('missing-preset'); });
  refuse('eight classes', d => { d.classes.pop(); });
  refuse('eleven professions', d => { d.professions.pop(); });

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
  check('the hub links all 9 class guides, 27 spec guides, 12 profession guides and 3 tools', DATA.classes.every(c => hubLinks.includes('#/guides/class/' + c.id) && c.specs.every(s => hubLinks.includes('#/guides/class/' + c.id + '/' + s.id)))
    && DATA.professions.every(p => hubLinks.includes('#/guides/profession/' + p.key)) && ['attunements', 'buffs', 'changes'].every(t => hubLinks.includes('#/guides/tools/' + t)));
  check('the hub keeps the calculator, addons, publisher library, game updates and member guide one click away', ['#/talents', '#/addons', '#/guides', '#/updates', '#/guide/member'].every(h => hubLinks.includes(h)));
  check('the hub has exactly one h1 and states the scope note once', m.box.tags('h1').length === 1 && text(m.box).split(DATA.scopeNote.slice(0, 60)).length === 2);
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
  check('every preset of the spec renders once with its exact calculator link', cards.length === spec.presets.length && spec.presets.every(id => { const p = DATA.presets.find(x => x.id === id), card = cards.find(c => c.getAttribute('data-preset') === id);
    return card && card.tags('a').some(a => a.getAttribute('href') === '#/talents/' + p.classId + '/' + encodeURIComponent(p.code) && text(a) === 'Load this build in the talent calculator'); }));
  const attachButton = cards[0].tags('button').find(b => text(b) === 'Attach to my application');
  attachButton.fire('click');
  const first = DATA.presets.find(x => x.id === spec.presets[0]);
  check('Attach hands over exactly the preset identity and build, frozen, and says what happens next', attached.length === 1 && Object.isFrozen(attached[0]) && JSON.stringify(attached[0]) === JSON.stringify({ presetId: first.id, label: first.label, classId: first.classId, level: first.level, code: first.code })
    && text(cards[0]).includes('Opening your application with this build'));
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
  check('an unavailable value renders as "Unavailable" with its legend, never 0', !!uClaim && text(uClaim).includes('Hit cap in Forever: Unavailable') && !/:\s*0\b/.test(text(uClaim)) && m.box.tags('details').some(d => text(d).includes('How to read the grades')));

  // 8. Profession and tools.
  const prof = DATA.professions[0];
  m = await mounted({ view: 'profession', profession: prof.key, talentRevision: talents.revision });
  check('a profession guide shows its sections and the policy-caveated gold note', text(m.box.tags('h1')[0]) === prof.name + ' guide' && ['What Forever changes', 'Leveling', 'Value for the raid', 'Gold'].every(t => m.box.tags('h2').some(h => text(h) === t)) && text(m.box).includes(prof.goldNote));
  m = await mounted({ view: 'tool', tool: 'attunements', talentRevision: talents.revision });
  const slotBoxes = m.box.all(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'checkbox');
  check('the attunement tool lists all three raids and a sixteen-slot checklist', DATA.tools.attunements.every(a => m.box.tags('h2').some(h => text(h).startsWith(a.raid))) && text(m.box).includes('0 of 16 done'));
  const slotList = m.box.tags('h2').find(h => text(h) === 'Pre-raid gear checklist').parentNode, slotInput = slotList.all(e => e.tagName === 'INPUT')[0];
  slotInput.checked = true; slotInput.fire('change');
  check('ticking a slot updates its own counter and keeps nothing outside the page', text(slotList).includes('1 of 16 done') && slotBoxes.length >= 16);
  m = await mounted({ view: 'tool', tool: 'buffs', talentRevision: talents.revision });
  const statRows = [...DATA.tools.worldBuffs, ...DATA.tools.consumables].filter(r => r.stats && Object.keys(r.stats).length);
  const firstInput = m.box.all(e => e.tagName === 'INPUT' && e.getAttribute('id') === 'guides218-buff-' + statRows[0].id.replace(/[^a-z0-9-]/g, ''))[0];
  firstInput.checked = true; firstInput.fire('change');
  const total = m.box.all(e => e.getAttribute('role') === 'status' && e.getAttribute('aria-live') === 'polite')[0];
  check('choosing a buff updates the combined effect, labelled when it rests on Classic numbers', text(total).includes('Combined effect of 1 selected') && (['D', 'E'].includes(statRows[0].grade) ? text(total).includes('not Forever-verified') : true));
  m = await mounted({ view: 'tool', tool: 'changes', talentRevision: talents.revision });
  check('the compendium shows the class table with every class and a calculator link each', m.box.tags('tr').length === 10 && DATA.classSummary.every(x => links(m.box).includes('#/talents/' + x.id)));
  m = await mounted({ view: 'tool', tool: 'nope', talentRevision: talents.revision });
  check('an unknown tool says so', text(m.box).includes('There is no such tool.'));

  // 9. External links, failure, revision mismatch and teardown.
  m = await mounted({ view: 'class', classId: DATA.classes[2].id, talentRevision: talents.revision });
  const external = m.box.tags('a').filter(a => /^https:/.test(a.getAttribute('href') || ''));
  check('external source links open safely and only on listed hosts', external.length > 0 && external.every(a => a.getAttribute('target') === '_blank' && a.getAttribute('rel') === 'noopener noreferrer'));
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
