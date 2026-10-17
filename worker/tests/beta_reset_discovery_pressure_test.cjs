// Real reset source and SQLite; pressure and stale-lease assertions stay strict on V1 and successors.
// Synthetic provider only. SQLite bytes/timing are local evidence, not Cloudflare/D1 limit qualification.
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'beta_reset_slice_test.cjs'),'utf8'),marker='(async()=>{';
if(fixture.split(marker).length!==2)throw Error('slice fixture harness boundary changed');
const harness=fixture.slice(0,fixture.indexOf(marker));
const cases=String.raw`
const {AsyncLocalStorage}=require('node:async_hooks'),cryptoNode=require('node:crypto');
const als=new AsyncLocalStorage(),records=[],failures=[];let assertions=0,sqlRace=null;
const pins=['src/beta-reset.ts','src/beta-reset-policy.ts','src/role-settlements.ts','src/privacy-write-admission.ts','schema.sql'].map(name=>({name,sha256:cryptoNode.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}));
function expect(name,value){assertions++;console.log((value?'PASS ':'FAIL ')+name);if(!value)failures.push(name);}
const transport=providerFetch;
providerFetch=async(input,init={})=>{const s=als.getStore();if(s){s.http++;if((init.method||'GET')==='DELETE')s.deletes++;}return transport(input,init);};
function instrument(){sqlRace=null;sqlBefore=(sql,values)=>{if(sqlRace)sqlRace(sql,values);};sqlObserve=(sql,values)=>{
 const s=als.getStore();if(s){s.physical++;s.maxSqlBytes=Math.max(s.maxSqlBytes,Buffer.byteLength(sql,'utf8'));
  for(const value of values){if(typeof value!=='string')continue;const bytes=Buffer.byteLength(value,'utf8');s.maxBoundStringBytes=Math.max(s.maxBoundStringBytes,bytes);
   if(sql.includes('json_each(?5)')&&value.startsWith('[{')){const rows=JSON.parse(value);if(rows.length&&rows.every(x=>typeof x.id==='string'&&typeof x.subject==='string'&&typeof x.role==='string'))s.discoveryBindings.push({rows:rows.length,utf8Bytes:bytes,keys:Object.keys(rows[0]).sort(),maxIdBytes:Math.max(...rows.map(x=>Buffer.byteLength(x.id))),maxSubjectBytes:Math.max(...rows.map(x=>Buffer.byteLength(x.subject))),maxRoleBytes:Math.max(...rows.map(x=>Buffer.byteLength(x.role)))});}
  }
 }
};}
async function measured(name){const s={name,physical:0,http:0,deletes:0,maxSqlBytes:0,maxBoundStringBytes:0,discoveryBindings:[]},start=process.hrtime.bigint();
 const out=await als.run(s,()=>engine.runBetaResetSlice(env));s.wallMs=Number(process.hrtime.bigint()-start)/1e6;s.outcome=out;records.push(s);console.log('DISCOVERY_PRESSURE_COST '+JSON.stringify(s));
 expect(name+' physical SQL stays <=300',s.physical<=300);expect(name+' HTTP/effects stay <=40/6',s.http<=40&&s.deletes<=6);expect(name+' exact HTTP accounting',out.http===s.http);return s;
}
const rawScan=()=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(engine.BETA_RESET_SCAN_KEY)?.value??null;
function gate(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
async function reached(g,name){let timer;try{await Promise.race([g.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('transport barrier not reached: '+name)),10000);})]);}finally{clearTimeout(timer);}}
async function setup(installed,count=12,roles=[memberRole]){await reset(installed,count,roles);instrument();}
async function pressure(installed){const label=installed?'admitted':'native';await setup(installed,1000,policy.BETA_RESET_ROLE_IDS);const before=targetCount(),r=await measured(label+' 1000 members x12 targets');
 const binding=r.discoveryBindings[0],rowCounts=db.prepare("SELECT COUNT(*) total,SUM(reason IN('beta_inventory_observed','beta_reset_observation_consumed')) observations,SUM(attempts=1) attempted,SUM(state='settled') settled FROM role_settlements WHERE purpose='beta_reset'").get();
 const maxItem=JSON.stringify({id:'a'.repeat(32),subject:'9'.repeat(20),role:'9'.repeat(20)}),localJsonBound=1+12000*(Buffer.byteLength(maxItem,'utf8')+1);
 console.log('DISCOVERY_PRESSURE_ROWS '+JSON.stringify({label,...rowCounts,before,remaining:targetCount(),boundRows:12000,localJsonBound,maxObservedBoundUtf8:binding?.utf8Bytes??null,providerLimitQualified:false}));
 expect(label+' full page observes exactly 12000 tuples once',r.outcome.discoveredMembers===1000&&r.outcome.observedAssignments===12000&&binding?.rows===12000&&rowCounts.observations===12000);
 expect(label+' JSON tuple keys and UTF8 payload stay within finite structural bound',binding?.keys.join(',')==='id,role,subject'&&binding.utf8Bytes<=localJsonBound&&binding.maxIdBytes===32&&binding.maxSubjectBytes<=20&&binding.maxRoleBytes<=20);
 expect(label+' six effects retain 12000 observations plus six fresh successors',r.deletes===6&&rowCounts.total===12006&&rowCounts.attempted===6&&rowCounts.settled===6&&before-targetCount()===6);
 expect(label+' full page cursor advances exactly1000 with no full-pass claim',scan().after===subject(999)&&scan().scanned===1000&&scan().completedPasses===0);
 expect(label+' provider names remain absent from stored custody',!JSON.stringify(jobs()).includes('PRIVATE_'));
}
async function expiredPage(installed){const label=installed?'admitted':'native';await setup(installed);let original;
 pageHook=async()=>{original=rawScan();clock=scan().leaseUntil;pageHook=null;};const r=await measured(label+' page returns at original lease expiry');
 expect(label+' expired page cannot commit discovery or dispatch',r.deletes===0&&jobs().length===0&&r.outcome.state==='held');
 expect(label+' expired page cannot rewrite original scan/cursor',rawScan()===original);
}
async function expiredQualification(installed){const label=installed?'admitted':'native';await setup(installed);let original,expired=false;
 memberHook=async id=>{if(id!==bot&&!expired){expired=true;original=rawScan();clock=scan().leaseUntil;}};const r=await measured(label+' lease expires during pre-DELETE member lookup');
 expect(label+' expired qualification cannot claim or DELETE',expired&&r.deletes===0&&jobs().every(j=>j.attempts===0));
 expect(label+' expired qualification cannot rewrite scan lease',rawScan()===original);
}
async function expiredClaim(installed){const label=installed?'admitted':'native';await setup(installed);let expired=false;
 sqlRace=sql=>{if(!expired&&sql.includes("reason='beta_reset_dispatching'")){expired=true;clock=scan().leaseUntil;}};const r=await measured(label+' lease expires at consuming claim SQL');
 expect(label+' claim repeats original live lease before consuming attempt',expired&&r.deletes===0&&jobs().every(j=>j.attempts===0));
}
async function reacquired(installed,seam){const label=(installed?'admitted':'native')+' '+seam,oldGate=gate(),oldAt=gate(),newGate=gate(),newAt=gate();await setup(installed);let pageCalls=0,qualified=false;
 pageHook=async()=>{pageCalls++;if(seam==='page await'&&pageCalls===1){oldAt.resolve();await oldGate.promise;}else if(pageCalls===2){newAt.resolve();await newGate.promise;}};
 if(seam==='pre-DELETE lookup')memberHook=async id=>{if(id!==bot&&!qualified){qualified=true;oldAt.resolve();await oldGate.promise;}};
 const oldRun=measured(label+' old slice');await reached(oldAt,label+' old');const oldLease=scan().lease;clock=scan().leaseUntil;
 const newRun=measured(label+' successor slice');await reached(newAt,label+' successor');const successorRaw=rawScan(),successorLease=scan().lease;
 expect(label+' successor acquires a distinct lease at exact expiry',successorLease!==oldLease&&scan().leaseUntil===clock+120);
 oldGate.resolve();const old=await oldRun;
 expect(label+' old slice dispatches nothing under successor lease',old.deletes===0&&old.outcome.state==='held');
 expect(label+' old slice cannot overwrite successor cursor or lease',rawScan()===successorRaw);
 if(seam==='page await')expect(label+' old page cannot persist stale discovery',jobs().length===0);
 newGate.resolve();const next=await newRun;
 expect(label+' successor alone resumes bounded progress',next.outcome.state==='progress'&&next.deletes===6);
 expect(label+' original per-intent custody prevents duplicate DELETE',new Set(effects().map(e=>e.path)).size===effects().length);
}
(async()=>{
 console.log('DISCOVERY_PRESSURE_SOURCE_PINS '+JSON.stringify(pins));
 for(const installed of [false,true]){await pressure(installed);await expiredPage(installed);await expiredQualification(installed);await expiredClaim(installed);await reacquired(installed,'page await');await reacquired(installed,'pre-DELETE lookup');}
 expect('runtime pins remained unchanged throughout diagnostic',pins.every(p=>cryptoNode.createHash('sha256').update(fs.readFileSync(path.join(root,p.name))).digest('hex')===p.sha256));
 console.log('DISCOVERY_PRESSURE_SUMMARY '+JSON.stringify({assertions,passed:assertions-failures.length,failures,measurements:records.length,maxPhysical:Math.max(...records.map(r=>r.physical)),maxHttp:Math.max(...records.map(r=>r.http)),maxDelete:Math.max(...records.map(r=>r.deletes)),maxBoundStringBytes:Math.max(...records.map(r=>r.maxBoundStringBytes)),maxWallMs:Math.max(...records.map(r=>r.wallMs)),providerLimitsQualified:false,realProviderActions:0}));
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',harness+cases)(__dirname,require);
