// Actual index/OAuth/Native writer. All actors, receipts and mail text are synthetic.
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
const OWNER='472099715253796864',STAFF='800000000000000301',MEMBER='800000000000000302';
const BASE='https://guild.example',EPOCH='a'.repeat(32);
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:'800000000000000001',GUILD_ID:'800000000000000001',
 DISCORD_APP_ID:'800000000000000002',DISCORD_CLIENT_SECRET:'verification280-client',DISCORD_BOT_TOKEN:'verification280-bot',
 WATCHER_TOKEN:'security280-watcher-credential-only-xxxx',VERIFY_SECRET:'verification280-secret',COOKIE_SECRET:'verification280-cookie',SITE_ADMINS:OWNER+','+STAFF,
 PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',
 ROLE_GUILD_MEMBER:'800000000000000010',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',
 CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'receipt-notes280-fixture',timestamp:'2026-11-12T00:00:00Z'},
 ASSETS:{async fetch(){return new Response('fixture static asset');}}};
function cookieOf(response,name){for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0];if(first.startsWith(name+'='))return first;}return null;}
async function setup(db,layout){
 const catalogue=layout==='recorded-live-pre-seal-20261017'?JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile:JSON.parse(ADMISSION_EXPECTED_JSON);
 const statements=[...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql));statements.push(db.prepare(catalogue.slotSQL));
 let installed=0;
 while(statements.length){const chunk=statements.splice(0,40);try{await db.batch(chunk);}catch(error){throw Error('fixture schema batch starting'+installed+': '+String(error));}installed+=chunk.length;}
 try{
 await db.batch([db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,?1,?2,'serving',0,'','',0,0)").bind(ADMISSION_PROTOCOL,EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',CAST(strftime('%s','now') AS INTEGER))")]);
 }catch(error){throw Error('fixture control seeds: '+String(error));}
 const triggers=catalogue.triggers.map(x=>db.prepare(x.sql));installed=0;
 while(triggers.length){const chunk=triggers.splice(0,40);try{await db.batch(chunk);}catch(error){throw Error('fixture trigger batch starting'+installed+': '+String(error));}installed+=chunk.length;}
}

async function run(request,bindings){
 const layout=new URL(request.url).searchParams.get('layout')==='recorded-live-pre-seal-20261017'?'recorded-live-pre-seal-20261017':'canonical';
 await setup(bindings.DB,layout);
 const raw=bindings.DB,env={...config,PRIVACY_WRITE_ADMISSION_LAYOUT:layout,DB:raw},cases=[];
 const check=(name,pass,observed)=>cases.push({name,pass:!!pass,...(observed?{observed}:{})});
 const call=(method,path,{cookie,headers={},body}={})=>worker.fetch(new Request((path.startsWith('/api/')?BASE:'https://verify.example')+path,{method,headers:{Origin:BASE,'X-Olympus':'2',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(){throw Error('unexpected deferred work');}});
 const login=async id=>{const first=await worker.fetch(new Request(BASE+'/auth/login'),env,{waitUntil(){}}),state=new URL(first.headers.get('Location')).searchParams.get('state');const second=await worker.fetch(new Request(BASE+'/auth/callback?code=code-'+id+'&state='+encodeURIComponent(state),{headers:{Cookie:cookieOf(first,'__Host-olg_state')}}),env,{waitUntil(){}});if(second.status!==303)throw Error('fixture OAuth '+second.status);return cookieOf(second,'__Host-olg');};
 const owner=await login(OWNER),member=await login(MEMBER),ghost='800000000000000399';
 const writer=createPrivacyWriteAdmissionDatabase(raw,'writer',layout,EPOCH);await writer.prepare("INSERT INTO site_friends(owner_id,friend_kind,friend_key,friend_label,note,created_at)VALUES(?1,'discord',?2,'Synthetic absent account','Synthetic note',CAST(strftime('%s','now') AS INTEGER))").bind(OWNER,ghost).run();
 const image=async()=>JSON.stringify({audit:(await raw.prepare('SELECT * FROM audit ORDER BY id').all()).results,friends:(await raw.prepare('SELECT * FROM site_friends ORDER BY owner_id,friend_key').all()).results});
 let before=await image(),r=await call('POST','/api/admin/users/'+ghost+'/mentions',{cookie:owner,headers:{'X-Olympus':'1'},body:{}});
 check('outdated admin page is refused before any write',r.status===409&&before===await image(),{status:r.status,error:(await r.clone().json().catch(()=>({}))).error});
 r=await call('POST','/api/admin/users/'+ghost+'/mentions',{cookie:owner,body:{}});check('current owner page can still perform its deliberate authorized write',r.status===200&&(await raw.prepare('SELECT COUNT(*) n FROM site_friends WHERE friend_key=?1').bind(ghost).first()).n===0,{status:r.status});
 before=await image();r=await call('POST','/api/admin/users/'+ghost+'/mentions',{cookie:owner,headers:{Origin:'https://other.invalid'},body:{}});
 check('foreign Origin still cannot mutate admin data',r.status===403&&before===await image(),{status:r.status});
 r=await call('POST','/api/admin/users/'+ghost+'/mentions',{cookie:member,body:{}});
 check('non-admin retains an explicit forbidden response',r.status===403,{status:r.status});
 for(const method of ['GET','POST']){
  const path='/api/admin/users/'+ghost+(method==='GET'?'/decision-target':'/deny');
  const original=await image();r=await call(method,path,{cookie:member,...(method==='POST'?{body:{}}:{})});
  check('signed-in non-admin decision '+method+' is forbidden without mutations',r.status===403&&original===await image(),{status:r.status,error:(await r.clone().json().catch(()=>({}))).error});
  r=await call(method,path,method==='POST'?{body:{}}:{});
  check('anonymous decision '+method+' asks for sign-in without mutations',r.status===401&&original===await image(),{status:r.status,error:(await r.clone().json().catch(()=>({}))).error});
 }
 before=await image();r=await call('GET','/api/admin/users/'+MEMBER+'/decision-target?route=delete',{cookie:owner});
 const target=await r.clone().json().catch(()=>({}));
 check('original current administrator can read the protected decision target',r.status===200&&typeof target.targetToken==='string'&&before===await image(),{status:r.status,available:target.decisionAvailable});
 r=await call('POST','/api/admin/users/'+MEMBER+'/deny',{cookie:owner,body:{}});
 check('administrator without original review token still cannot decide',r.status===409&&before===await image(),{status:r.status,error:(await r.clone().json().catch(()=>({}))).error});
 r=await call('GET','/api/admin/overview',{cookie:owner});check('admin reads do not require the write page token',r.status===200,{status:r.status});
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
 const pub=hex(await crypto.subtle.exportKey('raw',pair.publicKey));
 const interaction=async app=>{const e={...env,DISCORD_PUBLIC_KEY:pub};if(app===undefined)delete e.DISCORD_APP_ID;else e.DISCORD_APP_ID=app;
  const body=JSON.stringify({type:1,application_id:'800000000000000002'}),timestamp=String(Math.floor(Date.now()/1000)),signature=hex(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body)));
  return worker.fetch(new Request('https://verify.example/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp},body}),e,{waitUntil(){throw Error('ping must not defer');}});};
 for(const [label,app]of [['missing',undefined],['malformed','not-an-app'],['empty','']]){const response=await interaction(app);check(label+' configured app ID fails closed',response.status===503,{status:response.status});}
 r=await interaction('800000000000000003');check('wrong signed application stays refused',r.status===400,{status:r.status});
 r=await interaction('800000000000000002');check('valid signed application ping remains available',r.status===200&&(await r.json()).type===1,{status:r.status});
 check('actual index ping has no-store JSON headers',r.headers.get('Cache-Control')==='no-store, no-transform'&&r.headers.get('X-Content-Type-Options')==='nosniff');
 before=await image();r=await call('GET','/linked-role');check('Battle.net remains OFF with no new audit or redirect',r.status===200&&(await r.text()).includes('Battle.net linking is switched off')&&!r.headers.has('Location')&&before===await image(),{status:r.status});
 before=await image();r=await call('GET','/admin/backfill-roles?apply=1',{headers:{Authorization:'Bearer security280-watcher-credential-only-xxxx'}});
 check('old GET apply URL cannot start an apply pass',r.status===405&&before===await image()&&r.headers.get('Allow')==='GET, POST',{status:r.status});
 r=await call('GET','/admin/backfill-roles?limit=1',{headers:{Authorization:'Bearer security280-watcher-credential-only-xxxx'}});let body=await r.json().catch(()=>({}));check('GET remains read-only dry-run',r.status===200&&body.apply===false,{status:r.status});
 before=await image();r=await call('POST','/admin/backfill-roles?limit=1',{headers:{Authorization:'Bearer security280-watcher-credential-only-xxxx'}});check('POST requires explicit apply confirmation',r.status===400&&before===await image(),{status:r.status});
 r=await call('POST','/admin/backfill-roles?apply=1&limit=1',{headers:{Authorization:'Bearer security280-watcher-credential-only-xxxx'}});body=await r.json().catch(()=>({}));check('explicit authenticated POST reaches the existing bounded apply writer',r.status===200&&body.apply===true&&body.selected===0,{status:r.status,selected:body.selected});
 r=await call('POST','/admin/backfill-roles?apply=1');check('POST apply retains watcher authentication',r.status===401,{status:r.status});
 const searchPath='/api/search?q=PrivacyFixture';
 const searchImage=await image();
 r=await call('GET',searchPath,{cookie:member});const ordinarySearch=await r.json();
 check('ordinary server member can still search actual Discord members',r.status===200&&ordinarySearch.results.length===2,{status:r.status});
 check('ordinary search does not disclose site-account presence for known or absent account',ordinarySearch.results.every(row=>!Object.hasOwn(row,'onSite')),{returnedFields:ordinarySearch.results.map(row=>Object.keys(row).sort())});
 check('ordinary search explicitly withholds the site-profile filter',ordinarySearch.siteProfilesVisible===false);
 r=await call('GET',searchPath,{cookie:owner});const adminSearch=await r.json();
 check('administrator retains the truthful existing site-profile filter',r.status===200&&adminSearch.siteProfilesVisible===true&&adminSearch.results.find(row=>row.id===OWNER)?.onSite===true&&adminSearch.results.find(row=>row.id===ghost)?.onSite===false,{status:r.status});
 r=await call('GET',searchPath);check('anonymous callers cannot use member search',r.status===401,{status:r.status});
 check('member searches add no audit or friend mutation',searchImage===await image());
 const censusEnv={...env,COMMUNITY_FEATURES:'census'};
 const censusCookie=await login(STAFF);
 for(const [id,name]of [[OWNER,'Census Owner'],[MEMBER,'Census Member'],[STAFF,'Census Other']]){
  await writer.prepare('INSERT INTO members(discord_id)VALUES(?1)ON CONFLICT(discord_id)DO NOTHING').bind(id).run();
  await writer.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at)VALUES(?1,?2,?3,'member',CAST(strftime('%s','now') AS INTEGER))").bind(name.toLowerCase(),name,id).run();
 }
 const censusBody={format:'olympus-census-v1',addonVersion:'fixture-1',realmGroup:'Fictional Realm',faction:'Alliance',observedAt:Math.floor(Date.now()/1000),source:'community-observation',membershipProof:false,guilds:[]};
 const census=token=>worker.fetch(new Request(BASE+'/api/community/census/preview',{method:'POST',headers:{Origin:BASE,'X-Olympus':'2',Cookie:token,'Content-Type':'application/json'},body:JSON.stringify(censusBody)}),censusEnv,{waitUntil(){throw Error('unexpected census work');}});
 const censusImage=await image(),first=[];for(let i=0;i<12;i++)first.push((await census(owner)).status);
 check('one census account has its own six-preview allowance',first.slice(0,6).every(x=>x===200)&&first.slice(6).every(x=>x===429),{statuses:first});
 const second=[];for(let i=0;i<6;i++)second.push((await census(member)).status);
 check('one account cannot consume the second account census allowance',second.every(x=>x===200),{statuses:second});
 const third=await census(censusCookie);
 check('census keeps the unchanged total twelve-preview safety cap',third.status===429&&Number(third.headers.get('Retry-After'))>0,{status:third.status,retryAfter:third.headers.get('Retry-After')});
 check('census previews never write their source payload or provider work',censusImage===await image());
 check('Native control remains closed in the exact original epoch',(await raw.prepare("SELECT COUNT(*) n FROM privacy_write_admission WHERE active=0 AND nonce='' AND purpose='' AND epoch=?1").bind(EPOCH).first()).n===1);
 return Response.json({schema:'security280-real-index-v1',actualLocalWorkerdD1:true,actualIndexOAuth:true,layout,ok:cases.every(x=>x.pass),checks:cases.length,cases});
}
export default {async fetch(request,bindings){try{return await run(request,bindings);}catch(error){return Response.json({fixtureError:String(error?.stack??error),cause:String(error?.cause?.message??'')},{status:500});}}};
