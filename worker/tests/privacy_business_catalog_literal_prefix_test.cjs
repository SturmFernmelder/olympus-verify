"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:crypto.webcrypto});
const ROOT=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const CANDIDATE=fs.readFileSync(path.join(ROOT,'src/privacy-business-catalog.ts')),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),PINS=new Map(),rows=[],failures=[];
const FROM="name NOT LIKE 'sqlite_%'",TO="substr(lower(name),1,7)<>'sqlite_'";
if(CANDIDATE.toString('utf8').split(TO).length!==2)throw Error('finite catalogue predicate changed');
const PREDECESSOR=CANDIDATE.toString('utf8').replace(TO,FROM);
if(hash(Buffer.from(PREDECESSOR))!=='3d9f4a84413f195b4a8f91948dc520f6eea705449a946949fb6d1b2fd3a72afd')throw Error('exact frozen catalogue predecessor changed');
let checks=0,providerCalls=0;globalThis.fetch=async()=>{providerCalls++;throw Error('unexpected provider fetch in metadata-only catalogue fixture');};
function equal(a,b,label){checks++;assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),label);}
function check(v,label){checks++;assert.ok(v,label);}
function original(relative){if(!PINS.has(relative)){const b=fs.readFileSync(path.join(ROOT,relative.replace(/^worker\//,'')));PINS.set(relative,{bytes:b.length,sha256:hash(b),text:b.toString('utf8')});}return PINS.get(relative).text;}
const schema=original('worker/schema.sql');
function graph(candidate){const cache={};function load(name){if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;const relative='worker/src/'+name.replace(/^\.\//,'')+'.ts';const text=relative==='worker/src/privacy-business-catalog.ts'?(candidate?original(relative):PREDECESSOR):original(relative);const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',code)(m,m.exports,load);return m.exports;}load('./index');return {load,modules:Object.keys(cache).sort()};}
function fresh(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schema);return db;}
function d1(db,trace){const prepare=sql=>{let params=[];const q={bind(...p){params=p;return q;},async all(){trace.push({sql,bindings:params.length});return {results:db.prepare(sql).all(...params)};},async first(){trace.push({sql,bindings:params.length});return db.prepare(sql).get(...params)??null;},async run(){throw Error('native catalogue fixture refuses all source writes');}};return q;};return {prepare,async batch(){throw Error('native catalogue fixture refuses batched writes/reads outside scoped metadata probe');}};}
function nativeCount(db){return Number(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV'").get().n);}
async function scenario(name,fn){const before=checks;try{rows.push({name,status:'PASS',checks:0,...await fn(),checks:checks-before});}catch(e){failures.push({name,error:String(e),stack:e.stack});rows.push({name,status:'FAIL',checks:checks-before,error:String(e)});}}
async function main(){
 const baseline=graph(false),candidate=graph(true);equal(candidate.modules,baseline.modules,'actual source entry graph topology unchanged');
 const actualFamilies=baseline.load('./community-context').communityDataNames();equal(actualFamilies.length,12,'actual index registered12 families');equal(candidate.load('./community-context').communityDataNames(),actualFamilies,'same real family graph');
 await scenario('actual-full-entry-graph-canonical65-positive',async()=>{
  for(const [name,g]of[['baseline',baseline],['candidate',candidate]]){const db=fresh(),trace=[],env={DB:d1(db,trace)};equal(nativeCount(db),65,'canonical exact65 stores');const current=await g.load('./privacy-business-catalog').servingPrivacyCatalogCurrent(env);equal(current,true,'real catalogue recognizes full current graph');equal(trace.length,1,'one actual native metadata query');check(trace[0].sql.includes('AS MATERIALIZED'),'provider exclusion before table_info remains materialized');equal(trace[0].bindings,0,'no new source bindings');db.close();}
  return {tables:65,realRegistryFamilies:actualFamilies,queriesPerCall:1,mutations:0};
 });
 await scenario('actual-production-prefix-counterexample-then-candidate-refusal',async()=>{
  const names=['sqliteX_private','SQLiteX_private','SQLITEX_private','sqlitePrivateX','sqlite0_private','sys_private'];const results=[];
  for(const name of names){const db=fresh(),oldTrace=[],newTrace=[];db.exec(`CREATE TABLE "${name}"(id TEXT)`);equal(nativeCount(db),66,'legal noninternal store grows actual census66');
   const oldCurrent=await baseline.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,oldTrace)});const newCurrent=await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,newTrace)});
   equal(newCurrent,false,'successor holds exact unknown store');equal(oldTrace.length,1,'actual baseline one consuming query');equal(newTrace.length,1,'actual successor same one query');
   if(name.startsWith('sqlite')||name.startsWith('SQLite')||name.startsWith('SQLITE'))equal(oldCurrent,true,'frozen actual source wrongly accepts LIKE wildcard-hidden legal store');else equal(oldCurrent,false,'ordinary unrelated sys unknown was already refused');
   equal(db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get().n,0,'probe does not populate unknown store');results.push({name,exactStores:66,baselineCurrent:oldCurrent,candidateCurrent:newCurrent,mutationStatements:0});db.close();
  }return {cases:results,providerCalls:0};
 });
 await scenario('actual-internals-and-exact-provider-exclusion-positive',async()=>{
  const db=fresh(),trace=[];check(db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()?.name==='sqlite_sequence','actual native SQLite internal table exists');
  equal(await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace)}),true,'real internal does not inflate65');
  db.exec('CREATE TABLE _cf_KV(provider_only TEXT)');equal(nativeCount(db),65,'only exact provider internal excluded');equal(await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace)}),true,'actual provider internal name ignored before pragma');
  db.exec('CREATE TABLE _cf_other(id TEXT)');equal(nativeCount(db),66,'provider lookalike counted');equal(await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace)}),false,'no broad provider prefix exemption');
  for(const name of['sqlite_private','SQLite_private']){let error;try{db.exec(`CREATE TABLE "${name}"(id TEXT)`);}catch(e){error=String(e.message);}check(error?.includes('reserved for internal use'),'SQLite native literal reserved prefix cannot be user-created');}
  check(trace.every(s=>s.sql.includes("substr(lower(name),1,7)<>'sqlite_'")),'actual safe literal predicate on all reads');check(trace.every(s=>s.sql.includes("name<>'_cf_KV'")),'exact provider name maintained');db.close();return {actualInternal:'sqlite_sequence',exactProvider:'_cf_KV',unqualifiedProviderIntrospection:false,sourceQueries:trace.length};
 });
 await scenario('actual65-column-census-rejects-extra-missing-store-fields',async()=>{
  const modifications=[db=>db.exec('CREATE TABLE ordinary_unknown(id TEXT)'),db=>db.exec('ALTER TABLE members ADD COLUMN unknown_field TEXT'),db=>db.exec('DROP TABLE site_settings')];
  for(const modify of modifications){const db=fresh(),trace=[];modify(db);equal(await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace)}),false,'unknown store/column/missing store remains held');equal(trace.length,1,'unchanged bounded metadata query');db.close();}return {cases:3,additionalSQL:0};
 });
 await scenario('anonymous-member-directory-profile-search-boundary-unchanged',async()=>{
  const observations=[];
  for(const [variant,g]of[['baseline',baseline],['candidate',candidate]]){const db=fresh(),trace=[],env={DB:d1(db,trace),SITE_HOST:'olympus.roachcouncil.com',COMMUNITY_FEATURES:'directory,crafting',COOKIE_SECRET:'synthetic-native-fixture-only'};
   const ctxModule=g.load('./community-context'),directory=g.load('./community-directory');
   for(const [fn,route]of[['profileGet','profile'],['directoryList','directory'],['craftingSearch','crafting/search']]){const request=new Request('https://olympus.roachcouncil.com/api/community/'+route),ctx=await ctxModule.communityContext(env,request);equal(ctx.subject,null,'actual request context has no anonymous subject');
    const response=await directory[fn](request,env,ctx),body=await response.json();equal(response.status,401,'anonymous member payload refused');equal(body.error,'signed_out','existing refusal semantics');observations.push({variant,fn,status:response.status,error:body.error});}
   equal(trace.length,0,'anonymous directory/profile/search performs no payload DB reads or writes');db.close();
  }return {routes:observations,positiveMemberProfileAcceptance:false,memberAdmissionUnchangedBySourceParity:true,queries:0};
 });
 const predecessor=PREDECESSOR,before=FROM,after=TO;
 equal(predecessor.split(before).length-1,1,'only one production wildcard occurrence');equal(CANDIDATE.toString('utf8').replace(after,before),predecessor,'reverse replacement restores entire original14439 raw bytes');
 for(const [relative,p]of PINS){const b=fs.readFileSync(path.join(ROOT,relative.replace(/^worker\//,'')));equal(b.length,p.bytes,'source bytes stable');equal(hash(b),p.sha256,'source hash stable');}
 equal(providerCalls,0,'actual import and scoped tests issue no provider requests');
 const report={schema:'olympus-serving-catalogue-literal-prefix-native-author-v1',sourceWorker:ROOT,predecessorCatalogueSHA256:hash(Buffer.from(PREDECESSOR)),runtime:{node:process.version,sqlite:new DatabaseSync(':memory:').prepare('SELECT sqlite_version() v').get().v},candidate:{bytes:CANDIDATE.length,sha256:hash(CANDIDATE)},sourcePins:[...PINS].map(([relative,{bytes,sha256}])=>({relative,bytes,sha256})),entryGraph:{entry:'index.ts',modules:baseline.modules,actualFamilies},checks,scenarios:rows,failures,effects:{productionSourceEdits:false,privateData:false,databaseFiles:0,providerCalls,actualAccountWrites:0,activation:false},limits:['Only catalogue classification predicate changed. This is not full erasure, generation transport, schedule, provider transition or activation qualification.','Anonymous directory/profile/search is a refusal compatibility probe; no positive logged-in profile or ordinary OAuth acceptance claimed.','Native memory metadata cannot qualify protected Cloudflare provider internals; exact _cf_KV omission only.','Table/column-set catalogue retains established constraint/column-order semantics; this fix does not add new all-store column ownership or constraint assertions.']};
 let out=null;if(process.env.CATALOGUE_OUTPUT_DIR){out=path.join(process.env.CATALOGUE_OUTPUT_DIR,'native-observations-v1.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify({checks,failed:failures.length,scenarios:rows.length,sourcePins:PINS.size,actualFamilies:actualFamilies.length,observations:out},null,2));
 console.log((checks-failures.length)+'/'+checks+' literal business catalogue checks passed');
 if(failures.length){for(const f of failures)console.error(f.name+' '+f.error);process.exitCode=1;}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
