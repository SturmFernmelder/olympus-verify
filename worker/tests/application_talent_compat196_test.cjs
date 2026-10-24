// Actual Worker, original authenticated fixture and admitted SQLite. Discord alone is synthetic.
const fs196=require('node:fs'),path196=require('node:path'),crypto196=require('node:crypto'),{Module}=require('node:module');
const helper196=fs196.readFileSync(path196.join(__dirname,'frontend_check.cjs'),'utf8'),starts196=[...helper196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(starts196.length!==1)throw Error('talent196_original_frontend_setup_boundary');
const prefix196=helper196.slice(0,starts196[0].index);
if(crypto196.createHash('sha256').update(prefix196).digest('hex')!=='7b72fd253e127dfa0379b0528adb5a05c9ae8e92655fd6c9b2e468ce201300f1')throw Error('talent196_original_frontend_setup_drift');
async function applicationTalent196(){
 await siteUser(MEMBER,{global_name:'Mia'});await character(MEMBER,'Mia One','Player-1-0001');
 await siteUser(OTHER,{global_name:'Oz'});await character(OTHER,'Oz Two','Player-1-0002');
 const data=JSON.parse(fs.readFileSync(path.join(root,'public/static/talents/data.json'))),count=data.classes.find(c=>c.id==='warrior').trees.flatMap(t=>t.talents).length;
 const current='ot1.'+data.revision+'.warrior.60.'+'0'.repeat(count),legacy=current.replace(data.revision,'f'.repeat(12));
 const body={position:'member',backups:[],class:'warrior',role:'dps',region:'eu',character:'Mia One',fallback:true,ack:true,board:false,avail:'f'.repeat(42),availTz:'Europe/Stockholm',answers:{experience:'A synthetic original application.',why:'A fictional guild application.',voice:'yes',talentBuild:current}};
 const request=async(payload,who=MEMBER)=>{const response=await indexMod.default.fetch(new Request('https://guild.example/api/application',{method:'PUT',headers:{Cookie:await cookieFor(who),Origin:'https://guild.example','X-Olympus':siteCore.PAGE_VERSION,'Content-Type':'application/json'},body:JSON.stringify(payload)}),env(),ctx);return {response,body:await response.clone().json().catch(()=>null)};};
 const stored=()=>JSON.parse(one('SELECT answers FROM site_applications WHERE discord_id=?',MEMBER).answers);
 let r=await request(body);check('current attachment is accepted through the real own application API',r.response.status===200&&stored().talentBuild===current);
 // A prior stored value supplied only by the original admitted setup writer.
 await fixtureRun("UPDATE site_applications SET answers=json_set(answers,'$.talentBuild',?) WHERE discord_id=?",legacy,MEMBER);
 r=await request({...body,answers:{...body.answers,why:'A newly edited reason retaining the original attachment.',talentBuild:legacy}});
 check('unchanged stored historical code does not block an unrelated edit',r.response.status===200&&stored().talentBuild===legacy&&stored().why==='A newly edited reason retaining the original attachment.');
 for(const code of [legacy+'0',legacy.replace('.60.','.59.'),'https://guild.example/#/talents/warrior/'+legacy]){
  r=await request({...body,answers:{...body.answers,talentBuild:code}});
  check('changed or newly wrapped historical code is refused without changing stored evidence',r.response.status===400&&r.body?.field==='talentBuild'&&stored().talentBuild===legacy);
 }
 r=await request({...body,class:'mage',answers:{...body.answers,talentBuild:legacy}});
 check('historical attachment cannot follow a changed selected class',r.response.status===400&&r.body?.field==='talentBuild'&&stored().talentBuild===legacy);
 r=await request({...body,answers:{...body.answers,talentBuild:legacy}},OTHER);
 check('another account cannot submit the first account historical code',r.response.status===400&&r.body?.field==='talentBuild'&&!one('SELECT 1 FROM site_applications WHERE discord_id=?',OTHER));
 r=await request({...body,answers:{...body.answers,talentBuild:''}});
 check('explicit clearing removes only the old attachment',r.response.status===200&&!Object.hasOwn(stored(),'talentBuild'));
 r=await request({...body,answers:{...body.answers,talentBuild:legacy}});
 check('cleared historical code cannot be newly adopted from client input',r.response.status===400&&r.body?.field==='talentBuild'&&!Object.hasOwn(stored(),'talentBuild'));
 r=await request(body);check('new valid current attachment replaces the cleared value',r.response.status===200&&stored().talentBuild===current);
 const invalidCurrent=current.slice(0,-1)+'5';await fixtureRun("UPDATE site_applications SET answers=json_set(answers,'$.talentBuild',?) WHERE discord_id=?",invalidCurrent,MEMBER);
 r=await request({...body,answers:{...body.answers,talentBuild:invalidCurrent}});
 check('invalid current revision does not bypass validation through retention',r.response.status===400&&r.body?.field==='talentBuild');
 console.log('\n'+ok+'/'+n+' application talent compatibility checks passed; actual Worker/SQLite, mocked Discord only');process.exit(ok===n?0:1);
}
const run196=new Module(__filename,module);run196.filename=__filename;run196.paths=Module._nodeModulePaths(__dirname);run196._compile(prefix196+'\n('+applicationTalent196.toString()+')().catch(error=>{console.error(error.stack);process.exit(1);});',__filename);
