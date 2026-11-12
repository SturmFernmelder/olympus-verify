/** Owner-authorized .164 guild-role erasure. Current absence is an observation, never an ACK for an older effect. */
import type {Env} from './env';
import {rest,DiscordError} from './discord';
import {BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS} from './beta-reset-policy';
import {parseNativeRoleMap} from './native-rank-adapter';
import {parseNativeRankPolicy232,MANUAL_COUNCIL232} from './native-rank-reconciliation232';
import {parseCanonicalRankPolicy233,ADDON_DEVELOPER233} from './canonical-ranks233';
import {nativeErasureMode} from './privacy-native-mode';
import {captureAccountErasureProof,currentAccountErasureProof,CURRENT_ERASURE_SQL,originalErasureJobBirthSql,PRIVACY_DB_NOW as NOW,type AccountErasureProof} from './privacy-serving-authority';
import {captureRuntimeVenue230,assertRuntimeVenue230,runtimeVenue230Facts,oldSharedMemberProducerHeld230,SHARED_MEMBER230_GUILD,SHARED_MEMBER230_ROLE,type RuntimeVenue230} from './shared-membership-cutover230';

export const NATIVE_ERASURE_ROLE_DELETES=2;
export const NATIVE_ERASURE_ROLE_HTTP_MAX=7;
export const NATIVE_ERASURE_ROLE_PURPOSE='native_account_erasure_role';
const INVENTORY='native_account_erasure_inventory',SUFFIX=':native_role_inventory',MAX_TARGETS=64;
const ID=/^[1-9][0-9]{16,19}$/,HEX=/^[0-9a-f]{32}$/;
// Transitional aliases identify the same two Branch roles; two matches for one semantic role remain ambiguous.
const COUNCIL=Object.freeze([Object.freeze(['Olympus Council GM','Olympus Branch GM']),Object.freeze(['Olympus Council Officer','Olympus Branch Officer'])]);
const ATTRIBUTED=Object.freeze(['roster_membership','verified_native_rank','roster_native_rank','verified_privileged_rank','roster_privileged_rank',
  'fresh_roster_membership','fresh_roster_rank','staff_roster_rank','guild_departure','ban','rename_hold','blocking_role','account_erasure','treasury_cosmetic','treasury_cosmetic_expiry',
  'launch_membership230','launch_membership_compensation230','launch_membership_removal230','launch_membership_erasure230','live_link_membership',
  'launch_routine_membership232','native_rank_compensation232','canonical_identity233','canonical_entitlement233','canonical_consumed233','canonical_routine233','canonical_compensation233','canonical_migration233','canonical_migration_remove233','canonical_migration_compensation233']);
const KEYS=['DB','GUILD_ID','DISCORD_APP_ID','DISCORD_BOT_TOKEN','PRIVACY_NATIVE_ERASURE_ENABLED','PRIVACY_ERASURE_ENABLED',
  'ROLE_GUILD_MEMBER','MEMBERSHIP_RETIRED_ROLE_ID','ROLE_OFFICER','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER','ROLE_RAID_LEADER','ROLE_MODERATOR',
  'BLOCKING_ROLE_IDS','QR_NATIVE_ROLE_MAP','FULL_RELEASE_ROLES','TREASURY_COSMETIC_ROLES','NATIVE_RANK_SYNC232','CANONICAL_RANKS233',
  'SHARED_MEMBERSHIP230_MODE','SHARED_MEMBERSHIP230_CLOSURE_JSON','SHARED_MEMBERSHIP230_CLOSURE_SHA256','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_WRITE_ADMISSION_EPOCH','VERIFY_MEMBERSHIP_ONLY','VERIFY_NATIVE_SCOPE','MEMBERSHIP_ROLE_SETTLEMENT_ENABLED'] as const;
type Role=Readonly<{id:string;name:string;position:number;permissions:bigint;managed:boolean}>;
declare const receiptBrand:unique symbol;
export type NativeErasureRoleReceipt=Readonly<{[receiptBrand]:true}>;
export type NativeErasureRoleResult=Readonly<{state:'complete'|'held'|'unknown';reason:string;checkedAt:number|null;attributed:number;removed:number;remaining:number;staffAccess:'human-managed'|'none'|'unknown';receipt?:NativeErasureRoleReceipt}>;
type Receipt={env:Env;proof:Readonly<AccountErasureProof>;targetJSON:string;nonce:string;checkedAt:number;check:()=>void};
const receipts=new WeakMap<NativeErasureRoleReceipt,Receipt>();
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const literal=(v:string)=>"'"+v.replace(/'/g,"''")+"'";
const data=(o:unknown,k:string):unknown=>{if(!o||typeof o!=='object')throw Error('native_role_data');const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))throw Error('native_role_data');return d.value;};
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v)&&BigInt(v)<=18446744073709551615n;
function capture(env:Env){
  const proto=Object.getPrototypeOf(env),slots=KEYS.map(k=>{const d=Object.getOwnPropertyDescriptor(env,k);if(!d&&k in env||d&&!Object.hasOwn(d,'value'))throw Error('native_role_configuration');return d?Object.freeze({...d}):undefined;});
  const check=()=>{if(Object.getPrototypeOf(env)!==proto||!nativeErasureMode(env))throw Error('native_role_configuration_changed');for(let i=0;i<KEYS.length;i++){const d=Object.getOwnPropertyDescriptor(env,KEYS[i]!),old=slots[i];if(!old?!!d||KEYS[i]! in env:!d||['value','get','set','writable','enumerable','configurable'].some(k=>!Object.is(old[k as keyof PropertyDescriptor],d[k as keyof PropertyDescriptor])))throw Error('native_role_configuration_changed');}};
  const text=(k:typeof KEYS[number])=>{const d=slots[KEYS.indexOf(k)],v=d?.value;if(v!==undefined&&typeof v!=='string')throw Error('native_role_configuration');return v as string|undefined;};
  check();return {check,text};
}
function configuredTargets(text:(k:typeof KEYS[number])=>string|undefined,guild:string):Set<string>{
  const out=new Set<string>(guild===BETA_RESET_GUILD_ID?BETA_RESET_ROLE_IDS:[]);
  for(const k of ['ROLE_GUILD_MEMBER','MEMBERSHIP_RETIRED_ROLE_ID','ROLE_OFFICER','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER','ROLE_RAID_LEADER'] as const){const id=text(k);if(id){if(!validId(id))throw Error('native_role_configuration');out.add(id);}}
  if(!validId(text('ROLE_GUILD_MEMBER')))throw Error('native_role_configuration');
  const qr=text('QR_NATIVE_ROLE_MAP');if(qr&&qr!=='off'){const map=parseNativeRoleMap(qr);if(JSON.stringify({profile:map.profile,roles:map.roles})!==qr)throw Error('native_role_configuration');for(const id of map.roles)out.add(id);}
  // Even a disabled, explicitly retained policy names roles the account may
  // still hold. It supplies cleanup attribution, never native/staff authority.
  const native=text('NATIVE_RANK_SYNC232');if(native&&native!=='off'){
    const policy=parseNativeRankPolicy232(native);if(policy.guildId!==guild)throw Error('native_role_configuration');
    for(const rank of policy.ranks)out.add(rank.roleId);
  }
  const canonical=text('CANONICAL_RANKS233');if(canonical&&canonical!=='off'){
    const policy=parseCanonicalRankPolicy233(canonical);if(policy.guildId!==guild)throw Error('native_role_configuration');
    for(const rank of policy.ranks)out.add(rank.roleId);
  }
  const full=text('FULL_RELEASE_ROLES');if(full&&full!=='off'){if(full.length>1024)throw Error('native_role_configuration');const v=JSON.parse(full);if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).join(',')!=='version,epoch,epochStart,grants,membership,native'||v.version!==1||typeof v.epoch!=='string'||!/^olympus-full-release-[a-z0-9-]{1,32}$/.test(v.epoch)||!Number.isSafeInteger(v.epochStart)||v.epochStart<1792688400||typeof v.grants!=='boolean'||!Array.isArray(v.native)||v.native.length!==10||JSON.stringify(v)!==full)throw Error('native_role_configuration');const ids=[v.membership,...v.native];if(!ids.every(validId)||new Set(ids).size!==11)throw Error('native_role_configuration');for(const id of ids)out.add(id);}
  const treasury=text('TREASURY_COSMETIC_ROLES');if(treasury){if(treasury.length>1024)throw Error('native_role_configuration');const v=JSON.parse(treasury);if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).join(',')!=='version,guildId,applicationId,seasonStartsAt,roles'||v.version!==1||v.guildId!==guild||v.applicationId!==text('DISCORD_APP_ID')||!Number.isSafeInteger(v.seasonStartsAt)||v.seasonStartsAt<1||!v.roles||typeof v.roles!=='object'||Array.isArray(v.roles)||Object.keys(v.roles).join(',')!=='tithePayer,patron,benefactor'||JSON.stringify(v)!==treasury)throw Error('native_role_configuration');const ids=Object.values(v.roles);if(!ids.every(validId)||new Set(ids).size!==3)throw Error('native_role_configuration');for(const id of ids)out.add(id as string);}
  return out;
}
function roleInventory(value:unknown):readonly Role[]{
  if(!Array.isArray(value)||value.length>250)throw Error('native_role_inventory');const ids=new Set<string>();
  return value.map(x=>{const id=data(x,'id'),name=data(x,'name'),position=data(x,'position'),permissions=data(x,'permissions'),managed=data(x,'managed');
    if(!validId(id)||ids.has(id)||typeof name!=='string'||name.length>100||typeof position!=='number'||!Number.isSafeInteger(position)||position<0||typeof permissions!=='string'||!/^\d{1,24}$/.test(permissions)||typeof managed!=='boolean')throw Error('native_role_inventory');ids.add(id);return Object.freeze({id,name,position,permissions:BigInt(permissions),managed});});
}
function memberRoles(value:unknown,subject:string):readonly string[]{const roles=data(value,'roles'),user=data(value,'user');if(data(user,'id')!==subject||!Array.isArray(roles)||roles.length>250||roles.some(x=>!validId(x))||new Set(roles).size!==roles.length)throw Error('native_role_member');return Object.freeze(roles.slice());}
/** Guild-role absence does not revoke independent server permissions. An unrelated role's
 * channel overwrites are not known from this inventory, so absence of Administrator is not no-access proof. */
function retainedStaffAccess(present:readonly string[]|null,roles:readonly Role[],targets:ReadonlySet<string>,guild:string,moderator:string|undefined):NativeErasureRoleResult['staffAccess']{
  if(present===null)return 'none';
  const residual=present.filter(id=>id!==guild&&!targets.has(id));
  if(moderator&&residual.includes(moderator)||roles.some(r=>(r.id===guild||residual.includes(r.id))&&!!(r.permissions&8n)))return 'human-managed';
  return residual.length?'unknown':'none';
}
/** Only an internally issued fresh absence observation can be consumed by the terminal Native transaction.
 * The receipt does not assert that any old DELETE/PUT, root, journal or companion became known. */
export function nativeErasureRolesSettledSql(env:Env,input:AccountErasureProof,receipt:NativeErasureRoleReceipt):string{
  const saved=receipts.get(receipt),original=captureAccountErasureProof(input);original.check();if(!saved||saved.env!==env||JSON.stringify(saved.proof)!==JSON.stringify(original.proof))throw Error('native_role_receipt_unowned');saved.check();
  return `EXISTS(SELECT 1 FROM role_settlements nr WHERE nr.id=?1||'${SUFFIX}' AND nr.subject=?2 AND nr.subject_generation=?3 AND nr.request_digest=?4 AND nr.guild_id=${literal(env.GUILD_ID)} AND nr.purpose='${INVENTORY}' AND nr.desired=0 AND nr.attempts=0 AND nr.state='settled' AND nr.reason='observed_absent' AND nr.claim_nonce=${literal(saved.nonce)} AND nr.native_profile=${literal(saved.targetJSON)} AND nr.checked_at=${saved.checkedAt} AND nr.checked_at BETWEEN ${NOW}-60 AND ${NOW} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(saved.proof)}))`;
}
/** Native-only, at most two idempotent DELETEs per callback. Every retry has its own durable effect row.
 * Old unknown effects remain unknown; a new GET observation supplies only present-day absence. */
export async function cleanupNativeErasureRoles(env:Env,input:AccountErasureProof):Promise<NativeErasureRoleResult>{
  let attributed=0,removed=0,remaining=0,staffAccess:NativeErasureRoleResult['staffAccess']='unknown';
  const result=(state:NativeErasureRoleResult['state'],reason:string,checkedAt:number|null=null,receipt?:NativeErasureRoleReceipt):NativeErasureRoleResult=>({state,reason,checkedAt,attributed,removed,remaining,staffAccess,...(receipt?{receipt}:{})});
  let lease=false,nonce='',p:Readonly<AccountErasureProof>,binding:ReturnType<typeof capture>,targetJSON='';const sharedAcknowledged:{id:string;nonce:string}[]=[];
  try{if(!nativeErasureMode(env))return result('held','native_erasure_disabled');binding=capture(env);if(binding.text('PRIVACY_ERASURE_ENABLED')!=='true')return result('held','erasure_disabled');const original=captureAccountErasureProof(input);p=original.proof;original.check();if(!HEX.test(p.operationId)||!HEX.test(p.subjectGeneration)||!/^[0-9a-f]{64}$/.test(p.requestDigest)||!validId(p.subject)||!validId(env.GUILD_ID)||!validId(env.DISCORD_APP_ID))return result('held','native_role_proof_invalid');
    // Capture the selected venue before the first current-job/provider await. It is not a caller-supplied bypass.
    const selectedVenue=await captureRuntimeVenue230(env);binding.check();original.check();
    const sharedVenue:RuntimeVenue230|null=selectedVenue.mode==='enabled'?selectedVenue.venue:null;
    const check=()=>{binding.check();original.check();if(sharedVenue)assertRuntimeVenue230(env,sharedVenue);},values=[p.operationId,p.subject,p.subjectGeneration,p.requestDigest];
    const current=async()=>{check();const yes=await currentAccountErasureProof(env,p);check();return yes;};
    if(!await current())return result('held','request_not_current');
    const roles=roleInventory(await rest(env,'GET',`/guilds/${env.GUILD_ID}/roles`,undefined,1));if(!await current())return result('held','request_not_current');
    const targets=configuredTargets(binding.text,env.GUILD_ID);
    for(const names of COUNCIL){const matching=roles.filter(x=>names.includes(x.name));if(matching.length>1)return result('held','native_role_council_ambiguous');if(matching[0])targets.add(matching[0].id);}
    const history=await env.DB.prepare(`SELECT DISTINCT role_id FROM role_settlements WHERE subject=?2 AND guild_id=?5 AND purpose IN(${ATTRIBUTED.map(literal).join(',')}) AND ${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(p)}) LIMIT 65`).bind(...values,env.GUILD_ID).all<{role_id:string}>();check();
    if(history.results.length>MAX_TARGETS)return result('held','native_role_attribution_limit');for(const row of history.results){const id=data(row,'role_id');if(!validId(id))return result('held','native_role_attribution_invalid');targets.add(id);}
    if(targets.size>MAX_TARGETS)return result('held','native_role_attribution_limit');attributed=targets.size;
    const canonical=binding.text('CANONICAL_RANKS233'),canonicalPolicy=canonical&&canonical!=='off'?parseCanonicalRankPolicy233(canonical):null;
    const protectedRoles=new Set([env.GUILD_ID,env.DISCORD_APP_ID,ADDON_DEVELOPER233.roleId,...(canonicalPolicy?[]:[MANUAL_COUNCIL232]),binding.text('ROLE_MODERATOR')??'',...(binding.text('BLOCKING_ROLE_IDS')??'').split(',').map(x=>x.trim())]);
    if([...targets].some(id=>protectedRoles.has(id)))return result('held','native_role_protected_collision');
    targetJSON=JSON.stringify([...targets].sort());nonce=random();
    const authority=`${CURRENT_ERASURE_SQL} AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?1 AND ${originalErasureJobBirthSql(p)})`;
    await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,created_at,expires_at,native_profile) SELECT ?1||'${SUFFIX}',?2,'${INVENTORY}',?5,?6,0,'pending','awaiting_observation',?3,?4,${NOW},${NOW},?7 WHERE ${authority} ON CONFLICT(id)DO NOTHING`).bind(...values,env.GUILD_ID,env.ROLE_GUILD_MEMBER,targetJSON).run();check();
    const claimed=await env.DB.prepare(`UPDATE role_settlements SET state='dispatching',reason='observing',claim_nonce=?8,expires_at=${NOW}+120,checked_at=NULL WHERE id=?1||'${SUFFIX}' AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND guild_id=?5 AND role_id=?6 AND purpose='${INVENTORY}' AND desired=0 AND attempts=0 AND native_profile=?7 AND (state<>'dispatching' OR expires_at<=${NOW}) AND ${authority} RETURNING id`).bind(...values,env.GUILD_ID,env.ROLE_GUILD_MEMBER,targetJSON,nonce).first();check();
    if(!claimed)return result('held','native_role_inventory_busy_or_changed');lease=true;
    const owned=`id=?1||'${SUFFIX}' AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND purpose='${INVENTORY}' AND state='dispatching' AND attempts=0 AND native_profile=?5 AND claim_nonce=?6 AND expires_at>${NOW} AND ${authority}`;
    const readMember=async(id:string)=>{check();try{const m=await rest(env,'GET',`/guilds/${env.GUILD_ID}/members/${id}`,undefined,1);check();return memberRoles(m,id);}catch(e){check();if(e instanceof DiscordError&&e.status===404)return null;throw e;}};
    let present=await readMember(p.subject);if(!await current())return result('held','request_not_current');staffAccess=retainedStaffAccess(present,roles,targets,env.GUILD_ID,binding.text('ROLE_MODERATOR'));
    let wanted=[...targets].filter(id=>present?.includes(id));remaining=wanted.length;
    if(wanted.length){
      const bot=await rest(env,'GET','/users/@me',undefined,1);check();if(data(bot,'id')!==env.DISCORD_APP_ID||data(bot,'bot')!==true)return result('held','native_role_bot_identity');
      const botRoles=await readMember(env.DISCORD_APP_ID);if(!botRoles)return result('held','native_role_bot_not_member');
      const own=roles.filter(r=>r.id===env.GUILD_ID||botRoles.includes(r.id)),highest=Math.max(0,...own.map(r=>r.position)),permissions=own.reduce((all,r)=>all|r.permissions,0n);
      if(!(permissions&8n)&&!(permissions&268435456n))return result('held','native_role_manage_roles_missing');
      let blocked='';const removable=wanted.filter(id=>{if(oldSharedMemberProducerHeld230(env,env.GUILD_ID,id)&&!sharedVenue){blocked||='shared_member230_venue_held';return false;}const target=roles.find(r=>r.id===id);if(!target||target.managed||target.position>=highest){blocked||=target?.managed?'native_role_managed':target&&target.position>=highest?'native_role_above_bot':'native_role_inventory_unqualified';return false;}return true;});
      if(!removable.length)return result('held',blocked||'native_role_inventory_unqualified');
      for(const id of removable.slice(0,NATIVE_ERASURE_ROLE_DELETES)){
        if(!await current())return result('held','request_not_current');const attempt=random(),effectNonce=random();
        const shared=!!sharedVenue&&env.GUILD_ID===SHARED_MEMBER230_GUILD&&id===SHARED_MEMBER230_ROLE;
        const purpose=shared?'launch_membership_erasure230':NATIVE_ERASURE_ROLE_PURPOSE;
        const vf=shared?runtimeVenue230Facts(sharedVenue!):null,venueSQL=vf?`EXISTS(SELECT 1 FROM site_settings WHERE key=${literal(vf.sealKey)} AND value=${literal(vf.sealJSON)})`:'1=1';
        const effectCurrent=()=>{check();if(!shared&&oldSharedMemberProducerHeld230(env,env.GUILD_ID,id))throw Error('shared_member230_old_producer_held');};effectCurrent();
        const inserted=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,created_at,expires_at,native_profile,attempts) SELECT ?7,?2,'${purpose}',?8,?9,0,'dispatching','dispatching',?10,?3,?4,${NOW},${NOW}+120,?5,1 WHERE EXISTS(SELECT 1 FROM role_settlements WHERE ${owned}) AND ${venueSQL} RETURNING id`).bind(...values,targetJSON,nonce,attempt,env.GUILD_ID,id,effectNonce).first();effectCurrent();
        if(!inserted||!await current())return result('held','native_role_claim_changed');
        const admitted=await env.DB.prepare(`SELECT 1 AS admitted WHERE EXISTS(SELECT 1 FROM role_settlements WHERE ${owned}) AND EXISTS(SELECT 1 FROM role_settlements WHERE id=?7 AND purpose='${purpose}' AND state='dispatching' AND claim_nonce=?8 AND role_id=?9 AND subject=?2 AND subject_generation=?3 AND request_digest=?4) AND ${venueSQL}`).bind(...values,targetJSON,nonce,attempt,effectNonce,id).first();effectCurrent();if(!admitted)return result('held','native_role_claim_changed');
        try{await rest(env,'DELETE',`/guilds/${env.GUILD_ID}/members/${p.subject}/roles/${id}`,undefined,1,'olympus-verify: owner-authorized account erasure',undefined,false,effectCurrent);check();
          const ack=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='delete_acknowledged',checked_at=${NOW} WHERE id=?1 AND purpose='${purpose}' AND state='dispatching' AND claim_nonce=?2 RETURNING id`).bind(attempt,effectNonce).first();check();if(!ack)return result('unknown','native_role_ack_write_unknown');if(shared)sharedAcknowledged.push({id:attempt,nonce:effectNonce});removed++;
        }catch(e){check();await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='delete_outcome_unknown' WHERE id=?1 AND purpose='${purpose}' AND state='dispatching' AND claim_nonce=?2`).bind(attempt,effectNonce).run();check();return result('unknown',e instanceof DiscordError&&e.status===403?'native_role_provider_forbidden':'native_role_delete_unknown');}
      }
      present=await readMember(p.subject);if(!await current())return result('held','request_not_current');staffAccess=retainedStaffAccess(present,roles,targets,env.GUILD_ID,binding.text('ROLE_MODERATOR'));wanted=[...targets].filter(id=>present?.includes(id));remaining=wanted.length;
      // Only this callback's own DELETE ACK plus its confirming GET may complete the new-family receipt.
      // A later absence observation never upgrades an older unknown or lost ACK.
      if(sharedAcknowledged.length&&!present?.includes(SHARED_MEMBER230_ROLE))for(const own of sharedAcknowledged){
        const vf=runtimeVenue230Facts(sharedVenue!);check();const ack=await env.DB.prepare(`UPDATE role_settlements SET reason='launch230_delete_acknowledged_and_confirmed',checked_at=${NOW}
          WHERE id=?5 AND claim_nonce=?6 AND purpose='launch_membership_erasure230' AND subject=?2 AND subject_generation=?3 AND request_digest=?4 AND guild_id=${literal(SHARED_MEMBER230_GUILD)} AND role_id=${literal(SHARED_MEMBER230_ROLE)} AND state='settled' AND reason='delete_acknowledged'
          AND ${authority} AND EXISTS(SELECT 1 FROM site_settings WHERE key=?7 AND value=?8) RETURNING id`).bind(...values,own.id,own.nonce,vf.sealKey,vf.sealJSON).first();check();if(!ack)return result('unknown','native_role_confirmation_write_unknown');
      }
      if(wanted.length&&wanted.every(id=>!removable.includes(id)))return result('held',blocked||'native_role_cleanup_pending');
    }
    if(wanted.length)return result('held','native_role_cleanup_pending');
    const observed=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='observed_absent',checked_at=${NOW} WHERE ${owned} RETURNING checked_at`).bind(...values,targetJSON,nonce).first<{checked_at:number}>();check();
    if(!observed||!Number.isSafeInteger(observed.checked_at))return result('unknown','native_role_observation_unknown');
    const receipt=Object.freeze({}) as NativeErasureRoleReceipt;receipts.set(receipt,{env,proof:p,targetJSON,nonce,checkedAt:observed.checked_at,check});lease=false;return result('complete','observed_absent',observed.checked_at,receipt);
  }catch{return result('unknown','native_role_lookup_or_storage_unknown');}
  finally{if(lease)try{binding!.check();await env.DB.prepare(`UPDATE role_settlements SET state='held',reason='observation_incomplete' WHERE id=?1||'${SUFFIX}' AND purpose='${INVENTORY}' AND state='dispatching' AND claim_nonce=?2 AND attempts=0`).bind(p!.operationId,nonce).run();}catch{/* A lost lease/result remains non-terminal. A later bounded attempt may observe again. */}}
}
