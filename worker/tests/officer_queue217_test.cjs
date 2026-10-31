'use strict';
// Current hardening fixture, real source/SQLite and existing original Native admission.
// This leaf never starts the watcher, game client or a real provider.
const fs217=require('node:fs'),path217=require('node:path'),Module217=require('node:module');
const original217=path217.join(__dirname,'hardening_test.cjs'),source217=fs217.readFileSync(original217,'utf8');
const marker217='\n(async () => {\n  let db = freshDb();';
if(source217.split(marker217).length!==2)throw Error('officer217_current_fixture_boundary');
async function officer217(){
 let db=freshDb(),env=directEnv({DB:d1(db),PUBLIC_BASE_URL:'https://verify.example',VERIFY_SECRET:'synthetic217-secret',ROLE_GUILD_MEMBER:'1549581282227265566',ADMISSION_MODE:'auto',GUILD_ID:'1549537348516188200',REQUEST_CODES:'on',ROSTER_MIN_MEMBERS:'0',ROSTER_MAX_SHRINK_PCT:'100'});
 const one=(sql,...p)=>db.prepare(sql).get(...p),all=(sql,...p)=>db.prepare(sql).all(...p);
 const write=(sql,...p)=>env.DB.prepare(sql).bind(...p).run();
 const fresh=()=>{db.close();db=freshDb();env=directEnv({...env,DB:d1(db)});reset();};
 const equal=(label,value,expected)=>check(label,JSON.stringify(value)===JSON.stringify(expected));
 // Direct actual functions, not the Python reimplementation of this formula.
 for(const[first,open,days,expected]of[[null,100,3,null],[50,100,3,259300],[100,100,3,259300],[150,100,3,259350],[150,100,0,150]])equal('217 eligibility '+JSON.stringify([first,open,days]),unv.eligibleAt(first,open,days),expected);
 for(const[value,expected]of[['',unv.DEFAULT_VERIFY_OPEN_SINCE],['garbage',unv.DEFAULT_VERIFY_OPEN_SINCE],['2026-11-04',Date.UTC(2026,10,4)/1000],[' 2026-11-04 ',Date.UTC(2026,10,4)/1000],['1793833200',1793833200]])equal('217 original opening parser '+JSON.stringify(value),unv.verifyOpenSince({...env,VERIFY_OPEN_SINCE:value}),expected);
 // Non-ISO Date.parse is host-local, not a promised UTC date or an epoch-zero setting.
 equal('217 short numeric setting retains original host Date.parse semantics',unv.verifyOpenSince({...env,VERIFY_OPEN_SINCE:'0'}),Math.floor(RealDate.parse('0')/1000));
 const snap=await load('./roster').ingestRoster(env,T,[{name:'Earlier',rank:'Initiate',rankIndex:4},{name:'Later',rank:'Initiate',rankIndex:4},{name:'Unknown',rank:'Officer',rankIndex:2},{name:'Verified',rank:'Member',rankIndex:3}], 'addon');
 await write("INSERT INTO members(discord_id) VALUES(?)",A);
 await write("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES('verified','Verified',?,'member',?)",A,T);
 await write("UPDATE roster_first_seen SET first_seen=? WHERE name_key='earlier'",T-5*86400);
 await write("UPDATE roster_first_seen SET first_seen=? WHERE name_key='later'",T-3600);
 await write("DELETE FROM roster_first_seen WHERE name_key='unknown'");
 await write("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce) VALUES(?,'later','Later',?,?,'ELG')",B,T,T+3600);
 let report=await unv.unverifiedReport({...env,VERIFY_OPEN_SINCE:String(T-86400),UNVERIFIED_GRACE_DAYS:'1'});
 equal('217 real report ordered and verified member excluded',report.members.map(m=>m.name),['Earlier','Later','Unknown']);
 equal('217 real report has first-seen and pending decisions',report.members.map(m=>[m.eligibleAt,m.pending]),[[T,false],[T-3600+86400,true],[null,false]]);
 for(const[value,expected]of[[undefined,3],['0',0],['-5',0],['garbage',3]])equal('217 grace clamp '+String(value),(await unv.unverifiedReport({...env,UNVERIFIED_GRACE_DAYS:value})).graceDays,expected);
 const expectedRoute=await unv.unverifiedReport(env),watcherToken='synthetic217-watcher-token-long-enough';
 const routed=await load('./index').default.fetch(new Request('https://verify.example/queue/unverified',{headers:{Authorization:'Bearer '+watcherToken}}),{...env,WATCHER_TOKEN:watcherToken},{waitUntil(){}});
 check('217 real watcher route preserves report eligibility decisions',routed.status===200&&JSON.stringify((await routed.json()).members)===JSON.stringify(expectedRoute.members));
 // Induced driver error, not DDL removal from the admitted schema. Other SQL remains real.
 const fault=message=>({...env,DB:{prepare(sql){if(!sql.includes('LEFT JOIN roster_first_seen'))return env.DB.prepare(sql);return{bind(){return this;},async all(){throw Error(message);}};}}});
 report=await unv.unverifiedReport(fault('no such table: roster_first_seen'));
 check('217 missing first-seen table offers nobody',report.firstSeenAvailable===false&&report.members.every(m=>m.firstSeen===null&&m.eligibleAt===null));
 let failed=false;try{await unv.unverifiedReport(fault('synthetic unrelated storage failure'));}catch(error){failed=error.message==='synthetic unrelated storage failure';}check('217 unrelated storage failure is not disguised as missing dates',failed);

 fresh();
 const queue=(key,status,attempts,retry,who=null)=>write("INSERT INTO invite_queue(name_key,name,discord_id,status,created_at,approved_by,attempts,retry_after,claimed_by,claimed_at) VALUES(?,?,?,?,?,'auto',?,?,?,?)",key,key,A,status,T-60,attempts,retry,who,who?T:null);
 await queue('ack','queued',0,null,'officer c');const id=one("SELECT id FROM invite_queue WHERE name_key='ack'").id;
 equal('217 stale officer acknowledgment reports zero',(await ingest.postQueueWritten(env,{ids:[id],officer:'officer a'})).body,{marked:0});
 equal('217 stale acknowledgment leaves current claim untouched',one('SELECT status,claimed_by FROM invite_queue WHERE id=?',id),{status:'queued',claimed_by:'officer c'});
 equal('217 current officer acknowledgment marks once',(await ingest.postQueueWritten(env,{ids:[id],officer:'officer c'})).body,{marked:1});
 check('217 current acknowledgment records written time',one('SELECT status,written_at FROM invite_queue WHERE id=?',id).status==='written'&&one('SELECT written_at FROM invite_queue WHERE id=?',id).written_at===T);
 equal('217 duplicate acknowledgment cannot mark the written row again',(await ingest.postQueueWritten(env,{ids:[id],officer:'officer c'})).body,{marked:0});
 await queue('legacy','queued',0,null,'officer c');equal('217 legacy empty officer contract remains exact',(await ingest.postQueueWritten(env,{ids:[one("SELECT id FROM invite_queue WHERE name_key='legacy'").id]})).body,{marked:1});
 fresh();
 for(const[key,attempts,retry]of[['null due',1,null],['past due',1,T-1],['future',1,T+3600],['max',2,T-1]])await queue(key,'invited',attempts,retry,'old officer');
 const future=JSON.stringify(one("SELECT * FROM invite_queue WHERE name_key='future'"));
 const notices217=[];stubs['./discord'].staffNotice=async(_env,payload)=>{notices217.push(payload);};
 const swept=await ingest.sweepInviteQueue({...env,INVITE_MAX_ATTEMPTS:'2'});equal('217 sweep requeues null and past, expires at maximum',swept,{requeued:2,expired:1});
 check('217 expiry notice is one safe nonmentioning payload',notices217.length===1&&JSON.stringify(notices217[0].allowed_mentions)==='{"parse":[]}');
 check('217 requeue clears all prior claim/retry fields',all("SELECT status,claimed_by,claimed_at,retry_after FROM invite_queue WHERE name_key IN('null due','past due')").every(r=>r.status==='queued'&&r.claimed_by===null&&r.claimed_at===null&&r.retry_after===null));
 equal('217 future invite stays byte-equivalent',JSON.stringify(one("SELECT * FROM invite_queue WHERE name_key='future'")),future);
 equal('217 sweep records one exact count audit',JSON.parse(one("SELECT details FROM audit WHERE action='queue.swept'").details),{requeued:2,expired:1,max:2});
 await write('DELETE FROM invite_queue');await ingest.sweepInviteQueue({...env,INVITE_MAX_ATTEMPTS:'0'});
 equal('217 empty sweep is observable and clamps zero maximum',JSON.parse(all("SELECT details FROM audit WHERE action='queue.swept' ORDER BY id").at(-1).details),{requeued:0,expired:0,max:1});
 check('217 empty sweep does not issue another staff notice',notices217.length===1);
 await ingest.sweepInviteQueue({...env,INVITE_MAX_ATTEMPTS:'garbage'});
 equal('217 malformed maximum retains existing default',JSON.parse(all("SELECT details FROM audit WHERE action='queue.swept' ORDER BY id").at(-1).details),{requeued:0,expired:0,max:6});

 fresh();await queue('resume name','invited',2,T+3600,'old officer');await write("UPDATE invite_queue SET last_reason='in_another_guild' WHERE name_key='resume name'");
 const code=await codes.codeFor(env.VERIFY_SECRET,'Resume Name',day());
 let result=await ingest.postVerify(env,{character:'Resume Name',code,source:'whisper'});
 check('217 valid guild-leave resume returns original queue position',result.status===200&&result.body.result==='resumed'&&result.body.position===1);
 equal('217 resume refunds once and clears old claim',one("SELECT status,attempts,retry_after,claimed_by,claimed_at,last_reason FROM invite_queue WHERE name_key='resume name'"),{status:'queued',attempts:1,retry_after:null,claimed_by:null,claimed_at:null,last_reason:'ready_after_gquit'});
 check('217 resume audit occurs once',one("SELECT COUNT(*) n FROM audit WHERE action='invite.resumed'").n===1);
 result=await ingest.postVerify(env,{character:'Resume Name',code,source:'whisper'});check('217 repeated whisper cannot refund again',result.body.result==='no_pending'&&one("SELECT attempts FROM invite_queue WHERE name_key='resume name'").attempts===1&&one("SELECT COUNT(*) n FROM audit WHERE action='invite.resumed'").n===1);

 fresh();await write("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'retiring',1,?,?)",A,'a'.repeat(32),T,T);
 await write("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at) VALUES(?,'held name','Held Name',?,?)",A,T,T+3600);
 result=await ingest.postVerify(env,{character:'Held Name',code:await codes.codeFor(env.VERIFY_SECRET,'Held Name',day()),source:'whisper'});
 check('217 privacy-held request cannot link or send',result.status===409&&result.body.result==='privacy_held'&&one('SELECT COUNT(*) n FROM characters').n===0&&ROLE_ADDS.length===0&&LOGS.length===0);

 fresh();await write("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce,consumed_at) VALUES(?,'other name','Other Name',?,?,'K7Q',?)",A,T,T+3600,T);
 result=await ingest.postVerify(env,{character:'New Name',code:await codes.ticketFor(env.VERIFY_SECRET,'K7Q',day()),source:'whisper'});
 check('217 already-consumed shared ticket stays unlinked with warning',result.body.result==='no_pending'&&one('SELECT COUNT(*) n FROM characters').n===0&&one("SELECT COUNT(*) n FROM audit WHERE action='verify.ticket_reused'").n===1&&LOGS.some(line=>line.includes('already used. Not linked.'))&&ROLE_ADDS.length===0);

 fresh();await write("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce) VALUES(?,'','',?,?,'K7Q')",A,T-2*86400,T+3600);
 result=await ingest.postVerify(env,{character:'Mismatch Name',code:await codes.ticketFor(env.VERIFY_SECRET,'K7Q',day()),source:'whisper'});
 check('217 request-ticket day mismatch preserves unconsumed original',result.body.result==='no_pending'&&one("SELECT consumed_at FROM pending WHERE nonce='K7Q'").consumed_at===null&&one("SELECT COUNT(*) n FROM audit WHERE action='verify.ticket_mismatch'").n===1&&one('SELECT COUNT(*) n FROM characters').n===0&&ROLE_ADDS.length===0);
 db.close();globalThis.Date=RealDate;crypto.getRandomValues=realRandom;
 console.log(`${ok}/${n} officer queue217 checks passed`);if(ok!==n)process.exitCode=1;
}
const mod217=new Module217(original217);mod217.filename=original217;mod217.paths=Module217._nodeModulePaths(path217.dirname(original217));
mod217._compile(source217.slice(0,source217.indexOf(marker217))+`\n(${officer217.toString()})().catch(e=>{console.error(e);process.exitCode=1;});`,original217);
