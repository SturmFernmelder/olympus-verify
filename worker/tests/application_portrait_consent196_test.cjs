// Unevaluated successor after retained24/26 on1889. Actual app, Worker, original session
// issuer and admitted SQLite fixture; Discord transport alone is synthetic.
const fs196=require('node:fs'),path196=require('node:path'),crypto196=require('node:crypto'),{Module}=require('node:module');
const helper196=fs196.readFileSync(path196.join(__dirname,'frontend_check.cjs'),'utf8'),starts196=[...helper196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(starts196.length!==1)throw Error('portrait196_original_frontend_setup_boundary');
const prefix196=helper196.slice(0,starts196[0].index),prefixSHA196=crypto196.createHash('sha256').update(prefix196).digest('hex');
if(prefixSHA196!=='7b72fd253e127dfa0379b0528adb5a05c9ae8e92655fd6c9b2e468ce201300f1')throw Error('portrait196_original_frontend_setup_drift');
async function portraitConsent196(){
 await siteUser(MEMBER,{global_name:'Mia'});await character(MEMBER,'Mia One','Player-1-0001');
 await siteUser(OTHER,{global_name:'Oz'});await character(OTHER,'Oz Two','Player-1-0002');
 await fixtureRun('UPDATE site_users SET avatar=? WHERE discord_id=?','u:'+'a'.repeat(32),MEMBER);
 const originalSchema=JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()),originalDirectoryPreference=JSON.stringify(db.prepare("SELECT key,value FROM site_settings WHERE key='discordDirectoryHidden'").all());
 const body={position:'officer',backups:[],class:'mage',role:'dps',region:'eu',character:'Mia One',fallback:true,ack:true,board:true,avail:'f'.repeat(42),availTz:'Europe/Stockholm',answers:{experience:'Played a mage through original raid progression.',why:'I want to join the guild and help other members.',leadership:'Led groups through original raid encounters.',scenario:'Hear both people and use the agreed loot rules.',hours:'10to20',voice:'yes'}};
 const request=async(method,url,payload,who=MEMBER)=>{const response=await indexMod.default.fetch(new Request('https://guild.example'+url,{method,headers:{Cookie:await cookieFor(who),Origin:'https://guild.example','X-Olympus':siteCore.PAGE_VERSION,...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env(),ctx);return {response,body:await response.clone().json().catch(()=>null)};};
 const stored=()=>{const row=one('SELECT board_at,answers FROM site_applications WHERE discord_id=?',MEMBER);return row?{boardAt:row.board_at,answers:JSON.parse(row.answers)}:null;};
 const candidate=async()=>{const result=await request('GET','/api/board/officer',undefined,OTHER);check('actual board request remains admitted for the original eligible voter',result.response.status===200);return result.body.candidates.find(row=>row.id===MEMBER);};
 let saved=await request('PUT','/api/application',body);
 check('a legacy current-version client saves its ordinary board consent without a portrait opt-in',saved.response.status===200&&saved.body?.application?.boardAt>0&&stored().answers.boardPortraitOptIn===false);
 // Exact older-row shape, through the same admitted fixture writer: .195 had
 // board_at but no separate portrait flag. No production migration is invented.
 await fixtureRun("UPDATE site_applications SET answers=json_remove(answers,'$.boardPortraitOptIn') WHERE discord_id=?",MEMBER);
 check('the pre-existing legacy board row has no newly inferred portrait flag',!Object.hasOwn(stored().answers,'boardPortraitOptIn'));
 const originalBoardAt=stored().boardAt,legacyCard=await candidate();
 check('legacy board_at alone cannot expose the stored Discord picture',legacyCard?.avatarUrl===null&&legacyCard?.label==='Mia (@u03)'&&legacyCard?.class==='mage',legacyCard);
 saved=await request('PUT','/api/application',{...body,answers:{...body.answers,boardPortraitOptIn:true}});
 check('a forged client answers flag is ignored by server normalization',saved.response.status===200&&stored().answers.boardPortraitOptIn===false&&(await candidate()).avatarUrl===null);
 saved=await request('PUT','/api/application',{...body,boardPortrait:true});
 check('fresh explicit top-level boolean records the separate optional portrait choice',saved.response.status===200&&saved.body.application.answers.boardPortraitOptIn===true&&stored().boardAt===originalBoardAt);
 const opted=await candidate();
 check('only the opted-in card receives the bounded stored Discord avatar URL',opted.avatarUrl==='https://cdn.discordapp.com/avatars/'+MEMBER+'/'+'a'.repeat(32)+'.png?size=64',opted);
 console.log('PORTRAIT196_SYNTHETIC_BOARD_CARDS '+JSON.stringify({legacy:legacyCard,optedIn:opted}));
 check('the public board still exposes only original written board answers',!Object.hasOwn(opted.answers,'boardPortraitOptIn')&&!Object.hasOwn(opted.answers,'ackAt')&&!Object.hasOwn(opted,'boardAt'));
 const own=await request('GET','/api/me/export');
 check('the original own export includes the member own normalized consent choice',own.response.status===200&&own.body.site?.application?.answers?.boardPortraitOptIn===true);
 const beforeMalformed=JSON.stringify(stored());
 for(const value of ['true',1,null,{},[]]){const refused=await request('PUT','/api/application',{...body,boardPortrait:value});check('nonboolean portrait '+JSON.stringify(value)+' is refused without changing the application',refused.response.status===400&&refused.body?.field==='boardPortrait'&&JSON.stringify(stored())===beforeMalformed);}
 saved=await request('PUT','/api/application',{...body,boardPortrait:false});
 check('explicit unchecked save withdraws portrait consent and preserves first board consent',saved.response.status===200&&stored().answers.boardPortraitOptIn===false&&stored().boardAt===originalBoardAt&&(await candidate()).avatarUrl===null);
 await request('PUT','/api/application',{...body,boardPortrait:true});saved=await request('PUT','/api/application',body);
 check('an old client missing the new field cannot retain or introduce a new portrait opt-in',saved.response.status===200&&stored().answers.boardPortraitOptIn===false&&stored().boardAt===originalBoardAt);
 // The actual form starts from the saved old-consent application. No synthetic
 // boot or substituted API response supplies the portrait state.
 const page=await openPage(MEMBER),sent=[];page.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT')sent.push(JSON.parse(init.body));return false;});await page.go('#/apply');
 check('the actual old application form offers a separate initially unchecked portrait checkbox',await waitFor(()=>!!page.app.querySelector('#board-portrait-opt-in'),'separate portrait checkbox')&&page.app.querySelector('#board-portrait-opt-in').checked===false&&page.app.querySelector('#board-portrait-opt-in').disabled===false);
 check('portrait text explicitly separates earlier board consent and optional picture publication',page.app.textContent.includes('Earlier board consent did not include a Discord picture')&&page.app.textContent.includes('profile picture on the voting board (optional)'));
 let portrait=page.app.querySelector('#board-portrait-opt-in'),form=portrait.closest('form'),ack=form.querySelector('[data-field="ack"] input');portrait.checked=true;fire(portrait,'change');ack.checked=true;fire(form,'submit');
 check('actual checked form sends a fresh top-level flag and source saves it',await waitFor(()=>stored().answers.boardPortraitOptIn===true,'source portrait opt-in save')&&sent.at(-1)?.boardPortrait===true&&!Object.hasOwn(sent.at(-1).answers,'boardPortraitOptIn'));
 check('successful actual own readback keeps the explicit selected choice',await waitFor(()=>page.app.querySelector('#board-portrait-opt-in')?.checked===true,'saved portrait choice'));
 portrait=page.app.querySelector('#board-portrait-opt-in');form=portrait.closest('form');ack=form.querySelector('[data-field="ack"] input');portrait.checked=false;fire(portrait,'change');ack.checked=true;fire(form,'submit');
 check('actual unchecked form sends false and source revokes the portrait without touching board_at',await waitFor(()=>stored().answers.boardPortraitOptIn===false,'source portrait withdrawal')&&sent.at(-1)?.boardPortrait===false&&stored().boardAt===originalBoardAt);
 saved=await request('PUT','/api/application',{...body,position:'member',backups:[],board:false,boardPortrait:true});
 check('a role with no board cannot store portrait publication authority',saved.response.status===200&&stored().boardAt===null&&stored().answers.boardPortraitOptIn===false);
 check('new consent changes no Native schema, board vote or separate Discord directory preference',JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all())===originalSchema&&!one('SELECT 1 FROM site_board_votes')&&JSON.stringify(db.prepare("SELECT key,value FROM site_settings WHERE key='discordDirectoryHidden'").all())===originalDirectoryPreference);
 console.log('\n'+ok+'/'+n+' separate board portrait consent checks passed; actual app/Worker/SQLite, mocked Discord only');process.exit(ok===n?0:1);
}
const run196=new Module(__filename,module);run196.filename=__filename;run196.paths=Module._nodeModulePaths(__dirname);run196._compile(prefix196+'\n('+portraitConsent196.toString()+')().catch(error=>{console.error(error.stack);process.exit(1);});',__filename);
