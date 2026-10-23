// Actual source + original admitted SQLite fixture. All identities/transport are synthetic.
// New fixture controls are prepared only; the author did not execute this file.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{Module}=require('node:module');
const origin=path.join(__dirname,'site_appointed_identities_test.cjs'),raw=fs.readFileSync(origin,'utf8');
const boundaries=[...raw.matchAll(/\n\(async \(\) => \{/g)];
if(boundaries.length!==1)throw Error('one original appointed fixture boundary required');
const fixtureModule=new Module(origin,module);fixtureModule.filename=origin;fixtureModule.paths=Module._nodeModulePaths(path.dirname(origin));
fixtureModule._compile(raw.slice(0,boundaries[0].index)+`\nmodule.exports={fixture,identities,load,discordMembers,ids:()=>({ADMIN,HOLDER,SECOND,VIEWER,STRANGER}),reads:()=>discordReads,getFetch:()=>originalTestFetch,setFetch:value=>{originalTestFetch=value;},T};`,origin);
const H=fixtureModule.exports,roles=[...H.identities.APPOINTMENT_IDENTITY_ROLES].sort();
let checks=0;function check(label,ok){assert.ok(ok,label);checks++;console.log('PASS '+label);}
const saved=f=>JSON.parse(f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value);
const proofKeys=map=>Object.keys(map).filter(key=>key.includes(':publication:')).sort();
const requestPage=(f,id,cursor=null,revision=null)=>f.call('GET','/api/appointed-identities'+(cursor===null?'':'?'+new URLSearchParams({after:cursor,revision})),id);
const member=id=>({user:{id,username:'synthetic-'+id,global_name:null},nick:null,pending:false,roles:[]});
function fictionalMap(count,base=330000000000000000n){const map={};for(let i=0;i<count;i++){const id=String(base+BigInt(i+1));H.discordMembers.set(id,member(id));map[roles[i]]='<@'+id+'>';}return map;}
async function buildInBatches(f,map){let partial={};for(let i=0;i<Object.keys(map).length;i+=32){Object.assign(partial,Object.fromEntries(Object.entries(map).slice(i,i+32)));const before=H.reads();await f.publish(partial);check('one explicit batch performs at most32 fresh member attempts',H.reads()-before<=32);}return saved(f);}
(async()=>{
  check('the entire source catalogue remains131 distinct keys',roles.length===131&&new Set(roles).size===131);
  {
    const f=await H.fixture(),{ADMIN,VIEWER}=H.ids(),map=fictionalMap(131);
    try{
      const start=H.reads(),tooMany=await f.call('PUT','/api/admin/settings',ADMIN,{appointed:map,namesConfirmed:true,appointedCharactersConfirmed:true,notice:'must remain absent'});
      check('131 new distinct members refuse before the first provider call and before any partial setting',tooMany.status===409&&tooMany.body.accountStatus==='fresh_check_limit'&&H.reads()===start&&!f.db.prepare("SELECT 1 FROM site_settings WHERE key IN('appointed','notice')").get());
      const approved=await buildInBatches(f,map),beforeReuse=H.reads();await f.publish(map);const kept=saved(f);
      check('all131 qualified associations remain editable with zero repeated provider calls and exact original proof keys',H.reads()===beforeReuse&&proofKeys(approved).length===131&&JSON.stringify(proofKeys(approved))===JSON.stringify(proofKeys(kept))&&proofKeys(approved).every(key=>kept[key]===approved[key]));
      let cursor=null,revision=null,done=false;const people=[],pageSizes=[];
      for(let page=0;page<5;page++){
        const before=H.reads(),r=await requestPage(f,VIEWER,cursor,revision);
        check('each actual page is qualified, bounded and stable without internal metadata',r.status===200&&r.body.scope==='qualified_community_readers'&&r.body.identities.length<=32&&H.reads()-before<=37&&/^[A-Za-z0-9_-]{43}$/.test(r.body.revision)&&!JSON.stringify(r.body).includes(':publication:')&&Object.keys(r.body).every(key=>['scope','identities','revision','nextCursor','complete'].includes(key)));
        if(revision!==null)check('continuation retains the exact original opaque map/session revision',r.body.revision===revision);
        people.push(...r.body.identities);pageSizes.push(r.body.identities.length);cursor=r.body.nextCursor;revision=r.body.revision;done=r.body.complete;
        if(done)break;
      }
      check('five actual pages expose every131 separately consented office without loss or duplicate',done&&cursor===null&&JSON.stringify(pageSizes)==='[32,32,32,32,3]'&&people.length===131&&new Set(people.map(p=>p.role)).size===131&&people.every(p=>p.appointment===map[p.role]&&p.characters.length===0));
      const removed=roles[0],less={...map};delete less[removed];await f.publish(less);const restoreStart=H.reads();await f.publish(map);
      check('a deleted role proof cannot be silently reused on restoration',H.reads()-restoreStart===1&&saved(f)[removed]===map[removed]);
      const replacement='339000000000000001';H.discordMembers.set(replacement,member(replacement));const changed={...map,[roles[1]]:'<@'+replacement+'>'},changeStart=H.reads();await f.publish(changed);
      check('a changed pointer receives one fresh GET and cannot carry the prior role-pointer proof',H.reads()-changeStart===1&&saved(f)[roles[1]]===changed[roles[1]]&&proofKeys(saved(f)).filter(key=>key.startsWith(roles[1]+':publication:')).every(key=>saved(f)[key]===changed[roles[1]]));
    }finally{f.close();}
  }
  {
    const f=await H.fixture(),{ADMIN,HOLDER,VIEWER}=H.ids();
    try{
      await f.write('DELETE FROM site_users WHERE discord_id=?',HOLDER);
      const first=await f.publish({co_gm:'<@'+HOLDER+'>'}),key=proofKeys(first)[0];
      await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,account_incarnation)VALUES(?,?,?,?,?,1,0,?)',HOLDER,'later-profile',H.T,H.T,H.T,'d'.repeat(32));
      const before=H.reads();await f.publish({co_gm:'<@'+HOLDER+'>'});const second=saved(f),read=await requestPage(f,VIEWER);
      check('unchanged Discord-only proof stays byte-identical after later login and never upgrades to character authority',H.reads()-before===1&&proofKeys(second).length===1&&proofKeys(second)[0]===key&&second[key]===first[key]&&read.status===200&&read.body.identities[0].characters.length===0);
      // The one read above is the public profile GET, not a save revalidation GET.
      const sameStart=H.reads();await f.publish({co_gm:'<@'+HOLDER+'>'});check('a second names-only save still performs zero provider work',H.reads()===sameStart);
    }finally{f.close();}
  }
  for(const change of ['birth','absence','denied','banned','retiring','generation-cas']){
    const f=await H.fixture(),{ADMIN,HOLDER}=H.ids();
    try{
      const first=await f.publish({co_gm:'<@'+HOLDER+'>'}),oldKey=proofKeys(first)[0];
      if(change==='birth'){
        // The installed immutable-birth trigger stays intact. This is a genuine
        // absent/recreated synthetic profile, under the original privacy row.
        await f.write('DELETE FROM site_users WHERE discord_id=?',HOLDER);
        await f.write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,account_incarnation)VALUES(?,?,?,?,?,1,0,?)',HOLDER,'recreated-holder',H.T,H.T,H.T,'e'.repeat(32));
      }
      if(change==='absence')await f.write('DELETE FROM site_users WHERE discord_id=?',HOLDER);
      if(change==='denied')await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?',HOLDER);
      if(change==='banned')await f.write('UPDATE members SET banned=1 WHERE discord_id=?',HOLDER);
      if(change==='retiring')await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?",HOLDER);
      if(change==='generation-cas')f.beforeSave(()=>f.write('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','f'.repeat(32),HOLDER));
      const before=H.reads(),r=await f.call('PUT','/api/admin/settings',ADMIN,{appointed:{co_gm:'<@'+HOLDER+'>'},namesConfirmed:true,appointedCharactersConfirmed:true,notice:'new audited review'});
      if(['birth','absence'].includes(change))check('changed '+change+' cannot reuse old character proof and needs fresh explicit review',r.status===200&&H.reads()-before===1&&proofKeys(saved(f))[0]!==oldKey&&!proofKeys(saved(f)).includes(oldKey));
      else check('retained proof cannot bypass target '+change+' or partially save other settings',r.status===409&&r.body.error==='appointed_account_unavailable'&&H.reads()===before&&!f.db.prepare("SELECT 1 FROM site_settings WHERE key='notice'").get()&&f.db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value===JSON.stringify(first));
    }finally{f.close();}
  }
  {
    const f=await H.fixture(),{ADMIN,VIEWER}=H.ids(),map=fictionalMap(33,340000000000000000n);
    try{
      await buildInBatches(f,map);const first=await requestPage(f,VIEWER);check('a real incomplete page supplies an advancing source-key cursor',first.status===200&&!first.body.complete&&roles.includes(first.body.nextCursor));
      for(const suffix of ['?after='+encodeURIComponent(first.body.nextCursor),'?after=unregistered&revision='+first.body.revision,'?after='+first.body.nextCursor+'&after='+first.body.nextCursor+'&revision='+first.body.revision]){
        const before=H.reads(),r=await f.call('GET','/api/appointed-identities'+suffix,VIEWER);check('malformed or duplicate cursor performs no provider work',r.status===400&&H.reads()===before);
      }
      const beforeOther=H.reads(),other=await requestPage(f,ADMIN,first.body.nextCursor,first.body.revision);check('opaque continuation is bound to original reader/session not a bearer publication grant',other.status===409&&other.body.error==='appointed_identities_changed'&&H.reads()===beforeOther);
      const tampered=first.body.revision.slice(0,5)+(first.body.revision[5]==='A'?'B':'A')+first.body.revision.slice(6),beforeTamper=H.reads(),bad=await requestPage(f,VIEWER,first.body.nextCursor,tampered);check('tampered revision is refused before holder GETs',bad.status===409&&H.reads()===beforeTamper);
      await f.setting({co_gm:'Name withheld'});const beforeChanged=H.reads(),changed=await requestPage(f,VIEWER,first.body.nextCursor,first.body.revision);check('a changed original map cannot produce a mixed later page or resurrect removed identities',changed.status===409&&!changed.body.identities&&H.reads()===beforeChanged);
    }finally{f.close();}
  }
  {
    const f=await H.fixture(),{VIEWER}=H.ids(),map=fictionalMap(33,345000000000000000n),originalFetch=H.getFetch();
    try{
      await buildInBatches(f,map);let fired=false;
      const removedId=H.identities.appointmentAccountId(map[roles[0]]);
      H.setFetch(async url=>{
        const response=await originalFetch(url);
        if(!fired&&String(url).endsWith('/members/'+removedId)){
          fired=true;await f.write('INSERT INTO members(discord_id,banned)VALUES(?,1)ON CONFLICT(discord_id)DO UPDATE SET banned=1',removedId);
        }
        return response;
      });
      const first=await requestPage(f,VIEWER);H.setFetch(originalFetch);
      check('target becoming unavailable during the original GET refuses the entire changed page instead of shifting an unchecked holder past its cursor',fired&&first.status===409&&first.body.error==='appointed_identities_changed'&&!first.body.identities&&!JSON.stringify(first.body).includes(removedId));
      const fresh=await requestPage(f,VIEWER),combined=fresh.body.identities;
      check('an explicit fresh read after changed-target refusal reaches every remaining qualified holder without a skipped boundary',fresh.status===200&&fresh.body.complete&&combined.length===32&&new Set(combined.map(p=>p.role)).size===32&&!combined.some(p=>p.role===roles[0])&&combined.some(p=>p.role===roles[32]));
    }finally{H.setFetch(originalFetch);f.close();}
  }
  {
    const f=await H.fixture(),{HOLDER,VIEWER}=H.ids(),map=fictionalMap(33,347000000000000000n);map[roles[0]]='<@'+HOLDER+'>';
    try{
      await buildInBatches(f,map);const first=await requestPage(f,VIEWER);
      await f.write('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','9'.repeat(32),HOLDER);
      const before=H.reads(),second=await requestPage(f,VIEWER,first.body.nextCursor,first.body.revision);
      check('a prior-page holder generation change with unchanged raw appointed map invalidates continuation before holder GETs',first.status===200&&!first.body.complete&&second.status===409&&!second.body.identities&&H.reads()===before);
    }finally{f.close();}
  }
  {
    const f=await H.fixture(),{VIEWER}=H.ids(),map=fictionalMap(32,350000000000000000n);
    try{
      await f.publish(map);await f.write('DELETE FROM characters WHERE discord_id=?',VIEWER);f.env.GUILD_ID=f.env.SITE_GUILD_ID;f.env.ROLE_GUILD_MEMBER='355000000000000001';H.discordMembers.get(VIEWER).roles=[f.env.ROLE_GUILD_MEMBER];
      const before=H.reads(),r=await requestPage(f,VIEWER);
      check('role-based original admission plus32 fresh holder GETs fits the existing40/50 envelope',r.status===200&&r.body.identities.length===32&&H.reads()-before===36&&H.reads()-before<=37);
    }finally{f.close();}
  }
  {
    const f=await H.fixture(),{ADMIN,VIEWER}=H.ids();
    try{
      for(let i=0;i<20;i++){const r=await requestPage(f,VIEWER);check('original authenticated reader soft allowance '+i,r.status===200);}
      const before=H.reads(),limited=await requestPage(f,VIEWER);check('reader request21 is held before any provider work',limited.status===429&&H.reads()===before);
      for(let i=0;i<30;i++){const r=await f.call('PUT','/api/admin/settings',ADMIN,{notice:'synthetic cap '+i});check('original authenticated administrator soft allowance '+i,r.status===200);}
      const state=f.db.prepare("SELECT value FROM site_settings WHERE key='notice'").get().value,beforeSave=H.reads(),r=await f.call('PUT','/api/admin/settings',ADMIN,{notice:'must not apply'});
      check('administrator save31 makes no provider call and changes nothing',r.status===429&&H.reads()===beforeSave&&f.db.prepare("SELECT value FROM site_settings WHERE key='notice'").get().value===state);
    }finally{f.close();}
  }
  console.log(checks+'/'+checks+' appointed bounds checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
