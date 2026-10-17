// Real grant/compensation/status/erasure paths. An absence observation cannot settle a lost provider request.
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'beta_reset_grants_test.cjs'),'utf8'),marker='(async()=>{';
if(fixture.split(marker).length!==2)throw Error('grant fixture boundary changed');
const harness=fixture.slice(0,fixture.indexOf(marker));
const cases=String.raw`
const engine=load('beta-reset'),qr=load('qr-phase1-data');
async function custody(label,expected){
 const status=await engine.betaRoleResetStatus(env);check(label+' aggregate exposes unresolved original custody',status.removals.unresolvedGrantCustody===expected);
 const before=JSON.stringify(rows());let rejected=false;
 try{await env.DB.batch(qr.qrErasureStatements(env,subject));}catch(e){rejected=/malformed JSON|qr_provider_custody_held/.test(String(e));}
 check(label+' actual QR erasure guard rejects unknown custody',rejected&&JSON.stringify(rows())===before);
}
function original(row){return JSON.stringify([row.id,row.subject,row.guild_id,row.role_id,row.purpose,row.desired,row.attempts,row.claim_nonce,row.subject_generation,row.created_at,row.expires_at,row.request_digest]);}
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  for(const centralPath of [false,true]){
   await reset(installed);const id=centralPath?await centralId():null;
   effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};losePut=true;
   await (centralPath?central.settleRoleIntent(env,id,false,undefined,b):grant());
   const parent=rows().find(x=>x.desired===1),child=rows().find(x=>x.purpose==='grant_compensation'),capture=original(parent),tag=label+' '+(centralPath?'central':'legacy')+' lost PUT';
   check(tag+' successful cleanup leaves original unknown',parent.state==='unknown'&&parent.attempts===1&&child.state==='settled'&&effects().map(x=>x.method).join(',')==='PUT,DELETE');
   await custody(tag,1);losePut=false;effectHook=null;const before=effects().length;
   const observed=await central.reconcileRemovalReceipt(env,child.id,b);
   check(tag+' settled child observation cannot downgrade original',db.prepare('SELECT state FROM role_settlements WHERE id=?').get(parent.id).state==='unknown'&&effects().length===before&&original(db.prepare('SELECT * FROM role_settlements WHERE id=?').get(parent.id))===capture);
   if(centralPath){const r=await central.settleRoleIntent(env,parent.id,true,undefined,b);check(tag+' parent route returns unresolved even with settled child',r.state==='unknown');}
   await custody(tag+' after GET',1);
   // The original provider request can still become visible after the cleanup/absence observation.
   members[subject]=[memberRole];await custody(tag+' after delayed original PUT',1);
   check(tag+' never retries cleanup',effects().length===before);
  }
  for(const centralPath of [false,true]){
   await reset(installed);const id=centralPath?await centralId():null;
   effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};loseDelete=true;
   await (centralPath?central.settleRoleIntent(env,id,false,undefined,b):grant());
   const child=rows().find(x=>x.purpose==='grant_compensation'),tag=label+' '+(centralPath?'central':'legacy')+' lost DELETE';
   check(tag+' real lost DELETE creates unknown original removal',child.state==='unknown'&&child.attempts===1&&!members[subject].includes(memberRole));
   const tuple=original(child),before=effects().length;loseDelete=false;effectHook=null;
   const r=await central.reconcileRemovalReceipt(env,child.id,b);
   check(tag+' absence keeps DELETE unknown with exact custody',r.state==='unknown'&&db.prepare('SELECT state FROM role_settlements WHERE id=?').get(child.id).state==='unknown'&&original(db.prepare('SELECT * FROM role_settlements WHERE id=?').get(child.id))===tuple&&effects().length===before);
   await custody(tag,2);
  }
  for(const present of [false,true]){
   await reset(installed);const id=await centralId();losePut=true;
   const r=await central.settleRoleIntent(env,id,false,undefined,b);check(label+' lost PUT before cutoff is initially unknown '+present,r.state==='unknown');
   const tuple=original(db.prepare('SELECT * FROM role_settlements WHERE id=?').get(id));losePut=false;members[subject]=present?[memberRole]:[];const before=effects().length;
   const reread=await central.settleRoleIntent(env,id,true,undefined,b);
   check(label+' current proof GET '+(present?'presence':'absence')+' cannot settle original lost PUT',reread.state==='unknown'&&db.prepare('SELECT state FROM role_settlements WHERE id=?').get(id).state==='unknown'&&original(db.prepare('SELECT * FROM role_settlements WHERE id=?').get(id))===tuple&&effects().length===before);
   await custody(label+' before cutoff observation '+present,1);
   clock=policy.BETA_RESET_CUTOFF;members[subject]=[];const closed=await central.settleRoleIntent(env,id,true,undefined,b);
   check(label+' cutoff GET absence still cannot settle original PUT '+present,closed.state==='unknown'&&db.prepare('SELECT state FROM role_settlements WHERE id=?').get(id).state==='unknown'&&effects().length===before);
   await custody(label+' after cutoff observation '+present,1);
  }
 }
 console.log('BETA_UNCERTAIN_CUSTODY_SUMMARY '+JSON.stringify({checks:n,providerQualification:false}));console.log(n+'/'+n+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',harness+cases)(__dirname,require);
