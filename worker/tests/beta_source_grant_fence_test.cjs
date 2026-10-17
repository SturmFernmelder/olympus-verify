// Additive source-epoch profile: actual central producer and dispatch fences over SQLite, Discord simulated.
// Legacy profile assertions stay in beta_item15_central_fence_test.cjs, unchanged. No seal, activation or provider access.
const H=require('./helpers/beta_item15_harness.cjs');
const {NEW:M,execute,check,scenarios:sc,settlements,row,puts,deletes,onFirstSql,G,SUBJECT,STAFF,STAFF_G,GUID,TWELVE,FRESH,LABELS,OTHER_GUILD,HELD}=H;
const KEY='BETA_RESET_SOURCE_EPOCH',EPOCH='olympus-full-release-20261104';
const memberEnv={MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true'};
const noWrites=s=>s.trace.every(t=>!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(t.sql));
const memberProducer=(extra={},arm)=>({env:{...memberEnv,...extra},arm,act:(s,N)=>N.rs.queueRosterMembershipRole(s.env,SUBJECT,1,G)});
const desiredRoles=LABELS.map((r,i)=>i===7?TWELVE[2]:r);
const rankProducer=(extra={},arm)=>({env:{QR_RANK_MAPPING_ENABLED:'true',QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'ten-rank',roles:desiredRoles}),...extra},arm,
 act:(s,N)=>N.rs.queueRosterRankRoles(s.env,SUBJECT,1,G)});
const proofId='3'.repeat(32),keyId='4'.repeat(32),challenge='5'.repeat(32),birth='6'.repeat(32);
async function proofSetup(s,N){const at=H.clockState.now,signerGuid='Player-1234-00000001';
 for(const sql of N.load('qr-beta-fern-schema').QR_BETA_FERN_DDL)s.db.exec(sql);
 await s.write('INSERT INTO members(discord_id) VALUES(?)',STAFF);
 await s.write("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)",STAFF,STAFF_G,at,at);
 await s.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('synthetic councillor','Synthetic Councillor',?,'member',?,?)",STAFF,at,signerGuid);
 await s.write('INSERT INTO site_users(discord_id,username,in_server,session_version,first_login,last_login,checked_at,account_incarnation) VALUES(?,?,1,1,?,?,?,?)',STAFF,'synthetic',at,at,at,birth);
 await s.write('INSERT INTO councillor_keys(id,signer,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at,signer_account_incarnation) VALUES(?,?,?,?,?,1,?,?,?)',keyId,STAFF,signerGuid,'fixture',STAFF_G,at,at+300,birth);
 await s.write("INSERT INTO councillor_challenges(nonce,key_id,signer,session_version,session_expires,created_at,expires_at,used_at,mode,max_proofs,proofs_used,signer_account_incarnation) VALUES(?,?,?,1,?,?,?,?,'single',1,1,?)",challenge,keyId,STAFF,at+300,at,at+300,at,birth);
 await s.write("INSERT INTO verification_requests(code,requester,subject_generation,created_at,expires_at,used_at,state) VALUES('fixture-code',?,?,?,?,?,'proved')",SUBJECT,G,at,at+300,at);
 await s.write("INSERT INTO verification_proofs(id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at) VALUES(?,'fixture-code',?,?,?,?,?,'Actual Member',7,'Member','ten-rank',?,1,?,?,?,?)",proofId,challenge,STAFF,keyId,SUBJECT,GUID,signerGuid,G,'7'.repeat(64),at,at+300);
}
const proofProducer=(extra={},arm)=>({env:{...memberEnv,QR_PHASE1_ENABLED:'true',...extra},prepare:proofSetup,arm,act:(s,N)=>N.rs.queueProofRoles(s.env,proofId)});
(async()=>{
 for(const [name,make] of [['membership',memberProducer],['rank',rankProducer],['proof',proofProducer]]){
  let s=await execute(M,'absent',make());
  check(name+' producer legacy positive control creates its original wanted fixed role',!s.outcome?.thrown&&settlements(s).some(r=>r.desired===1&&TWELVE.includes(r.role_id)));
  for(const value of [EPOCH,'',undefined,null]){s=await execute(M,'absent',make({[KEY]:value}));
   check(name+' producer source profile '+String(value)+' holds before INSERT/disposal, no provider write',s.outcome.thrown===HELD&&settlements(s).length===0&&noWrites(s)&&puts(s).length===0&&deletes(s).length===0);}
  const prefix=name==='membership'?'SELECT DISTINCT rank':name==='rank'?'SELECT subject_id AS subject,generation AS subjectGeneration':'SELECT requester,requester_guid';
  s=await execute(M,'absent',make({},t=>onFirstSql(t,prefix,()=>{t.drift=true;t.env[KEY]=EPOCH;})));
  check(name+' producer refuses a source profile added during its first Native read',s.drift===true&&s.outcome.thrown===HELD&&settlements(s).length===0&&noWrites(s));
 }
 // An original active-profile capture cannot be laundered through an effect env from which the flag was removed.
 let s=await execute(M,'absent',{env:{...memberEnv,[KEY]:EPOCH},act:(t,N)=>{
  const pair=N.policy.captureBetaRoleDispatch(t.env),effect={...t.env};delete effect[KEY];return N.rs.queueRosterMembershipRole(effect,SUBJECT,1,G,pair);}});
 check('an original active source profile survives an effect-env spread without the key',s.outcome.thrown===HELD&&settlements(s).length===0&&noWrites(s));
 for(const extra of [{ROLE_GUILD_MEMBER:FRESH},{GUILD_ID:OTHER_GUILD}]){s=await execute(M,'v1',memberProducer({...extra,[KEY]:EPOCH}));
  check('source profile leaves '+(extra.GUILD_ID?'another guild':'a fresh role')+' producer unaffected',!s.outcome?.thrown&&settlements(s).some(r=>r.desired===1));}
 const queued=()=>({env:memberEnv,prepare:async(t,N)=>{t.intent=await N.rs.queueRosterMembershipRole(t.env,SUBJECT,1,G);},
  act:(t,N)=>N.rs.settleRoleIntent(t.env,t.intent)});
 s=await execute(M,'absent',queued());
 check('central consumer legacy positive control claims, PUTs and acknowledges its fixed member grant',s.outcome.state==='settled'&&puts(s).length===1&&row(s,s.intent).reason==='effect_and_current_server_confirmed');
 s=await execute(M,'absent',{...queued(),arm:t=>{t.env[KEY]=EPOCH;}});
 check('existing pending fixed grant under the new profile holds before claim and PUT',s.outcome.reason===HELD&&puts(s).length===0&&row(s,s.intent).state==='pending'&&row(s,s.intent).attempts===0);
 for(const boundary of ['claim','admit']){s=await execute(M,'absent',{...queued(),arm:t=>onFirstSql(t,boundary==='claim'?"UPDATE role_settlements SET state='dispatching'":"UPDATE role_settlements SET reason='admitted_before_effect'",()=>{t.env[KEY]=EPOCH;})});
  check('source profile appearing at consuming '+boundary+' prevents the PUT without weakening the original row',puts(s).length===0&&deletes(s).length===0&&['pending','dispatching'].includes(row(s,s.intent).state)&&s.outcome.state==='held');}
 s=await execute(M,'absent',{...queued(),arm:t=>{t.env[KEY]=EPOCH;t.members[SUBJECT]=[TWELVE[0]];}});
 check('the new profile does not change the original ACK-free never-dispatched presence receipt',s.outcome.state==='settled'&&s.outcome.reason==='fresh_server_confirmed'&&row(s,s.intent).attempts===0&&puts(s).length===0);
 s=await execute(M,'absent',{...queued(),prepare:async(t,N)=>{t.intent=await N.rs.queueRosterMembershipRole(t.env,SUBJECT,1,G);await t.write("UPDATE role_settlements SET state='unknown',attempts=1,claim_nonce=?,reason='provider_outcome_unknown' WHERE id=?",'8'.repeat(32),t.intent);t.env[KEY]=EPOCH;},
  act:(t,N)=>N.rs.settleRoleIntent(t.env,t.intent,true)});
 check('the additive profile preserves original fixed-target unknown custody and GET-only reconciliation',s.outcome.state==='unknown'&&row(s,s.intent).state==='unknown'&&row(s,s.intent).reason==='beta_put_observed_absent_unconfirmed'&&row(s,s.intent).claim_nonce==='8'.repeat(32)&&puts(s).length===0&&deletes(s).length===0);
 H.finish('beta_source_grant_fence_test');H.restore();
})().catch(e=>{console.error(e);H.restore();process.exit(1);});
