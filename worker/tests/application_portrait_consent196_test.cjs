// .201: current Officer applications are reserved. Explicit pre-policy rows are
// normalized by the real historical parser, then read/withdrawn by the actual
// Worker. No fixture call substitutes for the current admission route.
const fs196=require('node:fs'),path196=require('node:path'),crypto196=require('node:crypto'),{Module}=require('node:module');
const helper196=fs196.readFileSync(path196.join(__dirname,'frontend_check.cjs'),'utf8'),starts196=[...helper196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(starts196.length!==1)throw Error('portrait196_original_frontend_setup_boundary');
const prefix196=helper196.slice(0,starts196[0].index),prefixSHA196=crypto196.createHash('sha256').update(prefix196).digest('hex');
if(prefixSHA196!=='bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5')throw Error('portrait196_original_frontend_setup_drift');
async function portraitConsent196(){
 await siteUser(MEMBER,{global_name:'Mia'});await character(MEMBER,'Mia One','Player-1-0001');
 await siteUser(OTHER,{global_name:'Oz'});await character(OTHER,'Oz Two','Player-1-0002');
 await fixtureRun('UPDATE site_users SET avatar=? WHERE discord_id=?','u:'+'a'.repeat(32),MEMBER);
 const originalSchema=JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()),originalDirectoryPreference=JSON.stringify(db.prepare("SELECT key,value FROM site_settings WHERE key='discordDirectoryHidden'").all());
 const body={position:'officer',backups:[],class:'mage',role:'dps',region:'eu',character:'Mia One',fallback:true,ack:true,board:true,avail:'f'.repeat(42),availTz:'Europe/Stockholm',answers:{experience:'Played a mage through original raid progression.',why:'I want to join the guild and help other members.',leadership:'Led groups through original raid encounters.',scenario:'Hear both people and use the agreed loot rules.',hours:'10to20',voice:'yes'}};
 const request=async(method,url,payload,who=MEMBER)=>{const response=await indexMod.default.fetch(new Request('https://guild.example'+url,{method,headers:{Cookie:await cookieFor(who),Origin:'https://guild.example','X-Olympus':siteCore.PAGE_VERSION,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env(),ctx);return {response,body:await response.clone().json().catch(()=>null)};};
 const historicalFixture196=async(payload)=>{
  const fixture=await require('./historical_application201_fixture.cjs').historicalApplicationFixture201({validate:load('./site-api').validateApplication,run:fixtureRun,previous:id=>one('SELECT * FROM site_applications WHERE discord_id=?',id),id:MEMBER,payload,time:now});
  if('error' in fixture.validation)return{...fixture,body:fixture.validation};
  return{...await request('GET','/api/me'),...fixture};
 };
 const stored=()=>{const row=one('SELECT board_at,answers FROM site_applications WHERE discord_id=?',MEMBER);return row?{boardAt:row.board_at,answers:JSON.parse(row.answers)}:null;};
 const candidate=async()=>{const result=await request('GET','/api/board/officer',undefined,OTHER);check('actual board request remains admitted for the original eligible voter',result.response.status===200);return result.body.candidates.find(row=>row.id===MEMBER);};
 let saved=await request('PUT','/api/application',body);
 check('current Officer submission is reserved before any compatibility fixture is seeded',saved.response.status===403&&saved.body?.error==='reserved_seat'&&!stored());
 saved=await historicalFixture196(body);
 check('a historical normalized board-consent fixture has no portrait opt-in',saved.response.status===200&&saved.body?.application?.boardAt>0&&stored().answers.boardPortraitOptIn===false);
 // Exact older-row shape, through the same admitted fixture writer: .195 had
 // board_at but no separate portrait flag. No production migration is invented.
 await fixtureRun("UPDATE site_applications SET answers=json_remove(answers,'$.boardPortraitOptIn') WHERE discord_id=?",MEMBER);
 check('the pre-existing legacy board row has no newly inferred portrait flag',!Object.hasOwn(stored().answers,'boardPortraitOptIn'));
 const originalBoardAt=stored().boardAt,legacyCard=await candidate();
 check('legacy board_at alone cannot expose the stored Discord picture',legacyCard?.avatarUrl===null&&legacyCard?.label==='Mia (@u03)'&&legacyCard?.class==='mage',legacyCard);
 saved=await historicalFixture196({...body,answers:{...body.answers,boardPortraitOptIn:true}});
 check('a forged client answers flag is ignored by server normalization',saved.response.status===200&&stored().answers.boardPortraitOptIn===false&&(await candidate()).avatarUrl===null);
 saved=await historicalFixture196({...body,boardPortrait:true});
 check('historical parser fixture records its explicit separate portrait choice',saved.response.status===200&&saved.body.application.answers.boardPortraitOptIn===true&&stored().boardAt===originalBoardAt);
 const opted=await candidate();
 check('only the opted-in card receives the bounded stored Discord avatar URL',opted.avatarUrl==='https://cdn.discordapp.com/avatars/'+MEMBER+'/'+'a'.repeat(32)+'.png?size=64',opted);
 console.log('PORTRAIT196_SYNTHETIC_BOARD_CARDS '+JSON.stringify({legacy:legacyCard,optedIn:opted}));
 check('the public board still exposes only original written board answers',!Object.hasOwn(opted.answers,'boardPortraitOptIn')&&!Object.hasOwn(opted.answers,'ackAt')&&!Object.hasOwn(opted,'boardAt'));
 const own=await request('GET','/api/me/export');
 check('the original own export includes the member own normalized consent choice',own.response.status===200&&own.body.site?.application?.answers?.boardPortraitOptIn===true);
 const beforeMalformed=JSON.stringify(stored());
 for(const value of ['true',1,null,{},[]]){const refused=await historicalFixture196({...body,boardPortrait:value});check('nonboolean portrait '+JSON.stringify(value)+' is refused without changing the application',refused.validation?.error==='invalid'&&refused.body?.field==='boardPortrait'&&JSON.stringify(stored())===beforeMalformed);}
 saved=await historicalFixture196({...body,boardPortrait:false});
 check('historical unchecked fixture preserves first board consent and suppresses the portrait',saved.response.status===200&&stored().answers.boardPortraitOptIn===false&&stored().boardAt===originalBoardAt&&(await candidate()).avatarUrl===null);
 await historicalFixture196({...body,boardPortrait:true});saved=await historicalFixture196(body);
 check('an old client missing the new field cannot retain or introduce a new portrait opt-in',saved.response.status===200&&stored().answers.boardPortraitOptIn===false&&stored().boardAt===originalBoardAt);
 // The old editor's fresh-consent workflow is intentionally retired by .201.
 // Retained public/own-copy shapes remain covered above; a current HTTP PUT
 // cannot edit or republish a reserved application, even with valid consent.
 const beforeCurrent=JSON.stringify(stored());
 saved=await request('PUT','/api/application',{...body,boardPortrait:true});
 check('current reserved edit cannot newly publish a portrait or alter the retained row',saved.response.status===403&&saved.body?.error==='reserved_seat'&&JSON.stringify(stored())===beforeCurrent);
 saved=await request('PUT','/api/application',{...body,answers:{...body.answers,boardPortraitOptIn:true}});
 check('current old-client reserved edit cannot forge a retained portrait consent',saved.response.status===403&&saved.body?.error==='reserved_seat'&&JSON.stringify(stored())===beforeCurrent);
 const retained=await request('GET','/api/me');
 check('reserved own application remains readable with the original separate portrait choice',retained.response.status===200&&retained.body.application.position==='officer'&&retained.body.application.answers.boardPortraitOptIn===false);
 const withdrawal=await request('DELETE','/api/application');
 check('reserved historical application can be withdrawn through the current route',withdrawal.response.status===200&&withdrawal.body.application.status==='withdrawn'&&!(await candidate()));
 saved=await request('PUT','/api/application',{...body,position:'member',backups:[],board:false,boardPortrait:true});
 check('a role with no board cannot store portrait publication authority',saved.response.status===200&&stored().boardAt===null&&stored().answers.boardPortraitOptIn===false);
 check('new consent changes no Native schema, board vote or separate Discord directory preference',JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all())===originalSchema&&!one('SELECT 1 FROM site_board_votes')&&JSON.stringify(db.prepare("SELECT key,value FROM site_settings WHERE key='discordDirectoryHidden'").all())===originalDirectoryPreference);
 await require('./application_board_consent210_test.cjs');
 console.log('\n'+ok+'/'+n+' historical portrait parser/board/copy checks passed; current reserved edits denied and withdrawal admitted');process.exit(ok===n?0:1);
}
const run196=new Module(__filename,module);run196.filename=__filename;run196.paths=Module._nodeModulePaths(__dirname);run196._compile(prefix196+'\n('+portraitConsent196.toString()+')().catch(error=>{console.error(error.stack);process.exit(1);});',__filename);
