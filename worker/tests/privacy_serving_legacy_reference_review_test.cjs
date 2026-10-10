/** Independent regression: actual serving source/schema + central role receipts + native SQLite.
 * Reuses the canonical integration setup; the canonical test main is never executed here.
 * No source mutation, network, provider token, real account, or ordinary session fabrication.
 */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs');
const source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const fixtures=[
  ['non-array object',{references:{kind:'discord',key:ID,label:'Target'}}],
  ['non-array string',{references:ID}],
  ['null plus target text',{references:null,text:ID}],
  ['number plus target text',{references:7,text:ID}],
  ['boolean plus target text',{references:false,text:ID}],
  ['array duplicate key','{"references":[{"kind":"discord","key":"'+ID+'","key":"'+OTHER+'"}]}'],
  ['array duplicate kind','{"references":[{"kind":"discord","kind":"name","key":"'+ID+'"}]}'],
  ['array target primitive',{references:[null,ID,3]}],
  ['array nested target',{references:[{kind:'discord',key:{account:ID}}]}],
  ['array valid plus target free text',{references:[{kind:'discord',key:ID}],text:'Account '+ID}],
  ['array empty plus target free text',{references:[],text:'Account '+ID}],
  ['duplicate root references','{"references":[],"references":[{"kind":"discord","key":"'+ID+'"}]}'],
  ['invalid JSON','broken '+ID],
 ];
 function application(owner,answers,t){db.prepare("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at)VALUES(?,?,?,'submitted',?,?)").run(owner,'member',typeof answers==='string'?answers:JSON.stringify(answers),t,t);}
 for(const[label,answers]of fixtures){
  const t=reset();application(OTHER,answers,t);
  // Seed an owned registry row too, so a late ambiguity guard must roll back opaque family deletion.
  db.prepare('INSERT INTO community_refs(discord_id,ref,created_at)VALUES(?,?,?)').run(ID,'q'.repeat(22),t);
  const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof),before=snapshot();
  const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);
  check(label+' refuses terminal completion',out.state!=='complete'&&!out.servingAccountErased);
  check(label+' rolls every native business/control table back',snapshot()===before);
  check(label+' preserves other owner document and no terminal/replay claim',raw('SELECT answers FROM site_applications WHERE discord_id=?',OTHER)?.answers===(typeof answers==='string'?answers:JSON.stringify(answers))&&raw('SELECT state FROM privacy_serving_jobs').state==='waiting_role'&&!raw('SELECT * FROM privacy_restore_replay'));
 }
 for(const lost of[false,true]){
  const t=reset();application(OTHER,{references:[null,7,{kind:'discord',key:ID,label:'Target'},{kind:'discord',key:OTHER,label:'Other'}],text:'Other owner text'},t);
  const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof);hooks.loseResponse=lost;
  const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql),answers=JSON.parse(raw('SELECT answers FROM site_applications WHERE discord_id=?',OTHER).answers);
  check('valid structured reference '+(lost?'lost committed response':'native success')+' confirms durable terminal+replay',out.state==='complete'&&out.servingAccountErased&&raw('SELECT state FROM privacy_serving_jobs').state==='complete'&&!!raw('SELECT * FROM privacy_restore_replay'));
  check('valid cleanup preserves primitives/other reference/other text',JSON.stringify(answers.references)===JSON.stringify([null,7,{kind:'discord',key:OTHER,label:'Other'}])&&answers.text==='Other owner text');
 }
 for(const phase of['before','middle','ambiguity_guard','terminal']){
  const t=reset();application(OTHER,{references:[{kind:'discord',key:ID},{kind:'discord',key:OTHER}]},t);
  const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof),before=snapshot();
  hooks.beforeStatement=sql=>{if(phase==='before'&&sql.includes('privacy_completion_refused')||phase==='middle'&&sql.startsWith('DELETE FROM community_refs')||phase==='ambiguity_guard'&&sql.includes('privacy_ambiguous_reference_held')||phase==='terminal'&&sql.includes('privacy_terminal_unconfirmed'))throw Error('independent native '+phase+' fault');};
  const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);
  check('native '+phase+' fault never claims completion',out.state!=='complete'&&!out.servingAccountErased);
  check('native '+phase+' fault rolls structured removal and all family/control effects back',snapshot()===before);
 }
 // Target's own arbitrary document is owned data and may disappear without blocking another owner.
 {const t=reset();application(ID,{references:{key:ID},text:ID},t);const proof=await admission(),out=await eraser.continueServingErasure(env(),proof);check('own malformed document is removed by owned-row erasure without false ambiguity hold',out.state==='complete'&&!raw('SELECT * FROM site_applications'));}
 // The consuming guard observes a document changed after role settlement, never an earlier projection.
 {const t=reset();application(OTHER,{references:[{kind:'discord',key:ID}]},t);const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof);
 db.prepare('UPDATE site_applications SET answers=? WHERE discord_id=?').run(JSON.stringify({references:[{kind:'discord',key:ID}],text:ID}),OTHER);const before=snapshot();
 const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);check('late other-owner text is consumed by native guard and atomically held',out.state!=='complete'&&snapshot()===before);}
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent legacy-reference serving checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
