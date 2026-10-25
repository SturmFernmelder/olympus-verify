/** Actual serving sources + actual central QR role writer + native SQLite. No production data/network.
 * During source composition PRIVACY134_QR_SOURCE may point at the QR author's isolated working source.
 * This is provisional integration evidence until both exact source sets are frozen and composed.
 */
const fs=require('fs'),path=require('path'),vm=require('node:vm'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),external=process.env.PRIVACY134_QR_SOURCE||null,cache=new Map(),pins=new Map();
let clock=1800000000;class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[clock*1000]));}static now(){return clock*1000;}}
const context=vm.createContext({crypto:webcrypto,Date:FixtureDate,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Request,Response,Headers,URL,URLSearchParams,AbortController,AbortSignal,ReadableStream,ReadableStreamDefaultReader,console,setTimeout,clearTimeout,btoa,atob,fetch:async(input,init)=>{if(input instanceof Request)return providerFixture(input.url,{method:input.method,headers:input.headers,body:['GET','HEAD'].includes(input.method)?undefined:await input.clone().text()});return providerFixture(input,init);}});
const prefer=new Set(['roles','role-settlements','qr-phase1','qr-phase1-data','qr-phase1-schema','native-rank-adapter']);
function load(name){if(name==='node:async_hooks')return require(name);name=name.replace(/^\.\//,'');let file=path.join(root,'src',name+'.ts');if(external&&(prefer.has(name)||!fs.existsSync(file)))file=path.join(external,name+'.ts');if(cache.has(file))return cache.get(file).exports;
 const bytes=fs.readFileSync(file);pins.set(file,bytes);const mod={exports:{}};cache.set(file,mod);let code=ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 if(name==='privacy-serving-erase')code+='\nmodule.exports.testOnlyLocalCompletion=completeServingAccount;';if(name==='roster')code+='\nmodule.exports.testOnlyApplyEffect=applyEffect;';
 vm.runInContext('(function(module,exports,require){'+code+'\n})',context,{filename:name})(mod,mod.exports,p=>load(p));return mod.exports;}
load('privacy-recovery-floor');load('privacy-serving-recovery-gate');load('privacy-global-serving-origin');load('privacy-write-admission');load('privacy-serving-site-oauth');
const authority=load('privacy-serving-authority'),core=load('site-core'),catalog=load('privacy-business-catalog'),qr=load('qr-phase1-schema');load('qr-phase1-data');
const roles=load('roles'),eraser=load('privacy-serving-erase'),messages=load('privacy-provider-messages');
let db,doDb,native,admitted,currentEnv,readyPromise,installed=false,hooks={},attempts=0,calls=[],hasRole=false,loseDelete=false,afterPost=null,deletedMessage=false,loseMessageDelete=false;
let checks=0,passes=0;function check(s,v){checks++;if(v)passes++;console.log((v?'PASS ':'FAIL ')+s);}
function adapter(){function prepare(sql,values=[]){const s={_sql:sql,statement:sql,params:values,bind(...v){if(v.some(x=>x===undefined)||v.length>100)throw Error('invalid binding');return prepare(sql,v);},exec(){attempts++;hooks.beforeStatement?.(sql);try{const st=db.prepare(sql);if(/^\s*(SELECT|WITH)\b/i.test(sql)||/\bRETURNING\b/i.test(sql))return{success:true,results:st.all(...values),meta:{changes:/^\s*(SELECT|WITH)\b/i.test(sql)?0:Number(db.prepare('SELECT changes() n').get().n)}};const r=st.run(...values);return{success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}catch(error){console.error('fixture Native failure:',JSON.stringify({sqlBytes:Buffer.byteLength(sql,'utf8'),sqlSHA256:require('node:crypto').createHash('sha256').update(sql).digest('hex'),sqlPrefix:sql.slice(0,160),sqlSuffix:sql.slice(-160),parameterCount:values.length,error:error.message}));throw error;}},async first(c){const r=s.exec().results[0]??null;await hooks.afterRead?.(sql);return c&&r?r[c]??null:r;},async all(){const r=s.exec();await hooks.afterRead?.(sql);return r;},async run(){return s.exec();}};return s;}return{prepare,async batch(stmts){await hooks.beforeBatch?.(stmts);db.exec('BEGIN');let out;try{out=stmts.map(s=>s.exec());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}for(const statement of stmts)if(/^\s*(SELECT|WITH)\b/i.test(statement._sql))await hooks.afterRead?.(statement._sql);await hooks.afterBatch?.(stmts,out);if(hooks.loseResponse)throw Error('synthetic lost committed result');return out;}};}
const ID='300000000000000003',OTHER='300000000000000004',BOT='300000000000000099',GUILD='236932545793490944',MEMBER='1551234567890123456',BOTROLE='1551234567890123457',CHANNEL='1551234567890123458',MSG='1551234567890123459',OP='a'.repeat(32),SECRET='privacy-fixture-cookie-secret-0123456789';
const EPOCH='a'.repeat(32),CE='b'.repeat(32),TREE='c'.repeat(40),VERSION='11111111-2222-3333-4444-555555555555',INITIALIZER='synthetic-serving-independent-initializer',OPERATOR='synthetic-serving-independent-operator',SERVING='synthetic-serving-independent-serving';
const PRIVATE=['PRIVACY_RECOVERY_FLOOR','PRIVACY_SERVING_GATE_SECRET','PRIVACY_CREDENTIAL_EPOCH','PRIVACY_SERVING_SOURCE_TREE','PRIVACY_SERVING_DATABASE_ID'];
const installer=require('../scripts/install-rejection-provenance-epoch.cjs'),entrySetup=require('./helpers/privacy129_fixture.cjs');
const env=()=>currentEnv;
function offEnvironment(){const e={...env(),DB:native,PRIVACY_ERASURE_ENABLED:'false'};for(const key of PRIVATE)delete e[key];return e;}
const raw=(q,...v)=>db.prepare(q).get(...v),rows=(q,...v)=>db.prepare(q).all(...v);
function reset(oldActivitySchema=false){db?.close();doDb?.close();db=null;doDb=null;clock=1800000000;db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.function('strftime',(format,input)=>{if(format!=='%s'||input!=='now')throw Error('fixture Native clock misuse');return String(clock);});const profile=installer.manifest.canonical;for(const table of profile.tables){const sql=oldActivitySchema&&table.name==='members'?table.sql.replace('names_at       INTEGER,','names_at       INTEGER').replace(/\n  activity_at[^\n]*/,''):table.sql;db.exec(sql);}for(const index of profile.indexes)db.exec(index.sql);db.exec(profile.slotSQL);db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)").run();db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)").run(clock);hooks={};calls=[];hasRole=false;loseDelete=false;afterPost=null;deletedMessage=false;loseMessageDelete=false;attempts=0;installed=false;readyPromise=null;native=adapter();admitted=load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native,'writer','canonical',EPOCH);currentEnv={DB:admitted,COOKIE_SECRET:SECRET,DISCORD_CLIENT_SECRET:'synthetic-serving-only-client',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://guild.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,DISCORD_APP_ID:BOT,SITE_ADMINS:OTHER,ROLE_GUILD_MEMBER:MEMBER,DISCORD_BOT_TOKEN:'synthetic-unused-token',COMMUNITY_FEATURES:'',CHANNEL_NOTICES:CHANNEL,CF_VERSION_METADATA:{id:VERSION,tag:'existing-serving-native-suite',timestamp:'2026-10-13T00:00:00Z'}};db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,session_version)VALUES(?,?,?,?,7)').run(ID,'Synthetic Member',clock,clock);return clock;}
async function ready(){if(!readyPromise)readyPromise=(async function initializeOriginal(){installer.installFixtureEpoch(db,'canonical',EPOCH);installed=true;doDb=new DatabaseSync(':memory:');doDb.function('strftime',(format,input)=>{if(format!=='%s'||input!=='now')throw Error('fixture DO clock misuse');return String(clock);});const floor=load('privacy-recovery-floor'),gate=load('privacy-serving-recovery-gate'),storage={sql:{exec(sql,...args){const s=doDb.prepare(sql),result=s.columns().length?s.all(...args):(s.run(...args),[]);return{toArray:()=>result};}},transactionSync(work){doDb.exec('BEGIN IMMEDIATE');try{const out=work();doDb.exec('COMMIT');return out;}catch(error){doDb.exec('ROLLBACK');throw error;}},async setAlarm(time){if(!Number.isSafeInteger(time))throw Error('fixture alarm time');}},object=new floor.PrivacyRecoveryFloor({storage},{PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,PRIVACY_SERVING_GATE_SECRET:SERVING});const raw=JSON.stringify({operationId:'1'.repeat(32),nonce:'2'.repeat(32),requestDigest:'3'.repeat(64),createdAt:clock,expiresAt:clock+300,credentialEpoch:CE,writeEpoch:EPOCH,sourceTree:TREE,deploymentVersion:VERSION}),proof=await floor.recoveryFloorMac(INITIALIZER,'POST','/v1/initialize',raw),r=await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/initialize',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Recovery-Proof':proof},body:raw}));if(r.status!==200)throw Error('genuine fixture floor initialization');const F=(await r.json()).floor,close=JSON.stringify({operationId:'4'.repeat(32),nonce:'5'.repeat(32),requestDigest:'6'.repeat(64),createdAt:clock,expiresAt:clock+300,nextWriteEpoch:'d'.repeat(32),originalFloor:F}),mac=await gate.servingGateMac(INITIALIZER,'POST','/v1/serving/initialize-closed',close),closed=await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/serving/initialize-closed',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Serving-Proof':mac},body:close}));if(closed.status!==200)throw Error('genuine fixture closed initialization');
 // Existing local managed-open bootstrap only; this does not qualify a production opener.
 doDb.prepare("UPDATE recovery_serving_gate SET state='managed_open',operation_id=NULL,nonce=NULL,request_digest=NULL,created_at=NULL,expires_at=NULL,next_write_epoch=NULL,closed_at=NULL WHERE singleton=1 AND state='closing_held'").run();const rid=Object.freeze({fixture:'same-native-independent-floor'}),stub={async fetch(request){const response=await object.fetch(request);if(response.status>=400)console.error('fixture independent refusal:',new URL(request.url).pathname,response.status,await response.clone().text());return response;}};Object.assign(currentEnv,{PRIVACY_RECOVERY_FLOOR:{idFromName(name){if(name!==floor.RECOVERY_FLOOR_NAME)throw Error('floor name');return rid;},get(id){if(id!==rid)throw Error('floor id');return stub;}},PRIVACY_SERVING_GATE_SECRET:SERVING,PRIVACY_CREDENTIAL_EPOCH:CE,PRIVACY_SERVING_SOURCE_TREE:TREE,PRIVACY_SERVING_DATABASE_ID:floor.RECOVERY_FLOOR_TARGET.database});})();return readyPromise;}
async function setupWrite(sql,...values){await ready();return admitted.prepare(sql).bind(...values).run();}
const subjectBindings=new WeakMap();function boundSubjectEnv(e,subject,capture){const out=authority.privacyBoundSubjectEnv(e,subject,capture);subjectBindings.set(out,{subject,capture});return out;}
async function originalServingWork(e,work,request=new Request('https://guild.example/fixture-original-entry')){await ready();const rawEnv={...e,DB:native},pending=[],ctx={waitUntil(p){pending.push(p);}},global=load('privacy-global-serving-origin'),entry=global.captureGlobalServingEntry(rawEnv,ctx,'fetch',request);const out=await global.dispatchGlobalServingEntry(entry,async()=>{let target={...entry.env,DB:load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(entry.env.DB,'writer','canonical',EPOCH)};const binding=subjectBindings.get(e);if(binding)target=authority.privacyBoundSubjectEnv(target,binding.subject,binding.capture);try{return await work(target,entry.request??request);}catch(error){console.error('original fixture work failed:',error.stack);throw error;}});for(const p of pending)await p;return out;}
async function observeOriginalServingWork(e,work,request){try{return{held:false,value:await originalServingWork(e,work,request)};}catch(error){if(error.message!=='recovery_floor_held')throw error;return{held:true,value:null};}}
const snapshot=()=>JSON.stringify(rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(t=>[t.name,rows(`SELECT * FROM ${t.name}`)]));
// Supplementary reminder observations use this existing family's initialized floor,
// original signed admission and Native adapter. Inactive for all original43 checks.
let retiringReminderProbe = null;
const RETIRING_EVENT = 'R'.repeat(22);
const retiringHash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');

async function retiringReminderProvider(url, init, method, pathname) {
  const probe = retiringReminderProbe;
  if (!probe) throw Error('supplementary provider branch requires its existing-family case');
  let value;
  if (method === 'GET' && pathname === '/api/v10/users/@me') value = {id:BOT,bot:true};
  else if (method === 'GET' && pathname === `/api/v10/channels/${CHANNEL}`) value = {id:CHANNEL,guild_id:GUILD,type:0};
  else if (method === 'GET' && [ID,OTHER,BOT].some(who => pathname === `/api/v10/guilds/${GUILD}/members/${who}`)) {
    value = {user:{id:pathname.split('/').at(-1)},roles:[]};
  } else if (method === 'POST' && pathname === `/api/v10/channels/${CHANNEL}/messages`) {
    const body = JSON.parse(init.body);
    probe.posts.push({content:body.content,allowed_mentions:body.allowed_mentions,nonce:body.nonce});
    value = {id:MSG,channel_id:CHANNEL,author:{id:BOT,bot:true},type:0,
      content:body.content,nonce:body.nonce,embeds:[],attachments:[]};
    probe.message = value;
    await afterPost?.();
  } else if (method === 'GET' && pathname === `/api/v10/channels/${CHANNEL}/messages/${MSG}` && probe.message) value = probe.message;
  else throw Error('unexpected supplementary Discord target '+method+' '+pathname);
  return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
}

async function retiringReminderRequest(method, pathname, body, cookie) {
  const request = new Request('https://guild.example'+pathname,{method,
    headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const pending = [];
  const response = await load('index').default.fetch(request,{...env(),DB:native},{waitUntil(work){pending.push(work);}});
  for (const work of pending) await work;
  const value = await response.json();
  if (response.status !== 200) throw Error('supplementary real handler refused '+pathname+' '+response.status+' '+JSON.stringify(value));
  return value;
}

async function prepareRetiringReminderCase(label) {
  // This is the original per-case reset/ready, before any added entry capture.
  retiringReminderProbe = null;
  reset();
  await ready();
  retiringReminderProbe = {label,posts:[],message:null,groups:[],admission:null,claim:null,
    nativeStart:attempts,clockStart:clock,floorBefore:doDb.prepare('SELECT * FROM recovery_floor').all()};
  hooks.beforeBatch = async statements => {
    retiringReminderProbe.groups.push({statements:statements.length,
      sqlSHA256:statements.map(statement => retiringHash(statement._sql))});
  };
  Object.assign(currentEnv,{COMMUNITY_FEATURES:'events,attendance',COMMUNITY_ORGANIZERS:OTHER,
    INTROS_GUILD_ID:GUILD,INTROS_CHANNELS:`raid-signups=${CHANNEL}`,EVENT_DISCORD_DELIVERY:'on',EVENT_DISCORD_REMINDERS:'on'});
  await setupWrite('UPDATE site_users SET in_server=1,denied=0,checked_at=? WHERE discord_id=?',clock,ID);
  await setupWrite('INSERT INTO site_users(discord_id,username,in_server,denied,session_version,first_login,last_login,checked_at)VALUES(?,?,1,0,7,?,?,?)',OTHER,'Synthetic raid organizer',clock,clock,clock);
  for (const who of [ID,OTHER]) {
    await setupWrite('INSERT INTO members(discord_id,banned)VALUES(?,0)',who);
    await setupWrite("INSERT INTO characters(name_key,name,discord_id,status,bound_at)VALUES(?,?,?,'member',?)",who,who===ID?'Retiring Recipient':'Raid Organizer',who,clock);
  }
  const recipientCookie = await originalCookie(ID), organizerCookie = await originalCookie(OTHER);
  const session = await originalServingWork(env(),(originalEnv,request)=>core.readSession(originalEnv,request),req(recipientCookie));
  if (!session || session.u !== ID || !session.g || !session.n) throw Error('supplementary original signed session missing');
  retiringReminderProbe.session = {u:session.u,v:session.v,g:session.g,n:session.n};
  retiringReminderProbe.recipientCookie = recipientCookie;
  await retiringReminderRequest('POST','/api/community/events',{
    opId:RETIRING_EVENT,title:'Synthetic retirement reminder',startsAt:new Date((clock+1800)*1000).toISOString(),durationMin:60,capacity:2
  },organizerCookie);
  await retiringReminderRequest('PUT','/api/community/events/rsvp',{
    eventId:RETIRING_EVENT,status:'yes',revision:0,remindMention:true
  },recipientCookie);
  await retiringReminderRequest('POST','/api/community/events/reminder',{
    eventId:RETIRING_EVENT,revision:1,enabled:true
  },organizerCookie);
  const reminder = raw('SELECT * FROM community_event_reminders WHERE event_id=?',RETIRING_EVENT);
  if (reminder?.state !== 'armed' || retiringReminderProbe.posts.length !== 0) throw Error('supplementary real arming not witnessed');
}

async function admitRetiringReminderRecipient() {
  const probe = retiringReminderProbe, session = probe.session;
  // admission() is unchanged: the real signed Request and original serving entry.
  const proof = await admission(probe.recipientCookie);
  const subject = raw('SELECT generation,state FROM privacy_subjects WHERE subject_id=?',ID);
  const job = raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP);
  const user = raw('SELECT in_server,denied,session_version,account_incarnation FROM site_users WHERE discord_id=?',ID);
  const signup = raw('SELECT status,remind_mention FROM community_event_signups WHERE event_id=? AND discord_id=?',RETIRING_EVENT,ID);
  const genuine = proof?.subject === ID && proof.subjectGeneration === session.g && proof.accountIncarnation === session.n &&
    subject?.state === 'retiring' && subject.generation === session.g && job?.state === 'waiting_role' && job.completed_at === null &&
    job.subject_id === ID && job.subject_generation === session.g && job.original_session_version === session.v &&
    job.original_account_incarnation === session.n && user?.session_version === session.v+1 && user.account_incarnation === session.n;
  const uncleaned = user?.in_server === 1 && user.denied === 0 &&
    !!raw("SELECT 1 FROM characters WHERE discord_id=? AND status='member'",ID) &&
    !!raw('SELECT 1 FROM members WHERE discord_id=? AND banned=0',ID) && signup?.status === 'yes' && signup.remind_mention === 1;
  probe.admission = {genuine,uncleaned,operationId:job?.operation_id,state:job?.state,completedAt:job?.completed_at};
  check('supplementary '+probe.label+': original signed admission leaves genuine waiting-role debt and uncleaned standing',genuine&&uncleaned);
  if (!genuine || !uncleaned) throw Error('supplementary retirement authority not witnessed');
}

function retiringReminderObservation(error) {
  const probe = retiringReminderProbe;
  if (!probe) return null;
  const reminder = raw('SELECT event_id,op_id,claim_nonce,state,message_id,mention_ids,cleanup_requested FROM community_event_reminders WHERE event_id=?',RETIRING_EVENT);
  const subject = raw('SELECT subject_id,generation,state FROM privacy_subjects WHERE subject_id=?',ID);
  const job = raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP);
  const facts = {label:probe.label,error:error?{name:error.name,message:error.message}:null,
    originalAdmission:probe.admission,originalClaim:probe.claim,subject,job,reminder,
    posts:probe.posts,nativeStatements:attempts-probe.nativeStart,nativeGroups:probe.groups,
    clockUnchanged:clock===probe.clockStart,floorBefore:probe.floorBefore,
    floorAfter:doDb.prepare('SELECT * FROM recovery_floor').all(),
    journal:doDb.prepare('SELECT * FROM recovery_journal ORDER BY operation_id').all(),
    tickets:doDb.prepare('SELECT * FROM recovery_serving_ticket ORDER BY ticket_id').all(),
    completionAttempts:doDb.prepare('SELECT * FROM recovery_completion_attempt ORDER BY operation_id,phase').all()};
  console.log('RETIRING_SERVING_FAMILY_OBSERVATION '+JSON.stringify(facts));
  return facts;
}

async function runRetiringReminderCase(label,position) {
  try {
    await prepareRetiringReminderCase(label);
    if (position === 'before') await admitRetiringReminderRecipient();
    if (position === 'claimed') hooks.afterBatch = async (statements,result) => {
      const index = statements.findIndex(statement => statement._sql.includes("UPDATE community_event_reminders AS r SET state='claimed',claim_nonce"));
      if (index < 0) return;
      hooks.afterBatch = null;
      // Consume the row from this exact original committed Native result; no re-query.
      const row = result[index]?.results[0], descriptor = row && Object.getOwnPropertyDescriptor(row,'mention_ids');
      if (!descriptor || !Object.hasOwn(descriptor,'value') || descriptor.get || descriptor.set || descriptor.value !== JSON.stringify([ID])) throw Error('supplementary original claim vector not witnessed');
      retiringReminderProbe.claim = {mention_ids:descriptor.value,source:'same original afterBatch result'};
      await admitRetiringReminderRecipient();
    };
    if (position === 'posted') afterPost = async () => {afterPost=null;await admitRetiringReminderRecipient();};
    await originalServingWork(env(),originalEnv=>load('community-event-reminders').runEventReminders(originalEnv));
    const facts = retiringReminderObservation(null), reminder = facts.reminder;
    check('supplementary '+label+': original waiting-role custody stays uncompleted',facts.subject?.state==='retiring'&&facts.job?.state==='waiting_role'&&facts.job.completed_at===null);
    check('supplementary '+label+': clock and initialized floor unchanged',facts.clockUnchanged&&JSON.stringify(facts.floorBefore)===JSON.stringify(facts.floorAfter));
    if (position === 'before') check('supplementary retiring before claim: no new POST mentions the recipient',!facts.posts.some(post=>post.allowed_mentions?.users?.includes(ID)));
    if (position === 'claimed') check('supplementary retiring after claim: zero POST and cancelled reminder',facts.posts.length===0&&reminder?.state==='cancelled');
    if (position === 'posted') check('supplementary retiring during POST: known pointer stays unknown with removal debt',facts.posts.length===1&&reminder?.message_id===MSG&&reminder.state==='unknown'&&reminder.cleanup_requested===1);
  } catch (error) {
    try {retiringReminderObservation(error);} catch (observationError) {console.error('supplementary observation failed:',observationError.message);}
    throw error; // Preserve the same genuine source failure; never manufacture a result.
  }
}

async function providerFixture(url,init={}){const method=init.method||'GET',p=new URL(url).pathname;calls.push(method+' '+p);if(!String(url).startsWith('https://discord.com/api/v10/'))throw Error('unexpected target');if(retiringReminderProbe)return retiringReminderProvider(url,init,method,p);let data;
 if(method==='GET'&&p.endsWith('/users/@me'))data={id:BOT};
 else if(method==='GET'&&p===`/api/v10/guilds/${GUILD}/roles`)data=[{id:GUILD,position:0,permissions:'0',managed:false},{id:MEMBER,position:1,permissions:'0',managed:false},{id:BOTROLE,position:10,permissions:'268435456',managed:false}];
 else if(method==='GET'&&p===`/api/v10/guilds/${GUILD}/members/${BOT}`)data={roles:[BOTROLE],user:{id:BOT}};
 else if(method==='GET'&&p===`/api/v10/guilds/${GUILD}/members/${ID}`)data={roles:hasRole?[MEMBER]:[],user:{id:ID}};
 else if(method==='DELETE'&&p===`/api/v10/guilds/${GUILD}/members/${ID}/roles/${MEMBER}`){hasRole=false;if(loseDelete){loseDelete=false;throw Error('synthetic lost landed role DELETE');}return new Response(null,{status:204});}
 else if(method==='POST'&&p===`/api/v10/channels/${CHANNEL}/messages`){await afterPost?.();data={id:MSG};}
 else if(method==='DELETE'&&p===`/api/v10/channels/${CHANNEL}/messages/${MSG}`){deletedMessage=true;if(loseMessageDelete){loseMessageDelete=false;throw Error('synthetic lost landed message DELETE');}return new Response(null,{status:204});}
 else if(method==='GET'&&p===`/api/v10/channels/${CHANNEL}/messages/${MSG}`){if(deletedMessage)return new Response(JSON.stringify({code:10008}),{status:404});data={id:MSG,channel_id:CHANNEL,author:{id:BOT}};}
 else throw Error('unexpected Discord target '+method+' '+p);return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});};
// Additive census original-fetch observations. Inactive for all original57 checks.
const censusAssert = require('node:assert/strict');
const CENSUS_RECEIPT_SQL = "SELECT CAST(strftime('%s','now') AS INTEGER) AS receipt_now";
const CENSUS_SENTINELS = ['CensusOpaqueRealm_d582', 'CensusOpaqueGuild_d582'];
const censusHash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
const censusEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const censusQuote = name => '"'+name.replace(/"/g,'""')+'"';
function censusValue(value) {
  if (value instanceof Uint8Array) return {type:'blob',hex:Buffer.from(value).toString('hex')};
  if (typeof value === 'bigint') return {type:'bigint',decimal:String(value)};
  if (typeof value === 'number') return {type:'number',value:Object.is(value,-0)?'-0':value};
  return {type:value===null?'null':typeof value,value};
}
function censusDatabaseSnapshot(database) {
  const objects=database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables=objects.filter(row=>row.type==='table').map(table=>{
    const columns=database.prepare('PRAGMA table_xinfo('+censusQuote(table.name)+')').all();
    const expressions=columns.flatMap((column,index)=>[
      censusQuote(column.name)+' AS '+censusQuote('v'+index),
      'typeof('+censusQuote(column.name)+') AS '+censusQuote('t'+index)]);
    const result=database.prepare('SELECT '+expressions.join(',')+' FROM '+censusQuote(table.name)).all();
    const values=result.map(row=>columns.map((column,index)=>({sqliteType:row['t'+index],...censusValue(row['v'+index])})));
    values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
    return {name:table.name,columns,rows:values};
  });
  return {objects,tables};
}
function censusRows(snapshot,name) {
  const table=snapshot.tables.find(row=>row.name===name);
  censusAssert.ok(table,'observed original table '+name);
  return table.rows.map(row=>Object.fromEntries(table.columns.map((column,index)=>[column.name,row[index].value])));
}
function censusChangedTables(before,after) {
  const names=new Set([...before.tables,...after.tables].map(table=>table.name));
  return [...names].sort().filter(name=>!censusEqual(before.tables.find(table=>table.name===name),after.tables.find(table=>table.name===name)));
}
function censusObserveDatabasePair(ledger) {
  const before={attempts,calls:calls.length,statements:ledger.statements.length,groups:ledger.groups.length};
  const value={application:censusDatabaseSnapshot(db),durableObject:censusDatabaseSnapshot(doDb)};
  const after={attempts,calls:calls.length,statements:ledger.statements.length,groups:ledger.groups.length};
  ledger.observationCounters.push({before,after,unchanged:censusEqual(before,after)});
  return value;
}
function censusNativeLedger() {
  const ledger={startAttempts:attempts,statements:[],groups:[],observationCounters:[]};
  const groupByStatements=new WeakMap();let active=null;
  hooks.beforeBatch=statements=>{
    const group={ordinal:ledger.groups.length+1,firstStatementOrdinal:ledger.statements.length+1,
      length:statements.length,attempted:0,committed:false,
      statements:statements.map(statement=>({sqlSHA256:censusHash(statement._sql),sqlBytes:Buffer.byteLength(statement._sql,'utf8'),
        parameterCount:statement.params.length,parameters:statement.params.map(value=>{
          const typed=censusValue(value);return {type:typed.type,sha256:censusHash(JSON.stringify(typed))};})}))};
    ledger.groups.push(group);groupByStatements.set(statements,group);active=group;
  };
  hooks.beforeStatement=sql=>{
    const member=active?active.statements[active.attempted]:null;
    const row={ordinal:ledger.statements.length+1,attemptOrdinal:attempts,sql,sqlSHA256:censusHash(sql),sqlBytes:Buffer.byteLength(sql,'utf8'),
      receiptClock:sql===CENSUS_RECEIPT_SQL,groupOrdinal:active?.ordinal??null,
      parameterCount:member?.parameterCount??null,parameters:member?.parameters??null};
    if(active){row.matchesOriginalBatchMember=row.sqlSHA256===member.sqlSHA256;active.attempted++;if(active.attempted===active.length)active=null;}
    ledger.statements.push(row);
  };
  hooks.afterBatch=(statements,results)=>{
    const group=groupByStatements.get(statements);
    if(group){group.committed=true;group.acknowledgements=results.map(result=>({success:result.success,changes:result.meta?.changes??null}));}
  };
  return ledger;
}
function censusPosition(ledger){return {attempts,statementIndex:ledger.statements.length,groupIndex:ledger.groups.length,providerIndex:calls.length};}
let censusObservationDirectory=null;
function censusSave(name,value) {
  const directory=censusObservationDirectory||(censusObservationDirectory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'olympus-serving-census-')));
  const file=path.join(directory,name+'.json'),bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  fs.writeFileSync(file,bytes,{flag:'wx'});
  const artifact={file:file.replace(/\\/g,'/'),directory:directory.replace(/\\/g,'/'),bytes:bytes.length,sha256:censusHash(bytes)};
  console.log('CENSUS_ORIGINAL_ENTRY_ARTIFACT '+JSON.stringify(artifact));
  return artifact;
}
function censusSlotValid(snapshot) {
  const list=censusRows(snapshot,'privacy_write_admission'),row=list[0];
  return list.length===1&&row.singleton===1&&row.protocol==='olympus-write-admission-epoch-2'&&row.active===0&&row.nonce===''&&row.purpose===''&&row.epoch===EPOCH&&row.mode==='serving'&&Number.isSafeInteger(row.entry_changes)&&row.entry_changes>=0&&Number.isSafeInteger(row.logical_changes)&&row.logical_changes>=0;
}
function censusCustody(before,after) {
  const old=censusRows(before,'recovery_serving_ticket'),now=censusRows(after,'recovery_serving_ticket'),oldIds=new Set(old.map(row=>row.ticket_id));
  const fresh=now.filter(row=>!oldIds.has(row.ticket_id)),roots=fresh.filter(row=>row.parent_ticket_id===null),ids=new Set(fresh.map(row=>row.ticket_id));
  const originalRowsUnchanged=old.every(row=>censusEqual(row,now.find(next=>next.ticket_id===row.ticket_id)));
  const soleRoot=roots.length===1&&roots[0].purpose==='fetch';
  const completeTree=soleRoot&&fresh.every(row=>{
    if(row.state!=='settled'||!Number.isSafeInteger(row.finished_at)||row.finished_at!==clock)return false;
    if(row.request_digest!==roots[0].request_digest||row.native_floor!==roots[0].native_floor||row.floor_sequence!==roots[0].floor_sequence)return false;
    let parent=row;const visited=new Set();
    while(parent.parent_ticket_id!==null){
      if(visited.has(parent.ticket_id)||!ids.has(parent.parent_ticket_id))return false;
      visited.add(parent.ticket_id);parent=fresh.find(next=>next.ticket_id===parent.parent_ticket_id);
    }
    return parent.ticket_id===roots[0].ticket_id;
  });
  const changedTables=censusChangedTables(before,after);
  return {originalRowsUnchanged,soleRoot,completeTree,changedTables,newTickets:fresh,
    otherStateUnchanged:changedTables.every(name=>name==='recovery_serving_ticket')&&censusEqual(before.objects,after.objects)};
}
async function censusRecreateOriginalBirth(cookie,session,ledger) {
  const before=censusObserveDatabasePair(ledger),original=censusRows(before.application,'site_users').find(row=>row.discord_id===ID);
  const fields=['discord_id','username','global_name','nick','avatar','account_created','server_joined','first_login','last_login','checked_at','in_server','session_version','denied','denied_reason','denied_at','denied_by','rejection_event_id','rejection_subject_key','rejection_scope','rejection_window_expired'];
  censusAssert.deepEqual(Object.keys(original).sort(),[...fields,'account_incarnation'].sort());
  censusAssert.equal(original.account_incarnation,session.n);
  censusAssert.equal(censusRows(before.application,'site_applications').filter(row=>row.discord_id===ID).length,0);
  const start=censusPosition(ledger);
  const results=await admitted.batch([
    admitted.prepare('DELETE FROM site_users WHERE discord_id=?1 AND account_incarnation=?2').bind(ID,session.n),
    admitted.prepare('INSERT INTO site_users(discord_id,username,global_name,nick,avatar,account_created,server_joined,first_login,last_login,checked_at,in_server,session_version,denied,denied_reason,denied_at,denied_by,rejection_event_id,rejection_subject_key,rejection_scope,rejection_window_expired) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)').bind(...fields.map(field=>original[field]))
  ]);
  const end=censusPosition(ledger),after=censusObserveDatabasePair(ledger),replacement=censusRows(after.application,'site_users').find(row=>row.discord_id===ID);
  const acknowledged=results.length===2&&results.every(result=>result.success===true&&result.meta.changes===1);
  check('census old birth recreation has both actual admitted one-row acknowledgements',acknowledged);
  const otherChanges=censusChangedTables(before.application,after.application).filter(name=>!['site_users','privacy_write_admission'].includes(name));
  const changedBirth=!!replacement&&/^[0-9a-f]{32}$/.test(replacement.account_incarnation)&&replacement.account_incarnation!==session.n;
  const exactFields=changedBirth&&censusEqual({...replacement,account_incarnation:original.account_incarnation},original);
  const witnessed=acknowledged&&exactFields&&otherChanges.length===0&&censusEqual(before.application.objects,after.application.objects)&&censusEqual(before.durableObject,after.durableObject);
  check('census old birth recreation preserves every other account field, generation and related fact',witnessed);
  censusSave('old-birth-recreation',{before,after,start,end,acknowledgements:results.map(result=>({success:result.success,changes:result.meta.changes})),changedBirth,exactFields,otherChanges,originalAuthorityRetained:true});
  censusAssert.ok(witnessed,'original admitted incarnation recreation did not complete');
  return {cookie,originalTuple:[session.u,session.v,session.e,session.g,session.n]};
}
async function runCensusServingCase(label,mode) {
  retiringReminderProbe=null;reset();await ready();
  const ledger=censusNativeLedger(),initialClock=clock;
  Object.assign(currentEnv,{COMMUNITY_FEATURES:mode==='off'?'':'census'});
  await setupWrite('UPDATE site_users SET in_server=1,denied=0,checked_at=? WHERE discord_id=?',clock,ID);
  await setupWrite('INSERT INTO members(discord_id,banned)VALUES(?,0)',ID);
  if(mode!=='unconfirmed')await setupWrite("INSERT INTO characters(name_key,name,discord_id,status,bound_at)VALUES(?,?,?,'member',?)",'census keeper witness','Census Keeper Witness',ID,clock);
  const cookie=await originalCookie(ID),signedRequest=req(cookie);
  const session=await originalServingWork(env(),(originalEnv,request)=>core.readSession(originalEnv,request),signedRequest);
  const setup=censusObserveDatabasePair(ledger),user=censusRows(setup.application,'site_users').find(row=>row.discord_id===ID),subject=censusRows(setup.application,'privacy_subjects').find(row=>row.subject_id===ID);
  const originalTuple=session?[session.u,session.v,session.e,session.g,session.n]:null;
  const genuine=!!session&&session.u===ID&&session.v===user.session_version&&session.n===user.account_incarnation&&/^[0-9a-f]{32}$/.test(session.n)&&subject?.state==='active'&&subject.generation===session.g;
  check('census '+label+' uses the current original issuer and active keeper identity',genuine);
  censusAssert.ok(genuine,'genuine original census setup missing');
  if(mode==='old-birth')await censusRecreateOriginalBirth(cookie,session,ledger);
  const snapshot={format:'olympus-census-v1',addonVersion:'fixture-entry-1',realmGroup:CENSUS_SENTINELS[0],faction:'Alliance',observedAt:clock,source:'community-observation',membershipProof:false,
    guilds:[{name:CENSUS_SENTINELS[1],reportedCharacters:3,receivedAt:clock,fresh:true,counted:true,online:2}]};
  const rawText=JSON.stringify(snapshot);
  const request=new Request('https://guild.example/api/community/census/preview',{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},body:rawText});
  const before=censusObserveDatabasePair(ledger),start=censusPosition(ledger),pending=[];
  let response,value,thrown;
  try{
    response=await load('index').default.fetch(request,{...env(),DB:native},{waitUntil(work){pending.push(work);}});
    for(const work of pending)await work;
    value=await response.json();
  }catch(error){thrown=error;}
  const end=censusPosition(ledger),after=censusObserveDatabasePair(ledger);
  const statements=ledger.statements.slice(start.statementIndex,end.statementIndex),groups=ledger.groups.slice(start.groupIndex,end.groupIndex);
  const receiptClocks=statements.filter(row=>row.receiptClock).length;
  const changes={application:censusChangedTables(before.application,after.application),durableObject:censusChangedTables(before.durableObject,after.durableObject)};
  const custody=censusCustody(before.durableObject,after.durableObject);
  const evidence={label,mode,clock:initialClock,setup,before,after,start,end,ledger,changes,custody,
    response:{status:response?.status??null,error:typeof value?.error==='string'?value.error:null,receiptClockStatements:receiptClocks,
      receivedClosedDTO:value?.format==='olympus-census-preview-v1',persisted:value?.persisted??null,sourceVerified:value?.sourceVerified??null,membershipProof:value?.membershipProof??null},
    exception:thrown?{name:thrown.name,message:thrown.message}:null,
    scope:{originalIndexFetchCalls:1,applicationD1PhysicalStatements:end.attempts-start.attempts,durableObjectStateObserved:true,durableObjectSQLCountMeasured:false,scheduledCostScopeUsed:false}};
  const artifact=censusSave(label,evidence);
  console.log('CENSUS_ORIGINAL_ENTRY_OBSERVATION '+JSON.stringify({label,artifact,status:response?.status??null,physicalD1:end.attempts-start.attempts,groups:groups.map(group=>group.length),maxObservedBatchParameters:Math.max(0,...groups.flatMap(group=>group.statements.map(row=>row.parameterCount))),receiptClocks,newTickets:custody.newTickets.length,changes}));
  if(thrown)throw thrown;
  const expected=mode==='off'?[404,'not_found']:mode==='unconfirmed'?[403,'guild_unconfirmed']:mode==='old-birth'?[401,'signed_out']:[200,null];
  const success=mode==='success';
  const closed=success?Object.keys(value).sort().join(',')==='atReceipt,format,membershipProof,persisted,receiptNow,snapshot,sourceVerified'&&value.format==='olympus-census-preview-v1'&&value.persisted===false&&value.sourceVerified===false&&value.membershipProof===false&&censusEqual(value.snapshot,snapshot)&&value.receiptNow===initialClock&&value.atReceipt?.receiptNow===initialClock&&value.atReceipt?.snapshotAgeSeconds===0&&censusEqual(value.atReceipt?.guilds,[{name:CENSUS_SENTINELS[1],ageSeconds:0,fresh:true,counted:true,retained:true}]):!Object.hasOwn(value,'snapshot')&&!Object.hasOwn(value,'atReceipt')&&!Object.hasOwn(value,'receiptNow');
  check('census '+label+' returns its exact whole-entry result and bounded receipt DTO',response.status===expected[0]&&(success||value.error===expected[1])&&closed&&receiptClocks===(success?1:0)&&response.headers.get('Cache-Control')?.includes('no-store')&&response.headers.get('X-Content-Type-Options')==='nosniff');
  check('census '+label+' keeps the original clock and cookie with zero provider work',clock===initialClock&&end.providerIndex===start.providerIndex&&request.headers.get('Cookie')===cookie&&signedRequest.headers.get('Cookie')===cookie&&censusEqual([session.u,session.v,session.e,session.g,session.n],originalTuple));
  const businessUnchanged=changes.application.every(name=>name==='privacy_write_admission')&&censusEqual(before.application.objects,after.application.objects);
  const beforeSlot=censusRows(before.application,'privacy_write_admission')[0],afterSlot=censusRows(after.application,'privacy_write_admission')[0];
  const originalSlotFields=['singleton','protocol','active','nonce','purpose','epoch','mode'];
  check('census '+label+' leaves every business row unchanged and original admission controls idle',businessUnchanged&&censusSlotValid(before.application)&&censusSlotValid(after.application)&&originalSlotFields.every(key=>beforeSlot[key]===afterSlot[key]));
  const persisted=JSON.stringify({before,after});
  check('census '+label+' leaves neither aggregate sentinel in either complete persisted store',CENSUS_SENTINELS.every(marker=>!persisted.includes(marker))&&CENSUS_SENTINELS.every(marker=>!persisted.includes(Buffer.from(marker,'utf8').toString('hex'))));
  check('census '+label+' settles exactly one genuine fetch tree without changing old custody or floor',custody.soleRoot&&custody.completeTree&&custody.originalRowsUnchanged&&custody.otherStateUnchanged);
  const fullLedger=ledger.statements.length===attempts-ledger.startAttempts&&ledger.statements.every((row,index)=>row.ordinal===index+1&&row.attemptOrdinal===ledger.startAttempts+index+1&&(row.matchesOriginalBatchMember??true))&&statements.length===end.attempts-start.attempts&&groups.every(group=>group.attempted===group.length&&group.committed)&&ledger.observationCounters.every(row=>row.unchanged);
  check('census '+label+' retains every physical D1 ordinal and original group without observational work',fullLedger);
}

const req=c=>new Request('https://guild.example/api/me/erasure',{method:'POST',headers:{Cookie:c,Origin:'https://guild.example','X-Olympus':'2'}});
async function originalCookie(subject=ID){await ready();return(await entrySetup.issueOriginalEntryCookie(load,db,offEnvironment(),subject)).cookie;}
async function originalDenial(issueTarget=true){
 if(issueTarget)await originalCookie(ID);
 await setupWrite('INSERT INTO site_users(discord_id,username,first_login,last_login,session_version)VALUES(?,?,?,?,7)',OTHER,'Original fixture staff',clock,clock);
 await setupWrite("INSERT INTO site_applications(discord_id,position,fallback,answers,status,created_at,updated_at)VALUES(?,'member',1,'{}','submitted',?,?)",ID,clock,clock);
 const route=issueTarget?'deny':'status',cookie=await originalCookie(OTHER),worker=load('index').default,e=offEnvironment(),ctx={waitUntil(){throw Error('unexpected deferred membership decision');}},base='https://guild.example',headers={Cookie:cookie,Origin:base,'X-Olympus':'2'};
 const prepared=await worker.fetch(new Request(base+'/api/admin/users/'+ID+'/decision-target?route='+route+'&decisionAction=membership_rejection_v1',{headers}),e,ctx);if(prepared.status!==200)throw Error('actual original denial target '+prepared.status+' '+await prepared.text());const target=(await prepared.json()).targetToken;
 const response=await worker.fetch(new Request(base+(route==='deny'?'/api/admin/users/'+ID+'/deny':'/api/admin/applications/'+ID+'/status'),{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Olympus-Decision-Target':target,'X-Olympus-Decision-Action':'membership_rejection_v1'},body:JSON.stringify(route==='deny'?{reason:'Synthetic denial reason'}:{status:'declined',note:'Synthetic denial reason'})}),e,ctx);if(response.status!==200)throw Error('actual original denial '+response.status+' '+await response.text());
 await setupWrite('DELETE FROM site_users WHERE discord_id=?',OTHER);await setupWrite('DELETE FROM privacy_subjects WHERE subject_id=?',OTHER);
}
async function admission(originalSignedCookie=null){const cookie=originalSignedCookie??await originalCookie();return originalServingWork(env(),async(e,originalRequest)=>{const response=await authority.requestServingErasure(e,originalRequest,OP);if(response.status!==202)throw Error('genuine request not admitted '+response.status);return authority.readErasureProof(e,OP);},req(cookie));}
(async()=>{
 let t=reset();check('complete current profile and all registered source hooks qualify current shape',await originalServingWork(env(),async __originalEnv=>catalog.servingPrivacyCatalogCurrent(__originalEnv)));
 await originalDenial();clock=t+30;t=clock;(await setupWrite("INSERT INTO members(discord_id,username)VALUES(?,?)",ID,'Sensitive synthetic name'));(await setupWrite("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source,guid)VALUES(?,?,?,'member',?,'fixture',?)",'fixture name','Fixture Name',ID,t-40,'Player-0-00000001'));
 let proof=await admission(),started=attempts,out=await originalServingWork(env(),async __originalEnv=>eraser.continueServingErasure(__originalEnv,proof));console.log('Actual successful continuation SQL attempts:',attempts-started);if(out.state!=='complete')console.log('Synthetic completion hold:',JSON.stringify(out));check('actual original-cookieÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢central confirmed role absenceÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢registered local serving erase completes',out.state==='complete'&&out.servingAccountErased&&!raw('SELECT * FROM site_users')&&!raw('SELECT * FROM members')&&!raw('SELECT * FROM characters'));
 let marker=raw('SELECT * FROM privacy_denial_markers');check('denial marker keeps original denial+365d, no name/raw account ID, replay separate366d',marker.denied_at===t-30&&marker.retain_until===t-30+365*86400&&!JSON.stringify(marker).includes(ID)&&raw('SELECT retain_until-erased_at d FROM privacy_restore_replay').d===366*86400);
 check('completion never claims all copies erased; recovery custody remains explicit',out.allCopiesErased===false&&out.recoveryCopies==='operator-held'&&out.providerMessages==='unqualified');
 for(const phase of ['early','middle','audit','terminal']){reset();proof=await admission();const receipt=await originalServingWork(env(),async __originalEnv=>roles.settleAccountErasureMemberRole(__originalEnv,proof)),before=snapshot();hooks.beforeStatement=sql=>{if(phase==='early'&&sql.includes('privacy_completion_refused')||phase==='middle'&&sql.startsWith('DELETE FROM characters')||phase==='audit'&&sql.startsWith('DELETE FROM audit')||phase==='terminal'&&sql.includes('privacy_terminal_unconfirmed'))throw Error('synthetic native fault');};let originalHold=null;out=null;try{out=await originalServingWork(env(),async __originalEnv=>eraser.testOnlyLocalCompletion(__originalEnv,proof,receipt,roles.accountErasureRoleSettledSql));}catch(error){originalHold=error;}check('actual '+phase+' local-erasure failure rolls every registered table/control back',(out?.state==='unknown'||originalHold?.message==='recovery_floor_held')&&snapshot()===before);}
 reset();hasRole=true;loseDelete=true;proof=await admission();let heldWork=await observeOriginalServingWork(env(),async __originalEnv=>eraser.continueServingErasure(__originalEnv,proof));out=heldWork.value;check('lost landed member-role DELETE holds local erase with durable unknown dispatch',(heldWork.held||out?.state==='unknown')&&!!raw('SELECT * FROM site_users')&&raw('SELECT attempts,state FROM role_settlements').attempts===1);out=await originalServingWork(env(),async __originalEnv=>eraser.continueServingErasure(__originalEnv,proof));check('GET proves absence on retry, full local erase follows without a second DELETE',out.state==='complete'&&calls.filter(x=>x===`DELETE /api/v10/guilds/${GUILD}/members/${ID}/roles/${MEMBER}`).length===1);
 reset();proof=await admission();let receipt=await originalServingWork(env(),async __originalEnv=>roles.settleAccountErasureMemberRole(__originalEnv,proof));(await setupWrite("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?,?,'verified_membership',?,?,1,'unknown','fixture unknown',1,?,?)",'b'.repeat(32),ID,GUILD,MEMBER,t,t+300));let before=snapshot();heldWork=await observeOriginalServingWork(env(),async __originalEnv=>eraser.testOnlyLocalCompletion(__originalEnv,proof,receipt,roles.accountErasureRoleSettledSql));out=heldWork.value;check('actual QR eraser preserves sole unknown external dispatch and atomically holds local completion',(heldWork.held||out?.state==='unknown')&&snapshot()===before);
 reset();(await setupWrite("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)",ID,'c'.repeat(32),t,t));const capture=await originalServingWork(env(),async __originalEnv=>authority.readPrivacySubject(__originalEnv,ID)),bound=boundSubjectEnv(env(),ID,capture);afterPost=async()=>{proof=await admission();};const posted=await originalServingWork(bound,async __originalEnv=>messages.postPrivacyMessage(__originalEnv,'review',CHANNEL,{content:'Synthetic review'},[{subject:ID,capture}],OP));check('POST completing after request closure preserves known pointer and cleanup debt in purpose custody',posted.id===MSG&&raw('SELECT state,cleanup_requested FROM privacy_provider_messages').state==='known'&&raw('SELECT cleanup_requested FROM privacy_provider_messages').cleanup_requested===1);
 before=calls.length;const noReplay=await originalServingWork(env(),async __originalEnv=>messages.postPrivacyMessage(__originalEnv,'review',CHANNEL,{content:'Must never send'},[{subject:ID,capture}],OP));check('same original message operation or retired capture never sends again',noReplay===null&&calls.length===before);
 loseMessageDelete=true;await observeOriginalServingWork(env(),async __originalEnv=>messages.cleanupPrivacyMessages(__originalEnv,ID));check('lost landed message DELETE retains pointer/cleaning state',raw('SELECT state FROM privacy_provider_messages').state==='cleaning');await originalServingWork(env(),async __originalEnv=>messages.cleanupPrivacyMessages(__originalEnv,ID));check('known pointer cleanup reconciles by GET absence, no second DELETE and no retained subject references',raw('SELECT state,subjects FROM privacy_provider_messages').state==='removed'&&raw('SELECT subjects FROM privacy_provider_messages').subjects==='[]'&&calls.filter(x=>x===`DELETE /api/v10/channels/${CHANNEL}/messages/${MSG}`).length===1);
 check('all provider targets are fixed intended guild/member/role and bot message routes',calls.every(x=>x.includes(`/guilds/${GUILD}/`)||x.endsWith('/users/@me')||x.includes(`/channels/${CHANNEL}/messages`)));
 const jobs=load('privacy-serving-jobs');reset();started=attempts;let result=await originalServingWork({...offEnvironment(),DB:admitted},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check('automatic erasure OFF has zero database/provider work',result.attempted===0&&attempts===started&&calls.length===0);
 started=attempts;await originalServingWork({...offEnvironment(),DB:admitted},async __originalEnv=>messages.postPrivacyMessage(__originalEnv,'review',CHANNEL,{content:'Synthetic ordinary OFF notice'},[{subject:ID,capture:null}],OP));check('ordinary OFF message path creates no dormant provider ledger or database work',attempts===started&&!raw('SELECT * FROM privacy_provider_messages')&&calls.filter(x=>x==='POST /api/v10/channels/'+CHANNEL+'/messages').length===1);
 t=reset();(await setupWrite('UPDATE site_users SET last_login=? WHERE discord_id=?',t-authority.PRIVACY_YEAR-1,ID));started=attempts;result=await originalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));console.log('Actual inactive admission+automatic completion SQL:',attempts-started);check('actual source derives inactive purpose and automatically completes without a synthesized cookie',result.completed===1&&!raw('SELECT * FROM site_users')&&raw('SELECT original_session_expires FROM privacy_serving_jobs').original_session_expires===0);
 t=reset();(await setupWrite('UPDATE site_users SET last_login=? WHERE discord_id=?',t-authority.PRIVACY_YEAR-1,ID));hooks.afterRead=async sql=>{if(sql.includes('ORDER BY u.last_login')){hooks.afterRead=null;(await setupWrite('UPDATE site_users SET last_login=? WHERE discord_id=?',t,ID));}};before=snapshot();heldWork=await observeOriginalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));result=heldWork.value;check('activity during paused inactive selection refuses closure in the consuming batch',(heldWork.held||result?.attempted===0)&&!raw('SELECT * FROM privacy_serving_jobs')&&!raw('SELECT * FROM privacy_subjects')&&raw('SELECT last_login FROM site_users').last_login===t);
 t=reset();proof=await admission();for(let i=0;i<5;i++){(await setupWrite("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'review',?, ?,?,'known',1,?,?,?)",i.toString(16).repeat(32),JSON.stringify([{id:ID,g:proof.subjectGeneration}]),CHANNEL,MSG,t,t,t+authority.PRIVACY_REPLAY));const event=i.toString().repeat(22),op=(i+5).toString().repeat(22);(await setupWrite("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until)VALUES(?,?,'Synthetic event',?,60,?,?,?,?,?)",event,op,t+3600,t+7200,ID,t,t,t+authority.PRIVACY_REPLAY));(await setupWrite("INSERT INTO community_event_deliveries(event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,op_id,claim_nonce,state,actor,created_at,updated_at,retain_until)VALUES(?,'publication',1,?,?,?,?,?,?,'posted',?,?,?,?)",event,t+3600,GUILD,CHANNEL,MSG,op,'n'.repeat(22),ID,t,t,t+authority.PRIVACY_REPLAY));}
 for(const key of ['b','c'])(await setupWrite("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?,?,'verified_membership',?,?,1,'unknown','expired fixture',1,?,?)",key.repeat(32),ID,GUILD,MEMBER,t-400,t-100));
 started=attempts;result=await originalServingWork(env(),async __originalEnv=>jobs.runServingErasureJob(__originalEnv));const maxAttempts=attempts-started;console.log('Actual one-job/two-five-pointer/two-expired-role-debt SQL:',maxAttempts);console.log('Historical debt outcome:',JSON.stringify({result,roles:rows('SELECT purpose,state,attempts FROM role_settlements'),ledger:rows('SELECT state FROM privacy_provider_messages'),calls}));check('bounded automatic job preserves two historical unverifiable role debts and original account/pointers with GET-only work',result.attempted===1&&result.completed===0&&result.held===1&&maxAttempts<=load('scheduled-budget').ADMISSION_SCHEDULED_BUDGET.find(row=>row.job==='runServingErasureJob').worst&&rows("SELECT * FROM role_settlements WHERE purpose='verified_membership' AND state IN('held','unknown')").length===2&&!!raw('SELECT * FROM site_users WHERE discord_id=?',ID)&&rows("SELECT * FROM privacy_provider_messages WHERE state='known'").length===5&&calls.every(c=>c.startsWith('GET ')));
 t=reset();(await setupWrite('DELETE FROM site_users'));(await setupWrite('INSERT INTO members(discord_id,linked_at)VALUES(?,?)',ID,t-authority.PRIVACY_YEAR-1));started=attempts;result=await originalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));console.log('Actual accountless inactive job SQL:',attempts-started);check('dated accountless bot account uses native purpose admission and confirmed role absence before local erase',result.completed===1&&!raw('SELECT * FROM members')&&raw('SELECT original_session_expires FROM privacy_serving_jobs').original_session_expires===0);
 t=reset();(await setupWrite('DELETE FROM site_users'));(await setupWrite('INSERT INTO members(discord_id)VALUES(?)',ID));result=await originalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check('undated legacy accountless data is held rather than inventing historical activity',result.attempted===0&&!!raw('SELECT * FROM members')&&!raw('SELECT * FROM privacy_serving_jobs'));
 t=reset();(await setupWrite('DELETE FROM site_users'));(await setupWrite('INSERT INTO members(discord_id,linked_at)VALUES(?,?)',ID,t-authority.PRIVACY_YEAR-1));hooks.afterRead=async sql=>{if(sql.includes('ORDER BY activity_clock')){hooks.afterRead=null;(await setupWrite('UPDATE members SET linked_at=? WHERE discord_id=?',t,ID));}};heldWork=await observeOriginalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));result=heldWork.value;check('changed original accountless activity clock after selection atomically refuses retirement and job creation',(heldWork.held||result?.attempted===0)&&!raw('SELECT * FROM privacy_subjects')&&!raw('SELECT * FROM privacy_serving_jobs')&&!!raw('SELECT * FROM members'));
 t=reset();(await setupWrite("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'review',?, ?,?,'known',1,?,?,?)",OP,JSON.stringify([{id:ID,g:null}]),CHANNEL,MSG,t,t,t+authority.PRIVACY_REPLAY));result=await originalServingWork(env(),async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check('completed-account provider cleanup continues independently even without an open erasure job',result.attempted===0&&raw('SELECT state FROM privacy_provider_messages').state==='removed');
 // An accountless link's valid operational time survives the existing provider-specific purge.
 t=reset();(await setupWrite('DELETE FROM site_users'));const originalActivity=t-authority.PRIVACY_YEAR-1;(await setupWrite('INSERT INTO members(discord_id,battletag,linked_at)VALUES(?,?,?)',ID,'Synthetic#0000',originalActivity));await originalServingWork(env(),async __originalEnv=>load('bnet-retention').purgeBattleNetData(__originalEnv,t));check('Blizzard purge clears raw link/tag within29d and preserves only original non-provider activity time',raw('SELECT battletag,linked_at,activity_at FROM members').battletag===null&&raw('SELECT linked_at,activity_at FROM members').linked_at===null&&raw('SELECT activity_at FROM members').activity_at===originalActivity);result=await originalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check('BNet-only accountless account still reaches genuine365d automatic erasure after raw provider purge',result.completed===1&&!raw('SELECT * FROM members'));
 // Both automatic admissions consume the beta retention guard, not only a pre-read.
 for(const accountless of [false,true]){t=reset();if(accountless){(await setupWrite('DELETE FROM site_users'));(await setupWrite('INSERT INTO members(discord_id,activity_at)VALUES(?,?)',ID,t-authority.PRIVACY_YEAR-1));}else (await setupWrite('UPDATE site_users SET last_login=? WHERE discord_id=?',t-authority.PRIVACY_YEAR-1,ID));(await setupWrite('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at)VALUES(?,?,?,?,?)',ID,'beta fixture','Beta Fixture',t-authority.PRIVACY_YEAR-30,t-100));result=await originalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check((accountless?'accountless':'site')+' automatic inactivity cannot bypass unknown beta cutoff',result.attempted===0&&!raw('SELECT * FROM privacy_serving_jobs')&&!!raw('SELECT * FROM pending'));(await setupWrite('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','betaClosedAt',String(t-10),t));(await setupWrite('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','betaResetFor',JSON.stringify({closedAt:t-10}),t));result=await originalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check((accountless?'accountless':'site')+' recent confirmed beta cutoff keeps original records through fixed12-month minimum',result.attempted===0&&raw('SELECT created_at FROM pending').created_at===t-authority.PRIVACY_YEAR-30);}
 t=reset();(await setupWrite('UPDATE site_users SET last_login=? WHERE discord_id=?',t-authority.PRIVACY_YEAR-1,ID));hooks.afterRead=async sql=>{if(sql.includes('ORDER BY u.last_login')){hooks.afterRead=null;(await setupWrite('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at)VALUES(?,?,?,?,?)',ID,'raced beta','Raced Beta',t-authority.PRIVACY_YEAR-20,t-10));}};heldWork=await observeOriginalServingWork({...env(),PRIVACY_RETENTION_ENABLED:'true'},async __originalEnv=>jobs.runServingErasureJob(__originalEnv));result=heldWork.value;check('beta record created after inactive selection refuses the atomic retirement/job claim',(heldWork.held||result?.attempted===0)&&!raw('SELECT * FROM privacy_subjects')&&!raw('SELECT * FROM privacy_serving_jobs')&&!!raw('SELECT * FROM site_users'));
 // A genuinely later rejection replaces an expired slot; a live original clock is never renewed.
 for(const expiredMarker of [true,false]){t=reset();const markerCookie=await originalCookie(),key=await originalServingWork(env(),async __originalEnv=>authority.privacySubjectKey(__originalEnv,ID)),originalDenied=expiredMarker?t-authority.PRIVACY_YEAR-10:t-100;(await setupWrite("INSERT INTO privacy_denial_markers VALUES(?,?,?,'rejected_guild_application_or_membership')",key,originalDenied,originalDenied+authority.PRIVACY_YEAR));await originalDenial(false);clock=t+20;t=clock;proof=await admission(markerCookie);out=await originalServingWork(env(),async __originalEnv=>eraser.continueServingErasure(__originalEnv,proof));const fixed=raw('SELECT denied_at,retain_until FROM privacy_denial_markers');console.log('Original marker outcome:',JSON.stringify({expiredMarker,state:out.state,fixed,originalDenied,newRejectedAt:t-20}));check(expiredMarker?'expired marker slot consumes genuinely later rejection before cron without immediate bypass':'same-live rejection branch retains original deadline without retry renewal',out.state==='complete'&&fixed.denied_at===(expiredMarker?t-20:originalDenied)&&fixed.retain_until===fixed.denied_at+authority.PRIVACY_YEAR);}
 // Two consumers of one original job selection may not both enter its continuation.
 t=reset();proof=await admission();let competing=null;hooks.afterRead=async sql=>{if(sql.startsWith('SELECT operation_id AS operationId')&&sql.includes('last_attempt_at')){hooks.afterRead=null;competing=await originalServingWork(env(),async __originalEnv=>jobs.runServingErasureJob(__originalEnv));}};heldWork=await observeOriginalServingWork(env(),async __originalEnv=>jobs.runServingErasureJob(__originalEnv));result=heldWork.value;check('concurrent original selections admit at most one continuation and one terminal completion',competing?.completed===1&&(heldWork.held||result?.attempted===0)&&raw('SELECT COUNT(*)n FROM privacy_restore_replay').n===1);
 t=reset();proof=await admission();(await setupWrite('UPDATE privacy_serving_jobs SET created_at=?,retain_until=? WHERE operation_id=?',t-authority.PRIVACY_REPLAY,t,OP));started=calls.length;result=await originalServingWork(env(),async __originalEnv=>jobs.runServingErasureJob(__originalEnv));check('exact expired purpose deadline causes zero provider effect; unresolved job remains openly held',result.attempted===0&&calls.length===started&&!!raw('SELECT * FROM site_users')&&raw('SELECT state FROM privacy_subjects').state==='retiring');
 // Actual own-data exporter includes the minimized lifecycle controls in its admitted capture.
 t=reset();(await setupWrite("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,NULL,NULL)",t-31536000-10,ID,"bnet.external_custody"));(await setupWrite("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,completed_at,retain_until)VALUES(?,?,?, ?,7,0,'complete',?,?,?)",OP,ID,'b'.repeat(32),'c'.repeat(64),t,t,t+authority.PRIVACY_REPLAY));for(const [id,op]of[[ID,'d'.repeat(32)],[OTHER,'e'.repeat(32)]])(await setupWrite("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'review',?,?,?,'known',1,?,?,?)",op,JSON.stringify([{id,g:null}]),CHANNEL,MSG,t,t,t+authority.PRIVACY_REPLAY));const ownCookie=await originalCookie(),exportRequest=new Request('https://guild.example/api/me/export',{headers:{Cookie:ownCookie}}),exportResponse=await originalServingWork(env(),async(__originalEnv,originalRequest)=>load('site-export').exportMyData(originalRequest,__originalEnv,await core.currentUser(__originalEnv,originalRequest)),exportRequest),exportBody=await exportResponse.json(),wire=JSON.stringify(exportBody);check('actual own-data copy includes lifecycle control coverage without other accounts/provider pointers/proof digests',exportResponse.status===200&&exportBody.privacyLifecycle?.erasureRequests.rows.length===1&&exportBody.privacyLifecycle?.providerCleanup.rows.length===1&&!wire.includes(OTHER)&&!wire.includes(MSG)&&!wire.includes(CHANNEL)&&!wire.includes('c'.repeat(64))&&exportBody.privacyLifecycle.allCopiesErased===false);
 check('actual own-data copy projects the custody fact as original action/time without marker actor or payload',wire.includes('bnet.external_custody')&&!wire.includes('subjectGeneration')&&!wire.includes('BattleTag'));
 const roster=load('roster'),roleBudget=load('roles').callBudget;
 for(const replacePhysical of [false,true]){t=reset();const old='d'.repeat(32);(await setupWrite('INSERT INTO members(discord_id)VALUES(?)',ID));(await setupWrite("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)",ID,old,t,t));(await setupWrite("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at)VALUES(1,?,?,'fixture',1,1,1,?)",t,t,t));(await setupWrite("INSERT INTO roster_members(snapshot_id,name_key,name,guid)VALUES(1,'fixture name','Fixture Name','Player-0-00000001')"));(await setupWrite("INSERT INTO roster_effect_runs(id,snapshot_id,removals,created_at,derived_at,items)VALUES(1,1,0,?,?,1)",t,t));(await setupWrite("INSERT INTO roster_effects(run_id,seq,kind,name_key,name,discord_id,guid,subject_generation)VALUES(1,0,'promote','fixture name','Fixture Name',?,'Player-0-00000001',?)",ID,old));const selected=raw('SELECT 1 AS run,* FROM roster_effects');(await setupWrite("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source,guid)VALUES('fixture name','Fixture Name',?,'verified',?,'fixture','Player-0-00000001')",ID,t));
 // Actual signed request closes OLD. The explicit fixture retirement boundary models completed local
 // disposal before actual admitted OAuth creates NEW; no provider/removal completion is inferred here.
 await admission();(await setupWrite("UPDATE privacy_subjects SET state='retired',erased_at=?,retain_until=?+31622400 WHERE subject_id=?",t,t,ID));(await setupWrite("UPDATE privacy_serving_jobs SET state='complete',completed_at=? WHERE subject_id=?",t,ID));const retired=await originalServingWork(env(),async __originalEnv=>authority.readPrivacySubject(__originalEnv,ID));(clock=t+1,await originalCookie());if(replacePhysical)(await setupWrite('UPDATE roster_effects SET subject_generation=? WHERE run_id=1 AND seq=0',raw('SELECT generation FROM privacy_subjects').generation));before=snapshot();const callsBefore=calls.length,response=await originalServingWork(env(),async __originalEnv=>roster.testOnlyApplyEffect(__originalEnv,1,selected,'fixture-nonce',roleBudget(env()),{items:[]}));const businessUnchanged=JSON.stringify(JSON.parse(before).filter(v=>v[0]!=='privacy_write_admission'))===JSON.stringify(JSON.parse(snapshot()).filter(v=>v[0]!=='privacy_write_admission')),slot=raw('SELECT * FROM privacy_write_admission');check('selected roster generation '+(replacePhysical?'cannot adopt reused fresh physical item':'cannot consume after retiredÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢new OAuth')+'; no local/provider effects',response==='refused'&&businessUnchanged&&slot.active===0&&slot.nonce===''&&slot.purpose===''&&slot.mode==='serving'&&slot.epoch===EPOCH&&calls.length===callsBefore);}
 // Epoch installation is closed-source work; an ordinary schema check cannot repair an old profile.
 reset(true);db.exec('DROP INDEX community_restriction_cases_retain');db.exec('ALTER TABLE community_restriction_cases DROP COLUMN retain_until');db.exec('ALTER TABLE roster_effects DROP COLUMN subject_generation');const schema=load('schema');let schemaHolds=0,lastSchemaSQL='';hooks.beforeStatement=sql=>{lastSchemaSQL=sql;};const originalOldProfile=snapshot();for(let i=0;i<2;i++){schema.forgetSchemaCheck();try{await schema.ensureSchema(env());}catch(error){if(error instanceof load('privacy-write-admission').PrivacyWriteAdmissionHeld||error.message==='malformed JSON'&&lastSchemaSQL.includes('privacy_current_schema_requires_attended_setup'))schemaHolds++;else throw error;}}hooks.beforeStatement=null;check('actual runtime old-schema restriction/roster-generation/member-activity profile holds twice without implicit repair',schemaHolds===2&&snapshot()===originalOldProfile&&!rows('PRAGMA table_info(community_restriction_cases)').some(c=>c.name==='retain_until')&&!rows('PRAGMA table_info(roster_effects)').some(c=>c.name==='subject_generation')&&!rows('PRAGMA table_info(members)').some(c=>c.name==='activity_at'));
 check('all actually loaded source bytes stayed unchanged during qualification',Array.from(pins).every(([file,b])=>fs.readFileSync(file).equals(b)));
  reset();(await setupWrite("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,NULL,NULL)",t-31536000-10,ID,"bnet.external_custody"));proof=await admission();out=await originalServingWork(env(),async __originalEnv=>eraser.continueServingErasure(__originalEnv,proof));check('genuine admitted serving erasure removes its minimal Battle.net custody marker without provider-copy success claim',out.state==='complete'&&!raw("SELECT 1 FROM audit WHERE actor=? AND action='bnet.external_custody'",ID)&&out.allCopiesErased===false);
  // All original43 checks above remain unchanged and run before these additions.
  console.log('RETIRING_SERVING_FAMILY_ORIGINAL_TOTAL '+JSON.stringify({passes,checks}));
  check('supplementary original43 checks reached unchanged',checks===43&&passes===43);
  if (checks!==44 || passes!==44) throw Error('original serving integration checks did not qualify');
  await runRetiringReminderCase('before claim','before');
  await runRetiringReminderCase('after claim before POST','claimed');
  await runRetiringReminderCase('during POST','posted');
  retiringReminderProbe=null;
  check('supplementary source bytes unchanged after all original and added cases',Array.from(pins).every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));


  console.log('CENSUS_SERVING_ORIGINAL57_TOTAL '+JSON.stringify({passes,checks}));
  check('census additions retain all original57 checks',checks===57&&passes===57);
  if(checks!==58||passes!==58)throw Error('original57 serving checks did not qualify before census');
  const censusCheckStart=checks;
  await runCensusServingCase('feature-off','off');
  await runCensusServingCase('unconfirmed','unconfirmed');
  await runCensusServingCase('successful-preview','success');
  await runCensusServingCase('old-birth','old-birth');
  check('census source bytes unchanged after the original57 and all four request cases',Array.from(pins).every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
  console.log('CENSUS_SERVING_ADDITIVE_TOTAL '+JSON.stringify({originalChecks:57,guardChecks:1,additionalChecks:checks-censusCheckStart,passes,checks}));

console.log(`${passes}/${checks} actual privacy/role/message integration checks passed; no real accounts/provider effects`);db.close();if(passes!==checks)process.exitCode=1;
})().catch(e=>{console.error('privacy integration stopped:',e.stack);process.exitCode=1;});
