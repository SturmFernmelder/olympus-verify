// .201 reserves new appointment requests; .219 permits owners to edit the exact
// retained open selection with a current editor token. Real Worker and original
// Native E2 SQLite/OAuth fixtures; only Discord HTTP is synthetic.
'use strict';
const fs201=require('node:fs'),path201=require('node:path'),crypto201=require('node:crypto'),{Module}=require('node:module');
const fixtureHash201=source=>crypto201.createHash('sha256').update(source).digest('hex');

// c9bab11 changed the shared staff decision transport. Reverse only that exact
// fixture hunk for the historical seal, and compile the actual current prefix.
function historicalSitePrefix201(current) {
  const beforePrepare="    if(!h.has('X-Olympus-Decision-Action'))h.set('X-Olympus-Decision-Action',action);\n";
  const currentPrepare="    const explicitAction=h.has('X-Olympus-Decision-Action');\n"
    +"    if(!explicitAction)h.set('X-Olympus-Decision-Action',action);\n";
  const beforeResponse="      if(typeof prepared.targetToken!=='string')throw Error('actual decision target preparation held');\n"
    +"      h.set('X-Olympus-Decision-Target',prepared.targetToken);\n";
  const currentResponse="      if(typeof prepared.targetToken==='string')h.set('X-Olympus-Decision-Target',prepared.targetToken);\n"
    +"      if(!explicitAction)h.set('X-Olympus-Decision-Action',prepared.decisionAction);\n";
  if(Buffer.byteLength(current)!==15656 || fixtureHash201(current)!=='b8ee01e190642c195e1a19b825c04ccc637246dace1dcd225109099b6f98ed43')
    throw Error('reserved201_current_site_fixture_drift');
  if(current.split(currentPrepare).length!==2 || current.split(currentResponse).length!==2)
    throw Error('reserved201_site_fixture_context');
  return current.replace(currentPrepare,beforePrepare).replace(currentResponse,beforeResponse);
}

function prefix201(file,pattern,pin) {
  const source=fs201.readFileSync(path201.join(__dirname,file),'utf8');
  const cuts=[...source.matchAll(pattern)];
  if(cuts.length!==1)throw Error('reserved201_original_fixture_boundary');
  const prefix=source.slice(0,cuts[0].index);
  const historical=file==='privacy_native_erasure_mode_test.cjs'
    ? require('./frontend_fixture_prefix217.cjs').historicalBoardNativePrefix217(prefix)
    : historicalSitePrefix201(prefix);
  if(fixtureHash201(historical)!==pin)throw Error('reserved201_original_fixture_drift');
  return prefix;
}

async function worker201(){
 call=require("./application_editor219_fixture.cjs").currentApplicationCall219(call);
 const intent=load('./application-track199'),catalogue=load('./governance-offices'),ID='300000000000000001';
 const originalSchema=JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all());
 const base={position:'member',backups:[],class:'warrior',role:'dps',region:'eu',character:'Reserved Tester',avail:'f'.repeat(42),availTz:'Europe/Stockholm',fallback:true,board:false,ack:true,answers:{experience:'A synthetic membership experience.',why:'Join a fictional guild community.',leadership:'Led a fictional group through an encounter.',scenario:'Listen and apply the agreed rules.',hours:'10to20',voice:'yes'}};
 const row=()=>db.prepare('SELECT * FROM site_applications WHERE discord_id=?').get(ID);
 const state=()=>JSON.stringify({applications:db.prepare('SELECT * FROM site_applications ORDER BY discord_id').all(),audit:db.prepare("SELECT * FROM audit WHERE action LIKE 'site.application_%' ORDER BY id").all(),appointments:db.prepare("SELECT * FROM site_settings WHERE key='appointed'").all(),settlements:db.prepare('SELECT * FROM role_settlements').all()});
 const send=async payload=>{T+=61;const response=await call('PUT','/api/application',{who:ID,body:payload});return{response,body:await J(response)};};
 const refuse=async(label,payload,field)=>{const before=state();let prepared=0;PREPARE_HOOK=sql=>{if(/(?:INSERT INTO|UPDATE|DELETE FROM) site_applications|INSERT INTO audit/.test(sql))prepared++;};const result=await send(payload);PREPARE_HOOK=null;check(label+' refuses before an application/audit write and preserves all existing rows',result.response.status===403&&result.body?.error==='reserved_seat'&&(!field||result.body.field===field)&&prepared===0&&state()===before,result.response.status,result.body);};
 const signedIn=await signIn(ID);if(signedIn.status!==303||!jar.get(ID))throw Error('original OAuth fixture did not issue the session');
 const providerAfterLogin=D.calls.length;
 for(const position of ['co_gm','guild_master','officer','raid_leader_na','raid_leader_eu','raid_assist_na','raid_assist_eu','raid_leader','raid_assist','class_lead','recruitment','community','leveling','pvp_leader','liaison','loot_council','treasurer','professions','moderator'])await refuse('legacy primary '+position,{...base,position,classLead:'mage',board:true},'position');
 const reserved=catalogue.OFFICE_APPOINTMENTS.filter(o=>['leader','high_council','officer_corps'].includes(o.tier));
 check('reserved guard covers the complete current Leader, High Council and Officer Corps catalogue',reserved.length>90&&reserved.every(o=>intent.reservedApplication201({targetOffice:o.key})?.error==='reserved_seat'));
 for(const office of reserved)await refuse('canonical exact target '+office.key,{...base,applicationTrack:'member',targetOffice:office.key},'targetOffice');
 for(const cls of data.CLASSES)await refuse('class-specific legacy backup '+cls.key,{...base,backups:['class_lead:'+cls.key]},'backups');
 for(const key of ['raid_leader_na','raid_leader_eu','raid_assist_na','raid_assist_eu','raid_leader','raid_assist','officer','co_gm','treasurer','office_03','office_62']){
  await refuse('first backup '+key,{...base,backups:[key]},'backups');
  await refuse('second backup '+key,{...base,backups:['raider',key]},'backups');
 }
 for(const track of ['officer','high_council']){
  await refuse('top-level reserved '+track,{...base,applicationTrack:track,targetOffice:track==='officer'?'office_62':'office_03'},'applicationTrack');
  await refuse('nested reserved '+track,{...base,answers:{...base.answers,applicationTrack:track,targetOffice:track==='officer'?'office_62':'office_03'}},'applicationTrack');
  await refuse('conflicting nested reserved '+track,{...base,applicationTrack:'member',targetOffice:null,answers:{...base.answers,applicationTrack:track,targetOffice:track==='officer'?'office_62':'office_03'}},'applicationTrack');
 }
 await refuse('safe direct intent cannot hide a reserved nested office',{...base,applicationTrack:'member',targetOffice:null,answers:{...base.answers,targetOffice:'office_03'}},'targetOffice');
 for(const [key,value]of [['firstChoice','officer'],['backup1','raid_leader_na'],['backup2','class_lead:mage']]){
  await refuse('explicit legacy '+key,{...base,[key]:value},key==='firstChoice'?'firstChoice':'backups');
  await refuse('nested legacy '+key,{...base,answers:{...base.answers,[key]:value}},key==='firstChoice'?'firstChoice':'backups');
 }
 let result=await send({...base,position:'pvp_team'});
 check('legacy non-leadership PvP Team membership remains available before any selected track',result.response.status===200&&row().position==='pvp_team');
 // Owner ruling of 14 Nov 2026 ("No, three choices only"): Guild Member, Raider and Artisan (office_07) are the choices.
 for(const [track,position,targetOffice]of [['member','member',null],['raider','raider',null],['artisan','member','office_07']]){
  const result=await send({...base,position,applicationTrack:track,targetOffice});
  check(track+' current eligible application saves through the original Worker',result.response.status===200&&JSON.parse(row().answers).applicationTrack===track&&JSON.parse(row().answers).targetOffice===targetOffice,result.response.status,result.body);
 }
 for(const [track,position,targetOffice]of [['raider','raider','office_25'],['artisan','member','office_27']]){
  const before=state(),result=await send({...base,position,applicationTrack:track,targetOffice});
  check(track+'/'+targetOffice+' (no separate application since 14 Nov 2026) is refused with field targetOffice and changes no row',result.response.status===400&&result.body?.field==='targetOffice'&&state()===before,result.response.status,result.body);
 }
 result=await send({...base,backups:['raider','pvp_team']});
 check('ordinary membership retains both non-leadership backups',result.response.status===200&&row().backup1==='raider'&&row().backup2==='pvp_team');
 result=await send({...base,applicationTrack:'patron',targetOffice:null});
 check('reserved policy does not weaken the existing Royal Writs OFF gate',result.response.status===403&&result.body?.error==='royal_writs_paused');
 // Establish historical data by a fixture write, never by disabling the current
 // admission rule or pretending the new endpoint accepted a reserved request.
 const history={...JSON.parse(row().answers),applicationTrack:'high_council',targetOffice:'office_03',boardApplicationIntentOptIn:true};
 await fixtureRun("UPDATE site_applications SET position='office_03',backup1='officer',backup2='class_lead:mage',board_at=?,answers=? WHERE discord_id=?",T,JSON.stringify(history),ID);
 const beforeHistory=JSON.stringify(row());
 for(const route of ['/api/me','/api/me/export']){const response=await call('GET',route,{who:ID}),body=await J(response),application=route.endsWith('export')?body?.site?.application:body?.application;check('historical reserved application remains available in '+route,response.status===200&&application?.position==='office_03'&&application?.answers.applicationTrack==='high_council'&&application?.answers.targetOffice==='office_03'&&JSON.stringify(row())===beforeHistory);}
 check('canonical historical DTO preserves its exact reserved track and office',JSON.stringify(intent.applicationIntentDto199(history))===JSON.stringify({applicationTrack:'high_council',targetOffice:'office_03'}));
 await refuse('omitted legacy intent carries and refuses the original reserved selection',{...base},'applicationTrack');
 check('failed legacy edit never silently converts or deletes the historical reserved payload',JSON.stringify(row())===beforeHistory);
 await refuse('safe primary still refuses a reserved backup',{...base,applicationTrack:'member',targetOffice:null,backups:['officer']},'backups');
 result=await send({...base,applicationTrack:'member',targetOffice:null});
 check('explicit eligible replacement can be saved without retaining old reserved backups',result.response.status===200&&row().position==='member'&&!row().backup1&&!row().backup2&&JSON.parse(row().answers).applicationTrack==='member'&&JSON.parse(row().answers).targetOffice===null);
 await fixtureRun("UPDATE site_applications SET position='raid_leader_na',answers=? WHERE discord_id=?",JSON.stringify({...history,applicationTrack:'officer',targetOffice:'office_74'}),ID);
 T+=61;const withdrawn=await call('DELETE','/api/application',{who:ID});
 check('historical reserved application can still be withdrawn through the original route',withdrawn.status===200&&row().status==='withdrawn'&&row().position==='raid_leader_na'&&JSON.parse(row().answers).targetOffice==='office_74');
 check('no reserved check adds schema objects or provider activation settings',JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all())===originalSchema&&!db.prepare("SELECT 1 FROM site_settings WHERE key IN ('TREASURY_COSMETIC_ENABLED','ARMY_SITE_AGGREGATE_ENABLED','LINK_ENABLED')").get());
 check('synthetic admission requests do not grant roles or dispatch provider mutations',D.calls.slice(providerAfterLogin).every(c=>c.startsWith('GET ')));
 const out={checks:n,passed:ok};globalThis.Date=RealDate;db.close();console.log(JSON.stringify({scope:'reserved201-real-worker',...out,liveProviderRequests:0}));if(ok!==n)throw Error('reserved201_worker_checks_failed');return out;
}

async function native201(){
 const f=fixture();try{
  const cookie=await f.signIn(ID),otherCookie=await f.signIn(OTHER);await seedPersonal(f,{roles:0});
  const originalSchema=JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
  const history={applicationTrack:'high_council',targetOffice:'office_03',boardApplicationIntentOptIn:true,extra:'Historical reserved Native .201 sentinel.'};
  await f.write("UPDATE site_applications SET position='office_03',answers=?,status='reviewing',admin_note='Retained staff review sentinel.',reviewed_by=?,reviewed_at=? WHERE discord_id=?",JSON.stringify(history),OTHER,clock-20,ID);
  const before=f.raw('SELECT * FROM site_applications WHERE discord_id=?',ID),beforeBytes=JSON.stringify(before);
  const payload={position:'office_03',applicationTrack:'high_council',targetOffice:'office_03',backups:[],class:'warrior',role:'dps',region:'eu',character:'Native Target',fallback:true,ack:true,board:true,avail:'f'.repeat(42),answers:{experience:'Synthetic Native reserved experience.',why:'Synthetic Native reserved service.',leadership:'Led a fictional group through a raid.',scenario:'Listen to each person and apply the agreed rules.',hours:'10to20',voice:'yes',extra:history.extra}};
  const opened=await f.call('GET','/api/me',{cookie}),openedBody=await opened.json();
  check('Native retained editor obtains its real own exact-content token',opened.status===200&&typeof openedBody.application?.editToken==='string');
  const editToken=openedBody.application.editToken;
  const missing=await f.call('PUT','/api/application',{cookie,body:payload}),missingBody=await missing.json();
  check('Native retained reserved edit without its editor token refuses without changing the row',missing.status===409&&missingBody.error==='stale_application'&&JSON.stringify(f.raw('SELECT * FROM site_applications WHERE discord_id=?',ID))===beforeBytes);
  const rearranged=await f.call('PUT','/api/application',{cookie,body:{...payload,targetOffice:'office_04',editToken}}),rearrangedBody=await rearranged.json();
  check('Native retained edit cannot replace its reserved seat with a different reserved request',rearranged.status===403&&rearrangedBody.error==='reserved_seat'&&JSON.stringify(f.raw('SELECT * FROM site_applications WHERE discord_id=?',ID))===beforeBytes);
  const fresh=await f.call('PUT','/api/application',{cookie:otherCookie,body:{...payload,editToken:null}}),freshBody=await fresh.json();
  check('Native new reserved request cannot create another account application or change the retained row',fresh.status===403&&freshBody.error==='reserved_seat'&&!f.raw('SELECT 1 FROM site_applications WHERE discord_id=?',OTHER)&&JSON.stringify(f.raw('SELECT * FROM site_applications WHERE discord_id=?',ID))===beforeBytes);
  const saved=await f.call('PUT','/api/application',{cookie,body:{...payload,editToken}}),savedBody=await saved.json(),after=f.raw('SELECT * FROM site_applications WHERE discord_id=?',ID);
  check('actual Native-ON retained reserved edit preserves creation time, reserved intent and staff review history',saved.status===200&&savedBody.application.position==='office_03'&&JSON.parse(after.answers).applicationTrack==='high_council'&&JSON.parse(after.answers).targetOffice==='office_03'&&after.created_at===before.created_at&&after.status===before.status&&after.admin_note===before.admin_note&&after.reviewed_by===before.reviewed_by&&after.reviewed_at===before.reviewed_at);
  const ordinary=await f.call('GET','/api/me/export',{cookie}),own=await ordinary.json();
  check('Native own-copy retains original historical High Council intent',ordinary.status===200&&own.site.application.answers.applicationTrack==='high_council'&&own.site.application.answers.targetOffice==='office_03');
  const entryPage=await f.call('GET','/privacy/access'),entryHtml=await entryPage.text(),entryMatch=/name="csrf" value="([^"]+)"/.exec(entryHtml);
  assert.equal(entryPage.status,200,'actual privacy connection form');assert.ok(entryMatch,'actual privacy connection CSRF');
  const entryCookie=Object.entries(cookies(entryPage)).map(([k,v])=>k+'='+v).join('; ');
  const start=await f.call('POST','/privacy/signin',{cookie:entryCookie,form:{csrf:entryMatch[1]}});assert.equal(start.status,303,'actual privacy authorization redirect');
  const u=new URL(start.headers.get('Location')),flowCookie=Object.entries(cookies(start)).map(([k,v])=>k+'='+v).join('; ');
  const callback=await f.call('GET','/privacy/callback?code=code-'+ID+'&state='+encodeURIComponent(u.searchParams.get('state'))+'&iss=https%3A%2F%2Fdiscord.com',{cookie:flowCookie});
  const privacyCookie=Object.entries(cookies(callback)).filter(([k])=>!k.includes('state')).map(([k,v])=>k+'='+v).join('; ');
  const page=await f.call('GET','/privacy/access',{cookie:privacyCookie}),html=await page.text(),form=/<form method="post" action="\/privacy\/access\/export">([\s\S]*?)<\/form>/.exec(html);assert.ok(form,'actual identify export form');
  const csrf=/name="csrf" value="([^"]+)"/.exec(form[1])[1],grant=/name="grant" value="([^"]+)"/.exec(form[1])[1],statementStart=f.physicalStatements,pending=[];
  const copied=await index.fetch(new Request(BASE+'/privacy/access/export',{method:'POST',headers:{Cookie:privacyCookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,grant})}),f.env,{waitUntil(p){pending.push(Promise.resolve(p));}});for(const p of pending)await p;const identified=await copied.json(),measured=f.physicalStatements-statementStart;
  check('fresh identify-only copy preserves the original reserved intent under original identity authority',copied.status===200&&identified.identity.discordId===ID&&identified.identity.authority==='fresh_identify_only'&&identified.site.application.answers.applicationTrack==='high_council'&&identified.site.application.answers.targetOffice==='office_03');
  check('full identify-copy remains strictly below 100 physical statements',measured<100);console.log('MEASURED_RESERVED201_IDENTIFY '+JSON.stringify({physicalStatements:measured,strictMaximumExclusive:100}));
  const out=await request(f,cookie);check('original Native erasure request remains admitted for historical reserved metadata',out.response.status===202&&out.body.operationId===OP);const job=await finish(f);
  check('actual Native cleanup erases the entire old reserved application and account',job?.state==='complete'&&!f.raw('SELECT 1 FROM site_applications WHERE discord_id=?',ID)&&!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',ID));
  check('reserved admission preserves Native schema, epoch, OFF controls and another account',JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))===originalSchema&&f.raw('SELECT epoch FROM privacy_write_admission').epoch===EPOCH&&f.env.BETA_RESET_REMOVALS_ENABLED==='false'&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',OTHER)&&f.floorCalls===0);
  const result={checks,passed:checks,identifyStatements:measured};console.log(JSON.stringify({scope:'reserved201-native-e2',...result,liveProviderRequests:0}));return result;
 }finally{f.close();}
}

module.exports=(async()=>{
 const ordinary=prefix201('site_test.cjs',/^\(async \(\) => \{\r?\n  console\.log\("== \.213: the original site JSON limit applies during consumption =="\);/gm,'b36638dea6d0ea089fd0603959aa4d92a61b1bd096ad87509af027740d9606fc');
 const worker=new Module(__filename,module);worker.filename=__filename;worker.paths=Module._nodeModulePaths(__dirname);worker._compile(ordinary+'\nmodule.exports=('+worker201.toString()+')();',__filename);const workerResult=await worker.exports;
 const nativePrefix=prefix201('privacy_native_erasure_mode_test.cjs',/\(async\(\)=>\{\r?\n \/\/ \.174:/g,'83b4fe71835e987ede23c482568ab067ce84700b51cca4b4efac6119f262896a');
 const native=new Module(__filename,module);native.filename=__filename;native.paths=Module._nodeModulePaths(__dirname);native._compile(nativePrefix+'\nmodule.exports=('+native201.toString()+')();',__filename);return{worker:workerResult,native:await native.exports};
})();
if(require.main===module)module.exports.catch(error=>{console.error(error.stack);process.exitCode=1;});
