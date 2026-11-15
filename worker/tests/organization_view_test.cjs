// The actual organization module and model, with a small DOM for its pointer/dialog controls.
// No identity, appointment, provider or permission operation is exercised or authorized here.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "public/static/organization-view.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/static/organization-view.css"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(root, "public/static/governance/organization.json"), "utf8"));
const ts203 = require('typescript'), cache203 = new Map(), src203 = path.join(root,'src');
function load203(name) {
  const file=path.resolve(src203,name.endsWith('.ts')?name:name+'.ts');
  if(!file.startsWith(src203+path.sep))throw Error('source escape');
  if(cache203.has(file))return cache203.get(file).exports;
  const mod={exports:{}};cache203.set(file,mod);
  const js=ts203.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts203.ModuleKind.CommonJS,target:ts203.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require','module',js)(mod.exports,key=>key.startsWith('.')?load203(path.relative(src203,path.resolve(path.dirname(file),key))):require(key),mod);
  return mod.exports;
}
const directory203=load203('site-role-directory203').ROLE_DIRECTORY_203;
let passed = 0, failed = 0;
function check(label, ok) { if (ok) { passed++; console.log("PASS " + label); } else { failed++; console.error("FAIL " + label); } }
class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null; this.attributes = {}; this.style = {}; this.listeners = {}; this.hidden = false; this.open = false; this.value = ""; this._text = ""; this.captures = new Set(); }
  // Our 4c7b542 (CL2-037/CL2-041) appends a plain string (" — note") beside a link, as ParentNode.append allows;
  // the stand-in makes it a text node, as a browser does.
  append(...nodes) { for (let n of nodes.flat(Infinity).filter(n => n != null)) { if (typeof n === "string") { const text = new Element("#text", this.doc); text._text = n; n = text; } n.remove(); n.parentNode = this; this.children.push(n); } }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; } }
  replaceChildren(...nodes) { for (const n of this.children) n.parentNode = null; this.children = []; this._text = ""; this.append(...nodes); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get id() { return this.attributes.id || ""; } set id(v) { this.setAttribute("id", v); }
  get className() { return this.attributes.class || ""; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  get classList() {
    const el = this, values = () => new Set(el.className.split(/\s+/).filter(Boolean));
    return { contains: v => values().has(v), add(...vs) { const set = values(); for (const v of vs) set.add(v); el.setAttribute("class", [...set].join(" ")); }, remove(...vs) { el.setAttribute("class", [...values()].filter(v => !vs.includes(v)).join(" ")); }, toggle(v, force) { const set = values(), on = force ?? !set.has(v); if (on) set.add(v); else set.delete(v); el.setAttribute("class", [...set].join(" ")); return on; } };
  }
  closest(selector) { for (let n = this; n; n = n.parentNode) if (selector === "button" && n.tagName === "BUTTON") return n; return null; }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  get isConnected() { return this.doc === this || this.doc.contains(this); }
  all(pred) { return this.children.flatMap(n => [...(pred(n) ? [n] : []), ...n.all(pred)]); }
  addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({ fn, capture: options === true || !!options?.capture, once: !!options?.once }); }
  dispatch(type, init = {}) {
    const event = { type, target: this, detail: 1, defaultPrevented: false, stopped: false, ...init, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    const chain = []; for (let n = this; n; n = n.parentNode) chain.push(n);
    const fire = (n, capture) => { for (const item of [...(n.listeners[type] || [])]) if (item.capture === capture) { item.fn(event); if (item.once) n.listeners[type] = n.listeners[type].filter(x => x !== item); } };
    for (const n of chain.slice().reverse()) { fire(n, true); if (event.stopped) return event; }
    for (const n of chain) { fire(n, false); if (event.stopped) break; }
    return event;
  }
  click(detail = 1) { return this.dispatch("click", { detail }); }
  focus() { this.doc.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatch("lostpointercapture", { pointerId: id }); }
  get clientWidth() { return this.inDialog() ? this.doc.dialogWidth : this.doc.viewportWidth; }
  get clientHeight() { return this.inDialog() ? 780 : 600; }
  inDialog() { for (let n = this; n; n = n.parentNode) if (n.tagName === "DIALOG" && n.open) return true; return false; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  showModal() { if (this.failModal) throw new Error("modal refused"); this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
}
function open({ mobile = false, width = 800, officeAvailability = undefined, parts = [], overview205 = false, model = data } = {}) {
  const doc = new Element("#document"); doc.doc = doc; doc.head = new Element("head", doc); doc.body = new Element("body", doc); doc.append(doc.head, doc.body);
  doc.viewportWidth = width; doc.dialogWidth = mobile ? width : 1100;
  doc.createElement = t => new Element(t, doc); doc.createElementNS = (_ns, t) => new Element(t, doc);
  doc.getElementById = id => doc.all(n => n.id === id)[0] || null;
  const h = (tag, attrs, ...nodes) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...nodes); return el; };
  const main = h("main"); doc.body.append(main); const frames = [];
  const observers = [];
  class ResizeObserver { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } }
  const sandbox = { document: doc, requestAnimationFrame: fn => frames.push(fn), matchMedia: () => ({ matches: mobile }), ResizeObserver, console };
  vm.runInNewContext(source.replace("export function renderOrganization", "function renderOrganization") + ";globalThis.renderOrganization=renderOrganization;", sandbox, { filename: "organization-view.js" });
  // The shared directory implementation is exercised by the actual app suites.
  // This module fixture supplies its documented canonical ordinary link contract.
  const dispose = sandbox.renderOrganization(main, model, { h, add: (el, nodes) => el.append(nodes), clear: el => el.replaceChildren(), posIcon: () => h("img"), parts, officeAvailability, roleDirectory203:directory203, roleGuide201:key=>h('span',{'data-duplicate-guide-fixture':key}), allianceOverview205:overview205?()=>h('section',{class:'org-alliance'}):undefined, roleFamilyDirectory203:()=>h('div',{'data-shared-families203':'true'},directory203.families.map(row=>h('article',null,h('a',{href:'#/roles/'+row.key,text:row.label}),row.application&&officeAvailability?.[row.primaryKey]!==false?h('a',{'data-office-application':row.primaryKey,href:'#/vote/'+row.application.applicationTrack+'/'+encodeURIComponent(row.application.targetOffice||'new'),text:'Review ordinary role application'}):null))) });
  const flush = () => { while (frames.length) frames.shift()(); }; flush();
  const one = cls => main.all(n => n.classList.contains(cls))[0];
  const button = text => main.all(n => n.tagName === "BUTTON" && n.textContent === text)[0];
  const node = id => main.all(n => n.getAttribute("data-organization-node") === id)[0];
  const pointer = (target, type, x, y, more = {}) => target.dispatch(type, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, ...more });
  const resize = width => { doc.viewportWidth = width; for (const observer of observers) if (!observer.disconnected) observer.fn(); flush(); };
  return { main, doc, flush, one, button, node, pointer, resize, dispose, observers, viewport: one("org-viewport"), stage: one("org-stage"), detail: one("org-inspector"), dialog: one("org-fullscreen") };
}
const p = open();
p.button("Full map").click();
check('.218 chart search accessible name states all103 current labels', data.terms.length === 103 && p.doc.getElementById('organization-search').getAttribute('aria-label') === 'Search all offices and 103 labels');
const originalDataCount208 = JSON.stringify(data), syntheticCountModel208 = { ...data, terms: [...data.terms, { ...data.terms[100], ordinal: 103, officeKey: 'office_103', label: 'Synthetic label-count witness only' }] };
const syntheticCountView208 = open({ model: syntheticCountModel208 });
check('.218 accessible search count follows its supplied model without mutating the canonical catalogue', syntheticCountModel208.terms.length === 104 && syntheticCountView208.doc.getElementById('organization-search').getAttribute('aria-label') === 'Search all offices and 104 labels' && JSON.stringify(data) === originalDataCount208 && data.terms.length === 103);
syntheticCountView208.dispose();
const wide205=open({overview205:true});
check('.221 the interactive full map is open immediately alongside the readable alliance overview',wide205.one('org-relationship-map205').open&&!!wide205.one('org-alliance'));
check('.221 the live map comes before the long alliance guide',wide205.main.children.indexOf(wide205.one('org-relationship-map205'))<wide205.main.children.indexOf(wide205.one('org-alliance')));
check('.221 the chart controls precede the rank and Council reading sections',wide205.one('org-relationship-map205').children.indexOf(wide205.one('org-chart-location'))<wide205.one('org-relationship-map205').children.indexOf(wide205.one('org-rank-guide'))&&wide205.one('org-relationship-map205').children.indexOf(wide205.one('org-chart-location'))<wide205.one('org-relationship-map205').children.indexOf(wide205.one('org-council-overview')));
const deepOffice205=open({overview205:true,parts:['office_27']});
check('.205 an existing office deep link reveals its complete mandate inside the outer map',deepOffice205.one('org-relationship-map205').open&&deepOffice205.doc.activeElement===deepOffice205.detail&&deepOffice205.detail.textContent.includes('Crafter'));
const deepNode205=open({overview205:true,parts:['treasury']});
// CL2-047 (our 4c7b542): the treasury node holds the treasurer seat; the mandate's heading is that seat's Cabinet title, not
// "Federal Treasury".
check('.205 an existing department deep link reveals and focuses the requested mandate',deepNode205.one('org-relationship-map205').open&&deepNode205.doc.activeElement===deepNode205.detail&&deepNode205.detail.children.some(n=>n.tagName==='H2'&&n.textContent==='Lord High Treasurer · Minister of the Imperial Exchequer'));
wide205.main.all(n=>n.getAttribute('data-office-key')==='office_08')[0].children[0].click(0);
check('.205 historical catalogue selections reveal the outer map before focusing its reader',wide205.one('org-relationship-map205').open&&wide205.doc.activeElement===wide205.detail);
// CL2-034 (our 4c7b542; directive line 45): the register uses the directory's six catalogue groups, each once and in order,
// instead of the four tier groups.
check(".218 exact ten ranks and all103 current office records are visible", p.main.all(n=>!!n.getAttribute('data-native-rank')).map(n=>n.children[0].textContent).join('|') === 'Leader (Guild Master)|High Council|Officer|Officer Alt|Raid Leader|Veteran|Raider|Member|Alt|Initiate' && p.main.all(n=>!!n.getAttribute('data-office-key')).length === 103 && p.main.all(n=>n.getAttribute('data-catalog-group')).map(n=>n.getAttribute('data-catalog-group')).join('|')==='council|officers|raid|workshop|members|royal');
const leader118 = open({ parts: ['office_43'] });
// CL2-041, CL2-197, CL2-310 (our 4c7b542; directive line 52): the panel's placement sentence is gone; rank and slot are
// stated once, in the badge, as "Rank 1 Leader (Guild Master) · Slot 0": one badge part names a rank, and the mandate
// names the slot-0 display name once.
check('CC-118 the relationship map explains the exact in-game name and labels the rank-one mandate once in its badge without changing the data',
  leader118.one('org-rank-guide').textContent.includes('The in-game name for slot 0 is Guild Master.')
  && leader118.detail.all(node => node.getAttribute('data-native-placement') !== null).length === 0
  && leader118.detail.all(node => node.classList.contains('org-office-badges')).flatMap(node => node.children.map(part => part.textContent)).filter(text => text.startsWith('Rank ')).join('|') === 'Rank 1 Leader (Guild Master) · Slot 0'
  && leader118.detail.textContent.split('Leader (Guild Master)').length === 2
  && data.nativeRanks[0].name === 'Leader' && data.nativeRanks[0].nativeSlot === 0);
leader118.dispose();
// Current labels describe these five standing records without rewriting the historical model.
const nativeDepartmentKeys218 = ['office_04','office_48','office_55','office_75','office_90'];
const rawOfficeCard218 = key => p.main.all(n => n.classList.contains('org-office-card') && n.getAttribute('data-office-key') === key)[0];
check('every stable office register entry links to its canonical family without a duplicate full guide',
  data.terms.every(term=>{
    const card=rawOfficeCard218(term.officeKey),family=directory203.keyToFamily[term.officeKey];
    return !!family&&card?.all(node=>node.getAttribute('href')==='#/roles/'+encodeURIComponent(family)).length===1;
  }) && p.main.all(node=>node.getAttribute('data-duplicate-guide-fixture')).length===0);
check(".218 the five native-standing office cards use a rank-reference label while retaining the exact raw model",
  modelNativeDepartmentKeys218() === nativeDepartmentKeys218.join('|')
  && nativeDepartmentKeys218.every(key => { const card = rawOfficeCard218(key); return card && card.children.some(n => n.tagName === 'P' && n.textContent === 'In-game rank reference') && !card.children.some(n => n.tagName === 'P' && n.textContent === 'Ten native rank slots'); })
  && JSON.stringify(data) === originalDataCount208);
function modelNativeDepartmentKeys218() { return data.terms.filter(term => term.department === 'Ten native rank slots').map(term => term.officeKey).sort().join('|'); }
// CL2-041, CL2-220 (our 4c7b542) and owner directive line 51 (every role card deduplicated, zero repetition): a note shared
// by several titles is boilerplate and leaves the cards; a note that belongs to one title alone is still shown on that
// title's card. This rule (one title) is deliberately stricter than the product's (fewer than three); in organization.json
// no note is used by exactly two titles, so both select the same notes.
const noteUses218 = note => data.terms.filter(term => term.note === note).length;
check(".218 all other office departments and every title-specific source note remain visible without a broad relabel",
  data.terms.every(term => { const card = rawOfficeCard218(term.officeKey); return card && card.children.some(n => n.tagName === 'P' && n.textContent === term.note) === (noteUses218(term.note) === 1)
    && (nativeDepartmentKeys218.includes(term.officeKey) || card.children.some(n => n.tagName === 'P' && n.textContent === term.department)); }));
const nativeDisplay218 = open({ mobile:true, parts:['native'] });
const nativeDisplayRow218 = nativeDisplay218.one('org-list').children.find(row => row.children[0].all(n => n.tagName === 'STRONG' && n.textContent === 'In-game rank reference').length === 1);
check(".218 native reference list, inspector, disclosure and status use one natural display title without rewriting the raw model",
  !!nativeDisplayRow218 && nativeDisplay218.detail.children.some(n => n.tagName === 'H2' && n.textContent === 'In-game rank reference')
  && nativeDisplay218.one('org-detail-drawer').children[0].textContent === 'Office details · In-game rank reference'
  && nativeDisplay218.main.all(n => n.getAttribute('role') === 'status').some(n => n.textContent.includes('Rank and membership groupings have no command arrows'))
  && data.nodes.find(node => node.id === 'native').title === 'Ten native rank slots' && JSON.stringify(data) === originalDataCount208);
const nativeDisplaySearch218 = nativeDisplay218.doc.getElementById('organization-search');
nativeDisplaySearch218.value = 'In-game rank reference'; nativeDisplaySearch218.dispatch('input');
check(".218 the current native reference display label remains searchable and has no command card",
  !!nativeDisplayRow218 && !nativeDisplayRow218.hidden && !nativeDisplay218.node('native') && nativeDisplay218.detail.textContent.includes(data.nodes.find(node => node.id === 'native').limits));
nativeDisplay218.dispose();
check("Organization links to the canonical Roles directory and preserves the closed office register without a duplicate family catalogue",
  p.main.all(n=>n.getAttribute('data-shared-families203')==='true').length===0
  && p.main.all(n=>n.tagName==='A'&&n.getAttribute('href')==='#/roles'&&n.textContent==='Explore the role directory').length===1
  && p.main.all(n=>n.classList.contains('org-catalogue-history203')).some(n=>!n.open&&n.textContent.includes('original identifiers')&&n.all(card=>card.classList.contains('org-office-card')).length===data.terms.length));
// Our 4c7b542 (CL2-036): one eligibility vocabulary; the closing sentence now ends "not additional seats".
check("all reserved tiers have no application link even with the historical catalogue eligibility", !p.main.textContent.includes('Open seat') && data.terms.filter(t=>['leader','high_council','officer_corps'].includes(t.tier)).every(t=>!p.main.all(n=>n.getAttribute('data-office-application')===t.officeKey).length) && p.main.textContent.includes('Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed. Collective institutions and their case panels are not additional seats.'));
const occupied199=open({officeAvailability:{office_03:false,office_62:false,office_74:true,office_07:true,office_27:false},parts:['office_27']});
check("old Crafter inspector links explicitly to the canonical Artisan choice without rewriting its old record",!occupied199.main.all(n=>['office_03','office_62','office_74','office_27'].includes(n.getAttribute('data-office-application'))).length&&occupied199.main.all(n=>n.getAttribute('data-office-application')==='office_07').some(n=>n.getAttribute('href')==='#/vote/artisan/office_07'));
const reserved203=open({officeAvailability:{office_74:true},parts:['raid_leader_na']});
// Our 4c7b542 (CL2-036): apply links appear exactly where the Worker accepts the intent (validateApplicationIntent199).
// Owner rulings of 14 Nov 2026 (claude/entry-140 "No, three choices only", entry-143; our 111867e, aee8cfc):
// those are Guild Member, Raider and Artisan (office_07) only; Core Raider (office_25) and Crafter (office_27) are not
// offered. The reserved office_74 with its stale open flag still has no link, and no officer or High Council track is offered.
check("historical regional leadership inspector remains reserved despite a stale open flag",[...new Set(reserved203.main.all(n=>n.getAttribute('data-office-application')).map(n=>n.getAttribute('data-office-application')))].sort().join('|')==='member|office_07|raider'&&reserved203.main.all(n=>n.getAttribute('data-office-application')).every(n=>!['officer','high_council'].includes(n.getAttribute('data-application-track')))&&!reserved203.main.all(n=>n.getAttribute('data-office-application')==='office_74').length);
check("historical profiles are collapsed behind the named technical disclosure and the crosswalk is linked",p.main.all(n=>n.tagName==='DETAILS'&&n.classList.contains('org-profile-notes')).some(n=>!n.open&&n.children[0].textContent==='Technical & Historical Profile Notes')&&p.main.all(n=>n.tagName==='A').some(n=>n.getAttribute('href')==='#/roles/rosetta-stone'));
check("all non-classification offices retain chart cards", p.main.all(n => !!n.getAttribute("data-organization-node")).length === data.nodes.filter(n => n.relation !== "classification").length);
check("the Council remains initially selected", p.node("council").getAttribute("aria-pressed") === "true");
const council = p.one("org-council-overview"), offices = p.one("org-council-offices");
check("the current Council names its chair and the Co-Guild Master and twelve distinct portfolios", JSON.stringify(offices.children.map(n => n.textContent)) === JSON.stringify(data.councilComposition.currentSeats.map(row=>row.label)) && offices.children.length === 14 && ['Lord High Treasurer','Lord High Factor','Co-Guild Master','Lord High Marshal of PvE','Lord High Marshal of PvP','Lord High Justiciar'].every(label=>offices.textContent.includes(label)));
check("regional operational leaders remain distinct from accepted alliance appointments", council.textContent.includes("Council seats require an accepted appointment") && council.textContent.includes("Regional Raid and PvP leads remain distinct Officer Corps responsibilities"));
check("Justice keeps case designation and conflict review", council.textContent.includes("Council of Justice panel service requires case designation and conflict review"));
check("current Council context reads from the seat projection without the prior short roster",
  council.textContent.includes(data.councilComposition.summary) && !council.textContent.includes("MAIN Raid Lead"));
const previousJusticeLabel = rawOfficeCard218('office_101').all(n => n.getAttribute('data-historical-office-labels') === 'office_101')[0];
const officeSearch = p.doc.getElementById('organization-search');
officeSearch.value = 'Lord High Chancellor'; officeSearch.dispatch('input');
check("the former judicial label stays in the closed history drawer and out of current office search",
  previousJusticeLabel?.tagName === 'DETAILS' && !previousJusticeLabel.open && previousJusticeLabel.textContent.includes('formerly styled Lord High Chancellor')
  && rawOfficeCard218('office_101').hidden && !rawOfficeCard218('office_14').hidden);
// Owner ruling of 15 Nov 2026 ("No, current titles only", claude/stage2/SITE-FAULTS-282.md question 2) with CL2-190 (our
// 4c7b542: one index over titles, aliases and keys serves the chart and the register): the register, the list and the chart
// match exactly the offices whose current terms or node text contain the query; a historical office label adds nothing.
const orgStatus1115 = p.main.all(n => n.getAttribute('role') === 'status' && /^\d+ offices or groups match/.test(n.textContent))[0];
const orgCards1115 = data.terms.map(t => [t, rawOfficeCard218(t.officeKey)]), orgRows1115 = p.main.all(n => n.classList.contains('org-list-row'));
const orgButtons1115 = new Map(p.main.all(n => !!n.getAttribute('data-organization-node')).map(n => [n.getAttribute('data-organization-node'), n]));
const orgLc1115 = s => String(s).toLowerCase();
// Owner's answer of 15 Nov 2026 to question 4 ("Yes, stop matching", claude/stage2/SITE-FAULTS-282-FOLLOWUP.md): aliases the
// register files under "Historical application & ballot labels" are not current terms; plain "Retained portfolio labels" are.
const orgFiledHistorical1115 = t => rawOfficeCard218(t.officeKey).all(n => n.getAttribute('data-historical-application-labels218') === t.officeKey).length === 1;
const orgCurrent1115 = t => orgLc1115([t.label, t.applicationLabel, ...(orgFiledHistorical1115(t) ? [] : t.applicationAliases || []), t.officeKey, t.department, t.tierLabel, directory203.families.find(row => row.key === directory203.keyToFamily[t.officeKey])?.label].filter(Boolean).join(' '));
const orgNodeText1115 = data.nodes.map((n, i) => orgLc1115([orgRows1115[i]?.all(x => x.tagName === 'STRONG')[0]?.textContent, n.title, n.remit, n.limits, ...data.terms.filter(t => t.nodeId === n.id).map(orgCurrent1115)].join(' ')));
const orgSearch1115 = q => {
  officeSearch.value = q; officeSearch.dispatch('input'); const needle = orgLc1115(q.trim());
  const nodes = data.nodes.filter((n, i) => orgNodeText1115[i].includes(needle)).map(n => n.id);
  return { terms: data.terms.filter(t => orgCurrent1115(t).includes(needle)).map(t => t.officeKey), nodes, chartNodes: nodes.filter(id => orgButtons1115.has(id)),
    cards: orgCards1115.filter(([, li]) => !li.hidden).map(([t]) => t.officeKey), rows: data.nodes.filter((n, i) => !orgRows1115[i].hidden).map(n => n.id),
    chart: data.nodes.filter(n => orgButtons1115.get(n.id)?.classList.contains('org-node-match')).map(n => n.id), count: Number(/^(\d+) offices or groups match/.exec(orgStatus1115?.textContent)?.[1]) };
};
const orgExact1115 = r => JSON.stringify(r.cards) === JSON.stringify(r.terms) && JSON.stringify(r.rows) === JSON.stringify(r.nodes) && JSON.stringify(r.chart) === JSON.stringify(r.chartNodes) && r.count === r.nodes.length;
const orgChancellor1115 = orgSearch1115('Lord High Chancellor');
check("the Justiciar's former style 'Lord High Chancellor' shows only the current Lord High Chancellor in the register, the list and the chart",
  orgRows1115.length === data.nodes.length && orgExact1115(orgChancellor1115) && JSON.stringify(orgChancellor1115.cards) === '["office_14"]'
  && JSON.stringify(orgChancellor1115.rows) === '["intake"]' && JSON.stringify(orgChancellor1115.chart) === '["intake"]' && !orgButtons1115.get('justiciar').classList.contains('org-node-match'));
const orgHistoryQueries1115 = [...new Set(data.terms.flatMap(t => t.historicalOfficeLabels || []).flatMap(label => { const parts = label.split(',').map(s => s.trim()).filter(Boolean); return [label, ...parts, ...parts.map(s => s.replace(/^formerly styled\s+/i, ''))]; }))];
check("no historical office label or part of one finds an office through its history in the register, the list or the chart",
  JSON.stringify(orgHistoryQueries1115) === JSON.stringify(['Head of Justice, formerly styled Lord High Chancellor', 'Head of Justice', 'formerly styled Lord High Chancellor', 'Lord High Chancellor'])
  && orgHistoryQueries1115.every(q => orgExact1115(orgSearch1115(q))));
const orgFinds1115 = pick => { const pairs = data.terms.flatMap(t => pick(t).filter(Boolean).map(q => [t, q])); return pairs.length > 0 && pairs.every(([t, q]) => { const r = orgSearch1115(q);
  return r.cards.includes(t.officeKey) && r.rows.includes(t.nodeId) && (!orgButtons1115.has(t.nodeId) || r.chart.includes(t.nodeId)) && orgExact1115(r); }); };
check("CL2-190 every current office label finds its own register card, list row and chart node, and only offices whose current terms carry it", orgFinds1115(t => [t.label]));
check("CL2-190 every application label finds its own register card, list row and chart node, and only offices whose current terms carry it", orgFinds1115(t => [t.applicationLabel]));
// Owner's answer 4 of 15 Nov 2026 (above): of the application aliases only the retained portfolio labels stay current terms.
check("CL2-190 every retained portfolio label finds its own register card, list row and chart node, and only offices whose current terms carry it", orgFinds1115(t => orgFiledHistorical1115(t) ? [] : t.applicationAliases || []));
const orgAliasTerms1115 = data.terms.filter(t => t.applicationAliases?.length);
const orgFiledByData1115 = t => directory203.families.find(row => row.key === directory203.keyToFamily[t.officeKey])?.kind === 'institution' || !!t.applicationMetadataScope;
check("exactly the four cards whose aliases the page files as historical keep them in a closed 'Historical application & ballot labels' drawer; every other alias stays a plain 'Retained portfolio labels' line",
  JSON.stringify(orgAliasTerms1115.filter(orgFiledHistorical1115).map(t => t.officeKey)) === '["office_03","office_26","office_67","office_94"]'
  && JSON.stringify(orgAliasTerms1115.filter(orgFiledByData1115).map(t => t.officeKey)) === '["office_03","office_26","office_67","office_94"]'
  && p.main.all(n => !!n.getAttribute('data-historical-application-labels218')).length === 4
  && orgAliasTerms1115.filter(t => !orgFiledHistorical1115(t)).flatMap(t => t.applicationAliases).length === 19
  && orgAliasTerms1115.every(t => { const card = rawOfficeCard218(t.officeKey), line = 'Retained portfolio labels: ' + t.applicationAliases.join(' · ');
    const d = card.all(n => n.getAttribute('data-historical-application-labels218') === t.officeKey);
    if (!orgFiledByData1115(t)) return d.length === 0 && card.children.filter(n => n.tagName === 'P' && n.textContent === line).length === 1;
    return d.length === 1 && d[0].tagName === 'DETAILS' && !d[0].open && d[0].getAttribute('open') === null && d[0].children.length === 3
      && d[0].children[0].tagName === 'SUMMARY' && d[0].children[0].textContent === 'Historical application & ballot labels'
      && d[0].children[1].textContent === (t.applicationMetadataScope || 'Earlier application vocabulary is retained for record compatibility; it does not open this institution to applications.')
      && d[0].children[2].tagName === 'P' && d[0].children[2].textContent === line && !card.children.some(n => n.tagName === 'P' && n.textContent === line); }));
const orgFiledQueries1115 = [...new Set(orgAliasTerms1115.filter(orgFiledHistorical1115).flatMap(t => t.applicationAliases))];
const orgFiledResults1115 = orgFiledQueries1115.map(q => [q, orgSearch1115(q)]);
check("a name the page files as a historical application label finds only the offices whose current terms carry the same words, in the register, the list and the chart",
  JSON.stringify(orgFiledQueries1115) === JSON.stringify(['Systems Architect', 'Head of Justice', 'Privy Council / Judiciary', 'Judicial Portfolio', 'MAIN Raid & PvP Leads', 'PvE War Council Director'])
  && orgFiledResults1115.every(([, r]) => orgExact1115(r))
  && orgAliasTerms1115.filter(orgFiledHistorical1115).every(t => t.applicationAliases.every(q => { const r = orgFiledResults1115.find(([x]) => x === q)[1], own = orgCurrent1115(t).includes(orgLc1115(q));
    return r.cards.includes(t.officeKey) === own && r.rows.includes(t.nodeId) === data.nodes.some((n, i) => n.id === t.nodeId && orgNodeText1115[i].includes(orgLc1115(q))); }))
  && JSON.stringify(orgFiledResults1115.map(([q, r]) => [q, r.cards, r.chart, r.count])) === JSON.stringify([['Systems Architect', ['office_03'], ['systems'], 1], ['Head of Justice', [], [], 0],
    ['Privy Council / Judiciary', ['office_67'], ['council'], 1], ['Judicial Portfolio', [], [], 0], ['MAIN Raid & PvP Leads', [], [], 0], ['PvE War Council Director', [], [], 0]]));
check("CL2-190 every office key finds its own register card, list row and chart node, and only offices whose current terms carry it", orgFinds1115(t => [t.officeKey]));
const orgHistoryDrawers1115 = p.main.all(n => !!n.getAttribute('data-historical-office-labels'));
check("each historical office label drawer renders closed under its own summary with exactly that office's former labels",
  orgHistoryDrawers1115.length === data.terms.filter(t => t.historicalOfficeLabels?.length).length && data.terms.filter(t => t.historicalOfficeLabels?.length).every(t => {
    const d = rawOfficeCard218(t.officeKey).all(n => n.getAttribute('data-historical-office-labels') === t.officeKey);
    return d.length === 1 && d[0].tagName === 'DETAILS' && !d[0].open && d[0].getAttribute('open') === null && d[0].children.length === 2 && d[0].children[0].tagName === 'SUMMARY'
      && d[0].children[0].textContent === 'Historical office labels' && d[0].children[1].textContent === t.historicalOfficeLabels.join(' · '); }));
officeSearch.value = ''; officeSearch.dispatch('input');
check("support, advisers and the current composition do not issue votes or permission", council.textContent.includes("Systems & Heraldry sets stewardship and heraldic standards") && council.textContent.includes("not automatically voting councillors") && council.textContent.includes("does not itself issue an eligible vote, individual warrant, native rank or permission") && council.textContent.includes("One person still has one vote, subject to recusal"));
check("current .222 Council reference and historical owner directions remain distinct", p.one("org-composition-status").textContent === data.councilComposition.formalStatus && data.councilComposition.recordedAt === '2026-11-04' && data.councilComposition.founderRatificationRecorded===false && data.councilComposition.eligibleSeatIssued===false && data.councilComposition.permissionsApplied===false && data.councilComposition.previousDirection.recordedAt==='2026-10-23' && data.councilComposition.historicalDirection.recordedAt==='2026-10-19');
check("current and historical directions stay reachable without relabelling R7 as adopted R8", council.all(n => n.tagName === "A").some(n => n.getAttribute("href") === data.councilComposition.sourcePath && n.textContent === "Read the current Council reference") && council.all(n=>n.tagName==='A').some(n=>n.getAttribute('href')===data.councilComposition.previousDirection.sourcePath && n.textContent.includes('19–23 October')) && data.revision === "R7");
const councilRecord199 = fs.readFileSync(path.join(root, "public", data.councilComposition.previousDirection.sourcePath.replace(/^\/+/, "")));
const councilPriorStart199 = councilRecord199.indexOf(Buffer.from("# Current composition clarification — 23 October 2026"));
const councilNotice199 = councilRecord199.subarray(0, councilPriorStart199), councilHistory199 = councilRecord199.subarray(councilPriorStart199);
const councilDigest199 = bytes => require("node:crypto").createHash("sha256").update(bytes).digest("hex");
check("the dated Council record retains its entire original2939-byte historical body exactly after the new notice", councilPriorStart199 > 0 && councilHistory199.length === 2939 && councilDigest199(councilHistory199) === "1e680ab2afba2e40520a140518f9c8322246f51adb33c118ca70fbb791b94627");
check("the owner supersession is one exact prefix and removing it recovers only the preserved historical record", councilNotice199.length === 886 && councilDigest199(councilNotice199) === "272199fde83ac5fa65d41c33711358c7ef8dc53bdd36d73c68b136a4818f5ac2" && Buffer.concat([councilNotice199, councilHistory199]).equals(councilRecord199));
check("the current website notice states exactzero-based slots and appointments without claiming actual game or signing-profile adoption", councilNotice199.toString().includes("current .199 website hierarchy") && councilNotice199.toString().includes("Leader: zero-based slot 0; High Council: zero-based slot 1; Officer: zero-based slot 2") && councilNotice199.toString().includes("Co-Guild Master and Treasurer are High Council appointments, **not additional native ranks**") && councilNotice199.toString().includes("(/#/roles/rosetta-stone)") && councilNotice199.toString().includes("Actual in-game configuration, signing profiles, accepted warrants, Council votes and bank permissions require their separate attended verification and records."));
check("the clarification links the existing operational charter", council.all(n => n.tagName === "A").some(n => n.getAttribute("href") === "#/governance/operational-charter-the-work-of-olympus" && n.textContent.includes("O3")));
const tradingDeep208 = open({ overview205: true, parts: ['office_96'] });
check('.218 dedicated trading deep link keeps Council classification and the shared reserved-seat boundary', tradingDeep208.one('org-relationship-map205').open && tradingDeep208.doc.activeElement === tradingDeep208.detail && tradingDeep208.detail.textContent.includes('Lord High Factor') && tradingDeep208.detail.textContent.includes('Auction House') && tradingDeep208.detail.textContent.includes('Rank 2 High Council') && tradingDeep208.main.all(node => node.getAttribute('data-office-key') === 'office_96').some(node => node.textContent.includes('High Council')) && tradingDeep208.main.textContent.includes('Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed. Collective institutions and their case panels are not additional seats.') && !tradingDeep208.detail.all(node => node.getAttribute('data-office-application') === 'office_96').length);
check("the static model still issues no appointments", data.appointmentsIssued === false);
const chartNodes = data.nodes.filter(n => n.relation !== "classification"), visibleIds = page => page.main.all(n => n.getAttribute("data-organization-node") && !n.hidden).map(n => n.getAttribute("data-organization-node"));
const scaleOf = page => Number(/scale\(([^)]+)\)/.exec(page.stage.style.transform)?.[1]);
const wholeMapFits = page => { const [, x, y, scale] = /translate\(([^p]+)px, ([^p]+)px\) scale\(([^)]+)\)/.exec(page.stage.style.transform).map(Number); return x >= 0 && y >= 0 && x + parseFloat(page.stage.style.width) * scale <= page.viewport.clientWidth && y + parseFloat(page.stage.style.height) * scale <= page.viewport.clientHeight; };
check("initial desktop view shows every chart office fitted inside the viewport without a branch click", visibleIds(p).length === chartNodes.length && p.button("Full map").getAttribute("aria-pressed") === "true" && p.button("Fit branch").getAttribute("aria-pressed") === "false" && wholeMapFits(p));
p.doc.getElementById("organization-view-style").dispatch("load");p.flush();p.resize(1000);
check("stylesheet completion and viewport resize preserve the full initial overview", visibleIds(p).length === chartNodes.length && p.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(p));
p.button("Fit branch").click();
check("initial branch keeps the selected office, parent and its direct connections", JSON.stringify(visibleIds(p).sort()) === JSON.stringify(chartNodes.filter(n => n.id === "council" || n.id === "founder" || n.parent === "council").map(n => n.id).sort()));
check("branch fit keeps labels at a readable scale rather than shrinking the full map", scaleOf(p) >= .85 && p.button("Fit branch").getAttribute("aria-pressed") === "true" && p.one("org-chart-shell").textContent.includes("drag to see the rest"));
check("the complete reading view retains every group and label", p.one("org-list").children.length === data.nodes.length && p.main.all(n => n.classList.contains("organization-term")).length === data.terms.length);
check("the two composition sources have a separate wrapping link group", p.one("org-composition-links").children.length === 3 && css.includes(".org-composition-links{display:flex;flex-wrap:wrap;gap:"));
// CL2-047 (our 4c7b542): a node that holds a current Council seat is named by that seat's Cabinet title; the chair's node
// keeps "Founder and Patron". CL2-039 (our 6162226, owner ruling of 13 Nov 2026): alsoReportsTo draws a second reporting
// line of the node's own relation (the Lord High Justiciar to the Co-Guild Master as well as to the Guild Master).
const seatTitle1113 = n => (n.id !== 'founder' && data.councilComposition.currentSeats.find(seat => seat.nodeId === n.id)?.label) || n.title;
const expectedEdges = chartNodes.flatMap(n => [n.parent ? `${seatTitle1113(n)} → ${seatTitle1113(data.nodes.find(p => p.id === n.parent))}: ${data.legend[n.relation]}` : null, ...(n.alsoReportsTo || []).filter(other => other !== n.parent).map(other => `${seatTitle1113(n)} → ${seatTitle1113(data.nodes.find(p => p.id === other))}: ${data.legend[n.relation]}`), ...n.coordinates.filter(peer => peer !== n.parent).map(peer => `${seatTitle1113(n)} → ${seatTitle1113(data.nodes.find(p => p.id === peer))}: liaison; no command authority`)]).filter(Boolean).sort();
const renderedEdges = p.main.all(n => n.tagName === "PATH" && n.classList.contains("org-edge"));
check("every relationship identifies its real source and target card ports",renderedEdges.every(e=>e.getAttribute("data-from")&&e.getAttribute("data-to")&&e.getAttribute("data-start-port")==="card-border"&&e.getAttribute("data-end-port")==="card-border"));
check("branch presentation preserves every original directed relationship and explanation", JSON.stringify(renderedEdges.map(n => n.textContent).sort()) === JSON.stringify(expectedEdges));
check("branch connectors never include hidden endpoints or missing geometry", renderedEdges.filter(n => n.style.display !== "none").every(n => n.getAttribute("d")?.startsWith("M ")));
p.button("Full map").click();
check("Full map restores every chart office and relationship without changing the reader model", visibleIds(p).length === chartNodes.length && renderedEdges.every(n => n.style.display !== "none" && n.getAttribute("d")) && p.button("Full map").getAttribute("aria-pressed") === "true");
const boxes = page => chartNodes.map(n => ({ id: n.id, left: parseFloat(page.node(n.id).style.left), top: parseFloat(page.node(n.id).style.top) }));
const mapBoxes = boxes(p), mapWidth = parseFloat(p.stage.style.width), mapHeight = parseFloat(p.stage.style.height);
const oldLeafWidth = Math.max(1100, chartNodes.filter(n => !chartNodes.some(c => c.parent === n.id)).length * 270 + 40);
check("the complete map reserves a separate hierarchical column and subtree span", mapWidth >= 680 && mapWidth < oldLeafWidth && mapHeight > 0);
check("every compact map card stays inside its canvas with separate readable card geometry", mapBoxes.every(b => b.left >= 0 && b.top >= 0 && b.left + 230 <= mapWidth && b.top + 124 <= mapHeight) && mapBoxes.every((a, i) => mapBoxes.slice(i + 1).every(b => Math.abs(a.left - b.left) >= 230 || Math.abs(a.top - b.top) >= 124)));
check("every child occupies the column after its actual parent", chartNodes.filter(n => n.parent).every(n => mapBoxes.find(b => b.id === n.id).left > mapBoxes.find(b => b.id === n.parent).left));
function crossesCard(path, cards) {
  const values = path.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number), points = [];
  for (let i = 0; i < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] });
  return points.slice(1).some((b, i) => {
    const a = points[i];
    return cards.some(c => a.x === b.x ? a.x > c.left && a.x < c.left + 230 && Math.max(a.y, b.y) > c.top && Math.min(a.y, b.y) < c.top + 124 : a.y === b.y ? a.y > c.top && a.y < c.top + 124 && Math.max(a.x, b.x) > c.left && Math.min(a.x, b.x) < c.left + 230 : true);
  });
}
check("wrapped relationship connectors stay in the gutters and never cross an office label", renderedEdges.every(edge => !crossesCard(edge, mapBoxes)));
check("the small full-map overview is explicitly distinguished from readable branch fit", p.one("org-chart-shell").textContent.includes("Full map overview") && p.one("org-chart-shell").textContent.includes("choose Fit branch to read it"));
const overview183 = open();overview183.button("Full map").click();overview183.button("Full screen").click();overview183.flush();
check("opening full screen preserves all offices in overview rather than zooming to the selected branch", visibleIds(overview183).length === chartNodes.length && overview183.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(overview183));
overview183.button("Close full screen").click();overview183.flush();
check("closing full screen preserves the complete inline overview", visibleIds(overview183).length === chartNodes.length && overview183.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(overview183));
const disposedTransform183=overview183.stage.style.transform;overview183.dispose();overview183.resize(500);
check("leaving the organization disconnects only its own resize observer and prevents late layout work", overview183.observers.every(observer=>observer.disconnected) && overview183.stage.style.transform===disposedTransform183);
p.node("treasury").click(0); p.button("Fit branch").click();
check("a selected branch includes incoming working partners without inventing reporting authority", JSON.stringify(visibleIds(p).sort()) === JSON.stringify(["treasury", "trading", "council", "emissary-finance"].sort()) && p.node("treasury").getAttribute("aria-pressed") === "true" && scaleOf(p) >= .85);
p.node("council").click(0);

let before = p.stage.style.transform;
const down = p.pointer(p.viewport, "pointerdown", 100, 100);
check("empty-space pan prevents selection and focuses the chart", down.defaultPrevented && p.doc.activeElement === p.viewport && p.viewport.hasPointerCapture(1));
p.pointer(p.viewport, "pointermove", 103, 102);
check("small pointer jitter does not move the chart", p.stage.style.transform === before && !p.viewport.classList.contains("is-dragging"));
p.pointer(p.viewport, "pointermove", 130, 120);
check("primary movement pans and exposes grabbing state", p.stage.style.transform !== before && p.viewport.classList.contains("is-dragging"));
before = p.stage.style.transform; p.pointer(p.viewport, "pointermove", 800, 800, { pointerId: 2 });
check("a second pointer cannot move the active pan", p.stage.style.transform === before);
p.pointer(p.viewport, "pointerup", 800, 800, { pointerId: 2 });
check("a secondary pointer ending cannot cancel the primary pan", p.viewport.hasPointerCapture(1) && p.viewport.classList.contains("is-dragging"));
p.pointer(p.viewport, "pointerup", 130, 120);
check("pan completion releases pointer capture and grabbing state", !p.viewport.hasPointerCapture(1) && !p.viewport.classList.contains("is-dragging"));
check("chart selection is prevented independently of pointer type", p.stage.dispatch("selectstart").defaultPrevented);

const war = p.node("war"), label = war.children[1].children[0];
const cardDown = p.pointer(label, "pointerdown", 50, 50);
p.pointer(label, "pointermove", 52, 51); p.pointer(label, "pointerup", 52, 51); war.click();
check("an ordinary card click still opens and focuses its mandate", !cardDown.defaultPrevented && war.getAttribute("aria-pressed") === "true" && p.doc.activeElement === p.detail && p.detail.textContent.includes("Department of War"));
before = p.stage.style.transform;
p.pointer(label, "pointerdown", 50, 50); p.pointer(label, "pointermove", 85, 71); p.pointer(p.viewport, "pointerup", 85, 71);
const afterPan = p.node("treasury").click();
check("dragging a card pans without selecting another office on release", p.stage.style.transform !== before && afterPan.defaultPrevented && p.node("war").getAttribute("aria-pressed") === "true");
p.node("treasury").click(0);
check("keyboard card activation is not suppressed by a preceding drag", p.node("treasury").getAttribute("aria-pressed") === "true");
before = p.stage.style.transform; p.pointer(p.viewport, "pointerdown", 1, 1, { button: 2 }); p.pointer(p.viewport, "pointermove", 90, 90);
check("right-button gestures do not begin a chart pan", p.stage.style.transform === before);
p.pointer(p.viewport, "pointerdown", 1, 1); p.pointer(p.viewport, "pointermove", 20, 20); p.pointer(p.viewport, "pointercancel", 20, 20);
check("cancelled pointers release pan state", !p.viewport.hasPointerCapture(1) && !p.viewport.classList.contains("is-dragging"));

const touchView = open({ mobile: true, width: 390 });
const touchViewport = touchView.viewport, touchCard = touchView.node("war"), touchLabel = touchCard.children[1];
const touchOwners = new Map(), touchCaptureLoss = [];
for (const target of [touchViewport, touchLabel]) {
  target.setPointerCapture = id => {
    const previous = touchOwners.get(id);
    if (previous && previous !== target) {
      previous.captures.delete(id);
      touchCaptureLoss.push(() => previous.dispatch("lostpointercapture", { pointerId: id }));
    }
    touchOwners.set(id, target);
    target.captures.add(id);
  };
  target.releasePointerCapture = id => {
    target.captures.delete(id);
    touchOwners.delete(id);
    target.dispatch("lostpointercapture", { pointerId: id });
  };
}
function touch(target, type, x, y, id = 1) {
  // Touch starts captured by the hit element. A transfer reports its loss before the next pointer event.
  for (const deliver of touchCaptureLoss.splice(0)) deliver();
  if (type === "pointerdown") target.setPointerCapture(id);
  else target = touchOwners.get(id) || target;
  touchView.pointer(target, type, x, y, { pointerType: "touch", pointerId: id, isPrimary: id === 1 });
  if (type === "pointerup" || type === "pointercancel") touchOwners.get(id)?.releasePointerCapture(id);
}
const pose = () => /translate\(([^p]+)px, ([^p]+)px\) scale\(([^)]+)\)/.exec(touchView.stage.style.transform).slice(1).map(Number);
const near = (a, b) => Math.abs(a - b) < 1e-8;
const [firstX, firstY] = pose();
touch(touchLabel, "pointerdown", 50, 80);
touch(touchLabel, "pointermove", 62, 86);
touch(touchLabel, "pointermove", 74, 92);
touch(touchLabel, "pointermove", 98, 104);
const [dragX, dragY] = pose();
check("touch pan survives loss of a card descendant's implicit capture for the full swipe", near(dragX - firstX, 48) && near(dragY - firstY, 24) && touchViewport.hasPointerCapture(1));
touch(touchLabel, "pointerup", 98, 104);
check("touch drag leaves the selected office alone and suppresses the post-pan click", touchCard.click().defaultPrevented && touchView.node("council").getAttribute("aria-pressed") === "true" && !touchViewport.classList.contains("is-dragging"));
touch(touchLabel, "pointerdown", 50, 80);
touch(touchLabel, "pointermove", 53, 81);
touch(touchLabel, "pointerup", 53, 81);
check("a new touch tap after a pan still selects the tapped office", !touchCard.click().defaultPrevented && touchCard.getAttribute("aria-pressed") === "true");

touchView.button("Fit branch").click();
const [pinchX, pinchY, pinchScale] = pose();
const mapX = (110 - pinchX) / pinchScale, mapY = (100 - pinchY) / pinchScale;
touch(touchLabel, "pointerdown", 80, 100);
touch(touchViewport, "pointerdown", 140, 100, 2);
touch(touchViewport, "pointermove", 60, 120);
touch(touchViewport, "pointermove", 180, 120, 2);
const [zoomX, zoomY, zoomScale] = pose();
check("two-finger spread doubles chart scale and keeps the same content point under the moving midpoint", near(zoomScale, pinchScale * 2) && near(zoomX + mapX * zoomScale, 120) && near(zoomY + mapY * zoomScale, 120));
touch(touchViewport, "pointermove", 280, 120, 2);
check("pinching outward respects the chart's maximum zoom", near(pose()[2], 2));
touch(touchViewport, "pointermove", 60, 120, 2);
check("pinching inward respects the chart's minimum zoom", near(pose()[2], .05));
touch(touchViewport, "pointerup", 60, 120);
const [remainingX, remainingY, remainingScale] = pose();
touch(touchViewport, "pointermove", 71, 133, 2);
const [resumeX, resumeY, resumeScale] = pose();
check("lifting the primary touch leaves the other finger panning smoothly without a scale or position jump", near(resumeX - remainingX, 11) && near(resumeY - remainingY, 13) && near(resumeScale, remainingScale));
touch(touchViewport, "pointercancel", 71, 133, 2);
check("pinch cancellation ends grabbing, releases all capture and does not change the selected office", !touchViewport.hasPointerCapture(1) && !touchViewport.hasPointerCapture(2) && !touchViewport.classList.contains("is-dragging") && touchView.node("council").click().defaultPrevented && touchCard.getAttribute("aria-pressed") === "true");
touchView.dispose();

const expand = p.button("Full screen"), shell = p.one("org-chart-shell"), location = p.one("org-chart-location");
expand.click(); p.flush();
check("full screen uses a labelled modal with the same live chart", p.dialog.open && p.dialog.getAttribute("aria-label") === "Organization chart in full screen" && p.dialog.contains(shell) && p.dialog.contains(p.viewport));
check("all controls and the office inspector remain inside full screen", p.dialog.contains(p.button("Fit branch")) && p.dialog.contains(p.button("Full map")) && p.dialog.contains(p.detail) && p.dialog.contains(p.one("org-toolbar")));
check("expanded state and chart focus are accessible", expand.getAttribute("aria-expanded") === "true" && expand.textContent === "Exit full screen" && p.doc.activeElement === p.viewport);
p.button("List").click();
check("reading view works in full screen and retains a visible close control", p.viewport.hidden && !p.one("org-list").hidden && p.button("Close full screen") && !p.button("Close full screen").hidden);
p.button("Close full screen").click(); p.flush();
check("closing in List restores the shell, selection and visible reading control focus", !p.dialog.open && location.contains(shell) && expand.getAttribute("aria-expanded") === "false" && p.doc.activeElement === p.button("List") && p.node("treasury").getAttribute("aria-pressed") === "true");
p.button("Chart").click(); expand.click(); p.flush();
p.dialog.close(); p.flush(); // The same close event is produced by the browser's native Escape action.
check("native Escape/close returns the chart without losing its reading controls", location.contains(shell) && p.doc.activeElement === expand && !p.viewport.hidden);
check("repeated open and close does not duplicate the chart or toolbar", p.main.all(n => n.classList.contains("org-viewport")).length === 1 && p.main.all(n => n.classList.contains("org-toolbar")).length === 1);
p.dialog.failModal = true; expand.click();
check("a refused modal restores the usable inline chart and reports the failure", !p.dialog.open && location.contains(shell) && p.main.textContent.includes("Full screen could not be opened"));
p.dialog.failModal = false; p.dialog.showModal = undefined; expand.click();
check("unsupported modal browsers keep the inline chart and list", location.contains(shell) && p.main.textContent.includes("Full screen is unavailable") && p.button("List"));

const k = open(), initial = k.stage.style.transform;
check("keyboard arrows still pan and prevent page scrolling", k.viewport.dispatch("keydown", { key: "ArrowRight" }).defaultPrevented && k.stage.style.transform !== initial);
k.viewport.dispatch("keydown", { key: "Home" }); const home = k.stage.style.transform;
k.viewport.dispatch("keydown", { key: "+" });
check("keyboard zoom and fit remain available", k.stage.style.transform !== home && k.viewport.dispatch("keydown", { key: "0" }).defaultPrevented && k.stage.style.transform === home);
before = k.stage.style.transform;
check("ordinary wheel scrolling is left to the page", !k.viewport.dispatch("wheel", { deltaY: -1 }).defaultPrevented && k.stage.style.transform === before);
check("Ctrl-wheel still zooms within the chart", k.viewport.dispatch("wheel", { ctrlKey: true, deltaY: -1, clientX: 100, clientY: 100 }).defaultPrevented && k.stage.style.transform !== before);
const mobile = open({ mobile: true, width: 315 });
// CL2-042 (our 4c7b542): a phone opens the chart (on the branch, see below), not the list; renamed, the map is no longer full.
check("small screens open the chart rather than the list", !mobile.viewport.hidden && mobile.one("org-list").hidden);
mobile.button("Chart").click();
// CL2-042 (our 4c7b542): the chart opens on the High Council branch at a readable scale, on phones too; Full map is one
// click away.
check("mobile Chart keeps the fitted branch when selected", mobile.button("Fit branch").getAttribute("aria-pressed")==="true" && mobile.button("Full map").getAttribute("aria-pressed")==="false");
mobile.button("Full map").click();
check("opening Chart on mobile starts with all offices in a fitted complete overview", visibleIds(mobile).length === chartNodes.length && mobile.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(mobile));
mobile.button("Fit branch").click();
// REV-GOV-6 (our 1b893d5): below 600 px the branch stacks in one column (parent, office, children) with every line on the
// right, so the office and its first children share the first screen. As a property: more than one card shown, all on one
// left edge, each 230 px card and each line inside the canvas, every line right of the column, the canvas within the phone.
check("a narrow chart keeps connected offices readable on its contained pannable canvas", (() => {
  const width = parseFloat(mobile.stage.style.width), cards = mobile.main.all(n => n.getAttribute("data-organization-node") && !n.hidden), left = parseFloat(cards[0]?.style.left);
  const xs = mobile.main.all(n => n.classList.contains("org-edge") && n.style.display !== "none").flatMap(n => [...(n.getAttribute("d") || "").matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(m => Number(m[1])));
  return cards.length > 1 && cards.every(n => parseFloat(n.style.left) === left) && left >= 0 && left + 230 <= width && xs.length > 0 && xs.every(x => x >= left + 230 && x <= width) && width * scaleOf(mobile) <= mobile.viewport.clientWidth;
})() && scaleOf(mobile) >= .85 && !mobile.viewport.hidden);
mobile.button("Full map").click();
check("the narrow full map contains every office within the pannable stage", visibleIds(mobile).length === chartNodes.length && parseFloat(mobile.stage.style.width) >= 680 && boxes(mobile).every(b => b.left >= 0 && b.left + 230 <= parseFloat(mobile.stage.style.width)));
mobile.button("List").click();
mobile.one("org-list").children.find(row => row.children[0].textContent.includes("Membership, tags and review states")).children[0].click(0);
mobile.button("Chart").click();
check("classification groups never acquire command arrows when returning to Chart", visibleIds(mobile).length === chartNodes.length && !mobile.node("membership") && mobile.one("org-chart-shell").textContent.includes("Rank and membership groupings have no command arrows"));
mobile.node("council").click(0); mobile.button("Full screen").click(); mobile.flush();
const drawer = mobile.one("org-detail-drawer"), help = mobile.one("org-chart-help");
check("narrow fullscreen starts with the optional mandate and chart guide collapsed", mobile.dialog.open && !drawer.open && !help.open && mobile.dialog.contains(mobile.detail));
check("the collapsed mandate has a native keyboard disclosure naming the selected office", drawer.children[0].tagName === "SUMMARY" && drawer.children[0].textContent === "Office details · High Council");
mobile.node("treasury").click(0); mobile.flush();
// CL2-047 (our 4c7b542): the treasury node shows its seat's Cabinet title, in the mandate and in the drawer summary.
check("selecting a fullscreen office opens and focuses its complete mandate", drawer.open && mobile.doc.activeElement === mobile.detail && mobile.detail.textContent.includes("Authority and boundaries") && mobile.detail.textContent.includes("Lord High Treasurer · Minister of the Imperial Exchequer") && drawer.children[0].textContent.includes("Lord High Treasurer · Minister of the Imperial Exchequer"));
drawer.open = false; drawer.dispatch("toggle"); mobile.flush();
check("closing the optional mandate keeps the live chart and all reading groups", !drawer.open && !mobile.viewport.hidden && mobile.one("org-list").children.length === data.nodes.length && mobile.node("treasury").getAttribute("aria-pressed") === "true");
const mobileSearch = mobile.doc.getElementById("organization-search"); mobileSearch.value = "Treasury"; mobileSearch.dispatch("input");
check("a fullscreen search exposes its result count and retains full chart guidance", help.open && help.textContent.includes("offices or groups match") && help.textContent.includes("arrow keys") && help.textContent.includes("Escape closes full screen") && help.children[0].tagName === "SUMMARY");
mobile.button("List").click(); mobile.button("Close full screen").click(); mobile.flush();
check("leaving narrow fullscreen restores the inline mandate and visible List focus", drawer.open && help.open && mobile.one("org-chart-location").contains(mobile.one("org-chart-shell")) && mobile.doc.activeElement === mobile.button("List"));
check("text-selection prevention is scoped to the diagram, not the mandate reader", css.includes(".org-viewport,.org-viewport *{-webkit-user-select:none;user-select:none}") && !/\.org-inspector[^}]*user-select/.test(css));
check("narrow fullscreen reserves the workspace for the chart with an optional overlaid mandate", css.includes("height:calc(100dvh - 2rem)") && css.includes("grid-template-rows:minmax(0,1fr);padding-bottom:2.5rem") && css.includes(".org-fullscreen .org-detail-drawer{position:absolute;inset:auto 0 0") && css.includes(".org-fullscreen .org-detail-drawer>summary{display:list-item"));
check("compact fullscreen keeps zoom, branch fit, map and search while hiding only duplicate exit and centering controls", css.includes(".org-fullscreen .org-chart-tools{flex-wrap:nowrap}") && css.includes(".org-fullscreen .org-chart-tools>.org-center-selected,.org-fullscreen .org-chart-tools>button[aria-expanded]{display:none}") && !!mobile.button("Close full screen") && !!mobile.button("Fit branch") && !!mobile.button("Full map"));
check("the organization renderer remains text-only", !/innerHTML|outerHTML|insertAdjacentHTML/.test(source));
console.log(`\n${passed}/${passed + failed} organization view checks passed`);
if (failed) process.exitCode = 1;
// Keep the new wide view's semantic checks in the existing qualified CI leaf.
require('./organization_overview205_test.cjs');
