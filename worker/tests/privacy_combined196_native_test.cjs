// Reuse the unchanged genuine Native-mode fixture SETUP only. No production
// source/export replacement and no existing assertion edit. The source's actual
// index, session issuer, registered copy and original erasure continuation run.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const original=path.join(__dirname,'privacy_native_erasure_mode_test.cjs'),bytes=fs.readFileSync(original),marker='(async()=>{\n // .174:';
const setup=bytes.toString('utf8');if(setup.split(marker).length!==2)throw Error('combined196_original_setup_boundary');
const loaded=new Map(),read=fs.readFileSync;fs.readFileSync=function(file,...rest){const value=Reflect.apply(read,this,[file,...rest]);if(typeof file==='string'&&file.endsWith('.ts')&&file.includes(path.sep+'src'+path.sep))loaded.set(file,Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(value));return value;};
globalThis.__combined196={loaded,read,fixtureSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),sha:value=>crypto.createHash('sha256').update(value).digest('hex'),result:process.env.COMBINED196_RESULT_FILE};
async function combined196(){
 const witness=globalThis.__combined196,registry=load('community-context'),names=registry.communityDataNames(),results=[],failures=[];
 let assertions=0;
 const expect=(name,value,detail)=>{assertions++;console.log((value?'PASS ':'FAIL ')+name);if(!value){failures.push({name,detail});console.log(JSON.stringify(detail));}};
 expect('actual index registers both new own-data families',names.includes('discord_directory_visibility')&&names.includes('news_webhook'),names);
 for(const selected of [['news_webhook','news_webhook'],['missing196']]){let refused=false;try{load('community-data-registry').communityScopedEraseStatements({},ID,selected);}catch{refused=true;}expect('missing or duplicate scoped eraser names fail closed',refused,selected);}
 const metadata=(f,tag,who)=>{const n=tag.padEnd(22,'x'),operation='news_webhook_v1:'+n+':'+tag.charCodeAt(0).toString(16).repeat(21),account=f.raw('SELECT account_incarnation FROM site_users WHERE discord_id=?',who),subject=f.raw('SELECT generation FROM privacy_subjects WHERE subject_id=?',who);return {v:1,id:n,revision:1,operation,payloadHash:'1'.repeat(64),configHash:f.webhookHash??'2'.repeat(64),credentialPin:f.webhookPin??'A'.repeat(43),guild:GUILD,channel:CHANNEL,webhook:'1551234567890123491',actor:who,birth:account.account_incarnation,generation:subject.generation,createdAt:clock-100,noticeUntil:clock+86400,retainUntil:clock-100+authority.PRIVACY_REPLAY};};
 let caseNumber=0;
 for(const kind of ['directory_only','webhook_only','combined_known','combined_inactive','combined_unknown','ambiguous_note','malformed_visibility','scoped_batch_failure']){
  const f=fixture();clock+=900+3600*caseNumber++;const cookie=await f.signIn(ID);await f.signIn(OTHER);await seedPersonal(f,{roles:0});
  Object.assign(f.env,{COMMUNITY_FEATURES:'directory,contributions',CONTRIBUTIONS_MODE:'ledger',CONTRIBUTIONS_SCOPE:'olympus',CONTRIBUTIONS_RETENTION_DAYS:'90'});
  const sourceSchema=JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"));
  if(kind==='combined_known'||kind==='combined_inactive'){
   const webhook='1551234567890123491',token='combined196-fixture-only-token-'.padEnd(48,'x');
   Object.assign(f.env,{TOWN_CRIER_WEBHOOK:JSON.stringify({guild:GUILD,channel:CHANNEL,webhook}),TOWN_CRIER_WEBHOOK_TOKEN:token,TOWN_CRIER_WEBHOOK_ENABLED:'false'});
   f.webhookHash=witness.sha(JSON.stringify(['town-crier-destination-v1',GUILD,CHANNEL,webhook]));f.webhookPin=await load('site-core').sign(f.env.COOKIE_SECRET,'town-crier-webhook-credential-v1',JSON.stringify([f.webhookHash,token]));
   const originalProvider=f.provider;let messagePresent=true;f.provider=async(url,init)=>{const u=new URL(url),base='/api/v10/webhooks/'+webhook+'/'+token;if(!u.pathname.startsWith(base))return originalProvider(url,init);const method=init.method||'GET';f.http.push({method,url});const response=(status,body)=>new Response(body===undefined?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});if(method==='GET'&&u.pathname===base)return response(200,{id:webhook,type:1,guild_id:GUILD,channel_id:CHANNEL});if(method==='GET'&&u.pathname===base+'/messages/'+MESSAGE)return messagePresent?response(200,{id:MESSAGE,channel_id:CHANNEL,webhook_id:webhook}):response(404,{});if(method==='DELETE'&&u.pathname===base+'/messages/'+MESSAGE){messagePresent=false;return response(204);}throw Error('unexpected combined webhook effect');};
  }
  if(kind!=='webhook_only'){
   const response=await f.call('PUT','/api/community/discord-directory/visibility',{cookie,body:{listed:false}});expect(kind+' actual own opt-out accepted',response.status===200,await json(response));
   const otherBirth=f.raw('SELECT account_incarnation FROM site_users WHERE discord_id=?',OTHER).account_incarnation;
   await f.write("UPDATE site_settings SET value=json_set(value,?1,?2) WHERE key='discordDirectoryHidden'",'$."'+OTHER+'"',otherBirth);
  }
  if(kind==='ambiguous_note')await f.write("INSERT INTO site_settings(key,value,updated_at)VALUES('unknown196','Unstructured '||?1,?2)",ID,clock);
  if(kind==='malformed_visibility')await f.write("UPDATE site_settings SET value=?1 WHERE key='discordDirectoryHidden'",JSON.stringify({[ID]:'not-an-incarnation'}));
  if(kind!=='directory_only')for(const tag of ['j','k']){const meta=metadata(f,tag,ID);await f.write('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)','newsWebhook:'+meta.id,JSON.stringify(meta),clock,ID);await f.write("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'notice',?,?,?,'known',0,?,?,?)",meta.operation,JSON.stringify([{id:ID,g:meta.generation}]),CHANNEL,MESSAGE,meta.createdAt,clock,meta.retainUntil);}
  if(kind.startsWith('combined')){
   const giftRole='1551234567890123471',roles={tithePayer:giftRole,patron:'1551234567890123472',benefactor:'1551234567890123473'};
   f.env.TREASURY_COSMETIC_ROLES=JSON.stringify({version:1,guildId:GUILD,applicationId:BOT,seasonStartsAt:clock-3600,roles});
   const ledger=load('community-contributions'),reference=await ledger.mailReference(f.env,'olympus',ID),receipt=await f.call('POST','/api/admin/treasury/record',{cookie:f.jar.get(OTHER),body:{reference:'combined196-extra',discordId:ID,amountCopper:250000,observedAt:clock-10,mailReference:reference,verifiedAdditionalGold:true}});
   expect(kind+' actual attended extra-gold receipt accepted',receipt.status===200,await json(receipt));
   const generation=f.raw('SELECT generation FROM privacy_subjects WHERE subject_id=?',ID).generation;
   await f.write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,subject_generation,created_at,expires_at,checked_at)VALUES(?,?,'treasury_cosmetic',?,?,1,?,?,1,?,?,?,?,?)",'9'.repeat(32),ID,GUILD,giftRole,kind==='combined_unknown'?'unknown':'settled',kind==='combined_unknown'?'treasury_provider_outcome_unknown':'treasury_effect_acknowledged','8'.repeat(32),generation,clock-100,clock+7776000,kind==='combined_unknown'?null:clock-100);
  }
  const beforeCopy=f.physicalStatements,copy=await f.call('GET','/api/me/export',{cookie}),body=await json(copy),copyPhysical=f.physicalStatements-beforeCopy;
  expect(kind+' actual whole own copy '+(kind==='malformed_visibility'?'refuses malformed preference without a rate-limit substitute':'succeeds'),kind==='malformed_visibility'?copy.status>=400&&copy.status!==429&&!body?.community:copy.status===200,{status:copy.status,body});
  if(copy.status===200){
   expect(kind+' whole copy includes exact own visibility preference',body.community?.discord_directory_visibility?.optedOut===(kind!=='webhook_only'),body.community?.discord_directory_visibility);
   expect(kind+' whole copy includes two safe own webhook metadata rows',(body.community?.news_webhook?.deliveries?.length??0)===(kind!=='directory_only'?2:0)&&!JSON.stringify(body.community?.news_webhook).includes('credentialPin')&&!JSON.stringify(body.community?.news_webhook).includes('message_id'),body.community?.news_webhook);
   const wh=body.community?.news_webhook;expect(kind+' whole webhook copy declares its own bounded count honestly',wh?.count===(kind!=='directory_only'?2:0)&&wh.returnedCount===wh.deliveries.length&&wh.limit===1000&&wh.truncated===false&&wh.complete===true,wh);
   if(kind.startsWith('combined')){expect(kind+' whole copy includes own extra receipt',body.community?.contributions?.receipts?.some(r=>r.amountCopper===250000)===true,body.community?.contributions);expect(kind+' whole copy includes own Treasury role outcome',body.community?.councillor_verification?.roleOutcomes?.rows?.some(r=>r.purpose==='treasury_cosmetic')===true,body.community?.councillor_verification);}
  }
  // Hold the immediate site slice at its original role inventory and measure
  // the entire queued job, including both guards and all registered plans.
  // An odd database-clock quarter-hour selects account work, not global debt.
  if(kind==='scoped_batch_failure')f.failSql=sql=>sql.startsWith('UPDATE site_settings SET value=json_set')&&sql.includes('newsWebhook');
  let job;
  if(kind==='combined_inactive'){
   await f.write('DELETE FROM characters WHERE discord_id=?',ID);const inactiveAt=clock-authority.PRIVACY_YEAR-1;
   await f.write('UPDATE site_users SET last_login=? WHERE discord_id=?',inactiveAt,ID);await f.write('UPDATE members SET activity_at=? WHERE discord_id=?',inactiveAt,ID);
   expect(kind+' starts without a fabricated erasure operation',!f.raw('SELECT 1 FROM privacy_serving_jobs')&&!f.raw('SELECT 1 FROM characters WHERE discord_id=?',ID));
   await f.job('combined-fresh-inactive-admission-only');const queued=f.raw('SELECT * FROM privacy_serving_jobs WHERE subject_id=?',ID);
   expect(kind+' first source slice retains a genuine original waiting job without provider or erasure',queued?.state==='waiting_role'&&queued.last_attempt_at===null&&f.measurements.at(-1).http===0&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',ID)&&!f.raw('SELECT 1 FROM privacy_restore_replay WHERE operation_id=?',queued.operation_id),{queued,measurements:f.measurements});
   const originalAdmission=JSON.stringify({operation_id:queued?.operation_id,request_digest:queued?.request_digest,subject_generation:queued?.subject_generation,original_account_incarnation:queued?.original_account_incarnation,retain_until:queued?.retain_until});
   clock+=121;await f.job('combined-original-inactive-queued-terminal');job=f.raw('SELECT * FROM privacy_serving_jobs WHERE subject_id=?',ID);
   expect(kind+' next source slice consumes exactly the original proof and fixed retention',JSON.stringify({operation_id:job?.operation_id,request_digest:job?.request_digest,subject_generation:job?.subject_generation,original_account_incarnation:job?.original_account_incarnation,retain_until:job?.retain_until})===originalAdmission,{queued,job});
  }else{
   f.inventoryUnavailable=true;const admitted=await request(f,cookie);f.inventoryUnavailable=false;expect(kind+' original authenticated erasure accepted',admitted.response.status===202,admitted.body);
   job=await finish(f);
  }
  const known=['directory_only','webhook_only','combined_known','combined_inactive'].includes(kind),holds=f.rows("SELECT operation_id,state,hold_reason FROM privacy_serving_jobs ORDER BY operation_id");
  expect(kind+(known?' combined source erasure completes':' conservative boundary preserves original account custody'),known?job?.state==='complete':job?.state!=='complete'&&!!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',ID),{job:job?.state,hold:job?.hold_reason,holds});
  if(kind==='combined_unknown')expect(kind+' original uncertain role effect remains unknown',f.raw('SELECT state FROM role_settlements WHERE id=?','9'.repeat(32))?.state==='unknown');
  if(known){
   const hidden=f.raw("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'")?.value??'{}';expect(kind+' actual terminal eraser removes own suppression',!Object.hasOwn(JSON.parse(hidden),ID),hidden);
   if(kind!=='webhook_only')expect(kind+' another account suppression is preserved',Object.hasOwn(JSON.parse(hidden),OTHER));
   expect(kind+' actual terminal eraser removes own webhook actor/birth/G',f.rows("SELECT value FROM site_settings WHERE key GLOB 'newsWebhook:*'").every(row=>!row.value.includes(ID)&&JSON.parse(row.value).actor===null&&JSON.parse(row.value).birth===null&&JSON.parse(row.value).generation===null));
  }
  expect(kind+' preserves every original schema object',JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))===sourceSchema);
  if(kind==='ambiguous_note')expect(kind+' strict unstructured-reference gate is unchanged',f.raw("SELECT value FROM site_settings WHERE key='unknown196'")?.value.includes(ID)&&job?.hold_reason==='native_current_or_reference_unconfirmed');
  if(kind==='malformed_visibility')expect(kind+' malformed registered map remains unchanged',f.raw("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'")?.value===JSON.stringify({[ID]:'not-an-incarnation'}));
  if(kind==='scoped_batch_failure')expect(kind+' failed last scoped plan rolls earlier map and actor projections back atomically',Object.hasOwn(JSON.parse(f.raw("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").value),ID)&&f.rows("SELECT value FROM site_settings WHERE key GLOB 'newsWebhook:*'").every(r=>JSON.parse(r.value).actor===ID));
  if(kind==='combined_known'||kind==='combined_inactive')expect(kind+' actual configured cleanup removes only one known pointer with sending disabled',f.rows("SELECT state FROM privacy_provider_messages WHERE operation_id LIKE 'news_webhook_v1:%'").filter(r=>r.state==='removed').length===1&&f.http.filter(h=>h.method==='DELETE'&&h.url.includes('/webhooks/')).length===1);
  const maximum=Math.max(0,...f.measurements.map(r=>r.statements));expect(kind+' measured full original job remains within196 physical',(!known||f.measurements.some(r=>r.outcome.completed===1))&&maximum>0&&maximum<=196,{maximum,measurements:f.measurements});
  results.push({kind,copyStatus:copy.status,copyPhysical,jobState:job?.state,holdReason:job?.hold_reason,measurements:f.measurements,schemaUnchanged:JSON.stringify(f.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))===sourceSchema,roleUnknown:kind==='combined_unknown'?f.raw('SELECT state FROM role_settlements WHERE id=?','9'.repeat(32)):null});f.close();
 }
 const unchanged=[...witness.loaded].every(([file,original])=>Reflect.apply(witness.read,fs,[file]).equals(original));expect('all actual loaded production inputs unchanged through combined run',unchanged);
 const inputPins=[...witness.loaded].map(([file,value])=>({path:file,bytes:value.length,sha256:witness.sha(value)}));
 const evidence={schema:'master196-combined-original-native-erasure-and-export-v1',fixtureSetup:'privacy_native_erasure_mode_test.cjs unchanged prefix',fixtureSetupSHA256:witness.fixtureSHA256,assertions,passed:assertions-failures.length,failures,results,registry:names,sourceInputs:inputPins,sourceUnchanged:unchanged,realProvider:false,actualWorkerdCallback:false,whole700Measured:false,declaredErasureEnvelope:jobEnvelope,declaredWholeTarget:scheduledBudget.SCHEDULED_STATEMENT_TARGET};
 if(witness.result)fs.writeFileSync(witness.result,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 console.log('COMBINED196_NATIVE_RESULT '+JSON.stringify({...evidence,sourceInputs:inputPins.length}));if(failures.length)process.exitCode=1;
}
const m=new Module(__filename,module);m.filename=__filename;m.paths=module.paths;m._compile(setup.slice(0,setup.indexOf(marker))+'\n('+combined196.toString()+')().catch(e=>{console.error(e.stack);active?.close();process.exitCode=1;});',__filename);
