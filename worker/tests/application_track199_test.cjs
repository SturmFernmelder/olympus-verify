// .201: the current Worker rejects reserved leadership admissions. Explicit
// historical parser fixtures retain their original private/board/copy/erasure
// coverage below; they are never submitted through a bypassed PUT route.
// Actual current Worker + unchanged authenticated frontend fixture, followed by
// the unchanged Native E2/OAuth fixture. Only Discord/provider HTTP is synthetic.
// Export a promise so the existing talent leaf can await this without adding a command.
'use strict';
const fs199=require('node:fs'),path199=require('node:path'),crypto199=require('node:crypto'),{Module}=require('node:module');
function prefix199(file,pattern,pin){const source=fs199.readFileSync(path199.join(__dirname,file),'utf8'),cuts=[...source.matchAll(pattern)];if(cuts.length!==1)throw Error('application199_original_fixture_boundary');const prefix=source.slice(0,cuts[0].index);if(crypto199.createHash('sha256').update(file==='frontend_check.cjs'?require('./frontend_fixture_prefix217.cjs').historicalFrontendPrefix217(prefix):prefix).digest('hex')!==pin)throw Error('application199_original_fixture_drift');return prefix;}
const frontPrefix199=prefix199('frontend_check.cjs',/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g,'bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5');
async function applicationTrackWorker199(){
 const assert199=require('node:assert/strict'),sd199=load('./site-data'),api199=load('./site-api'),intent199=load('./application-track199'),catalogue199=load('./governance-offices');
 const schema199=()=>JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
 const schemaBefore199=schema199();
 const baseline={backups:[],class:'warrior',role:'dps',region:'eu',fallback:true,ack:true,board:false,avail:'f'.repeat(42),availTz:'Europe/Stockholm',answers:{experience:'A synthetic .199 application experience.',why:'A synthetic .199 service proposal.',leadership:'Led a fictional group through an encounter.',scenario:'Hear both members and apply the agreed rules.',hours:'10to20',voice:'yes',extra:'Private .199 answer sentinel.',logs:'https://private.example/199-log'}};
 const cases=[{track:'member',position:'member',office:null,name:'Track One'},{track:'raider',position:'raider',office:null,name:'Track Two'},{track:'artisan',position:'member',office:'office_27',name:'Track Three'},{track:'officer',position:'officer',office:'office_62',name:'Track Four'},{track:'high_council',position:'office_03',office:'office_03',name:'Track Five'},{track:'patron',position:'member',office:null,name:'Track Six'}];
 const owners=new Map(cases.map((c,i)=>[c.track,String(300000000000001990n+BigInt(i))]));
 const bodyFor=c=>({...baseline,position:c.position,character:c.name,applicationTrack:c.track,targetOffice:c.office,board:['officer','high_council'].includes(c.track),answers:{...baseline.answers}});
 const request199=async(method,url,payload,who=OTHER,over={})=>{const response=await indexMod.default.fetch(new Request('https://guild.example'+url,{method,headers:{Cookie:await cookieFor(who),Origin:'https://guild.example','X-Olympus':siteCore.PAGE_VERSION,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env(over),ctx);return{response,body:await response.clone().json().catch(()=>null)};};
 const stored199=id=>{const row=one('SELECT * FROM site_applications WHERE discord_id=?',id);return row?{...row,answers:JSON.parse(row.answers)}:null;};
 const historicalFixture199=async(payload,id)=>{
  const fixture=await require('./historical_application201_fixture.cjs').historicalApplicationFixture201({validate:api199.validateApplication,run:fixtureRun,previous:who=>one('SELECT * FROM site_applications WHERE discord_id=?',who),id,payload,time:now});
  if('error' in fixture.validation)return{...fixture,body:fixture.validation};
  return{...await request199('GET','/api/me',undefined,id),...fixture};
 };
 await siteUser(OTHER,{global_name:'Synthetic .199 reviewer'});await character(OTHER,'Review Reader','Player-199-0001');
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('appointed','{}',?) ON CONFLICT(key) DO UPDATE SET value='{}'",now);
 // .200: this six-track fixture exercises the explicitly enabled Royal Writs catalogue.
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('royalWritsOn','1',?) ON CONFLICT(key) DO UPDATE SET value='1'",now);
 check('all six historical application track IDs remain readable once',JSON.stringify(catalogue199.APPLICATION_TRACKS_199.map(t=>t.id))===JSON.stringify(cases.map(c=>c.track)));
 const canonicalOffices199=catalogue199.OFFICE_APPOINTMENTS.filter(o=>/^office_\d\d$/.test(o.key)&&o.applicationEligible&&['officer','high_council'].includes(o.applicationTrack));
 check('all59 historical canonical leadership intents retain their original ballots without duplicate seats',canonicalOffices199.length===59&&canonicalOffices199.every(o=>intent199.applicationRoleKeys199(o.key).length&&intent199.applicationRoleKeys199(o.key).every(key=>sd199.choiceOf(key)?.leadership&&sd199.ballotOf(key)))&&canonicalOffices199.filter(o=>intent199.applicationRoleKeys199(o.key).includes(o.key)).length===49);
 check('74ballots retain86 total write-in slots and75 maximum frozen DELETE parameters',sd199.BALLOTS.length===74&&sd199.BALLOTS.reduce((a,b)=>a+b.seats,0)===86&&sd199.BALLOTS.length+1===75);
 check('seven single-seat office aliases and all class/regional targets reuse their original ballot keys',Object.entries({office_62:['officer'],office_79:['recruitment'],office_21:['community'],office_71:['pvp_leader'],office_51:['loot_council'],office_69:['professions'],office_33:['moderator'],office_18:sd199.CLASSES.map(c=>'class_lead:'+c.key),office_73:['raid_assist_na','raid_assist_eu'],office_74:['raid_leader_na','raid_leader_eu']}).every(([key,want])=>JSON.stringify(intent199.applicationRoleKeys199(key))===JSON.stringify(want))&&intent199.applicationRoleKeys199('rank_treasurer').length===0&&intent199.applicationRoleKeys199(false).length===0);
 for(const c of cases){const id=owners.get(c.track);await siteUser(id,{global_name:'Synthetic '+c.track+' applicant'});await character(id,c.name,'Player-199-'+String(cases.indexOf(c)+10).padStart(4,'0'));let result=await request199('PUT','/api/application',bodyFor(c),id);
  const reserved=['officer','high_council'].includes(c.track);
  if(reserved){check(c.track+' current application is reserved before any historical row exists',result.response.status===403&&result.body?.error==='reserved_seat'&&!stored199(id));result=await historicalFixture199(bodyFor(c),id);}
  const row=stored199(id);
  check(c.track+(reserved?' historical parser fixture/readback':' actual application roundtrip')+' stores only canonical bounded intent',result.response.status===200&&row?.position===c.position&&row.answers.applicationTrack===c.track&&row.answers.targetOffice===c.office&&result.body.application.answers.applicationTrack===c.track&&row.answers.boardApplicationIntentOptIn===false,result.response.status,result.body?.field);
  check(c.track+' stored intent stays below128bytes and confers no appointment',Buffer.byteLength(JSON.stringify({applicationTrack:row?.answers.applicationTrack,targetOffice:row?.answers.targetOffice}))<128&&one("SELECT value FROM site_settings WHERE key='appointed'").value==='{}'&&!one('SELECT 1 FROM role_settlements WHERE subject=?',id));
 }
 const officer199=cases.find(c=>c.track==='officer'),officerId199=owners.get('officer'),officerBody199=bodyFor(officer199);
 // Organization links may select a non-leadership office without turning its
 // membership-form route into a shared appointment or no-vote identity.
 for(const [target,track,position]of [['office_07','artisan','member'],['office_27','artisan','member'],['office_25','raider','raider']]){
  const original=cases.find(c=>c.track===track),id=owners.get(track),payload={...bodyFor(original),position,targetOffice:target,board:false,boardApplicationIntent:false};
  const saved=await request199('PUT','/api/application',payload,id),row=stored199(id);
  check(target+' exact non-leadership target roundtrips through the real Worker privately',saved.response.status===200&&row?.position===position&&row.answers.applicationTrack===track&&row.answers.targetOffice===target&&row.answers.boardApplicationIntentOptIn===false&&JSON.stringify(intent199.applicationIntentDto199(row.answers))===JSON.stringify({applicationTrack:track,targetOffice:target}),saved.response.status,saved.body?.field);
  const copied=await request199('GET','/api/me/export',undefined,id);
  check(target+' exact non-leadership intent remains in signed-in own copy',copied.response.status===200&&copied.body.site.application.answers.applicationTrack===track&&copied.body.site.application.answers.targetOffice===target);
  const before=JSON.stringify(stored199(id));
  for(const [label,patch,field]of [['mismatched track',{applicationTrack:track==='artisan'?'raider':'artisan'},'targetOffice'],['mismatched position',{position:position==='member'?'raider':'member'},'position'],['unknown target',{targetOffice:'office_999'},'targetOffice']]){
   const refused=await request199('PUT','/api/application',{...payload,...patch},id);check(target+' '+label+' is refused without changing stored intent',refused.response.status===400&&refused.body?.field===field&&JSON.stringify(stored199(id))===before,refused.response.status,refused.body?.field);
  }
  await fixtureRun("UPDATE site_settings SET value=? WHERE key='appointed'",JSON.stringify({[target]:'Recorded exact target holder'}));
  const occupied=await request199('PUT','/api/application',payload,id);
  check(target+' exact occupied target stays closed without fabricating a shared membership seat',occupied.response.status===400&&occupied.body?.field==='targetOffice'&&JSON.stringify(stored199(id))===before&&!sd199.isAppointed({appointed:{[target]:'Recorded exact target holder'}},position),occupied.response.status,occupied.body?.field);
  await fixtureRun("UPDATE site_settings SET value='{}' WHERE key='appointed'");
 }
 const noTaken=()=>false;
 const invalidIntents199=[['unknown track','unknown',null,'applicationTrack'],['null track',null,null,'applicationTrack'],['boolean track',true,null,'applicationTrack'],['oversize track','x'.repeat(81),null,'applicationTrack'],['unknown office','officer','office_999','targetOffice'],['track mismatch','high_council','office_62','targetOffice'],['reserved Treasury','high_council','office_86','targetOffice'],['reserved sovereign','high_council','office_43','targetOffice'],['missing leadership target','officer',undefined,'targetOffice'],['null leadership target','officer',null,'targetOffice'],['boolean target','officer',false,'targetOffice'],['object target','officer',{},'targetOffice'],['oversize target','officer','x'.repeat(81),'targetOffice'],['member cannot target an officer','member','office_62','targetOffice']];
 for(const [label,track,target,field]of invalidIntents199){const value=intent199.validateApplicationIntent199(track,target,noTaken);check(label+' is refused by the real finite intent validator',!!value&&value.error==='invalid'&&value.field===field);}
 check('legacy omission remains absent while member null target is explicit and valid',intent199.validateApplicationIntent199(undefined,undefined,noTaken)===null&&intent199.validateApplicationIntent199('member',null,noTaken)?.targetOffice===null);
 const takenIntent199=intent199.validateApplicationIntent199('officer','office_62',key=>key==='office_62');check('an explicitly taken exact office is refused',takenIntent199?.error==='invalid'&&takenIntent199.field==='targetOffice');
 check('single-seat Officer and Treasurer aliases close in both directions without closing other classes',sd199.isAppointed({appointed:{officer:'Recorded holder'}},'office_62')&&sd199.isAppointed({appointed:{office_62:'Recorded holder'}},'officer')&&sd199.isAppointed({appointed:{treasurer:'Recorded holder'}},'office_86')&&sd199.isAppointed({appointed:{office_86:'Recorded holder'}},'treasurer')&&!sd199.isAppointed({appointed:{'class_lead:mage':'Recorded holder'}},'class_lead:warrior'));
 // Execute these pure helpers from the actual current browser source, rather than
 // keeping a second appointment/alias implementation inside the fixture.
 const browserHelperNames199=new Set(['offices199','office199','applicationLeadershipSeat199','applicationSeatKeys199','applicationParent199','displayHolder','appointmentPointer','appointedTo','appointmentSourceKey199','noVoteFor']),browserHelperSource199=[];
 const browserAst199=ts.createSourceFile('app.js',APP_JS,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 function visitBrowserHelper199(node){
  if(ts.isFunctionDeclaration(node)&&node.name&&browserHelperNames199.has(node.name.text)){browserHelperSource199.push(node.getText(browserAst199));browserHelperNames199.delete(node.name.text);return;}
  if(ts.isVariableStatement(node)){const declarations=node.declarationList.declarations;if(declarations.length===1&&ts.isIdentifier(declarations[0].name)&&browserHelperNames199.has(declarations[0].name.text)){browserHelperSource199.push(node.getText(browserAst199));browserHelperNames199.delete(declarations[0].name.text);return;}}
  ts.forEachChild(node,visitBrowserHelper199);
 }
 visitBrowserHelper199(browserAst199);assert199.equal(browserHelperNames199.size,0,'all actual browser helper source boundaries');
 const browserState199={settings:{appointed:{},noVote:[]},signedIn:true,denied:false},browserContext199={S:browserState199,M:()=>({appointments:catalogue199.OFFICE_APPOINTMENTS}),communityReader:()=>true};
 vm.runInNewContext(browserHelperSource199.join('\n')+'\nglobalThis.helper199={displayHolder,appointedTo,appointmentSourceKey199,noVoteFor};',browserContext199,{filename:'actual-app199-appointment-helpers.js'});
 const browserHelper199=browserContext199.helper199;
 // An artisan's membership-form route adapter is not a shared appointment seat.
 for(const target of ['office_07','office_27']){
  const other=target==='office_07'?'office_27':'office_07';
  check(target+' keeps its member route adapter separate from leadership seat identities',JSON.stringify(intent199.applicationRoleKeys199(target))==='["member"]'&&sd199.applicationSeatKeys199(target).length===0);
  browserState199.settings={appointed:{[target]:'Recorded artisan'},noVote:[]};
  check(target+' appointment closes only its exact artisan target, never Member or the other artisan card',sd199.isAppointed(browserState199.settings,target)&&!!browserHelper199.appointedTo(target)&&!!browserHelper199.displayHolder(target)&&browserHelper199.appointmentSourceKey199(target)===target&&!sd199.isAppointed(browserState199.settings,'member')&&!browserHelper199.appointedTo('member')&&!browserHelper199.displayHolder('member')&&browserHelper199.appointmentSourceKey199('member')==='member'&&!sd199.isAppointed(browserState199.settings,other)&&!browserHelper199.appointedTo(other)&&!browserHelper199.displayHolder(other));
  browserState199.settings={appointed:{member:'Recorded Member'},noVote:[]};
  check('an exact Member holder cannot fill '+target+' through its application route adapter',!sd199.isAppointed(browserState199.settings,target)&&!browserHelper199.appointedTo(target)&&!browserHelper199.displayHolder(target)&&browserHelper199.appointmentSourceKey199(target)===target&&sd199.isAppointed(browserState199.settings,'member'));
  browserState199.settings={appointed:{},noVote:[target]};
  check(target+' no-vote setting cannot propagate into Member or another artisan route',sd199.isNoVote(browserState199.settings,target)&&browserHelper199.noVoteFor(target)&&!sd199.isNoVote(browserState199.settings,'member')&&!browserHelper199.noVoteFor('member')&&!sd199.isNoVote(browserState199.settings,other)&&!browserHelper199.noVoteFor(other)&&sd199.cleanNoVote([target]).length===0);
  await fixtureRun("UPDATE site_settings SET value=? WHERE key='appointed'",JSON.stringify({[target]:'Recorded artisan'}));
  for(const track of ['member','patron','artisan']){const c=cases.find(row=>row.track===track),r=await request199('PUT','/api/application',{...bodyFor(c),targetOffice:null},owners.get(track));check(target+' appointment leaves a genuine untargeted '+track+' API application open',r.response.status===200&&stored199(owners.get(track)).answers.applicationTrack===track&&stored199(owners.get(track)).answers.targetOffice===null,r.response.status,r.body?.field);}
  const artisan=cases.find(row=>row.track==='artisan'),artisanOwner=owners.get('artisan'),otherResult=await request199('PUT','/api/application',{...bodyFor(artisan),targetOffice:other},artisanOwner);
  check(target+' appointment leaves the other exact artisan API target independently available',otherResult.response.status===200&&stored199(artisanOwner).answers.targetOffice===other,otherResult.response.status,otherResult.body?.field);
  const beforeExact=JSON.stringify(stored199(artisanOwner)),exactResult=await request199('PUT','/api/application',{...bodyFor(artisan),targetOffice:target},artisanOwner);
  check(target+' exact selected artisan target still refuses atomically when appointed',exactResult.response.status===400&&exactResult.body?.field==='targetOffice'&&JSON.stringify(stored199(artisanOwner))===beforeExact,exactResult.response.status,exactResult.body?.field);
 }
 browserState199.settings={appointed:{},noVote:[]};
 await fixtureRun("UPDATE site_settings SET value='{}' WHERE key='appointed'");
 const singleAliasPairs199=[['office_62','officer'],['office_79','recruitment'],['office_21','community'],['office_71','pvp_leader'],['office_51','loot_council'],['office_69','professions'],['office_33','moderator']];
 for(const [parent,child]of singleAliasPairs199){
  browserState199.settings={appointed:{[parent]:'Recorded parent'},noVote:[]};const parentState=browserState199.settings;
  check(parent+' parent appointment closes its original '+child+' ballot in server and current UI',sd199.isAppointed(parentState,child)&&!!browserHelper199.appointedTo(child)&&!!browserHelper199.displayHolder(child));
  browserState199.settings={appointed:{[child]:'Recorded child'},noVote:[]};
  check(child+' original appointment closes its canonical '+parent+' card in server and current UI',sd199.isAppointed(browserState199.settings,parent)&&!!browserHelper199.appointedTo(parent)&&!!browserHelper199.displayHolder(parent));
  browserState199.settings={appointed:{},noVote:[parent]};const expanded=sd199.cleanNoVote([parent]);
  check(parent+' no-vote alias preserves applications while freezing only its original ballot',Array.isArray(expanded)&&expanded.length===1&&expanded[0]===child&&sd199.isNoVote(browserState199.settings,child)&&browserHelper199.noVoteFor(child)&&!sd199.isAppointed(browserState199.settings,parent)&&!browserHelper199.displayHolder(parent));
 }
 for(const parent of ['office_18','office_73','office_74']){
  const children=intent199.applicationRoleKeys199(parent),first=children[0],last=children.at(-1);
  browserState199.settings={appointed:{[parent]:'Recorded parent'},noVote:[]};
  check(parent+' parent appointment closes every related class/region without duplicate seats',children.every(key=>sd199.isAppointed(browserState199.settings,key)&&!!browserHelper199.appointedTo(key)&&!!browserHelper199.displayHolder(key)));
  browserState199.settings={appointed:{[first]:'Recorded first child'},noVote:[]};
  check(parent+' one child appointment closes only that child and keeps its group applicable',sd199.isAppointed(browserState199.settings,first)&&!!browserHelper199.displayHolder(first)&&!sd199.isAppointed(browserState199.settings,parent)&&!browserHelper199.displayHolder(parent)&&children.slice(1).every(key=>!sd199.isAppointed(browserState199.settings,key)&&!browserHelper199.appointedTo(key)));
  browserState199.settings={appointed:Object.fromEntries(children.slice(0,-1).map(key=>[key,'Recorded child'])),noVote:[]};
  check(parent+' last-open-child state keeps canonical card and exact final seat applicable',!sd199.isAppointed(browserState199.settings,parent)&&!browserHelper199.displayHolder(parent)&&!sd199.isAppointed(browserState199.settings,last)&&!browserHelper199.appointedTo(last));
  browserState199.settings.appointed[last]='Recorded last child';
  check(parent+' closes its canonical card only after every child is filled',sd199.isAppointed(browserState199.settings,parent)&&!!browserHelper199.displayHolder(parent)&&children.every(key=>sd199.isAppointed(browserState199.settings,key)));
  browserState199.settings={appointed:{},noVote:[parent]};const expanded=sd199.cleanNoVote([parent]);
  check(parent+' no-vote parent expands to all exact existing ballots without closing applications',Array.isArray(expanded)&&expanded.length===children.length&&children.every(key=>expanded.includes(key)&&sd199.isNoVote(browserState199.settings,key)&&browserHelper199.noVoteFor(key))&&!sd199.isAppointed(browserState199.settings,parent)&&!browserHelper199.displayHolder(parent));
  browserState199.settings={appointed:{},noVote:[first]};
  check(parent+' child-only no-vote does not freeze another class/region or close the group',sd199.isNoVote(browserState199.settings,first)&&browserHelper199.noVoteFor(first)&&children.slice(1).every(key=>!sd199.isNoVote(browserState199.settings,key)&&!browserHelper199.noVoteFor(key))&&!sd199.isAppointed(browserState199.settings,parent)&&!browserHelper199.displayHolder(parent));
 }
 const stateBefore199=JSON.stringify(stored199(officerId199));
 for(const [label,patch,field]of [['unknown',{applicationTrack:'unknown'},'applicationTrack'],['mismatch',{applicationTrack:'high_council'},'targetOffice'],['boolean',{targetOffice:false},'targetOffice'],['oversize',{targetOffice:'x'.repeat(81)},'targetOffice'],['different first-choice',{position:'moderator'},'targetOffice']]){const payload={...officerBody199,...patch},parsed=api199.validateApplication(payload,officerId199),r=await request199('PUT','/api/application',payload,officerId199);check(label+' historical parser refusal and current reserved admission leave stored application byte-equivalent',parsed?.error==='invalid'&&parsed.field===field&&r.response.status===403&&r.body?.error==='reserved_seat'&&JSON.stringify(stored199(officerId199))===stateBefore199,r.response.status,r.body?.field);}
 for(const [track,position]of [['member','raider'],['raider','member'],['artisan','officer'],['patron','office_03']]){const value=api199.validateApplication({...baseline,position,character:'Track One',applicationTrack:track,targetOffice:null,board:true},OTHER,{});check(track+' intent cannot disguise a different primary-position track',value?.field==='position');}
 let result=await request199('GET','/api/board/officer');const candidate199=()=>result.body?.candidates?.find(c=>c.id===officerId199);
 check('ordinary board agreement does not disclose private selected track/office badges',result.response.status===200&&candidate199()?.applicationIntent===null&&!JSON.stringify(candidate199()).includes('Private .199 answer sentinel.')&&!JSON.stringify(candidate199()).includes('private.example'));
 result=await historicalFixture199({...officerBody199,boardApplicationIntent:true},officerId199);result=await request199('GET','/api/board/officer');
 check('historical separately consented row publishes exactly two canonical intent keys',result.response.status===200&&JSON.stringify(candidate199()?.applicationIntent)===JSON.stringify({applicationTrack:'officer',targetOffice:'office_62'})&&Object.keys(candidate199().applicationIntent).length===2);
 const own199=await request199('GET','/api/me/export',undefined,officerId199);
 check('genuine signed-in own-copy includes canonical intent and separate publication choice',own199.response.status===200&&own199.body.site?.application?.answers.applicationTrack==='officer'&&own199.body.site.application.answers.targetOffice==='office_62'&&own199.body.site.application.answers.boardApplicationIntentOptIn===true);
 const legacy199={...officerBody199,answers:{...officerBody199.answers,boardApplicationIntentOptIn:true}};delete legacy199.applicationTrack;delete legacy199.targetOffice;
 const beforeLegacy201=JSON.stringify(stored199(officerId199));result=await request199('PUT','/api/application',legacy199,officerId199);
 check('current omitted-intent reserved edit cannot erase or republish historical intent',result.response.status===403&&result.body?.error==='reserved_seat'&&JSON.stringify(stored199(officerId199))===beforeLegacy201);
 await historicalFixture199(legacy199,officerId199);const retained199=stored199(officerId199);result=await request199('GET','/api/board/officer');
 check('historical old-client parser fixture carries exact intent privately without inferring previous public consent',retained199.answers.applicationTrack==='officer'&&retained199.answers.targetOffice==='office_62'&&retained199.answers.boardApplicationIntentOptIn===false&&candidate199()?.applicationIntent===null);
 const partial199={...legacy199,targetOffice:false};const beforePartial199=JSON.stringify(stored199(officerId199));const partialResult199=await request199('PUT','/api/application',partial199,officerId199);
 check('an explicit malformed target without a track remains refused by the current reserved policy',partialResult199.response.status===403&&partialResult199.body?.error==='reserved_seat'&&JSON.stringify(stored199(officerId199))===beforePartial199);
 const beforeBadConsent199=JSON.stringify(stored199(officerId199));
 for(const consent of [null,1,'true',{},[]]){const payload={...officerBody199,boardApplicationIntent:consent},parsed=api199.validateApplication(payload,officerId199),r=await request199('PUT','/api/application',payload,officerId199);check('nonboolean historical publication '+JSON.stringify(consent)+' parser refusal and current reserved policy preserve the row',parsed?.error==='invalid'&&parsed.field==='boardApplicationIntent'&&r.response.status===403&&r.body?.error==='reserved_seat'&&JSON.stringify(stored199(officerId199))===beforeBadConsent199);}
 const crossOwner199={...bodyFor(cases[0]),answers:{...baseline.answers,boardApplicationIntentOptIn:true}};const memberSave199=await request199('PUT','/api/application',crossOwner199,owners.get('member'));
 check('another account legacy edit cannot inherit the first owner intent or its consent',memberSave199.response.status===200&&stored199(owners.get('member')).answers.applicationTrack==='member'&&stored199(owners.get('member')).answers.targetOffice===null&&stored199(owners.get('member')).answers.boardApplicationIntentOptIn===false);
 const multiOwner199='300000000000001999';await siteUser(multiOwner199,{global_name:'Synthetic multi-key applicant'});await character(multiOwner199,'Track Multi','Player-199-0099');
 const multiCases199=[...sd199.CLASSES.map(c=>({target:'office_18',position:'class_lead',classLead:c.key,key:'class_lead:'+c.key})),{target:'office_73',position:'raid_assist_na',key:'raid_assist_na'},{target:'office_73',position:'raid_assist_eu',key:'raid_assist_eu'},{target:'office_74',position:'raid_leader_na',key:'raid_leader_na'},{target:'office_74',position:'raid_leader_eu',key:'raid_leader_eu'}];
 for(const c of multiCases199){const payload={...baseline,position:c.position,...(c.classLead?{classLead:c.classLead}:{}),character:'Track Multi',applicationTrack:'officer',targetOffice:c.target,board:true},parsed=api199.validateApplication(payload,multiOwner199),r=await request199('PUT','/api/application',payload,multiOwner199);check('historical canonical '+c.target+' parses exact '+c.key+' while the current reserved API creates no seat',!('error' in parsed)&&sd199.roleKeyOf(parsed.position,parsed.class_lead)===c.key&&JSON.parse(parsed.answers).targetOffice===c.target&&r.response.status===403&&r.body?.error==='reserved_seat'&&!stored199(multiOwner199),r.response.status,r.body?.field);}
 await fixtureRun("UPDATE site_settings SET value=? WHERE key='appointed'",JSON.stringify({'class_lead:mage':'Recorded mage holder',officer:'Recorded officer holder'}));
 const closedOfficer199=await request199('PUT','/api/application',officerBody199,officerId199),closedOfficerParsed199=api199.validateApplication(officerBody199,officerId199,{'class_lead:mage':'Recorded mage holder',officer:'Recorded officer holder'});check('a legacy Officer holder is recognized by the historical parser and the current API remains reserved',closedOfficerParsed199.field==='position'&&closedOfficer199.response.status===403&&closedOfficer199.body?.error==='reserved_seat');
 await fixtureRun("UPDATE site_settings SET value=? WHERE key='appointed'",JSON.stringify({'class_lead:mage':'Recorded mage holder',office_62:'Name withheld'}));
 const canonicalClosed199=await request199('PUT','/api/application',officerBody199,officerId199),canonicalParsed199=api199.validateApplication(officerBody199,officerId199,{'class_lead:mage':'Recorded mage holder',office_62:'Name withheld'});check('canonical occupied alias keeps its historical human parser refusal and current reserved policy',canonicalParsed199.field==='position'&&typeof canonicalParsed199.message==='string'&&!canonicalParsed199.message.includes('undefined')&&canonicalClosed199.response.status===403&&canonicalClosed199.body?.error==='reserved_seat');
 const multiBody199={...baseline,position:'class_lead',classLead:'mage',character:'Track Multi',applicationTrack:'officer',targetOffice:'office_18',board:true};const closedMage199=await request199('PUT','/api/application',multiBody199,multiOwner199),openWarrior199=await request199('PUT','/api/application',{...multiBody199,classLead:'warrior'},multiOwner199);
 const classSettings201={'class_lead:mage':'Recorded mage holder',office_62:'Name withheld'},closedMageParsed201=api199.validateApplication(multiBody199,multiOwner199,classSettings201),openWarriorParsed201=api199.validateApplication({...multiBody199,classLead:'warrior'},multiOwner199,classSettings201);
 check('historical class alias parser closes only the appointed class while both current officer requests stay reserved',closedMageParsed201.field==='classLead'&&!('error' in openWarriorParsed201)&&closedMage199.response.status===403&&openWarrior199.response.status===403&&closedMage199.body?.error==='reserved_seat'&&openWarrior199.body?.error==='reserved_seat');
 await fixtureRun("UPDATE site_settings SET value='{}' WHERE key='appointed'");
 const votes199=sd199.BALLOTS.flatMap(ballot=>Array.from({length:ballot.seats},(_,i)=>({ballot:ballot.key,slot:i+1,kind:'name',label:['Synthetic One','Synthetic Two','Synthetic Three'][i]})));
 check('all86 legal write-in slots validate while an87th entry is refused before mutation',api199.validateVotes(votes199,OTHER).length===86&&api199.validateVotes([...votes199,{...votes199[0]}],OTHER)?.field==='votes');
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('noVote','[]',?) ON CONFLICT(key) DO UPDATE SET value='[]'",now);
 const trace199=[];const native199=entry.originalNativePort(db,{statement:(sql,params)=>trace199.push({sql,params})});
 result=await request199('PUT','/api/votes',{votes:votes199},OTHER,{DB:native199});
 check('actual86-slot nomination save succeeds within the unchanged Native binding limit',result.response.status===200&&result.body.votes?.length===86&&trace199.every(row=>row.params.length<=100),{status:result.response.status,votes:result.body.votes?.length,maxBindings:Math.max(0,...trace199.map(row=>row.params.length))});
 await fixtureRun("INSERT INTO site_settings(key,value,updated_at)VALUES('noVote',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(sd199.BALLOTS.map(b=>b.key)),now);
 const frozenTrace199=[];const frozenNative199=entry.originalNativePort(db,{statement:(sql,params)=>frozenTrace199.push({sql,params})});
 result=await request199('PUT','/api/votes',{votes:[]},OTHER,{DB:frozenNative199});const frozenDelete199=frozenTrace199.find(row=>row.sql.includes('DELETE FROM site_votes WHERE voter_id = ?1 AND ballot NOT IN'));
 check('all74 frozen ballots use exactly75 DELETE parameters and preserve all86 original nominations',result.response.status===200&&frozenDelete199?.params.length===75&&result.body.votes?.length===86&&frozenTrace199.every(row=>row.params.length<=100),{status:result.response.status,votes:result.body.votes?.length,deleteBindings:frozenDelete199?.params.length,maxBindings:Math.max(0,...frozenTrace199.map(row=>row.params.length)),deleteSQL:frozenTrace199.filter(row=>row.sql.includes('DELETE FROM site_votes')).map(row=>row.sql.slice(0,100))});
 check('new application intent changes no schema object or automatic external dispatch setting',schema199()===schemaBefore199&&!one("SELECT 1 FROM site_settings WHERE key IN ('TREASURY_COSMETIC_ENABLED','ARMY_SITE_AGGREGATE_ENABLED','LINK_ENABLED')"));
 const totals199={checks:n,passed:ok};db.close();console.log(JSON.stringify({scope:'application199-real-worker',...totals199,externalProviderRequests:0}));if(ok!==n)throw Error('application199_real_worker_checks_failed');return totals199;
}
async function applicationNative199(){
 const f=fixture();try{
  const cookie=await f.signIn(ID);await f.signIn(OTHER);await seedPersonal(f,{roles:0});
  const originalSchema=JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
  const payload={position:'office_03',applicationTrack:'high_council',targetOffice:'office_03',backups:[],class:'warrior',role:'dps',region:'eu',character:'Native Target',fallback:true,ack:true,board:true,boardApplicationIntent:true,avail:'f'.repeat(42),answers:{experience:'Synthetic Native .199 experience.',why:'Synthetic Native .199 service intent.',leadership:'A fictional group leadership example.',scenario:'Hear both members and apply the agreed rules.',hours:'10to20',voice:'yes',extra:'Native private application sentinel.'}};
  const saved=await f.call('PUT','/api/application',{cookie,body:payload});check('real Native E2 application route refuses a new reserved High Council intent',saved.status===403&&(await saved.json()).error==='reserved_seat');
  const historical=await require('./historical_application201_fixture.cjs').historicalApplicationFixture201({validate:load('site-api').validateApplication,run:f.write,previous:id=>f.raw('SELECT * FROM site_applications WHERE discord_id=?',id),id:ID,payload,time:clock});
  check('explicit historical High Council parser fixture retains its original target for Native copy and erasure',!('error' in historical.validation)&&JSON.parse(f.raw('SELECT answers FROM site_applications WHERE discord_id=?',ID).answers).targetOffice==='office_03');
  const ordinary=await f.call('GET','/api/me/export',{cookie}),own=await ordinary.json();check('Native signed-in own copy retains canonical High Council intent',ordinary.status===200&&own.site.application.answers.applicationTrack==='high_council'&&own.site.application.answers.targetOffice==='office_03');
  const entryPage=await f.call('GET','/privacy/signin'),entryHtml=await entryPage.text(),entryToken=/name="csrf" value="([^"]+)"/.exec(entryHtml)[1],entryCookie=Object.entries(cookies(entryPage)).map(([k,v])=>k+'='+v).join('; ');
  const start=await f.call('POST','/privacy/signin',{cookie:entryCookie,form:{csrf:entryToken}}),u=new URL(start.headers.get('Location')),flowCookie=Object.entries(cookies(start)).map(([k,v])=>k+'='+v).join('; ');
  const callback=await f.call('GET','/privacy/callback?code=code-'+ID+'&state='+encodeURIComponent(u.searchParams.get('state'))+'&iss=https%3A%2F%2Fdiscord.com',{cookie:flowCookie});
  const privacyCookie=Object.entries(cookies(callback)).filter(([k])=>!k.includes('state')).map(([k,v])=>k+'='+v).join('; ');
  const page=await f.call('GET','/privacy/access',{cookie:privacyCookie}),html=await page.text(),form=/<form method="post" action="\/privacy\/access\/export">([\s\S]*?)<\/form>/.exec(html);assert.ok(form,'actual identify export form');
  const csrf=/name="csrf" value="([^"]+)"/.exec(form[1])[1],grant=/name="grant" value="([^"]+)"/.exec(form[1])[1],before=f.physicalStatements,pending=[];
  const copied=await index.fetch(new Request(BASE+'/privacy/access/export',{method:'POST',headers:{Cookie:privacyCookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,grant})}),f.env,{waitUntil(p){pending.push(Promise.resolve(p));}});for(const p of pending)await p;const identified=await copied.json(),measured=f.physicalStatements-before;
  check('fresh identify-only own copy includes only the original account intent',copied.status===200&&identified.identity.discordId===ID&&identified.identity.authority==='fresh_identify_only'&&identified.site.application.answers.applicationTrack==='high_council'&&identified.site.application.answers.targetOffice==='office_03');
  check('the complete identify-copy invocation remains strictly below100 physical statements',measured<100);console.log('MEASURED_APPLICATION199_IDENTIFY '+JSON.stringify({physicalStatements:measured,strictMaximumExclusive:100}));
  const out=await request(f,cookie);check('genuine original Native erasure request remains admitted for this intent',out.response.status===202&&out.body.operationId===OP);const job=await finish(f);
  check('actual Native E2 cleanup removes the full application JSON and target metadata',job?.state==='complete'&&!f.raw('SELECT 1 FROM site_applications WHERE discord_id=?',ID)&&!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',ID));
  check('Native intent copy/erasure preserves every original schema object, epoch, OFF controls and another account',JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))===originalSchema&&f.raw('SELECT epoch FROM privacy_write_admission').epoch===EPOCH&&f.env.BETA_RESET_REMOVALS_ENABLED==='false'&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',OTHER)&&f.floorCalls===0);
  console.log(JSON.stringify({scope:'application199-native-e2',checks,passed:checks,identifyStatements:measured,providerScope:'synthetic Discord only',liveProviderRequests:0}));return{checks,passed:checks,identifyStatements:measured};
 }finally{f.close();}
}
module.exports=(async()=>{
 const worker=new Module(__filename,module);worker.filename=__filename;worker.paths=Module._nodeModulePaths(__dirname);worker._compile(frontPrefix199+'\nmodule.exports=('+applicationTrackWorker199.toString()+')();',__filename);const workerResult=await worker.exports;
 const nativePrefix=prefix199('privacy_native_erasure_mode_test.cjs',/\(async\(\)=>\{\r?\n \/\/ \.174:/g,'572066b31422497e89314f47c972536517104de10521a45434b4f041f6ad02a3');
 const native=new Module(__filename,module);native.filename=__filename;native.paths=Module._nodeModulePaths(__dirname);native._compile(nativePrefix+'\nmodule.exports=('+applicationNative199.toString()+')();',__filename);const nativeResult=await native.exports;
 return{worker:workerResult,native:nativeResult};
})();
if(require.main===module)module.exports.catch(error=>{console.error(error.stack);process.exitCode=1;});
