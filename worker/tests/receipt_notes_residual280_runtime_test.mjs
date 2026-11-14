// Permanent finite Native regressions for note-cleanup outcomes. Synthetic-only.
// Product index/session/writer/clock stay original; SDK faults delegate once or
// deliberately lose one original answer. No source issuer/capability is replaced.
const OWNER='472099715253796864',BASE='https://guild.example',PATH='/api/admin/treasury/ledger/note-redaction',KEY='maintenance:treasury-note-redaction280',ACTION='treasury.receipt_note_redaction280';
export const RECEIPT_NOTE_RESIDUAL_CASES280=['supported-apply','precommit-failure','postcommit-lost','status-existing-failure','status-aftercommit-failure','status-read-failure','census-read-failure','max-read-failure','malformed-marker','unsupported-count','representation','capacity','page-version','concurrent','duplicate-note-ffi','manifest-input-bound'];
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d&&Object.hasOwn(d,'value')&&typeof d.value==='function')return d.value;}throw Error('original_sdk_method');};
const packs=s=>{const x=JSON.parse(s);return Array.isArray(x)?x:[x];};
const manifestFields=q=>{const r=q.results;if(Array.isArray(r))return r.filter(v=>typeof v.manifest==='string').map(v=>v.manifest);if(r&&Array.isArray(r.columns)&&Array.isArray(r.rows)){const at=r.columns.indexOf('manifest');return at<0?[]:r.rows.map(row=>row[at]).filter(x=>typeof x==='string');}return[];};
export async function runReceiptNotesResidual280(request,bindings,h){
 const u=new URL(request.url),scenario=u.searchParams.get('scenario'),layout=u.searchParams.get('layout')==='recorded-live-pre-seal-20261017'?'recorded-live-pre-seal-20261017':'canonical',raw=bindings['DB_'+scenario.replaceAll('-','_')];
 if(!RECEIPT_NOTE_RESIDUAL_CASES280.includes(scenario)||!raw)throw Error('residual_case_missing');
 await h.setup(raw,layout);
 const env={...h.config,PRIVACY_WRITE_ADMISSION_LAYOUT:layout,DB:raw},writer=h.createPrivacyWriteAdmissionDatabase(raw,'writer',layout,'a'.repeat(32)),cases=[],wires=[];let fault=null,seenMain=0,mainSubmissions=0,barrier=null;
 const check=(name,pass,observed)=>cases.push({name:scenario+' '+name,pass:!!pass,...(observed===undefined?{}:{observed})});
 const fetcher=Object.getOwnPropertyDescriptor(raw,'fetcher').value,send=method(fetcher,'fetch');
 Object.defineProperty(fetcher,'fetch',{configurable:true,value:async function(input,init){
  const q=packs(init.body),main=q.some(x=>x.sql.startsWith("UPDATE audit SET details=json_set(details,'$.note','')")),status=q.some(x=>x.sql.includes(' AS remaining,')),census=q.some(x=>x.sql.startsWith('SELECT COUNT(*) AS rows,')),max=q.some(x=>x.sql.startsWith('SELECT COALESCE(MAX(id),0) AS ceiling')),w={requestBody:init.body,status:null,responseBody:null,main,originalReplyLost:false,beforeDelegateFailure:false};wires.push(w);
  if(main){mainSubmissions++;if(barrier){barrier.arrived++;if(barrier.arrived===2)barrier.release();else await barrier.ready;}}
  const selected=fault&&(fault.kind==='main-pre'&&main||fault.kind==='status'&&status||fault.kind==='census'&&census||fault.kind==='max'&&max);
  if(selected){fault=null;w.beforeDelegateFailure=true;throw Error('synthetic_original_native_read_or_precommit_failure');}
  const response=await Reflect.apply(send,fetcher,[input,init]);w.status=response.status;w.responseBody=await response.clone().text();
  if(main&&packs(w.responseBody).every(x=>x.success!==false)){seenMain++;if(fault?.kind==='main-post'){fault=null;w.originalReplyLost=true;throw Error('synthetic_original_native_answer_lost_after_commit');}}
  return response;
 }});
 const call=async(action,extra={},headers={})=>{const response=await h.worker.fetch(new Request(BASE+PATH,{method:'POST',headers:{Origin:BASE,'X-Olympus':'2','Content-Type':'application/json',Cookie:owner,...headers},body:JSON.stringify({action,...extra})}),env,{waitUntil(){throw Error('maintenance_must_not_defer');}});return{status:response.status,body:await response.json()};};
 const start=await h.worker.fetch(new Request(BASE+'/auth/login'),env,{waitUntil(){}}),state=new URL(start.headers.get('Location')).searchParams.get('state'),login=await h.worker.fetch(new Request(BASE+'/auth/callback?code=code-'+OWNER+'&state='+encodeURIComponent(state),{headers:{Cookie:h.cookieOf(start,'__Host-olg_state')}}),env,{waitUntil(){}});
 if(login.status!==303)throw Error('original_owner_oauth_failed '+login.status);
 const owner=h.cookieOf(login,'__Host-olg'),at=Math.floor(Date.now()/1000);
 const seed=async(details,subject='fixture-receipt')=>writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'system','treasury.receipt242',?2,?3)").bind(at,subject,typeof details==='string'?details:JSON.stringify(details)).run();
 const image=async()=>JSON.stringify((await raw.prepare("SELECT * FROM audit WHERE action='treasury.receipt242' ORDER BY id").all()).results),marker=()=>raw.prepare('SELECT value FROM site_settings WHERE key=?1').bind(KEY).first(),events=async()=>(await raw.prepare('SELECT COUNT(*) n FROM audit WHERE action=?1').bind(ACTION).first()).n;
 if(scenario==='manifest-input-bound'){
  await writer.prepare(`INSERT INTO audit(ts,actor,action,subject,details)SELECT ?1,'x','treasury.receipt242',NULL,'{"source":"mail","note":"SYNTHETIC_BOUNDED_FIRST","note":"SYNTHETIC_BOUNDED_SECOND"}' FROM json_each(?2)`).bind(at,JSON.stringify(Array.from({length:1001},(_,i)=>i))).run();
  await seed({source:'mail',note:'',payloadHash:'beyond-bounded-scope'},'beyond-bounded-scope');
 }else if(scenario==='capacity'){
  await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)SELECT ?1,'x','treasury.receipt242',NULL,'{\"source\":\"mail\",\"note\":\"\"}' FROM json_each(?2)").bind(at,JSON.stringify(Array.from({length:1001},(_,i)=>i))).run();
 }else await seed({source:'mail',note:'SYNTHETIC_PRIVATE_NOTE',payloadHash:'original-fingerprint',observedAt:at-10,retainUntil:at+1000,copper:700,items:[{name:'synthetic item'}]});
 const before=await image(),initial=await call('preview'),review=initial.body.review,apply=()=>call('apply',{review,confirm:'BLANK RECEIPT NOTES'}),unconfirmed=r=>r.status===503&&r.body.error==='receipt_note_cleanup_unconfirmed'&&r.body.nextAction==='status'&&Object.keys(r.body).sort().join(',')==='error,message,nextAction';
 if(!['capacity','manifest-input-bound'].includes(scenario))check('original counts-only preview',initial.status===200&&initial.body.state==='preview'&&!JSON.stringify(initial.body).includes('SYNTHETIC_PRIVATE_NOTE'));
 let observed={initial};
 if(scenario==='supported-apply'){
  const out=await apply(),after=JSON.parse(await image()),old=JSON.parse(before),d=JSON.parse(after[0].details),previous=JSON.parse(old[0].details);observed.out=out;
  check('actual Native apply succeeds and only note changes',out.status===200&&out.body.state==='recorded'&&after.length===old.length&&d.note===''&&Object.keys(previous).filter(k=>k!=='note').every(k=>JSON.stringify(d[k])===JSON.stringify(previous[k]))&&Object.keys(old[0]).filter(k=>k!=='details').every(k=>old[0][k]===after[0][k]));
  check('one original update marker and counts-only event',seenMain===1&&await events()===1&&!!await marker());
 }else if(scenario==='precommit-failure'||scenario==='postcommit-lost'){
  fault={kind:scenario==='precommit-failure'?'main-pre':'main-post'};const out=await apply(),status=await call('status');observed={...observed,out,status};
  check('scoped unknown response never claims cancellation',unconfirmed(out),out);
  check('fresh status distinguishes original no-commit from committed',status.status===200&&status.body.state===(scenario==='precommit-failure'?'not_recorded':'recorded'));
  check('no implicit reattempt',mainSubmissions===1&&seenMain===(scenario==='precommit-failure'?0:1));
  check('original rows and marker agree with actual delegate outcome',scenario==='precommit-failure'?await image()===before&&!await marker():JSON.parse(await image())[0].details.includes('"note":""')&&!!await marker());
 }else if(scenario==='status-existing-failure'){
  const done=await apply();fault={kind:'status'};const out=await apply(),fresh=await call('status');observed={...observed,done,out,fresh};
  check('recorded-marker status failure remains scoped',done.body.state==='recorded'&&unconfirmed(out),out);
  check('fresh status recovers without another update',fresh.body.state==='recorded'&&seenMain===1&&mainSubmissions===1&&await events()===1);
 }else if(scenario==='status-aftercommit-failure'){
  fault={kind:'status'};const out=await apply(),fresh=await call('status');observed={...observed,out,fresh};
  check('post-commit status failure stays scoped unknown',unconfirmed(out),out);
  check('original committed state retained without resend',fresh.body.state==='recorded'&&seenMain===1&&mainSubmissions===1&&await events()===1);
 }else if(['status-read-failure','census-read-failure','max-read-failure'].includes(scenario)){
  fault={kind:scenario==='status-read-failure'?'status':scenario==='census-read-failure'?'census':'max'};const out=scenario==='status-read-failure'?await call('status'):await apply();observed.out=out;
  check('authenticated read failure remains scoped',unconfirmed(out),out);
  check('failed read creates no cleanup mutation',await image()===before&&!await marker()&&seenMain===0&&mainSubmissions===0);
 }else if(scenario==='malformed-marker'){
  const valid={version:1,operationId:'11111111-1111-4111-8111-111111111111',ceiling:1,blanked:1,completedAt:at},values=['not-json','null','[]',JSON.stringify({...valid,operationId:'00000000-0000-0000-0000-000000000000'}),JSON.stringify({...valid,operationId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}),JSON.stringify({...valid,blanked:0.5}),JSON.stringify({...valid,version:2})];observed.markers=[];
  for(const value of values){await writer.prepare('INSERT INTO site_settings(key,value,updated_at)VALUES(?1,?2,?3)ON CONFLICT(key)DO UPDATE SET value=excluded.value').bind(KEY,value,at).run();const out=await call('status');observed.markers.push(out);check('malformed completion marker is scoped503',unconfirmed(out),out);}
  check('malformed markers never authorize note mutation',await image()===before&&mainSubmissions===0&&await events()===0);
 }else if(scenario==='unsupported-count'){
  await seed({source:'unsupported-source',note:'SYNTHETIC_UNCLASSIFIED_NOTE'},'unsupported');const untouched=await image(),out=await apply();observed.out=out;
  check('fully classified hold reports exact count and nextAction',out.status===409&&out.body.error==='receipt_note_cleanup_held'&&out.body.nextAction==='status'&&out.body.unclassifiedReceiptRows===1,out);
  check('unclassified source is not repaired or rewritten',await image()===untouched&&mainSubmissions===0&&!await marker());
 }else if(scenario==='representation'){
  const slash=String.fromCharCode(92),rows=['{"source":"mail","note":"'+slash+'u00e9","payloadHash":"escaped"}',' { "source": "mail", "note": "ASCII", "payloadHash": "space" } ','{"source":"mail","note":"a'+slash+'/b","payloadHash":"slash"}','{"source":"mail","note":"'+slash+'ud83d'+slash+'ude00","payloadHash":"paired"}'];
  for(let i=0;i<rows.length;i++)await seed(rows[i],'representation-'+i);
  const untouched=await image(),preview=await call('preview'),out=await apply(),status=await call('status');observed={...observed,preview,out,status};
  check('alternate stored JSON spelling is classified at preview',preview.status===409&&preview.body.error==='receipt_note_cleanup_held'&&preview.body.nextAction==='status'&&preview.body.unclassifiedReceiptRows===4,preview);
  check('alternate spelling holds before apply with precise count',out.status===409&&out.body.nextAction==='status'&&out.body.unclassifiedReceiptRows===4,out);
  check('status names unclassified rows without content',status.status===200&&status.body.unclassifiedReceiptRows===4&&!JSON.stringify(status).includes('payloadHash'));
  check('no normalization, mutation or marker',await image()===untouched&&mainSubmissions===0&&!await marker());
 }else if(scenario==='duplicate-note-ffi'){
  await seed('{"source":"mail","note":"SYNTHETIC_DUPLICATE_NOTE_FIRST","note":"SYNTHETIC_DUPLICATE_NOTE_SECOND","payloadHash":"unchanged"}','duplicate-note');
  const untouched=await image(),from=wires.length,out=await call('preview'),censusWires=wires.slice(from).filter(w=>packs(w.requestBody).some(q=>q.sql.includes(' AS manifest'))),manifests=censusWires.flatMap(w=>w.responseBody?packs(w.responseBody).flatMap(manifestFields):[]);observed={...observed,out,censusResponseCount:censusWires.length,manifestCount:manifests.length,censusManifestContainsSyntheticFirstNote:manifests.some(x=>x.includes('SYNTHETIC_DUPLICATE_NOTE_FIRST')),censusManifestContainsSyntheticSecondNote:manifests.some(x=>x.includes('SYNTHETIC_DUPLICATE_NOTE_SECOND'))};
  check('duplicate note remains a precise census hold',out.status===409&&out.body.error==='receipt_note_cleanup_held'&&out.body.unclassifiedReceiptRows===1,out);
  check('actual product census manifest is observed',censusWires.length===1&&manifests.length===1);
  check('invalid duplicate note does not cross Native manifest FFI',!observed.censusManifestContainsSyntheticFirstNote&&!observed.censusManifestContainsSyntheticSecondNote,observed);
  check('invalid original remains untouched with no main submission',await image()===untouched&&mainSubmissions===0&&!await marker());
 }else if(scenario==='manifest-input-bound'){
  const censusWires=wires.filter(w=>packs(w.requestBody).some(q=>q.sql.includes(' AS manifest'))),manifests=censusWires.flatMap(w=>w.responseBody?packs(w.responseBody).flatMap(manifestFields):[]);observed={...observed,out:initial,censusResponseCount:censusWires.length,manifestCount:manifests.length,manifestRows:manifests.length===1?JSON.parse(manifests[0]).length:null,containsBeyondBoundSentinel:manifests.some(x=>x.includes('beyond-bounded-scope'))};
  check('overcapacity remains a hold without complete classification count',initial.status===409&&initial.body.nextAction==='status'&&!Object.hasOwn(initial.body,'unclassifiedReceiptRows'));
  check('manifest excludes invalid first1001 rows before considering later rows',censusWires.length===1&&manifests.length===1&&observed.manifestRows===0&&!observed.containsBeyondBoundSentinel,observed);
  check('bounded invalid originals and later valid row are untouched',await image()===before&&mainSubmissions===0&&!await marker());
 }else if(scenario==='capacity'){
  observed.out=initial;
  check('over1000 scope refuses without misleading complete classification count',initial.status===409&&initial.body.error==='receipt_note_cleanup_held'&&initial.body.nextAction==='status'&&!Object.hasOwn(initial.body,'unclassifiedReceiptRows'),initial);
  check('capacity refusal does not mutate original rows',await image()===before&&mainSubmissions===0&&!await marker());
 }else if(scenario==='page-version'){
  const out=await call('preview',{}, {'X-Olympus':'1'});observed.out=out;
  check('actual index rejects stale supported page header',out.status===409&&out.body.error==='reload',out);
  const direct=await h.receiptNoteMaintenance280(new Request(BASE+PATH,{method:'POST',headers:{Origin:BASE,'X-Olympus':'1',Cookie:owner}}),{...env,DB:writer},OWNER,{action:'preview'}),directOut={status:direct.status,body:await direct.json()};observed.directHandler=directOut;
  check('original handler independently rejects stale supported page',directOut.status===409&&directOut.body.error==='page_outdated',directOut);
  check('stale page no mutation',await image()===before&&mainSubmissions===0&&!await marker());
 }else if(scenario==='concurrent'){
  let release,reject;const ready=new Promise((r,j)=>{release=r;reject=j;}),timer=setTimeout(()=>reject(Error('synthetic_concurrency_barrier_not_reached')),10000);barrier={arrived:0,ready,release};let outs;try{outs=await Promise.all([apply(),apply()]);}finally{clearTimeout(timer);}observed.outs=outs;barrier=null;
  check('concurrent requests reach two original Native batch boundaries',mainSubmissions===2);
  check('one original mutation/marker/audit only',seenMain===1&&await events()===1&&!!await marker());
  check('both answers are recorded status or scoped unknown',outs.some(x=>x.status===200&&x.body.state==='recorded')&&outs.every(x=>x.status===200&&x.body.state==='recorded'||unconfirmed(x)));
 }
 check('no note text in any product reply',!JSON.stringify(observed).includes('SYNTHETIC_PRIVATE_NOTE')&&!JSON.stringify(observed).includes('SYNTHETIC_UNCLASSIFIED_NOTE'));
 const control=await raw.prepare("SELECT active,nonce,purpose FROM privacy_write_admission").first();check('original Native control closes',control.active===0&&control.nonce===''&&control.purpose==='');
 return Response.json({schema:'receipt-notes-residual280-native-v1',scenario,layout,actualLocalWorkerdD1:true,actualIndexOAuth:true,clockOverride:false,handlerOverride:false,issuerOverride:false,ok:cases.every(x=>x.pass),checks:cases.length,cases,observed,mainSubmissions,knownNativeMainAnswers:seenMain,wires,scope:'Only synthetic data/providers; original current index/Native adapter/session. Faults preserve actual unknowns; no production/local journal actions.'});
}
