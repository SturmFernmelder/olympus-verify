// Actual Worker, original authenticated fixture and admitted SQLite. Discord alone is synthetic.
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
 const stored=()=>{const row=one('SELECT answers,board_at,status FROM site_applications WHERE discord_id=?',MEMBER);return row?{...row,answers:JSON.parse(row.answers)}:null;};
 const candidate=async()=>{const r=await request('GET','/api/board/officer',undefined,OTHER);check('original eligible reader is admitted to the actual officer board',r.response.status===200);return r.body?.candidates?.find(row=>row.id===MEMBER);};
 let r=await request('PUT','/api/application',body);
 check('six current builds on three explicit application characters save privately by default',r.response.status===200&&JSON.stringify(stored().answers.talentBuilds)===JSON.stringify(collection())&&stored().answers.boardTalentBuildsOptIn===false);
 check('declared alts do not create verified character records or permissions',!one('SELECT 1 FROM characters WHERE name IN (?,?)','Mia Two','Mia Three'));
 let card=await candidate();
 check('ordinary board consent never infers named-build sharing',card?.talentBuilds?.length===0&&!JSON.stringify(card).includes('Mia Two')&&!JSON.stringify(card).includes(privateCode)&&!JSON.stringify(card).includes(privateText));
 r=await request('PUT','/api/application',{...body,answers:{...body.answers,boardTalentBuildsOptIn:true}});
 check('client answers cannot forge the server-managed build sharing flag',r.response.status===200&&stored().answers.boardTalentBuildsOptIn===false&&(await candidate())?.talentBuilds?.length===0);
 r=await request('PUT','/api/application',{...body,boardTalentBuilds:true});card=await candidate();
 check('fresh separate boolean exposes exactly six minimal class-level-code-character records',r.response.status===200&&stored().answers.boardTalentBuildsOptIn===true&&card?.talentBuilds?.length===6&&card.talentBuilds.every(row=>Object.keys(row).sort().join('|')==='character|class|code|level')&&card.talentBuilds.map(row=>row.level).join(',')==='30,60,30,60,30,60');
 check('shared build cards still exclude private single attachment, logs, extra answers and general character field',!Object.hasOwn(card,'character')&&!Object.hasOwn(card.answers,'talentBuilds')&&!Object.hasOwn(card.answers,'talentBuild')&&!Object.hasOwn(card.answers,'boardTalentBuildsOptIn')&&!JSON.stringify(card).includes(privateCode)&&!JSON.stringify(card).includes(privateText)&&!JSON.stringify(card).includes('private.example'));
 const own=await request('GET','/api/me/export');
 check('the original own-copy application includes all six private stored builds and separate consent',own.response.status===200&&own.body.site?.application?.answers?.talentBuilds?.characters?.length===3&&own.body.site.application.answers.boardTalentBuildsOptIn===true&&own.body.site.application.answers.talentBuild===privateCode);
 check('collection remains under its2048byte cap and selected application copy under original131072bytes',Buffer.byteLength(JSON.stringify(stored().answers.talentBuilds))<=2048&&Buffer.byteLength(JSON.stringify(own.body.site.application))<131072);
 const beforeMalformed=JSON.stringify(stored());
 for(const value of ['true',1,null]){r=await request('PUT','/api/application',{...body,boardTalentBuilds:value});check('nonboolean sharing '+JSON.stringify(value)+' is refused without a write',r.response.status===400&&r.body?.field==='boardTalentBuilds'&&JSON.stringify(stored())===beforeMalformed);}
 for(const mutate of [v=>v.characters.push({...v.characters[2],character:'Mia Four'}),v=>v.characters[1].character='mia one',v=>v.characters[0].build30=code('warrior',29),v=>v.characters[1].build60=code('priest',60),v=>v.characters[0].discordId=OTHER]){const v=collection();mutate(v);r=await request('PUT','/api/application',{...body,answers:{...body.answers,talentBuilds:v}});check('invalid bound, duplicate, level, class or extra field is refused atomically',r.response.status===400&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeMalformed);}
 r=await request('PUT','/api/application',{...body,character:'Mia Four'});
 check('the collection cannot silently follow a changed application primary character',r.response.status===400&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeMalformed);
 r=await request('PUT','/api/application',{...body,boardTalentBuilds:false});
 check('unchecked save withdraws build sharing but keeps private collection and ordinary board consent',r.response.status===200&&stored().answers.boardTalentBuildsOptIn===false&&stored().board_at>0&&stored().answers.talentBuilds.characters.length===3&&(await candidate())?.talentBuilds?.length===0);
 await request('PUT','/api/application',{...body,boardTalentBuilds:true});const oldClient={...body,answers:{...body.answers}};delete oldClient.answers.talentBuilds;
 r=await request('PUT','/api/application',oldClient);
 check('old client omission keeps private builds but cannot keep prior sharing authority',r.response.status===200&&stored().answers.talentBuilds.characters.length===3&&stored().answers.boardTalentBuildsOptIn===false&&(await candidate())?.talentBuilds?.length===0);
 const historical=collection();historical.characters[1].build30=historical.characters[1].build30.replace(data.revision,'f'.repeat(12));
 await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify({...stored().answers,talentBuilds:historical}),MEMBER);
 r=await request('PUT','/api/application',{...body,answers:{...body.answers,why:'An unrelated edit retaining original historical evidence.',talentBuilds:historical}});
 check('exact own stored historical collection values survive an unrelated edit privately',r.response.status===200&&stored().answers.talentBuilds.characters[1].build30===historical.characters[1].build30&&stored().answers.boardTalentBuildsOptIn===false);
 const beforeHistoricalShare=JSON.stringify(stored());r=await request('PUT','/api/application',{...body,boardTalentBuilds:true,answers:{...body.answers,talentBuilds:historical}});
 check('an opaque historical collection cannot newly opt into board publication',r.response.status===400&&r.body?.field==='talentBuilds'&&JSON.stringify(stored())===beforeHistoricalShare);
 const copied=JSON.parse(JSON.stringify(historical));copied.characters[0].character='Oz Two';
 r=await request('PUT','/api/application',{...body,character:'Oz Two',answers:{...body.answers,talentBuilds:copied}},OTHER);
 check('another account cannot newly adopt the original account historical code',r.response.status===400&&r.body?.field==='talentBuilds'&&!one('SELECT 1 FROM site_applications WHERE discord_id=?',OTHER));
 r=await request('PUT','/api/application',{...body,boardTalentBuilds:true});
 check('replacing retained historical values with current codes permits a new separate sharing choice',r.response.status===200&&(await candidate())?.talentBuilds?.length===6);
 r=await request('DELETE','/api/application');
 check('actual application withdrawal removes the shared collection from every board',r.response.status===200&&stored().status==='withdrawn'&&!(await candidate()));
 await request('PUT','/api/application',{...body,boardTalentBuilds:true});await fixtureRun('UPDATE site_users SET denied=1 WHERE discord_id=?',MEMBER);
 check('current denied standing suppresses an otherwise consented shared collection',!(await candidate()));
 await fixtureRun('UPDATE site_users SET denied=0 WHERE discord_id=?',MEMBER);
 const corrupt=collection();corrupt.characters[1].build60=code('priest',60);await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify({...stored().answers,talentBuilds:corrupt,boardTalentBuildsOptIn:true}),MEMBER);
 check('board revalidation fails closed on a stored class-code mismatch without exposing a partial collection',(await candidate())?.talentBuilds?.length===0);
 r=await request('PUT','/api/application',{...body,boardTalentBuilds:false,answers:{...body.answers,talentBuilds:null}});
 check('explicit collection clear removes only the collection and preserves private legacy attachment',r.response.status===200&&!Object.hasOwn(stored().answers,'talentBuilds')&&stored().answers.talentBuild===privateCode&&stored().answers.boardTalentBuildsOptIn===false);
 check('feature changes no Native schema or separate board-vote rows',JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all())===schemaBefore&&!one('SELECT 1 FROM site_board_votes'));
 console.log('\n'+ok+'/'+n+' bounded application talent collection checks passed; actual Worker/SQLite, mocked Discord only');process.exit(ok===n?0:1);
}
const run197=new Module(__filename,module);run197.filename=__filename;run197.paths=Module._nodeModulePaths(__dirname);run197._compile(prefix197+'\n('+applicationTalentCollection197.toString()+')().catch(error=>{console.error(error.stack);process.exit(1);});',__filename);
