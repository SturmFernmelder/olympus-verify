// Genuine local Workerd/D1 behavior. Current exported schema data provisions only
// this synthetic database; no historical source/pin/projection helpers are loaded.
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON, ADMISSION_PROTOCOL, ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {admittedPrivacySubjectWrite, readPrivacySubject} from '../src/privacy-serving-authority.ts';
import {grantMemberRole, callBudget} from '../src/roles.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {FRESH_LEASE_ACQUIRE, FRESH_LEASE_RELEASE, FRESH_LEASE_KEY, FRESH_LEASE_SECONDS, freshLeaseValue, CANONICAL233_SWEEP249_SELECT} from '../src/full-release-roles.ts';
import {qualifiedNativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {CANONICAL_PROFILE233, CANONICAL_RANKS233, NATIVE_NAMES233} from '../src/canonical-ranks233.ts';
import {kickRoleWorkGroups266} from '../src/role-reconcile242.ts';
import {D1_PERFORMANCE_INDEX_NAME, D1_PERFORMANCE_INDEX_DDL} from '../src/d1-performance-index.ts';
import {readOriginalCompleteSchema} from '../src/privacy-schema-source-plan.ts';
import {originalCanonicalSmoke280} from './canonical_v1_compat280_smoke.mjs';

const EPOCH='a'.repeat(32), GUILD='800000000000000001', ROLE='800000000000000010';
const ALLOWED='800000000000000101', BANNED='800000000000000102', BLOCKED='800000000000000103', PRIVATE='800000000000000104';
const BLOCK='800000000000000011', ONCE=new Set();
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_LEGACY_HOSTS:'old.example',
  GUILD_ID:GUILD,ROLE_GUILD_MEMBER:ROLE,BLOCKING_ROLE_IDS:BLOCK,DISCORD_BOT_TOKEN:'qualification-discord-only',
  DISCORD_APP_ID:'800000000000000002',WATCHER_TOKEN:'qualification-watcher-only-0123456789',VERIFY_SECRET:'qualification-secret-only',
  COOKIE_SECRET:'qualification-cookie-only',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH};

async function provision(db,layout='canonical'){
  const catalogue=layout==='recorded-live-pre-seal-20261017'?JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile:JSON.parse(ADMISSION_EXPECTED_JSON);
  const create=[...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql));
  create.push(db.prepare(catalogue.slotSQL));
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
  return {...config,PRIVACY_WRITE_ADMISSION_LAYOUT:layout,DB:createPrivacyWriteAdmissionDatabase(db,'writer',layout,EPOCH)};
}

export default {async fetch(request,bindings,ctx){
  const kind=new URL(request.url).pathname.slice(1), checks=[];
  if(request.method!=='POST'||!['baseline','lease','treasury','reconciliation'].includes(kind)||ONCE.has(kind))return new Response(null,{status:404});
  ONCE.add(kind);
  const check=(name,condition,observed)=>{if(!condition)throw Error(name+(observed===undefined?'':': '+JSON.stringify(observed)));checks.push({name,passed:true,...(observed===undefined?{}:{observed})});};
  const refused=async work=>{try{await work();return false;}catch{return true;}};
  const db=bindings['DB_'+kind];
  try{
    if(kind==='baseline'){
      const uninstalled=await worker.fetch(new Request('https://verify.example/health'),{...config,DB:db},ctx);
      check('actual Worker refuses an uninstalled D1',uninstalled.status===503);
    }
    let env=await provision(db,kind==='reconciliation'?'recorded-live-pre-seal-20261017':'canonical');
    if(kind==='baseline'){
      const health=await worker.fetch(new Request('https://verify.example/health'),{...config,DB:db},ctx),body=await health.json();
      check('actual Worker health consumes installed schema successfully',health.status===200&&body.ok===true&&body.d1==='ok');
      const unknown=await worker.fetch(new Request('https://unknown.example/health'),{...config,DB:db},ctx);
      check('unknown host is refused',unknown.status===404);
      const queue=await worker.fetch(new Request('https://verify.example/queue'),{...config,DB:db},ctx);
      check('watcher queue requires authentication',queue.status===401);
      const watcherEnv={...config,DB:db,VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,guild:'Olympus',realm:'Fixture Live Realm'})};
      const cacheResponse=await worker.fetch(new Request('https://verify.example/queue?cacheOnly242=1&keyVersion=launch-membership-v1',{headers:{Authorization:'Bearer '+config.WATCHER_TOKEN}}),watcherEnv,ctx),cache=await cacheResponse.json();
      check('current authenticated cache retires the officer-signed wake capability',cacheResponse.status===200&&!Object.hasOwn(cache,'independentRoleWake264')&&cache.presenceOnly===true&&cache.setGuildNote===false&&Array.isArray(cache.entries)&&Array.isArray(cache.verificationResults),cache);
      const oldText=JSON.stringify({kind:'sweep',at:Math.floor(Date.now()/1000),nonce:crypto.randomUUID(),independent:true});
      const oldKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const oldSignature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',oldKey,new TextEncoder().encode('role-continuation242\n'+oldText))),b=>b.toString(16).padStart(2,'0')).join('');
      const obsoleteWake=await worker.fetch(new Request('https://verify.example/internal/roles242/continue',{method:'POST',headers:{Authorization:'Bearer '+config.WATCHER_TOKEN,'Content-Type':'application/json','X-Olympus-Role-Continuation':oldSignature},body:oldText}),watcherEnv,ctx);
      check('server-only receiver still refuses the real obsolete officer-signed request',obsoleteWake.status===401);
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
      check('an identical cleanup after a lost reply is idempotent',(await env.DB.prepare(FRESH_LEASE_RELEASE).bind(owner).run()).meta.changes===0);
      check('a new lease owner may acquire after cleanup',(await env.DB.prepare(FRESH_LEASE_ACQUIRE).bind(foreign).first())?.key===FRESH_LEASE_KEY);
      check('the previous cleanup cannot clear a replacement owner',(await env.DB.prepare(FRESH_LEASE_RELEASE).bind(owner).run()).meta.changes===0&&(await db.prepare('SELECT value FROM site_settings WHERE key=?1').bind(FRESH_LEASE_KEY).first()).value===foreign);
      await env.DB.prepare(FRESH_LEASE_RELEASE).bind(foreign).run();
    }else if(kind==='treasury'){
      const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
      const guild='OLYMPUS PRIME',realm='Qualification Realm',collector='Player-1-1234ABCD',guid='Player-1-9999ABCD';
      const watcherToken='qualification-watcher-only-0123456789012345';
      const financialEnv={...env,DB:db,WATCHER_TOKEN:watcherToken,VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,guild,realm})};
      const intake=async(entries,authorized=true)=>{
        const response=await worker.fetch(new Request('https://verify.example/ingest/intake242?keyVersion=launch-membership-v1',{
          method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+watcherToken}:{})},body:JSON.stringify({entries})}),financialEnv,ctx);
        return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')?await response.json():await response.text()};
      };
      // Independent wire encoder: no production signer or financial factory is
      // imported. Synthetic Native rows corroborate the collector, not a donor
      // account or a financial credit. Actual NativeE2 is qualified separately.
      const sign=async row=>{
        const d=row.donation,e=row.evidence,normalize=s=>s.replace(/[ \t\r\n\v\f]+/g,' ').replace(/^ | $/g,'').replace(/[A-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+32));
        const fields=[row.id,String(row.requestedAt),d.kind,String(d.copper),normalize(row.character),row.guid,normalize(d.recipient),d.collectorGuid,row.guild,row.realm,d.reference,row.clientVersion,e.kind,d.recipient];
        const message='tithe-gold-v2|'+fields.map(v=>new TextEncoder().encode(v).length+':'+v).join('');
        const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        row.evidence.mac=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);return row;
      };
      const entry=await sign({id:'a'.repeat(24),type:'donation',source:'tithe-gold-v2',character:'Synthetic Member',guid,requestedAt:now-29*86400,requestedBy:'Fern Melder',guild,realm,clientVersion:'qualification280',donation:{version:2,kind:'trade',copper:100,recipient:'Fern Melder',collectorGuid:collector,reference:'TITHE-ABCD-EFGH'},evidence:{kind:'trade_complete_and_money_delta',confirmedLocal:true,automaticCredit:false,mac:''}});
      const original=JSON.stringify(entry),beforeCount=(await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='treasury.receipt242'").first()).n;
      check('actual financial intake requires Watcher authentication',(await intake([entry],false)).status===401);
      const legacy=await intake([{id:'legacy-receipt',type:'donation',character:'Synthetic Member',requestedAt:now,donation:{copper:100}}]);
      check('prospective legacy donation is policy-held without capture',legacy.status===200&&legacy.body.policyHolds.length===1&&!legacy.body.acknowledgements.length&&!legacy.body.deferred.length&&(await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='treasury.receipt242'").first()).n===beforeCount);
      const pending=await intake([entry]),witness=pending.body.deferred[0];
      check('missing collector has explicit exact-original no-effect witness',pending.status===200&&!pending.body.acknowledgements.length&&!pending.body.policyHolds.length&&witness?.id===entry.id&&witness?.originalNoEffect===true&&witness?.observedAt===entry.requestedAt&&/^[0-9a-f]{64}$/.test(witness?.bodySHA256));
      await env.DB.batch([
        env.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted)VALUES(1,?1,?1,?1,?2,1,1,1)').bind(now,qualifiedNativeSnapshotSource(guild,realm)),
        env.DB.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)VALUES(1,'fern melder','Fern Melder',?1,'Officer',2,60)").bind(collector),
      ]);
      const bad=JSON.parse(original);bad.id='b'.repeat(24);bad.evidence.mac='0'.repeat(32);
      const refusedMAC=await intake([bad]);
      check('incorrect financial MAC is policy-held without a receipt',refusedMAC.body.policyHolds.length===1&&!refusedMAC.body.acknowledgements.length&&!refusedMAC.body.deferred.length&&(await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='treasury.receipt242'").first()).n===beforeCount);
      const first=await intake([entry]),row=await db.prepare("SELECT id,ts,actor,action,subject,details FROM audit WHERE action='treasury.receipt242' AND subject=?1").bind('intake242:'+entry.id).first();
      check('signed v2 receipt admitted through actual authenticated Worker',first.status===200&&first.body.acknowledgements[0]?.status==='done'&&first.body.acknowledgements[0]?.outcome==='unclassified_receipt_recorded'&&!!row);
      const receipt=JSON.parse(row.details);
      check('v2 retention follows original observation rather than arrival',receipt.observedAt===entry.requestedAt&&receipt.retainUntil===entry.requestedAt+30*86400&&row.ts>=now&&receipt.evidence.confirmedLocal===true&&receipt.evidence.automaticCredit===false);
      const again=await intake([entry]);
      check('exact live-row replay acknowledges original without renewing it',again.body.acknowledgements[0]?.status==='done'&&JSON.stringify(await db.prepare("SELECT id,ts,actor,action,subject,details FROM audit WHERE action='treasury.receipt242' AND subject=?1").bind(row.subject).first())===JSON.stringify(row));
      const conflicting=JSON.parse(original);conflicting.donation.copper=101;await sign(conflicting);
      const conflict=await intake([conflicting]);
      check('conflicting signed same-ID Native transaction gives no ACK or no-effect inference',conflict.status===200&&!conflict.body.acknowledgements.length&&!conflict.body.deferred.length&&!conflict.body.policyHolds.length);
      check('conflict rollback preserves exact existing receipt bytes',JSON.stringify(await db.prepare("SELECT id,ts,actor,action,subject,details FROM audit WHERE action='treasury.receipt242' AND subject=?1").bind(row.subject).first())===JSON.stringify(row));
      const expired=JSON.parse(original);expired.id='c'.repeat(24);expired.requestedAt=now-30*86400;await sign(expired);
      const boundary=await intake([expired]);
      check('expired new original is policy-held without false ACK or retry',boundary.body.policyHolds.length===1&&!boundary.body.acknowledgements.length&&!boundary.body.deferred.length);
      const malformed=JSON.stringify({retainUntil:now-1});
      await env.DB.batch([
        env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','qualification-expired',?2)").bind(now,JSON.stringify({observedAt:now-30*86400-1,retainUntil:now-1})),
        env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','qualification-malformed-deadline',?2)").bind(now,malformed),
      ]);
      await intake([]);
      check('cleanup honors fixed existing original observation deadline',!(await db.prepare("SELECT 1 FROM audit WHERE subject='qualification-expired'").first()));
      check('unqualified deadline cannot cause early deletion or normalized custody',(await db.prepare("SELECT ts,details FROM audit WHERE subject='qualification-malformed-deadline'").first())?.details===malformed);
      check('all requests preserve original client body MAC and observation',JSON.stringify(entry)===original);
    }else{
      // Persisted rows here are scheduling hints only. No fixture identity,
      // Native authority or role effect is inferred from a selector result.
      const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
      const changed='800000000000000299',debt='800000000000000201',walk='f'.repeat(32),otherWalk='e'.repeat(32);
      const accounts=[{id:changed,key:'qual changed',guid:'Player-4613-0000A299',rank:6},{id:debt,key:'qual debt',guid:'Player-4613-0000A201',rank:9}];
      for(const [index,a]of accounts.entries())await env.DB.batch([
        env.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(a.id),
        env.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,?1,?2,'member',?3,?3,'whisper',?4)").bind(a.key,a.id,now-2000,a.guid),
        env.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at,native_guid,native_profile,native_rank)VALUES(?1,?2,?3,?4,?5,1,'settled',?6,0,?7,?8,?9,?10,?11)").bind((index+1).toString(16).padStart(32,'0'),a.id,index===0?'canonical_routine233':'fresh_roster_rank',GUILD,CANONICAL_RANKS233.find(r=>r.key===(index===0?'veteran':'initiate')).roleId,index===0?'canonical233_observed_without_dispatch':'native232_observed_without_dispatch',now-900,now-600,a.guid,index===0?CANONICAL_PROFILE233:'olympus-prime-live-20261105-v1',a.rank),
      ]);
      for(const [id,rank,birth]of [[1,6,now-1000],[2,7,now-20],[3,6,now-10]])await env.DB.batch([
        env.DB.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted)VALUES(?1,?2,?2,?2,'qualification-native-history',2,1,1)").bind(id,birth),
        ...accounts.map(a=>{const top=a.id===changed?rank:8;return env.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index)VALUES(?1,?2,?2,?3,?4,?5)').bind(id,a.key,a.guid,NATIVE_NAMES233[top],top);}),
      ]);
      const attempt=(subject,details,at=now)=>env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'system','role.native232_attempt',?2,?3)").bind(at,subject,typeof details==='string'?details:JSON.stringify(details)).run();
      const select=async token=>(await env.DB.prepare(CANONICAL233_SWEEP249_SELECT).bind(GUILD,'',50,0,token).all()).results;
      await attempt(debt,{n:1,rank:9,result:'held'},now-1000);
      await attempt(changed,{n:2,rank:7,result:'held'},now-30);
      let selected=await select(walk);
      check('restored native6 after6-to7-to6 outranks generic catchup despite settled6',selected[0]?.subject===changed&&selected[0]?.top_rank===6);
      await attempt(changed,{n:'3',rank:6,result:'held'});
      selected=await select(walk);
      check('invalid latest snapshot cannot fall back to an older valid snapshot to bypass cooldown',selected[0]?.subject===debt&&selected.find(r=>r.subject===changed)?.urgent===0);
      await attempt(changed,{n:3,rank:6,result:'held'});
      // A real changed export creates a new immutable snapshot; changing a
      // historic snapshot in place cannot prove a later rank transition.
      const publish=async(id,rank)=>env.DB.batch([
        env.DB.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted)VALUES(?1,?2,?2,?2,'qualification-native-history',2,1,1)").bind(id,now),
        ...accounts.map(a=>{const top=a.id===changed?rank:8;return env.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index)VALUES(?1,?2,?2,?3,?4,?5)').bind(id,a.key,a.guid,NATIVE_NAMES233[top],top);}),
      ]);
      await publish(4,5);
      selected=await select(walk);
      check('genuinely changed target bypasses the previous target cooldown',selected[0]?.subject===changed&&selected[0]?.top_rank===5&&selected[0]?.urgent===1);
      await attempt(changed,{n:4,rank:5,result:'held'});
      selected=await select(walk);
      check('latest typed same-target attempt retains cooldown',selected[0]?.subject===debt&&selected.find(r=>r.subject===changed)?.urgent===0);
      await attempt(changed,{n:4,rank:'5',result:'held'});
      await attempt(changed,'malformed-json');
      selected=await select(walk);
      check('untyped and malformed latest rows do not replace the latest typed attempted rank',selected[0]?.subject===debt&&selected.find(r=>r.subject===changed)?.urgent===0);
      await publish(5,6);
      await attempt(changed,{n:4,rank:5,result:'held'});
      selected=await select(walk);
      check('returning to the known settled rank still exposes a new native transition',selected[0]?.subject===changed&&selected[0]?.top_rank===6);
      await attempt(debt,{walk,n:5,rank:8,result:'held'});
      await attempt(changed,{walk:otherWalk,n:5,rank:6,result:'held'});
      await attempt(null,{walk,n:5,rank:8,result:'held'});
      selected=await select(walk);
      check('same-walk selection excludes visited subject without NULL poisoning or foreign-walk exclusion',!selected.some(r=>r.subject===debt)&&selected.some(r=>r.subject===changed));
      check('a separate walk may revisit that scheduling candidate',(await select(otherWalk)).some(r=>r.subject===debt));
      let schedulingFailure;
      try{await kickRoleWorkGroups266(env,{id:walk,n:5});}catch(error){schedulingFailure=error;}
      check('request handoff failure remains visible after the independent sweep attempt',schedulingFailure instanceof AggregateError&&schedulingFailure.errors.length===1&&schedulingFailure.errors[0]?.status===503);
      // The original fixed-ID selector cases and signed handoff finish first.
      // The smoke publishes later snapshots, then returns the rebound writer
      // before the existing independent schema-index negative controls.
      env=await originalCanonicalSmoke280(db,env,check);
      const health=()=>worker.fetch(new Request('https://verify.example/health'),{...env,DB:db},ctx);
      await db.prepare(D1_PERFORMANCE_INDEX_DDL).run();
      check('exact optional performance index preserves actual Worker health',(await health()).status===200);
      const originalSchema=await readOriginalCompleteSchema(db);
      check('exact optional index preserves original Native complete-schema admission',originalSchema?.admitted===1&&originalSchema.object_count>0);
      const capture=await readPrivacySubject(env,PRIVATE);
      await admittedPrivacySubjectWrite(env,PRIVATE,capture,[env.DB.prepare('UPDATE members SET ban_reason=?1 WHERE discord_id=?2').bind('index-compatible',PRIVATE)]);
      check('exact optional index preserves real admitted read/write/privacy behavior',(await db.prepare('SELECT ban_reason FROM members WHERE discord_id=?1').bind(PRIVATE).first()).ban_reason==='index-compatible');
      check('optional index does not broaden a foreign privacy generation',await refused(()=>admittedPrivacySubjectWrite(env,PRIVATE,{...capture,subjectGeneration:'c'.repeat(32)},[env.DB.prepare('UPDATE members SET ban_reason=?1 WHERE discord_id=?2').bind('foreign-index',PRIVATE)])));
      await db.prepare('DROP INDEX '+D1_PERFORMANCE_INDEX_NAME).run();
      await db.prepare('CREATE INDEX '+D1_PERFORMANCE_INDEX_NAME+' ON audit(subject)').run();
      check('malformed same-name performance index refuses actual read and write',(await health()).status===503&&await refused(()=>env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(ALLOWED).run()));
      await db.prepare('DROP INDEX '+D1_PERFORMANCE_INDEX_NAME).run();
      const caseName=D1_PERFORMANCE_INDEX_NAME.toUpperCase();
      await db.prepare('CREATE INDEX '+caseName+' ON audit(action, actor, subject, ts DESC, id DESC)').run();
      check('case-variant performance index is refused',(await health()).status===503&&await refused(()=>env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(ALLOWED).run()));
      await db.prepare('DROP INDEX '+caseName).run();
      await db.prepare(D1_PERFORMANCE_INDEX_DDL).run();
      await db.prepare('CREATE INDEX qualification_unrelated ON audit(action)').run();
      check('an unrelated extra index is still refused',(await health()).status===503&&await refused(()=>env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(ALLOWED).run()));
      check('all schema/privacy refusals preserve original payload',(await db.prepare('SELECT banned,ban_reason FROM members WHERE discord_id=?1').bind(ALLOWED).first()).banned===0&&(await db.prepare('SELECT ban_reason FROM members WHERE discord_id=?1').bind(PRIVATE).first()).ban_reason==='index-compatible');
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
