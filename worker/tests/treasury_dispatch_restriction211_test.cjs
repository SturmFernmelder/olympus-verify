// SOURCE-ONLY proposed finite restriction controls; never run during authoring.
if(process.env.PRIVACY134_QR_SOURCE)throw Error('external source override refused for restriction210');
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
// New finite cases below reuse the unchanged35-line setup of the existing
// privacy_serving_integration_test.cjs, copied literally ahead of this body.
// Its independent Native SQLite floor has an explicit test-only managed-open
// bootstrap. This is source-level fixture evidence, never production authority.
const COSMETIC210='300000000000000777';
const originalParent210='7'.repeat(32);
async function providerFixture(url,init={}){
 const method=init.method||'GET',p=new URL(url).pathname;calls.push(method+' '+p);
 if(!String(url).startsWith('https://discord.com/api/v10/'))throw Error('unexpected synthetic provider target');
 if(method==='DELETE'&&p===`/api/v10/guilds/${GUILD}/members/${ID}/roles/${COSMETIC210}`){hasRole=false;return new Response(null,{status:204});}
 if(method!=='GET')throw Error('unexpected synthetic provider effect');
 let value;
 if(p==='/api/v10/users/@me')value={id:BOT,bot:true};
 else if(p===`/api/v10/guilds/${GUILD}/roles`)value=[{id:GUILD,name:'@everyone',position:0,permissions:'0',managed:false},{id:MEMBER,name:'Guild Member',position:1,permissions:'0',managed:false},{id:COSMETIC210,name:'Historical cosmetic',position:2,permissions:'0',managed:false,hoist:false,mentionable:false},{id:BOTROLE,name:'Bot',position:100,permissions:'268435456',managed:true}];
 else if(p===`/api/v10/guilds/${GUILD}/channels`)value=[];
 else if(p===`/api/v10/guilds/${GUILD}/members/${BOT}`)value={user:{id:BOT,bot:true},roles:[BOTROLE]};
 else if(p===`/api/v10/guilds/${GUILD}/members/${ID}`)value={user:{id:ID},roles:[MEMBER,...(hasRole?[COSMETIC210]:[])],pending:false};
 else if(p===`/api/v10/guilds/${GUILD}`)value={id:GUILD,owner_id:OTHER};
 else throw Error('unexpected synthetic provider read '+p);
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
}
async function seedExpiry210(){
 reset();await ready();hasRole=true;
 await setupWrite("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at,checked_at)VALUES(?,?,'treasury_cosmetic',?,?,1,'settled','treasury_effect_acknowledged',1,?,?,?,?)",originalParent210,ID,GUILD,COSMETIC210,'8'.repeat(32),clock-86400,clock-1,clock-86400);
 return JSON.stringify(raw('SELECT * FROM role_settlements WHERE id=?',originalParent210));
}
(async()=>{
 const global210=load('privacy-global-serving-origin'),discord210=load('discord'),settlements210=load('role-settlements');
 for(const phase of ['direct','owned'])for(const [name,restriction]of[
  ['absent',undefined],['synchronous void',()=>undefined],['async function',async()=>undefined],
  ['Promise result',()=>Promise.resolve(undefined)],['thenable result',()=>({get then(){throw Error('must not inspect thenable');}})],
  ['nonvoid result',()=>true],['null callback',null],['string callback','invalid']
 ]){
  reset();let refused=false;const permitted=name==='absent'||name==='synchronous void';
  const invoke=()=>discord210.credentialFetch('https://discord.com/api/v10/users/@me',{method:'GET'},restriction);
  try{if(phase==='owned')await originalServingWork(env(),invoke);else await invoke();}catch{refused=true;}
  check('.211 '+phase+' '+name+' restriction permits only absent/synchronous-void before native dispatch',permitted?!refused&&calls.length===1:refused&&calls.length===0);
 }
 for(const phase of ['valid-cosmetic','marker-after-child-claim']){
  const parent=await seedExpiry210(),space=env().PRIVACY_RECOVERY_FLOOR,stub=space.get(space.idFromName(load('privacy-recovery-floor').RECOVERY_FLOOR_NAME)),originalFetch=stub.fetch;
  let target=null,providerClaims=0,changed=false;
  // Install this observation before genuine entry/client capture. It changes
  // only the later copied business environment, after the accepted child ACK.
  stub.fetch=async function(request){
   const body=request.method==='POST'?await request.clone().json():null;
   const response=await Reflect.apply(originalFetch,this,[request]);
   if(new URL(request.url).pathname==='/v1/serving/claim'&&body?.purpose==='provider'&&body.parentTicket!==null){
    providerClaims++;
    if(phase==='marker-after-child-claim'&&providerClaims===7){if(!target)throw Error('missing original expiry environment');await Promise.resolve();target.LINK_ROLE_ID=COSMETIC210;changed=true;}
   }
   return response;
  };
  const observed=await observeOriginalServingWork(env(),async current=>{
   target=current;if('TREASURY_COSMETIC_ROLES'in current||'TREASURY_COSMETIC_ENABLED'in current)throw Error('grant config must remain absent');
   return settlements210.expireTreasuryCosmeticRoles(current,{sqlRemaining:settlements210.TREASURY_EXPIRY_SQL_MAX,calls:{limit:8,attempts:0,retries:0}});
  });
  const child=raw("SELECT state,attempts FROM role_settlements WHERE purpose='treasury_cosmetic_expiry' AND request_digest=?",originalParent210),deletes=calls.filter(call=>call.startsWith('DELETE ')).length;
  check('.211 '+phase+' preserves exact original grant custody',JSON.stringify(raw('SELECT * FROM role_settlements WHERE id=?',originalParent210))===parent);
  if(phase==='valid-cosmetic')check('.211 absent Treasury grant config still permits one genuine owned synthetic cleanup',!observed.held&&observed.value.state==='settled'&&child.state==='settled'&&child.attempts===1&&!hasRole&&deletes===1&&providerClaims===8&&calls.length===8);
  else{
   check('.211 mapping change inside the awaited provider-child claim cannot reach native DELETE',changed&&observed.held&&child.state==='unknown'&&child.attempts===1&&hasRole&&deletes===0&&providerClaims===7&&calls.length===6);
   const spent=JSON.stringify(child),before=calls.length;
   await observeOriginalServingWork(env(),current=>settlements210.expireTreasuryCosmeticRoles(current,{sqlRemaining:settlements210.TREASURY_EXPIRY_SQL_MAX,calls:{limit:8,attempts:0,retries:0}}));
   check('.211 a rejected late restriction leaves the spent original unknown without retry or silent cancellation',calls.length===before&&hasRole&&JSON.stringify(raw("SELECT state,attempts FROM role_settlements WHERE purpose='treasury_cosmetic_expiry' AND request_digest=?",originalParent210))===spent);
  }
 }
 for(const [file,bytes]of pins)if(!fs.readFileSync(file).equals(bytes))throw Error('source changed during the synthetic fixture');
 console.log(`${passes}/${checks} Treasury restriction fixture checks; zero real provider effects`);
 db?.close();doDb?.close();if(passes!==checks)process.exitCode=1;
})().catch(error=>{console.error(error);db?.close();doDb?.close();process.exitCode=1;});
