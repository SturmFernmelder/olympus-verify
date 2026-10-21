// .180: actual shipping app/Worker/SQLite, fictional identities only. The SPA links to separate Army pages; no QR data.
const fs179 = require('node:fs'), path179 = require('node:path'), { Module } = require('node:module');
const filename179 = path179.join(__dirname, 'frontend_check.cjs');
const source179 = fs179.readFileSync(filename179, 'utf8');
const starts179 = [...source179.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts179.length !== 1) throw Error('one original frontend fixture boundary required');
const body179 = String.raw`
(async () => {
  await siteUser(MEMBER, {global_name:'Synthetic member'}); await character(MEMBER,'Mia One','Player-1-0001');
  await siteUser(OTHER, {global_name:'Synthetic unconfirmed'}); await siteUser(STAFF, {global_name:'Synthetic administrator'});
  await siteUser(DENIED, {global_name:'Synthetic refused',denied:1});
  const banned179='300000000000000181';await siteUser(banned179,{global_name:'Synthetic banned'});await character(banned179,'Banned Example','Player-1-0181');await fixtureRun('UPDATE members SET banned=1 WHERE discord_id=?',banned179);
  for(const who of [MEMBER,OTHER,STAFF,DENIED,banned179]) await cookieFor(who);
  const settingsBefore179=JSON.stringify(db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all());
  const nativeBefore179=JSON.stringify(db.prepare('SELECT * FROM privacy_write_admission').all());
  const features179={COMMUNITY_FEATURES:'directory'};
  function observe179(page){const calls=[];page.before((pathname,init)=>{calls.push({pathname,method:init.method||'GET'});return false;});return calls;}
  const isArmyRequest179=c=>/army|\/local\/|census\/preview|__army/.test(c.pathname);
  const member179=await openPage(MEMBER,features179),memberCalls179=observe179(member179);
  await member179.go('#/community');
  check('admitted Community offers an Army status card without enabling Census or News',!!member179.app.querySelector('a.card[href="#/community/army"]')&&!member179.boot.community.features.census);
  await member179.go('#/community/army');
  check('Army has a distinct current title and selected tab',member179.document.title==='Community · Army — Olympus'&&!!member179.app.querySelector('nav[aria-label="Community sections"] a[href="#/community/army"][aria-current="page"]'));
  check('shipping Army hub links to the separate public reader without inventing figures',!!member179.app.querySelector('[data-army-qr-review="public-reader"]')&&!!member179.app.querySelector('a[href="/army"]')&&member179.app.textContent.includes('authorized reporters deliberately reviewed and published'));
  const reader179=byText(member179.app,'a','Open the Army page');
  check('member hub exposes only a reader link and no QR input, capture or iframe',!!reader179&&!member179.app.querySelector('a[href="/army/report"]')&&!member179.app.querySelector('iframe')&&!member179.app.querySelector('video')&&!member179.app.querySelector('canvas')&&!member179.app.querySelector('textarea')&&!member179.app.querySelector('input[type="file"]'));
  reader179.click(); await settle();
  check('clicking the link loads no dormant asset or inline collector and calls no upload or loopback transport',memberCalls179.every(c=>!isArmyRequest179(c))&&!member179.document.head.querySelector('script[src^="/static/army-qr-review/"]')&&!member179.document.head.querySelector('script[src^="/static/army-live/"]'));
  member179.window.OlympusArmyQrRelease={activationEnabled:true,uploadsEnabled:true,storageEnabled:true};
  member179.window.ARMY_QR_ENABLED=true; member179.window.ARMY_QR_UPLOADS_ENABLED=true;
  await member179.go('#/community'); await member179.go('#/community/army');
  check('hostile browser globals cannot start collection or expose a reporter link to the member hub',!!member179.app.querySelector('a[href="/army"]')&&!member179.app.querySelector('a[href="/army/report"]')&&memberCalls179.every(c=>!isArmyRequest179(c))&&!member179.document.head.querySelector('script[src^="/static/army-live/"]'));
  member179.document.hidden=true; member179.document.dispatchEvent(new Event('visibilitychange'));
  member179.document.hidden=false; member179.document.dispatchEvent(new Event('visibilitychange')); await settle();
  check('visibility transitions do not autostart capture or acquire data',memberCalls179.every(c=>!isArmyRequest179(c))&&!member179.document.head.querySelector('script[src^="/static/army-qr-review/"]'));
  await member179.go('#/guide/member');
  check('leaving the Army status page leaves no form, retained preview or collection module',!member179.app.querySelector('[data-army-qr-review]')&&!member179.app.querySelector('iframe')&&!member179.document.head.querySelector('script[src^="/static/army-qr-review/"]'));
  const admin179=await openPage(STAFF,features179),adminCalls179=observe179(admin179);await admin179.go('#/community/army');
  check('existing administrator read permission exposes the separate admitted publisher link without capture',admin179.boot.user.isAdmin===true&&admin179.boot.community.capabilities.confirmedGuildData===false&&!!admin179.app.querySelector('[data-army-qr-review="public-reader"]')&&!!admin179.app.querySelector('a[href="/army/report"]')&&adminCalls179.every(c=>!isArmyRequest179(c))&&!admin179.app.querySelector('video'));
  await admin179.go('#/community/census');
  check('Army review does not broaden legacy Census verified-character admission',!admin179.app.querySelector('[data-census-form]')&&adminCalls179.every(c=>c.pathname!=='/api/community/census/preview'));
  const unconfirmed179=await openPage(OTHER,features179),unconfirmedCalls179=observe179(unconfirmed179);await unconfirmed179.go('#/community/army');
  check('ordinary eligible identity discovers the signed-in Army reader without character proof or capture',!!unconfirmed179.app.querySelector('[data-army-qr-review]')&&!!unconfirmed179.app.querySelector('a[href="#/community/army"]')&&!!unconfirmed179.app.querySelector('a[href="/army"]')&&!unconfirmed179.app.querySelector('a[href="/army/report"]')&&unconfirmed179.app.textContent.includes('Signed-in Olympus member')&&unconfirmedCalls179.every(c=>!isArmyRequest179(c)));
  await unconfirmed179.go('#/community');
  check('ordinary eligible account can discover only the Army card without granting member data',!!unconfirmed179.app.querySelector('a.card[href="#/community/army"]')&&unconfirmedCalls179.every(c=>!isArmyRequest179(c)));
  await unconfirmed179.go('#/community/directory');
  check('ordinary Army access does not bypass the existing directory membership check',!unconfirmed179.app.querySelector('[data-army-qr-review]')&&unconfirmed179.app.textContent.includes('Membership check needed')&&unconfirmedCalls179.every(c=>c.pathname!=='/api/community/directory'));
  await unconfirmed179.go('#/community/census');
  check('ordinary Army access does not grant legacy Census character admission',!unconfirmed179.app.querySelector('[data-census-form]')&&unconfirmedCalls179.every(c=>c.pathname!=='/api/community/census/preview'));
  const denied179=await openPage(DENIED,features179);
  check('denied identity gets its original public refusal before boot and cannot see Army collection controls',denied179.response.status===200&&denied179.boot===null&&denied179.app===null&&denied179.html.includes('This account cannot enter the guild site')&&!denied179.html.includes('data-army-qr-review'));
  const guest179=await openPage(null,features179);
  check('signed-out visitor receives only the original login surface without Army boot',guest179.boot===null&&guest179.app===null&&!guest179.html.includes('data-army-qr-review'));
  const off179=await openPage(MEMBER,{COMMUNITY_FEATURES:''}),offCalls179=observe179(off179);await off179.go('#/community/army');
  check('signed-in Army navigation stays discoverable while every legacy Community feature is OFF',!!off179.app.querySelector('[data-army-qr-review]')&&!!off179.app.querySelector('a[href="/army"]')&&offCalls179.every(c=>!isArmyRequest179(c))&&!off179.app.querySelector('a[href="#/community/census"]'));
  check('Community OFF keeps the old dropdown absent while independent Army and Game updates links remain',off179.app.querySelectorAll('details.nav-group summary').every(el=>el.textContent!=='Community')&&!!off179.app.querySelector('nav.nav a[href="#/community/army"]')&&!!off179.app.querySelector('nav.nav a[href="#/updates"]'));
  await off179.go('#/community/directory');
  check('Army-only navigation never switches on the disabled legacy Community pages',off179.app.textContent.includes('not switched on yet')&&!off179.app.querySelector('[data-army-qr-review]')&&offCalls179.every(c=>!isArmyRequest179(c)));
  for(const overrides179 of [features179,{COMMUNITY_FEATURES:''},{...features179,SITE_ADMINS:banned179}]){
    const bannedPage179=await openPage(banned179,overrides179),bannedCalls179=observe179(bannedPage179);await bannedPage179.go('#/community/army');
    check('current banned identity has no Army navigation, reader, publisher or capture even with Admin configuration and Community '+(overrides179.COMMUNITY_FEATURES?'ON':'OFF'),bannedPage179.boot.community.capabilities.applicantWrite===true&&bannedPage179.boot.community.capabilities.armyRead===false&&!bannedPage179.app.querySelector('a[href="#/community/army"]')&&!bannedPage179.app.querySelector('[data-army-qr-review]')&&!bannedPage179.app.querySelector('a[href="/army"]')&&!bannedPage179.app.querySelector('a[href="/army/report"]')&&bannedPage179.app.textContent.includes('Army access is not available')&&bannedCalls179.every(c=>!isArmyRequest179(c)));
    await bannedPage179.go('#/community');
    check('current banned identity has no Army overview card or private member request',!bannedPage179.app.querySelector('a.card[href="#/community/army"]')&&bannedCalls179.every(c=>!isArmyRequest179(c)));
  }
  check('status honestly distinguishes unsigned observations from people or membership proof',member179.window.OlympusArmyQrRelease.activationEnabled===true&&APP_JS.includes('Volunteer observations do not establish game origin, membership or complete guild coverage')&&APP_JS.includes('Reported characters, not unique people'));
  check('focused Army navigation preserves fixture settings and Native E2 admission rows',settingsBefore179===JSON.stringify(db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all())&&nativeBefore179===JSON.stringify(db.prepare('SELECT * FROM privacy_write_admission').all()));
  // Real signout last: the original fixture never adopts a revoked incarnation.
  await member179.go('#/community/army'); byText(member179.app,'button','Sign out').click(); await settle();
  // This leaf qualifies request initiation only; original Native logout completion
  // and document replacement remain covered by the existing authentication suites.
  check('normal signout initiates only its existing logout without an Army request or replacement operation',memberCalls179.filter(c=>c.pathname==='/auth/logout'&&c.method==='POST').length===1&&memberCalls179.every(c=>!isArmyRequest179(c)));
  console.log('\n'+ok+'/'+n+' staged Army frontend checks passed');process.exit(ok===n?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
`;
const execution179=new Module(filename179,module);execution179.filename=filename179;execution179.paths=Module._nodeModulePaths(path179.dirname(filename179));execution179._compile(source179.slice(0,starts179[0].index)+'\n'+body179,filename179);
