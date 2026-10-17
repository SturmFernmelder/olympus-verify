/** Data validation only. Authentication, original native custody and reopening remain the receiver's duties. */
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {originalPhysicalReplayMigrationEpoch,type OriginalPhysicalReplayMigration} from './privacy-serving-recovery-gate';
import {recoveryIsDataArray,recoveryParseDataJSON,recoveryScalarArrayJSON,recoveryScalarArraySha256} from './privacy-recovery-data-json';
import {ADMISSION_COOKIE_MIGRATION_SOURCES_JSON,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON} from './privacy-write-admission-catalogue';

const held=():never=>{throw new RecoveryFloorHeld();};
const sources=recoveryParseDataJSON(ADMISSION_COOKIE_MIGRATION_SOURCES_JSON);
const preSealSources=recoveryParseDataJSON(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON);
const targets=recoveryParseDataJSON(ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON);
const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x);
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=253402300799;
function own(value:unknown,key:string):unknown{
 if(!value||typeof value!=='object'||recoveryIsDataArray(value))return held();
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 if(!descriptor||!Object.hasOwn(descriptor,'value'))return held();
 return descriptor.value;
}
function tuple(raw:string,length:number):unknown[]{
 if(typeof raw!=='string'||raw.length>8192)return held();
 const value=recoveryParseDataJSON(raw);
 if(!recoveryIsDataArray(value)||value.length!==length||recoveryScalarArrayJSON(value)!==raw)return held();
 return value;
}

/** Exact v2 wire only; public legacy has no old epoch and cannot adopt the receiver's current Floor epoch. */
export async function validateOriginalProfileMigrationReceipt(raw:string,native:string,gate:string,physical?:OriginalPhysicalReplayMigration):Promise<readonly unknown[]>{
 const m=tuple(raw,17),f=tuple(native,12),g=tuple(gate,11);
 if(g[2]!==native||g[3]!=='closing_held'||!hex(g[4],32)||!hex(g[9],32)||!integer(g[10])||!hex(f[7],32))return held();
 if(m[0]!=='closed-profile-migration-v2'||m[1]!==native||m[2]!==gate||m[3]!==g[4]||!hex(m[4],32)||!integer(m[5])||!integer(m[6])||m[6]!==m[5]+300||m[5]<g[10]||m[9]!==g[9])return held();
 const sourceKind=m[7],layout=m[10];
 const restored=physical?originalPhysicalReplayMigrationEpoch(physical,raw,native,gate):null;if(restored&&(sourceKind!=='current-cookie'&&sourceKind!=='current-cookie-pre-seal'||restored.epoch!==m[8]))return held();
 if(sourceKind!=='pre-marker'&&sourceKind!=='marker'&&sourceKind!=='public-predecessor'&&sourceKind!=='current-cookie'&&sourceKind!=='current-cookie-pre-seal')return held();
 if(layout!=='canonical'&&layout!=='recorded-live-20261010')return held();
 if(sourceKind==='public-predecessor'){
  if(layout!=='recorded-live-20261010'||m[8]!==null)return held();
 }else if(!hex(m[8],32)||m[8]!==f[7]&&restored===null)return held();
 for(let i=11;i<=14;i++)if(!hex(m[i],64))return held();
 if(!integer(m[15])||!integer(m[16])||m[15]<m[5]||m[16]<m[15]||m[16]>=m[6])return held();
 const label=layout==='canonical'?'canonical':'recordedLive';
 if(sourceKind==='current-cookie'||sourceKind==='current-cookie-pre-seal'){
  const base=own(targets,label),publicObjects=own(own(own(sources,'public-predecessor'),'recordedLive'),'objects');
  if(!recoveryIsDataArray(base)||!recoveryIsDataArray(publicObjects))return held();
  const optional=label==='recordedLive'?(publicObjects as (string|null)[][]).filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'):[],objects=base as (string|null)[][];
  const before=sourceKind==='current-cookie-pre-seal'?own(own(preSealSources,label),'objects'):base;if(!recoveryIsDataArray(before))return held();
  const variants=optional.length?[objects,[...objects,...optional].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0)]:[objects];
  let matched=0;for(let i=0;i<variants.length;i++){const variant=variants[i],original=i===0?before:[...(before as (string|null)[][]),...optional].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0);if(await recoveryScalarArraySha256(original)===m[11]&&await recoveryScalarArraySha256(variant)===m[12])matched++;}if(matched!==1)return held();restored?.check();
  return Object.freeze(m);
 }
 const originalObjects=own(own(own(sources,sourceKind),label),'objects'),targetObjects=own(targets,label);
 if(!recoveryIsDataArray(originalObjects)||!recoveryIsDataArray(targetObjects))return held();
 const oldDigest=await recoveryScalarArraySha256(originalObjects);
 if(oldDigest!==m[11])return held();
 // Public legacy Native installation retains ONLY its exact original source-owned _cf_KV companion.
 const completeTarget=sourceKind==='public-predecessor'?[...(targetObjects as (string|null)[][]),...(originalObjects as (string|null)[][]).filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV')].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0):targetObjects;
 const nextDigest=await recoveryScalarArraySha256(completeTarget);
 if(nextDigest!==m[12])return held();
 return Object.freeze(m);
}
