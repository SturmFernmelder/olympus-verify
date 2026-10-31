'use strict';
// .218 Compare to Classic: Classic placements, honest change tags, FLIP animation through the Web Animations API,
// reduced motion, the side-by-side rank diff and the "What changed in Forever" drawer. Real calculator.js and data.json.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const folder = path.join(__dirname, '../public/static/talents');
const data = JSON.parse(fs.readFileSync(path.join(folder, 'data.json'), 'utf8')), art = JSON.parse(fs.readFileSync(path.join(folder, 'art.json'), 'utf8'));
const source = fs.readFileSync(path.join(folder, 'calculator.js'), 'utf8'), css = fs.readFileSync(path.join(folder, 'calculator.css'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
let pass = 0, n = 0;
const check = (name, ok) => { n++; if (ok) { pass++; console.log('PASS ' + name); } else console.log('FAIL ' + name); };
const commonJS = { exports: {} };
vm.runInNewContext(source, { module: commonJS }, { filename: 'calculator.js', timeout: 1000 });
const api = commonJS.exports;
const trees = data.classes.flatMap(cls => cls.trees.map(tree => ({ cls, tree })));

// ---------------------------------------------------------------- pure API
check('the new comparison helpers are exported beside the unchanged originals', ['changeTags', 'classicDiff', 'classicPlacements', 'treeChangeSummary', 'comparisonBadges', 'serializeBuild', 'parseBuild'].every(name => typeof api[name] === 'function'));
check('the easing is exactly cubic-bezier(0.22, 1, 0.36, 1)', api.COMPARE_EASING === 'cubic-bezier(0.22, 1, 0.36, 1)');
check('every class has an official Blizzard deep-dive link and nothing else', Object.keys(api.CLASS_SOURCES).sort().join() === data.classes.map(c => c.id).sort().join() && Object.values(api.CLASS_SOURCES).every(url => /^https:\/\/news\.blizzard\.com\/en-us\/article\/\d+\/[a-z0-9-]+$/.test(url)));
let extraTotal = 0, placementOk = true, cellsUnique = true, extraRowsOnly = true;
for (const { tree } of trees) {
  const places = api.classicPlacements(tree), cells = new Set();
  if (places.size !== tree.talents.length) placementOk = false;
  for (const t of tree.talents) {
    const p = places.get(t.id), c = t.classic, key = p.row + ':' + p.column;
    if (cells.has(key)) cellsUnique = false; cells.add(key);
    const sameTree = Number.isInteger(c.row) && Number.isInteger(c.col) && c.tree === tree.name;
    if (sameTree && (p.row !== c.row || p.column !== c.col || p.extra !== null)) placementOk = false;
    if (!sameTree) { extraTotal++; if (p.row < 8 || p.row > 9 || !['new', 'tree'].includes(p.extra)) extraRowsOnly = false; }
  }
}
const newCount = trees.reduce((sum, { tree }) => sum + tree.talents.filter(t => t.classic.status === 'new').length, 0);
const crossTree = trees.reduce((sum, { tree }) => sum + tree.talents.filter(t => Number.isInteger(t.classic.row) && t.classic.tree !== tree.name).length, 0);
check('every talent of all 27 trees gets exactly the snapshot Classic cell, or an extra cell when it has none in its tree', placementOk);
check('no two talents share a cell in any Classic layout', cellsUnique);
check('only new-in-Forever and other-tree talents use the two extra rows (8 and 9)', extraRowsOnly && extraTotal === newCount + crossTree && newCount === 117 && crossTree === 7);
let newTags = 0, movedTags = 0, expectedMoved = 0, textTags = 0, textChanged = 0, sameText = 0, sameTagged = 0;
for (const { tree } of trees) for (const t of tree.talents) {
  const tags = api.changeTags(t, tree), ids = tags.map(tag => tag.id), c = t.classic;
  if (ids.includes('new')) newTags++;
  if (ids.includes('moved')) movedTags++;
  if (Number.isInteger(c.row) && (c.tree !== tree.name || c.row !== t.row || c.col !== t.column)) expectedMoved++;
  if (c.text) {
    const plain = s => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
    const text = ids.filter(id => ['buffed', 'nerfed', 'tuned', 'reworked'].includes(id));
    if (plain(c.text) === plain(t.descriptions[0])) { sameText++; if (text.length) sameTagged++; }
    else { textChanged++; if (text.length === 1) textTags++; }
  }
}
check('NEW IN FOREVER appears exactly on the 117 talents without a Classic counterpart', newTags === 117);
check('a MOVED tag appears exactly when the Classic tree, tier or column differs', movedTags === expectedMoved && movedTags > 0);
check('every reworded talent carries exactly one text tag, and identical rank-one texts carry none', textTags === textChanged && sameTagged === 0 && sameText > 0);
const d = api.classicDiff;
check('identical wording is same', d('Increases damage by 5%.', 'Increases damage by 5%').kind === 'same');
check('a larger increase is buffed and a smaller one nerfed', d('Increases the damage of Heroic Strike by 5%.', 'Increases the damage of Heroic Strike by 10%.').kind === 'buffed' && d('Increases the damage of Heroic Strike by 10%.', 'Increases the damage of Heroic Strike by 5%.').kind === 'nerfed');
check('a larger cooldown reduction is buffed', d('Reduces the cooldown of your Charge ability by 1 sec.', 'Reduces the cooldown of your Charge ability by 2 sec.').kind === 'buffed');
check('a larger proc chance is buffed', d('Gives your Shield Bash ability a 50% chance to silence the target.', 'Gives your Shield Bash ability a 100% chance to silence the target.').kind === 'buffed');
// Codex Root 05:34Z: a harmful or mixed clause must never be read as a buff or nerf.
const kindOf = (a, b) => d(a, b).kind;
check('a larger increase of damage you take, or of a cost, is undecided, never buffed', kindOf('Increases the damage you take by 10%.', 'Increases the damage you take by 20%.') === 'tuned'
  && kindOf('Increases the mana cost of your Fireball by 10%.', 'Increases the mana cost of your Fireball by 20%.') === 'tuned' && kindOf('Your Fireball costs 10% of your health.', 'Your Fireball costs 20% of your health.') === 'tuned'
  && kindOf('Gives a 10% chance to be hit.', 'Gives a 20% chance to be hit.') === 'tuned');
check('a later verb wins: an earlier "increases" never carries into a following reduction', kindOf('Increases your Stamina by 1 and reduces your Spirit by 1.', 'Increases your Stamina by 1 and reduces your Spirit by 0.') === 'tuned'
  && kindOf('Increases your Stamina by 1 and your Spirit is reduced by 1.', 'Increases your Stamina by 1 and your Spirit is reduced by 0.') === 'tuned' && kindOf('Reduces your Spirit by 1%.', 'Reduces your Spirit by 2%.') === 'tuned');
check('threat increases are role-dependent and stay undecided; a new sentence never borrows the previous verb', kindOf('Increases the threat generated by your Sunder Armor by 10%.', 'Increases the threat generated by your Sunder Armor by 20%.') === 'tuned'
  && kindOf('Increases damage by 5%. Your attacks cost 10% more mana.', 'Increases damage by 5%. Your attacks cost 20% more mana.') === 'tuned');
check('plain buffs still read as buffs: shared verbs, "by an additional", spell-name colons and cost reductions', kindOf('Increases your Stamina by 3% and your Spirit by 3%.', 'Increases your Stamina by 5% and your Spirit by 5%.') === 'buffed'
  && kindOf('Increases your chance to dodge by an additional 1%.', 'Increases your chance to dodge by an additional 2%.') === 'buffed'
  && kindOf('Increases the damage absorbed by your Power Word: Shield by 5%.', 'Increases the damage absorbed by your Power Word: Shield by 7%.') === 'buffed'
  && kindOf('Increases the damage and critical strike chance of your Moonfire by 2%.', 'Increases the damage and critical strike chance of your Moonfire by 5%.') === 'buffed'
  && kindOf('Reduces the mana cost of your Fireball by 10%.', 'Reduces the mana cost of your Fireball by 20%.') === 'buffed' && kindOf('Deals an additional 5 damage.', 'Deals an additional 10 damage.') === 'buffed');
check('an absolute cooldown change stays undecided rather than guessed', d('Your Stance has a 30 sec cooldown.', 'Your Stance has a 20 sec cooldown.').kind === 'tuned');
check('different wording is reworked, and each changed number is listed', d('Increases your critical strike chance with Axes by 1%.', 'Increases your chance to parry by 1%.').kind === 'reworked' && d('Increases the damage of Heroic Strike by 5%.', 'Increases the damage of Heroic Strike by 10%.').pairs.length === 1);
const overpower = trees.flatMap(({ tree }) => tree.talents.map(t => ({ t, tree }))).find(x => x.t.id === 'warrior-arms-improved-overpower');
check('the real Improved Overpower is tagged MOVED TIER with its Classic and Forever tiers', api.changeTags(overpower.t, overpower.tree).some(tag => tag.label === 'MOVED TIER' && tag.detail === 'Classic tier 3 → Forever tier 2'));
const arms = data.classes[0].trees[0], summary = api.treeChangeSummary(arms);
check('the drawer summary counts match the tags for a real tree', summary.new.length === arms.talents.filter(t => t.classic.status === 'new').length && summary.removed.length === arms.removedClassic.length && summary.name === arms.name);

// ---------------------------------------------------------------- source policy
check('the calculator still writes no inline style and no HTML string', !/\.style\b|setAttribute\(["']style/.test(source) && !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source));
check('animation goes through element.animate with translate3d keyframes', source.includes('node.animate(') && source.includes('translate3d('));
check('CSS adds rows 8 and 9, hides Forever arrows in the Classic layout and keeps the reduced-motion rule', css.includes('.talents-node[data-row="8"]{grid-row:8}') && css.includes('.talents-node[data-row="9"]{grid-row:9}') && css.includes('.talents-tree.talents-classic-layout .talents-links{opacity:0}') && css.includes('@media(prefers-reduced-motion:reduce){.talents-tool *{animation:none!important;transition:none!important}}'));

// ---------------------------------------------------------------- DOM with measurement and Web Animations
class Text { constructor(value) { this.nodeType = 3; this.textContent = String(value); this.parentNode = null; } }
class El {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.nodeType = 1; this.childNodes = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.value = ''; this.parentNode = null; this.hidden = false; }
  append(...nodes) { for (const value of nodes) { const node = value instanceof El || value instanceof Text ? value : this.ownerDocument.createTextNode(String(value)); if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1); node.parentNode = this; this.childNodes.push(node); } }
  replaceChildren(...nodes) { for (const node of this.childNodes) node.parentNode = null; this.childNodes = []; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(this.ownerDocument.createTextNode(value)); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'src' && this.tagName === 'IMG') this.dispatch('load'); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, extra = {}) { const event = { target: this, currentTarget: this, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const handler of this.listeners[type] || []) handler(event); return event; }
  focus() { if (this.ownerDocument.activeElement !== this) { this.ownerDocument.activeElement = this; this.dispatch('focus'); } }
  click() { if (!this.disabled) this.dispatch('click'); }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  all(predicate) { return this.childNodes.filter(node => node.nodeType === 1).flatMap(node => [...(predicate(node) ? [node] : []), ...node.all(predicate)]); }
  querySelectorAll(selector) { if (selector !== 'img') throw Error('only img'); return this.all(node => node.tagName === 'IMG'); }
  getBoundingClientRect() {
    // A talent node sits in its tree column; its cell comes from the data attributes, as the CSS grid does.
    let tree = 0; for (let p = this.parentNode; p; p = p.parentNode) if (p.getAttribute && p.getAttribute('data-tree-index') !== null) { tree = Number(p.getAttribute('data-tree-index')); break; }
    const row = Number(this.getAttribute('data-row')) || 0, column = Number(this.getAttribute('data-column')) || 0;
    return { left: tree * 400 + column * 90, top: row * 66, width: 48, height: 48 };
  }
  animate(keyframes, options) { this.ownerDocument.animations.push({ node: this, keyframes, options }); return { finished: Promise.resolve() }; }
}
async function mountWith({ reduced = false, className = 'warrior' } = {}) {
  const document = { createElement(tag) { return new El(tag, this); }, createTextNode(value) { return new Text(value); }, activeElement: null, animations: [] };
  const container = document.createElement('main'), module = { exports: {} };
  vm.runInNewContext(source, {
    module, setTimeout: () => 0, clearTimeout() {}, location: { origin: 'https://guild.example', pathname: '/' }, navigator: {},
    matchMedia: query => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)' }),
    fetch: async url => ({ ok: true, json: async () => clone(url.endsWith('/art.json') ? art : data) }),
  }, { filename: 'calculator.js', timeout: 1000 });
  await module.exports.mount(container, { className });
  const byClass = name => container.all(node => node.className.split(/\s+/).includes(name));
  const toggle = checked => byClass('talents-compare-switch')[0].all(node => node.tagName === 'INPUT')[0].dispatch('change', { target: { checked } });
  return { document, container, byClass, toggle };
}
(async () => {
  const m = await mountWith();
  const cls = data.classes[0], talents = cls.trees.flatMap(tree => tree.talents), places = new Map(cls.trees.flatMap(tree => [...api.classicPlacements(tree)]));
  const nodeOf = id => m.byClass('talents-node')[talents.findIndex(t => t.id === id)];
  const picksBefore = m.byClass('talents-pick'), firstRect = new Map(talents.map(t => [t.id, nodeOf(t.id).getBoundingClientRect()]));
  check('the Forever layout is the default and its nodes sit at their Forever cells', talents.every(t => nodeOf(t.id).getAttribute('data-row') === String(t.row) && nodeOf(t.id).getAttribute('data-column') === String(t.column)) && m.document.animations.length === 0);
  m.toggle(true);
  check('Compare to Classic moves every node to its Classic placement without rebuilding or reordering buttons', talents.every(t => nodeOf(t.id).getAttribute('data-row') === String(places.get(t.id).row) && nodeOf(t.id).getAttribute('data-column') === String(places.get(t.id).column)) && m.byClass('talents-pick').every((pick, i) => pick === picksBefore[i]));
  check('each tree switches to the Classic layout class and extra nodes are marked', m.byClass('talents-tree').length === 3 && m.byClass('talents-tree').every(tree => tree.className === 'talents-tree talents-classic-layout') && talents.filter(t => places.get(t.id).extra).every(t => nodeOf(t.id).getAttribute('data-classic-extra') === places.get(t.id).extra));
  const moved = talents.filter(t => { const a = firstRect.get(t.id), b = nodeOf(t.id).getBoundingClientRect(); return a.left !== b.left || a.top !== b.top; });
  const animated = new Map(m.document.animations.map(a => [a.node, a]));
  check('every node that changed cell is animated exactly once, and unmoved nodes are not', m.document.animations.length === moved.length && moved.length > 0 && moved.every(t => animated.has(nodeOf(t.id))));
  check('each FLIP starts at the inverted offset, bends through a midpoint and ends at zero, with the exact easing', moved.every(t => {
    const a = animated.get(nodeOf(t.id)), before = firstRect.get(t.id), after = nodeOf(t.id).getBoundingClientRect(), frames = a.keyframes;
    return frames.length === 3 && frames[0].transform === 'translate3d(' + (before.left - after.left) + 'px, ' + (before.top - after.top) + 'px, 0)' && frames[1].offset === 0.5 && frames[2].transform === 'translate3d(0, 0, 0)' && a.options.easing === 'cubic-bezier(0.22, 1, 0.36, 1)' && a.options.duration === 620;
  }));
  check('the node tags appear in compare mode with short labels', m.byClass('talents-node-tag').filter(tag => !tag.hidden).every(tag => ['NEW', 'MOVED', 'BUFF', 'NERF', 'VALUES', 'REWORK'].includes(tag.textContent)) && m.byClass('talents-node-tag').some(tag => !tag.hidden && tag.textContent === 'NEW'));
  check('the layout note is shown only in compare mode', m.byClass('talents-layout-note')[0].hidden === false);
  // Keyboard: arrows follow the cells on screen in the Classic layout.
  const tree0 = cls.trees[0], start = tree0.talents.find(t => { const p = places.get(t.id); return !p.extra && tree0.talents.some(o => { const q = places.get(o.id); return !q.extra && q.column === p.column && q.row > p.row; }); });
  const below = tree0.talents.filter(o => { const q = places.get(o.id), p = places.get(start.id); return q.column === p.column && q.row > p.row; }).sort((a, b) => places.get(a.id).row - places.get(b.id).row)[0];
  const startPick = nodeOf(start.id).all(node => node.className === 'talents-pick')[0];
  startPick.focus(); startPick.dispatch('keydown', { key: 'ArrowDown' });
  check('ArrowDown in the Classic layout moves focus to the talent shown below', m.document.activeElement === nodeOf(below.id).all(node => node.className === 'talents-pick')[0]);
  // Detail panel: tags and side-by-side diff.
  const changed = talents.find(t => t.classic.text && t.classic.text.toLowerCase() !== t.descriptions[0].toLowerCase());
  nodeOf(changed.id).all(node => node.className === 'talents-pick')[0].focus();
  const detail = m.byClass('talents-detail')[0];
  check('the detail shows the rank-one texts side by side with their tags', detail.textContent.includes('Rank one, side by side') && detail.textContent.includes(changed.classic.text) && detail.textContent.includes(changed.descriptions[0]) && m.byClass('talents-tag').length > 0);
  const fresh = talents.find(t => t.classic.status === 'new');
  nodeOf(fresh.id).all(node => node.className === 'talents-pick')[0].focus();
  check('a new talent detail says NEW IN FOREVER and that it has no Classic counterpart', detail.textContent.includes('NEW IN FOREVER') && detail.textContent.includes('No direct Classic counterpart'));
  // Drawer.
  const drawer = m.byClass('talents-changes')[0], summaries = drawer.all(node => node.tagName === 'SUMMARY').map(node => node.textContent);
  const link = drawer.all(node => node.tagName === 'A')[0];
  check('the What-changed drawer has one collapsible summary per specialization with the real counts', summaries.length === 3 && cls.trees.every((tree, i) => { const s = api.treeChangeSummary(tree); return summaries[i].startsWith(tree.name + ' · ' + s.new.length + ' new · ' + s.moved.length + ' moved'); }));
  check('the drawer names the dated snapshot and links the official deep dive safely', drawer.textContent.includes(data.source.clientBuilds[0]) && link.getAttribute('href') === api.CLASS_SOURCES.warrior && link.getAttribute('rel') === 'noopener noreferrer');
  check('the drawer sits beside the level-60 sheet in one insights row', m.byClass('talents-insights').length === 1 && m.byClass('talents-insights')[0].contains(drawer));
  // Back to Forever.
  const animationsBefore = m.document.animations.length;
  m.toggle(false);
  check('turning comparison off returns every node to its Forever cell and animates the movers back', talents.every(t => nodeOf(t.id).getAttribute('data-row') === String(t.row) && nodeOf(t.id).getAttribute('data-column') === String(t.column)) && m.document.animations.length - animationsBefore === moved.length && m.byClass('talents-tree').every(tree => tree.className === 'talents-tree'));
  check('points, share code and buttons survive the round trip', m.byClass('talents-pick').every((pick, i) => pick === picksBefore[i]) && api.parseBuild(data, m.byClass('talents-share-code')[0].getAttribute('value')).ok);
  // Reduced motion.
  const r = await mountWith({ reduced: true });
  r.toggle(true);
  const rTalents = data.classes[0].trees.flatMap(tree => tree.talents);
  check('reduced motion moves the nodes at once with no animation', r.document.animations.length === 0 && rTalents.every((t, i) => r.byClass('talents-node')[i].getAttribute('data-row') === String(places.get(t.id).row)));
  // A class opened while comparison is on is laid out without an animation burst.
  const s = await mountWith({ className: 'druid' });
  s.toggle(true); const druidAnimations = s.document.animations.length;
  s.byClass('talents-class-button').find(button => button.textContent === 'Mage').click();
  const mage = data.classes.find(c => c.id === 'mage'), magePlaces = new Map(mage.trees.flatMap(tree => [...api.classicPlacements(tree)]));
  check('switching class in compare mode places the new class in its Classic layout without animating it', s.document.animations.length === druidAnimations && mage.trees.flatMap(tree => tree.talents).every((t, i) => s.byClass('talents-node')[i].getAttribute('data-row') === String(magePlaces.get(t.id).row)));
  console.log(`\n${pass}/${n} passed`);
  if (pass !== n) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
