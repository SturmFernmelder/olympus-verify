// Evergreen Stage 2 (4 Nov 2026): the launch-day transition. The actual SPA, Worker and Native SQLite schema through
// the maintained frontend fixture; synthetic clocks and identities, Discord faked by that fixture, no provider.
// CL-035 members-only reserved-name queue hold; CL-049/037/021/118/243 Home names copy; CL-165/191 launch notice;
// CL-166 News frame; CL-320 admin filter; CL-322 seat-state wording; CL-325 role duties; CL-162/167 /launch and the
// /olympus launch card; CL-177 bot and intro copy.
const fs228=require('node:fs'),path228=require('node:path'),crypto228=require('node:crypto'),{Module}=require('node:module');
const original228=fs228.readFileSync(path228.join(__dirname,'frontend_check.cjs'),'utf8');
const cuts228=[...original228.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cuts228.length!==1)throw Error('launch228_original_frontend_boundary');
const prefix228=original228.slice(0,cuts228[0].index);
if(crypto228.createHash('sha256').update(require('./frontend_fixture_prefix217.cjs').historicalFrontendPrefix217(prefix228)).digest('hex')!=='bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5')throw Error('launch228_original_frontend_prefix_drift');
async function launchTransition228(){
 const LAUNCH=1793833200,RAID_END=Date.parse('2026-12-10T08:00:00Z')/1000;
 const PRE=Date.parse('2026-11-04T20:00:00Z'),POST=Date.parse('2026-11-05T12:00:00Z'),NA_NIGHT=Date.parse('2026-12-10T00:30:00Z'),LAST_MINUTE=Date.parse('2026-12-10T07:59:00Z'),RETIRED=RAID_END*1000,LATER=Date.parse('2026-12-11T12:00:00Z');
 const SCOPE=JSON.stringify({version:1,guild:'Olympus',realm:'Fixture Live Realm'}),MEMBERS_ONLY=Object.freeze({VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:SCOPE});
 const BOT_ENV=Object.freeze({INTROS_GUILD_ID:'236932545793490944',INTROS_CHANNELS:'raid-signups=1550000000000000013'});
 const appSource=fs.readFileSync(path.join(root,'public','static','app.js'),'utf8'),source=name=>fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
 const mainOf=page=>{const main=page.app&&page.app.querySelector('main');if(!main)throw Error('authenticated main missing');return main;};
 const guard=async(label,work)=>{try{await work();}catch(error){check(label+' completed without an exception: '+error.message,false);}};
 const pageAt=(clock,over={},who=MEMBER)=>openPage(who,over,{clockNow:clock});
 const RESERVE=/doesn['’]t reserve/g,OLD_COPY=['neither reserves','does not reserve them','does not open Blizzard','does not link or reserve','first come, first served','lets the WoW account','Once you have reserved yours'];
 const data=load('./site-data'),gate=load('./launch-verification227'),siteQueue=load('./site-queue');
 await siteUser(MEMBER,{global_name:'Launch reader'});await character(MEMBER,'Launch Reader','Player-228-0001');
 await siteUser(STAFF,{global_name:'Launch admin'});
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('newsOn','1',?)ON CONFLICT(key)DO UPDATE SET value=excluded.value",now);

 console.log('== one Forever schedule ==');
 await guard('schedule',async()=>{
  const m=/const FOREVER_SCHEDULE = Object\.freeze\(\{([^}]*)\}\);/.exec(appSource);
  const spa=m?{launchAt:Number((/launchAt:\s*(\d+)/.exec(m[1])||[])[1]),firstRaids:(/firstRaids:\s*"([^"]+)"/.exec(m[1])||[])[1],raidDayEndAt:Number((/raidDayEndAt:\s*(\d+)/.exec(m[1])||[])[1])}:null;
  check('the SPA keeps one Forever schedule: launch 1793833200, first raids 9 December 2026 (date only), raid day ending 2026-12-10T08:00:00Z',
   !!spa&&appSource.split('const FOREVER_SCHEDULE = ').length===2&&spa.launchAt===LAUNCH&&spa.firstRaids==='9 December 2026'&&spa.raidDayEndAt===RAID_END,spa);
  check('  the SPA scatters no other schedule literal',appSource.split('1793833200').length===2&&!appSource.includes('"2026-12-09"')&&!appSource.includes('"2026-11-03"'));
  const worker=data.FOREVER_SCHEDULE;
  check('  the Worker schedule (site-data.ts) is the same, and the default guild invite time is the launch',!!worker&&Object.isFrozen(worker)&&!!spa&&worker.launchAt===spa.launchAt&&worker.firstRaids===spa.firstRaids&&worker.raidDayEndAt===spa.raidDayEndAt&&data.DEFAULT_LAUNCH_AT===LAUNCH&&data.settingsFrom({},[]).launchAt===LAUNCH,worker);
 });

 console.log('== CL-035: reserved names during launch verification ==');
 await guard('display parity',async()=>{
  let getterCalls=0;
  const variants=[['absent',{}],['false',{VERIFY_MEMBERSHIP_ONLY:'false'}],['undefined value',{VERIFY_MEMBERSHIP_ONLY:undefined}],['members-only',{...MEMBERS_ONLY}],['members-only without a scope (held)',{VERIFY_MEMBERSHIP_ONLY:'true'}],['malformed (held)',{VERIFY_MEMBERSHIP_ONLY:'TRUE'}],['inherited (held)',Object.create({VERIFY_MEMBERSHIP_ONLY:'false'})],['accessor (held)',Object.defineProperty({},'VERIFY_MEMBERSHIP_ONLY',{get(){getterCalls++;return 'false';},enumerable:true})]];
  for(const [label,e] of variants){
   const shown=data.settingsFrom(e,[]).reservedQueueOnSite,legacy=gate.captureLaunchVerification(e).mode==='legacy';
   check('the page reads the website queue exactly as the hold does: '+label,typeof shown==='boolean'&&shown===legacy,shown,legacy);
  }
  check('  reading it never invokes a configuration getter',getterCalls===0);
  check('  the fixture selects real membership-only mode',gate.captureLaunchVerification(directEnv(MEMBERS_ONLY)).mode==='members-only'&&gate.captureLaunchVerification(directEnv()).mode==='legacy');
 });
 const NAMES=['Tlqone','Tlqtwo'];
 const resetNames=async()=>{
  await fixtureRun("DELETE FROM invite_queue WHERE name_key IN ('tlqone','tlqtwo')");
  await fixtureRun("DELETE FROM site_reserved WHERE name_key IN ('tlqone','tlqtwo')");
  const t=Math.floor(Date.now()/1000);
  for(const name of NAMES)await fixtureRun("INSERT INTO site_reserved (owner_id,name,name_key,status,created_at,approved_by,approved_at) VALUES (?,?,?,'approved',?,?,?)",MEMBER,name,name.toLowerCase(),t-120,STAFF,t-60);
 };
 const queueState=()=>JSON.stringify({reserved:db.prepare("SELECT name_key,status,queue_id,queued_at FROM site_reserved WHERE name_key IN ('tlqone','tlqtwo') ORDER BY name_key").all(),queue:db.prepare("SELECT name_key,status,priority FROM invite_queue WHERE name_key IN ('tlqone','tlqtwo') ORDER BY name_key").all(),audit:one("SELECT COUNT(*) AS c FROM audit WHERE action='site.reserved_queued'").c});
 const isHeld=out=>!!out&&out.held===true&&out.queued===0&&out.bumped===0&&out.inGuild===0&&out.more===false;
 const priorLaunch=one("SELECT value FROM site_settings WHERE key='launchAt'");
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('launchAt',?,?)ON CONFLICT(key)DO UPDATE SET value=excluded.value",String(Math.floor(Date.now()/1000)-60),now);
 await guard('cron hold',async()=>{
  await resetNames();const before=queueState();
  const untouchable=new Proxy({},{get(_,key){throw Error('the held reserved-name queue touched D1: '+String(key));}});
  const quiet=await siteQueue.autoQueueReserved({...directEnv(MEMBERS_ONLY),DB:untouchable});
  check('membership-only launch verification: the cron holds the reserved-name queue without a D1 statement',isHeld(quiet),quiet);
  const held=await siteQueue.autoQueueReserved(directEnv(MEMBERS_ONLY));
  check('  with real D1 after the guild invite time nothing is written: names stay approved, no queue row, no audit',isHeld(held)&&queueState()===before,held,queueState());
  const invalid=await siteQueue.autoQueueReserved(directEnv({VERIFY_MEMBERSHIP_ONLY:'yes'}));
  check('  a held (invalid) verification switch holds it too',isHeld(invalid)&&queueState()===before,invalid);
 });
 await guard('configuration changes during queue reads',async()=>{
  const enterLaunch = e => { e.VERIFY_MEMBERSHIP_ONLY='true'; e.VERIFY_NATIVE_SCOPE=SCOPE; };
  let preparations=0;
  const afterSettings={...directEnv(),DB:{prepare(){preparations++;return {all:async()=>{
    enterLaunch(afterSettings);
    return {results:[{key:'launchAt',value:String(Math.floor(Date.now()/1000)-60)},{key:'autoQueue',value:'1'}]};
  }};}}};
  const noSelection=await siteQueue.autoQueueReserved(afterSettings);
  check('a mode change while reading settings holds before preparing any selection',isHeld(noSelection)&&preparations===1,noSelection,preparations);
  let batches=0;
  const afterEmptySelection={...directEnv(),DB:{prepare(){return {};},async batch(){batches++;
    enterLaunch(afterEmptySelection);
    return [{results:[{contested:0,banned:0}]},{results:[]}];
  }}};
  const emptySelection=await siteQueue.queueReserved(afterEmptySelection,STAFF);
  check('a mode change during an empty selection still returns held with no write',isHeld(emptySelection)&&batches===1,emptySelection,batches);
 });
 await guard('admin hold',async()=>{
  await resetNames();const before=queueState();
  const response=await indexMod.default.fetch(new Request('https://guild.example/api/admin/reserved/queue',{method:'POST',headers:{Origin:'https://guild.example',Cookie:await cookieFor(STAFF),'X-Olympus':'2','Content-Type':'application/json'},body:JSON.stringify({ids:[]})}),env({ASSETS:governanceAssets,...MEMBERS_ONLY}),ctx);
  const body=await response.json().catch(()=>null);
  check("membership-only: the admin 'Queue every approved name now' path is held the same way and writes nothing",response.status===200&&isHeld(body)&&queueState()===before,response.status,body,queueState());
 });
 await guard('legacy queue',async()=>{
  await resetNames();
  const legacy=await siteQueue.autoQueueReserved(directEnv());
  const rows=db.prepare("SELECT r.status, q.priority, q.approved_by FROM site_reserved r JOIN invite_queue q ON q.id=r.queue_id WHERE r.name_key IN ('tlqone','tlqtwo')").all();
  check('legacy admission (no membership-only switch): after the guild invite time the cron still queues both approved names at the top',!!legacy&&legacy.held===undefined&&legacy.queued===2&&rows.length===2&&rows.every(r=>r.status==='queued'&&r.priority===1&&r.approved_by==='site'),legacy,rows);
  const budget=load('./scheduled-budget'),line=budget.SCHEDULED_BUDGET.find(r=>r.job==='autoQueueReserved');
  check('  the scheduled budget line for autoQueueReserved is unchanged (the hold spends no statement)',!!line&&line.worst===1+1+budget.SCHEDULED_CAPS.autoQueueRounds*(1+5)+1&&line.worst===9,line);
 });
 await guard('partial commit before a pause',async()=>{
  const t=Math.floor(Date.now()/1000),partial=directEnv();
  const auditBefore=one("SELECT COALESCE(MAX(id),0) AS id FROM audit").id;
  const names=Array.from({length:251},(_,i)=>'Tlqpart'+String.fromCharCode(97+Math.floor(i/26),97+i%26));
  let committedChunks=0;
  try{
   await fixtureRows("INSERT INTO site_reserved (owner_id,name,name_key,status,created_at,approved_by,approved_at) VALUES (?,?,?,'approved',?,?,?)",
    names.map((name,i)=>[MEMBER,name,name.toLowerCase(),t-600,STAFF,t-500+i]));
   HOOKS.afterBatch=(_n,statements)=>{
    if(!statements.some(sql=>sql.includes("SELECT name_key, name, owner_id, NULL, 'queued'")))return;
    committedChunks++;
    Object.assign(partial,MEMBERS_ONLY);
   };
   const out=await siteQueue.queueReserved(partial,STAFF);
   const rows=db.prepare("SELECT r.status,r.queued_at,q.status AS invite_status,q.priority,q.approved_by FROM site_reserved r LEFT JOIN invite_queue q ON q.id=r.queue_id WHERE r.name_key GLOB 'tlqpart*' ORDER BY r.approved_at,r.id").all();
   const invites=one("SELECT COUNT(*) AS c FROM invite_queue WHERE name_key GLOB 'tlqpart*'").c;
   const auditRows=db.prepare("SELECT actor,details FROM audit WHERE id>? AND action='site.reserved_queued'").all(auditBefore);
   const expected={queued:250,bumped:0,inGuild:0,blocked:0,contested:0,more:false,held:true};
   const matches=result=>Object.entries(expected).every(([key,value])=>result[key]===value);
   const last=rows.at(-1);
   check('a pause after one committed queue round retains its 250 results and exact audit, leaving the final name untouched',
    committedChunks===1&&matches(out)&&rows.length===251&&invites===250
     &&rows.slice(0,-1).every(r=>r.status==='queued'&&r.queued_at!==null&&r.invite_status==='queued'&&r.priority===1&&r.approved_by==='site')
     &&last?.status==='approved'&&last.queued_at===null&&last.invite_status===null
     &&auditRows.length===1&&auditRows[0].actor===STAFF&&matches(JSON.parse(auditRows[0].details)),
    out,{committedChunks,invites,last,auditRows:auditRows.length});
  }finally{
   HOOKS.afterBatch=null;
   await fixtureRun("DELETE FROM invite_queue WHERE name_key GLOB 'tlqpart*'");
   await fixtureRun("DELETE FROM site_reserved WHERE name_key GLOB 'tlqpart*'");
  }
 });
 if(priorLaunch)await fixtureRun("UPDATE site_settings SET value=? WHERE key='launchAt'",priorLaunch.value);else await fixtureRun("DELETE FROM site_settings WHERE key='launchAt'");
 await resetNames();

 console.log('== Home before and after the launch (CL-049, CL-037, CL-021, CL-118, CL-243, CL-165) ==');
 await guard('Home before launch',async()=>{
  const page=await pageAt(PRE),main=mainOf(page),text=main.textContent,names=main.querySelector('#names'),notices=main.querySelectorAll('.launch-notice218');
  check('Home before launch: one notice counts down to 4 November 23:00 UTC, without the closed reservation window',notices.length===1&&notices[0].getAttribute('aria-label')==='Forever global launch'&&!!notices[0].querySelector('[role="timer"]')&&notices[0].textContent.includes('4 November 2026 · 23:00 UTC · 3:00 PM PST')&&!notices[0].textContent.includes('27 October')&&!/reservation/i.test(notices[0].textContent));
  check('  one countdown on Home while the guild invites at the global launch',page.boot.settings.launchAt===LAUNCH&&main.querySelectorAll('[role="timer"]').length===1,main.querySelectorAll('[role="timer"]').length);
  check('the reserved-names panel puts Blizzard’s closed reservation in the past tense',!!names&&names.textContent.includes("Blizzard's early name reservation ran from 27 October to 3 November 2026. If you reserved names, list them here so leadership can match them to you."),names&&names.textContent.slice(0,400));
  check('Home says once that the list does not reserve names, and no older restatement remains',(text.match(RESERVE)||[]).length===1&&OLD_COPY.every(s=>!text.includes(s)),(text.match(RESERVE)||[]).length,OLD_COPY.filter(s=>text.includes(s)));
  const admission=main.querySelector('.launch-and-admission218'),nameCard=admission&&admission.querySelectorAll('.date-card')[0];
  check('the open name-entry card agrees with its heading',!!nameCard&&nameCard.textContent.includes('Website name entry is open')&&!nameCard.textContent.includes('planned from')&&!text.includes('Name entry on this site is planned from')&&!text.includes('once the guild opens it'),nameCard&&nameCard.textContent);
  const count=main.querySelector('#names-count');
  check('the Home reserved-names card reads as a sentence',!!count&&/^\d+ of \d+$/.test(count.textContent)&&count.parentNode.textContent.includes('Saved on your list below.'),count&&count.parentNode.textContent);
  check('legacy admission: the panel says approved names go to the top of the invite queue',!!names&&names.textContent.includes('approved names go to the top of the invite queue')&&!names.textContent.includes('The website queue is paused'));
  await page.go('#/apply');await waitFor(()=>!!mainOf(page).querySelector('form'),'the Apply form');
  const copy=mainOf(page).querySelector('.launch-notice218 .launch-application-copy218');
  check('Apply keeps the editable-form instruction and no reservation disclaimer',!!copy&&copy.textContent.includes('in this application')&&!copy.textContent.includes('neither reserves'),copy&&copy.textContent);
 });
 await guard('Home after launch',async()=>{
  const page=await pageAt(POST),main=mainOf(page),notices=main.querySelectorAll('.launch-notice218'),names=main.querySelector('#names');
  check('Home after launch: the notice shows only the next milestone, the first raids on 9 December with no announced hour',notices.length===1&&notices[0].getAttribute('aria-label')==='Forever raid schedule'&&notices[0].textContent.includes('Barrow Deeps, Hyjal Summit and Onyxia’s Lair open on 9 December 2026. Check Blizzard for the opening time.')&&!notices[0].querySelector('[role="timer"]')&&!notices[0].textContent.includes('23:00 UTC')&&!notices[0].textContent.includes('27 October')&&!notices[0].textContent.includes('date passed'),notices[0]&&notices[0].textContent);
  check('  the names panel stays in the past tense after launch, with its one statement',!!names&&names.textContent.includes("Blizzard's early name reservation ran from 27 October to 3 November 2026.")&&(main.textContent.match(RESERVE)||[]).length===1);
 });
 await guard('raid day',async()=>{
  for(const [label,clock] of [['NA evening of 9 December (00:30 UTC on 10 December)',NA_NIGHT],['last minute of 9 December in PST',LAST_MINUTE]]){
   const notice=mainOf(await pageAt(clock)).querySelector('.launch-notice218');
   check('the raid notice is still current on the '+label,!!notice&&notice.textContent.includes('9 December · first Forever raids')&&!notice.textContent.includes('date passed'),notice&&notice.textContent);
  }
  const retired=await pageAt(RETIRED);
  check('from 2026-12-10T08:00:00Z (end of 9 December in PST) the notice retires on Home',!mainOf(retired).querySelector('.launch-notice218'));
  await retired.go('#/apply');await waitFor(()=>!!mainOf(retired).querySelector('form'),'the Apply form after the notice retired');
  check('  and on Apply, whose form still renders',!mainOf(retired).querySelector('.launch-notice218')&&!!mainOf(retired).querySelector('form'));
  await retired.go('#/community/news');await waitFor(()=>!!byText(retired.app,'h2','Notices'),'the News page after the notice retired');
  check('  and on News',!retired.app.querySelector('.launch-notice218')&&!!byText(retired.app,'h2','Forever milestones'));
 });

 console.log('== News (CL-166) ==');
 await guard('News',async()=>{
  for(const [label,clock] of [['before',PRE],['after',POST]]){
   const page=await pageAt(clock);await page.go('#/community/news');await waitFor(()=>!!byText(page.app,'h2','Notices'),'the News page '+label+' launch');
   const title=byText(page.app,'h2','Forever milestones'),frame=title&&title.closest('section'),plan=frame&&frame.querySelector('.guild-invite-plan218');
   check('News '+label+' launch: the frame is titled Forever milestones',!!frame&&!byText(page.app,'h2','The road to launch'));
   check('  its guild invite line is correct '+label+' launch',!!plan&&!plan.textContent.includes('are planned from')&&plan.textContent.includes('separate from Blizzard’s global launch'),plan&&plan.textContent);
   check('  it shows '+(label==='before'?'the launch countdown':'the raid milestone'),!!frame&&(label==='before'?frame.querySelectorAll('[role="timer"]').length===1:frame.textContent.includes('Barrow Deeps, Hyjal Summit and Onyxia’s Lair open on 9 December 2026')&&!frame.querySelector('[role="timer"]')));
  }
 });

 console.log('== membership-only copy (CL-035) ==');
 await guard('membership-only Home',async()=>{
  await resetNames();
  // A name queued before the hold took effect: its owner must not be told the website is inviting it.
  const queueId=Number((await fixtureRun("INSERT INTO invite_queue (name_key,name,discord_id,status,created_at,approved_by,priority) VALUES ('tlqone','Tlqone',?,'queued',?,'site',1)",MEMBER,now-30)).lastInsertRowid);
  await fixtureRun("UPDATE site_reserved SET status='queued',queue_id=?,queued_at=? WHERE name_key='tlqone'",queueId,now-30);
  const page=await pageAt(POST,MEMBERS_ONLY),names=mainOf(page).querySelector('#names');
  check('membership-only Home: officers invite in game during launch verification; the website queue is not promised',page.boot.settings.reservedQueueOnSite===false&&!!names&&names.textContent.includes('Officers invite in game. The website queue is paused.')&&!names.textContent.includes('top of the invite queue')&&!names.textContent.includes('In the invite queue'),names&&names.textContent);
  check('  a name queued before the hold shows the in-game invite, not the website queue',!!names&&names.textContent.includes('Officers invite in game'));
  const legacy=await pageAt(POST),legacyNames=mainOf(legacy).querySelector('#names');
  check('  legacy Home still shows the website queue badge for the same name',legacy.boot.settings.reservedQueueOnSite===true&&!!legacyNames&&legacyNames.textContent.includes('In the invite queue'));
  await resetNames();
 });

 console.log('== admin Reserved names (CL-320, CL-035) ==');
 await guard('admin names',async()=>{
  for(const [label,over] of [['legacy',{}],['membership-only',MEMBERS_ONLY]]){
   await resetNames();
   const page=await openPage(STAFF,over,{clockNow:POST});await page.go('#/admin/names');
   await waitFor(()=>!!byText(page.app,'button','Queue selected now')&&!!page.app.querySelector('input[aria-label="Select Tlqone"]'),'admin reserved names ('+label+')');
   const options=texts(page.app,'option'),copy=mainOf(page).textContent;
   check(label+' admin filter: approved names read “Approved, not yet queued”',options.includes('Approved, not yet queued')&&!options.some(t=>/waiting for launch/i.test(t)),options);
   if(label==='legacy'){
    check('  legacy admin copy keeps the website queue and live Queue buttons',copy.includes('Approved names go to the top of the invite queue')&&!byText(page.app,'button','Queue selected now').disabled&&!copy.includes('The website queue is paused'));
    page.answer(p=>p==='/api/admin/reserved/queue'?{ok:true,queued:0,bumped:0,inGuild:0,blocked:0,contested:0,more:false,held:true}:null);
    const box=page.app.querySelector('input[aria-label="Select Tlqone"]');box.checked=true;fire(box,'change');
    byText(page.app,'button','Queue selected now').click();await settle();
    const anyway=page.document.querySelector('dialog')&&byText(page.document.querySelector('dialog'),'button','Queue anyway');if(anyway){anyway.click();await settle();}
    await waitFor(()=>page.document.body.textContent.includes('Nothing was queued')||page.document.body.textContent.includes('Queued 0'),'the queue answer toast');
    check('  a held answer is reported as paused, never as “Queued 0”',page.document.body.textContent.includes('The website queue is paused. Officers invite in game.')&&!page.document.body.textContent.includes('Queued 0'));
    await waitFor(()=>page.app.querySelector('input[aria-label="Select Tlqone"]')!==box,'queue refresh after first reply');
    page.answer(p=>p==='/api/admin/reserved/queue'?{ok:true,queued:1,bumped:0,inGuild:0,blocked:0,contested:0,more:false,held:true}:null);
    const nextBox=page.app.querySelector('input[aria-label="Select Tlqone"]');nextBox.checked=true;fire(nextBox,'change');
    byText(page.app,'button','Queue selected now').click();await settle();
    const nextAnyway=page.document.querySelector('dialog')&&byText(page.document.querySelector('dialog'),'button','Queue anyway');if(nextAnyway){nextAnyway.click();await settle();}
    await waitFor(()=>page.document.body.textContent.includes('Queued 1'),'the partial queue answer toast');
    check('  the partial queue reply reports work already completed before the hold',page.document.body.textContent.includes('Queued 1, moved to the front 0, already in the guild 0. The website queue is paused. Officers invite in game.'));
    page.answer(null);
   }else check('  membership-only admin copy: officers invite in game during launch verification, and Queue is paused',copy.includes('Officers invite in game. The website queue is paused.')&&!copy.includes('Approved names go to the top of the invite queue')&&byText(page.app,'button','Queue selected now').disabled===true&&byText(page.app,'button','Queue every approved name now').disabled===true,copy.slice(0,600));
  }
  await resetNames();
 });

 console.log('== role duties (CL-325) ==');
 await guard('roles',async()=>{
  const copy=key=>{const p=data.POSITIONS.find(x=>x.key===key);return p?JSON.stringify([p.blurb,p.info.about,p.info.duties,p.info.expect]):'';};
  for(const key of ['leveling','guild_master']){const text=copy(key);check(key+' duties are standing duties, not written for an upcoming launch',!!text&&!/\bat launch\b|when Forever launches|after launch\b/i.test(text),text.slice(0,400));}
 });

 console.log('== Discord /launch and the /olympus launch card (CL-162, CL-167) ==');
 const RealDate228=Date,atClock=async(ms,work)=>{globalThis.Date=class extends RealDate228{constructor(...a){if(a.length===0)super(ms);else super(...a);}static now(){return ms;}};try{return await work();}finally{globalThis.Date=RealDate228;}};
 await guard('/launch',async()=>{
  const utilities=load('./guild-utilities219'),botEnv=directEnv(BOT_ENV),launch=ms=>atClock(ms,()=>utilities.referenceLookup219(botEnv,null,'launch'));
  const before=await launch(PRE),after=await launch(POST),later=await launch(LATER);
  check('/launch before the launch keeps the countdown',before.title==='World of Warcraft: Forever · November 4'&&before.description.includes('<t:1793833200:F>')&&before.description.includes('remaining'),before);
  check('/launch after the scheduled time gives the official date and opening-time reference without asserting service availability',after.title==='World of Warcraft: Forever · Launch date'&&after.description.includes('<t:1793833200:F> has passed')&&after.description.includes('Check Blizzard for current availability')&&after.description.includes('The first raids are scheduled for 9 December 2026. Check Blizzard for the opening time.')&&after.fields.some(field=>field.value==='https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live')&&!after.description.includes('remaining'),after);
  check('  after 9 December (PST) the raid line retires and the launch date stays',later.title===after.title&&!later.description.includes('first raids')&&later.description.includes('<t:1793833200:F>'),later);
  check('the /olympus branches card renders that same /launch answer',source('olympus-hub224').includes("[await referenceLookup219(env,a,'branches'),await referenceLookup219(env,a,'launch')]"));
 });

 console.log('== bot and intro copy (CL-177) ==');
 await guard('copy',async()=>{
  const utilities=load('./guild-utilities219'),preset=JSON.parse(fs.readFileSync(path.join(root,'public','static','guides218.json'),'utf8')).presets[0].code;
  const talent=await utilities.guideLookup219(directEnv(BOT_ENV),null,'talent',{build:preset});
  check('the talent preview dates its beta snapshot and points to current in-game talents and Blizzard notes',talent.description.includes('16 October beta talent snapshot')&&talent.description.includes('Check the talents on your character in game')&&talent.fields.some(field=>field.name==='Blizzard’s 2 November notes'&&field.value==='https://us.forums.blizzard.com/en/wow/t/2360696/9'),talent.description);
  const util=source('guild-utilities219'),hub=source('olympus-hub224');
  check('  the guide replies’ evidence footer is tense-neutral',!util.includes('Launch may change beta details')&&util.includes('Pinned data comes from the beta; the released game can differ.'));
  check('  the /olympus guides section is tense-neutral',!hub.includes('launch behavior is not inferred')&&hub.includes('the released game can differ'));
  const intro=load('./intros').INTROS.find(x=>x.key==='olympus-info'),reservation=intro.embeds[1].fields.find(f=>f.name==='Early name reservation'),guides=intro.embeds[2].description;
  // Evergreen 12 Nov 2026 (CL2-174): after launch the reservation field is retired and the intro leads with the launch.
  check('the #olympus-info reservation field is retired after launch and the intro says Forever launched',!reservation&&intro.embeds[1].fields.some(f=>f.name==='Launched'),reservation&&reservation.value);
  check('  its community-guides note is tense-neutral',!guides.includes('before launch')&&guides.includes('the released game can differ'));
 });

 console.log('== seat-state wording (CL-322) ==');
 await guard('seat reason',async()=>{
  const seats=load('./guild-seats'),t=Math.floor(Date.now()/1000);
  const state=seats.seatsFrom(directEnv({LINKS_NOT_BEFORE:String(t+3600)}),t,{id:1,member_count:10,exported_at:t-3600,received_at:t-3600,trusted:1,complete:1,first_received_at:t-3600},null),line=seats.seatsStaffLine(state);
  check('the bot staff line for an export before the launch cutoff is plain words, no setting name',state.reason==='before_links'&&!line.includes('LINKS_NOT_BEFORE')&&line.includes('predates the configured verification cutoff'),line);
  const block=(/const SEAT_REASONS = \{([\s\S]*?)\n  \};/.exec(appSource)||[])[1]||'';
  check('  the admin overview reasons name no environment setting',block.includes('before_links')&&!/[A-Z]{2,}_[A-Z_]{2,}/.test(block)&&block.includes('predates the configured verification cutoff'));
  await fixtureRun("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', 10, 'launch228', 1, 1, ?)",t-3600,t-3600,t-3600);
  const admin=await openPage(STAFF,{LINKS_NOT_BEFORE:String(t+3600)});await admin.go('#/admin');
  await waitFor(()=>!!admin.app.querySelector('#overview-seats'),'the overview seat line');
  const seen=admin.app.querySelector('#overview-seats')?.textContent||'';
  check('  the rendered admin overview says so in the same words',seen.includes('predates the configured verification cutoff')&&!seen.includes('LINKS_NOT_BEFORE'),seen);
 });
 console.log('\n'+ok+'/'+n+' passed');process.exit(ok===n?0:1);
}
const run228=new Module(__filename,module);run228.filename=__filename;run228.paths=Module._nodeModulePaths(__dirname);
run228._compile(prefix228+'\n('+launchTransition228.toString()+')().catch(e=>{console.error(e.stack);process.exit(1)});',__filename);
