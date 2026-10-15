// Real source, canonical native SQLite and genuine signed staff requests. Only provider HTTP is synthetic.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),cache={};
const entry=require('./helpers/privacy129_fixture.cjs'),T=Math.floor(Date.now()/1000),RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[T*1000]));}static now(){return T*1000;}};
let originalTestFetch=async()=>{throw Error('provider calls forbidden before publication fixture setup');};
globalThis.fetch=(...args)=>originalTestFetch(...args);
function load(name){if(name==='node:async_hooks')return require(name);name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;const mod={exports:{}};cache[name]=mod;
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',code)(mod,mod.exports,p=>load(path.posix.normalize(path.posix.join(path.posix.dirname(name),p))));return mod.exports;}
// Bootstrap the real entry graph before directly addressing its route modules.
const index=load('index');
const publication=load('ruleset-publication'),core=load('site-core'),site=load('site'),profile=load('ruleset-profile'),data=load('ruleset-publication-data');
const adapter=load('ruleset-pin-publication');
const ADMIN='700000000000000001',BOT='700000000000000002',GUILD='700000000000000003',OTHER='700000000000000004';
const CH={guide:'700000000000000010','olympus-info':'700000000000000011','guild-announcements':'700000000000000012'};
const g='a'.repeat(32);
let n=0,ok=0,maxParameters=0,maxSql=0,maxPhysicalSql=0;const check=(label,v,...why)=>{n++;if(v)ok++;else if(why.length)console.log(...why);console.log((v?'PASS ':'FAIL ')+label);};
async function fixture(generation=null,over={}){
 const db=new DatabaseSync(':memory:');db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unexpected Native clock input');return String(T);});entry.installCurrentEntryEpoch(db,{now:T});let sqlCount=0,physicalCount=0,before=null,after=null,lostBatch=false;
 const logical=plan=>plan.filter(s=>!s.statement.includes('privacy_write_admission'));
 const DB=entry.originalNativePort(db,{
  count:()=>{physicalCount++;},
  beforeBatch:async plan=>{physicalCount+=plan.length-1;const rows=logical(plan);sqlCount+=rows.length;for(const s of plan){maxParameters=Math.max(maxParameters,s.params.length);assert.ok(s.params.length<=100);}for(const s of rows)await before?.(s.statement,s.params);},
  afterBatch:async plan=>{for(const s of logical(plan))await after?.(s.statement,s.params);if(lostBatch){lostBatch=false;throw Error('lost committed result');}},
 });
 const rawEnv=entry.currentEntryEnvironment({DB,COOKIE_SECRET:'synthetic-publication-cookie',VERIFY_SECRET:'synthetic-publication-verify',PUBLIC_BASE_URL:'https://bot.example',SITE_HOST:'guild.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,INTROS_GUILD_ID:GUILD,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'synthetic-only',SITE_ADMINS:ADMIN,
 INTROS_CHANNELS:`join-olympus=${CH.guide},olympus-info=${CH['olympus-info']},guild-announcements=${CH['guild-announcements']}`,
 ADMISSION_MODE:'review',OFFICER_CHARACTERS:'Synthetic Officer',ROLE_GUILD_MEMBER:'700000000000000099',SET_NICKNAME:'false',NAME_RESERVATION_AT:'0',LAUNCH_AT:'0',COMMUNITY_FEATURES:'',...over});
 const env={...rawEnv,DB:load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(DB,'writer','canonical',entry.ENTRY_EPOCH)},run=(sql,...values)=>env.DB.prepare(sql).bind(...values).run();
 await run('INSERT INTO site_users(discord_id,username,in_server,denied,session_version,first_login,last_login,checked_at)VALUES(?,?,1,0,1,?,?,?)',ADMIN,'synthetic-staff',T,T,T);
 if(generation)await run("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until)VALUES(?,?,'active',1,?,?,NULL,NULL)",ADMIN,generation,T,T);
 const messages=new Map(),calls=[];let effectHook=null,getHook=null,losePost=false,losePatch=false,responseScanVersion=undefined,next=900000000000000000n,wrongBot=false,wrongGuild=false;
 originalTestFetch=async(input,init={})=>{const request=input instanceof Request?input:null,url=new URL(request?request.url:input);if(url.origin!=='https://discord.com'||!url.pathname.startsWith('/api/v10/'))throw Error('no external network in publication fixtures');const p=url.pathname.replace(/^\/api\/v10/,''),m=request?request.method:init.method??'GET',body=request?await request.text():init.body;calls.push([m,p]);
  if(m==='GET'&&getHook){const h=getHook;getHook=null;await h(p);}
  const reply=(x,status=200)=>{const body=structuredClone(x);if(responseScanVersion!==undefined&&body?.channel_id&&Array.isArray(body.embeds))for(const embed of body.embeds)embed.content_scan_version=responseScanVersion;
   return new Response(status===204?null:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});};let x;
  if(p==='/users/@me')return reply({id:wrongBot?OTHER:BOT,bot:true});
  if((x=p.match(/^\/channels\/(\d+)$/)))return reply({id:x[1],guild_id:wrongGuild?OTHER:GUILD,type:0});
  if((x=p.match(/^\/channels\/(\d+)\/messages\/pins$/)))return reply({items:[...messages.values()].filter(z=>z.channel_id===x[1]&&z.pinned).map(message=>({message}))});
  if((x=p.match(/^\/channels\/(\d+)\/messages$/))&&m==='POST'){
   const payload=JSON.parse(body);assert.deepEqual(payload.allowed_mentions,{parse:[]});const msg={...payload,id:String(next++),channel_id:x[1],author:{id:BOT},pinned:false};messages.set(msg.id,msg);
   if(effectHook){const h=effectHook;effectHook=null;await h(msg);}
   if(losePost){losePost=false;throw Error('synthetic lost provider result');}return reply(msg);
  }
  if((x=p.match(/^\/channels\/(\d+)\/messages\/(\d+)$/))){const msg=messages.get(x[2]);if(!msg||msg.channel_id!==x[1])return reply({code:10008},404);
   if(m==='PATCH'){Object.assign(msg,JSON.parse(body));if(effectHook){const h=effectHook;effectHook=null;await h(msg);}if(losePatch){losePatch=false;throw Error('synthetic lost PATCH result');}}return reply(msg);}
  if((x=p.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/))&&m==='PUT'){const msg=messages.get(x[2]);if(!msg)return reply({code:10008},404);msg.pinned=true;if(effectHook){const h=effectHook;effectHook=null;await h(msg);}return reply(null,204);}
  return reply({code:0},404);
 };
 let issued=await entry.issueOriginalEntryCookie(load,db,rawEnv,ADMIN),cookie=issued.cookie;
 const reissue=async()=>{issued=await entry.issueOriginalEntryCookie(load,db,rawEnv,ADMIN);cookie=issued.cookie;return cookie;};
 const request=async(method,suffix,body={},extra={})=>{
  const req=new Request('https://guild.example/api/admin/ruleset-publication'+suffix,{method,headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json',...extra},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  const start=sqlCount,physicalStart=physicalCount,res=await index.default.fetch(req,rawEnv,{waitUntil:()=>{}});maxSql=Math.max(maxSql,sqlCount-start);maxPhysicalSql=Math.max(maxPhysicalSql,physicalCount-physicalStart);return {status:res.status,data:await res.json()};};
 const select=async()=>{const a=await request('GET','');return request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:a.data.form});};
 return {db,env,run,reissue,request,select,messages,calls,get session(){return issued.session;},get effects(){return calls.filter(c=>c[0]!=='GET').length;},set before(v){before=v;},set after(v){after=v;},set effectHook(v){effectHook=v;},set getHook(v){getHook=v;},set losePost(v){losePost=v;},set losePatch(v){losePatch=v;},set responseScanVersion(v){responseScanVersion=v;},set lostBatch(v){lostBatch=v;},set wrongBot(v){wrongBot=v;},set wrongGuild(v){wrongGuild=v;},get cookie(){return cookie;},set cookie(v){cookie=v;}};
}
(async()=>{
 const canonical=load('guide').guideMessage({ADMISSION_MODE:'review',OFFICER_CHARACTERS:'Synthetic Officer',ROLE_GUILD_MEMBER:'700000000000000099',SET_NICKNAME:'false'},profile.currentRulesetProfile());
 const received=structuredClone(canonical);received.embeds[0].type='rich';for(const field of received.embeds[0].fields??[])field.inline??=false;
 received.components.forEach(c=>{c.id=0;c.components.forEach(x=>{x.id=0;x.disabled=false;});});
 check('actual source payload accepts innocuous Discord response defaults',adapter.messageMatches(received,canonical));
 received.components[0].components[0].type=4;check('changed source-defined component type is refused',!adapter.messageMatches(received,canonical));
 received.components[0].components[0].type=canonical.components[0].components[0].type;received.embeds[0].image={url:'https://unapproved.invalid/personal'};
 check('extra semantic embed content is refused',!adapter.messageMatches(received,canonical));
 for(const value of [0,1,Number.MAX_SAFE_INTEGER]){const msg=structuredClone(canonical);msg.embeds[0].content_scan_version=value;check('direct embed response-only safe scan version accepted '+value,adapter.messageMatches(msg,canonical));}
 for(const [label,value] of [['negative',-1],['fractional',0.5],['string','1'],['empty string',''],['null',null],['false',false],['true',true],['unsafe integer',Number.MAX_SAFE_INTEGER+1],['NaN',NaN],['infinity',Infinity],['object',{}],['array',[]]]){const msg=structuredClone(canonical);msg.embeds[0].content_scan_version=value;check('malformed scan version refused '+label,!adapter.messageMatches(msg,canonical));}
 for(const location of ['footer','fields','component','button']){const msg=structuredClone(canonical);const obj=location==='footer'?(msg.embeds[0].footer??={text:'source footer'}):location==='fields'?(msg.embeds[0].fields??=[{name:'source name',value:'source value'}])[0]:location==='component'?msg.components[0]:msg.components[0].components[0];const wanted=structuredClone(msg);obj.content_scan_version=1;check('scan version at nested or nonembed location refused '+location,!adapter.messageMatches(msg,wanted));}
 const defined=structuredClone(canonical);defined.embeds[0].content_scan_version=1;let versioned=structuredClone(defined);check('source-defined scan version equality is preserved',adapter.messageMatches(versioned,defined));versioned.embeds[0].content_scan_version=2;check('source-defined scan version mismatch remains refused',!adapter.messageMatches(versioned,defined));delete versioned.embeds[0].content_scan_version;check('missing source-defined scan version remains refused',!adapter.messageMatches(versioned,defined));
 for(const change of ['description','color','footer','custom_id','component_type','unknown_key','content']){const msg=structuredClone(canonical);msg.embeds[0].content_scan_version=1;
  if(change==='description')msg.embeds[0].description+='changed';else if(change==='color')msg.embeds[0].color++;else if(change==='footer')msg.embeds[0].footer={text:'unapproved footer'};else if(change==='custom_id')msg.components[0].components[0].custom_id='unapproved';else if(change==='component_type')msg.components[0].type=4;else if(change==='unknown_key')msg.embeds[0].unapproved='extra';else msg.content='unapproved';
  check('valid scan metadata cannot hide source or extra content change '+change,!adapter.messageMatches(msg,canonical));}
 const oldGuide='800000000000000077',rowTuple=r=>Object.fromEntries(['guild_id','publication_id','target_key','selection_revision','profile_revision','plan_hash','actor','actor_generation','actor_account_incarnation','session_version','session_expires','parent_id','channel_id','frozen_payload','payload_hash','record_hash','claim_nonce','stage','created_at','actor_retain_until'].map(k=>[k,r[k]]));
 function seedGuide(f){const msg={content:'',...load('guide').guideMessage(f.env,profile.currentRulesetProfile()),id:oldGuide,channel_id:CH.guide,author:{id:BOT},pinned:true};msg.embeds[0].description+=' old text';f.messages.set(oldGuide,msg);}
 let mf=await fixture(g);seedGuide(mf);mf.responseScanVersion=1;let ms=await mf.select(),claimedTuple=null;
 mf.effectHook=async()=>{claimedTuple=rowTuple(mf.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get());};
 let mr=await mf.request('POST','/publish',{publicationId:ms.data.publicationId,target:'guide'}),settledRow=mf.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
 check('actual single guide PATCH response with scan metadata settles applied original pointer',mr.status===200&&mr.data.state==='applied'&&mr.data.messageId===oldGuide&&mf.effects===1&&mf.calls.filter(c=>c[0]==='PATCH').length===1&&mf.calls.filter(c=>c[0]==='POST'||c[0]==='PUT').length===0);
 check('successful metadata response settlement preserves exact claimed original tuple/deadline',JSON.stringify(rowTuple(settledRow))===JSON.stringify(claimedTuple));
 mr=await mf.request('POST','/publish',{publicationId:ms.data.publicationId,target:'guide'});check('applied metadata response replay performs no additional provider write',mr.status===200&&mr.data.state==='applied'&&mf.effects===1);
 mf=await fixture(g);seedGuide(mf);mf.responseScanVersion=1;mf.losePatch=true;ms=await mf.select();mf.effectHook=async()=>{claimedTuple=rowTuple(mf.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get());};
 mr=await mf.request('POST','/publish',{publicationId:ms.data.publicationId,target:'guide'});check('actual committed PATCH with lost reply remains unknown at original known pointer',mr.status===200&&mr.data.state==='unknown'&&mf.effects===1&&mf.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get().message_id===oldGuide);
 mr=await mf.request('POST','/publish',{publicationId:ms.data.publicationId,target:'guide'});check('unknown lost PATCH is refused without redispatch',mr.status===409&&mf.effects===1);
 const reconcileStart=mf.calls.length;mr=await mf.request('POST','/reconcile',{publicationId:ms.data.publicationId,target:'guide',messageId:oldGuide});settledRow=mf.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
 check('explicit original-operation reconciliation accepts exact metadata GET without new provider mutation',mr.status===200&&mr.data.state==='applied'&&mr.data.messageId===oldGuide&&mf.effects===1&&mf.calls.slice(reconcileStart).length===3&&mf.calls.slice(reconcileStart).every(c=>c[0]==='GET'));
 check('metadata reconciliation preserves original generation/nonce/payload/created/deadline',JSON.stringify(rowTuple(settledRow))===JSON.stringify(claimedTuple));
 mr=await mf.request('POST','/reconcile',{publicationId:ms.data.publicationId,target:'guide',messageId:oldGuide});check('settled reconciliation cannot admit another response or effect',mr.status===409&&mf.effects===1);
 mf=await fixture(g);seedGuide(mf);mf.responseScanVersion='1';ms=await mf.select();mr=await mf.request('POST','/publish',{publicationId:ms.data.publicationId,target:'guide'});check('malformed provider scan metadata leaves actual PATCH unknown without a repeat',mr.status===200&&mr.data.state==='unknown'&&mf.effects===1);mr=await mf.request('POST','/reconcile',{publicationId:ms.data.publicationId,target:'guide',messageId:oldGuide});check('malformed provider scan metadata also refuses original explicit reconciliation',mr.status===409&&mf.effects===1);
 mf=await fixture(g);seedGuide(mf);mf.responseScanVersion=1;ms=await mf.select();const erasedDeadline=mf.db.prepare("SELECT actor_retain_until FROM ruleset_publications WHERE target_key='guide'").get().actor_retain_until;
 mf.effectHook=async()=>{await mf.env.DB.batch(data.rulesetPublicationEraseStatements(mf.env,ADMIN));await mf.run('DELETE FROM site_users WHERE discord_id=?',ADMIN);await mf.run("UPDATE privacy_subjects SET state='retired',revision=2,erased_at=?,retain_until=? WHERE subject_id=?",T,T+366*86400,ADMIN);};
 mr=await mf.request('POST','/publish',{publicationId:ms.data.publicationId,target:'guide'});settledRow=mf.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
 check('late metadata PATCH reply after erasure records only held original pointer',mr.status===200&&mr.data.state==='held'&&settledRow.message_id===oldGuide&&settledRow.actor===null&&settledRow.actor_generation===null&&settledRow.session_version===null&&settledRow.session_expires===null&&settledRow.actor_retain_until===erasedDeadline&&mf.effects===1,{response:mr,state:settledRow.state,messageId:settledRow.message_id,actor:settledRow.actor,incarnation:settledRow.actor_account_incarnation});
 let f=await fixture(g),a=await f.request('GET','');check('GET status does not publish and future switch stays unavailable',a.status===200&&f.effects===0&&a.data.futureSwitchAvailable===false);
 for(const key of ['olympus-info','guild-announcements']){const legacy=await load('intros').refreshIntros(f.env,GUILD,ADMIN,CH[key]);check('legacy refresh cannot compete for migrated identity slot '+key,legacy.outcomes.length===1&&legacy.outcomes[0].action==='skipped'&&f.effects===0);}
 f.env.ROLE_OFFICER=OTHER;
 for(const command of ['post-guide','refresh-guide']){const response=await load('interactions').handleInteraction(f.env,{type:2,guild_id:GUILD,channel_id:CH.guide,member:{user:{id:ADMIN},roles:[OTHER]},data:{name:'olympus-admin',options:[{type:1,name:command}]}});check('real legacy join guide command delegates without provider effects '+command,(await response.json()).data.content.includes('staff ruleset publication')&&f.effects===0);}
 check('real status previews exact source and fixed destinations',a.data.targets.length===3&&a.data.targets[0].channelId===CH.guide&&JSON.stringify(a.data.targets[0].payload.embeds)===JSON.stringify(load('guide').guideMessage(f.env).embeds));
 const copied=structuredClone(a.data.form);copied.operationId='z'.repeat(22);let copiedReply=await f.request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:copied});check('copied purpose cannot authorize another operation',copiedReply.status===403&&f.effects===0);
 const originalGeneration=f.session.g;await f.run('DELETE FROM privacy_subjects WHERE subject_id=?',ADMIN);await f.reissue();copiedReply=await f.request('POST','/select',{profileRevision:profile.currentRulesetProfile().revision,form:a.data.form});check('original generation-bound purpose cannot cross genuine re-admission from absence',copiedReply.status===403&&f.session.g!==originalGeneration&&f.effects===0);
 f=await fixture(g);a=await f.request('GET','');
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
 f=await fixture();const stale='800000000000000001';
 await f.run('INSERT INTO intro_posts(guild_id,intro_key,parent_id,channel_id,message_id,hash,posted_at,updated_at)VALUES(?,?,?,?,?,?,?,?)',GUILD,'olympus-info',CH['olympus-info'],CH['olympus-info'],stale,'old-record-hash',T-100,T-100);
 const replacement=await f.select();r=await f.request('POST','/publish',{publicationId:replacement.data.publicationId,target:'olympus-info'});const replacementId=r.data.messageId;
 check('deleted legacy pointer creates one replacement',r.status===200&&r.data.state==='known'&&f.messages.size===1);
 r=await f.request('POST','/publish',{publicationId:replacement.data.publicationId,target:'olympus-info'});check('replacement pointer pins without changing legacy seed',r.data.state==='applied'&&f.db.prepare("SELECT message_id FROM intro_posts WHERE intro_key='olympus-info'").get().message_id===stale);
 const replacementNext=await f.select();r=await f.request('POST','/publish',{publicationId:replacementNext.data.publicationId,target:'olympus-info'});
 check('fresh selection prefers consumed replacement custody over stale legacy seed; no second create',r.status===200&&r.data.state==='applied'&&r.data.messageId===replacementId&&f.messages.size===1&&f.calls.filter(c=>c[0]==='POST').length===1);
 f=await fixture();let s=await f.select();f.losePost=true;r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('lost POST is unknown with one actual dispatch',r.data.state==='unknown'&&f.effects===1);
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('unknown cannot redispatch',r.status===409&&f.effects===1);
 const newer=await f.select();r=await f.request('POST','/publish',{publicationId:newer.data.publicationId,target:'guide'});check('newer operation cannot bypass unknown stable slot',r.status===409&&f.effects===1);
 const recovery=await f.request('GET','');check('fresh staff status recovers original blocker operation across newer selection',recovery.data.blockingOperations.length===1&&recovery.data.blockingOperations[0].publicationId===s.data.publicationId&&recovery.data.blockingOperations[0].target==='guide'&&!JSON.stringify(recovery.data.blockingOperations).includes('claim_nonce'));
 const msg=[...f.messages.values()][0];r=await f.request('POST','/reconcile',{publicationId:s.data.publicationId,target:'guide',messageId:msg.id});check('older exact nonce/message reconciliation is custody-only and cannot overwrite newer selection',r.status===200&&r.data.state==='held'&&f.effects===1&&f.db.prepare("SELECT MAX(selection_revision)n FROM ruleset_publications").get().n===2);
 r=await f.request('POST','/publish',{publicationId:newer.data.publicationId,target:'guide'});check('fresh selected authority pins reconciled original pointer with no duplicate create',r.status===200&&r.data.state==='applied'&&f.effects===2&&f.messages.size===1);
 f=await fixture(g);s=await f.select();f.effectHook=async()=>{await f.env.DB.batch(data.rulesetPublicationEraseStatements(f.env,ADMIN));await f.run('DELETE FROM site_users WHERE discord_id=?',ADMIN);await f.run("UPDATE privacy_subjects SET state='retired',revision=2,erased_at=?,retain_until=? WHERE subject_id=?",T,T+366*86400,ADMIN);};
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});const erased=f.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
 check('erase during actual POST preserves late exact pointer without actor/session resurrection',r.status===200&&r.data.state==='held'&&erased.message_id&&erased.actor===null&&erased.actor_generation===null&&erased.session_version===null&&f.effects===1,{response:r,state:erased.state,messageId:erased.message_id,actor:erased.actor,incarnation:erased.actor_account_incarnation});
 check('erasure retains independent approved guild payload, not personal content',erased.frozen_payload.includes('Current game:')&&!erased.frozen_payload.includes(ADMIN));
 f=await fixture(g);s=await f.select();f.getHook=async()=>await f.run('UPDATE site_users SET session_version=2 WHERE discord_id=?',ADMIN);r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('original session revoked across provider GET refuses before write',r.status!==200&&f.effects===0);
 for(const mode of ['retiring','generation','absence','destination','payload','selection','nonce']){
  f=await fixture(mode==='absence'?null:g);s=await f.select();f.getHook=async()=>{
   if(mode==='retiring')await f.run("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?",ADMIN);
   else if(mode==='generation')await f.run('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','b'.repeat(32),ADMIN);
   else if(mode==='absence')await f.run('DELETE FROM privacy_subjects WHERE subject_id=?',ADMIN);
   else if(mode==='destination')await f.run("UPDATE ruleset_publications SET channel_id=? WHERE target_key='guide'",CH['olympus-info']);
   else if(mode==='payload')await f.run("UPDATE ruleset_publications SET frozen_payload='{}' WHERE target_key='guide'");
   else if(mode==='selection')await f.run("UPDATE ruleset_publications SET selection_revision=2 WHERE target_key='$selection'");
   else await f.run("UPDATE ruleset_publications SET claim_nonce='altered' WHERE target_key='guide'");
  };r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('native original-capture race refuses without write: '+mode,r.status!==200&&f.effects===0);
 }
 for(const mode of ['bot','guild']){f=await fixture();s=await f.select();if(mode==='bot')f.wrongBot=true;else f.wrongGuild=true;r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('wrong '+mode+' identity makes zero effects',r.status===503&&f.effects===0);}
 f=await fixture();s=await f.select();const calls=await Promise.all([f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'}),f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'})]);check('concurrent double publish consumes one native claim/one POST',calls.filter(x=>x.status===200).length===1&&f.effects===1&&f.messages.size===1);
 // This existing schema fault is now refused before selection; the closed catalogue
 // prevents it from reaching the historical terminal-IGNORE rollback branch.
 f=await fixture();f.db.exec("CREATE TRIGGER ignoreTarget BEFORE INSERT ON ruleset_publications WHEN NEW.target_key='guide' BEGIN SELECT RAISE(IGNORE);END;");r=await f.select();check('extra IGNORE trigger is held by the current catalogue before any selection row or effect',r.status===503&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===0&&f.effects===0);
 for(const mode of ['claim_nonce','publication_id','channel_id','frozen_payload','actor_retain_until']){
  f=await fixture();s=await f.select();const row=f.db.prepare("SELECT * FROM ruleset_publications WHERE target_key='guide'").get();
  f.effectHook=async()=>{const value=mode==='actor_retain_until'?row.actor_retain_until+1:mode==='channel_id'?CH['olympus-info']:mode==='frozen_payload'?'{}':'changed';await f.run('UPDATE ruleset_publications SET '+mode+'=? WHERE target_key=\'guide\'',value);};
  r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});const changed=f.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get();
  check('late known response cannot settle changed original tuple '+mode,r.status===200&&r.data.state==='known_response_unrecorded'&&changed.message_id===null&&f.effects===1);
 }
 f=await fixture();s=await f.select();f.before=async(sql)=>{if(sql.startsWith('SELECT 1 AS ok FROM ruleset_publications')&&sql.includes('r.claim_nonce IS')&&f.db.prepare("SELECT state FROM ruleset_publications WHERE target_key='guide'").get().state==='claimed')await f.run('UPDATE site_users SET session_version=2 WHERE discord_id=?',ADMIN);};
 // The ordinary Native session guard rejects before originalProof can return false.
 // This revocation no longer reaches the historical 200/refused inline-proof branch.
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('ordinary Native session guard closes before inline final proof with zero POST',r.status===503&&r.data.error==='publication_outcome_unconfirmed'&&f.effects===0&&f.db.prepare("SELECT state FROM ruleset_publications WHERE target_key='guide'").get().state==='claimed',{response:r,effects:f.effects,state:f.db.prepare("SELECT state FROM ruleset_publications WHERE target_key='guide'").get().state});
 f=await fixture();s=await f.select();const deadline=f.db.prepare("SELECT actor_retain_until FROM ruleset_publications WHERE target_key='guide'").get().actor_retain_until;
 f.effectHook=async()=>{f.after=(sql)=>{if(sql.startsWith('UPDATE ruleset_publications AS r SET message_id'))throw Error('synthetic lost committed settlement');};};
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});f.after=null;check('known result with lost settlement answer remains recorded; no create replay',r.data.state==='known_response_unrecorded'&&f.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get().message_id&&f.effects===1);
 r=await f.request('POST','/publish',{publicationId:s.data.publicationId,target:'guide'});check('next request after committed lost answer pins without another POST',r.status===200&&f.messages.size===1);
 check('settlement never renews original actor deadline',f.db.prepare("SELECT actor_retain_until FROM ruleset_publications WHERE target_key='guide'").get().actor_retain_until===deadline);
 const own=await f.env.DB.batch(data.rulesetPublicationExportPlan(f.env,ADMIN).statements),dto=data.rulesetPublicationExportPlan(f.env,ADMIN).shape(own);
 check('own curated copy covers four operation rows and excludes custody/authentication',dto.operations.rows.length===4&&!JSON.stringify(dto).includes(ADMIN)&&!JSON.stringify(dto).includes(CH.guide)&&!JSON.stringify(dto).includes(s.data.publicationId));
 const other=await f.env.DB.batch(data.rulesetPublicationExportPlan(f.env,OTHER).statements);check('other-account export sees no operations',data.rulesetPublicationExportPlan(f.env,OTHER).shape(other).operations.total===0);
 await f.run('UPDATE ruleset_publications SET actor_retain_until=?',T-1);await f.env.DB.batch([data.rulesetPublicationRetentionStatement(f.env)]);
 check('real fixed-clock retention strips actors, keeps shared known pointer and no-repeat custody',f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications WHERE actor IS NOT NULL').get().n===0&&f.db.prepare("SELECT message_id FROM ruleset_publications WHERE target_key='guide'").get().message_id&&f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications').get().n===4);
 const family=load('privacy-access-family-history').privacyFamilyHistoryDefinition('community.ruleset_publication.operations');check('new own-history key is closed and curated',typeof family.statements==='function');
 check('actual new table is classified with real registered hooks',await load('privacy-business-catalog').servingPrivacyCatalogCurrent(f.env));
 check('all statements obey D1 hundred-parameter cap',maxParameters<=100);console.log(JSON.stringify({maxParameters,maxSqlPerRequest:maxSql,maxPhysicalSqlPerRequest:maxPhysicalSql,scheduledWorst:load('scheduled-budget').SCHEDULED_WORST_CASE}));
 console.log(`${ok}/${n} passed`);if(ok!==n)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
