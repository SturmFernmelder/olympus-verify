// Probe (Claude review, label treasury-tithe). Actual candidate source, Native SQLite fixture, mocked Discord only.
// Proposed regression leaf: later safe parents must progress without spending blocked custody.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const base=path.join(__dirname,'..'),entry=require(path.join(base,'tests','helpers','privacy129_fixture.cjs')),cache=new Map();
let T=1792760000;const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[T*1000]));}static now(){return T*1000;}};
const GUILD='300000000000000001',APP='1550176895671341076',MEMBER='300000000000000081',BOTROLE='300000000000000091',COSMETIC='300000000000000101';
const LIVE='300000000000000500';
let network=async()=>{throw Error('unexpected');},calls=[];
globalThis.fetch=async(input,init={})=>{const url=new URL(String(input));if(url.origin!=='https://discord.com')throw Error('outbound refused');calls.push({method:init.method||'GET',path:url.pathname});return network(url,init);};
function load(name){if(name==='node:async_hooks')return require(name);const file=path.join(base,'src',name.replace(/^\.\//,'')+'.ts');if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports,p=>load(p));return mod.exports;}
const admission=load('./privacy-write-admission'),settlements=load('./role-settlements');
const answer=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function run(scenario){
 calls=[];const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.function('strftime',(f,i)=>{if(f!=='%s'||i!=='now')throw Error('unexpected clock');return String(T);});entry.installCurrentEntryEpoch(db,{now:T});
 const raw=entry.originalNativePort(db,{});const DB=admission.createPrivacyWriteAdmissionDatabase(raw,'writer','canonical',entry.ENTRY_EPOCH),write=(sql,...p)=>DB.prepare(sql).bind(...p).run();
 const env=entry.currentEntryEnvironment({DB,COOKIE_SECRET:'probe-only-cookie-secret-0123456789abcdef',VERIFY_SECRET:'probe-only-verify-secret-0123456789abcdef',DISCORD_BOT_TOKEN:'fixture-only',DISCORD_APP_ID:APP,SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,ROLE_GUILD_MEMBER:MEMBER,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true'});
 const held=new Map([[LIVE,new Set([MEMBER,COSMETIC])]]);const departed=new Set();
 // Expired acknowledged season grants. Ids order the selection (same expires_at = season end).
 const parent=async(id,subject)=>write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at,checked_at)VALUES(?,?,'treasury_cosmetic',?,?,1,'settled','treasury_effect_acknowledged',1,?,?,?,?)",id,subject,GUILD,COSMETIC,'2'.repeat(32),T-86400,T-1,T-86400);
 if(scenario==='unknown_sibling'||scenario==='dispatching_sibling'||scenario==='unattributed_unknown_expiry'||scenario==='unexpired_successor'){
  const A='300000000000000400';held.set(A,new Set([MEMBER,COSMETIC]));await parent('0'.repeat(31)+'1',A);
  // An admin-confirmed removal of the same role whose DELETE answer was lost (exactly what settleTreasuryCosmeticRole records).
  await write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at,checked_at)VALUES(?,?,?,?,?,?,?,?,1,?,?,?,NULL)",'0'.repeat(31)+'2',A,scenario==='unattributed_unknown_expiry'?'treasury_cosmetic_expiry':'treasury_cosmetic',GUILD,COSMETIC,scenario==='unexpired_successor'?1:0,scenario==='dispatching_sibling'?'dispatching':scenario==='unexpired_successor'?'settled':'unknown',scenario==='unexpired_successor'?'treasury_effect_acknowledged':'treasury_provider_outcome_unknown','3'.repeat(32),T-7200,scenario==='unexpired_successor'?T+90*86400:T-7000);
 }
 if(scenario==='departed_members'){for(let i=1;i<=4;i++){const s='30000000000000040'+i;departed.add(s);await parent('0'.repeat(31)+i,s);}}
 await parent('f'.repeat(32),LIVE);
 network=async(url,init)=>{const route=url.pathname.slice('/api/v10'.length),method=init.method||'GET';
  if(method==='DELETE'){const parts=route.split('/');const subject=parts[4],role=parts[6];held.get(subject)?.delete(role);return answer(null,204);}
  if(method!=='GET')throw Error('unexpected effect');
  if(route==='/users/@me')return answer({id:APP,bot:true});
  if(route===`/guilds/${GUILD}/roles`)return answer([{id:GUILD,name:'@everyone',position:0,permissions:'0',managed:false},{id:MEMBER,name:'Guild Member',position:1,permissions:'0',managed:false},{id:COSMETIC,name:'Tithe Payer',position:2,permissions:'0',managed:false,hoist:false,mentionable:false},{id:BOTROLE,name:'Bot',position:100,permissions:'268435456',managed:true}]);
  if(route===`/guilds/${GUILD}/channels`)return answer([]);
  if(route===`/guilds/${GUILD}/members/${APP}`)return answer({user:{id:APP,bot:true},roles:[BOTROLE]});
  if(route===`/guilds/${GUILD}`)return answer({id:GUILD,owner_id:'300000000000000099'});
  const m=/^\/guilds\/\d+\/members\/(\d+)$/.exec(route);if(m){if(departed.has(m[1]))return answer({message:'Unknown Member',code:10007},404);return answer({user:{id:m[1]},roles:[...(held.get(m[1])||[])],pending:false});}
  throw Error('unexpected path '+route);};
 const log=[];
 for(let i=0;i<96;i++){ // 24 hours of */15 cron runs
  const physicalBefore=raw.nativeGroups.flat().length,providerBefore=calls.length;const r=await settlements.expireTreasuryCosmeticRoles(env,{sqlRemaining:settlements.TREASURY_EXPIRY_SQL_MAX,calls:{limit:8,attempts:0,retries:0}});
  if(raw.nativeGroups.flat().length-physicalBefore>64||calls.length-providerBefore>8)throw Error('Original64SQL8HTTP reservation exceeded');log.push({run:i,state:r.state,reason:r.reason,operation:r.operationId??r.id??null});T+=900;
 }
 const blockedState=scenario==='unknown_sibling'||scenario==='dispatching_sibling'||scenario==='unattributed_unknown_expiry'?db.prepare('SELECT state,attempts FROM role_settlements WHERE id=?').get('0'.repeat(31)+'2'):null;
 if(blockedState&&(blockedState.attempts!==1||blockedState.state!==(scenario==='dispatching_sibling'?'dispatching':'unknown')))throw Error('Blocked original custody was changed');
 const liveStillHeld=held.get(LIVE).has(COSMETIC),liveChild=db.prepare("SELECT state,reason FROM role_settlements WHERE purpose='treasury_cosmetic_expiry' AND request_digest=?").get('f'.repeat(32))??null;
 const reasons={};for(const l of log)reasons[l.reason]=(reasons[l.reason]||0)+1;
 const out={scenario,runs:log.length,simulatedHours:24,liveMemberRoleStillHeldAfter24h:liveStillHeld,liveExpiryChild:liveChild,deleteCalls:calls.filter(c=>c.method==='DELETE').length,totalProviderCalls:calls.length,reasonCounts:reasons,first5:log.slice(0,5)};
 console.log('PROBE_RESULT '+JSON.stringify(out));db.close();return out;
}
(async()=>{for(const scenario of ['control','unknown_sibling','dispatching_sibling','unattributed_unknown_expiry','unexpired_successor','departed_members']){const out=await run(scenario);if(out.liveMemberRoleStillHeldAfter24h||out.deleteCalls!==1)throw Error('Later eligible expiry starved or blocked original custody dispatched: '+scenario);}console.log('PASS six fair-expiry scenarios preserve blocked custody and reach one later valid parent; original64SQL/8HTTP held');})().catch(e=>{console.error(e);process.exitCode=1;});
