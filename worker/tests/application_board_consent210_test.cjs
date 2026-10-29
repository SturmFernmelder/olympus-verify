// Real Worker consent-only writes using the original authenticated SQLite and
// Native E2 fixtures. All provider traffic and records are synthetic.
'use strict';
const fs210=require('node:fs'),path210=require('node:path'),crypto210=require('node:crypto'),{Module}=require('node:module');
function prefix210(file,pattern,sha){
 const source=fs210.readFileSync(path210.join(__dirname,file),'utf8'),cuts=[...source.matchAll(pattern)];
 if(cuts.length!==1)throw Error('consent210_original_fixture_boundary');
 const prefix=source.slice(0,cuts[0].index);
 if(crypto210.createHash('sha256').update(prefix).digest('hex')!==sha)throw Error('consent210_original_fixture_drift');
 return prefix;
}
async function workerConsent210(){
 const assert210=require('node:assert/strict');let checks210=0;
 const check210=(name,value)=>{assert210.ok(value,name);checks210++;console.log('PASS '+name);};
 await siteUser(MEMBER,{global_name:'Synthetic applicant'});await character(MEMBER,'Mia One','Player-1-0001');
 await siteUser(OTHER,{global_name:'Synthetic board reader'});await character(OTHER,'Oz Two','Player-1-0002');
 await fixtureRun('UPDATE site_users SET avatar=? WHERE discord_id=?','u:'+'a'.repeat(32),MEMBER);
 const schema210=()=>JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
 const originalSchema210=schema210(),directory210=JSON.stringify(db.prepare("SELECT * FROM site_settings WHERE key='discordDirectoryHidden'").all());
 const data210=JSON.parse(fs.readFileSync(path.join(root,'public/static/talents/data.json'),'utf8')),browser210={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'public/static/talents/calculator.js'),'utf8'),{module:browser210},{timeout:1000});
 const code210=level=>browser210.exports.serializeBuild(data210,browser210.exports.emptyBuild(data210,'mage',level));
 const body210={position:'officer',applicationTrack:'officer',targetOffice:'office_62',backups:[],class:'mage',role:'dps',region:'eu',character:'Mia One',fallback:true,ack:true,board:true,boardPortrait:true,boardTalentBuilds:true,boardApplicationIntent:true,avail:'f'.repeat(42),availTz:'Europe/Stockholm',answers:{experience:'Synthetic prior leadership experience.',why:'Synthetic guild application statement.',leadership:'Led a fictional group through a raid.',scenario:'Listen to each person and apply the agreed rules.',hours:'10to20',voice:'yes',extra:'Private retained answer sentinel.',talentBuilds:{version:1,characters:[{character:'Mia One',class:'mage',build30:code210(30),build60:code210(60)}]}}};
 const flags210=[['boardPortrait','boardPortraitOptIn'],['boardTalentBuilds','boardTalentBuildsOptIn'],['boardApplicationIntent','boardApplicationIntentOptIn']];
 const all210={consentOnly:true,boardPortrait:false,boardTalentBuilds:false,boardApplicationIntent:false};
 const request210=async(method,url,body,who=MEMBER)=>{
  const response=await indexMod.default.fetch(new Request('https://guild.example'+url,{method,headers:{Cookie:await cookieFor(who),Origin:'https://guild.example','X-Olympus':siteCore.PAGE_VERSION,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env(),ctx);
  return{status:response.status,body:await response.json()};
 };
 const row210=()=>one('SELECT * FROM site_applications WHERE discord_id=?',MEMBER);
 const audits210=()=>db.prepare("SELECT * FROM audit WHERE action='site.application_board_consent_withdrawn' ORDER BY id").all();
 const seed210=async()=>{
  const out=await require('./historical_application201_fixture.cjs').historicalApplicationFixture201({validate:load('./site-api').validateApplication,run:fixtureRun,previous:id=>one('SELECT * FROM site_applications WHERE discord_id=?',id),id:MEMBER,payload:body210,time:now});
  assert210.ok(!('error'in out.validation),JSON.stringify(out.validation));
 };
 const board210=async()=>{
  const out=await request210('GET','/api/board/officer',undefined,OTHER);assert210.equal(out.status,200);
  return out.body.candidates.find(row=>row.id===MEMBER);
 };
 await seed210();let card210=await board210();
 check210('historical fixture starts with portrait, two genuine current builds and canonical intent all visible',!!card210.avatarUrl&&card210.talentBuilds.length===2&&card210.applicationIntent?.targetOffice==='office_62');
 for(const [field,stored]of flags210){
  await seed210();const before=row210(),privateBefore=JSON.parse(before.answers),out=await request210('PUT','/api/application',{consentOnly:true,[field]:false}),after=row210();card210=await board210();
  const expected={...privateBefore,[stored]:false},withoutTimes=({answers,updated_at,...rest})=>rest;
  check210(field+' alone clears its projection while retaining both other choices',out.status===200&&JSON.stringify(JSON.parse(after.answers))===JSON.stringify(expected)&&!!card210.avatarUrl===(field!=='boardPortrait')&&card210.talentBuilds.length===(field==='boardTalentBuilds'?0:2)&&!!card210.applicationIntent===(field!=='boardApplicationIntent'));
  check210(field+' does not change roles, status, first board consent, or private application content',JSON.stringify(withoutTimes(before))===JSON.stringify(withoutTimes(after))&&out.body.application.answers[stored]===false);
 }
 await seed210();let out210=await request210('PUT','/api/application',all210);card210=await board210();
 check210('all-clear suppresses every projection but keeps the historical candidate on the board',out210.status===200&&!!card210&&!card210.avatarUrl&&!card210.talentBuilds.length&&!card210.applicationIntent&&row210().status==='submitted'&&row210().board_at>0);
 const stable210=JSON.stringify({row:row210(),audit:audits210()});out210=await request210('PUT','/api/application',all210);
 check210('repeated withdrawal is idempotent without timestamp or audit churn',out210.status===200&&JSON.stringify({row:row210(),audit:audits210()})===stable210);
 await seed210();
 const numeric210=row210().answers.slice(0,-1)+',"unsafeInteger":9007199254740993,"largeExponent":1e400,"preciseDecimal":0.10000000000000000555,"negativeZero":-0.0}';
 await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',numeric210,MEMBER);
 out210=await request210('PUT','/api/application',{consentOnly:true,boardPortrait:false});
 const numericAfter210=row210().answers;
 console.log('PRIVATE_NUMERIC_LEXEME_DIAGNOSTIC '+JSON.stringify({status:out210.status,unsafeIntegerPreserved:numericAfter210.includes('"unsafeInteger":9007199254740993'),exponentPreserved:numericAfter210.includes('"largeExponent":1e400'),decimalPreserved:numericAfter210.includes('"preciseDecimal":0.10000000000000000555'),negativeZeroPreserved:numericAfter210.includes('"negativeZero":-0.0')}));
 check210('consent withdrawal preserves unrelated private JSON numeric lexemes without JS number coercion',out210.status===200&&numericAfter210.includes('"unsafeInteger":9007199254740993')&&numericAfter210.includes('"largeExponent":1e400')&&numericAfter210.includes('"preciseDecimal":0.10000000000000000555')&&numericAfter210.includes('"negativeZero":-0.0')&&JSON.parse(numericAfter210).boardPortraitOptIn===false);
 const invalid210=[{}, {consentOnly:false,boardPortrait:false},{consentOnly:'true',boardPortrait:false},
  {consentOnly:true},{consentOnly:true,boardPortrait:true},{consentOnly:true,boardPortrait:null},
  {consentOnly:true,boardPortrait:0},{consentOnly:true,boardPortrait:false,boardTalentBuilds:true},
  {consentOnly:true,boardPortrait:false,unknown:false},{consentOnly:true,boardPortrait:false,position:'member'},
  {consentOnly:true,boardPortrait:false,answers:{}},{consentOnly:true,boardPortrait:false,discordId:OTHER}];
 for(const payload of invalid210){
  if(!Object.hasOwn(payload,'consentOnly'))continue;
  const before=JSON.stringify({row:row210(),audit:audits210()}),out=await request210('PUT','/api/application',payload);
  check210('strict envelope refuses '+JSON.stringify(payload)+' without mutation',out.status===400&&out.body.error==='invalid'&&JSON.stringify({row:row210(),audit:audits210()})===before);
 }
 let before210=JSON.stringify(row210());out210=await request210('PUT','/api/application',body210);
 check210('normal reserved full-save remains403 and cannot re-enable sharing',out210.status===403&&out210.body.error==='reserved_seat'&&JSON.stringify(row210())===before210);
 out210=await request210('PUT','/api/application',all210,OTHER);
 check210('another signed-in account cannot target this application or create its own via consent-only',out210.status===404&&JSON.stringify(row210())===before210&&!one('SELECT 1 FROM site_applications WHERE discord_id=?',OTHER));
 // Begin a new local request window using the fixture clock, rather than
 // weakening production rate limits for the additional concrete cases.
 const realDate210=globalThis.Date;let clock210=realDate210.now()+61000;
 globalThis.Date=class extends realDate210{static now(){return clock210;}};
 try{
  for(const status of ['reviewing','accepted','declined','withdrawn']){
   await seed210();await fixtureRun('UPDATE site_applications SET status=? WHERE discord_id=?',status,MEMBER);
   const before=row210(),out=await request210('PUT','/api/application',all210),after=row210();
   check210(status+' historical row can only narrow flags without resubmission or role change',out.status===200&&after.status===status&&after.position===before.position&&after.board_at===before.board_at&&flags210.every(([,key])=>JSON.parse(after.answers)[key]===false));
  }
  await seed210();await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('applicationsOpen','false',?)ON CONFLICT(key)DO UPDATE SET value='false'",now);
  out210=await request210('PUT','/api/application',all210);
  check210('closed application admissions do not block the explicit privacy-only reduction',out210.status===200&&flags210.every(([,key])=>JSON.parse(row210().answers)[key]===false));
  await fixtureRun("UPDATE site_settings SET value='true' WHERE key='applicationsOpen'");
  await seed210();const older210=JSON.parse(row210().answers);older210.talentBuilds.characters[0].build30='unreadable-old-private-sentinel';await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify(older210),MEMBER);
  out210=await request210('PUT','/api/application',{consentOnly:true,boardTalentBuilds:false});
  check210('withdrawing consent never reparses or replaces retained old private build contents',out210.status===200&&JSON.parse(row210().answers).talentBuilds.characters[0].build30==='unreadable-old-private-sentinel');
  await seed210();let race210=false;
  HOOKS.afterBatch=async(_i,sqls)=>{if(sqls.some(sql=>sql==='SELECT * FROM site_applications WHERE discord_id = ?1')){HOOKS.afterBatch=null;race210=true;const newer=JSON.parse(row210().answers);newer.extra='Concurrent private edit sentinel.';await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify(newer),MEMBER);}};
  out210=await request210('PUT','/api/application',all210);HOOKS.afterBatch=null;
  check210('snapshot race refuses409 and does not overwrite a concurrent private answer or its flags',race210&&out210.status===409&&out210.body.error==='application_changed'&&JSON.parse(row210().answers).extra==='Concurrent private edit sentinel.'&&flags210.every(([,key])=>JSON.parse(row210().answers)[key]===true));
  for(const [label,sql,value]of [
   ['session revocation','UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',null],
   ['account incarnation replacement','UPDATE site_users SET account_incarnation=? WHERE discord_id=?','e'.repeat(32)]]){
   await seed210();originalCookies.delete(MEMBER);await cookieFor(MEMBER);const original=row210().answers;let fired=false;
   HOOKS.afterBatch=async(_i,sqls)=>{if(sqls.some(q=>q==='SELECT * FROM site_applications WHERE discord_id = ?1')){HOOKS.afterBatch=null;fired=true;if(value===null)await fixtureRun(sql,MEMBER);else await fixtureRun(sql,value,MEMBER);}};
   out210=await request210('PUT','/api/application',all210);HOOKS.afterBatch=null;
   check210(label+' after own-row read fences the withdrawal without changing flags',fired&&out210.status!==200&&row210().answers===original);
  }
  await seed210();originalCookies.delete(MEMBER);const originalCookie210=await cookieFor(MEMBER),expiry210=JSON.parse(Buffer.from(originalCookie210.split('=')[1].split('.')[0],'base64url').toString()).e,original210=row210().answers;let expired210=false;
  HOOKS.afterBatch=async(_i,sqls)=>{if(sqls.some(q=>q==='SELECT * FROM site_applications WHERE discord_id = ?1')){HOOKS.afterBatch=null;expired210=true;db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unexpected synthetic clock');return String(expiry210);});}};
  out210=await request210('PUT','/api/application',all210);HOOKS.afterBatch=null;
  check210('original cookie expiry is checked against the database clock at the actual write',expired210&&out210.status!==200&&row210().answers===original210);
  db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unexpected synthetic clock');return String(Math.floor(clock210/1000));});
 await seed210();
 const duplicate210=row210().answers.slice(0,-1)+',"boardPortraitOptIn":true}';
 await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',duplicate210,MEMBER);
 out210=await request210('PUT','/api/application',{consentOnly:true,boardPortrait:false});
 check210('ambiguous duplicate consent keys cannot report withdrawal while a later true key remains',out210.status===409&&out210.body.error==='application_changed'&&row210().answers===duplicate210);
 for(const malformed of ['[]','null','{not-json']){
  await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',malformed,MEMBER);
  const out=await request210('PUT','/api/application',all210);
  console.log('STORED_ANSWER_DIAGNOSTIC '+JSON.stringify({malformed,status:out.status,error:out.body.error}));
  check210('malformed stored answers '+malformed+' refuse without replacing historical content',out.status===409&&out.body.error==='application_changed'&&row210().answers===malformed);
 }
 const legacy210=JSON.stringify({extra:'Unchanged legacy private answer'});
 await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',legacy210,MEMBER);
 const noAuthority210=JSON.stringify({row:row210(),audit:audits210()});out210=await request210('PUT','/api/application',all210);
 check210('legacy missing flags imply no publication and no flag insertion or timestamp churn',out210.status===200&&JSON.stringify({row:row210(),audit:audits210()})===noAuthority210);
 check210('consent-only path adds no schema objects or directory/appointment/role side effect',schema210()===originalSchema210&&JSON.stringify(db.prepare("SELECT * FROM site_settings WHERE key='discordDirectoryHidden'").all())===directory210&&!one('SELECT 1 FROM role_settlements'));
 const out={checks:checks210,passed:checks210};console.log(JSON.stringify({scope:'consent210-real-worker',...out,provider:'synthetic only'}));db.close();return out;
 }finally{globalThis.Date=realDate210;HOOKS.afterBatch=null;}
}
async function nativeConsent210(){
 const outcomes210=[];let local210=0;
 const assertCase210=(label,value)=>{assert.ok(value,label);local210++;console.log('PASS '+label);};
 for(const nativeEnabled of ['true','false']){
  const f=fixture();try{
   const cookie=await f.signIn(ID);await f.signIn(OTHER);await seedPersonal(f,{roles:0});
   const beforeSchema=JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
   const history={applicationTrack:'high_council',targetOffice:'office_03',boardPortraitOptIn:true,boardTalentBuildsOptIn:true,boardApplicationIntentOptIn:true,extra:'Native private sentinel.'};
   await f.write("UPDATE site_applications SET position='office_03',answers=?,board_at=?,status='reviewing' WHERE discord_id=?",JSON.stringify(history),clock,ID);
   f.env.PRIVACY_NATIVE_ERASURE_ENABLED=nativeEnabled;
   f.env.PRIVACY_ERASURE_ENABLED=nativeEnabled;
   const keys=[['boardPortrait','boardPortraitOptIn'],['boardTalentBuilds','boardTalentBuildsOptIn'],['boardApplicationIntent','boardApplicationIntentOptIn']];
   for(let mask=1;mask<8;mask++){
    const raw=JSON.stringify(history).slice(0,-1)+',"unsafeInteger":9007199254740993,"largeExponent":1e400,"preciseDecimal":0.10000000000000000555,"negativeZero":-0.0}';
    await f.write('UPDATE site_applications SET answers=? WHERE discord_id=?',raw,ID);
    const payload={consentOnly:true};keys.forEach(([field],i)=>{if(mask&(1<<i))payload[field]=false;});
    const out=await f.call('PUT','/api/application',{cookie,body:payload}),stored=f.raw('SELECT * FROM site_applications WHERE discord_id=?',ID),answers=JSON.parse(stored.answers);
    assertCase210('Native erasure '+nativeEnabled+' mask'+mask+' admits its closed JSON1 constructor and preserves private numeric lexemes',out.status===200&&stored.status==='reviewing'&&stored.position==='office_03'&&answers.extra===history.extra&&keys.every(([,field],i)=>answers[field]===!(mask&(1<<i)))&&stored.answers.includes('"unsafeInteger":9007199254740993')&&stored.answers.includes('"largeExponent":1e400')&&stored.answers.includes('"preciseDecimal":0.10000000000000000555')&&stored.answers.includes('"negativeZero":-0.0'));
    outcomes210.push({nativeEnabled,mask,status:out.status});
   }
   assertCase210('Native '+nativeEnabled+' preserves schema, epoch, admission slot and OFF controls',JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))===beforeSchema&&f.raw('SELECT epoch,active,nonce,purpose FROM privacy_write_admission').epoch===EPOCH&&f.raw('SELECT active FROM privacy_write_admission').active===0&&f.env.BETA_RESET_REMOVALS_ENABLED==='false'&&f.floorCalls===0);
  }finally{f.close();}
 }
 for(const mode of ['wrong_epoch','admission_off','retiring_generation','legacy_erasure_without_native']){
  const f=fixture();try{
   const cookie=await f.signIn(ID);await seedPersonal(f,{roles:0});const history={boardPortraitOptIn:true,extra:'Held Native sentinel.'};
   await f.write('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify(history),ID);
   const original=f.raw('SELECT answers FROM site_applications WHERE discord_id=?',ID).answers;
   if(mode==='wrong_epoch')f.env.PRIVACY_WRITE_ADMISSION_EPOCH='b'.repeat(32);
   if(mode==='admission_off')f.env.PRIVACY_WRITE_ADMISSION_ENABLED='false';
   if(mode==='legacy_erasure_without_native')f.env.PRIVACY_NATIVE_ERASURE_ENABLED='false';
   if(mode==='retiring_generation'){await f.write("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'retiring',1,?,?)ON CONFLICT(subject_id)DO UPDATE SET state='retiring'",ID,'c'.repeat(32),clock,clock);}
   const out=await f.call('PUT','/api/application',{cookie,body:{consentOnly:true,boardPortrait:false}});
   assertCase210(mode+' retains its original refusal and never changes application sharing',out.status!==200&&f.raw('SELECT answers FROM site_applications WHERE discord_id=?',ID).answers===original);
   outcomes210.push({mode,status:out.status});
  }finally{f.close();}
 }
 console.log(JSON.stringify({scope:'consent210-native-modes',checks:local210,passed:local210,outcomes:outcomes210,liveProviderRequests:0}));
 return{checks:local210,passed:local210,outcomes:outcomes210};
}
module.exports=(async()=>{
 const front=prefix210('frontend_check.cjs',/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g,'bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5');
 const ordinary=new Module(__filename,module);ordinary.filename=__filename;ordinary.paths=Module._nodeModulePaths(__dirname);ordinary._compile(front+'\nmodule.exports=('+workerConsent210.toString()+')();',__filename);const worker=await ordinary.exports;
 const nativePrefix=prefix210('privacy_native_erasure_mode_test.cjs',/\(async\(\)=>\{\r?\n \/\/ \.174:/g,'83b4fe71835e987ede23c482568ab067ce84700b51cca4b4efac6119f262896a');
 const native=new Module(__filename,module);native.filename=__filename;native.paths=Module._nodeModulePaths(__dirname);native._compile(nativePrefix+'\nmodule.exports=('+nativeConsent210.toString()+')();',__filename);return{worker,native:await native.exports};
})();
if(require.main===module)module.exports.catch(error=>{console.error(error.stack);process.exitCode=1;});
