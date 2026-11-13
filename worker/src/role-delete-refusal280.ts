/** Closed historical data and SQL readers only. This module cannot issue a transport,
 * Native ACK, role mandate, ownership receipt or permission to replay an operation.
 * The sole writer consumes the private original DELETE witness in role-settlements. */
import {uniqueJsonKeys} from './network-profile';
import {DB_NOW} from './account-generation-contracts';
import {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_MANAGED_ROLE_IDS233} from './canonical-ranks233';
import {DIRECTIVE_CANONICAL_PROFILE,DIRECTIVE_RANK_NAMES} from './native-rank-constants';
import {NATIVE_RANK_NAMES232} from './native-rank-reconciliation232';

export const MANAGED_RANK_COOLDOWN280='role.managed.cooldown280';
export const CANONICAL_DELETE_REFUSAL280='canonical-routine-refusal-v1';
export const BAN_DELETE_REFUSAL280='ban-rank-refusal-v2';
const BAN_PROFILE='olympus-ban-rank-removal-20261112-v1';
const SAFE=9_007_199_254_740_991;
const REASON_KEYS=['version','type','status','code','retryAfterSeconds'] as const;
export type RoleDeleteRefusal280=Readonly<{version:1|2;type:typeof CANONICAL_DELETE_REFUSAL280|typeof BAN_DELETE_REFUSAL280;status:403|404|429;code:number|null;retryAfterSeconds:number;mandate?:string}>;
const integer=(v:unknown,low:number,high:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=low&&v<=high;
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;}
/** Decode stored data, never a source-proof constructor. Unsupported data remains held. */
export function readRoleDeleteRefusal280(raw:unknown):RoleDeleteRefusal280|null{
 try{
  if(typeof raw!=='string'||raw.includes('\0')||new TextEncoder().encode(raw).length>512||!uniqueJsonKeys(raw))return null;
  const v:unknown=JSON.parse(raw);if(!object(v))return null;const ban=v.type===BAN_DELETE_REFUSAL280,keys:readonly string[]=ban?[...REASON_KEYS,'mandate']:REASON_KEYS;
  if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))||v.version!==(ban?2:1)||(v.type!==CANONICAL_DELETE_REFUSAL280&&!ban)||!integer(v.retryAfterSeconds,0,86401)
   ||ban&&(typeof v.mandate!=='string'||v.mandate.length!==32||!/^([0-9a-f]{32})$/.test(v.mandate)))return null;
  if(v.status===403){if(![50001,50013].includes(v.code as number)||v.retryAfterSeconds!==0)return null;}
  else if(v.status===404){if(![10007,10011].includes(v.code as number)||v.retryAfterSeconds!==0)return null;}
  else if(v.status===429){if(v.code!==null&&!integer(v.code,0,SAFE))return null;}
  else return null;
  return Object.freeze({version:ban?2:1,type:v.type as typeof CANONICAL_DELETE_REFUSAL280|typeof BAN_DELETE_REFUSAL280,status:v.status,code:v.code as number|null,retryAfterSeconds:v.retryAfterSeconds,...ban?{mandate:v.mandate as string}:{}});
 }catch{return null;}
}
export function readManagedRankCooldown280(raw:unknown):Readonly<{version:1;due:number}>|null{
 try{
  if(typeof raw!=='string'||raw.includes('\0')||new TextEncoder().encode(raw).length>128||!uniqueJsonKeys(raw))return null;
  const v:unknown=JSON.parse(raw);return object(v)&&Object.keys(v).length===2&&Object.keys(v).every(k=>k==='version'||k==='due')
   &&v.version===1&&integer(v.due,1,SAFE)?Object.freeze({version:1,due:v.due}):null;
 }catch{return null;}
}
/** Arithmetic only, not a provider/Native/effect witness. Source delays are seconds. */
export function roleDeletePacing280(eofSeconds:number,header:number|null,body:number|null):Readonly<{checkedAt:number;due:number;retryAfterSeconds:number}>|null{
 if(typeof eofSeconds!=='number'||!Number.isFinite(eofSeconds)||eofSeconds<=0)return null;
 const delays=[header,body].filter((v):v is number=>v!==null);
 if(!delays.length||delays.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>86400))return null;
 const checkedAt=Math.floor(eofSeconds),due=Math.ceil(eofSeconds+Math.max(...delays)),delta=due-checkedAt;
 if(!integer(checkedAt,1,SAFE)||!integer(due,checkedAt,SAFE)||!integer(delta,0,86401))return null;
 return Object.freeze({checkedAt,due,retryAfterSeconds:delta});
}

function alias(a:string):string{if(!/^[a-z][a-z0-9_]*$/.test(a))throw Error('role_refusal_alias_held');return a;}
function all(parts:readonly string[]):string{
 if(parts.length===0)return '1=1';if(parts.length===1)return '('+parts[0]+')';const n=Math.ceil(parts.length/2);return '('+all(parts.slice(0,n))+' AND '+all(parts.slice(n))+')';
}
function any(parts:readonly string[]):string{
 if(parts.length===0)return '0=1';if(parts.length===1)return '('+parts[0]+')';const n=Math.ceil(parts.length/2);return '('+any(parts.slice(0,n))+' OR '+any(parts.slice(n))+')';
}
function hex(value:string,n:number):string{return all([`typeof(${value})='text'`,`length(${value})=${n}`,`length(CAST(${value} AS BLOB))=${n}`,`instr(${value},char(0))=0`,`${value} NOT GLOB '*[^0-9a-f]*'`]);}
function safeInt(value:string,low=1):string{return all([`typeof(${value})='integer'`,`${value}>=${low}`,`${value}<=${SAFE}`]);}
function closedKeys(value:string,keys:readonly string[]):string{
 return all([`(SELECT COUNT(*) FROM json_each(${value}))=${keys.length}`,`(SELECT COUNT(DISTINCT key) FROM json_each(${value}))=${keys.length}`,
  `NOT EXISTS(SELECT 1 FROM json_each(${value}) k280 WHERE k280.key NOT IN(${keys.map(k=>"'"+k+"'").join(',')}) OR instr(CAST(k280.key AS BLOB),x'00')>0 OR length(CAST(k280.key AS BLOB))<>length(k280.key))`]);
}
function validJson(value:string,maximum:number):string{return all([`typeof(${value})='text'`,`length(CAST(${value} AS BLOB)) BETWEEN 1 AND ${maximum}`,`instr(CAST(${value} AS BLOB),x'00')=0`,`json_valid(${value})`]);}
/** All JSON operations are inside the valid-JSON CASE. Decoded duplicate/extra keys,
 * booleans/reals, embedded NUL and unsupported codes never classify a role effect. */
function reasonSql(a:string,type:string):string{
 const r=a+'.reason',j=(k:string)=>`json_extract(${r},'$.${k}')`,t=(k:string)=>`json_type(${r},'$.${k}')`;
 const ban=type===BAN_DELETE_REFUSAL280;
 const shape=all([`json_type(${r})='object'`,closedKeys(r,ban?[...REASON_KEYS,'mandate']:REASON_KEYS),`${t('version')}='integer'`,`${j('version')}=${ban?2:1}`,...ban?[hex(j('mandate'),32)]:[],`${t('type')}='text'`,`${j('type')}='${type}'`,`${t('status')}='integer'`,`${t('retryAfterSeconds')}='integer'`,`${j('retryAfterSeconds')} BETWEEN 0 AND 86401`,
  any([all([`${j('status')}=403`,`${t('code')}='integer'`,`${j('code')} IN(50001,50013)`,`${j('retryAfterSeconds')}=0`]),all([`${j('status')}=404`,`${t('code')}='integer'`,`${j('code')} IN(10007,10011)`,`${j('retryAfterSeconds')}=0`]),all([`${j('status')}=429`,any([`${t('code')}='null'`,all([`${t('code')}='integer'`,`${j('code')} BETWEEN 0 AND ${SAFE}`])])])]),
  `${a}.checked_at<=${SAFE}-${j('retryAfterSeconds')}`]);
 return `(CASE WHEN ${validJson(r,512)} THEN CASE WHEN ${shape} THEN 1 ELSE 0 END ELSE 0 END=1)`;
}
function common(a:string):readonly string[]{
 return [`${a}.guild_id='${CANONICAL_GUILD233}'`,`${a}.role_id IN(${CANONICAL_MANAGED_ROLE_IDS233.map(r=>"'"+r+"'").join(',')})`,`${a}.desired=0`,`${a}.state='held'`,`${a}.attempts=1`,
  hex(a+'.id',32),hex(a+'.claim_nonce',32),`typeof(${a}.subject)='text'`,`length(${a}.subject) BETWEEN 17 AND 20`,`length(CAST(${a}.subject AS BLOB))=length(${a}.subject)`,`${a}.subject NOT GLOB '*[^0-9]*'`,
  any([`${a}.subject_generation IS NULL`,hex(a+'.subject_generation',32)]),safeInt(a+'.created_at'),safeInt(a+'.expires_at'),`${a}.expires_at>${a}.created_at`,`${a}.expires_at<=${a}.created_at+300`,safeInt(a+'.checked_at'),`${a}.checked_at>=${a}.created_at`];
}
export function canonicalDeleteRefusalSql280(name:string):string{
 const a=alias(name),native=(names:readonly string[])=>all([safeInt(a+'.roster_id'),`typeof(${a}.native_guid)='text'`,`length(CAST(${a}.native_guid AS BLOB)) BETWEEN 1 AND 64`,`instr(${a}.native_guid,char(0))=0`,`typeof(${a}.native_rank)='integer'`,`${a}.native_rank BETWEEN 0 AND 9`,`${a}.native_rank_name=(CASE ${a}.native_rank ${names.map((n,i)=>`WHEN ${i} THEN '${n}'`).join(' ')} END)`]);
 const source=any([all([`${a}.native_guid IS NULL`,`${a}.native_rank IS NULL`,`${a}.native_rank_name IS NULL`,safeInt(a+'.roster_id')]),all([`${a}.native_profile='${CANONICAL_PROFILE233}'`,native(NATIVE_RANK_NAMES232)]),all([`${a}.native_profile='${DIRECTIVE_CANONICAL_PROFILE}'`,native(DIRECTIVE_RANK_NAMES)])]);
 return all([...common(a),`${a}.purpose='canonical_routine233'`,`${a}.proof_id IS NULL`,hex(a+'.request_digest',32),`${a}.native_profile IN('${CANONICAL_PROFILE233}','${DIRECTIVE_CANONICAL_PROFILE}')`,source,reasonSql(a,CANONICAL_DELETE_REFUSAL280)]);
}
export function banDeleteRefusalSql280(name:string):string{
 const a=alias(name);return all([...common(a),`${a}.purpose='canonical_ban_remove_v1'`,`${a}.native_profile='${BAN_PROFILE}'`,hex(a+'.proof_id',32),hex(a+'.request_digest',64),
  ...['roster_id','native_guid','native_rank','native_rank_name'].map(k=>`${a}.${k} IS NULL`),reasonSql(a,BAN_DELETE_REFUSAL280)]);
}
/** This row is service-only pacing, never subject history or effect/ownership proof. */
export function managedRankCooldownValidSql280(name:string):string{
 const a=alias(name),v=a+'.value',shape=all([`json_type(${v})='object'`,closedKeys(v,['version','due']),`json_type(${v},'$.version')='integer'`,`json_extract(${v},'$.version')=1`,`json_type(${v},'$.due')='integer'`,`json_extract(${v},'$.due') BETWEEN 1 AND ${SAFE}`]);
 return all([`${a}.key='${MANAGED_RANK_COOLDOWN280}'`,`${a}.updated_by IS NULL`,safeInt(a+'.updated_at'),`(CASE WHEN ${validJson(v,128)} THEN CASE WHEN ${shape} THEN 1 ELSE 0 END ELSE 0 END=1)`]);
}
export function managedRankCooldownAllowedSql280():string{
 return `NOT EXISTS(SELECT 1 FROM site_settings rate280 WHERE rate280.key='${MANAGED_RANK_COOLDOWN280}' AND (CASE WHEN ${managedRankCooldownValidSql280('rate280')} THEN CASE WHEN json_extract(rate280.value,'$.due')<=${DB_NOW} THEN 1 ELSE 0 END ELSE 0 END)=0)`;
}

/** Known permission/missing-member/role refusals require attended resolution;
 * expiration of a dispatch claim alone cannot authorize another automatic DELETE. */
export function manualRankRefusalSql280(name:string):string{
 const a=alias(name);return all([any([canonicalDeleteRefusalSql280(a),banDeleteRefusalSql280(a)]),`(CASE WHEN json_valid(${a}.reason) THEN json_extract(${a}.reason,'$.status') ELSE NULL END) IN(403,404)`]);
}
export function managedRankTargetAllowedSql280(subject:string,guild:string,role:string,binding:Readonly<{kind:'routine';generation:string;parent:string}|{kind:'ban';generation:string;mandate:string}>):string{
 const original=binding.kind==='routine'?binding.parent:binding.mandate;
 for(const v of [subject,guild,role,binding.generation,original])if(!/^\?[1-9]\d*$/.test(v))throw Error('role_refusal_parameter_held');
 const mandate=binding.kind==='routine'?all(["manual280.purpose='canonical_routine233'",`manual280.request_digest=${original}`]):all(["manual280.purpose='canonical_ban_remove_v1'",`(CASE WHEN json_valid(manual280.reason) THEN json_extract(manual280.reason,'$.mandate') ELSE NULL END)=${original}`]);
 return `NOT EXISTS(SELECT 1 FROM role_settlements manual280 WHERE ${all([`manual280.subject=${subject}`,`manual280.guild_id=${guild}`,`manual280.role_id=${role}`,`manual280.subject_generation IS ${binding.generation}`,mandate,manualRankRefusalSql280('manual280')])})`;
}
/** Data-only Native status for an original pacing read; never effect authority. */
export function managedRankCooldownStatusSql280():string{
 return `(CASE WHEN EXISTS(SELECT 1 FROM site_settings pace280 WHERE pace280.key='${MANAGED_RANK_COOLDOWN280}' AND NOT(${managedRankCooldownValidSql280('pace280')})) THEN 2 WHEN ${managedRankCooldownAllowedSql280()} THEN 0 ELSE 1 END)`;
}
