// Real source, canonical native SQLite and genuine signed staff requests. Only provider HTTP is synthetic.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),cache={};
function load(name){name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;const mod={exports:{}};cache[name]=mod;
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',code)(mod,mod.exports,p=>load(path.posix.normalize(path.posix.join(path.posix.dirname(name),p))));return mod.exports;}
const publication=load('ruleset-publication'),core=load('site-core'),site=load('site'),profile=load('ruleset-profile'),data=load('ruleset-publication-data');
const adapter=load('ruleset-pin-publication');
const ADMIN='700000000000000001',BOT='700000000000000002',GUILD='700000000000000003',OTHER='700000000000000004';
const CH={guide:'700000000000000010','olympus-info':'700000000000000011','guild-announcements':'700000000000000012'};
const T=Math.floor(Date.now()/1000),g='a'.repeat(32);
let n=0,ok=0,maxParameters=0,maxSql=0;const check=(label,v)=>{n++;if(v)ok++;console.log((v?'PASS ':'FAIL ')+label);};
function fixture(generation=null){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));let sqlCount=0,before=null,after=null,lostBatch=false;
 const prepare=sql=>{let args=[];const execute=()=>{sqlCount++;if(before)before(sql,args);const st=db.prepare(sql);let r;
  if(st.columns().length)r={results:st.all(...args),meta:{changes:Number(db.prepare('SELECT changes() AS n').get().n)}};
  else{const x=st.run(...args);r={results:[],meta:{changes:Number(x.changes)}};}if(after)after(sql,args);return r;};
  const s={bind(...a){maxParameters=Math.max(maxParameters,a.length);assert.ok(a.length<=100);args=a;return s;},_run:execute,all:async()=>execute(),run:async()=>execute(),first:async()=>execute().results[0]??null};return s;};
 const DB={prepare,batch:async statements=>{db.exec('BEGIN');try{const out=statements.map(s=>s._run());db.exec('COMMIT');if(lostBatch){lostBatch=false;throw Error('lost committed result');}return out;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}}};
 const env={DB,COOKIE_SECRET:'synthetic-publication-cookie',VERIFY_SECRET:'synthetic-publication-verify',SITE_HOST:'guild.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,INTROS_GUILD_ID:GUILD,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'synthetic-only',SITE_ADMINS:ADMIN,
 INTROS_CHANNELS:`join-olympus=${CH.guide},olympus-info=${CH['olympus-info']},guild-announcements=${CH['guild-announcements']}`,
 ADMISSION_MODE:'review',OFFICER_CHARACTERS:'Synthetic Officer',ROLE_GUILD_MEMBER:'700000000000000099',SET_NICKNAME:'false',NAME_RESERVATION_AT:'0',LAUNCH_AT:'0',COMMUNITY_FEATURES:''};
 db.prepare('INSERT INTO site_users(discord_id,username,in_server,denied,session_version,first_login,last_login,checked_at)VALUES(?,?,1,0,1,?,?,?)').run(ADMIN,'synthetic-staff',T,T,T);
 if(generation)db.prepare("INSERT INTO privacy_subjects VALUES(?,?,'active',1,?,?,NULL,NULL)").run(ADMIN,generation,T,T);
 const messages=new Map(),calls=[];let effectHook=null,getHook=null,losePost=false,next=900000000000000000n,wrongBot=false,wrongGuild=false;
 globalThis.fetch=async(url,init={})=>{const p=new URL(url).pathname.replace(/^\/api\/v10/,''),m=init.method??'GET';calls.push([m,p]);
  if(m==='GET'&&getHook){const h=getHook;getHook=null;await h(p);}
  const reply=(x,status=200)=>new Response(status===204?null:JSON.stringify(x),{status,headers:{'content-type':'application/json'}});let x;
  if(p==='/users/@me')return reply({id:wrongBot?OTHER:BOT,bot:true});
  if((x=p.match(/^\/channels\/(\d+)$/)))return reply({id:x[1],guild_id:wrongGuild?OTHER:GUILD,type:0});
  if((x=p.match(/^\/channels\/(\d+)\/messages\/pins$/)))return reply({items:[...messages.values()].filter(z=>z.channel_id===x[1]&&z.pinned).map(message=>({message}))});
  if((x=p.match(/^\/channels\/(\d+)\/messages$/))&&m==='POST'){
   const body=JSON.parse(init.body);assert.deepEqual(body.allowed_mentions,{parse:[]});const msg={...body,id:String(next++),channel_id:x[1],author:{id:BOT},pinned:false};messages.set(msg.id,msg);
   if(effectHook){const h=effectHook;effectHook=null;await h(msg);}
   if(losePost){losePost=false;throw Error('synthetic lost provider result');}return reply(msg);
  }
  if((x=p.match(/^\/channels\/(\d+)\/messages\/(\d+)$/))){const msg=messages.get(x[2]);if(!msg||msg.channel_id!==x[1])return reply({code:10008},404);
   if(m==='PATCH'){Object.assign(msg,JSON.parse(init.body));if(effectHook){const h=effectHook;effectHook=null;await h(msg);}}return reply(msg);}
  if((x=p.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/))&&m==='PUT'){const msg=messages.get(x[2]);if(!msg)return reply({code:10008},404);msg.pinned=true;if(effectHook){const h=effectHook;effectHook=null;await h(msg);}return reply(null,204);}
  return reply({code:0},404);
 };
 let cookie=null;
 const request=async(method,suffix,body={},extra={})=>{cookie??=(await core.sessionCookie(env,ADMIN,1,generation)).split(';')[0];
  const req=new Request('https://guild.example/api/admin/ruleset-publication'+suffix,{method,headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json',...extra},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  const start=sqlCount,res=await site.handleSite(req,env,new URL(req.url).pathname,true,'synthetic-publication',()=>{});maxSql=Math.max(maxSql,sqlCount-start);return {status:res.status,data:await res.json()};};
 const select=async()=>{const a=await request('GET','');return request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:a.data.form});};
 return {db,env,request,select,messages,calls,get effects(){return calls.filter(c=>c[0]!=='GET').length;},set before(v){before=v;},set after(v){after=v;},set effectHook(v){effectHook=v;},set getHook(v){getHook=v;},set losePost(v){losePost=v;},set lostBatch(v){lostBatch=v;},set wrongBot(v){wrongBot=v;},set wrongGuild(v){wrongGuild=v;},get cookie(){return cookie;},set cookie(v){cookie=v;}};
}
(async()=>{
 const canonical=load('guide').guideMessage({ADMISSION_MODE:'review',OFFICER_CHARACTERS:'Synthetic Officer',ROLE_GUILD_MEMBER:'700000000000000099',SET_NICKNAME:'false'});
 const received=structuredClone(canonical);received.embeds[0].type='rich';for(const field of received.embeds[0].fields??[])field.inline??=false;
 received.components.forEach(c=>{c.id=0;c.components.forEach(x=>{x.id=0;x.disabled=false;});});
 check('actual source payload accepts innocuous Discord response defaults',adapter.messageMatches(received,canonical));
 received.components[0].components[0].type=4;check('changed source-defined component type is refused',!adapter.messageMatches(received,canonical));
 received.components[0].components[0].type=canonical.components[0].components[0].type;received.embeds[0].image={url:'https://unapproved.invalid/personal'};
 check('extra semantic embed content is refused',!adapter.messageMatches(received,canonical));
 let f=fixture(g),a=await f.request('GET','');check('GET status does not publish and future switch stays unavailable',a.status===200&&f.effects===0&&a.data.futureSwitchAvailable===false);
 for(const key of ['olympus-info','guild-announcements']){const legacy=await load('intros').refreshIntros(f.env,GUILD,ADMIN,CH[key]);check('legacy refresh cannot compete for migrated identity slot '+key,legacy.outcomes.length===1&&legacy.outcomes[0].action==='skipped'&&f.effects===0);}
 f.env.ROLE_OFFICER=OTHER;
 for(const command of ['post-guide','refresh-guide']){const response=await load('interactions').handleInteraction(f.env,{type:2,guild_id:GUILD,channel_id:CH.guide,member:{user:{id:ADMIN},roles:[OTHER]},data:{name:'olympus-admin',options:[{type:1,name:command}]}});check('real legacy join guide command delegates without provider effects '+command,(await response.json()).data.content.includes('staff ruleset publication')&&f.effects===0);}
 check('real status previews exact source and fixed destinations',a.data.targets.length===3&&a.data.targets[0].channelId===CH.guide&&JSON.stringify(a.data.targets[0].payload.embeds)===JSON.stringify(load('guide').guideMessage(f.env).embeds));
 const copied=structuredClone(a.data.form);copied.operationId='z'.repeat(22);let copiedReply=await f.request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:copied});check('copied purpose cannot authorize another operation',copiedReply.status===403&&f.effects===0);
 const originalCookie=f.cookie;f.cookie=(await core.sessionCookie(f.env,ADMIN,1,null)).split(';')[0];copiedReply=await f.request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:a.data.form});check('original generation-bound purpose cannot cross absence capture',copiedReply.status!==200&&f.effects===0);f.cookie=originalCookie;
 let r=await f.request('POST','/select',{profileRevision:'synthetic-future-v1',form:a.data.form});check('future profile cannot be selected',r.status===409&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===0);
 r=await f.request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:a.data.form});check('genuine original signed staff purpose creates exactly selection and three targets',r.status===200&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===4&&f.effects===0);
 const id=r.data.publicationId,replayed=await f.request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:a.data.form});check('same original selection replays without rows/effects',replayed.status===200&&replayed.data.replayed&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===4&&f.effects===0);
 const p=()=>f.request('POST','/publish',{publicationId:id,target:'guide'});
 r=await p();check('single create retains a known pointer',r.status===200&&r.data.state==='known'&&f.effects===1&&f.messages.size===1);
 r=await p();check('next deliberate request pins the same guide',r.status===200&&r.data.state==='applied'&&f.effects===2&&f.messages.size===1);
 r=await p();check('applied replay does not dispatch again',r.status===200&&f.effects===2);
 check('real guide bytes equal approved source projection',JSON.stringify([...f.messages.values()][0].embeds)===JSON.stringify(load('guide').guideMessage(f.env).embeds));
 for(const key of ['olympus-info','guild-announcements']){r=await f.request('POST','/publish',{publicationId:id,target:key});check('approved actual intro created once '+key,r.status===200&&r.data.state==='known');r=await f.request('POST','/publish',{publicationId:id,target:key});check('approved intro pin confirmed '+key,r.status===200&&r.data.state==='applied');}
 const next=await f.select();r=await f.request('POST','/publish',{publicationId:next.data.publicationId,target:'olympus-info'});check('newer same-profile selection reuses known existing slot, not duplicate POST',r.status===200&&r.data.state==='applied'&&f.messages.size===3);
 f=fixture();const stale='800000000000000001';
 f.db.prepare('INSERT INTO intro_posts(guild_id,intro_key,parent_id,channel_id,message_id,hash,posted_at,updated_at)VALUES(?,?,?,?,?,?,?,?)').run(GUILD,'olympus-info',CH['olympus-info'],CH['olympus-info'],stale,'old-record-hash',T-100,T-100);
 const replacement=await f.select();r=await f.request('POST','/publish',{publicationId:replacement.data.publicationId,target:'olympus-info'});const replacementId=r.data.messageId;
 check('deleted legacy pointer creates one replacement',r.status===200&&r.data.state==='known'&&f.messages.size===1);
 r=await f.request('POST','/publish',{publicationId:replacement.data.publicationId,target:'olympus-info'});check('replacement pointer pins without changing legacy seed',r.data.state==='applied'&&f.db.prepare("SELECT message_id FROM intro_posts WHERE intro_key='olympus-info'").get().message_id===stale);
 const replacementNext=await f.select();r=await f.request('POST','/publish',{publicationId:replacementNext.data.publicationId,target:'olympus-info'});
 check('fresh selection prefers consumed replacement custody over stale legacy seed; no second create',r.status===200&&r.data.state==='applied'&&r.data.messageId===replacementId&&f.messages.size===1&&f.calls.filter(c=>c[0]==='POST').length===1);
 f=fixture();let s=await f.select();f.losePost=true;r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('lost POST is unknown with one actual dispatch',r.data.state==='unknown'&&f.effects===1);
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('unknown cannot redispatch',r.status===409&&f.effects===1);
 const newer=await f.select();r=await f.request('POST','/publish',{publicationId:newer.data.publicationId,target:'guide'});check('newer operation cannot bypass unknown stable slot',r.status===409&&f.effects===1);
 const recovery=await f.request('GET','');check('fresh staff status recovers original blocker operation across newer selection',recovery.data.blockingOperations.length===1&&recovery.data.blockingOperations[0].publicationId===s.data.publicationId&&recovery.data.blockingOperations[0].target==='guide'&&!JSON.stringify(recovery.data.blockingOperations).includes('claim_nonce'));
 const msg=[...f.messages.values()][0];r=await f.request('POST','/reconcile',{publicationId:s.data.publicationId,target:'guide',messageId:msg.id});check('older exact nonce/message reconciliation is custody-only and cannot overwrite newer selection',r.status===200&&r.data.state==='held'&&f.effects===1&&f.db.prepare("SELECT MAX(selection_revision)n FROM ruleset_publications").get().n===2);
 r=await f.request('POST','/publish',{publicationId:newer.data.publicationId,target:'guide'});check('fresh selected authority pins reconciled original pointer with no duplicate create',r.status===200&&r.data.state==='applied'&&f.effects===2&&f.messages.size===1);
 f=fixture(g);s=await f.select();f.effectHook=async()=>{await f.env.DB.batch(data.rulesetPublicationEraseStatements(f.env,ADMIN));f.db.prepare('DELETE FROM site_users WHERE discord_id=?').run(ADMIN);f.db.prepare("UPDATE privacy_subjects SET state='retired',revision=2,erased_at=?,retain_until=? WHERE subject_id=?").run(T,T+366*86400,ADMIN);};
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});const erased=f.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
 check('erase during actual POST preserves late exact pointer without actor/session resurrection',r.status===200&&r.data.state==='held'&&erased.message_id&&erased.actor===null&&erased.actor_generation===null&&erased.session_version===null&&f.effects===1);
 check('erasure retains independent approved guild payload, not personal content',erased.frozen_payload.includes('Current game:')&&!erased.frozen_payload.includes(ADMIN));
 f=fixture(g);s=await f.select();f.getHook=async()=>f.db.prepare('UPDATE site_users SET session_version=2 WHERE discord_id=?').run(ADMIN);r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('original session revoked across provider GET refuses before write',r.status!==200&&f.effects===0);
 for(const mode of ['retiring','generation','absence','destination','payload','selection','nonce']){
  f=fixture(mode==='absence'?null:g);s=await f.select();f.getHook=async()=>{
   if(mode==='retiring')f.db.prepare("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?").run(ADMIN);
   else if(mode==='generation')f.db.prepare('UPDATE privacy_subjects SET generation=? WHERE subject_id=?').run('b'.repeat(32),ADMIN);
   else if(mode==='absence')f.db.prepare("INSERT INTO privacy_subjects VALUES(?,?,'active',1,?,?,NULL,NULL)").run(ADMIN,g,T,T);
   else if(mode==='destination')f.db.prepare("UPDATE ruleset_publications SET channel_id=? WHERE target_key='guide'").run(CH['olympus-info']);
   else if(mode==='payload')f.db.prepare("UPDATE ruleset_publications SET frozen_payload='{}' WHERE target_key='guide'").run();
   else if(mode==='selection')f.db.prepare("UPDATE ruleset_publications SET selection_revision=2 WHERE target_key='$selection'").run();
   else f.db.prepare("UPDATE ruleset_publications SET claim_nonce='altered' WHERE target_key='guide'").run();
  };r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('native original-capture race refuses without write: '+mode,r.status!==200&&f.effects===0);
 }
 for(const mode of ['bot','guild']){f=fixture();s=await f.select();if(mode==='bot')f.wrongBot=true;else f.wrongGuild=true;r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('wrong '+mode+' identity makes zero effects',r.status===503&&f.effects===0);}
 f=fixture();s=await f.select();const calls=await Promise.all([f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'}),f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'})]);check('concurrent double publish consumes one native claim/one POST',calls.filter(x=>x.status===200).length===1&&f.effects===1&&f.messages.size===1);
 f=fixture();f.db.exec("CREATE TRIGGER ignoreTarget BEFORE INSERT ON ruleset_publications WHEN NEW.target_key='guide' BEGIN SELECT RAISE(IGNORE);END;");r=await f.select();check('terminal IGNORE target fault rolls back selection and every row',r.status===503&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===0);
 for(const mode of ['claim_nonce','publication_id','channel_id','frozen_payload','actor_retain_until']){
  f=fixture();s=await f.select();const row=f.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
  f.effectHook=async()=>{const value=mode==='actor_retain_until'?row.actor_retain_until+1:mode==='channel_id'?CH['olympus-info']:mode==='frozen_payload'?'{}':'changed';f.db.prepare('UPDATE ruleset_publications SET '+mode+'=? WHERE target_key=\'guide\'').run(value);};
  r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});const changed=f.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get();
  check('late known response cannot settle changed original tuple '+mode,r.status===200&&r.data.state==='known_response_unrecorded'&&changed.message_id===null&&f.effects===1);
 }
 f=fixture();s=await f.select();f.before=(sql)=>{if(sql.startsWith('SELECT 1 AS ok FROM ruleset_publications')&&sql.includes('r.claim_nonce IS')&&f.db.prepare("SELECT state FROM ruleset_publications WHERE target_key='guide'").get().state==='claimed')f.db.prepare('UPDATE site_users SET session_version=2 WHERE discord_id=?').run(ADMIN);};
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('original authority closes at final native proof with zero POST',r.status===200&&r.data.state==='refused'&&f.effects===0);
 f=fixture();s=await f.select();const deadline=f.db.prepare("SELECT actor_retain_until FROM ruleset_publications WHERE target_key='guide'").get().actor_retain_until;
 f.effectHook=async()=>{f.after=(sql)=>{if(sql.startsWith('UPDATE ruleset_publications AS r SET message_id'))throw Error('synthetic lost committed settlement');};};
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});f.after=null;check('known result with lost settlement answer remains recorded; no create replay',r.data.state==='known_response_unrecorded'&&f.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get().message_id&&f.effects===1);
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('next request after committed lost answer pins without another POST',r.status===200&&f.messages.size===1);
 check('settlement never renews original actor deadline',f.db.prepare("SELECT actor_retain_until FROM ruleset_publications WHERE target_key='guide'").get().actor_retain_until===deadline);
 const own=await f.env.DB.batch(data.rulesetPublicationExportPlan(f.env,ADMIN).statements),dto=data.rulesetPublicationExportPlan(f.env,ADMIN).shape(own);
 check('own curated copy covers four operation rows and excludes custody/authentication',dto.operations.rows.length===4&&!JSON.stringify(dto).includes(ADMIN)&&!JSON.stringify(dto).includes(CH.guide)&&!JSON.stringify(dto).includes(s.data.publicationId));
 const other=await f.env.DB.batch(data.rulesetPublicationExportPlan(f.env,OTHER).statements);check('other-account export sees no operations',data.rulesetPublicationExportPlan(f.env,OTHER).shape(other).operations.total===0);
 f.db.prepare('UPDATE ruleset_publications SET actor_retain_until=?').run(T-1);await f.env.DB.batch([data.rulesetPublicationRetentionStatement(f.env)]);
 check('real fixed-clock retention strips actors, keeps shared known pointer and no-repeat custody',f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications WHERE actor IS NOT NULL').get().n===0&&f.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get().message_id&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===4);
 const family=load('privacy-access-family-history').privacyFamilyHistoryDefinition('community.ruleset_publication.operations');check('new own-history key is closed and curated',typeof family.statements==='function');
 check('actual new table is classified with real registered hooks',await load('privacy-business-catalog').servingPrivacyCatalogCurrent(f.env));
 check('all statements obey D1 hundred-parameter cap',maxParameters<=100);console.log(JSON.stringify({maxParameters,maxSqlPerRequest:maxSql,scheduledWorst:load('scheduled-budget').SCHEDULED_WORST_CASE}));
 console.log(`${ok}/${n} passed`);if(ok!==n)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
