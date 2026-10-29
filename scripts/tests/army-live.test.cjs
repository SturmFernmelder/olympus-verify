#!/usr/bin/env node
'use strict';
// Synthetic browser contracts: current reader/reporter plus retained historical OLCS2 collector leaves. The collector is not loaded or admitted by shipping HTML.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),assets=path.join(root,'worker/public/static/army-live'),{build}=require('../build-army-live.cjs');
const NOW=1792530000,fixture=()=>({format:'olympus-stat-observation-v2',scope:'own-guild',source:'volunteer-client',sourceVerified:false,membershipProof:false,addonVersion:'0.2.0',realmGroup:'World of Warcraft: Forever PvE',faction:'Alliance',observedAt:NOW,guilds:[{name:'Olympus I',receivedAt:NOW,reportedCharacters:90,online:20,classes:[10,10,10,10,10,10,10,10,10],levels:[10,10,10,10,10,10,30],ranks:[0,10,10,10,10,10,10,10,10,10]}]});
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.dataset={};this.className='';this._text='';this.width=this.height=0;this.classList={toggle(){},add:(name)=>{this.className=(this.className+' '+name).trim();}};}
 set textContent(v){this._text=String(v??'');this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 set innerHTML(_){throw Error('HTML injection is forbidden');}append(...items){for(const item of items)this.children.push(item);}appendChild(item){this.append(item);return item;}replaceChildren(...items){this._text='';this.children=[...items];}setAttribute(k,v){this.attributes[k]=String(v);}addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(value=>value!==fn);}async click(){await Promise.all((this.listeners.click||[]).map(fn=>fn({target:this})));}focus(){}select(){}pause(){}getContext(){return{clearRect(){},drawImage(){},getImageData(){throw Error('No real pixels in synthetic contract test');}};}
}
const reportIds=['report-status','report-preview','report-clear','report-preview-results','report-consent-area','report-consent','report-publish','report-outcome'];
const captureIds=['start','stop','copy','addon-command','frames','review-frames','images','share-window','use-camera','media-area','video','status-dot','status','progress','countdown','error','empty-preview','review','clear-review','guild-name','guild-scope','member-count','online-count','source-time','received-time','freshness','review-expiry','input-paste','input-image','input-window','input-camera'];
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};
function harness(options={}){
 const ids=new Map(),events={},windowEvents={},calls=[],sources=['paste','image','window','camera'].map(name=>{const n=new Element('button');n.dataset.source=name;return n;}),timers=new Map();let serial=0,wall=NOW*1000,mono=1000;
 for(const id of options.mount?[]:options.public?['army-results','army-status','army-refresh','army-read-time']:[...reportIds,...captureIds])ids.set(id,new Element(id==='video'?'video':'div'));
 const document={hidden:false,getElementById:id=>ids.get(id)||null,querySelector:selector=>selector.startsWith('#')?ids.get(selector.slice(1))||null:null,createElement:tag=>new Element(tag),querySelectorAll:selector=>selector==='[data-source]'?sources:[],addEventListener(k,fn){(events[k]??=[]).push(fn);},removeEventListener(k,fn){events[k]=(events[k]||[]).filter(value=>value!==fn);}};
 const scope={document,console,TextEncoder,TextDecoder,Uint8Array,Uint8ClampedArray,ArrayBuffer,AbortController,btoa,atob,crypto:webcrypto,performance:{now:()=>mono},isSecureContext:true,Date:class extends Date{static now(){return wall;}},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms,due:mono+ms,interval:false});return id;},clearTimeout:id=>timers.delete(id),setInterval(fn,ms){const id=++serial;timers.set(id,{fn,ms,due:mono+ms,interval:true});return id;},clearInterval:id=>timers.delete(id),addEventListener(k,fn){(windowEvents[k]??=[]).push(fn);},removeEventListener(k,fn){windowEvents[k]=(windowEvents[k]||[]).filter(value=>value!==fn);},navigator:{clipboard:{writeText:async()=>{}},mediaDevices:options.mediaDevices||{}},Worker:class{constructor(){throw Error('Synthetic paste test must not start a worker');}},fetch:async(url,init={})=>{
   const body=init.body===undefined?undefined:JSON.parse(init.body);calls.push({url,init,body});
   if(options.transport)return options.transport(url,init,body,calls);
   if(url==='/api/army')return new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:options.snapshots??[]}));
   if(url==='/api/army/reporter')return options.refused?new Response('{}',{status:403}):new Response(JSON.stringify({format:'olympus-army-reporter-v1',canPublish:true,sanitizedExporterAvailable:options.exporterAvailable!==false,now:NOW}));
   if(url==='/api/army/preview')return new Response(JSON.stringify({format:'olympus-army-preview-v1',snapshot:body.snapshot,previewToken:'synthetic-token',expiresAt:NOW+600,now:NOW,persisted:false}));
   if(url==='/api/army/publish'){if(options.lost)throw Error('Synthetic lost answer');return new Response(JSON.stringify({state:'published',snapshot:body.snapshot}));}
   if(url==='/api/army/outcome')return new Response(JSON.stringify({state:options.outcome||'published'}));
   throw Error('Unexpected API path');
 }};
 scope.window=scope;vm.createContext(scope);
 for(const name of ['protocol.js','sanitized-export.js','army.js',...(options.public||options.mount?[]:['report.js','pilot.js'])]){vm.runInContext(fs.readFileSync(path.join(assets,name),'utf8'),scope,{filename:name,timeout:1000});if(name==='report.js')scope.OlympusArmyReport=scope.OlympusArmyReportTool.mount(document,{owner:document,capture:()=>scope.OlympusArmyCapture});}
 return{ids,scope,calls,sources,async hide(){document.hidden=true;for(const fn of events.visibilitychange||[])fn();await settle();},async show(){document.hidden=false;for(const fn of events.visibilitychange||[])fn();await settle();},async pagehide(persisted=false){for(const fn of windowEvents.pagehide||[])fn({persisted});await settle();},async pageshow(persisted=false){for(const fn of windowEvents.pageshow||[])fn({persisted});await settle();},async advance(ms){wall+=ms;mono+=ms;for(const timer of [...timers.values()])if(timer.interval)timer.fn();await settle();},async tick(ms){
   wall+=ms;mono+=ms;
   // Deliver only timers due at this synthetic event-loop turn; newly scheduled timers start from this turn.
   for(const[id,timer]of [...timers.entries()].filter(([,value])=>value.due<=mono).sort((a,b)=>a[1].due-b[1].due)){
     if(!timers.has(id))continue;if(timer.interval)timer.due=mono+timer.ms;else timers.delete(id);timer.fn();await settle();
   }
   await settle();
 },async scan(snapshot=fixture()){
   await ids.get('start').click();const command=ids.get('addon-command').value;assert.match(command,/^\/ogarmy [a-f0-9]{32}$/);const nonce=command.split(' ')[1];const frames=await scope.OlympusGuildQRProtocol.encodeFrames(snapshot,nonce,{nowSeconds:Math.floor(wall/1000)});ids.get('frames').value=frames.join('\n');await ids.get('review-frames').click();await settle();return frames;
 }};
}
let passed=0,failed=0;async function check(label,fn){try{await fn();passed++;console.log('PASS '+label);}catch(e){failed++;console.error('FAIL '+label+': '+e.stack);}}
(async()=>{
 await check('exact reviewed capture/protocol/decoder projections match current assets',()=>assert.equal(build(root),3));
 await check('actual Army pages reuse Olympus chrome, crest, main navigation and generic social metadata',async()=>{
   const pages=require(path.join(root,'worker/tests/helpers/privacy129_fixture.cjs')).load('army-pages');
   for(const [render,publisher]of [[pages.publicArmyPage,false],[pages.armyReporterPage,true]]){
     const response=render(new Request('https://olympus.invalid/army'+(publisher?'/report':''))),html=await response.text();
     for(const resource of ['/static/app.css','/static/wow-cursor.css','/static/army-live/army.css','/static/wow/friz-quadrata.woff2','/static/wow/morpheus.woff2'])assert.ok(html.includes('href="'+resource+'"'));
     assert.equal((html.match(/src="\/static\/olympus-icon\.png"/g)||[]).length,2);assert.ok(html.includes('<link rel="icon" href="/static/olympus-icon.png" type="image/png">'));assert.doesNotMatch(html,/<img[^>]+src="\/static\/wow\/icon-shield\.png"/);
     assert.ok(html.includes('class="topbar"'));assert.ok(html.includes('class="topbar-in"'));assert.ok(html.includes('class="nav army-main-nav"'));
     for(const href of ['/#/','/#/apply','/#/vote','/#/organization','/#/community','/#/guides'])assert.ok(html.includes('href="'+href+'"'));
     assert.ok(html.includes('href="/#/community" aria-current="page">Community</a>'));assert.ok(html.includes('href="'+(publisher?'/army/report':'/#/community/army')+'" aria-current="page">'+(publisher?'Reporter workspace':'Snapshots')+'</a>'));assert.ok(!html.includes('href="/army" aria-current="page">Army</a>'));
     assert.ok(html.includes('property="og:image" content="https://olympus.roachcouncil.com/static/olympus-icon.png"'));assert.ok(html.includes('property="og:url" content="https://olympus.roachcouncil.com/"'));
     assert.doesNotMatch(html,/class="footer-links"|href="\/(?:privacy|terms|legal\/(?:privacy|terms))"/);assert.ok(html.includes('<details class="nav-group" name="olympus-sections">'));assert.ok(html.includes('>Guild</summary>'));assert.ok(html.includes('>Resources</summary>'));assert.equal(html.includes('>Staff</summary>'),publisher);assert.match(html,/signed-in Olympus readers/);assert.doesNotMatch(html,/Everyone can read|No account is required|public Army page|publish it publicly|Publish snapshot publicly/);
   }
 });
 await check('actual reporter replaces the standalone scanner with a dedicated local importer and strict no-capture policies',async()=>{
   const pages=require(path.join(root,'worker/tests/helpers/privacy129_fixture.cjs')).load('army-pages'),request=new Request('https://olympus.invalid/army/report'),response=pages.armyReporterPage(request),html=await response.text();
   for(const id of [...reportIds,'aggregate-file','aggregate-drop','aggregate-status','aggregate-review','aggregate-clear'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
   for(const id of captureIds)assert.ok(!html.includes('id="'+id+'"'),id+' is a retired capture control');
   assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match=>match[1]),['/static/army-live/protocol.js','/static/army-live/sanitized-export.js','/static/army-live/army.js','/static/army-live/report.js','/static/army-live/savedvariables-import.js']);
   assert.doesNotMatch(html,/<script[^>]+src="\/static\/app\.js|id="boot"|\s(?:onclick|onload|style)=/i);assert.match(html,/Publisher adoption required/);assert.match(html,/curseforge\.com\/wow\/addons\/olympus-guild/);assert.match(html,/OlympusSiteAggregate\.lua/);assert.doesNotMatch(html,/olympus-army-addon-0\.2\.0\.zip|Download the Olympus Army|\/ogarmy/);assert.match(html,/id="report-preview"[^>]* disabled/);assert.match(html,/id="report-publish"[^>]* disabled/);assert.doesNotMatch(html,/id="report-consent"[^>]* checked/);
   assert.equal(response.headers.get('Permissions-Policy'),'camera=(), display-capture=(), microphone=(), geolocation=(), payment=(), usb=()');assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'");
   const reader=pages.publicArmyPage(new Request('https://olympus.invalid/army'));assert.equal(reader.headers.get('Permissions-Policy'),'camera=(), display-capture=(), microphone=(), geolocation=(), payment=(), usb=()');assert.ok(!reader.headers.get('Content-Security-Policy').includes('blob:'));assert.equal(await pages.armyReporterPage(new Request(request,{method:'HEAD'})).text(),'');assert.equal(await pages.publicArmyPage(new Request('https://olympus.invalid/army',{method:'HEAD'})).text(),'');
 });
 await check('signed-in reader empty state uses only the aggregate endpoint with same-origin credentials',async()=>{const h=harness({public:true});await settle();assert.match(h.ids.get('army-results').textContent,/No published snapshots yet/);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/army');assert.equal(h.calls[0].init.credentials,'same-origin');});
 await check('expired or refused Army reader clears earlier figures without automatic retries or private API reads',async()=>{
   for(const status of [401,403]){
     let count=0;const h=harness({public:true,transport:async url=>{assert.equal(url,'/api/army');return ++count===1?new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]})):new Response('{}',{status});}});await settle();assert.equal(h.ids.get('army-results').children.length,1);await h.ids.get('army-refresh').click();assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/could not be read/);await h.hide();await h.show();assert.equal(h.calls.length,2);assert.ok(h.calls.every(call=>call.url==='/api/army'&&call.init.credentials==='same-origin'));
   }
 });
 await check('read-only Army mount uses the original aggregate endpoint without document navigation or collector assets',async()=>{
   const h=harness({mount:true,snapshots:[fixture()]});await settle();assert.equal(h.calls.length,0);const container=new Element(),controller=h.scope.OlympusArmyReader.mount(container,{isCurrent:()=>true});await settle();
   assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/army');assert.equal(h.calls[0].init.method,undefined);assert.equal(h.calls[0].init.credentials,'same-origin');assert.match(container.textContent,/Olympus I/);assert.ok(container.className.includes('army-reader'));assert.equal(h.scope.OlympusArmyCapture,undefined);assert.equal(h.scope.OlympusArmyReport,undefined);
   await container.children[0].children[0].click();assert.equal(h.calls.length,2);controller.destroy();assert.equal(container.children[2].children.length,0);await h.hide();await h.show();await container.children[0].children[0].click();assert.equal(h.calls.length,2);
 });
 await check('Army route disposal aborts its original pending read and prevents late results or replacement requests',async()=>{
   let answer;const h=harness({mount:true,transport:()=>new Promise(resolve=>{answer=resolve;})});const container=new Element(),controller=h.scope.OlympusArmyReader.mount(container,{isCurrent:()=>true});await settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].init.signal.aborted,false);
   controller.destroy();controller.destroy();assert.equal(h.calls[0].init.signal.aborted,true);answer(new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]})));await settle();assert.equal(container.children[2].children.length,0);assert.ok(!container.textContent.includes('Olympus I'));await h.advance(1000);await h.hide();await h.show();assert.equal(h.calls.length,1);
 });
 await check('a changed original SPA context cannot paint a completed Army response even before explicit disposal',async()=>{
   let answer,current=true;const h=harness({mount:true,transport:()=>new Promise(resolve=>{answer=resolve;})});const container=new Element(),controller=h.scope.OlympusArmyReader.mount(container,{isCurrent:()=>current});await settle();current=false;answer(new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]})));await settle();assert.equal(container.children[2].children.length,0);assert.ok(!container.textContent.includes('Olympus I'));assert.equal(h.calls.length,1);controller.destroy();
 });
 await check('public cards show fixed-order breakdowns, unsigned labels and character scope',async()=>{const h=harness({public:true,snapshots:[fixture()]});await settle();const text=h.ids.get('army-results').textContent;for(const label of ['Olympus I','Warrior','Levels 50–59','Rank position 9','Characters, not unique people','Unverified community observation'])assert.ok(text.includes(label));assert.equal(h.calls.length,1);});
 await check('simultaneous Olympus and Olympus I snapshots retain distinct exact names and own figures',async()=>{
   const primary=fixture();primary.guilds[0]={...primary.guilds[0],name:'Olympus',reportedCharacters:100,classes:[10,10,10,10,10,10,10,10,20],levels:[10,10,10,10,10,10,40],ranks:[10,10,10,10,10,10,10,10,10,10]};
   const h=harness({public:true,snapshots:[primary,fixture()]});await settle();const cards=h.ids.get('army-results').children;assert.equal(cards.length,2);
   assert.deepEqual(cards.map(card=>card.children.find(child=>child.tagName==='H2').textContent),['Olympus','Olympus I']);
   assert.equal(cards[0].children.find(child=>child.className==='figures').children[0].children[1].textContent,'100');
   assert.equal(cards[1].children.find(child=>child.className==='figures').children[0].children[1].textContent,'90');assert.equal(h.calls.length,1);
 });
 await check('masked distributions and online values remain withheld instead of inferred',async()=>{const value=fixture();value.guilds[0].classes=null;value.guilds[0].levels=null;value.guilds[0].ranks=null;value.guilds[0].online=null;const h=harness({public:true,snapshots:[value]});await settle();assert.match(h.ids.get('army-results').textContent,/Withheld/);assert.match(h.ids.get('army-results').textContent,/Unavailable/);});
 await check('public response rejects duplicate guild rows and clears partial figures',async()=>{const h=harness({public:true,snapshots:[fixture(),fixture()]});await settle();assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/could not be read/);});
 await check('unexpected personal or HTML guild labels are refused before public rendering',async()=>{const value=fixture();value.guilds[0].name='<img src=x onerror=alert(1)>';const h=harness({public:true,snapshots:[value]});await settle();assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/could not be read/);});
 await check('signed-in reader clears on hiding, stays idle while hidden and resumes with a fresh read',async()=>{const h=harness({public:true,snapshots:[fixture()]});await settle();await h.hide();assert.equal(h.ids.get('army-results').children.length,0);assert.equal(h.calls.length,1);await h.tick(180000);assert.equal(h.calls.length,1);await h.show();assert.equal(h.calls.length,2);assert.match(h.ids.get('army-results').textContent,/Olympus I/);await h.ids.get('army-refresh').click();assert.equal(h.calls.length,3);});
 await check('visible reader checks only published aggregate GETs after each full60-second interval',async()=>{
   let count=0;const h=harness({public:true,transport:async()=>{const snapshot=fixture();if(++count>1)snapshot.guilds[0].online=25;return new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW+count,snapshots:[snapshot]}));}});await settle();assert.equal(h.calls.length,1);await h.tick(59999);assert.equal(h.calls.length,1);await h.tick(1);assert.equal(h.calls.length,2);assert.match(h.ids.get('army-status').textContent,/every 60 seconds while visible/);assert.equal(h.ids.get('army-results').children[0].children.find(child=>child.className==='figures').children[1].children[1].textContent,'25');
   await h.tick(59999);assert.equal(h.calls.length,2);await h.tick(1);assert.equal(h.calls.length,3);for(const call of h.calls){assert.equal(call.url,'/api/army');assert.equal(call.init.method,undefined);assert.equal(call.init.body,undefined);assert.equal(call.init.cache,'no-store');assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.redirect,'error');}
 });
 await check('deliberate reader refresh resets the next60-second check instead of leaving a duplicate timer',async()=>{
   const h=harness({public:true,snapshots:[fixture()]});await settle();await h.tick(30000);await h.ids.get('army-refresh').click();assert.equal(h.calls.length,2);await h.tick(59999);assert.equal(h.calls.length,2);await h.tick(1);assert.equal(h.calls.length,3);
 });
 await check('pending reads cannot overlap through timer or repeated refresh and still enforce15-second abort',async()=>{
   let answer;const h=harness({public:true,transport:()=>new Promise(resolve=>{answer=resolve;})});await settle();const signal=h.calls[0].init.signal;await h.ids.get('army-refresh').click();await h.tick(14999);await h.ids.get('army-refresh').click();assert.equal(h.calls.length,1);assert.equal(signal.aborted,false);await h.tick(1);assert.equal(signal.aborted,true);await h.tick(60000);assert.equal(h.calls.length,1);answer(new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]})));await settle();assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/could not be read/);assert.equal(h.calls.length,1);
 });
 await check('transient reader failure clears figures honestly and retries only at the next visible60-second check',async()=>{
   let count=0;const h=harness({public:true,transport:async()=>++count===2?new Response('{}',{status:503}):new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]}))});await settle();assert.match(h.ids.get('army-results').textContent,/Olympus I/);await h.tick(60000);assert.equal(h.calls.length,2);assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/No stale or partial figures/);await h.tick(59999);assert.equal(h.calls.length,2);await h.tick(1);assert.equal(h.calls.length,3);assert.match(h.ids.get('army-results').textContent,/Olympus I/);
 });
 await check('automatic401or403 refusal stops all future reads until an explicit refresh rechecks access',async()=>{
   for(const status of[401,403]){let count=0;const h=harness({public:true,transport:async()=>++count===2?new Response('{}',{status}):new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]}))});await settle();await h.tick(60000);assert.equal(h.calls.length,2);assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/Automatic refresh is stopped/);await h.tick(180000);await h.hide();await h.show();assert.equal(h.calls.length,2);await h.ids.get('army-refresh').click();assert.equal(h.calls.length,3);assert.match(h.ids.get('army-results').textContent,/Olympus I/);await h.tick(60000);assert.equal(h.calls.length,4);}
 });
 await check('pre-hide late refusal cannot clear or stop a newer visible reader generation',async()=>{
   let answer;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?new Promise(resolve=>{answer=resolve;}):new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]}))});await settle();const originalSignal=h.calls[0].init.signal;await h.hide();assert.equal(originalSignal.aborted,true);await h.show();assert.equal(h.calls.length,2);answer(new Response('{}',{status:401}));await settle();assert.match(h.ids.get('army-results').textContent,/Olympus I/);await h.tick(60000);assert.equal(h.calls.length,3);assert.match(h.ids.get('army-results').textContent,/Olympus I/);
 });
 await check('active reader disposal cancels scheduled refresh and an unmounted context clears without replacement reads',async()=>{
   let current=true;const h=harness({mount:true,snapshots:[fixture()]}),container=new Element(),controller=h.scope.OlympusArmyReader.mount(container,{isCurrent:()=>current});await settle();current=false;await h.tick(1000);assert.equal(container.children[2].children.length,0);await h.tick(180000);await h.hide();await h.show();await container.children[0].children[0].click();assert.equal(h.calls.length,1);controller.destroy();
 });
 await check('pagehide suspends reader timers even if visibility changes before a persisted restoration',async()=>{
   const h=harness({public:true,snapshots:[fixture()]});await settle();await h.pagehide();assert.equal(h.ids.get('army-results').children.length,0);await h.tick(180000);await h.hide();await h.show();await h.ids.get('army-refresh').click();assert.equal(h.calls.length,1);
 });
 await check('persisted page restoration clears prior data and performs one fresh read without a late pre-hide refusal',async()=>{
   let answer;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?new Promise(resolve=>{answer=resolve;}):new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]}))});await settle();await h.pagehide(true);assert.equal(h.calls[0].init.signal.aborted,true);await h.tick(180000);assert.equal(h.calls.length,1);await h.pageshow(true);assert.equal(h.calls.length,2);answer(new Response('{}',{status:403}));await settle();assert.match(h.ids.get('army-results').textContent,/Olympus I/);await h.tick(60000);assert.equal(h.calls.length,3);
 });
 await check('persisted restoration cannot resume an access-refused reader or explicitly destroyed route',async()=>{
   const refused=harness({public:true,transport:async()=>new Response('{}',{status:401})});await settle();await refused.pagehide(true);await refused.pageshow(true);await refused.tick(180000);assert.equal(refused.calls.length,1);assert.equal(refused.ids.get('army-results').children.length,0);await refused.ids.get('army-refresh').click();assert.equal(refused.calls.length,2);
   const h=harness({mount:true,snapshots:[fixture()]}),container=new Element(),controller=h.scope.OlympusArmyReader.mount(container,{isCurrent:()=>true});await settle();await h.pagehide(true);controller.destroy();await h.pageshow(true);await h.tick(180000);assert.equal(h.calls.length,1);assert.equal(container.children[2].children.length,0);
 });
 await check('successful refresh restores only previously expanded breakdowns for the same exact guild',async()=>{
   // .186: an unchanged timer answer now keeps the card nodes (checked below), so this replacement carries one changed figure.
   let count=0;const h=harness({public:true,transport:async()=>{const snapshot=fixture();if(++count>1)snapshot.guilds[0].online=25;return new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[snapshot]}));}});await settle();const first=h.ids.get('army-results').children[0],breakdowns=first.children.filter(child=>child.tagName==='DETAILS');breakdowns[0].open=true;breakdowns[2].open=true;await h.tick(60000);const next=h.ids.get('army-results').children[0];assert.notEqual(first,next);assert.deepEqual(next.children.filter(child=>child.tagName==='DETAILS').map(child=>Boolean(child.open)),[true,false,true]);assert.equal(h.calls.length,2);
 });
 await check('automatic refresh preserves exact response byte cap and rejects partial replacement data',async()=>{
   let count=0;const h=harness({public:true,transport:async()=>++count===1?new Response(JSON.stringify({format:'olympus-army-public-v1',now:NOW,snapshots:[fixture()]})):new Response(' '.repeat(524289))});await settle();await h.tick(60000);assert.equal(h.calls.length,2);assert.equal(h.ids.get('army-results').children.length,0);assert.match(h.ids.get('army-status').textContent,/could not be read/);
 });
 // .186: timer reads are quiet. Cards, live status, read time and Refresh stay until a validated answer replaces the cards at once.
 const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
 const armyResponse=(now,snapshots)=>new Response(JSON.stringify({format:'olympus-army-public-v1',now,snapshots}));
 const textWrites=el=>{const log=[],own=Object.getOwnPropertyDescriptor(Element.prototype,'textContent');Object.defineProperty(el,'textContent',{configurable:true,get(){return own.get.call(this);},set(value){log.push(String(value));own.set.call(this,value);}});return log;};
 const mutations=el=>{const log=[],replace=el.replaceChildren.bind(el),append=el.append.bind(el);el.replaceChildren=(...items)=>{replace(...items);log.push(['replace',items.length,el.children.length]);};el.append=(...items)=>{append(...items);log.push(['append',items.length,el.children.length]);};return log;};
 await check('.186 a pending timer read keeps the cards, live status, read time and Refresh exactly as they were',async()=>{
   let pending;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):(pending=deferred()).promise});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),refresh=h.ids.get('army-refresh'),first=root.children[0],before={text:status.textContent,className:status.className,stamp:stamp.textContent},writes=textWrites(status),stamps=textWrites(stamp),changes=mutations(root);
   assert.match(before.stamp,/^Read at .+\.$/);assert.equal(before.text,'Published observations. Checks for newer reports every 60 seconds while visible.');
   await h.tick(60000);assert.equal(h.calls.length,2);assert.ok(pending);
   for(const wait of [0,14000]){await h.tick(wait);assert.equal(root.children.length,1);assert.equal(root.children[0],first);assert.deepEqual(changes,[]);assert.equal(status.textContent,before.text);assert.equal(status.className,before.className);assert.deepEqual(writes,[]);assert.equal(stamp.textContent,before.stamp);assert.deepEqual(stamps,[]);assert.equal(refresh.disabled,false);}
   pending.resolve(armyResponse(NOW+60,[fixture()]));await settle();assert.equal(root.children.length,1);assert.equal(h.calls.length,2);
 });
 await check('.186 a successful timer read swaps every card in one step and announces the changed published set once',async()=>{
   let pending;const primary=fixture();primary.guilds[0]={...primary.guilds[0],name:'Olympus'};const changed=fixture();changed.guilds[0].online=25;
   const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[primary,fixture()]):(pending=deferred()).promise});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),old=[...root.children],oldStamp=stamp.textContent,writes=textWrites(status),changes=mutations(root);
   await h.tick(60000);assert.equal(h.calls.length,2);assert.deepEqual(root.children,old);
   pending.resolve(armyResponse(NOW+120,[primary,changed]));await settle();
   assert.deepEqual(changes,[['replace',2,2]]);assert.equal(root.children.length,2);assert.ok(root.children.every(card=>!old.includes(card)));
   assert.deepEqual(root.children.map(card=>card.children.find(child=>child.tagName==='H2').textContent),['Olympus','Olympus I']);assert.equal(root.children[1].children.find(child=>child.className==='figures').children[1].children[1].textContent,'25');
   assert.equal(writes.length,1);assert.match(writes[0],/^Published observations changed at .+\. Checks for newer reports every 60 seconds while visible\.$/);assert.equal(status.className,'notice');
   assert.match(stamp.textContent,/^Read at .+\.$/);assert.notEqual(stamp.textContent,oldStamp);assert.equal(h.ids.get('army-refresh').disabled,false);
 });
 await check('.186 an unchanged timer read keeps every card node and the live status and rewrites only the read time',async()=>{
   let count=0;const h=harness({public:true,transport:async()=>armyResponse(NOW+60*count++,[fixture()])});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),first=root.children[0],text=first.textContent,before={text:status.textContent,className:status.className,stamp:stamp.textContent},writes=textWrites(status),stamps=textWrites(stamp),changes=mutations(root);
   await h.tick(60000);assert.equal(h.calls.length,2);assert.equal(root.children.length,1);assert.equal(root.children[0],first);assert.equal(first.textContent,text);assert.deepEqual(changes,[]);
   assert.deepEqual(writes,[]);assert.equal(status.textContent,before.text);assert.equal(status.className,before.className);
   assert.equal(stamps.length,1);assert.match(stamps[0],/^Read at .+\.$/);assert.notEqual(stamps[0],before.stamp);
   await h.tick(60000);assert.equal(h.calls.length,3);assert.deepEqual(writes,[]);assert.equal(stamps.length,2);assert.deepEqual(changes,[]);assert.equal(root.children[0],first);
 });
 await check('.186 a failed timer read still clears figures and read time, and the next timer success replaces the error once',async()=>{
   let pending;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):calls.length===2?(pending=deferred()).promise:armyResponse(NOW+120,[fixture()])});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),first=root.children[0];
   await h.tick(60000);assert.equal(root.children[0],first);assert.match(stamp.textContent,/^Read at /);
   pending.resolve(new Response('{}',{status:503}));await settle();
   assert.equal(root.children.length,0);assert.equal(stamp.textContent,'');assert.match(status.textContent,/No stale or partial figures are shown/);assert.equal(status.className,'notice error');assert.equal(h.ids.get('army-refresh').disabled,false);
   const writes=textWrites(status);await h.tick(60000);assert.equal(h.calls.length,3);assert.match(root.children[0].textContent,/Olympus I/);assert.deepEqual(writes,['Published observations. Checks for newer reports every 60 seconds while visible.']);assert.equal(status.className,'notice');assert.match(stamp.textContent,/^Read at /);
 });
 await check('.186 a timer read that exceeds its 15-second deadline still clears instead of keeping old figures',async()=>{
   let pending;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):(pending=deferred()).promise});await settle();
   const root=h.ids.get('army-results');await h.tick(60000);const signal=h.calls[1].init.signal;await h.tick(14999);assert.equal(signal.aborted,false);assert.equal(root.children.length,1);await h.tick(1);assert.equal(signal.aborted,true);
   pending.resolve(armyResponse(NOW+60,[fixture()]));await settle();assert.equal(root.children.length,0);assert.equal(h.ids.get('army-read-time').textContent,'');assert.match(h.ids.get('army-status').textContent,/could not be read/);
 });
 await check('.186 deliberate Refresh keeps its visible reading state and restores open breakdowns',async()=>{
   let pending;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):(pending=deferred()).promise});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),refresh=h.ids.get('army-refresh'),first=root.children[0];first.children.filter(child=>child.tagName==='DETAILS')[1].open=true;
   const clicked=refresh.click();await settle();
   assert.equal(h.calls.length,2);assert.equal(root.children.length,0);assert.equal(status.textContent,'Reading published snapshots…');assert.equal(status.className,'notice');assert.equal(refresh.disabled,true);assert.equal(stamp.textContent,'');
   pending.resolve(armyResponse(NOW+60,[fixture()]));await clicked;await settle();
   assert.equal(root.children.length,1);assert.notEqual(root.children[0],first);assert.deepEqual(root.children[0].children.filter(child=>child.tagName==='DETAILS').map(child=>Boolean(child.open)),[false,true,false]);
   assert.equal(status.textContent,'Published observations. Checks for newer reports every 60 seconds while visible.');assert.equal(refresh.disabled,false);assert.match(stamp.textContent,/^Read at .+\.$/);
 });
 await check('.186 a focused breakdown summary keeps keyboard focus across a quiet replacement',async()=>{
   let count=0;const h=harness({public:true,transport:async()=>{const snapshot=fixture();if(++count>1)snapshot.guilds[0].online=25;return armyResponse(NOW,[snapshot]);}});await settle();const original=Element.prototype.focus;let focused=null,options;
   Element.prototype.focus=function(value){focused=this;options=value;h.scope.document.activeElement=this;};
   try{const root=h.ids.get('army-results'),old=root.children[0].children.filter(child=>child.tagName==='DETAILS')[1];old.open=true;h.scope.document.activeElement=old.children[0];
     await h.tick(60000);assert.equal(h.calls.length,2);const next=root.children[0].children.filter(child=>child.tagName==='DETAILS')[1];assert.notEqual(next,old);assert.equal(next.open,true);assert.equal(focused,next.children[0]);assert.equal(options.preventScroll,true);}
   finally{Element.prototype.focus=original;}
 });
 await check('.186 unchanged minutes leave a focused, expanded breakdown alone: no swap and no programmatic focus',async()=>{
   let count=0;const h=harness({public:true,transport:async()=>armyResponse(NOW+60*count++,[fixture()])});await settle();const original=Element.prototype.focus,focusCalls=[];
   Element.prototype.focus=function(value){focusCalls.push([this,value]);h.scope.document.activeElement=this;};
   try{const root=h.ids.get('army-results'),first=root.children[0],breakdown=first.children.filter(child=>child.tagName==='DETAILS')[2];breakdown.open=true;h.scope.document.activeElement=breakdown.children[0];const changes=mutations(root);
     for(let minute=1;minute<=5;minute++){await h.tick(60000);assert.equal(h.calls.length,1+minute);}
     assert.deepEqual(changes,[]);assert.deepEqual(focusCalls,[]);assert.equal(root.children[0],first);assert.equal(breakdown.open,true);assert.equal(h.scope.document.activeElement,breakdown.children[0]);}
   finally{Element.prototype.focus=original;}
 });
 await check('.186 an online count the page already withdrew is no change when the server withholds it too: no swap and no announcement',async()=>{
   const aged=online=>{const snapshot=fixture();snapshot.observedAt=NOW-850;snapshot.guilds[0].receivedAt=NOW-850;snapshot.guilds[0].online=online;return snapshot;};
   const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[aged(20)]):armyResponse(NOW+60*(calls.length-1),[aged(null)])});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),figure=()=>root.children[0].children.find(child=>child.className==='figures').children[1].children[1].textContent;
   assert.equal(figure(),'20');const writes=textWrites(status),stamps=textWrites(stamp),changes=mutations(root);
   await h.advance(51000);assert.equal(h.calls.length,1);assert.equal(figure(),'Unavailable');assert.match(root.textContent,/Online count no longer current/);assert.deepEqual(changes,[['replace',1,1]]);assert.deepEqual(writes,[]);
   const shown=root.children[0];
   await h.tick(9000);assert.equal(h.calls.length,2);assert.equal(root.children[0],shown);assert.deepEqual(changes,[['replace',1,1]]);assert.deepEqual(writes,[]);assert.equal(stamps.length,1);
   await h.tick(60000);assert.equal(h.calls.length,3);assert.equal(root.children[0],shown);assert.deepEqual(changes,[['replace',1,1]]);assert.deepEqual(writes,[]);assert.equal(stamps.length,2);
 });
 await check('.186 a slow timer answer from just before the 900-second mark cannot bring back an online count the page already withdrew',async()=>{
   const aged=()=>{const snapshot=fixture();snapshot.observedAt=NOW-840;snapshot.guilds[0].receivedAt=NOW-840;return snapshot;};let pending;
   const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[aged()]):(pending=deferred()).promise});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),stamp=h.ids.get('army-read-time'),figure=()=>root.children[0].children.find(child=>child.className==='figures').children[1].children[1].textContent;
   const writes=textWrites(status),changes=mutations(root);
   await h.tick(60000);assert.equal(h.calls.length,2);assert.ok(pending);assert.equal(figure(),'20');assert.deepEqual(changes,[]);
   await h.advance(1000);assert.equal(figure(),'Unavailable');assert.deepEqual(changes,[['replace',1,1]]);const shown=root.children[0];
   // The server read at an age of exactly 900 s, so its answer still carries the count; the page's clock is already at 901 s.
   pending.resolve(armyResponse(NOW+60,[aged()]));await settle();
   assert.equal(root.children[0],shown);assert.equal(figure(),'Unavailable');assert.deepEqual(changes,[['replace',1,1]]);assert.deepEqual(writes,[]);assert.match(stamp.textContent,/^Read at .+\.$/);
   await h.advance(1000);assert.equal(root.children[0],shown);assert.equal(figure(),'Unavailable');assert.deepEqual(changes,[['replace',1,1]]);assert.deepEqual(writes,[]);
 });
 await check('.186 Refresh during a pending timer read takes it over and starts a visible read at once',async()=>{
   const pending=[];const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):(pending[calls.length-2]=deferred()).promise});await settle();
   const root=h.ids.get('army-results'),status=h.ids.get('army-status'),refresh=h.ids.get('army-refresh'),changed=fixture();changed.guilds[0].online=25;
   await h.tick(60000);assert.equal(h.calls.length,2);assert.equal(refresh.disabled,false);const quietSignal=h.calls[1].init.signal;
   const clicked=refresh.click();await settle();
   assert.equal(quietSignal.aborted,true);assert.equal(h.calls.length,3);assert.equal(h.calls[2].init.signal.aborted,false);assert.equal(status.textContent,'Reading published snapshots…');assert.equal(root.children.length,0);assert.equal(refresh.disabled,true);
   pending[0].resolve(armyResponse(NOW+60,[changed]));await settle();assert.equal(root.children.length,0);assert.equal(status.textContent,'Reading published snapshots…');
   pending[1].resolve(armyResponse(NOW+61,[fixture()]));await clicked;await settle();
   assert.equal(root.children.length,1);assert.equal(root.children[0].children.find(child=>child.className==='figures').children[1].children[1].textContent,'20');assert.equal(status.textContent,'Published observations. Checks for newer reports every 60 seconds while visible.');assert.equal(refresh.disabled,false);
   await h.tick(59999);assert.equal(h.calls.length,3);await h.tick(1);assert.equal(h.calls.length,4);
 });
 await check('.186 a sustained outage states its failure once instead of rewriting the polite region on every attempt',async()=>{
   let pending;const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):calls.length<=4?new Response('{}',{status:503}):(pending=deferred()).promise});await settle();
   const status=h.ids.get('army-status'),writes=textWrites(status);
   for(let attempt=2;attempt<=4;attempt++){await h.tick(60000);assert.equal(h.calls.length,attempt);}
   assert.equal(writes.length,1);assert.match(writes[0],/No stale or partial figures are shown/);assert.equal(status.className,'notice error');
   await h.tick(60000);assert.equal(h.calls.length,5);await h.tick(15000);assert.equal(h.calls[4].init.signal.aborted,true);pending.resolve(armyResponse(NOW+300,[fixture()]));await settle();
   assert.equal(writes.length,1);assert.equal(h.ids.get('army-results').children.length,0);assert.match(status.textContent,/could not be read/);assert.equal(status.className,'notice error');
 });
 await check('.186 a deliberate Refresh returns focus to the breakdown summary only if the reader has not moved focus meanwhile',async()=>{
   const pending=[];const h=harness({public:true,transport:async(_url,_init,_body,calls)=>calls.length===1?armyResponse(NOW,[fixture()]):(pending[calls.length-2]=deferred()).promise});await settle();
   const original=Element.prototype.focus,focusCalls=[];Element.prototype.focus=function(){focusCalls.push(this);h.scope.document.activeElement=this;};
   try{
     const root=h.ids.get('army-results'),refresh=h.ids.get('army-refresh'),elsewhere=new Element('a'),breakdown=()=>root.children[0].children.filter(child=>child.tagName==='DETAILS')[1];
     breakdown().open=true;h.scope.document.activeElement=breakdown().children[0];
     let clicked=refresh.click();await settle();assert.equal(root.children.length,0);
     h.scope.document.activeElement=elsewhere;pending[0].resolve(armyResponse(NOW+60,[fixture()]));await clicked;await settle();
     assert.equal(root.children.length,1);assert.equal(breakdown().open,true);assert.deepEqual(focusCalls,[]);assert.equal(h.scope.document.activeElement,elsewhere);
     h.scope.document.activeElement=breakdown().children[0];clicked=refresh.click();await settle();
     h.scope.document.activeElement=null;pending[1].resolve(armyResponse(NOW+120,[fixture()]));await clicked;await settle();
     assert.equal(focusCalls.length,1);assert.equal(focusCalls[0],breakdown().children[0]);assert.equal(h.scope.document.activeElement,breakdown().children[0]);
   }finally{Element.prototype.focus=original;}
 });
 await check('.186 the read time is a separate non-live line in the mounted and standalone readers',async()=>{
   const h=harness({mount:true,snapshots:[fixture()]}),container=new Element(),controller=h.scope.OlympusArmyReader.mount(container,{isCurrent:()=>true});await settle();
   assert.equal(container.children.length,4);const [actions,status,results,stamp]=container.children;assert.equal(actions.children[0].textContent,'Refresh snapshots');assert.equal(results.attributes['aria-label'],'Shared guild snapshots');
   assert.equal(status.attributes.role,'status');assert.equal(status.attributes['aria-live'],'polite');assert.doesNotMatch(status.textContent,/read at/i);
   assert.equal(stamp.tagName,'P');assert.equal(stamp.className,'muted');assert.equal(stamp.attributes.role,undefined);assert.equal(stamp.attributes['aria-live'],undefined);assert.match(stamp.textContent,/^Read at .+\.$/);
   controller.destroy();assert.equal(stamp.textContent,'');
   const pages=require(path.join(root,'worker/tests/helpers/privacy129_fixture.cjs')).load('army-pages'),html=await pages.publicArmyPage(new Request('https://olympus.invalid/army')).text();
   assert.ok(html.includes('<p id="army-status" class="notice" role="status" aria-live="polite">'));assert.ok(html.includes('</section><p id="army-read-time" class="muted"></p><noscript>'));
 });
 await check('reporter without reader controls never polls or starts capture when reader clocks advance',async()=>{
   const h=harness();await settle();await h.tick(180000);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/army/reporter');assert.equal(h.ids.get('addon-command').value,'');assert.equal(h.ids.get('report-preview').disabled,true);assert.equal(h.ids.get('report-publish').disabled,true);
 });
 await check('unadopted exporter refuses capture and publication without a retry or aggregate request',async()=>{const h=harness({exporterAvailable:false});await settle();assert.equal(h.ids.get('start').disabled,true);await h.ids.get('start').click();assert.equal(h.ids.get('addon-command').value,'');assert.equal(h.ids.get('report-preview').disabled,true);assert.equal(h.ids.get('report-publish').disabled,true);assert.equal(h.calls.length,1);assert.match(h.ids.get('report-status').textContent,/dedicated exporter availability has not been verified for this website/i);});
 await check('refused reporter cannot start capture or produce a command',async()=>{const h=harness({refused:true});await settle();assert.equal(h.ids.get('start').disabled,true);await h.ids.get('start').click();assert.equal(h.ids.get('addon-command').value,'');assert.equal(h.calls.length,1);});
 await check('actual v2 frame scan completes locally without transmitting frames or aggregate',async()=>{const h=harness();await settle();await h.scan();assert.match(h.ids.get('report-status').textContent,/reviewed locally/);assert.equal(h.calls.length,1);assert.equal(h.ids.get('addon-command').value,'');assert.equal(h.ids.get('frames').value,'');assert.equal(h.ids.get('report-preview').disabled,false);});
 await check('private preview and explicit consent remain separate from sharing with signed-in Olympus readers',async()=>{const h=harness();await settle();await h.scan();await h.ids.get('report-preview').click();assert.equal(h.calls.length,2);assert.deepEqual(Object.keys(h.calls[1].body),['snapshot']);assert.equal(h.ids.get('report-publish').disabled,true);await h.ids.get('report-publish').click();assert.equal(h.calls.length,2);h.ids.get('report-consent').checked=true;await h.ids.get('report-publish').click();assert.equal(h.calls.length,3);assert.equal(h.calls[2].url,'/api/army/publish');assert.equal(h.calls[2].body.confirm,'PUBLISH');assert.equal(h.calls[2].init.headers['X-Olympus'],'2');assert.match(h.ids.get('report-status').textContent,/shared with signed-in Olympus readers/);assert.equal(h.ids.get('report-preview-results').children.length,0);});
 await check('local QR review and both publication requests preserve Olympus and Olympus I names exactly',async()=>{
   for(const name of ['Olympus','Olympus I']){const value=fixture();value.guilds[0].name=name;const h=harness();await settle();await h.scan(value);assert.equal(h.ids.get('guild-name').textContent,name);await h.ids.get('report-preview').click();assert.equal(h.calls[1].body.snapshot.guilds[0].name,name);const card=h.ids.get('report-preview-results').children[0];assert.equal(card.children.find(child=>child.tagName==='H2').textContent,name);h.ids.get('report-consent').checked=true;await h.ids.get('report-publish').click();assert.equal(h.calls[2].body.snapshot.guilds[0].name,name);}
 });
 await check('native uppercase OLYMPUS Alliance QR stays local until deliberate canonical preview and publication',async()=>{
   const value=fixture();value.guilds[0].name='OLYMPUS';Object.freeze(value.guilds[0]);Object.freeze(value.guilds);Object.freeze(value);const original=JSON.stringify(value),h=harness();await settle();await h.scan(value);
   assert.equal(h.ids.get('guild-name').textContent,'OLYMPUS');assert.equal(h.calls.length,1);assert.equal(h.ids.get('report-preview').disabled,false);assert.equal(h.ids.get('report-publish').disabled,true);assert.equal(JSON.stringify(value),original);
   await h.ids.get('report-preview').click();assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,'/api/army/preview');assert.equal(h.calls[1].body.snapshot.guilds[0].name,'Olympus');assert.equal(h.calls[1].body.snapshot.faction,'Alliance');assert.equal(h.ids.get('report-preview-results').children[0].children.find(child=>child.tagName==='H2').textContent,'Olympus');
   await h.ids.get('report-publish').click();assert.equal(h.calls.length,2);h.ids.get('report-consent').checked=true;await h.ids.get('report-publish').click();assert.equal(h.calls.length,3);assert.equal(h.calls[2].body.snapshot.guilds[0].name,'Olympus');assert.equal(h.calls[2].body.confirm,'PUBLISH');assert.equal(JSON.stringify(value),original);
 });
 await check('ASCII upper lower and mixed-case variants map only to all eleven existing canonical guild names in outbound snapshots',async()=>{
   for(const name of ['Olympus','Olympus I','Olympus II','Olympus III','Olympus IV','Olympus V','Olympus VI','Olympus VII','Olympus VIII','Olympus IX','Olympus X']){
     for(const raw of new Set([name.toUpperCase(),name.toLowerCase(),name.replace(/[A-Za-z]/g,(letter,index)=>index%2?letter.toLowerCase():letter.toUpperCase())])){
       const value=fixture();value.guilds[0].name=raw;const h=harness();await settle();await h.scan(value);assert.equal(h.ids.get('guild-name').textContent,raw);assert.equal(h.calls.length,1);
       await h.ids.get('report-preview').click();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1].body.snapshot,{...value,guilds:[{...value.guilds[0],name}]});assert.equal(h.ids.get('report-preview-results').children[0].children.find(child=>child.tagName==='H2').textContent,name);h.ids.get('report-consent').checked=true;await h.ids.get('report-publish').click();assert.equal(h.calls.length,3);assert.equal(h.calls[2].body.snapshot.guilds[0].name,name);assert.equal(value.guilds[0].name,raw);
     }
   }
 });
 await check('case mapping refuses whitespace Unicode confusables and expanded guild names without any aggregate request',async()=>{
   for(const name of [' Olympus','Olympus ','Olympus  I','Olympus\u00a0I','Olympus\u2160','OLYMPU\u017f','\uff2flympus','\u041elympus','Olympus 1','Olympus 01','Olympus XI','Olympus XII','Olympus-X','Olympusx']){
     const value=fixture();value.guilds[0].name=name;const h=harness();await settle();try{await h.scan(value);}catch(error){assert.match(error.message,/bounded guild label/);}assert.equal(h.calls.length,1,name);assert.equal(h.ids.get('report-preview').disabled,true,name);await h.ids.get('report-preview').click();assert.equal(h.calls.length,1,name);assert.equal(h.ids.get('report-publish').disabled,true,name);
   }
 });
 await check('lost uppercase-guild publication retains only its exact canonical original for outcome recovery',async()=>{
   const value=fixture();value.guilds[0].name='OLYMPUS IX';const original=JSON.stringify(value),h=harness({lost:true});await settle();await h.scan(value);assert.equal(h.calls.length,1);await h.ids.get('report-preview').click();h.ids.get('report-consent').checked=true;await h.ids.get('report-publish').click();assert.equal(h.calls.length,3);const sent=h.calls[2].body;assert.equal(sent.snapshot.guilds[0].name,'Olympus IX');assert.equal(h.ids.get('report-outcome').hidden,false);
   await h.ids.get('report-clear').click();await h.hide();await h.show();await h.ids.get('start').click();assert.equal(h.calls.length,3);await h.ids.get('report-outcome').click();assert.equal(h.calls.length,4);assert.deepEqual(h.calls[3].body,{snapshot:sent.snapshot,previewToken:sent.previewToken});assert.equal(h.calls[3].body.snapshot.guilds[0].name,'Olympus IX');assert.equal(JSON.stringify(value),original);
 });
 await check('lost publish keeps exact aggregate recovery and blocks every replacement scan',async()=>{const h=harness({lost:true});await settle();await h.scan();await h.ids.get('report-preview').click();h.ids.get('report-consent').checked=true;await h.ids.get('report-publish').click();const sent=h.calls[2].body;assert.equal(h.ids.get('report-outcome').hidden,false);assert.equal(h.ids.get('start').disabled,true);await h.ids.get('report-clear').click();await h.hide();await h.show();await h.ids.get('start').click();assert.equal(h.calls.length,3);await h.ids.get('report-outcome').click();assert.equal(h.calls.length,4);assert.deepEqual(h.calls[3].body,{snapshot:sent.snapshot,previewToken:sent.previewToken});assert.match(h.ids.get('report-status').textContent,/does not identify which reporter/);assert.equal(h.ids.get('report-outcome').hidden,true);});
 await check('original30-second expiry refuses late frames without creating a private preview',async()=>{const h=harness();await settle();await h.ids.get('start').click();const nonce=h.ids.get('addon-command').value.split(' ')[1],frames=await h.scope.OlympusGuildQRProtocol.encodeFrames(fixture(),nonce,{nowSeconds:NOW});await h.advance(30000);h.ids.get('frames').value=frames.join('\n');await h.ids.get('review-frames').click();assert.equal(h.calls.length,1);assert.equal(h.ids.get('report-preview').disabled,true);assert.equal(h.ids.get('addon-command').value,'');});
 await check('hiding decoded review clears source buffers and prevents an unseen preview',async()=>{const h=harness();await settle();await h.scan();await h.hide();assert.equal(h.ids.get('guild-name').textContent,'');assert.equal(h.ids.get('report-preview').disabled,true);await h.show();await h.ids.get('report-preview').click();assert.equal(h.calls.length,1);});
 await check('raw local realm label is replaced by the fixed approved scope before any aggregate request',async()=>{const value=fixture();value.realmGroup='Private fictional game realm';const h=harness();await settle();await h.scan(value);assert.match(h.ids.get('guild-scope').textContent,/Private fictional game realm/);await h.ids.get('report-preview').click();assert.equal(h.calls[1].body.snapshot.realmGroup,'World of Warcraft: Forever PvE');assert.ok(!JSON.stringify(h.calls).includes('Private fictional game realm'));});
 await check('Horde or unrelated guild observations remain local and cannot request a server preview',async()=>{for(const kind of ['faction','guild']){const value=fixture();if(kind==='faction')value.faction='Horde';else value.guilds[0].name='Unrelated fictional guild';const h=harness();await settle();await h.scan(value);assert.equal(h.calls.length,1);assert.equal(h.ids.get('report-preview').disabled,true);}});
 await check('one stale snapshot remains visibly historical without blanking a fresh guild',async()=>{const older=fixture();older.guilds[0].name='Olympus II';older.observedAt=NOW-90000;older.guilds[0].receivedAt=NOW-90000;older.guilds[0].online=null;const h=harness({public:true,snapshots:[fixture(),older]});await settle();assert.match(h.ids.get('army-results').textContent,/Olympus I/);assert.match(h.ids.get('army-results').textContent,/Olympus II/);assert.match(h.ids.get('army-results').textContent,/Stale community observation/);assert.match(h.ids.get('army-results').textContent,/Last reported characters/);});
 await check('local display aging still withholds online counts and marks expired source before delayed refresh timer delivery',async()=>{const h=harness({public:true,snapshots:[fixture()]});await settle();await h.advance(901000);assert.match(h.ids.get('army-results').textContent,/Online count no longer current/);await h.advance(86400000);assert.match(h.ids.get('army-results').textContent,/Historical report/);assert.equal(h.calls.length,1);});
 console.log(passed+'/'+(passed+failed)+' Army live browser contract checks passed');if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
