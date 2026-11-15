'use strict';
// Genuine local Workerd/D1, 1000 native rows. Only outbound Discord is synthetic.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build,stop}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-role-audit283-')),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
let mf,fixture,http=[],cases=[],setup;const BASE=800000000000001000n,effectKinds=['baseline','before-denied','after-denied','before-export','wrong-role'],effectRoles=new Map(),effectMutated=new Set();
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
   if(!effectRoles.has(kind))effectRoles.set(kind,new Set([EXTERNAL]));const held=effectRoles.get(kind);
   const change=async what=>{effectMutated.add(kind);const r=await mf.dispatchFetch('http://fixture.invalid/effect-mutate',{method:'POST',body:JSON.stringify({kind,change:what})});assert.equal(r.status,200,await r.text());};
   if(request.method==='GET'&&p==='/users/@me')return Response.json({id:BOT,bot:true});
   if(request.method==='GET'&&p==='/guilds/'+G+'/roles'){
    if(!effectMutated.has(kind)&&kind==='before-denied')await change('denied');
    if(!effectMutated.has(kind)&&kind==='before-export')await change('export');
    return Response.json([{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,position:40,permissions:'268435456',managed:false},{id:EXTERNAL,position:1,permissions:'0',managed:false},...setup.ranks.map((r,i)=>({id:r.roleId,name:r.name,position:30-i,permissions:'0',managed:false}))]);
   }
   if(request.method==='GET'&&p==='/guilds/'+G+'/members/'+BOT)return Response.json({user:{id:BOT,bot:true},roles:[BOTROLE]});
   if(request.method==='GET'&&p==='/guilds/'+G+'/members/'+String(BASE))return Response.json({user:{id:String(BASE),bot:false},roles:[...held],pending:false});
   if(request.method==='GET'&&p==='/guilds/'+G+'/members')return Response.json(Array.from({length:20},(_,i)=>({user:{id:String(BASE+BigInt(i)),username:'synthetic_'+i},roles:i===0?[...held]:[],pending:false})));
   const prefix='/guilds/'+G+'/members/'+String(BASE)+'/roles/';
   if(['PUT','DELETE'].includes(request.method)&&p.startsWith(prefix)){
    const role=p.slice(prefix.length);assert.ok(setup.ranks.some(r=>r.roleId===role));
    if(request.method==='PUT'){held.add(role);if(kind==='after-denied'&&!effectMutated.has(kind))await change('denied');}else held.delete(role);
    return new Response(null,{status:204});
   }
   throw Error('Unexpected synthetic writer provider request '+request.method+' '+p);
  }
  assert.equal(request.method,'GET','audit cannot directly mutate provider');assert.match(u.pathname,/\/guilds\/236932545793490944\/members$/);
  if(mode==='forbidden')return Response.json({message:'Forbidden'},{status:403});
  if(mode==='limited')return Response.json({message:'Limited',retry_after:0.01},{status:429});
  if(mode==='unavailable')return Response.json({message:'Unavailable'},{status:503});
  if(mode==='timeout')throw new Error('Synthetic network timeout');
  if(mode==='actor-change')await mutate('session');
  if(mode?.startsWith('guard-'))await mutate(mode.slice(6));
  if(mode==='bad-page')return Response.json([{user:{id:String(BASE),username:'a'},roles:[]},{user:{id:String(BASE),username:'duplicate'},roles:[]}]);
  const all=Array.from({length:1000},(_,i)=>({user:{id:String(BASE+BigInt(i)),username:'synthetic_'+i},nick:'Synthetic '+i,roles:i<20?[]:mode==='overflow'?[setup.role]:[],joined_at:'2026-11-01T10:00:00Z',pending:false}));
  return Response.json(all.filter(m=>BigInt(m.user.id)>after).slice(0,1000));
 }}));await mf.ready;
 let response=await mf.dispatchFetch('http://fixture.invalid/setup');const setupBody=await response.text();assert.equal(response.status,200,setupBody);setup=JSON.parse(setupBody);
 const unit=await (await mf.dispatchFetch('http://fixture.invalid/unit')).json();
 check('unowned manual rank stays review-only, never classified owned',unit.noReceipt.extraOwned.length===0&&unit.noReceipt.extraUnowned.length===1&&unit.noReceipt.missing.length===1,unit.noReceipt);
 check('an expired attempted unknown still blocks repair',unit.unknown.unknown===1&&unit.unknown.repairable===false,unit.unknown);
 const baseline=await run({}),page=baseline.result;
 check('current Steward v3 1000-row native source is read through real admission with20 qualified candidates',baseline.status===200&&page.rows?.length===20&&page.rows.every((r,i)=>r.expected===(i<2?setup.council:setup.role)&&!r.sourceHeld&&r.repairable)&&page.rows[0].nativeRank==='Steward'&&page.rows[1].nativeRank==='High Council'&&page.source?.member_count===1000,baseline);
 check('actual whole private read request remains below100 physical D1 statements',baseline.statements>20&&baseline.statements<100,{statements:baseline.statements});
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
 const token=page.rows?.[0]?.previewToken;
 check('repair preview is opaque, not plaintext target identity',typeof token==='string'&&!token.includes(setup.subject)&&!token.includes(setup.cookie),{hasToken:!!token});
 const invalid=await run({method:'POST',body:{subject:setup.subject,previewToken:token+'x',confirm:true}});
 check('tampered preview refuses before the normal writer',invalid.status===400&&invalid.result.error==='invalid_token',invalid);
 const repair=await run({method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('valid preview enters existing Native reconciliation and preserves its current venue hold',repair.status===200&&repair.result.oldReceiptsPreserved===true&&repair.result.result?.results?.[0]?.state==='held'&&repair.result.result.results[0].reason.includes('venue'),repair);
 for(const [kind,status,error]of [['expired',409,'preview_expired'],['future',409,'preview_expired'],['overlong',409,'preview_expired'],['unknown-field',400,'invalid_repair'],['wrong-export',409,'preview_source_changed'],['wrong-snapshot',409,'preview_source_changed'],['wrong-role',409,'preview_source_changed']]){
  const rewritten=await (await mf.dispatchFetch('http://fixture.invalid/rewrite-preview',{method:'POST',body:JSON.stringify({cookie:setup.cookie,token,kind})})).json();
  const r=await run({method:'POST',body:{subject:setup.subject,previewToken:rewritten.token,confirm:true}});
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
 for(const wrong of ['subject','snapshot','export','role']){
  const g=await mf.dispatchFetch('http://fixture.invalid/native-guard',{method:'POST',body:JSON.stringify({wrong,cookie:setup.cookie})}),r=await g.json();
  check('Native action retains exact preview '+wrong+' pin',g.status===200&&(wrong==='role'?r.captured&&r.matches===false:r.captured===false),r);
 }
 await mutate('unknown');const unknown=await run({});
 check('old unknown is visible without replay and suppresses current repair',unknown.result.rows?.[0]?.unknown===1&&!unknown.result.rows[0].repairable&&unknown.result.rows[0].previewToken===null,unknown.result.rows?.[0]);
 const changed=await run({method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('preview cannot survive changed historical outcomes',changed.status===409&&changed.result.error==='preview_source_changed',changed);
 await mutate('history');const boundedHistory=await run({}),boundedRow=boundedHistory.result.rows?.[0];
 check('retained history is bounded while full unknown count survives truncation',boundedHistory.status===200&&boundedRow?.historyTruncated&&boundedRow.retainedReceiptCount===100&&boundedRow.unknown===1&&boundedRow.expiredUnattempted===105&&!boundedRow.previewToken&&!boundedRow.repairable,boundedRow);
 await mutate('characters');const boundedCharacters=await run({}),boundedCharacterRow=boundedCharacters.result.rows?.find(r=>r.id===String(BASE+2n));
 check('character detail is bounded and incomplete history suppresses a preview',boundedCharacters.status===200&&boundedCharacterRow?.characters.length===50&&boundedCharacterRow.historyTruncated&&boundedCharacterRow.unknown===0&&!boundedCharacterRow.repairable&&!boundedCharacterRow.previewToken,boundedCharacterRow);
 await mutate('privacy');const privacy=await run({}),privateRow=privacy.result.rows?.[0];
 check('privacy-held history is withheld rather than represented as zero/complete',privacy.status===200&&privateRow?.historyWithheld&&privateRow.unknown===null&&privateRow.expiredUnattempted===null&&privateRow.historyTruncated===null&&privateRow.retainedReceiptCount===null&&privateRow.characters.length===0&&!privateRow.previewToken,privateRow);
 await mutate('stale');const stale=await run({});
 check('stale original roster holds every expected-role claim and repair',stale.status===200&&stale.result.rows.every(r=>r.sourceHeld&&r.expected===null&&!r.previewToken),stale.result.counts);
 const actor=await run({mode:'actor-change'});
 check('original actor invalidation during provider await returns no private page',[403,503].includes(actor.status)&&!actor.result.rows&&actor.result.coverage?.complete===false,actor);
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
  if(kind==='after-denied'){
   const originals=recorded.filter(x=>x.desired===1&&x.attempts===1),compensations=recorded.filter(x=>x.desired===0&&x.attempts===1);
   check('post-PUT original admin revocation performs at most one owned compensation or retains an explicit uncertain outcome',r.status===200&&result.previewReady&&result.actor?.denied===1&&puts.length===1&&deletes.length<=1&&effectRoles.get(kind).has('900000000000000005')&&
    (deletes.length===1&&!effectRoles.get(kind).has(setup.council)&&compensations.some(x=>x.state==='settled'&&x.request_digest===originals[0]?.id)||originals.some(x=>['unknown','dispatching'].includes(x.state))),{result,traffic});
  }
 }
 const stable=inputs.every(p=>hash(fs.readFileSync(p.path))===p.sha256),receipt={at:new Date().toISOString(),bundleSHA256:hash(source),inputs,stable,cases,http,ok:stable&&cases.every(c=>c.pass)};
 fs.writeFileSync(path.join(out,'site-role-audit283.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({ok:receipt.ok,checks:cases.length,evidence:out}));if(!receipt.ok)process.exitCode=1;
 }finally{clearTimeout(whole);if(mf)await mf.dispose();stop();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
