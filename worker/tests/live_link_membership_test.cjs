// Live Link membership (live-link-membership.ts): the real route, the real Link core and the real central writer on the pre-seal Native fixture, plus the vendored GUID vectors. Only Discord HTTP is synthetic.
'use strict';
const fs230=require('node:fs'),path230=require('node:path'),{Module:Module230}=require('node:module');
const parent230=fs230.readFileSync(path230.join(__dirname,'hardening_test.cjs'),'utf8');
const cuts230=[...parent230.matchAll(/^\(async \(\) => \{/gm)];
if(cuts230.length!==1)throw Error('launch230_fixture_boundary_changed');
let fixture230=parent230.slice(0,cuts230[0].index);
const oldInstall230='    entry.installCurrentEntryEpoch(db, { now: T });';
const oldEnv230="  return { ...current, DB: load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(current.DB, 'writer', 'canonical', entry.ENTRY_EPOCH) };";
if(fixture230.split(oldInstall230).length!==2||fixture230.split(oldEnv230).length!==2)throw Error('launch230_fixture_native_boundary_changed');
fixture230=fixture230.replace(oldInstall230,`    const profile=JSON.parse(load('./privacy-write-admission-catalogue').ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
    for(const t of profile.tables)db.exec(t.sql);for(const i of profile.indexes)db.exec(i.sql);db.exec(profile.slotSQL);
    db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?,'serving',0,'','',0,0)").run('a'.repeat(32));
    db.exec("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0);INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',1)");for(const t of profile.triggers)db.exec(t.sql);`)
 .replace(oldEnv230,`  return { ...current,PRIVACY_ERASURE_ENABLED:'true',PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'recorded-live-pre-seal-20261017',PRIVACY_WRITE_ADMISSION_EPOCH:'b'.repeat(32), DB: load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(current.DB, 'writer', 'recorded-live-pre-seal-20261017', 'b'.repeat(32)) };`);
const body230=String.raw`
(async()=>{
 const check=(name,cond,...why)=>{n++;if(cond)ok++;else if(why.length)console.log('   ',JSON.stringify(why).slice(0,1800));console.log((cond?'PASS ':'FAIL ')+name);};
 const logModule=load('./log'),refOriginal=logModule.errorRef;logModule.errorRef=e=>refOriginal(e)+(process.env.LL_DEBUG?' '+String(e&&e.stack):'');
 const crypto230=require('node:crypto'),central=load('./role-settlements'),venue=load('./shared-membership-cutover230'),cutover=load('./privacy-shared-member-cutover230'),LM=load('./live-link-membership'),L=load('./link'),core=load('./link-core');
 const G=venue.SHARED_MEMBER230_GUILD,R=venue.SHARED_MEMBER230_ROLE,BOT='999999999999999999',BOTROLE='888888888888888888',BLOCK='666666666666666666',ORIGIN='https://dnl-gentile.github.io';
 const scopeNative={version:1,guild:'OLYMPUS PRIME',realm:'Fixture Live Realm'},h=x=>crypto230.createHash('sha256').update(x).digest('hex');
 const SCOPE=JSON.stringify({version:1,guild:'OLYMPUS PRIME',faction:'Alliance',servers:['4613']});
 const GUIDA='Player-4613-005A70D8',CHARA='Guid Player-ClassicBetaPvP';
 const subtle=globalThis.crypto.subtle;
 let db,env,lenv,linkDb,http=[],present=[],options={},ipn=0,councils={};
 const OAUTH={'signin-token-a-0001':{id:A,username:'guid.player'},'signin-token-b-0002':{id:B,username:'other.player'},'signin-token-c-0003':{id:C,username:'third.player'}};
 // ---- Discord, synthetic: the role writer's REST and the sign-in lookup
 stubs['./discord'].rest=async(e,method,p,_body,_retries,_reason,_budget,_retry,beforeDispatch)=>{
  beforeDispatch?.();http.push({method,path:p});
  if(method==='GET'&&p==='/users/@me')return {id:BOT,bot:true};
  if(method==='GET'&&p==='/guilds/'+G+'/roles')return [{id:G,position:0,permissions:'0',managed:false},{id:R,position:1,permissions:'0',managed:false},{id:BOTROLE,position:10,permissions:'268435456',managed:false}];
  if(method==='GET'&&p==='/guilds/'+G+'/members/'+BOT)return {user:{id:BOT},roles:[BOTROLE]};
  const who=p.match(/^\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/),sub=who&&who[1]===G&&who[2]!==BOT?who[2]:null;
  if(method==='GET'&&sub&&!who[3])return {user:{id:sub},roles:present.slice()};
  if(method==='PUT'&&sub&&who[3]===R){present.push(R);return undefined;}
  if(method==='DELETE'&&sub&&who[3]===R){present=present.filter(x=>x!==R);return undefined;}
  throw Error('unplanned synthetic HTTP '+method+' '+p);
 };
 stubs['./discord'].credentialFetch=async(url,init)=>{
  if(String(url)!=='https://discord.com/api/v10/oauth2/@me')throw Error('unplanned credentialFetch');
  const u=OAUTH[String(init.headers.Authorization).replace('Bearer ','')];if(!u)return new Response('{}',{status:401});
  return new Response(JSON.stringify({application:{id:BOT},scopes:['identify'],expires:'2099-01-01T00:00:00+00:00',user:{id:u.id,username:u.username,avatar:null,global_name:null}}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 // ---- LINK_DB: the vendored schema on node:sqlite behind a D1-shaped shim
 const LINK_SCHEMA=fs.readFileSync(path.join(root,'vendor','olympus-link','schema.sql'),'utf8');
 function linkD1(){
  const ldb=new DatabaseSync(':memory:');ldb.exec(LINK_SCHEMA);
  const st=(sql,args=[])=>({sql,args,bind:(...a)=>st(sql,a),first:async()=>{const r=ldb.prepare(sql).get(...args);return r?{...r}:null;},
   all:async()=>({success:true,results:ldb.prepare(sql).all(...args).map(r=>({...r}))}),
   run:async()=>{const r=ldb.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});
  return {sqlite:ldb,prepare:sql=>st(sql),batch:async list=>{ldb.exec('BEGIN');try{const out=[];for(const s of list)out.push(await(/^\s*SELECT\b/i.test(s.sql)?s.all():s.run()));ldb.exec('COMMIT');return out;}catch(e){ldb.exec('ROLLBACK');throw e;}}};
 }
 async function newWorld(o={}){
  options=o;http=[];present=[];reset();
  db=freshDb();const raw=d1(db),closure={version:1,contract:venue.SHARED_MEMBER230_CONTRACT,operationId:'c'.repeat(32),priorEpoch:'a'.repeat(32),writeEpoch:'b'.repeat(32),sourceCommit:'d'.repeat(40),sourceTree:'e'.repeat(40),bundleSHA256:'f'.repeat(64),providerA:'11111111-2222-4333-8444-555555555555',writerCoverageSHA256:'1'.repeat(64),debtPredicateSHA256:h(cutover.SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL),createdAt:T,expiresAt:T+300};
  const json=JSON.stringify(closure),digest=h(json);await cutover.executeSharedMember230Open(await cutover.captureSharedMember230Open(await cutover.executeSharedMember230Fence(await cutover.captureSharedMember230Fence(raw,json,digest)),'enabled'));
  const kp=await subtle.generateKey({name:'Ed25519'},true,['sign','verify']),jwk=await subtle.exportKey('jwk',kp.privateKey);
  linkDb=linkD1();
  const base=directEnv({DB:raw,PUBLIC_BASE_URL:'https://verify.example',VERIFY_SECRET:SECRET,COOKIE_SECRET:'cookie-secret-for-live-link-tests-0123456789',DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'synthetic-not-a-credential',ROLE_GUILD_MEMBER:R,GUILD_ID:G,ADMISSION_MODE:'auto',ROSTER_MAX_SHRINK_PCT:'10',ROSTER_MIN_MEMBERS:'0',VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify(scopeNative),MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',SHARED_MEMBERSHIP230_MODE:'enabled',SHARED_MEMBERSHIP230_CLOSURE_JSON:json,SHARED_MEMBERSHIP230_CLOSURE_SHA256:digest,BLOCKING_ROLE_IDS:BLOCK});
  env={...base,LINK_ENABLED:'true',LINK_DB:linkDb,LINK_BACKEND_SEED:jwk.d,LINK_BACKEND_PUBLIC:Buffer.from(jwk.x,'base64url').toString('hex'),LINK_ADMIN_TOKEN:'link-admin-'+'k'.repeat(40),LINK_ORIGIN:ORIGIN,LINK_MODE:'c',LINK_GUILD_POLICY:o.policy||'verified',LINK_ROLE_ID:'1700000000000000001'};
  if(o.flag!==false)env.LINK_MEMBERSHIP_ENABLED=o.flag??'true';
  if(o.scope!==false)env.LINK_MEMBERSHIP_SCOPE=o.scope??SCOPE;
  lenv=L.linkEnv(env);councils={};
 }
 async function councillor(id){
  if(councils[id])return councils[id];
  const kp=await subtle.generateKey({name:'Ed25519'},true,['sign','verify']),hex=Buffer.from(await subtle.exportKey('raw',kp.publicKey)).toString('hex');
  const r=await core.manageKeys(lenv,{key_id:id,public_key:hex,owner_discord_id:'100000000000000001',character:'Test Councillor-ClassicBetaPvP',kind:'c',bootstrap:true});
  if(r.status!=='ok'||!r.cert)throw Error('councillor key not registered '+r.message);
  return councils[id]={keyId:id,character:'Test Councillor-ClassicBetaPvP',privateKey:kp.privateKey,publicB64:Buffer.from(hex,'hex').toString('base64url'),cert:r.cert,certExp:r.cert_exp};
 }
 async function issue(account,name){const a=await core.issueCode(lenv,{id:account,username:name},'discord');if(!a.ok)throw Error('no code '+a.reason);return a;}
 // An OLB6 link the way the game builds it (web/public/core.js buildBundle and Link.Build).
 async function link(code,o={}){
  const c=await councillor(o.keyId||'councila1'),token=code.token,R10=token.split('.')[1],sig=token.slice(token.lastIndexOf('.')+1);
  const requester=o.requester||CHARA,b={version:6,requester,guid:o.guid||GUIDA,guild:o.guild||'OLYMPUS PRIME',faction:o.faction||'Alliance',nonce:o.nonce||'0123456789abcdef',R:R10};
  b.tag=await core.linkTag(sig,requester);
  const p={issued:o.issued||T-30,keyId:c.keyId,confirmer:c.character,gv:o.gv||'r',obs:o.obs||'o'};
  const s=Buffer.from(await subtle.sign('Ed25519',c.privateKey,Buffer.from(core.signedMessage(b,p),'utf8'))).toString('base64url');
  const proof=[p.issued,p.keyId,p.confirmer,p.gv,p.obs,s,c.publicB64,'c',c.certExp,c.cert.slice(c.cert.lastIndexOf('.')+1)].join(',');
  return {R:R10,text:['OLB6',b.requester,b.guid,b.guild,b.faction,b.nonce,b.R,b.tag,proof].join('~')};
 }
 async function post(text,token,o={}){
  const req=new Request('https://verify.example/proof',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'198.51.'+Math.floor(++ipn/250)+'.'+(ipn%250+1)},body:JSON.stringify({text,discordToken:token||'signin-token-a-0001'})});
  const res=await L.routeLink(req,o.env||env,'/proof',true);return {status:res.status,body:await res.json()};
 }
 const w=async(sql,...a)=>env.DB.prepare(sql).bind(...a).run();
 const count=sql=>db.prepare(sql).get().n;
 const snap=()=>JSON.stringify([count('SELECT COUNT(*) n FROM role_settlements'),count("SELECT COUNT(*) n FROM site_settings WHERE key>='livelink:' AND key<'livelink;'"),count('SELECT COUNT(*) n FROM characters'),count('SELECT COUNT(*) n FROM members'),count('SELECT COUNT(*) n FROM audit'),http.filter(x=>x.method!=='GET').length]);
 const puts=()=>http.filter(x=>x.method==='PUT').length;
 const settlements=()=>db.prepare("SELECT * FROM role_settlements WHERE purpose='live_link_membership'").all();
 const markers=()=>db.prepare("SELECT key,value FROM site_settings WHERE key>='livelink:' AND key<'livelink;'").all();

 // ================= the gate
 await newWorld();
 const gate=e=>LM.captureLiveLinkMembership(e);
 check('gate: exactly true with Link on and a canonical flagship scope is on',gate(env).mode==='on'&&gate(env).scope.servers[0]==='4613');
 const without=k=>{const e={...env};delete e[k];return e;};
 check('gate: absent, empty and false are off',['absent','','false'].every(v=>gate(v==='absent'?without('LINK_MEMBERSHIP_ENABLED'):{...env,LINK_MEMBERSHIP_ENABLED:v}).mode==='off'));
 check('gate: any other value is held',['TRUE','1','yes',' true',true].every(v=>gate({...env,LINK_MEMBERSHIP_ENABLED:v}).mode==='held'));
 check('gate: Link itself off or held keeps membership held',gate({...env,LINK_ENABLED:'false'}).mode==='held'&&gate({...env,LINK_ENABLED:'maybe'}).mode==='held');
 check('gate: a missing, non-canonical or non-flagship scope is held',[undefined,SCOPE.replace('OLYMPUS PRIME','Olympus II'),JSON.stringify({guild:'OLYMPUS PRIME',version:1,faction:'Alliance',servers:['4613']}),SCOPE.replace('"4613"','4613'),SCOPE.replace('Alliance','Neutral'),SCOPE.replace('["4613"]','[]'),SCOPE+' '].every(v=>gate({...env,LINK_MEMBERSHIP_SCOPE:v}).mode==='held'));
 check('gate: a valid native scope for another guild disagrees and holds',gate({...env,VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,guild:'Olympus II',realm:'Fixture Live Realm'})}).mode==='held');
 const accessor={...env};Object.defineProperty(accessor,'LINK_MEMBERSHIP_ENABLED',{get:()=>'true',enumerable:true});
 check('gate: an accessor is held',gate(accessor).mode==='held');
 const g1=gate(env);env.LINK_MEMBERSHIP_SCOPE=SCOPE.replace('4613','4614');
 check('gate: the witness notices a changed key',g1.check()===false);env.LINK_MEMBERSHIP_SCOPE=SCOPE;
 db.close();

 // ================= grant once
 await newWorld();
 const codeA=await issue(A,'guid.player'),good=await link(codeA);
 const r1=await post(good.text);
 const row=settlements()[0];
 check('grant: a councillor-observed link gives Guild Member (linked, member)',r1.status===200&&r1.body.ok===true&&r1.body.status==='linked'&&r1.body.reason==='member',r1);
 check('grant: exactly one role PUT, to the shared Guild Member role, for the signed-in account',puts()===1&&http.filter(x=>x.method==='PUT')[0].path==='/guilds/'+G+'/members/'+A+'/roles/'+R&&present.includes(R));
 check('grant: one settled live_link_membership row with the shared writer own ACK and the 230 reason',settlements().length===1&&row.state==='settled'&&row.attempts===1&&row.reason==='launch230_put_acknowledged_and_confirmed'&&row.role_id===R&&row.subject===A&&row.desired===1&&row.native_profile==='live-link-v1'&&row.native_guid===GUIDA&&row.roster_id===null&&/^[0-9a-f]{64}$/.test(row.request_digest),settlements());
 const ch=db.prepare('SELECT * FROM characters').all();
 check('grant: the character is bound to the account with source link and its GUID',ch.length===1&&ch[0].name_key==='guid player'&&ch[0].discord_id===A&&ch[0].source==='link'&&ch[0].guid===GUIDA&&ch[0].status==='verified');
 const mk=markers();
 check('grant: one marker, settled, keyed by the code not the account, holding no name, GUID, code or account id',mk.length===1&&!mk[0].key.includes(A)&&JSON.parse(mk[0].value).state==='settled'&&Object.keys(JSON.parse(mk[0].value)).sort().join(',')==='createdAt,expiresAt,reason,state,updatedAt,v'&&![A,'guid player',GUIDA,codeA.token,good.R].some(x=>mk[0].value.includes(x)),mk);
 check('grant: no addRole, no Link role, no code consumed or audit row in LINK_DB',ROLE_ADDS.length===0&&!http.some(x=>/1700000000000000001/.test(x.path))&&linkDb.sqlite.prepare('SELECT used FROM codes').get().used===null&&linkDb.sqlite.prepare('SELECT COUNT(*) n FROM inbox_uploads').get().n===0&&linkDb.sqlite.prepare('SELECT COUNT(*) n FROM members').get().n===0);
 check('grant: no secret or identifier reached the log',!LOGS.some(x=>x.includes(good.R)||x.includes(codeA.token)||x.includes(A)));
 const afterGrant=snap();
 const r2=await post(good.text);
 check('repeat: the same link reads back member-already with zero writes',r2.body.status==='linked'&&r2.body.reason==='member-already'&&snap()===afterGrant,r2);
 const again=await link(codeA,{nonce:'fedcba9876543210'});
 const r3=await post(again.text);
 check('second consume: the same code with a new nonce reads back member-already with zero writes',r3.body.reason==='member-already'&&snap()===afterGrant,r3);
 const codeA2=await issue(A,'guid.player'),other=await link(codeA2);
 const r4=await post(other.text);
 check('another code for an account that is already Guild Member reads back member-already, zero writes',r4.body.reason==='member-already'&&snap()===afterGrant&&puts()===1,r4);
 db.close();

 // ================= refusals: each leaves the bot database and Discord untouched
 async function refusal(name,reason,setup,mutate){
  await newWorld(setup?.world||{});
  const code=await issue(A,'guid.player');let token='signin-token-a-0001';
  const made=await link(code,setup?.link||{});let text=made.text;
  if(setup?.prepare)await setup.prepare({code,made});
  if(mutate)text=mutate(text,made);
  if(setup?.token)token=setup.token;
  const s0=snap(),res=await post(text,token),s1=snap();
  check('refusal '+name+' answers '+reason,res.body.ok!==true&&res.body.reason===reason,res.body);
  check('refusal '+name+' writes nothing and sends no Discord request',s0===s1&&http.length===0);
  db.close();
 }
 await refusal('flag off','membership-off',{world:{flag:false}});
 await refusal('flag false','membership-off',{world:{flag:'false'}});
 await refusal('flag held','membership-off',{world:{flag:'TRUE'}});
 await refusal('scope missing','membership-off',{world:{scope:false}});
 await refusal('unobserved GUID','guid-unobserved',{link:{obs:'c'}});
 await refusal('claimed guild check','guid-unobserved',{world:{policy:'claimed'},link:{gv:'c',obs:'c'}});
 await refusal('other guild','guild-scope',{link:{guild:'Olympus II'}});
 await refusal('other faction','guild-scope',{link:{faction:'Horde'}});
 await refusal('other server id','guild-scope',{link:{guid:'Player-9999-005A70D8'}});
 await refusal('tampered GUID','not-enough',{},(t)=>t.replace(GUIDA,'Player-4613-005A70D9'));
 await refusal('tampered name','tag',{},(t)=>t.replace('Guid Player','Guid Playex'));
 await refusal('tampered guild','not-enough',{},(t)=>t.replace('OLYMPUS PRIME','OLYMPUS PRIMF'));
 await refusal('unknown version','format',{},(t)=>t.replace('OLB6','OLB7'));
 await refusal('other Discord account','other-user',{token:'signin-token-b-0002'});
 await refusal('signed-out token','login',{token:'signin-token-z-9999'});
 await refusal('banned member','blocked',{prepare:async()=>{await w('INSERT INTO members(discord_id,banned) VALUES(?,1)',A);}});
 await refusal('denied site user','blocked',{prepare:async()=>{await w("INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?,1,1,1)",A);}});
 await refusal('rename hold','blocked',{prepare:async()=>{await w("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at) VALUES(?,?,?,?,?,'reapply','x',1)",A,'a','b','guid player','n');}});
 await refusal('character linked to another account by name','linked-elsewhere',{prepare:async()=>{await w("INSERT INTO members(discord_id) VALUES(?)",B);await w("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source) VALUES('guid player','Guid Player',?,'member',1,'whisper')",B);}});
 await refusal('GUID linked to another account','linked-elsewhere',{prepare:async()=>{await w("INSERT INTO members(discord_id) VALUES(?)",B);await w("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source,guid) VALUES('renamed','Renamed',?,'member',1,'whisper',?)",B,GUIDA);}});
 await refusal('roster lists the name under another GUID','guid-mismatch',{prepare:async()=>{
  const id=(await w("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,trusted,complete) VALUES(?,?,'addon',1,1,1)",T,T)).meta.last_row_id;
  await w("INSERT INTO roster_members(snapshot_id,name_key,name,guid) VALUES(?,?,?,?)",id,'guid player','Guid Player','Player-4613-00FFFFFF');}});
 {
  await newWorld();const code=await issue(A,'guid.player'),made=await link(code);
  const id=(await w("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,trusted,complete) VALUES(?,?,'addon',1,1,1)",T,T)).meta.last_row_id;
  await w("INSERT INTO roster_members(snapshot_id,name_key,name,guid) VALUES(?,?,?,?)",id,'guid player','Guid Player',GUIDA);
  const res=await post(made.text);check('a roster that lists the same GUID does not hold the grant',res.body.reason==='member'&&puts()===1,res.body);db.close();
 }
 {
  await newWorld();const code=await issue(A,'guid.player'),made=await link(code);const s0=snap();T+=2*86400+60;
  const res=await post(made.text);T-=2*86400+60;
  check('refusal expired: a code older than expiry plus one day answers expired with zero writes',res.body.reason==='expired'&&s0===snap()&&http.length===0,res.body);db.close();
 }
 {
  await newWorld();const code=await issue(A,'guid.player');const made=await link(code);
  const rogue=await subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const parts=made.text.split('~'),fields=parts[8].split(',');const b={version:6,requester:CHARA,guid:GUIDA,guild:'OLYMPUS PRIME',faction:'Alliance',nonce:parts[5],R:parts[6],tag:parts[7]};
  const p={issued:+fields[0],keyId:fields[1],confirmer:fields[2],gv:'r',obs:'o'};
  fields[5]=Buffer.from(await subtle.sign('Ed25519',rogue.privateKey,Buffer.from(core.signedMessage(b,p),'utf8'))).toString('base64url');fields[6]=Buffer.from(await subtle.exportKey('raw',rogue.publicKey)).toString('base64url');
  parts[8]=fields.join(',');const s0=snap(),res=await post(parts.join('~'));
  check('refusal wrong signer: a key the bot never certified answers not-enough with zero writes',res.body.reason==='not-enough'&&s0===snap()&&http.length===0,res.body);db.close();
 }
 {
  await newWorld();const code=await issue(A,'guid.player'),made=await link(code);
  const o5=['OLB5',CHARA,'OLYMPUS PRIME','Alliance',made.text.split('~')[5],made.R,made.text.split('~')[7],'x'].join('~');
  const s0=snap(),res=await post(o5);
  check('olb5 (an incomplete one): with membership on it is refused, nothing written, no Discord request, the code unspent (a complete one: the pack case olb5 below)',res.body.ok!==true&&res.body.reason==='format'&&s0===snap()&&http.length===0&&puts()===0&&linkDb.sqlite.prepare('SELECT used FROM codes').get().used===null,res.body);db.close();
 }
 {
  await newWorld();const code=await issue(A,'guid.player'),made=await link(code);env.SHARED_MEMBERSHIP230_MODE='off';
  const s0=snap(),res=await post(made.text);
  check('venue off: the link is not consumed and nothing is written',res.body.reason==='membership-off'&&s0===snap()&&http.length===0,res.body);db.close();
 }

 // ================= concurrent double submit: one settlement
 await newWorld();
 {
  const code=await issue(A,'guid.player'),made=await link(code);
  const [x,y]=await Promise.all([post(made.text),post(made.text)]);
  const reasons=[x.body.reason,y.body.reason].sort();
  check('concurrent: two submits of one link give one settlement and one role PUT',settlements().length===1&&puts()===1&&db.prepare('SELECT COUNT(*) n FROM characters').get().n===1&&markers().length===1,reasons);
  check('concurrent: one answers member, the other member-already or member-pending',reasons.includes('member')&&reasons.some(v=>v==='member-already'||v==='member-pending'),reasons);
 }
 db.close();

 // ================= a provider that refuses leaves no half grant
 await newWorld();
 {
  const code=await issue(A,'guid.player'),made=await link(code);
  const rest=stubs['./discord'].rest;stubs['./discord'].rest=async(e,m,p,...a)=>{if(m==='PUT')throw Error('synthetic PUT failure');return rest(e,m,p,...a);};
  const res=await post(made.text);stubs['./discord'].rest=rest;
  check('provider failure: the answer is member-pending, never member, and the role is absent',res.body.ok!==true&&res.body.reason==='member-pending'&&!present.includes(R),res.body);
  const s=settlements();check('provider failure: the shared writer kept its own record of the attempt',s.length===1&&s[0].state!=='settled',s);
  const mk2=markers();check('provider failure: the marker is not settled',mk2.length===1&&JSON.parse(mk2[0].value).state!=='settled');
 }
 db.close();

 // ================= privacy: the marker holds nothing attributable and the settings readers never see it
 await newWorld();
 {
  const registry=load('./community-data-registry');
  const code=await issue(A,'guid.player'),made=await link(code);await post(made.text);
  const m=markers();
  check('privacy: one marker, keyed by a hash of the request tag and holding only state, reason, times and an expiry',m.length===1&&/^livelink:[0-9a-f]{64}$/.test(m[0].key)&&Object.keys(JSON.parse(m[0].value)).sort().join(',')==='createdAt,expiresAt,reason,state,updatedAt,v');
  const mv=JSON.parse(m[0].value),codeExp=linkDb.sqlite.prepare('SELECT exp FROM codes').get().exp;
  check('privacy: the marker expires one day after the code stops being submittable',mv.expiresAt===Math.max(mv.createdAt,codeExp)+86400+86400,mv);
  check('privacy: the marker is the same for either account (keyed by the code, never by who submitted it)',m[0].key==='livelink:'+h('live-link|v1|key|'+made.R));
  check('privacy: no account id, character, GUID, code or token is in the marker key or value',![A,'guid player','Guid Player',GUIDA,made.R,code.token].some(x=>(m[0].key+m[0].value).includes(x)));
  {
   // Nothing in the marker may be recomputed or joined from an account's own data: not from the subject, GUID, name or code, and
   // not from the digest the settlement row carries (the request fingerprint SHA-256(...|op|subject|guid)).
   const row=settlements()[0],op=h('live-link|v1|op|'+made.R).slice(0,32);
   const fingerprints=[h('live-link-request|v1|'+op+'|'+A+'|'+GUIDA),row.request_digest,row.id,op,made.R];
   const known=[A,'guid player','Guid Player',GUIDA,code.token,made.R,...fingerprints,h(A),h(GUIDA),h('guid player'),h(code.token),h(made.R)];
   const hexRuns=(m[0].value.match(/[0-9a-f]{16,}/g)||[]);
   check('privacy: the marker value holds no hex digest at all, and nothing computable from the subject, GUID, name, code or settlement fingerprint',
     hexRuns.length===0&&known.every(x=>x&&!m[0].value.includes(String(x))&&!m[0].value.includes(String(x).slice(0,32))),m[0].value);
   check('privacy: the settlement fingerprint is not in the marker key either, so the bot database alone cannot join the marker to the account',
     fingerprints.every(x=>x&&!m[0].key.includes(String(x).slice(0,32)))&&row.request_digest===h('live-link-request|v1|'+op+'|'+A+'|'+GUIDA));
  }
  check('privacy: it adds no family to the community registry, so this change leaves the erasure job statement budget and the namespace list as they are',!registry.communityDataNames().some(n=>/live[_-]?link/i.test(n)),registry.communityDataNames().join(','));
  const settings=load('./site-data').settingsFrom(env,(await env.DB.prepare('SELECT key, value FROM site_settings').all()).results);
  check('privacy: the settings readers look keys up by name, so the marker never reaches a setting',settings!==null&&typeof settings==='object'&&!JSON.stringify(settings).includes('livelink')&&markers().length===1);
  const ch=db.prepare('SELECT * FROM characters').all(),st=settlements();
  check('privacy: the character binding and the role record are ordinary account data tied to the account',ch.length===1&&ch[0].discord_id===A&&st.length===1&&st[0].subject===A);
 }
 db.close();

 // ================= privacy: markers expire
 await newWorld();
 {
  const code=await issue(A,'guid.player'),made=await link(code);await post(made.text);
  // expiry: a stale marker is deleted by the next consume; a live one is kept; none of it holds an account
  const stale='livelink:'+'0'.repeat(64),fresh='livelink:'+'f'.repeat(64);
  const mkv=(e)=>JSON.stringify({v:1,state:'settled',reason:'x',createdAt:1000,updatedAt:1000,expiresAt:e});
  await w('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,1)',stale,mkv(2000));await w('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,1)',fresh,mkv(4102444800));
  const codeB=await issue(B,'other.player'),madeB=await link(codeB,{requester:'Other Player-ClassicBetaPvP',guid:'Player-4613-005A70D9'});await post(madeB.text,'signin-token-b-0002');
  const keys=markers().map(x=>x.key);
  check('privacy: an expired marker is deleted by the next consume and an unexpired one is kept',!keys.includes(stale)&&keys.includes(fresh),keys);
 }
 db.close();

 // ================= /verify text
 await newWorld({flag:false});
 {
  const whisper='WHISPER REPLY',user={id:B,username:'other.player'};
  const off=await L.appendLinkBlock(env,user,whisper);
  const codeB=await core.issueCode(lenv,user,'discord');
  check('/verify off: the Link block is appended last, exactly as today',off===whisper+'\n\n'+codeB.reply&&codeB.reply.length>0);
  const offFalse=await L.appendLinkBlock({...env,LINK_MEMBERSHIP_ENABLED:'false'},user,whisper),offHeld=await L.appendLinkBlock({...env,LINK_MEMBERSHIP_ENABLED:'TRUE'},user,whisper);
  check('/verify off, false and held are byte-identical to today',offFalse===off&&offHeld===off);
  const on=await L.appendLinkBlock({...env,LINK_MEMBERSHIP_ENABLED:'true',LINK_MEMBERSHIP_SCOPE:SCOPE},user,whisper);
  check('/verify on: the Link block first, then the fallback line, then the whisper reply',on===codeB.reply+'\n\n'+"Can't use Olympus Link right now? Whisper instead:"+'\n'+whisper,on);
  check('/verify on stays within the reply limit and keeps the whisper reply whole',on.length<=L.LINK_REPLY_MAX&&on.endsWith(whisper));
  const big='W'.repeat(L.LINK_REPLY_MAX-20),dropped=await L.appendLinkBlock({...env,LINK_MEMBERSHIP_ENABLED:'true',LINK_MEMBERSHIP_SCOPE:SCOPE},user,big);
  check('/verify on: a reply too long for the block is returned unchanged, never cut',dropped===big);
 }
 db.close();

 // ================= the vendored GUID vectors, through the vendored core and the route
 {
  const pack=JSON.parse(fs.readFileSync(path.join(root,'vendor','olympus-link','guid-vectors.json'),'utf8'));
  const savedT=T;
  for(const c of pack.cases){
   await newWorld({policy:'claimed'});T=c.now||pack.clock;
   for(const code of pack.codes)await linkDb.prepare('INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(code.R,code.discord_id,code.username,code.mode,code.T,code.created,code.exp,'OLC2.'+code.R+'.'+code.username+'.'+code.exp+'.'+code.mode+'.'+code.T+'.'+code.codeTail,'discord').run();
   for(const k of pack.keys)await linkDb.prepare('INSERT INTO keys (key_id, public_key, owner_discord_id, owner_username, character, kind, bootstrap, created, cert_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(k.key_id,k.public_hex,k.owner_discord_id,k.owner_username,k.character,k.kind,k.bootstrap,k.created,k.cert_exp).run();
   env.LINK_BACKEND_PUBLIC=pack.backend.public_hex;lenv=L.linkEnv(env);
   const owner=pack.codes.find(x=>x.R===c.code).discord_id;
   const parsed=core.parseBundle(c.text),verdict=parsed.ok?await core.checkProof({LINK_DB:linkDb,LINK_BACKEND_PUBLIC:pack.backend.public_hex,LINK_GUILD_POLICY:'verified'},c.text,{discordId:owner,t:T}):{ok:false,reason:'format'};
   const want=c.core.check;
   check('vectors '+c.name+': the vendored core gives the pack verdict',c.core.parse==='ok'?parsed.ok===true&&(want.ok?verdict.ok===true&&(verdict.version??5)===want.version&&(verdict.guidObserved??false)===want.guidObserved:verdict.ok===false&&verdict.reason===want.reason):parsed.ok===false&&parsed.error===c.core.parse,verdict);
   OAUTH['signin-token-pack']={id:owner,username:'pack.user'};
   // The pack names its main guild OLYMPUS PRIME (the bot flagship), so a valid link here is in scope and must grant.
   const s0=snap(),by=Object.fromEntries(pack.cases.map(x=>[x.name,x])),seq=c.fern.sequence,seen=[];
   if(c.fern.after)await post(by[c.fern.after].text,'signin-token-pack');
   const afterFirst=snap(),res=await post(c.text,'signin-token-pack');seen.push(res.body.reason);
   for(let i=1;i<seq.length;i++)seen.push((await post(c.text,'signin-token-pack')).body.reason);
   if(seq[0]==='member'||c.fern.after){
    check('vectors '+c.name+': the route answers '+seq.join(' then ')+' (a main-guild proof from the pack)',JSON.stringify(seen)===JSON.stringify(seq),seen);
    check('vectors '+c.name+': Guild Member is given exactly once: one settled row, one role PUT, one marker',settlements().length===1&&settlements()[0].state==='settled'&&puts()===1&&markers().length===1,settlements());
   }
   else check('vectors '+c.name+': the route answers '+seq[0]+' with no write of any kind',JSON.stringify(seen)===JSON.stringify(seq)&&s0===snap()&&http.length===0,seen);
   if(c.name==='olb5'){delete env.LINK_MEMBERSHIP_ENABLED;const off=await post(c.text,'signin-token-pack');check('vectors olb5: with membership off the link still takes the unchanged upstream path (not name-only) and never gives Guild Member',off.body.reason!=='name-only'&&off.body.reason!=='member'&&off.body.reason!=='member-already'&&settlements().length===0&&puts()===0,off.body);}
   void afterFirst;
   delete OAUTH['signin-token-pack'];db.close();
  }
  T=savedT;
 }
 console.log(ok+'/'+n+' live link membership checks passed');process.exitCode=ok===n?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
const runner230=new Module230(__filename,module);runner230.filename=__filename;runner230.paths=module.paths;runner230._compile(fixture230+body230,__filename);
