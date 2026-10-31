// Exercise the real browser modules: arithmetic, form edits, reset, disclosures and print cleanup.
// No provider calls, bank writes, game action or live campaign is represented by this suite.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const staticRoot = path.resolve(__dirname, '../public/static');
let passed = 0, failed = 0;
function check(label, condition) { if (condition) { passed++; console.log('PASS ' + label); } else { failed++; console.error('FAIL ' + label); } }
const close = (actual, expected) => Number.isFinite(actual) && Math.abs(actual - expected) < 0.000001;
class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.attributes = {}; this.listeners = {}; this.style = {}; this.parentNode = null; this.hidden = false; this.open = false; this.value = ''; this._text = ''; }
  append(...nodes) { for (const value of nodes.flat(Infinity)) { if (value == null || value === false || value === '') continue; const node = typeof value === 'object' ? value : this.doc.createTextNode(value); node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const node of this.children) node.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  dispatch(name) { const event = { target: this, prevented: false, preventDefault() { this.prevented = true; } }; for (const listener of this.listeners[name] || []) listener(event); return event; }
  all(predicate) { return this.children.flatMap(node => [...(predicate(node) ? [node] : []), ...node.all(predicate)]); }
  scrollIntoView() { this.scrolled = true; }
}
function environment() {
  const document = new Element('#document'); document.doc = document;
  document.createElement = tag => new Element(tag, document);
  document.createTextNode = text => { const node = new Element('#text', document); node.textContent = text; return node; };
  document.getElementById = id => document.all(node => node.getAttribute('id') === id)[0] || null;
  document.head = document.createElement('head'); document.append(document.head);
  const h = (tag, attrs, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (['value', 'hidden', 'open', 'disabled'].includes(key)) node[key] = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(children); return node;
  };
  const events = new Map(), effects = [], cache = new Map();
  const forbidden = label => (...args) => { effects.push({ label, args }); throw new Error('Unexpected side effect: ' + label); };
  const sandbox = vm.createContext({ document, console, Intl, fetch: forbidden('fetch'), localStorage: { getItem: forbidden('localStorage'), setItem: forbidden('localStorage') }, sessionStorage: { getItem: forbidden('sessionStorage'), setItem: forbidden('sessionStorage') }, print() { effects.push({ label: 'print' }); }, addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }, removeEventListener(name, fn) { events.get(name)?.delete(fn); } });
  function load(name) {
    if (!['treasury-plan207.js', 'treasury-plan-model207.js', 'treasury-plan-content207.js'].includes(name)) throw Error('Unlisted browser dependency');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(staticRoot, name), 'utf8'), { compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    if ((compiled.diagnostics || []).some(row => row.category === ts.DiagnosticCategory.Error)) throw Error('Invalid module: ' + name);
    vm.runInContext('(function(exports, require, module) {\n' + compiled.outputText + '\n})', sandbox, { filename: name })(module.exports, specifier => load(specifier.replace(/^\/static\//, '')), module);
    return module.exports;
  }
  const main = h('main'); document.append(main);
  return { h, main, document, load, effects, events, event(name) { for (const fn of events.get(name) || []) fn(); } };
}
const env = environment(), model = env.load('treasury-plan-model207.js'), content = env.load('treasury-plan-content207.js').TREASURY_PLAN207;
const defaults = { ...model.TREASURY_DEFAULTS207 }, base = model.calculateTreasury207(defaults);
check('default model uses the actual 90-day ramp, not thirteen full weeks', close(model.treasuryRampWeeks207(90), 159 / 14) && close(model.treasuryRampWeeks207(21), 1.5) && model.treasuryRampWeeks207(0) === 0 && base.rampWeeks < 13);
check('baseline mature-week contribution independently sums to 95,000g', base.ok && base.donors === 600 && base.weeklyDonations === 45000 && base.weeklyGoods === 30000 && base.weeklyServices === 25000 && base.weeklyNet === 95000);
check('Day90 cash and spendable forecast independently match 159/14 mature weeks', close(base.projectedCash, 1078928.5714285714) && close(base.spendableCash, 1028928.5714285714) && close(base.goalGap, 28928.5714285714));
check('required gift is a sensitivity calculation with the reserve included', close(base.requiredWeeklyGift, 70.75471698113208) && close(base.requiredWeeklyNet, 92452.83018867925));
check('all five checkpoint forecasts match independent piecewise day counts', base.milestones.length === 5 && base.milestones.every((point, index) => close(point.cash, [23750, 71250, 264642.85714285716, 671785.7142857143, 1078928.5714285714][index])) && base.milestones[0].afterReserve === -26250);
const noDonors = model.calculateTreasury207({ ...defaults, activePlayers: 0 });
check('zero donors returns an explicit missing-gift solution without Infinity or NaN', noDonors.ok && noDonors.donors === 0 && noDonors.requiredWeeklyGift === null && Number.isFinite(noDonors.projectedCash));
const independent = model.calculateTreasury207({ ...defaults, donorPercent: 0, goodsSales: 1000000 });
check('a target funded without donors requires zero gift rather than division by zero', independent.ok && independent.goalMet && independent.requiredWeeklyGift === 0);
const loss = model.calculateTreasury207({ ...defaults, donorPercent: 0, goodsSales: 0, serviceSales: 0 });
check('negative cash and reserve shortfalls remain visible rather than clamped away', loss.ok && loss.weeklyNet === -5000 && close(loss.projectedCash, -56785.71428571428) && loss.negativeCash && loss.reserveUnfunded && loss.spendableCash < 0);
const alreadyFunded = model.calculateTreasury207({ ...defaults, openingGold: 2000000, activePlayers: 0, goodsSales: 0, serviceSales: 0, weeklyCosts: 0 });
check('scenario opening cash participates in the target equation without altering defaults', alreadyFunded.projectedCash === 2000000 && alreadyFunded.requiredWeeklyGift === 0 && defaults.openingGold === 0 && model.TREASURY_DEFAULTS207.openingGold === 0);
for (const [label, patch, key] of [
  ['blank', { weeklyGift: '' }, 'weeklyGift'], ['spaces', { openingGold: '   ' }, 'openingGold'], ['negative', { weeklyCosts: -1 }, 'weeklyCosts'],
  ['excess percentage', { donorPercent: 101 }, 'donorPercent'], ['negative margin', { goodsMarginPercent: -1 }, 'goodsMarginPercent'],
  ['nonfinite', { goodsSales: Infinity }, 'goodsSales'], ['NaN', { serviceSales: NaN }, 'serviceSales'], ['object', { reserveGold: {} }, 'reserveGold'],
  ['boolean', { weeklyGift: false }, 'weeklyGift'], ['fractional player', { activePlayers: 1.5 }, 'activePlayers'], ['unbounded amount', { weeklyGift: 1e15 }, 'weeklyGift'],
  ['exponent text', { goodsSales: '1e5' }, 'goodsSales']
]) { const actual = model.calculateTreasury207({ ...defaults, ...patch }); check(label + ' input fails closed with a field-specific error', !actual.ok && !!actual.errors[key] && !('projectedCash' in actual)); }
check('zero values and exact percentage endpoints are valid', model.calculateTreasury207(Object.fromEntries(Object.keys(defaults).map(key => [key, 0]))).ok && model.calculateTreasury207({ ...defaults, donorPercent: 100, goodsMarginPercent: 100 }).ok);
check('ordinary leading decimals equal their zero-prefixed amounts', ['.5', '.05', ' .125 '].every(value => { const a = model.calculateTreasury207({ ...defaults, weeklyGift: value }), b = model.calculateTreasury207({ ...defaults, weeklyGift: Number(value) }); return a.ok && b.ok && a.projectedCash === b.projectedCash; }));
check('leading decimals preserve whole-number fields and reject incomplete or nondecimal text', !model.calculateTreasury207({ ...defaults, activePlayers: '.5' }).ok && ['.', '1.', '.5e2', '0x10', '+.5', '-.5', '.Infinity'].every(value => !model.calculateTreasury207({ ...defaults, weeklyGift: value }).ok));
let badDays = 0;
for (const day of [-1, 91, Infinity, NaN]) { try { model.treasuryRampWeeks207(day); } catch (error) { if (error instanceof Error || error.name === 'RangeError') badDays++; } }
check('ramp refuses invalid day ranges', badDays === 4);
const dispose = env.load('treasury-plan207.js').renderTreasuryPlan207(env.main, { h: env.h, clear: node => node.replaceChildren(), parts: ['officers'] });
const all = predicate => env.main.all(predicate), byId = id => all(node => node.getAttribute('id') === id)[0];
const input = key => byId('tp207-' + key), button = text => all(node => node.tagName === 'BUTTON' && node.textContent === text)[0];
const result = key => all(node => node.getAttribute('data-result207') === key)[0];
const chapters = all(node => node.getAttribute('data-plan-chapter207') !== null);
check('renderer creates ten labelled assumption controls with linked help and errors', all(node => node.tagName === 'INPUT').length === 10 && model.TREASURY_FIELDS207.every(field => { const node = input(field.key), id = node.getAttribute('id'); return all(item => item.tagName === 'LABEL' && item.getAttribute('for') === id).length === 1 && node.getAttribute('aria-describedby').split(' ').every(byId); }));
check('baseline calculations appear in accessible dynamic results', result('weeklyNet').textContent.includes('95,000g') && result('projectedCash').textContent.includes('1,078,928.57g') && result('spendableCash').textContent.includes('1,028,928.57g') && result('requiredWeeklyGift').textContent.includes('70.75g') && all(node => node.getAttribute('role') === 'status' && node.getAttribute('aria-live') === 'polite').length === 1);
check('full officer plan renders all thirteen substantial chapters', chapters.length === 13 && new Set(chapters.map(node => node.getAttribute('data-plan-chapter207'))).size === 13 && chapters.every(chapter => chapter.textContent.length > 600) && env.main.textContent.length > 30000 && !/undefined|\[object Object\]/.test(env.main.textContent));
const proposals218 = chapters.find(node => node.getAttribute('data-plan-chapter207') === 'service-proposals218');
check('.218 rendered service reference excludes bought powers and suspends the whole civil filing',
 proposals218.textContent.includes('no loot priority, moderation advantage or governing authority')
 && proposals218.textContent.includes('no loot priority or exception to the currently published rotation')
 && proposals218.textContent.includes('While suspended, the whole historical reference, including its 25g civil filing, is shown as not active.'));

check('.218 service chapter renders seven inactive proposals with GDKP/wagering exclusions and no purchase controls', !!proposals218 && proposals218.all(node => node.tagName === 'TR').length === 8 && ['Imperial Guild Lottery', 'Bifrost', 'Attunement', 'Blood & Vengeance', 'Royal Trade Factor', 'Hall of Fame', 'Raid-Bench'].every(term => proposals218.textContent.includes(term)) && proposals218.textContent.includes('programme stays paused') && proposals218.textContent.includes('GDKP is prohibited and excluded') && proposals218.textContent.includes('Wagering and unapproved services contribute zero forecast revenue') && proposals218.textContent.includes('Ordinary appeals and safety processes remain free') && proposals218.all(node => ['INPUT', 'FORM', 'BUTTON'].includes(node.tagName)).length === 0);
check('.218 proposal chapter preserves distinct fee schedules and suspends both legacy10 and proposed15percent duel escrow',proposals218.textContent.includes('50–150g')&&proposals218.all(node=>/^H[1-6]$/.test(node.tagName)&&node.textContent==='Historical escrow tariff remains suspended').length===1&&proposals218.textContent.includes('neither rate is an available offer, collected stake or forecast revenue')&&proposals218.textContent.includes('10%')&&proposals218.textContent.includes('15%')&&proposals218.textContent.includes('subject to Blizzard policy')&&proposals218.textContent.includes('zero')&&chapters.indexOf(proposals218)<chapters.findIndex(node=>node.getAttribute('data-plan-chapter207')==='sources'));
check('.218 proposal publication leaves the original cash model and assumptions unchanged', close(base.weeklyNet, 95000) && close(base.spendableCash, 1028928.5714285714) && JSON.stringify(model.TREASURY_DEFAULTS207) === JSON.stringify(defaults) && result('spendableCash').textContent.includes('1,028,928.57g') && env.effects.length === 0);
check('officer deep link opens the matching chapter without issuing an action', chapters.find(node => node.getAttribute('data-plan-chapter207') === 'officers').open && chapters.find(node => node.getAttribute('data-plan-chapter207') === 'officers').scrolled && chapters.filter(node => node.open).length === 1);
check('programme publication does not invent a campaign start or live bank feed', env.main.textContent.includes('Start date not set') && env.main.textContent.includes('not a live bank feed') && env.main.textContent.includes('Royal Writs') && env.main.textContent.includes('paused or OFF') && env.main.textContent.includes('Fixed costs or a slower ramp'));
check('.208 complete officer chapter includes a dedicated Council trading role without merging custody or promising returns', env.main.textContent.includes('Head of Trading & Markets') && env.main.textContent.includes('auction-house trading, direct item trades') && env.main.textContent.includes('Do not administer donations, dues, appeals, discipline or Workshop commissions') && env.main.textContent.includes('custody, budgets, reconciliation and independent audit stay with their separate officers'));
check('.208 trading scorecard counts actual costs, cash conversion and risk without changing the million-gold assumptions', env.main.textContent.includes('Trading performance and capital risk') && env.main.textContent.includes('lost deposits') && env.main.textContent.includes('time to cash') && result('spendableCash').textContent.includes('1,028,928.57g') && env.effects.length===0);
input('weeklyGift').value = '0'; input('weeklyGift').dispatch('input');
check('real form input changes recompute the forecast rather than changing labels only', result('weeklyNet').textContent.includes('50,000g') && result('spendableCash').textContent.includes('517,857.14g') && result('goalGap').textContent.includes('482,142.86g'));
check('editing the scenario never changes the dated owner balance snapshot', all(node => node.getAttribute('data-owner-balance207') === '0').length === 1 && env.main.textContent.includes('Reported 28 October 2026') && content.snapshot.openingGold === 0);
input('weeklyGift').value = ''; input('weeklyGift').dispatch('input');
check('invalid empty edits suppress stale forecasts and expose the exact field error', !result('weeklyNet') && input('weeklyGift').getAttribute('aria-invalid') === 'true' && !byId('tp207-weeklyGift-error').hidden && byId('tp207-weeklyGift-error').textContent.includes('Average gift') && env.main.textContent.includes('Forecast unavailable'));
input('donorPercent').value = '101'; input('donorPercent').dispatch('input');
check('multiple invalid edits produce independent associated field errors', input('donorPercent').getAttribute('aria-invalid') === 'true' && !byId('tp207-donorPercent-error').hidden && !result('projectedCash'));
button('Reset planning assumptions').dispatch('click');
check('reset restores every assumption, clears invalid markers and recalculates', model.TREASURY_FIELDS207.every(field => input(field.key).value === String(defaults[field.key]) && input(field.key).getAttribute('aria-invalid') === 'false' && byId('tp207-' + field.key + '-error').hidden) && result('weeklyNet').textContent.includes('95,000g') && env.main.textContent.includes('Default planning assumptions restored'));
input('activePlayers').value = '0'; input('activePlayers').dispatch('input');
check('zero-donor UI explains the unavailable finite gift instead of showing Infinity', result('requiredWeeklyGift').textContent.includes('zero assumed donors') && !/NaN|Infinity/.test(env.main.textContent));
input('goodsSales').value = '0'; input('serviceSales').value = '0'; input('serviceSales').dispatch('input');
check('loss scenario exposes its deficit and negative checkpoint values', result('projectedCash').textContent.includes('-56,785.71g') && env.main.textContent.includes('Projected cash is negative') && result('spendableCash').textContent.includes('reserve shortfall'));
check('zero and negative forecast bars never generate negative or invalid CSS widths', all(node => node.getAttribute('class') === 'tp207-bar-fill').every(node => /^\d+(?:\.\d+)?%$/.test(node.style.width) && parseFloat(node.style.width) <= 100));
button('Expand every chapter').dispatch('click'); check('expand control makes all detailed plan chapters available', chapters.every(node => node.open));
button('Collapse chapters').dispatch('click'); check('collapse control preserves content and closes all chapters', chapters.every(node => !node.open) && chapters.length === 13);
button(content.chapters.find(row => row.id === 'roadmap').title).dispatch('click');
check('chapter navigation opens its content without resetting calculator assumptions', chapters.find(node => node.getAttribute('data-plan-chapter207') === 'roadmap').open && input('activePlayers').value === '0');
const originalOpen = chapters.map(node => node.open);
env.event('beforeprint'); check('print lifecycle expands every chapter, including previously collapsed content', chapters.every(node => node.open));
env.event('afterprint'); check('print lifecycle restores the exact prior disclosure state', chapters.every((node, index) => node.open === originalOpen[index]));
button('Print the complete plan').dispatch('click'); check('print control requests browser printing without transmitting data', env.effects.length === 1 && env.effects[0].label === 'print');
const proposalLinks218 = content.chapters.find(row => row.id === 'service-proposals218').sections.flatMap(section => section.links || []);
const expectedProposalCitations218 = [["Blizzard EULA", "https://www.blizzard.com/en-us/legal/08b946df-660a-40e4-a072-1fbde65173b1/blizzard-end-user-license-agreement"], ["Official Forever GDKP answer", "https://www.youtube.com/watch?v=Y5zzSMSVhRo&t=4548s"]];
check('.218 proposal citations are the two explicit labelled HTTPS sources, never an empty every()', proposalLinks218.length===2 && new Set(proposalLinks218.map(link=>link.url)).size===2 && proposalLinks218.every(link=>typeof link.label==='string'&&link.label.length>8&&typeof link.url==='string'&&/^https:\/\/[^\s/]+\/\S*$/.test(link.url)) && JSON.stringify(proposalLinks218.map(link=>[link.label,link.url]).sort((a,b)=>a[1]<b[1]?-1:a[1]>b[1]?1:0))===JSON.stringify(expectedProposalCitations218));
check('all original source references and separately declared proposal citations are clickable HTTPS links', content.sources.length > 0 && content.sources.every(source => all(node => node.tagName === 'A' && node.getAttribute('href') === source.url).length === 1 + proposalLinks218.filter(link => link.url === source.url).length) && proposalLinks218.every(link => proposals218.all(node => node.tagName === 'A' && node.getAttribute('href') === link.url).length === 1) && all(node => node.tagName === 'A').every(node => /^(#|https:\/\/)/.test(node.getAttribute('href'))));
check('submitting the model form is prevented rather than making an HTTP request', all(node => node.tagName === 'FORM')[0].dispatch('submit').prevented);
env.event('beforeprint'); dispose();
check('route disposal removes global print handlers and restores disclosures', [...env.events.values()].every(set => set.size === 0) && chapters.every((node, index) => node.open === originalOpen[index]));
const style = () => env.document.head.all(node => node.tagName === 'LINK' && node.getAttribute('id') === 'treasury-plan-style207');
const disposeAgain = env.load('treasury-plan207.js').renderTreasuryPlan207(env.main, { h: env.h, clear: node => node.replaceChildren(), parts: [], isCurrent: () => true });
check('the same-origin stylesheet is attached exactly once across route rerenders', style().length === 1 && style()[0].getAttribute('rel') === 'stylesheet' && style()[0].getAttribute('href') === '/static/treasury-plan207.css');
disposeAgain();
const rendered = env.main.textContent;
env.load('treasury-plan207.js').renderTreasuryPlan207(env.main, { h: env.h, clear: node => node.replaceChildren(), parts: [], isCurrent: () => false })();
check('an obsolete route cannot replace the current view or register global handlers', env.main.textContent === rendered && [...env.events.values()].every(set => set.size === 0) && style().length === 1);
check('rendering, edits, navigation and reset perform no network or storage operations', env.effects.filter(row => row.label !== 'print').length === 0);
const css = fs.readFileSync(path.join(staticRoot, 'treasury-plan207.css'), 'utf8');
check('responsive and print styles constrain fields, tables and cards without hiding the plan', css.includes('@media (max-width: 660px)') && css.includes('@media (max-width: 360px)') && css.includes('@media print') && css.includes('minmax(0, 1fr)') && css.includes('overflow-wrap: anywhere') && css.includes('content-visibility: visible'));
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
