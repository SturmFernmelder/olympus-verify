/** Independent watcher races with actual source/schema/native SQLite. Only Discord HTTP is synthetic.
 * Pauses both legacy first() and guarded batch() shapes; every pause must actually reach erasure.
 */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const codes=load('codes'),ingest=load('ingest'),secret='fixture-verify-secret-no-real-token';
 const primary=sql=>sql.includes('UPDATE pending SET consumed_at')&&sql.includes('consumed_source');
 function watchDB(base,beforeRead,beforeAudit,beforePrimary,losePrimary){
  return {prepare(sql){const native=base.prepare(sql);let values=[],wrapper;wrapper=new Proxy(native,{get(target,key){if(key==='bind')return(...v)=>{values=v;target.bind(...v);return wrapper;};if(key==='_reviewValues')return values;if(key==='first')return async(...v)=>{const result=await target.first(...v);await beforeRead?.(sql);return result;};if(key==='run')return async(...v)=>{if(sql.includes('INSERT INTO audit'))await beforeAudit?.(values);return target.run(...v);};return Reflect.get(target,key);}});return wrapper;},async batch(stmts){
   for(const s of stmts){await beforeRead?.(s._sql);if(s._sql?.includes('INSERT INTO audit'))await beforeAudit?.(s._reviewValues??[]);}
   if(stmts.some(s=>primary(s._sql??'')))await beforePrimary?.();
   const out=await base.batch(stmts);if(stmts.some(s=>primary(s._sql??'')))await losePrimary?.();return out;
  }};
 }
 const cases=[
  ['banned original read','banned','read_members'],
  ['foreign binding original read','foreign','read_character'],
  ['foreign GUID original read','holder','read_holder'],
  ['already-linked post-primary audit','already','audit_linked'],
  ['verified post-primary audit','new','audit_confirmed'],
  ['late guild-log POST reply','new','late_post'],
 ];
 for(const present of[false,true])for(const[label,branch,pause]of cases){
  const t=reset();if(present)db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'c'.repeat(32),t,t);
  if(branch==='banned')db.prepare('INSERT INTO members(discord_id,banned,ban_reason)VALUES(?,1,?)').run(ID,'Active safety exception');
  else if(branch==='foreign'||branch==='holder'){db.prepare('INSERT INTO members(discord_id)VALUES(?)').run(OTHER);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source,guid)VALUES(?,?,?,'member',?,'fixture',?)").run(branch==='foreign'?'probe name':'holder name',branch==='foreign'?'Probe Name':'Holder Name',OTHER,t,branch==='holder'?'Player-4613-0ABCDEF0':null);}
  else if(branch==='already'){db.prepare('INSERT INTO members(discord_id)VALUES(?)').run(ID);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'member',?,'fixture')").run('probe name','Probe Name',ID,t);}
  db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at)VALUES(?,?,?,?,?)').run(ID,'probe name','Probe Name',t,t+86400);
  let fired=0,completed,proof;
  async function fire(){if(fired)return;fired++;proof=await admission();completed=await eraser.continueServingErasure(env(),proof);}
  const beforeRead=async sql=>{if(pause==='read_members'&&sql.includes('FROM members WHERE discord_id')||pause==='read_character'&&sql.includes('FROM characters c')&&sql.includes('name_key')||pause==='read_holder'&&sql.includes('FROM characters')&&sql.includes('guid')&&sql.includes('LIMIT 1'))await fire();};
  const beforeAudit=async values=>{if(pause==='audit_linked'&&values[2]==='verify.already_linked'||pause==='audit_confirmed'&&values[2]==='verify.confirmed')await fire();};
  if(pause==='late_post')afterPost=fire;
  const e={...env(),DB:watchDB(env().DB,beforeRead,beforeAudit),VERIFY_SECRET:secret,ADMISSION_MODE:'manual',CHANNEL_RECRUITMENT_REVIEW:CHANNEL,CHANNEL_SERVER_LOG:CHANNEL};
  const code=await codes.codeFor(secret,'Probe Name',codes.dayBucket(new Date()));let response,error;try{response=await ingest.postVerify(e,{character:'Probe Name',code,source:'whisper',...(branch==='holder'?{guid:'Player-4613-0ABCDEF0'}:{})});}catch(e){error=e;}
  check(label+' '+(present?'active generation':'captured absence')+' native pause actually erased original account',fired===1&&completed?.state==='complete');
  check(label+' never recreates serving account/link/pending after completion',!raw('SELECT * FROM site_users WHERE discord_id=?',ID)&&!raw('SELECT * FROM characters WHERE discord_id=?',ID)&&!raw('SELECT * FROM pending WHERE discord_id=?',ID)&&raw('SELECT state FROM privacy_subjects WHERE subject_id=?',ID)?.state==='retired');
  check(label+' never restores raw account audit after completion',rows('SELECT * FROM audit WHERE actor=? OR subject=? OR instr(COALESCE(details,\'\'),?)>0',ID,ID,ID).length===0);
  if(branch==='foreign'||branch==='holder')check(label+' preserves other original binding',raw('SELECT discord_id FROM characters WHERE discord_id=?',OTHER)?.discord_id===OTHER);
  if(pause==='late_post'){const custody=raw('SELECT * FROM privacy_provider_messages WHERE message_id=?',MSG);check('late original provider reply retains exact known pointer/cleanup debt',custody?.state==='known'&&custody.cleanup_requested===1&&custody.subjects.includes(ID));check('late reply sends once, no new review/notice dispatch after erasure',calls.filter(x=>x==='POST /api/v10/channels/'+CHANNEL+'/messages').length===1);}
  else check(label+' creates no provider message after original authority closes',calls.filter(x=>x.startsWith('POST ')).length===0);
  check(label+' does not turn unknown authority into normal success',error?.message==='privacy_site_request_held'||response?.status===409||response?.status===503);
 }
 // A lost native primary result may have committed; it cannot be reported as a definite no_pending refusal.
 {const t=reset();db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at)VALUES(?,?,?,?,?)').run(ID,'probe name','Probe Name',t,t+86400);let losses=0;
 const e={...env(),DB:watchDB(env().DB,null,null,null,async()=>{if(!losses++){throw Error('independent lost committed primary reply');}}),VERIFY_SECRET:secret,ADMISSION_MODE:'auto'};
 const code=await codes.codeFor(secret,'Probe Name',codes.dayBucket(new Date())),r=await ingest.postVerify(e,{character:'Probe Name',code,source:'whisper'}),body=await r.json();
 check('lost primary reply fixture proves native commit landed',losses===1&&raw('SELECT consumed_at FROM pending')?.consumed_at!==null&&raw('SELECT status FROM characters')?.status==='verified');
 check('lost primary reply remains explicit outcome_unknown',r.status===503&&body.result==='outcome_unknown');
 check('lost primary reply does not repeat native write or provider continuation',calls.filter(x=>x.startsWith('POST ')).length===0&&!raw('SELECT * FROM invite_queue'));
 }
 // A demonstrably different original consumer is a no_pending conflict, with no replacement authority.
 {const t=reset();db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at)VALUES(?,?,?,?,?)').run(ID,'probe name','Probe Name',t,t+86400);let rival=0;
 const e={...env(),DB:watchDB(env().DB,null,null,async()=>{if(!rival++){db.prepare('UPDATE pending SET consumed_at=?,consumed_source=?,name_key=?,name=?').run(t,'other original relay','rival name','Rival Name');}}),VERIFY_SECRET:secret,ADMISSION_MODE:'auto'};
 const code=await codes.codeFor(secret,'Probe Name',codes.dayBucket(new Date())),r=await ingest.postVerify(e,{character:'Probe Name',code,source:'whisper'}),body=await r.json();
 check('competing different consumer is classified from original fingerprint',rival===1&&r.status===200&&body.result==='no_pending');check('different consumer has no new link/provider/queue effect',!raw('SELECT * FROM characters')&&!raw('SELECT * FROM invite_queue')&&calls.filter(x=>x.startsWith('POST ')).length===0);
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent watcher original-authority checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
