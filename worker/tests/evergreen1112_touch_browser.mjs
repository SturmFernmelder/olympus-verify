// Evergreen 12 Nov 2026, round 5, area touch: phone touch-target sweep of the whole site on a local QA harness.
// Codex asked (13 Nov 2026) for the known phone-control gap to be closed before signatures: on touch screens and phones
// (`@media (pointer: coarse), (max-width: 720px)`) every standalone control is at least 44 by 44 CSS px.
// Headless Edge through the audit CDP helper; no dependency. For every persona and route listed below it records:
//  - at 390, 375 and 320 px (touch emulated): every visible standalone control under 44 px, with route, selector, size;
//    and every standalone text link that would be under 44 px wide or high if its text were one character (the probe);
//  - at all six widths (1440, 1280, 768, 390, 375, 320): horizontal page overflow;
//  - at 1440, 1280 and 768 px (desktop pointer): the top bar height, the first screen of Home and three dense admin
//    tables, so a run before and a run after can be compared number for number.
// What counts as a control: a[href], button, summary, input (not hidden), select, textarea, [role=button], [role=tab].
// Exempt (WCAG 2.5.8 inline exception), and listed separately: an a[href] without .btn or a role whose computed display is
// `inline` and whose nearest non-inline ancestor keeps at least four words of running text once the text of every link,
// button, tab and summary in it is removed (a link inside a sentence; separators and numbers are not words). Only text on the
// link's own lines counts: text whose nearest non-inline ancestor is a nested block (a heading, paragraph or list beside a
// link placed directly in a section) is left out, so a link on a line of its own is standalone. Text inputs,
// selects and textareas are measured for height only. A checkbox or radio is measured together with its label: the larger
// of the box and the label that activates it.
// Usage: node tests/evergreen1112_touch_browser.mjs --base http://127.0.0.1:63685 --cdp 63686 --out <file.json>
//          [--personas member,officer,owner,treasurer] [--widths 390,375,320] [--routes home,apply]
//        node tests/evergreen1112_touch_browser.mjs --report <before.json> <after.json>   (markdown tables to stdout)
//        node tests/evergreen1112_touch_browser.mjs --assert <after.json> [--before <before.json>]   (exit code = failures)
//        --except-policy-pages leaves out the script-free policy pages (/legal/privacy, /legal/terms and #/data, which opens
//        /privacy/account): their stylesheet, policies.css, is pinned by digest outside this area (handoff to Root).
//        --policy-css <file> (sweep) appends that CSS to the script-free policy pages before measuring (the handoff check).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const list = (name, fallback) => (arg(name, '') || fallback).split(',').filter(Boolean);
const PHONE = [390, 375, 320], DESKTOP = [1440, 1280, 768];
const MIN = 44;

// ---------------------------------------------------------------- in-page measurement (serialised into the page)
const MEASURE = String.raw`(() => {
  const MIN = 44;
  const shown = e => { if (!e.getClientRects().length) return null; const r = e.getBoundingClientRect(); if (r.width < 2 && r.height < 2) return null; const c = getComputedStyle(e); if (c.visibility === 'hidden' || +c.opacity === 0) return null; if (e.closest('[inert], [aria-hidden="true"]')) return null; return r; };
  const cls = e => [...e.classList].slice(0, 3).map(c => '.' + c).join('');
  const sel = e => { const p = e.parentElement; const pd = p ? p.tagName.toLowerCase() + cls(p) : ''; let s = e.tagName.toLowerCase(); if (e.type && e.tagName === 'INPUT') s += '[type=' + e.type + ']'; if (e.getAttribute('role')) s += '[role=' + e.getAttribute('role') + ']'; return (pd ? pd + ' > ' : '') + s + cls(e); };
  const region = e => e.closest('header.topbar') ? 'header' : e.closest('main') ? 'main' : e.closest('footer') ? 'footer' : e.closest('.toasts') ? 'toasts' : 'page';
  const blockOf = e => { let p = e.parentElement; while (p && /^inline/.test(getComputedStyle(p).display) && p !== document.body) p = p.parentElement; return p; };
  // Running text of a block: its text without the text of every link, button, tab and summary inside it; separators and
  // numbers are not words. A link counts as inside a sentence only when its block keeps at least four words of running text,
  // so a strip or list of links ("Raider · Raider guide · Organization chart", "Leader (Guild Master) Rank 1 · Slot 0") is
  // standalone (round 5 review, 13 Nov 2026). Only text on the link's own lines counts: a text node whose nearest non-inline
  // ancestor is a nested block (a heading, paragraph or list beside a link placed directly in a section) is skipped, so a
  // link on a line of its own between two paragraphs is standalone (second round 5 review, 13 Nov 2026).
  const sameBlock = (n, b) => { let q = n.parentElement; while (q && q !== b && /^inline/.test(getComputedStyle(q).display)) q = q.parentElement; return q === b; };
  const runningWords = b => { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n, t = ''; while ((n = w.nextNode())) { if (!sameBlock(n, b)) continue; const c = n.parentElement && n.parentElement.closest('a[href], button, summary, [role=button], [role=tab]'); if (c && b.contains(c)) continue; t += ' ' + n.textContent; } return (t.match(/\p{L}{2,}/gu) || []).length; };
  const inline = e => { if (e.tagName !== 'A' || e.classList.contains('btn') || e.getAttribute('role')) return false; if (getComputedStyle(e).display !== 'inline') return false; const b = blockOf(e); if (!b) return false; return runningWords(b) >= 4; };
  const out = [], inl = [], short = [];
  for (const e of document.querySelectorAll('a[href], button, summary, input:not([type=hidden]), select, textarea, [role=button], [role=tab]')) {
    let r = shown(e); if (!r) continue;
    if (e.closest('details:not([open]) > :not(summary)')) continue;
    const kind = e.matches('input[type=checkbox], input[type=radio]') ? 'check' : e.matches('input, select, textarea') ? 'field' : 'control';
    let w = r.width, h = r.height;
    if (kind === 'check') { const labels = [...(e.labels || [])].map(shown).filter(Boolean); for (const l of labels) if (Math.min(l.width, l.height) > Math.min(w, h)) { w = l.width; h = l.height; } }
    if (e.matches('input[type=checkbox], input[type=radio]') === false && e.tagName === 'INPUT' && /^(button|submit|reset|image)$/.test(e.type)) { /* a button input is a control */ }
    const small = kind === 'field' && !/^(button|submit|reset|image)$/.test(e.type || '') ? h < MIN - 0.5 : (h < MIN - 0.5 || w < MIN - 0.5);
    const rec = { region: region(e), selector: sel(e), text: ((e.getAttribute('aria-label') || e.textContent || e.value || e.placeholder || '').replace(/\s+/g, ' ').trim()).slice(0, 40), w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, kind };
    if (inline(e)) { if (h < MIN - 0.5) inl.push(rec); continue; }
    if (small) out.push(rec);
    // One-character probe (13 Nov 2026, Codex's observation on a short event title): a standalone link whose only child is
    // text is measured again with the text "I" and then restored at once. Its box must stay 44 px both ways whatever the
    // text says, because some link texts are data (an event title, a character name).
    if (e.tagName === 'A' && e.childNodes.length === 1 && e.firstChild.nodeType === 3) {
      const t = e.firstChild, old = t.nodeValue; t.nodeValue = 'I';
      const q = e.getBoundingClientRect(); t.nodeValue = old;
      if (q.width < MIN - 0.5 || q.height < MIN - 0.5) short.push({ ...rec, w: Math.round(q.width * 10) / 10, h: Math.round(q.height * 10) / 10, kind: 'short' });
    }
  }
  const de = document.documentElement;
  return { small: out, inline: inl, short, overflow: de.scrollWidth - de.clientWidth, h1: (document.querySelector('main h1') || {}).textContent || null, hash: location.hash, path: location.pathname };
})()`;

const OVERFLOW = String.raw`(() => { const de = document.documentElement; const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > de.clientWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map(c => '.' + c).join('') + ' right=' + Math.round(e.getBoundingClientRect().right)); return { overflow: de.scrollWidth - de.clientWidth, wide }; })()`;

const DENSITY_HOME = String.raw`(() => { const t = document.querySelector('header.topbar'); const main = document.querySelector('main'); const rows = []; const walk = (e, d) => { for (const c of e.children) { const r = c.getBoundingClientRect(); if (!r.height || r.top > innerHeight) continue; rows.push(c.tagName.toLowerCase() + [...c.classList].slice(0, 2).map(x => '.' + x).join('') + '@' + Math.round(r.top) + '+' + Math.round(r.height)); if (d < 2) walk(c, d + 1); } }; if (main) walk(main, 0); return { topbar: t ? Math.round(t.getBoundingClientRect().height * 10) / 10 : null, mainTop: main ? Math.round(main.getBoundingClientRect().top) : null, firstScreen: rows.slice(0, 40) }; })()`;
const DENSITY_TABLE = String.raw`(() => { const t = [...document.querySelectorAll('main table')].filter(x => x.getClientRects().length).sort((a, b) => b.rows.length - a.rows.length)[0]; if (!t) return null; const r = t.getBoundingClientRect(); const body = [...t.querySelectorAll('tbody tr')].slice(0, 20).map(x => Math.round(x.getBoundingClientRect().height * 10) / 10); return { caption: (t.caption && t.caption.textContent.trim().slice(0, 40)) || t.getAttribute('aria-label') || null, rows: t.rows.length, height: Math.round(r.height), firstRows: body, controls: [...t.querySelectorAll('button, a.btn, select, input')].slice(0, 6).map(e => Math.round(e.getBoundingClientRect().height)) }; })()`;

async function sweep() {
  const BASE = arg('--base', 'http://127.0.0.1:63685'), CDP_PORT = Number(arg('--cdp', '63686')), OUT = arg('--out', null);
  if (!/^http:\/\/127\.0\.0\.1:6368[0-9]$|^http:\/\/127\.0\.0\.1:6369[0-9]$/.test(BASE)) throw Error('the touch sweep runs against a local Claude harness only');
  const HELPER = arg('--cdp-helper', 'C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs');
  const { launch, instrument, idle, viewport, sleep } = await import(pathToFileURL(HELPER).href);
  const personas = list('--personas', 'member,officer,owner,treasurer');
  const widths = list('--widths', [...DESKTOP, ...PHONE].join(',')).map(Number);
  const onlyRoutes = list('--routes', '');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'touch-edge-'));
  const cdp = await launch({ port: CDP_PORT, profile });
  const st = await instrument(cdp);
  const ev = expr => cdp.eval(expr);
  const started = Date.now();
  const result = { base: BASE, at: new Date().toISOString(), widths, personas, pages: [], density: [], errors: [] };
  // --policy-css <file> appends that CSS to the script-free policy pages before they are measured, so the policies.css
  // handoff to Root can be checked before Root applies it and re-pins the file (the served file stays untouched).
  const POLICY_CSS = arg('--policy-css', null) ? fs.readFileSync(arg('--policy-css'), 'utf8') : null;
  result.policyCss = POLICY_CSS ? { file: arg('--policy-css'), bytes: Buffer.byteLength(POLICY_CSS) } : null;
  // The policy pages' CSP allows only the served stylesheet, so the browser is told to skip CSP for this measuring run only.
  if (POLICY_CSS) await cdp.send('Page.setBypassCSP', { enabled: true });
  const go = async (hashOrPath, wait = 500) => {
    if (hashOrPath.startsWith('/')) { await cdp.send('Page.navigate', { url: BASE + hashOrPath }); }
    else { await ev(`location.hash = ${JSON.stringify('#/' + hashOrPath)}; 0`); }
    await idle(st, { quiet: 300, max: 6000 }); await sleep(wait);
    if (POLICY_CSS) await ev(`(() => { if (!document.body.classList.contains('olympus-policy') || document.getElementById('touch-policy-css')) return 0; const s = document.createElement('style'); s.id = 'touch-policy-css'; s.textContent = ${JSON.stringify(POLICY_CSS)}; document.head.append(s); return 1; })()`);
  };
  const atWidth = async w => { await viewport(cdp, w, w >= 768 ? 900 : 800); await cdp.send('Page.reload', {}); await idle(st); await sleep(400); };
  try {
    for (const who of personas) {
      await cdp.send('Page.navigate', { url: `${BASE}/__qa/${who}` }); await idle(st);
      await cdp.send('Page.navigate', { url: `${BASE}/#/` }); await idle(st); await sleep(600);
      // The route list is read from the page itself: every Community section and every Admin tab the persona can open.
      const community = await (async () => { await go('community', 700); return ev(`[...document.querySelectorAll('nav[aria-label="Community sections"] a')].map(a => a.getAttribute('href').slice(2))`); })();
      let admin = [];
      if (who === 'owner') { await go('admin', 900); admin = await ev(`[...new Set([...document.querySelectorAll('nav[aria-label="Admin sections"] a')].map(a => a.getAttribute('href')))].filter(h => h.startsWith('#/')).map(h => h.slice(2))`); }
      const base = who === 'treasurer' ? ['treasury-plan'] : ['', 'apply', 'vote', 'roles', 'governance', 'organization', ...community, 'news', 'guides', 'talents', 'data', 'treasury-plan', ...admin, '/legal/privacy', '/legal/terms', 'legal/privacy'];
      const routes = [...new Set(base)].filter(r => !onlyRoutes.length || onlyRoutes.includes(r || 'home'));
      for (const w of widths) {
        await cdp.send('Page.navigate', { url: `${BASE}/#/` }); await idle(st);
        await atWidth(w);
        for (const route of routes) {
          try {
            if (route.startsWith('/')) await go(route, 400);
            else { if (await ev('location.pathname') !== '/') { await cdp.send('Page.navigate', { url: `${BASE}/#/` }); await idle(st); await sleep(400); } await go(route, route.startsWith('admin') ? 900 : 600); }
            const page = { persona: who, width: w, route: route || 'home' };
            if (PHONE.includes(w)) {
              const first = await ev(MEASURE);
              // Controls inside closed disclosures count too: open every closed <details> in the page body and measure again.
              const opened = await ev(`(() => { let n = 0; for (const d of document.querySelectorAll('main details:not([open]), body.olympus-policy details:not([open])')) { d.open = true; n++; } return n; })()`);
              let second = { small: [], inline: [], short: [] };
              if (opened) { await idle(st, { quiet: 300, max: 4000 }); await sleep(350); second = await ev(MEASURE); }
              const key = x => x.region + '|' + x.selector + '|' + x.text + '|' + x.w + 'x' + x.h;
              const merge = (a, b) => { const m = new Map(); for (const x of [...a, ...b]) m.set(key(x), x); return [...m.values()]; };
              Object.assign(page, { small: merge(first.small, second.small), inline: merge(first.inline, second.inline), short: merge(first.short || [], second.short || []), overflow: Math.max(first.overflow, second.overflow || 0), h1: first.h1, opened });
            } else {
              Object.assign(page, await ev(OVERFLOW));
            }
            if (page.overflow > 0 && !page.wide) page.wide = (await ev(OVERFLOW)).wide;
            result.pages.push(page);
          } catch (error) { result.errors.push({ persona: who, width: w, route, error: String(error).slice(0, 300) }); }
        }
        if (DESKTOP.includes(w) && (who === 'member' || who === 'owner')) {
          await cdp.send('Page.navigate', { url: `${BASE}/#/` }); await idle(st); await sleep(800);
          const d = { persona: who, width: w, home: await ev(DENSITY_HOME), tables: {} };
          if (who === 'owner') for (const t of ['admin/applications', 'admin/audit', 'admin/community']) { await go(t, 1100); d.tables[t] = await ev(DENSITY_TABLE); }
          result.density.push(d);
        }
      }
    }
  } finally { await cdp.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may hold it briefly */ } }
  result.exceptions = st.exceptions.slice(0, 10);
  result.seconds = Math.round((Date.now() - started) / 1000);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  const small = result.pages.reduce((n, p) => n + (p.small ? p.small.length : 0), 0), over = result.pages.filter(p => p.overflow > 0).length;
  console.log(`pages ${result.pages.length}, small controls ${small}, pages with overflow ${over}, errors ${result.errors.length}, ${result.seconds}s${OUT ? ' -> ' + OUT : ''}`);
}

// ---------------------------------------------------------------- report and assertions over saved sweeps
// 'a.json+b.json' joins sweeps: pages and errors add up; a later density row replaces an earlier one for the same persona and width
// (a density-only run is a sweep with --routes none).
const load = spec => spec.split('+').map(f => JSON.parse(fs.readFileSync(f, 'utf8'))).reduce((a, b) => ({ ...a, pages: [...a.pages, ...b.pages], errors: [...a.errors, ...b.errors],
  density: [...a.density.filter(d => !b.density.some(x => x.persona === d.persona && x.width === d.width)), ...b.density] }));
// One row per distinct control (region, selector, text): the routes, personas and widths it was seen on, and its smallest size.
function group(sweepResult) {
  const m = new Map();
  for (const p of sweepResult.pages) for (const x of p.small || []) {
    const k = x.region === 'header' ? `header|${x.selector}|${x.text}` : `${p.route}|${x.selector}|${x.text}`;
    const g = m.get(k) || { route: x.region === 'header' ? '(header, every route)' : p.route, selector: x.selector, text: x.text, kind: x.kind, minW: Infinity, minH: Infinity, personas: new Set(), widths: new Set(), n: 0 };
    g.minW = Math.min(g.minW, x.w); g.minH = Math.min(g.minH, x.h); g.personas.add(p.persona); g.widths.add(p.width); g.n++; m.set(k, g);
  }
  return [...m.values()].sort((a, b) => a.route.localeCompare(b.route) || a.selector.localeCompare(b.selector));
}
const cell = s => String(s).replace(/\|/g, '\\|');
// The report folds controls that differ only in their text into one row per (route, selector), with examples and a count.
function table(rows) {
  const m = new Map();
  for (const g of rows) {
    const k = g.route + '|' + g.selector;
    const t = m.get(k) || { route: g.route, selector: g.selector, texts: new Set(), personas: new Set(), widths: new Set(), minW: Infinity, minH: Infinity };
    t.texts.add(g.text); for (const p of g.personas) t.personas.add(p); for (const w of g.widths) t.widths.add(w);
    t.minW = Math.min(t.minW, g.minW); t.minH = Math.min(t.minH, g.minH); m.set(k, t);
  }
  const out = ['| Route | Selector | Controls (examples) | Size (min w x h) | Personas | Widths |', '|---|---|---|---|---|---|'];
  for (const g of m.values()) out.push(`| ${cell(g.route)} | \`${cell(g.selector)}\` | ${g.texts.size}: ${cell([...g.texts].slice(0, 2).map(t => '"' + t + '"').join(', '))} | ${g.minW} x ${g.minH} | ${[...g.personas].join(', ')} | ${[...g.widths].join(', ')} |`);
  return { rows: m.size, text: out.join('\n') };
}
function overflowRows(sweepResult) { return sweepResult.pages.filter(p => p.overflow > 0).map(p => `| ${p.persona} | ${p.width} | ${cell(p.route)} | ${p.overflow} | ${cell((p.wide || []).join('; '))} |`); }
function report(beforeFile, afterFile) {
  const b = load(beforeFile), a = load(afterFile);
  const out = [];
  for (const [name, r] of [['Before', b], ['After', a]]) {
    const g = group(r);
    const t = table(g);
    out.push(`## ${name}: ${r.base} (${r.at}), ${r.pages.length} page measurements, ${g.length} distinct controls under ${MIN} px in ${t.rows} (route, selector) rows`, '', g.length ? t.text : '(none)', '');
    const o = overflowRows(r);
    out.push(`### ${name}: horizontal overflow (${o.length} page measurements over 0 px)`, '', o.length ? ['| Persona | Width | Route | Overflow px | Widest elements |', '|---|---|---|---|---|', ...o].join('\n') : '(none at any of the six widths)', '');
  }
  out.push('## Desktop density (1440, 1280, 768 px; before -> after)', '', '| Persona | Width | Measure | Before | After | Same |', '|---|---|---|---|---|---|');
  for (const d of a.density) {
    const o = b.density.find(x => x.persona === d.persona && x.width === d.width); if (!o) continue;
    const row = (k, x, y) => out.push(`| ${d.persona} | ${d.width} | ${k} | ${cell(x)} | ${cell(y)} | ${x === y ? 'yes' : 'NO'} |`);
    row('top bar height px', o.home.topbar, d.home.topbar);
    row('Home first screen (blocks, top+height)', `${o.home.firstScreen.length} blocks, last ${o.home.firstScreen.at(-1) || '-'}`, `${d.home.firstScreen.length} blocks, last ${d.home.firstScreen.at(-1) || '-'}`);
    { const same = JSON.stringify(o.home.firstScreen) === JSON.stringify(d.home.firstScreen); row('Home first screen, every block (top+height)', o.home.firstScreen.length + ' blocks', same ? o.home.firstScreen.length + ' blocks' : 'differs'); }
    for (const t of Object.keys(d.tables)) {
      const x = o.tables[t], y = d.tables[t];
      row(`${t} table height px (rows)`, x ? `${x.height} (${x.rows})` : 'none', y ? `${y.height} (${y.rows})` : 'none');
      row(`${t} first row heights`, x ? x.firstRows.slice(0, 5).join('/') : 'none', y ? y.firstRows.slice(0, 5).join('/') : 'none');
    }
  }
  const inl = new Map(); for (const p of a.pages) for (const x of p.inline || []) inl.set(`${p.route}|${x.selector}`, x);
  out.push('', `## Inline links treated as exempt in the after run (WCAG 2.5.8 inline exception): ${inl.size} distinct (route, selector)`, '', '| Route and selector | Example text | Height |', '|---|---|---|', ...[...inl].slice(0, 60).map(([k, x]) => `| \`${cell(k)}\` | ${cell(x.text)} | ${x.h} |`));
  console.log(out.join('\n'));
}
function assert(afterFile, beforeFile) {
  const a = load(afterFile), b = beforeFile ? load(beforeFile) : null;
  let fails = 0;
  const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 1500)}`); };
  const policyPages = new Set(['/legal/privacy', '/legal/terms', 'data']);
  const g = group(a).filter(x => !(argv.includes('--except-policy-pages') && policyPages.has(x.route)));
  const routes = new Set(a.pages.map(p => p.route)), phones = new Set(a.pages.filter(p => p.small).map(p => p.width));
  check('the sweep covered at least 30 routes at 390, 375 and 320 px for member, officer and owner', routes.size >= 30 && [390, 375, 320].every(w => phones.has(w)) && ['member', 'officer', 'owner'].every(p => a.personas.includes(p)), { routes: routes.size, phones: [...phones] });
  check('the sweep finished without page errors', a.errors.length === 0, a.errors.slice(0, 3));
  check(`no standalone control under ${MIN} px at 390, 375 and 320 px${argv.includes('--except-policy-pages') ? ' (script-free policy pages excepted)' : ''}`, g.length === 0, g.slice(0, 12).map(x => `${x.route} ${x.selector} "${x.text}" ${x.minW}x${x.minH}`));
  // The one-character probe: absent from a sweep made before the probe existed, which is a failure here, not a pass.
  const probed = a.pages.filter(p => p.small).every(p => Array.isArray(p.short));
  const shortRows = new Map();
  for (const p of a.pages) for (const x of p.short || []) { if (argv.includes('--except-policy-pages') && policyPages.has(p.route)) continue; const k = (x.region === 'header' ? '(header)' : p.route) + ' ' + x.selector; if (!shortRows.has(k)) shortRows.set(k, `${k} "${x.text}" ${x.w}x${x.h}`); }
  check(`every standalone text link keeps ${MIN} px both ways with a one-character text at 390, 375 and 320 px`, probed && shortRows.size === 0, probed ? [...shortRows.values()].slice(0, 20) : 'this sweep has no one-character probe');
  const over = a.pages.filter(p => p.overflow > 0);
  check('no horizontal page overflow on any measured route at 1440, 1280, 768, 390, 375 and 320 px', over.length === 0, over.slice(0, 8).map(p => `${p.persona}@${p.width} ${p.route} +${p.overflow} ${(p.wide || []).join(';')}`));
  if (b) {
    const diffs = [];
    for (const d of a.density) {
      const o = b.density.find(x => x.persona === d.persona && x.width === d.width); if (!o) { diffs.push(`${d.persona}@${d.width}: no before`); continue; }
      if (o.home.topbar !== d.home.topbar) diffs.push(`${d.persona}@${d.width} topbar ${o.home.topbar}->${d.home.topbar}`);
      if (JSON.stringify(o.home.firstScreen) !== JSON.stringify(d.home.firstScreen)) diffs.push(`${d.persona}@${d.width} home first screen differs`);
      for (const t of Object.keys(d.tables)) if (JSON.stringify(o.tables[t]) !== JSON.stringify(d.tables[t])) diffs.push(`${d.persona}@${d.width} ${t} ${JSON.stringify(o.tables[t])} -> ${JSON.stringify(d.tables[t])}`);
    }
    check('at 1440, 1280 and 768 px the top bar, the first screen of Home and three dense admin tables measure exactly as before', diffs.length === 0 && a.density.length >= 6, diffs.slice(0, 6));
  }
  process.exitCode = fails;
}

if (argv.includes('--report')) report(argv[argv.indexOf('--report') + 1], argv[argv.indexOf('--report') + 2]);
else if (argv.includes('--assert')) assert(arg('--assert'), arg('--before', null));
else await sweep();
