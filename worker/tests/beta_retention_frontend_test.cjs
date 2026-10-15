// Actual app.js in the existing minimal DOM/Worker harness; no runtime edits or new stubs.
// The existing answer hook replaces transport responses only after the real Worker handles them.
// Synthetic MACs are UI inputs, never backend authority; beta_retention_anchor_test covers real forms.
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'frontend_check.cjs'),'utf8'),marker='\n(async () => {\n  await siteUser(MEMBER,';
if(source.split(marker).length!==2)throw Error('frontend harness boundary changed');
const cases=String.raw`
(async()=>{
 await siteUser(MEMBER,{global_name:'Synthetic member'});await character(MEMBER,'Synthetic Member','Player-1-0001');await siteUser(OTHER);await siteUser(DENIED,{denied:1});await siteUser(STAFF);
 const endpoint='/api/admin/beta-role-reset',cutoff=1792688400,pageNow=cutoff+60;
 const roles=['1552077551839617104','1558657538960916490','1557496182966587453','1557495772453281853','1557496796949909575','1557496812196208640','1557498239656136764','1557498252994285568','1557498673926242385','1557498969310101576','1557499139099590747','1557499286965719050'];
 const snapshot=()=>({cutoff,epoch:'olympus-beta-2026-10-22',roleIds:[...roles],phase:'inactive',canArm:false,policyArmed:false,removalsActive:false,finalCompletion:false,roleReuseReady:false,
  discovery:{currentPassScanned:0,completedPasses:0},removals:{pending:0,held:0,unknown:0,settledOperations:0,unresolvedGrantCustody:0,unresolvedOtherRoleCustody:0},form:null,policyRetired:false,retiredAt:null,canRetire:false,retireForm:null,
  retention:{cutoff,confirmed:false,confirmedCutoff:null,evidence:'absent',canConfirm:true,removalCompletion:false},retentionForm:{expiresAt:pageNow+240,formNonce:'a'.repeat(32),token:'A'.repeat(43)}});
 const success=()=>({ok:true,cutoff,confirmedAt:pageNow,removalCompletion:false}),clone=v=>JSON.parse(JSON.stringify(v));
 const originalSettings=()=>JSON.stringify(db.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key IN('betaRetentionAnchorV1','betaResetPolicyV1','appointed','leadership') ORDER BY key").all());
 const saved=originalSettings();
 async function fixture({mutate=()=>{},reply,retireReply,clock=pageNow}={}){
  const preview=snapshot();mutate(preview);const page=await openPage(STAFF,{}, {clockNow:clock*1000}),requests=[];
  page.before((pathname,init)=>{if(pathname.startsWith(endpoint))requests.push({pathname,method:init.method||'GET',body:init.body});return false;});
  page.answer((pathname,init)=>pathname===endpoint?clone(preview):pathname===endpoint+'/confirm-cutoff'&&init.method==='POST'&&reply!==undefined?clone(reply):pathname===endpoint+'/retire'&&init.method==='POST'&&retireReply!==undefined?clone(retireReply):null);
  await page.go('#/admin/settings');if(!await waitFor(()=>!!byText(page.app,'h2','Beta member and rank reset'),'retention frame'))throw Error('retention frame absent');
  return {page,preview,requests,button:byText(page.app,'button','Confirm cutoff for retention'),retire:byText(page.app,'button','Retire reset policy'),refresh:byText(page.app,'button','Refresh reset status'),posts:()=>requests.filter(r=>r.method==='POST'),reads:()=>requests.filter(r=>r.method==='GET')};
 }
 const quiet=async()=>{await settle();await settle();};
 async function dialog(f){f.button.click();if(!await waitFor(()=>!!byText(f.page.document.body,'button','Confirm cutoff'),'cutoff confirmation'))throw Error('confirmation absent');return byText(f.page.document.body,'button','Confirm cutoff');}
 for(const [label,mutate,clock] of [
  ['missing retention',s=>{delete s.retention;}],['null retention',s=>{s.retention=null;}],
  ['wrong cutoff',s=>{s.retention.cutoff++;}],['string confirmation flag',s=>{s.retention.confirmed='false';}],['string permission',s=>{s.retention.canConfirm='true';}],
  ['removal completion claim',s=>{s.retention.removalCompletion=true;}],['unknown evidence',s=>{s.retention.evidence='complete';}],['string confirmed cutoff',s=>{s.retention.confirmedCutoff=String(cutoff);}],
  ['confirmation disagrees with date',s=>{s.retention.confirmed=true;}],['held evidence cannot authorize',s=>{s.retention.evidence='held';}],
  ['already anchored cannot authorize',s=>{Object.assign(s.retention,{evidence:'cutoff_anchor',confirmed:true,confirmedCutoff:cutoff});}],
  ['anchor wrong cutoff',s=>{Object.assign(s.retention,{evidence:'cutoff_anchor',confirmed:true,confirmedCutoff:cutoff-1});}],
  ['future legacy date',s=>{Object.assign(s.retention,{evidence:'legacy',confirmed:true,confirmedCutoff:pageNow+1});}],
  ['before cutoff cannot authorize',s=>{s.phase='before_cutoff';s.retentionForm.expiresAt=cutoff+200;},cutoff-1],
  ['missing other removal custody',s=>{delete s.removals.unresolvedOtherRoleCustody;}],
 ]){
  const f=await fixture({mutate,...(clock===undefined?{}:{clock})});if(f.button)f.button.click();await quiet();
  check('retention malformed preview '+label+' has no usable confirmation',(!f.button||f.button.disabled)&&f.posts().length===0&&!f.page.document.body.querySelector('dialog'));
 }
 for(const [label,mutate] of [
  ['missing form',s=>{delete s.retentionForm;}],['extra field',s=>{s.retentionForm.roleIds=roles;}],['expired',s=>{s.retentionForm.expiresAt=pageNow;}],
  ['string expiry',s=>{s.retentionForm.expiresAt=String(pageNow+240);}],['too long',s=>{s.retentionForm.expiresAt=pageNow+301;}],
  ['short nonce',s=>{s.retentionForm.formNonce='a'.repeat(31);}],['array nonce',s=>{s.retentionForm.formNonce=[s.retentionForm.formNonce];}],
  ['noncanonical MAC',s=>{s.retentionForm.token='A'.repeat(42)+'B';}],['array MAC',s=>{s.retentionForm.token=[s.retentionForm.token];}],
  ['not authorized',s=>{s.retention.canConfirm=false;}],
 ]){
  const f=await fixture({mutate});f.button?.click();await quiet();check('retention closed form '+label+' cannot open dialog or POST',!!f.button&&f.button.disabled&&f.posts().length===0&&!f.page.document.body.querySelector('dialog'));
 }
 for(const [label,detach] of [['detached document',f=>f.page.app.remove()],['changed route',f=>f.page.history.replaceState(null,'','#/roles')]]){
  const f=await fixture(),before=f.requests.length;detach(f);f.button.click();f.refresh.click();await quiet();check('retention '+label+' controls remain inert',f.requests.length===before&&!f.page.document.body.querySelector('dialog'));
 }
 {
  const f=await fixture();await dialog(f);const before=f.requests.length;f.button.click();f.refresh.click();await quiet();check('retention dialog suppresses duplicate requests',f.page.document.body.querySelectorAll('dialog').length===1&&f.requests.length===before&&f.button.disabled);
  byText(f.page.document.body.querySelector('dialog'),'button','Cancel').click();await quiet();check('retention cancellation restores current control without POST',!f.page.document.body.querySelector('dialog')&&!f.button.disabled&&f.posts().length===0);
 }
 for(const [label,race] of [['document detached',f=>f.page.app.remove()],['route changed',f=>f.page.history.replaceState(null,'','#/roles')]]){
  const f=await fixture(),accept=await dialog(f),before=f.requests.length;race(f);accept.click();await quiet();check('retention '+label+' during dialog prevents POST and refresh',f.requests.length===before&&f.posts().length===0&&!f.page.document.body.querySelector('dialog'));
 }
 {
  const f=await fixture(),accept=await dialog(f);f.page.clock(f.preview.retentionForm.expiresAt*1000);accept.click();await quiet();check('retention form expiry during dialog prevents POST',f.posts().length===0&&!f.page.document.body.querySelector('dialog'));
  const before=f.reads().length;f.refresh.click();await waitFor(()=>f.reads().length===before+1,'expired retention status refresh');check('retention expired attached dialog leaves status refresh usable',f.reads().length===before+1&&f.posts().length===0);
 }
 for(const [label,reply] of [['empty',{}],['array',[]],['false receipt',{...success(),ok:false}],['wrong cutoff',{...success(),cutoff:cutoff+1}],['before cutoff',{...success(),confirmedAt:cutoff-1}],['future receipt',{...success(),confirmedAt:pageNow+6}],['string timestamp',{...success(),confirmedAt:String(pageNow)}],['false completion claim',{...success(),removalCompletion:true}]]){
  const f=await fixture({reply}),accept=await dialog(f);accept.click();await waitFor(()=>f.reads().length===2&&f.page.document.body.textContent.includes('The cutoff confirmation is unconfirmed'),'unconfirmed retention reply');
  check('retention malformed 200 '+label+' never claims confirmed',f.posts().length===1&&f.reads().length===2&&f.page.document.body.textContent.includes('The cutoff confirmation is unconfirmed')&&!f.page.document.body.querySelector('.toast.good'));
 }
 for(const legacy of [false,true]){
  const f=await fixture({reply:success(),mutate:s=>{if(legacy)Object.assign(s.retention,{evidence:'legacy',confirmed:true,confirmedCutoff:cutoff});}}),accept=await dialog(f);accept.click();await waitFor(()=>f.reads().length===2&&!!f.page.document.body.querySelector('.toast.good'),'valid retention reply');
  check('retention '+(legacy?'matching legacy':'absent evidence')+' sends captured form once and rereads',f.posts().length===1&&f.reads().length===2&&f.posts()[0].pathname===endpoint+'/confirm-cutoff'&&JSON.stringify(JSON.parse(f.posts()[0].body))===JSON.stringify({form:f.preview.retentionForm}));
  check('retention success explicitly separates role completion',f.page.document.body.textContent.includes('Cutoff recorded for retention. Role removal status is separate.')&&!f.page.document.body.textContent.includes('Reset policy armed.'));
 }
 const retirement=s=>Object.assign(s,{policyArmed:true,canRetire:true,retireForm:{expiresAt:pageNow+240,formNonce:'b'.repeat(32),token:'A'.repeat(43)}});
 {
  const f=await fixture({mutate:s=>{Object.assign(s,{phase:'held',inventoryKnown:false});Object.assign(s.discovery,{currentPassScanned:null,completedPasses:null});Object.assign(s.removals,{pending:null,held:null,unknown:null,settledOperations:null,unresolvedGrantCustody:2,unresolvedOtherRoleCustody:3});}});
  check('unavailable policy inventory renders a truthful held preview',f.page.app.textContent.includes('Reset progress is unavailable')&&f.page.app.textContent.includes('unavailable counts do not mean there is no unresolved work')&&f.retire.disabled&&byText(f.page.app,'button','Arm member and rank reset').disabled);
  f.retire.click();f.refresh.click();await waitFor(()=>f.reads().length===2,'held status refresh');check('unavailable inventory allows refresh but no mutation',f.reads().length===2&&f.posts().length===0);
 }
 const retiredReply=()=>({ok:true,cutoff,policyRetired:true,retiredAt:pageNow,phase:'retired_awaiting_drain',finalCompletion:false,roleReuseReady:false});
 {
  const f=await fixture({mutate:s=>{Object.assign(s,{phase:'retired_awaiting_drain',policyRetired:true,retiredAt:pageNow,inventoryKnown:true,discoveryKnown:false});Object.assign(s.discovery,{currentPassScanned:null,completedPasses:null});s.removals.unknown=2;}});
  check('retired malformed scan displays unavailable discovery and retained known debt',f.page.app.textContent.includes('Unavailable; retained scan needs review')&&f.page.app.textContent.includes('2 unresolved')&&!f.page.app.textContent.includes('0 complete passes')&&f.retire.disabled);
 }
 async function retireDialog(f){f.retire.click();if(!await waitFor(()=>!!byText(f.page.document.body,'button','Retire policy'),'retire confirmation'))throw Error('retirement confirmation absent');const d=f.page.document.body.querySelector('dialog'),accept=byText(d,'button','Retire policy'),input=d.querySelector('input');check('retirement requires typed confirmation before POST',accept.disabled&&f.posts().length===0);input.value='RETIRE';fire(input,'input');return accept;}
 for(const [label,mutate,clock] of [['no authority',s=>{s.canRetire=false;}],['missing form',s=>{s.retireForm=null;}],['extra form field',s=>{s.retireForm.extra=true;}],['expired',s=>{s.retireForm.expiresAt=pageNow;}],['noncanonical MAC',s=>{s.retireForm.token='A'.repeat(42)+'B';}],['reuse claim',s=>{s.roleReuseReady=true;}],['already retired',s=>{s.policyRetired=true;}],['before cutoff',()=>{},cutoff-1]]){
  const f=await fixture({mutate:s=>{retirement(s);mutate(s);},...(clock===undefined?{}:{clock})});f.retire.click();await quiet();check('retirement malformed preview '+label+' cannot act',f.retire.disabled&&f.posts().length===0&&!f.page.document.body.querySelector('dialog'));
 }
 {
  const f=await fixture({mutate:retirement});await retireDialog(f);f.retire.click();f.refresh.click();await quiet();check('retirement dialog blocks duplicate work',f.page.document.body.querySelectorAll('dialog').length===1&&f.posts().length===0&&f.reads().length===1);
  byText(f.page.document.body.querySelector('dialog'),'button','Cancel').click();await quiet();check('retirement cancellation restores control',!f.retire.disabled&&f.posts().length===0);
 }
 for(const [label,race] of [['expiry',f=>f.page.clock(f.preview.retireForm.expiresAt*1000)],['detached',f=>f.page.app.remove()],['route',f=>f.page.history.replaceState(null,'','#/roles')]]){
  const f=await fixture({mutate:retirement}),accept=await retireDialog(f);race(f);accept.click();await quiet();check('retirement '+label+' during confirmation prevents POST',f.posts().length===0);
 }
 for(const [label,reply] of [['reuse claim',{...retiredReply(),roleReuseReady:true}],['drain claim',{...retiredReply(),finalCompletion:true}],['future time',{...retiredReply(),retiredAt:pageNow+6}],['missing result',{}]]){
  const f=await fixture({mutate:retirement,retireReply:reply}),accept=await retireDialog(f);accept.click();await waitFor(()=>f.reads().length===2&&f.page.document.body.textContent.includes('The retirement outcome is unconfirmed'),'unconfirmed retirement');check('retirement '+label+' response never claims success',f.posts().length===1&&f.reads().length===2&&!f.page.document.body.querySelector('.toast.good'));
 }
 {
  const f=await fixture({mutate:retirement,retireReply:retiredReply()}),accept=await retireDialog(f);accept.click();await waitFor(()=>f.reads().length===2&&!!f.page.document.body.querySelector('.toast.good'),'retirement receipt');
  check('retirement sends captured form and typed confirmation once',f.posts().length===1&&f.posts()[0].pathname===endpoint+'/retire'&&JSON.stringify(JSON.parse(f.posts()[0].body))===JSON.stringify({confirm:'RETIRE',form:f.preview.retireForm}));
  check('retirement success preserves unresolved-work and reuse warning',f.page.document.body.textContent.includes('Unresolved work remains; role reuse is still held.'));
 }
 check('frontend transport fixtures preserve anchors, policy, appointments and leadership',originalSettings()===saved);
 console.log('BETA_RETENTION_FRONTEND_SUMMARY '+JSON.stringify({passed:ok,checks:n,realApp:true,minimalDom:true,syntheticTransport:true,providerQualified:false}));console.log(ok+'/'+n+' checks passed');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
`;
new Function('__dirname','require',source.slice(0,source.indexOf(marker))+cases)(__dirname,require);
