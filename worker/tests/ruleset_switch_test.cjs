// Item 7 (14 Oct 2026): the owner-only game identity switch, on the ruleset publication fixture. Real source, canonical
// native SQLite and genuine signed staff requests; only provider HTTP is synthetic. The future profile here is fictional.
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
 return {db,env,rawEnv,run,reissue,request,select,messages,calls,get session(){return issued.session;},get effects(){return calls.filter(c=>c[0]!=='GET').length;},set before(v){before=v;},set after(v){after=v;},set effectHook(v){effectHook=v;},set getHook(v){getHook=v;},set losePost(v){losePost=v;},set losePatch(v){losePatch=v;},set responseScanVersion(v){responseScanVersion=v;},set lostBatch(v){lostBatch=v;},set wrongBot(v){wrongBot=v;},set wrongGuild(v){wrongGuild=v;},get cookie(){return cookie;},set cookie(v){cookie=v;}};
}
(async()=>{
 // Item 7 (14 Oct 2026): the owner-only switch with a PRIVATE future profile. The fixture profile is fictional
 // (synthetic realm, Normal, Horde); no real future identity exists anywhere in this suite.
 const FIX={schema:'olympus-ruleset-profile-v1',revision:'forever-release-fixture-v1',phase:'full_release',game:'World of Warcraft: Forever',guild:'Olympus',realm:'Synthetic Future Realm',ruleset:'Normal',faction:'Horde'};
 const SECRET=JSON.stringify(FIX),beta=profile.currentRulesetProfile(),settings=f=>Object.fromEntries(f.db.prepare("SELECT key,value FROM site_settings WHERE key LIKE 'ruleset%' ORDER BY key").all().map(r=>[r.key,r.value]));
 // The site is a login wall since .154: /api/public is read with the admin's session cookie and the fixture's raw env (the Worker wraps the DB itself).
 const publicRead=async(f,over={})=>{const res=await index.default.fetch(new Request('https://guild.example/api/public',{headers:{Cookie:f.cookie}}),{...f.rawEnv,...over},{waitUntil:()=>{}});return {status:res.status,meta:(await res.json()).meta};};
 // Parser: the future profile is only ever read from the secret, and an opaque revision is required.
 check('future secret parser accepts the fictional full-release profile',JSON.stringify(profile.parseFutureProfileSecret(SECRET))===JSON.stringify(FIX));
 for(const [label,bad] of [['beta phase',{...FIX,phase:'beta'}],['beta revision',{...FIX,revision:beta.revision}],['free-form revision',{...FIX,revision:'synthetic-future-v1'}],['revealing revision',{...FIX,revision:'forever-release-horde-v1'}],['extra key',{...FIX,secret:'x'}]])check('future secret parser refuses '+label,profile.parseFutureProfileSecret(JSON.stringify(bad))===null);
 check('future secret parser refuses non-JSON, empty and oversize input',[undefined,'','{',' '.repeat(3000)].every(v=>profile.parseFutureProfileSecret(v)===null));
 // Resolution without rows is the beta; corrupt or incomplete pins HOLD; absent mode alone is beta.
 const resolve=(rows,env={})=>profile.resolveRulesetSnapshot(rows,env);
 check('absent mode row resolves to the beta',(await resolve([])).mode==='beta'&&(await resolve([{key:'rulesetMode',value:'beta'}])).profile===beta);
 check('unknown nonempty mode holds',(await resolve([{key:'rulesetMode',value:'weird'}])).held==='ruleset_mode_corrupt'&&(await resolve([{key:'rulesetMode',value:''}])).held==='ruleset_mode_corrupt');
 check('full_release with incomplete pins holds',(await resolve([{key:'rulesetMode',value:'full_release'}],{RULESET_FUTURE_PROFILE:SECRET})).held==='activation_pins_incomplete');
 const digest=await profile.rulesetDigest(FIX),pins=[{key:'rulesetMode',value:'full_release'},{key:'rulesetActiveRevision',value:FIX.revision},{key:'rulesetActiveDigest',value:digest},{key:'rulesetActivatedAt',value:String(T)},{key:'rulesetActivatedBy',value:ADMIN}];
 check('complete pins with the matching secret resolve the fictional profile',(await resolve(pins,{RULESET_FUTURE_PROFILE:SECRET})).profile.realm==='Synthetic Future Realm');
 check('missing secret while active holds, never the beta',(await resolve(pins,{})).held==='future_profile_missing'&&(await resolve(pins,{})).profile===null);
 check('changed secret bytes under the same revision hold',(await resolve(pins,{RULESET_FUTURE_PROFILE:JSON.stringify({...FIX,realm:'Other Synthetic Realm'})})).held==='future_profile_changed');
 check('public readiness never exposes configuration before activation',profile.rulesetSwitchReadiness(await resolve(pins,{RULESET_FUTURE_PROFILE:SECRET})).futureProfileConfigured===false&&profile.rulesetSwitchReadiness(profile.betaRulesetSnapshot()).code==='full_release_unavailable');
 // Routes.
 let f=await fixture(g);let st=await f.request('GET','');
 check('status in beta: switch unavailable without a configured secret or approver',st.status===200&&st.data.rulesetSwitch.mode==='beta'&&st.data.rulesetSwitch.held===null&&st.data.rulesetSwitch.activateAvailable===false&&st.data.rulesetSwitch.futureProfileConfigured===false&&st.data.rulesetSwitch.ownerEligibilityQualified===false&&st.data.currentProfile.revision===beta.revision);
 let r=await f.request('POST','/activate',{form:st.data.form,confirm:true});
 check('activation is refused for an admin who is not an approver',r.status===403&&r.data.error==='ruleset_switch_authority'&&Object.keys(settings(f)).length===0);
 f=await fixture(g,{RULESET_SWITCH_APPROVERS:ADMIN});st=await f.request('GET','');r=await f.request('POST','/activate',{form:st.data.form,confirm:true});
 check('an approver without a configured secret is refused',r.status===409&&r.data.error==='future_profile_unconfigured'&&Object.keys(settings(f)).length===0);
 f=await fixture(g,{RULESET_SWITCH_APPROVERS:ADMIN,RULESET_FUTURE_PROFILE:SECRET});st=await f.request('GET','');
 check('status for the approver with a configured secret offers activation and still shows the beta',st.data.rulesetSwitch.activateAvailable===true&&st.data.rulesetSwitch.futureProfileConfigured===true&&st.data.rulesetSwitch.ownerEligibilityQualified===true&&st.data.currentProfile.revision===beta.revision&&!JSON.stringify(st.data).includes('Synthetic Future Realm'));
 r=await f.request('POST','/activate',{form:st.data.form});check('activation requires the explicit confirmation',r.status===400&&r.data.error==='ruleset_switch_confirmation_required');
 await f.run("INSERT INTO ruleset_publications(guild_id,publication_id,target_key,selection_revision,profile_revision,plan_hash,actor,actor_generation,session_version,session_expires,parent_id,channel_id,message_id,frozen_payload,payload_hash,claim_nonce,stage,state,created_at,updated_at,actor_retain_until)VALUES(?,?,'guide',99,?,'h',?,?,1,?,?,?,NULL,'{}','h','n',?,'claimed',?,?,?)",GUILD,'x'.repeat(22),beta.revision,OTHER,g,T+600,CH.guide,CH.guide,'create',T,T,T+600); // the stage is bound, not a literal: the admission keyword scan reads literals too (the scheduler fixture lesson, Codex V1)
 r=await f.request('POST','/activate',{form:st.data.form,confirm:true});
 check('a claimed target blocks activation atomically, writing nothing',r.status===409&&r.data.error==='ruleset_switch_refused'&&Object.keys(settings(f)).length===0&&f.db.prepare("SELECT COUNT(*) n FROM ruleset_publications WHERE target_key='$selection'").get().n===0);
 await f.run("DELETE FROM ruleset_publications WHERE publication_id=?", 'x'.repeat(22));
 const stale=st.data.form;st=await f.request('GET','');
 r=await f.request('POST','/activate',{form:st.data.form,confirm:true});const first=r;
 const s1=settings(f),rows=f.db.prepare("SELECT target_key,profile_revision,state,frozen_payload FROM ruleset_publications ORDER BY target_key").all();
 check('activation writes the five pins, the selection and three targets in one batch',r.status===200&&r.data.mode==='full_release'&&r.data.revision===FIX.revision&&r.data.profile.realm==='Synthetic Future Realm'&&s1.rulesetMode==='full_release'&&s1.rulesetActiveRevision===FIX.revision&&s1.rulesetActiveDigest===digest&&/^\d+$/.test(s1.rulesetActivatedAt)&&s1.rulesetActivatedBy===ADMIN&&rows.length===4&&rows.every(x=>x.profile_revision===FIX.revision));
 check('the selected payloads carry the fictional identity and the activation day; the audit row carries no identity',rows.filter(x=>x.target_key!=='$selection').every(x=>x.frozen_payload.includes('Synthetic Future Realm'))&&rows.find(x=>x.target_key==='guild-announcements').frozen_payload.includes('Ruleset: Normal · Faction: Horde')&&/\(decided \d+ [A-Z][a-z]+ \d{4}\)/.test(rows.find(x=>x.target_key==='guild-announcements').frozen_payload)&&f.db.prepare("SELECT details FROM audit WHERE action='site.ruleset_switch'").all().every(a=>!a.details.includes('Synthetic')&&JSON.parse(a.details).mode==='full_release'));
 st=await f.request('GET','');
 check('status after activation projects the fictional profile and offers only the return',st.data.currentProfile.realm==='Synthetic Future Realm'&&st.data.rulesetSwitch.mode==='full_release'&&st.data.rulesetSwitch.activateAvailable===false&&st.data.rulesetSwitch.returnAvailable===true&&st.data.selected.profileRevision===FIX.revision&&st.data.targets.every(t=>JSON.stringify(t.payload).includes('Synthetic Future Realm')));
 r=await f.request('POST','/activate',{form:st.data.form,confirm:true});check('a second activation is refused',r.status===409&&r.data.error==='ruleset_already_active');
 r=await f.request('POST','/deactivate',{form:stale,confirm:true});check('a stale form (older expected revision) is refused by the batch, writing nothing',r.status===409&&r.data.error==='ruleset_switch_refused'&&settings(f).rulesetMode==='full_release');
 // Every projection reads the snapshot: the guide, the intros, the public meta.
 const snapNow=await profile.activeRulesetSnapshot(f.env);
 check('the resolved snapshot drives the guide and the intros',load('guide').guideMessage(f.env,snapNow.profile).embeds[0].description.includes('Full release · Synthetic Future Realm')&&JSON.stringify(load('intros').renderEmbeds(load('intros').INTROS.find(i=>i.key==='olympus-info'),{},snapNow)).includes('Synthetic Future Realm'));
 const pub=await publicRead(f);
 check('public meta after activation carries the fictional profile, the active code and no configuration booleans',pub.status===200&&pub.meta.ruleset.realm==='Synthetic Future Realm'&&pub.meta.rulesetSwitch.code==='full_release_active'&&pub.meta.rulesetSwitch.futureProfileConfigured===false&&pub.meta.rulesetHeld===null);
 // Publishing a target under the active identity uses the same custody as the beta.
 r=await f.request('POST','/publish',{publicationId:first.data.publicationId,target:'guild-announcements'});
 check('a target of the activated selection publishes through the existing custody',r.status===200&&['known','applied'].includes(r.data.state)&&[...f.messages.values()].some(m=>JSON.stringify(m).includes('Synthetic Future Realm')));
 // Holds: a changed secret, a missing secret, a corrupt mode and incomplete pins all hold every projection; no beta fallback.
 const heldEnv=over=>({...f.rawEnv,...over});
 const heldStatus=async(over)=>{const req=new Request('https://guild.example/api/admin/ruleset-publication',{headers:{Cookie:f.cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION}});const res=await index.default.fetch(req,heldEnv(over),{waitUntil:()=>{}});return {status:res.status,data:await res.json()};};
 const changed=await heldStatus({RULESET_FUTURE_PROFILE:JSON.stringify({...FIX,ruleset:'Hardcore'})});
 check('a changed secret while active holds the staff status (no profile, no targets, no beta)',changed.status===200&&changed.data.rulesetSwitch.held==='future_profile_changed'&&changed.data.currentProfile===null&&changed.data.targets.length===0&&changed.data.rulesetSwitch.returnAvailable===true);
 const missing=await publicRead(f,{RULESET_FUTURE_PROFILE:undefined});
 check('a missing secret while active holds the public meta',missing.meta.ruleset===null&&missing.meta.rulesetHeld==='future_profile_missing'&&missing.meta.rulesetSwitch.code==='ruleset_held');
 const heldPublish=await index.default.fetch(new Request('https://guild.example/api/admin/ruleset-publication/publish',{method:'POST',headers:{Cookie:f.cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},body:JSON.stringify({publicationId:first.data.publicationId,target:'guide'})}),heldEnv({RULESET_FUTURE_PROFILE:undefined}),{waitUntil:()=>{}});
 check('publishing while held is refused before any provider call',heldPublish.status===409&&(await heldPublish.json()).error==='publication_profile_held');
 await f.run("UPDATE site_settings SET value='corrupt' WHERE key='rulesetMode'");
 check('a corrupt mode row holds',(await profile.activeRulesetSnapshot(f.env)).held==='ruleset_mode_corrupt');
 await f.run("UPDATE site_settings SET value='full_release' WHERE key='rulesetMode'");await f.run("DELETE FROM site_settings WHERE key='rulesetActiveDigest'");
 check('incomplete pins hold',(await profile.activeRulesetSnapshot(f.env)).held==='activation_pins_incomplete');
 await f.run("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('rulesetActiveDigest',?,?,?)",digest,T,ADMIN);
 check('restored pins resolve again',(await profile.activeRulesetSnapshot(f.env)).profile.realm==='Synthetic Future Realm');
 // Return to the beta: one batch again; the earlier full-release payloads remain as history.
 st=await f.request('GET','');r=await f.request('POST','/deactivate',{form:st.data.form,confirm:true});const s2=settings(f);
 check('returning to the beta pins mode beta, clears the identity pins and selects the beta publication',r.status===200&&r.data.mode==='beta'&&r.data.revision===beta.revision&&s2.rulesetMode==='beta'&&s2.rulesetActiveRevision===''&&s2.rulesetActiveDigest===''&&f.db.prepare("SELECT COUNT(*) n FROM ruleset_publications WHERE profile_revision=?").get(beta.revision).n===4&&f.db.prepare("SELECT COUNT(*) n FROM ruleset_publications WHERE profile_revision=?").get(FIX.revision).n===4);
 check('after the return the public meta is the beta again',(await publicRead(f)).meta.ruleset.revision===beta.revision);
 r=await f.request('POST','/deactivate',{form:(await f.request('GET','')).data.form,confirm:true});check('a second return is refused',r.status===409&&r.data.error==='ruleset_already_beta');
 // v2 (Codex review v1): 3 a dropped pin fails the proof; 2 one database time; 1 a lost mode row holds; 4 attribution erasure; 6 corrupt-mode return.
 f=await fixture(g,{RULESET_SWITCH_APPROVERS:ADMIN,RULESET_FUTURE_PROFILE:SECRET});st=await f.request('GET','');
 f.db.exec("CREATE TEMP TRIGGER switch_probe_skip_actor BEFORE INSERT ON site_settings WHEN NEW.key='rulesetActivatedBy' BEGIN SELECT RAISE(IGNORE); END");
 r=await f.request('POST','/activate',{form:st.data.form,confirm:true});
 check('a storage fault that drops one pin fails the closing proof: 409 and nothing persisted',r.status===409&&r.data.error==='ruleset_switch_refused'&&Object.keys(settings(f)).length===0&&f.db.prepare("SELECT COUNT(*) n FROM ruleset_publications").get().n===0&&f.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='site.ruleset_switch'").get().n===0);
 f.db.exec("DROP TRIGGER switch_probe_skip_actor");
 const realNow=Date.now;st=await f.request('GET','');Date.now=()=>(T+120)*1000;r=await f.request('POST','/activate',{form:st.data.form,confirm:true});Date.now=realNow;
 const s3=settings(f),lastAudit=f.db.prepare("SELECT ts FROM audit WHERE action='site.ruleset_switch' ORDER BY rowid DESC LIMIT 1").get(),span=f.db.prepare("SELECT MIN(created_at) a,MAX(created_at) b FROM ruleset_publications").get();
 check('activation binds the database clock, never the application clock, to the pins, the audit row and the selection',r.status===200&&r.data.activatedAt===T&&s3.rulesetActivatedAt===String(T)&&lastAudit.ts===T&&span.a===T&&span.b===T&&f.db.prepare("SELECT updated_at FROM site_settings WHERE key='rulesetMode'").get().updated_at===T);
 check('the rendered decision date comes from that same time',f.db.prepare("SELECT frozen_payload p FROM ruleset_publications WHERE target_key='guild-announcements' ORDER BY rowid DESC LIMIT 1").get().p.includes(profile.rulesetDecidedText({mode:'full_release',activatedAt:T})));
 // v3 (1): every activation record carries the captured time: no publication insert of the switch batch reads its own clock
 const captured=[];f.before=(sql)=>{if(sql.includes('INSERT INTO ruleset_publications')&&sql.includes("'$selection'")||sql.includes('INSERT INTO ruleset_publications')&&sql.includes('json_each(?10)'))captured.push(sql);};
 st=await f.request('GET','');r=await f.request('POST','/deactivate',{form:st.data.form,confirm:true});f.before=null;
 check('the switch batch binds the captured time to both publication inserts instead of their own clock',r.status===200&&captured.length===2&&captured.every(sql=>!/strftime\('%s','now'\)[^\n]*(?:'selection','selected'|'pending','pending')/.test(sql))&&captured[0].includes("'selected',?10,?10,?10+")&&captured[1].includes("'pending',?11,?11,?11+"));
 st=await f.request('GET','');r=await f.request('POST','/activate',{form:st.data.form,confirm:true});
 check('fixture: re-activated for the remaining probes',r.status===200&&settings(f).rulesetMode==='full_release');
 // v3 (2): finite automatic attribution retention, bound to the activation time
 await f.env.DB.batch([data.rulesetActivationAttributionRetentionStatement(f.env)]);
 check('before the horizon the automatic retention leaves the actor pin',settings(f).rulesetActivatedBy===ADMIN);
 await f.run("UPDATE site_settings SET value=? WHERE key='rulesetActivatedAt'",String(T-31536000));
 await f.env.DB.batch([data.rulesetActivationAttributionRetentionStatement(f.env)]);
 const retired=await profile.activeRulesetSnapshot(f.env);
 check('a year after activation the actor pin is emptied automatically and the identity stays resolved with its facts',settings(f).rulesetActivatedBy===''&&retired.profile?.realm==='Synthetic Future Realm'&&retired.activatedBy===null&&retired.activatedAt===T-31536000&&settings(f).rulesetActiveDigest!=='');
 await f.run("UPDATE site_settings SET value='garbage' WHERE key='rulesetActivatedAt'");await f.run("UPDATE site_settings SET value=? WHERE key='rulesetActivatedBy'",ADMIN);
 await f.env.DB.batch([data.rulesetActivationAttributionRetentionStatement(f.env)]);
 check('a malformed activation time never triggers the retention',settings(f).rulesetActivatedBy===ADMIN);
 await f.run("UPDATE site_settings SET value=? WHERE key='rulesetActivatedAt'",String(T));
 await f.run("DELETE FROM site_settings WHERE key='rulesetMode'");
 const lostMode=await publicRead(f);
 check('losing only the mode row while activation pins remain HOLDS, never the beta',(await profile.activeRulesetSnapshot(f.env)).held==='ruleset_mode_corrupt'&&lostMode.meta.ruleset===null&&lostMode.meta.rulesetHeld==='ruleset_mode_corrupt');
 await f.run("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('rulesetMode','full_release',?,?)",T,ADMIN);
 check('the restored mode row resolves again',(await profile.activeRulesetSnapshot(f.env)).profile?.realm==='Synthetic Future Realm');
 check('a lone orphan actor pin beside an absent mode holds, and so does a beta mode beside a leftover digest',(await profile.resolveRulesetSnapshot([{key:'rulesetActivatedBy',value:ADMIN}],{})).held==='ruleset_mode_corrupt'&&(await profile.resolveRulesetSnapshot([{key:'rulesetMode',value:'beta'},{key:'rulesetActiveDigest',value:'ab'}],{})).held==='ruleset_mode_corrupt'&&(await profile.resolveRulesetSnapshot([{key:'rulesetMode',value:'beta'},{key:'rulesetActiveDigest',value:''}],{})).mode==='beta');
 await f.env.DB.batch(data.rulesetPublicationEraseStatements(f.env,ADMIN));
 const erased=await profile.activeRulesetSnapshot(f.env);
 check('the registered scrub empties the actor pin and the activation stays resolved without attribution',settings(f).rulesetActivatedBy===''&&erased.profile?.realm==='Synthetic Future Realm'&&erased.activatedBy===null&&f.db.prepare("SELECT COUNT(*) n FROM site_settings WHERE instr(value,?)>0").get(ADMIN).n===0&&(await publicRead(f)).meta.ruleset.realm==='Synthetic Future Realm');
 check('the five keys are own-setting export keys',['rulesetMode','rulesetActiveRevision','rulesetActiveDigest','rulesetActivatedAt','rulesetActivatedBy'].every(k=>load('privacy-access-family-history').PRIVACY_OWN_SETTING_KEYS.includes(k)));
 await f.run("UPDATE site_settings SET value='corrupt' WHERE key='rulesetMode'");st=await f.request('GET','');
 check('a corrupt mode value is reported held with the return offered and no profile',st.data.rulesetSwitch.held==='ruleset_mode_corrupt'&&st.data.rulesetSwitch.returnAvailable===true&&st.data.currentProfile===null);
 r=await f.request('POST','/deactivate',{form:st.data.form,confirm:true});
 check('the return from a corrupt mode lands through the observed raw value: beta, pins cleared, beta publication selected',r.status===200&&settings(f).rulesetMode==='beta'&&settings(f).rulesetActiveDigest===''&&settings(f).rulesetActivatedBy===''&&(await profile.activeRulesetSnapshot(f.env)).mode==='beta'&&(await publicRead(f)).meta.ruleset.revision===beta.revision);
 // Session loss (the publication suite's pattern): the admin's privacy subject is removed and re-admitted, so the generation
 // changes; a form signed under the earlier generation cannot switch even though the secret is configured and the actor is an approver.
 const originalGeneration=f.session.g,oldForm=(await f.request('GET','')).data.form,rowsBefore=f.db.prepare("SELECT COUNT(*) n FROM ruleset_publications").get().n;await f.run('DELETE FROM privacy_subjects WHERE subject_id=?',ADMIN);await f.reissue();
 r=await f.request('POST','/activate',{form:oldForm,confirm:true});
 check('a form from a lost privacy generation cannot switch',r.status===403&&f.session.g!==originalGeneration&&settings(f).rulesetMode==='beta'&&f.db.prepare("SELECT COUNT(*) n FROM ruleset_publications").get().n===rowsBefore);
 // Own-data projection: the beta revision and an opaque full-release revision survive; restored free-form strings are withheld.
 check('own-data projection keeps opaque revisions and withholds anything else',data.projectOwnRulesetPublication({profile_revision:FIX.revision}).profile_revision===FIX.revision&&data.projectOwnRulesetPublication({profile_revision:beta.revision}).profile_revision===beta.revision&&data.projectOwnRulesetPublication({profile_revision:'private-restored-sentinel'}).profile_revision===null);
 check('bound parameters per statement stay under 100 and the largest batch is bounded',maxParameters<=100&&maxSql<=40);
 console.log(ok+'/'+n+' ruleset switch checks passed');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
