// Genuine D1, original Native grants/claims and receipt observer. Only Discord HTTP is synthetic.
import {demote, reportRankMismatches} from '../src/roster.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {countStatements} from '../src/roster-effects.ts';
import {callBudget} from '../src/roles.ts';
import {readPrivacySubject} from '../src/privacy-serving-authority.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {requestRoleReconciliation242} from '../src/role-reconcile242.ts';
import {postPrivacyMessage} from '../src/privacy-provider-messages.ts';

const MEMBER='800000000000000400',OFFICER='800000000000000401';
const MEMBER_ROLE='1552077551839617104',OFFICER_ROLE='1554262223038324840';
const LOG='800000000000000777',STAFF='800000000000000778';
const control=async action=>(await fetch('https://discord.com/__fixture/departure',{method:'POST',body:JSON.stringify({action})})).json();

export async function officerDeparture307(env,writer,check,publish,members,rawDb){
 const warning={...env,ROLE_OFFICER:OFFICER_ROLE,ROLE_GUILD_LEADER:MEMBER_ROLE,ROLE_GUILD_MASTER:'',
   OFFICER_RANK_NAMES:'Guild Master,Officer,Member',CHANNEL_MOD_ALERTS:STAFF};
 await control('hold-owner');
 check('an unreadable authoritative Discord owner is not reported as a missing officer',await reportRankMismatches(warning,members)===0);
 check('actual Discord owner and existing effective officer roles suppress false warnings without grants',await reportRankMismatches(warning,members)===0);
 const wrongGuid=members.map(row=>({...row,guid:'Player-4613-FFFFFFFF'}));
 check('an officer name with a different native GUID supplies no warning identity',await reportRankMismatches(warning,wrongGuid)===0);
 const missing={...warning,OFFICER_RANK_NAMES:'Alt',ROLE_GUILD_LEADER:''};
 check('a current exact-GUID linked officer candidate without effective staff access is reported',await reportRankMismatches(missing,members)===1);
 let observed=await control('observe');
 check('warning uses a stable readable account ID and claims no role change',observed.messages.some(row=>row.channel===STAFF
   &&row.content.includes('800000000000000402')&&row.content.includes('no configured officer-access role'))&&observed.deletes.length===0);
 const notice=await writer.prepare("SELECT subjects,state FROM privacy_provider_messages WHERE purpose='notice' AND channel_id=?1").bind(STAFF).first();
 check('officer warning retains every affected lifecycle capture in message custody',notice?.state==='known'
   &&JSON.parse(notice.subjects).length===1&&JSON.parse(notice.subjects)[0].id==='800000000000000402');
 const report=await writer.prepare("SELECT details FROM audit WHERE action='rank.mismatch_reported' ORDER BY id DESC LIMIT 1").first();
 check('aggregate warning audit stores counts rather than unreferenced account IDs',report&&!Object.hasOwn(JSON.parse(report.details),'who'));

 const logged={...env,CHANNEL_SERVER_LOG:LOG,CHANNEL_MOD_ALERTS:'',CHANNEL_RECRUITMENT_REVIEW:STAFF};
 await demote(logged,OFFICER,'live officer','Live Officer','fixture confirmed native departure');
 observed=await control('observe');
 check('confirmed departure queues canonical reconciliation without claiming legacy removal',observed.officerPresent
   &&observed.messages.some(row=>row.channel===LOG&&row.content.includes(OFFICER)&&row.content.includes('reconciliation queued')
      &&!row.content.includes('role absent or removed')&&!row.content.includes('<@'+OFFICER+'>')));
 const request=await writer.prepare("SELECT id FROM audit WHERE action='role.request242' AND subject=?1").bind(OFFICER).first();
 check('canonical departure uses the original durable account reconciliation queue',Number.isSafeInteger(request?.id));

 // A partial/newest snapshot cannot borrow earlier complete-roster authority.
 const snapshot=await writer.prepare('SELECT id FROM roster_snapshots ORDER BY id DESC LIMIT 1').first();
 await writer.prepare('UPDATE roster_snapshots SET complete=0 WHERE id=?1').bind(snapshot.id).run();
 const incomplete=await runNativeSubject232(logged,OFFICER,callBudget(logged),2);
 observed=await control('observe');
 check('partial roster holds canonical departure without a DELETE or final notice',incomplete.state==='held'
   &&observed.deletes.length===0&&!observed.messages.some(row=>row.content.includes('removal acknowledged and confirmed')));
 await writer.prepare('UPDATE roster_snapshots SET complete=1 WHERE id=?1').bind(snapshot.id).run();
 members.splice(members.findIndex(row=>row.name==='Live Officer'),1);await publish();
 const count={used:0},counted=countStatements(logged,count);
 const removed=await runNativeSubject232(counted,OFFICER,callBudget(counted),2);
 check('complete owned departure with two private destinations fits the existing 200-statement admission allowance',count.used>0&&count.used<=200,{physicalStatementCharge:count.used});
 observed=await control('observe');
 const receipt=await writer.prepare("SELECT id,reason,attempts,state FROM role_settlements WHERE subject=?1 AND role_id=?2 AND desired=0 ORDER BY created_at DESC,id DESC LIMIT 1").bind(OFFICER,OFFICER_ROLE).first();
 check('owned canonical departure has original DELETE ACK, current absence and durable settled receipt',removed.rank?.outcomes.some(row=>row.state==='settled'&&row.reason==='canonical233_delete_acknowledged_and_confirmed')
   &&receipt?.state==='settled'&&receipt.attempts===1&&receipt.reason==='canonical233_delete_acknowledged_and_confirmed'&&!observed.officerPresent);
 const completions=(channel,subject)=>observed.messages.filter(row=>row.channel===channel&&row.content.includes(subject)&&row.content.includes('removal acknowledged and confirmed'));
 const completed=channel=>completions(channel,OFFICER);
 check('private log and recruitment-review each identify the exact departure, rank and confirmed receipt once',
   [LOG,STAFF].every(channel=>completed(channel).length===1&&completed(channel)[0].content.includes('Live Officer')
     &&completed(channel)[0].content.includes('Olympus Officer')&&completed(channel)[0].content.includes(OFFICER_ROLE)
     &&completed(channel)[0].content.includes(receipt.id)&&!completed(channel)[0].content.includes('<@')));
 const pointers=(await writer.prepare("SELECT purpose,state,channel_id,subjects,message_id FROM privacy_provider_messages WHERE message_id IN (?1,?2)").bind(completed(LOG)[0]?.id??'',completed(STAFF)[0]?.id??'').all()).results;
 check('both outbound messages have exact distinct provider pointers and original account cleanup custody',
   pointers.length===2&&pointers.every(r=>r.state==='known'&&JSON.stringify(JSON.parse(r.subjects))===JSON.stringify([{id:OFFICER,g:null}]))
   &&pointers.some(r=>r.channel_id===STAFF&&r.purpose==='notice')&&pointers.some(r=>r.channel_id===LOG&&r.purpose==='guild_log'));
 await runNativeSubject232(logged,OFFICER,callBudget(logged),2);
 observed=await control('observe');
 check('a later absence observation never repeats the DELETE or either destination notice',
   observed.deletes.filter(row=>row.subject===OFFICER).length===1&&completed(LOG).length===1&&completed(STAFF).length===1);

 await demote(logged,MEMBER,'live member','Live Member','fixture native main departure');
 observed=await control('observe');
 check('a remaining verified linked alt retains account role access and is explained',observed.memberPresent
   &&observed.messages.some(row=>row.content.includes(MEMBER)&&row.content.includes('another linked guild character remains')));
 await demote(logged,MEMBER,'live steward','Live Steward','fixture native alt departure');
 for(const name of ['Live Member','Live Steward'])members.splice(members.findIndex(row=>row.name===name),1);
 await publish();await control('unknown-member-delete');
 const unknown=await runNativeSubject232(logged,MEMBER,callBudget(logged),2);
 observed=await control('observe');
 check('lost original DELETE response stays unknown and has no removal-success notice',unknown.state!=='settled'
   &&observed.deletes.filter(row=>row.subject===MEMBER).length===1&&!observed.messages.some(row=>row.content.includes(MEMBER)&&row.content.includes('removal acknowledged and confirmed')));
 await runNativeSubject232(logged,MEMBER,callBudget(logged),2);
 observed=await control('observe');
 check('later absent provider state does not manufacture an ACK or retry a spent departure',observed.deletes.filter(row=>row.subject===MEMBER).length===1
   &&!observed.messages.some(row=>row.content.includes(MEMBER)&&row.content.includes('removal acknowledged and confirmed')));
 // Distinct real owned grant with a shared private channel. The single post must still be named.
 const gm='800000000000000399',shared={...logged,CHANNEL_MOD_ALERTS:LOG};
 await demote(shared,gm,'canonical smoke','Canonical Smoke','fixture confirmed native departure');
 members.splice(members.findIndex(row=>row.name==='Canonical Smoke'),1);await publish();await control('lose-shared-completion');
 const sharedResult=await runNativeSubject232(shared,gm,callBudget(shared),2);
 await runNativeSubject232(shared,gm,callBudget(shared),2);
 observed=await control('observe');
 check('a shared staff/log venue gets one named completion across the original removal and a later retry',
   sharedResult.rank?.outcomes.some(row=>row.reason==='canonical233_delete_acknowledged_and_confirmed')
     &&completions(LOG,gm).length===1&&completions(LOG,gm)[0].content.includes('Canonical Smoke')
     &&completions(LOG,gm)[0].content.includes('Olympus Guild Master')&&completions(STAFF,gm).length===0
     &&observed.deletes.filter(row=>row.subject===gm).length===1);
 const uncertain=await writer.prepare("SELECT state,message_id FROM privacy_provider_messages WHERE purpose='guild_log' AND channel_id=?1 AND state='unknown' AND EXISTS(SELECT 1 FROM json_each(subjects) WHERE json_extract(value,'$.id')=?2)").bind(LOG,gm).first();
 check('lost combined-channel POST response leaves its individual message unknown, without changing the confirmed role result or repeating either effect',
   uncertain?.state==='unknown'&&uncertain.message_id===null&&sharedResult.rank.outcomes[0].state==='settled'&&completions(LOG,gm).length===1);
 const alt='800000000000000402',originalCapture=await readPrivacySubject(logged,alt);
 check('generation-race fixture captures the actual original no-account branch',originalCapture===null);
 const lifecycle=createPrivacyWriteAdmissionDatabase(rawDb,'lifecycle',env.PRIVACY_WRITE_ADMISSION_LAYOUT,env.PRIVACY_WRITE_ADMISSION_EPOCH);
 await lifecycle.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',0,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER))")
   .bind(alt,'c'.repeat(32)).run();
 const priorRequests=(await writer.prepare("SELECT COUNT(*) AS n FROM audit WHERE subject=?1 AND action='role.request242'").bind(alt).first()).n;
 const raced=await requestRoleReconciliation242(logged,alt,'guild_departure',originalCapture);
 check('departure scheduling never reacquires a new account generation after its original capture',raced.kind!=='created'
   &&(await writer.prepare("SELECT COUNT(*) AS n FROM audit WHERE subject=?1 AND action='role.request242'").bind(alt).first()).n===priorRequests);
 const hidden=await postPrivacyMessage(logged,'notice',STAFF,{content:'Old captured account must remain withheld'},[{subject:alt,capture:originalCapture}],crypto.randomUUID().replace(/-/g,''));
 check('existing message custody atomically withholds the old capture after account creation',hidden===null);
 let pragmaHeld=false;try{await writer.prepare('PRAGMA foreign_key_check').all();}catch(error){pragmaHeld=String(error).includes('unsupported_constructor');}
 check('production write admission still refuses unsupported diagnostic constructors',pragmaHeld);
 check('genuine D1 foreign-key integrity remains intact after departures',(await rawDb.prepare('PRAGMA foreign_key_check').all()).results.length===0);
}
