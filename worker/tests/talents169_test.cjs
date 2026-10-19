'use strict';
// The real shipped snapshot and original allocation engine. No provider, production or network calls.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const folder = path.join(__dirname, '../public/static/talents'), raw = fs.readFileSync(path.join(folder, 'data.json'));
const data = JSON.parse(raw), source = fs.readFileSync(path.join(folder, 'calculator.js'), 'utf8');
// The Worker package is ESM; load the exact browser IIFE in a CommonJS realm without rewriting its source.
const commonJS = { exports: {} };
vm.runInNewContext(source, { module: commonJS }, { filename: path.join(folder, 'calculator.js'), timeout: 1000 });
const api = commonJS.exports;
let ok = 0, n = 0;
function check(name, condition) { n++; if (condition) ok++; console.log((condition ? 'PASS ' : 'FAIL ') + name); }
const clone = value => JSON.parse(JSON.stringify(value));
const all = cls => cls.trees.flatMap(tree => tree.talents);
const find = name => all(data.classes[0]).find(t => t.name === name);
const setRank = (build, name, rank) => { const next = clone(build); next.ranks[all(data.classes.find(c => c.id === build.className)).findIndex(t => t.name === name)] = rank; return next; };
const initialJSON = JSON.stringify(data);
check('the actual nine-class snapshot is structurally complete', api.validateData(data).ok && api.validateData(data).talents === 466 && api.validateData(data).ranks === 1313);
check('coverage is the recorded 27 trees and 466 current talents, not a placeholder', data.counts.classes === 9 && data.counts.trees === 27 && data.classes.map(c => all(c).length).join(',') === '52,50,50,53,52,50,55,52,52');
check('source bytes and normalized snapshot are pinned in the shipped provenance', (() => { const p = JSON.parse(fs.readFileSync(path.join(folder, 'provenance.json'))); return p.normalizedBytes === raw.length && p.normalizedSHA256 === crypto.createHash('sha256').update(raw).digest('hex') && p.source.rawSHA256 === '260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588' && p.source.rawBytes === 1734440; })());
check('source build, generation and CC BY attribution remain explicit', data.source.clientBuilds.join() === '1.60.1.70425' && data.source.upstreamGenerated === '2026-10-16' && data.source.license === 'CC-BY-4.0' && data.source.url === 'https://talentsforever.com/data.json');
check('Classic and Blizzard limits are disclosed alongside the data', data.source.limits.some(x => /rank-one/.test(x)) && data.source.limits.some(x => /no exact Classic client build/.test(x)) && data.source.limits.some(x => /Blizzard/.test(x)) && data.source.limits.some(x => /Legacy Talented/.test(x)));
check('every talent includes comparison metadata and every current rank text', data.classes.every(c => all(c).every(t => t.classic && t.descriptions.length === t.maxRank)));
const status = {}; for (const cls of data.classes) for (const t of all(cls)) status[t.classic.status] = (status[t.classic.status] || 0) + 1;
check('all original comparison categories are retained', status.new === 117 && status.changed === 271 && status.moved === 25 && status.same === 53);
check('changed and moved can both be visible; one does not hide the other', api.comparisonBadges({ classic: { status: 'changed', moved: true } }).join() === 'Changed,Moved' && api.comparisonBadges({ classic: { status: 'moved' } }).join() === 'Moved');
check('all 82 supplied Classic-only rows remain available', data.classes.flatMap(c => c.trees).reduce((sum, tree) => sum + tree.removedClassic.length, 0) === 82);
check('the normal point budget is one at level10 and 51 at level60', api.pointsAtLevel(10) === 1 && api.pointsAtLevel(60) === 51 && api.pointsAtLevel(30) === 21 && api.pointsAtLevel(9) === null && api.pointsAtLevel(61) === null);
for (const cls of data.classes) {
  const empty = api.emptyBuild(data, cls.id), first = all(cls).find(t => t.row === 1), applied = api.allocate(data, empty, first.id, 1);
  check(cls.name + ': empty and genuine first point are valid without changing input', api.validateBuild(data, empty).points === 0 && applied.ok && applied.points === 1 && empty.ranks.every(x => x === 0));
  check(cls.name + ': exact versioned code roundtrips the real vector', JSON.stringify(api.parseBuild(data, api.serializeBuild(data, applied.build)).build) === JSON.stringify(applied.build));
}
const empty = api.emptyBuild(data), deflection = find('Deflection'), charge = find('Improved Charge'), tactical = find('Improved Tactical Mastery'), anger = find('Anger Management');
check('a row2 point refuses until five points exist in earlier rows', !api.allocate(data, empty, charge.id, 1).ok);
let five = setRank(empty, 'Deflection', 5), row2 = api.allocate(data, five, charge.id, 1);
check('five real row1 points unlock the next row', row2.ok && row2.points === 6);
check('refund cannot invalidate an invested higher row', !api.allocate(data, row2.build, deflection.id, -1).ok && row2.build.ranks[all(data.classes[0]).findIndex(t => t.id === deflection.id)] === 5);
const noTier = api.allocate(data, five, deflection.id, -1);
check('refund succeeds when no higher row depends on those points', noTier.ok && noTier.points === 4);
const ten = setRank(setRank(five, 'Improved Heroic Strike', 3), 'Improved Rend', 2);
check('a prerequisite is still required even when the row point gate is met', !api.allocate(data, ten, anger.id, 1).ok);
const ready = setRank(ten, 'Improved Tactical Mastery', 5), linked = api.allocate(data, ready, anger.id, 1);
check('maxed actual prerequisite plus tier gate permits its child', linked.ok && linked.points === 16);
check('refund cannot unmax the parent of an invested prerequisite child', !api.allocate(data, linked.build, tactical.id, -1).ok);
check('removing the child then its parent is a valid refund sequence', (() => { const child = api.allocate(data, linked.build, anger.id, -1); return child.ok && api.allocate(data, child.build, tactical.id, -1).ok; })());
for (const [className, targetName] of [['paladin', 'Divine Precision'], ['priest', 'Improved Mind Flay']]) {
  let build = api.emptyBuild(data, className), cls = data.classes.find(c => c.id === className), tree = cls.trees.find(t => t.talents.some(n => n.name === targetName));
  const target = tree.talents.find(t => t.name === targetName), parent = tree.talents.find(t => t.id === target.requires), needed = 5 * (target.row - 1);
  while (api.validateBuild(data, build).points < needed) {
    const candidate = tree.talents.filter(t => t.row < target.row).map(t => api.allocate(data, build, t.id, 1)).find(r => r.ok);
    if (!candidate) throw Error('The actual lower-row fixture cannot reach its required points.'); build = candidate.build;
  }
  const before = api.allocate(data, build, target.id, 1), parentPoint = api.allocate(data, build, parent.id, 1), child = parentPoint.ok && api.allocate(data, parentPoint.build, target.id, 1);
  check('actual same-row prerequisite ' + parent.name + ' → ' + target.name + ' stays enforced', !before.ok && parent.row === target.row && child.ok && !api.allocate(data, child.build, parent.id, -1).ok);
}
check('rank cap, negative points and unknown talents are refused', !api.allocate(data, five, deflection.id, 1).ok && !api.allocate(data, empty, deflection.id, -1).ok && !api.allocate(data, empty, 'not-a-talent', 1).ok);
check('multi-point and fractional changes cannot bypass validation', !api.allocate(data, empty, deflection.id, 2).ok && !api.allocate(data, empty, deflection.id, 0.5).ok);
check('a lower selected level cannot hide overspending', !api.validateBuild(data, { ...five, level: 10 }).ok);
check('NaN, infinity, fractional and sparse/malformed vectors refuse', !api.validateBuild(data, setRank(empty, 'Deflection', NaN)).ok && !api.validateBuild(data, setRank(empty, 'Deflection', Infinity)).ok && !api.validateBuild(data, setRank(empty, 'Deflection', 0.5)).ok && !api.validateBuild(data, { ...empty, ranks: Array(empty.ranks.length) }).ok && !api.validateBuild(data, { ...empty, ranks: empty.ranks.slice(1) }).ok);
const code = api.serializeBuild(data, linked.build);
check('share codes bind the reviewed data revision', !api.parseBuild(data, code.replace(data.revision, '0'.repeat(12))).ok);
check('invalid class, rank encoding, level and trailing data refuse', !api.parseBuild(data, code.replace('.warrior.', '.monk.')).ok && !api.parseBuild(data, code + 'x').ok && !api.parseBuild(data, code.replace('.60.', '.09.')).ok && !api.parseBuild(data, 'x'.repeat(257)).ok);
check('oversized talent ranks cannot be imported through a syntactically valid code', !api.parseBuild(data, api.serializeBuild(data, empty).slice(0, -empty.ranks.length) + '9'.repeat(empty.ranks.length)).ok);
check('reset is a true empty vector and does not rewrite the imported build', api.emptyBuild(data, 'warrior', 30).ranks.every(x => x === 0) && api.validateBuild(data, linked.build).points === 16);
for (const mutate of [d => d.classes.pop(), d => d.classes[0].trees[0].talents[0].descriptions.pop(), d => d.classes[0].trees[0].talents[0].requires = 'missing', d => d.classes[0].trees[0].talents[0].column = 8, d => { const row = d.classes[0].trees[0].talents; row[0].requires = row[1].id; row[1].requires = row[0].id; }]) {
  const broken = clone(data); mutate(broken); check('corrupt coverage/ranks/prerequisite/grid data refuses before rendering', !api.validateData(broken).ok);
}
check('pure validation and allocation do not mutate the shared data snapshot', initialJSON === JSON.stringify(data));
check('the actual browser entry parses without eval or third-party resources', (() => { new vm.Script(source); return !/innerHTML|eval\(|new Function|createElement\(["']iframe/.test(source) && /fetch\(DATA_URL/.test(source) && source.includes('const DATA_URL = "/static/talents/data.json"'); })());
check('the renderer retains text nodes, accessible controls and keyboard navigation', source.includes('document.createTextNode') && source.includes('node.textContent = value') && source.includes('"aria-live": "polite"') && source.includes('ArrowLeft') && source.includes('"aria-label": "Character class"') && source.includes('"aria-pressed"'));
check('all grid placement is scoped CSS, not inline styles that would weaken CSP', !/\.style\b|setAttribute\(["']style/.test(source) && fs.readFileSync(path.join(folder, 'calculator.css'), 'utf8').includes('.talents-node[data-row="7"]'));
const css = fs.readFileSync(path.join(folder, 'calculator.css'), 'utf8');
const desktopStack = [...css.matchAll(/@media\(max-width:(\d+)px\)\{([^\r\n]*)/g)].filter(row => Number(row[1]) >= 1280);
check('desktop widths through 1350 keep details above three full-width trees while the narrow-screen layout remains intact', desktopStack.length === 2 && desktopStack.every(row => Number(row[1]) === 1350) && desktopStack.some(row => row[2].includes('.talents-workspace{grid-template-columns:minmax(0,1fr)}')) && desktopStack.some(row => row[2].includes('.talents-detail{grid-row:1;grid-column:1;position:sticky;') && row[2].includes('.talents-trees{grid-row:2;grid-column:1}')) && css.includes('@media(max-width:700px){') && css.includes('.talents-trees{grid-template-columns:minmax(0,1fr)}'));

// A small DOM with native append/replaceChildren coercion: null becomes text,
// so this real mount regression cannot accidentally hide the observed browser bug.
class TalentText {
  constructor(value) { this.nodeType = 3; this.textContent = String(value); }
}
class TalentElement {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.nodeType = 1; this.childNodes = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.value = ''; }
  append(...nodes) { for (const node of nodes) this.childNodes.push(node instanceof TalentElement || node instanceof TalentText ? node : this.ownerDocument.createTextNode(String(node))); }
  replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(this.ownerDocument.createTextNode(value)); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, extra = {}) { const event = { target: this, shiftKey: false, preventDefault() {}, ...extra }; for (const handler of this.listeners[type] || []) handler(event); }
  focus() { this.ownerDocument.activeElement = this; this.dispatch('focus'); }
  click() { if (!this.disabled) this.dispatch('click'); }
  all(predicate) { return this.childNodes.filter(node => node.nodeType === 1).flatMap(node => [...(predicate(node) ? [node] : []), ...node.all(predicate)]); }
}
async function detailRenderRegression() {
  const document = { createElement(tag) { return new TalentElement(tag, this); }, createTextNode(value) { return new TalentText(value); }, activeElement: null };
  const container = document.createElement('main'), browserModule = { exports: {} }, changes = [];
  let reads = 0, ownDataRequest = true;
  vm.runInNewContext(source, {
    module: browserModule,
    location: { origin: 'https://guild.example', pathname: '/' },
    fetch: async (url, options) => { reads++; ownDataRequest = ownDataRequest && url === '/static/talents/data.json' && options.credentials === 'same-origin'; return { ok: true, json: async () => clone(data) }; },
  }, { filename: path.join(folder, 'calculator.js'), timeout: 1000 });
  const controller = await browserModule.exports.mount(container, { onBuildChange: value => changes.push(value) });
  const byClass = (node, name) => node.all(child => child.className.split(/\s+/).includes(name));
  const detail = () => byClass(container, 'talents-detail')[0];
  const titles = () => detail().all(node => node.tagName === 'H4').map(node => node.textContent);
  const pick = name => byClass(container, 'talents-pick').find(node => (node.getAttribute('aria-label') || '').startsWith(name + ', rank '));
  const heroic = find('Improved Heroic Strike');
  check('the real initial passive talent omits absent cost, prerequisite and next rank without literal null text', ownDataRequest && reads === 1 && detail().textContent.includes(heroic.descriptions[0]) && !detail().textContent.includes('null') && byClass(detail(), 'talents-cost').length === 0 && byClass(detail(), 'talents-requires').length === 0 && !titles().includes('Next rank'));
  pick(heroic.name).click();
  check('the real point control renders current and next rank text without converting absent fields to null', changes.at(-1).points === 1 && byClass(detail(), 'talents-rank')[0].textContent.startsWith('Rank 1 / 3') && detail().textContent.includes(heroic.descriptions[0]) && detail().textContent.includes(heroic.descriptions[1]) && titles().includes('Next rank') && !detail().textContent.includes('null'));
  pick(heroic.name).click(); pick(heroic.name).click();
  check('the real maximum-rank render removes only the absent next rank and retains current/all-rank descriptions', changes.at(-1).points === 3 && byClass(detail(), 'talents-rank')[0].textContent.startsWith('Rank 3 / 3') && detail().textContent.includes(heroic.descriptions[2]) && !titles().includes('Next rank') && byClass(detail(), 'talents-all-ranks')[0].all(node => node.tagName === 'LI').length === heroic.maxRank && !detail().textContent.includes('null'));
  const mortal = find('Mortal Strike'), parent = all(data.classes[0]).find(talent => talent.id === mortal.requires);
  pick(mortal.name).focus();
  check('real present cost and prerequisite fields remain readable without allocating a locked talent or mutating the snapshot', byClass(detail(), 'talents-cost')[0].textContent === mortal.cost && byClass(detail(), 'talents-requires')[0].textContent === 'Requires ' + parent.name + ' at maximum rank.' && detail().textContent.includes(mortal.descriptions[0]) && !detail().textContent.includes('null') && changes.at(-1).points === 3 && initialJSON === JSON.stringify(data));
  controller.destroy();
  console.log('\n' + ok + '/' + n + ' passed');
  if (ok !== n) process.exitCode = 1;
}
detailRenderRegression().catch(error => { console.error(error); process.exitCode = 1; });
