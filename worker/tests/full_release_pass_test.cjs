// Fresh-role passes (Revision 4, stage 3): src/full-release-pass.ts over the real lane block (role-settlements.ts) and the
// real lane SQL (full-release-roles.ts), with native SQLite on the REAL schema.sql and a controlled clock. Only Discord is
// simulated; every ID is synthetic (the twelve are read from beta-reset-policy.ts and never used as a fixture). Covers the
// required stage-3 cases: departure latency behind a long history (major 1), M2 (a) and (b) through a pass (major 2), the
// Guild Master and Officer mains left out of one export (major 3), ban -> settled removal -> re-add -> removed again (M1,
// fresh member role and bot-given staff role), bounded windows and intervals (major 5), rename hold removes membership only,
// the highest-ranked character, plus gating, lease, held mode, cursor state and the ban deferral.
//   node tests/full_release_pass_test.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');globalThis.crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..'),cache={},schema=fs.readFileSync(path.join(root,'schema.sql'),'utf8');
let provider=async()=>{throw Error('provider calls forbidden before synthetic handler setup');};
globalThis.fetch=(...args)=>provider(...args);
function load(name){if(name==='node:async_hooks'||name==='./node:async_hooks')return require('node:async_hooks');name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;const js=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',js)(m,m.exports,p=>load(p));return m.exports;}
const R=load('role-settlements'),F=load('full-release-roles'),P=load('full-release-pass'),policy=load('beta-reset-policy'),LB=load('lane-budget');
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
const NATIVE=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const id=n=>String(800000000000000000n+BigInt(n));
const G=id(1),BOT=id(2),BOTROLE=id(3),OFF=id(4),OLD=id(5),GL=id(6),RL=id(8),BLOCKER=id(9),S=id(10),FM=id(100),N=Array.from({length:10},(_,i)=>id(101+i));
const TWELVE=policy.BETA_RESET_ROLE_IDS,E=1793833200,T=E+86400;
const cfgRaw=(o={})=>JSON.stringify({version:1,epoch:'olympus-full-release-test',epochStart:E,grants:true,membership:FM,native:N,...o});
let clock=T,db,env,cap,members,requests,log,results,memberHook,counter=null,positions={},posts=[];const bounds={passes:0,violations:[],failures:0,expectFailure:false};
const realNow=Date.now;Date.now=()=>clock*1000;
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
const inventory=()=>[{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,position:50,permissions:'268435456',managed:false},{id:FM,position:2,permissions:'0',managed:false},
 ...N.map((r,i)=>({id:r,position:3+i,permissions:'0',managed:false})),{id:GL,position:20,permissions:'1024',managed:false},{id:OFF,position:19,permissions:'1024',managed:false},
 {id:RL,position:18,permissions:'1024',managed:false},{id:BLOCKER,position:1,permissions:'0',managed:false},{id:OLD,position:1,permissions:'0',managed:false},{id:TWELVE[0],position:1,permissions:'0',managed:false}]
 .map(r=>positions[r.id]===undefined?r:{...r,position:positions[r.id]});
provider=async(input,init={})=>{const p=new URL(String(input)).pathname,method=init.method||'GET';requests.push(method+' '+p);
 if(p.endsWith('/users/@me'))return json({id:BOT});
 if(/^\/api\/v10\/channels\/\d+\/messages$/.test(p)&&method==='POST'){posts.push(JSON.parse(init.body).content);requests.pop();return json({id:'1'});} // the officer log line (uncounted, as .160)
 if(p.endsWith('/roles')&&method==='GET')return json(inventory());
 const m=p.match(/\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);if(!m||m[1]!==G)throw Error('unexpected provider path '+p);
 if(m[3]){const cur=members[m[2]]||[];members[m[2]]=method==='PUT'?[...new Set([...cur,m[3]])]:cur.filter(x=>x!==m[3]);return new Response(null,{status:204});}
 if(memberHook){const f=memberHook;memberHook=null;await f(m[2]);}
 if(!members[m[2]])return new Response('{}',{status:404});return json({user:{id:m[2]},roles:members[m[2]]});};
function d1(){function prepare(sql){let args=[];const q={sql,bind(...values){args=values;return q;},async first(){return q.exec().results[0]||null;},
 async all(){return {results:q.exec().results};},async run(){return q.exec();},
 exec(){log.push(sql);if(counter)counter.used++;const stmt=db.prepare(sql);if(/^\s*(SELECT|WITH)/.test(sql)||/RETURNING/.test(sql)){const rows=stmt.all(...args);results.push({sql,rows});return {results:rows,meta:{changes:0}};}
  const r=stmt.run(...args);return {results:[],meta:{changes:Number(r.changes)}};}};return q;}
 return {prepare,batch:async rows=>{db.exec('BEGIN');try{const out=rows.map(x=>x.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};}
const budget=(limit=40)=>({limit,attempts:0,calls:0,retries:0,exhausted:false,audited:false,inventoryFailed:false});
function reset(extra={}){clock=T;db=new DatabaseSync(':memory:');db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unsupported synthetic clock');return String(clock);});db.exec(schema);
 env={DB:d1(),GUILD_ID:G,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'fixture-only',ROLE_GUILD_MEMBER:OLD,ROLE_GUILD_LEADER:GL,ROLE_OFFICER:OFF,ROLE_RAID_LEADER:RL,BLOCKING_ROLE_IDS:BLOCKER,
  FULL_RELEASE_ROLES:cfgRaw(),STAFF_TEN_RANK_ROLES:'true',LINKS_NOT_BEFORE:String(E),ROSTER_MIN_MEMBERS:'3',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',...extra}; // P1-B: the supported staff configuration
 for(const [k,v] of Object.entries(env))if(v===undefined)delete env[k];
 cap=F.captureLaneConfig(env);members={[BOT]:[BOTROLE]};requests=[];log=[];results=[];memberHook=null;positions={};posts=[];P.forgetFreshPassThrottle();}
function character(key,discord,status,guid){db.prepare('INSERT OR IGNORE INTO members(discord_id) VALUES(?)').run(discord);db.prepare('INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?,?,?,?,?,?)').run(key,key,discord,status,T-90*86400,guid);}
function snapshot(rows,{fill=3,exported=clock-60}={}){const all=rows.concat(Array.from({length:fill},(_,i)=>({key:'filler'+i,guid:'Player-1-F'+i,rank:7})));
 const s=Number(db.prepare("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted) VALUES(?,?,'test',?,1,1)").run(exported,clock,all.length).lastInsertRowid);
 for(const r of all)db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)').run(s,r.key,r.key,NATIVE[r.rank],r.rank,r.guid);return s;}
function consume(discord,key,at=clock-500,ack=true){const p=Number(db.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,consumed_at,consumed_source) VALUES(?,?,?,?,?,?,'whisper')").run(discord,key,key,at-60,at+600,at).lastInsertRowid);
 if(ack)db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'watcher','verify.confirmed',?,?)").run(at+5,key,JSON.stringify({discordId:discord}));return p;}
const hex=()=>require('node:crypto').randomBytes(16).toString('hex');
function settle(o){const r={id:hex(),subject:S,purpose:'fresh_roster_membership',guild_id:G,role_id:FM,desired:1,state:'settled',reason:'fixture',attempts:1,created_at:clock-5000,expires_at:clock-4700,claim_nonce:hex(),
  subject_generation:null,request_digest:null,roster_id:null,native_guid:null,native_profile:null,native_rank:null,native_rank_name:null,checked_at:null,...o};
 db.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id,r.subject,r.purpose,r.guild_id,r.role_id,r.desired,r.state,r.reason,r.attempts,r.created_at,r.expires_at,r.claim_nonce,r.subject_generation,r.request_digest,r.roster_id,r.native_guid,r.native_profile,r.native_rank,r.native_rank_name,r.checked_at);return r;}
const row=rid=>db.prepare('SELECT * FROM role_settlements WHERE id=?').get(rid);
const count=(where='1=1')=>db.prepare('SELECT COUNT(*) AS n FROM role_settlements WHERE '+where).get().n;
const effects=()=>requests.filter(r=>/^(PUT|DELETE) /.test(r));
const path_=(m,s,r)=>m+' /api/v10/guilds/'+G+'/members/'+s+'/roles/'+r;
const auditRows=action=>db.prepare('SELECT * FROM audit WHERE action=? ORDER BY id').all(action);
const newestState=()=>{const r=db.prepare(F.FRESH_STATE_SELECT).get();return r?JSON.parse(r.details):null;};
const facts=(guid,rank,roster=null)=>({native_guid:guid,native_profile:'ten-rank',native_rank:rank,native_rank_name:NATIVE[rank],roster_id:roster});
// Every completed pass without a caller Admission is checked against its own reservation: the statements it ran never exceed
// the bounds it admitted (FRESH_*_STATEMENTS) plus the close reserve. This pins the worst-case constants on every scenario.
async function pass(trigger='watcher',calls=budget(40),adm){P.forgetFreshPassThrottle();const before=log.length,reqs=requests.length;
 const r=await P.runFreshPass(env,{calls,adm},trigger,cap),statements=log.length-before;
 if(r.counts.failed&&!bounds.expectFailure||r.state==='failed'&&!bounds.expectFailure)bounds.failures++;
 if(r.state==='done'&&!adm){bounds.passes++;if(statements>r.counts.statements+P.FRESH_CLOSE_STATEMENTS||r.counts.statements>P.FRESH_SWEEP_STATEMENTS)bounds.violations.push({statements,reserved:r.counts.statements});}
 return {...r,statements,requests:requests.length-reqs,calls};}
function seedState(o){db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','role.fresh_state','watcher',?)").run(clock-4000,JSON.stringify({r:'',d:'',g:'',s:'',p:'',k:0,h:0,...o}));}
const privacy=(subject,generation=hex(),state='active')=>{db.prepare('INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,?,0,?,?)').run(subject,generation,state,clock-9000,clock-9000);return generation;};
(async()=>{
 const D=await F.laneDigest(cfgRaw());
 // --- gating: unconfigured, before the epoch, held configuration
 {reset();const none=F.captureLaneConfig({...env,FULL_RELEASE_ROLES:'',STAFF_TEN_RANK_ROLES:undefined});
  const r=await P.runFreshPass(env,{calls:budget()},'watcher',none);
  check('unconfigured (both variables absent or ""): the pass returns at once with no statement and no request',r.state==='skipped'&&r.reason==='not_configured'&&log.length===0&&requests.length===0);
  clock=E-60;const early=await pass();check('before the epoch (configured): the clock gate costs no D1 statement and no request',early.reason==='clock_gate'&&early.statements===0&&early.requests===0);}
 {reset({FULL_RELEASE_ROLES:'{"version":1}',STAFF_TEN_RANK_ROLES:undefined});clock=E-3600;
  const r=await pass();const heldAudit=auditRows('role.fresh_config_held');
  check('held configuration (invalid present value): audited even before the epoch, one role.fresh_config_held, no lease, no request',r.state==='held'&&heldAudit.length===1&&requests.length===0
   &&!/\d{17,20}/.test(heldAudit[0].details)&&db.prepare("SELECT COUNT(*) AS n FROM site_settings").get().n===0);
  const t2=await P.runFreshPass(env,{calls:budget()},'watcher',cap);check('the in-isolate throttle turns the next watcher poll away with no D1 at all',t2.reason==='throttled');
  clock+=120;const again=await pass();check('within FRESH_INTERVAL_SECONDS the interval read (the only statement) holds the next held pass: no second audit',again.reason==='interval'&&again.statements===1&&auditRows('role.fresh_config_held').length===1);
  const ingest=await pass('ingest');check('held mode throttles the ingest trigger too',ingest.reason==='interval'&&auditRows('role.fresh_config_held').length===1);
  clock+=300;await pass();check('after the interval it is audited again (once per interval)',auditRows('role.fresh_config_held').length===2);}
 // --- the highest-ranked verified live character gives the rank (owner round 3); Officer staff role in the same pass
 {reset();character('mainchar',S,'member','Player-1-M');character('altchar',S,'member','Player-1-O');
  snapshot([{key:'mainchar',guid:'Player-1-M',rank:7},{key:'altchar',guid:'Player-1-O',rank:2}]);consume(S,'mainchar',clock-900);consume(S,'altchar',clock-800);members[S]=[];
  const r=await pass();
  check('grant debt: membership and the Officer rank role of the highest-ranked character (not Member); staff gives Officer',r.state==='done'
   &&effects().includes(path_('PUT',S,FM))&&effects().includes(path_('PUT',S,N[2]))&&!effects().includes(path_('PUT',S,N[7]))&&effects().includes(path_('PUT',S,OFF))&&effects().length===3);
  check('grant receipts are effect_and_current_server_confirmed and carry the Officer character facts',count(`purpose='fresh_roster_rank' AND role_id='${N[2]}' AND state='settled' AND native_guid='Player-1-O' AND native_rank=2`)===1
   &&count(`purpose='fresh_roster_membership' AND state='settled' AND reason='effect_and_current_server_confirmed'`)===1&&count(`purpose='staff_roster_rank' AND role_id='${OFF}' AND state='settled' AND attempts=1`)===1);
  check('one shared allowance: grant visit 1 screen + 4 inventory + 2x(PUT+GET), staff 4 + PUT + GET, presence 1 screen',r.requests===16&&r.calls.attempts===16);
  const st=newestState();check('role.fresh_state holds the cursors, parity and watermark; it references only visited active-or-Discord-only subjects',st&&st.k===1&&typeof st.h==='number'
   &&Array.isArray(st._privacySubjectIds)&&st._privacySubjectIds.every(x=>x===S));
  clock+=301;snapshot([{key:'mainchar',guid:'Player-1-M',rank:7},{key:'altchar',guid:'Player-1-O',rank:2}]);requests=[];const steady=await pass();
  check('steady state: nothing to grant costs no effect (satisfied subjects are not selected; presence screens only)',steady.state==='done'&&effects().length===0&&steady.requests<=2);}
 // --- major 3: a Guild Master main left out of one eligible export keeps Guild Leader and the GM rank role
 const omittedWorld=(mainRank,staffRole)=>{reset();character('main',S,'member','Player-1-M');character('alt',S,'member','Player-1-L');
  snapshot([{key:'main',guid:'Player-1-M',rank:mainRank},{key:'alt',guid:'Player-1-L',rank:8}],{fill:50,exported:clock-3000});consume(S,'main',clock-2900);consume(S,'alt',clock-2800);
  settle({purpose:'fresh_roster_membership',role_id:FM,request_digest:D,...facts('Player-1-M',mainRank)});
  settle({purpose:'fresh_roster_rank',role_id:N[mainRank],request_digest:D,...facts('Player-1-M',mainRank)});
  settle({purpose:'staff_roster_rank',role_id:staffRole,request_digest:null,...facts('Player-1-M',mainRank)});
  members[S]=[FM,N[mainRank],staffRole];return snapshot([{key:'alt',guid:'Player-1-L',rank:8}],{fill:50});};
 {omittedWorld(0,GL);const r=await pass();
  check('GM main omitted once: the pass visits the account but plans no desired=0 row and sends no DELETE; Guild Leader and the GM rank role stay',r.state==='done'&&r.counts.visits>=1
   &&count('desired=0')===0&&effects().length===0&&members[S].includes(GL)&&members[S].includes(N[0])&&members[S].includes(FM));
  check('and no replacement rank grant (grant-only visit): the member never holds two fresh rank roles',count(`role_id='${N[8]}'`)===0&&!members[S].includes(N[8]));}
 {omittedWorld(2,OFF);const r=await pass();
  check('Officer main absent once: Officer stays (no staff desired=0 row, no request on Officer)',r.state==='done'&&count(`purpose='staff_roster_rank' AND desired=0`)===0
   &&!requests.some(q=>q.endsWith('/roles/'+OFF))&&members[S].includes(OFF));
  clock+=301;snapshot([{key:'main',guid:'Player-1-M',rank:7},{key:'alt',guid:'Player-1-L',rank:8}],{fill:50});requests=[];
  const back=await pass();
  check('positive control: the main listed again as Member authorizes removing the bot-given Officer and the Officer rank role',back.state==='done'
   &&effects().includes(path_('DELETE',S,OFF))&&effects().includes(path_('DELETE',S,N[2]))&&!members[S].includes(OFF)&&count(`purpose='staff_roster_rank' AND desired=0 AND state='settled'`)===1);}
 // --- M1: ban -> removal settled -> role re-added -> the next rotation removes it again (fresh member role and bot-given staff role)
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);
  settle({purpose:'staff_roster_rank',role_id:OFF,request_digest:null,...facts('Player-1-A',2)});
  members[S]=[FM,N[7],OFF,RL];
  const r=await pass();
  check('ban rotation: one screen, one inventory, DELETE membership, rank and the bot-given Officer, one confirming GET',r.requests===9
   &&effects().join()===[path_('DELETE',S,FM),path_('DELETE',S,N[7]),path_('DELETE',S,OFF)].join()&&members[S].join()===RL);
  check('the removal rows settled removed; the hand-given Raid Leader is never planned',count(`purpose='fresh_removal_ban' AND state='settled' AND reason='removed'`)===2
   &&count(`purpose='staff_removal_ban' AND state='settled' AND reason='removed'`)===1&&count(`role_id='${RL}'`)===0);
  check('the rotation cursor wrapped (one banned account)',newestState().r==='');
  members[S]=[FM,OFF,RL];clock+=301;requests=[];
  const again=await pass();
  check('MEE6 re-adds them: the next rotation writes NEW rows and removes both again (Officer too, while the ban stands)',again.state==='done'&&effects().join()===[path_('DELETE',S,FM),path_('DELETE',S,OFF)].join()
   &&count(`purpose='fresh_removal_ban' AND role_id='${FM}' AND state='settled' AND reason='removed'`)===2&&count(`purpose='staff_removal_ban' AND role_id='${OFF}' AND state='settled' AND reason='removed'`)===2&&members[S].join()===RL);
  clock+=301;requests=[];const quiet=await pass();
  check('steady state for a banned account with nothing present: exactly one screen GET',quiet.requests===1&&effects().length===0);
  env.CHANNEL_SERVER_LOG=id(77);members[S]=[FM,RL];clock+=301;await pass();
  check('one aggregated officer line per pass, counts only: no mention and no Discord ID',posts.length===1&&/1 removed/.test(posts[0])&&!/\d{17,20}|<@/.test(posts[0]));}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);
  settle({purpose:'staff_roster_rank',role_id:OFF,request_digest:null,...facts('Player-1-A',2)});members[S]=[FM,OFF];
  const parent={...budget(40),limit:Math.max(0,cap.callLimit-F.LEGACY_BAN_ALLOWANCE)},logBefore=log.length,r=await P.settleLaneBan(env,S,cap,parent);
  check('settleLaneBan: no screen, one inventory, two DELETEs and one GET (7 of the 24 left after the legacy 16)',r.state==='settled'&&r.removed===2&&r.attempts===7&&parent.attempts===7&&parent.limit===24&&members[S].length===0);
  check('settleLaneBan statements stay within FRESH_BAN_STATEMENTS',log.length-logBefore<=P.FRESH_BAN_STATEMENTS&&log.length-logBefore>0);
  db.prepare('UPDATE members SET banned=0 WHERE discord_id=?').run(S);members[S]=[FM];requests=[];
  const unbanned=await P.settleLaneBan(env,S,cap,{...budget(40),limit:24});check('an unban before the deferral runs: no request, no row',unbanned.reason==='removal_cause_withdrawn'&&requests.length===0);}
 // --- rename hold removes the membership role only
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);
  db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at) VALUES(?,'alpha','alphb','alpha','n1','reapply',?,?)").run(S,id(99),clock-100);
  members[S]=[FM,N[7]];const r=await pass();
  check('rename hold: the rotation removes the fresh membership role only; the rank role stays',r.state==='done'&&effects().join()===path_('DELETE',S,FM)&&members[S].join()===N[7]
   &&count(`purpose='fresh_removal_rename_hold' AND role_id='${FM}' AND state='settled'`)===1&&count(`purpose LIKE 'fresh_removal%' AND role_id='${N[7]}'`)===0);}
 // --- M2 through a pass (major 2): (a) membership settled, rank unknown-but-present; (b) both unknown-but-present
 const grantWorld=()=>{reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');return snap;};
 {const snap=grantWorld();settle({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)});
  const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,request_digest:D,...facts('Player-1-A',7,snap)});
  members[S]=[FM,N[7]];seedState({g:S}); // grant debt starts after S, so the presence walk is the path under test
  const r=await pass();
  check('(a) the presence walk selects the spent rank although every role is present; its lost PUT stays unknown and is stamped',r.state==='done'
   &&row(k.id).state==='unknown'&&row(k.id).reason==='provider_outcome_unknown'&&row(k.id).checked_at===clock&&row(k.id).attempts===1&&effects().length===0);
  check('(a) cost: one inventory read (4 GETs) and nothing else; the reader is GET-free',r.requests===4);}
 {const snap=grantWorld();
  const m=settle({role_id:FM,state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,request_digest:D,...facts('Player-1-A',7,snap)});
  const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'dispatching',reason:'admitted_before_effect',created_at:clock-400,expires_at:clock-100,request_digest:D,...facts('Player-1-A',7,snap)});
  members[S]=[FM,N[7]];const r=await pass();
  check('(b) both unknown-but-present: the pass stamps both but preserves each exact state, reason and nonce',r.state==='done'
   &&[m,k].every(x=>row(x.id).state===x.state&&row(x.id).reason===x.reason&&row(x.id).claim_nonce===x.claim_nonce&&row(x.id).checked_at===clock)&&effects().length===0);
  clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);requests=[];await pass();
  check('afterwards uncertain targets back off: no grant visit or effect, both original spent rows remain',effects().length===0&&[m,k].every(x=>row(x.id).state===x.state&&row(x.id).checked_at===T));}
 {const snap=grantWorld();const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,request_digest:D,...facts('Player-1-A',7,snap)});
  settle({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)});members[S]=[FM];const r=await pass();
  check('absent while current stays unknown and is stamped; the walks skip it for FRESH_BACKOFF_SECONDS (no time bound claimed)',row(k.id).state==='unknown'&&row(k.id).checked_at===clock&&effects().length===0);
  clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);requests=[];await pass();
  check('within the backoff the stamped row costs no inventory read',!requests.some(q=>q.endsWith('/roles')));}
 // --- major 1: departure latency behind a long history; custody term; nothing owed costs nothing
 {reset();const HIST=200;
  for(let i=0;i<HIST;i++){const h=id(3000+i);character('gone'+i,h,'left','Player-2-'+i);
   settle({subject:h,role_id:FM,request_digest:D,created_at:clock-90000,expires_at:clock-89700,...facts('Player-2-'+i,7)});
   settle({subject:h,purpose:'fresh_removal_departure',role_id:FM,desired:0,reason:'removed',created_at:clock-80000,expires_at:clock-79700});
   db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.left',?,?)").run(clock-80000,'gone'+i,JSON.stringify({discordId:h,how:'fixture'}));}
  const Z=id(9000);character('zed',Z,'member','Player-1-Z');snapshot([{key:'zed',guid:'Player-1-Z',rank:7}]);
  settle({subject:Z,role_id:FM,request_digest:D,...facts('Player-1-Z',7)});settle({subject:Z,purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-Z',7)});
  settle({subject:Z,purpose:'staff_roster_rank',role_id:RL,request_digest:null,...facts('Player-1-Z',4)});
  members[Z]=[FM,N[7],RL,OFF];
  const first=await pass();
  check('history of 200 departures with closed custody: one pass reads one window per walk, selects none of them and sends nothing',first.state==='done'&&first.requests===0
   &&results.filter(x=>x.rows[0]&&'window_size' in x.rows[0]).every(x=>x.rows[0].window_size<=F.FRESH_WALK_WINDOW));
  db.prepare("UPDATE characters SET status='left',left_at=? WHERE name_key='zed'").run(clock);
  db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.left','zed',?)").run(clock,JSON.stringify({discordId:Z,how:'in game',keptRoles:[]}));
  clock+=301;requests=[];results=[];
  const second=await pass();
  check('the new departure (sorted after all 200) is removed within ONE pass: membership, rank and the bot-given Raid Leader DELETEd',second.state==='done'
   &&effects().join()===[path_('DELETE',Z,FM),path_('DELETE',Z,N[7]),path_('DELETE',Z,RL)].join()&&count(`subject='${Z}' AND purpose='fresh_removal_departure' AND state='settled' AND reason='removed'`)===2
   &&count(`subject='${Z}' AND purpose='staff_removal_departure' AND state='settled' AND reason='removed'`)===1);
  check('the hand-given Officer is never touched on leave (no custody)',members[Z].join()===OFF&&count(`subject='${Z}' AND role_id='${OFF}'`)===0);
  check('cost: one inventory, three DELETEs, one confirming GET; the plan came from custody only',second.requests===8);
  const st=newestState();check('the departure watermark h is an audit id past the event; the window cursor did not need to reach the subject',typeof st.h==='number'&&st.h>=db.prepare("SELECT MAX(id) AS m FROM audit WHERE action='roster.left'").get().m&&st.d<Z);
  const eqp=db.prepare('EXPLAIN QUERY PLAN '+P.FRESH_DEPARTURE_EVENTS_SELECT).all(0,4).map(x=>x.detail).join(' | ');
  check('the departure events are index seeks on audit_actor_action past the watermark (bounded rows)',/SEARCH audit USING (COVERING )?INDEX audit_actor_action \(actor=\? AND action=\? AND rowid>\?\)/.test(eqp)&&!/SCAN audit/.test(eqp));
  clock+=301;requests=[];const third=await pass();check('the next pass owes nothing: no request',third.requests===0);}
 {reset();const Z=id(9000);character('zed',Z,'unbound',null);snapshot([]);settle({subject:Z,role_id:FM,request_digest:D,...facts('Player-1-Z',7)});members[Z]=[FM];
  const r=await pass();
  check('a departure without an event (an unbind) is found by the window walk: custody, no live character, removed',r.state==='done'&&effects().join()===path_('DELETE',Z,FM));}
 {reset();character('alt',S,'member','Player-1-L');character('main',S,'left','Player-1-M');snapshot([{key:'alt',guid:'Player-1-L',rank:8}],{exported:clock-3000});
  settle({role_id:FM,request_digest:D,...facts('Player-1-M',7)});members[S]=[FM];
  db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.left','main',?)").run(clock-10,JSON.stringify({discordId:S}));
  seedState({h:0});clock+=10;snapshot([],{fill:3});requests=[];const r=await pass();
  check('a live alt keeps the roles: the event is checked in SQL (prefilter or cause false) and costs no request',r.state==='done'&&effects().length===0&&members[S].join()===FM&&count('desired=0')===0);}
 // --- major 5: bounded windows per walk, the ingest interval, statement admission
 {reset();const M=300;
  for(let i=0;i<M;i++){const s=id(20000+i);character('m'+i,s,'member','Player-3-'+i);settle({subject:s,purpose:'fresh_roster_membership',role_id:FM,state:'held',reason:'expired_without_dispatch',attempts:0,request_digest:D,...facts('Player-3-'+i,7)});}
  for(let i=0;i<5;i++){const b=id(19000+i);db.prepare('INSERT INTO members(discord_id,banned) VALUES(?,1)').run(b);}
  snapshot(Array.from({length:M},(_,i)=>({key:'m'+i,guid:'Player-3-'+i,rank:7})),{fill:0});
  const r=await pass();const walks=results.filter(x=>x.rows[0]&&'window_size' in x.rows[0]);
  check('every walk reads at most one fixed window of FRESH_WALK_WINDOW candidates per pass',walks.length>=4&&walks.every(x=>x.rows[0].window_size<=F.FRESH_WALK_WINDOW));
  check('the rotation reads at most FRESH_CAUSE_ROTATION_PER_PASS accounts, each one screen GET',results.filter(x=>x.sql===F.causeRotationSelectSql(true)).every(x=>x.rows.length<=F.FRESH_CAUSE_ROTATION_PER_PASS)&&r.requests===3);
  const st=newestState();check('window cursors advance to window_end; the rotation cursor stops at the third banned account',st.g===id(20049)&&st.p===id(20049)&&st.r===id(19002));
  check('the pass reserved every statement it ran (bounds admitted >= statements run - close) within FRESH_SWEEP_STATEMENTS',r.statements<=r.counts.statements+P.FRESH_CLOSE_STATEMENTS&&r.counts.statements<=P.FRESH_SWEEP_STATEMENTS);
  check('the measured pass is far below the admission limit',r.statements<=80&&r.statements<P.FRESH_SWEEP_STATEMENTS);
  clock+=60;const before=log.length;const same=await pass('ingest');
  check('ingest trigger within 300 s on the same newest snapshot: two reads (interval, newest snapshot), no write',same.reason==='interval'&&log.length-before===2);
  snapshot(Array.from({length:M},(_,i)=>({key:'m'+i,guid:'Player-3-'+i,rank:7})),{fill:0});const changed=await pass('ingest');
  check('a changed export runs the ingest pass at once (major 5 exception)',changed.state==='done');
  clock+=30;const watcher=await pass('watcher');check('the watcher trigger stays throttled by the interval',watcher.reason==='interval');
  clock+=400;const count0={used:0},tight=await pass('ingest',budget(40),{count:count0,limit:F.FRESH_INTERVAL_SECONDS-290});
  check('a caller admission too small for the pass open holds it before any statement',tight.state==='held'&&tight.reason==='statement_budget'&&tight.statements===0);}
 // --- lease, cursor state, references, the tick fallback, failure audit
 {reset();db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)").run(F.FRESH_LEASE_KEY,F.freshLeaseValue(clock+200,'other'),clock,'system:fresh-roles');
  const r=await pass();check('a lease held by another pass: skipped, nothing written, no request',r.reason==='lease_held'&&requests.length===0&&auditRows('role.fresh_state').length===0);
  clock+=301;const r2=await pass();const lease=db.prepare('SELECT value FROM site_settings WHERE key=?').get(F.FRESH_LEASE_KEY).value;
  check('after expiry the next pass takes the lease, runs and releases it; the stored value never names a Discord ID',r2.state==='done'&&lease==='{"leaseUntil":0}'&&!/\d{17,20}/.test(lease));}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);privacy(S);members[S]=[];
  memberHook=()=>{db.prepare('UPDATE privacy_subjects SET generation=? WHERE subject_id=?').run(hex(),S);};
  const r=await pass();const ticks=auditRows('role.fresh_tick');
  check('a referenced subject whose generation changed refuses role.fresh_state; a reference-free tick keeps the cursors',r.state==='done'&&auditRows('role.fresh_state').length===0&&ticks.length===1
   &&JSON.parse(ticks[0].details).r===''&&!('_privacySubjectIds' in JSON.parse(ticks[0].details)));
  check('the interval read and the state read accept the tick',db.prepare(F.FRESH_INTERVAL_SELECT).get().action==='role.fresh_tick'&&newestState().k===1);}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);privacy(S,hex(),'retiring');members[S]=[FM];
  const r=await pass();const st=auditRows('role.fresh_state')[0];
  check('a non-active privacy subject is skipped, never referenced, and the rotation cursor passes it (roles.ts:311)',r.state==='done'&&requests.length===0&&st&&!/_privacySubjectIds/.test(st.details)&&JSON.parse(st.details).r==='');}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');members[S]=[];
  bounds.expectFailure=true;const orig=env.DB;let n=0;env={...env,DB:{prepare:sql=>{if(/role_settlements/.test(sql)&&++n===3)throw Error('synthetic D1 failure for '+S);return orig.prepare(sql);},batch:orig.batch}};
  const r=await pass();const failedRows=auditRows('role.fresh_failed');
  check('a visit that throws is counted and passed; the pass still closes and releases its lease',r.state==='done'&&r.counts.failed>=1&&failedRows.length===0
   &&db.prepare('SELECT value FROM site_settings WHERE key=?').get(F.FRESH_LEASE_KEY).value==='{"leaseUntil":0}');
  env={...env,DB:{prepare:sql=>{if(sql===F.FRESH_STATE_SELECT)throw Error('synthetic state read failure '+S);return orig.prepare(sql);},batch:orig.batch}};clock+=301;
  const f=await pass();const fr=auditRows('role.fresh_failed');
  check('a pass-level failure writes role.fresh_failed with no Discord ID and still releases the lease',f.state==='failed'&&fr.length===1&&!/\d{17,20}/.test(fr[0].details)
   &&db.prepare('SELECT value FROM site_settings WHERE key=?').get(F.FRESH_LEASE_KEY).value==='{"leaseUntil":0}');env.DB=orig;bounds.expectFailure=false;}
 // --- shared allowance: the pass never overdraws the /queue parent the legacy sweep already used
 {const snap=grantWorld();members[S]=[];const parent=budget(40);parent.attempts=33;parent.exhausted=true;
  const r=await pass('watcher',parent);
  check('after the legacy sweep set exhausted, admission reads limit - attempts: a grant subject (entry 9) waits, nothing overdrawn',r.state==='done'&&parent.attempts===33&&effects().length===0&&count()===0);
  clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);const p2=budget(40);p2.attempts=31;await pass('watcher',p2);
  check('with 9 left the grant subject enters: 1 screen + 4 inventory + PUT/GET membership; the rank (needs 4 left) waits pending; presence screens with the last',p2.attempts===39&&effects().join()===path_('PUT',S,FM)
   &&count(`purpose='fresh_roster_rank' AND state='pending' AND attempts=0`)===1&&newestState().g===''&&snap>0);
  clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);requests=[];await pass('watcher',budget(40));
  check('the request stop kept the grant cursor: the next pass resumes the subject and grants the rank (the expired row disposed, a new one claimed)',effects().join()===path_('PUT',S,N[7])
   &&count(`purpose='fresh_roster_rank' AND state='held' AND reason='expired_without_dispatch'`)===1&&count(`purpose='fresh_roster_rank' AND state='settled'`)===1);}
 // --- hierarchy hold: the never-dispatched row is marked and the subject backs off (grant debt AND presence) until the export changes or an hour
 {grantWorld();members[S]=[];positions[N[7]]=60;
  const r=await pass();const marked=db.prepare(`SELECT * FROM role_settlements WHERE role_id='${N[7]}'`).get();
  check('a rank role at or above the bot: membership granted, the rank row marked lane_qualify_held with no PUT',r.state==='done'&&effects().join()===path_('PUT',S,FM)
   &&marked.state==='held'&&marked.reason==='lane_qualify_held'&&marked.attempts===0);
  clock+=301;requests=[];const again=await pass();
  check('identical export inside FRESH_BACKOFF_SECONDS: grant debt skips the subject and presence does not re-plan it (one screen at most, no row)',again.state==='done'
   &&again.requests<=1&&effects().length===0&&count(`role_id='${N[7]}'`)===1);
  positions[N[7]]=9;clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);requests=[];await pass();
  check('a changed export after the hierarchy fix grants the rank (LANE_RANK_ORDER is not blocked by the marker)',effects().join()===path_('PUT',S,N[7])&&members[S].includes(N[7]));}
 // --- a blocking role: membership removed, the blocking row keys the backoff
 {const snap=grantWorld();settle({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)});members[S]=[FM,BLOCKER];
  const r=await pass();const blk=db.prepare("SELECT * FROM role_settlements WHERE purpose='fresh_removal_blocking_role'").get();
  check('a blocker on the member: grant debt removes the fresh membership role (re-read right before the claim), no grant',r.state==='done'&&effects().join()===path_('DELETE',S,FM)
   &&blk.state==='settled'&&blk.reason==='removed'&&blk.roster_id===snap&&r.requests===8&&count('desired=1 AND attempts=0')===0);
  clock+=301;requests=[];const again=await pass();
  check('the next pass on the same export backs off: no request for the blocked subject',again.state==='done'&&again.requests===0);}
 // --- the captured configuration changing mid-pass stops every later visit; nothing is removed on the changed authority
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);members[S]=[FM];
  memberHook=()=>{env.STAFF_TEN_RANK_ROLES='raid-leader';};const r=await pass();
  check('configuration changed during the screen read: no DELETE, no row, the pass stops and records why',r.state==='done'&&effects().length===0&&count()===0&&newestState().stop==='lane_configuration_changed');}
 // --- a never-live beta officer keeps the bot-given beta Officer on leave (EVER_LIVE); the event costs no request
 {reset();const B=id(9100);character('betaoff',B,'left','Player-0-B');snapshot([]);
  settle({subject:B,purpose:'roster_privileged_rank',role_id:OFF,request_digest:null,native_guid:null,native_profile:'beta-five',native_rank:1,native_rank_name:'Officer'});members[B]=[OFF];
  seedState({h:0});db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.left','betaoff',?)").run(clock-10,JSON.stringify({discordId:B}));
  const r=await pass();check('never seen on a live roster: no departure visit, no request, Officer kept',r.state==='done'&&r.requests===0&&members[B].join()===OFF&&count('desired=0')===0);}
 // --- Q3 at pass level: a consumption whose reply was lost (no acknowledgement) never links; a new acknowledged code does
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha',clock-900,false);members[S]=[];
  const r=await pass();check('lost reply (no ack): the subject is not selected and nothing is granted',r.state==='done'&&count()===0&&effects().length===0);
  consume(S,'alpha',clock-200,true);clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);await pass();
  check('a new acknowledged code: membership and rank granted on the next pass',effects().join()===[path_('PUT',S,FM),path_('PUT',S,N[7])].join());}
 // --- link missing: the selection superset differs from PRIMARY_PICK (a duplicated GUID); audited once with a privacy reference
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7},{key:'alphb',guid:'Player-1-A',rank:7}]);consume(S,'alpha');members[S]=[];
  const r=await pass();const lm=auditRows('role.fresh_link_missing');
  check('no exact pick: no row, no grant; one role.fresh_link_missing referencing the subject, no ID in its own details',r.counts.linkMissing===1&&count()===0&&effects().length===0
   &&lm.length===1&&JSON.parse(lm[0].details)._privacySubjectIds.join()===S&&!/\d{17,20}/.test(JSON.stringify({...JSON.parse(lm[0].details),_privacySubjectIds:[]})));}
 // --- P1-A (Codex 23:18 UTC): a spent ten-rank old-purpose staff row is only stamped by the staff walk, never handed to .160
 // settleRoleIntent(reconcileOnly), whose stale absence (:275-278) held it past_effect_absent; beta-five rows are never read
 const SETTLE_ROLE_INTENT_FACTS='SELECT r.*,(SELECT beta_window_id FROM verification_proofs p WHERE p.id=r.proof_id) AS beta_window_id FROM role_settlements r WHERE r.id=?1';
 const RECONCILE_REMOVAL_FACTS='SELECT * FROM role_settlements WHERE id=?1';
 {reset();character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:7}]); // demoted: the old intent is no longer current
  const old=settle({purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,...facts('Player-1-O',2,1)});
  const beta=settle({subject:id(11),purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,native_guid:'Player-0-X',native_profile:'beta-five',native_rank:1,native_rank_name:'Officer'});
  character('betax',id(11),'member','Player-0-X');members[S]=[];members[id(11)]=[OFF];
  const r=await pass();
  check('P1-A: the ten-rank spent row is selected by staff walk (c) and only stamped from the visit\'s one inventory: it stays unknown, no settleRoleIntent, no effect',
   r.state==='done'&&row(old.id).state==='unknown'&&row(old.id).reason==='provider_outcome_unknown'&&row(old.id).checked_at===clock&&effects().length===0&&r.requests===4
   &&!log.includes(SETTLE_ROLE_INTENT_FACTS)&&!log.includes(RECONCILE_REMOVAL_FACTS));
  check('the beta-five spent row is never read by the lane (no request names its subject)',row(beta.id).state==='unknown'&&!requests.some(q=>q.includes('/members/'+id(11))));}
 {reset();character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);
  const old=settle({purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,...facts('Player-1-O',2,1)});
  members[S]=[];const r=await pass();
  check('absent while still current: .160 semantics keep it unknown; the lane stamps checked_at only',r.state==='done'&&row(old.id).state==='unknown'&&row(old.id).reason==='provider_outcome_unknown'&&row(old.id).checked_at===clock);
  clock+=301;snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);requests=[];const again=await pass();
  check('the stamped row is not re-read every wrap (no request within FRESH_BACKOFF_SECONDS)',again.requests===0);}
 // P1-A: with QR_RANK_MAPPING_ENABLED "true" .160 settleRoleIntent passes its feature gate and its compensation branch (:249) would
 // close a lost compensation DELETE through reconcileRemovalReceipt (child settled absent, parent held). The staff walk never goes there.
 {reset({QR_RANK_MAPPING_ENABLED:'true'});character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:7}]);
  const parent=settle({purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',reason:'compensation_unknown',created_at:clock-400,expires_at:clock-100,...facts('Player-1-O',2,1)});
  const child=settle({purpose:'grant_compensation',role_id:OFF,desired:0,state:'unknown',reason:'compensation_unknown',created_at:clock-400,expires_at:clock-100,request_digest:parent.id});
  members[S]=[];const r=await pass();
  check('P1-A: an old-purpose staff PUT with a lost compensation DELETE (role absent) is never discharged: parent and child stay unknown, only the parent is stamped',
   r.state==='done'&&row(parent.id).state==='unknown'&&row(parent.id).checked_at===clock&&row(child.id).state==='unknown'&&row(child.id).reason==='compensation_unknown'
   &&count("reason IN('absent','past_effect_absent','removed_after_admission_changed')")===0&&effects().length===0
   &&!log.includes(SETTLE_ROLE_INTENT_FACTS)&&!log.includes(RECONCILE_REMOVAL_FACTS));
  check('P1-A: the Officer target stays fenced for the lane while that DELETE is unresolved',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,OFF,'x').ok===0);}
 // --- P1-B (Codex 22:44 UTC): QR_PRIVILEGED_RANK_MAPPING_ENABLED "true" keeps the legacy staff producer reachable, so the staff
 // lane holds (audited) and writes, reads and sends nothing on the staff IDs; the fresh lane runs on, and the staff walk (with its
 // old-row handling) never runs, so .160 stale absence is unreachable from the lane in the one configuration where it could act
 {reset({QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true'});character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');members[S]=[];
  const old=settle({subject:id(12),purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,...facts('Player-1-X',2,1)});
  character('demoted',id(12),'member','Player-1-X');members[id(12)]=[];
  const r=await pass(),held=auditRows('role.fresh_config_held');
  check('P1-B: the staff lane is held legacy_privileged_producer_reachable and audited once; the fresh lane still grants membership and the Officer rank role',cap.staff==='held'
   &&cap.staffReason==='legacy_privileged_producer_reachable'&&held.length===1&&/legacy_privileged_producer_reachable/.test(held[0].details)
   &&r.state==='done'&&effects().join()===[path_('PUT',S,FM),path_('PUT',S,N[2])].join());
  check('P1-B: no lane row and no request names a staff role ID; the spent old-purpose staff row is not read, stamped or settled',count(`role_id IN('${GL}','${OFF}','${RL}') AND id<>'${old.id}'`)===0
   &&!requests.some(q=>[GL,OFF,RL].some(x=>q.endsWith('/roles/'+x))||q.includes('/members/'+id(12)))&&row(old.id).state==='unknown'&&row(old.id).checked_at===null
   &&!log.includes(SETTLE_ROLE_INTENT_FACTS));}
 // --- P1-B, the legacy-then-lane ordering in the supported configuration: an unresolved legacy Officer PUT fences the lane
 {reset();character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');members[S]=[];
  const legacy=settle({purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,...facts('Player-1-O',2,1)});
  const r=await pass();
  check('P1-B legacy-then-lane: no Officer PUT and no lane Officer row while the legacy PUT is unresolved; the legacy row is only stamped; fresh grants proceed',r.state==='done'
   &&!effects().some(e=>e.endsWith('/roles/'+OFF))&&count(`purpose='staff_roster_rank' AND role_id='${OFF}'`)===0&&row(legacy.id).state==='unknown'&&row(legacy.id).checked_at===clock
   &&effects().includes(path_('PUT',S,FM)));}
 // --- statement admission: a statement stop keeps the cursor at the last finished subject; the next pass resumes there
 {grantWorld();members[S]=[];counter={used:0};const adm={count:counter,limit:17};
  const r=await pass('watcher',budget(40),adm);
  check('a counted Admission too small for the grant visit stops it before its producer: no row, no effect, the grant cursor stays',r.state==='done'&&count()===0&&effects().length===0
   &&newestState().g===''&&counter.used<=adm.limit);
  clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);counter={used:0};const r2=await pass('watcher',budget(40),{count:counter,limit:F.FRESH_INTERVAL_SECONDS+100});counter=null;
  check('with room the same subject is granted on the next pass (membership and rank)',r2.state==='done'&&effects().length===2&&members[S].includes(FM)&&members[S].includes(N[7]));}
 check('no visit failed or pass failed anywhere except the two deliberate failure fixtures',bounds.failures===0);
 check('every completed pass ran no more statements than it reserved (the FRESH_*_STATEMENTS bounds hold on every scenario)',bounds.passes>=20&&bounds.violations.length===0);
 check('pinned bounds',P.FRESH_INTENT_STATEMENTS===13&&P.freshSpentStatements(24)===145&&P.freshRemovalStatements(2,14)===65&&P.FRESH_OPEN_STATEMENTS===9&&P.FRESH_CLOSE_STATEMENTS===3
  &&P.FRESH_SWEEP_STATEMENTS===374&&P.FRESH_BAN_STATEMENTS===5+145+105&&P.FRESH_GRANT_MIN_ENTRY===9);
 // --- twelve isolation: no lane statement selects or touches a twelve row; .160 purposes are never consumed
 {const snap=grantWorld();members[S]=[TWELVE[0]];settle({purpose:'roster_native_rank',role_id:TWELVE[0],state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,...facts('Player-1-A',7,snap)});
  const before=JSON.stringify(db.prepare("SELECT * FROM role_settlements WHERE role_id IN (SELECT value FROM json_each(?))").all(JSON.stringify(TWELVE)));
  const r=await pass();
  check('a twelve role on the member and a spent .160 twelve row: the lane grants its own roles, untouched twelve row, no request names a twelve role',r.state==='done'
   &&effects().join()===[path_('PUT',S,FM),path_('PUT',S,N[7])].join()&&r.counts.failed===0
   &&JSON.stringify(db.prepare("SELECT * FROM role_settlements WHERE role_id IN (SELECT value FROM json_each(?))").all(JSON.stringify(TWELVE)))===before&&!requests.some(q=>TWELVE.some(t=>q.endsWith('/'+t))));}
 Date.now=realNow;console.log(`full_release_pass_test: ${passed} checks passed`);
})().catch(e=>{console.error(e);process.exit(1);});
