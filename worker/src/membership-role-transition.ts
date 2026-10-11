/** Next-release preparation: exact opt-in central membership custody, independent of QR/erasure.
 * No role IDs are selected here; a retired binding only permits removal/GET custody, never a grant.
 */
import type { Env } from './env';
import { parseNativeRoleMap } from './native-rank-adapter';
export const membershipTransitionEnabled=(env:Env)=>env.MEMBERSHIP_ROLE_SETTLEMENT_ENABLED==='true';
export const membershipSettlementEnabled=(env:Env)=>membershipTransitionEnabled(env)||env.QR_PHASE1_ENABLED==='true'||env.PRIVACY_ERASURE_ENABLED==='true';
export type MembershipTargets=Readonly<{guild:string;current:string;retired:string|null;transition:boolean}>;
export function membershipTargets(env:Env):MembershipTargets {
 const current=env.ROLE_GUILD_MEMBER,retired=env.MEMBERSHIP_RETIRED_ROLE_ID;
 if(!/^\d{17,20}$/.test(env.GUILD_ID)||!/^\d{17,20}$/.test(current))throw Error('membership_configuration');
 if(!membershipTransitionEnabled(env))return Object.freeze({guild:env.GUILD_ID,current,retired:null,transition:false});
 const reserved=[env.GUILD_ID,env.DISCORD_APP_ID,env.ROLE_OFFICER,env.ROLE_MODERATOR,env.ROLE_GUILD_LEADER,env.ROLE_GUILD_MASTER,env.ROLE_RAID_LEADER,...(env.BLOCKING_ROLE_IDS??'').split(',').map(s=>s.trim())];
 if(env.QR_NATIVE_ROLE_MAP!==undefined&&env.QR_NATIVE_ROLE_MAP!=='')reserved.push(...parseNativeRoleMap(env.QR_NATIVE_ROLE_MAP).roles);
 if(reserved.includes(current)||retired!==undefined&&retired!==''&&(!/^\d{17,20}$/.test(retired)||retired===current||reserved.includes(retired)))throw Error('membership_configuration');
 return Object.freeze({guild:env.GUILD_ID,current,retired:retired||null,transition:true});
}
export function membershipTargetsCurrent(env:Env,original:MembershipTargets):boolean {
 try{const live=membershipTargets(env);return live.guild===original.guild&&live.current===original.current&&live.retired===original.retired&&live.transition===original.transition;}catch{return false;}
}
