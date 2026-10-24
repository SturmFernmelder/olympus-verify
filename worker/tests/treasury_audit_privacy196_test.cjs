// EXTERNAL, UNEVALUATED regression proposal. Use only after the reviewed source
// overlay is integrated. The original Native fixture setup, actual index,
// original OAuth/session issuer and Native erasure lifecycle remain intact.
// Only Discord HTTP responses are synthetic. No real provider is reachable.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const original=path.join(__dirname,'privacy_native_erasure_mode_test.cjs'),bytes=fs.readFileSync(original),setup=bytes.toString('utf8'),marker='(async()=>{\n // .174:';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
if(sha(bytes)!=='0f2fec9685d3a22ceb3f8684ec72d913a749d5ad33cb9b07bc62d9c96d87e98e'||setup.split(marker).length!==2)throw Error('treasury_audit_original_native_setup_changed');
const inputs=new Map(),read=fs.readFileSync;
fs.readFileSync=function(file,...rest){const value=Reflect.apply(read,this,[file,...rest]);if(typeof file==='string'&&file.endsWith('.ts')&&file.includes(path.sep+'src'+path.sep))inputs.set(file,Buffer.from(value));return value;};
globalThis.__treasuryAudit196={inputs,read,sha,fixtureSHA256:sha(bytes),setupSHA256:sha(setup.slice(0,setup.indexOf(marker))),result:process.env.TREASURY_AUDIT196_RESULT_FILE};
async function treasuryAuditPrivacy196(){
 const witness=globalThis.__treasuryAudit196,T=load('treasury-cosmetic'),S=load('role-settlements'),ledger=load('community-contributions'),core=load('site-core');
 const actions=['treasury.extra_gold_recorded','treasury.cosmetic_previewed','treasury.cosmetic_confirmed'];
 const roles={tithePayer:'1551234567890123471',patron:'1551234567890123472',benefactor:'1551234567890123473'},assertions=[],results=[];
 const expect=(name,ok,details)=>{assertions.push({name,ok:!!ok});console.log((ok?'PASS ':'FAIL ')+name);if(!ok)throw Error(name+' '+JSON.stringify(details));};
 const response=(status,body)=>new Response(body===undefined?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const schema=f=>JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
 async function world(phase='confirm'){
  const previousClock=clock,f=fixture();clock=Math.max(previousClock,clock)+7200;f.roles.set(ID,[MEMBER]);
  // The administrator needs no invented guild role: the original SITE_ADMINS
  // setting grants site-admin authority. Only the target needs current Olympus
  // membership for the explicitly confirmed cosmetic grant.
  const targetCookie=await f.signIn(ID),actorCookie=await f.signIn(OTHER);await seedPersonal(f,{roles:1});
  const seasonStartsAt=clock-3600;
  Object.assign(f.env,{COMMUNITY_FEATURES:'directory,contributions',CONTRIBUTIONS_MODE:'ledger',CONTRIBUTIONS_SCOPE:'olympus',CONTRIBUTIONS_RETENTION_DAYS:'90',TREASURY_COSMETIC_ENABLED:'true',TREASURY_COSMETIC_ROLES:JSON.stringify({version:1,guildId:GUILD,applicationId:BOT,seasonStartsAt,roles})});
  const baseProvider=f.provider;
  f.provider=async(url,init={})=>{
   const u=new URL(url),p=u.pathname.replace(/^\/api\/v10/,''),method=init.method||'GET';
   if(u.origin!=='https://discord.com')throw Error('non-Discord synthetic request refused');
   if(p===`/guilds/${GUILD}/roles`&&method==='GET'&&!f.inventoryUnavailable){
    f.http.push({method,url});return response(200,[{id:GUILD,name:'@everyone',position:0,permissions:'0',managed:false},{id:BOTROLE,name:'Native bot',position:50,permissions:'268435456',managed:false},...[MEMBER,RANK1,RANK2].map((id,i)=>({id,name:['Guild Member','Native Officer','Native Raider'][i],position:i+1,permissions:'0',managed:false})),...Object.values(roles).map((id,i)=>({id,name:['Tithe Payer','Patron of the Treasury','Benefactor of Olympus'][i],position:5+i,permissions:'0',managed:false,hoist:false,mentionable:false}))]);
   }
   if(p===`/guilds/${GUILD}/channels`&&method==='GET'){f.http.push({method,url});return response(200,[]);}
   if(p===`/guilds/${GUILD}`&&method==='GET'){f.http.push({method,url});return response(200,{id:GUILD,owner_id:'300000000000000088'});}
   const put=new RegExp('^/guilds/'+GUILD+'/members/('+ID+')/roles/('+Object.values(roles).join('|')+')$').exec(p);
   if(put&&method==='PUT'){f.http.push({method,url});f.roles.set(ID,[...new Set([...(f.roles.get(ID)||[]),put[2]])]);return response(204);}
   return baseProvider(url,init);
  };
  const call=async(sub,body,cookie=actorCookie)=>{const r=await f.call('POST','/api/admin/treasury/'+sub,{cookie,body,headers:{'X-Olympus':core.PAGE_VERSION}});return {response:r,body:await json(r)};};
  const receipt=await call('record',{reference:'audit-privacy196',discordId:ID,amountCopper:250000,observedAt:clock-10,mailReference:await ledger.mailReference({...f.env,DB:f.writer},'olympus',ID),verifiedAdditionalGold:true});
  expect(phase+' fixture writes the original attended receipt through actual index',receipt.response.status===200&&receipt.body?.recorded===true,receipt);
  let preview=null,confirm=null;
  if(phase!=='record'){
   preview=await call('preview',{discordId:ID,recognitionConsent:true});
   expect(phase+' fixture creates the original audited no-effect preview',preview.response.status===200&&preview.body?.changes?.length===1&&preview.body?.liveEffectClaimed===false,preview);
  }
  if(phase==='confirm'){
   confirm={token:preview.body.token,operationId:preview.body.changes[0].operationId,confirmed:true};const effect=await call('confirm',confirm);
   expect('fixture confirms one source-owned Treasury operation with a known ACK',effect.response.status===200&&effect.body?.state==='settled'&&f.roles.get(ID).includes(roles.tithePayer),effect);
  }
  return {f,targetCookie,actorCookie,seasonStartsAt,call,confirm};
 }
 const treasuryAudits=f=>f.rows("SELECT id,actor,subject,action,details FROM audit WHERE action IN('treasury.extra_gold_recorded','treasury.cosmetic_previewed','treasury.cosmetic_confirmed') ORDER BY id");
 function checkCopy(label,body,who,privateProofs){
  const rows=body.actions?.entries??body.actions?.rows;
  expect(label+' contains all three original Treasury action names',Array.isArray(rows)&&actions.every(action=>rows.some(r=>r.action===action)),body.actions);
  expect(label+' action entries contain only original action/time fields',rows.every(r=>Object.keys(r).sort().join(',')==='action,at'),rows);
  const text=JSON.stringify(body),other=who===ID?OTHER:ID;
  expect(label+' omits counterpart identity and private actor/target custody fields',!text.includes(other)&&!['_privacySubjectIds','actorAccountIncarnation','actorPrivacyGeneration','actorSessionVersion','targetAccountIncarnation','targetPrivacyGeneration'].some(key=>text.includes('"'+key+'"'))&&privateProofs.every(value=>!text.includes(value)),{copiedKeys:Object.keys(body)});
  expect(label+' remains explicitly partial and never claims every copy erased',body.coverage?.kind==='curated_partial'&&body.coverage?.completeErasure===false,body.coverage);
 }
 async function identifyCopy(f,who){
  const start=await f.call('GET','/privacy/signin'),location=new URL(start.headers.get('Location')),flowCookie=Object.entries(cookies(start)).map(([key,value])=>key+'='+value).join('; ');
  expect('identify '+who+' requests only identify scope',start.status===303&&location.searchParams.get('scope')==='identify');
  const callback=await f.call('GET','/privacy/callback?code=code-'+who+'&state='+encodeURIComponent(location.searchParams.get('state'))+'&iss=https%3A%2F%2Fdiscord.com',{cookie:flowCookie});
  const accessCookie=Object.entries(cookies(callback)).filter(([key])=>key===load('privacy-access').PRIVACY_ACCESS_COOKIE).map(([key,value])=>key+'='+value).join('; ');
  expect('identify '+who+' uses a genuine privacy-only callback grant',callback.status===303&&!!accessCookie&&!cookies(callback)['__Host-olg']);
  const page=await f.call('GET','/privacy/access',{cookie:accessCookie}),html=await page.text(),form=/<form method="post" action="\/privacy\/access\/export">([\s\S]*?)<\/form>/.exec(html);
  expect('identify '+who+' receives the original one-use export form',page.status===200&&!!form);
  const fields=Object.fromEntries([...form[1].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(match=>[match[1],match[2]]));
  const submit=async()=>{
   active=f;const pending=[],r=await index.fetch(new Request(BASE+'/privacy/access/export',{method:'POST',headers:{Cookie:accessCookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':'192.0.2.'+(++requestSerial)},body:new URLSearchParams(fields)}),f.env,{waitUntil(value){pending.push(Promise.resolve(value));}});for(const value of pending)await value;return r;
  };
  const response=await submit(),body=await json(response);expect('identify '+who+' actual export succeeds',response.status===200,body);
  const grant=f.raw("SELECT consumed_at FROM privacy_access_grants WHERE subject_id=? AND purpose='own_export' ORDER BY created_at DESC LIMIT 1",who),calls=f.http.length,replay=await submit();
  expect('identify '+who+' retains original one-use grant refusal without provider effects',Number.isSafeInteger(grant?.consumed_at)&&replay.status!==200&&f.http.length===calls);
  return body;
 }
 // Four real own-copy responses, not SQL-projector-only witnesses.
 {
  const w=await world(),{f}=w;
  try{
   const originalAudits=treasuryAudits(f),details=originalAudits.map(row=>JSON.parse(row.details));
   expect('all three source-created audits capture exact original actor and target',actions.every(action=>originalAudits.some(row=>row.action===action&&row.actor===OTHER&&row.subject===ID))&&details.every(row=>JSON.stringify(row._privacySubjectIds)===JSON.stringify([OTHER,ID])));
   const privateProofs=[...new Set(details.flatMap(row=>[row.actorAccountIncarnation,row.actorPrivacyGeneration,row.targetAccountIncarnation,row.targetPrivacyGeneration]).filter(value=>typeof value==='string'))];
   expect('redaction fixture actually contains private incarnation/generation proof values',privateProofs.length>=2&&privateProofs.every(value=>/^[0-9a-f]{32}$/.test(value)));
   for(const who of [OTHER,ID]){
    const cookie=who===ID?w.targetCookie:w.actorCookie,before=f.http.length,r=await f.call('GET','/api/me/export',{cookie}),body=await json(r);
    expect('ordinary '+who+' actual source copy succeeds without provider work',r.status===200&&f.http.length===before,body);checkCopy('ordinary '+who,body,who,privateProofs);
    const identified=await identifyCopy(f,who);checkCopy('identify '+who,identified,who,privateProofs);
   }
   results.push({case:'actor_target_ordinary_and_identify_redaction',auditRows:originalAudits.length,copyResponses:4});
  }finally{f.close();}
 }
 // Six separate lifecycle worlds: the audit row is created by its actual API,
 // then removed only by original authenticated erasure + Native continuation.
 // There is no fixture DELETE of audit, site_users or role_settlements.
 for(const phase of ['record','preview','confirm'])for(const party of ['actor','target']){
  const w=await world(phase),{f}=w,who=party==='actor'?OTHER:ID,cookie=party==='actor'?w.actorCookie:w.targetCookie,action=actions[['record','preview','confirm'].indexOf(phase)];
  try{
   const beforeSchema=schema(f),owned=treasuryAudits(f).filter(row=>row.action===action),otherAccount=party==='actor'?ID:OTHER;
   expect(phase+'/'+party+' begins with a real source-written audit and both live accounts',owned.length===1&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',who)&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',otherAccount));
   const originalRole=w.confirm?JSON.stringify(f.raw('SELECT * FROM role_settlements WHERE id=?',w.confirm.operationId)):null;
   f.inventoryUnavailable=true;const admitted=await request(f,cookie);f.inventoryUnavailable=false;
   expect(phase+'/'+party+' original signed erasure admits its own operation',admitted.response.status===202&&admitted.body?.operationId===OP,admitted.body);
   const job=await finish(f),status=await f.status(OP,admitted.body.statusToken),statusBody=await json(status);
   expect(phase+'/'+party+' original Native lifecycle genuinely completes local erasure',job?.state==='complete'&&status.status===200&&statusBody?.servingAccountErased===true&&statusBody?.allCopiesErased===false,{job,statusBody});
   expect(phase+'/'+party+' terminal source removes the action and its private references',owned.every(row=>!f.raw('SELECT 1 FROM audit WHERE id=?',row.id))&&!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',who)&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',otherAccount));
   expect(phase+'/'+party+' leaves the original Native schema and write epoch intact',schema(f)===beforeSchema&&f.raw('SELECT epoch FROM privacy_write_admission').epoch===EPOCH&&f.floorCalls===0);
   const maximum=Math.max(0,...f.measurements.map(row=>row.statements));expect(phase+'/'+party+' every measured original continuation fits installed196 physical',maximum>0&&maximum<=196,{maximum,measurements:f.measurements});
   if(phase==='confirm'&&party==='actor'){
    expect('actor erasure retains the separate exact acknowledged target-role parent',JSON.stringify(f.raw('SELECT * FROM role_settlements WHERE id=?',w.confirm.operationId))===originalRole&&f.roles.get(ID).includes(roles.tithePayer));
    const confirmed=owned[0],matching=f.raw("SELECT EXISTS(SELECT 1 FROM audit WHERE actor=? AND action='treasury.cosmetic_confirmed' AND subject=? AND details=?) AS present",confirmed.actor,confirmed.subject,confirmed.details);
    expect('erased attribution cannot satisfy the original exact confirmation-audit predicate',matching.present===0);
    const effects=f.http.filter(row=>['PUT','DELETE'].includes(row.method)).length,replay=await w.call('confirm',w.confirm),adoption=await w.call('confirm',w.confirm,w.targetCookie);
    expect('old actor cookie and another account cannot recreate or adopt erased attribution',replay.response.status!==200&&adoption.response.status!==200&&!f.raw("SELECT 1 FROM audit WHERE action='treasury.cosmetic_confirmed' AND subject=?",ID)&&f.http.filter(row=>['PUT','DELETE'].includes(row.method)).length===effects&&JSON.stringify(f.raw('SELECT * FROM role_settlements WHERE id=?',w.confirm.operationId))===originalRole,{replay:replay.response.status,adoption:adoption.response.status,originalTokenMayBeExpired:true});
    // Retention consequence is explicit: the private shared audit is gone.
    // Removal-only expiry must instead use the exact original role custody.
    clock=w.seasonStartsAt+T.TREASURY_WINDOW_SECONDS+1;const sql=f.physicalStatements,http=f.http.length;
    const expired=await S.expireTreasuryCosmeticRoles({...f.env,DB:f.writer,TREASURY_COSMETIC_ENABLED:'false',TREASURY_COSMETIC_ROLES:undefined},{sqlRemaining:S.TREASURY_EXPIRY_SQL_MAX,calls:{limit:8,attempts:0,retries:0}}),newHttp=f.http.slice(http),child=f.raw("SELECT * FROM role_settlements WHERE purpose='treasury_cosmetic_expiry' AND request_digest=?",w.confirm.operationId);
    expect('exact retained expiry still removes the target role after actor audit erasure',expired.state==='settled'&&child?.state==='settled'&&child?.request_digest===w.confirm.operationId&&newHttp.filter(row=>row.method==='DELETE').length===1&&!newHttp.some(row=>row.method==='PUT')&&!f.roles.get(ID).includes(roles.tithePayer),{expired,child});
    expect('audit-independent expiry preserves its original64SQL8HTTP cap',f.physicalStatements-sql<=64&&newHttp.length<=8,{physical:f.physicalStatements-sql,http:newHttp.length});
    expect('expiry cannot recreate the erased actor audit or change the parent',!f.raw("SELECT 1 FROM audit WHERE action='treasury.cosmetic_confirmed' AND subject=?",ID)&&JSON.stringify(f.raw('SELECT * FROM role_settlements WHERE id=?',w.confirm.operationId))===originalRole);
   }
   results.push({case:phase+'_'+party+'_erasure',job:job?.state,maximumPhysical:maximum,measurements:f.measurements});
  }finally{f.close();}
 }
 const unchanged=[...witness.inputs].every(([file,value])=>Reflect.apply(witness.read,fs,[file]).equals(value));expect('all loaded production source bytes remain unchanged',unchanged);
 const evidence={schema:'master196-treasury-actor-audit-privacy-v1',fixtureSetupSHA256:witness.setupSHA256,fixtureFileSHA256:witness.fixtureSHA256,assertions:assertions.length,passed:assertions.filter(row=>row.ok).length,results,sourceInputs:[...witness.inputs].map(([file,value])=>({path:file,bytes:value.length,sha256:witness.sha(value)})),sourceUnchanged:unchanged,actualNetwork:false,actualWorkerdCallback:false,whole700Measured:false,auditAttributionPermanent:false,originalTokenReplayGateIsolated:false};
 if(witness.result)fs.writeFileSync(witness.result,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log('TREASURY_AUDIT196_RESULT '+JSON.stringify({...evidence,sourceInputs:evidence.sourceInputs.length}));
}
const m=new Module(__filename,module);m.filename=__filename;m.paths=module.paths;m._compile(setup.slice(0,setup.indexOf(marker))+'\n('+treasuryAuditPrivacy196.toString()+')().catch(error=>{console.error(error.stack);active?.close();process.exitCode=1;});',__filename);
