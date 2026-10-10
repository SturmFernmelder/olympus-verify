/** Curated own copy admitted by a genuine identify-only grant, never a fabricated SiteUser/CommunitySubject. */
import type { Env } from './env';
import './community-routes';
import './qr-phase1-data';
import './privacy-access-data';
import './ruleset-publication-data';
import './site-news';
import { communityDataNames, communityExportPlan } from './community-context';
import { appOut, apiJson, type AppRow } from './site-core';
import { bnetFresh } from './bnet-retention';
import { secondsToIso } from './community-time';
import { privacySubjectKey } from './privacy-serving-authority';
import { privacyAccessExportFormAction, privacyAccessActionStatements, privacyAccessConsumedReadFence, PRIVACY_ACCESS_NOW } from './privacy-access';
import { exportPrivacyHistory, preparePrivacyHistory, finishPrivacyHistory, privacyBoundedScalarStatement, PRIVACY_ALL_HISTORY_COLLECTIONS, type PrivacyHistoryCollection } from './privacy-access-history';
import { FormError } from './policy-form-core';

const limit=25;
type Rec=Record<string,unknown>;
const iso=(value:unknown)=>typeof value==='number'?secondsToIso(value):null;
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
 const {grant,collection,cursor}=await privacyAccessExportFormAction(request,env),id=grant.subject;
 if(collection!=='copy')return exportPrivacyHistory(env,grant,collection,cursor);
 const marker=await privacySubjectKey(env,id);
 const expected=['refs','directory','events','trials','restrictions','departures','contributions','news','event_delivery','event_reminders','privacy_access','councillor_verification','ruleset_publication'].sort();
 if(JSON.stringify(communityDataNames().slice().sort())!==JSON.stringify(expected)||communityExportPlan(env,id).statements.length!==34)throw new FormError('privacy_catalog_unqualified',503);
 const prepared=await Promise.all(PRIVACY_ALL_HISTORY_COLLECTIONS.map(c=>preparePrivacyHistory(env,grant,c,null,limit)));
 // Four base and four community singleton slots. Every preview has count + 26-row sentinel cap.
 const scalar=[
 privacyBoundedScalarStatement(env,id,'SELECT discord_id,username,global_name,nick,avatar,account_created,server_joined,first_login,last_login,checked_at,in_server,denied,denied_at FROM site_users WHERE discord_id=?1',["discord_id","username","global_name","nick","avatar","account_created","server_joined","first_login","last_login","checked_at","in_server","denied","denied_at"]),
 privacyBoundedScalarStatement(env,id,'SELECT discord_id,position,class_lead,backup1,backup2,fallback,character,class,role,region,avail,avail_tz,fit_na,fit_eu,board_at,answers,status,created_at,updated_at FROM site_applications WHERE discord_id=?1',["discord_id","position","class_lead","backup1","backup2","fallback","character","class","role","region","avail","avail_tz","fit_na","fit_eu","board_at","answers","status","created_at","updated_at"],131072),
 privacyBoundedScalarStatement(env,id,'SELECT banned,linked_at,bnet_linked_at,username,global_name,names_at FROM members WHERE discord_id=?1',["banned","linked_at","bnet_linked_at","username","global_name","names_at"]),
 privacyBoundedScalarStatement(env,marker,'SELECT denied_at,retain_until,reason FROM privacy_denial_markers WHERE subject_key=?1',["denied_at","retain_until","reason"]),
 privacyBoundedScalarStatement(env,id,'SELECT ref FROM community_refs WHERE discord_id=?1',["ref"]),
 privacyBoundedScalarStatement(env,id,'SELECT ref,revision,listed,main_name,main_source,main_updated_at,raid_role,role_updated_at FROM community_profiles WHERE discord_id=?1',["ref","revision","listed","main_name","main_source","main_updated_at","raid_role","role_updated_at"]),
 privacyBoundedScalarStatement(env,id,'SELECT ref FROM community_refs WHERE discord_id=?1',["ref"]),
 privacyBoundedScalarStatement(env,id,'SELECT opened_at,retain_until,renewed_at,renewal_reason FROM community_restriction_periods WHERE discord_id=?1',["opened_at","retain_until","renewed_at","renewal_reason"]),
 ];
 let results:D1Result[];try{results=await env.DB.batch([...privacyAccessActionStatements(env,grant),env.DB.prepare('SELECT '+PRIVACY_ACCESS_NOW+' AS at'),...scalar,...prepared.flatMap(p=>p.statements),privacyAccessConsumedReadFence(env,grant)]);}catch{throw new FormError('privacy_copy_unconfirmed',503);}
 const at=(results[3]?.results[0] as {at?:unknown}|undefined)?.at;
 if(results.length!==87||(results.at(-1)?.results[0] as {admitted?:unknown}|undefined)?.admitted!==1||typeof at!=='number'||!Number.isSafeInteger(at)||at<=0||at>=grant.expiresAt||scalar.some((_,i)=>results[4+i]!.results.length>1))throw new FormError('privacy_copy_unconfirmed',503);
 const histories=Object.fromEntries(await Promise.all(PRIVACY_ALL_HISTORY_COLLECTIONS.map(async(c,i)=>[c,await finishPrivacyHistory(env,grant,c,prepared[i]!,at,results[12+2*i]!.results[0] as Rec|undefined,results[13+2*i]!.results)]))) as Record<PrivacyHistoryCollection,Awaited<ReturnType<typeof finishPrivacyHistory>>>;
 const entries=(c:PrivacyHistoryCollection)=>histories[c].entries;
 const container=(c:PrivacyHistoryCollection,rows=entries(c))=>({complete:histories[c].capture.complete,total:histories[c].capture.count,limit,rows});
 const a=results[4]!.results[0] as Rec|undefined,m=results[6]!.results[0] as Rec|undefined,p=results[9]!.results[0] as Rec|undefined,w=results[11]!.results[0] as Rec|undefined;
 const community:Record<string,Rec>={refs:{ref:(results[8]!.results[0] as Rec|undefined)?.ref??null},directory:{ref:p?.ref??(results[10]!.results[0] as Rec|undefined)?.ref??null,revision:p?.revision??0,listed:p?.listed===1,main:p?.main_name!=null?{name:p.main_name,source:p.main_source,updatedAt:iso(p.main_updated_at)}:null,raidRole:p?.raid_role!=null?{value:p.raid_role,updatedAt:iso(p.role_updated_at)}:null},restrictions:{watchListPeriod:w?{openedAt:iso(w.opened_at),retainUntil:iso(w.retain_until),renewedAt:iso(w.renewed_at),renewalReason:w.renewal_reason}:null},contributions:{note:'Who observed or recorded a payment, payer names as written in the source, source identifiers and unmatched evidence are not included.'}};
 const contributionRows=entries('contributionDecisions').map(r=>({action:r.action,at:Date.parse(r.at as string)/1000,own_subject:r.relation==='subject'||r.relation==='both'?1:0,own_actor:r.relation==='actor'||r.relation==='both'?1:0}));
 const body:Rec={generatedAt:secondsToIso(at),identity:{discordId:id,authority:'fresh_identify_only',expiresAt:secondsToIso(grant.expiresAt)},
 coverage:{kind:'curated_partial',ownAccountOnly:true,completeErasure:false,pageLimit:limit,
 excluded:['staff notes/reasons/identities','raw roster snapshots','private payment details','provider logs and pointers','short-lived authentication secrets and OAuth codes','external Discord posts/connections','private recovery backups','local watcher/game/download copies'],
 histories:Object.fromEntries(PRIVACY_ALL_HISTORY_COLLECTIONS.map(c=>[c,{collection:c,currentCursor:histories[c].currentCursor,nextCursor:histories[c].nextCursor,capture:histories[c].capture}])),
 continuation:'All 37 selected lists have a count and a preview of at most 25 entries. Save nextCursor to continue, or currentCursor to read again from the same range position. Reconnect Discord at /privacy/access, select the exact collection and paste its cursor; a separate history page contains at most 1,000 entries. Every page needs a fresh twelve-minute identify-only grant. The original retained range and twenty-four-hour deadline never extend; a changed range refuses continuation. New privacy inbox requests are disabled.'},
 about:'Selected retained records about your own Discord account were read together in one database transaction at generatedAt. A missing website account is shown as null. Complete flags concern the selected retained range only. Histories use a fixed numeric native order, not an immutable content snapshot or proof of download, erasure or every external copy.',
 account:a?{discordId:a.discord_id,username:a.username,displayName:a.global_name,nickname:a.nick,avatar:a.avatar,accountCreated:iso(a.account_created),joinedServer:iso(a.server_joined),firstSignIn:iso(a.first_login),lastSignIn:iso(a.last_login),lastMembershipCheck:iso(a.checked_at),inServer:a.in_server===1,denied:a.denied===1,deniedAt:iso(a.denied_at)}:null,
 site:{application:application(results[5]!.results[0] as AppRow|undefined)},
 verification:{known:!!m,bannedFromVerifying:m?.banned===1,battleNet:m?{linked:bnetFresh(m.linked_at as number|null,at),linkedAt:bnetFresh(m.linked_at as number|null,at)?iso(m.linked_at):null,profileLinkedAt:bnetFresh(m.bnet_linked_at as number|null,at)?iso(m.bnet_linked_at):null}:null,discordNames:m?{username:m.username,displayName:m.global_name,readAt:iso(m.names_at)}:null},
 actions:container('actions',entries('actions').map(r=>({at:Date.parse(r.at as string)/1000,action:r.action}))),eventChanges:container('eventChanges'),contributionDecisions:container('contributionDecisions',contributionRows),community,
 privacyLifecycle:{coverage:'own minimized serving controls; no provider pointers, proof digests or other account identifiers',allCopiesErased:false,rejectionMarker:results[7]!.results}};
 // Constant closed paths only. Existing direct arrays remain arrays; existing bounded containers retain rows/complete.
 for(const c of PRIVACY_ALL_HISTORY_COLLECTIONS.slice(3)){
  const path=c.split('.');let target=body;
  for(const part of path.slice(0,-1))target=(target[part]??= {}) as Rec;
  const nested=c.startsWith('community.privacy_access.')||c.startsWith('community.councillor_verification.')||c.startsWith('community.ruleset_publication.');
  target[path.at(-1)!]=!c.startsWith('community.')||nested?container(c):entries(c);
 }
 return apiJson(body,200,{'Content-Disposition':'attachment; filename="olympus-my-privacy-data.json"','Referrer-Policy':'no-referrer'});
}
