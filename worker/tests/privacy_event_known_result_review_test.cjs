/** Independent event acknowledgement after known native mutations, with original reader closure. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const index=load('index').default,EVENT='E'.repeat(22);let originalActorCookie;
 async function setup(){const t=reset();db.prepare('UPDATE site_users SET in_server=1,denied=0 WHERE discord_id=?').run(ID);db.prepare('INSERT INTO members(discord_id,banned)VALUES(?,0)').run(ID);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'member',?,'fixture')").run('probe name','Probe Name',ID,t);originalActorCookie=await originalCookie();return{t,e:{...env(),PUBLIC_BASE_URL:'https://verify.example',COMMUNITY_ORGANIZERS:ID,COMMUNITY_FEATURES:'events,attendance',CHANNEL_NOTICES:''}};}
 async function call(e,method,route,body){const cookie=originalActorCookie,request=new Request('https://guild.example'+route,{method,headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},body:JSON.stringify(body)});let response,error;try{response=await index.fetch(request,{...e,DB:native},{waitUntil(){}});}catch(e){error=e;}return{response,error,body:response?await response.json().catch(()=>null):null};}
 const input=t=>({opId:EVENT,title:'Original event private title',details:'Original event private detail',startsAt:new Date((t+1800)*1000).toISOString(),durationMin:120,capacity:2});
 const specs={create:{pattern:/INSERT INTO community_events\s*\(/,method:'POST',route:'/api/community/events',body:t=>input(t)},update:{pattern:/UPDATE community_events SET title/,method:'POST',route:'/api/community/events/update',body:()=>({eventId:EVENT,revision:1,title:'Known changed title'})},cancel:{pattern:/UPDATE community_events SET status = 'cancelled'/,method:'POST',route:'/api/community/events/cancel',body:()=>({eventId:EVENT,revision:1})},rsvp:{pattern:/INSERT INTO community_event_signups\s*\(/,method:'PUT',route:'/api/community/events/rsvp',body:()=>({eventId:EVENT,revision:0,status:'yes',character:'Chosen own character',raidRole:'tank'})}};
 async function prepare(kind){const s=await setup();if(kind!=='create'){const r=await call(s.e,'POST','/api/community/events',input(s.t));if(r.response?.status!==200)throw Error('genuine initial event creation failed '+r.response?.status+' '+JSON.stringify(r.body)+' '+r.error?.message);}return s;}
 function observe(e,pattern,after){let mutations=0,fired=0;hooks.afterBatch=async stmts=>{const primary=stmts.some(s=>pattern.test(s._sql));if(primary)mutations++;if(primary&&!fired){fired++;await after();}};return{e,mutations:()=>mutations,fired:()=>fired};}
 function saved(kind){const e=raw('SELECT * FROM community_events WHERE id=?',EVENT);return kind==='create'?e?.title==='Original event private title':kind==='update'?e?.title==='Known changed title'&&e.revision===2:kind==='cancel'?e?.status==='cancelled':raw('SELECT * FROM community_event_signups WHERE event_id=? AND discord_id=?',EVENT,ID)?.character_name==='Chosen own character';}
 for(const[kind,spec]of Object.entries(specs))for(const mode of['session revoked','new generation','standing denied']){
  const{t,e}=await prepare(kind),watch=observe(e,spec.pattern,async()=>{if(mode==='session revoked')await setupWrite('UPDATE site_users SET session_version=8 WHERE discord_id=?',ID);else if(mode==='standing denied')await setupWrite('UPDATE site_users SET denied=1 WHERE discord_id=?',ID);else await setupWrite('UPDATE privacy_subjects SET generation=?,revision=revision+1 WHERE subject_id=?','e'.repeat(32),ID);});
  const r=await call(watch.e,spec.method,spec.route,spec.body(t));
  check(kind+' '+mode+' has one real native mutation before original closure',watch.fired()===1&&watch.mutations()===1&&saved(kind));
  check(kind+' '+mode+(mode==='standing denied'?' keeps only a known durable response':' closes the original whole-request context after the durable mutation'),!r.error&&(mode==='standing denied'?r.response?.status===200&&r.body?.event===null&&r.body.hydration==='refused'&&Object.keys(r.body).sort().join(',')==='event,hydration':r.response?.status===503&&r.body?.error==='original_serving_held'&&Object.keys(r.body).join(',')==='error'));
  check(kind+' '+mode+' never returns protected title, details, signup or identity',!!r.body&&!JSON.stringify(r.body).includes('Original event private')&&!JSON.stringify(r.body).includes('Chosen own character')&&!JSON.stringify(r.body).includes(ID));
 }
 for(const[kind,spec]of Object.entries(specs)){
  const{t,e}=await prepare(kind),watch=observe(e,spec.pattern,async()=>{throw Error('independent lost committed primary event result');});const r=await call(watch.e,spec.method,spec.route,spec.body(t));
  check(kind+' lost primary really committed once with no retry',watch.fired()===1&&watch.mutations()===1&&saved(kind));
  check(kind+' lost primary is never converted to a known-success acknowledgement',!!r.error||r.response?.status>=400);
 }
 {const{t,e}=await prepare('create'),before=snapshot();hooks.beforeStatement=sql=>{if(sql.includes("'community.event_created'"))throw Error('independent transactional audit failure');};const r=await call(e,'POST','/api/community/events',input(t));hooks.beforeStatement=null;
  check('primary event transaction audit failure remains rolled back without a false known receipt',snapshot()===before&&(!!r.error||r.response?.status>=400));
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent event known-result checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
