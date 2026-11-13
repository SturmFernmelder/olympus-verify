'use strict';
// Evergreen 12 Nov 2026, lane siteui-b: accessibility, the shell at six widths, and stale dates and facts.
// Plain Node, no dependency. Two parts:
//  1. Source and module checks against a worktree (ROOT): the Worker modules are transpiled with the repo's own
//     TypeScript and called; JSON and copy are read from the tree.
//  2. Browser checks against a local QA harness (BASE) through the audit CDP helper (headless Edge), with numbers.
// Usage: node tests/evergreen1112_siteui-b_test.cjs [--root <worktree>] [--base http://127.0.0.1:63696] [--cdp 63697] [--only CL2-xxx,...]
// Each check prints PASS or FAIL with its measurement; the exit code is the number of failures.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), Module = require('node:module');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..', '..')));
const BASE = arg('--base', 'http://127.0.0.1:63696');
const CDP_PORT = Number(arg('--cdp', '63697'));
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const CDP_HELPER = 'file:///C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs';
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));
const results = [];
const check = (id, name, ok, detail) => { results.push({ id, name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail === undefined ? '' : ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))}`); };
const want = id => !ONLY.length || ONLY.includes(id);
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Transpile one Worker module (and its relative imports) from ROOT into CommonJS in memory.
function loadTs(rel) {
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file).exports;
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const m = new Module(file); m.filename = file; cache.set(file, m);
    m.require = spec => spec.startsWith('.') ? load(path.resolve(path.dirname(file), spec.replace(/\.js$/, '') + (spec.endsWith('.ts') ? '' : '.ts'))) : require(spec);
    new Function('exports', 'require', 'module', '__filename', '__dirname', code)(m.exports, m.require, m, file, path.dirname(file));
    return m.exports;
  };
  return load(path.join(ROOT, rel));
}

async function sourceChecks() {
  const app = src('worker/public/static/app.js');
  if (want('CL2-103')) {
    const plainLoading = (app.match(/h\("p", \{ class: "muted(?: small)?", text: "Loading…" \}\)/g) || []).length;
    check('CL2-103', 'every "Loading…" placeholder is a status region', plainLoading === 0, { withoutRole: plainLoading });
    const bar = /class: "notice receipt-bar"[^}]*role: "status"/.test(app);
    check('CL2-103', 'the roster receipt bar is a status region', bar);
  }
  if (want('CL2-173')) {
    check('CL2-173', 'the attach notice says "talent build", not "beta build"', !/beta build/.test(app) && /talent build\./.test(app));
    check('CL2-173', 'the member guide no longer says "Prepare for Forever"', !app.includes('"Prepare for Forever"'));
  }
  if (want('CL2-309')) check('CL2-309', 'the Town Crier help names OLYMPUS PRIME', !app.includes('room in Olympus I,') && app.includes('room in OLYMPUS PRIME'));
  if (want('CL2-174') || want('CL2-177')) {
    const intros = src('worker/src/intros.ts');
    if (want('CL2-174')) {
      check('CL2-174', 'the at-a-glance intro has no Beta or name-reservation field', !/name: "Beta"/.test(intros) && !/name: "Early name reservation"/.test(intros));
      check('CL2-174', 'the intro leads with the launch as past', /name: "Launched"/.test(intros) && !/checked October 26, 2026\. Announcements/.test(intros));
      check('CL2-174', 'the resources embed no longer links the beta shutdown or reservation hours', !/LINKS\.betaClosure\}/.test(intros) && !/LINKS\.nameReservation\}/.test(intros));
    }
    if (want('CL2-177')) {
      const json = src('worker/public/static/resources169.json');
      const future = [/raids unlock on 9 Dec/, /those raids unlock on/, /raids unlock on December 9/, /value: "Unlock December 9, 2026\."/].filter(re => re.test(intros + json)).map(String);
      check('CL2-177', 'raid-unlock sentences in the intro and catalogue are dated facts, not future tense', future.length === 0, future);
    }
  }
  if (want('CL2-178')) {
    const json = src('worker/public/static/resources169.json');
    const zygor = (json.match(/[^"]*coming soon[^"]*/gi) || []).filter(t => /zygor|Forever product|review date|advertises the product/i.test(t));
    check('CL2-178', 'Zygor is no longer described as coming soon', zygor.length === 0 && /Status": "Publisher says Forever guides launched on 3 November 2026"|"status": "Publisher says Forever guides launched/.test(json), zygor);
    const js = src('worker/public/static/resources169.js');
    check('CL2-178', 'the owner directory accepts a November reconciliation date', /2026-1\[01\]-/.test(js));
  }
  if (want('CL2-071x')) {
    const json = src('worker/public/static/resources169.json');
    check('CL2-071x', 'neither app.js nor the catalogue advertises Olympus Guild 1.3.3 or its old file', !/1\.3\.3/.test(app) && !/1\.3\.3/.test(json) && !/9338970/.test(json));
  }
  if (want('CL2-176')) {
    try {
      const rp = loadTs('worker/src/ruleset-profile.ts');
      const label = rp.rulesetLabel();
      check('CL2-176', 'the public ruleset label maps PvE to Blizzard\'s Normal ruleset', /PVE \(Blizzard's Normal ruleset\) - Alliance/.test(label), label);
    } catch (error) { check('CL2-176', 'ruleset-profile.ts loads', false, String(error)); }
  }
  if (want('CL2-171')) {
    try {
      const res = loadTs('worker/src/site-resources.ts');
      const calls = [];
      const rss = items => `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>t</title>${items.map(([t, u]) => `<item><title>${t}</title><link>${u}</link><pubDate>Thu, 12 Nov 2026 19:10:52 +0000</pubDate></item>`).join('')}</channel></rss>`;
      const fetcher = async url => {
        calls.push(url);
        const body = url.includes('blizzard') ? rss([['WoW: Forever Hotfixes - November 11, 2026', 'https://us.forums.blizzard.com/en/wow/t/wow-forever-hotfixes-november-11-2026/2400001/3'], ['Retail patch notes', 'https://us.forums.blizzard.com/en/wow/t/retail/2400002/1'], ['Beta Development Notes – Updated November 2', 'https://us.forums.blizzard.com/en/wow/t/notes/2360696/9']]) : rss([]);
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
      };
      const out = await res.loadResourceUpdates({ enabled: true, now: 1794600000, fetcher, cache: { get: async () => null, put: async () => {} } });
      const blizzard = out.sources.find(s => s.sourceId === 'blizzard-notes');
      const feed = calls.find(u => u.includes('blizzard'));
      check('CL2-171', 'the Blizzard source reads Blizzard\'s post-launch forum-post feed, not the beta dev-notes thread', feed === 'https://us.forums.blizzard.com/en/wow/groups/blizzard-tracker/posts.rss', feed);
      check('CL2-171', 'only topics naming Forever are kept, hotfix notes included', blizzard.items.length === 1 && blizzard.items[0].title.startsWith('WoW: Forever Hotfixes'), blizzard.items.map(i => i.title));
    } catch (error) { check('CL2-171', 'site-resources.ts loads', false, String(error)); }
    // Review follow-up: the source says what a title filter can miss or let through.
    const scope = /id: "blizzard-notes"[^\n]*scope: "([^"]*)"/.exec(src('worker/src/site-resources.ts'));
    check('CL2-171', 'the Blizzard source scope states the title filter\'s two gaps', !!scope && /no game category/.test(scope[1]) && /not listed/.test(scope[1]) && /retail post/.test(scope[1]), scope && scope[1]);
  }
  // Guides catalogue copy (guides218.json), read as data from the tree.
  if (want('CL2-173') || want('CL2-176') || want('CL2-177')) {
    const g = JSON.parse(src('worker/public/static/guides218.json'));
    const strings = []; const walk = v => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') for (const k in v) walk(v[k]); }; walk(g);
    if (want('CL2-173')) {
      const launch = g.tools.whatChanged.find(x => x.topic === 'Global launch');
      check('CL2-173', 'the guides scope note says Forever launched, not "announced global launch"', !/announced global launch/.test(g.scopeNote) && /launched worldwide on 4 November 2026/.test(g.scopeNote), g.scopeNote.slice(0, 120));
      check('CL2-173', '"Global launch" is marked live and written in the past tense, and reviewedAt moved past launch', launch.status === 'live' && /^Forever launched/.test(launch.text) && g.reviewedAt === '2026-11-12', { status: launch.status, reviewedAt: g.reviewedAt });
      check('CL2-173', 'no guide sentence says Hardcore "comes after launch" or that the beta client "is" 1.60.1', !strings.some(t => /comes after launch|The beta client is version/.test(t)));
    }
    if (want('CL2-176')) check('CL2-176', 'the guide says Olympus plays on Blizzard\'s Normal ruleset', strings.some(t => /Olympus plays on the Normal ruleset/.test(t)));
    if (want('CL2-177')) {
      const future = strings.filter(t => /open on 9 Dec|raids open on 9|From 9 Dec 2026|not a 9 Dec raid|unlock time not announced/.test(t));
      const dated = strings.filter(t => /unlock date:? (?:Wednesday )?9 December 2026/i.test(t));
      check('CL2-177', 'guide raid lines are dated facts ("Raid unlock date: 9 December 2026"), not "open on 9 December"', future.length === 0 && dated.length >= 12, { future: future.length, dated: dated.length });
    }
  }
  if (want('CL2-105')) {
    const gjs = src('worker/public/static/guides218.js');
    check('CL2-105', 'the guide and tool not-found views render under an H1', /function notFound\(title, text\)[^]*?el\("h1", \{ text: title \}\)/.test(gjs) && (gjs.match(/notFound\("(?:Guide|Tool) not found"/g) || []).length === 3);
  }
  if (want('CL2-178')) {
    const dir = JSON.parse(src('worker/public/static/resources169.json')).ownerDirectory;
    check('CL2-178', 'the owner directory follow-up date matches the 12 November recheck', dir.reconciledAt === '2026-11-12' && /November 12 follow-up rechecked Zygor/.test(dir.scopeNote), dir.reconciledAt);
  }
}

async function browserChecks() {
  const { launch, instrument, idle, viewport, sleep, key } = await import(CDP_HELPER);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'siteui-b-edge-'));
  const cdp = await launch({ port: CDP_PORT, profile });
  const st = await instrument(cdp);
  // Headless pages are not focused by default; real browsers fire focus events and match :focus.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  let persona = '';
  const open = async (who, width, route, height = 800) => {
    await viewport(cdp, width, height);
    if (who !== persona) { await cdp.send('Page.navigate', { url: `${BASE}/__qa/${who}` }); await idle(st); persona = who; }
    await cdp.send('Page.navigate', { url: `${BASE}/#/${route}` }); await idle(st);
    await cdp.send('Page.reload', {}); await idle(st); await sleep(500);
  };
  const ev = expr => cdp.eval(`(async()=>{${expr}})()`);
  const press = async (k, code, kc) => { await key(cdp, k, code, kc); await sleep(120); };
  try {
    if (want('CL2-215x')) {
      await open('admin', 1280, '');
      const r = await ev(`const s=[...document.querySelectorAll('nav.nav details.nav-group > summary')].map(x=>x.textContent);const admin=document.querySelector('#nav-menu-admin');return {s, adminLinks: admin?admin.querySelectorAll('a').length:0}`);
      check('CL2-215x', 'the admin header menus are Guilds, Community, Resources and Admin, and Admin lists the admin groups', JSON.stringify(r.s) === JSON.stringify(['Guilds', 'Community', 'Resources', 'Admin']) && r.adminLinks === 5, r);
    }
    if (want('CL2-096')) {
      await open('member', 1280, '');
      const r = await ev(`const s=document.querySelector('.topbar .brand small');const c=getComputedStyle(s);const rgb=c.color.match(/\\d+/g).map(Number);const L=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};const lum=([r,g,b])=>0.2126*L(r)+0.7152*L(g)+0.0722*L(b);const bg=[0x35,0x38,0x2e];const ratio=(lum(rgb)+0.05)/(lum(bg)+0.05);return {ratio:Math.round(ratio*100)/100,size:parseFloat(c.fontSize)}`);
      check('CL2-096', 'the header "FOREVER" reaches 4.5:1 against the lightest header band', r.ratio >= 4.5, r);
    }
    if (want('CL2-102')) {
      await open('admin', 390, '');
      const r = await ev(`const first=[...document.querySelectorAll('#app a[href], #app button, #app summary')][0];const stops=[...document.querySelectorAll('.topbar a[href], .topbar button, .topbar summary')].filter(e=>e.getClientRects().length&&!e.closest('.nav-menu'));const ys=stops.map(e=>Math.round(e.getBoundingClientRect().top));let back=0;for(let i=1;i<ys.length;i++)if(ys[i]<ys[i-1]-4)back++;return {first:first&&first.textContent.trim(),ys,back}`);
      check('CL2-102', 'the first stop is a skip link', r.first === 'Skip to content', r.first);
      check('CL2-102', 'at 390 px the header tab order never moves back up the screen', r.back === 0, r.ys);
      const skip = await ev(`const a=document.querySelector('.skip-link');if(!a)return null;a.focus();a.click();await new Promise(r=>setTimeout(r,200));return {active:document.activeElement.tagName, id:document.activeElement.id, hash:location.hash}`);
      check('CL2-102', 'the skip link moves focus to the main content without changing the route', skip && skip.active === 'MAIN' && skip.hash === '#/', skip);
    }
    if (want('CL2-101')) {
      await open('member', 1280, 'roles');
      await ev(`document.querySelector('nav.nav details.nav-group > summary').focus()`);
      await press('ArrowDown', 'ArrowDown', 40);
      const a = await ev(`return document.activeElement.textContent`);
      await press('ArrowDown', 'ArrowDown', 40);
      const b = await ev(`return document.activeElement.textContent`);
      await press('End', 'End', 35);
      const c = await ev(`const m=document.activeElement.closest('.nav-menu');const l=m?[...m.querySelectorAll('a')].at(-1):null;return document.activeElement===l`);
      check('CL2-101', 'ArrowDown and End move between the links of an open header menu', a !== b && b && c === true, { a, b, endIsLast: c });
    }
    if (want('CL2-098')) {
      await open('member', 1280, 'apply');
      const r = await ev(`const i=[...document.querySelectorAll('main input[type=text], main textarea, main select')].find(x=>x.getClientRects().length&&!x.disabled);i.focus();await new Promise(r=>setTimeout(r,50));const c=getComputedStyle(i);return {focused:i.matches(':focus'),style:c.outlineStyle,width:parseFloat(c.outlineWidth)}`);
      check('CL2-098', 'a focused form field has a 2 px outline (which forced colours keep)', r.focused && r.style !== 'none' && r.width >= 2, r);
    }
    if (want('CL2-099')) {
      await open('member', 1280, 'apply');
      const r = await ev(`const hs=[...document.querySelectorAll('main h1, main h2, main h3, main h4')].filter(h=>h.getClientRects().length).map(h=>+h.tagName[1]);let jump=0;for(let i=1;i<hs.length;i++)if(hs[i]>hs[i-1]+1)jump++;return {first:hs.slice(0,6),jump,h1:hs.filter(x=>x===1).length}`);
      check('CL2-099', '/#/apply has one H1 and never skips a heading level', r.h1 === 1 && r.jump === 0, r);
      await open('admin', 1280, 'admin/ranks'); await sleep(800);
      const a = await ev(`const hs=[...document.querySelectorAll('main h1, main h2')].map(h=>h.tagName+':'+h.textContent.trim().slice(0,30));return {first:hs[0],h1:hs.filter(x=>x.startsWith('H1')).length}`);
      check('CL2-099', '/#/admin/ranks starts with its one H1', a.h1 === 1 && /^H1/.test(a.first), a);
    }
    if (want('CL2-095')) {
      await open('member', 1280, 'army'); await sleep(500);
      const r = await ev(`return [...document.querySelectorAll('main h1')].map(h=>h.textContent.trim())`);
      check('CL2-095', '/#/army has the single H1 "Army"', JSON.stringify(r) === '["Army"]', r);
    }
    if (want('CL2-100')) {
      await open('member', 1280, 'roles');
      const roles = await ev(`return document.querySelectorAll('nav').length`);
      await open('member', 1280, 'governance'); await sleep(600);
      const gov = await ev(`return document.querySelectorAll('nav').length`);
      check('CL2-100', 'Roles and Governance keep a handful of navigation landmarks', roles <= 6 && gov <= 8, { roles, governance: gov });
    }
    if (want('CL2-104')) {
      await open('admin', 1280, 'admin'); await sleep(800);
      const r = await ev(`const t=[...document.querySelectorAll('main table')];const name=x=>x.querySelector(':scope > caption')?.textContent.trim()||x.getAttribute('aria-label')||(x.getAttribute('aria-labelledby')||'').split(' ').map(id=>document.getElementById(id)?.textContent.trim()||'').join(' ').trim();return {tables:t.length,unnamed:t.filter(x=>!name(x)).length,names:t.map(name).slice(0,6)}`);
      check('CL2-104', 'every /#/admin table has an accessible name', r.tables > 0 && r.unnamed === 0, r);
    }
    if (want('CL2-105')) {
      const notice = async route => { await open('member', 1280, route); await sleep(300); return ev(`return [...document.querySelectorAll('main [role=status]')].map(e=>e.textContent.trim()).find(t=>/address/.test(t))||null`); };
      const a = await notice('no-such-route'), b = await notice('roles/no_such_role'), c = await notice('vote/no_such_ballot');
      check('CL2-105', 'unknown addresses say so in a status note above the fallback', !!a && !!b && !!c, { route: a, role: b, ballot: c });
    }
    if (want('CL2-271')) {
      await open('member', 1280, 'admin/applications');
      const r = await ev(`return {h1:[...document.querySelectorAll('main h1')].map(h=>h.textContent.trim()),title:document.title,back:!!document.querySelector('main a[href="#/"]')}`);
      check('CL2-271', 'a member opening an admin address gets the "Site administrators only" page', JSON.stringify(r.h1) === '["Site administrators only"]' && r.back, r);
    }
    if (want('CL2-097')) {
      await open('member', 1280, 'roles');
      const r = await ev(`const b=[...document.querySelectorAll('main summary, main button')].find(x=>x.getClientRects().length&&x.textContent.trim());const label=b.textContent.trim();b.focus();window.dispatchEvent(new HashChangeEvent('hashchange'));await new Promise(r=>setTimeout(r,600));const a=document.activeElement;return {label,active:a.tagName,text:a.textContent.trim().slice(0,60),stale:!b.isConnected}`);
      check('CL2-097', 'after a re-render replaces the focused control, focus lands on its twin, not the body', r.stale && r.active !== 'BODY' && r.text === r.label, r);
    }
    if (want('CL2-280') || want('CL2-299')) {
      await open('member', 1280, 'apply');
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const r = await ev(`const seen=[];const orig=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(o){seen.push(o&&o.behavior);return orig.call(this,o)};const f=document.querySelector('main form');const submit=f.querySelector('button[type=submit], .savebar button.btn.big, .savebar button');submit.click();await new Promise(r=>setTimeout(r,400));submit.click();await new Promise(r=>setTimeout(r,400));const box=document.querySelector('.toasts');const toasts=[...box.children];Element.prototype.scrollIntoView=orig;return {seen,toasts:toasts.length,pe:getComputedStyle(box).pointerEvents,dismiss:!!(toasts[0]&&toasts[0].querySelector('button[aria-label="Dismiss message"]'))}`);
      await cdp.send('Emulation.setEmulatedMedia', { features: [] });
      if (want('CL2-280')) {
        check('CL2-280', 'the toast stack lets taps through and each toast has a dismiss button', r.pe === 'none' && r.dismiss, r);
        check('CL2-280', 'the same message twice shows one toast', r.toasts === 1, r);
      }
      if (want('CL2-299')) check('CL2-299', 'with reduced motion, error scrolling is not smooth', r.seen.length > 0 && r.seen.every(x => x !== 'smooth'), r.seen);
    }
    if (want('CL2-272')) {
      await open('member', 390, 'community');
      const r = await ev(`const n=document.querySelector('nav[aria-label="Community sections"]');const b=n.getBoundingClientRect();const tops=new Set([...n.querySelectorAll('a')].map(a=>Math.round(a.getBoundingClientRect().top)));return {rows:tops.size,height:Math.round(b.height),links:n.querySelectorAll('a').length,over:document.documentElement.scrollWidth-innerWidth}`);
      check('CL2-272', 'at 390 px the Community sections are one scrolling row with no page overflow', r.rows === 1 && r.over <= 0, r);
    }
    if (want('CL2-277')) {
      await open('member', 390, 'roles');
      const r = await ev(`const a=[...document.querySelectorAll('main a')].filter(a=>/^(Rank \\d|Title [IVX]+$)/.test(a.textContent.trim())&&a.getClientRects().length);return {count:a.length,min:Math.min(...a.map(x=>Math.round(x.getBoundingClientRect().height)))}`);
      check('CL2-277', 'Rank and Title links on /#/roles are at least 24 px tall at 390 px', r.count > 0 && r.min >= 24, r);
    }
    if (want('CL2-322')) {
      await open('member', 1280, 'apply');
      const r = await ev(`const a=[...document.querySelectorAll('main a')].filter(a=>a.textContent.trim()==='Role guide'&&a.getClientRects().length);return a.map(x=>Math.round(x.getBoundingClientRect().height))`);
      check('CL2-322', '"Role guide" links on /#/apply are at least 24 px tall', r.length > 0 && Math.min(...r) >= 24, r);
    }
    if (want('CL2-321')) {
      await open('admin', 390, '');
      const r = await ev(`const s=[...document.querySelectorAll('nav.nav details.nav-group > summary')].find(x=>x.textContent==='Community');s.click();await new Promise(r=>setTimeout(r,200));const m=s.parentElement.querySelector('.nav-menu');return {heights:[...m.querySelectorAll('a')].map(a=>Math.round(a.getBoundingClientRect().height))}`);
      check('CL2-321', 'on a touch phone header menu rows are at least 44 px tall', r.heights.length > 0 && Math.min(...r.heights) >= 44, { min: Math.min(...r.heights) });
      await open('admin', 320, '', 568);
      const b = await ev(`const s=[...document.querySelectorAll('nav.nav details.nav-group > summary')].find(x=>x.textContent==='Community');s.click();await new Promise(r=>setTimeout(r,200));const m=s.parentElement.querySelector('.nav-menu');const bx=m.getBoundingClientRect();return {top:Math.round(bx.top),bottom:Math.round(bx.bottom),viewport:innerHeight,scrolls:m.scrollHeight>m.clientHeight}`);
      check('CL2-321', 'at 320x568 the Community menu ends on screen and scrolls inside itself', b.bottom <= b.viewport, b);
    }
    if (want('CL2-323') || want('CL2-281')) {
      for (const route of ['', 'admin/applications']) {
        // A desktop browser at 200% zoom: a 160 CSS px window whose classic scrollbar leaves 145 px for the page.
        await open('admin', 160, route, 400); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 160, height: 400, deviceScaleFactor: 2, mobile: false }); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.send('Page.reload', {}); await idle(st); await sleep(600);
        const r = await ev(`const over=document.documentElement.scrollWidth-document.documentElement.clientWidth;const brand=document.querySelector('.topbar .brand').getBoundingClientRect();const slots=[...document.querySelectorAll('.badge-slot')].filter(s=>s.getClientRects().length).map(s=>Math.round(s.getBoundingClientRect().right));return {over,brandRight:Math.round(brand.right),slotMax:slots.length?Math.max(...slots):null,vw:document.documentElement.clientWidth}`);
        if (want('CL2-323')) check('CL2-323', `at 160 CSS px (/#/${route}) the header brand fits and the page has no overflow`, r.over <= 0 && r.brandRight <= r.vw, r);
        if (want('CL2-281') && route === '') check('CL2-281', 'at 160 CSS px the reserved-name badge slots stay inside the viewport', r.slotMax === null || r.slotMax <= r.vw, r);
      }
    }
    if (want('SHIELD')) {
      await open('admin', 320, '');
      const r = await ev(`const s=document.querySelector('.stream-shield-toggle');const b=s.getBoundingClientRect();const at=()=>{const r=s.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)};s.click();await new Promise(r=>setTimeout(r,150));const on=s.getAttribute('aria-pressed');const top=at()===s||s.contains(at());at().click();await new Promise(r=>setTimeout(r,150));return {w:Math.round(b.width),h:Math.round(b.height),label:s.getAttribute('aria-label'),title:s.title,on,topWhileOn:top,off:s.getAttribute('aria-pressed')}`);
      check('SHIELD', 'at 320 px the 44x44 Stream Shield stays clickable above its curtain and toggles on and off', r.w >= 44 && r.h >= 44 && r.label === 'Stream Shield' && r.title === 'Stream Shield' && r.on === 'true' && r.topWhileOn && r.off === 'false', r);
    }
    if (want('CL2-176')) {
      await open('member', 1280, '');
      const r = await ev(`return document.querySelector('[data-ruleset-identity]')?.textContent||''`);
      check('CL2-176', 'Home names the guild ruleset as Blizzard\'s Normal ruleset', /Normal ruleset/.test(r), r);
    }
    if (want('CL2-172')) {
      await open('member', 1280, 'addons'); await sleep(800);
      const r = await ev(`return [...document.querySelectorAll('main p')].map(p=>p.textContent).filter(t=>/Last reviewed:|Review dated/.test(t)).map(t=>t.slice(0,80))`);
      check('CL2-172', 'review dates on /#/addons read as plain dates, not raw timestamps', r.length > 0 && r.every(t => !/\d{4}-\d{2}-\d{2}/.test(t)), r);
    }
    if (want('CL2-320')) {
      const res = await fetch(BASE + '/privacy', { headers: { Accept: 'text/html' } });
      const body = await res.text();
      check('CL2-320', '/privacy stays 410 and links the current policy', res.status === 410 && /href="\/legal\/privacy"/.test(body), { status: res.status, bytes: body.length });
    }
    // ---- Review follow-ups (12 Nov 2026) ----
    const contrastJs = `const L=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};const lum=([r,g,b])=>0.2126*L(r)+0.7152*L(g)+0.0722*L(b);const rat=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number);`;
    if (want('CL2-096') || want('CL2-099')) {
      await open('member', 1280, 'talents'); await sleep(900);
      const r = await ev(`${contrastJs}const b=document.querySelector('.talents-class-banner');const stops=(getComputedStyle(b).backgroundImage.match(/rgb\\([^)]*\\)/g)||[]).map(rgb);const rows=[...b.querySelectorAll('p,h1,h2,span,b')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>{const c=getComputedStyle(e);return {t:e.textContent.trim().slice(0,16),px:parseFloat(c.fontSize),ratio:Math.round(Math.min(...stops.map(s=>rat(rgb(c.color),s)))*100)/100}});const notes=[...document.querySelectorAll('.talents-diff-note,.talents-comparison-legend,.talents-layout-note,.talents-feedback')].filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize));return {rows,notes,h1:[...document.querySelectorAll('main h1')].map(h=>h.textContent.trim()),eyebrow:document.querySelector('.talents-eyebrow')?.tagName}`);
      if (want('CL2-096')) {
        check('CL2-096', 'every text on the talents class banner reaches 4.5:1 against its lightest band, at 12 px or more', r.rows.length > 0 && r.rows.every(x => x.ratio >= 4.5 && x.px >= 12), r.rows.filter(x => x.ratio < 4.5 || x.px < 12).slice(0, 4));
        check('CL2-096', 'the talents notes are at least 12 px', r.notes.length > 0 && r.notes.every(px => px >= 12), r.notes);
      }
      if (want('CL2-099')) check('CL2-099', '/#/talents has one H1, the class name, and the eyebrow is a paragraph', JSON.stringify(r.h1) === '["Warrior"]' && r.eyebrow === 'P', r);
    }
    if (want('CL2-099')) {
      const jumps = {};
      for (const [who, route] of [['member', 'community'], ['member', 'vote'], ['member', 'roles'], ['admin', 'apply']]) {
        await open(who, 1280, route); await sleep(500);
        jumps[route] = await ev(`const hs=[...document.querySelectorAll('main h1,main h2,main h3,main h4,main h5,main h6')].filter(h=>h.getClientRects().length).map(h=>+h.tagName[1]);let j=0;for(let i=1;i<hs.length;i++)if(hs[i]>hs[i-1]+1)j++;const bad=[...document.querySelectorAll('[aria-labelledby],[aria-describedby]')].flatMap(e=>[...(e.getAttribute('aria-labelledby')||'').split(' '),...(e.getAttribute('aria-describedby')||'').split(' ')].filter(id=>id&&!document.getElementById(id)));return {jumps:j,dangling:bad.length}`);
      }
      check('CL2-099', 'Community, Vote, Roles and Apply never skip a heading level and every aria reference resolves', Object.values(jumps).every(x => x.jumps === 0 && x.dangling === 0), jumps);
    }
    if (want('CL2-105') || want('CL2-099')) {
      const out = {};
      for (const route of ['guides/class/no-such-class', 'guides/tools/no-such-tool']) { await open('member', 1280, route); await sleep(700); out[route] = await ev(`return [...document.querySelectorAll('main h1')].map(h=>h.textContent.trim())`); }
      check('CL2-105', 'unknown guide and tool addresses render under one H1', Object.values(out).every(h => h.length === 1 && /not found/.test(h[0])), out);
    }
    if (want('CL2-173')) {
      await open('member', 1280, 'resources'); await sleep(700);
      const t = await ev(`return document.querySelector('main').textContent`);
      check('CL2-173', '/#/resources no longer says the launch is "announced"', !/announced global launch/.test(t) && /Forever launched worldwide on 4 November 2026/.test(t));
      await open('member', 1280, 'guides/tools/changes'); await sleep(700);
      const live = await ev(`const s=[...document.querySelectorAll('main section h2')].map(h=>h.textContent.trim());const first=document.querySelector('main section.guides218-section dt');return {sections:s.slice(0,2),first:first&&first.textContent}`);
      check('CL2-173', 'the What changed tool lists "Global launch" under "Live in the game"', live.sections[0] === 'Live in the game' && live.first === 'Global launch', live);
    }
    if (want('CL2-279')) {
      const ov = {};
      for (const w of [195, 188, 160]) {
        await open('admin', w, 'talents', 400); await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 400, deviceScaleFactor: 2, mobile: false }); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.send('Page.reload', {}); await idle(st); await sleep(900);
        ov[w] = await ev(`let o=0;for(const t of document.querySelectorAll('.talents-tree')){const n=[...t.querySelectorAll('.talents-node')].map(x=>x.getBoundingClientRect());for(let i=0;i<n.length;i++)for(let k=i+1;k<n.length;k++){const a=n[i],b=n[k];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5)o++}}return {overlaps:o,docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}`);
      }
      check('CL2-279', 'at 195, 188 and 160 CSS px (200% zoom) no talent buttons overlap and the page does not scroll sideways', Object.values(ov).every(x => x.overlaps === 0 && x.docOverflow <= 0), ov);
    }
    if (want('CL2-281')) {
      const out = {};
      for (const route of ['resources', 'guides/class/warrior']) {
        await open('member', 160, route, 400); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 160, height: 400, deviceScaleFactor: 2, mobile: false }); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.send('Page.reload', {}); await idle(st); await sleep(900);
        out[route] = await ev(`const h=document.querySelector('.guides218-head');const vw=document.documentElement.clientWidth;const kids=[...h.querySelectorAll('*')].map(e=>Math.round(e.getBoundingClientRect().right));const c=getComputedStyle(h);return {right:Math.max(...kids),vw,wrap:c.flexWrap,textMin:getComputedStyle(h.querySelector(':scope > div')).minWidth}`);
      }
      check('CL2-281', 'at 160 CSS px the guide hero wraps, its text may shrink, and nothing passes the viewport', Object.values(out).every(x => x.right <= x.vw && x.wrap === 'wrap' && x.textMin === '0px'), out);
    }
    if (want('CL2-102')) {
      const hdr = {};
      for (const [who, w] of [['admin', 768], ['admin', 390], ['member', 390], ['member', 320]]) {
        await open(who, w, '');
        hdr[who + w] = await ev(`const t=document.querySelector('.topbar');const stops=[...t.querySelectorAll('a[href], button, summary')].filter(e=>e.getClientRects().length&&!e.closest('.nav-menu'));const ys=stops.map(e=>Math.round(e.getBoundingClientRect().top));let back=0;for(let i=1;i<ys.length;i++)if(ys[i]<ys[i-1]-4)back++;const rows=new Set([...t.querySelectorAll('.topbar-in > *')].map(e=>Math.round(e.getBoundingClientRect().top))).size;return {h:Math.round(t.getBoundingClientRect().height),back,minTarget:Math.min(...stops.filter(e=>!e.classList.contains('brand')).map(e=>Math.round(e.getBoundingClientRect().height))),rows}`);
      }
      check('CL2-102', 'the header keeps the actions on the brand row: two rows, focus never moves back up, 768 px stays under the base 156 px', Object.values(hdr).every(x => x.back === 0 && x.rows === 2) && hdr.admin768.h <= 156, hdr);
      check('CL2-102', 'on phones every header control is at least 44 px tall', ['admin390', 'member390', 'member320'].every(k => hdr[k].minTarget >= 44), hdr);
    }
    if (want('CL2-280')) {
      await open('member', 1280, 'apply');
      const r = await ev(`const f=document.querySelector('main form');const submit=f.querySelector('button[type=submit], .savebar button.btn.big, .savebar button');submit.focus();submit.click();await new Promise(r=>setTimeout(r,400));const x=document.querySelector('.toasts .toast-x');if(!x)return {toast:false};x.focus();x.click();await new Promise(r=>setTimeout(r,100));const a=document.activeElement;return {toast:true,active:a.tagName,inApp:document.getElementById('app').contains(a)}`);
      check('CL2-280', 'dismissing a focused toast hands focus back to the page, not the body', r.toast && r.active !== 'BODY' && r.inApp, r);
    }
    if (want('CL2-272')) {
      await open('member', 390, 'community');
      const r = await ev(`const n=document.querySelector('nav[aria-label="Community sections"]');return n.getAttribute('aria-describedby')`);
      check('CL2-272', 'the Community nav is not described by a hint that is hidden at 768 px and up', r === null, r);
    }
    if (want('CL2-071x') || want('CL2-178')) {
      await open('member', 1280, 'addons'); await sleep(800);
      const t = await ev(`return document.querySelector('.resources169-featured')?.textContent||''`);
      check('CL2-071x', 'the Olympus Guild card says "Minimum version: 1.5.7", not a "Published file"', /Minimum version: 1\.5\.7/.test(t) && !/Published file/.test(t));
      await open('member', 1280, 'guides'); await sleep(800);
      const g = await ev(`return [...document.querySelectorAll('main p')].map(p=>p.textContent).find(x=>/Follow-up dated/.test(x))||''`);
      check('CL2-178', 'the publisher library shows the 12 November follow-up date', /Follow-up dated 12 November 2026/.test(g), g);
    }
    if (st.exceptions.length) check('PAGE', 'no page exceptions during the browser checks', false, st.exceptions.slice(0, 3));
  } finally { await cdp.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold the profile briefly. */ } }
}

(async () => {
  console.log(`ROOT ${ROOT}\nBASE ${BASE}`);
  await sourceChecks();
  if (!process.argv.includes('--no-browser')) await browserChecks();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = Math.min(failed, 100);
})().catch(error => { console.error(error); process.exitCode = 101; });
