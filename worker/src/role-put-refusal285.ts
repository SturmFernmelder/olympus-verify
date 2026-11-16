/** Original completed PUT refusals are known no-effect data, never an ACK,
 * ownership, cancellation, grant mandate or permission to retry. Ordinary
 * canonical64 grants only; manual-entitlement32 and every unknown stay held. */
import type {Env} from './env';
import {DB_NOW} from './account-generation-contracts';
import {privacyGenerationFenceSql} from './privacy-serving-authority';
import {uniqueJsonKeys} from './network-profile';
import {originalDiscordPutReplyFacts285,type OriginalDiscordPutReply285} from './discord';
import {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_RANKS233,NATIVE_CANONICAL_INDEX233} from './canonical-ranks233';
import {NATIVE_RANK_NAMES232} from './native-rank-reconciliation232';
import {NATIVE_RANK_SCHEMES} from './native-rank-constants';
import {MANAGED_RANK_COOLDOWN280,managedRankCooldownValidSql280,roleDeletePacing280} from './role-delete-refusal280';

export const CANONICAL_PUT_REFUSAL285='canonical-put-refusal-v1';
export const CANONICAL_PUT_REFUSAL_FIELDS285=['id','subject','purpose','proof_id','guild_id','role_id','desired','state','attempts','expires_at','roster_id','native_guid','native_profile','native_rank','native_rank_name','subject_generation','claim_nonce','created_at','request_digest','reason','checked_at'] as const;
type Scalar=string|number|null;
export type CanonicalPutRefusalTuple285=Readonly<Record<typeof CANONICAL_PUT_REFUSAL_FIELDS285[number],Scalar>>;
export type OriginalCanonicalPutRefusal285=Readonly<{kind:'source_original_canonical_put_refusal285'}>;
export type CanonicalPutRefusalFacts285=Readonly<{status:403|404|429;reason:string;checkedAt:number;due:number;check:()=>void}>;
export type CanonicalPutRefusalSource285=Readonly<{sql:string;values:readonly Scalar[]}>;
export type CanonicalPutRefusalData285=Readonly<{version:1;type:typeof CANONICAL_PUT_REFUSAL285;status:403|404|429;code:number|null;retryAfterSeconds:number}>;
const SAFE=Number.MAX_SAFE_INTEGER,HEX32=/^[0-9a-f]{32}$/,HEX64=/^[0-9a-f]{64}$/,ID=/^[0-9]{17,20}$/,GUID=/^Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}$/;
const REASON_KEYS=['version','type','status','code','retryAfterSeconds'] as const;
const originals=new WeakMap<OriginalCanonicalPutRefusal285,{env:Env;path:string;facts:CanonicalPutRefusalFacts285}>(),used=new WeakSet<OriginalDiscordPutReply285>();
const integer=(v:unknown,low=1,high=SAFE):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=low&&v<=high;
const ordinaryProfiles=()=>Object.freeze([{canonicalProfile:CANONICAL_PROFILE233,names:NATIVE_RANK_NAMES232,canonicalIndexes:NATIVE_CANONICAL_INDEX233},...NATIVE_RANK_SCHEMES]);
const all=(parts:readonly string[]):string=>{if(!parts.length)return '1=1';if(parts.length===1)return '('+parts[0]+')';const n=Math.ceil(parts.length/2);return '('+all(parts.slice(0,n))+' AND '+all(parts.slice(n))+')';};
const any=(parts:readonly string[]):string=>{if(!parts.length)return '0=1';if(parts.length===1)return '('+parts[0]+')';const n=Math.ceil(parts.length/2);return '('+any(parts.slice(0,n))+' OR '+any(parts.slice(n))+')';};
const quoted=(s:string)=>"'"+s+"'";
const hexSql=(s:string,n:number)=>all(["typeof("+s+")='text'",'length('+s+')='+n,'length(CAST('+s+' AS BLOB))='+n,'instr('+s+',char(0))=0',s+" NOT GLOB '*[^0-9a-f]*'"]);
const intSql=(s:string,low=1)=>all(["typeof("+s+")='integer'",s+'>='+low,s+'<='+SAFE]);
const alias=(s:string)=>{if(!/^[a-z][a-z0-9_]{0,30}$/.test(s))throw Error('put_refusal_alias_held');return s;};
function guidSql(s:string):string{const tail='substr('+s+',8)',dash='instr('+tail+",'-')",realm='substr('+tail+',1,'+dash+'-1)',suffix='substr('+tail+','+dash+'+1)';return all(["typeof("+s+")='text'","substr("+s+",1,7)='Player-'",dash+' BETWEEN 2 AND 7',realm+" NOT GLOB '*[^0-9]*'",'length('+suffix+') BETWEEN 4 AND 16',suffix+" NOT GLOB '*[^0-9A-Fa-f]*'",'length(CAST('+s+' AS BLOB))=length('+s+')']);}
const rankCase=(slot:string,values:readonly (string|number)[])=>'(CASE '+slot+' '+values.map((x,i)=>'WHEN '+i+' THEN '+quoted(String(x))).join(' ')+' END)';
function reasonSql(a:string):string{
 const r=a+'.reason',j=(k:string)=>"json_extract("+r+",'$."+k+"')",t=(k:string)=>"json_type("+r+",'$."+k+"')";
 // Exact source-issued five-field encoding; never an ownership acknowledgement.
 const emitted="json_object('version',1,'type',"+quoted(CANONICAL_PUT_REFUSAL285)+",'status',"+j('status')+",'code',"+j('code')+",'retryAfterSeconds',"+j('retryAfterSeconds')+')';
 const codes="(CASE "+t('code')+" WHEN 'integer' THEN CASE "+j('status')+' WHEN 403 THEN '+j('code')+' IN(50001,50013) WHEN 404 THEN '+j('code')+' IN(10007,10011) WHEN 429 THEN '+j('code')+' BETWEEN 0 AND '+SAFE+" ELSE 0 END WHEN 'null' THEN "+j('status')+'=429 ELSE 0 END=1)';
 const shape=all(["json_type("+r+")='object'",r+'='+emitted,t('status')+"='integer'",t('retryAfterSeconds')+"='integer'",j('retryAfterSeconds')+' BETWEEN 0 AND 86401',codes,'('+j('status')+'=429 OR '+j('retryAfterSeconds')+'=0)',a+'.checked_at<='+SAFE+'-'+j('retryAfterSeconds')]);
 return '(CASE WHEN '+all(["typeof("+r+")='text'",'length(CAST('+r+' AS BLOB)) BETWEEN 1 AND 512',"instr(CAST("+r+" AS BLOB),x'00')=0",'json_valid('+r+')'])+' THEN CASE WHEN '+shape+' THEN 1 ELSE 0 END ELSE 0 END=1)';
}
/** Closed persisted observation only; an arbitrary reason cannot classify a row.
 * No settled state, identity anchor or ownership predicate consumes this as ACK. */
export function canonicalPutRefusalSql285(name:string):string{
 const a=alias(name),vocabulary=JSON.stringify(ordinaryProfiles().map(p=>[p.canonicalProfile,p.names.map((name,index)=>[name,CANONICAL_RANKS233[p.canonicalIndexes[index]!]!.roleId])])).replaceAll("'","''");
 // Both JSON paths are fixed. Even a malformed native_rank never forms a path
 // or borrows another rank's name/role: each pair is one source-owned table row.
 const native='EXISTS(SELECT 1 FROM json_each('+quoted(vocabulary)+") p285 CROSS JOIN json_each(p285.value,'$[1]') n285 WHERE "+all(["json_extract(p285.value,'$[0]')="+a+'.native_profile','n285.key='+a+'.native_rank',a+".native_rank_name=json_extract(n285.value,'$[0]')",a+".role_id=json_extract(n285.value,'$[1]')"])+')';
 return all([a+'.guild_id='+quoted(CANONICAL_GUILD233),a+".purpose='canonical_routine233'",a+'.proof_id IS NULL',"typeof("+a+".desired)='integer'",a+'.desired=1',a+".state='held'",a+'.attempts=1',
  hexSql(a+'.id',32),hexSql(a+'.claim_nonce',32),hexSql(a+'.request_digest',64),"typeof("+a+".subject)='text'",'length('+a+'.subject) BETWEEN 17 AND 20','length(CAST('+a+'.subject AS BLOB))=length('+a+'.subject)',a+".subject NOT GLOB '*[^0-9]*'",any([a+'.subject_generation IS NULL',hexSql(a+'.subject_generation',32)]),
  intSql(a+'.created_at'),intSql(a+'.expires_at'),a+'.expires_at>'+a+'.created_at',a+'.expires_at<='+a+'.created_at+300',intSql(a+'.checked_at'),a+'.checked_at>='+a+'.created_at',intSql(a+'.roster_id'),
  guidSql(a+'.native_guid'),"typeof("+a+".native_rank)='integer'",a+'.native_rank BETWEEN 0 AND 9',native,reasonSql(a)]);
}
export function readCanonicalPutRefusal285(raw:unknown):CanonicalPutRefusalData285|null{
 try{if(typeof raw!=='string'||raw.includes('\0')||new TextEncoder().encode(raw).length>512||!uniqueJsonKeys(raw))return null;const v=JSON.parse(raw);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==5||Object.keys(v).some(k=>!REASON_KEYS.includes(k as typeof REASON_KEYS[number]))||v.version!==1||v.type!==CANONICAL_PUT_REFUSAL285||!integer(v.retryAfterSeconds,0,86401))return null;
  if(v.status===403){if(![50001,50013].includes(v.code)||v.retryAfterSeconds!==0)return null;}else if(v.status===404){if(![10007,10011].includes(v.code)||v.retryAfterSeconds!==0)return null;}else if(v.status===429){if(v.code!==null&&!integer(v.code,0))return null;}else return null;
  return Object.freeze({version:1,type:CANONICAL_PUT_REFUSAL285,status:v.status,code:v.code,retryAfterSeconds:v.retryAfterSeconds});
 }catch{return null;}
}
/** Consume only a private transport cap already taken by the original request
 * bridge. Copied facts, status-only errors and cross-env/path caps are rejected. */
export function captureCanonicalPutRefusal285(env:Env,transport:OriginalDiscordPutReply285,path:string):OriginalCanonicalPutRefusal285|null{
 try{if(used.has(transport))return null;const f=originalDiscordPutReplyFacts285(transport,env,path);if(f.method!=='PUT'||f.path!==path)return null;
  let checkedAt=Math.floor(f.eofSeconds),due=checkedAt,delta=0;
  if(f.status===403||f.status===404){if(!(f.status===403?[50001,50013]:[10007,10011]).includes(f.code as number)||f.retryAfterBodySeconds!==null||f.retryAfterHeaderSeconds!==null&&f.retryAfterHeaderSeconds!==0)return null;}
  else if(f.status===429){if(typeof f.global!=='boolean'||f.code!==null&&!integer(f.code,0))return null;const pacing=roleDeletePacing280(f.eofSeconds,f.retryAfterHeaderSeconds,f.retryAfterBodySeconds);if(!pacing)return null;checkedAt=pacing.checkedAt;due=pacing.due;delta=pacing.retryAfterSeconds;}else return null;
  if(!integer(checkedAt)||!integer(due,checkedAt))return null;
  const reason=JSON.stringify({version:1,type:CANONICAL_PUT_REFUSAL285,status:f.status,code:f.code,retryAfterSeconds:delta});
  if(!readCanonicalPutRefusal285(reason))return null;
  const check=()=>{if(originalDiscordPutReplyFacts285(transport,env,path)!==f)throw Error('original_put_refusal_changed');};check();
  const facts=Object.freeze({status:f.status,reason,checkedAt,due,check}),cap=Object.freeze({kind:'source_original_canonical_put_refusal285' as const});used.add(transport);originals.set(cap,{env,path,facts});return cap;
 }catch{return null;}
}
export function canonicalPutRefusalFacts285(cap:OriginalCanonicalPutRefusal285):CanonicalPutRefusalFacts285{const r=originals.get(cap);if(!r)throw Error('original_put_refusal_held');r.facts.check();return r.facts;}
export function canonicalPutRefusalSourceStart285():number{return CANONICAL_PUT_REFUSAL_FIELDS285.length+4;}
function snapshot(original:CanonicalPutRefusalTuple285):CanonicalPutRefusalTuple285{
 if(!original||typeof original!=='object')throw Error('original_put_tuple_held');const value:Record<string,Scalar>={};
 for(const k of CANONICAL_PUT_REFUSAL_FIELDS285){const d=Object.getOwnPropertyDescriptor(original,k);if(!d||!Object.hasOwn(d,'value')||d.value!==null&&typeof d.value!=='string'&&typeof d.value!=='number')throw Error('original_put_tuple_held');value[k]=d.value;}
 const o=value as CanonicalPutRefusalTuple285,p=ordinaryProfiles().find(p=>p.canonicalProfile===o.native_profile);
 if(typeof o.id!=='string'||!HEX32.test(o.id)||typeof o.subject!=='string'||!ID.test(o.subject)||o.guild_id!==CANONICAL_GUILD233||o.purpose!=='canonical_routine233'||o.proof_id!==null||o.desired!==1||o.state!=='dispatching'||o.attempts!==1||typeof o.claim_nonce!=='string'||!HEX32.test(o.claim_nonce)||typeof o.request_digest!=='string'||!HEX64.test(o.request_digest)||!integer(o.created_at)||!integer(o.expires_at)||o.expires_at<=o.created_at||o.expires_at>o.created_at+300||!integer(o.roster_id)||typeof o.native_guid!=='string'||!GUID.test(o.native_guid)||!integer(o.native_rank,0,9)||!p||o.native_rank_name!==p.names[o.native_rank]||o.role_id!==CANONICAL_RANKS233[p.canonicalIndexes[o.native_rank]!]!.roleId||o.subject_generation!==null&&(typeof o.subject_generation!=='string'||!HEX32.test(o.subject_generation))||o.checked_at!==null&&!integer(o.checked_at)||typeof o.reason!=='string')throw Error('original_put_tuple_held');return Object.freeze(value) as CanonicalPutRefusalTuple285;
}
/** Prepare only. The central Native writer executes the atomic batch and uses
 * its original full-row reader to confirm expected exactly; no effect/ACK here. */
export function planCanonicalPutRefusal285(env:Env,original:CanonicalPutRefusalTuple285,cap:OriginalCanonicalPutRefusal285,source:CanonicalPutRefusalSource285,integrity:()=>void):Readonly<{statements:readonly [D1PreparedStatement,D1PreparedStatement];expected:CanonicalPutRefusalTuple285;facts:CanonicalPutRefusalFacts285;check:()=>void}>{
 const r=originals.get(cap);if(!r||r.env!==env||typeof integrity!=='function'||!source||typeof source.sql!=='string'||!source.sql||!Array.isArray(source.values))throw Error('original_put_refusal_held');
 const o=snapshot(original),f=r.facts;if(f.checkedAt<Number(o.created_at))throw Error('original_put_reply_clock_held');const path='/guilds/'+o.guild_id+'/members/'+o.subject+'/roles/'+o.role_id;if(path!==r.path)throw Error('original_put_path_held');
 const fields=CANONICAL_PUT_REFUSAL_FIELDS285,values:Scalar[]=fields.map(k=>o[k]),reasonAt=values.length+1,checkedAt=reasonAt+1,dueAt=checkedAt+1;values.push(f.reason,f.checkedAt,f.due);
 if(values.length+1!==canonicalPutRefusalSourceStart285()||values.length+source.values.length>100||source.values.some(v=>v!==null&&typeof v!=='string'&&!(typeof v==='number'&&Number.isFinite(v))))throw Error('original_put_source_slots_held');
 const before=all(fields.map((k,i)=>k+' IS ?'+(i+1))),expected=Object.freeze({...o,state:'held',reason:f.reason,checked_at:f.checkedAt});
 const after=all([...fields.filter(k=>k!=='state'&&k!=='reason'&&k!=='checked_at').map(k=>k+' IS ?'+(fields.indexOf(k)+1)),"state='held'",'reason=?'+reasonAt,'checked_at=?'+checkedAt]);
 const valid=managedRankCooldownValidSql280('site_settings'),oldDue='(CASE WHEN '+valid+" THEN json_extract(site_settings.value,'$.due') ELSE NULL END)",malformed="NOT EXISTS(SELECT 1 FROM site_settings WHERE key='"+MANAGED_RANK_COOLDOWN280+"' AND NOT("+valid+'))';
 const generationSql=privacyGenerationFenceSql(fields.indexOf('subject')+1,fields.indexOf('subject_generation')+1);
 const names=['put285_source','put285_generation','put285_service'],predicates=[source.sql,generationSql,f.status===429?malformed:'1=1'];
 const facts='WITH '+names.map((name,i)=>name+' AS MATERIALIZED(SELECT 1 WHERE '+predicates[i]+')').join(',')+',put285_tuple AS MATERIALIZED(SELECT rowid AS put285_row FROM role_settlements WHERE '+all([before,'?'+dueAt+' IS NOT NULL'])+') ';
 const guard=all(['rowid IN(SELECT put285_row FROM put285_tuple)','EXISTS(SELECT 1 FROM '+names.join(' CROSS JOIN ')+')']);
 const check=()=>{integrity();r.facts.check();const current=snapshot(original);if(fields.some(k=>current[k]!==o[k]))throw Error('original_put_tuple_changed');};check();
 const role=env.DB.prepare(facts+"UPDATE role_settlements SET state='held',reason=?"+reasonAt+',checked_at=?'+checkedAt+' WHERE '+guard+' RETURNING *,NULL AS beta_window_id').bind(...values,...source.values);
 const second=f.status===429?env.DB.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) SELECT '"+MANAGED_RANK_COOLDOWN280+"',json_object('version',1,'due',CAST(?"+dueAt+' AS INTEGER)),'+DB_NOW+',NULL WHERE changes()=1 AND EXISTS(SELECT 1 FROM role_settlements WHERE '+after+') AND '+malformed+' ON CONFLICT(key) DO UPDATE SET value=CASE WHEN '+oldDue+'<?'+dueAt+' THEN excluded.value ELSE site_settings.value END,updated_at=CASE WHEN '+oldDue+'<?'+dueAt+' THEN excluded.updated_at ELSE site_settings.updated_at END,updated_by=NULL WHERE '+valid+' AND changes()=1 AND EXISTS(SELECT 1 FROM role_settlements WHERE '+after+') RETURNING key AS id,value AS reason').bind(...values):env.DB.prepare('SELECT id,reason FROM role_settlements WHERE 0');check();
 return Object.freeze({statements:Object.freeze([role,second]) as readonly [D1PreparedStatement,D1PreparedStatement],expected,facts:f,check});
}
