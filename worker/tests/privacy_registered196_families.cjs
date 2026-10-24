'use strict';
// Shared independent .196 registry proof, appended to the original privacy gates.
// Runs actual source with the unchanged genuine OAuth and Native-erasure setups.
// No replacement admission, raw erasure, provider transport or invented history.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const OLD=Object.freeze(['refs','directory','events','trials','restrictions','departures','contributions','news','event_delivery','event_reminders','privacy_access','councillor_verification','ruleset_publication']);
const ADDED=Object.freeze(['discord_directory_visibility','news_webhook']);
function exactRegistry(registry,env,id,assert){
 const names=registry.communityDataNames();assert.deepEqual(Array.from(names).sort(),[...OLD,...ADDED].sort(),'all original13 and exact two source-owned families');
 assert.equal(new Set(names).size,15,'no duplicate family accepted');
 const all=registry.communityExportPlan(env,id),selected=registry.communityScopedExportPlan(env,id,ADDED);
 assert.equal(all.statements.length-selected.statements.length,36,'all original thirteen exporters retain36 logical reads');
 assert.equal(selected.statements.length,3,'directory singleton1 and webhook count+bounded rows2');
 assert.equal(all.statements.length,39,'actual exact expanded registry plan39');
 for(const bad of [[],[ADDED[0],ADDED[0]],['unknown196']]){
  assert.throws(()=>registry.communityScopedExportPlan(env,id,bad));assert.throws(()=>registry.communityScopedEraseStatements(env,id,bad));
 }
 return names;
}
async function identifyProof196(){
 load('index');const registry=load('community-data-registry'),webhook=load('site-news-webhook');
 const exact=module.require('./privacy_registered196_families.cjs').exactRegistry;
 for(const kind of ['empty','discord_only_marker','maximum1001','malformed_last']){
  const f=fixture();try{
   f.ready();
   exact(registry,f.env,A,assert);
   const originalSchema=JSON.stringify(f.db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all());
   const n=kind==='maximum1001'?1001:kind==='malformed_last'?2:kind==='empty'?0:1;
   const visibility={[B]:'discord-only-optout-v1'};if(kind!=='empty')visibility[A]='discord-only-optout-v1';
   await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','discordDirectoryHidden',JSON.stringify(visibility),f.time());
   const descriptor=(who,i)=>{const id='proof196'+String(i).padStart(14,'0');return {v:1,id,revision:i+1,operation:webhook.NEWS_WEBHOOK_PREFIX+id+':'+i.toString(16).padStart(42,'0'),payloadHash:'1'.repeat(64),configHash:'2'.repeat(64),credentialPin:'Q'.repeat(43),guild:'55555555555555555',channel:'77777777777777777',webhook:'88888888888888888',actor:who,birth:(who===A?'c':'d').repeat(32),generation:who===A?G:'b'.repeat(32),createdAt:f.time()-100,noticeUntil:f.time()+86400,retainUntil:f.time()-100+366*86400};};
   for(let i=0;i<=n;i++){const who=i===n?B:A,m=descriptor(who,i);assert.ok(webhook.parseNewsWebhookMetadata(JSON.stringify(m)),'fixture metadata obeys exact source grammar');await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)','newsWebhook:'+m.id,JSON.stringify(m),f.time(),who);}
   if(kind==='malformed_last')await fixtureWrite(f,"UPDATE site_settings SET value=json_set(value,'$.credentialPin','invalid') WHERE key=?",'newsWebhook:'+descriptor(A,n-1).id);
   const counterpart=JSON.stringify(f.db.prepare('SELECT * FROM site_settings WHERE key=?').get('newsWebhook:'+descriptor(B,n).id));
   const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length;
   provider=null;let attempts=0;const batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=ss=>batches.push(ss.length);
   let response,held=false;try{response=await copy.exportPrivacyAccess(frm.request(),f.env);}catch{held=true;}finally{f.hooks.statement=null;f.hooks.beforeBatch=null;}
   if(kind==='malformed_last'){
    ok(kind+' real exporter refuses malformed own metadata, no partial successful copy',held||response.status!==200);
   }else{
    eq(kind+' original identify-only export admitted',response.status,200);const body=await response.json(),section=body.community.news_webhook;
    eq(kind+' never-signed-in remains accountless',[body.account,count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[null,0,0,0]);
    eq(kind+' own attended marker is copied without website-incarnation prerequisite',body.community.discord_directory_visibility,{listedByDefault:true,optedOut:kind!=='empty',scope:'whole_directory_row',extraProfileDetails:'separate_opt_in'});
    eq(kind+' exact retained webhook count and truthful cap',[section.count,section.returnedCount,section.deliveries.length,section.limit,section.complete,section.truncated],[n,Math.min(n,1000),Math.min(n,1000),1000,n<=1000,n>1000]);
    ok(kind+' webhook bounded metadata is not invented cursor history',!Object.hasOwn(section,'nextCursor')&&(n<=1000||section.scope.includes('attended')));
    for(const row of section.deliveries)eq(kind+' safe delivery fields',Object.keys(row),['noticeId','revision','state','removalPending','createdAt','noticeUntil','retainUntil']);
    ok(kind+' counterpart actor and private descriptor custody excluded',![B,'Q'.repeat(43),'credentialPin','payloadHash','77777777777777777','88888888888888888','c'.repeat(32),G].some(v=>JSON.stringify(body.community).includes(v)));
    eq(kind+' all original38 history descriptors remain exact',Object.keys(body.coverage.histories).sort(),Array.from(load('privacy-access-history').PRIVACY_COPY_HISTORY_COLLECTIONS).sort());
    eq(kind+' original97 plus exactly one packed source read',attempts,98);eq(kind+' original first group2/payload plus1',[...batches],[2,96]);ok(kind+' actual physical copy remains strictly below100',attempts<100);
    await refused(kind+' exact original one-use grant cannot be replayed',()=>copy.exportPrivacyAccess(frm.request(),f.env));
   }
   eq(kind+' no extra provider effect after original OAuth',calls.length,beforeCalls);
   eq(kind+' copy preserves counterpart descriptor',JSON.stringify(f.db.prepare('SELECT * FROM site_settings WHERE key=?').get('newsWebhook:'+descriptor(B,n).id)),counterpart);
   eq(kind+' original schema unchanged',JSON.stringify(f.db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all()),originalSchema);
  }finally{f.db.close();}
 }
 return checks;
}
async function nativeProof196(){
 const registry=load('community-data-registry'),webhook=load('site-news-webhook');
 const exact=module.require('./privacy_registered196_families.cjs').exactRegistry;
 let caseNo=0;
 for(const kind of ['known','maximum1001','unknown_send']){
  const f=fixture();clock+=1200*caseNo++;try{
   const cookie=await f.signIn(ID);await f.signIn(OTHER);await seedPersonal(f,{roles:0});exact(registry,{...f.env,DB:f.writer},ID,assert);
   const originalSchema=JSON.stringify(f.rows('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'));
   const ownBirth=f.raw('SELECT account_incarnation FROM site_users WHERE discord_id=?',ID).account_incarnation,ownGeneration=f.raw('SELECT generation FROM privacy_subjects WHERE subject_id=?',ID).generation;
   const otherBirth=f.raw('SELECT account_incarnation FROM site_users WHERE discord_id=?',OTHER).account_incarnation;
   await f.write('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','discordDirectoryHidden',JSON.stringify({[ID]:ownBirth,[OTHER]:otherBirth}),clock);
   const n=kind==='maximum1001'?1001:1;
   const descriptor=(who,i)=>{const id='erase196'+String(i).padStart(14,'0');return {v:1,id,revision:1,operation:webhook.NEWS_WEBHOOK_PREFIX+id+':'+i.toString(16).padStart(42,'0'),payloadHash:'1'.repeat(64),configHash:'2'.repeat(64),credentialPin:'Q'.repeat(43),guild:GUILD,channel:CHANNEL,webhook:'1551234567890123491',actor:who,birth:who===ID?ownBirth:otherBirth,generation:who===ID?ownGeneration:f.raw('SELECT generation FROM privacy_subjects WHERE subject_id=?',OTHER).generation,createdAt:clock-100,noticeUntil:clock+86400,retainUntil:clock-100+authority.PRIVACY_REPLAY};};
   for(let i=0;i<=n;i++){const who=i===n?OTHER:ID,m=descriptor(who,i);assert.ok(webhook.parseNewsWebhookMetadata(JSON.stringify(m)));await f.write('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)','newsWebhook:'+m.id,JSON.stringify(m),clock,who);}
   const otherKey='newsWebhook:'+descriptor(OTHER,n).id,other=JSON.stringify(f.raw('SELECT * FROM site_settings WHERE key=?',otherKey));
   let unknownBefore;if(kind==='unknown_send'){
    const m=descriptor(ID,0);await f.write("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'notice',?,?,'unknown',0,?,?,?)",m.operation,JSON.stringify([{id:ID,g:ownGeneration}]),m.channel,m.createdAt,clock,m.retainUntil);
    unknownBefore=JSON.stringify(f.raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?',m.operation));
    const seededUnknown=JSON.parse(unknownBefore);check(kind+' original uncertain SEND has exact descriptor destination and no invented message pointer',seededUnknown.channel_id===m.channel&&seededUnknown.message_id===null&&seededUnknown.state==='unknown'&&seededUnknown.cleanup_requested===0);
   }
   const copyResponse=await f.call('GET','/api/me/export',{cookie}),body=await json(copyResponse);check(kind+' actual ordinary source copy admitted',copyResponse.status===200);
   check(kind+' ordinary own metadata count/cap and suppression agree',body.community.discord_directory_visibility.optedOut===true&&body.community.news_webhook.count===n&&body.community.news_webhook.returnedCount===Math.min(n,1000)&&body.community.news_webhook.complete===(n<=1000));
   f.inventoryUnavailable=true;const operation=await request(f,cookie);f.inventoryUnavailable=false;check(kind+' erasure uses original authenticated operation, no synthesized admission',operation.response.status===202);
   const job=await finish(f);
   if(kind==='unknown_send'){
    // Independent message debt is deliberately distinct from an unknown role
    // PUT. Serving erasure may complete; external SEND custody is not resolved.
    check(kind+' serving erasure completes without claiming independent unknown-send completion',job?.state==='complete'&&!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',ID));
    const retained=f.raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?',descriptor(ID,0).operation);
    check(kind+' original uncertain provider custody is retained without pointer/absence cancellation',retained?.state==='unknown'&&retained.operation_id===JSON.parse(unknownBefore).operation_id&&retained.subjects===JSON.parse(unknownBefore).subjects&&retained.created_at===JSON.parse(unknownBefore).created_at&&retained.retain_until===JSON.parse(unknownBefore).retain_until&&retained.cleanup_requested===1);
    check(kind+' unknown SEND retains original destination and unknown pointer after serving erasure',retained.channel_id===JSON.parse(unknownBefore).channel_id&&retained.message_id===null&&retained.purpose===JSON.parse(unknownBefore).purpose);
   }else{
    check(kind+' actual original Native continuation completes',job?.state==='complete');
    const hidden=JSON.parse(f.raw("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'")?.value??'{}');
    check(kind+' registered eraser removes only own directory key',!Object.hasOwn(hidden,ID)&&hidden[OTHER]===otherBirth);
    const own=f.rows("SELECT value FROM site_settings WHERE key GLOB 'newsWebhook:*'").filter(row=>JSON.parse(row.value).id!==descriptor(OTHER,n).id);
    check(kind+' full registered eraser scrubs all own descriptor actor/birth/generation without deleting rows',own.length===n&&own.every(row=>{const m=JSON.parse(row.value);return m.actor===null&&m.birth===null&&m.generation===null&&!row.value.includes(ID);}));
   }
   check(kind+' counterpart exact descriptor remains',JSON.stringify(f.raw('SELECT * FROM site_settings WHERE key=?',otherKey))===other);
   check(kind+' no schema migration/new family/DDL',JSON.stringify(f.rows('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'))===originalSchema);
   check(kind+' actual every original job slice remains inside196 physical SQL',jobEnvelope===196&&f.measurements.length>0&&f.measurements.every(m=>m.statements<=196));
   check(kind+' original24 labels and700 total envelope unchanged',scheduledBudget.ADMISSION_SCHEDULED_BUDGET.length===24&&scheduledBudget.ADMISSION_SCHEDULED_BUDGET.reduce((sum,row)=>sum+row.worst,0)===700);
   check(kind+' no Floor/manual cron/new provider send or role grant',f.floorCalls===0&&!f.http.some(row=>row.method==='PUT'||row.method==='POST'&&!row.url.includes('/oauth2/token')));
  }finally{f.close();}
 }
 return checks;
}
async function fromOriginal(worker,leaf,marker,run){
 const filename=path.join(worker,'tests',leaf),source=fs.readFileSync(filename,'utf8');
 if(source.split(marker).length!==2)throw Error('registered196_original_fixture_boundary_changed:'+leaf);
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod._compile(source.slice(0,source.indexOf(marker))+'\nmodule.exports=('+run.toString()+');\n',filename);
 return mod.exports();
}
async function run(worker=path.resolve(__dirname,'..')){
 const identify=await fromOriginal(worker,'privacy_access_test.cjs','async function main(){',identifyProof196);
 const native=await fromOriginal(worker,'privacy_native_erasure_mode_test.cjs','(async()=>{\n // .174:',nativeProof196);
 console.log('REGISTERED196_TWO_FAMILY_PROOF '+JSON.stringify({identifyChecks:identify,nativeChecks:native,originalFamilies:13,addedFamilies:ADDED,historySelectorsUnchanged:38,syntheticProviderOnly:true}));
}
module.exports={run,exactRegistry,OLD,ADDED};
