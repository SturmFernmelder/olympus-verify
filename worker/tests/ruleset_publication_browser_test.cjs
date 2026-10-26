// Actual app.js, Worker routes, signed cookie and native SQLite. Only Discord HTTP is synthetic.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const p=path.join(__dirname,'frontend_check.cjs'),s=fs.readFileSync(p,'utf8'),cut=s.indexOf('(async () => {\n');
const cutCR=s.indexOf('(async () => {\r\n');const at=cut<0?cutCR:cut;
if(at<0)throw Error('frontend fixture seam');
const scenario=String.raw`
(async()=>{
 await siteUser(STAFF);const guild='700000000000000001',bot='700000000000000002',channels={guide:'700000000000000010','olympus-info':'700000000000000011','guild-announcements':'700000000000000012'};
 const over={GUILD_ID:guild,SITE_GUILD_ID:guild,INTROS_GUILD_ID:guild,DISCORD_APP_ID:bot,DISCORD_BOT_TOKEN:'synthetic-publication-only',INTROS_CHANNELS:'join-olympus='+channels.guide+',olympus-info='+channels['olympus-info']+',guild-announcements='+channels['guild-announcements']};
 const messages=new Map(),effects=[];let number=900000000000000000n,lose=false;
 // Exercise the genuine REST adapter behind the same original fetch slot as the Worker.
 stubs['./discord'].rest=realDiscord.rest;
 originalTestFetch=async(input,init={})=>{
  const request=input instanceof Request?input:null,u=new URL(request?request.url:input),method=request?request.method:init.method||'GET';
  if(u.origin!=='https://discord.com'||!u.pathname.startsWith('/api/v10/'))throw Error('no external network in publication fixtures');
  const url=u.pathname.slice('/api/v10'.length),text=request?await request.text():init.body,body=text?JSON.parse(text):undefined,reply=value=>Response.json(value);
  if(url==='/users/@me')return reply({id:bot,bot:true});
  let x;if(method==='GET'&&(x=url.match(/^\/channels\/(\d+)$/)))return reply({id:x[1],guild_id:guild,type:0});
  if(method==='GET'&&(x=url.match(/^\/channels\/(\d+)\/messages\/pins$/)))return reply({items:[...messages.values()].filter(m=>m.channel_id===x[1]&&m.pinned).map(message=>({message}))});
  if(method==='POST'&&(x=url.match(/^\/channels\/(\d+)\/messages$/))){effects.push([method,url]);const msg={...body,id:String(number++),channel_id:x[1],author:{id:bot},pinned:false};messages.set(msg.id,msg);if(lose){lose=false;throw Error('provider answer lost');}return reply(msg);}
  if((x=url.match(/^\/channels\/(\d+)\/messages\/(\d+)$/))){const m=messages.get(x[2]);if(!m)return Response.json({code:10008},{status:404});if(method==='PATCH'){effects.push([method,url]);Object.assign(m,body);}return reply(m);}
  if(method==='PUT'&&(x=url.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/))){effects.push([method,url]);messages.get(x[2]).pinned=true;return new Response(null,{status:204});}
  throw Error('unrecognized synthetic provider endpoint');
 };
 let page=await openPage(STAFF,over);await page.go('#/admin/ruleset-publication');await waitFor(()=>page.app.querySelectorAll('pre').length===3,'complete publication preview');
 check('actual admin tab reaches current approved realmless identity preview without effect',!!byText(page.app,'a','Ruleset publication')&&page.app.textContent.includes('PVE - Alliance')&&page.app.textContent.includes('Realmless (ruleset-based)')&&page.app.querySelectorAll('pre').length===3&&effects.length===0);
 // .174: the ordinary Admin section picker is navigation, outside the protected publication frame.
 const consent=page.app.querySelector('#ruleset-publication-reviewed'),publicationPanel=consent?.closest('.frame'),navigation=page.app.querySelector('#admin-section-select'),selectors=page.app.querySelectorAll('select');
 check('plan requires deliberate review checkbox and has no future selector',!!consent&&consent.getAttribute('type')==='checkbox'&&!consent.checked&&byText(page.app,'button','Record current PvE Alliance plan').disabled&&!!publicationPanel&&!publicationPanel.querySelector('select')&&selectors.length===1&&selectors[0]===navigation&&navigation.getAttribute('aria-label')==='Admin section'&&!!navigation.closest('.admin-section-nav')&&navigation.value==='#/admin/ruleset-publication'&&page.app.textContent.includes('No future profile'));
 consent.checked=true;fire(consent,'change');
 page.drop((url)=>url.endsWith('/ruleset-publication/select'));byText(page.app,'button','Record current PvE Alliance plan').click();
 await waitFor(()=>!!one("SELECT 1 FROM ruleset_publications WHERE target_key='$selection'"),'selected plan');await waitFor(()=>page.app.textContent.includes('Selected revision 1')&&!page.sessionStorage.getItem('olympus.rulesetSelection'),'selection durable read');page.drop(null);
 check('lost selection answer is resolved by original durable operation without send',one('SELECT COUNT(*) n FROM ruleset_publications').n===4&&effects.length===0&&!page.sessionStorage.getItem('olympus.rulesetSelection'));
 let apply=page.app.querySelectorAll('button').find(b=>b.textContent==='Apply next step'&&!b.disabled);apply.click();await waitFor(()=>one("SELECT state FROM ruleset_publications WHERE target_key='guide'")?.state==='known','known create');await waitFor(()=>page.app.textContent.includes('Known message'),'known pointer');
 check('actual form creates once and previews same exact approved payload',effects.filter(e=>e[0]==='POST').length===1&&[...messages.values()][0].allowed_mentions.parse.length===0&&page.app.textContent.includes('Known message'));
 apply=page.app.querySelectorAll('button').find(b=>b.textContent==='Apply next step'&&!b.disabled);apply.click();await waitFor(()=>one("SELECT state FROM ruleset_publications WHERE target_key='guide'")?.state==='applied','confirmed pin');await waitFor(()=>page.app.querySelectorAll('button').some(b=>b.textContent==='Apply next step'&&!b.disabled),'next target loaded');
 check('next deliberate step pins same pointer without creating again',effects.filter(e=>e[0]==='POST').length===1&&effects.filter(e=>e[0]==='PUT').length===1&&messages.size===1);
 // A genuine unknown POST becomes visible after reload and cannot be silently retried.
 lose=true;apply=page.app.querySelectorAll('button').find(b=>b.textContent==='Apply next step'&&!b.disabled);apply.click();await waitFor(()=>one("SELECT state FROM ruleset_publications WHERE target_key='olympus-info'")?.state==='unknown','unknown actual provider');await settle();
 const op=one("SELECT publication_id FROM ruleset_publications WHERE target_key='$selection'").publication_id;
 await waitFor(()=>page.app.textContent.includes('unknown')&&!page.app.querySelector('#ruleset-publication-reviewed').disabled,'unknown status fully drawn');
 const again=page.app.querySelector('#ruleset-publication-reviewed');again.checked=true;fire(again,'change');byText(page.app,'button','Record current PvE Alliance plan').click();
 await waitFor(()=>one('SELECT MAX(selection_revision) n FROM ruleset_publications').n===2,'newer genuine selection');await waitFor(()=>page.app.textContent.includes('Selected revision 2'),'newer selection visible');
 check('newer real selection does not redispatch an older unknown slot',effects.filter(e=>e[0]==='POST').length===2&&one('SELECT COUNT(*) n FROM ruleset_publications').n===8);
 const reload=await openPage(STAFF,over);await reload.go('#/admin/ruleset-publication');await waitFor(()=>!!byText(reload.app,'button','Check original held message'),'durable unknown recovery');
 check('new page recovers original held operation and cannot repeat its POST',reload.app.textContent.includes(op)&&effects.filter(e=>e[0]==='POST').length===2&&reload.app.querySelectorAll('button').filter(b=>b.textContent==='Apply next step')[1].disabled);
 const msg=[...messages.values()].find(m=>m.channel_id===channels['olympus-info']);const heldInput=reload.app.querySelector('input[aria-label="Held message ID for olympus-info"]');
 let checksSent=0;reload.before(url=>{if(url.endsWith('/ruleset-publication/reconcile'))checksSent++;return false;});heldInput.value='https://discord.com/channels/'+guild+'/'+channels.guide+'/'+msg.id;byText(reload.app,'button','Check original held message').click();await settle();
 check('copied different-destination link makes no reconciliation request',checksSent===0&&reload.app.textContent.includes('displayed destination'));
 heldInput.value=msg.id;byText(reload.app,'button','Check original held message').click();await waitFor(()=>one("SELECT state FROM ruleset_publications WHERE target_key='olympus-info' AND selection_revision=1")?.state==='held','GET-only older reconcile');await settle();
 check('reloaded actual form checks original older message without another POST',effects.filter(e=>e[0]==='POST').length===2&&one("SELECT message_id FROM ruleset_publications WHERE target_key='olympus-info' AND selection_revision=1").message_id===msg.id&&checksSent===1);
 // Untrusted readable status cannot enable effects or render active HTML.
 const malformed=await openPage(STAFF,over);malformed.answer(url=>url==='/api/admin/ruleset-publication'?{currentProfile:{phase:'future'},targets:[{payload:{content:'<script>hostile</script>'}}]}:null);await malformed.go('#/admin/ruleset-publication');await waitFor(()=>malformed.app.textContent.includes('unqualified'),'malformed status refusal');
 check('malformed future/readable receipt has no payload or active buttons',malformed.app.querySelectorAll('pre').length===0&&byText(malformed.app,'button','Record current PvE Alliance plan').disabled&&!malformed.app.querySelector('script'));
 const detached=byText(reload.app,'button','Refresh publication status');let reads=0;reload.before(url=>{if(url.startsWith('/api/admin/ruleset-publication'))reads++;return false;});await reload.go('#/roles');detached.click();await settle();
 check('detached real controls make zero requests',reads===0);
 const ordinary=await openPage(null,over);check('anonymous receives only sign-in, with no app/bootstrap or staff publisher controls',ordinary.response.status===200&&ordinary.app===null&&ordinary.boot===null&&ordinary.html.includes('Sign in with Discord')&&!ordinary.html.includes('<script')&&!ordinary.html.includes('Record current PvE Alliance plan')&&effects.filter(e=>e[0]==='POST').length===2);
 // .196: the live publisher can already contain an old-profile selection. Its original
 // states remain historical while a new current-source plan is deliberately recorded.
 const oldProfile=load('./ruleset-profile').historicalBetaRulesetProfile().revision,latest=one("SELECT * FROM ruleset_publications WHERE target_key='$selection' ORDER BY selection_revision DESC LIMIT 1"),oldOperation=latest.publication_id;
 await fixtureRun('UPDATE ruleset_publications SET profile_revision=? WHERE publication_id=?',oldProfile,oldOperation);
 await fixtureRun('UPDATE ruleset_publications SET state=? WHERE publication_id=? AND target_key<>?', 'applied',oldOperation,'$selection');
 await fixtureRun('UPDATE ruleset_publications SET state=? WHERE publication_id=? AND target_key=?','unknown',op,'olympus-info');
 const historicalRows=JSON.stringify(db.prepare('SELECT * FROM ruleset_publications WHERE publication_id=? ORDER BY target_key').all(oldOperation)),effectCount=effects.length;
 const historical=await openPage(STAFF,over);await historical.go('#/admin/ruleset-publication');await waitFor(()=>historical.app.querySelectorAll('pre').length===3||historical.app.textContent.includes('unqualified'),'historical selection settled status');
 check('old-profile selection is explicitly historical beside current PvE previews',historical.app.querySelectorAll('pre').length===3&&historical.app.textContent.includes('Historical selection')&&historical.app.textContent.includes(oldProfile)&&historical.app.textContent.includes('PVE - Alliance')&&effects.length===effectCount);
 check('historical target states never enable old Apply against the new preview',historical.app.querySelectorAll('button').filter(b=>b.textContent==='Apply next step').length===3&&historical.app.querySelectorAll('button').filter(b=>b.textContent==='Apply next step').every(b=>b.disabled)&&historical.app.textContent.includes('Historical state: applied'));
 check('historical selected profile retains original unknown blocker and GET-only check',!!byText(historical.app,'button','Check original held message')&&historical.app.textContent.includes(op)&&one("SELECT state FROM ruleset_publications WHERE publication_id=? AND target_key='olympus-info'",op).state==='unknown');
 const statusResponse=await indexMod.default.fetch(new Request('https://guild.example/api/admin/ruleset-publication',{headers:{Cookie:historical.cookie}}),env(over),ctx),currentStatus=await statusResponse.json();
 const retained={profileRevision:oldProfile,form:currentStatus.form},retainedText=JSON.stringify(retained),pendingPage=await openPage(STAFF,over);pendingPage.sessionStorage.setItem('olympus.rulesetSelection',retainedText);await pendingPage.go('#/admin/ruleset-publication');await waitFor(()=>pendingPage.app.querySelectorAll('pre').length===3||pendingPage.app.textContent.includes('unqualified'),'retained original selection settled status');
 check('old-profile pending selection stays stored and visibly unconfirmed',pendingPage.sessionStorage.getItem('olympus.rulesetSelection')===retainedText&&pendingPage.app.textContent.includes('Original selection for '+oldProfile)&&pendingPage.app.textContent.includes('retained'));
 const pendingReview=pendingPage.app.querySelector('#ruleset-publication-reviewed');pendingReview.checked=true;fire(pendingReview,'change');
 check('retained old-profile selection blocks Record and every Apply without a resend',byText(pendingPage.app,'button','Original selection needs review')?.disabled===true&&pendingPage.app.querySelectorAll('button').filter(b=>b.textContent==='Apply next step').every(b=>b.disabled)&&effects.length===effectCount);
 const currentReview=historical.app.querySelector('#ruleset-publication-reviewed');currentReview.checked=true;fire(currentReview,'change');const record=byText(historical.app,'button','Record current PvE Alliance plan');
 check('current source can be deliberately selected without adopting historical state',!!record&&!record.disabled&&JSON.stringify(db.prepare('SELECT * FROM ruleset_publications WHERE publication_id=? ORDER BY target_key').all(oldOperation))===historicalRows);
 if(record&&!record.disabled){record.click();await waitFor(()=>one('SELECT MAX(selection_revision)n FROM ruleset_publications').n===latest.selection_revision+1,'new current-profile selection');await waitFor(()=>historical.app.textContent.includes('Selected revision '+(latest.selection_revision+1)),'new current selection displayed');}
 const selectedNow=one("SELECT * FROM ruleset_publications WHERE target_key='$selection' ORDER BY selection_revision DESC LIMIT 1");
 check('new current selection records no provider effect and preserves historical rows/unknown custody',selectedNow.profile_revision===load('./ruleset-profile').currentRulesetProfile().revision&&selectedNow.selection_revision===latest.selection_revision+1&&effects.length===effectCount&&JSON.stringify(db.prepare('SELECT * FROM ruleset_publications WHERE publication_id=? ORDER BY target_key').all(oldOperation))===historicalRows&&one("SELECT state FROM ruleset_publications WHERE publication_id=? AND target_key='olympus-info'",op).state==='unknown');
 check('new selected plan leaves the original unknown target Apply blocked',historical.app.querySelectorAll('button').filter(b=>b.textContent==='Apply next step')[1]?.disabled===true&&!!byText(historical.app,'button','Check original held message'));
 // PB1: a held profile is not a proven *different* current profile. The existing
 // server-qualified Return can be requested while original selection custody stays stored.
 const heldPage196=await openPage(STAFF,over),heldPending196=retainedText,heldRequests196=[];
 heldPage196.sessionStorage.setItem('olympus.rulesetSelection',heldPending196);
 const heldDto196={...currentStatus,currentProfile:null,rulesetSwitch:{...currentStatus.rulesetSwitch,mode:'full_release',held:'future_profile_missing',futureProfileConfigured:false,ownerEligibilityQualified:true,projectionSyncQualified:true,activateAvailable:false,returnAvailable:true}};
 heldPage196.answer(url=>url==='/api/admin/ruleset-publication'?heldDto196:null);
 heldPage196.before((url,init)=>{if(url.endsWith('/ruleset-publication/deactivate')){heldRequests196.push(JSON.parse(init.body));return true;}return false;});
 await heldPage196.go('#/admin/ruleset-publication');await waitFor(()=>heldPage196.app.textContent.includes('identity is held'),'held identity with pending custody');
 const heldReturn196=byText(heldPage196.app,'button','Return to the current PvE Alliance identity'),heldConfirm196=heldPage196.app.querySelector('#ruleset-switch-confirmed');
 check('held identity retains pending history and explains server-qualified explicit recovery without Record or Apply',heldReturn196.disabled&&heldPage196.sessionStorage.getItem('olympus.rulesetSelection')===heldPending196&&heldPage196.app.textContent.includes('Stored selection custody is retained')&&byText(heldPage196.app,'button','Retry original selection')?.disabled===true&&heldPage196.app.querySelectorAll('pre').length===0);
 heldReturn196.click();await settle();check('unconfirmed held Return makes no request and retains original selection custody',heldRequests196.length===0&&heldPage196.sessionStorage.getItem('olympus.rulesetSelection')===heldPending196&&effects.length===effectCount);
 heldConfirm196.checked=true;fire(heldConfirm196,'change');check('explicit confirmation enables only the server-qualified Return, not future activation',!heldReturn196.disabled&&byText(heldPage196.app,'button','Activate the full-release identity').disabled);
 heldReturn196.click();heldReturn196.click();const heldSent196=await waitFor(()=>heldRequests196.length===1&&!heldPage196.app.querySelector('#ruleset-switch-confirmed').disabled,'one held recovery request');if(!heldSent196)throw Error('held Return never reached its original request');
 check('held Return uses the original status form once and never clears pending custody or sends Discord effects',heldRequests196.length===1&&heldRequests196[0].confirm===true&&JSON.stringify(heldRequests196[0].form)===JSON.stringify(currentStatus.form)&&heldPage196.sessionStorage.getItem('olympus.rulesetSelection')===heldPending196&&effects.length===effectCount);
 // Deferred client-only replies: the real server refuses these stale synthetic
 // forms. DTO substitution verifies original-view fencing, never switch authority.
 for(const status of [401,409,200]){
   const late=await openPage(STAFF,over),stored=heldPending196;let sends=0,replies=0,sentBody=null;
   late.sessionStorage.setItem('olympus.rulesetSelection',stored);
   late.hold(url=>url.endsWith('/ruleset-publication/deactivate')?70:0);
   late.before((url,init)=>{if(url.endsWith('/ruleset-publication/deactivate')){sends++;sentBody=JSON.parse(init.body);}return false;});
   late.answer(url=>{if(url==='/api/admin/ruleset-publication')return heldDto196;if(!url.endsWith('/ruleset-publication/deactivate'))return null;replies++;return new Response(JSON.stringify(status===200?{mode:'full_release',profile:{...currentStatus.currentProfile,phase:'full_release',realm:'Late stale realm',revision:'late-reply-v1'}}:{error:status===409?'reload':'signed_out'}),{status,headers:{'Content-Type':'application/json'}});});
   await late.go('#/admin/ruleset-publication');await waitFor(()=>!!late.app.querySelector('#ruleset-switch-confirmed'),'held late-switch fixture');const consent=late.app.querySelector('#ruleset-switch-confirmed');consent.checked=true;fire(consent,'change');const lateReturn=byText(late.app,'button','Return to the current PvE Alliance identity');lateReturn.click();const pendingReply=await waitFor(()=>sends===1&&replies===0&&lateReturn.disabled,'original Return pending');check('held Return'+status+' is genuinely pending before disposal',pendingReply&&sends===1&&replies===0&&sentBody?.confirm===true&&JSON.stringify(sentBody.form)===JSON.stringify(currentStatus.form));if(!pendingReply)throw Error('late Return'+status+' never reached an in-flight request');
   await late.go('#/roles');await settle();const text=late.app.textContent;await new Promise(resolve=>setTimeout(resolve,100));const replied=await waitFor(()=>replies===1,'original Return'+status+' reply delivered');if(!replied)throw Error('late Return'+status+' reply was not delivered');
   check('late held Return'+status+' retains owner/route and original pending storage',pendingReply&&replied&&sends===1&&replies===1&&late.location.hash==='#/roles'&&!!byText(late.app,'button','Sign out')&&late.app.textContent===text&&late.sessionStorage.getItem('olympus.rulesetSelection')===stored&&effects.length===effectCount);
   await late.go('#/');check('late Return'+status+' cannot install stale metadata on the next view',pendingReply&&replied&&sends===1&&replies===1&&!late.app.textContent.includes('Late stale realm')&&!!byText(late.app,'button','Sign out'));
 }
 console.log(ok+'/'+n+' passed');process.exit(ok===n?0:1); // The real app's recurring UI timers are intentionally stopped by the house harness.
})().catch(e=>{console.error(e);process.exit(1);});
`;
const m=new Module(p,module);m.filename=p;m.paths=Module._nodeModulePaths(path.dirname(p));m._compile(s.slice(0,at)+scenario,p);
