/** Independent second-batch review driver. Run only against a frozen candidate.
 * PRIVACY_HISTORY_SCHEMA_ONLY=1 validates fixtures on immutable prior production without testing unfinished code.
 */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),boundary='async function main(){';
if(source.split(boundary).length!==2)throw Error('genuine OAuth fixture boundary changed');
const casePath=path.join(__dirname,'privacy_history_native_cases.cjs');
async function review(){
 load('index');const registry=load('community-context'),ctx={A,B,STAFF,G,load};
 eq('independent33 static retained array cases',nativeCases.cases.length,33);
 eq('independent36 exact history coverage',nativeCases.collections.length,36);
 eq('actual production registers twelve export families',Array.from(registry.communityDataNames()).length,12);
 const census=fixture(),plan=registry.communityExportPlan(census.env,A);
 eq('actual production registers32 copy SQL statements',plan.statements.length,32);census.db.close();
 async function prepared(f,id=A){const c=await connect(f,id),frm=await form(f,c);provider=null;return frm;}
 async function download(f,collection,cursor=null){
  const frm=await prepared(f),footprint=['site_users','members','privacy_subjects','role_settlements'].map(t=>count(f,t));
  const beforeCalls=calls.length;let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
  const response=await copy.exportPrivacyAccess(frm.request({collection,cursor:cursor??''}),f.env),body=await response.json();
  f.hooks.statement=null;f.hooks.beforeBatch=null;
  eq(collection+' native page uses original read plus seven statements',attempts,8);eq(collection+' native page is one transaction',batches,[7]);
  eq(collection+' genuine purpose authority',body.identity.authority,'fresh_identify_only');eq(collection+' own identity',body.identity.discordId,A);
  eq(collection+' no normal account/member/subject/role creation',['site_users','members','privacy_subjects','role_settlements'].map(t=>count(f,t)),footprint);
  eq(collection+' no provider effect after OAuth',calls.length,beforeCalls);
  eq(collection+' selected collection preserved',body.history.collection,collection);
  ok(collection+' no hidden row ordering or structural custody data',!JSON.stringify(body).includes('__history_')&&!JSON.stringify(body).includes('PRIVATE-'));
  ok(collection+' no counterpart or staff structural identity',!JSON.stringify(body).includes(B)&&!JSON.stringify(body).includes(STAFF));
  eq(collection+' bounded page never claims erasure',body.coverage.completeErasure,false);
  return {body,frm};
 }
 // Legal fixture construction first; schema-only mode never dispatches a proposed new history.
 for(const item of nativeCases.cases){
  const f=fixture();
  if(item.key==='community.privacy_access.connections'){
   await connect(f,A);await connect(f,B);
   eq('connection fixture created only genuine own grants',f.db.prepare('SELECT COUNT(*)AS n FROM privacy_access_grants WHERE subject_id=?').get(A).n,2);
  }else{
   const ownCount=schemaLarge?Math.min(1002,item.capacity):2;
   nativeCases.seed(f,item.key,A,ownCount,ctx);nativeCases.seed(f,item.key,B,1,ctx,10000);
   eq(item.key+' schema valid independently retained fixture rows',count(f,item.table),ownCount+1);
  }
  f.db.close();
 }
 if(schemaOnly){provider=null;console.log('privacy_history_whole_coverage_review_test: '+checks+' native schema preparation checks PASS; proposed source NOT executed');return;}
 // The original three histories share aggregate25/selected1000 positions, including all eraser-recognized actor forms.
 for(const c of nativeCases.FIRST){
  const f=fixture();f.db.exec('BEGIN');for(let i=0;i<1002;i++){
   const at=f.time()-10000+i;
   if(c==='actions')f.db.prepare('INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,?,?)').run(at,A,'own.retained_action',B,JSON.stringify({counterpart:B}));
   else if(c==='eventChanges')f.db.prepare('INSERT INTO community_event_changes(event_id,action,actor,at,fields)VALUES(?,?,?,?,?)').run('e'.repeat(22),'updated',A,at,'["title"]');
   else f.db.prepare('INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until)VALUES(?,?,?,?,?,?,?,?,?)').run('olympus',B,1,'state_open',[A,'member:'+A,'staff:'+A,'user:'+A][i%4],1,'PRIVATE-own-decision-'+i,at,f.time()+10000);
  }f.db.exec('COMMIT');
  const frm=await prepared(f),aggregate=await (await copy.exportPrivacyAccess(frm.request({collection:'copy'}),f.env)).json(),h=aggregate.coverage.histories[c];
  eq(c+' original aggregate preview25',aggregate[c].rows.length,25);eq(c+' original aggregate total1002',h.capture.count,1002);eq(c+' original preview cursor position25',h.capture.delivered,25);
  const rest=(await download(f,c,h.nextCursor)).body.history;eq(c+' original preview tail977',rest.entries.length,977);eq(c+' original preview tail complete',rest.capture.complete,true);
  const first=(await download(f,c,h.currentCursor)).body.history;eq(c+' original selected reread1000',first.entries.length,1000);eq(c+' original selected remaining2',first.capture.remaining,2);
  const last=(await download(f,c,first.nextCursor)).body.history;eq(c+' original selected tail2',last.entries.length,2);eq(c+' original selected tail total1002',last.capture.delivered,1002);
  if(c==='contributionDecisions'){for(const row of aggregate[c].rows){eq('aggregate all actor forms own actor',row.own_actor,1);eq('aggregate actor-only counterpart omitted',row.own_subject,0);}for(const row of first.entries)eq('selected all four actor forms own relation',row.relation,'actor');}
  f.db.close();
 }
 // Empty capture for every independently named collection, including original three and legal controls made by OAuth.
 for(const collection of nativeCases.collections){
  const f=fixture(),{body}=await download(f,collection),p=body.history;
  const expected=collection==='community.privacy_access.connections'?2:0;
  eq(collection+' empty selected retained count',p.capture.count,expected);eq(collection+' empty/count finite',p.entries.length,expected);
  eq(collection+' empty selected range complete',p.capture.complete,true);eq(collection+' no next on empty completed range',p.nextCursor,null);
  eq(collection+' zero omitted retained rows',p.capture.remaining,0);f.db.close();
 }
 // Every new physical array gets an independent own/counterpart fixture and full >1000 traversal when its schema permits.
 for(const item of nativeCases.cases){
  const f=fixture();let expected=Math.min(1002,item.capacity);
  if(item.key==='community.privacy_access.connections'){
   for(let i=0;i<500;i++)await connect(f,A);await connect(f,B);expected=1000;
  }else{
   nativeCases.seed(f,item.key,A,expected,ctx);nativeCases.seed(f,item.key,B,2,ctx,10000);
  }
  // One independent fresh aggregate grant captures the same original native range as its preview/continuation.
  const aggregateForm=await prepared(f),aggregateResponse=await copy.exportPrivacyAccess(aggregateForm.request({collection:'copy'}),f.env),aggregateData=await aggregateResponse.json();
  const preview=item.key.split('.').reduce((v,k)=>v?.[k],aggregateData),previewRows=Array.isArray(preview)?preview:preview?.rows;
  const capture=aggregateData.coverage.histories[item.key];
  // Aggregate OAuth adds two authentic connection rows before this first capture.
  if(item.key==='community.privacy_access.connections')expected+=2;
  eq(item.key+' aggregate exact native count',capture.capture.count,expected);
  eq(item.key+' aggregate preview bounded25',previewRows.length,Math.min(25,expected));
  eq(item.key+' aggregate preview delivered count',capture.capture.delivered,Math.min(25,expected));
  eq(item.key+' aggregate preview remaining count',capture.capture.remaining,Math.max(0,expected-25));
  if(!Array.isArray(preview))eq(item.key+' bounded preview wrapper truthful25',preview.limit,25);
  if(expected>25){const rest=(await download(f,item.key,capture.nextCursor)).body.history;
   eq(item.key+' selected page continues after exact preview position',rest.entries.length,expected-25);
   eq(item.key+' preview tail completes original range',rest.capture.complete,true);eq(item.key+' preview original capture preserved',rest.capture.at,capture.capture.at);
  }
  const first=(await download(f,item.key,capture.currentCursor)).body.history;
  eq(item.key+' own count excludes all counterpart records',first.capture.count,expected);
  eq(item.key+' first payload count',first.entries.length,Math.min(1000,expected));
  eq(item.key+' selected original current cursor retains preview prefix',first.entries.slice(0,previewRows.length),previewRows);
  for(const entry of first.entries)eq(item.key+' exact established projection keys',Object.keys(entry).sort(),item.fields.slice().sort());
  if(expected>1000){
   eq(item.key+' exact remaining tail',first.capture.remaining,expected-1000);eq(item.key+' first page incompleteness honest',first.capture.complete,false);
   const last=(await download(f,item.key,first.nextCursor)).body.history;
   eq(item.key+' retained tail entries reachable',last.entries.length,expected-1000);eq(item.key+' full selected count delivered',last.capture.delivered,expected);
   eq(item.key+' tail complete with no hidden rest',last.capture.complete,true);eq(item.key+' tail no next cursor',last.nextCursor,null);
   eq(item.key+' original capture never refreshed',last.capture.at,first.capture.at);eq(item.key+' original24h deadline never refreshed',last.capture.expiresAt,first.capture.expiresAt);
   for(const entry of last.entries)eq(item.key+' tail exact established keys',Object.keys(entry).sort(),item.fields.slice().sort());
   const reread=(await download(f,item.key,first.currentCursor)).body.history;
   eq(item.key+' fresh original grant can reread exact first page',reread.entries,first.entries);
  }else{eq(item.key+' legal finite capacity complete',first.capture.complete,true);eq(item.key+' no invented impossible tail',first.nextCursor,null);}
  f.db.close();
 }
 // Aggregate source graph and coverage include every history, independently of registration order.
 const f=fixture(),frm=await prepared(f);let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
 const aggregate=await (await copy.exportPrivacyAccess(frm.request({collection:'copy'}),f.env)).json();f.hooks.statement=null;f.hooks.beforeBatch=null;
 eq('aggregate actual86-attempt finite envelope',attempts,86);eq('aggregate one native85-statement batch',batches,[85]);
 eq('aggregate exact36 closed capture descriptors',Object.keys(aggregate.coverage.histories).sort(),nativeCases.collections.slice().sort());
 for(const c of nativeCases.collections){const h=aggregate.coverage.histories[c];eq(c+' aggregate metadata collection binding',h.collection,c);eq(c+' aggregate selected capture deadline86400',Date.parse(h.capture.expiresAt)-Date.parse(h.capture.at),86400*1000);}
 eq('aggregate actual twelve community family projections',Object.keys(aggregate.community).sort(),Array.from(registry.communityDataNames()).sort());
 ok('aggregate retains scalar refs/profile/period projections',Object.hasOwn(aggregate.community.refs,'ref')&&Object.hasOwn(aggregate.community.directory,'main')&&Object.hasOwn(aggregate.community.restrictions,'watchListPeriod'));
 f.db.close();provider=null;console.log('privacy_history_whole_coverage_review_test: '+checks+' checks PASS');
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
const injection='\nconst nativeCases=require('+JSON.stringify(casePath)+'),schemaOnly='+JSON.stringify(process.env.PRIVACY_HISTORY_SCHEMA_ONLY==='1')+',schemaLarge='+JSON.stringify(process.env.PRIVACY_HISTORY_SCHEMA_LARGE==='1')+';\n';
mod._compile(source.slice(0,source.indexOf(boundary))+injection+'\n('+review.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',original);
