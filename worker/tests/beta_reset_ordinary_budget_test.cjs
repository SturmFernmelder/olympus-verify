// Same scheduled-budget fixture family, explicit negative entry and admitted component accounting.
// Original four dimensions, capped seeds and fault predicate retained; no production changes.
// Real Native/controller/provider timing and full CI qualification remain false.
const fs=require('node:fs'),path=require('node:path'),fixtureCrypto=require('node:crypto');
const input=fs.readFileSync(path.join(__dirname,'scheduled_budget_test.cjs'),'utf8');
const marker='/** One job alone, over a fresh seeded database';
if(input.split(marker).length!==2)throw Error('ordinary workload fixture boundary changed');
let harness=input.slice(0,input.indexOf(marker));
const transformations=[
  {
    "label": "same original public membership fixture binding",
    "before": "ROLE = \"1549581282227265566\"",
    "after": "ROLE = \"1552077551839617104\""
  },
  {
    "label": "observe original single calls",
    "before": "count() { COUNT.physicalTrips++; COUNT.physicalStatements++; },",
    "after": "count() { COUNT.physicalTrips++; COUNT.physicalStatements++; betaNativeSingle = true; },"
  },
  {
    "label": "observe original full plans before transaction",
    "before": "beforeBatch(plan) {\n      COUNT.physicalStatements += plan.length - 1;",
    "after": "beforeBatch(plan) {\n      betaNativeSingle = false;\n      betaObservePlan(plan);\n      COUNT.physicalStatements += plan.length - 1;"
  },
  {
    "label": "observe exact original results and trace",
    "before": "    statement(sql, params) {\n      lastNativeSQL = sql;",
    "after": "    afterBatch(plan, result) { betaObserveResult(plan, result); },\n    statement(sql, params) {\n      betaObserveStatement(sql, params);\n      lastNativeSQL = sql;"
  },
  {
    "label": "compatible original failure diagnostic binding",
    "before": "        failedNativeStatement = { sql, params: params.slice(), name: error.name, message: error.message };",
    "after": "        failedNativeStatement = { sql, params: params.slice(), name: error.name, message: error.message };\n        lastFailedSQL = failedNativeStatement;"
  }
];
for(const row of transformations){if(harness.split(row.before).length!==2)throw Error('ordinary fixture seam changed: '+row.label);harness=harness.replace(row.before,row.after);}
const cases=String.raw`
const assert=require('node:assert/strict'),cryptoNode=require('node:crypto');
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:cryptoNode.webcrypto});
const policy=makeLoader()('./beta-reset-policy'),cutoff=policy.BETA_RESET_CUTOFF;
const ranks=[policy.BETA_RESET_ROLE_IDS[2],policy.BETA_RESET_ROLE_IDS[4],policy.BETA_RESET_ROLE_IDS[7],policy.BETA_RESET_ROLE_IDS[9],policy.BETA_RESET_ROLE_IDS[11]];
const rankNames=['Guild Master','Officer','Veteran','Member','Initiate'];
const botRole='770000000000000020',leader='1554261979684933742',officer='1554262223038324840',raidLeader='1554262510650007602',moderator='571363393555136512';
let roleState=new Map(),sqlSeen=[],guardedPuts=[],transportFault=null;
let betaNativeSingle=false,lastFailedSQL=null,betaFaultHits=0,betaActivePhase=null;
const betaPlans=new WeakMap(),betaGroups=[],betaJoinFailures=[],reports=[],phases=[],setupReceipts=[];
// These copied-helper diagnostics are deliberately aggregate/unattributed. No per-job measurements are fabricated.
const JOB_COUNTS={},PHYSICAL_JOB_COUNTS={},JOB_ERRORS=[];
const SOURCE_PINS=new Map(),protocolEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sourcePins=new Map(fs.readdirSync(path.join(root,'src')).filter(x=>x.endsWith('.ts')).map(name=>{const file=path.join(root,'src',name);return [file,cryptoNode.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];}));
const sourceCompilerPin={file:require.resolve('typescript'),sha256:cryptoNode.createHash('sha256').update(fs.readFileSync(require.resolve('typescript'))).digest('hex')};
function readSource(file){const b=fs.readFileSync(file);SOURCE_PINS.set(file,{bytes:b.length,sha256:cryptoNode.createHash('sha256').update(b).digest('hex')});return b.toString('utf8');}
function protocolAssert(label,value,details){check(label,!!value);if(!value){const error=Error('beta ordinary fixture assertion: '+label);error.fixtureDetails=details;throw error;}}
function betaObservePlan(plan){const row={ordinal:betaGroups.length,phase:betaActivePhase?.label??'setup',plan:plan.map(s=>({sql:s.statement,params:s.params.slice()})),result:null,committed:false};betaPlans.set(plan,row);betaGroups.push(row);}
function betaObserveResult(plan,result){const row=betaPlans.get(plan);if(!row)throw Error('unobserved original Native plan');row.result=result;row.committed=true;row.nativeGroupOrdinal=native.nativeGroups.length-1;}
function betaObserveStatement(sql,params){
 if(betaNativeSingle){betaNativeSingle=false;if(!sql.includes('privacy_write_admission')){COUNT.trips++;COUNT.statements++;}}
 sqlSeen.push({sql,values:params.slice()});
 JOB_COUNTS.unattributed=COUNT.statements;PHYSICAL_JOB_COUNTS.unattributed=COUNT.physicalStatements;
}
function rawCurrentEnvironment(e){return {...e,DB:native};}
const originalSharedBodyFailures=new WeakMap();let observedSourceBodyInvocations=0;
function originalFixtureCustodyReadback(observationReads){
 const read=(sql)=>{observationReads.push({database:'original-local-DO',sql});return doDb.prepare(sql).all();};
 return {floor:read('SELECT * FROM recovery_floor ORDER BY singleton'),gate:read('SELECT * FROM recovery_serving_gate ORDER BY singleton'),tickets:read('SELECT * FROM recovery_serving_ticket ORDER BY ticket_id')};
}
async function originalSharedBody(index,e){observedSourceBodyInvocations++;const pending=[],global=activeLoader('./privacy-global-serving-origin'),ctx={waitUntil(p){pending.push(p);}},request=new Request('https://guild.example/fixture-original-scheduled-shared-body'),original=global.captureGlobalServingEntry(rawCurrentEnvironment(e),ctx,'fetch',request);let componentReturned=false,componentValue,componentChildrenJoined=false;
 try{await global.dispatchGlobalServingEntry(original,async()=>{try{componentValue=await index.runSourceEpoch2ScheduledBody(original.env,ctx);componentReturned=true;await Promise.all(pending);componentChildrenJoined=true;}catch(error){const outcomes=await Promise.allSettled(pending);betaJoinFailures.push({error,pending:pending.length,outcomes,childrenSettledAfterFailure:true});throw error;}});return {jobs:pending.length,componentReturned,componentValue,componentChildrenJoined,componentOnly:true};}
 catch(error){if(error&&typeof error==='object')originalSharedBodyFailures.set(error,{jobs:pending.length,componentReturned,componentValue,componentChildrenJoined,componentOnly:true});console.log('ORIGINAL_SHARED_BODY_FAILURE '+JSON.stringify({name:error?.name,constructor:error?.constructor?.name,message:error?.message,exactRecoveryFloorHeld:error instanceof activeLoader('./privacy-recovery-held').RecoveryFloorHeld,componentReturned,componentValue,componentReturnType:typeof componentValue,pending:pending.length,counts:COUNT,jobCounts:JOB_COUNTS,physicalJobCounts:PHYSICAL_JOB_COUNTS,jobErrors:JOB_ERRORS,failedSQLWitness:lastFailedSQL,lastNativeSQL}));throw error;}
}

function protocolRootWitness(before,after,nested=[]){
 const prior=new Map(before.tickets.map(r=>[r.ticket_id,r])),nestedRows=nested.flatMap(r=>r.custody.newTickets),nestedIds=new Set(nestedRows.map(r=>r.ticket_id)),nestedStable=nested.every(r=>r.returned&&r.custody.settled)&&nestedRows.every(r=>protocolEqual(after.tickets.find(a=>a.ticket_id===r.ticket_id),r));
 const added=after.tickets.filter(r=>!prior.has(r.ticket_id)&&!nestedIds.has(r.ticket_id)),roots=added.filter(r=>r.parent_ticket_id===null),root=roots.length===1?roots[0]:null,rows=new Map(added.map(r=>[r.ticket_id,r]));
 const path=row=>{const seen=new Set();let current=row;while(current&&current!==root){if(seen.has(current.ticket_id)||seen.size>=added.length)return null;seen.add(current.ticket_id);current=rows.get(current.parent_ticket_id);}return current===root?seen:null;};
 const hex=(v,n)=>typeof v==='string'&&v.length===n&&!/[^0-9a-f]/.test(v),children=new Set(added.map(r=>r.parent_ticket_id)),unknownLeaves=added.filter(r=>r.state==='unknown'&&!children.has(r.ticket_id));
 // A paused outer root can be running. A separate completed mutation may not rewrite it.
 const priorUnchanged=protocolEqual(after.tickets.filter(r=>prior.has(r.ticket_id)),before.tickets);
 const closed=nestedStable&&!!root&&root.purpose==='fetch'&&added.every(r=>path(r)!==null&&r.native_floor===root.native_floor&&r.floor_sequence===root.floor_sequence&&hex(r.ticket_id,32)&&hex(r.nonce,32)&&r.expires_at===r.created_at+300&&['settled','unknown'].includes(r.state)&&hex(r.result_digest,64)&&Number.isSafeInteger(r.finished_at)&&r.finished_at>=r.created_at&&r.finished_at<r.expires_at)&&new Set(after.tickets.map(r=>r.ticket_id)).size===after.tickets.length&&new Set(after.tickets.map(r=>r.nonce)).size===after.tickets.length&&priorUnchanged&&protocolEqual(before.floor,after.floor)&&protocolEqual(before.gate,after.gate);
 return {closed,settled:closed&&added.every(r=>r.state==='settled'),unknown:closed&&root.state==='unknown'&&unknownLeaves.length>0&&unknownLeaves.every(r=>[...path(r)].every(id=>rows.get(id).state==='unknown')),root,newTickets:added,nestedRootLabels:nested.map(r=>r.label),unknownLeaves,priorUnchanged};
}

function protocolInventory(){
 const file=path.join(root,'src','index.ts'),text=readSource(file),parsed=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),matches=parsed.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='runSourceEpoch2ScheduledBody');
 protocolAssert('one parsed exported async original scheduler function body',parsed.parseDiagnostics.length===0&&matches.length===1&&!!matches[0].body&&matches[0].modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&matches[0].modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword));
 const fn=matches[0],start=fn.getStart(parsed),body=text.slice(fn.body.getStart(parsed)+1,fn.body.end-1),jobs=['ensureSchema',...[...body.matchAll(/deferOriginalServing\(ctx,'([^']+)'/g)].map(m=>m[1])];protocolAssert('exact 24 original source jobs and unchanged670/700 envelopes',start>=0&&jobs.length===24&&new Set(jobs).size===24&&protocolEqual([...jobs].sort(),budget.SCHEDULED_BUDGET.map(j=>j.job).sort())&&protocolEqual([...jobs].sort(),budget.ADMISSION_SCHEDULED_BUDGET.map(j=>j.job).sort())&&budget.SCHEDULED_WORST_CASE===670&&budget.ADMISSION_SCHEDULED_WORST_CASE===700,{jobs});return jobs;}

// Local fixture evidence only. No Native/source work, clock or custody change.
const PROTOCOL_GRAPH_LIMITS=Object.freeze({record:4096,shard:1048576,stringChunk:65536});
function protocolGraphHash(file){const h=cryptoNode.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);let bytes=0;try{for(;;){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(!n)break;h.update(buffer.subarray(0,n));bytes+=n;}}finally{fs.closeSync(fd);}return{bytes,sha256:h.digest('hex')};}
function protocolGraphWriteAll(fd,data){let offset=0;while(offset<data.length){const n=fs.writeSync(fd,data,offset,data.length-offset);if(n<=0)throw Error('evidence_write_stalled');offset+=n;}}
function* protocolGraphLines(file){const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);let pending=Buffer.alloc(0);try{for(;;){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(!n)break;const current=Buffer.concat([pending,buffer.subarray(0,n)]);let start=0;for(let at=0;at<current.length;at++)if(current[at]===10){const line=current.subarray(start,at);if(!line.length||line.length+1>PROTOCOL_GRAPH_LIMITS.record)throw Error('evidence_record_size');for(const byte of line)if(byte<32||byte>126)throw Error('evidence_record_non_ascii');yield JSON.parse(line.toString('ascii'));start=at+1;}pending=Buffer.from(current.subarray(start));if(pending.length>=PROTOCOL_GRAPH_LIMITS.record)throw Error('evidence_record_size');}if(pending.length)throw Error('evidence_partial_record');}finally{fs.closeSync(fd);}}
function protocolGraphWrite(value,directory,observeError=null){
 fs.mkdirSync(directory,{recursive:false});const index=path.join(directory,'shards.ndjson'),indexFd=fs.openSync(index,'wx'),nodes=new WeakMap(),queue=[],strings=new Map(),callables=new WeakMap();let shardFd=null,shardHash=null,shardBytes=0,shardCount=0,records=0,edges=0,stringBytes=0,stringChunks=0,finished=false,callableCount=0,unobservedErrorStacks=0;
 const count={nodes:0,edges:0,strings:0,stringChunks:0,stringBytes:0,records:0,shards:0,callables:0,unobservedErrorStacks:0};
 const line=data=>{const bytes=Buffer.from(JSON.stringify(data)+'\n','ascii');if(bytes.length>PROTOCOL_GRAPH_LIMITS.record)throw Error('evidence_record_size');return bytes;};
 const closeShard=()=>{if(shardFd===null)return;fs.closeSync(shardFd);shardFd=null;protocolGraphWriteAll(indexFd,line({file:'records-'+String(shardCount).padStart(6,'0')+'.ndjson',bytes:shardBytes,sha256:shardHash.digest('hex')}));};
 const record=data=>{const bytes=line(data);if(shardFd===null||shardBytes+bytes.length>PROTOCOL_GRAPH_LIMITS.shard){closeShard();shardCount++;shardFd=fs.openSync(path.join(directory,'records-'+String(shardCount).padStart(6,'0')+'.ndjson'),'wx');shardHash=cryptoNode.createHash('sha256');shardBytes=0;}protocolGraphWriteAll(shardFd,bytes);shardHash.update(bytes);shardBytes+=bytes.length;records++;};
 const string=value=>{if(strings.has(value))return strings.get(value);const id=strings.size;strings.set(value,id);const hash=cryptoNode.createHash('sha256');let chunks=0,bytes=0,inline=null;if(value.length<=256){const data=Buffer.from(value,'utf16le');inline=data.toString('base64');bytes=data.length;stringBytes+=bytes;hash.update(data);}for(let start=inline===null?0:value.length;start<value.length;start+=PROTOCOL_GRAPH_LIMITS.stringChunk/2){const data=Buffer.from(value.slice(start,start+PROTOCOL_GRAPH_LIMITS.stringChunk/2),'utf16le'),file='string-'+String(id).padStart(8,'0')+'-'+String(chunks).padStart(6,'0')+'.bin';const fd=fs.openSync(path.join(directory,file),'wx');try{protocolGraphWriteAll(fd,data);}finally{fs.closeSync(fd);}hash.update(data);bytes+=data.length;record({t:'chunk',string:id,index:chunks,file,bytes:data.length,sha256:cryptoNode.createHash('sha256').update(data).digest('hex')});chunks++;stringChunks++;stringBytes+=data.length;}record({t:'string',id,units:value.length,chunks,bytes,inline,sha256:hash.digest('hex')});return id;};
 const token=value=>{if(value===null)return['null'];if(value===undefined)return['undefined'];if(typeof value==='string')return['string',string(value)];if(typeof value==='boolean')return['boolean',value];if(typeof value==='number')return['number',Number.isNaN(value)?'NaN':value===Infinity?'+Infinity':value===-Infinity?'-Infinity':Object.is(value,-0)?'-0':value];if(typeof value==='bigint')return['bigint',string(value.toString())];if(typeof value!=='object')throw Error('evidence_unsupported_value');if(!nodes.has(value)){nodes.set(value,queue.length);queue.push(value);}return['node',nodes.get(value)];};
 const prototypeNames=value=>{const names=[];let p=Object.getPrototypeOf(value);for(let depth=0;p!==null;depth++){if(depth>=64)throw Error('evidence_prototype_depth');const d=Object.getOwnPropertyDescriptor(p,'constructor'),name=d&&Object.hasOwn(d,'value')&&typeof d.value==='function'?Object.getOwnPropertyDescriptor(d.value,'name'):null;names.push(name&&Object.hasOwn(name,'value')&&typeof name.value==='string'?name.value:null);p=Object.getPrototypeOf(p);}return names;};
 const callable=fn=>{if(fn===undefined)return null;if(typeof fn!=='function')throw Error('evidence_accessor_shape');if(callables.has(fn))return callables.get(fn);const id=callableCount++,name=Object.getOwnPropertyDescriptor(fn,'name'),length=Object.getOwnPropertyDescriptor(fn,'length');callables.set(fn,id);record({t:'callable',id,name:name&&Object.hasOwn(name,'value')&&typeof name.value==='string'?string(name.value):null,length:length&&Object.hasOwn(length,'value')&&Number.isSafeInteger(length.value)&&length.value>=0?length.value:null,authorityReconstructed:false});return id;};
 let root;
 const exceptionFields=object=>Object.fromEntries(['name','message','stack'].map(key=>{let owner=object,depth=0;while(owner!==null){const d=Object.getOwnPropertyDescriptor(owner,key);if(d){if(Object.hasOwn(d,'value'))return[key,{observation:'data',depth,value:token(d.value)}];if(key!=='stack')throw Error('evidence_required_exception_accessor');unobservedErrorStacks++;return[key,{observation:'unobserved_accessor',depth,get:callable(d.get),set:callable(d.set),reason:'lazy_accessor_not_invoked'}];}owner=Object.getPrototypeOf(owner);depth++;if(depth>64)throw Error('evidence_prototype_depth');}return[key,{observation:'absent'}];}));
 try{
  root=token(value);
  for(let id=0;id<queue.length;id++){
   const object=queue[id],array=Array.isArray(object),keys=Reflect.ownKeys(object).filter(key=>!(array&&key==='length'));if(keys.some(key=>typeof key!=='string'))throw Error('evidence_symbol_key');
   const length=array?Object.getOwnPropertyDescriptor(object,'length'):null;if(array&&(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0))throw Error('evidence_array_length');
   const names=prototypeNames(object),isError=names.includes('Error');if(!(array&&names.join(',')==='Array,Object'||!array&&(names.length===0||names.join(',')==='Object'||isError&&names.at(-1)==='Object')))throw Error('evidence_unsupported_internal_data');record({t:'node',id,kind:array?'array':'object',length:array?length.value:null,properties:keys.length,prototypeNames:names.map(name=>name===null?null:string(name)),exception:isError?{...exceptionFields(object),provenance:token(observeError?observeError(object):null)}:null});
   for(const key of keys){const d=Object.getOwnPropertyDescriptor(object,key);if(!d)throw Error('evidence_missing_descriptor');if(!Object.hasOwn(d,'value')){if(key!=='stack'||!isError)throw Error('evidence_required_accessor_refused');record({t:'unobservedErrorStack',node:id,key:string(key),get:callable(d.get),set:callable(d.set),enumerable:!!d.enumerable,configurable:!!d.configurable,reason:'lazy_accessor_not_invoked'});}else record({t:'edge',node:id,key:string(key),value:token(d.value),enumerable:!!d.enumerable,writable:!!d.writable,configurable:!!d.configurable});edges++;}
  }
  closeShard();fs.closeSync(indexFd);finished=true;Object.assign(count,{nodes:queue.length,edges,strings:strings.size,stringChunks,stringBytes,records,shards:shardCount,callables:callableCount,unobservedErrorStacks});
  const graph={encoding:'olympus-fixture-graph-v1',directory:path.basename(directory),limits:PROTOCOL_GRAPH_LIMITS,root,counts:count,index:{file:'shards.ndjson',...protocolGraphHash(index)}};
  protocolGraphValidate(directory,graph);return graph;
 }catch(error){if(shardFd!==null){fs.closeSync(shardFd);shardFd=null;}if(!finished)fs.closeSync(indexFd);const failure={status:'incomplete',reason:error.message,recordsWritten:records,nodesDiscovered:queue.length,stringsDiscovered:strings.size,shardsStarted:shardCount,fullCIQualified:false};try{fs.writeFileSync(path.join(directory,'incomplete.json'),JSON.stringify(failure)+'\n',{flag:'wx'});}catch{}throw error;}
}

// Independent streaming readback: no reconstruction and no calls into the writer.
function protocolGraphValidate(directory,graph){
 const fail=reason=>{throw Error('evidence_graph_invalid:'+reason);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),natural=n=>Number.isSafeInteger(n)&&n>=0,hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s),closed=(row,keys)=>{if(!row||typeof row!=='object'||Array.isArray(row)||!same(Object.keys(row).sort(),[...keys].sort()))fail('record_shape');};
 closed(graph,['encoding','directory','limits','root','counts','index']);if(graph.encoding!=='olympus-fixture-graph-v1'||graph.directory!==path.basename(directory)||!same(graph.limits,PROTOCOL_GRAPH_LIMITS))fail('format');
 const files=new Set(['shards.ndjson']),nodeHeaders=new Map(),nodeKeys=new Map(),stringHeaders=new Map(),chunks=new Map(),nodeRefs=new Set(),stringRefs=new Set(),bigintRefs=new Set(),canonicalBigints=new Set(),callables=new Map(),callableRefs=new Set(),stringDigests=new Set();let records=0,edges=0,shards=0,stringBytes=0,stringChunks=0,unobservedErrorStacks=0;
 const checkToken=token=>{if(!Array.isArray(token)||typeof token[0]!=='string')fail('token');const [type,value]=token;if(['null','undefined'].includes(type)){if(token.length!==1)fail('empty_token');return;}if(token.length!==2)fail('token_length');if(type==='node'||type==='string'||type==='bigint'){if(!natural(value))fail('reference');(type==='node'?nodeRefs:stringRefs).add(value);if(type==='bigint')bigintRefs.add(value);return;}if(type==='boolean'){if(typeof value!=='boolean')fail('boolean');return;}if(type==='number'){if(!(typeof value==='number'&&Number.isFinite(value)||['NaN','+Infinity','-Infinity','-0'].includes(value)))fail('number');return;}fail('token_type');};
 // Canonical BigInt decimal grammar over bounded UTF-16LE bytes, never BigInt()
 // or whole-string reconstruction. Invalid ordinary strings stop scanning early.
 const decimalState=()=>({valid:true,units:0,negative:false,leadingZero:false});
 const decimalBytes=(state,bytes)=>{if(!state.valid)return;for(let at=0;at<bytes.length;at+=2){const unit=bytes[at]+bytes[at+1]*256;if(state.units===0&&unit===45){state.negative=true;state.units++;continue;}const first=state.units===(state.negative?1:0);if(unit<48||unit>57||!first&&state.leadingZero){state.valid=false;return;}if(first)state.leadingZero=unit===48;state.units++;}};
 const decimalComplete=state=>state.valid&&state.units>(state.negative?1:0)&&!(state.negative&&state.leadingZero);
 checkToken(graph.root);closed(graph.index,['file','bytes','sha256']);if(graph.index.file!=='shards.ndjson'||!same(protocolGraphHash(path.join(directory,'shards.ndjson')),{bytes:graph.index.bytes,sha256:graph.index.sha256}))fail('index_hash');
 for(const shard of protocolGraphLines(path.join(directory,'shards.ndjson'))){
  closed(shard,['file','bytes','sha256']);shards++;if(shard.file!=='records-'+String(shards).padStart(6,'0')+'.ndjson'||!natural(shard.bytes)||shard.bytes<1||shard.bytes>PROTOCOL_GRAPH_LIMITS.shard||!hex(shard.sha256)||files.has(shard.file))fail('shard');files.add(shard.file);if(!same(protocolGraphHash(path.join(directory,shard.file)),{bytes:shard.bytes,sha256:shard.sha256}))fail('shard_hash');
  for(const row of protocolGraphLines(path.join(directory,shard.file))){records++;
   if(row.t==='node'){closed(row,['t','id','kind','length','properties','prototypeNames','exception']);if(!natural(row.id)||nodeHeaders.has(row.id)||!['array','object'].includes(row.kind)||!natural(row.properties)||!(row.kind==='array'?natural(row.length)&&row.length<=4294967295:row.length===null)||!Array.isArray(row.prototypeNames)||row.prototypeNames.length>64)fail('node');for(const id of row.prototypeNames){if(id!==null&&!natural(id))fail('prototype');if(id!==null)stringRefs.add(id);}if(row.exception!==null){closed(row.exception,['name','message','stack','provenance']);checkToken(row.exception.provenance);for(const [key,field]of Object.entries(row.exception).filter(([key])=>key!=='provenance')){if(field.observation==='absent')closed(field,['observation']);else if(field.observation==='data'){closed(field,['observation','depth','value']);if(!natural(field.depth)||field.depth>64)fail('exception_depth');checkToken(field.value);}else if(key==='stack'&&field.observation==='unobserved_accessor'){closed(field,['observation','depth','get','set','reason']);if(!natural(field.depth)||field.depth>64||field.reason!=='lazy_accessor_not_invoked')fail('exception_accessor');for(const id of [field.get,field.set]){if(id!==null&&!natural(id))fail('exception_callable');if(id!==null)callableRefs.add(id);}unobservedErrorStacks++;}else fail('exception_observation');}}nodeHeaders.set(row.id,row);nodeKeys.set(row.id,new Set());
   }else if(row.t==='edge'){closed(row,['t','node','key','value','enumerable','writable','configurable']);if(!nodeHeaders.has(row.node)||!natural(row.key)||nodeKeys.get(row.node).has(row.key)||[row.enumerable,row.writable,row.configurable].some(v=>typeof v!=='boolean'))fail('edge');nodeKeys.get(row.node).add(row.key);stringRefs.add(row.key);checkToken(row.value);edges++;
   }else if(row.t==='callable'){closed(row,['t','id','name','length','authorityReconstructed']);if(!natural(row.id)||callables.has(row.id)||!(row.name===null||natural(row.name))||!(row.length===null||natural(row.length))||row.authorityReconstructed!==false)fail('callable');if(row.name!==null)stringRefs.add(row.name);callables.set(row.id,row);
   }else if(row.t==='unobservedErrorStack'){closed(row,['t','node','key','get','set','enumerable','configurable','reason']);if(!nodeHeaders.has(row.node)||!natural(row.key)||nodeKeys.get(row.node).has(row.key)||[row.enumerable,row.configurable].some(v=>typeof v!=='boolean')||row.reason!=='lazy_accessor_not_invoked')fail('stack_accessor');const equalsText=(id,text)=>{const s=stringHeaders.get(id);return !!s&&s.units===text.length&&s.sha256===cryptoNode.createHash('sha256').update(Buffer.from(text,'utf16le')).digest('hex');};if(!equalsText(row.key,'stack')||!nodeHeaders.get(row.node).prototypeNames.some(id=>id!==null&&equalsText(id,'Error')))fail('stack_owner');for(const id of [row.get,row.set]){if(id!==null&&!natural(id))fail('accessor_reference');if(id!==null)callableRefs.add(id);}nodeKeys.get(row.node).add(row.key);stringRefs.add(row.key);edges++;
   }else if(row.t==='chunk'){closed(row,['t','string','index','file','bytes','sha256']);if(!natural(row.string)||stringHeaders.has(row.string)||!natural(row.index)||row.file!=='string-'+String(row.string).padStart(8,'0')+'-'+String(row.index).padStart(6,'0')+'.bin'||!natural(row.bytes)||row.bytes<2||row.bytes>PROTOCOL_GRAPH_LIMITS.stringChunk||row.bytes%2||!hex(row.sha256)||files.has(row.file))fail('chunk');const current=chunks.get(row.string)||{count:0,bytes:0,hash:cryptoNode.createHash('sha256'),decimal:decimalState()};if(row.index!==current.count)fail('chunk_order');files.add(row.file);const bytes=fs.readFileSync(path.join(directory,row.file));if(bytes.length!==row.bytes||cryptoNode.createHash('sha256').update(bytes).digest('hex')!==row.sha256)fail('chunk_hash');current.hash.update(bytes);decimalBytes(current.decimal,bytes);current.bytes+=bytes.length;current.count++;chunks.set(row.string,current);stringChunks++;stringBytes+=bytes.length;
   }else if(row.t==='string'){closed(row,['t','id','units','chunks','bytes','inline','sha256']);if(!natural(row.id)||stringHeaders.has(row.id)||!natural(row.units)||!natural(row.chunks)||!natural(row.bytes)||row.bytes!==row.units*2||!hex(row.sha256)||stringDigests.has(row.units+':'+row.sha256))fail('string');const current=chunks.get(row.id)||{count:0,bytes:0,hash:cryptoNode.createHash('sha256'),decimal:decimalState()};if(row.inline!==null){if(typeof row.inline!=='string'||row.inline.length>684||row.chunks!==0||current.count!==0)fail('inline_string');const data=Buffer.from(row.inline,'base64');if(data.toString('base64')!==row.inline||data.length>512||data.length!==row.bytes)fail('inline_string_bytes');current.bytes=data.length;current.hash.update(data);decimalBytes(current.decimal,data);stringBytes+=data.length;}if(row.chunks!==current.count||row.bytes!==current.bytes||row.inline===null&&row.chunks!==Math.ceil(row.bytes/PROTOCOL_GRAPH_LIMITS.stringChunk)||row.sha256!==current.hash.digest('hex'))fail('string_hash');if(decimalComplete(current.decimal))canonicalBigints.add(row.id);chunks.delete(row.id);stringHeaders.set(row.id,row);stringDigests.add(row.units+':'+row.sha256);
   }else fail('record_type');
  }
 }
 if(chunks.size)fail('unclosed_strings');const sequential=map=>{for(let i=0;i<map.size;i++)if(!map.has(i))fail('nonsequential_ids');};sequential(nodeHeaders);sequential(stringHeaders);sequential(callables);
 for(const id of nodeRefs)if(!nodeHeaders.has(id))fail('missing_node');for(const id of stringRefs)if(!stringHeaders.has(id))fail('missing_string');for(const [id,row]of nodeHeaders){if(nodeKeys.get(id).size!==row.properties)fail('property_count');const names=row.prototypeNames.map(id=>id===null?null:stringHeaders.get(id)?.inline===null?null:Buffer.from(stringHeaders.get(id)?.inline??'','base64').toString('utf16le')),isError=names.includes('Error');if(!(row.kind==='array'&&names.join(',')==='Array,Object'||row.kind==='object'&&(names.length===0||names.join(',')==='Object'||isError&&names.at(-1)==='Object'))||(row.exception!==null)!==isError)fail('prototype_scope');if(row.kind==='array')for(const keyId of nodeKeys.get(id)){const key=stringHeaders.get(keyId),text=key.inline===null?null:Buffer.from(key.inline,'base64').toString('utf16le');if(text==='length'||text!==null&&/^(0|[1-9][0-9]{0,9})$/.test(text)&&Number(text)<4294967295&&Number(text)>=row.length)fail('array_index');}}
 for(const id of bigintRefs)if(!canonicalBigints.has(id))fail('bigint_grammar');
 for(const id of callableRefs)if(!callables.has(id))fail('missing_callable');if(nodeRefs.size!==nodeHeaders.size||stringRefs.size!==stringHeaders.size||callableRefs.size!==callables.size)fail('unreferenced_data');
 const counts={nodes:nodeHeaders.size,edges,strings:stringHeaders.size,stringChunks,stringBytes,records,shards,callables:callables.size,unobservedErrorStacks};if(!same(counts,graph.counts))fail('counts');if(!same(fs.readdirSync(directory).sort(),[...files].sort()))fail('file_set');return{valid:true,counts,allHashesVerified:true,allReferencesResolved:true,reconstructed:false,unobservedErrorStacks,authorityReconstructed:false};
}

// Explicit inspection only; caller opts into whole reconstruction after validation.
function protocolGraphReconstruct(directory,graph){
 protocolGraphValidate(directory,graph);const strings=new Map(),objects=new Map(),edges=[];
 for(const shard of protocolGraphLines(path.join(directory,'shards.ndjson')))for(const row of protocolGraphLines(path.join(directory,shard.file))){if(row.t==='string'){const parts=[];for(let n=0;n<row.chunks;n++)parts.push(fs.readFileSync(path.join(directory,'string-'+String(row.id).padStart(8,'0')+'-'+String(n).padStart(6,'0')+'.bin')).toString('utf16le'));strings.set(row.id,row.inline===null?parts.join(''):Buffer.from(row.inline,'base64').toString('utf16le'));}else if(row.t==='node')objects.set(row.id,row.kind==='array'?new Array(row.length):Object.create(null));else if(row.t==='edge'||row.t==='unobservedErrorStack')edges.push(row);}
 const value=t=>t[0]==='null'?null:t[0]==='undefined'?undefined:t[0]==='node'?objects.get(t[1]):t[0]==='string'?strings.get(t[1]):t[0]==='bigint'?BigInt(strings.get(t[1])):t[0]==='boolean'?t[1]:typeof t[1]==='number'?t[1]:t[1]==='NaN'?NaN:t[1]==='+Infinity'?Infinity:t[1]==='-Infinity'?-Infinity:-0;
 for(const row of edges)Object.defineProperty(objects.get(row.node),strings.get(row.key),{value:row.t==='unobservedErrorStack'?Object.freeze({observation:'unobserved_error_stack_accessor',getIdentity:row.get,setIdentity:row.set,authorityReconstructed:false}):value(row.value),enumerable:row.enumerable,writable:row.t==='edge'?row.writable:false,configurable:row.configurable});return value(graph.root);
}


const outputDirectory=process.env.BETA_ORDINARY_EVIDENCE_DIR?path.resolve(process.env.BETA_ORDINARY_EVIDENCE_DIR):fs.mkdtempSync(path.join(require('node:os').tmpdir(),'olympus-beta-ordinary-'));
fs.mkdirSync(outputDirectory,{recursive:true});
if(fs.existsSync(path.join(outputDirectory,'ordinary-data'))||fs.existsSync(path.join(outputDirectory,'ordinary-summary.json')))throw Error('beta ordinary evidence is one-use');
console.log('BETA_ORDINARY_EVIDENCE_DIRECTORY '+outputDirectory);

const originalFetch=globalThis.fetch;
// Stable before fresh() imports the current original graph. Fallback forwards the original input/options unchanged.
const betaProvider=async(input,init={})=>{
 const request=input instanceof Request?input:null,u=new URL(request?request.url:String(input)),p=u.pathname,method=String(init.method??request?.method??'GET').toUpperCase();
 assert.equal(u.origin,'https://discord.com');assert.ok(p.startsWith('/api/v10/'));
 if(p==='/api/v10/guilds/'+GUILD+'/roles'&&method==='GET'){FETCHES.push(method+' '+p);return reply([{id:GUILD,position:0,permissions:'0',managed:false},{id:ROLE,position:1,permissions:'0',managed:false},{id:botRole,position:50,permissions:'268435456',managed:false},...ranks.map((id,i)=>({id,position:i+2,permissions:'0',managed:false})),...[leader,officer,raidLeader,moderator].map((id,i)=>({id,position:i+20,permissions:'1024',managed:false}))]);}
 let m;if((m=p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/))&&method==='GET'){
  FETCHES.push(method+' '+p);return reply({user:{id:m[1],username:'synthetic'},roles:m[1]===BOT?[botRole]:[...new Set([...(roleState.get(m[1])||[]),...(HAS_ROLE.has(m[1])?[ROLE]:[])])]});
 }
 if((m=p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/))){
  FETCHES.push(method+' '+p);assert.ok(method==='PUT'||method==='DELETE');
  if(method==='PUT'&&policy.BETA_RESET_ROLE_IDS.includes(m[2])){
   const claim=db.prepare("SELECT * FROM role_settlements WHERE subject=? AND guild_id=? AND role_id=? AND desired=1 AND attempts=1 AND state='dispatching' ORDER BY created_at DESC LIMIT 1").get(m[1],GUILD,m[2]);
   assert.ok(claim&&claim.claim_nonce,'actual scoped PUT must already own durable dispatch custody');
   assert.ok(sqlSeen.some(x=>x.sql.includes('betaResetPolicyV1')&&x.values.includes(cutoff)),'actual PUT claim must repeat source cutoff SQL');
   guardedPuts.push({subject:m[1],role:m[2],purpose:claim.purpose,claim,method,path:p});
  }
  const current=roleState.get(m[1])||[];roleState.set(m[1],method==='PUT'?[...new Set([...current,m[2]])]:current.filter(x=>x!==m[2]));
  if(m[2]===ROLE){if(method==='PUT')HAS_ROLE.add(m[1]);else HAS_ROLE.delete(m[1]);}if(method==='PUT')await ON_PUT?.(m[1]);return new Response(null,{status:204});
 }
 // The unchanged fallback already handles original Request bodies. An unused init override is refused explicitly.
 if(request&&(init.method!==undefined&&method!==request.method||init.body!==undefined))throw Error('unsupported fallback fixture Request override');
 return originalFetch(input,init);
};
globalThis.fetch=betaProvider;
const providerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');
function providerIdentity(){const d=Object.getOwnPropertyDescriptor(globalThis,'fetch');assert.ok(d&&['value','get','set','writable','enumerable','configurable'].every(k=>d[k]===providerDescriptor[k])&&d.value===betaProvider,'same stable provider descriptor/function');}
async function seedAck(sql,params,changes,label){const result=await run(sql,...params);setupReceipts.push({label,sql,params,result});assert.equal(result.changes,changes,label);return result;}
async function seedPublicRanks(){
 const selected=MEMBER_IDS[0],sid=Number((await seedAck("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at) VALUES(?,?,'fixture',65,'public-budget',1,1,?)",[T,T,T],1,'original public snapshot')).lastInsertRowid);
 assert.ok(Number.isSafeInteger(sid)&&sid>0);
 for(let i=0;i<5;i++)await seedAck('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)',[sid,'rank'+i,'Rank '+i,rankNames[i],i,i===3?'Player-1234-00001000':'Player-1234-'+String(100+i).padStart(8,'0')],1,'original rank row '+i);
 await seedAck('UPDATE characters SET guid=? WHERE discord_id=?',['Player-1234-00001000',selected],1,'original selected GUID');
 const rid=one('SELECT MAX(id) AS id FROM roster_effect_runs').id;await seedAck('UPDATE roster_effect_runs SET snapshot_id=?,prev_snapshot_id=? WHERE id=?',[sid,sid,rid],1,'original effect snapshot binding');
 for(let i=0;i<EFFECT_IDS.length;i++){const did=EFFECT_IDS[i],guid='Player-1234-'+String(30000+i).padStart(8,'0'),c=one('SELECT name_key,name FROM characters WHERE discord_id=?',did);await seedAck('UPDATE characters SET guid=? WHERE discord_id=?',[guid,did],1,'original effect character '+i);await seedAck('UPDATE roster_effects SET guid=? WHERE run_id=? AND seq=?',[guid,rid,i],1,'original effect GUID '+i);await seedAck('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)',[sid,c.name_key,c.name,'Member',3,guid],1,'original effect roster row '+i);}
 assert.equal(EFFECT_IDS.length,60);assert.equal(one('SELECT COUNT(*) n FROM roster_members WHERE snapshot_id=?',sid).n,65);
 assert.equal(one('SELECT member_count FROM roster_snapshots WHERE id=?',sid).member_count,65);
 return {subject:selected,snapshot:sid,run:rid,guid:'Player-1234-00001000',rank:3,rankName:'Member',profile:'beta-five'};
}
function readRows(sql,...params){if(betaActivePhase)betaActivePhase.observationReads.push({database:'original-local-business',sql,params});return db.prepare(sql).all(...params);}
function businessState(){return readRows("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(({name})=>({name,rows:readRows('SELECT * FROM "'+name.replace(/"/g,'""')+'"')}));}
function custody(){const reads=[];const value=originalFixtureCustodyReadback(reads);if(betaActivePhase)betaActivePhase.observationReads.push(...reads);return value;}
function selection(original){const subject=original.subject;return {
 privacy:readRows('SELECT subject_id,generation,state,revision FROM privacy_subjects WHERE subject_id=?',subject),
 account:readRows('SELECT discord_id,account_incarnation,session_version,in_server,denied FROM site_users WHERE discord_id=?',subject),
 snapshot:readRows('SELECT * FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)'),
 character:readRows('SELECT name_key,name,guid,status FROM characters WHERE discord_id=? ORDER BY name_key',subject),
 roster:readRows('SELECT snapshot_id,guid,name_key,name,rank,rank_index FROM roster_members WHERE snapshot_id=? AND guid=?',original.snapshot,original.guid),
 promotion:readRows("SELECT id,ts,details FROM audit WHERE action='roster.member' AND json_extract(details,'$.discordId')=? AND ts=? ORDER BY id",subject,T-600),
 membership:readRows("SELECT * FROM role_settlements WHERE subject=? AND purpose='beta_guard_grant' ORDER BY id",subject),
 ranks:readRows("SELECT * FROM role_settlements WHERE subject=? AND purpose='roster_native_rank' ORDER BY id",subject),
 provider:{membership:HAS_ROLE.has(subject),roles:(roleState.get(subject)||[]).slice().sort()}};}
function sameSelection(a,b,original){return ['privacy','account','snapshot','character','roster','promotion'].every(k=>protocolEqual(a[k],b[k]))&&b.privacy.length===1&&b.privacy[0].state==='active'&&b.account.length===1&&b.snapshot.length===1&&b.snapshot[0].id===original.snapshot&&b.roster.length===1&&b.roster[0].guid===original.guid&&b.roster[0].rank_index===3&&b.roster[0].rank==='Member';}
function receiptBirth(row){return Object.fromEntries(Object.entries(row).filter(([key])=>!['state','reason','checked_at'].includes(key)));}
function outcome(){return {obligations:one('SELECT COUNT(*) n FROM community_contribution_obligations').n,profiles:one('SELECT COUNT(*) n FROM community_profiles').n,names:one('SELECT COUNT(*) n FROM members WHERE names_at IS NOT NULL').n,reserved:one("SELECT COUNT(*) n FROM site_reserved WHERE status='queued'").n,reminders:one("SELECT COUNT(*) n FROM community_event_reminders WHERE state='posted'").n,effects:one('SELECT COUNT(*) n FROM roster_effects WHERE done_at IS NULL').n};}
function beginPhase(label,kind){providerIdentity();resetCount();sqlSeen=[];guardedPuts=[];FETCHES=[];failedNativeStatement=null;lastFailedSQL=null;for(const x of [JOB_COUNTS,PHYSICAL_JOB_COUNTS])for(const k of Object.keys(x))delete x[k];JOB_ERRORS.length=0;const row={label,kind,observationReads:[],groupStart:betaGroups.length,traceStart:native.nativeTrace.length,nativeGroupStart:native.nativeGroups.length,faultStart:betaFaultHits,returned:false,error:null};phases.push(row);betaActivePhase=row;return row;}
function endPhase(row){row.counts={...COUNT};row.sql=sqlSeen;row.http=FETCHES.slice();row.guardedPuts=guardedPuts;row.groups=betaGroups.slice(row.groupStart);row.nativeTrace=native.nativeTrace.slice(row.traceStart);row.nativeGroups=native.nativeGroups.slice(row.nativeGroupStart);row.legacyFaultHits=betaFaultHits-row.faultStart;row.unmeasuredPerJobDiagnostics=true;row.custodyAfter=custody();providerIdentity();betaActivePhase=null;}
async function negativeCallback(index,e,label){const row=beginPhase(label,'original-plain-callback'),pending=[],errors=[],oldError=console.error;row.before=businessState();row.custodyBefore=custody();console.error=(...args)=>errors.push(args.map(String).join(' '));
 try{await index.default.scheduled({cron:'*/30 * * * *',scheduledTime:T*1000,noRetry(){}},e,{waitUntil:p=>pending.push(p)});await Promise.all(pending);row.returned=true;}catch(error){row.error=error;throw error;}finally{await Promise.allSettled(pending);console.error=oldError;row.after=businessState();row.errors=errors;row.pending=pending.length;endPhase(row);}
 protocolAssert(label+' unchanged original callback is held before work',row.returned&&row.pending===0&&errors.length===1&&errors[0]==='schema check failed; skipping this run error'&&row.counts.physicalStatements===0&&row.counts.physicalTrips===0&&row.http.length===0&&protocolEqual(row.before,row.after)&&protocolEqual(row.custodyBefore,row.custodyAfter),row);
 return row;
}
async function negativeConfiguredRoot(e,label){const row=beginPhase(label,'original-configured-OFF-root');row.before=businessState();row.custodyBefore=custody();let caught=null,work=0,pending=[];
 try{const origin=activeLoader('./privacy-global-serving-origin'),ctx={waitUntil:p=>pending.push(p)},capture=origin.captureGlobalServingEntry(rawCurrentEnvironment(e),ctx,'fetch',new Request('https://guild.example/fixture-beta-original-OFF'));await origin.dispatchGlobalServingEntry(capture,async()=>{work++;});row.returned=true;}catch(error){caught=error;row.error=error;}finally{await Promise.allSettled(pending);row.after=businessState();row.pending=pending.length;row.work=work;endPhase(row);}
 protocolAssert(label+' exact original configured OFF capture refusal',caught instanceof activeLoader('./privacy-recovery-held').RecoveryFloorHeld&&caught.message==='recovery_floor_held'&&!row.returned&&work===0&&pending.length===0&&row.counts.physicalStatements===0&&row.counts.physicalTrips===0&&row.http.length===0&&protocolEqual(row.before,row.after)&&protocolEqual(row.custodyBefore,row.custodyAfter),row);
 return row;
}
async function positiveComponent(index,e,label,original){const row=beginPhase(label,'admitted-original-shared-body');row.custodyBefore=custody();row.selectionBefore=selection(original);row.outcomeBefore=outcome();const errors=[],oldError=console.error;console.error=(...args)=>errors.push(args.map(String).join(' '));
 try{row.component=await originalSharedBody(index,e);row.returned=true;}catch(error){row.error=error;row.originalFailure=originalSharedBodyFailures.get(error);throw error;}finally{console.error=oldError;row.errors=errors;row.selectionAfter=selection(original);row.outcome=outcome();endPhase(row);row.custody=protocolRootWitness(row.custodyBefore,row.custodyAfter);}
 protocolAssert(label+' current original body joins exactly23 children',row.component.jobs===23&&row.component.componentReturned&&row.component.componentValue===undefined&&row.component.componentChildrenJoined&&row.errors.length===0,row);
 protocolAssert(label+' new root and all original descendants settle on unchanged floor',row.custody.settled,row.custody);
 protocolAssert(label+' every physical attempt stays within original700',row.counts.physicalStatements<=700&&row.counts.statements<=670&&row.counts.physicalStatements>0,{counts:row.counts});
 protocolAssert(label+' exact original Native group/result count parity',row.groups.length===row.nativeGroups.length&&row.groups.every(g=>g.committed&&Array.isArray(g.result)&&g.result.length===g.plan.length&&protocolEqual(g.plan,native.nativeGroups[g.nativeGroupOrdinal]))&&row.counts.physicalStatements===row.nativeGroups.reduce((n,g)=>n+g.length,0)+(row.counts.physicalTrips-row.nativeGroups.length),{groups:row.groups.length,counts:row.counts});
 protocolAssert(label+' no reset discovery or reset remover',!one("SELECT 1 FROM site_settings WHERE key='betaResetScanV1'")&&!one("SELECT 1 FROM role_settlements WHERE purpose='beta_reset'"));
 protocolAssert(label+' original subject generation incarnation GUID and roster selection survive',sameSelection(row.selectionBefore,row.selectionAfter,original));
 const writer=row.sql.filter(x=>x.sql.startsWith('UPDATE privacy_write_admission SET entry_changes=')).length;
 protocolAssert(label+' positive source work includes actual writer admission overhead',writer>0);row.admissionWriterGroups=writer;
 console.log('PUBLIC_ORDINARY_COST '+JSON.stringify({label,kind:row.kind,counts:row.counts,http:row.http.length,jobs:row.component.jobs,legacyFaultHits:row.legacyFaultHits,outcome:row.outcome,componentOnly:true}));
 return row;
}
async function scenario(installed,nativeRanks,coldWorst){
 T=cutoff-90000;await fresh();db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');return String(T);});await seedAll();roleState=new Map();const original=await seedPublicRanks();
 // Original duplicate INSERT was obsolete: the unchanged current installer already creates this exact row.
 protocolAssert('current installer retains exact auditTypedNames115 marker',one("SELECT value,updated_at FROM site_settings WHERE key='auditTypedNames'")?.value==='115'&&one("SELECT value,updated_at FROM site_settings WHERE key='auditTypedNames'").updated_at===T);
 const e=env({ROLE_GUILD_MEMBER:ROLE,ROLE_GUILD_LEADER:leader,ROLE_OFFICER:officer,ROLE_RAID_LEADER:raidLeader,ROLE_MODERATOR:moderator,SITE_ADMINS:id(1000),QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:ranks}),QR_PHASE1_ENABLED:'false',QR_RANK_MAPPING_ENABLED:nativeRanks?'true':'false',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',PRIVACY_ERASURE_ENABLED:'false',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:installed?'true':'false',BETA_RESET_REMOVALS_ENABLED:'false',ROLE_CALL_BUDGET:'40'});
 const index=activeLoader('./index'),label=(installed?'requested ON':'requested OFF')+(nativeRanks?' ranks':' membership')+(coldWorst?' cold worst':' cold'),report={label,installed,nativeRanks,coldWorst,original,positiveAdmission:true,historicalUnadmittedPositiveQualified:false,historicalMigrationFaultCoverageQualified:false};reports.push(report);
 protocolAssert(label+' fixed public scope pre-cutoff removal OFF',e.GUILD_ID===policy.BETA_RESET_GUILD_ID&&e.ROLE_GUILD_MEMBER===policy.BETA_RESET_ROLE_IDS[0]&&T<cutoff&&e.BETA_RESET_REMOVALS_ENABLED==='false');
 protocolAssert(label+' all conditional ordinary source children enabled',e.COMMUNITY_FEATURES.split(',').includes('departures')&&e.COMMUNITY_FEATURES.split(',').includes('contributions')&&e.CONTRIBUTIONS_MODE==='ledger'&&e.PRIVACY_RETENTION_ENABLED==='true');
 transportFault=coldWorst?sql=>/^SELECT \w+ FROM \w+ LIMIT 0$/.test(sql)||/^ALTER TABLE /.test(sql):null;
 FAIL=transportFault?sql=>{const hit=transportFault(sql);if(hit)betaFaultHits++;return hit;}:null;
 if(FAIL)FAIL.message=sql=>/^ALTER TABLE/.test(sql)?'D1_ERROR: duplicate column name':'D1_ERROR: no such column';
 try{
  report.callback=await negativeCallback(index,e,label+' original callback');
  if(!installed)report.offRoot=await negativeConfiguredRoot(e,label+' original OFF root');
  const positive=installed?e:{...e,PRIVACY_WRITE_ADMISSION_ENABLED:'true'};
  const first=await positiveComponent(index,positive,label+(installed?' admitted component':' distinct ON component counterpart'),original);report.first=first;
  const guardReads=first.sql.filter(x=>x.values.includes(policy.BETA_RESET_POLICY_KEY)&&x.sql.includes(' AS matches')),guardedClaims=first.sql.filter(x=>x.sql.includes('betaResetPolicyV1')&&x.values.includes(cutoff)&&/INSERT|UPDATE/.test(x.sql));
  check(label+' physically executes policy reads, original SQL claims and durable membership PUT',guardReads.length>0&&guardedClaims.length>0&&first.guardedPuts.some(p=>p.role===ROLE&&p.purpose==='beta_guard_grant'));
  check(label+' retains capped ordinary maintenance work',first.outcome.obligations===CAP.obligationsPerRun&&first.outcome.profiles===2*CAP.profilesPerRun&&first.outcome.names===CAP.namesPerRun&&first.outcome.reserved===CAP.autoQueueRounds*250&&first.outcome.reminders===1&&first.outcome.effects<60);
  const member=first.selectionAfter.membership,memberPut=first.guardedPuts.filter(p=>p.subject===original.subject&&p.role===ROLE),firstRanks=first.guardedPuts.filter(p=>p.subject===original.subject&&ranks.includes(p.role));
  protocolAssert(label+' first membership effect owns acknowledged original receipt',member.length===1&&member[0].subject===original.subject&&member[0].guild_id===GUILD&&member[0].role_id===ROLE&&member[0].desired===1&&member[0].attempts===1&&member[0].state==='settled'&&member[0].reason==='legacy_put_acknowledged'&&/^[0-9a-f]{32}$/.test(member[0].claim_nonce)&&member[0].created_at===T&&member[0].expires_at===T+300&&memberPut.length===1&&protocolEqual(receiptBirth(memberPut[0].claim),receiptBirth(member[0]))&&first.selectionAfter.provider.membership&&firstRanks.length===0,{member,memberPut,firstRanks});
  if(nativeRanks){
   const second=await positiveComponent(index,positive,label+' next original native-rank phase',original);report.second=second;
   protocolAssert(label+' rank successor is distinct and preserves all original membership facts',second.custody.root.ticket_id!==first.custody.root.ticket_id&&protocolEqual(first.selectionAfter.membership,second.selectionAfter.membership)&&sameSelection(first.selectionAfter,second.selectionAfter,original)&&second.selectionAfter.provider.membership&&!second.guardedPuts.some(p=>p.subject===original.subject&&p.role===ROLE));
   const puts=second.guardedPuts.filter(p=>p.subject===original.subject&&p.role===ranks[3]&&p.purpose==='roster_native_rank'),receipt=second.selectionAfter.ranks.filter(r=>r.role_id===ranks[3]&&r.desired===1);
   check(label+' actually dispatches scoped native rank with original custody',puts.length===1&&receipt.length===1&&receipt[0].id===puts[0].claim.id&&receipt[0].state==='settled'&&receipt[0].attempts===1&&receipt[0].reason==='effect_and_current_server_confirmed'&&receipt[0].subject_generation===first.selectionAfter.privacy[0].generation&&receipt[0].native_guid===original.guid&&receipt[0].roster_id===original.snapshot&&receipt[0].native_profile==='beta-five'&&receipt[0].native_rank===3&&receipt[0].native_rank_name==='Member'&&second.selectionAfter.provider.roles.includes(ranks[3]));
  }
 }finally{FAIL=null;transportFault=null;providerIdentity();}
}
function betaOutput(failure){
 const scope={fullCIQualified:false,normalScheduledEntryQualified:false,nativeWholeCallbackQualified:false,providerOrDeploymentQualified:false};
 const sourceAfter=[...sourcePins].map(([file,before])=>({file,before,after:cryptoNode.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),compilerAfter=cryptoNode.createHash('sha256').update(fs.readFileSync(sourceCompilerPin.file)).digest('hex'),sourceUnchanged=sourceAfter.every(p=>p.before===p.after)&&compilerAfter===sourceCompilerPin.sha256;if(!sourceUnchanged)process.exitCode=1;
 const data={schema:'beta-ordinary-fixture-observations-v1',status:failure||ok!==n||!sourceUnchanged?'failed':'passed',failure,checks:n,passed:ok,originalScenarioCount:reports.length,reports,phases,setupReceipts,sourcePins:[...sourcePins],sourceAfter,sourceUnchanged,compiler:sourceCompilerPin,compilerAfter,joinFailures:betaJoinFailures,currentOpenPhase:betaActivePhase,allNativeGroups:betaGroups,legacyFaultHits:betaFaultHits,historicalMigrationFaultCoverageQualified:false,unmeasuredPerJobDiagnostics:true,...scope};
 const graph=protocolGraphWrite(data,path.join(outputDirectory,'ordinary-data'),error=>({sharedBody:originalSharedBodyFailures.get(error)??null,modular:originalServingFailures.get(error)??null}));
 const summary={schema:data.schema,status:data.status,checks:n,passed:ok,originalScenarioCount:reports.length,negativeCallbacks:phases.filter(p=>p.kind==='original-plain-callback').length,negativeOffRoots:phases.filter(p=>p.kind==='original-configured-OFF-root').length,positiveComponents:phases.filter(p=>p.kind==='admitted-original-shared-body').length,maxPhysical:Math.max(0,...phases.map(p=>p.counts?.physicalStatements??0)),target:700,legacyFaultHits:betaFaultHits,historicalMigrationFaultCoverageQualified:false,unmeasuredPerJobDiagnostics:true,dataGraph:graph,...scope};
 const text=JSON.stringify(summary,null,2)+'\n';if(Buffer.byteLength(text)>16384)throw Error('beta ordinary summary bound');fs.writeFileSync(path.join(outputDirectory,'ordinary-summary.json'),text,{flag:'wx'});console.log('PUBLIC_ORDINARY_SUMMARY '+JSON.stringify(summary));
}
let betaFailure=null;
(async()=>{
 protocolInventory();
 for(const installed of [false,true])for(const nativeRanks of [false,true])await scenario(installed,nativeRanks,!installed);
 check('all candidate runtime bytes remained unchanged',Array.from(sourcePins).every(([file,hash])=>cryptoNode.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===hash));
 check('original four dimensions and ordered calls retained',protocolEqual(reports.map(r=>[r.installed,r.nativeRanks,r.coldWorst]),[[false,false,true],[false,true,true],[true,false,false],[true,true,false]]));
 check('four negative callbacks two original OFF refusals and six separate admitted phases completed',phases.filter(p=>p.kind==='original-plain-callback').length===4&&phases.filter(p=>p.kind==='original-configured-OFF-root').length===2&&phases.filter(p=>p.kind==='admitted-original-shared-body').length===6&&phases.every(p=>p.returned||p.kind==='original-configured-OFF-root'));
 if(ok!==n)process.exitCode=1;
})().catch(error=>{betaFailure=error;console.error(error);process.exitCode=1;}).finally(()=>{
 try{providerIdentity();betaOutput(betaFailure);}catch(error){console.error('BETA_ORDINARY_EVIDENCE_FAILURE',error);process.exitCode=1;}finally{globalThis.Date=RealDate;globalThis.setTimeout=realSetTimeout;globalThis.fetch=originalFetch;db?.close();doDb?.close();}
});

`;
new Function('__dirname','require',harness+cases)(__dirname,require);
