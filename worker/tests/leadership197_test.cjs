// Real .197 handlers and original admitted Native SQLite fixtures. Discord data
// and transport are synthetic; this file performs no provider or game action.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{Module}=require('node:module');
function originalPrefix(file,marker,exports){
 const raw=fs.readFileSync(file,'utf8'),at=raw.indexOf(marker);
 if(at<0||raw.indexOf(marker,at+marker.length)>=0)throw Error('one exact original fixture boundary required: '+file);
 const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m._compile(raw.slice(0,at)+'\nmodule.exports={'+exports+'};',file);return m.exports;
}
const H=originalPrefix(path.join(__dirname,'site_appointed_identities_test.cjs'),'\n(async () => {',
 'fixture,identities,load,discordMembers,ids:()=>({ADMIN,HOLDER,SECOND,VIEWER,STRANGER}),reads:()=>discordReads,getFetch:()=>originalTestFetch,setFetch:value=>{originalTestFetch=value;},T,sourcePins');
const L=H.load('./site-leadership'),D=H.load('./site-leadership-data');
let checks=0;
function check(label,ok){assert.ok(ok,label);checks++;console.log('PASS '+label);}
const ten=()=>D.GUILD_NAMES.map(name=>({name,gm:'',officers:[]}));
const stored=f=>f.db.prepare("SELECT value FROM site_settings WHERE key='leadership'").get()?.value??null;
const audits=f=>f.db.prepare("SELECT details FROM audit WHERE action='site.leadership' ORDER BY id").all();
const view=(f,id=H.ids().ADMIN)=>f.call('GET','/api/admin/leadership',id);
async function save(f,guilds,extra={}){
 const v=await view(f);assert.equal(v.status,200,'original admin view must be current');
 return f.call('PUT','/api/admin/leadership',H.ids().ADMIN,{guilds,expectedRevision:v.body.revision,namesConfirmed:true,leadershipIdentitiesConfirmed:true,...extra});
}
const page=(f,id=H.ids().VIEWER,after=null,revision=null)=>f.call('GET','/api/leadership'+(after===null?'':'?'+new URLSearchParams({after,revision})),id);
const own=async(f,id)=>H.identities.projectOwnAppointmentPublications(f.env,(await H.identities.ownAppointmentPublicationsStatement(f.env,id).all()).results);
const member=id=>({user:{id,username:'synthetic-'+id,global_name:null},nick:null,pending:false,roles:[]});
const setRow=(f,value)=>f.write("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('leadership',?,?,?)ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",typeof value==='string'?value:JSON.stringify(value),H.T,H.ids().ADMIN);
const publicKeys=['branch','label','officerIndex','position','slot','username'];
async function negative(action){try{return await action();}catch(e){if(!(e instanceof H.load('./privacy-serving-authority').PrivacySiteRequestHeld))throw e;return {status:409,body:{error:'original_native_request_held'}};}}
(async()=>{
 check('branch slots are130 closed display positions; the137-key appointment catalogue stays separate from branch positions',D.LEADERSHIP_POSITIONS.length===130&&new Set(D.LEADERSHIP_POSITION_KEYS).size===130&&H.identities.APPOINTMENT_IDENTITY_ROLES.length===137&&!D.LEADERSHIP_POSITION_KEYS.some(k=>H.identities.APPOINTMENT_IDENTITY_ROLES.includes(k)));
 {
  const f=await H.fixture(),{ADMIN,HOLDER,VIEWER,STRANGER}=H.ids();
  try{
   const g=ten();g[0].gm='Typed person';g[0].officers=['Another typed label'];
   const r=await f.call('PUT','/api/admin/leadership',ADMIN,{guilds:g,namesConfirmed:true}),p=await page(f,VIEWER);
   check('legacy typed save stays an array and explicitly unverified without an inferred identity',r.status===200&&Array.isArray(JSON.parse(stored(f)))&&r.body.legacyNames==='staff_entered_unverified'&&p.status===200&&p.body.guilds[0].gm==='Typed person'&&p.body.identities.length===0);
   const old=ten();old[0].gm='<@'+HOLDER+'>';await setRow(f,old);
   const parsed=L.parseLeadership(stored(f)),loaded=await L.loadLeadership(f.env),publicRead=await page(f,VIEWER);
   check('legacy canonical pointers and approved-export-facing parse never expose private pointers as addon names',parsed[0].gm==='Name withheld'&&loaded.guilds[0].gm==='Name withheld'&&publicRead.body.guilds[0].gm==='Name withheld'&&publicRead.body.identities.length===0&&!JSON.stringify(loaded).includes(HOLDER));
   const denied=await page(f,STRANGER),anon=await page(f,null),nonAdmin=await view(f,VIEWER);
   check('the original confirmed reader and administrator boundaries remain required',denied.status===403&&anon.status===401&&nonAdmin.status===403);
  }finally{f.close();}
 }
 {
  const f=await H.fixture(),{HOLDER,VIEWER}=H.ids(),original=H.getFetch(),role='370000000000000001';
  try{
   const g=ten();g[0].gm='<@'+HOLDER+'>';const saved=await save(f,g);assert.equal(saved.status,200);
   await f.write('DELETE FROM characters WHERE discord_id=?',VIEWER);
   f.env.GUILD_ID=f.env.SITE_GUILD_ID;f.env.ROLE_GUILD_MEMBER=role;H.discordMembers.get(VIEWER).roles=[role];
   const start=H.reads(),p=await page(f,VIEWER);
   check('an original linked Guild Member role-only reader retains current qualified leadership access',p.status===200&&p.body.identities.length===1&&p.body.identities[0].label==='First Nick'&&H.reads()-start<=6&&!f.db.prepare('SELECT 1 FROM characters WHERE discord_id=?').get(VIEWER));
   let removedDuringTarget=false;
   H.setFetch(async url=>{const response=await original(url);if(!removedDuringTarget&&String(url).endsWith('/members/'+HOLDER)){removedDuringTarget=true;H.discordMembers.get(VIEWER).roles=[];}return response;});
   const lost=await negative(()=>page(f,VIEWER));
   check('loss of the original reader Guild Member role during target lookup releases no earlier leadership DTO',removedDuringTarget&&lost.status!==200&&!lost.body.identities);
  }finally{H.setFetch(original);f.close();}
 }
 {
  const f=await H.fixture(),{ADMIN,HOLDER,SECOND}=H.ids();
  try{
   const g=ten();g[0].gm='<@'+HOLDER+'>';const v=await view(f),start=H.reads();
   for(const flag of [undefined,false,'true']){
    const body={guilds:g,expectedRevision:v.body.revision,namesConfirmed:true};if(flag!==undefined)body.leadershipIdentitiesConfirmed=flag;
    const r=await f.call('PUT','/api/admin/leadership',ADMIN,body);
    check('account publication requires fresh strict explicit consent: '+String(flag),r.status===400&&r.body.error==='identity_confirmation'&&stored(f)===null&&H.reads()===start);
   }
   const noRevision=await f.call('PUT','/api/admin/leadership',ADMIN,{guilds:g,namesConfirmed:true,leadershipIdentitiesConfirmed:true});
   check('a canonical pointer cannot bypass the original revision or submit its own proof',noRevision.status===409&&noRevision.body.error==='stale_directory'&&stored(f)===null&&(await f.call('PUT','/api/admin/leadership',ADMIN,{guilds:g,publications:{},namesConfirmed:true})).status===400);
   g[0].officers=['<@'+SECOND+'>'];const r=await save(f,g),doc=JSON.parse(stored(f)),p=await page(f);
   check('save returns a fresh session-bound revision and a private exact branch-position proof envelope',r.status===200&&/^[A-Za-z0-9_-]{43}$/.test(r.body.revision)&&r.body.revision!==v.body.revision&&r.body.updatedAt===H.T&&r.body.identityBindingsVersion===1&&D.leadershipEnvelope(doc)&&Object.keys(doc.publications).sort().join()==='guild_01_gm,guild_01_officer_01'&&doc.publications.guild_01_gm.birth===HOLDER.padStart(32,'a'));
   check('admin editing and public current labels never return signatures, births, generations or character claims',!JSON.stringify(r.body).includes('publications')&&!JSON.stringify(r.body).includes('account_incarnation')&&p.status===200&&p.body.identities.length===2&&p.body.identities.every(row=>Object.keys(row).sort().join()===publicKeys.join())&&p.body.identities.find(row=>row.slot==='guild_01_gm').label==='First Nick'&&!JSON.stringify(p.body).includes(HOLDER)&&!JSON.stringify(p.body).includes('Proof '));
   const again=await f.call('PUT','/api/admin/leadership',ADMIN,{guilds:g,expectedRevision:r.body.revision,namesConfirmed:true,leadershipIdentitiesConfirmed:true});
   check('the successful response revision permits a repeated exact save without an implicit GET',again.status===200&&again.body.revision===r.body.revision);
   const copy=await own(f,HOLDER),other=await own(f,SECOND),a=audits(f);
   check('the existing one physical own-copy slot returns only each owner branch metadata, without counterpart or proof leakage',copy.length===1&&copy[0].kind==='branch_leadership'&&copy[0].branch===1&&copy[0].position==='gm'&&copy[0].currentlyPublished===true&&other.length===1&&other[0].position==='officer'&&![HOLDER,SECOND,doc.publications.guild_01_gm.mac,doc.publications.guild_01_gm.birth].some(value=>JSON.stringify(copy).includes(value)));
   check('branch audit contains counts and explicit confirmation, never a target pointer or private proof',a.length===2&&a.every(row=>{const d=JSON.parse(row.details);return d.identityAssociations===2&&d.identityPublicationConfirmed===true&&!JSON.stringify(d).includes(HOLDER)&&!JSON.stringify(d).includes('mac');}));
   const before=stored(f),reset=await f.call('PUT','/api/admin/beta-reset',ADMIN,{confirm:'RESET'});
   check('the retired beta reset preserves qualified branch assignments exactly',reset.status===410&&stored(f)===before);
  }finally{f.close();}
 }
 {
  const f=await H.fixture(),{ADMIN,HOLDER,SECOND}=H.ids();
  try{
   const v=await view(f),g=ten();g[0].gm='<@'+HOLDER+'>';
   const winner=ten();winner[0].gm='Concurrent withdrawal';await setRow(f,winner);
   const r=await f.call('PUT','/api/admin/leadership',ADMIN,{guilds:g,expectedRevision:v.body.revision,namesConfirmed:true,leadershipIdentitiesConfirmed:true});
   check('an old whole-row revision cannot overwrite a concurrent correction, even in the same second',r.status===409&&JSON.parse(stored(f))[0].gm==='Concurrent withdrawal'&&audits(f).length===0);
   let result=await save(f,g);assert.equal(result.status,200);
   const before=stored(f),count=audits(f).length,next=ten();next[0].gm='<@'+SECOND+'>';
   f.beforeSave(async()=>{await setRow(f,winner);});
   result=await save(f,next);
   check('the committing SQL repeats the whole-row CAS and does not audit a lost save',result.status===409&&stored(f)!==before&&JSON.parse(stored(f))[0].gm==='Concurrent withdrawal'&&audits(f).length===count);
  }finally{f.close();}
 }
 for(const state of ['denied','departed','banned','retiring']){
  const f=await H.fixture(),{HOLDER}=H.ids();
  try{
   if(state==='denied')await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?',HOLDER);
   if(state==='departed')await f.write('UPDATE site_users SET in_server=0 WHERE discord_id=?',HOLDER);
   if(state==='banned')await f.write('UPDATE members SET banned=1 WHERE discord_id=?',HOLDER);
   if(state==='retiring')await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?",HOLDER);
   const g=ten();g[0].gm='<@'+HOLDER+'>';const start=H.reads(),r=await save(f,g);
   check('new association refuses current target '+state+' before a profile lookup and leaves no row',r.status===409&&r.body.error==='identity_unavailable'&&stored(f)===null&&H.reads()===start);
  }finally{f.close();}
 }
 for(const change of ['birth','generation','retiring','reader-session','row']){
  const f=await H.fixture(),{ADMIN,HOLDER}=H.ids(),original=H.getFetch();
  let fired=false;
  try{
   const g=ten();g[0].gm='<@'+HOLDER+'>';const saved=await save(f,g);assert.equal(saved.status,200);
   H.setFetch(async url=>{
    const response=await original(url);
    if(!fired&&String(url).endsWith('/members/'+HOLDER)){
     fired=true;
     if(change==='birth'){
      await f.write('DELETE FROM site_users WHERE discord_id=?',HOLDER);
      await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,account_incarnation)VALUES(?,?,?,?,?,1,0,?)',HOLDER,'same-display-new-account',H.T,H.T,H.T,'e'.repeat(32));
     }
     if(change==='generation')await f.write('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','e'.repeat(32),HOLDER);
     if(change==='retiring')await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?",HOLDER);
     if(change==='reader-session')await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',H.ids().VIEWER);
     if(change==='row'){const replacement=ten();replacement[0].gm='New correction';await setRow(f,replacement);}
    }
    return response;
   });
   const p=await negative(()=>page(f));
   check('public profile await cannot release stale row/target/original-reader data after '+change,fired&&p.status!==200&&!p.body.identities);
   if(change==='birth'){
    H.setFetch(original);const after=await page(f);
    check('a recreated same-ID account never inherits the old branch publication proof',after.status===200&&after.body.identities.length===0&&after.body.guilds[0].gm==='Name withheld');
   }
  }finally{H.setFetch(original);f.close();}
 }
 for(const change of ['target-retiring','reader-session']){
  const f=await H.fixture(),{ADMIN,HOLDER}=H.ids();
  try{
   const g=ten();g[0].gm='<@'+HOLDER+'>';
   f.beforeSave(async()=>{if(change==='target-retiring')await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?",HOLDER);else await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',ADMIN);});
   const r=await negative(()=>save(f,g));
   check('committing writer repeats captured authority under '+change,r.status!==200&&stored(f)===null&&audits(f).length===0);
  }finally{f.close();}
 }
 {
  const f=await H.fixture(),{ADMIN,VIEWER,SECOND}=H.ids(),all=ten(),created=[];
  try{
   for(let i=0;i<130;i++){
    const id=String(360000000000000000n+BigInt(i+1)),slot=D.LEADERSHIP_POSITIONS[i];created.push(id);H.discordMembers.set(id,member(id));
    if(slot.position==='gm')all[slot.guildIndex].gm='<@'+id+'>';else all[slot.guildIndex].officers[slot.officerIndex]='<@'+id+'>';
   }
   const start=H.reads(),over=await save(f,all);
   check('130 new targets are refused before any GET or partial directory; max32 is enforced before transport',over.status===409&&H.reads()===start&&stored(f)===null);
   const partial=ten();let accepted=0;
   for(let i=0;i<130;i+=32){
    for(const slot of D.LEADERSHIP_POSITIONS.slice(i,i+32)){if(slot.position==='gm')partial[slot.guildIndex].gm=all[slot.guildIndex].gm;else partial[slot.guildIndex].officers[slot.officerIndex]=all[slot.guildIndex].officers[slot.officerIndex];}
    const before=H.reads(),r=await save(f,partial);assert.equal(r.status,200,JSON.stringify(r));accepted+=Math.min(32,130-i);
    check('one reviewed save checks only its new batch, retaining exact prior proofs: '+accepted,H.reads()-before===Math.min(32,130-i)&&Object.keys(JSON.parse(stored(f)).publications).length===accepted);
   }
   const beforeReuse=H.reads(),beforeProofs=JSON.stringify(JSON.parse(stored(f)).publications),again=await save(f,all);
   check('unchanged server-owned proofs are reused without extra GETs or signature upgrades',again.status===200&&H.reads()===beforeReuse&&JSON.stringify(JSON.parse(stored(f)).publications)===beforeProofs);
   let cursor=null,revision=null,done=false;const people=[],sizes=[];
   for(let i=0;i<5;i++){
    const before=H.reads(),r=await page(f,VIEWER,cursor,revision);assert.equal(r.status,200,JSON.stringify(r));
    check('each public page is<=32 identities and<=37 total reader/member GETs with no private fields',r.body.identities.length<=32&&H.reads()-before<=37&&r.body.identities.every(row=>Object.keys(row).sort().join()===publicKeys.join())&&!JSON.stringify(r.body).includes('publications'));
    if(revision!==null)check('all continuation pages preserve the exact original reader/whole-row witness',r.body.revision===revision);
    people.push(...r.body.identities);sizes.push(r.body.identities.length);cursor=r.body.nextCursor;revision=r.body.revision;done=r.body.complete;if(done)break;
   }
   check('all130 separately qualified positions finish in five pages with no omission or duplicate',done&&cursor===null&&JSON.stringify(sizes)==='[32,32,32,32,2]'&&people.length===130&&new Set(people.map(p=>p.slot)).size===130);
   const first=await page(f,VIEWER),cross=await page(f,SECOND,first.body.nextCursor,first.body.revision);
   check('an opaque continuation is bound to its original reader session',cross.status===409&&cross.body.error==='leadership_changed'&&!cross.body.identities);
   const modified=JSON.parse(stored(f));modified.guilds[0].gm='Name withheld';delete modified.publications.guild_01_gm;await setRow(f,modified);
   const stale=await page(f,VIEWER,first.body.nextCursor,first.body.revision);
   check('a directory change between pages refuses the old continuation instead of mixing epochs',stale.status===409&&stale.body.error==='leadership_changed'&&!stale.body.identities);
   const bad=await f.call('GET','/api/leadership?after=guild_01_gm&revision='+revision+'&revision='+revision,VIEWER);
   check('duplicate or incomplete cursor controls cannot select a different query',bad.status===400);
  }finally{created.forEach(id=>H.discordMembers.delete(id));f.close();}
 }
 // The original canonical-schema, original-job proof fixture is deliberately a
 // separate realm; it tests the exact existing six physical cleanup statements.
 const N=originalPrefix(path.join(__dirname,'privacy_native_erasure_cleanup_test.cjs'),'\n(async()=>{','fixture,cleanup,ID,OTHER,GEN,BIRTH,OP,DIGEST,T,pins');
 // PR90 P2: a Native removal marker is a seat, not a duplicate person.
 // Real cleanup runs in the original separate Native realm; its surviving
 // server-signed proof is then read/saved by the real admitted Worker realm.
 for(const trailingTyped of [true,false]){
  const f=await H.fixture(),n=N.fixture(),{HOLDER,SECOND}=H.ids();
  try{
   const g=ten();g[0].officers=['Name withheld','<@'+HOLDER+'>','<@'+SECOND+'>',...(trailingTyped?['Typed officer']:[])];
   assert.equal((await save(f,g)).status,200,'original consented two-account setup');
   const doc=JSON.parse(stored(f)),active=JSON.stringify(doc.publications.guild_01_officer_03);
   doc.guilds[0].officers[1]='<@'+N.ID+'>';
   doc.publications.guild_01_officer_02={pointer:'<@'+N.ID+'>',birth:N.BIRTH,generation:N.GEN,mac:'A'.repeat(43)};
   assert.ok(D.leadershipEnvelope(doc),'original Native input must be a qualified envelope');
   n.set('leadership',doc);const cleanup=await N.cleanup.cleanupNativePersonalReferences(n.env,n.proof),after=JSON.parse(n.value('leadership'));
   check('actual Native cleanup retains both withheld positions and the surviving original proof'+(trailingTyped?' before a typed officer':' at the terminal seat'),cleanup.state==='cleaned'&&cleanup.changed===1&&n.trace.length===6&&D.leadershipEnvelope(after)&&after.guilds[0].officers.length===(trailingTyped?4:3)&&after.guilds[0].officers[0]==='Name withheld'&&after.guilds[0].officers[1]==='Name withheld'&&JSON.stringify(after.publications.guild_01_officer_03)===active&&!Object.hasOwn(after.publications,'guild_01_officer_02'));
   await setRow(f,after);const p=await page(f),expected=['Name withheld','Name withheld','Name withheld',...(trailingTyped?['Typed officer']:[])];
   check('qualified read preserves original officer index2 and every following label'+(trailingTyped?' with trailing typed label':' without a following slot'),p.status===200&&JSON.stringify(p.body.guilds[0].officers)===JSON.stringify(expected)&&p.body.identities.length===1&&p.body.identities[0].slot==='guild_01_officer_03'&&p.body.identities[0].officerIndex===2&&p.body.identities[0].label==='holder-two'&&!JSON.stringify(p.body).includes(SECOND));
   const admin=await view(f);assert.equal(admin.status,200);const originalFetch=H.getFetch();let targetGets=0;
   H.setFetch(async url=>{if(String(url).endsWith('/members/'+SECOND))targetGets++;return originalFetch(url);});
   try{
    const again=await save(f,admin.body.guilds),saved=JSON.parse(stored(f));
    check('unchanged admin roundtrip preserves repeated markers, original seat key and exact proof without target recheck'+(trailingTyped?' with trailing typed label':' at the terminal seat'),again.status===200&&JSON.stringify(saved.guilds)===JSON.stringify(after.guilds)&&Object.keys(saved.publications).join()==='guild_01_officer_03'&&JSON.stringify(saved.publications.guild_01_officer_03)===active&&targetGets===0);
    admin.body.guilds[1].gm='Unrelated typed correction';const unrelated=await save(f,admin.body.guilds),kept=JSON.parse(stored(f));
    check('an unrelated guild edit cannot compact Native removal markers or rebind the surviving seat'+(trailingTyped?' with trailing typed label':' at the terminal seat'),unrelated.status===200&&JSON.stringify(kept.guilds[0])===JSON.stringify(after.guilds[0])&&JSON.stringify(kept.publications.guild_01_officer_03)===active&&Object.keys(kept.publications).join()==='guild_01_officer_03'&&targetGets===0);
   }finally{H.setFetch(originalFetch);}
  }finally{n.close();f.close();}
 }
 {
  const g=ten();g[0].gm='x'.repeat(41);g[0].officers=['  Repeated  ','Repeated','Name withheld','Name withheld'];
  const legacy=L.cleanLeadership(g);
  check('legacy cleaner still truncates40 characters and deduplicates ordinary names and removal labels',legacy[0].gm==='x'.repeat(40)&&JSON.stringify(legacy[0].officers)==='["Repeated","Name withheld"]'&&JSON.stringify(L.parseLeadership(JSON.stringify(g)))===JSON.stringify(legacy));
  const max=ten();max[0].officers=Array(12).fill('Name withheld');const valid={schema:D.LEADERSHIP_SCHEMA,guilds:max,publications:{}};
  check('validated qualified envelope keeps all12 marker positions without legacy compaction',D.leadershipEnvelope(valid)&&L.parseLeadership(JSON.stringify(valid))[0].officers.length===12);
  for(const kind of ['thirteen-officers','overlong-label','wrong-guild','extra-envelope-key','missing-proof']){
   const bad=JSON.parse(JSON.stringify(valid));
   if(kind==='thirteen-officers')bad.guilds[0].officers.push('Name withheld');
   if(kind==='overlong-label')bad.guilds[0].officers[0]='x'.repeat(41);
   if(kind==='wrong-guild')bad.guilds[0].name='Different guild';
   if(kind==='extra-envelope-key')bad.extra=true;
   if(kind==='missing-proof')bad.guilds[0].officers[0]='<@'+N.ID+'>';
   check('qualified read still refuses the complete malformed envelope: '+kind,!D.leadershipEnvelope(bad)&&L.parseLeadership(JSON.stringify(bad)).every(g=>g.gm===''&&g.officers.length===0));
  }
 }
 {
  const f=await H.fixture(),{SECOND}=H.ids();
  try{
   const g=ten();g[0].gm='x'.repeat(41);g[0].officers=[' Repeated ','Repeated','Name withheld','Name withheld','<@'+SECOND+'>'];
   const r=await save(f,g),doc=JSON.parse(stored(f));
   check('qualified save preserves repeated exact markers but retains ordinary name cleaning and40-character truncation',r.status===200&&doc.guilds[0].gm==='x'.repeat(40)&&JSON.stringify(doc.guilds[0].officers)===JSON.stringify(['Repeated','Name withheld','Name withheld','<@'+SECOND+'>'])&&Object.keys(doc.publications).join()==='guild_01_officer_04'&&D.leadershipEnvelope(doc));
   const before=stored(f);g[0].officers=Array(13).fill('Name withheld');const over=await save(f,g);
   check('thirteen nonempty input seats still refuse before deduplication and leave the prior directory exact',over.status===400&&over.body.error==='invalid'&&stored(f)===before);
  }finally{f.close();}
 }
 for(const state of ['waiting_role','held','erasing']){
  const f=N.fixture(state);
  try{
   const g=ten();g[0].gm='<@'+N.ID+'>';g[0].officers=['<@'+N.OTHER+'>','Duplicate typed display'];
   const doc={schema:D.LEADERSHIP_SCHEMA,guilds:g,publications:{guild_01_gm:{pointer:g[0].gm,birth:N.BIRTH,generation:N.GEN,mac:'A'.repeat(43)},guild_01_officer_01:{pointer:g[0].officers[0],birth:'e'.repeat(32),generation:'f'.repeat(32),mac:'B'.repeat(43)}}};
   f.set('leadership',doc);const other=JSON.stringify(doc.publications.guild_01_officer_01),out=await N.cleanup.cleanupNativePersonalReferences(f.env,f.proof),after=JSON.parse(f.value('leadership'));
   check(state+': original exact erasure proof removes only own pointer and private branch proof in the same six-statement plan',out.state==='cleaned'&&out.changed===1&&f.trace.length===6&&after.guilds[0].gm==='Name withheld'&&!Object.hasOwn(after.publications,'guild_01_gm')&&JSON.stringify(after.publications.guild_01_officer_01)===other&&after.guilds[0].officers[1]==='Duplicate typed display'&&!JSON.stringify(after).includes(N.ID)&&!JSON.stringify(after).includes(N.BIRTH));
   const repeat=await N.cleanup.cleanupNativePersonalReferences(f.env,f.proof);
   check(state+': branch cleanup is idempotent and never claims terminal account erasure',repeat.state==='cleaned'&&repeat.changed===0&&!('servingAccountErased' in repeat)&&f.db.prepare('SELECT state FROM privacy_serving_jobs').get().state===state);
  }finally{f.close();}
 }
 for(const broken of ['wrong-proof','malformed-document','lost-commit-reply']){
  const f=N.fixture();
  try{
   const g=ten();g[0].gm='<@'+N.ID+'>';const doc={schema:D.LEADERSHIP_SCHEMA,guilds:g,publications:{guild_01_gm:{pointer:g[0].gm,birth:N.BIRTH,generation:N.GEN,mac:'A'.repeat(43)}}};
   f.set('leadership',broken==='malformed-document'?JSON.stringify(doc).replace('"schema":','"schema":"ambiguous","schema":'):doc);
   const before=f.value('leadership');if(broken==='wrong-proof')f.proof.subjectGeneration='e'.repeat(32);if(broken==='lost-commit-reply')f.lose();
   const out=await N.cleanup.cleanupNativePersonalReferences(f.env,f.proof);
   check('original proof/ambiguity/unknown boundary survives branch envelope: '+broken,broken==='malformed-document'?out.state==='cleaned'&&out.changed===0&&f.value('leadership')===before:out.state==='unknown'&&(broken==='wrong-proof'?f.value('leadership')===before:JSON.parse(f.value('leadership')).guilds[0].gm==='Name withheld'));
  }finally{f.close();}
 }
 check('all actual loaded source bytes remain unchanged during this focused run',[...H.sourcePins,...N.pins].every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
 console.log(checks+'/'+checks+' leadership .197 checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
