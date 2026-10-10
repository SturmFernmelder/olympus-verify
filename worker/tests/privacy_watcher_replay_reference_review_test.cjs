/** Independent consumed-ticket and queue-resume original-row races, actual SQLite/source. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const codes=load('codes'),ingest=load('ingest'),secret='fixture-verify-secret-no-real-token';
 function pauseDb(base,read,audit){return{prepare(sql){let values=[],p;const n=base.prepare(sql);p=new Proxy(n,{get(target,key){if(key==='bind')return(...v)=>{values=v;target.bind(...v);return p;};if(key==='_reviewValues')return values;if(key==='first')return async(...v)=>{const out=await target.first(...v);await read?.(sql);return out;};if(key==='run')return async(...v)=>{if(sql.includes('INSERT INTO audit'))await audit?.(values);return target.run(...v);};return Reflect.get(target,key);}});return p;},async batch(stmts){for(const s of stmts){await read?.(s._sql);if(s._sql?.includes('INSERT INTO audit'))await audit?.(s._reviewValues??[]);}return base.batch(stmts);}};}
 for(const active of[false,true]){
  const t=reset();if(active)db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'c'.repeat(32),t,t);
  db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce,consumed_at,consumed_source)VALUES(?,?,?,?,?,?,?,?)').run(ID,'used name','Used Name',t,t+86400,'K7Q',t,'original consumer');
  let fired=0,erased;const audit=async v=>{if(v[2]==='verify.ticket_reused'&&!fired++){const proof=await admission();erased=await eraser.continueServingErasure(env(),proof);}};
  const e={...env(),DB:pauseDb(env().DB,null,audit),VERIFY_SECRET:secret,CHANNEL_SERVER_LOG:CHANNEL},code=await codes.ticketFor(secret,'K7Q',codes.dayBucket(new Date(t*1000)));let response,error;
  try{response=await ingest.postVerify(e,{character:'Probe Name',code,source:'whisper'});}catch(e){error=e;}
  check('used-ticket '+(active?'active':'absence')+' pause genuinely reaches serving completion',fired===1&&erased?.state==='complete');
  check('used-ticket preserves retired account closure',!raw('SELECT * FROM pending WHERE discord_id=?',ID)&&!raw('SELECT * FROM site_users WHERE discord_id=?',ID)&&raw('SELECT state FROM privacy_subjects WHERE subject_id=?',ID)?.state==='retired');
  check('used-ticket never resurrects raw ID audit/provider payload',rows('SELECT * FROM audit WHERE instr(COALESCE(details,\'\'),?)>0',ID).length===0&&calls.filter(x=>x.startsWith('POST ')).length===0);
  check('used-ticket observation grants no link or invite effect',!raw('SELECT * FROM characters')&&!raw('SELECT * FROM invite_queue'));
 }
 for(const mutation of['generation','queue_fingerprint']){
  const t=reset();db.prepare("INSERT INTO invite_queue(name_key,name,discord_id,status,created_at,attempts,retry_after,last_reason)VALUES(?,?,?,'queued',?,2,?,'in_another_guild')").run('probe name','Probe Name',ID,t,t+3600);
  let fired=0,expected;const read=async sql=>{if(!fired&&sql.includes('FROM invite_queue')&&sql.includes('ORDER BY id LIMIT 1')){fired++;
   if(mutation==='generation')db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'e'.repeat(32),t,t);
   else db.prepare('UPDATE invite_queue SET created_at=created_at+1,attempts=99,claimed_by=?').run('new physical claim');
   expected=JSON.stringify(rows('SELECT * FROM invite_queue'));
  }};
  const e={...env(),DB:pauseDb(env().DB,read,null),VERIFY_SECRET:secret,CHANNEL_SERVER_LOG:CHANNEL},code=await codes.codeFor(secret,'Probe Name',codes.dayBucket(new Date()));let response,error;
  try{response=await ingest.postVerify(e,{character:'Probe Name',code,source:'whisper'});}catch(e){error=e;}
  check('queue '+mutation+' original selection pause actually mutates concurrent authority',fired===1);
  check('queue '+mutation+' does not adopt replacement authority/row',JSON.stringify(rows('SELECT * FROM invite_queue'))===expected);
  check('queue '+mutation+' never adds audit/provider payload from stale row',rows('SELECT * FROM audit WHERE instr(COALESCE(details,\'\'),?)>0',ID).length===0&&calls.filter(x=>x.startsWith('POST ')).length===0);
  check('queue '+mutation+' no successful resume is fabricated',error||response?.status!==200||(await response.json()).result!=='resumed');
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent watcher replay-reference checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
