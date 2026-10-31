'use strict';
// Real signed index.fetch, original SQLite/Native fixtures and source-owned
// child registration. Every provider endpoint and credential is synthetic.
const fs210=require('node:fs'),path210=require('node:path'),crypto210=require('node:crypto'),{Module}=require('node:module');
function prefix210(file,pattern,sha){
 const source=fs210.readFileSync(path210.join(__dirname,file),'utf8'),cuts=[...source.matchAll(pattern)];
 if(cuts.length!==1)throw Error('admin210_original_fixture_boundary');
 const prefix=source.slice(0,cuts[0].index);
 if(crypto210.createHash('sha256').update(file==='privacy_native_erasure_mode_test.cjs'?require('./frontend_fixture_prefix217.cjs').historicalBoardNativePrefix217(prefix):prefix).digest('hex')!==sha)throw Error('admin210_original_fixture_drift');
 return prefix;
}
async function ordinaryAdmin210(){
 const assert210=require('node:assert/strict');let count210=0,serial210=0;
 const check210=(label,value)=>{assert210.ok(value,label);count210++;console.log('PASS '+label);};
 const OFF210='1551234567890123457',ROLE210='1551234567890123456',BOTROLE210='1551234567890123459',TARGET210='300000000000000002';
 const key210=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);publicKeyHex=hex(await crypto.subtle.exportKey('raw',key210.publicKey));
 const signed210=async payload=>{const body=JSON.stringify(payload),stamp=String(T),sig=hex(await crypto.subtle.sign('Ed25519',key210.privateKey,new TextEncoder().encode(stamp+body)));return new Request('https://verify.example/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Timestamp':stamp,'X-Signature-Ed25519':sig,Cookie:'__Host-olg=unrelated-synthetic-cookie'},body});};
 const setup210=async(sub,mode='ok',delay=0)=>{
  db.close();db=freshDb();
  await env().DB.prepare('INSERT INTO members(discord_id,username)VALUES(?,?)').bind(TARGET210,'synthetic-target').run();
  if(sub==='sync'){
   await env().DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('synthetic one','Synthetic One',?,'verified',?,?,'whisper','Player-1-00000001')").bind(TARGET210,T-86400,T-86400).run();
   const snap=await env().DB.prepare("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at)VALUES(?,?,'addon',1,'synthetic',1,1,?)").bind(T,T,T).run();
   await env().DB.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid)VALUES(?,'synthetic one','Synthetic One','Member',3,'Player-1-00000001')").bind(snap.meta.last_row_id).run();
  }
  const calls=[],patches=[],posts=[],pending=[],roles=new Set(sub==='ban'?[ROLE210]:[]);let delayed=false;
  const context={waitUntil(p){pending.push(Promise.resolve(p));if(mode==='registration_throw')throw Error('synthetic waitUntil refusal');}};
  syntheticProvider210=async(input,init={})=>{
   const req=input instanceof Request?input:null,u=new URL(req?req.url:String(input)),method=req?req.method:init.method||'GET';
   assert210.equal(u.hostname,'discord.com','no credential relocation');calls.push({method,redirect:req?req.redirect:init.redirect});
   if(method==='PATCH'){
    const body=JSON.parse(req?await req.clone().text():init.body);patches.push(body);
    if(mode==='patch_unknown')throw Error('synthetic lost PATCH reply');
    if(mode==='patch_redirect')return new Response('refused',{status:302,headers:{Location:'https://owned-sink.invalid/never-reached'}});
    return new Response(JSON.stringify({id:'synthetic-original'}),{headers:{'Content-Type':'application/json'}});
   }
   const canary='SYNTHETIC_PRIVATE_ERROR_CANARY_210';
   if(method==='POST'){
    posts.push(JSON.parse(req?await req.clone().text():init.body));
    if(mode==='card_canary_error')throw Error(canary);
    if(mode==='card_canary_body')return new Response(JSON.stringify({message:canary}),{status:503});
    return new Response(JSON.stringify({id:'synthetic-card'}),{headers:{'Content-Type':'application/json'}});
   }
   if(method==='DELETE'&&mode.startsWith('role_canary_')){
    if(mode==='role_canary_error')throw Error(canary);
    return new Response(JSON.stringify({message:canary,code:canary}),{status:mode==='role_canary_401'?401:mode==='role_canary_403'?403:503});
   }
   if(delay&&!delayed){delayed=true;await new Promise(resolve=>setTimeout(resolve,delay));}
   if(method==='PUT'||method==='DELETE'){if(method==='PUT')roles.add(ROLE210);else roles.delete(ROLE210);return new Response(null,{status:204});}
   const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
   if(u.pathname.endsWith('/roles'))return json([{id:OLYMPUS,name:'@everyone',position:0,permissions:'0',managed:false},{id:ROLE210,name:'Guild Member',position:1,permissions:'0',managed:false},{id:BOTROLE210,name:'Synthetic Bot',position:10,permissions:'268435456',managed:false}]);
   if(u.pathname.endsWith('/members/'+TARGET210))return json({user:{id:TARGET210,username:'synthetic-target'},roles:[...roles]});
   if(u.pathname.endsWith('/members/'+APP))return json({user:{id:APP,bot:true},roles:[BOTROLE210]});
   throw Error('unexpected synthetic provider endpoint');
  };
  const payload={type:2,id:String(900000000000001000n+BigInt(++serial210)),application_id:APP,token:'synthetic/opaque?token',guild_id:OLYMPUS,member:{user:{id:USER,username:'synthetic-officer'},roles:[OFF210]},data:{name:'olympus-admin',options:[{name:sub,type:1,...(sub==='ban'?{options:[{name:'user',type:6,value:TARGET210},{name:'reason',type:3,value:'Synthetic command.'}]}:{})}]}};
  const e={...rawEnv(),ROLE_OFFICER:OFF210,ROLE_GUILD_MEMBER:ROLE210,ROLE_CALL_BUDGET:'40'};
  const send=async()=>{const req=await signed210(payload),at=performance.now(),res=await index.fetch(req,e,context);return{res,body:await res.json(),ms:performance.now()-at};};
  const drain=async()=>{for(let n=0;n<pending.length;n++)await pending[n].catch(()=>{});};
  return{payload,e,calls,patches,posts,pending,send,drain,context};
 };
 try{
  for(const sub of ['ban','sync']){
   const f=await setup210(sub,'ok',3200),out=await f.send();
   check210(sub+' genuine signed HTTP ACK is ephemeral type5 before3200ms provider completion',out.res.status===200&&out.body.type===5&&out.body.data.flags===64&&out.ms<3000&&!f.patches.length);
   const replay=await f.send();check210(sub+' pending duplicate returns cached type5',replay.body.type===5);await f.drain();
   check210(sub+' runs its admin effect exactly once and edits one summary',f.patches.length===1&&db.prepare('SELECT COUNT(*) n FROM audit WHERE action=?').get('admin.'+sub).n===1);
   check210(sub+' summary is capped, mentions-disabled and every credentialed request manual-redirect',f.patches[0].content.length<=2000&&JSON.stringify(f.patches[0].allowed_mentions)==='{"parse":[]}'&&f.calls.every(x=>x.redirect==='manual'));
  }
  for(const mode of ['patch_unknown','patch_redirect']){
   const f=await setup210('ban',mode),out=await f.send();await f.drain();const before=f.calls.length;
   const replay=await f.send();await f.drain();
   check210(mode+' cannot replay the ban or blindly retry an uncertain message',out.body.type===5&&replay.body.type===5&&f.patches.length===1&&f.calls.length===before&&f.calls.filter(c=>c.method==='DELETE').length===1);
  }
  {const f=await setup210('ban','registration_throw'),out=await f.send();await f.drain();check210('real waitUntil refusal leaves admin effects and providers unstarted',out.body.type===4&&/Nothing was started/.test(out.body.data.content)&&!db.prepare('SELECT banned FROM members WHERE discord_id=?').get(TARGET210).banned&&f.calls.length===0);}
  {const f=await setup210('ban');let promise;const response=await load('./interactions').handleInteraction(env({ROLE_OFFICER:OFF210,ROLE_GUILD_MEMBER:ROLE210}),f.payload,(_label,work)=>{promise=work();throw Error('invoked then refused');});await promise;check210('invoked thunk followed by registration throw cannot start effects',(await response.json()).type===4&&f.calls.length===0&&!db.prepare('SELECT banned FROM members WHERE discord_id=?').get(TARGET210).banned);}
  {const f=await setup210('ban');f.payload.member.roles=[];const out=await f.send();await f.drain();check210('unrelated site cookie cannot bypass signed officer gate',out.body.type===4&&out.body.data.content==='Officers only.'&&f.calls.length===0);}
  {const f=await setup210('ban');f.payload.data.options[0].options[1].value='x'.repeat(401);const out=await f.send();await f.drain();check210('existing400-character ban-reason guard stays before registration/writes',out.body.type===4&&/400/.test(out.body.data.content)&&f.calls.length===0&&!db.prepare('SELECT banned FROM members WHERE discord_id=?').get(TARGET210).banned);}
  {const f=await setup210('ban');f.payload.data.options[0].options[1].value='@everyone '+'r'.repeat(390);for(let n=0;n<24;n++)await env().DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'member',?,'fixture')").bind('historical'+n,'SyntheticHistorical'+n+'x'.repeat(35),TARGET210,T).run();const out=await f.send();await f.drain();check210('large actual ban summary retains existing2000 cap and no mentions',out.body.type===5&&f.patches.length===1&&f.patches[0].content.length<=2000&&JSON.stringify(f.patches[0].allowed_mentions)==='{"parse":[]}');}
  for(const mode of ['role_canary_error','role_canary_body','role_canary_401','role_canary_403','card_canary_error','card_canary_body']){
   const f=await setup210('ban',mode),captured=[],originalError=console.error;
   Object.assign(f.e,{CHANNEL_MOD_ALERTS:'1551234567890123460',CHANNEL_SERVER_LOG:'1551234567890123461'});
   try{
    console.error=(...args)=>captured.push(args);const out=await f.send();await f.drain();
    const audit=db.prepare('SELECT action,details FROM audit ORDER BY id').all(),privateCanary='SYNTHETIC_PRIVATE_ERROR_CANARY_210',all=JSON.stringify([out.body,f.patches,f.posts,audit,captured]);
    check210(mode+' drops upstream/error text from genuine summary, staff card, audit and console',!all.includes(privateCanary));
    check210(mode+' reports partial verification ban without claiming failed removal/card success',out.body.type===5&&f.patches.length===1&&f.patches[0].content.includes('marked banned for verification')&&f.patches[0].content.includes(mode.startsWith('role_')?'Could not remove Guild Member':'Could not post the ban card')&&db.prepare("SELECT COUNT(*) n FROM audit WHERE action='admin.ban'").get().n===1&&f.calls.filter(c=>c.method==='DELETE').length===1);
    if(mode==='role_canary_401'||mode==='role_canary_403')check210(mode+' retains bounded token-versus-permission operator guidance',f.patches[0].content.includes(mode==='role_canary_401'?'bot token':'permissions'));
   }finally{console.error=originalError;}
  }
  const invalidArguments=[];
  for(const spec of [
   {name:'missing_user',missing:true},{name:'number_user',target:123},{name:'object_user',target:{id:TARGET210}},
   {name:'nonsnowflake_user',target:'not-a-snowflake'},{name:'zero_user',target:'00000000000000000'},{name:'overflow_user',target:'99999999999999999999'},
   {name:'number_reason',reason:123},{name:'object_reason',reason:{text:'synthetic'}},{name:'null_reason',reason:null}
  ]){
   const f=await setup210('ban'),options=f.payload.data.options[0].options;
   if(spec.missing)options.splice(0,1);else if(Object.hasOwn(spec,'target'))options[0].value=spec.target;
   if(Object.hasOwn(spec,'reason'))options.find(o=>o.name==='reason').value=spec.reason;
   const out=await f.send();await f.drain();const effects=db.prepare("SELECT COUNT(*) n FROM audit WHERE action='admin.ban'").get().n,banned=db.prepare('SELECT COUNT(*) n FROM members WHERE banned=1').get().n;
   const observed={name:spec.name,status:out.res.status,type:out.body.type,noChangeMessage:out.body.data?.content?.includes('Nothing was changed.')===true,adminEffects:effects,bannedRows:banned,providerCalls:f.calls.length};
   console.log('BAN_ARGUMENT_OBSERVATION '+JSON.stringify(observed));invalidArguments.push(observed);
  }
  for(const row of invalidArguments)check210(row.name+' genuine signed request refuses before registration, provider or admin writes',row.status===200&&row.type===4&&row.noChangeMessage&&row.adminEffects===0&&row.bannedRows===0&&row.providerCalls===0);
  {const f=await setup210('ban');f.payload.data.options[0].options.pop();const out=await f.send();await f.drain();check210('absent optional reason remains a valid single verification ban',out.body.type===5&&f.patches.length===1&&db.prepare("SELECT COUNT(*) n FROM audit WHERE action='admin.ban'").get().n===1);}
  console.log(JSON.stringify({scope:'admin210-actual-signed-index',checks:count210,passed:count210,liveProviderRequests:0}));return{checks:count210,passed:count210};
 }finally{db.close();globalThis.Date=RealDate;}
}
async function nativeAdmin210(){
 let count210=0,serial210=0;const check210=(label,value)=>{assert.ok(value,label);count210++;console.log('PASS '+label);};
 const cases=[{name:'native_on',native:'true',delay:3200},{name:'native_off',native:'false',delay:3200},{name:'stale_actor',native:'true'},{name:'stale_target',native:'true'},{name:'nested_fresh_ban',native:'true'},{name:'wrong_epoch',native:'true'},{name:'admission_off',native:'true'},{name:'site_cookie_no_officer',native:'true'}];
 for(const spec of cases){
  const f=fixture();try{
   await f.signIn(ID);const actorCookie=await f.signIn(OTHER);await seedPersonal(f,{roles:1});
   f.env.PRIVACY_NATIVE_ERASURE_ENABLED=spec.native;f.env.PRIVACY_ERASURE_ENABLED=spec.native;
   const schema=JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
   const keys=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);f.env.DISCORD_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex');
   if(spec.name==='nested_fresh_ban'){
    const ids=Array.from({length:11},(_,n)=>String(900000000000000100n+BigInt(n))),at=1793833200;
    Object.assign(f.env,{FULL_RELEASE_ROLES:JSON.stringify({version:1,epoch:'olympus-full-release-launch',epochStart:at,grants:true,membership:ids[0],native:ids.slice(1)}),LINKS_NOT_BEFORE:String(at),QR_RANK_MAPPING_ENABLED:'true',QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:Array.from({length:5},(_,n)=>String(910000000000000100n+BigInt(n)))}),QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',ROSTER_MIN_MEMBERS:'200',ROSTER_MAX_SHRINK_PCT:'10',ROLE_CALL_BUDGET:'40'});
    const lane=load('full-release-roles').captureLaneConfig(f.env);assert.ok(lane.configured&&load('full-release-roles').laneClock(lane,clock).fresh);
   }
   const raw=f.provider,calls=[],patches=[];let release,entered,paused=false;
   const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
   f.provider=async(url,init)=>{
    assert.equal(new URL(url).hostname,'discord.com');const method=init.method||'GET';calls.push(method);
    if(method==='PATCH'&&new URL(url).pathname.includes('/webhooks/')){patches.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'synthetic-original'}),{headers:{'Content-Type':'application/json'}});}
    if(!paused){paused=true;entered();if(spec.name==='stale_actor'||spec.name==='stale_target')await gate;else if(spec.delay)await new Promise(resolve=>setTimeout(resolve,spec.delay));}
    return raw(url,init);
   };
   const payload={type:2,id:String(900000000000002000n+BigInt(++serial210)),application_id:BOT,token:'synthetic-native-token',guild_id:GUILD,member:{user:{id:OTHER,username:'synthetic-officer'},roles:spec.name==='site_cookie_no_officer'?[]:[RANK1]},data:{name:'olympus-admin',options:[{name:'ban',type:1,options:[{name:'user',type:6,value:ID},{name:'reason',type:3,value:'Synthetic Native test.'}]}]}};
   if(spec.name==='wrong_epoch')f.env.PRIVACY_WRITE_ADMISSION_EPOCH='b'.repeat(32);if(spec.name==='admission_off')f.env.PRIVACY_WRITE_ADMISSION_ENABLED='false';
   const text=JSON.stringify(payload),stamp=String(clock),signature=Buffer.from(await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(stamp+text))).toString('hex'),pending=[],ctx={waitUntil(p){pending.push(Promise.resolve(p));}};
   active=f;const started=performance.now(),res=await index.fetch(new Request('https://verify.example/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Timestamp':stamp,'X-Signature-Ed25519':signature,Cookie:actorCookie},body:text}),f.env,ctx),ackMs=performance.now()-started,body=await res.json(),registeredAtAck=pending.length;
   if(spec.name==='wrong_epoch'||spec.name==='admission_off'){while(pending.length)await pending.shift().catch(()=>{});check210(spec.name+' genuine ingress holds before admin work',res.status!==200&&calls.length===0&&!f.raw("SELECT 1 FROM audit WHERE action='admin.ban'"));continue;}
   if(spec.name==='site_cookie_no_officer'){while(pending.length)await pending.shift().catch(()=>{});check210('real site-admin cookie is not bot officer authority',body.type===4&&body.data.content==='Officers only.'&&calls.length===0);continue;}
   check210(spec.name+' genuine Native fetch ACK is ephemeral type5 within3s',res.status===200&&body.type===5&&body.data.flags===64&&ackMs<3000);
   if(spec.name==='stale_actor'||spec.name==='stale_target'){
    await ready;const subject=spec.name==='stale_actor'?OTHER:ID;
    await f.write("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)ON CONFLICT(subject_id)DO UPDATE SET generation=excluded.generation,state='active',revision=revision+1",subject,'e'.repeat(32),clock,clock);
    if(spec.name==='stale_target')await f.write("UPDATE characters SET name='NEW_GENERATION_PRIVATE_SENTINEL' WHERE discord_id=?",ID);release();
   }
   for(let n=0;n<pending.length;n++)await pending[n].catch(()=>{});
   if(spec.name==='stale_actor')check210('stale actor cannot receive private completion or later role DELETE',patches.length===0&&calls.filter(x=>x==='DELETE').length===0);
   else if(spec.name==='stale_target')check210('stale target cannot expose replacement private details or cause role removal',patches.length===1&&!patches[0].content.includes('NEW_GENERATION_PRIVATE_SENTINEL')&&patches[0].content.includes('original target generation')&&calls.filter(x=>x==='DELETE').length===0);
   else check210(spec.name+' owns one bounded mentions-disabled completion',patches.length===1&&patches[0].content.length<=2000&&JSON.stringify(patches[0].allowed_mentions)==='{"parse":[]}');
   if(spec.name==='nested_fresh_ban')check210('nested fresh_roles_ban stays under the same genuine context',pending.length>registeredAtAck&&patches[0].content.includes('New guild roles: removal runs')&&!!f.raw("SELECT 1 FROM audit WHERE action='admin.ban'"));
   check210(spec.name+' preserves native schema, epoch, slot and legacy Floor isolation',JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))===schema&&f.raw('SELECT epoch,active FROM privacy_write_admission').epoch===EPOCH&&f.raw('SELECT active FROM privacy_write_admission').active===0&&f.floorCalls===0);
  }finally{f.close();}
 }
 console.log(JSON.stringify({scope:'admin210-genuine-native-modes',checks:count210,passed:count210,liveProviderRequests:0}));return{checks:count210,passed:count210};
}
async function configuredFloorHeld210(){
 const H=require('./privacy_serving_production_origin_test.cjs'),{webcrypto}=require('node:crypto');let checks=0;
 for(const sub of ['ban','sync']){
  const f=await H.setup('canonical',null);let old;
  try{
   const index=H.load('index').default,G=H.load('privacy-global-serving-origin'),APP='300000000000000099',GUILD='236932545793490944',OFFICER='1551234567890123457',ROLE='1551234567890123456',keys=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
   const e={...f.env,GUILD_ID:GUILD,DISCORD_APP_ID:APP,ROLE_OFFICER:OFFICER,ROLE_GUILD_MEMBER:ROLE,ROLE_CALL_BUDGET:'40',DISCORD_BOT_TOKEN:'synthetic-bot',COOKIE_SECRET:'synthetic-cookie-secret-0123456789',DISCORD_CLIENT_SECRET:'synthetic-client',VERIFY_SECRET:'synthetic-verify',CHANNEL_SERVER_LOG:'',CHANNEL_NOTICES:'',DISCORD_PUBLIC_KEY:Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('hex')};
   let providers=0;old=H.providerFetch(async()=>{providers++;throw Error('configured admin must not reach provider');});
   const payload={type:2,id:sub==='ban'?'900000000000003001':'900000000000003002',application_id:APP,token:'synthetic-token',guild_id:GUILD,member:{user:{id:H.SUBJECT,username:'synthetic-officer'},roles:[OFFICER]},data:{name:'olympus-admin',options:[{name:sub,type:1,...(sub==='ban'?{options:[{name:'user',type:6,value:H.FOREIGN}]}:{})}]}};
   const text=JSON.stringify(payload),stamp=String(H.T),sig=Buffer.from(await webcrypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(stamp+text))).toString('hex'),res=await index.fetch(new Request('https://normal.invalid/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Timestamp':stamp,'X-Signature-Ed25519':sig},body:text}),e,f.ctx),body=await res.json();while(f.pending.length)await f.pending.shift();
   require('node:assert/strict').ok(G.globalServingMode(e)==='configured'&&res.status===200&&body.type===4&&body.data.flags===64&&body.data.content.includes('No ban or sync was started')&&providers===0&&f.d.db.prepare("SELECT COUNT(*) n FROM audit WHERE action IN ('admin.ban','admin.sync')").get().n===0);checks++;
   console.log('PASS configured global Floor '+sub+' actual fetch refuses before admin effects; no successful-operation deadline claim');
  }finally{H.providerFetch(old??null);f.close();}
 }
 require('node:assert/strict').equal(H.timers.size,0);return{checks,passed:checks,bootstrap:'Existing explicit synthetic managed_open fixture only'};
}
module.exports=(async()=>{
 const prefix=prefix210('interactions_hardening_test.cjs',/\(async \(\) => \{/g,'6b5470c6b032187e284436d012ea0597a25201d40b0d32270c8df9809ea36713'),boundary='globalThis.fetch = async () => { throw new Error("no network in tests"); };';
 if(prefix.split(boundary).length!==2)throw Error('admin210_original_provider_boundary');
 const stable=prefix.replace(boundary,'let syntheticProvider210=async()=>{throw Error("provider not ready");};globalThis.fetch=(...args)=>syntheticProvider210(...args);');
 const ordinary=new Module(__filename,module);ordinary.filename=__filename;ordinary.paths=Module._nodeModulePaths(__dirname);ordinary._compile(stable+'\nmodule.exports=('+ordinaryAdmin210.toString()+')();',__filename);const off=await ordinary.exports;
 const nativePrefix=prefix210('privacy_native_erasure_mode_test.cjs',/\(async\(\)=>\{\r?\n \/\/ \.174:/g,'83b4fe71835e987ede23c482568ab067ce84700b51cca4b4efac6119f262896a');
 const native=new Module(__filename,module);native.filename=__filename;native.paths=Module._nodeModulePaths(__dirname);native._compile(nativePrefix+'\nmodule.exports=('+nativeAdmin210.toString()+')();',__filename);return{off,native:await native.exports,floor:await configuredFloorHeld210()};
})();
if(require.main===module)module.exports.catch(error=>{console.error(error.stack);process.exitCode=1;});
