// .164: actual role helper + Discord credential wrapper + Native SQLite; only provider HTTP is synthetic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),root=path.join(__dirname,'..'),cache=new Map();
let f,passed=0,failed=0;
globalThis.fetch=async(url,init={})=>{
 const pathname=new URL(url).pathname.replace('/api/v10',''),method=init.method||'GET';f.http.push({method,path:pathname});
 await f.beforeHTTP?.(method,pathname);
 let value;
 if(method==='GET'&&pathname===`/guilds/${f.env.GUILD_ID}/roles`)value=f.inventory;
 else if(method==='GET'&&pathname==='/users/@me')value={id:BOT,bot:true};
 else if(method==='GET'&&pathname===`/guilds/${f.env.GUILD_ID}/members/${BOT}`)value={user:{id:BOT},roles:[BOT_ROLE]};
 else if(method==='GET'&&pathname===`/guilds/${f.env.GUILD_ID}/members/${SUBJECT}`){if(f.memberMissing)return new Response('',{status:404});value={user:{id:SUBJECT},roles:[...f.present]};}
 else if(method==='DELETE'&&pathname.startsWith(`/guilds/${f.env.GUILD_ID}/members/${SUBJECT}/roles/`)){
  const id=pathname.split('/').at(-1);if(f.forbidden)return new Response('{"code":50013}',{status:403});
  if(!f.noDeleteEffect)f.present.delete(id);if(f.loseDelete){f.loseDelete=false;throw Error('synthetic lost DELETE reply');}return new Response(null,{status:204});
 }else throw Error('unexpected provider route '+method+' '+pathname);
 await f.afterHTTP?.(method,pathname);return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
};
function load(name){if(cache.has(name))return cache.get(name).exports;const m={exports:{}};cache.set(name,m);const js=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',js)(m,m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p));return m.exports;}
const M=load('privacy-native-erasure-roles'),P=load('beta-reset-policy');
const id=n=>String(800000000000000000n+BigInt(n)),GUILD=P.BETA_RESET_GUILD_ID,SUBJECT=id(1),BOT=id(2),BOT_ROLE=id(3),MEMBER=id(4),OFFICER=id(5),LEADER=id(6),RAID=id(7),MOD=id(8),BLOCK=id(9),COUNCIL=id(10),COUNCIL_OFFICER=id(11),UNRELATED=id(12),RETIRED=id(13),HISTORIC=id(14);
const FRESH=Array.from({length:11},(_,i)=>id(30+i)),QR=Array.from({length:5},(_,i)=>id(50+i));
const OP='a'.repeat(32),GEN='b'.repeat(32),INC='c'.repeat(32),DIGEST='d'.repeat(64),CLOCK=1800000000;
const proof=()=>({purpose:'account_erasure',subject:SUBJECT,subjectGeneration:GEN,operationId:OP,requestDigest:DIGEST,accountIncarnation:INC});
const role=(rid,name='Olympus fixture',extra={})=>({id:rid,name,position:5,permissions:'0',managed:false,...extra});
function fixture(){
 f?.db.close();const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));db.function('strftime',(fmt,input)=>{assert.equal(fmt,'%s');assert.equal(input,'now');return String(CLOCK);});
 const env={GUILD_ID:GUILD,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'synthetic-token',PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',ROLE_GUILD_MEMBER:MEMBER,ROLE_OFFICER:OFFICER,ROLE_GUILD_LEADER:LEADER,ROLE_GUILD_MASTER:'',ROLE_RAID_LEADER:RAID,ROLE_MODERATOR:MOD,MEMBERSHIP_RETIRED_ROLE_ID:RETIRED,BLOCKING_ROLE_IDS:BLOCK,
  QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:QR}),FULL_RELEASE_ROLES:JSON.stringify({version:1,epoch:'olympus-full-release-fixture',epochStart:1793833200,grants:true,membership:FRESH[0],native:FRESH.slice(1)})};
 const targets=[...new Set([...P.BETA_RESET_ROLE_IDS,MEMBER,OFFICER,LEADER,RAID,RETIRED,...FRESH,...QR,COUNCIL,COUNCIL_OFFICER])];
 f={db,env,present:new Set(),http:[],native:0,targets,inventory:[role(GUILD,'@everyone',{position:0}),...targets.map(x=>role(x)),role(BOT_ROLE,'integration',{managed:true,position:100,permissions:'268435456'}),role(MOD,'Server Moderator'),role(BLOCK,'Quarantine'),role(UNRELATED,'Other game')]};
 f.inventory.find(r=>r.id===COUNCIL).name='Olympus Council GM';f.inventory.find(r=>r.id===COUNCIL_OFFICER).name='Olympus Council Officer';
 function prepare(sql){let args=[];const s={bind(...v){args=v;return s;},async first(col){f.native++;const r=db.prepare(sql).get(...args);await f.afterSQL?.(sql,r);return col?r?.[col]:r??null;},async all(){f.native++;const results=db.prepare(sql).all(...args);await f.afterSQL?.(sql,results);return{success:true,results,meta:{}};},async run(){f.native++;const x=db.prepare(sql).run(...args);await f.afterSQL?.(sql,x);return{success:true,results:[],meta:{changes:Number(x.changes)}};}};return s;}
 env.DB={prepare};db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,account_incarnation)VALUES(?,?,?,?,?)').run(SUBJECT,'fixture',CLOCK,CLOCK,INC);
 db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'retiring',1,?,?)").run(SUBJECT,GEN,CLOCK,CLOCK);
 db.prepare("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until,original_account_incarnation)VALUES(?,?,?,?,1,?,'waiting_role',?,?,?)").run(OP,SUBJECT,GEN,DIGEST,CLOCK+600,CLOCK,CLOCK+31622400,INC);return f;
}
function check(name,value){if(value)passed++;else failed++;console.log((value?'PASS ':'FAIL ')+name);}
const deletes=()=>f.http.filter(x=>x.method==='DELETE'),rows=()=>f.db.prepare('SELECT * FROM role_settlements ORDER BY rowid').all();
const run=()=>M.cleanupNativeErasureRoles(f.env,proof());
function receiptCurrent(r,p=proof()){const sql=M.nativeErasureRolesSettledSql(f.env,p,r.receipt);return f.db.prepare('SELECT ('+sql+') AS ok').get(OP,SUBJECT,GEN,DIGEST).ok===1;}
(async()=>{
 fixture();let r=await run();check('all absent issues source-owned fresh receipt',r.state==='complete'&&r.remaining===0&&receiptCurrent(r));
 check('no residual roles reports no independent staff access',r.staffAccess==='none');
 check('attribution includes fixed beta, full fresh, native, retired, leadership and both exact Council IDs',r.attributed===f.targets.length);
 check('all absent does not write provider effects',deletes().length===0&&rows().every(x=>x.attempts===0));
 check('a copied receipt cannot acquire terminal authority',(()=>{try{M.nativeErasureRolesSettledSql(f.env,proof(),{});return false;}catch{return true;}})());
 check('a different operation cannot borrow receipt',(()=>{try{M.nativeErasureRolesSettledSql(f.env,{...proof(),operationId:'e'.repeat(32)},r.receipt);return false;}catch{return true;}})());
 fixture();f.present=new Set([...f.targets,MOD,BLOCK,UNRELATED]);let slices=0,total=0;
 do{const h=f.http.length,n=f.native;r=await run();const calls=f.http.slice(h),effects=calls.filter(x=>x.method==='DELETE');check('slice '+(++slices)+' limits DELETEs and HTTP',effects.length<=2&&calls.length<=M.NATIVE_ERASURE_ROLE_HTTP_MAX);check('slice '+slices+' has bounded Native statements',f.native-n<=18);total+=effects.length;}while(r.state!=='complete'&&slices<30);
 check('multi-tick continuation removes every attributable role',r.state==='complete'&&total===f.targets.length&&f.targets.every(x=>!f.present.has(x)));
 check('global moderator, ban/blocking and unrelated roles remain',f.present.size===3&&[MOD,BLOCK,UNRELATED].every(x=>f.present.has(x)));
 check('retained configured Moderator access is human-managed without blocking local completion',r.state==='complete'&&r.staffAccess==='human-managed');
 check('every actual DELETE has a separate acknowledged row',rows().filter(x=>x.purpose===M.NATIVE_ERASURE_ROLE_PURPOSE).length===total&&rows().filter(x=>x.attempts===1).every(x=>x.reason==='delete_acknowledged'&&x.state==='settled'));
 fixture();f.present.add(MEMBER);f.loseDelete=true;r=await run();const unknown=rows().find(x=>x.purpose===M.NATIVE_ERASURE_ROLE_PURPOSE),before=JSON.stringify(unknown);
 check('lost DELETE response remains unknown and yields no completion',r.state==='unknown'&&!r.receipt&&unknown.state==='unknown');
 r=await run();check('later independent GET absence can complete',r.state==='complete'&&receiptCurrent(r));check('later absence never relabels original unknown effect',JSON.stringify(rows().find(x=>x.id===unknown.id))===before&&deletes().length===1);
 fixture();f.present.add(MEMBER);f.loseDelete=true;f.noDeleteEffect=true;r=await run();const first=rows().find(x=>x.purpose===M.NATIVE_ERASURE_ROLE_PURPOSE);f.noDeleteEffect=false;r=await run();
 check('idempotent retry has distinct effect identity and preserves old unknown',r.state==='complete'&&rows().filter(x=>x.purpose===M.NATIVE_ERASURE_ROLE_PURPOSE).length===2&&rows().find(x=>x.id===first.id).state==='unknown');
 for(const [label,change,reason] of [['managed',()=>{f.inventory.find(x=>x.id===OFFICER).managed=true;},'native_role_managed'],['above bot',()=>{f.inventory.find(x=>x.id===OFFICER).position=101;},'native_role_above_bot'],['no permission',()=>{f.inventory.find(x=>x.id===BOT_ROLE).permissions='0';},'native_role_manage_roles_missing']]){fixture();f.present.add(OFFICER);change();r=await run();check(label+' remains pending without effect or false success',r.state==='held'&&r.reason===reason&&!r.receipt&&deletes().length===0&&f.present.has(OFFICER));}
 fixture();f.present=new Set([OFFICER,MEMBER]);f.inventory.find(x=>x.id===OFFICER).managed=true;r=await run();check('an unremovable role does not starve other authorized cleanup',r.state==='held'&&r.reason==='native_role_managed'&&f.present.has(OFFICER)&&!f.present.has(MEMBER)&&deletes().length===1);
 fixture();f.present.add(OFFICER);f.forbidden=true;r=await run();check('provider refusal is durable pending/unknown, not successful removal',r.state==='unknown'&&r.reason==='native_role_provider_forbidden'&&f.present.has(OFFICER)&&rows().some(x=>x.attempts===1&&x.state==='unknown'));
 fixture();f.env.ROLE_OFFICER=MOD;r=await run();check('protected moderator collision holds entire cleanup',r.state==='held'&&r.reason==='native_role_protected_collision'&&deletes().length===0);
 fixture();f.env.ROLE_OFFICER=BLOCK;r=await run();check('blocking-role collision cannot erase the restriction',r.state==='held'&&r.reason==='native_role_protected_collision'&&deletes().length===0);
 fixture();f.inventory.push(role(id(70),'Olympus Council GM'));r=await run();check('ambiguous exact Council name holds without broad guessing',r.state==='held'&&r.reason==='native_role_council_ambiguous'&&deletes().length===0);
 fixture();f.inventory.push(role(id(70),'Olympus Council GM helper'));f.present.add(id(70));r=await run();check('Council substring is not attribution',r.state==='complete'&&f.present.has(id(70)));
 fixture();f.memberMissing=true;r=await run();check('member404 supplies current absence without provider mutation',r.state==='complete'&&receiptCurrent(r)&&deletes().length===0&&r.staffAccess==='none');
 fixture();f.inventory.find(x=>x.id===UNRELATED).permissions='8';f.present.add(UNRELATED);r=await run();check('retained unrelated Administrator role is human-managed and never removed',r.state==='complete'&&r.staffAccess==='human-managed'&&f.present.has(UNRELATED)&&deletes().length===0);
 fixture();f.present.add(UNRELATED);r=await run();check('unrelated retained role with unknown channel overrides reports unknown access',r.state==='complete'&&r.staffAccess==='unknown'&&f.present.has(UNRELATED)&&deletes().length===0);
 fixture();f.present.add(GUILD);r=await run();check('only ordinary everyone role permits none projection',r.state==='complete'&&r.staffAccess==='none');
 fixture();f.inventory.find(x=>x.id===GUILD).permissions='8';r=await run();check('Administrator on everyone remains known independent access',r.state==='complete'&&r.staffAccess==='human-managed');
 fixture();f.env.PRIVACY_NATIVE_ERASURE_ENABLED='false';r=await run();check('default/false native mode performs no cleanup or SQL',r.state==='held'&&r.reason==='native_erasure_disabled'&&f.native===0&&f.http.length===0);
 fixture();f.env.PRIVACY_ERASURE_ENABLED='false';r=await run();check('native serving alone cannot authorize role erasure',r.state==='held'&&r.reason==='erasure_disabled'&&f.native===0&&f.http.length===0);
 fixture();f.present.add(OFFICER);f.afterHTTP=async(method,p)=>{if(p==='/users/@me')f.db.prepare('UPDATE site_users SET account_incarnation=? WHERE discord_id=?').run('e'.repeat(32),SUBJECT);};r=await run();check('recreated account incarnation prevents subsequent DELETE',r.state==='held'&&deletes().length===0);
 fixture();f.present.add(OFFICER);f.afterHTTP=async(method,p)=>{if(p==='/users/@me')f.env.ROLE_OFFICER=UNRELATED;};r=await run();check('original configuration witness rejects change after await',r.state==='unknown'&&deletes().length===0);
 fixture();let getter=0;Object.defineProperty(f.env,'ROLE_OFFICER',{get(){getter++;return OFFICER;},enumerable:true});r=await run();check('accessor config is not invoked and never causes effect',getter===0&&r.state!=='complete'&&deletes().length===0);
 fixture();f.inventory.push(role(HISTORIC,'Olympus previous configured role'));f.present.add(HISTORIC);f.db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,attempts,claim_nonce)VALUES(?,?,'roster_privileged_rank',?,?,1,'unknown','original_unknown',?,?,?, ?,1,?)").run('f'.repeat(32),SUBJECT,GUILD,HISTORIC,GEN,DIGEST,CLOCK-100,CLOCK+100,'e'.repeat(32));const historical=JSON.stringify(rows()[0]);r=await run();
 check('known guild-role family provides target attribution without requiring old grant ACK',r.state==='complete'&&!f.present.has(HISTORIC));check('original historical unknown grant tuple remains intact',JSON.stringify(rows()[0])===historical);
 fixture();r=await run();f.db.prepare("UPDATE role_settlements SET native_profile='[]' WHERE purpose='native_account_erasure_inventory'").run();check('consuming receipt detects target-list substitution',!receiptCurrent(r));
 fixture();r=await run();f.db.prepare('UPDATE site_users SET account_incarnation=? WHERE discord_id=?').run('e'.repeat(32),SUBJECT);const sql=M.nativeErasureRolesSettledSql(f.env,proof(),r.receipt);check('terminal receipt alone does not override original job birth/current proof',!f.db.prepare('SELECT ('+load('privacy-serving-authority').CURRENT_ERASURE_SQL+' AND '+sql+') AS ok').get(OP,SUBJECT,GEN,DIGEST).ok);
 f.db.close();console.log(`\n${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
