'use strict';
// Original Native pending consumption followed by real postRoster + deferred
// FreshIngest over the original admitted Native DB. Only Discord is synthetic.
const fs238=require('node:fs'),path238=require('node:path'),{Module:Module238}=require('node:module');
let source238=fs238.readFileSync(path238.join(__dirname,'canonical_rank233_native_test.cjs'),'utf8');
const first238=' let code=await setup233(),reply=await invoke(code);',last238=" console.log(ok+'/'+n+' canonical233 Native checks passed');process.exitCode=ok===n?0:1;";
if(source238.split(first238).length!==2||source238.split(last238).length!==2)throw Error('canonical238_original_fixture_boundary');
// The current generation exists BEFORE the original genuine postVerify. No
// consumed/identity/grant ACK is rewritten to attach a generation afterward.
const load238="let source233=fs233.readFileSync(file233,'utf8');",pending238='  await env.DB.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce)VALUES(?1,\'\',\'\',?2,?3,\'M2X\')").bind(A,T,T+120).run();';
const seed238="  await env.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)ON CONFLICT(discord_id)DO NOTHING').bind(A).run();\n  await env.DB.prepare(\"INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',0,?3,?3)\").bind(A,'a'.repeat(32),T).run();\n"+pending238;
if(source238.split(load238).length!==2)throw Error('canonical238_original_loader_boundary');
// Preserve the original setup/cutover while giving this current caller a
// server-only signer and an actual factory-issued native-v2 original-ten source.
const oldSigner238='VERIFY_SECRET:SECRET,DISCORD_APP_ID:BOT',oldRoster238="  await roster.ingestRoster(env,T,[{name:'Fern Melder',guid:'Player-4613-12345678',rank:'Member',rankIndex:7}],load('./launch-verification227').captureLaunchVerification(env).scope.provenance);";
const currentRoster238="  const members238=[{name:'Fern Melder',guid:'Player-4613-12345678',rank:'Member',rankIndex:8}];await roster.ingestRoster(env,T,members238,load('./native-rank-schemes').nativeSnapshotSource(scope.guild,scope.realm,{version:1,names:load('./canonical-ranks233').NATIVE_NAMES233},members238));";
const setupChanges238=[[pending238,seed238,'generation'],[oldSigner238,"VERIFY_SECRET:SECRET,COOKIE_SECRET:'a'.repeat(64),DISCORD_APP_ID:BOT",'server_signer'],[oldRoster238,currentRoster238,'native_v2_source']];
source238=source238.replace(load238,load238+'for(const [before238,after238,label238] of '+JSON.stringify(setupChanges238)+'){if(source233.split(before238).length!==2)throw Error("canonical238_original_"+label238+"_boundary");source233=source233.replace(before238,after238);}');
const body238=String.raw`
 const L238=load('./full-release-roles'),F238=load('./full-release-pass'),E238=load('./roster-effects'),G238='a'.repeat(32),TECH238=C.ADDON_DEVELOPER233.roleId;
 // Roster continuation is now owned by its completed original pass. This early
 // boundary double validates the signed wake and released lease; the later249
 // chain still executes the real HMAC receiver and original Native children.
 const originalFetch257=testFetch,ingestWakes257=[];
 testFetch=async(url,init)=>{
  if(String(url)!=='https://verify.example/internal/roles242/continue')return originalFetch257(url,init);
  const wake=JSON.parse(init.body),signature=require('node:crypto').createHmac('sha256',env.COOKIE_SECRET).update('role-continuation280-v2\nhttps://verify.example\n'+init.body).digest('hex');
  if(init.method!=='POST'||init.redirect!=='manual'||wake.version!==2||wake.kind!=='sweep'||!wake.sweep||new Headers(init.headers).get('X-Olympus-Role-Continuation')!==signature)throw Error('257_original_roster_signed_sweep_required');
  const lease=JSON.parse(db.prepare('SELECT value FROM site_settings WHERE key=?').get(L238.FRESH_LEASE_KEY).value),state=JSON.parse(db.prepare("SELECT details FROM audit WHERE actor='system' AND action='role.fresh_state' ORDER BY id DESC LIMIT 1").get().details);
  if(lease.leaseUntil!==0||state.walk!==wake.sweep.id||state.n!==wake.sweep.n)throw Error('257_roster_progress_and_lease_release_before_wake');
  ingestWakes257.push(wake);return new Response(null,{status:202});
 };
 const debtIds238=Array.from({length:206},(_,i)=>(900000000000000000n+BigInt(i)).toString()),guid238=i=>'Player-4613-'+(i+1000).toString(16).padStart(8,'0');
 const letters238=i=>String.fromCharCode(97+Math.floor(i/676)%26,97+Math.floor(i/26)%26,97+i%26);
 function members238(index){const out=[{name:'Fern Melder',guid:'Player-4613-12345678',rank:N.NATIVE_RANK_NAMES232[index],rankIndex:index}];for(let i=0;i<916;i++)out.push({name:(i<206?'Backlog Fixture ':'Unlinked Fixture ')+letters238(i),guid:guid238(i),rank:'Member',rankIndex:8});return out;}
 async function backlog238(count238=206){for(let i=0;i<count238;i++){const s=debtIds238[i],name='Backlog Fixture '+letters238(i),key=name.toLowerCase();await env.DB.prepare('INSERT INTO members(discord_id)VALUES(?)').bind(s).run();await env.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?,?,?,'member',?,?,'whisper',?)").bind(key,name,s,T-3600,T-3600,guid238(i)).run();await env.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,native_profile,native_rank,native_rank_name,native_guid,roster_id,created_at,expires_at,checked_at)VALUES(?,?,'canonical_routine233',?,?,1,'settled','canonical233_observed_without_dispatch',0,?,?,?,?,1,?,?,?)").bind('f'.repeat(24)+i.toString(16).padStart(8,'0'),s,G,R,C.CANONICAL_PROFILE233,i<13?null:8,'Member',guid238(i),T-2000,T-1700,T-1999).run();await env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'system','role.native232_attempt',?,?)").bind(T-1000+i,s,JSON.stringify({n:1,rank:8,result:'source_held'})).run();}}
 async function arrange238(targetAttempt){for(let i=0;i<206;i++){const at=i<11?targetAttempt-1000+i:i<13?targetAttempt+1:targetAttempt-1000;await env.DB.prepare("DELETE FROM audit WHERE actor='system' AND action='role.native232_attempt' AND subject=?").bind(debtIds238[i]).run();await env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'system','role.native232_attempt',?,?)").bind(at,debtIds238[i],JSON.stringify({n:2,rank:8,result:'source_held'})).run();}}
 async function upload238(index){const deferred=[],wakeStart=ingestWakes257.length;http=[];const response=await ingest.postRoster(env,{exportedAt:T,nativeGuild:scope.guild,nativeRealm:scope.realm,nativeRankTable:{version:1,names:C.NATIVE_NAMES233},members:members238(index)},(label,work)=>{if(typeof work!=='function')throw Error('unstarted_original_defer_required');deferred.push({label,work});},undefined,true);check('actual postRoster accepts complete917-row Native snapshot',response.status===200&&db.prepare('SELECT member_count,complete,trusted FROM roster_snapshots ORDER BY id DESC LIMIT 1').get().member_count===917);check('original FreshIngest registers exactly one unstarted Native pass',deferred.length===1&&deferred[0].label==='fresh_roles_ingest');const results=[];for(const job of deferred)results.push(await job.work());console.log('canonical238_ingest_metrics',JSON.stringify({rank:index,state:results[0]?.state,reason:results[0]?.reason,counts:results[0]?.counts}));check('deferred original Native pass obeys two-subject/sharedHTTP/physicalSQL bounds',results.length===1&&results[0].state==='done'&&results[0].counts.visits<=10&&results[0].counts.requests<=40&&results[0].counts.statements+5<=388);check('257 original roster wakes its returned generation only after durable progress and lease release',results[0].continuation?ingestWakes257.length===wakeStart+1&&ingestWakes257.at(-1).sweep.id===results[0].nativeSweep.id&&ingestWakes257.at(-1).sweep.n===results[0].nativeSweep.n:ingestWakes257.length===wakeStart);return{response,pass:results[0]};}
 const identity238=()=>JSON.stringify({g:db.prepare('SELECT generation,state FROM privacy_subjects WHERE subject_id=?').get(A),c:db.prepare('SELECT guid,bound_at,verified_at FROM characters WHERE discord_id=?').all(A),p:db.prepare('SELECT id,created_at,consumed_at,consumed_source FROM pending WHERE discord_id=?').all(A)});
 const lastAttempt238=()=>db.prepare("SELECT ts,json_extract(details,'$.rank') rank,json_extract(details,'$.result') result FROM audit WHERE actor='system' AND action='role.native232_attempt' AND subject=? ORDER BY ts DESC,id DESC LIMIT 1").get(A);
 let code=await setup233(6),reply=await invoke(code);check('original verification creates currentG own Veteran ACK before scheduler tests',reply.body.roleGranted&&present.includes(C.CANONICAL_RANKS233[7].roleId)&&own233().some(r=>r.native_rank===6&&r.subject_generation===G238));present.push(TECH238);await backlog238();const original238=identity238(),ackIds238=rows().filter(r=>r.subject===A).map(r=>r.id),ackBytes238=JSON.stringify(rows().filter(r=>ackIds238.includes(r.id)));
 T++;await upload238(7);check('real ingest6to7 deletes own Veteran then PUTs only Raider',del()===1&&put()===1&&http.filter(x=>['DELETE','PUT'].includes(x.method))[0]?.method==='DELETE'&&present.includes(C.CANONICAL_RANKS233[8].roleId)&&!present.includes(C.CANONICAL_RANKS233[7].roleId)&&!present.includes(R)&&present.includes(TECH238));check('actual ingest attempt stores rank7 without another code',lastAttempt238()?.rank===7&&lastAttempt238()?.result==='settled'&&identity238()===original238);
 const at238=lastAttempt238()?.ts;if(!Number.isSafeInteger(at238))throw Error('original_rank7_attempt_required');T=at238+301;await arrange238(at238);await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id IN(?,?)').bind(debtIds238[0],debtIds238[1]).run();await upload238(6);check('real ingest restores6 with207candidates/14urgent despite two persistent restrictions',del()===1&&put()===1&&present.includes(C.CANONICAL_RANKS233[7].roleId)&&!present.includes(C.CANONICAL_RANKS233[8].roleId)&&present.includes(TECH238)&&!present.includes(R));check('sameG/GUID/verified_at/pending and originalACK bytes survive6to7to6',identity238()===original238&&JSON.stringify(rows().filter(r=>ackIds238.includes(r.id)))===ackBytes238);check('new routine own ACK6 follows own ACK7 under same generation',own233().some(r=>r.purpose==='canonical_routine233'&&r.native_rank===7&&r.subject_generation===G238)&&own233().some(r=>r.purpose==='canonical_routine233'&&r.native_rank===6&&r.subject_generation===G238));
 const firstRestriction238=db.prepare("SELECT subject FROM audit WHERE action='role.native232_attempt' AND subject IN(?,?) ORDER BY ts DESC,id DESC LIMIT 1").get(debtIds238[0],debtIds238[1])?.subject;T+=300;await upload238(6);const nextRestriction238=db.prepare("SELECT subject FROM audit WHERE action='role.native232_attempt' AND subject IN(?,?) ORDER BY ts DESC,id DESC LIMIT 1").get(debtIds238[0],debtIds238[1])?.subject;check('persistent restriction first slot rotates on next due actual ingest',firstRestriction238===debtIds238[0]&&nextRestriction238===debtIds238[1]&&put()===0&&del()===0);db.close();

 // .241: initial9->8 catch-up must not hide a real Native6->7->6 cycle,
 // including original M7 which deliberately writes no Native last_rank.
 code=await setup233(6);reply=await invoke(code);check('241 original consumed6 ACK exists before delta/migration story',reply.body.roleGranted&&own233().some(r=>r.native_rank===6&&r.subject_generation===G238));
 const original241=identity238(),receiptIds241=rows().filter(r=>r.subject===A).map(r=>r.id),receiptBytes241=JSON.stringify(rows().filter(r=>receiptIds241.includes(r.id))),M241=load('./canonical-migration233');
 for(let i=0;i<138;i++){const s=debtIds238[i],name='Backlog Fixture '+letters238(i),key=name.toLowerCase();await env.DB.prepare('INSERT INTO members(discord_id)VALUES(?)').bind(s).run();await env.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?,?,?,'member',?,?,'whisper',?)").bind(key,name,s,T-3600,T-3600,guid238(i)).run();await env.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,subject_generation,native_profile,native_rank,native_rank_name,native_guid,roster_id,created_at,expires_at,checked_at)VALUES(?,?,'canonical_consumed233',?, ?,1,'settled','canonical233_observed_without_dispatch',0,?, ?,9,'Initiate',?,1,?,?,?)").bind('e'.repeat(24)+i.toString(16).padStart(8,'0'),s,G,C.CANONICAL_RANKS233[11].roleId,G238,C.CANONICAL_PROFILE233,guid238(i),T-2000,T-1700,T-1999).run();}
 async function stage241(rank){const deferred=[];const response=await ingest.postRoster(env,{exportedAt:T,nativeGuild:scope.guild,nativeRealm:scope.realm,nativeRankTable:{version:1,names:C.NATIVE_NAMES233},members:members238(rank)},(label,work)=>{if(typeof work!=='function')throw Error('241_original_unstarted_defer_required');deferred.push({label,work});},undefined,true);check('241 actual complete Native roster registers one original unstarted pass',response.status===200&&deferred.length===1&&deferred[0].label==='fresh_roles_ingest');return deferred[0];}
 T++;const stage7_241=await stage241(7),venue241=await venue.captureRuntimeVenue230(env);if(venue241.mode!=='enabled')throw Error('241_original_migration_venue_required');const vf241=venue.runtimeVenue230Facts(venue241.venue),source241='2'.repeat(40),plan241={version:1,profile:M241.CANONICAL_MIGRATION_PROFILE233,guildId:G,operationId:'7'.repeat(32),epoch:vf241.epoch,seal:h(vf241.sealJSON),sourceTree:source241,policySHA256:h(env.CANONICAL_RANKS233),packetSHA256:'3'.repeat(64),issuedAt:T,expiresAt:T+120,entries:[{subject:A,generation:G238,currentRoles:[C.CANONICAL_RANKS233[7].roleId],targetRole:C.CANONICAL_RANKS233[8].roleId}]};
 env.CANONICAL_MIGRATION233=JSON.stringify(plan241);env.CANONICAL_MIGRATION_SOURCE_TREE233=source241;http=[];const migrated241=await central.migrateCanonicalRank233(env,A,{limit:40,attempts:0,retries:0});
 check('241 genuine Native M7 PUT+DELETE keeps original routine last_rank6 separate',migrated241.state==='settled'&&migrated241.targetOwned&&put()===1&&del()===1&&present.includes(C.CANONICAL_RANKS233[8].roleId)&&!present.includes(C.CANONICAL_RANKS233[7].roleId)&&db.prepare("SELECT native_rank FROM role_settlements WHERE subject=? AND native_profile=? AND purpose IN('canonical_consumed233','canonical_routine233') AND desired=1 AND state='settled' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(A,C.CANONICAL_PROFILE233).native_rank===6);
 const mIds241=rows().filter(r=>r.subject===A&&r.native_profile===M241.CANONICAL_MIGRATION_PROFILE233).map(r=>r.id),mBytes241=JSON.stringify(rows().filter(r=>mIds241.includes(r.id)));T++;const stage6_241=await stage241(6);http=[];const restored241=await stage7_241.work();
 check('241 original delayed pass sees latest Native6 and restores6 ahead of138 initial catchups',restored241.state==='done'&&restored241.counts.visits<=10&&restored241.counts.requests<=40&&restored241.counts.statements+5<=388&&put()===1&&del()===1&&present.includes(C.CANONICAL_RANKS233[7].roleId)&&!present.includes(C.CANONICAL_RANKS233[8].roleId));
 check('241 restoration audits actual issuer snapshot and has new original routine6 ACK',lastAttempt238()?.rank===6&&lastAttempt238()?.result==='settled'&&db.prepare("SELECT json_extract(details,'$.n') n FROM audit WHERE actor='system' AND action='role.native232_attempt' AND subject=? ORDER BY ts DESC,id DESC LIMIT 1").get(A).n===db.prepare('SELECT MAX(id) n FROM roster_snapshots').get().n&&own233().some(r=>r.purpose==='canonical_routine233'&&r.native_rank===6));
 check('241 Native delta never rewrites original ACK/M receipt/G/GUID/verification clocks',identity238()===original241&&JSON.stringify(rows().filter(r=>receiptIds241.includes(r.id)))===receiptBytes241&&JSON.stringify(rows().filter(r=>mIds241.includes(r.id)))===mBytes241);const afterRestoreHTTP241=http.length;await stage6_241.work();check('241 remaining original callback closes at existing interval without replay',http.length===afterRestoreHTTP241);db.close();

 code=await setup233(6);reply=await invoke(code);options.putUnknown=true;T++;await upload238(7);const unknown238=rows().find(r=>r.state==='unknown'&&r.attempts===1),unknownBytes238=JSON.stringify(unknown238);check('genuine lost original PUT stays unknown after one owned removal without compensation guess',!!unknown238&&put()===1&&del()===1);options.putUnknown=false;T++;await upload238(6);check('priority never retries or erases all-generation original unknown custody',put()===0&&del()===0&&JSON.stringify(rows().find(r=>r.id===unknown238?.id))===unknownBytes238);db.close();
 code=await setup233(6);reply=await invoke(code);await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();T++;await upload238(7);check('current restriction gets owned removal and never replacement rank',del()===1&&put()===0&&!present.includes(C.CANONICAL_RANKS233[7].roleId)&&!present.includes(C.CANONICAL_RANKS233[8].roleId));db.close();
 code=await setup233(6);reply=await invoke(code);T+=601;http=[];const counter238={used:0},counted238=E238.countStatements(env,counter238),budget238=load('./roles').callBudget(counted238);F238.forgetFreshPassThrottle();const stale238=await F238.runFreshPass(counted238,{calls:budget238,adm:F238.nativeAdmission232(counter238,700)},'ingest',L238.captureLaneConfig(counted238));check('stale snapshot still holds at original opaque issuer with no priority effect',stale238.counts.held>=1&&put()===0&&del()===0&&present.includes(C.CANONICAL_RANKS233[7].roleId));db.close();

 // .249: exercise actual HMAC receiver + original child pass, not a 202-only wake stub.
 // The61 inherited backlog fixtures must still hold at the real opaque issuer;
 // only the original consumed account has genuine grant authority in this test.
 code=await setup233(6);reply=await invoke(code);await backlog238(61);await stage241(6);
 const snapshot249=db.prepare('SELECT MAX(id) n FROM roster_snapshots').get().n;
 const W249=load('./role-reconcile242'),jobs249=[],signals249=[],physical249=[],oldFetch249=testFetch;
 const bridge249=async(url,init)=>{
  const destination249=new URL(String(url));if(destination249.origin!=='https://verify.example'||destination249.pathname!=='/internal/roles242/continue')return oldFetch249(url,init);
  if(String(url)!=='https://verify.example/internal/roles242/continue'||init.method!=='POST'||init.redirect!=='manual')throw Error('249_fixed_signed_child_destination');
  const payload=JSON.parse(init.body);signals249.push(payload);
  const count={used:0},childEnv=E238.countStatements(env,count);
  const response=await W249.handleRoleContinuation242(new Request(url,{method:init.method,headers:init.headers,body:init.body}),childEnv,(label,work)=>jobs249.push({label,work,count}));
  if(response.status!==202)throw Error('249_actual_signed_child_refused');return response;
 };
 const drain249=async()=>{let steps=0;while(jobs249.length){if(++steps>100)throw Error('249_unbounded_continuation');const job=jobs249.shift();await job.work();physical249.push(job.count.used);}};
 testFetch=bridge249;http=[];
 try{await W249.kickRoleWork242(env,'sweep');await drain249();}finally{testFetch=oldFetch249;}
 const walk249=db.prepare("SELECT json_extract(details,'$.walk') walk FROM audit WHERE action='role.native232_attempt' AND json_type(details,'$.walk')='text' ORDER BY id DESC LIMIT 1").get()?.walk;
 const checked249=db.prepare("SELECT subject,COUNT(*) n FROM audit WHERE actor='system' AND action='role.native232_attempt' AND json_extract(details,'$.walk')=? GROUP BY subject").all(walk249);
 check('249 actual signed child chain drains62 candidates across the50-row window',signals249.length>=7&&signals249.length<20&&jobs249.length===0&&checked249.length===62&&checked249.every(r=>r.n===1));
 check('249 every continuation preserves the same fixed snapshot and sweep generation',/^[a-f0-9]{32}$/.test(walk249)&&signals249.slice(1).every(p=>p.sweep?.id===walk249&&p.sweep.n===snapshot249));
 check('249 each actual child retains850 physical work plus5 nonce admission and40HTTP/max10 fences',physical249.every(n=>n<=855)&&db.prepare("SELECT details FROM audit WHERE action='role.fresh_state' AND json_extract(details,'$.walk')=?").all(walk249).every(r=>{const d=JSON.parse(r.details);return d.visits<=10&&d.attempts<=40;}));
 check('249 stable already-correct chain performs no role effects',put()===0&&del()===0&&present.includes(C.CANONICAL_RANKS233[7].roleId));
 const oldSnapshot249=signals249.at(-1).sweep.n,attemptCount249=checked249.reduce((n,r)=>n+r.n,0);T++;const newer249=await stage241(7);http=[];
 testFetch=bridge249;const oldSignals249=signals249.length;
 try{await W249.kickRoleWork242(env,'sweep',{id:walk249,n:oldSnapshot249});await drain249();}finally{testFetch=oldFetch249;}
 check('249 superseded snapshot stops one signed child without resetting or replaying its generation',signals249.length===oldSignals249+1&&jobs249.length===0&&put()===0&&del()===0&&db.prepare("SELECT COUNT(*) n FROM audit WHERE action='role.native232_attempt' AND json_extract(details,'$.walk')=?").get(walk249).n===attemptCount249);
 http=[];const urgent249=await newer249.work();
 check('249 fresh original ingest still prioritizes the new urgent Raider delta',urgent249.state==='done'&&put()===1&&del()===1&&present.includes(C.CANONICAL_RANKS233[8].roleId)&&!present.includes(C.CANONICAL_RANKS233[7].roleId));db.close();

 // A new scheduling generation cannot replay the original all-generation unknown.
 code=await setup233(6,{putUnknown:true});reply=await invoke(code);
 const originalUnknown249=rows().find(r=>r.state==='unknown'&&r.attempts===1),unknownBytes249=JSON.stringify(originalUnknown249);
 check('249 unknown-chain fixture starts with one actual lost original PUT',!!originalUnknown249&&put()===1);
 options.putUnknown=false;await backlog238(61);await stage241(6);jobs249.length=0;signals249.length=0;http=[];testFetch=bridge249;
 try{await W249.kickRoleWork242(env,'sweep');await drain249();}finally{testFetch=oldFetch249;}
 check('249 complete signed continuation chain never replays or alters original unknown custody',jobs249.length===0&&signals249.length<20&&put()===0&&del()===0&&JSON.stringify(rows().find(r=>r.id===originalUnknown249?.id))===unknownBytes249);db.close();

 // Inactive private subjects are excluded; an active generation race may deny
 // the progress audit and must stop held without forcing private audit bytes.
 code=await setup233(6);reply=await invoke(code);await backlog238(61);
 await stage241(6);const inactive249=debtIds238[0];await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'retiring',1,?3,?3)").bind(inactive249,'d'.repeat(32),T).run();
 jobs249.length=0;signals249.length=0;http=[];testFetch=bridge249;
 try{await W249.kickRoleWork242(env,'sweep');await drain249();}finally{testFetch=oldFetch249;}
 check('249 inactive historical candidate cannot perpetuate a self-wake or receive private visit audit',jobs249.length===0&&signals249.length<20&&db.prepare("SELECT COUNT(*) n FROM audit WHERE action='role.native232_attempt' AND subject=? AND json_type(details,'$.walk')='text'").get(inactive249).n===0);
 db.close();code=await setup233(6);reply=await invoke(code);await backlog238(61);T++;await stage241(7);
 let raced249=false;options.onHTTP=async(method)=>{if(!raced249&&method==='GET'){raced249=true;await env.DB.prepare("UPDATE privacy_subjects SET generation=?1,revision=revision+1 WHERE subject_id=?2").bind('e'.repeat(32),A).run();}};
 jobs249.length=0;signals249.length=0;http=[];testFetch=bridge249;
 try{await W249.kickRoleWork242(env,'sweep');await drain249();}finally{testFetch=oldFetch249;}
 check('249 changed-G refused visit stamp holds chain without a second self-wake or role replay',raced249&&signals249.length===1&&jobs249.length===0&&put()===0&&del()===0&&db.prepare("SELECT COUNT(*) n FROM audit WHERE action='role.native232_attempt' AND subject=? AND json_type(details,'$.walk')='text'").get(A).n===0);db.close();


 // .262: exceed the real16-hop transport boundary, lose the next self-wake,
 // then enter through an independent root with no supplied sweep token.
 code=await setup233(6,{putUnknown:true});reply=await invoke(code);
 const originalUnknown262=rows().find(r=>r.state==='unknown'&&r.attempts===1),unknownBytes262=JSON.stringify(originalUnknown262),identity262=identity238();
 check('262 deep-resume fixture preserves a genuine original unknown rather than minting authority',!!originalUnknown262&&put()===1);
 options.putUnknown=false;await backlog238(206);await stage241(6);http=[];
 const snapshot262=db.prepare('SELECT MAX(id) n FROM roster_snapshots').get().n,jobs262=[],signals262=[],physical262=[];
 let refuseHandoff262=true,handoffFailures262=0,steps262=0;
 const state262=()=>JSON.parse(db.prepare("SELECT details FROM audit WHERE actor='system' AND action='role.fresh_state' ORDER BY id DESC LIMIT 1").get().details);
 const visits262=walk=>db.prepare("SELECT subject,COUNT(*) n FROM audit WHERE actor='system' AND action='role.native232_attempt' AND json_extract(details,'$.walk')=? GROUP BY subject").all(walk);
 const bridge262=async(url,init)=>{
  if(String(url)!=='https://verify.example/internal/roles242/continue')return oldFetch249(url,init);
  const payload=JSON.parse(init.body);signals262.push(payload);
  if(refuseHandoff262&&signals262.length===17)return new Response('synthetic private failed handoff body',{status:503});
  const count={used:0},childEnv=E238.countStatements(env,count);
  const response=await W249.handleRoleContinuation242(new Request(url,{method:init.method,headers:init.headers,body:init.body}),childEnv,(label,work)=>jobs262.push({label,work,count}));
  if(response.status!==202)throw Error('262_actual_signed_child_refused');return response;
 };
 async function drain262(){while(jobs262.length){if(++steps262>200)throw Error('262_finite_resume_bound');const job=jobs262.shift();try{await job.work();}catch(error){if(error?.message!=='role242_continuation_held'||error?.status!==503)throw error;handoffFailures262++;}physical262.push(job.count.used);}}
 testFetch=bridge262;
 try{await W249.kickRoleWork242(env,'sweep');await drain262();}finally{testFetch=oldFetch249;}
 const pending262=state262(),walk262=pending262.walk,firstVisits262=visits262(walk262),restart262=signals262.length;
 check('262 failed seventeenth signed self-handoff leaves one confirmed pending generation',handoffFailures262===1&&signals262.length===17&&jobs262.length===0&&pending262.continuation===true&&pending262.n===snapshot262&&/^[a-f0-9]{32}$/.test(walk262)&&firstVisits262.length>0&&firstVisits262.length<207);
 check('262 pending max-ten checkpoint does not infer continuation from a nonnull stop',db.prepare("SELECT details FROM audit WHERE action='role.fresh_state' AND json_extract(details,'$.walk')=?").all(walk262).some(r=>{const d=JSON.parse(r.details);return d.continuation===true&&d.visits===10&&d.stop===null;}));
 refuseHandoff262=false;testFetch=bridge262;
 try{await W249.kickRoleWork242(env,'sweep');await drain262();}finally{testFetch=oldFetch249;}
 const allVisits262=visits262(walk262),complete262=state262();
 check('262 independent root resumes after depth16 without a supplied token or new walk',signals262[restart262].kind==='sweep'&&!signals262[restart262].sweep&&signals262.slice(restart262+1).every(p=>p.sweep?.id===walk262&&p.sweep.n===snapshot262)&&complete262.walk===walk262&&complete262.n===snapshot262);
 check('262 root-resumed real Native chain completes207 distinct subjects without repeating visits',allVisits262.length===207&&allVisits262.every(r=>r.n===1)&&complete262.continuation===false&&jobs262.length===0);
 check('262 resumption retains original physical850+5 and per-pass10/40 admission',physical262.every(n=>n<=855)&&db.prepare("SELECT details FROM audit WHERE action='role.fresh_state' AND json_extract(details,'$.walk')=?").all(walk262).every(r=>{const d=JSON.parse(r.details);return d.visits<=10&&d.attempts<=40;}));
 const root262=async()=>{const count={used:0},bounded=E238.countStatements(env,count),calls=load('./roles').callBudget(bounded);return F238.runFreshPass(bounded,{calls,adm:F238.nativeAdmission232(count,850)},'ingest',L238.captureLaneConfig(bounded));};
 const oldCount262=allVisits262.length;await root262();
 check('262 completed checkpoint is not reused by a later normal root',state262().walk!==walk262&&visits262(walk262).length===oldCount262);
 const hint262={...state262(),walk:'c'.repeat(32),n:snapshot262,continuation:true};
 for(const [label,action,value] of [
  ['reference-free tick','role.fresh_tick',hint262],
  ['completed state','role.fresh_state',{...hint262,continuation:false}],
  ['superseded snapshot','role.fresh_state',{...hint262,n:snapshot262-1}],
  ['malformed walk','role.fresh_state',{...hint262,walk:'C'.repeat(32)}],
  ['truthy nonboolean','role.fresh_state',{...hint262,continuation:1}]
 ]){
  await env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'system',?,'ingest',?)").bind(T,action,JSON.stringify(value)).run();const before=visits262(value.walk).length;await root262();
  check('262 '+label+' cannot be inferred into resumable Native state',state262().walk!==value.walk&&state262().n===snapshot262&&visits262(value.walk).length===before);
 }
 check('262 deep failure/resume and rejected checkpoints never retry or alter original unknown/G/GUID',put()===0&&del()===0&&JSON.stringify(rows().find(r=>r.id===originalUnknown262.id))===unknownBytes262&&identity238()===identity262);db.close();

 // .263: lose only the RETURNING payload after the actual Native transaction
 // commits. The original entry port, admission/control replies and issuer stay real.
 const originalD1263=d1;
 for(const mode263 of ['lost-acquire','foreign-lease','release-error','release-unconfirmed']){
  const fault263={armed:false,read:null,candidate:null,commits:[],releases:[],releaseFailures:0,logs:[]};
  d1=raw=>entry.originalNativePort(raw,{
   beforeRead(sql,params){fault263.read={sql,params};},
   readStatement(statement,params){
    const actual=statement.all(...params),read=fault263.read;
    if(fault263.armed&&read?.sql===L238.FRESH_LEASE_ACQUIRE&&mode263!=='foreign-lease'){
     if(actual.length!==1||actual[0].key!==L238.FRESH_LEASE_KEY)throw Error('263_real_acquisition_payload_required');
     fault263.candidate=read.params[0];return [];
    }
    return actual;
   },
   beforeRun(sql,params){
    if(!fault263.armed||sql!==L238.FRESH_LEASE_RELEASE)return;
    fault263.releases.push({candidate:params[0],changes:null});
    if(mode263==='release-error'){fault263.releaseFailures++;throw Object.assign(Error('D1_synthetic_private_release_message263'),{status:503});}
   },
   afterBatch(plan,out){
    if(fault263.armed)for(let i=0;i<plan.length;i++){
     if(plan[i].sql===L238.FRESH_LEASE_ACQUIRE)fault263.commits.push({candidate:plan[i].params[0],value:raw.prepare('SELECT value FROM site_settings WHERE key=?').get(L238.FRESH_LEASE_KEY)?.value});
     if(plan[i].sql===L238.FRESH_LEASE_RELEASE){fault263.releases.at(-1).changes=out[i].meta.changes;if(mode263==='release-unconfirmed')out[i]={...out[i],meta:{...out[i].meta,changes:2}};}
    }
    batchHook?.(plan,out);
   }
  });
  try{
   code=await setup233(6);reply=await invoke(code);if(!reply.body.roleGranted)throw Error('263_genuine_original_ACK_required');
   T++;await stage241(7);http=[];
   const originalACK263=JSON.stringify(rows()),identity263=identity238(),control263=JSON.stringify(db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').get());
   let physical263=0;const root263=async()=>{const count={used:0},bounded=E238.countStatements(env,count),calls=load('./roles').callBudget(bounded);try{return await F238.runFreshPass(bounded,{calls,adm:F238.nativeAdmission232(count,850)},'ingest',L238.captureLaneConfig(bounded));}finally{physical263=count.used;}};
   const foreign263=L238.freshLeaseValue(T+L238.FRESH_LEASE_SECONDS,'b'.repeat(32));
   if(mode263==='foreign-lease')await env.DB.prepare(L238.FRESH_LEASE_ACQUIRE).bind(foreign263).first();
   const visitsBefore263=db.prepare("SELECT COUNT(*) n FROM audit WHERE action='role.native232_attempt'").get().n;
   const oldLog263=console.log,oldError263=console.error;let result263;
   fault263.armed=true;
   console.log=(...args)=>fault263.logs.push({level:'log',args});console.error=(...args)=>fault263.logs.push({level:'error',args});
   try{result263=await root263();}finally{console.log=oldLog263;console.error=oldError263;fault263.armed=false;}
   const lease263=db.prepare('SELECT value FROM site_settings WHERE key=?').get(L238.FRESH_LEASE_KEY)?.value,release263=fault263.releases[0];
   check('263 '+mode263+' unacknowledged acquisition never visits, grants, or adopts original authority',result263.state==='skipped'&&result263.reason==='lease_held'&&result263.counts.visits===0&&put()===0&&del()===0&&db.prepare("SELECT COUNT(*) n FROM audit WHERE action='role.native232_attempt'").get().n===visitsBefore263&&JSON.stringify(rows())===originalACK263&&identity238()===identity263);
   check('263 '+mode263+' uses one exact candidate cleanup with unchanged admission controls and850 budget',fault263.commits.length===1&&fault263.releases.length===1&&release263.candidate===fault263.commits[0].candidate&&JSON.stringify(db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').get())===control263&&physical263>0&&physical263<=850);
   if(mode263==='foreign-lease')check('263 foreign owner survives a legitimate zero-change exact-CAS release',lease263===foreign263&&fault263.commits[0].value===foreign263&&release263.changes===0&&fault263.logs.length===0);
   else{
    check('263 '+mode263+' actually commits the original candidate before hiding its reply',fault263.candidate===fault263.commits[0].candidate&&fault263.commits[0].value===fault263.candidate&&JSON.parse(fault263.candidate).leaseUntil===T+300);
    if(mode263==='lost-acquire'){
     check('263 committed acquisition with lost ACK is cleared with only a fixed positive label',lease263==='{"leaseUntil":0}'&&release263.changes===1&&JSON.stringify(fault263.logs)===JSON.stringify([{level:'log',args:['native232_lease_unconfirmed_acquisition_cleaned']}]));
     http=[];const recovered263=await root263();
     check('263 later acknowledged original root can perform the owed rank transition once',recovered263.state==='done'&&recovered263.counts.visits===1&&put()===1&&del()===1&&present.includes(C.CANONICAL_RANKS233[8].roleId)&&!present.includes(C.CANONICAL_RANKS233[7].roleId)&&identity238()===identity263);
    }else if(mode263==='release-error')check('263 release failure retains the300s fallback and logs bounded status without its message',lease263===fault263.candidate&&fault263.releaseFailures===1&&JSON.stringify(fault263.logs)===JSON.stringify([{level:'error',args:['native232_lease_release_held','upstream(503)','other_d1']}]));
    else check('263 unknown release metadata is held rather than reported as positive cleanup',lease263==='{"leaseUntil":0}'&&release263.changes===1&&JSON.stringify(fault263.logs)===JSON.stringify([{level:'error',args:['native232_lease_release_held','error','other_d1']}]));
   }
  }finally{fault263.armed=false;d1=originalD1263;if(db?.isOpen)db.close();}
 }

 // .264 cleanup faults execute the original acquisition once. Only its reply
 // is hidden; a transient error is injected before the first release payload.
 const cleanupCases264=[
  {name:'overload',message:'D1_ERROR: D1 DB is overloaded. Too many requests queued.',reason:'overloaded',retry:true},
  {name:'queued timeout',message:'D1_ERROR: D1 DB is overloaded. Requests queued for too long.',reason:'queue_timeout',retry:true},
  {name:'busy',message:'D1_ERROR: database is locked: SQLITE_BUSY',reason:'overloaded',retry:true},
  {name:'query limit',message:'D1_ERROR: Too many API requests by single Worker invocation',reason:'query_limit'},
  {name:'CPU or memory',message:"D1_ERROR: D1 DB's isolate exceeded its memory limit and was reset.",reason:'cpu_or_memory'},
  {name:'SQL compilation',message:'D1_ERROR: no such table: synthetic264',reason:'sql_compile'},
  {name:'admission guard',message:'privacy_write_admission_held:synthetic264',reason:'admission_guard'},
  {name:'unknown D1',message:'D1_synthetic_private_cleanup264',reason:'other_d1'},
  {name:'no physical room',message:'D1_ERROR: D1 DB is overloaded. Too many requests queued.',reason:'overloaded',limit:28},
  {name:'no admission counter',message:'D1_ERROR: D1 DB is overloaded. Too many requests queued.',reason:'overloaded',noAdm:true},
  {name:'original unknown preserved',message:'D1_ERROR: D1 DB is overloaded. Too many requests queued.',reason:'overloaded',retry:true,originalUnknown:true}
 ];
 for(const spec264 of cleanupCases264){
  const fault264={armed:false,read:null,candidate:null,commit:null,releases:[],logs:[],count:null,bounded:null,failures:0};
  d1=raw=>entry.originalNativePort(raw,{
   beforeRead(sql,params){fault264.read={sql,params};},
   readStatement(statement,params){const actual=statement.all(...params);if(fault264.armed&&fault264.read.sql===L238.FRESH_LEASE_ACQUIRE){if(actual.length!==1||actual[0].key!==L238.FRESH_LEASE_KEY)throw Error('264_actual_acquisition_required');fault264.candidate=fault264.read.params[0];return [];}return actual;},
   async beforeRun(sql,params){
    if(!fault264.armed||sql!==L238.FRESH_LEASE_RELEASE)return;
    fault264.releases.push({candidate:params[0],changes:null});
    if(fault264.failures++===0){
     // Real admitted read work consumes the remaining room, never a fake count.
     if(spec264.limit===28)await fault264.bounded.DB.batch(Array.from({length:12},()=>fault264.bounded.DB.prepare('SELECT 1 AS real_budget_read264')));
     throw Error(spec264.message);
    }
   },
   afterBatch(plan,out){if(fault264.armed)for(let i=0;i<plan.length;i++){if(plan[i].sql===L238.FRESH_LEASE_ACQUIRE)fault264.commit=raw.prepare('SELECT value FROM site_settings WHERE key=?').get(L238.FRESH_LEASE_KEY)?.value;if(plan[i].sql===L238.FRESH_LEASE_RELEASE)fault264.releases.at(-1).changes=out[i].meta.changes;}batchHook?.(plan,out);}
  });
  try{
   code=await setup233(6);reply=await invoke(code);if(!reply.body.roleGranted)throw Error('264_original_owned_ACK_required');
   let unknown264=null;
   if(spec264.originalUnknown){options.putUnknown=true;T++;await(await stage241(7)).work();options.putUnknown=false;unknown264=rows().find(row=>row.state==='unknown'&&row.attempts===1);if(!unknown264)throw Error('264_actual_original_unknown_required');T++;await stage241(6);}
   else{T++;await stage241(7);}
   http=[];const custody264=JSON.stringify(rows()),identity264=identity238(),control264=JSON.stringify(db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').get());
   const count={used:0},bounded=E238.countStatements(env,count),calls=load('./roles').callBudget(bounded);fault264.count=count;fault264.bounded=bounded;
   const oldLog264=console.log,oldError264=console.error;let result264;fault264.armed=true;
   console.log=(...args)=>fault264.logs.push({level:'log',args});console.error=(...args)=>fault264.logs.push({level:'error',args});
   try{result264=await F238.runFreshPass(bounded,{calls,...(spec264.noAdm?{}:{adm:F238.nativeAdmission232(count,spec264.limit??850)})},'ingest',L238.captureLaneConfig(bounded));}
   finally{fault264.armed=false;console.log=oldLog264;console.error=oldError264;}
   const lease264=db.prepare('SELECT value FROM site_settings WHERE key=?').get(L238.FRESH_LEASE_KEY)?.value,expectedCategory264=spec264.reason==='admission_guard'?'error':'d1';
   console.log('CLEANUP264_SYNTHETIC_WITNESS',JSON.stringify({name:spec264.name,result:result264,physical:count.used,committedAcquisition:fault264.commit===fault264.candidate,releaseAttempts:fault264.releases.length,releaseChanges:fault264.releases.map(row=>row.changes),logs:fault264.logs}));
   check('264 '+spec264.name+' has real committed acquisition, no visit/effect, and unchanged original custody',result264.state==='skipped'&&result264.reason==='lease_held'&&result264.counts.visits===0&&put()===0&&del()===0&&fault264.commit===fault264.candidate&&typeof fault264.candidate==='string'&&JSON.stringify(rows())===custody264&&identity238()===identity264&&JSON.stringify(db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').get())===control264);
   check('264 '+spec264.name+' uses exact original candidate within unchanged physical budget',fault264.releases.length===(spec264.retry?2:1)&&fault264.releases.every(row=>row.candidate===fault264.candidate)&&count.used<=(spec264.limit??850));
   const expectedLogs264=[{level:'error',args:['native232_lease_release_held',expectedCategory264,spec264.reason]}];
   if(spec264.retry)expectedLogs264.push({level:'log',args:['native232_lease_cleanup_retry',spec264.reason]},{level:'log',args:['native232_lease_unconfirmed_acquisition_cleaned']},{level:'log',args:['native232_lease_cleanup_retry_returned','cleared']});
   check('264 '+spec264.name+' logs only exact bounded labels/reason and preserves unknown fallback',JSON.stringify(fault264.logs)===JSON.stringify(expectedLogs264)&&lease264===(spec264.retry?'{"leaseUntil":0}':fault264.candidate)&&(!spec264.retry||fault264.releases[1].changes===1));
   if(spec264.limit===28)check('264 actual13-statement read group leaves one slot and refuses extra five-statement cleanup',count.used===27&&fault264.releases.length===1);
   if(unknown264){http=[];await root262();check('264 successful lease-only retry never retries or rewrites the original spent unknown role',put()===0&&del()===0&&JSON.stringify(rows().find(row=>row.id===unknown264.id))===JSON.stringify(unknown264));}
  }finally{fault264.armed=false;d1=originalD1263;if(db?.isOpen)db.close();}
 }

 // .264: two independently authenticated roots over the ORIGINAL Native DB.
 // Eleven unproven backlog identities never become authority; they make the
 // first root durably pending so omission of recursive defer is observable.
 let nativePort264;const previousD1264=d1;
 d1=raw=>(nativePort264=entry.originalNativePort(raw,{afterBatch:(plan,out)=>batchHook?.(plan,out)}));
 try{
  code=await setup233(6);reply=await invoke(code);if(!reply.body.roleGranted)throw Error('264_original_consumed_ACK_required');
  await backlog238(11);T++;await stage241(6);http=[];
  const original264=identity238(),originalRows264=rows(),originalIds264=new Set(originalRows264.map(row=>row.id)),ackBytes264=JSON.stringify(originalRows264),snapshot264=db.prepare('SELECT MAX(id) n FROM roster_snapshots').get().n,jobs264=[],roots264=[],oldFetch264=testFetch;
  let selfFetch264=0;testFetch=async()=>{selfFetch264++;throw Error('264_independent_root_must_not_self_fetch');};
  const signedRoot264=body=>{const text=JSON.stringify(body),signature=require('node:crypto').createHmac('sha256',env.COOKIE_SECRET).update('role-continuation280-v2\nhttps://verify.example\n'+text).digest('hex');return new Request('https://verify.example/internal/roles242/continue',{method:'POST',headers:{'X-Olympus-Role-Continuation':signature},body:text});};
  try{
   for(let i=0;i<2;i++){
    const before=nativePort264.nativeTrace.length,body={version:2,at:T,independent:true,kind:'sweep',nonce:require('node:crypto').randomUUID()},response=await W249.handleRoleContinuation242(signedRoot264(body),env,(label,work)=>jobs264.push({label,work}));
    check('264 independent root'+i+' validates HMAC/nonce before one unstarted original job',response.status===202&&jobs264.length===1&&jobs264[0].label==='roles242_work');
    const job=jobs264.shift();await job.work();const state=JSON.parse(db.prepare("SELECT details FROM audit WHERE actor='system' AND action='role.fresh_state' ORDER BY id DESC LIMIT 1").get().details);roots264.push(state);
    check('264 independent root'+i+' returns without recursive child and retains855 physical including nonce',jobs264.length===0&&selfFetch264===0&&nativePort264.nativeTrace.length-before<=855&&state.n===snapshot264&&state.attempts<=40&&state.visits<=10);
   }
  }finally{testFetch=oldFetch264;}
  const visited264=db.prepare("SELECT subject,COUNT(*) n FROM audit WHERE action='role.native232_attempt' AND json_extract(details,'$.walk')=? GROUP BY subject").all(roots264[0].walk);
  check('264 independent root resumes only the exact pending current generation across separate signals',roots264[0].continuation===true&&roots264[0].visits===10&&roots264[1].walk===roots264[0].walk&&roots264[1].n===roots264[0].n&&roots264[1].continuation===false&&visited264.length===12&&visited264.every(row=>row.n===1));
  // A genuine already-correct visit records a new unclaimed observation. It
  // cannot become an ACK or ownership; every preexisting row remains exact.
  const after264=rows(),appended264=after264.filter(row=>!originalIds264.has(row.id)),role264=C.CANONICAL_RANKS233[7].roleId;
  const expected264={subject:A,purpose:'canonical_routine233',proof_id:null,guild_id:G,role_id:role264,desired:1,state:'settled',reason:'canonical233_observed_without_dispatch',claim_nonce:null,subject_generation:G238,
   request_digest:h(JSON.stringify(N.historicalNativeRankPolicy232())+'|'+A+'|'+G238+'|'+snapshot264+'|'+role264+'|1|'+env.CANONICAL_RANKS233),roster_id:snapshot264,native_guid:'Player-4613-12345678',native_profile:C.CANONICAL_PROFILE233,native_rank:6,native_rank_name:N.NATIVE_RANK_NAMES232[6],attempts:0,created_at:T,expires_at:T+300,checked_at:T};
  const originalRowsUnchanged264=JSON.stringify(after264.filter(row=>originalIds264.has(row.id)))===ackBytes264,appendColumns264=['id',...Object.keys(expected264)].sort().join(',');
  console.log('INDEPENDENT264_NATIVE_CUSTODY_WITNESS',JSON.stringify({put:put(),delete:del(),originalRows:originalRows264.length,originalRowsUnchanged:originalRowsUnchanged264,identityUnchanged:identity238()===original264,appended:appended264,expectedObservation:expected264}));
  check('264 independent scheduling creates no new trust or role effect and preserves original ACK/G/GUID',put()===0&&del()===0&&originalRowsUnchanged264&&identity238()===original264);
  check('264 genuine stable visit appends exactly one complete unclaimed observation and no new ACK',appended264.length===1&&appended264.every(row=>/^[a-f0-9]{32}$/.test(row.id)&&Object.keys(row).sort().join(',')===appendColumns264&&Object.entries(expected264).every(([key,value])=>row[key]===value)));
 }finally{d1=previousD1264;if(db?.isOpen)db.close();}

 testFetch=originalFetch257;
 console.log(ok+'/'+n+' canonical238 original Native ingest checks passed');process.exitCode=ok===n?0:1;
`;
source238=source238.slice(0,source238.indexOf(first238))+body238+source238.slice(source238.indexOf(last238)+last238.length);
const m238=new Module238(__filename,module);m238.filename=__filename;m238.paths=module.paths;m238._compile(source238,__filename);
