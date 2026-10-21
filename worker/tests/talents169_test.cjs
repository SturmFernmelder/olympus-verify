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
check('the compact desktop core retains three trees, 48px icon targets and 66px rows; small screens retain a readable single tree and bounded details', css.includes('.talents-trees{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}') && css.includes('--talent-row:66px') && css.includes('width:48px;height:48px') && !css.includes('285px') && css.includes('@media(max-width:760px){') && css.includes('.talents-trees{grid-template-columns:minmax(0,1fr)}') && css.includes('max-height:40svh') && css.includes('scroll-margin-bottom:45svh'));
const art = JSON.parse(fs.readFileSync(path.join(folder, 'art.json'), 'utf8'));
const artProvenance = JSON.parse(fs.readFileSync(path.join(folder, 'art-provenance.json'), 'utf8'));
const dataProvenance = JSON.parse(fs.readFileSync(path.join(folder, 'provenance.json'), 'utf8'));
check('the actual artwork map is closed over all 9 classes, 27 trees and 466 unchanged talent identities', api.validateArt(data, art).ok && api.validateArt(data, art).classes === 9 && api.validateArt(data, art).trees === 27 && api.validateArt(data, art).talents === 466);
check('all 396 recorded game-art distributions retain exact downloaded bytes and honest fan-source limits', artProvenance.assets.length === 396 && artProvenance.sourceDataSHA256 === data.source.rawSHA256 && artProvenance.mappingRevision === data.revision && artProvenance.assets.every(row => { const bytes = fs.readFileSync(path.join(__dirname, '../..', row.path)); return row.path.startsWith('worker/public/static/wow/talents/') && /^https:\/\/talentsforever\.com\/assets\//.test(row.sourceURL) && row.conversion === 'none; exact downloaded JPEG bytes' && bytes.length === row.bytes && crypto.createHash('sha256').update(bytes).digest('hex') === row.sha256; }) && artProvenance.limits.some(text => text.includes('not a Blizzard-hosted download or publisher-signed byte attestation')) && artProvenance.limits.some(text => text.includes('does not grant rights to Blizzard artwork')));
check('the new art import is declared separately without changing data bytes or copying the source website code', dataProvenance.artCopied === true && dataProvenance.siteCodeCopied === false && dataProvenance.artProvenance === '/static/talents/art-provenance.json' && dataProvenance.normalizedSHA256 === crypto.createHash('sha256').update(raw).digest('hex') && source.includes('World of Warcraft artwork © Blizzard Entertainment.') && source.includes('Unofficial guild tool; not affiliated with Blizzard.'));
check('a different snapshot revision cannot supply artwork for this calculator', !api.validateArt(data, { ...art, revision: '0'.repeat(12) }).ok);
check('missing or extra talent-image identities cannot silently substitute another map', (() => { const missing = clone(art), extra = clone(art); delete missing.talentIcons[Object.keys(missing.talentIcons)[0]]; extra.talentIcons['not-a-talent'] = art.classIcons.warrior; return !api.validateArt(data, missing).ok && !api.validateArt(data, extra).ok; })());
check('remote, embedded, query-bearing and traversal artwork addresses refuse before any image is rendered', ['https://evil.example/icon.jpg', 'data:image/png;base64,aA==', '/static/wow/talents/icon.jpg?token=x', '/static/wow/../icon.jpg'].every(url => { const broken = clone(art); broken.talentIcons[Object.keys(broken.talentIcons)[0]] = url; return !api.validateArt(data, broken).ok; }));

// A small DOM with native append/replaceChildren coercion: null becomes text,
// so this real mount regression cannot accidentally hide the observed browser bug.
class TalentText {
  constructor(value) { this.nodeType = 3; this.textContent = String(value); this.parentNode = null; }
}
class TalentElement {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.nodeType = 1; this.childNodes = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.value = ''; this.parentNode = null; this.hidden = false; }
  append(...nodes) { for (const value of nodes) { const node = value instanceof TalentElement || value instanceof TalentText ? value : this.ownerDocument.createTextNode(String(value)); if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1); node.parentNode = this; this.childNodes.push(node); } }
  replaceChildren(...nodes) { for (const node of this.childNodes) node.parentNode = null; this.childNodes = []; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(this.ownerDocument.createTextNode(value)); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'src') { this.srcAssignments = (this.srcAssignments || 0) + 1; if (this.tagName === 'IMG') this.ownerDocument.imageLoaded?.(this); } }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src' && this.tagName === 'IMG') this.ownerDocument.imageRemoved?.(this); }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, extra = {}) { const event = { target: this, currentTarget: this, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const handler of this.listeners[type] || []) handler(event); return event; }
  focus() { if (this.ownerDocument.activeElement !== this) { this.ownerDocument.activeElement = this; this.dispatch('focus'); } }
  click() { if (!this.disabled) this.dispatch('click'); }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  all(predicate) { return this.childNodes.filter(node => node.nodeType === 1).flatMap(node => [...(predicate(node) ? [node] : []), ...node.all(predicate)]); }
  querySelectorAll(selector) { if (selector !== 'img') throw Error('Only the native image query is used by this fixture.'); return this.all(node => node.tagName === 'IMG'); }
}
async function detailRenderRegression() {
  // Normal image attempts emit load before the original exact-artwork assertions.
  // Keep the two original failure targets genuinely in flight until their error
  // assertions; tooltip copies of the same artwork still complete normally.
  const heldArtwork187 = new Set([art.talentIcons[deflection.id], art.talentIcons[all(data.classes[1])[0].id]]);
  const nativeImageLoaded187 = node => {
    if (node.srcAssignments === 1 && heldArtwork187.has(node.getAttribute('src')) && node.parentNode?.className.split(/\s+/).includes('talents-pick')) return;
    node.dispatch('load');
  };
  const document = { createElement(tag) { return new TalentElement(tag, this); }, createTextNode(value) { return new TalentText(value); }, activeElement: null, imageLoaded: nativeImageLoaded187 };
  const container = document.createElement('main'), browserModule = { exports: {} }, changes = [], copiedLinks = [];
  const timers = new Map();
  let reads = 0, ownDataRequest = true, timerId = 0, time = 0;
  const advance = milliseconds => { time += milliseconds; for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.callback(); } };
  vm.runInNewContext(source, {
    module: browserModule,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    location: { origin: 'https://guild.example', pathname: '/' },
    navigator: { clipboard: { async writeText(value) { copiedLinks.push(value); } } },
    fetch: async (url, options) => { reads++; ownDataRequest = ownDataRequest && ['/static/talents/data.json', '/static/talents/art.json'].includes(url) && options.credentials === 'same-origin'; return { ok: true, json: async () => clone(url.endsWith('/art.json') ? art : data) }; },
  }, { filename: path.join(folder, 'calculator.js'), timeout: 1000 });
  const controller = await browserModule.exports.mount(container, { onBuildChange: value => changes.push(value) });
  const byClass = (node, name) => node.all(child => child.className.split(/\s+/).includes(name));
  const detail = () => byClass(container, 'talents-detail')[0];
  const titles = () => detail().all(node => node.tagName === 'H4').map(node => node.textContent);
  const pick = name => byClass(container, 'talents-pick').find(node => (node.getAttribute('aria-label') || '').startsWith(name + ', rank '));
  const detailOwners = () => byClass(container, 'talents-node').filter(node => node.getAttribute('data-detail-open') === 'true');
  const pointLabels = () => byClass(container, 'talents-tree-header').map(node => node.all(child => child.tagName === 'STRONG')[0].textContent);
  const heroic = find('Improved Heroic Strike');
  check('the real initial passive talent omits absent cost, prerequisite and next rank without literal null text', ownDataRequest && reads === 2 && detail().textContent.includes(heroic.descriptions[0]) && !detail().textContent.includes('null') && byClass(detail(), 'talents-cost').length === 0 && byClass(detail(), 'talents-requires').length === 0 && !titles().includes('Next rank'));
  check('the initial hidden detail has no elevated owner and empty trees use plural point labels', detail().hidden && detailOwners().length === 0 && pointLabels().join() === '0 points,0 points,0 points');
  const initialArtwork = container.querySelectorAll('img').filter(node => !detail().contains(node));
  const initialShell179 = byClass(container, 'talents-tool')[0], initialTrees179 = byClass(container, 'talents-tree'), initialButtons179 = byClass(container, 'talents-pick'), initialDetail179 = detail(), initialToolbar179 = byClass(container, 'talents-toolbar')[0];
  pick(heroic.name).click();
  check('the real point control renders current and next rank text without converting absent fields to null', changes.at(-1).points === 1 && byClass(detail(), 'talents-rank')[0].textContent.startsWith('Rank 1 / 3') && detail().textContent.includes(heroic.descriptions[0]) && detail().textContent.includes(heroic.descriptions[1]) && titles().includes('Next rank') && !detail().textContent.includes('null'));
  check('the real branch counter uses singular point only for one allocated point', pointLabels().join() === '1 point,0 points,0 points');
  check('a real point edit reuses every mounted class, portrait, tree and talent image without assigning their protected URLs again', initialArtwork.length > 60 && initialArtwork.every(node => container.contains(node) && node.srcAssignments === 1));
  check('.179 a point paints the original shell, tree nodes, all buttons, toolbar and detail container in place', byClass(container, 'talents-tool')[0] === initialShell179 && initialTrees179.every((node, index) => byClass(container, 'talents-tree')[index] === node) && initialButtons179.every((node, index) => byClass(container, 'talents-pick')[index] === node) && detail() === initialDetail179 && byClass(container, 'talents-toolbar')[0] === initialToolbar179);
  const copyLink = () => byClass(container, 'talents-toolbar')[0].all(node => node.tagName === 'BUTTON').find(button => button.textContent === 'Copy link');
  copyLink().click(); await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve)); // Complete the real VM async clipboard callback before reading its feedback.
  check('.187 copied-build feedback retains the exact plan link while stating sign-in and normal access requirements', copiedLinks.at(-1).startsWith('https://guild.example/#/talents/warrior/') && byClass(container, 'talents-feedback')[0].textContent === "Build link copied. Recipients must sign in and meet the site's access requirements." && !container.textContent.includes('Anyone with the link can open it.'));
  const beforeReselect = { callbacks: changes.length, code: byClass(container, 'talents-share-code')[0].getAttribute('value'), link: copiedLinks.at(-1), selected: pick(heroic.name) };
  byClass(container, 'talents-class-button').find(button => button.textContent === 'Warrior').click();
  copyLink().click(); await Promise.resolve();
  check('re-selecting the active class preserves the allocated point, exact share URL, selection and change-callback count', changes.length === beforeReselect.callbacks && changes.at(-1).points === 1 && byClass(container, 'talents-share-code')[0].getAttribute('value') === beforeReselect.code && copiedLinks.at(-1) === beforeReselect.link && beforeReselect.link === 'https://guild.example/#/talents/warrior/' + beforeReselect.code && pick(heroic.name) === beforeReselect.selected && pick(heroic.name).getAttribute('aria-pressed') === 'true' && byClass(detail(), 'talents-rank')[0].textContent.startsWith('Rank 1 / 3'));
  pick(heroic.name).click(); pick(heroic.name).click();
  check('the real maximum-rank render removes only the absent next rank and retains current/all-rank descriptions', changes.at(-1).points === 3 && byClass(detail(), 'talents-rank')[0].textContent.startsWith('Rank 3 / 3') && detail().textContent.includes(heroic.descriptions[2]) && !titles().includes('Next rank') && byClass(detail(), 'talents-all-ranks')[0].all(node => node.tagName === 'LI').length === heroic.maxRank && !detail().textContent.includes('null'));
  check('multiple allocated points retain the plural branch counter and exact total', pointLabels().join() === '3 points,0 points,0 points' && changes.at(-1).points === 3);
  const detailControls179 = byClass(detail(), 'talents-detail-controls')[0], refund179 = detailControls179.all(node => node.tagName === 'BUTTON')[0], learn179 = detailControls179.all(node => node.tagName === 'BUTTON')[1], allRanks179 = byClass(detail(), 'talents-all-ranks')[0];
  allRanks179.open = true; detail().scrollTop = 37; refund179.focus(); refund179.click();
  check('.179 refund keeps the active detail button, expanded rank list and detail scroll while updating exact ranks', document.activeElement === refund179 && byClass(detail(), 'talents-detail-controls')[0] === detailControls179 && byClass(detail(), 'talents-all-ranks')[0] === allRanks179 && allRanks179.open === true && detail().scrollTop === 37 && changes.at(-1).points === 2 && byClass(detail(), 'talents-rank')[0].textContent.startsWith('Rank 2 / 3'));
  learn179.focus(); learn179.click();
  check('.179 learning keeps its original focused control and changes the model exactly once', document.activeElement === learn179 && byClass(detail(), 'talents-detail-controls')[0] === detailControls179 && changes.at(-2).points === 2 && changes.at(-1).points === 3 && learn179.disabled && initialButtons179.every(node => container.contains(node)));
  const mortal = find('Mortal Strike'), parent = all(data.classes[0]).find(talent => talent.id === mortal.requires);
  pick(mortal.name).focus();
  check('real present cost and prerequisite fields remain readable without allocating a locked talent or mutating the snapshot', byClass(detail(), 'talents-cost')[0].textContent === mortal.cost && byClass(detail(), 'talents-requires')[0].textContent === 'Requires ' + parent.name + ' at maximum rank.' && detail().textContent.includes(mortal.descriptions[0]) && !detail().textContent.includes('null') && changes.at(-1).points === 3 && initialJSON === JSON.stringify(data));
  const classButtons = () => byClass(container, 'talents-class-button');
  check('the real class strip exposes all 9 labelled icon controls and three current spec-point bars', classButtons().length === 9 && classButtons().every((button, index) => button.textContent === data.classes[index].name && button.all(node => node.tagName === 'IMG')[0].getAttribute('src') === art.classIcons[data.classes[index].id]) && byClass(container, 'talents-class-banner')[0].textContent.includes('Warrior') && byClass(container, 'talents-spec-bars')[0].all(node => node.tagName === 'METER').length === 3);
  check('the compact tree uses all 52 real talent icons, three header images and three painted backdrops without fake sigils or extra point rows', byClass(container, 'talents-pick').length === 52 && byClass(container, 'talents-pick').every((button, index) => button.all(node => node.tagName === 'IMG')[0].getAttribute('src') === art.talentIcons[all(data.classes[0])[index].id]) && byClass(container, 'talents-tree-header').every((header, index) => header.all(node => node.tagName === 'IMG')[0].getAttribute('src') === art.treeIcons['warrior-' + data.classes[0].trees[index].id]) && byClass(container, 'talents-backdrop').every((image, index) => image.getAttribute('src') === art.treeBackgrounds['warrior-' + data.classes[0].trees[index].id]) && byClass(container, 'talents-point-controls').length === 0 && !source.includes('talents-sigil'));
  const requirements = all(data.classes[0]).filter(talent => talent.requires), edges = byClass(container, 'talents-link');
  check('every real prerequisite has a behind-grid connection bound to its actual parent row and child position', edges.length === requirements.length && edges.every((edge, index) => { const child = requirements[index], prior = all(data.classes[0]).find(talent => talent.id === child.requires); return edge.className.includes('from-r' + prior.row) && edge.className.includes('to-r' + child.row) && edge.className.includes('to-c' + child.column) && edge.className.includes('span-r' + (child.row - prior.row)); }) && css.includes('.talents-links{position:absolute;z-index:1;') && css.includes('.talents-node{position:relative;z-index:2;'));
  pick(heroic.name).dispatch('pointerenter');
  const inspected = !detail().hidden && detail().textContent.includes(heroic.name) && pick(heroic.name).getAttribute('aria-describedby') === detail().getAttribute('id');
  const escaped = pick(heroic.name).dispatch('keydown', { key: 'Escape' });
  check('pointer inspection opens full details and Escape closes them without spending a point', inspected && escaped.defaultPrevented && detail().hidden && changes.at(-1).points === 3);
  pick(deflection.name).focus();
  const focusedNode = pick(deflection.name).parentNode;
  pick(heroic.name).dispatch('pointerenter');
  const layer = selector => Number(css.match(new RegExp(selector + '\\{z-index:(\\d+)\\}'))?.[1]);
  check('hovering Improved Heroic Strike transfers the sole overlay above a still-focused Deflection sibling', document.activeElement === pick(deflection.name) && detailOwners().length === 1 && detailOwners()[0] === pick(heroic.name).parentNode && focusedNode.getAttribute('data-detail-open') === null && pick(deflection.name).getAttribute('aria-describedby') === null && pick(heroic.name).getAttribute('aria-describedby') === detail().getAttribute('id') && layer('\\.talents-node\\[data-detail-open="true"\\]') > layer('\\.talents-node:hover,\\.talents-node:focus-within'));
  const cruelty = find('Cruelty');
  pick(cruelty.name).dispatch('pointerenter');
  const crueltyNode = pick(cruelty.name).parentNode;
  crueltyNode.dispatch('pointerleave', { relatedTarget: null }); advance(249);
  const duringGap = !detail().hidden && timers.size === 1 && detail().textContent.includes(cruelty.name);
  // Entering an absolutely positioned descendant fires pointerenter on its owner too.
  crueltyNode.dispatch('pointerenter'); advance(1);
  const learn = byClass(detail(), 'talents-detail-controls')[0].all(node => node.tagName === 'BUTTON').find(node => node.textContent === '+ Learn');
  crueltyNode.dispatch('pointerleave', { relatedTarget: learn }); advance(500);
  check('a hover-only Cruelty detail survives the gap and entry into its enabled controls cancels dismissal', duringGap && !detail().hidden && !learn.disabled && timers.size === 0 && detailOwners()[0] === crueltyNode && document.activeElement === pick(deflection.name) && changes.at(-1).points === 3);
  byClass(detail(), 'talents-detail-close')[0].click();
  check('Close returns focus to the inspected talent while removing its overlay priority', detail().hidden && detailOwners().length === 0 && document.activeElement === pick(cruelty.name) && timers.size === 0);
  pick(deflection.name).focus(); pick(cruelty.name).dispatch('pointerenter');
  crueltyNode.dispatch('pointerleave', { relatedTarget: null }); advance(250);
  check('leaving a hover-only detail outside its owner closes it after the bounded grace period', detail().hidden && detailOwners().length === 0 && timers.size === 0 && document.activeElement === pick(deflection.name));
  pick(heroic.name).dispatch('pointerenter'); pick(heroic.name).parentNode.dispatch('pointerleave', { relatedTarget: null });
  pick(mortal.name).dispatch('pointerenter'); advance(250);
  check('moving inspection to another talent cancels the prior leave timer without closing the new details', !detail().hidden && detail().textContent.includes(mortal.name) && detailOwners().length === 1 && detailOwners()[0] === pick(mortal.name).parentNode && timers.size === 0);
  pick(mortal.name).parentNode.dispatch('pointerleave', { relatedTarget: null }); detail().focus(); advance(250);
  check('keyboard focus inside the detail keeps it open when a pending pointer dismissal expires', !detail().hidden && document.activeElement === detail() && detailOwners().length === 1 && timers.size === 0);
  pick(cruelty.name).focus();
  const entered = pick(cruelty.name).dispatch('keydown', { key: 'I' }), detailFocused = document.activeElement === detail();
  const detailEscaped = detail().dispatch('keydown', { key: 'Escape' });
  check('I enters the detail and Escape restores its talent focus and clears overlay priority', entered.defaultPrevented && detailFocused && detailEscaped.defaultPrevented && document.activeElement === pick(cruelty.name) && detail().hidden && detailOwners().length === 0 && changes.at(-1).points === 3);
  pick(heroic.name).dispatch('pointerenter'); pick(heroic.name).parentNode.dispatch('pointerleave', { relatedTarget: null });
  const pendingBeforeRender = timers.size === 1;
  const comparison = byClass(container, 'talents-compare-switch')[0].all(node => node.tagName === 'INPUT')[0];
  comparison.dispatch('change', { target: { checked: true } }); pick(mortal.name).focus();
  advance(250);
  check('a rebuild cancels the detached tooltip timer and preserves the newly focused detail', pendingBeforeRender && timers.size === 0 && !detail().hidden && detail().textContent.includes(mortal.name) && detailOwners().length === 1);
  check('actual Compare to Classic retains badges,current rank controls and the supplied Classic reference text', detail().textContent.includes('Classic comparison') && detail().textContent.includes(mortal.classic.text) && byClass(container, 'talents-node-badges').length === 52 && byClass(container, 'talents-comparison-legend').length === 1 && byClass(detail(), 'talents-detail-controls')[0].all(node => node.tagName === 'BUTTON').length === 2);
  check('.179 Classic toggle retains all original talent buttons and detail container without an extra build callback', initialButtons179.every((button, index) => byClass(container, 'talents-pick')[index] === button) && detail() === initialDetail179 && byClass(container, 'talents-toolbar')[0] === initialToolbar179 && changes.at(-1).points === 3);
  pick(heroic.name).dispatch('keydown', { key: '-' }); pick(heroic.name).dispatch('keydown', { key: '+' });
  check('keyboard refund and allocation preserve the exact versioned share code and original point rules', changes.at(-2).points === 2 && changes.at(-1).points === 3 && api.validateBuild(data, api.parseBuild(data, byClass(container, 'talents-share-code')[0].getAttribute('value')).build).points === 3);
  const failedIcon = pick(deflection.name).all(node => node.tagName === 'IMG')[0], exactArtworkURL = failedIcon.getAttribute('src'), assignmentsBeforeFailure = failedIcon.srcAssignments;
  failedIcon.dispatch('error');
  const artworkNotice = byClass(container, 'talents-artwork-notice')[0];
  check('failed artwork gets a truthful notice without an automatic retry or any talent-point mutation', failedIcon.hidden && !artworkNotice.hidden && artworkNotice.textContent.includes('Talent names, details and point rules are still available.') && failedIcon.srcAssignments === assignmentsBeforeFailure && changes.at(-1).points === 3);
  const oldArtworkRetry = artworkNotice.all(node => node.tagName === 'BUTTON').find(node => node.textContent === 'Retry artwork');
  document.imageLoaded = null; // Keep this explicit retry pending for the original assertion.
  oldArtworkRetry.click();
  check('one explicit artwork retry reuses only the exact failed mounted private URL without a query, data URL or point change', failedIcon.srcAssignments === assignmentsBeforeFailure + 1 && failedIcon.getAttribute('src') === exactArtworkURL && !exactArtworkURL.includes('?') && failedIcon.hidden && changes.at(-1).points === 3);
  failedIcon.dispatch('load');
  document.imageLoaded = nativeImageLoaded187;
  check('successful retried artwork becomes visible and clears the partial-failure notice', !failedIcon.hidden && artworkNotice.hidden);
  classButtons().find(button => button.textContent === 'Paladin').click();
  check('an actual class-icon action changes class and restores its three real trees with an empty valid build', changes.at(-1).className === 'paladin' && changes.at(-1).points === 0 && byClass(container, 'talents-tree')[0].getAttribute('aria-label') === 'Holy' && byClass(container, 'talents-backdrop')[0].getAttribute('src') === art.treeBackgrounds['paladin-holy']);
  const paladinFirst = all(data.classes[1])[0]; pick(paladinFirst.name).click();
  const paladinIcon = pick(paladinFirst.name).all(node => node.tagName === 'IMG')[0]; paladinIcon.dispatch('error');
  const paladinAssignments = paladinIcon.srcAssignments;
  oldArtworkRetry.click();
  check('a detached previous-render artwork retry cannot retry a later current class', paladinIcon.srcAssignments === paladinAssignments && paladinIcon.hidden);
  byClass(container, 'talents-toolbar')[0].all(node => node.tagName === 'BUTTON').find(button => button.textContent === 'Reset').click();
  check('the actual Reset control clears an invested build while retaining class and snapshot data', changes.at(-2).points === 1 && changes.at(-1).points === 0 && changes.at(-1).className === 'paladin' && initialJSON === JSON.stringify(data));
  const importedContainer = document.createElement('main');
  const imported = await browserModule.exports.mount(importedContainer, { className: 'warrior', build: code });
  check('the real image renderer imports the unchanged exact build without re-reading or mutating its data', byClass(importedContainer, 'talents-share-code')[0].getAttribute('value') === code && api.validateBuild(data, api.parseBuild(data, code).build).points === 16 && reads === 2 && initialJSON === JSON.stringify(data));
  imported.destroy();
  pick(paladinFirst.name).dispatch('pointerenter'); pick(paladinFirst.name).parentNode.dispatch('pointerleave', { relatedTarget: null });
  const pendingBeforeDestroy = timers.size === 1;
  const currentFailedIcon = pick(paladinFirst.name).all(node => node.tagName === 'IMG')[0]; currentFailedIcon.dispatch('error');
  const currentRetry = byClass(container, 'talents-artwork-notice')[0].all(node => node.tagName === 'BUTTON')[0], beforeDestroyedRetry = currentFailedIcon.srcAssignments;
  controller.destroy();
  check('destroying the calculator clears its outstanding pointer dismissal timer', pendingBeforeDestroy && timers.size === 0);
  currentRetry.click();
  check('a destroyed calculator cannot issue an artwork retry', currentFailedIcon.srcAssignments === beforeDestroyedRetry);
  for (const cls of data.classes) {
    const matrixContainer179 = document.createElement('main'), matrixChanges179 = [], first179 = all(cls).find(talent => talent.row === 1 && talent.maxRank > 1);
    const matrix179 = await browserModule.exports.mount(matrixContainer179, { className: cls.id, onBuildChange: build => matrixChanges179.push(build) });
    const grid179 = byClass(matrixContainer179, 'talents-grid'), buttons179 = byClass(matrixContainer179, 'talents-pick'), toolbar179 = byClass(matrixContainer179, 'talents-toolbar')[0];
    const target179 = buttons179.find(button => button.getAttribute('aria-label').startsWith(first179.name + ', rank ')), level179 = toolbar179.all(node => node.tagName === 'SELECT').find(select => select.getAttribute('aria-label') === 'Character level');
    level179.value = '10'; level179.dispatch('change'); target179.click();
    const atOne179 = matrixChanges179.length, codeAtOne179 = byClass(matrixContainer179, 'talents-share-code')[0].getAttribute('value'); target179.click();
    const rejected179 = matrixChanges179.length === atOne179 && byClass(matrixContainer179, 'talents-share-code')[0].getAttribute('value') === codeAtOne179;
    level179.value = '11'; level179.dispatch('change'); target179.click();
    const exactTwo179 = matrixChanges179.at(-1).points === 2 && api.parseBuild(data, byClass(matrixContainer179, 'talents-share-code')[0].getAttribute('value')).points === 2;
    const compare179 = byClass(matrixContainer179, 'talents-compare-switch')[0].all(node => node.tagName === 'INPUT')[0], changesBeforeCompare179 = matrixChanges179.length;
    compare179.dispatch('change', { target: { checked: true } }); compare179.dispatch('change', { target: { checked: false } });
    const comparisonDidNotWrite179 = matrixChanges179.length === changesBeforeCompare179;
    toolbar179.all(node => node.tagName === 'BUTTON').find(button => button.textContent === 'Reset').click();
    check('.179 ' + cls.name + ': level, rapid rejected point, comparison and reset retain every mounted grid/button and strict share budget', rejected179 && exactTwo179 && comparisonDidNotWrite179 && matrixChanges179.at(-1).points === 0 && byClass(matrixContainer179, 'talents-toolbar')[0] === toolbar179 && grid179.every((grid, index) => byClass(matrixContainer179, 'talents-grid')[index] === grid) && buttons179.every((button, index) => byClass(matrixContainer179, 'talents-pick')[index] === button) && buttons179.every(button => button.all(node => node.tagName === 'IMG')[0].srcAssignments === 1));
    matrix179.destroy();
  }
  check('.179 decorative feedback is limited to icon controls and explicitly disabled for reduced motion', css.includes('.talents-node[data-feedback="learn-a"]>.talents-pick') && css.includes('@media(prefers-reduced-motion:reduce){.talents-tool *{animation:none!important;transition:none!important}}') && !/\.talents-node\[data-feedback[^}]+\{[^}]*transform:/.test(css));
  const guideContext179 = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'guide-builds179.js'), 'utf8'), guideContext179, { filename: 'guide-builds179.js', timeout: 1000 });
  const guideData179 = guideContext179.window.OlympusTalentGuides;
  check('.179 guide inventory has fourteen allocations from seven classes and original guide sources for all nine', guideData179.revision === data.revision && guideData179.records.length === 14 && new Set(guideData179.records.map(r => r.className)).size === 7 && data.classes.every(c => guideData179.sources.filter(s => s.className === c.id).length === 1));
  const currentMage185 = guideData179.records.filter(record => record.className === 'mage');
  check('.185 current Method Mage allocations retain both independently decoded 21 October vectors and matching source dates', currentMage185.length === 2 && currentMage185[0].code === 'ot1.260cf99b52db.mage.60.0000000000000000000000000000000000000525003001001300100' && currentMage185[0].treePoints.join('/') === '0/0/21' && currentMage185[1].code === 'ot1.260cf99b52db.mage.60.0002000000000000000000000000000000000525003201001300200' && currentMage185[1].treePoints.join('/') === '2/0/24' && currentMage185.every(record => record.author === 'Celz' && record.updatedAt === '21st October 2026') && guideData179.sources.filter(source => ['hunter', 'mage'].includes(source.className)).every(source => source.updatedAt === '21st October 2026'));
  for (const record of guideData179.records) {
    const decoded179 = api.parseBuild(data, record.code), checked179 = decoded179.ok && api.validateBuild(data, decoded179.build), source179 = guideData179.sources.find(s => s.className === record.className);
    check('.179 exact published guide vector stays valid without changing ranks: ' + record.id, checked179?.ok && decoded179.build.className === record.className && checked179.points === record.points && checked179.treePoints.join('/') === record.treePoints.join('/') && api.serializeBuild(data, decoded179.build) === record.code && record.url === source179.url && record.author === source179.author && record.updatedAt === source179.updatedAt);
  }
  for (const cls of data.classes) {
    const guideContainer179 = document.createElement('main'), guideChanges179 = [];
    const guideController179 = await browserModule.exports.mount(guideContainer179, { className: cls.id, guideBuilds: clone(guideData179), onBuildChange: change => guideChanges179.push(change) });
    const panel179 = byClass(guideContainer179, 'talents-guides')[0], records179 = guideData179.records.filter(record => record.className === cls.id), source179 = guideData179.sources.find(source => source.className === cls.id);
    const shell179 = byClass(guideContainer179, 'talents-tool')[0], about179 = byClass(guideContainer179, 'talents-guide-about')[0];
    check('.179 ' + cls.name + ': compact guide controls precede the trees with source and limitations folded into native details', shell179.childNodes.indexOf(panel179) < shell179.childNodes.indexOf(byClass(guideContainer179, 'talents-workspace')[0]) && about179?.tagName === 'DETAILS' && about179.open !== true && about179.textContent.includes(source179.author));
    if (!records179.length) {
      check('.179 ' + cls.name + ': unavailable guide allocation retains author/date/source link without invented Load action', panel179?.textContent.includes('No checked compatible allocation in this snapshot') && panel179.textContent.includes(source179.author) && panel179.textContent.includes(source179.updatedAt) && panel179.all(node => node.tagName === 'A')[0].getAttribute('href') === source179.url && panel179.all(node => node.tagName === 'SELECT' || node.tagName === 'BUTTON').length === 0 && guideChanges179.length === 0);
    } else {
      const select179 = panel179.all(node => node.tagName === 'SELECT')[0], load179 = panel179.all(node => node.tagName === 'BUTTON')[0], before179 = byClass(guideContainer179, 'talents-share-code')[0].getAttribute('value'), tree179 = byClass(guideContainer179, 'talents-tree')[0], firstButton179 = byClass(guideContainer179, 'talents-pick')[0];
      select179.value = records179[0].id; select179.dispatch('change');
      const selectionOnly179 = guideChanges179.length === 0 && byClass(guideContainer179, 'talents-share-code')[0].getAttribute('value') === before179 && !load179.disabled && panel179.textContent.includes('Minimum level ' + Math.max(10, records179[0].points + 9));
      load179.focus(); load179.click();
      check('.179 ' + cls.name + ': guide selection only previews; explicit Load preserves mounted tree/focus and publishes the exact checked code once', selectionOnly179 && guideChanges179.length === 1 && guideChanges179[0].build === records179[0].code && byClass(guideContainer179, 'talents-share-code')[0].getAttribute('value') === records179[0].code && document.activeElement === load179 && byClass(guideContainer179, 'talents-tree')[0] === tree179 && byClass(guideContainer179, 'talents-pick')[0] === firstButton179 && panel179.textContent.includes(source179.author) && panel179.textContent.includes('Legacy bonus points') && panel179.textContent.includes("leveling order are not applied"));
    }
    guideController179.destroy();
  }
  const staleGuides179 = clone(guideData179), staleGuideContainer179 = document.createElement('main'), staleGuideChanges179 = [];
  const staleGuide179 = await browserModule.exports.mount(staleGuideContainer179, { guideBuilds: staleGuides179, onBuildChange: change => staleGuideChanges179.push(change) });
  const stalePanel179 = byClass(staleGuideContainer179, 'talents-guides')[0], staleSelect179 = stalePanel179.all(node => node.tagName === 'SELECT')[0], staleLoad179 = stalePanel179.all(node => node.tagName === 'BUTTON')[0];
  staleSelect179.value = staleGuides179.records[0].id; staleSelect179.dispatch('change'); staleGuides179.records[0].code = 'ot1.invalid'; staleLoad179.click();
  check('.179 guide Load rechecks the exact code and refuses a changed or invalid allocation without altering the plan', staleGuideChanges179.length === 0 && stalePanel179.textContent.includes('Your plan was not changed') && api.parseBuild(data, byClass(staleGuideContainer179, 'talents-share-code')[0].getAttribute('value')).points === 0);
  staleGuide179.destroy();
  const detachedGuideContainer179 = document.createElement('main'), detachedGuideChanges179 = [], detachedGuides179 = clone(guideData179);
  const detachedGuide179 = await browserModule.exports.mount(detachedGuideContainer179, { guideBuilds: detachedGuides179, onBuildChange: change => detachedGuideChanges179.push(change) });
  const detachedPanel179 = byClass(detachedGuideContainer179, 'talents-guides')[0], detachedSelect179 = detachedPanel179.all(node => node.tagName === 'SELECT')[0], detachedLoad179 = detachedPanel179.all(node => node.tagName === 'BUTTON')[0];
  detachedSelect179.value = detachedGuides179.records[0].id; detachedSelect179.dispatch('change');
  byClass(detachedGuideContainer179, 'talents-class-button').find(button => button.textContent === 'Druid').click();
  const afterClassChange179 = byClass(detachedGuideContainer179, 'talents-share-code')[0].getAttribute('value'), detachedChangeCount179 = detachedGuideChanges179.length;
  detachedSelect179.dispatch('change'); detachedLoad179.click();
  check('.179 detached prior-class guide controls cannot replace the current local class plan', detachedGuideChanges179.length === detachedChangeCount179 && byClass(detachedGuideContainer179, 'talents-share-code')[0].getAttribute('value') === afterClassChange179 && api.parseBuild(data, afterClassChange179).build.className === 'druid');
  detachedGuide179.destroy();
  const mismatchedContainer179 = document.createElement('main'), mismatchedGuide179 = await browserModule.exports.mount(mismatchedContainer179, { guideBuilds: { ...guideData179, revision: '0'.repeat(12) } });
  check('.179 a guide manifest for another data revision cannot expose a Load action', byClass(mismatchedContainer179, 'talents-guides').length === 0 && api.parseBuild(data, byClass(mismatchedContainer179, 'talents-share-code')[0].getAttribute('value')).points === 0);
  mismatchedGuide179.destroy();
  const analysisContainer179 = document.createElement('main'), analysisEvents179 = [];
  const analysisController179 = await browserModule.exports.mount(analysisContainer179, { analysis: { mount(host, args) { analysisEvents179.push({ action: 'mount', host, className: args.build.className }); return { update(build) { analysisEvents179.push({ action: 'update', className: build.className, points: build.ranks.reduce((sum, rank) => sum + rank, 0) }); }, destroy() { analysisEvents179.push({ action: 'destroy' }); } }; } } });
  const analysisHost179 = byClass(analysisContainer179, 'talents-analysis-host')[0];
  byClass(analysisContainer179, 'talents-pick')[0].click();
  check('.179 optional analysis receives the current valid point model while its original host stays mounted', analysisEvents179.filter(event => event.action === 'mount').length === 1 && analysisEvents179.at(-1).action === 'update' && analysisEvents179.at(-1).points === 1 && byClass(analysisContainer179, 'talents-analysis-host')[0] === analysisHost179);
  byClass(analysisContainer179, 'talents-class-button').find(button => button.textContent === 'Druid').click();
  analysisController179.destroy();
  check('.179 analysis lifecycle destroys the prior class module and final mount without a data fetch', analysisEvents179.filter(event => event.action === 'mount').length === 2 && analysisEvents179.filter(event => event.action === 'destroy').length === 2 && reads === 2);

  // Delayed native terminal events exercise the actual queue using observable src
  // assignments, DOM ownership and cancellation, without reading queue internals.
  const attempts187 = [], pending187 = new Map(); let maximum187 = 0;
  const delayedDocument187 = {
    createElement(tag) { return new TalentElement(tag, this); }, createTextNode(value) { return new TalentText(value); }, activeElement: null,
    imageLoaded(node) {
      if (pending187.has(node)) throw Error('An active image attempt was assigned again');
      const attempt = { node, url: node.getAttribute('src'), terminal: null };
      attempts187.push(attempt); pending187.set(node, attempt); maximum187 = Math.max(maximum187, pending187.size);
    },
    imageRemoved(node) { const attempt = pending187.get(node); if (attempt) { attempt.terminal = 'cancelled'; pending187.delete(node); } },
  };
  const settleImage187 = (node, type = 'load') => {
    const attempt = pending187.get(node); if (!attempt) throw Error('No pending image attempt to settle');
    attempt.terminal = type; pending187.delete(node); node.dispatch(type);
  };
  const slowHost187 = delayedDocument187.createElement('main'), slowChanges187 = [];
  const slow187 = await browserModule.exports.mount(slowHost187, { onBuildChange: value => slowChanges187.push(value) });
  const coldImages187 = slowHost187.querySelectorAll('img'), navImages187 = byClass(slowHost187, 'talents-class-button').map(button => button.all(node => node.tagName === 'IMG')[0]);
  check('.187 a cold real mount assigns only four protected image URLs while the remaining visible artwork is queued', pending187.size === 4 && attempts187.length === 4 && maximum187 === 4 && coldImages187.length > 60 && coldImages187.filter(node => node.srcAssignments === 1).length === 4 && coldImages187.filter(node => !node.srcAssignments).length > 50 && slowChanges187.length === 0);
  let navSettlements187 = 0;
  while ([...pending187.keys()].some(node => navImages187.includes(node))) { if (++navSettlements187 > 9) throw Error('Class strip requested more than its nine images'); settleImage187([...pending187.keys()].find(node => navImages187.includes(node))); }
  const oldInFlight187 = [...pending187.keys()], oldQueued187 = coldImages187.filter(node => !node.srcAssignments), beforeClass187 = attempts187.length;
  byClass(slowHost187, 'talents-class-button').find(button => button.textContent === 'Paladin').click();
  const paladinQueued187 = slowHost187.querySelectorAll('img').filter(node => !node.srcAssignments);
  check('.187 switching class retains all four older in-flight slots and reuses loaded navigation without starting a new burst', pending187.size === 4 && oldInFlight187.every(node => pending187.has(node)) && oldInFlight187.some(node => !slowHost187.contains(node)) && attempts187.length === beforeClass187 && byClass(slowHost187, 'talents-class-button').every((button, index) => button.all(node => node.tagName === 'IMG')[0] === navImages187[index] && navImages187[index].srcAssignments === 1));
  byClass(slowHost187, 'talents-class-button').find(button => button.textContent === 'Druid').click();
  const cancelledQueue187 = [...new Set([...oldQueued187, ...paladinQueued187])].filter(node => !slowHost187.contains(node));
  check('.187 a second rapid class switch cancels stale queued nodes without dropping occupied old slots', pending187.size === 4 && attempts187.length === beforeClass187 && cancelledQueue187.length > 40 && cancelledQueue187.every(node => !node.srcAssignments) && slowChanges187.at(-1).className === 'druid');
  const detached187 = oldInFlight187.find(node => !slowHost187.contains(node));
  settleImage187(detached187, 'error');
  check('.187 one detached old-class terminal event releases exactly one slot to current artwork without a new-class warning', pending187.size === 4 && attempts187.length === beforeClass187 + 1 && attempts187.at(-1).node !== detached187 && slowHost187.contains(attempts187.at(-1).node) && oldInFlight187.filter(node => pending187.has(node)).length === 3 && byClass(slowHost187, 'talents-artwork-notice')[0].hidden && maximum187 === 4);
  for (const node of oldInFlight187) if (pending187.has(node)) settleImage187(node);
  check('.187 all remaining old requests settle before their slots are reused and discarded class queues never start', pending187.size === 4 && [...pending187.keys()].every(node => slowHost187.contains(node)) && cancelledQueue187.every(node => !node.srcAssignments) && maximum187 === 4);
  const currentFailure187 = [...pending187.keys()][0], failedUrl187 = currentFailure187.getAttribute('src'), failedAssignments187 = currentFailure187.srcAssignments;
  settleImage187(currentFailure187, 'error');
  let drained187 = 0;
  while (pending187.size) { if (++drained187 > 200) throw Error('Image queue did not drain within the finite artwork inventory'); settleImage187([...pending187.keys()][0]); }
  check('.187 a genuine current image failure is not automatically retried while the other queued artwork finishes', currentFailure187.hidden && currentFailure187.srcAssignments === failedAssignments187 && attempts187.filter(attempt => attempt.node === currentFailure187).length === 1 && byClass(slowHost187, 'talents-artwork-notice')[0].hidden === false && maximum187 === 4 && cancelledQueue187.every(node => !node.srcAssignments));
  const retry187 = byClass(slowHost187, 'talents-artwork-notice')[0].all(node => node.tagName === 'BUTTON')[0], beforeRetry187 = attempts187.length;
  retry187.click(); retry187.click();
  check('.187 repeated explicit Retry clicks deduplicate an in-flight attempt and preserve its exact same-origin URL', pending187.size === 1 && pending187.has(currentFailure187) && attempts187.length === beforeRetry187 + 1 && currentFailure187.srcAssignments === failedAssignments187 + 1 && currentFailure187.getAttribute('src') === failedUrl187 && !failedUrl187.includes('?') && maximum187 === 4);
  settleImage187(currentFailure187);
  const afterRetry187 = attempts187.length; currentFailure187.dispatch('error');
  check('.187 a late duplicate error after a successful terminal load cannot create a false warning or restart the queue', !currentFailure187.hidden && byClass(slowHost187, 'talents-artwork-notice')[0].hidden && pending187.size === 0 && attempts187.length === afterRetry187 && slowChanges187.at(-1).points === 0);
  slow187.destroy();
  const isolatedHostA187 = delayedDocument187.createElement('main'), isolatedHostB187 = delayedDocument187.createElement('main');
  const isolatedA187 = await browserModule.exports.mount(isolatedHostA187), isolatedB187 = await browserModule.exports.mount(isolatedHostB187);
  const belongsA187 = () => [...pending187.keys()].filter(node => isolatedHostA187.contains(node)), belongsB187 = () => [...pending187.keys()].filter(node => isolatedHostB187.contains(node));
  const initialB187 = belongsB187();
  check('.187 independent mounts each own four slots instead of borrowing or sharing mutable queue state', pending187.size === 8 && belongsA187().length === 4 && belongsB187().length === 4 && initialB187.every(node => node.srcAssignments === 1));
  settleImage187(belongsA187()[0]);
  check('.187 settling one mount advances only its own four-slot queue', belongsA187().length === 4 && belongsB187().length === 4 && initialB187.every(node => pending187.has(node) && node.srcAssignments === 1));
  const activeA187 = belongsA187(), queuedA187 = isolatedHostA187.querySelectorAll('img').filter(node => !node.srcAssignments), beforeDestroy187 = attempts187.length;
  isolatedA187.destroy(); for (const node of activeA187) { node.dispatch('load'); node.dispatch('error'); }
  check('.187 destroy cancels owned in-flight URLs and stale completions cannot start queued images or touch another mount', activeA187.every(node => !pending187.has(node) && node.getAttribute('src') === null) && queuedA187.every(node => !node.srcAssignments) && attempts187.length === beforeDestroy187 && pending187.size === 4 && initialB187.every(node => pending187.has(node) && node.srcAssignments === 1));
  isolatedB187.destroy(); for (const node of initialB187) node.dispatch('load');
  check('.187 final mount destruction leaves no pending image attempts and no replacement URL assignments', pending187.size === 0 && attempts187.length === beforeDestroy187 && initialB187.every(node => node.getAttribute('src') === null) && initialJSON === JSON.stringify(data));
  console.log('\n' + ok + '/' + n + ' passed');
  if (ok !== n) process.exitCode = 1;
}
detailRenderRegression().catch(error => { console.error(error); process.exitCode = 1; });
