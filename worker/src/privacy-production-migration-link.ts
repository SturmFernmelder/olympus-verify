/** Original close/profile lineage, separate from provider/version drainage and the distinct opener. */
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {originalPrivateControlCutCustody,type OriginalPrivateControlCut} from './privacy-production-control-origin';
import {assertOwnedWholeNativeMigrationObservation,type OwnedWholeNativeMigrationObservation} from './privacy-cookie-profile-migration';
import {ADMISSION_COOKIE_MIGRATION_SOURCES_JSON,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON} from './privacy-write-admission-catalogue';
import {recoveryScalarArrayJSON,recoveryScalarArraySha256,recoveryParseDataJSON,recoveryIsDataArray,assertOriginalRecoveryDataIntrinsics} from './privacy-recovery-data-json';

declare const originalMigrationLinkBrand:unique symbol;
export type OriginalClosedProfileMigrationLink=Readonly<{[originalMigrationLinkBrand]:true}>;
type Link={cut:OriginalPrivateControlCut;observation:OwnedWholeNativeMigrationObservation;tuple:string;check:()=>void};
const links=new WeakMap<OriginalClosedProfileMigrationLink,Link>();
const held=():never=>{throw new RecoveryFloorHeld();};
const profiles=recoveryParseDataJSON(ADMISSION_COOKIE_MIGRATION_SOURCES_JSON) as Record<'pre-marker'|'marker'|'public-predecessor',Record<'canonical'|'recordedLive',{objects:(string|null)[][]}>>;
const preSealProfiles=recoveryParseDataJSON(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON) as Record<'canonical'|'recordedLive',{objects:(string|null)[][]}>;
const targets=recoveryParseDataJSON(ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON) as Record<'canonical'|'recordedLive',(string|null)[][]>;
const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x);
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=253402300799;
async function sha(value:unknown,check:()=>void):Promise<string>{check();assertOriginalRecoveryDataIntrinsics();const result=await recoveryScalarArraySha256(value);assertOriginalRecoveryDataIntrinsics();check();return result;}
function tuple(raw:string,length:number):unknown[]{let v:unknown;try{v=recoveryParseDataJSON(raw);}catch{return held();}if(!recoveryIsDataArray(v)||v.length!==length||recoveryScalarArrayJSON(v)!==raw)return held();return v;}
/** Only authentic cut and migration observation capabilities enter; copied JSON or a late Floor cannot substitute. */
export async function captureOriginalClosedProfileMigrationLink(cut:OriginalPrivateControlCut,observation:OwnedWholeNativeMigrationObservation):Promise<OriginalClosedProfileMigrationLink>{
 const initial=originalPrivateControlCutCustody(cut);assertOwnedWholeNativeMigrationObservation(observation);
 const check=()=>{assertOriginalRecoveryDataIntrinsics();assertOwnedWholeNativeMigrationObservation(observation);const actual=originalPrivateControlCutCustody(cut);if(actual.floor!==initial.floor||actual.gate!==initial.gate||actual.nativeCut!==initial.nativeCut||actual.suppressionControl!==initial.suppressionControl||actual.allWriterCut!==initial.allWriterCut)return held();};
 check();const gate=tuple(initial.gate,11),floor=tuple(initial.floor,12);
 if(gate[2]!==initial.floor||gate[3]!=='closing_held'||!hex(gate[4],32)||!hex(gate[9],32)||!integer(gate[10])||!hex(floor[7],32))return held();
 const sourceKind=observation.sourceKind,layout=observation.layout;
 if(!['pre-marker','marker','public-predecessor','current-cookie','current-cookie-pre-seal'].includes(sourceKind)||!['canonical','recorded-live-20261010'].includes(layout)||observation.mode!=='closed'||observation.providerDrainQualified!==false||observation.readyToReopen!==false)return held();
 if(!hex(observation.operationId,32)||!hex(observation.nextEpoch,32)||observation.nextEpoch!==gate[9]||!integer(observation.createdAt)||observation.expiresAt!==observation.createdAt+300||observation.createdAt<gate[10]||!integer(observation.migrationFinishedAt)||observation.migrationFinishedAt<observation.createdAt||observation.migrationFinishedAt>=observation.expiresAt||!integer(observation.readbackObservedAt)||observation.readbackObservedAt<observation.migrationFinishedAt||observation.readbackObservedAt>=observation.expiresAt)return held();
 // Public legacy7 has no closed/write-epoch receipt. Preserve NULL explicitly in the versioned wire.
 if(sourceKind==='public-predecessor'){
  if(layout!=='recorded-live-20261010'||observation.originalEpoch!==null)return held();
 }else if(!hex(observation.originalEpoch,32)||observation.originalEpoch!==floor[7])return held();
 for(const d of [observation.originalProfileDigest64,observation.targetProfileDigest64,observation.nativeResultDigest64,observation.readbackDigest64])if(!hex(d,64))return held();
 if(sourceKind==='current-cookie'||sourceKind==='current-cookie-pre-seal'){
  // Exact old and target profiles retain the SAME optional original companion variant.
  const key=layout==='canonical'?'canonical':'recordedLive',base=targets[key],optional=key==='recordedLive'?profiles['public-predecessor'].recordedLive.objects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'):[];
  const before=sourceKind==='current-cookie-pre-seal'?preSealProfiles[key].objects:base;
  const variants=optional.length?[base,[...base,...optional].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0)]:[base];
  let matched=0;for(let i=0;i<variants.length;i++){const original=i===0?before:[...before,...optional].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0);const oldDigest=await sha(original,check),nextDigest=await sha(variants[i],check);check();if(oldDigest===observation.originalProfileDigest64&&nextDigest===observation.targetProfileDigest64)matched++;}if(matched!==1)return held();
 }else{
  const expected=profiles[sourceKind][layout==='canonical'?'canonical':'recordedLive'];if(!expected)return held();
  // This digest is the exact immutable source profile which the same Native capture already proved.
  const expectedOriginal=await sha(expected.objects,check);check();if(expectedOriginal!==observation.originalProfileDigest64)return held();
 }
 const raw=recoveryScalarArrayJSON(['closed-profile-migration-v2',initial.floor,initial.gate,gate[4],observation.operationId,observation.createdAt,observation.expiresAt,sourceKind,observation.originalEpoch,observation.nextEpoch,layout,observation.originalProfileDigest64,observation.targetProfileDigest64,observation.nativeResultDigest64,observation.readbackDigest64,observation.migrationFinishedAt,observation.readbackObservedAt]);
 check();const handle=Object.freeze({}) as OriginalClosedProfileMigrationLink;links.set(handle,{cut,observation,tuple:raw,check});return handle;
}
export function assertOriginalClosedProfileMigrationLink(link:OriginalClosedProfileMigrationLink):void{const saved=links.get(link);if(!saved)return held();saved.check();}
export function originalClosedProfileMigrationLinkTuple(link:OriginalClosedProfileMigrationLink):string{assertOriginalClosedProfileMigrationLink(link);return links.get(link)!.tuple;}
