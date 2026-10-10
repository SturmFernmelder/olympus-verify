/** Independent native production receipt/ledger closure checks. HTTP is the canonical fake only.
 * A known committed result survives a refused later read; a lost primary result remains unknown.
 */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const index=load('index').default,policy=load('community-contribution-policy');
 let generation=0;
 function setup(){const t=reset(),staff=String(BigInt(OTHER)+1000n+BigInt(generation++));
  db.prepare('UPDATE site_users SET in_server=1,denied=0 WHERE discord_id=?').run(ID);
  db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,session_version,in_server,denied)VALUES(?,?,?,?,7,1,0)').run(staff,'Native staff',t,t);
  const e={...env(),PUBLIC_BASE_URL:'https://verify.example',SITE_ADMINS:staff,COMMUNITY_FEATURES:'contributions,restrictions',CONTRIBUTIONS_MODE:'ledger',CONTRIBUTIONS_RETENTION_DAYS:'400',CHANNEL_NOTICES:''};
  return{t,staff,e};
 }
 async function action(e,staff,body){const cookie=(await core.sessionCookie(e,staff,7)).split(';')[0];
  const request=new Request('https://guild.example/api/admin/community/contributions',{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let response,error;try{response=await index.fetch(request,e,{waitUntil(){}});}catch(e){error=e;}
  return{response,error,body:response?await response.json().catch(()=>null):null};
 }
 const receipt=t=>({action:'receipt',source:'mail',sourceId:'native-review-receipt',payerName:'Private payer',amountCopper:15000,observedAt:new Date(t*1000).toISOString(),matchedDiscordId:ID,status:'matched'});
 function observed(e,sqlPattern,after){let fired=0,mutations=0;const base=e.DB;
  const DB=new Proxy(base,{get(target,key,receiver){if(key==='batch')return async stmts=>{const primary=stmts.some(s=>sqlPattern.test(s._sql));if(primary)mutations++;const out=await base.batch(stmts);if(primary&&!fired){fired++;await after();}return out;};const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;}});
  return{e:{...e,DB},fired:()=>fired,mutations:()=>mutations};
 }
 for(const mode of['session revoked','standing denied','new generation']){
  const{t,staff,e}=setup();const watch=observed(e,/INSERT INTO community_contribution_receipts/,async()=>{
   if(mode==='session revoked')db.prepare('UPDATE site_users SET session_version=8 WHERE discord_id=?').run(staff);
   else if(mode==='standing denied')db.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?').run(staff);
   else db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',0,?,?)").run(staff,'a'.repeat(32),t,t);
  });
  const r=await action(watch.e,staff,receipt(t)),saved=raw("SELECT * FROM community_contribution_receipts WHERE source_id='native-review-receipt'");
  if(r.response?.status!==200)console.log('receipt fixture diagnostic',mode,r.response?.status,r.body,r.error?.stack);
  check('receipt '+mode+' hook runs after one genuine native insertion',watch.fired()===1&&watch.mutations()===1&&saved?.amount_copper===15000&&saved.matched_discord_id===ID);
  check('receipt '+mode+' preserves only a known durable acknowledgment',!r.error&&r.response?.status===200&&r.body?.ok===true&&r.body.result.id===saved?.id&&r.body.result.created===true);
  check('receipt '+mode+' refuses the fresh ledger read',r.body?.ledger===null&&r.body.withheld==='reader_refused');
  check('receipt '+mode+' response has no payer/source/amount/foreign identities',!!r.body?.result&&!JSON.stringify(r.body).includes('Private payer')&&!JSON.stringify(r.body).includes('native-review-receipt')&&!JSON.stringify(r.body).includes(ID)&&!JSON.stringify(r.body).includes('15000')&&Object.keys(r.body.result).sort().join(',')==='created,id');
  if(mode!=='standing denied')check('receipt '+mode+' optional audit cannot append after original admission closure',!raw("SELECT 1 FROM audit WHERE actor=? AND action='community.contribution_receipt'",staff));
 }
 for(const mode of['session revoked','standing denied']){
  const{t,staff,e}=setup(),period=policy.periodStart(t,policy.DEFAULT_CONTRIBUTION_POLICY)-7*86400;
  let r=await action(e,staff,{action:'obligation',discordId:ID,periodStart:new Date(period*1000).toISOString(),eligible:true});
  check('allocation '+mode+' has a genuine known own obligation',r.response?.status===200&&r.body?.result.created===true);
  r=await action(e,staff,receipt(t));check('allocation '+mode+' has a genuine saved matched payment',r.response?.status===200&&r.body?.result.created===true);
  const watch=observed(e,/INSERT INTO community_contribution_allocation_events/,async()=>db.prepare(mode==='session revoked'?'UPDATE site_users SET session_version=8 WHERE discord_id=?':'UPDATE site_users SET denied=1 WHERE discord_id=?').run(staff));
  r=await action(watch.e,staff,{action:'allocate',discordId:ID});
  check('allocation '+mode+' mutation really commits once before closure',watch.fired()===1&&watch.mutations()===1&&raw('SELECT SUM(amount_copper) AS paid FROM community_contribution_allocation_events')?.paid===10000);
  check('allocation '+mode+' known outcome survives without its sensitive result fields',!r.error&&r.response?.status===200&&r.body?.ok===true&&r.body.result?.status==='applied'&&Object.keys(r.body.result).join(',')==='status');
  check('allocation '+mode+' fresh ledger is withheld without allocation/credit details',r.body?.ledger===null&&r.body.withheld==='reader_refused'&&!JSON.stringify(r.body).includes('allocations')&&!JSON.stringify(r.body).includes('unallocatedCredit')&&!JSON.stringify(r.body).includes(ID));
 }
 {const{t,staff,e}=setup(),watch=observed(e,/INSERT INTO community_contribution_receipts/,async()=>{throw Error('independent lost committed primary result');});
  const r=await action(watch.e,staff,receipt(t));
  check('lost primary receipt result really committed one insertion',watch.fired()===1&&watch.mutations()===1&&rows('SELECT * FROM community_contribution_receipts').length===1);
  check('lost primary result is never converted to known success',!!r.error||r.response?.status>=400);
  check('lost primary receipt result performs no hidden retry or optional audit',watch.mutations()===1&&!raw("SELECT 1 FROM audit WHERE actor=? AND action='community.contribution_receipt'",staff));
 }
 {const{t,staff,e}=setup();hooks.beforeStatement=sql=>{if(/INSERT INTO audit/.test(sql))throw Error('independent informational audit failure');};
  const r=await action(e,staff,receipt(t));
  check('known receipt survives only an informational audit failure',!r.error&&r.response?.status===200&&r.body?.result.created===true&&r.body.ledger!==null&&rows('SELECT * FROM community_contribution_receipts').length===1);
  check('informational audit failure does not fabricate an audit record',!raw("SELECT 1 FROM audit WHERE actor=? AND action='community.contribution_receipt'",staff));
 }
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent contribution known-result checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
