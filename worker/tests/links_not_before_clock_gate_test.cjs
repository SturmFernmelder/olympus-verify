// Future launch cutoff: real db/config/roster/ingest modules over SQLite; only Discord is simulated.
const assert=require('node:assert/strict'),H=require('./helpers/beta_item15_harness.cjs');
const {NEW:M,SUBJECT,G,GUID,FRESH}=H,dbm=M.load('db'),F=M.load('full-release-roles');
const E=1793833200,KEY='LINKS_NOT_BEFORE_CLOCK_GATED';let passed=0,failed=0;
const check=(name,ok)=>{if(ok)passed++;else failed++;console.log((ok?'PASS ':'FAIL ')+name);};
const env=(...args)=>{const gate=args.length?args[0]:'true';return {LINKS_NOT_BEFORE:String(E),...(gate==='absent'?{}:{[KEY]:gate})};};
const id=n=>String(800000000000000000n+BigInt(n));
const raw=JSON.stringify({version:1,epoch:'olympus-full-release-clock-test',epochStart:E,grants:true,membership:id(100),native:Array.from({length:10},(_,i)=>id(101+i))});
function laneEnv(...args){return {GUILD_ID:id(1),DISCORD_APP_ID:id(2),DISCORD_BOT_TOKEN:'fixture',ROLE_GUILD_MEMBER:id(3),ROLE_GUILD_LEADER:id(4),ROLE_OFFICER:id(5),ROLE_RAID_LEADER:id(6),
 FULL_RELEASE_ROLES:raw,STAFF_TEN_RANK_ROLES:'true',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',...env(...args)};}
async function fixture(at,gate='true',status='queued'){
 H.clockState.now=at;const s=await H.freshEntry(M,{...env(gate),ROLE_GUILD_MEMBER:FRESH,ADMISSION_MODE:'auto'});await H.snapshot(s,1,7);
 await s.write('UPDATE characters SET guid=NULL,status=?,bound_at=? WHERE discord_id=?',status,E-86400,SUBJECT);return s;
}
async function reconcile(at,gate='true',status='queued'){
 const s=await fixture(at,gate,status),c=s.db.prepare(`SELECT c.*,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision
 FROM characters c LEFT JOIN privacy_subjects p ON p.subject_id=c.discord_id WHERE c.discord_id=?`).get(SUBJECT);
 const result=await M.roster.reconcileIdentities(s.env,[{name:'Actual Member',guid:GUID}],new Map([[c.name_key,c]]),{notices:{items:[]},fence:{snapshotId:1}});
 return {s,result,status:s.db.prepare('SELECT status FROM characters WHERE discord_id=?').get(SUBJECT).status};
}
(async()=>{
 for(const at of [E-1,E,E+1]){H.clockState.now=at;check('opt-in cutoff '+at+' returns '+(at<E?'baseline0':'original launch cutoff'),dbm.linksNotBefore(env())===(at<E?0:E));}
 H.clockState.now=E-1;
 for(const gate of ['absent','false'])check('legacy '+gate+' gate keeps the original future-cutoff semantics',dbm.linksNotBefore(env(gate))===E);
 for(const bad of ['',undefined,null,true,'TRUE','0'])check('invalid present gate '+String(bad)+' returns safe baseline0',dbm.linksNotBefore(env(bad))===0);
 {const e={...env(),LINKS_NOT_BEFORE:'2026-11-04'},dateCut=Date.UTC(2026,10,4)/1000;
  H.clockState.now=dateCut-1;check('the original date parser also waits until its exact UTC cutoff',dbm.linksNotBefore(e)===0);
  H.clockState.now=dateCut;check('at the date boundary the original parsed cutoff applies',dbm.linksNotBefore(e)===dateCut);}
 for(const name of [KEY,'LINKS_NOT_BEFORE']){let reads=0;const e=env();Object.defineProperty(e,name,{get(){reads++;throw Error('getter must not run');},enumerable:true});
  let cutoff;try{cutoff=dbm.linksNotBefore(e);}catch{cutoff=NaN;}
  check('opt-in accessor '+name+' is never invoked',cutoff===0&&reads===0);}
 {const e=Object.assign(Object.create({[KEY]:'true'}),{LINKS_NOT_BEFORE:String(E)});check('an inherited gate cannot activate a cutoff',dbm.linksNotBefore(e)===0);}
 {const e=Object.assign(Object.create({LINKS_NOT_BEFORE:String(E)}),{[KEY]:'true'});check('opt-in cutoff must be an own data property',dbm.linksNotBefore(e)===0);}
 for(const at of [E-1,E,E+1]){H.clockState.now=at;const c=F.captureLaneConfig(laneEnv());check('valid gated fresh/staff configuration retains the launch boundary at '+at,c.fresh==='grants'&&c.staff==='all'&&c.linksNotBefore===E&&F.laneClock(c,at).grants===(at>=E)&&F.laneClock(c,at).staff===(at>=E));}
 for(const bad of ['',undefined,null,true,'TRUE']){const c=F.captureLaneConfig(laneEnv(bad));check('invalid gate '+String(bad)+' holds both configured lanes',c.fresh==='held'&&c.staff==='held');}
 {const e=laneEnv(),c=F.captureLaneConfig(e);e[KEY]='false';check('changing the captured gate invalidates the original lane witness',!c.current());}
 for(const status of ['queued','verified'])for(const at of [E-1,E,E+1]){const expected=at<E?status:'unbound',r=await reconcile(at,'true',status);
  check('real unGUID '+status+' identity at '+at+' is '+expected,r.status===expected&&r.result.released.length===(at<E?0:1));}
 for(const gate of ['absent','false']){const r=await reconcile(E-1,gate);check('real identity legacy '+gate+' still applies a future cutoff immediately',r.status==='unbound'&&r.result.released.length===1);}
 for(const [at,expected] of [[E-1,'member'],[E,'queued'],[E+1,'queued']]){const s=await fixture(at),response=await M.ingest.postEvents(s.env,{events:[{type:'joined',name:'Actual Member',origin:'token',ok:true}]});
  const c=s.db.prepare('SELECT status FROM characters WHERE discord_id=?').get(SUBJECT),stale=s.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='invite.joined_stale_link'").get().n;
  check('real authoritative joined event at '+at+' is '+expected,response.status===200&&c.status===expected&&stale===(at<E?0:1));
  if(response.status!==200)console.log('join fixture response',response.status,await response.text());}
 {const s=await fixture(E-60,'true','verified');s.env.ROSTER_MIN_MEMBERS='0';H.clockState.now=E-1;
  const packet=s.db.prepare('SELECT name,rank,rank_index,guid FROM roster_members WHERE snapshot_id=1 ORDER BY rank_index').all().map(r=>({name:r.guid===GUID?'Actual Member':r.name,rank:r.rank,rankIndex:r.rank_index,guid:r.guid}));
  await M.roster.ingestRoster(s.env,E-1,packet,'addon');
  let c=s.db.prepare('SELECT status,guid FROM characters WHERE discord_id=?').get(SUBJECT);
  check('a real prelaunch roster export safely pins the existing verified link to its GUID',c.status==='member'&&c.guid===GUID&&s.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='roster.stale_link_released'").get().n===0);
  H.clockState.now=E+1;await M.roster.ingestRoster(s.env,E+1,packet,'addon');c=s.db.prepare('SELECT status,guid FROM characters WHERE discord_id=?').get(SUBJECT);
  check('after launch the matching pinned GUID survives the now-active cutoff',c.status==='member'&&c.guid===GUID&&s.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='roster.stale_link_released'").get().n===0);}
 console.log(`links_not_before_clock_gate_test: ${passed}/${passed+failed} passed`);H.restore();assert.equal(failed,0,'clock gate regressions');
})().catch(error=>{console.error(error);H.restore();process.exit(1);});
