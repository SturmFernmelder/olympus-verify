'use strict';
// Evergreen 12 Nov 2026, lane ui280. Piece 1 (Parts A, B): the launch roster view for officer-operations-v234.
// Piece 2 (Part C): the News activity table (/static/activity280.js) through the real News route and /api/news.
// Piece 3 (Part D): the owner's receipt-note cleanup (/static/note-redaction280.js) through the real admin route and
// the real POST /api/admin/treasury/ledger/note-redaction on synthetic receipts in the in-memory database.
// Round 2: Parts E (member picker), F (cleanup after a lost apply) and G (News count time).
// Round 3 (13 Nov 2026): Part H (the cleanup under Codex's final error contract, b908253), Part I (launch invite rows
// from the v233 and v242 evidence sources), E10 (the "verified in game" badge) and G3/G4 (the News heading hook).
// Round 4 (13 Nov 2026): Part J (the launch page cursor bound is the generic reader's 4,096, in its alphabet) and
// Part K (cleanup wording after an earlier completion or a read but unrecognised reply; the unreadable earlier record).
// Part A runs the real view module (/static/launch-operations234.js) against pages made by the real
// producer (worker/src/launch-operations229.ts, native-rank-schemes.ts) in the repo's DOM fixture.
// Part B runs the real app.js admin route against the real Worker and SQLite (frontend_check.cjs,
// the same reuse as frontend_launch229_test.cjs), then fixed producer pages through its fetch hook.
// No provider, native or production call. Run from worker/: node tests/evergreen1112_ui280_test.cjs
const fsUi280=require('node:fs'),pathUi280=require('node:path'),{Module:ModuleUi280}=require('node:module');
const fixtureUi280=fsUi280.readFileSync(pathUi280.join(__dirname,'frontend_check.cjs'),'utf8'),cutsUi280=[...fixtureUi280.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cutsUi280.length!==1)throw Error('ui280_original_frontend_fixture_boundary');
// Round 5 (13 Nov 2026): UI280_APP_JS=<file> runs these checks against another page script (the base b631136 for the
// fail-before receipt, or to regenerate the v234 DOM record); UI280_STATIC_DIR does the same for the v235 module.
const APP_LINE_UI280='const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
if(fixtureUi280.split(APP_LINE_UI280).length!==2)throw Error('ui280_app_js_line_moved');
const runUi280=String.raw`
(async()=>{
 const crypto=require('node:crypto'),pure=require('./helpers/pure_source218.cjs');
 const ranks=pure.loadPureSource218(root,'native-rank-schemes'),ops=pure.loadPureSource218(root,'launch-operations229');
 const MODULE_FILE=path.join(root,'public','static','launch-operations234.js');
 let MODULE_SRC=null;try{MODULE_SRC=fs.readFileSync(MODULE_FILE,'utf8');}catch{}
 const install=win=>{vm.runInNewContext(MODULE_SRC,{window:win,Object,Array,JSON,String,Number,RegExp,Map,Set,Error},{filename:'launch-operations234.js'});return win.OlympusLaunch234;};
 const at=Math.floor(Date.now()/1000),NAMES=[...ranks.DIRECTIVE_RANK_NAMES];
 const R=(name,guid,slot,verification='verified')=>({name,guid,currentSlot:slot,rank:NAMES[slot],verification,level:40,lastOnlineSeconds:3600});
 const rows=[R('Synthetic Leader','Player-1-0001',0),R('Synthetic Far Knight','Player-1-0002',9),R('Synthetic Near Knight','Player-1-0003',6),R('Synthetic Initiate','Player-1-0004',9),R('Synthetic Alt','Player-1-0005',8),R('Synthetic Newcomer','Player-1-0006',9,'unverified')];
 const knights=new Map([['Player-1-0002','knight'],['Player-1-0003','knight'],['Player-1-0004','non-knight'],['Player-1-0005','non-knight']]);
 const wire=v=>JSON.parse(JSON.stringify(v));
 const ready=()=>{const d=wire(ops.projectLaunchOperations229({snapshotId:7,snapshotAt:at,memberCount:rows.length,guild:'OLYMPUS PRIME',realm:'Fixture Realm',scopeHash:'a'.repeat(16),nativeRankTable:{version:1,names:[...NAMES]}},rows,knights,at,at+60));d.scan={id:'b'.repeat(32),startedAt:at,expiresAt:at+600};d.pageCursor='synthetic-page0.'+'0'.repeat(64);return d;}; // round 4: in the reader's cursor alphabet
 const heldPage=()=>wire(ops.projectLaunchOperations229(null,[],new Map(),at,at+60));
 const OLD=['Guild Master','Stewart','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Initiate'];
 // The v233 page as the previous producer shaped it (dfca7a2 launch-operations229.ts: targets 6 and 8, no rank fields).
 const legacy=()=>{const d=ready();d.protocol='officer-operations-v233';delete d.rankProfile;delete d.rankSchemeDigest;delete d.rankNames;for(const r of d.promotions){r.targetSlot=r.reason==='knight-veteran'?6:8;}return d;};
 const texts=el=>el?String(el.textContent):'';

 console.log('\n== Part A: the real view module against real producer pages ==');
 check('A1 the v234 view module exists as its own static file',MODULE_SRC!==null,MODULE_FILE);
 let L=null;try{if(MODULE_SRC!==null)L=install(makeWindow('{}').window);}catch(e){console.log('    ',e.message);}
 if(L){
  const w=makeWindow('{}'),doc=w.document;
  const hh=(tag,props,...kids)=>{const el=doc.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v===undefined||v===null||v===false)continue;if(k==='class')el.className=v;else if(k==='text')el.textContent=v;else el.setAttribute(k,v===true?'':String(v));}for(const k of kids.flat(9)){if(k===null||k===undefined||k===false||k==='')continue;el.appendChild(typeof k==='object'?k:doc.createTextNode(String(k)));}return el;};
  const ui={h:hh,frame:(title,aside,...body)=>hh('section',{class:'frame'},hh('div',{class:'plaque'},hh('h2',{text:title}),aside||null),...body)};
  const serial='olympus-native-ranks|1|10|'+NAMES.map((n,i)=>i+':'+Buffer.byteLength(n)+':'+n).join('|');
  check('A2 pinned profile, names and digest equal the producer constants, and the digest is SHA-256 of the generator serial',L.PROFILE===ranks.DIRECTIVE_NATIVE_PROFILE&&L.DIGEST===ranks.DIRECTIVE_RANK_DIGEST&&JSON.stringify(L.NAMES)===JSON.stringify(NAMES)&&crypto.createHash('sha256').update(serial).digest('hex')===L.DIGEST&&L.PROTOCOL===ops.LAUNCH_OPERATIONS_PROTOCOL229);
  const d=ready();
  check('A3 a real ready v234 page is admitted and carries the three promotions the producer made',L.assess(d,null).ok===true&&d.status==='ready'&&JSON.stringify(d.promotions.map(r=>[r.name,r.currentSlot,r.targetSlot]))===JSON.stringify([['Synthetic Far Knight',9,5],['Synthetic Near Knight',6,5],['Synthetic Initiate',9,7]]),JSON.stringify(d.promotions));
  check('A4 an ordinary Alt at slot 8 is not a promotion and the unverified Initiate is review-only',!d.promotions.some(r=>r.guid==='Player-1-0005')&&d.riskBuffer.length===1&&d.riskBuffer[0].guid==='Player-1-0006');
  const path=(slot,reason)=>L.steps({currentSlot:slot,targetSlot:reason==='knight-veteran'?5:7}).map(s=>s.fromName+'>'+s.toName);
  check('A5 the path shows every separate step: Initiate 9 > Alt 8 > Member 7 is two clicks, a Knight needs one to four',JSON.stringify(path(9,'verified-initiate'))===JSON.stringify(['Initiate>Alt','Alt>Member'])&&path(9,'knight-veteran').length===4&&path(8,'knight-veteran').length===3&&path(7,'knight-veteran').length===2&&path(6,'knight-veteran').length===1&&path(9,'knight-veteran')[0]==='Initiate>Alt'&&path(9,'knight-veteran')[3]==='Raider>Veteran');
  const groups=hh('div',null,L.promotionGroups(d,true,ui));
  const rowOf=guid=>groups.querySelector('[data-launch-promotion229="'+guid+'"]');
  check('A6 rendered rows show current rank, final target, each step and the clicks that remain',
   rowOf('Player-1-0004')?.getAttribute('data-launch234-steps')==='2'&&texts(rowOf('Player-1-0004')).includes('Initiate (slot 9)')&&texts(rowOf('Player-1-0004')).includes('Member (slot 7)')
   &&rowOf('Player-1-0004').querySelectorAll('li').map(li=>li.textContent).join('|')==='Initiate to Alt (slot 8)|Alt to Member (slot 7)'&&texts(rowOf('Player-1-0004')).includes('2 separate confirmed in-game clicks remaining')
   &&rowOf('Player-1-0002')?.getAttribute('data-launch234-steps')==='4'&&rowOf('Player-1-0003')?.getAttribute('data-launch234-steps')==='1'&&texts(rowOf('Player-1-0003')).includes('1 confirmed in-game click remaining')
   &&!texts(groups).includes('index')&&groups.querySelectorAll('button').length===0,texts(groups).slice(0,600));
  const stale=hh('div',null,L.promotionGroups(d,false,ui));
  check('A7 a stale page marks rows advisory, never eligible',stale.querySelectorAll('[data-launch-promotion229]').length===0&&stale.querySelectorAll('[data-launch-advisory229]').length===3&&texts(stale).includes('Stale advisory'));
  const table=L.rankFrame(d,ui),cells=table.querySelectorAll('tbody tr').map(tr=>texts(tr));
  check('A8 the rank table in force lists ten names by slot, the profile, a short digest and the full digest behind a disclosure',cells.length===10&&cells[0]==='0Guild Master'&&cells[8]==='8Alt'&&cells[9]==='9Initiate'&&!texts(table).includes('Stewart')
   &&texts(table.querySelector('[data-launch234-digest-short]'))==='84be4203…ea98bd29'&&texts(table.querySelector('[data-launch234-digest]'))===L.DIGEST&&table.querySelector('[data-launch234-digest]').parentNode.tagName==='DETAILS'&&table.querySelector('summary')?.parentNode.tagName==='DETAILS'&&texts(table).includes(L.PROFILE)&&table.querySelectorAll('button').length===0,texts(table));
  const held=heldPage();
  check('A9 a real held page (null rank fields) is admitted as held and says the table is not confirmed',L.assess(held,null).ok===true&&held.status==='held'&&held.rankProfile===null&&!!L.rankFrame(held,ui).querySelector('[data-launch234-ranks="unconfirmed"]'));
  const cases=[
   ['legacy v233 page',legacy(),'legacy-protocol'],
   ['unknown newer protocol',Object.assign(ready(),{protocol:'officer-operations-v235'}),'unknown-protocol'],
   ['not an object',null,'unknown-protocol'],
   ['unknown status',Object.assign(ready(),{status:'paused'}),'unknown-status'],
   ['ready page with null profile',Object.assign(ready(),{rankProfile:null}),'malformed-rank-table'],
   ['ready page with all rank fields null',Object.assign(ready(),{rankProfile:null,rankSchemeDigest:null,rankNames:null}),'malformed-rank-table'],
   ['nine rank names',Object.assign(ready(),{rankNames:NAMES.slice(0,9)}),'malformed-rank-table'],
   ['empty rank name',Object.assign(ready(),{rankNames:NAMES.map((n,i)=>i===8?'':n)}),'malformed-rank-table'],
   ['digest not 64 hex',Object.assign(ready(),{rankSchemeDigest:'XYZ'}),'malformed-rank-table'],
   ['missing digest field',(()=>{const x=ready();delete x.rankSchemeDigest;return x;})(),'malformed-rank-table'],
   ['unknown profile',Object.assign(ready(),{rankProfile:'olympus-prime-directive-20261113-v2'}),'unknown-profile'],
   ['unknown digest',Object.assign(ready(),{rankSchemeDigest:'c'.repeat(64)}),'unknown-digest'],
   ['old Stewart ladder names',Object.assign(ready(),{rankNames:OLD}),'unknown-rank-names'],
   ['row carrying a website intent',(()=>{const x=ready();x.promotions[2].intent={version:1};return x;})(),'unknown-row-shape'],
   ['row carrying a token',(()=>{const x=ready();x.promotions[2].intentToken='a.'+'b'.repeat(64);return x;})(),'unknown-row-shape'],
   ['old Veteran 6 target',(()=>{const x=ready();x.promotions[0].targetSlot=6;return x;})(),'unknown-row-shape'],
   ['Alt 8 relabelled as an Initiate promotion',(()=>{const x=ready();x.promotions[2].currentSlot=8;return x;})(),'unknown-row-shape'],
   ['target relabelled Member at slot 8',(()=>{const x=ready();x.promotions[2].targetSlot=8;return x;})(),'unknown-row-shape'],
   ['Knight already at Veteran',(()=>{const x=ready();x.promotions[0].currentSlot=5;return x;})(),'unknown-row-shape'],
   ['held row without a reason',(()=>{const x=ready();x.held=[{name:'Synthetic Held',guid:'Player-1-0009'}];return x;})(),'unknown-row-shape'],
   ['hold reason not a string',Object.assign(ready(),{heldReasons:[7]}),'unknown-row-shape'],
  ];
  const wrong=cases.filter(([,page,code])=>{const v=L.assess(page,null);return v.ok!==false||v.code!==code||typeof v.text!=='string'||/officer-operations|v23\d/.test(v.text);});
  check('A10 every unknown protocol, profile, digest, names, status and row shape is refused with its own plain reason ('+cases.length+' cases)',wrong.length===0,JSON.stringify(wrong.map(([name,page])=>[name,L.assess(page,null)])));
  const before=Object.assign(ready(),{rankProfile:null,rankSchemeDigest:null,rankNames:null,status:'held',promotions:[],riskBuffer:[]});
  check('A11 a continued page whose rank table differs from the first page is refused',L.assess(ready(),before).code==='rank-table-changed'&&L.assess(ready(),ready()).ok===true);
  const notice=L.heldNotice(L.assess(legacy(),null),ui);
  check('A12 the held notice explains the refusal and offers no control',notice.querySelectorAll('button,input,select,a').length===0&&texts(notice).includes('before 12 November')&&texts(notice).includes('Nothing was selected or sent'));
  const known=['native-unguilded-proof-required','entitlement-expired','native-snapshot-unavailable','native-rank-scheme-unconfirmed','native-identity-ambiguous','flagship-native-scope-unconfirmed','directive-rank-policy-held','native-secret-unconfigured','selection-source-not-current','selected-target-unavailable','promotion-actor-unconfirmed','selected-native-page-ambiguous','native-snapshot-changed','launch-page-verification-changed','selection-read-expired','launch-read-window-exhausted','officer-invite-read-deferred','discord-rate-limited','discord-entitlement-unavailable','officer-invite-read-held','officer-invite-source-held','officer-invite-standing-held','officer-invite-current-policy-held','officer-invite-read-unknown'];
  check('A13 every hold the producer can send has a plain explanation; an unknown one is named as unknown',known.every(code=>!L.holdText(code).startsWith('Held for a reason')&&!L.holdText(code).includes(code))&&L.holdText('future-hold').includes('does not recognise')&&L.holdText('future-hold').includes('future-hold')&&['native-rank-unconfirmed','pending-verification','verification-unknown','discord-entitlement-unknown','same-intent-continuation-held'].every(code=>!L.rowHoldText(code).startsWith('Held (code')));
  check('A14 the module never writes HTML, fetches or stores',!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/.test(MODULE_SRC));
 } else for(const name of ['A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14'])check(name+' (module unavailable)',false);

 console.log('\n== Part B: the real app.js admin route ==');
 await siteUser(STAFF,{global_name:'Synthetic launch officer'});await siteUser(MEMBER,{global_name:'Synthetic ordinary reader'});
 const SCRIPT='script[src="/static/launch-operations234.js"]';
 const supply=async pg=>{const asked=await waitFor(()=>!!pg.document.head.querySelector(SCRIPT),'the v234 view module request',3000);if(!asked)return false;if(!pg.window.OlympusLaunch234)install(pg.window);pg.document.head.querySelector(SCRIPT).dispatchEvent(new Event('load'));await settle();return true;};
 const page=await openPage(STAFF);await page.go('#/admin/launch-operations');
 const asked=MODULE_SRC!==null&&await supply(page);
 check('B1 the admin route loads the v234 view module as a member script',asked);
 // Round 5 build (13 Nov 2026): the real admin route answers only officer-operations-v235 now
 // (site-launch229.ts handleDiscoveryOperations235), so the page also asks for the v235 reader; the fixture serves it.
 const D_SRC_B=fs.readFileSync(path.join(process.env.UI280_STATIC_DIR||path.join(root,'public','static'),'launch-discovery235.js'),'utf8'),D_SEL_B='script[src="/static/launch-discovery235.js"]';
 const supply235=pg=>{const u=pg.document.head.querySelector(D_SEL_B);if(u&&!pg.window.OlympusDiscovery235){vm.runInNewContext(D_SRC_B,{window:pg.window,Object,Array,JSON,String,Number,RegExp,Map,Set,Error},{filename:'launch-discovery235.js'});u.dispatchEvent(new Event('load'));}};
 await waitFor(()=>{supply235(page);return !!page.app.querySelector('#launch-motd229')||page.app.textContent.includes('could not be confirmed')||!!page.app.querySelector('[data-launch234-held]');},'real launch read settlement',8000);
 const view=()=>page.app.querySelector('[data-launch234]');
 const realB2=await (await indexMod.default.fetch(new Request('https://guild.example/api/admin/launch-operations',{headers:{Origin:'https://guild.example','X-Olympus':'2',Cookie:await cookieFor(STAFF)}}),env({ASSETS:governanceAssets}),ctx)).json();
 check('B2 the real Worker page (v235, held) renders through the v235 reader: copy-only MOTD, each hold once in plain words, rank table not confirmed, no promotion, no refusal',realB2.protocol==='officer-operations-v235'&&realB2.status==='held'&&!!page.document.head.querySelector(D_SEL_B)&&!!page.app.querySelector('#launch-motd229')&&!!view()&&!page.app.querySelector('[data-launch234-held]')&&!!page.app.querySelector('[data-launch234-hold="flagship-native-scope-unconfirmed"]')&&page.app.textContent.includes('The site is not set up to read the OLYMPUS PRIME roster.')
  &&JSON.stringify(page.app.querySelectorAll('[data-launch234-hold]').map(li=>li.getAttribute('data-launch234-hold')))===JSON.stringify([...new Set(realB2.heldReasons)])&&page.app.querySelectorAll('[data-launch234-hold]').every(li=>!li.textContent.includes(li.getAttribute('data-launch234-hold'))&&!li.textContent.startsWith('Held for a reason'))
  &&!!page.app.querySelector('[data-launch234-ranks="unconfirmed"]')&&!page.app.querySelector('[data-launch-promotion229]'),JSON.stringify({protocol:realB2.protocol,status:realB2.status,heldReasons:realB2.heldReasons}),page.app.textContent.slice(-900));
 let reads=[],dto=ready();page.intercept((url,init)=>{if(url.startsWith('/api/admin/launch-operations')){reads.push((init.method||'GET')+' '+url);return new Response(JSON.stringify(dto),{status:200});}return null;});
 await page.go('#/');await page.go('#/admin/launch-operations');
 await waitFor(()=>!!page.app.querySelector('[data-launch-promotion229]')||page.app.textContent.includes('could not be confirmed')||!!page.app.querySelector('[data-launch234-held]'),'ready page settlement',8000);
 const buttons=()=>(view()?view().querySelectorAll('button'):[]).map(b=>b.textContent).sort().join('|');
 const row=guid=>page.app.querySelector('[data-launch-promotion229="'+guid+'"]');
 check('B3 a current v234 page shows the rank table in force with its profile and digest',!!page.app.querySelector('[data-launch234-ranks="current"]')&&page.app.textContent.includes('Rank table in force')&&page.app.textContent.includes(ranks.DIRECTIVE_NATIVE_PROFILE)&&page.app.querySelector('[data-launch234-digest]')?.textContent===ranks.DIRECTIVE_RANK_DIGEST,page.app.textContent.slice(-1500));
 check('B4 promotions show the current rank, final target and every in-game step (2 for an Initiate via Alt, 4 and 1 for Knights)',row('Player-1-0004')?.getAttribute('data-launch234-steps')==='2'&&row('Player-1-0002')?.getAttribute('data-launch234-steps')==='4'&&row('Player-1-0003')?.getAttribute('data-launch234-steps')==='1'&&!row('Player-1-0005')&&page.app.textContent.includes('Initiate to Alt (slot 8)')&&page.app.textContent.includes('Alt to Member (slot 7)'));
 check('B5 the stale index 6/8 copy is gone and the page offers no selection or rank control',!page.app.textContent.includes('(index 6)')&&!page.app.textContent.includes('(index 8)')&&buttons()==='Copy MOTD|Copy expanded bulletin|Load next 20 role checks|Recheck this page|Refresh first page|Scan entire roster|Stop scan'&&reads.every(r=>r.startsWith('GET /api/admin/launch-operations')),buttons());
 const shown=async(label,next,code)=>{dto=next;reads=[];await page.go('#/');await page.go('#/admin/launch-operations');await waitFor(()=>!!page.app.querySelector('[data-launch234-held]')||!!page.app.querySelector('#launch-motd229'),label,8000);
  const held=page.app.querySelector('[data-launch234-held]');return !!held&&held.getAttribute('data-launch234-held')===code&&!page.app.querySelector('#launch-motd229')&&!page.app.querySelector('[data-launch-promotion229]')&&!page.app.querySelector('[data-launch-advisory229]')&&buttons()==='Load next 20 role checks|Refresh first page|Scan entire roster|Stop scan'&&reads.length===1;};
 check('B6 a legacy v233 page is held with a plain notice and nothing from it is shown',await shown('legacy page',legacy(),'legacy-protocol'),page.app.textContent.slice(-700));
 check('B7 a ready page with a null profile is held',await shown('null profile',Object.assign(ready(),{rankProfile:null}),'malformed-rank-table'));
 check('B8 an unknown digest is held',await shown('unknown digest',Object.assign(ready(),{rankSchemeDigest:'d'.repeat(64)}),'unknown-digest'));
 check('B9 an unknown status is held',await shown('unknown status',Object.assign(ready(),{status:'paused'}),'unknown-status'));
 check('B10 a promotion row with an extra field is held',await shown('extra field',(()=>{const x=ready();x.promotions[0].intentToken='t.'+'0'.repeat(64);return x;})(),'unknown-row-shape'));
 // Round 5 build: the v235 reader is loaded on this page now (B2), yet a v234 reply is still read by the strict reader
 // alone: a v234 page in the rank-held shape (partial, no rank table) is refused, as it always was.
 const rankHeld234=Object.assign(ready(),{status:'partial',rankProfile:null,rankSchemeDigest:null,rankNames:null,promotions:[],riskBuffer:[],heldReasons:['native-rank-scheme-unconfirmed'],held:[{guid:'Player-1-0001',name:'Synthetic Leader',reason:'native-rank-scheme-unconfirmed'}]});
 check('B14 with the v235 reader loaded, a v234 reply is read only by the strict v234 reader: a v234 page in the rank-held shape is refused as before',!!page.window.OlympusDiscovery235&&await shown('v234 rank-held shape',rankHeld234,'malformed-rank-table')&&page.app.querySelector('[data-launch234-held]')?.textContent===page.window.OlympusLaunch234.assess(rankHeld234,null).text&&!page.app.querySelector('[data-launch235-rank-held]'),page.app.textContent.slice(-500));
 reads=[];page.intercept((url,init)=>{if(url.startsWith('/api/admin/launch-operations')){reads.push(url);return Promise.reject(new TypeError('the network dropped the answer'));}return null;});
 await page.go('#/');await page.go('#/admin/launch-operations');await waitFor(()=>page.app.textContent.includes('could not be confirmed'),'lost reply',8000);await new Promise(r=>setTimeout(r,1200));
 check('B11 a lost reply is shown as unconfirmed and is never resent on its own',page.app.textContent.includes('could not be confirmed')&&reads.length===1&&!page.app.querySelector('[data-launch-promotion229]'),String(reads.length));
 byText(page.app,'button','Refresh first page').click();await settle();await settle();
 check('B12 Refresh reads again only when pressed',reads.length===2);
 const ordinary=await openPage(MEMBER);await ordinary.go('#/admin/launch-operations');await settle();
 check('B13 an ordinary member gets no launch view and the module is never requested',!ordinary.app.querySelector('#launch-motd229')&&!ordinary.app.querySelector('[data-launch234]')&&!ordinary.document.head.querySelector(SCRIPT));
 // ---------------------------------------------------------------- Piece 2: the activity table on News
 console.log('\n== Part C: News activity presentation (the real app.js News route and the real /api/news) ==');
 const ACT_FILE=path.join(root,'public','static','activity280.js'),ACT_SRC=fs.readFileSync(ACT_FILE,'utf8');
 const ACT_SEL='script[src="/static/activity280.js"]';
 // The repo's DOM fixture has appendChild only; activity280.js uses ParentNode.append, as every current browser has it.
 if(!Element.prototype.append)Element.prototype.append=function(...nodes){for(const node of nodes)this.appendChild(node);};
 const installActivity=pg=>{if(!pg.window.OlympusActivity280)vm.runInNewContext(ACT_SRC,{window:pg.window,document:pg.document,Number,Math,String,Object,Array},{filename:'activity280.js'});};
 const supplyScript=async(pg,sel,install,fail=false)=>{const asked=await waitFor(()=>!!pg.document.head.querySelector(sel),sel+' request',4000);if(!asked)return false;if(!fail)install(pg);pg.document.head.querySelector(sel).dispatchEvent(new Event(fail?'error':'load'));for(let i=0;i<6;i++)await settle();return true;};
 const READER='300000000000000311';
 await siteUser(READER,{global_name:'Synthetic News reader'});await character(READER,'Synthetic Reader','Player-1-0311');
 await fixtureRun("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsOn', '1', ?, NULL) ON CONFLICT(key) DO UPDATE SET value = excluded.value",now);
 const putFigures=async value=>fixtureRun("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsFigures', ?, ?, NULL) ON CONFLICT(key) DO UPDATE SET value = excluded.value",value===null?'not-json':JSON.stringify(value),now);
 const FIG={v:1,asOf:now-600,latestId:1,dayBaseId:null,weekBaseId:null,countingSince:now-9*86400,roster:{day:{joined:2,left:0},week:{joined:7,left:3}},applications:{day:{firstSaved:'few',decided:0},week:{firstSaved:6,decided:'few'}}};
 await putFigures(FIG);
 const newsApi=async()=>{const r=await indexMod.default.fetch(new Request('https://guild.example/api/news',{headers:{Cookie:await cookieFor(READER),'X-Olympus':'2'}}),env(),ctx);return {status:r.status,body:await r.json()};};
 const figFrame=pg=>{const h2=pg.app.querySelectorAll('h2').find(x=>x.textContent.trim()==='The guild in figures');return h2?h2.closest('section'):null;};
 const openNews=async()=>{const pg=await openPage(READER);await pg.go('#/news');await waitFor(()=>!!figFrame(pg),'the figures frame',8000);return pg;};
 const cellTexts=sec=>sec?sec.querySelectorAll('tbody tr').map(tr=>[tr.querySelector('th')?.textContent,...tr.querySelectorAll('td').map(td=>td.querySelector('span')?.textContent)]):[];
 const api1=await newsApi();
 check('C0 the real /api/news returns the seeded figures as members see them',api1.status===200&&JSON.stringify(api1.body.figures?.roster)===JSON.stringify(FIG.roster)&&JSON.stringify(api1.body.figures?.applications)===JSON.stringify(FIG.applications),JSON.stringify(api1.body.figures));
 const n1=await openNews(),before1=figFrame(n1);
 const listsFirst=!!before1&&before1.querySelectorAll('dl.kv').length===3&&!before1.querySelector('table');
 const askedAct=await supplyScript(n1,ACT_SEL,installActivity);
 check('C1 the News page shows the day and week lists at once and asks for /static/activity280.js as a member script',listsFirst&&askedAct,String(listsFirst)+' '+String(askedAct));
 const f1=figFrame(n1),sec1=f1&&f1.querySelector('[data-activity-comparison="news"]');
 const want=x=>x==='few'?'Fewer than 5':String(x),F=api1.body.figures||FIG;
 const expected=[['Characters joined',want(F.roster.day.joined),want(F.roster.week.joined)],['Characters left',want(F.roster.day.left),want(F.roster.week.left)],['Applications first saved',want(F.applications.day.firstSaved),want(F.applications.week.firstSaved)],['Decisions saved',want(F.applications.day.decided),want(F.applications.week.decided)]];
 check('C2 the lists are replaced by one table whose every number equals the /api/news response',!!sec1&&JSON.stringify(cellTexts(sec1))===JSON.stringify(expected)&&f1.querySelectorAll('dl.kv').length===0,JSON.stringify(cellTexts(sec1)));
 check('C3 the table is semantic: a caption, 3 column and 4 row headers with scope, bars only on exact numbers and hidden from assistive technology',!!sec1&&!!sec1.querySelector('caption')&&sec1.querySelectorAll('th[scope="col"]').length===3&&sec1.querySelectorAll('th[scope="row"]').length===4&&sec1.querySelectorAll('meter').length===6&&sec1.querySelectorAll('meter').every(m=>m.getAttribute('aria-hidden')==='true')&&!!sec1.closest('.table-wrap')===false&&!!sec1.querySelector('.table-wrap table.data'));
 const headingsIn=f1?f1.querySelectorAll('h2,h3,h4,h5').map(x=>x.tagName+':'+x.textContent.trim()):[];
 check('C4 headings stay in order under the frame (h2, then h3 for the table) and the source explanation and source strip are kept',JSON.stringify(headingsIn)===JSON.stringify(['H2:The guild in figures','H3:Activity at a glance'])&&!!f1.querySelector('[data-source-strip]')&&f1.textContent.includes('Joined and left compare complete, checked roster exports')&&f1.textContent.includes('do not add the columns'),JSON.stringify(headingsIn));
 await putFigures({...FIG,roster:{day:null,week:null}});
 const n2=await openNews();await supplyScript(n2,ACT_SEL,installActivity);const f2=figFrame(n2),sec2=f2&&f2.querySelector('[data-activity-comparison]');
 check('C5 with no roster history yet the existing explanation stays above the table and the roster cells read Unavailable, never 0',!!sec2&&f2.textContent.includes('Not enough roster history yet; counting began')&&JSON.stringify(cellTexts(sec2).slice(0,2))===JSON.stringify([['Characters joined','Unavailable','Unavailable'],['Characters left','Unavailable','Unavailable']]),f2&&f2.textContent.slice(0,400));
 await putFigures(FIG);
 const n3=await openNews();const failed=await supplyScript(n3,ACT_SEL,installActivity,true);const f3=figFrame(n3);
 check('C6 when the script cannot load, the existing lists stay with their numbers and no table appears',failed&&!!f3&&f3.querySelectorAll('dl.kv').length===3&&!f3.querySelector('table')&&f3.textContent.includes('2 joined, 0 left')&&f3.textContent.includes('7 joined, 3 left')&&f3.textContent.includes('fewer than 5'));
 const n4=await openPage(READER);n4.intercept(async(url)=>{if(url==='/api/news'){const real=await newsApi();real.body.figures.asOf=-1;return new Response(JSON.stringify(real.body),{status:200});}return null;});
 await n4.go('#/news');await waitFor(()=>!!figFrame(n4),'the figures frame',8000);await supplyScript(n4,ACT_SEL,installActivity);const f4=figFrame(n4);
 check('C7 figures the renderer declines keep the existing lists (no half-drawn table)',!!f4&&f4.querySelectorAll('dl.kv').length===3&&!f4.querySelector('table'));
 await putFigures(null);
 const n5=await openPage(READER);await n5.go('#/news');await waitFor(()=>!!figFrame(n5),'the figures frame',8000);await new Promise(r=>setTimeout(r,200));
 check('C8 withheld or missing figures keep the "No figures yet" fallback and the script is never requested',figFrame(n5).textContent.includes('No figures yet')&&!n5.document.head.querySelector(ACT_SEL));
 await putFigures(FIG);
 await fixtureRun("UPDATE site_settings SET value = '0' WHERE key = 'newsOn'");
 const n6=await openPage(READER);await n6.go('#/news');await settle();await settle();await new Promise(r=>setTimeout(r,200));
 check('C9 with News switched off the page says so and neither /api/news figures nor the script are shown',n6.app.textContent.includes('Town Crier dispatches are switched off.')&&!figFrame(n6)&&!n6.document.head.querySelector(ACT_SEL));
 await fixtureRun("UPDATE site_settings SET value = '1' WHERE key = 'newsOn'");
 const outsider='300000000000000312';await siteUser(outsider,{global_name:'Synthetic outsider'});
 const n7=await openPage(outsider);await n7.go('#/news');await settle();await settle();await new Promise(r=>setTimeout(r,200));
 check('C10 an account without News standing gets the standing notice and no figures or script',!figFrame(n7)&&!n7.document.head.querySelector(ACT_SEL));

 // ---------------------------------------------------------------- Piece 3: the owner's receipt-note cleanup
 console.log('\n== Part D: the receipt-note cleanup control (the real app.js route, module and Worker route) ==');
 const NR_FILE=path.join(root,'public','static','note-redaction280.js');let NR_SRC=null;try{NR_SRC=fs.readFileSync(NR_FILE,'utf8');}catch{}
 const NR_SEL='script[src="/static/note-redaction280.js"]',NR_PATH='/api/admin/treasury/ledger/note-redaction';
 const installNR=pg=>{if(!pg.window.OlympusNoteRedaction280)vm.runInNewContext(NR_SRC,{window:pg.window,JSON,Object,Number,String,Array,RegExp,Error,setTimeout,clearTimeout,AbortController},{filename:'note-redaction280.js'});};
 check('D0 the cleanup control is its own static module and never writes HTML, fetches, stores outside sessionStorage or logs',NR_SRC!==null&&!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\bfetch\(|XMLHttpRequest|localStorage|indexedDB|console\./.test(NR_SRC));
 let NR=null;if(NR_SRC!==null){const w=makeWindow('{}');vm.runInNewContext(NR_SRC,{window:w.window,JSON,Object,Number,String,Array,RegExp,Error,setTimeout,clearTimeout,AbortController});NR=w.window.OlympusNoteRedaction280;}
 if(NR){
  const P0={state:'preview',ceiling:90,receiptRows:11,coveredRows:10,notesToBlank:8,review:'{"id":"x"}.sig',expiresAt:now+600,confirmation:'BLANK RECEIPT NOTES',scope:'s'};
  const S0={state:'recorded',completion:{version:1,operationId:'0123abcd-0123-4abc-8def-0123456789ab',ceiling:90,blanked:8,completedAt:now},remainingCoveredNotes:0,unclassifiedReceiptRows:0,scope:'s'};
  const previewBad=[{...P0,note:'x'},{...P0,confirmation:'YES'},{...P0,notesToBlank:11},{...P0,receiptRows:-1},{...P0,review:'nodot'},{...P0,state:'recorded'},(()=>{const x={...P0};delete x.scope;return x;})()];
  const statusBad=[{...S0,notes:['x']},{...S0,state:'done'},{...S0,completion:{...S0.completion,note:'x'}},{...S0,completion:{...S0.completion,version:2}},{...S0,completion:null},{...S0,state:'not_recorded'},{...S0,remainingCoveredNotes:'0'}];
  check('D1 the module admits only the exact preview and status replies of the route; any extra, missing or odd field is refused',!!NR.readPreview(P0)&&!!NR.readStatus(S0)&&!!NR.readStatus({...S0,state:'not_recorded',completion:null})&&previewBad.every(x=>NR.readPreview(x)===null)&&statusBad.every(x=>NR.readStatus(x)===null));
  const R=(status,error)=>({status,data:error?{error}:null});
  check('D2 only refusals the route returns before any write count as refusals; a lost reply, a 5xx or an unknown code is not one',NR.refusal(R(403,'forbidden'))==='forbidden'&&NR.refusal({status:409,data:{error:'receipt_note_cleanup_held',message:'m',nextAction:'status'}})==='held'&&NR.refusal(R(409,'receipt_note_cleanup_held'))===null&&NR.refusal(R(400,'confirmation_required'))==='incomplete'&&NR.refusal(R(0,null))===null&&NR.refusal(R(500,'internal'))===null&&NR.refusal(R(200,'unreadable_answer'))===null&&NR.refusal(R(409,'conflict'))===null&&NR.refusal(R(429,'slow_down'))===null);
  // A hung apply at module level (the page uses 30 s; here 50 ms): shown as not confirmed, kept, never resent.
  const w=makeWindow('{}'),doc=w.document,calls=[];
  const hm=(tag,props,...kids)=>{const el=doc.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v===undefined||v===null||v===false)continue;if(k==='class')el.className=v;else if(k==='text')el.textContent=v;else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2),v);else if(k==='disabled')el.disabled=!!v;else el.setAttribute(k,v===true?'':String(v));}for(const c of kids.flat(9)){if(c===null||c===undefined||c===false||c==='')continue;el.appendChild(typeof c==='object'?c:doc.createTextNode(String(c)));}return el;};
  const box=doc.body.appendChild(doc.createElement('div'));
  const fakeApi=(method,p,body,opts)=>{calls.push(JSON.stringify(body));if(body.action==='preview')return Promise.resolve(P0);return new Promise((_,reject)=>{opts.signal.addEventListener?opts.signal.addEventListener('abort',()=>reject({status:0})):setTimeout(()=>reject({status:0}),60);});};
  const mounted=NR.mount(box,{h:hm,api:fakeApi,user:{id:NR.OWNER,isAdmin:true},live:()=>true,now:()=>now,fmtDateTime:String,storage:()=>w.sessionStorage,timeoutMs:50});
  const nobody=NR.mount(doc.createElement('div'),{h:hm,api:fakeApi,user:{id:'300000000000000004',isAdmin:true},live:()=>true,now:()=>now,fmtDateTime:String,storage:()=>w.sessionStorage});
  byText(box,'button','Count the notes').click();await waitFor(()=>!!byText(box,'button','Blank 8 notes'),'module confirm',2000);
  const tick=box.querySelector('#note-redaction280-understood');tick.checked=true;tick.dispatchEvent(new Event('change'));byText(box,'button','Blank 8 notes').click();
  await waitFor(()=>box.textContent.includes('Outcome not confirmed'),'module timeout',3000);await new Promise(r=>setTimeout(r,200));
  check('D3 an apply that gets no answer in time is shown as not confirmed with the exact request kept, and is sent once only',!!mounted&&nobody===null&&box.textContent.includes('did not answer within')&&calls.filter(c=>c.includes('"apply"')).length===1&&box.querySelector('textarea')?.value.includes('"review": "{\\"id\\":\\"x\\"}.sig"')&&box.querySelectorAll('button').map(b=>b.textContent).join('|')==='Read the stored status'&&JSON.parse(w.sessionStorage.getItem(NR.STORE)).request.body.action==='apply',box.textContent.slice(-500));
 } else for(const name of ['D1','D2','D3'])check(name+' (module unavailable)',false);

 const OTHER_ADMIN='300000000000000313';await siteUser(OTHER_ADMIN,{global_name:'Synthetic second admin'});
 const ADMINS={SITE_ADMINS:STAFF+','+OTHER_ADMIN};
 const NOTE='SYNTHETIC PRIVATE NOTE';
 const receipt=(i,source,note)=>({version:242,sourceId:source+'-'+i,source,character:'Synthetic Donor '+i,characterKey:'synthetic donor '+i,guid:'Player-1-00'+String(i).padStart(2,'0')+'AB',copper:100*i,items:[],note,evidence:{kind:'synthetic',confirmedLocal:false,automaticCredit:false},observedAt:now-100,classification:'unclassified_receipt',retainUntil:now+86400,payloadHash:'ORIGINAL-'+source+'-'+i});
 const seeds=[];for(let i=0;i<7;i++)seeds.push(receipt(i,'mail',i<5?NOTE+' mail '+i:''));for(let i=7;i<10;i++)seeds.push(receipt(i,'whisper-declaration',NOTE+' whisper '+i));seeds.push(receipt(10,'trade',''));
 for(const d of seeds)await fixtureRun("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'treasury.receipt242', ?, ?)",now,'intake242:'+d.sourceId,JSON.stringify(d));
 const auditRows=()=>db.prepare("SELECT id, ts, actor, action, subject, details FROM audit WHERE action = 'treasury.receipt242' ORDER BY id").all().map(r=>({...r}));
 const seeded=auditRows();
 const requests=[];const watch=pg=>pg.intercept((url,init)=>{if(url===NR_PATH)requests.push(String(init.body));return null;});
 const ctl=pg=>pg.app.querySelector('[data-note-redaction280]');
 const stageOf=pg=>pg.app.querySelector('[data-note-redaction280-stage]')?.getAttribute('data-note-redaction280-state');
 const ctlButtons=pg=>(ctl(pg)?ctl(pg).querySelectorAll('button'):[]).map(b=>b.textContent+(b.disabled?'(disabled)':'')).join('|');
 const openLedger=async(who,over=ADMINS)=>{const pg=await openPage(who,over);watch(pg);await pg.go('#/admin/donation-ledger');await waitFor(()=>pg.app.textContent.includes('Donation observations'),'the donation ledger',8000);return pg;};
 const noNote=pg=>!ctl(pg)||!ctl(pg).textContent.includes(NOTE);
 const other=await openLedger(OTHER_ADMIN);await new Promise(r=>setTimeout(r,300));
 check('D4 another site administrator sees the donation ledger but no cleanup control, and the module is never requested',other.app.textContent.includes('Donation observations')&&!ctl(other)&&!other.document.head.querySelector(NR_SEL));
 const plainMember=await openPage(MEMBER);await plainMember.go('#/admin/donation-ledger');await settle();await new Promise(r=>setTimeout(r,200));
 check('D5 an ordinary member gets neither the ledger nor the control',!ctl(plainMember)&&!plainMember.document.head.querySelector(NR_SEL)&&!plainMember.app.textContent.includes('Donation observations'));
 const o1=await openLedger(STAFF);const askedNR=NR_SRC!==null&&await supplyScript(o1,NR_SEL,installNR);
 check('D6 the owner account gets the control above the ledger with a count and a status read, and nothing is sent on opening',askedNR&&!!ctl(o1)&&stageOf(o1)==='idle'&&ctlButtons(o1)==='Count the notes|Read the stored status'&&requests.length===0&&ctl(o1).querySelector('h2')?.textContent==='Receipt note cleanup',ctlButtons(o1));
 const clickIn=async(pg,text)=>{const b=ctl(pg)&&byText(ctl(pg),'button',text);if(!b)return false;b.click();for(let i=0;i<4;i++)await settle();return true;};
 await clickIn(o1,'Count the notes');await waitFor(()=>stageOf(o1)!=='idle'&&!o1.app.textContent.includes('Counting the notes…'),'the real preview',8000);
 const c1=ctl(o1),t1=c1?c1.textContent:'';
 check('D7 the real preview shows counts only: rows stored, covered rows and notes to blank, with what goes, what stays and that it cannot be undone',stageOf(o1)==='confirm'&&t1.includes('Receipt rows stored: 11')&&t1.includes('(mail and whisper declarations): 10')&&t1.includes('Notes that will be blanked: 8')&&t1.includes('What will be removed:')&&t1.includes('What stays:')&&t1.includes('This cannot be undone.')&&requests.length===1&&requests[0]==='{"action":"preview"}'&&noNote(o1),t1.slice(0,900));
 check('D8 the Blank button stays disabled until the owner ticks the confirmation',ctlButtons(o1)==='Blank 8 notes(disabled)|Cancel');
 const tickReal=pg=>{const t=pg.app.querySelector('#note-redaction280-understood');if(!t)return;t.checked=true;t.dispatchEvent(new Event('change'));};
 // Lost reply: the request fails in transit (never reaches the Worker), the page must not know the outcome.
 o1.intercept((url,init)=>{if(url===NR_PATH){requests.push(String(init.body));if(String(init.body).includes('"apply"'))return Promise.reject(new TypeError('the network dropped the answer'));}return null;});
 tickReal(o1);await clickIn(o1,'Blank 8 notes');await waitFor(()=>stageOf(o1)==='unconfirmed','the lost apply',8000);await new Promise(r=>setTimeout(r,600));
 const applies=()=>requests.filter(r=>r.includes('"apply"'));const sentBody=applies()[0]?JSON.parse(applies()[0]):null;
 const kept=o1.app.querySelector('#note-redaction280-request');
 check('D9 the apply sent exactly {action, review, confirm} with the preview’s signed review and the fixed confirmation, nothing invented',!!sentBody&&Object.keys(sentBody).join(',')==='action,review,confirm'&&sentBody.action==='apply'&&sentBody.confirm==='BLANK RECEIPT NOTES'&&typeof sentBody.review==='string'&&sentBody.review.includes('.'),applies()[0]);
 check('D10 a lost apply reply shows "Outcome not confirmed", keeps the exact request on screen, offers only a status read and is never resent',stageOf(o1)==='unconfirmed'&&applies().length===1&&!!kept&&JSON.stringify(JSON.parse(kept.value).body)===applies()[0]&&JSON.parse(kept.value).path===NR_PATH&&ctlButtons(o1)==='Read the stored status'&&noNote(o1),ctlButtons(o1));
 await clickIn(o1,'Read the stored status');await waitFor(()=>!!o1.app.querySelector('[data-note-redaction280-status="not-recorded"]'),'status after loss',8000);
 // Round 2 (12 Nov): while the request could still land, the unconfirmed heading and the request stay, with the counts under them.
 check('D11 the status read says nothing was recorded, keeps the earlier request pending until its approval expires and offers no new count yet',stageOf(o1)==='unconfirmed'&&!!o1.app.querySelector('#note-redaction280-request')&&ctl(o1).textContent.includes('could still be processed until')&&ctlButtons(o1)==='Read the stored status'&&requests[requests.length-1]==='{"action":"status"}'&&applies().length===1&&JSON.stringify(auditRows())===JSON.stringify(seeded));
 await o1.go('#/admin');await o1.go('#/admin/donation-ledger');await waitFor(()=>stageOf(o1)==='unconfirmed','the kept attempt after navigation',8000);await new Promise(r=>setTimeout(r,300));
 check('D12 leaving and coming back shows the same unconfirmed request again and sends nothing on its own',stageOf(o1)==='unconfirmed'&&JSON.stringify(JSON.parse(o1.app.querySelector('#note-redaction280-request').value).body)===applies()[0]&&applies().length===1&&requests.filter(r=>r==='{"action":"status"}').length===1);
 // Definite refusals and unreadable replies, on fresh pages (a fresh tab has its own session storage).
 const scripted=async(answer)=>{const pg=await openLedger(STAFF);await supplyScript(pg,NR_SEL,installNR);const seen=[];pg.intercept(async(url,init)=>{if(url!==NR_PATH)return null;seen.push(String(init.body));return answer(JSON.parse(init.body),seen);});return {pg,seen};};
 const realPreview=async()=>{const r=await indexMod.default.fetch(new Request('https://guild.example'+NR_PATH,{method:'POST',headers:{Cookie:await cookieFor(STAFF),'X-Olympus':'2',Origin:'https://guild.example','Content-Type':'application/json'},body:JSON.stringify({action:'preview'})}),env(ADMINS),ctx);return r.json();};
 const toConfirm=async pg=>{await clickIn(pg,'Count the notes');await waitFor(()=>stageOf(pg)==='confirm'||stageOf(pg)==='held'||stageOf(pg)==='refused','confirm step',8000);if(stageOf(pg)!=='confirm')return false;tickReal(pg);await clickIn(pg,byText(ctl(pg),'button','Blank 8 notes')?'Blank 8 notes':'?');await waitFor(()=>!['confirm'].includes(stageOf(pg))&&!pg.app.textContent.includes('Sending the cleanup request'),'apply settles',8000);return true;};
 const pv=await realPreview();
 const realHoldResponse=await indexMod.default.fetch(new Request('https://guild.example'+NR_PATH,{method:'POST',headers:{Cookie:await cookieFor(STAFF),'X-Olympus':'2',Origin:'https://guild.example','Content-Type':'application/json'},body:JSON.stringify({action:'apply',review:'{"id":"x"}.not-a-signature',confirm:'BLANK RECEIPT NOTES'})}),env(ADMINS),ctx);
 const realHold=await realHoldResponse.json();
 const s1=await scripted(b=>b.action==='preview'?new Response(JSON.stringify(pv),{status:200}):new Response(JSON.stringify(realHold),{status:409}));
 await toConfirm(s1.pg);
 // Round 3 (Codex b908253): the hold refuses this request before its own write; it promises nothing else, so the
 // control says only that, settles this request and offers the status read as the only way on.
 check('D13 a held apply (the 409 body of the real route) says the request was refused before it wrote anything, claims nothing else, clears this attempt and offers only a status read',realHoldResponse.status===409&&Object.keys(realHold).sort().join(',')==='error,message,nextAction'&&realHold.nextAction==='status'&&stageOf(s1.pg)==='held'&&ctl(s1.pg).textContent.includes('refused this request before it wrote anything')&&!/reported no change|Nothing was changed|nothing has changed/i.test(ctl(s1.pg).textContent)&&ctlButtons(s1.pg)==='Read the stored status'&&s1.pg.sessionStorage.getItem('olympus.noteRedactionAttempt280')===null&&s1.seen.filter(x=>x.includes('"apply"')).length===1,JSON.stringify({realHold,stage:stageOf(s1.pg),buttons:ctlButtons(s1.pg),text:ctl(s1.pg)&&ctl(s1.pg).textContent.slice(-400)}));
 const s2=await scripted(b=>b.action==='preview'?new Response(JSON.stringify(pv),{status:200}):new Response(JSON.stringify({state:'recorded'}),{status:200}));
 await toConfirm(s2.pg);
 check('D14 an apply answered in an unexpected form is not taken as success: shown as not confirmed with the request kept',stageOf(s2.pg)==='unconfirmed'&&ctl(s2.pg).textContent.includes('not in the expected form')&&ctlButtons(s2.pg)==='Read the stored status'&&s2.seen.filter(x=>x.includes('"apply"')).length===1);
 const s3=await scripted(b=>b.action==='preview'?new Response(JSON.stringify(pv),{status:200}):new Response('{"error":"internal"}',{status:500}));
 await toConfirm(s3.pg);
 check('D15 a server error on apply is not a refusal: shown as not confirmed, never resent',stageOf(s3.pg)==='unconfirmed'&&s3.seen.filter(x=>x.includes('"apply"')).length===1);
 const s4=await scripted(b=>b.action==='preview'?new Response(JSON.stringify(pv),{status:200}):new Response(JSON.stringify({state:'recorded',completion:{version:1,operationId:'0123abcd-0123-4abc-8def-0123456789ab',ceiling:pv.ceiling,blanked:8,completedAt:now-3600},remainingCoveredNotes:0,unclassifiedReceiptRows:0,scope:'x'}),{status:200}));
 await toConfirm(s4.pg);
 check('D16 an apply answered with an earlier recorded cleanup says this request changed nothing',stageOf(s4.pg)==='recorded'&&ctl(s4.pg).textContent.includes('recorded by an earlier request, not by this one'));
 const s5=await scripted(b=>new Response(JSON.stringify({error:'forbidden'}),{status:403}));
 await clickIn(s5.pg,'Count the notes');await waitFor(()=>stageOf(s5.pg)==='refused','forbidden',8000);
 check('D17 a refusal of the account (403) is shown plainly and leaves no control',stageOf(s5.pg)==='refused'&&ctl(s5.pg).textContent.includes('Only the owner’s account can run this cleanup')&&ctlButtons(s5.pg)==='');
 const s6=await scripted(b=>new Response(JSON.stringify({...pv,note:NOTE+' leaked'}),{status:200}));
 await clickIn(s6.pg,'Count the notes');await waitFor(()=>stageOf(s6.pg)==='held','odd preview',8000);
 check('D18 a preview with an unknown field (here a note) is held: nothing from it is shown and no Blank button exists',stageOf(s6.pg)==='held'&&noNote(s6.pg)&&!ctlButtons(s6.pg).includes('Blank'));
 check('D19 none of those replies changed a stored receipt',JSON.stringify(auditRows())===JSON.stringify(seeded));
 // The real apply, on a fresh tab.
 const o2=await openLedger(STAFF);await supplyScript(o2,NR_SEL,installNR);
 const before2=requests.length;await toConfirm(o2);await waitFor(()=>stageOf(o2)==='recorded','the real apply',10000);
 const after=auditRows(),mine=requests.slice(before2);
 const preserved=after.length===seeded.length&&after.every((r,i)=>{const a=JSON.parse(seeded[i].details),b=JSON.parse(r.details);return r.id===seeded[i].id&&r.ts===seeded[i].ts&&r.actor===seeded[i].actor&&r.subject===seeded[i].subject&&b.note===''&&JSON.stringify({...a,note:''})===JSON.stringify(b);});
 check('D20 the real apply blanks exactly the 8 notes and keeps every row and every other field; the result shows the count and time',stageOf(o2)==='recorded'&&ctl(o2).textContent.includes('8 notes were blanked')&&preserved&&mine.filter(x=>x.includes('"apply"')).length===1&&noNote(o2),ctl(o2)&&ctl(o2).textContent.slice(0,600));
 const replay=await indexMod.default.fetch(new Request('https://guild.example'+NR_PATH,{method:'POST',headers:{Cookie:await cookieFor(STAFF),'X-Olympus':'2',Origin:'https://guild.example','Content-Type':'application/json'},body:mine.find(x=>x.includes('"apply"'))}),env(ADMINS),ctx);
 const replayBody=await replay.json();
 const o3=await openLedger(STAFF);await supplyScript(o3,NR_SEL,installNR);await clickIn(o3,'Count the notes');await waitFor(()=>stageOf(o3)==='recorded','preview after completion',8000);
 check('D21 a second apply after success returns the stored status and writes nothing; a new count shows the stored status, never a Blank button',replay.status===200&&replayBody.state==='recorded'&&JSON.stringify(auditRows())===JSON.stringify(after)&&db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'treasury.receipt_note_redaction280'").get().n===1&&stageOf(o3)==='recorded'&&!ctlButtons(o3).includes('Blank')&&ctl(o3).textContent.includes('8 notes were blanked'),JSON.stringify(replayBody));
 const stored=[o1,o2,o3,s1.pg,s2.pg,s3.pg,s4.pg].map(pg=>String(pg.sessionStorage.getItem('olympus.noteRedactionAttempt280')||'')).join('');
 check('D22 no note text ever reached the control, its replies or its session record',[o1,o2,o3,s1.pg,s2.pg,s3.pg,s4.pg,s5.pg,s6.pg].every(noNote)&&!stored.includes(NOTE)&&!JSON.stringify(pv).includes(NOTE)&&!JSON.stringify(replayBody).includes(NOTE));
 // ---------------------------------------------------------------- Round 2, item 1 (CL2-258): the shared member picker
 console.log('\n== Part E: the shared member picker follows siteProfilesVisible (CL2-258, Codex 59fd954) ==');
 // Synthetic Discord search behind the real Worker route: two people with a site account and one without.
 // The real discord.ts rest() goes through the fixture's global transport slot; only these two synthetic reads answer.
 const fetchBefore=originalTestFetch,GHOST='300000000000000398';
 const discordRows=[{user:{id:STAFF,username:'synthpickstaff',global_name:'Synthetic Pickstaff',avatar:null},nick:null},{user:{id:MEMBER,username:'synthpickmember',global_name:'Synthetic Pickmember',avatar:null},nick:null},{user:{id:GHOST,username:'synthpickghost',global_name:'Synthetic Pickghost',avatar:null},nick:null}];
 const searchCalls=[];
 originalTestFetch=async(input,init={})=>{const request=input instanceof Request?input:null,u=new URL(request?request.url:String(input)),method=request?request.method:init.method||'GET';searchCalls.push(method+' '+u.pathname);
  if(u.origin!=='https://discord.com'||method!=='GET')throw new Error('no network in tests: '+u.origin+u.pathname);
  if(u.pathname.endsWith('/members/search')){const q=(u.searchParams.get('query')||'').toLowerCase();return Response.json(discordRows.filter(m=>[m.user.username,m.user.global_name].some(v=>v.toLowerCase().startsWith(q))));}
  const one=/\/members\/(\d+)$/.exec(u.pathname);const m=one&&discordRows.find(x=>x.user.id===one[1]);if(m)return Response.json(m);
  return Response.json({message:'Unknown Member',code:10007},{status:404});};
 const PICK={DISCORD_BOT_TOKEN:'synthetic-picker-token-local-only'};
 try{
  const searchAs=async(who,q,purpose)=>{const r=await indexMod.default.fetch(new Request('https://guild.example/api/search?'+(purpose?'purpose='+purpose+'&':'')+'q='+encodeURIComponent(q),{headers:{Cookie:await cookieFor(who),'X-Olympus':'2'}}),env(PICK),ctx);return {status:r.status,body:await r.json()};};
  const pickerFor=(pg,labelText)=>{const lab=pg.app.querySelectorAll('label.sr').find(l=>typeof labelText==='function'?labelText(l.textContent):l.textContent===labelText);const input=lab&&pg.app.querySelector('#'+lab.getAttribute('for'));if(!input)return null;const root=input.closest('.picker');return {input,root,tools:root.querySelector('.list-tools'),box:root.querySelector('.list-tools input[type="checkbox"]'),list:root.querySelector('.list')};};
  const rowsOf=p=>p.root.querySelectorAll('[role="option"]').map(o=>o.textContent);
  const badges=p=>p.root.querySelectorAll('[role="option"] .badge').map(b=>b.textContent).filter(t=>t==='site profile').length;
  const search=async(pg,p,q,want)=>{p.input.value=q;p.input.focus();fire(p.input,'input');await new Promise(r=>setTimeout(r,520));await waitFor(()=>!p.root.textContent.includes('Searching…')&&(want?want():true),'picker results for '+q,4000);for(let i=0;i<4;i++)await settle();};
  const memberReply=await searchAs(MEMBER,'Synthetic Pick'),adminReply=await searchAs(STAFF,'Synthetic Pick');
  check('E0 the real route: a member reply has siteProfilesVisible false and no onSite field; an admin reply has true and onSite',memberReply.status===200&&memberReply.body.siteProfilesVisible===false&&memberReply.body.results.length===3&&memberReply.body.results.every(r=>!Object.hasOwn(r,'onSite'))&&adminReply.body.siteProfilesVisible===true&&adminReply.body.results.filter(r=>r.onSite===true).length===2,JSON.stringify([memberReply,adminReply,searchCalls]).slice(0,600));
  // An ordinary member on Home (the friends picker): Discord names and avatars, no filter, no badge.
  const pm=await openPage(MEMBER,PICK);await pm.go('#/');await waitFor(()=>!!pickerFor(pm,'Add a friend'),'the member friends picker',8000);
  const fm=pickerFor(pm,'Add a friend');await search(pm,fm,'Synthetic Pick',()=>rowsOf(fm).length>=3);
  check('E1 a member search lists every Discord match with its avatar and hides the site-profile filter and badge',!!fm&&rowsOf(fm).filter(t=>t.startsWith('Synthetic Pick')).length===3&&fm.root.querySelectorAll('[role="option"] img').length>=3&&fm.tools.hidden===true&&fm.box.checked===false&&badges(fm)===0&&!fm.root.textContent.includes('None of these accounts'),fm&&JSON.stringify({rows:rowsOf(fm),hidden:fm.tools.hidden,badges:badges(fm)}));
  // A member pick still works by Discord name.
  const ghostRow=fm&&fm.root.querySelectorAll('[role="option"]').find(o=>o.textContent.startsWith('Synthetic Pickghost'));if(ghostRow)ghostRow.dispatchEvent(new Event('mousedown',{bubbles:true}));await settle();
  const picked=pm.app.querySelectorAll('.person b').map(b=>b.textContent);
  check('E2 a member can still pick someone by Discord name (no site account needed)',!!ghostRow&&picked.some(t=>t.startsWith('Synthetic Pickghost'))&&fm.list.hidden===true,JSON.stringify({ghostRow:!!ghostRow,picked}));
  // An administrator on Home: the filter and the badge, from the same shared picker.
  const pa=await openPage(STAFF,PICK);await pa.go('#/');await waitFor(()=>!!pickerFor(pa,'Add a friend'),'the admin friends picker',8000);
  const fa=pickerFor(pa,'Add a friend');await search(pa,fa,'Synthetic Pick',()=>rowsOf(fa).length>=3);
  const adminShown=!!fa&&fa.tools.hidden===false&&badges(fa)===2&&!fa.root.querySelectorAll('[role="option"]').find(o=>o.textContent.startsWith('Synthetic Pickghost'))?.textContent.includes('site profile');
  fa.box.checked=true;fa.box.focus();fire(fa.box,'change');await settle();
  check('E3 an administrator keeps the filter and the badge: two site profiles of three, and ticking the filter leaves those two',adminShown&&rowsOf(fa).filter(t=>t.startsWith('Synthetic Pick')).length===2&&!rowsOf(fa).some(t=>t.startsWith('Synthetic Pickghost')),fa&&JSON.stringify({rows:rowsOf(fa),hidden:fa.tools.hidden,badges:badges(fa)}));
  // The same picker instance, filter ticked and focused, then gets a reply without permission (a member-context reply).
  pa.intercept(async(url)=>{if(url.startsWith('/api/search?q=Synthetic%20Pi')&&url!=='/api/search?q=Synthetic%20Pick'){return new Response(JSON.stringify(memberReply.body),{status:200});}return null;});
  fa.input.value='Synthetic Pic';fire(fa.input,'input');fa.box.focus();await new Promise(r=>setTimeout(r,520));await waitFor(()=>rowsOf(fa).filter(t=>t.startsWith('Synthetic Pick')).length===3,'the member-context reply',4000);for(let i=0;i<4;i++)await settle();
  check('E4 the same instance with the box ticked, then a reply without permission: the box is cleared and hidden first, all three rows show, no badge, focus back on the search',fa.tools.hidden===true&&fa.box.checked===false&&rowsOf(fa).filter(t=>t.startsWith('Synthetic Pick')).length===3&&badges(fa)===0&&pa.document.activeElement===fa.input&&!fa.root.textContent.includes('None of these accounts'),JSON.stringify({rows:rowsOf(fa),hidden:fa.tools.hidden,checked:fa.box.checked,active:pa.document.activeElement&&pa.document.activeElement.tagName}));
  pa.intercept(null);
  // The admin appointment search (no typed fallback) is unchanged with the real reply, and an empty-result message
  // about site profiles appears only when the reply permits profiles.
  // Round 5: CL2-014 (a6f591d) moved the appointed holders from Settings onto Admin, Appointed roles; the picker is the same.
  await pa.go('#/admin/appointments');await waitFor(()=>!!pickerFor(pa,t=>t.endsWith(': associate Discord account')),'the appointment picker',8000);
  const fp=pickerFor(pa,t=>t.endsWith(': associate Discord account'));await search(pa,fp,'Synthetic Pick',()=>rowsOf(fp).length===3);
  const apptReply=await searchAs(STAFF,'Synthetic Pick','appointment');
  const apptBefore={rows:rowsOf(fp).length,hidden:fp.tools.hidden,badges:badges(fp),hints:fp.root.querySelectorAll('[role="option"] .sub').length};
  fp.box.checked=true;fp.box.focus();fire(fp.box,'change');await settle();
  check('E5 the admin appointment search keeps its rows, hints, filter and badge with the real reply, and the filter still filters',apptReply.body.siteProfilesVisible===true&&apptBefore.rows===3&&apptBefore.hidden===false&&apptBefore.badges===2&&apptBefore.hints===3&&rowsOf(fp).length===2,JSON.stringify({apptBefore,after:rowsOf(fp)}));
  pa.intercept(async(url)=>url.startsWith('/api/search?purpose=appointment&q=Synthetic%20Pic')&&!url.endsWith('Pick')?new Response(JSON.stringify({results:apptReply.body.results.map(r=>({...r,onSite:false}))}),{status:200}):null);
  fp.input.value='Synthetic Pic';fire(fp.input,'input');await new Promise(r=>setTimeout(r,520));await waitFor(()=>rowsOf(fp).length===3||fp.root.textContent.includes('None of these'),'the reply without the field',4000);for(let i=0;i<4;i++)await settle();
  check('E6 a reply without siteProfilesVisible after a ticked filter: no "None of these accounts has a current site profile.", every row shown, filter hidden',!fp.root.textContent.includes('None of these accounts has a current site profile.')&&rowsOf(fp).length===3&&fp.tools.hidden===true&&fp.box.checked===false,JSON.stringify({text:fp.root.textContent.slice(0,300)}));
  // Empty, unavailable and forged replies default to no filter and no badge.
  const forged={results:adminReply.body.results.map(r=>({...r,onSite:true}))};let answer=null;
  pa.intercept(async(url)=>url.startsWith('/api/search?purpose=appointment')&&answer?answer():null);
  const tryReply=async(make,q,want)=>{answer=make;await search(pa,fp,q,want);return {hidden:fp.tools.hidden,checked:fp.box.checked,badges:badges(fp),rows:rowsOf(fp).length,text:fp.root.textContent};};
  const fz=await tryReply(()=>new Response(JSON.stringify(forged),{status:200}),'Synthetic Pickf',()=>rowsOf(fp).length===3);
  const un=await tryReply(()=>new Response(JSON.stringify({results:[],unavailable:true}),{status:200}),'Synthetic Picku',()=>fp.root.textContent.includes('unavailable'));
  const emptyR=await tryReply(()=>new Response(JSON.stringify({results:[]}),{status:200}),'Synthetic Picke',()=>fp.root.textContent.includes('Nobody found.'));
  const nul=await tryReply(()=>new Response('null',{status:200}),'Synthetic Pickn',()=>fp.root.textContent.includes('unavailable'));
  check('E7 a reply that carries onSite but not siteProfilesVisible shows no badge and no filter',fz.rows===3&&fz.badges===0&&fz.hidden===true,JSON.stringify(fz));
  check('E8 empty, unavailable and null replies default to no filter and no badge, with the plain message',un.hidden===true&&un.text.includes('Discord search is unavailable right now. Try again shortly.')&&emptyR.hidden===true&&emptyR.text.includes('Nobody found.')&&!emptyR.text.includes('None of these')&&nul.hidden===true&&nul.text.includes('unavailable'),JSON.stringify([un.text,emptyR.text,nul.text]));
  // Round 3, item 5a (second review): "verified in game" is mapped like the site-profile flag.
  const vbadges=()=>fp.root.querySelectorAll('[role="option"] .badge').map(b=>b.textContent).filter(t=>t==='verified in game').length;
  const linkedRows=v=>adminReply.body.results.map((r,i)=>({...r,linked:i===0?v:false}));
  const linkedCase=async(body,q)=>{await tryReply(()=>new Response(JSON.stringify(body),{status:200}),q,()=>rowsOf(fp).length===3);return vbadges();};
  const vb=[await linkedCase({results:linkedRows(true),siteProfilesVisible:false},'Synthetic Pickl'),await linkedCase({results:linkedRows(true)},'Synthetic Pickm'),
   await linkedCase({results:linkedRows('yes'),siteProfilesVisible:true},'Synthetic Pickq'),await linkedCase({results:linkedRows(true),siteProfilesVisible:'true'},'Synthetic Pickr'),
   await linkedCase({results:linkedRows(true),siteProfilesVisible:true},'Synthetic Picks')];
  check('E10 the "verified in game" badge shows only when the reply’s siteProfilesVisible is exactly true and the row’s linked flag is exactly true',JSON.stringify(vb)==='[0,0,0,0,1]',JSON.stringify(vb));
  pa.intercept(null);
  const appointmentNonAdmin=await searchAs(MEMBER,'Synthetic Pick','appointment');
  check('E9 an ordinary member asking for the appointment purpose still gets the ordinary reply (no onSite, siteProfilesVisible false)',appointmentNonAdmin.status===200&&appointmentNonAdmin.body.siteProfilesVisible===false&&appointmentNonAdmin.body.results.every(r=>!Object.hasOwn(r,'onSite')&&!Object.hasOwn(r,'appointmentStatus')));
 }finally{originalTestFetch=fetchBefore;}

 // ---------------------------------------------------------------- Round 2, items 2 to 4: the cleanup control
 console.log('\n== Part F: receipt-note cleanup after a lost apply, its copy and its focus (round 2) ==');
 if(NR){
  let clock=now;const w2=makeWindow('{}'),d2=w2.document,sent2=[];
  const hf=(tag,props,...kids)=>{const el=d2.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v===undefined||v===null||v===false)continue;if(k==='class')el.className=v;else if(k==='text')el.textContent=v;else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2),v);else if(k==='disabled')el.disabled=!!v;else el.setAttribute(k,v===true?'':String(v));}for(const c of kids.flat(9)){if(c===null||c===undefined||c===false||c==='')continue;el.appendChild(typeof c==='object'?c:d2.createTextNode(String(c)));}return el;};
  const PV=over=>({state:'preview',ceiling:90,receiptRows:11,coveredRows:10,notesToBlank:8,review:'{"id":"0123abcd-0123-4abc-8def-0123456789ab"}.sig',expiresAt:clock+600,confirmation:'BLANK RECEIPT NOTES',scope:'s',...over});
  const NOT={state:'not_recorded',completion:null,remainingCoveredNotes:8,unclassifiedReceiptRows:0,scope:'s'};
  let nextPreview=PV();
  const api2=(method,p,body)=>{sent2.push(JSON.stringify(body));if(body.action==='preview')return Promise.resolve(nextPreview);if(body.action==='status')return Promise.resolve(NOT);return Promise.reject({status:0});};
  const fmt=t=>'T'+t;
  const mountF=()=>{const box=d2.body.appendChild(d2.createElement('div'));NR.mount(box,{h:hf,api:api2,user:{id:NR.OWNER,isAdmin:true},live:()=>true,now:()=>clock,fmtDateTime:fmt,storage:()=>w2.sessionStorage});return box;};
  const stageF=box=>box.querySelector('[data-note-redaction280-stage]');
  const heading=box=>stageF(box).querySelector('h3');
  const focusedHeading=box=>{const a=d2.activeElement,hd=heading(box);return !!hd&&a===hd&&hd.getAttribute('tabindex')==='-1'?hd.textContent:'(focus elsewhere: '+(a?a.tagName+':'+String(a.textContent).slice(0,40):'none')+')';};
  const press=async(box,text)=>{const b=byText(box,'button',text);if(!b)return false;b.click();for(let i=0;i<6;i++)await settle();return true;};
  const trail=[];
  // Cancel: focus goes to the idle heading.
  const b1=mountF();await press(b1,'Count the notes');trail.push(['count',focusedHeading(b1)]);
  await press(b1,'Cancel');trail.push(['cancel',focusedHeading(b1)]);
  check('F1 Cancel returns to the start and moves focus to its heading',trail[0][1]==='Confirm the cleanup'&&trail[1][1]==='Start with a count'&&b1.textContent.includes('The count was set aside'),JSON.stringify(trail));
  // An expired count: focus goes to the idle heading.
  d2.body.removeChild(b1);w2.sessionStorage.removeItem(NR.STORE);nextPreview=PV({expiresAt:clock+1});
  const b2=mountF();await press(b2,'Count the notes');await new Promise(r=>setTimeout(r,1250));for(let i=0;i<4;i++)await settle();
  check('F2 a count that expires returns to the start and moves focus to its heading',stageF(b2).getAttribute('data-note-redaction280-state')==='idle'&&focusedHeading(b2)==='Start with a count'&&b2.textContent.includes('That count expired'),focusedHeading(b2));
  // Copy of the confirmation.
  d2.body.removeChild(b2);nextPreview=PV();
  const b3=mountF();await press(b3,'Count the notes');const ct=stageF(b3).textContent;
  check('F3 the confirmation says the site database keeps no copy and that earlier backups and Watcher files are not changed, without contradiction',ct.includes('The site’s database keeps no copy of the notes.')&&ct.includes('Earlier backups and the officers’ Watcher files are not changed by this step.')&&!ct.includes('The site keeps no copy')&&!ct.includes('changes the site’s database only')&&b3.querySelector('label[for="note-redaction280-understood"]')?.textContent.includes('cannot be restored from the site'),ct.slice(0,900));
  // A lost apply, then a status read inside the window, then one after it.
  const tk=b3.querySelector('#note-redaction280-understood');tk.checked=true;tk.dispatchEvent(new Event('change'));await press(b3,'Blank 8 notes');
  const lostT=stageF(b3).textContent,lostFocus=focusedHeading(b3),help=b3.querySelector('#note-redaction280-request-help')?.textContent||'';
  const keptBefore=b3.querySelector('#note-redaction280-request')?.value;
  check('F4 the kept request is described neutrally: the request exactly as sent, with the signed approval and no note text',help==='This is the request exactly as it was sent: the signed approval from your count, and no note text.'&&!lostT.includes('Keep this for the record'),help);
  clock=now+400;await press(b3,'Read the stored status');
  const pend={state:stageF(b3).getAttribute('data-note-redaction280-state'),head:heading(b3)?.textContent,focus:focusedHeading(b3),kept:b3.querySelector('#note-redaction280-request')?.value,counts:b3.querySelector('[data-note-redaction280-status="not-recorded"]')?.textContent||'',buttons:b3.querySelectorAll('button').map(b=>b.textContent).join('|'),stored:w2.sessionStorage.getItem(NR.STORE)!==null};
  check('F5 a "not recorded" status while the request could still be processed keeps "Outcome not confirmed" and the exact request, with the status counts under them',pend.state==='unconfirmed'&&pend.head==='Outcome not confirmed'&&!!keptBefore&&pend.kept===keptBefore&&pend.counts.includes('Notes still present on covered receipts: 8')&&pend.counts.includes('no cleanup recorded')&&pend.buttons==='Read the stored status'&&pend.stored&&!stageF(b3).textContent.includes('No cleanup recorded')&&sent2.filter(x=>x.includes('"apply"')).length===1,JSON.stringify(pend));
  clock=now+600+61;await press(b3,'Read the stored status');
  const past={state:stageF(b3).getAttribute('data-note-redaction280-state'),head:heading(b3)?.textContent,focus:focusedHeading(b3),buttons:b3.querySelectorAll('button').map(b=>b.textContent).join('|'),stored:w2.sessionStorage.getItem(NR.STORE)};
  check('F6 once the window has passed, the same read switches to "No cleanup recorded" and offers a new count',past.state==='not-recorded'&&past.head==='No cleanup recorded'&&past.buttons==='Count the notes|Read the stored status'&&past.stored===null&&!b3.querySelector('#note-redaction280-request'),JSON.stringify(past));
  check('F7 every change of step moved focus to the new step’s heading (count, lost apply, status inside and after the window)',lostFocus==='Outcome not confirmed'&&pend.focus==='Outcome not confirmed'&&past.focus==='No cleanup recorded',JSON.stringify([lostFocus,pend.focus,past.focus]));
  d2.body.removeChild(b3);
 } else for(const name of ['F1','F2','F3','F4','F5','F6','F7'])check(name+' (module unavailable)',false);

 // ---------------------------------------------------------------- Round 2, item 5: the News figures frame
 console.log('\n== Part G: the count time appears once from the page side of the figures frame (round 2) ==');
 {
  await putFigures(FIG);
  // Round 3: the renderer's caption no longer repeats the time (Codex f5ad5a1), so the whole frame, caption included, is counted.
  const timeOnce=f=>{const strip=f&&f.querySelector('[data-source-strip]'),m=strip&&/Counted (.+?); refreshed/.exec(strip.textContent);if(!m)return {n:-1};return {n:f.textContent.split(m[1]).length-1,t:m[1],caption:f.querySelector('caption')?.textContent||null};};
  let rendered=null;const installTracked=pg=>{installActivity(pg);const real=pg.window.OlympusActivity280;pg.window.OlympusActivity280={render:(...a)=>(rendered=real.render(...a))};};
  const g1=await openNews();await supplyScript(g1,ACT_SEL,installTracked);const gf1=figFrame(g1),o1=timeOnce(gf1);
  const g2=await openNews();await supplyScript(g2,ACT_SEL,installActivity,true);const gf2=figFrame(g2),o2=timeOnce(gf2);
  const sentence=f=>f?f.querySelectorAll('p.muted.small').map(p=>p.textContent).find(t=>t.includes('Joined and left compare'))||'':'';
  check('G1 with the table, the count time appears exactly once in the whole frame (the source strip), the caption included',o1.n===1&&!!o1.caption&&!o1.caption.includes(o1.t),JSON.stringify(o1));
  const heads1=gf1?gf1.querySelectorAll('h1,h2,h3,h4,h5,h6').map(x=>x.tagName+':'+x.textContent.trim()):[];
  check('G3 the heading order is h2 for the frame, then the renderer’s own h3, inserted as the renderer built it',JSON.stringify(heads1)==='["H2:The guild in figures","H3:Activity at a glance"]'&&!!rendered&&gf1.contains(rendered)&&rendered.querySelector('h3')?.parentNode===rendered,JSON.stringify(heads1));
  // The temporary h4-to-h3 swap is gone: a renderer section carrying an h4 sub-heading reaches the page unchanged.
  const installWithH4=pg=>{installActivity(pg);const real=pg.window.OlympusActivity280;pg.window.OlympusActivity280={render:(...a)=>{const s=real.render(...a);if(s){const x=pg.document.createElement('h4');x.textContent='Synthetic renderer sub-heading';s.appendChild(x);}return s;}};};
  const g4=await openNews();await supplyScript(g4,ACT_SEL,installWithH4);const gf4=figFrame(g4);
  const heads4=gf4?gf4.querySelectorAll('h2,h3,h4').map(x=>x.tagName+':'+x.textContent.trim()):[];
  check('G4 the page inserts the renderer’s section without rewriting its headings (no h4-to-h3 swap)',JSON.stringify(heads4)==='["H2:The guild in figures","H3:Activity at a glance","H4:Synthetic renderer sub-heading"]',JSON.stringify(heads4));
  check('G2 without the table (script unavailable), the time is stated once, and the retained sentence says only how the figures are counted',o2.n===1&&sentence(gf2).startsWith('Joined and left compare complete, checked roster exports')&&!sentence(gf2).includes('As of'),JSON.stringify({o2,s:sentence(gf2)}));
 }

 // ---------------------------------------------------------------- Round 3, item 1: the cleanup's final error contract
 console.log('\n== Part H: receipt-note cleanup under Codex\'s final error contract (b908253, round 3) ==');
 if(NR){
  let clock=now;const w3=makeWindow('{}'),d3=w3.document;
  const hx=(tag,props,...kids)=>{const el=d3.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v===undefined||v===null||v===false)continue;if(k==='class')el.className=v;else if(k==='text')el.textContent=v;else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2),v);else if(k==='disabled')el.disabled=!!v;else el.setAttribute(k,v===true?'':String(v));}for(const c of kids.flat(9)){if(c===null||c===undefined||c===false||c==='')continue;el.appendChild(typeof c==='object'?c:d3.createTextNode(String(c)));}return el;};
  const OP='0123abcd-0123-4abc-8def-0123456789ab';
  const PV=()=>({state:'preview',ceiling:90,receiptRows:11,coveredRows:10,notesToBlank:8,review:'{"id":"'+OP+'"}.sig',expiresAt:clock+600,confirmation:'BLANK RECEIPT NOTES',scope:'s'});
  const NOT={state:'not_recorded',completion:null,remainingCoveredNotes:8,unclassifiedReceiptRows:0,scope:'s'};
  // The exact replies of treasury-note-maintenance280.ts refused() and unconfirmed().
  const HOLD=(extra={})=>({status:409,data:{error:'receipt_note_cleanup_held',message:'The cleanup is held or its outcome is unconfirmed. Check cleanup status before any further action.',nextAction:'status',...extra}});
  const UNC=(extra={})=>({status:503,data:{error:'receipt_note_cleanup_unconfirmed',message:'The cleanup outcome is not confirmed. Check cleanup status before any further action.',nextAction:'status',...extra}});
  const has=typeof NR.readHold==='function'&&typeof NR.readUnconfirmed==='function';
  check('H1 the hold and the unconfirmed reply are admitted only in their exact shapes (keys, nextAction "status", optional whole unclassifiedReceiptRows)',has
   &&JSON.stringify(NR.readHold(HOLD()))==='{"unclassified":null}'&&NR.readHold(HOLD({unclassifiedReceiptRows:3})).unclassified===3&&NR.readHold(HOLD({unclassifiedReceiptRows:0})).unclassified===0
   &&[HOLD({nextAction:'preview'}),HOLD({nextAction:undefined}),HOLD({extra:1}),HOLD({unclassifiedReceiptRows:'3'}),HOLD({unclassifiedReceiptRows:-1}),HOLD({unclassifiedReceiptRows:1.5}),HOLD({message:7}),{status:400,data:HOLD().data},{status:409,data:{error:'receipt_note_cleanup_held',message:'held'}},{status:409,data:null}].every(e=>NR.readHold(JSON.parse(JSON.stringify(e)))===null)
   &&NR.readUnconfirmed(UNC())===true&&[UNC({extra:1}),UNC({nextAction:'apply'}),{status:500,data:UNC().data},{status:503,data:{error:'receipt_note_cleanup_unconfirmed'}},{status:503,data:HOLD().data}].every(e=>NR.readUnconfirmed(e)===false)
   &&NR.refusal(UNC())===null&&NR.refusal({status:409,data:{error:'receipt_note_cleanup_held',message:'held'}})===null);
  // A scripted route: each action answers with its scripted result ({status,data} rejects as the page's api() does).
  let script={},sent3=[];
  const api3=(method,p,body)=>{sent3.push(JSON.stringify(body));const next=script[body.action];const r=typeof next==='function'?next():next;return r&&typeof r.status==='number'?Promise.reject(r):r===undefined?Promise.reject({status:0}):Promise.resolve(r);};
  const mountH=()=>{const box=d3.body.appendChild(d3.createElement('div'));NR.mount(box,{h:hx,api:api3,user:{id:NR.OWNER,isAdmin:true},live:()=>true,now:()=>clock,fmtDateTime:t=>'T'+t,storage:()=>w3.sessionStorage});return box;};
  const st=box=>box.querySelector('[data-note-redaction280-stage]');
  const view=box=>({state:st(box).getAttribute('data-note-redaction280-state'),head:st(box).querySelector('h3')?.textContent,text:st(box).textContent,buttons:st(box).querySelectorAll('button').map(b=>b.textContent).join('|'),kept:box.querySelector('#note-redaction280-request')?.value||null,stored:w3.sessionStorage.getItem(NR.STORE),focus:d3.activeElement===st(box).querySelector('h3')});
  const press=async(box,text)=>{const b=byText(box,'button',text);if(!b)return false;b.click();for(let i=0;i<6;i++)await settle();return true;};
  const toApply=async box=>{await press(box,'Count the notes');const t=box.querySelector('#note-redaction280-understood');if(!t)return false;t.checked=true;t.dispatchEvent(new Event('change'));return press(box,'Blank 8 notes');};
  const NOTHING=/Nothing was changed|nothing has changed|reported no change|no change/i;
  const fresh=()=>{for(const c of [...d3.body.childNodes])d3.body.removeChild(c);w3.sessionStorage.removeItem(NR.STORE);sent3=[];clock=now;};
  const applies=()=>sent3.filter(x=>x.includes('"apply"')).length;

  fresh();script={preview:PV(),apply:HOLD({unclassifiedReceiptRows:2})};const b1=mountH();await toApply(b1);const v1=view(b1);
  check('H2 an apply answered with the exact hold says this request was refused before it wrote anything, shows the unclassified count, settles this request only and offers only a status read',
   v1.state==='held'&&v1.head==='Cleanup held'&&v1.text.includes('refused this request before it wrote anything')&&v1.text.includes('Receipt rows the cleanup cannot classify: 2')&&!NOTHING.test(v1.text)&&v1.buttons==='Read the stored status'&&v1.stored===null&&v1.focus&&applies()===1,JSON.stringify(v1));
  fresh();script={preview:PV(),apply:{status:409,data:{error:'receipt_note_cleanup_held',message:'held'}}};const b2=mountH();await toApply(b2);const v2=view(b2);
  check('H3 a 409 hold in any other shape (here without nextAction) is not taken as a refusal: not confirmed, the request kept and stored, only a status read',
   v2.state==='unconfirmed'&&!!v2.kept&&v2.stored!==null&&v2.buttons==='Read the stored status'&&v2.text.includes('not in a form this page recognises')&&applies()===1,JSON.stringify(v2)); // round 4: a read reply is not "lost"
  fresh();script={preview:PV(),apply:UNC()};const b3=mountH();await toApply(b3);const v3=view(b3);
  check('H4 the exact 503 says the server could not confirm this request\'s outcome, keeps the request on screen and stored, and offers only a status read; nothing is resent',
   v3.state==='unconfirmed'&&v3.text.includes('The server reported that the outcome of this request is not confirmed.')&&v3.text.includes('It is not known whether the notes were blanked.')&&!!v3.kept&&v3.stored!==null&&v3.buttons==='Read the stored status'&&applies()===1&&!NOTHING.test(v3.text),JSON.stringify(v3));
  // A hold that arrives while an earlier attempt of this tab is pending (the attempt of H4 is still stored).
  script={status:HOLD({unclassifiedReceiptRows:4})};const keptBefore=v3.kept;await press(b3,'Read the stored status');const v6=view(b3);
  check('H5 a hold that arrives while an earlier attempt is pending does not settle it: "Outcome not confirmed" and the same request stay, the unclassified count shows, no sentence says nothing changed, only a status read',
   v6.state==='unconfirmed'&&v6.head==='Outcome not confirmed'&&v6.kept===keptBefore&&v6.text.includes('does not settle the request below')&&v6.text.includes('Receipt rows the cleanup cannot classify: 4')&&v6.text.includes('It is not known whether the notes were blanked.')&&!NOTHING.test(v6.text)&&v6.buttons==='Read the stored status'&&v6.stored!==null&&v6.focus&&applies()===1,JSON.stringify(v6));
  script={status:UNC()};await press(b3,'Read the stored status');const v6b=view(b3);
  script={status:()=>({status:0})};await press(b3,'Read the stored status');const v6c=view(b3);
  check('H6 while that attempt is pending, a 503 or a lost status reply keeps the request and the status read as the only way on',v6b.state==='unconfirmed'&&v6b.kept===keptBefore&&v6b.text.includes('could not confirm the stored state')&&v6b.buttons==='Read the stored status'&&v6c.state==='unconfirmed'&&v6c.kept===keptBefore&&v6c.buttons==='Read the stored status'&&v6c.stored!==null&&applies()===1,JSON.stringify([v6b.text.slice(0,300),v6c.text.slice(0,300)]));
  fresh();script={preview:PV(),apply:UNC({retry:true})};const b4=mountH();await toApply(b4);const v4=view(b4);
  check('H7 a 503 in any other shape is still not confirmed, kept and never resent',v4.state==='unconfirmed'&&!!v4.kept&&v4.stored!==null&&v4.buttons==='Read the stored status'&&applies()===1&&!v4.text.includes('The server reported'),JSON.stringify(v4));
  fresh();script={preview:HOLD({unclassifiedReceiptRows:5})};const b8=mountH();await press(b8,'Count the notes');const v8=view(b8);
  fresh();script={preview:HOLD()};const b8b=mountH();await press(b8b,'Count the notes');const v8b=view(b8b);
  check('H8 a count answered with the hold: "Cleanup held", no count, the unclassified count only when the reply carries it, only a status read, nothing said about other changes',
   v8.state==='held'&&v8.text.includes('so it gave no count')&&v8.text.includes('Receipt rows the cleanup cannot classify: 5')&&v8.buttons==='Read the stored status'&&!NOTHING.test(v8.text)&&v8b.state==='held'&&!v8b.text.includes('cannot classify:')&&v8b.buttons==='Read the stored status',JSON.stringify([v8,v8b]));
  fresh();script={preview:UNC()};const b9=mountH();await press(b9,'Count the notes');const v9=view(b9);
  fresh();script={preview:()=>({status:0})};const b9b=mountH();await press(b9b,'Count the notes');const v9b=view(b9b);
  check('H9 a count answered with the 503 (a malformed completion record) or lost: only a status read is offered, never a new count',v9.state==='not-confirmed'&&v9.text.includes('could not confirm the stored state')&&v9.buttons==='Read the stored status'&&v9b.state==='held'&&v9b.head==='Count not shown'&&v9b.buttons==='Read the stored status'&&!NOTHING.test(v9.text+v9b.text),JSON.stringify([v9,v9b]));
  // An earlier record of this tab that cannot be read back: pending until a status read settles it.
  fresh();w3.sessionStorage.setItem(NR.STORE,'{"broken":');script={status:NOT};const b10=mountH();const v10=view(b10);
  clock=now+300;await press(b10,'Read the stored status');const v10b=view(b10);
  clock=now+661;await press(b10,'Read the stored status');const v10c=view(b10);
  check('H10 an unreadable record of an earlier request is held as not confirmed: no count is offered, a "not recorded" read inside 660 s keeps it, and only a later read settles it',
   v10.state==='unconfirmed'&&v10.text.includes('could not be read back')&&v10.buttons==='Read the stored status'&&v10b.state==='unconfirmed'&&v10b.text.includes('at the latest')&&v10b.buttons==='Read the stored status'&&v10b.stored==='{"broken":'&&v10c.state==='not-recorded'&&v10c.buttons==='Count the notes|Read the stored status'&&v10c.stored===null&&applies()===0,JSON.stringify([v10,v10b,v10c]));
  // Item 5c: in the pending state the "until about" time is given once.
  fresh();script={preview:PV(),apply:()=>({status:0}),status:NOT};const b11=mountH();await toApply(b11);clock=now+100;await press(b11,'Read the stored status');const v11=view(b11);
  const until='T'+(now+600+60);
  check('H11 the pending state gives the "until about" time once',v11.state==='unconfirmed'&&v11.text.includes('until about '+until)&&v11.text.split(until).length-1===1&&v11.buttons==='Read the stored status',JSON.stringify(v11.text));
  // Item 5b: an expiring count moves focus only when focus is in the control or on the page.
  fresh();script={preview:()=>({...PV(),expiresAt:clock+1})};const b12=mountH();await press(b12,'Count the notes');
  const elsewhere=d3.body.appendChild(d3.createElement('input'));elsewhere.focus();
  await new Promise(r=>setTimeout(r,1250));for(let i=0;i<4;i++)await settle();const v12=view(b12),away=d3.activeElement===elsewhere;
  d3.body.removeChild(elsewhere);await press(b12,'Count the notes');byText(b12,'button','Cancel')?.focus();
  await new Promise(r=>setTimeout(r,1250));for(let i=0;i<4;i++)await settle();const v12b=view(b12);
  // Round 4 (second review): the third case, focus on the page body itself (nothing focused in the page).
  script={preview:()=>({...PV(),expiresAt:clock+1})};await press(b12,'Count the notes');d3.body.focus();const onBody=d3.activeElement===d3.body;
  await new Promise(r=>setTimeout(r,1250));for(let i=0;i<4;i++)await settle();const v12c=view(b12);
  check('H12 an expired count returns to the start; focus moves to its heading when it was inside the control or on the page body, and stays where it was elsewhere (an owner typing in another field)',v12.state==='idle'&&away&&!v12.focus&&v12b.state==='idle'&&v12b.focus&&onBody&&v12c.state==='idle'&&v12c.focus&&v12.text.includes('so nothing was sent'),JSON.stringify({away,v12:v12.focus,v12b:v12b.focus,onBody,v12c:v12c.focus,t:v12.text.slice(0,200)}));

  // ---------------------------------------------------------------- Round 4, item 2: six small items of the last review
  console.log('\n== Part K: receipt-note cleanup wording and the unreadable earlier record (round 4) ==');
  const msg=box=>(box.querySelectorAll('p').find(p=>p.getAttribute('role')==='status')||{textContent:''}).textContent;
  const COMPLETED=id=>({state:'recorded',completion:{version:1,operationId:id,ceiling:90,blanked:8,completedAt:clock},remainingCoveredNotes:0,unclassifiedReceiptRows:0,scope:'s'});
  fresh();script={preview:PV(),apply:COMPLETED(OP)};const k1=mountH();await toApply(k1);const k1v=view(k1),k1m=msg(k1);
  fresh();script={preview:PV(),apply:COMPLETED('0123abcd-0123-4abc-8def-0123456789ac')};const k1b=mountH();await toApply(k1b);const k1bv=view(k1b),k1bm=msg(k1b);
  check('K1 the live message says "The server recorded the cleanup." only for this request\'s own completion; for an earlier one it says the cleanup had already been recorded',
   k1v.state==='recorded'&&k1m==='The server recorded the cleanup.'&&!k1v.text.includes('earlier request')&&k1bv.state==='recorded'&&k1bm==='The cleanup had already been recorded by an earlier request.'&&!k1bm.includes('The server recorded')&&k1bv.text.includes('recorded by an earlier request, not by this one'),JSON.stringify({k1m,k1bm}));
  const LOST=/lost or could not be read/,ODD=/not in a form this page recognises/;
  const oddCases=[];
  for(const [label,reply] of [['409',{status:409,data:{error:'receipt_note_cleanup_held',message:'held'}}],['503',{status:503,data:{error:'receipt_note_cleanup_unconfirmed',message:'m',nextAction:'status',retry:true}}]]){
   fresh();script={preview:PV(),apply:reply};const ba=mountH();await toApply(ba);const va=view(ba);
   oddCases.push(['apply '+label,va.state==='unconfirmed'&&va.text.includes('The server’s reply to the cleanup request was not in a form this page recognises.')&&!LOST.test(va.text)&&!!va.kept&&va.buttons==='Read the stored status'&&applies()===1]);
   fresh();script={preview:reply};const bp=mountH();await press(bp,'Count the notes');const vp=view(bp);
   oddCases.push(['count '+label,vp.state==='held'&&vp.text.includes('The server’s reply to the count was not in a form this page recognises.')&&!LOST.test(vp.text)&&vp.buttons==='Read the stored status']);
   fresh();script={status:reply};const bs=mountH();await press(bs,'Read the stored status');const vs=view(bs);
   oddCases.push(['status '+label,vs.state==='held'&&vs.text.includes('The server’s reply to the status read was not in a form this page recognises.')&&!LOST.test(vs.text)&&vs.buttons==='Read the stored status']);
  }
  // A reply with no readable body stays "lost or could not be read".
  fresh();script={preview:PV(),apply:{status:503,data:null}};const bn=mountH();await toApply(bn);const vn=view(bn);
  fresh();script={status:()=>({status:0})};const bl=mountH();await press(bl,'Read the stored status');const vl=view(bl);
  check('K2 a 409 or 503 that was read but is in no recognised shape is described as such (apply, count and status), never as lost; a reply with no readable body still is',oddCases.every(x=>x[1])&&LOST.test(vn.text)&&!ODD.test(vn.text)&&LOST.test(vl.text),JSON.stringify({failed:oddCases.filter(x=>!x[1]).map(x=>x[0]),vn:vn.text.slice(0,200)}));
  fresh();w3.sessionStorage.setItem(NR.STORE,'{"broken":');script={status:NOT};const k3=mountH();clock=now+300;await press(k3,'Read the stored status');const k3v=view(k3),latest='T'+(now+660);
  check('K3 the pending sentence for an unreadable earlier record states its time once, with one qualifier ("at the latest", no "about")',k3v.state==='unconfirmed'&&k3v.text.includes('the earlier request could still be processed until '+latest+' at the latest.')&&!/about/.test(k3v.text)&&k3v.text.split(latest).length-1===1,JSON.stringify(k3v.text));
  script={status:HOLD({unclassifiedReceiptRows:6})};await press(k3,'Read the stored status');const k4v=view(k3);
  check('K4 with an unreadable earlier record pending, a hold on the status read keeps "Outcome not confirmed": it does not settle that request, the count shows, only a status read, the record stays',
   k4v.state==='unconfirmed'&&k4v.head==='Outcome not confirmed'&&k4v.text.includes('That does not settle the earlier request.')&&k4v.text.includes('Receipt rows the cleanup cannot classify: 6')&&!NOTHING.test(k4v.text)&&k4v.buttons==='Read the stored status'&&k4v.stored==='{"broken":'&&k4v.focus&&applies()===0,JSON.stringify(k4v));
  fresh();
 } else for(const name of ['H1','H2','H3','H4','H5','H6','H7','H8','H9','H10','H11','H12','K1','K2','K3','K4'])check(name+' (module unavailable)',false);

 // ---------------------------------------------------------------- Round 3, item 3: invite evidence sources
 console.log('\n== Part I: launch invite rows from both evidence sources the backend projects (round 3) ==');
 {
  // The row shape is OfficerInvite233 as readOfficerInvites233 projects it (worker/src/officer-invites233.ts:24,191),
  // the same ten keys for both sources; only the source differs (OFFICER_INVITE_SOURCE233 / OFFICER_INVITE_SOURCE242).
  const L3=page.window.OlympusLaunch234;
  const freshPage=make=>{const d=ready(),t=Math.floor(Date.now()/1000);d.fetchedAt=t;d.expiresAt=t+60;d.snapshotAt=t;d.scan={id:'b'.repeat(32),startedAt:t,expiresAt:t+600};d.invites=make?make(t,d):[];return d;};
  const invite=(t,d,source,extra={})=>wire({queueId:7,proofId:'c'.repeat(32),name:'Synthetic Knight',guid:'Player-1-0010',fullName:'Synthetic Knight',scopeHash:d.scopeHash,observedAt:t,expiresAt:t+60,reason:'knight-unguilded',source,...extra});
  const d0=freshPage(),t0=d0.fetchedAt;
  const good=['native-who-unit-v233','native-who-whisper-v242'].map(s=>invite(t0,d0,s));
  const badRows=[['unit v242',invite(t0,d0,'native-who-unit-v242')],['whisper v233',invite(t0,d0,'native-who-whisper-v233')],['membership absence',invite(t0,d0,'membership-absence')],['trailing space',invite(t0,d0,'native-who-whisper-v242 ')],['no source',invite(t0,d0,undefined)],
   ['extra version field',invite(t0,d0,'native-who-whisper-v242',{version:242})],['no name',(()=>{const r=invite(t0,d0,'native-who-whisper-v242');delete r.name;return r;})()],['other scope',invite(t0,d0,'native-who-whisper-v242',{scopeHash:'0'.repeat(16)})],
   ['61 s evidence',invite(t0,d0,'native-who-unit-v233',{expiresAt:t0+61})],['other reason',invite(t0,d0,'native-who-whisper-v242',{reason:'membership'})],['bad character id',invite(t0,d0,'native-who-unit-v233',{guid:'Not a GUID'})],['queue id 0',invite(t0,d0,'native-who-whisper-v242',{queueId:0})]];
  const shapeOk=!!L3&&typeof L3.inviteShape==='function';
  check('I1 the view module admits exactly the two sources the backend can emit, each by its own exact row shape, and nothing else',shapeOk&&good.every(r=>L3.inviteShape(r,d0))&&badRows.every(([,r])=>!L3.inviteShape(r,d0))&&JSON.stringify(L3.INVITE_SOURCES)==='["native-who-unit-v233","native-who-whisper-v242"]',shapeOk?JSON.stringify(badRows.filter(([,r])=>L3.inviteShape(r,d0)).map(([n])=>n)):'no inviteShape');
  let next=null;page.intercept((url)=>url.startsWith('/api/admin/launch-operations')?new Response(JSON.stringify(next()),{status:200}):null);
  const openLaunch=async make=>{next=()=>freshPage(make);await page.go('#/');await page.go('#/admin/launch-operations');await waitFor(()=>!!page.app.querySelector('#launch-motd229')||page.app.textContent.includes('could not be confirmed')||!!page.app.querySelector('[data-launch234-held]'),'launch page with invites',8000);for(let i=0;i<3;i++)await settle();};
  await openLaunch((t,d)=>[invite(t,d,'native-who-unit-v233'),invite(t,d,'native-who-whisper-v242',{queueId:8,proofId:'d'.repeat(32),name:'Synthetic Whisperer',guid:'Player-1-0011',fullName:'Synthetic Whisperer'})]);
  const inv=page.app.querySelectorAll('[data-launch-invite233]').map(tr=>({source:tr.getAttribute('data-launch234-invite-source'),cells:tr.querySelectorAll('td').map(td=>td.textContent)}));
  const invHead=(()=>{const tr=page.app.querySelector('[data-launch-invite233]');const table=tr&&tr.closest('table');return table?table.querySelectorAll('thead th').map(th=>th.textContent).join('|'):'';})();
  check('I2 a page with a v233 and a v242 invite row is shown: both rows, each saying in plain words how it was seen, both current',!page.app.textContent.includes('could not be confirmed')&&inv.length===2
   &&inv[0].source==='native-who-unit-v233'&&inv[0].cells[0]==='Synthetic Knight'&&inv[0].cells[1]==='Seen in game by the officer, and a /who reply showed no guild'&&inv[0].cells[3]==='Recheck and invite in-game'
   &&inv[1].source==='native-who-whisper-v242'&&inv[1].cells[0]==='Synthetic Whisperer'&&inv[1].cells[1]==='Identified by their verification whisper, and a fresh /who reply showed no guild'&&inv[1].cells[3]==='Recheck and invite in-game'
   &&invHead==='Character|How it was seen|Evidence expires|Status'&&!inv.some(x=>x.cells.join(' ').includes('native-who')),JSON.stringify({inv,invHead,text:page.app.textContent.slice(-300)}));
  await openLaunch((t,d)=>[invite(t,d,'native-who-whisper-v242')]);
  const only242=page.app.querySelectorAll('[data-launch-invite233]').length===1&&!!page.app.querySelector('#launch-motd229');
  await openLaunch((t,d)=>[invite(t,d,'native-who-unit-v242')]);
  const unknownHeld=page.app.textContent.includes('could not be confirmed')&&!page.app.querySelector('#launch-motd229')&&!page.app.querySelector('[data-launch-invite233]')&&!page.app.querySelector('[data-launch-promotion229]');
  await openLaunch((t,d)=>[invite(t,d,'native-who-whisper-v242',{version:242})]);
  const extraHeld=page.app.textContent.includes('could not be confirmed')&&!page.app.querySelector('[data-launch-invite233]');
  check('I3 a page with only a v242 row is shown; a page with an unknown source or a v242 row carrying an extra field is refused as a whole',only242&&unknownHeld&&extraHeld,JSON.stringify({only242,unknownHeld,extraHeld}));
  page.intercept(null);
 }

 // ---------------------------------------------------------------- Round 4, item 1: the generic page cursor bound
 console.log('\n== Part J: the launch page cursor bound is the generic reader\'s (round 4) ==');
 {
  // The generic admin route reads its cursor with readCursor229 (worker/src/site-launch229.ts); the bound and the
  // alphabet are read from that source, so the page cannot drift from the reader without this check failing.
  const READER_SRC=fs.readFileSync(path.join(root,'src','site-launch229.ts'),'utf8');
  const readerFn=(/async function readCursor229\([\s\S]*?\n\}/.exec(READER_SRC)||[''])[0];
  const m=/raw\.length>(\d+)\|\|!\/(.+?)\/\.test\(raw\)/.exec(readerFn),READER_MAX=m?Number(m[1]):NaN,READER_RE=m?new RegExp(m[2]):/(?!)/;
  const DIRECTIVE_MAX=Number((/async function directiveCursor\([\s\S]*?raw\.length>(\d+)/.exec(READER_SRC)||[])[1]);
  // Codex's evidence (13 Nov 2026): the genuine generic reader on local Workerd/D1, 1,000 members, a late provider 429
  // after 19 role reads; the partial page it returned, byte for byte.
  const CODEX_RAW=fs.readFileSync(path.join(__dirname,'evergreen1112_ui280_cursor_page.json'),'utf8'),CODEX=JSON.parse(CODEX_RAW),CODEX_CURSOR=CODEX.pageCursor;
  const shaped=len=>'A'.repeat(len-65)+'.'+'a'.repeat(64);
  const SHORT=shaped(200);
  const outside=[['a plus sign (standard base64)',SHORT.slice(0,10)+'+'+SHORT.slice(11)],['a slash',SHORT.slice(0,10)+'/'+SHORT.slice(11)],['base64 padding',SHORT.slice(0,134)+'='+SHORT.slice(135)],
   ['a space',SHORT.slice(0,10)+' '+SHORT.slice(11)],['a percent sign',SHORT.slice(0,10)+'%'+SHORT.slice(11)],['an upper-case MAC',SHORT.slice(0,136)+'A'.repeat(64)],
   ['a 63-character MAC',SHORT.slice(0,-1)],['no MAC',SHORT.slice(0,135)],['a second dot',SHORT.slice(0,10)+'.'+SHORT.slice(11)],['a line break',SHORT+'\n']];
  const L4=page.window.OlympusLaunch234,has=!!L4&&typeof L4.pageCursorShape==='function';
  const samples=[CODEX_CURSOR,shaped(4096),shaped(4097),shaped(8192),SHORT,...outside.map(x=>x[1])];
  check('J0 the page\'s cursor bound and alphabet are the generic reader\'s: 4,096 characters, base64url body, dot, 64-hex MAC (and the directive\'s 8,192 is a different wire)',has&&READER_MAX===4096&&L4.PAGE_CURSOR_MAX===READER_MAX&&DIRECTIVE_MAX===8192&&samples.every(s=>L4.pageCursorShape(s)===(s.length<=READER_MAX&&READER_RE.test(s))),JSON.stringify({READER_MAX,DIRECTIVE_MAX,max:L4&&L4.PAGE_CURSOR_MAX,re:m&&m[2]}));
  check('J1 the module admits Codex\'s 3,420-character cursor and one of exactly 4,096; it refuses 4,097, 8,192, a non-string and every character outside the alphabet',has&&CODEX_CURSOR.length===3420&&L4.pageCursorShape(CODEX_CURSOR)&&L4.pageCursorShape(shaped(4096))&&shaped(4096).length===4096&&L4.pageCursorShape(SHORT)
   &&!L4.pageCursorShape(shaped(4097))&&!L4.pageCursorShape(shaped(8192))&&![null,undefined,4096,['x']].some(v=>L4.pageCursorShape(v))&&outside.every(([,s])=>!L4.pageCursorShape(s)),has?JSON.stringify(outside.filter(([,s])=>L4.pageCursorShape(s)).map(([n])=>n)):'no pageCursorShape');
  // The admin route in the page, with the page clock at Codex's fetch time so the captured page is current as captured.
  let t0=Date.now(),reads=[],answer=()=>CODEX_RAW;
  const pg=await openPage(STAFF,{},{clockNow:()=>CODEX.fetchedAt*1000+(Date.now()-t0)});
  pg.intercept((url,init)=>{if(url.startsWith('/api/admin/launch-operations')){reads.push(url);return new Response(answer(),{status:200});}return null;});
  const openAt=async body=>{answer=()=>body;reads=[];t0=Date.now();await pg.go('#/');await pg.go('#/admin/launch-operations');if(!pg.window.OlympusLaunch234)await supply(pg);
   await waitFor(()=>!!pg.app.querySelector('#launch-motd229')||pg.app.textContent.includes('could not be confirmed')||!!pg.app.querySelector('[data-launch234-held]'),'cursor bound page',8000);for(let i=0;i<3;i++)await settle();};
  const shownPage=()=>!pg.app.textContent.includes('could not be confirmed')&&!!pg.app.querySelector('#launch-motd229')&&pg.app.querySelectorAll('[data-launch-promotion229]').length===19;
  const heldPage=()=>pg.app.textContent.includes('Current launch evidence could not be confirmed')&&!pg.app.querySelector('#launch-motd229')&&!pg.app.querySelector('[data-launch-promotion229]')&&!pg.app.querySelector('[data-launch-advisory229]')&&reads.length===1;
  await openAt(CODEX_RAW);
  const firstView={shown:shownPage(),held:pg.app.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229]').length,progress:pg.app.querySelector('[data-launch-progress229]')?.textContent||'',rate:!!pg.app.querySelector('[data-launch234-hold="discord-rate-limited"]'),more:byText(pg.app,'button','Load next 20 role checks')?.hidden,recheck:!!pg.app.querySelector('#launch-recheck229-0')&&!pg.app.querySelector('#launch-recheck229-0').disabled,reads:reads.length};
  check('J2 Codex\'s real partial page (3,420-character cursor after a late 429) renders: 19 current promotions, 20 of 1000 examined, the slow-down hold in plain words, no next page, Recheck available',firstView.shown&&firstView.progress.startsWith('Discovery partial: 20 of 1000')&&firstView.rate&&firstView.more===true&&firstView.recheck&&firstView.reads===1,JSON.stringify({...firstView,text:pg.app.textContent.slice(-500)}));
  // Discord asked for a 1 s pause (retryAfterSeconds); the retry is the officer's Recheck after it.
  await new Promise(r=>setTimeout(r,2100));
  const recheck=pg.app.querySelector('#launch-recheck229-0');if(recheck)recheck.click();for(let i=0;i<6;i++)await settle();await waitFor(()=>reads.length>=2,'the recheck read',4000);for(let i=0;i<3;i++)await settle();
  const sent=reads[1]||'',sentCursor=sent?new URL('https://fixture.invalid'+sent).searchParams.get('cursor'):null;
  check('J3 its retry (Recheck this page) sends the original cursor unchanged, byte for byte, in one read, and the page stays shown',reads.length===2&&sent==='/api/admin/launch-operations?cursor='+CODEX_CURSOR&&sentCursor===CODEX_CURSOR&&shownPage(),JSON.stringify({reads:reads.map(r=>r.slice(0,80)+'… ('+r.length+')'),same:sentCursor===CODEX_CURSOR}));
  const withCursor=c=>JSON.stringify({...CODEX,pageCursor:c});
  await openAt(withCursor(shaped(4096)));const at4096=shownPage()&&reads.length===1;
  check('J4 a page whose cursor is exactly 4,096 characters is accepted',at4096,pg.app.textContent.slice(-300));
  await openAt(withCursor(shaped(4097)));const at4097=heldPage();
  await openAt(withCursor(shaped(8192)));const at8192=heldPage();
  check('J5 one character more (4,097) holds the page, and so does a cursor of the directive\'s 8,192: nothing shown, read once',at4097&&at8192,JSON.stringify({at4097,at8192}));
  const outsideHeld=[];for(const [name,c] of outside){await openAt(withCursor(c));if(!heldPage())outsideHeld.push(name);}
  await openAt(withCursor(SHORT));const shortShown=shownPage();
  check('J6 a cursor with a character outside the reader\'s alphabet holds the page ('+outside.length+' cases, each 200 characters or fewer), while the same short cursor in the alphabet is shown',outsideHeld.length===0&&shortShown,JSON.stringify({notHeld:outsideHeld,shortShown}));
  pg.intercept(null);
 }

 // ---------------------------------------------------------------- Round 5 (13 Nov 2026): the v235 discovery family
 console.log('\n== Part L: a separate reader for the v235 discovery family (round 5, Codex CONTRACT-01) ==');
 {
  const STATIC_DIR=process.env.UI280_STATIC_DIR||path.join(root,'public','static');
  const D_FILE=path.join(STATIC_DIR,'launch-discovery235.js'),D_SEL='script[src="/static/launch-discovery235.js"]';
  let D_SRC=null;try{D_SRC=fs.readFileSync(D_FILE,'utf8');}catch{}
  const installD=win=>{if(D_SRC!==null&&!win.OlympusDiscovery235)vm.runInNewContext(D_SRC,{window:win,Object,Array,JSON,String,Number,RegExp,Map,Set,Error},{filename:'launch-discovery235.js'});return win.OlympusDiscovery235||null;};
  // Codex's server pages for the new family, copied unchanged from the runtime evidence CONTRACT-01 names (provenance and
  // hashes inside the file): 11 single reads of runtime-09-final, the first two pages of a qualified and of a rank-held
  // 1,000-member scan (runtime-06, runtime-10-held1000).
  const FIX=JSON.parse(fs.readFileSync(path.join(__dirname,'evergreen1112_ui280_discovery235_pages.json'),'utf8')),P=FIX.pages,copy=name=>wire(P[name]);
  const RANKHELD={'rankheld':'native-rank-scheme-unconfirmed','policyoff':'directive-rank-policy-held','invalid-policy':'directive-rank-policy-held','v1-member':'native-rank-scheme-unconfirmed','cap3':'native-rank-scheme-unconfirmed','generation':'native-rank-scheme-unconfirmed','privacy':'native-rank-scheme-unconfirmed','standing':'native-rank-scheme-unconfirmed','expired':'native-rank-scheme-unconfirmed','held1000-first':'native-rank-scheme-unconfirmed','held1000-offset20':'native-rank-scheme-unconfirmed'};
  const shaped=len=>'A'.repeat(len-65)+'.'+'a'.repeat(64);
  const as234=d=>Object.assign(d,{protocol:'officer-operations-v234'});
  check('L0 the v235 reader is its own static file; it never writes HTML, fetches, stores or logs',D_SRC!==null&&!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\./.test(D_SRC),D_FILE);
  const mw=makeWindow('{}').window;install(mw);const D=installD(mw),L=mw.OlympusLaunch234;
  if(D){
   // The page's choice (app.js launchView235): the declared family picks the reader; anything else is the v234 view's.
   const admit=(d,first=null)=>(d&&typeof d==='object'&&d.protocol==='officer-operations-v235'?D:L).assess(d,first);
   const pos=Object.keys(P).map(name=>[name,admit(copy(name),name.endsWith('offset20')?copy(name.replace('offset20','first')):null)]);
   check('L1 all 15 contract pages are admitted by the v235 reader (11 single reads, two first pages and their next pages); rank-held pages name their reason, qualified pages none',pos.length===15&&pos.every(([name,v])=>v.ok===true&&v.rankHeld===(RANKHELD[name]||null)),JSON.stringify(pos.filter(([name,v])=>v.ok!==true||v.rankHeld!==(RANKHELD[name]||null))));
   const seenReasons=[...new Set(Object.values(RANKHELD))].sort();
   check('L2 the reader knows exactly the contract\'s two rank-hold reasons, each with one plain sentence, and explains the hold codes only the v235 producer sends',JSON.stringify([...D.RANK_HELD_REASONS].sort())===JSON.stringify(seenReasons)&&seenReasons.every(code=>{const s=D.holdText(code);return /^Ranks are held because /.test(s)&&s.split('. ').length===1&&!s.includes(code);})&&['directive-rank-policy-source-unconfirmed','discovery-seal-unconfigured','discovery-rank-hold-invalid'].every(code=>!D.holdText(code).includes('does not recognise')&&!D.holdText(code).includes(code)),JSON.stringify(seenReasons.map(D.holdText)));
   const RH=()=>copy('rankheld'),Q=()=>copy('qualified');
   const neg=[
    ['legacy234-null-triple: a v234 page without a rank table that claims partial',as234(RH()),'malformed-rank-table'],
    ['unknown-protocol',Object.assign(RH(),{protocol:'officer-operations-v236'}),'unknown-protocol'],
    ['one-profile-only',Object.assign(RH(),{rankProfile:'unconfirmed'}),'malformed-rank-table'],
    ['one-digest-only',Object.assign(RH(),{rankSchemeDigest:L.DIGEST}),'malformed-rank-table'],
    ['one-names-only',Object.assign(RH(),{rankNames:[...L.NAMES]}),'malformed-rank-table'],
    ['ready-null-triple',Object.assign(RH(),{status:'ready'}),'malformed-rank-table'],
    ['unknown-hold-reason',Object.assign(RH(),{heldReasons:['arbitrary']}),'rank-held-unknown-reason'],
    ['both rank-hold reasons at once',Object.assign(RH(),{heldReasons:['native-rank-scheme-unconfirmed','directive-rank-policy-held']}),'rank-held-unknown-reason'],
    ['no hold reason at all',Object.assign(RH(),{heldReasons:[]}),'rank-held-unknown-reason'],
    ['promotion-array-injection',Object.assign(RH(),{promotions:[{name:'Synthetic Initiate',guid:'Player-4613-12345679',currentSlot:9,targetSlot:7,targetName:'Member',reason:'verified-initiate'}]}),'rank-held-malformed'],
    ['promotion-keyed-injection',Object.assign(RH(),{promotions:{'unsafe-key':{}}}),'rank-held-malformed'],
    ['risk-keyed-injection',Object.assign(RH(),{riskBuffer:{'unsafe-key':{}}}),'rank-held-malformed'],
    ['a risk row on a rank-held page',Object.assign(RH(),{riskBuffer:[{name:'Synthetic Initiate',guid:'Player-4613-12345679',level:10,lastOnlineDays:3}]}),'rank-held-malformed'],
    ['a held row under another reason',(()=>{const x=RH();x.held[0].reason='native-rank-unconfirmed';return x;})(),'rank-held-row-shape'],
    ['a held row with an extra field',(()=>{const x=RH();x.held[0].targetSlot=7;return x;})(),'rank-held-row-shape'],
    ['future-source-clock',(()=>{const x=RH();x.snapshotAt=x.fetchedAt+6;return x;})(),'page-clock'],
    ['a scan that starts after the read',(()=>{const x=RH();x.scan.startedAt=x.fetchedAt+1;return x;})(),'page-clock'],
    ['a qualified page with a future export',(()=>{const x=Q();x.snapshotAt=x.fetchedAt+6;return x;})(),'page-clock'],
    ['a qualified page with an unknown digest',Object.assign(Q(),{rankSchemeDigest:'c'.repeat(64)}),'unknown-digest'],
    ['a qualified page whose promotion carries a token',(()=>{const x=Q();x.promotions[0].intentToken='t.'+'0'.repeat(64);return x;})(),'unknown-row-shape'],
   ];
   const nativeToPolicy=x=>{x.heldReasons=x.heldReasons.map(c=>c==='native-rank-scheme-unconfirmed'?'directive-rank-policy-held':c);for(const r of x.held)r.reason='directive-rank-policy-held';return x;};
   const pairs=[
    ['mixed-protocol-pages: a v235 page continuing a v234 first page',D.assess(copy('held1000-offset20'),as234(copy('held1000-first'))),'family-changed'],
    ['mixed-rank-mode-pages: qualified after rank-held',D.assess(copy('qualified1000-offset20'),copy('held1000-first')),'rank-mode-changed'],
    ['mixed-rank-mode-pages: rank-held after qualified',D.assess(copy('held1000-offset20'),copy('qualified1000-first')),'rank-mode-changed'],
    ['the rank-hold reason changes between pages',D.assess(nativeToPolicy(copy('held1000-offset20')),copy('held1000-first')),'rank-mode-changed'],
   ];
   const wrongNeg=[...neg.map(([name,d,code])=>[name,admit(d),code]),...pairs].filter(([,v,code])=>v.ok!==false||v.code!==code||typeof v.text!=='string'||!v.text||/officer-operations|v23\d/.test(v.text));
   check('L3 the contract\'s negative pages (the Lua refusals, mirrored) and the cross-page cases are each refused with their own plain reason ('+(neg.length+pairs.length)+' cases)',wrongNeg.length===0,JSON.stringify(wrongNeg.map(([name,v,code])=>[name,code,v])));
   // Review of 13 Nov 2026. Finding 1: a held v235 page (held229's shape, as held235 sends it) is admitted after a rank-held
   // or a qualified page and ends the scan; as a first page it is a plain held page. Finding 3: a rank-held page's counts
   // match its rows and a qualified page's space-buffer rows have the producer's shape. Finding 4: the restart sentence.
   const heldPage=()=>Object.assign(RH(),{status:'held',snapshotId:null,snapshotAt:null,memberCount:null,guild:null,canonicalGuild:null,realm:null,scopeHash:null,held:[],invites:[],pageCursor:null,nextCursor:null,
    scan:{id:null,startedAt:null,expiresAt:null},entitlements:{offset:0,pageSize:20,scanned:0,total:0,unscanned:0,retryAfterSeconds:null},heldReasons:['native-unguilded-proof-required','native-snapshot-unavailable','native-rank-scheme-unconfirmed','launch-read-window-exhausted']});
   const endings=[['after a rank-held page',D.assess(heldPage(),copy('held1000-first'),20),true],['after a qualified page',D.assess(heldPage(),copy('qualified1000-first'),20),true],['as a first page',D.assess(heldPage(),null,0),false]];
   const endWrong=endings.filter(([,v,ended])=>v.ok!==true||v.rankHeld!==null||(v.scanEnded===true)!==ended);
   const R1000=()=>copy('held1000-offset20'),F1000=()=>copy('held1000-first'),Q1000=()=>copy('qualified1000-first');
   const counts=[
    ['a held row removed',(()=>{const x=R1000();x.held.pop();return x;})(),F1000()],['scanned 7 with 20 held rows',(()=>{const x=R1000();x.entitlements.scanned=7;return x;})(),F1000()],
    ['unscanned +20',(()=>{const x=R1000();x.entitlements.unscanned+=20;return x;})(),F1000()],['member count 1001 on a first page',Object.assign(F1000(),{memberCount:1001}),null],
    ['export id -1 on a first page',Object.assign(F1000(),{snapshotId:-1}),null],['export id missing on a first page',(()=>{const x=F1000();delete x.snapshotId;return x;})(),null],
    ['no next-page link with members left',Object.assign(F1000(),{nextCursor:null}),null],['page size 21',(()=>{const x=F1000();x.entitlements.pageSize=21;return x;})(),null],
   ].map(([name,d,first])=>[name,D.assess(d,first,first?20:0),'page-counts']);
   const risks=[['a number',7],['text','x'],['a list',[]],['an empty object',{}],['level 0',r=>({...r,level:0})],['an extra field',r=>({...r,targetSlot:7})],['another reason',r=>({...r,reason:'knight-veteran'})],['slot 8',r=>({...r,currentSlot:8})],['not review-only',r=>({...r,reviewOnly:false})],['minus one day offline',r=>({...r,lastOnlineDays:-1})]]
    .map(([name,change])=>{const x=Q1000();x.riskBuffer[0]=typeof change==='function'?change(x.riskBuffer[0]):change;return ['a space-buffer row: '+name,D.assess(x,null,0),'risk-row-shape'];});
   const shapeWrong=[...counts,...risks].filter(([,v,code])=>v.ok!==false||v.code!==code||!v.text);
   const restart=D.restartText?D.restartText('expired_or_invalid_launch_cursor'):'';
   check('L3b a held v235 page ends a rank-held or qualified scan instead of being refused (and is a plain held page when read first); '+(counts.length+risks.length)+' count and space-buffer changes are refused; the expired-or-invalid link sentence names both',endWrong.length===0&&shapeWrong.length===0
    &&restart==='The link to this page has expired or is no longer accepted. Start again from the first page.'&&D.assess(F1000(),null,0).ok===true&&D.assess(Q1000(),null,0).ok===true,JSON.stringify({endWrong,shapeWrong,restart}));
  } else for(const name of ['L1','L2','L3'])check(name+' (v235 module unavailable)',false);

  // The real admin route, with the page clock at each served page's fetch time (the pages are captured, not fresh).
  let base=P.rankheld.fetchedAt,t0=Date.now(),answers=[],reads=[];
  const pg=await openPage(STAFF,{},{clockNow:()=>base*1000+(Date.now()-t0)});
  pg.intercept(url=>{if(!url.startsWith('/api/admin/launch-operations'))return null;reads.push(url);const a=answers.length>1?answers.shift():answers[0];return new Response(typeof a==='string'?a:JSON.stringify(a),{status:200});});
  const suppliedL=p=>{const t=p.document.head.querySelector(SCRIPT);if(t&&!p.window.OlympusLaunch234){install(p.window);t.dispatchEvent(new Event('load'));}const u=p.document.head.querySelector(D_SEL);if(u&&!p.window.OlympusDiscovery235&&installD(p.window))u.dispatchEvent(new Event('load'));};
  const settledL=p=>{suppliedL(p);return !!p.app.querySelector('#launch-motd229')||p.app.textContent.includes('could not be confirmed')||!!p.app.querySelector('[data-launch234-held]');};
  const openL=async(...served)=>{answers=served;reads=[];base=served[0]&&Number.isSafeInteger(served[0].fetchedAt)?served[0].fetchedAt:P.rankheld.fetchedAt;t0=Date.now();await pg.go('#/');await pg.go('#/admin/launch-operations');await waitFor(()=>settledL(pg),'v235 launch page',8000);for(let i=0;i<3;i++)await settle();};
  const outcome=(p=pg)=>{const held=p.app.querySelector('[data-launch234-held]');return held?'held:'+held.getAttribute('data-launch234-held'):p.app.textContent.includes('Current launch evidence could not be confirmed')?'unconfirmed':p.app.querySelector('#launch-motd229')?'shown':'other';};
  const nothingDrawn=()=>!pg.app.querySelector('#launch-motd229')&&!pg.app.querySelector('[data-launch-invite233]')&&!pg.app.querySelector('[data-launch-promotion229]')&&!pg.app.querySelector('[data-launch-advisory229]')&&!pg.app.querySelector('[data-launch235-rank-held]');
  const btn=t=>byText(pg.app,'button',t);
  // Item 6 (13 Nov 2026): a rank-held page names its continuation "Load next 20 roster members"; every other page keeps the v234 label.
  const nextBtn=()=>btn('Load next 20 role checks')||btn('Load next 20 roster members');
  const clickL=async el=>{if(!el)return false;el.click();for(let i=0;i<6;i++)await settle();await waitFor(()=>settledL(pg)&&!pg.app.textContent.includes('Reading at most 20'),'after click',4000);for(let i=0;i<3;i++)await settle();return true;};
  const singles=Object.keys(P).filter(name=>!name.endsWith('offset20'));
  const shownAll=[];for(const name of singles){await openL(copy(name));shownAll.push([name,outcome(),reads.length]);}
  check('L4 the page shows every first page of the contract through the real admin route (13 pages), each after exactly one read',shownAll.every(([,o,r])=>o==='shown'&&r===1),JSON.stringify(shownAll.filter(([,o,r])=>o!=='shown'||r!==1)));
  const scans=[];
  for(const kind of ['qualified1000','held1000']){
   const first=copy(kind+'-first'),next=copy(kind+'-offset20');await openL(first,next);
   const shownFirst=outcome()==='shown',more=nextBtn();await clickL(more&&!more.hidden?more:null);
   const sent=reads[1]?new URL('https://fixture.invalid'+reads[1]).searchParams.get('cursor'):null;
   scans.push({kind,shownFirst,second:outcome(),reads:reads.length,sameCursor:sent===first.nextCursor,pages:pg.app.querySelectorAll('button').filter(b=>b.textContent==='Recheck this page').length,progress:pg.app.querySelector('[data-launch-progress229]')?.textContent||''});
  }
  check('L5 a qualified and a rank-held 1,000-member scan continue: Load next sends the first page\'s next-page link unchanged and both pages are shown (40 of 1000 examined)',scans.every(s=>s.shownFirst&&s.second==='shown'&&s.reads===2&&s.sameCursor&&s.pages===2&&s.progress.includes('40 of 1000')),JSON.stringify(scans));
  // A rank-held page: the reason in one sentence, invites and membership working, nothing about ranks offered.
  const rankHeldView=async name=>{await openL(copy(name));const heldFrame=pg.app.querySelectorAll('h2').find(x=>x.textContent==='Held evidence')?.closest('section');
   const inviteFrame=pg.app.querySelectorAll('h2').find(x=>x.textContent==='Unguilded Knight+ invite queue')?.closest('section');
   return {outcome:outcome(),code:pg.app.querySelector('[data-launch235-rank-held]')?.getAttribute('data-launch235-rank-held')||null,sentence:pg.app.querySelector('[data-launch235-rank-held]')?.textContent||'',roles:pg.app.querySelector('[data-launch235-rank-roles]')?.textContent??null,
    title:!!pg.app.querySelectorAll('h2').find(x=>x.textContent==='Ranks held on this read'),rankTable:!!pg.app.querySelector('[data-launch234-ranks]'),
    invites:pg.app.querySelectorAll('[data-launch-invite233]').map(tr=>tr.querySelectorAll('td').map(td=>td.textContent)),badge:inviteFrame?.querySelector('.badge')?.textContent,
    enabled:['Refresh first page','Scan entire roster','Copy MOTD','Copy expanded bulletin','Recheck this page'].map(t=>[t,!!btn(t)&&!btn(t).disabled&&!btn(t).hidden]),
    promotions:pg.app.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229]').length,noPromotionNote:!!pg.app.querySelector('[data-launch235-no-promotions]'),
    listedTwice:!!pg.app.querySelector('[data-launch234-hold="'+(RANKHELD[name])+'"]'),unknown:pg.app.textContent.includes('does not recognise'),
    heldRows:heldFrame?heldFrame.querySelectorAll('tbody tr').map(tr=>tr.querySelectorAll('td').map(td=>td.textContent).join(' | ')):[],progress:pg.app.querySelector('[data-launch-progress229]')?.textContent||''};};
  const rhN=await rankHeldView('rankheld'),rhP=await rankHeldView('policyoff');
  const rhOk=(v,code,sentence,row)=>v.outcome==='shown'&&v.code===code&&v.sentence===sentence&&v.title&&!v.rankTable&&v.invites.length===1&&v.invites[0][3]==='Recheck and invite in-game'&&v.badge==='1'
   &&v.enabled.every(([,on])=>on)&&v.promotions===0&&v.noPromotionNote&&!v.listedTwice&&!v.unknown&&v.heldRows.length===2&&v.heldRows.every(r=>r.endsWith(' | '+row))&&v.progress.startsWith('Discovery complete: 2 of 2');
  check('L6 a rank-held page says in one sentence why ranks are held (the roster export), shows its v242 invite as current with the read and copy controls enabled, offers no rank control and lists each member as held',rhOk(rhN,'native-rank-scheme-unconfirmed','Ranks are held because the latest roster export does not show the ten ranks of the 12 November ladder, or a member’s rank does not match its slot.','Rank held: the roster export’s ranks are not confirmed'),JSON.stringify(rhN));
  check('L7 the same for the other reason (the site\'s rank settings): its own sentence, the hold not repeated in the hold list',rhOk(rhP,'directive-rank-policy-held','Ranks are held because the site’s Discord rank settings do not use the 12 November ladder yet.','Rank held: the site’s rank settings are not on the 12 November ladder yet'),JSON.stringify(rhP));
  check('L7b the settings reason also says what is not held (Discord rank roles keep following the current settings); the roster-export reason does not say it',rhP.roles==='This hold is about the ranks and the promotion recommendations on this page. Rank roles in Discord are not held by it: they keep following the site’s current rank settings.'&&rhN.roles===null,JSON.stringify([rhP.roles,rhN.roles]));
  await openL(copy('rankheld'));const rhCursor=P.rankheld.pageCursor;await clickL(btn('Recheck this page'));
  const recheckSent=reads[1]?new URL('https://fixture.invalid'+reads[1]).searchParams.get('cursor'):null,afterRecheck=outcome();await clickL(btn('Refresh first page'));
  check('L8 on a rank-held page Recheck sends its own page link unchanged and Refresh reads the first page again; the page stays shown',reads.length===3&&recheckSent===rhCursor&&reads[2]==='/api/admin/launch-operations'&&afterRecheck==='shown'&&outcome()==='shown',JSON.stringify({reads:reads.map(r=>r.slice(0,70)),afterRecheck,now:outcome()}));
  // Cursor bounds by family: 8,192 for v235 only; the v234 page keeps 4,096.
  const late=copy('late429'),bounds={late235:null,late234:null,pc8192:null,pc8193:null};
  await openL(late);bounds.late235=outcome()==='shown'&&pg.app.querySelectorAll('[data-launch-promotion229]').length===19;
  await openL(as234(copy('late429')));bounds.late234=outcome();
  await openL(Object.assign(copy('rankheld'),{pageCursor:shaped(8192)}));bounds.pc8192=outcome();
  await openL(Object.assign(copy('rankheld'),{pageCursor:shaped(8193)}));bounds.pc8193=outcome();
  check('L9 Codex\'s late-429 v235 page (5,477-character page link, 19 promotions) is shown; the same page in the v234 form is refused, and a v235 page link of 8,193 characters is refused while 8,192 is shown',late.pageCursor.length===5477&&bounds.late235&&bounds.late234==='unconfirmed'&&bounds.pc8192==='shown'&&bounds.pc8193==='unconfirmed',JSON.stringify(bounds));
  // Item 2: the next-page link is shape-checked before any request is built from it.
  const nextCases=[];
  const q234=()=>as234(copy('qualified1000-first'));
  for(const [label,make,want] of [['v234 link of 4,096',()=>Object.assign(q234(),{nextCursor:shaped(4096)}),'shown'],['v234 link of 4,097',()=>Object.assign(q234(),{nextCursor:shaped(4097)}),'unconfirmed'],['v234 link with a plus sign',()=>Object.assign(q234(),{nextCursor:'A+'+shaped(300).slice(2)}),'unconfirmed'],['v234 link without a MAC',()=>Object.assign(q234(),{nextCursor:'AAAA'}),'unconfirmed'],['v234 link that is a number',()=>Object.assign(q234(),{nextCursor:4096}),'unconfirmed'],
   ['v235 link of 8,192',()=>Object.assign(copy('held1000-first'),{nextCursor:shaped(8192)}),'shown'],['v235 link of 8,193',()=>Object.assign(copy('held1000-first'),{nextCursor:shaped(8193)}),'unconfirmed'],['v235 link with a slash',()=>Object.assign(copy('held1000-first'),{nextCursor:'A/'+shaped(300).slice(2)}),'unconfirmed'],['v235 link with an upper-case MAC',()=>Object.assign(copy('held1000-first'),{nextCursor:shaped(300).slice(0,236)+'A'.repeat(64)}),'unconfirmed']]){
   const d=make();await openL(d);const o=outcome(),more=nextBtn(),visible=!!more&&!more.hidden;
   if(visible)await clickL(more);const sent=reads[1]?new URL('https://fixture.invalid'+reads[1]).searchParams.get('cursor'):null;
   nextCases.push({label,want,o,visible,reads:reads.length,sent:sent===null?null:sent===d.nextCursor,drawn:!nothingDrawn()});
  }
  check('L10 a next-page link is checked like the page link of its family: 4,096 for v234 and 8,192 for v235 are followed byte for byte; longer, outside the alphabet or not text holds the page and is never sent',nextCases.every(c=>c.want==='shown'?c.o==='shown'&&c.visible&&c.reads===2&&c.sent===true:c.o==='unconfirmed'&&!c.visible&&c.reads===1&&!c.drawn),JSON.stringify(nextCases));
  // Families never mix inside one scan; an undeclared family is refused with the existing message.
  const mix=[];
  await openL(copy('qualified1000-first'),as234(copy('qualified1000-offset20')));await clickL(btn('Load next 20 role checks'));mix.push(['v234 page after a v235 page',outcome(),reads.length,!nothingDrawn()]);
  await openL(as234(copy('qualified1000-first')),copy('qualified1000-offset20'));await clickL(btn('Load next 20 role checks'));mix.push(['v235 page after a v234 page',outcome(),reads.length,!nothingDrawn()]);
  check('L11 a scan whose next page declares the other family is refused as a whole and nothing of it stays shown',mix.every(([,o,r,drawn])=>o==='unconfirmed'&&r===2&&!drawn),JSON.stringify(mix));
  // Single-field changes of a positive rank-held page: each one is refused by the page as a whole.
  const muts=[
   ['protocol v234',d=>{d.protocol='officer-operations-v234';}],['protocol v236',d=>{d.protocol='officer-operations-v236';}],['protocol missing',d=>{delete d.protocol;}],
   ['status ready',d=>{d.status='ready';}],['status unknown',d=>{d.status='paused';}],
   ['profile set alone',d=>{d.rankProfile=L.PROFILE;}],['digest set alone',d=>{d.rankSchemeDigest=L.DIGEST;}],['names set alone',d=>{d.rankNames=[...L.NAMES];}],['names empty list',d=>{d.rankNames=[];}],['profile missing',d=>{delete d.rankProfile;}],
   ['a promotion row',d=>{d.promotions=[{name:'Synthetic Initiate',guid:'Player-4613-12345679',currentSlot:9,targetSlot:7,targetName:'Member',reason:'verified-initiate'}];}],['promotions keyed',d=>{d.promotions={x:{}};}],['a risk row',d=>{d.riskBuffer=[{name:'Synthetic Initiate',guid:'Player-4613-12345679',level:10,lastOnlineDays:3}];}],
   ['reason unknown',d=>{d.heldReasons=['arbitrary'];}],['both reasons',d=>{d.heldReasons=['native-rank-scheme-unconfirmed','directive-rank-policy-held'];}],['reasons not a list',d=>{d.heldReasons='native-rank-scheme-unconfirmed';}],
   ['held row other reason',d=>{d.held[1].reason='pending-verification';}],['held row extra field',d=>{d.held[0].currentSlot=9;}],['held row bad character id',d=>{d.held[0].guid='Not a GUID';}],['held not a list',d=>{d.held={};}],['held row repeated',d=>{d.held[1]={...d.held[0]};}],
   ['page link too long',d=>{d.pageCursor=shaped(8193);}],['page link outside the alphabet',d=>{d.pageCursor='A+'+d.pageCursor.slice(2);}],['page link missing',d=>{d.pageCursor=null;}],
   ['next link too long',d=>{d.nextCursor=shaped(8193);}],['next link outside the alphabet',d=>{d.nextCursor='A='+shaped(300).slice(2);}],['next link not text',d=>{d.nextCursor=true;}],
   ['invite source unknown',d=>{d.invites[0].source='native-who-unit-v242';}],['invite extra field',d=>{d.invites[0].version=235;}],['invite other scope',d=>{d.invites[0].scopeHash='0'.repeat(16);}],['four invites',d=>{d.invites=[0,1,2,3].map(i=>({...d.invites[0],queueId:i+1,proofId:String(i).repeat(32)}));}],
   ['export after the read',d=>{d.snapshotAt=d.fetchedAt+6;}],['window over 60 s',d=>{d.expiresAt=d.fetchedAt+61;}],['window empty',d=>{d.expiresAt=d.fetchedAt;}],['scan id malformed',d=>{d.scan.id='x';}],['scan starts after the read',d=>{d.scan.startedAt=d.fetchedAt+1;}],['scan over 600 s',d=>{d.scan.expiresAt=d.scan.startedAt+601;}],
   ['offset not a page start',d=>{d.entitlements.offset=10;}],['MOTD not ASCII',d=>{d.motd.short='Olympus – officers';}],['automatic action',d=>{d.actions.automatic=true;}],['role grants',d=>{d.actions.roleGrants=true;}],['removals',d=>{d.actions.removals=true;}],
  ];
  const mutWrong=[];
  await openL(copy('rankheld'));const control=outcome();
  for(const [label,mutate] of muts){const d=copy('rankheld');mutate(d);await openL(d);const o=outcome();if(o==='shown'||o==='other'||!nothingDrawn()||reads.length!==1)mutWrong.push([label,o,reads.length]);}
  check('L12 the unchanged rank-held page is shown, and each of '+muts.length+' single-field changes of it is refused as a whole after one read (rank fields, rows, holds, links, invites, clocks, scan, MOTD, actions)',control==='shown'&&mutWrong.length===0,JSON.stringify({control,mutWrong}));
  await openL(Object.assign(copy('rankheld'),{protocol:'officer-operations-v236'}));
  const unknownFamily={o:outcome(),text:pg.app.querySelector('[data-launch234-held]')?.textContent||''};
  check('L13 a reply of neither family is refused with the existing v234 message',unknownFamily.o==='held:unknown-protocol'&&unknownFamily.text===L.assess({protocol:'officer-operations-v236'},null).text,JSON.stringify(unknownFamily));
  pg.intercept(null);

  // A v234 page is untouched by the v235 reader: the DOM of fixed v234 pages equals the record made with b631136's
  // page script (UI280_APP_JS=<base app.js> UI280_WRITE_V234_DOM=<file> regenerates it), and the v235 module is never
  // requested on a page that only ever sees v234 replies.
  const AT=P.rankheld.fetchedAt;
  const fixed234=()=>{const d=wire(ops.projectLaunchOperations229({snapshotId:7,snapshotAt:AT,memberCount:rows.length,guild:'OLYMPUS PRIME',realm:'Fixture Realm',scopeHash:'a'.repeat(16),nativeRankTable:{version:1,names:[...NAMES]}},rows,knights,AT,AT+60));d.scan={id:'b'.repeat(32),startedAt:AT,expiresAt:AT+600};d.pageCursor='synthetic-page0.'+'0'.repeat(64);
   d.invites=[{queueId:7,proofId:'c'.repeat(32),name:'Synthetic Knight',guid:'Player-1-0010',fullName:'Synthetic Knight',scopeHash:'a'.repeat(16),observedAt:AT,expiresAt:AT+60,reason:'knight-unguilded',source:'native-who-unit-v233'},{queueId:8,proofId:'d'.repeat(32),name:'Synthetic Whisperer',guid:'Player-1-0011',fullName:'Synthetic Whisperer',scopeHash:'a'.repeat(16),observedAt:AT,expiresAt:AT+60,reason:'knight-unguilded',source:'native-who-whisper-v242'}];return d;};
  const legacy234=()=>{const d=fixed234();d.protocol='officer-operations-v233';delete d.rankProfile;delete d.rankSchemeDigest;delete d.rankNames;for(const r of d.promotions)r.targetSlot=r.reason==='knight-veteran'?6:8;return d;};
  const CODEX234=JSON.parse(fs.readFileSync(path.join(__dirname,'evergreen1112_ui280_cursor_page.json'),'utf8'));
  const DOM_CASES=[['ready with two invites',fixed234()],['ready with a next page',Object.assign(fixed234(),{nextCursor:shaped(300)})],['held',wire(ops.projectLaunchOperations229(null,[],new Map(),AT,AT+60))],['legacy v233',legacy234()],['unknown digest',Object.assign(fixed234(),{rankSchemeDigest:'d'.repeat(64)})],
   ['Codex late-429 v234 page',CODEX234],['a qualified discovery page in the v234 form',as234(copy('qualified1000-first'))],['undeclared family',Object.assign(fixed234(),{protocol:'officer-operations-v236'})],['row with a token',(()=>{const x=fixed234();x.promotions[0].intentToken='t.'+'0'.repeat(64);return x;})()]];
  const ser=node=>node.nodeType===3?JSON.stringify(node.data):'<'+node.tagName+Object.keys(node.attributes).sort().map(k=>' '+k+'='+JSON.stringify(node.attributes[k])).join('')+(node.disabled?' :disabled':'')+(node.hidden?' :hidden':'')+(node.tagName==='TEXTAREA'?' :value='+JSON.stringify(node.value):'')+'>'+node.childNodes.map(ser).join('')+'</'+node.tagName+'>';
  let b2=AT,t2=Date.now(),serve2=null;
  const pg234=await openPage(STAFF,{},{clockNow:()=>b2*1000+(Date.now()-t2)});
  pg234.intercept(url=>url.startsWith('/api/admin/launch-operations')?new Response(JSON.stringify(serve2),{status:200}):null);
  const dom={};
  for(const [label,d] of DOM_CASES){serve2=d;b2=Number.isSafeInteger(d.fetchedAt)?d.fetchedAt:AT;t2=Date.now();await pg234.go('#/');await pg234.go('#/admin/launch-operations');await waitFor(()=>settledL(pg234),'v234 DOM case',8000);for(let i=0;i<3;i++)await settle();
   const view=pg234.app.querySelector('[data-launch234]');dom[label]={outcome:outcome(pg234),dom:view?ser(view):null};}
  const scripts=pg234.document.head.querySelectorAll('script').map(s=>s.getAttribute('src')).filter(s=>/launch/.test(s||''));
  const RECORD=path.join(__dirname,'evergreen1112_ui280_v234_dom.json');
  if(process.env.UI280_WRITE_V234_DOM){fs.writeFileSync(process.env.UI280_WRITE_V234_DOM,JSON.stringify({note:'DOM of the launch view for fixed v234 pages, recorded with the page script given in UI280_APP_JS (b631136 for the committed record). Regenerate only from the base.',app:process.env.UI280_APP_JS||'(this tree)',cases:dom},null,1)+'\n');console.log('    wrote '+process.env.UI280_WRITE_V234_DOM);}
  let record=null;try{record=JSON.parse(fs.readFileSync(RECORD,'utf8')).cases;}catch{}
  const diff=record?DOM_CASES.map(([label])=>label).filter(label=>!record[label]||record[label].outcome!==dom[label].outcome||record[label].dom!==dom[label].dom):['(no record)'];
  check('L14 a v234 page is unaffected by the v235 reader: for '+DOM_CASES.length+' fixed v234 pages (shown, held, refused) the launch view DOM equals, byte for byte, the record made with b631136\'s page script',diff.length===0&&DOM_CASES.every(([label])=>dom[label].dom!==null),JSON.stringify({diff,outcomes:Object.fromEntries(Object.entries(dom).map(([k,v])=>[k,v.outcome]))}));
  check('L15 the v235 module stays inert on v234 replies: a page that only ever sees v234 (or undeclared) replies never requests it',JSON.stringify(scripts)==='["/static/launch-operations234.js"]'&&!pg234.window.OlympusDiscovery235,JSON.stringify(scripts));
  pg234.intercept(null);
 }
 console.log('\n'+ok+'/'+n+' ui280 checks passed (launch v234, News activity, receipt-note cleanup, member picker)');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1)});`;
const mUi280=new ModuleUi280(__filename,module);mUi280.filename=__filename;mUi280.paths=module.paths;mUi280._compile(fixtureUi280.slice(0,cutsUi280[0].index).replace(APP_LINE_UI280,'const APP_JS = fs.readFileSync(process.env.UI280_APP_JS || path.join(root, "public", "static", "app.js"), "utf8");')+'\n'+runUi280,__filename);
