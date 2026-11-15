'use strict';
// Genuine local Workerd/D1, 1000 native rows. Only outbound Discord is synthetic.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build,stop}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-role-audit283-')),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
let mf,fixture,http=[],cases=[],setup;const BASE=800000000000001000n,effectKinds=['baseline','before-denied','after-denied','before-export','wrong-role','preview-expired','preview-control','preview-reserve'],effectRoles=new Map(),effectMutated=new Set(),effectWaits=new Map();
const check=(name,pass,detail)=>{cases.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(pass?'':' '+JSON.stringify(detail).slice(0,1800)));};
const run=async spec=>{const r=await mf.dispatchFetch('http://fixture.invalid/run',{method:'POST',body:JSON.stringify({cookie:setup?.cookie,...spec})});assert.equal(r.status,200);return r.json();};
const mutate=async kind=>{const r=await mf.dispatchFetch('http://fixture.invalid/mutate',{method:'POST',body:JSON.stringify({kind})});assert.equal(r.status,200,await r.text());};
const whole=setTimeout(()=>{console.error('role-audit283 whole-command deadline');process.exitCode=1;mf?.dispose();},180000);
(async()=>{try{
 const built=await build({entryPoints:[path.join(__dirname,'site_role_audit283_fixture.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent'});
 const source=built.outputFiles[0].text,inputs=Object.keys(built.metafile.inputs).map(p=>({path:path.resolve(root,p),sha256:hash(fs.readFileSync(path.resolve(root,p)))}));
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:source,modules:true,name:'site-role-audit283',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'site-role-audit283',...Object.fromEntries(effectKinds.map(k=>['DB_EFFECT_'+k.replaceAll('-','_'),'role-effect-'+k]))},outboundService:async request=>{
  const u=new URL(request.url),mode=request.headers.get('authorization')?.replace('Bot role-audit-',''),after=BigInt(u.searchParams.get('after')||'0');
  http.push({method:request.method,path:u.pathname,mode,after:String(after)});
  assert.equal(u.origin,'https://discord.com');
  if(mode?.startsWith('effect-')){
   const kind=mode.slice(7),p=u.pathname.replace(/^\/api\/v10/,''),BOT='800000000000000003',BOTROLE='800000000000000004',EXTERNAL='900000000000000005',G='236932545793490944';
   if(!effectRoles.has(kind))effectRoles.set(kind,new Set([EXTERNAL,...(['preview-control','preview-reserve'].includes(kind)?[setup.officer]:[])]));const held=effectRoles.get(kind);
   const change=async what=>{effectMutated.add(kind);const r=await mf.dispatchFetch('http://fixture.invalid/effect-mutate',{method:'POST',body:JSON.stringify({kind,change:what})});assert.equal(r.status,200,await r.text());};
   if(request.method==='GET'&&p==='/users/@me')return Response.json({id:BOT,bot:true});
   if(request.method==='GET'&&p==='/guilds/'+G+'/roles'){
    if(!effectMutated.has(kind)&&['preview-expired','preview-control'].includes(kind)){
     effectMutated.add(kind);const beganAt=Math.floor(Date.now()/1000);await new Promise(resolve=>setTimeout(resolve,5000));effectWaits.set(kind,{beganAt,finishedAt:Math.floor(Date.now()/1000),waitedMilliseconds:5000});
    }
    if(!effectMutated.has(kind)&&kind==='before-denied')await change('denied');
    if(!effectMutated.has(kind)&&kind==='before-export')await change('export');
    return Response.json([{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,position:40,permissions:'268435456',managed:false},{id:EXTERNAL,position:1,permissions:'0',managed:false},...setup.ranks.map((r,i)=>({id:r.roleId,name:r.name,position:30-i,permissions:'0',managed:false}))]);
   }
   if(request.method==='GET'&&p==='/guilds/'+G+'/members/'+BOT)return Response.json({user:{id:BOT,bot:true},roles:[BOTROLE]});
   if(request.method==='GET'&&p==='/guilds/'+G+'/members/'+String(BASE))return Response.json({user:{id:String(BASE),username:'synthetic_0',bot:false},roles:[...held],pending:false});
   if(request.method==='GET'&&p==='/guilds/'+G+'/members')return Response.json(Array.from({length:20},(_,i)=>({user:{id:String(BASE+BigInt(i)),username:'synthetic_'+i},roles:i===0?[...held]:[],pending:false})));
   const prefix='/guilds/'+G+'/members/'+String(BASE)+'/roles/';
   if(['PUT','DELETE'].includes(request.method)&&p.startsWith(prefix)){
    const role=p.slice(prefix.length);assert.ok(setup.ranks.some(r=>r.roleId===role));
    if(request.method==='PUT'){held.add(role);if(kind==='after-denied'&&!effectMutated.has(kind))await change('denied');}else held.delete(role);
    return new Response(null,{status:204});
   }
   throw Error('Unexpected synthetic writer provider request '+request.method+' '+p);
  }
  assert.equal(request.method,'GET','audit cannot directly mutate provider');assert.match(u.pathname,/\/guilds\/236932545793490944\/members(?:\/[0-9]+)?$/);
  if(mode==='forbidden')return Response.json({message:'Forbidden'},{status:403});
  if(mode==='limited')return Response.json({message:'Limited',retry_after:0.01},{status:429});
  if(mode==='unavailable')return Response.json({message:'Unavailable'},{status:503});
  if(mode==='timeout')throw new Error('Synthetic network timeout');
  if(mode==='actor-change')await mutate('session');
  if(mode?.startsWith('guard-'))await mutate(mode.slice(6));
  if(mode==='bad-page')return Response.json([{user:{id:String(BASE),username:'a'},roles:[]},{user:{id:String(BASE),username:'duplicate'},roles:[]}]);
  const singleId=/\/members\/([0-9]+)$/.exec(u.pathname)?.[1];
  if(singleId){if(mode==='source-change')await mutate('source-change');return Response.json({user:{id:singleId,username:'synthetic_'+String(BigInt(singleId)-BASE)},roles:mode==='unowned'?[setup.officer]:[],pending:false});}
  const all=Array.from({length:1000},(_,i)=>({user:{id:String(BASE+BigInt(i)),username:'synthetic_'+i},nick:'Synthetic '+i,roles:i<20?[]:mode==='overflow'?[setup.role]:[],joined_at:'2026-11-01T10:00:00Z',pending:false}));
  if(mode==='unowned')all[0].roles=[setup.officer];
  if(mode==='pending')all[1].pending=true;
  return Response.json(all.filter(m=>BigInt(m.user.id)>after).slice(0,1000));
 }}));await mf.ready;
 let response=await mf.dispatchFetch('http://fixture.invalid/setup');const setupBody=await response.text();assert.equal(response.status,200,setupBody);setup=JSON.parse(setupBody);
 const unit=await (await mf.dispatchFetch('http://fixture.invalid/unit')).json();
 check('unowned manual rank stays review-only and suppresses repair despite missing desired rank',unit.noReceipt.extraOwned.length===0&&unit.noReceipt.extraUnowned.length===1&&unit.noReceipt.missing.length===1&&unit.noReceipt.repairable===false,unit.noReceipt);
 check('old native232 staff grant is conservatively unowned here and cannot expose repair',unit.nativeStaff.extraUnowned.length===1&&unit.nativeStaff.repairable===false,unit.nativeStaff);
 check('an expired attempted unknown still blocks repair',unit.unknown.unknown===1&&unit.unknown.repairable===false,unit.unknown);
 const baseline=await run({}),page=baseline.result;
 check('current Steward v3 1000-row native source is read through real admission with20 qualified candidates',baseline.status===200&&page.rows?.length===20&&page.rows.every((r,i)=>r.expected===(i<2?setup.council:setup.role)&&!r.sourceHeld&&r.repairable)&&page.rows[0].nativeRank==='Steward'&&page.rows[1].nativeRank==='High Council'&&page.source?.member_count===1000,baseline);
 check('actual whole private read request remains below100 physical D1 statements',baseline.statements>20&&baseline.statements<100,{statements:baseline.statements});
 const unowned=await run({mode:'unowned'});
 check('extra unowned role suppresses encrypted repair preview on actual GET',unowned.status===200&&unowned.result.rows?.[0]?.extraUnowned.includes(setup.officer)&&!unowned.result.rows[0].repairable&&unowned.result.rows[0].previewToken===null,unowned.result.rows?.[0]);
 const pending=await run({mode:'pending'});
 check('screening-pending candidates have counts-only coverage with no identity row',pending.status===200&&pending.result.withheld?.membershipScreening===1&&!pending.result.rows.some(r=>r.id===String(BASE+1n))&&!JSON.stringify(pending.result).includes('synthetic_1\"'),pending.result.counts);
 const activeV1=await run({activeV1:true}),planning=await run({activeV1:true,policyPreview:'steward-v3'});
 check('inactive v3 plan uses real qualified Steward source while preserving separate held active-v1 mapping',activeV1.status===200&&activeV1.result.activePolicy.version===1&&activeV1.result.rows.every(r=>r.expected===null)&&planning.status===200&&planning.result.activePolicy.version===1&&planning.result.proposedPolicy.version===3&&planning.result.activationRequired===true&&planning.result.rows.every((r,i)=>r.expected===(i<2?setup.council:setup.role)&&r.activeExpected===null&&r.activationRequired&&!r.repairable&&r.previewToken===null),{active:activeV1.result.counts,planning:planning.result.counts});
 const planningPost=await run({activeV1:true,policyPreview:'steward-v3',method:'POST',body:{subject:setup.subject,previewToken:'unused',confirm:true}}),crossView=await run({activeV1:true,cursor:planning.result.nextCursor});
 check('planning cannot POST or reuse its cursor in the active view',planningPost.status===400&&planningPost.result.error==='planning_view_read_only'&&crossView.status===400&&crossView.result.error==='invalid_token',{planningPost,crossView});
 check('native-linked denominator is separate and absent accounts are explicitly unchecked',page.coverage?.nativeLinkedCandidateSubjects===20&&page.coverage.nativeLinkedAccountsAbsentFromDiscord==='not_individually_checked'&&page.coverage.convergenceConfirmed===false,page.coverage);
 check('unrelated Discord accounts are counts only and retain full coverage',page.coverage?.providerRowsProcessed===1000&&page.coverage.observedOnly===980&&page.rows.length===20&&!!page.nextCursor&&!page.coverage.complete,page.coverage);
 const fullResponse=await mf.dispatchFetch('http://fixture.invalid/full-route',{method:'POST',body:JSON.stringify({cookie:setup.cookie})}),full=await fullResponse.json();
 check('normal full Worker route admits the signed administrator and returns the bounded private audit',full.status===200&&full.result.rows?.length===20&&full.result.coverage?.nativeLinkedCandidateSubjects===20,{status:full.status,error:full.error,result:full.result.error,statements:full.statements});
 check('full Worker private request stays below100 physical D1 statements',full.statements>20&&full.statements<100,{statements:full.statements});
 check('legacy name-only and Discord joined dates retain separate provenance with no native join/episode claim',page.rows?.[0]?.characters?.[0]?.legacyNameFirstObservedAt&&page.rows[0].characters[0].actualJoinedAt===null&&page.rows[0].characters[0].currentEpisodeFirstObservedAt===null&&page.rows[0].discordJoinedAt&&page.rows[0].firstObservedProvenance.includes('not current character/GUID'),page.rows?.[0]);
 const done=await run({cursor:page.nextCursor});check('next provider page completes a non-atomic traversal without re-reading members',done.status===200&&done.result.coverage.complete===true&&!done.result.nextCursor&&done.result.rows.length===0,done.result);
 const beforeOverflow=http.length,overflow=await run({mode:'overflow'}),second=await run({mode:'overflow',cursor:overflow.result.nextCursor});
 check('overflow cursor resumes after last actually reviewed candidate',overflow.result.rows?.length===20&&second.result.rows?.[0]?.id===String(BASE+20n)&&http[beforeOverflow+1]?.after===String(BASE+19n),{first:overflow.result.coverage,secondFirst:second.result.rows?.[0]?.id,http:http.slice(beforeOverflow)});
 for(const [mode,status,gap]of [['forbidden',403,'discord_forbidden_members_intent_or_permissions'],['limited',429,'discord_rate_limited'],['unavailable',503,'provider_or_admission_unavailable'],['timeout',503,'provider_or_admission_unavailable'],['bad-page',503,'discord_reply_unconfirmed']]){
  const before=http.length,r=await run({mode});check(mode+' is an explicit coverage gap with one provider request and no retry',r.status===status&&r.result.coverage?.complete===false&&r.result.coverage.gap===gap&&http.length===before+1,{status:r.status,result:r.result,calls:http.length-before});
 }
 const refreshBefore=http.length,fresh=await run({subjectQuery:setup.subject}),freshRow=fresh.result.rows?.[0],refreshTraffic=http.slice(refreshBefore),token=freshRow?.previewToken;
 check('whole traversal supplies no repair token; exact per-row Review performs one member GET and no guild list or effect',page.rows.every(r=>r.previewToken===null)&&fresh.status===200&&freshRow?.id===setup.subject&&refreshTraffic.length===1&&refreshTraffic[0].method==='GET'&&refreshTraffic[0].path.endsWith('/members/'+setup.subject)&&fresh.result.coverage.scope==='single_discord_member_read'&&fresh.result.coverage.singleMemberReadComplete===true&&fresh.result.coverage.complete===false&&!fresh.result.nextCursor,{coverage:fresh.result.coverage,refreshTraffic});
 const previewClock=await (await mf.dispatchFetch('http://fixture.invalid/rewrite-preview',{method:'POST',body:JSON.stringify({cookie:setup.cookie,token,kind:'inspect'})})).json();
 check('new original per-row preview gets up to300s, bounded by genuine Native deadline and original session',previewClock.expiresAt-previewClock.issuedAt>112&&previewClock.expiresAt-previewClock.issuedAt<=300&&previewClock.expiresAt<=freshRow.deadline&&previewClock.expiresAt<=previewClock.sessionExpiresAt&&freshRow.previewExpiresAt===previewClock.expiresAt,{previewClock,deadline:freshRow.deadline});
 const sessionBound=await run({cookie:setup.shortCookie,subjectQuery:setup.subject});
 check('short original session caps newly issued preview without renewing that session',sessionBound.status===200&&sessionBound.result.rows?.[0]?.previewExpiresAt===setup.shortSessionExpiresAt&&sessionBound.result.rows[0].previewExpiresAt<=sessionBound.result.rows[0].deadline,sessionBound.result.rows?.[0]);
 const heldFresh=await run({mode:'unowned',subjectQuery:setup.subject}),plannedFresh=await run({activeV1:true,policyPreview:'steward-v3',subjectQuery:setup.subject});
 check('fresh unowned and inactive-planning per-row reads remain tokenless',heldFresh.status===200&&!heldFresh.result.rows?.[0]?.repairable&&heldFresh.result.rows[0].previewToken===null&&plannedFresh.status===200&&plannedFresh.result.rows?.[0]?.activationRequired&&plannedFresh.result.rows[0].previewToken===null,{held:heldFresh.result.counts,planning:plannedFresh.result.counts});
 const sourceChanged=await run({mode:'source-change',subjectQuery:setup.subject});
 check('changed original export during exact member GET withholds the whole fresh preview',sourceChanged.status===409&&sourceChanged.result.error==='roster_changed_during_page'&&!sourceChanged.result.rows,sourceChanged.result);await mutate('source-restore');
 check('repair preview is opaque, not plaintext target identity',typeof token==='string'&&!token.includes(setup.subject)&&!token.includes(setup.cookie),{hasToken:!!token});
 const invalid=await run({method:'POST',body:{subject:setup.subject,previewToken:token+'x',confirm:true}});
 check('tampered preview refuses before the normal writer',invalid.status===400&&invalid.result.error==='invalid_token',invalid);
 const repair=await run({method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('valid preview enters existing Native reconciliation and preserves its current venue hold',repair.status===200&&repair.result.oldReceiptsPreserved===true&&repair.result.result?.results?.[0]?.state==='held'&&repair.result.result.results[0].reason.includes('venue'),repair);
 check('repair records confirmed officer request intent without claiming a provider result',repair.result.requestIntentRecorded===true&&typeof repair.result.requestId==='string'&&repair.result.maxPlannedEffects===2,repair.result);
 const changedRoles=await run({mode:'unowned',method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('fresh POST unowned role change holds before writer entry even with older safe token',changedRoles.status===409&&changedRoles.result.error==='preview_roles_changed_or_unowned',changedRoles.result);
 // A separate genuine signed officer keeps independent boundary cases within
 // the unchanged production POST10/min account allowance; no limiter reset.
 const secondPreview=await run({cookie:setup.secondCookie,subjectQuery:setup.subject}),secondToken=secondPreview.result.rows[0].previewToken;
 for(const [kind,status,error]of [['expired',409,'preview_expired'],['future',409,'preview_expired'],['overlong',409,'preview_expired'],['unknown-field',400,'invalid_repair'],['wrong-export',409,'preview_source_changed'],['wrong-snapshot',409,'preview_source_changed'],['wrong-role',409,'preview_source_changed']]){
  const rewritten=await (await mf.dispatchFetch('http://fixture.invalid/rewrite-preview',{method:'POST',body:JSON.stringify({cookie:setup.secondCookie,token:secondToken,kind})})).json();
  const r=await run({cookie:setup.secondCookie,method:'POST',body:{subject:setup.subject,previewToken:rewritten.token,confirm:true}});
  check(kind+' original sealed preview cannot be renewed or reinterpreted',r.status===status&&r.result.error===error,{status:r.status,result:r.result});
 }
 for(const kind of ['denied','left','banned']){
  const g=await mf.dispatchFetch('http://fixture.invalid/guard',{method:'POST',body:JSON.stringify({kind,cookie:setup.cookie})}),r=await g.json();
  check('original admin '+kind+' during provider await blocks the next Native database group',g.status===200&&r.prior?.ok===1&&r.refused&&(kind==='denied'?r.actual.denied===1:kind==='left'?r.actual.in_server===0:r.actual.banned===1),r);
  await mutate('restore');
 }
 for(const kind of ['denied','left','banned']){
  const g=await mf.dispatchFetch('http://fixture.invalid/native-guard',{method:'POST',body:JSON.stringify({kind:'guard-'+kind,cookie:setup.cookie})}),r=await g.json();
  check('actual Native capture→custody→new-effect predicate retains original admin '+kind+' fence after provider wait',g.status===200&&r.captured&&r.matches&&r.prior?.ok===1&&r.after?.ok===0&&r.receipt?.ok===1,r);
  await mutate('restore');
 }
 for(const wrong of ['subject','snapshot','export','role','expired','malformed-expiry','missing-expiry','unknown-field']){
  const g=await mf.dispatchFetch('http://fixture.invalid/native-guard',{method:'POST',body:JSON.stringify({wrong,cookie:setup.cookie})}),r=await g.json();
  check('Native action retains exact preview '+wrong+' pin',g.status===200&&(wrong==='role'?r.captured&&r.matches===false:r.captured===false),r);
 }
 await mutate('unknown');const unknown=await run({});
 check('old unknown is visible without replay and suppresses current repair',unknown.result.rows?.[0]?.unknown===1&&!unknown.result.rows[0].repairable&&unknown.result.rows[0].previewToken===null,unknown.result.rows?.[0]);
 const unknownFresh=await run({subjectQuery:setup.subject});check('fresh single-account read cannot issue a new token around historical unknown effects',unknownFresh.status===200&&unknownFresh.result.rows?.[0]?.unknown===1&&!unknownFresh.result.rows[0].repairable&&unknownFresh.result.rows[0].previewToken===null,unknownFresh.result.rows?.[0]);
 const changed=await run({method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('preview cannot survive changed historical outcomes',changed.status===409&&changed.result.error==='preview_source_changed',changed);
 await mutate('history');const boundedHistory=await run({}),boundedRow=boundedHistory.result.rows?.[0];
 check('retained history is bounded while full unknown count survives truncation',boundedHistory.status===200&&boundedRow?.historyTruncated&&boundedRow.retainedReceiptCount===100&&boundedRow.unknown===1&&boundedRow.expiredUnattempted===105&&!boundedRow.previewToken&&!boundedRow.repairable,boundedRow);
 await mutate('characters');const boundedCharacters=await run({}),boundedCharacterRow=boundedCharacters.result.rows?.find(r=>r.id===String(BASE+2n));
 check('character detail is bounded and incomplete history suppresses a preview',boundedCharacters.status===200&&boundedCharacterRow?.characters.length===50&&boundedCharacterRow.historyTruncated&&boundedCharacterRow.unknown===0&&!boundedCharacterRow.repairable&&!boundedCharacterRow.previewToken,boundedCharacterRow);
 await mutate('privacy');const privacy=await run({});
 check('privacy-held identity/history is aggregate-only with no row, raw ID, name or token',privacy.status===200&&privacy.result.withheld?.privacy===1&&privacy.result.counts.withheldCandidates===1&&!privacy.result.rows.some(r=>r.id===setup.subject)&&!JSON.stringify(privacy.result.rows).includes(setup.subject)&&!JSON.stringify(privacy.result.rows).includes('synthetic_0\"'),privacy.result.counts);
 const privateFresh=await run({subjectQuery:setup.subject});check('per-row privacy change removes identity and confirmation rather than leaking the cached row',privateFresh.status===200&&privateFresh.result.rows.length===0&&privateFresh.result.withheld?.privacy===1&&privateFresh.result.coverage.singleMemberReadComplete===true,privateFresh.result.counts);
 await mutate('stale');const stale=await run({});
 check('stale original roster holds every expected-role claim and repair',stale.status===200&&stale.result.rows.every(r=>r.sourceHeld&&r.expected===null&&!r.previewToken),stale.result.counts);
 const staleFresh=await run({subjectQuery:String(BASE+1n)});check('per-row refresh cannot turn a stale native source into a current preview',staleFresh.status===200&&staleFresh.result.rows?.[0]?.sourceHeld&&staleFresh.result.rows[0].expected===null&&staleFresh.result.rows[0].previewToken===null,staleFresh.result.rows?.[0]);
 const actor=await run({mode:'actor-change',subjectQuery:String(BASE+1n)});
 check('original actor invalidation during exact-account provider await returns no private page',[403,503].includes(actor.status)&&!actor.result.rows&&actor.result.coverage?.complete===false,actor);
 check('audit and rejected repairs made no direct role writes',http.every(r=>r.method==='GET'),http);
 const planResponse=await mf.dispatchFetch('http://fixture.invalid/plans'),plans=await planResponse.json(),targetPlan=plans.plans?.find(p=>p.prefix.startsWith('SELECT wanted.value AS id,p.generation'));
 check('exact bounded audit SQL plans use indexed account links and role subjects on1000 native rows',planResponse.status===200&&JSON.stringify(targetPlan).includes('characters_discord')&&JSON.stringify(targetPlan).includes('role_settlement_subject')&&plans.plans.length===3,plans);
 for(const kind of effectKinds){
  const r=await mf.dispatchFetch('http://fixture.invalid/effect-run',{method:'POST',body:JSON.stringify({kind})}),body=await r.text();let result;try{result=JSON.parse(body);}catch{result={error:body.slice(0,1600)};}
  const traffic=http.filter(h=>h.mode==='effect-'+kind),puts=traffic.filter(h=>h.method==='PUT'),deletes=traffic.filter(h=>h.method==='DELETE'),recorded=result.receipts||[];
  if(kind==='baseline')check('actual Native writer baseline acknowledges one current grant with manual external role preserved',r.status===200&&result.previewReady&&puts.length===1&&deletes.length===0&&effectRoles.get(kind).has(setup.council)&&effectRoles.get(kind).has('900000000000000005')&&recorded.some(x=>x.desired===1&&x.attempts===1&&x.state==='settled'&&x.reason==='canonical233_put_acknowledged_and_confirmed'),{result,traffic});
  if(kind==='before-denied')check('actual Native writer blocks PUT when original admin is denied during inventory GET',r.status===200&&result.previewReady&&result.actor?.denied===1&&puts.length===0&&deletes.length===0&&!recorded.some(x=>x.attempts===1),{result,traffic});
  if(kind==='before-export')check('actual Native writer blocks PUT when sealed original export changes during inventory GET',r.status===200&&result.previewReady&&effectMutated.has(kind)&&puts.length===0&&deletes.length===0&&!recorded.some(x=>x.attempts===1),{result,traffic});
  if(kind==='wrong-role')check('actual Native writer rejects a different expected role before any effect',r.status===200&&result.previewReady&&puts.length===0&&deletes.length===0&&result.action?.body?.results?.[0]?.reason==='attended_role_preview_changed',{result,traffic});
  if(kind==='preview-expired')check('original5s grant-only preview is now held by full-plan reserve before provider inventory or any new intent',r.status===200&&result.previewReady&&!effectWaits.has(kind)&&puts.length===0&&deletes.length===0&&recorded.length===1&&recorded[0].purpose==='canonical_identity233'&&result.action?.body?.result?.requests===0&&result.action.body.result.results?.[0]?.reason==='canonical233_plan_deadline_insufficient',{result,traffic,scope:'Early reservation evidence only; post-await expiry path was not reached.'});
  if(kind==='preview-control')check('full original120s preview with real5s provider wait permits bounded acknowledged owned removal plus desired grant',r.status===200&&result.previewReady&&effectWaits.has(kind)&&effectWaits.get(kind).finishedAt<result.previewExpiresAt&&puts.length===1&&deletes.length===1&&!effectRoles.get(kind).has(setup.officer)&&effectRoles.get(kind).has(setup.council)&&JSON.stringify(result.originalOwned)===JSON.stringify(result.originalOwnedAfter)&&recorded.some(x=>x.desired===1&&x.attempts===1&&x.state==='settled'),{result,traffic,wait:effectWaits.get(kind)});
  if(kind==='preview-reserve')check('still-valid original30s preview cannot borrow longer Native deadline for owned remove+replacement reserve',r.status===200&&result.previewReady&&Math.floor(Date.now()/1000)<result.previewExpiresAt&&result.nativeDeadline-Math.floor(Date.now()/1000)>112&&puts.length===0&&deletes.length===0&&effectRoles.get(kind).has(setup.officer)&&!effectRoles.get(kind).has(setup.council)&&JSON.stringify(result.originalOwned)===JSON.stringify(result.originalOwnedAfter)&&result.action?.body?.result?.results?.[0]?.reason==='canonical233_plan_deadline_insufficient'&&!recorded.some(x=>x.id!==result.originalOwned.id&&x.attempts===1),{result,traffic});
  if(kind==='after-denied'){
   const originals=recorded.filter(x=>x.desired===1&&x.attempts===1),compensations=recorded.filter(x=>x.desired===0&&x.attempts===1);
   check('post-PUT original admin revocation performs at most one owned compensation or retains an explicit uncertain outcome',r.status===200&&result.previewReady&&result.actor?.denied===1&&puts.length===1&&deletes.length<=1&&effectRoles.get(kind).has('900000000000000005')&&
    (deletes.length===1&&!effectRoles.get(kind).has(setup.council)&&compensations.some(x=>x.state==='settled'&&x.request_digest===originals[0]?.id)||originals.some(x=>['unknown','dispatching'].includes(x.state))),{result,traffic});
   check('post-writer admission loss returns honest unconfirmed copy without private result',result.action?.body?.error==='repair_outcome_unconfirmed'&&result.action.body.outcome==='roles_may_have_changed'&&!result.action.body.result,result.action);
  }
  if(kind!=='wrong-role')check(kind+' intent is attributed to original officer with privacy subject reference, never scheduled role.request242',result.intents?.length===1&&/^80000000000000010[0-9]$/.test(result.intents[0].actor)&&result.intents[0].subject===setup.subject&&JSON.parse(result.intents[0].details)._privacySubjectIds.includes(setup.subject)&&JSON.parse(result.intents[0].details).maxPlannedEffects===2,result.intents);
 }
 const stable=inputs.every(p=>hash(fs.readFileSync(p.path))===p.sha256),receipt={at:new Date().toISOString(),bundleSHA256:hash(source),inputs,stable,cases,http,ok:stable&&cases.every(c=>c.pass)};
 fs.writeFileSync(path.join(out,'site-role-audit283.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({ok:receipt.ok,checks:cases.length,evidence:out}));if(!receipt.ok)process.exitCode=1;
 }finally{clearTimeout(whole);if(mf)await mf.dispose();stop();}})().catch(e=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({at:new Date().toISOString(),ok:false,error:String(e.stack||e),cases,http},null,2)+'\n');console.error(e.stack);console.error('Preserved failure: '+out);process.exitCode=1;});
