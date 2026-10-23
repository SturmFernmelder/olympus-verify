// Native source tests; real identify OAuth fixture. No effect endpoint or external provider is called.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixturePath=path.join(__dirname,'privacy_access_test.cjs'),source=fs.readFileSync(fixturePath,'utf8'),cut=source.indexOf('async function main(){');
if(cut<0)throw Error('fixture seam');
const scenario=String.raw`
const history=load('privacy-access-history'),family=load('privacy-access-family-history'),community=load('community-context');
load('index'); // Actual serving graph: original thirteen plus two independently qualified .196 metadata families.
async function put(f,t,r){const keys=Object.keys(r);return await fixtureWrite(f,'INSERT INTO '+t+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')',...Object.values(r));}
const hex=(i,n=32)=>i.toString(16).padStart(n,'0'),eid=i=>'e'+String(i).padStart(21,'0');
async function member(f,id=A){if(!f.db.prepare('SELECT 1 FROM members WHERE discord_id=?').get(id))await put(f,'members',{discord_id:id,banned:0});}
async function profile(f){await put(f,'community_profiles',{discord_id:A,ref:'p'.repeat(22),created_at:f.time(),updated_at:f.time()});}
async function policy(f){if(!f.db.prepare('SELECT 1 FROM community_contribution_policies').get())await put(f,'community_contribution_policies',{version:'p',amount_copper:100,anchor_weekday:0,anchor_hour_utc:0,grace_hours:1,final_notice_days:1,review_days:1,new_member_exempt_days:0,created_at:f.time()});}
async function event(f,i,who=B){if(!f.db.prepare('SELECT 1 FROM community_events WHERE id=?').get(eid(i)))await put(f,'community_events',{id:eid(i),op_id:'o'+i,title:'Event '+i,starts_at:f.time()+600,duration_min:60,ends_at:f.time()+4200,created_by:who,created_at:f.time()-5,updated_at:f.time(),retain_until:f.time()+100000});}
async function key(f){if(!f.db.prepare("SELECT 1 FROM councillor_keys WHERE id='key'").get())await put(f,'councillor_keys',{id:'key',signer:B,signer_guid:'GUID-counterpart',public_key:'private-public-key',subject_generation:G,roster_id:1,created_at:f.time(),expires_at:f.time()+9000});}
async function challenge(f){await key(f);if(!f.db.prepare("SELECT 1 FROM councillor_challenges WHERE nonce='private-lease'").get())await put(f,'councillor_challenges',{nonce:'private-lease',key_id:'key',signer:B,session_version:7,session_expires:f.time()+900,created_at:f.time(),expires_at:f.time()+300,mode:'automatic',max_proofs:10});}
async function seedOne(f,c,i,who=A){const at=f.time()-100,keep=f.time()+100000;
 switch(c){
 case 'site.votes':await put(f,'site_votes',{voter_id:who,ballot:'officer',slot:i+1,nominee_kind:'discord',nominee_key:B,nominee_label:'Chosen '+i,reason:'Own text',created_at:at,updated_at:at});break;
 case 'site.boardVotes':await put(f,'site_board_votes',{voter_id:who,candidate_id:hex(i,17),role_key:'officer',vote:1,created_at:at,updated_at:at});break;
 case 'site.friends':await put(f,'site_friends',{owner_id:who,friend_kind:'discord',friend_key:hex(i,17),friend_label:'Chosen '+i,note:'Own note',created_at:at});break;
 case 'site.reserved':await put(f,'site_reserved',{owner_id:who,name:'Name '+i,name_key:'name'+i,status:'released',created_at:at,approved_by:STAFF});break;
 case 'verification.characters':await member(f,who);await put(f,'characters',{name_key:'name'+who+i,name:'Name '+i,discord_id:who,status:'left',bound_at:at,guid:'hiddenGUID'+i});break;
 case 'verification.codeRequests':await put(f,'pending',{discord_id:who,name_key:'name'+i,name:'Name '+i,created_at:at,expires_at:keep,nonce:'hidden-nonce'+i});break;
 case 'verification.inviteQueue':await put(f,'invite_queue',{discord_id:who,name_key:'name'+i,name:'Name '+i,status:'cancelled',created_at:at,note:who,approved_by:STAFF});break;
 case 'verification.renameRecords':await put(f,'rename_holds',{discord_id:who,old_name:'Old '+i,new_name:'New '+i,char_key:'new'+i,nonce:'hidden'+i,state:'approved',decided_by:STAFF,decided_at:at});break;
 case 'privacyLifecycle.erasureRequests':await put(f,'privacy_serving_jobs',{operation_id:hex(i),subject_id:who,subject_generation:G,request_digest:'d'.repeat(64),original_session_version:7,original_session_expires:keep,state:'complete',hold_reason:null,completed_at:at,created_at:at,retain_until:at+31622400});break;
 case 'privacyLifecycle.providerCleanup':await put(f,'privacy_provider_messages',{operation_id:hex(i),purpose:'review',subjects:JSON.stringify([{id:who,generation:G}]),channel_id:B,message_id:STAFF,state:'known',created_at:at,updated_at:at,retain_until:at+31622400});break;
 case 'privacyLifecycle.recoverySuppression':await put(f,'privacy_restore_replay',{operation_id:hex(i),subject_id:who,retired_generation:G,erased_at:at,retain_until:at+31622400,scope:'serving_account'});break;
 case 'community.directory.professions':await put(f,'community_professions',{discord_id:who,profession:load('community-directory').PROFESSIONS[i],skill:i,updated_at:at});break;
 case 'community.directory.alts':await put(f,'community_alt_claims',{discord_id:who,name:'Alt '+i,name_key:'alt'+i,claimed_at:at,updated_at:at,reviewed_by:STAFF});break;
 case 'community.directory.crafts':await put(f,'community_craft_offers',{discord_id:who,profession:'alchemy',recipe_name:'Recipe '+i,recipe_key:'recipe'+i,updated_at:at});break;
 case 'community.events.created':await event(f,i,who);break;
 case 'community.events.signups':await event(f,i);await put(f,'community_event_signups',{event_id:eid(i),discord_id:who,status:'yes',rsvp_starts_at:f.time()+600,updated_at:at});break;
 case 'community.events.attendance':await event(f,i);await put(f,'community_event_attendance',{event_id:eid(i),discord_id:who,state:'present',recorded_by:STAFF,recorded_at:at});break;
 case 'community.trials.trials':await put(f,'community_trials',{id:eid(i),op_id:'hidden'+i,discord_id:who,sponsor_discord_id:STAFF,started_at:at,review_due_at:keep,created_by:STAFF,created_at:at,updated_at:at,incarnation:hex(i),retain_until:keep});break;
 case 'community.restrictions.cases':await put(f,'community_restriction_cases',{id:eid(i),discord_id:who,category:'ban',set_by:STAFF,set_at:at,review_at:keep,updated_at:at,incarnation:hex(i)});break;
 case 'community.restrictions.watchList':await seedOne(f,'community.restrictions.cases',i,who);await put(f,'community_restriction_characters',{case_id:eid(i),character_key:'same',character_name:'Same Name',proof_key:'hidden',guid:'hiddenGUID',added_at:at,added_by:STAFF,review_at:keep-1,expires_at:keep});break;
 case 'community.departures.departures':await put(f,'community_departure_reviews',{id:eid(i),discord_id:who,character_key:'name'+i,character_name:'Name '+i,proof_key:'hidden'+i,kind:'left',observed_at:at,status:'open',created_at:at,retain_until:keep});break;
 case 'community.contributions.obligations':await policy(f);await put(f,'community_contribution_obligations',{guild_scope:'I',discord_id:who,period_start:at+i,due_at:keep,policy_version:'p',amount_copper:100,eligible:1,retain_until:keep,created_at:at,updated_at:at});break;
 case 'community.contributions.receipts':await put(f,'community_contribution_receipts',{id:eid(i),guild_scope:'I',source:'officer_manual',source_id:'hidden-source'+i,payload_hash:'hidden',payer_name:'hidden-payer',amount_copper:100,observed_at:at,observer_discord_id:STAFF,matched_discord_id:who,status:'matched',retain_until:keep,created_at:at});break;
 case 'community.news.notices':await put(f,'site_news_notices',{id:eid(i),op_hash:'hidden',title:'Notice '+i,body:'hidden-body',created_by:who,created_at:at,updated_by:STAFF,updated_at:at,retain_until:keep});break;
 case 'community.news.deletedNotices':await put(f,'site_news_ops',{id:eid(i),nonce:'hidden',created_by:who,created_at:at,purge_after:keep});break;
 case 'community.event_delivery.publications':await event(f,i);await put(f,'community_event_deliveries',{event_id:eid(i),purpose:'publication',event_revision:1,starts_at:f.time()+600,guild_id:B,channel_id:B,message_id:STAFF,op_id:'o'.repeat(22),claim_nonce:'n'.repeat(22),state:'posted',actor:who,created_at:at,updated_at:at,retain_until:keep,frozen_content:'hidden-content',result_code:'published'});break;
 case 'community.event_reminders.reminders':await event(f,i);await put(f,'community_event_reminders',{event_id:eid(i),event_revision:1,starts_at:f.time()+600,guild_id:B,channel_id:B,host:'olympus.roachcouncil.com',op_id:'o'.repeat(22),state:'armed',actor:who,created_at:at,updated_at:at,retain_until:keep,frozen_content:'hidden-content'});break;
 case 'community.councillor_verification.betaFernWindows':{const b=load('qr-beta-fern').BETA_FERN;await put(f,'qr_beta_fern_windows',{id:hex(i),actor:b.actor,account_incarnation:'c'.repeat(32),subject_generation:G,session_version:7,session_expires:keep,guild_id:b.guildId,application_id:b.applicationId,signer_guid:b.guid,signer_name:b.name,guild_name:b.guild,realm_name:b.realm,guild_realm:b.guildRealm,game_build:b.build,game_interface:b.interface,native_rank:b.rank,native_rank_index:b.rankIndex,native_rank_count:b.rankCount,roster_id:1,links_not_before:0,created_at:at,expires_at:at+600,review_digest:'d'.repeat(64),revoked_at:null,requester_id:b.requester,requester_name:b.requesterName,requester_guid:'Player-4613-00000001',requester_generation:'b'.repeat(32),requester_account_incarnation:'e'.repeat(32),request_code:hex(i),request_created_at:at,request_expires_at:at+600,membership_role:f.env.ROLE_GUILD_MEMBER});break;}
 case 'community.councillor_verification.councillorKeys':await put(f,'councillor_keys',{id:'key'+i,signer:who,signer_guid:'Own GUID '+i,public_key:'hidden-key'+i,subject_generation:G,roster_id:1,created_at:at,expires_at:keep});break;
 case 'community.councillor_verification.challenges':await key(f);await put(f,'councillor_challenges',{nonce:'hidden-nonce'+i,key_id:'key',signer:who,session_version:7,session_expires:keep,created_at:at,expires_at:keep,mode:'single',max_proofs:1});break;
 case 'community.councillor_verification.requests':await put(f,'verification_requests',{code:'hidden-code'+i,requester:who,created_at:at,expires_at:keep,state:'pending'});break;
 case 'community.councillor_verification.attestations':await challenge(f);await put(f,'verification_requests',{code:'hidden-code'+i,requester:who,created_at:at,expires_at:keep});await put(f,'verification_proofs',{id:'proof'+i,code:'hidden-code'+i,challenge:'private-lease',signer:B,key_id:'key',requester:who,requester_guid:'hiddenGUID',requester_name:who===A?'Own Character '+i:'hidden-name',native_rank:1,rank_name:'Officer',native_profile:'beta-five',signer_guid:'hiddenGUID',snapshot_id:1,digest:'hidden-digest'+i,created_at:at,expires_at:keep});break;
 case 'community.councillor_verification.roleOutcomes':await put(f,'role_settlements',{id:'role'+i,subject:who,purpose:'membership',guild_id:B,role_id:STAFF,desired:1,state:'settled',reason:'granted',created_at:at,expires_at:keep});break;
 case 'community.ruleset_publication.operations':await put(f,'ruleset_publications',{guild_id:STAFF,publication_id:'publication'+who+i,target_key:'olympus-info',selection_revision:i+1,profile_revision:load('ruleset-profile').currentRulesetProfile().revision,plan_hash:'hidden-plan',actor:who,actor_generation:G,session_version:7,session_expires:keep,channel_id:STAFF,message_id:B,frozen_payload:'hidden-public-copy',payload_hash:'hidden-digest',claim_nonce:'hidden-nonce',stage:'pin',state:'applied',result_code:'confirmed',created_at:at,updated_at:at,actor_retain_until:keep});break;
 default:throw Error('unknown test seed '+c);
 }
}
async function seed(f,c,n=1002){if(c.startsWith('community.directory.')&&c!=='community.directory.crafts')await profile(f);
 if(c==='community.privacy_access.connections'){for(let i=0;i<501;i++)await connect(f);return;}
 f.db.exec('BEGIN');try{for(let i=0;i<n;i++)await seedOne(f,c,i);if(c!=='community.councillor_verification.betaFernWindows')await seedOne(f,c,c==='community.directory.professions'?0:10000,B);f.db.exec('COMMIT');}catch(e){f.db.exec('ROLLBACK');throw e;}}
async function download(f,c,cursor=null,id=A){const con=await connect(f,id),frm=await form(f,con);provider=null;let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);const response=await copy.exportPrivacyAccess(frm.request({collection:c,cursor:cursor??''}),f.env);f.hooks.statement=null;f.hooks.beforeBatch=null;eq(c+' original logical plan plus Native admission attempts',attempts,c==='copy'?98:13);eq(c+' Native read/payload groups',batches,c==='copy'?[2,96]:[2,11]);return {data:await response.json(),frm};}
const sorted=a=>Array.from(a,x=>JSON.stringify(x)).sort();
async function original(f,c,id=A){if(!c.startsWith('community.'))return null;const plan=community.communityExportPlan(f.env,id),projection=load('privacy-write-admission').originalPrivacyAdmissionGroupProjection(f.env.DB,plan.statements),out=await f.env.DB.batch(plan.statements.map((s,i)=>/ LIMIT 1000$/.test(projection.logical[i].sql)?f.env.DB.prepare(projection.logical[i].sql.replace(/ LIMIT 1000$/,'')).bind(id):s)),body=plan.shape(out),parts=c.split('.');const value=body[parts[1]][parts[2]];return Array.isArray(value)?value:value.rows;}
async function mainFamily(){
 await require('./privacy_registered196_families.cjs').run(root);
 eq('closed thirty-five family histories',family.PRIVACY_FAMILY_HISTORY_COLLECTIONS.length,35);eq('aggregate histories thirty-eight',history.PRIVACY_COPY_HISTORY_COLLECTIONS.length,38);eq('individual histories forty-one',history.PRIVACY_ALL_HISTORY_COLLECTIONS.length,41);eq('actual producer graph original13 plus exact2 metadata families',community.communityDataNames().length,15);eq('actual producer graph original36 plus exact3 metadata statements',community.communityExportPlan(fixture().env,A).statements.length,39);
 for(const c of family.PRIVACY_FAMILY_HISTORY_COLLECTIONS){
  const f=fixture(),id=c==='community.councillor_verification.betaFernWindows'?load('qr-beta-fern').BETA_FERN.actor:A,n=c==='community.directory.professions'?12:1002;await seed(f,c,n);const before=count(f,'sqlite_master');
  const baseline=await original(f,c,id);const first=(await download(f,c,null,id)).data.history;
  const want=c==='community.privacy_access.connections'?1004:n;
  eq(c+' full retained count',first.capture.count,want);eq(c+' bounded first',first.entries.length,Math.min(want,1000));eq(c+' complete truth',first.capture.complete,want<=1000);
  ok(c+' safe projection',!JSON.stringify(first.entries).includes(B)&&!JSON.stringify(first.entries).includes(STAFF)&&!JSON.stringify(first.entries).includes('hidden-')&&!JSON.stringify(first.entries).includes('__history'));
   if(c==='community.councillor_verification.attestations'){
    ok('requester proof exact seven safe fields',first.entries.every(r=>Object.keys(r).sort().join(',')==='created_at,expires_at,id,native_rank,own_part,rank_name,requester_name'));
    eq('requester proof own facts and original native dates',first.entries[0],{id:'proof0',own_part:'requester',requester_name:'Own Character 0',native_rank:1,rank_name:'Officer',created_at:f.time()-100,expires_at:f.time()+100000});
    ok('requester proof GUID profile lease credentials withheld',!['hiddenGUID','private-lease','beta-five','private-public-key','GUID-counterpart'].some(token=>JSON.stringify(first.entries).includes(token)));
   }
   if(c==='community.councillor_verification.roleOutcomes'){
    ok('role outcome exact eleven safe fields',first.entries.every(r=>Object.keys(r).sort().join(',')==='attempts,checked_at,created_at,desired,expires_at,id,native_rank,native_rank_name,purpose,reason,state'));
    eq('role outcome own nullable rank facts and original native dates',first.entries[0],{id:'role0',purpose:'membership',desired:1,state:'settled',reason:'granted',attempts:0,native_rank:null,native_rank_name:null,created_at:f.time()-100,expires_at:f.time()+100000,checked_at:null});
   }
  let all=first.entries;
  if(first.nextCursor){const tail=(await download(f,c,first.nextCursor,id)).data.history;all=all.concat(tail.entries);eq(c+' tailcount',tail.entries.length,want-1000);eq(c+' fixed deadline',tail.capture.expiresAt,first.capture.expiresAt);eq(c+' complete aftertail',tail.capture.complete,true);eq(c+' terminates',tail.nextCursor,null);}
  eq(c+' all range delivered',all.length,want);if(baseline&&c!=='community.privacy_access.connections')eq(c+' exact existing own DTO parity',sorted(all),sorted(baseline));
  eq(c+' no DDL',count(f,'sqlite_master'),before);
  const initial=(await download(f,'copy',null,id)).data;eq(c+' initial all38 continued',Object.keys(initial.coverage.histories).length,38);const meta=initial.coverage.histories[c];eq(c+' aggregate count',meta.capture.count,c==='community.privacy_access.connections'?1008:want);
  if(c!=='community.privacy_access.connections'){let v=initial;for(const k of c.split('.'))v=v[k];const rows=Array.isArray(v)?v:v.rows;eq(c+' aggregate capped',rows.length,Math.min(want,25));eq(c+' aggregate DTO equalsfirst',rows,first.entries.slice(0,25));}
  if(meta.nextCursor&&c!=='community.privacy_access.connections'){const continuation=(await download(f,c,meta.nextCursor,id)).data.history;eq(c+' aggregate tail resumes at25',continuation.capture.delivered,want);eq(c+' aggregate tail exact',continuation.entries,all.slice(25));eq(c+' preview deadline retained',continuation.capture.expiresAt,meta.capture.expiresAt);}
  if(c==='community.directory.professions'){f.db.exec('PRAGMA ignore_check_constraints=ON');await put(f,'community_professions',{discord_id:A,profession:'not-a-profession',skill:999,updated_at:f.time()});await refused('malformed restored profession no false completeness',()=>download(f,c));}
  f.db.close();
 }
  // An own signer relationship keeps the foreign requester's proof facts exactly NULL.
  const signerFixture=fixture();await seedOne(signerFixture,'community.councillor_verification.attestations',0,B);
  await fixtureWrite(signerFixture,'UPDATE verification_proofs SET signer=? WHERE id=?',A,'proof0');
  const signerHistory=(await download(signerFixture,'community.councillor_verification.attestations')).data.history;
  eq('signer-only proof exact safe row and original dates',signerHistory.entries,[{id:'proof0',own_part:'signer',requester_name:null,native_rank:null,rank_name:null,created_at:signerFixture.time()-100,expires_at:signerFixture.time()+100000}]);
  ok('signer-only proof exact seven fields',signerHistory.entries.every(r=>Object.keys(r).sort().join(',')==='created_at,expires_at,id,native_rank,own_part,rank_name,requester_name'));
  ok('signer-only foreign requester and private facts withheld',![B,STAFF,'hidden-','hiddenGUID','private-lease','beta-five','private-public-key','GUID-counterpart','__history'].some(token=>JSON.stringify(signerHistory.entries).includes(token)));
  signerFixture.db.close();
  // Copy-only direct ownership preserves orphan professions/alts with absent profile context; crafts remain included.
  let f=fixture();await seedOne(f,'community.directory.professions',0);await seedOne(f,'community.directory.alts',0);await seedOne(f,'community.directory.crafts',0);
  await seedOne(f,'community.directory.professions',0,B);await seedOne(f,'community.directory.alts',10000,B);
  eq('orphan profile and own ref rows absent',[count(f,'community_profiles'),count(f,'community_refs')],[0,0]);
  let data=(await download(f,'copy')).data;eq('no profile preserves directly owned professions/alts',[data.community.directory.professions.length,data.community.directory.alts.length],[1,1]);eq('no profile preserves crafts',data.community.directory.crafts.length,1);
  const directory=data.community.directory,originalChildAt=new Date((f.time()-100)*1000).toISOString();
  eq('orphan profile context remains explicitly absent',[directory.ref,directory.revision,directory.listed,directory.main,directory.raidRole,directory.createdAt,directory.updatedAt,directory.departedAt],[null,0,false,null,null,null,null,null]);
  eq('orphan profession exact safe metadata',directory.professions,[{name:'alchemy',skill:0,updatedAt:originalChildAt}]);
  eq('orphan alt exact safe original dates and nullable review',directory.alts,[{name:'Alt 0',status:'claimed',proof:'self',claimedAt:originalChildAt,reviewedAt:null,updatedAt:originalChildAt}]);
  eq('orphan profession individual matches aggregate',(await download(f,'community.directory.professions')).data.history.entries,directory.professions);
  eq('orphan alt individual matches aggregate',(await download(f,'community.directory.alts')).data.history.entries,directory.alts);
  ok('orphan foreign children reviewer keys withheld',![B,STAFF,'Alt 10000','name_key','reviewed_by','__history'].some(token=>JSON.stringify(directory).includes(token)));
  f.db.close();
 // Stored four actor forms are shared by aggregate and separate decisions; counterpart identity stays withheld.
 f=fixture();for(const [i,actor]of [A,'user:'+A,'member:'+A,'staff:'+A].entries())await put(f,'community_contribution_decisions',{guild_scope:'I',discord_id:B,obligation_id:i+1,action:'state_open',actor,member_revision:1,nonce:'hidden',at:f.time(),retain_until:f.time()+1000});
 data=(await download(f,'copy')).data;eq('all four own actor forms aggregate',data.contributionDecisions.rows.map(r=>[r.own_subject,r.own_actor]),[[0,1],[0,1],[0,1],[0,1]]);eq('separate actor forms agree',(await download(f,'contributionDecisions')).data.history.entries.length,4);f.db.close();
 for(const kind of ['expiry','tamper','cross-collection','cross-account','delete-row','new-generation','null-generation','lost-primary']){
  f=fixture();if(kind==='new-generation')await subject(f);await seed(f,'site.friends');const first=(await download(f,'site.friends')).data.history;
  if(kind==='expiry')f.advance(86400);if(kind==='delete-row')await fixtureWrite(f,'DELETE FROM site_friends WHERE rowid=1');if(kind==='new-generation')await fixtureWrite(f,'UPDATE privacy_subjects SET generation=?','b'.repeat(32));if(kind==='null-generation')await subject(f);
  let cursor=first.nextCursor,c='site.friends';if(kind==='tamper')cursor=cursor.slice(0,-2)+'AA';if(kind==='cross-collection')c='site.boardVotes';
  let frm=await form(f,await connect(f,kind==='cross-account'?B:A));provider=null;
  if(kind==='lost-primary')f.hooks.afterBatch=s=>{if(s.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.afterBatch=null;throw Error('lost read result');}};
  await refused(kind+' family continuation refuses',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env));
  if(kind==='lost-primary')await refused('spent lost-primary grant never rereads',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env));f.db.close();
 }
 // Expired receipts without live allocation are absent from both count and payload, not cursor gaps.
 f=fixture();await seedOne(f,'community.contributions.receipts',0);await seedOne(f,'community.contributions.receipts',1);await fixtureWrite(f,'UPDATE community_contribution_receipts SET retain_until=? WHERE id=?',f.time(),eid(0));data=(await download(f,'community.contributions.receipts')).data.history;eq('expired unpaid receipt excluded from selected count',data.capture.count,1);eq('expired unpaid receipt omitted',data.entries.length,1);
 await policy(f);await seedOne(f,'community.contributions.obligations',0);await put(f,'community_contribution_allocation_events',{receipt_id:eid(0),obligation_id:1,amount_copper:40,member_revision:1,nonce:'hidden',actor:STAFF,created_at:f.time()});data=(await download(f,'community.contributions.receipts')).data.history;eq('expired allocated receipt remains eligible',data.capture.count,2);eq('expired relationship minimized amount',data.entries[0].amountCopper,40);eq('expired relationship no unallocated amount',data.entries[0].unallocatedCopper,0);eq('receipt original shape parity',sorted(data.entries),sorted(await original(f,'community.contributions.receipts')));
 await fixtureWrite(f,'UPDATE community_contribution_receipts SET amount_copper=? WHERE id=?',9007199254740992,eid(1));await refused('receipt overflow refuses no falsely complete payload',()=>download(f,'community.contributions.receipts'));f.db.close();
 // Metadata refuses every oversized original-range row before its payload query; no silent omission/truncation.
 for(const collection of ['site.friends','copy']){f=fixture();await seedOne(f,'site.friends',0);await fixtureWrite(f,'UPDATE site_friends SET note=?','x'.repeat(20000));let payload=false;f.hooks.statement=sql=>{if(sql.startsWith('SELECT * FROM (SELECT rowid AS __history_id')&&sql.includes('site_friends'))payload=true;};const frm=await form(f,await connect(f));provider=null;let e;try{await copy.exportPrivacyAccess(frm.request({collection}),f.env);}catch(x){e=x;}ok(collection+' oversize explicit refusal',e&&e.status===503);eq(collection+' oversize no raw page selected',payload,false);eq(collection+' oversize rolls back grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at,null);f.db.close();}
 f=fixture();await seed(f,'site.friends');await fixtureWrite(f,'UPDATE site_friends SET note=? WHERE rowid=1002','x'.repeat(20000));await refused('oversized undelivered tail refuses original capture',()=>download(f,'site.friends'));f.db.close();
 // Valid current writer maxima survive: own title/answers remain complete; news body remains intentionally omitted.
 f=fixture();await seedOne(f,'community.news.notices',0);await fixtureWrite(f,'UPDATE site_news_notices SET title=?,body=?','😀'.repeat(80),'😀'.repeat(2000));data=(await download(f,'copy')).data;eq('news max Unicode title preserved',data.community.news.notices[0].title,'😀'.repeat(80));ok('news body original omission preserved',!JSON.stringify(data).includes('😀'.repeat(2000)));f.db.close();
 f=fixture();const rules=load('site-data'),answers={};for(const q of rules.QUESTIONS)answers[q.key]=q.key==='logs'?'https://example.org/'+('x'.repeat(180)):rules.cleanText('😀'.repeat(q.max),q.max,q.long);answers.references=[{kind:'discord',key:B,label:'Chosen reference'}];await put(f,'site_users',{discord_id:A,first_login:f.time(),last_login:f.time(),session_version:7});await put(f,'site_applications',{discord_id:A,position:'officer',answers:JSON.stringify(answers),status:'submitted',created_at:f.time(),updated_at:f.time()});data=(await download(f,'copy')).data;for(const q of rules.QUESTIONS)eq(q.key+' maximum Unicode answer kept',data.site.application.answers[q.key],answers[q.key]);ok('max application counterpart key withheld',!JSON.stringify(data).includes(B));await fixtureWrite(f,'UPDATE site_applications SET answers=?',JSON.stringify({extra:'x'.repeat(100000)}));await refused('oversized restored application refuses without truncating',()=>download(f,'copy'));f.db.close();
 console.log('privacy_access_family_history_test: '+checks+' checks PASS');
}
mainFamily().catch(e=>{console.error('FAIL privacy_access_family_history_test',e);process.exitCode=1;});
`;
const fixture=new Module(fixturePath,module);fixture.filename=fixturePath;fixture.paths=Module._nodeModulePaths(__dirname);fixture._compile(source.slice(0,cut)+scenario,fixturePath);
