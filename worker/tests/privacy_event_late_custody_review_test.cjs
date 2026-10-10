/** Independent producer-only late event/reminder response custody, actual sources/native SQLite.
 * Only Discord HTTP and response timing/failure are synthetic; original reader admission remains real.
 */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const index=load('index').default,reminders=load('community-event-reminders'),EVENT='E'.repeat(22),PUBLISH='P'.repeat(22);
 const canonicalFetch=globalThis.fetch;let providerMessages=new Map(),onEffect=null,onRead=null;
 globalThis.fetch=async(url,init={})=>{const p=new URL(url).pathname,method=init.method||'GET';
  if(p==='/api/v10/users/@me')return Response.json({id:BOT,bot:true});
  if(p===`/api/v10/channels/${CHANNEL}`)return Response.json({id:CHANNEL,guild_id:GUILD,type:0});
  if(p===`/api/v10/channels/${CHANNEL}/messages`&&method==='POST'){
   calls.push(method+' '+p);const body=JSON.parse(init.body),message={id:MSG,channel_id:CHANNEL,author:{id:BOT,bot:true},type:0,content:body.content,nonce:body.nonce,embeds:[],attachments:[]};providerMessages.set(MSG,message);await onEffect?.(method,message);return Response.json(message);
  }
  if(p===`/api/v10/channels/${CHANNEL}/messages/${MSG}`){calls.push(method+' '+p);const found=providerMessages.get(MSG);if(!found)return Response.json({code:10008},{status:404});
   if(method==='GET'){await onRead?.(found);return Response.json(found);}
   if(method==='PATCH'){found.content=JSON.parse(init.body).content;await onEffect?.(method,found);return Response.json(found);}
   if(method==='DELETE'){providerMessages.delete(MSG);await onEffect?.(method,found);return new Response(null,{status:204});}
  }
  return canonicalFetch(url,init);
 };
 function setup(){const t=reset();providerMessages=new Map();onEffect=null;onRead=null;
  db.prepare('UPDATE site_users SET in_server=1,denied=0 WHERE discord_id=?').run(ID);
  db.prepare('INSERT INTO members(discord_id,banned)VALUES(?,0)').run(ID);
  db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'member',?,'fixture')").run('probe name','Probe Name',ID,t);
  return{t,e:{...env(),PUBLIC_BASE_URL:'https://verify.example',SITE_ADMINS:OTHER,COMMUNITY_ORGANIZERS:ID,COMMUNITY_FEATURES:'events,attendance',INTROS_GUILD_ID:GUILD,INTROS_CHANNELS:`raid-signups=${CHANNEL}`,EVENT_DISCORD_DELIVERY:'on',EVENT_DISCORD_REMINDERS:'on',CHANNEL_NOTICES:''}};
 }
 async function call(e,method,route,body){const cookie=(await core.sessionCookie(e,ID,7)).split(';')[0],request=new Request('https://guild.example'+route,{method,headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let response,error;try{response=await index.fetch(request,e,{waitUntil(){}});}catch(e){error=e;}
  return{response,error,body:response?await response.json().catch(()=>null):null};
 }
 async function event(e,t){const r=await call(e,'POST','/api/community/events',{opId:EVENT,title:'Chosen raid title',details:'Private event detail',startsAt:new Date((t+1800)*1000).toISOString(),durationMin:120,capacity:2});if(r.response?.status!==200)throw Error('genuine event fixture refused '+JSON.stringify(r.body));return raw('SELECT * FROM community_events WHERE id=?',EVENT);}
 async function publish(e){const p=await call(e,'GET','/api/community/events/discord?eventId='+EVENT);if(p.response?.status!==200)throw Error('genuine preview refused');return call(e,'POST','/api/community/events/discord/publish',{eventId:EVENT,revision:p.body.revision,opId:PUBLISH,payloadHash:p.body.payloadHash});}
 const delivery=()=>raw('SELECT * FROM community_event_deliveries WHERE event_id=?',EVENT),reminder=()=>raw('SELECT * FROM community_event_reminders WHERE event_id=?',EVENT);
 async function erase(){const proof=await admission(),out=await eraser.continueServingErasure(env(),proof);if(out.state!=='complete'){console.log('genuine erasure fixture diagnostic',out);throw Error('genuine serving erasure not completed '+JSON.stringify(out));}return out;}
 const expectKey=(purpose,row)=>purpose+':'+EVENT+':'+row.op_id+':'+row.claim_nonce;
 for(const mode of['session revoked','new generation','erased','erased child disposed']){
  const{t,e}=setup(),parent=await event(e,t);let fired=0,completed,originalRow,legacyBefore;
  onEffect=async(method)=>{if(method!=='POST'||fired)return;fired++;onEffect=null;originalRow=delivery();
   if(mode==='session revoked')db.prepare('UPDATE site_users SET session_version=8 WHERE discord_id=?').run(ID);
   else if(mode==='new generation')db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'e'.repeat(32),t,t);
   else{db.prepare("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'event_publication',?,?,'unknown',1,?,?,?)").run('event_publication:'+PUBLISH,JSON.stringify([{id:OTHER,g:null}]),CHANNEL,parent.retain_until-31622400,t,parent.retain_until);legacyBefore=JSON.stringify(raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?','event_publication:'+PUBLISH));completed=await erase();if(mode==='erased child disposed')db.prepare('DELETE FROM community_event_deliveries WHERE event_id=?').run(EVENT);}
  };
  const r=await publish(e),row=delivery();check('publication '+mode+' hook runs after the one real native claim and POST',fired===1&&originalRow?.state==='claimed'&&calls.filter(x=>x==='POST /api/v10/channels/'+CHANNEL+'/messages').length===1);
  if(mode==='erased child disposed')check('disposed child is never recreated by a late reply',!row);
  else check('publication '+mode+' keeps known pointer with truthful held state',row?.message_id===MSG&&row.state==='unknown'&&row.retain_until===parent.retain_until);
  check('publication '+mode+' original protected response is refused',!!r.error||r.response?.status>=400);
  if(mode.startsWith('erased')){const adopted=raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?',expectKey('event_publication',originalRow));
   check('publication '+mode+' genuinely completed serving erasure',completed?.state==='complete'&&!raw('SELECT * FROM site_users WHERE discord_id=?',ID));
   check('publication '+mode+' upgrades exact adopted original operation only',adopted?.state==='known'&&adopted.message_id===MSG&&adopted.cleanup_requested===1&&adopted.retain_until===parent.retain_until&&adopted.subjects.includes(ID));
   check('publication '+mode+' cannot use ambiguous legacy client op custody',JSON.stringify(raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?','event_publication:'+PUBLISH))===legacyBefore);
   check('publication '+mode+' never restores erased actor/content/hash/session',!row||row.actor===null&&row.frozen_content===null&&row.payload_hash===null&&row.session_version===null&&row.session_expires===null);
  }
 }
 {const{t,e}=setup(),parent=await event(e,t);let originalRow,erased;
  const consent=await call(e,'POST','/api/community/events/reminder',{eventId:EVENT,revision:parent.revision,enabled:true});check('cron reminder has genuine consent',consent.response?.status===200&&reminder()?.state==='armed');
  onEffect=async method=>{if(method!=='POST')return;onEffect=null;originalRow=reminder();erased=await erase();};
  let result,error;try{result=await reminders.runEventReminders(e);}catch(e){error=e;}
  const row=reminder(),adopted=originalRow&&raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?',expectKey('event_reminder',originalRow));
  check('cron late reminder genuinely erased original serving account',originalRow?.state==='claimed'&&erased?.state==='complete');
  check('cron late known pointer retains exact adopted cleanup custody',adopted?.state==='known'&&adopted.message_id===MSG&&adopted.cleanup_requested===1&&adopted.retain_until===parent.retain_until);
  check('cron late reply preserves scrubbed actor/text and original fixed deadline',row?.message_id===MSG&&row.state==='unknown'&&row.actor===null&&row.frozen_content===null&&row.consent_version===null&&row.retain_until===parent.retain_until);
  check('cron late reply sends once and classifies current delivery as held',calls.filter(x=>x==='POST /api/v10/channels/'+CHANNEL+'/messages').length===1&&row?.state==='unknown');
 }
 // A proved GET can settle a held create, without giving a closed reader a fresh DTO.
 for(const purpose of['publication','reminder'])for(const mode of['session revoked','erased']){
  const{t,e}=setup(),parent=await event(e,t);onEffect=async method=>{if(method==='POST'){onEffect=null;throw Error('independent lost provider create reply');}};
  if(purpose==='publication')await publish(e);else{await call(e,'POST','/api/community/events/reminder',{eventId:EVENT,revision:parent.revision,enabled:true});await reminders.runEventReminders(e);}
  const originalRow=purpose==='publication'?delivery():reminder();check(purpose+' reconcile '+mode+' has real unknown create and surviving provider message',originalRow?.state==='unknown'&&providerMessages.has(MSG));
  let fired=0,completed;onRead=async()=>{if(fired)return;fired++;onRead=null;if(mode==='session revoked')db.prepare('UPDATE site_users SET session_version=8 WHERE discord_id=?').run(ID);else completed=await erase();};
  const r=await call(e,'POST',purpose==='publication'?'/api/community/events/discord/reconcile':'/api/community/events/reminder/reconcile',{eventId:EVENT,opId:originalRow.op_id,messageId:MSG}),stored=purpose==='publication'?delivery():reminder();
  check(purpose+' reconcile '+mode+' exact original pointer is retained as held',fired===1&&stored?.message_id===MSG&&stored.state==='unknown'&&stored.retain_until===parent.retain_until);
  check(purpose+' reconcile '+mode+' refuses original reader and never redispatches',!!r.error||r.response?.status>=400);check(purpose+' reconcile '+mode+' posts only the original create',calls.filter(x=>x==='POST /api/v10/channels/'+CHANNEL+'/messages').length===1);
  if(mode==='erased'){const adopted=raw('SELECT * FROM privacy_provider_messages WHERE operation_id=?',expectKey(purpose==='publication'?'event_publication':'event_reminder',originalRow));
   check(purpose+' reconcile erased exact adopted custody is known without resurrecting content',completed?.state==='complete'&&adopted?.state==='known'&&adopted.message_id===MSG&&adopted.cleanup_requested===1&&stored.actor===null&&stored.frozen_content===null);
  }
 }
 // A confirmed remote removal remains operational proof even when the reader closes in flight.
 for(const purpose of['publication','reminder'])for(const mode of['session revoked','erased']){
  const{t,e}=setup(),parent=await event(e,t);if(purpose==='publication'){const r=await publish(e);if(r.response?.status!==200)throw Error('normal publication fixture refused');}
  else{await call(e,'POST','/api/community/events/reminder',{eventId:EVENT,revision:parent.revision,enabled:true});if(await reminders.runEventReminders(e)!==1)throw Error('normal reminder fixture refused');}
  let fired=0,completed;onEffect=async method=>{if(method==='DELETE'&&!fired++){onEffect=null;if(mode==='session revoked')db.prepare('UPDATE site_users SET session_version=8 WHERE discord_id=?').run(ID);else completed=await erase();}};
  const row=purpose==='publication'?delivery():reminder(),r=await call(e,'POST',purpose==='publication'?'/api/community/events/discord/remove':'/api/community/events/reminder/remove',{eventId:EVENT,opId:purpose==='publication'?'R'.repeat(22):row.op_id});
  const stored=purpose==='publication'?delivery():reminder();
  check(purpose+' remove late reply really confirms a single remote DELETE',fired===1&&calls.filter(x=>x==='DELETE /api/v10/channels/'+CHANNEL+'/messages/'+MSG).length===1&&!providerMessages.has(MSG));
  check(purpose+' remove known proof survives original reader closure',stored?.state==='removed'&&stored.message_id===null&&stored.cleanup_requested===0);
  check(purpose+' remove retains original reader refusal and fixed retention',!!r.error||r.response?.status>=400);check(purpose+' remove never renews its deadline',stored?.retain_until===parent.retain_until);
  if(mode==='erased')check(purpose+' removed debt cannot reopen after known absence was already reconciled',completed?.state==='complete'&&rows("SELECT * FROM privacy_provider_messages WHERE purpose=? AND state='removed'",purpose==='publication'?'event_publication':'event_reminder').length===1&&stored?.actor===null&&stored.frozen_content===null);
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent event late-custody checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
