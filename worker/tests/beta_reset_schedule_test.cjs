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
 check(name+' returns undefined with only the original redacted catch log',result.returned===undefined&&JSON.stringify(result.logs)===JSON.stringify([['schema check failed; skipping this run','error']]));
 scheduleCosts.push(cost);console.log('SCHEDULE_ENTRY_REFUSAL '+JSON.stringify(cost));return {result,cost};
}

// AST inventory asserts current source policy; it never dispatches a body or mints custody.
function parseSource(name){const sf=ts.createSourceFile(name,fs.readFileSync(path.join(root,'src',name),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);assert.equal(sf.parseDiagnostics.length,0,'source parses '+name);return sf;}
function allNodes(node,predicate){const found=[];function visit(value){if(predicate(value))found.push(value);ts.forEachChild(value,visit);}visit(node);return found;}
function sole(values,label){assert.equal(values.length,1,label);return values[0];}
function tokens(text){const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,text),out=[];for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan())out.push([kind,scanner.getTokenText()]);return out;}
function exactSyntax(node,text,label){assert.deepEqual(tokens(node.getText()),tokens(text),label);}
function declaration(sf,name){return sole(sf.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),'sole function '+name);}
function namedCall(node,name){return ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===name;}
function assertFalseExport(file,name){const sf=parseSource(file),statement=sole(sf.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text===name)),name);assert.ok(statement.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword));const variable=sole(statement.declarationList.declarations.filter(item=>item.name.text===name),name);exactSyntax(variable.initializer,'false as const',name+' remains literal false');}
function assertTrueExport(file,name){const sf=parseSource(file),statement=sole(sf.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text===name)),name);assert.ok(statement.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword));const variable=sole(statement.declarationList.declarations.filter(item=>item.name.text===name),name);exactSyntax(variable.initializer,'true as const',name+' is literal true');}
function sourceInventory(){
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
 exactSyntax(guarded.catchClause,"catch(e){console.error(\"schema check failed; skipping this run\",errorRef(e));}",'original redacted catch');
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
 const minuteExpected=["const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);","assertGlobalServingDispatch(env);","if(!resetGuardEnabled(env))return;","try{env=writeAdmissionEnv(env);await ensureSchema(env);}catch(e){console.error('beta reset schema check held',errorRef(e));return;}","deferOriginalServing(ctx,'runBetaResetSlice',()=>runBetaResetSlice(env,roleDispatch).catch(e=>console.error('beta reset continuation held',errorRef(e))));"];
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
 check('inactive shipping configuration has sole quarter-hour and no minute trigger',triggers.length===1&&JSON.stringify(JSON.parse(triggers[0][1]))===JSON.stringify(['*/15 * * * *']));
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
