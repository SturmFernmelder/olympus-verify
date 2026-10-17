// Additive restriction profile: actual handlers and original SQL over SQLite, Discord simulated.
// No seal issuance, drain, activation, or weakening of the original 113/163/528 assertions.
const H=require('./helpers/beta_item15_harness.cjs');
const {NEW:M,check,execute,scenarios:sc,deletes,puts,settlements,heldAudit,onFirstSql,SUBJECT,STAFF,OFFICER,G,TWELVE,FRESH,OTHER_GUILD}=H;
const P=M.policy,K=P.BETA_RESET_SOURCE_EPOCH_KEY,epoch='olympus-full-release-test-2026';
const pair=env=>P.captureBetaRoleDispatch(env);
const held=(env,d,role=TWELVE[0],guild=P.BETA_RESET_GUILD_ID)=>P.betaGrantDispatchHeld(env,d,guild,role);
(async()=>{
 let env={},d=pair(env);check('absent additive profile preserves the exact grant SQL',P.betaGrantDispatchSql(env,d,'guild_id','role_id','original_guard')==='original_guard');
 env.BETA_RESET_DISPATCH_SEAL_MODE='v1';d=pair(env);check('legacy v1 alone preserves the original grant SQL',P.betaGrantDispatchSql(env,d,'guild_id','role_id','original_guard')==='original_guard');
 for(const value of [epoch,'','false',undefined,null,23,'olympus-beta-2026-10-22']){
  env={[K]:value};d=pair(env);check('present source descriptor restricts fixed roles: '+String(value),TWELVE.every(r=>held(env,d,r)));
  check('source profile never restricts disjoint fresh physical IDs: '+String(value),!held(env,d,FRESH)&&!held(env,d,TWELVE[0],OTHER_GUILD));
  delete env[K];check('removing a captured source descriptor cannot reopen grants: '+String(value),held(env,d));
 }
 let reads=0;env={};Object.defineProperty(env,K,{configurable:true,get(){reads++;throw Error('getter must not run');}});d=pair(env);delete env[K];
 check('a removed accessor remains held without invoking it',held(env,d)&&reads===0);
 env=Object.create({[K]:epoch});d=pair(env);Object.setPrototypeOf(env,null);check('a removed inherited source descriptor remains held',held(env,d));
 env={};d=pair(env);env[K]=epoch;check('source profile appearing after entry holds',held(env,d));
 env={};d=pair(env);const effect={[K]:epoch};check('effect-only source descriptor holds a formerly absent original',held(effect,d));
 check('forged original capture cannot authorize a fixed grant',held({}, {env:{},capture:{kind:'beta-removal-dispatch'}}));

 // Evaluate the correlated restriction against every old physical target, plus fresh/outside scope.
 let s=await execute(M,'absent',{env:{[K]:epoch},act:(s)=>'fixture'});d=pair(s.env);
 for(const role of TWELVE){const sql=P.betaGrantDispatchSql(s.env,d,'?1','?2','1=1');
  check('consuming grant SQL excludes old target '+role,!s.db.prepare('SELECT 1 AS admitted WHERE '+sql).get(P.BETA_RESET_GUILD_ID,role));}
 const sql=P.betaGrantDispatchSql(s.env,d,'?1','?2','1=1');
 check('consuming SQL keeps a disjoint fresh target',!!s.db.prepare('SELECT 1 AS admitted WHERE '+sql).get(P.BETA_RESET_GUILD_ID,FRESH));
 check('consuming SQL keeps the same ID in another guild',!!s.db.prepare('SELECT 1 AS admitted WHERE '+sql).get(OTHER_GUILD,TWELVE[0]));

 s=await execute(M,'absent',sc.rawBan({[K]:epoch}));
 check('raw ban in the additive profile records the ban and held audit with no DELETE',deletes(s).length===0&&heldAudit(s)&&s.db.prepare('SELECT banned FROM members WHERE discord_id=?').get(SUBJECT).banned===1);
 s=await execute(M,'absent',sc.departure({[K]:epoch}));
 check('raw roster departure in the additive profile keeps DELETE closed',deletes(s).length===0&&heldAudit(s));
 s=await execute(M,'absent',{...sc.rawBan({[K]:epoch}),arm:s=>onFirstSql(s,'',()=>{delete s.env[K];})});
 check('raw ban preserves its original source descriptor across the first DB await',deletes(s).length===0&&heldAudit(s));

 // Actual actor binding awaits before /ban dispatch. A post-await recapture would lose this witness.
 const actorBan={entry:true,env:{[K]:epoch},prepare:s=>{s.members[SUBJECT]=[TWELVE[0]];},
  arm:s=>onFirstSql(s,'',()=>{delete s.env[K];}),
  act:async(s)=>{const i={type:2,id:'1',token:'t',guild_id:s.env.GUILD_ID,member:{user:{id:STAFF,username:'officer'},roles:[OFFICER]},
   data:{name:'olympus-admin',options:[{type:1,name:'ban',options:[{type:6,name:'user',value:SUBJECT},{type:3,name:'reason',value:'fixture'}]}]}};
   return (await (await M.inter.handleInteraction(s.env,i)).json()).data.content;}};
 s=await execute(M,'absent',actorBan);
 check('interaction actor-binding await cannot discard the true-entry source capture',deletes(s).length===0&&heldAudit(s)&&s.outcome.includes('held by the beta dispatch mode'));

 s=await execute(M,'absent',{env:{[K]:epoch},act:s=>M.roles.grantMemberRole(s.env,SUBJECT,'fixture','source-epoch',undefined,undefined,{subjectGeneration:G})});
 check('legacy grant refuses before new intent or provider work in the additive profile',s.outcome==='held'&&s.requests.length===0&&settlements(s).length===0&&s.trace.length===0);
 s=await execute(M,'absent',{env:{[K]:epoch,MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true'},act:s=>M.roles.grantMemberRole(s.env,SUBJECT,'fixture','source-epoch',undefined,undefined,{subjectGeneration:G})});
 check('central membership grant entry also refuses before SQL and HTTP',s.outcome==='held'&&s.requests.length===0&&settlements(s).length===0&&s.trace.length===0);
 H.finish('source epoch entry restriction');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(H.restore);
