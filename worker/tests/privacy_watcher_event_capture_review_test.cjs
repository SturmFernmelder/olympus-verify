/** Independent original-capture coverage for watcher event branches, actual source/native SQLite. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const ingest=load('ingest');
 const cases=[
  ['declined invite',{type:'invite',name:'Probe Name',ok:false,detail:'declined the invitation'},'queue'],
  ['expired invite',{type:'invite',name:'Probe Name',ok:false,detail:'another guild'},'queue'],
  ['other-guild invite',{type:'invite',name:'Probe Name',ok:false,detail:'already in a guild'},'queue'],
  ['successful invite',{type:'invite',name:'Probe Name',ok:true},'queue'],
  ['fallback joined queue',{type:'joined',name:'Probe Name',origin:'chatlog'},'queue'],
  ['untrusted departure',{type:'left',name:'Probe Name',origin:'chatlog'},'character'],
  ['failed removal',{type:'removed',name:'Probe Name',ok:false,detail:'Private detail'},'character'],
  ['unverified removal',{type:'removed',name:'Probe Name',reason:'unverified',detail:'Private detail'},'character'],
  ['identity pin',{type:'identity',name:'Probe Name',origin:'addon',guid:'Player-4613-0ABCDEF0'},'character'],
  ['guild note',{type:'note',name:'Probe Name',detail:'Private detail'},'character'],
 ];
 for(const active of[false,true])for(const[label,event,pause]of cases){
  const t=reset();if(active)db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'c'.repeat(32),t,t);
  if(pause==='queue')db.prepare("INSERT INTO invite_queue(name_key,name,discord_id,status,created_at,attempts)VALUES(?,?,?,'queued',?,?)").run('probe name','Probe Name',ID,t,label==='expired invite'?5:0);
  else{db.prepare('INSERT INTO members(discord_id)VALUES(?)').run(ID);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,?,?,'fixture')").run('probe name','Probe Name',ID,label==='untrusted departure'?'member':'verified',t);}
  let fired=0,complete;hooks.afterRead=async sql=>{if(fired)return;
   if(pause==='queue'&&sql.includes('FROM invite_queue')||pause==='character'&&sql.includes('FROM characters c')&&sql.includes('name_key')){fired++;hooks.afterRead=null;const proof=await admission();complete=await eraser.continueServingErasure(env(),proof);}
  };
  const e={...env(),CHANNEL_NOTICES:CHANNEL,CHANNEL_SERVER_LOG:CHANNEL,INVITE_MAX_ATTEMPTS:'6'};let response,error;
  try{response=await ingest.postEvents(e,{events:[event]});}catch(e){error=e;}
  check(label+' '+(active?'active':'absence')+' pause genuinely erases captured original account',fired===1&&complete?.state==='complete');
  check(label+' preserves retired serving closure',!raw('SELECT * FROM characters WHERE discord_id=?',ID)&&!raw('SELECT * FROM invite_queue WHERE discord_id=?',ID)&&!raw('SELECT * FROM site_users WHERE discord_id=?',ID)&&raw('SELECT state FROM privacy_subjects WHERE subject_id=?',ID)?.state==='retired');
  check(label+' does not resurrect raw account audit or post a new payload',rows("SELECT * FROM audit WHERE actor=? OR subject=? OR instr(COALESCE(details,''),?)>0",ID,ID,ID).length===0&&calls.filter(x=>x.startsWith('POST ')).length===0);
  check(label+' does not report normal success after original closure',error?.message==='privacy_site_request_held'||response?.status===409||response?.status===503);
 }
 // Successful/fallback queue events consume the complete original physical row, too.
 for(const event of[{type:'invite',name:'Probe Name',ok:true},{type:'joined',name:'Probe Name',origin:'chatlog'}]){
  const t=reset();db.prepare("INSERT INTO invite_queue(name_key,name,discord_id,status,created_at,attempts,claimed_by)VALUES(?,?,?,'queued',?,0,?)").run('probe name','Probe Name',ID,t,'original claim');
  let fired=0,expected;hooks.afterRead=async sql=>{if(!fired&&sql.includes('FROM invite_queue')){fired++;hooks.afterRead=null;db.prepare('UPDATE invite_queue SET claimed_by=?,attempts=99,created_at=created_at+1').run('new claim');expected=JSON.stringify(rows('SELECT * FROM invite_queue'));}};
  const response=await ingest.postEvents(env(),{events:[event]});
  check(event.type+' native queue fingerprint hook actually replaces physical claim',fired===1);
  check(event.type+' stale event never rewrites replacement queue or invents applied',JSON.stringify(rows('SELECT * FROM invite_queue'))===expected&&(await response.json()).applied===0);
 }
 // A late identifiable staff response must keep its known pointer/debt without redispatch.
 {const t=reset();db.prepare("INSERT INTO invite_queue(name_key,name,discord_id,status,created_at,attempts)VALUES(?,?,?,'queued',?,5)").run('probe name','Probe Name',ID,t);
  let fired=0,complete;afterPost=async()=>{if(fired)return;fired++;afterPost=null;const proof=await admission();complete=await eraser.continueServingErasure(env(),proof);};
  const response=await ingest.postEvents({...env(),CHANNEL_MOD_ALERTS:CHANNEL,INVITE_MAX_ATTEMPTS:'6'},{events:[{type:'invite',name:'Probe Name',ok:false,detail:'unknown refusal'}]});
  const debt=raw('SELECT * FROM privacy_provider_messages WHERE message_id=?',MSG);
  check('late staff invite expiry reply genuinely completed original serving erasure',fired===1&&complete?.state==='complete');
  check('late staff reply known pointer and cleanup debt survive',debt?.state==='known'&&debt.cleanup_requested===1&&debt.subjects.includes(ID));
  check('late staff reply never redispatches or fabricates normal completion',calls.filter(x=>x==='POST /api/v10/channels/'+CHANNEL+'/messages').length===1&&(response.status===409||response.status===503));
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent watcher event-capture checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
