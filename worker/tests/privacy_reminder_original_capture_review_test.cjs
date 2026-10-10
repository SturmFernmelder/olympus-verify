/** Independent original cron selection consumption before the one provider effect; actual SQLite. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const index=load('index').default,reminders=load('community-event-reminders'),EVENT='E'.repeat(22),canonicalFetch=globalThis.fetch;
 let prerequisite=null,posted=0;
 globalThis.fetch=async(url,init={})=>{const p=new URL(url).pathname,method=init.method||'GET';
  if(p==='/api/v10/users/@me')return Response.json({id:BOT,bot:true});
  if(p===`/api/v10/channels/${CHANNEL}`){await prerequisite?.();return Response.json({id:CHANNEL,guild_id:GUILD,type:0});}
  if(p===`/api/v10/channels/${CHANNEL}/messages`&&method==='POST'){posted++;calls.push(method+' '+p);const body=JSON.parse(init.body);return Response.json({id:MSG,channel_id:CHANNEL,author:{id:BOT,bot:true},type:0,content:body.content,nonce:body.nonce,embeds:[],attachments:[]});}
  return canonicalFetch(url,init);
 };
 async function call(e,route,body){const cookie=(await core.sessionCookie(e,ID,7)).split(';')[0],request=new Request('https://guild.example'+route,{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},body:JSON.stringify(body)});const r=await index.fetch(request,e,{waitUntil(){}});if(r.status!==200)throw Error('genuine reminder fixture refused '+r.status+' '+await r.text());return r.json();}
 async function setup(active){const t=reset();posted=0;prerequisite=null;db.prepare('UPDATE site_users SET in_server=1,denied=0 WHERE discord_id=?').run(ID);db.prepare('INSERT INTO members(discord_id,banned)VALUES(?,0)').run(ID);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'member',?,'fixture')").run('probe name','Probe Name',ID,t);
  if(active)db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)").run(ID,'e'.repeat(32),t,t);
  const e={...env(),PUBLIC_BASE_URL:'https://verify.example',SITE_ADMINS:OTHER,COMMUNITY_ORGANIZERS:ID,COMMUNITY_FEATURES:'events,attendance',INTROS_GUILD_ID:GUILD,INTROS_CHANNELS:`raid-signups=${CHANNEL}`,EVENT_DISCORD_DELIVERY:'on',EVENT_DISCORD_REMINDERS:'on',CHANNEL_NOTICES:''};
  await call(e,'/api/community/events',{opId:EVENT,title:'Chosen raid title',details:'Original event details',startsAt:new Date((t+1800)*1000).toISOString(),durationMin:120,capacity:2});
  const event=raw('SELECT * FROM community_events WHERE id=?',EVENT);await call(e,'/api/community/events/reminder',{eventId:EVENT,revision:event.revision,enabled:true});return{t,e,event,row:raw('SELECT * FROM community_event_reminders WHERE event_id=?',EVENT)};
 }
 for(const mode of ['absence to actual OAuth active','active generation replaced','active generation retiring','consent version replaced','frozen payload replaced','event revision replaced','original op replaced']){
  const{t,e,event,row}=await setup(mode!=='absence to actual OAuth active');let fired=0;
  prerequisite=async()=>{if(fired++)return;prerequisite=null;
   if(mode==='absence to actual OAuth active')await authority.admittedPrivacyOAuthWrite(e,ID,null,t+1,e.DB.prepare('UPDATE site_users SET last_login=?2 WHERE discord_id=?1 RETURNING session_version').bind(ID,t));
   else if(mode==='active generation replaced')db.prepare('UPDATE privacy_subjects SET generation=?,revision=revision+1 WHERE subject_id=?').run('f'.repeat(32),ID);
   else if(mode==='active generation retiring')db.prepare("UPDATE privacy_subjects SET state='retiring',revision=revision+1 WHERE subject_id=?").run(ID);
   else if(mode==='consent version replaced'){db.prepare('UPDATE site_users SET session_version=8 WHERE discord_id=?').run(ID);db.prepare('UPDATE community_event_reminders SET consent_version=8 WHERE event_id=?').run(EVENT);}
   else if(mode==='frozen payload replaced')db.prepare('UPDATE community_event_reminders SET frozen_content=? WHERE event_id=?').run('A replacement payload with the same reused op',EVENT);
   else if(mode==='event revision replaced'){db.prepare('UPDATE community_events SET revision=revision+1 WHERE id=?').run(EVENT);db.prepare('UPDATE community_event_reminders SET event_revision=event_revision+1 WHERE event_id=?').run(EVENT);}
   else db.prepare('UPDATE community_event_reminders SET op_id=? WHERE event_id=?').run('R'.repeat(22),EVENT);
  };
  let result,error;try{result=await reminders.runEventReminders(e);}catch(e){error=e;}
  check(mode+' race occurred within original prerequisite await',fired===1);
  check(mode+' consuming original selection refuses every provider POST',posted===0&&result!==1);
  check(mode+' cannot create a new claimed/posted pointer after original authority closes',raw('SELECT * FROM community_event_reminders WHERE event_id=?',EVENT)?.state==='armed'&&raw('SELECT message_id FROM community_event_reminders WHERE event_id=?',EVENT)?.message_id===null);
 }
 // The original generation also participates in the last read after the claim's await.
 {const{e}=await setup(true);let fired=false;hooks.beforeStatement=sql=>{if(!fired&&sql.startsWith('SELECT 1 AS ok FROM community_event_reminders')){fired=true;db.prepare("UPDATE privacy_subjects SET state='retiring',revision=revision+1 WHERE subject_id=?").run(ID);}};
  const result=await reminders.runEventReminders(e);hooks.beforeStatement=null;
  check('last original proof consumes generation immediately before dispatch',fired&&posted===0&&result===0);
  check('failed final proof cancels original claimed row without a provider effect',raw('SELECT state FROM community_event_reminders WHERE event_id=?',EVENT)?.state==='cancelled');
 }
 for(const active of [false,true]){const{e}=await setup(active),result=await reminders.runEventReminders(e),row=raw('SELECT * FROM community_event_reminders WHERE event_id=?',EVENT);
  check('unchanged original '+(active?'active generation':'captured absence')+' remains genuinely executable once',result===1&&posted===1&&row?.state==='posted'&&row.message_id===MSG);
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent reminder original-capture checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
