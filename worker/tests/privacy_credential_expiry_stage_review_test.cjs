// First-stage account downloads: native fixed-deadline credential cleanup without account erasure/retention.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixturePath=path.join(__dirname,'privacy_access_test.cjs'),fixtureSource=fs.readFileSync(fixturePath,'utf8'),cut=fixtureSource.indexOf('async function main(){');
if(cut<0)throw Error('genuine fixture boundary changed');
const scenario=String.raw`const retention=load('privacy-retention');
function seedExpiry(f){const clock=f.time();
 for(let i=0;i<120;i++){const live=i>=110,at=clock+(live?0:-721),oauthAt=clock+(live?0:-301),key=(i+1).toString(16).padStart(64,'0');
 f.db.prepare("INSERT INTO privacy_access_oauth(state_hash,browser_hash,purpose,created_at,expires_at) VALUES(?,?,'privacy_identify',?,?)").run(key,'a'.repeat(64),oauthAt,oauthAt+300);
 f.db.prepare("INSERT INTO privacy_access_grants(session_hash,purpose,grant_id,csrf_hash,subject_id,created_at,expires_at) VALUES(?,'own_export',?,?,?,?,?)").run(key,(i+1).toString(16).padStart(32,'0'),'b'.repeat(64),A,at,at+720);}
 f.db.prepare('INSERT INTO audit(ts,actor,action) VALUES(?,?,?)').run(clock-31536001,A,'retained.account.action');}
async function mainExpiry(){
 for(const [accessFlag,retentionFlag,want] of [[undefined,undefined,0],['false','false',0],['true','false',2],['true',undefined,2],['true','true',20],['false','true',20]]){
 const f=fixture();seedExpiry(f);let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
 const env={...f.env,PRIVACY_ACCESS_ENABLED:accessFlag,PRIVACY_RETENTION_ENABLED:retentionFlag};const n=await retention.sweepServingRetention(env);
 eq('exact branch statement attempts '+accessFlag+'/'+retentionFlag,attempts,want);eq('one native batch or none',batches,want?[want]:[]);
 eq('each credential table removes only first100 expired rows',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants')],want?[20,20]:[120,120]);
 eq('noncredential account action held unless account retention ON',count(f,'audit'),retentionFlag==='true'?0:1);
 eq('removed count is genuine native changes',n,want?200+(retentionFlag==='true'?1:0):0);
 if(want){f.hooks.statement=null;f.hooks.beforeBatch=null;await retention.sweepServingRetention(env);eq('second bounded page preserves live10',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants')],[10,10]);}
 eq('no provider requests in credential cleanup',calls.length,0);f.db.close();}
 const f=fixture();seedExpiry(f);const original=[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants'),count(f,'audit')];f.hooks.step=i=>{if(i===1)throw Error('native second-statement fault');};let failed=false;try{await retention.sweepServingRetention({...f.env,PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'false'});}catch{failed=true;}
 ok('mid-batch expiry error propagated',failed);eq('native atomic rollback retains both expired sets and account action',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants'),count(f,'audit')],original);f.hooks.step=null;
 const native=f.env.DB.batch;f.env.DB.batch=async list=>(await native(list)).slice(0,1);let unknown=false;try{await retention.sweepServingRetention({...f.env,PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'false'});}catch(e){unknown=e.message==='privacy_retention_outcome_unknown';}
 ok('short response refuses claimed cleanup result',unknown);eq('unknown response does not invent account deletion',count(f,'audit'),1);eq('cleanup contains no grant renewal',[...f.db.prepare('SELECT expires_at-created_at AS seconds FROM privacy_access_grants').all()].every(r=>r.seconds===720),true);f.db.close();
 console.log('privacy_credential_expiry_stage_review_test: '+checks+'/'+checks+' passed');}
mainExpiry().catch(e=>{console.error(e);process.exitCode=1;});`;
const m=new Module(__filename,module);m.filename=__filename;m.paths=module.paths;m._compile(fixtureSource.slice(0,cut)+scenario,__filename);
