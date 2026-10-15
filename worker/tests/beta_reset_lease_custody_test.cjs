// Actual V2 source, SQLite, and installed admission. Synthetic provider responses only.
// Reuse the slice harness without altering runtime code or executing its older test cases.
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'beta_reset_slice_test.cjs'),'utf8'),marker='(async()=>{';
if(fixture.split(marker).length!==2)throw Error('slice harness boundary changed');
const cases=String.raw`
const baseFetch=providerFetch,qr=load('qr-phase1-data');
const receiptIdentity=r=>JSON.stringify([r.id,r.subject,r.purpose,r.guild_id,r.role_id,r.desired,r.claim_nonce,r.attempts,r.created_at,r.expires_at,r.subject_generation,r.request_digest]);
async function retainedCustody(label,original){
 const before=JSON.stringify(jobs()),http=requests.length,sql=physical;
 let refused=false;try{await env.DB.batch(qr.qrErasureStatements(env,original.subject));}catch(e){refused=/malformed JSON|qr_provider_custody_held/.test(String(e));}
 check(label+' actual QR erasure rejects unknown provider custody',refused);
 check(label+' refused erasure preserves all receipts and uses no provider calls',JSON.stringify(jobs())===before&&requests.length===http);
 const state=await engine.betaRoleResetStatus(env),spent=jobs().find(r=>r.id===original.id);
 check(label+' original one-use identity remains unknown',!!spent&&spent.state==='unknown'&&receiptIdentity(spent)===receiptIdentity(original));
 check(label+' aggregate status stays held with one unknown removal',state.phase==='held'&&state.removals.unknown===1&&state.removals.unresolvedGrantCustody===0&&state.finalCompletion===false&&state.roleReuseReady===false);
 check(label+' status excludes private member and receipt identifiers',![original.subject,original.id,original.claim_nonce,'PRIVATE_'].some(value=>JSON.stringify(state).includes(value)));
 check(label+' website appointments and protected roles survive',db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value===appointed&&preserved.every(role=>members.get(original.subject).includes(role)));
 check(label+' erasure and status checks are bounded',physical-sql<=300&&requests.length===http);
}
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  for(let expireAfter=0;expireAfter<4;expireAfter++){
   await reset(installed,2);let reads=0,expired=false;
   providerFetch=async(input,init={})=>{const url=new URL(String(input)),response=await baseFetch(input,init);
    if(!url.pathname.endsWith('/members')&&(init.method||'GET')==='GET'&&!expired&&reads++===expireAfter){expired=true;clock=scan().leaseUntil;}return response;};
   const out=await slice(label+' expiry after qualification GET '+expireAfter);
   check(label+' no later qualification or effect after GET '+expireAfter,expired&&out.state==='held'&&out.http===expireAfter+2&&effects().length===0&&jobs().every(j=>j.attempts===0));
  }
  providerFetch=baseFetch;
  await reset(installed,2);deleteHook=async()=>{clock=scan().leaseUntil;deleteHook=null;};let out=await slice(label+' acknowledged DELETE completes after scan expiry');
  check(label+' acknowledged effect records own receipt without another effect',effects().length===1&&jobs().filter(j=>j.attempts===1).length===1&&jobs().find(j=>j.attempts===1).state==='settled'&&targetCount()===1&&out.state==='held');

  await reset(installed);loseDelete=true;out=await slice(label+' actual reset DELETE loses acknowledgement');
  const original=jobs().find(j=>j.attempts===1);
  check(label+' lost actual DELETE leaves one unknown original receipt',out.unknown===1&&original.state==='unknown'&&effects().length===1&&targetCount()===0);
  await retainedCustody(label+' immediately after lost DELETE',original);
  loseDelete=false;clock+=1801;
  out=await slice(label+' fresh GET absence after lost reset DELETE');
  check(label+' fresh absence cannot settle or redispatch original DELETE',out.unknown===1&&effects().length===1&&targetCount()===0&&jobs().find(j=>j.id===original.id).state==='unknown');
  await retainedCustody(label+' after fresh GET absence',original);

  // A later independent regrant cannot prove that the old DELETE has finished either.
  members.get(original.subject).push(memberRole);clock+=1801;
  out=await slice(label+' external regrant while original DELETE remains unknown');
  check(label+' present observation cannot authorize a second DELETE',out.unknown===1&&effects().length===1&&targetCount()===1);
  await retainedCustody(label+' after later role presence',original);
  // Model completion of that original provider request after the new observation.
  members.set(original.subject,members.get(original.subject).filter(role=>role!==memberRole));
  await retainedCustody(label+' after simulated late original provider completion',original);
  check(label+' all uncertain-custody observations retain exactly one provider effect',effects().length===1);

  await reset(installed);let replaced=false;sqlAfter=sql=>{if(!replaced&&sql.startsWith('SELECT 1 FROM role_settlements WHERE')&&sql.includes("state='dispatching' AND attempts=1")){replaced=true;env.DISCORD_APP_ID='700000000000000099';}};
  out=await slice(label+' original environment changes at final effect admission');
  check(label+' changed original bot identity prevents DELETE after SQL admission',replaced&&effects().length===0&&jobs().some(j=>j.attempts===1));
 }
 console.log('BETA_RESET_LEASE_CUSTODY_SUMMARY '+JSON.stringify({checks,measurements:costs.length,maxPhysical:Math.max(...costs.map(x=>x.physical)),maxHttp:Math.max(...costs.map(x=>x.http)),maxDeletes:Math.max(...costs.map(x=>x.deletes)),providerQualified:false}));
 console.log(checks+'/'+checks+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;providerFetch=baseFetch;if(db)db.close();});
`;
new Function('__dirname','require',fixture.slice(0,fixture.indexOf(marker))+cases)(__dirname,require);
