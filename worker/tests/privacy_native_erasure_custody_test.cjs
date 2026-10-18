// .164: the real QR erasure statements retain unknown provider custody and its FK ancestry.
// Canonical full SQLite schema; no private Floor, provider request or test-only source export.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),root=path.join(__dirname,'..'),cache=new Map();
let providerCalls=0,passed=0,failed=0;
globalThis.fetch=async()=>{providerCalls++;throw Error('unexpected provider request');};
function load(name){
  if(cache.has(name))return cache.get(name).exports;
  const m={exports:{}};cache.set(name,m);
  const js=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('module','exports','require',js)(m,m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p));return m.exports;
}
const qr=load('qr-phase1-data');
const ID='472099715253796864',OTHER='102204162531430400',THIRD='300000000000000005';
const GUILD='236932545793490944',APP='1550176895671341076',ROLE='1552077551839617104';
const OP='a'.repeat(32),GEN='b'.repeat(32),BIRTH='c'.repeat(32),DIGEST='d'.repeat(64),T=1800000000;
const check=(name,ok)=>{if(ok)passed++;else failed++;console.log((ok?'PASS ':'FAIL ')+name);};
const json=value=>JSON.stringify(value);
const TABLES=['qr_beta_fern_windows','councillor_keys','councillor_challenges','verification_requests','verification_proofs','role_settlements'];
function fixture(state='unknown',inventory=true,native=true){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));db.exec('PRAGMA foreign_keys=ON');
  db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');return String(T);});
  const prepare=(sql,values=[])=>({sql,values,bind(...v){return prepare(sql,v);},execute(){
    const s=db.prepare(sql);if(/^\s*SELECT\b/.test(sql))return{success:true,results:s.all(...values),meta:{changes:0}};
    const r=s.run(...values);return{success:true,results:[],meta:{changes:Number(r.changes)}};
  }});
  const DB={prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const env={DB,PRIVACY_NATIVE_ERASURE_ENABLED:native?'true':'false',PRIVACY_ERASURE_ENABLED:'true'};
  db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,account_incarnation)VALUES(?,?,?,?,?)').run(ID,'erasing-owner',T,T,BIRTH);
  db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,account_incarnation)VALUES(?,?,?,?,?)').run(OTHER,'unrelated-owner',T-100,T,'e'.repeat(32));
  db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'retiring',1,?,?)").run(ID,GEN,T,T);
  db.prepare("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)VALUES(?,?,?,?,1,?,?,'erasing',?,?)").run(OP,ID,GEN,DIGEST,T+600,BIRTH,T,T+31622400);
  function window(id,code){
    const row={id,actor:ID,account_incarnation:BIRTH,subject_generation:GEN,session_version:1,session_expires:T+600,guild_id:GUILD,application_id:APP,
      signer_guid:'Player-4613-005A70D8',signer_name:'Fern Melder',guild_name:'OLYMPUS',realm_name:'Classic Beta PvP 2',guild_realm:'ClassicBetaPvP',game_build:70338,game_interface:16001,
      native_rank:'Officer',native_rank_index:1,native_rank_count:5,roster_id:1,links_not_before:0,created_at:T-30,expires_at:T+240,review_digest:'f'.repeat(64),revoked_at:null,
      requester_id:OTHER,requester_name:'Stavros Heuto',requester_guid:'Player-4613-00000002',requester_generation:'e'.repeat(32),requester_account_incarnation:'e'.repeat(32),
      request_code:code,request_created_at:T-30,request_expires_at:T+300,membership_role:ROLE};
    const columns=Object.keys(row);db.prepare('INSERT INTO qr_beta_fern_windows('+columns.join(',')+')VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));
  }
  function chain(tag,signer,requester,beta=null){
    const ids={key:'key-'+tag,challenge:'challenge-'+tag,code:(tag==='unknown'?'1':tag==='known'?'2':'3').repeat(32),proof:'proof-'+tag,window:beta};
    if(beta)window(beta,ids.code);
    db.prepare('INSERT INTO councillor_keys(id,signer,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at,revoked_at,signer_account_incarnation,beta_window_id)VALUES(?,?,?,?,?,1,?,?,NULL,?,?)')
      .run(ids.key,signer,signer===ID?'Player-4613-005A70D8':'Player-4613-00000002','synthetic-public-key-'+tag,signer===ID?GEN:'e'.repeat(32),T-30,T+86400,signer===ID?BIRTH:'e'.repeat(32),beta);
    db.prepare("INSERT INTO councillor_challenges(nonce,key_id,signer,session_version,session_expires,created_at,expires_at,used_at,mode,max_proofs,proofs_used,signer_account_incarnation,beta_window_id)VALUES(?,?,?,1,?,?,?,NULL,'automatic',10,1,?,?)")
      .run(ids.challenge,ids.key,signer,T+600,T-30,T+240,signer===ID?BIRTH:'e'.repeat(32),beta);
    db.prepare("INSERT INTO verification_requests(code,requester,subject_generation,created_at,expires_at,used_at,state,session_version,session_expires,requester_account_incarnation,beta_window_id)VALUES(?,?,?,?,?,?,'proved',1,?,?,?)")
      .run(ids.code,requester,requester===ID?GEN:'e'.repeat(32),T-30,T+300,T-20,T+600,requester===ID?BIRTH:'e'.repeat(32),beta);
    db.prepare("INSERT INTO verification_proofs(id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at,beta_window_id)VALUES(?,?,?,?,?,?,'Player-4613-00000002','Synthetic Other',1,'Officer','beta-five','Player-4613-005A70D8',1,?,?,?,?,?)")
      .run(ids.proof,ids.code,ids.challenge,signer,ids.key,requester,requester===ID?GEN:'e'.repeat(32),(tag==='unknown'?'4':tag==='known'?'5':'6').repeat(64),T-20,T+240,beta);
    return ids;
  }
  const unknown=chain('unknown',ID,OTHER,'7'.repeat(32)),known=chain('known',ID,OTHER,'8'.repeat(32)),unrelated=chain('unrelated',OTHER,THIRD);
  function settlement(id,subject,proof,settledState,reason,attempts=1,purpose='verified_member'){
    db.prepare('INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,attempts,created_at,expires_at,checked_at)VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)')
      .run(id,subject,purpose,proof,GUILD,ROLE,settledState,reason,'9'.repeat(32),subject===ID?GEN:'e'.repeat(32),DIGEST,attempts,T-10,T+300,T-5);
  }
  settlement('unknown-effect',OTHER,unknown.proof,state,state==='dispatching'?'admitted_before_effect':'provider_outcome_unknown');
  settlement('known-effect',OTHER,known.proof,'settled','effect_and_current_server_confirmed');
  settlement('unrelated-effect',THIRD,unrelated.proof,'settled','effect_and_current_server_confirmed');
  db.prepare("INSERT INTO verification_requests(code,requester,subject_generation,created_at,expires_at,state,session_version,session_expires,requester_account_incarnation)VALUES(?,?,?,?,?,'pending',1,?,?)")
    .run('own-pending-request',ID,GEN,T-5,T+300,T+600,BIRTH);
  function freshInventory(at=T,generation=GEN){
    db.prepare('INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,attempts,created_at,expires_at,checked_at)VALUES(?,?,?,?,?,0,\'settled\',\'observed_absent\',?,?,0,?,?,?)')
      .run(OP+':native_role_inventory',ID,'native_account_erasure_inventory',GUILD,ROLE,generation,DIGEST,T-5,T+300,at);
  }
  if(inventory)freshInventory();
  const row=(table,key,value)=>db.prepare('SELECT * FROM '+table+' WHERE '+key+'=?').get(value)??null;
  const snapshot=()=>json(Object.fromEntries(TABLES.map(table=>[table,db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()])));
  const unrelatedState=()=>json({user:row('site_users','discord_id',OTHER),key:row('councillor_keys','id',unrelated.key),challenge:row('councillor_challenges','nonce',unrelated.challenge),request:row('verification_requests','code',unrelated.code),proof:row('verification_proofs','id',unrelated.proof),role:row('role_settlements','id','unrelated-effect')});
  return{db,env,unknown,known,unrelated,row,snapshot,unrelatedState,freshInventory,clean:()=>DB.batch(qr.qrErasureStatements(env,ID)),close:()=>db.close()};
}
async function refusal(f){try{await f.clean();return false;}catch{return true;}}
(async()=>{
  let f=fixture();
  check('full canonical schema enforces real foreign keys',f.db.prepare('PRAGMA foreign_keys').get().foreign_keys===1);
  const oldUnknown=json(f.row('role_settlements','id','unknown-effect')),oldProof=json(f.row('verification_proofs','id',f.unknown.proof)),other=f.unrelatedState();
  await f.clean();
  check('other-subject unknown effect bytes are preserved exactly',json(f.row('role_settlements','id','unknown-effect'))===oldUnknown);
  check('unknown proof bytes remain attributed exactly',json(f.row('verification_proofs','id',f.unknown.proof))===oldProof);
  check('retained proof still identifies erasing signer and original other requester',f.row('verification_proofs','id',f.unknown.proof)?.signer===ID&&f.row('verification_proofs','id',f.unknown.proof)?.requester===OTHER);
  check('unknown proof retains its original request parent',f.row('verification_requests','code',f.unknown.code)?.requester===OTHER);
  check('unknown proof retains its challenge-key-window ancestry',f.row('councillor_challenges','nonce',f.unknown.challenge)?.key_id===f.unknown.key&&f.row('councillor_keys','id',f.unknown.key)?.beta_window_id===f.unknown.window&&!!f.row('qr_beta_fern_windows','id',f.unknown.window));
  check('retained own signer key is revoked at the cleanup clock',f.row('councillor_keys','id',f.unknown.key)?.revoked_at===T);
  check('a retained revoked key cannot satisfy current key authority',f.db.prepare('SELECT COUNT(*) n FROM councillor_keys WHERE id=? AND revoked_at IS NULL AND expires_at>?').get(f.unknown.key,T).n===0);
  check('retained own beta window authority is revoked',f.row('qr_beta_fern_windows','id',f.unknown.window)?.revoked_at===T);
  const own=f.row('verification_requests','code','own-pending-request');
  check('own pending request is removed or expired rather than usable',own===null||own.state==='expired'&&own.expires_at<=T);
  check('known settled related effect is deleted',f.row('role_settlements','id','known-effect')===null);
  check('known unreferenced proof ancestry is deleted',f.row('verification_proofs','id',f.known.proof)===null&&f.row('verification_requests','code',f.known.code)===null&&f.row('councillor_challenges','nonce',f.known.challenge)===null&&f.row('councillor_keys','id',f.known.key)===null&&f.row('qr_beta_fern_windows','id',f.known.window)===null);
  check('unrelated owner account and authority remain byte-identical',f.unrelatedState()===other);
  check('native cleanup leaves no dangling foreign-key reference',f.db.prepare('PRAGMA foreign_key_check').all().length===0);
  f.close();

  f=fixture('unknown',false);
  f.db.prepare('DELETE FROM privacy_serving_jobs WHERE operation_id=?').run(OP);
  f.db.prepare("UPDATE role_settlements SET state='settled',reason='effect_and_current_server_confirmed' WHERE id='unknown-effect'").run();
  const ordinaryOther=f.unrelatedState();await f.clean();
  check('ordinary QR cleanup with known settled effects needs no account-erasure job or inventory',f.db.prepare('SELECT COUNT(*) n FROM privacy_serving_jobs').get().n===0&&f.row('role_settlements','id','unknown-effect')===null&&f.row('role_settlements','id','known-effect')===null);
  check('ordinary QR cleanup deletes unreferenced own proof parents without an erasure job',f.row('verification_proofs','id',f.unknown.proof)===null&&f.row('verification_requests','code',f.unknown.code)===null&&f.row('councillor_challenges','nonce',f.unknown.challenge)===null&&f.row('councillor_keys','id',f.unknown.key)===null&&f.row('qr_beta_fern_windows','id',f.unknown.window)===null);
  check('ordinary no-job cleanup preserves unrelated ownership and real FK integrity',f.unrelatedState()===ordinaryOther&&f.db.prepare('PRAGMA foreign_key_check').all().length===0);f.close();

  f=fixture('dispatching');const dispatched=json(f.row('role_settlements','id','unknown-effect'));await f.clean();
  check('dispatching original effect is not adopted or relabelled',json(f.row('role_settlements','id','unknown-effect'))===dispatched);
  check('dispatching proof remains attributed and FK graph remains clean',f.row('verification_proofs','id',f.unknown.proof)?.signer===ID&&f.db.prepare('PRAGMA foreign_key_check').all().length===0);f.close();

  f=fixture('unknown',false);let before=f.snapshot();
  check('missing current native inventory refuses the transaction',await refusal(f));
  check('missing inventory rolls back all QR and custody rows',f.snapshot()===before);
  check('missing inventory preserves usable key until accepted cleanup',f.row('councillor_keys','id',f.unknown.key)?.revoked_at===null);f.close();

  f=fixture('unknown',false);f.freshInventory(T-61);before=f.snapshot();
  check('expired absence observation cannot authorize cleanup',await refusal(f)&&f.snapshot()===before);f.close();

  f=fixture('unknown',false);f.freshInventory(T,'0'.repeat(32));before=f.snapshot();
  check('a different generation cannot borrow current inventory',await refusal(f)&&f.snapshot()===before);f.close();

  f=fixture('unknown',true,false);before=f.snapshot();
  check('legacy native-false path keeps its original unknown-custody hold',await refusal(f));
  check('legacy refusal preserves every role and proof parent',f.snapshot()===before&&f.db.prepare('PRAGMA foreign_key_check').all().length===0);f.close();
  check('source-only custody cleanup performs no provider HTTP',providerCalls===0);
  console.log('Native erasure custody: '+passed+'/'+(passed+failed)+' passed');if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
