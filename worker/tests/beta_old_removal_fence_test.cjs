// Actual roles.ts/policy/Discord source over the existing installed-epoch Native fixture.
// Only Discord is simulated. These cases authorize no seal, drain, or role reuse.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),cache={},realFetch=globalThis.fetch,realNow=Date.now;
// The production origin captures fetch at import; keep this descriptor stable throughout every case.
let fixtureFetch=async()=>{throw Error('provider calls forbidden before fixture setup');};
globalThis.fetch=(...args)=>fixtureFetch(...args);
const entry=require('./helpers/privacy129_fixture.cjs');
globalThis.crypto=require('node:crypto').webcrypto;
function load(name){if(name==='node:async_hooks')return require(name);name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;new Function('module','exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,p=>load(p));return m.exports;}
const P=load('beta-reset-policy'),R=load('roles'),A=load('privacy-write-admission');
const guild=P.BETA_RESET_GUILD_ID,role=P.BETA_RESET_ROLE_IDS[0],subject='400000000000000002',owner='700000000000000001';
const freshRole='700000000000000088',otherGuild='700000000000000099',block='700000000000000077',modeKey='BETA_RESET_DISPATCH_SEAL_MODE';
let db,native,writer,env,clock=P.BETA_RESET_CUTOFF-10,providerRoles=[],requests=[],memberHook=null,effectHook=null,readHook=null,failDelete=false,passed=0;
Date.now=()=>clock*1000;
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
fixtureFetch=async(input,init={})=>{
 if(input instanceof Request){init={method:input.method,headers:input.headers,...init};input=input.url;}
 const url=new URL(String(input)),method=init.method||'GET';requests.push({method,path:url.pathname});
 const inventory=url.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/roles$/);
 if(inventory){assert.equal(inventory[1],env.GUILD_ID);assert.equal(method,'GET');return json([{id:env.ROLE_GUILD_MEMBER},{id:block}]);}
 const m=url.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);
 assert.ok(m,'only original role provider paths');assert.equal(m[1],env.GUILD_ID);assert.equal(m[2],subject);
 if(!m[3]){assert.equal(method,'GET');if(memberHook)await memberHook();return json({user:{id:subject},roles:[...providerRoles]});}
 assert.ok(['PUT','DELETE'].includes(method));assert.equal(m[3],env.ROLE_GUILD_MEMBER);
 if(method==='PUT')providerRoles=[...new Set([...providerRoles,m[3]])];
 if(method==='DELETE'&&!failDelete)providerRoles=providerRoles.filter(r=>r!==m[3]);
 if(effectHook)await effectHook(method);
 return method==='DELETE'&&failDelete?new Response('fixture provider failure',{status:503}):new Response(null,{status:204});
};
const write=(sql,...v)=>writer.prepare(sql).bind(...v).run();
const hold=()=>write("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at) VALUES(?,?,?,?,?,'reapply',?,?)",subject,'Old','New','old','fixture-hold',owner,clock);
const effects=()=>requests.filter(r=>r.method==='PUT'||r.method==='DELETE');
const deletes=()=>requests.filter(r=>r.method==='DELETE');
const actions=()=>db.prepare('SELECT action FROM audit ORDER BY id').all().map(r=>r.action);
const debt=()=>db.prepare('SELECT * FROM role_settlements ORDER BY id').all();
const budget=()=>({limit:40,attempts:0,calls:0,retries:0});
function check(label,ok){assert.ok(ok,label);passed++;console.log('PASS '+label);}
function clearTrace(){requests=[];native.nativeTrace.length=0;native.nativeGroups.length=0;}
async function fresh(layout,mode='absent',configuredRole=role,configuredGuild=guild){
 if(db)db.close();clock=P.BETA_RESET_CUTOFF-10;providerRoles=[configuredRole];requests=[];memberHook=null;effectHook=null;readHook=null;failDelete=false;
 db=new DatabaseSync(':memory:');db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 entry.installCurrentEntryEpoch(db,{now:clock,layout});
 native=entry.originalNativePort(db,{afterRead(sql,values,row){if(readHook)readHook(sql,values,row);}});
 env=entry.currentEntryEnvironment({DB:native,GUILD_ID:configuredGuild,SITE_GUILD_ID:configuredGuild,SITE_ADMINS:owner,DISCORD_APP_ID:'700000000000000002',DISCORD_BOT_TOKEN:'fixture-only',
  ROLE_GUILD_MEMBER:configuredRole,ROLE_GUILD_MASTER:'',ROLE_GUILD_LEADER:'1554261979684933742',ROLE_OFFICER:'1554262223038324840',ROLE_RAID_LEADER:'1554262510650007602',ROLE_MODERATOR:'571363393555136512',BLOCKING_ROLE_IDS:block,
  QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:[P.BETA_RESET_ROLE_IDS[2],P.BETA_RESET_ROLE_IDS[4],P.BETA_RESET_ROLE_IDS[7],P.BETA_RESET_ROLE_IDS[9],P.BETA_RESET_ROLE_IDS[11]]}),BETA_RESET_REMOVALS_ENABLED:'false'},{layout});
 writer=A.createPrivacyWriteAdmissionDatabase(native,'writer',layout,entry.ENTRY_EPOCH);env.DB=writer;
 if(mode!=='absent')Object.defineProperty(env,modeKey,{value:mode,writable:true,enumerable:true,configurable:true});
 await write('INSERT INTO members(discord_id) VALUES(?)',subject);R.forgetRolesCheck();clearTrace();
}
function invoke(kind,b=budget()){
 if(kind==='ban')return R.revokeForBan(env,subject,env.ROLE_GUILD_MEMBER,'fixture',b);
 if(kind==='reapply')return R.revokeForReapply(env,subject,'fixture');
 return R.removeIfBlocked(env,subject,[env.ROLE_GUILD_MEMBER,block],'fixture',b);
}
const held=(kind,out)=>out===(kind==='ban'?false:kind==='reapply'?'failed':null);
const removed=(kind,out)=>out===(kind==='ban'?true:kind==='reapply'?'removed':block);
async function noDispatch(label,kind){const before=JSON.stringify(debt()),out=await invoke(kind);
 check(label+' returns an explicit unsuccessful result',held(kind,out));
 check(label+' makes no provider or D1 operation and retains debt',requests.length===0&&native.nativeTrace.length===0&&JSON.stringify(debt())===before);}
(async()=>{
 for(const layout of ['canonical','recorded-live-20261010']){
  await fresh(layout);let c=P.captureBetaRemovalDispatch(env);
  check(layout+' absent original mode permits legacy fixed-target dispatch',P.betaRemovalDispatchLegacy(env,c,guild,role));
  check(layout+' copied or foreign capture cannot permit dispatch',!P.betaRemovalDispatchLegacy(env,{...c},guild,role)&&!P.betaRemovalDispatchLegacy({...env},c,guild,role));
  env[modeKey]='v1';check(layout+' original absent capture holds after mode appears',!P.betaRemovalDispatchLegacy(env,c,guild,role));
  c=P.captureBetaRemovalDispatch(env);delete env[modeKey];check(layout+' original v1 capture cannot become legacy after deletion',!P.betaRemovalDispatchLegacy(env,c,guild,role));
  check(layout+' caller cannot forge a legacy removal capture',await R.revokeForBan(env,subject,role,'fixture',budget(),undefined,{kind:'beta-removal-dispatch'})===false&&requests.length===0);

  for(const durable of [false,true]){
   await fresh(layout,'v1');if(durable)env.MEMBERSHIP_ROLE_SETTLEMENT_ENABLED='true';
   for(const target of P.BETA_RESET_ROLE_IDS){env.ROLE_GUILD_MEMBER=target;providerRoles=[target];
    for(const kind of ['ban','reapply','blocking'])await noDispatch(layout+' '+kind+' v1 '+(durable?'durable':'raw')+' target '+target,kind);}
  }
  for(const mode of [undefined,null,false,true,'false','','V1','unknown']){
   await fresh(layout);Object.defineProperty(env,modeKey,{value:mode,writable:true,enumerable:true,configurable:true});
   for(const kind of ['ban','reapply','blocking'])await noDispatch(layout+' '+kind+' malformed mode '+String(mode),kind);
  }
  for(const inherited of [false,true]){
   await fresh(layout);let reads=0;const target=inherited?{}:env;
   Object.defineProperty(target,modeKey,{get(){reads++;return 'v1';},configurable:true});if(inherited)Object.setPrototypeOf(env,target);
   for(const kind of ['ban','reapply','blocking'])await noDispatch(layout+' '+kind+' '+(inherited?'inherited':'own')+' accessor',kind);
   check(layout+' mode getter is never called',reads===0);
  }
  await fresh(layout);Object.setPrototypeOf(env,{[modeKey]:'v1'});
  for(const kind of ['ban','reapply','blocking'])await noDispatch(layout+' '+kind+' inherited data mode',kind);

  for(const kind of ['ban','reapply','blocking']){
   await fresh(layout);if(kind==='reapply')await hold();clearTrace();const b=budget(),out=await invoke(kind,b);
   check(layout+' '+kind+' absent mode retains original removal result',removed(kind,out));
   check(layout+' '+kind+' retains original provider sequence',requests.map(r=>r.method).join(',')===(kind==='reapply'?'GET,DELETE':'DELETE'));
   check(layout+' '+kind+' retains audit and creates no receipt',actions().join(',')===(kind==='ban'?'role.revoked_banned':kind==='reapply'?'role.revoked_reapply':'role.blocked_removed')&&debt().length===0);
   check(layout+' '+kind+' adds no policy lookup',native.nativeTrace.every(r=>!r.sql.startsWith('SELECT (SELECT value FROM site_settings WHERE key=?1)')));
   check(layout+' '+kind+' keeps legacy mandatory accounting',b.attempts===(kind==='blocking'?1:0)&&b.calls===(kind==='blocking'?1:0)&&b.retries===0);
  }
  for(const [target,targetGuild]of [[freshRole,guild],[role,otherGuild]])for(const mode of ['v1','invalid'])for(const kind of ['ban','reapply','blocking']){
   await fresh(layout,mode,target,targetGuild);if(kind==='reapply')await hold();clearTrace();
   check(layout+' '+kind+' preserves unrelated physical target '+target+'/'+targetGuild+' '+mode,removed(kind,await invoke(kind))&&deletes().length===1);
  }
  await fresh(layout);await write('INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?)',P.BETA_RESET_DISPATCH_SEAL_KEY,'{malformed',clock);clearTrace();
  check(layout+' absent mode keeps original behavior even with a retained seal',await invoke('ban')===true&&deletes().length===1);

  for(const at of ['member','hold-read']){
   await fresh(layout);await hold();clearTrace();
   if(at==='member')memberHook=()=>{env[modeKey]='v1';};
   else readHook=sql=>{if(sql.startsWith('SELECT 1 AS held FROM rename_holds'))env[modeKey]='v1';};
   check(layout+' reapply holds mode drift during '+at,await invoke('reapply')==='failed'&&deletes().length===0&&debt().length===0);
  }
  for(const initiallyV1 of [false,true])for(const cause of ['ban','hold']){
   await fresh(layout,initiallyV1?'v1':'absent');if(cause==='ban')await write('UPDATE members SET banned=1 WHERE discord_id=?',subject);else await hold();clearTrace();
   readHook=sql=>{if(sql.startsWith('SELECT discord_id FROM (SELECT m.discord_id')){readHook=null;if(initiallyV1)delete env[modeKey];else env[modeKey]='v1';}};
   const out=await R.reconcileBanned(env,'',10,budget());
   check(layout+' sweep retains first capture for '+cause+' '+(initiallyV1?'v1-to-absent':'absent-to-v1'),out.failed.includes(subject)&&out.revoked.length===0&&out.held.length===0&&deletes().length===0&&debt().length===0);
  }
  for(const kind of ['ban','reapply','blocking']){
   await fresh(layout);env.MEMBERSHIP_ROLE_SETTLEMENT_ENABLED='true';const pending=invoke(kind);env[modeKey]='v1';
   check(layout+' '+kind+' rechecks original mode after import before central delegation',held(kind,await pending)&&requests.length===0&&native.nativeTrace.length===0);
  }
  for(const initiallyV1 of [false,true])for(const cause of ['ban','hold']){
   await fresh(layout,initiallyV1?'v1':'absent');providerRoles=[];
   effectHook=async method=>{if(method!=='PUT')return;if(initiallyV1)delete env[modeKey];else env[modeKey]='v1';if(cause==='ban')await write('UPDATE members SET banned=1 WHERE discord_id=?',subject);else await hold();};
   const out=await R.grantMemberRole(env,subject,'fixture','fixture',undefined,budget());
   check(layout+' post-grant '+cause+' retains entry capture '+(initiallyV1?'v1-to-absent':'absent-to-v1'),out===(cause==='ban'?'banned':'held')&&effects().map(r=>r.method).join(',')==='PUT');
   check(layout+' post-grant '+cause+' leaves original acknowledged PUT custody intact',debt().length===1&&debt()[0].state==='settled'&&debt()[0].reason==='legacy_put_acknowledged'&&providerRoles.includes(role));
  }
  for(const failed of [false,true]){
   await fresh(layout);failDelete=failed;effectHook=method=>{if(method==='DELETE')env[modeKey]='v1';};
   check(layout+' already dispatched removal retains '+(failed?'failure':'ACK')+' reporting after mode change',await invoke('ban')===!failed&&deletes().length===1&&actions().join(',')===(failed?'role.revoke_pending':'role.revoked_banned'));
  }
 }
 console.log(`old beta removal fence: ${passed}/${passed} passed`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(db)db.close();Date.now=realNow;globalThis.fetch=realFetch;});
