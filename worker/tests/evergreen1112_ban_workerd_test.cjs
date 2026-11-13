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
const kinds=['bot-veteran','member-manual','officer-manual','retired-manual','stack','none','not-member','delete-404','delete-403','delete-429','unknown','unban-reban','race-reban','race-inflight','hierarchy','budget','sweep-cost','ack-loss','ack-loss-unread','lost-unban','erasure-debt','long-card','slice'];
const state=new Map(kinds.map(k=>[k,{present:new Map([[SUBJECT,new Set()],[OTHER,new Set([VETERAN])]]),del:{},member404:false,above:new Set(),managed:new Set(),renamed:new Set(),perm:new Set(),memberGetFail:0,onDelete:null,onFirstGet:null,patches:[],posts:[],http:[]}]));
let mf,checks=[];
const check=(name,value,detail)=>{checks.push({name,passed:value===true,...(value===true?{}:{detail})});console.log((value===true?'PASS ':'FAIL ')+name);};
const call=async(route,body={})=>{const r=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}),t=await r.text();assert.equal(r.status,200,route+': '+t);const x=JSON.parse(t);assert.equal(x.ok,true,route+': '+t);return x;};
const deletes=(k,from=0)=>state.get(k).http.slice(from).filter(h=>h.method==='DELETE');
const writes=k=>state.get(k).http.filter(h=>!['GET'].includes(h.method)&&!h.path.startsWith('/webhooks/'));
const present=(k,s=SUBJECT)=>[...state.get(k).present.get(s)];
const lastReply=k=>state.get(k).patches.at(-1)??'';
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
 }
 x=await sweep('delete-429');costs.sweep429=x.statements;
 check('after a 429 the banned sweep continues with a new DELETE that removes the role',deletes('delete-429').length===2&&!present('delete-429').includes(MEMBER)&&banRows(x).length===2&&banRows(x)[1].state==='settled'&&banRows(x)[0].reason==='ban_rank1112_rate_limited_429',x.rows);

 // 11. An unknown outcome is never replayed: not by the sweep, not by a later ban. Veteran precedes Member in the fixed order.
 await setup('unknown',{present:[VETERAN,MEMBER]});state.get('unknown').del[VETERAN]='throw';x=await ban('unknown');
 const unknownRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('lost DELETE answer: recorded unknown, reported unconfirmed, the independent role waits',unknownRow?.state==='unknown'&&unknownRow.reason==='ban_rank1112_delete_outcome_unknown'&&lastReply('unknown').includes('unconfirmed result: <@&'+VETERAN+'>')&&lastReply('unknown').includes('left for the role sweep: <@&'+MEMBER+'>'),{reply:lastReply('unknown'),rows:x.rows});
 const before=deletes('unknown').length;x=await sweep('unknown');
 check('the sweep never replays the unknown DELETE but continues with the independent role',deletes('unknown').slice(before).every(h=>!h.path.endsWith('/'+VETERAN))&&deletes('unknown').length===before+1&&!present('unknown').includes(MEMBER),state.get('unknown').http.slice(-6));
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

 // 16. A small request budget: a bounded first pass, then one role per sweep visit.
 await setup('budget',{present:ALL.slice(),budget:10});x=await ban('budget');
 check('ROLE_CALL_BUDGET=10: 5 DELETEs and a confirming read, the other 13 reported as left for the sweep',deletes('budget').length===5&&present('budget').length===13&&lastReply('budget').includes('left for the role sweep'),{reply:lastReply('budget'),left:present('budget').length});
 x=await sweep('budget');costs.sweepBudgetVisit=x.statements;
 check('one sweep visit removes exactly one more role within its own request budget',deletes('budget').length===6&&present('budget').length===12&&x.attempts<=10,{attempts:x.attempts});
 check('a standing ban that still has roles to remove stays at the head of the banned rotation',x.result?.cursor==='',x.result);

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
 await call('expire/ack-loss-unread');let from=state.get('ack-loss-unread').http.length;x=await sweep('ack-loss-unread');costs.sweepObserveAndRemove=x.statements;
 const auNow=banRows(x).find(r=>r.id===auRow?.id);
 check('after the claim window the banned sweep closes the unknown row GET-only (never with the ACK reason), sends no Veteran DELETE and removes the Member role',auNow?.state==='settled'&&auNow.reason==='ban_rank1112_unknown_observed_absent'&&auNow.claim_nonce===auRow.claim_nonce&&auNow.attempts===1&&deletes('ack-loss-unread',from).length===1&&deletes('ack-loss-unread',from)[0].path.endsWith('/'+MEMBER)&&!present('ack-loss-unread').includes(MEMBER),{rows:x.rows,http:state.get('ack-loss-unread').http.slice(-8)});
 await unban('ack-loss-unread');await call('refresh/ack-loss-unread');x=await call('routine/ack-loss-unread');
 check('after unban the ordinary canonical routine grants Veteran again: the observed row no longer fences it',present('ack-loss-unread').includes(VETERAN)&&x.result?.state==='settled',{result:x.result});

 // 20. Unban while a lost-answer row is unresolved: a GET-only visit after the claim window, nothing else.
 await setup('lost-unban',{present:[VETERAN]});state.get('lost-unban').del[VETERAN]='lost-after-effect';x=await ban('lost-unban');
 const luRow=banRows(x).find(r=>r.role_id===VETERAN);
 check('setup: a lost DELETE answer after the effect is recorded unknown',luRow?.state==='unknown'&&luRow.reason==='ban_rank1112_delete_outcome_unknown'&&!present('lost-unban').includes(VETERAN),luRow);
 await unban('lost-unban');let quietAt=state.get('lost-unban').http.length;x=await sweep('lost-unban');
 check('inside the claim window the unbanned account is not visited',state.get('lost-unban').http.length===quietAt&&banRows(x).find(r=>r.id===luRow?.id)?.state==='unknown',state.get('lost-unban').http.slice(quietAt));
 await call('expire/lost-unban');quietAt=state.get('lost-unban').http.length;x=await sweep('lost-unban');costs.sweepObserverUnbanned=x.statements;
 const luHttp=state.get('lost-unban').http.slice(quietAt);
 check('after unban and the claim window: one member read, no DELETE or PUT, and the row is closed as observed absent',luHttp.length===1&&luHttp[0].method==='GET'&&luHttp[0].path==='/guilds/'+G+'/members/'+SUBJECT&&banRows(x).find(r=>r.id===luRow?.id)?.reason==='ban_rank1112_unknown_observed_absent',{http:luHttp,rows:banRows(x)});

 // 21. Account erasure's debt visit (reconcileRemovalReceipt) owns a GET-only branch for this purpose.
 await setup('erasure-debt',{present:[VETERAN]});state.get('erasure-debt').del[VETERAN]='lost-after-effect';x=await ban('erasure-debt');
 const edRow=banRows(x).find(r=>r.role_id===VETERAN);
 x=await call('receipt/erasure-debt',{id:edRow?.id});
 check('erasure debt visit inside the claim window: held without a request',x.result?.state==='held'&&x.attempts===0,x.result);
 await call('expire/erasure-debt');from=state.get('erasure-debt').http.length;x=await call('receipt/erasure-debt',{id:edRow?.id});
 check('erasure debt visit after the claim window: one read, no DELETE, the row closed as observed absent',x.result?.state==='settled'&&x.result.reason==='fresh_absence_only'&&x.attempts===1&&deletes('erasure-debt',from).length===0&&banRows(x).find(r=>r.id===edRow?.id)?.reason==='ban_rank1112_unknown_observed_absent',{result:x.result,rows:banRows(x)});

 // 22. Every rank role held, for four reasons, next to a 400-character ban reason: the card, the log and the reply fit.
 await setup('long-card',{present:[...ALL],channels:true});const lc=state.get('long-card');
 for(const [,id] of RANKS.slice(0,6))lc.renamed.add(id);for(const [,id] of RANKS.slice(6,9))lc.managed.add(id);for(const [,id] of RANKS.slice(9,12))lc.above.add(id);for(const id of LEGACY)lc.perm.add(id);
 x=await ban('long-card','r'.repeat(400));
 check('every rank role held with a 400-character reason: the staff card and the log line post inside 2,000 characters',lc.posts.length===2&&lc.posts.every(p=>p.length<=2000)&&lc.posts.every(p=>p.includes('Rank roles not removed')),lc.posts.map(p=>p.length));
 check('roles that share a reason are listed once with that reason, and every held role is named',(lastReply('long-card').match(/no longer match the Olympus rank list/g)??[]).length===1&&ALL.every(id=>lastReply('long-card').includes('<@&'+id+'>'))&&lastReply('long-card').length<=2000&&deletes('long-card').length===0,lastReply('long-card'));

 check('a non-banned member holding a rank role is never read or changed in any case',otherUntouched(),kinds.map(k=>state.get(k).http.filter(h=>h.path.includes(OTHER))));
 check('no PUT is ever sent by the ban path',kinds.filter(k=>!['bot-veteran','ack-loss-unread'].includes(k)).every(k=>!state.get(k).http.some(h=>h.method==='PUT')),null);
 // 23. The whole scheduled role slice in canonical mode: a bound member in the member rotation, then the banned visit at
 // its measured maximum path (GET-only reconciliation of an expired unknown row plus one DELETE and its confirmation).
 await setup('slice',{verifyFirst:true,rank:6});await call('verify/slice');await call('age/slice');state.get('slice').del[VETERAN]='lost-after-effect';await ban('slice');
 await call('expire/slice');state.get('slice').present.get(SUBJECT).add(MEMBER);const sliceFrom=state.get('slice').http.length;x=await call('rolesweep/slice');costs.roleSliceCanonical=x.statements;costs.roleSliceCanonicalRequests=state.get('slice').http.length-sliceFrom;
 check('whole canonical role slice: the banned visit closes the expired row GET-only and removes the hand-given Member role',!present('slice').includes(MEMBER)&&banRows(x).find(r=>r.role_id===VETERAN)?.reason==='ban_rank1112_unknown_observed_absent'&&x.result!==null,{result:x.result,rows:banRows(x),http:state.get('slice').http.slice(sliceFrom)});
 // Statement ceilings (repair round): every measured banned-account visit stays within the model's per-visit figure,
 // and the command stays far inside D1's 1,000 statements per invocation.
 const visitCeiling=Number((/export const BAN_RANK1112_SWEEP_VISIT_STATEMENTS\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(root,'src','scheduled-budget.ts'),'utf8'))??[])[1]);
 const visits=['sweepBudgetVisit','sweepOneRole','sweepNothingPresent','sweepUnknownStillPresent','sweepObserveAndRemove','sweepObserverUnbanned','sweep429'];
 check('every measured banned-account visit stays within scheduled-budget BAN_RANK1112_SWEEP_VISIT_STATEMENTS',Number.isSafeInteger(visitCeiling)&&visits.every(k=>Number.isSafeInteger(costs[k])&&costs[k]<=visitCeiling),{visitCeiling,costs});
 check('the ban command stays within 110 statements for one role and 460 for all 18',costs.commandOneRole<=110&&costs.commandAllRoles<=460,costs);
 check('the whole canonical role slice with the banned visit at its maximum path stays within the 120-statement role slice',Number.isSafeInteger(costs.roleSliceCanonical)&&costs.roleSliceCanonical<=120,costs);
 fs.writeFileSync(path.join(out,'costs.json'),JSON.stringify(costs,null,2));console.log('D1 statements (physical, incl. admission controls): '+JSON.stringify(costs));
 complete=true;
}catch(error){console.error(error);check('fixture completed',false,String(error?.stack||error));}
finally{if(mf)await mf.dispose();const failed=checks.filter(c=>!c.passed);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({schema:'evergreen1112-ban-workerd-v1',root,complete,passed:checks.length-failed.length,failed:failed.length,checks,providerCalls:0,clockOverride:false},null,2));
 console.log((checks.length-failed.length)+'/'+checks.length+' ban Workerd checks; '+out);process.exitCode=complete&&!failed.length?0:1;}
})();
