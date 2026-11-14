// Actual index and response factories. Synthetic D1/signatures only; no provider or native actions.
import worker from '../src/index.ts';
import * as bot from '../src/bot-response280.ts';
import {apiJson} from '../src/site-core.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH='a'.repeat(32),APP='800000000000000002',GUILD='800000000000000001';
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,
 DISCORD_APP_ID:APP,DISCORD_CLIENT_SECRET:'header280-synthetic-client',DISCORD_BOT_TOKEN:'header280-synthetic-bot',
 WATCHER_TOKEN:'header280-synthetic-watcher-only-xxxx',VERIFY_SECRET:'header280-synthetic-secret',COOKIE_SECRET:'header280-synthetic-cookie',SITE_ADMINS:'472099715253796864',
 PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',
 ROLE_GUILD_MEMBER:'800000000000000010',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',
 CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'header280-fixture',timestamp:'2026-11-12T00:00:00Z'},
 ASSETS:{async fetch(){throw Error('No asset work expected');}}};
const expected=()=>bot.botResponseHeaders280();
const botHeaders=response=>[...expected()].every(([name,value])=>response.headers.get(name)===value);
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function setup(db){
 const c=JSON.parse(ADMISSION_EXPECTED_JSON),statements=[...c.tables,...c.indexes].map(x=>db.prepare(x.sql));
 statements.push(db.prepare(c.slotSQL));
 while(statements.length)await db.batch(statements.splice(0,40));
 await db.batch([db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,?1,?2,'serving',0,'','',0,0)").bind(ADMISSION_PROTOCOL,EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',CAST(strftime('%s','now') AS INTEGER))")]);
 const triggers=c.triggers.map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
}
async function run(bindings){
 await setup(bindings.DB);const raw=bindings.DB,env={...config,DB:raw},cases=[],deferred=[];
 const check=(name,pass,observed)=>cases.push({name,pass:!!pass,...observed?{observed}:{}});
 const ctx={waitUntil(work){deferred.push(work);}};
 const call=(path,options={},override=env)=>worker.fetch(new Request((path.startsWith('/api/')?'https://guild.example':'https://verify.example')+path,options),override,ctx);
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),pub=hex(await crypto.subtle.exportKey('raw',pair.publicKey));env.DISCORD_PUBLIC_KEY=pub;
 const signed=async value=>{const body=JSON.stringify(value),timestamp=String(Math.floor(Date.now()/1000));
  const signature=hex(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body)));
  return call('/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp},body});};
 let r=await call('/interactions',{method:'POST',body:'{}'});const plain=await r.text();
 check('actual index plain signature refusal keeps401 and exact body',r.status===401&&plain==='bad signature',{status:r.status,body:plain});
 check('actual index plain refusal receives common bot headers',botHeaders(r),Object.fromEntries(r.headers));
 r=await signed({type:1,application_id:APP});check('signed ping keeps response and existing JSON headers',r.status===200&&(await r.json()).type===1&&botHeaders(r));
 r=await signed({type:2,application_id:APP,guild_id:'800000000000000999',id:'800000000000001001',data:{name:'verify'}});
 check('wrong guild empty refusal keeps204 and empty body',r.status===204&&(await r.text())==='',{status:r.status});
 check('actual index empty response receives common bot headers without CSP',botHeaders(r)&&!r.headers.has('Content-Security-Policy'),Object.fromEntries(r.headers));
 const replayID='800000000000001002',replayBody=JSON.stringify({type:4,data:{content:'Synthetic cached reply',flags:64}});
 const writer=createPrivacyWriteAdmissionDatabase(raw,'writer','canonical',EPOCH);
 await writer.prepare('INSERT INTO seen_interactions(id,seen_at,response)VALUES(?1,CAST(strftime(\'%s\',\'now\')AS INTEGER),?2)').bind(replayID,JSON.stringify({status:200,body:replayBody})).run();
 const image=async()=>JSON.stringify({seen:(await raw.prepare('SELECT * FROM seen_interactions ORDER BY id').all()).results,audit:(await raw.prepare('SELECT * FROM audit ORDER BY id').all()).results});
 const before=await image(),beforeDeferred=deferred.length;
 r=await signed({type:2,application_id:APP,guild_id:GUILD,id:replayID,data:{name:'verify'}});const replay=await r.text();
 check('actual index cached replay preserves body/status and never reruns effect',r.status===200&&replay===replayBody&&before===await image()&&deferred.length===beforeDeferred,{status:r.status,body:replay});
 check('cached replay receives common bot headers without changing stored bytes',botHeaders(r)&&before===await image(),Object.fromEntries(r.headers));
 for(let i=0;i<20;i++){const reply=await call('/linked-role',{headers:{'CF-Connecting-IP':'192.0.2.81'}});if(reply.status!==200)throw Error('OAuth control request'+i+' status'+reply.status);}
 r=await call('/linked-role',{headers:{'CF-Connecting-IP':'192.0.2.81'}});const limited=await r.json();
 check('actual OAuth address limit keeps429 body and truthful Retry-After',r.status===429&&limited.error==='rate_limited'&&Number(r.headers.get('Retry-After'))>=1&&Number(r.headers.get('Retry-After'))<=60,{status:r.status,retryAfter:r.headers.get('Retry-After')});
 check('actual OAuth429 receives common bot headers without inert-document CSP',botHeaders(r)&&!r.headers.has('Content-Security-Policy'),Object.fromEntries(r.headers));
 for(const [method,path]of [['GET','/api/admin/users/800000000000000302/decision-target'],['POST','/api/admin/users/800000000000000302/deny']]){
  const before=await image();r=await call(path,{method,headers:{Origin:'https://guild.example'},...method==='POST'?{body:'{}'}:{}});const body=await r.json();
  check('anonymous decision '+method+' keeps signed_out401 without writes/defer',r.status===401&&body.error==='signed_out'&&before===await image()&&deferred.length===0,{status:r.status});
  const site=apiJson({}).headers;
  check('anonymous decision '+method+' uses existing site security header policy',['Cache-Control','Referrer-Policy','Cross-Origin-Opener-Policy','Permissions-Policy','X-Content-Type-Options'].every(h=>r.headers.get(h)===site.get(h)),Object.fromEntries(r.headers));
 }
 r=await call('/api/me');const site=apiJson({}).headers;
 check('ordinary anonymous member API retains its existing site delivery policy',r.status===401&&['Cache-Control','Referrer-Policy','Cross-Origin-Opener-Policy','Permissions-Policy'].every(h=>r.headers.get(h)===site.get(h)),{status:r.status,headers:Object.fromEntries(r.headers)});
 const wrap=bot['botResponse280'];check('header-only wrapper is available',typeof wrap==='function');
 if(typeof wrap==='function'){
  const h=new Headers({'Content-Type':'text/plain; charset=utf-8','Location':'https://fixture.invalid/next','Access-Control-Allow-Origin':'https://fixture.invalid','Vary':'Origin','Content-Security-Policy':"default-src 'self'; form-action 'self'",'Retry-After':'42'});
  h.append('Set-Cookie','first=one; HttpOnly; Secure');h.append('Set-Cookie','second=two; SameSite=Lax');
  const bytes=new TextEncoder().encode('Synthetic stream \u03bb'),original=new Response(new ReadableStream({start(c){c.enqueue(bytes);c.close();}}),{status:307,statusText:'Original redirect',headers:h});
  const cookies=original.headers.getSetCookie(),wrapped=wrap(original);
  check('wrapper preserves original stream status/statusText/content type',wrapped.status===307&&wrapped.statusText==='Original redirect'&&(await wrapped.text())==='Synthetic stream \u03bb'&&wrapped.headers.get('Content-Type')===h.get('Content-Type'));
  check('wrapper preserves separate cookies Location CORS Vary CSP and Retry-After',JSON.stringify(wrapped.headers.getSetCookie())===JSON.stringify(cookies)&&['Location','Access-Control-Allow-Origin','Vary','Content-Security-Policy','Retry-After'].every(k=>wrapped.headers.get(k)===h.get(k)));
  const preflight=wrap(new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'https://fixture.invalid','Access-Control-Allow-Methods':'POST, OPTIONS','Allow':'POST, OPTIONS'}}));
  check('wrapper preserves empty CORS/preflight and adds no generic CSP',preflight.status===204&&(await preflight.text())===''&&preflight.headers.get('Access-Control-Allow-Methods')==='POST, OPTIONS'&&preflight.headers.get('Allow')==='POST, OPTIONS'&&!preflight.headers.has('Content-Security-Policy'));
  const form=wrap(new Response('<form method="post"></form>',{headers:{'Content-Type':'text/html'}}));
  check('wrapper never invents inert CSP for forms or changes content',!form.headers.has('Content-Security-Policy')&&(await form.text())==='<form method="post"></form>');
  const oauth=bot.oauthResultPage280('Fixture','Body',409,{'Set-Cookie':'gone=; Max-Age=0; Secure'}),csp=oauth.headers.get('Content-Security-Policy');
  const oauthWrapped=wrap(oauth);check('existing OAuth document CSP and cookie remain exact',oauthWrapped.headers.get('Content-Security-Policy')===csp&&oauthWrapped.headers.get('Set-Cookie')==='gone=; Max-Age=0; Secure'&&oauthWrapped.status===409);
 }
 await Promise.allSettled(deferred);
 check('focused index cases queue no deferred provider/effect work',deferred.length===0);
 return Response.json({schema:'bot-headers-successor280-actual-index-v1',checks:cases.length,ok:cases.every(x=>x.pass),cases,providerCalls:0,nativeActions:0});
}
export default {async fetch(request,bindings){try{return await run(bindings);}catch(error){return Response.json({fixtureError:String(error?.stack??error)},{status:500});}}};
