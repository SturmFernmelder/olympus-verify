import {receiptNoteMaintenance280} from '../src/treasury-note-maintenance280.ts';
import {runReceiptNotesResidual280} from './receipt_notes_residual280_runtime_test.mjs';
// Actual index/OAuth/Native writer. All actors, receipts and mail text are synthetic.
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {sign} from '../src/site-core.ts';
const OWNER='472099715253796864',STAFF='800000000000000301',MEMBER='800000000000000302';
const BASE='https://guild.example',PATH='/api/admin/treasury/ledger/note-redaction',EPOCH='a'.repeat(32);
const KEY='maintenance:treasury-note-redaction280';
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:'800000000000000001',GUILD_ID:'800000000000000001',
 DISCORD_APP_ID:'800000000000000002',DISCORD_CLIENT_SECRET:'verification280-client',DISCORD_BOT_TOKEN:'verification280-bot',
 VERIFY_SECRET:'verification280-secret',COOKIE_SECRET:'verification280-cookie',SITE_ADMINS:OWNER+','+STAFF,
 PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',
 ROLE_GUILD_MEMBER:'800000000000000010',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',
 CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'receipt-notes280-fixture',timestamp:'2026-11-12T00:00:00Z'},
 ASSETS:{async fetch(){return new Response('fixture static asset');}}};
function cookieOf(response,name){for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0];if(first.startsWith(name+'='))return first;}return null;}
async function setup(db,layout){
 const catalogue=layout==='recorded-live-pre-seal-20261017'?JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile:JSON.parse(ADMISSION_EXPECTED_JSON);
 const statements=[...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql));statements.push(db.prepare(catalogue.slotSQL));
 let installed=0;
 while(statements.length){const chunk=statements.splice(0,40);try{await db.batch(chunk);}catch(error){throw Error('fixture schema batch starting'+installed+': '+String(error));}installed+=chunk.length;}
 try{
 await db.batch([db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,?1,?2,'serving',0,'','',0,0)").bind(ADMISSION_PROTOCOL,EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',CAST(strftime('%s','now') AS INTEGER))")]);
 }catch(error){throw Error('fixture control seeds: '+String(error));}
 const triggers=catalogue.triggers.map(x=>db.prepare(x.sql));installed=0;
 while(triggers.length){const chunk=triggers.splice(0,40);try{await db.batch(chunk);}catch(error){throw Error('fixture trigger batch starting'+installed+': '+String(error));}installed+=chunk.length;}
}
async function run(_request,bindings){
 if(new URL(_request.url).searchParams.has('scenario'))return runReceiptNotesResidual280(_request,bindings,{worker,setup,config,cookieOf,createPrivacyWriteAdmissionDatabase,receiptNoteMaintenance280});
 const layout=new URL(_request.url).searchParams.get('layout')==='recorded-live-pre-seal-20261017'?'recorded-live-pre-seal-20261017':'canonical';
 await setup(bindings.DB,layout);
 const raw=bindings.DB,env={...config,PRIVACY_WRITE_ADMISSION_LAYOUT:layout,DB:raw},writer=createPrivacyWriteAdmissionDatabase(raw,'writer',layout,EPOCH),cases=[];
 const check=(name,pass,observed)=>{cases.push({name,pass:!!pass,observed});if(!pass)throw Error('failed: '+name);};
 const call=async(action,{cookie,headers={},extra={},method='POST'}={})=>{
  const h=new Headers({Origin:BASE,'X-Olympus':'2','Content-Type':'application/json',...headers});if(cookie)h.set('Cookie',cookie);
  return worker.fetch(new Request(BASE+PATH,{method,headers:h,...(method==='GET'?{}:{body:JSON.stringify({action,...extra})})}),env,{waitUntil(){throw Error('maintenance must not defer');}});
 };
 const login=async id=>{
  const start=await worker.fetch(new Request(BASE+'/auth/login'),env,{waitUntil(){}});
  const state=new URL(start.headers.get('Location')).searchParams.get('state');
  const result=await worker.fetch(new Request(BASE+'/auth/callback?code=code-'+id+'&state='+encodeURIComponent(state),{headers:{Cookie:cookieOf(start,'__Host-olg_state')}}),env,{waitUntil(){}});
  if(result.status!==303)throw Error('OAuth failed '+result.status+' '+await result.text());return cookieOf(result,'__Host-olg');
 };
 const owner=await login(OWNER),staff=await login(STAFF),member=await login(MEMBER);
 const rows=()=>raw.prepare("SELECT * FROM audit WHERE action IN('treasury.receipt242','unrelated.fixture') ORDER BY id").all().then(x=>x.results);
 const at=Math.floor(Date.now()/1000),seed=[];
 for(const [source,n]of [['whisper-declaration',39],['mail',19]])for(let i=0;i<n;i++){
  const note=source==='mail'&&i>=4?'':i%3===0?'é😀 \\ slash / quote "\nline':'SYNTHETIC PRIVATE NOTE '+i;
  const d={version:242,sourceId:source+'-'+i,source,character:'Synthétique Name',characterKey:'synthétique name',guid:'Player-1-ABCDEF00',
   copper:i,items:[{name:'Synthetic item',count:1,itemId:'111'}],note,evidence:{kind:'synthetic',confirmedLocal:false,automaticCredit:false},
   observedAt:at-100,classification:'unclassified_receipt',retainUntil:at+10000,payloadHash:'ORIGINAL-'+source+'-'+i};
  seed.push(writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242',?2,?3)").bind(at,'intake242:'+d.sourceId,JSON.stringify(d)));
 }
 seed.push(writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'system','unrelated.fixture',NULL,?2)").bind(at,JSON.stringify({note:'UNRELATED NOTE',value:1})));
 await writer.batch(seed);
 const before=await rows();
 check('fixture has58 receipts and43 covered nonempty notes',before.filter(x=>x.action==='treasury.receipt242').length===58&&before.filter(x=>x.action==='treasury.receipt242'&&JSON.parse(x.details).note!=='').length===43);
 let directHeld=false;try{await raw.prepare("UPDATE audit SET details=json_set(details,'$.note','') WHERE action='treasury.receipt242'").run();}catch{directHeld=true;}
 check('raw UPDATE is refused by the actual Native trigger',directHeld&&JSON.stringify(await rows())===JSON.stringify(before));
 for(const[label,options]of [['anonymous',{}],['ordinary member',{cookie:member}],['other staff',{cookie:staff}],['foreign Origin',{cookie:owner,headers:{Origin:'https://other.invalid'}}],['stale page',{cookie:owner,headers:{'X-Olympus':'1'}}]]){
  const response=await call('preview',options);
  check(label+' cannot obtain or apply this owner maintenance',response.status!==200&&JSON.stringify(await rows())===JSON.stringify(before),{status:response.status});
 }
 const previewResponse=await call('preview',{cookie:owner}),preview=await previewResponse.json();
 if(previewResponse.status!==200)console.log('NOTES_PREVIEW_REFUSED',JSON.stringify({status:previewResponse.status,error:preview.error,nextAction:preview.nextAction,unclassifiedReceiptRows:preview.unclassifiedReceiptRows}));
 check('actual owner gets a counts-only preview',previewResponse.status===200&&preview.state==='preview'&&preview.notesToBlank===43
  &&preview.receiptRows===58&&!JSON.stringify(preview).includes('SYNTHETIC PRIVATE NOTE')&&!JSON.stringify(preview).includes('Synthétique'));
 const savedMax=preview.ceiling;
 const blankBefore=JSON.stringify(await rows());
 for(const[label,extra]of [['missing confirm',{review:preview.review}],['tampered token',{review:preview.review+'x',confirm:'BLANK RECEIPT NOTES'}],['unknown body field',{review:preview.review,confirm:'BLANK RECEIPT NOTES',sql:'UPDATE audit'}]]){
  const response=await call('apply',{cookie:owner,extra});
  check(label+' holds without changing any receipt',response.status!==200&&JSON.stringify(await rows())===blankBefore,{status:response.status});
 }
 const unknown=JSON.stringify({source:'addon-bridge242',note:'SYNTHETIC UNCLASSIFIED TEXT',payloadHash:'original'});
 await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','intake242:unknown',?2)").bind(at,unknown).run();
 const uncertain=JSON.stringify(await rows()),unknownAttempt=await call('apply',{cookie:owner,extra:{review:preview.review,confirm:'BLANK RECEIPT NOTES'}});
 check('new text-bearing unclassified source holds the whole apply',unknownAttempt.status===409&&JSON.stringify(await rows())===uncertain);
 await writer.prepare("DELETE FROM audit WHERE subject='intake242:unknown'").run();
 for(const [label,note]of [['unpaired high surrogate','\ud800'],['unpaired low surrogate','\udc00']]){
  await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','intake242:unicode',?2)")
   .bind(at,JSON.stringify({source:'mail',note,payloadHash:'original-unicode'})).run();
  const image=JSON.stringify(await rows()),held=await call('preview',{cookie:owner}),value=await held.json();
  check(label+' is classified before an apply without returning its note',held.status===409&&value.error==='receipt_note_cleanup_held'&&JSON.stringify(await rows())===image&&!Object.hasOwn(value,'note'),{status:held.status});
  await writer.prepare("DELETE FROM audit WHERE subject='intake242:unicode'").run();
 }
 // Its hex spelling contains an odd-nibble EDA8... substring, although the
 // decoded UTF-8 is valid. Encoding classification must operate on bytes.
 await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','intake242:valid-unicode',?2)")
  .bind(at,JSON.stringify({source:'mail',note:'>\u0688a',payloadHash:'original-valid-unicode'})).run();
 const validUnicodeImage=JSON.stringify(await rows()),validUnicodePreview=await call('preview',{cookie:owner});
 check('valid Unicode with odd-nibble surrogate-like hex stays reviewable',validUnicodePreview.status===200&&JSON.stringify(await rows())===validUnicodeImage);
 await writer.prepare("DELETE FROM audit WHERE subject='intake242:valid-unicode'").run();
 for(const[label,details]of [
  ['malformed JSON','not-json'],['duplicate note','{"source":"mail","note":"A","note":"B"}'],
  ['missing source','{"note":"SYNTHETIC TEXT"}'],['nontext note','{"source":"mail","note":17}'],
  ['oversized structured row',JSON.stringify({source:'mail',note:'SYNTHETIC',other:'x'.repeat(70000)})],
 ]){
  await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','intake242:shape',?2)").bind(at,details).run();
  const image=JSON.stringify(await rows()),held=await call('apply',{cookie:owner,extra:{review:preview.review,confirm:'BLANK RECEIPT NOTES'}});
  check(label+' holds without reading note into the response or changing rows',held.status===409&&JSON.stringify(await rows())===image&&!((await held.text()).includes('SYNTHETIC TEXT')));
  await writer.prepare("DELETE FROM audit WHERE subject='intake242:shape'").run();
 }
 const reviewed=JSON.parse(preview.review.slice(0,preview.review.lastIndexOf('.')));
 for(const[label,patch]of [['expired review',{created:at-1000,expires:at-100}],['other generation',{generation:'f'.repeat(32)}],
  ['other account birth',{birth:'f'.repeat(32)}],['old epoch',{epoch:'f'.repeat(32)}],['other actor',{actor:STAFF}]]){
  const data=JSON.stringify({...reviewed,...patch}),review=data+'.'+await sign(config.COOKIE_SECRET,'treasury-note-redaction280-v1',data);
  const image=JSON.stringify(await rows()),held=await call('apply',{cookie:owner,extra:{review,confirm:'BLANK RECEIPT NOTES'}});
  check(label+' cannot authorize a mutation',held.status===409&&JSON.stringify(await rows())===image);
 }
 // The aggregate bound is checked inside SQLite before a large manifest crosses the FFI.
 for(let i=0;i<3;i++)await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242',?2,?3)")
  .bind(at,'intake242:wide'+i,JSON.stringify({source:'mail',note:'SYNTHETIC',other:'x'.repeat(60000)})).run();
 const wide=JSON.stringify(await rows()),wideResponse=await call('apply',{cookie:owner,extra:{review:preview.review,confirm:'BLANK RECEIPT NOTES'}});
 check('aggregate manifest bound holds with no write',wideResponse.status===409&&JSON.stringify(await rows())===wide);
 await writer.prepare("DELETE FROM audit WHERE subject LIKE 'intake242:wide%'").run();
 await raw.prepare('CREATE INDEX receipt_notes280_unknown_fixture ON audit(ts)').run();
 const schemaImage=JSON.stringify(await rows()),schemaHeld=await call('apply',{cookie:owner,extra:{review:preview.review,confirm:'BLANK RECEIPT NOTES'}});
 check('Native catalogue drift refuses the operation without business mutation',schemaHeld.status!==200&&JSON.stringify(await rows())===schemaImage);
 await raw.prepare('DROP INDEX receipt_notes280_unknown_fixture').run();
 // Natural retention can remove a covered row. Historical43/58 is no equality gate.
 await writer.prepare("DELETE FROM audit WHERE subject='intake242:whisper-declaration-0'").run();
 // A newer in-scope mail is covered by the fresh server-owned apply ceiling.
 const latest=JSON.stringify({source:'mail',note:'FRESH SYNTHETIC MAIL SUBJECT',payloadHash:'fresh-original',observedAt:at,retainUntil:at+10000,character:'Fresh Synthetic',items:[],copper:10});
 await writer.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','intake242:fresh',?2)").bind(at,latest).run();
 const actualBefore=await rows(),applyResponse=await call('apply',{cookie:owner,extra:{review:preview.review,confirm:'BLANK RECEIPT NOTES'}}),answer=await applyResponse.json();
 check('actual admitted apply succeeds with fresh census',applyResponse.status===200&&answer.state==='recorded'&&answer.completion.blanked===43&&answer.completion.ceiling>savedMax,{status:applyResponse.status,answer});
 const after=await rows();
 check('all rows and non-details columns remain identical',after.length===actualBefore.length&&after.every((row,i)=>Object.keys(row).filter(k=>k!=='details').every(k=>row[k]===actualBefore[i][k])));
 for(let i=0;i<after.length;i++){
  const old=actualBefore[i],next=after[i];
  if(old.action!=='treasury.receipt242'){check('nonscope row remains byte-identical',JSON.stringify(old)===JSON.stringify(next));continue;}
  const oldValue=JSON.parse(old.details),newValue=JSON.parse(next.details),expected={...oldValue,note:''};
  check('row'+old.id+' changes only exact note literal; original hash/deadline/items preserved',next.details===JSON.stringify(expected)&&newValue.payloadHash===oldValue.payloadHash
   &&newValue.retainUntil===oldValue.retainUntil);
 }
 check('status reports zero covered notes and no unclassified rows',answer.remainingCoveredNotes===0&&answer.unclassifiedReceiptRows===0);
 const audit=await raw.prepare("SELECT details FROM audit WHERE action='treasury.receipt_note_redaction280'").all();
 check('one counts-only completion audit contains no note/identity data',audit.results.length===1&&Object.keys(JSON.parse(audit.results[0].details)).sort().join(',')==='blanked,ceiling');
 const immutable=JSON.stringify(await rows()),repeat=await call('apply',{cookie:owner,extra:{review:preview.review,confirm:'BLANK RECEIPT NOTES'}});
 check('repeated original apply is read-only status, not another write',repeat.status===200&&JSON.stringify(await rows())===immutable
  &&(await raw.prepare("SELECT COUNT(*) n FROM audit WHERE action='treasury.receipt_note_redaction280'").first()).n===1);
 const expiredData=JSON.stringify({...reviewed,created:at-1000,expires:at-100}),expiredReview=expiredData+'.'+await sign(config.COOKIE_SECRET,'treasury-note-redaction280-v1',expiredData);
 const expiredReply=await call('apply',{cookie:owner,extra:{review:expiredReview,confirm:'BLANK RECEIPT NOTES'}}),expiredBody=await expiredReply.json();
 check('expired review after completion returns recorded status without another write',expiredReply.status===200&&expiredBody.state==='recorded'&&JSON.stringify(await rows())===immutable);
 const st=await call('status',{cookie:owner});
 check('lost-reply recovery can use status without repeating apply',st.status===200&&(await st.json()).state==='recorded');
 const marker=(await raw.prepare('SELECT value FROM site_settings WHERE key=?1').bind(KEY).first()).value;
 check('Native writer closes normally and keeps the exact original epoch',
  (await raw.prepare("SELECT COUNT(*) n FROM privacy_write_admission WHERE active=0 AND nonce='' AND purpose='' AND epoch=?1").bind(EPOCH).first()).n===1&&JSON.parse(marker).blanked===43);
 return Response.json({schema:'receipt-notes280-genuine-workerd-v1',actualLocalWorkerdD1:true,actualIndexOAuth:true,layout,ok:cases.every(x=>x.pass),checks:cases.length,cases,
  scope:'Synthetic receipts and Discord only; real Native wrapper/trigger/transaction. No production data, local journals or provider effects.'});
}
export default {async fetch(request,bindings){
 try{return await run(request,bindings);}catch(error){
  return Response.json({fixtureError:String(error?.stack??error),cause:String(error?.cause?.message??'')},{status:500});
 }
}};
