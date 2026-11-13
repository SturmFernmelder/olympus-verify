// .228 launch transition: the guide copy must stay true on both sides of Blizzard's global launch,
// Wednesday 4 November 2026 at 3:00 PM PST (23:00 UTC). The fix may ship before or after that moment, so the
// guides may neither promise the launch ("launches", "at launch", "goes live") nor claim it already happened.
// Evergreen Stage 1 findings CL-019, CL-072, CL-079, CL-163, CL-285 and CL-299 (4 Nov 2026); owner directive
// P3.1 (retire or transition phase references) and P2 (each disclaimer once per page).
// Renders the actual guides218.js over the actual guides218.json with the minimal DOM of guides218_test.cjs.
// Pure local computation: no Worker, browser session, provider, network or account action.
// Run from worker/: node tests/guides_launch_transition228_test.cjs
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const stat = path.join(__dirname, '..', 'public/static');
const SOURCE = fs.readFileSync(path.join(stat, 'guides218.js'), 'utf8');
const DATA = JSON.parse(fs.readFileSync(path.join(stat, 'guides218.json'), 'utf8'));
const talents = JSON.parse(fs.readFileSync(path.join(stat, 'talents/data.json'), 'utf8'));
let passed = 0, failed = 0;
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name + (detail ? '\n     ' + detail : '')); }
};
const clone = v => JSON.parse(JSON.stringify(v));
const short = s => (s.length > 160 ? s.slice(0, 157) + '...' : s);

// ---- minimal DOM (same shape as guides218_test.cjs) ----
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
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '') this.appendChild(new Text(this.ownerDocument, v)); }
  all(pred) { const out = []; const walk = n => { for (const c of n.childNodes) if (c instanceof El) { if (pred(c)) out.push(c); walk(c); } }; walk(this); return out; }
  tags(tag) { return this.all(e => e.tagName === tag.toUpperCase()); }
}
function page(data) {
  const doc = { createElement: tag => new El(doc, tag), createTextNode: text => new Text(doc, text) };
  const fetch = async () => ({ ok: true, status: 200, json: async () => clone(data) });
  const context = { document: doc, fetch, console, Object, JSON, Number, String, Array, Set, Map, Math, Error, Promise, encodeURIComponent };
  context.window = context;
  vm.runInNewContext(SOURCE, context, { filename: 'guides218.js', timeout: 2000 });
  return { api: context.OlympusGuides, box: doc.createElement('main') };
}
const settle = () => new Promise(r => setTimeout(r, 5));
async function render(options) {
  const p = page(DATA); p.api.mount(p.box, { ...options, talentRevision: talents.revision }); await settle(); await settle();
  return p.box;
}
// Everything a member can read: every text node plus the tooltip and label attributes, one string each.
function strings(node, skip) {
  const out = [];
  const walk = n => {
    if (n instanceof Text) { out.push(n.data); return; }
    if (skip && skip(n)) return;
    for (const k of ['title', 'aria-label', 'alt', 'placeholder']) if (Object.hasOwn(n.attributes, k)) out.push(n.attributes[k]);
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
  return out;
}
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

// Wording that frames Blizzard's launch as still ahead: stale from 23:00 UTC on 4 Nov 2026.
const FUTURE = [/\blaunches\b/i, /\bat launch\b/i, /\bbefore launch\b/i, /\buntil launch\b/i, /\bgo(?:es)? live\b/i,
  /\bwill (?:launch|go live|be live)\b/i, /\barrives at launch\b/i, /\blaunching\b/i, /\bupcoming launch\b/i, /\bonce (?:the game|Forever) is live\b/i];
// Wording that says the launch already happened: false if this ships before 23:00 UTC.
const PAST = [/\blaunched\b/i, /\bwent live\b/i, /\bnow live\b/i, /\bhas gone live\b/i];
const hits = (text, patterns) => patterns.map(re => re.exec(text)).filter(Boolean).map(m => '"' + m[0] + '"');
// The page-level scope disclaimers. They belong in the header scope note and nowhere else on a page.
const DISCLAIMER = [/stopped at level 30/i, /\bmay (?:still )?change\b/i, /\blive (?:game|tuning) may differ\b/i];

const routes = [
  { kind: 'hub', name: 'hub #/resources', options: { view: 'hub' } },
  ...DATA.classes.map(c => ({ kind: 'class', name: 'class #/guides/class/' + c.id, options: { view: 'class', classId: c.id } })),
  ...DATA.classes.flatMap(c => c.specs.map(s => ({ kind: 'spec', name: 'spec #/guides/class/' + c.id + '/' + s.id, options: { view: 'class', classId: c.id, specId: s.id } }))),
  ...DATA.professions.map(p => ({ kind: 'profession', name: 'profession #/guides/profession/' + p.key, options: { view: 'profession', profession: p.key } })),
  ...['attunements', 'buffs', 'raid-structure', 'changes'].map(t => ({ kind: 'tool', name: 'tool #/guides/tools/' + t, options: { view: 'tool', tool: t } })),
];

(async () => {
  // 1. The catalogue still passes the renderer's closed validator.
  let valid = false; try { valid = !!page(DATA).api.validate(clone(DATA), talents.revision); } catch { valid = false; }
  check('the catalogue passes the closed validator for the pinned talent snapshot', valid);

  // 2. The scope note itself (CL-019, CL-072, CL-079, CL-163, CL-285, CL-299).
  const note = DATA.scopeNote;
  const sentences = note.split(/(?<=[.!?])\s+/).filter(Boolean);
  // Evergreen 12 Nov 2026 (CL2-173): Forever launched on 4 November, so the note states that once in the past tense; the
  // tense-neutral rule above only guarded a release shipped before 23:00 UTC that day.
  check('CL-019/CL-299/CL2-173 the scope note states the launch once, as past, and frames nothing as still ahead', !hits(note, FUTURE).length && occurrences(note, 'Forever launched worldwide on 4 November 2026') === 1,
    sentences.length + ' sentences; phrases ' + (hits(note, [...FUTURE, ...PAST]).join(', ') || 'none') + ' :: ' + short(note));
  check('the scope note dates the global launch as 4 November 2026, 23:00 UTC', note.includes('4 November 2026') && note.includes('23:00 UTC'), short(note));
  check('the scope note names the 16 October 2026 beta snapshot and its exact client build ' + DATA.talentClientBuild,
    note.includes('16 October 2026') && note.includes(DATA.talentClientBuild), short(note));
  check('CL-019 the scope note carries the whole beta caveat once: the level-30 limit and that the live game may differ',
    occurrences(note, 'stopped at level 30') === 1 && (note.match(/may differ/g) || []).length === 1 && !/may (?:still )?change/i.test(note), short(note));

  // 3. Every route, rendered.
  const rendered = [];
  for (const r of routes) rendered.push({ ...r, box: await render(r.options) });
  const failedRender = rendered.filter(r => r.box.tags('h1').length !== 1);
  check('all ' + routes.length + ' guide routes render a page with one heading', failedRender.length === 0, failedRender.map(r => r.name).join(', '));
  for (const r of rendered) {
    const found = [...new Set(strings(r.box).flatMap(s => hits(s, FUTURE).map(h => h + ' in "' + short(s) + '"')))];
    check('CL-072/CL-079 ' + r.name + ': no member-visible string frames the launch as still ahead', found.length === 0, found.slice(0, 4).join('\n     '));
  }
  const launchRow = DATA.tools.whatChanged.find(x => /^(?:global )?launch$/i.test(x.topic));
  const pastFound = rendered.flatMap(r => strings(r.box).filter(s => s !== note && s !== launchRow?.text).flatMap(s => hits(s, PAST).map(h => r.name + ' ' + h + ' in "' + short(s) + '"')));
  check('CL2-173 past-tense launch wording appears only in the dated scope note and the launch row', pastFound.length === 0, pastFound.slice(0, 4).join('\n     '));

  // 4. The scope note renders exactly once per page, in the page header (hub, one class, one spec, one profession, one tool).
  const once = r => {
    const joined = strings(r.box).join(' '), heads = r.box.tags('header');
    return occurrences(joined, note) === 1 && heads.length === 1 && heads[0].all(e => e.tagName === 'P' && e.textContent === note).length === 1;
  };
  for (const name of ['hub #/resources', 'class #/guides/class/paladin', 'spec #/guides/class/mage/frost', 'profession #/guides/profession/alchemy', 'tool #/guides/tools/changes']) {
    const r = rendered.find(x => x.name === name);
    check('the scope note renders exactly once, in the header: ' + name, !!r && once(r));
  }
  const notOnce = rendered.filter(r => !once(r));
  check('the scope note renders exactly once, in the header, on every one of the ' + rendered.length + ' guide routes', notOnce.length === 0, notOnce.map(r => r.name).join(', '));

  // 5. Each disclaimer once per page: no page restates the scope caveat outside its header (CL-019, P2).
  const restated = rendered.flatMap(r => strings(r.box, n => n.tagName === 'HEADER').flatMap(s => hits(s, DISCLAIMER).map(h => r.name + ' ' + h + ' in "' + short(s) + '"')));
  check('CL-019 no guide page restates the beta caveat below its header', restated.length === 0, restated.length + ' restatements, e.g.\n     ' + restated.slice(0, 5).join('\n     '));
  const RESTATE = /beta (?:talent )?snapshot|pinned beta|\(build 1\.60|client build|1\.60\.1\.70425|level 30|above 30|level 60 was never|never in the beta|may (?:still )?change|provisional|untested/i;
  const closers = [
    ...DATA.classes.flatMap(c => c.overview.map((t, i) => ['classes.' + c.id + '.overview[' + i + ']', t])),
    ...DATA.professions.flatMap(p => p.overview.map((t, i) => ['professions.' + p.key + '.overview[' + i + ']', t])),
    ['tools.preBis.note', DATA.tools.preBis.note],
  ].filter(([, t]) => RESTATE.test(t));
  check('CL-019 class and profession overviews and the pre-raid note no longer restate the snapshot, build or level-30 caveat',
    closers.length === 0, closers.length + ' strings, e.g.\n     ' + closers.slice(0, 5).map(([p, t]) => p + ': ' + short(t)).join('\n     '));

  // 6. The compendium launch row is a dated fact, true either side of 23:00 UTC (CL-079, CL-163, CL-285, CL-299).
  const launchRows = DATA.tools.whatChanged.filter(x => /^(?:global )?launch$/i.test(x.topic));
  const row = launchRows[0];
  check('CL-285/CL2-173 the compendium launch row is a live, dated past fact: 4 November 2026 at 23:00 UTC',
    launchRows.length === 1 && row.status === 'live' && row.text.startsWith('Forever launched') && row.text.includes('4 November 2026') && row.text.includes('23:00 UTC') && !hits(row.topic + ' ' + row.text, FUTURE).length,
    row ? short(row.topic + ': ' + row.text) : 'no launch row');
  const changes = rendered.find(r => r.name === 'tool #/guides/tools/changes').box;
  const announced = changes.tags('section').find(s => s.tags('h2').some(h => h.textContent === 'Live in the game'));
  check('the dated launch row renders under "Live in the game" on #/guides/tools/changes',
    !!row && !!announced && announced.tags('dt').some(dt => dt.textContent === row.topic && dt.parentNode.childNodes[dt.parentNode.childNodes.indexOf(dt) + 1].textContent.startsWith(row.text)));

  // 7. The whole catalogue, including strings that render only after a choice. Source labels are excluded: they are
  // the publishers' own headlines, quoted for provenance, and guides218.js renders only the publisher name.
  const all = [];
  (function walk(v, p) {
    if (typeof v === 'string') all.push([p, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!(p === '$' && k === 'sources')) walk(x, p + '.' + k);
  })(DATA, '$');
  const stale = all.filter(([, s]) => hits(s, FUTURE).length);
  check('CL-163 no catalogue string frames the launch as still ahead (at launch, goes live, arrives at launch, launches, once the game is live)',
    stale.length === 0, stale.length + ' strings:\n     ' + stale.map(([p, s]) => p + ' ' + hits(s, FUTURE).join(' ')).join('\n     '));
  const early = all.filter(([, s]) => s !== note && s !== row?.text && hits(s, PAST).length);
  check('CL2-173 only the scope note and the launch row say the launch happened', early.length === 0, early.slice(0, 4).map(([p, s]) => p + ': ' + short(s)).join('\n     '));
  const dated = all.filter(([, s]) => /\b4 Nov(?:ember)?\b|\bNov(?:ember)? 4\b|3:00 PM PST/i.test(s));
  const wrong = dated.filter(([, s]) => !(s.includes('4 November 2026') && s.includes('23:00 UTC')));
  check('wherever the guides state the launch, it is 4 November 2026 at 23:00 UTC', dated.length >= 2 && wrong.length === 0,
    dated.length + ' dated strings; mismatched: ' + wrong.map(([p, s]) => p + ': ' + short(s)).join(' | '));

  console.log('\n' + (passed + failed) + ' checks: ' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
