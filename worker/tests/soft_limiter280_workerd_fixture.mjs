import * as core from '../src/site-core.ts';
import {linkAddressKey} from '../src/link.ts';
import * as forms from '../src/policy-form-core.ts';
import {FormError} from '../src/policy-form-core.ts';
import {privacyAccessRefusal} from '../src/privacy-access.ts';
import {handlePrivacyIntake} from '../src/community-privacy-intake.ts';
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const epoch='a'.repeat(32),cases=[];
const check=(name,pass,observed)=>cases.push({name,pass:!!pass,observed});
const consume=(...args)=>Reflect.get(core,'consumeRateLimit280')?.(...args)??{limited:core.rateLimited(...args),retryAfterSeconds:null};
const address=async(p,ip,max,window,mode='full')=>Reflect.get(core,'consumeAddressRateLimit280')?.(p,ip,max,window,mode)??consume(p+':'+(mode==='link64'?linkAddressKey(ip):ip),max,window);
async function unit(){
 const original=Date.now;let clock=2000000000;Date.now=()=>clock*1000;
 try{
  const first=consume('guard',1,60),second=consume('guard',1,60);
  check('consuming result admits first and reports exact refusal window',!first.limited&&first.retryAfterSeconds===0&&second.limited&&second.retryAfterSeconds===60,{first,second});
  let allowed=0,limited=0;
  for(let i=0;i<5009;i++){const r=consume('fill-'+i,1,60);r.limited?limited++:allowed++;}
  check('fixed5000 capacity rejects new keys without clearing fresh buckets',allowed===4999&&limited===10,{allowed,limited});
  check('exhausted original survives the capacity flood',consume('guard',1,60).limited);
  clock+=10;const full=consume('new-full',1,60);
  check('capacity refusal carries earliest active reset',full.limited&&full.retryAfterSeconds===50,full);
  clock+=51;
  const admitted=consume('after-expiry',1,60);
  check('only expired capacity is reclaimed',!admitted.limited&&admitted.retryAfterSeconds===0,admitted);
  consume('minute',1,60);consume('hourly',1,3600);clock+=11;
  const minute=consume('minute',1,60),hourly=consume('hourly',1,3600);
  check('minute and hourly receipts use their actual remaining reset',minute.limited&&minute.retryAfterSeconds===49&&hourly.limited&&hourly.retryAfterSeconds===3589,{minute,hourly});
  clock+=49;check('minute expiry does not reset the hourly counter',!consume('minute',1,60).limited&&consume('hourly',1,3600).limited);
  check('boolean account compatibility shares the same bucket',core.rateLimited('boolean',1,60)===false&&consume('boolean',1,60).limited);
  const read=consume('mixed-news',30,60),write=consume('mixed-news',10,60);
  const writes=[];for(let n=0;n<8;n++)writes.push(consume('mixed-news',10,60));
  const tenthBoundary=consume('mixed-news',10,60),laterRead=consume('mixed-news',30,60);
  check('shared news GET30 and POST10 thresholds preserve one original count/reset',!read.limited&&!write.limited&&writes.every(r=>!r.limited)&&tenthBoundary.limited&&!laterRead.limited,{read,write,allowedWrites:writes.filter(r=>!r.limited).length,tenthBoundary,laterRead});
  for(let n=0;n<30;n++)consume('mixed-saturation',30,60);
  const lower=consume('mixed-saturation',10,60),higher=consume('mixed-saturation',30,60);
  check('lower trusted threshold never decreases a shared exhausted counter',lower.limited&&higher.limited,{lower,higher});
  clock+=60;
  check('shared mixed-threshold expiry starts one fresh original window',!consume('mixed-news',10,60).limited&&!consume('mixed-news',30,60).limited);
  const v6a=await address('full-v6','2001:0db8:0:0:0:0:0:1',1,60),v6b=await address('full-v6','2001:db8::1',1,60);
  check('equivalent full IPv6 spellings share a pseudonymous bucket',!v6a.limited&&v6b.limited);
  check('full IPv6 addresses retain distinct host limits',!(await address('full-v6','2001:db8::2',1,60)).limited);
  const l1=await address('link-v6','2001:db8:abcd:1::1',1,60,'link64'),l2=await address('link-v6','2001:db8:abcd:1::999',1,60,'link64');
  check('Link preserves its existing IPv6 /64 grouping',!l1.limited&&l2.limited);
  const m1=await address('mapped','::ffff:192.0.2.9',1,60),m2=await address('mapped','192.0.2.9',1,60);
  check('mapped IPv4 and plain IPv4 are equivalent',!m1.limited&&m2.limited);
  await address('invalid','bad-address',1,60);check('invalid and oversize addresses share bounded sentinel',(await address('invalid','z'.repeat(10000),1,60)).limited);
  await address('missing','',1,60);check('missing address shares a purpose bucket',(await address('missing','',1,60)).limited&&!(await address('different','',1,60)).limited);
  const error=new FormError('slow_down',429,3589),response=privacyAccessRefusal(new Request('https://guild.example/privacy/signin'),error);
  check('actual privacy FormError HTML mapping preserves the exact retry interval',response.status===429&&response.headers.get('Retry-After')==='3589',{status:response.status,retryAfter:response.headers.get('Retry-After')});
  const ordinary=privacyAccessRefusal(new Request('https://guild.example/privacy/signin'),new FormError('invalid_identity_flow',400));
  check('ordinary FormError does not invent a retry interval',ordinary.status===400&&!ordinary.headers.has('Retry-After'));
  const outer=Reflect.get(forms,'formErrorResponse280')?.(new Response('refused',{status:429}),error);
  check('shared outer form mapping helper preserves exact known metadata',outer?.headers.get('Retry-After')==='3589');
  const invalid=privacyAccessRefusal(new Request('https://guild.example/privacy/signin'),new FormError('slow_down',429,NaN));
  check('invalid FormError metadata never creates a header',!invalid.headers.has('Retry-After'));
  const copy=Reflect.get(forms,'copyRateLimitResponse280')?.(new Response('history',{status:429}),new Response('{}',{status:429,headers:{'Retry-After':'3589'}}));
  check('JSON to script-free history adapter retains hourly interval',copy?.headers.get('Retry-After')==='3589');
  const noGuess=Reflect.get(forms,'copyRateLimitResponse280')?.(new Response('unknown',{status:503}),new Response('{}',{status:503,headers:{'Retry-After':'60'}}));
  check('unknown account outcome is not assigned limiter retry guidance',noGuess?.status===503&&!noGuess.headers.has('Retry-After'));
  for(let n=0;n<20;n++)await address('pi:/api/privacy/requests/read','192.0.2.55',20,60);
  let pulls=0;const body=new ReadableStream({pull(c){pulls++;c.enqueue(new TextEncoder().encode('{}'));c.close();}},{highWaterMark:0});
  const request=new Request('https://guild.example/api/privacy/requests/read',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.55'},body});
  const intake=await handlePrivacyIntake(request,{COMMUNITY_FEATURES:'privacy_intake'},'/api/privacy/requests/read');
  check('actual public privacy limiter refuses before stream or D1 work',intake.status===429&&Number(intake.headers.get('Retry-After'))>0&&!request.bodyUsed&&pulls===0,{status:intake.status,retryAfter:intake.headers.get('Retry-After'),bodyUsed:request.bodyUsed,pulls});
 }finally{Date.now=original;}
}
async function provision(db){
 const catalogue=JSON.parse(ADMISSION_EXPECTED_JSON),statements=[...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql));statements.push(db.prepare(catalogue.slotSQL));
 while(statements.length)await db.batch(statements.splice(0,40));
 await db.batch([db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,epoch),db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',CAST(strftime('%s','now') AS INTEGER))")]);
 const triggers=catalogue.triggers.map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 return {DB:db,PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:'800000000000000001',GUILD_ID:'800000000000000001',DISCORD_APP_ID:'800000000000000002',DISCORD_CLIENT_SECRET:'limiter280-client',DISCORD_BOT_TOKEN:'limiter280-bot',VERIFY_SECRET:'limiter280-verify',COOKIE_SECRET:'limiter280-cookie',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:epoch,ROLE_GUILD_MEMBER:'800000000000000010',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'limiter280-fixture',timestamp:'2026-11-12T00:00:00Z'},ASSETS:{async fetch(){return new Response('static');}}};
}
async function routes(db){
 let deferred=0;const env=await provision(db),context={waitUntil(){deferred++;}},call=(host,path,ip,extra={})=>worker.fetch(new Request('https://'+host+path,{...extra,headers:{'CF-Connecting-IP':ip,...extra.headers}}),env,context);
 let r;for(let i=0;i<31;i++)r=await call('guild.example','/auth/login','2001:db8::1');
 check('actual index site sign-in refuses before OAuth provider work',r.status===429&&Number(r.headers.get('Retry-After'))>0&&Number(r.headers.get('Retry-After'))<=60,{status:r.status,retryAfter:r.headers.get('Retry-After')});
 const equivalent=await call('guild.example','/auth/login','2001:0db8:0:0:0:0:0:1');
 check('actual site sign-in cannot rotate equivalent IPv6 spelling',equivalent.status===429,{status:equivalent.status});
 const separate=await call('guild.example','/auth/login','2001:db8::2');check('separate valid full IPv6 host retains site sign-in admission',separate.status===302,{status:separate.status});
 for(let i=0;i<21;i++)r=await call('verify.example','/linked-role','192.0.2.1');
 check('actual bot OAuth limiter returns its own retry interval',r.status===429&&Number(r.headers.get('Retry-After'))>0&&Number(r.headers.get('Retry-After'))<=60,{status:r.status,retryAfter:r.headers.get('Retry-After')});
 const status=await call('guild.example','/api/me/verification','192.0.2.200');check('anonymous verification remains unauthorized',status.status===401,{status:status.status});
 const badOrigin=await call('guild.example','/api/me/verification','192.0.2.201',{method:'POST',body:'{}',headers:{Origin:'https://evil.example','X-Olympus':'2'}});check('anonymous wrong-origin verification remains unauthorized',badOrigin.status===401,{status:badOrigin.status});
 const start=await call('guild.example','/auth/login','192.0.2.202'),state=new URL(start.headers.get('Location')).searchParams.get('state');
 const cookie=(r,name)=>r.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith(name+'='));
 const callback=await call('guild.example','/auth/callback?code=limiter-account&state='+encodeURIComponent(state),'192.0.2.202',{headers:{Cookie:cookie(start,'__Host-olg_state')}});
 const session=cookie(callback,'__Host-olg');if(callback.status!==303||!session)throw Error('Actual OAuth setup failed '+callback.status+' '+await callback.text());
 const id='800000000000000280';env.SITE_ADMINS=id;
 const retained=await call('guild.example','/api/news/editor/webhook/retained','192.0.2.202',{headers:{Cookie:session}});
 const firstWrite=await call('guild.example','/api/news/editor/webhook/reconcile','192.0.2.202',{method:'POST',body:'{}',headers:{Cookie:session,Origin:'https://guild.example','X-Olympus':'2'}});
 check('actual signed-in news webhook GET30 does not block its first POST10',retained.status===200&&firstWrite.status===400,{getStatus:retained.status,postStatus:firstWrite.status});
 for(let n=0;n<30;n++)consume('w:'+id,30,60);
 await createPrivacyWriteAdmissionDatabase(db,'writer','canonical',epoch).prepare('UPDATE site_users SET checked_at=0 WHERE discord_id=?1').bind(id).run();
 let pulls=0;const heldBody=new ReadableStream({pull(c){pulls++;c.enqueue(new TextEncoder().encode('{"action":"refresh"}'));c.close();}},{highWaterMark:0});
 const heldRequest=new Request('https://guild.example/api/me/verification',{method:'POST',headers:{Cookie:session,Origin:'https://guild.example','X-Olympus':'2'},body:heldBody});
 const deferredBefore=deferred,refused=await worker.fetch(heldRequest,env,context);
 const written=await db.prepare("SELECT COUNT(*) n FROM audit WHERE subject=?1 AND action='role.request242'").bind(id).first();
 check('authenticated verification refuses before fresh member, stream or audit/defer work',refused.status===429&&Number(refused.headers.get('Retry-After'))>0&&Number(refused.headers.get('Retry-After'))<=60&&!heldRequest.bodyUsed&&pulls===0&&written.n===0&&deferred===deferredBefore,{status:refused.status,retryAfter:refused.headers.get('Retry-After'),bodyUsed:heldRequest.bodyUsed,pulls,auditRows:written.n,deferred:deferred-deferredBefore});
 const own=await call('guild.example','/api/me/verification','192.0.2.202',{headers:{Cookie:session}});
 check('authenticated own-status GET remains usable after limiter exhaustion',own.status===200,{status:own.status});
}
export default {async fetch(request,env){try{if(new URL(request.url).pathname==='/unit')await unit();else await routes(env.DB);return Response.json({ok:cases.every(x=>x.pass),checks:cases.length,cases});}catch(e){return Response.json({ok:false,error:String(e.stack),cases},{status:500});}}};
