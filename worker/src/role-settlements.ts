/** Central audited writer for new QR/rank and erasure effects. Existing legacy writers are not silently activated here.
 * Each intent is durable before HTTP, one CAS dispatch only. Unknown responses are reconciled by GET, never re-POSTed.
 */
import {SIGNER_CURRENT} from './qr-signer-current-sql';
import {privacyAccountIncarnation,privacyAccountIncarnationLiteralFenceSql} from './privacy-serving-authority';
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
import {captureBetaConfiguration,assertBetaConfiguration,BETA_SIGNER_CURRENT,betaMembershipEffectSql,type BetaConfiguration} from './qr-beta-fern';
import type { Env } from './env';
import { membershipSettlementEnabled,membershipTransitionEnabled,membershipTargets,membershipTargetsCurrent } from './membership-role-transition';
import { rest, DiscordError, type AttemptBudget } from './discord';
import { DB_NOW, randomGeneration, sha256 } from './account-generation-contracts';
import { requireQr, type QrEnv } from './qr-phase1';
import { parseNativeRoleMap,mappedNativeRole,identifyNativeProfile,identifyConfiguredNativeProfile,privilegedNativeMap } from './native-rank-adapter';
import { privacyGenerationFenceSql,readPrivacySubject,privacyProviderCustodyDatabase } from './privacy-serving-authority';
import { fenceSql } from './community-context';
import { isSiteAdmin } from './site-core';
import { captureTreasuryReservedRoles } from './treasury-reserved-roles';
import { BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS,captureBetaRoleDispatch,betaRoleDispatchHeld,betaGrantDispatchHeld,betaGrantDispatchSql,type BetaGrantCapture,type BetaRoleDispatch } from './beta-reset-policy';
import { type LaneCapture,type LaneKind,type LaneRemovalPurpose,type LaneTupleRow } from './full-release-roles';
import { captureLaunchVerification,assertLaunchMembershipMode,launchMembershipPredicate,type LaunchMembershipSource } from './launch-verification227';
import {assertRuntimeVenue230,runtimeVenue230Facts,runtimeVenue230Predicate,oldSharedMemberProducerHeld230,type RuntimeVenue230} from './shared-membership-cutover230';
import type {OriginalConsumedMembership230} from './ingest';
import type {OriginalLiveLinkConsumption} from './live-link-membership';
import {captureNativeRankConfig232,historicalNativeRankPolicy232,nativeRankProducerHeld232,NATIVE_RANK_PROFILE232,NATIVE_RANK_NAMES232,SHARED_MEMBER232,NATIVE_STAFF232} from './native-rank-reconciliation232';
import type {RoutineMembership232} from './routine-membership-authority232';
import {captureCanonicalRankConfig233,captureCanonicalEntitlements233,highestCanonicalRank233,canonicalNativeRole233,canonicalProducerHeld233,CANONICAL_PROFILE233,CANONICAL_RANKS233,CANONICAL_MANAGED_ROLE_IDS233,LEGACY_RANK_ROLE_IDS233,NATIVE_CANONICAL_INDEX233} from './canonical-ranks233';
import {captureCanonicalMigration233,canonicalMigrationProducerHeld233,CANONICAL_MIGRATION_PROFILE233,CANONICAL_MIGRATION_ROLE_IDS233} from './canonical-migration233';

type Role={id:string;position:number;permissions:string;managed:boolean;name?:string};
type Member={roles:string[];user:{id:string}};
type Intent={beta_window_id?:string|null;id:string;subject:string;purpose:string;proof_id:string|null;guild_id:string;role_id:string;desired:number;state:string;attempts:number;expires_at:number;roster_id:number|null;native_guid:string|null;native_profile:string|null;native_rank:number|null;native_rank_name:string|null;subject_generation:string|null;claim_nonce:string|null;created_at:number;request_digest:string|null;reason:string;checked_at:number|null};
export type Settlement=Readonly<{state:'settled'|'held'|'unknown';reason:string;operationId:string|null;checkedAt:number|null}>;
const result=(state:Settlement['state'],reason:string,operationId:string|null=null,checkedAt:number|null=null):Settlement=>({state,reason,operationId,checkedAt});
const ID=/^\d{17,20}$/;const TOKEN=/^[0-9a-f]{32}$/;
/** Item 15 (17 Oct 2026): restriction-only fence for central removals of the twelve fixed beta roles in the fixed guild.
 * The mode and additive source-epoch descriptor are captured with captureBetaRoleDispatch (no policy read, SQL or request) before the
 * originating entry's first await, and travels with the env it was read from, so a caller's spread env cannot replace it.
 * Absent and unchanged mode changes no statement, bind, request or order. v1, every other present value and a changed
 * descriptor hold new dispatch only: before creation, claim and the final pre-effect point. GET-only reconciliation of
 * spent rows and ACK-free receipts (fresh_server_confirmed, absent, past_effect_absent) stay available in every mode.
 * The additive source-epoch profile also restricts old fixed-target grant creation/claims, using the same entry capture.
 * Fresh roles and other guilds are not restricted, except that a fixed current membership target holds its whole
 * delegation (settleOwnedMembershipPair). Shared ACK/unknown writers, seals, receipts and policy reads are untouched. */
export type RemovalDispatch=BetaRoleDispatch;
const HELD_BY_MODE='beta_dispatch_mode_held';
function originalRemovalDispatch(env:Env,given?:RemovalDispatch):RemovalDispatch{
 if(given===undefined)return captureBetaRoleDispatch(env);
 const own=(key:'env'|'capture')=>{const d=given!==null&&typeof given==='object'?Object.getOwnPropertyDescriptor(given,key):undefined;return d&&Object.hasOwn(d,'value')?d.value:undefined;};
 return Object.freeze({env:own('env') as Env,capture:own('capture') as BetaRoleDispatch['capture']});
}
/** Holds a fixed target unless the entry capture is absent and unchanged against the env it was read from. Cross-env
 * (restriction only): the effect env itself holds a fixed target when it carries any own, accessor or inherited mode
 * descriptor, so another env can add a hold but never lift one. Pure: no getter call, SQL, await, request or audit. */
const removalHeld=(env:Env,capture:RemovalDispatch,guild:string,role:string)=>betaRoleDispatchHeld(env,capture,guild,role)||oldSharedMemberProducerHeld230(env,guild,role);
const now=()=>Math.floor(Date.now()/1000);
const budget=():AttemptBudget=>({limit:8,attempts:0,retries:0});
/** This path counts every network request and disables the legacy 429 retry. */
async function request<T>(env:Env,b:AttemptBudget,method:string,path:string,readAdmission?:()=>Promise<boolean>,beforeDispatch?:()=>void,deleteAdmission230?:object):Promise<T> {
 if(deleteAdmission230!==undefined&&deleteAdmission230!==launch230RoleOnly&&deleteAdmission230!==launch230OriginalCompensation&&deleteAdmission230!==native232RoleOnly&&deleteAdmission230!==native232OriginalDrain&&deleteAdmission230!==canonical233RoleOnly&&deleteAdmission230!==canonical233MigrationRoleOnly)throw Error('role_configuration');
 if(readAdmission&&(method==='GET'||method==='PUT'||method==='DELETE'&&(deleteAdmission230===launch230RoleOnly||deleteAdmission230===native232RoleOnly||deleteAdmission230===canonical233RoleOnly||deleteAdmission230===canonical233MigrationRoleOnly))&&!await readAdmission())throw Error('retirement_original_read_admission_changed');
 const dispatch=()=>{const target=/^\/guilds\/(\d+)\/members\/\d+\/roles\/(\d+)$/.exec(path);
  if((method==='PUT'||method==='DELETE')&&target&&nativeRankProducerHeld232(env,target[1],target[2])&&deleteAdmission230!==native232RoleOnly&&deleteAdmission230!==launch230RoleOnly&&deleteAdmission230!==canonical233RoleOnly&&deleteAdmission230!==canonical233MigrationRoleOnly&&!(method==='DELETE'&&(deleteAdmission230===native232OriginalDrain||deleteAdmission230===launch230OriginalCompensation)))throw Error('native232_old_producer_held');
  if((method==='PUT'||method==='DELETE')&&target&&canonicalMigrationProducerHeld233(env,target[1],target[2])&&deleteAdmission230!==canonical233RoleOnly&&deleteAdmission230!==canonical233MigrationRoleOnly&&!(method==='DELETE'&&(deleteAdmission230===native232OriginalDrain||deleteAdmission230===launch230OriginalCompensation)))throw Error('canonical233_old_producer_held');
  if((method==='PUT'||method==='DELETE')&&target&&oldSharedMemberProducerHeld230(env,target[1],target[2])&&deleteAdmission230===undefined)throw Error('shared_member230_old_producer_held');};
 dispatch();
 if(b.attempts>=b.limit)throw new Error('role_budget');b.attempts++;if('calls' in b)(b as AttemptBudget&{calls:number}).calls++;
 return rest<T>(env,method,path,undefined,1,'Olympus verified role settlement',b,false,()=>{dispatch();beforeDispatch?.();});
}
async function member(env:Env,b:AttemptBudget,subject:string,readAdmission?:()=>Promise<boolean>):Promise<Member|null> {
 try{return await request<Member>(env,b,'GET',`/guilds/${env.GUILD_ID}/members/${subject}`,readAdmission);}catch(e){if(e instanceof DiscordError&&e.status===404)return null;throw e;}
}
async function qualify(env:Env,b:AttemptBudget,subject:string,roleId:string,grant:boolean,cosmetic=false,otherRoles:readonly {id:string;cosmetic:boolean}[]=[],allowMissingRetired=false,readAdmission?:()=>Promise<boolean>,allowMissingBetaDuplicate=false,roleOnly230?:object) {
 const canonical=captureCanonicalRankConfig233(env),canonicalRole=canonical.policy?.ranks.find(r=>r.roleId===roleId),migration=roleOnly230===canonical233MigrationRoleOnly,canonicalApproved=(roleOnly230===canonical233RoleOnly||migration)&&canonical.mode==='enabled'&&!!canonical.policy&&canonical.current()&&env.GUILD_ID===canonical.policy.guildId&&(!!canonicalRole||!grant&&(migration?CANONICAL_MIGRATION_ROLE_IDS233.includes(roleId):CANONICAL_MANAGED_ROLE_IDS233.includes(roleId)));
 const native=captureNativeRankConfig232(env),nativeApproved=roleOnly230===native232RoleOnly&&native.mode==='enabled'&&!!native.policy&&native.current()&&env.GUILD_ID===native.policy.guildId&&(roleId===SHARED_MEMBER232||native.policy.ranks.some(r=>r.roleId===roleId)||(!grant||native.policy.privileged)&&Object.values(NATIVE_STAFF232).some(r=>r===roleId));
 const roleOnly=roleOnly230!==undefined&&(roleOnly230===launch230RoleOnly&&env.GUILD_ID===BETA_RESET_GUILD_ID&&roleId===BETA_RESET_ROLE_IDS[0]||nativeApproved||canonicalApproved)&&otherRoles.length===0&&!cosmetic&&!allowMissingRetired&&!allowMissingBetaDuplicate;
 if(roleOnly230!==undefined&&!roleOnly)throw Error('role_configuration');
 if(!ID.test(env.GUILD_ID)||!ID.test(subject)||!ID.test(roleId)||!env.DISCORD_BOT_TOKEN)throw new Error('role_configuration');
 const me=await request<{id:string;bot?:boolean}>(env,b,'GET','/users/@me',readAdmission);if(!ID.test(env.DISCORD_APP_ID)||me.id!==env.DISCORD_APP_ID||me.id===subject||roleOnly&&me.bot!==true)throw new Error('bot_identity');
 const roles=await request<Role[]>(env,b,'GET',`/guilds/${env.GUILD_ID}/roles`,readAdmission);
 const bot=await member(env,b,me.id,readAdmission),target=await member(env,b,subject,readAdmission);
 if(!Array.isArray(roles)||roles.length>250||!bot||!Array.isArray(bot.roles)||target&&!Array.isArray(target.roles))throw new Error('role_inventory');
 if(roles.some(r=>!ID.test(r.id)||!Number.isInteger(r.position)||typeof r.permissions!=='string'||!/^\d{1,32}$/.test(r.permissions)||typeof r.managed!=='boolean')||new Set(roles.map(r=>r.id)).size!==roles.length)throw new Error('role_inventory');
 const inventory=new Map(roles.map(r=>[r.id,r]));const botRoles=bot.roles.map(id=>inventory.get(id));if(botRoles.some(r=>!r))throw new Error('bot_inventory');
 const highest=Math.max(0,...botRoles.map(r=>r!.position));const permission=botRoles.reduce((v,r)=>v|BigInt(r!.permissions),BigInt(inventory.get(env.GUILD_ID)?.permissions||'0'));
 for(const requested of [{id:roleId,cosmetic},...otherRoles]){const wanted=inventory.get(requested.id);
  if(canonicalApproved&&(!canonical.current()||canonicalRole&&(wanted?.name!==canonicalRole.name||wanted.permissions!==canonicalRole.permissions)||migration&&!canonicalRole&&wanted?.permissions!=='0'))throw Error('canonical233_role_identity');
  if(nativeApproved&&native.policy&&requested.id===native.policy.ranks[1]!.roleId&&wanted?.name!=='Olympus Live: Stewart')throw Error('native232_stewart_identity');
  // Owner .198 consolidation: preserve historical reset tuples, but a freshly absent empty
  // duplicate needs no DELETE. This exception cannot admit a grant, another role or a ghost assignment.
  if(!wanted&&allowMissingBetaDuplicate&&!grant&&!cosmetic&&otherRoles.length===0
   &&env.GUILD_ID===BETA_RESET_GUILD_ID&&roleId==='1558657538960916490'&&requested.id===roleId
   &&!target?.roles.includes(roleId)&&!!(permission&268435456n||permission&8n))continue;
  // .240: an originally owned legacy cosmetic can outlive its globally deleted role definition.
  // Both original inventories must agree on absence; the existing guarded observation supplies no DELETE ACK.
  if(!wanted&&roleOnly230===canonical233RoleOnly&&canonicalApproved&&!grant&&requested.id===roleId
   &&LEGACY_RANK_ROLE_IDS233.includes(requested.id)&&target&&!target.roles.includes(requested.id)
   &&!!(permission&268435456n||permission&8n))continue;
  if(!wanted&&allowMissingRetired&&membershipTransitionEnabled(env)&&membershipTargets(env).retired===requested.id)continue;if(!wanted||wanted.managed||wanted.id===env.GUILD_ID||wanted.position>=highest||requested.cosmetic&&wanted.permissions!=='0'||roleOnly&&grant&&!canonicalApproved&&wanted.permissions!=='0'||!(permission&268435456n||permission&8n))throw new Error('role_hierarchy');}
 if(target){if(target.roles.some(id=>!inventory.has(id))||!roleOnly&&Math.max(0,...target.roles.map(id=>inventory.get(id)!.position))>=highest)throw new Error('target_hierarchy');}
 if(grant&&(!target||(env.BLOCKING_ROLE_IDS||'').split(',').map(x=>x.trim()).some(x=>x&&target.roles.includes(x)))){if((roleOnly230===native232RoleOnly||roleOnly230===canonical233RoleOnly)&&target)throw new Native232Blocked(env,target,subject);throw new Error('server_restriction');}
 return target;
}
export const PROOF_CURRENT=`EXISTS(SELECT 1 FROM verification_proofs p JOIN verification_requests v ON v.code=p.code
 WHERE p.id=?1 AND p.requester=?2 AND p.expires_at>${DB_NOW} AND v.state='proved' AND v.used_at IS NOT NULL
 AND ((v.session_version IS NULL AND v.session_expires IS NULL AND v.requester_account_incarnation IS NULL) OR (v.session_version IS NOT NULL AND v.session_expires>${DB_NOW} AND v.requester_account_incarnation IS NOT NULL AND typeof(v.requester_account_incarnation)='text' AND length(v.requester_account_incarnation)=32 AND length(CAST(v.requester_account_incarnation AS BLOB))=32 AND instr(v.requester_account_incarnation,char(0))=0 AND v.requester_account_incarnation NOT GLOB '*[^0-9a-f]*' AND EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=v.requester AND u.session_version=v.session_version AND u.account_incarnation=v.requester_account_incarnation)))
 AND p.rowid=(SELECT MAX(newest.rowid) FROM verification_proofs newest WHERE newest.requester=p.requester)
 AND ((p.beta_window_id IS NULL AND ${SIGNER_CURRENT.replace(/\?1\b/g,'p.key_id').replace(/\?2\b/g,'p.signer')}) OR (p.beta_window_id IS NOT NULL AND p.native_profile='beta-five' AND p.signer='472099715253796864' AND p.signer_guid='Player-4613-005A70D8' AND p.native_rank BETWEEN 0 AND 4 AND p.rank_name=CASE p.native_rank WHEN 0 THEN 'Guild Master' WHEN 1 THEN 'Officer' WHEN 2 THEN 'Veteran' WHEN 3 THEN 'Member' WHEN 4 THEN 'Initiate' END AND EXISTS(SELECT 1 FROM councillor_keys bk JOIN councillor_challenges bc ON bc.key_id=bk.id WHERE bk.id=p.key_id AND bc.nonce=p.challenge AND p.beta_window_id=bk.beta_window_id AND bc.beta_window_id=bk.beta_window_id) AND ${BETA_SIGNER_CURRENT.replace(/\?1\b/g,'p.key_id').replace(/\?2\b/g,'p.signer')}))
 AND (CASE WHEN v.subject_generation IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=v.requester) ELSE EXISTS(
 SELECT 1 FROM privacy_subjects WHERE subject_id=v.requester AND generation=v.subject_generation AND state='active') END)
 AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=p.requester AND banned=1)
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=p.requester AND state='reapply')
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=p.requester AND desired=0 AND attempts=1 AND purpose IN('grant_compensation','ban','rename_hold','blocking_role','guild_departure','account_erasure') AND state IN('dispatching','unknown'))
 AND NOT EXISTS(SELECT 1 FROM role_settlements other WHERE other.subject=p.requester AND (other.proof_id IS NULL OR other.proof_id<>p.id) AND other.attempts=1 AND other.state IN('dispatching','unknown') AND other.purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank'))
 AND EXISTS(SELECT 1 FROM characters WHERE discord_id=p.requester AND guid=p.requester_guid AND name=p.requester_name AND status='member')
 AND (SELECT COUNT(*) FROM characters WHERE guid=p.requester_guid AND status IN('member','left_pending'))=1
 AND NOT EXISTS(SELECT 1 FROM roster_snapshots s WHERE s.id>p.snapshot_id AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1
 AND ((SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=p.requester_guid)<>1
 OR (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=p.requester_guid AND name=p.requester_name AND rank=p.rank_name AND rank_index=p.native_rank)<>1)))`;
const betaGrantConfiguration=(env:Env):BetaConfiguration|null=>{try{return captureBetaConfiguration(env);}catch{return null;}};
const betaProofPurposeSql=(config:BetaConfiguration|null)=>`EXISTS(SELECT 1 FROM verification_proofs bp WHERE bp.id=?1 AND (bp.beta_window_id IS NULL OR ${config?.enabled?`bp.beta_window_id='${config.windowId}'`:'0'}))`;
async function proofCurrent(env:Env,proof:string,subject:string,beta:BetaConfiguration|null=betaGrantConfiguration(env)) {try{if(beta)assertBetaConfiguration(beta);const r=await env.DB.prepare(`SELECT 1 WHERE ${PROOF_CURRENT} AND ${betaProofPurposeSql(beta)}`).bind(proof,subject).first();if(beta)assertBetaConfiguration(beta);return !!r;}catch{return false;}}
/** Rank snapshots must remain the exact latest complete trusted export, with one linked native GUID.
 * Privacy generation is captured at selection; a missing subject is an absence branch, not a login.
 */
const ROSTER_CURRENT=`EXISTS(SELECT 1 FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id JOIN characters c ON c.guid=r.guid AND c.discord_id=?2
 WHERE s.id=?1 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.exported_at<=${DB_NOW} AND s.exported_at>${DB_NOW}-600
 AND s.exported_at>=?8 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
 AND r.guid=?3 AND r.rank=?4 AND r.rank_index=?5 AND c.status='member'
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=?3)=1 AND (SELECT COUNT(*) FROM characters WHERE guid=?3 AND status IN('member','left_pending'))=1
 AND ${privacyGenerationFenceSql(2,6)} AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND attempts=1 AND state IN('dispatching','unknown') AND id<>?7
 AND (desired=0 OR purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank')))
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply'))`;
const rosterParams=(env:Env,i:Intent)=>[i.roster_id,i.subject,i.native_guid,i.native_rank_name,i.native_rank,i.subject_generation,i.id,Number(env.LINKS_NOT_BEFORE||0)];
async function intentCurrent(env:Env,i:Intent,beta:BetaConfiguration|null=betaGrantConfiguration(env)){return i.proof_id?proofCurrent(env,i.proof_id,i.subject,beta):['roster_native_rank','roster_privileged_rank','roster_membership'].includes(i.purpose)&&!!await env.DB.prepare(`SELECT 1 WHERE ${ROSTER_CURRENT}`).bind(...rosterParams(env,i)).first();}
export async function queueRosterMembershipRole(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null,dispatch?:RemovalDispatch):Promise<string>{
 const removal=originalRemovalDispatch(env,dispatch);
 if(!membershipSettlementEnabled(env))throw Error('membership_writer_disabled');
 const binding=membershipTargets(env);if(!ID.test(subject)||!ID.test(env.ROLE_GUILD_MEMBER||'')||capturedGeneration!==null&&!TOKEN.test(capturedGeneration))throw Error('membership_configuration');
 // Independent original snapshot facts share one native read proof; the consuming ROSTER_CURRENT remains unchanged.
 const facts=await env.DB.batch([env.DB.prepare('SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11').bind(snapshotId),env.DB.prepare(`SELECT r.guid,r.rank,r.rank_index FROM roster_members r JOIN characters c ON c.guid=r.guid AND c.discord_id=?1 WHERE r.snapshot_id=?2 AND c.status='member'`).bind(subject,snapshotId)]);
 const profile=identifyRosterNativeProfile(env,facts[0]!.results as {rank:string;rank_index:number}[]),rows={results:facts[1]!.results as {guid:string;rank:string;rank_index:number}[]};
 if(rows.results.length!==1)throw Error('unique_native_guid_required');const r=rows.results[0]!,id=randomGeneration();
 if(!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,binding))throw Error('membership_configuration_changed');
 const args=[snapshotId,subject,r.guid,r.rank,r.rank_index,capturedGeneration,id,Number(env.LINKS_NOT_BEFORE||0),binding.guild,binding.current,profile];
 if(betaGrantDispatchHeld(env,removal,binding.guild,binding.current)||oldSharedMemberProducerHeld230(env,binding.guild,binding.current))throw Error(HELD_BY_MODE);
 const createGuard=betaGrantDispatchSql(env,removal,'?9','?10',ROSTER_CURRENT);
 // A later genuinely fresh producer may dispose an operation that never dispatched. It cannot renew its deadline,
 // borrow its authority or retry an attempted/unknown write; the successor is a distinct operation captured here.
 const expired=`state='held' AND reason='expired_without_dispatch' AND attempts=0 AND expires_at<=${DB_NOW}`;
 await env.DB.batch([env.DB.prepare(`UPDATE role_settlements SET state='held',reason='expired_without_dispatch'
 WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10 AND guild_id=?9
 AND subject_generation IS ?6 AND native_guid=?3 AND native_profile=?11 AND native_rank=?5 AND native_rank_name=?4
 AND desired=1 AND state='pending' AND attempts=0 AND expires_at<=${DB_NOW} AND ${ROSTER_CURRENT}`).bind(...args),
 env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
 SELECT ?7,?2,'roster_membership',?9,?10,1,'pending','awaiting_dispatch',?6,${DB_NOW},${DB_NOW}+300,?1,?3,?11,?5,?4 WHERE ${createGuard}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10 AND NOT(${expired}))`).bind(...args)]);
 const row=await env.DB.prepare(`SELECT id FROM role_settlements WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10
 AND guild_id=?9 AND subject_generation IS ?6 AND native_guid=?3 AND native_profile=?11 AND native_rank=?5 AND native_rank_name=?4
 AND NOT(${expired}) AND ${ROSTER_CURRENT}`).bind(...args).first<{id:string}>();if(!row)throw Error('membership_currentness_changed');return row.id;
}
/** Called by the existing roster acceptance path for one linked subject. No new cron/sweep or caller rank authority. */
export async function queueRosterRankRoles(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null,dispatch?:RemovalDispatch):Promise<string[]> {
 const removal=originalRemovalDispatch(env,dispatch);
 if(env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true'||!ID.test(subject)||!Number.isSafeInteger(snapshotId))throw Error('rank_mapping_disabled_or_invalid');
 const s=await readPrivacySubject(env,subject);if(s&&(s.state!=='active'||s.subjectGeneration!==capturedGeneration)||!s&&capturedGeneration!==null)throw Error('subject_held');
 const profiles=await env.DB.prepare('SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11').bind(snapshotId).all<{rank:string;rank_index:number}>(),profile=identifyRosterNativeProfile(env,profiles.results);
 const r=await env.DB.prepare(`SELECT r.guid,r.rank,r.rank_index FROM roster_members r JOIN characters c ON c.guid=r.guid AND c.discord_id=?1
 WHERE r.snapshot_id=?2 AND c.status='member'`).bind(subject,snapshotId).all<{guid:string;rank:string;rank_index:number}>();
 if(r.results.length!==1)throw Error('unique_native_guid_required');const row=r.results[0]!,desiredRows=await rankTargets(env,subject,profile,row.rank,row.rank_index),rows=desiredRows.map(([role,desired,purpose])=>({id:randomGeneration(),role,desired,purpose:purpose.replace('verified_','roster_')}));
 const args=[snapshotId,subject,row.guid,row.rank,row.rank_index,capturedGeneration,randomGeneration(),Number(env.LINKS_NOT_BEFORE||0),env.GUILD_ID,JSON.stringify(rows),profile];
 if(rows.some(r=>oldSharedMemberProducerHeld230(env,env.GUILD_ID,r.role)||r.desired===1&&betaGrantDispatchHeld(env,removal,env.GUILD_ID,r.role)))throw Error(HELD_BY_MODE);
 const createGuard=betaGrantDispatchSql(env,removal,'?9',"CASE WHEN json_extract(j.value,'$.desired')=1 THEN json_extract(j.value,'$.role') ELSE '' END",ROSTER_CURRENT);
 const expired=`state='held' AND reason='expired_without_dispatch' AND attempts=0 AND expires_at<=${DB_NOW}`;
 await env.DB.batch([env.DB.prepare(`UPDATE role_settlements SET state='held',reason='expired_without_dispatch'
 WHERE subject=?2 AND roster_id=?1 AND subject_generation IS ?6 AND guild_id=?9 AND native_guid=?3 AND native_rank_name=?4 AND native_rank=?5 AND native_profile=?11
 AND state='pending' AND attempts=0 AND expires_at<=${DB_NOW} AND purpose IN('roster_native_rank','roster_privileged_rank')
 AND EXISTS(SELECT 1 FROM json_each(?10)j WHERE role_id=json_extract(j.value,'$.role') AND desired=json_extract(j.value,'$.desired') AND purpose=json_extract(j.value,'$.purpose'))
 AND ${ROSTER_CURRENT}`).bind(...args),env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?9,json_extract(j.value,'$.role'),json_extract(j.value,'$.desired'),'pending','awaiting_dispatch',?6,${DB_NOW},${DB_NOW}+300,?1,?3,?11,?5,?4 FROM json_each(?10) j WHERE ${createGuard}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=json_extract(j.value,'$.purpose') AND roster_id=?1 AND role_id=json_extract(j.value,'$.role') AND desired=json_extract(j.value,'$.desired') AND NOT(${expired}))`).bind(...args)]);
 const found=await env.DB.prepare(`SELECT id,role_id,desired,purpose FROM role_settlements WHERE subject=?2 AND roster_id=?1 AND purpose IN('roster_native_rank','roster_privileged_rank')
 AND guild_id=?9 AND subject_generation IS ?6 AND native_guid=?3 AND native_rank_name=?4 AND native_rank=?5 AND native_profile=?11 AND NOT(${expired}) AND ${ROSTER_CURRENT} AND ?10 IS NOT NULL LIMIT 28`).bind(...args).all<{id:string;role_id:string;desired:number;purpose:string}>();
 return rows.map(r=>{const matches=found.results.filter(x=>x.role_id===r.role&&x.desired===r.desired&&x.purpose===r.purpose);if(matches.length!==1)throw Error('rank_currentness_changed');return matches[0]!.id;});
}

function rankMap(env:QrEnv) {
 if(env.QR_RANK_MAPPING_ENABLED!=='true')throw new Error('rank_mapping_disabled');
 const v=parseNativeRoleMap(env.QR_NATIVE_ROLE_MAP);
 // Native rank labels are cosmetic. Never reinterpret a configured staff, membership,
 // blocking, linked-role or guild identity as one of those labels, even with base permissions=0.
 const reserved=new Set([env.GUILD_ID,env.SITE_GUILD_ID,env.DISCORD_APP_ID,env.ROLE_GUILD_MEMBER,
  env.MEMBERSHIP_RETIRED_ROLE_ID,env.ROLE_OFFICER,env.ROLE_MODERATOR,env.ROLE_GUILD_LEADER,
  env.ROLE_GUILD_MASTER,env.ROLE_RAID_LEADER,env.LINK_ROLE_ID,
  ...(env.BLOCKING_ROLE_IDS||'').split(','),...(env.INTROS_ROLES||'').split(',')]
  .filter((value):value is string=>typeof value==='string').map(value=>value.trim()).filter(Boolean));
 if(v.roles.some(role=>reserved.has(role)))throw Error('rank_mapping_configuration');return v;
}
function identifyRosterNativeProfile(env:QrEnv,rows:readonly {rank:string;rank_index:number}[]){
 if(env.QR_RANK_MAPPING_ENABLED==='true'){
  // A profile-name peek selects a strict validator, never a role or authority.
  // Legacy/unknown/malformed map metadata must not newly gate membership.
  const raw=env.QR_NATIVE_ROLE_MAP;let configured:unknown;
  if(typeof raw==='string'&&raw.length<=1024)try{
   const value:unknown=JSON.parse(raw);
   if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,'profile'))configured=(value as Record<string,unknown>).profile;
  }catch{/* Original default recognition remains independent of old map errors. */}
  // The rejected ladder-A map remains parseable history, not a current producer choice.
  if(configured==='ten-rank-treasurer-v1')throw Error('native_profile_not_current');
  if(configured==='ten-rank-council-treasurer-v1')return identifyConfiguredNativeProfile(rows,rankMap(env));
 }
 return identifyNativeProfile(rows);
}
async function rankTargets(env:QrEnv,subject:string,profile:string,name:string,index:number):Promise<[string,number,string][]> {
 if(captureNativeRankConfig232(env).present||captureCanonicalRankConfig233(env).present)return [];
 if(profile==='ten-rank-treasurer-v1')throw Error('native_profile_not_current');
 if(profile!=='beta-five'&&profile!=='ten-rank'&&profile!=='ten-rank-treasurer-v1'&&profile!=='ten-rank-council-treasurer-v1')throw Error('native_profile_mismatch');const out:[string,number,string][]=[];
 let labels:string[]=[];if(env.QR_RANK_MAPPING_ENABLED==='true'){const map=rankMap(env);if(map.profile!==profile)throw Error('native_profile_mismatch');const wanted=mappedNativeRole(name,index,map);labels=Array.from(map.roles);for(const role of map.roles)out.push([role,Number(role===wanted),'verified_native_rank']);}
 if(env.QR_PRIVILEGED_RANK_MAPPING_ENABLED==='true'){
 const map=privilegedNativeMap(profile,env),wanted=map.wanted(name,index);if(map.roles.some(r=>labels.includes(r)||r===env.ROLE_GUILD_MEMBER))throw Error('rank_mapping_configuration');
 // Never strip a manually assigned staff role. Only our previous actual successful PUT grants are managed.
 const prior=await env.DB.prepare("SELECT DISTINCT role_id FROM role_settlements WHERE subject=?1 AND purpose IN('verified_privileged_rank','roster_privileged_rank') AND desired=1 AND attempts=1 AND state='settled'").bind(subject).all<{role_id:string}>();
 for(const role of map.roles)if(role===wanted||prior.results.some(r=>r.role_id===role))out.push([role,Number(role===wanted),'verified_privileged_rank']);
 }
 return out.sort((a,b)=>a[1]-b[1]); // Remove managed old roles before a new mapped grant; held removals stop dispatch.
}
/** One fresh qualified member read can close all already-absent mapped removals. It never dispatches an effect.
 * The consuming UPDATE repeats the original generation and whole latest roster guard after the HTTP await.
 * This avoids spending four inventory GETs on each of ten absent cosmetic roles before the wanted grants.
 */
export async function settleRosterRankAbsences(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null,b:AttemptBudget) {
 const held=(reason:string)=>({state:'held' as const,reason,closed:0});
 if(env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true')return held('rank_mapping_disabled');
 if(typeof subject!=='string'||!ID.test(subject)||!Number.isSafeInteger(snapshotId)||snapshotId<1||capturedGeneration!==null&&(typeof capturedGeneration!=='string'||!TOKEN.test(capturedGeneration)))return held('invalid_capture');
 const rows=await env.DB.prepare(`SELECT * FROM role_settlements WHERE subject=?1 AND roster_id=?2 AND subject_generation IS ?3 AND guild_id=?4
 AND purpose IN('roster_native_rank','roster_privileged_rank') AND desired=0 AND state='pending' AND attempts=0 ORDER BY id LIMIT 14`).bind(subject,snapshotId,capturedGeneration,env.GUILD_ID).all<Intent>();
 if(rows.results.length>13)return held('rank_intent_census');if(!rows.results.length)return {state:'settled' as const,reason:'no_pending_removals',closed:0};
 const first=rows.results[0]!,roles:{id:string;cosmetic:boolean}[]=[];
 try{for(const i of rows.results){if(i.native_guid!==first.native_guid||i.native_profile!==first.native_profile||i.native_rank!==first.native_rank||i.native_rank_name!==first.native_rank_name)throw Error();
 if(i.purpose==='roster_native_rank'){const map=rankMap(env);if(i.native_profile!==map.profile||!map.roles.includes(i.role_id)||i.role_id===mappedNativeRole(i.native_rank_name!,i.native_rank!,map))throw Error();}
 else{if(env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true'||!['beta-five','ten-rank'].includes(i.native_profile!))throw Error();const map=privilegedNativeMap(i.native_profile as 'beta-five'|'ten-rank',env);if(!map.roles.includes(i.role_id)||i.role_id===map.wanted(i.native_rank_name!,i.native_rank!))throw Error();}
 roles.push({id:i.role_id,cosmetic:i.purpose==='roster_native_rank'});}}catch{return held('frozen_configuration_changed');}
 if(!await intentCurrent(env,first))return held('roster_or_generation_stale');
 if(b.limit-b.attempts<4)return held('role_request_budget');let target:Member|null;
 try{target=await qualify(env,b,subject,first.role_id,false,roles[0]!.cosmetic,roles.slice(1));}catch{return held('inventory_hierarchy_or_server_hold');}
 const absent=rows.results.filter(i=>!target?.roles.includes(i.role_id)).map(i=>i.id);if(!absent.length)return {state:'settled' as const,reason:'no_absent_removals',closed:0};
 const out=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='fresh_server_absence_batch',checked_at=${DB_NOW}
 WHERE id IN(SELECT value FROM json_each(?9)) AND subject=?2 AND roster_id=?1 AND subject_generation IS ?6 AND guild_id=?10
 AND native_guid=?3 AND native_rank_name=?4 AND native_rank=?5 AND native_profile=?11 AND desired=0 AND state='pending' AND attempts=0
 AND ${ROSTER_CURRENT} AND (purpose='roster_native_rank' OR (purpose='roster_privileged_rank' AND EXISTS(
 SELECT 1 FROM role_settlements prior WHERE prior.subject=?2 AND prior.role_id=role_settlements.role_id AND prior.purpose IN('verified_privileged_rank','roster_privileged_rank') AND prior.desired=1 AND prior.attempts=1 AND prior.state='settled'))) RETURNING id`).bind(...rosterParams(env,first),JSON.stringify(absent),env.GUILD_ID,first.native_profile).all<{id:string}>();
 return out.results.length===absent.length?{state:'settled' as const,reason:'fresh_server_absence_batch',closed:out.results.length}:held('roster_or_generation_changed_after_lookup');
}
type OriginalRoleActor=Readonly<{id:string;v:number;e:number;g:string|null;n:string;originalSession:OriginalSiteSession}>;
function captureRoleActor(input:OriginalRoleActor):{actor:OriginalRoleActor;check:()=>void}{
 const keys=['id','v','e','g','n','originalSession'] as const,slots=keys.map(k=>{const d=input&&Object.getOwnPropertyDescriptor(input,k);if(!d||!Object.hasOwn(d,'value'))throw Error('original_role_actor_held');return d;});
 const read=slots[5]!.value as OriginalSiteSession;assertOriginalSiteSessionRead(read);const actor=Object.freeze({id:slots[0]!.value as string,v:slots[1]!.value as number,e:slots[2]!.value as number,g:slots[3]!.value as string|null,n:privacyAccountIncarnation(slots[4]!.value),originalSession:read});
 if(read.u!==actor.id||read.v!==actor.v||read.e!==actor.e||read.g!==actor.g||read.n!==actor.n)throw Error('original_role_actor_held');
 const check=()=>{assertOriginalSiteSessionRead(read);for(let i=0;i<keys.length;i++){const d=Object.getOwnPropertyDescriptor(input,keys[i]!);if(!d||!Object.hasOwn(d,'value')||d.value!==slots[i]!.value)throw Error('original_role_actor_held');}};check();return{actor,check};
}
/** One HTTP request handles at most two admitted effects (16 actual calls). Unknown/held stops continuation. */
export async function settleOwnedRoleBatch(env:QrEnv,ids:string[],actor:OriginalRoleActor,reconcileOnly=false,dispatch?:RemovalDispatch){
 const removal=originalRemovalDispatch(env,dispatch);
 const owner=captureRoleActor(actor);actor=owner.actor;owner.check();if(!Array.isArray(ids)||ids.length<1||ids.length>2||ids.some(id=>!TOKEN.test(id))||new Set(ids).size!==ids.length)throw Error('operation_batch_invalid');
 const b:AttemptBudget={limit:16,attempts:0,retries:0},outcomes:Settlement[]=[];
 for(const id of ids){owner.check();const own=await env.DB.prepare(`SELECT 1 FROM role_settlements r LEFT JOIN verification_proofs p ON p.id=r.proof_id WHERE r.id=?1
 AND ((p.signer=?2 OR p.requester=?2) OR (r.subject=?2 AND r.purpose IN('roster_native_rank','roster_privileged_rank'))) AND ?4>${DB_NOW}
 AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND session_version=?3 AND in_server=1 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',actor.n)}) AND ${privacyGenerationFenceSql(2,5)}`).bind(id,actor.id,actor.v,actor.e,actor.g).first();
 owner.check();if(!own)throw Error('operation_not_owned');const r=await settleRoleIntent(env,id,reconcileOnly,actor,b,undefined,removal);owner.check();outcomes.push(r);if(r.state!=='settled')break;}
 return {outcomes,attempts:b.attempts,limit:b.limit,remaining:ids.slice(outcomes.length)};
}
/** Frozen purpose and role are derived from verified proof + server configuration, never submitted role ids. */
export async function queueProofRoles(env:QrEnv,proofId:string,dispatch?:RemovalDispatch):Promise<string[]> {
 const removal=originalRemovalDispatch(env,dispatch);
 requireQr(env);if(!TOKEN.test(proofId)||!ID.test(env.ROLE_GUILD_MEMBER||''))throw new Error('proof_configuration');
 const betaOriginal=betaGrantConfiguration(env);
 const membershipBinding=membershipTransitionEnabled(env)?membershipTargets(env):undefined;
 const nativeProof=await env.DB.prepare('SELECT requester,requester_guid,native_rank,rank_name,native_profile,beta_window_id FROM verification_proofs WHERE id=?1').bind(proofId).first<{requester:string;requester_guid:string;native_rank:number;rank_name:string;native_profile:string}>();
 if(!nativeProof)throw new Error('proof_stale');const fields=['requester','requester_guid','native_rank','rank_name','native_profile','beta_window_id'] as const,copied:Record<string,unknown>={};for(const k of fields){const d=Object.getOwnPropertyDescriptor(nativeProof,k);if(!d||!Object.hasOwn(d,'value')||d.get||d.set)throw new Error('proof_original_row_held');copied[k]=d.value;}const p=Object.freeze(copied) as unknown as Readonly<{requester:string;requester_guid:string;native_rank:number;rank_name:string;native_profile:string;beta_window_id:string|null}>;if(!await proofCurrent(env,proofId,p.requester,betaOriginal))throw new Error('proof_stale');
 const desired:[string,number,string][]=[[membershipBinding?.current??env.ROLE_GUILD_MEMBER!,1,'verified_membership']];
 if(p.beta_window_id===null)desired.push(...await rankTargets(env,p.requester,p.native_profile,p.rank_name,p.native_rank));else{if(!betaOriginal?.enabled||p.beta_window_id!==betaOriginal.windowId||desired[0]![0]!==betaOriginal.membershipRole)throw Error('beta_membership_only');assertBetaConfiguration(betaOriginal);}
 // One bounded source-owned json_each INSERT, not one DB round trip per role. No caller role values enter it.
 const rows=desired.map(([role,wanted,purpose])=>({id:randomGeneration(),role,wanted,purpose}));
 if(rows.some(r=>oldSharedMemberProducerHeld230(env,membershipBinding?.guild??env.GUILD_ID,r.role)||r.wanted===1&&betaGrantDispatchHeld(env,removal,membershipBinding?.guild??env.GUILD_ID,r.role)))throw Error(HELD_BY_MODE);
 const createGuard=betaGrantDispatchSql(env,removal,'?4',"CASE WHEN json_extract(j.value,'$.wanted')=1 THEN json_extract(j.value,'$.role') ELSE '' END",PROOF_CURRENT);
 if(membershipBinding&&!membershipTargetsCurrent(env,membershipBinding))throw Error('membership_configuration_changed');
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,created_at,expires_at,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?1,?4,json_extract(j.value,'$.role'),json_extract(j.value,'$.wanted'),'pending','awaiting_dispatch',${DB_NOW},CASE WHEN ?8 IS NULL THEN ${DB_NOW}+300 ELSE MIN(${DB_NOW}+300,(SELECT expires_at FROM verification_proofs deadline WHERE deadline.id=?1)) END,?5,?6,?7 FROM json_each(?3) j WHERE ${createGuard} AND ${betaProofPurposeSql(betaOriginal)} AND (?8 IS NULL OR (EXISTS(SELECT 1 FROM verification_proofs bproof WHERE bproof.id=?1 AND bproof.beta_window_id=?8) AND json_extract(j.value,'$.purpose')='verified_membership' AND json_extract(j.value,'$.wanted')=1 AND json_extract(j.value,'$.role')=?9)) AND EXISTS(SELECT 1 FROM verification_proofs exact WHERE exact.id=?1 AND exact.requester=?2 AND exact.native_profile=?5 AND exact.native_rank=?6 AND exact.rank_name=?7)
 ON CONFLICT(proof_id,role_id,desired) DO NOTHING`).bind(proofId,p.requester,JSON.stringify(rows),membershipBinding?.guild??env.GUILD_ID,p.native_profile,p.native_rank,p.rank_name,p.beta_window_id,p.beta_window_id===null?null:betaOriginal?.membershipRole??null).run();
 if(betaOriginal&&p.beta_window_id!==null)assertBetaConfiguration(betaOriginal);
 const found=await env.DB.prepare('SELECT id,role_id,desired,purpose FROM role_settlements WHERE proof_id=?1 LIMIT 28').bind(proofId).all<{id:string;role_id:string;desired:number;purpose:string}>();
 if(p.beta_window_id!==null){if(!betaOriginal)throw Error('beta_membership_only');assertBetaConfiguration(betaOriginal);}
 if(p.beta_window_id!==null&&(found.results.length!==1||found.results[0]!.purpose!=='verified_membership'||found.results[0]!.desired!==1||found.results[0]!.role_id!==betaOriginal?.membershipRole))throw Error('beta_membership_only');
 return rows.map(r=>{const matches=found.results.filter(x=>x.role_id===r.role&&x.desired===r.wanted&&x.purpose===r.purpose);if(matches.length!==1)throw Error('intent_currentness_changed');return matches[0]!.id;});
}
/** No automatic continuation from dispatching/unknown/held. A fresh GET can prove a landed outcome. */
/** Original Native facts custody only. No new database, provider or subject authority. */
class OriginalSettlementFactsHeld extends Error{constructor(){super('original_role_facts_changed');}}
const SETTLEMENT_INTENT_FIELDS=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','expires_at','roster_id','native_guid','native_profile','native_rank','native_rank_name','subject_generation','claim_nonce','created_at','request_digest','reason','checked_at','beta_window_id'] as const;
function captureOriginalSettlementFacts(raw:unknown,env:Env):Readonly<{intent:Readonly<Intent>|undefined;compensation:Readonly<{id:string;reason:string}>|undefined;check:()=>void}>{
 const held=():never=>{throw new OriginalSettlementFactsHeld();};
 const witnesses:(()=>void)[]=[];
 const capture=(value:unknown):ReadonlyMap<PropertyKey,unknown>=>{
  if(!value||typeof value!=='object')return held();const original=value,prototype=Object.getPrototypeOf(original),keys=Reflect.ownKeys(original),slots=keys.map(k=>Object.getOwnPropertyDescriptor(original,k));
  if(slots.some(d=>!d||!Object.hasOwn(d,'value')||d.get||d.set))return held();
  const snapshots=slots.map(d=>Object.freeze({...d!}));
  witnesses.push(()=>{if(Object.getPrototypeOf(original)!==prototype)return held();const live=Reflect.ownKeys(original);if(live.length!==keys.length||live.some((k,i)=>k!==keys[i]))return held();for(let i=0;i<keys.length;i++){const a=snapshots[i]!,b=Object.getOwnPropertyDescriptor(original,keys[i]!);if(!b||!Object.hasOwn(b,'value')||b.value!==a.value||b.writable!==a.writable||b.enumerable!==a.enumerable||b.configurable!==a.configurable||b.get!==a.get||b.set!==a.set)return held();}});
  return new Map(keys.map((k,i)=>[k,snapshots[i]!.value] as const));
 };
 if(!Array.isArray(raw))return held();const top=capture(raw);if(top.get('length')!==2||!top.has('0')||!top.has('1'))return held();
 const row=(index:'0'|'1',fields:readonly string[]):Record<string,string|number|null>|undefined=>{
  const envelope=top.get(index);if(Array.isArray(envelope))return held();const packet=capture(envelope),rows=packet.get('results');if(!Array.isArray(rows))return held();const array=capture(rows),length=array.get('length');if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>1000)return held();
  if(length===0){if(array.has('0'))return held();return undefined;}if(!array.has('0'))return held();const value=array.get('0');if(Array.isArray(value))return held();const native=capture(value),copy:Record<string,string|number|null>={};
  for(const key of fields){if(!native.has(key))return held();const scalar=native.get(key);if(scalar!==null&&typeof scalar!=='string'&&(typeof scalar!=='number'||!Number.isSafeInteger(scalar)))return held();copy[key]=scalar as string|number|null;}return Object.freeze(copy);
 };
 const intent=row('0',SETTLEMENT_INTENT_FIELDS),compensation=row('1',['id','reason']);
 const guild=Object.getOwnPropertyDescriptor(env,'GUILD_ID');if(!guild||!Object.hasOwn(guild,'value')||guild.get||guild.set||typeof guild.value!=='string')return held();const guildSlot=Object.freeze({...guild});
 const check=()=>{for(const witness of witnesses)witness();const d=Object.getOwnPropertyDescriptor(env,'GUILD_ID');if(!d||!Object.hasOwn(d,'value')||d.value!==guildSlot.value||d.writable!==guildSlot.writable||d.configurable!==guildSlot.configurable||d.enumerable!==guildSlot.enumerable||d.get!==guildSlot.get||d.set!==guildSlot.set)return held();};check();
 return Object.freeze({intent:intent as unknown as Readonly<Intent>|undefined,compensation:compensation as unknown as Readonly<{id:string;reason:string}>|undefined,check});
}
export async function settleRoleIntent(env:QrEnv,id:string,reconcileOnly=false,actor?:OriginalRoleActor,b:AttemptBudget=budget(),originalBetaCapture?:BetaGrantCapture,removalDispatch?:RemovalDispatch,originalLaunchSource?:LaunchMembershipSource):Promise<Settlement> {
 const launchMode=captureLaunchVerification(env);
 const removal=originalRemovalDispatch(env,removalDispatch);
 const betaOriginal=betaGrantConfiguration(env);
 const owner=actor?captureRoleActor(actor):null;actor=owner?.actor;owner?.check();if(!membershipSettlementEnabled(env)&&env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true')return result('held','features_disabled');if(!TOKEN.test(id))return result('held','invalid_operation');
 // Both lookups are keyed by the original operation id and have no intervening effect.
 owner?.check();const facts=await env.DB.batch([env.DB.prepare('SELECT r.*,(SELECT beta_window_id FROM verification_proofs p WHERE p.id=r.proof_id) AS beta_window_id FROM role_settlements r WHERE r.id=?1').bind(id),env.DB.prepare("SELECT id,reason FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 AND desired=0 AND attempts=1").bind(id)]);
 let original:ReturnType<typeof captureOriginalSettlementFacts>;
 try{original=captureOriginalSettlementFacts(facts,env);owner?.check();}catch(error){if(error instanceof OriginalSettlementFactsHeld)return result('held','original_role_facts_changed',id);throw error;}
 const i=original.intent,compensation=original.compensation;
 if(!i||i.guild_id!==env.GUILD_ID)return result('held','operation_not_current',id);
 if(/^(?:launch_membership(?:230|_(?:compensation|removal|erasure)230)|live_link_membership)$/.test(i.purpose))return observeLaunchMembershipDebt230(env,id,b);
 if(i.attempts===0&&oldSharedMemberProducerHeld230(env,i.guild_id,i.role_id))return result('held','shared_member230_old_producer_held',id);
 if(!reconcileOnly&&i.attempts===0&&nativeRankProducerHeld232(env,i.guild_id,i.role_id))return result('held','native232_old_producer_held',id);
 const betaScoped=i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id);
 const check=()=>{original.check();owner?.check();if(!reconcileOnly&&i.desired===1&&(launchMode.mode==='held'||!launchMode.current()))throw new OriginalSettlementFactsHeld();if(originalLaunchSource){try{assertLaunchMembershipMode(env,originalLaunchSource);}catch{throw new OriginalSettlementFactsHeld();}}if(!providerEffectStarted&&!compensation&&i.desired===1&&i.beta_window_id!==null&&i.beta_window_id!==undefined){if(!betaOriginal?.enabled||i.beta_window_id!==betaOriginal.windowId||i.purpose!=='verified_membership'||i.role_id!==betaOriginal.membershipRole)throw new OriginalSettlementFactsHeld();try{assertBetaConfiguration(betaOriginal);}catch{throw new OriginalSettlementFactsHeld();}}};
 const checked=async<T>(perform:()=>Promise<T>):Promise<T>=>{check();const value=await perform();check();return value;};
 const effectMethod=i.desired===1?'PUT':'DELETE',effectPath=`/guilds/${i.guild_id}/members/${i.subject}/roles/${i.role_id}`;
 let providerEffectStarted=false;
 try{check();
 if(compensation){if(!reconcileOnly)return result('unknown','explicit_compensation_reconciliation_required',id);const r=await checked(()=>reconcileRemovalReceipt(env,compensation.id,b));if(betaScoped&&['dispatching','unknown'].includes(i.state))return result('unknown','beta_original_put_unconfirmed',id,r.checkedAt);return result(r.state==='settled'?'held':r.state,r.state==='settled'?(compensation.reason.startsWith('membership_retirement')?'membership_retirement_absent':'removed_after_admission_changed'):r.reason,id,r.checkedAt);}
 // Current roster proof and fresh presence/absence do not establish that a lost original PUT
 // has finished. Intercept before both ordinary proof settlement and the cutoff branch.
 if(betaScoped&&i.attempts===1&&['dispatching','unknown'].includes(i.state))
  return reconcileOnly?await checked(()=>reconcileBetaClosedGrant(env,i,b)):result('unknown','beta_original_put_unconfirmed',id);
  // A disabled removal runner does not reopen the old source epoch for any grant producer.
  const betaPolicy=i.desired===1?await checked(()=>import('./beta-reset-policy')):null;
  const betaCapture=betaPolicy?(originalBetaCapture??await checked(()=>betaPolicy.captureBetaGrant(env,i.guild_id,i.role_id))):null;
  if(betaCapture&&(betaCapture.guildId!==i.guild_id||betaCapture.roleId!==i.role_id||!await checked(()=>betaPolicy!.betaGrantCurrent(env,betaCapture)))){
   if(reconcileOnly&&i.attempts===1&&['dispatching','unknown'].includes(i.state))return await checked(()=>reconcileBetaClosedGrant(env,i,b));
   return result('held','beta_grant_policy_held',id);
  }
 let membershipBinding:ReturnType<typeof membershipTargets>|undefined;
 try{if(['verified_membership','roster_membership'].includes(i.purpose)){
 if(!reconcileOnly&&!membershipSettlementEnabled(env))return result('held','membership_writer_disabled',id);
 const binding=membershipTargets(env);membershipBinding=binding;
 if(i.role_id!==binding.current){if(reconcileOnly&&membershipTransitionEnabled(env)&&i.role_id===binding.retired)return await checked(()=>reconcileRetiredMembershipReceipt(env,i,b));throw Error();}
 }
 else if(i.purpose==='verified_native_rank'||i.purpose==='roster_native_rank'){const map=rankMap(env);if(i.native_profile!==map.profile||!map.roles.includes(i.role_id)||i.desired!==Number(i.role_id===mappedNativeRole(i.native_rank_name!,i.native_rank!,map)))throw Error();}
 else if(i.purpose==='verified_privileged_rank'||i.purpose==='roster_privileged_rank'){
 if(env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true'||!['beta-five','ten-rank'].includes(i.native_profile!))throw Error();const map=privilegedNativeMap(i.native_profile as 'beta-five'|'ten-rank',env),wanted=map.wanted(i.native_rank_name!,i.native_rank!);
 if(!map.roles.includes(i.role_id)||i.desired!==Number(i.role_id===wanted))throw Error();
 if(i.desired===0&&!await checked(()=>env.DB.prepare("SELECT 1 FROM role_settlements WHERE subject=?1 AND role_id=?2 AND purpose IN('verified_privileged_rank','roster_privileged_rank') AND desired=1 AND attempts=1 AND state='settled'").bind(i.subject,i.role_id).first()))throw Error();
 }
 else if(!['verified_membership','roster_membership'].includes(i.purpose))throw Error();}catch{return result('held','frozen_configuration_changed',id);}
 if(!await checked(()=>intentCurrent(env,i,betaOriginal))){
 // A past spent attempt may be closed by fresh absence without minting any new authority/effect.
 if(reconcileOnly&&i.attempts===1&&['dispatching','unknown'].includes(i.state)){
 if(b.limit-b.attempts<4)return result('held','role_request_budget',id);try{const target=await checked(()=>qualify(env,b,i.subject,i.role_id,false));if(!target?.roles.includes(i.role_id)){
 await checked(()=>env.DB.prepare(`UPDATE role_settlements SET state='held',reason='past_effect_absent',checked_at=${DB_NOW} WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND attempts=1 AND state IN('dispatching','unknown')`).bind(id,i.guild_id,i.role_id).run());return result('held','past_effect_absent',id,now());}
 return result('unknown','present_effect_requires_current_authority_or_manual_removal',id,now());}catch{return result('held','current_server_unknown',id);}}
 return result('held','proof_or_generation_stale',id);}
 if(b.limit-b.attempts<8)return result('held','role_request_budget',id);let target:Member|null;
 try{target=await checked(()=>qualify(env,b,i.subject,i.role_id,i.desired===1,['verified_native_rank','roster_native_rank'].includes(i.purpose)||(membershipTransitionEnabled(env)&&['verified_membership','roster_membership'].includes(i.purpose))||!!i.beta_window_id));}catch{return result('held','inventory_hierarchy_or_server_hold',id);}
 if(!await checked(()=>intentCurrent(env,i,betaOriginal)))return result('held','proof_changed_after_lookup',id);
 if(betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return result('held','beta_grant_policy_changed',id);
 const nonce=randomGeneration(),base=i.proof_id?{sql:PROOF_CURRENT+' AND '+betaProofPurposeSql(betaOriginal)+(i.beta_window_id?(' AND '+betaMembershipEffectSql(betaOriginal!)):''),values:[i.proof_id,i.subject,id,nonce],id:3,nonce:4}:{sql:ROSTER_CURRENT,values:[...rosterParams(env,i),nonce],id:7,nonce:9};
 let guard=base.sql+` AND ?${base.nonce} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') AND id<>?${base.id})`;
 if(!reconcileOnly&&i.desired===1&&launchMode.mode==='members-only'){
   if(i.proof_id||!launchMode.scope)return result('held','live_native_scope_proof_required',id);
   const at=base.values.length+1;guard+=` AND EXISTS(SELECT 1 FROM roster_snapshots launch_scope WHERE launch_scope.id=?${at} AND launch_scope.source=?${at+1})`;base.values.push(i.roster_id,launchMode.scope.provenance);
 }
 if(originalLaunchSource){const launch=launchMembershipPredicate(env,originalLaunchSource,base.values.length+1);guard+=` AND (${launch.sql})`;base.values.push(...launch.values);}
 if(actor){const start=base.values.length+1;base.values.push(actor.id,actor.v,actor.e,actor.g);guard+=` AND ?${start+2}>${DB_NOW} AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?${start} AND session_version=?${start+1} AND in_server=1 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',actor.n)}) AND ${privacyGenerationFenceSql(start,start+3)}`;}
  if(betaCapture&&betaPolicy){const reset=betaPolicy.betaGrantSql(betaCapture,base.values.length+1);guard+=` AND (${reset.sql})`;base.values.push(...reset.values);}
 if(i.desired===1&&/^(verified|roster)_(native|privileged)_rank$/.test(i.purpose))guard+=` AND NOT EXISTS(SELECT 1 FROM role_settlements old JOIN role_settlements current ON current.id=?${base.id} WHERE old.subject=current.subject AND old.desired=0 AND old.state<>'settled' AND old.purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank') AND ((current.proof_id IS NOT NULL AND old.proof_id=current.proof_id) OR (current.roster_id IS NOT NULL AND old.roster_id=current.roster_id))
 AND NOT(current.proof_id IS NULL AND old.proof_id IS NULL AND current.roster_id IS NOT NULL
 AND old.purpose IN('roster_native_rank','roster_privileged_rank') AND old.state='held' AND old.reason='expired_without_dispatch' AND old.attempts=0 AND old.expires_at<=${DB_NOW}
 AND old.guild_id=current.guild_id AND old.subject_generation IS current.subject_generation AND old.native_guid IS current.native_guid
 AND old.native_profile IS current.native_profile AND old.native_rank IS current.native_rank AND old.native_rank_name IS current.native_rank_name))`;
 if(membershipBinding&&(!reconcileOnly&&!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,membershipBinding)))return result('held','frozen_configuration_changed',id);
 const update=(set:string,extra='',dispatch=false)=>{check();const consumingGuard=dispatch&&i.desired===1?betaGrantDispatchSql(env,removal,'guild_id','role_id',guard):guard;return env.DB.prepare(`UPDATE role_settlements SET ${set} WHERE id=?${base.id} AND ${consumingGuard} ${extra} RETURNING id`).bind(...base.values);};
 const present=!!target?.roles.includes(i.role_id);
 if(present===(i.desired===1)){
 const r=await checked(()=>update(`state='settled',reason='fresh_server_confirmed',checked_at=${DB_NOW}`).first());
 return r?result('settled','fresh_server_confirmed',id,now()):result('held','proof_changed_before_receipt',id);}
 if(reconcileOnly||i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',id,now());
 // Current-selection restriction only: preserve every spent/GET-only reconciliation above.
 if(i.native_profile==='ten-rank-treasurer-v1')return result('held','native_profile_not_current',id);
 // Item 15: new dispatch only. The compensation/beta/past-effect reconciliation and the fresh_server_confirmed receipt above
 // run in every mode; a fixed-target removal holds here, before its claim, at admit and at the final pre-effect point.
 if(i.desired===0&&removalHeld(env,removal,i.guild_id,i.role_id))return result('held',HELD_BY_MODE,id);
 if(i.desired===1&&(betaGrantDispatchHeld(env,removal,i.guild_id,i.role_id)||oldSharedMemberProducerHeld230(env,i.guild_id,i.role_id)))return result('held',HELD_BY_MODE,id);
 const claimed=await checked(()=>update(`state='dispatching',attempts=1,claim_nonce=?${base.nonce},reason='dispatching'`,`AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}`,true).first());
 check();if(!claimed)return result('held','claim_changed',id);
 if(i.desired===0&&removalHeld(env,removal,i.guild_id,i.role_id))return result('held',HELD_BY_MODE,id);
 if(i.desired===1&&(betaGrantDispatchHeld(env,removal,i.guild_id,i.role_id)||oldSharedMemberProducerHeld230(env,i.guild_id,i.role_id)))return result('held',HELD_BY_MODE,id);
 if(!await checked(()=>update("reason='admitted_before_effect'",`AND claim_nonce=?${base.nonce} AND state='dispatching'`,true).first()))return result('held','proof_changed_before_effect',id);
 if(membershipBinding&&(!reconcileOnly&&!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,membershipBinding)))return result('held','frozen_configuration_changed',id);
 if(betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return result('held','beta_grant_policy_changed',id);
 if(i.desired===0&&removalHeld(env,removal,i.guild_id,i.role_id))return result('held',HELD_BY_MODE,id);
 if(i.desired===1&&(betaGrantDispatchHeld(env,removal,i.guild_id,i.role_id)||oldSharedMemberProducerHeld230(env,i.guild_id,i.role_id)))return result('held',HELD_BY_MODE,id);
 // Scoped launch grants re-read the exact original admitted claim/source after
 // the final policy awaits. This is still not atomic with the following HTTP PUT.
 const finalAdmission=!reconcileOnly&&i.desired===1&&(originalLaunchSource||launchMode.mode==='members-only')?async()=>{
   check();const at=base.values.length+1;
   const admitted=await env.DB.prepare(`SELECT CASE WHEN (${guard}) AND EXISTS(SELECT 1 FROM role_settlements final_claim
     WHERE final_claim.id=?${at} AND final_claim.claim_nonce=?${at+1} AND final_claim.state='dispatching' AND final_claim.attempts=1
     AND final_claim.expires_at=?${at+2} AND final_claim.expires_at>${DB_NOW}) THEN 1 ELSE 0 END AS admitted`)
     .bind(...base.values,id,nonce,i.expires_at).first<{admitted:number}>();check();return admitted?.admitted===1;
 }:undefined;
 try{check();providerEffectStarted=true;await checked(()=>request(env,b,effectMethod,effectPath,finalAdmission,!reconcileOnly&&i.desired===1?check:undefined));}catch(cause){
 // A changed original Native witness cannot authorize more reset reads or compensation. Preserve the original
 // exact id/nonce unknown-receipt update below instead of throwing before recording that spent uncertainty.
 if(!(cause instanceof OriginalSettlementFactsHeld)&&betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return await checked(()=>compensateGrant(env,b,i,nonce,false,false,removal));
 await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_outcome_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(id,nonce).run();return result('unknown','provider_outcome_unknown',id);}
 // Even a 204 is not completion until current server state and admission are checked again.
 try{check();const after=await checked(()=>member(env,b,i.subject));check();const restricted=!!after&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&after.roles.includes(r.trim()));
 if(i.desired===1&&after?.roles.includes(i.role_id)&&(!await checked(()=>intentCurrent(env,i,betaOriginal))||restricted||membershipBinding&&(!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,membershipBinding))||betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture))))return await checked(()=>compensateGrant(env,b,i,nonce,false,true,removal));
 if(!!after?.roles.includes(i.role_id)!==(i.desired===1))throw Error('changed');
 const r=await checked(()=>update(`state='settled',reason='effect_and_current_server_confirmed',checked_at=${DB_NOW}`,`AND claim_nonce=?${base.nonce}`).first());
 if(i.beta_window_id&&i.desired===1&&after?.roles.includes(i.role_id)){let originalBeta=false;try{if(betaOriginal){assertBetaConfiguration(betaOriginal);const at=Date.now();originalBeta=Number.isSafeInteger(at)&&at<i.expires_at*1000;}}catch{}if(!originalBeta)return await checked(()=>compensateGrant(env,b,i,nonce,false,true,removal));}
 if(!r&&i.desired===1&&after?.roles.includes(i.role_id))return await checked(()=>compensateGrant(env,b,i,nonce,false,true,removal));
 if(!r)throw Error('changed');return result('settled','effect_and_current_server_confirmed',id,now());
 }catch(cause){if(!(cause instanceof OriginalSettlementFactsHeld)&&i.desired===1&&betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return await checked(()=>compensateGrant(env,b,i,nonce,true,true,removal));
 await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='confirmation_or_admission_unknown' WHERE id=?1 AND claim_nonce=?2`).bind(id,nonce).run();return result('unknown','confirmation_or_admission_unknown',id);}
 }catch(error){if(!(error instanceof OriginalSettlementFactsHeld))throw error;return result(providerEffectStarted?'unknown':'held','original_role_facts_changed',id);}
}
/** Observations update spent custody, but cannot assert that a lost original PUT has drained. */
async function reconcileBetaClosedGrant(env:Env,i:Intent,b:AttemptBudget):Promise<Settlement>{
 if(b.limit-b.attempts<4)return result('held','role_request_budget',i.id);
 try{
  const target=await qualify(env,b,i.subject,i.role_id,false);
  const observation='beta_'+(i.desired===1?'put':'delete')+'_observed_'+(target?.roles.includes(i.role_id)?'present':'absent')+'_unconfirmed';
  const closed=await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason=?12,checked_at=${DB_NOW}
   WHERE id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose=?5 AND desired=?14 AND attempts=1
   AND state=?6 AND claim_nonce IS ?7 AND subject_generation IS ?8 AND request_digest IS ?9 AND created_at=?10 AND expires_at=?11 AND reason=?13 RETURNING id`)
   .bind(i.id,i.subject,i.guild_id,i.role_id,i.purpose,i.state,i.claim_nonce,i.subject_generation,i.request_digest,i.created_at,i.expires_at,observation,i.reason,i.desired).first();
  return closed?result('unknown',observation,i.id,now()):result('held','beta_past_receipt_changed',i.id);
 }catch{return result('unknown','beta_past_effect_read_unknown',i.id);}
}
/** A landed grant that lost admission owes one separate, durable removal. This cannot mint a grant or retry a DELETE. */
async function compensateGrant(env:Env,b:AttemptBudget,i:Intent,parentNonce:string,betaReceiptReplyLost=false,putAcknowledged=true,removal:RemovalDispatch):Promise<Settlement>{
 // Item 15 (compensation producer2): the parent's entry capture holds a fixed-target child before its attempted INSERT.
 if(betaRoleDispatchHeld(env,removal,i.guild_id,i.role_id))return result('unknown',HELD_BY_MODE,i.id);
 const id=randomGeneration(),nonce=randomGeneration(),betaScoped=i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id);
 const ack=putAcknowledged?'acknowledged':'unknown';
 const claimed=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,claim_nonce,attempts,created_at,expires_at)
 SELECT ?1,subject,'grant_compensation',guild_id,role_id,0,'dispatching',?6,id,?3,1,${DB_NOW},${DB_NOW}+300 FROM role_settlements
  WHERE id=?2 AND claim_nonce=?4 AND (state='dispatching' OR (state='settled' AND ((?5=1 AND reason='effect_and_current_server_confirmed') OR EXISTS(SELECT 1 FROM verification_proofs beta_parent WHERE beta_parent.id=role_settlements.proof_id AND beta_parent.beta_window_id IS NOT NULL)))) AND desired=1 AND attempts=1
  AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?2) RETURNING id`).bind(id,i.id,nonce,parentNonce,Number(betaReceiptReplyLost),betaScoped?'beta_'+ack+'_put_cleanup':'admission_lost').first();
 if(!claimed)return result('unknown','compensation_claim_held',i.id);
 // Mode checked again after the claim ACK: a held child stays spent with no DELETE; parent and shared writers are untouched.
 if(betaRoleDispatchHeld(env,removal,i.guild_id,i.role_id))return result('unknown',HELD_BY_MODE,i.id);
 try{await request(env,b,'DELETE',`/guilds/${i.guild_id}/members/${i.subject}/roles/${i.role_id}`,undefined,undefined,oldSharedMemberProducerHeld230(env,i.guild_id,i.role_id)?launch230OriginalCompensation:putAcknowledged&&nativeRankProducerHeld232(env,i.guild_id,i.role_id)?native232OriginalDrain:undefined);const after=await member(env,b,i.subject);if(after?.roles.includes(i.role_id))throw Error();
 await env.DB.batch([env.DB.prepare(`UPDATE role_settlements SET state='settled',reason=?3,checked_at=${DB_NOW} WHERE id=?1 AND claim_nonce=?2`).bind(id,nonce,betaScoped?'beta_'+ack+'_put_cleanup_acknowledged':'removed'),env.DB.prepare("UPDATE role_settlements SET state=?3,reason=?4 WHERE id=?1 AND claim_nonce=?2").bind(i.id,parentNonce,putAcknowledged?'held':'unknown',putAcknowledged?'removed_after_admission_changed':'beta_put_unconfirmed_cleanup_observed')]);
 return result(putAcknowledged?'held':'unknown',putAcknowledged?'removed_after_admission_changed':'beta_put_unconfirmed_cleanup_observed',i.id,now());
 }catch{await env.DB.prepare("UPDATE role_settlements SET state='unknown',reason=?3 WHERE id IN(?1,?2)").bind(id,i.id,betaScoped?'beta_'+ack+'_put_cleanup_unknown':'compensation_unknown').run();return result('unknown','compensation_unknown',i.id);}
}
/** Past one-use removal authority permits only an outcome GET. Cause withdrawal/retirement never permits a second DELETE. */
export async function reconcileRemovalReceipt(env:Env,id:string,b:AttemptBudget=budget()):Promise<Settlement>{
 if(!TOKEN.test(id))return result('held','invalid_operation');const i=await env.DB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(id).first<Intent>();
 if(!i||i.guild_id!==env.GUILD_ID||i.desired!==0||i.attempts!==1||!['grant_compensation','ban','rename_hold','blocking_role','guild_departure'].includes(i.purpose))return result('held','removal_receipt_not_owned',id);
 if(i.purpose!=='grant_compensation'&&i.role_id!==env.ROLE_GUILD_MEMBER&&!(membershipTransitionEnabled(env)&&membershipTargets(env).retired===i.role_id))return result('held','frozen_configuration_changed',id);
 if(i.purpose==='grant_compensation'&&!await env.DB.prepare("SELECT 1 FROM role_settlements p JOIN role_settlements r ON r.request_digest=p.id WHERE r.id=?1 AND p.subject=r.subject AND p.guild_id=r.guild_id AND p.role_id=r.role_id AND p.desired=1 AND p.attempts=1").bind(id).first())return result('held','compensation_parent_changed',id);
 if(b.limit-b.attempts<4)return result('held','role_request_budget',id);let target:Member|null;try{target=await qualify(env,b,i.subject,i.role_id,false,false,[],membershipTransitionEnabled(env)&&membershipTargets(env).retired===i.role_id);}catch{return result('held','inventory_hierarchy_or_server_hold',id);}
 if(target?.roles.includes(i.role_id))return result('unknown','removal_outcome_not_absent',id,now());
 if(i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id)){
  // A previously acknowledged receipt needs no new completion write. In particular, never
  // let observing its absent child downgrade an unresolved original PUT parent.
  if(i.state==='settled')return result('settled','beta_acknowledged_removal_recorded',id,i.checked_at);
  const observed=await env.DB.prepare(`UPDATE role_settlements SET state='unknown',checked_at=${DB_NOW}
   WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND subject=?4 AND purpose=?5 AND desired=0 AND attempts=1 AND state=?6
   AND claim_nonce IS ?7 AND created_at=?8 AND expires_at=?9 AND subject_generation IS ?10 AND request_digest IS ?11 AND reason=?12 RETURNING id`)
   .bind(id,i.guild_id,i.role_id,i.subject,i.purpose,i.state,i.claim_nonce,i.created_at,i.expires_at,i.subject_generation,i.request_digest,i.reason).first();
  return observed?result('unknown','beta_removal_observed_absent_unconfirmed',id,now()):result('held','removal_receipt_changed',id);
 }
 const r=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason=?12,checked_at=${DB_NOW} WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND subject=?4 AND purpose=?5 AND desired=0 AND attempts=1 AND state=?6 AND claim_nonce IS ?7 AND created_at=?8 AND expires_at=?9 AND subject_generation IS ?10 AND request_digest IS ?11 RETURNING id`).bind(id,env.GUILD_ID,i.role_id,i.subject,i.purpose,i.state,i.claim_nonce,i.created_at,i.expires_at,i.subject_generation,i.request_digest,i.reason?.startsWith('membership_retirement')?'membership_retirement_absent':'absent').first();
 if(!r)return result('held','removal_receipt_changed',id);if(i.purpose==='grant_compensation'&&!i.reason?.startsWith('membership_retirement'))await env.DB.prepare("UPDATE role_settlements SET state='held',reason='removed_after_admission_changed' WHERE id=(SELECT request_digest FROM role_settlements WHERE id=?1) AND desired=1 AND attempts=1").bind(id).run();return result('settled','fresh_absence_only',id,now());
}
export type ErasureProof={purpose:'account_erasure';subject:string;subjectGeneration:string;operationId:string;requestDigest:string;accountIncarnation:string|null};
/** Privacy completion embeds this predicate in its SAME atomic local-erasure batch. */
export const ACCOUNT_ERASURE_ROLE_SETTLED_SQL=`EXISTS(SELECT 1 FROM role_settlements r WHERE r.id=?1 AND r.subject=?2 AND r.subject_generation=?3 AND r.request_digest=?4
 AND r.purpose='account_erasure' AND r.desired=0 AND r.state='settled' AND r.reason IN('absent','removed')
 AND r.checked_at<=${DB_NOW} AND r.checked_at>${DB_NOW}-60)`;
export type RemovalPurpose='ban'|'rename_hold'|'blocking_role'|'guild_departure';
/** The fixed reset policy authorizes only its twelve roles. Inventory observations are not effect
 * authority: fresh hierarchy/member and the same original policy are consumed before each claim.
 * Every DELETE has one durable attempt; unknown attempts get only GET on later slices.
 */
export async function settleBetaResetRemoval(env:Env,id:string,captured:BetaGrantCapture,b:AttemptBudget,scan:import('./beta-reset-policy').BetaResetScanCapture):Promise<Settlement>{
 const policy=await import('./beta-reset-policy');
 if(!TOKEN.test(id)||!policy.betaResetEnvironmentCurrent(env,captured))return result('held','beta_reset_scan_held',id);
 const guard=(start:number)=>policy.betaResetScanSql(captured,scan,start),readAdmission=()=>policy.betaResetScanCurrent(env,captured,scan);
 const initial=guard(2),first=await env.DB.prepare(`SELECT * FROM role_settlements WHERE id=?1 AND ${initial.sql}`).bind(id,...initial.values).first<Intent>();
 if(!first||!policy.betaResetEnvironmentCurrent(env,captured))return result('held','beta_reset_scan_held',id);
 const digest=await sha256(captured.raw!);
 if(!first||first.purpose!=='beta_reset'||first.desired!==0||first.guild_id!==policy.BETA_RESET_GUILD_ID
  ||!policy.BETA_RESET_ROLE_IDS.includes(first.role_id)||first.request_digest!==digest||!ID.test(first.subject))return result('held','beta_reset_intent_held',id);
 if(first.attempts===0&&oldSharedMemberProducerHeld230(env,first.guild_id,first.role_id))return result('held','shared_member230_old_producer_held',id);
 if(b.limit-b.attempts<6)return result('held','role_request_budget',id);
 let i=first,target:Member|null;
 const original=(row:Intent)=>JSON.stringify(row);
 // Tuple equality uses the original row, including its nonce, so concurrent continuations cannot adopt it.
 const owned=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose='beta_reset' AND desired=0 AND request_digest=?5
 AND state=json_extract(?6,'$.state') AND attempts=json_extract(?6,'$.attempts') AND claim_nonce IS json_extract(?6,'$.claim_nonce')
 AND reason=json_extract(?6,'$.reason') AND created_at=json_extract(?6,'$.created_at') AND expires_at=json_extract(?6,'$.expires_at')`;
 const values=(row:Intent)=>[row.id,row.subject,row.guild_id,row.role_id,digest,original(row)];
 // Each qualification GET repeats policy plus the exact original live scan in one SQL read.
 try{target=await qualify(env,b,i.subject,i.role_id,false,false,[],false,readAdmission,true);}catch{
  if(!await readAdmission())return result('held','beta_reset_scan_held',i.id);
  const g=guard(7);await env.DB.prepare(`UPDATE role_settlements SET state=CASE WHEN attempts=0 THEN 'held' ELSE 'unknown' END,
   reason='beta_reset_hierarchy_or_read_held',checked_at=${DB_NOW} WHERE ${owned} AND ${g.sql}`).bind(...values(i),...g.values).run();
  return result('held','beta_reset_hierarchy_or_read_held',i.id);
 }
 if(!policy.betaResetEnvironmentCurrent(env,captured))return result('held','beta_reset_scan_held',i.id);
 // An uncertain attempted DELETE is still uncertain even when a later GET sees absence.
 // Only this invocation's acknowledged DELETE and confirmation may write a settled receipt.
 if(i.attempts===1){
  const g=guard(7);await env.DB.prepare(`UPDATE role_settlements SET state='unknown',
   reason=?${7+g.values.length},checked_at=${DB_NOW} WHERE ${owned} AND ${g.sql}`)
   .bind(...values(i),...g.values,target?.roles.includes(i.role_id)?'beta_reset_spent_present':'beta_reset_spent_absent_unresolved').run();
  return result('unknown','beta_reset_attempt_unresolved',i.id,now());
 }
 if(!target?.roles.includes(i.role_id)){
  const g=guard(7),closed=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='beta_reset_absent',checked_at=${DB_NOW}
   WHERE ${owned} AND ${g.sql} RETURNING id`).bind(...values(i),...g.values).first();
  return closed?result('settled','beta_reset_absent',i.id,now()):result('held','beta_reset_receipt_changed',i.id);
 }
 if(!['pending','held'].includes(i.state)||i.reason==='beta_reset_observation_consumed')return result('held','beta_reset_intent_held',i.id);
 // Discovery rows may wait longer than five minutes. Fresh provider evidence creates a distinct
 // five-minute operation; the old observation/expired unspent intent is never renewed or retried.
 const operation=randomGeneration(),g=guard(8),transfer=[...values(i),operation,...g.values];
 const next=await env.DB.batch([
  env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,created_at,expires_at)
   SELECT ?7,subject,purpose,guild_id,role_id,0,'pending','beta_reset_fresh_target',request_digest,${DB_NOW},${DB_NOW}+300 FROM role_settlements
   WHERE ${owned} AND ${policy.betaResetDispatchSql(env,captured,g.sql)} AND attempts=0 AND NOT EXISTS(SELECT 1 FROM role_settlements other
   WHERE other.subject=?2 AND other.guild_id=?3 AND other.role_id=?4 AND other.purpose='beta_reset' AND other.id<>?1
   AND other.attempts=1 AND other.state IN('dispatching','unknown')) RETURNING *`).bind(...transfer),
  env.DB.prepare(`UPDATE role_settlements SET state='held',reason='beta_reset_observation_consumed',checked_at=${DB_NOW}
   WHERE ${owned} AND ${policy.betaResetDispatchSql(env,captured,g.sql)} AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?7 AND reason='beta_reset_fresh_target')`).bind(...transfer)
 ]);
 const successor=next[0]?.results[0] as Intent|undefined;if(!successor)return result('held','beta_reset_transfer_held',i.id);i=successor;
 const nonce=randomGeneration(),claimGuard=guard(8),claim=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?7,reason='beta_reset_dispatching'
  WHERE ${owned} AND attempts=0 AND expires_at>${DB_NOW} AND ${policy.betaResetDispatchSql(env,captured,claimGuard.sql)} RETURNING *`).bind(...values(i),nonce,...claimGuard.values).first<Intent>();
 if(!claim)return result('held','beta_reset_claim_held',i.id);i=claim;
 const finalGuard=guard(7);
 if(!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${owned}
  AND state='dispatching' AND attempts=1 AND expires_at>${DB_NOW} AND ${policy.betaResetDispatchSql(env,captured,finalGuard.sql)}`).bind(...values(i),...finalGuard.values).first()
  ||!policy.betaResetEnvironmentCurrent(env,captured))return result('held','beta_reset_effect_held',i.id);
 if(policy.betaResetDispatchMode(env,captured)==='held')return result('held',HELD_BY_MODE,i.id);
 try{
  await request(env,b,'DELETE',`/guilds/${i.guild_id}/members/${i.subject}/roles/${i.role_id}`);
  // Completion of this acknowledged effect keeps its own exact custody after scan expiry.
  // A changed environment cannot redirect the confirmation to a different provider identity.
  if(!policy.betaResetEnvironmentCurrent(env,captured))return result('unknown','beta_reset_receipt_held',i.id);
  const after=await member(env,b,i.subject);if(after?.roles.includes(i.role_id))throw Error('beta_reset_present');
  const r=policy.betaResetSql(captured,7),settled=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='beta_reset_removed',checked_at=${DB_NOW}
   WHERE ${owned} AND ${r.sql} RETURNING id`).bind(...values(i),...r.values).first();
  return settled?result('settled','beta_reset_removed',i.id,now()):result('unknown','beta_reset_receipt_held',i.id);
 }catch{
  const r=policy.betaResetSql(captured,7);await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='beta_reset_outcome_unknown',checked_at=${DB_NOW}
   WHERE ${owned} AND ${r.sql}`).bind(...values(i),...r.values).run();
  return result('unknown','beta_reset_outcome_unknown',i.id);
 }
}
const renameRemovalSql=`EXISTS(SELECT 1 FROM rename_holds h WHERE h.discord_id=?2 AND h.state='reapply'
 AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=?2 AND c.status IN('member','left_pending') AND NOT EXISTS(
 SELECT 1 FROM rename_holds h2 WHERE h2.discord_id=?2 AND h2.state='reapply' AND (c.name_key=h2.char_key OR (h2.guid IS NOT NULL AND c.guid=h2.guid)))))`;
/** Removal-only current-source adapter. Caller purpose chooses a predicate, never supplies authority or a target role. */
export async function settleVerifiedRemoval(env:Env,subject:string,purpose:RemovalPurpose,b:AttemptBudget=budget(),capturedGeneration?:string|null,targetRole?:string,originalOwned?:Intent,removalDispatch?:RemovalDispatch):Promise<Settlement>{
 const removal=originalRemovalDispatch(env,removalDispatch);
 if(!membershipSettlementEnabled(env))return result('held','membership_writer_disabled');
 let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{return result('held','removal_configuration');}const role=targetRole??binding.current;
 if(oldSharedMemberProducerHeld230(env,binding.guild,role))return settleLaunchMembershipRemoval230(env,subject,purpose,capturedGeneration,b);
 if(targetRole!==undefined&&(!membershipTransitionEnabled(env)||role!==binding.current&&role!==binding.retired))return result('held','removal_configuration');
 if(membershipTransitionEnabled(env)&&capturedGeneration===undefined)return result('held','original_removal_generation_required');
 const owned=role===binding.retired?(originalOwned??await env.DB.prepare(`SELECT * FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND role_id=?3 AND purpose='roster_membership' AND proof_id IS NULL AND desired=1 AND attempts=1 AND claim_nonce IS NOT NULL AND subject_generation IS ?4 AND state IN('settled','dispatching','unknown') ORDER BY created_at,id LIMIT 1`).bind(subject,binding.guild,role,capturedGeneration??null).first<Intent>()):null;
  if(role===binding.retired&&!owned)return result('held','retired_role_not_bot_owned');
 if(!ID.test(subject)||!role||!['ban','rename_hold','blocking_role','guild_departure'].includes(purpose)||purpose==='guild_departure'&&(capturedGeneration===undefined||capturedGeneration!==null&&!TOKEN.test(capturedGeneration)))return result('held','removal_configuration');
 const prior=await env.DB.prepare("SELECT id FROM role_settlements WHERE subject=?1 AND purpose=?2 AND guild_id=?3 AND role_id=?4 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') ORDER BY created_at,id LIMIT 1").bind(subject,purpose,env.GUILD_ID,role).first<{id:string}>();if(prior)return reconcileRemovalReceipt(env,prior.id,b);
 // Capture before any Discord await. A new OAuth generation is never substituted after lookup or at dispatch.
 const original=await readPrivacySubject(env,subject);if(original&&original.state!=='active')return result('held','subject_held');
 if(capturedGeneration===undefined)capturedGeneration=original?.subjectGeneration??null;
 if(capturedGeneration!==(original?.subjectGeneration??null))return result('held','original_removal_generation_changed');
 if(b.limit-b.attempts<8)return result('held','role_request_budget');
 const cause=purpose==='ban'?"EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)":purpose==='rename_hold'?renameRemovalSql:purpose==='guild_departure'?`EXISTS(SELECT 1 FROM characters WHERE discord_id=?2)
 AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?2 AND (status IN('member','left_pending') OR guid IS NULL))
 AND EXISTS(SELECT 1 FROM roster_snapshots s WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
 AND s.exported_at<=${DB_NOW} AND s.exported_at>${DB_NOW}-600 AND s.exported_at>=?7 AND NOT EXISTS(SELECT 1 FROM roster_members r JOIN characters c ON c.guid=r.guid WHERE r.snapshot_id=s.id AND c.discord_id=?2))`:'1=1';
 const ownedTuple=owned?JSON.stringify(owned):null;
  const ownership=owned?`EXISTS(SELECT 1 FROM role_settlements p WHERE p.subject=?2 AND p.guild_id=?12 AND p.purpose='roster_membership' AND p.proof_id IS NULL AND p.desired=1 AND p.attempts=1 AND p.claim_nonce IS NOT NULL AND p.subject_generation IS ?6 AND p.state IN('settled','dispatching','unknown') AND ${['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','claim_nonce','subject_generation','created_at','expires_at','request_digest','roster_id','native_guid','native_profile','native_rank','native_rank_name','reason'].map(k=>`p.${k} IS json_extract(?14,'$.${k}')`).join(' AND ')})`:'1=1';
  const predicate=`(${cause}) AND ${privacyGenerationFenceSql(2,6)} AND ${ownership}`;
  const values=(items:(string|number|null)[],tail:(string|number|null)[]=[])=>{const out=items.slice();while(out.length<5)out.push(null);out.push(capturedGeneration!);if(purpose==='guild_departure'||tail.length||owned)out.push(purpose==='guild_departure'?Number(env.LINKS_NOT_BEFORE||0):null);out.push(...tail);if(owned){while(out.length<13)out.push(null);out[11]=binding.guild;out.push(ownedTuple);}return out;};
 let target:Member|null;try{target=await qualify(env,b,subject,role,false);}catch{return result('held','inventory_hierarchy_or_server_hold');}
 const blocker=(m:Member|null)=>!!m&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&m.roles.includes(r.trim()));
 if(purpose==='blocking_role'&&!blocker(target))return result('held','removal_cause_withdrawn');
 const fresh=await env.DB.prepare(`SELECT 1 WHERE ?1 IS NOT NULL AND ?2 IS NOT NULL AND ${predicate}`).bind(...values([role,subject])).first();if(!fresh||!membershipTargetsCurrent(env,binding))return result('held','removal_cause_withdrawn');
 // Item 15: new dispatch only. The prior spent receipt above is reconciled GET-only in every mode; a fixed target creates no
 // new intent unless the mode is absent and unchanged, while an existing intent is still read for its ACK-free absent receipt.
 const createHeld=removalHeld(env,removal,env.GUILD_ID,role);
 const operation=randomGeneration();
 if(!createHeld)await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,created_at,expires_at,subject_generation)
 SELECT ?1,?2,?3,?4,?5,0,'pending','awaiting_dispatch',${DB_NOW},${DB_NOW}+300,?6 WHERE ${predicate}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5 AND state<>'settled')`).bind(...values([operation,subject,purpose,env.GUILD_ID,role])).run();
 const i=await env.DB.prepare("SELECT * FROM role_settlements WHERE subject=?1 AND purpose=?2 AND guild_id=?3 AND role_id=?4 AND state<>'settled' ORDER BY created_at,id LIMIT 1").bind(subject,purpose,env.GUILD_ID,role).first<Intent>();if(!i)return result('held',createHeld?HELD_BY_MODE:'removal_intent_held');
 if(i.subject_generation!==capturedGeneration)return result('held','original_removal_generation_changed',i.id);
 if(i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id)&&i.attempts===1&&['dispatching','unknown'].includes(i.state))return result('unknown','beta_original_removal_unconfirmed',i.id);
 const settle=async()=>!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='absent',checked_at=${DB_NOW} WHERE id=?1 AND subject=?2 AND ${predicate} RETURNING id`).bind(...values([i.id,subject])).first();
 if(!target?.roles.includes(role))return await settle()?result('settled','absent',i.id,now()):result('held','removal_cause_withdrawn',i.id);
 if(i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',i.id);
 // Blocking-role authority is a fresh current server observation, not an interaction's stale roles hint.
 if(purpose==='blocking_role'){try{target=await member(env,b,subject);}catch{return result('held','current_server_unknown',i.id);}if(!blocker(target))return result('held','removal_cause_withdrawn',i.id);}
 if(removalHeld(env,removal,env.GUILD_ID,role))return result('held',HELD_BY_MODE,i.id);
 const nonce=randomGeneration(),claim=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',claim_nonce=?3,attempts=1,reason='dispatching'
 WHERE id=?1 AND subject=?2 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${predicate} RETURNING id`).bind(...values([i.id,subject,nonce])).first();if(!claim)return result('held','removal_cause_withdrawn',i.id);
 const finalValues=values([role,subject],[i.id,nonce,i.created_at,i.expires_at,binding.guild,purpose]);
 if(!membershipTargetsCurrent(env,binding)||!await env.DB.prepare(`SELECT 1 WHERE ?1 IS NOT NULL AND ?2 IS NOT NULL AND ${predicate}
 AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?8 AND subject=?2 AND role_id=?1 AND guild_id=?12 AND purpose=?13 AND subject_generation IS ?6 AND desired=0 AND state='dispatching' AND attempts=1 AND claim_nonce=?9 AND created_at=?10 AND expires_at=?11 AND expires_at>${DB_NOW})`).bind(...finalValues).first())return result('held','removal_cause_withdrawn',i.id);
 if(removalHeld(env,removal,env.GUILD_ID,role))return result('held',HELD_BY_MODE,i.id);
 try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${subject}/roles/${role}`);const after=await member(env,b,subject);if(after?.roles.includes(role)||!await settle())throw Error();return result('settled','removed',i.id,now());
 }catch{await env.DB.prepare("UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?2").bind(i.id,nonce).run();return result('unknown','provider_or_confirmation_unknown',i.id);}
}
export const settleGuildDepartureRole=(env:Env,subject:string,capture:{subjectGeneration:string|null},b?:AttemptBudget,removalDispatch?:RemovalDispatch)=>settleVerifiedRemoval(env,subject,'guild_departure',b,capture.subjectGeneration,undefined,undefined,removalDispatch);
/** Retired grants are historical custody only: no authority refresh, PUT, nonce replacement or expiry renewal. */
async function reconcileRetiredMembershipReceipt(env:Env,i:Intent,b:AttemptBudget):Promise<Settlement>{
 if(i.desired!==1||i.attempts!==1||!['dispatching','unknown'].includes(i.state)||!i.claim_nonce)return result('held','retired_grant_no_spent_custody',i.id);
 if(b.limit-b.attempts<4)return result('held','role_request_budget',i.id);
 let target:Member|null;try{target=await qualify(env,b,i.subject,i.role_id,false,false,[],true);}catch{return result('held','current_server_unknown',i.id);}
 if(target?.roles.includes(i.role_id))return result('unknown','retired_effect_present_requires_owned_removal',i.id,now());
 const out=await env.DB.prepare(`UPDATE role_settlements SET state='held',reason='retired_effect_absent',checked_at=${DB_NOW}
 WHERE id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose=?5 AND desired=1 AND attempts=1
 AND state=?6 AND claim_nonce=?7 AND created_at=?8 AND expires_at=?9 AND subject_generation IS ?10 RETURNING id`)
 .bind(i.id,i.subject,i.guild_id,i.role_id,i.purpose,i.state,i.claim_nonce,i.created_at,i.expires_at,i.subject_generation).first();
 return out?result('held','retired_effect_absent',i.id,now()):result('held','retired_receipt_changed',i.id);
}
/** Source-only two-target closure. A retired target is touched only with demonstrable original bot grant custody.
 * Unknown stops this bounded request; there is no background migration or manual/staff-role holder sweep.
 */
export async function settleMembershipRemoval(env:Env,subject:string,purpose:RemovalPurpose,capture?:{subjectGeneration:string|null},b:AttemptBudget={limit:16,attempts:0,retries:0},removalDispatch?:RemovalDispatch):Promise<Settlement>{
 const removal=originalRemovalDispatch(env,removalDispatch);
 if(oldSharedMemberProducerHeld230(env,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return settleLaunchMembershipRemoval230(env,subject,purpose,capture?.subjectGeneration,b);
 if(!membershipTransitionEnabled(env))return settleVerifiedRemoval(env,subject,purpose,b,capture?.subjectGeneration,undefined,undefined,removal);
 if(!capture||!Object.hasOwn(capture,'subjectGeneration'))return result('held','original_removal_generation_required');
 let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{return result('held','removal_configuration');}
 // Item 15: no entry hold here. The current target goes through settleVerifiedRemoval (its prior receipt reconcile and
 // absent receipt run in every mode) or through the pair below, which holds a fixed current target's whole delegation.
 const targets=[binding.current];let owned:Intent|null=null;if(binding.retired){
  owned=await env.DB.prepare(`SELECT *, (SELECT q.id FROM role_settlements q WHERE q.subject=?1 AND q.guild_id=?2 AND q.purpose=?5 AND q.role_id IN(?6,?3)
  AND q.desired=0 AND q.attempts=1 AND q.state IN('dispatching','unknown') ORDER BY q.created_at,q.id LIMIT 1) AS original_remove_id FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND role_id=?3
  AND purpose='roster_membership' AND proof_id IS NULL AND desired=1 AND attempts=1 AND claim_nonce IS NOT NULL
  AND subject_generation IS ?4 AND state IN('settled','dispatching','unknown') ORDER BY created_at,id LIMIT 1`).bind(subject,binding.guild,binding.retired,capture.subjectGeneration,purpose,binding.current).first<Intent>();
  if(owned)targets.push(binding.retired);
  }
  if(b.limit-b.attempts<8*targets.length)return result('held','role_request_budget');
  // Item 15 (retired target): a fixed retired target with bot-owned custody is held; a fresh current target keeps its
  // own existing single-target removal, and the result still reports the hold.
  const retiredHeld=!!owned&&!!binding.retired&&removalHeld(env,removal,binding.guild,binding.retired);
  // The pair's prior spent removal (either target) is still reconciled GET-only while the fixed retired target is held.
  const priorPair=retiredHeld?(owned as Intent&{original_remove_id:string|null}).original_remove_id:null;
  if(priorPair)return reconcileRemovalReceipt(env,priorPair,b);
  if(owned&&binding.retired&&!retiredHeld)return settleOwnedMembershipPair(env,subject,purpose,capture.subjectGeneration,b,binding,owned,removal);
 let last: Settlement=result('held','removal_unconfirmed');
 for(const role of retiredHeld?[binding.current]:targets){if(!membershipTargetsCurrent(env,binding))return result('held','frozen_configuration_changed');
 last=await settleVerifiedRemoval(env,subject,purpose,b,capture.subjectGeneration,role,role===binding.retired?owned!:undefined,removal);if(last.state!=='settled')return last;}
  return retiredHeld?result('held',HELD_BY_MODE,last.operationId,last.checkedAt):last;
}
/** One fixed two-target qualification and one native fresh-operation claim group.
 * The two receipts retain independent final proofs, original deadlines and GET-only unknown custody.
 * Sharing this source-bound admission group avoids charging four transport statements for each INSERT/claim.
 */
async function settleOwnedMembershipPair(env:Env,subject:string,purpose:RemovalPurpose,g:string|null,b:AttemptBudget,binding:ReturnType<typeof membershipTargets>,owned:Intent,removal:RemovalDispatch):Promise<Settlement>{
 const roles=[binding.current,binding.retired!];
 const prior=(owned as Intent&{original_remove_id:string|null}).original_remove_id;
 if(prior)return reconcileRemovalReceipt(env,prior,b);
 const fields=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','claim_nonce','subject_generation','created_at','expires_at','request_digest','roster_id','native_guid','native_profile','native_rank','native_rank_name','reason','checked_at'];
 const parent=JSON.stringify(owned);
 const cause=purpose==='ban'?"EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)":purpose==='rename_hold'?renameRemovalSql:purpose==='guild_departure'?`EXISTS(SELECT 1 FROM characters WHERE discord_id=?2)
  AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?2 AND (status IN('member','left_pending') OR guid IS NULL))
  AND EXISTS(SELECT 1 FROM roster_snapshots s WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
  AND s.exported_at<=${DB_NOW} AND s.exported_at>${DB_NOW}-600 AND s.exported_at>=?7 AND NOT EXISTS(SELECT 1 FROM roster_members r JOIN characters c ON c.guid=r.guid WHERE r.snapshot_id=s.id AND c.discord_id=?2))`:'1=1';
 const owner=`EXISTS(SELECT 1 FROM role_settlements p WHERE p.subject=?2 AND p.guild_id=?4 AND p.role_id=?9
  AND p.purpose='roster_membership' AND p.proof_id IS NULL AND p.desired=1 AND p.attempts=1 AND p.claim_nonce IS NOT NULL
  AND p.subject_generation IS ?6 AND p.state IN('settled','dispatching','unknown') AND ${fields.map(k=>`p.${k} IS json_extract(?10,'$.${k}')`).join(' AND ')})`;
 const base=`(${cause}) AND ${privacyGenerationFenceSql(2,6)}`;
 const args=(id:string,role:string,nonce:string)=>([id,subject,purpose,binding.guild,role,g,Number(env.LINKS_NOT_BEFORE||0),nonce,binding.retired!,parent] as (string|number|null)[]);
 let target:Member|null;try{target=await qualify(env,b,subject,binding.current,false,false,[{id:binding.retired!,cosmetic:false}],true);}catch{return result('held','inventory_hierarchy_or_server_hold');}
 const blocked=(m:Member|null)=>!!m&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&m.roles.includes(r.trim()));
 if(!membershipTargetsCurrent(env,binding)||purpose==='blocking_role'&&!blocked(target))return result('held','removal_cause_withdrawn');
 const active=roles.filter(role=>target?.roles.includes(role));
 if(!active.length){const a=args('',roles[0],'');return await env.DB.prepare(`SELECT 1 WHERE ?1 IS NOT NULL AND ?3 IS NOT NULL AND ?4 IS NOT NULL AND ?5 IS NOT NULL AND ?7 IS NOT NULL AND ?8 IS NOT NULL AND ${base} AND ${owner}`).bind(...a).first()?result('settled','absent',null,now()):result('held','removal_cause_withdrawn');}
 // Item 15: new dispatch only (the prior receipt reconcile and the no-write absent result above run in every mode). A fixed
 // current target holds the whole delegation, a fresh retired partner included.
 if(removalHeld(env,removal,binding.guild,binding.current))return result('held',HELD_BY_MODE);
 // Each spent INSERT below is creation and claim at once. A fixed target held by the mode (a fixed retired target, or a
 // mode change since the line above) gets no INSERT; a fresh target of the pair keeps its removal and the result reports the hold.
 let heldByMode=active.some(role=>removalHeld(env,removal,binding.guild,role));
 const plans=active.filter(role=>!heldByMode||!removalHeld(env,removal,binding.guild,role)).map(role=>({role,id:randomGeneration(),nonce:randomGeneration()}));
 if(!plans.length)return result('held',HELD_BY_MODE);
 const batch:D1PreparedStatement[]=[];
 for(const p of plans){batch.push(env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,attempts,created_at,expires_at)
  SELECT ?1,?2,?3,?4,?5,0,'dispatching','dispatching',?8,?6,1,${DB_NOW},${DB_NOW}+300 WHERE ${base} AND ${owner}
  AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5 AND state<>'settled') RETURNING *`).bind(...args(p.id,p.role,p.nonce)));
  // Adjacent native abort means ignored/zero-row creation cannot leave a half-claimed pair.
  batch.push(env.DB.prepare("SELECT json(CASE WHEN changes()=1 THEN 'null' ELSE '!' END) AS claimed"));}
 let out:D1Result[];try{out=await env.DB.batch(batch);}catch{return result('unknown','original_claim_outcome_unconfirmed',plans[0].id);}
 const intents:Intent[]=[];
 for(let k=0;k<plans.length;k++){const i=out[k*2]?.results?.[0] as Intent|undefined,p=plans[k];
  if(!i||i.id!==p.id||i.subject!==subject||i.guild_id!==binding.guild||i.role_id!==p.role||i.purpose!==purpose||i.subject_generation!==g||i.state!=='dispatching'||i.attempts!==1||i.claim_nonce!==p.nonce||!Number.isInteger(i.created_at)||!Number.isInteger(i.expires_at)||i.expires_at-i.created_at!==300)return result('unknown','original_claim_outcome_unconfirmed',p.id);
  intents.push(i);}
 let last:Settlement=result('settled','absent',null,now());
 for(const i of intents){
  // Retired removal gets a current member observation after any earlier target effect; no original capture is refreshed.
  if(i.role_id===binding.retired){try{target=await member(env,b,subject);}catch{return result('held','current_server_unknown',i.id);}}
  if(!membershipTargetsCurrent(env,binding)||purpose==='blocking_role'&&!blocked(target))return result('held','removal_cause_withdrawn',i.id);
  const a=args(i.id,i.role_id,i.claim_nonce!),tuple=`id=?1 AND subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5 AND desired=0 AND subject_generation IS ?6 AND claim_nonce=?8 AND created_at=?11 AND expires_at=?12 AND ?12>${DB_NOW} AND state='dispatching' AND attempts=1`;
  a.push(i.created_at,i.expires_at);
  const authority=`${base}${i.role_id===binding.retired?` AND ${owner}`:''}`;
  const proof=await env.DB.prepare(`SELECT 1 WHERE ?7 IS NOT NULL AND ?9 IS NOT NULL AND ?10 IS NOT NULL AND ${authority} AND EXISTS(SELECT 1 FROM role_settlements WHERE ${tuple})`).bind(...a).first();
  if(!proof)return result('held','removal_cause_withdrawn',i.id);
  const settle=async()=>!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='removed',checked_at=${DB_NOW} WHERE ${tuple} AND ?7 IS NOT NULL AND ?9 IS NOT NULL AND ?10 IS NOT NULL AND ${authority} RETURNING id`).bind(...a).first();
  // A fixed target whose mode changed after its claim stays spent with no DELETE; a fresh target still proceeds.
  if(removalHeld(env,removal,i.guild_id,i.role_id)){heldByMode=true;continue;}
  let settling=false;
  try{if(target?.roles.includes(i.role_id))await request(env,b,'DELETE',`/guilds/${i.guild_id}/members/${subject}/roles/${i.role_id}`);target=await member(env,b,subject);
   if(target?.roles.includes(i.role_id))throw Error('confirmation_unknown');
   settling=true;if(!await settle())return result('unknown','original_settlement_unconfirmed',i.id);last=result('settled','removed',i.id,now());
  }catch{
   // The original settlement may have committed. Its spent nonce/tuple is already durable:
   // retain that outcome and reconcile by GET; never issue another custody write from a lost reply.
   if(settling)return result('unknown','original_settlement_unconfirmed',i.id);
   await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose=?5 AND subject_generation IS ?6 AND claim_nonce=?7 AND created_at=?8 AND expires_at=?9 AND state='dispatching' AND attempts=1`).bind(i.id,i.subject,i.guild_id,i.role_id,i.purpose,i.subject_generation,i.claim_nonce,i.created_at,i.expires_at).run();return result('unknown','provider_or_confirmation_unknown',i.id);}
 }
 return heldByMode?result('held',HELD_BY_MODE,last.operationId,last.checkedAt):last;
}
export const RETIREMENT_PARENT_FIELDS=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','claim_nonce','subject_generation','created_at','expires_at','request_digest','roster_id','native_guid','native_profile','native_rank','native_rank_name','reason','checked_at'] as const;
export type RetirementParent=Readonly<Intent>;
type AttendedInput=Readonly<{staff:OriginalSiteSession;binding:ReturnType<typeof membershipTargets>;parent:RetirementParent;subjectGeneration:string|null;expiresAt:number;formNonce:string;child:RetirementParent|null}>;
export type AttendedRetirementAdmission=AttendedInput&{readonly origin:D1Database};
const attendedAdmissions=new WeakSet<AttendedRetirementAdmission>();
/** Internal trusted route seam, after its fixed-purpose MAC verification; never a client-supplied capability. */
export function admitAttendedMembershipRetirement(env:Env,input:AttendedInput):AttendedRetirementAdmission{
 assertOriginalSiteSessionRead(input.staff);if(!isSiteAdmin(env,input.staff.u)||!membershipTargetsCurrent(env,input.binding)||!TOKEN.test(input.formNonce)||!Number.isSafeInteger(input.expiresAt)||input.expiresAt>input.staff.e)throw Error('retirement_attended_admission');
 const project=(p:RetirementParent)=>Object.freeze(Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,p[k]]))) as RetirementParent;
 const a=Object.freeze({...input,staff:input.staff,binding:Object.freeze({...input.binding}),parent:project(input.parent),child:input.child?project(input.child):null,origin:env.DB});attendedAdmissions.add(a);return a;
}
/** Original staff/form authority is consumed only before dispatch. After dispatch, exact spent custody
 * can retain a late outcome when that staff session closes; it creates no new effect or account authority.
 */
async function retireAttendedMembershipRole(env:Env,grantId:string,capture:{subjectGeneration:string|null},b:AttemptBudget,a:AttendedRetirementAdmission,removal:RemovalDispatch):Promise<Settlement>{
 if(!attendedAdmissions.has(a)||a.origin!==env.DB||grantId!==a.parent.id||capture.subjectGeneration!==a.subjectGeneration||!membershipTransitionEnabled(env)||!membershipTargetsCurrent(env,a.binding))return result('held','retirement_attended_admission_required');
 const p=a.parent,s=a.staff,binding=a.binding,live=()=>{assertOriginalSiteSessionRead(s);return isSiteAdmin(env,s.u)&&membershipTargetsCurrent(env,binding);};
 if(!binding.retired||p.guild_id!==binding.guild||p.role_id!==binding.retired||p.purpose!=='roster_membership'||p.proof_id!==null||p.desired!==1||p.attempts!==1||p.state!=='settled'||!p.claim_nonce)return result('held','retirement_original_grant_not_owned');
 const parent=(param:number)=>`EXISTS(SELECT 1 FROM role_settlements p WHERE ${RETIREMENT_PARENT_FIELDS.map(k=>`p.${k} IS json_extract(?${param},'$.${k}')`).join(' AND ')})`;
 const staff=`${fenceSql('applicantWrite',14,15,16,s.g,s.n)} AND ?17>${DB_NOW} AND ?17<=?16`;
 const approvedParent=JSON.stringify(p),custody=privacyProviderCustodyDatabase(env);
 if(a.child){
  const r=a.child;
  if(r.purpose!=='grant_compensation'||r.request_digest!==p.id||r.subject!==p.subject||r.guild_id!==p.guild_id||r.role_id!==p.role_id||r.subject_generation!==p.subject_generation||r.desired!==0||r.attempts!==1||!r.claim_nonce||!['dispatching','unknown','settled'].includes(r.state)||!r.reason.startsWith('membership_retirement'))return result('held','retirement_receipt_changed');
  const values=[JSON.stringify(r),approvedParent,s.u,s.v,s.e,a.expiresAt];
  const child=`${RETIREMENT_PARENT_FIELDS.map(k=>`${k} IS json_extract(?1,'$.${k}')`).join(' AND ')}`;
  const recovery=`${child} AND ${parent(2)} AND ${fenceSql('applicantWrite',3,4,5,s.g,s.n)} AND ?6>${DB_NOW} AND ?6<=?5`;
  if(!live()||!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${recovery}`).bind(...values).first())return result('held','retirement_original_admission_changed',r.id);
  if(b.limit-b.attempts<4)return result('held','role_request_budget',r.id);
  const readAdmission=async()=>live()&&!!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${recovery}`).bind(...values).first();
  let target:Member|null;try{target=await qualify(env,b,r.subject,r.role_id,false,false,[],true,readAdmission);}catch{return result('held','retirement_inventory_hold',r.id);}
  if(target?.roles.includes(r.role_id))return result('unknown','retirement_outcome_not_absent',r.id,now());
  if(r.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(r.role_id)&&r.state!=='settled'){
   // Attended authority may observe this exact receipt; it cannot prove a lost DELETE drained.
   try{if(!live()||!await env.DB.prepare(`UPDATE role_settlements SET state='unknown',checked_at=${DB_NOW} WHERE ${recovery} RETURNING id`).bind(...values).first())return result('held','retirement_receipt_changed',r.id);}
   catch{return result('unknown','original_settlement_unconfirmed',r.id);}
   return result('unknown','beta_removal_observed_absent_unconfirmed',r.id,now());
  }
  try{if(!live()||!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='membership_retirement_absent',checked_at=${DB_NOW} WHERE ${recovery} RETURNING id`).bind(...values).first())return result('held','retirement_receipt_changed',r.id);}
  catch{return result('unknown','original_settlement_unconfirmed',r.id);}
  return result('settled','retirement_reconciled_absent',r.id,now());
 }
 if(p.subject_generation!==a.subjectGeneration)return result('held','retirement_original_generation_changed');
 const id=a.formNonce,nonce=randomGeneration(),args:unknown[]=[id,p.subject,p.id,p.guild_id,p.role_id,a.subjectGeneration,p.claim_nonce,p.created_at,p.expires_at,nonce,approvedParent,0,0,s.u,s.v,s.e,a.expiresAt];
 const originalParent=`${parent(11)} AND EXISTS(SELECT 1 FROM role_settlements p WHERE p.id=?3 AND p.subject=?2 AND p.guild_id=?4 AND p.role_id=?5 AND p.subject_generation IS ?6 AND p.claim_nonce=?7 AND p.created_at=?8 AND p.expires_at=?9)`;
 const original=`${originalParent} AND ${privacyGenerationFenceSql(2,6)} AND ${staff}`;
 if(!live()||!await env.DB.prepare(`SELECT 1 WHERE ${original} AND ?1 IS NOT NULL AND ?3 IS NOT NULL AND ?4 IS NOT NULL AND ?5 IS NOT NULL AND ?7 IS NOT NULL AND ?8 IS NOT NULL AND ?9 IS NOT NULL AND ?10 IS NOT NULL AND ?12=0 AND ?13=0`).bind(...args).first())return result('held','retirement_original_admission_changed');
 const prior=await env.DB.prepare(`SELECT id FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 LIMIT 1`).bind(p.id).first<{id:string}>();if(prior)return result('held','retirement_prior_receipt_requires_status',prior.id);
 // Item 15 (producer3): new dispatch only. The attended GET-only child recovery above runs in every mode; the exact parent
 // target holds here, before any request, and again at child creation, claim and the final pre-effect point.
 if(removalHeld(env,removal,p.guild_id,p.role_id))return result('held',HELD_BY_MODE);
 if(b.limit-b.attempts<8)return result('held','role_request_budget');
 const readAdmission=async()=>live()&&!!await env.DB.prepare(`SELECT 1 WHERE ${original} AND ?1 IS NOT NULL AND ?10 IS NOT NULL AND ?12 IS NOT NULL AND ?13 IS NOT NULL`).bind(...args).first();
 let target:Member|null;try{target=await qualify(env,b,p.subject,binding.retired,false,false,[{id:binding.current,cosmetic:true}],true,readAdmission);}catch{return result('held','retirement_inventory_hold');}
 if(!target?.roles.includes(binding.current)||!live())return result('held','retirement_replacement_not_current');
 if(removalHeld(env,removal,p.guild_id,p.role_id))return result('held',HELD_BY_MODE);
 const out=await env.DB.batch<{id?:string;created_at?:number;expires_at?:number;admitted?:number}>([
  env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,subject_generation,created_at,expires_at)
 SELECT ?1,?2,'grant_compensation',?4,?5,0,'pending','membership_retirement_pending',?3,?6,${DB_NOW},min(${DB_NOW}+300,?17) WHERE ${original}
 AND ?10 IS NOT NULL AND ?7 IS NOT NULL AND ?8 IS NOT NULL AND ?9 IS NOT NULL AND ?12=0 AND ?13=0
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?3) RETURNING id,created_at,expires_at`).bind(...args),
  env.DB.prepare(`SELECT CASE WHEN changes()=1 AND ${original}
 AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?1 AND subject=?2 AND request_digest=?3 AND guild_id=?4 AND role_id=?5
 AND subject_generation IS ?6 AND purpose='grant_compensation' AND proof_id IS NULL AND desired=0 AND state='pending'
 AND attempts=0 AND claim_nonce IS NULL AND reason='membership_retirement_pending' AND checked_at IS NULL
 AND created_at=${DB_NOW} AND expires_at=min(${DB_NOW}+300,?17) AND roster_id IS NULL AND native_guid IS NULL
 AND native_profile IS NULL AND native_rank IS NULL AND native_rank_name IS NULL)
 AND ?10 IS NOT NULL AND ?12=0 AND ?13=0 THEN 1 ELSE json_extract('retirement_child_creation_refused','$') END AS admitted`).bind(...args)]);
 const child=out[0]?.results[0];if(out.length!==2||out[1]?.results[0]?.admitted!==1||!child||child.id!==id||!Number.isSafeInteger(child.created_at)||!Number.isSafeInteger(child.expires_at))return result('unknown','retirement_creation_unconfirmed',id);
 args[11]=child.created_at;args[12]=child.expires_at;
 const tuple=`id=?1 AND subject=?2 AND guild_id=?4 AND role_id=?5 AND purpose='grant_compensation' AND proof_id IS NULL AND request_digest=?3 AND subject_generation IS ?6 AND desired=0 AND created_at=?12 AND expires_at=?13 AND roster_id IS NULL AND native_guid IS NULL AND native_profile IS NULL AND native_rank IS NULL AND native_rank_name IS NULL`;
 const pending=`${tuple} AND state='pending' AND attempts=0 AND claim_nonce IS NULL AND reason='membership_retirement_pending' AND checked_at IS NULL AND ?13>${DB_NOW} AND ${original}`;
 const dispatching=`${tuple} AND state='dispatching' AND attempts=1 AND claim_nonce=?10 AND reason='membership_retirement_dispatching' AND checked_at IS NULL`;
 if(!target.roles.includes(binding.retired))return live()&&!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='membership_retirement_absent',checked_at=${DB_NOW} WHERE ${pending} AND ?10 IS NOT NULL RETURNING id`).bind(...args).first()?result('settled','retirement_absent',id,now()):result('held','retirement_original_admission_changed',id);
 try{target=await member(env,b,p.subject,readAdmission);}catch{return result('held','retirement_current_server_unknown',id);}
 if(!target?.roles.includes(binding.current)||!live())return result('held','retirement_replacement_not_current',id);
 if(removalHeld(env,removal,p.guild_id,p.role_id))return result('held',HELD_BY_MODE,id);
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='membership_retirement_dispatching' WHERE ${pending} RETURNING id`).bind(...args).first();
 if(!claimed||!live()||!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${dispatching} AND ?13>${DB_NOW} AND ${original}`).bind(...args).first())return result('held','retirement_original_admission_changed',id);
 // All following writes are response-only, exact original spent custody. No original admission is refreshed.
 const response=`${dispatching} AND ${originalParent}`,responseArgs=args.slice(0,13);
 if(removalHeld(env,removal,p.guild_id,p.role_id))return result('held',HELD_BY_MODE,id);
 let settling=false;
 try{await request(env,b,'DELETE',`/guilds/${p.guild_id}/members/${p.subject}/roles/${p.role_id}`);const after=await member(env,b,p.subject);if(after?.roles.includes(p.role_id))throw Error('retirement_confirmation_unknown');
  settling=true;if(!await custody.prepare(`UPDATE role_settlements SET state='settled',reason='membership_retirement_absent',checked_at=${DB_NOW} WHERE ${response} RETURNING id`).bind(...responseArgs).first())return result('unknown','original_settlement_unconfirmed',id);
  return result('settled','retirement_removed',id,now());
 }catch{
  if(settling)return result('unknown','original_settlement_unconfirmed',id);
  try{await custody.prepare(`UPDATE role_settlements SET state='unknown',reason='membership_retirement_unknown' WHERE ${response}`).bind(...responseArgs).run();}catch{return result('unknown','original_settlement_unconfirmed',id);}
  return result('unknown','retirement_confirmation_unknown',id);
 }
}
/** Request-only retirement of one proven bot-owned roster grant. The current replacement must be present.
 * This does not migrate manual/legacy holders or authorize channel/role permission changes.
 * A separate removal receipt retains its own original cause/nonce/deadline; the grant receipt is never rewritten.
 */
export async function retireOwnedMembershipRole(env:Env,grantId:string,capture:{subjectGeneration:string|null},b:AttemptBudget=budget(),admission?:AttendedRetirementAdmission,removalDispatch?:RemovalDispatch):Promise<Settlement>{
 const removal=originalRemovalDispatch(env,removalDispatch);
 if(admission)return retireAttendedMembershipRole(env,grantId,capture,b,admission,removal);
 if(!membershipTransitionEnabled(env)||!TOKEN.test(grantId)||!capture||!Object.hasOwn(capture,'subjectGeneration'))return result('held','retirement_admission_required');
 let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{return result('held','retirement_configuration');}
 if(!binding.retired)return result('held','retirement_binding_absent');
 const parent=await env.DB.prepare("SELECT * FROM role_settlements WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND purpose='roster_membership' AND proof_id IS NULL AND desired=1 AND attempts=1 AND state='settled' AND claim_nonce IS NOT NULL AND subject_generation IS ?4").bind(grantId,binding.guild,binding.retired,capture.subjectGeneration).first<Intent>();
 if(!parent)return result('held','retirement_original_grant_not_owned');
 const existing=await env.DB.prepare("SELECT * FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 ORDER BY created_at,id LIMIT 1").bind(grantId).first<Intent>();
 if(existing){if(!existing.reason.startsWith('membership_retirement')||existing.guild_id!==parent.guild_id||existing.role_id!==parent.role_id||existing.subject!==parent.subject||existing.subject_generation!==capture.subjectGeneration)return result('held','retirement_original_receipt_changed');
  if(existing.attempts===1)return reconcileRemovalReceipt(env,existing.id,b);return result('held','retirement_prior_unspent_hold',existing.id);}
 // Item 15 (producer4): new dispatch only. The existing-child GET-only reconcile above runs in every mode; the retired
 // target holds here, before any request, and again at child creation, claim and the final pre-effect point.
 if(removalHeld(env,removal,parent.guild_id,parent.role_id))return result('held',HELD_BY_MODE);
 if(b.limit-b.attempts<8)return result('held','role_request_budget');
 let target:Member|null;try{target=await qualify(env,b,parent.subject,binding.retired,false,false,[{id:binding.current,cosmetic:true}]);}catch{return result('held','retirement_inventory_hold');}
 if(!target?.roles.includes(binding.current)||!membershipTargetsCurrent(env,binding))return result('held','retirement_replacement_not_current');
 const id=randomGeneration(),nonce=randomGeneration();
 const args=[id,parent.subject,parent.id,parent.guild_id,parent.role_id,capture.subjectGeneration,parent.claim_nonce,parent.created_at,parent.expires_at,nonce,JSON.stringify(parent)];
 const parentFields=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','claim_nonce','subject_generation','created_at','expires_at','request_digest','roster_id','native_guid','native_profile','native_rank','native_rank_name','reason','checked_at'];
 const original=`EXISTS(SELECT 1 FROM role_settlements p WHERE p.id=?3 AND p.subject=?2 AND p.guild_id=?4 AND p.role_id=?5 AND p.purpose='roster_membership' AND p.proof_id IS NULL AND p.desired=1 AND p.attempts=1 AND p.state='settled' AND p.claim_nonce=?7 AND p.created_at=?8 AND p.expires_at=?9 AND p.subject_generation IS ?6 AND ${parentFields.map(k=>`p.${k} IS json_extract(?11,'$.${k}')`).join(' AND ')}) AND ${privacyGenerationFenceSql(2,6)}`;
 if(removalHeld(env,removal,parent.guild_id,parent.role_id))return result('held',HELD_BY_MODE);
 const child=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,subject_generation,created_at,expires_at)
 SELECT ?1,?2,'grant_compensation',?4,?5,0,'pending','membership_retirement_pending',?3,?6,${DB_NOW},${DB_NOW}+300 WHERE ${original}
 AND ?10 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?3) RETURNING id,created_at,expires_at`).bind(...args).first<{id:string;created_at:number;expires_at:number}>();
  if(!child)return result('held','retirement_original_cause_changed');
  args.push(child.created_at,child.expires_at);
  const guarded=`id=?1 AND subject=?2 AND guild_id=?4 AND role_id=?5 AND purpose='grant_compensation' AND request_digest=?3 AND subject_generation IS ?6 AND desired=0 AND created_at=?12 AND expires_at=?13 AND ?13>${DB_NOW} AND ${original}`;
 const pending=`${guarded} AND state='pending' AND attempts=0 AND claim_nonce IS NULL`;
 const spent=`${guarded} AND state='dispatching' AND attempts=1 AND claim_nonce=?10`;
 const settle=async(fence:string)=>membershipTargetsCurrent(env,binding)&&!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='membership_retirement_absent',checked_at=${DB_NOW} WHERE ${fence} AND ?10 IS NOT NULL RETURNING id`).bind(...args).first();
 if(!target.roles.includes(binding.retired))return await settle(pending)?result('settled','retirement_absent',id,now()):result('held','retirement_original_cause_changed',id);
 // A consuming fresh server check must retain the current replacement before the separate old-role removal.
 try{target=await member(env,b,parent.subject);}catch{return result('held','retirement_current_server_unknown',id);}
 if(!target?.roles.includes(binding.current)||!membershipTargetsCurrent(env,binding))return result('held','retirement_replacement_not_current',id);
 if(removalHeld(env,removal,parent.guild_id,parent.role_id))return result('held',HELD_BY_MODE,id);
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='membership_retirement_dispatching' WHERE ${pending} RETURNING id`).bind(...args).first();
 if(!claimed||!membershipTargetsCurrent(env,binding)||!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${guarded} AND ?10 IS NOT NULL AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?1 AND state='dispatching' AND attempts=1 AND claim_nonce=?10)`).bind(...args).first())return result('held','retirement_original_cause_changed',id);
 if(removalHeld(env,removal,parent.guild_id,parent.role_id))return result('held',HELD_BY_MODE,id);
  let settling=false;
 try{await request(env,b,'DELETE',`/guilds/${parent.guild_id}/members/${parent.subject}/roles/${parent.role_id}`);const after=await member(env,b,parent.subject);
  if(after?.roles.includes(parent.role_id))throw Error('retirement_confirmation_unknown');
  settling=true;if(!await settle(spent))return result('unknown','original_settlement_unconfirmed',id);return result('settled','retirement_removed',id,now());
 }catch{
  // A final custody reply may be lost after commit. Keep the original spent operation GET-only.
  if(settling)return result('unknown','original_settlement_unconfirmed',id);
  await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='membership_retirement_unknown' WHERE ${spent} AND ?10 IS NOT NULL`).bind(...args).run();return result('unknown','retirement_confirmation_unknown',id);}
}

/** Plain original job scalar capture only. Native durable proof remains the authority. */
function originalErasureRoleProof(input:ErasureProof):Readonly<ErasureProof>{
 const keys=['purpose','subject','subjectGeneration','operationId','requestDigest','accountIncarnation'] as const,copy:Record<string,unknown>={};for(const k of keys){const d=input&&Object.getOwnPropertyDescriptor(input,k);if(!d||!Object.hasOwn(d,'value')||d.get||d.set)throw Error('privacy_erasure_role_held');copy[k]=d.value;}if(copy.accountIncarnation!==null)privacyAccountIncarnation(copy.accountIncarnation);return Object.freeze(copy) as unknown as Readonly<ErasureProof>;
}
/** One expired/spent debt per turn, GET only. A visit cursor is an audit fact, never role settlement. */
export async function reconcileAccountErasureRoleDebt(env:Env,proof:ErasureProof){
 proof=originalErasureRoleProof(proof);
 const authority=await import('./privacy-serving-authority'),b:AttemptBudget={limit:8,attempts:0,retries:0},outcomes:Settlement[]=[];
 if(proof.purpose!=='account_erasure'||!ID.test(proof.subject)||!TOKEN.test(proof.operationId)||!TOKEN.test(proof.subjectGeneration)||!/^[0-9a-f]{64}$/.test(proof.requestDigest))return {state:'held' as const,outcomes,attempts:0};
 const values=[proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest];
 const facts=await env.DB.batch([env.DB.prepare(`SELECT (${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})) AS current`).bind(...values),env.DB.prepare(`WITH last_visit AS (
 SELECT json_extract(details,'$.id') AS id,json_extract(details,'$.createdAt') AS created_at FROM audit
 WHERE action='privacy.role_debt_visit' AND subject=?2 AND json_valid(details)
 AND json_extract(details,'$.operationId')=?1 AND json_type(details,'$.id')='text' AND json_type(details,'$.createdAt')='integer'
 ORDER BY audit.ts DESC,audit.id DESC LIMIT 1)
 SELECT r.* FROM role_settlements r LEFT JOIN verification_proofs p ON p.id=r.proof_id
 WHERE (r.subject=?2 OR p.requester=?2 OR p.signer=?2) AND r.attempts=1 AND r.state IN('dispatching','unknown') AND r.expires_at<=${DB_NOW}
 AND r.purpose<>'account_erasure' AND ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})
 ORDER BY CASE WHEN r.created_at>COALESCE((SELECT created_at FROM last_visit),-1)
 OR (r.created_at=(SELECT created_at FROM last_visit) AND r.id>(SELECT id FROM last_visit)) THEN 0 ELSE 1 END,r.created_at,r.id LIMIT 1`).bind(...values)]);
 if((facts[0]!.results[0] as {current:number}|undefined)?.current!==1)return {state:'held' as const,outcomes,attempts:0};
 for(const row of facts[1]!.results as Intent[]){if(!await authority.currentAccountErasureProof(env,proof))return {state:'held' as const,outcomes,attempts:b.attempts};
 const original=JSON.stringify(Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,row[k]])));
 const r=/^(?:launch_membership(?:230|_(?:compensation|removal|erasure)230)|live_link_membership)$/.test(row.purpose)?await observeLaunchMembershipDebt230(env,row.id,b):row.desired===0?await reconcileRemovalReceipt(env,row.id,b):await settleRoleIntent(env,row.id,true,undefined,b);outcomes.push(r);
 if(!await authority.currentAccountErasureProof(env,proof))return {state:'held' as const,outcomes,attempts:b.attempts};
 // Only an unchanged original spent tuple can record a visit. No state/reason/nonce/clock is rewritten.
 // A lost reply never retries this write; committed visits rotate the next turn, uncommitted visits stay owed.
 await env.DB.prepare(`INSERT INTO audit(ts,action,actor,subject,details)
 SELECT ${DB_NOW},'privacy.role_debt_visit','privacy',?2,?6 WHERE ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})
 AND EXISTS(SELECT 1 FROM role_settlements r WHERE ${RETIREMENT_PARENT_FIELDS.map(k=>`r.${k} IS json_extract(?5,'$.${k}')`).join(' AND ')})`)
 .bind(...values,original,JSON.stringify({operationId:proof.operationId,id:row.id,createdAt:row.created_at})).run();}
 return {state:outcomes.some(r=>r.state==='unknown')?'held' as const:'checked' as const,outcomes,attempts:b.attempts};
}
/** The privacy owner supplies current durable job authority; no boolean/caller string mints it. */
export async function settleErasure(env:Env,proof:ErasureProof,b:AttemptBudget=budget(),removalDispatch?:RemovalDispatch) {
 const removal=originalRemovalDispatch(env,removalDispatch);
 proof=originalErasureRoleProof(proof);
 const authority=await import('./privacy-serving-authority');
 const held={state:'held' as const,checkedAt:null,staffAccess:'unknown' as const};
 if(oldSharedMemberProducerHeld230(env,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return held;
 if(proof.purpose!=='account_erasure'||!ID.test(proof.subject)||!TOKEN.test(proof.operationId)||!TOKEN.test(proof.subjectGeneration)||!/^[0-9a-f]{64}$/.test(proof.requestDigest)||!env.ROLE_GUILD_MEMBER)return held;
 // Item 15: new dispatch only. A fixed target creates no new intent unless the mode is absent and unchanged (the INSERT keeps
 // its place in the batch and is restricted by AND 0=1); an existing intent is still read, observed by GET and may settle
 // its ACK-free absent receipt. The claim and the final pre-effect point hold below.
 const createHeld=removalHeld(env,removal,env.GUILD_ID,env.ROLE_GUILD_MEMBER);
 const p=[proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest];
 // Original current proof, frozen intent creation and its readback are one native snapshot.
 // A repeated request cannot replace its intent or renew its expiry.
 const facts=await env.DB.batch([env.DB.prepare(`SELECT (${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})) AS current`).bind(...p),env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at)
 SELECT ?1,?2,'account_erasure',?5,?6,0,'pending','awaiting_dispatch',?3,?4,${DB_NOW},${DB_NOW}+300 WHERE ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})${createHeld?' AND 0=1':''}
 ON CONFLICT(id) DO NOTHING`).bind(...p,env.GUILD_ID,env.ROLE_GUILD_MEMBER),env.DB.prepare(`SELECT * FROM role_settlements WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4
 AND purpose='account_erasure' AND guild_id=?5 AND role_id=?6 AND desired=0`).bind(...p,env.GUILD_ID,env.ROLE_GUILD_MEMBER)]);
 if((facts[0]!.results[0] as {current:number}|undefined)?.current!==1)return held;
 const intent=facts[2]!.results[0] as Intent|undefined;
 if(!intent)return held;
 let target:Member|null;try{target=await qualify(env,b,proof.subject,env.ROLE_GUILD_MEMBER,false);}catch{return held;}
 if(!await authority.currentAccountErasureProof(env,proof))return held;
 const staff=(env.ROLE_OFFICER||'')+','+(env.ROLE_MODERATOR||'')+','+(env.ROLE_GUILD_LEADER||'')+','+(env.ROLE_GUILD_MASTER||'')+','+(env.ROLE_RAID_LEADER||'');
 const staffAccess=target?.roles.some(r=>staff.split(',').includes(r))?'human-managed' as const:'none' as const;
 if(intent.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(intent.role_id)&&intent.attempts===1&&['dispatching','unknown'].includes(intent.state))return {state:'unknown' as const,checkedAt:null,staffAccess};
 const settle=async(reason:'absent'|'removed')=>!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason=?5,checked_at=${DB_NOW}
 WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)}) RETURNING id`).bind(...p,reason).first();
 if(!target?.roles.includes(env.ROLE_GUILD_MEMBER))return await settle('absent')?{state:'absent' as const,checkedAt:now(),staffAccess}:held;
 if(intent.state!=='pending'||intent.attempts!==0||intent.expires_at<=now())return {state:'unknown' as const,checkedAt:null,staffAccess};
 const nonce=randomGeneration();
 if(removalHeld(env,removal,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return held;
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?5,reason='dispatching'
 WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}
 AND ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)}) RETURNING id`).bind(...p,nonce).first();
 if(!claimed||!await authority.currentAccountErasureProof(env,proof))return held;
 const unknown=async()=>{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(proof.operationId,nonce).run();return {state:'unknown' as const,checkedAt:null,staffAccess};};
 if(removalHeld(env,removal,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return held;
 try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${proof.subject}/roles/${env.ROLE_GUILD_MEMBER}`);
 const after=await member(env,b,proof.subject);if(after?.roles.includes(env.ROLE_GUILD_MEMBER)||!await authority.currentAccountErasureProof(env,proof))return unknown();
 return await settle('removed')?{state:'removed' as const,checkedAt:now(),staffAccess}:unknown();
 }catch{return unknown();}
}
// --- Fresh full-release lanes (Revision 4, owner decisions of 16 Oct 2026). Additions only: every line above is .160.
// Reached only from the configured lane pass, which is loaded by dynamic import; .160 never acts on a lane purpose
// (:272, :351) and no lane function touches a twelve role (beta-reset-policy.ts:9-14). The captured LaneCapture is the only
// configuration authority, and every lane SQL text and constant lives in full-release-roles.ts.
// P1-A (Codex 22:44/23:18 UTC, 16 Oct): no function below closes an attempted effect from a later read. Only its own
// acknowledged request and confirming read settle it (the receipts, compensateGrant); every outcome read only stamps checked_at,
// and the lane never calls .160 reconcileRemovalReceipt or settleRoleIntent(reconcileOnly) for a spent row.
export type LaneRoleVerdict='ok'|'missing'|'held';
/** One member read ('screen', e.g. the M1 screen) or one shared qualified inventory read ('inventory') with a verdict per
 * requested role. blocked: a BLOCKING_ROLE_IDS role on the observed member (:47). */
export type LaneObservation=Readonly<{kind:'screen'|'inventory';member:Readonly<{roles:readonly string[]}>|null;verdicts:ReadonlyMap<string,LaneRoleVerdict>;cosmetic:ReadonlyMap<string,boolean>;blocked:boolean}>;
const LANE_ROLE_SET_MAX=24,LANE_SPENT_READ_LIMIT=24;
const laneTwelve=(role:string)=>BETA_RESET_ROLE_IDS.includes(role);
const laneSpent=(i:Readonly<Intent>)=>i.attempts===1&&(i.state==='dispatching'||i.state==='unknown');
const laneGeneration=(g:string|null)=>g===null||typeof g==='string'&&TOKEN.test(g);
function laneObservation(env:Env,kind:LaneObservation['kind'],target:Member|null,verdicts=new Map<string,LaneRoleVerdict>(),cosmetic=new Map<string,boolean>()):LaneObservation{
 const roles=target?Object.freeze(target.roles.slice()):null,blocking=(env.BLOCKING_ROLE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 return Object.freeze({kind,member:roles?Object.freeze({roles}):null,verdicts,cosmetic,blocked:!!roles&&blocking.some(x=>roles.includes(x))});
}
/** One counted member GET through the private reader (:33-35). A 404 observes a non-member. */
export async function laneMemberRead(env:Env,b:AttemptBudget,subject:string):Promise<LaneObservation>{
 if(!ID.test(env.GUILD_ID)||!ID.test(subject)||!env.DISCORD_BOT_TOKEN)throw new Error('role_configuration');
 const target=await member(env,b,subject);if(target&&(!Array.isArray(target.roles)||target.roles.some(r=>typeof r!=='string')))throw new Error('role_inventory');
 return laneObservation(env,'screen',target);
}
/** The four GETs and checks of qualify (:37-46) once for a whole role set, then a verdict per role: 'missing' (absent),
 * 'held' (managed, @everyone, at or above the bot, or neither Manage Roles nor Administrator) or 'ok'. target_hierarchy
 * still holds the whole subject (throws). Cosmetic and blocker refusals are the consumers' per-grant checks.
 */
export async function laneQualifyEach(env:Env,b:AttemptBudget,subject:string,roles:readonly string[]):Promise<LaneObservation>{
 if(!ID.test(env.GUILD_ID)||!ID.test(subject)||!env.DISCORD_BOT_TOKEN||!Array.isArray(roles)||roles.length<1||roles.length>LANE_ROLE_SET_MAX||roles.some(r=>typeof r!=='string'||!ID.test(r))||new Set(roles).size!==roles.length)throw new Error('role_configuration');
 const me=await request<{id:string}>(env,b,'GET','/users/@me');if(!ID.test(env.DISCORD_APP_ID)||me.id!==env.DISCORD_APP_ID||me.id===subject)throw new Error('bot_identity');
 const listed=await request<Role[]>(env,b,'GET',`/guilds/${env.GUILD_ID}/roles`);
 const bot=await member(env,b,me.id),target=await member(env,b,subject);
 if(!Array.isArray(listed)||listed.length>250||!bot||!Array.isArray(bot.roles)||target&&!Array.isArray(target.roles))throw new Error('role_inventory');
 if(listed.some(r=>!ID.test(r.id)||!Number.isInteger(r.position)||typeof r.permissions!=='string'||!/^\d{1,32}$/.test(r.permissions)||typeof r.managed!=='boolean')||new Set(listed.map(r=>r.id)).size!==listed.length)throw new Error('role_inventory');
 const inventory=new Map(listed.map(r=>[r.id,r]));const botRoles=bot.roles.map(id=>inventory.get(id));if(botRoles.some(r=>!r))throw new Error('bot_inventory');
 const highest=Math.max(0,...botRoles.map(r=>r!.position)),permission=botRoles.reduce((v,r)=>v|BigInt(r!.permissions),BigInt(inventory.get(env.GUILD_ID)?.permissions||'0')),manage=!!(permission&268435456n||permission&8n);
 if(target){if(target.roles.some(id=>!inventory.has(id))||Math.max(0,...target.roles.map(id=>inventory.get(id)!.position))>=highest)throw new Error('target_hierarchy');}
 const verdicts=new Map<string,LaneRoleVerdict>(),cosmetic=new Map<string,boolean>();
 for(const id of roles){const r=inventory.get(id);verdicts.set(id,!r?'missing':r.managed||r.id===env.GUILD_ID||r.position>=highest||!manage?'held':'ok');if(r)cosmetic.set(id,r.permissions==='0');}
 return laneObservation(env,'inventory',target,verdicts,cosmetic);
}
type LaneModule=typeof import('./full-release-roles');
class LaneConfigurationHeld extends Error{constructor(){super('lane_configuration_changed');}}
const LANE_INTENT_FACTS='SELECT r.*,NULL AS beta_window_id FROM role_settlements r WHERE r.id=?1';
const LANE_COMPENSATION_FACTS="SELECT id,reason FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 AND desired=0 AND attempts=1";
type LaneIntentAuthority=Readonly<{kind:LaneKind;epoch:number;digest:string|null;family:readonly string[]}>;
/** Step 2 of the consumer: the row against the captured lane only (guild, ten-rank facts, clock, D, managed set, wanted). */
function laneIntentAuthority(L:LaneModule,cap:LaneCapture,i:Readonly<Intent>,digest:string|null):LaneIntentAuthority|null{
 try{const kind=L.laneKind(i.purpose,i.desired),clock=L.laneClock(cap,now());
  if(i.guild_id!==cap.guild||i.native_profile!=='ten-rank'||typeof i.native_guid!=='string'||!i.native_guid||!Number.isSafeInteger(i.roster_id)||typeof i.native_rank_name!=='string'||!Number.isInteger(i.native_rank))return null;
  if(kind.lane==='fresh'){const cfg=cap.cfg;if(!cfg||!clock.fresh||!digest||i.request_digest!==digest)return null;
   const wanted=mappedNativeRole(i.native_rank_name,i.native_rank!,{profile:'ten-rank',roles:cfg.native});
   if(kind.purpose===L.FRESH_MEMBERSHIP?i.role_id!==cfg.membership:!cfg.native.includes(i.role_id)||i.desired!==Number(i.role_id===wanted))return null;
   return Object.freeze({kind,epoch:cfg.epochStart,digest,family:cfg.native});}
  if(!clock.staff||i.request_digest!==null||!cap.managedStaff.includes(i.role_id))return null;
  const wanted=privilegedNativeMap('ten-rank',{ROLE_GUILD_LEADER:cap.staffIds[0]!,ROLE_OFFICER:cap.staffIds[1]!,ROLE_RAID_LEADER:cap.staffIds[2]!}).wanted(i.native_rank_name,i.native_rank!);
  return i.desired===Number(i.role_id===wanted)?Object.freeze({kind,epoch:cap.linksNotBefore,digest:null,family:cap.staffIds}):null;
 }catch{return null;}
}
/** A grant_compensation child of a lane parent, read GET-free from the visit's observation (§13). P1-A: absence is not
 * custody discharge, so present or absent the child and its spent lane parent are only stamped (checked_at, with the :353
 * parent equalities) and stay unknown, fencing the target; the DELETE is never sent again. */
async function closeLaneCompensation(env:Env,childId:string,observed:LaneObservation):Promise<Settlement>{
 const L=await import('./full-release-roles');
 const c=await env.DB.prepare("SELECT * FROM role_settlements WHERE id=?1 AND purpose='grant_compensation' AND desired=0 AND attempts=1").bind(childId).first<Intent>();
 if(!c||c.guild_id!==env.GUILD_ID||laneTwelve(c.role_id)||c.state==='settled')return result('held','compensation_parent_changed',childId);
 if(!laneSpent(c)||c.expires_at>now())return result('unknown','compensation_in_flight',childId);
 const tuple=L.laneTupleBinds(c as LaneTupleRow);
 const out=await env.DB.batch([env.DB.prepare(L.LANE_SPENT_OBSERVED).bind(...L.bindsFor(L.LANE_SPENT_OBSERVED,tuple)),env.DB.prepare(L.LANE_COMPENSATION_PARENT_OBSERVED).bind(...L.bindsFor(L.LANE_COMPENSATION_PARENT_OBSERVED,tuple))]);
 if(!out[0]?.results?.length)return result('held','removal_receipt_changed',childId);
 return result('unknown',observed.member?.roles.includes(c.role_id)?'removal_outcome_not_absent':'compensation_absent_unresolved',childId,now());
}
/** The lane consumer (§9) for fresh_roster_membership, fresh_roster_rank and staff_roster_rank. It mirrors settleRoleIntent
 * :233-320, which stays unchanged: the original-facts witness (:212-232) plus cap.current() around every await, the
 * compensation path (:248), claim, admission, one PUT/DELETE, a fresh member read and the receipt, compensateGrant after
 * a landed grant that lost admission. Order: the twelve refusal, then compensation, then (major 4) a spent reconcileOnly
 * row that fails validation is outcome-read by exact tuple (the :264 escape); full validation stays for M2 and dispatch.
 * M2: a spent PUT present while current settles 'fresh_server_confirmed' with ?14 picked now, never past an unresolved row on
 * its target (the guard's fence). P1-A: otherwise no read closes a spent row: absent or present, an outcome read only stamps
 * it and it stays unknown, the compensation path included (a lane-owned read, never reconcileRemovalReceipt). observed: this visit's read
 * (no extra request when it is a covering inventory read; a desired=1 confirm needs verdict ok, no blocker and, for fresh
 * roles, permissions '0'). opts.pending: the producer's pick in the same visit (a reconcile always picks again).
 */
export async function settleLaneIntent(env:Env,cap:LaneCapture,id:string,reconcileOnly=false,b:AttemptBudget=budget(),observed?:LaneObservation,opts:Readonly<{pending?:number|null}>={}):Promise<Settlement>{
 const removal=originalRemovalDispatch(env);
 const L=await import('./full-release-roles');
 if(!cap||!cap.configured||!TOKEN.test(id)||!ID.test(cap.guild))return result('held','invalid_operation');
 if(!cap.current())return result('held','lane_configuration_changed',id);
 const facts=await env.DB.batch([env.DB.prepare(LANE_INTENT_FACTS).bind(id),env.DB.prepare(LANE_COMPENSATION_FACTS).bind(id)]);
 let original:ReturnType<typeof captureOriginalSettlementFacts>;
 try{original=captureOriginalSettlementFacts(facts,env);}catch(error){if(error instanceof OriginalSettlementFactsHeld)return result('held','original_role_facts_changed',id);throw error;}
 const i=original.intent,compensation=original.compensation;
 if(!i||i.guild_id!==cap.guild||i.guild_id!==env.GUILD_ID||!(L.LANE_GRANT_PURPOSES as readonly string[]).includes(i.purpose))return result('held','operation_not_current',id);
 // A twelve role is never a lane target: refused before any statement, request or reconciliation.
 if(laneTwelve(i.role_id)||!ID.test(i.role_id)||!ID.test(i.subject))return result('held','frozen_configuration_changed',id);
 if(i.state==='settled'||i.state==='held')return result(i.state==='settled'?'settled':'held',i.reason,id,i.checked_at);
 const spent=laneSpent(i);if(i.attempts===1&&i.expires_at>now())return result('unknown','lane_effect_in_flight',id);
 if(!spent&&i.expires_at<=now())return result('held','expired_without_dispatch',id);
 const tuple=L.laneTupleBinds(i as LaneTupleRow),run=(sql:string,values:readonly unknown[])=>env.DB.prepare(sql).bind(...L.bindsFor(sql,values)).first<{id:string}>();
 const check=()=>{original.check();if(!cap.current())throw new LaneConfigurationHeld();};
 const checked=async<T>(perform:()=>Promise<T>):Promise<T>=>{check();const value=await perform();check();return value;};
 const witnessed=async<T>(perform:()=>Promise<T>):Promise<T>=>{original.check();const value=await perform();original.check();return value;};
 const passOn=(error:unknown)=>{if(error instanceof OriginalSettlementFactsHeld||error instanceof LaneConfigurationHeld)throw error;};
 let providerEffectStarted=false,claimNonce:string|null=null;
 const closeNotDispatched=async(reason:string):Promise<Settlement>=>{
  if(!claimNonce||providerEffectStarted)return result(providerEffectStarted?'unknown':'held',reason,id);
  try{const closed=await env.DB.prepare(L.LANE_CLAIM_NOT_DISPATCHED).bind(id,claimNonce).first();
   return result(closed?'held':'unknown',closed?reason:'claimed_not_dispatched_receipt_unknown',id);}
  catch{return result('unknown','claimed_not_dispatched_receipt_unknown',id);}
 };
 try{check();
  if(compensation){if(!reconcileOnly)return result('unknown','explicit_compensation_reconciliation_required',id);
   // P1-A: a lane-owned GET-only read, never reconcileRemovalReceipt (:350-369), whose absent branch settles the child 'absent'
   // and holds the parent: an expired source plus an absent read is not custody discharge.
   let seen=observed;
   if(!seen){if(b.limit-b.attempts<L.FRESH_RECONCILE_MIN_LEFT)return result('held','role_request_budget',id);
    try{seen=await checked(()=>laneQualifyEach(env,b,i.subject,[i.role_id]));}catch(error){passOn(error);return result('held','current_server_unknown',id);}}
   const read:LaneObservation=seen,r=await checked(()=>closeLaneCompensation(env,compensation.id,read));
   return result(r.state,r.reason,id,r.checkedAt);}
  // GET-only outcome read by exact tuple: never a new authority, effect, nonce or deadline.
  const outcomeRead=async():Promise<Settlement>=>{
   let present:boolean;
   if(observed)present=!!observed.member?.roles.includes(i.role_id);
   else{if(b.limit-b.attempts<L.FRESH_RECONCILE_MIN_LEFT)return result('held','role_request_budget',id);
    try{present=!!(await checked(()=>laneQualifyEach(env,b,i.subject,[i.role_id]))).member?.roles.includes(i.role_id);}catch(error){passOn(error);return result('held','current_server_unknown',id);}}
   // P1-A: absent is only stamped; the row stays spent and keeps fencing its target (no past_effect_absent).
   if(!present)return await checked(()=>run(L.LANE_SPENT_OBSERVED,tuple))?result('unknown','spent_absent_unresolved',id,now()):result('held','lane_receipt_changed',id);
   if(L.LANE_OBSERVED_PRESENT_ENABLED&&await checked(()=>run(L.LANE_OBSERVED_PRESENT,tuple)))return result('settled','past_effect_observed_present',id,now());
   await checked(()=>run(L.LANE_SPENT_OBSERVED,tuple));return result('unknown','present_effect_requires_current_authority_or_manual_removal',id,now());
  };
  const v=laneIntentAuthority(L,cap,i,cap.cfg&&cap.raw!==null?await checked(()=>L.laneDigest(cap.raw!)):null);
  if(!v)return reconcileOnly&&spent?await outcomeRead():result('held','frozen_configuration_changed',id);
  const lane=v.kind.lane,sql=L.laneConsumerSql(v.kind);
  let pending:number|null=null;
  if(i.desired===1)pending=!reconcileOnly&&opts.pending!==undefined?opts.pending:(await checked(()=>env.DB.prepare(L.LANE_PICK_ACCEPTED).bind(i.subject,i.native_guid,v.epoch).first<{id:number}>()))?.id??null;
  if(pending!==null&&!Number.isSafeInteger(pending))return result('held','invalid_operation',id);
  const nonce=randomGeneration(),values=L.laneParams({rosterId:i.roster_id!,subject:i.subject,guid:i.native_guid!,rankName:i.native_rank_name!,rank:i.native_rank!,generation:i.subject_generation,
   id,epoch:v.epoch,nonce,role:i.role_id,guild:cap.guild,floor:cap.floor,digest:v.digest,pending,shrink:cap.shrink,family:v.family});
  const q=(text:string)=>env.DB.prepare(text).bind(...L.bindsFor(text,values));
  const current=async()=>!!await checked(()=>q(sql.current).first());
  if(!await current())return reconcileOnly&&spent?await outcomeRead():result('held','lane_intent_stale',id);
  // A reconcile that already observes present !== desired cannot confirm: it stays unknown (:298) without another read.
  if(reconcileOnly&&observed&&!!observed.member?.roles.includes(i.role_id)!==(i.desired===1)){if(spent)await checked(()=>run(L.LANE_SPENT_OBSERVED,tuple));return result('unknown','explicit_reconciliation_required',id,now());}
  const usable=(o:LaneObservation)=>o.kind==='inventory'&&(i.desired===1?o.verdicts.get(i.role_id)==='ok'&&!!o.member&&!o.blocked&&(lane==='staff'||o.cosmetic.get(i.role_id)===true)
   :o.verdicts.get(i.role_id)==='ok'||o.verdicts.get(i.role_id)==='missing');
  let o=observed&&usable(observed)?observed:undefined;
  if(!o){
   if(observed?.kind==='inventory'&&observed.verdicts.has(i.role_id))return result('held','inventory_hierarchy_or_server_hold',id);
   if(b.limit-b.attempts<(reconcileOnly?L.FRESH_RECONCILE_MIN_LEFT:L.FRESH_EFFECT_MIN_LEFT))return result('held','role_request_budget',id);
   try{o=await checked(()=>laneQualifyEach(env,b,i.subject,[i.role_id]));}catch(error){passOn(error);return result('held','inventory_hierarchy_or_server_hold',id);}
   if(!usable(o))return result('held','inventory_hierarchy_or_server_hold',id);
   if(!await current())return result('held','lane_changed_after_lookup',id);
  }else if(!reconcileOnly&&b.limit-b.attempts<L.FRESH_RECONCILE_MIN_LEFT)return result('held','role_request_budget',id);
  const present=!!o.member?.roles.includes(i.role_id);
  if(present===(i.desired===1)){
   // An attempted PUT observed present is no more discharged than an attempted DELETE observed absent.
   if(spent)return await checked(()=>run(L.LANE_SPENT_OBSERVED,tuple))?result('unknown',i.desired===0?'spent_absent_unresolved':'present_effect_requires_current_authority_or_manual_removal',id,now()):result('held','lane_receipt_changed',id);
   const r=await checked(()=>q(sql.confirm).first());
   return r?result('settled','fresh_server_confirmed',id,now()):result('held','lane_changed_before_receipt',id);}
  if(reconcileOnly||i.state!=='pending'||i.attempts!==0||i.expires_at<=now()){if(spent)await checked(()=>run(L.LANE_SPENT_OBSERVED,tuple));return result('unknown','explicit_reconciliation_required',id,now());}
  const clock=L.laneClock(cap,now());if(i.desired===1&&!(lane==='fresh'?clock.grants:clock.staff))return result('held','lane_grants_held',id);
  claimNonce=nonce;
  const claimed=await checked(async()=>{const r=await q(sql.claim).first();if(!r)claimNonce=null;return r;});check();if(!claimed)return result('held','claim_changed',id);
  if(!await checked(()=>q(sql.admit).first()))return await closeNotDispatched('lane_changed_before_effect');
  check();
  try{providerEffectStarted=true;await witnessed(()=>request(env,b,i.desired===1?'PUT':'DELETE',`/guilds/${i.guild_id}/members/${i.subject}/roles/${i.role_id}`));}catch{
   await env.DB.prepare(sql.providerUnknown).bind(id,nonce).run();return result('unknown','provider_outcome_unknown',id);}
  // Even a 204 is not completion until the current server state, the captured configuration and admission agree again.
  try{const after=await witnessed(()=>member(env,b,i.subject)),has=!!after?.roles.includes(i.role_id);
   const capOk=cap.current(),restricted=!!after&&cap.blocking.some(r=>after.roles.includes(r));
   if(i.desired===1&&has&&(!capOk||restricted||!await witnessed(async()=>!!await q(sql.current).first())))return await witnessed(()=>compensateGrant(env,b,i,nonce,false,true,removal));
   if(has!==(i.desired===1)||!capOk)throw Error('changed');
   const r=await witnessed(()=>q(sql.receipt).first());
   if(!r&&i.desired===1&&has)return await witnessed(()=>compensateGrant(env,b,i,nonce,false,true,removal));
   if(!r)throw Error('changed');return result('settled','effect_and_current_server_confirmed',id,now());
  }catch{await env.DB.prepare(sql.confirmationUnknown).bind(id,nonce).run();return result('unknown','confirmation_or_admission_unknown',id);}
 }catch(error){
  if(error instanceof LaneConfigurationHeld)return await closeNotDispatched('lane_configuration_changed');
  if(error instanceof OriginalSettlementFactsHeld)return await closeNotDispatched('original_role_facts_changed');
  if(claimNonce&&!providerEffectStarted)return await closeNotDispatched('claim_or_admission_unknown');
  throw error;}
}
export type LaneSpentOutcome=Readonly<{state:Settlement['state'];reason:string;outcomes:readonly Readonly<{id:string;purpose:string;settlement:Settlement}>[]}>;
/** The spent-row reader (§13) over the visit's observation (laneQualifyEach, or the M1 screen read). Only rows whose claim
 * window has closed are read. Lane removals: present or absent, the row is only stamped (P1-A: an absent read is not custody
 * discharge), stays unknown, keeps fencing its target and is never DELETEd again. A compensation child is stamped with its
 * parent and both stay unknown. Lane grants go to settleLaneIntent(reconcileOnly) for a stamp-only outcome read.
 * GET-free with a covering inventory read; a present PUT observed through a screen qualifies once within b, or holds.
 */
export async function readLaneSpentRows(env:Env,cap:LaneCapture,subject:string,observed:LaneObservation,b:AttemptBudget):Promise<LaneSpentOutcome>{
 const L=await import('./full-release-roles');
 const outcomes:{id:string;purpose:string;settlement:Settlement}[]=[];
 const done=(state:Settlement['state'],reason:string):LaneSpentOutcome=>Object.freeze({state,reason,outcomes:Object.freeze(outcomes.slice())});
 if(!cap||!cap.configured||!cap.current()||!ID.test(cap.guild)||env.GUILD_ID!==cap.guild||!ID.test(subject)||!observed)return done('held','invalid_capture');
 const rows=(await env.DB.prepare(L.LANE_SPENT_ROWS).bind(subject,cap.guild,LANE_SPENT_READ_LIMIT).all<Intent>()).results,seen=new Set<string>();
 for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);
  if(!cap.current())return done('held','lane_configuration_changed');
  let s:Settlement;const tuple=L.laneTupleBinds(row as LaneTupleRow);
  if(laneTwelve(row.role_id)||row.subject!==subject||row.guild_id!==cap.guild)s=result('held','frozen_configuration_changed',row.id);
  else if((L.LANE_REMOVAL_PURPOSES as readonly string[]).includes(row.purpose)){
   // P1-A: the same stamp whether the role is present or absent; the attempted DELETE stays unresolved.
   const stamped=!!await env.DB.prepare(L.LANE_SPENT_OBSERVED).bind(...L.bindsFor(L.LANE_SPENT_OBSERVED,tuple)).first();
   s=!stamped?result('held','removal_receipt_changed',row.id):result('unknown',observed.member?.roles.includes(row.role_id)?'removal_outcome_not_absent':'spent_absent_unresolved',row.id,now());}
  else if(row.purpose==='grant_compensation'){s=await closeLaneCompensation(env,row.id,observed);if(row.request_digest)seen.add(row.request_digest);}
  else{s=await settleLaneIntent(env,cap,row.id,true,b,observed);for(const c of rows)if(c.purpose==='grant_compensation'&&c.request_digest===row.id)seen.add(c.id);}
  outcomes.push({id:row.id,purpose:row.purpose,settlement:s});}
 const states=outcomes.map(o=>o.settlement.state);
 return done(states.includes('unknown')?'unknown':states.includes('held')?'held':'settled',outcomes.length?'spent_rows_read':'no_spent_rows');
}
export type LaneRemovalGroup=Readonly<{purpose:LaneRemovalPurpose;roles:readonly string[]}>;
export type LaneRowOutcome=Readonly<{id:string;purpose:string;role:string;state:Settlement['state'];reason:string}>;
export type LaneRemovalOutcome=Readonly<{state:Settlement['state'];reason:string;rows:readonly LaneRowOutcome[];dispatched:number}>;
/** Lane removal custody (§12). Per group a cause pre-check, then one shared inventory (or the visit's covering one), one
 * batch of disposal plus INSERT (new rows whenever no unsettled row exists, so a settled earlier row never blocks: M1), and
 * per row, membership first, then fresh ranks, then staff: an absent receipt, or claim, final proof and DELETE spaced
 * FRESH_EFFECT_SPACING_MS apart, then one confirming member read. Cause, captured generation and (staff) bot custody are
 * re-evaluated in every statement; a role held by the inventory is not planned; the first failure stops the burst.
 * Fresh roles outside the captured set (a replaced ID) are planned only with fresh grant custody. Blocking removals need the
 * blocker on the shared read and again on a member read right before the claim (:494).
 */
export async function settleLaneRemoval(env:Env,cap:LaneCapture,subject:string,generation:string|null,groups:readonly LaneRemovalGroup[],b:AttemptBudget,
 opts:Readonly<{observed?:LaneObservation;rosterId?:number;spacingMs?:number}>={}):Promise<LaneRemovalOutcome>{
 const L=await import('./full-release-roles');
 const rows:LaneRowOutcome[]=[];let dispatched=0;
 const done=(state:Settlement['state'],reason:string):LaneRemovalOutcome=>Object.freeze({state,reason,rows:Object.freeze(rows.slice()),dispatched});
 if(!cap||!cap.configured||!cap.current()||!ID.test(cap.guild)||env.GUILD_ID!==cap.guild||!ID.test(subject)||!laneGeneration(generation)||!Array.isArray(groups)||groups.length<1||groups.length>L.LANE_REMOVAL_PURPOSES.length)return done('held','invalid_capture');
 const clock=L.laneClock(cap,now()),cfg=cap.cfg,digest=cfg&&cap.raw!==null?await L.laneDigest(cap.raw):null,seen=new Set<string>(),purposes=new Set<string>();
 type Plan={purpose:LaneRemovalPurpose;fresh:boolean;epoch:number;digest:string|null;roles:string[]};const plans:Plan[]=[];
 for(const g of groups){
  const fresh=(L.FRESH_REMOVAL_PURPOSES as readonly string[]).includes(g?.purpose),staff=(L.STAFF_REMOVAL_PURPOSES as readonly string[]).includes(g?.purpose);
  if(!fresh&&!staff||purposes.has(g.purpose)||!Array.isArray(g.roles)||g.roles.length<1||g.roles.length>LANE_ROLE_SET_MAX)return done('held','invalid_capture');purposes.add(g.purpose);
  for(const role of g.roles){if(typeof role!=='string'||!ID.test(role)||laneTwelve(role)||role===cap.guild||seen.has(role)||oldSharedMemberProducerHeld230(env,cap.guild,role))return done('held','frozen_configuration_changed');seen.add(role);}
  if(fresh){if(!clock.fresh||!cfg||!digest)return done('held','lane_closed');
   if((g.purpose===L.FRESH_REMOVAL_RENAME_HOLD||g.purpose===L.FRESH_REMOVAL_BLOCKING_ROLE)&&(g.roles.length!==1||g.roles[0]!==cfg.membership))return done('held','frozen_configuration_changed');
   if(g.purpose===L.FRESH_REMOVAL_BLOCKING_ROLE&&!(Number.isSafeInteger(opts.rosterId)&&opts.rosterId!>0))return done('held','invalid_capture');}
  else if(!clock.staff||g.roles.some((r:string)=>!cap.managedStaff.includes(r)))return done('held','lane_closed');
  plans.push({purpose:g.purpose,fresh,epoch:fresh?cfg!.epochStart:cap.linksNotBefore,digest:fresh?digest:null,roles:g.roles.slice()});}
 const values=(p:Plan,x:Readonly<{id?:string;role?:string;plan?:string;nonce?:string}>={})=>[x.id??null,subject,p.purpose,cap.guild,x.role??null,generation,p.epoch,p.digest,x.plan??null,x.nonce??null,p.purpose===L.FRESH_REMOVAL_BLOCKING_ROLE?opts.rosterId!:null];
 const stmt=(text:string,v:readonly unknown[])=>env.DB.prepare(text).bind(...L.bindsFor(text,v));
 const historical=plans.filter(p=>p.fresh).flatMap(p=>p.roles).filter(r=>!cap.freshIds.includes(r));
 if(historical.length){const custody=new Set((await env.DB.prepare(`SELECT value AS role FROM json_each(?3) WHERE ${L.freshHeldGrantSql('?1','?2','value')}`).bind(subject,cap.guild,JSON.stringify(historical)).all<{role:string}>()).results.map(r=>r.role));
  for(const p of plans)if(p.fresh)p.roles=p.roles.filter(r=>cap.freshIds.includes(r)||custody.has(r));}
 const candidates=plans.filter(p=>p.roles.length);if(!candidates.length)return done('held','removal_not_owned');
 const causes=await env.DB.batch(candidates.map(p=>stmt(L.laneRemovalSql(p.purpose).precheck,values(p))));
 const live=candidates.filter((_,k)=>!!causes[k]?.results?.length);if(!live.length)return done('held','removal_cause_withdrawn');
 const all=live.flatMap(p=>p.roles);let observation=opts.observed;
 if(observation&&(observation.kind!=='inventory'||all.some(r=>!observation!.verdicts.has(r))))observation=undefined;
 if(!observation){if(b.limit-b.attempts<L.FRESH_RECONCILE_MIN_LEFT)return done('held','role_request_budget');try{observation=await laneQualifyEach(env,b,subject,all);}catch{return done('held','inventory_hierarchy_or_server_hold');}}
 if(!cap.current())return done('held','lane_configuration_changed');
 const o=observation,present=(r:string)=>!!o.member?.roles.includes(r);
 for(const p of live){if(p.purpose===L.FRESH_REMOVAL_BLOCKING_ROLE&&!o.blocked){for(const r of p.roles)rows.push({id:'',purpose:p.purpose,role:r,state:'held',reason:'removal_cause_withdrawn'});p.roles=[];}
  for(const r of p.roles)if(o.verdicts.get(r)==='held')rows.push({id:'',purpose:p.purpose,role:r,state:'held',reason:'inventory_hierarchy_or_server_hold'});
  p.roles=p.roles.filter(r=>o.verdicts.get(r)!=='held');}
 const planned=live.filter(p=>p.roles.length);if(!planned.length)return done('held',rows[0]?.reason??'removal_cause_withdrawn');
 await env.DB.batch(planned.flatMap(p=>{const t=L.laneRemovalSql(p.purpose),v=values(p,{plan:JSON.stringify(p.roles.map(role=>({id:randomGeneration(),role})))});return [stmt(t.disposal,v),stmt(t.insert,v)];}));
 const found=await env.DB.batch(planned.map(p=>env.DB.prepare(L.laneRemovalSql(p.purpose).rows).bind(subject,p.purpose,cap.guild,generation,JSON.stringify(p.roles))));
 const order=(p:Plan,role:string)=>!p.fresh?2:role===cfg?.membership?0:1;
 const queue=planned.flatMap((p,k)=>((found[k]?.results??[]) as {id:string;role_id:string}[]).filter(r=>p.roles.includes(r.role_id)).map(r=>({p,id:r.id,role:r.role_id}))).sort((x,y)=>order(x.p,x.role)-order(y.p,y.role));
 for(const p of planned)for(const r of p.roles)if(!queue.some(x=>x.p===p&&x.role===r))rows.push({id:'',purpose:p.purpose,role:r,state:'held',reason:'removal_intent_held'});
 const sent:{p:Plan;id:string;role:string;nonce:string}[]=[];let stopped='';
 for(const x of queue){
  if(!present(x.role)){const ok=await stmt(L.laneRemovalSql(x.p.purpose).absent,values(x.p,{id:x.id,role:x.role})).first();rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:ok?'settled':'held',reason:ok?'absent':'removal_cause_withdrawn'});continue;}
  // Spacing from the previous DELETE comes before the claim, so claim, final proof and DELETE stay adjacent (:496-500).
  if(sent.length&&!stopped)await new Promise(resolve=>setTimeout(resolve,opts.spacingMs??L.FRESH_EFFECT_SPACING_MS));
  const blocking=x.p.purpose===L.FRESH_REMOVAL_BLOCKING_ROLE;
  if(!stopped&&b.limit-b.attempts<L.FRESH_CLAIM_MIN_LEFT+(blocking?1:0))stopped='role_request_budget';if(!stopped&&!cap.current())stopped='lane_configuration_changed';
  if(stopped){rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:'held',reason:stopped});continue;}
  if(blocking){let again:Member|null;try{again=await member(env,b,subject);}catch{rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:'held',reason:'current_server_unknown'});continue;}
   if(!again||!again.roles.includes(x.role)||!cap.blocking.some(r=>again!.roles.includes(r))){rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:'held',reason:'removal_cause_withdrawn'});continue;}}
  const nonce=randomGeneration(),t=L.laneRemovalSql(x.p.purpose),v=values(x.p,{id:x.id,role:x.role,nonce});
  let possiblyClaimed=true,ready=false;
  const closeNotDispatched=async()=>{
   let closed=false;try{closed=!!await env.DB.prepare(L.LANE_CLAIM_NOT_DISPATCHED).bind(x.id,nonce).first();}catch{/* keep the exact claim uncertain */}
   rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:closed?'held':'unknown',reason:closed?'claimed_not_dispatched':'claimed_not_dispatched_receipt_unknown'});
   if(!closed)stopped='claimed_not_dispatched_receipt_unknown';
  };
  try{if(!await stmt(t.claim,v).first()){possiblyClaimed=false;rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:'held',reason:'removal_cause_withdrawn'});continue;}
   ready=cap.current()&&!!await stmt(t.proof,v).first()&&cap.current();
  }catch{if(possiblyClaimed)await closeNotDispatched();continue;}
  if(!ready){await closeNotDispatched();continue;}
  try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${subject}/roles/${x.role}`);sent.push({...x,nonce});}catch{
   await stmt(t.failure,v).run();rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:'unknown',reason:'provider_or_confirmation_unknown'});stopped='provider_or_confirmation_unknown';}}
 dispatched=sent.length;
 if(sent.length){let after:Member|null|undefined;try{after=await member(env,b,subject);}catch{after=undefined;}
  for(const x of sent){const t=L.laneRemovalSql(x.p.purpose),v=values(x.p,{id:x.id,role:x.role,nonce:x.nonce});
   const ok=after!==undefined&&!after?.roles.includes(x.role)&&!!await stmt(t.receipt,v).first();if(!ok)await stmt(t.failure,v).run();
   rows.push({id:x.id,purpose:x.p.purpose,role:x.role,state:ok?'settled':'unknown',reason:ok?'removed':'provider_or_confirmation_unknown'});}}
 const states=rows.map(r=>r.state);
 return done(states.includes('unknown')?'unknown':states.includes('held')?'held':'settled',stopped||(sent.length?'removed':'absent'));
}
export type LaneQueueResult=Readonly<{state:'queued'|'nothing'|'link_missing'|'blocked'|'not_member'|'held';reason:string;ids:readonly string[];pending:number|null;guid:string|null}>;
type LanePlanItem={id:string;role:string;desired:number;purpose:string};
const laneQueued=(state:LaneQueueResult['state'],reason:string,ids:readonly string[]=[],pending:number|null=null,guid:string|null=null):LaneQueueResult=>Object.freeze({state,reason,ids:Object.freeze(ids.slice()),pending,guid});
/** The planned unwanted rank or staff roles the captured snapshot may remove (major 3). Binds: laneParams, then ?17 roles. */
const laneAuthorizedSql=(L:LaneModule,lane:'fresh'|'staff')=>`SELECT value AS role FROM json_each(?17) WHERE ${L.rankRemovalAuthoritySql(lane,'?2','?11','?1','value','?8')}`;
/** Exact-tuple adoption (the :123-125 form): each plan item matches exactly one row. Plans list removals first; a removal
 * that did not land also drops the rank or staff replacement grant (rank-replacement dependency). Membership stays independent. */
function laneAdopt(L:LaneModule,plan:readonly LanePlanItem[],found:readonly {id:string;role_id:string;desired:number;purpose:string}[],pending:number|null,guid:string):LaneQueueResult{
 const ids:string[]=[];let missing=0,removalMissing=false;
 for(const x of plan){const m=found.filter(f=>f.role_id===x.role&&f.desired===x.desired&&f.purpose===x.purpose);
  if(m.length!==1||x.desired===1&&x.purpose!==L.FRESH_MEMBERSHIP&&removalMissing){missing++;if(x.desired===0)removalMissing=true;continue;}ids.push(m[0]!.id);}
 return laneQueued(ids.length?'queued':'held',missing?'lane_currentness_changed':'queued',ids,pending,guid);
}
/** Fresh producer (§16). The highest-ranked linked member character on the captured snapshot (PRIMARY_PICK) and its newest
 * acknowledged consumption (LANE_PICK_ACCEPTED). The plan follows the visit's read: membership unless present with a settled
 * lane grant, the wanted rank likewise, desired=0 for every other present fresh rank the snapshot may remove (major 3). A
 * present role without a settled grant (MEE6's stale copy, a hand grant) is planned too: the consumer confirms it with no
 * request (attempts 0), so grant debt counts it satisfied instead of re-selecting the subject every wrap, and it becomes fresh
 * custody (a leave or ban removes every fresh role). An unwanted rank without removal authority also drops the replacement
 * grant, so a member never holds two fresh ranks: the visit is grant-only. Returned ids: removals, then membership, then
 * rank. The caller has checked the snapshot is 'ten-rank'.
 */
export async function queueFreshRosterRoles(env:Env,cap:LaneCapture,subject:string,snapshotId:number,generation:string|null,observed:LaneObservation):Promise<LaneQueueResult>{
 const L=await import('./full-release-roles');
 const cfg=cap?.cfg;
 if(cfg&&[cfg.membership,...cfg.native].some(role=>oldSharedMemberProducerHeld230(env,cap.guild,role)))return laneQueued('held','shared_member230_old_producer_held');
 if(!cfg||cap.raw===null||!L.laneClock(cap,now()).grants||!cap.current()||!ID.test(cap.guild)||env.GUILD_ID!==cap.guild||!ID.test(subject)||!Number.isSafeInteger(snapshotId)||snapshotId<1||!laneGeneration(generation)||!observed)return laneQueued('held','invalid_capture');
 if(!observed.member)return laneQueued('not_member','not_member');if(observed.blocked)return laneQueued('blocked','server_restriction');
 const D=await L.laneDigest(cap.raw);
 const pick=await env.DB.prepare(L.primaryPickSql('fresh')).bind(snapshotId,subject,generation,cfg.epochStart,D).first<{guid:string;rank:string;rank_index:number}>();
 if(!pick)return laneQueued('link_missing','link_missing');
 let wanted:string;try{wanted=mappedNativeRole(pick.rank,pick.rank_index,{profile:'ten-rank',roles:cfg.native});}catch{return laneQueued('held','native_profile_name_index_mismatch');}
 const pending=(await env.DB.prepare(L.LANE_PICK_ACCEPTED).bind(subject,pick.guid,cfg.epochStart).first<{id:number}>())?.id??null;
 const roles=observed.member.roles,inventory=observed.kind==='inventory';
 const grantable=(r:string)=>!inventory||!observed.verdicts.has(r)||observed.verdicts.get(r)==='ok'&&observed.cosmetic.get(r)===true;
 const removable=(r:string)=>!inventory||!observed.verdicts.has(r)||observed.verdicts.get(r)==='ok';
 const values=L.laneParams({rosterId:snapshotId,subject,guid:pick.guid,rankName:pick.rank,rank:pick.rank_index,generation,id:'',epoch:cfg.epochStart,nonce:null,role:'',guild:cap.guild,floor:cap.floor,digest:D,pending,shrink:cap.shrink,family:cfg.native});
 const unwanted=cfg.native.filter(r=>r!==wanted&&roles.includes(r)),authorized=new Set<string>();
 if(unwanted.length){const t=laneAuthorizedSql(L,'fresh');for(const r of (await env.DB.prepare(t).bind(...L.bindsFor(t,[...values,JSON.stringify(unwanted)])).all<{role:string}>()).results)authorized.add(r.role);}
 const plan:LanePlanItem[]=unwanted.filter(r=>authorized.has(r)&&removable(r)).map(role=>({id:randomGeneration(),role,desired:0,purpose:L.FRESH_RANK}));
 const grantOnly=unwanted.some(r=>!authorized.has(r)||!removable(r));
 const shown=[cfg.membership,...(grantOnly?[]:[wanted])].filter(r=>roles.includes(r)&&grantable(r)),settled=new Set<string>();
 if(shown.length)for(const r of (await env.DB.prepare(L.FRESH_SETTLED_ROLES).bind(subject,cap.guild,JSON.stringify(shown)).all<{role:string}>()).results)settled.add(r.role);
 if(grantable(cfg.membership)&&!settled.has(cfg.membership))plan.push({id:randomGeneration(),role:cfg.membership,desired:1,purpose:L.FRESH_MEMBERSHIP});
 if(!grantOnly&&grantable(wanted)&&!settled.has(wanted))plan.push({id:randomGeneration(),role:wanted,desired:1,purpose:L.FRESH_RANK});
 if(!plan.length)return laneQueued('nothing',grantOnly?'rank_removal_authority_missing':'nothing_to_queue',[],pending,pick.guid);
 const s=L.laneProducerSql('fresh'),v=[...values,JSON.stringify(plan),cfg.membership];
 if(!cap.current())return laneQueued('held','lane_configuration_changed');
 await env.DB.batch([env.DB.prepare(s.disposal).bind(...L.bindsFor(s.disposal,v)),env.DB.prepare(s.insert).bind(...L.bindsFor(s.insert,v))]);
 return laneAdopt(L,plan,(await env.DB.prepare(s.adoption).bind(...L.bindsFor(s.adoption,v)).all<{id:string;role_id:string;desired:number;purpose:string}>()).results,pending,pick.guid);
}
/** Staff producer (§16, Part B). The wanted role is that of the lowest staff-mapped verified character (the PRIMARY_PICK set);
 * the top staff-mapped listed character's role (linked or not) is never removed. desired=1 for the wanted role whether present
 * or not (a present role confirms without a request and retires the subject); desired=0 for every other managed role in bot
 * custody that the snapshot may remove (major 3), present or not (absent ones close through settleStaffRankAbsences). A
 * custody role without that authority drops the replacement grant. Rows carry the pick's facts, else LANE_LISTED_TOP's.
 */
export async function queueStaffRankRoles(env:Env,cap:LaneCapture,subject:string,snapshotId:number,generation:string|null,observed:LaneObservation):Promise<LaneQueueResult>{
 const L=await import('./full-release-roles');
 if(!cap||!L.laneClock(cap,now()).staff||!cap.current()||!ID.test(cap.guild)||env.GUILD_ID!==cap.guild||!ID.test(subject)||!Number.isSafeInteger(snapshotId)||snapshotId<1||!laneGeneration(generation)||!observed)return laneQueued('held','invalid_capture');
 if(!observed.member)return laneQueued('not_member','not_member');
 const map=L.laneStaffMapJson(cap),managed=L.laneManagedJson(cap);
 const facts=await env.DB.batch([env.DB.prepare(L.primaryPickSql('staff')).bind(snapshotId,subject,generation,cap.linksNotBefore,map),env.DB.prepare(L.STAFF_WANTED_ANY).bind(snapshotId,subject,map),
  env.DB.prepare(L.staffCustodyRolesSql(false)).bind(subject,cap.guild,managed),env.DB.prepare(L.LANE_LISTED_TOP).bind(snapshotId,subject)]);
 const pick=facts[0]?.results?.[0] as {guid:string;rank:string;rank_index:number;role:string}|undefined,any=facts[1]?.results?.[0] as {role:string}|undefined;
 const custody=((facts[2]?.results??[]) as {role_id:string}[]).map(r=>r.role_id),top=pick??facts[3]?.results?.[0] as {guid:string;rank:string;rank_index:number}|undefined;
 if(!top)return laneQueued('link_missing','link_missing');if(pick&&!cap.managedStaff.includes(pick.role))return laneQueued('held','staff_role_configuration');
 const pending=pick?(await env.DB.prepare(L.LANE_PICK_ACCEPTED).bind(subject,pick.guid,cap.linksNotBefore).first<{id:number}>())?.id??null:null;
 const roles=observed.member.roles,inventory=observed.kind==='inventory';
 const ok=(r:string)=>!inventory||!observed.verdicts.has(r)||observed.verdicts.get(r)==='ok';
 const values=L.laneParams({rosterId:snapshotId,subject,guid:top.guid,rankName:top.rank,rank:top.rank_index,generation,id:'',epoch:cap.linksNotBefore,nonce:null,role:'',guild:cap.guild,floor:cap.floor,digest:null,pending,shrink:cap.shrink,family:cap.staffIds});
 const candidates=custody.filter(r=>r!==pick?.role&&r!==any?.role),authorized=new Set<string>();
 if(candidates.length){const t=laneAuthorizedSql(L,'staff');for(const r of (await env.DB.prepare(t).bind(...L.bindsFor(t,[...values,JSON.stringify(candidates)])).all<{role:string}>()).results)authorized.add(r.role);}
 const plan:LanePlanItem[]=candidates.filter(r=>authorized.has(r)&&(!roles.includes(r)||ok(r))).map(role=>({id:randomGeneration(),role,desired:0,purpose:L.STAFF_RANK}));
 const grantOnly=candidates.some(r=>!authorized.has(r)||roles.includes(r)&&!ok(r));
 if(pick&&!grantOnly&&!observed.blocked&&ok(pick.role))plan.push({id:randomGeneration(),role:pick.role,desired:1,purpose:L.STAFF_RANK});
 if(!plan.length)return laneQueued(pick?'nothing':'link_missing',grantOnly?'rank_removal_authority_missing':pick?'nothing_to_queue':'link_missing',[],pending,top.guid);
 if(plan.some(row=>oldSharedMemberProducerHeld230(env,cap.guild,row.role)))return laneQueued('held','shared_member230_old_producer_held');
 const s=L.laneProducerSql('staff'),v=[...values,JSON.stringify(plan),managed];
 if(!cap.current())return laneQueued('held','lane_configuration_changed');
 await env.DB.batch([env.DB.prepare(s.disposal).bind(...L.bindsFor(s.disposal,v)),env.DB.prepare(s.insert).bind(...L.bindsFor(s.insert,v))]);
 return laneAdopt(L,plan,(await env.DB.prepare(s.adoption).bind(...L.bindsFor(s.adoption,v)).all<{id:string;role_id:string;desired:number;purpose:string}>()).results,pending,top.guid);
}
/** settleRosterRankAbsences' lane form (:147-169 untouched): one read of pending desired=0 staff rows on the managed IDs,
 * one observation, one UPDATE that correlates the target fence and bot custody per row (never the first row's binds). */
export async function settleStaffRankAbsences(env:Env,cap:LaneCapture,subject:string,snapshotId:number,generation:string|null,b:AttemptBudget,observed?:LaneObservation){
 const L=await import('./full-release-roles');
 const held=(reason:string)=>({state:'held' as const,reason,closed:0});
 if(!cap||!L.laneClock(cap,now()).staff||!cap.current()||!ID.test(cap.guild)||env.GUILD_ID!==cap.guild||!ID.test(subject)||!Number.isSafeInteger(snapshotId)||snapshotId<1||!laneGeneration(generation))return held('invalid_capture');
 const managed=L.laneManagedJson(cap),rows=(await env.DB.prepare(L.STAFF_ABSENCE_ROWS).bind(subject,snapshotId,generation,cap.guild,managed).all<Intent>()).results;
 if(!rows.length)return {state:'settled' as const,reason:'no_pending_removals',closed:0};
 const first=rows[0]!,same=rows.filter(i=>i.native_guid===first.native_guid&&i.native_rank===first.native_rank&&i.native_rank_name===first.native_rank_name&&!laneTwelve(i.role_id));
 if(!same.length||typeof first.native_guid!=='string'||typeof first.native_rank_name!=='string'||!Number.isInteger(first.native_rank))return held('frozen_configuration_changed');
 let o=observed;if(!o){if(b.limit-b.attempts<L.FRESH_RECONCILE_MIN_LEFT)return held('role_request_budget');try{o=await laneQualifyEach(env,b,subject,same.map(i=>i.role_id));}catch{return held('inventory_hierarchy_or_server_hold');}}
 if(!cap.current())return held('lane_configuration_changed');
 const absent=same.filter(i=>!o!.member?.roles.includes(i.role_id)).map(i=>i.id);if(!absent.length)return {state:'settled' as const,reason:'no_absent_removals',closed:0};
 const v=[...L.laneParams({rosterId:snapshotId,subject,guid:first.native_guid,rankName:first.native_rank_name,rank:first.native_rank!,generation,id:first.id,epoch:cap.linksNotBefore,nonce:null,role:first.role_id,guild:cap.guild,
  floor:cap.floor,digest:null,pending:null,shrink:cap.shrink,family:cap.staffIds}),JSON.stringify(absent),managed];
 const out=await env.DB.prepare(L.STAFF_ABSENCE_SETTLE).bind(...L.bindsFor(L.STAFF_ABSENCE_SETTLE,v)).all<{id:string}>();
 return out.results.length===absent.length?{state:'settled' as const,reason:'fresh_server_absence_batch',closed:out.results.length}:{state:'held' as const,reason:'roster_or_generation_changed_after_lookup',closed:out.results.length};
}
/** The backoff marker (§13) on a never-dispatched lane row the consumer held for inventory, hierarchy or a server hold. */
export async function markLaneQualifyHeld(env:Env,cap:LaneCapture,id:string):Promise<boolean>{
 const L=await import('./full-release-roles');
 if(!cap||!cap.configured||!TOKEN.test(id)||!ID.test(cap.guild)||!cap.current())return false;
 const i=await env.DB.prepare('SELECT * FROM role_settlements WHERE id=?1 AND guild_id=?2').bind(id,cap.guild).first<Intent>();
 if(!i||laneTwelve(i.role_id)||i.state!=='pending'||i.attempts!==0)return false;
 return !!await env.DB.prepare(L.LANE_MARK_QUALIFY_HELD).bind(...L.bindsFor(L.LANE_MARK_QUALIFY_HELD,L.laneTupleBinds(i as LaneTupleRow))).first();
}

/** Treasury uses its own attended receipt/actor/target proof. It cannot enter
 * the verification/roster writer by relabeling a proof or enabling rank flags. */
export async function inspectTreasuryCosmeticRoles(env:Env,authority:import('./treasury-cosmetic').TreasuryAuthority,b:AttemptBudget={limit:8,attempts:0,retries:0}):Promise<readonly string[]>{
 const T=await import('./treasury-cosmetic'),a=T.treasuryAuthorityFacts(env,authority);
 const current=()=>T.treasuryAuthorityCurrent(env,authority);
 const get=async(path:string)=>{a.check();const value=await request<unknown>(env,b,'GET',path,current);a.check();if(!await current())throw Error('treasury_facts_changed');return value;};
 const me=await get('/users/@me');if(!me||typeof me!=='object'||(me as {id?:unknown}).id!==a.config.applicationId||(me as {bot?:unknown}).bot!==true)throw Error('treasury_bot_identity');
 const roles=await get(`/guilds/${a.config.guildId}/roles`),channels=await get(`/guilds/${a.config.guildId}/channels`),bot=await get(`/guilds/${a.config.guildId}/members/${a.config.applicationId}`),guild=await get(`/guilds/${a.config.guildId}`),target=await get(`/guilds/${a.config.guildId}/members/${a.target.id}`);
 const held=T.validateTreasuryInventory(a.config,roles,channels,bot,target,guild);
 if((target as {user?:{id?:unknown}})?.user?.id!==a.target.id||!T.treasuryHasOlympusMembershipRole(env,held)||(env.BLOCKING_ROLE_IDS??'').split(',').some(id=>id.trim()&&held.includes(id.trim())))throw Error('treasury_target_restricted');
 return held;
}
export async function settleTreasuryCosmeticRole(env:Env,authority:import('./treasury-cosmetic').TreasuryAuthority):Promise<Settlement>{
 const T=await import('./treasury-cosmetic'),a=T.treasuryAuthorityFacts(env,authority),id=a.operationId;
 if(oldSharedMemberProducerHeld230(env,a.config.guildId,a.roleId))return result('held','shared_member230_old_producer_held',id);
 if(!id||!TOKEN.test(id)||!a.digest||!a.roleId||a.desired===undefined||typeof a.recognitionConsent!=='boolean'||a.recognitionConsent===false&&a.desired!==0)return result('held','treasury_confirmation_required');
 if(a.env.TREASURY_COSMETIC_ENABLED!=='true'||env.PRIVACY_NATIVE_ERASURE_ENABLED!=='true'||env.PRIVACY_ERASURE_ENABLED!=='true')return result('held','treasury_disabled',id);
 const nonce=randomGeneration(),values=[id,a.target.id,a.config.guildId,a.roleId,a.desired,a.target.generation,a.digest];
 // One unknown operation in this cosmetic family blocks replacement operations,
 // including an opposite desired value. A GET is not cancellation of a late PUT.
 const family=`NOT EXISTS(SELECT 1 FROM role_settlements old WHERE old.subject=?2 AND old.guild_id=?3 AND old.id<>?1 AND old.attempts=1 AND old.state IN('dispatching','unknown') AND (old.purpose IN('treasury_cosmetic','treasury_cosmetic_expiry') OR old.role_id=?4))`;
 const exact=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND desired=?5 AND subject_generation IS ?6 AND request_digest=?7 AND purpose='treasury_cosmetic'`;
 const retainedExpiry=a.desired===1?a.config.seasonStartsAt+T.TREASURY_WINDOW_SECONDS:a.expires;
 const audit=T.treasuryAuditValues(env,authority,{version:1,operationId:id,roleId:a.roleId,desired:a.desired,requestDigest:a.digest,recognitionConsent:a.recognitionConsent,recognitionMode:a.recognitionConsent?'recognize':'decline',recognitionConsentAttestedByAdmin:a.recognitionConsent,recognitionDeclinedAttestedByAdmin:!a.recognitionConsent,liveEffectClaimed:false});
 const quote=(s:string)=>`'${s.replace(/'/g,"''")}'`,auditOwned=`EXISTS(SELECT 1 FROM audit WHERE actor=${quote(audit.actor)} AND action='treasury.cosmetic_confirmed' AND subject=?2 AND details=${quote(audit.details)})`;
 // Store the original confirmer before creating this intent in the SAME Native
 // transaction. An existing unattributed operation is never adopted by a later
 // actor; a replay can use only its exact already-recorded original audit.
 a.check();await env.DB.batch([
  env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},${quote(audit.actor)},'treasury.cosmetic_confirmed',?2,${quote(audit.details)} WHERE ${a.sql} AND ${family} AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE id=?1) AND NOT EXISTS(SELECT 1 FROM audit WHERE actor=${quote(audit.actor)} AND action='treasury.cosmetic_confirmed' AND subject=?2 AND details=${quote(audit.details)})`).bind(...values.slice(0,4)),
  env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at) SELECT ?1,?2,'treasury_cosmetic',?3,?4,?5,'pending','attended_preview_confirmed',?6,?7,${DB_NOW},${retainedExpiry} WHERE ${a.sql} AND ${family} AND ${auditOwned} ON CONFLICT(id)DO NOTHING`).bind(...values),
  env.DB.prepare(`SELECT CASE WHEN NOT(${auditOwned}) OR EXISTS(SELECT 1 FROM role_settlements WHERE ${exact}) THEN 1 ELSE json_extract('treasury_confirm_audit_held','$') END AS intent_with_audit`).bind(...values),
 ]);a.check();
 const read=await env.DB.batch([env.DB.prepare(`SELECT CASE WHEN ${a.sql} THEN 1 ELSE json_extract('treasury_reader_changed','$') END AS ok`),env.DB.prepare(`SELECT state,reason,attempts,checked_at FROM role_settlements WHERE ${exact} AND ${auditOwned}`).bind(...values)]);a.check();
 const stored=read[1]!.results[0] as {state:string;reason:string;attempts:number;checked_at:number|null}|undefined;
 if(!stored)return result('held','treasury_operation_held',id);
 if(stored.attempts===1)return result(stored.state==='settled'?'settled':stored.state==='held'?'held':'unknown',stored.reason,id,stored.checked_at);
 if(stored.state==='settled')return result('settled',stored.reason,id,stored.checked_at);
 if(!await T.treasuryAuthorityCurrent(env,authority))return result('held','treasury_facts_changed',id);
 const b:AttemptBudget={limit:8,attempts:0,retries:0};let held:readonly string[];
 try{held=await inspectTreasuryCosmeticRoles(env,authority,b);}catch{return result('held','treasury_inventory_or_facts_held',id);}
 if(a.desired===1&&Object.values(a.config.roles).some(role=>role!==a.roleId&&held.includes(role)))return result('held','treasury_remove_previous_tier_first',id);
 if(held.includes(a.roleId)===(a.desired===1)){
  const row=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='observed_without_dispatch',checked_at=${DB_NOW} WHERE ${exact} AND attempts=0 AND ${a.sql} AND ${family} RETURNING id`).bind(...values).first();a.check();return row?result('settled','observed_without_dispatch',id,now()):result('held','treasury_facts_changed',id);
 }
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',reason='treasury_dispatching',attempts=1,claim_nonce=?8 WHERE ${exact} AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${a.sql} AND ${family} AND ${auditOwned} RETURNING created_at,expires_at`).bind(...values,nonce).first<{created_at:number;expires_at:number}>();a.check();
 if(!claimed)return result('held','treasury_claim_changed',id);
 const custody=privacyProviderCustodyDatabase(env),owned=`${exact} AND attempts=1 AND claim_nonce=?8 AND created_at=?9 AND expires_at=?10 AND state='dispatching'`,ownedValues=[...values,nonce,claimed.created_at,claimed.expires_at];
 const receipt=async(state:'settled'|'held'|'unknown',reason:string)=>!!await custody.prepare(`UPDATE role_settlements SET state=?11,reason=?12,checked_at=${DB_NOW} WHERE ${owned} RETURNING id`).bind(...ownedValues,state,reason).first();
 // A claim is already a spent no-repeat custody record. A failed final admission
 // does not reopen it or manufacture a replacement operation.
 // These two branches are strictly BEFORE request() is invoked. A successful
 // exact-owned receipt can record known nonapplication without reopening the
 // spent claim. Failure to persist that receipt keeps dispatching/unknown.
 const refuseBeforeDispatch=async()=>{try{if(await receipt('held','treasury_pre_dispatch_refused'))return result('held','treasury_pre_dispatch_refused',id,now());}catch{/* Preserve the original unresolved claim if even its no-send receipt fails. */}return result('unknown','treasury_original_claim_unknown',id);};
 try{if(!await env.DB.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM role_settlements WHERE ${owned}) AND ${a.sql} AND ${family}`).bind(...ownedValues).first())return await refuseBeforeDispatch();a.check();}
 catch{return await refuseBeforeDispatch();}
 let acknowledged=false;
 try{
  a.check();await request(env,b,a.desired===1?'PUT':'DELETE',`/guilds/${a.config.guildId}/members/${a.target.id}/roles/${a.roleId}`,undefined,a.check);acknowledged=true;a.check();
  // A completed HTTP ACK cannot be a late original call. A changed target/actor
  // withholds the page result and requires erasure's later role observation.
  if(!await T.treasuryAuthorityCurrent(env,authority)){await receipt('held','treasury_acknowledged_admission_changed');return result('held','treasury_acknowledged_admission_changed',id);}
  const current=await member(env,b,a.target.id,()=>T.treasuryAuthorityCurrent(env,authority));a.check();
  if(!await T.treasuryAuthorityCurrent(env,authority)||!!current?.roles.includes(a.roleId)!==(a.desired===1)){await receipt('held','treasury_acknowledged_unconfirmed');return result('held','treasury_acknowledged_unconfirmed',id);}
  const settled=await custody.prepare(`UPDATE role_settlements SET state='settled',reason='treasury_effect_acknowledged',checked_at=${DB_NOW} WHERE ${owned} AND ${a.sql} RETURNING id`).bind(...ownedValues).first();a.check();
  return settled?result('settled','treasury_effect_acknowledged',id,now()):result('unknown','treasury_ack_write_unconfirmed',id);
 }catch(error){
  const definiteRefusal=!acknowledged&&error instanceof DiscordError&&[400,401,403,404,405,429].includes(error.status);
  const state=acknowledged||definiteRefusal?'held':'unknown',reason=acknowledged?'treasury_acknowledged_unconfirmed':definiteRefusal?'treasury_provider_definite_refusal':'treasury_provider_outcome_unknown';
  try{await receipt(state,reason);}catch{/* Preserve dispatching as unresolved custody if storage also fails. */}
  return result(state,reason,id);
 }
}

export const TREASURY_EXPIRY_SQL_MAX=64;
export const TREASURY_EXPIRY_HTTP_MAX=8;
/** Ordinary scheduled removal-only slice: one original acknowledged season
 * grant, at most one new DELETE attempt. Missing/false/invalid new-grant config
 * cannot suppress cleanup of already recorded exact custody. No roster or new
 * account is adopted. Unknown effects are never retried or closed by absence. */
export async function expireTreasuryCosmeticRoles(env:Env,limits:{sqlRemaining:number;calls:AttemptBudget}):Promise<Settlement>{
 if(!Number.isSafeInteger(limits.sqlRemaining)||limits.sqlRemaining<TREASURY_EXPIRY_SQL_MAX||limits.calls.limit-limits.calls.attempts<TREASURY_EXPIRY_HTTP_MAX)return result('held','treasury_expiry_budget');
 if(!ID.test(env.GUILD_ID)||!ID.test(env.DISCORD_APP_ID)||!env.DISCORD_BOT_TOKEN)return result('held','treasury_expiry_configuration');
 // TC-03 (owner deferred repair, 2026-10-29): classify current markers without new-grant configuration.
 // Capture absent slots too, before any await, and keep that exact footprint.
 let reserved:ReturnType<typeof captureTreasuryReservedRoles>;
 try{reserved=captureTreasuryReservedRoles(env);}catch{return result('held','treasury_expiry_configuration');}
 const facts=await env.DB.batch([env.DB.prepare(`SELECT r.*,NULL AS beta_window_id FROM role_settlements r WHERE r.purpose='treasury_cosmetic' AND r.guild_id=?1 AND r.desired=1 AND r.attempts=1 AND r.claim_nonce IS NOT NULL AND r.state IN('settled','held') AND r.reason IN('treasury_effect_acknowledged','treasury_acknowledged_admission_changed','treasury_acknowledged_unconfirmed') AND r.expires_at<=${DB_NOW}
 AND NOT EXISTS(SELECT 1 FROM role_settlements x WHERE x.purpose='treasury_cosmetic_expiry' AND x.request_digest=r.id AND (x.attempts=1 OR x.state='settled' OR x.checked_at>${DB_NOW}-3600))
 AND NOT EXISTS(SELECT 1 FROM role_settlements x WHERE x.subject=r.subject AND x.guild_id=r.guild_id AND x.role_id=r.role_id AND x.id<>r.id AND (x.purpose<>'treasury_cosmetic_expiry' OR x.request_digest IS NOT r.id) AND ((x.attempts=1 AND x.state IN('dispatching','unknown')) OR (x.purpose='treasury_cosmetic' AND x.desired=1 AND x.expires_at>r.expires_at)))
 ORDER BY COALESCE((SELECT MAX(x.checked_at) FROM role_settlements x WHERE x.purpose='treasury_cosmetic_expiry' AND x.request_digest=r.id),0),r.expires_at,r.id LIMIT 1`).bind(env.GUILD_ID),env.DB.prepare('SELECT id,reason FROM role_settlements WHERE 0')]);
 const original=captureOriginalSettlementFacts(facts,env),p=original.intent;if(!p)return result('settled','no_expired_treasury_role');
 if(oldSharedMemberProducerHeld230(env,p.guild_id,p.role_id))return result('held','shared_member230_old_producer_held',p.id);
 const sourceSlots=(['DISCORD_APP_ID','DISCORD_BOT_TOKEN','DB'] as const).map(k=>[k,Object.getOwnPropertyDescriptor(env,k)] as const);
 if(sourceSlots.some(([,d])=>!d||!Object.hasOwn(d,'value')))return result('held','treasury_expiry_configuration');
 const check=()=>{original.check();reserved.check();for(const[k,d]of sourceSlots){const live=Object.getOwnPropertyDescriptor(env,k);if(!live||!Object.hasOwn(live,'value')||live.value!==d!.value)throw Error('treasury_expiry_configuration_changed');}};
 const op=(await sha256('treasury-cosmetic-expiry-v1:'+p.id)).slice(0,32);check();
 const parent=`EXISTS(SELECT 1 FROM role_settlements p WHERE p.id=?1 AND p.subject=?2 AND p.guild_id=?3 AND p.role_id=?4 AND p.subject_generation IS ?5 AND p.claim_nonce=?6 AND p.created_at=?7 AND p.expires_at=?8 AND p.purpose='treasury_cosmetic' AND p.desired=1 AND p.attempts=1 AND p.state IN('settled','held') AND p.reason IN('treasury_effect_acknowledged','treasury_acknowledged_admission_changed','treasury_acknowledged_unconfirmed') AND p.expires_at<=${DB_NOW})`;
 const noSuccessor=`NOT EXISTS(SELECT 1 FROM role_settlements x WHERE x.subject=?2 AND x.guild_id=?3 AND x.role_id=?4 AND x.id<>?1 AND x.id<>?9 AND ((x.attempts=1 AND x.state IN('dispatching','unknown')) OR (x.purpose='treasury_cosmetic' AND x.desired=1 AND x.expires_at>?8)))`;
 const v=[p.id,p.subject,p.guild_id,p.role_id,p.subject_generation,p.claim_nonce,p.created_at,p.expires_at,op],guard=`${parent} AND ${noSuccessor}`;
 const current=async()=>{check();const row=await privacyProviderCustodyDatabase(env).prepare(`SELECT 1 WHERE ${guard}`).bind(...v).first();check();return !!row;};
 const custody=privacyProviderCustodyDatabase(env);check();
 await custody.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at) SELECT ?9,?2,'treasury_cosmetic_expiry',?3,?4,0,'pending','season_expired',?5,?1,${DB_NOW},${DB_NOW}+300 WHERE ${guard} ON CONFLICT(id)DO NOTHING`).bind(...v).run();check();
 const pending=await custody.prepare("SELECT state,attempts FROM role_settlements WHERE id=?1 AND purpose='treasury_cosmetic_expiry' AND request_digest=?2").bind(op,p.id).first<{state:string;attempts:number}>();check();if(!pending||pending.state==='settled'||pending.attempts===1)return result(pending?.state==='settled'?'settled':'unknown','treasury_expiry_original_spent',op);
 const b=limits.calls,get=async(path:string)=>{const x=await request<unknown>(env,b,'GET',path,current);check();if(!await current())throw Error('treasury_expiry_custody_changed');return x;};
 let present=false;
 try{
  check();if(reserved.roles.includes(p.role_id))throw Error('treasury_reserved_role');
  const me=await get('/users/@me');if((me as {id?:string;bot?:boolean})?.id!==env.DISCORD_APP_ID||(me as {bot?:boolean})?.bot!==true)throw Error('bot_identity');
  const roles=await get(`/guilds/${p.guild_id}/roles`),channels=await get(`/guilds/${p.guild_id}/channels`),bot=await get(`/guilds/${p.guild_id}/members/${env.DISCORD_APP_ID}`),target=await get(`/guilds/${p.guild_id}/members/${p.subject}`),guild=await get(`/guilds/${p.guild_id}`);
  // The source-owned one-role projection is cleanup custody, never a grant
  // configuration. Reuse complete inventory/overwrite/hierarchy validation.
  const T=await import('./treasury-cosmetic'),historical={raw:'',guildId:p.guild_id,applicationId:env.DISCORD_APP_ID,seasonStartsAt:0,roles:{tithePayer:p.role_id,patron:p.role_id,benefactor:p.role_id}};
  const held=T.validateTreasuryInventory(historical,roles,channels,bot,target,guild);if((target as Member)?.user?.id!==p.subject)throw Error('expiry_target');present=held.includes(p.role_id);
 }catch(error){const reason=error instanceof Error&&['treasury_role_inventory','treasury_member_inventory','treasury_hierarchy','treasury_role_not_cosmetic','treasury_channel_inventory','treasury_channel_access','treasury_reserved_role'].includes(error.message)?'expiry_'+error.message.slice('treasury_'.length):'expiry_qualification_held';await custody.prepare(`UPDATE role_settlements SET checked_at=${DB_NOW},reason=?2 WHERE id=?1 AND purpose='treasury_cosmetic_expiry' AND attempts=0`).bind(op,reason).run();return result('held','treasury_'+reason,op);}
 if(!present){const absent=await custody.prepare(`UPDATE role_settlements SET state='settled',reason='expired_role_observed_absent',checked_at=${DB_NOW} WHERE id=?9 AND attempts=0 AND ${guard} RETURNING id`).bind(...v).first();return absent?result('settled','expired_role_observed_absent',op,now()):result('held','treasury_expiry_custody_changed',op);}
 const nonce=randomGeneration(),child=`id=?9 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND subject_generation IS ?5 AND purpose='treasury_cosmetic_expiry' AND request_digest=?1`,claimed=await custody.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='expiry_dispatching' WHERE ${child} AND attempts=0 AND state='pending' AND ${guard} RETURNING id`).bind(...v,nonce).first();check();
 if(!claimed||!await current())return result('held','treasury_expiry_claim_held',op);
 const owned=`${child} AND attempts=1 AND state='dispatching' AND claim_nonce=?10`;
 try{check();await request(env,b,'DELETE',`/guilds/${p.guild_id}/members/${p.subject}/roles/${p.role_id}`,undefined,check);check();
  const after=await request<Member>(env,b,'GET',`/guilds/${p.guild_id}/members/${p.subject}`);check();if(after?.user?.id!==p.subject||!Array.isArray(after.roles)||after.roles.includes(p.role_id)||!await current())throw Error('expiry_confirmation');
  const closed=await custody.prepare(`UPDATE role_settlements SET state='settled',reason='season_expiry_delete_acknowledged',checked_at=${DB_NOW} WHERE ${owned} AND ${guard} RETURNING id`).bind(...v,nonce).first();return closed?result('settled','season_expiry_delete_acknowledged',op,now()):result('unknown','treasury_expiry_ack_unknown',op);
 }catch{try{await custody.prepare(`UPDATE role_settlements SET state='unknown',reason='season_expiry_outcome_unknown',checked_at=${DB_NOW} WHERE ${owned}`).bind(...v,nonce).run();}catch{/* Never release a spent attempt if even its receipt is uncertain. */}return result('unknown','season_expiry_outcome_unknown',op);}
}

// Build .230: a separate original-native mandate for the one fixed shared role.
// Old QR/beta/roster purposes above do not acquire this authority from their rows.
export const LAUNCH_MEMBERSHIP230_PURPOSES=Object.freeze({grant:'launch_membership230',compensation:'launch_membership_compensation230',removal:'launch_membership_removal230',erasure:'launch_membership_erasure230'} as const);
const launch230RoleOnly=Object.freeze({}); // Module-private selection; never a caller or request boolean.
const native232RoleOnly=Object.freeze({}); // Fixed named-profile targets only; opaque routine mandate remains required.
const canonical233RoleOnly=Object.freeze({}); // Fixed canonical ladder, original source cap and reviewed permission tuple required.
const canonical233MigrationRoleOnly=Object.freeze({}); // Root-only reviewed29 migration; no public route or identity admission.
const native232OriginalDrain=Object.freeze({}); // Only an original successful legacy PUT may finish its owned compensation.
const launch230OriginalCompensation=Object.freeze({}); // Only an already-owned old callback may drain its child.
const launch230Purposes=Object.freeze([...Object.values(LAUNCH_MEMBERSHIP230_PURPOSES),'live_link_membership']);
const consumed230Spent=new WeakSet<object>();
type Launch230Parent=Readonly<{id:string;nonce:string;subject:string;generation:string|null;guild:string;role:string;createdAt:number;expiresAt:number;fingerprint:string;snapshotId:number|null;guid:string;canonical?:boolean;grantPurpose?:string;profile?:string;providerCheck:()=>void}>;
const launch230PurposeSql=launch230Purposes.map(p=>`'${p}'`).join(',');
const launch230KnownReceipt=(a:string)=>`(${a}.state='settled' AND ${a}.attempts=1 AND ${a}.claim_nonce IS NOT NULL AND (
 (${a}.purpose IN('${LAUNCH_MEMBERSHIP230_PURPOSES.grant}','live_link_membership') AND ${a}.desired=1 AND ${a}.reason='launch230_put_acknowledged_and_confirmed') OR
 (${a}.purpose IN('${LAUNCH_MEMBERSHIP230_PURPOSES.compensation}','${LAUNCH_MEMBERSHIP230_PURPOSES.removal}','${LAUNCH_MEMBERSHIP230_PURPOSES.erasure}') AND ${a}.desired=0 AND ${a}.reason='launch230_delete_acknowledged_and_confirmed')))
 OR (${a}.purpose IN(${launch230PurposeSql}) AND ${a}.state='held' AND ${a}.attempts=1 AND ${a}.reason='launch230_never_dispatched' AND ${a}.claim_nonce IS NOT NULL AND ${a}.checked_at>=${a}.created_at)
 OR (${a}.purpose IN('${LAUNCH_MEMBERSHIP230_PURPOSES.grant}','live_link_membership') AND ${a}.desired=1 AND ${a}.attempts=1 AND ${a}.state='held' AND ${a}.reason='launch230_compensated'
  AND EXISTS(SELECT 1 FROM role_settlements child WHERE child.request_digest=${a}.id AND child.subject=${a}.subject AND child.guild_id=${a}.guild_id AND child.role_id=${a}.role_id
   AND child.purpose='${LAUNCH_MEMBERSHIP230_PURPOSES.compensation}' AND child.desired=0 AND child.attempts=1 AND child.state='settled' AND child.reason='launch230_delete_acknowledged_and_confirmed'))`;
function launch230Blocker(env:Env,target:Member|null):boolean{return !!target&&(env.BLOCKING_ROLE_IDS??'').split(',').some(id=>id.trim()&&target.roles.includes(id.trim()));}
function launch230Member(target:Member|null,subject:string):boolean{return target===null||target.user?.id===subject&&Array.isArray(target.roles)&&target.roles.every(id=>ID.test(id));}
/** Retain the exact provider result graph, rather than keeping a caller-supplied blocking boolean. */
function launch230MemberWitness(target:Member|null,subject:string):()=>void{
 if(!launch230Member(target,subject))throw Error('launch230_member');return launch230GraphWitness(target);
}
function launch230GraphWitness(input:unknown):()=>void{
 const witnesses:(()=>void)[]=[],seen=new Set<object>();
 const visit=(value:unknown)=>{if(!value||typeof value!=='object'||seen.has(value as object))return;const o=value as object;seen.add(o);const proto=Object.getPrototypeOf(o),keys=Reflect.ownKeys(o),slots=keys.map(k=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))throw Error('launch230_member');return d;});
  witnesses.push(()=>{if(Object.getPrototypeOf(o)!==proto||Reflect.ownKeys(o).length!==keys.length||Reflect.ownKeys(o).some((k,i)=>k!==keys[i]))throw Error('launch230_original_graph_changed');for(let i=0;i<keys.length;i++){const d=Object.getOwnPropertyDescriptor(o,keys[i]!);if(!d||!['value','writable','enumerable','configurable'].every(k=>Object.is(d[k as keyof PropertyDescriptor],slots[i]![k as keyof PropertyDescriptor])))throw Error('launch230_original_graph_changed');}});for(const d of slots)visit(d.value);};visit(input);
 return ()=>{for(const check of witnesses)check();};
}
function launch230ProviderWitness(env:Env):()=>void{
 const proto=Object.getPrototypeOf(env),keys=['DB','DISCORD_APP_ID','DISCORD_BOT_TOKEN','GUILD_ID','ROLE_GUILD_MEMBER','BLOCKING_ROLE_IDS'] as const;
 const slots=keys.map(key=>Object.getOwnPropertyDescriptor(env,key));
 const check=()=>{if(Object.getPrototypeOf(env)!==proto)throw Error('launch230_provider_configuration');for(let n=0;n<keys.length;n++){
  const a=slots[n],b=Object.getOwnPropertyDescriptor(env,keys[n]!);
  if(a===undefined?!!b||keys[n]! in env:!Object.hasOwn(a,'value')||!b||!Object.hasOwn(b,'value')||['value','writable','enumerable','configurable'].some(k=>!Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor])))throw Error('launch230_provider_configuration');
 }};check();return check;
}
/** The exact source-owned legacy ACK has six authored AND-only lines. Group
 * those lines without changing, omitting or reordering any condition. The old
 * predicate/seal bytes stay untouched; deeper .233 callers stay below D1's100
 * expression depth. This does not accept request SQL or learn a new receipt. */
function groupLegacyAck233(sql:string):string{
 const lines=sql.split('\n').map(line=>line.trim());
 if(lines.length!==6||!lines[0]!.startsWith("old.purpose='beta_guard_grant'")||lines.slice(1).some(line=>!line.startsWith('AND ')))throw Error('canonical233_legacy_source_shape');
 // Its old outer caller fixed the physical target to shared Member. Preserve
 // that boundary when the new callers inspect an entire rank family.
 return `(old.guild_id='${BETA_RESET_GUILD_ID}' AND old.role_id='${SHARED_MEMBER232}' AND (`+lines.map((line,index)=>'('+(index?line.slice(4):line)+')').join(' AND ')+'))';
}
async function launch230NativeIntent(env:Env,statement:D1PreparedStatement,check:()=>void,write=true){
 check();const facts=await env.DB.batch([statement,env.DB.prepare('SELECT id,reason FROM role_settlements WHERE 0')]);check();
 const graph=launch230GraphWitness(facts),original=captureOriginalSettlementFacts(facts,env);graph();original.check();
 if(facts[0]?.success!==true||facts[1]?.success!==true||facts[0].results.length>1||facts[1].results.length!==0||write&&original.intent&&facts[0].meta.changes!==1)throw Error('launch230_original_native_ack');
 return Object.freeze({...original,check:()=>{graph();original.check();}});
}
/** No purpose/subject supplied by a request is sufficient to create a grant. */
export async function queueAndSettleLaunchMembership230(env:Env,cap:OriginalConsumedMembership230,venue:RuntimeVenue230,b:AttemptBudget=budget()):Promise<Settlement>{
 return launch230Lane(env,cap,venue,b,null);
}
/** Live Link membership: the same lane for a Link-sourced original consumption (live-link-membership.ts). It derives no
 * rank (identity only, OQ-4), keeps the 230 reasons so every 230 observer reads its rows, and never uses the roster predicate. */
export async function queueAndSettleLiveLinkMembership(env:Env,cap:OriginalLiveLinkConsumption,venue:RuntimeVenue230,b:AttemptBudget=budget()):Promise<Settlement>{
 const L=await import('./live-link-membership');
 return launch230Lane(env,cap,venue,b,Object.freeze({purpose:L.LIVE_LINK_PURPOSE,profile:L.LIVE_LINK_PROFILE,assertConsumed230Original:L.assertLiveLinkOriginal,consumed230Facts:L.liveLinkFacts,consumed230Predicate:L.liveLinkPredicate}));
}
type Launch230Live=Readonly<{purpose:string;profile:string;assertConsumed230Original:(env:Env,cap:never)=>void;consumed230Facts:(cap:never)=>{subject:string;subjectGeneration:string|null;fingerprint:string;deadline:number;source:{snapshotId:number|null;guid:string}};consumed230Predicate:(env:Env,cap:never,start:number)=>Readonly<{sql:string;values:readonly (string|number|null)[];next:number}>}>;
async function launch230Lane(env:Env,cap:object,venue:RuntimeVenue230,b:AttemptBudget,live:Launch230Live|null):Promise<Settlement>{
 let id:string|null=null,parent:Launch230Parent|null=null,effectStarted=false,putAcknowledged=false;
 try{
  const canonical=captureCanonicalRankConfig233(env),entitlements=captureCanonicalEntitlements233(env);
  if(canonical.present&&canonical.mode!=='enabled')return result('held','canonical233_configuration_held');
  if(canonical.present&&entitlements.mode==='held')return result('held','canonical233_entitlement_configuration_held');
  assertRuntimeVenue230(env,venue);
  if(!cap||typeof cap!=='object'||consumed230Spent.has(cap))return result('held','launch230_original_consumption_required');
  const providerCheck=launch230ProviderWitness(env);
  consumed230Spent.add(cap); // Spend before even loading the issuer; a parallel call cannot acquire another turn.
  // The issuer stays private to ingest. Loading its readonly observers does not mint authority.
  const issuer:any=live??await import('./ingest');issuer.assertConsumed230Original(env,cap);
  const derive=canonical.present&&!live,rosterEq=live?'roster_id IS ?7':'roster_id=?7';
  const f=issuer.consumed230Facts(cap),v=runtimeVenue230Facts(venue);
  let role:string=v.roleId,nativeRank:number|null=null,nativeName:string|null=null,sourceRankGuard='1=1',sourceIdentityGuard='1=1',rankGraph=()=>{};
  if(derive){
   if(!canonical.policy||!canonical.current())return result('held','canonical233_configuration_held');
   const native=await env.DB.prepare('SELECT rank,rank_index FROM roster_members WHERE snapshot_id=?1 AND name_key=?2 AND guid=?3').bind(f.source.snapshotId,f.source.nameKey,f.source.guid).first<{rank:string;rank_index:number}>();
   issuer.assertConsumed230Original(env,cap);rankGraph=launch230GraphWitness(native);rankGraph();
   const target=native&&canonicalNativeRole233(canonical.policy,native.rank_index,native.rank);if(!target)return result('held','canonical233_native_profile_held');
   role=target.roleId;nativeRank=native!.rank_index;nativeName=native!.rank;
   // The new whisper proves this identity only. A higher current linked alt is
   // resolved by the full original routine issuer, never downgraded here.
   sourceIdentityGuard=`EXISTS(SELECT 1 FROM roster_members cr WHERE cr.snapshot_id=?7 AND cr.guid=?8 AND cr.rank_index=${nativeRank} AND cr.rank='${nativeName.replace(/'/g,"''")}')`;
   sourceRankGuard=`${sourceIdentityGuard} AND NOT EXISTS(SELECT 1 FROM characters cc JOIN roster_members cr ON cr.guid=cc.guid AND cr.name_key=cc.name_key WHERE cc.discord_id=?2 AND cc.status='member' AND cr.snapshot_id=?7 AND cr.rank_index<${nativeRank})`;
  }
  const grantPurpose=derive?'canonical_consumed233':live?live.purpose:LAUNCH_MEMBERSHIP230_PURPOSES.grant,profile=derive?CANONICAL_PROFILE233:live?live.profile:'prime-native-230',roleAdmission=derive?canonical233RoleOnly:launch230RoleOnly;
  let queueCheck=()=>{},claimCheck=()=>{};
  const check=()=>{providerCheck();assertRuntimeVenue230(env,venue);issuer.assertConsumed230Original(env,cap);if(!canonical.current()||!entitlements.current())throw Error('canonical233_configuration_changed');rankGraph();queueCheck();claimCheck();};check();
  if(!ID.test(f.subject)||f.subjectGeneration!==null&&!TOKEN.test(f.subjectGeneration)||!/^[0-9a-f]{64}$/.test(f.fingerprint)
   ||!Number.isSafeInteger(f.deadline)||f.deadline<=now())return result('held','launch230_original_consumption_expired');
  id=randomGeneration();
  const values:(string|number|null)[]=[id,f.subject,v.guildId,role,f.subjectGeneration,f.fingerprint,f.source.snapshotId,f.source.guid,f.deadline];
  const p=issuer.consumed230Predicate(env,cap,values.length+1);values.push(...p.values);
  const venueGuard=runtimeVenue230Predicate(env,venue,values.length+1);values.push(...venueGuard.values);
  const legacySource=(await import('./privacy-shared-member-cutover230')).sharedMember230LegacyAckSql('old'),legacy=canonical.present?groupLegacyAck233(legacySource):legacySource;check();
  const clear=`NOT EXISTS(SELECT 1 FROM role_settlements old WHERE old.subject=?2 AND old.guild_id=?3 AND ${canonical.present?`(old.role_id IN(${CANONICAL_MIGRATION_ROLE_IDS233.map(r=>"'"+r+"'").join(',')}) OR old.native_profile='${NATIVE_RANK_PROFILE232}')`:'old.role_id=?4'} AND old.id<>?1 AND (
   ${canonical.present?"old.state IN('dispatching','unknown') OR ":''}(old.attempts${canonical.present?'<>0':'=1'} AND NOT(CASE WHEN (${launch230KnownReceipt('old')}) OR (${native232KnownReceipt('old')}) OR ${canonical.present?`(${canonical233KnownReceipt('old')}) OR (${canonical233MigrationKnownReceipt('old')}) OR `:''}(${legacy}) THEN 1 ELSE 0 END)) OR
   (old.attempts=0 AND old.state IN('pending','dispatching') AND old.expires_at>${DB_NOW} AND (old.desired=0 OR old.purpose IN(${launch230PurposeSql})))))`;
  const originalGuard=`(${p.sql}) AND (${venueGuard.sql}) ${canonical.present?`AND (${sourceRankGuard})`:''} AND ${clear} ${canonical.present?`AND (${canonical239NoAmbiguousOwnership('?2','?3','?5')})`:''}
   AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)
   AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND denied=1)
   AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply')`;
  const {facts,guard,clauses}=canonical.present?canonical239GuardFacts(canonical239GroupedFacts('?2','?3','?5'),[p.sql,venueGuard.sql,sourceRankGuard,clear,canonical239NoAmbiguousOwnership('?2','?3','?5'),
   `NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1) AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND denied=1) AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply')`]):{facts:'',guard:originalGuard,clauses:[]};
  const row=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose='${grantPurpose}' AND desired=1
   AND subject_generation IS ?5 AND request_digest=?6 AND ${rosterEq} AND native_guid=?8 AND expires_at=?9`;
  const rowClauses=['id=?1','subject=?2','guild_id=?3','role_id=?4',`purpose='${grantPurpose}'`,'desired=1','subject_generation IS ?5','request_digest=?6',rosterEq,'native_guid=?8','expires_at=?9'];
  const grouped=(original:string,extra:readonly string[])=>canonical.present?canonical239And([...extra,...clauses]):original;
  const current=async()=>{check();const r=await env.DB.prepare(`${facts}SELECT 1 AS current WHERE ${guard}`).bind(...values).first();check();return !!r;};
  if(derive){
   // A durable control receipt is issued only by this same active original
   // pending-consumption capability. It records no HTTP attempt or role fact.
   // This lets a later original routine visit recover after a reviewed manual
   // migration without pretending an observed/manual role was our own PUT.
   const identityValues=[randomGeneration(),...values.slice(1)],identityAdmission=canonical239GuardFacts('',[p.sql,venueGuard.sql,sourceIdentityGuard]);
   const identity=await launch230NativeIntent(env,env.DB.prepare(`${identityAdmission.facts}INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
    SELECT ?1,?2,'canonical_identity233',?3,?4,1,'settled','canonical233_original_control_verified',?5,?6,${DB_NOW},?9,${DB_NOW},?7,?8,'${CANONICAL_PROFILE233}',${nativeRank},'${nativeName!.replace(/'/g,"''")}'
    WHERE ${canonical239And([...identityAdmission.clauses,"NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='canonical_identity233' AND request_digest=?6)"])}
    RETURNING *,NULL AS beta_window_id`).bind(...identityValues),check);identity.check();check();
   if(!identity.intent)return result('held','canonical233_original_control_receipt_held');
   const extra=entitlements.manifest?.entries.filter(e=>e.subject===f.subject&&e.generation===f.subjectGeneration).map(e=>canonical.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[];
   const wanted=highestCanonicalRank233(canonical.policy!,{index:nativeRank!,name:nativeName!},extra);
   if(wanted?.roleId!==role)return result('held','canonical233_retained_entitlement_requires_routine');
  }
  const queuedFacts=await launch230NativeIntent(env,env.DB.prepare(`${facts}INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,roster_id,native_guid,native_profile${derive?',native_rank,native_rank_name':''})
   SELECT ?1,?2,'${grantPurpose}',?3,?4,1,'pending','launch230_awaiting_dispatch',?5,?6,${DB_NOW},?9,?7,?8,'${profile}'${derive?`,${nativeRank},'${nativeName!.replace(/'/g,"''")}'`:''}
   WHERE ${canonical.present?canonical239And([...clauses,`NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='${grantPurpose}' AND request_digest=?6)`]):`${guard} AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='${grantPurpose}' AND request_digest=?6)`}
   RETURNING *,NULL AS beta_window_id`).bind(...values),check);queueCheck=queuedFacts.check;check();const queued=queuedFacts.intent;
  if(!queued||queued.id!==id||!Number.isSafeInteger(queued.created_at))return result('held','launch230_queue_held',id);
  if(b.limit-b.attempts<8)return result('held','role_request_budget',id);
  let target:Member|null;
  try{target=await qualify(env,b,f.subject,role,true,false,[],false,current,false,roleAdmission);check();if(!launch230Member(target,f.subject))throw Error();}
  catch{return result('held','inventory_hierarchy_or_server_hold',id);}
  if(!await current())return result('held','launch230_admission_changed',id);
  if(derive&&target?.roles.some(r=>r!==role&&CANONICAL_MIGRATION_ROLE_IDS233.includes(r))){
   // This original invocation has made no role request. Retire only its own
   // unattempted intent so the separately issued current routine mandate can
   // perform an owned replacement; no spent claim is unspent or retried.
   const parked=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='held',reason='canonical233_no_dispatch_reconciliation',checked_at=${DB_NOW} WHERE ${grouped(`${row} AND state='pending' AND attempts=0 AND claim_nonce IS NULL AND ${guard}`,[...rowClauses,"state='pending'",'attempts=0','claim_nonce IS NULL'])} RETURNING *,NULL AS beta_window_id`).bind(...values),check);parked.check();check();
   return result('held','canonical233_existing_rank_requires_reconciliation',id);
  }
  if(target?.roles.includes(role)){
   const r=await env.DB.prepare(`${facts}UPDATE role_settlements SET state='settled',reason='${derive?'canonical233_observed_without_dispatch':'launch230_current_role_observed'}',checked_at=${DB_NOW}
    WHERE ${grouped(`${row} AND state='pending' AND attempts=0 AND ${guard}`,[...rowClauses,"state='pending'",'attempts=0'])} RETURNING id`).bind(...values).first();check();
   return r?result('settled','fresh_server_confirmed',id,now()):result('held','launch230_receipt_held',id);
  }
  const nonce=randomGeneration(),n=values.length+1,withNonce=[...values,nonce];
  const claimFacts=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?${n},reason='launch230_dispatching'
   WHERE ${grouped(`${row} AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${guard}`,[...rowClauses,"state='pending'",'attempts=0',`expires_at>${DB_NOW}`])} RETURNING *,NULL AS beta_window_id`).bind(...withNonce),check);claimCheck=claimFacts.check;check();const claim=claimFacts.intent;
  if(!claim||claim.id!==id||claim.claim_nonce!==nonce||claim.attempts!==1||claim.state!=='dispatching'||claim.expires_at!==f.deadline)return result('held','launch230_claim_changed',id);
  parent=Object.freeze({id,nonce,subject:f.subject,generation:f.subjectGeneration,guild:v.guildId,role:role,createdAt:queued.created_at,expiresAt:f.deadline,fingerprint:f.fingerprint,snapshotId:f.source.snapshotId,guid:f.source.guid,canonical:derive,grantPurpose,profile,providerCheck:()=>{providerCheck();if(!canonical.current())throw Error('canonical233_configuration_changed');rankGraph();queueCheck();claimCheck();}});
  const owned=`${row} AND attempts=1 AND claim_nonce=?${n}`,ownedClauses=[...rowClauses,'attempts=1',`claim_nonce=?${n}`];
  const finalAdmission=async()=>{check();const r=await env.DB.prepare(`${facts}SELECT 1 AS admitted FROM role_settlements WHERE ${canonical.present?canonical239And([...ownedClauses,"state='dispatching'",`expires_at>${DB_NOW}`,...clauses]):`${owned}
   AND state='dispatching' AND expires_at>${DB_NOW} AND ${guard}`}`).bind(...withNonce).first();check();return !!r;};
  try{
   await request(env,b,'PUT',`/guilds/${v.guildId}/members/${f.subject}/roles/${role}`,finalAdmission,()=>{check();if(now()>=f.deadline)throw Error('launch230_expired');effectStarted=true;},roleAdmission);
   putAcknowledged=true;
  }catch{
   const reason=effectStarted?'launch230_provider_outcome_unknown':derive?'canonical233_never_dispatched':'launch230_never_dispatched';
   try{await env.DB.prepare(`UPDATE role_settlements SET state=?${n+1},reason=?${n+2},checked_at=${DB_NOW}
    WHERE ${owned} AND state='dispatching' RETURNING id`).bind(...withNonce,effectStarted?'unknown':'held',reason).first();}catch{/* Keep the original attempted claim; no replay. */}
   return result(effectStarted?'unknown':'held',reason,id);
  }
  let after:Member|null;
  try{assertRuntimeVenue230(env,venue);after=await member(env,b,f.subject);assertRuntimeVenue230(env,venue);if(!launch230Member(after,f.subject))throw Error();}
  catch{try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='launch230_confirmation_unknown' WHERE ${owned}`).bind(...withNonce).run();}catch{}return result('unknown','launch230_confirmation_unknown',id);}
  let admitted=false;try{admitted=await current();}catch{/* An invalidated original never becomes a new admission. */}
  if(!admitted||launch230Blocker(env,after))return compensateLaunchMembership230(env,parent,venue,b);
  if(!after?.roles.includes(role)){
   try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='launch230_effect_not_confirmed' WHERE ${owned}`).bind(...withNonce).run();}catch{}
   return result('unknown','launch230_effect_not_confirmed',id);
  }
  try{
   const r=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='settled',reason='${derive?'canonical233_put_acknowledged_and_confirmed':'launch230_put_acknowledged_and_confirmed'}',checked_at=${DB_NOW}
    WHERE ${grouped(`${owned} AND state='dispatching' AND ${guard}`,[...ownedClauses,"state='dispatching'"])} RETURNING *,NULL AS beta_window_id`).bind(...withNonce),check);check();r.check();
   if(r.intent?.id===id&&r.intent.claim_nonce===nonce&&r.intent.state==='settled')return result('settled','effect_and_current_server_confirmed',id,now());
  }catch{/* A lost receipt is unknown; a later SELECT cannot recreate its ACK. */}
  try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='launch230_receipt_unknown' WHERE ${owned} AND state IN('dispatching','settled')`).bind(...withNonce).run();}catch{}
  return result('unknown','launch230_receipt_unknown',id);
 }catch{
  // Only this invocation's original successful PUT can mint its compensation child.
  if(putAcknowledged&&parent)return compensateLaunchMembership230(env,parent,venue,b);
  return result(effectStarted?'unknown':'held','launch230_original_admission_held',id);
 }
}

/** Private child issuer. No JSON parent, purpose selector or later row lookup can call it. */
async function compensateLaunchMembership230(env:Env,p:Launch230Parent,venue:RuntimeVenue230,b:AttemptBudget):Promise<Settlement>{
 let child:string|null=null;
 try{
  p.providerCheck();assertRuntimeVenue230(env,venue);const v=runtimeVenue230Facts(venue),grantPurpose=p.grantPurpose??LAUNCH_MEMBERSHIP230_PURPOSES.grant,compensationPurpose=p.canonical?'canonical_compensation233':LAUNCH_MEMBERSHIP230_PURPOSES.compensation,deletedReason=p.canonical?'canonical233_delete_acknowledged_and_confirmed':'launch230_delete_acknowledged_and_confirmed';
  if(v.guildId!==p.guild||!p.canonical&&v.roleId!==p.role||b.limit-b.attempts<2)return result('unknown','launch230_compensation_held',p.id);
  child=randomGeneration();const nonce=randomGeneration(),values:(string|number|null)[]=[child,p.id,p.subject,p.guild,p.role,p.nonce,nonce,p.generation,p.createdAt,p.expiresAt,p.fingerprint,p.snapshotId,p.guid];
  const g=runtimeVenue230Predicate(env,venue,values.length+1);values.push(...g.values);
  const parent=`EXISTS(SELECT 1 FROM role_settlements own WHERE own.id=?2 AND own.subject=?3 AND own.guild_id=?4 AND own.role_id=?5
   AND own.purpose='${grantPurpose}' AND own.desired=1 AND own.attempts=1 AND own.claim_nonce=?6
   AND own.subject_generation IS ?8 AND own.created_at=?9 AND own.expires_at=?10 AND own.request_digest=?11 AND ${p.snapshotId===null?'own.roster_id IS ?12':'own.roster_id=?12'} AND own.native_guid=?13 AND own.state IN('dispatching','unknown'))`;
  const noNewer=`NOT EXISTS(SELECT 1 FROM role_settlements newer WHERE newer.subject=?3 AND newer.guild_id=?4 AND newer.role_id=?5 AND newer.id<>?2
   AND newer.desired=1 AND newer.attempts=1 AND newer.created_at>=?9)
   AND NOT EXISTS(SELECT 1 FROM role_settlements other WHERE other.subject=?3 AND other.guild_id=?4 AND other.role_id=?5 AND other.id NOT IN(?1,?2)
   AND other.attempts=1 AND other.state IN('dispatching','unknown'))`;
  const admitted=`${parent} AND (${g.sql}) AND ${noNewer}`;
  const baseCheck=()=>{p.providerCheck();assertRuntimeVenue230(env,venue);};
  const r=await launch230NativeIntent(env,env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,claim_nonce,attempts,subject_generation,created_at,expires_at${p.canonical?',native_profile':''})
   SELECT ?1,?3,'${compensationPurpose}',?4,?5,0,'dispatching','launch230_compensating',?2,?7,1,?8,${DB_NOW},${DB_NOW}+300${p.canonical?`, '${CANONICAL_PROFILE233}'`:''}
   WHERE ${admitted} AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='${compensationPurpose}' AND request_digest=?2) RETURNING *,NULL AS beta_window_id`).bind(...values),baseCheck);
  baseCheck();r.check();if(r.intent?.id!==child||r.intent.claim_nonce!==nonce||r.intent.request_digest!==p.id||r.intent.attempts!==1)return result('unknown','launch230_compensation_claim_held',p.id);
  const owned=`id=?1 AND subject=?3 AND guild_id=?4 AND role_id=?5 AND purpose='${compensationPurpose}' AND desired=0 AND attempts=1 AND request_digest=?2 AND claim_nonce=?7`;
  const check=()=>{baseCheck();r.check();};
  const final=async()=>{check();const x=await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${owned} AND state='dispatching' AND expires_at>${DB_NOW} AND ${admitted}`).bind(...values).first();check();return !!x;};
  await request(env,b,'DELETE',`/guilds/${p.guild}/members/${p.subject}/roles/${p.role}`,final,check,p.canonical?canonical233RoleOnly:launch230RoleOnly);
  const after=await member(env,b,p.subject);check();if(!launch230Member(after,p.subject)||after?.roles.includes(p.role))throw Error();
  const ack=await launch230NativeIntent(env,env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='${deletedReason}',checked_at=${DB_NOW}
   WHERE ${owned} AND state='dispatching' AND (${g.sql}) RETURNING *,NULL AS beta_window_id`).bind(...values),check);check();ack.check();if(ack.intent?.id!==child||ack.intent.state!=='settled')throw Error();
  const parentAck=await launch230NativeIntent(env,env.DB.prepare(`UPDATE role_settlements SET state='held',reason='${p.canonical?'canonical233_compensated':'launch230_compensated'}',checked_at=${DB_NOW}
   WHERE id=?2 AND claim_nonce=?6 AND subject=?3 AND guild_id=?4 AND role_id=?5 AND ${parent} AND (${g.sql}) AND EXISTS(SELECT 1 FROM role_settlements WHERE ${owned} AND state='settled' AND reason='${deletedReason}') RETURNING *,NULL AS beta_window_id`).bind(...values),()=>{check();ack.check();});
  parentAck.check();return parentAck.intent?.id===p.id?result('held','removed_after_admission_changed',p.id,now()):result('unknown','launch230_parent_receipt_unknown',p.id);
 }catch{
  if(child)try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='launch230_compensation_unknown' WHERE id IN(?1,?2) AND attempts=1 AND state='dispatching'`).bind(child,p.id).run();}catch{}
  return result('unknown','launch230_compensation_unknown',p.id);
 }
}

/** Spent effects may be observed in every mode. Neither present nor absent mints an ACK or a retry. */
export async function observeLaunchMembershipDebt230(env:Env,id:string,b:AttemptBudget=budget()):Promise<Settlement>{
 try{
  if(!TOKEN.test(id))return result('held','invalid_operation');const binding=launch230ProviderWitness(env);
  const original=await launch230NativeIntent(env,env.DB.prepare('SELECT *,NULL AS beta_window_id FROM role_settlements WHERE id=?1').bind(id),binding,false);
  const i=original.intent,check=()=>{binding();original.check();};check();
  if(!i||!(launch230Purposes as readonly string[]).includes(i.purpose)||i.guild_id!==BETA_RESET_GUILD_ID||i.guild_id!==env.GUILD_ID||i.role_id!==BETA_RESET_ROLE_IDS[0]||!ID.test(i.subject))return result('held','launch230_receipt_not_owned',id);
  if(i.attempts!==1||!i.claim_nonce)return result('held','launch230_original_consumption_required',id);
  if(i.state==='settled'&&['launch230_put_acknowledged_and_confirmed','launch230_delete_acknowledged_and_confirmed'].includes(i.reason))return result('settled','launch230_original_ack_retained',id,i.checked_at);
  if(b.limit-b.attempts<1)return result('held','role_request_budget',id);
  const after=await member(env,b,i.subject);check();if(!launch230Member(after,i.subject))return result('held','current_server_unknown',id);
  const tuple=JSON.stringify(i),fields=SETTLEMENT_INTENT_FIELDS.filter(k=>k!=='beta_window_id');
  const stamped=await env.DB.prepare(`UPDATE role_settlements SET checked_at=${DB_NOW} WHERE ${fields.map(k=>`${k} IS json_extract(?1,'$.${k}')`).join(' AND ')} RETURNING id`).bind(tuple).first();check();
  return stamped?result('unknown',after?.roles.includes(i.role_id)?'launch230_present_effect_unresolved':'launch230_absent_effect_unresolved',id,now()):result('held','launch230_receipt_changed',id);
 }catch{return result('held','launch230_outcome_read_held',id);}
}

/** A selector chooses one fixed current cause; current SQL, generation, venue and live inventory supply authority. */
export async function settleLaunchMembershipRemoval230(env:Env,subject:string,cause:RemovalPurpose,generation:string|null|undefined,b:AttemptBudget=budget()):Promise<Settlement>{
 let id:string|null=null,nonce:string|null=null,started=false;
 try{
  if(generation===undefined)return result('held','original_removal_generation_required');
  const selected=await captureRuntimeVenueForRemoval230(env);if(!selected)return result('held','launch230_venue_held');
  const {effect,venue}=selected,v=runtimeVenue230Facts(venue),binding=launch230ProviderWitness(effect);
  if(!ID.test(subject)||!['ban','rename_hold','blocking_role','guild_departure'].includes(cause))return result('held','removal_configuration');
  const old=await readPrivacySubject(effect,subject);binding();assertRuntimeVenue230(effect,venue);
  if(old&&old.state!=='active')return result('held','subject_held');const captured=old?.subjectGeneration??null;
  if(generation!==captured)return result('held','original_removal_generation_changed');
  const prior=await effect.DB.prepare(`SELECT id FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND role_id=?3 AND purpose='${LAUNCH_MEMBERSHIP230_PURPOSES.removal}' AND attempts=1 AND state IN('dispatching','unknown') ORDER BY created_at,id LIMIT 1`).bind(subject,v.guildId,v.roleId).first<{id:string}>();
  if(prior)return observeLaunchMembershipDebt230(effect,prior.id,b);
  if(b.limit-b.attempts<(cause==='blocking_role'?7:6))return result('held','role_request_budget');
  id=randomGeneration();const values:(string|number|null)[]=[id,subject,v.guildId,v.roleId,generation,cause,Number(env.LINKS_NOT_BEFORE||0)],g=runtimeVenue230Predicate(effect,venue,8);values.push(...g.values);
  const causeSql=cause==='ban'?"EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)":cause==='rename_hold'?renameRemovalSql:cause==='guild_departure'?`EXISTS(SELECT 1 FROM characters WHERE discord_id=?2)
   AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?2 AND (status IN('member','left_pending') OR guid IS NULL))
   AND EXISTS(SELECT 1 FROM roster_snapshots s WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.exported_at<=${DB_NOW} AND s.exported_at>${DB_NOW}-600 AND s.exported_at>=?7
    AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id) AND NOT EXISTS(SELECT 1 FROM roster_members r JOIN characters c ON c.guid=r.guid WHERE r.snapshot_id=s.id AND c.discord_id=?2))`:'1=1';
  const sourceSql=cause==='ban'?`SELECT json_object('subject',discord_id,'banned',banned,'reason',ban_reason) FROM members WHERE discord_id=?2 AND banned=1`
   :cause==='rename_hold'?`SELECT json_group_array(json_object('id',id,'subject',discord_id,'key',char_key,'guid',guid,'old',old_name,'new',new_name,'nonce',nonce,'state',state,'actor',decided_by,'at',decided_at)) FROM (SELECT * FROM rename_holds WHERE discord_id=?2 AND state='reapply' ORDER BY id)`
   :cause==='guild_departure'?`SELECT json_object('snapshot',(SELECT json_object('id',id,'at',exported_at,'source',source,'count',member_count) FROM roster_snapshots ORDER BY id DESC LIMIT 1),'characters',(SELECT json_group_array(json_object('key',name_key,'guid',guid,'status',status,'bound',bound_at)) FROM (SELECT * FROM characters WHERE discord_id=?2 ORDER BY name_key)))`
   :`SELECT json_object('subject',?2,'generation',?5)`;
  // The queue ACK below is the original admitted capture: G, exact cause bytes and venue are consumed together.
  const initialGuard=`(${g.sql}) AND ${privacyGenerationFenceSql(2,5)} AND (${causeSql})`;
  const causeRow=await effect.DB.prepare(`SELECT (${sourceSql}) AS causeJSON WHERE ${initialGuard}`).bind(...values).first<{causeJSON:string}>();binding();assertRuntimeVenue230(effect,venue);
  if(!causeRow||typeof causeRow.causeJSON!=='string'||causeRow.causeJSON.length>64000)return result('held','removal_cause_withdrawn');
  values.push(causeRow.causeJSON);const digest=await sha256(cause+'|'+causeRow.causeJSON);binding();assertRuntimeVenue230(effect,venue);values.push(digest);
  const noCompeting=`NOT EXISTS(SELECT 1 FROM role_settlements other WHERE other.id<>?1 AND other.subject=?2 AND other.guild_id=?3 AND other.role_id=?4 AND other.desired=0
   AND ((other.attempts=1 AND other.state IN('dispatching','unknown')) OR (other.attempts=0 AND other.state IN('pending','dispatching') AND other.expires_at>${DB_NOW})))`;
  const guard=`${initialGuard} AND (${sourceSql}) IS ?10 AND ${noCompeting}`,row=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND subject_generation IS ?5 AND native_profile=?6 AND request_digest=?11 AND purpose='${LAUNCH_MEMBERSHIP230_PURPOSES.removal}' AND desired=0`;
  let factsCheck=()=>{},blockingCheck:(()=>void)|null=null;const check=()=>{binding();assertRuntimeVenue230(effect,venue);factsCheck();},current=async()=>{check();const r=await effect.DB.prepare('SELECT 1 WHERE '+guard+' AND ?11 IS NOT NULL').bind(...values).first();check();return !!r;};
  let target=await qualify(effect,b,subject,v.roleId,false,false,[],false,current,false,launch230RoleOnly);check();if(!launch230Member(target,subject))throw Error();
  if(cause==='blocking_role'&&!launch230Blocker(effect,target))return result('held','removal_cause_withdrawn');
  const queued=await launch230NativeIntent(effect,effect.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,native_profile,request_digest,created_at,expires_at)
   SELECT ?1,?2,'${LAUNCH_MEMBERSHIP230_PURPOSES.removal}',?3,?4,0,'pending','launch230_awaiting_dispatch',?5,?6,?11,${DB_NOW},${DB_NOW}+300 WHERE ${guard}
   AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND guild_id=?3 AND role_id=?4 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown')) RETURNING *,NULL AS beta_window_id`).bind(...values),check);
  factsCheck=queued.check;check();if(!queued.intent)return result('held','launch230_removal_intent_held',id);
  if(!target?.roles.includes(v.roleId)){const r=await effect.DB.prepare(`UPDATE role_settlements SET state='settled',reason='launch230_current_role_absent',checked_at=${DB_NOW} WHERE ${row} AND state='pending' AND attempts=0 AND ${guard} RETURNING id`).bind(...values).first();check();return r?result('settled','absent',id,now()):result('held','removal_cause_withdrawn',id);}
  if(cause==='blocking_role'){target=await member(effect,b,subject,current);check();if(!launch230Member(target,subject)||!launch230Blocker(effect,target))return result('held','removal_cause_withdrawn',id);const original=launch230MemberWitness(target,subject),observedAt=now();blockingCheck=()=>{original();if(now()<observedAt||now()-observedAt>=60||!launch230Blocker(effect,target))throw Error('blocking_role_observation_changed');};}
  nonce=randomGeneration();const all=[...values,nonce],at=all.length;
  const claim=await launch230NativeIntent(effect,effect.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?${at},reason='launch230_dispatching' WHERE ${row} AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${guard} RETURNING *,NULL AS beta_window_id`).bind(...all),check);const qcheck=factsCheck;factsCheck=()=>{qcheck();claim.check();};check();if(!claim.intent)return result('held','removal_cause_withdrawn',id);
  const owned=`${row} AND attempts=1 AND claim_nonce=?${at}`,admit=async()=>{check();if(cause==='blocking_role'){if(!blockingCheck)return false;blockingCheck();}const r=await effect.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${owned} AND state='dispatching' AND expires_at>${DB_NOW} AND ${guard}`).bind(...all).first();check();blockingCheck?.();return !!r;};
  try{await request(effect,b,'DELETE',`/guilds/${v.guildId}/members/${subject}/roles/${v.roleId}`,admit,()=>{check();started=true;},launch230RoleOnly);
   const after=await member(effect,b,subject);check();if(!launch230Member(after,subject)||after?.roles.includes(v.roleId))throw Error();
   const ack=await effect.DB.prepare(`UPDATE role_settlements SET state='settled',reason='launch230_delete_acknowledged_and_confirmed',checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching' AND ${guard} RETURNING id`).bind(...all).first();check();if(!ack)throw Error();return result('settled','removed',id,now());
  }catch{try{await effect.DB.prepare(`UPDATE role_settlements SET state=?${at+1},reason=?${at+2},checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching'`).bind(...all,started?'unknown':'held',started?'launch230_delete_outcome_unknown':'launch230_never_dispatched').run();}catch{}return result(started?'unknown':'held',started?'launch230_delete_outcome_unknown':'launch230_never_dispatched',id);}
 }catch{return result(started?'unknown':'held','launch230_removal_held',id);}
}
async function captureRuntimeVenueForRemoval230(env:Env):Promise<{effect:Env;venue:RuntimeVenue230}|null>{
 const selected=await (await import('./shared-membership-cutover230')).captureRuntimeVenue230(env);if(selected.mode!=='enabled')return null;
 const effect={...env,DB:privacyProviderCustodyDatabase(env)};assertRuntimeVenue230(effect,selected.venue);return {effect,venue:selected.venue};
}

// Current named Prime profile. The old full-release SQL/ten-rank captures above
// remain historical. Only an original fresh routine issuer can enter this block.
export const ROUTINE_MEMBERSHIP232_PURPOSE='launch_routine_membership232';
export const NATIVE_COMPENSATION232_PURPOSE='native_rank_compensation232';
const native232Calls=new WeakMap<object,Set<string>>();
/** Closed known-result recognizer, never ownership by observation. Unresolved
 * rows are held before this expression, across every account generation. */
function canonical233KnownReceipt(a:string):string{
 if(!/^[a-z][a-z0-9_]*$/.test(a))throw Error('canonical233_alias');
 return `((${a}.guild_id='${BETA_RESET_GUILD_ID}' AND ${a}.native_profile='${CANONICAL_PROFILE233}' AND ${a}.role_id IN(${CANONICAL_MANAGED_ROLE_IDS233.map(r=>"'"+r+"'").join(',')}))
 AND (${native232Hex(a+'.id',32)} AND ${native232Hex(a+'.claim_nonce',32)} AND (${native232Hex(a+'.request_digest',32)} OR ${native232Hex(a+'.request_digest',64)}))
 AND (${a}.attempts=1 AND typeof(${a}.created_at)='integer' AND ${a}.created_at>0 AND typeof(${a}.checked_at)='integer' AND ${a}.checked_at>=${a}.created_at AND ${a}.expires_at>${a}.created_at AND ${a}.expires_at<=${a}.created_at+300)
 AND ((${a}.state='settled' AND ${a}.purpose IN('canonical_consumed233','canonical_routine233','canonical_compensation233') AND ((${a}.desired=1 AND ${a}.reason='canonical233_put_acknowledged_and_confirmed' AND ((${native232Hex(a+'.request_digest',64)} AND ${canonical233GrantFacts(a)}) OR (${canonical233ManualGrantFacts(a)}))) OR (${a}.desired=0 AND ${a}.reason='canonical233_delete_acknowledged_and_confirmed')))
 OR (${a}.state='held' AND ${a}.purpose IN('canonical_consumed233','canonical_routine233') AND ${a}.reason='canonical233_never_dispatched')
 OR (${a}.state='held' AND ${a}.desired=1 AND ${a}.purpose IN('canonical_consumed233','canonical_routine233') AND ${a}.reason='canonical233_compensated'
 AND EXISTS(SELECT 1 FROM role_settlements done233 WHERE done233.request_digest=${a}.id AND done233.subject=${a}.subject AND done233.guild_id=${a}.guild_id AND done233.role_id=${a}.role_id AND done233.subject_generation IS ${a}.subject_generation
 AND done233.purpose='canonical_compensation233' AND done233.native_profile='${CANONICAL_PROFILE233}' AND done233.desired=0 AND done233.state='settled' AND done233.attempts=1 AND ${native232Hex('done233.id',32)} AND ${native232Hex('done233.claim_nonce',32)} AND done233.reason='canonical233_delete_acknowledged_and_confirmed' AND done233.checked_at>=done233.created_at))))`;
}
const canonical233GrantFacts=(a:string)=>`((${native232GrantFacts(a)}) AND ${a}.role_id=(CASE ${a}.native_rank ${NATIVE_CANONICAL_INDEX233.map((rank,index)=>`WHEN ${index} THEN '${CANONICAL_RANKS233[rank]!.roleId}'`).join(' ')} END))`;
const canonical233ManualGrantFacts=(a:string)=>`((${native232GrantFacts(a)}) AND ${a}.purpose='canonical_routine233' AND ${native232Hex(a+'.request_digest',32)} AND ${a}.role_id IN('${CANONICAL_RANKS233[5]!.roleId}','${CANONICAL_RANKS233[6]!.roleId}','${CANONICAL_RANKS233[10]!.roleId}')
 AND EXISTS(SELECT 1 FROM role_settlements entitlement233 WHERE entitlement233.id=${a}.request_digest AND ${native232Hex('entitlement233.id',32)} AND entitlement233.subject=${a}.subject AND entitlement233.subject_generation IS ${a}.subject_generation AND entitlement233.guild_id=${a}.guild_id AND entitlement233.role_id=${a}.role_id
 AND (entitlement233.purpose='canonical_entitlement233' AND entitlement233.native_profile='${CANONICAL_PROFILE233}' AND entitlement233.desired=1 AND entitlement233.state='settled' AND entitlement233.attempts=0 AND entitlement233.claim_nonce IS NULL AND entitlement233.reason='owner_inventory_authorized')
 AND (${native232Hex('entitlement233.request_digest',64)} AND entitlement233.created_at<=${a}.created_at AND entitlement233.checked_at>=entitlement233.created_at AND entitlement233.checked_at<=${a}.created_at AND entitlement233.expires_at>=${a}.expires_at AND entitlement233.expires_at<=entitlement233.created_at+300)
 AND (entitlement233.native_guid=${a}.native_guid AND entitlement233.roster_id=${a}.roster_id AND entitlement233.native_rank=${a}.native_rank AND entitlement233.native_rank_name=${a}.native_rank_name)))`;
const canonical233OwnedGrantBase=(a:string)=>`((${canonical233KnownReceipt(a)}) AND ${a}.desired=1 AND ${a}.state='settled' AND ${a}.reason='canonical233_put_acknowledged_and_confirmed'
 AND ${a}.purpose IN('canonical_consumed233','canonical_routine233') AND ${a}.checked_at<${a}.expires_at)`;
const canonical233OwnedGrant=(a:string)=>`EXISTS(SELECT 1 FROM c239_canonical held239 WHERE held239.c239_row=${a}.rowid) AND (${canonical239CurrentOwnership(a)})`;
/** Administrative ownership is not verified-player identity. No routine issuer
 * accepts this profile as a Native/control lineage anchor. */
function canonical233MigrationKnownReceipt(a:string):string{
 return `((${a}.guild_id='${BETA_RESET_GUILD_ID}' AND ${a}.native_profile='${CANONICAL_MIGRATION_PROFILE233}' AND ${a}.role_id IN(${CANONICAL_MIGRATION_ROLE_IDS233.map(r=>"'"+r+"'").join(',')}))
 AND ((${native232Hex(a+'.id',32)} AND ${native232Hex(a+'.claim_nonce',32)} AND ${a}.attempts=1) AND (${a}.proof_id IS NULL AND ${a}.roster_id IS NULL AND ${a}.native_guid IS NULL) AND (${a}.native_rank IS NULL AND ${a}.native_rank_name IS NULL))
 AND (typeof(${a}.created_at)='integer' AND ${a}.created_at>0 AND ${a}.expires_at>${a}.created_at AND ${a}.expires_at<=${a}.created_at+300 AND typeof(${a}.checked_at)='integer' AND ${a}.checked_at>=${a}.created_at)
 AND ((${a}.state='settled' AND ((${a}.purpose='canonical_migration233' AND ${a}.desired=1 AND ${native232Hex(a+'.request_digest',64)} AND ${a}.reason='canonical233_migration_put_acknowledged_and_confirmed' AND ${a}.role_id IN(${CANONICAL_RANKS233.map(r=>"'"+r.roleId+"'").join(',')}))
 OR (${a}.purpose IN('canonical_migration_remove233','canonical_migration_compensation233') AND ${a}.desired=0 AND ${native232Hex(a+'.request_digest',32)} AND ${a}.reason='canonical233_migration_delete_acknowledged_and_confirmed')))
 OR (${a}.state='held' AND ${a}.reason='canonical233_migration_never_dispatched')))`;
}
const canonical233MigrationOwnedGrantBase=(a:string)=>`((${canonical233MigrationKnownReceipt(a)}) AND ${a}.purpose='canonical_migration233' AND ${a}.desired=1 AND ${a}.state='settled' AND ${a}.reason='canonical233_migration_put_acknowledged_and_confirmed' AND ${a}.checked_at<${a}.expires_at)`;
const canonical233MigrationOwnedGrant=(a:string)=>`EXISTS(SELECT 1 FROM c239_migration held239 WHERE held239.c239_row=${a}.rowid) AND (${canonical239CurrentOwnership(a)})`;
/** A migration's alias DELETE references the new target ACK as its authority,
 * but does not revoke that different target role. Unknown/malformed references
 * remain blockers; only the exact acknowledged same-subject/G cleanup is exempt. */
const canonical233AliasRemoval=(child:string,parent:string)=>`(${child}.purpose='canonical_migration_remove233' AND ${child}.state='settled' AND ${child}.reason='canonical233_migration_delete_acknowledged_and_confirmed'
 AND ${child}.subject=${parent}.subject AND ${child}.guild_id=${parent}.guild_id AND ${child}.subject_generation IS ${parent}.subject_generation AND ${child}.role_id<>${parent}.role_id AND (${canonical233MigrationKnownReceipt(child)}))`;
class Native232Blocked extends Error{
 readonly subject:string;readonly check:()=>void;
 constructor(env:Env,target:Member,subject:string){super('native232_blocking_role');this.subject=subject;const graph=launch230MemberWitness(target,subject),provider=launch230ProviderWitness(env),at=now();this.check=()=>{graph();provider();if(now()<at||now()-at>=60||!launch230Blocker(env,target))throw Error('native232_restriction_changed');};this.check();Object.freeze(this);}
}
const native232Restrictions=new WeakMap<object,Native232Blocked>();
const native232Purposes=[ROUTINE_MEMBERSHIP232_PURPOSE,'fresh_roster_rank','staff_roster_rank',NATIVE_COMPENSATION232_PURPOSE] as const;
const native232Hex=(a:string,n:number)=>`(typeof(${a})='text' AND length(${a})=${n} AND length(CAST(${a} AS BLOB))=${n} AND instr(${a},char(0))=0 AND ${a} NOT GLOB '*[^0-9a-f]*')`;
const native232NoSend=(a:string)=>`((${a}.native_profile='${NATIVE_RANK_PROFILE232}' AND ${a}.guild_id='${BETA_RESET_GUILD_ID}' AND ${a}.state='held' AND ${a}.attempts=1 AND ${a}.reason='native232_never_dispatched')
 AND (${a}.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank') AND ${native232Hex(a+'.id',32)} AND ${native232Hex(a+'.claim_nonce',32)})
 AND ((${native232Hex(a+'.request_digest',32)} OR ${native232Hex(a+'.request_digest',64)}) AND ${a}.checked_at>=${a}.created_at AND ${a}.expires_at>${a}.created_at AND ${a}.expires_at<=${a}.created_at+300))`;
const native232GrantFacts=(a:string)=>`((typeof(${a}.native_rank)='integer' AND ${a}.native_rank BETWEEN 0 AND 9 AND ${a}.native_rank_name=(CASE ${a}.native_rank ${NATIVE_RANK_NAMES232.map((name,index)=>`WHEN ${index} THEN '${name}'`).join(' ')} END))
 AND (typeof(${a}.native_guid)='text' AND instr(${a}.native_guid,char(0))=0 AND typeof(${a}.roster_id)='integer' AND ${a}.roster_id>0)
 AND (${a}.purpose<>'staff_roster_rank' OR ${a}.role_id=(CASE ${a}.native_rank WHEN 0 THEN '${NATIVE_STAFF232['Guild Master']}' WHEN 3 THEN '${NATIVE_STAFF232.Officer}' WHEN 5 THEN '${NATIVE_STAFF232['Raid Leader']}' END)))`;
/** Explicit retained provider custody, distinct from the issuer's identity
 * anchor. An observed-present row supplies no removal ownership. */
const native232OwnedGrantBase=(a:string,base:boolean)=>`((${a}.desired=1 AND ${a}.state='settled' AND ${a}.attempts=1) AND (${native232Hex(a+'.id',32)} AND ${native232Hex(a+'.claim_nonce',32)} AND ${native232Hex(a+'.request_digest',64)})
 AND (typeof(${a}.created_at)='integer' AND ${a}.created_at>0 AND ${a}.expires_at>${a}.created_at AND ${a}.expires_at<=${a}.created_at+300 AND ${a}.checked_at>=${a}.created_at AND ${a}.checked_at<${a}.expires_at)
 AND (typeof(${a}.native_guid)='text' AND instr(${a}.native_guid,char(0))=0 AND EXISTS(SELECT 1 FROM characters own_link WHERE own_link.discord_id=${a}.subject AND own_link.guid=${a}.native_guid AND own_link.status IN('member','left_pending','left')))
 AND ((${a}.native_profile='${NATIVE_RANK_PROFILE232}' AND ${a}.reason='native232_put_acknowledged_and_confirmed' AND ${native232GrantFacts(a)})${base?` OR (${a}.native_profile='prime-native-230' AND ${a}.purpose='launch_membership230' AND ${a}.role_id='${SHARED_MEMBER232}' AND ${a}.reason='launch230_put_acknowledged_and_confirmed' AND ${a}.native_rank IS NULL AND ${a}.native_rank_name IS NULL)`:''}))`;
const native232OwnedGrant=(a:string,base:boolean)=>`EXISTS(SELECT 1 FROM c239_native held239 WHERE held239.c239_row=${a}.rowid ${base?'':`AND held239.native_profile='${NATIVE_RANK_PROFILE232}'`}) AND (${canonical239CurrentOwnership(a)})`;

/** .239 facts are materialized anew inside EACH original Native statement.
 * Scope only ownership history; physical debt and reference scans remain global
 * where required. rowid is internal row identity (including NULL ids), never
 * chronology, an outcome field or a permit retained between statements. */
function canonical239Facts(subject:string,guild:string,generation:string,from?:string):string{
 for(const at of [subject,guild,generation,...(from===undefined?[]:[from])])if(!/^\?[1-9]\d*$/.test(at))throw Error('canonical239_source_parameter');
 const scope=(a:string)=>`${a}.subject=${subject} AND ${a}.guild_id=${guild} AND ${a}.subject_generation IS ${generation}`;
 const facts=[
  `c239_native AS MATERIALIZED(SELECT b239.rowid AS c239_row,b239.* FROM role_settlements b239 WHERE ${scope('b239')} AND b239.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank','launch_membership230') AND (${native232OwnedGrantBase('b239',true)}))`,
  `c239_canonical AS MATERIALIZED(SELECT b239.rowid AS c239_row,b239.* FROM role_settlements b239 WHERE ${scope('b239')} AND (${canonical233OwnedGrantBase('b239')}))`,
  `c239_migration AS MATERIALIZED(SELECT b239.rowid AS c239_row,b239.* FROM role_settlements b239 WHERE ${scope('b239')} AND (${canonical233MigrationOwnedGrantBase('b239')}))`,
  `c239_base AS MATERIALIZED(SELECT * FROM c239_native UNION ALL SELECT * FROM c239_canonical UNION ALL SELECT * FROM c239_migration)`,
  `c239_negative_self AS MATERIALIZED(SELECT d239.rowid AS c239_row,d239.*,CASE WHEN (${canonical233MigrationKnownReceipt('d239')}) AND d239.state='settled' AND d239.reason='canonical233_migration_delete_acknowledged_and_confirmed' AND typeof(d239.expires_at)='integer' AND d239.checked_at<d239.expires_at AND d239.checked_at<=${DB_NOW} THEN 1 ELSE 0 END AS c239_strict
   FROM role_settlements d239 WHERE ${scope('d239')} AND d239.purpose='canonical_migration_remove233' AND d239.desired=0 AND (d239.state='settled' OR d239.reason='canonical233_migration_delete_acknowledged_and_confirmed'))`,
  `c239_negative AS MATERIALIZED(SELECT d239.*,CASE WHEN d239.c239_strict=1 AND EXISTS(SELECT 1 FROM c239_migration target239 WHERE target239.id=d239.request_digest AND target239.subject=d239.subject AND target239.guild_id=d239.guild_id AND target239.subject_generation IS d239.subject_generation AND target239.role_id<>d239.role_id AND typeof(target239.expires_at)='integer' AND target239.expires_at=d239.expires_at AND target239.checked_at<=d239.created_at AND target239.checked_at<=${DB_NOW}) THEN 1 ELSE 0 END AS c239_edge FROM c239_negative_self d239)`,
 ];
 if(from!==undefined)facts.push(
  `c239_pending_shape AS MATERIALIZED(SELECT p239.rowid AS c239_row,p239.*,CASE WHEN ${canonical239PendingShape('p239',subject,guild,generation,from)} THEN 1 ELSE 0 END AS c239_shape FROM role_settlements p239 WHERE ${scope('p239')} AND p239.role_id IN(SELECT value FROM json_each(${from})))`,
  `c239_children AS MATERIALIZED(SELECT sibling239.rowid AS c239_row,sibling239.request_digest,
   CASE WHEN EXISTS(SELECT 1 FROM c239_pending_shape shape239 WHERE shape239.c239_row=sibling239.rowid AND shape239.c239_shape=1) AND NOT EXISTS(SELECT 1 FROM role_settlements next239 WHERE next239.request_digest=sibling239.id) THEN 1 ELSE 0 END AS c239_pending,
   CASE WHEN (${canonical233AliasRemoval('sibling239','safe_parent239')}) AND (${canonical239DeleteEdge('sibling239')}) AND NOT EXISTS(SELECT 1 FROM role_settlements next239 WHERE next239.request_digest=sibling239.id) THEN 1 ELSE 0 END AS c239_alias,
   CASE WHEN (${native232NoSend('sibling239')}) THEN 1 ELSE 0 END AS c239_no_send
   FROM role_settlements sibling239 JOIN c239_base safe_parent239 ON sibling239.request_digest=safe_parent239.id)`,
  `c239_safe_pending AS MATERIALIZED(SELECT p239.c239_row FROM c239_pending_shape p239 JOIN c239_base safe_parent239 ON safe_parent239.id=p239.request_digest AND safe_parent239.subject=p239.subject AND safe_parent239.guild_id=p239.guild_id AND safe_parent239.subject_generation IS p239.subject_generation AND safe_parent239.role_id=p239.role_id
   WHERE p239.c239_shape=1 AND safe_parent239.checked_at<=p239.created_at AND NOT EXISTS(SELECT 1 FROM role_settlements descendant239 WHERE descendant239.request_digest=p239.id)
   AND NOT EXISTS(SELECT 1 FROM c239_children child239 WHERE child239.request_digest=safe_parent239.id AND child239.c239_row IS NOT p239.c239_row AND child239.c239_pending<>1 AND child239.c239_alias<>1 AND child239.c239_no_send<>1))`,
 );
 return 'WITH '+facts.join(',\n')+' ';
}
/** Closed source-authored conjunctions only. Group without splitting, sorting,
 * inspecting or changing any opaque predicate or its SQL three-valued result. */
function canonical239And(parts:readonly string[]):string{
 if(!parts.length)throw Error('canonical239_empty_source_conjunction');
 const group=(start:number,end:number):string=>end-start===1?`(${parts[start]!})`:(()=>{const middle=start+Math.floor((end-start)/2);return `(${group(start,middle)} AND ${group(middle,end)})`;})();
 return group(0,parts.length);
}
/** Canonical/M formatting opt-in only. The original formatter above remains
 * byte-exact for legacy statements; all historical receipt bodies are shared. */
function canonical239GroupedFacts(subject:string,guild:string,generation:string,from?:string):string{
 for(const at of [subject,guild,generation,...(from===undefined?[]:[from])])if(!/^\?[1-9]\d*$/.test(at))throw Error('canonical239_source_parameter');
 const scope=(a:string)=>canonical239And([`${a}.subject=${subject}`,`${a}.guild_id=${guild}`,`${a}.subject_generation IS ${generation}`]);
 const negativeSelf=canonical239And([`(${canonical233MigrationKnownReceipt('d239')})`,"d239.state='settled'","d239.reason='canonical233_migration_delete_acknowledged_and_confirmed'","typeof(d239.expires_at)='integer'",'d239.checked_at<d239.expires_at',`d239.checked_at<=${DB_NOW}`]);
 const negativeWhere=canonical239And([scope('d239'),"d239.purpose='canonical_migration_remove233'",'d239.desired=0',"(d239.state='settled' OR d239.reason='canonical233_migration_delete_acknowledged_and_confirmed')"]);
 const target=canonical239And(['target239.id=d239.request_digest','target239.subject=d239.subject','target239.guild_id=d239.guild_id','target239.subject_generation IS d239.subject_generation','target239.role_id<>d239.role_id',"typeof(target239.expires_at)='integer'",'target239.expires_at=d239.expires_at','target239.checked_at<=d239.created_at',`target239.checked_at<=${DB_NOW}`]);
 const facts=[
  `c239_native AS MATERIALIZED(SELECT b239.rowid AS c239_row,b239.* FROM role_settlements b239 WHERE ${canonical239And([scope('b239'),`b239.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank','launch_membership230')`,`(${native232OwnedGrantBase('b239',true)})`])})`,
  `c239_canonical AS MATERIALIZED(SELECT b239.rowid AS c239_row,b239.* FROM role_settlements b239 WHERE ${canonical239And([scope('b239'),`(${canonical233OwnedGrantBase('b239')})`])})`,
  `c239_migration AS MATERIALIZED(SELECT b239.rowid AS c239_row,b239.* FROM role_settlements b239 WHERE ${canonical239And([scope('b239'),`(${canonical233MigrationOwnedGrantBase('b239')})`])})`,
  `c239_base AS MATERIALIZED(SELECT * FROM c239_native UNION ALL SELECT * FROM c239_canonical UNION ALL SELECT * FROM c239_migration)`,
  `c239_negative_self AS MATERIALIZED(SELECT d239.rowid AS c239_row,d239.*,CASE WHEN ${negativeSelf} THEN 1 ELSE 0 END AS c239_strict FROM role_settlements d239 WHERE ${negativeWhere})`,
  `c239_negative AS MATERIALIZED(SELECT d239.*,CASE WHEN ${canonical239And(['d239.c239_strict=1',`EXISTS(SELECT 1 FROM c239_migration target239 WHERE ${target})`])} THEN 1 ELSE 0 END AS c239_edge FROM c239_negative_self d239)`,
 ];
 if(from!==undefined)facts.push(
  `c239_pending_shape AS MATERIALIZED(SELECT p239.rowid AS c239_row,p239.*,CASE WHEN ${canonical239GroupedPendingShape('p239',subject,guild,generation,from)} THEN 1 ELSE 0 END AS c239_shape FROM role_settlements p239 WHERE ${canonical239And([scope('p239'),`p239.role_id IN(SELECT value FROM json_each(${from}))`])})`,
  `c239_children AS MATERIALIZED(SELECT sibling239.rowid AS c239_row,sibling239.request_digest,
   CASE WHEN ${canonical239And(['EXISTS(SELECT 1 FROM c239_pending_shape shape239 WHERE '+canonical239And(['shape239.c239_row=sibling239.rowid','shape239.c239_shape=1'])+')','NOT EXISTS(SELECT 1 FROM role_settlements next239 WHERE next239.request_digest=sibling239.id)'])} THEN 1 ELSE 0 END AS c239_pending,
   CASE WHEN ${canonical239And([`(${canonical233AliasRemoval('sibling239','safe_parent239')})`,`(${canonical239DeleteEdge('sibling239')})`,'NOT EXISTS(SELECT 1 FROM role_settlements next239 WHERE next239.request_digest=sibling239.id)'])} THEN 1 ELSE 0 END AS c239_alias,
   CASE WHEN (${native232NoSend('sibling239')}) THEN 1 ELSE 0 END AS c239_no_send
   FROM role_settlements sibling239 JOIN c239_base safe_parent239 ON sibling239.request_digest=safe_parent239.id)`,
  `c239_safe_pending AS MATERIALIZED(SELECT p239.c239_row FROM c239_pending_shape p239 JOIN c239_base safe_parent239 ON ${canonical239And(['safe_parent239.id=p239.request_digest','safe_parent239.subject=p239.subject','safe_parent239.guild_id=p239.guild_id','safe_parent239.subject_generation IS p239.subject_generation','safe_parent239.role_id=p239.role_id'])}
   WHERE ${canonical239And(['p239.c239_shape=1','safe_parent239.checked_at<=p239.created_at','NOT EXISTS(SELECT 1 FROM role_settlements descendant239 WHERE descendant239.request_digest=p239.id)',`NOT EXISTS(SELECT 1 FROM c239_children child239 WHERE ${canonical239And(['child239.request_digest=safe_parent239.id','child239.c239_row IS NOT p239.c239_row','child239.c239_pending<>1','child239.c239_alias<>1','child239.c239_no_send<>1'])})`])})`,
 );
 return 'WITH '+facts.join(',\n')+' ';
}
function canonical239GroupedPendingShape(a:string,subject:string,guild:string,generation:string,from:string):string{
 const nativeGuid=(x:string)=>canonical239And([`typeof(${x}.native_guid)='text'`,`length(CAST(${x}.native_guid AS BLOB))=length(${x}.native_guid)`,`instr(${x}.native_guid,char(0))=0`,`substr(${x}.native_guid,1,7)='Player-'`,`instr(substr(${x}.native_guid,8),'-') BETWEEN 2 AND 7`,`substr(substr(${x}.native_guid,8),1,instr(substr(${x}.native_guid,8),'-')-1) NOT GLOB '*[^0-9]*'`,`length(substr(substr(${x}.native_guid,8),instr(substr(${x}.native_guid,8),'-')+1)) BETWEEN 4 AND 16`,`substr(substr(${x}.native_guid,8),instr(substr(${x}.native_guid,8),'-')+1) NOT GLOB '*[^0-9A-Fa-f]*'`]);
 return canonical239And([`${a}.subject=${subject}`,`${a}.guild_id=${guild}`,`${a}.subject_generation IS ${generation}`,`${a}.role_id IN(SELECT value FROM json_each(${from}))`,native232Hex(a+'.id',32),`${a}.purpose='canonical_routine233'`,`${a}.native_profile='${CANONICAL_PROFILE233}'`,`${a}.desired=0`,`${a}.state='pending'`,`${a}.reason='native232_awaiting_dispatch'`,`${a}.attempts=0`,`${a}.claim_nonce IS NULL`,`${a}.checked_at IS NULL`,`${a}.proof_id IS NULL`,native232Hex(a+'.request_digest',32),`typeof(${a}.created_at)='integer'`,`${a}.created_at>0`,`${a}.created_at<=${DB_NOW}`,`typeof(${a}.expires_at)='integer'`,`${a}.expires_at>${a}.created_at`,`${a}.expires_at<=${a}.created_at+300`,`typeof(${a}.roster_id)='integer'`,`${a}.roster_id>0`,`((${a}.native_guid IS NULL AND ${a}.native_rank IS NULL AND ${a}.native_rank_name IS NULL) OR ((${nativeGuid(a)}) AND ${native232GrantFacts(a)}))`]);
}
/** Positive admission only: a false or NULL original predicate yields no row.
 * Every flag is rebuilt in this SAME original Native statement, not retained
 * from a SELECT. Keep row-local selectors and negative/value consumers outside
 * these atoms; their raw three-valued result is deliberately not exposed. */
type Canonical239GuardPredicate=string|Readonly<{kind:'migration-physical239';branches:readonly [string,string,string]}>;
function canonical239GuardFacts(facts:string,predicates:readonly Canonical239GuardPredicate[]):Readonly<{facts:string;guard:string;clauses:readonly string[]}>{
 if(!predicates.length||facts!==''&&(!facts.startsWith('WITH ')||!facts.endsWith(' ')))throw Error('canonical239_guard_source_shape');
 const names=predicates.map((_,index)=>'c239_admission_'+index),clauses=Object.freeze(names.map(name=>`EXISTS(SELECT 1 FROM ${name})`));
 let grouped=0;
 const definitions=predicates.flatMap((sql,index)=>{
  if(typeof sql==='string')return [`${names[index]} AS MATERIALIZED(SELECT 1 AS admitted WHERE (${sql}))`];
  if(sql.kind!=='migration-physical239'||sql.branches.length!==3||++grouped!==1)throw Error('canonical239_physical_group_source_shape');
  const branches=['c239_split_physical_du','c239_split_physical_known_debt','c239_split_physical_live_pending'];
  return [...branches.map((name,at)=>`${name} AS MATERIALIZED(SELECT 1 AS admitted WHERE ${sql.branches[at]!})`),`${names[index]} AS MATERIALIZED(SELECT 1 AS admitted WHERE (${branches.map(name=>`EXISTS(SELECT 1 FROM ${name})`).join(' AND ')}))`];
 });
 return Object.freeze({facts:(facts?facts.slice(0,-1)+',\n':'WITH ')+definitions.join(',\n')+' ',guard:canonical239And(clauses),clauses});
}
function canonical239DeleteEdge(d:string):string{
 return `EXISTS(SELECT 1 FROM c239_negative edge239 WHERE edge239.c239_row=${d}.rowid AND edge239.c239_edge=1)`;
}
function canonical239CurrentOwnership(p:string):string{
 return `NOT EXISTS(SELECT 1 FROM c239_negative gone239 WHERE gone239.subject=${p}.subject AND gone239.guild_id=${p}.guild_id AND gone239.role_id=${p}.role_id AND gone239.subject_generation IS ${p}.subject_generation AND (gone239.c239_edge<>1 OR NOT(${p}.created_at>gone239.checked_at)))`;
}
function canonical239NoAmbiguousOwnership(subject:string,guild:string,generation:string):string{
 return `NOT EXISTS(SELECT 1 FROM c239_base owner239 JOIN c239_negative doubt239 ON doubt239.subject=owner239.subject AND doubt239.guild_id=owner239.guild_id AND doubt239.role_id=owner239.role_id AND doubt239.subject_generation IS owner239.subject_generation
  WHERE owner239.subject=${subject} AND owner239.guild_id=${guild} AND owner239.subject_generation IS ${generation} AND owner239.role_id IN(${CANONICAL_MIGRATION_ROLE_IDS233.map(r=>"'"+r+"'").join(',')}) AND (doubt239.c239_edge<>1 OR NOT(owner239.checked_at<doubt239.created_at OR owner239.created_at>doubt239.checked_at)))`;
}
/** The same historical set, never current-owned filtering; repeated at birth,
 * claim, final and receipt so a rollback cannot create a same-second edge. */
function canonical239FromBirthClear(subject:string,guild:string,generation:string,from:string):string{
 return `NOT EXISTS(SELECT 1 FROM c239_base birth239 WHERE birth239.subject=${subject} AND birth239.guild_id=${guild} AND birth239.subject_generation IS ${generation} AND birth239.role_id IN(SELECT value FROM json_each(${from})) AND birth239.checked_at>=${DB_NOW})`;
}
/** Incoming references are global even when their child is foreign, expired or
 * has a NULL id. Historical FROM roots remain present after an original M
 * DELETE consumes ownership. Only the existing fully parent-bound pending,
 * strict alias cleanup and never-dispatched classifications may coexist. */
function canonical239FromReferencesClear(subject:string,guild:string,generation:string,from:string):string{
 return `NOT EXISTS(SELECT 1 FROM c239_base from239 JOIN c239_children child239 ON child239.request_digest=from239.id
  WHERE ${canonical239And([`from239.subject=${subject}`,`from239.guild_id=${guild}`,`from239.subject_generation IS ${generation}`,`from239.role_id IN(SELECT value FROM json_each(${from}))`,"NOT(EXISTS(SELECT 1 FROM c239_safe_pending pending239 WHERE pending239.c239_row=child239.c239_row) OR child239.c239_alias=1 OR child239.c239_no_send=1)"])})`;
}
function native232KnownReceipt(a:string):string{
 if(!/^[a-z][a-z0-9_]*$/.test(a))throw Error('native232_alias');
 return `((${a}.native_profile='${NATIVE_RANK_PROFILE232}' AND ${a}.guild_id='${BETA_RESET_GUILD_ID}' AND ${a}.attempts=1) AND (${native232Hex(a+'.id',32)} AND ${native232Hex(a+'.claim_nonce',32)}
  AND (${native232Hex(a+'.request_digest',32)} OR ${native232Hex(a+'.request_digest',64)}) AND (${a}.subject_generation IS NULL OR ${native232Hex(a+'.subject_generation',32)}))
  AND (typeof(${a}.created_at)='integer' AND ${a}.created_at>0 AND typeof(${a}.expires_at)='integer' AND ${a}.expires_at>${a}.created_at AND ${a}.expires_at<=${a}.created_at+300)
  AND (typeof(${a}.checked_at)='integer' AND ${a}.checked_at>=${a}.created_at) AND (
  (${a}.state='settled' AND ((${a}.desired=1 AND ${a}.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank') AND ${a}.reason='native232_put_acknowledged_and_confirmed' AND ${native232GrantFacts(a)} AND ${native232Hex(a+'.request_digest',64)})
   OR (${a}.desired=0 AND ${a}.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank','${NATIVE_COMPENSATION232_PURPOSE}') AND ${a}.reason='native232_delete_acknowledged_and_confirmed')))
  OR (${a}.state='held' AND ${a}.reason='native232_never_dispatched' AND ${a}.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank'))
  OR (${a}.state='held' AND ${a}.reason='native232_compensated' AND EXISTS(SELECT 1 FROM role_settlements nc WHERE nc.request_digest=${a}.id AND nc.subject=${a}.subject AND nc.guild_id=${a}.guild_id AND nc.role_id=${a}.role_id AND nc.desired=0 AND nc.attempts=1 AND nc.claim_nonce IS NOT NULL AND nc.state='settled' AND nc.purpose='${NATIVE_COMPENSATION232_PURPOSE}' AND nc.native_profile='${NATIVE_RANK_PROFILE232}' AND nc.reason='native232_delete_acknowledged_and_confirmed'))))`;
}
type Native232Parent=Readonly<{canonical?:boolean;profile?:string;id:string;nonce:string;subject:string;generation:string|null;guild:string;role:string;purpose:string;createdAt:number;expiresAt:number;digest:string;check:()=>void}>;
export type NativeRankSettlement232=Readonly<{state:Settlement['state'];reason:string;outcomes:readonly Settlement[]}>;
/** Same central request/CAS/Native result custody as the existing lane. A JSON
 * plan, old queued row, member status or a GET result cannot mint this mandate. */
async function settleRoutineTarget232(env:Env,cap:RoutineMembership232,venue:RuntimeVenue230,role:string,desired:0|1,purpose:string,b:AttemptBudget,canonical233=false):Promise<Settlement>{
 let id:string|null=null,parent:Native232Parent|null=null,started=false,acknowledged=false;
 try{
  const I=await import('./routine-membership-authority232');
  env=I.routineMembership232Environment(env,cap);I.assertRoutineMembership232(env,cap);assertRuntimeVenue230(env,venue);
  const f=I.routineMembership232Facts(cap),v=runtimeVenue230Facts(venue),selected=captureNativeRankConfig232(env),canonical=captureCanonicalRankConfig233(env),entitlements=captureCanonicalEntitlements233(env),cfg=canonical233?historicalNativeRankPolicy232():selected.policy,profile=canonical233?CANONICAL_PROFILE233:NATIVE_RANK_PROFILE232,admission=canonical233?canonical233RoleOnly:native232RoleOnly;
  if(canonical.present!==canonical233||canonical233&&(canonical.mode!=='enabled'||!canonical.policy))return result('held','canonical233_configuration_held');
  if(canonical233&&entitlements.mode==='held')return result('held','canonical233_entitlement_configuration_held');
  const provider=launch230ProviderWitness(env),check=()=>{provider();I.assertRoutineMembership232(env,cap);assertRuntimeVenue230(env,venue);if(!selected.current()||!canonical.current()||!entitlements.current())throw Error('native232_configuration_changed');};check();
  if(!canonical233&&selected.mode!=='enabled'||!cfg||cfg.guildId!==v.guildId||cfg.membershipRole!==v.roleId||f.policyRaw!==(canonical233?JSON.stringify(cfg):selected.raw)||!ID.test(f.subject)||f.subjectGeneration!==null&&!TOKEN.test(f.subjectGeneration)||!Number.isSafeInteger(f.deadline)||f.deadline<=now()||f.deadline>now()+300)return result('held','native232_original_mandate_required');
  const rank=cfg.ranks.find(r=>r.roleId===role),staff=Object.values(NATIVE_STAFF232).some(r=>r===role),base=role===SHARED_MEMBER232;
  if(canonical233?purpose!=='canonical_routine233'||(!canonical.policy!.ranks.some(r=>r.roleId===role)&&!(desired===0&&(base||rank||staff))):base?purpose!==ROUTINE_MEMBERSHIP232_PURPOSE:rank?purpose!=='fresh_roster_rank':!staff||purpose!=='staff_roster_rank'||desired===1&&!cfg.privileged)return result('held','native232_role_configuration');
  const restriction=native232Restrictions.get(cap);restriction?.check();
  const extra=canonical233?entitlements.manifest?.entries.filter(e=>e.subject===f.subject&&e.generation===f.subjectGeneration).map(e=>canonical.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[]:[];
  const nativeTarget=canonical233&&f.primary?canonicalNativeRole233(canonical.policy!,f.primary.index,f.primary.rank):null;
  const canonicalTarget=canonical233&&f.primary?highestCanonicalRank233(canonical.policy!,{index:f.primary.index,name:f.primary.rank},extra):null;
  const wanted=canonical233?(canonicalTarget&&!restriction?[canonicalTarget.roleId]:[]):f.primary&&!restriction?[SHARED_MEMBER232,cfg.ranks[f.primary.index]?.roleId,...cfg.privileged&&NATIVE_STAFF232[f.primary.rank as keyof typeof NATIVE_STAFF232]?[NATIVE_STAFF232[f.primary.rank as keyof typeof NATIVE_STAFF232]]:[]]:[];
  if(desired===1&&(f.cause!=='eligible'||!f.primary||!wanted.includes(role))||desired===0&&wanted.includes(role))return result('held','native232_role_not_wanted');
  if(b.limit-b.attempts<6)return result('held','role_request_budget');
  const key=role+':'+desired,used=native232Calls.get(cap)??new Set<string>();if(used.has(key))return result('held','native232_original_turn_spent');used.add(key);native232Calls.set(cap,used);
  id=randomGeneration();const manualEntitlement=canonical233&&desired===1&&canonicalTarget?.roleId===role&&nativeTarget?.roleId!==role;
  const entitlementId=manualEntitlement?randomGeneration():null,digest=entitlementId??await sha256(f.policyRaw+'|'+f.subject+'|'+f.subjectGeneration+'|'+f.snapshotId+'|'+role+'|'+desired+(canonical233?'|'+canonical.raw:''));check();
  const values:(string|number|null)[]=[id,f.subject,v.guildId,role,f.subjectGeneration,digest,f.snapshotId,f.primary?.guid??null,f.deadline,desired,purpose,f.primary?.index??null,f.primary?.rank??null];
  const p=I.routineMembership232Predicate(env,cap,values.length+1);values.push(...p.values);const g=runtimeVenue230Predicate(env,venue,values.length+1);values.push(...g.values);
  const family=[SHARED_MEMBER232,...cfg.ranks.map(r=>r.roleId),...Object.values(NATIVE_STAFF232),...canonical233?CANONICAL_RANKS233.map(r=>r.roleId):[]];values.push(JSON.stringify(family));const familyAt=values.length;
  const legacySource=(await import('./privacy-shared-member-cutover230')).sharedMember230LegacyAckSql('old'),legacy=canonical233?groupLegacyAck233(legacySource):legacySource;check();
  const oldLaneAck=`(old.state='settled' AND old.attempts=1 AND old.claim_nonce IS NOT NULL AND old.reason IN('effect_and_current_server_confirmed','removed') AND old.purpose IN('fresh_roster_rank','staff_roster_rank','fresh_removal_ban','fresh_removal_departure','fresh_removal_rename_hold','fresh_removal_blocking_role','staff_removal_ban','staff_removal_departure'))`;
  // Same-statement raw classification only: original S/G rows across every
  // generation. These sets do not grant ownership or filter global children.
  const legacyPhysicalKnown=canonical233?[]:[
   {name:'c239_physical_launch_known',predicate:`(${launch230KnownReceipt('old')})`},
   {name:'c239_physical_native_known',predicate:`(${native232KnownReceipt('old')})`},
   {name:'c239_physical_legacy_known',predicate:`(${legacy})`},
   {name:'c239_physical_old_lane_known',predicate:oldLaneAck},
  ] as const;
  const physicalKnown=canonical233?`(${launch230KnownReceipt('old')}) OR (${native232KnownReceipt('old')}) OR ${canonical233?`(${canonical233KnownReceipt('old')}) OR (${canonical233MigrationKnownReceipt('old')}) OR `:''}(${legacy}) OR ${canonical233?'0=1':oldLaneAck}`:legacyPhysicalKnown.map(source=>`(EXISTS(SELECT 1 FROM ${source.name} known239 WHERE known239.c239_row=old.rowid))`).join(' OR ');
  const physical=`NOT EXISTS(SELECT 1 FROM role_settlements old WHERE old.subject=?2 AND old.guild_id=?3 AND old.id<>?1 AND (old.role_id=?4 OR old.role_id IN(SELECT value FROM json_each(?${familyAt})) OR old.purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank','fresh_roster_rank','staff_roster_rank'${canonical233?",'canonical_migration233','canonical_migration_remove233','canonical_migration_compensation233'":''})) AND (
   old.state IN('dispatching','unknown') OR (CASE WHEN old.attempts=0 THEN 0 WHEN ${physicalKnown} THEN 0 ELSE 1 END=1)
   OR (old.attempts=0 AND old.state IN('pending','dispatching') AND old.expires_at>${DB_NOW})))`;
  const ownershipBaseFacts=canonical233?canonical239GroupedFacts('?2','?3','?5'):canonical239Facts('?2','?3','?5');
  const ownershipFacts=canonical233?ownershipBaseFacts:ownershipBaseFacts.slice(0,-1)+',\n'+legacyPhysicalKnown.map(source=>`${source.name} AS MATERIALIZED(SELECT old.rowid AS c239_row FROM role_settlements old WHERE old.subject=?2 AND old.guild_id=?3 AND ${source.predicate})`).join(',\n')+' ';
  const ownProof=canonical233?`((${canonical233OwnedGrant('own')}) OR (${canonical233MigrationOwnedGrant('own')}) OR (own.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank','launch_membership230') AND ${native232OwnedGrant('own',base)}))`:`(own.purpose=?11${base?" OR own.purpose='launch_membership230'":''}) AND ${native232OwnedGrant('own',base)}`;
  const ownParent=desired===0?`EXISTS(SELECT 1 FROM role_settlements own WHERE own.id=?${familyAt+1} AND own.subject=?2 AND own.guild_id=?3 AND own.role_id=?4 AND own.subject_generation IS ?5 AND (${ownProof})
   AND NOT EXISTS(SELECT 1 FROM role_settlements child WHERE child.id<>?1 AND child.request_digest=own.id AND child.desired=0 ${canonical233?`AND NOT(${canonical233AliasRemoval('child','own')})`:''} AND (child.state IN('dispatching','unknown','settled') OR child.attempts<>0 AND NOT(${native232NoSend('child')}))))`:'1=1';
  // A current Native mandate may remove only the bot's own acknowledged grant.
  // A role already present before our PUT remains unowned/manual.
  if(desired===0){const parentRow=await env.DB.prepare(`${canonical239Facts('?1','?2','?4')}SELECT id FROM role_settlements own WHERE own.subject=?1 AND own.guild_id=?2 AND own.role_id=?3 AND own.subject_generation IS ?4 AND (${canonical233?ownProof:ownProof.replace(/\?11\b/g,'?5')}) AND NOT EXISTS(SELECT 1 FROM role_settlements child WHERE child.request_digest=own.id AND child.desired=0 ${canonical233?`AND NOT(${canonical233AliasRemoval('child','own')})`:''} AND (child.state IN('dispatching','unknown','settled') OR child.attempts<>0 AND NOT(${native232NoSend('child')}))) ORDER BY own.created_at DESC,own.id DESC LIMIT 1`).bind(...[f.subject,v.guildId,role,f.subjectGeneration,...canonical233?[]:[purpose]]).first<{id:string}>();check();if(!parentRow)return result('held','native232_manual_or_unowned_role');values[5]=parentRow.id;values.push(parentRow.id);}
  const originalGuardBase=canonical239And([p.sql,g.sql,physical,ownParent,canonical239NoAmbiguousOwnership('?2','?3','?5')]);
  const baseAtoms=[p.sql,g.sql,physical,ownParent,canonical239NoAmbiguousOwnership('?2','?3','?5')],baseAdmission=canonical233?canonical239GuardFacts(ownershipFacts,baseAtoms):{facts:ownershipFacts,guard:originalGuardBase,clauses:[]},guardBase=baseAdmission.guard;
  const entitlementGuard=manualEntitlement?`EXISTS(SELECT 1 FROM role_settlements e WHERE e.id=?6 AND e.subject=?2 AND e.subject_generation IS ?5 AND e.guild_id=?3 AND e.role_id=?4 AND e.purpose='canonical_entitlement233' AND e.native_profile='${CANONICAL_PROFILE233}' AND e.desired=1 AND e.state='settled' AND e.attempts=0 AND e.claim_nonce IS NULL AND e.reason='owner_inventory_authorized' AND e.request_digest='${entitlements.manifest!.packetSHA256}' AND e.expires_at=?9 AND e.checked_at>=e.created_at AND e.checked_at<e.expires_at AND e.roster_id=?7 AND e.native_guid=?8 AND e.native_rank=?12 AND e.native_rank_name=?13)`:'1=1';
  const {facts,guard,clauses}=manualEntitlement?canonical239GuardFacts(ownershipFacts,[...baseAtoms,entitlementGuard]):baseAdmission;
  const row=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND subject_generation IS ?5 AND request_digest=?6 AND roster_id=?7 AND native_guid IS ?8 AND expires_at=?9 AND desired=?10 AND purpose=?11 AND native_rank IS ?12 AND native_rank_name IS ?13 AND native_profile='${profile}'`;
  const rowClauses=['id=?1','subject=?2','guild_id=?3','role_id=?4','subject_generation IS ?5','request_digest=?6','roster_id=?7','native_guid IS ?8','expires_at=?9','desired=?10','purpose=?11','native_rank IS ?12','native_rank_name IS ?13',`native_profile='${profile}'`];
  const grouped=(original:string,extra:readonly string[])=>canonical233?canonical239And([...extra,...clauses]):original;
  const current=async()=>{check();const r=await env.DB.prepare(`${facts}SELECT 1 WHERE ${guard}`).bind(...values).first();check();return !!r;};
  if(manualEntitlement){
   const manual=entitlements.manifest!,key=canonicalTarget!.key,ev=[entitlementId!,...values.slice(1)],rawAt=ev.length+1;ev[5]=manual.packetSHA256;
   const source=`EXISTS(SELECT 1 FROM json_each(?${rawAt},'$.entries') e WHERE json_extract(e.value,'$.subject')=?2 AND json_extract(e.value,'$.generation') IS ?5 AND json_extract(e.value,'$.roleKey')='${key}')`;
   const original=await launch230NativeIntent(env,env.DB.prepare(`${baseAdmission.facts}INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
    SELECT ?1,?2,'canonical_entitlement233',?3,?4,1,'settled','owner_inventory_authorized',?5,?6,${DB_NOW},?9,${DB_NOW},?7,?8,'${CANONICAL_PROFILE233}',?12,?13 WHERE ${canonical239And([...baseAdmission.clauses,`(${source})`])} RETURNING *,NULL AS beta_window_id`).bind(...ev,entitlements.raw),check);original.check();check();if(!original.intent)return result('held','canonical233_entitlement_receipt_held');
  }
  let queueCheck=()=>{},claimCheck=()=>{};const allCheck=()=>{check();queueCheck();claimCheck();};
  const q=await launch230NativeIntent(env,env.DB.prepare(`${facts}INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name) SELECT ?1,?2,?11,?3,?4,?10,'pending','native232_awaiting_dispatch',?5,?6,${DB_NOW},?9,?7,?8,'${profile}',?12,?13 WHERE ${guard} RETURNING *,NULL AS beta_window_id`).bind(...values),check);queueCheck=q.check;allCheck();
  const queued=q.intent;if(!queued||queued.id!==id)return result('held','native232_intent_held',id);
  let target:Member|null;try{target=await qualify(env,b,f.subject,role,desired===1,false,[],false,current,false,admission);allCheck();}
  catch(error){if(desired===1&&error instanceof Native232Blocked&&error.subject===f.subject){try{error.check();const r=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='held',reason='native232_blocker_no_dispatch',checked_at=${DB_NOW} WHERE ${grouped(`${row} AND state='pending' AND attempts=0 AND ${guard}`,[...rowClauses,"state='pending'",'attempts=0'])} RETURNING *,NULL AS beta_window_id`).bind(...values),()=>{allCheck();error.check();});r.check();allCheck();error.check();if(r.intent?.id===id&&r.intent.state==='held'){native232Restrictions.set(cap,error);return result('held','native232_restriction_cleanup_pending',id);}}catch{}}return result('held','native232_inventory_or_currentness_held',id);}
  if(!launch230Member(target,f.subject)||desired===1&&launch230Blocker(env,target))return result('held','native232_target_held',id);
  let restrictionCheck=()=>{};
  if(desired===0&&restriction){restriction.check();if(!target||!launch230Blocker(env,target))return result('held','native232_restriction_withdrawn',id);const graph=launch230MemberWitness(target,f.subject),at=now();restrictionCheck=()=>{restriction.check();graph();if(now()<at||now()-at>=60||!launch230Blocker(env,target))throw Error('native232_restriction_changed');};restrictionCheck();}
  if(!canonical233&&!base&&desired===1&&!target?.roles.includes(SHARED_MEMBER232))return result('held','native232_shared_access_required_first',id);
  if(canonical233&&desired===1&&target?.roles.some(r=>r!==role&&CANONICAL_MIGRATION_ROLE_IDS233.includes(r)))return result('held','canonical233_existing_rank_requires_reconciliation',id);
  if(!!target?.roles.includes(role)===(desired===1)){
   const r=await env.DB.prepare(`${facts}UPDATE role_settlements SET state='settled',reason='${canonical233?'canonical233_observed_without_dispatch':'native232_observed_without_dispatch'}',checked_at=${DB_NOW} WHERE ${grouped(`${row} AND attempts=0 AND state='pending' AND ${guard}`,[...rowClauses,'attempts=0',"state='pending'"])} RETURNING id`).bind(...values).first();allCheck();return r?result('settled','native232_observed_without_dispatch',id,now()):result('held','native232_observation_held',id);
  }
  const nonce=randomGeneration(),nonceAt=values.length+1,ownedValues=[...values,nonce];
  const c=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?${nonceAt},reason='native232_dispatching' WHERE ${grouped(`${row} AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${guard}`,[...rowClauses,"state='pending'",'attempts=0',`expires_at>${DB_NOW}`])} RETURNING *,NULL AS beta_window_id`).bind(...ownedValues),allCheck);claimCheck=c.check;allCheck();
  if(!c.intent||c.intent.id!==id||c.intent.claim_nonce!==nonce)return result('held','native232_claim_held',id);
  const owned=`${row} AND attempts=1 AND claim_nonce=?${nonceAt}`,ownedClauses=[...rowClauses,'attempts=1',`claim_nonce=?${nonceAt}`];
  parent=Object.freeze({id,nonce,subject:f.subject,generation:f.subjectGeneration,guild:v.guildId,role,purpose,canonical:canonical233,profile,createdAt:c.intent.created_at,expiresAt:f.deadline,digest,check:()=>{provider();queueCheck();claimCheck();}});
  const final=async()=>{allCheck();restrictionCheck();const r=await env.DB.prepare(`${facts}SELECT 1 FROM role_settlements WHERE ${grouped(`${owned} AND state='dispatching' AND expires_at>${DB_NOW} AND ${guard}`,[...ownedClauses,"state='dispatching'",`expires_at>${DB_NOW}`])}`).bind(...ownedValues).first();allCheck();restrictionCheck();return !!r;};
  try{await request(env,b,desired===1?'PUT':'DELETE',`/guilds/${v.guildId}/members/${f.subject}/roles/${role}`,final,()=>{allCheck();restrictionCheck();if(now()>=f.deadline)throw Error('native232_expired');started=true;},admission);acknowledged=true;}
  catch{try{await env.DB.prepare(`UPDATE role_settlements SET state=?${nonceAt+1},reason=?${nonceAt+2},checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching'`).bind(...ownedValues,started?'unknown':'held',started?'native232_provider_outcome_unknown':canonical233?'canonical233_never_dispatched':'native232_never_dispatched').run();}catch{}return result(started?'unknown':'held',started?'native232_provider_outcome_unknown':canonical233?'canonical233_never_dispatched':'native232_never_dispatched',id);}
  let after:Member|null;
  try{after=await member(env,b,f.subject);}catch{try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='native232_confirmation_unknown',checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching'`).bind(...ownedValues).run();}catch{}return result('unknown','native232_confirmation_unknown',id);}
  allCheck();
  if(!launch230Member(after,f.subject))throw Error('native232_confirmation');
  if(desired===1&&(!await current()||launch230Blocker(env,after)))return compensateRoutine232(env,parent,venue,b);
  if(!!after?.roles.includes(role)!==(desired===1)){try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='native232_effect_not_confirmed',checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching'`).bind(...ownedValues).run();}catch{}return result('unknown','native232_effect_not_confirmed',id);}
  try{const receipt=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='settled',reason=?${nonceAt+1},checked_at=${DB_NOW} WHERE ${grouped(`${owned} AND state='dispatching' AND ${guard}`,[...ownedClauses,"state='dispatching'"])} RETURNING *,NULL AS beta_window_id`).bind(...ownedValues,canonical233?(desired===1?'canonical233_put_acknowledged_and_confirmed':'canonical233_delete_acknowledged_and_confirmed'):(desired===1?'native232_put_acknowledged_and_confirmed':'native232_delete_acknowledged_and_confirmed')),allCheck);allCheck();receipt.check();
   if(receipt.intent?.id===id&&receipt.intent.state==='settled')return result('settled',canonical233?(desired===1?'canonical233_put_acknowledged_and_confirmed':'canonical233_delete_acknowledged_and_confirmed'):(desired===1?'native232_put_acknowledged_and_confirmed':'native232_delete_acknowledged_and_confirmed'),id,now());
  }catch{/* A lost original receipt remains spent, never reconstructed from GET. */}
  try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='native232_receipt_unknown',checked_at=${DB_NOW} WHERE ${owned} AND state IN('dispatching','settled')`).bind(...ownedValues).run();}catch{}return result('unknown','native232_receipt_unknown',id);
 }catch{
  if(acknowledged&&parent&&desired===1)return compensateRoutine232(env,parent,venue,b);
  return result(started?'unknown':'held','native232_original_admission_held',id);
 }
}
/** Only the same invocation's original successful PUT supplies this parent. */
async function compensateRoutine232(env:Env,p:Native232Parent,venue:RuntimeVenue230,b:AttemptBudget):Promise<Settlement>{
 let id:string|null=null,started=false;
 try{p.check();assertRuntimeVenue230(env,venue);const profile=p.profile??NATIVE_RANK_PROFILE232,purpose=p.canonical?'canonical_compensation233':NATIVE_COMPENSATION232_PURPOSE,deleted=p.canonical?'canonical233_delete_acknowledged_and_confirmed':'native232_delete_acknowledged_and_confirmed';if(b.limit-b.attempts<2)return result('unknown','native232_compensation_budget',p.id);
  id=randomGeneration();const nonce=randomGeneration(),v:(string|number|null)[]=[id,p.id,p.subject,p.guild,p.role,p.generation,p.nonce,nonce,p.createdAt,p.expiresAt,p.digest,p.purpose];
  const g=runtimeVenue230Predicate(env,venue,v.length+1);v.push(...g.values);
  const parent=`EXISTS(SELECT 1 FROM role_settlements own WHERE own.id=?2 AND own.subject=?3 AND own.guild_id=?4 AND own.role_id=?5 AND own.subject_generation IS ?6 AND own.claim_nonce=?7 AND own.created_at=?9 AND own.expires_at=?10 AND own.request_digest=?11 AND own.purpose=?12 AND own.desired=1 AND own.attempts=1 AND own.native_profile='${profile}' AND own.state IN('dispatching','unknown'))`;
  const guard=`(${g.sql}) AND (${parent}) AND NOT EXISTS(SELECT 1 FROM role_settlements other WHERE other.subject=?3 AND other.guild_id=?4 AND other.role_id=?5 AND other.id NOT IN(?1,?2) AND (other.state IN('dispatching','unknown') OR other.attempts<>0 AND other.desired=1 AND other.created_at>=?9))`;
  const check=()=>{p.check();assertRuntimeVenue230(env,venue);};
  const q=await launch230NativeIntent(env,env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,claim_nonce,attempts,created_at,expires_at,native_profile) SELECT ?1,?3,'${purpose}',?4,?5,0,'dispatching','native232_compensating',?6,?2,?8,1,${DB_NOW},${DB_NOW}+300,'${profile}' WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='${purpose}' AND request_digest=?2) RETURNING *,NULL AS beta_window_id`).bind(...v),check);check();q.check();if(!q.intent||q.intent.id!==id)return result('unknown','native232_compensation_claim_held',p.id);
  const owned=`id=?1 AND subject=?3 AND guild_id=?4 AND role_id=?5 AND subject_generation IS ?6 AND purpose='${purpose}' AND desired=0 AND attempts=1 AND claim_nonce=?8 AND request_digest=?2 AND native_profile='${profile}'`;
  const final=async()=>{check();q.check();return !!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${owned} AND state='dispatching' AND expires_at>${DB_NOW} AND ${guard}`).bind(...v).first();};
  await request(env,b,'DELETE',`/guilds/${p.guild}/members/${p.subject}/roles/${p.role}`,final,()=>{check();q.check();started=true;},p.canonical?canonical233RoleOnly:native232RoleOnly);
  const after=await member(env,b,p.subject);check();q.check();if(!launch230Member(after,p.subject)||after?.roles.includes(p.role))throw Error();
  const ack=await launch230NativeIntent(env,env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='${deleted}',checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching' AND (${g.sql}) RETURNING *,NULL AS beta_window_id`).bind(...v),()=>{check();q.check();});check();ack.check();if(!ack.intent)throw Error();
  const closed=await env.DB.prepare(`UPDATE role_settlements SET state='held',reason='${p.canonical?'canonical233_compensated':'native232_compensated'}',checked_at=${DB_NOW} WHERE id=?2 AND claim_nonce=?7 AND ${parent} AND (${g.sql}) AND EXISTS(SELECT 1 FROM role_settlements WHERE ${owned} AND state='settled' AND reason='${deleted}') RETURNING id`).bind(...v).first();check();ack.check();return closed?result('held','native232_compensated',p.id,now()):result('unknown','native232_compensation_parent_unknown',p.id);
 }catch{if(id)try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='native232_compensation_unknown',checked_at=${DB_NOW} WHERE id IN(?1,?2) AND attempts=1 AND state='dispatching'`).bind(id,p.id).run();}catch{}return result('unknown',started?'native232_compensation_unknown':'native232_compensation_held',p.id);}
}
export async function queueAndSettleRoutineMembership232(env:Env,cap:RoutineMembership232,venue:RuntimeVenue230,b:AttemptBudget=budget()):Promise<Settlement>{
 if(captureCanonicalRankConfig233(env).present)return result('held','canonical233_use_single_rank_visit');
 try{const I=await import('./routine-membership-authority232');I.assertRoutineMembership232(env,cap);const f=I.routineMembership232Facts(cap),restriction=native232Restrictions.get(cap);restriction?.check();const first=await settleRoutineTarget232(env,cap,venue,SHARED_MEMBER232,!restriction&&f.cause==='eligible'&&f.primary?1:0,ROUTINE_MEMBERSHIP232_PURPOSE,b);
  if(first.reason==='native232_restriction_cleanup_pending'&&native232Restrictions.has(cap)){const removal=await settleRoutineTarget232(env,cap,venue,SHARED_MEMBER232,0,ROUTINE_MEMBERSHIP232_PURPOSE,b);return removal.reason==='native232_manual_or_unowned_role'?result('held','native232_restriction_base_preserved',removal.operationId):removal;}return first;
 }catch{return result('held','native232_original_mandate_required');}
}
/** Rank-only selected lane; base is settled first by the caller. At most two
 * rank/staff effects per visit, so later visits finish larger owned changes. */
export async function reconcileNativeRanks232(env:Env,cap:RoutineMembership232,venue:RuntimeVenue230,b:AttemptBudget=budget(),maxJobs:1|2=2):Promise<NativeRankSettlement232>{
 if(captureCanonicalRankConfig233(env).present)return reconcileCanonicalRanks233(env,cap,venue,b,maxJobs);
 const outcomes:Settlement[]=[];const done=(state:Settlement['state'],reason:string):NativeRankSettlement232=>Object.freeze({state,reason,outcomes:Object.freeze(outcomes.slice())});
 try{const I=await import('./routine-membership-authority232');env=I.routineMembership232Environment(env,cap);I.assertRoutineMembership232(env,cap);assertRuntimeVenue230(env,venue);const f=I.routineMembership232Facts(cap),c=captureNativeRankConfig232(env),p=c.policy;
  if(c.mode!=='enabled'||!p||f.policyRaw!==c.raw||maxJobs!==1&&maxJobs!==2)return done('held','native232_configuration_held');
  const restriction=native232Restrictions.get(cap);restriction?.check();
  const mirror=f.primary&&f.cause==='eligible'&&!restriction?p.ranks[f.primary.index]?.roleId:null,staff=f.primary&&f.cause==='eligible'&&p.privileged&&!restriction?NATIVE_STAFF232[f.primary.rank as keyof typeof NATIVE_STAFF232]??null:null;
  const managed=[...p.ranks.map(r=>({role:r.roleId,purpose:'fresh_roster_rank'})),...Object.values(NATIVE_STAFF232).map(role=>({role,purpose:'staff_roster_rank'}))];
  // Plan unwanted roles only from original own ACK history; present/manual
  // roles are never adopted. An unknown still fences all replacements centrally.
  const rows=(await env.DB.prepare(`${canonical239Facts('?1','?2','?3')}SELECT DISTINCT own.role_id,own.purpose,0 AS ambiguous FROM role_settlements own WHERE own.subject=?1 AND own.guild_id=?2 AND own.subject_generation IS ?3 AND own.native_profile=?4 AND own.desired=1 AND own.attempts=1 AND own.state='settled' AND own.claim_nonce IS NOT NULL AND own.reason='native232_put_acknowledged_and_confirmed' AND NOT EXISTS(SELECT 1 FROM role_settlements child WHERE child.request_digest=own.id AND child.desired=0 AND (child.state IN('dispatching','unknown','settled') OR child.attempts<>0 AND NOT(${native232NoSend('child')}))) AND (${canonical239CurrentOwnership('own')}) UNION ALL SELECT '', '',1 WHERE NOT(${canonical239NoAmbiguousOwnership('?1','?2','?3')}) ORDER BY ambiguous DESC,role_id LIMIT 14`).bind(f.subject,p.guildId,f.subjectGeneration,NATIVE_RANK_PROFILE232).all<{role_id:string;purpose:string;ambiguous:number}>()).results;I.assertRoutineMembership232(env,cap);if(!c.current())return done('held','native232_configuration_changed');if(rows.some(r=>r.ambiguous===1))return done('held','canonical239_ownership_history_ambiguous');
  const unwanted=rows.filter(r=>r.role_id!==mirror&&r.role_id!==staff&&managed.some(m=>m.role===r.role_id&&m.purpose===r.purpose)).sort((a,b)=>(a.purpose==='staff_roster_rank'?0:1)-(b.purpose==='staff_roster_rank'?0:1)||(a.role_id<b.role_id?-1:1));
  const grants=[...mirror?[{role:mirror,purpose:'fresh_roster_rank',desired:1 as const}]:[],...staff?[{role:staff,purpose:'staff_roster_rank',desired:1 as const}]:[]].sort((a,b)=>Number(rows.some(r=>r.role_id===a.role))-Number(rows.some(r=>r.role_id===b.role)));
  const jobs=[...unwanted.map(r=>({role:r.role_id,purpose:r.purpose,desired:0 as const})),...grants];
  for(const j of jobs.slice(0,maxJobs)){if(b.limit-b.attempts<6)return done('held','role_request_budget');const r=await settleRoutineTarget232(env,cap,venue,j.role,j.desired,j.purpose,b);outcomes.push(r);if(r.state!=='settled')return done(r.state,r.reason);}
  return done(jobs.length>maxJobs||restriction?'held':'settled',jobs.length>maxJobs?'native232_continuation_required':restriction?'native232_restriction_cleanup_complete':'native232_visit_complete');
 }catch{return done('held','native232_original_mandate_held');}
}

/** One current canonical entitlement, without a shared-Member prerequisite.
 * Every unwanted role still needs its own acknowledged grant parent. Manual or
 * historical observed-only roles are held for the separately reviewed migration. */
export async function reconcileCanonicalRanks233(env:Env,cap:RoutineMembership232,venue:RuntimeVenue230,b:AttemptBudget=budget(),maxJobs:1|2=2):Promise<NativeRankSettlement232>{
 const outcomes:Settlement[]=[],done=(state:Settlement['state'],reason:string):NativeRankSettlement232=>Object.freeze({state,reason,outcomes:Object.freeze(outcomes.slice())});
 try{
  const I=await import('./routine-membership-authority232');env=I.routineMembership232Environment(env,cap);I.assertRoutineMembership232(env,cap);assertRuntimeVenue230(env,venue);
  const c=captureCanonicalRankConfig233(env),entitlements=captureCanonicalEntitlements233(env),old=captureNativeRankConfig232(env),historical=historicalNativeRankPolicy232(),f=I.routineMembership232Facts(cap);if(c.mode!=='enabled'||!c.policy||!c.current()||entitlements.mode==='held'||maxJobs!==1&&maxJobs!==2)return done('held','canonical233_configuration_held');
  const extra=entitlements.manifest?.entries.filter(e=>e.subject===f.subject&&e.generation===f.subjectGeneration).map(e=>c.policy!.ranks.find(r=>r.key===e.roleKey)!.roleId)??[];
  const restriction=native232Restrictions.get(cap);restriction?.check();const wanted=f.cause==='eligible'&&f.primary&&!restriction?highestCanonicalRank233(c.policy,{index:f.primary.index,name:f.primary.rank},extra)?.roleId:null;
  const family=[...new Set([...c.policy.ranks.map(r=>r.roleId),...historical.ranks.map(r=>r.roleId),...Object.values(NATIVE_STAFF232)])];
  const rows=(await env.DB.prepare(`${canonical239Facts('?1','?2','?3')}SELECT DISTINCT own.role_id,0 AS ambiguous FROM role_settlements own WHERE own.subject=?1 AND own.guild_id=?2 AND own.subject_generation IS ?3 AND own.role_id IN(SELECT value FROM json_each(?4))
   AND ((${canonical233OwnedGrant('own')}) OR (${canonical233MigrationOwnedGrant('own')}) OR (own.purpose IN('${ROUTINE_MEMBERSHIP232_PURPOSE}','fresh_roster_rank','staff_roster_rank','launch_membership230') AND ${native232OwnedGrant('own',true)}))
   AND NOT EXISTS(SELECT 1 FROM role_settlements child WHERE child.request_digest=own.id AND child.desired=0 AND NOT(${canonical233AliasRemoval('child','own')}) AND (child.state IN('dispatching','unknown','settled') OR child.attempts<>0 AND NOT(${native232NoSend('child')}))) UNION ALL SELECT '',1 WHERE NOT(${canonical239NoAmbiguousOwnership('?1','?2','?3')}) ORDER BY ambiguous DESC,role_id LIMIT 32`).bind(f.subject,c.policy.guildId,f.subjectGeneration,JSON.stringify(family)).all<{role_id:string;ambiguous:number}>()).results;
  I.assertRoutineMembership232(env,cap);if(!c.current()||!old.current()||!entitlements.current())return done('held','canonical233_configuration_changed');if(rows.some(r=>r.ambiguous===1))return done('held','canonical239_ownership_history_ambiguous');
  const jobs=[...rows.filter(r=>r.role_id!==wanted).map(r=>({role:r.role_id,desired:0 as const})),...wanted?[{role:wanted,desired:1 as const}]:[]];
  const removed=new Set<string>();
  for(const j of jobs.slice(0,maxJobs)){
   const r=await settleRoutineTarget232(env,cap,venue,j.role,j.desired,'canonical_routine233',b,true);outcomes.push(r);
   if(j.desired===0&&r.state==='settled')removed.add(j.role);
   if(r.reason==='native232_restriction_cleanup_pending'&&native232Restrictions.has(cap)){
    // Only the same original fresh provider result can authorize this cleanup.
    // Never infer a blocker from a caller Boolean or carry it to another visit.
    const remainingOwned=rows.filter(row=>!removed.has(row.role_id));
    for(const owned of remainingOwned.slice(0,maxJobs)){if(b.limit-b.attempts<6)return done('held','role_request_budget');const removal=await settleRoutineTarget232(env,cap,venue,owned.role_id,0,'canonical_routine233',b,true);outcomes.push(removal);if(removal.state!=='settled')return done(removal.state,removal.reason);}
    return done('held',remainingOwned.length>maxJobs?'canonical233_continuation_required':'canonical233_restriction_cleanup_complete');
   }
   if(r.state!=='settled')return done(r.state,r.reason);
  }
  return done(jobs.length>maxJobs||restriction?'held':'settled',jobs.length>maxJobs?'canonical233_continuation_required':restriction?'canonical233_restriction_cleanup_complete':'canonical233_visit_complete');
 }catch{return done('held','canonical233_original_mandate_held');}
}

/** A reservation has no dispatch method and never supplies role ownership. */
function canonical239PendingShape(a:string,subject:string,guild:string,generation:string,from:string):string{
 const nativeGuid=(x:string)=>`(typeof(${x}.native_guid)='text' AND length(CAST(${x}.native_guid AS BLOB))=length(${x}.native_guid) AND instr(${x}.native_guid,char(0))=0 AND substr(${x}.native_guid,1,7)='Player-'
 AND instr(substr(${x}.native_guid,8),'-') BETWEEN 2 AND 7 AND substr(substr(${x}.native_guid,8),1,instr(substr(${x}.native_guid,8),'-')-1) NOT GLOB '*[^0-9]*'
 AND length(substr(substr(${x}.native_guid,8),instr(substr(${x}.native_guid,8),'-')+1)) BETWEEN 4 AND 16 AND substr(substr(${x}.native_guid,8),instr(substr(${x}.native_guid,8),'-')+1) NOT GLOB '*[^0-9A-Fa-f]*')`;
 const shape=(x:string)=>`(${x}.subject=${subject} AND ${x}.guild_id=${guild} AND ${x}.subject_generation IS ${generation} AND ${x}.role_id IN(SELECT value FROM json_each(${from}))
 AND ${native232Hex(x+'.id',32)} AND ${x}.purpose='canonical_routine233' AND ${x}.native_profile='${CANONICAL_PROFILE233}' AND ${x}.desired=0 AND ${x}.state='pending' AND ${x}.reason='native232_awaiting_dispatch'
 AND ${x}.attempts=0 AND ${x}.claim_nonce IS NULL AND ${x}.checked_at IS NULL AND ${x}.proof_id IS NULL AND ${native232Hex(x+'.request_digest',32)}
 AND typeof(${x}.created_at)='integer' AND ${x}.created_at>0 AND ${x}.created_at<=${DB_NOW} AND typeof(${x}.expires_at)='integer' AND ${x}.expires_at>${x}.created_at AND ${x}.expires_at<=${x}.created_at+300
 AND typeof(${x}.roster_id)='integer' AND ${x}.roster_id>0 AND ((${x}.native_guid IS NULL AND ${x}.native_rank IS NULL AND ${x}.native_rank_name IS NULL) OR ((${nativeGuid(x)}) AND ${native232GrantFacts(x)})))`;
 return shape(a);
}
function canonical239UnclaimedFrom(a:string):string{
 return `EXISTS(SELECT 1 FROM c239_safe_pending pending239 WHERE pending239.c239_row=${a}.rowid)`;
}
function canonical239ReservationRow(a:string,id:string,digest:string,birth:string,subject:string,guild:string,generation:string,expiry:string):string{
 return canonical239And([`${a}.id=${id}`,`${a}.subject=${subject}`,`${a}.guild_id=${guild}`,`${a}.subject_generation IS ${generation}`,`${a}.role_id='${SHARED_MEMBER232}'`,`${a}.purpose='canonical_migration_reservation239'`,`${a}.native_profile='${CANONICAL_MIGRATION_PROFILE233}'`,`${a}.desired=0`,`${a}.state='pending'`,`${a}.reason='canonical239_reservation_pending'`,`${a}.attempts=0`,`${a}.claim_nonce IS NULL`,`${a}.checked_at IS NULL`,`${a}.proof_id IS NULL`,`${a}.roster_id IS NULL`,`${a}.native_guid IS NULL`,`${a}.native_rank IS NULL`,`${a}.native_rank_name IS NULL`,`${a}.request_digest=${digest}`,`${a}.created_at=${birth}`,`${a}.expires_at=${expiry}`,`${a}.expires_at>${DB_NOW}`]);
}
export type CanonicalMigrationResult233=Readonly<{state:'settled'|'held'|'unknown';reason:string;targetOwned:boolean;remaining:readonly string[];outcomes:readonly Settlement[];coordination:Readonly<{reservationId:string|null;create:'not_started'|'original_native_insert'|'unconfirmed';release:'not_attempted'|'original_native_update'|'unconfirmed';nonDispatching:true;originalCreateTuple:RetirementParent|null;originalReleaseTuple:RetirementParent|null}>}>;
/** Root-only ephemeral preview entry. There is deliberately no production HTTP
 * route and no public capability mint. The owner manifest is trusted only as an
 * original env binding; all dispatch/receipt authority is still issued by the
 * actual admitted Native result in this invocation. Original migration ACKs
 * establish administrative role ownership, never verified-player identity. */
export async function migrateCanonicalRank233(originalEnv:Env,subject:string,b:AttemptBudget=budget()):Promise<CanonicalMigrationResult233>{
 const outcomes:Settlement[]=[],remaining:string[]=[];let targetOwned=false,active=true,reservationId:string|null=null,create:CanonicalMigrationResult233['coordination']['create']='not_started',release:CanonicalMigrationResult233['coordination']['release']='not_attempted';
 let originalCreateTuple:RetirementParent|null=null,originalReleaseTuple:RetirementParent|null=null;
 const done=(state:CanonicalMigrationResult233['state'],reason:string):CanonicalMigrationResult233=>{active=false;return Object.freeze({state,reason,targetOwned,remaining:Object.freeze(remaining.slice()),outcomes:Object.freeze(outcomes.slice()),coordination:Object.freeze({reservationId,create,release,nonDispatching:true,originalCreateTuple,originalReleaseTuple})});};
 try{
  const selected=captureCanonicalMigration233(originalEnv),canonical=captureCanonicalRankConfig233(originalEnv),provider=launch230ProviderWitness(originalEnv);
  if(!selected||canonical.mode!=='enabled'||!canonical.policy||!canonical.raw||!ID.test(subject))return done('held','canonical233_migration_configuration');
  const plan=selected.manifest,entry=plan.entries.find(e=>e.subject===subject);if(!entry||plan.guildId!==canonical.policy.guildId||originalEnv.GUILD_ID!==plan.guildId||subject===originalEnv.DISCORD_APP_ID)return done('held','canonical233_migration_subject');
  remaining.push(...entry.currentRoles.filter(r=>r!==entry.targetRole));
  if(b.limit-b.attempts<7+6*Math.min(2,remaining.length)||b.limit>50)return done('held','role_request_budget');
  const db=privacyProviderCustodyDatabase(originalEnv),descriptors=Object.getOwnPropertyDescriptors(originalEnv);descriptors.DB={value:db,writable:true,configurable:true,enumerable:true};
  const env=Object.create(Object.getPrototypeOf(originalEnv),descriptors) as Env,effectProvider=launch230ProviderWitness(env);
  const checkConfig=()=>{if(!active||!selected.current()||!canonical.current())throw Error('canonical233_migration_configuration_changed');provider();effectProvider();};checkConfig();
  const V=await import('./shared-membership-cutover230'),selectedVenue=await V.captureRuntimeVenue230(env);checkConfig();if(selectedVenue.mode!=='enabled')return done('held','canonical233_migration_venue');
  const venue=selectedVenue.venue,v=runtimeVenue230Facts(venue);if(v.epoch!==plan.epoch||await sha256(v.sealJSON)!==plan.seal||await sha256(canonical.raw)!==plan.policySHA256)return done('held','canonical233_migration_binding');
  const check=()=>{checkConfig();assertRuntimeVenue230(env,venue);const at=now();if(!Number.isSafeInteger(at)||at<plan.issuedAt||at>=plan.expiresAt)throw Error('canonical239_original_reservation_time_held');};check();
  const digest=await sha256(JSON.stringify(plan));check();reservationId=(await sha256('canonical239-reservation|'+plan.operationId+'|'+subject)).slice(0,32);check();
  const from=JSON.stringify(remaining),reserveValues:(string|number|null)[]=[reservationId,subject,plan.guildId,SHARED_MEMBER232,entry.generation,digest,plan.issuedAt,plan.expiresAt,from],rv=runtimeVenue230Predicate(env,venue,reserveValues.length+1);reserveValues.push(...rv.values);
  const family=CANONICAL_MIGRATION_ROLE_IDS233.map(r=>"'"+r+"'").join(','),legacy=groupLegacyAck233((await import('./privacy-shared-member-cutover230')).sharedMember230LegacyAckSql('old'));check();
  // These sets classify only this physical scan's same subject/guild rows,
  // across ALL generations. They are never ownership or global-child permits.
  const physicalKnown=[
   {name:'c239_physical_launch_known',predicate:launch230KnownReceipt('old')},
   {name:'c239_physical_native_known',predicate:native232KnownReceipt('old')},
   {name:'c239_physical_canonical_known',predicate:canonical233KnownReceipt('old')},
   {name:'c239_physical_migration_known',predicate:canonical233MigrationKnownReceipt('old')},
   {name:'c239_physical_legacy_known',predicate:legacy},
  ] as const;
  const physicalFacts=(fromParameter:string)=>{const facts=canonical239GroupedFacts('?2','?3','?5',fromParameter);return facts.slice(0,-1)+',\n'+physicalKnown.map(source=>`${source.name} AS MATERIALIZED(SELECT old.rowid AS c239_row FROM role_settlements old WHERE old.subject=?2 AND old.guild_id=?3 AND (${source.predicate}))`).join(',\n')+' ';};
  const knownPhysical=physicalKnown.map(source=>`(EXISTS(SELECT 1 FROM ${source.name} known239 WHERE known239.c239_row=old.rowid))`).join(' OR ');
  // Each no-bad-row branch is a separate positive same-statement flag. The
  // selector and original raw branch predicates are not parsed or weakened.
  const physical=(own:string):Exclude<Canonical239GuardPredicate,string>=>{
   const selector=`old.subject=?2 AND old.guild_id=?3 AND old.id IS NOT ?1 ${own} AND old.role_id IN(${family})`;
   const branch=(condition:string)=>`NOT EXISTS(SELECT 1 FROM role_settlements old WHERE ${selector} AND (${condition}))`;
   return Object.freeze({kind:'migration-physical239' as const,branches:Object.freeze([
    branch("old.state IN('dispatching','unknown')"),
    branch(`(old.attempts<>0 AND NOT(CASE WHEN ${knownPhysical} THEN 1 ELSE 0 END))`),
    branch(`(old.attempts=0 AND old.state='pending' AND old.expires_at>${DB_NOW} AND NOT(${canonical239UnclaimedFrom('old')}))`),
   ] as const)});
  };
  const standing=`NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1) AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND denied=1) AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply')`;
  const {facts:reserveFacts,guard:reserveGuard,clauses:reserveClauses}=canonical239GuardFacts(physicalFacts('?9'),[privacyGenerationFenceSql(2,5),`?7<=${DB_NOW} AND ?8>${DB_NOW}`,rv.sql,canonical239NoAmbiguousOwnership('?2','?3','?5'),canonical239FromBirthClear('?2','?3','?5','?9'),canonical239FromReferencesClear('?2','?3','?5','?9'),physical(''),standing]);
  let reserve:Awaited<ReturnType<typeof launch230NativeIntent>>;create='unconfirmed';
  try{reserve=await launch230NativeIntent(env,env.DB.prepare(`${reserveFacts}INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,native_profile)
   SELECT ?1,?2,'canonical_migration_reservation239',?3,?4,0,'pending','canonical239_reservation_pending',?5,?6,${DB_NOW},?8,'${CANONICAL_MIGRATION_PROFILE233}' WHERE ${canonical239And([...reserveClauses,'NOT EXISTS(SELECT 1 FROM role_settlements WHERE id=?1)'])} RETURNING *,NULL AS beta_window_id`).bind(...reserveValues),check);reserve.check();check();}catch{return done('held','canonical239_reservation_unconfirmed');}
  const held=reserve.intent;if(!held||held.id!==reservationId||held.subject!==subject||held.guild_id!==plan.guildId||held.role_id!==SHARED_MEMBER232||held.subject_generation!==entry.generation||held.request_digest!==digest||held.state!=='pending'||held.purpose!=='canonical_migration_reservation239'||held.reason!=='canonical239_reservation_pending'||held.attempts!==0||held.claim_nonce!==null||held.checked_at!==null||held.desired!==0||held.native_profile!==CANONICAL_MIGRATION_PROFILE233||held.proof_id!==null||held.roster_id!==null||held.native_guid!==null||held.native_rank!==null||held.native_rank_name!==null||held.expires_at!==plan.expiresAt||!Number.isSafeInteger(held.created_at)||held.created_at<plan.issuedAt||held.expires_at<=held.created_at||held.expires_at>held.created_at+300)return done('held','canonical239_reservation_held');
  create='original_native_insert';const reserveBirth=held.created_at,reserveSnapshot=JSON.stringify(held),reservationCheck=()=>{check();reserve.check();if(JSON.stringify(held)!==reserveSnapshot)throw Error('canonical239_reservation_witness_changed');};reservationCheck();
  const createTuple=Object.freeze(Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,held[k]]))) as RetirementParent;reservationCheck();originalCreateTuple=createTuple;
  const expected=entry.currentRoles.slice(),filtered=(m:Member|null)=>m?.roles.filter(r=>CANONICAL_MIGRATION_ROLE_IDS233.includes(r)).sort()??null;
  const completedRows:Readonly<Record<string,string|number|null>>[]=[],receiptChecks:(()=>void)[]=[];
  let stageCheck=()=>{},stageId='',stageNonce='';
  const run=async(role:string,desired:0|1):Promise<Settlement>=>{
   let id:string|null=null,nonce='',started=false,queueCheck=()=>{},claimCheck=()=>{};
   const purpose=desired===1?'canonical_migration233':'canonical_migration_remove233';
   try{
    reservationCheck();stageCheck();if(desired===0&&(!targetOwned||!remaining.includes(role)||role===entry.targetRole||!CANONICAL_MIGRATION_ROLE_IDS233.includes(role)))return result('held','canonical233_migration_from_role');
    id=(await sha256(plan.operationId+'|'+subject+'|'+role+'|'+desired)).slice(0,32);check();stageCheck();
    const values:(string|number|null)[]=[id,subject,plan.guildId,role,entry.generation,desired===1?plan.packetSHA256:stageId,plan.issuedAt,plan.expiresAt];
    const g=runtimeVenue230Predicate(env,venue,values.length+1);values.push(...g.values);
    const reserveAt=values.length+1;values.push(reservationId,digest,reserveBirth,from);const targetAt=values.length+1;if(desired===0)values.push(entry.targetRole,stageNonce);reservationCheck();stageCheck();
    const physicalNow=physical(`AND old.id IS NOT ?${reserveAt}`),liveReservation=`EXISTS(SELECT 1 FROM role_settlements reservation239 WHERE ${canonical239ReservationRow('reservation239','?'+reserveAt,'?'+(reserveAt+1),'?'+(reserveAt+2),'?2','?3','?5','?8')})`;
    const stageFacts=physicalFacts('?'+(reserveAt+3));
    const parent=desired===0?`EXISTS(SELECT 1 FROM role_settlements parent233 WHERE parent233.id=?6 AND parent233.subject=?2 AND parent233.guild_id=?3 AND parent233.subject_generation IS ?5 AND parent233.role_id=?${targetAt} AND parent233.claim_nonce=?${targetAt+1} AND ${canonical233MigrationOwnedGrant('parent233')})`:'1=1';
    const admission=canonical239GuardFacts(stageFacts,[privacyGenerationFenceSql(2,5),`?7<=${DB_NOW} AND ?8>${DB_NOW}`,g.sql,physicalNow,parent,canonical239NoAmbiguousOwnership('?2','?3','?5'),...desired===0?[canonical239FromBirthClear('?2','?3','?5','?'+(reserveAt+3))]:[],canonical239FromReferencesClear('?2','?3','?5','?'+(reserveAt+3)),standing]);
    const facts=admission.facts,guardClauses=[...admission.clauses,`(${liveReservation})`],guard=canonical239And(guardClauses);
    const row=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND subject_generation IS ?5 AND request_digest=?6 AND expires_at=?8 AND purpose='${purpose}' AND desired=${desired} AND native_profile='${CANONICAL_MIGRATION_PROFILE233}'`;
    const rowClauses=['id=?1','subject=?2','guild_id=?3','role_id=?4','subject_generation IS ?5','request_digest=?6','expires_at=?8',`purpose='${purpose}'`,`desired=${desired}`,`native_profile='${CANONICAL_MIGRATION_PROFILE233}'`];
    const allCheck=()=>{reservationCheck();stageCheck();queueCheck();claimCheck();};
    const current=async()=>{allCheck();const r=await env.DB.prepare(`${facts}SELECT 1 WHERE ${guard}`).bind(...values).first();allCheck();return !!r;};
    const q=await launch230NativeIntent(env,env.DB.prepare(`${facts}INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,native_profile)
     SELECT ?1,?2,'${purpose}',?3,?4,${desired},'pending','canonical233_migration_pending',?5,?6,${DB_NOW},?8,'${CANONICAL_MIGRATION_PROFILE233}' WHERE ${canonical239And([...guardClauses,'NOT EXISTS(SELECT 1 FROM role_settlements WHERE id=?1)'])} RETURNING *,NULL AS beta_window_id`).bind(...values),allCheck);queueCheck=q.check;allCheck();
    if(!q.intent||q.intent.id!==id)return result('held','canonical233_migration_spent_or_held',id);
    const target=await qualify(env,b,subject,role,desired===1,false,[],false,current,false,canonical233MigrationRoleOnly);allCheck();const targetGraph=launch230MemberWitness(target,subject);targetGraph();
    if(!target||JSON.stringify(filtered(target))!==JSON.stringify(expected))return result('held','canonical233_migration_current_roles_changed',id);
    nonce=randomGeneration();const at=values.length+1,ownedValues=[...values,nonce],owned=`${row} AND attempts=1 AND claim_nonce=?${at}`,ownedClauses=[...rowClauses,'attempts=1',`claim_nonce=?${at}`];
    const c=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?${at},reason='canonical233_migration_dispatching' WHERE ${canonical239And([...rowClauses,"state='pending'",'attempts=0',...guardClauses])} RETURNING *,NULL AS beta_window_id`).bind(...ownedValues),()=>{allCheck();targetGraph();});claimCheck=c.check;allCheck();targetGraph();
    if(!c.intent||c.intent.claim_nonce!==nonce)return result('held','canonical233_migration_claim_held',id);
    const final=async()=>{allCheck();targetGraph();const r=await env.DB.prepare(`${facts}SELECT 1 FROM role_settlements WHERE ${canonical239And([...ownedClauses,"state='dispatching'",...guardClauses])}`).bind(...ownedValues).first();allCheck();targetGraph();return !!r;};
    try{await request(env,b,desired===1?'PUT':'DELETE',`/guilds/${plan.guildId}/members/${subject}/roles/${role}`,final,()=>{allCheck();targetGraph();started=true;},canonical233MigrationRoleOnly);}
    catch{await env.DB.prepare(`UPDATE role_settlements SET state=?${at+1},reason=?${at+2},checked_at=${DB_NOW} WHERE ${owned} AND state='dispatching'`).bind(...ownedValues,started?'unknown':'held',started?'canonical233_migration_outcome_unknown':'canonical233_migration_never_dispatched').run();return result(started?'unknown':'held',started?'canonical233_migration_outcome_unknown':'canonical233_migration_never_dispatched',id);}
    const after=await member(env,b,subject);allCheck();if(!after||!launch230Member(after,subject)||after.roles.includes(role)!==(desired===1))throw Error('canonical233_migration_confirmation');
    const afterRoles=filtered(after)!,wanted=desired===1?[...new Set([...expected,role])].sort():expected.filter(r=>r!==role);if(JSON.stringify(afterRoles)!==JSON.stringify(wanted))throw Error('canonical233_migration_current_roles_changed');
    const ack=await launch230NativeIntent(env,env.DB.prepare(`${facts}UPDATE role_settlements SET state='settled',reason='${desired===1?'canonical233_migration_put_acknowledged_and_confirmed':'canonical233_migration_delete_acknowledged_and_confirmed'}',checked_at=${DB_NOW} WHERE ${canonical239And([...ownedClauses,"state='dispatching'",...guardClauses])} RETURNING *,NULL AS beta_window_id`).bind(...ownedValues),allCheck);allCheck();ack.check();
    if(!ack.intent||ack.intent.id!==id)throw Error('canonical233_migration_receipt_unknown');
    completedRows.push(Object.freeze(Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,ack.intent![k]]))));receiptChecks.push(()=>{q.check();c.check();ack.check();});
    expected.splice(0,expected.length,...wanted);
    if(desired===1){targetOwned=true;stageId=id;stageNonce=nonce;const originalCheck=()=>{check();q.check();c.check();ack.check();};stageCheck=originalCheck;}
    return result('settled',desired===1?'canonical233_migration_put_acknowledged_and_confirmed':'canonical233_migration_delete_acknowledged_and_confirmed',id,now());
   }catch{
    if(id&&started){try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='canonical233_migration_confirmation_or_receipt_unknown',checked_at=${DB_NOW} WHERE id=?1 AND claim_nonce=?2 AND state IN('dispatching','settled')`).bind(id,nonce).run();}catch{}return result('unknown','canonical233_migration_confirmation_or_receipt_unknown',id);}
    return result('held','canonical233_migration_original_admission_held',id);
   }
  };
  const target=await run(entry.targetRole,1);outcomes.push(target);if(target.state!=='settled')return done(target.state,target.reason);
  for(const role of remaining.slice(0,2)){const r=await run(role,0);outcomes.push(r);if(r.state!=='settled')return done(r.state,r.reason);remaining.splice(remaining.indexOf(role),1);}
  if(remaining.length)return done('held','canonical233_migration_continuation_required');
  reservationCheck();stageCheck();for(const c of receiptChecks)c();const finalMember=await member(env,b,subject);reservationCheck();stageCheck();for(const c of receiptChecks)c();
  const finalGraph=launch230MemberWitness(finalMember,subject);finalGraph();if(!finalMember||JSON.stringify(filtered(finalMember))!==JSON.stringify(expected))return done('held','canonical239_final_family_unconfirmed');
  const birthAt=reserveValues.length+1,receiptsAt=birthAt+1,releaseValues=[...reserveValues,reserveBirth,JSON.stringify(completedRows),completedRows.length],liveReservation=canonical239ReservationRow('role_settlements','?1','?6','?'+birthAt,'?2','?3','?5','?8');
  const exactReceipts=`json_array_length(?${receiptsAt})=?${receiptsAt+1} AND NOT EXISTS(SELECT 1 FROM json_each(?${receiptsAt}) expected239 LEFT JOIN role_settlements actual239 ON actual239.id=json_extract(expected239.value,'$.id') WHERE NOT(${canonical239And(RETIREMENT_PARENT_FIELDS.map(k=>`actual239.${k} IS json_extract(expected239.value,'$.${k}')`))}))`;
  release='unconfirmed';try{const closed=await launch230NativeIntent(env,env.DB.prepare(`${reserveFacts}UPDATE role_settlements SET state='held',reason='canonical239_reservation_released',checked_at=${DB_NOW} WHERE ${canonical239And([canonical239And([liveReservation,...reserveClauses]),`(${exactReceipts})`])} RETURNING *,NULL AS beta_window_id`).bind(...releaseValues),()=>{reservationCheck();stageCheck();finalGraph();for(const c of receiptChecks)c();});closed.check();reservationCheck();stageCheck();finalGraph();for(const c of receiptChecks)c();
   if(!closed.intent||closed.intent.id!==reservationId||closed.intent.state!=='held'||closed.intent.reason!=='canonical239_reservation_released'||closed.intent.attempts!==0||closed.intent.claim_nonce!==null||closed.intent.created_at!==reserveBirth||closed.intent.expires_at!==plan.expiresAt||closed.intent.request_digest!==digest||closed.intent.checked_at===null)return done('unknown','canonical239_reservation_release_unconfirmed');
   const releaseTuple=Object.freeze(Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,closed.intent![k]]))) as RetirementParent;closed.check();reservationCheck();originalReleaseTuple=releaseTuple;
   release='original_native_update';return done('settled','canonical233_migration_complete');
  }catch{return done('unknown','canonical239_reservation_release_unconfirmed');}
 }catch{return done('held','canonical233_migration_original_binding_held');}
 finally{active=false;}
}
