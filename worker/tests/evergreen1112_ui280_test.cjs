'use strict';
// Evergreen 12 Nov 2026, lane ui280, Piece 1: the launch roster view for officer-operations-v234.
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
 console.log('\n'+ok+'/'+n+' ui280 launch v234 checks passed');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1)});`;
const mUi280=new ModuleUi280(__filename,module);mUi280.filename=__filename;mUi280.paths=module.paths;mUi280._compile(fixtureUi280.slice(0,cutsUi280[0].index)+'\n'+runUi280,__filename);
