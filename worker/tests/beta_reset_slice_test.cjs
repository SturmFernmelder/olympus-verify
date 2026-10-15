// Real candidate source + SQLite schema + installed privacy admission. All Discord payloads are synthetic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');globalThis.crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..'),cache={};
const currentEntry=require('./helpers/privacy129_fixture.cjs');
function load(name){if(name==='node:async_hooks')return require(name);name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,p=>load(p));return m.exports;}
// Stable synthetic globals precede original source capture; never replace them mid-run.
let db,env,clock,physical,requests,members,directory,sqlBefore,sqlAfter,sqlObserve,batchAfter,pageHook,memberHook,deleteHook,pageStatus,loseDelete,deleteNoEffect;
const realNow=Date.now;Date.now=()=>clock*1000;
let providerFetch;globalThis.fetch=(input,init)=>providerFetch(input,init);
providerFetch=async(input,init={})=>{if(input instanceof Request){init={method:input.method,headers:input.headers,...init};input=input.url;}const url=new URL(String(input)),p=url.pathname,method=init.method||'GET';requests.push({method,path:p,after:url.searchParams.get('after')});let value;
 if(p.endsWith('/members')&&method==='GET'){if(pageHook)await pageHook();if(pageStatus!==200)return new Response('{}',{status:pageStatus});assert.equal(url.searchParams.get('limit'),'1000');const after=BigInt(url.searchParams.get('after'));value=directory.filter(id=>BigInt(id)>after).slice(0,1000).map(id=>({user:{id,username:'PRIVATE_USERNAME_MARKER',avatar:'PRIVATE_AVATAR_MARKER'},nick:'PRIVATE_NICK_MARKER',roles:[...members.get(id)]}));}
 else if(p.endsWith('/users/@me'))value={id:bot};else if(p.endsWith('/roles')&&method==='GET')value=inventory;
 else{const m=p.match(/\/members\/(\d+)(?:\/roles\/(\d+))?$/);if(!m)throw Error('unexpected provider path '+p);
  if(m[2]){assert.equal(method,'DELETE','reset must never PUT');if(!deleteNoEffect)members.set(m[1],members.get(m[1]).filter(x=>x!==m[2]));if(deleteHook)await deleteHook(m[1],m[2]);if(loseDelete)throw Error('synthetic DELETE response lost');return new Response(null,{status:204});}
  if(memberHook)await memberHook(m[1]);if(!members.has(m[1]))return new Response('{}',{status:404});value={user:{id:m[1]},roles:[...members.get(m[1])]};}
 return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
};
const policy=load('beta-reset-policy'),engine=load('beta-reset'),central=load('role-settlements'),admission=load('privacy-write-admission');
const guild=policy.BETA_RESET_GUILD_ID,memberRole=policy.BETA_RESET_ROLE_IDS[0],owner='700000000000000001',bot='700000000000000002',botRole='700000000000000003';
const leader='1554261979684933742',officer='1554262223038324840',raidLeader='1554262510650007602',moderator='571363393555136512',highRole='700000000000000004';
const preserved=[leader,officer,raidLeader,moderator],appointed=JSON.stringify({council:'Fixture appointment'});

const inventory=[{id:guild,position:0,permissions:'0',managed:false},{id:botRole,position:50,permissions:'268435456',managed:false},
 ...policy.BETA_RESET_ROLE_IDS.map((id,i)=>({id,position:i+1,permissions:'0',managed:false})),
 ...preserved.map((id,i)=>({id,position:i+30,permissions:'1024',managed:false})),{id:highRole,position:70,permissions:'0',managed:false}];
let originalNative,fixtureWriter;
function nativeObservation(){return {physical,statements:originalNative?.nativeTrace.length??0,groups:originalNative?.nativeGroups.map(g=>g.length)??[],providerRequests:requests.length};}
function d1(){originalNative=currentEntry.originalNativePort(db,{statement(sql,values){physical++;if(sqlObserve)sqlObserve(sql,values);},beforeRun:async(sql,values)=>{if(sqlBefore)await sqlBefore(sql,values);},beforeRead(sql,values){if(sqlBefore)sqlBefore(sql,values);},afterRead(sql,values,out){if(sqlAfter)sqlAfter(sql,values,out);},afterBatch:async(plan,out)=>{if(batchAfter)await batchAfter(plan.map(x=>x.sql),out);}});return originalNative;}
async function fixtureRun(sql,...values){return fixtureWriter.prepare(sql).bind(...values).run();}
function currentSetup(){currentEntry.installCurrentEntryEpoch(db,{now:clock});env=currentEntry.currentEntryEnvironment({...env,DB:d1()});fixtureWriter=admission.createPrivacyWriteAdmissionDatabase(originalNative,'writer','canonical',currentEntry.ENTRY_EPOCH);env.DB=fixtureWriter;}

const subject=i=>String(800000000000000000n+BigInt(i+1));
const arm=()=>JSON.stringify({version:2,epoch:policy.BETA_RESET_EPOCH,cutoff:policy.BETA_RESET_CUTOFF,guildId:guild,roleIds:[...policy.BETA_RESET_ROLE_IDS],armedAt:policy.BETA_RESET_CUTOFF-100});
async function reset(installed=false,count=1,roles=[memberRole]){if(db)db.close();clock=policy.BETA_RESET_CUTOFF;physical=0;requests=[];sqlBefore=null;sqlAfter=null;sqlObserve=null;batchAfter=null;pageHook=null;memberHook=null;deleteHook=null;pageStatus=200;loseDelete=false;deleteNoEffect=false;
 db=new DatabaseSync(':memory:');db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});// Empty database: the existing current epoch installer owns its exact physical schema.

 env={DB:d1(),GUILD_ID:guild,SITE_GUILD_ID:guild,SITE_ADMINS:owner,ROLE_GUILD_MEMBER:memberRole,ROLE_GUILD_MASTER:'',ROLE_GUILD_LEADER:leader,ROLE_OFFICER:officer,ROLE_RAID_LEADER:raidLeader,ROLE_MODERATOR:moderator,DISCORD_APP_ID:bot,DISCORD_BOT_TOKEN:'fixture-only',QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:[policy.BETA_RESET_ROLE_IDS[2],policy.BETA_RESET_ROLE_IDS[4],policy.BETA_RESET_ROLE_IDS[7],policy.BETA_RESET_ROLE_IDS[9],policy.BETA_RESET_ROLE_IDS[11]]}),BETA_RESET_REMOVALS_ENABLED:'true'};
 currentSetup();
 const setting=(key,value)=>fixtureRun('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',key,value,clock,owner);await setting(policy.BETA_RESET_POLICY_KEY,arm());await setting('appointed',appointed);await setting('leadership','fixture-preserved-leadership');
 members=new Map([[bot,[botRole]]]);directory=[];for(let i=0;i<count;i++){const id=subject(i);directory.push(id);members.set(id,[...roles,...preserved]);}
 console.log('CURRENT_NATIVE_SETUP '+JSON.stringify({legacyBranch:installed?'admitted':'native',currentAdmission:true,layout:'canonical',epoch:currentEntry.ENTRY_EPOCH}));physical=0;
}

const jobs=()=>db.prepare("SELECT * FROM role_settlements WHERE purpose='beta_reset' ORDER BY created_at,id").all();
const effects=()=>requests.filter(x=>x.method==='DELETE'||x.method==='PUT');
const scan=()=>{const row=db.prepare('SELECT value FROM site_settings WHERE key=?').get(engine.BETA_RESET_SCAN_KEY);return row?JSON.parse(row.value):null;};
const targetCount=()=>directory.reduce((n,id)=>n+members.get(id).filter(r=>policy.BETA_RESET_ROLE_IDS.includes(r)).length,0);
const replacePolicy=()=>fixtureRun('UPDATE site_settings SET value=? WHERE key=?',JSON.stringify(JSON.parse(arm()),null,2),policy.BETA_RESET_POLICY_KEY);
let checks=0;const costs=[];function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
async function slice(name){const p=physical,n=requests.length,d=effects().length,groupBefore=originalNative.nativeGroups.length,value=await engine.runBetaResetSlice(env);const cost={name,physical:physical-p,http:requests.length-n,deletes:effects().length-d,nativeGroups:originalNative.nativeGroups.slice(groupBefore).map(g=>g.length),state:value.state,processed:value.processed};costs.push(cost);console.log('NATIVE_SLICE_OBSERVATION '+JSON.stringify(cost));
 assert.ok(cost.physical<=engine.BETA_RESET_CAPS.physicalStatements,name+' SQL bound '+cost.physical);assert.ok(cost.http<=40&&cost.deletes<=6&&value.processed<=6&&value.discoveryPages<=1,name+' work bound');assert.equal(value.http,cost.http,name+' exact network accounting');
 if(!/drain tick/.test(name))console.log('SLICE_COST '+JSON.stringify(cost));return value;}
function unchangedPrivate(name,status){const privateData=JSON.stringify({jobs:jobs(),scan:scan()});check(name+' persists no member names/avatar/nick',!privateData.includes('PRIVATE_'));
 check(name+' persisted target tuples stay in exact reset scope',jobs().every(x=>policy.BETA_RESET_ROLE_IDS.includes(x.role_id)&&x.guild_id===guild&&x.desired===0&&x.native_guid===null&&x.native_rank_name===null));
 check(name+' status contains counts without member identifiers',!JSON.stringify(status).includes(subject(0))&&!JSON.stringify(status).includes(memberRole));
 check(name+' preserves website appointments and leadership',db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value===appointed&&db.prepare("SELECT value FROM site_settings WHERE key='leadership'").get().value==='fixture-preserved-leadership');}
(async()=>{
 check('fixed one-page/six-intent/network/SQL caps',JSON.stringify(engine.BETA_RESET_CAPS)===JSON.stringify({membersPerPage:1000,roleIntentsPerRun:6,network:40,physicalStatements:300}));
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  await reset(installed,6);let out=await slice(label+' six actual removals');check(label+' first page removes exactly six tuples',out.state==='progress'&&out.discoveryPages===1&&out.discoveredMembers===6&&out.processed===6&&out.settled===6&&effects().length===6&&targetCount()===0&&out.http===37);
  check(label+' each target removed under one consumed attempt',jobs().filter(x=>x.attempts===1).length===6&&jobs().filter(x=>x.attempts===1).every(x=>x.state==='settled'));
  check(label+' protected Discord roles preserved',directory.every(id=>JSON.stringify(members.get(id))===JSON.stringify(preserved)));unchangedPrivate(label,out);

  await reset(installed,1,policy.BETA_RESET_ROLE_IDS);await slice(label+' all twelve roles first six');await slice(label+' all twelve roles final six');
  check(label+' all twelve approved roles removed once across two slices',effects().length===12&&new Set(effects().map(x=>x.path)).size===12&&targetCount()===0&&JSON.stringify(members.get(subject(0)))===JSON.stringify(preserved));

  await reset(installed,161);const initial=clock;let ticks=0;while(targetCount()>0&&ticks<30){const value=await slice(label+' drain tick '+(++ticks));check(label+' drain tick '+ticks+' progresses',value.state==='progress'&&value.settled===Math.min(6,161-6*(ticks-1)));clock+=60;}
  check(label+' 161 single-role holders drain in exactly 27 ticks',ticks===27&&targetCount()===0&&effects().length===161&&clock-initial===1620);
  check(label+' expired observations have fresh successors without deadline rewrites',jobs().filter(x=>x.reason==='beta_reset_observation_consumed').every(x=>x.expires_at===initial+300)&&jobs().filter(x=>x.attempts===1).some(x=>x.created_at>initial+300));

  await reset(installed,1005,[]);for(let i=0;i<6;i++)members.get(subject(i)).push(memberRole);members.get(subject(1004)).push(memberRole);
  const firstPage=await slice(label+' paginated first page');check(label+' full page keeps exact cursor',firstPage.discoveredMembers===1000&&scan().after===subject(999)&&scan().completedPasses===0);
  const lastPage=await slice(label+' paginated final page');check(label+' short last page completes and resets cursor',lastPage.discoveredMembers===5&&scan().after==='0'&&scan().completedPasses===1&&scan().lastPassScanned===1005&&effects().length===7);
  const nextPass=await slice(label+' continuous rescan');check(label+' completed scan starts a fresh full pass',nextPass.discoveredMembers===1000&&scan().after===subject(999)&&effects().length===7);

  await reset(installed);await slice(label+' initial external-role removal');const old=jobs().find(x=>x.attempts===1);members.get(subject(0)).push(memberRole);clock+=60;
  await slice(label+' later external regrant');check(label+' later external regrant creates a separate fresh one-use intent',effects().length===2&&jobs().filter(x=>x.attempts===1).length===2&&jobs().find(x=>x.id===old.id).claim_nonce===old.claim_nonce&&targetCount()===0);

  await reset(installed);loseDelete=true;out=await slice(label+' lost DELETE reply');const spent=jobs().find(x=>x.attempts===1);check(label+' lost DELETE is one durable unknown',out.unknown===1&&spent.state==='unknown'&&effects().length===1);loseDelete=false;clock+=1801;
  out=await slice(label+' lost DELETE GET-only observation');check(label+' unknown DELETE remains unknown after GET without second DELETE',out.unknown===1&&effects().length===1&&jobs().find(x=>x.id===spent.id).state==='unknown');
  await reset(installed);loseDelete=true;deleteNoEffect=true;await slice(label+' lost nonlanded DELETE');loseDelete=false;deleteNoEffect=false;clock+=1801;out=await slice(label+' spent present GET-only');check(label+' spent present role is never automatically DELETE-retried',out.unknown===1&&effects().length===1&&targetCount()===1);

  await reset(installed);let replaced=false;memberHook=async id=>{if(id===subject(0)&&!replaced){replaced=true;await env.DB.prepare('UPDATE site_settings SET value=? WHERE key=?').bind(JSON.stringify(JSON.parse(arm()),null,2),policy.BETA_RESET_POLICY_KEY).run();}};out=await slice(label+' policy change during member lookup');check(label+' changed original policy prevents DELETE after lookup',replaced&&effects().length===0&&out.state==='held');
  await reset(installed);replaced=false;sqlBefore=async sql=>{if(sql.includes("reason='beta_reset_dispatching'")&&!replaced){replaced=true;await replacePolicy();}};out=await slice(label+' policy change during claim');check(label+' claim SQL consumes original policy atomically',replaced&&effects().length===0&&jobs().every(x=>x.attempts===0)&&out.state==='held');

  await reset(installed,6);const before=physical,net=requests.length;const concurrent=await Promise.all([engine.runBetaResetSlice(env),engine.runBetaResetSlice(env)]);
  check(label+' concurrent slices allow only one live lease',concurrent.filter(x=>x.state==='progress').length===1&&concurrent.filter(x=>x.state==='busy').length===1&&effects().length===6&&requests.length-net<=40&&physical-before<=300);
  await reset(installed);let lost=false;batchAfter=(sqls)=>{if(!lost&&sqls.some(sql=>sql.includes('INSERT OR IGNORE INTO role_settlements'))){lost=true;batchAfter=null;throw Error('synthetic committed scan reply loss');}};
  out=await slice(label+' committed scan batch lost reply');check(label+' scan commit remains durable without dispatch',lost&&out.state==='held'&&scan().completedPasses===1&&jobs().length===1&&effects().length===0);
  out=await slice(label+' unknown scan lease holds');check(label+' unknown committed cursor lease prevents immediate replay',out.state==='busy'&&out.http===0);clock+=121;
  out=await slice(label+' unknown scan resumes durable cursor');check(label+' expired scan lease continues with one DELETE',out.state==='progress'&&effects().length===1&&targetCount()===0);

  await reset(installed);lost=false;const loseClaim=sqls=>{if(!lost&&sqls.some(sql=>sql.includes("reason='beta_reset_dispatching'"))){lost=true;sqlAfter=null;batchAfter=null;throw Error('synthetic committed claim reply loss');}};// Both legacy branches now use admitted Native transactions; reply loss must follow COMMIT.
  batchAfter=loseClaim;
  out=await slice(label+' committed claim lost reply');check(label+' committed lost claim consumes attempt without blind DELETE',lost&&out.state==='held'&&effects().length===0&&jobs().some(x=>x.state==='dispatching'&&x.attempts===1));clock+=1801;
  out=await slice(label+' unknown claim GET-only reconciliation');check(label+' unknown committed claim cannot redispatch',out.unknown===1&&effects().length===0&&jobs().some(x=>x.state==='unknown'&&x.attempts===1));

  await reset(installed,12);for(let i=0;i<6;i++)members.get(subject(i)).push(highRole);await slice(label+' first hierarchy holds');await slice(label+' pending beyond hierarchy holds');await slice(label+' finish nonheld targets');
  check(label+' held hierarchy targets do not starve pending subjects',effects().length===6&&directory.slice(0,6).every(id=>members.get(id).includes(memberRole))&&directory.slice(6).every(id=>!members.get(id).includes(memberRole)));

  await reset(installed,7);await slice(label+' backlog before page denial');pageStatus=403;out=await slice(label+' page 403 holds backlog');check(label+' failed discovery preserves cursor and backlog without effects',out.state==='held'&&effects().length===6&&targetCount()===1&&out.processed===0&&scan().lastError==='beta_reset_discovery_or_storage_held');pageStatus=200;
  await slice(label+' discovery recovers backlog');check(label+' backlog resumes after inventory recovery',effects().length===7&&targetCount()===0);
 }
 await reset();delete env.BETA_RESET_REMOVALS_ENABLED;let out=await slice('default OFF');check('default OFF does no database or provider work',out.state==='inactive'&&physical===0&&requests.length===0&&scan()===null);
 await reset();clock=policy.BETA_RESET_CUTOFF-1;out=await slice('before cutoff');check('before cutoff never scans or removes',out.state==='held'&&requests.length===0&&scan()===null);
 await reset();await fixtureRun('DELETE FROM site_settings WHERE key=?',policy.BETA_RESET_POLICY_KEY);out=await slice('missing control policy');check('enabled missing policy never scans or removes',out.state==='held'&&requests.length===0&&scan()===null);
 console.log('BETA_RESET_SLICE_SUMMARY '+JSON.stringify({checks,measurements:costs.length,maxPhysical:Math.max(...costs.map(x=>x.physical)),maxHttp:Math.max(...costs.map(x=>x.http)),maxDeletes:Math.max(...costs.map(x=>x.deletes)),costs}));console.log(checks+'/'+checks+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
