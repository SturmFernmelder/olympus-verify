// Native source tests; real identify OAuth fixture. No effect endpoint or external provider is called.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixturePath=path.join(__dirname,'privacy_access_test.cjs'),source=fs.readFileSync(fixturePath,'utf8'),cut=source.indexOf('async function main(){');
if(cut<0)throw Error('fixture seam');
const scenario=String.raw`
const history=load('privacy-access-history'),family=load('privacy-access-family-history'),community=load('community-context');
load('index'); // Actual serving graph: all thirteen families, including shared-publication own metadata.
function put(f,t,r){const keys=Object.keys(r);f.db.prepare('INSERT INTO '+t+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(r));}
const hex=(i,n=32)=>i.toString(16).padStart(n,'0'),eid=i=>'e'+String(i).padStart(21,'0');
function member(f,id=A){if(!f.db.prepare('SELECT 1 FROM members WHERE discord_id=?').get(id))put(f,'members',{discord_id:id,banned:0});}
function profile(f){put(f,'community_profiles',{discord_id:A,ref:'p'.repeat(22),created_at:f.time(),updated_at:f.time()});}
function policy(f){if(!f.db.prepare('SELECT 1 FROM community_contribution_policies').get())put(f,'community_contribution_policies',{version:'p',amount_copper:100,anchor_weekday:0,anchor_hour_utc:0,grace_hours:1,final_notice_days:1,review_days:1,new_member_exempt_days:0,created_at:f.time()});}
function event(f,i,who=B){if(!f.db.prepare('SELECT 1 FROM community_events WHERE id=?').get(eid(i)))put(f,'community_events',{id:eid(i),op_id:'o'+i,title:'Event '+i,starts_at:f.time()+600,duration_min:60,ends_at:f.time()+4200,created_by:who,created_at:f.time()-5,updated_at:f.time(),retain_until:f.time()+100000});}
function key(f){if(!f.db.prepare("SELECT 1 FROM councillor_keys WHERE id='key'").get())put(f,'councillor_keys',{id:'key',signer:B,signer_guid:'GUID-counterpart',public_key:'private-public-key',subject_generation:G,roster_id:1,created_at:f.time(),expires_at:f.time()+9000});}
function challenge(f){key(f);if(!f.db.prepare("SELECT 1 FROM councillor_challenges WHERE nonce='private-lease'").get())put(f,'councillor_challenges',{nonce:'private-lease',key_id:'key',signer:B,session_version:7,session_expires:f.time()+900,created_at:f.time(),expires_at:f.time()+300,mode:'automatic',max_proofs:10});}
function seedOne(f,c,i,who=A){const at=f.time()-100,keep=f.time()+100000;
 switch(c){
 case 'site.votes':put(f,'site_votes',{voter_id:who,ballot:'officer',slot:i+1,nominee_kind:'discord',nominee_key:B,nominee_label:'Chosen '+i,reason:'Own text',created_at:at,updated_at:at});break;
 case 'site.boardVotes':put(f,'site_board_votes',{voter_id:who,candidate_id:hex(i,17),role_key:'officer',vote:1,created_at:at,updated_at:at});break;
 case 'site.friends':put(f,'site_friends',{owner_id:who,friend_kind:'discord',friend_key:hex(i,17),friend_label:'Chosen '+i,note:'Own note',created_at:at});break;
 case 'site.reserved':put(f,'site_reserved',{owner_id:who,name:'Name '+i,name_key:'name'+i,status:'released',created_at:at,approved_by:STAFF});break;
 case 'verification.characters':member(f,who);put(f,'characters',{name_key:'name'+who+i,name:'Name '+i,discord_id:who,status:'left',bound_at:at,guid:'hiddenGUID'+i});break;
 case 'verification.codeRequests':put(f,'pending',{discord_id:who,name_key:'name'+i,name:'Name '+i,created_at:at,expires_at:keep,nonce:'hidden-nonce'+i});break;
 case 'verification.inviteQueue':put(f,'invite_queue',{discord_id:who,name_key:'name'+i,name:'Name '+i,status:'cancelled',created_at:at,note:who,approved_by:STAFF});break;
 case 'verification.renameRecords':put(f,'rename_holds',{discord_id:who,old_name:'Old '+i,new_name:'New '+i,char_key:'new'+i,nonce:'hidden'+i,state:'approved',decided_by:STAFF,decided_at:at});break;
 case 'privacyLifecycle.erasureRequests':put(f,'privacy_serving_jobs',{operation_id:hex(i),subject_id:who,subject_generation:G,request_digest:'d'.repeat(64),original_session_version:7,original_session_expires:keep,state:'complete',hold_reason:null,completed_at:at,created_at:at,retain_until:at+31622400});break;
 case 'privacyLifecycle.providerCleanup':put(f,'privacy_provider_messages',{operation_id:hex(i),purpose:'review',subjects:JSON.stringify([{id:who,generation:G}]),channel_id:B,message_id:STAFF,state:'known',created_at:at,updated_at:at,retain_until:at+31622400});break;
 case 'privacyLifecycle.recoverySuppression':put(f,'privacy_restore_replay',{operation_id:hex(i),subject_id:who,retired_generation:G,erased_at:at,retain_until:at+31622400,scope:'serving_account'});break;
 case 'community.directory.professions':put(f,'community_professions',{discord_id:who,profession:load('community-directory').PROFESSIONS[i],skill:i,updated_at:at});break;
 case 'community.directory.alts':put(f,'community_alt_claims',{discord_id:who,name:'Alt '+i,name_key:'alt'+i,claimed_at:at,updated_at:at,reviewed_by:STAFF});break;
 case 'community.directory.crafts':put(f,'community_craft_offers',{discord_id:who,profession:'alchemy',recipe_name:'Recipe '+i,recipe_key:'recipe'+i,updated_at:at});break;
 case 'community.events.created':event(f,i,who);break;
 case 'community.events.signups':event(f,i);put(f,'community_event_signups',{event_id:eid(i),discord_id:who,status:'yes',rsvp_starts_at:f.time()+600,updated_at:at});break;
 case 'community.events.attendance':event(f,i);put(f,'community_event_attendance',{event_id:eid(i),discord_id:who,state:'present',recorded_by:STAFF,recorded_at:at});break;
 case 'community.trials.trials':put(f,'community_trials',{id:eid(i),op_id:'hidden'+i,discord_id:who,sponsor_discord_id:STAFF,started_at:at,review_due_at:keep,created_by:STAFF,created_at:at,updated_at:at,incarnation:hex(i),retain_until:keep});break;
 case 'community.restrictions.cases':put(f,'community_restriction_cases',{id:eid(i),discord_id:who,category:'ban',set_by:STAFF,set_at:at,review_at:keep,updated_at:at,incarnation:hex(i)});break;
 case 'community.restrictions.watchList':seedOne(f,'community.restrictions.cases',i,who);put(f,'community_restriction_characters',{case_id:eid(i),character_key:'same',character_name:'Same Name',proof_key:'hidden',guid:'hiddenGUID',added_at:at,added_by:STAFF,review_at:keep-1,expires_at:keep});break;
 case 'community.departures.departures':put(f,'community_departure_reviews',{id:eid(i),discord_id:who,character_key:'name'+i,character_name:'Name '+i,proof_key:'hidden'+i,kind:'left',observed_at:at,status:'open',created_at:at,retain_until:keep});break;
 case 'community.contributions.obligations':policy(f);put(f,'community_contribution_obligations',{guild_scope:'I',discord_id:who,period_start:at+i,due_at:keep,policy_version:'p',amount_copper:100,eligible:1,retain_until:keep,created_at:at,updated_at:at});break;
 case 'community.contributions.receipts':put(f,'community_contribution_receipts',{id:eid(i),guild_scope:'I',source:'officer_manual',source_id:'hidden-source'+i,payload_hash:'hidden',payer_name:'hidden-payer',amount_copper:100,observed_at:at,observer_discord_id:STAFF,matched_discord_id:who,status:'matched',retain_until:keep,created_at:at});break;
 case 'community.news.notices':put(f,'site_news_notices',{id:eid(i),op_hash:'hidden',title:'Notice '+i,body:'hidden-body',created_by:who,created_at:at,updated_by:STAFF,updated_at:at,retain_until:keep});break;
 case 'community.news.deletedNotices':put(f,'site_news_ops',{id:eid(i),nonce:'hidden',created_by:who,created_at:at,purge_after:keep});break;
 case 'community.event_delivery.publications':event(f,i);put(f,'community_event_deliveries',{event_id:eid(i),purpose:'publication',event_revision:1,starts_at:f.time()+600,guild_id:B,channel_id:B,message_id:STAFF,op_id:'o'.repeat(22),claim_nonce:'n'.repeat(22),state:'posted',actor:who,created_at:at,updated_at:at,retain_until:keep,frozen_content:'hidden-content',result_code:'published'});break;
 case 'community.event_reminders.reminders':event(f,i);put(f,'community_event_reminders',{event_id:eid(i),event_revision:1,starts_at:f.time()+600,guild_id:B,channel_id:B,host:'olympus.roachcouncil.com',op_id:'o'.repeat(22),state:'armed',actor:who,created_at:at,updated_at:at,retain_until:keep,frozen_content:'hidden-content'});break;
 case 'community.councillor_verification.councillorKeys':put(f,'councillor_keys',{id:'key'+i,signer:who,signer_guid:'Own GUID '+i,public_key:'hidden-key'+i,subject_generation:G,roster_id:1,created_at:at,expires_at:keep});break;
 case 'community.councillor_verification.challenges':key(f);put(f,'councillor_challenges',{nonce:'hidden-nonce'+i,key_id:'key',signer:who,session_version:7,session_expires:keep,created_at:at,expires_at:keep,mode:'single',max_proofs:1});break;
 case 'community.councillor_verification.requests':put(f,'verification_requests',{code:'hidden-code'+i,requester:who,created_at:at,expires_at:keep,state:'pending'});break;
 case 'community.councillor_verification.attestations':challenge(f);put(f,'verification_requests',{code:'hidden-code'+i,requester:who,created_at:at,expires_at:keep});put(f,'verification_proofs',{id:'proof'+i,code:'hidden-code'+i,challenge:'private-lease',signer:B,key_id:'key',requester:who,requester_guid:'hiddenGUID',requester_name:'hidden-name',native_rank:1,rank_name:'Officer',native_profile:'beta-five',signer_guid:'hiddenGUID',snapshot_id:1,digest:'hidden-digest'+i,created_at:at,expires_at:keep});break;
 case 'community.councillor_verification.roleOutcomes':put(f,'role_settlements',{id:'role'+i,subject:who,purpose:'membership',guild_id:B,role_id:STAFF,desired:1,state:'settled',reason:'granted',created_at:at,expires_at:keep});break;
 case 'community.ruleset_publication.operations':put(f,'ruleset_publications',{guild_id:STAFF,publication_id:'publication'+who+i,target_key:'olympus-info',selection_revision:i+1,profile_revision:load('ruleset-profile').currentRulesetProfile().revision,plan_hash:'hidden-plan',actor:who,actor_generation:G,session_version:7,session_expires:keep,channel_id:STAFF,message_id:B,frozen_payload:'hidden-public-copy',payload_hash:'hidden-digest',claim_nonce:'hidden-nonce',stage:'pin',state:'applied',result_code:'confirmed',created_at:at,updated_at:at,actor_retain_until:keep});break;
 default:throw Error('unknown test seed '+c);
 }
}
async function seed(f,c,n=1002){if(c.startsWith('community.directory.')&&c!=='community.directory.crafts')profile(f);
 if(c==='community.privacy_access.connections'){for(let i=0;i<501;i++)await connect(f);return;}
 f.db.exec('BEGIN');try{for(let i=0;i<n;i++)seedOne(f,c,i);seedOne(f,c,c==='community.directory.professions'?0:10000,B);f.db.exec('COMMIT');}catch(e){f.db.exec('ROLLBACK');throw e;}}
async function download(f,c,cursor=null){const con=await connect(f),frm=await form(f,con);provider=null;let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);const response=await copy.exportPrivacyAccess(frm.request({collection:c,cursor:cursor??''}),f.env);f.hooks.statement=null;f.hooks.beforeBatch=null;eq(c+' attempts',attempts,c==='copy'?88:8);eq(c+' native batch size',batches,[c==='copy'?87:7]);return {data:await response.json(),frm};}
const sorted=a=>Array.from(a,x=>JSON.stringify(x)).sort();
async function original(f,c){if(!c.startsWith('community.'))return null;const plan=community.communityExportPlan(f.env,A),out=await f.env.DB.batch(plan.statements.map(s=>/ LIMIT 1000$/.test(s.sql)?f.env.DB.prepare(s.sql.replace(/ LIMIT 1000$/,'')).bind(A):s)),body=plan.shape(out),parts=c.split('.');const value=body[parts[1]][parts[2]];return Array.isArray(value)?value:value.rows;}
async function mainFamily(){
 eq('closed thirty-four family histories',family.PRIVACY_FAMILY_HISTORY_COLLECTIONS.length,34);eq('all histories thirty-seven',history.PRIVACY_ALL_HISTORY_COLLECTIONS.length,37);eq('actual producer graph13',community.communityDataNames().length,13);eq('actual producer graph34 statements',community.communityExportPlan(fixture().env,A).statements.length,34);
 for(const c of family.PRIVACY_FAMILY_HISTORY_COLLECTIONS){
  const f=fixture(),n=c==='community.directory.professions'?12:1002;await seed(f,c,n);const before=count(f,'sqlite_master');
  const baseline=await original(f,c);const first=(await download(f,c)).data.history;
  const want=c==='community.privacy_access.connections'?1004:n;
  eq(c+' full retained count',first.capture.count,want);eq(c+' bounded first',first.entries.length,Math.min(want,1000));eq(c+' complete truth',first.capture.complete,want<=1000);
  ok(c+' safe projection',!JSON.stringify(first.entries).includes(B)&&!JSON.stringify(first.entries).includes(STAFF)&&!JSON.stringify(first.entries).includes('hidden-')&&!JSON.stringify(first.entries).includes('__history'));
  let all=first.entries;
  if(first.nextCursor){const tail=(await download(f,c,first.nextCursor)).data.history;all=all.concat(tail.entries);eq(c+' tailcount',tail.entries.length,want-1000);eq(c+' fixed deadline',tail.capture.expiresAt,first.capture.expiresAt);eq(c+' complete aftertail',tail.capture.complete,true);eq(c+' terminates',tail.nextCursor,null);}
  eq(c+' all range delivered',all.length,want);if(baseline&&c!=='community.privacy_access.connections')eq(c+' exact existing own DTO parity',sorted(all),sorted(baseline));
  eq(c+' no DDL',count(f,'sqlite_master'),before);
  const initial=(await download(f,'copy')).data;eq(c+' initial all37 continued',Object.keys(initial.coverage.histories).length,37);const meta=initial.coverage.histories[c];eq(c+' aggregate count',meta.capture.count,c==='community.privacy_access.connections'?1008:want);
  if(c!=='community.privacy_access.connections'){let v=initial;for(const k of c.split('.'))v=v[k];const rows=Array.isArray(v)?v:v.rows;eq(c+' aggregate capped',rows.length,Math.min(want,25));eq(c+' aggregate DTO equalsfirst',rows,first.entries.slice(0,25));}
  if(meta.nextCursor&&c!=='community.privacy_access.connections'){const continuation=(await download(f,c,meta.nextCursor)).data.history;eq(c+' aggregate tail resumes at25',continuation.capture.delivered,want);eq(c+' aggregate tail exact',continuation.entries,all.slice(25));eq(c+' preview deadline retained',continuation.capture.expiresAt,meta.capture.expiresAt);}
  if(c==='community.directory.professions'){f.db.exec('PRAGMA ignore_check_constraints=ON');put(f,'community_professions',{discord_id:A,profession:'not-a-profession',skill:999,updated_at:f.time()});await refused('malformed restored profession no false completeness',()=>download(f,c));}
  f.db.close();
 }
 // Optional-profile semantics stay exact; crafts still appear with no profile, professions/alts do not.
 let f=fixture();seedOne(f,'community.directory.professions',0);seedOne(f,'community.directory.alts',0);seedOne(f,'community.directory.crafts',0);
 let data=(await download(f,'copy')).data;eq('no profile suppresses existing professions/alts',[data.community.directory.professions.length,data.community.directory.alts.length],[0,0]);eq('no profile preserves crafts',data.community.directory.crafts.length,1);f.db.close();
 // Stored four actor forms are shared by aggregate and separate decisions; counterpart identity stays withheld.
 f=fixture();for(const [i,actor]of [A,'user:'+A,'member:'+A,'staff:'+A].entries())put(f,'community_contribution_decisions',{guild_scope:'I',discord_id:B,obligation_id:i+1,action:'state_open',actor,member_revision:1,nonce:'hidden',at:f.time(),retain_until:f.time()+1000});
 data=(await download(f,'copy')).data;eq('all four own actor forms aggregate',data.contributionDecisions.rows.map(r=>[r.own_subject,r.own_actor]),[[0,1],[0,1],[0,1],[0,1]]);eq('separate actor forms agree',(await download(f,'contributionDecisions')).data.history.entries.length,4);f.db.close();
 for(const kind of ['expiry','tamper','cross-collection','cross-account','delete-row','new-generation','null-generation','lost-primary']){
  f=fixture();if(kind==='new-generation')subject(f);await seed(f,'site.friends');const first=(await download(f,'site.friends')).data.history;
  if(kind==='expiry')f.advance(86400);if(kind==='delete-row')f.db.exec('DELETE FROM site_friends WHERE rowid=1');if(kind==='new-generation')f.db.prepare('UPDATE privacy_subjects SET generation=?').run('b'.repeat(32));if(kind==='null-generation')subject(f);
  let cursor=first.nextCursor,c='site.friends';if(kind==='tamper')cursor=cursor.slice(0,-2)+'AA';if(kind==='cross-collection')c='site.boardVotes';
  let frm=await form(f,await connect(f,kind==='cross-account'?B:A));provider=null;
  if(kind==='lost-primary')f.hooks.afterBatch=s=>{if(s.length===7){f.hooks.afterBatch=null;throw Error('lost read result');}};
  await refused(kind+' family continuation refuses',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env));
  if(kind==='lost-primary')await refused('spent lost-primary grant never rereads',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env));f.db.close();
 }
 // Expired receipts without live allocation are absent from both count and payload, not cursor gaps.
 f=fixture();seedOne(f,'community.contributions.receipts',0);seedOne(f,'community.contributions.receipts',1);f.db.prepare('UPDATE community_contribution_receipts SET retain_until=? WHERE id=?').run(f.time(),eid(0));data=(await download(f,'community.contributions.receipts')).data.history;eq('expired unpaid receipt excluded from selected count',data.capture.count,1);eq('expired unpaid receipt omitted',data.entries.length,1);
 policy(f);seedOne(f,'community.contributions.obligations',0);put(f,'community_contribution_allocation_events',{receipt_id:eid(0),obligation_id:1,amount_copper:40,member_revision:1,nonce:'hidden',actor:STAFF,created_at:f.time()});data=(await download(f,'community.contributions.receipts')).data.history;eq('expired allocated receipt remains eligible',data.capture.count,2);eq('expired relationship minimized amount',data.entries[0].amountCopper,40);eq('expired relationship no unallocated amount',data.entries[0].unallocatedCopper,0);eq('receipt original shape parity',sorted(data.entries),sorted(await original(f,'community.contributions.receipts')));
 f.db.prepare('UPDATE community_contribution_receipts SET amount_copper=? WHERE id=?').run(9007199254740992,eid(1));await refused('receipt overflow refuses no falsely complete payload',()=>download(f,'community.contributions.receipts'));f.db.close();
 // Metadata refuses every oversized original-range row before its payload query; no silent omission/truncation.
 for(const collection of ['site.friends','copy']){f=fixture();seedOne(f,'site.friends',0);f.db.prepare('UPDATE site_friends SET note=?').run('x'.repeat(20000));let payload=false;f.hooks.statement=sql=>{if(sql.startsWith('SELECT * FROM (SELECT rowid AS __history_id')&&sql.includes('site_friends'))payload=true;};const frm=await form(f,await connect(f));provider=null;let e;try{await copy.exportPrivacyAccess(frm.request({collection}),f.env);}catch(x){e=x;}ok(collection+' oversize explicit refusal',e&&e.status===503);eq(collection+' oversize no raw page selected',payload,false);eq(collection+' oversize rolls back grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at,null);f.db.close();}
 f=fixture();await seed(f,'site.friends');f.db.prepare('UPDATE site_friends SET note=? WHERE rowid=1002').run('x'.repeat(20000));await refused('oversized undelivered tail refuses original capture',()=>download(f,'site.friends'));f.db.close();
 // Valid current writer maxima survive: own title/answers remain complete; news body remains intentionally omitted.
 f=fixture();seedOne(f,'community.news.notices',0);f.db.prepare('UPDATE site_news_notices SET title=?,body=?').run('😀'.repeat(80),'😀'.repeat(2000));data=(await download(f,'copy')).data;eq('news max Unicode title preserved',data.community.news.notices[0].title,'😀'.repeat(80));ok('news body original omission preserved',!JSON.stringify(data).includes('😀'.repeat(2000)));f.db.close();
 f=fixture();const rules=load('site-data'),answers={};for(const q of rules.QUESTIONS)answers[q.key]=q.key==='logs'?'https://example.org/'+('x'.repeat(180)):rules.cleanText('😀'.repeat(q.max),q.max,q.long);answers.references=[{kind:'discord',key:B,label:'Chosen reference'}];put(f,'site_users',{discord_id:A,first_login:f.time(),last_login:f.time(),session_version:7});put(f,'site_applications',{discord_id:A,position:'officer',answers:JSON.stringify(answers),status:'submitted',created_at:f.time(),updated_at:f.time()});data=(await download(f,'copy')).data;for(const q of rules.QUESTIONS)eq(q.key+' maximum Unicode answer kept',data.site.application.answers[q.key],answers[q.key]);ok('max application counterpart key withheld',!JSON.stringify(data).includes(B));f.db.prepare('UPDATE site_applications SET answers=?').run(JSON.stringify({extra:'x'.repeat(100000)}));await refused('oversized restored application refuses without truncating',()=>download(f,'copy'));f.db.close();
 console.log('privacy_access_family_history_test: '+checks+' checks PASS');
}
mainFamily().catch(e=>{console.error('FAIL privacy_access_family_history_test',e);process.exitCode=1;});
`;
const fixture=new Module(fixturePath,module);fixture.filename=fixturePath;fixture.paths=Module._nodeModulePaths(__dirname);fixture._compile(source.slice(0,cut)+scenario,fixturePath);
