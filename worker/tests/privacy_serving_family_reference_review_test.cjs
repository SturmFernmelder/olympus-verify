/** Independent actual-source/native regressions for core exports and rename attribution.
 * Authenticated ordinary export uses a genuinely signed cookie and actual currentUser.
 * Does not qualify the separately authored privacy-access source.
 */
const fs=require('fs'),path=require('path'),Module=require('module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_serving_integration_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function review(){
 const originals=[
  ['object',{kind:'discord',key:OTHER,label:'Other'}],['string',OTHER],['number',3],['boolean',false],['null',null],
  ['mixed array',[null,7,false,OTHER,{kind:{account:OTHER},label:{account:OTHER},key:OTHER},{kind:'discord',key:OTHER,label:'Chosen label'},{kind:'name',key:'private proof',label:'Chosen name'}]],
 ];
 let exportIndex=0;
 for(const[label,value]of originals){
  const t=reset(),owner=String(BigInt(ID)+100n+BigInt(exportIndex++)),answers={references:value,text:'My own text'};
  db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,session_version)VALUES(?,?,?,?,7)').run(owner,'Own export fixture',t,t);
  db.prepare("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at)VALUES(?,?,?,'submitted',?,?)").run(owner,'member',JSON.stringify(answers),t,t);
  const cookie=(await core.sessionCookie(env(),owner,7)).split(';')[0],request=new Request('https://guild.example/api/me/export',{headers:{Cookie:cookie}}),user=await core.currentUser(env(),request);
  check('core '+label+' fixture is actually authenticated',user?.discord_id===owner);
  let response,body,error;try{response=await load('site-export').exportMyData(request,env(),user);body=await response.json();}catch(e){error=e;}
  check('core '+label+' malformed projection returns a usable own copy',!error&&response?.status===200);
  check('core '+label+' omits foreign structural identity and malformed label/kind objects',!!body&&!JSON.stringify(body).includes(OTHER));
  check('core '+label+' preserves other own user text',body?.site?.application?.answers.text==='My own text');
  check('core '+label+' explicitly withholds non-array references',Array.isArray(value)||body?.site?.application?.answers.references===null);
  if(Array.isArray(value))check('core valid array references still expose recognized kind/chosen label only',body?.site?.application?.answers.references?.some(r=>r.kind==='discord'&&r.label==='Chosen label')&&body.site.application.answers.references.some(r=>r.kind==='name'&&r.label==='Chosen name')&&body.site.application.answers.references.every(r=>!Object.hasOwn(r,'key')));
 }
 for(const lost of[false,true]){
  const t=reset();db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at,closed_by,closed_at)VALUES(?,?,?,?,?,'cancelled',?,?,?,?)").run(OTHER,'Other Old','Other New','other new','review-rename-fixture',ID,t,ID,t);
  db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at)VALUES(?,?,?,?,?,'reapply',?,?)").run(ID,'Own Old','Own New','own new','own-rename-fixture',OTHER,t);
  const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof);hooks.loseResponse=lost;
  const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql),other=raw('SELECT * FROM rename_holds WHERE discord_id=?',OTHER);
  check('rename '+(lost?'lost committed response':'native completion')+' terminal receipt confirmed',out.state==='complete'&&out.servingAccountErased);
  check('rename own hold is deleted',!raw('SELECT * FROM rename_holds WHERE discord_id=?',ID));
  check('rename staff attribution is minimized',other?.decided_by==='erased'&&other.closed_by===null&&!JSON.stringify(other).includes(ID));
  check('rename other owner hold/state/name/clock preserved',other?.discord_id===OTHER&&other.state==='cancelled'&&other.old_name==='Other Old'&&other.new_name==='Other New'&&other.decided_at===t&&other.closed_at===t);
 }
 {const t=reset();db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at,closed_by,closed_at)VALUES(?,?,?,?,?,'cancelled',?,?,?,?)").run(OTHER,'Other Old','Other New','other new','review-rename-fixture',ID,t,ID,t);
 const proof=await admission(),receipt=await roles.settleAccountErasureMemberRole(env(),proof),before=snapshot();hooks.beforeStatement=sql=>{if(sql.includes('privacy_terminal_unconfirmed'))throw Error('independent terminal rename fault');};const out=await eraser.testOnlyLocalCompletion(env(),proof,receipt,roles.accountErasureRoleSettledSql);check('rename attribution projection rolls back with every other native family at terminal fault',out.state!=='complete'&&snapshot()===before);}
 // The explicit safety exception preserves an active ban and its case, while unlinking serving names/connections.
 {const t=reset();db.prepare('INSERT INTO members(discord_id,username,discord_name,battletag,bnet_conn_id,bnet_account_id,banned,ban_reason,linked_at)VALUES(?,?,?,?,?,?,1,?,?)').run(ID,'Private Username','Private Name','Private#1234','private-connection',9,'Active safety reason',t);
 db.prepare("INSERT INTO community_restriction_cases(id,discord_id,category,set_by,set_at,review_at,updated_at,incarnation,acknowledged_at,acknowledged_by)VALUES(?,?,'ban',?,?,?,?,?,?,?)").run('c'.repeat(22),ID,OTHER,t,t+86400,t,'d'.repeat(22),t,OTHER);
 const proof=await admission(),out=await eraser.continueServingErasure(env(),proof),member=raw('SELECT * FROM members WHERE discord_id=?',ID),caseRow=raw('SELECT * FROM community_restriction_cases WHERE discord_id=?',ID);
 check('active ban/case exception is preserved during serving completion',out.state==='complete'&&member?.banned===1&&member.ban_reason==='Active safety reason'&&caseRow?.category==='ban');
 check('active ban loses serving name/link identifiers',member?.username===null&&member.discord_name===null&&member.battletag===null&&member.bnet_conn_id===null&&member.bnet_account_id===null&&member.linked_at===null);
 check('active case stale return acknowledgment cleared',caseRow?.acknowledged_at===null&&caseRow.acknowledged_by===null);
 check('safety exception never invents all-copy/provider/recovery disposal',out.allCopiesErased===false&&out.providerMessages==='unqualified'&&out.recoveryCopies==='operator-held');}
 for(const[file,bytes]of pins)check('review source pin stable '+path.basename(file),fs.readFileSync(file).equals(bytes));
 console.log(`${passes}/${checks} independent core family-reference serving checks passed`);db.close();if(passes!==checks)process.exitCode=1;
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error(e.stack);process.exitCode=1;});`,original);
