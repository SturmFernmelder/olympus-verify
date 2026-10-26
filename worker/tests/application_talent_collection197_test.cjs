// Actual Worker, original authenticated fixture and admitted SQLite. Discord alone is synthetic.
// .201: leadership admissions are closed. These are explicit pre-policy rows
// validated by the real historical parser, then read through the real board,
// own-copy and withdrawal routes. They are not new API applications or consent.
// This leaf performs no browser, provider, game or production operation.
const fs197=require('node:fs'),path197=require('node:path'),crypto197=require('node:crypto'),{Module}=require('node:module');
const helper197=fs197.readFileSync(path197.join(__dirname,'frontend_check.cjs'),'utf8'),starts197=[...helper197.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(starts197.length!==1)throw Error('talent197_original_frontend_setup_boundary');
const prefix197=helper197.slice(0,starts197[0].index);
if(crypto197.createHash('sha256').update(prefix197).digest('hex')!=='7b72fd253e127dfa0379b0528adb5a05c9ae8e92655fd6c9b2e468ce201300f1')throw Error('talent197_original_frontend_setup_drift');
async function applicationTalentCollection197(){
 await siteUser(MEMBER,{global_name:'Mia'});await character(MEMBER,'Mia One','Player-1-0001');
 await siteUser(OTHER,{global_name:'Oz'});await character(OTHER,'Oz Two','Player-1-0002');
 const schemaBefore=JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
 const data=JSON.parse(fs.readFileSync(path.join(root,'public/static/talents/data.json')));
 const code=(cls,level)=>'ot1.'+data.revision+'.'+cls+'.'+level+'.'+'0'.repeat(data.classes.find(c=>c.id===cls).trees.flatMap(t=>t.talents).length);
 const collection=()=>({version:1,characters:[['Mia One','warrior'],['Mia Two','mage'],['Mia Three','druid']].map(([character,cls])=>({character,class:cls,build30:code(cls,30),build60:code(cls,60)}))});
 const privateCode=code('warrior',59),privateText='Private leadership-only talent fixture sentinel.';
 const body={position:'officer',backups:[],class:'warrior',role:'dps',region:'eu',character:'Mia One',fallback:true,ack:true,board:true,avail:'f'.repeat(42),availTz:'Europe/Stockholm',answers:{experience:'A synthetic original application.',why:'A fictional guild application.',leadership:'Led a fictional group through a raid.',scenario:'Hear the group and follow the agreed loot rules.',hours:'10to20',voice:'yes',extra:privateText,logs:'https://private.example/own-log',talentBuild:privateCode,talentBuilds:collection()}};
 const request=async(method,url,payload,who=MEMBER)=>{const response=await indexMod.default.fetch(new Request('https://guild.example'+url,{method,headers:{Cookie:await cookieFor(who),Origin:'https://guild.example','X-Olympus':siteCore.PAGE_VERSION,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env(),ctx);return {response,body:await response.clone().json().catch(()=>null)};};
 const historicalFixture197=async(payload,who=MEMBER)=>{
  const fixture=await require('./historical_application201_fixture.cjs').historicalApplicationFixture201({validate:load('./site-api').validateApplication,run:fixtureRun,previous:id=>one('SELECT * FROM site_applications WHERE discord_id=?',id),id:who,payload,time:now});
  if('error' in fixture.validation)return{...fixture,body:fixture.validation};
  return{...await request('GET','/api/me',undefined,who),...fixture};
 };
 const stored=()=>{const row=one('SELECT answers,board_at,status FROM site_applications WHERE discord_id=?',MEMBER);return row?{...row,answers:JSON.parse(row.answers)}:null;};
 const candidate=async()=>{const r=await request('GET','/api/board/officer',undefined,OTHER);check('original eligible reader is admitted to the actual officer board',r.response.status===200);return r.body?.candidates?.find(row=>row.id===MEMBER);};
 // Fresh, currently eligible application writes keep direct Worker coverage for
 // the collection itself. Board publication is historical-only for these seats.
 const raiderOwner201='300000000000002011';await siteUser(raiderOwner201,{global_name:'Current Raider'});await character(raiderOwner201,'Raider One','Player-201-0011');
 const raiderCollection201=collection();raiderCollection201.characters[0].character='Raider One';
 const raiderBody201={...body,position:'raider',character:'Raider One',applicationTrack:'raider',targetOffice:null,board:false,boardTalentBuilds:true,answers:{...body.answers,talentBuilds:raiderCollection201}};
 let current201=await request('PUT','/api/application',raiderBody201,raiderOwner201);
 const currentRow201=()=>one('SELECT answers,board_at,status FROM site_applications WHERE discord_id=?',raiderOwner201);
 check('current Raider route really stores all six private collection builds without board authority',current201.response.status===200&&JSON.stringify(JSON.parse(currentRow201().answers).talentBuilds)===JSON.stringify(raiderCollection201)&&JSON.parse(currentRow201().answers).boardTalentBuildsOptIn===false&&currentRow201().board_at===null);
 const currentCopy201=await request('GET','/api/me/export',undefined,raiderOwner201);
 check('current Raider owned copy returns the full privately saved character collection',currentCopy201.response.status===200&&JSON.stringify(currentCopy201.body.site.application.answers.talentBuilds)===JSON.stringify(raiderCollection201));
 const beforeCurrent201=JSON.stringify(currentRow201()),badCurrent201=JSON.parse(JSON.stringify(raiderCollection201));badCurrent201.characters[1].build60=code('priest',60);
 current201=await request('PUT','/api/application',{...raiderBody201,answers:{...raiderBody201.answers,talentBuilds:badCurrent201}},raiderOwner201);
 check('current Raider route refuses a class-code mismatch without changing the saved collection',current201.response.status===400&&current201.body?.field==='talentBuilds'&&JSON.stringify(currentRow201())===beforeCurrent201);
 current201=await request('DELETE','/api/application',undefined,raiderOwner201);
 check('current Raider collection application withdraws through the ordinary route',current201.response.status===200&&currentRow201().status==='withdrawn');
 let r=await request('PUT','/api/application',body);
 check('current reserved Officer submission refuses before creating the historical compatibility fixture',r.response.status===403&&r.body?.error==='reserved_seat'&&!one('SELECT 1 FROM site_applications WHERE discord_id=?',MEMBER));
 r=await historicalFixture197(body);
 check('historical parser fixture retains six current builds on three explicit application characters privately',r.response.status===200&&JSON.stringify(stored().answers.talentBuilds)===JSON.stringify(collection())&&stored().answers.boardTalentBuildsOptIn===false);
 check('declared alts do not create verified character records or permissions',!one('SELECT 1 FROM characters WHERE name IN (?,?)','Mia Two','Mia Three'));
 let card=await candidate();
 check('ordinary board consent never infers named-build sharing',card?.talentBuilds?.length===0&&!JSON.stringify(card).includes('Mia Two')&&!JSON.stringify(card).includes(privateCode)&&!JSON.stringify(card).includes(privateText));
 r=await historicalFixture197({...body,answers:{...body.answers,boardTalentBuildsOptIn:true}});
 check('client answers cannot forge the server-managed build sharing flag',r.response.status===200&&stored().answers.boardTalentBuildsOptIn===false&&(await candidate())?.talentBuilds?.length===0);
 r=await historicalFixture197({...body,boardTalentBuilds:true});card=await candidate();
 check('historical explicitly opted-in row exposes exactly six minimal class-level-code-character records',r.response.status===200&&stored().answers.boardTalentBuildsOptIn===true&&card?.talentBuilds?.length===6&&card.talentBuilds.every(row=>Object.keys(row).sort().join('|')==='character|class|code|level')&&card.talentBuilds.map(row=>row.level).join(',')==='30,60,30,60,30,60');
 check('shared build cards still exclude private single attachment, logs, extra answers and general character field',!Object.hasOwn(card,'character')&&!Object.hasOwn(card.answers,'talentBuilds')&&!Object.hasOwn(card.answers,'talentBuild')&&!Object.hasOwn(card.answers,'boardTalentBuildsOptIn')&&!JSON.stringify(card).includes(privateCode)&&!JSON.stringify(card).includes(privateText)&&!JSON.stringify(card).includes('private.example'));
 const own=await request('GET','/api/me/export');
 check('the original own-copy application includes all six private stored builds and separate consent',own.response.status===200&&own.body.site?.application?.answers?.talentBuilds?.characters?.length===3&&own.body.site.application.answers.boardTalentBuildsOptIn===true&&own.body.site.application.answers.talentBuild===privateCode);
 check('collection remains under its2048byte cap and selected application copy under original131072bytes',Buffer.byteLength(JSON.stringify(stored().answers.talentBuilds))<=2048&&Buffer.byteLength(JSON.stringify(own.body.site.application))<131072);
 const beforeMalformed=JSON.stringify(stored());
 for(const value of ['true',1,null]){r=await historicalFixture197({...body,boardTalentBuilds:value});check('nonboolean sharing '+JSON.stringify(value)+' is refused without a write',r.validation?.error==='invalid'&&r.body?.field==='boardTalentBuilds'&&JSON.stringify(stored())===beforeMalformed);}
 for(const mutate of [v=>v.characters.push({...v.characters[2],character:'Mia Four'}),v=>v.characters[1].character='mia one',v=>v.characters[0].build30=code('warrior',29),v=>v.characters[1].build60=code('priest',60),v=>v.characters[0].discordId=OTHER]){const v=collection();mutate(v);r=await historicalFixture197({...body,answers:{...body.answers,talentBuilds:v}});check('invalid bound, duplicate, level, class or extra field is refused atomically',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeMalformed);}
 r=await historicalFixture197({...body,character:'Mia Four'});
 check('the collection cannot silently follow a changed application primary character',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeMalformed);
 r=await historicalFixture197({...body,boardTalentBuilds:false});
 check('historical unchecked fixture keeps private collection and original board consent while suppressing builds',r.response.status===200&&stored().answers.boardTalentBuildsOptIn===false&&stored().board_at>0&&stored().answers.talentBuilds.characters.length===3&&(await candidate())?.talentBuilds?.length===0);
 await historicalFixture197({...body,boardTalentBuilds:true});const oldClient={...body,answers:{...body.answers}};delete oldClient.answers.talentBuilds;
 r=await historicalFixture197(oldClient);
 check('old client omission keeps private builds but cannot keep prior sharing authority',r.response.status===200&&stored().answers.talentBuilds.characters.length===3&&stored().answers.boardTalentBuildsOptIn===false&&(await candidate())?.talentBuilds?.length===0);
 const historical=collection();historical.characters[1].build30=historical.characters[1].build30.replace(data.revision,'f'.repeat(12));
 await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify({...stored().answers,talentBuilds:historical}),MEMBER);
 r=await historicalFixture197({...body,answers:{...body.answers,why:'An unrelated edit retaining original historical evidence.',talentBuilds:historical}});
 check('exact own stored historical collection values survive an unrelated edit privately',r.response.status===200&&stored().answers.talentBuilds.characters[1].build30===historical.characters[1].build30&&stored().answers.boardTalentBuildsOptIn===false);
 const beforeHistoricalShare=JSON.stringify(stored());r=await historicalFixture197({...body,boardTalentBuilds:true,answers:{...body.answers,talentBuilds:historical}});
 check('an opaque historical collection cannot newly opt into board publication',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeHistoricalShare);
 const copied=JSON.parse(JSON.stringify(historical));copied.characters[0].character='Oz Two';
 r=await historicalFixture197({...body,character:'Oz Two',answers:{...body.answers,talentBuilds:copied}},OTHER);
 check('another account cannot newly adopt the original account historical code',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&!one('SELECT 1 FROM site_applications WHERE discord_id=?',OTHER));
 // PR90: retain only own unchanged historical alts when the real main changes.
 const mainEditHistory=collection();mainEditHistory.characters[1].build30=mainEditHistory.characters[1].build30.replace(data.revision,'f'.repeat(12));
 for(const [caseIndex,main] of [{character:'Mia Four',class:'warrior'},{character:'Mia One',class:'mage'}].entries()){
  // Fresh genuine own accounts isolate these new cases; the original MEMBER
  // still executes its original30 writes against the unchanged30/minute cap.
  const historyOwner=caseIndex===0?'300000000000000197':'300000000000000198',caseLabel=caseIndex===0?'main_rename':'main_class';
  await siteUser(historyOwner,{global_name:'Synthetic historical-alt fixture'});await character(historyOwner,caseIndex===0?'History One':'History Two',caseIndex===0?'Player-1-0197':'Player-1-0198');
  let historyWrite=0;const responseCodes=value=>typeof value==='string'&&/^[A-Za-z0-9_:-]{1,64}$/.test(value)?value:null;
  const historyFixture197=async(payload)=>{const result=await historicalFixture197(payload,historyOwner);console.log('HISTORY_MAIN_RESPONSE '+JSON.stringify({case:caseLabel,write:++historyWrite,status:result.response?.status??null,scope:'historical-parser-fixture-and-real-GET',error:responseCodes(result.body?.error),field:responseCodes(result.body?.field)}));return result;};
  const historyStored=()=>{const row=one('SELECT answers,board_at,status FROM site_applications WHERE discord_id=?',historyOwner);return row?{...row,answers:JSON.parse(row.answers)}:null;};
  const historyCandidate=async()=>{const result=await request('GET','/api/board/officer',undefined,OTHER);check('original eligible reader is admitted to the actual officer board',result.response.status===200);return result.body?.candidates?.find(row=>row.id===historyOwner);};
  const setup=await historyFixture197({...body,boardTalentBuilds:false});if(setup.response?.status!==200)throw Error('historical-alt own application fixture refused: '+JSON.stringify({status:setup.response?.status??null,error:responseCodes(setup.body?.error),field:responseCodes(setup.body?.field)}));

  await fixtureRun('UPDATE site_applications SET character=?,class=?,answers=? WHERE discord_id=?','Mia One','warrior',JSON.stringify({...body.answers,talentBuilds:mainEditHistory,boardTalentBuildsOptIn:false}),historyOwner);
  const edited=JSON.parse(JSON.stringify(mainEditHistory));Object.assign(edited.characters[0],{character:main.character,class:main.class,build30:'',build60:''});
  const editBody={...body,...main,boardTalentBuilds:false,answers:{...body.answers,talentBuild:'',talentBuilds:edited}};
  r=await historyFixture197(editBody);const actualMain=one('SELECT character,class FROM site_applications WHERE discord_id=?',historyOwner);
  check('historical parser '+main.character+'/'+main.class+' main-edit fixture retains exact historical alt privately',r.response.status===200&&JSON.stringify(historyStored().answers.talentBuilds)===JSON.stringify(edited)&&historyStored().answers.boardTalentBuildsOptIn===false&&actualMain.character===main.character&&actualMain.class===main.class);
  r=await historyFixture197({...editBody,answers:{...editBody.answers,why:'Unrelated edit after main anchor change.'}});
  check('unrelated save after main edit preserves unchanged private historical alt values',r.response.status===200&&historyStored().answers.why==='Unrelated edit after main anchor change.'&&JSON.stringify(historyStored().answers.talentBuilds)===JSON.stringify(edited));
  const beforeAttack=JSON.stringify(historyStored());r=await historyFixture197({...editBody,boardTalentBuilds:true});
  check('main edit cannot turn historical alt retention into board sharing',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(historyStored())===beforeAttack&&(await historyCandidate())?.talentBuilds?.length===0);
  for(const mutate of [v=>v.characters[1].character='Mia Five',v=>v.characters[1].class='priest',v=>v.characters[1].build30+='0',v=>{v.characters[1].build60=v.characters[1].build30;v.characters[1].build30='';},v=>v.characters[0].character='Other Person']){const bad=JSON.parse(JSON.stringify(edited));mutate(bad);r=await historyFixture197({...editBody,answers:{...editBody.answers,talentBuilds:bad}});check('historical alt name/class/code/slot or incoming-main mutation refuses atomically',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(historyStored())===beforeAttack);}
  const malformed=JSON.parse(JSON.stringify(mainEditHistory));malformed.characters[0].character='not-a-name';await fixtureRun('UPDATE site_applications SET character=?,class=?,answers=? WHERE discord_id=?','Mia One','warrior',JSON.stringify({...body.answers,talentBuilds:malformed,boardTalentBuildsOptIn:false}),historyOwner);const beforeMalformedHistory=JSON.stringify(historyStored());
  r=await historyFixture197(editBody);check('malformed original stored anchor never authorizes historical alt',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(historyStored())===beforeMalformedHistory);
  const currentOnly=JSON.parse(JSON.stringify(edited));currentOnly.characters[1].build30=code('mage',30);r=await historyFixture197({...editBody,boardTalentBuilds:true,answers:{...editBody.answers,talentBuilds:currentOnly}});
  check('historical parser permits current replacement codes and explicit sharing in a pre-policy row',r.response.status===200&&historyStored().answers.boardTalentBuildsOptIn===true&&(await historyCandidate())?.talentBuilds?.length===4);
 }
 r=await historicalFixture197({...body,boardTalentBuilds:true});
 check('historical parser fixture with current replacement codes retains the original separate sharing shape',r.response.status===200&&(await candidate())?.talentBuilds?.length===6);
 r=await request('DELETE','/api/application');
 check('actual application withdrawal removes the shared collection from every board',r.response.status===200&&stored().status==='withdrawn'&&!(await candidate()));
 await historicalFixture197({...body,boardTalentBuilds:true});await fixtureRun('UPDATE site_users SET denied=1 WHERE discord_id=?',MEMBER);
 check('current denied standing suppresses an otherwise consented shared collection',!(await candidate()));
 await fixtureRun('UPDATE site_users SET denied=0 WHERE discord_id=?',MEMBER);
 const corrupt=collection();corrupt.characters[1].build60=code('priest',60);await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify({...stored().answers,talentBuilds:corrupt,boardTalentBuildsOptIn:true}),MEMBER);
 check('board revalidation fails closed on a stored class-code mismatch without exposing a partial collection',(await candidate())?.talentBuilds?.length===0);
 r=await historicalFixture197({...body,boardTalentBuilds:false,answers:{...body.answers,talentBuilds:null}});
 check('explicit collection clear removes only the collection and preserves private legacy attachment',r.response.status===200&&!Object.hasOwn(stored().answers,'talentBuilds')&&stored().answers.talentBuild===privateCode&&stored().answers.boardTalentBuildsOptIn===false);
 // PR90: actual Worker validates optional empty-main anchors and publishes no phantom attachment.
 const altOnly=collection();altOnly.characters[0].build30=altOnly.characters[0].build60='';
 r=await historicalFixture197({...body,boardTalentBuilds:false,answers:{...body.answers,talentBuilds:altOnly}});
 check('empty bound main and four valid alt codes save privately without new identity',r.response.status===200&&JSON.stringify(stored().answers.talentBuilds)===JSON.stringify(altOnly)&&stored().answers.boardTalentBuildsOptIn===false&&stored().answers.talentBuild===privateCode&&!one('SELECT 1 FROM characters WHERE name IN (?,?)','Mia Two','Mia Three'));
 r=await historicalFixture197({...body,boardTalentBuilds:false,answers:{...body.answers,why:'An unrelated edit after clearing optional main builds.',talentBuilds:altOnly}});
 check('unrelated historical parser fixture retains empty main and all four alt codes',r.response.status===200&&stored().answers.why==='An unrelated edit after clearing optional main builds.'&&JSON.stringify(stored().answers.talentBuilds)===JSON.stringify(altOnly));
 r=await historicalFixture197({...body,boardTalentBuilds:true,answers:{...body.answers,talentBuilds:altOnly}});card=await candidate();
 check('historical explicitly opted-in row returns only four minimal alt attachments without main phantom or private answers',r.response.status===200&&card?.talentBuilds?.length===4&&card.talentBuilds.every(row=>row.character!=='Mia One'&&['mage','druid'].includes(row.class)&&Object.keys(row).sort().join('|')==='character|class|code|level')&&!JSON.stringify(card).includes(privateCode)&&!JSON.stringify(card).includes(privateText));
 const beforeEmptyAttacks=JSON.stringify(stored());
 for(const mutate of [v=>v.characters[0].character='Other Person',v=>v.characters[0].class='mage',v=>v.characters.shift(),v=>v.characters.splice(1),v=>{v.characters[1].build30='';v.characters[1].build60='';}]){const bad=JSON.parse(JSON.stringify(altOnly));mutate(bad);r=await historicalFixture197({...body,answers:{...body.answers,talentBuilds:bad}});check('wrong main, missing main, phantom-only or empty-alt collection refuses atomically',r.validation?.error==='invalid'&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeEmptyAttacks);}
 r=await historicalFixture197({...body,boardTalentBuilds:false,answers:{...body.answers,talentBuilds:{version:1,characters:[]}}});
 check('all-build clear stores no phantom anchor and preserves only private legacy attachment',r.response.status===200&&!Object.hasOwn(stored().answers,'talentBuilds')&&stored().answers.talentBuild===privateCode&&stored().answers.boardTalentBuildsOptIn===false&&(await candidate())?.talentBuilds?.length===0);
 check('feature changes no Native schema or separate board-vote rows',JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all())===schemaBefore&&!one('SELECT 1 FROM site_board_votes'));
 await require('./application_track199_test.cjs');
 console.log('\n'+ok+'/'+n+' historical talent parser/board/copy/withdrawal compatibility checks passed; current reserved PUT separately denied');process.exit(ok===n?0:1);
}
const run197=new Module(__filename,module);run197.filename=__filename;run197.paths=Module._nodeModulePaths(__dirname);run197._compile(prefix197+'\n('+applicationTalentCollection197.toString()+')().catch(error=>{console.error(error.stack);process.exit(1);});',__filename);
