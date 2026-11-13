'use strict';
// Evergreen 12 Nov 2026, lane ui280. Piece 1 (Parts A, B): the launch roster view for officer-operations-v234.
// Piece 2 (Part C): the News activity table (/static/activity280.js) through the real News route and /api/news.
// Piece 3 (Part D): the owner's receipt-note cleanup (/static/note-redaction280.js) through the real admin route and
// the real POST /api/admin/treasury/ledger/note-redaction on synthetic receipts in the in-memory database.
// Part A runs the real view module (/static/launch-operations234.js) against pages made by the real
// producer (worker/src/launch-operations229.ts, native-rank-schemes.ts) in the repo's DOM fixture.
// Part B runs the real app.js admin route against the real Worker and SQLite (frontend_check.cjs,
// the same reuse as frontend_launch229_test.cjs), then fixed producer pages through its fetch hook.
// No provider, native or production call. Run from worker/: node tests/evergreen1112_ui280_test.cjs
const fsUi280=require('node:fs'),pathUi280=require('node:path'),{Module:ModuleUi280}=require('node:module');
const fixtureUi280=fsUi280.readFileSync(pathUi280.join(__dirname,'frontend_check.cjs'),'utf8'),cutsUi280=[...fixtureUi280.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cutsUi280.length!==1)throw Error('ui280_original_frontend_fixture_boundary');
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
 const ready=()=>{const d=wire(ops.projectLaunchOperations229({snapshotId:7,snapshotAt:at,memberCount:rows.length,guild:'OLYMPUS PRIME',realm:'Fixture Realm',scopeHash:'a'.repeat(16),nativeRankTable:{version:1,names:[...NAMES]}},rows,knights,at,at+60));d.scan={id:'b'.repeat(32),startedAt:at,expiresAt:at+600};d.pageCursor='synthetic-page0';return d;};
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
 await waitFor(()=>!!page.app.querySelector('#launch-motd229')||page.app.textContent.includes('could not be confirmed'),'real launch read settlement',8000);
 const view=()=>page.app.querySelector('[data-launch234]');
 check('B2 the real Worker page (v234, held) renders: copy-only MOTD, plain holds, rank table not confirmed, no promotion',!!page.app.querySelector('#launch-motd229')&&!!view()&&!!page.app.querySelector('[data-launch234-hold="flagship-native-scope-unconfirmed"]')&&page.app.textContent.includes('The site is not set up to read the OLYMPUS PRIME roster.')&&!!page.app.querySelector('[data-launch234-ranks="unconfirmed"]')&&!page.app.querySelector('[data-launch-promotion229]'),page.app.textContent.slice(-900));
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
  await pa.go('#/admin/settings');await waitFor(()=>!!pickerFor(pa,t=>t.endsWith(': associate Discord account')),'the appointment picker',8000);
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
  const timeOnce=f=>{const strip=f&&f.querySelector('[data-source-strip]'),m=strip&&/Counted (.+?); refreshed/.exec(strip.textContent);if(!m)return {n:-1};const caption=f.querySelector('caption');const own=f.textContent.replace(caption?caption.textContent:'\u0000','');return {n:own.split(m[1]).length-1,t:m[1]};};
  const g1=await openNews();await supplyScript(g1,ACT_SEL,installActivity);const gf1=figFrame(g1),o1=timeOnce(gf1);
  const g2=await openNews();await supplyScript(g2,ACT_SEL,installActivity,true);const gf2=figFrame(g2),o2=timeOnce(gf2);
  const sentence=f=>f?f.querySelectorAll('p.muted.small').map(p=>p.textContent).find(t=>t.includes('Joined and left compare'))||'':'';
  check('G1 with the table, the frame states the count time once outside the renderer’s caption (the source strip)',o1.n===1&&!!gf1.querySelector('caption'),JSON.stringify(o1));
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
   v2.state==='unconfirmed'&&!!v2.kept&&v2.stored!==null&&v2.buttons==='Read the stored status'&&v2.text.includes('could not be read')&&applies()===1,JSON.stringify(v2));
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
  fresh();
 } else for(const name of ['H1','H2','H3','H4','H5','H6','H7','H8','H9','H10'])check(name+' (module unavailable)',false);

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
 console.log('\n'+ok+'/'+n+' ui280 checks passed (launch v234, News activity, receipt-note cleanup, member picker)');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1)});`;
const mUi280=new ModuleUi280(__filename,module);mUi280.filename=__filename;mUi280.paths=module.paths;mUi280._compile(fixtureUi280.slice(0,cutsUi280[0].index)+'\n'+runUi280,__filename);
