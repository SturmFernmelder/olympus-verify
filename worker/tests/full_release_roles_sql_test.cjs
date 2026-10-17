// Fresh-role lanes (Revision 4): every lane SQL text of src/full-release-roles.ts against the REAL schema.sql in native
// SQLite with a controlled database clock. Synthetic Discord IDs only. No provider access, no Worker, no D1.
// Covers the fences, the departure custody term and window (major 1), M2 reachability (major 2), snapshot completeness
// (major 3), exact-tuple closes across D and role changes (major 4) and the bounded walk windows (major 5).
//   node tests/full_release_roles_sql_test.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),src=name=>fs.readFileSync(path.join(root,'src',name),'utf8'),schema=fs.readFileSync(path.join(root,'schema.sql'),'utf8');
globalThis.fetch=async()=>{throw Error('provider access forbidden');};
const cache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name).exports;const m={exports:{}};cache.set(name,m);
 const js=ts.transpileModule(src(name+'.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',js)(m,m.exports,p=>{if(p==='node:async_hooks')return require(p);if(!/^\.\/[a-z0-9-]+$/.test(p))throw Error('external module refused: '+p);return load(p.slice(2));});
 return m.exports;
}
const F=load('full-release-roles'),policy=load('beta-reset-policy');
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
const NATIVE=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'],BETA=['Guild Master','Officer','Veteran','Member','Initiate'];
const id=n=>String(800000000000000000n+BigInt(n)),hex=()=>crypto.randomBytes(16).toString('hex');
const G=id(1),E=1793833200,T=E+86400,FM=id(100),N=Array.from({length:10},(_,i)=>id(101+i)),GL=id(6),OFF=id(4),RL=id(8),STAFF=[GL,OFF,RL];
const FAM=JSON.stringify(N),SFAM=JSON.stringify(STAFF),D='d'.repeat(64);
const STAFF_MAP=JSON.stringify([{idx:0,name:'Guild Master',role:GL},{idx:2,name:'Officer',role:OFF},{idx:4,name:'Raid Leader',role:RL}]);
function world(){
 const db=new DatabaseSync(':memory:');let at=T;
 db.function('strftime',(format,clock)=>{assert.equal(format,'%s');assert.equal(clock,'now');return String(at);});
 db.exec(schema);
 const w={db,get now(){return at;},set now(v){at=v;},
  all:(sql,binds=[])=>db.prepare(sql).all(...F.bindsFor(sql,binds)),
  get:(sql,binds=[])=>db.prepare(sql).get(...F.bindsFor(sql,binds)),
  run:(sql,binds=[])=>db.prepare(sql).run(...F.bindsFor(sql,binds)),
  yes:(pred,binds=[])=>db.prepare(`SELECT CASE WHEN ${pred} THEN 1 ELSE 0 END AS ok`).get(...F.bindsFor(pred,binds)).ok===1,
  member(discord,banned=0){db.prepare('INSERT OR IGNORE INTO members(discord_id,banned) VALUES(?,?)').run(discord,banned);db.prepare('UPDATE members SET banned=? WHERE discord_id=?').run(banned,discord);},
  character(key,discord,status='member',guid=null){w.member(discord);db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?,?,?,?,?,?)").run(key,key,discord,status,T-90*86400,guid);},
  snapshot({exported=at-60,rows=[],fill=0,beta=false,complete=1,count}={}){
   const all=rows.concat(Array.from({length:fill},(_,i)=>({key:'filler'+i+'_'+Math.random().toString(36).slice(2,8),guid:'Player-1-F'+i,rank:beta?3:7})));
   const s=db.prepare("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted) VALUES(?,?,'test',?,?,1)").run(exported,at,count??all.length,complete).lastInsertRowid;
   const ins=db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)');
   db.exec('BEGIN');for(const r of all)ins.run(s,r.key,r.key,r.name??(beta?BETA:NATIVE)[r.rank],r.rank,r.guid);db.exec('COMMIT');return Number(s);},
  settle(o){const r={id:hex(),subject:id(10),purpose:'fresh_roster_membership',guild_id:G,role_id:FM,desired:1,state:'settled',reason:'fixture',attempts:1,created_at:at-1000,expires_at:at-700,
   claim_nonce:null,subject_generation:null,request_digest:null,roster_id:null,native_guid:null,native_profile:null,native_rank:null,native_rank_name:null,checked_at:null,...o};
   db.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,checked_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id,r.subject,r.purpose,r.guild_id,r.role_id,r.desired,r.state,r.reason,r.attempts,r.created_at,r.expires_at,r.claim_nonce,r.subject_generation,r.request_digest,r.roster_id,r.native_guid,r.native_profile,r.native_rank,r.native_rank_name,r.checked_at);return r;},
  consume(discord,key,consumedAt,source='whisper',ack=consumedAt+5,details){const p=db.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,consumed_at,consumed_source) VALUES(?,?,?,?,?,?,?)").run(discord,key,key,consumedAt-60,consumedAt+600,consumedAt,source).lastInsertRowid;
   if(ack!==null)db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'watcher','verify.confirmed',?,?)").run(ack,key,details??JSON.stringify({discordId:discord}));return Number(p);},
  row:(rid)=>db.prepare('SELECT * FROM role_settlements WHERE id=?').get(rid)};
 return w;
}
const params=(o)=>F.laneParams({rosterId:1,subject:id(10),guid:'Player-1-A',rankName:'Member',rank:7,generation:null,id:'',epoch:E,nonce:hex(),role:N[7],guild:G,floor:3,digest:D,pending:null,shrink:10,family:N,...o});
(async()=>{
 // --- every text prepares against schema.sql and runs on an empty database with its own bind count
 {const w=world(),texts=[];
  texts.push(['LANE_ROSTER_CURRENT','SELECT 1 WHERE '+F.LANE_ROSTER_CURRENT]);
  for(const [p,d] of [['fresh_roster_membership',1],['fresh_roster_rank',1],['fresh_roster_rank',0],['staff_roster_rank',1],['staff_roster_rank',0]])
   for(const [k,v] of Object.entries(F.laneConsumerSql(F.laneKind(p,d))))texts.push([p+d+'.'+k,v]);
  for(const p of F.LANE_REMOVAL_PURPOSES)for(const [k,v] of Object.entries(F.laneRemovalSql(p)))texts.push([p+'.'+k,v]);
  for(const l of ['fresh','staff']){for(const [k,v] of Object.entries(F.laneProducerSql(l)))texts.push([l+'.producer.'+k,v]);texts.push([l+'.pick',F.primaryPickSql(l)]);}
  for(const k of ['LANE_CLAIM_NOT_DISPATCHED','LANE_MARK_QUALIFY_HELD','LANE_OBSERVED_PRESENT','LANE_SPENT_OBSERVED','LANE_COMPENSATION_PARENT_OBSERVED','LANE_SPENT_ROWS','FRESH_CUSTODY_ROLES','FRESH_LEASE_ACQUIRE','FRESH_LEASE_RELEASE','FRESH_INTERVAL_SELECT','FRESH_STATE_SELECT','NEWEST_SNAPSHOT_SELECT',
   'PROFILE_ROWS_SELECT','GRANT_DEBT_SELECT','STAFF_WALK_SELECT','PRESENCE_WALK_SELECT','LANE_PENDING_ROWS','STAFF_ABSENCE_ROWS','STAFF_ABSENCE_SETTLE','STAFF_WANTED_ANY','LANE_LISTED_TOP','LANE_PICK_ACCEPTED'])texts.push([k,F[k]]);
  texts.push(['rotation+holds',F.causeRotationSelectSql(true)],['rotation',F.causeRotationSelectSql(false)],['departure',F.departureWalkSelectSql()],['departure.single',F.departureWalkSelectSql(true)],
   ['custody.ban',F.staffCustodyRolesSql(true)],['custody',F.staffCustodyRolesSql(false)]);
  for(const [name,sql] of texts){try{w.db.prepare(sql).all(...Array(F.maxBindIndex(sql)).fill(1));}catch(e){assert.fail(name+': '+e.message);}}
  check(`every lane SQL text (${texts.length}) prepares against schema.sql and runs with exactly its bind count`,texts.length>90);
  check('extra binds are trimmed and missing binds refused',F.bindsFor('SELECT ?3',[1,2,3,4]).length===3&&(()=>{try{F.bindsFor('SELECT ?3',[1]);return false;}catch(e){return e.message==='lane_bind_count';}})());
  for(const [name,sql] of [['grant',F.GRANT_DEBT_SELECT],['staff',F.STAFF_WALK_SELECT],['presence',F.PRESENCE_WALK_SELECT],['departure',F.departureWalkSelectSql()]]){
   const r=w.db.prepare(sql).all(...Array(F.maxBindIndex(sql)).fill(1));assert.equal(r.length,1,name);assert.equal(r[0].discord_id,null,name);assert.equal(r[0].window_size,0,name);}
  check('an empty walk still returns one bounds row (window_size 0, no subject)',true);
  check('no lane text names a twelve role or the beta guild',texts.every(([,s])=>!policy.BETA_RESET_ROLE_IDS.some(r=>s.includes(r))&&!s.includes(policy.BETA_RESET_GUILD_ID)));}
 // --- §2/§3 the live baseline and lane currentness
 {const w=world(),S=id(10);w.character('alpha',S,'member','Player-1-A');
  w.snapshot({exported:E-2*86400,beta:true,fill:250});
  const s2=w.snapshot({exported:T-60,rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:199});
  const cur=(o={})=>w.yes(F.LANE_ROSTER_CURRENT,params({rosterId:s2,floor:200,...o}));
  check('LIVE_BASELINE: 200 members meet floor 200, the beta predecessor is ignored',cur()&&!cur({floor:201}));
  check('the lane epoch is authoritative: a future epoch or 0 is not current',!cur({epoch:T+1})&&!cur({epoch:0}));
  check('a wrong GUID, rank or roster id is not current',!cur({guid:'Player-1-Z'})&&!cur({rank:6,rankName:'Raider'})&&!cur({rosterId:s2-1}));
  w.now=T+600;check('an export older than 600 s is not current',!cur());w.now=T;
  const b3=w.snapshot({exported:T-50,beta:true,fill:400});
  const s4=w.snapshot({exported:T-40,rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:184});
  check('a beta-five export interleaved after the epoch is skipped: 185 vs the live 200 is within 10%',w.yes(F.LANE_ROSTER_CURRENT,params({rosterId:s4,floor:150}))&&b3===s4-1);
  const s5=w.snapshot({exported:T-30,rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:165});
  check('a truncated live export (166 vs 185, >10%) is not grant-eligible',!w.yes(F.LANE_ROSTER_CURRENT,params({rosterId:s5,floor:150})));
  check('an older snapshot is never current once a newer one exists',!w.yes(F.LANE_ROSTER_CURRENT,params({rosterId:s4,floor:150})));
  const s6=w.snapshot({exported:T-20,rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:180}),now=(o={})=>w.yes(F.LANE_ROSTER_CURRENT,params({rosterId:s6,floor:150,...o}));
  check('a live export that grows again is current',now());
  w.member(S,1);check('a ban stays a subject-wide guard',!now());
  w.member(S,0);w.db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at) VALUES(?,?,?,?,?,'reapply',?,?)").run(S,'a','b','alpha','n',id(99),T);
  check('a rename hold stays a subject-wide guard',!now());
  w.db.prepare("DELETE FROM rename_holds").run();check('the guard lifts with the hold',now());
  w.db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)").run(S,'a'.repeat(32),T,T);
  check('the privacy generation stays a subject-wide guard',!now()&&now({generation:'a'.repeat(32)})&&!now({generation:'b'.repeat(32)}));}
 // --- §4/§5/§6/§7 fences
 {const w=world(),S=id(10),fence=(R)=>w.yes(F.targetFenceSql('?1','?2','?3','?4'),[S,G,R,'self']);
  w.settle({subject:S,purpose:'beta_reset',role_id:policy.BETA_RESET_ROLE_IDS[0],desired:0,state:'unknown',attempts:1});
  check('an unknown beta_reset row on another role does not fence a fresh target',fence(FM)&&fence(N[7]));
  w.settle({subject:S,purpose:'account_erasure',role_id:N[7],desired:0,state:'unknown',attempts:1,request_digest:'other',subject_generation:'b'.repeat(32)});
  w.settle({subject:S,purpose:'grant_compensation',role_id:N[8],desired:0,state:'dispatching',attempts:1,request_digest:hex()});
  check('the same physical target stays fenced across purposes, D and generation (compensation children included)',!fence(N[7])&&!fence(N[8])&&fence(N[6]));
  w.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[6],desired:1,state:'settled',attempts:1});
  check('settled or never-dispatched rows never fence',fence(N[6]));
  const fam=(lane,fam)=>w.yes(F.rankFamilyFenceSql('?1','?2','?3',lane,'?4'),[S,G,'self',fam]);
  const w2=world();w2.settle({subject:S,purpose:'roster_privileged_rank',role_id:OFF,desired:1,state:'unknown',attempts:1});
  check('an unknown bot Officer PUT blocks a Raid Leader grant',!w2.yes(F.rankFamilyFenceSql('?1','?2','?3','staff','?4'),[S,G,'self',SFAM]));
  const w3=world();w3.settle({subject:S,purpose:'staff_removal_ban',role_id:OFF,desired:0,state:'unknown',attempts:1});
  check('an unknown staff_removal_ban on Officer blocks a Raid Leader grant',!w3.yes(F.rankFamilyFenceSql('?1','?2','?3','staff','?4'),[S,G,'self',SFAM]));
  const w4=world();w4.settle({subject:S,purpose:'roster_native_rank',role_id:policy.BETA_RESET_ROLE_IDS[4],desired:0,state:'unknown',attempts:1});
  check('an unknown cosmetic beta removal blocks neither a staff nor a fresh rank grant',w4.yes(F.rankFamilyFenceSql('?1','?2','?3','staff','?4'),[S,G,'self',SFAM])&&w4.yes(F.rankFamilyFenceSql('?1','?2','?3','fresh','?4'),[S,G,'self',FAM]));
  const w5=world(),old=id(150);w5.settle({subject:S,purpose:'fresh_roster_rank',role_id:old,desired:1,state:'settled',attempts:1,created_at:T-5000});w5.settle({subject:S,purpose:'grant_compensation',role_id:old,desired:0,state:'unknown',attempts:1});
  check('a historical fresh rank ID (no longer configured) still blocks through its role history',!w5.yes(F.rankFamilyFenceSql('?1','?2','?3','fresh','?4'),[S,G,'self',FAM]));
  check('unknown rows on fresh rank targets block the fresh family but not the staff family',!fam('fresh',FAM)&&fam('staff',SFAM));
  const w8=world();w8.settle({subject:S,purpose:'fresh_removal_ban',role_id:FM,desired:0,state:'unknown',attempts:1});w8.settle({subject:id(11),purpose:'fresh_roster_rank',role_id:N[2],state:'unknown',attempts:1});
  check('an unknown membership removal, or another subject\'s unknown rank, leaves both families free',w8.yes(F.rankFamilyFenceSql('?1','?2','?3','fresh','?4'),[S,G,'self',FAM])&&w8.yes(F.rankFamilyFenceSql('?1','?2','?3','staff','?4'),[S,G,'self',SFAM]));
  // §6 consumer ordering
  const w6=world(),cur=w6.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[5],desired:1,state:'pending',attempts:0,roster_id:9,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:5,native_rank_name:'Veteran',created_at:T,expires_at:T+300});
  const order=()=>w6.yes(F.laneRankOrderSql('fresh_roster_rank'),['','','','','','',cur.id]);
  const old6=w6.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],desired:0,state:'pending',attempts:0,roster_id:9,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:5,native_rank_name:'Veteran',created_at:T,expires_at:T+300});
  check('a pending removal of the old rank on the same snapshot holds the replacement grant',!order());
  w6.db.prepare("UPDATE role_settlements SET state='held',reason='lane_qualify_held' WHERE id=?").run(old6.id);
  check('a never-dispatched lane_qualify_held marker of the same facts no longer blocks (completeness minor)',order());
  w6.db.prepare("UPDATE role_settlements SET state='held',reason='expired_without_dispatch',expires_at=? WHERE id=?").run(T-1,old6.id);check('an expired never-dispatched row does not block',order());
  w6.db.prepare("UPDATE role_settlements SET state='unknown',reason='x',attempts=1 WHERE id=?").run(old6.id);check('a spent removal blocks',!order());
  // §7
  const w7=world(),g7=w7.settle({subject:S,purpose:'fresh_roster_membership',role_id:FM,desired:1,state:'pending',attempts:0,created_at:T,expires_at:T+300});
  const after=()=>w7.yes(F.GRANT_AFTER_REMOVAL,['','','','','','',g7.id]);
  w7.settle({subject:S,purpose:'fresh_removal_ban',role_id:FM,desired:0,state:'settled',attempts:1,created_at:T-1});check('an older removal does not hold a grant',after());
  w7.settle({subject:S,purpose:'fresh_removal_ban',role_id:FM,desired:0,state:'settled',attempts:1,created_at:T});check('a removal in the same second holds the stale grant (ban and unban inside 300 s)',!after());}
 // --- §8 link: accepted sources, ACK_FOR tie, pick
 {const w=world(),S=id(10);w.character('alpha',S,'member','Player-1-A');
  const accepted=(s)=>w.db.prepare(`SELECT CASE WHEN ${F.acceptedSourceSql('lp')} THEN 1 ELSE 0 END AS ok FROM (SELECT ? AS consumed_source) lp`).get(s).ok===1;
  const card='1'+'2'.repeat(17);
  check('accepted sources: whisper, mail and the card forms only',['whisper','mail','whisper:card:'+card,'mail:card:'+card].every(accepted)
   &&!['banned','refused','unbind','rename','lifecycle-retiring','api','whisper:card:0'+card.slice(1),'whisper:card:12a'+card.slice(3),'whisper:card:'+card+'1234','mail:card:',null].some(accepted));
  const p1=w.consume(S,'alpha',T-3000,'whisper',null),p2=w.consume(S,'alpha',T-2900);
  const acked=pid=>w.db.prepare(`SELECT 1 FROM pending lp WHERE lp.id=? AND ${F.ackForSql('lp')}`).get(pid)!==undefined;
  check('a lost-reply consumption is never acknowledged by a later re-whisper; the new one is',!acked(p1)&&acked(p2)&&w.get(F.LANE_PICK_ACCEPTED,[S,'Player-1-A',E]).id===p2);
  const p3=w.consume(S,'alpha',T-2000,'whisper',T-2000+5),p4=w.consume(S,'alpha',T-2000,'whisper',null);
  check('two consumptions of one name in the same second are both refused',!acked(p3)&&!acked(p4));
  const w2=world();w2.character('alpha',S,'member','Player-1-A');const late=w2.consume(S,'alpha',T-3000,'whisper',T-3000+301),bad=w2.consume(S,'alpha',T-2000,'whisper',T-2000+5,'not json'),wrong=w2.consume(S,'alpha',T-1000,'whisper',T-1000+5,JSON.stringify({discordId:id(11)}));
  const acked2=pid=>w2.db.prepare(`SELECT 1 FROM pending lp WHERE lp.id=? AND ${F.ackForSql('lp')}`).get(pid)!==undefined;
  check('an ack outside 300 s, malformed details or another account never acknowledge (and raise no SQL error)',!acked2(late)&&!acked2(bad)&&!acked2(wrong));
  check('a consumption before the epoch is not picked',w2.get(F.LANE_PICK_ACCEPTED,[S,'Player-1-A',T])===undefined);
  // highest-ranked verified character
  const w3=world(),s=w3.snapshot({rows:[{key:'main',guid:'Player-1-M',rank:9},{key:'alt',guid:'Player-1-L',rank:8},{key:'officer',guid:'Player-1-O',rank:2}],fill:3});
  for(const [k,g] of [['main','Player-1-M'],['alt','Player-1-L'],['officer','Player-1-O']])w3.character(k,S,'member',g);
  w3.consume(S,'main',T-500);w3.consume(S,'alt',T-400);
  check('PRIMARY_PICK: an Initiate main plus a verified Alt-rank alt gives the Alt rank; an unverified Officer is ignored',w3.get(F.primaryPickSql('fresh'),[s,S,null,E,D]).rank_index===8);
  w3.consume(S,'officer',T-300);check('verifying the Officer makes it the highest-ranked pick',w3.get(F.primaryPickSql('fresh'),[s,S,null,E,D]).rank_index===2);
  check('the staff pick is the lowest staff-mapped verified character with its role',w3.get(F.primaryPickSql('staff'),[s,S,null,E,STAFF_MAP]).role===OFF);
  const s2=w3.snapshot({rows:[{key:'main',guid:'Player-1-M',rank:9},{key:'alt',guid:'Player-1-L',rank:8},{key:'officer',guid:'Player-1-O',rank:2},{key:'dupe',guid:'Player-1-O',rank:2}],fill:3});
  check('a GUID listed twice on the snapshot is never picked',w3.get(F.primaryPickSql('fresh'),[s2,S,null,E,D]).rank_index===8);
  const route2=world();route2.character('renamed',S,'member','Player-1-R');const s3=route2.snapshot({rows:[{key:'renamed',guid:'Player-1-R',rank:5}],fill:3});
  route2.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],native_guid:'Player-1-R',request_digest:D,subject_generation:null});
  check('Route 2: a rename keeps the link through a settled lane grant with the same D and generation',route2.get(F.primaryPickSql('fresh'),[s3,S,null,E,D]).rank_index===5&&route2.get(F.primaryPickSql('fresh'),[s3,S,null,E,'e'.repeat(64)])===undefined);}
 // --- major 1: departure walk custody term, window and latency
 {const w=world(),live=w.snapshot({exported:T-60,rows:[{key:'stay',guid:'Player-2-S',rank:7}],fill:5});
  for(let i=0;i<45;i++){const s=id(2000+i);w.character('h'+i,s,'left','Player-2-H'+i);w.settle({subject:s,role_id:FM,native_guid:'Player-2-H'+i,created_at:T-5000});w.settle({subject:s,purpose:'fresh_removal_departure',role_id:FM,desired:0,created_at:T-4000,reason:'removed'});}
  const fresh=id(2100);w.character('gone',fresh,'left','Player-2-G');w.settle({subject:fresh,role_id:FM,native_guid:'Player-2-G',created_at:T-5000});w.settle({subject:fresh,purpose:'fresh_roster_rank',role_id:N[7],native_guid:'Player-2-G',created_at:T-5000});
  const stay=id(1999);w.character('stay',stay,'member','Player-2-S');w.settle({subject:stay,role_id:FM,native_guid:'Player-2-S'});
  const beta=id(1990);w.character('betaofficer',beta,'member','Player-0-B');w.settle({subject:beta,purpose:'roster_privileged_rank',role_id:OFF,native_profile:'beta-five'});
  const staffGone=id(2101);w.character('officergone',staffGone,'left','Player-2-O');w.settle({subject:staffGone,purpose:'staff_roster_rank',role_id:OFF,native_guid:'Player-2-O'});
  const walk=(cursor,window=50,limit=1,single=false)=>w.all(F.departureWalkSelectSql(single),[cursor,E,E,G,limit,window,JSON.stringify(STAFF)]);
  let r=walk('');check('departure walk: 45 historical departures, a live member and a never-live beta officer are passed; the new departure is selected in one pass',r.length===1&&r[0].discord_id===fresh&&r[0].window_size===49);
  r=walk(fresh);check('the next pass selects the departed staff holder with bot custody and EVER_LIVE',r[0].discord_id===staffGone);
  r=walk('',50,5);check('owing subjects only: exactly the two real departures',r.map(x=>x.discord_id).join()===[fresh,staffGone].join());
  check('the fresh and staff departure causes hold for them in SQL, not for the never-live beta officer\'s staff role',w.get(F.laneRemovalSql('fresh_removal_departure').precheck,[null,fresh,'fresh_removal_departure',G,null,null,E])!==undefined
   &&w.get(F.laneRemovalSql('staff_removal_departure').precheck,[null,staffGone,'staff_removal_departure',G,null,null,E])!==undefined
   &&w.get(F.laneRemovalSql('staff_removal_departure').precheck,[null,beta,'staff_removal_departure',G,null,null,E])===undefined);
  check('the departure plan is built from custody only, historical targets included',w.all(F.FRESH_CUSTODY_ROLES,[fresh,G]).map(x=>x.role_id).join()===[FM,N[7]].sort().join()&&w.all(F.FRESH_CUSTODY_ROLES,[id(2000),G]).length===0
   &&w.all(F.staffCustodyRolesSql(false),[staffGone,G,JSON.stringify(STAFF)]).map(x=>x.role_id).join()===OFF);
  const big=world();for(let i=0;i<200;i++){const s=id(3000+i);big.character('h'+i,s,'left','Player-3-H'+i);big.settle({subject:s,role_id:FM,native_guid:'Player-3-H'+i,created_at:T-5000});big.settle({subject:s,purpose:'fresh_removal_departure',role_id:FM,desired:0,created_at:T-4000});}
  const late=id(3500);big.character('late',late,'left','Player-3-L');big.settle({subject:late,role_id:FM,native_guid:'Player-3-L'});
  r=big.all(F.departureWalkSelectSql(),['',E,0,G,1,50,'[]']);
  check('bounded window (major 5): 200 historical departures cost one 50-subject window and no selection; the cursor moves to window_end',r.length===1&&r[0].discord_id===null&&r[0].window_size===50&&r[0].window_end===id(3049));
  r=big.all(F.departureWalkSelectSql(true),[late,E,0,G,1,1,'[]']);check('the single-subject form finds a departure this export demoted at once',r[0].discord_id===late);
  let cursor='',passes=0;for(;passes<10;passes++){r=big.all(F.departureWalkSelectSql(),[cursor,E,0,G,1,50,'[]']);if(r[0].discord_id){break;}cursor=r[0].window_size<50?'':r[0].window_end;}
  check('without it the walk reaches the departure after ceil(201/50) windows',r[0].discord_id===late&&passes===4);
  const alt=world();alt.snapshot({exported:T-3000,rows:[{key:'altchar',guid:'Player-4-A',rank:8}],fill:5});alt.snapshot({exported:T-60,fill:6});
  const a=id(4000);alt.character('mainchar',a,'left','Player-4-M');alt.character('altchar',a,'member','Player-4-A');alt.settle({subject:a,role_id:FM,native_guid:'Player-4-M'});
  check('a live alt missing from a truncated newest export: prefilter positive, the full cause false (no removal)',alt.all(F.departureWalkSelectSql(),['',E,0,G,1,50,'[]'])[0].discord_id===a
   &&alt.get(F.laneRemovalSql('fresh_removal_departure').precheck,[null,a,'fresh_removal_departure',G,null,null,E])===undefined);
  const stuck=world();const st=id(5000);stuck.character('x',st,'left','Player-5-X');stuck.settle({subject:st,role_id:FM,native_guid:'Player-5-X'});
  const sp=stuck.settle({subject:st,purpose:'fresh_removal_departure',role_id:FM,desired:0,state:'unknown',attempts:1,expires_at:T-10});
  check('a spent departure removal is due for an outcome read',stuck.all(F.departureWalkSelectSql(),['',E,0,G,1,50,'[]'])[0].discord_id===st);
  stuck.run(F.LANE_SPENT_OBSERVED,F.laneTupleBinds(sp));
  check('once observed and still unknown it is skipped for FRESH_BACKOFF_SECONDS, then due again',stuck.all(F.departureWalkSelectSql(),['',E,0,G,1,50,'[]'])[0].discord_id===null
   &&(stuck.now=T+3601,stuck.all(F.departureWalkSelectSql(),['',E,0,G,1,50,'[]'])[0].discord_id===st));}
 // --- major 2: spent grants reach M2
 {const w=world(),S=id(10),s=w.snapshot({rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:3});w.character('alpha',S,'member','Player-1-A');
  const pick=w.consume(S,'alpha',T-500);
  w.settle({subject:S,role_id:FM,native_guid:'Player-1-A',request_digest:D,created_at:T-400,expires_at:T-100});
  const rank=w.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',attempts:1,reason:'provider_outcome_unknown',claim_nonce:hex(),roster_id:s,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',request_digest:D,created_at:T-400,expires_at:T-100});
  const debt=()=>w.all(F.GRANT_DEBT_SELECT,['',s,E,G,FM,FAM,2,50,D]),presence=()=>w.all(F.PRESENCE_WALK_SELECT,['',G,3,50,E]);
  check('(a) membership settled, rank unknown-but-present: the family fence keeps the grant-debt walk out; the presence walk owns observation',debt()[0].discord_id===null);
  check('(a) the presence walk selects it with spent=1 although every wanted role may be present',presence()[0].discord_id===S&&presence()[0].spent===1);
  const sql=F.laneConsumerSql(F.laneKind('fresh_roster_rank',1)).confirmSpent,binds=params({rosterId:s,id:rank.id,pending:pick,role:N[7]});
  const lost=w.consume(S,'alpha',T-300,'whisper',null);
  check('M2 is refused with a wrong D, a wrong rank role, or a bound consumption that was never acknowledged',w.all(sql,params({rosterId:s,id:rank.id,pending:pick,role:N[7],digest:'e'.repeat(64)})).length===0
   &&w.all(sql,params({rosterId:s,id:rank.id,pending:pick,role:N[6]})).length===0&&w.all(sql,params({rosterId:s,id:rank.id,pending:lost,role:N[7]})).length===0);
  check('Route 2 (?14 NULL) links through the settled membership grant on the same GUID, D and generation',w.yes(F.laneLinkSql('fresh'),params({rosterId:s,id:rank.id,pending:null}))
   &&!w.yes(F.laneLinkSql('fresh'),params({rosterId:s,id:rank.id,pending:null,digest:'e'.repeat(64)})));
  const confirmed=w.all(sql,binds);
  check('(a) a valid confirmSpent only stamps the spent rank with ?14 picked at reconcile time',confirmed.length===1&&w.row(rank.id).state==='unknown'&&w.row(rank.id).reason==='provider_outcome_unknown'&&w.row(rank.id).checked_at===T);
  check('afterwards the grant walk skips the uncertain target and its physical fence remains',debt()[0].discord_id===null&&!w.yes(F.targetFenceSql('?1','?2','?3','?4'),[S,G,N[7],'x']));
  const w2=world(),s2=w2.snapshot({rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:3});w2.character('alpha',S,'member','Player-1-A');const pick2=w2.consume(S,'alpha',T-500);
  const m2=w2.settle({subject:S,role_id:FM,state:'unknown',attempts:1,claim_nonce:hex(),roster_id:s2,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',request_digest:D,created_at:T-400,expires_at:T-100});
  const r2=w2.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],state:'dispatching',attempts:1,claim_nonce:hex(),roster_id:s2,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',request_digest:D,created_at:T-400,expires_at:T-100});
  check('(b) both unknown-but-present: grant debt holds both targets; the presence walk selects the due observation',w2.all(F.GRANT_DEBT_SELECT,['',s2,E,G,FM,FAM,2,50,D])[0].discord_id===null&&w2.all(F.PRESENCE_WALK_SELECT,['',G,3,50,E])[0].spent===1);
  const ok1=w2.all(F.laneConsumerSql(F.laneKind('fresh_roster_membership',1)).confirmSpent,params({rosterId:s2,id:m2.id,pending:pick2,role:FM}));
  const ok2=w2.all(F.laneConsumerSql(F.laneKind('fresh_roster_rank',1)).confirmSpent,params({rosterId:s2,id:r2.id,pending:pick2,role:N[7]}));
  check('(b) both confirmSpent calls stamp without changing the original states, reasons or nonces',ok1.length===1&&ok2.length===1&&[m2,r2].every(r=>w2.row(r.id).state===r.state&&w2.row(r.id).reason===r.reason&&w2.row(r.id).claim_nonce===r.claim_nonce&&w2.row(r.id).checked_at===T));
  const w3=world(),s3=w3.snapshot({rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:3});w3.character('alpha',S,'member','Player-1-A');w3.consume(S,'alpha',T-500);
  const inflight=w3.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],state:'dispatching',attempts:1,claim_nonce:hex(),roster_id:s3,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',request_digest:D,created_at:T-10,expires_at:T+290});
  check('a row still inside its claim window is never read: no spent selection, no M2, grant debt waits',w3.all(F.PRESENCE_WALK_SELECT,['',G,3,50,E])[0].discord_id===null
   &&w3.all(F.LANE_SPENT_ROWS,[S,G,10]).length===0&&w3.all(F.GRANT_DEBT_SELECT,['',s3,E,G,FM,FAM,2,50,D])[0].discord_id===null
   &&w3.all(F.LANE_SPENT_OBSERVED,F.laneTupleBinds(inflight)).length===0);}
 // --- major 3: removal authority needs a complete account listing or a justified grant
 {const S=id(10),setup=(rows,mainStatus='member')=>{const w=world();w.snapshot({exported:T-3000,rows:[{key:'main',guid:'Player-1-M',rank:0},{key:'alt',guid:'Player-1-L',rank:8}],fill:50});
   const s=w.snapshot({rows,fill:50});w.character('main',S,mainStatus,'Player-1-M');w.character('alt',S,'member','Player-1-L');w.consume(S,'main',T-500);w.consume(S,'alt',T-450);
   w.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[0],native_guid:'Player-1-M',native_rank:0,native_rank_name:'Guild Master',request_digest:D});
   w.settle({subject:S,purpose:'staff_roster_rank',role_id:GL,native_guid:'Player-1-M',native_rank:0,native_rank_name:'Guild Master'});
   w.settle({subject:S,purpose:'roster_privileged_rank',role_id:OFF,native_guid:'Player-1-M',native_rank:2,native_rank_name:'Officer'});return {w,s};};
  const auth=(w,s,lane,R,fam)=>w.yes(F.rankRemovalAuthoritySql(lane,'?1','?2','?3','?4','?5','?6'),[S,G,s,R,E,fam]);
  {const {w,s}=setup([{key:'alt',guid:'Player-1-L',rank:8}]);
   check('a Guild Master main left out of one eligible export keeps the GM rank role and Guild Leader',!auth(w,s,'fresh',N[0],FAM)&&!auth(w,s,'staff',GL,SFAM));
   check('an Officer main absent once keeps Officer',!auth(w,s,'staff',OFF,SFAM));
   check('the staff walk does not plan part (b) from that snapshot',w.all(F.STAFF_WALK_SELECT,['',s,E,G,STAFF_MAP,1,JSON.stringify(STAFF),50,SFAM])[0].discord_id===null);
   const plan=JSON.stringify([{id:hex(),role:N[0],desired:0,purpose:'fresh_roster_rank'},{id:hex(),role:N[8],desired:1,purpose:'fresh_roster_rank'}]);
   const pick=w.get(F.LANE_PICK_ACCEPTED,[S,'Player-1-L',E]).id,ins=w.run(F.laneProducerSql('fresh').insert,[...params({rosterId:s,guid:'Player-1-L',rankName:'Alt',rank:8,pending:pick}),plan,FM]);
   check('the fresh producer writes no desired=0 GM rank row from it',ins.changes===1&&w.db.prepare("SELECT COUNT(*) AS n FROM role_settlements WHERE desired=0").get().n===0);}
  {const {w,s}=setup([{key:'main',guid:'Player-1-M',rank:7},{key:'alt',guid:'Player-1-L',rank:8}]);check('a main listed with a new rank authorizes the old rank and staff removals',auth(w,s,'fresh',N[0],FAM)&&auth(w,s,'staff',GL,SFAM)&&auth(w,s,'staff',OFF,SFAM));
   check('the staff walk selects that account for part (b) (positive control)',w.all(F.STAFF_WALK_SELECT,['',s,E,G,STAFF_MAP,1,JSON.stringify(STAFF),50,SFAM])[0].discord_id===S);
   const pick=w.get(F.LANE_PICK_ACCEPTED,[S,'Player-1-M',E]).id,fact=params({rosterId:s,guid:'Player-1-M',rankName:'Member',rank:7,pending:pick,floor:3});
   check('the producer then writes the GM rank removal and the new rank grant (positive control)',w.run(F.laneProducerSql('fresh').insert,[...fact,JSON.stringify([{id:hex(),role:N[0],desired:0,purpose:'fresh_roster_rank'},{id:hex(),role:N[7],desired:1,purpose:'fresh_roster_rank'}]),FM]).changes===2);
   const sfact=params({rosterId:s,guid:'Player-1-M',rankName:'Member',rank:7,pending:null,digest:null,family:STAFF,floor:3});
   check('the staff producer writes Guild Leader and Officer removals for bot custody only',w.run(F.laneProducerSql('staff').insert,[...sfact,JSON.stringify([GL,OFF,RL].map(r=>({id:hex(),role:r,desired:0,purpose:'staff_roster_rank'}))),JSON.stringify(STAFF)]).changes===2
    &&w.all(F.laneProducerSql('staff').adoption,[...sfact,'[]',JSON.stringify(STAFF)]).map(r=>r.role_id).sort().join()===[GL,OFF].sort().join());}
  {const {w,s}=setup([{key:'alt',guid:'Player-1-L',rank:8}],'left');check('a main that left through the status machine authorizes them',auth(w,s,'fresh',N[0],FAM)&&auth(w,s,'staff',GL,SFAM));}
  {const {w,s}=setup([{key:'main',guid:'Player-1-M',rank:0},{key:'alt',guid:'Player-1-L',rank:8}]);w.character('betaonly',S,'member','Player-0-Q');
   check('a complete listing authorizes; a never-live beta character does not make it incomplete',w.yes(F.accountSnapshotCompleteSql('?1','?2','?3'),[S,s,E])&&auth(w,s,'fresh',N[7],FAM));}
  {const {w,s}=setup([{key:'alt',guid:'Player-1-L',rank:8}]);w.settle({subject:S,purpose:'verified_privileged_rank',role_id:RL,native_rank:4,native_rank_name:'Raid Leader'});
   check('a proof-era grant without a recorded character never authorizes from an incomplete snapshot',!auth(w,s,'staff',RL,SFAM));}}
 // --- major 4: exact-tuple outcome reads survive a change of D and of the fresh role ID; P1-A (Codex 22:44/23:18 UTC): they only
 // stamp checked_at, never close (the earlier absence-closing texts are gone)
 {const w=world(),S=id(10),oldRole=id(150);
  const spent=w.settle({subject:S,purpose:'fresh_roster_rank',role_id:oldRole,state:'unknown',attempts:1,claim_nonce:hex(),request_digest:'f'.repeat(64),expires_at:T-1});
  const rem=w.settle({subject:S,purpose:'fresh_removal_departure',role_id:oldRole,desired:0,state:'dispatching',attempts:1,claim_nonce:hex(),request_digest:'f'.repeat(64),expires_at:T-1});
  const wrong=F.laneTupleBinds({...spent,expires_at:spent.expires_at+1});
  check('a tuple mismatch never stamps',w.all(F.LANE_SPENT_OBSERVED,wrong).length===0&&w.row(spent.id).checked_at===null);
  check('P1-A: a spent grant under an old D on a replaced role is stamped by exact tuple and stays unknown',w.all(F.LANE_SPENT_OBSERVED,F.laneTupleBinds(spent)).length===1
   &&w.row(spent.id).state==='unknown'&&w.row(spent.id).reason==='fixture'&&w.row(spent.id).checked_at===T);
  check('P1-A: a spent lane removal under an old D is stamped by exact tuple and stays dispatching',w.all(F.LANE_SPENT_OBSERVED,F.laneTupleBinds(rem)).length===1
   &&w.row(rem.id).state==='dispatching'&&w.row(rem.id).checked_at===T);
  check('P1-A: the target and the rank family stay fenced afterwards',!w.yes(F.targetFenceSql('?1','?2','?3','?4'),[S,G,oldRole,'x'])&&!w.yes(F.rankFamilyFenceSql('?1','?2','?3','fresh','?4'),[S,G,'x',FAM]));
  const parent=w.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[3],state:'unknown',attempts:1,claim_nonce:hex(),request_digest:D});
  const child=w.settle({subject:S,purpose:'grant_compensation',role_id:N[3],desired:0,state:'unknown',attempts:1,claim_nonce:hex(),request_digest:parent.id,expires_at:T-1});
  const other=w.settle({subject:id(11),purpose:'grant_compensation',role_id:N[3],desired:0,state:'unknown',attempts:1,claim_nonce:hex(),request_digest:parent.id,expires_at:T-1});
  check('a compensation child whose parent differs in subject never stamps that parent',w.all(F.LANE_COMPENSATION_PARENT_OBSERVED,F.laneTupleBinds(other)).length===0&&w.row(parent.id).checked_at===null);
  check('P1-A: a lane compensation child and its parent are only stamped; both stay unknown (no settled absent, no removed_after_admission_changed)',
   w.all(F.LANE_SPENT_OBSERVED,F.laneTupleBinds(child)).length===1&&w.all(F.LANE_COMPENSATION_PARENT_OBSERVED,F.laneTupleBinds(child)).length===1
   &&w.row(child.id).state==='unknown'&&w.row(parent.id).state==='unknown'&&w.row(parent.id).reason==='fixture'&&w.row(parent.id).checked_at===T);
  check('P1-A: the earlier absence-closing texts are gone and no outcome-read text sets a state',['LANE_SPENT_REMOVAL_ABSENT','LANE_PAST_EFFECT_ABSENT','LANE_COMPENSATION_CHILD_ABSENT',
   'LANE_COMPENSATION_PARENT_HELD'].every(k=>F[k]===undefined)&&!/SET\s+state/.test(F.LANE_SPENT_OBSERVED)&&!/SET\s+state/.test(F.LANE_COMPENSATION_PARENT_OBSERVED));}
 // --- major 5: windows and indexes
 {const w=world(),plan=sql=>w.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...Array(F.maxBindIndex(sql)).fill(null)).map(r=>r.detail).join(' | ');
  check('grant and staff windows read the characters_discord index only',/COVERING INDEX characters_discord/.test(plan(F.GRANT_DEBT_SELECT))&&/COVERING INDEX characters_discord/.test(plan(F.STAFF_WALK_SELECT)));
  check('presence and departure windows read the role_settlement_subject index only',/COVERING INDEX role_settlement_subject/.test(plan(F.PRESENCE_WALK_SELECT))&&/COVERING INDEX role_settlement_subject/.test(plan(F.departureWalkSelectSql())));
  check('the interval read is an audit_ts range and the state read uses audit_actor_action',/audit_ts/.test(plan(F.FRESH_INTERVAL_SELECT))&&/audit_actor_action/.test(plan(F.FRESH_STATE_SELECT)));
  for(let i=0;i<120;i++)w.character('c'+i,id(6000+i),'member','Player-6-'+i);
  const r=w.all(F.GRANT_DEBT_SELECT,['',1,E,G,FM,FAM,2,50,D]);check('a grant window holds 50 candidates and moves its cursor to window_end',r[0].window_size===50&&r[0].window_end===id(6049)&&r[0].discord_id===null);
  w.db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','role.fresh_state',NULL,?)").run(T-100,JSON.stringify({n:7,r:''}));
  w.db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','role.fresh_tick',NULL,?)").run(T-50,JSON.stringify({n:8,r:'x'}));
  const iv=w.get(F.FRESH_INTERVAL_SELECT);check('the interval read returns the newest pass audit and its snapshot id',iv.action==='role.fresh_tick'&&iv.snapshot_id===8);
  check('the state read takes the newest of state and tick',JSON.parse(w.get(F.FRESH_STATE_SELECT).details).n===8);
  w.now=T+301;check('nothing within the interval: the pass may run',w.get(F.FRESH_INTERVAL_SELECT)===undefined);}
 // --- §12 removals, M1 re-removal and the owner's ban custody for staff
 {const w=world(),B=id(20),sql=F.laneRemovalSql('fresh_removal_ban'),plan=r=>JSON.stringify([{id:hex(),role:r}]);
  w.member(B,1);const binds=(o={})=>[o.id??null,B,'fresh_removal_ban',G,o.role??FM,null,E,D,o.plan??plan(FM),o.nonce??null,null];
  check('a ban removal row is written for a banned account',w.run(sql.insert,binds()).changes===1);
  const row=w.get(sql.rows,[B,'fresh_removal_ban',G,null,JSON.stringify([FM])]),nonce=hex();
  check('claim, final proof and receipt run the custody discipline',w.all(sql.claim,binds({id:row.id,nonce})).length===1&&w.get(sql.proof,binds({id:row.id,nonce}))!==undefined
   &&w.all(sql.receipt,binds({id:row.id,nonce})).length===1&&w.row(row.id).reason==='removed');
  check('M1: a role re-added after a settled removal gets a NEW removal row',w.run(sql.insert,binds()).changes===1);
  check('a second unsettled row for the same target is never written',w.run(sql.insert,binds()).changes===0);
  w.member(B,0);check('unbanned: no row, no claim',w.run(F.laneRemovalSql('fresh_removal_ban').insert,binds({plan:plan(N[1])})).changes===0);
  w.member(B,1);check('a purpose bound to the wrong statement is refused',w.run(sql.insert,[null,B,'fresh_removal_departure',G,FM,null,E,D,plan(N[2]),null,null]).changes===0);
  w.settle({subject:B,purpose:'ban',role_id:N[3],desired:0,state:'unknown',attempts:1});
  check('an unknown earlier removal on the target blocks a new row (outcome read only)',w.run(sql.insert,binds({plan:plan(N[3])})).changes===0);
  w.db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'retiring',1,?,?)").run(B,'a'.repeat(32),T,T);
  check('a privacy subject that is not active refuses every removal',w.run(sql.insert,binds({plan:plan(N[4])})).changes===0);
  // staff ban custody (owner: bans only, re-removal of a reappearing bot-given role)
  const s=world(),X=id(21),staffBan=F.laneRemovalSql('staff_removal_ban');s.member(X,1);
  const sb=(role,o={})=>[o.id??null,X,'staff_removal_ban',G,role,null,E,null,JSON.stringify([{id:hex(),role}]),o.nonce??null,null];
  s.settle({subject:X,purpose:'roster_privileged_rank',role_id:OFF,native_profile:'beta-five',created_at:T-9000});
  check('a bot-given Officer (our settled PUT) is removed on ban; a hand-assigned Raid Leader is untouched',s.run(staffBan.insert,sb(OFF)).changes===1&&s.run(staffBan.insert,sb(RL)).changes===0);
  const so=s.get(staffBan.rows,[X,'staff_removal_ban',G,null,JSON.stringify([OFF])]),n2=hex();s.all(staffBan.claim,sb(OFF,{id:so.id,nonce:n2}));s.all(staffBan.receipt,sb(OFF,{id:so.id,nonce:n2}));
  check('after the bot removal, strict custody ends but ban custody stands: a reappearing Officer is removed again',!s.yes(F.staffCustodySql('?1','?2','?3'),[X,G,OFF])&&s.yes(F.staffBanCustodySql('?1','?2','?3'),[X,G,OFF])&&s.run(staffBan.insert,sb(OFF)).changes===1);
  const t=world(),Y=id(22);t.member(Y,1);t.settle({subject:Y,purpose:'staff_roster_rank',role_id:GL,native_guid:'Player-7-Y',created_at:T-9000});
  t.settle({subject:Y,purpose:'staff_removal_departure',role_id:GL,desired:0,attempts:0,reason:'absent',created_at:T-8000});
  check('an observed absence outside a ban removal ends ban custody (a later re-add is hand-given)',!t.yes(F.staffBanCustodySql('?1','?2','?3'),[Y,G,GL]));
  const rh=world(),Z=id(23);rh.member(Z);rh.db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at) VALUES(?,?,?,?,?,'reapply',?,?)").run(Z,'a','b','k','n',id(99),T);
  check('a rename hold authorizes the membership removal row',rh.run(F.laneRemovalSql('fresh_removal_rename_hold').insert,[null,Z,'fresh_removal_rename_hold',G,FM,null,E,D,JSON.stringify([{id:hex(),role:FM}]),null,null]).changes===1);
  check('no removal runs before the lane epoch',rh.run(F.laneRemovalSql('fresh_removal_rename_hold').insert,[null,Z,'fresh_removal_rename_hold',G,N[1],null,T+10,D,JSON.stringify([{id:hex(),role:N[1]}]),null,null]).changes===0);
  const ab=world(),A=id(24),abs=F.laneRemovalSql('fresh_removal_ban');ab.member(A,1);ab.run(abs.insert,[null,A,'fresh_removal_ban',G,FM,null,E,D,JSON.stringify([{id:hex(),role:FM}]),null,null]);
  const ar=ab.get(abs.rows,[A,'fresh_removal_ban',G,null,JSON.stringify([FM])]);ab.settle({subject:A,purpose:'fresh_roster_membership',role_id:FM,state:'dispatching',attempts:1,expires_at:T+200});
  check('an absent receipt with a same-target PUT in flight is refused',ab.all(abs.absent,[ar.id,A,'fresh_removal_ban',G,FM,null,E]).length===0);}
 // --- §16 producers fence every json row; settleStaffRankAbsences correlates every row
 {const w=world(),S=id(10),s=w.snapshot({rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:3});w.character('alpha',S,'member','Player-1-A');const pick=w.consume(S,'alpha',T-500);
  w.settle({subject:S,purpose:'account_erasure',role_id:N[7],desired:0,state:'unknown',attempts:1});
  const plan=JSON.stringify([{id:hex(),role:FM,desired:1,purpose:'fresh_roster_membership'},{id:hex(),role:N[7],desired:1,purpose:'fresh_roster_rank'}]);
  const p=F.laneProducerSql('fresh'),b=[...params({rosterId:s,pending:pick}),plan,FM];
  check('producer: one json row fenced (unknown erasure on the rank target), the other written',w.run(p.insert,b).changes===1&&w.all(p.adoption,b).map(r=>r.purpose).join()==='fresh_roster_membership');
  check('producer: a rank row that does not match the rank, or a membership row for another role, is refused',w.run(p.insert,[...params({rosterId:s,pending:pick}),JSON.stringify([{id:hex(),role:N[6],desired:1,purpose:'fresh_roster_rank'}]),FM]).changes===0
   &&w.run(p.insert,[...params({rosterId:s,pending:pick}),JSON.stringify([{id:hex(),role:N[6],desired:1,purpose:'fresh_roster_membership'}]),FM]).changes===0);
  check('producer: no grant without an acknowledged link',w.run(p.insert,[...params({rosterId:s,pending:null}),JSON.stringify([{id:hex(),role:N[8],desired:0,purpose:'fresh_roster_rank'}]),FM]).changes===1
   &&w.run(p.insert,[...params({rosterId:s,pending:null}),JSON.stringify([{id:hex(),role:FM,desired:1,purpose:'fresh_roster_membership'}]),FM]).changes===0);
  const z=world();const zs=z.snapshot({rows:[{key:'beta',guid:'Player-8-B',rank:7}],fill:3});z.character('beta',S,'member','Player-8-B');
  for(const r of [OFF,GL])z.settle({subject:S,purpose:'roster_privileged_rank',role_id:r,created_at:T-9000});
  const ids=[];for(const r of [OFF,GL])ids.push(z.settle({subject:S,purpose:'staff_roster_rank',role_id:r,desired:0,state:'pending',attempts:0,roster_id:zs,native_guid:'Player-8-B',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',created_at:T-5,expires_at:T+295}).id);
  z.settle({subject:S,purpose:'staff_removal_departure',role_id:GL,desired:0,state:'unknown',attempts:1});
  const out=z.all(F.STAFF_ABSENCE_SETTLE,[...params({rosterId:zs,guid:'Player-8-B',family:STAFF,digest:null,role:OFF}),JSON.stringify(ids),JSON.stringify(STAFF)]);
  check('settleStaffRankAbsences: the free first row settles, the second row with unknown custody on its own target does not',out.length===1&&out[0].id===ids[0]&&z.row(ids[1]).state==='pending');}
 // --- §9 the consumer guard in its UPDATE forms: claim, admission, receipt; stale or fenced rows refuse
 {const w=world(),S=id(10),s=w.snapshot({rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:3});w.character('alpha',S,'member','Player-1-A');const pick=w.consume(S,'alpha',T-500);
  const row=w.settle({subject:S,state:'pending',attempts:0,reason:'awaiting_dispatch',roster_id:s,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',request_digest:D,created_at:T-5,expires_at:T+295});
  const k=F.laneKind('fresh_roster_membership',1),c=F.laneConsumerSql(k),nonce=hex(),b=params({rosterId:s,id:row.id,pending:pick,role:FM,nonce});
  check('the lane intent is current for a linked member on the live snapshot',w.get(c.current,b)!==undefined);
  check('claim, admission and receipt pass the guard in turn',w.all(c.claim,b).length===1&&w.all(c.admit,b).length===1&&w.all(c.receipt,b).length===1&&w.row(row.id).reason==='effect_and_current_server_confirmed');
  const r2=w.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],state:'pending',attempts:0,reason:'awaiting_dispatch',roster_id:s,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',request_digest:D,created_at:T-5,expires_at:T+900});
  const kr=F.laneConsumerSql(F.laneKind('fresh_roster_rank',1)),br=params({rosterId:s,id:r2.id,pending:pick,role:N[7]});
  w.settle({subject:S,purpose:'roster_native_rank',role_id:N[7],desired:0,state:'unknown',attempts:1});
  check('an unknown row on the same physical target refuses the claim, whatever its purpose',w.all(kr.claim,br).length===0&&w.row(r2.id).state==='pending');
  w.db.prepare("DELETE FROM role_settlements WHERE purpose='roster_native_rank'").run();w.member(S,1);
  check('a ban refuses the claim (subject-wide guard)',w.all(kr.claim,br).length===0);w.member(S,0);
  w.now=T+541;check('a snapshot older than 600 s refuses the claim',w.all(kr.claim,br).length===0);w.now=T;
  check('the same row is claimable once current again',w.all(kr.claim,br).length===1);}
 // --- §13 marker and §15f backoff: one visit per changed export or per hour
 {const w=world(),S=id(14),s=w.snapshot({rows:[{key:'q',guid:'Player-1-Q',rank:7}],fill:3});w.character('q',S,'member','Player-1-Q');w.consume(S,'q',T-500);
  const debt=(snap=s)=>w.all(F.GRANT_DEBT_SELECT,['',snap,E,G,FM,FAM,2,50,D])[0].discord_id;
  const p=w.settle({subject:S,state:'pending',attempts:0,reason:'awaiting_dispatch',roster_id:s,request_digest:D,created_at:T-5,expires_at:T+295});
  check('a never-dispatched row is marked lane_qualify_held by exact tuple',debt()===S&&w.all(F.LANE_MARK_QUALIFY_HELD,F.laneTupleBinds(p)).length===1&&w.row(p.id).reason==='lane_qualify_held');
  check('the marker keeps grant debt away on the same snapshot',debt()===null);
  w.now=T+3601;check('after FRESH_BACKOFF_SECONDS the subject is due again under identical exports',debt()===S);
  w.now=T;const s2=w.snapshot({rows:[{key:'q',guid:'Player-1-Q',rank:7}],fill:3});check('a changed export ends the backoff at once',debt(s2)===S);
  const spent=w.settle({subject:S,state:'unknown',attempts:1,roster_id:s,expires_at:T-1});check('a spent row is never marked',w.all(F.LANE_MARK_QUALIFY_HELD,F.laneTupleBinds(spent)).length===0);}
 // --- staff walk (a) and (c): a verified staff rank until retired; spent ten-rank staff rows
 {const w=world(),S=id(12),s=w.snapshot({rows:[{key:'off',guid:'Player-1-O',rank:2},{key:'hc',guid:'Player-1-H',rank:1}],fill:5});
  w.character('off',S,'member','Player-1-O');w.character('hc',S,'member','Player-1-H');
  const walk=(mode=STAFF_MAP,managed=STAFF)=>w.all(F.STAFF_WALK_SELECT,['',s,E,G,mode,1,JSON.stringify(managed),50,SFAM])[0].discord_id;
  check('staff walk: no verified staff-ranked character, no visit',walk()===null);
  w.consume(S,'hc',T-600);check('a verified High Council character alone never maps to a staff role',walk()===null);
  w.consume(S,'off',T-500);check('a verified Officer is selected (no twelve[0] membership needed)',walk()===S);
  check('in raid-leader mode an Officer is not managed',walk(JSON.stringify([{idx:4,name:'Raid Leader',role:RL}]),[RL])===null);
  w.settle({subject:S,purpose:'staff_roster_rank',role_id:OFF,attempts:0,reason:'fresh_server_confirmed',native_guid:'Player-1-O',native_rank:2,native_rank_name:'Officer'});
  check('a settled grant on the same GUID and rank retires the subject (a hand-assigned Officer after one visit)',walk()===null);
  const sp=w.settle({subject:S,purpose:'staff_roster_rank',role_id:RL,state:'unknown',attempts:1,claim_nonce:hex(),expires_at:T-1});
  check('a spent ten-rank staff row makes the subject due again (M2 for staff)',walk()===S&&w.all(F.STAFF_WALK_SELECT,['',s,E,G,STAFF_MAP,1,JSON.stringify(STAFF),50,SFAM])[0].spent===1);
  w.run(F.LANE_SPENT_OBSERVED,F.laneTupleBinds(sp));check('observed and left unknown, it waits FRESH_BACKOFF_SECONDS',walk()===null);
  const old=world(),O=id(13),os=old.snapshot({rows:[{key:'x',guid:'Player-1-X',rank:7}],fill:5});old.character('x',O,'member','Player-1-X');
  old.settle({subject:O,purpose:'roster_privileged_rank',role_id:OFF,state:'unknown',attempts:1,native_profile:'beta-five',expires_at:T-1});
  check('a spent beta-five privileged row is never selected by the lane (no new GETs on old-profile rows)',old.all(F.STAFF_WALK_SELECT,['',os,E,G,STAFF_MAP,1,JSON.stringify(STAFF),50,SFAM])[0].discord_id===null);}
 // --- Stuck grant targets/families never consume the grant walk; independent work and due outcome reads remain reachable.
 {const w=world(),S=id(10);w.character('alpha',S,'member','Player-1-A');const s=w.snapshot({rows:[{key:'alpha',guid:'Player-1-A',rank:7}],fill:3});w.consume(S,'alpha',T-500);
  w.settle({subject:S,purpose:'fresh_roster_rank',role_id:N[7],native_guid:'Player-1-A',request_digest:D});
  const debt=()=>w.all(F.GRANT_DEBT_SELECT,['',s,E,G,FM,FAM,2,50,D])[0].discord_id;
  check('grant walk control: a free unsatisfied membership target is selected',debt()===S);
  const unknown=w.settle({subject:S,purpose:'account_erasure',role_id:FM,desired:0,state:'unknown',checked_at:T,expires_at:T-10});
  check('a recently observed foreign-purpose unknown on membership keeps the grant walk out',debt()===null);
  w.db.prepare('UPDATE role_settlements SET checked_at=NULL,expires_at=? WHERE id=?').run(T-99999,unknown.id);
  check('age or lack of a stamp never releases that foreign-purpose target into grant debt',debt()===null);
  w.db.prepare('DELETE FROM role_settlements WHERE id=?').run(unknown.id);
  check('removing only the synthetic blocker restores the free-target positive control',debt()===S);}
 {const w=world(),S=id(10);w.character('officer',S,'member','Player-1-O');const s=w.snapshot({rows:[{key:'officer',guid:'Player-1-O',rank:2}],fill:3});w.consume(S,'officer',T-500);
  const walk=()=>w.all(F.STAFF_WALK_SELECT,['',s,E,G,STAFF_MAP,2,JSON.stringify(STAFF),50,SFAM])[0].discord_id;
  check('staff walk control: the free Officer target is selected',walk()===S);
  const unknown=w.settle({subject:S,purpose:'account_erasure',role_id:GL,desired:0,state:'unknown',checked_at:T,expires_at:T-10});
  check('an unresolved other staff-family target keeps the wanted Officer grant out of the walk',walk()===null);
  w.db.prepare('UPDATE role_settlements SET checked_at=NULL,expires_at=? WHERE id=?').run(T-99999,unknown.id);
  check('an old family unknown still cannot become a new staff grant merely by elapsed time',walk()===null);
  w.db.prepare("UPDATE role_settlements SET state='settled',reason='removed' WHERE id=?").run(unknown.id);
  check('the own-acknowledged removal positive control releases the staff walk',walk()===S);}
 {const w=world(),S=id(10),nonce=hex(),other=hex(),r=w.settle({subject:S,state:'dispatching',reason:'admitted_before_effect',claim_nonce:nonce});
  check('known non-dispatch closure refuses a different nonce and leaves the claimed row unchanged',w.all(F.LANE_CLAIM_NOT_DISPATCHED,[r.id,other]).length===0&&w.row(r.id).state==='dispatching');
  check('the exact nonce closes once as held claimed_not_dispatched, retaining the original nonce and window',w.all(F.LANE_CLAIM_NOT_DISPATCHED,[r.id,nonce]).length===1&&w.row(r.id).state==='held'&&w.row(r.id).reason==='claimed_not_dispatched'&&w.row(r.id).claim_nonce===nonce&&w.row(r.id).expires_at===r.expires_at);
  check('the closed operation cannot be closed again or dispatched again',w.all(F.LANE_CLAIM_NOT_DISPATCHED,[r.id,nonce]).length===0&&w.row(r.id).attempts===1);
  const uncertain=w.settle({subject:S,state:'unknown',reason:'provider_outcome_unknown',claim_nonce:nonce});
  check('a prior unknown is never rewritten by the known non-dispatch closure',w.all(F.LANE_CLAIM_NOT_DISPATCHED,[uncertain.id,nonce]).length===0&&w.row(uncertain.id).reason==='provider_outcome_unknown');}
 // --- §14 lease
 {const w=world(),v1=F.freshLeaseValue(T+300,hex()),v2=F.freshLeaseValue(T+300,hex());
  check('two passes: one holds the lease',w.all(F.FRESH_LEASE_ACQUIRE,[v1]).length===1&&w.all(F.FRESH_LEASE_ACQUIRE,[v2]).length===0);
  check('release is a CAS on the exact value',w.run(F.FRESH_LEASE_RELEASE,[v2]).changes===0&&w.run(F.FRESH_LEASE_RELEASE,[v1]).changes===1&&w.all(F.FRESH_LEASE_ACQUIRE,[v2]).length===1);
  w.now=T+301;const v3=F.freshLeaseValue(T+601,hex());check('an expired lease is taken over',w.all(F.FRESH_LEASE_ACQUIRE,[v3]).length===1);
  check('the lease value holds no subject ID',Object.keys(JSON.parse(v3)).join()==='leaseUntil,n'&&!/\d{17}/.test(w.get("SELECT value FROM site_settings WHERE key='fullReleaseRolesPass'").value));}
 // --- §15a rotation and the privacy filter of the walks
 {const w=world();w.member(id(30),1);w.member(id(31),1);w.member(id(32));w.db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at) VALUES(?,?,?,?,?,'reapply',?,?)").run(id(32),'a','b','k','n',id(99),T);
  w.db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'retiring',1,?,?)").run(id(31),'a'.repeat(32),T,T);
  const r=w.all(F.causeRotationSelectSql(true),['',3]);
  check('rotation: banned and reapply accounts after the cursor, whatever their grant history',r.map(x=>x.discord_id).join()===[id(30),id(31),id(32)].join()&&r[2].banned===0&&r[0].banned===1&&r[1].privacy_state==='retiring');
  check('rename holds join only while the fresh lane can act',w.all(F.causeRotationSelectSql(false),['',3]).map(x=>x.discord_id).join()===[id(30),id(31)].join()&&w.all(F.causeRotationSelectSql(true),[id(31),3])[0].discord_id===id(32));
  const p=world(),s=p.snapshot({rows:[],fill:3});for(const n of [40,41]){p.character('c'+n,id(n),'member','Player-9-'+n);p.settle({subject:id(n),role_id:FM,native_guid:'Player-9-'+n});}
  p.snapshot({rows:[{key:'c40',guid:'Player-9-40',rank:7},{key:'c41',guid:'Player-9-41',rank:7}],fill:3});
  p.db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'retiring',1,?,?)").run(id(41),'a'.repeat(32),T,T);
  check('walks keep Discord-only members (no privacy row) and skip a non-active privacy row',p.all(F.PRESENCE_WALK_SELECT,['',G,3,50,E]).map(x=>x.discord_id).join()===id(40)&&s>0);}
 console.log(`\n${passed} checks passed`);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
