'use strict';
// Evergreen 12 Nov 2026, round 5 follow-up, area cal, item B: the Discord announcement panel's catch.
// The Worker answers feature_disabled and delivery_not_configured with 503 BEFORE any effect
// (community-event-delivery.ts, the two early returns of eventDeliveryPublish), and the shared uncertain() counts every
// coded 5xx as unknown. The panel must forget its pending operation for a DECODED answer whose code is in its
// pre-effect list, whatever the status; any other coded 5xx, an unreadable answer and a network failure stay unknown.
//
// This drives the page's real callback (organizerEventDiscord in the served app.js) in a headless Edge through a local
// QA harness. Only the page's calls to /api/community/events/discord* are answered by a stub installed in the page
// (window.fetch, which api() resolves at call time); everything else is the harness. With --app <file>, the page's
// app.js is served from that file instead (Fetch interception), so the same check runs against another tree's page.
//
//   node tests/evergreen1112_cal_panel_test.cjs --url http://127.0.0.1:63681 --cdp 63682 [--app <app.js>] [--profile <dir>]
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), http = require('node:http');
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => (arg.startsWith('--') ? [...out, [arg.slice(2), all[i + 1]]] : out), []));
const URL0 = args.url, CDP_PORT = Number(args.cdp || 0);
if (!URL0 || !CDP_PORT) { console.error('usage: --url <harness> --cdp <port> [--app <file>]'); process.exit(99); }
let failures = 0;
const check = (id, label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail && !ok ? ' :: ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); try { resolve(JSON.parse(t)); } catch { resolve(t); } }); }).on('error', reject);
  });
}
async function launchEdge(portN, profile) {
  fs.mkdirSync(profile, { recursive: true });
  const proc = cp.spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${portN}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--lang=en-US', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) { await sleep(250); try { const r = await get(`http://127.0.0.1:${portN}/json/list`); targets = Array.isArray(r) ? r : null; } catch { /* not up */ } }
  if (!targets) { proc.kill(); throw Error('edge did not expose CDP'); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let n = 0; const pending = new Map(), listeners = new Map();
  ws.onmessage = e => {
    const msg = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString());
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(Error(msg.error.message)) : res(msg.result); }
    else if (msg.method && listeners.has(msg.method)) listeners.get(msg.method)(msg.params);
  };
  const cdp = {
    on: (method, fn) => listeners.set(method, fn),
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++n; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    async eval(expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    async close() { try { await Promise.race([cdp.send('Browser.close'), sleep(3000)]); } catch { /* gone */ } try { ws.close(); } catch { /* gone */ } await sleep(300); try { proc.kill(); } catch { /* gone */ } },
  };
  return cdp;
}

const ID = 'CalPanelFollowUp0000001'.slice(0, 22); // 22 characters, the event id pattern
const OP = 'OpPostedEarlier0000001'.slice(0, 22);
const CONTENT = '**Panel check**\n<t:1900000000:F> · <t:1900000000:R>\nDuration: 60 minutes\n[Sign up on the Olympus calendar](https://example.invalid/)\nUse /raid or the calendar.';
const previewOf = posted => ({
  eventId: ID, revision: 1, enabled: true, canPublish: !posted, publicationClosed: false, publicationBlock: null,
  payload: { content: CONTENT, components: [], allowed_mentions: { parse: [] } }, payloadHash: 'a'.repeat(64),
  delivery: posted ? { state: 'posted', revision: 1, stale: false, removalPending: false, operationId: OP, messageUrl: 'https://discord.com/channels/236932545793490944/1554266022444408872/1570000000000000001', retainUntil: '2027-01-01T00:00:00.000Z', result: 'published' } : null,
});
// The stub: GET answers the preview; POST answers what the case says ({status, body} or 'network').
const STUB = `(() => {
  if (window.__panelStub) return true;
  const real = window.fetch.bind(window);
  window.__calls = []; window.__statusLog = [];
  window.fetch = async (input, init = {}) => {
    const url = String(input), method = (init && init.method) || 'GET';
    if (!url.includes('/api/community/events/discord')) return real(input, init);
    window.__calls.push(method + ' ' + url.replace(/^https?:\\/\\/[^/]+/, ''));
    if (method === 'GET') return new Response(JSON.stringify(window.__preview), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const a = window.__answer;
    if (a === 'network') throw new TypeError('Failed to fetch');
    return new Response(a.body, { status: a.status, headers: { 'Content-Type': 'application/json' } });
  };
  window.__panelStub = true;
  return true;
})()`;
const KEY = 'olympus.eventDelivery.' + ID;
const LOST = /answer was lost|outcome is unresolved|outcome is unknown|not known whether/i;

(async () => {
  const profile = args.profile || path.join(require('node:os').tmpdir(), 'calpanel1112-' + Date.now());
  const cdp = await launchEdge(CDP_PORT, profile);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    let served = 0;
    if (args.app) {
      const body = fs.readFileSync(args.app).toString('base64');
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*app.js*', requestStage: 'Request' }] });
      cdp.on('Fetch.requestPaused', p => {
        const isApp = /\/static\/app\.js(\?|$)/.test(new URL(p.request.url).pathname + (new URL(p.request.url).search ? '?' : ''));
        if (isApp) served++;
        if (isApp) cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body }).catch(() => {});
        else cdp.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      });
      console.log('serving app.js from ' + args.app);
    }
    const go = async url => { await cdp.send('Page.navigate', { url }); await sleep(300); for (let i = 0; i < 60; i++) { if (await cdp.eval('document.readyState') === 'complete') break; await sleep(150); } };
    const until = async (expr, n = 75) => { let v = null; for (let i = 0; i < n; i++) { v = await cdp.eval(expr); if (v) return v; await sleep(200); } return v; };
    await go(URL0 + '/__qa/admin');
    await go(URL0 + '/#/community/calendar');
    await until(`(() => { const m = document.querySelector('main'); return !!m && /Calendar/.test(m.innerText) && !/Loading…/.test(m.innerText); })()`);
    await cdp.eval(STUB);
    if (args.app) check('setup', `the page ran the app.js from ${args.app} (served ${served} time(s))`, served > 0, served);
    const cases = [
      ['publish', { status: 503, body: '{"error":"feature_disabled"}' }, 'refusal'],
      ['publish', { status: 503, body: '{"error":"delivery_not_configured"}' }, 'refusal'],
      ['remove', { status: 503, body: '{"error":"feature_disabled"}' }, 'refusal'],
      ['remove', { status: 503, body: '{"error":"delivery_not_configured"}' }, 'refusal'],
      ['publish', { status: 500, body: '{"error":"internal"}' }, 'unknown'],
      ['remove', { status: 500, body: '{"error":"internal"}' }, 'unknown'],
      ['publish', { status: 503, body: 'Service Unavailable' }, 'unknown'],
      ['publish', 'network', 'unknown'],
      ['remove', 'network', 'unknown'],
      ['publish', { status: 409, body: '{"error":"stale_revision"}' }, 'refusal'], // a 4xx in the list, as before
    ];
    for (const [kind, answer, want] of cases) {
      const label = `${kind} answered ${answer === 'network' ? 'by a network failure' : `${answer.status} ${answer.body}`}`;
      await cdp.eval(`(() => { try { sessionStorage.removeItem(${JSON.stringify(KEY)}); } catch {} window.__preview = ${JSON.stringify(previewOf(kind === 'remove'))}; window.__answer = ${JSON.stringify(answer)}; window.__calls = []; window.__statusLog = []; location.hash = '#/community/calendar'; return true; })()`);
      await sleep(200);
      await cdp.eval(`(() => { location.hash = ${JSON.stringify('#/community/calendar/' + ID + '/discord')}; return true; })()`);
      const ready = await until(`(() => { const b = [...document.querySelectorAll('main button')].find(x => x.textContent === ${JSON.stringify(kind === 'publish' ? 'Publish announcement' : 'Remove announcement')}); return !!b && !b.disabled; })()`);
      if (!ready) { check('cal', `panel: ${label}: the ${kind} button became available`, false, await cdp.eval(`document.querySelector('main') && document.querySelector('main').innerText.slice(0, 400)`)); continue; }
      // Every text the status line shows during the action, not only the last one.
      await cdp.eval(`(() => { const s = document.querySelector('main [role=status]'); window.__statusLog = [s.textContent]; new MutationObserver(() => window.__statusLog.push(s.textContent)).observe(s, { childList: true, characterData: true, subtree: true }); [...document.querySelectorAll('main button')].find(x => x.textContent === ${JSON.stringify(kind === 'publish' ? 'Publish announcement' : 'Remove announcement')}).click(); return true; })()`);
      const done = await until(`(() => { const c = window.__calls; const i = c.findIndex(x => x.startsWith('POST')); return i >= 0 && c.slice(i + 1).some(x => x.startsWith('GET')) && [...document.querySelectorAll('main button')].some(x => x.textContent === 'Refresh announcement status' && !x.disabled); })()`);
      await sleep(150);
      const state = await cdp.eval(`(() => { let key = null; try { key = sessionStorage.getItem(${JSON.stringify(KEY)}); } catch {} const s = document.querySelector('main [role=status]'); const btn = t => { const b = [...document.querySelectorAll('main button')].find(x => x.textContent === t); return b ? b.disabled : null; }; return { key, status: s && s.textContent, log: window.__statusLog, calls: window.__calls, publishDisabled: btn('Publish announcement'), removeDisabled: btn('Remove announcement'), checkDisabled: btn('Check existing message') }; })()`);
      if (want === 'refusal') {
        check('cal', `panel: ${label}: the pending operation is forgotten (${KEY} cleared)`, !!done && state.key === null, state);
        check('cal', `panel: ${label}: the status never says the answer was lost`, !!done && state.log.every(t => !LOST.test(t || '')) && !LOST.test(state.status || ''), state);
        check('cal', `panel: ${label}: the ${kind} button is usable again`, !!done && (kind === 'publish' ? state.publishDisabled === false : state.removeDisabled === false), state);
      } else {
        check('cal', `panel: ${label}: the operation stays pending (${KEY} kept)`, !!done && typeof state.key === 'string' && JSON.parse(state.key).kind === kind, state);
        check('cal', `panel: ${label}: the status keeps the unknown wording`, !!done && LOST.test(state.status || ''), state);
      }
    }
  } catch (e) {
    check('setup', 'the panel check completed without an exception: ' + (e && e.stack || e), false);
  } finally { await cdp.close(); }
  console.log(`\n${failures} failure(s)`);
  process.exit(Math.min(failures, 99));
})();
