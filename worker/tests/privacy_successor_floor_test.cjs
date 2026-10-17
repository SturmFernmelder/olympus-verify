// .162 guarded recovery successor, Floor side, on the genuine PrivacyRecoveryFloor over Native SQLite.
// Predecessor rows are produced only through the unchanged base routes; acknowledgements sent to the
// successor DO routes here are synthetic (the DO cannot see Native; the worker test covers real batches).
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto,createHash}=require('node:crypto'),hooks=require('node:async_hooks'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),T=1800000000,ORIGIN='https://privacy-recovery-floor.invalid';
const C0='1'.repeat(32),W0='2'.repeat(32),E1='3'.repeat(32),C1='4'.repeat(32),TREE='5'.repeat(40),CTREE='6'.repeat(40),VERSION='11111111-2222-3333-4444-555555555555',CVERSION='33333333-4444-5555-6666-777777777777';
const OPERATOR='synthetic-successor-floor-operator-root',INITIALIZER='synthetic-successor-floor-initializer-root',SERVING='synthetic-successor-floor-serving-root',SUCC='synthetic-successor-floor-worker-root',OWNER='synthetic-successor-floor-owner-command-root';
const META=JSON.stringify([CVERSION,'synthetic-successor-control','2026-10-17T00:00:00Z']);
let clock=T,serial=0,checks=0;
class FixedDate extends Date{static now(){return clock*1000;}}
function loader(){const context=vm.createContext({crypto:webcrypto,Date:FixedDate,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Request,Response,Headers,URL,URLSearchParams,AbortSignal,AbortController,ReadableStream,ReadableStreamDefaultReader,console,setTimeout,clearTimeout,btoa,atob,fetch(){throw Error('successor-floor-provider-forbidden');}}),cache=new Map();
 function load(name){if(cache.has(name))return cache.get(name).exports;const module={exports:{}};cache.set(name,module);const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),body=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext('(function(require,module,exports){'+body+'\n})',context,{filename:name})(p=>{if(p==='node:async_hooks')return hooks;if(!p.startsWith('./'))throw Error('successor-floor-external-import');return load(p.slice(2));},module,module.exports);return module.exports;}
 return load;}
const L=loader(),floorEntry=L('privacy-private-floor-entry'),floor=L('privacy-recovery-floor'),gate=L('privacy-serving-recovery-gate'),S=L('privacy-successor-floor');
const id=()=>(++serial).toString(16).padStart(32,'0'),epoch=()=>createHash('sha256').update('epoch'+(++serial)).digest('hex').slice(0,32),canon=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function eq(label,a,b){assert.deepEqual(canon(a),canon(b),label);checks++;console.log('PASS '+label);}
function yes(label,v){assert.ok(v,label);checks++;console.log('PASS '+label);}
const sha=t=>createHash('sha256').update(t).digest('hex');
const ROOTS={PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,PRIVACY_SERVING_GATE_SECRET:SERVING,PRIVACY_RECOVERY_SUCCESSOR_SECRET:SUCC,PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET:OWNER};

function setup(env=ROOTS){
 clock=T;const db=new DatabaseSync(':memory:',{defensive:true});db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 const storage={sql:{exec(sql,...values){const s=db.prepare(sql),rows=s.columns().length?s.all(...values):(s.run(...values),[]);return{toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 assert.equal(floorEntry.PrivacyRecoveryFloor,floor.PrivacyRecoveryFloor,'original class re-export identity');
 const object=new floorEntry.PrivacyRecoveryFloor({storage},{...env});return{db,object,storage};
}
async function json(r){return{status:r.status,body:await r.json()};}
async function base(d,pathname,value,secret=OPERATOR){const raw=JSON.stringify(value),mac=await floor.recoveryFloorMac(secret,'POST',pathname,raw);return json(await d.object.fetch(new Request(ORIGIN+pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Recovery-Proof':mac},body:raw})));}
async function serving(d,pathname,value,secret){const raw=JSON.stringify(value),mac=await gate.servingGateMac(secret,'POST',pathname,raw);return json(await d.object.fetch(new Request(ORIGIN+pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Serving-Proof':mac},body:raw})));}
async function succ(d,pathname,body,secret=SUCC,method='POST'){const raw=typeof body==='string'?body:JSON.stringify(body),mac=await S.successorHmac(secret,S.successorFloorMessage(pathname,raw));return json(await d.object.fetch(new Request(ORIGIN+pathname,method==='POST'?{method,headers:{'Content-Type':'application/json','X-Olympus-Successor-Proof':mac},body:raw}:{method,headers:{'X-Olympus-Successor-Proof':mac}})));}
const tuple=(db,sql)=>db.prepare(sql).all().map(r=>r.t);
const preserved=db=>[tuple(db,`SELECT ${floor.JOURNAL_TUPLE_SQL} t FROM recovery_journal ORDER BY operation_id`),tuple(db,`SELECT ${floor.COMPLETION_TUPLE_SQL} t FROM recovery_completion_attempt ORDER BY operation_id,phase`)];

/** Incident seed. Floor F at C0/W0, gate closing_held from initialize-closed at T (next E1), install and replay
 * reserves complete, and the open reserve in one of the observed tails a-d. Then the clock passes the deadline. */
async function incident(variant,env=ROOTS){
 const d=setup(env),init={operationId:id(),nonce:id(),requestDigest:'9'.repeat(64),createdAt:T-600,expiresAt:T-300,credentialEpoch:C0,writeEpoch:W0,sourceTree:TREE,deploymentVersion:VERSION};clock=T-600;
 const i=await base(d,'/v1/initialize',init,INITIALIZER);assert.equal(i.status,200);const F=i.body.floor;clock=T;
 const close={operationId:id(),nonce:id(),requestDigest:'a'.repeat(64),createdAt:T,expiresAt:T+300,nextWriteEpoch:E1,originalFloor:F},c=await serving(d,'/v1/serving/initialize-closed',close,INITIALIZER);assert.equal(c.status,200);
 const reserve=async()=>{const v={operationId:id(),nonce:id(),createdAt:T,expiresAt:T+300,requestDigest:sha('reserve'+serial).slice(0,64),originalFloor:F},r=await base(d,'/v1/reserve',v);assert.equal(r.status,200);return r.body.journal;};
 const completionReserve=async(journal,result='complete',prior=null)=>{const r=await base(d,'/v1/completion-reserve',{originalJournal:journal,result,resultDigest:sha('result'+journal+result),priorAttempt:prior});return r;};
 const complete=async attempt=>base(d,'/v1/complete',{originalAttempt:attempt});
 clock=T+1;for(let n=0;n<2;n++){const j=await reserve(),a=await completionReserve(j);assert.equal(a.status,200);const done=await complete(a.body.attempt);assert.equal(done.status,200);}
 clock=T+30;const open=await reserve();
 if(variant==='b'||variant==='c'||variant==='d'){const a=await completionReserve(open);assert.equal(a.status,200);if(variant==='c'){assert.equal((await complete(a.body.attempt)).status,200);}if(variant==='d'){clock=T+300;assert.equal((await complete(a.body.attempt)).status,409);}}
 clock=T+400;const G=d.db.prepare(`SELECT ${gate.SERVING_GATE_TUPLE_SQL} t FROM recovery_serving_gate`).get().t;
 return{...d,F,G,close,open,completionReserve,complete,reserve};
}
async function census(d){const r=await succ(d,'/v2/successor/census','{}');assert.equal(r.status,200,'census');return{...r.body,digest:sha(JSON.stringify([S.SUCCESSOR_CENSUS_DOMAIN,r.body.safety,r.body.preserved,r.body.successor]))};}
function command(d,c,over={}){const now=clock;return JSON.stringify({attemptId:id(),nonce:id(),createdAt:now,expiresAt:now+300,sourceWriteEpoch:E1,sourceMode:'serving',targetWriteEpoch:epoch(),targetCredentialEpoch:epoch(),burnedEpochs:[['write',E1],['credential',C1]],servingTree:TREE,servingVersion:VERSION,layout:'recorded-live-20261010',expectedFloor:c.floor,expectedGate:c.gate,expectedCensusDigest:c.digest,nativeWatermark:7,controlVersion:CVERSION,...over});}
async function reserve(d,raw,ownerRoot=OWNER,meta=META){const proof=await S.successorHmac(ownerRoot,S.successorOwnerMessage('/v1/control/reopen',CTREE,meta,raw));return succ(d,'/v2/successor/reserve',{command:raw,proof,controlTree:CTREE,metadata:meta});}
const requestDigest=raw=>sha(S.successorRequestDigestText(CTREE,META,raw));
function counters(t){const a=JSON.parse(t);return a.slice(7);}
function acks(c,over={}){const pre=JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.sourceWriteEpoch,c.sourceMode,0,'','',5,9]),closed=JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.targetWriteEpoch,'closed',0,'','',5,9]);return{preTuple:pre,closedTuple:closed,fencedAt:clock,nativeResultDigest:'7'.repeat(64),auditSequence:c.nativeWatermark,...over};}
async function fenced(d,c,raw,over={}){return succ(d,'/v2/successor/fenced',{attemptId:c.attemptId,requestDigest:requestDigest(raw),fenceAck:acks(c,over)});}
async function opened(d,c,raw,over={}){const serving=JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.targetWriteEpoch,'serving',0,'','',5,9]);return succ(d,'/v2/successor/open',{attemptId:c.attemptId,requestDigest:requestDigest(raw),openAck:{servingTuple:serving,openedAt:clock,nativeResultDigest:'8'.repeat(64),...over}});}
const rowCount=(db,t)=>db.prepare(`SELECT count(*) n FROM sqlite_master WHERE name='${t}'`).get().n?db.prepare(`SELECT count(*) n FROM ${t}`).get().n:0;

async function wholeChain(){
 for(const variant of ['a','b','c','d']){
  const d=await incident(variant),beforeP=preserved(d.db),c0=await census(d);
  eq(variant+' census safety excludes successor rows and binds the closing gate',[JSON.parse(c0.safety)[0],JSON.parse(c0.successor),c0.floor,c0.gate],['successor-safety-v1',['successor-ledger-v1',[],[]],d.F,d.G]);
  const raw=command(d,c0),c=JSON.parse(raw),r=await reserve(d,raw);eq(variant+' S1 reserve acknowledged before any Native write',[r.status,r.body.scope,JSON.parse(r.body.attempt)[19]],[200,'private_successor_reserved','reserved']);
  eq(variant+' S1 permanently records targets and burns E1/C1',d.db.prepare('SELECT kind,epoch,role FROM recovery_successor_epoch ORDER BY role,kind').all().map(x=>[x.kind,x.epoch,x.role]),[['credential',C1,'burned'],['write',E1,'burned'],['credential',c.targetCredentialEpoch,'target'],['write',c.targetWriteEpoch,'target']]);
  eq(variant+' S1 changes no predecessor journal or attempt',preserved(d.db),beforeP);
  const f=await fenced(d,c,raw);eq(variant+' S3 fenced records the fence ACK and the derived open identity',[f.status,JSON.parse(f.body.attempt)[19]],[200,'fenced']);
  const a=JSON.parse(f.body.attempt),ackDigest=sha(S.successorFenceAckText(acks(c,{fencedAt:a[21]}))),open=sha(S.successorOpenIdentityText(c.attemptId,requestDigest(raw),ackDigest));
  eq(variant+' open identity is 32-hex id and nonce plus the full 64-hex digest (co:619-620 shape)',[a[22],a[23],a[24]],[open.slice(0,32),open.slice(32),open]);
  clock++;const o=await opened(d,c,raw);eq(variant+' S5 opens over the acknowledged Native serving tuple',[o.status,o.body.scope],[200,'private_successor_opened']);
  const next=JSON.parse(o.body.floor),g=JSON.parse(o.body.gate),F=JSON.parse(d.F);
  eq(variant+' Floor advanced by the unchanged reopenServingFloor to C2/E2/tree/version/open id',[next[5],next[6],next[7],next[8],next[9],next[10]],[F[5]+1,c.targetCredentialEpoch,c.targetWriteEpoch,TREE,VERSION,open.slice(0,32)]);
  eq(variant+' gate managed_open on the new Floor with every closing field null',[g[2],g[3],...g.slice(4)],[o.body.floor,'managed_open',null,null,null,null,null,null,null]);
  eq(variant+' C2/E2 claimed for the new Floor; C0/W0 claims untouched',d.db.prepare('SELECT kind,epoch FROM recovery_epoch_claim ORDER BY epoch').all().map(x=>[x.kind,x.epoch]).sort(),[['credential',C0],['write',W0],['credential',c.targetCredentialEpoch],['write',c.targetWriteEpoch]].sort());
  eq(variant+' suppression control moved to the new Floor only',d.db.prepare('SELECT native_floor,action_sequence FROM recovery_suppression_control').get(),{native_floor:o.body.floor,action_sequence:0});
  const afterP=preserved(d.db);eq(variant+' every predecessor journal and attempt tuple is byte-identical; one base advance row appended',[afterP[1],afterP[0].filter(t=>beforeP[0].includes(t)).length,afterP[0].filter(t=>!beforeP[0].includes(t)).map(t=>JSON.parse(t).slice(1,2).concat(JSON.parse(t)[7]))],[beforeP[1],beforeP[0].length,[['advance','complete']]]);
  eq(variant+' cut and initialize_closed lifecycle rows still carry the predecessor gate and clock',[d.db.prepare('SELECT count(*) n FROM recovery_serving_cut WHERE original_gate=?').get(d.G).n,d.db.prepare("SELECT purpose,created_at,expires_at FROM recovery_serving_lifecycle").all().map(x=>[x.purpose,x.created_at,x.expires_at])],[1,[['initialize_closed',T,T+300]]]);
  const ob=await succ(d,'/v2/successor/observe',{attemptId:c.attemptId,requestDigest:requestDigest(raw)});eq(variant+' observe reports the stored opened row and advances nothing',[ob.status,JSON.parse(ob.body.attempt)[19],ob.body.floor],[200,'opened',o.body.floor]);
  eq(variant+' second open and second fenced refuse',[(await opened(d,c,raw)).status,(await fenced(d,c,raw)).status],[409,409]);
  const late=await succ(d,'/v2/successor/reserve',{command:command(d,await census(d)),proof:'0'.repeat(64),controlTree:CTREE,metadata:META});eq(variant+' no further attempt after an opened attempt (owner proof also wrong)',late.status,403);
  const again=await reserve(d,command(d,await census(d),{sourceWriteEpoch:c.targetWriteEpoch,targetWriteEpoch:epoch(),targetCredentialEpoch:epoch(),burnedEpochs:[['credential',C1]]}));eq(variant+' no further attempt after an opened attempt',again.status,409);
  // Base code over a successor-advanced Floor: status reads, claim, settle and close all keep their unchanged behaviour.
  const gf=await json(await d.object.fetch(new Request(ORIGIN+'/v1/floor')));eq(variant+' base GET /v1/floor reads the advanced Floor',gf.body.floor,o.body.floor);
  const ticket=id(),claim=await serving(d,'/v1/serving/claim',{ticketId:ticket,parentTicket:null,purpose:'fetch',nonce:id(),requestDigest:'c'.repeat(64),createdAt:clock,expiresAt:clock+300,originalFloor:o.body.floor},SERVING);eq(variant+' base serving claim works on the successor-opened gate',claim.status,200);
  const settle=await serving(d,'/v1/serving/settle',{originalTicket:claim.body.ticket,result:'settled',resultDigest:'d'.repeat(64)},SERVING);eq(variant+' base settle works',settle.status,200);
  const reopenOld=await serving(d,'/v1/serving/reopen',{operationId:id(),nonce:id(),requestDigest:'e'.repeat(64),createdAt:clock,expiresAt:clock+300,originalGate:d.G,originalFloor:d.F,originalCut:'[]',allWriterCut:'[]',migrationReceipt:'[]',acceptedSourceReceipt:'[]',suppressionReceipt:'[]'},OPERATOR);yes(variant+' base reopen of the predecessor gate stays refused',reopenOld.status!==200&&JSON.parse(d.db.prepare(`SELECT ${gate.SERVING_GATE_TUPLE_SQL} t FROM recovery_serving_gate`).get().t)[2]===o.body.floor);
  const closeAgain=await serving(d,'/v1/serving/close',{operationId:id(),nonce:id(),requestDigest:'f'.repeat(64),createdAt:clock,expiresAt:clock+300,nextWriteEpoch:epoch(),originalGate:o.body.gate},OPERATOR);eq(variant+' base close from managed_open still works over the successor tables',[closeAgain.status,JSON.parse(closeAgain.body.gate)[3]],[200,'closing_held']);
  d.db.close();
 }
}

async function reserveRefusals(){
 const d=await incident('a'),c0=await census(d),G=JSON.parse(d.G);let n=0;
 const refused=async(label,raw,expect=409,root=OWNER,meta=META)=>{const r=await reserve(d,raw,root,meta);eq('reserve refuses: '+label,[r.status,rowCount(d.db,'recovery_successor_attempt')],[expect,0]);n++;};
 await refused('wrong owner root (base operator root)',command(d,c0),403,OPERATOR);
 await refused('metadata version differs from controlVersion',command(d,c0),409,OWNER,JSON.stringify(['44444444-5555-6666-7777-888888888888','x','y']));
 await refused('expected Floor differs',command(d,c0,{expectedFloor:d.F.replace(C0,C1)}));
 await refused('expected gate differs',command(d,c0,{expectedGate:d.G.replace('closing_held','managed_open')}));
 await refused('census digest differs',command(d,c0,{expectedCensusDigest:'0'.repeat(64)}));
 await refused('attempt id reuses the predecessor gate operation',command(d,c0,{attemptId:G[4]}));
 const journal=JSON.parse(d.open);await refused('attempt id reuses an opaque journal id',command(d,c0,{attemptId:journal[0]}));
 await refused('nonce reuses an opaque journal nonce',command(d,c0,{nonce:journal[2]}));
 await refused('target write epoch equals E1',command(d,c0,{targetWriteEpoch:E1}));
 await refused('target write epoch equals W0',command(d,c0,{targetWriteEpoch:W0}));
 await refused('target credential epoch equals claimed C0',command(d,c0,{targetCredentialEpoch:C0}));
 await refused('target credential equals a burned epoch',command(d,c0,{targetCredentialEpoch:C1}));
 await refused('first attempt without the write burn of E1',command(d,c0,{burnedEpochs:[['credential',C1]]}));
 await refused('first attempt without a credential burn',command(d,c0,{burnedEpochs:[['write',E1]]}));
 await refused('first attempt from a source other than the gate next epoch',command(d,c0,{sourceWriteEpoch:W0}));
 await refused('first attempt from a closed source',command(d,c0,{sourceMode:'closed'}));
 clock=T+100;await refused('attempt window before the predecessor deadline',command(d,c0));clock=T+400;
 const stale=command(d,c0);clock=T+701;await refused('expired attempt window',stale);clock=T+400;
 await refused('non-canonical command bytes',command(d,c0).replace('{"attemptId"','{ "attemptId"'));
 await refused('extra command field',command(d,c0).replace('{"attemptId"','{"extra":1,"attemptId"'));
 await refused('missing command field',JSON.stringify((({controlVersion,...x})=>x)(JSON.parse(command(d,c0)))));
 const proof=await S.successorHmac(OWNER,S.successorOwnerMessage('/v1/control/reopen',CTREE,META,command(d,c0)));
 const floorMacWithOperator=await succ(d,'/v2/successor/reserve',{command:command(d,c0),proof,controlTree:CTREE,metadata:META},OPERATOR);eq('worker-to-Floor MAC with a base root is 403',floorMacWithOperator.status,403);
 eq('successor routes: GET, unknown path and query refuse 404',[(await succ(d,'/v2/successor/census','{}',SUCC,'GET')).status,(await succ(d,'/v2/successor/other','{}')).status,(await succ(d,'/v2/successor/census?x=1','{}')).status],[404,404,404]);
 // Fresh base journal after the predecessor clock: the successor fails closed (it never accepts a new base row).
 clock=T+400;const fresh=await base(d,'/v1/reserve',{operationId:id(),nonce:id(),createdAt:clock,expiresAt:clock+300,requestDigest:'b'.repeat(64),originalFloor:d.F});assert.equal(fresh.status,200);
 const c1=await census(d);await refused('an unresolved base row outside the predecessor clock (new reserve)',command(d,c1));
 d.db.close();
 for(const [label,mutate] of [['a ticket row',db=>db.prepare("INSERT INTO recovery_serving_ticket VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id(),null,JSON.parse(JSON.stringify(db.prepare('SELECT native_floor FROM recovery_serving_gate').get().native_floor)),1,'fetch',id(),'1'.repeat(64),T,T+300,'unknown','2'.repeat(64),T+1)],
  ['a suppression journal row',db=>db.prepare("INSERT INTO recovery_suppression_journal(operation_id,subject_key,retired_generation,original_ticket_digest,original_job_read_digest,terminal_intent_digest,nonce,created_at,expires_at,reserve_sequence,state,native_result_digest,erased_at,retain_until,action_sequence,status_binding_digest)VALUES(?,?,?,?,?,?,?,?,?,1,'expired_unknown',NULL,NULL,?,1,NULL)").run(id(),null,null,'1'.repeat(64),'2'.repeat(64),'3'.repeat(64),id(),T,T+300,T+300+31622400)],
  ['an unexpired suppression copy',db=>db.prepare("INSERT INTO recovery_suppression_copy VALUES(?,?,?,?,?,'closed_native_source',?,?,?,?,0,0,?,'captured',NULL,NULL,NULL)").run(id(),id(),'4'.repeat(64),db.prepare('SELECT native_floor FROM recovery_serving_gate').get().native_floor,db.prepare(`SELECT ${gate.SERVING_GATE_TUPLE_SQL} t FROM recovery_serving_gate`).get().t,'5'.repeat(64),T,T+400,T+700,'6'.repeat(64))]]){
  const x=await incident('a');mutate(x.db);const c=await census(x);const r=await reserve(x,command(x,c));eq('reserve refuses with '+label+' (fixture-only state)',[r.status,rowCount(x.db,'recovery_successor_attempt')],[409,0]);x.db.close();
 }
 for(const [label,env] of [['successor root absent',(({PRIVACY_RECOVERY_SUCCESSOR_SECRET,...x})=>x)(ROOTS)],['owner root absent',(({PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET,...x})=>x)(ROOTS)],['successor root equals owner root',{...ROOTS,PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET:SUCC}],['successor root equals the operator root',{...ROOTS,PRIVACY_RECOVERY_SUCCESSOR_SECRET:OPERATOR}],['owner root equals the serving root',{...ROOTS,PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET:SERVING}]]){
  const x=await incident('a',env);const r=await succ(x,'/v2/successor/census','{}');eq('successor routes held when '+label,r.status,409);
  const gf=await json(await x.object.fetch(new Request(ORIGIN+'/v1/floor')));eq('base GET /v1/floor unaffected when '+label,gf.status,200);x.db.close();
 }
}

async function fenceAndOpenRefusals(){
 const d=await incident('b'),c0=await census(d),raw=command(d,c0),c=JSON.parse(raw);assert.equal((await reserve(d,raw)).status,200);
 eq('second live attempt refuses while the first is unexpired',(await reserve(d,command(d,await census(d),{burnedEpochs:[['credential',C1]]}))).status,409);
 eq('open before fenced refuses',(await opened(d,c,raw)).status,409);
 for(const [label,over] of [['pre tuple from another source epoch',{preTuple:JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,W0,'serving',0,'','',5,9])}],['closed tuple changes counters',{closedTuple:JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.targetWriteEpoch,'closed',0,'','',6,9])}],
  ['closed tuple not closed',{closedTuple:JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.targetWriteEpoch,'serving',0,'','',5,9])}],['fence time before the window',{fencedAt:c.createdAt-1}],['audit sequence below the bound watermark',{auditSequence:c.nativeWatermark-1}],['active pre tuple',{preTuple:JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,E1,'serving',1,'','',5,9])}]]){
  eq('fenced refuses: '+label,[(await fenced(d,c,raw,over)).status,d.db.prepare('SELECT phase FROM recovery_successor_attempt').get().phase],[409,'reserved']);}
 eq('fenced with another request digest refuses',(await succ(d,'/v2/successor/fenced',{attemptId:c.attemptId,requestDigest:'0'.repeat(64),fenceAck:acks(c)})).status,409);
 eq('fenced with an extra ACK field refuses',(await succ(d,'/v2/successor/fenced',{attemptId:c.attemptId,requestDigest:requestDigest(raw),fenceAck:{...acks(c),extra:1}})).status,409);
 // Late predecessor DO requests between reads: only non-authority transitions, so the fresh attempt continues.
 const open=JSON.parse(d.open),attempt=d.db.prepare(`SELECT ${floor.COMPLETION_TUPLE_SQL} t FROM recovery_completion_attempt WHERE operation_id=?`).get(open[0]).t;
 const late=await d.complete(attempt);eq('late predecessor /v1/complete after expiry is refused by its own deadline and commits refused',[late.status,JSON.parse(late.body.attempt)[5]],[409,'refused']);
 const phase1=await d.completionReserve(d.open,'unknown',late.body.attempt);eq('late phase-1 completion reserve on the preserved journal',phase1.status,200);
 const unknown=await d.complete(phase1.body.attempt);eq('late phase-1 complete turns the preserved journal unknown',[unknown.status,JSON.parse(unknown.body.journal)[7]],[200,'unknown']);
 clock++;const f=await fenced(d,c,raw);eq('fenced still succeeds after several monotone non-authority base steps',f.status,200);
 for(const [label,over] of [['serving tuple counters differ',{servingTuple:JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.targetWriteEpoch,'serving',0,'','',5,10])}],['serving tuple still closed',{servingTuple:JSON.stringify([1,S.SUCCESSOR_NATIVE_PROTOCOL,c.targetWriteEpoch,'closed',0,'','',5,9])}],['opened before fenced',{openedAt:c.createdAt}]]){
  eq('open refuses: '+label,[(await opened(d,c,raw,over)).status,d.db.prepare('SELECT phase FROM recovery_successor_attempt').get().phase,d.db.prepare('SELECT state FROM recovery_serving_gate').get().state],[409,'fenced','closing_held']);}
 clock=c.expiresAt;eq('open at the attempt deadline refuses and the gate stays closing_held',[(await opened(d,c,raw)).status,d.db.prepare('SELECT state FROM recovery_serving_gate').get().state,JSON.parse(d.db.prepare(`SELECT ${floor.FLOOR_TUPLE_SQL} t FROM recovery_floor`).get().t)[5]],[409,'closing_held',1]);
 eq('expired fenced attempt is observable and final',JSON.parse((await succ(d,'/v2/successor/observe',{attemptId:c.attemptId,requestDigest:requestDigest(raw)})).body.attempt)[19],'fenced');
 // Chained attempt after the un-opened expiry: source = attempt 1 target (Native would be E2 closed).
 clock=c.expiresAt+60;const c2raw=command(d,await census(d),{sourceWriteEpoch:c.targetWriteEpoch,sourceMode:'closed',burnedEpochs:[['credential',C1]]}),c2=JSON.parse(c2raw);
 eq('attempt 1 credential target can never be reused as a target',(await reserve(d,command(d,await census(d),{sourceWriteEpoch:c.targetWriteEpoch,sourceMode:'closed',targetCredentialEpoch:c.targetCredentialEpoch,burnedEpochs:[['credential',C1]]}))).status,409);
 eq('attempt 1 write target can never be reused as a credential target either',(await reserve(d,command(d,await census(d),{sourceWriteEpoch:c.targetWriteEpoch,sourceMode:'closed',targetCredentialEpoch:c.targetWriteEpoch,targetWriteEpoch:epoch(),burnedEpochs:[['credential',C1]]}))).status,409);
 const r2=await reserve(d,c2raw);eq('chained attempt from the earlier target (closed) reserves; burned C1 insert-or-verify',[r2.status,d.db.prepare("SELECT count(*) n FROM recovery_successor_epoch WHERE epoch=?").get(C1).n],[200,1]);
 eq('earlier attempt and its ledger rows are unchanged by the chained reserve',[d.db.prepare('SELECT phase FROM recovery_successor_attempt WHERE attempt_id=?').get(c.attemptId).phase,d.db.prepare("SELECT count(*) n FROM recovery_successor_epoch WHERE attempt_id=?").get(c.attemptId).n],['fenced',4]);
 // Foreign change to an earlier attempt row (fixture-only tamper) makes the current attempt fail closed.
 d.db.prepare('UPDATE recovery_successor_attempt SET native_watermark=native_watermark+1 WHERE attempt_id=?').run(c.attemptId);
 eq('foreign change to an earlier successor row fails the chained attempt closed',(await fenced(d,c2,c2raw)).status,409);d.db.prepare('UPDATE recovery_successor_attempt SET native_watermark=native_watermark-1 WHERE attempt_id=?').run(c.attemptId);
 eq('restoring the exact earlier row admits the chained fence again',(await fenced(d,c2,c2raw)).status,200);
 clock++;eq('chained attempt opens',(await opened(d,c2,c2raw)).status,200);
 d.db.close();
}

async function preservedLattice(){
 // Each refused shape is a fixture-only tamper between S1 and S3; each must fail closed.
 const cases=[
  ['a journal relabelled complete',db=>db.prepare("UPDATE recovery_journal SET state='complete',result_digest=?,completed_at=? WHERE state='reserved'").run('1'.repeat(64),T+40)],
  ['a journal clock renewed',db=>db.prepare("UPDATE recovery_journal SET created_at=created_at+1,expires_at=expires_at+1 WHERE state='reserved'").run()],
  ['an attempt turned complete',db=>db.prepare("UPDATE recovery_completion_attempt SET state='complete',finished_at=? WHERE state='reserved'").run(T+40)],
  ['an attempt deleted',db=>db.prepare("DELETE FROM recovery_completion_attempt WHERE state='reserved'").run()],
  ['a journal turned unknown without an unknown attempt',db=>db.prepare("UPDATE recovery_journal SET state='unknown',result_digest=?,completed_at=? WHERE state='reserved'").run('1'.repeat(64),T+40)],
  ['a lifecycle row added',db=>db.prepare(`INSERT INTO recovery_serving_lifecycle(operation_id,purpose,nonce,request_digest,created_at,expires_at,original_floor,original_gate,result_floor,result_gate,completed_at) SELECT ?,'initialize_closed',?,?,created_at,expires_at,original_floor,original_gate,result_floor,result_gate,completed_at FROM recovery_serving_lifecycle LIMIT 1`).run(id(),id(),'2'.repeat(64))]];
 for(const [label,mutate] of cases){const d=await incident('b'),c0=await census(d),raw=command(d,c0),c=JSON.parse(raw);assert.equal((await reserve(d,raw)).status,200);const before=d.db.prepare('SELECT phase FROM recovery_successor_attempt').get().phase;mutate(d.db);
  const r=await fenced(d,c,raw);eq('fenced fails closed on '+label,[r.status,before,d.db.prepare('SELECT phase FROM recovery_successor_attempt').get().phase],[409,'reserved','reserved']);d.db.close();}
 // Allowed: a fresh phase-0 'unknown' request reaching unknown between reads; the attempt continues to open.
 const d=await incident('a'),c0=await census(d),raw=command(d,c0),c=JSON.parse(raw);assert.equal((await reserve(d,raw)).status,200);
 const z=await d.completionReserve(d.open,'unknown');eq('late phase-0 unknown request on the preserved reserved journal',z.status,200);eq('late phase-0 unknown completes to unknown',JSON.parse((await d.complete(z.body.attempt)).body.journal)[7],'unknown');
 eq('fenced admits the reachable phase-0 unknown shape',(await fenced(d,c,raw)).status,200);clock++;eq('open admits it too',(await opened(d,c,raw)).status,200);d.db.close();
}

async function main(){
 eq('successor native protocol literal equals the Native module VERSION',S.SUCCESSOR_NATIVE_PROTOCOL,L('privacy-cookie-profile-migration').SUCCESSOR_NATIVE_SEAMS.VERSION);
 eq('successor table names are outside every base name-filtered schema check',[S.SUCCESSOR_ATTEMPT_DDL.startsWith('CREATE TABLE recovery_successor_attempt('),S.SUCCESSOR_EPOCH_DDL.startsWith('CREATE TABLE recovery_successor_epoch(')],[true,true]);
 await wholeChain();await reserveRefusals();await fenceAndOpenRefusals();await preservedLattice();
 console.log(JSON.stringify({checks,scope:'successor-floor-native-sqlite',syntheticNativeAcks:true,providerDrainQualified:false,restoreBarrierQualified:false,readyToReopen:false}));
}
main().catch(e=>{console.error(e);process.exit(1);});
