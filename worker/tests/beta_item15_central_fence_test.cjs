// Item 15 (17 Oct 2026) regression suite, part of test:all: raw /ban and departure removals and the central role-settlement
// removals hold NEW dispatch on the fixed beta guild's twelve fixed roles unless BETA_RESET_DISPATCH_SEAL_MODE is absent and
// unchanged since the originating entry, while GET-only reconciliation of spent rows and ACK-free receipts stay available.
// Actual current TypeScript source over SQLite; only Discord is simulated (tests/helpers/beta_item15_harness.cjs). Absent
// mode is pinned here by positive expectations only; the statement-by-statement comparison with the 76e7e3c sources is a
// separate receipt (npm run receipt:beta-item15-absent-differential), so a later reviewed edit to these sources does not
// break test:all. These cases issue no seal or receipt and authorize no drain, activation or role reuse.
// Run from worker: node tests/beta_item15_central_fence_test.cjs
const H=require('./helpers/beta_item15_harness.cjs');
const {NEW:M,execute,check,scenarios:sc,stats,deletes,puts,onlyGets,audits,heldAudit,settlements,row,reasonOf,pair,withMode,onFirstSql,onSubjectGet,removalRow,erasureIntent,rankIntent,
 TWELVE,MODE,HELD,INVALID,OTHER_GUILD,SUBJECT,FRESH,FRESH2,G,PARENT,LABELS,CAPTURE,CHILD}=H;
const isHeld=s=>s.outcome?.state==='held'&&s.outcome?.reason===HELD;
const noRemovalRows=s=>!settlements(s).some(r=>r.desired===0);
const onlyReads=s=>s.trace.every(t=>/^\s*(SELECT|WITH)\b/i.test(t.sql));

(async()=>{
 // ===== Path 1: /olympus-admin ban, raw removeRole (live configuration: central settlement OFF) =====
 let s=await execute(M,'absent',sc.rawBan());
 check('raw /ban absent: one original DELETE on fixed role 0 with the original audit reason',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&reasonOf(deletes(s)[0])==='olympus-verify: banned by officer-fixture'&&s.outcome.includes('Guild Member removed.'));
 s=await execute(M,'v1',sc.rawBan());
 check('raw /ban v1: no provider request at all, ban still recorded',s.requests.length===0&&s.db.prepare('SELECT banned FROM members WHERE discord_id=?').get(SUBJECT).banned===1);
 check('raw /ban v1: distinguishable role.remove_held audit and staff note',heldAudit(s)&&audits(s,'role.remove_failed').length===0&&s.outcome.includes('held by the beta dispatch mode'));
 for(const mode of INVALID){stats.getterReads=0;s=await execute(M,mode,sc.rawBan());
  check('raw /ban invalid mode '+mode+' holds with zero DELETE and a held audit',deletes(s).length===0&&heldAudit(s)&&stats.getterReads===0);}
 s=await execute(M,'v1',sc.rawBan({ROLE_GUILD_MEMBER:FRESH}));
 check('raw /ban v1 leaves a fresh role outside the fixed twelve unaffected',deletes(s,FRESH).length===1&&!heldAudit(s));
 s=await execute(M,'v1',sc.rawBan({GUILD_ID:OTHER_GUILD}));
 check('raw /ban v1 leaves a fixed role id in another guild unaffected',deletes(s,TWELVE[0]).length===1&&!heldAudit(s));
 s=await execute(M,'v1',{...sc.rawBan(),arm:t=>onFirstSql(t,'INSERT INTO members (discord_id, banned, ban_reason)',()=>{delete t.env[MODE];})});
 check('raw /ban capture before the first await: v1 removed during the ban write still holds',deletes(s).length===0&&heldAudit(s)&&!Object.hasOwn(s.env,MODE));
 s=await execute(M,'absent',{...sc.rawBan(),arm:t=>onFirstSql(t,'INSERT INTO members (discord_id, banned, ban_reason)',()=>{t.env[MODE]='v1';})});
 check('raw /ban capture before the first await: v1 appearing during the ban write is a changed mode and holds',deletes(s).length===0&&heldAudit(s));

 // ===== Path 1b: /olympus-admin ban with central settlement ON: the case capture is passed into revokeForBan =====
 s=await execute(M,'absent',sc.durableBan());
 check('durable /ban absent: one central DELETE, absence confirmed',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&s.outcome.includes('absence confirmed'));
 s=await execute(M,'v1',sc.durableBan());
 check('durable /ban v1: held before revokeForBan, zero requests, held audit',s.requests.length===0&&heldAudit(s)&&settlements(s).length===0);
 s=await execute(M,'v1',{...sc.durableBan(),arm:t=>onFirstSql(t,'SELECT subject_id AS subject,generation AS subjectGeneration',()=>{delete t.env[MODE];})});
 check('durable /ban v1 removed during the first await (privacy read) still holds',s.requests.length===0&&heldAudit(s)&&settlements(s).length===0);

 // ===== Path 2: departure raw removeRole in roster.ts afterDeparture (central settlement OFF) =====
 s=await execute(M,'absent',sc.departure());
 check('raw departure absent: one original DELETE with the original reason, then the staff-role read',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&reasonOf(deletes(s)[0])==='olympus-verify: Actual Member left the guild (fixture)'&&s.requests.at(-1).method==='GET'&&audits(s,'roster.left').length===1);
 s=await execute(M,'v1',sc.departure());
 check('raw departure v1: zero DELETE, held audit, departure still recorded',deletes(s).length===0&&heldAudit(s)&&audits(s,'role.remove_failed').length===0&&audits(s,'roster.left').length===1&&onlyGets(s));
 for(const mode of INVALID){stats.getterReads=0;s=await execute(M,mode,sc.departure());
  check('raw departure invalid mode '+mode+' holds with zero DELETE',deletes(s).length===0&&heldAudit(s)&&stats.getterReads===0);}
 s=await execute(M,'v1',sc.departure({ROLE_GUILD_MEMBER:FRESH}));
 check('raw departure v1 leaves a fresh role unaffected',deletes(s,FRESH).length===1&&!heldAudit(s));
 s=await execute(M,'v1',sc.departure({GUILD_ID:OTHER_GUILD}));
 check('raw departure v1 leaves another guild unaffected',deletes(s,TWELVE[0]).length===1&&!heldAudit(s));
 s=await execute(M,'v1',{...sc.departure(),arm:t=>onFirstSql(t,"UPDATE characters SET status = 'left'",()=>{delete t.env[MODE];})});
 check('raw departure capture before the first await: v1 removed during the status write still holds',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'absent',{...sc.departure(),arm:t=>onFirstSql(t,"UPDATE characters SET status = 'left'",()=>{t.env[MODE]='v1';})});
 check('raw departure: v1 appearing after the entry capture is a changed mode and holds',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'absent',sc.departure({},(t,N)=>pair(N,withMode(t.env,'v1'))));
 check('raw departure: a threaded entry capture (v1) decides even when the effect env lacks the mode',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'absent',sc.departure({},(t,N)=>pair(N,t.env)));
 check('raw departure: a threaded absent entry capture keeps the original DELETE',deletes(s,TWELVE[0]).length===1&&!heldAudit(s));
 // Cross-env (review finding 6): an absent pair from another env never lifts a mode the effect env itself carries.
 const crossDeparture=(effectMode,env={})=>({...sc.departure(env),act:async(t,N)=>{await N.roster.demote(withMode(t.env,effectMode),SUBJECT,'actual member','Actual Member','fixture',{capture:CAPTURE,removal:pair(N,t.env)});return 'returned';}});
 for(const effectMode of ['v1','accessor','inherited']){stats.getterReads=0;s=await execute(M,'absent',crossDeparture(effectMode));
  check('raw departure cross-env: an absent entry pair with a '+effectMode+' effect env holds (no getter call)',deletes(s).length===0&&heldAudit(s)&&stats.getterReads===0);}
 s=await execute(M,'absent',crossDeparture('absent'));
 check('raw departure cross-env control: absent pair and absent effect env keep the original DELETE',deletes(s,TWELVE[0]).length===1&&!heldAudit(s));
 s=await execute(M,'absent',crossDeparture('v1',{ROLE_GUILD_MEMBER:FRESH}));
 check('raw departure cross-env: a v1 effect env does not restrict a fresh role',deletes(s,FRESH).length===1&&!heldAudit(s));

 // ===== Path 3: central settleMembershipRemoval / settleVerifiedRemoval (fixed current target) =====
 s=await execute(M,'absent',sc.centralBan());
 check('central ban absent: settled with one DELETE',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.centralBan());
 check('central ban v1: new dispatch held after GET-only qualification (no intent row, no DELETE)',isHeld(s)&&deletes(s).length===0&&onlyGets(s)&&settlements(s).length===0);
 for(const mode of INVALID){stats.getterReads=0;s=await execute(M,mode,sc.centralBan());
  check('central ban invalid mode '+mode+' holds with no intent and no DELETE',isHeld(s)&&deletes(s).length===0&&settlements(s).length===0&&stats.getterReads===0);}
 s=await execute(M,'v1',sc.centralBan({ROLE_GUILD_MEMBER:FRESH}));
 check('central ban v1 leaves a fresh current role unaffected',s.outcome.state==='settled'&&deletes(s,FRESH).length===1);
 s=await execute(M,'v1',sc.centralBan({GUILD_ID:OTHER_GUILD}));
 check('central ban v1 leaves another guild unaffected',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'absent',{...sc.centralBan(),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('central ban: mode change during the qualification GET holds before creation',isHeld(s)&&deletes(s).length===0&&settlements(s).length===0);
 s=await execute(M,'absent',{...sc.centralBan(),arm:t=>onFirstSql(t,"UPDATE role_settlements SET state='dispatching',claim_nonce=?3",()=>{t.env[MODE]='v1';})});
 check('central ban: mode change at the claim holds at the final pre-effect point (spent row, no DELETE)',isHeld(s)&&deletes(s).length===0&&settlements(s).length===1&&settlements(s)[0].attempts===1&&settlements(s)[0].state==='dispatching');
 // Review finding 3: GET-only reconciliation and the ACK-free absent receipt stay available in v1.
 s=await execute(M,'v1',sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0]});t.members[SUBJECT]=[];}));
 check('central ban v1: a prior spent fixed-target ban row is still observed GET-only (no DELETE, no new row)',s.outcome.state==='unknown'&&s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s)&&settlements(s).length===1&&row(s,'9'.repeat(32)).state==='unknown'&&row(s,'9'.repeat(32)).attempts===1);
 s=await execute(M,'v1',sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0]});}));
 check('central ban v1: a prior spent row whose role is still present stays unknown without a DELETE',s.outcome.state==='unknown'&&s.outcome.reason==='removal_outcome_not_absent'&&deletes(s).length===0&&onlyGets(s));
 {const prior=extraRoles=>sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0]});t.members[SUBJECT]=extraRoles;});
  const a=await execute(M,'absent',prior([])),v=await execute(M,'v1',prior([]));
  check('central ban v1: the prior spent receipt reconcile is statement-for-statement the absent-mode reconcile',H.view(a)===H.view(v)&&v.requests.length>0);}
 s=await execute(M,'v1',sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0],state:'pending',attempts:0,reason:'awaiting_dispatch'});t.members[SUBJECT]=[];}));
 check('central ban v1: an existing intent for a member who already lacks the role settles its ACK-free absent receipt',s.outcome.state==='settled'&&s.outcome.reason==='absent'&&row(s,'9'.repeat(32)).state==='settled'&&row(s,'9'.repeat(32)).reason==='absent'&&deletes(s).length===0&&settlements(s).length===1);
 s=await execute(M,'v1',sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0],state:'pending',attempts:0,reason:'awaiting_dispatch'});}));
 check('central ban v1: an existing intent whose role is present is held before its claim (unspent, no DELETE)',isHeld(s)&&row(s,'9'.repeat(32)).attempts===0&&row(s,'9'.repeat(32)).state==='pending'&&deletes(s).length===0);
 // Cross-env (review finding 6) on the central writer.
 const crossBan=(effectMode,env={})=>({...sc.centralBan(env),act:(t,N)=>N.rs.settleMembershipRemoval(withMode(t.env,effectMode),SUBJECT,'ban',{subjectGeneration:G},undefined,pair(N,t.env))});
 for(const effectMode of ['v1','accessor','inherited']){stats.getterReads=0;s=await execute(M,'absent',crossBan(effectMode));
  check('central ban cross-env: an absent entry pair with a '+effectMode+' effect env holds (no getter call)',isHeld(s)&&deletes(s).length===0&&settlements(s).length===0&&stats.getterReads===0);}
 s=await execute(M,'absent',crossBan('absent'));
 check('central ban cross-env control: absent pair and absent effect env remove once',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'absent',crossBan('v1',{ROLE_GUILD_MEMBER:FRESH}));
 check('central ban cross-env: a v1 effect env does not restrict a fresh role',s.outcome.state==='settled'&&deletes(s,FRESH).length===1);

 // ===== Path 3b: retired target with the transition ON =====
 s=await execute(M,'absent',sc.retiredBan(TWELVE[0]));
 check('retired pair absent: both targets removed',s.outcome.state==='settled'&&deletes(s,FRESH).length===1&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.retiredBan(TWELVE[0]));
 check('retired pair v1: fixed retired target held, fresh current target removed, result reports the hold',isHeld(s)&&deletes(s,TWELVE[0]).length===0&&deletes(s,FRESH).length===1&&s.members[SUBJECT].includes(TWELVE[0]));
 s=await execute(M,'v1',sc.retiredBan(FRESH2));
 check('retired pair v1 with a fresh retired role is unaffected',s.outcome.state==='settled'&&deletes(s,FRESH).length===1&&deletes(s,FRESH2).length===1);
 s=await execute(M,'absent',{...sc.retiredBan(TWELVE[0]),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('retired pair: mode change during the pair qualification drops only the fixed target (fresh target removed, no fixed row)',s.outcome.reason===HELD&&deletes(s,TWELVE[0]).length===0&&deletes(s,FRESH).length===1&&!settlements(s).some(r=>r.role_id===TWELVE[0]&&r.desired===0));
 s=await execute(M,'v1',{...sc.retiredBan(TWELVE[0]),arm:t=>onFirstSql(t,'SELECT *, (SELECT q.id FROM role_settlements q',()=>{delete t.env[MODE];})});
 check('retired pair: v1 removed during the ownership read still holds the fixed target',s.outcome.reason===HELD&&deletes(s,TWELVE[0]).length===0);
 s=await execute(M,'v1',sc.retiredBan(TWELVE[0],(t,N)=>N.roles.revokeForBan(t.env,SUBJECT,FRESH,'fixture',undefined,{subjectGeneration:G})));
 check('retired pair v1 through roles.revokeForBan: unsuccessful result, fixed target never deleted',s.outcome===false&&deletes(s,TWELVE[0]).length===0);
 s=await execute(M,'v1',sc.retiredBan(TWELVE[0],undefined,{},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0]});t.members[SUBJECT]=[FRESH];}));
 check('retired pair v1: the prior spent removal of the fixed retired target is still reconciled GET-only',s.outcome.state==='unknown'&&s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s));
 // A fixed CURRENT target holds the whole delegation on the new-dispatch path, a fresh retired partner included.
 s=await execute(M,'absent',sc.retiredBan(FRESH2,undefined,{ROLE_GUILD_MEMBER:TWELVE[0]}));
 check('fixed current + fresh retired pair absent: both removed',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1&&deletes(s,FRESH2).length===1);
 s=await execute(M,'v1',sc.retiredBan(FRESH2,undefined,{ROLE_GUILD_MEMBER:TWELVE[0]}));
 check('fixed current + fresh retired pair v1: whole delegation held after GET-only qualification (no row, no DELETE at all)',isHeld(s)&&deletes(s).length===0&&onlyGets(s)&&noRemovalRows(s));
 s=await execute(M,'v1',sc.retiredBan(FRESH2,undefined,{ROLE_GUILD_MEMBER:TWELVE[0]},t=>{t.members[SUBJECT]=[];}));
 check('fixed current + fresh retired pair v1: a member lacking both roles still gets the no-write absent result',s.outcome.state==='settled'&&s.outcome.reason==='absent'&&deletes(s).length===0&&noRemovalRows(s));

 // ===== Path 3c: departure delegation roles.settleGuildDepartureRole =====
 // Review fix 1 (item15-fixes-run.json): the export no longer holds before its import. It passes the entry pair straight to
 // settleMembershipRemoval, whose central holds stop new dispatch (no intent, no DELETE) after GET-only qualification.
 s=await execute(M,'absent',sc.centralDeparture());
 check('central departure absent: settled with one DELETE',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.centralDeparture());
 check('central departure v1: new dispatch held by the central writer (no intent row, no DELETE, GET-only)',s.outcome.reason===HELD&&deletes(s).length===0&&onlyGets(s)&&noRemovalRows(s));
 // The export's own capture (no caller pair, unspread env: a test-side spread would itself call an accessor and drop an
 // inherited descriptor) holds every invalid descriptor without a getter call.
 for(const mode of INVALID){stats.getterReads=0;s=await execute(M,mode,sc.centralDeparture((t,N)=>N.roles.settleGuildDepartureRole(t.env,SUBJECT,{subjectGeneration:G})));
  check('central departure invalid mode '+mode+' holds with no intent and no DELETE',s.outcome.reason===HELD&&deletes(s).length===0&&noRemovalRows(s)&&stats.getterReads===0);}
 s=await execute(M,'v1',sc.centralDeparture((t,N)=>N.roles.settleGuildDepartureRole(withMode(t.env,'absent'),SUBJECT,{subjectGeneration:G},undefined,pair(N,t.env))));
 check('central departure: the roster entry capture (v1) decides for a spread env that lacks the mode (no intent, no DELETE)',s.outcome.reason===HELD&&deletes(s).length===0&&onlyGets(s)&&noRemovalRows(s));
 s=await execute(M,'absent',sc.centralDeparture((t,N)=>N.roles.settleGuildDepartureRole({...t.env},SUBJECT,{subjectGeneration:G},undefined,pair(N,t.env))));
 check('central departure: an absent roster entry capture keeps the original removal for the spread env',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'absent',sc.centralDeparture((t,N)=>N.roles.settleGuildDepartureRole(withMode(t.env,'v1'),SUBJECT,{subjectGeneration:G},undefined,pair(N,t.env))));
 check('central departure cross-env: an absent entry pair cannot lift the v1 mode of the effect env (no intent, no DELETE)',s.outcome.reason===HELD&&deletes(s).length===0&&onlyGets(s)&&noRemovalRows(s));
 for(const effectMode of ['accessor','inherited']){stats.getterReads=0;s=await execute(M,'absent',sc.centralDeparture((t,N)=>N.roles.settleGuildDepartureRole(withMode(t.env,effectMode),SUBJECT,{subjectGeneration:G},undefined,pair(N,t.env))));
  check('central departure cross-env: an absent entry pair with a '+effectMode+' effect env holds (no getter call, no intent, no DELETE)',s.outcome.reason===HELD&&deletes(s).length===0&&noRemovalRows(s)&&stats.getterReads===0);}
 // Production shape (roster.ts): a spread effect env with the entry pair of the original env, which then changes.
 s=await execute(M,'absent',{...sc.centralDeparture((t,N)=>N.roles.settleGuildDepartureRole({...t.env},SUBJECT,{subjectGeneration:G},undefined,pair(N,t.env))),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('central departure: mode change on the entry env during the qualification GET holds before creation (no intent, no DELETE)',s.outcome.reason===HELD&&deletes(s).length===0&&noRemovalRows(s));
 // Liveness restored by fix 1: in v1 the export now reaches the central GET-only reconcile and the ACK-free absent receipt.
 const departureWith=extra=>{const base=sc.centralDeparture();return {...base,prepare:async(t,N)=>{await base.prepare(t,N);await extra(t);}};};
 s=await execute(M,'v1',departureWith(async t=>{await removalRow(t,{purpose:'guild_departure',role:TWELVE[0]});t.members[SUBJECT]=[];}));
 check('central departure v1: a prior spent fixed-target guild_departure row is reconciled GET-only through the export (no DELETE, no new row)',s.outcome.state==='unknown'&&s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s)&&settlements(s).length===1&&row(s,'9'.repeat(32)).state==='unknown'&&row(s,'9'.repeat(32)).attempts===1);
 {const prior=present=>departureWith(async t=>{await removalRow(t,{purpose:'guild_departure',role:TWELVE[0]});t.members[SUBJECT]=present?[TWELVE[0]]:[];});
  for(const present of [false,true]){const a=await execute(M,'absent',prior(present)),v=await execute(M,'v1',prior(present));
   check('central departure v1: the prior spent receipt reconcile (role '+(present?'present':'absent')+') is statement-for-statement the absent-mode reconcile',H.view(a)===H.view(v)&&v.requests.length>0&&onlyGets(v)&&deletes(v).length===0);}}
 s=await execute(M,'v1',departureWith(async t=>{await removalRow(t,{purpose:'guild_departure',role:TWELVE[0],state:'pending',attempts:0,reason:'awaiting_dispatch'});t.members[SUBJECT]=[];}));
 check('central departure v1: an existing intent for a member who already lacks the role settles its ACK-free absent receipt through the export',s.outcome.state==='settled'&&s.outcome.reason==='absent'&&row(s,'9'.repeat(32)).state==='settled'&&row(s,'9'.repeat(32)).reason==='absent'&&deletes(s).length===0&&settlements(s).length===1);
 s=await execute(M,'v1',departureWith(async t=>{await removalRow(t,{purpose:'guild_departure',role:TWELVE[0],state:'pending',attempts:0,reason:'awaiting_dispatch'});}));
 check('central departure v1: an existing intent whose role is present is held before its claim (unspent, no DELETE)',s.outcome.reason===HELD&&row(s,'9'.repeat(32)).attempts===0&&row(s,'9'.repeat(32)).state==='pending'&&deletes(s).length===0);

 // ===== Path 4: compensateGrant (compensation producer2) after a landed PUT loses admission =====
 s=await execute(M,'absent',sc.compensation());
 check('compensation absent: PUT then one compensating DELETE',puts(s).length===1&&deletes(s,TWELVE[0]).length===1&&settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'v1',sc.compensation());
 check('compensation v1: no compensating DELETE and no child row',puts(s).length===1&&deletes(s).length===0&&s.outcome.reason===HELD&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'invalid',sc.compensation());
 check('compensation invalid mode: no compensating DELETE',deletes(s).length===0&&s.outcome.reason===HELD);
 s=await execute(M,'v1',sc.compensation({ROLE_GUILD_MEMBER:FRESH}));
 check('compensation v1 leaves a fresh role unaffected',puts(s).length===1&&deletes(s,FRESH).length===1);
 s=await execute(M,'v1',sc.compensation({},t=>{delete t.env[MODE];}));
 check('compensation: v1 removed during the PUT await still holds (entry capture)',deletes(s).length===0&&s.outcome.reason===HELD);
 s=await execute(M,'absent',sc.compensation({},t=>{t.env[MODE]='v1';}));
 check('compensation: v1 appearing during the PUT await holds before the child INSERT',deletes(s).length===0&&s.outcome.reason===HELD&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'absent',{...sc.compensation(),arm:t=>onFirstSql(t,'INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,claim_nonce,attempts,created_at,expires_at)',()=>{t.env[MODE]='v1';})});
 const child=settlements(s).find(r=>r.purpose==='grant_compensation');
 check('compensation: mode change at the child claim keeps the spent child without a DELETE',deletes(s).length===0&&s.outcome.reason===HELD&&child?.attempts===1&&child.state==='dispatching');

 // ===== Path 5: retireOwnedMembershipRole (producer4) =====
 s=await execute(M,'absent',sc.retire(TWELVE[0]));
 check('retirement absent: one DELETE of the retired role',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.retire(TWELVE[0]));
 check('retirement v1: held after the read-only parent/receipt lookups, before any request or write',isHeld(s)&&s.requests.length===0&&onlyReads(s)&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'v1',sc.retire(FRESH2));
 check('retirement v1 of a fresh retired role is unaffected',s.outcome.state==='settled'&&deletes(s,FRESH2).length===1);
 s=await execute(M,'absent',{...sc.retire(TWELVE[0]),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('retirement: mode change during qualification holds before the child INSERT',isHeld(s)&&deletes(s).length===0&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'absent',{...sc.retire(TWELVE[0]),arm:t=>onFirstSql(t,'INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,subject_generation,created_at,expires_at)',()=>{t.env[MODE]='v1';})});
 const pendingChild=settlements(s).find(r=>r.purpose==='grant_compensation');
 check('retirement: mode change at the child INSERT holds before the claim (unspent child)',isHeld(s)&&deletes(s).length===0&&pendingChild?.attempts===0&&pendingChild.state==='pending');
 s=await execute(M,'v1',sc.retire(TWELVE[0],async t=>{await removalRow(t,{id:CHILD,purpose:'grant_compensation',role:TWELVE[0],digest:PARENT,reason:'membership_retirement_dispatching'});t.members[SUBJECT]=[FRESH];}));
 check('retirement v1: the existing spent child is still reconciled GET-only (observed, no DELETE, no new child)',s.outcome.state==='unknown'&&s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s)&&settlements(s).filter(r=>r.purpose==='grant_compensation').length===1);

 // ===== Path 5b: retireAttendedMembershipRole (producer3) through handleMembershipRetirement =====
 s=await execute(M,'absent',sc.attendedRoute(TWELVE[0]));
 check('attended route absent: the staff form retires the fixed retired role with one DELETE',s.outcome.status===200&&s.outcome.data.state==='settled'&&s.outcome.data.reason==='retirement_removed'&&deletes(s).length===1&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.attendedRoute(TWELVE[0]));
 check('attended route v1: held at the handler capture, zero provider attempts, no child',s.outcome.status===409&&s.outcome.data.reason===HELD&&s.outcome.data.providerAttempts===0&&s.requests.length===0&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'v1',sc.attendedRoute(FRESH2));
 check('attended route v1 of a fresh retired role is unaffected',s.outcome.status===200&&s.outcome.data.state==='settled'&&deletes(s,FRESH2).length===1);
 const reconcileRoute=retired=>sc.attendedRoute(retired,{child:true,act:t=>{t.members[SUBJECT]=[FRESH];return t.call('POST','/reconcile',{parentGrantId:PARENT,operationId:t.preview.data.child?.operationId,form:t.preview.data.form});}});
 s=await execute(M,'v1',reconcileRoute(TWELVE[0]));
 check('attended route v1: a spent fixed-target child is still recovered GET-only (observed, no DELETE)',s.outcome.status===200&&s.outcome.data.state==='unknown'&&s.outcome.data.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s)&&row(s,CHILD).state==='unknown');
 s=await execute(M,'absent',sc.attendedDirect(TWELVE[0]));
 check('attended direct absent: one DELETE, settled child',s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.attendedDirect(TWELVE[0]));
 check('attended direct v1: held before any request, no child',isHeld(s)&&s.requests.length===0&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'absent',{...sc.attendedDirect(TWELVE[0]),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('attended direct: mode change during qualification holds before the child creation',isHeld(s)&&deletes(s).length===0&&!settlements(s).some(r=>r.purpose==='grant_compensation'));
 s=await execute(M,'absent',{...sc.attendedDirect(TWELVE[0]),arm:t=>onFirstSql(t,"UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='membership_retirement_dispatching'",()=>{t.env[MODE]='v1';})});
 const spentChild=settlements(s).find(r=>r.purpose==='grant_compensation');
 check('attended direct: mode change at the claim holds at the final pre-effect point (spent child, no DELETE)',isHeld(s)&&deletes(s).length===0&&spentChild?.attempts===1&&spentChild.state==='dispatching');

 // ===== Path 6: settleErasure through roles.settleAccountErasureMemberRole, with a current erasure job =====
 const erasureRow=t=>row(t,H.PROOF.operationId);
 s=await execute(M,'absent',sc.erasure());
 check('erasure absent: the current job reaches the claim and exactly one DELETE, receipt removed',s.outcome.state==='removed'&&deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&erasureRow(s)?.state==='settled'&&erasureRow(s).reason==='removed'&&erasureRow(s).attempts===1);
 s=await execute(M,'v1',sc.erasure());
 check('erasure v1: no new intent (restricted INSERT), zero requests, held',s.outcome.state==='held'&&s.requests.length===0&&settlements(s).length===0);
 for(const mode of ['v2','null-value','inherited']){s=await execute(M,mode,sc.erasure());
  check('erasure invalid mode '+mode+' holds with no intent and no request',s.outcome.state==='held'&&s.requests.length===0&&settlements(s).length===0);}
 s=await execute(M,'v1',sc.erasure({ROLE_GUILD_MEMBER:FRESH}));
 check('erasure v1 with a fresh role is unaffected (one DELETE)',s.outcome.state==='removed'&&deletes(s,FRESH).length===1);
 s=await execute(M,'v1',sc.erasure({GUILD_ID:OTHER_GUILD}));
 check('erasure v1 in another guild is unaffected (one DELETE)',s.outcome.state==='removed'&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.erasure({},async t=>{await erasureIntent(t);t.members[SUBJECT]=[];}));
 check('erasure v1: an existing intent for a member who already lacks the role settles its ACK-free absent receipt',s.outcome.state==='absent'&&erasureRow(s).state==='settled'&&erasureRow(s).reason==='absent'&&deletes(s).length===0&&onlyGets(s));
 s=await execute(M,'v1',sc.erasure({},t=>erasureIntent(t)));
 check('erasure v1: an existing intent whose role is present is held before its claim (unspent, GET-only)',s.outcome.state==='held'&&erasureRow(s).attempts===0&&erasureRow(s).state==='pending'&&deletes(s).length===0&&onlyGets(s));
 s=await execute(M,'v1',{...sc.erasure(),arm:t=>onFirstSql(t,'SELECT (',()=>{delete t.env[MODE];})});
 check('erasure capture before the first await: v1 removed at the first statement still holds (no intent)',s.outcome.state==='held'&&settlements(s).length===0&&s.requests.length===0);
 s=await execute(M,'absent',{...sc.erasure(),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('erasure: mode change during the qualification GET holds at the claim (intent unspent, no DELETE)',s.outcome.state==='held'&&erasureRow(s)?.attempts===0&&erasureRow(s).state==='pending'&&deletes(s).length===0);
 s=await execute(M,'absent',{...sc.erasure(),arm:t=>onFirstSql(t,"UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?5",()=>{t.env[MODE]='v1';})});
 check('erasure: mode change at the claim holds at the final pre-effect point (spent intent, no DELETE)',s.outcome.state==='held'&&erasureRow(s)?.attempts===1&&erasureRow(s).state==='dispatching'&&deletes(s).length===0);

 // ===== Path 7: settleRoleIntent removal of a fixed native rank role =====
 s=await execute(M,'absent',sc.rank(TWELVE.slice(2)));
 check('rank removal absent: settled with one DELETE of the fixed rank role',s.outcome.state==='settled'&&deletes(s,TWELVE[2]).length===1);
 s=await execute(M,'v1',sc.rank(TWELVE.slice(2)));
 check('rank removal v1: held at the claim after GET-only qualification, intent unspent',isHeld(s)&&deletes(s).length===0&&onlyGets(s)&&rankIntent(s).attempts===0);
 s=await execute(M,'v1',sc.rank(LABELS));
 check('rank removal v1 of fresh rank roles is unaffected',s.outcome.state==='settled'&&deletes(s,LABELS[0]).length===1);
 s=await execute(M,'absent',{...sc.rank(TWELVE.slice(2)),arm:t=>onSubjectGet(t,()=>{t.env[MODE]='v1';})});
 check('rank removal: mode change during qualification holds before the claim',isHeld(s)&&deletes(s).length===0&&rankIntent(s).attempts===0);
 s=await execute(M,'v1',sc.rank(TWELVE.slice(2),t=>{t.members[SUBJECT]=[];}));
 check('rank removal v1: a member who already lacks the role gets the ACK-free fresh_server_confirmed receipt',s.outcome.state==='settled'&&s.outcome.reason==='fresh_server_confirmed'&&deletes(s).length===0&&rankIntent(s).state==='settled');
 // A spent fixed-target rank row (attempts=1) goes through the existing beta GET-only observation in every mode.
 const spentRank=(present)=>({...sc.rank(TWELVE.slice(2),async t=>{await t.write("UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?2,reason='dispatching' WHERE id=?1",t.rankIntent,'3'.repeat(32));if(!present)t.members[SUBJECT]=[];}),
  act:(t,N)=>N.rs.settleRoleIntent(t.env,t.rankIntent,true)});
 for(const present of [false,true]){const a=await execute(M,'absent',spentRank(present)),v=await execute(M,'v1',spentRank(present));
  check('rank removal v1: a spent fixed-target row (role '+(present?'present':'absent')+') is reconciled exactly as in absent mode (same statements, GET-only, no DELETE)',
   H.view(a)===H.view(v)&&v.requests.length>0&&onlyGets(v)&&deletes(v).length===0&&rankIntent(v).attempts===1&&v.outcome.state==='unknown');}

 // ===== Path 8: ingest.postEvents (watcher) -> demote -> afterDeparture, capture at the postEvents entry =====
 s=await execute(M,'absent',sc.postEvents());
 check('postEvents absent: one original DELETE with the original reason',s.outcome.status===200&&deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&reasonOf(deletes(s)[0])==='olympus-verify: Actual Member left the guild (fixture)'&&!heldAudit(s));
 s=await execute(M,'v1',sc.postEvents());
 check('postEvents v1: zero DELETE, held audit, departure still recorded',s.outcome.status===200&&deletes(s).length===0&&heldAudit(s)&&audits(s,'roster.left').length===1);
 s=await execute(M,'absent',{...sc.postEvents(),arm:t=>onFirstSql(t,'',()=>{t.env[MODE]='v1';})});
 check('postEvents: v1 appearing after the entry capture (first statement) is a changed mode and holds',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'v1',{...sc.postEvents(),arm:t=>onFirstSql(t,'',()=>{delete t.env[MODE];})});
 check('postEvents: v1 removed after the entry capture still holds',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'v1',sc.postEvents({ROLE_GUILD_MEMBER:FRESH}));
 check('postEvents v1 leaves a fresh role unaffected',deletes(s,FRESH).length===1&&!heldAudit(s));

 // ===== Path 9: roster.ingestRoster -> deriveRun/applyEffects -> afterDeparture, capture at the ingestRoster entry =====
 s=await execute(M,'absent',sc.ingestRoster());
 check('ingestRoster absent: the confirming export removes the role once with the original reason',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&reasonOf(deletes(s)[0])==='olympus-verify: Actual Member left the guild (roster (absent from two exports))'&&s.outcome.stripped?.includes('Actual Member'));
 s=await execute(M,'v1',sc.ingestRoster());
 check('ingestRoster v1: departure applied, zero DELETE, held audit',deletes(s).length===0&&heldAudit(s)&&s.outcome.stripped?.includes('Actual Member'));
 s=await execute(M,'absent',{...sc.ingestRoster(),arm:t=>onFirstSql(t,'',()=>{t.env[MODE]='v1';})});
 check('ingestRoster: v1 appearing after the entry capture is a changed mode and holds',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'v1',{...sc.ingestRoster(),arm:t=>onFirstSql(t,'',()=>{delete t.env[MODE];})});
 check('ingestRoster: v1 removed after the entry capture still holds',deletes(s).length===0&&heldAudit(s));

 // ===== Path 10: roster.continueRosterEffects (scheduled slice), capture at its entry =====
 s=await execute(M,'absent',sc.continueRoster());
 check('continueRosterEffects absent: the pending depart item is applied with one DELETE',s.pendingBefore===1&&s.outcome?.applied===1&&deletes(s).length===1&&deletes(s,TWELVE[0]).length===1);
 s=await execute(M,'v1',sc.continueRoster());
 check('continueRosterEffects v1: the depart item is applied with zero DELETE and a held audit',s.pendingBefore===1&&s.outcome?.applied===1&&deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'absent',{...sc.continueRoster(),arm:t=>onFirstSql(t,'',()=>{t.env[MODE]='v1';})});
 check('continueRosterEffects: v1 appearing after the entry capture is a changed mode and holds',s.pendingBefore===1&&deletes(s).length===0&&heldAudit(s));

 // ===== Path 11: roster.syncFromLatest (the /olympus-admin sync body): demote, and reconcileIdentities -> releaseBinding =====
 s=await execute(M,'absent',sc.syncDeparture());
 check('syncFromLatest absent: the manual sync demotes once with the original reason',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&reasonOf(deletes(s)[0])==='olympus-verify: Actual Member left the guild (manual sync)'&&s.outcome.stripped?.includes('Actual Member'));
 s=await execute(M,'v1',sc.syncDeparture());
 check('syncFromLatest v1: departure recorded, zero DELETE, held audit',deletes(s).length===0&&heldAudit(s)&&s.outcome.stripped?.includes('Actual Member'));
 s=await execute(M,'absent',{...sc.syncDeparture(),arm:t=>onFirstSql(t,'',()=>{t.env[MODE]='v1';})});
 check('syncFromLatest: v1 appearing after the entry capture is a changed mode and holds',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'absent',sc.syncNamesake());
 check('namesake release absent: releaseBinding removes once with the original reason',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&reasonOf(deletes(s)[0])==='olympus-verify: Actual Member left the guild (a different character now has this name)'&&s.outcome.released?.includes('Actual Member'));
 s=await execute(M,'v1',sc.syncNamesake());
 check('namesake release v1: binding released, zero DELETE, held audit',deletes(s).length===0&&heldAudit(s)&&s.outcome.released?.includes('Actual Member')&&audits(s,'roster.namesake_released').length===1);
 s=await execute(M,'v1',{...sc.syncNamesake(),arm:t=>onFirstSql(t,'',()=>{delete t.env[MODE];})});
 check('namesake release: v1 removed after the entry capture still holds',deletes(s).length===0&&heldAudit(s));

 // ===== Path 12: the roster central branch (central settlement ON) reached from postEvents =====
 s=await execute(M,'absent',sc.postEventsCentral());
 check('roster central branch absent: one central DELETE and a settled guild_departure receipt',deletes(s).length===1&&deletes(s,TWELVE[0]).length===1&&settlements(s).some(r=>r.purpose==='guild_departure'&&r.state==='settled'&&r.attempts===1));
 s=await execute(M,'v1',sc.postEventsCentral());
 check('roster central branch v1: new dispatch held by the central writer (no receipt row, zero DELETE, GET-only), audited as role.remove_held',deletes(s).length===0&&noRemovalRows(s)&&heldAudit(s)&&onlyGets(s));
 s=await execute(M,'absent',{...sc.postEventsCentral(),arm:t=>onFirstSql(t,'',()=>{t.env[MODE]='v1';})});
 check('roster central branch: v1 appearing after the postEvents entry capture holds',deletes(s).length===0&&heldAudit(s)&&noRemovalRows(s));
 // Review fix 1: a spent fixed-target guild_departure row is reconciled GET-only under v1 through roster.afterDeparture ->
 // roles.settleGuildDepartureRole -> settleMembershipRemoval (custody env), with no DELETE and no new row.
 {const centralWith=extra=>{const base=sc.postEventsCentral();return {...base,prepare:async(t,N)=>{await base.prepare(t,N);await extra(t);}};};
  const spentDeparture=present=>centralWith(async t=>{await removalRow(t,{purpose:'guild_departure',role:TWELVE[0]});t.members[SUBJECT]=present?[TWELVE[0]]:[];});
  const reconcileAudit=(t,reason)=>audits(t,'role.remove_held').some(d=>!!d&&d.reason===reason);
  s=await execute(M,'v1',spentDeparture(false));
  check('roster central branch v1: a spent fixed-target guild_departure row is reconciled GET-only via afterDeparture -> settleGuildDepartureRole (no DELETE, no new row)',
   s.outcome.status===200&&deletes(s).length===0&&onlyGets(s)&&settlements(s).filter(r=>r.desired===0).length===1&&row(s,'9'.repeat(32)).state==='unknown'&&row(s,'9'.repeat(32)).attempts===1&&reconcileAudit(s,'beta_removal_observed_absent_unconfirmed')&&!heldAudit(s));
  for(const present of [false,true]){const a=await execute(M,'absent',spentDeparture(present)),v=await execute(M,'v1',spentDeparture(present));
   check('roster central branch v1: the spent departure reconcile (role '+(present?'present':'absent')+') is statement-for-statement the absent-mode run',H.view(a)===H.view(v)&&v.requests.length>0&&onlyGets(v)&&deletes(v).length===0);}
  s=await execute(M,'v1',centralWith(async t=>{await removalRow(t,{purpose:'guild_departure',role:TWELVE[0],state:'pending',attempts:0,reason:'awaiting_dispatch'});t.members[SUBJECT]=[];}));
  check('roster central branch v1: an existing departure intent for a member who already lacks the role settles absent (no DELETE, no hold audit)',
   deletes(s).length===0&&row(s,'9'.repeat(32)).state==='settled'&&row(s,'9'.repeat(32)).reason==='absent'&&audits(s,'role.remove_held').length===0);}

 H.finish('item15 central fence');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(H.restore);
