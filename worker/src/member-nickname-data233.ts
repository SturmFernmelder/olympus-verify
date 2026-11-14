/** Owner item3 (6 Nov2026): an own-only nickname preference and original effect custody.
 * Private values never enter the general settings reader, audit or public guide. */
import type { Env } from './env';
import { registerCommunityData,type ExportPlan } from './community-data-registry';

export const NICKNAME_GUILD233='236932545793490944';
export const NICKNAME_PREFIX233='nickname233:';
export const NICKNAME_SETTINGS_FILTER233="(key < 'nickname233:' OR key >= 'nickname233;')";
const ID=/^[1-9][0-9]{16,19}$/,HEX=/^[0-9a-f]{32}$/;
export type NicknameState233='dispatching'|'unknown'|'acknowledged'|'applied'|'refused';
export type NicknameRecord233=Readonly<{v:1;guild:string;generation:string|null;previous:string|null;desired:string|null;expected:string|null;
 state:NicknameState233;action:'use'|'reset';operation:string;nonce:string;createdAt:number;updatedAt:number}>;
export function nicknameKey233(subject:string):string{if(!ID.test(subject))throw Error('nickname_subject_held');return NICKNAME_PREFIX233+NICKNAME_GUILD233+':'+subject;}
export function validStoredNickname233(n:unknown):n is string|null{
 if(n===null)return true;if(typeof n!=='string'||!n||Array.from(n).length>32||/[\u0000-\u001f\u007f]/u.test(n))return false;
 return !Array.from(n).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff);
}
export function parseNicknameRecord233(raw:unknown):NicknameRecord233|null{
 if(typeof raw!=='string'||raw.length>4096)return null;let r:Record<string,unknown>;try{r=JSON.parse(raw);}catch{return null;}
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='action,createdAt,desired,expected,generation,guild,nonce,operation,previous,state,updatedAt,v'
 ||r.v!==1||r.guild!==NICKNAME_GUILD233||r.generation!==null&&(typeof r.generation!=='string'||!HEX.test(r.generation))
 ||!validStoredNickname233(r.previous)||!validStoredNickname233(r.desired)||!validStoredNickname233(r.expected)
 ||!['dispatching','unknown','acknowledged','applied','refused'].includes(r.state as string)||!['use','reset'].includes(r.action as string)
 ||typeof r.operation!=='string'||!ID.test(r.operation)||typeof r.nonce!=='string'||!HEX.test(r.nonce)
 ||!Number.isSafeInteger(r.createdAt)||(r.createdAt as number)<1||!Number.isSafeInteger(r.updatedAt)||(r.updatedAt as number)<(r.createdAt as number))return null;
 return Object.freeze(r) as NicknameRecord233;
}
export function nicknameOwnProjection233(raw:unknown):Record<string,unknown>{
 if(raw===undefined||raw===null)return {retained:false};const r=parseNicknameRecord233(raw);
 if(!r)return {retained:true,state:'unclassified_or_erased',nicknameValuesWithheld:true};
 return {retained:true,previousNickname:r.previous,requestedNickname:r.desired,state:r.state,action:r.action,createdAt:r.createdAt,updatedAt:r.updatedAt,
  scope:'Your server nickname preference. Operation nonces, generation, interaction identifiers and provider credentials are omitted.'};
}
/** An erased unknown still fences later writes. Erasure removes all nickname text,
 * never claims that an already-dispatched request was cancelled or drained. */
export function nicknameUnresolvedSql233(parameter:'?1'|'?2'):string{
 if(parameter!=='?1'&&parameter!=='?2')throw Error('nickname_parameter_held');
 return `EXISTS(SELECT 1 FROM site_settings nk WHERE nk.key='${NICKNAME_PREFIX233}${NICKNAME_GUILD233}:'||${parameter}
 AND CASE WHEN NOT json_valid(nk.value) THEN 1 WHEN json_type(nk.value)<>'object' THEN 1
 WHEN COALESCE(json_extract(nk.value,'$.state'),'') IN('acknowledged','applied','refused') THEN 0 ELSE 1 END)`;
}
/** The guarded eraser has removed the nickname text but not settled its PATCH.
 * Only its exact marker permits account cleanup; the ordinary write fence above
 * remains unresolved, and late original receipt updates still match zero rows. */
export function nicknameErasureUnresolvedSql233(parameter:'?1'|'?2'):string{
 const unresolved=nicknameUnresolvedSql233(parameter);
 return `(${unresolved}) AND NOT EXISTS(SELECT 1 FROM site_settings nk
 WHERE nk.key='${NICKNAME_PREFIX233}${NICKNAME_GUILD233}:'||${parameter}
 AND nk.value IS '{"v":1,"state":"erased_unknown"}')`;
}
export function nicknameEraseStatements233(env:Env,subject:string):D1PreparedStatement[]{const key=nicknameKey233(subject);return [
 env.DB.prepare(`UPDATE site_settings SET value='{"v":1,"state":"erased_unknown"}',updated_at=CAST(strftime('%s','now') AS INTEGER),updated_by=NULL WHERE key=?1
 AND CASE WHEN NOT json_valid(value) THEN 1 WHEN json_type(value)<>'object' THEN 1 WHEN COALESCE(json_extract(value,'$.state'),'') IN('acknowledged','applied','refused') THEN 0 ELSE 1 END`).bind(key),
 env.DB.prepare(`DELETE FROM site_settings WHERE key=?1 AND CASE WHEN NOT json_valid(value) THEN 0 WHEN json_type(value)<>'object' THEN 0 ELSE COALESCE(json_extract(value,'$.state'),'') IN('acknowledged','applied','refused') END`).bind(key),
 ];}
/** The private Native terminal path already redacted this exact subject under
 * its original job guard. Recheck that fact atomically, without repeating both
 * erasers. Any reappearing value refuses the entire terminal transaction. */
export function nicknameErasureAssertion233(env:Env,subject:string):D1PreparedStatement{
 return env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM site_settings WHERE key=?1
 AND value IS NOT '{"v":1,"state":"erased_unknown"}') THEN 1
 ELSE json_extract('nickname_terminal_redaction_held','$') END AS current`).bind(nicknameKey233(subject));
}
export function nicknameExportPlan233(env:Env,subject:string):ExportPlan{return {
 statements:[env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(nicknameKey233(subject))],
 shape:r=>({preference:nicknameOwnProjection233((r[0]?.results[0] as {value?:unknown}|undefined)?.value)}),
 packed:{maxRows:1,selectSql:`SELECT '' AS entry,json_object('record',value) AS value FROM site_settings WHERE key='${NICKNAME_PREFIX233}${NICKNAME_GUILD233}:'||?1`,
  shape:rows=>{if(rows.length>1||rows.length===1&&(rows[0]!.entry!==''||!rows[0]!.value||typeof rows[0]!.value!=='object'||Array.isArray(rows[0]!.value)||Object.keys(rows[0]!.value as object).join(',')!=='record'))throw Error('privacy_copy_unconfirmed');return {preference:nicknameOwnProjection233((rows[0]?.value as {record?:unknown}|undefined)?.record)};}}
};}
registerCommunityData('member_nickname',nicknameEraseStatements233,nicknameExportPlan233);
