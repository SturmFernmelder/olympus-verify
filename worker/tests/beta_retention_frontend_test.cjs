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
  discovery:{currentPassScanned:0,completedPasses:0},removals:{pending:0,held:0,unknown:0,settledOperations:0,unresolvedGrantCustody:0,unresolvedOtherRoleCustody:0},form:null,
  retention:{cutoff,confirmed:false,confirmedCutoff:null,evidence:'absent',canConfirm:true,removalCompletion:false},retentionForm:{expiresAt:pageNow+240,formNonce:'a'.repeat(32),token:'A'.repeat(43)}});
 const success=()=>({ok:true,cutoff,confirmedAt:pageNow,removalCompletion:false}),clone=v=>JSON.parse(JSON.stringify(v));
 const originalSettings=()=>JSON.stringify(db.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key IN('betaRetentionAnchorV1','betaResetPolicyV1','appointed','leadership') ORDER BY key").all());
 const saved=originalSettings();
 async function fixture({mutate=()=>{},reply,clock=pageNow}={}){
  const preview=snapshot();mutate(preview);const page=await openPage(STAFF,{}, {clockNow:clock*1000}),requests=[];
  page.before((pathname,init)=>{if(pathname.startsWith(endpoint))requests.push({pathname,method:init.method||'GET',body:init.body});return false;});
  page.answer((pathname,init)=>pathname===endpoint?clone(preview):pathname===endpoint+'/confirm-cutoff'&&init.method==='POST'&&reply!==undefined?clone(reply):null);
  await page.go('#/admin/settings');if(!await waitFor(()=>!!byText(page.app,'h2','Beta member and rank reset'),'retention frame'))throw Error('retention frame absent');
  return {page,preview,requests,button:byText(page.app,'button','Confirm cutoff for retention'),refresh:byText(page.app,'button','Refresh reset status'),posts:()=>requests.filter(r=>r.method==='POST'),reads:()=>requests.filter(r=>r.method==='GET')};
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
 check('frontend transport fixtures preserve anchors, policy, appointments and leadership',originalSettings()===saved);
 console.log('BETA_RETENTION_FRONTEND_SUMMARY '+JSON.stringify({passed:ok,checks:n,realApp:true,minimalDom:true,syntheticTransport:true,providerQualified:false}));console.log(ok+'/'+n+' checks passed');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
`;
new Function('__dirname','require',source.slice(0,source.indexOf(marker))+cases)(__dirname,require);
