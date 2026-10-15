// UNAPPLIED. Real source Native PROFILE/issuer/readSession/Ed25519/proof/intents; provider HTTP is synthetic.
// No shaped positive cookies or role intents and no private factory/provider origin claim.
const assert=require('node:assert/strict'),Q=require('./privacy_cookie_qr_native_test.cjs');
const {H,qr,GUILD,BOT,ROLE,BOTROLE}=Q,roles=H.load('role-settlements');
const OTHER='72345678901234567',OTHER_GUILD='62345678901234567',OTHER_ROLE='92345678901234568';
const PRE_CASES=['role','subject','desired','proof','purpose','accessor','prototype','row-replacement','results-replacement','compensation-absence','guild-descriptor'];
const POST_CASES=['role','subject','accessor','results-replacement','guild-descriptor'];
function inventory(){return[{id:GUILD,position:0,permissions:'0',managed:false},{id:ROLE,position:1,permissions:'0',managed:false},{id:BOTROLE,position:10,permissions:'268435456',managed:false}];}
function selectedMutation(kind,selected,f,counters){
 const row=selected.row;
 if(kind==='role')row.role_id=OTHER_ROLE;
 else if(kind==='subject')row.subject=OTHER;
 else if(kind==='desired')row.desired=0;
 else if(kind==='proof')row.proof_id='9'.repeat(32);
 else if(kind==='purpose')row.purpose='verified_privileged_rank';
 else if(kind==='accessor')Object.defineProperty(row,'role_id',{configurable:true,enumerable:true,get(){counters.getters++;return OTHER_ROLE;}});
 else if(kind==='prototype')Object.setPrototypeOf(row,{unrelatedNativePrototype:true});
 else if(kind==='row-replacement')selected.packet.results[0]={...row,role_id:OTHER_ROLE};
 else if(kind==='results-replacement')selected.packet.results=[{...row,role_id:OTHER_ROLE}];
 else if(kind==='compensation-absence')selected.compensation.results.push({id:'8'.repeat(32),reason:'membership_retirement_forged_late'});
 else if(kind==='guild-descriptor')Object.defineProperty(f.env,'GUILD_ID',{value:OTHER_GUILD,writable:true,enumerable:true,configurable:true});
 else throw Error('unexpected selected original mutation');
 counters.reached=true;
}
async function runCase(layout,phase,kind){
 let armed=false,selected=null;const counters={reached:false,getters:0},present=new Set();
 const f=await Q.setup(layout,{
  async nativeAfter(stmts,out){
   if(!armed||selected)return;const index=stmts.findIndex(s=>s.sql==='SELECT r.*,(SELECT beta_window_id FROM verification_proofs p WHERE p.id=r.proof_id) AS beta_window_id FROM role_settlements r WHERE r.id=?1');
   if(index<0)return;const compensationIndex=stmts.findIndex(s=>s.sql==="SELECT id,reason FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 AND desired=0 AND attempts=1");
   assert.ok(compensationIndex>=0);assert.equal(out[index].results.length,1);selected={row:out[index].results[0],packet:out[index],compensation:out[compensationIndex]};
  },
  async http(u,init,f){
   const method=init.method??'GET',p=u.pathname;
   if(armed&&selected&&!counters.reached&&phase==='before'&&method==='GET')selectedMutation(kind,selected,f,counters);
   if(p==='/api/v10/users/@me')return Response.json({id:BOT,bot:true});
   if(p.endsWith('/roles')&&method==='GET')return Response.json(inventory());
   const effect=p.match(/^\/api\/v10\/guilds\/([0-9]+)\/members\/([0-9]+)\/roles\/([0-9]+)$/);
   if(effect){assert.equal(effect[1],GUILD,'original effect guild');assert.equal(effect[2],H.FOREIGN,'original effect subject');assert.equal(effect[3],ROLE,'original effect role');if(method==='PUT')present.add(effect[2]);else if(method==='DELETE')present.delete(effect[2]);else throw Error('unexpected effect method');if(armed&&selected&&!counters.reached&&phase==='after')selectedMutation(kind,selected,f,counters);return new Response(null,{status:204});}
   const member=p.match(/^\/api\/v10\/guilds\/([0-9]+)\/members\/([0-9]+)$/);
   if(member)return Response.json({user:{id:member[2]},roles:member[2]===BOT?[BOTROLE]:present.has(member[2])?[ROLE]:[]});
   throw Error('unexpected source role fixture HTTP');
  }
 });
 try{
  const ready=await Q.ready(f),proof=await qr.ingestAttestation(f.env,H.SUBJECT,f.signer.session,ready.input),ids=await roles.queueProofRoles(f.env,proof.proofId);
  H.eq(layout+' '+phase+'/'+kind+' genuine proof produced one current membership intent',ids.length,1);
  const id=ids[0],saved=f.d.db.prepare('SELECT id,subject,guild_id,role_id,purpose,attempts FROM role_settlements WHERE id=?').get(id);
  H.eq(layout+' '+phase+'/'+kind+' source-created intent owns the expected original subject/role',[saved.subject,saved.guild_id,saved.role_id,saved.purpose,saved.attempts],[H.FOREIGN,GUILD,ROLE,'verified_membership',0]);
  const beforeTrace=f.d.trace.length,beforeGroups=f.d.groups.length,beforeHTTP=f.http.length;armed=true;
  const result=await roles.settleRoleIntent(f.env,id);armed=false;
  const http=f.http.slice(beforeHTTP),effects=http.filter(([method])=>method==='PUT'||method==='DELETE'),row=f.d.db.prepare('SELECT subject,guild_id,role_id,purpose,attempts,state,claim_nonce FROM role_settlements WHERE id=?').get(id);
  H.ok(layout+' '+phase+'/'+kind+' reaches actual original Native row and HTTP mutation',!!selected&&counters.reached);
  H.eq(layout+' '+phase+'/'+kind+' replacement accessor never invoked',counters.getters,0);
  H.eq(layout+' '+phase+'/'+kind+' current source result is withheld',result.state,phase==='after'?'unknown':'held');
  H.eq(layout+' '+phase+'/'+kind+' provider effect remains one original destination or zero',effects,phase==='after'?[['PUT','/api/v10/guilds/'+GUILD+'/members/'+H.FOREIGN+'/roles/'+ROLE]]:[]);
  H.eq(layout+' '+phase+'/'+kind+' durable original subject/role/purpose never retargeted',[row.subject,row.guild_id,row.role_id,row.purpose],[H.FOREIGN,GUILD,ROLE,'verified_membership']);
  if(phase==='after'){H.eq(layout+' '+phase+'/'+kind+' spent original attempt remains unknown',[row.attempts,row.state],[1,'unknown']);H.ok(layout+' '+phase+'/'+kind+' original spent nonce remains present',typeof row.claim_nonce==='string'&&row.claim_nonce.length===32);}
  else H.eq(layout+' '+phase+'/'+kind+' no attempt is spent before initial original lookup hold',row.attempts,0);
  return{phase,kind,originalNativeACKReached:!!selected,mutationReached:counters.reached,getters:counters.getters,state:result.state,nativeStatements:f.d.trace.length-beforeTrace,nativeGroups:f.d.groups.slice(beforeGroups).map(g=>g.length),effects:effects.length,originalTarget:true};
 }finally{armed=false;f.restore();}
}
async function success(layout){
 const present=new Set(),f=await Q.setup(layout,{async http(u,init){const p=u.pathname,method=init.method??'GET';if(p==='/api/v10/users/@me')return Response.json({id:BOT,bot:true});if(p.endsWith('/roles')&&method==='GET')return Response.json(inventory());const effect=p.match(/^\/api\/v10\/guilds\/([0-9]+)\/members\/([0-9]+)\/roles\/([0-9]+)$/);if(effect){assert.deepEqual(effect.slice(1),[GUILD,H.FOREIGN,ROLE]);if(method==='PUT')present.add(H.FOREIGN);else throw Error('unexpected success effect');return new Response(null,{status:204});}const member=p.match(/^\/api\/v10\/guilds\/[0-9]+\/members\/([0-9]+)$/);if(member)return Response.json({user:{id:member[1]},roles:member[1]===BOT?[BOTROLE]:present.has(member[1])?[ROLE]:[]});throw Error('unexpected success source HTTP');}});
 try{const ready=await Q.ready(f),proof=await qr.ingestAttestation(f.env,H.SUBJECT,f.signer.session,ready.input),ids=await roles.queueProofRoles(f.env,proof.proofId),before=f.d.trace.length,beforeGroups=f.d.groups.length,beforeHTTP=f.http.length,result=await roles.settleRoleIntent(f.env,ids[0]);H.eq(layout+' unchanged original real Ed25519 membership operation settles',result.state,'settled');H.eq(layout+' unchanged original effect is exactly one current member role',f.http.slice(beforeHTTP).filter(([m])=>m==='PUT'||m==='DELETE'),[['PUT','/api/v10/guilds/'+GUILD+'/members/'+H.FOREIGN+'/roles/'+ROLE]]);return{state:result.state,nativeStatements:f.d.trace.length-before,nativeGroups:f.d.groups.slice(beforeGroups).map(g=>g.length),effects:1};}finally{f.restore();}
}
async function main(){const measured={};for(const layout of['canonical','recorded-live-20261010']){const rows=[];rows.push({kind:'unchanged-positive',...(await success(layout))});for(const kind of PRE_CASES)rows.push(await runCase(layout,'before',kind));for(const kind of POST_CASES)rows.push(await runCase(layout,'after',kind));measured[layout]=rows;}H.eq('original role custody fixture timers empty',H.timers.size,0);console.log('MEASURED_ROLE_ORIGINAL_FACTS_SQL '+JSON.stringify(measured));console.log(`original role facts native: ${H.checks()}/${H.checks()} passed`);}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
