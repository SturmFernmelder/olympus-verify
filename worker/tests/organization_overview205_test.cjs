// The real .205 overview modules and canonical .203 family directory, in a small DOM.
// This suite checks presentation and interaction only; no appointment or authority is issued.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.join(__dirname, '..'), staticRoot = path.join(root, 'public/static'), sourceRoot = path.join(root, 'src');
const model = JSON.parse(fs.readFileSync(path.join(staticRoot, 'governance/organization.json'), 'utf8'));
let passed = 0, failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log('PASS ' + label); }
  else { failed++; console.error('FAIL ' + label); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();

function sourceLoader() {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(sourceRoot, relative.endsWith('.ts') ? relative : relative + '.ts');
    if (!file.startsWith(sourceRoot + path.sep)) throw Error('source escape');
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    if ((result.diagnostics || []).some(row => row.category === ts.DiagnosticCategory.Error)) throw Error('source transpilation failed');
    new Function('exports', 'require', 'module', result.outputText)(module.exports, key => key.startsWith('.') ? load(path.relative(sourceRoot, path.resolve(path.dirname(file), key))) : require(key), module);
    return module.exports;
  }
  return load;
}
const loadSource = sourceLoader(), directory = loadSource('site-role-directory203').ROLE_DIRECTORY_203;
const catalogue = loadSource('governance-offices').OFFICE_APPOINTMENTS;
const guides = loadSource('site-role-guides201').roleGuides201(loadSource('site-data').POSITIONS);

class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null; this.attributes = {}; this.listeners = {}; this.style = {}; this.hidden = false; this.open = false; this.value = ''; this._text = ''; }
  append(...nodes) { for (const value of nodes.flat(Infinity).filter(value => value != null && value !== false)) { const node = typeof value === 'object' ? value : this.doc.createTextNode(value); node.remove(); node.parentNode = this; this.children.push(node); } }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; } }
  replaceChildren(...nodes) { for (const node of this.children) node.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get id() { return this.attributes.id || ''; } set id(value) { this.setAttribute('id', value); }
  get className() { return this.attributes.class || ''; } set className(value) { this.setAttribute('class', value); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  get classList() {
    const node = this, values = () => new Set(node.className.split(/\s+/).filter(Boolean));
    return { contains: value => values().has(value), add(...items) { node.className = [...new Set([...values(), ...items])].join(' '); }, remove(...items) { node.className = [...values()].filter(value => !items.includes(value)).join(' '); }, toggle(value, force) { const set = values(), on = force ?? !set.has(value); if (on) set.add(value); else set.delete(value); node.className = [...set].join(' '); return on; } };
  }
  all(predicate) { return this.children.flatMap(node => [...(predicate(node) ? [node] : []), ...node.all(predicate)]); }
  matches(selector) {
    const tag = /^[a-z]+/i.exec(selector)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    const id = /#([\w-]+)/.exec(selector)?.[1];
    if (id && this.id !== id) return false;
    if ([...selector.matchAll(/\.([\w-]+)/g)].some(match => !this.classList.contains(match[1]))) return false;
    return [...selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)].every(([, key, value]) => value === undefined ? this.getAttribute(key) !== null : this.getAttribute(key) === value);
  }
  querySelectorAll(selector) { return this.all(node => selector.split(',').some(part => node.matches(part.trim()))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  contains(target) { for (let node = target; node; node = node.parentNode) if (node === this) return true; return false; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type, init = {}) {
    const event = { type, target: this, defaultPrevented: false, stopped: false, ...init, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    for (let node = this; node; node = node.parentNode) { for (const listener of node.listeners[type] || []) listener(event); if (event.stopped) break; }
    return event;
  }
  click() { return this.dispatch('click'); }
  focus() { this.doc.activeElement = this; }
}
function open() {
  const document = new Element('#document'); document.doc = document;
  document.createElement = tag => new Element(tag, document);
  document.createTextNode = text => { const node = new Element('#text', document); node.textContent = text; return node; };
  document.getElementById = id => document.all(node => node.id === id)[0] || null;
  const h = (tag, attrs, ...children) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'text') element.textContent = value;
      else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else if (['value', 'hidden', 'open', 'disabled', 'checked'].includes(key)) element[key] = value;
      else element.setAttribute(key, value);
    }
    element.append(...children); return element;
  };
  const guideCalls = [], guideOptions = [], selected = [], requests = [], cache = new Map();
  const sandbox = vm.createContext({ document, console, fetch: (...args) => { requests.push(args); throw Error('overview network request'); } });
  function load(name) {
    const file = path.resolve(staticRoot, name);
    if (!['organization-overview205.js', 'organization-context205.js'].includes(path.relative(staticRoot, file))) throw Error('unlisted overview dependency');
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    if ((result.diagnostics || []).some(row => row.category === ts.DiagnosticCategory.Error)) throw Error('overview transpilation failed');
    const wrapper = vm.runInContext('(function(exports, require, module) {\n' + result.outputText + '\n})', sandbox, { filename: path.basename(file) });
    wrapper(module.exports, key => load(key.startsWith('/static/') ? key.slice('/static/'.length) : path.relative(staticRoot, path.resolve(path.dirname(file), key))), module);
    return module.exports;
  }
  const overview = load('organization-overview205.js');
  const section = overview.renderAllianceOverview205(model, { h, add: (parent, nodes) => parent.append(nodes), clear: element => element.replaceChildren(), posIcon: () => h('img'), roleDirectory203: directory, roleGuides201: guides, officeFor219: key => catalogue.find(row => row.key === key), roleGuide201: (key, options = {}) => {
    guideCalls.push(key);
    guideOptions.push({key,...options});
    const guide = guides[key];
    if (!guide) throw Error('missing real role guide ' + key);
    return h('div', { 'data-real-guide-fixture': key }, h('p', { text: guide.definition }), h('ul', null, guide.responsibilities.map(text => h('li', { text }))), h('ul', null, guide.expectations.map(text => h('li', { text }))), h('p', { text: guide.commitment }), h('p', { text: guide.boundaries }));
  } }, id => selected.push(id));
  document.append(section);
  const families = () => section.all(node => node.getAttribute('data-alliance-family') !== null);
  const visible = () => families().filter(node => !node.hidden).map(node => node.getAttribute('data-alliance-family'));
  const input = (id, value, type) => { const field = document.getElementById(id); if (!field) throw Error('missing field ' + id); field.value = value; field.dispatch(type); };
  return { ...overview, section, document, guideCalls, guideOptions, selected, requests, families, visible, input, context: load('organization-context205.js') };
}

const originalModel = JSON.stringify(model), originalDirectory = JSON.stringify(directory), page = open();
const overview = page.buildAllianceOverview205(model, directory), groups = overview.groups, entries = groups.flatMap(group => group.families);
const expectedKeys = sorted([...catalogue.map(row => row.key), 'member', 'raider', 'pvp_team']);
check('real canonical fixture contains exactly72 role families and142 registered keys', directory.families.length === 72 && directory.sourceKeyCount === 142 && expectedKeys.length === 142);
// CL2-034 (our 4c7b542, 9f866bd; directive line 45): the family cards use the directory's six catalogue groups, in the
// directive's order and with its names; RC-034 (our 4cd335b) keeps the seven portfolio lanes as context lists beside them.
// Institution cards are told apart by ".218 institutions are not presented as additional individual Council appointments".
check('six overview groups follow the directive catalogue order and names beside seven portfolio lane contexts', same(groups.map(group => group.key), ['council', 'officers', 'raid', 'workshop', 'members', 'royal']) && same(groups.map(group => group.title), ['Sovereign & High Council', 'Officer Corps & Branch Command', 'Raid, PvP & Class Leadership', 'Guild Workshop & Master Artisans', 'Sworn Members, Raiders, Veterans, Alts & Initiates', 'Royal Patrons & Ceremonial Writs']) && same(Object.keys(overview.contexts.lanes), ['war', 'treasury', 'trading', 'artisanry', 'heraldry', 'propaganda', 'systems']));
check('all72 canonical families occur exactly once without a new presentation identity', entries.length === 72 && new Set(entries.map(row => row.family.key)).size === 72 && same(sorted(entries.map(row => row.family.key)), sorted(directory.families.map(row => row.key))));
check('every family keeps its complete original primary, variants and source keys', entries.every(row => same(row.family, directory.families.find(family => family.key === row.family.key))) && same(sorted(entries.flatMap(row => row.family.sourceKeys)), expectedKeys) && overview.sourceKeyCount === 142);
const expectedRelationships = model.nodes.filter(node => node.parent && node.relation !== 'classification').map(node => ({ from: node.id, to: node.parent, kind: node.relation }));
check('relationship context preserves every original reporting and independent-review edge', same(overview.relationships, expectedRelationships) && overview.relationships.some(edge => edge.from === 'auditor' && edge.kind === 'independence') && overview.relationships.some(edge => edge.from === 'justice' && edge.kind === 'independence'));
check('seven departmental lanes retain their current portfolio context and explicit boundaries', same(page.context.ORGANIZATION_LANES205.map(lane => lane.key), ['war', 'treasury', 'trading', 'artisanry', 'heraldry', 'propaganda', 'systems']) && page.context.ORGANIZATION_LANES205.every(lane => model.nodes.some(node => node.id === lane.rootId) && lane.duties.length === 3 && lane.boundary.length > 50) && page.section.all(node => node.getAttribute('data-lane') !== null).length === 7);
const protocolLane = page.context.ORGANIZATION_LANES205.find(lane => lane.key === 'heraldry');
const communicationsLane = page.context.ORGANIZATION_LANES205.find(lane => lane.key === 'propaganda');
check('the Herald leads official communications and the Seneschal retains court protocol',
  protocolLane.title === 'Court Protocol & Crown Estates' && protocolLane.summary.includes('court calendar')
  && communicationsLane.summary.includes('Official communications') && communicationsLane.duties.join(' ').includes('Heraldry Emissaries'));
const rankNames = ['Leader', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
check('the overview preserves the exact ten native ranks and zero-based slots', overview.ranks.length === 10 && overview.ranks.every((rank, slot) => rank.nativeSlot === slot && rank.nativeRankOrdinal === slot + 1 && (rank.label || rank.name) === rankNames[slot]));
// CL2-197 (our 4c7b542): the overview's second ladder is gone; the page's one ladder keeps its ten rows (organization_view_test
// ".218 exact ten ranks and all103 current office records are visible"). The overview's rank filter is its one rank list.
check('rendered overview has no second rank ladder and its rank filter has slots0–9 once with no eleventh native rank', !page.section.all(node => node.getAttribute('data-alliance-rank') !== null).length && same(page.document.getElementById('org-alliance-rank205').children.map(node => node.value), ['', ...rankNames.map((_, slot) => String(slot))]) && !page.section.all(node => node.getAttribute('data-native-rank') !== null).length);
// CL2-197, CL2-310 (our 4c7b542; directive line 52): no ladder row any more; the badge reads "Rank 1 Leader (Guild Master) · Slot 0".
check('CC-118 the Alliance rank filter and rank-one role badge share the display name and retain their original slot',
  page.document.getElementById('org-alliance-rank205').children[1].textContent === 'Rank 1 · Leader (Guild Master)'
  && page.families().find(node => node.getAttribute('data-alliance-family') === 'leader').textContent.includes('Rank 1 Leader (Guild Master) · Slot 0')
  && overview.ranks[0].label === 'Leader');
check('rendered overview contains every canonical family once before filtering', page.families().length === 72 && page.visible().length === 72 && new Set(page.visible()).size === 72 && page.section.classList.contains('org-alliance'));

const sourceRows = new Map([...model.appointments, ...(model.roleRank199.offices || [])].map(row => [row.key, row]));
check('rank filters use only each family original recommended or native slots', entries.every(row => {
  const expected = [...new Set(row.family.sourceKeys.flatMap(key => {
    const source = sourceRows.get(key); return source ? source.recommendedNativeSlots || [source.nativeSlot] : [];
  }).filter(Number.isInteger))].sort((a, b) => a - b);
  return same([...row.slots].sort((a, b) => a - b), expected);
}));
// CL2-034 (our 4c7b542) and RC-034 (our 4cd335b): the independent-review and Treasury lane views are context lists beside
// the six groups, not groups of their own.
check('independent audit families stay outside Treasury delivery and bank custody', overview.contexts.independent.some(family => family.key === 'bank_auditor' && family.sourceKeys.includes('office_08')) && !overview.contexts.lanes.treasury.some(family => family.sourceKeys.includes('office_08')) && directory.keyToFamily.office_08 !== directory.keyToFamily.office_09 && directory.keyToFamily.office_08 !== directory.keyToFamily.office_86);

const councilFamilies = groups.find(group => group.key === 'council').families;
// CL2-034 (our 4c7b542; directive line 45): "Sovereign & High Council" holds the Leader, the thirteen High Council role
// families and the Council's own institutions (the High Council-tier institutions); the institutions stay institutions.
const councilRoles218 = councilFamilies.filter(row => row.family.kind === 'role' && row.family.tier === 'high_council');
check('.218 thirteen current High Council role families stay together without counting collective bodies as seats', councilRoles218.length === 13 && same(sorted(councilRoles218.map(row=>row.family.key)), sorted(directory.families.filter(f=>f.tier==='high_council'&&f.kind==='role').map(f=>f.key))) && same(sorted(councilFamilies.filter(row => !councilRoles218.includes(row)).map(row => row.family.key + ':' + row.family.kind)), sorted(['leader:role', ...directory.families.filter(f => f.tier === 'high_council' && f.kind === 'institution').map(f => f.key + ':institution')])) && groups.filter(g=>g.key!=='council').every(g=>g.families.every(row=>row.family.tier!=='high_council'||row.family.kind!=='role')));
// CL2-034 (our 4c7b542): the institutions sit in their directory groups (no separate institutions group); each appears once
// and none is an individual Council seat.
const institutionFamilies218=entries.filter(row=>row.family.kind==='institution');
check('.218 all six collective institutions remain fully represented once outside individual Council seats',institutionFamilies218.length===6&&same(sorted(institutionFamilies218.map(row=>row.family.key)),sorted(directory.families.filter(f=>f.kind==='institution').map(f=>f.key)))&&overview.councilSeats.every(seat=>!institutionFamilies218.some(row=>row.family.key===seat.familyKey)));
const seatIds206 = ["gm-chair", "co-gm", "treasurer", "head-justice", "main-raid-lead", "main-pvp-lead", "internal-security", "intake", "concordat", "artisanry", "propaganda", "heraldry", "head-trading", "systems-heraldry"];
check('.218 all fourteen chair and portfolio references resolve to the declared current catalogue', same(overview.councilSeats.map(row=>row.id),seatIds206) && page.section.all(n=>n.getAttribute('data-council-seat206')!==null).length===14 && entries.length===72 && expectedKeys.length===142);
const mainWar206=overview.councilSeats.filter(row=>['main_raid','main_pvp'].includes(row.familyKey));
check('.218 MAIN War portfolios stay distinct from the retained shared template', same(mainWar206.map(row=>row.nodeId),['war-raiding','war-pvp']) && same(mainWar206.map(row=>row.officeKeys[0]),['office_97','office_98']) && mainWar206.every(row=>row.sharedAppointmentTemplate!==true) && ['raid_leader','pvp_leadership'].every(key=>entries.find(row=>row.family.key===key).family.tier==='officer_corps' && same(entries.find(row=>row.family.key===key).slots,[4])));
check('.206 department and independent references link to complete current Council guides', [['treasurer','treasurer'],['main-raid-lead','main_raid'],['head-justice','head_justice'],['propaganda','propaganda']].every(([id,key])=>page.section.all(n=>n.getAttribute('data-council-reference206')===id && n.getAttribute('href')==='#/roles/'+key).length>=2) && page.section.textContent.includes('The Lord High Justiciar holds the individual High Council portfolio'));
check('the Council overview uses the same seat-derived sentence as the chart',
  page.section.all(n => n.classList.contains('org-alliance-current-council'))[0]?.textContent.includes(model.councilComposition.summary));

const marketSeat208 = overview.councilSeats.find(row => row.id === 'head-trading');
check('the trading Council seat links one reserved office to its own market node', marketSeat208?.familyKey === 'head_trading' && marketSeat208.nodeId === 'trading' && same(marketSeat208.officeKeys, ['office_96']) && entries.find(row => row.family.key === 'head_trading')?.slots.join() === '1' && page.section.all(node => node.getAttribute('data-council-reference206') === 'head-trading' && node.getAttribute('href') === '#/roles/head_trading').length === 2);
check('market lane states sole trading and custody boundaries without absorbing a core historic ministry', page.context.ORGANIZATION_LANES205.find(row => row.key === 'trading').boundary.includes('This portfolio does trading only') && page.context.ORGANIZATION_HISTORY205.find(row => row.key === 'core-portfolios').text.includes('War, Treasury, Artisanry and Heraldry') && model.nodes.find(node => node.id === 'trading').coordinates.includes('treasury'));
const reserved = directory.families.filter(family => ['leader', 'high_council', 'officer_corps'].includes(family.tier));
check('every reserved Leader Council and Officer family has its actual tier badge', reserved.every(family => page.families().find(node => node.getAttribute('data-alliance-family') === family.key).all(node => node.getAttribute('data-tier') === family.tier).length > 0));
// CL2-036 (our 4c7b542): one eligibility vocabulary; a reserved seat reads "Reserved leadership seat".
check('reserved individual offices cannot become vacancies when no holder is supplied', reserved.filter(family => family.kind === 'role').every(family => /Reserved leadership seat/.test(page.families().find(node => node.getAttribute('data-alliance-family') === family.key).textContent)) && !page.section.textContent.includes('Open seat'));
check('.218 institutions are not presented as additional individual Council appointments', directory.families.filter(family => family.kind === 'institution').every(family => {
  const card = page.families().find(node => node.getAttribute('data-alliance-family') === family.key);
  return card.textContent.includes('Governance institution') && !card.textContent.includes('Reserved appointment') && !card.textContent.includes('Rank 2 High Council');
}) && page.families().find(node => node.getAttribute('data-alliance-family') === 'justice').textContent.includes('Council of Justice — institution'));
check('overview exposes no application or appointment action and no request', page.section.all(node => node.tagName === 'A').every(node => !/^#\/vote(?:\/|$)/.test(node.getAttribute('href') || '')) && !page.section.all(node => node.getAttribute('data-apply-role201') !== null || node.getAttribute('data-office-application') !== null).length && page.requests.length === 0);
const auditorCard = page.families().find(node => node.getAttribute('data-alliance-family') === 'bank_auditor');
auditorCard.all(node => node.tagName === 'BUTTON' && node.textContent === 'Trace responsibilities')[0].click();
check('responsibility action selects the original independent auditor node only', same(page.selected, ['auditor']) && page.requests.length === 0 && page.guideCalls.length === 0);

page.input('org-alliance-rank205', '1', 'change');
check('High Council rank filter shows exactly families whose original slots contain1', same(sorted(page.visible()), sorted(entries.filter(row => row.slots.includes(1)).map(row => row.family.key))));
const searchable = entries.find(row => row.slots.includes(1) && row.family.key === 'treasurer') || entries.find(row => row.slots.includes(1));
page.input('org-alliance-rank205', '', 'change');
page.input('org-alliance-search205', searchable.family.label, 'input');
const searchOnly = page.visible();
page.input('org-alliance-rank205', '1', 'change');
check('search and rank filters intersect rather than replace one another', same(sorted(page.visible()), sorted(entries.filter(row => row.slots.includes(1) && searchOnly.includes(row.family.key)).map(row => row.family.key))) && page.visible().includes(searchable.family.key));
page.input('org-alliance-search205', 'zzzz-no-such-role-205', 'input');
check('unmatched search hides all family rows and reports the empty state', page.visible().length === 0 && page.section.all(node => node.classList.contains('org-alliance-status')).some(node => /0|no matching|none/i.test(node.textContent)));
check('.206 unmatched search hides every current remit and contextual reference', page.section.all(n=>n.getAttribute('data-council-reference206')!==null).every(n=>n.parentNode.hidden));
const reset = page.section.all(node => node.tagName === 'BUTTON' && node.textContent === 'Reset overview filters')[0];
if (!reset) throw Error('missing overview reset');
reset.click();
check('reset clears search and rank and restores all72 current rows', page.document.getElementById('org-alliance-search205').value === '' && page.document.getElementById('org-alliance-rank205').value === '' && page.visible().length === 72 && page.families().length === 72);
page.input('org-alliance-search205', 'Eastern time', 'input');
check('search reaches the retained full NA regional guide without expanding its family', page.visible().includes(directory.keyToFamily.raid_leader_na) && page.guideCalls.length === 0);
reset.click();
page.input('org-alliance-search205', 'Raid Lead NA', 'input');
check('the advertised abbreviated regional search finds Raid Leader despite punctuation', page.visible().includes(directory.keyToFamily.raid_leader_na));
page.input('org-alliance-rank205', '4', 'change');
check('regional search still intersects the Raid Leader native rank', page.visible().includes(directory.keyToFamily.raid_leader_na) && !page.visible().includes('treasurer'));
page.input('org-alliance-search205', 'Raid Lead XY', 'input');
check('an absent short regional token does not match arbitrary word fragments', page.visible().length === 0);
reset.click();

const branchField = page.document.getElementById('org-alliance-guild205');
check('branch selector retains precisely the ten unappointed Olympus I–X directory scopes', branchField.children.filter(node => node.tagName === 'OPTION' && node.value !== '').map(node => node.value).join('|') === model.guildPlaceholders.map(branch => branch.name).join('|') && model.guildPlaceholders.every(branch => branch.state === 'Unappointed placeholder'));
for (const branch of [model.guildPlaceholders[0], model.guildPlaceholders[9]]) {
  page.input('org-alliance-guild205', branch.name, 'change');
  const displayName = branch.name === 'Olympus I' ? 'OLYMPUS PRIME' : branch.name;
  check(branch.name + ' changes affiliation context without inventing holders or duplicating jobs', page.section.all(node => node.classList.contains('org-alliance-branches')).some(node => node.textContent.includes(displayName) && /placeholder|unappointed/i.test(node.textContent)) && page.visible().length === 72 && page.families().length === 72);
}
reset.click();
check('reset returns branch context to the all-branch view', branchField.value === '' && page.visible().length === 72);

page.input('org-alliance-search205', 'failed auction deposits', 'input');
check('market search reaches the detailed fee and failure assumptions without becoming a Treasury role', page.visible().includes('head_trading') && page.guideCalls.length === 0);
reset.click();
check('complete detailed guides are absent before opening a family', page.guideCalls.length === 0);
const raidFamily = directory.keyToFamily.raid_leader_na, raid = page.families().find(node => node.getAttribute('data-alliance-family') === raidFamily);
const linkTo = (card, key) => card.all(node => node.tagName === 'A' && node.getAttribute('href') === '#/roles/' + encodeURIComponent(key));
check('a collapsed family does not build its scoped reference links eagerly', linkTo(raid, 'raid_leader_na').length === 0 && linkTo(raid, 'raid_leader_eu').length === 0);
raid.open = true; raid.dispatch('toggle');
check('opening Raid Leader retains its lead definition and complete canonical link without constructing another guide', page.guideCalls.length === 0
  && raid.textContent.includes(guides.office_74.definition) && linkTo(raid, raidFamily)[0]?.textContent === 'Open this complete role family'
  && !raid.textContent.includes(guides.office_74.expectations[0]));
check('NA and EU link directly to their exact regional specifications and no native association stub appears',
  ['raid_leader_na','raid_leader_eu'].every(key => linkTo(raid,key).length===1 && linkTo(raid,key)[0].textContent===directory.families.find(f=>f.key===raidFamily).variants.find(v=>v.key===key).label)
  && !linkTo(raid,'rank_raid_leader').length && !raid.all(node => node.getAttribute('data-alliance-guide-group218') === 'associations').length
  // CL2-310 (our 4c7b542; directive line 52): the badge reads "Rank 5 Raid Leader · Slot 4".
  && raid.textContent.includes('Rank 5 Raid Leader · Slot 4') && directory.keyToFamily.rank_raid_leader === raidFamily);
const marketCard208 = page.families().find(node => node.getAttribute('data-alliance-family') === 'head_trading');
marketCard208.open = true; marketCard208.dispatch('toggle');
check('opening Trading preserves the original definition and canonical destination without an application action', page.guideCalls.length === 0
  && marketCard208.textContent.includes(guides.office_96.definition) && linkTo(marketCard208,'head_trading').length===1
  && !marketCard208.all(node => node.getAttribute('data-office-application') !== null).length);
const priorLinks = linkTo(raid,'raid_leader_na'); raid.open = false; raid.dispatch('toggle'); raid.open = true; raid.dispatch('toggle');
check('reopening family details keeps the same scoped links without duplicate work', page.guideCalls.length===0 && priorLinks.length===1 && linkTo(raid,'raid_leader_na').length===1 && linkTo(raid,'raid_leader_na')[0]===priorLinks[0]);
const custody218 = page.families().find(node => node.getAttribute('data-alliance-family') === 'bank_custody');
custody218.open = true; custody218.dispatch('toggle');
check('.218 custody sub-offices keep separately labelled canonical destinations', ['office_10','office_72'].every(key => linkTo(custody218,key).length===1)
  && custody218.all(node => node.getAttribute('data-alliance-guide-group218') === 'offices').length === 1);
check('all interactions preserve canonical inputs and issue no network request', JSON.stringify(model) === originalModel && JSON.stringify(directory) === originalDirectory && page.requests.length === 0);
function refuses(change) {
  const changedModel = JSON.parse(originalModel), changedDirectory = JSON.parse(originalDirectory);
  change(changedModel, changedDirectory);
  try { page.buildAllianceOverview205(changedModel, changedDirectory); return false; } catch { return true; }
}
check('incomplete or duplicate original-key coverage is refused', refuses((_data, roles) => roles.families.pop()) && refuses((_data, roles) => roles.families[0].sourceKeys.push(roles.families[1].primaryKey)));
check('.206 missing, duplicate or unrelated current Council remits fail closed', refuses(data=>{delete data.councilComposition.currentSeats;}) && refuses(data=>{data.councilComposition.currentSeats[1].id='gm-chair';}) && refuses(data=>{data.councilComposition.currentSeats[2].officeKeys=['office_08'];}));
check('an altered native slot order is refused', refuses((_data, roles) => { roles.ranks[1].nativeSlot = 2; }));
check('cyclic reporting context is refused instead of inventing a hierarchy', refuses(data => { data.nodes.find(node => node.id === 'founder').parent = 'council'; }));

// The actual SPA route with only module transport/render completion controlled.
async function routeLoading214() {
  const appSource = fs.readFileSync(path.join(staticRoot, 'app.js'), 'utf8');
  const start = appSource.indexOf('  ROUTES.organization = async (main, parts) => {');
  const end = appSource.indexOf('\n  // ---------------------------------------------------------------- home', start);
  if (start < 0 || end < start) throw Error('One actual organization route required');
  const controller = appSource.slice(start, end).replace(/\bimport\(/g, 'loadModule(');
  const rolePolicySource214=['  const reservedNotice201 = ','  const standingIntro218 = '].map(prefix=>{const lines=appSource.split(/\r?\n/).filter(line=>line.startsWith(prefix));if(lines.length!==1)throw Error('actual_organization_role_policy_boundary');return lines[0];}).join('\n');
  const next = () => new Promise(resolve => setImmediate(resolve));
  function fixture({ holdModel = false } = {}) {
    // Our 4c7b542 (CL2-043, CL2-036, CL2-063, CL2-035): the route widens main, shows a sized placeholder, waits for the page
    // stylesheet and forwards three more names. Inert stand-ins only let it run: a style object, an already-loaded sheet.
    const main = { dataset: { viewRequest: 'original' }, nodes: [], style: {} }, user = {}, settings = {}, context = {};
    const requested = [], pending = new Map(), rendered = [];
    let attached = true, route = '#/organization', resolveModel;
    const data = { terms: [] }, modelReady = holdModel ? new Promise(resolve => { resolveModel = () => resolve(data); }) : Promise.resolve(data);
    const sandbox = { ROUTES: {}, S: { user, settings }, COM: () => context,
      document: { getElementById: () => ({ sheet: {} }) }, familyEligibility1112: () => {}, jumpList1112: () => {}, governanceTitleRoutes228: {},
      app: { contains: node => attached && node === main }, currentRoute: () => route,
      governanceModel: () => modelReady, h: (_tag, props) => ({ ...props, style: {} }), add: (parent, node) => parent.nodes.push(node), clear: () => {},
      office199: () => null, offices199: () => [], M: () => ({}), posIcon: () => {}, scrollToSection: () => {},
      applicationRoleDirectory201: () => {}, writsPanel199: () => ({ writs: true }), disposeOrganization: null,
      loadModule(name) { requested.push(name); return new Promise((resolve, reject) => pending.set(name, { resolve, reject })); } };
    vm.runInNewContext(rolePolicySource214+'\n'+controller, sandbox, { filename: 'actual-organization-route214.js' });
    return { main, sandbox, requested, pending, rendered, run: () => sandbox.ROUTES.organization(main, []),
      stale: () => { main.dataset.viewRequest = 'replacement'; route = '#/roles'; attached = false; }, resolveModel,
      resolve(name) { pending.get(name).resolve(name.endsWith('/organization-view.js') ? { renderOrganization: (...args) => { rendered.push(args); return 'original-disposer'; } } : { renderAllianceOverview205: 'actual-overview-export' }); } };
  }
  const first = '/static/organization-view.js', second = '/static/organization-overview205.js';
  const live = fixture(), completed = live.run(); await next();
  check('.214 both actual renderer imports start before either result is released', same(live.requested, [first, second]) && live.rendered.length === 0);
  live.resolve(first); await next();
  check('.214 a single completed renderer cannot render an incomplete organization', live.rendered.length === 0);
  live.resolve(second); await completed;
  check('.214 the current route renders once with both exports and retains its disposer', live.rendered.length === 1 && live.rendered[0][2].allianceOverview205 === 'actual-overview-export' && live.sandbox.disposeOrganization === 'original-disposer');
  check('CC056 the Organization bridge forwards the source catalogue without injecting a full role renderer or duplicate family directory',
    Object.hasOwn(live.rendered[0][2],'roleDirectory203') && !Object.hasOwn(live.rendered[0][2],'roleGuide201') && !Object.hasOwn(live.rendered[0][2],'roleFamilyDirectory203'));
  check('.218 actual route forwards the source-captured reserved and standing declarations',live.rendered[0][2].reservedNotice201==="Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed."&&live.rendered[0][2].standingIntro218==="These labels record a member’s current guild standing; they are not open positions. Ask the responsible officer to review a change in status.");
  const departed = fixture(), late = departed.run(); await next(); departed.stale(); departed.resolve(first); departed.resolve(second); await late;
  check('.214 completed imports from a departed view cannot render or replace its disposer', departed.rendered.length === 0 && departed.sandbox.disposeOrganization === null);
  const early = fixture({ holdModel: true }), earlyDone = early.run(); early.stale(); early.resolveModel(); await earlyDone;
  check('.214 a view invalidated during model loading starts no renderer requests', early.requested.length === 0 && early.rendered.length === 0);
  const failed = fixture(), refused = failed.run().then(() => false, () => true); await next(); failed.pending.get(second).reject(Error('synthetic module refusal')); failed.resolve(first);
  check('.214 one module failure cannot render a partial view or cause a retry', await refused && failed.rendered.length === 0 && same(failed.requested, [first, second]));
}
routeLoading214().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });
