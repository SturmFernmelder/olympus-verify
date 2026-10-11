/** Central audited writer for new QR/rank and erasure effects. Existing legacy writers are not silently activated here.
 * Each intent is durable before HTTP, one CAS dispatch only. Unknown responses are reconciled by GET, never re-POSTed.
 */
import type { Env } from './env';
import { membershipSettlementEnabled,membershipTransitionEnabled,membershipTargets,membershipTargetsCurrent } from './membership-role-transition';
import { rest, DiscordError, type AttemptBudget } from './discord';
import { DB_NOW, randomGeneration } from './account-generation-contracts';
import { requireQr, type QrEnv, SIGNER_CURRENT } from './qr-phase1';
import { parseNativeRoleMap,mappedNativeRole,identifyNativeProfile,privilegedNativeMap } from './native-rank-adapter';
import { privacyGenerationFenceSql,readPrivacySubject,privacyProviderCustodyDatabase } from './privacy-serving-authority';
import { fenceSql } from './community-context';
import { isSiteAdmin } from './site-core';

type Role={id:string;position:number;permissions:string;managed:boolean};
type Member={roles:string[];user:{id:string}};
type Intent={id:string;subject:string;purpose:string;proof_id:string|null;guild_id:string;role_id:string;desired:number;state:string;attempts:number;expires_at:number;roster_id:number|null;native_guid:string|null;native_profile:string|null;native_rank:number|null;native_rank_name:string|null;subject_generation:string|null;claim_nonce:string|null;created_at:number;request_digest:string|null;reason:string;checked_at:number|null};
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
 AND p.rowid=(SELECT MAX(newest.rowid) FROM verification_proofs newest WHERE newest.requester=p.requester)
 AND ${SIGNER_CURRENT.replace(/\?1\b/g,'p.key_id').replace(/\?2\b/g,'p.signer')}
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
async function proofCurrent(env:Env,proof:string,subject:string) {return !!await env.DB.prepare(`SELECT 1 WHERE ${PROOF_CURRENT}`).bind(proof,subject).first();}
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
async function intentCurrent(env:Env,i:Intent){return i.proof_id?proofCurrent(env,i.proof_id,i.subject):['roster_native_rank','roster_privileged_rank','roster_membership'].includes(i.purpose)&&!!await env.DB.prepare(`SELECT 1 WHERE ${ROSTER_CURRENT}`).bind(...rosterParams(env,i)).first();}
export async function queueRosterMembershipRole(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null):Promise<string>{
 if(!membershipSettlementEnabled(env))throw Error('membership_writer_disabled');
 const binding=membershipTargets(env);if(!ID.test(subject)||!ID.test(env.ROLE_GUILD_MEMBER||'')||capturedGeneration!==null&&!TOKEN.test(capturedGeneration))throw Error('membership_configuration');
 const profiles=await env.DB.prepare('SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11').bind(snapshotId).all<{rank:string;rank_index:number}>(),profile=identifyNativeProfile(profiles.results);
 const rows=await env.DB.prepare(`SELECT r.guid,r.rank,r.rank_index FROM roster_members r JOIN characters c ON c.guid=r.guid AND c.discord_id=?1 WHERE r.snapshot_id=?2 AND c.status='member'`).bind(subject,snapshotId).all<{guid:string;rank:string;rank_index:number}>();
 if(rows.results.length!==1)throw Error('unique_native_guid_required');const r=rows.results[0]!,id=randomGeneration();
 if(!membershipTargetsCurrent(env,binding))throw Error('membership_configuration_changed');
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
/** One HTTP request handles at most two admitted effects (16 actual calls). Unknown/held stops continuation. */
export async function settleOwnedRoleBatch(env:QrEnv,ids:string[],actor:{id:string;v:number;e:number;g:string|null},reconcileOnly=false){
 if(!Array.isArray(ids)||ids.length<1||ids.length>2||ids.some(id=>!TOKEN.test(id))||new Set(ids).size!==ids.length)throw Error('operation_batch_invalid');
 const b:AttemptBudget={limit:16,attempts:0,retries:0},outcomes:Settlement[]=[];
 for(const id of ids){const own=await env.DB.prepare(`SELECT 1 FROM role_settlements r LEFT JOIN verification_proofs p ON p.id=r.proof_id WHERE r.id=?1
 AND ((p.signer=?2 OR p.requester=?2) OR (r.subject=?2 AND r.purpose IN('roster_native_rank','roster_privileged_rank'))) AND ?4>${DB_NOW}
 AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2 AND session_version=?3 AND in_server=1) AND ${privacyGenerationFenceSql(2,5)}`).bind(id,actor.id,actor.v,actor.e,actor.g).first();
 if(!own)throw Error('operation_not_owned');const r=await settleRoleIntent(env,id,reconcileOnly,actor,b);outcomes.push(r);if(r.state!=='settled')break;}
 return {outcomes,attempts:b.attempts,limit:b.limit,remaining:ids.slice(outcomes.length)};
}
/** Frozen purpose and role are derived from verified proof + server configuration, never submitted role ids. */
export async function queueProofRoles(env:QrEnv,proofId:string):Promise<string[]> {
 requireQr(env);if(!TOKEN.test(proofId)||!ID.test(env.ROLE_GUILD_MEMBER||''))throw new Error('proof_configuration');
 const membershipBinding=membershipTransitionEnabled(env)?membershipTargets(env):undefined;
 const p=await env.DB.prepare('SELECT requester,requester_guid,native_rank,rank_name,native_profile FROM verification_proofs WHERE id=?1').bind(proofId).first<{requester:string;requester_guid:string;native_rank:number;rank_name:string;native_profile:string}>();
 if(!p||!await proofCurrent(env,proofId,p.requester))throw new Error('proof_stale');
 const desired:[string,number,string][]=[[membershipBinding?.current??env.ROLE_GUILD_MEMBER!,1,'verified_membership']];
 desired.push(...await rankTargets(env,p.requester,p.native_profile,p.rank_name,p.native_rank));
 // One bounded source-owned json_each INSERT, not one DB round trip per role. No caller role values enter it.
 const rows=desired.map(([role,wanted,purpose])=>({id:randomGeneration(),role,wanted,purpose}));
 if(membershipBinding&&!membershipTargetsCurrent(env,membershipBinding))throw Error('membership_configuration_changed');
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,created_at,expires_at,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?1,?4,json_extract(j.value,'$.role'),json_extract(j.value,'$.wanted'),'pending','awaiting_dispatch',${DB_NOW},${DB_NOW}+300,?5,?6,?7 FROM json_each(?3) j WHERE ${PROOF_CURRENT}
 ON CONFLICT(proof_id,role_id,desired) DO NOTHING`).bind(proofId,p.requester,JSON.stringify(rows),membershipBinding?.guild??env.GUILD_ID,p.native_profile,p.native_rank,p.rank_name).run();
 const found=await env.DB.prepare('SELECT id,role_id,desired,purpose FROM role_settlements WHERE proof_id=?1 LIMIT 28').bind(proofId).all<{id:string;role_id:string;desired:number;purpose:string}>();
 return rows.map(r=>{const matches=found.results.filter(x=>x.role_id===r.role&&x.desired===r.wanted&&x.purpose===r.purpose);if(matches.length!==1)throw Error('intent_currentness_changed');return matches[0]!.id;});
}
/** No automatic continuation from dispatching/unknown/held. A fresh GET can prove a landed outcome. */
export async function settleRoleIntent(env:QrEnv,id:string,reconcileOnly=false,actor?:{id:string;v:number;e:number;g:string|null},b:AttemptBudget=budget()):Promise<Settlement> {
 if(!membershipSettlementEnabled(env)&&env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true')return result('held','features_disabled');if(!TOKEN.test(id))return result('held','invalid_operation');
 const i=await env.DB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(id).first<Intent>();
 if(!i||i.guild_id!==env.GUILD_ID)return result('held','operation_not_current',id);
 const compensation=await env.DB.prepare("SELECT id,reason FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 AND desired=0 AND attempts=1").bind(id).first<{id:string;reason:string}>();
 if(compensation){if(!reconcileOnly)return result('unknown','explicit_compensation_reconciliation_required',id);const r=await reconcileRemovalReceipt(env,compensation.id,b);return result(r.state==='settled'?'held':r.state,r.state==='settled'?(compensation.reason.startsWith('membership_retirement')?'membership_retirement_absent':'removed_after_admission_changed'):r.reason,id,r.checkedAt);}
 let membershipBinding:ReturnType<typeof membershipTargets>|undefined;
 try{if(['verified_membership','roster_membership'].includes(i.purpose)){
 const binding=membershipTargets(env);membershipBinding=binding;
 if(i.role_id!==binding.current){if(reconcileOnly&&membershipTransitionEnabled(env)&&i.role_id===binding.retired)return reconcileRetiredMembershipReceipt(env,i,b);throw Error();}
 }
 else if(i.purpose==='verified_native_rank'||i.purpose==='roster_native_rank'){const map=rankMap(env);if(i.native_profile!==map.profile||!map.roles.includes(i.role_id)||i.desired!==Number(i.role_id===mappedNativeRole(i.native_rank_name!,i.native_rank!,map)))throw Error();}
 else if(i.purpose==='verified_privileged_rank'||i.purpose==='roster_privileged_rank'){
 if(env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true'||!['beta-five','ten-rank'].includes(i.native_profile!))throw Error();const map=privilegedNativeMap(i.native_profile as 'beta-five'|'ten-rank',env),wanted=map.wanted(i.native_rank_name!,i.native_rank!);
 if(!map.roles.includes(i.role_id)||i.desired!==Number(i.role_id===wanted))throw Error();
 if(i.desired===0&&!await env.DB.prepare("SELECT 1 FROM role_settlements WHERE subject=?1 AND role_id=?2 AND purpose IN('verified_privileged_rank','roster_privileged_rank') AND desired=1 AND attempts=1 AND state='settled'").bind(i.subject,i.role_id).first())throw Error();
 }
 else if(!['verified_membership','roster_membership'].includes(i.purpose))throw Error();}catch{return result('held','frozen_configuration_changed',id);}
 if(!await intentCurrent(env,i)){
 // A past spent attempt may be closed by fresh absence without minting any new authority/effect.
 if(reconcileOnly&&i.attempts===1&&['dispatching','unknown'].includes(i.state)){
 if(b.limit-b.attempts<4)return result('held','role_request_budget',id);try{const target=await qualify(env,b,i.subject,i.role_id,false);if(!target?.roles.includes(i.role_id)){
 await env.DB.prepare(`UPDATE role_settlements SET state='held',reason='past_effect_absent',checked_at=${DB_NOW} WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND attempts=1 AND state IN('dispatching','unknown')`).bind(id,env.GUILD_ID,i.role_id).run();return result('held','past_effect_absent',id,now());}
 return result('unknown','present_effect_requires_current_authority_or_manual_removal',id,now());}catch{return result('held','current_server_unknown',id);}}
 return result('held','proof_or_generation_stale',id);}
 if(b.limit-b.attempts<8)return result('held','role_request_budget',id);let target:Member|null;
 try{target=await qualify(env,b,i.subject,i.role_id,i.desired===1,['verified_native_rank','roster_native_rank'].includes(i.purpose)||(membershipTransitionEnabled(env)&&['verified_membership','roster_membership'].includes(i.purpose)));}catch{return result('held','inventory_hierarchy_or_server_hold',id);}
 if(!await intentCurrent(env,i))return result('held','proof_changed_after_lookup',id);
 const nonce=randomGeneration(),base=i.proof_id?{sql:PROOF_CURRENT,values:[i.proof_id,i.subject,id,nonce],id:3,nonce:4}:{sql:ROSTER_CURRENT,values:[...rosterParams(env,i),nonce],id:7,nonce:9};
 let guard=base.sql+` AND ?${base.nonce} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') AND id<>?${base.id})`;if(actor){const start=base.values.length+1;base.values.push(actor.id,actor.v,actor.e,actor.g);guard+=` AND ?${start+2}>${DB_NOW} AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?${start} AND session_version=?${start+1} AND in_server=1) AND ${privacyGenerationFenceSql(start,start+3)}`;}
 if(i.desired===1&&/^(verified|roster)_(native|privileged)_rank$/.test(i.purpose))guard+=` AND NOT EXISTS(SELECT 1 FROM role_settlements old JOIN role_settlements current ON current.id=?${base.id} WHERE old.subject=current.subject AND old.desired=0 AND old.state<>'settled' AND old.purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank') AND ((current.proof_id IS NOT NULL AND old.proof_id=current.proof_id) OR (current.roster_id IS NOT NULL AND old.roster_id=current.roster_id))
 AND NOT(current.proof_id IS NULL AND old.proof_id IS NULL AND current.roster_id IS NOT NULL
 AND old.purpose IN('roster_native_rank','roster_privileged_rank') AND old.state='held' AND old.reason='expired_without_dispatch' AND old.attempts=0 AND old.expires_at<=${DB_NOW}
 AND old.guild_id=current.guild_id AND old.subject_generation IS current.subject_generation AND old.native_guid IS current.native_guid
 AND old.native_profile IS current.native_profile AND old.native_rank IS current.native_rank AND old.native_rank_name IS current.native_rank_name))`;
 if(membershipBinding&&!membershipTargetsCurrent(env,membershipBinding))return result('held','frozen_configuration_changed',id);
 const update=(set:string,extra='')=>env.DB.prepare(`UPDATE role_settlements SET ${set} WHERE id=?${base.id} AND ${guard} ${extra} RETURNING id`).bind(...base.values);
 const present=!!target?.roles.includes(i.role_id);
 if(present===(i.desired===1)){
 const r=await update(`state='settled',reason='fresh_server_confirmed',checked_at=${DB_NOW}`).first();
 return r?result('settled','fresh_server_confirmed',id,now()):result('held','proof_changed_before_receipt',id);}
 if(reconcileOnly||i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',id,now());
 const claimed=await update(`state='dispatching',attempts=1,claim_nonce=?${base.nonce},reason='dispatching'`,`AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}`).first();
 if(!claimed)return result('held','claim_changed',id);
 if(!await update("reason='admitted_before_effect'",`AND claim_nonce=?${base.nonce} AND state='dispatching'`).first())return result('held','proof_changed_before_effect',id);
 if(membershipBinding&&!membershipTargetsCurrent(env,membershipBinding))return result('held','frozen_configuration_changed',id);
 try{await request(env,b,i.desired?'PUT':'DELETE',`/guilds/${env.GUILD_ID}/members/${i.subject}/roles/${i.role_id}`);}catch{
 await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_outcome_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(id,nonce).run();return result('unknown','provider_outcome_unknown',id);}
 // Even a 204 is not completion until current server state and admission are checked again.
 try{const after=await member(env,b,i.subject);const restricted=!!after&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&after.roles.includes(r.trim()));
 if(i.desired===1&&after?.roles.includes(i.role_id)&&(!await intentCurrent(env,i)||restricted||membershipBinding&&!membershipTargetsCurrent(env,membershipBinding)))return compensateGrant(env,b,i,nonce);
 if(!!after?.roles.includes(i.role_id)!==(i.desired===1))throw Error('changed');
 const r=await update(`state='settled',reason='effect_and_current_server_confirmed',checked_at=${DB_NOW}`,`AND claim_nonce=?${base.nonce}`).first();
 if(!r&&i.desired===1&&after?.roles.includes(i.role_id))return compensateGrant(env,b,i,nonce);
 if(!r)throw Error('changed');return result('settled','effect_and_current_server_confirmed',id,now());
 }catch{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='confirmation_or_admission_unknown' WHERE id=?1 AND claim_nonce=?2`).bind(id,nonce).run();return result('unknown','confirmation_or_admission_unknown',id);}
}
/** A landed grant that lost admission owes one separate, durable removal. This cannot mint a grant or retry a DELETE. */
async function compensateGrant(env:Env,b:AttemptBudget,i:Intent,parentNonce:string):Promise<Settlement>{
 const id=randomGeneration(),nonce=randomGeneration();
 const claimed=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,claim_nonce,attempts,created_at,expires_at)
 SELECT ?1,subject,'grant_compensation',guild_id,role_id,0,'dispatching','admission_lost',id,?3,1,${DB_NOW},${DB_NOW}+300 FROM role_settlements
 WHERE id=?2 AND claim_nonce=?4 AND state='dispatching' AND desired=1 AND attempts=1
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?2) RETURNING id`).bind(id,i.id,nonce,parentNonce).first();
 if(!claimed)return result('unknown','compensation_claim_held',i.id);
 try{await request(env,b,'DELETE',`/guilds/${i.guild_id}/members/${i.subject}/roles/${i.role_id}`);const after=await member(env,b,i.subject);if(after?.roles.includes(i.role_id))throw Error();
 await env.DB.batch([env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='removed',checked_at=${DB_NOW} WHERE id=?1 AND claim_nonce=?2`).bind(id,nonce),env.DB.prepare("UPDATE role_settlements SET state='held',reason='removed_after_admission_changed' WHERE id=?1 AND claim_nonce=?2").bind(i.id,parentNonce)]);
 return result('held','removed_after_admission_changed',i.id,now());
 }catch{await env.DB.prepare("UPDATE role_settlements SET state='unknown',reason='compensation_unknown' WHERE id IN(?1,?2)").bind(id,i.id).run();return result('unknown','compensation_unknown',i.id);}
}
/** Past one-use removal authority permits only an outcome GET. Cause withdrawal/retirement never permits a second DELETE. */
export async function reconcileRemovalReceipt(env:Env,id:string,b:AttemptBudget=budget()):Promise<Settlement>{
 if(!TOKEN.test(id))return result('held','invalid_operation');const i=await env.DB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(id).first<Intent>();
 if(!i||i.guild_id!==env.GUILD_ID||i.desired!==0||i.attempts!==1||!['grant_compensation','ban','rename_hold','blocking_role','guild_departure'].includes(i.purpose))return result('held','removal_receipt_not_owned',id);
 if(i.purpose!=='grant_compensation'&&i.role_id!==env.ROLE_GUILD_MEMBER&&!(membershipTransitionEnabled(env)&&membershipTargets(env).retired===i.role_id))return result('held','frozen_configuration_changed',id);
 if(i.purpose==='grant_compensation'&&!await env.DB.prepare("SELECT 1 FROM role_settlements p JOIN role_settlements r ON r.request_digest=p.id WHERE r.id=?1 AND p.subject=r.subject AND p.guild_id=r.guild_id AND p.role_id=r.role_id AND p.desired=1 AND p.attempts=1").bind(id).first())return result('held','compensation_parent_changed',id);
 if(b.limit-b.attempts<4)return result('held','role_request_budget',id);let target:Member|null;try{target=await qualify(env,b,i.subject,i.role_id,false,false,[],membershipTransitionEnabled(env)&&membershipTargets(env).retired===i.role_id);}catch{return result('held','inventory_hierarchy_or_server_hold',id);}
 if(target?.roles.includes(i.role_id))return result('unknown','removal_outcome_not_absent',id,now());
 const r=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason=?12,checked_at=${DB_NOW} WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND subject=?4 AND purpose=?5 AND desired=0 AND attempts=1 AND state=?6 AND claim_nonce IS ?7 AND created_at=?8 AND expires_at=?9 AND subject_generation IS ?10 AND request_digest IS ?11 RETURNING id`).bind(id,env.GUILD_ID,i.role_id,i.subject,i.purpose,i.state,i.claim_nonce,i.created_at,i.expires_at,i.subject_generation,i.request_digest,i.reason?.startsWith('membership_retirement')?'membership_retirement_absent':'absent').first();
 if(!r)return result('held','removal_receipt_changed',id);if(i.purpose==='grant_compensation'&&!i.reason?.startsWith('membership_retirement'))await env.DB.prepare("UPDATE role_settlements SET state='held',reason='removed_after_admission_changed' WHERE id=(SELECT request_digest FROM role_settlements WHERE id=?1) AND desired=1 AND attempts=1").bind(id).run();return result('settled','fresh_absence_only',id,now());
}
export type ErasureProof={purpose:'account_erasure';subject:string;subjectGeneration:string;operationId:string;requestDigest:string};
/** Privacy completion embeds this predicate in its SAME atomic local-erasure batch. */
export const ACCOUNT_ERASURE_ROLE_SETTLED_SQL=`EXISTS(SELECT 1 FROM role_settlements r WHERE r.id=?1 AND r.subject=?2 AND r.subject_generation=?3 AND r.request_digest=?4
 AND r.purpose='account_erasure' AND r.desired=0 AND r.state='settled' AND r.reason IN('absent','removed')
 AND r.checked_at<=${DB_NOW} AND r.checked_at>${DB_NOW}-60)`;
export type RemovalPurpose='ban'|'rename_hold'|'blocking_role'|'guild_departure';
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
type AttendedInput=Readonly<{staff:Readonly<{u:string;v:number;e:number;g:string|null}>;binding:ReturnType<typeof membershipTargets>;parent:RetirementParent;subjectGeneration:string|null;expiresAt:number;formNonce:string;child:RetirementParent|null}>;
export type AttendedRetirementAdmission=AttendedInput&{readonly origin:D1Database};
const attendedAdmissions=new WeakSet<AttendedRetirementAdmission>();
/** Internal trusted route seam, after its fixed-purpose MAC verification; never a client-supplied capability. */
export function admitAttendedMembershipRetirement(env:Env,input:AttendedInput):AttendedRetirementAdmission{
 if(!isSiteAdmin(env,input.staff.u)||!membershipTargetsCurrent(env,input.binding)||!TOKEN.test(input.formNonce)||!Number.isSafeInteger(input.expiresAt)||input.expiresAt>input.staff.e)throw Error('retirement_attended_admission');
 const project=(p:RetirementParent)=>Object.freeze(Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,p[k]]))) as RetirementParent;
 const a=Object.freeze({...input,staff:Object.freeze({...input.staff}),binding:Object.freeze({...input.binding}),parent:project(input.parent),child:input.child?project(input.child):null,origin:env.DB});attendedAdmissions.add(a);return a;
}
/** Original staff/form authority is consumed only before dispatch. After dispatch, exact spent custody
 * can retain a late outcome when that staff session closes; it creates no new effect or account authority.
 */
async function retireAttendedMembershipRole(env:Env,grantId:string,capture:{subjectGeneration:string|null},b:AttemptBudget,a:AttendedRetirementAdmission):Promise<Settlement>{
 if(!attendedAdmissions.has(a)||a.origin!==env.DB||grantId!==a.parent.id||capture.subjectGeneration!==a.subjectGeneration||!membershipTransitionEnabled(env)||!membershipTargetsCurrent(env,a.binding))return result('held','retirement_attended_admission_required');
 const p=a.parent,s=a.staff,binding=a.binding,live=()=>isSiteAdmin(env,s.u)&&membershipTargetsCurrent(env,binding);
 if(!binding.retired||p.guild_id!==binding.guild||p.role_id!==binding.retired||p.purpose!=='roster_membership'||p.proof_id!==null||p.desired!==1||p.attempts!==1||p.state!=='settled'||!p.claim_nonce)return result('held','retirement_original_grant_not_owned');
 const parent=(param:number)=>`EXISTS(SELECT 1 FROM role_settlements p WHERE ${RETIREMENT_PARENT_FIELDS.map(k=>`p.${k} IS json_extract(?${param},'$.${k}')`).join(' AND ')})`;
 const staff=`${fenceSql('applicantWrite',14,15,16,s.g)} AND ?17>${DB_NOW} AND ?17<=?16`;
 const approvedParent=JSON.stringify(p),custody=privacyProviderCustodyDatabase(env);
 if(a.child){
  const r=a.child;
  if(r.purpose!=='grant_compensation'||r.request_digest!==p.id||r.subject!==p.subject||r.guild_id!==p.guild_id||r.role_id!==p.role_id||r.subject_generation!==p.subject_generation||r.desired!==0||r.attempts!==1||!r.claim_nonce||!['dispatching','unknown','settled'].includes(r.state)||!r.reason.startsWith('membership_retirement'))return result('held','retirement_receipt_changed');
  const values=[JSON.stringify(r),approvedParent,s.u,s.v,s.e,a.expiresAt];
  const child=`${RETIREMENT_PARENT_FIELDS.map(k=>`${k} IS json_extract(?1,'$.${k}')`).join(' AND ')}`;
  const recovery=`${child} AND ${parent(2)} AND ${fenceSql('applicantWrite',3,4,5,s.g)} AND ?6>${DB_NOW} AND ?6<=?5`;
  if(!live()||!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${recovery}`).bind(...values).first())return result('held','retirement_original_admission_changed',r.id);
  if(b.limit-b.attempts<4)return result('held','role_request_budget',r.id);
  const readAdmission=async()=>live()&&!!await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${recovery}`).bind(...values).first();
  let target:Member|null;try{target=await qualify(env,b,r.subject,r.role_id,false,false,[],true,readAdmission);}catch{return result('held','retirement_inventory_hold',r.id);}
  if(target?.roles.includes(r.role_id))return result('unknown','retirement_outcome_not_absent',r.id,now());
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

/** Serving erasure may drain two expired/spent debts by GET only. Current job proof never authorizes another role effect here. */
export async function reconcileAccountErasureRoleDebt(env:Env,proof:ErasureProof){
 const authority=await import('./privacy-serving-authority'),b:AttemptBudget={limit:8,attempts:0,retries:0},outcomes:Settlement[]=[];
 if(!await authority.currentAccountErasureProof(env,proof))return {state:'held' as const,outcomes,attempts:0};
 const rows=await env.DB.prepare(`SELECT r.id,r.desired,r.purpose FROM role_settlements r LEFT JOIN verification_proofs p ON p.id=r.proof_id
 WHERE (r.subject=?1 OR p.requester=?1 OR p.signer=?1) AND r.attempts=1 AND r.state IN('dispatching','unknown') AND r.expires_at<=${DB_NOW}
 AND r.purpose<>'account_erasure' ORDER BY r.created_at,r.id LIMIT 2`).bind(proof.subject).all<{id:string;desired:number;purpose:string}>();
 for(const row of rows.results){if(!await authority.currentAccountErasureProof(env,proof))return {state:'held' as const,outcomes,attempts:b.attempts};
 const r=row.desired===0?await reconcileRemovalReceipt(env,row.id,b):await settleRoleIntent(env,row.id,true,undefined,b);outcomes.push(r);
 if(!await authority.currentAccountErasureProof(env,proof))return {state:'held' as const,outcomes,attempts:b.attempts};}
 return {state:outcomes.some(r=>r.state==='unknown')?'held' as const:'checked' as const,outcomes,attempts:b.attempts};
}
/** The privacy owner supplies current durable job authority; no boolean/caller string mints it. */
export async function settleErasure(env:Env,proof:ErasureProof,b:AttemptBudget=budget()) {
 const authority=await import('./privacy-serving-authority');
 const held={state:'held' as const,checkedAt:null,staffAccess:'unknown' as const};
 if(proof.purpose!=='account_erasure'||!ID.test(proof.subject)||!TOKEN.test(proof.operationId)||!TOKEN.test(proof.subjectGeneration)||!/^[0-9a-f]{64}$/.test(proof.requestDigest)||!env.ROLE_GUILD_MEMBER)return held;
 if(!await authority.currentAccountErasureProof(env,proof))return held;
 const p=[proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest];
 // One frozen operation/configuration. A repeated request cannot replace its intent or renew its expiry.
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at)
 SELECT ?1,?2,'account_erasure',?5,?6,0,'pending','awaiting_dispatch',?3,?4,${DB_NOW},${DB_NOW}+300 WHERE ${authority.CURRENT_ERASURE_SQL}
 ON CONFLICT(id) DO NOTHING`).bind(...p,env.GUILD_ID,env.ROLE_GUILD_MEMBER).run();
 const intent=await env.DB.prepare(`SELECT * FROM role_settlements WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4
 AND purpose='account_erasure' AND guild_id=?5 AND role_id=?6 AND desired=0`).bind(...p,env.GUILD_ID,env.ROLE_GUILD_MEMBER).first<Intent>();
 if(!intent)return held;
 let target:Member|null;try{target=await qualify(env,b,proof.subject,env.ROLE_GUILD_MEMBER,false);}catch{return held;}
 if(!await authority.currentAccountErasureProof(env,proof))return held;
 const staff=(env.ROLE_OFFICER||'')+','+(env.ROLE_GUILD_LEADER||'')+','+(env.ROLE_GUILD_MASTER||'')+','+(env.ROLE_RAID_LEADER||'');
 const staffAccess=target?.roles.some(r=>staff.split(',').includes(r))?'human-managed' as const:'none' as const;
 const settle=async(reason:'absent'|'removed')=>!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason=?5,checked_at=${DB_NOW}
 WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND ${authority.CURRENT_ERASURE_SQL} RETURNING id`).bind(...p,reason).first();
 if(!target?.roles.includes(env.ROLE_GUILD_MEMBER))return await settle('absent')?{state:'absent' as const,checkedAt:now(),staffAccess}:held;
 if(intent.state!=='pending'||intent.attempts!==0||intent.expires_at<=now())return {state:'unknown' as const,checkedAt:null,staffAccess};
 const nonce=randomGeneration();
 const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?5,reason='dispatching'
 WHERE id=?1 AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}
 AND ${authority.CURRENT_ERASURE_SQL} RETURNING id`).bind(...p,nonce).first();
 if(!claimed||!await authority.currentAccountErasureProof(env,proof))return held;
 const unknown=async()=>{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(proof.operationId,nonce).run();return {state:'unknown' as const,checkedAt:null,staffAccess};};
 try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${proof.subject}/roles/${env.ROLE_GUILD_MEMBER}`);
 const after=await member(env,b,proof.subject);if(after?.roles.includes(env.ROLE_GUILD_MEMBER)||!await authority.currentAccountErasureProof(env,proof))return unknown();
 return await settle('removed')?{state:'removed' as const,checkedAt:now(),staffAccess}:unknown();
 }catch{return unknown();}
}
