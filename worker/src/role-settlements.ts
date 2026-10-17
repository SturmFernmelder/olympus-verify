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
import { parseNativeRoleMap,mappedNativeRole,identifyNativeProfile,privilegedNativeMap } from './native-rank-adapter';
import { privacyGenerationFenceSql,readPrivacySubject,privacyProviderCustodyDatabase } from './privacy-serving-authority';
import { fenceSql } from './community-context';
import { isSiteAdmin } from './site-core';
import { BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS,type BetaGrantCapture } from './beta-reset-policy';

type Role={id:string;position:number;permissions:string;managed:boolean};
type Member={roles:string[];user:{id:string}};
type Intent={beta_window_id?:string|null;id:string;subject:string;purpose:string;proof_id:string|null;guild_id:string;role_id:string;desired:number;state:string;attempts:number;expires_at:number;roster_id:number|null;native_guid:string|null;native_profile:string|null;native_rank:number|null;native_rank_name:string|null;subject_generation:string|null;claim_nonce:string|null;created_at:number;request_digest:string|null;reason:string;checked_at:number|null};
export type Settlement=Readonly<{state:'settled'|'held'|'unknown';reason:string;operationId:string|null;checkedAt:number|null}>;
const result=(state:Settlement['state'],reason:string,operationId:string|null=null,checkedAt:number|null=null):Settlement=>({state,reason,operationId,checkedAt});
const ID=/^\d{17,20}$/;const TOKEN=/^[0-9a-f]{32}$/;
const now=()=>Math.floor(Date.now()/1000);
const budget=():AttemptBudget=>({limit:8,attempts:0,retries:0});
/** This path counts every network request and disables the legacy 429 retry. */
async function request<T>(env:Env,b:AttemptBudget,method:string,path:string,readAdmission?:()=>Promise<boolean>):Promise<T> {
 if(readAdmission&&method==='GET'&&!await readAdmission())throw Error('retirement_original_read_admission_changed');
 if(b.attempts>=b.limit)throw new Error('role_budget');b.attempts++;if('calls' in b)(b as AttemptBudget&{calls:number}).calls++;
 return rest<T>(env,method,path,undefined,1,'Olympus verified role settlement',b);
}
async function member(env:Env,b:AttemptBudget,subject:string,readAdmission?:()=>Promise<boolean>):Promise<Member|null> {
 try{return await request<Member>(env,b,'GET',`/guilds/${env.GUILD_ID}/members/${subject}`,readAdmission);}catch(e){if(e instanceof DiscordError&&e.status===404)return null;throw e;}
}
async function qualify(env:Env,b:AttemptBudget,subject:string,roleId:string,grant:boolean,cosmetic=false,otherRoles:readonly {id:string;cosmetic:boolean}[]=[],allowMissingRetired=false,readAdmission?:()=>Promise<boolean>) {
 if(!ID.test(env.GUILD_ID)||!ID.test(subject)||!ID.test(roleId)||!env.DISCORD_BOT_TOKEN)throw new Error('role_configuration');
 const me=await request<{id:string}>(env,b,'GET','/users/@me',readAdmission);if(!ID.test(env.DISCORD_APP_ID)||me.id!==env.DISCORD_APP_ID||me.id===subject)throw new Error('bot_identity');
 const roles=await request<Role[]>(env,b,'GET',`/guilds/${env.GUILD_ID}/roles`,readAdmission);
 const bot=await member(env,b,me.id,readAdmission),target=await member(env,b,subject,readAdmission);
 if(!Array.isArray(roles)||roles.length>250||!bot||!Array.isArray(bot.roles)||target&&!Array.isArray(target.roles))throw new Error('role_inventory');
 if(roles.some(r=>!ID.test(r.id)||!Number.isInteger(r.position)||typeof r.permissions!=='string'||!/^\d{1,32}$/.test(r.permissions)||typeof r.managed!=='boolean')||new Set(roles.map(r=>r.id)).size!==roles.length)throw new Error('role_inventory');
 const inventory=new Map(roles.map(r=>[r.id,r]));const botRoles=bot.roles.map(id=>inventory.get(id));if(botRoles.some(r=>!r))throw new Error('bot_inventory');
 const highest=Math.max(0,...botRoles.map(r=>r!.position));const permission=botRoles.reduce((v,r)=>v|BigInt(r!.permissions),BigInt(inventory.get(env.GUILD_ID)?.permissions||'0'));
 for(const requested of [{id:roleId,cosmetic},...otherRoles]){const wanted=inventory.get(requested.id);if(!wanted&&allowMissingRetired&&membershipTransitionEnabled(env)&&membershipTargets(env).retired===requested.id)continue;if(!wanted||wanted.managed||wanted.id===env.GUILD_ID||wanted.position>=highest||requested.cosmetic&&wanted.permissions!=='0'||!(permission&268435456n||permission&8n))throw new Error('role_hierarchy');}
 if(target){if(target.roles.some(id=>!inventory.has(id))||Math.max(0,...target.roles.map(id=>inventory.get(id)!.position))>=highest)throw new Error('target_hierarchy');}
 if(grant&&(!target||(env.BLOCKING_ROLE_IDS||'').split(',').map(x=>x.trim()).some(x=>x&&target.roles.includes(x))))throw new Error('server_restriction');
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
export async function queueRosterMembershipRole(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null):Promise<string>{
 if(!membershipSettlementEnabled(env))throw Error('membership_writer_disabled');
 const binding=membershipTargets(env);if(!ID.test(subject)||!ID.test(env.ROLE_GUILD_MEMBER||'')||capturedGeneration!==null&&!TOKEN.test(capturedGeneration))throw Error('membership_configuration');
 // Independent original snapshot facts share one native read proof; the consuming ROSTER_CURRENT remains unchanged.
 const facts=await env.DB.batch([env.DB.prepare('SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11').bind(snapshotId),env.DB.prepare(`SELECT r.guid,r.rank,r.rank_index FROM roster_members r JOIN characters c ON c.guid=r.guid AND c.discord_id=?1 WHERE r.snapshot_id=?2 AND c.status='member'`).bind(subject,snapshotId)]);
 const profile=identifyNativeProfile(facts[0]!.results as {rank:string;rank_index:number}[]),rows={results:facts[1]!.results as {guid:string;rank:string;rank_index:number}[]};
 if(rows.results.length!==1)throw Error('unique_native_guid_required');const r=rows.results[0]!,id=randomGeneration();
 if(!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,binding))throw Error('membership_configuration_changed');
 const args=[snapshotId,subject,r.guid,r.rank,r.rank_index,capturedGeneration,id,Number(env.LINKS_NOT_BEFORE||0),binding.guild,binding.current,profile];
 // A later genuinely fresh producer may dispose an operation that never dispatched. It cannot renew its deadline,
 // borrow its authority or retry an attempted/unknown write; the successor is a distinct operation captured here.
 const expired=`state='held' AND reason='expired_without_dispatch' AND attempts=0 AND expires_at<=${DB_NOW}`;
 await env.DB.batch([env.DB.prepare(`UPDATE role_settlements SET state='held',reason='expired_without_dispatch'
 WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10 AND guild_id=?9
 AND subject_generation IS ?6 AND native_guid=?3 AND native_profile=?11 AND native_rank=?5 AND native_rank_name=?4
 AND desired=1 AND state='pending' AND attempts=0 AND expires_at<=${DB_NOW} AND ${ROSTER_CURRENT}`).bind(...args),
 env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
 SELECT ?7,?2,'roster_membership',?9,?10,1,'pending','awaiting_dispatch',?6,${DB_NOW},${DB_NOW}+300,?1,?3,?11,?5,?4 WHERE ${ROSTER_CURRENT}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10 AND NOT(${expired}))`).bind(...args)]);
 const row=await env.DB.prepare(`SELECT id FROM role_settlements WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10
 AND guild_id=?9 AND subject_generation IS ?6 AND native_guid=?3 AND native_profile=?11 AND native_rank=?5 AND native_rank_name=?4
 AND NOT(${expired}) AND ${ROSTER_CURRENT}`).bind(...args).first<{id:string}>();if(!row)throw Error('membership_currentness_changed');return row.id;
}
/** Called by the existing roster acceptance path for one linked subject. No new cron/sweep or caller rank authority. */
export async function queueRosterRankRoles(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null):Promise<string[]> {
 if(env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true'||!ID.test(subject)||!Number.isSafeInteger(snapshotId))throw Error('rank_mapping_disabled_or_invalid');
 const s=await readPrivacySubject(env,subject);if(s&&(s.state!=='active'||s.subjectGeneration!==capturedGeneration)||!s&&capturedGeneration!==null)throw Error('subject_held');
 const profiles=await env.DB.prepare('SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11').bind(snapshotId).all<{rank:string;rank_index:number}>(),profile=identifyNativeProfile(profiles.results);
 const r=await env.DB.prepare(`SELECT r.guid,r.rank,r.rank_index FROM roster_members r JOIN characters c ON c.guid=r.guid AND c.discord_id=?1
 WHERE r.snapshot_id=?2 AND c.status='member'`).bind(subject,snapshotId).all<{guid:string;rank:string;rank_index:number}>();
 if(r.results.length!==1)throw Error('unique_native_guid_required');const row=r.results[0]!,desiredRows=await rankTargets(env,subject,profile,row.rank,row.rank_index),rows=desiredRows.map(([role,desired,purpose])=>({id:randomGeneration(),role,desired,purpose:purpose.replace('verified_','roster_')}));
 const args=[snapshotId,subject,row.guid,row.rank,row.rank_index,capturedGeneration,randomGeneration(),Number(env.LINKS_NOT_BEFORE||0),env.GUILD_ID,JSON.stringify(rows),profile];
 const expired=`state='held' AND reason='expired_without_dispatch' AND attempts=0 AND expires_at<=${DB_NOW}`;
 await env.DB.batch([env.DB.prepare(`UPDATE role_settlements SET state='held',reason='expired_without_dispatch'
 WHERE subject=?2 AND roster_id=?1 AND subject_generation IS ?6 AND guild_id=?9 AND native_guid=?3 AND native_rank_name=?4 AND native_rank=?5 AND native_profile=?11
 AND state='pending' AND attempts=0 AND expires_at<=${DB_NOW} AND purpose IN('roster_native_rank','roster_privileged_rank')
 AND EXISTS(SELECT 1 FROM json_each(?10)j WHERE role_id=json_extract(j.value,'$.role') AND desired=json_extract(j.value,'$.desired') AND purpose=json_extract(j.value,'$.purpose'))
 AND ${ROSTER_CURRENT}`).bind(...args),env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?9,json_extract(j.value,'$.role'),json_extract(j.value,'$.desired'),'pending','awaiting_dispatch',?6,${DB_NOW},${DB_NOW}+300,?1,?3,?11,?5,?4 FROM json_each(?10) j WHERE ${ROSTER_CURRENT}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=json_extract(j.value,'$.purpose') AND roster_id=?1 AND role_id=json_extract(j.value,'$.role') AND desired=json_extract(j.value,'$.desired') AND NOT(${expired}))`).bind(...args)]);
 const found=await env.DB.prepare(`SELECT id,role_id,desired,purpose FROM role_settlements WHERE subject=?2 AND roster_id=?1 AND purpose IN('roster_native_rank','roster_privileged_rank')
 AND guild_id=?9 AND subject_generation IS ?6 AND native_guid=?3 AND native_rank_name=?4 AND native_rank=?5 AND native_profile=?11 AND NOT(${expired}) AND ${ROSTER_CURRENT} AND ?10 IS NOT NULL LIMIT 28`).bind(...args).all<{id:string;role_id:string;desired:number;purpose:string}>();
 return rows.map(r=>{const matches=found.results.filter(x=>x.role_id===r.role&&x.desired===r.desired&&x.purpose===r.purpose);if(matches.length!==1)throw Error('rank_currentness_changed');return matches[0]!.id;});
}

function rankMap(env:QrEnv) {
 if(env.QR_RANK_MAPPING_ENABLED!=='true')throw new Error('rank_mapping_disabled');
 const v=parseNativeRoleMap(env.QR_NATIVE_ROLE_MAP);if(v.roles.includes(env.ROLE_GUILD_MEMBER||''))throw Error('rank_mapping_configuration');return v;
}
async function rankTargets(env:QrEnv,subject:string,profile:string,name:string,index:number):Promise<[string,number,string][]> {
 if(profile!=='beta-five'&&profile!=='ten-rank')throw Error('native_profile_mismatch');const out:[string,number,string][]=[];
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
export async function settleOwnedRoleBatch(env:QrEnv,ids:string[],actor:OriginalRoleActor,reconcileOnly=false){
 const owner=captureRoleActor(actor);actor=owner.actor;owner.check();if(!Array.isArray(ids)||ids.length<1||ids.length>2||ids.some(id=>!TOKEN.test(id))||new Set(ids).size!==ids.length)throw Error('operation_batch_invalid');
 const b:AttemptBudget={limit:16,attempts:0,retries:0},outcomes:Settlement[]=[];
 for(const id of ids){owner.check();const own=await env.DB.prepare(`SELECT 1 FROM role_settlements r LEFT JOIN verification_proofs p ON p.id=r.proof_id WHERE r.id=?1
 AND ((p.signer=?2 OR p.requester=?2) OR (r.subject=?2 AND r.purpose IN('roster_native_rank','roster_privileged_rank'))) AND ?4>${DB_NOW}
 AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND session_version=?3 AND in_server=1 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',actor.n)}) AND ${privacyGenerationFenceSql(2,5)}`).bind(id,actor.id,actor.v,actor.e,actor.g).first();
 owner.check();if(!own)throw Error('operation_not_owned');const r=await settleRoleIntent(env,id,reconcileOnly,actor,b);owner.check();outcomes.push(r);if(r.state!=='settled')break;}
 return {outcomes,attempts:b.attempts,limit:b.limit,remaining:ids.slice(outcomes.length)};
}
/** Frozen purpose and role are derived from verified proof + server configuration, never submitted role ids. */
export async function queueProofRoles(env:QrEnv,proofId:string):Promise<string[]> {
 requireQr(env);if(!TOKEN.test(proofId)||!ID.test(env.ROLE_GUILD_MEMBER||''))throw new Error('proof_configuration');
 const betaOriginal=betaGrantConfiguration(env);
 const membershipBinding=membershipTransitionEnabled(env)?membershipTargets(env):undefined;
 const nativeProof=await env.DB.prepare('SELECT requester,requester_guid,native_rank,rank_name,native_profile,beta_window_id FROM verification_proofs WHERE id=?1').bind(proofId).first<{requester:string;requester_guid:string;native_rank:number;rank_name:string;native_profile:string}>();
 if(!nativeProof)throw new Error('proof_stale');const fields=['requester','requester_guid','native_rank','rank_name','native_profile','beta_window_id'] as const,copied:Record<string,unknown>={};for(const k of fields){const d=Object.getOwnPropertyDescriptor(nativeProof,k);if(!d||!Object.hasOwn(d,'value')||d.get||d.set)throw new Error('proof_original_row_held');copied[k]=d.value;}const p=Object.freeze(copied) as unknown as Readonly<{requester:string;requester_guid:string;native_rank:number;rank_name:string;native_profile:string;beta_window_id:string|null}>;if(!await proofCurrent(env,proofId,p.requester,betaOriginal))throw new Error('proof_stale');
 const desired:[string,number,string][]=[[membershipBinding?.current??env.ROLE_GUILD_MEMBER!,1,'verified_membership']];
 if(p.beta_window_id===null)desired.push(...await rankTargets(env,p.requester,p.native_profile,p.rank_name,p.native_rank));else{if(!betaOriginal?.enabled||p.beta_window_id!==betaOriginal.windowId||desired[0]![0]!==betaOriginal.membershipRole)throw Error('beta_membership_only');assertBetaConfiguration(betaOriginal);}
 // One bounded source-owned json_each INSERT, not one DB round trip per role. No caller role values enter it.
 const rows=desired.map(([role,wanted,purpose])=>({id:randomGeneration(),role,wanted,purpose}));
 if(membershipBinding&&!membershipTargetsCurrent(env,membershipBinding))throw Error('membership_configuration_changed');
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,created_at,expires_at,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?1,?4,json_extract(j.value,'$.role'),json_extract(j.value,'$.wanted'),'pending','awaiting_dispatch',${DB_NOW},CASE WHEN ?8 IS NULL THEN ${DB_NOW}+300 ELSE MIN(${DB_NOW}+300,(SELECT expires_at FROM verification_proofs deadline WHERE deadline.id=?1)) END,?5,?6,?7 FROM json_each(?3) j WHERE ${PROOF_CURRENT} AND ${betaProofPurposeSql(betaOriginal)} AND (?8 IS NULL OR (EXISTS(SELECT 1 FROM verification_proofs bproof WHERE bproof.id=?1 AND bproof.beta_window_id=?8) AND json_extract(j.value,'$.purpose')='verified_membership' AND json_extract(j.value,'$.wanted')=1 AND json_extract(j.value,'$.role')=?9)) AND EXISTS(SELECT 1 FROM verification_proofs exact WHERE exact.id=?1 AND exact.requester=?2 AND exact.native_profile=?5 AND exact.native_rank=?6 AND exact.rank_name=?7)
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
export async function settleRoleIntent(env:QrEnv,id:string,reconcileOnly=false,actor?:OriginalRoleActor,b:AttemptBudget=budget(),originalBetaCapture?:BetaGrantCapture):Promise<Settlement> {
 const betaOriginal=betaGrantConfiguration(env);
 const owner=actor?captureRoleActor(actor):null;actor=owner?.actor;owner?.check();if(!membershipSettlementEnabled(env)&&env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true')return result('held','features_disabled');if(!TOKEN.test(id))return result('held','invalid_operation');
 // Both lookups are keyed by the original operation id and have no intervening effect.
 owner?.check();const facts=await env.DB.batch([env.DB.prepare('SELECT r.*,(SELECT beta_window_id FROM verification_proofs p WHERE p.id=r.proof_id) AS beta_window_id FROM role_settlements r WHERE r.id=?1').bind(id),env.DB.prepare("SELECT id,reason FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 AND desired=0 AND attempts=1").bind(id)]);
 let original:ReturnType<typeof captureOriginalSettlementFacts>;
 try{original=captureOriginalSettlementFacts(facts,env);owner?.check();}catch(error){if(error instanceof OriginalSettlementFactsHeld)return result('held','original_role_facts_changed',id);throw error;}
 const i=original.intent,compensation=original.compensation;
 if(!i||i.guild_id!==env.GUILD_ID)return result('held','operation_not_current',id);
 const betaScoped=i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id);
 const check=()=>{original.check();owner?.check();if(!providerEffectStarted&&!compensation&&i.desired===1&&i.beta_window_id!==null&&i.beta_window_id!==undefined){if(!betaOriginal?.enabled||i.beta_window_id!==betaOriginal.windowId||i.purpose!=='verified_membership'||i.role_id!==betaOriginal.membershipRole)throw new OriginalSettlementFactsHeld();try{assertBetaConfiguration(betaOriginal);}catch{throw new OriginalSettlementFactsHeld();}}};
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
 let guard=base.sql+` AND ?${base.nonce} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') AND id<>?${base.id})`;if(actor){const start=base.values.length+1;base.values.push(actor.id,actor.v,actor.e,actor.g);guard+=` AND ?${start+2}>${DB_NOW} AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?${start} AND session_version=?${start+1} AND in_server=1 AND ${privacyAccountIncarnationLiteralFenceSql('account_incarnation',actor.n)}) AND ${privacyGenerationFenceSql(start,start+3)}`;}
  if(betaCapture&&betaPolicy){const reset=betaPolicy.betaGrantSql(betaCapture,base.values.length+1);guard+=` AND (${reset.sql})`;base.values.push(...reset.values);}
 if(i.desired===1&&/^(verified|roster)_(native|privileged)_rank$/.test(i.purpose))guard+=` AND NOT EXISTS(SELECT 1 FROM role_settlements old JOIN role_settlements current ON current.id=?${base.id} WHERE old.subject=current.subject AND old.desired=0 AND old.state<>'settled' AND old.purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank') AND ((current.proof_id IS NOT NULL AND old.proof_id=current.proof_id) OR (current.roster_id IS NOT NULL AND old.roster_id=current.roster_id))
 AND NOT(current.proof_id IS NULL AND old.proof_id IS NULL AND current.roster_id IS NOT NULL
 AND old.purpose IN('roster_native_rank','roster_privileged_rank') AND old.state='held' AND old.reason='expired_without_dispatch' AND old.attempts=0 AND old.expires_at<=${DB_NOW}
 AND old.guild_id=current.guild_id AND old.subject_generation IS current.subject_generation AND old.native_guid IS current.native_guid
 AND old.native_profile IS current.native_profile AND old.native_rank IS current.native_rank AND old.native_rank_name IS current.native_rank_name))`;
 if(membershipBinding&&(!reconcileOnly&&!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,membershipBinding)))return result('held','frozen_configuration_changed',id);
 const update=(set:string,extra='')=>{check();return env.DB.prepare(`UPDATE role_settlements SET ${set} WHERE id=?${base.id} AND ${guard} ${extra} RETURNING id`).bind(...base.values);};
 const present=!!target?.roles.includes(i.role_id);
 if(present===(i.desired===1)){
 const r=await checked(()=>update(`state='settled',reason='fresh_server_confirmed',checked_at=${DB_NOW}`).first());
 return r?result('settled','fresh_server_confirmed',id,now()):result('held','proof_changed_before_receipt',id);}
 if(reconcileOnly||i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',id,now());
 const claimed=await checked(()=>update(`state='dispatching',attempts=1,claim_nonce=?${base.nonce},reason='dispatching'`,`AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}`).first());
 check();if(!claimed)return result('held','claim_changed',id);
 if(!await checked(()=>update("reason='admitted_before_effect'",`AND claim_nonce=?${base.nonce} AND state='dispatching'`).first()))return result('held','proof_changed_before_effect',id);
 if(membershipBinding&&(!reconcileOnly&&!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,membershipBinding)))return result('held','frozen_configuration_changed',id);
 if(betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return result('held','beta_grant_policy_changed',id);
 try{check();providerEffectStarted=true;await checked(()=>request(env,b,effectMethod,effectPath));}catch(cause){
 // A changed original Native witness cannot authorize more reset reads or compensation. Preserve the original
 // exact id/nonce unknown-receipt update below instead of throwing before recording that spent uncertainty.
 if(!(cause instanceof OriginalSettlementFactsHeld)&&betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return await checked(()=>compensateGrant(env,b,i,nonce,false,false));
 await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_outcome_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(id,nonce).run();return result('unknown','provider_outcome_unknown',id);}
 // Even a 204 is not completion until current server state and admission are checked again.
 try{check();const after=await checked(()=>member(env,b,i.subject));check();const restricted=!!after&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&after.roles.includes(r.trim()));
 if(i.desired===1&&after?.roles.includes(i.role_id)&&(!await checked(()=>intentCurrent(env,i,betaOriginal))||restricted||membershipBinding&&(!membershipSettlementEnabled(env)||!membershipTargetsCurrent(env,membershipBinding))||betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture))))return await checked(()=>compensateGrant(env,b,i,nonce));
 if(!!after?.roles.includes(i.role_id)!==(i.desired===1))throw Error('changed');
 const r=await checked(()=>update(`state='settled',reason='effect_and_current_server_confirmed',checked_at=${DB_NOW}`,`AND claim_nonce=?${base.nonce}`).first());
 if(i.beta_window_id&&i.desired===1&&after?.roles.includes(i.role_id)){let originalBeta=false;try{if(betaOriginal){assertBetaConfiguration(betaOriginal);const at=Date.now();originalBeta=Number.isSafeInteger(at)&&at<i.expires_at*1000;}}catch{}if(!originalBeta)return await checked(()=>compensateGrant(env,b,i,nonce));}
 if(!r&&i.desired===1&&after?.roles.includes(i.role_id))return await checked(()=>compensateGrant(env,b,i,nonce));
 if(!r)throw Error('changed');return result('settled','effect_and_current_server_confirmed',id,now());
 }catch(cause){if(!(cause instanceof OriginalSettlementFactsHeld)&&i.desired===1&&betaCapture&&betaPolicy&&!await checked(()=>betaPolicy.betaGrantCurrent(env,betaCapture)))return await checked(()=>compensateGrant(env,b,i,nonce,true));
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
async function compensateGrant(env:Env,b:AttemptBudget,i:Intent,parentNonce:string,betaReceiptReplyLost=false,putAcknowledged=true):Promise<Settlement>{
 const id=randomGeneration(),nonce=randomGeneration(),betaScoped=i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id);
 const ack=putAcknowledged?'acknowledged':'unknown';
 const claimed=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,claim_nonce,attempts,created_at,expires_at)
 SELECT ?1,subject,'grant_compensation',guild_id,role_id,0,'dispatching',?6,id,?3,1,${DB_NOW},${DB_NOW}+300 FROM role_settlements
  WHERE id=?2 AND claim_nonce=?4 AND (state='dispatching' OR (state='settled' AND ((?5=1 AND reason='effect_and_current_server_confirmed') OR EXISTS(SELECT 1 FROM verification_proofs beta_parent WHERE beta_parent.id=role_settlements.proof_id AND beta_parent.beta_window_id IS NOT NULL)))) AND desired=1 AND attempts=1
  AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?2) RETURNING id`).bind(id,i.id,nonce,parentNonce,Number(betaReceiptReplyLost),betaScoped?'beta_'+ack+'_put_cleanup':'admission_lost').first();
 if(!claimed)return result('unknown','compensation_claim_held',i.id);
 try{await request(env,b,'DELETE',`/guilds/${i.guild_id}/members/${i.subject}/roles/${i.role_id}`);const after=await member(env,b,i.subject);if(after?.roles.includes(i.role_id))throw Error();
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
 if(b.limit-b.attempts<6)return result('held','role_request_budget',id);
 let i=first,target:Member|null;
 const original=(row:Intent)=>JSON.stringify(row);
 // Tuple equality uses the original row, including its nonce, so concurrent continuations cannot adopt it.
 const owned=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose='beta_reset' AND desired=0 AND request_digest=?5
 AND state=json_extract(?6,'$.state') AND attempts=json_extract(?6,'$.attempts') AND claim_nonce IS json_extract(?6,'$.claim_nonce')
 AND reason=json_extract(?6,'$.reason') AND created_at=json_extract(?6,'$.created_at') AND expires_at=json_extract(?6,'$.expires_at')`;
 const values=(row:Intent)=>[row.id,row.subject,row.guild_id,row.role_id,digest,original(row)];
 // Each qualification GET repeats policy plus the exact original live scan in one SQL read.
 try{target=await qualify(env,b,i.subject,i.role_id,false,false,[],false,readAdmission);}catch{
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
   WHERE ${owned} AND ${g.sql} AND attempts=0 AND NOT EXISTS(SELECT 1 FROM role_settlements other
   WHERE other.subject=?2 AND other.guild_id=?3 AND other.role_id=?4 AND other.purpose='beta_reset' AND other.id<>?1
   AND other.attempts=1 AND other.state IN('dispatching','unknown')) RETURNING *`).bind(...transfer),
  env.DB.prepare(`UPDATE role_settlements SET state='held',reason='beta_reset_observation_consumed',checked_at=${DB_NOW}
   WHERE ${owned} AND ${g.sql} AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?7 AND reason='beta_reset_fresh_target')`).bind(...transfer)
 ]);
 const successor=next[0]?.results[0] as Intent|undefined;if(!successor)return result('held','beta_reset_transfer_held',i.id);i=successor;
 const nonce=randomGeneration(),claimGuard=guard(8),claim=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?7,reason='beta_reset_dispatching'
  WHERE ${owned} AND attempts=0 AND expires_at>${DB_NOW} AND ${claimGuard.sql} RETURNING *`).bind(...values(i),nonce,...claimGuard.values).first<Intent>();
 if(!claim)return result('held','beta_reset_claim_held',i.id);i=claim;
 const finalGuard=guard(7);
 if(!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${owned}
  AND state='dispatching' AND attempts=1 AND expires_at>${DB_NOW} AND ${finalGuard.sql}`).bind(...values(i),...finalGuard.values).first()
  ||!policy.betaResetEnvironmentCurrent(env,captured))return result('held','beta_reset_effect_held',i.id);
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
export async function settleVerifiedRemoval(env:Env,subject:string,purpose:RemovalPurpose,b:AttemptBudget=budget(),capturedGeneration?:string|null,targetRole?:string,originalOwned?:Intent):Promise<Settlement>{
 if(!membershipSettlementEnabled(env))return result('held','membership_writer_disabled');
 let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{return result('held','removal_configuration');}const role=targetRole??binding.current;
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
 const operation=randomGeneration();
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,created_at,expires_at,subject_generation)
 SELECT ?1,?2,?3,?4,?5,0,'pending','awaiting_dispatch',${DB_NOW},${DB_NOW}+300,?6 WHERE ${predicate}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5 AND state<>'settled')`).bind(...values([operation,subject,purpose,env.GUILD_ID,role])).run();
 const i=await env.DB.prepare("SELECT * FROM role_settlements WHERE subject=?1 AND purpose=?2 AND guild_id=?3 AND role_id=?4 AND state<>'settled' ORDER BY created_at,id LIMIT 1").bind(subject,purpose,env.GUILD_ID,role).first<Intent>();if(!i)return result('held','removal_intent_held');
 if(i.subject_generation!==capturedGeneration)return result('held','original_removal_generation_changed',i.id);
 if(i.guild_id===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(i.role_id)&&i.attempts===1&&['dispatching','unknown'].includes(i.state))return result('unknown','beta_original_removal_unconfirmed',i.id);
 const settle=async()=>!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='absent',checked_at=${DB_NOW} WHERE id=?1 AND subject=?2 AND ${predicate} RETURNING id`).bind(...values([i.id,subject])).first();
 if(!target?.roles.includes(role))return await settle()?result('settled','absent',i.id,now()):result('held','removal_cause_withdrawn',i.id);
 if(i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',i.id);
 // Blocking-role authority is a fresh current server observation, not an interaction's stale roles hint.
 if(purpose==='blocking_role'){try{target=await member(env,b,subject);}catch{return result('held','current_server_unknown',i.id);}if(!blocker(target))return result('held','removal_cause_withdrawn',i.id);}
 const nonce=randomGeneration(),claim=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',claim_nonce=?3,attempts=1,reason='dispatching'
 WHERE id=?1 AND subject=?2 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${predicate} RETURNING id`).bind(...values([i.id,subject,nonce])).first();if(!claim)return result('held','removal_cause_withdrawn',i.id);
 const finalValues=values([role,subject],[i.id,nonce,i.created_at,i.expires_at,binding.guild,purpose]);
 if(!membershipTargetsCurrent(env,binding)||!await env.DB.prepare(`SELECT 1 WHERE ?1 IS NOT NULL AND ?2 IS NOT NULL AND ${predicate}
 AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?8 AND subject=?2 AND role_id=?1 AND guild_id=?12 AND purpose=?13 AND subject_generation IS ?6 AND desired=0 AND state='dispatching' AND attempts=1 AND claim_nonce=?9 AND created_at=?10 AND expires_at=?11 AND expires_at>${DB_NOW})`).bind(...finalValues).first())return result('held','removal_cause_withdrawn',i.id);
 try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${subject}/roles/${role}`);const after=await member(env,b,subject);if(after?.roles.includes(role)||!await settle())throw Error();return result('settled','removed',i.id,now());
 }catch{await env.DB.prepare("UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?2").bind(i.id,nonce).run();return result('unknown','provider_or_confirmation_unknown',i.id);}
}
export const settleGuildDepartureRole=(env:Env,subject:string,capture:{subjectGeneration:string|null},b?:AttemptBudget)=>settleVerifiedRemoval(env,subject,'guild_departure',b,capture.subjectGeneration);
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
export async function settleMembershipRemoval(env:Env,subject:string,purpose:RemovalPurpose,capture?:{subjectGeneration:string|null},b:AttemptBudget={limit:16,attempts:0,retries:0}):Promise<Settlement>{
 if(!membershipTransitionEnabled(env))return settleVerifiedRemoval(env,subject,purpose,b,capture?.subjectGeneration);
 if(!capture||!Object.hasOwn(capture,'subjectGeneration'))return result('held','original_removal_generation_required');
 let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{return result('held','removal_configuration');}
 const targets=[binding.current];let owned:Intent|null=null;if(binding.retired){
  owned=await env.DB.prepare(`SELECT *, (SELECT q.id FROM role_settlements q WHERE q.subject=?1 AND q.guild_id=?2 AND q.purpose=?5 AND q.role_id IN(?6,?3)
  AND q.desired=0 AND q.attempts=1 AND q.state IN('dispatching','unknown') ORDER BY q.created_at,q.id LIMIT 1) AS original_remove_id FROM role_settlements WHERE subject=?1 AND guild_id=?2 AND role_id=?3
  AND purpose='roster_membership' AND proof_id IS NULL AND desired=1 AND attempts=1 AND claim_nonce IS NOT NULL
  AND subject_generation IS ?4 AND state IN('settled','dispatching','unknown') ORDER BY created_at,id LIMIT 1`).bind(subject,binding.guild,binding.retired,capture.subjectGeneration,purpose,binding.current).first<Intent>();
  if(owned)targets.push(binding.retired);
  }
  if(b.limit-b.attempts<8*targets.length)return result('held','role_request_budget');
  if(owned&&binding.retired)return settleOwnedMembershipPair(env,subject,purpose,capture.subjectGeneration,b,binding,owned);
 let last: Settlement=result('held','removal_unconfirmed');
 for(const role of targets){if(!membershipTargetsCurrent(env,binding))return result('held','frozen_configuration_changed');
 last=await settleVerifiedRemoval(env,subject,purpose,b,capture.subjectGeneration,role,role===binding.retired?owned!:undefined);if(last.state!=='settled')return last;}
  return last;
}
/** One fixed two-target qualification and one native fresh-operation claim group.
 * The two receipts retain independent final proofs, original deadlines and GET-only unknown custody.
 * Sharing this source-bound admission group avoids charging four transport statements for each INSERT/claim.
 */
async function settleOwnedMembershipPair(env:Env,subject:string,purpose:RemovalPurpose,g:string|null,b:AttemptBudget,binding:ReturnType<typeof membershipTargets>,owned:Intent):Promise<Settlement>{
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
 const plans=active.map(role=>({role,id:randomGeneration(),nonce:randomGeneration()}));
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
 return last;
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
async function retireAttendedMembershipRole(env:Env,grantId:string,capture:{subjectGeneration:string|null},b:AttemptBudget,a:AttendedRetirementAdmission):Promise<Settlement>{
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
 if(b.limit-b.attempts<8)return result('held','role_request_budget');
 const readAdmission=async()=>live()&&!!await env.DB.prepare(`SELECT 1 WHERE ${original} AND ?1 IS NOT NULL AND ?10 IS NOT NULL AND ?12 IS NOT NULL AND ?13 IS NOT NULL`).bind(...args).first();
 let target:Member|null;try{target=await qualify(env,b,p.subject,binding.retired,false,false,[{id:binding.current,cosmetic:true}],true,readAdmission);}catch{return result('held','retirement_inventory_hold');}
 if(!target?.roles.includes(binding.current)||!live())return result('held','retirement_replacement_not_current');
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
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='membership_retirement_dispatching' WHERE ${pending} RETURNING id`).bind(...args).first();
 if(!claimed||!live()||!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${dispatching} AND ?13>${DB_NOW} AND ${original}`).bind(...args).first())return result('held','retirement_original_admission_changed',id);
 // All following writes are response-only, exact original spent custody. No original admission is refreshed.
 const response=`${dispatching} AND ${originalParent}`,responseArgs=args.slice(0,13);
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
export async function retireOwnedMembershipRole(env:Env,grantId:string,capture:{subjectGeneration:string|null},b:AttemptBudget=budget(),admission?:AttendedRetirementAdmission):Promise<Settlement>{
 if(admission)return retireAttendedMembershipRole(env,grantId,capture,b,admission);
 if(!membershipTransitionEnabled(env)||!TOKEN.test(grantId)||!capture||!Object.hasOwn(capture,'subjectGeneration'))return result('held','retirement_admission_required');
 let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{return result('held','retirement_configuration');}
 if(!binding.retired)return result('held','retirement_binding_absent');
 const parent=await env.DB.prepare("SELECT * FROM role_settlements WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND purpose='roster_membership' AND proof_id IS NULL AND desired=1 AND attempts=1 AND state='settled' AND claim_nonce IS NOT NULL AND subject_generation IS ?4").bind(grantId,binding.guild,binding.retired,capture.subjectGeneration).first<Intent>();
 if(!parent)return result('held','retirement_original_grant_not_owned');
 const existing=await env.DB.prepare("SELECT * FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 ORDER BY created_at,id LIMIT 1").bind(grantId).first<Intent>();
 if(existing){if(!existing.reason.startsWith('membership_retirement')||existing.guild_id!==parent.guild_id||existing.role_id!==parent.role_id||existing.subject!==parent.subject||existing.subject_generation!==capture.subjectGeneration)return result('held','retirement_original_receipt_changed');
  if(existing.attempts===1)return reconcileRemovalReceipt(env,existing.id,b);return result('held','retirement_prior_unspent_hold',existing.id);}
 if(b.limit-b.attempts<8)return result('held','role_request_budget');
 let target:Member|null;try{target=await qualify(env,b,parent.subject,binding.retired,false,false,[{id:binding.current,cosmetic:true}]);}catch{return result('held','retirement_inventory_hold');}
 if(!target?.roles.includes(binding.current)||!membershipTargetsCurrent(env,binding))return result('held','retirement_replacement_not_current');
 const id=randomGeneration(),nonce=randomGeneration();
 const args=[id,parent.subject,parent.id,parent.guild_id,parent.role_id,capture.subjectGeneration,parent.claim_nonce,parent.created_at,parent.expires_at,nonce,JSON.stringify(parent)];
 const parentFields=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','claim_nonce','subject_generation','created_at','expires_at','request_digest','roster_id','native_guid','native_profile','native_rank','native_rank_name','reason','checked_at'];
 const original=`EXISTS(SELECT 1 FROM role_settlements p WHERE p.id=?3 AND p.subject=?2 AND p.guild_id=?4 AND p.role_id=?5 AND p.purpose='roster_membership' AND p.proof_id IS NULL AND p.desired=1 AND p.attempts=1 AND p.state='settled' AND p.claim_nonce=?7 AND p.created_at=?8 AND p.expires_at=?9 AND p.subject_generation IS ?6 AND ${parentFields.map(k=>`p.${k} IS json_extract(?11,'$.${k}')`).join(' AND ')}) AND ${privacyGenerationFenceSql(2,6)}`;
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
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?10,reason='membership_retirement_dispatching' WHERE ${pending} RETURNING id`).bind(...args).first();
 if(!claimed||!membershipTargetsCurrent(env,binding)||!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${guarded} AND ?10 IS NOT NULL AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?1 AND state='dispatching' AND attempts=1 AND claim_nonce=?10)`).bind(...args).first())return result('held','retirement_original_cause_changed',id);
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
 const r=row.desired===0?await reconcileRemovalReceipt(env,row.id,b):await settleRoleIntent(env,row.id,true,undefined,b);outcomes.push(r);
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
export async function settleErasure(env:Env,proof:ErasureProof,b:AttemptBudget=budget()) {
 proof=originalErasureRoleProof(proof);
 const authority=await import('./privacy-serving-authority');
 const held={state:'held' as const,checkedAt:null,staffAccess:'unknown' as const};
 if(proof.purpose!=='account_erasure'||!ID.test(proof.subject)||!TOKEN.test(proof.operationId)||!TOKEN.test(proof.subjectGeneration)||!/^[0-9a-f]{64}$/.test(proof.requestDigest)||!env.ROLE_GUILD_MEMBER)return held;
 const p=[proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest];
 // Original current proof, frozen intent creation and its readback are one native snapshot.
 // A repeated request cannot replace its intent or renew its expiry.
 const facts=await env.DB.batch([env.DB.prepare(`SELECT (${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})) AS current`).bind(...p),env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at)
 SELECT ?1,?2,'account_erasure',?5,?6,0,'pending','awaiting_dispatch',?3,?4,${DB_NOW},${DB_NOW}+300 WHERE ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)})
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
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?5,reason='dispatching'
 WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}
 AND ${authority.CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${authority.originalErasureJobBirthSql(proof)}) RETURNING id`).bind(...p,nonce).first();
 if(!claimed||!await authority.currentAccountErasureProof(env,proof))return held;
 const unknown=async()=>{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(proof.operationId,nonce).run();return {state:'unknown' as const,checkedAt:null,staffAccess};};
 try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${proof.subject}/roles/${env.ROLE_GUILD_MEMBER}`);
 const after=await member(env,b,proof.subject);if(after?.roles.includes(env.ROLE_GUILD_MEMBER)||!await authority.currentAccountErasureProof(env,proof))return unknown();
 return await settle('removed')?{state:'removed' as const,checkedAt:now(),staffAccess}:unknown();
 }catch{return unknown();}
}
