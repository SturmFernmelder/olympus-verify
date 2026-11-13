'use strict';
// Evergreen 12 Nov 2026, ban lane: genuine Workerd/D1 behaviour of /olympus-admin ban, unban and the banned sweep.
// Owner ruling (12 Nov 2026): "A ban removes the member's Olympus rank role immediately, whether the bot or a staff
// member granted it, as bans did before .233." Only Discord HTTP is synthetic; D1, the Native admission layout, the
// clock and every source callback are the real ones. `--root <worker dir>` runs the same checks against another
// checkout (read-only: it is bundled from there into a temporary directory) to record fail-before.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const at=process.argv.indexOf('--root'),root=at>0?path.resolve(process.argv[at+1]):path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'olv-ban1112-')),seedPath=path.join(out,'seed.json');
const seeded=cp.spawnSync(process.execPath,[path.join(root,'tests','launch_membership231_seed.cjs'),seedPath],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4e6});
fs.writeFileSync(path.join(out,'seed.log'),(seeded.stdout||'')+(seeded.stderr||''));assert.equal(seeded.status,0,'original_native_seed');
const seed=JSON.parse(fs.readFileSync(seedPath,'utf8')),{buildSync}=require(require.resolve('esbuild',{paths:[root]})),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[root]}));
const fixtureSource=fs.readFileSync(path.join(__dirname,'evergreen1112_ban_workerd_fixture.mjs'),'utf8');
const built=buildSync({stdin:{contents:fixtureSource+'\nimport seed1112 from '+JSON.stringify(seedPath)+';\nexport default fixture1112(seed1112);\n',resolveDir:path.join(root,'tests'),sourcefile:'evergreen1112-ban-entry.mjs'},absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
const G=seed.config.GUILD_ID,BOT=seed.config.DISCORD_APP_ID,BOTROLE='888888888888888888',HIGH='777777777777777777',ADDON='1555944857380458556',TOKEN=seed.config.DISCORD_BOT_TOKEN;
const RANKS=[['Olympus Guild Master','1554261979684933742'],['Olympus High Council','1567917738985398384'],['Olympus Officer','1554262223038324840'],['Olympus Officer Alt','1561096070040125460'],['Olympus Raid Leader','1554262510650007602'],['Olympus Branch GM','1555639603619172504'],['Olympus Branch Officer','1555640676287385771'],['Olympus Veteran','1561096452057596005'],['Olympus Raider','1561096598296076460'],['Olympus Member','1552077551839617104'],['Olympus Alt','1561096900378103808'],['Olympus Initiate','1561097105974628372']];
const LEGACY=['1561095726115725373','1561095748039221339','1561095893007073371','1561096328409251880','1561096679778947113','1568117859970842735'];
const ALL=[...RANKS.map(r=>r[1]),...LEGACY],ID=Object.fromEntries(RANKS.map(([name,id])=>[name.replace('Olympus ','').replace(' ','').toLowerCase(),id]));
const MEMBER=ID.member,VETERAN=ID.veteran,OFFICER=ID.officer,RAIDER=ID.raider,RETIRED=LEGACY[0],OTHER='222222222222222222',SUBJECT=seed.tables.find(t=>t.name==='pending').rows[0].discord_id;
// Successor (12 Nov 2026): cross-purpose, cross-generation rows that must each keep the same-role fence on Veteran.
const CANONICAL_PROFILE='olympus-canonical-ranks-20261106-v1',MIGRATION_PROFILE='olympus-canonical-migration-20261106-v1',NATIVE_PROFILE='olympus-prime-live-20261105-v1',BAN_PROFILE='olympus-ban-rank-removal-20261112-v1',BAN='canonical_ban_remove_v1';
const XP=[['ban-delete',BAN,0,BAN_PROFILE],['routine-put','canonical_routine233',1,CANONICAL_PROFILE],['routine-delete','canonical_routine233',0,CANONICAL_PROFILE],['consumed-put','canonical_consumed233',1,CANONICAL_PROFILE],['migration-put','canonical_migration233',1,MIGRATION_PROFILE],['migration-delete','canonical_migration_remove233',0,MIGRATION_PROFILE],['native-put','fresh_roster_rank',1,NATIVE_PROFILE],['native-delete','fresh_roster_rank',0,NATIVE_PROFILE]];
const XP_CASES=XP.flatMap(([key,purpose,desired,profile])=>[['older','e'.repeat(32)],['current',null]].map(([gen,generation])=>({kind:'xp-'+key+'-'+gen,purpose,desired,profile,generation})));
const ORIGINAL_KINDS=['bot-veteran','member-manual','officer-manual','retired-manual','stack','none','not-member','delete-404','delete-403','delete-429','unknown','unban-reban','race-reban','race-inflight','hierarchy','budget','sweep-cost','ack-loss','ack-loss-unread','lost-unban','erasure-debt','long-card','slice','progress','receipt-lost','receipt-lost-interrupted'];
const SUCCESSOR_KINDS=['late-delete','known-ack','known-migrate','known-nd','known-404','malformed-retired','malformed-variant','inserted-ack-control','effect-not-confirmed','confirm-unknown','lanes','lanes-walk',...XP_CASES.map(c=>c.kind)];
// Repair round (13 Nov 2026, independent review of the successor at 4951e61).
const REPAIR_KINDS=['oldlane-retired','oldlane-veteran','oldlane-getonly','legacy-removed','legacy-absent','lane-failed','lane-held','watcher-nolane','deferred-429'];
// Round 4 item 8 (13 Nov 2026): the unban reply for a removal in flight and for rows of other purposes.
const ROUND4_KINDS=['unban-inflight','unban-other-inflight','unban-mixed'];
const kinds=[...ORIGINAL_KINDS,...SUCCESSOR_KINDS,...REPAIR_KINDS,...ROUND4_KINDS];
const state=new Map(kinds.map(k=>[k,{present:new Map([[SUBJECT,new Set()],[OTHER,new Set([VETERAN])]]),del:{},held:[],member404:false,above:new Set(),managed:new Set(),renamed:new Set(),perm:new Set(),memberGetFail:0,onDelete:null,onFirstGet:null,patches:[],posts:[],http:[]}]));
let mf,checks=[];
const check=(name,value,detail)=>{checks.push({name,passed:value===true,...(value===true&&!process.env.BAN1112_DETAIL?{}:{detail})});console.log((value===true?'PASS ':'FAIL ')+name);};
const call=async(route,body={})=>{const r=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}),t=await r.text();assert.equal(r.status,200,route+': '+t);const x=JSON.parse(t);assert.equal(x.ok,true,route+': '+t);return x;};
const deletes=(k,from=0)=>state.get(k).http.slice(from).filter(h=>h.method==='DELETE');
const writes=k=>state.get(k).http.filter(h=>!['GET'].includes(h.method)&&!h.path.startsWith('/webhooks/'));
const present=(k,s=SUBJECT)=>[...state.get(k).present.get(s)];
 const lastReply=k=>state.get(k).patches.at(-1)??'';
const unbanReply=y=>String(y?.initial?.data?.content??'');
const putsTo=(k,role)=>state.get(k).http.filter(h=>h.method==='PUT'&&h.path.endsWith('/roles/'+role)).length;
const writesTo=(k,role,from=0)=>state.get(k).http.slice(from).filter(h=>(h.method==='PUT'||h.method==='DELETE')&&h.path.endsWith('/roles/'+role)).length;
const same=(a,b)=>!!a&&!!b&&JSON.stringify(a)===JSON.stringify(b);
const sameExcept=(a,b,keys)=>!!a&&!!b&&Object.keys(b).every(k=>keys.includes(k)||JSON.stringify(a[k])===JSON.stringify(b[k]))&&Object.keys(a).length===Object.keys(b).length;
// The held DELETE lands now: only the synthetic server state changes; no request is made and nothing is resent.
const release=k=>{const s=state.get(k);for(const h of s.held.splice(0))s.present.get(h.subject).delete(h.role);};
(async()=>{let complete=false;try{
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:built.outputFiles[0].text,modules:true,name:'evergreen1112-ban',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),isolatedResourcePersistencePath:path.join(out,'isolated'),
  d1Databases:Object.fromEntries(kinds.map(k=>['DB_'+k.replaceAll('-','_'),'ban1112-'+k])),outboundService:async req=>{
  const kind=kinds.find(k=>req.headers.get('authorization')==='Bot '+TOKEN+'-'+k),u=new URL(req.url),p=u.pathname.replace(/^\/api\/v10/,'');
  assert(kind&&u.origin==='https://discord.com'&&u.search==='','only_explicit_synthetic_discord');const s=state.get(kind);s.http.push({method:req.method,path:p});
  if(req.method==='PATCH'&&p.startsWith('/webhooks/'+BOT+'/')){const b=await req.json();s.patches.push(String(b.content));return Response.json({id:'1'});}
  // Staff card and server log (only the cases that configure the channels); Discord refuses content over 2,000 characters.
  if(req.method==='POST'&&/^\/channels\/\d+\/messages$/.test(p)){const b=await req.json(),content=String(b.content??'');s.posts.push(content);return content.length>2000?Response.json({message:'Invalid Form Body',code:50035},{status:400}):Response.json({id:'1'});}
  if(req.method==='GET'&&p==='/users/@me'){if(s.onFirstGet){const hook=s.onFirstGet;s.onFirstGet=null;await hook();}return Response.json({id:BOT,bot:true});}
  if(req.method==='GET'&&p==='/guilds/'+G+'/roles')return Response.json([{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,name:'Olympus Verify',position:40,permissions:'268435456',managed:false},{id:HIGH,name:'Server staff',position:50,permissions:'0',managed:false},{id:ADDON,name:'Olympus Addon Developer',position:1,permissions:'0',managed:false},
   ...RANKS.map(([name,id],i)=>({id,name:s.renamed.has(id)?'Renamed by hand':name,position:s.above.has(id)?45:30-i,permissions:'0',managed:s.managed.has(id)})),...LEGACY.map(id=>({id,name:'Olympus Live: retired rank',position:2,permissions:s.perm.has(id)?'8192':'0',managed:false}))]);
  if(req.method==='GET'&&p==='/guilds/'+G+'/members/'+BOT)return Response.json({user:{id:BOT},roles:[BOTROLE]});
  const m=/^\/guilds\/(\d+)\/members\/(\d+)$/.exec(p);
  if(req.method==='GET'&&m&&m[1]===G&&s.present.has(m[2])){if(s.member404&&m[2]===SUBJECT)return Response.json({message:'Unknown Member',code:10007},{status:404});if(s.memberGetFail&&m[2]===SUBJECT){s.memberGetFail--;return Response.json({message:'synthetic'},{status:500});}return Response.json({user:{id:m[2]},roles:[...s.present.get(m[2])]});}
  const r=/^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/.exec(p);
  if(r&&r[1]===G&&s.present.has(r[2])&&(req.method==='PUT'||req.method==='DELETE')){
   const role=r[3],set=s.present.get(r[2]);
   if(req.method==='DELETE'){
    if(s.onDelete){const hook=s.onDelete;s.onDelete=null;await hook();}
    const mode=s.del[role];
    if(mode==='throw'){delete s.del[role];throw Error('synthetic lost DELETE answer');}
    if(mode==='lost-after-effect'){delete s.del[role];set.delete(role);throw Error('synthetic lost DELETE answer after the effect');}
    // Successor (12 Nov 2026): the DELETE is admitted and its answer lost, but its effect is held back and lands only when
    // the test releases it (no new request is made then): the late-DELETE counterexample of Codex's review.
    if(mode==='hold'){delete s.del[role];s.held.push({subject:r[2],role});throw Error('synthetic lost DELETE answer; effect delayed');}
    // Discord acknowledges the DELETE but the role stays (the confirming read then shows it present).
    if(mode==='ack-no-effect'){delete s.del[role];return new Response(null,{status:204});}
    if(typeof mode==='number'){delete s.del[role];return Response.json({message:'synthetic',retry_after:0},{status:mode});}
    set.delete(role);return new Response(null,{status:204});
   }
   set.add(role);return new Response(null,{status:204});
  }
  throw Error('unplanned synthetic Discord request '+req.method+' '+p);
 }}));
 await mf.ready;
 const setup=async(k,o={})=>{const s=state.get(k);for(const role of o.present??[])s.present.get(SUBJECT).add(role);await call('setup/'+k,{verifyFirst:o.verifyFirst===true,rank:o.rank,budget:o.budget,channels:o.channels===true});};
 const ban=(k,reason)=>call('ban/'+k,reason===undefined?{}:{reason}),sweep=k=>call('sweep/'+k),unban=k=>call('unban/'+k);
 const banRows=x=>x.rows.filter(r=>r.purpose==='canonical_ban_remove_v1');
 // After a ban closed the open code: a new open request and its code, then the original verification path.
 // A writer that was reached and stopped at its physical barrier: verification binds the member but holds the rank
 // intent, the routine holds its intent before any request, the migration holds at its reservation.
 const verifyFenced=y=>y.verify?.body?.result==='member'&&y.verify.body.roleGranted===false&&y.verify.body.rankReason==='native232_intent_held';
 const routineFenced=y=>y.result?.state==='held'&&y.result.reason==='native232_intent_held'&&y.result.requests===0;
 const migrateFenced=y=>y.result?.state==='held'&&y.result.reason==='canonical239_reservation_held';
 const freshVerify=async k=>{const c=await call('newcode/'+k);return call('verify/'+k,{code:c.code,at:c.at});};
 const rolesweep=(k,lane)=>call('rolesweep/'+k,lane===undefined?{}:{lane}),sweepAudit=y=>y.audits.filter(a=>a.action==='role.sweep').map(a=>JSON.parse(a.details)).at(-1);
 // A well-formed earlier row (32/64-hex identity fields, a closed 300 s window in the past), for synthetic controls.
 let rowSeq=0;const synthetic=async(k,o)=>{const now=(await call('clock/'+k)).now,n=(++rowSeq).toString(16);return {id:n.padStart(32,'a'),subject:SUBJECT,purpose:o.purpose,proof_id:o.purpose===BAN?n.padStart(32,'b'):null,guild_id:G,role_id:o.role??VETERAN,desired:o.desired,state:o.state,reason:o.reason,attempts:1,claim_nonce:n.padStart(32,'c'),subject_generation:o.generation??null,request_digest:n.padStart(64,'d'),native_profile:o.profile,created_at:now-1000,expires_at:now-700,checked_at:now-690};};
 const otherUntouched=()=>kinds.every(k=>!state.get(k).http.some(h=>h.path.includes('/members/'+OTHER)));
 const costs={};

 // 1. A bot-granted Veteran (genuine original verification PUT), then a roster older than 600 s, then the ban.
 await setup('bot-veteran',{verifyFirst:true,rank:6});
 const verified=await call('verify/bot-veteran');
 check('setup: original verification grants Veteran through the bot',verified.verify.body.roleGranted===true&&present('bot-veteran').includes(VETERAN),verified.verify);
 const aged=await call('age/bot-veteran');
 check('setup: the latest roster is older than 600 seconds before the ban',aged.roster.now-aged.roster.exported_at>600,aged.roster);
 let x=await ban('bot-veteran');costs.commandOneRole=x.statements;
 check('bot-granted Veteran: ban sends exactly one DELETE of the Veteran role with a stale roster',deletes('bot-veteran').length===1&&deletes('bot-veteran')[0].path.endsWith('/roles/'+VETERAN),state.get('bot-veteran').http);
 check('bot-granted Veteran: the role is gone and the row is an acknowledged, confirmed ban receipt',!present('bot-veteran').includes(VETERAN)&&banRows(x).length===1&&banRows(x)[0].state==='settled'&&banRows(x)[0].reason==='ban_rank1112_delete_acknowledged_and_confirmed'&&banRows(x)[0].attempts===1,x.rows);
 check('bot-granted Veteran: the officer is told which role was removed',lastReply('bot-veteran').includes('Rank roles removed (confirmed absent): <@&'+VETERAN+'>'),lastReply('bot-veteran'));
 check('bot-granted Veteran: the reply no longer claims a Guild Member result',!/Guild Member absence confirmed/.test(lastReply('bot-veteran')),lastReply('bot-veteran'));
 check('ban safety write persists',x.member?.banned===1,x.member);
 await unban('bot-veteran');await call('refresh/bot-veteran');const puts=state.get('bot-veteran').http.filter(h=>h.method==='PUT').length;x=await call('routine/bot-veteran');
 check('after unban the ordinary canonical routine grants the rank again; the ban receipt is not a permanent fence',state.get('bot-veteran').http.filter(h=>h.method==='PUT').length===puts+1&&present('bot-veteran').includes(VETERAN)&&x.result?.state==='settled',{result:x.result,rows:x.rows});

 // ---- Successor (12 Nov 2026): custody of an unknown DELETE (Codex's review of f5dfe10, controls agreed by both agents).
 // S1. "late-delete-absence". A real ban DELETE is admitted, its effect held back and its answer lost. Another cause removes
 // the role, the claim window passes, a read sees the role absent, the member is unbanned and fresh rank evidence arrives.
 // The routine, shared-membership and migration writers send no PUT for the fenced role; then the held DELETE lands.
 await setup('late-delete',{present:[VETERAN,ADDON],rank:6});const ld=state.get('late-delete');ld.del[VETERAN]='hold';
 x=await ban('late-delete');const ldRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('late-delete-absence: the admitted ban DELETE is sent once, its answer lost and its effect held; the row is unknown',deletes('late-delete').length===1&&ld.held.length===1&&present('late-delete').includes(VETERAN)&&ldRow?.state==='unknown'&&ldRow.reason==='ban_rank1112_delete_outcome_unknown'&&ldRow.attempts===1&&/^[0-9a-f]{32}$/.test(ldRow.claim_nonce??''),{rows:x.rows,held:ld.held});
 check('late-delete-absence: the officer is told the result is unconfirmed and that the role stays blocked for this member after an unban',lastReply('late-delete').includes('unconfirmed result: <@&'+VETERAN+'>')&&lastReply('late-delete').includes('even after an unban, until an attended resolution exists'),lastReply('late-delete'));
 ld.present.get(SUBJECT).delete(VETERAN); // an independent cause: staff remove the role by hand
 await call('expire/late-delete');x=await call('rows/late-delete');const ldWindow=banRows(x).find(r=>r.id===ldRow?.id);
 check('late-delete-absence: the claim window passes by the test clock only (created_at and expires_at 400 s back, every other field unchanged)',sameExcept(ldWindow,ldRow,['created_at','expires_at'])&&ldWindow.created_at===ldRow.created_at-400&&ldWindow.expires_at===ldRow.expires_at-400,{before:ldRow,after:ldWindow});
 let ldFrom=state.get('late-delete').http.length;x=await sweep('late-delete');costs.sweepObserveUnresolved=x.statements;
 check('late-delete-absence: the banned visit reads the role absent, counts it as an observation only and leaves the row byte-identical',same(banRows(x).find(r=>r.id===ldRow?.id),ldWindow)&&x.result?.observed===1&&writesTo('late-delete',VETERAN,ldFrom)===0&&state.get('late-delete').http.slice(ldFrom).some(h=>h.method==='GET'&&h.path==='/guilds/'+G+'/members/'+SUBJECT),{result:x.result,rows:banRows(x),http:state.get('late-delete').http.slice(ldFrom)});
 const ldUnban=await unban('late-delete');
 check('late-delete-absence: the unban reply says the Veteran role stays blocked for this member by the unconfirmed ban removal',unbanReply(ldUnban).startsWith('<@'+SUBJECT+'> can verify again. One Olympus rank role stays blocked for them: <@&'+VETERAN+'>.')&&unbanReply(ldUnban).includes('until an attended resolution exists'),unbanReply(ldUnban));
 await call('refresh/late-delete');ldFrom=state.get('late-delete').http.length;
 const ldVerify=await freshVerify('late-delete');
 // The writers are reached and stop at their own physical barrier (the same sequence grants in known-positive below).
 check('late-delete-absence: after the unban, fresh verification evidence binds the member but the shared-membership writer holds its intent and sends no PUT for the fenced role',putsTo('late-delete',VETERAN)===0&&!present('late-delete').includes(VETERAN)&&verifyFenced(ldVerify),{verify:ldVerify.verify,http:state.get('late-delete').http.slice(ldFrom)});
 const ldRoutine=await call('routine/late-delete');
 check('late-delete-absence: the routine writer holds its intent with no request and sends no PUT for the fenced role',putsTo('late-delete',VETERAN)===0&&routineFenced(ldRoutine),{result:ldRoutine.result});
 const ldMigrate=await call('migrate/late-delete',{target:VETERAN,currentRoles:[]});
 check('late-delete-absence: the migration writer holds at its reservation and sends no PUT for the fenced role',putsTo('late-delete',VETERAN)===0&&migrateFenced(ldMigrate),{result:ldMigrate.result});
 x=await sweep('late-delete');
 check('late-delete-absence: the GET-only visit after the unban writes nothing and the row stays byte-identical',same(banRows(x).find(r=>r.id===ldRow?.id),ldWindow)&&writesTo('late-delete',VETERAN,ldFrom)===0,{result:x.result,rows:banRows(x)});
 x=await call('receipt/late-delete',{id:ldRow?.id});
 check('late-delete-absence: account erasure\'s debt visit reports the row unknown and leaves it byte-identical',x.result?.state==='unknown'&&x.result.reason==='ban_rank1112_unresolved_observed_absent'&&same(banRows(x).find(r=>r.id===ldRow?.id),ldWindow),{result:x.result,rows:banRows(x)});
 const ldRequests=state.get('late-delete').http.length;release('late-delete');x=await call('rows/late-delete');
 check('late-delete-absence: the held DELETE lands without any resend; the original row keeps its identity, body, nonce and clocks and no acknowledgement is recorded',state.get('late-delete').http.length===ldRequests&&deletes('late-delete').length===1&&same(banRows(x).find(r=>r.id===ldRow?.id),ldWindow)&&!x.rows.some(r=>r.role_id===VETERAN&&/acknowledged/.test(r.reason))&&putsTo('late-delete',VETERAN)===0&&!present('late-delete').includes(VETERAN)&&present('late-delete').includes(ADDON),{rows:x.rows});

 // S2. "known-positive". An acknowledged and confirmed DELETE, a never-dispatched removal and a proved no-effect 404 are
 // known: after an unban each lets a fresh grant through. The same sequence as S1, so S1's zero PUTs are not vacuous.
 await setup('known-ack',{present:[VETERAN,ADDON],rank:6});x=await ban('known-ack');
 check('known-positive: setup, the ban DELETE is acknowledged and confirmed',banRows(x)[0]?.state==='settled'&&banRows(x)[0].reason==='ban_rank1112_delete_acknowledged_and_confirmed'&&!present('known-ack').includes(VETERAN),x.rows);
 x=await unban('known-ack');
 check('known-positive: after an acknowledged and confirmed DELETE the unban reply names no blocked role',unbanReply(x)==='<@'+SUBJECT+'> can verify again.',unbanReply(x));
 await call('refresh/known-ack');x=await freshVerify('known-ack');
 check('known-positive: after an acknowledged and confirmed DELETE and an unban, fresh verification grants the rank again (one PUT)',putsTo('known-ack',VETERAN)===1&&present('known-ack').includes(VETERAN),{verify:x.verify});
 await setup('known-migrate',{present:[VETERAN,ADDON],rank:6});await ban('known-migrate');await unban('known-migrate');x=await call('migrate/known-migrate',{target:VETERAN,currentRoles:[]});
 check('known-positive: after an acknowledged and confirmed DELETE and an unban, the migration writer grants the rank (one PUT)',putsTo('known-migrate',VETERAN)===1&&present('known-migrate').includes(VETERAN)&&x.result?.state==='settled',{result:x.result});
 await setup('known-nd',{present:[VETERAN,ADDON],rank:6});await call('faild1/known-nd',{match:'SELECT 1 FROM role_settlements WHERE id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND subject_generation IS ?5 AND proof_id=?6'});x=await ban('known-nd');
 const ndRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('known-positive: a claimed removal stopped before dispatch is recorded held, never dispatched, with no DELETE',deletes('known-nd').length===0&&ndRow?.state==='held'&&ndRow.reason==='ban_rank1112_never_dispatched'&&ndRow.attempts===1,x.rows);
 state.get('known-nd').present.get(SUBJECT).delete(VETERAN);await unban('known-nd');await call('refresh/known-nd');x=await freshVerify('known-nd');
 check('known-positive: a never-dispatched removal stays known: after an unban fresh verification grants the rank (one PUT)',putsTo('known-nd',VETERAN)===1&&present('known-nd').includes(VETERAN),{verify:x.verify});
 await setup('known-404',{present:[VETERAN,ADDON],rank:6});state.get('known-404').del[VETERAN]=404;x=await ban('known-404');
 check('known-positive: setup, a DELETE answered 404 is held with no effect',banRows(x)[0]?.state==='held'&&banRows(x)[0].reason==='ban_rank1112_refused_404',x.rows);
 state.get('known-404').present.get(SUBJECT).delete(VETERAN);await unban('known-404');await call('refresh/known-404');x=await freshVerify('known-404');
 check('known-positive: a proved no-effect 404 stays known: after an unban fresh verification grants the rank (one PUT)',putsTo('known-404',VETERAN)===1&&present('known-404').includes(VETERAN),{verify:x.verify});
 // A malformed or unrelated observation reason on an otherwise well-formed ban row cannot open the fence; the same row
 // with the acknowledgement reason can (inserted-ack-control), so only the reason differs.
 for(const [k,st,reason,known] of [['malformed-retired','settled','ban_rank1112_unknown_observed_absent',false],['malformed-variant','settled','ban_rank1112_observed_absent',false],['inserted-ack-control','settled','ban_rank1112_delete_acknowledged_and_confirmed',true]]){
  await setup(k,{present:[ADDON],rank:6});const row=await synthetic(k,{purpose:BAN,desired:0,state:st,reason,profile:BAN_PROFILE});await call('insert/'+k,{rows:[row]});
  await call('refresh/'+k);x=await call('verify/'+k);
  if(known)check('known-positive: control, the same well-formed ban row with the acknowledgement reason lets fresh verification grant the rank (one PUT)',putsTo(k,VETERAN)===1&&present(k).includes(VETERAN),{verify:x.verify});
  else check('known-positive: a ban row whose reason is '+reason+' does not open the fence: fresh verification sends no PUT for Veteran',putsTo(k,VETERAN)===0&&!present(k).includes(VETERAN),{verify:x.verify});
  if(!known)state.get(k).present.get(SUBJECT).add(VETERAN); // given by hand; then a ban must not DELETE it over the unresolved row
  const before=deletes(k).length;x=await ban(k);
  if(known)check('known-positive: control, the ban writer removes the granted rank over the known row',deletes(k).length===before+1&&!present(k).includes(VETERAN),{rows:x.rows});
  else check('known-positive: a ban row whose reason is '+reason+' keeps the ban writer\'s own fence: no DELETE, reported unconfirmed',deletes(k).length===before&&present(k).includes(VETERAN)&&lastReply(k).includes('earlier change to this role has an unconfirmed result'),{reply:lastReply(k),rows:x.rows});
  check('known-positive: the inserted '+reason+' row is never changed',same(x.rows.find(r=>r.id===row.id),Object.fromEntries(Object.keys(x.rows.find(r=>r.id===row.id)??{}).map(n=>[n,row[n]]))),{row:x.rows.find(r=>r.id===row.id),inserted:row});
 }

 // S3. "cross-purpose-generation". An unresolved PUT or DELETE row of the ban purpose, the older canonical purposes and the
 // native purpose, in an older and in the current generation, each keeps the Veteran fence in every successor writer: a new
 // ban dispatch, shared membership (fresh verification), migration and the routine. The Member rank role proceeds under
 // the ban's own authority and the non-rank roles are untouched.
 for(const xp of XP_CASES){
  const k=xp.kind;await setup(k,{present:[VETERAN,MEMBER,ADDON,HIGH],rank:6});
  const row=await synthetic(k,{purpose:xp.purpose,desired:xp.desired,state:'unknown',reason:'synthetic_unresolved_'+xp.purpose,profile:xp.profile,generation:xp.generation});await call('insert/'+k,{rows:[row]});
  x=await ban(k);
  check(k+': a new ban dispatch holds Veteran (no DELETE), removes Member under its own authority and leaves the non-rank roles',writesTo(k,VETERAN)===0&&present(k).includes(VETERAN)&&!present(k).includes(MEMBER)&&present(k).includes(ADDON)&&present(k).includes(HIGH)&&lastReply(k).includes('<@&'+VETERAN+'> (an earlier change to this role has an unconfirmed result)'),{reply:lastReply(k),http:state.get(k).http});
  // Unbanned, the role gone by hand: a sweep visit (GET-only for a ban-purpose row) sees it absent; that releases nothing.
  const xpUnban=unbanReply(await unban(k));
  // Round 4 item 8 (13 Nov 2026): the unban reply names Veteran whatever the purpose of the unresolved row that holds it.
  check(k+': the unban reply names Veteran as blocked by an unconfirmed '+(xp.purpose===BAN?'ban removal':'change outside the ban'),xpUnban.startsWith('<@'+SUBJECT+'> can verify again. One Olympus rank role stays blocked for them: <@&'+VETERAN+'>.')&&xpUnban.includes(xp.purpose===BAN?'An earlier ban removal of this role got no confirmed answer':'An earlier change to this role outside the ban got no confirmed answer')&&xpUnban.includes('until an attended resolution exists')&&!/in flight/.test(xpUnban),xpUnban);
  state.get(k).present.get(SUBJECT).delete(VETERAN);await sweep(k);await call('refresh/'+k);
  const v=await freshVerify(k),m=await call('migrate/'+k,{target:VETERAN,currentRoles:[]}),t=await call('routine/'+k);x=await call('rows/'+k);
  check(k+': after a sweep visit saw Veteran absent, shared membership, migration and the routine stop at their barriers with no PUT or DELETE for Veteran, and the unresolved row is never changed',writesTo(k,VETERAN)===0&&!present(k).includes(VETERAN)&&verifyFenced(v)&&migrateFenced(m)&&routineFenced(t)&&same(x.rows.find(r=>r.id===row.id),Object.fromEntries(Object.keys(x.rows.find(r=>r.id===row.id)??{}).map(n=>[n,row[n]]))),{verify:v.verify,migrate:m.result,routine:t.result,row:x.rows.find(r=>r.id===row.id)});
 }

 // S4. Follow-up review gap: the receipt reasons before receipt_unknown, so a mutant that reorders them is caught.
 await setup('effect-not-confirmed',{present:[VETERAN]});state.get('effect-not-confirmed').del[VETERAN]='ack-no-effect';x=await ban('effect-not-confirmed');
 const encRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('Discord acknowledges the DELETE but the confirming read still shows the role: unknown with effect_not_confirmed, never receipt_unknown',deletes('effect-not-confirmed').length===1&&present('effect-not-confirmed').includes(VETERAN)&&encRow?.state==='unknown'&&encRow.reason==='ban_rank1112_effect_not_confirmed'&&lastReply('effect-not-confirmed').includes('<@&'+VETERAN+'> (the role was still present after Discord accepted the removal)'),{reply:lastReply('effect-not-confirmed'),row:encRow});
 await setup('confirm-unknown',{present:[VETERAN]});const cu=state.get('confirm-unknown');cu.onDelete=()=>{cu.memberGetFail=1;};x=await ban('confirm-unknown');
 const cuRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('the confirming read fails without any interruption: unknown with confirmation_unknown, never interrupted_after_ack or receipt_unknown',deletes('confirm-unknown').length===1&&!present('confirm-unknown').includes(VETERAN)&&cuRow?.state==='unknown'&&cuRow.reason==='ban_rank1112_confirmation_unknown'&&lastReply('confirm-unknown').includes('<@&'+VETERAN+'> (the confirming member read failed)'),{reply:lastReply('confirm-unknown'),row:cuRow});

 // S5. Lanes (agreed plan): in canonical mode one lane per invocation, chosen by the caller; no fall-through; each lane's
 // cursor survives the other lane's visit.
 await setup('lanes',{present:[ADDON]});await ban('lanes');state.get('lanes').present.get(SUBJECT).add(MEMBER);
 await call('sweepstate/lanes',{details:{a:7,c:OTHER,b:'0',checked:0}});
 let laneFrom=state.get('lanes').http.length;x=await rolesweep('lanes');
 check('a canonical role sweep without a lane holds before any lane-specific read or Discord request and is audited as failed',x.result===null&&String(x.failedAudit).includes('role_sweep_lane_required')&&state.get('lanes').http.length===laneFrom&&sweepAudit(x)?.b==='0',{result:x.result,failedAudit:x.failedAudit});
 x=await rolesweep('lanes','ordinary');costs.ordinaryLaneBannedOnly=x.statements;const ordinaryAudit=sweepAudit(x);
 check('the ordinary lane never visits a banned account\'s removal: no request for the banned member and the banned cursor is untouched',x.result?.lane==='ordinary'&&state.get('lanes').http.slice(laneFrom).every(h=>!h.path.includes('/members/'+SUBJECT))&&present('lanes').includes(MEMBER)&&ordinaryAudit?.b==='0',{result:x.result,audit:ordinaryAudit,http:state.get('lanes').http.slice(laneFrom)});
 laneFrom=state.get('lanes').http.length;x=await rolesweep('lanes','ban');costs.banLaneOneRole=x.statements;const banAudit=sweepAudit(x);
 check('the ban lane removes the banned member\'s rank role and leaves the ordinary cursors exactly as the ordinary lane wrote them',x.result?.lane==='ban'&&!present('lanes').includes(MEMBER)&&deletes('lanes',laneFrom).length===1&&banAudit?.a===ordinaryAudit?.a&&banAudit?.c===ordinaryAudit?.c&&banAudit?.b===SUBJECT,{result:x.result,audit:banAudit,ordinaryAudit});
 x=await rolesweep('lanes','ordinary');
 check('the banned cursor survives a later ordinary visit',sweepAudit(x)?.b===SUBJECT&&x.result?.lane==='ordinary',{audit:sweepAudit(x)});
 await setup('lanes-walk',{verifyFirst:true,rank:6});await call('verify/lanes-walk');await call('age/lanes-walk');
 await call('sweepstate/lanes-walk',{details:{a:0,c:'',b:'0',checked:0}});
 laneFrom=state.get('lanes-walk').http.length;x=await rolesweep('lanes-walk','ban');costs.banLaneEmpty=x.statements;
 check('an empty ban lane does nothing else: no request, no ordinary walk, the ordinary cursors unchanged',x.result?.lane==='ban'&&x.result.checked===0&&state.get('lanes-walk').http.length===laneFrom&&sweepAudit(x)?.a===0&&sweepAudit(x)?.c===''&&sweepAudit(x)?.lane==='ban',{result:x.result,audit:sweepAudit(x)});
 const emptyBanCursor=sweepAudit(x)?.b;laneFrom=state.get('lanes-walk').http.length;x=await rolesweep('lanes-walk','ordinary');costs.ordinaryLaneOneMember=x.statements;
 check('the ordinary lane walks the bound member and never runs the banned rotation; the banned cursor is untouched',x.result?.lane==='ordinary'&&state.get('lanes-walk').http.slice(laneFrom).some(h=>h.method==='GET'&&h.path==='/guilds/'+G+'/members/'+SUBJECT)&&sweepAudit(x)?.b===emptyBanCursor,{result:x.result,audit:sweepAudit(x),http:state.get('lanes-walk').http.slice(laneFrom)});

 // ---- Repair round (13 Nov 2026, independent review of the successor at 4951e61).
 // R-A. Closed pre-.233 acknowledged receipts are known to the ban writer's own barrier. Owner ruling (12 Nov 2026): a ban
 // removes the rank role "whether the bot or a staff member granted it, as bans did before .233". An old-lane grant with a
 // confirmed receipt and a legacy 'removed' removal no longer fence the role; a GET-only legacy close still does.
 const oldRow=async(k,o)=>{const now=(await call('clock/'+k)).now,n=(++rowSeq).toString(16);return {id:n.padStart(32,'a'),subject:SUBJECT,purpose:o.purpose,proof_id:null,guild_id:G,role_id:o.role,desired:o.desired,state:'settled',reason:o.reason,attempts:1,claim_nonce:n.padStart(32,'c'),subject_generation:null,request_digest:n.padStart(64,'d'),native_profile:o.profile??null,created_at:now-90000,expires_at:now-89700,checked_at:now-89690};};
 const unchanged=(y,row)=>same(y.rows.find(r=>r.id===row.id),Object.fromEntries(Object.keys(y.rows.find(r=>r.id===row.id)??{}).map(n=>[n,row[n]])));
 for(const [k,role,label] of [['oldlane-retired',RETIRED,'a retired rank ID'],['oldlane-veteran',VETERAN,'Veteran']]){
  await setup(k,{present:[role,ADDON],rank:6});const row=await oldRow(k,{purpose:'fresh_roster_rank',role,desired:1,reason:'effect_and_current_server_confirmed',profile:'ten-rank'});await call('insert/'+k,{rows:[row]});
  x=await ban(k);
  check('legacy known: '+label+' granted by the old fresh lane with a confirmed receipt is removed by the ban command (one DELETE) and reported removed, never unconfirmed',writesTo(k,role)===1&&!present(k).includes(role)&&present(k).includes(ADDON)&&lastReply(k).includes('Rank roles removed (confirmed absent): <@&'+role+'>')&&!lastReply(k).includes('unconfirmed'),{reply:lastReply(k),http:state.get(k).http});
  state.get(k).present.get(SUBJECT).add(role);const from=state.get(k).http.length;x=await sweep(k);
  check('legacy known: '+label+' given back by hand during the standing ban is removed by the sweep visit',deletes(k,from).length===1&&deletes(k,from)[0].path.endsWith('/roles/'+role)&&!present(k).includes(role)&&present(k).includes(ADDON),{result:x.result,http:state.get(k).http.slice(from)});
  check('legacy known: the old-lane row on '+label+' is never changed',unchanged(x,row),{row:x.rows.find(r=>r.id===row.id)});
 }
 // An old-lane row whose reason is not an acknowledgement (a presence-only close) stays unresolved for the ban writer.
 await setup('oldlane-getonly',{present:[VETERAN,MEMBER,ADDON],rank:6});
 const ogRow=await oldRow('oldlane-getonly',{purpose:'fresh_roster_rank',role:VETERAN,desired:1,reason:'fresh_server_confirmed',profile:'ten-rank'});await call('insert/oldlane-getonly',{rows:[ogRow]});x=await ban('oldlane-getonly');
 check('legacy unresolved: an old-lane row closed by a read only (fresh_server_confirmed) still holds Veteran: no DELETE, Member removed',writesTo('oldlane-getonly',VETERAN)===0&&present('oldlane-getonly').includes(VETERAN)&&!present('oldlane-getonly').includes(MEMBER)&&unchanged(x,ogRow),{reply:lastReply('oldlane-getonly'),http:state.get('oldlane-getonly').http});
 for(const [k,purpose,reason,known] of [['legacy-removed','ban','removed',true],['legacy-absent','guild_departure','absent',false]]){
  await setup(k,{present:[MEMBER,VETERAN,ADDON],rank:6});const row=await oldRow(k,{purpose,role:MEMBER,desired:0,reason});await call('insert/'+k,{rows:[row]});x=await ban(k);
  if(known)check('legacy known: a legacy ban removal acknowledged and confirmed (ban, removed) does not fence Member: the ban removes Member and Veteran',writesTo(k,MEMBER)===1&&!present(k).includes(MEMBER)&&!present(k).includes(VETERAN)&&present(k).includes(ADDON)&&!lastReply(k).includes('unconfirmed')&&unchanged(x,row),{reply:lastReply(k),http:state.get(k).http});
  else{
   check('legacy unresolved: a GET-only legacy close (guild_departure, absent) still holds Member: no DELETE, Veteran removed, and the reply says Member is still on the member and must be removed by hand',writesTo(k,MEMBER)===0&&present(k).includes(MEMBER)&&!present(k).includes(VETERAN)&&lastReply(k).includes('Rank roles still on the member: <@&'+MEMBER+'> (an earlier change to this role has an unconfirmed result). No removal is sent for these roles: remove them in Discord by hand for the ban to take full effect.')&&!lastReply(k).includes('Rank roles with an unconfirmed result')&&unchanged(x,row),{reply:lastReply(k),http:state.get(k).http});
   const from=state.get(k).http.length;x=await sweep(k);
   check('legacy unresolved: the sweep visit still sends nothing for Member over the GET-only legacy close',writesTo(k,MEMBER,from)===0&&present(k).includes(MEMBER)&&unchanged(x,row),{result:x.result,http:state.get(k).http.slice(from)});
  }
 }

 // R-B. A ban lane whose one banned visit fails (the member read answers 500) or is held by its request budget never
 // falls through to the ordinary walk (the independent reviewer's R2 and R3 cases, 13 Nov 2026).
 await setup('lane-failed',{present:[ADDON]});await ban('lane-failed');state.get('lane-failed').present.get(SUBJECT).add(MEMBER);
 await call('sweepstate/lane-failed',{details:{a:7,c:OTHER,b:'0',checked:0}});
 const lf=state.get('lane-failed');lf.memberGetFail=1;const lfFrom=lf.http.length;x=await rolesweep('lane-failed','ban');const lfAudit=sweepAudit(x);
 check('a failed ban-lane visit sends no DELETE, does not run the ordinary walk (only the four reads of the one banned visit) and copies a and c exactly',x.result?.lane==='ban'&&deletes('lane-failed',lfFrom).length===0&&lf.http.slice(lfFrom).length===4&&lf.http.slice(lfFrom).every(h=>h.method==='GET')&&!lf.http.slice(lfFrom).some(h=>h.path.includes('/members/'+OTHER))&&lfAudit?.a===7&&lfAudit?.c===OTHER&&lfAudit?.lane==='ban'&&present('lane-failed').includes(MEMBER),{result:x.result,audit:lfAudit,http:lf.http.slice(lfFrom)});
 x=await rolesweep('lane-failed','ordinary');
 check('the next ordinary visit leaves the banned member alone and keeps the ban lane\'s cursor',x.result?.lane==='ordinary'&&sweepAudit(x)?.b===lfAudit?.b&&present('lane-failed').includes(MEMBER),{audit:sweepAudit(x)});
 await setup('lane-held',{present:[ADDON],budget:5});await ban('lane-held');state.get('lane-held').present.get(SUBJECT).add(MEMBER);
 await call('sweepstate/lane-held',{details:{a:9,c:OTHER,b:'0',checked:0}});
 const lh=state.get('lane-held'),lhFrom=lh.http.length;x=await rolesweep('lane-held','ban');const lhAudit=sweepAudit(x);
 check('a ban lane held by its budget (ROLE_CALL_BUDGET=5, under the visit\'s 6-request minimum) makes no request, does not run the ordinary walk and keeps a, c and b',x.result?.lane==='ban'&&lh.http.length===lhFrom&&lhAudit?.a===9&&lhAudit?.c===OTHER&&lhAudit?.b==='0'&&lhAudit?.lane==='ban'&&present('lane-held').includes(MEMBER),{result:x.result,audit:lhAudit,http:lh.http.slice(lhFrom)});

 // R-C. A Watcher call without a lane (its schedule capture held) is throttled before the lane check: three polls inside the
 // throttle window (the second in the same isolate, the third as a fresh isolate) write one role.sweep_failed row in all.
 await setup('watcher-nolane',{present:[ADDON]});const wnFrom=state.get('watcher-nolane').http.length;
 const wn1=await call('watchersweep/watcher-nolane',{forget:true}),wn2=await call('watchersweep/watcher-nolane'),wn3=await call('watchersweep/watcher-nolane',{forget:true});
 check('a Watcher call without a lane holds, and the throttle keeps it to one role.sweep_failed row per window with no Discord request',wn1.result===null&&String(wn1.failedAudit).includes('role_sweep_lane_required')&&wn1.failedCount===1&&wn2.failedCount===1&&wn3.failedCount===1&&state.get('watcher-nolane').http.length===wnFrom,{counts:[wn1.failedCount,wn2.failedCount,wn3.failedCount],failedAudit:wn1.failedAudit});

 // R-D. The deferred line names what actually stopped the command: here Discord's 429 on the first role.
 await setup('deferred-429',{present:[VETERAN,MEMBER]});state.get('deferred-429').del[VETERAN]=429;x=await ban('deferred-429');
 check('the deferred line names the actual cause: a 429 that stopped the command, not the budget or an unconfirmed result',deletes('deferred-429').length===1&&present('deferred-429').includes(MEMBER)&&lastReply('deferred-429').includes('left for the role sweep: <@&'+MEMBER+'>. Discord asked the command to wait (rate limit), so it stopped. The role sweep is only a safety net')&&!/ran out of Discord requests|no confirmed answer/.test(lastReply('deferred-429')),lastReply('deferred-429'));

 // 2-4. Hand-granted Member (shared membership role), an officer rank and a retired rank ID.
 for(const [k,role,label] of [['member-manual',MEMBER,'Member'],['officer-manual',OFFICER,'Officer'],['retired-manual',RETIRED,'retired rank ID']]){
  await setup(k,{present:[role,ADDON,HIGH]});x=await ban(k);
  check('hand-granted '+label+': one DELETE of exactly that role',deletes(k).length===1&&deletes(k)[0].path.endsWith('/roles/'+role),state.get(k).http);
  check('hand-granted '+label+': removed and confirmed; unrelated roles stay',!present(k).includes(role)&&present(k).includes(ADDON)&&present(k).includes(HIGH)&&banRows(x).length===1&&banRows(x)[0].state==='settled',{present:present(k),rows:x.rows});
  check('hand-granted '+label+': reply names the removed role',lastReply(k).includes('<@&'+role+'>')&&lastReply(k).includes('removed'),lastReply(k));
 }

 // 5. Every managed rank ID at once: one DELETE per role, never a PATCH of the member's role array.
 await setup('stack',{present:[...ALL,ADDON]});x=await ban('stack');costs.commandAllRoles=x.statements;
 check('all 18 rank roles: 18 single-role DELETEs and no member PATCH',deletes('stack').length===18&&new Set(deletes('stack').map(h=>h.path)).size===18&&!writes('stack').some(h=>h.method==='PATCH'),state.get('stack').http.map(h=>h.method+' '+h.path));
 check('all 18 rank roles: 23 Discord requests (4 reads, 18 DELETEs, 1 confirming read) within the default 40',state.get('stack').http.filter(h=>!h.path.startsWith('/webhooks/')).length===23,state.get('stack').http.length);
 check('all 18 rank roles: all removed, the technical-partner role kept, 18 settled rows under one operation',present('stack').length===1&&present('stack')[0]===ADDON&&banRows(x).length===18&&banRows(x).every(r=>r.state==='settled')&&new Set(banRows(x).map(r=>r.proof_id)).size===1,{present:present('stack')});

 // 6-7. No rank role; not in the server.
 await setup('none',{present:[ADDON]});x=await ban('none');
 check('no rank role: no DELETE, no settlement row, and the officer is told',deletes('none').length===0&&banRows(x).length===0&&lastReply('none').includes('They held no Olympus rank role.'),{reply:lastReply('none'),rows:x.rows});
 await setup('not-member');state.get('not-member').member404=true;x=await ban('not-member');
 check('not in the server: no DELETE and the reply says so',deletes('not-member').length===0&&banRows(x).length===0&&lastReply('not-member').includes('Not in the Discord server'),lastReply('not-member'));

 // 8-10. Discord's explicit refusals on the DELETE are known no-effect outcomes.
 for(const [k,status,reason] of [['delete-404',404,'ban_rank1112_refused_404'],['delete-403',403,'ban_rank1112_refused_403'],['delete-429',429,'ban_rank1112_rate_limited_429']]){
  await setup(k,{present:[MEMBER]});state.get(k).del[MEMBER]=status;x=await ban(k);
  check('DELETE '+status+': one DELETE, recorded as held with no effect',deletes(k).length===1&&banRows(x).length===1&&banRows(x)[0].state==='held'&&banRows(x)[0].reason===reason&&banRows(x)[0].attempts===1,x.rows);
  check('DELETE '+status+': the officer is told the role was not removed and why',lastReply(k).includes('Rank roles not removed: <@&'+MEMBER+'>')&&lastReply(k).includes('('+status+')')===(status!==429),lastReply(k));
  if(status===429)check('DELETE 429: the reply makes no per-member "every 30 minutes" promise; the sweep tries again when its banned rotation reaches this account',lastReply(k).includes('the role sweep can try again when its banned rotation reaches this account')&&!lastReply(k).includes('every 30 minutes'),lastReply(k));
 }
 x=await sweep('delete-429');costs.sweep429=x.statements;
 check('after a 429 the banned sweep continues with a new DELETE that removes the role',deletes('delete-429').length===2&&!present('delete-429').includes(MEMBER)&&banRows(x).length===2&&banRows(x)[1].state==='settled'&&banRows(x)[0].reason==='ban_rank1112_rate_limited_429',x.rows);

 // 11. An unknown outcome is never replayed: not by the sweep, not by a later ban. Veteran precedes Member in the fixed order.
 await setup('unknown',{present:[VETERAN,MEMBER]});state.get('unknown').del[VETERAN]='throw';x=await ban('unknown');
 const unknownRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('lost DELETE answer: recorded unknown, reported unconfirmed, the independent role waits',unknownRow?.state==='unknown'&&unknownRow.reason==='ban_rank1112_delete_outcome_unknown'&&lastReply('unknown').includes('unconfirmed result: <@&'+VETERAN+'>')&&lastReply('unknown').includes('left for the role sweep: <@&'+MEMBER+'>'),{reply:lastReply('unknown'),rows:x.rows});
 check('repair round: the deferred line names the actual cause, the unconfirmed result that stopped the command, not the budget or a rate limit',lastReply('unknown').includes('left for the role sweep: <@&'+MEMBER+'>. The command stopped after a removal got no confirmed answer. The role sweep is only a safety net')&&!/ran out of Discord requests|rate limit/.test(lastReply('unknown')),lastReply('unknown'));
 const before=deletes('unknown').length;x=await sweep('unknown');
 check('the sweep never replays the unknown DELETE but continues with the independent role',deletes('unknown').slice(before).every(h=>!h.path.endsWith('/'+VETERAN))&&deletes('unknown').length===before+1&&!present('unknown').includes(MEMBER),state.get('unknown').http.slice(-6));
 check('follow-up REV-BAN-1: a visit that removes a role while another role stays unconfirmed is still reported as failed',x.result?.failed.includes(SUBJECT)===true&&x.result.revoked.includes(SUBJECT),x.result);
 await unban('unknown');x=await ban('unknown');
 check('unban then reban still holds the unknown role and reports it',deletes('unknown').filter(h=>h.path.endsWith('/'+VETERAN)).length===1&&lastReply('unknown').includes('earlier change to this role has an unconfirmed result'),lastReply('unknown'));
 check('the unknown row stays byte-identical',!!unknownRow&&JSON.stringify(banRows(x).find(r=>r.id===unknownRow.id))===JSON.stringify(unknownRow),banRows(x));
 await call('expire/unknown');x=await sweep('unknown');costs.sweepUnknownStillPresent=x.statements;
 check('after the claim window an unknown row whose role is still present stays unknown and its DELETE is never sent again',deletes('unknown').filter(h=>h.path.endsWith('/'+VETERAN)).length===1&&banRows(x).find(r=>r.id===unknownRow?.id)?.state==='unknown'&&present('unknown').includes(VETERAN),banRows(x));

 // 12. Unban then reban: an unbanned member is never touched; the reban takes the role again under a new cause.
 await setup('unban-reban',{present:[VETERAN]});x=await ban('unban-reban');const first=banRows(x)[0];
 state.get('unban-reban').present.get(SUBJECT).add(VETERAN); // staff give the role back by hand
 await unban('unban-reban');const quiet=state.get('unban-reban').http.length;x=await sweep('unban-reban');
 check('after unban the sweep sends nothing for the account',state.get('unban-reban').http.length===quiet&&present('unban-reban').includes(VETERAN),state.get('unban-reban').http.slice(quiet));
 x=await ban('unban-reban');const second=banRows(x).find(r=>r.id!==first.id);
 check('reban removes the hand-restored role again under a new operation; the first receipt is unchanged',deletes('unban-reban').length===2&&!present('unban-reban').includes(VETERAN)&&second?.state==='settled'&&second.proof_id!==first.proof_id&&second.request_digest!==first.request_digest&&JSON.stringify(banRows(x).find(r=>r.id===first.id))===JSON.stringify(first),x.rows);

 // 13. Unban and reban inside the original command's provider await: the original decision is not reused.
 await setup('race-reban',{present:[VETERAN]});state.get('race-reban').onFirstGet=()=>call('hook/race-reban/unban-reban');x=await ban('race-reban');
 check('unban+reban during the first provider read: the original cause sends no DELETE',deletes('race-reban').length===0&&banRows(x).length===0&&lastReply('race-reban').includes('lifted or replaced'),{reply:lastReply('race-reban'),http:state.get('race-reban').http});
 x=await sweep('race-reban');
 check('the standing new ban is completed by the sweep under its own cause',deletes('race-reban').length===1&&!present('race-reban').includes(VETERAN)&&banRows(x).length===1&&banRows(x)[0].state==='settled',x.rows);

 // 14. Unban while the DELETE is in flight: the effect is recorded as it happened; nothing is put back.
 await setup('race-inflight',{present:[VETERAN]});state.get('race-inflight').onDelete=()=>call('hook/race-inflight/unban');x=await ban('race-inflight');
 check('unban during the DELETE: the confirmed removal is recorded, the race reported, no PUT back',banRows(x)[0]?.state==='settled'&&lastReply('race-inflight').includes('lifted while a removal was in flight')&&!state.get('race-inflight').http.some(h=>h.method==='PUT')&&x.member?.banned===0,{reply:lastReply('race-inflight'),rows:x.rows});

 // 15. Hierarchy, integration-managed and renamed roles are held one by one; the rest is removed.
 await setup('hierarchy',{present:[OFFICER,VETERAN,RAIDER,MEMBER]});const h=state.get('hierarchy');h.above.add(OFFICER);h.managed.add(VETERAN);h.renamed.add(RAIDER);x=await ban('hierarchy');
 check('held roles are never sent: only the qualifying Member role is deleted',deletes('hierarchy').length===1&&deletes('hierarchy')[0].path.endsWith('/'+MEMBER)&&present('hierarchy').includes(OFFICER)&&present('hierarchy').includes(VETERAN)&&present('hierarchy').includes(RAIDER),h.http);
 check('the officer is told each held role and why',['above the bot','integration manages','no longer match'].every(t=>lastReply('hierarchy').includes(t)),lastReply('hierarchy'));
 // Follow-up REV-BAN-1: Member given back by hand; the next visit removes it while the three held roles stay held.
 h.present.get(SUBJECT).add(MEMBER);x=await sweep('hierarchy');
 check('follow-up REV-BAN-1: a visit that removes a role while other roles are held is still reported as failed',!present('hierarchy').includes(MEMBER)&&x.result?.revoked.includes(SUBJECT)===true&&x.result.failed.includes(SUBJECT)&&(x.result.remaining??0)===0,x.result);

 // 16. A small request budget: a bounded first pass, then one role per sweep visit.
 await setup('budget',{present:ALL.slice(),budget:10});x=await ban('budget');
 check('ROLE_CALL_BUDGET=10: 5 DELETEs and a confirming read, the other 13 reported as left for the sweep',deletes('budget').length===5&&present('budget').length===13&&lastReply('budget').includes('left for the role sweep'),{reply:lastReply('budget'),left:present('budget').length});
 // Successor (12 Nov 2026): the reply says plainly that the sweep is only a safety net and how slow it is.
 // Repair round (13 Nov 2026): the cause is the budget, and the estimate is for this account alone in a shared rotation.
 check('ROLE_CALL_BUDGET=10: the reply names the budget as the cause, says the sweep is a safety net that visits one banned account per run in a shared rotation, and gives about 6.5 hours for this account alone',lastReply('budget').includes('The command ran out of Discord requests before it reached them. The role sweep is only a safety net: each run, about every 30 minutes, visits one banned account and removes at most one rank role, and other banned accounts share that rotation. For this account alone these 13 roles take about 6.5 hours; it takes longer while other banned accounts wait ahead of it.')&&!/no confirmed answer|rate limit/.test(lastReply('budget')),lastReply('budget'));
 x=await sweep('budget');costs.sweepBudgetVisit=x.statements;
 check('one sweep visit removes exactly one more role within its own request budget',deletes('budget').length===6&&present('budget').length===12&&x.attempts<=10,{attempts:x.attempts});
 check('a standing ban that still has roles to remove stays at the head of the banned rotation',x.result?.cursor==='',x.result);
 check('follow-up REV-BAN-1: that progressing visit is not reported as failed and counts the 12 roles still left',x.result?.revoked.includes(SUBJECT)===true&&!x.result.failed.includes(SUBJECT)&&x.result.remaining===12,x.result);

 // 17. A standing ban, a rank role given back by hand afterwards, and an ordinary sweep visit at the default budget.
 await setup('sweep-cost',{present:[MEMBER]});await ban('sweep-cost');state.get('sweep-cost').present.get(SUBJECT).add(MEMBER);
 const sweepFrom=state.get('sweep-cost').http.length;x=await sweep('sweep-cost');costs.sweepOneRole=x.statements;costs.sweepOneRoleRequests=state.get('sweep-cost').http.length-sweepFrom;
 check('a rank role given back during a standing ban is removed by the next sweep visit',!present('sweep-cost').includes(MEMBER)&&deletes('sweep-cost',sweepFrom).length===1&&banRows(x).filter(r=>r.state==='settled').length===2,{rows:x.rows});
 check('a finished standing ban moves the banned rotation on',x.result?.cursor===SUBJECT,x.result);
 x=await sweep('sweep-cost');costs.sweepNothingPresent=x.statements;
 check('a later visit with no rank role left writes no row and sends no DELETE',deletes('sweep-cost',sweepFrom).length===1&&banRows(x).length===2,x.rows);

 // 18. Repair round, N3: a lost D1 answer on the next role's intent after Discord acknowledged the first DELETE.
 await setup('ack-loss',{present:[VETERAN,MEMBER]});state.get('ack-loss').onDelete=()=>call('faild1/ack-loss',{match:'ban_rank1112_awaiting_dispatch'});x=await ban('ack-loss');
 const ackRow=banRows(x).find(r=>r.role_id===VETERAN),ackAudit=x.audits.filter(a=>a.action==='role.ban_rank1112').map(a=>JSON.parse(a.details)).at(-1);
 check('lost D1 answer after the first ACK: one DELETE, and the acknowledged Veteran removal is confirmed and recorded',deletes('ack-loss').length===1&&deletes('ack-loss')[0].path.endsWith('/'+VETERAN)&&!present('ack-loss').includes(VETERAN)&&ackRow?.state==='settled'&&ackRow.reason==='ban_rank1112_delete_acknowledged_and_confirmed'&&typeof ackRow.checked_at==='number',{rows:x.rows});
 check('lost D1 answer after the first ACK: the officer is told the Veteran role was removed and the Member role was never sent, never that nothing was removed',!lastReply('ack-loss').includes('No rank role was removed')&&lastReply('ack-loss').includes('Rank roles removed (confirmed absent): <@&'+VETERAN+'>')&&lastReply('ack-loss').includes('<@&'+MEMBER+'> (the command stopped before this removal was sent)'),lastReply('ack-loss'));
 check('lost D1 answer after the first ACK: the audit counts the removal and the sent DELETE',ackAudit?.removed===1&&ackAudit?.dispatched===1,x.audits);
 x=await sweep('ack-loss');
 check('the next sweep visit removes the Member role that was never sent',!present('ack-loss').includes(MEMBER)&&deletes('ack-loss').length===2&&deletes('ack-loss')[1].path.endsWith('/'+MEMBER),state.get('ack-loss').http.slice(-6));

 // 19. The same, with the confirming read also failing: the row leaves dispatching as unknown; later reconciled GET-only.
 await setup('ack-loss-unread',{verifyFirst:true,rank:6});await call('verify/ack-loss-unread');await call('age/ack-loss-unread');const au=state.get('ack-loss-unread');au.present.get(SUBJECT).add(MEMBER);
 check('setup: Veteran granted by the bot, Member by hand, roster older than 600 seconds',present('ack-loss-unread').includes(VETERAN)&&present('ack-loss-unread').includes(MEMBER),present('ack-loss-unread'));
 au.onDelete=async()=>{au.memberGetFail=1;await call('faild1/ack-loss-unread',{match:'ban_rank1112_awaiting_dispatch'});};x=await ban('ack-loss-unread');
 const auRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('lost D1 answer and a failed confirming read: the Veteran row is unknown with its own reason and reported unconfirmed',auRow?.state==='unknown'&&auRow.reason==='ban_rank1112_interrupted_after_ack'&&lastReply('ack-loss-unread').includes('unconfirmed result: <@&'+VETERAN+'> (Discord accepted the removal, but the command stopped before confirming it)')&&!lastReply('ack-loss-unread').includes('No rank role was removed'),{reply:lastReply('ack-loss-unread'),row:auRow});
 await call('expire/ack-loss-unread');let from=state.get('ack-loss-unread').http.length;x=await call('rows/ack-loss-unread');const auWindow=banRows(x).find(r=>r.id===auRow?.id);x=await sweep('ack-loss-unread');costs.sweepObserveAndRemove=x.statements;
 const auNow=banRows(x).find(r=>r.id===auRow?.id);
 // Successor (12 Nov 2026): the read that shows Veteran absent is an observation only; the row stays unknown for good.
 check('after the claim window the banned sweep only observes the unknown row (byte-identical), sends no Veteran DELETE and removes the Member role',same(auNow,auWindow)&&auNow.state==='unknown'&&x.result?.observed===1&&deletes('ack-loss-unread',from).length===1&&deletes('ack-loss-unread',from)[0].path.endsWith('/'+MEMBER)&&!present('ack-loss-unread').includes(MEMBER),{rows:x.rows,http:state.get('ack-loss-unread').http.slice(-8)});
 await unban('ack-loss-unread');await call('refresh/ack-loss-unread');x=await call('routine/ack-loss-unread');
 check('after unban the ordinary canonical routine does not grant Veteran again: the unresolved row keeps fencing it',!present('ack-loss-unread').includes(VETERAN)&&putsTo('ack-loss-unread',VETERAN)===1&&same(banRows(x).find(r=>r.id===auRow?.id),auWindow),{result:x.result,rows:banRows(x)});

 // 20. Unban while a lost-answer row is unresolved: a GET-only visit after the claim window, nothing else.
 await setup('lost-unban',{present:[VETERAN]});state.get('lost-unban').del[VETERAN]='lost-after-effect';x=await ban('lost-unban');
 const luRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('setup: a lost DELETE answer after the effect is recorded unknown',luRow?.state==='unknown'&&luRow.reason==='ban_rank1112_delete_outcome_unknown'&&!present('lost-unban').includes(VETERAN),luRow);
 await unban('lost-unban');let quietAt=state.get('lost-unban').http.length;x=await sweep('lost-unban');
 check('inside the claim window the unbanned account is not visited',state.get('lost-unban').http.length===quietAt&&banRows(x).find(r=>r.id===luRow?.id)?.state==='unknown',state.get('lost-unban').http.slice(quietAt));
 await call('expire/lost-unban');x=await call('rows/lost-unban');const luWindow=banRows(x).find(r=>r.id===luRow?.id);quietAt=state.get('lost-unban').http.length;x=await sweep('lost-unban');costs.sweepObserverUnbanned=x.statements;
 const luHttp=state.get('lost-unban').http.slice(quietAt);
 check('after unban and the claim window: one member read, no DELETE or PUT, the absence counted as an observation and the row byte-identical',luHttp.length===1&&luHttp[0].method==='GET'&&luHttp[0].path==='/guilds/'+G+'/members/'+SUBJECT&&x.result?.observed===1&&same(banRows(x).find(r=>r.id===luRow?.id),luWindow),{http:luHttp,rows:banRows(x),result:x.result});

 // 21. Account erasure's debt visit (reconcileRemovalReceipt) owns a GET-only branch for this purpose.
 await setup('erasure-debt',{present:[VETERAN]});state.get('erasure-debt').del[VETERAN]='lost-after-effect';x=await ban('erasure-debt');
 const edRow=banRows(x).find(r=>r.role_id===VETERAN);
 x=await call('receipt/erasure-debt',{id:edRow?.id});
 check('erasure debt visit inside the claim window: held without a request',x.result?.state==='held'&&x.attempts===0,x.result);
 await call('expire/erasure-debt');x=await call('rows/erasure-debt');const edWindow=banRows(x).find(r=>r.id===edRow?.id);from=state.get('erasure-debt').http.length;x=await call('receipt/erasure-debt',{id:edRow?.id});
 check('erasure debt visit after the claim window: one read, no DELETE, reported unknown (observed absent) and the row byte-identical',x.result?.state==='unknown'&&x.result.reason==='ban_rank1112_unresolved_observed_absent'&&x.attempts===1&&deletes('erasure-debt',from).length===0&&same(banRows(x).find(r=>r.id===edRow?.id),edWindow),{result:x.result,rows:banRows(x)});

 // 22. Every rank role held, for four reasons, next to a 400-character ban reason: the card, the log and the reply fit.
 await setup('long-card',{present:[...ALL],channels:true});const lc=state.get('long-card');
 for(const [,id] of RANKS.slice(0,6))lc.renamed.add(id);for(const [,id] of RANKS.slice(6,9))lc.managed.add(id);for(const [,id] of RANKS.slice(9,12))lc.above.add(id);for(const id of LEGACY)lc.perm.add(id);
 x=await ban('long-card','r'.repeat(400));
 check('every rank role held with a 400-character reason: the staff card and the log line post inside 2,000 characters',lc.posts.length===2&&lc.posts.every(p=>p.length<=2000)&&lc.posts.every(p=>p.includes('Rank roles not removed')),lc.posts.map(p=>p.length));
 check('roles that share a reason are listed once with that reason, and every held role is named',(lastReply('long-card').match(/no longer match the Olympus rank list/g)??[]).length===1&&ALL.every(id=>lastReply('long-card').includes('<@&'+id+'>'))&&lastReply('long-card').length<=2000&&deletes('long-card').length===0,lastReply('long-card'));

 // 24. Follow-up REV-BAN-1, the whole scheduled role sweep: two rank roles given back by hand during a standing ban. The
 // first run removes one and keeps the account at the head; that is progress, never "revoke failed" in the sweep audit.
 await setup('progress',{present:[ADDON],channels:true});await ban('progress');const pg=state.get('progress');pg.present.get(SUBJECT).add(VETERAN);pg.present.get(SUBJECT).add(MEMBER);
 let postsFrom=pg.posts.length;x=await rolesweep('progress','ban');
 const pgPosts=pg.posts.slice(postsFrom);
 check('follow-up REV-BAN-1: a sweep run that removes one of two rank roles reports no failure in its result or its audit',deletes('progress').length===1&&present('progress').length===2&&x.result?.revoked.includes(SUBJECT)===true&&x.result.failed.length===0&&sweepAudit(x)?.failed===0,{result:x.result,audit:sweepAudit(x)});
 check('follow-up REV-BAN-1: the server log says one rank role is left, the sweep pace, and never calls the run a failure',pgPosts.some(p=>p.includes('Olympus rank role removed from <@'+SUBJECT+'>')&&p.includes('1 more rank role is left; the role sweep removes one per run, about every 30 minutes.'))&&!pgPosts.some(p=>/could not be checked|revoke failed/.test(p)),pgPosts);
 postsFrom=pg.posts.length;x=await rolesweep('progress','ban');
 check('follow-up REV-BAN-1: the next run removes the last rank role, reports no failure and no roles left',deletes('progress').length===2&&present('progress').length===1&&present('progress')[0]===ADDON&&x.result?.failed.length===0&&sweepAudit(x)?.failed===0&&!pg.posts.slice(postsFrom).some(p=>p.includes('more rank role')),{result:x.result,audit:sweepAudit(x),posts:pg.posts.slice(postsFrom)});

 // 25-26. Follow-up REV-BAN-2: the confirming read shows the role absent but the receipt write is lost. The reason is
 // receipt_unknown whether or not the visit was interrupted; the row stays unknown (fail-closed).
 await setup('receipt-lost',{present:[VETERAN]});state.get('receipt-lost').onDelete=()=>call('faild1/receipt-lost',{match:'ban_rank1112_delete_acknowledged_and_confirmed'});x=await ban('receipt-lost');
 const rlRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('follow-up REV-BAN-2: confirmed absent but the receipt is lost: unknown with receipt_unknown and "could not be recorded"',deletes('receipt-lost').length===1&&!present('receipt-lost').includes(VETERAN)&&rlRow?.state==='unknown'&&rlRow.reason==='ban_rank1112_receipt_unknown'&&lastReply('receipt-lost').includes('unconfirmed result: <@&'+VETERAN+'> (the result could not be recorded)'),{reply:lastReply('receipt-lost'),row:rlRow});
 await setup('receipt-lost-interrupted',{present:[VETERAN,MEMBER]});
 state.get('receipt-lost-interrupted').onDelete=()=>call('faild1/receipt-lost-interrupted',{match:['ban_rank1112_awaiting_dispatch','ban_rank1112_delete_acknowledged_and_confirmed']});x=await ban('receipt-lost-interrupted');
 const riRow=banRows(x).find(r=>r.role_id===VETERAN),riReply=lastReply('receipt-lost-interrupted');
 check('follow-up REV-BAN-2: interrupted after the ACK, confirmed absent, receipt lost: unknown with receipt_unknown, never interrupted_after_ack',deletes('receipt-lost-interrupted').length===1&&!present('receipt-lost-interrupted').includes(VETERAN)&&riRow?.state==='unknown'&&riRow.reason==='ban_rank1112_receipt_unknown'&&!banRows(x).some(r=>r.role_id===MEMBER),{rows:x.rows});
 check('follow-up REV-BAN-2: the officer reads "the result could not be recorded", not "stopped before confirming it", and the unsent Member role is named',riReply.includes('unconfirmed result: <@&'+VETERAN+'> (the result could not be recorded)')&&!riReply.includes('stopped before confirming it')&&riReply.includes('<@&'+MEMBER+'> (the command stopped before this removal was sent)')&&!riReply.includes('No rank role was removed'),riReply);

 // Round 4 item 8 (13 Nov 2026). (a) The real unban command runs while the ban's DELETE is in flight: the reply calls the
 // removal in flight, not unconfirmed, and the removal still completes and is confirmed.
 await setup('unban-inflight',{present:[VETERAN]});let inflightUnban=null;state.get('unban-inflight').onDelete=async()=>{inflightUnban=await unban('unban-inflight');};x=await ban('unban-inflight');
 const ifReply=unbanReply(inflightUnban),ifRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('round 4: an unban while the ban removal is in flight says the removal is in flight and may still take effect, not that it is unconfirmed',ifReply.startsWith('<@'+SUBJECT+'> can verify again. One Olympus rank role stays blocked for them: <@&'+VETERAN+'>.')&&ifReply.includes("The ban's removal of this role was still in flight when the ban was lifted and may still take effect")&&!/no confirmed answer|unconfirmed|attended resolution/.test(ifReply)&&!!inflightUnban?.rows?.some(r=>r.purpose===BAN&&r.role_id===VETERAN&&r.state==='dispatching'),{reply:ifReply,rowsAtUnban:inflightUnban?.rows?.filter(r=>r.role_id===VETERAN)});
 check('round 4: the in-flight removal still completes: the row is settled and the role is gone, with no PUT back',ifRow?.state==='settled'&&!present('unban-inflight').includes(VETERAN)&&!state.get('unban-inflight').http.some(h=>h.method==='PUT'),{row:ifRow,reply:lastReply('unban-inflight')});
 // (b) A live claim of another purpose (a canonical routine grant) on Veteran, with no ban row at all.
 await setup('unban-other-inflight',{present:[VETERAN]});
 {const now=(await call('clock/unban-other-inflight')).now;const row={...(await synthetic('unban-other-inflight',{purpose:'canonical_routine233',desired:1,state:'dispatching',reason:'synthetic_in_flight',profile:CANONICAL_PROFILE})),created_at:now-10,expires_at:now+290,checked_at:null};await call('insert/unban-other-inflight',{rows:[row]});}
 x=await unban('unban-other-inflight');const oiReply=unbanReply(x);
 check('round 4: a live claim of another purpose on a rank role is named in the unban reply as in flight',oiReply.startsWith('<@'+SUBJECT+'> can verify again. One Olympus rank role stays blocked for them: <@&'+VETERAN+'>.')&&oiReply.includes('Another change to this role was still in flight at the unban')&&!/no confirmed answer|attended resolution/.test(oiReply),oiReply);
 // (c) Three causes at once: a lost ban removal (Veteran), a lost change of another purpose whose claim window has passed
 // (Officer: an expired claim counts as lost, not in flight) and a live claim of another purpose (Raider).
 await setup('unban-mixed',{present:[VETERAN,OFFICER,RAIDER]});
 {const now=(await call('clock/unban-mixed')).now;
  const rows=[await synthetic('unban-mixed',{purpose:BAN,desired:0,state:'unknown',reason:'ban_rank1112_delete_outcome_unknown',profile:BAN_PROFILE,role:VETERAN}),
   await synthetic('unban-mixed',{purpose:'canonical_migration233',desired:1,state:'dispatching',reason:'synthetic_expired_claim',profile:MIGRATION_PROFILE,role:OFFICER}),
   {...(await synthetic('unban-mixed',{purpose:'canonical_consumed233',desired:1,state:'dispatching',reason:'synthetic_in_flight',profile:CANONICAL_PROFILE,role:RAIDER})),created_at:now-5,expires_at:now+295,checked_at:null}];
  await call('insert/unban-mixed',{rows});}
 x=await unban('unban-mixed');const mxReply=unbanReply(x),mxList=(mxReply.split('blocked for them: ')[1]||'').split('.')[0];
 check('round 4: with three causes the reply names all three rank roles, each under its own cause, and an expired claim is unconfirmed',mxReply.includes('3 Olympus rank roles stay blocked for them:')&&[VETERAN,OFFICER,RAIDER].every(r=>mxList.includes('<@&'+r+'>'))
  &&mxReply.includes('An earlier ban removal of <@&'+VETERAN+'> got no confirmed answer')&&mxReply.includes('An earlier change to <@&'+OFFICER+'> outside the ban got no confirmed answer')&&mxReply.includes('Another change to <@&'+RAIDER+'> was still in flight at the unban')&&mxReply.length<=2000,mxReply);

 check('a non-banned member holding a rank role is never read or changed in any case',otherUntouched(),kinds.map(k=>state.get(k).http.filter(h=>h.path.includes(OTHER))));
 check('no PUT is ever sent by the ban path',ORIGINAL_KINDS.filter(k=>!['bot-veteran','ack-loss-unread','slice'].includes(k)).every(k=>!state.get(k).http.some(h=>h.method==='PUT')),null);
 // 23. The whole scheduled role slice in canonical mode: a bound member in the member rotation, then the banned visit at
 // its measured maximum path (GET-only reconciliation of an expired unknown row plus one DELETE and its confirmation).
 await setup('slice',{verifyFirst:true,rank:6});await call('verify/slice');await call('age/slice');state.get('slice').del[VETERAN]='lost-after-effect';await ban('slice');
 await call('expire/slice');state.get('slice').present.get(SUBJECT).add(MEMBER);x=await call('rows/slice');const sliceRow=banRows(x).find(r=>r.role_id===VETERAN);const sliceFrom=state.get('slice').http.length;x=await rolesweep('slice','ban');costs.banLaneSlice=x.statements;costs.banLaneSliceRequests=state.get('slice').http.length-sliceFrom;
 check('the canonical ban lane: the banned visit only observes the expired unknown row (byte-identical) and removes the hand-given Member role',!present('slice').includes(MEMBER)&&same(banRows(x).find(r=>r.id===sliceRow?.id),sliceRow)&&sliceRow?.state==='unknown'&&x.result?.lane==='ban',{result:x.result,rows:banRows(x),http:state.get('slice').http.slice(sliceFrom)});
 // Statement ceilings (repair round): every measured banned-account visit stays within the model's per-visit figure,
 // and the command stays far inside D1's 1,000 statements per invocation.
 const visitCeiling=Number((/export const BAN_RANK1112_SWEEP_VISIT_STATEMENTS\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(root,'src','scheduled-budget.ts'),'utf8'))??[])[1]);
 const visits=['sweepBudgetVisit','sweepOneRole','sweepNothingPresent','sweepUnknownStillPresent','sweepObserveAndRemove','sweepObserverUnbanned','sweep429','sweepObserveUnresolved'];
 check('every measured banned-account visit stays within scheduled-budget BAN_RANK1112_SWEEP_VISIT_STATEMENTS',Number.isSafeInteger(visitCeiling)&&visits.every(k=>Number.isSafeInteger(costs[k])&&costs[k]<=visitCeiling),{visitCeiling,costs});
 check('the ban command stays within 110 statements for one role and 460 for all 18',costs.commandOneRole<=110&&costs.commandAllRoles<=460,costs);
 // Successor (12 Nov 2026): with the lanes the banned visit never shares a run with the member walk. This measures the
 // ban lane alone (the sweep's common reads, one banned visit at its largest measured path, the receipt). The ordinary
 // lane's own maximum (117/118) and both phases on the whole-schedule fixture are Codex's to measure.
 check('the canonical ban lane at the banned visit\'s largest measured path stays within the 120-statement role slice (whole-schedule maximum not measured here)',Number.isSafeInteger(costs.banLaneSlice)&&costs.banLaneSlice<=120,costs);
 fs.writeFileSync(path.join(out,'costs.json'),JSON.stringify(costs,null,2));console.log('D1 statements (physical, incl. admission controls): '+JSON.stringify(costs));
 complete=true;
}catch(error){console.error(error);check('fixture completed',false,String(error?.stack||error));}
finally{if(mf)await mf.dispose();const failed=checks.filter(c=>!c.passed);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({schema:'evergreen1112-ban-workerd-v1',root,complete,passed:checks.length-failed.length,failed:failed.length,checks,providerCalls:0,clockOverride:false},null,2));
 console.log((checks.length-failed.length)+'/'+checks.length+' ban Workerd checks; '+out);process.exitCode=complete&&!failed.length?0:1;}
})();
