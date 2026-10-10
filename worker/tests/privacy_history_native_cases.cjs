/** Independent retained-row fixtures derived from the established production schema and own-copy DTOs.
 * Does not read a proposed pagination descriptor or fabricate privacy credentials.
 */
const FIRST=['actions','eventChanges','contributionDecisions'];
const SPECS=[
 ['site.votes','site_votes','ballot,slot,nominee_label,reason,created_at,updated_at'],
 ['site.boardVotes','site_board_votes','role_key,vote,created_at,updated_at'],
 ['site.friends','site_friends','friend_label,note,created_at'],
 ['site.reserved','site_reserved','name,status,created_at,approved_at,queued_at,released_at'],
 ['verification.characters','characters','name,status,bound_at,verified_at,member_since,left_at,source'],
 ['verification.codeRequests','pending','name,created_at,expires_at,consumed_at,consumed_source'],
 ['verification.inviteQueue','invite_queue','name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at'],
 ['verification.renameRecords','rename_holds','old_name,new_name,state,decided_at,closed_at'],
 ['privacyLifecycle.erasureRequests','privacy_serving_jobs','state,hold_reason,staff_access,created_at,completed_at,retain_until'],
 ['privacyLifecycle.providerCleanup','privacy_provider_messages','purpose,state,cleanup_requested,created_at,updated_at,retain_until'],
 ['privacyLifecycle.recoverySuppression','privacy_restore_replay','erased_at,retain_until,scope,recovery_custody'],
 ['community.directory.professions','community_professions','name,skill,updatedAt',12],
 ['community.directory.alts','community_alt_claims','name,status,proof,updatedAt'],
 ['community.directory.crafts','community_craft_offers','profession,recipe,source,updatedAt'],
 ['community.events.signups','community_event_signups','eventId,title,startsAt,status,character,raidRole,updatedAt'],
 ['community.events.created','community_events','id,title,startsAt,status'],
 ['community.events.attendance','community_event_attendance','eventId,title,startsAt,state,reasonCode,recordedAt'],
 ['community.trials.trials','community_trials','status,startedAt,reviewDueAt,outcome,reason,concludedAt,updatedAt,retainUntil'],
 ['community.restrictions.cases','community_restriction_cases','category,setAt,reviewAt,expiresAt,appealStatus,reviewOutcome,reviewedAt,acknowledgedAt,resolvedAt,active'],
 ['community.restrictions.watchList','community_restriction_characters','category,characterName,addedAt,reviewAt,expiresAt,renewedAt,renewalReason'],
 ['community.departures.departures','community_departure_reviews','characterName,kind,observedAt,status,reviewedAt,retainUntil'],
 ['community.contributions.obligations','community_contribution_obligations','guildScope,periodStart,dueAt,policyVersion,amountCopper,paidCopper,eligible,state,acknowledgedAt,officerContactAt,finalNoticeAt,finalAcknowledgedAt,finalOfficerContactAt'],
 ['community.contributions.receipts','community_contribution_receipts','guildScope,source,amountCopper,allocatedCopper,retiredCopper,unallocatedCopper,observedAt,status,voidedAt'],
 ['community.news.notices','site_news_notices','id,title,postedAt,editedAt,keptUntil'],
 ['community.news.deletedNotices','site_news_ops','id,postedAt,keptUntil'],
 ['community.event_delivery.publications','community_event_deliveries','eventId,purpose,revision,state,removalPending,createdAt,updatedAt,retainUntil,result'],
 ['community.event_reminders.reminders','community_event_reminders','eventId,revision,state,startsAt,createdAt,retainUntil'],
 ['community.privacy_access.connections','privacy_access_grants','purpose,created_at,expires_at,consumed_at'],
 ['community.councillor_verification.councillorKeys','councillor_keys','id,signer_guid,created_at,expires_at,revoked_at'],
 ['community.councillor_verification.challenges','councillor_challenges','created_at,expires_at,used_at,mode,max_proofs,proofs_used'],
 ['community.councillor_verification.requests','verification_requests','created_at,expires_at,used_at,state'],
 ['community.councillor_verification.attestations','verification_proofs','id,own_part,created_at,expires_at'],
 ['community.councillor_verification.roleOutcomes','role_settlements','id,purpose,desired,state,reason,attempts,created_at,expires_at,checked_at'],
];
const cases=SPECS.map(([key,table,fields,capacity=Infinity])=>Object.freeze({key,table,fields:fields.split(','),capacity}));
function put(f,table,row){
 const fields=Object.keys(row);if(!/^[a-z_]+$/.test(table)||fields.some(k=>!/^[a-z_]+$/.test(k)))throw Error('fixture identifier refused');
 return f.db.prepare('INSERT INTO '+table+'('+fields.join(',')+')VALUES('+fields.map(()=>'?').join(',')+')').run(...fields.map(k=>row[k]));
}
const token=(prefix,index,length=22)=>prefix.slice(0,6).padEnd(6,'x')+index.toString(36).padStart(length-6,'0');
const hex=index=>index.toString(16).padStart(32,'0');
function profile(f,id,index){
 f.db.prepare('INSERT OR IGNORE INTO community_profiles(discord_id,ref,created_at,updated_at)VALUES(?,?,?,?)').run(id,token('profile',index),f.time()-100,f.time()-100);
}
function event(f,id,index,creator){const t=f.time();
 put(f,'community_events',{id,op_id:id,title:'Own event '+index,starts_at:t+100,duration_min:60,ends_at:t+3700,created_by:creator,created_at:t-100,updated_at:t-100,retain_until:t+3700+30*86400});
}
function policy(f,load){const p=load('community-contribution-policy').DEFAULT_CONTRIBUTION_POLICY;
 f.db.prepare('INSERT OR IGNORE INTO community_contribution_policies(version,amount_copper,anchor_weekday,anchor_hour_utc,grace_hours,final_notice_days,review_days,new_member_exempt_days,created_at)VALUES(?,?,?,?,?,?,?,?,?)')
  .run(p.version,p.amountCopper,p.anchorWeekday,p.anchorHourUtc,p.graceHours,p.finalNoticeDays,p.reviewDays,p.newMemberExemptDays,f.time()-100);
 return p;
}
function caseRow(f,id,owner,staff,index){const t=f.time();
 put(f,'community_restriction_cases',{id,discord_id:owner,category:'conduct_removal',set_by:staff,set_at:t-100,review_at:t+100,expires_at:t+10000,updated_at:t-100,retain_until:t+10000,incarnation:token('case-inc',index)});
}
function qrKey(f,id,owner,index,generation){const t=f.time();
 put(f,'councillor_keys',{id,signer:owner,signer_guid:'Player-own-'+index,public_key:'PRIVATE-public-key-'+id,subject_generation:generation,roster_id:index+1,created_at:t-100,expires_at:t+1000});
}
function qrChallenge(f,nonce,key,owner,index){const t=f.time();
 put(f,'councillor_challenges',{nonce,key_id:key,signer:owner,session_version:7,session_expires:t+1000,created_at:t-10000+index%10000,expires_at:t+1000,mode:'single',max_proofs:1,proofs_used:0});
}
/** Literal legal fixture rows, never a generated grant, session, CommunitySubject or new production query. */
function seed(f,key,owner,n,ctx,offset=0){
 const item=cases.find(c=>c.key===key);if(!item)throw Error('unknown independent fixture '+key);
 if(key==='community.privacy_access.connections')throw Error('Connection history must be seeded by genuine OAuth, never forged grant rows');
 n=Math.min(n,item.capacity);const t=f.time(),peer=owner===ctx.A?ctx.B:ctx.A,staff=ctx.STAFF;
 if(key==='verification.characters')f.db.prepare('INSERT OR IGNORE INTO members(discord_id)VALUES(?)').run(owner);
 if(key.startsWith('community.directory.'))profile(f,owner,offset+1);
 let p;if(key.startsWith('community.contributions.'))p=policy(f,ctx.load);
 const professionNames=['alchemy','blacksmithing','enchanting','engineering','herbalism','leatherworking','mining','skinning','tailoring','cooking','fishing','first_aid'];
 f.db.exec('BEGIN');try{for(let j=0;j<n;j++){
  const i=offset+j,id=token('row',i),name='Own character '+i,at=t-10000+j;
  let row;
  switch(key){
   case 'site.votes':row={voter_id:owner,ballot:'officer',slot:i+1,nominee_kind:'discord',nominee_key:peer,nominee_label:'Chosen member '+i,reason:'Own reason '+i,created_at:at,updated_at:at};break;
   case 'site.boardVotes':row={voter_id:owner,candidate_id:peer,role_key:'retained-role-'+i,vote:i%2?-1:1,created_at:at,updated_at:at};break;
   case 'site.friends':row={owner_id:owner,friend_kind:'discord',friend_key:String(BigInt(peer)+BigInt(i)),friend_label:'Chosen friend '+i,note:'Own note '+i,created_at:at};break;
   case 'site.reserved':row={owner_id:owner,name,name_key:'own-'+i,status:'released',created_at:at,approved_by:staff,approved_at:at,queued_at:at,released_by:staff,released_at:at};break;
   case 'verification.characters':row={name_key:'own-'+i,name,discord_id:owner,status:'left',bound_at:at,verified_at:at,member_since:at,left_at:at,source:'whisper',guid:'Private-original-guid-'+i};break;
   case 'verification.codeRequests':row={discord_id:owner,name_key:'own-'+i,name,created_at:at,expires_at:t+1000,consumed_source:'whisper',nonce:'PRIVATE-ticket-nonce-'+i};break;
   case 'verification.inviteQueue':row={discord_id:owner,name_key:'own-'+i,name,status:'expired',created_at:at,approved_by:staff,claimed_by:staff,claimed_at:at,note:'PRIVATE-Discord-note-'+peer,last_reason:'guild_full',last_reason_at:at};break;
   case 'verification.renameRecords':row={discord_id:owner,old_name:name,new_name:'Renamed character '+i,char_key:'own-'+i,guid:'PRIVATE-renamed-guid-'+i,nonce:'PRIVATE-rename-nonce-'+i,state:'cancelled',decided_by:staff,decided_at:at,closed_by:staff,closed_at:at};break;
   case 'privacyLifecycle.erasureRequests':row={operation_id:hex(i+1),subject_id:owner,subject_generation:ctx.G,request_digest:'d'.repeat(64),original_session_version:7,original_session_expires:t+1000,state:'complete',staff_access:'none',created_at:at,completed_at:at,retain_until:at+31622400};break;
   case 'privacyLifecycle.providerCleanup':row={operation_id:hex(i+1),purpose:'notice',subjects:JSON.stringify([{id:owner,generation:ctx.G}]),channel_id:staff,message_id:peer,state:'known',created_at:at,updated_at:at,retain_until:at+31622400};break;
   case 'privacyLifecycle.recoverySuppression':row={operation_id:hex(i+1),subject_id:owner,retired_generation:ctx.G,erased_at:at,retain_until:at+31622400,scope:'serving_account',custody_receipt_digest:'c'.repeat(64)};break;
   case 'community.directory.professions':row={discord_id:owner,profession:professionNames[j],skill:400,updated_at:at};break;
   case 'community.directory.alts':row={discord_id:owner,name,name_key:'own-'+i,status:'officer_confirmed',proof:'keeper',claimed_at:at,reviewed_by:staff,reviewed_at:at,updated_at:at};break;
   case 'community.directory.crafts':row={discord_id:owner,profession:'alchemy',recipe_name:'Own recipe '+i,recipe_key:'own-recipe-'+i,updated_at:at};break;
   case 'community.events.created':event(f,id,i,owner);continue;
   case 'community.events.signups':event(f,id,i,staff);row={event_id:id,discord_id:owner,status:'yes',character_name:name,character_key:'own-'+i,raid_role:'damage',rsvp_starts_at:t+100,updated_at:at,write_nonce:'PRIVATE-rsvp-nonce'};break;
   case 'community.events.attendance':event(f,id,i,staff);row={event_id:id,discord_id:owner,state:'present',recorded_by:staff,recorded_at:at,write_nonce:'PRIVATE-attendance-nonce'};break;
   case 'community.trials.trials':row={id,op_id:id,discord_id:owner,sponsor_discord_id:staff,started_at:at,review_due_at:t+100,status:'passed',outcome_reason:'review_passed',concluded_at:at,created_by:staff,updated_by:staff,created_at:at,updated_at:at,incarnation:token('trial-inc',i),retain_until:t+10000};break;
   case 'community.restrictions.cases':caseRow(f,id,owner,staff,i);continue;
   case 'community.restrictions.watchList':caseRow(f,id,owner,staff,i);row={case_id:id,character_key:'own-'+i,character_name:name,proof_key:'PRIVATE-proof-'+i,guid:'PRIVATE-watch-guid-'+i,added_at:at,added_by:staff,review_at:t+100,expires_at:t+10000};break;
   case 'community.departures.departures':row={id,discord_id:owner,character_key:'own-'+i,character_name:name,proof_key:'PRIVATE-departure-key-'+i,kind:'left',observed_at:at,status:'acknowledged',reviewed_by:staff,reviewed_at:at,created_at:at,retain_until:t+10000};break;
   case 'community.contributions.obligations':{const period=ctx.load('community-contribution-policy').periodStart(t,p)-7*86400;row={guild_scope:'own-scope-'+i,discord_id:owner,period_start:period,due_at:period+7*86400,policy_version:p.version,amount_copper:p.amountCopper,eligible:1,state:'open',retain_until:t+10000,created_at:at,updated_at:at,op_nonce:'PRIVATE-obligation-nonce-'+i};break;}
   case 'community.contributions.receipts':row={id,guild_scope:'olympus',source:'mail',source_id:'PRIVATE-payment-source-'+i,payload_hash:'PRIVATE-receipt-hash',payer_name:'PRIVATE-payer-name-'+i,amount_copper:10000,observed_at:at,observer_discord_id:staff,matched_discord_id:owner,status:'matched',retain_until:t+10000,created_at:at};break;
   case 'community.news.notices':row={id,op_hash:'PRIVATE-news-hash',title:'Own notice '+i,body:'PRIVATE-notice-body-'+peer,created_by:owner,created_at:at,updated_by:staff,updated_at:at,retain_until:at+86400};break;
   case 'community.news.deletedNotices':row={id,nonce:'PRIVATE-news-op-nonce',created_by:owner,created_at:at,purge_after:at+86400};break;
   case 'community.event_delivery.publications':event(f,id,i,staff);row={event_id:id,purpose:'publication',event_revision:1,starts_at:t+100,guild_id:staff,channel_id:staff,message_id:peer,frozen_content:'PRIVATE-publication-content',payload_hash:'PRIVATE-publication-hash',op_id:id,claim_nonce:id,state:'posted',actor:owner,session_version:7,session_expires:t+1000,created_at:at,updated_at:at,retain_until:at+366*86400,result_code:'published'};break;
   case 'community.event_reminders.reminders':event(f,id,i,staff);row={event_id:id,event_revision:1,starts_at:t+100,actor:owner,consent_version:7,guild_id:staff,channel_id:staff,host:'PRIVATE-reminder-host',op_id:id,claim_nonce:id,state:'posted',message_id:peer,frozen_content:'PRIVATE-reminder-content',created_at:at,updated_at:at,retain_until:at+366*86400};break;
   case 'community.councillor_verification.councillorKeys':qrKey(f,id,owner,i,ctx.G);continue;
   case 'community.councillor_verification.challenges':qrKey(f,id,owner,i,ctx.G);qrChallenge(f,token('challenge',i),id,owner,i);continue;
   case 'community.councillor_verification.requests':row={code:'PRIVATE-request-code-'+i,requester:owner,subject_generation:ctx.G,created_at:at,expires_at:t+1000,state:'pending',session_version:7,session_expires:t+1000};break;
   case 'community.councillor_verification.attestations':{const key=token('key',i),challenge=token('challenge',i),code='PRIVATE-proof-request-'+i;qrKey(f,key,staff,i,ctx.G);qrChallenge(f,challenge,key,staff,i);put(f,'verification_requests',{code,requester:owner,created_at:at,expires_at:t+1000,state:'proved'});row={id,code,challenge,signer:staff,key_id:key,requester:owner,requester_guid:'PRIVATE-requester-guid',requester_name:name,native_rank:1,rank_name:'PRIVATE-rank-name',native_profile:'PRIVATE-native-profile',signer_guid:'PRIVATE-signer-guid',snapshot_id:1,subject_generation:ctx.G,digest:'PRIVATE-proof-digest-'+i,created_at:at,expires_at:t+1000};break;}
   case 'community.councillor_verification.roleOutcomes':row={id,subject:owner,purpose:'verification',guild_id:staff,role_id:staff,desired:1,state:'held',reason:'native_review',claim_nonce:'PRIVATE-role-claim',subject_generation:ctx.G,request_digest:'PRIVATE-role-proof',roster_id:1,native_guid:'PRIVATE-native-guid',native_profile:'PRIVATE-native-profile',native_rank:1,native_rank_name:'PRIVATE-native-rank',created_at:at,expires_at:t+1000};break;
   default:throw Error('Independent fixture not implemented '+key);
  }
  put(f,item.table,row);
 }f.db.exec('COMMIT');}catch(e){f.db.exec('ROLLBACK');throw Error(key+' native schema fixture: '+e.message,{cause:e});}
 return n;
}
module.exports={FIRST,cases,collections:[...FIRST,...cases.map(c=>c.key)],seed,put,token,hex};
