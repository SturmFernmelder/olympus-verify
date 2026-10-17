// .162 guarded recovery successor mounts. Separate module caches model separate services: the unchanged Floor entry
// (class identity, base routes byte-identical with and without the successor roots), and the successor entry
// (default OFF, flag split, no base root, no main index graph). No provider, deployment or production command.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto,createHash}=require('node:crypto'),{pathToFileURL}=require('node:url'),hooks=require('node:async_hooks'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),T=1800000000,ORIGIN='https://privacy-recovery-floor.invalid';
const OPERATOR='synthetic-successor-mount-operator',INITIALIZER='synthetic-successor-mount-initializer',SERVING='synthetic-successor-mount-serving',SUCC='synthetic-successor-mount-worker-root',OWNER='synthetic-successor-mount-owner-root';
let clock=T,serial=0,checks=0;
class FixedDate extends Date{static now(){return clock*1000;}}
function loader(){const context=vm.createContext({crypto:webcrypto,Date:FixedDate,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Request,Response,Headers,URL,URLSearchParams,AbortSignal,AbortController,ReadableStream,ReadableStreamDefaultReader,console,setTimeout,clearTimeout,btoa,atob,fetch(){throw Error('successor-mount-provider-forbidden');}}),cache=new Map(),loaded=[];
 function load(name){if(cache.has(name))return cache.get(name).exports;loaded.push(name);const module={exports:{}};cache.set(name,module);const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),body=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext('(function(require,module,exports){'+body+'\n})',context,{filename:name})(p=>{if(p==='node:async_hooks')return hooks;if(!p.startsWith('./'))throw Error('successor-mount-external-import');return load(p.slice(2));},module,module.exports);return module.exports;}
 load.loaded=loaded;return load;}
const id=()=>(++serial).toString(16).padStart(32,'0'),canon=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function eq(label,a,b){assert.deepEqual(canon(a),canon(b),label);checks++;console.log('PASS '+label);}
const floorLoad=loader(),floorEntry=floorLoad('privacy-private-floor-entry'),floor=floorLoad('privacy-recovery-floor'),gate=floorLoad('privacy-serving-recovery-gate');
const successorLoad=loader(),successorEntry=successorLoad('privacy-private-successor-entry').default;
function storage(){const db=new DatabaseSync(':memory:',{defensive:true});db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 return{db,storage:{sql:{exec(sql,...values){const s=db.prepare(sql),rows=s.columns().length?s.all(...values):(s.run(...values),[]);return{toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};}
async function json(r){const text=await r.text();let body=null;try{body=JSON.parse(text);}catch{}return{status:r.status,body,text};}
async function baseScript(object){
 clock=T;serial=0;const out=[],F0={operationId:id(),nonce:id(),requestDigest:'9'.repeat(64),createdAt:T,expiresAt:T+300,credentialEpoch:'1'.repeat(32),writeEpoch:'2'.repeat(32),sourceTree:'5'.repeat(40),deploymentVersion:'11111111-2222-3333-4444-555555555555'};
 const post=async(pathname,value,secret,header)=>{const raw=JSON.stringify(value),mac=header==='X-Olympus-Recovery-Proof'?await floor.recoveryFloorMac(secret,'POST',pathname,raw):await gate.servingGateMac(secret,'POST',pathname,raw);return json(await object.fetch(new Request(ORIGIN+pathname,{method:'POST',headers:{'Content-Type':'application/json',[header]:mac},body:raw})));};
 const init=await post('/v1/initialize',F0,INITIALIZER,'X-Olympus-Recovery-Proof');out.push(init);const F=init.body.floor;
 out.push(await json(await object.fetch(new Request(ORIGIN+'/v1/floor'))));
 out.push(await post('/v1/serving/initialize-closed',{operationId:id(),nonce:id(),requestDigest:'a'.repeat(64),createdAt:T,expiresAt:T+300,nextWriteEpoch:'3'.repeat(32),originalFloor:F},INITIALIZER,'X-Olympus-Serving-Proof'));
 const reserve=await post('/v1/reserve',{operationId:id(),nonce:id(),createdAt:T,expiresAt:T+300,requestDigest:'b'.repeat(64),originalFloor:F},OPERATOR,'X-Olympus-Recovery-Proof');out.push(reserve);
 out.push(await post('/v1/completion-reserve',{originalJournal:reserve.body.journal,result:'complete',resultDigest:'c'.repeat(64),priorAttempt:null},OPERATOR,'X-Olympus-Recovery-Proof'));
 out.push(await json(await object.fetch(new Request(ORIGIN+'/v1/serving/unresolved'))));
 out.push(await json(await object.fetch(new Request(ORIGIN+'/v2/successor/census',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))));
 out.push(await json(await object.fetch(new Request(ORIGIN+'/v2/other',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))));
 return out.map(r=>[r.status,r.text]);
}
async function main(){
 eq('Floor entry re-export identity unchanged',floorEntry.PrivacyRecoveryFloor===floor.PrivacyRecoveryFloor,true);
 eq('Floor entry fetch still answers 404 with no control route',(await floorEntry.default.fetch()).status,404);
 // Base routes answer byte-identically with and without the two successor roots bound to the Floor.
 const without=storage(),withRoots=storage();
 const a=await baseScript(new floorEntry.PrivacyRecoveryFloor({storage:without.storage},{PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,PRIVACY_SERVING_GATE_SECRET:SERVING}));
 const b=await baseScript(new floorEntry.PrivacyRecoveryFloor({storage:withRoots.storage},{PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,PRIVACY_SERVING_GATE_SECRET:SERVING,PRIVACY_RECOVERY_SUCCESSOR_SECRET:SUCC,PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET:OWNER}));
 eq('base routes byte-identical with or without successor roots',a.slice(0,6),b.slice(0,6));
 eq('successor routes unproven (no MAC) or unknown are refused in both',[a[6][0],b[6][0],a[7][0],b[7][0]],[409,403,404,404]);
 eq('a Floor without successor roots creates no successor table',without.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'recovery_successor%'").get().n,0);
 // Successor entry: default OFF and the flag is read only as an own data property.
 let getterHits=0;const accessor={};Object.defineProperty(accessor,'PRIVACY_SUCCESSOR_CONTROL_ENABLED',{get(){getterHits++;return 'true';},enumerable:true});
 const request=()=>new Request('https://privacy-production-control.invalid/v1/control/status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 const off=[await successorEntry.fetch(request(),{}),await successorEntry.fetch(request(),{PRIVACY_SUCCESSOR_CONTROL_ENABLED:'false'}),await successorEntry.fetch(request(),{PRIVACY_SUCCESSOR_CONTROL_ENABLED:'TRUE'}),await successorEntry.fetch(request(),accessor),await successorEntry.fetch(request(),Object.create({PRIVACY_SUCCESSOR_CONTROL_ENABLED:'true'}))];
 eq('successor entry: missing, false, TRUE, accessor or inherited flag is 404 and no getter runs',[off.map(r=>r.status),getterHits],[[404,404,404,404,404],0]);
 const on=await json(await successorEntry.fetch(request(),{PRIVACY_SUCCESSOR_CONTROL_ENABLED:'true'},{waitUntil(){throw Error('no deferred');}}));
 eq('successor entry ON without its bindings holds before any effect',[on.status,on.body.scope],[409,'private_successor_held_before_effects']);
 eq('successor service graph never loads main index or the original operator handler',[successorLoad.loaded.includes('index'),successorLoad.loaded.includes('privacy-private-operator-entry'),successorLoad.loaded.includes('privacy-successor-control'),successorLoad.loaded.includes('privacy-successor-native')],[false,false,true,true]);
 const toml=fs.readFileSync(path.join(root,'wrangler.privacy-successor.private.toml'),'utf8');
 eq('successor config: private, default OFF, no secret values, only its own vars',[/^workers_dev = false$/m.test(toml),/^preview_urls = false$/m.test(toml),/^routes = \[\]$/m.test(toml),/^PRIVACY_SUCCESSOR_CONTROL_ENABLED = "false"$/m.test(toml),/^PRIVACY_SUCCESSOR_RECOVER_ENABLED = "false"$/m.test(toml),/SECRET\s*=/.test(toml),/PRIVACY_PRODUCTION_CONTROL_ENABLED/.test(toml)],[true,true,true,true,true,false,false]);
 // The owner signer builds exactly the bytes, message and request digest the successor verifies.
 const signer=await import(pathToFileURL(path.join(root,'scripts','private-successor-command.mjs')).href),S=successorLoad('privacy-successor-floor');
 const template={botOrigin:'https://bot.invalid',controlTree:'d'.repeat(40),controlMetadata:{id:'55555555-6666-7777-8888-999999999999',tag:'synthetic',timestamp:'2026-10-17T00:00:00Z'},command:{attemptId:'1'.repeat(32),nonce:'2'.repeat(32),sourceWriteEpoch:'3'.repeat(32),sourceMode:'serving',targetWriteEpoch:'4'.repeat(32),targetCredentialEpoch:'5'.repeat(32),burnedEpochs:[['write','3'.repeat(32)],['credential','6'.repeat(32)]],servingTree:'7'.repeat(40),servingVersion:'11111111-2222-3333-4444-555555555555',layout:'recorded-live-20261010',expectedFloor:'[]',expectedGate:'[]',expectedCensusDigest:'8'.repeat(64),nativeWatermark:3,controlVersion:'55555555-6666-7777-8888-999999999999'}};
 const built=signer.build(template,'recover',T*1000),parsed=S.parseSuccessorRecoverCommand(built.raw);
 eq('signer recover body is accepted by the shared successor parser with the stamped 300 s clock',[parsed.attemptId,parsed.createdAt,parsed.expiresAt,built.url],['1'.repeat(32),T,T+300,'https://bot.invalid/private-production-control/reopen']);
 eq('signer owner message equals the successor verification message',signer.ownerMessage(built),S.successorOwnerMessage('/v1/control/reopen',template.controlTree,built.metadata,built.raw));
 eq('signer request digest equals the successor request digest',built.requestDigest,createHash('sha256').update(S.successorRequestDigestText(template.controlTree,built.metadata,built.raw)).digest('hex'));
 const census=signer.build({...template,command:{}},'census',T*1000,()=>'9'.repeat(32));eq('signer census body matches the successor census parser',S.parseSuccessorCensusCommand(census.raw),{nonce:'9'.repeat(32),createdAt:T,expiresAt:T+300});
 const refused=[];for(const t of [{...template,botOrigin:'http://bot.invalid'},{...template,command:{...template.command,targetCredentialEpoch:'6'.repeat(32)}},{...template,command:{...template.command,controlVersion:'11111111-2222-3333-4444-555555555555'}},{...template,command:{...template.command,extra:1}}]){try{signer.build(t,'recover',T*1000);refused.push(false);}catch{refused.push(true);}}
 eq('signer refuses a non-https origin, a burned target, a version mismatch and an extra field',refused,[true,true,true,true]);
 console.log(JSON.stringify({checks,scope:'successor-entry-mounts',providerDrainQualified:false,readyToReopen:false}));
}
main().catch(e=>{console.error(e);process.exit(1);});
