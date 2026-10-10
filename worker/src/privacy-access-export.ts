/** Curated own copy admitted by a genuine identify-only grant, never a fabricated SiteUser/CommunitySubject. */
import type { Env } from './env';
import './community-routes';
import './qr-phase1-data';
import { communityExportPlan } from './community-context';
import { appOut, apiJson, type AppRow } from './site-core';
import { bnetFresh } from './bnet-retention';
import { secondsToIso } from './community-time';
import { privacySubjectKey } from './privacy-serving-authority';
import { privacyAccessFormAction, privacyAccessActionStatements, privacyAccessConsumedReadFence, PRIVACY_ACCESS_NOW } from './privacy-access';
import { FormError } from './policy-form-core';

const limit=1000;
type Rec=Record<string,unknown>;
const iso=(value:unknown)=>typeof value==='number'?secondsToIso(value):null;
const bounded=(result:D1Result)=>({complete:result.results.length<=limit,rows:result.results.slice(0,limit)});
function application(row:AppRow|undefined):unknown{
 if(!row)return null;const a=appOut(row),answers={...a.answers};
 if(Object.hasOwn(answers,'references')){
  // Restored legacy JSON can contain any shape. Only the reviewed list projection may carry references.
  answers.references=Array.isArray(answers.references)?(answers.references as unknown[])
   .filter((r):r is Rec=>!!r&&typeof r==='object'&&!Array.isArray(r))
   .map(r=>({kind:r.kind==='discord'||r.kind==='name'?r.kind:null,label:typeof r.label==='string'?r.label:null})):null;
 }
 return {...a,answers};
}
export async function exportPrivacyAccess(request:Request,env:Env):Promise<Response>{
 if(new URL(request.url).pathname!=='/privacy/access/export')throw new FormError('privacy_purpose_refused',403);
 const grant=await privacyAccessFormAction(request,env,'own_export'),id=grant.subject;
 const marker=await privacySubjectKey(env,id),community=communityExportPlan(env,id);
 // Every selected column is the established own-copy projection. No provider pointers, staff identities or account references.
 const statements=[
 env.DB.prepare(`SELECT ${PRIVACY_ACCESS_NOW} AS at`),
 env.DB.prepare('SELECT discord_id,username,global_name,nick,avatar,account_created,server_joined,first_login,last_login,checked_at,in_server,denied,denied_at FROM site_users WHERE discord_id=?1').bind(id),
 env.DB.prepare('SELECT discord_id,position,class_lead,backup1,backup2,fallback,character,class,role,region,avail,avail_tz,fit_na,fit_eu,board_at,answers,status,created_at,updated_at FROM site_applications WHERE discord_id=?1').bind(id),
 env.DB.prepare('SELECT ballot,slot,nominee_label,reason,created_at,updated_at FROM site_votes WHERE voter_id=?1 ORDER BY ballot,slot LIMIT 1001').bind(id),
 env.DB.prepare('SELECT role_key,vote,created_at,updated_at FROM site_board_votes WHERE voter_id=?1 ORDER BY role_key,created_at LIMIT 1001').bind(id),
 env.DB.prepare('SELECT friend_label,note,created_at FROM site_friends WHERE owner_id=?1 ORDER BY created_at,friend_label LIMIT 1001').bind(id),
 env.DB.prepare('SELECT name,status,created_at,approved_at,queued_at,released_at FROM site_reserved WHERE owner_id=?1 ORDER BY id LIMIT 1001').bind(id),
 env.DB.prepare('SELECT banned,linked_at,bnet_linked_at,username,global_name,names_at FROM members WHERE discord_id=?1').bind(id),
 env.DB.prepare('SELECT name,status,bound_at,verified_at,member_since,left_at,source FROM characters WHERE discord_id=?1 ORDER BY bound_at,name LIMIT 1001').bind(id),
 env.DB.prepare('SELECT name,created_at,expires_at,consumed_at,consumed_source FROM pending WHERE discord_id=?1 ORDER BY created_at,id LIMIT 1001').bind(id),
 env.DB.prepare('SELECT name,status,attempts,created_at,written_at,invited_at,joined_at,retry_after,last_reason,last_reason_at FROM invite_queue WHERE discord_id=?1 ORDER BY created_at,id LIMIT 1001').bind(id),
 env.DB.prepare('SELECT ts AS at,action FROM audit WHERE subject=?1 OR actor=?1 ORDER BY ts,id LIMIT 1001').bind(id),
 env.DB.prepare('SELECT old_name,new_name,state,decided_at,closed_at FROM rename_holds WHERE discord_id=?1 ORDER BY decided_at,id LIMIT 1001').bind(id),
 env.DB.prepare('SELECT event_id,action,at,fields FROM community_event_changes WHERE actor=?1 ORDER BY at,id LIMIT 1001').bind(id),
 env.DB.prepare(`SELECT action,at,CASE WHEN discord_id=?1 THEN 1 ELSE 0 END AS own_subject,CASE WHEN actor=?1 THEN 1 ELSE 0 END AS own_actor
 FROM community_contribution_decisions WHERE (discord_id=?1 OR actor=?1) AND retain_until>${PRIVACY_ACCESS_NOW}
 AND action IN('allocation_reversed','receipt_voided','removal_recorded','state_open','state_exempt','state_disputed','state_resolved','contact_acknowledged','contact_officer_contact','contact_final_notice','contact_final_acknowledged','contact_final_officer_contact') ORDER BY at,id LIMIT 1001`).bind(id),
 ...community.statements,
 env.DB.prepare('SELECT state,hold_reason,staff_access,created_at,completed_at,retain_until FROM privacy_serving_jobs WHERE subject_id=?1 ORDER BY created_at,operation_id LIMIT 1001').bind(id),
 env.DB.prepare("SELECT purpose,state,cleanup_requested,created_at,updated_at,retain_until FROM privacy_provider_messages WHERE EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1) ORDER BY created_at,operation_id LIMIT 1001").bind(id),
 env.DB.prepare('SELECT erased_at,retain_until,scope,recovery_custody FROM privacy_restore_replay WHERE subject_id=?1 ORDER BY erased_at,operation_id LIMIT 1001').bind(id),
 env.DB.prepare('SELECT denied_at,retain_until,reason FROM privacy_denial_markers WHERE subject_key=?1').bind(marker),
 ];
 const results=await env.DB.batch([...privacyAccessActionStatements(env,grant),...statements,privacyAccessConsumedReadFence(env,grant)]),out=results.slice(3,-1);
 if(out.length!==statements.length||(results.at(-1)?.results[0] as {admitted?:number}|undefined)?.admitted!==1)throw new FormError('privacy_copy_unconfirmed',503);
 const at=(out[0]?.results[0] as {at?:unknown}|undefined)?.at;
 if(typeof at!=='number'||!Number.isSafeInteger(at)||at>=grant.expiresAt)throw new FormError('privacy_copy_unconfirmed',503);
 const a=out[1]!.results[0] as Rec|undefined,m=out[7]!.results[0] as Rec|undefined;
 const base=15+community.statements.length;
 const body={generatedAt:secondsToIso(at),identity:{discordId:id,authority:'fresh_identify_only',expiresAt:secondsToIso(grant.expiresAt)},
 coverage:{kind:'curated_partial',ownAccountOnly:true,completeErasure:false,pageLimit:limit,
 excluded:['staff notes/reasons/identities','raw roster snapshots','private payment details','provider logs and pointers','short-lived authentication secrets and OAuth codes','external Discord posts/connections','private recovery backups','local watcher/game/download copies'],
 continuation:'This download contains at most 1,000 retained rows per history. A false complete flag means further records are retained but are not included in this download. New privacy inbox requests are disabled; this download does not provide a continuation for additional rows.'},
 about:'Selected retained records about your own Discord account were read together in one database transaction at generatedAt. A missing website account is shown as null. Per-section complete flags concern only this selected range; community sections carry their established coverage. This is not every store, an immutable all-store snapshot, proof of download, or erasure.',
 account:a?{discordId:a.discord_id,username:a.username,displayName:a.global_name,nickname:a.nick,avatar:a.avatar,accountCreated:iso(a.account_created),joinedServer:iso(a.server_joined),firstSignIn:iso(a.first_login),lastSignIn:iso(a.last_login),lastMembershipCheck:iso(a.checked_at),inServer:a.in_server===1,denied:a.denied===1,deniedAt:iso(a.denied_at)}:null,
 site:{application:application(out[2]!.results[0] as AppRow|undefined),votes:bounded(out[3]!),boardVotes:bounded(out[4]!),friends:bounded(out[5]!),reserved:bounded(out[6]!)},
 verification:{known:!!m,bannedFromVerifying:m?.banned===1,battleNet:m?{linked:bnetFresh(m.linked_at as number|null,at),linkedAt:bnetFresh(m.linked_at as number|null,at)?iso(m.linked_at):null,profileLinkedAt:bnetFresh(m.bnet_linked_at as number|null,at)?iso(m.bnet_linked_at):null}:null,
 discordNames:m?{username:m.username,displayName:m.global_name,readAt:iso(m.names_at)}:null,characters:bounded(out[8]!),codeRequests:bounded(out[9]!),inviteQueue:bounded(out[10]!),renameRecords:bounded(out[12]!)},
 actions:bounded(out[11]!),eventChanges:bounded(out[13]!),contributionDecisions:bounded(out[14]!),community:community.shape(out.slice(15,base)),
 privacyLifecycle:{coverage:'own minimized serving controls; no provider pointers, proof digests or other account identifiers',allCopiesErased:false,erasureRequests:bounded(out[base]!),providerCleanup:bounded(out[base+1]!),recoverySuppression:bounded(out[base+2]!),rejectionMarker:out[base+3]!.results}};
 return apiJson(body,200,{'Content-Disposition':'attachment; filename="olympus-my-privacy-data.json"','Referrer-Policy':'no-referrer'});
}
