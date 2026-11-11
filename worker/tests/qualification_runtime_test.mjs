// Genuine local Workerd/D1 behavior. Current exported schema data provisions only
// this synthetic database; no historical source/pin/projection helpers are loaded.
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON, ADMISSION_CONTROL_DDL, ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {admittedPrivacySubjectWrite, readPrivacySubject} from '../src/privacy-serving-authority.ts';
import {grantMemberRole, callBudget} from '../src/roles.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {FRESH_LEASE_ACQUIRE, FRESH_LEASE_RELEASE, FRESH_LEASE_KEY, FRESH_LEASE_SECONDS, freshLeaseValue} from '../src/full-release-roles.ts';
import {postIntake242} from '../src/intake242.ts';

const EPOCH='a'.repeat(32), GUILD='800000000000000001', ROLE='800000000000000010';
const ALLOWED='800000000000000101', BANNED='800000000000000102', BLOCKED='800000000000000103', PRIVATE='800000000000000104';
const BLOCK='800000000000000011', ONCE=new Set();
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_LEGACY_HOSTS:'old.example',
  GUILD_ID:GUILD,ROLE_GUILD_MEMBER:ROLE,BLOCKING_ROLE_IDS:BLOCK,DISCORD_BOT_TOKEN:'qualification-discord-only',
  DISCORD_APP_ID:'800000000000000002',WATCHER_TOKEN:'qualification-watcher-only',VERIFY_SECRET:'qualification-secret-only',
  COOKIE_SECRET:'qualification-cookie-only',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH};

async function provision(db){
  const catalogue=JSON.parse(ADMISSION_EXPECTED_JSON);
  const create=[...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql));
  create.push(db.prepare(ADMISSION_CONTROL_DDL));
  while(create.length)await db.batch(create.splice(0,40));
  const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
  await db.batch([
    db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,EPOCH),
    db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
    db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(now),
    ...[ALLOWED,BANNED,BLOCKED,PRIVATE].map(id=>db.prepare('INSERT INTO members(discord_id,banned)VALUES(?1,?2)').bind(id,id===BANNED?1:0)),
    db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',0,?3,?3)").bind(PRIVATE,'b'.repeat(32),now),
  ]);
  const triggers=catalogue.triggers.map(x=>db.prepare(x.sql));
  while(triggers.length)await db.batch(triggers.splice(0,40));
  return {...config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','canonical',EPOCH)};
}

export default {async fetch(request,bindings,ctx){
  const kind=new URL(request.url).pathname.slice(1), checks=[];
  if(request.method!=='POST'||!['baseline','lease','treasury'].includes(kind)||ONCE.has(kind))return new Response(null,{status:404});
  ONCE.add(kind);
  const check=(name,condition)=>{if(!condition)throw Error(name);checks.push({name,passed:true});};
  const refused=async work=>{try{await work();return false;}catch{return true;}};
  const db=bindings['DB_'+kind];
  try{
    if(kind==='baseline'){
      const uninstalled=await worker.fetch(new Request('https://verify.example/health'),{...config,DB:db},ctx);
      check('actual Worker refuses an uninstalled D1',uninstalled.status===503);
    }
    const env=await provision(db);
    if(kind==='baseline'){
      const health=await worker.fetch(new Request('https://verify.example/health'),{...config,DB:db},ctx),body=await health.json();
      check('actual Worker health consumes installed schema successfully',health.status===200&&body.ok===true&&body.d1==='ok');
      const unknown=await worker.fetch(new Request('https://unknown.example/health'),{...config,DB:db},ctx);
      check('unknown host is refused',unknown.status===404);
      const queue=await worker.fetch(new Request('https://verify.example/queue'),{...config,DB:db},ctx);
      check('watcher queue requires authentication',queue.status===401);
      const policy=await worker.fetch(new Request('https://guild.example/legal/privacy'),{...config,DB:db},ctx);
      check('public privacy policy is served by actual Worker',policy.status===200&&(await policy.text()).length>0);
      check('D1 foreign-key integrity holds',(await db.prepare('PRAGMA foreign_key_check').all()).results.length===0);
      check('unwrapped D1 business writes are refused',await refused(()=>db.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(ALLOWED).run()));
      check('refused raw write leaves data unchanged',(await db.prepare('SELECT banned FROM members WHERE discord_id=?1').bind(ALLOWED).first()).banned===0);
      check('a failed real D1 batch is rejected',await refused(()=>env.DB.batch([
        env.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind('800000000000000199'),
        env.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(ALLOWED),
      ])));
      check('failed batch rolls back its preceding payload',!(await db.prepare('SELECT 1 FROM members WHERE discord_id=?1').bind('800000000000000199').first()));
      const capture=await readPrivacySubject(env,PRIVATE);
      await admittedPrivacySubjectWrite(env,PRIVATE,capture,[env.DB.prepare('UPDATE members SET ban_reason=?1 WHERE discord_id=?2').bind('allowed',PRIVATE)]);
      check('current privacy generation admits its actual write',(await db.prepare('SELECT ban_reason FROM members WHERE discord_id=?1').bind(PRIVATE).first()).ban_reason==='allowed');
      check('a foreign generation is refused',await refused(()=>admittedPrivacySubjectWrite(env,PRIVATE,{...capture,subjectGeneration:'c'.repeat(32)},[env.DB.prepare('UPDATE members SET ban_reason=?1 WHERE discord_id=?2').bind('foreign',PRIVATE)])));
      await env.DB.prepare("UPDATE privacy_subjects SET state='retiring',revision=revision+1 WHERE subject_id=?1").bind(PRIVATE).run();
      check('a captured generation cannot write after retirement starts',await refused(()=>admittedPrivacySubjectWrite(env,PRIVATE,capture,[env.DB.prepare('UPDATE members SET ban_reason=?1 WHERE discord_id=?2').bind('stale',PRIVATE)])));
      check('privacy refusals preserve the prior payload',(await db.prepare('SELECT ban_reason FROM members WHERE discord_id=?1').bind(PRIVATE).first()).ban_reason==='allowed');
      // This common writer uses a synthetic guild outside protected Native/Prime
      // scopes. Its positive result is not a Native authority/grant acceptance.
      check('common role writer grants an eligible synthetic member',await grantMemberRole(env,ALLOWED,'qualification','qualification',undefined,callBudget(env))==='granted');
      check('common role writer refuses a D1-banned member',await grantMemberRole(env,BANNED,'qualification','qualification',undefined,callBudget(env))==='banned');
      check('common role writer refuses a blocking Discord role',await grantMemberRole(env,BLOCKED,'qualification','qualification',undefined,callBudget(env))==='blocked');
      const native=await runNativeSubject232(env,ALLOWED,callBudget(env));
      check('missing original Native authority never reports a settled grant',native.state==='held'&&native.requests===0);
    }else if(kind==='lease'){
      const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
      const owner=freshLeaseValue(now+FRESH_LEASE_SECONDS,'d'.repeat(32)),foreign=freshLeaseValue(now+FRESH_LEASE_SECONDS,'e'.repeat(32));
      check('lease acquire is acknowledged by actual D1',(await env.DB.prepare(FRESH_LEASE_ACQUIRE).bind(owner).first())?.key===FRESH_LEASE_KEY);
      check('a second live owner is refused',await env.DB.prepare(FRESH_LEASE_ACQUIRE).bind(foreign).first()===null);
      check('foreign cleanup changes no row',(await env.DB.prepare(FRESH_LEASE_RELEASE).bind(foreign).run()).meta.changes===0);
      check('foreign cleanup preserves the original lease',(await db.prepare('SELECT value FROM site_settings WHERE key=?1').bind(FRESH_LEASE_KEY).first()).value===owner);
      check('owned exact-value cleanup changes one row',(await env.DB.prepare(FRESH_LEASE_RELEASE).bind(owner).run()).meta.changes===1);
      check('owned cleanup closes the lease',JSON.parse((await db.prepare('SELECT value FROM site_settings WHERE key=?1').bind(FRESH_LEASE_KEY).first()).value).leaseUntil===0);
    }else{
      const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
      const entry={id:'qualification-receipt',type:'donation',character:'Synthetic Member',requestedAt:now-29*86400,donation:{copper:100}};
      const intake=async entries=>(await postIntake242(env,{entries})).json();
      const first=await intake([entry]),again=await intake([entry]);
      check('old observed receipt is admitted and exact retry acknowledged',first.acknowledgements[0]?.status==='done'&&again.acknowledgements[0]?.status==='done');
      const rows=(await db.prepare("SELECT ts,details FROM audit WHERE action='treasury.receipt242'").all()).results;
      check('receipt deduplication keeps one actual D1 row',rows.length===1);
      const receipt=JSON.parse(rows[0].details);
      check('retention follows observation rather than arrival',receipt.retainUntil===entry.requestedAt+30*86400&&rows[0].ts>=now);
      const boundary=await intake([{...entry,id:'expired-boundary',requestedAt:now-30*86400}]);
      check('expired observation boundary is refused',boundary.acknowledgements[0]?.status==='rejected');
      await env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','qualification-expired',?2)").bind(now,JSON.stringify({retainUntil:now-1})).run();
      await intake([]);
      check('cleanup honors an existing server observation deadline',!(await db.prepare("SELECT 1 FROM audit WHERE subject='qualification-expired'").first()));
    }
    const control=await db.prepare('SELECT active,nonce,purpose,mode FROM privacy_write_admission').first();
    check('actual admission control returns neutral',control.active===0&&control.nonce===''&&control.purpose===''&&control.mode==='serving');
    if(kind==='baseline'){
      await db.prepare('DROP INDEX audit_actor_action').run();
      const broken=await worker.fetch(new Request('https://verify.example/health'),{...config,DB:db},ctx);
      check('actual Worker refuses a missing required index',broken.status===503);
    }
    return Response.json({complete:true,target:kind,checks,actualLocalWorkerdD1:true});
  }catch(error){return Response.json({complete:false,target:kind,checks,error:String(error?.stack||error)}, {status:500});}
}};
