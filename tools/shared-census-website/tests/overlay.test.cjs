'use strict';
// Only the existing frontend fixture prefix runs: real Worker admission, original cookies,
// current Native SQLite harness and actual app.js transformed in memory. No broad test driver.
const fs = require('node:fs'), path = require('node:path'), { Module } = require('node:module');
const fixture = path.resolve(__dirname, '../../..', 'worker/tests/frontend_check.cjs');
const overlay = path.resolve(__dirname, '..', 'website-overlay.cjs');
const source = fs.readFileSync(fixture, 'utf8');
const boundaries = [...source.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (boundaries.length !== 1) throw Error('The original frontend fixture boundary must be unique.');
let prefix = source.slice(0, boundaries[0].index);
const appRead = 'const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
if (prefix.split(appRead).length !== 2) throw Error('The original app read must be unique.');
prefix = prefix.replace(appRead, 'const APP_JS = require(' + JSON.stringify(overlay) + ').transformApp(fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8"));');
const body = String.raw`
const overlayLocal = require(${JSON.stringify(overlay)}), assertLocal = require('node:assert/strict');
const localPath = '#/community/shared-census', localScript = '/__census-local/census-view.js', localCss = '/__census-local/census-view.css';
const featuresLocal = { COMMUNITY_FEATURES: 'directory' }; // Existing News and census both OFF.
const pauseLocal = ms => new Promise(resolve => setTimeout(resolve, ms));
const findScriptLocal = page => page.document.head.querySelector('script[src="' + localScript + '"]');
const linksLocal = page => page.app.querySelectorAll('a[href="' + localPath + '"]');
function requestsLocal(page) { const calls = []; page.before((pathname, init) => { calls.push({ pathname, method: init.method || 'GET' }); return false; }); return calls; }
function installLocal(page, calls = [], { slow = false, protocolReady = true } = {}) {
  // This leaf isolates route ownership. The real unchanged protocol/PNG/decoder
  // path is exercised by the independent QR transport and HTTP leaves.
  if (protocolReady) {
    page.window.OlympusGuildQRProtocol = Object.freeze({ syntheticTestOnly: true });
    page.document.head.querySelector('script[src="/__census-local/qr-protocol.js"]')?.dispatchEvent(new Event('load'));
  }
  let release;
  page.window.OlympusSharedCensusLocal = { mount(host, options) {
    const marker = page.document.createElement('p'); marker.setAttribute('data-local-mount', 'true'); marker.textContent = 'Synthetic census module'; host.appendChild(marker);
    const call = { host, options, destroyed: 0 }; calls.push(call);
    const controller = { destroy() { call.destroyed++; marker.remove(); }, refresh() {} };
    if (slow) return new Promise(resolve => { release = () => resolve(controller); });
    return controller;
  } };
  return { calls, release: () => release && release() };
}

(async () => {
  const original = fs.readFileSync(path.join(root, 'public/static/app.js'), 'utf8');
  check('local transform refuses source drift and repeat transformation', (() => { try { overlayLocal.transformApp(original + '\n'); return false; } catch {} try { overlayLocal.transformApp(APP_JS); return false; } catch {} return true; })());
  check('synthetic local overlay binds the reviewed main frontend and has its own separate local-only loader', overlayLocal.EXPECTED_SOURCE_SHA256 === require('node:crypto').createHash('sha256').update(original).digest('hex') && APP_JS.split('async function loadSharedCensusLocalScript(namespace, file)').length === 2 && original.split('async function loadMemberScript(').length === 2 && APP_JS.split('async function loadMemberScript(').length === 2 && !APP_JS.includes('/static/army-live/pilot.js') && !APP_JS.includes('/static/army-live/report.js'));
  const originalTools = original.slice(original.indexOf('  const toolScripts = new Map();'), original.indexOf('  const resourcesView = view => main => {'));
  // .185 main now owns these reviewed dependencies. The local transform must preserve
  // the complete tool block and must neither add nor duplicate a talent dependency.
  const inheritedTalentDependencies = ['OlympusTalentAnalysis', 'OlympusTalentGuides', '/static/talents/analysis.js', '/static/talents/guide-builds179.js'];
  check('original main tool loader and talent route remain exact with no talent dependency added by the local overlay', originalTools.includes('ROUTES.talents = (main, parts) => memberTool(') && APP_JS.includes(originalTools) && inheritedTalentDependencies.every(value => originalTools.includes(value) && APP_JS.split(value).length === original.split(value).length));
  const originalNews = original.slice(original.indexOf('  async function communityNews(body) {'), original.indexOf('  async function communityDirectory(body) {'));
  check('original main News implementation and switch remain exact without a later Army route', originalNews.length > 0 && APP_JS.includes(originalNews) && APP_JS.includes('if (sub === "news" && newsOn()) return communityNews(body);') && !APP_JS.includes('communityStatistics('));
  check('local transform preserves real guards and adds no mutable global capability', APP_JS.includes('const communityReader = () => can("communityRead") || can("confirmedGuildData");') && APP_JS.includes('if (!communityReader()) { add(body, standingNotice()); return; }') && !APP_JS.includes('window.sharedCensusEnabled') && !APP_JS.includes('S.sharedCensusEnabled'));
  await siteUser(MEMBER, { global_name: 'Synthetic fixture member' }); await character(MEMBER, 'Mia One', 'Player-1-0001');
  await siteUser(OTHER, { global_name: 'Synthetic unconfirmed' }); await siteUser(DENIED, { global_name: 'Synthetic denied', denied: 1 }); await siteUser(STAFF, { global_name: 'Synthetic administrator' });
  for (const who of [MEMBER, OTHER, DENIED, STAFF]) await cookieFor(who);
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at) VALUES('newsOn','false',?)", now);
  const settingsBefore = JSON.stringify(db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all());
  const nativeBefore = JSON.stringify(db.prepare('SELECT * FROM privacy_write_admission').all());

  const guest = await openPage(null, featuresLocal), denied = await openPage(DENIED, featuresLocal);
  check('guest and denied responses keep original script-free admission with no local assets', guest.app === null && denied.app === null && guest.boot === null && denied.boot === null && !/__census-local|shared-census/.test(guest.html + denied.html));
  const ordinary = await openPage(OTHER, featuresLocal), ordinaryCalls = requestsLocal(ordinary), ordinaryMounts = installLocal(ordinary).calls;
  await ordinary.go(localPath);
  check('unconfirmed ordinary reader sees standing refusal without local nav tab card module or census request', ordinary.boot.community.capabilities.communityRead === false && ordinary.boot.community.capabilities.confirmedGuildData === false && linksLocal(ordinary).length === 0 && !findScriptLocal(ordinary) && ordinaryMounts.length === 0 && ordinaryCalls.every(call => !/census/.test(call.pathname)) && ordinary.app.textContent.includes('Membership check needed'));
  await ordinary.go('#/community');
  check('unconfirmed overview does not advertise shared local census', linksLocal(ordinary).length === 0);
  await ordinary.go('#/community/army');
  check('ordinary Army admission does not grant local census access or load its module', ordinary.boot.community.capabilities.armyRead === true && !!ordinary.app.querySelector('[data-army-qr-review="public-reader"]') && linksLocal(ordinary).length === 0 && !findScriptLocal(ordinary) && ordinaryMounts.length === 0 && ordinaryCalls.every(call => !/census/.test(call.pathname)));
  const switchedOff = await openPage(MEMBER, { COMMUNITY_FEATURES: '' }), switchedCalls = requestsLocal(switchedOff);
  await switchedOff.go(localPath);
  check('original all-community-OFF gate remains closed before local module loading', !findScriptLocal(switchedOff) && switchedCalls.every(call => !/census/.test(call.pathname)) && switchedOff.app.textContent.includes('not switched on yet'));
  await switchedOff.go('#/community/army');
  check('Army-only navigation with legacy Community OFF advertises no local census tab', !!switchedOff.app.querySelector('[data-army-qr-review="public-reader"]') && linksLocal(switchedOff).length === 0 && !findScriptLocal(switchedOff) && switchedCalls.every(call => !/census/.test(call.pathname)));

  await switchedOff.go('#/community');
  check('Army-only hub with legacy Community OFF advertises no local census card', linksLocal(switchedOff).length === 0 && !findScriptLocal(switchedOff) && switchedCalls.every(call => !/census/.test(call.pathname)));

  const member = await openPage(MEMBER, featuresLocal), memberCalls = requestsLocal(member);
  check('confirmed member top navigation retains one Community hub independently of News and old Census flag', !!member.app.querySelector('nav.nav a[href="#/community"]') && !member.app.querySelector('nav.nav a[href="' + localPath + '"]') && member.boot.settings.newsOn === false && member.boot.community.features.census === false);
  await member.go('#/community');
  check('real Community overview contains the local synthetic card', !!member.app.querySelector('a.card[href="' + localPath + '"]') && member.app.textContent.includes('No production connection or real guild data'));
  const header = member.app.querySelector('header');
  await member.go(localPath);
  check('cold local route loads exact view and unchanged QR protocol with scoped stylesheet before any census read', !!findScriptLocal(member) && !!member.document.head.querySelector('script[src="/__census-local/qr-protocol.js"]') && !!member.document.head.querySelector('link[href="' + localCss + '"]') && memberCalls.every(call => !/census/.test(call.pathname)) && member.app.textContent.includes('Opening synthetic local census'));
  const calls = installLocal(member).calls; findScriptLocal(member).dispatchEvent(new Event('load'));
  await waitFor(() => calls.length === 1, 'local module load');
  check('mount receives actual route guard and explicit synthetic-only contract', calls.length === 1 && calls[0].options.syntheticOnly === true && calls[0].options.live() && typeof calls[0].options.onRefused === 'function');
  check('actual shell title nav and active tab stay stable on local route', member.document.title === 'Community · Shared census · local preview — Olympus' && member.app.querySelector('header') === header && !!member.app.querySelector('nav[aria-label="Community sections"] a[href="' + localPath + '"][aria-current="page"]'));
  await member.go('#/guide/member');
  check('route departure destroys exact instance once and invalidates original liveness', calls[0].destroyed === 1 && !calls[0].options.live() && !member.app.querySelector('[data-local-mount="true"]') && !!byText(member.app, 'h2', 'Member guide'));
  await member.go(localPath); await waitFor(() => calls.length === 2, 'local route reopen');
  check('reopen reuses exact asset once and mounts a new owned instance', calls.length === 2 && member.document.head.querySelectorAll('script[src="' + localScript + '"]').length === 1 && member.document.head.querySelectorAll('link[href="' + localCss + '"]').length === 1);
  await member.go('#/guide/member');

  const administrator = await openPage(STAFF, featuresLocal), adminCalls = installLocal(administrator).calls;
  await administrator.go(localPath); await waitFor(() => adminCalls.length === 1, 'administrator local read');
  check('existing admin pure-read admission does not invent roster confirmation', administrator.boot.user.isAdmin === true && administrator.boot.community.capabilities.communityRead === true && administrator.boot.community.capabilities.confirmedGuildData === false && adminCalls.length === 1);
  await administrator.go('#/guide/member');

  const departed = await openPage(MEMBER, featuresLocal), departedCalls = requestsLocal(departed);
  await departed.go(localPath); const departedLoader = findScriptLocal(departed);
  await departed.go('#/guide/member'); const departedMounts = installLocal(departed).calls; departedLoader.dispatchEvent(new Event('load')); await pauseLocal(20);
  check('dependency completing after departure cannot mount or read census', departedMounts.length === 0 && departedCalls.every(call => !/census/.test(call.pathname)) && !!byText(departed.app, 'h2', 'Member guide'));
  const slow = await openPage(MEMBER, featuresLocal), slowController = installLocal(slow, [], { slow: true });
  await slow.go(localPath); await waitFor(() => slowController.calls.length === 1, 'pending async mount'); await slow.go('#/guide/member'); slowController.release(); await pauseLocal(20);
  check('async mount resolving after departure is destroyed and never becomes global disposer', slowController.calls[0].destroyed === 1 && !slowController.calls[0].options.live() && !!byText(slow.app, 'h2', 'Member guide'));
  const broken = await openPage(MEMBER, featuresLocal), brokenCalls = requestsLocal(broken); await broken.go(localPath); findScriptLocal(broken).dispatchEvent(new Event('error')); await settle();
  check('module load failure claims no figures and reads no census', broken.app.textContent.includes('No current figures are claimed') && brokenCalls.every(call => !/census/.test(call.pathname)));

  const hidden = await openPage(MEMBER, featuresLocal), hiddenCalls = installLocal(hidden).calls, hiddenRequests = requestsLocal(hidden); await hidden.go(localPath); await waitFor(() => hiddenCalls.length === 1, 'hidden page mount'); hidden.document.hidden = true; hidden.document.dispatchEvent(new Event('visibilitychange'));
  const reopenHidden = byText(hidden.app, 'button', 'Reopen local census');
  check('hidden page destroys local controller clears rows and offers only a generic manual resume', hiddenCalls[0].destroyed === 1 && !hiddenCalls[0].options.live() && !hidden.app.querySelector('[data-local-mount="true"]') && !!reopenHidden && hidden.app.textContent.includes('displayed census and draft were cleared') && hidden.app.textContent.includes('Synthetic receipts remain only in this local process'));
  reopenHidden.click(); await settle();
  check('manual resume while still hidden cannot mount or issue a census read', hiddenCalls.length === 1 && hiddenRequests.every(call => !/census/.test(call.pathname)));
  hidden.document.hidden = false; hidden.document.dispatchEvent(new Event('visibilitychange')); await settle();
  check('returning visible performs no automatic remount or census read', hiddenCalls.length === 1 && hiddenRequests.every(call => !/census/.test(call.pathname)) && !!byText(hidden.app, 'button', 'Reopen local census'));
  reopenHidden.click(); await waitFor(() => hiddenCalls.length === 2, 'explicit visible census reopen');
  check('explicit visible resume mounts a new owned controller without reviving old data', hiddenCalls.length === 2 && hiddenCalls[0].destroyed === 1 && !hiddenCalls[0].options.live() && hiddenCalls[1].options.live() && !!hidden.app.querySelector('[data-local-mount="true"]'));
  await hidden.go('#/guide/member'); const afterHiddenHeader = hidden.app.querySelector('header'); reopenHidden.click(); await settle();
  check('a stale resume button cannot remount after route departure', hiddenCalls.length === 2 && hiddenCalls[1].destroyed === 1 && hidden.app.querySelector('header') === afterHiddenHeader && !!byText(hidden.app, 'h2', 'Member guide'));
  const unload = await openPage(MEMBER, featuresLocal), unloadCalls = installLocal(unload).calls; await unload.go(localPath); await waitFor(() => unloadCalls.length === 1, 'pagehide mount'); unload.window.dispatchEvent(new Event('pagehide'));
  check('pagehide destroys local controller exactly once and leaves a generic manual resume', unloadCalls[0].destroyed === 1 && !unloadCalls[0].options.live() && !!byText(unload.app, 'button', 'Reopen local census')); await unload.go('#/guide/member');
  const pausedSignout = await openPage(STAFF, featuresLocal), pausedSignoutCalls = installLocal(pausedSignout).calls; await pausedSignout.go(localPath); await waitFor(() => pausedSignoutCalls.length === 1, 'paused signout mount'); pausedSignout.document.hidden = true; pausedSignout.document.dispatchEvent(new Event('visibilitychange')); const staleResume = byText(pausedSignout.app, 'button', 'Reopen local census'); pausedSignout.document.hidden = false; byText(pausedSignout.app, 'button', 'Sign out').click(); staleResume.click(); await settle();
  check('signout invalidates a paused resume synchronously even before navigation finishes', pausedSignoutCalls.length === 1 && !byText(pausedSignout.app, 'button', 'Reopen local census') && !pausedSignout.app.querySelector('[data-local-mount="true"]'));

  const refused = await openPage(MEMBER, featuresLocal), refusedCalls = installLocal(refused).calls, refusedRequests = requestsLocal(refused); await refused.go(localPath); await waitFor(() => refusedCalls.length === 1, 'current refusal mount');
  const originalCommunity = refused.boot.community, noRead = { ...originalCommunity, capabilities: { ...originalCommunity.capabilities, applicantWrite: false, communityRead: false, confirmedGuildData: false, communityStaff: false } };
  refused.answer(pathname => pathname === '/api/community/context' ? noRead : null); refusedCalls[0].options.onRefused(403); await waitFor(() => refused.app.textContent.includes('Membership check needed'), 'current context refusal');
  check('current403 clears module and rechecks real context to remove local navigation', refusedCalls[0].destroyed === 1 && !refusedCalls[0].options.live() && linksLocal(refused).length === 0 && refusedRequests.filter(call => call.pathname === '/api/community/context').length === 1 && !refused.app.querySelector('[data-local-mount="true"]'));
  const stale = await openPage(MEMBER, featuresLocal), staleCalls = installLocal(stale).calls, staleRequests = requestsLocal(stale); await stale.go(localPath); await waitFor(() => staleCalls.length === 1, 'stale callback mount'); await stale.go('#/guide/member'); const staleHeader = stale.app.querySelector('header'); staleCalls[0].options.onRefused(401); staleCalls[0].options.onRefused(403); await settle();
  check('stale refusal cannot sign out recheck context or disturb later route', !!byText(stale.app, 'button', 'Sign out') && stale.app.querySelector('header') === staleHeader && !!byText(stale.app, 'h2', 'Member guide') && staleRequests.every(call => call.pathname !== '/api/community/context'));
  const service = await openPage(MEMBER, featuresLocal), serviceCalls = installLocal(service).calls, serviceRequests = requestsLocal(service); await service.go(localPath); await waitFor(() => serviceCalls.length === 1, 'unknown service failure'); serviceCalls[0].options.onRefused(503); await settle();
  check('service503 remains unknown and does not become a shell permission result', serviceCalls[0].options.live() && serviceCalls[0].destroyed === 0 && !!byText(service.app, 'button', 'Sign out') && serviceRequests.every(call => call.pathname !== '/api/community/context')); await service.go('#/guide/member');
  const qrPending = await openPage(MEMBER, featuresLocal), qrPendingCalls = installLocal(qrPending, [], { protocolReady: false }).calls;
  await qrPending.go(localPath); await settle();
  const qrPendingScript = qrPending.document.head.querySelector('script[src="/__census-local/qr-protocol.js"]');
  check('local view cannot mount before the exact QR protocol dependency completes', !!qrPendingScript && qrPendingCalls.length === 0 && !qrPending.app.querySelector('[data-local-mount="true"]'));
  await qrPending.go('#/guide/member'); qrPending.window.OlympusGuildQRProtocol = {}; qrPendingScript.dispatchEvent(new Event('load')); await pauseLocal(20);
  check('a late QR protocol dependency cannot revive the census after route departure', qrPendingCalls.length === 0 && !!byText(qrPending.app, 'h2', 'Member guide'));
  const signingOut = await openPage(MEMBER, featuresLocal), signoutCalls = installLocal(signingOut).calls; await signingOut.go(localPath); await waitFor(() => signoutCalls.length === 1, 'signout mount'); byText(signingOut.app, 'button', 'Sign out').click();
  check('normal signout clears local controller synchronously before its network await', signoutCalls[0].destroyed === 1 && !signoutCalls[0].options.live() && !signingOut.app.querySelector('[data-local-mount="true"]'));
  await pauseLocal(20);
  check('focused overlay checks leave original production source settings and Native rows unchanged', original === fs.readFileSync(path.join(root, 'public/static/app.js'), 'utf8') && settingsBefore === JSON.stringify(db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all()) && nativeBefore === JSON.stringify(db.prepare('SELECT * FROM privacy_write_admission').all()));
  console.log('\n' + ok + '/' + n + ' local website overlay checks passed');
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution = new Module(fixture, module);
execution.filename = fixture;
execution.paths = Module._nodeModulePaths(path.dirname(fixture));
execution._compile(prefix + '\n' + body, fixture);
