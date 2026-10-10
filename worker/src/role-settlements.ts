/** Central audited writer for new QR/rank and erasure effects. Existing legacy writers are not silently activated here.
 * Each intent is durable before HTTP, one CAS dispatch only. Unknown responses are reconciled by GET, never re-POSTed.
 */
import type { Env } from './env';
import { rest, DiscordError, type AttemptBudget } from './discord';
import { DB_NOW, randomGeneration } from './account-generation-contracts';
import { requireQr, type QrEnv, SIGNER_CURRENT } from './qr-phase1';
import { parseNativeRoleMap,mappedNativeRole,identifyNativeProfile,privilegedNativeMap } from './native-rank-adapter';
import { privacyGenerationFenceSql,readPrivacySubject } from './privacy-serving-authority';

type Role={id:string;position:number;permissions:string;managed:boolean};
type Member={roles:string[];user:{id:string}};
type Intent={id:string;subject:string;purpose:string;proof_id:string|null;guild_id:string;role_id:string;desired:number;state:string;attempts:number;expires_at:number;roster_id:number|null;native_guid:string|null;native_profile:string|null;native_rank:number|null;native_rank_name:string|null;subject_generation:string|null};
export type Settlement=Readonly<{state:'settled'|'held'|'unknown';reason:string;operationId:string|null;checkedAt:number|null}>;
const result=(state:Settlement['state'],reason:string,operationId:string|null=null,checkedAt:number|null=null):Settlement=>({state,reason,operationId,checkedAt});
const ID=/^\d{17,20}$/;const TOKEN=/^[0-9a-f]{32}$/;
const now=()=>Math.floor(Date.now()/1000);
const budget=():AttemptBudget=>({limit:8,attempts:0,retries:0});
/** This path counts every network request and disables the legacy 429 retry. */
async function request<T>(env:Env,b:AttemptBudget,method:string,path:string):Promise<T> {
 if(b.attempts>=b.limit)throw new Error('role_budget');b.attempts++;if('calls' in b)(b as AttemptBudget&{calls:number}).calls++;
 return rest<T>(env,method,path,undefined,1,'Olympus verified role settlement',b);
}
async function member(env:Env,b:AttemptBudget,subject:string):Promise<Member|null> {
 try{return await request<Member>(env,b,'GET',`/guilds/${env.GUILD_ID}/members/${subject}`);}catch(e){if(e instanceof DiscordError&&e.status===404)return null;throw e;}
}
async function qualify(env:Env,b:AttemptBudget,subject:string,roleId:string,grant:boolean,cosmetic=false) {
 if(!ID.test(env.GUILD_ID)||!ID.test(subject)||!ID.test(roleId)||!env.DISCORD_BOT_TOKEN)throw new Error('role_configuration');
 const me=await request<{id:string}>(env,b,'GET','/users/@me');if(!ID.test(env.DISCORD_APP_ID)||me.id!==env.DISCORD_APP_ID||me.id===subject)throw new Error('bot_identity');
 const roles=await request<Role[]>(env,b,'GET',`/guilds/${env.GUILD_ID}/roles`);
 const bot=await member(env,b,me.id),target=await member(env,b,subject);
 if(!Array.isArray(roles)||roles.length>250||!bot||!Array.isArray(bot.roles)||target&&!Array.isArray(target.roles))throw new Error('role_inventory');
 if(roles.some(r=>!ID.test(r.id)||!Number.isInteger(r.position)||typeof r.permissions!=='string'||!/^\d{1,32}$/.test(r.permissions)||typeof r.managed!=='boolean')||new Set(roles.map(r=>r.id)).size!==roles.length)throw new Error('role_inventory');
 const inventory=new Map(roles.map(r=>[r.id,r]));const botRoles=bot.roles.map(id=>inventory.get(id));if(botRoles.some(r=>!r))throw new Error('bot_inventory');
 const highest=Math.max(0,...botRoles.map(r=>r!.position));const permission=botRoles.reduce((v,r)=>v|BigInt(r!.permissions),BigInt(inventory.get(env.GUILD_ID)?.permissions||'0'));
 const wanted=inventory.get(roleId);if(!wanted||wanted.managed||wanted.id===env.GUILD_ID||wanted.position>=highest||cosmetic&&wanted.permissions!=='0'||!(permission&268435456n||permission&8n))throw new Error('role_hierarchy');
 if(target){if(target.roles.some(id=>!inventory.has(id))||Math.max(0,...target.roles.map(id=>inventory.get(id)!.position))>=highest)throw new Error('target_hierarchy');}
 if(grant&&(!target||(env.BLOCKING_ROLE_IDS||'').split(',').map(x=>x.trim()).some(x=>x&&target.roles.includes(x))))throw new Error('server_restriction');
 return target;
}
export const PROOF_CURRENT=`EXISTS(SELECT 1 FROM verification_proofs p JOIN verification_requests v ON v.code=p.code
 WHERE p.id=?1 AND p.requester=?2 AND p.expires_at>${DB_NOW} AND v.state='proved' AND v.used_at IS NOT NULL
 AND ${SIGNER_CURRENT.replace(/\?1\b/g,'p.key_id').replace(/\?2\b/g,'p.signer')}
 AND (CASE WHEN v.subject_generation IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=v.requester) ELSE EXISTS(
 SELECT 1 FROM privacy_subjects WHERE subject_id=v.requester AND generation=v.subject_generation AND state='active') END)
 AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=p.requester AND banned=1)
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=p.requester AND state='reapply')
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=p.requester AND desired=0 AND attempts=1 AND purpose IN('grant_compensation','ban','rename_hold','blocking_role','guild_departure','account_erasure') AND state IN('dispatching','unknown'))
 AND EXISTS(SELECT 1 FROM characters WHERE discord_id=p.requester AND guid=p.requester_guid AND name=p.requester_name AND status='member')
 AND NOT EXISTS(SELECT 1 FROM roster_snapshots s WHERE s.id>p.snapshot_id AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=p.requester_guid AND rank_index=p.native_rank)<>1))`;
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
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') AND id<>?7)
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?2 AND state='reapply'))`;
const rosterParams=(env:Env,i:Intent)=>[i.roster_id,i.subject,i.native_guid,i.native_rank_name,i.native_rank,i.subject_generation,i.id,Number(env.LINKS_NOT_BEFORE||0)];
async function intentCurrent(env:Env,i:Intent){return i.proof_id?proofCurrent(env,i.proof_id,i.subject):['roster_native_rank','roster_privileged_rank','roster_membership'].includes(i.purpose)&&!!await env.DB.prepare(`SELECT 1 WHERE ${ROSTER_CURRENT}`).bind(...rosterParams(env,i)).first();}
export async function queueRosterMembershipRole(env:QrEnv,subject:string,snapshotId:number,capturedGeneration:string|null):Promise<string>{
 if(env.QR_PHASE1_ENABLED!=='true'&&env.PRIVACY_ERASURE_ENABLED!=='true')throw Error('membership_writer_disabled');if(!ID.test(subject)||!ID.test(env.ROLE_GUILD_MEMBER||'')||capturedGeneration!==null&&!TOKEN.test(capturedGeneration))throw Error('membership_configuration');
 const profiles=await env.DB.prepare('SELECT DISTINCT rank,rank_index FROM roster_members WHERE snapshot_id=?1 LIMIT 11').bind(snapshotId).all<{rank:string;rank_index:number}>(),profile=identifyNativeProfile(profiles.results);
 const rows=await env.DB.prepare(`SELECT r.guid,r.rank,r.rank_index FROM roster_members r JOIN characters c ON c.guid=r.guid AND c.discord_id=?1 WHERE r.snapshot_id=?2 AND c.status='member'`).bind(subject,snapshotId).all<{guid:string;rank:string;rank_index:number}>();
 if(rows.results.length!==1)throw Error('unique_native_guid_required');const r=rows.results[0]!,id=randomGeneration();
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
 SELECT ?7,?2,'roster_membership',?9,?10,1,'pending','awaiting_dispatch',?6,${DB_NOW},${DB_NOW}+300,?1,?3,?11,?5,?4 WHERE ${ROSTER_CURRENT}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose='roster_membership' AND roster_id=?1 AND role_id=?10)`).bind(snapshotId,subject,r.guid,r.rank,r.rank_index,capturedGeneration,id,Number(env.LINKS_NOT_BEFORE||0),env.GUILD_ID,env.ROLE_GUILD_MEMBER,profile).run();
 const row=await env.DB.prepare("SELECT id FROM role_settlements WHERE subject=?1 AND purpose='roster_membership' AND roster_id=?2 AND role_id=?3").bind(subject,snapshotId,env.ROLE_GUILD_MEMBER).first<{id:string}>();if(!row)throw Error('membership_currentness_changed');return row.id;
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
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?9,json_extract(j.value,'$.role'),json_extract(j.value,'$.desired'),'pending','awaiting_dispatch',?6,${DB_NOW},${DB_NOW}+300,?1,?3,?11,?5,?4 FROM json_each(?10) j WHERE ${ROSTER_CURRENT}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=json_extract(j.value,'$.purpose') AND roster_id=?1 AND role_id=json_extract(j.value,'$.role') AND desired=json_extract(j.value,'$.desired'))`).bind(...args).run();
 const found=await env.DB.prepare("SELECT id,role_id,desired,purpose FROM role_settlements WHERE subject=?1 AND roster_id=?2 AND purpose IN('roster_native_rank','roster_privileged_rank') LIMIT 28").bind(subject,snapshotId).all<{id:string;role_id:string;desired:number;purpose:string}>();
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
 const p=await env.DB.prepare('SELECT requester,requester_guid,native_rank,rank_name,native_profile FROM verification_proofs WHERE id=?1').bind(proofId).first<{requester:string;requester_guid:string;native_rank:number;rank_name:string;native_profile:string}>();
 if(!p||!await proofCurrent(env,proofId,p.requester))throw new Error('proof_stale');
 const desired:[string,number,string][]=[[env.ROLE_GUILD_MEMBER!,1,'verified_membership']];
 desired.push(...await rankTargets(env,p.requester,p.native_profile,p.rank_name,p.native_rank));
 // One bounded source-owned json_each INSERT, not one DB round trip per role. No caller role values enter it.
 const rows=desired.map(([role,wanted,purpose])=>({id:randomGeneration(),role,wanted,purpose}));
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,created_at,expires_at,native_profile,native_rank,native_rank_name)
 SELECT json_extract(j.value,'$.id'),?2,json_extract(j.value,'$.purpose'),?1,?4,json_extract(j.value,'$.role'),json_extract(j.value,'$.wanted'),'pending','awaiting_dispatch',${DB_NOW},${DB_NOW}+300,?5,?6,?7 FROM json_each(?3) j WHERE ${PROOF_CURRENT}
 ON CONFLICT(proof_id,role_id,desired) DO NOTHING`).bind(proofId,p.requester,JSON.stringify(rows),env.GUILD_ID,p.native_profile,p.native_rank,p.rank_name).run();
 const found=await env.DB.prepare('SELECT id,role_id,desired,purpose FROM role_settlements WHERE proof_id=?1 LIMIT 28').bind(proofId).all<{id:string;role_id:string;desired:number;purpose:string}>();
 return rows.map(r=>{const matches=found.results.filter(x=>x.role_id===r.role&&x.desired===r.wanted&&x.purpose===r.purpose);if(matches.length!==1)throw Error('intent_currentness_changed');return matches[0]!.id;});
}
/** No automatic continuation from dispatching/unknown/held. A fresh GET can prove a landed outcome. */
export async function settleRoleIntent(env:QrEnv,id:string,reconcileOnly=false,actor?:{id:string;v:number;e:number;g:string|null},b:AttemptBudget=budget()):Promise<Settlement> {
 if(env.QR_PHASE1_ENABLED!=='true'&&env.PRIVACY_ERASURE_ENABLED!=='true'&&env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true')return result('held','features_disabled');if(!TOKEN.test(id))return result('held','invalid_operation');
 const i=await env.DB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(id).first<Intent>();
 if(!i||i.guild_id!==env.GUILD_ID)return result('held','operation_not_current',id);
 const compensation=await env.DB.prepare("SELECT id FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 AND desired=0 AND attempts=1").bind(id).first<{id:string}>();
 if(compensation){if(!reconcileOnly)return result('unknown','explicit_compensation_reconciliation_required',id);const r=await reconcileRemovalReceipt(env,compensation.id,b);return result(r.state==='settled'?'held':r.state,r.state==='settled'?'removed_after_admission_changed':r.reason,id,r.checkedAt);}
 try{if(['verified_membership','roster_membership'].includes(i.purpose)&&i.role_id!==env.ROLE_GUILD_MEMBER)throw Error();
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
 try{target=await qualify(env,b,i.subject,i.role_id,i.desired===1,['verified_native_rank','roster_native_rank'].includes(i.purpose));}catch{return result('held','inventory_hierarchy_or_server_hold',id);}
 if(!await intentCurrent(env,i))return result('held','proof_changed_after_lookup',id);
 const nonce=randomGeneration(),base=i.proof_id?{sql:PROOF_CURRENT,values:[i.proof_id,i.subject,id,nonce],id:3,nonce:4}:{sql:ROSTER_CURRENT,values:[...rosterParams(env,i),nonce],id:7,nonce:9};
 let guard=base.sql+` AND ?${base.nonce} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') AND id<>?${base.id})`;if(actor){const start=base.values.length+1;base.values.push(actor.id,actor.v,actor.e,actor.g);guard+=` AND ?${start+2}>${DB_NOW} AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?${start} AND session_version=?${start+1} AND in_server=1) AND ${privacyGenerationFenceSql(start,start+3)}`;}
 if(i.desired===1&&/^(verified|roster)_(native|privileged)_rank$/.test(i.purpose))guard+=` AND NOT EXISTS(SELECT 1 FROM role_settlements old JOIN role_settlements current ON current.id=?${base.id} WHERE old.subject=current.subject AND old.desired=0 AND old.state<>'settled' AND old.purpose IN('verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank') AND ((current.proof_id IS NOT NULL AND old.proof_id=current.proof_id) OR (current.roster_id IS NOT NULL AND old.roster_id=current.roster_id)))`;
 const update=(set:string,extra='')=>env.DB.prepare(`UPDATE role_settlements SET ${set} WHERE id=?${base.id} AND ${guard} ${extra} RETURNING id`).bind(...base.values);
 const present=!!target?.roles.includes(i.role_id);
 if(present===(i.desired===1)){
 const r=await update(`state='settled',reason='fresh_server_confirmed',checked_at=${DB_NOW}`).first();
 return r?result('settled','fresh_server_confirmed',id,now()):result('held','proof_changed_before_receipt',id);}
 if(reconcileOnly||i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',id,now());
 const claimed=await update(`state='dispatching',attempts=1,claim_nonce=?${base.nonce},reason='dispatching'`,`AND state='pending' AND attempts=0 AND expires_at>${DB_NOW}`).first();
 if(!claimed)return result('held','claim_changed',id);
 if(!await update("reason='admitted_before_effect'",`AND claim_nonce=?${base.nonce} AND state='dispatching'`).first())return result('held','proof_changed_before_effect',id);
 try{await request(env,b,i.desired?'PUT':'DELETE',`/guilds/${env.GUILD_ID}/members/${i.subject}/roles/${i.role_id}`);}catch{
 await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='provider_outcome_unknown' WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(id,nonce).run();return result('unknown','provider_outcome_unknown',id);}
 // Even a 204 is not completion until current server state and admission are checked again.
 try{const after=await member(env,b,i.subject);const restricted=!!after&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&after.roles.includes(r.trim()));
 if(i.desired===1&&after?.roles.includes(i.role_id)&&(!await intentCurrent(env,i)||restricted))return compensateGrant(env,b,i,nonce);
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
 if(i.purpose!=='grant_compensation'&&i.role_id!==env.ROLE_GUILD_MEMBER)return result('held','frozen_configuration_changed',id);
 if(i.purpose==='grant_compensation'&&!await env.DB.prepare("SELECT 1 FROM role_settlements p JOIN role_settlements r ON r.request_digest=p.id WHERE r.id=?1 AND p.subject=r.subject AND p.guild_id=r.guild_id AND p.role_id=r.role_id AND p.desired=1 AND p.attempts=1").bind(id).first())return result('held','compensation_parent_changed',id);
 if(b.limit-b.attempts<4)return result('held','role_request_budget',id);let target:Member|null;try{target=await qualify(env,b,i.subject,i.role_id,false);}catch{return result('held','inventory_hierarchy_or_server_hold',id);}
 if(target?.roles.includes(i.role_id))return result('unknown','removal_outcome_not_absent',id,now());
 const r=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='absent',checked_at=${DB_NOW} WHERE id=?1 AND guild_id=?2 AND role_id=?3 AND desired=0 AND attempts=1 RETURNING id`).bind(id,env.GUILD_ID,i.role_id).first();
 if(!r)return result('held','removal_receipt_changed',id);if(i.purpose==='grant_compensation')await env.DB.prepare("UPDATE role_settlements SET state='held',reason='removed_after_admission_changed' WHERE id=(SELECT request_digest FROM role_settlements WHERE id=?1) AND desired=1 AND attempts=1").bind(id).run();return result('settled','fresh_absence_only',id,now());
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
export async function settleVerifiedRemoval(env:Env,subject:string,purpose:RemovalPurpose,b:AttemptBudget=budget(),capturedGeneration?:string|null):Promise<Settlement>{
 if(!ID.test(subject)||!env.ROLE_GUILD_MEMBER||!['ban','rename_hold','blocking_role','guild_departure'].includes(purpose)||purpose==='guild_departure'&&(capturedGeneration===undefined||capturedGeneration!==null&&!TOKEN.test(capturedGeneration)))return result('held','removal_configuration');
 const prior=await env.DB.prepare("SELECT id FROM role_settlements WHERE subject=?1 AND purpose=?2 AND guild_id=?3 AND role_id=?4 AND desired=0 AND attempts=1 AND state IN('dispatching','unknown') ORDER BY created_at,id LIMIT 1").bind(subject,purpose,env.GUILD_ID,env.ROLE_GUILD_MEMBER).first<{id:string}>();if(prior)return reconcileRemovalReceipt(env,prior.id,b);
 // Capture before any Discord await. A new OAuth generation is never substituted after lookup or at dispatch.
 const original=await readPrivacySubject(env,subject);if(original&&original.state!=='active')return result('held','subject_held');
 if(capturedGeneration===undefined)capturedGeneration=original?.subjectGeneration??null;
 if(capturedGeneration!==(original?.subjectGeneration??null))return result('held','original_removal_generation_changed');
 if(b.limit-b.attempts<8)return result('held','role_request_budget');
 const cause=purpose==='ban'?"EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)":purpose==='rename_hold'?renameRemovalSql:purpose==='guild_departure'?`EXISTS(SELECT 1 FROM characters WHERE discord_id=?2)
 AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?2 AND (status IN('member','left_pending') OR guid IS NULL))
 AND EXISTS(SELECT 1 FROM roster_snapshots s WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
 AND s.exported_at<=${DB_NOW} AND s.exported_at>${DB_NOW}-600 AND s.exported_at>=?7 AND NOT EXISTS(SELECT 1 FROM roster_members r JOIN characters c ON c.guid=r.guid WHERE r.snapshot_id=s.id AND c.discord_id=?2))`:'1=1';
 const predicate=`(${cause}) AND ${privacyGenerationFenceSql(2,6)}`;
 const values=(items:(string|number|null)[])=>{const out=items.slice();while(out.length<5)out.push(null);out.push(capturedGeneration!);if(purpose==='guild_departure')out.push(Number(env.LINKS_NOT_BEFORE||0));return out;};
 let target:Member|null;try{target=await qualify(env,b,subject,env.ROLE_GUILD_MEMBER,false);}catch{return result('held','inventory_hierarchy_or_server_hold');}
 const blocker=(m:Member|null)=>!!m&&(env.BLOCKING_ROLE_IDS||'').split(',').some(r=>r.trim()&&m.roles.includes(r.trim()));
 if(purpose==='blocking_role'&&!blocker(target))return result('held','removal_cause_withdrawn');
 const fresh=await env.DB.prepare(`SELECT 1 WHERE ?1 IS NOT NULL AND ?2 IS NOT NULL AND ${predicate}`).bind(...values([env.ROLE_GUILD_MEMBER,subject])).first();if(!fresh)return result('held','removal_cause_withdrawn');
 const operation=randomGeneration();
 await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,created_at,expires_at,subject_generation)
 SELECT ?1,?2,?3,?4,?5,0,'pending','awaiting_dispatch',${DB_NOW},${DB_NOW}+300,?6 WHERE ${predicate}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=?3 AND guild_id=?4 AND role_id=?5 AND state<>'settled')`).bind(...values([operation,subject,purpose,env.GUILD_ID,env.ROLE_GUILD_MEMBER])).run();
 const i=await env.DB.prepare("SELECT * FROM role_settlements WHERE subject=?1 AND purpose=?2 AND guild_id=?3 AND role_id=?4 AND state<>'settled' ORDER BY created_at,id LIMIT 1").bind(subject,purpose,env.GUILD_ID,env.ROLE_GUILD_MEMBER).first<Intent>();if(!i)return result('held','removal_intent_held');
 if(i.subject_generation!==capturedGeneration)return result('held','original_removal_generation_changed',i.id);
 const settle=async()=>!!await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='absent',checked_at=${DB_NOW} WHERE id=?1 AND subject=?2 AND ${predicate} RETURNING id`).bind(...values([i.id,subject])).first();
 if(!target?.roles.includes(env.ROLE_GUILD_MEMBER))return await settle()?result('settled','absent',i.id,now()):result('held','removal_cause_withdrawn',i.id);
 if(i.state!=='pending'||i.attempts!==0||i.expires_at<=now())return result('unknown','explicit_reconciliation_required',i.id);
 // Blocking-role authority is a fresh current server observation, not an interaction's stale roles hint.
 if(purpose==='blocking_role'){try{target=await member(env,b,subject);}catch{return result('held','current_server_unknown',i.id);}if(!blocker(target))return result('held','removal_cause_withdrawn',i.id);}
 const nonce=randomGeneration(),claim=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',claim_nonce=?3,attempts=1,reason='dispatching'
 WHERE id=?1 AND subject=?2 AND state='pending' AND attempts=0 AND expires_at>${DB_NOW} AND ${predicate} RETURNING id`).bind(...values([i.id,subject,nonce])).first();if(!claim)return result('held','removal_cause_withdrawn',i.id);
 try{await request(env,b,'DELETE',`/guilds/${env.GUILD_ID}/members/${subject}/roles/${env.ROLE_GUILD_MEMBER}`);const after=await member(env,b,subject);if(after?.roles.includes(env.ROLE_GUILD_MEMBER)||!await settle())throw Error();return result('settled','removed',i.id,now());
 }catch{await env.DB.prepare("UPDATE role_settlements SET state='unknown',reason='provider_or_confirmation_unknown' WHERE id=?1 AND claim_nonce=?2").bind(i.id,nonce).run();return result('unknown','provider_or_confirmation_unknown',i.id);}
}
export const settleGuildDepartureRole=(env:Env,subject:string,capture:{subjectGeneration:string|null},b?:AttemptBudget)=>settleVerifiedRemoval(env,subject,'guild_departure',b,capture.subjectGeneration);
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
