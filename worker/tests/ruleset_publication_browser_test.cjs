// Actual app.js, Worker routes, signed cookie and native SQLite. Only Discord HTTP is synthetic.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const p=path.join(__dirname,'frontend_check.cjs'),s=fs.readFileSync(p,'utf8'),cut=s.indexOf('(async () => {\n');
const cutCR=s.indexOf('(async () => {\r\n');const at=cut<0?cutCR:cut;
if(at<0)throw Error('frontend fixture seam');
const scenario=String.raw`
(async()=>{
 siteUser(STAFF);const guild='700000000000000001',bot='700000000000000002',channels={guide:'700000000000000010','olympus-info':'700000000000000011','guild-announcements':'700000000000000012'};
 const over={GUILD_ID:guild,SITE_GUILD_ID:guild,INTROS_GUILD_ID:guild,DISCORD_APP_ID:bot,INTROS_CHANNELS:'join-olympus='+channels.guide+',olympus-info='+channels['olympus-info']+',guild-announcements='+channels['guild-announcements']};
 const messages=new Map(),effects=[];let number=900000000000000000n,lose=false;
 stubs['./discord'].rest=async(_env,method,url,body)=>{
  if(url==='/users/@me')return{id:bot,bot:true};
  let x;if(method==='GET'&&(x=url.match(/^\/channels\/(\d+)$/)))return{id:x[1],guild_id:guild,type:0};
  if(method==='GET'&&(x=url.match(/^\/channels\/(\d+)\/messages\/pins$/)))return{items:[...messages.values()].filter(m=>m.channel_id===x[1]&&m.pinned).map(message=>({message}))};
  if(method==='POST'&&(x=url.match(/^\/channels\/(\d+)\/messages$/))){effects.push([method,url]);const msg={...body,id:String(number++),channel_id:x[1],author:{id:bot},pinned:false};messages.set(msg.id,msg);if(lose){lose=false;throw Error('provider answer lost');}return msg;}
  if((x=url.match(/^\/channels\/(\d+)\/messages\/(\d+)$/))){const m=messages.get(x[2]);if(!m)throw new realDiscord.DiscordError(404,'{"code":10008}');if(method==='PATCH'){effects.push([method,url]);Object.assign(m,body);}return m;}
  if(method==='PUT'&&(x=url.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/))){effects.push([method,url]);messages.get(x[2]).pinned=true;return null;}
  throw Error('unrecognized synthetic provider endpoint');
 };
 let page=await openPage(STAFF,over);await page.go('#/admin/ruleset-publication');await waitFor(()=>page.app.querySelectorAll('pre').length===3,'complete publication preview');
 check('actual admin tab reaches current approved identity preview without effect',!!byText(page.app,'a','Ruleset publication')&&page.app.textContent.includes('Classic Beta PvP 2')&&page.app.querySelectorAll('pre').length===3&&effects.length===0);
 check('plan requires deliberate review checkbox and has no future selector',byText(page.app,'button','Record current beta plan').disabled&&!page.app.querySelector('select')&&page.app.textContent.includes('No future profile'));
 const consent=page.app.querySelector('#ruleset-publication-reviewed');consent.checked=true;fire(consent,'change');
 page.drop((url)=>url.endsWith('/ruleset-publication/select'));byText(page.app,'button','Record current beta plan').click();
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
 const again=page.app.querySelector('#ruleset-publication-reviewed');again.checked=true;fire(again,'change');byText(page.app,'button','Record current beta plan').click();
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
 check('malformed future/readable receipt has no payload or active buttons',malformed.app.querySelectorAll('pre').length===0&&byText(malformed.app,'button','Record current beta plan').disabled&&!malformed.app.querySelector('script'));
 const detached=byText(reload.app,'button','Refresh publication status');let reads=0;reload.before(url=>{if(url.startsWith('/api/admin/ruleset-publication'))reads++;return false;});await reload.go('#/roles');detached.click();await settle();
 check('detached real controls make zero requests',reads===0);
 const ordinary=await openPage(null,over);await ordinary.go('#/admin/ruleset-publication');await settle();check('anonymous has no staff publisher controls',!byText(ordinary.app,'button','Record current beta plan')&&effects.filter(e=>e[0]==='POST').length===2);
 console.log(ok+'/'+n+' passed');process.exit(ok===n?0:1); // The real app's recurring UI timers are intentionally stopped by the house harness.
})().catch(e=>{console.error(e);process.exit(1);});
`;
const m=new Module(p,module);m.filename=p;m.paths=Module._nodeModulePaths(path.dirname(p));m._compile(s.slice(0,at)+scenario,p);
