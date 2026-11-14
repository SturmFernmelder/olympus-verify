// Invoke the actual index.ts scheduled entry. No runtime module stubs or runtime-source transformations.
// Reuse the SQLite/fetch scaffolding only; the source loader transpiles the complete import graph unchanged.
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'beta_reset_slice_test.cjs'),'utf8'),marker='(async()=>{';
if(fixture.split(marker).length!==2)throw Error('slice fixture harness boundary changed');
const harness=fixture.slice(0,fixture.indexOf(marker));
const cases=String.raw`

// CURRENT CONTRACT: these ordinary objects are intentionally unowned controllers.
// Their refusal precedes reset flags/qualifiers. Positive slice and Native coverage remain separate.
const index=load('index'),entry=index.default,schema=load('schema');
const {RecoveryFloorHeld}=load('privacy-recovery-held');
const installer=require(path.join(root,'scripts/install-rejection-provenance-epoch.cjs'));
const profile=installer.manifest.canonical,expectedObjects=installer.manifest.canonicalObjects;
const scheduleCosts=[],lookupErrors=[];
let observerReads=0;
function observeAll(sql){observerReads++;const statement=db.prepare(sql);statement.setReadBigInts(true);return statement.all();}
function identifier(value){assert.match(value,/^[A-Za-z_][A-Za-z0-9_]*$/);return '"'+value+'"';}
function scalar(type,value){
 if(type==='null'){assert.equal(value,null);return ['null'];}
 if(type==='integer'){assert.equal(typeof value,'bigint');return ['integer',value.toString()];}
 if(type==='real'){assert.equal(typeof value,'number');const bytes=Buffer.alloc(8);bytes.writeDoubleBE(value);return ['real',bytes.toString('hex')];}
 if(type==='text'){assert.equal(typeof value,'string');return ['text',value];}
 if(type==='blob'){assert.ok(value instanceof Uint8Array);return ['blob',Buffer.from(value).toString('hex')];}
 throw Error('unexpected SQLite storage class');
}
function nativeCounts(){return {executions:physical,trace:originalNative.nativeTrace.length,groups:originalNative.nativeGroups.length,http:requests.length};}
function environmentDescriptors(){return {prototype:Object.getPrototypeOf(env),entries:Reflect.ownKeys(env).map(key=>[key,Object.getOwnPropertyDescriptor(env,key)])};}
function sameEnvironment(before,after){
 assert.equal(after.prototype,before.prototype);assert.equal(after.entries.length,before.entries.length);
 for(let i=0;i<before.entries.length;i++){const [key,a]=before.entries[i],[other,b]=after.entries[i];assert.equal(other,key);assert.deepEqual(Reflect.ownKeys(b),Reflect.ownKeys(a));for(const field of Reflect.ownKeys(a))assert.ok(Object.is(a[field],b[field]),'environment descriptor '+String(key)+' '+String(field));}
}
function snapshot(){
 const boundary=nativeCounts(),environment=environmentDescriptors();
 const objects=observeAll('SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type,name');
 assert.deepEqual(objects.map(row=>[row.type,row.name,row.tbl_name,row.sql]),expectedObjects,'complete canonical schema');
 const names=objects.filter(row=>row.type==='table').map(row=>row.name);
 assert.deepEqual(names,[...profile.tables.map(table=>table.name),'privacy_write_admission','sqlite_sequence'].sort(),'complete local table inventory');
 const tables=names.map(name=>{
  const info=observeAll('PRAGMA table_xinfo('+identifier(name)+')');
  const columns=info.map(row=>row.name);
  const expected=profile.tables.find(table=>table.name===name)?.columns??(name==='sqlite_sequence'?['name','seq']:['singleton','protocol','epoch','mode','active','nonce','purpose','entry_changes','logical_changes'].sort());
  assert.deepEqual([...columns].sort(),expected,'complete source columns '+name);
  assert.ok(info.every(row=>row.hidden===0n)&&!columns.some(column=>['rowid','_rowid_','oid'].includes(column.toLowerCase())),'rowid witness '+name);
  const projection=['rowid AS observed_rowid','typeof(rowid) AS observed_rowid_type',...columns.flatMap((column,i)=>[identifier(column)+' AS c'+i,'typeof('+identifier(column)+') AS t'+i])];
  const rows=observeAll('SELECT '+projection.join(',')+' FROM '+identifier(name)+' ORDER BY rowid').map(row=>[scalar(row.observed_rowid_type,row.observed_rowid),...columns.map((column,i)=>scalar(row['t'+i],row['c'+i]))]);
  return {name,info,rows};
 });
 const provider={members:[...members].map(([id,roles])=>[id,[...roles]]),directory:[...directory],requests:requests.map(row=>({...row})),inventory:inventory.map(row=>({...row}))};
 sameEnvironment(environment,environmentDescriptors());assert.deepEqual(nativeCounts(),boundary,'observer causes no source execution or provider work');
 return {environment,objects,tables,provider,boundary};
}
function sameSnapshot(before,after){sameEnvironment(before.environment,after.environment);for(const key of ['objects','tables','provider','boundary'])assert.deepEqual(after[key],before[key],'complete unchanged '+key);}
function lookupRefusal(lookup,event,ctx){
 let thrown;try{lookup(event,ctx);}catch(error){thrown=error;}
 assert.ok(thrown instanceof RecoveryFloorHeld&&Object.getPrototypeOf(thrown)===RecoveryFloorHeld.prototype&&thrown.message==='recovery_floor_held','actual same-graph lookup refusal');
 return thrown;
}
async function invoke(cron){
 const pending=[],calls={noRetry:0,waitUntil:0,passThrough:0},logs=[];
 const event={cron,scheduledTime:clock*1000,noRetry(){calls.noRetry++;}};
 const ctx={waitUntil(job){calls.waitUntil++;pending.push(job);},passThroughOnException(){calls.passThrough++;}};
 // Observe only the original sanitized console sink; the source catch's Error is inaccessible.
 const originalConsoleError=console.error;let returned,values;
 try{console.error=(...args)=>{logs.push(args);Reflect.apply(originalConsoleError,console,args);};returned=await entry.scheduled(event,env,ctx);values=await Promise.all(pending);}
 finally{console.error=originalConsoleError;}
 const callbackError=lookupRefusal(index.originalScheduledCallbackObservation,event,ctx);
 const costError=lookupRefusal(index.originalScheduledCallbackPhysicalCostObservation,event,ctx);
 assert.notEqual(callbackError,costError,'each public lookup independently throws');lookupErrors.push({event,ctx,callbackError,costError});
 return {returned,jobs:pending.length,values,calls,logs,callbackCaptured:false,costRootAvailable:false,cost:null};
}
async function sentinel(){await env.DB.prepare('INSERT INTO seen_interactions(id,seen_at,response) VALUES(?1,?2,NULL)').bind('fixture-expired-interaction',clock-7200).run();}
function sentinelPresent(){return !!db.prepare("SELECT 1 FROM seen_interactions WHERE id='fixture-expired-interaction'").get();}
async function scheduled(name,cron){
 const reads=observerReads,before=snapshot(),result=await invoke(cron),boundary=nativeCounts();
 assert.deepEqual(boundary,before.boundary,'first post-entry counter boundary');
 const after=snapshot();sameSnapshot(before,after);assert.deepEqual(nativeCounts(),boundary,'post-observer counter boundary');
 const effectCount=rows=>rows.filter(row=>row.method==='DELETE'||row.method==='PUT').length;
 const cost={name,scope:'unowned-controller-entry-refusal',physical:boundary.executions-before.boundary.executions,nativeExecutions:boundary.trace-before.boundary.trace,nativeBatchGroups:boundary.groups-before.boundary.groups,http:boundary.http-before.boundary.http,deletes:effectCount(after.provider.requests)-effectCount(before.provider.requests),jobs:result.jobs,callbackCaptured:false,costRootAvailable:false,cost:null,observerReads:observerReads-reads};
 check(name+' preserves every typed local row/schema/provider/env descriptor',true);
 check(name+' public lookups refuse with the original typed class',!result.callbackCaptured&&!result.costRootAvailable&&result.cost===null);
 check(name+' has no source executions groups provider effects or deferred calls',cost.physical===0&&cost.nativeExecutions===0&&cost.nativeBatchGroups===0&&cost.http===0&&effects().length===0&&result.jobs===0&&result.values.length===0&&Object.values(result.calls).every(n=>n===0));
 check(name+' returns undefined with only the original redacted catch log',result.returned===undefined&&JSON.stringify(result.logs)===JSON.stringify([['cron entry held; skipping this run','error']]));
 scheduleCosts.push(cost);console.log('SCHEDULE_ENTRY_REFUSAL '+JSON.stringify(cost));return {result,cost};
}

// .265 retarget of the exact .251 static-only bridge: eight exact whole-source windows restore the untouched241 oracle input.
// It is used only by the AST inspector below; the runtime loader above still reads current source unchanged.
const STATIC_INDEX265=Object.freeze({"schema":"beta-reset265-exact-static-index-to241-v1","staticOnly":true,"runtimeSubstitutionAuthorized":false,"currentBytes":72251,"currentSHA256":"af0db2c780755b5a4e6e5074bb5ff1828ab8220b58a4ef44c7bbe43331b10850","accepted241Bytes":70008,"accepted241SHA256":"8b8c367e51ca14e207ad11932364d69cc8fbafb4655c194b99b9c72397e9071c","windowCount":8,"outsideLineBase64":"ICogb2x5bXB1cy12ZXJpZnkgV29ya2VyIOKAlCByb3V0ZXMK","windows":[{"fromBase64":"Ly8gT3B0aW9uYWwgLjI0MiBmZWF0dXJlcyBhcmUgbGF6eSBib3VuZGFyaWVzOiBwcmVzZXJ2ZSB0aGUgb3JpZ2luYWwgQ29yZS9RUiBpbml0aWFsaXphdGlvbiBvcmRlci4KYXN5bmMgZnVuY3Rpb24gaGFuZGxlUm9sZUNvbnRpbnVhdGlvbjI0MiguLi5hcmdzOlBhcmFtZXRlcnM8dHlwZW9mIGltcG9ydCgnLi9yb2xlLXJlY29uY2lsZTI0MicpLmhhbmRsZVJvbGVDb250aW51YXRpb24yNDI+KXtyZXR1cm4gKGF3YWl0IGltcG9ydCgnLi9yb2xlLXJlY29uY2lsZTI0MicpKS5oYW5kbGVSb2xlQ29udGludWF0aW9uMjQyKC4uLmFyZ3MpO30KYXN5bmMgZnVuY3Rpb24ga2lja1JvbGVXb3JrMjQyKC4uLmFyZ3M6UGFyYW1ldGVyczx0eXBlb2YgaW1wb3J0KCcuL3JvbGUtcmVjb25jaWxlMjQyJykua2lja1JvbGVXb3JrMjQyPil7cmV0dXJuIChhd2FpdCBpbXBvcnQoJy4vcm9sZS1yZWNvbmNpbGUyNDInKSkua2lja1JvbGVXb3JrMjQyKC4uLmFyZ3MpO30KYXN5bmMgZnVuY3Rpb24gcG9zdEludGFrZTI0MiguLi5hcmdzOlBhcmFtZXRlcnM8dHlwZW9mIGltcG9ydCgnLi9pbnRha2UyNDInKS5wb3N0SW50YWtlMjQyPil7cmV0dXJuIChhd2FpdCBpbXBvcnQoJy4vaW50YWtlMjQyJykpLnBvc3RJbnRha2UyNDIoLi4uYXJncyk7fQppbXBvcnQgJy4vdHJlYXN1cnktZGF0YTI0Mic7CmltcG9ydCB7IGlzR3VpbGRDb21tYW5kMjE5LCBndWlsZENvbW1hbmRSZWFkT25seTIxOSwgaGFuZGxlR3VpbGRDb21tYW5kMjE5IH0gZnJvbSAnLi9ndWlsZC1jb21tYW5kczIxOSc7Ci8qKgo=","toBase64":"aW1wb3J0IHsgaXNHdWlsZENvbW1hbmQyMTksIGd1aWxkQ29tbWFuZFJlYWRPbmx5MjE5LCBoYW5kbGVHdWlsZENvbW1hbmQyMTkgfSBmcm9tICcuL2d1aWxkLWNvbW1hbmRzMjE5JzsKLyoqCg==","fromSHA256":"529e93aa0220a0980d8d4494fd7e0e11f985067de0e139cb41e5210c78d7713c","toSHA256":"7b3ae57e07a87303354c3d7f1b309d8b60cf3137a12e194f6db688fd43ad4212","fromBytes":776,"toBytes":109},{"fromBase64":"ICAgICAgfQogICAgICBjb25zdCByZXMgPSBhd2FpdCByb3V0ZShyZXF1ZXN0LCBlbnYsIHBhdGgsIHNjaGVtYVJlYWR5LCBjdHgsIG5hbWVzT3JpZ2luLHJvbGVEaXNwYXRjaCk7CiAgICAgIGlmKHJlcXVlc3QubWV0aG9kPT09J1BPU1QnJiZyZXMub2smJlsnL2luZ2VzdC92ZXJpZnknLCcvaW5nZXN0L3Jvc3RlcicsJy9pbmdlc3QvaW50YWtlMjQyJ10uaW5jbHVkZXMocGF0aCkpewogICAgICAgY29uc3QgdmVyaWZpY2F0aW9uMjQyPWNhcHR1cmVMYXVuY2hWZXJpZmljYXRpb24oZW52KTsKICAgICAgIGlmKHZlcmlmaWNhdGlvbjI0Mi5tb2RlPT09J21lbWJlcnMtb25seScmJnZlcmlmaWNhdGlvbjI0Mi5zY29wZSYmdmVyaWZpY2F0aW9uMjQyLmN1cnJlbnQoKSl7CiAgICAgICAgZGVmZXJPcmlnaW5hbFNlcnZpbmcoY3R4LCdyb2xlczI0Ml9yZXF1ZXN0cycsKCk9PmtpY2tSb2xlV29yazI0MihlbnYsJ3JlcXVlc3RzJykpOwogICAgICAgfQogICAgICB9CiAgICAgIC8vIFRoZSB3YXRjaGVyIHBvbGxzIC9xdWV1ZSBldmVyeSAzMCBzZWNvbmRzIHdoaWxlIGFuIG9mZmljZXIgaXMgb25saW5lLCB3aGljaCBpcyBleGFjdGx5IHdoZW4gcHJvbW90aW9ucyBoYXBwZW4uCiAgICAgIC8vIFRoZSBHdWlsZCBNZW1iZXIgc3dlZXAgcmlkZXMgb24gdGhvc2UgcG9sbHMgKHRocm90dGxlZCB0byBvbmUgcGVyIGZpdmUgbWludXRlcyBpbnNpZGUpLCBhZnRlciB0aGUgcmVzcG9uc2UuCiAgICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gIkdFVCIgJiYgcGF0aCA9PT0gIi9xdWV1ZSIgJiYgcmVzLm9rICYmICF1cmwuc2VhcmNoUGFyYW1zLmdldEFsbCgncHJlc2VuY2VPbmx5JykuaW5jbHVkZXMoJzEnKSAmJiAhdXJsLnNlYXJjaFBhcmFtcy5oYXMoJ2NhY2hlT25seTI0MicpKSB7CiAgICAgICAgLy8gUmV2aXNpb24gNCAoQTEsIEE0IGVudHJ5IDEpOiB0aGUgbGFuZSBjb25maWd1cmF0aW9uIGlzIGNhcHR1cmVkIGhlcmUsIHN5bmNocm9ub3VzbHkuIFVuY29uZmlndXJlZCBrZWVwcyB0aGUKICAgICAgICAvLyBvcmlnaW5hbCBzdGF0ZW1lbnQgZXhhY3RseTsgY29uZmlndXJlZCBzaGFyZXMgb25lIERpc2NvcmQtY2FsbCBhbGxvd2FuY2UgYmV0d2VlbiB0aGUgc3dlZXAgYW5kIHRoZSBmcmVzaCBwYXNzLgo=","toBase64":"ICAgICAgfQogICAgICBjb25zdCByZXMgPSBhd2FpdCByb3V0ZShyZXF1ZXN0LCBlbnYsIHBhdGgsIHNjaGVtYVJlYWR5LCBjdHgsIG5hbWVzT3JpZ2luLHJvbGVEaXNwYXRjaCk7CiAgICAgIC8vIFRoZSB3YXRjaGVyIHBvbGxzIC9xdWV1ZSBldmVyeSAzMCBzZWNvbmRzIHdoaWxlIGFuIG9mZmljZXIgaXMgb25saW5lLCB3aGljaCBpcyBleGFjdGx5IHdoZW4gcHJvbW90aW9ucyBoYXBwZW4uCiAgICAgIC8vIFRoZSBHdWlsZCBNZW1iZXIgc3dlZXAgcmlkZXMgb24gdGhvc2UgcG9sbHMgKHRocm90dGxlZCB0byBvbmUgcGVyIGZpdmUgbWludXRlcyBpbnNpZGUpLCBhZnRlciB0aGUgcmVzcG9uc2UuCiAgICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gIkdFVCIgJiYgcGF0aCA9PT0gIi9xdWV1ZSIgJiYgcmVzLm9rICYmICF1cmwuc2VhcmNoUGFyYW1zLmdldEFsbCgncHJlc2VuY2VPbmx5JykuaW5jbHVkZXMoJzEnKSkgewogICAgICAgIC8vIFJldmlzaW9uIDQgKEExLCBBNCBlbnRyeSAxKTogdGhlIGxhbmUgY29uZmlndXJhdGlvbiBpcyBjYXB0dXJlZCBoZXJlLCBzeW5jaHJvbm91c2x5LiBVbmNvbmZpZ3VyZWQga2VlcHMgdGhlCiAgICAgICAgLy8gb3JpZ2luYWwgc3RhdGVtZW50IGV4YWN0bHk7IGNvbmZpZ3VyZWQgc2hhcmVzIG9uZSBEaXNjb3JkLWNhbGwgYWxsb3dhbmNlIGJldHdlZW4gdGhlIHN3ZWVwIGFuZCB0aGUgZnJlc2ggcGFzcy4K","fromSHA256":"f59d226c76587723f91239026dc95c2755fc3088fe61b224605587bd8200656b","toSHA256":"204dab21275cd7b1f622a532a7d144f3b40009af14140380b8a254ed06aae038","fromBytes":1133,"toBytes":708},{"fromBase64":"ICBjb25zdCBwYXNzPWF3YWl0IGltcG9ydCgnLi9mdWxsLXJlbGVhc2UtcGFzcycpO2NoZWNrKCk7CiAgY29uc3QgY2FsbHM9Y2FsbEJ1ZGdldChjb3VudGVkKTtjYWxscy5saW1pdD1NYXRoLm1pbihjYWxscy5saW1pdCxDQU5PTklDQUxfUkFOS19TQ0hFRFVMRV9IVFRQKTsKICBjb25zdCByZXN1bHQ9YXdhaXQgcGFzcy5ydW5GcmVzaFBhc3MoY291bnRlZCx7Y2FsbHMsYWRtOnBhc3MubmF0aXZlQWRtaXNzaW9uMjMyKGNvdW50LENBTk9OSUNBTF9SQU5LX0NISUxEX1NUQVRFTUVOVFMpfSwnc2NoZWR1bGVkJyxsYW5lKTtjaGVjaygpOwogIC8vIEEgc2lnbmVkIG5ldyByZXF1ZXN0IG93bnMgaXRzIG93biBzdGF0ZW1lbnQvc3VicmVxdWVzdCBidWRnZXQuCiAgYXdhaXQga2lja1JvbGVXb3JrMjQyKGVudiwncmVxdWVzdHMnKTsKICAgaWYocmVzdWx0LmNvbnRpbnVhdGlvbiYmcmVzdWx0Lm5hdGl2ZVN3ZWVwKWF3YWl0IGtpY2tSb2xlV29yazI0MihlbnYsJ3N3ZWVwJyxyZXN1bHQubmF0aXZlU3dlZXApO2NoZWNrKCk7CiB9KTsKfQo=","toBase64":"ICBjb25zdCBwYXNzPWF3YWl0IGltcG9ydCgnLi9mdWxsLXJlbGVhc2UtcGFzcycpO2NoZWNrKCk7CiAgY29uc3QgY2FsbHM9Y2FsbEJ1ZGdldChjb3VudGVkKTtjYWxscy5saW1pdD1NYXRoLm1pbihjYWxscy5saW1pdCxDQU5PTklDQUxfUkFOS19TQ0hFRFVMRV9IVFRQKTsKICBhd2FpdCBwYXNzLnJ1bkZyZXNoUGFzcyhjb3VudGVkLHtjYWxscyxhZG06cGFzcy5uYXRpdmVBZG1pc3Npb24yMzIoY291bnQsQ0FOT05JQ0FMX1JBTktfQ0hJTERfU1RBVEVNRU5UUyl9LCdzY2hlZHVsZWQnLGxhbmUpO2NoZWNrKCk7CiB9KTsKfQo=","fromSHA256":"270b0a5b09498c912e1bfe19d035e4e4706fddb98fca3a63892c4b2720c7acf2","toSHA256":"c257fb6c206ab9368081c07b95433bc8d3083c4baf28bb5fdd87eb9abd2fb168","fromBytes":530,"toBytes":299},{"fromBase64":"ICBjb25zdCByb2xlRGlzcGF0Y2g9b3JpZ2luYWxEaXNwYXRjaD8/Y2FwdHVyZUJldGFSb2xlRGlzcGF0Y2goZW52KTsKICBjb25zdCBxdWVyeSA9IG5ldyBVUkwocmVxdWVzdC51cmwpLnNlYXJjaFBhcmFtczsKICBpZihwYXRoPT09Jy9pbnRlcm5hbC9yb2xlczI0Mi9jb250aW51ZScpcmV0dXJuIGhhbmRsZVJvbGVDb250aW51YXRpb24yNDIocmVxdWVzdCxlbnYsY3R4PyhsYWJlbCx3b3JrKT0+ZGVmZXJPcmlnaW5hbFNlcnZpbmcoY3R4LGxhYmVsLHdvcmspOnVuZGVmaW5lZCk7CiAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAiUE9TVCIgJiYgcGF0aCA9PT0gIi9pbnRlcmFjdGlvbnMiKSB7CiAgICAvLyBCdWlsZCAuNDc6IHRoZSBib2R5IGlzIGNhcHBlZCBiZWZvcmUgYW55dGhpbmcgZGVjb2RlcyBpdCwgdGhlIHNpZ25hdHVyZSdzIHRpbWVzdGFtcCBtdXN0IGJlIHJlY2VudCwgdGhlIHBheWxvYWQK","toBase64":"ICBjb25zdCByb2xlRGlzcGF0Y2g9b3JpZ2luYWxEaXNwYXRjaD8/Y2FwdHVyZUJldGFSb2xlRGlzcGF0Y2goZW52KTsKICBjb25zdCBxdWVyeSA9IG5ldyBVUkwocmVxdWVzdC51cmwpLnNlYXJjaFBhcmFtczsKICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICJQT1NUIiAmJiBwYXRoID09PSAiL2ludGVyYWN0aW9ucyIpIHsKICAgIC8vIEJ1aWxkIC40NzogdGhlIGJvZHkgaXMgY2FwcGVkIGJlZm9yZSBhbnl0aGluZyBkZWNvZGVzIGl0LCB0aGUgc2lnbmF0dXJlJ3MgdGltZXN0YW1wIG11c3QgYmUgcmVjZW50LCB0aGUgcGF5bG9hZAo=","fromSHA256":"60063158908fcb23dca20883cbf59903eb06f2e489459bd4bc2bd8c9615c9d8e","toSHA256":"ca2ccd478da83c441fde7d965436f15111ca179fc0ed8757a170f5b06ff25935","fromBytes":456,"toBytes":302},{"fromBase64":"ICAgICAgICBjYXRjaChlKXtyZXR1cm4gcmVwbHkoZSBpbnN0YW5jZW9mIFFySGVsZD9gQ291bmNpbGxvciB2ZXJpZmljYXRpb24gaXMgaGVsZDogJHtlLmNvZGV9LmA6J0NvdW5jaWxsb3IgdmVyaWZpY2F0aW9uIGlzIGN1cnJlbnRseSBoZWxkLicpO30KICAgICAgfQogICAgICBjb25zdCBhY2Nlc3NDaGVjazI0Mj1hd2FpdCBpbXBvcnQoJy4vYWNjZXNzLWNoZWNrMjQyJyk7CiAgICAgIGlmKGFjY2Vzc0NoZWNrMjQyLmlzQWNjZXNzQ2hlY2syNDIoaSkpcmV0dXJuIGFjY2Vzc0NoZWNrMjQyLmhhbmRsZUFjY2Vzc0NoZWNrMjQyKGVudixpLE51bWJlcihyZXF1ZXN0LmhlYWRlcnMuZ2V0KCdYLVNpZ25hdHVyZS1UaW1lc3RhbXAnKSksY3R4PyhsYWJlbCx3b3JrKT0+ZGVmZXJPcmlnaW5hbFNlcnZpbmcoY3R4LGxhYmVsLHdvcmspOnVuZGVmaW5lZCk7CiAgICAgIGlmKGlzR3VpbGRDb21tYW5kMjE5KGkpKXJldHVybiBoYW5kbGVHdWlsZENvbW1hbmQyMTkoZW52LGksTnVtYmVyKHJlcXVlc3QuaGVhZGVycy5nZXQoIlgtU2lnbmF0dXJlLVRpbWVzdGFtcCIpKSxjdHg/d29yaz0+ZGVmZXJPcmlnaW5hbFNlcnZpbmcoY3R4LCJpbnRlcmFjdGlvbl9ndWlsZDIxOSIsd29yayk6dW5kZWZpbmVkKTsKICAgICAgcmV0dXJuIGF3YWl0IGhhbmRsZUludGVyYWN0aW9uKGVudiwgaSwgY3R4ID8gKGxhYmVsLCB3b3JrKSA9PiBkZWZlck9yaWdpbmFsU2VydmluZyhjdHgsIGxhYmVsLCB3b3JrKSA6IHVuZGVmaW5lZCxyb2xlRGlzcGF0Y2gpOwo=","toBase64":"ICAgICAgICBjYXRjaChlKXtyZXR1cm4gcmVwbHkoZSBpbnN0YW5jZW9mIFFySGVsZD9gQ291bmNpbGxvciB2ZXJpZmljYXRpb24gaXMgaGVsZDogJHtlLmNvZGV9LmA6J0NvdW5jaWxsb3IgdmVyaWZpY2F0aW9uIGlzIGN1cnJlbnRseSBoZWxkLicpO30KICAgICAgfQogICAgICBpZihpc0d1aWxkQ29tbWFuZDIxOShpKSlyZXR1cm4gaGFuZGxlR3VpbGRDb21tYW5kMjE5KGVudixpLE51bWJlcihyZXF1ZXN0LmhlYWRlcnMuZ2V0KCJYLVNpZ25hdHVyZS1UaW1lc3RhbXAiKSksY3R4P3dvcms9PmRlZmVyT3JpZ2luYWxTZXJ2aW5nKGN0eCwiaW50ZXJhY3Rpb25fZ3VpbGQyMTkiLHdvcmspOnVuZGVmaW5lZCk7CiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVJbnRlcmFjdGlvbihlbnYsIGksIGN0eCA/IChsYWJlbCwgd29yaykgPT4gZGVmZXJPcmlnaW5hbFNlcnZpbmcoY3R4LCBsYWJlbCwgd29yaykgOiB1bmRlZmluZWQscm9sZURpc3BhdGNoKTsK","fromSHA256":"fc90dc38020cbc6b025faad5b96eb5adfe128b0509a72ff85bcf191b337e1f9d","toSHA256":"bd49d2762b2f5a5136fd5623fa72aa799cbfd40b11a9f0d01df188c7303a71a0","fromBytes":755,"toBytes":480},{"fromBase64":"ICAgICAgaWYgKGJvZHkgPT09IG51bGwgfHwgdHlwZW9mIGJvZHkgIT09ICJvYmplY3QiIHx8IEFycmF5LmlzQXJyYXkoYm9keSkpIHJldHVybiBqc29uKHsgZXJyb3I6ICJiYWRfYm9keSIsIG1lc3NhZ2U6ICJUaGUgcmVxdWVzdCBib2R5IG11c3QgYmUgYSBKU09OIG9iamVjdC4iIH0sIDQwMCk7CiAgICB9CiAgICBpZiAocXVlcnkuaGFzKCJjYWNoZU9ubHkyNDIiKSB8fCBxdWVyeS5oYXMoImtleVZlcnNpb24iKSB8fCAoYm9keSAhPT0gbnVsbCAmJiB0eXBlb2YgYm9keSA9PT0gIm9iamVjdCIgJiYgImtleVZlcnNpb24iIGluIGJvZHkpKSB7CiAgICAgIGNvbnN0IHZlcnNpb25zPXF1ZXJ5LmdldEFsbCgna2V5VmVyc2lvbicpOwogICAgICBpZihyZXF1ZXN0Lm1ldGhvZD09PSdHRVQnJiZwYXRoPT09Jy9xdWV1ZS9sYXVuY2gtb3BlcmF0aW9ucycmJnZlcnNpb25zLmxlbmd0aD09PTEmJnZlcnNpb25zWzBdPT09J29mZmljZXItb3BlcmF0aW9ucy12MjMzJylyZXR1cm4gaGFuZGxlTGF1bmNoT3BlcmF0aW9uczIyOShyZXF1ZXN0LGVudix0cnVlKTsK","toBase64":"ICAgICAgaWYgKGJvZHkgPT09IG51bGwgfHwgdHlwZW9mIGJvZHkgIT09ICJvYmplY3QiIHx8IEFycmF5LmlzQXJyYXkoYm9keSkpIHJldHVybiBqc29uKHsgZXJyb3I6ICJiYWRfYm9keSIsIG1lc3NhZ2U6ICJUaGUgcmVxdWVzdCBib2R5IG11c3QgYmUgYSBKU09OIG9iamVjdC4iIH0sIDQwMCk7CiAgICB9CiAgICBpZiAocXVlcnkuaGFzKCJrZXlWZXJzaW9uIikgfHwgKGJvZHkgIT09IG51bGwgJiYgdHlwZW9mIGJvZHkgPT09ICJvYmplY3QiICYmICJrZXlWZXJzaW9uIiBpbiBib2R5KSkgewogICAgICBjb25zdCB2ZXJzaW9ucz1xdWVyeS5nZXRBbGwoJ2tleVZlcnNpb24nKTsKICAgICAgaWYocmVxdWVzdC5tZXRob2Q9PT0nR0VUJyYmcGF0aD09PScvcXVldWUvbGF1bmNoLW9wZXJhdGlvbnMnJiZ2ZXJzaW9ucy5sZW5ndGg9PT0xJiZ2ZXJzaW9uc1swXT09PSdvZmZpY2VyLW9wZXJhdGlvbnMtdjIzMycpcmV0dXJuIGhhbmRsZUxhdW5jaE9wZXJhdGlvbnMyMjkocmVxdWVzdCxlbnYsdHJ1ZSk7Cg==","fromSHA256":"b1cc65beebac23c82f9d4c288ee56296c48ee7ceb7c0403a1a4b8d70558f7082","toSHA256":"d5c9592dfd938a2efd87accc0434b10a6e6746c4fa43b0a02e455572c60bf778","fromBytes":540,"toBytes":511},{"fromBase64":"ICAgICAgfQogICAgICBjb25zdCBwcmVzZW5jZU9ubHk9cmVxdWVzdC5tZXRob2Q9PT0nR0VUJyYmcGF0aD09PScvcXVldWUnJiZxdWVyeS5nZXRBbGwoJ3ByZXNlbmNlT25seScpLmluY2x1ZGVzKCcxJyk7CiAgICAgIGNvbnN0IGxhdW5jaD1jYXB0dXJlTGF1bmNoVmVyaWZpY2F0aW9uKGVudiksaW5nZXN0PXJlcXVlc3QubWV0aG9kPT09J1BPU1QnJiZbJy9pbmdlc3QvdmVyaWZ5JywnL2luZ2VzdC9yb3N0ZXInLCcvaW5nZXN0L2V2ZW50cycsJy9pbmdlc3QvaW50YWtlMjQyJ10uaW5jbHVkZXMocGF0aCkmJmxhdW5jaC5tb2RlPT09J21lbWJlcnMtb25seScmJiEhbGF1bmNoLnNjb3BlJiZsYXVuY2guY3VycmVudCgpOwogICAgICBjb25zdCBjYWNoZU9ubHkyNDI9cmVxdWVzdC5tZXRob2Q9PT0nR0VUJyYmcGF0aD09PScvcXVldWUnJiZxdWVyeS5zaXplPT09MiYmcXVlcnkuZ2V0QWxsKCdjYWNoZU9ubHkyNDInKS5sZW5ndGg9PT0xJiZxdWVyeS5nZXQoJ2NhY2hlT25seTI0MicpPT09JzEnOwogICAgICBpZihjYWNoZU9ubHkyNDImJnZlcnNpb25zLmxlbmd0aD09PTEmJnZlcnNpb25zWzBdPT09J2xhdW5jaC1tZW1iZXJzaGlwLXYxJyYmbGF1bmNoLm1vZGU9PT0nbWVtYmVycy1vbmx5JyYmISFsYXVuY2guc2NvcGUmJmxhdW5jaC5jdXJyZW50KCkpcmV0dXJuIGdldFF1ZXVlKGVudiwnJyxmYWxzZSx0cnVlKTsKICAgICAgaWYocXVlcnkuaGFzKCdjYWNoZU9ubHkyNDInKXx8dmVyc2lvbnMubGVuZ3RoIT09MXx8dmVyc2lvbnNbMF0hPT0nbGF1bmNoLW1lbWJlcnNoaXAtdjEnfHxib2R5IT09bnVsbCYmdHlwZW9mIGJvZHk9PT0nb2JqZWN0JyYmJ2tleVZlcnNpb24naW4gYm9keXx8IXByZXNlbmNlT25seSYmIWluZ2VzdCkKICAgICAgICByZXR1cm4ganNvbih7IGVycm9yOiAidW5zdXBwb3J0ZWRfcHJvdG9jb2wiLCBtZXNzYWdlOiAiVGhpcyBXb3JrZXIgc2VydmVzIHRoZSB1bnZlcnNpb25lZCBwcm90b2NvbCBvbmx5OyBhIGtleVZlcnNpb24gaXMgbm90IHN1cHBvcnRlZC4iIH0sIDQwMCk7CiAgICAgIGlmKGluZ2VzdCllbnY9bGF1bmNoVmVyaWZpY2F0aW9uRW52KGVudixsYXVuY2gpOwogICAgfQogICAgaWYocmVxdWVzdC5tZXRob2Q9PT0nUE9TVCcmJnBhdGg9PT0nL2luZ2VzdC9pbnRha2UyNDInKXJldHVybiBwb3N0SW50YWtlMjQyKGVudixib2R5KTsKICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gIlBPU1QiICYmIHBhdGggPT09ICIvaW5nZXN0L3ZlcmlmeSIpIHJldHVybiBhd2FpdCBwb3N0VmVyaWZ5KGVudiwgYm9keSxyb2xlRGlzcGF0Y2gpOwogICAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAiUE9TVCIgJiYgcGF0aCA9PT0gIi9pbmdlc3Qvcm9zdGVyIikgcmV0dXJuIGF3YWl0IHBvc3RSb3N0ZXIoZW52LCBib2R5LCBjdHggPyAobGFiZWwsIHdvcmspID0+IGRlZmVyT3JpZ2luYWxTZXJ2aW5nKGN0eCwgbGFiZWwsIHdvcmspIDogdW5kZWZpbmVkLHJvbGVEaXNwYXRjaCk7Cg==","toBase64":"ICAgICAgfQogICAgICBjb25zdCBwcmVzZW5jZU9ubHk9cmVxdWVzdC5tZXRob2Q9PT0nR0VUJyYmcGF0aD09PScvcXVldWUnJiZxdWVyeS5nZXRBbGwoJ3ByZXNlbmNlT25seScpLmluY2x1ZGVzKCcxJyk7CiAgICAgIGNvbnN0IGxhdW5jaD1jYXB0dXJlTGF1bmNoVmVyaWZpY2F0aW9uKGVudiksaW5nZXN0PXJlcXVlc3QubWV0aG9kPT09J1BPU1QnJiZbJy9pbmdlc3QvdmVyaWZ5JywnL2luZ2VzdC9yb3N0ZXInLCcvaW5nZXN0L2V2ZW50cyddLmluY2x1ZGVzKHBhdGgpJiZsYXVuY2gubW9kZT09PSdtZW1iZXJzLW9ubHknJiYhIWxhdW5jaC5zY29wZSYmbGF1bmNoLmN1cnJlbnQoKTsKICAgICAgaWYodmVyc2lvbnMubGVuZ3RoIT09MXx8dmVyc2lvbnNbMF0hPT0nbGF1bmNoLW1lbWJlcnNoaXAtdjEnfHxib2R5IT09bnVsbCYmdHlwZW9mIGJvZHk9PT0nb2JqZWN0JyYmJ2tleVZlcnNpb24naW4gYm9keXx8IXByZXNlbmNlT25seSYmIWluZ2VzdCkKICAgICAgICByZXR1cm4ganNvbih7IGVycm9yOiAidW5zdXBwb3J0ZWRfcHJvdG9jb2wiLCBtZXNzYWdlOiAiVGhpcyBXb3JrZXIgc2VydmVzIHRoZSB1bnZlcnNpb25lZCBwcm90b2NvbCBvbmx5OyBhIGtleVZlcnNpb24gaXMgbm90IHN1cHBvcnRlZC4iIH0sIDQwMCk7CiAgICAgIGlmKGluZ2VzdCllbnY9bGF1bmNoVmVyaWZpY2F0aW9uRW52KGVudixsYXVuY2gpOwogICAgfQogICAgaWYgKHJlcXVlc3QubWV0aG9kID09PSAiUE9TVCIgJiYgcGF0aCA9PT0gIi9pbmdlc3QvdmVyaWZ5IikgcmV0dXJuIGF3YWl0IHBvc3RWZXJpZnkoZW52LCBib2R5LHJvbGVEaXNwYXRjaCk7CiAgICBpZiAocmVxdWVzdC5tZXRob2QgPT09ICJQT1NUIiAmJiBwYXRoID09PSAiL2luZ2VzdC9yb3N0ZXIiKSByZXR1cm4gYXdhaXQgcG9zdFJvc3RlcihlbnYsIGJvZHksIGN0eCA/IChsYWJlbCwgd29yaykgPT4gZGVmZXJPcmlnaW5hbFNlcnZpbmcoY3R4LCBsYWJlbCwgd29yaykgOiB1bmRlZmluZWQscm9sZURpc3BhdGNoKTsK","fromSHA256":"e066a701fe6aa293fda9e7986f83aadba88a89c4f8dd0fc145779a6992c99215","toSHA256":"eed22b826f05b258ae84cabd78c345d649982e24751fd3e3c425e55e68c56dfb","fromBytes":1474,"toBytes":999},{"fromBase64":"Ci8qKiBCdW1wZWQgd2l0aCBldmVyeSBjaGFuZ2UgdGhhdCBuZWVkcyBhIHJlZGVwbG95LCBzbyBHRVQgL2hlYWx0aCBzaG93cyB3aGljaCBidWlsZCBpcyBsaXZlLiAqLwpjb25zdCBCVUlMRCA9ICIyMDI2LTExLTEwLjI2NSBCb3VuZGVkIGF1ZGl0IGxvb2t1cHMiOwoKLyoqCg==","toBase64":"Ci8qKiBCdW1wZWQgd2l0aCBldmVyeSBjaGFuZ2UgdGhhdCBuZWVkcyBhIHJlZGVwbG95LCBzbyBHRVQgL2hlYWx0aCBzaG93cyB3aGljaCBidWlsZCBpcyBsaXZlLiAqLwpjb25zdCBCVUlMRCA9ICIyMDI2LTExLTA5LjI0MSBSZWNlbnQgcmFuayBjaGFuZ2VzIGJlZm9yZSBjYXRjaHVwIjsKCi8qKgo=","fromSHA256":"65c7334cac2c89190723078496ec97e62b61a7a3222f482b982b4c3319dfa4cd","toSHA256":"bb70feeee7440a222a07c7e5d5fbf61af5344f51678aaaafa01f6b4d9a33409f","fromBytes":157,"toBytes":170}]});
Object.freeze(STATIC_INDEX265.windows);for(const row of STATIC_INDEX265.windows)Object.freeze(row);
function acceptedIndex241Static265(raw){
 const hash=text=>require('node:crypto').createHash('sha256').update(text).digest('hex');
 assert.equal(typeof raw,'string','exact265 static source text');assert.equal(Buffer.byteLength(raw),STATIC_INDEX265.currentBytes,'exact265 static source bytes');assert.equal(hash(raw),STATIC_INDEX265.currentSHA256,'exact265 whole static source');assert.equal(STATIC_INDEX265.windows.length,8,'eight finite265 static windows');
 let old=raw;for(const row of STATIC_INDEX265.windows){const from=Buffer.from(row.fromBase64,'base64').toString('utf8'),to=Buffer.from(row.toBase64,'base64').toString('utf8');assert.equal(Buffer.byteLength(from),row.fromBytes);assert.equal(Buffer.byteLength(to),row.toBytes);assert.equal(hash(from),row.fromSHA256);assert.equal(hash(to),row.toSHA256);assert.equal(old.split(from).length,2,'one exact265 static window');old=old.replace(from,()=>to);}
 assert.equal(Buffer.byteLength(old),70008,'unchanged241 source bytes');assert.equal(hash(old),'8b8c367e51ca14e207ad11932364d69cc8fbafb4655c194b99b9c72397e9071c','unchanged241 whole source');return old;
}
function static265Controls(raw){
 const old=acceptedIndex241Static265(raw),outside=Buffer.from(STATIC_INDEX265.outsideLineBase64,'base64').toString('utf8');assert.equal(raw.split(outside).length,2,'one unchanged outside-window line');
 const probes=[['prefix','// unreviewed265\n'+raw],['suffix',raw+'\n// unreviewed265\n'],['CRLF',raw.replace(/\n/g,'\r\n')],['old241 cannot masquerade as265',old],['outside-window byte',raw.replace(outside,outside+' ')]];
 for(const[i,row]of STATIC_INDEX265.windows.entries()){const from=Buffer.from(row.fromBase64,'base64').toString('utf8');probes.push(['missing window '+i,raw.replace(from,'')],['duplicate window '+i,raw.replace(from,from+from)],['changed window '+i,raw.replace(from,from+'/* unreviewed265 */')]);}
 return probes.map(([name,candidate])=>{let refused=false;try{acceptedIndex241Static265(candidate);}catch{refused=true;}return{name,refused:candidate!==raw&&refused};});
}
// AST inventory preserves the exact historical guard policy; it never dispatches a body or mints custody.
function parseSource(name){const raw=fs.readFileSync(path.join(root,'src',name),'utf8'),text=name==='index.ts'?require(path.join(__dirname,'canonical_rank239_schedule_source.cjs')).historicalIndexSource239(acceptedIndex241Static265(raw)):raw;const sf=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(sf.parseDiagnostics.length,0,'source parses '+name);return sf;}
function allNodes(node,predicate){const found=[];function visit(value){if(predicate(value))found.push(value);ts.forEachChild(value,visit);}visit(node);return found;}
function sole(values,label){assert.equal(values.length,1,label);return values[0];}
function tokens(text){const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,text),out=[];for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan())out.push([kind,scanner.getTokenText()]);return out;}
function exactSyntax(node,text,label){assert.deepEqual(tokens(node.getText()),tokens(text),label);}
function declaration(sf,name){return sole(sf.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),'sole function '+name);}
function namedCall(node,name){return ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===name;}
function assertFalseExport(file,name){const sf=parseSource(file),statement=sole(sf.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text===name)),name);assert.ok(statement.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword));const variable=sole(statement.declarationList.declarations.filter(item=>item.name.text===name),name);exactSyntax(variable.initializer,'false as const',name+' remains literal false');}
function assertTrueExport(file,name){const sf=parseSource(file),statement=sole(sf.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text===name)),name);assert.ok(statement.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword));const variable=sole(statement.declarationList.declarations.filter(item=>item.name.text===name),name);exactSyntax(variable.initializer,'true as const',name+' is literal true');}
function sourceInventory(){
 assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'canonical_rank239_schedule_source.cjs'))).digest('hex'),'2e86c17c8308ce338369973006ded32f8d3e9c247e321f3dcf283119667236f7','reviewed241 schedule static helper differs');
 const static239=require(path.join(__dirname,'canonical_rank239_schedule_source.cjs')),currentIndexRaw=fs.readFileSync(path.join(root,'src/index.ts'),'utf8');
 for(const row of static265Controls(currentIndexRaw))check('.251 exact static bridge refuses '+row.name,row.refused);
 for(const row of static239.controls(acceptedIndex241Static265(currentIndexRaw)))check('.239 exact BUILD static prepend refuses '+row.name,row.refused);
 const sf=parseSource('index.ts'),exports=sf.statements.filter(node=>ts.isExportAssignment(node)&&!node.isExportEquals);
 const defaultObject=sole(exports,'one default export').expression;assert.ok(ts.isObjectLiteralExpression(defaultObject));
 const method=sole(defaultObject.properties.filter(node=>ts.isMethodDeclaration(node)&&node.name.getText()==='scheduled'),'one scheduled method');
 const guarded=sole(method.body.statements.filter(ts.isTryStatement),'scheduled try');assert.equal(method.body.statements.length,3);
 exactSyntax(method.body.statements[0],'env=nativeServingEnvironment(env);','synchronous Native environment normalization before the original dispatch capture');
 exactSyntax(method.body.statements[1],'const roleDispatch=captureBetaRoleDispatch(env);','synchronous original beta dispatch capture uses the normalized environment before the first await');
 assert.equal(method.body.statements[2],guarded,'the original guarded body follows Native normalization and the one entry capture');
 sole(allNodes(method,node=>namedCall(node,'nativeServingEnvironment')),'one originating Native environment normalization');
 assert.equal(method.body.statements.slice(0,2).flatMap(node=>allNodes(node,ts.isAwaitExpression)).length,0,'normalization and original capture are synchronous');
 sole(allNodes(method,node=>namedCall(node,'captureBetaRoleDispatch')),'one originating beta dispatch capture; never recaptured after an await');
 const fetch=sole(defaultObject.properties.filter(node=>ts.isMethodDeclaration(node)&&node.name.getText()==='fetch'),'one fetch method');
 exactSyntax(fetch.body.statements[0],'env=nativeServingEnvironment(env);','fetch normalizes the Native environment at its true entry');
 exactSyntax(fetch.body.statements[1],'const roleDispatch=captureBetaRoleDispatch(env);','fetch captures the original dispatch restriction from that same normalized environment');
 sole(allNodes(fetch,node=>namedCall(node,'nativeServingEnvironment')),'fetch normalizes once before an await');
 assert.equal(fetch.body.statements.slice(0,2).flatMap(node=>allNodes(node,ts.isAwaitExpression)).length,0,'fetch normalization and capture are synchronous');
 check('Native normalization precedes the original same-environment dispatch capture in both public entry points',true);
 const expected=[
  "scheduledIntrinsics();",
  "const admission=scheduledDescriptor(env,'PRIVACY_WRITE_ADMISSION_ENABLED');",
  "if(!admission&&'PRIVACY_WRITE_ADMISSION_ENABLED'in env||admission&&!scheduledHasOwn(admission,'value'))return scheduledHeld();",
  "const original=captureOriginalScheduledCallback(event,ctx),scheduled=originalScheduledCallback(original,event,ctx);",
  "const resetMinute=scheduled.cron===BETA_RESET_CRON;",
  "if(resetMinute&&!resetGuardEnabled(env))return;",
  "if(admission?.value==='true'&&!EPOCH2_SCHEDULE_QUALIFIED)throw new PrivacyWriteAdmissionHeld('epoch2_schedule_700_requires_current_native_qualification');",
  "if(resetMinute&&!BETA_RESET_SCHEDULE_QUALIFIED)throw new PrivacyWriteAdmissionHeld('beta_reset_minute_requires_current_native_qualification');",
  "const check=()=>{originalScheduledCallback(original,event,ctx);};",
  "const constraint=resetMinute?scheduledFreeze({binding:scheduled.binding,check,costMode:'beta_reset' as const}):scheduledFreeze({binding:scheduled.binding,check});",
  "originalScheduledCallback(original,event,ctx);",
  "const globalEntry=captureGlobalServingEntry(env,ctx,'scheduled',undefined,constraint);",
  "scheduledCostConstraints.set(original,constraint);",
  "await dispatchGlobalServingEntry(globalEntry,()=>{originalScheduledCallback(original,event,ctx);return resetMinute?runSourceBetaResetScheduledBody(globalEntry.env,ctx,roleDispatch):runSourceEpoch2ScheduledBody(globalEntry.env,ctx,undefined,roleDispatch);});"
 ];
 // Keep all fourteen original guard/order oracles. Exactly two read-only cost
 // closures are inserted before the final dispatch; only its two callback args
 // are additive. Any other statement, callback source or reordered guard fails.
 const costReaders=[
  "const roleSliceCost=():OriginalScheduledSliceCost|null=>{const facts=originalScheduledCallbackPhysicalCostObservation(event,ctx);const row=facts.jobs.find(job=>job.job==='sweepMemberRoles');return row?Object.freeze({state:row.state,statements:row.statements,pendingGroups:row.pendingGroups,failedGroups:row.failedGroups}):null;};",
  "const newsSliceCost=():OriginalScheduledSliceCost|null=>{const facts=originalScheduledCallbackPhysicalCostObservation(event,ctx),row=facts.jobs.find(job=>job.job==='newsCron');return row?Object.freeze({state:row.state,statements:row.statements,pendingGroups:row.pendingGroups,failedGroups:row.failedGroups}):null;};"
 ];
 assert.equal(expected.length,14,'fourteen original scheduled guard/order oracles retained');
 assert.equal(guarded.tryBlock.statements.length,expected.length+costReaders.length,'only two read-only original-job cost readers added');
 costReaders.forEach((text,i)=>exactSyntax(guarded.tryBlock.statements[expected.length-1+i],text,'source-owned cost reader '+i));
 const originalPrefix='runSourceEpoch2ScheduledBody(globalEntry.env,ctx,undefined,roleDispatch)',extendedPrefix='runSourceEpoch2ScheduledBody(globalEntry.env,ctx,undefined,roleDispatch,roleSliceCost,newsSliceCost)';
 assert.equal(expected[13].split(originalPrefix).length,2,'original final dispatch has one ordinary body invocation');
 expected.forEach((text,i)=>exactSyntax(guarded.tryBlock.statements[i<13?i:i+costReaders.length],i===13?text.replace(originalPrefix,extendedPrefix):text,'scheduled guard/order '+i));
 check('exact two job-bound original cost readers add no new callback authority or top-level scheduled work',true);
 exactSyntax(guarded.catchClause,"catch(e){console.error(\"cron entry held; skipping this run\",errorRef(e));}",'original redacted catch');
 assertFalseExport('beta-reset.ts','BETA_RESET_SCHEDULE_QUALIFIED');assertTrueExport('scheduled-budget.ts','EPOCH2_SCHEDULE_QUALIFIED');
 check('source scheduled capture precedes inactive/false qualifiers and global dispatch',true);
 check('the synchronous entry restriction is passed unchanged to both minute and ordinary bodies, retaining the original schedule slot',true);
 check('.161: loaded minute qualifier remains false and the ordinary qualifier is true',engine.BETA_RESET_SCHEDULE_QUALIFIED===false&&load('scheduled-budget').EPOCH2_SCHEDULE_QUALIFIED===true);
 const capture=declaration(sf,'captureOriginalScheduledCallback');
 const shape=sole(capture.body.statements.filter(node=>ts.isIfStatement(node)&&node.expression.getText().startsWith('keys.length!==2')),'controller shape guard');
 exactSyntax(shape.expression,"keys.length!==2||!(keys[0]==='scheduledTime'&&keys[1]==='cron'||keys[0]==='cron'&&keys[1]==='scheduledTime')||!time||!cron||!scheduledHasOwn(time,'value')||!scheduledHasOwn(cron,'value')||time.writable!==false||cron.writable!==false||time.enumerable!==true||cron.enumerable!==true||time.configurable!==true||cron.configurable!==true||typeof time.value!=='number'||!scheduledSafeInteger(time.value)||time.value<0||time.value>253402300799999||(cron.value!=='*/15 * * * *'&&cron.value!==BETA_RESET_CRON)||!prototype||!contextPrototype",'complete original controller shape guard');
 exactSyntax(shape.thenStatement,'return scheduledHeld();','controller shape refuses before cap');
 const context=sole(capture.body.statements.filter(node=>ts.isIfStatement(node)&&node.expression.getText()==="scheduledDescriptor(ctx,'waitUntil')"),'own context guard');exactSyntax(context.thenStatement,'return scheduledHeld();','own waitUntil refused');
 assert.ok(shape.pos<context.pos&&context.pos<sole(allNodes(capture,node=>namedCall(node,'scheduledApply')&&node.arguments[0]?.getText()==='retry.value'),'original noRetry call').pos);
 check('source unowned descriptor guards precede native method invocation',true);
 const minute=declaration(sf,'runSourceBetaResetScheduledBody');assert.ok(!minute.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword));
 assert.equal(minute.parameters.length,3);exactSyntax(minute.parameters[2],'originalDispatch?:BetaRoleDispatch','private minute original entry pair parameter');
 const minuteExpected=["const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);","assertGlobalServingDispatch(env);","if(!resetGuardEnabled(env))return;","try{env=writeAdmissionEnv(env);await ensureSchema(env);}catch(e){try{console.error('beta reset schema check held',errorRef(e),heldCause(e));}catch{}return;}","deferOriginalServing(ctx,'runBetaResetSlice',()=>runBetaResetSlice(env,roleDispatch).catch(e=>console.error('beta reset continuation held',errorRef(e))));"];
 assert.equal(minute.body.statements.length,minuteExpected.length);minuteExpected.forEach((text,i)=>exactSyntax(minute.body.statements[i],text,'private minute body '+i));
 check('private minute source retains dispatch guard schema and one reset defer',true);
 const ordinary=declaration(sf,'runSourceEpoch2ScheduledBody');
 assert.equal(ordinary.parameters.length,6);exactSyntax(ordinary.parameters[2],'originalSchedule?:OriginalRosterSchedule','ordinary original schedule remains the third argument');exactSyntax(ordinary.parameters[3],'originalDispatch?:BetaRoleDispatch','ordinary original entry pair is additive fourth argument');
 exactSyntax(ordinary.parameters[4],'readOriginalRoleCost?:()=>OriginalScheduledSliceCost|null','only original role-slice cost is additive fifth argument');
 exactSyntax(ordinary.parameters[5],'readOriginalNewsCost?:()=>OriginalScheduledSliceCost|null','only original news-slice cost is additive sixth argument');
 const defers=allNodes(ordinary,node=>namedCall(node,'deferOriginalServing'));
 const labels=['sweepInviteQueue','sweepMemberRoles','continueRosterEffects','refreshNames','autoQueueReserved','purgeSeenInteractions','purgeBattleNetData','sweepRenameHolds','sweepCommunityProfiles','sweepCommunityEvents','runEventReminders','sweepCommunityTrials','sweepCommunityRestrictions','departureIntake','sweepCommunityDepartures','openWeeklyObligations','sweepCommunityContributions','sweepCommunityPrivacy','newsCron','runOfficerDigest','runServingErasureJob','sweepServingRetention','sweepRejectionExpiry'];
 assert.deepEqual(defers.map(call=>{assert.equal(call.arguments.length,3);assert.ok(ts.isIdentifier(call.arguments[0])&&call.arguments[0].text==='ctx'&&ts.isStringLiteral(call.arguments[1])&&ts.isArrowFunction(call.arguments[2]));return call.arguments[1].text;}),labels);
 for(let i=0;i<labels.length;i++){const call=sole(allNodes(defers[i].arguments[2],node=>namedCall(node,labels[i])),'original deferred job '+labels[i]);assert.equal(call.arguments[0].getText(),'env');}
 for(const [label,condition] of [['departureIntake','communityFeatures(env).has("departures")'],['openWeeklyObligations','communityFeatures(env).has("contributions")']]){const call=defers[labels.indexOf(label)],parent=call.parent.parent;assert.ok(ts.isIfStatement(parent)&&parent.thenStatement===call.parent);exactSyntax(parent.expression,condition,label+' condition');}
 exactSyntax(defers[labels.indexOf('newsCron')].arguments[2],"async()=>{if(!rosterCadence.newsEnabled)return;await newsCron(env);let cost:OriginalScheduledSliceCost|null=null;try{cost=readOriginalNewsCost?.()??null;}catch{return;}if(!cost||cost.state!=='running'||cost.pendingGroups!==0||cost.failedGroups!==0||!Number.isSafeInteger(cost.statements)||cost.statements<0||cost.statements>31)return;if(31-cost.statements<NEWS_WEBHOOK_METADATA_EXPIRY_PHYSICAL_BOUND)return;try{await newsWebhookMetadataExpiryPlan(env).run();}catch(e){console.error('news webhook metadata expiry held',errorRef(e));}}",'original news cadence and one original job precede only budgeted metadata expiry');
 assert.equal(load('site-news-webhook').NEWS_WEBHOOK_METADATA_EXPIRY_PHYSICAL_BOUND,5,'news metadata expiry keeps its five-statement bound inside the original 31-statement slice');
 sole(allNodes(defers[labels.indexOf('newsCron')],node=>namedCall(node,'newsWebhookMetadataExpiryPlan')),'one metadata expiry plan inside the original news defer');
 exactSyntax(sole(allNodes(defers[1],node=>namedCall(node,'sweepMemberRoles')),'member role dispatch'),'sweepMemberRoles(env,"cron",calls,roleDispatch)','member role sweep retains cron mode and receives the original restriction and same bounded call budget');
 exactSyntax(defers[1].arguments[2],"async()=>{const calls=callBudget(env);await sweepMemberRoles(env,\"cron\",calls,roleDispatch);let cost:OriginalScheduledSliceCost|null=null;try{cost=readOriginalRoleCost?.()??null;}catch{return;}if(!cost||cost.state!=='running'||cost.pendingGroups!==0||cost.failedGroups!==0||!Number.isSafeInteger(cost.statements)||cost.statements<0||cost.statements>120)return;const remaining=120-cost.statements;if(remaining<TREASURY_EXPIRY_SQL_MAX||calls.limit-calls.attempts<TREASURY_EXPIRY_HTTP_MAX)return;try{await expireTreasuryCosmeticRoles(env,{sqlRemaining:remaining,calls});}catch(e){console.error('cosmetic expiry held',errorRef(e));}}",'original role job precedes only remaining-budget expiry, sharing its exact HTTP budget');
 assert.equal(load('role-settlements').TREASURY_EXPIRY_SQL_MAX,64,'cosmetic expiry keeps its original 64-statement maximum');
 assert.equal(load('role-settlements').TREASURY_EXPIRY_HTTP_MAX,8,'cosmetic expiry keeps its original eight-call maximum');
 sole(allNodes(defers[1],node=>namedCall(node,'callBudget')),'one shared role call budget');
 sole(allNodes(defers[1],node=>namedCall(node,'expireTreasuryCosmeticRoles')),'one cosmetic expiry invocation inside the original role defer');
 check('both added continuations refuse absent/failed observations and fit only unused original SQL/HTTP slices',true);
 exactSyntax(sole(allNodes(defers[2],node=>namedCall(node,'continueRosterEffects')),'roster dispatch'),'continueRosterEffects(env,rosterSchedule,roleDispatch)','original roster schedule and entry restriction');
 exactSyntax(sole(allNodes(defers[7],node=>namedCall(node,'sweepRenameHolds')),'rename cleanup'),'sweepRenameHolds(env)','rename cleanup retains its original env-only invocation');
 exactSyntax(sole(allNodes(defers[21],node=>namedCall(node,'sweepServingRetention')),'retention dispatch'),'sweepServingRetention(env,originalRetentionSchedule)','original retention schedule');
 exactSyntax(ordinary.body.statements[0],'const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);','ordinary retains the entry restriction before schedule capture or await');
 sole(allNodes(ordinary,node=>namedCall(node,'captureBetaRoleDispatch')),'ordinary fallback capture occurs only at its entry');
 exactSyntax(ordinary.body.statements[1],'const originalRetentionSchedule=captureServingRetentionSchedule(),rosterSchedule=originalSchedule??captureOriginalRosterSchedule();','original schedule captures');
 exactSyntax(ordinary.body.statements[2],'const rosterCadence=originalRosterScheduleFacts(rosterSchedule);','original cadence facts');
 exactSyntax(ordinary.body.statements[3],'assertGlobalServingDispatch(env);','ordinary dispatch guard');
 check('ordinary source retains all 23 ordered jobs and original conditions/schedules',true);return labels;
}
(async()=>{
 const ordinaryLabels=sourceInventory();
 const triggers=[...fs.readFileSync(path.join(root,'wrangler.toml'),'utf8').matchAll(/^crons\s*=\s*(\[[^\r\n]+\])/gm)];
 const currentConfig=fs.readFileSync(path.join(root,'wrangler.toml'),'utf8'),betaFlagRows=[...currentConfig.matchAll(/^BETA_RESET_REMOVALS_ENABLED\s*=\s*["']([^"'\r\n]*)["']/gm)],canonicalRows=[...currentConfig.matchAll(/^CANONICAL_RANKS233\s*=\s*'([^'\r\n]+)'/gm)];
 const currentCanonical=canonicalRows.length===1?JSON.parse(canonicalRows[0][1]):null;
 check('shipping config preserves quarter and adds only canonical-profile minute with Beta removals OFF',triggers.length===1&&JSON.stringify(JSON.parse(triggers[0][1]))===JSON.stringify(['*/15 * * * *','* * * * *'])&&betaFlagRows.length<=1&&(betaFlagRows.length===0||betaFlagRows[0][1]==='false')&&currentCanonical?.version===1&&currentCanonical.enabled===true&&currentCanonical.profile==='olympus-canonical-ranks-20261106-v1'&&JSON.stringify(load('scheduled-budget').CANONICAL_RANK_SCHEDULED_BUDGET.map(row=>row.job))===JSON.stringify(['ensureSchema','runCanonicalRankPass']));
 for(const flag of [undefined,'false','TRUE','',null]){
  await reset(false,6);schema.forgetSchemaCheck();if(flag===undefined)delete env.BETA_RESET_REMOVALS_ENABLED;else env.BETA_RESET_REMOVALS_ENABLED=flag;
  await sentinel();physical=0;const {result,cost}=await scheduled('unowned minute flag '+String(flag),'* * * * *');
  check('unowned minute '+String(flag)+' returns before SQL HTTP or waitUntil',cost.physical===0&&cost.http===0&&result.jobs===0&&effects().length===0&&scan()===null);
  check('unowned minute '+String(flag)+' never runs ordinary maintenance',sentinelPresent());
 }
 await reset(false,6);schema.forgetSchemaCheck();let getterCalls=0;Object.defineProperty(env,'BETA_RESET_REMOVALS_ENABLED',{get(){getterCalls++;return 'true';}});physical=0;
 const malformed=await scheduled('unowned minute with reset accessor','* * * * *');check('unowned callback returns before schema without invoking reset accessor',malformed.cost.physical===0&&malformed.cost.http===0&&malformed.result.jobs===0&&getterCalls===0);
 for(const installed of [false,true]){
  await reset(installed,6);schema.forgetSchemaCheck();await sentinel();
  if(installed){env.DB=d1();env.PRIVACY_WRITE_ADMISSION_ENABLED='true';}
  physical=0;const label=installed?'legacy true Native port':'legacy false admitted fixture writer';
  check(label+' has current admission enabled',Object.getOwnPropertyDescriptor(env,'PRIVACY_WRITE_ADMISSION_ENABLED').value==='true');
  const {result,cost}=await scheduled(label+' first minute','* * * * *');
  check(label+' first unowned entry schedules no reset job',result.jobs===0&&result.values.length===0);
  check(label+' first invocation preserves six targets with no SQL or HTTP work',cost.physical===0&&cost.http===0&&cost.deletes===0&&targetCount()===6);
  check(label+' schema work is not entered',cost.physical===0);
  check(label+' preserves cursor and pending reset receipts',scan()===null&&jobs().length===0);
  check(label+' minute input does not purge expired maintenance data',sentinelPresent());
  check(label+' preserves target and protected Discord roles',directory.every(id=>JSON.stringify(members.get(id))===JSON.stringify([memberRole,...preserved])));
  unchangedPrivate(label+' unowned entry',{scope:'entry-refusal-counts',jobs:result.jobs,http:cost.http,targetCount:targetCount()});
  const repeated=await scheduled(label+' repeated unowned minute','* * * * *');
  check(label+' repeated unowned minute remains inert',repeated.result.jobs===0&&repeated.cost.deletes===0&&repeated.cost.http===0&&sentinelPresent()&&repeated.cost.physical===0&&targetCount()===6);
 }
 await reset(false,0,[]);schema.forgetSchemaCheck();env.BETA_RESET_REMOVALS_ENABLED='false';env.COMMUNITY_FEATURES='departures,contributions';await sentinel();physical=0;
 for(const cron of ['*/30 * * * *','*/15 * * * *']){
  const ordinary=await scheduled('unowned ordinary '+cron,cron);
  check('ordinary '+cron+' does not invoke maintenance from an unowned callback',ordinary.result.jobs===0);
  check('ordinary '+cron+' preserves sentinel without reset discovery',sentinelPresent()&&scan()===null&&!requests.some(x=>x.after!==null)&&effects().length===0);
 }
 check('all eleven historical attempts plus current ordinary input retained',scheduleCosts.length===12&&lookupErrors.length===12);
 console.log('BETA_RESET_SCHEDULE_SUMMARY '+JSON.stringify({checks,scope:'unowned-controller-entry-refusal-and-source-contract',attempts:scheduleCosts.length,ordinaryJobs:ordinaryLabels.length,ordinaryLabels,observerReads,costs:scheduleCosts,normalScheduledEntryQualified:false,minuteInactiveOriginalCallbackObserved:false,minuteDefaultFalseBoundaryObserved:false,minutePositiveEntryQualified:false,postCutoffNativeEffectsQualified:false,providerOrDeploymentQualified:false,fullCIQualified:false}));console.log(checks+'/'+checks+' checks passed');
})().catch(e=>{console.error(e);console.log('BETA_RESET_SCHEDULE_FAILURE '+JSON.stringify({checks,completedAttempts:scheduleCosts.length,costs:scheduleCosts,fullCIQualified:false}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',harness+cases)(__dirname,require);
