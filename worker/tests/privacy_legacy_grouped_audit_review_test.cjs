/** Native existing legacy roster.identity_held typed names projection; no inferred arbitrary text ownership. */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 function setup(){const t=reset();db.prepare('INSERT INTO members(discord_id,banned)VALUES(?,0)').run(ID);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source)VALUES(?,?,?,'verified',?,'fixture')").run('probe name','Probe Name',ID,t-10);return t;}
 function insert(t,details,over={}){return Number(db.prepare('INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,?,?)').run(over.ts??t,over.actor??'system',over.action??'roster.identity_held',over.subject??null,typeof details==='string'?details:JSON.stringify(details)).lastInsertRowid);}
 async function proofAndReceipt(){const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof);return{proof,receipt};}
 async function complete(){const{proof,receipt}=await proofAndReceipt();return eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);}
 for(const[names,expected]of[[['Probe Name'],[]],[['Other Name','Probe Name'],['Other Name']],[['Probe Name','Probe Name','Other Name'],['Other Name']],[['probe name','Other Name'],['Other Name']]]){
  const t=setup(),id=insert(t,{count:names.length,stale:1,cap:5,names}),preserved=[];
  preserved.push(insert(t,{count:1,stale:1,cap:5,names:['Probe Name']},{ts:t-11}));
  preserved.push(insert(t,{count:1,stale:1,cap:5,names:['Other Name']}));
  preserved.push(insert(t,{count:1,stale:1,cap:5,names:['Probe Name']},{actor:'watcher'}));
  preserved.push(insert(t,{detail:'An arbitrary text mention of Probe Name',names:['Probe Name']},{action:'guild.full'}));
  preserved.push(insert(t,{count:1,stale:1,cap:5,names:['Prefix Probe Name']}));
  const before=JSON.stringify(preserved.map(id=>raw('SELECT * FROM audit WHERE id=?',id))),out=await complete(),after=raw('SELECT * FROM audit WHERE id=?',id),details=after&&JSON.parse(after.details);
  check('valid grouped names '+JSON.stringify(names)+' genuine serving completion',out.state==='complete'&&!raw('SELECT * FROM site_users WHERE discord_id=?',ID));
  check('valid grouped names '+JSON.stringify(names)+' removes only proven original current name/key',!!details&&JSON.stringify(details.names)===JSON.stringify(expected));
  check('valid grouped names '+JSON.stringify(names)+' preserves counters/original timestamp/actor/action',details?.count===names.length&&details.stale===1&&details.cap===5&&after.ts===t&&after.actor==='system'&&after.action==='roster.identity_held'&&after.subject===null);
  check('valid grouped projection preserves prior-owner/other names/other actor/unknown action/arbitrary text exactly',JSON.stringify(preserved.map(id=>raw('SELECT * FROM audit WHERE id=?',id)))===before);
 }
 const malformed=[
  '{"count":1,"stale":1,"cap":5,"names":"Probe Name"}',
  '{"count":1,"stale":1,"cap":5,"names":{"name":"Probe Name"}}',
  '{"count":2,"stale":1,"cap":5,"names":["Probe Name",null]}',
  '{"count":2,"stale":1,"cap":5,"names":["Probe Name",{"name":"Other Name"}]}',
  '{"count":1,"stale":1,"cap":5,"names":["Probe Name"],"names":["Other Name"]}',
  '{"count":1,"stale":1,"cap":5,"names":["Other Name"],"names":["Probe Name"]}',
  '{"names":["Probe Name"]',
 ];
 for(const details of malformed){const t=setup();insert(t,details);const{proof,receipt}=await proofAndReceipt(),before=snapshot(),out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);
  check('malformed explicit grouped legacy reference honestly holds original serving completion '+details,out.state!=='complete'&&!out.servingAccountErased);
  check('malformed explicit grouped legacy reference rolls all native family/control changes back',snapshot()===before&&!!raw('SELECT * FROM site_users WHERE discord_id=?',ID));
 }
 {const t=setup(),id=insert(t,{count:2,stale:1,cap:5,names:['Probe Name','Other Name']}),{proof,receipt}=await proofAndReceipt(),before=snapshot();hooks.beforeStatement=sql=>{if(sql.startsWith('UPDATE audit'))throw Error('independent grouped audit projection failure');};const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);hooks.beforeStatement=null;
  check('grouped audit UPDATE failure keeps all families and exact original grouped row via native rollback',out.state!=='complete'&&snapshot()===before&&JSON.parse(raw('SELECT * FROM audit WHERE id=?',id).details).names.length===2);
 }
 {const t=setup(),id=insert(t,{count:2,stale:1,cap:5,names:['Probe Name','Other Name']}),{proof,receipt}=await proofAndReceipt();hooks.loseResponse=true;const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);hooks.loseResponse=false;
  check('lost committed grouped projection recovers genuine terminal proof without duplicate work',out.state==='complete'&&JSON.stringify(JSON.parse(raw('SELECT * FROM audit WHERE id=?',id).details).names)==='["Other Name"]'&&raw('SELECT state FROM privacy_subjects WHERE subject_id=?',ID)?.state==='retired');
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent legacy grouped-audit checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
