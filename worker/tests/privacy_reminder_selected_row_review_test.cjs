// Test-only runtime composition: actual immutable Worker/SQLite; no provider effects.
const fs=require('fs'),Module=require('module');
const original=require('path').join(__dirname,'community_event_reminders_test.cjs');
let source=fs.readFileSync(original,'utf8');
const marker='(async () => {';
if(source.split(marker).length!==2)throw Error('fixture setup boundary drift');
source=source.slice(0,source.indexOf(marker));
source+=`(async()=>{
 const mutations=[
 ['actor',()=>db.prepare('UPDATE community_event_reminders SET actor=?').run(OTHER)],
 ['consent version',()=>{db.prepare('UPDATE site_users SET session_version=2 WHERE discord_id=?').run(ORG);db.prepare('UPDATE community_event_reminders SET consent_version=2').run();}],
 ['event revision',()=>{db.prepare('UPDATE community_events SET revision=2').run();db.prepare('UPDATE community_event_reminders SET event_revision=2').run();}],
 ['start',()=>{db.prepare('UPDATE community_events SET starts_at=starts_at+10,ends_at=ends_at+10').run();db.prepare('UPDATE community_event_reminders SET starts_at=starts_at+10').run();}],
 ['guild',()=>db.prepare('UPDATE community_event_reminders SET guild_id=?').run(WRONG)],
 ['channel',()=>db.prepare('UPDATE community_event_reminders SET channel_id=?').run(WRONG)],
 ['host',()=>db.prepare("UPDATE community_event_reminders SET host='other.example'").run()],
 ['operation',()=>db.prepare('UPDATE community_event_reminders SET op_id=?').run(NEXT)],
 ['nonce',()=>db.prepare('UPDATE community_event_reminders SET claim_nonce=?').run(NEXT)],
 ['pointer',()=>db.prepare('UPDATE community_event_reminders SET message_id=?').run(ONE)],
 ['content',()=>db.prepare("UPDATE community_event_reminders SET frozen_content='Replacement public content'").run()],
 ['cleanup',()=>db.prepare('UPDATE community_event_reminders SET cleanup_requested=1').run()],
 ['deadline',()=>db.prepare('UPDATE community_event_reminders SET retain_until=retain_until+5').run()],
 ['created time',()=>db.prepare('UPDATE community_event_reminders SET created_at=created_at+1').run()],
 ['update time',()=>db.prepare('UPDATE community_event_reminders SET updated_at=updated_at+1').run()],
 ['rotation time',()=>db.prepare('UPDATE community_event_reminders SET last_attempt_at=last_attempt_at+1').run()],
 ['state',()=>db.prepare("UPDATE community_event_reminders SET state='cancelled'").run()],
 ['absence to active',()=>db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)").run(ORG,'e'.repeat(32),at(),at())],
 ['generation replacement',()=>db.prepare("UPDATE privacy_subjects SET generation=?,revision=revision+1 WHERE subject_id=?").run('f'.repeat(32),ORG)],
 ['retiring',()=>db.prepare("UPDATE privacy_subjects SET state='retiring',revision=revision+1 WHERE subject_id=?").run(ORG)],
 ];
 for(const phase of ['prerequisite','final proof'])for(const[name,mutate]of mutations){
  await fresh();await arm();
  if(name==='generation replacement'||name==='retiring')db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)").run(ORG,'e'.repeat(32),at(),at());
  let fired=0;
  if(phase==='prerequisite')hooks.http=(req)=>{if(req.url==='/api/v10/channels/'+CHANNEL){hooks.http=null;fired++;mutate();}};
  else hooks.beforeStatement=(sql)=>{if(sql.includes('SELECT 1 AS ok FROM community_event_reminders r')){hooks.beforeStatement=null;fired++;mutate();}};
  let failed;try{await tick();}catch(e){failed=e;}
  check(phase+' consumes original '+name+' with zero provider effect',fired===1&&!failed&&effects().length===0,failed?.stack);
  check(phase+' original '+name+' fits 19-binding cap',maxParameters<=19);
 }
 await fresh();await arm();SQL=[];await tick();check('unchanged consent delivers once in seven SQL statements',row().state==='posted'&&effects().length===1&&SQL.length===7);
 await tick();check('settled reminder never redispatches',effects().length===1);
 console.log(passed+'/'+total+' selected-row race checks passed');db.close();if(passed!==total)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});`;
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(require('path').dirname(original));mod._compile(source,original);
