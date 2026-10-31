// Current app + authenticated Worker/SQLite fixture; no provider or native-browser claim.
// Fixture seams defer completed local responses and expose current pure heading/Markdown helpers; no shipping hook or browser claim.
const fs218 = require('node:fs'), path218 = require('node:path'), crypto218 = require('node:crypto'), { Module } = require('node:module');
const fixture218 = fs218.readFileSync(path218.join(__dirname, 'frontend_check.cjs'), 'utf8');
const starts218 = [...fixture218.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts218.length !== 1) throw Error('heading218_original_frontend_fixture_boundary');
const prefix218 = fixture218.slice(0, starts218[0].index);
if (crypto218.createHash('sha256').update(require('./frontend_fixture_prefix217.cjs').historicalFrontendPrefix217(prefix218)).digest('hex') !== 'bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5') throw Error('heading218_original_frontend_prefix_drift');
const hold218 = '{ const ms2 = sandbox.__hold ? sandbox.__hold(pathname, init) : 0; if (ms2) await new Promise((res) => setTimeout(res, ms2)); }';
if (prefix218.split(hold218).length !== 2) throw Error('heading218_original_post_worker_hold_boundary');
const delayed218 = prefix218.replace(hold218, '{ const pending218 = sandbox.__hold ? sandbox.__hold(pathname, init) : 0; if (pending218 && typeof pending218.then === "function") await pending218; else if (pending218) await new Promise(res => setTimeout(res, pending218)); }');
const appRead218 = 'const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
function helperSeam218(source) {
  const anchor='  const noticeBox = (kind, iconName, ...body) =>';
  if(source.split(anchor).length!==2)throw Error('one heading helper seam boundary');
  return source.replace(anchor,'  window.__headingFixture218=Object.freeze({reconcile:typeof pageHeading218 === "function" ? pageHeading218 : () => {},inline:governanceInline});\n'+anchor);
}
if(delayed218.split(appRead218).length!==2)throw Error('one heading fixture app-read boundary');
const prepared218=delayed218.replace(appRead218,'const APP_JS = ('+helperSeam218.toString()+')(fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8"));');

async function headingAndLaunch218() {
  const must = async (predicate, description) => { if (!await waitFor(predicate, description)) throw Error(description); };
  const mainOf = page => { const main = page.app?.querySelector('main'); if (!main) throw Error('authenticated current main missing'); return main; };
  const headings = main => main.querySelectorAll('h1');
  const frameTitles = main => main.querySelectorAll('.frame .plaque h1, .frame .plaque h2');
  const exactCountdown = (scope, target, clock) => {
    const left = Math.floor((target - clock) / 1000);
    const expected = [String(Math.floor(left / 86400)), String(Math.floor(left % 86400 / 3600)).padStart(2, '0'), String(Math.floor(left % 3600 / 60)).padStart(2, '0'), String(left % 60).padStart(2, '0')];
    return JSON.stringify(scope.querySelectorAll('[role="timer"] .num').map(node => node.textContent)) === JSON.stringify(expected);
  };
  const officialAt = Date.parse('2026-11-04T23:00:00Z');
  const earlyClock = Date.parse('2026-11-02T23:00:00Z');
  // Both are deliberately different from Blizzard's announcement, with the
  // website entry threshold already passed but its independent switch OFF.
  const guildNamesAt = Math.floor(Date.parse('2026-10-26T12:00:00Z') / 1000);
  const guildLaunchAt = Math.floor(Date.parse('2026-11-09T02:00:00Z') / 1000);
  const settings = {namesOpenAt:String(guildNamesAt), namesOpen:'0', namesTimeConfirmed:'1', launchAt:String(guildLaunchAt), applicationsOpen:'1', newsOn:'1'};
  const saved = Object.keys(settings).map(key => [key, one('SELECT value,updated_at,updated_by FROM site_settings WHERE key=?', key)]);
  const reads = [];
  const observe = page => page.before((pathname, init) => { reads.push({pathname,method:init.method || 'GET'}); return false; });
  const official = (main, label, clock = earlyClock) => {
    const banners = main.querySelectorAll('.launch-notice218');
    check('.218 '+label+' has one official announcement, independent of guild thresholds', banners.length === 1 && banners[0].getAttribute('aria-label') === 'Forever global launch'
      && banners[0].textContent.includes('4 November 2026 · 23:00 UTC · 3:00 PM PST')
      && banners[0].textContent.includes('27 October–3 November') && banners[0].textContent.includes('up to three characters total across rulesets')
      && exactCountdown(banners[0], officialAt, clock));
    check('.218 '+label+' distinguishes an in-game reservation from a website record', banners.length === 1
      && banners[0].textContent.includes('The website neither reserves names nor verifies character ownership.')
      && !!banners[0].querySelector('a[href="#/names"]'));
  };
  try {
    await siteUser(MEMBER, {global_name:'Heading reader'}); await character(MEMBER,'Heading Reader','Player-1-2182');
    for (const [key,value] of Object.entries(settings)) await fixtureRun('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', key, value, now);
    const page = await openPage(MEMBER, {}, {clockNow:earlyClock}); observe(page);
    check('.218 frontend execution starts from a genuine authenticated Worker response', page.response.status === 200 && !!page.cookie && page.boot?.user?.id === MEMBER && !!page.app);
    check('.218 Worker boot retains intentionally distinct guild dates and the OFF website switch', page.boot.settings.namesOpenAt === guildNamesAt && page.boot.settings.launchAt === guildLaunchAt && page.boot.settings.namesOpen === false);
    let main = mainOf(page);
    check('.218 Home preserves its explicit primary heading rather than promoting a frame', headings(main).length === 1 && headings(main)[0] === main.querySelector('.welcome h1')
      && headings(main)[0].textContent.startsWith('Welcome, ') && !main.querySelector('.page-heading218'));
    check('.218 Home keeps its later frame titles as secondary headings', frameTitles(main).length > 1 && frameTitles(main).every(node => node.tagName === 'H2'));
    official(main, 'Home');
    const admission = main.querySelector('.launch-and-admission218');
    check('.218 elapsed website threshold does not imply open entry while the switch is OFF', !!admission && admission.textContent.includes('Website name entry is closed') && !admission.textContent.includes('Website name entry is open')
      && main.textContent.includes('Website name entry is not open yet.') && admission.textContent.includes("It records names already chosen in game; it does not reserve them."));
    check('.218 guild invite countdown keeps its independently configured target', !!admission && admission.textContent.includes('Guild invites are planned from')
      && exactCountdown(admission.querySelector('.frame'), guildLaunchAt * 1000, earlyClock)
      && admission.textContent.includes('It guarantees neither service availability, an invite nor a free seat.'));

    for (const [route,title] of [['#/roles','Olympus ranks'],['#/vote','Explore Olympus roles, ranks and titles'],['#/apply','Your application'],['#/community/workshop','Community']]) {
      await page.go(route); await must(() => headings(mainOf(page)).length === 1, route+' primary heading'); main=mainOf(page);
      const titles = frameTitles(main);
      check('.218 '+route+' promotes exactly one first frame title', headings(main).length === 1 && !!main.querySelector('h1.page-heading218')
        && titles.length > 0 && titles[0] === headings(main)[0] && headings(main)[0].textContent === title);
      check('.218 '+route+' keeps all later frame titles at H2', titles.slice(1).every(node => node.tagName === 'H2') && main.querySelectorAll('.page-heading218').length === 1);
      if (route === '#/apply') official(main, 'Apply');
    }

    await page.go('#/apply');
    check('.218 an available Apply form alone uses editable-form instructions',!!mainOf(page).querySelector('form')
      && mainOf(page).querySelector('.launch-notice218').textContent.includes('in this application'));
    // Retained private boot fixtures exercise two historical read-only client branches.
    for(const [track218,office218,title218] of [['officer','office_62','Reserved seats — applications are closed'],['patron',null,'Patron applications are paused']]) {
      const answers218={applicationTrack:track218,targetOffice:office218,boardApplicationIntentOptIn:false};
      const historical218={id:MEMBER,status:'submitted',position:track218==='officer'?'officer':'member',backups:[],character:'Heading Reader',class:'warrior',role:'dps',region:'na',answers:answers218,createdAt:now,updatedAt:now};
      const retained218=await openPage(MEMBER,{}, {clockNow:earlyClock,bootTransform:b=>{b.application=structuredClone(historical218);b.settings.royalWritsOn=false;}});
      await retained218.go('#/apply');const prior218=JSON.stringify(retained218.boot.application);
      check('.218 retained '+track218+' no-form branch keeps neutral instructions and original private choices',
        mainOf(retained218).textContent.includes(title218) && !mainOf(retained218).querySelector('form')
        && !mainOf(retained218).querySelector('.launch-notice218').textContent.includes('in this application')
        && JSON.stringify(retained218.boot.application)===prior218 && prior218===JSON.stringify(historical218));
    }
    await page.go('#/community/news');
    await must(() => mainOf(page).textContent.includes('The road to launch'), 'actual News road-to-launch response');
    official(mainOf(page),'News with deliberately different guild date');
    check('.218 News keeps the guild date in an explicitly separate invite reference',
      !!mainOf(page).querySelector('.guild-invite-plan218') && mainOf(page).querySelector('.guild-invite-plan218').textContent.includes('This is the guild’s schedule, separate from Blizzard’s global launch')
      && !mainOf(page).textContent.includes('World of Warcraft: Forever launches in')
      && mainOf(page).querySelectorAll('.launch-notice218 [role="timer"]').length===1);
    await page.go('#/roles');
    const lateMain218=mainOf(page), promoted218=headings(lateMain218)[0], embedded218=new Element('h1');
    embedded218.textContent='Embedded rank planner';lateMain218.appendChild(embedded218);
    page.window.__headingFixture218.reconcile(lateMain218);
    check('.218 a late authored workspace heading replaces the provisional frame heading',headings(lateMain218).length===1
      && headings(lateMain218)[0]===embedded218 && !lateMain218.contains(promoted218)
      && frameTitles(lateMain218)[0].tagName==='H2' && frameTitles(lateMain218)[0].textContent==='Olympus ranks');
    const inline218=new Element('p');
    for(const node of page.window.__headingFixture218.inline('[Officer guide](#/guide/officer) · [Original source](https://example.com/source) · **Authority** · `scope`'))inline218.appendChild(node);
    check('.218 governance Markdown renders internal and HTTPS references as safe text-labelled anchors',
      !!inline218.querySelector('a[href="#/guide/officer"]') && inline218.querySelector('a[href="#/guide/officer"]').textContent==='Officer guide'
      && inline218.querySelector('a[href="https://example.com/source"]').getAttribute('target')==='_blank'
      && inline218.querySelector('a[href="https://example.com/source"]').getAttribute('rel')==='noopener noreferrer'
      && inline218.querySelector('strong').textContent==='Authority' && inline218.querySelector('code').textContent==='scope');
    const unsafe218=new Element('p');
    for(const node of page.window.__headingFixture218.inline('[unsafe](javascript:alert) [unsafe](data:text/html) <img src=x onerror=alert>'))unsafe218.appendChild(node);
    check('.218 unsafe Markdown destinations and HTML remain text without executable elements',
      unsafe218.querySelectorAll('a,img,script').length===0 && unsafe218.textContent.includes('javascript:alert') && unsafe218.textContent.includes('<img'));

    let release, held = 0;
    const pending = new Promise(resolve => { release=resolve; });
    page.hold(pathname => pathname === '/api/community/profile' ? (++held, pending) : 0);
    await page.go('#/community/profile'); await must(() => held === 1, 'completed profile response held');
    main=mainOf(page); const first = headings(main)[0];
    check('.218 delayed profile keeps its mounted Community primary heading', headings(main).length === 1 && first.textContent === 'Community' && !main.querySelector('form'));
    release(); page.hold(null);
    await must(() => !!main.querySelector('form'), 'actual delayed profile form'); await settle();
    check('.218 late profile frame cannot replace or duplicate the primary heading', headings(main).length === 1 && headings(main)[0] === first
      && frameTitles(main).some(node => node.textContent === 'My profile' && node.tagName === 'H2'));

    let releaseStale, staleHeld=0;
    const stale = new Promise(resolve => { releaseStale=resolve; });
    await page.go('#/roles');
    page.hold(pathname => pathname === '/api/community/profile' ? (++staleHeld, stale) : 0);
    await page.go('#/community/profile'); await must(() => staleHeld === 1, 'second completed profile response held');
    const departed = mainOf(page); await page.go('#/roles');
    const current = mainOf(page); const currentHeading=headings(current)[0];
    releaseStale(); page.hold(null); await must(() => !!departed.querySelector('form'), 'departed profile response consumed'); await settle();
    check('.218 a detached late frame changes no current heading or route', current !== departed && !page.app.contains(departed) && mainOf(page) === current
      && page.location.hash === '#/roles' && headings(current).length === 1 && headings(current)[0] === currentHeading && currentHeading.textContent === 'Olympus ranks');
    await page.go('#/apply'); await page.go('#/roles');
    check('.218 replacement navigation reconstructs one primary heading without stale duplicates', mainOf(page) !== current && headings(mainOf(page)).length === 1
      && headings(mainOf(page))[0].textContent === 'Olympus ranks' && !page.app.contains(currentHeading)
      && frameTitles(mainOf(page)).slice(1).every(node => node.tagName === 'H2'));

    // A second, different persisted admission schedule must not move the
    // announcement. An ON switch still cannot open entry before its threshold.
    await fixtureRun("UPDATE site_settings SET value='1' WHERE key='namesOpen'");
    await fixtureRun("UPDATE site_settings SET value=? WHERE key='namesOpenAt'", String(Math.floor(Date.parse('2026-11-08T12:00:00Z') / 1000)));
    await fixtureRun("UPDATE site_settings SET value=? WHERE key='launchAt'", String(Math.floor(Date.parse('2026-10-30T12:00:00Z') / 1000)));
    const later = await openPage(MEMBER, {}, {clockNow:earlyClock}); observe(later);
    check('.218 ON website switch with a future threshold still says entry closed', later.boot.settings.namesOpen === true
      && later.app.textContent.includes('Website name entry is closed') && later.app.textContent.includes('Website name entry is not open yet.')
      && !later.app.textContent.includes('Website name entry is open'));
    official(mainOf(later), 'Home with changed guild schedule');
    await later.go('#/apply'); official(mainOf(later), 'Apply with changed guild schedule');

    const passed = await openPage(MEMBER, {}, {clockNow:officialAt+1000}); observe(passed);
    const passedBanner = mainOf(passed).querySelector('.launch-notice218');
    check('.218 elapsed official time is an announcement rather than an availability claim', passedBanner?.textContent.includes('The announced launch time has passed. Check Blizzard’s service notices for actual service availability.')
      && !passedBanner.querySelector('[role="timer"]') && !passedBanner.textContent.includes('Open now'));
    check('.218 Home links to an application without implying an editable form is on Home',
      !passedBanner.textContent.includes('in this application') && !!passedBanner.querySelector('a[href="#/apply"]'));
    await fixtureRun("UPDATE site_settings SET value='0' WHERE key='applicationsOpen'");
    const closed218=await openPage(MEMBER,{}, {clockNow:earlyClock});await closed218.go('#/apply');
    const closedBanner218=mainOf(closed218).querySelector('.launch-notice218');
    check('.218 closed applications keep the announcement without telling readers to edit a missing form',
      mainOf(closed218).textContent.includes('Applications are closed right now.') && !!closedBanner218
      && !closedBanner218.textContent.includes('in this application') && !!closedBanner218.querySelector('a[href="#/apply"]')
      && !closedBanner218.querySelector('h1,h2,h3'));
    const anonymous = await openPage(null);
    check('.218 real signed-out root remains the script-free gate, without fabricated SPA coverage', anonymous.response.status === 200 && anonymous.boot === null && anonymous.app === null
      && anonymous.html.includes('href="/auth/login"') && /script-src 'none'/.test(anonymous.response.headers.get('Content-Security-Policy') || '')
      && !/<script\b|\/static\/app\.(?:js|css)|id="boot"/i.test(anonymous.html));
    check('.218 heading and announcement browsing sends no protected write requests', reads.length > 0 && reads.every(row => row.method === 'GET'));
  } finally {
    for (const [key,row] of saved) {
      if (row) await fixtureRun('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by', key,row.value,row.updated_at,row.updated_by);
      else await fixtureRun('DELETE FROM site_settings WHERE key=?',key);
    }
  }
  console.log('\n'+ok+'/'+n+' passed'); process.exit(ok === n ? 0 : 1);
}
const execution218 = new Module(__filename, module);
execution218.filename=__filename; execution218.paths=Module._nodeModulePaths(__dirname);
execution218._compile(prepared218+'\n('+headingAndLaunch218.toString()+')().catch(error=>{console.error(error.stack);process.exit(1);});',__filename);
