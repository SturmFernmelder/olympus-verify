// .162 guarded recovery successor, whole chain. The predecessor is the genuine mounted original install-and-reopen
// (current-cookie) on the shared Native fixture, failed in the post-Native-open tail exactly as the incident's
// observed tails a-d. The successor then runs through main's unchanged private-control adapter into the successor
// entry, over the same Native binding and the genuine Floor DO. No provider, deployment or production command.
'use strict';
const assert=require('node:assert/strict'),{webcrypto,createHash}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const J=require('./privacy_rejection_decision_test.cjs'),T=1800000000;
const WE='a'.repeat(32),CE='7'.repeat(32),NEXT='c'.repeat(32),NEXT_CE='6'.repeat(32),TREE='8'.repeat(40),CONTROL_TREE='e'.repeat(40),STREE='d'.repeat(40),DBID='7e2cf8fd-a9e3-48f6-975a-890f1360e5d0';
const VERSION='11111111-2222-3333-4444-555555555555',CONTROL_VERSION='33333333-4444-5555-6666-777777777777',NEW_VERSION='44444444-5555-6666-7777-888888888888',SVERSION='55555555-6666-7777-8888-999999999999';
const AUTH='synthetic-successor-chain-original-control',INITIALIZER='synthetic-successor-chain-initializer',OPERATOR='synthetic-successor-chain-operator',SERVING='synthetic-successor-chain-serving',SUCC='synthetic-successor-chain-worker-root',OWNER='synthetic-successor-chain-owner-root';
const RELEASE='f'.repeat(32),SOURCE='7'.repeat(40),FREEZE='8'.repeat(64),SMETA={id:SVERSION,tag:'synthetic-successor-control',timestamp:'2026-10-17T00:00:00Z'},SMETA_TUPLE=JSON.stringify([SMETA.id,SMETA.tag,SMETA.timestamp]);
let serial=0,checks=0;const measured=[];
const id=()=>(++serial).toString(16).padStart(32,'0'),epoch=()=>createHash('sha256').update('successor-chain-epoch'+(++serial)).digest('hex').slice(0,32),canon=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x)),at=()=>J.fixtureOriginalClock();
function eq(label,a,b){assert.deepEqual(canon(a),canon(b),label);checks++;console.log('PASS '+label);}
function yes(label,v){assert.ok(v,label);checks++;console.log('PASS '+label);}
const hmac=async(secret,text)=>Buffer.from(await webcrypto.subtle.sign('HMAC',await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),new TextEncoder().encode(text))).toString('hex');
const sha=t=>createHash('sha256').update(t).digest('hex');
function originalBinding(db){const trace=[],groups=[];let hook=null;
 const execute=(sql,params)=>{trace.push({sql,params});const s=DatabaseSync.prototype.prepare.call(db,sql),rows=s.columns().length?s.all(...params):(s.run(...params),[]);return{success:true,results:rows,meta:{changes:db.prepare('SELECT changes() n').get().n}};};
 function statement(sql,params=[]){return{statement:sql,params,bind(...values){return statement(sql,values);},async first(column){const row=execute(sql,params).results[0]??null;return column===undefined?row:row?.[column]??null;},async all(){return execute(sql,params);},async run(){return execute(sql,params);},execute:()=>execute(sql,params)};}
 const binding={prepare(sql){return statement(sql);},async batch(statements){groups.push(statements.map(s=>s.statement));const next=()=>{db.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>s.execute());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}};return hook?hook(statements,next):next();}};
 return{binding,trace,groups,hook:value=>hook=value};
}
/** Genuine Floor DO over Native SQLite; the env carries the base roots AND the two successor roots from the start. */
async function independent(f){const doDb=new DatabaseSync(':memory:',{defensive:true}),floor=f.L('privacy-recovery-floor'),gate=f.L('privacy-serving-recovery-gate');doDb.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(at());});const calls=[];let fetchHook=null;
 const storage={sql:{exec(text,...values){const s=doDb.prepare(text),rows=s.columns().length?s.all(...values):(s.run(...values),[]);return{toArray:()=>rows};}},transactionSync(fn){doDb.exec('BEGIN IMMEDIATE');try{const result=fn();doDb.exec('COMMIT');return result;}catch(error){doDb.exec('ROLLBACK');throw error;}},async setAlarm(){}};
 const object=new floor.PrivacyRecoveryFloor({storage},{PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,PRIVACY_SERVING_GATE_SECRET:SERVING,PRIVACY_RECOVERY_SUCCESSOR_SECRET:SUCC,PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET:OWNER});
 const value={operationId:id(),nonce:id(),requestDigest:'9'.repeat(64),createdAt:at(),expiresAt:at()+300,credentialEpoch:CE,writeEpoch:WE,sourceTree:TREE,deploymentVersion:VERSION},raw=JSON.stringify(value),mac=await floor.recoveryFloorMac(INITIALIZER,'POST','/v1/initialize',raw),response=await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/initialize',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Recovery-Proof':mac},body:raw}));assert.equal(response.status,200);const F=(await response.json()).floor;
 const close=JSON.stringify({operationId:id(),nonce:id(),requestDigest:'a'.repeat(64),createdAt:at(),expiresAt:at()+300,nextWriteEpoch:NEXT,originalFloor:F}),proof=await gate.servingGateMac(INITIALIZER,'POST','/v1/serving/initialize-closed',close),closed=await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/serving/initialize-closed',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Serving-Proof':proof},body:close}));assert.equal(closed.status,200);
 // Existing test-only transport bootstrap (same as the closed-recovery harness): the original operator then closes it genuinely.
 doDb.prepare("UPDATE recovery_serving_gate SET state='managed_open',operation_id=NULL,nonce=NULL,request_digest=NULL,created_at=NULL,expires_at=NULL,next_write_epoch=NULL,closed_at=NULL WHERE singleton=1 AND state='closing_held'").run();
 const stub={async fetch(request){const p=new URL(request.url).pathname;calls.push(p);const next=()=>object.fetch(request);return fetchHook?fetchHook(request,next):next();}},originalId=Object.freeze({scope:'original-local-recovery-floor'}),namespace={idFromName(name){assert.equal(name,floor.RECOVERY_FLOOR_NAME);return originalId;},get(value){assert.equal(value,originalId);return stub;}};
 return{doDb,object,calls,namespace,hook:value=>fetchHook=value,F};
}
const mode=db=>db.prepare('SELECT epoch,mode,active,nonce,purpose,entry_changes,logical_changes FROM privacy_write_admission').get();
const objects=(db,f)=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE "+f.L('privacy-provider-metadata').PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL+" ORDER BY type COLLATE BINARY,name COLLATE BINARY").all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
const preserved=(x)=>[x.d.doDb.prepare(`SELECT ${x.f.L('privacy-recovery-floor').JOURNAL_TUPLE_SQL} t FROM recovery_journal ORDER BY operation_id`).all().map(r=>r.t),x.d.doDb.prepare(`SELECT ${x.f.L('privacy-recovery-floor').COMPLETION_TUPLE_SQL} t FROM recovery_completion_attempt ORDER BY operation_id,phase`).all().map(r=>r.t)];
const doState=x=>({gate:x.d.doDb.prepare('SELECT state FROM recovery_serving_gate').get().state,floor:JSON.parse(x.d.doDb.prepare(`SELECT ${x.f.L('privacy-recovery-floor').FLOOR_TUPLE_SQL} t FROM recovery_floor`).get().t),attempts:x.d.doDb.prepare("SELECT count(*) n FROM sqlite_master WHERE name='recovery_successor_attempt'").get().n?x.d.doDb.prepare('SELECT attempt_id,phase FROM recovery_successor_attempt ORDER BY created_at,attempt_id').all().map(r=>[r.attempt_id,r.phase]):[]});

/** The predecessor: genuine mounted close + install-and-reopen, failed in the tail after Native open. */
async function incident(layout,variant){
 J.fixtureAdvance(T);const f=await J.opened(layout),d=await independent(f),transport=originalBinding(f.db),x={f,d,transport,layout};
 const now=at(),meta={id:CONTROL_VERSION,tag:'synthetic-successor-chain-original-control',timestamp:'2026-10-13T00:00:00Z'},metaTuple=JSON.stringify([meta.id,meta.tag,meta.timestamp]);
 const env={DB:transport.binding,CF_VERSION_METADATA:meta,PRIVACY_PRODUCTION_CONTROL_ENABLED:'true',PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET:AUTH,PRIVACY_CONTROL_SOURCE_TREE:CONTROL_TREE,PRIVACY_SERVING_SOURCE_TREE:TREE,PRIVACY_SERVING_DEPLOYMENT_VERSION:VERSION,PRIVACY_SERVING_DATABASE_ID:DBID,PRIVACY_RECOVERY_FLOOR:d.namespace,PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_CREDENTIAL_EPOCH:CE,PRIVACY_WRITE_EPOCH:WE,PRIVACY_WRITE_ADMISSION_LAYOUT:layout,PRIVACY_INSTALL_SOURCE_KIND:'current-cookie'};
 const value={operationId:id(),nonce:id(),createdAt:now,expiresAt:now+300,nextWriteEpoch:NEXT,controlVersion:CONTROL_VERSION,servingVersion:VERSION,sourceTree:TREE,credentialEpoch:CE,writeEpoch:WE},raw=JSON.stringify(value),ctx={waitUntil(){throw Error('no deferred private recovery');}};
 const signed=async pathname=>new Request('https://privacy-production-control.invalid'+pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':await hmac(AUTH,JSON.stringify(['olympus-private-production-control-original-v1','POST',pathname,CONTROL_TREE,metaTuple,raw]))},body:raw});
 const entry=f.L('privacy-private-operator-entry').default,verification=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']),pub=Buffer.from(await webcrypto.subtle.exportKey('raw',verification.publicKey)).toString('hex'),keyDigest=sha(JSON.stringify(['accepted-release-verification-key-v1',pub])),profileDigest=sha(JSON.stringify(objects(f.db,f)));
 Object.assign(env,{PRIVACY_SOURCE_OBSERVATION_ENABLED:'true',PRIVACY_RELEASE_VERIFY_PUBLIC_KEY:pub,PRIVACY_ACCEPTED_RELEASE_ID:RELEASE,PRIVACY_ACCEPTED_SOURCE_TREE:SOURCE,PRIVACY_ACCEPTED_SOURCE_FREEZE_SHA256:FREEZE,PRIVACY_ACCEPTED_SERVING_VERSION:NEW_VERSION,PRIVACY_ACCEPTED_CREDENTIAL_EPOCH:NEXT_CE,PRIVACY_RELEASE_EVIDENCE:{async fetch(req){
  const tuple=JSON.parse(await req.clone().text()),target=f.L('privacy-recovery-floor').RECOVERY_FLOOR_TARGET,r=['immutable-provider-accepted-source-original-cut-v1',RELEASE,value.operationId,tuple[2],tuple[3],tuple[4],target.account,target.database,target.worker,NEW_VERSION,'fixture-provider-etag-algorithm-unspecified',SOURCE,FREEZE,'9'.repeat(64),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'d'.repeat(64),'e'.repeat(64),'f'.repeat(64),profileDigest,NEXT_CE,NEXT,keyDigest,now,now+300],text=JSON.stringify(r),signature=Buffer.from(await webcrypto.subtle.sign('Ed25519',verification.privateKey,new TextEncoder().encode(text))).toString('hex');
  return new Response(text,{status:200,headers:{'Content-Type':'application/json','X-Olympus-Accepted-Release-Signature':signature}});}}});
 const close=await entry.fetch(await signed('/v1/control/close'),env,ctx);eq(layout+'/'+variant+' predecessor genuine mounted close',close.status,200);
 const serving=()=>{const m=mode(f.db);return m.epoch===NEXT&&m.mode==='serving';};let injected=0;
 d.hook(async(request,next)=>{const p=new URL(request.url).pathname;
  if(variant==='a'&&p==='/v1/completion-reserve'&&serving()){injected++;throw Error('incident tail: completion reserve not applied');}
  if(variant==='b'&&p==='/v1/completion-reserve'&&serving()){injected++;await next();throw Error('incident tail: completion reserve applied, reply lost');}
  if(variant==='c'&&p==='/v1/serving/reopen'){injected++;throw Error('incident tail: reopen RPC not applied');}
  if(variant==='d'&&p==='/v1/complete'&&serving()){injected++;J.fixtureAdvance(T+300);return next();}
  return next();});
 const install=await entry.fetch(await signed('/v1/control/install-and-reopen'),env,ctx),body=await install.json();d.hook(null);
 eq(layout+'/'+variant+' predecessor tail failure is the incident 503 unknown, after one injected tail fault',[install.status,body.scope,injected],[503,'private_original_control_unknown_or_held',1]);
 eq(layout+'/'+variant+' Native committed SERVING at the predecessor next epoch (current state, not an ACK)',[mode(f.db).epoch,mode(f.db).mode],[NEXT,'serving']);
 eq(layout+'/'+variant+' Floor stuck: gate closing_held on the initial Floor',[doState(x).gate,doState(x).floor[5],doState(x).floor[7]],['closing_held',1,WE]);
 const open=d.doDb.prepare("SELECT state FROM recovery_journal WHERE purpose='reserve' ORDER BY created_at,operation_id").all().map(r=>r.state),attempt=d.doDb.prepare("SELECT state FROM recovery_completion_attempt ORDER BY operation_id,phase").all().map(r=>r.state);
 eq(layout+'/'+variant+' predecessor open journal/attempt in the observed tail shape',[open.filter(s=>s==='reserved').length,attempt.filter(s=>s==='reserved').length,attempt.filter(s=>s==='refused').length],{a:[1,0,0],b:[1,1,0],c:[0,0,0],d:[1,0,1]}[variant]);
 J.fixtureAdvance(T+400);const late=await entry.fetch(await signed('/v1/control/install-and-reopen'),env,ctx);eq(layout+'/'+variant+' the predecessor command is clock-dead after its deadline',late.status===200,false);
 // OFF-mode activity after the old cut: one audit append (the watermark row) at the predecessor next epoch.
 await f.L('privacy-write-admission').createPrivacyWriteAdmissionDatabase(f.raw,'writer',layout,NEXT).prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'cron','role.sweep','cron','{}')").bind(T+350).run();
 return{...x,env,meta,raw,entry,signed,traceMark:transport.trace.length,groupMark:transport.groups.length};
}
function successor(x,over={}){
 const env={DB:x.transport.binding,CF_VERSION_METADATA:SMETA,PRIVACY_SUCCESSOR_CONTROL_ENABLED:'true',PRIVACY_SUCCESSOR_RECOVER_ENABLED:'true',PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET:OWNER,PRIVACY_RECOVERY_SUCCESSOR_SECRET:SUCC,PRIVACY_SUCCESSOR_CONTROL_SOURCE_TREE:STREE,PRIVACY_SERVING_DATABASE_ID:DBID,PRIVACY_WRITE_ADMISSION_LAYOUT:x.layout,PRIVACY_RECOVERY_FLOOR:x.d.namespace,...over};
 for(const k of Object.keys(over))if(over[k]===undefined)delete env[k];
 const entry=x.f.L('privacy-private-successor-entry').default,adapter=x.f.L('privacy-private-control-adapter'),main={PRIVACY_PRODUCTION_CONTROL:{fetch:request=>entry.fetch(request,env,{waitUntil(){throw Error('no deferred successor work');}})}};
 return async(command,body,options={})=>{const raw=typeof body==='string'?body:JSON.stringify(body),mac=options.proof??await hmac(options.root??OWNER,JSON.stringify(['olympus-private-successor-control-v1','POST','/v1/control/'+command,STREE,SMETA_TUPLE,raw])),pathname='/private-production-control/'+command;
  const r=await adapter.forwardPrivateProductionControl(new Request('https://bot.invalid'+pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':mac},body:raw}),main,pathname);const text=await r.text();let parsed=null;try{parsed=JSON.parse(text);}catch{}return{status:r.status,body:parsed};};
}
async function census(call){const now=at(),r=await call('status',{nonce:id(),createdAt:now,expiresAt:now+300});assert.equal(r.status,200,'census '+JSON.stringify(r.body));return r.body;}
function recover(c,over={}){const now=at();return{attemptId:id(),nonce:id(),createdAt:now,expiresAt:now+300,sourceWriteEpoch:NEXT,sourceMode:'serving',targetWriteEpoch:epoch(),targetCredentialEpoch:epoch(),burnedEpochs:[['write',NEXT],['credential',NEXT_CE]],servingTree:TREE,servingVersion:VERSION,layout:c.layoutName,expectedFloor:c.floor,expectedGate:c.gate,expectedCensusDigest:c.censusDigest,nativeWatermark:c.native.auditSequence,controlVersion:SVERSION,...over};}
/** Configured main at C2/E2 with b04 code: the unchanged global serving entry claims a ticket and admits a write. */
async function configuredMain(x,ce,we){const global=x.f.L('privacy-global-serving-origin'),admission=x.f.L('privacy-write-admission');
 Object.assign(x.f.env,{PRIVACY_RECOVERY_FLOOR:x.d.namespace,PRIVACY_SERVING_GATE_SECRET:SERVING,PRIVACY_CREDENTIAL_EPOCH:ce,PRIVACY_SERVING_SOURCE_TREE:TREE,PRIVACY_SERVING_DATABASE_ID:DBID,PRIVACY_WRITE_ADMISSION_EPOCH:we});
 try{const request=new Request('https://membership.invalid/successor-probe'),entry=global.captureGlobalServingEntry(x.f.env,{waitUntil(p){x.f.pending.push(p);}},'fetch',request);
  return await global.dispatchGlobalServingEntry(entry,async()=>{const db=admission.createPrivacyWriteAdmissionDatabase(entry.env.DB,'writer',x.layout,we);await db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES(?,'1',?)").bind('successorProbe'+id(),at()).run();return 'written';});}
 catch(error){return 'held';}}
async function offMain(x,we){const admission=x.f.L('privacy-write-admission');try{const db=admission.createPrivacyWriteAdmissionDatabase(x.f.raw,'writer',x.layout,we);await db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES(?,'1',?)").bind('offProbe'+id(),at()).run();return 'written';}catch{return 'held';}}

async function positive(layout,variant){
 const x=await incident(layout,variant),call=successor(x),c=await census(call);c.layoutName=layout;
 eq(layout+'/'+variant+' census: Floor/gate bound, Native current E1 serving observation only',[JSON.parse(c.gate)[3],JSON.parse(c.native.controlTuple)[2],JSON.parse(c.native.controlTuple)[3],c.native.profileAdmitted,c.readyToReopen],['closing_held',NEXT,'serving',true,false]);
 const beforeObjects=objects(x.f.db,x.f),beforeSlot=mode(x.f.db),beforeP=preserved(x);let fenceSeen=null,openSeen=null;
 eq(layout+'/'+variant+' OFF main at E1 writes before the successor',await offMain(x,NEXT),'written');const preFence=mode(x.f.db);
 x.transport.hook((statements,next)=>{const sql=statements.map(s=>s.statement).join('\n');
  if(sql.includes("SET epoch=?1,mode='closed'"))fenceSeen={state:doState(x),reserved:x.d.doDb.prepare('SELECT phase FROM recovery_successor_attempt').all().map(r=>r.phase)};
  if(sql.includes("SET mode='serving'"))openSeen={state:doState(x),phase:x.d.doDb.prepare('SELECT phase FROM recovery_successor_attempt').all().map(r=>r.phase)};return next();});
 const cmd=recover(c),r=await call('reopen',cmd);x.transport.hook(null);
 if(r.status!==200)console.error('SUCCESSOR_FAILURE '+JSON.stringify(r.body));
 eq(layout+'/'+variant+' recover through main adapter -> successor: 200 confirmed, every residual flag false',[r.status,r.body.scope,r.body.providerDrainQualified,r.body.restoreBarrierQualified,r.body.unmanagedOldVersionClosureQualified,r.body.allPhysicalCopyReplayQualified,r.body.readyToReopen],[200,'private_successor_open_confirmed',false,false,false,false,false]);
 eq(layout+'/'+variant+' rule (a): DO reserve acknowledged before the first Native CAS',[fenceSeen?.reserved,fenceSeen?.state.gate],[['reserved'],'closing_held']);
 eq(layout+'/'+variant+' rule (b): DO fenced and still closing_held at Native open; DO opens only after it',[openSeen?.phase,openSeen?.state.gate,openSeen?.state.floor[5]],[['fenced'],'closing_held',1]);
 const after=mode(x.f.db);eq(layout+'/'+variant+' Native E2 serving, neutral, counters carried exactly',[after.epoch,after.mode,after.active,after.entry_changes,after.logical_changes,beforeSlot.epoch],[cmd.targetWriteEpoch,'serving',0,preFence.entry_changes,preFence.logical_changes,NEXT]);
 const fenceAck=JSON.parse(x.d.doDb.prepare('SELECT fence_ack FROM recovery_successor_attempt').get().fence_ack);eq(layout+'/'+variant+' fence ACK records the exact consumed pre-image (source-owned, not caller supplied)',JSON.parse(fenceAck[1]),[1,'olympus-write-admission-epoch-2',NEXT,'serving',0,'','',preFence.entry_changes,preFence.logical_changes]);
 eq(layout+'/'+variant+' Native application profile unchanged',objects(x.f.db,x.f),beforeObjects);
 const s=doState(x);eq(layout+'/'+variant+' Floor sequence 2 at C2/E2/tree/version, gate managed_open, attempt opened',[s.floor[5],s.floor[6],s.floor[7],s.floor[8],s.floor[9],s.gate,s.attempts.map(a=>a[1])],[2,cmd.targetCredentialEpoch,cmd.targetWriteEpoch,TREE,VERSION,'managed_open',['opened']]);
 const afterP=preserved(x);eq(layout+'/'+variant+' predecessor journals and attempts byte-identical; only the base advance row added',[afterP[1],beforeP[0].every(t=>afterP[0].includes(t)),afterP[0].length-beforeP[0].length],[beforeP[1],true,1]);
 eq(layout+'/'+variant+' OFF main bound to E1 is now held',await offMain(x,NEXT),'held');
 eq(layout+'/'+variant+' configured main (unchanged b04 code) at C2/E2 serves: claim plus admitted write',await configuredMain(x,cmd.targetCredentialEpoch,cmd.targetWriteEpoch),'written');
 eq(layout+'/'+variant+' configured main at the old C1/E1 stays held',await configuredMain(x,NEXT_CE,NEXT),'held');
 const ob=await call('observe-cut',{attemptId:cmd.attemptId,recoverRequestDigest:sha(JSON.stringify(['olympus-private-successor-control-v1',STREE,SMETA_TUPLE,JSON.stringify(cmd)])),nonce:id(),createdAt:at(),expiresAt:at()+300});
 eq(layout+'/'+variant+' observe reports the opened row; it advances nothing',[ob.status,ob.body.phase],[200,'opened']);
 const again=await call('reopen',cmd);eq(layout+'/'+variant+' the same recover command cannot run twice',[again.status===200,doState(x).floor[5]],[false,2]);
 measured.push({layout,variant,predecessorTail:variant,nativeEpochFenced:true,doOpened:true,floorSequence:2,providerDrainQualified:false,restoreBarrierQualified:false});
 x.f.close();x.d.doDb.close();
}

async function lostReplies(layout){
 // S1 reply lost after COMMIT: no Native fence; same command refused; a fresh approved attempt re-sources E1 after expiry.
 {const x=await incident(layout,'c'),call=successor(x),c=await census(call);c.layoutName=layout;
  x.d.hook(async(request,next)=>{if(new URL(request.url).pathname==='/v2/successor/reserve'){await next();throw Error('S1 reply lost after COMMIT');}return next();});
  const cmd=recover(c),r=await call('reopen',cmd);x.d.hook(null);
  eq(layout+' S1 lost: 503 unknown at S1, no Native fence batch, Native still E1 serving',[r.status,r.body.step,r.body.scope,mode(x.f.db).epoch,mode(x.f.db).mode,x.transport.groups.some(g=>g.some(s=>s.includes("SET epoch=?1,mode='closed'")))],[503,'S1-reserve','private_successor_unknown_or_held',NEXT,'serving',false]);
  eq(layout+' S1 lost: the DO row exists as reserved (that attempt\'s own unknown)',doState(x).attempts.map(a=>a[1]),['reserved']);
  eq(layout+' S1 lost: same command refused',(await call('reopen',cmd)).status,409);
  J.fixtureAdvance(cmd.expiresAt+60);const c2=await census(call);c2.layoutName=layout;const cmd2=recover(c2,{burnedEpochs:[['credential',NEXT_CE]]}),r2=await call('reopen',cmd2);
  eq(layout+' S1 lost: fresh attempt after expiry re-sources E1 serving and opens; attempt 1 row retained',[r2.status,doState(x).attempts.map(a=>a[1]),mode(x.f.db).epoch],[200,['reserved','opened'],cmd2.targetWriteEpoch]);
  x.f.close();x.d.doDb.close();}
 // S2 lost after COMMIT: Native E2 closed, DO reserved; a later attempt fences from E2 closed.
 {const x=await incident(layout,'c'),call=successor(x),c=await census(call);c.layoutName=layout;
  x.transport.hook((statements,next)=>{const out=next();if(statements.some(s=>s.statement.includes("SET epoch=?1,mode='closed'")))throw Error('S2 reply lost after COMMIT');return out;});
  const cmd=recover(c),r=await call('reopen',cmd);x.transport.hook(null);
  eq(layout+' S2 lost: 503 unknown at S2, Native E2 closed, DO reserved, no open batch',[r.status,r.body.step,mode(x.f.db).epoch,mode(x.f.db).mode,doState(x).attempts.map(a=>a[1]),x.transport.groups.filter(g=>g.some(s=>s.includes("SET mode='serving'"))).length],[503,'S2-native-fence',cmd.targetWriteEpoch,'closed',['reserved'],1]);
  eq(layout+' S2 lost: OFF main at E1 is held (the fence did commit)',await offMain(x,NEXT),'held');
  const reread=await census(call);eq(layout+' S2 lost: a later read shows E2 closed but mints nothing',[JSON.parse(reread.native.controlTuple)[3],doState(x).attempts.map(a=>a[1])],['closed',['reserved']]);
  J.fixtureAdvance(cmd.expiresAt+60);const c2=await census(call);c2.layoutName=layout;const cmd2=recover(c2,{sourceWriteEpoch:cmd.targetWriteEpoch,sourceMode:'closed',burnedEpochs:[['credential',NEXT_CE]]}),r2=await call('reopen',cmd2);
  eq(layout+' S2 lost: next attempt fences E2 closed -> E3 and opens',[r2.status,mode(x.f.db).epoch,mode(x.f.db).mode,doState(x).floor[7]],[200,cmd2.targetWriteEpoch,'serving',cmd2.targetWriteEpoch]);
  x.f.close();x.d.doDb.close();}
 // S4 lost after COMMIT: Native E2 SERVING, DO fenced; configured main stays held until a DO open.
 {const x=await incident(layout,'c'),call=successor(x),c=await census(call);c.layoutName=layout;
  x.transport.hook((statements,next)=>{const out=next();if(statements.some(s=>s.statement.includes("SET mode='serving'")))throw Error('S4 reply lost after COMMIT');return out;});
  const cmd=recover(c),r=await call('reopen',cmd);x.transport.hook(null);
  eq(layout+' S4 lost: 503 unknown at S4, Native E2 serving, DO fenced and closing_held',[r.status,r.body.step,mode(x.f.db).epoch,mode(x.f.db).mode,doState(x).attempts.map(a=>a[1]),doState(x).gate],[503,'S4-native-open',cmd.targetWriteEpoch,'serving',['fenced'],'closing_held']);
  eq(layout+' S4 lost: SERVING alone authorizes nothing: configured main at C2/E2 is held',await configuredMain(x,cmd.targetCredentialEpoch,cmd.targetWriteEpoch),'held');
  J.fixtureAdvance(cmd.expiresAt+60);const c2=await census(call);c2.layoutName=layout;const cmd2=recover(c2,{sourceWriteEpoch:cmd.targetWriteEpoch,sourceMode:'serving',burnedEpochs:[['credential',NEXT_CE]]}),r2=await call('reopen',cmd2);
  eq(layout+' S4 lost: next attempt fences E2 serving -> E3 and opens',[r2.status,doState(x).floor[7],await configuredMain(x,cmd2.targetCredentialEpoch,cmd2.targetWriteEpoch)],[200,cmd2.targetWriteEpoch,'written']);
  x.f.close();x.d.doDb.close();}
 // S5 lost after COMMIT: the DO opened; observe reports it; nothing is re-run.
 {const x=await incident(layout,'c'),call=successor(x),c=await census(call);c.layoutName=layout;
  x.d.hook(async(request,next)=>{if(new URL(request.url).pathname==='/v2/successor/open'){await next();throw Error('S5 reply lost after COMMIT');}return next();});
  const cmd=recover(c),r=await call('reopen',cmd);x.d.hook(null);
  eq(layout+' S5 lost: 503 unknown at S5 while the DO committed managed_open',[r.status,r.body.step,doState(x).gate,doState(x).attempts.map(a=>a[1])],[503,'S5-open','managed_open',['opened']]);
  const ob=await call('observe-cut',{attemptId:cmd.attemptId,recoverRequestDigest:sha(JSON.stringify(['olympus-private-successor-control-v1',STREE,SMETA_TUPLE,JSON.stringify(cmd)])),nonce:id(),createdAt:at(),expiresAt:at()+300});
  eq(layout+' S5 lost: signed observe reports the stored opened row only',[ob.status,ob.body.phase,doState(x).floor[5]],[200,'opened',2]);
  eq(layout+' S5 lost: no second recover',(await call('reopen',cmd)).status===200,false);
  x.f.close();x.d.doDb.close();}
}

async function writersAndRestore(layout){
 // A straggling OFF write at E1 that commits before the fence is reflected in the consumed counters.
 {const x=await incident(layout,'b'),call=successor(x),c=await census(call);c.layoutName=layout;let inserted=false;
  let straggler=null;x.transport.hook(async(statements,next)=>{if(!inserted&&statements.some(s=>s.statement.includes("SET epoch=?1,mode='closed'"))){inserted=true;eq(layout+' straggling OFF E1 write commits just before the fence',await offMain(x,NEXT),'written');straggler=mode(x.f.db);}return next();});
  const cmd=recover(c),r=await call('reopen',cmd);x.transport.hook(null);const after=mode(x.f.db),pre=JSON.parse(JSON.parse(x.d.doDb.prepare('SELECT fence_ack FROM recovery_successor_attempt').get().fence_ack)[1]);
  eq(layout+' late-old-native-ordering: fence consumed the straggler state; counters carried exactly',[r.status,pre.slice(7),[after.entry_changes,after.logical_changes]],[200,[straggler.entry_changes,straggler.logical_changes],[straggler.entry_changes,straggler.logical_changes]]);
  // Replays of the predecessor's recorded Native batches after the fence fail their epoch/tuple guards.
  const originals=x.transport.trace.slice(0,x.traceMark).filter(t=>t.sql.startsWith('UPDATE privacy_write_admission SET'));
  const slot=JSON.stringify(mode(x.f.db));let replayed=0;for(const t of originals){x.f.db.prepare(t.sql).all(...t.params);replayed++;}
  eq(layout+' predecessor Native fence/migration/open statements replayed after the fence change nothing',[replayed>0,JSON.stringify(mode(x.f.db))],[true,slot]);
  x.f.close();x.d.doDb.close();}
 // Watermark: a lower audit sequence refuses at S0 with no effect; an earlier same-sequence snapshot is not detected.
 {const x=await incident(layout,'a'),call=successor(x),c=await census(call);c.layoutName=layout;
  const higher=await call('reopen',recover(c,{nativeWatermark:c.native.auditSequence+1}));
  eq(layout+' watermark above the Native audit sequence refuses before any effect',[higher.status,higher.body.scope,doState(x).attempts.length,mode(x.f.db).epoch],[409,'private_successor_held_before_effects',0,NEXT]);
  const admitted=x.f.L('privacy-write-admission').createPrivacyWriteAdmissionDatabase(x.f.raw,'writer',layout,NEXT);await admitted.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('successorResidualProbe','1',?)").bind(at()).run();await admitted.prepare("DELETE FROM site_settings WHERE key='successorResidualProbe'").run();
  const c2=await census(call);c2.layoutName=layout;const r=await call('reopen',recover(c2));
  eq(layout+' residual: a same-sequence business rollback is NOT detected; restoreBarrierQualified stays false',[r.status,r.body.restoreBarrierQualified],[200,false]);
  x.f.close();x.d.doDb.close();}
 // Native not at the bound source: S0 refuses and consumes no attempt id.
 {const x=await incident(layout,'a'),call=successor(x),c=await census(call);c.layoutName=layout;const r=await call('reopen',recover(c,{sourceMode:'closed'}));
  eq(layout+' Native not in the bound source mode refuses at S0 with no DO row or Native write',[r.status,r.body.step,doState(x).attempts.length,x.transport.groups.slice(x.groupMark).filter(g=>g.some(s=>s.startsWith('UPDATE'))).length],[409,'S0-native-precheck',0,0]);
  x.f.close();x.d.doDb.close();}
}

async function authAndEnablement(layout){
 const x=await incident(layout,'a'),c=await census(successor(x));c.layoutName=layout;const groups=()=>x.transport.groups.length,before=groups();
 const none=async(label,call,command,body,options,expect)=>{const r=await call(command,body,options);eq(layout+' '+label,[r.status,r.body?.scope??r.body?.error??null,doState(x).attempts.length,groups()],[expect[0],expect[1],0,before]);};
 await none('wrong owner root refuses before effects',successor(x),'reopen',recover(c),{root:SUCC},[409,'private_successor_held_before_effects']);
 await none('base original control root cannot sign the successor',successor(x),'reopen',recover(c),{root:AUTH},[409,'private_successor_held_before_effects']);
 await none('recover disabled holds while census still answers',successor(x,{PRIVACY_SUCCESSOR_RECOVER_ENABLED:'false'}),'reopen',recover(c),{},[409,'private_successor_held_before_effects']);
 eq(layout+' census answers with recover disabled',(await successor(x,{PRIVACY_SUCCESSOR_RECOVER_ENABLED:'false'})('status',{nonce:id(),createdAt:at(),expiresAt:at()+300})).status,200);
 await none('successor entry default OFF is 404',successor(x,{PRIVACY_SUCCESSOR_CONTROL_ENABLED:'false'}),'status',{nonce:id(),createdAt:at(),expiresAt:at()+300},{},[404,null]);
 await none('a bound base operator root refuses',successor(x,{PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR}),'status',{nonce:id(),createdAt:at(),expiresAt:at()+300},{},[409,'private_successor_held_before_effects']);
 await none('a bound original control root refuses',successor(x,{PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET:AUTH}),'status',{nonce:id(),createdAt:at(),expiresAt:at()+300},{},[409,'private_successor_held_before_effects']);
 await none('equal successor roots refuse',successor(x,{PRIVACY_RECOVERY_SUCCESSOR_SECRET:OWNER}),'status',{nonce:id(),createdAt:at(),expiresAt:at()+300},{},[409,'private_successor_held_before_effects']);
 await none('an admission-wrapped DB binding refuses',successor(x,{DB:x.f.L('privacy-write-admission').createPrivacyWriteAdmissionDatabase(x.transport.binding,'writer',layout,NEXT)}),'status',{nonce:id(),createdAt:at(),expiresAt:at()+300},{},[409,'private_successor_held_before_effects']);
 await none('controlVersion differing from the worker version refuses',successor(x),'reopen',recover(c,{controlVersion:CONTROL_VERSION}),{},[409,'private_successor_held_before_effects']);
 await none('layout differing from the worker layout refuses',successor(x),'reopen',recover(c,{layout:layout==='canonical'?'recorded-live-20261010':'canonical'}),{},[409,'private_successor_held_before_effects']);
 await none('extra command field refuses',successor(x),'reopen',{...recover(c),extra:1},{},[409,'private_successor_held_before_effects']);
 await none('an original d129-style command path (close) is not a successor route',successor(x),'close',recover(c),{},[409,'private_successor_held_before_effects']);
 const stale=recover(c,{createdAt:at()-400,expiresAt:at()-100});await none('an expired command is held by main\'s unchanged adapter',successor(x),'reopen',stale,{},[409,'private_control_original_deadline_held']);
 x.f.close();x.d.doDb.close();
}

async function main(){
 for(const variant of ['a','b','c','d'])await positive('recorded-live-20261010',variant);
 await positive('canonical','c');
 await lostReplies('recorded-live-20261010');
 await writersAndRestore('recorded-live-20261010');
 await authAndEnablement('recorded-live-20261010');
 console.log(JSON.stringify({checks,measured,scope:'successor-whole-chain-native-sqlite',providerDrainQualified:false,restoreBarrierQualified:false,readyToReopen:false}));
}
main().catch(e=>{console.error(e);process.exit(1);});
