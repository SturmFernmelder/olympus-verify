// Real native rank DELETE and authenticated attended retirement, both with lost provider replies.
// The retirement parent is produced by the actual acknowledged membership PUT path, never seeded settled.
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'beta_reset_grants_test.cjs'),'utf8'),marker='(async()=>{';
if(fixture.split(marker).length!==2)throw Error('grant harness boundary changed');
const cases=String.raw`
const engine=load('beta-reset'),qr=load('qr-phase1-data'),api=load('site-api'),core=load('site-core');
const identity=r=>JSON.stringify([r.id,r.subject,r.purpose,r.guild_id,r.role_id,r.desired,r.claim_nonce,r.attempts,r.created_at,r.expires_at,r.subject_generation,r.request_digest]);
const oldFetch=globalThis.fetch,routeCosts=[];const protectedRoles=[leader,officer,raidLeader,moderator];
async function custody(label,original,kind){
 const before=JSON.stringify(rows()),net=requests.length,sql=physical;let refused=false;
 try{await env.DB.batch(qr.qrErasureStatements(env,subject));}catch(e){refused=/malformed JSON|qr_provider_custody_held/.test(String(e));}
 check(label+' real QR erasure refuses without altering original receipts',refused&&JSON.stringify(rows())===before);
 const status=await engine.betaRoleResetStatus(env),row=rows().find(r=>r.id===original.id);
 check(label+' original spent tuple remains unknown',row.state==='unknown'&&identity(row)===identity(original));
 check(label+' aggregate names unresolved scoped removal custody',status.removals.unresolvedGrantCustody===(kind==='retirement'?1:0)&&status.removals.unresolvedOtherRoleCustody===(kind==='rank'?1:0));
 check(label+' status reports no completion or role reuse',status.phase===(kind==='retirement'||clock>=policy.BETA_RESET_CUTOFF?'held':'before_cutoff')&&(kind!=='retirement'||status.reason==='beta_configuration_held')&&status.finalCompletion===false&&status.roleReuseReady===false);
 check(label+' aggregate excludes private receipt/member identifiers',![subject,original.id,original.claim_nonce].some(s=>JSON.stringify(status).includes(s)));
 check(label+' erasure/status bounded and provider-free',physical-sql<=64&&requests.length===net);
}
async function route(cookie,method,suffix,body){
 const url='https://guild.example/api/admin/membership-retirement'+suffix,sql=physical,http=requests.length;
 const response=await api.handleApi(new Request(url,{method,headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,new URL(url).pathname,()=>{throw Error('unexpected background work');});
 const data=await response.json(),cost={method,suffix,status:response.status,physical:physical-sql,http:requests.length-http};routeCosts.push(cost);console.log('ROUTE_COST '+JSON.stringify(cost));
 check('actual retirement route remains within 300 SQL and 8 HTTP',cost.physical<=300&&cost.http<=8);return {status:response.status,data};
}
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  await reset(installed);env.QR_RANK_MAPPING_ENABLED='true';env.MEMBERSHIP_ROLE_SETTLEMENT_ENABLED='true';
  members[subject]=[nativeRoles[2],...protectedRoles];const ids=await central.queueRosterRankRoles(env,subject,1,generation);
  const id=ids.find(id=>rows().find(r=>r.id===id).role_id===nativeRoles[2]);
  check(label+' actual rank queue creates the desired-zero operation',!!id&&rows().find(r=>r.id===id).desired===0);
  loseDelete=true;let out=await measure(label+' actual native rank lost DELETE',()=>central.settleRoleIntent(env,id,false,undefined,b));
  const original=rows().find(r=>r.id===id);
  check(label+' rank DELETE was dispatched once with lost acknowledgement',out.state==='unknown'&&original.state==='unknown'&&original.attempts===1&&effects().length===1&&!members[subject].includes(nativeRoles[2]));
  loseDelete=false;await custody(label+' rank immediately after loss',original,'rank');
  out=await measure(label+' rank current-proof GET absence',()=>central.settleRoleIntent(env,id,true,undefined,b));
  check(label+' current rank proof cannot settle lost DELETE on absence',out.state==='unknown'&&effects().length===1);
  await custody(label+' rank after current-proof absence',original,'rank');
  await env.DB.prepare('UPDATE roster_snapshots SET trusted=0 WHERE id=1').run();
  out=await measure(label+' rank stale-proof GET absence',()=>central.settleRoleIntent(env,id,true,undefined,b));
  check(label+' stale rank proof cannot release lost DELETE custody',out.state==='unknown'&&effects().length===1);
  clock=policy.BETA_RESET_CUTOFF;await custody(label+' rank stale proof after cutoff',original,'rank');
  check(label+' rank observation preserves protected roles',protectedRoles.every(role=>members[subject].includes(role)));

  for(const afterCutoff of [false,true]){
   await reset(installed);const parentId=await centralId();out=await measure(label+' actual acknowledged parent PUT',()=>central.settleRoleIntent(env,parentId,false,undefined,b));
   const parent=rows().find(r=>r.id===parentId),parentSnapshot=JSON.stringify(parent);
   check(label+' attended parent comes from actual completed provider grant',out.state==='settled'&&parent.state==='settled'&&effects().length===1&&effects()[0].method==='PUT'&&members[subject].includes(memberRole));
   const replacement='400000000000000008';if(!inventory.some(r=>r.id===replacement))inventory.push({id:replacement,position:2,permissions:'0',managed:false});
   Object.assign(env,{ROLE_GUILD_MEMBER:replacement,MEMBERSHIP_RETIRED_ROLE_ID:memberRole,SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://bot.example',COOKIE_SECRET:'synthetic-retirement-custody-cookie',VERIFY_SECRET:'synthetic-verify',PRIVACY_WRITE_ADMISSION_ENABLED:'true'});
   members[subject].push(replacement,...protectedRoles);if(afterCutoff)clock=policy.BETA_RESET_CUTOFF;
   const staffGeneration='a'.repeat(32);await env.DB.prepare('INSERT INTO site_users(discord_id,username,in_server,denied,session_version,first_login,last_login,checked_at) VALUES(?1,?2,1,0,1,?3,?3,?3)').bind(owner,'synthetic owner',clock).run();
   await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',1,?3,?3)").bind(owner,staffGeneration,clock).run();
   await env.DB.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('appointed','synthetic-preserved-appointment',?1)").bind(clock).run();
   const cookie=(await currentEntry.issueOriginalEntryCookie(load,db,{...env,DB:originalNative},owner)).cookie;await env.DB.prepare('UPDATE site_users SET checked_at=? WHERE discord_id=?').bind(clock,owner).run();
   const tag=label+' attended retirement '+(afterCutoff?'after':'before')+' cutoff';
   let preview=await route(cookie,'GET','?parentGrantId='+parentId);check(tag+' actual authenticated preview grants fixed-purpose form',preview.status===200&&preview.data.action==='retire'&&!!preview.data.form);
   loseDelete=true;let retired=await route(cookie,'POST','/retire',{parentGrantId:parentId,form:preview.data.form});
   const child=rows().find(r=>r.purpose==='grant_compensation');
   check(tag+' one real lost DELETE creates unknown child',retired.status===200&&retired.data.state==='unknown'&&child.state==='unknown'&&child.attempts===1&&!members[subject].includes(memberRole)&&effects().map(e=>e.method).join(',')==='PUT,DELETE');
   loseDelete=false;await custody(tag+' immediately after loss',child,'retirement');
   preview=await route(cookie,'GET','?parentGrantId='+parentId);check(tag+' fresh signed reconciliation form retains original child',preview.status===200&&preview.data.action==='reconcile'&&preview.data.child.operationId===child.id);
   retired=await route(cookie,'POST','/reconcile',{parentGrantId:parentId,operationId:child.id,form:preview.data.form});
   check(tag+' actual attended GET absence cannot settle unknown DELETE',retired.status===200&&retired.data.state==='unknown'&&effects().length===2);
   await custody(tag+' after authenticated GET absence',child,'retirement');
   check(tag+' original grant receipt and appointments remain exact',JSON.stringify(rows().find(r=>r.id===parentId))===parentSnapshot&&db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value==='synthetic-preserved-appointment');
   check(tag+' replacement and protected roles are preserved',members[subject].includes(replacement)&&protectedRoles.every(role=>members[subject].includes(role)));
  }
 }
 console.log('BETA_RESET_REMOVAL_CUSTODY_SUMMARY '+JSON.stringify({checks:n,measurements:costs.length,routeMeasurements:routeCosts.length,maxPhysical:Math.max(...costs.map(c=>c.physical),...routeCosts.map(c=>c.physical)),maxHttp:Math.max(...costs.map(c=>c.network),...routeCosts.map(c=>c.http)),providerQualified:false}));console.log(n+'/'+n+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;globalThis.fetch=oldFetch;if(db)db.close();});
`;
new Function('__dirname','require',fixture.slice(0,fixture.indexOf(marker))+cases)(__dirname,require);
