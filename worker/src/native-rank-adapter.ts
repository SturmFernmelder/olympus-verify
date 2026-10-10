/** Native ordinal has meaning only within its exact named profile. No appointment/status grants. */
import { BETA_RANKS,NATIVE_RANKS } from './qr-phase1';
export type RankRoleMap={profile:'beta-five'|'ten-rank';roles:readonly string[]};
export function identifyNativeProfile(rows:readonly {rank:string;rank_index:number}[]):RankRoleMap['profile']{
 const fits=(names:readonly string[])=>rows.length>0&&rows.every(r=>Number.isInteger(r.rank_index)&&names[r.rank_index]===r.rank);
 const five=fits(BETA_RANKS),ten=fits(NATIVE_RANKS);if(five===ten)throw Error('native_profile_ambiguous_or_contradictory');return five?'beta-five':'ten-rank';
}
export function parseNativeRoleMap(raw:unknown):RankRoleMap {
 if(typeof raw!=='string'||raw.length>1024)throw Error('rank_map_unconfigured');let v:unknown;try{v=JSON.parse(raw);}catch{throw Error('rank_map_unconfigured');}
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='profile,roles')throw Error('rank_map_invalid');
 const x=v as RankRoleMap,expected=x.profile==='beta-five'?5:x.profile==='ten-rank'?10:0;
 if(!expected||!Array.isArray(x.roles)||x.roles.length!==expected||x.roles.some(id=>typeof id!=='string'||!/^\d{17,20}$/.test(id))||new Set(x.roles).size!==expected)throw Error('rank_map_invalid');
 return Object.freeze({profile:x.profile,roles:Object.freeze(x.roles.slice())});
}
export function mappedNativeRole(rankName:string,index:number,map:RankRoleMap):string {
 const names=map.profile==='beta-five'?BETA_RANKS:NATIVE_RANKS;
 if(!Number.isInteger(index)||index<0||index>=names.length||names[index]!==rankName)throw Error('native_profile_name_index_mismatch');return map.roles[index];
}
/** Closed staff mapping, separately OFF by default. Courtesy ranks never imply appointments/council access. */
export function privilegedNativeMap(profile:RankRoleMap['profile'],env:{ROLE_GUILD_LEADER:string;ROLE_OFFICER:string;ROLE_RAID_LEADER:string}) {
 const all=[env.ROLE_GUILD_LEADER,env.ROLE_OFFICER,env.ROLE_RAID_LEADER];
 if(all.some(x=>typeof x!=='string'||!/^\d{17,20}$/.test(x))||new Set(all).size!==3)throw Error('privileged_rank_configuration');
 return {roles:all,wanted:(name:string,index:number)=>{
 const names=profile==='beta-five'?BETA_RANKS:NATIVE_RANKS;if(names[index]!==name)throw Error('native_profile_name_index_mismatch');
 return name==='Guild Master'&&index===0?all[0]:name==='Officer'&&index===(profile==='beta-five'?1:2)?all[1]:profile==='ten-rank'&&name==='Raid Leader'&&index===4?all[2]:null;
 }};
}
