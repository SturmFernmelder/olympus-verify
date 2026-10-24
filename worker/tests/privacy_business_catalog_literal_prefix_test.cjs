"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:crypto.webcrypto});
const ROOT=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const CANDIDATE=fs.readFileSync(path.join(ROOT,'src/privacy-business-catalog.ts')),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),PINS=new Map(),rows=[],failures=[];
const FROM="name NOT LIKE 'sqlite_%'",TO="substr(lower(name),1,7)<>'sqlite_'";
if(CANDIDATE.toString('utf8').split(TO).length!==2)throw Error('finite catalogue predicate changed');
const PREDECESSOR=CANDIDATE.toString('utf8').replace(TO,FROM);
// This original pin remains historical. PREDECESSOR below is the current graph's
// exact one-predicate counterfactual, not execution of that frozen predecessor.
const HISTORICAL_PREDECESSOR_SHA256='689648559fdd800fa41d59c789c96525e7eed3e3aee4f30f76e39bb11f17b3f7';
let checks=0,providerCalls=0;globalThis.fetch=async()=>{providerCalls++;throw Error('unexpected provider fetch in metadata-only catalogue fixture');};
function equal(a,b,label){checks++;assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),label);}
function check(v,label){checks++;assert.ok(v,label);}
function original(relative){if(!PINS.has(relative)){const b=fs.readFileSync(path.join(ROOT,relative.replace(/^worker\//,'')));PINS.set(relative,{bytes:b.length,sha256:hash(b),text:b.toString('utf8')});}return PINS.get(relative).text;}
const schema=original('worker/schema.sql');
const H=require(path.join(ROOT,'tests/helpers/privacy129_fixture.cjs'));
for(const relative of ['tests/helpers/privacy129_fixture.cjs','scripts/install-rejection-provenance-epoch.cjs','schema/rejection-provenance-next-profile-v1.json','schema/rejection-provenance-next-epoch.sql'])original('worker/'+relative);
function graph(candidate){const cache={};function load(name){if(name.startsWith('node:'))return require(name);if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;const relative='worker/src/'+name.replace(/^\.\//,'')+'.ts';const text=relative==='worker/src/privacy-business-catalog.ts'?(candidate?original(relative):PREDECESSOR):original(relative);const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',code)(m,m.exports,load);return m.exports;}load('./index');return {load,modules:Object.keys(cache).sort()};}
function fresh(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');H.installCurrentEntryEpoch(db);return db;}
function d1(db,trace,g){const native=H.originalNativePort(db,{statement(sql,params){trace.push({sql,bindings:params.length});if(!/^\s*(SELECT|WITH)\b/i.test(sql))throw Error('native catalogue fixture refuses all source writes');}});return g.load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(native,'writer','canonical',H.ENTRY_EPOCH);}
const metadataReads=trace=>trace.filter(row=>row.sql.startsWith('WITH business AS MATERIALIZED(SELECT name FROM sqlite_master'));
let actualMetadataSQL=null,counterfactualMetadataSQL=null;
async function currentProfileRefuses(g,db,trace,missingSettings=false){
 const before=db.prepare('SELECT total_changes() n').get().n;let caught=null;
 try{await g.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace,g)});}catch(error){caught=error;}
 if(missingSettings)console.log('CURRENT_PROFILE_DROP_REFUSAL '+JSON.stringify({case:'DROP TABLE site_settings',error:caught?{name:String(caught.name).slice(0,64),code:String(caught.code).slice(0,64),message:String(caught.message).slice(0,160)}:null,traceLength:trace.length,proofSQLSHA256:trace[0]?hash(Buffer.from(trace[0].sql)):null,originalSchemaMarker:trace[0]?.sql.includes('privacy_current_schema_requires_attended_setup')===true,metadataDispatches:metadataReads(trace).length}));
 check(caught?.code==='ERR_SQLITE_ERROR'&&(missingSettings?caught.message==='no such table: site_settings':String(caught.message).includes('malformed JSON')),missingSettings?'original Native schema proof prepare refuses missing site_settings':'original current schema proof refuses changed profile');
 equal(trace.length,1,'one actual schema-proof attempt, no metadata dispatch');
 check(trace[0].sql.includes('privacy_current_schema_requires_attended_setup'),'refusal is the original current-schema guard');
 equal(metadataReads(trace).length,0,'later catalogue predicate not reached through original facade');
 equal(db.prepare('SELECT total_changes() n').get().n,before,'refused source probe makes no native mutation');
}
function nativeCount(db){return Number(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV'").get().n);}
async function scenario(name,fn){const before=checks;try{rows.push({name,status:'PASS',checks:0,...await fn(),checks:checks-before});}catch(e){failures.push({name,error:String(e),stack:e.stack});rows.push({name,status:'FAIL',checks:checks-before,error:String(e)});}}
async function main(){
 await require(path.join(ROOT,'tests/privacy_registered196_families.cjs')).run(ROOT);
 const baseline=graph(false),candidate=graph(true);equal(candidate.modules,baseline.modules,'actual source entry graph topology unchanged');
 const actualFamilies=baseline.load('./community-context').communityDataNames();equal(actualFamilies.length,15,'actual index original13 plus exact2 independently proven families');equal(candidate.load('./community-context').communityDataNames(),actualFamilies,'same real family graph');
 await scenario('actual-full-entry-graph-current-canonical70-positive',async()=>{
  for(const [name,g]of[['baseline',baseline],['candidate',candidate]]){const db=fresh(),trace=[],env={DB:d1(db,trace,g)};equal(nativeCount(db),70,'current canonical exact70 stores');const current=await g.load('./privacy-business-catalog').servingPrivacyCatalogCurrent(env);equal(current,true,'real catalogue recognizes full current graph');equal(trace.length,2,'one original schema proof plus one actual native metadata query');const metadata=metadataReads(trace);equal(metadata.length,1,'one metadata query after original admission proof');check(metadata[0].sql.includes('AS MATERIALIZED'),'provider exclusion before table_info remains materialized');equal(metadata[0].bindings,0,'no new metadata bindings');if(name==='candidate')actualMetadataSQL=metadata[0].sql;else counterfactualMetadataSQL=metadata[0].sql;db.close();}
  return {tables:70,realRegistryFamilies:actualFamilies,physicalQueriesPerCall:2,metadataQueriesPerCall:1,mutations:0};
 });
 await scenario('actual-production-prefix-counterexample-then-candidate-refusal',async()=>{
  const names=['sqliteX_private','SQLiteX_private','SQLITEX_private','sqlitePrivateX','sqlite0_private','sys_private'];const results=[];
  for(const name of names){const db=fresh(),oldTrace=[],newTrace=[];db.exec(`CREATE TABLE "${name}"(id TEXT)`);equal(nativeCount(db),71,'legal noninternal store grows actual census71');
   await currentProfileRefuses(baseline,db,oldTrace);await currentProfileRefuses(candidate,db,newTrace);
   // The real facade refused above. Separately replay its previously observed,
   // unmodified metadata SQL as read-only Native SQL to isolate prefix semantics.
   check(typeof actualMetadataSQL==='string'&&typeof counterfactualMetadataSQL==='string','both metadata statements were observed from genuine admitted positive calls');
   const actualRows=db.prepare(actualMetadataSQL).all(),counterfactualRows=db.prepare(counterfactualMetadataSQL).all(),actualVisible=actualRows.some(row=>row.table_name===name),counterfactualVisible=counterfactualRows.some(row=>row.table_name===name);
   equal(actualVisible,true,'observed actual metadata SQL counts the legal unknown store');
   if(name.startsWith('sqlite')||name.startsWith('SQLite')||name.startsWith('SQLITE'))equal(counterfactualVisible,false,'observed one-predicate LIKE counterfactual hides the legal store');else equal(counterfactualVisible,true,'ordinary unrelated sys unknown remains visible');
   equal(db.prepare(`SELECT COUNT(*) n FROM "${name}"`).get().n,0,'probe does not populate unknown store');results.push({name,exactStores:70,actualFacadeRefusedBeforeMetadata:true,counterfactualFacadeRefusedBeforeMetadata:true,actualVisible,counterfactualVisible,directMetadataSQLOnly:true,mutationStatements:0});db.close();
  }return {cases:results,providerCalls:0};
 });
 await scenario('actual-internals-and-exact-provider-exclusion-positive',async()=>{
  const db=fresh(),trace=[];check(db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()?.name==='sqlite_sequence','actual native SQLite internal table exists');
  equal(await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace,candidate)}),true,'real internal does not inflate70');
  db.exec('CREATE TABLE _cf_KV(provider_only TEXT)');equal(nativeCount(db),70,'only exact provider internal excluded');equal(await candidate.load('./privacy-business-catalog').servingPrivacyCatalogCurrent({DB:d1(db,trace,candidate)}),true,'actual provider internal name ignored before pragma');
  db.exec('CREATE TABLE _cf_other(id TEXT)');equal(nativeCount(db),71,'provider lookalike counted');await currentProfileRefuses(candidate,db,[]);check(db.prepare(actualMetadataSQL).all().some(row=>row.table_name==='_cf_other'),'observed metadata SQL has no broad provider prefix exemption');
  for(const name of['sqlite_private','SQLite_private']){let error;try{db.exec(`CREATE TABLE "${name}"(id TEXT)`);}catch(e){error=String(e.message);}check(error?.includes('reserved for internal use'),'SQLite native literal reserved prefix cannot be user-created');}
  check(metadataReads(trace).every(s=>s.sql.includes("substr(lower(name),1,7)<>'sqlite_'")),'actual safe literal predicate on all metadata reads');check(metadataReads(trace).every(s=>s.sql.includes("name<>'_cf_KV'")),'exact provider name maintained');db.close();return {actualInternal:'sqlite_sequence',exactProvider:'_cf_KV',unqualifiedProviderIntrospection:false,sourceQueries:trace.length};
 });
 await scenario('actual-current-column-census-rejects-extra-missing-store-fields',async()=>{
  const modifications=[db=>db.exec('CREATE TABLE ordinary_unknown(id TEXT)'),db=>db.exec('ALTER TABLE members ADD COLUMN unknown_field TEXT'),db=>db.exec('DROP TABLE site_settings')];
  for(const [caseIndex,modify] of modifications.entries()){const db=fresh(),trace=[];modify(db);await currentProfileRefuses(candidate,db,trace,caseIndex===2);db.close();}return {cases:3,metadataQueries:0,originalSchemaProofAttempts:3};
 });
 await scenario('anonymous-member-directory-profile-search-boundary-unchanged',async()=>{
  const observations=[];
  for(const [variant,g]of[['baseline',baseline],['candidate',candidate]]){const db=fresh(),trace=[],env={DB:d1(db,trace,g),SITE_HOST:'olympus.roachcouncil.com',COMMUNITY_FEATURES:'directory,crafting',COOKIE_SECRET:'synthetic-native-fixture-only'};
   const ctxModule=g.load('./community-context'),directory=g.load('./community-directory');
   for(const [fn,route]of[['profileGet','profile'],['directoryList','directory'],['craftingSearch','crafting/search']]){const request=new Request('https://olympus.roachcouncil.com/api/community/'+route),ctx=await ctxModule.communityContext(env,request);equal(ctx.subject,null,'actual request context has no anonymous subject');
    const response=await directory[fn](request,env,ctx),body=await response.json();equal(response.status,401,'anonymous member payload refused');equal(body.error,'signed_out','existing refusal semantics');observations.push({variant,fn,status:response.status,error:body.error});}
   equal(trace.length,0,'anonymous directory/profile/search performs no payload DB reads or writes');db.close();
  }return {routes:observations,positiveMemberProfileAcceptance:false,memberAdmissionUnchangedBySourceParity:true,queries:0};
 });
 const predecessor=PREDECESSOR,before=FROM,after=TO;
 equal(predecessor.split(before).length-1,1,'only one production wildcard occurrence');equal(CANDIDATE.toString('utf8').replace(after,before),predecessor,'reverse replacement restores the entire mechanically-derived current counterfactual');
 for(const [relative,p]of PINS){const b=fs.readFileSync(path.join(ROOT,relative.replace(/^worker\//,'')));equal(b.length,p.bytes,'source bytes stable');equal(hash(b),p.sha256,'source hash stable');}
 equal(providerCalls,0,'actual import and scoped tests issue no provider requests');
 const report={schema:'olympus-serving-catalogue-literal-prefix-native-current-v2',sourceWorker:ROOT,historicalPredecessorSHA256:HISTORICAL_PREDECESSOR_SHA256,counterfactualCatalogueSHA256:hash(Buffer.from(PREDECESSOR)),runtime:{node:process.version,sqlite:new DatabaseSync(':memory:').prepare('SELECT sqlite_version() v').get().v},candidate:{bytes:CANDIDATE.length,sha256:hash(CANDIDATE)},sourcePins:[...PINS].map(([relative,{bytes,sha256}])=>({relative,bytes,sha256})),entryGraph:{entry:'index.ts',modules:baseline.modules,actualFamilies},checks,scenarios:rows,failures,effects:{productionSourceEdits:false,privateData:false,databaseFiles:0,providerCalls,actualAccountWrites:0,activation:false},limits:['Current actual graph is compared with its exact one-predicate LIKE counterfactual; this is not execution or renewed acceptance of the historically pinned predecessor. The original admitted facade performs a schema proof plus metadata query. Changed profiles are refused by that earlier proof. Separately executing only metadata SQL captured from genuine positive calls proves prefix visibility, without granting a facade, running a directory payload or asserting the later catalogue branch was reached. This is not full erasure, generation transport, schedule, provider transition or activation qualification.','Anonymous directory/profile/search is a refusal compatibility probe; no positive logged-in profile or ordinary OAuth acceptance claimed.','Native memory metadata cannot qualify protected Cloudflare provider internals; exact _cf_KV omission only.','Table/column-set catalogue retains established constraint/column-order semantics; this fix does not add new all-store column ownership or constraint assertions.']};
 let out=null;if(process.env.CATALOGUE_OUTPUT_DIR){out=path.join(process.env.CATALOGUE_OUTPUT_DIR,'native-observations-v1.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify({checks,failed:failures.length,scenarios:rows.length,sourcePins:PINS.size,actualFamilies:actualFamilies.length,observations:out},null,2));
 console.log((checks-failures.length)+'/'+checks+' literal business catalogue checks passed');
 if(failures.length){for(const f of failures)console.error(f.name+' '+f.error);process.exitCode=1;}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
