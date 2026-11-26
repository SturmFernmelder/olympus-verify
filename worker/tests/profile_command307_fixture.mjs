// Full current Worker entry, real local D1 and the real site cookie parser.
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {canonicalSiteSessionBody,INCARNATION_SESSION_PURPOSE} from '../src/privacy-site-session-incarnation.ts';
const OWNER='472099715253796864',OTHER='800000000000000002',BIRTH='b'.repeat(32),EPOCH='a'.repeat(32),SECRET='synthetic-registration-cookie';
const modes=['normal','unknown-landed','unknown-absent','conflict','concurrent','appeared','appeared-conflict','foreign','denied','left','banned','stale-session','csrf','stale-page'];
const ready=new Map();
const b64=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function setup(db,mode){
 const catalogue=JSON.parse(ADMISSION_EXPECTED_JSON),parts=[...catalogue.tables,...catalogue.indexes].map(row=>db.prepare(row.sql));
 parts.push(db.prepare(catalogue.slotSQL));while(parts.length)await db.batch(parts.splice(0,40));
 const at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
 await db.batch([
  db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(at),
  ...[OWNER,OTHER].flatMap(id=>[
   db.prepare('INSERT INTO members(discord_id,banned)VALUES(?1,?2)').bind(id,id===OWNER&&mode==='banned'?1:0),
   db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?1,?2,?3,?3,?3,?4,?5,?7,?6)')
     .bind(id,'Synthetic owner',at,mode==='left'?0:1,mode==='denied'?1:0,id===OWNER?BIRTH:'c'.repeat(32),mode==='stale-session'?2:1),
  ]),
 ]);
 const triggers=catalogue.triggers.map(row=>db.prepare(row.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 return {DB:createPrivacyWriteAdmissionDatabase(db,'writer','canonical',EPOCH),PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_LEGACY_HOSTS:'old.example',
  GUILD_ID:'236932545793490944',DISCORD_APP_ID:'1550176895671341076',DISCORD_BOT_TOKEN:'synthetic-profile-'+mode,
  COOKIE_SECRET:SECRET,SITE_ADMINS:OWNER+','+OTHER,PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH};
}
async function cookie(actor,version=1){
 const body=canonicalSiteSessionBody({u:actor,v:version,e:Math.floor(Date.now()/1000)+3600,g:null,n:actor===OWNER?BIRTH:'c'.repeat(32)});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('olympus-site/'+INCARNATION_SESSION_PURPOSE+'|'+SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return '__Host-olg='+body+'.'+b64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));
}
export default {async fetch(request,bindings){
 const mode=new URL(request.url).pathname.slice(1);if(!modes.includes(mode)||ready.has(mode))return new Response(null,{status:404});
 const env=await setup(bindings['DB_'+mode],mode);ready.set(mode,true);
 const auth=await cookie(mode==='foreign'?OTHER:OWNER),reads=[];
 const run=async(method='POST')=>{
  const headers={Cookie:auth,'Content-Type':'application/json','X-Olympus':mode==='stale-page'?'1':'2',Origin:'https://guild.example'};
  if(mode==='csrf')headers.Origin='https://other.example';
  const response=await worker.fetch(new Request('https://guild.example/api/admin/discord/profile-command',{
   method,headers,...(method==='POST'?{body:JSON.stringify({confirm:true})}:{})}),env,{waitUntil(){}});
  const result={status:response.status,body:await response.json()};reads.push(result);return result;
 };
 if(mode==='concurrent')await Promise.all([run(),run()]);else{await run();if(['normal','unknown-landed','unknown-absent'].includes(mode)){await run();await run('GET');}}
 const claim=await bindings['DB_'+mode].prepare("SELECT value FROM site_settings WHERE key='discordProfileCommandRegistration307'").first();
 return Response.json({mode,responses:reads,claim:claim?.value??null,actualLocalWorkerdD1:true});
}};
