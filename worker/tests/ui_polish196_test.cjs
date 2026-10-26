// Actual app + genuine Worker/session/minimal DOM; bounded DTO substitutions qualify presentation only.
const fs196=require('node:fs'),path196=require('node:path'),{Module}=require('node:module');
const p196=path196.join(__dirname,'frontend_check.cjs'),f196=fs196.readFileSync(p196,'utf8'),cuts196=[...f196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cuts196.length!==1)throw Error('one original frontend fixture boundary required');
const seed196='  const w = makeWindow(JSON.stringify(boot));';
if(f196.slice(0,cuts196[0].index).split(seed196).length!==2)throw Error('one tab storage seed seam required');
const prefix196=f196.slice(0,cuts196[0].index).replace(seed196,seed196+'\n  if (typeof tabPreference196 === "string") w.sessionStorage.setItem("olympus.streamShield", tabPreference196);');
const body196=String.raw`
let tabPreference196=null;
(async()=>{
 await siteUser(MEMBER,{global_name:'Member'});await character(MEMBER,'Member One','Player-1-0001');await siteUser(STAFF);
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('newsOn','true',?)ON CONFLICT(key)DO UPDATE SET value='true'",now);
 const staff=await openPage(STAFF),shield=staff.app.querySelector(".stream-shield-toggle");
 check('unified addon promo names publisher adoption and no longer separates Army reporting',staff.app.textContent.includes('optional unified guild addon')&&staff.app.textContent.includes('publisher adoption')&&!staff.app.textContent.includes('separate from verification and Army QR reporting'));
 check('Stream Shield control sits outside both navigation and the private identity area',!!shield&&!shield.closest('nav')&&!shield.closest('.who')&&!!shield.closest('.topbar-actions'));
 await staff.go('#/apply');const detail=staff.app.querySelectorAll('button').find(button=>(button.getAttribute('aria-label')||'').startsWith('Details:'));
 if(!detail)throw Error('actual role dialog trigger missing');detail.click();await settle();
 check('actual role detail opens an ordinary named modal before shielding',staff.document.querySelector('dialog')?.open===true);
 staff.app.querySelector(".stream-shield-toggle").click();await settle();
 check('shielding closes open modals and stores only tab presentation preference',!staff.document.querySelector('dialog')?.open&&staff.sessionStorage.getItem('olympus.streamShield')==='on'&&staff.document.documentElement.getAttribute('data-stream-shield')==='on');
 detail.click();await settle();check('a late dialog attempt while shielded never creates an invisible modal lock',!staff.document.querySelector('dialog')?.open);
 tabPreference196='on';const restored=await openPage(STAFF),ineligible=await openPage(MEMBER);tabPreference196=null;
 check('eligible reload restores shield before its first view while ineligible accounts cannot inherit it',restored.document.documentElement.getAttribute('data-stream-shield')==='on'&&restored.app.querySelector(".stream-shield-toggle").getAttribute('aria-pressed')==='true'&&ineligible.document.documentElement.getAttribute('data-stream-shield')==='off'&&!ineligible.app.querySelector(".stream-shield-toggle"));
 staff.app.querySelector(".stream-shield-toggle").click();
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('bnetEnableIntent','1',?)ON CONFLICT(key)DO UPDATE SET value='1'",now);
 const bnet=await openPage(STAFF),bnetWrites=[];bnet.before((url,init)=>{if(url==='/api/admin/bnet-switch'&&init.method==='PUT')bnetWrites.push(JSON.parse(init.body));return false;});
 await bnet.go('#/admin/settings');await waitFor(()=>!!byText(bnet.app,'button','Withdraw recorded request'),'stored dormant request');
 check('dormant request is visible only as OFF withdrawal, never an enable checkbox',!bnet.app.querySelector('#bnet-switch')&&bnet.app.textContent.includes('Collection stays OFF in this release')&&!bnet.app.textContent.includes('Request future enablement'));
 byText(bnet.app,'button','Withdraw recorded request').click();await waitFor(()=>bnet.app.textContent.includes('recorded request was withdrawn'),'real admitted withdrawal');
 check('withdraw sends only false through original admitted API and does not enable collection',bnetWrites.length===1&&bnetWrites[0].on===false&&one("SELECT value FROM site_settings WHERE key='bnetEnableIntent'").value==='0'&&one("SELECT value FROM site_settings WHERE key='bnetLogin'").value==='0'&&!bnet.app.querySelector('#bnet-switch'));
 for(const status of [401,409]){
   const late=await openPage(STAFF);let read=0;
   late.before((url,init)=>{if(url==='/api/admin/bnet-switch'&&(init.method||'GET')==='GET')read++;return false;});
   late.hold(url=>url==='/api/admin/bnet-switch'?70:0);
   late.answer(url=>url==='/api/admin/bnet-switch'?new Response(JSON.stringify({error:status===409?'reload':'signed_out'}),{status,headers:{'Content-Type':'application/json'}}):null);
   await late.go('#/admin/settings');await waitFor(()=>read===1,'original dormant switch read pending');await late.go('#/roles');await settle();const text=late.app.textContent;
   await new Promise(resolve=>setTimeout(resolve,100));
   check('late dormant GET'+status+' cannot sign out, reload or replace a newer route',late.location.hash==='#/roles'&&!!byText(late.app,'button','Sign out')&&late.app.textContent===text&&!late.app.textContent.includes('Battle.net request'));
 }
 const animation=bnet.app.querySelector('#login-animation'),saved=[];check('login animation is an explicit default-OFF setting with honest model provenance',!!animation&&!animation.checked&&bnet.app.textContent.includes('existing client-model render, not publisher video'));
 bnet.before((url,init)=>{if(url==='/api/admin/settings'&&init.method==='PUT')saved.push(JSON.parse(init.body));return false;});animation.checked=true;byText(bnet.app,'button','Save settings').click();await waitFor(()=>saved.length===1,'captured settings save');
 check('the existing settings save carries an exact boolean animation choice without a new authority route',saved.length===1&&saved[0].loginAnimation===true&&typeof saved[0].namesOpen==='boolean');
 await waitFor(()=>!byText(bnet.app,'button','Save settings').disabled,'settings request terminal');const detachedSave=byText(bnet.app,'button','Save settings');await bnet.go('#/roles');detachedSave.click();await settle();check('detached settings cannot save the new display option',saved.length===1);
 for(const code of ['cursor_expired','invalid_cursor']){
   const page=await openPage(MEMBER);let reads=0;
   page.answer(url=>{if(!url.startsWith('/api/community/discord-directory')||url.includes('/visibility'))return null;if(++reads>1)return new Response(JSON.stringify({error:code}),{status:code==='invalid_cursor'?400:409,headers:{'Content-Type':'application/json'}});return{source:'discord_members',generatedAt:new Date().toISOString(),members:[{ref:'first',displayName:'First',username:'first',roles:[],verifiedCharacters:[]}],nextCursor:'synthetic-cursor',complete:false,traversal:{atomicSnapshot:false,expiresAt:new Date(Date.now()+60000).toISOString()}};});
   await page.go('#/community/directory');await waitFor(()=>page.app.querySelectorAll('.card.member').length===1,'first bounded directory page');byText(page.app,'button','Show more members').click();await waitFor(()=>page.app.querySelectorAll('.card.member').length===0,'cursor refusal clears retained rows');
   check(code+' clears both stale rows and unusable continuation while retaining explicit refresh',reads===2&&byText(page.app,'button','Show more members').hidden&&byText(page.app,'button','Load all eligible Olympus members').hidden&&!byText(page.app,'button','Refresh directory').disabled);
   await page.go('#/roles');
 }
 const id='z'.repeat(22),guild='700000000000000001',channel='700000000000000002';
 const notice={id,revision:1,title:'Synthetic notice',body:'Synthetic body',postedAt:now,until:now+86400,editedAt:null};
 const errors=[{status:403,data:{error:'news_editor_forbidden'},text:'original send is unconfirmed'},{status:400,data:{error:'explicit_confirmation_required'},text:'refused before a new send'},{status:409,data:{error:'news_webhook_provider_refused',state:'refused'},text:'Discord refused this send'},{status:409,data:{error:'news_webhook_changed',state:'known'},text:'copy was recorded but was not accepted as current'},{status:409,data:{error:'news_webhook_outcome_unknown',state:'unknown'},text:'original send is unconfirmed'},{status:500,data:{error:'news_webhook_custody_unconfirmed'},text:'original send is unconfirmed'}];
 for(const entry of errors){
   const page=await openPage(STAFF);let posts=0;
   page.before((url,init)=>{if(url.endsWith('/webhook/publish'))posts++;return false;});
   page.answer(url=>url==='/api/admin/news'?{newsOn:true,notices:[notice],opId:'synthetic',limits:{},awaitingCleanup:0,operationRecords:0}:url.startsWith('/api/news/editor/webhook/preview')?{id,revision:1,canPublish:true,enabled:true,cleanupOnly:false,removalPending:false,state:'not_published',destination:{guild,channel},cleanupRevision:null,cleanupDestination:null,payload:{embeds:[{title:notice.title,description:notice.body}],allowed_mentions:{parse:[]}},confirmation:'synthetic-never-valid-on-server',expiresAt:now+300}:url.endsWith('/webhook/publish')?new Response(JSON.stringify(entry.data),{status:entry.status,headers:{'Content-Type':'application/json'}}):null);
   await page.go('#/admin/news');await waitFor(()=>!!byText(page.app,'button','Review optional Discord cross-post'),'current notice controls');byText(page.app,'button','Review optional Discord cross-post').click();await waitFor(()=>!!byText(page.app,'button','Publish this exact Discord cross-post'),'synthetic bounded preview');
   const cross=page.app.querySelector('.news-webhook196'),confirm=cross.querySelector('input[type="checkbox"]');confirm.checked=true;fire(confirm,'change');const publish=byText(cross,'button','Publish this exact Discord cross-post');publish.click();publish.click();await waitFor(()=>cross.textContent.includes(entry.text),'truthful cross-post outcome');
   check('cross-post '+entry.status+'/'+(entry.data.state||entry.data.error)+' has truthful copy and no automatic resend',posts===1&&cross.textContent.includes(entry.text)&&!byText(cross,'button','Publish this exact Discord cross-post'));
   await page.go('#/roles');
 }
 const sd196=load('./site-data'),offices196=load('./governance-offices').OFFICE_APPOINTMENTS;
 check('extended-office errors use human labels and .199 Officer Alt is native slot3 with Treasurer an appointment',sd196.roleLabel('office_50')==='Lead Correspondent'&&sd196.roleLabel('rank_high_council')==='High Council'&&offices196.find(o=>o.key==='rank_officer_alt').group==='native'&&offices196.find(o=>o.key==='rank_officer_alt').nativeIndex===3&&offices196.find(o=>o.key==='rank_treasurer').group==='office');
 console.log(ok+'/'+n+' passed');process.exit(ok===n?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
`;
const m196=new Module(p196,module);m196.filename=p196;m196.paths=Module._nodeModulePaths(path196.dirname(p196));m196._compile(prefix196+body196,p196);
